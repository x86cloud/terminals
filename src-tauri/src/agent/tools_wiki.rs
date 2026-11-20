use crate::agent::tool::{AgentTool, ToolCtx, ToolResult};
use crate::core::storage;
use crate::wiki::commands::emit_wiki_changed;
use crate::wiki::vault::{
    append_log_entry, ingest_text_to_raw, is_wiki_writable_rel, normalize_rel_path,
    read_text_file_safe, sandbox_for_vault, MAX_WIKI_FILE_BYTES,
};
use crate::wiki::WikiManager;
use async_trait::async_trait;
use serde_json::{json, Value};
use std::fs;
use std::sync::Arc;

const MAX_TOOL_READ_BYTES: usize = 128 * 1024;

pub struct WikiIndexTool {
    pub wiki: Arc<WikiManager>,
}

#[async_trait]
impl AgentTool for WikiIndexTool {
    fn name(&self) -> &str {
        "wiki_index"
    }

    fn description(&self) -> &str {
        "Read the LLM Wiki global catalog `index.md` (with compiled page navigation) and optionally the `SCHEMA.md` maintenance specification."
    }

    fn parameters_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "include_schema": {
                    "type": "boolean",
                    "description": "Whether to also return SCHEMA.md maintenance rules (default true)"
                }
            }
        })
    }

    fn format_title(&self, _arguments: &str) -> String {
        "读取 Wiki 目录索引".to_string()
    }

    async fn execute(&self, _ctx: &ToolCtx, arguments: &str) -> ToolResult {
        let args: Value = serde_json::from_str(arguments).unwrap_or_else(|_| json!({}));
        let include_schema = args
            .get("include_schema")
            .and_then(|v| v.as_bool())
            .unwrap_or(true);

        let (root, _) = match self.wiki.resolve_vault() {
            Ok(v) => v,
            Err(e) => return ToolResult::err(e),
        };
        let _ = self.wiki.db().sync_vault(&root, false);

        let index_content = fs::read_to_string(root.join("index.md")).unwrap_or_default();
        let schema_content = if include_schema {
            fs::read_to_string(root.join("SCHEMA.md")).unwrap_or_default()
        } else {
            String::new()
        };

        ToolResult::success(json!({
            "index": index_content,
            "schema": if include_schema { Some(schema_content) } else { None },
        }))
    }
}

pub struct WikiSearchTool {
    pub wiki: Arc<WikiManager>,
}

#[async_trait]
impl AgentTool for WikiSearchTool {
    fn name(&self) -> &str {
        "wiki_search"
    }

    fn description(&self) -> &str {
        "Full-text search across compiled pages (`wiki/`) and raw sources (`raw/`) in the LLM Wiki knowledge base using SQLite FTS5."
    }

    fn parameters_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Search keywords"
                },
                "scope": {
                    "type": "string",
                    "enum": ["wiki", "raw", "all"],
                    "description": "Search scope (default all)"
                },
                "limit": {
                    "type": "integer",
                    "description": "Maximum number of hits to return (default 10, max 50)"
                }
            },
            "required": ["query"]
        })
    }

    fn format_title(&self, arguments: &str) -> String {
        let args: Value = serde_json::from_str(arguments).unwrap_or_else(|_| json!({}));
        let q = args.get("query").and_then(|v| v.as_str()).unwrap_or("").trim();
        if q.is_empty() {
            "搜索 Wiki 知识库".to_string()
        } else {
            format!("搜索 Wiki: {}", q)
        }
    }

    async fn execute(&self, _ctx: &ToolCtx, arguments: &str) -> ToolResult {
        let args: Value = serde_json::from_str(arguments).unwrap_or_else(|_| json!({}));
        let query = args.get("query").and_then(|v| v.as_str()).unwrap_or("");
        let scope = args.get("scope").and_then(|v| v.as_str()).unwrap_or("all");
        let limit = args
            .get("limit")
            .and_then(|v| v.as_u64())
            .unwrap_or(10)
            .clamp(1, 50) as usize;

        let (root, _) = match self.wiki.resolve_vault() {
            Ok(v) => v,
            Err(e) => return ToolResult::err(e),
        };
        match self.wiki.db().search(&root, query, scope, limit) {
            Ok(hits) => ToolResult::success(json!({ "hits": hits })),
            Err(e) => ToolResult::err(e),
        }
    }
}

