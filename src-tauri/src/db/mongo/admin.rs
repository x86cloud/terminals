use crate::core::ServerConfig;
use crate::db::mongo::manager::{
    bson_to_json, build_mongo_options, collect_fields, detect_topology, doc_to_json,
    normalize_bson_value, parse_json_array, parse_json_doc, parse_mongo_uri_inner, server_version,
};
use crate::db::mongo::types::{
    MongoCloneCollReq, MongoCreateCollOptions, MongoCreateUserReq, MongoUpdateUserReq,
};
use crate::storage;
use crate::AppState;
use chrono::Utc;
use futures_util::{StreamExt, TryStreamExt};
use mongodb::bson::{doc, Bson, Document};
use mongodb::options::{FullDocumentType, IndexOptions};
use mongodb::{Client, IndexModel};
use std::collections::HashMap;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, State};
use tokio::sync::oneshot;

#[tauri::command]
pub async fn mongo_connect(state: State<'_, AppState>, id: String) -> Result<bool, String> {
    let cfg = state
        .store
        .get(&id)
        .ok_or_else(|| "服务器配置不存在".to_string())?;
    storage::log_info(format!(
        "正在发起 MongoDB 连接: ID={}, 名称={}, 主机={}:{}",
        cfg.id, cfg.name, cfg.host, cfg.port
    ));
    state.mongo.open(id.clone(), cfg.clone()).await?;
    storage::log_info(format!(
        "MongoDB 连接成功: ID={}, 主机={}:{}",
        id, cfg.host, cfg.port
    ));
    Ok(true)
}

#[tauri::command]
pub async fn mongo_close(state: State<'_, AppState>, id: String) -> Result<(), String> {
    storage::log_info(format!("关闭 MongoDB 连接: ID={}", id));
    state.mongo.close(&id).await;
    Ok(())
}

