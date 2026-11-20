use crate::agent::tools_local::WorkspaceSandbox;
use crate::core::storage;
use crate::wiki::WikiIngestResult;
use chrono::Local;
use regex::Regex;
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

pub const MAX_WIKI_FILE_BYTES: usize = 2 * 1024 * 1024;

pub const DEFAULT_SCHEMA_MD: &str = r#"# LLM Wiki 维护规范 (SCHEMA)

本知识库遵循 **LLM Wiki** 架构：纯 Markdown 文件夹为唯一事实源，`raw/` 只读归档原始资料，`wiki/` 存放持续提炼与互联的结构化词条。

## 1. 目录职责
- `raw/`：**只读原始资料库**（导入文档、网页抓取、排障对话沉淀）。禁止改写历史原始文件。
- `wiki/entities/`：实体页（服务器主机、集群、服务组件、数据库、代码项目）。
- `wiki/concepts/`：概念与架构原理页（技术原理、设计模式、协议规范）。
- `wiki/runbooks/`：运维手册与故障 SOP（排查路径、常用命令、应急恢复）。
- `wiki/summaries/`：针对某份 `raw/` 资料的精炼结构化摘要页。
- `index.md`：全局知识目录，按分类列出所有词条的相对链接与一句话摘要。
- `log.md`：只增不改的变更日志，记录每次 `ingest` / `update` / `lint` 操作。

## 2. Frontmatter 规范
每个 `wiki/**/*.md` 词条顶部应包含 YAML frontmatter：
```yaml
---
title: 词条标题
category: runbooks   # entities | concepts | runbooks | summaries
tags: [nginx, troubleshooting]
sources: [raw/2026-11-19-nginx-502.md]
updated: 2026-11-19
---
```

## 3. 双向链接规范
- 正文中使用 Obsidian 风格双向链接：`[[wiki/entities/prod-nginx|prod-nginx]]` 或 `[[prod-nginx]]`。
- 每当新资料提到已有实体或概念时，应同步在相关词条中添加或更新交叉引用，并避免产生断链与孤立页。
"#;

pub const DEFAULT_INDEX_MD: &str = r#"# Wiki 全局知识目录 (Index)

> 由主 Agent 与人工共同维护的全局内容导航。每次新增或显著更新词条后，请同步更新对应分类条目。

## 实体 (Entities)

## 概念与原理 (Concepts)

## 运维手册 (Runbooks)

## 资料摘要 (Summaries)
"#;

pub const DEFAULT_LOG_MD: &str = r#"# Wiki 变更日志 (Log)

> 按时间倒序或追加记录知识库摄取（ingest）、更新（update）与巡检（lint）历史。
"#;

#[derive(Debug, Clone)]
pub struct ParsedWikiPage {
    pub title: String,
    pub category: String,
    pub tags: Vec<String>,
    pub sources: Vec<String>,
    pub updated: String,
    pub summary: String,
    pub body: String,
    pub links: Vec<String>,
}