pub struct WikiReadTool {
    pub wiki: Arc<WikiManager>,
}

#[async_trait]
impl AgentTool for WikiReadTool {
    fn name(&self) -> &str {
        "wiki_read"
    }

    fn description(&self) -> &str {
        "Read the Markdown content (with line numbers) of a specified Wiki page or raw source, along with its outbound links and backlinks."
    }

    fn parameters_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Path relative to the Wiki root, e.g. wiki/runbooks/nginx-502.md or raw/2026-11-19-log.md"
                },
                "start_line": {
                    "type": "integer",
                    "description": "Optional 1-based start line number"
                },
                "end_line": {
                    "type": "integer",
                    "description": "Optional 1-based end line number"
                }
            },
            "required": ["path"]
        })
    }

    fn format_title(&self, arguments: &str) -> String {
        let args: Value = serde_json::from_str(arguments).unwrap_or_else(|_| json!({}));
        let p = args.get("path").and_then(|v| v.as_str()).unwrap_or("").trim();
        if p.is_empty() {
            "读取 Wiki 页面".to_string()
        } else {
            format!("读取 Wiki: {}", p)
        }
    }

    async fn execute(&self, _ctx: &ToolCtx, arguments: &str) -> ToolResult {
        let args: Value = serde_json::from_str(arguments).unwrap_or_else(|_| json!({}));
        let rel_req = args.get("path").and_then(|v| v.as_str()).unwrap_or("");
        let start_line = args
            .get("start_line")
            .and_then(|v| v.as_u64())
            .map(|v| v.max(1) as usize);
        let end_line = args
            .get("end_line")
            .and_then(|v| v.as_u64())
            .map(|v| v.max(1) as usize);

        let (root, _) = match self.wiki.resolve_vault() {
            Ok(v) => v,
            Err(e) => return ToolResult::err(e),
        };
        let _ = self.wiki.db().sync_vault(&root, false);

        let sandbox = match sandbox_for_vault(&root) {
            Ok(s) => s,
            Err(e) => return ToolResult::err(e),
        };
        let (clean_rel, abs) = match sandbox.resolve_existing(rel_req, false) {
            Ok(v) => v,
            Err(e) => return ToolResult::err(e),
        };
        let full_text = match read_text_file_safe(&abs) {
            Ok(t) => t,
            Err(e) => return ToolResult::err(e),
        };

        let all_lines: Vec<&str> = full_text.lines().collect();
        let total_lines = all_lines.len();
        let s_idx = start_line.map(|n| n.saturating_sub(1)).unwrap_or(0);
        let e_idx = end_line
            .map(|n| n.min(total_lines))
            .unwrap_or(total_lines);

        let mut snippet = String::new();
        let mut truncated = false;
        if s_idx < e_idx {
            for (offset, line) in all_lines[s_idx..e_idx].iter().enumerate() {
                let formatted = format!("{:>4} | {}\n", s_idx + offset + 1, line);
                if snippet.len() + formatted.len() > MAX_TOOL_READ_BYTES {
                    truncated = true;
                    break;
                }
                snippet.push_str(&formatted);
            }
        }

        let (outbound, backlinks) = self
            .wiki
            .db()
            .get_links_for_page(&root, &clean_rel)
            .unwrap_or_default();

        ToolResult::success(json!({
            "path": clean_rel,
            "totalLines": total_lines,
            "truncated": truncated,
            "content": snippet,
            "outboundLinks": outbound,
            "backlinks": backlinks,
        }))
    }
}

pub struct WikiWriteTool {
    pub wiki: Arc<WikiManager>,
}

#[async_trait]
impl AgentTool for WikiWriteTool {
    fn name(&self) -> &str {
        "wiki_write"
    }