#[tauri::command]
pub async fn mongo_parse_uri(uri: String) -> Result<serde_json::Value, String> {
    let info = parse_mongo_uri_inner(&uri)?;
    serde_json::to_value(info).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn mongo_test_connection(cfg: ServerConfig) -> Result<serde_json::Value, String> {
    let opts = build_mongo_options(&cfg).await?;
    let start = Instant::now();
    let client = Client::with_options(opts).map_err(|e| format!("连接失败: {}", e))?;

    tokio::time::timeout(
        Duration::from_secs(10),
        client.database("admin").run_command(doc! { "ping": 1 }),
    )
    .await
    .map_err(|_| "探活超时".to_string())?
    .map_err(|e| format!("探活失败: {}", e))?;

    let latency_ms = start.elapsed().as_millis() as i64;
    let hello = client
        .database("admin")
        .run_command(doc! { "hello": 1 })
        .await
        .unwrap_or_default();
    let version = server_version(&client).await;

    Ok(serde_json::json!({
        "ok": true,
        "latencyMs": latency_ms,
        "topology": detect_topology(&hello),
        "version": version,
    }))
}

#[tauri::command]
pub async fn mongo_health_check(
    state: State<'_, AppState>,
    id: String,
) -> Result<Option<serde_json::Value>, String> {
    let mc = state.mongo.must_mongo(&id).await?;
    let start = Instant::now();
    let ping_res = mc.client.database("admin").run_command(doc! { "ping": 1 }).await;
    let latency = start.elapsed().as_millis() as i64;
    mc.track(start, ping_res.is_err());

    if let Err(e) = ping_res {
        return Ok(Some(serde_json::json!({
            "ok": false,
            "latencyMs": latency,
            "error": e.to_string(),
        })));
    }

    let mut res = serde_json::Map::new();
    res.insert("ok".to_string(), serde_json::Value::Bool(true));
    res.insert("latencyMs".to_string(), serde_json::json!(latency));

    if let Ok(hello) = mc.client.database("admin").run_command(doc! { "hello": 1 }).await {
        res.insert(
            "topology".to_string(),
            serde_json::Value::String(detect_topology(&hello)),
        );
        if let Some(p) = hello.get("primary") {
            res.insert("primary".to_string(), normalize_bson_value(p));
        }
        if let Some(s) = hello.get("setName") {
            res.insert("setName".to_string(), normalize_bson_value(s));
        }
        if let Some(w) = hello.get("isWritablePrimary") {
            res.insert("isWritablePrimary".to_string(), normalize_bson_value(w));
        }
        if let Ok(hosts) = hello.get_array("hosts") {
            let list: Vec<String> = hosts
                .iter()
                .filter_map(|h| h.as_str().map(|s| s.to_string()))
                .collect();
            res.insert("hosts".to_string(), serde_json::json!(list));
        }
    }
    res.insert(
        "version".to_string(),
        serde_json::Value::String(server_version(&mc.client).await),
    );

    Ok(Some(serde_json::Value::Object(res)))
}

#[tauri::command]
pub async fn mongo_server_status(
    state: State<'_, AppState>,
    id: String,
) -> Result<Option<serde_json::Value>, String> {
    let mc = state.mongo.must_mongo(&id).await?;
    let start = Instant::now();
    let mut res = mc
        .client
        .database("admin")
        .run_command(doc! { "serverStatus": 1 })
        .await;
    if res.is_err() && !mc.cfg.database.is_empty() && mc.cfg.database != "admin" {
        res = mc
            .client
            .database(&mc.cfg.database)
            .run_command(doc! { "serverStatus": 1 })
            .await;
    }
    mc.track(start, res.is_err());
    let st = res.map_err(|e| e.to_string())?;
    let mut norm = match normalize_bson_value(&Bson::Document(st)) {
        serde_json::Value::Object(m) => m,
        _ => serde_json::Map::new(),
    };
    norm.insert("client".to_string(), mc.stats.snapshot());
    Ok(Some(serde_json::Value::Object(norm)))
}

#[tauri::command]
pub async fn mongo_client_stats(
    state: State<'_, AppState>,
    id: String,
) -> Result<serde_json::Value, String> {
    let mc = state.mongo.must_mongo(&id).await?;
    let mut out = mc.stats.snapshot();
    if let Some(obj) = out.as_object_mut() {
        obj.insert(
            "maxPoolSize".to_string(),
            serde_json::json!(mc.cfg.mongo_max_pool_size),
        );
        obj.insert(
            "minPoolSize".to_string(),
            serde_json::json!(mc.cfg.mongo_min_pool_size),
        );
    }
    Ok(out)
}

#[tauri::command]
pub async fn mongo_current_ops(
    state: State<'_, AppState>,
    id: String,
) -> Result<Vec<String>, String> {
    let mc = state.mongo.must_mongo(&id).await?;
    let pipeline = vec![
        doc! { "$currentOp": { "allUsers": true } },
        doc! { "$match": { "active": true } },
        doc! { "$limit": 50 },
    ];
    let cur = mc
        .client
        .database("admin")
        .aggregate(pipeline)
        .await
        .map_err(|e| e.to_string())?;
    let docs: Vec<Document> = cur.try_collect().await.map_err(|e| e.to_string())?;
    Ok(docs.iter().map(doc_to_json).collect())
}

#[tauri::command]
pub async fn mongo_databases(
    state: State<'_, AppState>,
    id: String,
) -> Result<Vec<serde_json::Value>, String> {
    let mc = state.mongo.must_mongo(&id).await?;
    let start = Instant::now();
    let res = mc.client.list_databases().await;
    mc.track(start, res.is_err());
    let mut dbs = res.map_err(|e| e.to_string())?;
    dbs.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(dbs
        .into_iter()
        .map(|d| {
            serde_json::json!({
                "name": d.name,
                "sizeOnDisk": d.size_on_disk,
                "empty": d.empty,
            })
        })
        .collect())
}

#[tauri::command]
pub async fn mongo_collections(
    state: State<'_, AppState>,
    id: String,
    db_name: String,
) -> Result<Vec<serde_json::Value>, String> {
    let mc = state.mongo.must_mongo(&id).await?;
    if db_name.trim().is_empty() {
        return Err("数据库名不能为空".to_string());
    }
    let start = Instant::now();
    let res = mc
        .client
        .database(&db_name)
        .run_command(doc! { "listCollections": 1 })
        .await;
    mc.track(start, res.is_err());
    let cmd_res = res.map_err(|e| e.to_string())?;

    let mut out = Vec::new();
    if let Ok(cursor_doc) = cmd_res.get_document("cursor") {
        if let Ok(first_batch) = cursor_doc.get_array("firstBatch") {
            for item in first_batch {
                if let Bson::Document(spec) = item {
                    let name = spec.get_str("name").unwrap_or("").to_string();
                    let coll_type = spec.get_str("type").unwrap_or("collection").to_string();
                    let mut entry = serde_json::Map::new();
                    entry.insert("name".to_string(), serde_json::Value::String(name));
                    entry.insert("type".to_string(), serde_json::Value::String(coll_type));
                    if let Ok(opts) = spec.get_document("options") {
                        if opts.contains_key("validator") {
                            entry.insert("hasValidator".to_string(), serde_json::Value::Bool(true));
                        }
                        if let Ok(capped) = opts.get_bool("capped") {
                            entry.insert("capped".to_string(), serde_json::Value::Bool(capped));
                        }
                    }
                    out.push(serde_json::Value::Object(entry));
                }
            }
        }
    }
    out.sort_by(|a, b| {
        let na = a.get("name").and_then(|v| v.as_str()).unwrap_or("");
        let nb = b.get("name").and_then(|v| v.as_str()).unwrap_or("");
        na.cmp(nb)
    });
    Ok(out)
}

#[tauri::command]
pub async fn mongo_create_database(
    state: State<'_, AppState>,
    id: String,
    db_name: String,
    first_collection: String,
) -> Result<(), String> {
    let coll = if first_collection.trim().is_empty() {
        "default".to_string()
    } else {
        first_collection
    };
    mongo_create_collection(state, id, db_name, coll).await
}

#[tauri::command]
pub async fn mongo_drop_database(
    state: State<'_, AppState>,
    id: String,
    db_name: String,
) -> Result<(), String> {
    let mc = state.mongo.must_mongo(&id).await?;
    let start = Instant::now();
    let res = mc.client.database(&db_name).drop().await;
    mc.track(start, res.is_err());
    res.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn mongo_create_collection(
    state: State<'_, AppState>,
    id: String,
    db_name: String,
    coll: String,
) -> Result<(), String> {
    let mc = state.mongo.must_mongo(&id).await?;
    if coll.trim().is_empty() {
        return Err("集合名不能为空".to_string());
    }
    let start = Instant::now();
    let res = mc.client.database(&db_name).create_collection(&coll).await;
    mc.track(start, res.is_err());
    res.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn mongo_drop_collection(
    state: State<'_, AppState>,
    id: String,
    db_name: String,
    coll: String,
) -> Result<(), String> {
    let mc = state.mongo.must_mongo(&id).await?;
    let start = Instant::now();
    let res = mc
        .client
        .database(&db_name)
        .collection::<Document>(&coll)
        .drop()
        .await;
    mc.track(start, res.is_err());
    res.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn mongo_rename_collection(
    state: State<'_, AppState>,
    id: String,
    db_name: String,
    coll: String,
    new_name: String,
) -> Result<(), String> {
    let mc = state.mongo.must_mongo(&id).await?;
    if new_name.trim().is_empty() {
        return Err("新集合名不能为空".to_string());
    }
    let cmd = doc! {
        "renameCollection": format!("{}.{}", db_name, coll),
        "to": format!("{}.{}", db_name, new_name),
    };
    let start = Instant::now();
    let res = mc.client.database("admin").run_command(cmd).await;
    mc.track(start, res.is_err());
    res.map(|_| ()).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn mongo_collection_stats(
    state: State<'_, AppState>,
    id: String,
    db_name: String,
    coll: String,
) -> Result<Option<serde_json::Value>, String> {
    let mc = state.mongo.must_mongo(&id).await?;
    let start = Instant::now();
    let pipeline = vec![doc! {
        "$collStats": {
            "storageStats": {},
            "count": {},
        }
    }];
    let cur_res = mc
        .client
        .database(&db_name)
        .collection::<Document>(&coll)
        .aggregate(pipeline)
        .await;
    mc.track(start, cur_res.is_err());
    let mut cur = cur_res.map_err(|e| e.to_string())?;

    let mut out = serde_json::Map::new();
    if let Some(doc_res) = cur.next().await {
        let res = doc_res.map_err(|e| e.to_string())?;
        if let Ok(ss) = res.get_document("storageStats") {
            for key in [
                "count",
                "size",
                "avgObjSize",
                "storageSize",
                "totalIndexSize",
                "nindexes",
            ] {
                if let Some(v) = ss.get(key) {
                    out.insert(key.to_string(), normalize_bson_value(v));
                }
            }
        }
    }
    Ok(Some(serde_json::Value::Object(out)))
}

#[tauri::command]
pub async fn mongo_infer_schema(
    state: State<'_, AppState>,
    id: String,
    db_name: String,
    coll: String,
    sample_size: i64,
) -> Result<Vec<serde_json::Value>, String> {
    let mc = state.mongo.must_mongo(&id).await?;
    let sz = if sample_size <= 0 { 200 } else { sample_size };
    let start = Instant::now();
    let pipeline = vec![doc! { "$sample": { "size": sz } }];
    let cur_res = mc
        .client
        .database(&db_name)
        .collection::<Document>(&coll)
        .aggregate(pipeline)
        .await;
    mc.track(start, cur_res.is_err());
    let mut cur = cur_res.map_err(|e| e.to_string())?;

    struct FieldInfo {
        count: usize,
        types: HashMap<&'static str, usize>,
    }

    let mut fields: HashMap<String, FieldInfo> = HashMap::new();
    let mut total = 0usize;

    while let Some(Ok(doc)) = cur.next().await {
        total += 1;
        collect_fields("", &doc, &mut |path, typ| {
            let entry = fields.entry(path).or_insert_with(|| FieldInfo {
                count: 0,
                types: HashMap::new(),
            });
            entry.count += 1;
            *entry.types.entry(typ).or_insert(0) += 1;
        });
    }

    let mut out = Vec::with_capacity(fields.len());
    for (path, fi) in fields {
        let mut main_type = "";
        let mut best = 0usize;
        let mut type_list: Vec<&str> = Vec::with_capacity(fi.types.len());
        for (t, c) in &fi.types {
            type_list.push(t);
            if *c > best {
                best = *c;
                main_type = t;
            }
        }
        type_list.sort_unstable();
        let ratio = if total > 0 {
            (fi.count as f64) / (total as f64)
        } else {
            0.0
        };
        out.push(serde_json::json!({
            "field": path,
            "type": main_type,
            "types": type_list,
            "count": fi.count,
            "presence": ratio,
            "required": ratio >= 0.999,
        }));
    }
    out.sort_by(|a, b| {
        let fa = a.get("field").and_then(|v| v.as_str()).unwrap_or("");
        let fb = b.get("field").and_then(|v| v.as_str()).unwrap_or("");
        fa.cmp(fb)
    });
    Ok(out)
}

#[tauri::command]
pub async fn mongo_get_validator(
    state: State<'_, AppState>,
    id: String,
    db_name: String,
    coll: String,
) -> Result<serde_json::Value, String> {
    let mc = state.mongo.must_mongo(&id).await?;
    let cmd = doc! {
        "listCollections": 1,
        "filter": { "name": &coll },
    };
    let res = mc
        .client
        .database(&db_name)
        .run_command(cmd)
        .await
        .map_err(|e| e.to_string())?;

    let mut validator = String::new();
    let mut validation_level = String::new();
    let mut validation_action = String::new();

    if let Ok(cursor_doc) = res.get_document("cursor") {
        if let Ok(first_batch) = cursor_doc.get_array("firstBatch") {
            if let Some(Bson::Document(spec)) = first_batch.first() {
                if let Ok(opts) = spec.get_document("options") {
                    if let Some(v) = opts.get("validator") {
                        validator = bson_to_json(v);
                    }
                    if let Ok(l) = opts.get_str("validationLevel") {
                        validation_level = l.to_string();
                    }
                    if let Ok(a) = opts.get_str("validationAction") {
                        validation_action = a.to_string();
                    }
                }
            }
        }
    }

    Ok(serde_json::json!({
        "validator": validator,
        "validationLevel": validation_level,
        "validationAction": validation_action,
    }))
}

#[tauri::command]
pub async fn mongo_set_validator(
    state: State<'_, AppState>,
    id: String,
    db_name: String,
    coll: String,
    validator_json: String,
    level: String,
    action: String,
) -> Result<(), String> {
    let mc = state.mongo.must_mongo(&id).await?;
    let validator = parse_json_doc(&validator_json)?;
    let lv = if level.trim().is_empty() {
        "strict".to_string()
    } else {
        level
    };
    let act = if action.trim().is_empty() {
        "error".to_string()
    } else {
        action
    };
    let cmd = doc! {
        "collMod": coll,
        "validator": validator,
        "validationLevel": lv,
        "validationAction": act,
    };
    let start = Instant::now();
    let res = mc.client.database(&db_name).run_command(cmd).await;
    mc.track(start, res.is_err());
    res.map(|_| ()).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn mongo_validate_document(
    state: State<'_, AppState>,
    id: String,
    db_name: String,
    coll: String,
    doc_json: String,
) -> Result<Option<serde_json::Value>, String> {
    let mc = state.mongo.must_mongo(&id).await?;
    let doc = parse_json_doc(&doc_json)?;
    let collection = mc.client.database(&db_name).collection::<Document>(&coll);

    if let Ok(mut session) = mc.client.start_session().await {
        if session.start_transaction().await.is_ok() {
            match collection.insert_one(doc.clone()).session(&mut session).await {
                Ok(_) => {
                    let _ = session.abort_transaction().await;
                    return Ok(Some(serde_json::json!({ "valid": true })));
                }
                Err(e) => {
                    let _ = session.abort_transaction().await;
                    return Ok(Some(serde_json::json!({
                        "valid": false,
                        "error": e.to_string(),
                    })));
                }
            }
        }
    }

    match collection.insert_one(doc).await {
        Ok(res) => {
            let _ = collection.delete_one(doc! { "_id": res.inserted_id }).await;
            Ok(Some(serde_json::json!({ "valid": true })))
        }
        Err(e) => Ok(Some(serde_json::json!({
            "valid": false,
            "error": e.to_string(),
        }))),
    }
}

#[tauri::command]
pub async fn mongo_indexes(
    state: State<'_, AppState>,
    id: String,
    db_name: String,
    coll: String,
) -> Result<Vec<serde_json::Value>, String> {
    let mc = state.mongo.must_mongo(&id).await?;
    let start = Instant::now();
    let res = mc
        .client
        .database(&db_name)
        .run_command(doc! { "listIndexes": &coll })
        .await;
    mc.track(start, res.is_err());
    let cmd_res = res.map_err(|e| e.to_string())?;

    let mut out = Vec::new();
    if let Ok(cursor_doc) = cmd_res.get_document("cursor") {
        if let Ok(first_batch) = cursor_doc.get_array("firstBatch") {
            for item in first_batch {
                if let Bson::Document(idx) = item {
                    let name = idx.get_str("name").unwrap_or("").to_string();
                    let key_json = idx.get("key").map(bson_to_json).unwrap_or_default();
                    let unique = idx.get_bool("unique").unwrap_or(false);
                    let sparse = idx.get_bool("sparse").unwrap_or(false);
                    let mut entry = serde_json::Map::new();
                    entry.insert("name".to_string(), serde_json::Value::String(name));
                    entry.insert("key".to_string(), serde_json::Value::String(key_json));
                    entry.insert("unique".to_string(), serde_json::Value::Bool(unique));
                    entry.insert("sparse".to_string(), serde_json::Value::Bool(sparse));
                    if let Some(exp) = idx.get("expireAfterSeconds") {
                        entry.insert(
                            "expireAfterSeconds".to_string(),
                            normalize_bson_value(exp),
                        );
                    }
                    if let Some(pfe) = idx.get("partialFilterExpression") {
                        entry.insert(
                            "partialFilterExpression".to_string(),
                            serde_json::Value::String(bson_to_json(pfe)),
                        );
                    }
                    out.push(serde_json::Value::Object(entry));
                }
            }
        }
    }
    Ok(out)
}

#[tauri::command]
pub async fn mongo_create_index(
    state: State<'_, AppState>,
    id: String,
    db_name: String,
    coll: String,
    keys_json: String,
    name: String,
    unique: bool,
    sparse: bool,
    expire_after_seconds: i64,
) -> Result<String, String> {
    let mc = state.mongo.must_mongo(&id).await?;
    let keys = parse_json_doc(&keys_json).map_err(|e| format!("索引键 {}", e))?;
    if keys.is_empty() {
        return Err("索引键不能为空".to_string());
    }
    let mut idx_opts = IndexOptions::default();
    idx_opts.unique = Some(unique);
    idx_opts.sparse = Some(sparse);
    if !name.trim().is_empty() {
        idx_opts.name = Some(name.trim().to_string());
    }
    if expire_after_seconds > 0 {
        idx_opts.expire_after = Some(Duration::from_secs(expire_after_seconds as u64));
    }
    let model = IndexModel::builder()
        .keys(keys)
        .options(idx_opts)
        .build();
    let start = Instant::now();
    let res = mc
        .client
        .database(&db_name)
        .collection::<Document>(&coll)
        .create_index(model)
        .await;
    mc.track(start, res.is_err());
    res.map(|r| r.index_name).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn mongo_drop_index(
    state: State<'_, AppState>,
    id: String,
    db_name: String,
    coll: String,
    name: String,
) -> Result<(), String> {
    let mc = state.mongo.must_mongo(&id).await?;
    if name == "_id_" {
        return Err("_id 索引不可删除".to_string());
    }
    let start = Instant::now();
    let res = mc
        .client
        .database(&db_name)
        .collection::<Document>(&coll)
        .drop_index(&name)
        .await;
    mc.track(start, res.is_err());
    res.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn mongo_index_stats(
    state: State<'_, AppState>,
    id: String,
    db_name: String,
    coll: String,
) -> Result<Vec<String>, String> {
    let mc = state.mongo.must_mongo(&id).await?;
    let start = Instant::now();
    let cur_res = mc
        .client
        .database(&db_name)
        .collection::<Document>(&coll)
        .aggregate(vec![doc! { "$indexStats": {} }])
        .await;
    mc.track(start, cur_res.is_err());
    let cur = cur_res.map_err(|e| e.to_string())?;
    let docs: Vec<Document> = cur.try_collect().await.map_err(|e| e.to_string())?;
    Ok(docs.iter().map(doc_to_json).collect())
}

#[tauri::command]
pub async fn mongo_watch(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
    scope: String,
    db_name: String,
    coll: String,
    pipeline_json: String,
    full_document: String,
) -> Result<String, String> {
    let mc = state.mongo.must_mongo(&id).await?;
    let watch_key = format!("{}:{}:{}", scope, db_name, coll);
    {
        let streams = mc.streams.lock().await;
        if streams.contains_key(&watch_key) {
            return Ok(watch_key);
        }
    }

    let pipeline = if !pipeline_json.trim().is_empty() {
        parse_json_array(&pipeline_json)?
    } else {
        Vec::new()
    };

    let fd_type = match full_document.trim().to_lowercase().as_str() {
        "updatelookup" => Some(FullDocumentType::UpdateLookup),
        "whenavailable" => Some(FullDocumentType::WhenAvailable),
        "required" => Some(FullDocumentType::Required),
        _ => None,
    };

    let stream_res = match scope.trim().to_lowercase().as_str() {
        "deployment" => {
            let mut w = mc.client.watch().pipeline(pipeline);
            if let Some(fd) = fd_type {
                w = w.full_document(fd);
            }
            w.await
        }
        "database" => {
            if db_name.trim().is_empty() {
                return Err("监听数据库变更需要指定数据库名".to_string());
            }
            let db_obj = mc.client.database(&db_name);
            let mut w = db_obj.watch().pipeline(pipeline);
            if let Some(fd) = fd_type {
                w = w.full_document(fd);
            }
            w.await
        }
        _ => {
            if db_name.trim().is_empty() || coll.trim().is_empty() {
                return Err("监听集合变更需要指定数据库与集合名".to_string());
            }
            let coll_obj = mc
                .client
                .database(&db_name)
                .collection::<Document>(&coll);
            let mut w = coll_obj.watch().pipeline(pipeline);
            if let Some(fd) = fd_type {
                w = w.full_document(fd);
            }
            w.await
        }
    };

    let raw_stream = stream_res
        .map_err(|e| format!("开启变更流失败（需要副本集或分片集群）: {}", e))?
        .with_type::<Document>();

    let (stop_tx, mut stop_rx) = oneshot::channel::<()>();
    {
        let mut streams = mc.streams.lock().await;
        streams.insert(watch_key.clone(), stop_tx);
    }

    let event_name = format!("mongo:change:{}", id);
    let key_clone = watch_key.clone();
    let mc_clone = mc.clone();
    tokio::spawn(async move {
        let mut stream = raw_stream;
        loop {
            tokio::select! {
                _ = &mut stop_rx => break,
                next_ev = stream.next() => {
                    match next_ev {
                        Some(Ok(evt_doc)) => {
                            let op_type = evt_doc.get_str("operationType").unwrap_or("").to_string();
                            let ns_json = evt_doc.get("ns").map(bson_to_json).unwrap_or_default();
                            let doc_str = doc_to_json(&evt_doc);
                            let evt_val = Bson::Document(evt_doc).into_relaxed_extjson();
                            let _ = app.emit(&event_name, serde_json::json!({
                                "watchKey": key_clone,
                                "operation": op_type,
                                "ns": ns_json,
                                "document": doc_str,
                                "event": evt_val,
                                "error": "",
                                "ts": Utc::now().timestamp_millis(),
                            }));
                        }
                        Some(Err(e)) => {
                            let _ = app.emit(&event_name, serde_json::json!({
                                "watchKey": key_clone,
                                "event": serde_json::Value::Null,
                                "error": e.to_string(),
                                "ts": Utc::now().timestamp_millis(),
                            }));
                            break;
                        }
                        None => break,
                    }
                }
            }
        }
        let mut streams = mc_clone.streams.lock().await;
        streams.remove(&key_clone);
    });

    Ok(watch_key)
}

#[tauri::command]
pub async fn mongo_unwatch(
    state: State<'_, AppState>,
    id: String,
    watch_key: String,
) -> Result<(), String> {
    let mc = state.mongo.must_mongo(&id).await?;
    let mut streams = mc.streams.lock().await;
    if let Some(tx) = streams.remove(&watch_key) {
        let _ = tx.send(());
    }
    Ok(())
}

#[tauri::command]
pub async fn mongo_watch_list(
    state: State<'_, AppState>,
    id: String,
) -> Result<Vec<String>, String> {
    let mc = state.mongo.must_mongo(&id).await?;
    let streams = mc.streams.lock().await;
    let mut keys: Vec<String> = streams.keys().cloned().collect();
    keys.sort();
    Ok(keys)
}

#[tauri::command]
pub async fn mongo_users(
    state: State<'_, AppState>,
    id: String,
    db_name: String,
) -> Result<Vec<serde_json::Value>, String> {
    let mc = state.mongo.must_mongo(&id).await?;
    let target_db = if db_name.trim().is_empty() {
        "admin"
    } else {
        db_name.trim()
    };
    let start = Instant::now();
    let res = mc
        .client
        .database(target_db)
        .run_command(doc! { "usersInfo": 1 })
        .await;
    mc.track(start, res.is_err());
    let cmd_res = res.map_err(|e| e.to_string())?;

    let mut out = Vec::new();
    if let Ok(users) = cmd_res.get_array("users") {
        for u in users {
            if let Bson::Document(u_doc) = u {
                let user = u_doc.get_str("user").unwrap_or("").to_string();
                let db = u_doc.get_str("db").unwrap_or("").to_string();
                let mut roles = Vec::new();
                if let Ok(r_arr) = u_doc.get_array("roles") {
                    for r in r_arr {
                        if let Bson::Document(r_doc) = r {
                            roles.push(serde_json::json!({
                                "role": r_doc.get_str("role").unwrap_or(""),
                                "db": r_doc.get_str("db").unwrap_or(""),
                            }));
                        }
                    }
                }
                let mut item = serde_json::Map::new();
                item.insert("user".to_string(), serde_json::Value::String(user));
                item.insert("db".to_string(), serde_json::Value::String(db));
                item.insert("roles".to_string(), serde_json::Value::Array(roles));
                if let Some(cd) = u_doc.get("customData") {
                    item.insert("customData".to_string(), normalize_bson_value(cd));
                }
                out.push(serde_json::Value::Object(item));
            }
        }
    }
    Ok(out)
}

#[tauri::command]
pub async fn mongo_create_user(
    state: State<'_, AppState>,
    id: String,
    req: serde_json::Value,
) -> Result<(), String> {
    let mc = state.mongo.must_mongo(&id).await?;
    let r: MongoCreateUserReq =
        serde_json::from_value(req).map_err(|e| format!("参数解析失败: {}", e))?;
    if r.user.trim().is_empty() || r.pwd.trim().is_empty() {
        return Err("用户名和密码不能为空".to_string());
    }
    let target_db = if r.db.trim().is_empty() {
        "admin".to_string()
    } else {
        r.db.trim().to_string()
    };
    let roles_bson: Vec<Bson> = r
        .roles
        .into_iter()
        .map(|role| {
            let rdb = if role.db.trim().is_empty() {
                target_db.clone()
            } else {
                role.db.trim().to_string()
            };
            Bson::Document(doc! { "role": role.role, "db": rdb })
        })
        .collect();

    let cmd = doc! {
        "createUser": r.user,
        "pwd": r.pwd,
        "roles": roles_bson,
    };
    let start = Instant::now();
    let res = mc.client.database(&target_db).run_command(cmd).await;
    mc.track(start, res.is_err());
    res.map(|_| ()).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn mongo_update_user(
    state: State<'_, AppState>,
    id: String,
    req: serde_json::Value,
) -> Result<(), String> {
    let mc = state.mongo.must_mongo(&id).await?;
    let r: MongoUpdateUserReq =
        serde_json::from_value(req).map_err(|e| format!("参数解析失败: {}", e))?;
    if r.user.trim().is_empty() {
        return Err("用户名不能为空".to_string());
    }
    let target_db = if r.db.trim().is_empty() {
        "admin".to_string()
    } else {
        r.db.trim().to_string()
    };
    let mut cmd = doc! { "updateUser": r.user };
    if !r.pwd.trim().is_empty() {
        cmd.insert("pwd", r.pwd);
    }
    if !r.roles.is_empty() {
        let roles_bson: Vec<Bson> = r
            .roles
            .into_iter()
            .map(|role| {
                let rdb = if role.db.trim().is_empty() {
                    target_db.clone()
                } else {
                    role.db.trim().to_string()
                };
                Bson::Document(doc! { "role": role.role, "db": rdb })
            })
            .collect();
        cmd.insert("roles", roles_bson);
    }
    let start = Instant::now();
    let res = mc.client.database(&target_db).run_command(cmd).await;
    mc.track(start, res.is_err());
    res.map(|_| ()).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn mongo_drop_user(
    state: State<'_, AppState>,
    id: String,
    db_name: String,
    username: String,
) -> Result<(), String> {
    let mc = state.mongo.must_mongo(&id).await?;
    let target_db = if db_name.trim().is_empty() {
        "admin"
    } else {
        db_name.trim()
    };
    let start = Instant::now();
    let res = mc
        .client
        .database(target_db)
        .run_command(doc! { "dropUser": username })
        .await;
    mc.track(start, res.is_err());
    res.map(|_| ()).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn mongo_create_collection_advanced(
    state: State<'_, AppState>,
    id: String,
    db_name: String,
    opt: serde_json::Value,
) -> Result<(), String> {
    let mc = state.mongo.must_mongo(&id).await?;
    let o: MongoCreateCollOptions =
        serde_json::from_value(opt).map_err(|e| format!("参数解析失败: {}", e))?;
    let name = o.name.trim();
    if name.is_empty() {
        return Err("集合名不能为空".to_string());
    }

    let mut cmd = doc! { "create": name };
    if o.capped {
        cmd.insert("capped", true);
        let size = if o.size <= 0 { 10_485_760 } else { o.size };
        cmd.insert("size", size);
        if o.max > 0 {
            cmd.insert("max", o.max);
        }
    }
    if o.is_timeseries && !o.time_field.trim().is_empty() {
        let mut ts_doc = doc! {
            "timeField": o.time_field.trim(),
        };
        if !o.meta_field.trim().is_empty() {
            ts_doc.insert("metaField", o.meta_field.trim());
        }
        let g = if o.granularity.trim().is_empty() {
            "seconds"
        } else {
            o.granularity.trim()
        };
        ts_doc.insert("granularity", g);
        cmd.insert("timeseries", ts_doc);
    }

    let start = Instant::now();
    let res = mc.client.database(&db_name).run_command(cmd).await;
    mc.track(start, res.is_err());
    res.map(|_| ()).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn mongo_clone_collection(
    state: State<'_, AppState>,
    id: String,
    req: serde_json::Value,
) -> Result<i64, String> {
    let mc = state.mongo.must_mongo(&id).await?;
    let r: MongoCloneCollReq =
        serde_json::from_value(req).map_err(|e| format!("参数解析失败: {}", e))?;
    if r.source_coll.trim().is_empty() || r.target_coll.trim().is_empty() {
        return Err("源集合名和目标集合名不能为空".to_string());
    }
    let s_db = r.source_db.trim();
    let t_db = if r.target_db.trim().is_empty() {
        s_db
    } else {
        r.target_db.trim()
    };

    let src_coll = mc
        .client
        .database(s_db)
        .collection::<Document>(&r.source_coll);
    let tgt_coll = mc
        .client
        .database(t_db)
        .collection::<Document>(&r.target_coll);

    let _ = mc.client.database(t_db).create_collection(&r.target_coll).await;

    if let Ok(mut idx_cur) = src_coll.list_indexes().await {
        let mut new_models = Vec::new();
        while let Some(Ok(idx)) = idx_cur.next().await {
            let is_id = idx
                .options
                .as_ref()
                .and_then(|o| o.name.as_deref())
                .map(|n| n == "_id_")
                .unwrap_or(false);
            if !is_id {
                new_models.push(idx);
            }
        }
        if !new_models.is_empty() {
            let _ = tgt_coll.create_indexes(new_models).await;
        }
    }

    let mut copied_count = 0i64;
    if r.copy_data {
        let mut cur_docs = src_coll
            .find(Document::new())
            .await
            .map_err(|e| format!("读取源数据失败: {}", e))?;
        let mut batch = Vec::with_capacity(1000);
        while let Some(doc_res) = cur_docs.next().await {
            let doc = doc_res.map_err(|e| format!("解析文档失败: {}", e))?;
            batch.push(doc);
            if batch.len() >= 1000 {
                let res = tgt_coll
                    .insert_many(&batch)
                    .await
                    .map_err(|e| format!("插入目标集合失败: {}", e))?;
                copied_count += res.inserted_ids.len() as i64;
                batch.clear();
            }
        }
        if !batch.is_empty() {
            let res = tgt_coll
                .insert_many(&batch)
                .await
                .map_err(|e| format!("插入目标集合失败: {}", e))?;
            copied_count += res.inserted_ids.len() as i64;
        }
    }

    Ok(copied_count)
}

#[tauri::command]
pub async fn mongo_get_profiling_status(
    state: State<'_, AppState>,
    id: String,
    db_name: String,
) -> Result<serde_json::Value, String> {
    let mc = state.mongo.must_mongo(&id).await?;
    let target_db = if db_name.trim().is_empty() {
        "admin"
    } else {
        db_name.trim()
    };
    let start = Instant::now();
    let res = mc
        .client
        .database(target_db)
        .run_command(doc! { "profile": -1 })
        .await;
    mc.track(start, res.is_err());
    let doc_res = res.map_err(|e| e.to_string())?;
    Ok(normalize_bson_value(&Bson::Document(doc_res)))
}

#[tauri::command]
pub async fn mongo_set_profiling_status(
    state: State<'_, AppState>,
    id: String,
    db_name: String,
    level: i64,
    slowms: i64,
) -> Result<(), String> {
    let mc = state.mongo.must_mongo(&id).await?;
    let target_db = if db_name.trim().is_empty() {
        "admin"
    } else {
        db_name.trim()
    };
    let slow_ms = if slowms <= 0 { 100 } else { slowms };
    let cmd = doc! {
        "profile": level as i32,
        "slowms": slow_ms as i32,
    };
    let start = Instant::now();
    let res = mc.client.database(target_db).run_command(cmd).await;
    mc.track(start, res.is_err());
    res.map(|_| ()).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn mongo_slow_queries(
    state: State<'_, AppState>,
    id: String,
    db_name: String,
    limit: i64,
) -> Result<Vec<String>, String> {
    let mc = state.mongo.must_mongo(&id).await?;
    let target_db = if db_name.trim().is_empty() {
        "admin"
    } else {
        db_name.trim()
    };
    let lim = if limit <= 0 { 100 } else { limit };
    let start = Instant::now();
    let coll = mc
        .client
        .database(target_db)
        .collection::<Document>("system.profile");
    let cur_res = coll
        .find(Document::new())
        .sort(doc! { "ts": -1 })
        .limit(lim)
        .await;
    mc.track(start, cur_res.is_err());
    let cur = cur_res.map_err(|e| e.to_string())?;
    let raws: Vec<Document> = cur.try_collect().await.map_err(|e| e.to_string())?;
    Ok(raws.iter().map(doc_to_json).collect())
}

