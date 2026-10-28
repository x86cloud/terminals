use crate::core::ServerConfig;
use crate::db::redis::manager::{
    connect_redis_entry, format_redis_result, pairs_to_map, parse_cmd_line, split_lines,
    value_to_i64, value_to_string, zset_to_pairs,
};
use crate::db::redis::types::{RedisKeyItem, RedisKeysResult, RedisValue};
use crate::storage;
use crate::AppState;
use std::time::Instant;
use tauri::State;

#[tauri::command]
pub async fn redis_connect(state: State<'_, AppState>, id: String) -> Result<bool, String> {
    let cfg = state
        .store
        .get(&id)
        .ok_or_else(|| "服务器配置不存在".to_string())?;
    storage::log_info(format!(
        "正在发起 Redis 连接: ID={}, 名称={}, 主机={}:{}",
        cfg.id, cfg.name, cfg.host, cfg.port
    ));
    state.redis.open(id.clone(), cfg.clone()).await?;
    storage::log_info(format!(
        "Redis 连接成功: ID={}, 主机={}:{}",
        id, cfg.host, cfg.port
    ));
    Ok(true)
}

#[tauri::command]
pub async fn redis_test_connection(cfg: ServerConfig) -> Result<serde_json::Value, String> {
    let start = Instant::now();
    let entry = connect_redis_entry("test".to_string(), cfg).await?;
    let latency = start.elapsed().as_millis() as i64;
    entry.close().await;
    Ok(serde_json::json!({
        "connected": true,
        "pingMs": latency,
    }))
}

#[tauri::command]
pub async fn redis_close(state: State<'_, AppState>, id: String) -> Result<(), String> {
    storage::log_info(format!("关闭 Redis 连接: ID={}", id));
    state.redis.close(&id).await;
    Ok(())
}

#[tauri::command]
pub async fn redis_select_db(state: State<'_, AppState>, id: String, db: i64) -> Result<(), String> {
    let rc = state.redis.get(&id).await?;
    if rc.mode == "cluster" {
        return Err("集群模式下不支持 SELECT".to_string());
    }
    let mut c = redis::cmd("SELECT");
    c.arg(db);
    rc.exec_cmd(&c).await?;
    Ok(())
}

#[tauri::command]
pub async fn redis_keys(
    state: State<'_, AppState>,
    id: String,
    pattern: String,
    cursor: String,
) -> Result<RedisKeysResult, String> {
    let rc = state.redis.get(&id).await?;
    let pat = if pattern.is_empty() {
        "*".to_string()
    } else {
        pattern
    };
    let cur_u64 = cursor.trim().parse::<u64>().unwrap_or(0);

    let mut scan_cmd = redis::cmd("SCAN");
    scan_cmd
        .arg(cur_u64)
        .arg("MATCH")
        .arg(&pat)
        .arg("COUNT")
        .arg(100);
    let scan_val = rc.exec_cmd(&scan_cmd).await?;

    let mut next_cursor = 0u64;
    let mut keys = Vec::new();
    if let redis::Value::Array(items) = scan_val {
        if items.len() == 2 {
            next_cursor = value_to_string(&items[0]).parse::<u64>().unwrap_or(0);
            if let redis::Value::Array(k_arr) = &items[1] {
                for k in k_arr {
                    keys.push(value_to_string(k));
                }
            }
        }
    }

    let mut result_items = Vec::with_capacity(keys.len());
    if !keys.is_empty() {
        let mut pipe = redis::pipe();
        for k in &keys {
            pipe.cmd("TYPE").arg(k);
            pipe.cmd("TTL").arg(k);
        }
        let pipe_res = rc.exec_pipe(&pipe).await.unwrap_or(redis::Value::Nil);
        let pipe_arr = match pipe_res {
            redis::Value::Array(a) => a,
            _ => Vec::new(),
        };
        for (i, k) in keys.into_iter().enumerate() {
            let kt = pipe_arr
                .get(i * 2)
                .map(value_to_string)
                .unwrap_or_default();
            let raw_ttl = pipe_arr
                .get(i * 2 + 1)
                .and_then(value_to_i64)
                .unwrap_or(-1);
            let ttl = if raw_ttl > 0 {
                raw_ttl
            } else if raw_ttl == -2 {
                -2
            } else {
                -1
            };
            result_items.push(RedisKeyItem {
                key: k,
                key_type: kt,
                ttl,
            });
        }
    }

    Ok(RedisKeysResult {
        keys: result_items,
        cursor: next_cursor,
    })
}