    fn description(&self) -> &str {
        "Create or update a `wiki/**/*.md` page, `index.md`, or `log.md` (modifying read-only `raw/` or `SCHEMA.md` is forbidden). Automatically updates FTS5 full-text index and bidirectional links."
    }

    fn parameters_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Target relative path, e.g. wiki/runbooks/nginx-502.md or index.md"
                },
                "content": {
                    "type": "string",
                    "description": "Full Markdown content (include YAML frontmatter and [[wikilinks]] where appropriate)"
                },
                "mode": {
                    "type": "string",
                    "enum": ["overwrite", "append"],
                    "description": "Write mode: overwrite (default) or append"
                },
                "log_action": {
                    "type": "string",
                    "description": "Optional action tag automatically appended to log.md when writing a wiki/ page, e.g. ingest / update / lint"
                },
                "log_summary": {
                    "type": "string",
                    "description": "Optional one-line change summary automatically appended to log.md"
                }
            },
            "required": ["path", "content"]
        })
    }

    fn format_title(&self, arguments: &str) -> String {
        let args: Value = serde_json::from_str(arguments).unwrap_or_else(|_| json!({}));
        let p = args.get("path").and_then(|v| v.as_str()).unwrap_or("").trim();
        if p.is_empty() {
            "更新 Wiki 词条".to_string()
        } else {
            format!("写入 Wiki: {}", p)
        }
    }

    async fn execute(&self, ctx: &ToolCtx, arguments: &str) -> ToolResult {
        let args: Value = serde_json::from_str(arguments).unwrap_or_else(|_| json!({}));
        let path_req = args.get("path").and_then(|v| v.as_str()).unwrap_or("");
        let content = args.get("content").and_then(|v| v.as_str()).unwrap_or("");
        let mode = args.get("mode").and_then(|v| v.as_str()).unwrap_or("overwrite");
        let log_action = args
            .get("log_action")
            .and_then(|v| v.as_str())
            .unwrap_or("update");
        let log_summary = args
            .get("log_summary")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .trim();

        let clean_req = normalize_rel_path(path_req);
        if !is_wiki_writable_rel(&clean_req, false) {
            return ToolResult::err(
                "安全拦截：wiki_write 仅允许写入 wiki/**/*.md、index.md 或 log.md，禁止改写 raw/ 或 SCHEMA.md",
            );
        }
        if content.len() > MAX_WIKI_FILE_BYTES {
            return ToolResult::err("写入内容超出 2MB 上限");
        }

        let (root, _) = match self.wiki.resolve_vault() {
            Ok(v) => v,
            Err(e) => return ToolResult::err(e),
        };

        let result_path = {
            let _guard = match self.wiki.lock_io() {
                Ok(g) => g,
                Err(e) => return ToolResult::err(e),
            };
            let sandbox = match sandbox_for_vault(&root) {
                Ok(s) => s,
                Err(e) => return ToolResult::err(e),
            };
            let (clean_rel, abs, existed) = match sandbox.resolve_for_write(&clean_req) {
                Ok(v) => v,
                Err(e) => return ToolResult::err(e),
            };

            let final_content = if mode == "append" && existed {
                let prev = fs::read_to_string(&abs).unwrap_or_default();
                if prev.ends_with('\n') || prev.is_empty() {
                    format!("{}{}", prev, content)
                } else {
                    format!("{}\n{}", prev, content)
                }
            } else {
                content.to_string()
            };

            if final_content.len() > MAX_WIKI_FILE_BYTES {
                return ToolResult::err("追加后文件体积超出 2MB 上限");
            }
            if let Err(e) = storage::write_file_atomic(&abs, final_content.as_bytes()) {
                return ToolResult::err(e);
            }
            if let Err(e) = self
                .wiki
                .db()
                .upsert_single_page(&root, &clean_rel, &final_content)
            {
                return ToolResult::err(e);
            }

            if clean_rel.starts_with("wiki/") && !log_summary.is_empty() {
                if let Err(e) = append_log_entry(&root, log_action, &clean_rel, log_summary) {
                    return ToolResult::err(e);
                }
                if let Ok(log_text) = fs::read_to_string(root.join("log.md")) {
                    let _ = self.wiki.db().upsert_single_page(&root, "log.md", &log_text);
                }
            }

            clean_rel
        };

        if let Some(ref app) = ctx.app {
            emit_wiki_changed(app, "agent_write", Some(&result_path));
        }

        ToolResult::success(json!({
            "path": result_path,
            "mode": mode,
            "bytes": content.len(),
        }))
    }
}

