use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct SessionInfo {
    pub id: String,
    pub server_id: String,
    pub title: String,
    pub host: String,
    pub port: i32,
    pub username: String,
    pub connected: bool,
    pub home_dir: String,
    pub os_info: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub size: i64,
    pub mode: String,
    pub mod_time: i64,
    pub is_dir: bool,
    pub is_link: bool,
    pub is_symlink: bool,
    pub permissions: String,
}

pub type FileItem = FileEntry;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct DirListing {
    pub path: String,
    pub parent: String,
    pub items: Vec<FileEntry>,
    pub entries: Vec<FileEntry>,
    pub home_dir: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct Transfer {
    pub id: String,
    pub session_id: String,
    pub kind: String,
    pub direction: String,
    pub name: String,
    pub local_path: String,
    pub remote_path: String,
    pub size: i64,
    pub transferred: i64,
    pub status: String,
    pub error: String,
    pub speed: i64,
    pub started_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct UploadEstimate {
    pub total_size: i64,
    pub file_count: usize,
    pub folder_count: usize,
    pub remote_free: u64,
    pub remote_total: u64,
    pub is_insufficient: bool,
    pub supported: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct SSHDiskUsage {
    pub mount: String,
    pub filesystem: String,
    pub fs_type: String,
    pub total: u64,
    pub used: u64,
    pub available: u64,
    pub usage_percent: f64,
    pub is_virtual: bool,
}

pub type SSHDiskInfo = SSHDiskUsage;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct SSHCPUInfo {
    pub usage_percent: f64,
    pub cores: i32,
    pub load_avg: Vec<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct SSHMemInfo {
    pub total: u64,
    pub used: u64,
    pub free: u64,
    pub available: u64,
    pub usage_percent: f64,
    pub swap_total: u64,
    pub swap_used: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct SSHNetInterface {
    pub name: String,
    pub ip: String,
    pub rx_bytes: u64,
    pub tx_bytes: u64,
    pub is_loopback: bool,
    pub is_virtual: bool,
}

pub type SSHNetInfo = SSHNetInterface;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct SSHDashboardInfo {
    pub hostname: String,
    pub os: String,
    pub uptime: String,
    pub cpu: SSHCPUInfo,
    pub mem: SSHMemInfo,
    pub disks: Vec<SSHDiskUsage>,
    pub nets: Vec<SSHNetInterface>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct SSHProcessInfo {
    pub pid: i32,
    pub user: String,
    pub cpu: f64,
    pub mem: f64,
    pub rss: u64,
    pub command: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct SSHServiceInfo {
    pub name: String,
    pub load: String,
    pub active: String,
    pub sub: String,
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct SSHCronItem {
    pub id: String,
    pub expression: String,
    pub command: String,
    pub enabled: bool,
    pub comment: String,
}

// ============================================================================
// Remote Path & Formatting Helpers
// ============================================================================

pub fn normalize_remote(p: &str) -> String {
    let trimmed = p.trim();
    if trimmed.is_empty() {
        return "/".to_string();
    }
    let replaced = trimmed.replace('\\', "/");
    if replaced.starts_with('~') {
        return replaced;
    }
    let mut parts: Vec<&str> = Vec::new();
    for seg in replaced.split('/') {
        match seg {
            "" | "." => {}
            ".." => {
                parts.pop();
            }
            s => parts.push(s),
        }
    }
    if parts.is_empty() {
        "/".to_string()
    } else {
        format!("/{}", parts.join("/"))
    }
}

pub fn join_remote(base: &str, child: &str) -> String {
    let b = base.trim_end_matches('/');
    let c = child.trim_start_matches('/');
    if b.is_empty() {
        format!("/{}", c)
    } else if c.is_empty() {
        normalize_remote(b)
    } else {
        normalize_remote(&format!("{}/{}", b, c))
    }
}

/// Joins a relative sub-path onto a normalized remote base directory,
/// normalizing separators and rejecting directory traversal (`..`) segments.
pub fn join_remote_relative(base: &str, rel: &str) -> Result<String, String> {
    let base_norm = normalize_remote(base);
    let replaced = rel.trim().replace('\\', "/");
    let mut parts: Vec<&str> = Vec::new();
    for seg in replaced.split('/') {
        let s = seg.trim();
        match s {
            "" | "." => {}
            ".." => return Err(format!("非法相对路径（不允许包含 '..'）: {}", rel)),
            valid => parts.push(valid),
        }
    }
    if parts.is_empty() {
        Ok(base_norm)
    } else {
        Ok(join_remote(&base_norm, &parts.join("/")))
    }
}

pub fn parent_remote(p: &str) -> String {
    let norm = normalize_remote(p);
    if norm == "/" {
        return "/".to_string();
    }
    match norm.rfind('/') {
        Some(0) | None => "/".to_string(),
        Some(idx) => norm[..idx].to_string(),
    }
}

pub fn base_remote(p: &str) -> String {
    let norm = normalize_remote(p);
    if norm == "/" {
        return "/".to_string();
    }
    norm.rsplit('/').next().unwrap_or(&norm).to_string()
}

pub fn shell_quote(s: &str) -> String {
    format!("'{}'", s.replace('\'', "'\\''"))
}

pub fn format_unix_mode(perm: u32, is_dir: bool, is_link: bool) -> String {
    let file_type = if is_link {
        'l'
    } else if is_dir {
        'd'
    } else {
        '-'
    };
    let chars = [
        file_type,
        if perm & 0o400 != 0 { 'r' } else { '-' },
        if perm & 0o200 != 0 { 'w' } else { '-' },
        if perm & 0o100 != 0 { 'x' } else { '-' },
        if perm & 0o040 != 0 { 'r' } else { '-' },
        if perm & 0o020 != 0 { 'w' } else { '-' },
        if perm & 0o010 != 0 { 'x' } else { '-' },
        if perm & 0o004 != 0 { 'r' } else { '-' },
        if perm & 0o002 != 0 { 'w' } else { '-' },
        if perm & 0o001 != 0 { 'x' } else { '-' },
    ];
    chars.iter().collect()
}

pub fn parse_proc_stat_cpu(line: &str) -> (u64, u64) {
    let fields: Vec<&str> = line.split_whitespace().collect();
    if fields.len() < 5 || fields[0] != "cpu" {
        return (0, 0);
    }
    let mut sum = 0u64;
    let mut idle = 0u64;
    for (idx, field) in fields.iter().enumerate().skip(1) {
        let val = field.parse::<u64>().unwrap_or(0);
        sum += val;
        if idx == 4 || idx == 5 {
            idle += val;
        }
    }
    (sum, idle)
}

pub fn format_uptime(up_str: &str, proc_uptime: &str) -> String {
    if !proc_uptime.is_empty() {
        if let Some(first) = proc_uptime.split_whitespace().next() {
            if let Ok(sec) = first.parse::<f64>() {
                if sec > 0.0 {
                    let total_sec = sec as u64;
                    let days = total_sec / 86400;
                    let hours = (total_sec % 86400) / 3600;
                    let mins = (total_sec % 3600) / 60;
                    if days > 0 {
                        return format!("{}天 {}小时 {}分", days, hours, mins);
                    }
                    if hours > 0 {
                        return format!("{}小时 {}分", hours, mins);
                    }
                    return format!("{}分", mins);
                }
            }
        }
    }

    if let Some(idx) = up_str.find(" up ") {
        let mut part = &up_str[idx + 4..];
        if let Some(l_idx) = part.find("load average") {
            part = &part[..l_idx];
        }
        let part = part.trim().trim_end_matches(',').trim();
        let kept: Vec<&str> = part
            .split(',')
            .map(|s| s.trim())
            .filter(|s| !s.is_empty() && !s.contains("user"))
            .collect();
        if !kept.is_empty() {
            return kept.join(", ");
        }
    }

    up_str.to_string()
}

pub fn is_virtual_fs(fs_type: &str, mount: &str) -> bool {
    const VIRT_TYPES: &[&str] = &[
        "tmpfs",
        "devtmpfs",
        "overlay",
        "squashfs",
        "sysfs",
        "proc",
        "cgroup",
        "shm",
        "devpts",
        "securityfs",
        "pstore",
        "autofs",
        "hugetlbfs",
        "mqueue",
    ];
    let ft_lower = fs_type.to_lowercase();
    if VIRT_TYPES.contains(&ft_lower.as_str()) {
        return true;
    }
    let m_lower = mount.to_lowercase();
    m_lower.starts_with("/dev/shm")
        || m_lower.starts_with("/run")
        || m_lower.starts_with("/sys")
        || m_lower.starts_with("/proc")
        || m_lower.starts_with("/dev/mqueue")
        || m_lower.starts_with("/snap")
}

pub fn is_virtual_net(name: &str) -> bool {
    const VIRT_PREFIXES: &[&str] = &[
        "docker", "veth", "br-", "flannel", "cni", "virbr", "tun", "tap", "kube",
    ];
    VIRT_PREFIXES.iter().any(|p| name.starts_with(p))
}

pub fn is_cron_expression(fields: &[&str]) -> bool {
    if fields.len() < 5 {
        return false;
    }
    for &f in &fields[..5] {
        if f.is_empty() {
            return false;
        }
        if !f
            .chars()
            .all(|c| c == '*' || c == '/' || c == '-' || c == ',' || c.is_ascii_digit())
        {
            return false;
        }
    }
    true
}

#[cfg(test)]
mod tests {
    use super::join_remote_relative;

    #[test]
    fn test_join_remote_relative_normalizes_separators() {
        assert_eq!(
            join_remote_relative("/home/user", "my-dir\\sub\\file.txt").unwrap(),
            "/home/user/my-dir/sub/file.txt"
        );
        assert_eq!(
            join_remote_relative("/", "./dir/./inner/").unwrap(),
            "/dir/inner"
        );
        assert_eq!(join_remote_relative("/var/www", "").unwrap(), "/var/www");
    }

    #[test]
    fn test_join_remote_relative_rejects_traversal() {
        assert!(join_remote_relative("/home/user", "../etc/passwd").is_err());
        assert!(join_remote_relative("/home/user", "a/../../b").is_err());
    }
}


