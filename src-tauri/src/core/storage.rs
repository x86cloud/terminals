use chrono::Local;
use serde::Serialize;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};

const APP_DIR_NAME: &str = "xTerminal";

pub fn base_dir() -> PathBuf {
    let base = dirs::config_dir()
        .or_else(|| dirs::home_dir().map(|h| h.join(".config")))
        .unwrap_or_else(|| PathBuf::from("."));
    base.join(APP_DIR_NAME)
}

pub fn config_dir() -> PathBuf {
    base_dir().join("config")
}

pub fn data_dir() -> PathBuf {
    base_dir().join("data")
}

pub fn logs_dir() -> PathBuf {
    base_dir().join("logs")
}

pub fn secret_key_path() -> PathBuf {
    config_dir().join("secret.key")
}

pub fn servers_path() -> PathBuf {
    config_dir().join("servers.json")
}

pub fn composes_path() -> PathBuf {
    config_dir().join("composes.json")
}

pub fn k8s_orchestrations_path() -> PathBuf {
    config_dir().join("k8s_orchestrations.json")
}

pub fn apis_path() -> PathBuf {
    config_dir().join("apis.json")
}

pub fn log_file_path() -> PathBuf {
    logs_dir().join("app.log")
}

pub fn ensure_dirs() -> Result<(), String> {
    for dir in [config_dir(), data_dir(), logs_dir()] {
        fs::create_dir_all(&dir)
            .map_err(|e| format!("创建存储子目录失败 [{}]: {}", dir.display(), e))?;
    }
    Ok(())
}

pub fn write_file_atomic(path: &Path, data: &[u8]) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("创建父目录失败: {}", e))?;
    }
    let tmp_path = path.with_extension(format!(
        "{}.tmp",
        path.extension()
            .and_then(|s| s.to_str())
            .unwrap_or("dat")
    ));
    fs::write(&tmp_path, data).map_err(|e| format!("写入临时文件失败: {}", e))?;
    if path.exists() {
        let _ = fs::remove_file(path);
    }
    fs::rename(&tmp_path, path).or_else(|_| {
        fs::write(path, data)
            .map(|_| {
                let _ = fs::remove_file(&tmp_path);
            })
            .map_err(|e| format!("原子覆盖文件失败: {}", e))
    })
}

pub fn write_json_atomic<T: Serialize + ?Sized>(path: &Path, val: &T) -> Result<(), String> {
    let bytes =
        serde_json::to_vec_pretty(val).map_err(|e| format!("序列化 JSON 失败: {}", e))?;
    write_file_atomic(path, &bytes)
}

pub fn log_line(level: &str, msg: &str) {
    let now = Local::now().format("%Y-%m-%d %H:%M:%S%.3f");
    let line = format!("[{}] [{}] {}\n", now, level, msg);
    if let Ok(mut file) = OpenOptions::new()
        .create(true)
        .append(true)
        .open(log_file_path())
    {
        let _ = file.write_all(line.as_bytes());
    }
}

pub fn log_info(msg: impl AsRef<str>) {
    log_line("INFO", msg.as_ref());
}

pub fn log_warn(msg: impl AsRef<str>) {
    log_line("WARN", msg.as_ref());
}

pub fn log_error(msg: impl AsRef<str>) {
    log_line("ERROR", msg.as_ref());
}

