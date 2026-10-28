use crate::db::redis::manager::value_to_i64;
use crate::AppState;
use chrono::Utc;
use futures_util::StreamExt;
use tauri::{AppHandle, Emitter, State};
use tokio::sync::oneshot;

#[tauri::command]
pub async fn redis_publish(
    state: State<'_, AppState>,
    id: String,
    channel: String,
    message: String,
) -> Result<i64, String> {
    let rc = state.redis.get(&id).await?;
    let mut c = redis::cmd("PUBLISH");
    c.arg(&channel).arg(&message);
    let val = rc.exec_cmd(&c).await?;
    Ok(value_to_i64(&val).unwrap_or(0))
}

#[tauri::command]
pub async fn redis_subscribe(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
    channel: String,
) -> Result<(), String> {
    let rc = state.redis.get(&id).await?;
    {
        let subs = rc.pubsubs.lock().await;
        if subs.contains_key(&channel) {
            return Ok(());
        }
    }
    let cli = rc
        .single_client
        .as_ref()
        .ok_or_else(|| "当前连接模式不支持独立 PubSub 通道".to_string())?
        .clone();
    let mut pubsub = cli
        .get_async_pubsub()
        .await
        .map_err(|e| format!("开启 PubSub 失败: {}", e))?;
    pubsub
        .subscribe(&channel)
        .await
        .map_err(|e| format!("订阅频道失败: {}", e))?;

    let (tx, mut rx) = oneshot::channel::<()>();
    {
        let mut subs = rc.pubsubs.lock().await;
        subs.insert(channel.clone(), tx);
    }

    let event_name = format!("redis:pubsub:{}", id);
    tokio::spawn(async move {
        let mut stream = pubsub.into_on_message();
        loop {
            tokio::select! {
                _ = &mut rx => break,
                maybe_msg = stream.next() => {
                    match maybe_msg {
                        Some(msg) => {
                            let ch = msg.get_channel_name().to_string();
                            let pat: String = msg.get_pattern().unwrap_or_default();
                            let payload: String = msg.get_payload().unwrap_or_default();
                            let _ = app.emit(&event_name, serde_json::json!({
                                "channel": ch,
                                "pattern": pat,
                                "payload": payload,
                                "ts": Utc::now().timestamp_millis(),
                            }));
                        }
                        None => break,
                    }
                }
            }
        }
    });

    Ok(())
}

#[tauri::command]
pub async fn redis_psubscribe(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
    pattern: String,
) -> Result<(), String> {
    let rc = state.redis.get(&id).await?;
    let sub_key = format!("~{}", pattern);
    {
        let subs = rc.pubsubs.lock().await;
        if subs.contains_key(&sub_key) {
            return Ok(());
        }
    }
    let cli = rc
        .single_client
        .as_ref()
        .ok_or_else(|| "当前连接模式不支持独立 PubSub 通道".to_string())?
        .clone();
    let mut pubsub = cli
        .get_async_pubsub()
        .await
        .map_err(|e| format!("开启 PSubscribe 失败: {}", e))?;
    pubsub
        .psubscribe(&pattern)
        .await
        .map_err(|e| format!("模式订阅失败: {}", e))?;

    let (tx, mut rx) = oneshot::channel::<()>();
    {
        let mut subs = rc.pubsubs.lock().await;
        subs.insert(sub_key, tx);
    }

    let event_name = format!("redis:pubsub:{}", id);
    tokio::spawn(async move {
        let mut stream = pubsub.into_on_message();
        loop {
            tokio::select! {
                _ = &mut rx => break,
                maybe_msg = stream.next() => {
                    match maybe_msg {
                        Some(msg) => {
                            let ch = msg.get_channel_name().to_string();
                            let pat: String = msg.get_pattern().unwrap_or_default();
                            let payload: String = msg.get_payload().unwrap_or_default();
                            let _ = app.emit(&event_name, serde_json::json!({
                                "channel": ch,
                                "pattern": pat,
                                "payload": payload,
                                "ts": Utc::now().timestamp_millis(),
                            }));
                        }
                        None => break,
                    }
                }
            }
        }
    });

    Ok(())
}

#[tauri::command]
pub async fn redis_unsubscribe(
    state: State<'_, AppState>,
    id: String,
    channel: String,
) -> Result<(), String> {
    let rc = state.redis.get(&id).await?;
    let mut subs = rc.pubsubs.lock().await;
    if let Some(tx) = subs.remove(&channel) {
        let _ = tx.send(());
    }
    Ok(())
}

#[tauri::command]
pub async fn redis_subscriptions(
    state: State<'_, AppState>,
    id: String,
) -> Result<Vec<String>, String> {
    let rc = state.redis.get(&id).await?;
    let subs = rc.pubsubs.lock().await;
    Ok(subs.keys().cloned().collect())
}

#[tauri::command]
pub async fn redis_keyspace_notify(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
    db: i64,
    event: String,
) -> Result<(), String> {
    let rc = state.redis.get(&id).await?;
    {
        let mut ks = rc.kssub.lock().await;
        if let Some(old_tx) = ks.take() {
            let _ = old_tx.send(());
        }
        if event.trim().is_empty() || event == "off" {
            return Ok(());
        }
    }

    let mut cfg_cmd = redis::cmd("CONFIG");
    cfg_cmd.arg("SET").arg("notify-keyspace-events").arg("KEA");
    let _ = rc.exec_cmd(&cfg_cmd).await;

    if let Some(cli) = rc.single_client.as_ref().cloned() {
        if let Ok(mut pubsub) = cli.get_async_pubsub().await {
            let pattern = if db >= 0 {
                format!("__keyevent@{}__:{}", db, if event.is_empty() { "*" } else { &event })
            } else {
                format!("__keyevent@*__:{}", if event.is_empty() { "*" } else { &event })
            };
            if pubsub.psubscribe(&pattern).await.is_ok() {
                let (tx, mut rx) = oneshot::channel::<()>();
                {
                    let mut ks = rc.kssub.lock().await;
                    *ks = Some(tx);
                }
                let event_name = format!("redis:keyspace:{}", id);
                tokio::spawn(async move {
                    let mut stream = pubsub.into_on_message();
                    loop {
                        tokio::select! {
                            _ = &mut rx => break,
                            maybe_msg = stream.next() => {
                                match maybe_msg {
                                    Some(msg) => {
                                        let ch = msg.get_channel_name().to_string();
                                        let key_name: String = msg.get_payload().unwrap_or_default();
                                        let ev = ch.split(':').nth(1).unwrap_or("").to_string();
                                        let _ = app.emit(&event_name, serde_json::json!({
                                            "db": db,
                                            "key": key_name,
                                            "event": ev,
                                            "ts": Utc::now().timestamp_millis(),
                                        }));
                                    }
                                    None => break,
                                }
                            }
                        }
                    }
                });
            }
        }
    }
    Ok(())
}

