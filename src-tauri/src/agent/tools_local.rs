use crate::agent::approval::authorize_local_write;
use crate::agent::tool::{AgentTool, ToolCtx, ToolResult};
use crate::agent::AgentRuntime;
use crate::core::storage;
use async_trait::async_trait;
use chrono::{DateTime, Local};
use serde_json::{json, Value};
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::sync::Arc;

const MAX_READ_BYTES: usize = 128 * 1024;
const MAX_WRITE_BYTES: usize = 2 * 1024 * 1024;
const IGNORED_TREE_DIRS: &[&str] = &[
    ".git",
    "node_modules",
    "target",
    "dist",
    "build",
    "__pycache__",
    ".venv",
    ".next",
];

#[derive(Clone)]
pub struct WorkspaceSandbox {
    canon_root: PathBuf,
    display_root: String,
}

impl WorkspaceSandbox {
    pub fn new(root: &str) -> Result<Self, String> {
        let trimmed = root.trim();
        if trimmed.is_empty() {
            return Err("未指定本地工作目录".to_string());
        }
        let meta = fs::metadata(trimmed)
            .map_err(|e| format!("无法访问工作目录 [{}]: {}", trimmed, e))?;
        if !meta.is_dir() {
            return Err(format!("工作目录路径不是文件夹: {}", trimmed));
        }
        let canon_root = fs::canonicalize(trimmed)
            .map_err(|e| format!("规范化工作目录失败 [{}]: {}", trimmed, e))?;
        let display_root = strip_win_verbatim(&canon_root);
        Ok(Self {
            canon_root,
            display_root,
        })
    }

    pub fn root_key(&self) -> &str {
        &self.display_root
    }

    fn clean_relative(raw: &str, allow_empty: bool) -> Result<PathBuf, String> {
        let normalized = raw.trim().replace('\\', "/");
        if normalized.is_empty() || normalized == "." {
            return if allow_empty {
                Ok(PathBuf::new())
            } else {
                Err("文件路径不能为空，且不能指向工作目录本身".to_string())
            };
        }
        let p = Path::new(&normalized);
        if p.is_absolute() {
            return Err("仅允许传入工作目录内的相对路径，不允许绝对路径".to_string());
        }
        let mut clean = PathBuf::new();
        for comp in p.components() {
            match comp {
                Component::CurDir => {}
                Component::Normal(seg) => clean.push(seg),
                Component::ParentDir => {
                    return Err("安全拦截：路径不允许包含 '..'".to_string());
                }
                Component::RootDir | Component::Prefix(_) => {
                    return Err("仅允许传入工作目录内的相对路径".to_string());
                }
            }
        }
        if clean.as_os_str().is_empty() && !allow_empty {
            return Err("文件路径不能为空".to_string());
        }
        Ok(clean)
    }

    fn rel_display(rel: &Path) -> String {
        let s = rel.to_string_lossy().replace('\\', "/");
        if s.is_empty() {
            ".".to_string()
        } else {
            s
        }
    }

    /// Resolves an existing file or directory inside the sandbox, blocking symlink escapes.
    pub fn resolve_existing(&self, raw: &str, allow_root: bool) -> Result<(String, PathBuf), String> {
        let rel = Self::clean_relative(raw, allow_root)?;
        let joined = if rel.as_os_str().is_empty() {
            self.canon_root.clone()
        } else {
            self.canon_root.join(&rel)
        };
        let canon = fs::canonicalize(&joined)
            .map_err(|e| format!("路径不存在或无法访问 [{}]: {}", Self::rel_display(&rel), e))?;
        if !canon.starts_with(&self.canon_root) {
            return Err(format!(
                "安全拦截：路径 [{}] 指向工作目录之外",
                Self::rel_display(&rel)
            ));
        }
        Ok((Self::rel_display(&rel), canon))
    }