pub struct WikiIngestRawTool {
    pub wiki: Arc<WikiManager>,
}

#[async_trait]
impl AgentTool for WikiIngestRawTool {
    fn name(&self) -> &str {
        "wiki_ingest_raw"
    }

    fn description(&self) -> &str {
        "Archive high-value raw text or session findings verbatim into the read-only `raw/` directory (which can then be compiled into `wiki/` via `wiki_write`)."
    }

    fn parameters_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "title": {
                    "type": "string",
                    "description": "Title of the raw source document"
                },
                "content": {
                    "type": "string",
                    "description": "Body content of the raw source"
                },
                "source_label": {
                    "type": "string",
                    "description": "Source label, e.g. agent-session / web / note"
                }
            },
            "required": ["title", "content"]
        })
    }

    fn format_title(&self, arguments: &str) -> String {
        let args: Value = serde_json::from_str(arguments).unwrap_or_else(|_| json!({}));
        let t = args.get("title").and_then(|v| v.as_str()).unwrap_or("").trim();
        if t.is_empty() {
            "归档原始资料到 raw/".to_string()
        } else {
            format!("归档原始资料: {}", t)
        }
    }

    async fn execute(&self, ctx: &ToolCtx, arguments: &str) -> ToolResult {
        let args: Value = serde_json::from_str(arguments).unwrap_or_else(|_| json!({}));
        let title = args.get("title").and_then(|v| v.as_str()).unwrap_or("");
        let content = args.get("content").and_then(|v| v.as_str()).unwrap_or("");
        let source_label = args
            .get("source_label")
            .and_then(|v| v.as_str())
            .unwrap_or("agent-session");

        let (root, _) = match self.wiki.resolve_vault() {
            Ok(v) => v,
            Err(e) => return ToolResult::err(e),
        };

        let res = {
            let _guard = match self.wiki.lock_io() {
                Ok(g) => g,
                Err(e) => return ToolResult::err(e),
            };
            let out = match ingest_text_to_raw(&root, title, content, source_label, None) {
                Ok(r) => r,
                Err(e) => return ToolResult::err(e),
            };
            let full = fs::read_to_string(root.join(&out.rel_path)).unwrap_or_default();
            let _ = self.wiki.db().upsert_single_page(&root, &out.rel_path, &full);
            out
        };

        if let Some(ref app) = ctx.app {
            emit_wiki_changed(app, "agent_ingest_raw", Some(&res.rel_path));
        }

        ToolResult::success(json!(res))
    }
}

pub struct WikiLintTool {
    pub wiki: Arc<WikiManager>,
}

#[async_trait]
impl AgentTool for WikiLintTool {
    fn name(&self) -> &str {
        "wiki_lint"
    }

    fn description(&self) -> &str {
        "Run a deterministic health check on the LLM Wiki knowledge base, reporting broken links, orphan pages, unindexed wiki pages, stale index links, and uncompiled raw sources."
    }

    fn parameters_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {}
        })
    }

    fn format_title(&self, _arguments: &str) -> String {
        "巡检 Wiki 健康状态".to_string()
    }

    async fn execute(&self, _ctx: &ToolCtx, _arguments: &str) -> ToolResult {
        let (root, _) = match self.wiki.resolve_vault() {
            Ok(v) => v,
            Err(e) => return ToolResult::err(e),
        };
        match self.wiki.db().lint_vault(&root) {
            Ok(report) => ToolResult::success(json!(report)),
            Err(e) => ToolResult::err(e),
        }
    }
}
