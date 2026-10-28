use crate::db::redis::manager::{format_redis_result, parse_cmd_line, value_to_i64, value_to_string};
use crate::db::redis::types::{
    RedisCmdResult, RedisMonitorInfo, RedisPipelineResult, RedisQueueItem, RedisSlowLogEntry,
    RedisTransactionResult,
};
use crate::AppState;
use tauri::State;

#[tauri::command]
pub async fn redis_pipeline(
    state: State<'_, AppState>,
    id: String,
    commands: Vec<String>,
) -> Result<RedisPipelineResult, String> {
    let rc = state.redis.get(&id).await?;
    let mut pipe = redis::pipe();
    pipe.ignore();
    let mut valid_cmds = Vec::new();
    for line in &commands {
        if let Some(c) = parse_cmd_line(line) {
            valid_cmds.push(c);
        }
    }
    let mut pipe_exec = redis::pipe();
    for c in &valid_cmds {
        pipe_exec.add_command(c.clone());
    }

    let mut results = Vec::with_capacity(valid_cmds.len());
    match rc.exec_pipe(&pipe_exec).await {
        Ok(redis::Value::Array(arr)) => {
            for v in arr {
                match v {
                    redis::Value::ServerError(e) => results.push(RedisCmdResult {
                        result: String::new(),
                        error: format!("{:?}", e),
                    }),
                    other => results.push(RedisCmdResult {
                        result: format_redis_result(&other),
                        error: String::new(),
                    }),
                }
            }
            Ok(RedisPipelineResult {
                results,
                error: String::new(),
            })
        }
        Ok(other) => {
            results.push(RedisCmdResult {
                result: format_redis_result(&other),
                error: String::new(),
            });
            Ok(RedisPipelineResult {
                results,
                error: String::new(),
            })
        }
        Err(e) => Ok(RedisPipelineResult { results, error: e }),
    }
}

#[tauri::command]
pub async fn redis_transaction(
    state: State<'_, AppState>,
    id: String,
    watch: Vec<String>,
    commands: Vec<String>,
) -> Result<RedisTransactionResult, String> {
    let rc = state.redis.get(&id).await?;
    if !watch.is_empty() {
        let mut w_cmd = redis::cmd("WATCH");
        for k in &watch {
            if !k.trim().is_empty() {
                w_cmd.arg(k.trim());
            }
        }
        let _ = rc.exec_cmd(&w_cmd).await;
    }

    let mut pipe = redis::pipe();
    pipe.atomic();
    for line in &commands {
        if let Some(c) = parse_cmd_line(line) {
            pipe.add_command(c);
        }
    }

    let mut results = Vec::new();
    match rc.exec_pipe(&pipe).await {
        Ok(redis::Value::Nil) => Ok(RedisTransactionResult {
            results,
            aborted: true,
            error: "transaction aborted".to_string(),
        }),
        Ok(redis::Value::Array(arr)) => {
            for v in arr {
                match v {
                    redis::Value::ServerError(e) => results.push(RedisCmdResult {
                        result: String::new(),
                        error: format!("{:?}", e),
                    }),
                    other => results.push(RedisCmdResult {
                        result: format_redis_result(&other),
                        error: String::new(),
                    }),
                }
            }
            Ok(RedisTransactionResult {
                results,
                aborted: false,
                error: String::new(),
            })
        }
        Ok(other) => {
            results.push(RedisCmdResult {
                result: format_redis_result(&other),
                error: String::new(),
            });
            Ok(RedisTransactionResult {
                results,
                aborted: false,
                error: String::new(),
            })
        }
        Err(e) => Ok(RedisTransactionResult {
            results,
            aborted: false,
            error: e,
        }),
    }
}

#[tauri::command]
pub async fn redis_queue_enqueue(
    state: State<'_, AppState>,
    id: String,
    queue: String,
    payload: String,
    mode: String,
) -> Result<String, String> {
    let _ = mode;
    let rc = state.redis.get(&id).await?;
    let mut c = redis::cmd("RPUSH");
    c.arg(&queue).arg(&payload);
    rc.exec_cmd(&c).await?;
    Ok("ok".to_string())
}