#[tauri::command]
pub async fn redis_get(
    state: State<'_, AppState>,
    id: String,
    key: String,
) -> Result<RedisValue, String> {
    let rc = state.redis.get(&id).await?;
    let mut type_cmd = redis::cmd("TYPE");
    type_cmd.arg(&key);
    let kt = value_to_string(&rc.exec_cmd(&type_cmd).await?);

    let mut ttl_cmd = redis::cmd("TTL");
    ttl_cmd.arg(&key);
    let raw_ttl = rc
        .exec_cmd(&ttl_cmd)
        .await
        .ok()
        .and_then(|v| value_to_i64(&v))
        .unwrap_or(-1);
    let ttl = if raw_ttl > 0 {
        raw_ttl
    } else if raw_ttl == -2 {
        -2
    } else {
        -1
    };

    let mut val = RedisValue {
        key: key.clone(),
        key_type: kt.clone(),
        ttl,
        value: String::new(),
        size: 0,
        raw_json: None,
    };

    match kt.as_str() {
        "string" => {
            let mut c = redis::cmd("GET");
            c.arg(&key);
            let s = value_to_string(&rc.exec_cmd(&c).await?);
            val.size = s.len() as i64;
            if rc.ser == "json" {
                if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&s) {
                    val.raw_json = Some(parsed);
                }
            }
            val.value = s;
        }
        "hash" => {
            let mut c = redis::cmd("HGETALL");
            c.arg(&key);
            let res = rc.exec_cmd(&c).await?;
            let mut map = serde_json::Map::new();
            let mut lines = Vec::new();
            match res {
                redis::Value::Array(arr) => {
                    let mut i = 0;
                    while i + 1 < arr.len() {
                        let fk = value_to_string(&arr[i]);
                        let fv = value_to_string(&arr[i + 1]);
                        lines.push(fk.clone());
                        lines.push(fv.clone());
                        map.insert(fk, serde_json::Value::String(fv));
                        i += 2;
                    }
                }
                redis::Value::Map(pairs) => {
                    for (fk_val, fv_val) in pairs {
                        let fk = value_to_string(&fk_val);
                        let fv = value_to_string(&fv_val);
                        lines.push(fk.clone());
                        lines.push(fv.clone());
                        map.insert(fk, serde_json::Value::String(fv));
                    }
                }
                _ => {}
            }
            val.size = map.len() as i64;
            val.value = lines.join("\n");
            val.raw_json = Some(serde_json::Value::Object(map));
        }
        "list" => {
            let mut c = redis::cmd("LRANGE");
            c.arg(&key).arg(0).arg(-1);
            let res = rc.exec_cmd(&c).await?;
            let mut list = Vec::new();
            if let redis::Value::Array(arr) = res {
                for item in arr {
                    list.push(value_to_string(&item));
                }
            }
            val.size = list.len() as i64;
            val.value = list.join("\n");
            val.raw_json = Some(serde_json::json!(list));
        }
        "set" => {
            let mut c = redis::cmd("SMEMBERS");
            c.arg(&key);
            let res = rc.exec_cmd(&c).await?;
            let mut members = Vec::new();
            match res {
                redis::Value::Array(arr) | redis::Value::Set(arr) => {
                    for item in arr {
                        members.push(value_to_string(&item));
                    }
                }
                _ => {}
            }
            val.size = members.len() as i64;
            val.value = members.join("\n");
            val.raw_json = Some(serde_json::json!(members));
        }
        "zset" => {
            let mut c = redis::cmd("ZRANGE");
            c.arg(&key).arg(0).arg(-1).arg("WITHSCORES");
            let res = rc.exec_cmd(&c).await?;
            let mut lines = Vec::new();
            let mut z_list = Vec::new();
            if let redis::Value::Array(arr) = res {
                let mut i = 0;
                while i + 1 < arr.len() {
                    let member = value_to_string(&arr[i]);
                    let score_str = value_to_string(&arr[i + 1]);
                    let score = score_str.parse::<f64>().unwrap_or(0.0);
                    lines.push(member.clone());
                    lines.push(score_str);
                    z_list.push(serde_json::json!({
                        "member": member,
                        "score": score,
                    }));
                    i += 2;
                }
            }
            val.size = z_list.len() as i64;
            val.value = lines.join("\n");
            val.raw_json = Some(serde_json::Value::Array(z_list));
        }
        "stream" => {
            let mut c = redis::cmd("XREVRANGE");
            c.arg(&key).arg("+").arg("-").arg("COUNT").arg(100);
            let res = rc.exec_cmd(&c).await?;
            let mut lines = Vec::new();
            let mut stream_list = Vec::new();
            if let redis::Value::Array(entries) = res {
                for entry in entries {
                    if let redis::Value::Array(parts) = entry {
                        if parts.len() >= 2 {
                            let entry_id = value_to_string(&parts[0]);
                            let mut field_parts = Vec::new();
                            let mut values_map = serde_json::Map::new();
                            if let redis::Value::Array(kvs) = &parts[1] {
                                let mut j = 0;
                                while j + 1 < kvs.len() {
                                    let fk = value_to_string(&kvs[j]);
                                    let fv = value_to_string(&kvs[j + 1]);
                                    field_parts.push(format!("{}={}", fk, fv));
                                    values_map.insert(fk, serde_json::Value::String(fv));
                                    j += 2;
                                }
                            }
                            lines.push(format!("{}\n{}", entry_id, field_parts.join(" ")));
                            stream_list.push(serde_json::json!({
                                "id": entry_id,
                                "values": values_map,
                            }));
                        }
                    }
                }
            }
            val.size = stream_list.len() as i64;
            val.value = lines.join("\n---\n");
            val.raw_json = Some(serde_json::Value::Array(stream_list));
        }
        "none" => {
            val.value = String::new();
            val.size = 0;
        }
        _ => {
            val.value = format!("(暂不支持该数据类型的可视化编辑: {})", kt);
            val.size = 0;
        }
    }

    Ok(val)
}

