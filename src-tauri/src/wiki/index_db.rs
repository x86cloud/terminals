use crate::wiki::vault::{
    collect_vault_files, parse_wiki_page, read_text_file_safe, strip_win_verbatim,
};
use crate::wiki::{
    WikiBrokenLink, WikiGraphData, WikiGraphEdge, WikiGraphNode, WikiInfo, WikiLinkRef,
    WikiLintReport, WikiSearchHit, WikiTreeNode,
};
use chrono::Local;
use rusqlite::{params, Connection};
use std::collections::{BTreeMap, HashMap, HashSet};
use std::fs;
use std::path::Path;
use std::sync::Mutex;
use std::time::UNIX_EPOCH;

pub struct WikiIndexDb {
    conn: Mutex<Connection>,
}

#[derive(Clone)]
struct CachedPageMeta {
    rel_path: String,
    title: String,
}

impl WikiIndexDb {
    pub fn open_at(db_path: std::path::PathBuf) -> Result<Self, String> {
        if let Some(parent) = db_path.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("创建 Wiki 缓存目录失败: {}", e))?;
        }
        let conn = Connection::open(&db_path)
            .map_err(|e| format!("打开 Wiki 缓存数据库失败: {}", e))?;
        let _ = conn.execute_batch("PRAGMA journal_mode=WAL;");

        conn.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS wiki_pages (
                vault_root TEXT NOT NULL,
                rel_path TEXT NOT NULL,
                title TEXT NOT NULL,
                category TEXT NOT NULL,
                tags_json TEXT NOT NULL,
                sources_json TEXT NOT NULL,
                summary TEXT NOT NULL,
                updated TEXT NOT NULL,
                mtime_ms INTEGER NOT NULL,
                byte_size INTEGER NOT NULL,
                PRIMARY KEY (vault_root, rel_path)
            );

            CREATE TABLE IF NOT EXISTS wiki_links (
                vault_root TEXT NOT NULL,
                source_path TEXT NOT NULL,
                target_raw TEXT NOT NULL,
                target_path TEXT NOT NULL DEFAULT ''
            );

            CREATE INDEX IF NOT EXISTS idx_wiki_links_src
                ON wiki_links (vault_root, source_path);
            CREATE INDEX IF NOT EXISTS idx_wiki_links_tgt
                ON wiki_links (vault_root, target_path);

            CREATE VIRTUAL TABLE IF NOT EXISTS wiki_fts USING fts5(
                vault_root UNINDEXED,
                rel_path UNINDEXED,
                title,
                tags,
                body,
                tokenize='unicode61'
            );
            "#,
        )
        .map_err(|e| format!("初始化 Wiki 索引表失败: {}", e))?;

        Ok(Self {
            conn: Mutex::new(conn),
        })
    }

    fn lock_conn(&self) -> Result<std::sync::MutexGuard<'_, Connection>, String> {
        self.conn
            .lock()
            .map_err(|_| "Wiki 索引数据库锁异常".to_string())
    }

    fn vault_key(root: &Path) -> String {
        strip_win_verbatim(root)
    }

    fn file_mtime_size(path: &Path) -> (i64, i64) {
        let Ok(meta) = fs::metadata(path) else {
            return (0, 0);
        };
        let mtime = meta
            .modified()
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as i64)
            .unwrap_or(0);
        (mtime, meta.len() as i64)
    }

    pub fn sync_vault(&self, root: &Path, force: bool) -> Result<(), String> {
        let vkey = Self::vault_key(root);
        let disk_files = collect_vault_files(root);
        let disk_set: HashSet<String> = disk_files.iter().cloned().collect();

        let mut conn = self.lock_conn()?;
        let mut cached: HashMap<String, (i64, i64)> = HashMap::new();
        {
            let mut stmt = conn
                .prepare("SELECT rel_path, mtime_ms, byte_size FROM wiki_pages WHERE vault_root = ?1")
                .map_err(|e| e.to_string())?;
            let rows = stmt
                .query_map(params![&vkey], |r| {
                    Ok((r.get::<_, String>(0)?, (r.get::<_, i64>(1)?, r.get::<_, i64>(2)?)))
                })
                .map_err(|e| e.to_string())?;
            for r in rows.flatten() {
                cached.insert(r.0, r.1);
            }
        }

        let tx = conn.transaction().map_err(|e| e.to_string())?;
        let mut dirty = force;

        for old_rel in cached.keys() {
            if !disk_set.contains(old_rel) {
                tx.execute(
                    "DELETE FROM wiki_pages WHERE vault_root = ?1 AND rel_path = ?2",
                    params![&vkey, old_rel],
                )
                .map_err(|e| e.to_string())?;
                tx.execute(
                    "DELETE FROM wiki_links WHERE vault_root = ?1 AND source_path = ?2",
                    params![&vkey, old_rel],
                )
                .map_err(|e| e.to_string())?;
                tx.execute(
                    "DELETE FROM wiki_fts WHERE vault_root = ?1 AND rel_path = ?2",
                    params![&vkey, old_rel],
                )
                .map_err(|e| e.to_string())?;
                dirty = true;
            }
        }

        for rel in &disk_files {
            let full = root.join(rel);
            let (mtime_ms, byte_size) = Self::file_mtime_size(&full);
            if !force {
                if let Some((cm, cs)) = cached.get(rel) {
                    if *cm == mtime_ms && *cs == byte_size {
                        continue;
                    }
                }
            }
            if let Ok(raw_text) = read_text_file_safe(&full) {
                Self::index_page_in_tx(&tx, &vkey, rel, &raw_text, mtime_ms, byte_size)?;
                dirty = true;
            }
        }

        if dirty {
            Self::resolve_links_in_tx(&tx, &vkey)?;
        }
        tx.commit().map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn upsert_single_page(&self, root: &Path, rel_path: &str, content: &str) -> Result<(), String> {
        let vkey = Self::vault_key(root);
        let full = root.join(rel_path);
        let (mtime_ms, byte_size) = Self::file_mtime_size(&full);
        let mut conn = self.lock_conn()?;
        let tx = conn.transaction().map_err(|e| e.to_string())?;
        Self::index_page_in_tx(&tx, &vkey, rel_path, content, mtime_ms, byte_size)?;
        Self::resolve_links_in_tx(&tx, &vkey)?;
        tx.commit().map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn remove_single_page(&self, root: &Path, rel_path: &str) -> Result<(), String> {
        let vkey = Self::vault_key(root);
        let mut conn = self.lock_conn()?;
        let tx = conn.transaction().map_err(|e| e.to_string())?;
        tx.execute(
            "DELETE FROM wiki_pages WHERE vault_root = ?1 AND rel_path = ?2",
            params![&vkey, rel_path],
        )
        .map_err(|e| e.to_string())?;
        tx.execute(
            "DELETE FROM wiki_links WHERE vault_root = ?1 AND source_path = ?2",
            params![&vkey, rel_path],
        )
        .map_err(|e| e.to_string())?;
        tx.execute(
            "DELETE FROM wiki_fts WHERE vault_root = ?1 AND rel_path = ?2",
            params![&vkey, rel_path],
        )
        .map_err(|e| e.to_string())?;
        Self::resolve_links_in_tx(&tx, &vkey)?;
        tx.commit().map_err(|e| e.to_string())?;
        Ok(())
    }

    fn index_page_in_tx(
        tx: &rusqlite::Transaction<'_>,
        vkey: &str,
        rel_path: &str,
        raw_content: &str,
        mtime_ms: i64,
        byte_size: i64,
    ) -> Result<(), String> {
        let parsed = parse_wiki_page(rel_path, raw_content);
        let tags_json = serde_json::to_string(&parsed.tags).unwrap_or_else(|_| "[]".to_string());
        let sources_json = serde_json::to_string(&parsed.sources).unwrap_or_else(|_| "[]".to_string());

        tx.execute(
            r#"
            INSERT INTO wiki_pages (vault_root, rel_path, title, category, tags_json, sources_json, summary, updated, mtime_ms, byte_size)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
            ON CONFLICT(vault_root, rel_path) DO UPDATE SET
                title = excluded.title,
                category = excluded.category,
                tags_json = excluded.tags_json,
                sources_json = excluded.sources_json,
                summary = excluded.summary,
                updated = excluded.updated,
                mtime_ms = excluded.mtime_ms,
                byte_size = excluded.byte_size
            "#,
            params![
                vkey,
                rel_path,
                parsed.title,
                parsed.category,
                tags_json,
                sources_json,
                parsed.summary,
                parsed.updated,
                mtime_ms,
                byte_size
            ],
        )
        .map_err(|e| e.to_string())?;

        tx.execute(
            "DELETE FROM wiki_fts WHERE vault_root = ?1 AND rel_path = ?2",
            params![vkey, rel_path],
        )
        .map_err(|e| e.to_string())?;
        tx.execute(
            "INSERT INTO wiki_fts (vault_root, rel_path, title, tags, body) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![
                vkey,
                rel_path,
                parsed.title,
                parsed.tags.join(" "),
                parsed.body
            ],
        )
        .map_err(|e| e.to_string())?;

        tx.execute(
            "DELETE FROM wiki_links WHERE vault_root = ?1 AND source_path = ?2",
            params![vkey, rel_path],
        )
        .map_err(|e| e.to_string())?;
        for raw_link in &parsed.links {
            tx.execute(
                "INSERT INTO wiki_links (vault_root, source_path, target_raw, target_path) VALUES (?1, ?2, ?3, '')",
                params![vkey, rel_path, raw_link],
            )
            .map_err(|e| e.to_string())?;
        }
        Ok(())
    }

    fn resolve_target_rel(pages: &[CachedPageMeta], raw_target: &str) -> String {
        let clean = raw_target
            .trim()
            .replace('\\', "/")
            .trim_start_matches("./")
            .to_string();
        if clean.is_empty() {
            return String::new();
        }
        let lower = clean.to_lowercase();
        let lower_md = if lower.ends_with(".md") {
            lower.clone()
        } else {
            format!("{}.md", lower)
        };

        // 1. Exact path match
        if let Some(p) = pages
            .iter()
            .find(|p| p.rel_path.to_lowercase() == lower || p.rel_path.to_lowercase() == lower_md)
        {
            return p.rel_path.clone();
        }

        // 2. Relative under wiki/
        let wiki_prefixed = format!("wiki/{}", lower_md);
        if let Some(p) = pages
            .iter()
            .find(|p| p.rel_path.to_lowercase() == wiki_prefixed)
        {
            return p.rel_path.clone();
        }

        // 3. Basename (stem) or title match
        if let Some(p) = pages.iter().find(|p| {
            let stem = Path::new(&p.rel_path)
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("")
                .to_lowercase();
            stem == lower || p.title.to_lowercase() == lower
        }) {
            return p.rel_path.clone();
        }

        String::new()
    }

    fn resolve_links_in_tx(tx: &rusqlite::Transaction<'_>, vkey: &str) -> Result<(), String> {
        let mut pages = Vec::new();
        {
            let mut stmt = tx
                .prepare("SELECT rel_path, title FROM wiki_pages WHERE vault_root = ?1")
                .map_err(|e| e.to_string())?;
            let rows = stmt
                .query_map(params![vkey], |r| {
                    Ok(CachedPageMeta {
                        rel_path: r.get(0)?,
                        title: r.get(1)?,
                    })
                })
                .map_err(|e| e.to_string())?;
            for r in rows.flatten() {
                pages.push(r);
            }
        }

        let mut link_rows: Vec<(i64, String)> = Vec::new();
        {
            let mut stmt = tx
                .prepare("SELECT rowid, target_raw FROM wiki_links WHERE vault_root = ?1")
                .map_err(|e| e.to_string())?;
            let rows = stmt
                .query_map(params![vkey], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?)))
                .map_err(|e| e.to_string())?;
            for r in rows.flatten() {
                link_rows.push(r);
            }
        }

        for (rowid, raw) in link_rows {
            let resolved = Self::resolve_target_rel(&pages, &raw);
            tx.execute(
                "UPDATE wiki_links SET target_path = ?1 WHERE rowid = ?2",
                params![resolved, rowid],
            )
            .map_err(|e| e.to_string())?;
        }
        Ok(())
    }

    pub fn get_info(&self, root: &Path, is_custom_dir: bool) -> Result<WikiInfo, String> {
        self.sync_vault(root, false)?;
        let vkey = Self::vault_key(root);
        let conn = self.lock_conn()?;
        let wiki_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM wiki_pages WHERE vault_root = ?1 AND rel_path LIKE 'wiki/%'",
                params![&vkey],
                |r| r.get(0),
            )
            .unwrap_or(0);
        let raw_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM wiki_pages WHERE vault_root = ?1 AND rel_path LIKE 'raw/%'",
                params![&vkey],
                |r| r.get(0),
            )
            .unwrap_or(0);
        let link_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM wiki_links WHERE vault_root = ?1 AND target_path != ''",
                params![&vkey],
                |r| r.get(0),
            )
            .unwrap_or(0);

        Ok(WikiInfo {
            vault_root: vkey,
            is_custom_dir,
            wiki_count: wiki_count.max(0) as usize,
            raw_count: raw_count.max(0) as usize,
            link_count: link_count.max(0) as usize,
            updated_at: Local::now().timestamp_millis(),
        })
    }

    pub fn list_tree(&self, root: &Path) -> Result<Vec<WikiTreeNode>, String> {
        self.sync_vault(root, false)?;
        let vkey = Self::vault_key(root);
        let conn = self.lock_conn()?;

        let mut stmt = conn
            .prepare(
                "SELECT rel_path, title, category FROM wiki_pages WHERE vault_root = ?1 ORDER BY rel_path ASC",
            )
            .map_err(|e| e.to_string())?;
        let mut entries: Vec<(String, String, String)> = stmt
            .query_map(params![&vkey], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
            .map_err(|e| e.to_string())?
            .flatten()
            .collect();

        // Sort root docs in fixed order, then wiki/, then raw/
        let rank = |p: &str| -> (u8, String) {
            match p {
                "index.md" => (0, p.to_string()),
                "log.md" => (1, p.to_string()),
                "SCHEMA.md" => (2, p.to_string()),
                _ if p.starts_with("wiki/") => (3, p.to_lowercase()),
                _ if p.starts_with("raw/") => (4, p.to_lowercase()),
                _ => (5, p.to_lowercase()),
            }
        };
        entries.sort_by(|a, b| rank(&a.0).cmp(&rank(&b.0)));

        let mut tree: Vec<WikiTreeNode> = Vec::new();
        let mut wiki_dirs: BTreeMap<String, Vec<WikiTreeNode>> = BTreeMap::new();
        let mut wiki_root_files: Vec<WikiTreeNode> = Vec::new();
        let mut raw_files: Vec<WikiTreeNode> = Vec::new();

        for (rel, title, category) in entries {
            let file_name = Path::new(&rel)
                .file_name()
                .and_then(|s| s.to_str())
                .unwrap_or(&rel)
                .to_string();
            let node = WikiTreeNode {
                id: rel.clone(),
                name: file_name.clone(),
                rel_path: rel.clone(),
                kind: "file".to_string(),
                category,
                title,
                children: Vec::new(),
            };

            if rel == "index.md" || rel == "log.md" || rel == "SCHEMA.md" {
                tree.push(node);
            } else if let Some(rest) = rel.strip_prefix("wiki/") {
                if let Some((dir, _)) = rest.split_once('/') {
                    wiki_dirs.entry(dir.to_string()).or_default().push(node);
                } else {
                    wiki_root_files.push(node);
                }
            } else if rel.starts_with("raw/") {
                raw_files.push(node);
            } else {
                tree.push(node);
            }
        }

        // Ensure standard wiki subdirectories exist in tree even if empty
        for std_dir in ["entities", "concepts", "runbooks", "summaries"] {
            wiki_dirs.entry(std_dir.to_string()).or_default();
        }

        let mut wiki_children = Vec::new();
        for (dir, children) in wiki_dirs {
            let dir_rel = format!("wiki/{}", dir);
            wiki_children.push(WikiTreeNode {
                id: dir_rel.clone(),
                name: dir.clone(),
                rel_path: dir_rel,
                kind: "dir".to_string(),
                category: dir,
                title: String::new(),
                children,
            });
        }
        wiki_children.extend(wiki_root_files);

        tree.push(WikiTreeNode {
            id: "wiki".to_string(),
            name: "wiki".to_string(),
            rel_path: "wiki".to_string(),
            kind: "dir".to_string(),
            category: "wiki".to_string(),
            title: "Wiki".to_string(),
            children: wiki_children,
        });

        tree.push(WikiTreeNode {
            id: "raw".to_string(),
            name: "raw".to_string(),
            rel_path: "raw".to_string(),
            kind: "dir".to_string(),
            category: "raw".to_string(),
            title: "Raw".to_string(),
            children: raw_files,
        });

        Ok(tree)
    }

    pub fn get_links_for_page(
        &self,
        root: &Path,
        rel_path: &str,
    ) -> Result<(Vec<WikiLinkRef>, Vec<WikiLinkRef>), String> {
        let vkey = Self::vault_key(root);
        let conn = self.lock_conn()?;

        let mut out_stmt = conn
            .prepare(
                r#"
                SELECT l.target_raw, l.target_path, COALESCE(p.title, '')
                FROM wiki_links l
                LEFT JOIN wiki_pages p
                    ON p.vault_root = l.vault_root AND p.rel_path = l.target_path
                WHERE l.vault_root = ?1 AND l.source_path = ?2
                "#,
            )
            .map_err(|e| e.to_string())?;
        let outbound: Vec<WikiLinkRef> = out_stmt
            .query_map(params![&vkey, rel_path], |r| {
                let raw: String = r.get(0)?;
                let target_path: String = r.get(1)?;
                let title: String = r.get(2)?;
                Ok(WikiLinkRef {
                    broken: target_path.is_empty(),
                    rel_path: target_path,
                    title: if title.is_empty() { raw.clone() } else { title },
                    raw,
                })
            })
            .map_err(|e| e.to_string())?
            .flatten()
            .collect();

        let mut back_stmt = conn
            .prepare(
                r#"
                SELECT DISTINCT l.source_path, COALESCE(p.title, l.source_path), l.target_raw
                FROM wiki_links l
                LEFT JOIN wiki_pages p
                    ON p.vault_root = l.vault_root AND p.rel_path = l.source_path
                WHERE l.vault_root = ?1 AND l.target_path = ?2 AND l.source_path != ?2
                ORDER BY l.source_path ASC
                "#,
            )
            .map_err(|e| e.to_string())?;
        let backlinks: Vec<WikiLinkRef> = back_stmt
            .query_map(params![&vkey, rel_path], |r| {
                Ok(WikiLinkRef {
                    rel_path: r.get(0)?,
                    title: r.get(1)?,
                    raw: r.get(2)?,
                    broken: false,
                })
            })
            .map_err(|e| e.to_string())?
            .flatten()
            .collect();

        Ok((outbound, backlinks))
    }

    pub fn search(
        &self,
        root: &Path,
        query: &str,
        scope: &str,
        limit: usize,
    ) -> Result<Vec<WikiSearchHit>, String> {
        self.sync_vault(root, false)?;
        let q = query.trim();
        if q.is_empty() {
            return Ok(Vec::new());
        }
        let vkey = Self::vault_key(root);
        let conn = self.lock_conn()?;
        let scope_prefix = match scope {
            "wiki" => Some("wiki/%"),
            "raw" => Some("raw/%"),
            _ => None,
        };
        let mut hits: Vec<WikiSearchHit> = Vec::new();
        let mut seen: HashSet<String> = HashSet::new();

        // 1. FTS5 match first
        let fts_query = q
            .split_whitespace()
            .map(|tok| format!("\"{}\"*", tok.replace('"', "\"\"")))
            .collect::<Vec<_>>()
            .join(" ");
        if !fts_query.is_empty() {
            let sql = if scope_prefix.is_some() {
                r#"
                SELECT f.rel_path, p.title, p.category, p.tags_json,
                       snippet(wiki_fts, 4, '[', ']', '...', 18) AS snip
                FROM wiki_fts f
                JOIN wiki_pages p ON p.vault_root = f.vault_root AND p.rel_path = f.rel_path
                WHERE f.vault_root = ?1 AND f.rel_path LIKE ?2 AND wiki_fts MATCH ?3
                LIMIT ?4
                "#
            } else {
                r#"
                SELECT f.rel_path, p.title, p.category, p.tags_json,
                       snippet(wiki_fts, 4, '[', ']', '...', 18) AS snip
                FROM wiki_fts f
                JOIN wiki_pages p ON p.vault_root = f.vault_root AND p.rel_path = f.rel_path
                WHERE f.vault_root = ?1 AND wiki_fts MATCH ?2
                LIMIT ?3
                "#
            };
            if let Ok(mut stmt) = conn.prepare(sql) {
                let mapper = |r: &rusqlite::Row<'_>| -> rusqlite::Result<WikiSearchHit> {
                    let tags_json: String = r.get(3)?;
                    Ok(WikiSearchHit {
                        rel_path: r.get(0)?,
                        title: r.get(1)?,
                        category: r.get(2)?,
                        tags: serde_json::from_str(&tags_json).unwrap_or_default(),
                        snippet: r.get(4)?,
                    })
                };
                let rows = if let Some(sp) = scope_prefix {
                    stmt.query_map(params![&vkey, sp, &fts_query, limit as i64], mapper)
                } else {
                    stmt.query_map(params![&vkey, &fts_query, limit as i64], mapper)
                };
                if let Ok(iter) = rows {
                    for hit in iter.flatten() {
                        if seen.insert(hit.rel_path.clone()) {
                            hits.push(hit);
                        }
                    }
                }
            }
        }

        // 2. Fallback LIKE scan for short CJK substrings or exact symbol phrases
        if hits.len() < limit {
            let like_pat = format!("%{}%", q.to_lowercase());
            let remaining = (limit - hits.len()) as i64;
            let sql = r#"
                SELECT p.rel_path, p.title, p.category, p.tags_json, p.summary
                FROM wiki_pages p
                LEFT JOIN wiki_fts f ON f.vault_root = p.vault_root AND f.rel_path = p.rel_path
                WHERE p.vault_root = ?1
                  AND (?2 = '' OR p.rel_path LIKE ?2)
                  AND (
                      lower(p.title) LIKE ?3
                      OR lower(p.tags_json) LIKE ?3
                      OR lower(p.rel_path) LIKE ?3
                      OR lower(COALESCE(f.body, '')) LIKE ?3
                  )
                ORDER BY p.mtime_ms DESC
                LIMIT ?4
            "#;
            let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
            let rows = stmt
                .query_map(
                    params![&vkey, scope_prefix.unwrap_or(""), &like_pat, remaining + 10],
                    |r| {
                        let tags_json: String = r.get(3)?;
                        Ok(WikiSearchHit {
                            rel_path: r.get(0)?,
                            title: r.get(1)?,
                            category: r.get(2)?,
                            tags: serde_json::from_str(&tags_json).unwrap_or_default(),
                            snippet: r.get(4)?,
                        })
                    },
                )
                .map_err(|e| e.to_string())?;
            for hit in rows.flatten() {
                if seen.insert(hit.rel_path.clone()) {
                    hits.push(hit);
                    if hits.len() >= limit {
                        break;
                    }
                }
            }
        }

        Ok(hits)
    }

    pub fn get_graph(&self, root: &Path) -> Result<WikiGraphData, String> {
        self.sync_vault(root, false)?;
        let vkey = Self::vault_key(root);
        let conn = self.lock_conn()?;

        let mut pages: HashMap<String, (String, String, Vec<String>)> = HashMap::new();
        {
            let mut stmt = conn
                .prepare("SELECT rel_path, title, category, sources_json FROM wiki_pages WHERE vault_root = ?1")
                .map_err(|e| e.to_string())?;
            let rows = stmt
                .query_map(params![&vkey], |r| {
                    let sources_json: String = r.get(3)?;
                    Ok((
                        r.get::<_, String>(0)?,
                        r.get::<_, String>(1)?,
                        r.get::<_, String>(2)?,
                        serde_json::from_str::<Vec<String>>(&sources_json).unwrap_or_default(),
                    ))
                })
                .map_err(|e| e.to_string())?;
            for (rel, title, cat, sources) in rows.flatten() {
                pages.insert(rel, (title, cat, sources));
            }
        }

        let mut edges: Vec<WikiGraphEdge> = Vec::new();
        let mut degree_map: HashMap<String, usize> = HashMap::new();
        let mut edge_seen: HashSet<(String, String)> = HashSet::new();

        {
            let mut stmt = conn
                .prepare(
                    "SELECT source_path, target_raw, target_path FROM wiki_links WHERE vault_root = ?1",
                )
                .map_err(|e| e.to_string())?;
            let rows = stmt
                .query_map(params![&vkey], |r| {
                    Ok((
                        r.get::<_, String>(0)?,
                        r.get::<_, String>(1)?,
                        r.get::<_, String>(2)?,
                    ))
                })
                .map_err(|e| e.to_string())?;
            for (src, raw, tgt) in rows.flatten() {
                // Skip log.md/SCHEMA.md noise in graph unless resolved
                if src == "SCHEMA.md" || src == "log.md" {
                    continue;
                }
                let broken = tgt.is_empty();
                let target_id = if broken {
                    format!("missing::{}", raw)
                } else {
                    tgt.clone()
                };
                if src == target_id || !edge_seen.insert((src.clone(), target_id.clone())) {
                    continue;
                }
                *degree_map.entry(src.clone()).or_insert(0) += 1;
                *degree_map.entry(target_id.clone()).or_insert(0) += 1;
                edges.push(WikiGraphEdge {
                    source: src,
                    target: target_id,
                    raw,
                    broken,
                });
            }
        }

        // Also connect wiki pages to their `sources` in raw/
        for (rel, (_, _, sources)) in &pages {
            for src_ref in sources {
                let clean = src_ref.trim().replace('\\', "/");
                if pages.contains_key(&clean) && edge_seen.insert((rel.clone(), clean.clone())) {
                    *degree_map.entry(rel.clone()).or_insert(0) += 1;
                    *degree_map.entry(clean.clone()).or_insert(0) += 1;
                    edges.push(WikiGraphEdge {
                        source: rel.clone(),
                        target: clean.clone(),
                        raw: clean,
                        broken: false,
                    });
                }
            }
        }

        let mut nodes: Vec<WikiGraphNode> = Vec::new();
        for (rel, (title, cat, _)) in &pages {
            if rel == "SCHEMA.md" || rel == "log.md" {
                continue;
            }
            if rel.starts_with("raw/") && degree_map.get(rel).copied().unwrap_or(0) == 0 {
                continue;
            }
            nodes.push(WikiGraphNode {
                id: rel.clone(),
                title: title.clone(),
                category: cat.clone(),
                degree: degree_map.get(rel).copied().unwrap_or(0),
            });
        }
        nodes.sort_by(|a, b| a.id.cmp(&b.id));

        Ok(WikiGraphData { nodes, edges })
    }

    pub fn lint_vault(&self, root: &Path) -> Result<WikiLintReport, String> {
        self.sync_vault(root, false)?;
        let vkey = Self::vault_key(root);
        let conn = self.lock_conn()?;

        let index_content = fs::read_to_string(root.join("index.md")).unwrap_or_default();

        let mut wiki_pages: Vec<(String, Vec<String>)> = Vec::new();
        let mut raw_pages: Vec<String> = Vec::new();

        {
            let mut stmt = conn
                .prepare("SELECT rel_path, sources_json FROM wiki_pages WHERE vault_root = ?1")
                .map_err(|e| e.to_string())?;
            let rows = stmt
                .query_map(params![&vkey], |r| {
                    let s: String = r.get(1)?;
                    Ok((
                        r.get::<_, String>(0)?,
                        serde_json::from_str::<Vec<String>>(&s).unwrap_or_default(),
                    ))
                })
                .map_err(|e| e.to_string())?;
            for (rel, sources) in rows.flatten() {
                if rel.starts_with("wiki/") {
                    wiki_pages.push((rel, sources));
                } else if rel.starts_with("raw/") {
                    raw_pages.push(rel);
                }
            }
        }

        let mut broken_links = Vec::new();
        let mut inbound_counts: HashMap<String, usize> = HashMap::new();
        let mut linked_targets: HashSet<String> = HashSet::new();
        let mut stale_index_links = Vec::new();

        {
            let mut stmt = conn
                .prepare("SELECT source_path, target_raw, target_path FROM wiki_links WHERE vault_root = ?1")
                .map_err(|e| e.to_string())?;
            let rows = stmt
                .query_map(params![&vkey], |r| {
                    Ok((
                        r.get::<_, String>(0)?,
                        r.get::<_, String>(1)?,
                        r.get::<_, String>(2)?,
                    ))
                })
                .map_err(|e| e.to_string())?;
            for (src, raw, tgt) in rows.flatten() {
                if tgt.is_empty() {
                    if src == "index.md" {
                        stale_index_links.push(raw.clone());
                    } else if src != "SCHEMA.md" && src != "log.md" {
                        broken_links.push(WikiBrokenLink {
                            source_path: src,
                            target_raw: raw,
                        });
                    }
                } else {
                    linked_targets.insert(tgt.clone());
                    if src != tgt && src != "index.md" && src != "SCHEMA.md" && src != "log.md" {
                        *inbound_counts.entry(tgt).or_insert(0) += 1;
                    }
                }
            }
        }

        let mut orphan_pages = Vec::new();
        let mut unindexed_pages = Vec::new();
        let mut referenced_raws: HashSet<String> = HashSet::new();

        for (rel, sources) in &wiki_pages {
            if inbound_counts.get(rel).copied().unwrap_or(0) == 0 {
                orphan_pages.push(rel.clone());
            }
            let stem = Path::new(rel)
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("");
            let in_index = linked_targets.contains(rel)
                || index_content.contains(rel)
                || (!stem.is_empty() && index_content.contains(stem));
            if !in_index {
                unindexed_pages.push(rel.clone());
            }
            for s in sources {
                referenced_raws.insert(s.trim().replace('\\', "/"));
            }
        }

        let uncompiled_raws: Vec<String> = raw_pages
            .into_iter()
            .filter(|r| !referenced_raws.contains(r) && !linked_targets.contains(r))
            .collect();

        Ok(WikiLintReport {
            broken_links,
            orphan_pages,
            unindexed_pages,
            stale_index_links,
            uncompiled_raws,
        })
    }

    pub fn read_index_summary(&self, root: &Path, max_bytes: usize) -> String {
        let idx = root.join("index.md");
        let Ok(raw) = fs::read_to_string(&idx) else {
            return String::new();
        };
        if raw.len() <= max_bytes {
            return raw;
        }
        let mut out = String::new();
        for ch in raw.chars() {
            if out.len() + ch.len_utf8() > max_bytes {
                break;
            }
            out.push(ch);
        }
        out.push_str("\n\n...(目录已按 3KB 截断，请调用 `wiki_index` 或 `wiki_search` 查阅完整内容)");
        out
    }
}