#[tauri::command]
pub async fn redis_queue_dequeue(
    state: State<'_, AppState>,
    id: String,
    queue: String,
    mode: String,
    timeout: i64,
) -> Result<Option<RedisQueueItem>, String> {
    let _ = (mode, timeout);
    let rc = state.redis.get(&id).await?;
    let mut c = redis::cmd("LPOP");
    c.arg(&queue);
    let val = rc.exec_cmd(&c).await?;
    if matches!(val, redis::Value::Nil) {
        return Ok(Some(RedisQueueItem {
            id: String::new(),
            payload: serde_json::Value::Null,
            empty: true,
        }));
    }
    Ok(Some(RedisQueueItem {
        id: String::new(),
        payload: serde_json::Value::String(value_to_string(&val)),
        empty: false,
    }))
}

#[tauri::command]
pub async fn redis_queue_length(
    state: State<'_, AppState>,
    id: String,
    queue: String,
    mode: String,
) -> Result<i64, String> {
    let _ = mode;
    let rc = state.redis.get(&id).await?;
    let mut c = redis::cmd("LLEN");
    c.arg(&queue);
    let val = rc.exec_cmd(&c).await?;
    Ok(value_to_i64(&val).unwrap_or(0))
}

#[tauri::command]
pub async fn redis_slow_log(
    state: State<'_, AppState>,
    id: String,
    count: i64,
) -> Result<Vec<RedisSlowLogEntry>, String> {
    let rc = state.redis.get(&id).await?;
    let n = if count <= 0 { 50 } else { count };
    let mut c = redis::cmd("SLOWLOG");
    c.arg("GET").arg(n);
    let val = match rc.exec_cmd(&c).await {
        Ok(v) => v,
        Err(_) => return Ok(Vec::new()),
    };
    let mut entries = Vec::new();
    if let redis::Value::Array(items) = val {
        for item in items {
            if let redis::Value::Array(fields) = item {
                if fields.len() >= 4 {
                    let entry_id = value_to_i64(&fields[0]).unwrap_or(0);
                    let ts = value_to_i64(&fields[1]).unwrap_or(0);
                    let duration = value_to_i64(&fields[2]).unwrap_or(0);
                    let cmd_str = match &fields[3] {
                        redis::Value::Array(args) => args
                            .iter()
                            .map(value_to_string)
                            .collect::<Vec<_>>()
                            .join(" "),
                        other => value_to_string(other),
                    };
                    let client = fields.get(4).map(value_to_string).unwrap_or_default();
                    entries.push(RedisSlowLogEntry {
                        id: entry_id,
                        timestamp: ts,
                        duration,
                        command: cmd_str,
                        client,
                    });
                }
            }
        }
    }
    Ok(entries)
}

#[tauri::command]
pub async fn redis_info(
    state: State<'_, AppState>,
    id: String,
    section: String,
) -> Result<String, String> {
    let rc = state.redis.get(&id).await?;
    let mut c = redis::cmd("INFO");
    if !section.trim().is_empty() {
        c.arg(section.trim());
    }
    let val = rc.exec_cmd(&c).await?;
    Ok(value_to_string(&val))
}

#[tauri::command]
pub async fn redis_monitor(
    state: State<'_, AppState>,
    id: String,
) -> Result<Option<RedisMonitorInfo>, String> {
    let rc = state.redis.get(&id).await?;
    let mut info = RedisMonitorInfo {
        breaker: rc.breaker.state(),
        hits: 0,
        misses: 0,
        timeouts: 0,
        total_conns: 1,
        idle_conns: 1,
        stale_conns: 0,
        mode: rc.mode.clone(),
        serialization: rc.ser.clone(),
        version: String::new(),
        memory_used: String::new(),
        uptime_days: String::new(),
        connected_clients: String::new(),
    };

    let c = redis::cmd("INFO");
    if let Ok(val) = rc.exec_cmd(&c).await {
        let raw_info = value_to_string(&val);
        for line in raw_info.lines() {
            let line = line.trim();
            if let Some(v) = line.strip_prefix("redis_version:") {
                info.version = v.to_string();
            } else if let Some(v) = line.strip_prefix("used_memory_human:") {
                info.memory_used = v.to_string();
            } else if let Some(v) = line.strip_prefix("uptime_in_days:") {
                info.uptime_days = v.to_string();
            } else if let Some(v) = line.strip_prefix("connected_clients:") {
                info.connected_clients = v.to_string();
            }
        }
    }

    Ok(Some(info))
}