    /// Resolves a target file path for writing, verifying that any existing target or nearest
    /// existing ancestor directory resolves strictly inside `canon_root`.
    pub fn resolve_for_write(&self, raw: &str) -> Result<(String, PathBuf, bool), String> {
        let rel = Self::clean_relative(raw, false)?;
        let rel_str = Self::rel_display(&rel);
        let target = self.canon_root.join(&rel);

        if let Ok(meta) = fs::symlink_metadata(&target) {
            if meta.is_dir() {
                return Err(format!("目标路径是目录而非文件: {}", rel_str));
            }
            let canon = fs::canonicalize(&target)
                .map_err(|e| format!("校验目标文件失败 [{}]: {}", rel_str, e))?;
            if !canon.starts_with(&self.canon_root) {
                return Err(format!("安全拦截：目标文件 [{}] 指向工作目录之外", rel_str));
            }
            return Ok((rel_str, canon, true));
        }

        // Walk up to the nearest existing ancestor to prevent writing through external symlinks.
        let mut probe = target.parent();
        let mut suffix_parts: Vec<std::ffi::OsString> = Vec::new();
        if let Some(name) = target.file_name() {
            suffix_parts.push(name.to_os_string());
        }
        while let Some(cur) = probe {
            if cur.exists() {
                let canon_anc = fs::canonicalize(cur)
                    .map_err(|e| format!("校验父目录失败 [{}]: {}", rel_str, e))?;
                if !canon_anc.starts_with(&self.canon_root) {
                    return Err(format!("安全拦截：父目录 [{}] 指向工作目录之外", rel_str));
                }
                if !canon_anc.is_dir() {
                    return Err(format!("父路径不是目录: {}", rel_str));
                }
                let mut rebuilt = canon_anc;
                for part in suffix_parts.into_iter().rev() {
                    rebuilt.push(part);
                }
                return Ok((rel_str, rebuilt, false));
            }
            if let Some(name) = cur.file_name() {
                suffix_parts.push(name.to_os_string());
            }
            probe = cur.parent();
        }

        Err(format!("无法解析写入路径: {}", rel_str))
    }
}

fn strip_win_verbatim(p: &Path) -> String {
    let s = p.to_string_lossy().to_string();
    s.strip_prefix(r"\\?\").unwrap_or(&s).to_string()
}

fn format_mtime(meta: &fs::Metadata) -> String {
    meta.modified()
        .ok()
        .map(|st| {
            let dt: DateTime<Local> = st.into();
            dt.format("%Y-%m-%d %H:%M:%S").to_string()
        })
        .unwrap_or_default()
}

// ============================================================================
// local_list
// ============================================================================

pub struct LocalListTool {
    pub sandbox: WorkspaceSandbox,
}

#[async_trait]
impl AgentTool for LocalListTool {
    fn name(&self) -> &str {
        "local_list"
    }

    fn description(&self) -> &str {
        "List direct files and subdirectories inside a specified relative directory of the bound local workspace (with type, size, and modified time)."
    }

    fn parameters_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Relative path inside the workspace, default \".\" for the root directory"
                },
                "show_hidden": {
                    "type": "boolean",
                    "description": "Whether to include hidden entries starting with '.', default false"
                },
                "max_entries": {
                    "type": "integer",
                    "description": "Maximum number of entries to return, default 200, max 500"
                }
            }
        })
    }

    fn format_title(&self, arguments: &str) -> String {
        let args: Value = serde_json::from_str(arguments).unwrap_or_else(|_| json!({}));
        let p = args.get("path").and_then(|v| v.as_str()).unwrap_or(".").trim();
        format!("Listed local directory \"{}\"", if p.is_empty() { "." } else { p })
    }

    async fn execute(&self, _ctx: &ToolCtx, arguments: &str) -> ToolResult {
        let args: Value = serde_json::from_str(arguments).unwrap_or_else(|_| json!({}));
        let raw_path = args.get("path").and_then(|v| v.as_str()).unwrap_or(".");
        let show_hidden = args
            .get("show_hidden")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);
        let max_entries = args
            .get("max_entries")
            .and_then(|v| v.as_u64())
            .unwrap_or(200)
            .clamp(1, 500) as usize;

        let (rel_dir, full_dir) = match self.sandbox.resolve_existing(raw_path, true) {
            Ok(v) => v,
            Err(e) => return ToolResult::err(e),
        };
        if !full_dir.is_dir() {
            return ToolResult::err(format!("路径不是目录: {}", rel_dir));
        }

        let rd = match fs::read_dir(&full_dir) {
            Ok(r) => r,
            Err(e) => return ToolResult::err(format!("读取目录失败 [{}]: {}", rel_dir, e)),
        };

        let mut items: Vec<(bool, String, Value)> = Vec::new();
        for entry in rd.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if !show_hidden && name.starts_with('.') {
                continue;
            }
            let meta = match entry.metadata() {
                Ok(m) => m,
                Err(_) => continue,
            };
            let is_dir = meta.is_dir();
            let kind = if is_dir { "dir" } else { "file" };
            let size = if is_dir { 0 } else { meta.len() };
            let mtime = format_mtime(&meta);
            items.push((
                is_dir,
                name.to_lowercase(),
                json!({
                    "name": name,
                    "kind": kind,
                    "size": size,
                    "modifiedAt": mtime,
                }),
            ));
        }

        items.sort_by(|a, b| b.0.cmp(&a.0).then_with(|| a.1.cmp(&b.1)));
        let total = items.len();
        let truncated = total > max_entries;
        let entries: Vec<Value> = items.into_iter().take(max_entries).map(|x| x.2).collect();

        ToolResult::success(json!({
            "path": rel_dir,
            "total": total,
            "truncated": truncated,
            "entries": entries,
        }))
    }
}