#[tauri::command]
pub async fn redis_set(
    state: State<'_, AppState>,
    id: String,
    key: String,
    typ: String,
    val: String,
    ttl: i64,
) -> Result<(), String> {
    let rc = state.redis.get(&id).await?;
    match typ.as_str() {
        "string" => {
            let mut c = redis::cmd("SET");
            c.arg(&key).arg(&val);
            if ttl > 0 {
                c.arg("EX").arg(ttl);
            }
            rc.exec_cmd(&c).await?;
            return Ok(());
        }
        "list" => {
            let mut del = redis::cmd("DEL");
            del.arg(&key);
            rc.exec_cmd(&del).await?;
            let items = split_lines(&val);
            if !items.is_empty() {
                let mut rp = redis::cmd("RPUSH");
                rp.arg(&key);
                for item in items {
                    rp.arg(item);
                }
                rc.exec_cmd(&rp).await?;
            }
        }
        "set" => {
            let mut del = redis::cmd("DEL");
            del.arg(&key);
            rc.exec_cmd(&del).await?;
            let items = split_lines(&val);
            if !items.is_empty() {
                let mut sa = redis::cmd("SADD");
                sa.arg(&key);
                for item in items {
                    sa.arg(item);
                }
                rc.exec_cmd(&sa).await?;
            }
        }
        "hash" => {
            let mut del = redis::cmd("DEL");
            del.arg(&key);
            rc.exec_cmd(&del).await?;
            let pairs = pairs_to_map(&val);
            if !pairs.is_empty() {
                let mut hs = redis::cmd("HSET");
                hs.arg(&key);
                for (fk, fv) in pairs {
                    hs.arg(fk).arg(fv);
                }
                rc.exec_cmd(&hs).await?;
            }
        }
        "zset" => {
            let mut del = redis::cmd("DEL");
            del.arg(&key);
            rc.exec_cmd(&del).await?;
            let pairs = zset_to_pairs(&val);
            if !pairs.is_empty() {
                let mut za = redis::cmd("ZADD");
                za.arg(&key);
                for (member, score) in pairs {
                    za.arg(score).arg(member);
                }
                rc.exec_cmd(&za).await?;
            }
        }
        "stream" => {
            for line in split_lines(&val) {
                let trimmed = line.trim();
                if trimmed.is_empty() || trimmed == "---" {
                    continue;
                }
                let mut fields = Vec::new();
                for part in trimmed.split_whitespace() {
                    if let Some((fk, fv)) = part.split_once('=') {
                        fields.push((fk.to_string(), fv.to_string()));
                    }
                }
                if !fields.is_empty() {
                    let mut xa = redis::cmd("XADD");
                    xa.arg(&key).arg("*");
                    for (fk, fv) in fields {
                        xa.arg(fk).arg(fv);
                    }
                    let _ = rc.exec_cmd(&xa).await;
                }
            }
        }
        _ => return Err(format!("不支持的 keyType: {}", typ)),
    }

    if ttl > 0 {
        let mut exp = redis::cmd("EXPIRE");
        exp.arg(&key).arg(ttl);
        let _ = rc.exec_cmd(&exp).await;
    }
    Ok(())
}

