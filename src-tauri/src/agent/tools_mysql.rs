use crate::agent::approval::authorize_mysql_sql;
use crate::agent::model::ModelProfile;
use crate::agent::tool::{AgentTool, ToolCtx, ToolResult};
use crate::agent::tools_ssh::truncate_head_tail;
use crate::agent::types::{emit_agent_event, StepNode};
use crate::agent::AgentRuntime;
use crate::db::mysql::{is_read_query, quote_ident, MysqlManager};
use async_trait::async_trait;
use serde_json::{json, Map, Value};
use std::sync::{Arc, RwLock};
use std::time::{Duration, Instant};

const MAX_SQL_OUTPUT_BYTES: usize = 16 * 1024;
const MAX_SQL_ROWS: usize = 200;
const DEFAULT_SQL_TIMEOUT_SECS: u64 = 60;
const MAX_SQL_TIMEOUT_SECS: u64 = 300;
const MAX_CELL_CHARS: usize = 120;

fn val_to_cell_str(v: Option<&Value>) -> String {
    let raw = match v {
        None | Some(Value::Null) => "NULL".to_string(),
        Some(Value::String(s)) => s.replace('\r', "").replace('\n', " ↵ "),
        Some(Value::Bool(b)) => if *b { "true" } else { "false" }.to_string(),
        Some(Value::Number(n)) => n.to_string(),
        Some(other) => other.to_string().replace('\r', "").replace('\n', " ↵ "),
    };
    if raw.chars().count() > MAX_CELL_CHARS {
        let short: String = raw.chars().take(MAX_CELL_CHARS).collect();
        format!("{}...", short)
    } else {
        raw
    }
}

pub fn format_mysql_table(
    columns: &[String],
    rows: &[Map<String, Value>],
    total_fetched: usize,
    max_rows: usize,
) -> String {
    if columns.is_empty() {
        return "Empty set (0 rows)".to_string();
    }

    let shown_rows = if rows.len() > max_rows {
        &rows[..max_rows]
    } else {
        rows
    };

    let mut widths: Vec<usize> = columns
        .iter()
        .map(|c| c.chars().count().max(1))
        .collect();

    let mut matrix: Vec<Vec<String>> = Vec::with_capacity(shown_rows.len());
    for r in shown_rows {
        let mut line_cells = Vec::with_capacity(columns.len());
        for (i, col) in columns.iter().enumerate() {
            let cell = val_to_cell_str(r.get(col));
            let w = cell.chars().count();
            if w > widths[i] {
                widths[i] = w;
            }
            line_cells.push(cell);
        }
        matrix.push(line_cells);
    }

    let build_sep = |widths: &[usize]| -> String {
        let mut s = String::from("+");
        for w in widths {
            s.push_str(&"-".repeat(w + 2));
            s.push('+');
        }
        s
    };

    let build_row = |cells: &[String], widths: &[usize]| -> String {
        let mut s = String::from("|");
        for (i, cell) in cells.iter().enumerate() {
            let pad = widths[i].saturating_sub(cell.chars().count());
            s.push(' ');
            s.push_str(cell);
            s.push_str(&" ".repeat(pad + 1));
            s.push('|');
        }
        s
    };

    let sep = build_sep(&widths);
    let mut out = String::new();
    out.push_str(&sep);
    out.push('\n');
    out.push_str(&build_row(columns, &widths));
    out.push('\n');
    out.push_str(&sep);
    out.push('\n');

    for row_cells in &matrix {
        out.push_str(&build_row(row_cells, &widths));
        out.push('\n');
    }
    out.push_str(&sep);

    if total_fetched > shown_rows.len() {
        out.push_str(&format!(
            "\n({} rows shown, truncated at {} rows limit)",
            shown_rows.len(),
            max_rows
        ));
    } else {
        out.push_str(&format!("\n({} rows in set)", shown_rows.len()));
    }
    out
}

// ============================================================================
// mysql_schema (Fast schema exploration tool: databases / tables / table detail)
// ============================================================================

pub struct MysqlSchemaTool {
    pub server_id: String,
    pub host_label: String,
    pub mysql: Arc<MysqlManager>,
}

#[async_trait]
impl AgentTool for MysqlSchemaTool {
    fn name(&self) -> &str {
        "mysql_schema"
    }

    fn description(&self) -> &str {
        "Inspect the schema of the bound MySQL instance (read-only, no approval required): \
        1. Omit both `database` and `table` to list all databases and the current default database; \
        2. Provide `database` only to list all tables with engine, estimated rows, data size, and comments; \
        3. Provide `table` (and optional `database`) to return full columns (DESCRIBE), indexes (SHOW INDEX), and CREATE TABLE DDL."
    }