// ============================================================================
// local_read
// ============================================================================

pub struct LocalReadTool {
    pub sandbox: WorkspaceSandbox,
}

#[async_trait]
impl AgentTool for LocalReadTool {
    fn name(&self) -> &str {
        "local_read"
    }

    fn description(&self) -> &str {
        "Read the content of a text file inside the bound local workspace (with line numbers). Supports `start_line` / `end_line` for large files and blocks binary files."
    }

    fn parameters_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Relative file path inside the workspace"
                },
                "start_line": {
                    "type": "integer",
                    "description": "Optional 1-based start line number"
                },
                "end_line": {
                    "type": "integer",
                    "description": "Optional 1-based inclusive end line number"
                }
            },
            "required": ["path"]
        })
    }

    fn format_title(&self, arguments: &str) -> String {
        let args: Value = serde_json::from_str(arguments).unwrap_or_else(|_| json!({}));
        let p = args.get("path").and_then(|v| v.as_str()).unwrap_or("").trim();
        format!("Read local file \"{}\"", p)
    }

    async fn execute(&self, _ctx: &ToolCtx, arguments: &str) -> ToolResult {
        let args: Value = serde_json::from_str(arguments).unwrap_or_else(|_| json!({}));
        let raw_path = args.get("path").and_then(|v| v.as_str()).unwrap_or("");
        let start_line = args
            .get("start_line")
            .and_then(|v| v.as_u64())
            .map(|n| n.max(1) as usize);
        let end_line = args
            .get("end_line")
            .and_then(|v| v.as_u64())
            .map(|n| n.max(1) as usize);

        let (rel_path, full_path) = match self.sandbox.resolve_existing(raw_path, false) {
            Ok(v) => v,
            Err(e) => return ToolResult::err(e),
        };
        if full_path.is_dir() {
            return ToolResult::err(format!("路径是目录而非文件: {}", rel_path));
        }

        let bytes = match fs::read(&full_path) {
            Ok(b) => b,
            Err(e) => return ToolResult::err(format!("读取文件失败 [{}]: {}", rel_path, e)),
        };

        let probe_len = bytes.len().min(8192);
        if bytes[..probe_len].contains(&0) {
            return ToolResult::err(format!("检测到二进制文件，不支持文本读取: {}", rel_path));
        }

        let text = String::from_utf8_lossy(&bytes);
        let all_lines: Vec<&str> = text.lines().collect();
        let total_lines = all_lines.len();

        let from = start_line.unwrap_or(1).min(total_lines.max(1));
        let to = end_line.unwrap_or(total_lines).min(total_lines);

        let mut out_lines = Vec::new();
        let mut acc_bytes = 0usize;
        let mut truncated = false;
        let mut actual_end = from.saturating_sub(1);

        if total_lines > 0 && from <= to {
            for idx in from..=to {
                let formatted = format!("{}: {}", idx, all_lines[idx - 1]);
                if acc_bytes + formatted.len() + 1 > MAX_READ_BYTES {
                    truncated = true;
                    break;
                }
                acc_bytes += formatted.len() + 1;
                actual_end = idx;
                out_lines.push(formatted);
            }
        }

        ToolResult::success(json!({
            "path": rel_path,
            "totalLines": total_lines,
            "startLine": if total_lines == 0 { 0 } else { from },
            "endLine": actual_end,
            "truncated": truncated,
            "content": out_lines.join("\n"),
        }))
    }
}