#[tauri::command]
pub async fn redis_delete(
    state: State<'_, AppState>,
    id: String,
    key: String,
) -> Result<(), String> {
    let rc = state.redis.get(&id).await?;
    let mut c = redis::cmd("DEL");
    c.arg(&key);
    rc.exec_cmd(&c).await?;
    Ok(())
}

#[tauri::command]
pub async fn redis_expire(
    state: State<'_, AppState>,
    id: String,
    key: String,
    ttl: i64,
) -> Result<(), String> {
    let rc = state.redis.get(&id).await?;
    if ttl <= 0 {
        let mut c = redis::cmd("PERSIST");
        c.arg(&key);
        rc.exec_cmd(&c).await?;
    } else {
        let mut c = redis::cmd("EXPIRE");
        c.arg(&key).arg(ttl);
        rc.exec_cmd(&c).await?;
    }
    Ok(())
}

#[tauri::command]
pub async fn redis_rename_key(
    state: State<'_, AppState>,
    id: String,
    old_key: String,
    new_key: String,
) -> Result<(), String> {
    let rc = state.redis.get(&id).await?;
    let mut c = redis::cmd("RENAME");
    c.arg(&old_key).arg(&new_key);
    rc.exec_cmd(&c).await?;
    Ok(())
}

#[tauri::command]
pub async fn redis_raw(
    state: State<'_, AppState>,
    id: String,
    cmd: String,
) -> Result<serde_json::Value, String> {
    let rc = state.redis.get(&id).await?;
    let c = parse_cmd_line(&cmd).ok_or_else(|| "命令不能为空".to_string())?;
    let val = rc.exec_cmd(&c).await?;
    Ok(serde_json::json!({
        "result": format_redis_result(&val),
    }))
}

#[tauri::command]
pub async fn redis_db_size(state: State<'_, AppState>, id: String) -> Result<i64, String> {
    let rc = state.redis.get(&id).await?;
    let c = redis::cmd("DBSIZE");
    let val = rc.exec_cmd(&c).await?;
    Ok(value_to_i64(&val).unwrap_or(0))
}

#[tauri::command]
pub async fn redis_mode_info(
    state: State<'_, AppState>,
    id: String,
) -> Result<serde_json::Value, String> {
    let rc = state.redis.get(&id).await?;
    Ok(serde_json::json!({
        "mode": rc.mode,
        "serialization": rc.ser,
        "breaker": rc.breaker.state(),
    }))
}

#[tauri::command]
pub async fn redis_string_append(
    state: State<'_, AppState>,
    id: String,
    key: String,
    value: String,
) -> Result<i64, String> {
    let rc = state.redis.get(&id).await?;
    let mut c = redis::cmd("APPEND");
    c.arg(&key).arg(&value);
    let val = rc.exec_cmd(&c).await?;
    Ok(value_to_i64(&val).unwrap_or(0))
}

