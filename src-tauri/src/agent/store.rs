use crate::agent::types::StepNode;
use crate::core::storage;
use chrono::Local;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeCitation {
    pub note_id: String,
    pub title: String,
    #[serde(default)]
    pub summary: String,
    #[serde(default)]
    pub match_type: String, // "auto" | "tool"
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeSourceRef {
    pub session_id: String,
    #[serde(default)]
    pub session_title: String,
    #[serde(default)]
    pub message_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionRecord {
    pub id: String,
    pub title: String,
    pub model_id: String,
    #[serde(default)]
    pub mode: String,
    pub web_search: bool,
    pub use_knowledge: bool,
    #[serde(default)]
    pub workspace_dir: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub message_count: usize,
    pub preview: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentMessageRecord {
    pub id: String,
    pub session_id: String,
    pub role: String, // "user" | "assistant"
    pub content: String,
    #[serde(default)]
    pub reasoning_content: String,
    #[serde(default)]
    pub steps: Vec<StepNode>,
    #[serde(default)]
    pub citations: Vec<KnowledgeCitation>,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeNote {
    pub id: String,
    pub title: String,
    #[serde(default)]
    pub summary: String,
    #[serde(default)]
    pub tags: Vec<String>,
    pub content: String,
    #[serde(default)]
    pub source_type: String, // "distill" | "import" | "manual"
    #[serde(default)]
    pub source_refs: Vec<KnowledgeSourceRef>,
    #[serde(default)]
    pub file_path: String,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeSearchHit {
    pub id: String,
    pub title: String,
    pub summary: String,
    pub tags: Vec<String>,
    pub excerpt: String,
    pub score: f64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct DistillDraft {
    pub title: String,
    pub tags: Vec<String>,
    pub summary: String,
    pub content: String,
    pub source_refs: Vec<KnowledgeSourceRef>,
}

pub struct AgentBrainStore {
    conn: Mutex<Connection>,
    knowledge_dir: PathBuf,
    fts_enabled: bool,
}

impl AgentBrainStore {
    pub fn open_default() -> Result<Self, String> {
        let _ = storage::ensure_dirs();
        let db_path = storage::agent_db_path();
        let kb_dir = storage::knowledge_dir();
        Self::open_at(db_path, kb_dir)
    }

    pub fn open_at(db_path: PathBuf, knowledge_dir: PathBuf) -> Result<Self, String> {
        if let Some(parent) = db_path.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("创建数据库目录失败 [{}]: {}", parent.display(), e))?;
        }
        fs::create_dir_all(&knowledge_dir)
            .map_err(|e| format!("创建知识库目录失败 [{}]: {}", knowledge_dir.display(), e))?;

        let conn = Connection::open(&db_path)
            .map_err(|e| format!("打开 Agent 数据库失败 [{}]: {}", db_path.display(), e))?;
        let _ = conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;");

        conn.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS agent_sessions (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                model_id TEXT NOT NULL DEFAULT '',
                web_search INTEGER NOT NULL DEFAULT 1,
                use_knowledge INTEGER NOT NULL DEFAULT 1,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS agent_messages (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                reasoning_content TEXT NOT NULL DEFAULT '',
                steps_json TEXT NOT NULL DEFAULT '[]',
                citations_json TEXT NOT NULL DEFAULT '[]',
                created_at INTEGER NOT NULL,
                FOREIGN KEY (session_id) REFERENCES agent_sessions(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_agent_messages_session ON agent_messages(session_id, created_at);

            CREATE TABLE IF NOT EXISTS knowledge_notes (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                summary TEXT NOT NULL DEFAULT '',
                tags_json TEXT NOT NULL DEFAULT '[]',
                content TEXT NOT NULL,
                source_type TEXT NOT NULL DEFAULT 'manual',
                source_refs_json TEXT NOT NULL DEFAULT '[]',
                file_path TEXT NOT NULL DEFAULT '',
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_knowledge_notes_updated ON knowledge_notes(updated_at DESC);
            "#,
        )
        .map_err(|e| format!("初始化 Agent 数据表失败: {}", e))?;

        let _ = conn.execute(
            "ALTER TABLE agent_sessions ADD COLUMN mode TEXT NOT NULL DEFAULT 'fast'",
            [],
        );
        let _ = conn.execute(
            "ALTER TABLE agent_sessions ADD COLUMN workspace_dir TEXT NOT NULL DEFAULT ''",
            [],
        );

        let fts_enabled = conn
            .execute_batch(
                r#"
                CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_fts USING fts5(
                    note_id UNINDEXED,
                    title,
                    summary,
                    tags,
                    content,
                    tokenize='unicode61'
                );
                "#,
            )
            .is_ok();

        Ok(Self {
            conn: Mutex::new(conn),
            knowledge_dir,
            fts_enabled,
        })
    }

    fn lock_conn(&self) -> Result<std::sync::MutexGuard<'_, Connection>, String> {
        self.conn
            .lock()
            .map_err(|_| "Agent 数据库锁异常".to_string())
    }

    fn note_md_path(&self, id: &str) -> PathBuf {
        let safe_id: String = id
            .chars()
            .filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_')
            .collect();
        let file_stem = if safe_id.is_empty() { "note" } else { &safe_id };
        self.knowledge_dir.join(format!("{}.md", file_stem))
    }

    fn sync_markdown_file(&self, note: &KnowledgeNote) -> Result<String, String> {
        let md_path = self.note_md_path(&note.id);
        let tags_yaml = serde_json::to_string(&note.tags).unwrap_or_else(|_| "[]".to_string());
        let title_escaped = note.title.replace('"', "\\\"");
        let summary_escaped = note.summary.replace('\n', " ").replace('"', "\\\"");
        let markdown = format!(
            "---\nid: {}\ntitle: \"{}\"\nsummary: \"{}\"\ntags: {}\nsourceType: {}\ncreatedAt: {}\nupdatedAt: {}\n---\n\n# {}\n\n{}\n",
            note.id,
            title_escaped,
            summary_escaped,
            tags_yaml,
            note.source_type,
            note.created_at,
            note.updated_at,
            note.title,
            note.content.trim_end()
        );
        storage::write_file_atomic(&md_path, markdown.as_bytes())?;
        Ok(md_path.to_string_lossy().to_string())
    }

    // ===================== Session & Message Operations =====================

    pub fn list_sessions(&self) -> Result<Vec<AgentSessionRecord>, String> {
        let conn = self.lock_conn()?;
        let mut stmt = conn
            .prepare(
                r#"
                SELECT
                    s.id,
                    s.title,
                    s.model_id,
                    s.mode,
                    s.web_search,
                    s.use_knowledge,
                    s.workspace_dir,
                    s.created_at,
                    s.updated_at,
                    (SELECT COUNT(*) FROM agent_messages m WHERE m.session_id = s.id) AS msg_cnt,
                    COALESCE((
                        SELECT m2.content FROM agent_messages m2
                        WHERE m2.session_id = s.id
                        ORDER BY m2.created_at DESC
                        LIMIT 1
                    ), '') AS last_preview
                FROM agent_sessions s
                ORDER BY s.updated_at DESC
                "#,
            )
            .map_err(|e| format!("查询会话列表失败: {}", e))?;

        let rows = stmt
            .query_map([], |row| {
                let raw_preview: String = row.get(10)?;
                Ok(AgentSessionRecord {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    model_id: row.get(2)?,
                    mode: row.get::<_, String>(3).unwrap_or_else(|_| "fast".to_string()),
                    web_search: row.get::<_, i64>(4)? != 0,
                    use_knowledge: row.get::<_, i64>(5)? != 0,
                    workspace_dir: row.get::<_, String>(6).unwrap_or_default(),
                    created_at: row.get(7)?,
                    updated_at: row.get(8)?,
                    message_count: row.get::<_, i64>(9)?.max(0) as usize,
                    preview: truncate_chars(&raw_preview.replace('\n', " "), 60),
                })
            })
            .map_err(|e| format!("读取会话记录失败: {}", e))?;

        let mut list = Vec::new();
        for item in rows {
            if let Ok(rec) = item {
                list.push(rec);
            }
        }
        Ok(list)
    }

    pub fn get_session(&self, session_id: &str) -> Result<Option<AgentSessionRecord>, String> {
        let list = self.list_sessions()?;
        Ok(list.into_iter().find(|s| s.id == session_id))
    }

    pub fn create_session(
        &self,
        title: Option<String>,
        model_id: Option<String>,
        mode: Option<String>,
        web_search: Option<bool>,
        use_knowledge: Option<bool>,
        workspace_dir: Option<String>,
    ) -> Result<AgentSessionRecord, String> {
        let now = Local::now().timestamp_millis();
        let id = Uuid::new_v4().to_string();
        let clean_title = title
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| "新对话".to_string());
        let model = model_id.unwrap_or_default();
        let clean_mode = match mode.as_deref() {
            Some("planning") => "planning".to_string(),
            _ => "fast".to_string(),
        };
        let ws = web_search.unwrap_or(true);
        let uk = use_knowledge.unwrap_or(true);
        let wd = workspace_dir
            .map(|s| s.trim().to_string())
            .unwrap_or_default();

        let conn = self.lock_conn()?;
        conn.execute(
            r#"
            INSERT INTO agent_sessions (id, title, model_id, mode, web_search, use_knowledge, workspace_dir, created_at, updated_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
            "#,
            params![
                id,
                clean_title,
                model,
                clean_mode,
                if ws { 1 } else { 0 },
                if uk { 1 } else { 0 },
                wd,
                now,
                now
            ],
        )
        .map_err(|e| format!("创建对话失败: {}", e))?;

        Ok(AgentSessionRecord {
            id,
            title: clean_title,
            model_id: model,
            mode: clean_mode,
            web_search: ws,
            use_knowledge: uk,
            workspace_dir: wd,
            created_at: now,
            updated_at: now,
            message_count: 0,
            preview: String::new(),
        })
    }

    pub fn rename_session(&self, session_id: &str, title: &str) -> Result<(), String> {
        let clean = title.trim();
        if clean.is_empty() {
            return Err("对话标题不能为空".to_string());
        }
        let now = Local::now().timestamp_millis();
        let conn = self.lock_conn()?;
        conn.execute(
            "UPDATE agent_sessions SET title = ?1, updated_at = ?2 WHERE id = ?3",
            params![clean, now, session_id],
        )
        .map_err(|e| format!("重命名对话失败: {}", e))?;
        Ok(())
    }

    pub fn update_session_prefs(
        &self,
        session_id: &str,
        model_id: Option<String>,
        mode: Option<String>,
        web_search: Option<bool>,
        use_knowledge: Option<bool>,
        workspace_dir: Option<String>,
    ) -> Result<(), String> {
        let conn = self.lock_conn()?;
        if let Some(m) = model_id {
            conn.execute(
                "UPDATE agent_sessions SET model_id = ?1 WHERE id = ?2",
                params![m, session_id],
            )
            .map_err(|e| format!("更新会话模型失败: {}", e))?;
        }
        if let Some(md) = mode {
            let clean_mode = if md == "planning" { "planning" } else { "fast" };
            conn.execute(
                "UPDATE agent_sessions SET mode = ?1 WHERE id = ?2",
                params![clean_mode, session_id],
            )
            .map_err(|e| format!("更新会话模式失败: {}", e))?;
        }
        if let Some(ws) = web_search {
            conn.execute(
                "UPDATE agent_sessions SET web_search = ?1 WHERE id = ?2",
                params![if ws { 1 } else { 0 }, session_id],
            )
            .map_err(|e| format!("更新会话搜索配置失败: {}", e))?;
        }
        if let Some(uk) = use_knowledge {
            conn.execute(
                "UPDATE agent_sessions SET use_knowledge = ?1 WHERE id = ?2",
                params![if uk { 1 } else { 0 }, session_id],
            )
            .map_err(|e| format!("更新会话知识库配置失败: {}", e))?;
        }
        if let Some(wd) = workspace_dir {
            conn.execute(
                "UPDATE agent_sessions SET workspace_dir = ?1 WHERE id = ?2",
                params![wd.trim(), session_id],
            )
            .map_err(|e| format!("更新会话工作目录失败: {}", e))?;
        }
        Ok(())
    }

    pub fn delete_session(&self, session_id: &str) -> Result<(), String> {
        let conn = self.lock_conn()?;
        conn.execute(
            "DELETE FROM agent_messages WHERE session_id = ?1",
            params![session_id],
        )
        .map_err(|e| format!("删除消息记录失败: {}", e))?;
        conn.execute(
            "DELETE FROM agent_sessions WHERE id = ?1",
            params![session_id],
        )
        .map_err(|e| format!("删除会话失败: {}", e))?;
        Ok(())
    }

    pub fn list_messages(&self, session_id: &str) -> Result<Vec<AgentMessageRecord>, String> {
        let conn = self.lock_conn()?;
        let mut stmt = conn
            .prepare(
                r#"
                SELECT id, session_id, role, content, reasoning_content, steps_json, citations_json, created_at
                FROM agent_messages
                WHERE session_id = ?1
                ORDER BY created_at ASC
                "#,
            )
            .map_err(|e| format!("查询消息记录失败: {}", e))?;

        let rows = stmt
            .query_map(params![session_id], |row| {
                let steps_json: String = row.get(5)?;
                let citations_json: String = row.get(6)?;
                Ok(AgentMessageRecord {
                    id: row.get(0)?,
                    session_id: row.get(1)?,
                    role: row.get(2)?,
                    content: row.get(3)?,
                    reasoning_content: row.get(4)?,
                    steps: serde_json::from_str(&steps_json).unwrap_or_default(),
                    citations: serde_json::from_str(&citations_json).unwrap_or_default(),
                    created_at: row.get(7)?,
                })
            })
            .map_err(|e| format!("解析消息记录失败: {}", e))?;

        let mut list = Vec::new();
        for item in rows {
            if let Ok(m) = item {
                list.push(m);
            }
        }
        Ok(list)
    }

    pub fn append_message(
        &self,
        session_id: &str,
        role: &str,
        content: &str,
        reasoning_content: &str,
        steps: &[StepNode],
        citations: &[KnowledgeCitation],
    ) -> Result<AgentMessageRecord, String> {
        let now = Local::now().timestamp_millis();
        let id = Uuid::new_v4().to_string();
        let steps_json = serde_json::to_string(steps).unwrap_or_else(|_| "[]".to_string());
        let citations_json = serde_json::to_string(citations).unwrap_or_else(|_| "[]".to_string());

        let conn = self.lock_conn()?;
        conn.execute(
            r#"
            INSERT INTO agent_messages (id, session_id, role, content, reasoning_content, steps_json, citations_json, created_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
            "#,
            params![
                id,
                session_id,
                role,
                content,
                reasoning_content,
                steps_json,
                citations_json,
                now
            ],
        )
        .map_err(|e| format!("保存消息失败: {}", e))?;

        conn.execute(
            "UPDATE agent_sessions SET updated_at = ?1 WHERE id = ?2",
            params![now, session_id],
        )
        .map_err(|e| format!("更新会话时间失败: {}", e))?;

        Ok(AgentMessageRecord {
            id,
            session_id: session_id.to_string(),
            role: role.to_string(),
            content: content.to_string(),
            reasoning_content: reasoning_content.to_string(),
            steps: steps.to_vec(),
            citations: citations.to_vec(),
            created_at: now,
        })
    }

    pub fn load_messages_by_ids(
        &self,
        message_ids: &[String],
    ) -> Result<Vec<(String, String, AgentMessageRecord)>, String> {
        if message_ids.is_empty() {
            return Ok(Vec::new());
        }
        let id_set: HashSet<&str> = message_ids.iter().map(|s| s.as_str()).collect();
        let conn = self.lock_conn()?;
        let mut stmt = conn
            .prepare(
                r#"
                SELECT m.id, m.session_id, s.title, m.role, m.content, m.reasoning_content, m.steps_json, m.citations_json, m.created_at
                FROM agent_messages m
                JOIN agent_sessions s ON s.id = m.session_id
                ORDER BY m.created_at ASC
                "#,
            )
            .map_err(|e| format!("查询选中消息失败: {}", e))?;

        let rows = stmt
            .query_map([], |row| {
                let id: String = row.get(0)?;
                let sid: String = row.get(1)?;
                let stitle: String = row.get(2)?;
                let steps_json: String = row.get(6)?;
                let citations_json: String = row.get(7)?;
                Ok((
                    sid.clone(),
                    stitle,
                    AgentMessageRecord {
                        id,
                        session_id: sid,
                        role: row.get(3)?,
                        content: row.get(4)?,
                        reasoning_content: row.get(5)?,
                        steps: serde_json::from_str(&steps_json).unwrap_or_default(),
                        citations: serde_json::from_str(&citations_json).unwrap_or_default(),
                        created_at: row.get(8)?,
                    },
                ))
            })
            .map_err(|e| format!("读取选中消息失败: {}", e))?;

        let mut out = Vec::new();
        for item in rows {
            if let Ok(pair) = item {
                if id_set.contains(pair.2.id.as_str()) {
                    out.push(pair);
                }
            }
        }
        Ok(out)
    }

    // ===================== Knowledge Base Operations =====================

    pub fn list_notes(&self, tag_filter: Option<&str>) -> Result<Vec<KnowledgeNote>, String> {
        let conn = self.lock_conn()?;
        let mut stmt = conn
            .prepare(
                r#"
                SELECT id, title, summary, tags_json, content, source_type, source_refs_json, file_path, created_at, updated_at
                FROM knowledge_notes
                ORDER BY updated_at DESC
                "#,
            )
            .map_err(|e| format!("查询知识库失败: {}", e))?;

        let rows = stmt
            .query_map([], |row| {
                let tags_json: String = row.get(3)?;
                let refs_json: String = row.get(6)?;
                Ok(KnowledgeNote {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    summary: row.get(2)?,
                    tags: serde_json::from_str(&tags_json).unwrap_or_default(),
                    content: row.get(4)?,
                    source_type: row.get(5)?,
                    source_refs: serde_json::from_str(&refs_json).unwrap_or_default(),
                    file_path: row.get(7)?,
                    created_at: row.get(8)?,
                    updated_at: row.get(9)?,
                })
            })
            .map_err(|e| format!("读取知识条目失败: {}", e))?;

        let filter_tag = tag_filter.map(|t| t.trim().to_lowercase()).filter(|t| !t.is_empty());
        let mut out = Vec::new();
        for item in rows {
            if let Ok(note) = item {
                if let Some(ref ft) = filter_tag {
                    if !note.tags.iter().any(|t| t.to_lowercase() == *ft) {
                        continue;
                    }
                }
                out.push(note);
            }
        }
        Ok(out)
    }

    pub fn get_note(&self, id: &str) -> Result<Option<KnowledgeNote>, String> {
        let conn = self.lock_conn()?;
        let mut stmt = conn
            .prepare(
                r#"
                SELECT id, title, summary, tags_json, content, source_type, source_refs_json, file_path, created_at, updated_at
                FROM knowledge_notes
                WHERE id = ?1
                "#,
            )
            .map_err(|e| format!("查询知识条目失败: {}", e))?;

        let mut rows = stmt
            .query_map(params![id], |row| {
                let tags_json: String = row.get(3)?;
                let refs_json: String = row.get(6)?;
                Ok(KnowledgeNote {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    summary: row.get(2)?,
                    tags: serde_json::from_str(&tags_json).unwrap_or_default(),
                    content: row.get(4)?,
                    source_type: row.get(5)?,
                    source_refs: serde_json::from_str(&refs_json).unwrap_or_default(),
                    file_path: row.get(7)?,
                    created_at: row.get(8)?,
                    updated_at: row.get(9)?,
                })
            })
            .map_err(|e| format!("读取知识条目失败: {}", e))?;

        if let Some(res) = rows.next() {
            res.map(Some).map_err(|e| format!("解析知识条目失败: {}", e))
        } else {
            Ok(None)
        }
    }

    pub fn save_note(&self, mut note: KnowledgeNote) -> Result<KnowledgeNote, String> {
        let now = Local::now().timestamp_millis();
        note.title = note.title.trim().to_string();
        if note.title.is_empty() {
            return Err("知识条目名称不能为空".to_string());
        }
        if note.id.trim().is_empty() {
            note.id = Uuid::new_v4().to_string();
        }
        if note.created_at <= 0 {
            note.created_at = now;
        }
        note.updated_at = now;
        if note.source_type.trim().is_empty() {
            note.source_type = "manual".to_string();
        }

        // Normalize tags (trim, deduplicate preserving order)
        let mut seen = HashSet::new();
        let mut clean_tags = Vec::new();
        for t in note.tags.drain(..) {
            let trimmed = t.trim().to_string();
            if !trimmed.is_empty() && seen.insert(trimmed.to_lowercase()) {
                clean_tags.push(trimmed);
            }
        }
        note.tags = clean_tags;

        // Auto-generate summary fallback if empty
        if note.summary.trim().is_empty() {
            let single_line = note
                .content
                .lines()
                .map(|l| l.trim())
                .filter(|l| !l.is_empty() && !l.starts_with('#'))
                .collect::<Vec<_>>()
                .join(" ");
            note.summary = truncate_chars(&single_line, 120);
        }

        let file_path = self.sync_markdown_file(&note)?;
        note.file_path = file_path;

        let tags_json = serde_json::to_string(&note.tags).unwrap_or_else(|_| "[]".to_string());
        let refs_json =
            serde_json::to_string(&note.source_refs).unwrap_or_else(|_| "[]".to_string());
        let tags_flat = note.tags.join(" ");

        let conn = self.lock_conn()?;
        conn.execute(
            r#"
            INSERT INTO knowledge_notes (id, title, summary, tags_json, content, source_type, source_refs_json, file_path, created_at, updated_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
            ON CONFLICT(id) DO UPDATE SET
                title = excluded.title,
                summary = excluded.summary,
                tags_json = excluded.tags_json,
                content = excluded.content,
                source_type = excluded.source_type,
                source_refs_json = excluded.source_refs_json,
                file_path = excluded.file_path,
                updated_at = excluded.updated_at
            "#,
            params![
                note.id,
                note.title,
                note.summary,
                tags_json,
                note.content,
                note.source_type,
                refs_json,
                note.file_path,
                note.created_at,
                note.updated_at
            ],
        )
        .map_err(|e| format!("保存知识条目失败: {}", e))?;

        if self.fts_enabled {
            let _ = conn.execute(
                "DELETE FROM knowledge_fts WHERE note_id = ?1",
                params![note.id],
            );
            let _ = conn.execute(
                "INSERT INTO knowledge_fts (note_id, title, summary, tags, content) VALUES (?1, ?2, ?3, ?4, ?5)",
                params![note.id, note.title, note.summary, tags_flat, note.content],
            );
        }

        Ok(note)
    }

    pub fn delete_note(&self, id: &str) -> Result<(), String> {
        let md_path = {
            let conn = self.lock_conn()?;
            let existing_path: Option<String> = conn
                .query_row(
                    "SELECT file_path FROM knowledge_notes WHERE id = ?1",
                    params![id],
                    |r| r.get(0),
                )
                .ok();
            conn.execute("DELETE FROM knowledge_notes WHERE id = ?1", params![id])
                .map_err(|e| format!("删除知识条目失败: {}", e))?;
            if self.fts_enabled {
                let _ = conn.execute("DELETE FROM knowledge_fts WHERE note_id = ?1", params![id]);
            }
            existing_path
        };

        if let Some(p) = md_path {
            if !p.is_empty() {
                let _ = fs::remove_file(p);
            }
        }
        let fallback_md = self.note_md_path(id);
        if fallback_md.exists() {
            let _ = fs::remove_file(fallback_md);
        }
        Ok(())
    }

    /// Hybrid FTS5 + CJK-aware multi-term search across title, tags, summary, and content.
    pub fn search_notes(
        &self,
        query: &str,
        tag_filter: Option<&str>,
        limit: usize,
    ) -> Result<Vec<KnowledgeSearchHit>, String> {
        let limit = limit.clamp(1, 50);
        let q_trim = query.trim();
        let all_notes = self.list_notes(tag_filter)?;
        if q_trim.is_empty() {
            return Ok(all_notes
                .into_iter()
                .take(limit)
                .map(|n| KnowledgeSearchHit {
                    id: n.id,
                    title: n.title,
                    summary: n.summary,
                    tags: n.tags,
                    excerpt: build_excerpt(&n.content, &[]),
                    score: 0.0,
                    updated_at: n.updated_at,
                })
                .collect());
        }

        let mut fts_scores: std::collections::HashMap<String, f64> = std::collections::HashMap::new();
        if self.fts_enabled {
            let fts_tokens: Vec<String> = q_trim
                .split_whitespace()
                .map(|w| w.replace('"', ""))
                .filter(|w| !w.is_empty())
                .map(|w| format!("\"{}\"*", w))
                .collect();
            if !fts_tokens.is_empty() {
                let fts_query = fts_tokens.join(" OR ");
                if let Ok(conn) = self.lock_conn() {
                    if let Ok(mut stmt) = conn.prepare(
                        "SELECT note_id, bm25(knowledge_fts) AS rank FROM knowledge_fts WHERE knowledge_fts MATCH ?1 ORDER BY rank LIMIT ?2",
                    ) {
                        if let Ok(rows) = stmt.query_map(params![fts_query, (limit * 3) as i64], |r| {
                            Ok((r.get::<_, String>(0)?, r.get::<_, f64>(1)?))
                        }) {
                            for (nid, rank) in rows.flatten() {
                                // bm25 returns negative values (more negative = better match)
                                fts_scores.insert(nid, (-rank).max(0.1) + 5.0);
                            }
                        }
                    }
                }
            }
        }

        let terms = extract_search_terms(q_trim);
        let q_lower = q_trim.to_lowercase();
        let mut hits: Vec<KnowledgeSearchHit> = Vec::new();

        for note in all_notes {
            let title_l = note.title.to_lowercase();
            let summary_l = note.summary.to_lowercase();
            let tags_l = note.tags.join(" ").to_lowercase();
            let content_l = note.content.to_lowercase();

            let mut score = fts_scores.get(&note.id).copied().unwrap_or(0.0);

            if title_l.contains(&q_lower) {
                score += 12.0;
            }
            if tags_l.contains(&q_lower) {
                score += 9.0;
            }
            if summary_l.contains(&q_lower) {
                score += 7.0;
            }
            if content_l.contains(&q_lower) {
                score += 5.0;
            }

            for term in &terms {
                if title_l.contains(term) {
                    score += 4.0;
                }
                if tags_l.contains(term) {
                    score += 3.0;
                }
                if summary_l.contains(term) {
                    score += 2.0;
                }
                if content_l.contains(term) {
                    score += 1.0;
                }
            }

            if score > 0.0 {
                let excerpt = build_excerpt(&note.content, &terms);
                hits.push(KnowledgeSearchHit {
                    id: note.id,
                    title: note.title,
                    summary: note.summary,
                    tags: note.tags,
                    excerpt,
                    score,
                    updated_at: note.updated_at,
                });
            }
        }

        hits.sort_by(|a, b| {
            b.score
                .partial_cmp(&a.score)
                .unwrap_or(std::cmp::Ordering::Equal)
                .then_with(|| b.updated_at.cmp(&a.updated_at))
        });
        hits.truncate(limit);
        Ok(hits)
    }
}

fn truncate_chars(text: &str, max_chars: usize) -> String {
    let trimmed = text.trim();
    if trimmed.chars().count() <= max_chars {
        return trimmed.to_string();
    }
    let prefix: String = trimmed.chars().take(max_chars).collect();
    format!("{}...", prefix.trim_end())
}

fn extract_search_terms(query: &str) -> Vec<String> {
    let mut terms = Vec::new();
    let mut seen = HashSet::new();

    for raw in query.split(|c: char| c.is_whitespace() || matches!(c, ',' | '，' | '。' | '？' | '?' | '!' | '！' | ';' | '；' | ':' | '：' | '/' | '\\' | '(' | ')' | '（' | '）')) {
        let token = raw.trim().to_lowercase();
        if token.is_empty() {
            continue;
        }
        if token.chars().count() >= 2 && seen.insert(token.clone()) {
            terms.push(token.clone());
        }
        // Extract CJK 2-grams for Chinese/Japanese/Korean phrases without spaces
        let cjk_chars: Vec<char> = token.chars().filter(|c| is_cjk(*c)).collect();
        if cjk_chars.len() >= 2 {
            for win in cjk_chars.windows(2) {
                let bg: String = win.iter().collect();
                if seen.insert(bg.clone()) {
                    terms.push(bg);
                }
            }
        }
    }
    terms
}

fn is_cjk(c: char) -> bool {
    matches!(
        c as u32,
        0x4E00..=0x9FFF | 0x3400..=0x4DBF | 0x3040..=0x30FF | 0xAC00..=0xD7AF
    )
}

fn build_excerpt(content: &str, terms: &[String]) -> String {
    let clean = content.trim();
    if clean.is_empty() {
        return String::new();
    }
    if !terms.is_empty() {
        for line in clean.lines() {
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }
            let lower = trimmed.to_lowercase();
            if terms.iter().any(|t| lower.contains(t)) {
                return truncate_chars(trimmed, 180);
            }
        }
    }
    truncate_chars(&clean.replace('\n', " "), 180)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_session_and_knowledge_crud_and_cjk_search() {
        let base = std::env::temp_dir().join(format!("xterminal_agent_test_{}", Uuid::new_v4()));
        let db_path = base.join("brain.db");
        let kb_dir = base.join("knowledge");

        let store = AgentBrainStore::open_at(db_path, kb_dir.clone()).unwrap();
        let sess = store
            .create_session(Some("测试对话".to_string()), None, Some(true), Some(true))
            .unwrap();
        store
            .append_message(&sess.id, "user", "如何配置 Redis 持久化？", "", &[], &[])
            .unwrap();

        let note = store
            .save_note(KnowledgeNote {
                title: "Redis 持久化 RDB 与 AOF 策略".to_string(),
                summary: "总结 Redis RDB 快照和 AOF 追加日志的适用场景".to_string(),
                tags: vec!["Redis".to_string(), "数据库".to_string()],
                content: "Redis 支持 RDB 和 AOF 两种持久化方式。生产环境推荐同时开启。".to_string(),
                source_type: "distill".to_string(),
                ..Default::default()
            })
            .unwrap();

        assert!(std::path::Path::new(&note.file_path).exists());

        let hits = store.search_notes("Redis持久化怎么选", None, 5).unwrap();
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].id, note.id);

        store.delete_note(&note.id).unwrap();
        assert!(!std::path::Path::new(&note.file_path).exists());
        let _ = fs::remove_dir_all(base);
    }
}