// ============================================================================
// local_tree
// ============================================================================

pub struct LocalTreeTool {
    pub sandbox: WorkspaceSandbox,
}

#[async_trait]
impl AgentTool for LocalTreeTool {
    fn name(&self) -> &str {
        "local_tree"
    }

    fn description(&self) -> &str {
        "View the bound local workspace structure as a compact directory tree. Skips large build/dependency directories such as .git, node_modules, target, and dist by default."
    }

    fn parameters_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Relative starting path inside the workspace, default \".\""
                },
                "max_depth": {
                    "type": "integer",
                    "description": "Maximum recursion depth (default 3, max 6)"
                },
                "max_entries": {
                    "type": "integer",
                    "description": "Maximum entries to display (default 300, max 500)"
                },
                "include_ignored": {
                    "type": "boolean",
                    "description": "Whether to include ignored directories (.git / node_modules / target / dist, etc.), default false"
                }
            }
        })
    }

    fn format_title(&self, arguments: &str) -> String {
        let args: Value = serde_json::from_str(arguments).unwrap_or_else(|_| json!({}));
        let p = args.get("path").and_then(|v| v.as_str()).unwrap_or(".").trim();
        format!("Viewed local tree \"{}\"", if p.is_empty() { "." } else { p })
    }

    async fn execute(&self, _ctx: &ToolCtx, arguments: &str) -> ToolResult {
        let args: Value = serde_json::from_str(arguments).unwrap_or_else(|_| json!({}));
        let raw_path = args.get("path").and_then(|v| v.as_str()).unwrap_or(".");
        let max_depth = args
            .get("max_depth")
            .and_then(|v| v.as_u64())
            .unwrap_or(3)
            .clamp(1, 6) as usize;
        let max_entries = args
            .get("max_entries")
            .and_then(|v| v.as_u64())
            .unwrap_or(300)
            .clamp(1, 500) as usize;
        let include_ignored = args
            .get("include_ignored")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);

        let (rel_root, full_root) = match self.sandbox.resolve_existing(raw_path, true) {
            Ok(v) => v,
            Err(e) => return ToolResult::err(e),
        };
        if !full_root.is_dir() {
            return ToolResult::err(format!("路径不是目录: {}", rel_root));
        }

        let mut lines = vec![format!("{}/", rel_root)];
        let mut shown = 0usize;
        let mut truncated = false;

        fn walk(
            dir: &Path,
            prefix: &str,
            depth: usize,
            max_depth: usize,
            max_entries: usize,
            include_ignored: bool,
            lines: &mut Vec<String>,
            shown: &mut usize,
            truncated: &mut bool,
        ) {
            if depth > max_depth || *truncated {
                return;
            }
            let Ok(rd) = fs::read_dir(dir) else {
                return;
            };
            let mut entries: Vec<(bool, String, PathBuf)> = Vec::new();
            for entry in rd.flatten() {
                let name = entry.file_name().to_string_lossy().to_string();
                let Ok(ft) = entry.file_type() else {
                    continue;
                };
                if ft.is_symlink() {
                    continue;
                }
                let is_dir = ft.is_dir();
                if is_dir && !include_ignored && IGNORED_TREE_DIRS.contains(&name.as_str()) {
                    continue;
                }
                entries.push((is_dir, name, entry.path()));
            }
            entries.sort_by(|a, b| {
                b.0.cmp(&a.0)
                    .then_with(|| a.1.to_lowercase().cmp(&b.1.to_lowercase()))
            });

            let len = entries.len();
            for (idx, (is_dir, name, path)) in entries.into_iter().enumerate() {
                if *shown >= max_entries {
                    *truncated = true;
                    return;
                }
                let is_last = idx + 1 == len;
                let branch = if is_last { "└── " } else { "├── " };
                let suffix = if is_dir { "/" } else { "" };
                lines.push(format!("{}{}{}{}", prefix, branch, name, suffix));
                *shown += 1;

                if is_dir && depth < max_depth {
                    let child_prefix =
                        format!("{}{}", prefix, if is_last { "    " } else { "│   " });
                    walk(
                        &path,
                        &child_prefix,
                        depth + 1,
                        max_depth,
                        max_entries,
                        include_ignored,
                        lines,
                        shown,
                        truncated,
                    );
                }
            }
        }

        walk(
            &full_root,
            "",
            1,
            max_depth,
            max_entries,
            include_ignored,
            &mut lines,
            &mut shown,
            &mut truncated,
        );

        ToolResult::success(json!({
            "root": rel_root,
            "shownEntries": shown,
            "truncated": truncated,
            "tree": lines.join("\n"),
        }))
    }
}