#[tauri::command]
pub async fn redis_hash_field_set(
    state: State<'_, AppState>,
    id: String,
    key: String,
    field: String,
    value: String,
) -> Result<(), String> {
    let rc = state.redis.get(&id).await?;
    let mut c = redis::cmd("HSET");
    c.arg(&key).arg(&field).arg(&value);
    rc.exec_cmd(&c).await?;
    Ok(())
}

#[tauri::command]
pub async fn redis_hash_field_get(
    state: State<'_, AppState>,
    id: String,
    key: String,
    field: String,
) -> Result<String, String> {
    let rc = state.redis.get(&id).await?;
    let mut c = redis::cmd("HGET");
    c.arg(&key).arg(&field);
    let val = rc.exec_cmd(&c).await?;
    Ok(value_to_string(&val))
}

#[tauri::command]
pub async fn redis_hash_field_del(
    state: State<'_, AppState>,
    id: String,
    key: String,
    fields: Vec<String>,
) -> Result<i64, String> {
    let rc = state.redis.get(&id).await?;
    if fields.is_empty() {
        return Ok(0);
    }
    let mut c = redis::cmd("HDEL");
    c.arg(&key);
    for f in fields {
        c.arg(f);
    }
    let val = rc.exec_cmd(&c).await?;
    Ok(value_to_i64(&val).unwrap_or(0))
}

#[tauri::command]
pub async fn redis_list_push(
    state: State<'_, AppState>,
    id: String,
    key: String,
    value: String,
    left: bool,
) -> Result<i64, String> {
    let rc = state.redis.get(&id).await?;
    let mut c = redis::cmd(if left { "LPUSH" } else { "RPUSH" });
    c.arg(&key).arg(&value);
    let val = rc.exec_cmd(&c).await?;
    Ok(value_to_i64(&val).unwrap_or(0))
}

#[tauri::command]
pub async fn redis_list_pop(
    state: State<'_, AppState>,
    id: String,
    key: String,
    left: bool,
) -> Result<String, String> {
    let rc = state.redis.get(&id).await?;
    let mut c = redis::cmd(if left { "LPOP" } else { "RPOP" });
    c.arg(&key);
    let val = rc.exec_cmd(&c).await?;
    Ok(value_to_string(&val))
}

#[tauri::command]
pub async fn redis_set_add(
    state: State<'_, AppState>,
    id: String,
    key: String,
    members: Vec<String>,
) -> Result<i64, String> {
    let rc = state.redis.get(&id).await?;
    if members.is_empty() {
        return Ok(0);
    }
    let mut c = redis::cmd("SADD");
    c.arg(&key);
    for m in members {
        c.arg(m);
    }
    let val = rc.exec_cmd(&c).await?;
    Ok(value_to_i64(&val).unwrap_or(0))
}

#[tauri::command]
pub async fn redis_set_rem(
    state: State<'_, AppState>,
    id: String,
    key: String,
    members: Vec<String>,
) -> Result<i64, String> {
    let rc = state.redis.get(&id).await?;
    if members.is_empty() {
        return Ok(0);
    }
    let mut c = redis::cmd("SREM");
    c.arg(&key);
    for m in members {
        c.arg(m);
    }
    let val = rc.exec_cmd(&c).await?;
    Ok(value_to_i64(&val).unwrap_or(0))
}

#[tauri::command]
pub async fn redis_zset_add(
    state: State<'_, AppState>,
    id: String,
    key: String,
    member: String,
    score: f64,
) -> Result<i64, String> {
    let rc = state.redis.get(&id).await?;
    let mut c = redis::cmd("ZADD");
    c.arg(&key).arg(score).arg(&member);
    let val = rc.exec_cmd(&c).await?;
    Ok(value_to_i64(&val).unwrap_or(0))
}

#[tauri::command]
pub async fn redis_zset_rem(
    state: State<'_, AppState>,
    id: String,
    key: String,
    members: Vec<String>,
) -> Result<i64, String> {
    let rc = state.redis.get(&id).await?;
    if members.is_empty() {
        return Ok(0);
    }
    let mut c = redis::cmd("ZREM");
    c.arg(&key);
    for m in members {
        c.arg(m);
    }
    let val = rc.exec_cmd(&c).await?;
    Ok(value_to_i64(&val).unwrap_or(0))
}