pub fn strip_win_verbatim(path: &Path) -> String {
    let raw = path.to_string_lossy().to_string();
    raw.strip_prefix(r"\\?\").unwrap_or(&raw).to_string()
}

pub fn ensure_vault_initialized(root: &Path) -> Result<(), String> {
    for sub in [
        "raw",
        "wiki/entities",
        "wiki/concepts",
        "wiki/runbooks",
        "wiki/summaries",
    ] {
        let dir = root.join(sub);
        fs::create_dir_all(&dir)
            .map_err(|e| format!("初始化 Wiki 目录失败 [{}]: {}", dir.display(), e))?;
    }

    let defaults = [
        ("SCHEMA.md", DEFAULT_SCHEMA_MD),
        ("index.md", DEFAULT_INDEX_MD),
        ("log.md", DEFAULT_LOG_MD),
    ];
    for (name, content) in defaults {
        let p = root.join(name);
        if !p.exists() {
            storage::write_file_atomic(&p, content.as_bytes())?;
        }
    }
    Ok(())
}

pub fn normalize_rel_path(raw: &str) -> String {
    raw.trim()
        .replace('\\', "/")
        .trim_start_matches("./")
        .to_string()
}

pub fn is_wiki_writable_rel(rel: &str, allow_schema: bool) -> bool {
    let clean = normalize_rel_path(rel);
    if clean == "index.md" || clean == "log.md" {
        return true;
    }
    if allow_schema && clean == "SCHEMA.md" {
        return true;
    }
    clean.starts_with("wiki/") && clean.ends_with(".md")
}

pub fn is_protected_root_file(rel: &str) -> bool {
    let clean = normalize_rel_path(rel);
    clean == "SCHEMA.md" || clean == "index.md" || clean == "log.md"
}

pub fn sandbox_for_vault(root: &Path) -> Result<WorkspaceSandbox, String> {
    let display = strip_win_verbatim(root);
    WorkspaceSandbox::new(&display)
}

pub fn read_text_file_safe(path: &Path) -> Result<String, String> {
    let meta = fs::metadata(path).map_err(|e| format!("读取文件信息失败: {}", e))?;
    if meta.len() as usize > MAX_WIKI_FILE_BYTES {
        return Err(format!(
            "文件体积超过 2MB 上限（{} bytes）",
            meta.len()
        ));
    }
    let bytes = fs::read(path).map_err(|e| format!("读取文件失败: {}", e))?;
    let probe_len = bytes.len().min(8192);
    if bytes[..probe_len].contains(&0) {
        return Err("不支持读取或归档二进制文件".to_string());
    }
    Ok(String::from_utf8_lossy(&bytes).to_string())
}

pub fn slugify_name(name: &str) -> String {
    let mut out = String::new();
    let mut prev_dash = false;
    for ch in name.trim().chars() {
        if ch.is_alphanumeric() || ('\u{4e00}'..='\u{9fff}').contains(&ch) || ch == '_' {
            out.push(ch.to_ascii_lowercase());
            prev_dash = false;
        } else if !prev_dash && !out.is_empty() {
            out.push('-');
            prev_dash = true;
        }
        if out.chars().count() >= 48 {
            break;
        }
    }
    let trimmed = out.trim_matches('-').to_string();
    if trimmed.is_empty() {
        "note".to_string()
    } else {
        trimmed
    }
}

pub fn infer_category(rel_path: &str) -> String {
    let clean = normalize_rel_path(rel_path);
    if clean == "index.md" || clean == "log.md" || clean == "SCHEMA.md" {
        return "system".to_string();
    }
    if clean.starts_with("raw/") {
        return "raw".to_string();
    }
    if let Some(rest) = clean.strip_prefix("wiki/") {
        if let Some((sub, _)) = rest.split_once('/') {
            return sub.to_string();
        }
        return "wiki".to_string();
    }
    "other".to_string()
}

fn split_frontmatter(raw: &str) -> (Option<String>, String) {
    let normalized = raw.replace("\r\n", "\n");
    if !normalized.starts_with("---\n") {
        return (None, normalized);
    }
    if let Some(end_idx) = normalized[4..].find("\n---") {
        let fm_end = 4 + end_idx;
        let yaml = normalized[4..fm_end].to_string();
        let after_marker = fm_end + 4;
        let body = normalized[after_marker..]
            .strip_prefix('\n')
            .unwrap_or(&normalized[after_marker..])
            .to_string();
        (Some(yaml), body)
    } else {
        (None, normalized)
    }
}

fn parse_yaml_string_list(val: Option<&serde_yaml::Value>) -> Vec<String> {
    let Some(v) = val else {
        return Vec::new();
    };
    match v {
        serde_yaml::Value::Sequence(seq) => seq
            .iter()
            .filter_map(|item| item.as_str().map(|s| s.trim().to_string()))
            .filter(|s| !s.is_empty())
            .collect(),
        serde_yaml::Value::String(s) => s
            .split(',')
            .map(|p| p.trim().to_string())
            .filter(|p| !p.is_empty())
            .collect(),
        _ => Vec::new(),
    }
}

pub fn extract_wikilinks(markdown: &str) -> Vec<String> {
    let re_fence = Regex::new(r"(?s)```.*?```").expect("valid fence regex");
    let without_fences = re_fence.replace_all(markdown, " ");
    let re_inline = Regex::new(r"`[^`\n]+`").expect("valid inline code regex");
    let cleaned = re_inline.replace_all(&without_fences, " ");
    let re_link = Regex::new(r"\[\[([^\[\]\n]+?)\]\]").expect("valid wikilink regex");

    let mut seen = HashSet::new();
    let mut out = Vec::new();
    for cap in re_link.captures_iter(&cleaned) {
        let inner = cap.get(1).map(|m| m.as_str()).unwrap_or("").trim();
        let target_part = inner.split('|').next().unwrap_or("").trim();
        let target_no_anchor = target_part.split('#').next().unwrap_or("").trim();
        if !target_no_anchor.is_empty() && seen.insert(target_no_anchor.to_string()) {
            out.push(target_no_anchor.to_string());
        }
    }
    out
}

pub fn parse_wiki_page(rel_path: &str, raw_content: &str) -> ParsedWikiPage {
    let (fm_opt, body) = split_frontmatter(raw_content);
    let mut title = String::new();
    let mut category = String::new();
    let mut tags = Vec::new();
    let mut sources = Vec::new();
    let mut updated = String::new();

    if let Some(fm_str) = fm_opt {
        if let Ok(serde_yaml::Value::Mapping(map)) = serde_yaml::from_str::<serde_yaml::Value>(&fm_str) {
            let get_str = |k: &str| -> String {
                map.get(serde_yaml::Value::String(k.to_string()))
                    .and_then(|v| match v {
                        serde_yaml::Value::String(s) => Some(s.trim().to_string()),
                        serde_yaml::Value::Number(n) => Some(n.to_string()),
                        _ => None,
                    })
                    .unwrap_or_default()
            };
            title = get_str("title");
            category = get_str("category");
            updated = get_str("updated");
            tags = parse_yaml_string_list(map.get(serde_yaml::Value::String("tags".to_string())));
            sources = parse_yaml_string_list(map.get(serde_yaml::Value::String("sources".to_string())));
        }
    }

    if title.is_empty() {
        for line in body.lines() {
            let trimmed = line.trim();
            if let Some(h1) = trimmed.strip_prefix("# ") {
                let clean = h1.trim();
                if !clean.is_empty() {
                    title = clean.to_string();
                    break;
                }
            }
        }
    }
    if title.is_empty() {
        let stem = Path::new(rel_path)
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or(rel_path);
        title = stem.to_string();
    }

    if category.is_empty() {
        category = infer_category(rel_path);
    }

    let summary_raw = body
        .lines()
        .map(|l| l.trim())
        .filter(|l| !l.is_empty() && !l.starts_with('#') && !l.starts_with("```"))
        .take(3)
        .collect::<Vec<_>>()
        .join(" ");
    let summary: String = summary_raw.chars().take(140).collect();

    let links = extract_wikilinks(raw_content);

    ParsedWikiPage {
        title,
        category,
        tags,
        sources,
        updated,
        summary,
        body,
        links,
    }
}

fn unique_raw_rel_path(root: &Path, stem: &str, ext: &str) -> String {
    let date_prefix = Local::now().format("%Y-%m-%d").to_string();
    let slug = slugify_name(stem);
    let clean_ext = ext.trim_start_matches('.');
    let suffix_ext = if clean_ext.is_empty() { "md" } else { clean_ext };

    for idx in 0..100 {
        let candidate = if idx == 0 {
            format!("raw/{}-{}.{}", date_prefix, slug, suffix_ext)
        } else {
            format!("raw/{}-{}-{}.{}", date_prefix, slug, idx + 1, suffix_ext)
        };
        if !root.join(&candidate).exists() {
            return candidate;
        }
    }
    format!(
        "raw/{}-{}-{}.{}",
        date_prefix,
        slug,
        Local::now().timestamp_millis(),
        suffix_ext
    )
}

pub fn ingest_local_file_to_raw(root: &Path, local_path: &str) -> Result<WikiIngestResult, String> {
    let src = PathBuf::from(local_path.trim());
    if !src.exists() || !src.is_file() {
        return Err(format!("源文件不存在: {}", local_path));
    }
    let content = read_text_file_safe(&src)?;
    let stem = src
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("imported-file")
        .to_string();
    let ext = src
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("txt");
    let rel_path = unique_raw_rel_path(root, &stem, ext);
    let target = root.join(&rel_path);
    storage::write_file_atomic(&target, content.as_bytes())?;
    Ok(WikiIngestResult {
        rel_path,
        title: stem,
        bytes: content.len(),
    })
}

pub fn ingest_text_to_raw(
    root: &Path,
    title: &str,
    content: &str,
    source_label: &str,
    source_url: Option<&str>,
) -> Result<WikiIngestResult, String> {
    let clean_title = title.trim();
    if clean_title.is_empty() {
        return Err("归档标题不能为空".to_string());
    }
    if content.len() > MAX_WIKI_FILE_BYTES {
        return Err("归档正文超出 2MB 上限".to_string());
    }
    let rel_path = unique_raw_rel_path(root, clean_title, "md");
    let now_str = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let escaped_title = clean_title.replace('"', "\\\"");
    let url_line = source_url
        .map(str::trim)
        .filter(|u| !u.is_empty())
        .map(|u| format!("url: \"{}\"\n", u.replace('"', "\\\"")))
        .unwrap_or_default();

    let full_doc = format!(
        "---\ntitle: \"{}\"\nsource: \"{}\"\n{}ingested_at: \"{}\"\n---\n\n# {}\n\n{}\n",
        escaped_title,
        source_label.replace('"', "\\\""),
        url_line,
        now_str,
        clean_title,
        content.trim_end()
    );

    let target = root.join(&rel_path);
    storage::write_file_atomic(&target, full_doc.as_bytes())?;
    Ok(WikiIngestResult {
        rel_path,
        title: clean_title.to_string(),
        bytes: full_doc.len(),
    })
}

pub fn append_log_entry(root: &Path, action: &str, title: &str, detail: &str) -> Result<(), String> {
    let log_path = root.join("log.md");
    let existing = if log_path.exists() {
        fs::read_to_string(&log_path).unwrap_or_else(|_| DEFAULT_LOG_MD.to_string())
    } else {
        DEFAULT_LOG_MD.to_string()
    };
    let ts = Local::now().format("%Y-%m-%d %H:%M").to_string();
    let mut updated = existing.trim_end().to_string();
    updated.push_str(&format!("\n\n## [{}] {} | {}\n", ts, action.trim(), title.trim()));
    if !detail.trim().is_empty() {
        updated.push_str(detail.trim());
        updated.push('\n');
    }
    storage::write_file_atomic(&log_path, updated.as_bytes())
}

pub fn collect_vault_files(root: &Path) -> Vec<String> {
    let mut files = Vec::new();
    for root_file in ["SCHEMA.md", "index.md", "log.md"] {
        if root.join(root_file).is_file() {
            files.push(root_file.to_string());
        }
    }
    collect_dir_recursive(root, &root.join("wiki"), "wiki", &mut files, true);
    collect_dir_recursive(root, &root.join("raw"), "raw", &mut files, false);
    files.sort();
    files
}

fn collect_dir_recursive(
    _root: &Path,
    dir: &Path,
    rel_prefix: &str,
    out: &mut Vec<String>,
    markdown_only: bool,
) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    let mut list: Vec<_> = entries.flatten().collect();
    list.sort_by_key(|e| e.file_name());
    for entry in list {
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') {
            continue;
        }
        let path = entry.path();
        let rel = format!("{}/{}", rel_prefix, name);
        let Ok(ft) = entry.file_type() else {
            continue;
        };
        if ft.is_dir() {
            collect_dir_recursive(_root, &path, &rel, out, markdown_only);
        } else if ft.is_file() {
            if markdown_only && !name.to_ascii_lowercase().ends_with(".md") {
                continue;
            }
            out.push(rel);
        }
    }
}
