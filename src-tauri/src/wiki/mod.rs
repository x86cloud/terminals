pub mod commands;
pub mod index_db;
pub mod vault;

use crate::core::{storage, Store};
use index_db::WikiIndexDb;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WikiInfo {
    pub vault_root: String,
    pub is_custom_dir: bool,
    pub wiki_count: usize,
    pub raw_count: usize,
    pub link_count: usize,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WikiTreeNode {
    pub id: String,
    pub name: String,
    pub rel_path: String,
    pub kind: String, // "dir" | "file"
    pub category: String,
    pub title: String,
    #[serde(default)]
    pub children: Vec<WikiTreeNode>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WikiLinkRef {
    pub rel_path: String,
    pub title: String,
    pub raw: String,
    pub broken: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WikiPageDetail {
    pub rel_path: String,
    pub title: String,
    pub category: String,
    pub tags: Vec<String>,
    pub sources: Vec<String>,
    pub updated: String,
    pub content: String,
    pub body: String,
    pub read_only: bool,
    pub outbound_links: Vec<WikiLinkRef>,
    pub backlinks: Vec<WikiLinkRef>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WikiSearchHit {
    pub rel_path: String,
    pub title: String,
    pub category: String,
    pub tags: Vec<String>,
    pub snippet: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WikiGraphNode {
    pub id: String,
    pub title: String,
    pub category: String,
    pub degree: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WikiGraphEdge {
    pub source: String,
    pub target: String,
    pub raw: String,
    pub broken: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WikiGraphData {
    pub nodes: Vec<WikiGraphNode>,
    pub edges: Vec<WikiGraphEdge>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WikiBrokenLink {
    pub source_path: String,
    pub target_raw: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WikiLintReport {
    pub broken_links: Vec<WikiBrokenLink>,
    pub orphan_pages: Vec<String>,
    pub unindexed_pages: Vec<String>,
    pub stale_index_links: Vec<String>,
    pub uncompiled_raws: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WikiIngestResult {
    pub rel_path: String,
    pub title: String,
    pub bytes: usize,
}

pub struct WikiManager {
    store: Arc<Store>,
    db: Arc<WikiIndexDb>,
    io_lock: Mutex<()>,
}

impl WikiManager {
    pub fn new(store: Arc<Store>) -> Result<Self, String> {
        let db = Arc::new(WikiIndexDb::open_at(storage::wiki_cache_db_path())?);
        Ok(Self {
            store,
            db,
            io_lock: Mutex::new(()),
        })
    }

    pub fn resolve_vault(&self) -> Result<(PathBuf, bool), String> {
        let custom = self.store.get_settings().ai_wiki_dir.trim().to_string();
        let (root, is_custom) = if custom.is_empty() {
            (storage::wiki_dir(), false)
        } else {
            (PathBuf::from(&custom), true)
        };
        vault::ensure_vault_initialized(&root)?;
        let canon = std::fs::canonicalize(&root).unwrap_or(root);
        Ok((canon, is_custom))
    }

    pub fn db(&self) -> &WikiIndexDb {
        &self.db
    }

    pub fn lock_io(&self) -> Result<std::sync::MutexGuard<'_, ()>, String> {
        self.io_lock
            .lock()
            .map_err(|_| "Wiki IO 锁异常".to_string())
    }
}
