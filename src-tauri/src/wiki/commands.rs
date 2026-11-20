use crate::agent::tools::fetch_url_text;
use crate::core::storage;
use crate::wiki::vault::{
    ingest_local_file_to_raw, ingest_text_to_raw, is_protected_root_file, is_wiki_writable_rel,
    normalize_rel_path, parse_wiki_page, read_text_file_safe, sandbox_for_vault, MAX_WIKI_FILE_BYTES,
};
use crate::wiki::{
    WikiGraphData, WikiInfo, WikiIngestResult, WikiLintReport, WikiPageDetail, WikiSearchHit,
    WikiTreeNode,
};
use crate::AppState;
use serde_json::json;
use std::fs;
use tauri::{AppHandle, Emitter, State};

pub fn emit_wiki_changed(app: &AppHandle, reason: &str, rel_path: Option<&str>) {
    let _ = app.emit(
        "wiki:changed",
        json!({
            "reason": reason,
            "relPath": rel_path.unwrap_or(""),
        }),
    );
}

#[tauri::command]
pub async fn wiki_get_info(state: State<'_, AppState>) -> Result<WikiInfo, String> {
    let (root, is_custom) = state.wiki.resolve_vault()?;
    state.wiki.db().get_info(&root, is_custom)
}

#[tauri::command]
pub async fn wiki_list_tree(state: State<'_, AppState>) -> Result<Vec<WikiTreeNode>, String> {
    let (root, _) = state.wiki.resolve_vault()?;
    state.wiki.db().list_tree(&root)
}

#[tauri::command]
pub async fn wiki_read_page(
    state: State<'_, AppState>,
    rel_path: String,
) -> Result<WikiPageDetail, String> {
    let (root, _) = state.wiki.resolve_vault()?;
    state.wiki.db().sync_vault(&root, false)?;
    let sandbox = sandbox_for_vault(&root)?;
    let (clean_rel, abs) = sandbox.resolve_existing(&rel_path, false)?;
    let content = read_text_file_safe(&abs)?;
    let parsed = parse_wiki_page(&clean_rel, &content);
    let (outbound_links, backlinks) = state.wiki.db().get_links_for_page(&root, &clean_rel)?;
    let read_only = normalize_rel_path(&clean_rel).starts_with("raw/");

    Ok(WikiPageDetail {
        rel_path: clean_rel,
        title: parsed.title,
        category: parsed.category,
        tags: parsed.tags,
        sources: parsed.sources,
        updated: parsed.updated,
        content,
        body: parsed.body,
        read_only,
        outbound_links,
        backlinks,
    })
}

#[tauri::command]
pub async fn wiki_save_page(
    app: AppHandle,
    state: State<'_, AppState>,
    rel_path: String,
    content: String,
) -> Result<WikiPageDetail, String> {
    if content.len() > MAX_WIKI_FILE_BYTES {
        return Err("文件内容超出 2MB 上限".to_string());
    }
    let clean_req = normalize_rel_path(&rel_path);
    if !is_wiki_writable_rel(&clean_req, true) {
        return Err("安全拦截：仅允许编辑 wiki/ 目录下的 .md 词条或 index.md / log.md / SCHEMA.md（raw/ 为只读归档）".to_string());
    }

    let (root, _) = state.wiki.resolve_vault()?;
    {
        let _guard = state.wiki.lock_io()?;
        let sandbox = sandbox_for_vault(&root)?;
        let (clean_rel, abs, _) = sandbox.resolve_for_write(&clean_req)?;
        storage::write_file_atomic(&abs, content.as_bytes())?;
        state.wiki.db().upsert_single_page(&root, &clean_rel, &content)?;
        emit_wiki_changed(&app, "save", Some(&clean_rel));
    }

    wiki_read_page(state, clean_req).await
}

#[tauri::command]
pub async fn wiki_delete_page(
    app: AppHandle,
    state: State<'_, AppState>,
    rel_path: String,
) -> Result<(), String> {
    let clean_req = normalize_rel_path(&rel_path);
    if is_protected_root_file(&clean_req) {
        return Err("系统核心文档（SCHEMA.md / index.md / log.md）禁止删除".to_string());
    }

    let (root, _) = state.wiki.resolve_vault()?;
    let _guard = state.wiki.lock_io()?;
    let sandbox = sandbox_for_vault(&root)?;
    let (clean_rel, abs) = sandbox.resolve_existing(&clean_req, false)?;
    if !abs.is_file() {
        return Err("目标不是有效文件".to_string());
    }
    fs::remove_file(&abs).map_err(|e| format!("删除文件失败: {}", e))?;
    state.wiki.db().remove_single_page(&root, &clean_rel)?;
    emit_wiki_changed(&app, "delete", Some(&clean_rel));
    Ok(())
}

