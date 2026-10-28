use crate::db::mongo::manager::{
    doc_to_json, ensure_update_operators, parse_json_array, parse_json_doc,
};
use crate::db::mongo::types::{MongoBulkOp, MongoFindResult, MongoQuerySpec, MongoTxOp};
use crate::AppState;
use futures_util::TryStreamExt;
use mongodb::bson::{doc, Bson, Document};
use mongodb::options::{FindOneAndUpdateOptions, FindOptions, Hint, ReturnDocument};
use std::time::{Duration, Instant};
use tauri::State;

#[tauri::command]
pub async fn mongo_find(
    state: State<'_, AppState>,
    id: String,
    spec: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let q_spec: MongoQuerySpec =
        serde_json::from_value(spec).map_err(|e| format!("查询参数解析失败: {}", e))?;
    let mc = state.mongo.must_mongo(&id).await?;

    let filter = parse_json_doc(&q_spec.filter).map_err(|e| format!("过滤条件 {}", e))?;
    let mut find_opts = FindOptions::default();

    if !q_spec.projection.trim().is_empty() {
        let proj = parse_json_doc(&q_spec.projection).map_err(|e| format!("投影字段 {}", e))?;
        find_opts.projection = Some(proj);
    }
    if !q_spec.sort.trim().is_empty() {
        let s = parse_json_doc(&q_spec.sort).map_err(|e| format!("排序条件 {}", e))?;
        find_opts.sort = Some(s);
    }
    let limit = if q_spec.limit <= 0 { 50 } else { q_spec.limit };
    find_opts.limit = Some(limit);
    if q_spec.skip > 0 {
        find_opts.skip = Some(q_spec.skip as u64);
    }
    let h = q_spec.hint.trim();
    if !h.is_empty() {
        if h.starts_with('{') {
            if let Ok(hd) = parse_json_doc(h) {
                find_opts.hint = Some(Hint::Keys(hd));
            }
        } else {
            find_opts.hint = Some(Hint::Name(h.to_string()));
        }
    }

    let start = Instant::now();
    let coll = mc
        .client
        .database(&q_spec.database)
        .collection::<Document>(&q_spec.collection);
    let cur_res = coll.find(filter.clone()).with_options(find_opts).await;
    mc.track(start, cur_res.is_err());
    let cur = cur_res.map_err(|e| e.to_string())?;
    let raws: Vec<Document> = cur.try_collect().await.map_err(|e| e.to_string())?;
    let duration_ms = start.elapsed().as_millis() as i64;

    let documents: Vec<String> = raws.iter().map(doc_to_json).collect();
    let count = documents.len();

    let total = if filter.is_empty() {
        coll.estimated_document_count().await.unwrap_or(0) as i64
    } else {
        coll.count_documents(filter).await.unwrap_or(0) as i64
    };

    let res = MongoFindResult {
        documents,
        count,
        total,
        duration_ms,
    };
    serde_json::to_value(res).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn mongo_count_documents(
    state: State<'_, AppState>,
    id: String,
    db_name: String,
    coll: String,
    filter_json: String,
) -> Result<i64, String> {
    let mc = state.mongo.must_mongo(&id).await?;
    let filter = parse_json_doc(&filter_json)?;
    let start = Instant::now();
    let res = mc
        .client
        .database(&db_name)
        .collection::<Document>(&coll)
        .count_documents(filter)
        .await;
    mc.track(start, res.is_err());
    res.map(|n| n as i64).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn mongo_distinct(
    state: State<'_, AppState>,
    id: String,
    db_name: String,
    coll: String,
    field: String,
    filter_json: String,
) -> Result<Vec<String>, String> {
    let mc = state.mongo.must_mongo(&id).await?;
    if field.trim().is_empty() {
        return Err("字段名不能为空".to_string());
    }
    let filter = parse_json_doc(&filter_json)?;
    let start = Instant::now();
    let res = mc
        .client
        .database(&db_name)
        .collection::<Document>(&coll)
        .distinct(field.trim(), filter)
        .await;
    mc.track(start, res.is_err());
    let vals = res.map_err(|e| e.to_string())?;
    Ok(vals
        .into_iter()
        .map(|v| doc_to_json(&doc! { "v": v }))
        .collect())
}

#[tauri::command]
pub async fn mongo_explain(
    state: State<'_, AppState>,
    id: String,
    spec: serde_json::Value,
    verbosity: String,
) -> Result<String, String> {
    let q_spec: MongoQuerySpec =
        serde_json::from_value(spec).map_err(|e| format!("查询参数解析失败: {}", e))?;
    let mc = state.mongo.must_mongo(&id).await?;
    let filter = parse_json_doc(&q_spec.filter)?;
    let verb = if verbosity.trim().is_empty() {
        "queryPlanner".to_string()
    } else {
        verbosity
    };

    let mut inner = doc! {
        "find": &q_spec.collection,
        "filter": filter,
    };
    if q_spec.limit > 0 {
        inner.insert("limit", q_spec.limit);
    }
    if !q_spec.sort.trim().is_empty() {
        if let Ok(s) = parse_json_doc(&q_spec.sort) {
            inner.insert("sort", s);
        }
    }
    let cmd = doc! {
        "explain": inner,
        "verbosity": verb,
    };
    let start = Instant::now();
    let res = mc.client.database(&q_spec.database).run_command(cmd).await;
    mc.track(start, res.is_err());
    let doc_res = res.map_err(|e| e.to_string())?;
    Ok(doc_to_json(&doc_res))
}

#[tauri::command]
pub async fn mongo_insert_one(
    state: State<'_, AppState>,
    id: String,
    db_name: String,
    coll: String,
    doc_json: String,
) -> Result<String, String> {
    let mc = state.mongo.must_mongo(&id).await?;
    let doc = parse_json_doc(&doc_json)?;
    let start = Instant::now();
    let res = mc
        .client
        .database(&db_name)
        .collection::<Document>(&coll)
        .insert_one(doc)
        .await;
    mc.track(start, res.is_err());
    let r = res.map_err(|e| e.to_string())?;
    Ok(doc_to_json(&doc! { "insertedId": r.inserted_id }))
}

#[tauri::command]
pub async fn mongo_insert_many(
    state: State<'_, AppState>,
    id: String,
    db_name: String,
    coll: String,
    docs_json: String,
    ordered: bool,
) -> Result<serde_json::Value, String> {
    let mc = state.mongo.must_mongo(&id).await?;
    let docs = parse_json_array(&docs_json)?;
    if docs.is_empty() {
        return Err("没有可插入的文档".to_string());
    }
    let requested = docs.len();
    let start = Instant::now();
    let res = mc
        .client
        .database(&db_name)
        .collection::<Document>(&coll)
        .insert_many(docs)
        .ordered(ordered)
        .await;
    mc.track(start, res.is_err());

    match res {
        Ok(r) => Ok(serde_json::json!({
            "requested": requested,
            "insertedCount": r.inserted_ids.len(),
        })),
        Err(e) => Err(e.to_string()),
    }
}

async fn mongo_update_internal(
    state: State<'_, AppState>,
    id: String,
    db_name: String,
    coll: String,
    filter_json: String,
    update_json: String,
    upsert: bool,
    many: bool,
) -> Result<serde_json::Value, String> {
    let mc = state.mongo.must_mongo(&id).await?;
    let filter = parse_json_doc(&filter_json).map_err(|e| format!("过滤条件 {}", e))?;
    let update = parse_json_doc(&update_json).map_err(|e| format!("更新内容 {}", e))?;
    if update.is_empty() {
        return Err("更新内容不能为空".to_string());
    }
    let update = ensure_update_operators(update);
    let c = mc.client.database(&db_name).collection::<Document>(&coll);
    let start = Instant::now();
    let res = if many {
        c.update_many(filter, update).upsert(upsert).await
    } else {
        c.update_one(filter, update).upsert(upsert).await
    };
    mc.track(start, res.is_err());
    let r = res.map_err(|e| e.to_string())?;
    let upserted = if r.upserted_id.is_some() { 1 } else { 0 };
    Ok(serde_json::json!({
        "matched": r.matched_count,
        "modified": r.modified_count,
        "upserted": upserted,
    }))
}

#[tauri::command]
pub async fn mongo_update_one(
    state: State<'_, AppState>,
    id: String,
    db_name: String,
    coll: String,
    filter_json: String,
    update_json: String,
    upsert: bool,
) -> Result<serde_json::Value, String> {
    mongo_update_internal(state, id, db_name, coll, filter_json, update_json, upsert, false).await
}

#[tauri::command]
pub async fn mongo_update_many(
    state: State<'_, AppState>,
    id: String,
    db_name: String,
    coll: String,
    filter_json: String,
    update_json: String,
    upsert: bool,
) -> Result<serde_json::Value, String> {
    mongo_update_internal(state, id, db_name, coll, filter_json, update_json, upsert, true).await
}

#[tauri::command]
pub async fn mongo_replace_one(
    state: State<'_, AppState>,
    id: String,
    db_name: String,
    coll: String,
    filter_json: String,
    doc_json: String,
    upsert: bool,
) -> Result<serde_json::Value, String> {
    let mc = state.mongo.must_mongo(&id).await?;
    let filter = parse_json_doc(&filter_json).map_err(|e| format!("过滤条件 {}", e))?;
    let doc = parse_json_doc(&doc_json).map_err(|e| format!("替换文档 {}", e))?;
    let start = Instant::now();
    let res = mc
        .client
        .database(&db_name)
        .collection::<Document>(&coll)
        .replace_one(filter, doc)
        .upsert(upsert)
        .await;
    mc.track(start, res.is_err());
    let r = res.map_err(|e| e.to_string())?;
    let upserted = if r.upserted_id.is_some() { 1 } else { 0 };
    Ok(serde_json::json!({
        "matched": r.matched_count,
        "modified": r.modified_count,
        "upserted": upserted,
    }))
}

async fn mongo_delete_internal(
    state: State<'_, AppState>,
    id: String,
    db_name: String,
    coll: String,
    filter_json: String,
    many: bool,
) -> Result<i64, String> {
    let mc = state.mongo.must_mongo(&id).await?;
    let filter = parse_json_doc(&filter_json)?;
    if filter.is_empty() && many {
        return Err("批量删除必须指定过滤条件，如需清空请删除集合".to_string());
    }
    let c = mc.client.database(&db_name).collection::<Document>(&coll);
    let start = Instant::now();
    let res = if many {
        c.delete_many(filter).await
    } else {
        c.delete_one(filter).await
    };
    mc.track(start, res.is_err());
    let r = res.map_err(|e| e.to_string())?;
    Ok(r.deleted_count as i64)
}

#[tauri::command]
pub async fn mongo_delete_one(
    state: State<'_, AppState>,
    id: String,
    db_name: String,
    coll: String,
    filter_json: String,
) -> Result<i64, String> {
    mongo_delete_internal(state, id, db_name, coll, filter_json, false).await
}

#[tauri::command]
pub async fn mongo_delete_many(
    state: State<'_, AppState>,
    id: String,
    db_name: String,
    coll: String,
    filter_json: String,
) -> Result<i64, String> {
    mongo_delete_internal(state, id, db_name, coll, filter_json, true).await
}

#[tauri::command]
pub async fn mongo_find_one_and_update(
    state: State<'_, AppState>,
    id: String,
    db_name: String,
    coll: String,
    filter_json: String,
    update_json: String,
    return_new: bool,
) -> Result<String, String> {
    let mc = state.mongo.must_mongo(&id).await?;
    let filter = parse_json_doc(&filter_json)?;
    let update = ensure_update_operators(parse_json_doc(&update_json)?);
    let rd = if return_new {
        ReturnDocument::After
    } else {
        ReturnDocument::Before
    };
    let opts = FindOneAndUpdateOptions::builder()
        .return_document(rd)
        .build();
    let start = Instant::now();
    let res = mc
        .client
        .database(&db_name)
        .collection::<Document>(&coll)
        .find_one_and_update(filter, update)
        .with_options(opts)
        .await;
    mc.track(start, res.is_err());
    match res.map_err(|e| e.to_string())? {
        Some(doc) => Ok(doc_to_json(&doc)),
        None => Ok(String::new()),
    }
}

#[tauri::command]
pub async fn mongo_bulk_write(
    state: State<'_, AppState>,
    id: String,
    db_name: String,
    coll: String,
    ops: Vec<serde_json::Value>,
    ordered: bool,
) -> Result<serde_json::Value, String> {
    let mc = state.mongo.must_mongo(&id).await?;
    if ops.is_empty() {
        return Err("没有可执行的操作".to_string());
    }
    let parsed_ops: Vec<MongoBulkOp> = ops
        .into_iter()
        .map(serde_json::from_value)
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("批量操作解析失败: {}", e))?;

    let c = mc.client.database(&db_name).collection::<Document>(&coll);
    let requested = parsed_ops.len();
    let mut inserted = 0u64;
    let mut matched = 0u64;
    let mut modified = 0u64;
    let mut deleted = 0u64;
    let mut upserted = 0u64;
    let mut last_error = String::new();

    let start = Instant::now();
    for (i, op) in parsed_ops.into_iter().enumerate() {
        let step_res: Result<(), String> = async {
            match op.op_type.to_lowercase().as_str() {
                "insert" => {
                    let doc = parse_json_doc(&op.document)
                        .map_err(|e| format!("第 {} 项 {}", i + 1, e))?;
                    c.insert_one(doc)
                        .await
                        .map_err(|e| format!("第 {} 项插入失败: {}", i + 1, e))?;
                    inserted += 1;
                }
                "update" | "updatemany" => {
                    let filter = parse_json_doc(&op.filter)
                        .map_err(|e| format!("第 {} 项过滤条件 {}", i + 1, e))?;
                    let update = ensure_update_operators(
                        parse_json_doc(&op.document)
                            .map_err(|e| format!("第 {} 项更新内容 {}", i + 1, e))?,
                    );
                    let r = if op.op_type.eq_ignore_ascii_case("updatemany") {
                        c.update_many(filter, update).upsert(op.upsert).await
                    } else {
                        c.update_one(filter, update).upsert(op.upsert).await
                    }
                    .map_err(|e| format!("第 {} 项更新失败: {}", i + 1, e))?;
                    matched += r.matched_count;
                    modified += r.modified_count;
                    if r.upserted_id.is_some() {
                        upserted += 1;
                    }
                }
                "replace" => {
                    let filter = parse_json_doc(&op.filter)
                        .map_err(|e| format!("第 {} 项过滤条件 {}", i + 1, e))?;
                    let doc = parse_json_doc(&op.document)
                        .map_err(|e| format!("第 {} 项替换文档 {}", i + 1, e))?;
                    let r = c
                        .replace_one(filter, doc)
                        .upsert(op.upsert)
                        .await
                        .map_err(|e| format!("第 {} 项替换失败: {}", i + 1, e))?;
                    matched += r.matched_count;
                    modified += r.modified_count;
                    if r.upserted_id.is_some() {
                        upserted += 1;
                    }
                }
                "delete" | "deletemany" => {
                    let filter = parse_json_doc(&op.filter)
                        .map_err(|e| format!("第 {} 项过滤条件 {}", i + 1, e))?;
                    let r = if op.op_type.eq_ignore_ascii_case("deletemany") {
                        c.delete_many(filter).await
                    } else {
                        c.delete_one(filter).await
                    }
                    .map_err(|e| format!("第 {} 项删除失败: {}", i + 1, e))?;
                    deleted += r.deleted_count;
                }
                other => return Err(format!("第 {} 项：不支持的操作类型 {}", i + 1, other)),
            }
            Ok(())
        }
        .await;

        if let Err(e) = step_res {
            last_error = e;
            if ordered {
                break;
            }
        }
    }
    mc.track(start, !last_error.is_empty());

    let mut out = serde_json::json!({
        "requested": requested,
        "inserted": inserted,
        "matched": matched,
        "modified": modified,
        "deleted": deleted,
        "upserted": upserted,
    });
    if !last_error.is_empty() {
        out["error"] = serde_json::Value::String(last_error);
    }
    Ok(out)
}

#[tauri::command]
pub async fn mongo_aggregate(
    state: State<'_, AppState>,
    id: String,
    db_name: String,
    coll: String,
    pipeline_json: String,
    allow_disk_use: bool,
    max_time_ms: i64,
) -> Result<serde_json::Value, String> {
    let mc = state.mongo.must_mongo(&id).await?;
    let stages = parse_json_array(&pipeline_json)?;
    if stages.is_empty() {
        return Err("聚合管道不能为空".to_string());
    }

    let start = Instant::now();
    let c = mc.client.database(&db_name).collection::<Document>(&coll);
    let mut agg = c.aggregate(stages).allow_disk_use(allow_disk_use);
    if max_time_ms > 0 {
        agg = agg.max_time(Duration::from_millis(max_time_ms as u64));
    }
    let cur_res = agg.await;
    mc.track(start, cur_res.is_err());
    let cur = cur_res.map_err(|e| e.to_string())?;
    let raws: Vec<Document> = cur.try_collect().await.map_err(|e| e.to_string())?;
    let duration_ms = start.elapsed().as_millis() as i64;
    let documents: Vec<String> = raws.iter().map(doc_to_json).collect();
    let count = documents.len();

    serde_json::to_value(MongoFindResult {
        documents,
        count,
        total: 0,
        duration_ms,
    })
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn mongo_aggregate_explain(
    state: State<'_, AppState>,
    id: String,
    db_name: String,
    coll: String,
    pipeline_json: String,
) -> Result<String, String> {
    let mc = state.mongo.must_mongo(&id).await?;
    let stages = parse_json_array(&pipeline_json)?;
    let arr: Vec<Bson> = stages.into_iter().map(Bson::Document).collect();
    let cmd = doc! {
        "explain": {
            "aggregate": coll,
            "pipeline": arr,
            "cursor": {},
        },
        "verbosity": "queryPlanner",
    };
    let start = Instant::now();
    let res = mc.client.database(&db_name).run_command(cmd).await;
    mc.track(start, res.is_err());
    let doc_res = res.map_err(|e| e.to_string())?;
    Ok(doc_to_json(&doc_res))
}

#[tauri::command]
pub async fn mongo_run_command(
    state: State<'_, AppState>,
    id: String,
    db_name: String,
    command_json: String,
) -> Result<String, String> {
    let mc = state.mongo.must_mongo(&id).await?;
    let cmd = parse_json_doc(&command_json)?;
    if cmd.is_empty() {
        return Err("命令不能为空".to_string());
    }
    let target_db = if db_name.trim().is_empty() {
        "admin"
    } else {
        db_name.trim()
    };
    let start = Instant::now();
    let res = mc.client.database(target_db).run_command(cmd).await;
    mc.track(start, res.is_err());
    let doc_res = res.map_err(|e| e.to_string())?;
    Ok(doc_to_json(&doc_res))
}

#[tauri::command]
pub async fn mongo_transaction(
    state: State<'_, AppState>,
    id: String,
    ops: Vec<serde_json::Value>,
) -> Result<serde_json::Value, String> {
    let mc = state.mongo.must_mongo(&id).await?;
    if ops.is_empty() {
        return Err("事务中没有可执行的操作".to_string());
    }
    let parsed_ops: Vec<MongoTxOp> = ops
        .into_iter()
        .map(serde_json::from_value)
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("事务操作解析失败: {}", e))?;

    let mut session = mc
        .client
        .start_session()
        .await
        .map_err(|e| format!("开启会话失败（事务需要副本集或分片集群）: {}", e))?;

    session
        .start_transaction()
        .await
        .map_err(|e| format!("开启事务失败（事务需要副本集或分片集群）: {}", e))?;

    let start = Instant::now();
    let mut results = Vec::with_capacity(parsed_ops.len());
    let mut tx_err: Option<String> = None;

    for (i, op) in parsed_ops.into_iter().enumerate() {
        let c = mc
            .client
            .database(&op.database)
            .collection::<Document>(&op.collection);
        let mut step = serde_json::Map::new();
        step.insert("index".to_string(), serde_json::json!(i));
        step.insert("type".to_string(), serde_json::Value::String(op.op_type.clone()));

        let res: Result<(), String> = async {
            match op.op_type.to_lowercase().as_str() {
                "insert" => {
                    let doc = parse_json_doc(&op.document)
                        .map_err(|e| format!("第 {} 项 {}", i + 1, e))?;
                    let r = c
                        .insert_one(doc)
                        .session(&mut session)
                        .await
                        .map_err(|e| format!("第 {} 项插入失败: {}", i + 1, e))?;
                    step.insert(
                        "insertedId".to_string(),
                        serde_json::Value::String(doc_to_json(&doc! { "id": r.inserted_id })),
                    );
                }
                "update" | "updatemany" => {
                    let filter = parse_json_doc(&op.filter)
                        .map_err(|e| format!("第 {} 项过滤条件 {}", i + 1, e))?;
                    let update = ensure_update_operators(
                        parse_json_doc(&op.document)
                            .map_err(|e| format!("第 {} 项更新内容 {}", i + 1, e))?,
                    );
                    let r = if op.op_type.eq_ignore_ascii_case("updatemany") {
                        c.update_many(filter, update)
                            .upsert(op.upsert)
                            .session(&mut session)
                            .await
                    } else {
                        c.update_one(filter, update)
                            .upsert(op.upsert)
                            .session(&mut session)
                            .await
                    }
                    .map_err(|e| format!("第 {} 项更新失败: {}", i + 1, e))?;
                    step.insert("matched".to_string(), serde_json::json!(r.matched_count));
                    step.insert("modified".to_string(), serde_json::json!(r.modified_count));
                }
                "replace" => {
                    let filter = parse_json_doc(&op.filter)
                        .map_err(|e| format!("第 {} 项过滤条件 {}", i + 1, e))?;
                    let doc = parse_json_doc(&op.document)
                        .map_err(|e| format!("第 {} 项替换文档 {}", i + 1, e))?;
                    let r = c
                        .replace_one(filter, doc)
                        .upsert(op.upsert)
                        .session(&mut session)
                        .await
                        .map_err(|e| format!("第 {} 项替换失败: {}", i + 1, e))?;
                    step.insert("matched".to_string(), serde_json::json!(r.matched_count));
                    step.insert("modified".to_string(), serde_json::json!(r.modified_count));
                }
                "delete" | "deletemany" => {
                    let filter = parse_json_doc(&op.filter)
                        .map_err(|e| format!("第 {} 项过滤条件 {}", i + 1, e))?;
                    let r = if op.op_type.eq_ignore_ascii_case("deletemany") {
                        c.delete_many(filter).session(&mut session).await
                    } else {
                        c.delete_one(filter).session(&mut session).await
                    }
                    .map_err(|e| format!("第 {} 项删除失败: {}", i + 1, e))?;
                    step.insert("deleted".to_string(), serde_json::json!(r.deleted_count));
                }
                other => return Err(format!("第 {} 项：不支持的操作类型 {}", i + 1, other)),
            }
            Ok(())
        }
        .await;

        match res {
            Ok(()) => results.push(serde_json::Value::Object(step)),
            Err(e) => {
                tx_err = Some(e);
                break;
            }
        }
    }

    if tx_err.is_none() {
        if let Err(e) = session.commit_transaction().await {
            tx_err = Some(format!("提交事务失败: {}", e));
        }
    } else {
        let _ = session.abort_transaction().await;
    }

    mc.track(start, tx_err.is_some());
    let mut out = serde_json::json!({
        "results": results,
        "committed": tx_err.is_none(),
        "durationMs": start.elapsed().as_millis() as i64,
    });
    if let Some(err_str) = tx_err {
        out["error"] = serde_json::Value::String(err_str);
    }
    Ok(out)
}