    fn parameters_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "database": {
                    "type": "string",
                    "description": "Optional target database name (omit to list databases, or use default database when `table` is provided)"
                },
                "table": {
                    "type": "string",
                    "description": "Optional target table name (returns columns, indexes, and SHOW CREATE TABLE DDL)"
                }
            }
        })
    }

    fn format_title(&self, arguments: &str) -> String {
        let args: Value = serde_json::from_str(arguments).unwrap_or_else(|_| json!({}));
        let db = args
            .get("database")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .trim();
        let tbl = args
            .get("table")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .trim();
        match (db.is_empty(), tbl.is_empty()) {
            (true, true) => format!("Inspected databases on {}", self.host_label),
            (false, true) => format!("Inspected tables in `{}` on {}", db, self.host_label),
            (true, false) => format!("Inspected table `{}` on {}", tbl, self.host_label),
            (false, false) => format!("Inspected `{}.{}` on {}", db, tbl, self.host_label),
        }
    }

    async fn execute(&self, ctx: &ToolCtx, arguments: &str) -> ToolResult {
        if ctx.cancel.is_cancelled() {
            return ToolResult::err("任务已取消");
        }
        let args: Value = serde_json::from_str(arguments).unwrap_or_else(|_| json!({}));
        let db = args
            .get("database")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .trim()
            .to_string();
        let table = args
            .get("table")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .trim()
            .to_string();

        // Case 1: List all databases
        if db.is_empty() && table.is_empty() {
            let dbs = match self.mysql.databases(&self.server_id).await {
                Ok(list) => list,
                Err(e) => return ToolResult::err(e),
            };
            let cur_db = match self
                .mysql
                .query_ex(&self.server_id, "", "SELECT DATABASE() AS db")
                .await
            {
                Ok((_c, rows)) => rows
                    .first()
                    .and_then(|r| r.get("db"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string(),
                Err(_) => String::new(),
            };
            let summary = format!(
                "共 {} 个数据库（当前默认库: {}）：{}",
                dbs.len(),
                if cur_db.is_empty() { "未指定" } else { &cur_db },
                dbs.join(", ")
            );
            return ToolResult::success(json!({
                "summary": summary,
                "currentDatabase": cur_db,
                "count": dbs.len(),
                "databases": dbs,
            }));
        }

        // Case 2: List tables in database
        if table.is_empty() {
            let status_rows = match self
                .mysql
                .query_ex(&self.server_id, &db, "SHOW TABLE STATUS")
                .await
            {
                Ok((_c, rows)) => rows,
                Err(e) => return ToolResult::err(e),
            };
            let mut tables = Vec::with_capacity(status_rows.len());
            let mut names = Vec::with_capacity(status_rows.len());
            for r in status_rows {
                let name = r
                    .get("Name")
                    .or_else(|| r.get("NAME"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                let engine = r
                    .get("Engine")
                    .or_else(|| r.get("ENGINE"))
                    .cloned()
                    .unwrap_or(Value::Null);
                let rows_est = r
                    .get("Rows")
                    .or_else(|| r.get("ROWS"))
                    .cloned()
                    .unwrap_or(Value::Null);
                let data_len = r
                    .get("Data_length")
                    .or_else(|| r.get("DATA_LENGTH"))
                    .cloned()
                    .unwrap_or(Value::Null);
                let comment = r
                    .get("Comment")
                    .or_else(|| r.get("COMMENT"))
                    .cloned()
                    .unwrap_or(Value::Null);
                if !name.is_empty() {
                    names.push(name.clone());
                }
                tables.push(json!({
                    "name": name,
                    "engine": engine,
                    "estimatedRows": rows_est,
                    "dataLength": data_len,
                    "comment": comment,
                }));
            }
            let summary = format!(
                "数据库 `{}` 下共 {} 张表：{}",
                db,
                tables.len(),
                if names.is_empty() {
                    "（空）".to_string()
                } else {
                    names.join(", ")
                }
            );
            return ToolResult::success(json!({
                "summary": summary,
                "database": db,
                "count": tables.len(),
                "tables": tables,
            }));
        }

        // Case 3: Describe specific table (columns + indexes + create table DDL)
        let columns = match self.mysql.describe(&self.server_id, &db, &table).await {
            Ok(cols) => cols,
            Err(e) => return ToolResult::err(e),
        };
        let indexes = self
            .mysql
            .indexes(&self.server_id, &db, &table)
            .await
            .unwrap_or_default();
        let create_sql = match self
            .mysql
            .query_ex(
                &self.server_id,
                &db,
                &format!("SHOW CREATE TABLE {}", quote_ident(&table)),
            )
            .await
        {
            Ok((_c, rows)) => rows
                .first()
                .and_then(|r| {
                    r.get("Create Table")
                        .or_else(|| r.get("Create View"))
                        .or_else(|| r.values().nth(1))
                })
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
            Err(_) => String::new(),
        };

        let summary = format!(
            "表 `{}`：{} 个字段，{} 条索引记录",
            if db.is_empty() {
                table.clone()
            } else {
                format!("{}.{}", db, table)
            },
            columns.len(),
            indexes.len()
        );
        ToolResult::success(json!({
            "summary": summary,
            "database": db,
            "table": table,
            "columns": columns,
            "indexes": indexes,
            "createTableDdl": create_sql,
        }))
    }
}

// ============================================================================
// mysql_sql (Unified SQL execution tool with 3-tier risk & dual-layer approval)
// ============================================================================

pub struct MysqlSqlTool {
    pub server_id: String,
    pub host_label: String,
    pub mysql: Arc<MysqlManager>,
    pub runtime: Arc<AgentRuntime>,
    pub main_profile: ModelProfile,
    pub user_goal: String,
    pub plan_summary: Arc<RwLock<String>>,
}

#[async_trait]
impl AgentTool for MysqlSqlTool {
    fn name(&self) -> &str {
        "mysql_sql"
    }

    fn description(&self) -> &str {
        "Execute a SQL statement on the bound MySQL instance (supports read-only SELECT/SHOW/EXPLAIN/DESCRIBE/WITH queries as well as INSERT/UPDATE/DELETE/CREATE/ALTER/DROP). \
        Read-only queries run automatically and return a formatted table (capped at 200 rows); modifying and destructive statements go through risk classification and approval. \
        Always accurately assess `risk_self` (read = read-only, modify = normal writes/DDL, danger = DROP/TRUNCATE/unconditional UPDATE or DELETE/privilege or global variable changes) and provide a clear `reason`."
    }

    fn parameters_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "sql": {
                    "type": "string",
                    "description": "Single SQL statement to execute"
                },
                "database": {
                    "type": "string",
                    "description": "Optional database to USE before executing the SQL (omit to use the connection's current default database)"
                },
                "reason": {
                    "type": "string",
                    "description": "Purpose and necessity of executing this SQL (shown to Main Agent and user during approval)"
                },
                "risk_self": {
                    "type": "string",
                    "enum": ["read", "modify", "danger"],
                    "description": "Self-assessed SQL risk: read (read-only query), modify (normal write/DDL), danger (high-risk destructive operation)"
                },
                "timeout_sec": {
                    "type": "integer",
                    "description": "Optional timeout in seconds (default 60, max 300)"
                }
            },
            "required": ["sql", "reason", "risk_self"]
        })
    }

    fn format_title(&self, arguments: &str) -> String {
        let args: Value = serde_json::from_str(arguments).unwrap_or_else(|_| json!({}));
        let sql = args
            .get("sql")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .split_whitespace()
            .collect::<Vec<_>>()
            .join(" ");
        if sql.is_empty() {
            format!("Executed SQL on {}", self.host_label)
        } else {
            let preview = if sql.chars().count() > 64 {
                let s: String = sql.chars().take(64).collect();
                format!("{}...", s)
            } else {
                sql
            };
            format!("Executed `{}` on {}", preview, self.host_label)
        }
    }

    fn records_own_step(&self) -> bool {
        true
    }

    async fn execute(&self, ctx: &ToolCtx, arguments: &str) -> ToolResult {
        if ctx.cancel.is_cancelled() {
            return ToolResult::err("任务已取消");
        }

        let args: Value = serde_json::from_str(arguments).unwrap_or_else(|_| json!({}));
        let sql = args
            .get("sql")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .trim()
            .to_string();
        if sql.is_empty() {
            return ToolResult::err("sql 不能为空");
        }

        let database = args
            .get("database")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .trim()
            .to_string();
        let reason = args
            .get("reason")
            .and_then(|v| v.as_str())
            .unwrap_or("执行数据库查询/操作")
            .trim()
            .to_string();
        let risk_self = args
            .get("risk_self")
            .and_then(|v| v.as_str())
            .unwrap_or("read")
            .trim()
            .to_string();
        let timeout_sec = args
            .get("timeout_sec")
            .and_then(|v| v.as_u64())
            .unwrap_or(DEFAULT_SQL_TIMEOUT_SECS)
            .clamp(1, MAX_SQL_TIMEOUT_SECS);

        let sql_display = if database.is_empty() {
            sql.clone()
        } else {
            format!("/* db: {} */ {}", database, sql)
        };

        let plan_snapshot = self
            .plan_summary
            .read()
            .map(|g| g.clone())
            .unwrap_or_default();

        if let Err(deny_err) = authorize_mysql_sql(
            &self.runtime,
            &self.main_profile,
            &self.user_goal,
            &plan_snapshot,
            &self.server_id,
            &sql_display,
            &sql,
            &reason,
            &risk_self,
            ctx,
        )
        .await
        {
            ctx.collector.push(
                &ctx.run_id,
                StepNode {
                    id: ctx.step_id.clone(),
                    run_id: ctx.run_id.clone(),
                    parent_run_id: ctx.parent_run_id.clone(),
                    agent_id: ctx.agent_id.clone(),
                    kind: "exec".to_string(),
                    title: sql_display.clone(),
                    status: if ctx.cancel.is_cancelled() {
                        "cancelled"
                    } else {
                        "failed"
                    }
                    .to_string(),
                    data: json!({
                        "command": sql_display,
                        "reason": reason,
                        "risk": risk_self,
                        "stdout": "",
                        "stderr": deny_err,
                        "exitCode": -1,
                        "truncated": false,
                    }),
                    duration_ms: 0,
                    children: Vec::new(),
                },
            );
            return ToolResult::err(deny_err);
        }

        let start = Instant::now();
        let is_read = is_read_query(&sql);

        if is_read {
            // Fetch up to MAX_SQL_ROWS + 1 to detect whether result set exceeded row cap
            let query_res = tokio::select! {
                _ = ctx.cancel.notify.notified() => {
                    Err("任务已取消".to_string())
                }
                res = self.mysql.query_ex_with_timeout_limit(
                    &self.server_id,
                    &database,
                    &sql,
                    Duration::from_secs(timeout_sec),
                    MAX_SQL_ROWS + 1,
                ) => res
            };
            let duration_ms = start.elapsed().as_millis() as u64;

            match query_res {
                Ok((cols, rows)) => {
                    let total_fetched = rows.len();
                    let row_truncated = total_fetched > MAX_SQL_ROWS;
                    let table_text =
                        format_mysql_table(&cols, &rows, total_fetched, MAX_SQL_ROWS);
                    let (stdout, byte_truncated) =
                        truncate_head_tail(&table_text, MAX_SQL_OUTPUT_BYTES);
                    let truncated = row_truncated || byte_truncated;
                    let shown_rows: Vec<Map<String, Value>> =
                        rows.into_iter().take(MAX_SQL_ROWS).collect();

                    ctx.collector.push(
                        &ctx.run_id,
                        StepNode {
                            id: ctx.step_id.clone(),
                            run_id: ctx.run_id.clone(),
                            parent_run_id: ctx.parent_run_id.clone(),
                            agent_id: ctx.agent_id.clone(),
                            kind: "exec".to_string(),
                            title: sql_display.clone(),
                            status: "completed".to_string(),
                            data: json!({
                                "command": sql_display,
                                "reason": reason,
                                "stdout": stdout,
                                "stderr": "",
                                "exitCode": 0,
                                "durationMs": duration_ms,
                                "truncated": truncated,
                            }),
                            duration_ms,
                            children: Vec::new(),
                        },
                    );

                    emit_agent_event(
                        ctx.app.as_ref(),
                        &ctx.conversation_id,
                        &ctx.run_id,
                        ctx.parent_run_id.as_deref(),
                        &ctx.agent_id,
                        "exec_output",
                        json!({
                            "stepId": ctx.step_id,
                            "command": sql_display,
                            "stdout": stdout,
                            "stderr": "",
                            "exitCode": 0,
                            "durationMs": duration_ms,
                            "truncated": truncated,
                        }),
                    );

                    ToolResult::success(json!({
                        "rowCount": shown_rows.len(),
                        "columns": cols,
                        "table": stdout,
                        "durationMs": duration_ms,
                        "truncated": truncated,
                    }))
                }
                Err(err_msg) => {
                    let status = if ctx.cancel.is_cancelled() {
                        "cancelled"
                    } else {
                        "failed"
                    };
                    ctx.collector.push(
                        &ctx.run_id,
                        StepNode {
                            id: ctx.step_id.clone(),
                            run_id: ctx.run_id.clone(),
                            parent_run_id: ctx.parent_run_id.clone(),
                            agent_id: ctx.agent_id.clone(),
                            kind: "exec".to_string(),
                            title: sql_display.clone(),
                            status: status.to_string(),
                            data: json!({
                                "command": sql_display,
                                "reason": reason,
                                "stdout": "",
                                "stderr": err_msg,
                                "exitCode": -1,
                                "durationMs": duration_ms,
                                "truncated": false,
                            }),
                            duration_ms,
                            children: Vec::new(),
                        },
                    );
                    emit_agent_event(
                        ctx.app.as_ref(),
                        &ctx.conversation_id,
                        &ctx.run_id,
                        ctx.parent_run_id.as_deref(),
                        &ctx.agent_id,
                        "exec_output",
                        json!({
                            "stepId": ctx.step_id,
                            "command": sql_display,
                            "stdout": "",
                            "stderr": err_msg,
                            "exitCode": -1,
                            "durationMs": duration_ms,
                            "truncated": false,
                        }),
                    );
                    ToolResult::err(err_msg)
                }
            }
        } else {
            let run_res = tokio::select! {
                _ = ctx.cancel.notify.notified() => {
                    Err("任务已取消".to_string())
                }
                res = tokio::time::timeout(
                    Duration::from_secs(timeout_sec),
                    self.mysql.run(&self.server_id, &database, &sql),
                ) => {
                    match res {
                        Ok(r) => r,
                        Err(_) => Err("MySQL 语句执行超时".to_string()),
                    }
                }
            };
            let duration_ms = start.elapsed().as_millis() as u64;

            match run_res {
                Ok(res) => {
                    let stdout = if res.last_insert_id > 0 {
                        format!(
                            "Query OK, {} rows affected (last_insert_id: {}, {} ms)",
                            res.affected, res.last_insert_id, duration_ms
                        )
                    } else {
                        format!("Query OK, {} rows affected ({} ms)", res.affected, duration_ms)
                    };

                    ctx.collector.push(
                        &ctx.run_id,
                        StepNode {
                            id: ctx.step_id.clone(),
                            run_id: ctx.run_id.clone(),
                            parent_run_id: ctx.parent_run_id.clone(),
                            agent_id: ctx.agent_id.clone(),
                            kind: "exec".to_string(),
                            title: sql_display.clone(),
                            status: "completed".to_string(),
                            data: json!({
                                "command": sql_display,
                                "reason": reason,
                                "stdout": stdout,
                                "stderr": "",
                                "exitCode": 0,
                                "durationMs": duration_ms,
                                "truncated": false,
                            }),
                            duration_ms,
                            children: Vec::new(),
                        },
                    );

                    emit_agent_event(
                        ctx.app.as_ref(),
                        &ctx.conversation_id,
                        &ctx.run_id,
                        ctx.parent_run_id.as_deref(),
                        &ctx.agent_id,
                        "exec_output",
                        json!({
                            "stepId": ctx.step_id,
                            "command": sql_display,
                            "stdout": stdout,
                            "stderr": "",
                            "exitCode": 0,
                            "durationMs": duration_ms,
                            "truncated": false,
                        }),
                    );

                    ToolResult::success(json!({
                        "affectedRows": res.affected,
                        "lastInsertId": res.last_insert_id,
                        "message": stdout,
                        "durationMs": duration_ms,
                    }))
                }
                Err(err_msg) => {
                    let status = if ctx.cancel.is_cancelled() {
                        "cancelled"
                    } else {
                        "failed"
                    };
                    ctx.collector.push(
                        &ctx.run_id,
                        StepNode {
                            id: ctx.step_id.clone(),
                            run_id: ctx.run_id.clone(),
                            parent_run_id: ctx.parent_run_id.clone(),
                            agent_id: ctx.agent_id.clone(),
                            kind: "exec".to_string(),
                            title: sql_display.clone(),
                            status: status.to_string(),
                            data: json!({
                                "command": sql_display,
                                "reason": reason,
                                "stdout": "",
                                "stderr": err_msg,
                                "exitCode": -1,
                                "durationMs": duration_ms,
                                "truncated": false,
                            }),
                            duration_ms,
                            children: Vec::new(),
                        },
                    );
                    emit_agent_event(
                        ctx.app.as_ref(),
                        &ctx.conversation_id,
                        &ctx.run_id,
                        ctx.parent_run_id.as_deref(),
                        &ctx.agent_id,
                        "exec_output",
                        json!({
                            "stepId": ctx.step_id,
                            "command": sql_display,
                            "stdout": "",
                            "stderr": err_msg,
                            "exitCode": -1,
                            "durationMs": duration_ms,
                            "truncated": false,
                        }),
                    );
                    ToolResult::err(err_msg)
                }
            }
        }
    }
}