#[tauri::command]
pub async fn wiki_search(
    state: State<'_, AppState>,
    query: String,
    scope: Option<String>,
    limit: Option<usize>,
) -> Result<Vec<WikiSearchHit>, String> {
    let (root, _) = state.wiki.resolve_vault()?;
    let s = scope.as_deref().unwrap_or("all");
    let lim = limit.unwrap_or(30).clamp(1, 100);
    state.wiki.db().search(&root, &query, s, lim)
}

#[tauri::command]
pub async fn wiki_get_graph(state: State<'_, AppState>) -> Result<WikiGraphData, String> {
    let (root, _) = state.wiki.resolve_vault()?;
    state.wiki.db().get_graph(&root)
}

#[tauri::command]
pub async fn wiki_ingest_file(
    app: AppHandle,
    state: State<'_, AppState>,
    local_path: String,
) -> Result<WikiIngestResult, String> {
    let (root, _) = state.wiki.resolve_vault()?;
    let _guard = state.wiki.lock_io()?;
    let res = ingest_local_file_to_raw(&root, &local_path)?;
    let content = fs::read_to_string(root.join(&res.rel_path)).unwrap_or_default();
    state
        .wiki
        .db()
        .upsert_single_page(&root, &res.rel_path, &content)?;
    emit_wiki_changed(&app, "ingest", Some(&res.rel_path));
    Ok(res)
}

#[tauri::command]
pub async fn wiki_ingest_url(
    app: AppHandle,
    state: State<'_, AppState>,
    url: String,
) -> Result<WikiIngestResult, String> {
    let page = fetch_url_text(&url, 80_000).await?;
    let clean_title = if page.title.trim().is_empty() {
        page.url.clone()
    } else {
        page.title.clone()
    };

    let (root, _) = state.wiki.resolve_vault()?;
    let _guard = state.wiki.lock_io()?;
    let res = ingest_text_to_raw(&root, &clean_title, &page.content, "web", Some(&page.url))?;
    let content = fs::read_to_string(root.join(&res.rel_path)).unwrap_or_default();
    state
        .wiki
        .db()
        .upsert_single_page(&root, &res.rel_path, &content)?;
    emit_wiki_changed(&app, "ingest", Some(&res.rel_path));
    Ok(res)
}

#[tauri::command]
pub async fn wiki_ingest_text(
    app: AppHandle,
    state: State<'_, AppState>,
    title: String,
    content: String,
    source_label: Option<String>,
) -> Result<WikiIngestResult, String> {
    let (root, _) = state.wiki.resolve_vault()?;
    let _guard = state.wiki.lock_io()?;
    let label = source_label
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or("manual");
    let res = ingest_text_to_raw(&root, &title, &content, label, None)?;
    let raw_content = fs::read_to_string(root.join(&res.rel_path)).unwrap_or_default();
    state
        .wiki
        .db()
        .upsert_single_page(&root, &res.rel_path, &raw_content)?;
    emit_wiki_changed(&app, "ingest", Some(&res.rel_path));
    Ok(res)
}

#[tauri::command]
pub async fn wiki_lint(state: State<'_, AppState>) -> Result<WikiLintReport, String> {
    let (root, _) = state.wiki.resolve_vault()?;
    state.wiki.db().lint_vault(&root)
}

#[tauri::command]
pub async fn wiki_rebuild_index(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<WikiInfo, String> {
    let (root, is_custom) = state.wiki.resolve_vault()?;
    state.wiki.db().sync_vault(&root, true)?;
    emit_wiki_changed(&app, "rebuild", None);
    state.wiki.db().get_info(&root, is_custom)
}

#[tauri::command]
pub async fn wiki_open_folder(state: State<'_, AppState>) -> Result<(), String> {
    let (root, _) = state.wiki.resolve_vault()?;
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(&root)
            .spawn()
            .map_err(|e| format!("打开文件夹失败: {}", e))?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&root)
            .spawn()
            .map_err(|e| format!("打开文件夹失败: {}", e))?;
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        std::process::Command::new("xdg-open")
            .arg(&root)
            .spawn()
            .map_err(|e| format!("打开文件夹失败: {}", e))?;
    }
    Ok(())
}