// ============================================================================
// local_write
// ============================================================================

pub struct LocalWriteTool {
    pub sandbox: WorkspaceSandbox,
    pub runtime: Arc<AgentRuntime>,
}

#[async_trait]
impl AgentTool for LocalWriteTool {
    fn name(&self) -> &str {
        "local_write"
    }

    fn description(&self) -> &str {
        "Write text content to a relative file path inside the bound local workspace (creates parent directories automatically; requires user approval before execution). Supports `overwrite` (default), `append`, and `create_only`."
    }

    fn parameters_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Relative file path inside the workspace"
                },
                "content": {
                    "type": "string",
                    "description": "Text content to write (max 2MB per call)"
                },
                "mode": {
                    "type": "string",
                    "enum": ["overwrite", "append", "create_only"],
                    "description": "Write mode: overwrite (create or replace, default), append, or create_only"
                },
                "reason": {
                    "type": "string",
                    "description": "Purpose of writing this file (shown on the user approval card)"
                }
            },
            "required": ["path", "content", "reason"]
        })
    }

    fn format_title(&self, arguments: &str) -> String {
        let args: Value = serde_json::from_str(arguments).unwrap_or_else(|_| json!({}));
        let p = args.get("path").and_then(|v| v.as_str()).unwrap_or("").trim();
        format!("Wrote local file \"{}\"", p)
    }

    async fn execute(&self, ctx: &ToolCtx, arguments: &str) -> ToolResult {
        if ctx.cancel.is_cancelled() {
            return ToolResult::err("任务已取消");
        }

        let args: Value = serde_json::from_str(arguments).unwrap_or_else(|_| json!({}));
        let raw_path = args.get("path").and_then(|v| v.as_str()).unwrap_or("");
        let content = args.get("content").and_then(|v| v.as_str()).unwrap_or("");
        let mode = args
            .get("mode")
            .and_then(|v| v.as_str())
            .unwrap_or("overwrite")
            .trim()
            .to_ascii_lowercase();
        let reason = args
            .get("reason")
            .and_then(|v| v.as_str())
            .unwrap_or("写入本地工作目录文件")
            .trim()
            .to_string();

        if content.len() > MAX_WRITE_BYTES {
            return ToolResult::err(format!(
                "单次写入内容超出 2MB 上限（当前 {} 字节）",
                content.len()
            ));
        }
        if !matches!(mode.as_str(), "overwrite" | "append" | "create_only") {
            return ToolResult::err(format!("不支持的写入模式: {}", mode));
        }

        let (rel_path, full_path, existed) = match self.sandbox.resolve_for_write(raw_path) {
            Ok(v) => v,
            Err(e) => return ToolResult::err(e),
        };

        if mode == "create_only" && existed {
            return ToolResult::err(format!(
                "文件已存在且写入模式为 create_only: {}",
                rel_path
            ));
        }

        if let Err(deny_err) = authorize_local_write(
            &self.runtime,
            self.sandbox.root_key(),
            &rel_path,
            &mode,
            existed,
            content,
            &reason,
            ctx,
        )
        .await
        {
            return ToolResult::err(deny_err);
        }

        let final_bytes: Vec<u8> = if mode == "append" && existed {
            let mut existing = match fs::read(&full_path) {
                Ok(b) => b,
                Err(e) => return ToolResult::err(format!("读取原文件以追加失败: {}", e)),
            };
            existing.extend_from_slice(content.as_bytes());
            existing
        } else {
            content.as_bytes().to_vec()
        };

        if let Err(e) = storage::write_file_atomic(&full_path, &final_bytes) {
            return ToolResult::err(e);
        }

        ToolResult::success(json!({
            "path": rel_path,
            "mode": mode,
            "existed": existed,
            "bytesWritten": content.len(),
        }))
    }
}
