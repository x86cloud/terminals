use crate::core::{
    set_app_quitting, AppSettings, AppVersionInfo, UpdateCheckResult, APP_VERSION, BUILD_DATE,
    GIT_COMMIT,
};
use crate::storage;
use crate::AppState;
use chrono::Local;
use serde::Deserialize;
use tauri::{AppHandle, Manager, State};

#[derive(Deserialize)]
struct GitHubTagItem {
    name: String,
}

fn parse_semver(ver: &str) -> Vec<i32> {
    let main_ver = ver.split('-').next().unwrap_or(ver);
    main_ver
        .split('.')
        .map(|s| s.parse::<i32>().unwrap_or(0))
        .collect()
}

pub fn compare_versions(v1: &str, v2: &str) -> i32 {
    let clean1 = v1.trim_start_matches(['v', 'V']);
    let clean2 = v2.trim_start_matches(['v', 'V']);
    if clean1 == "dev" && clean2 != "dev" {
        return -1;
    }
    if clean1 != "dev" && clean2 == "dev" {
        return 1;
    }
    let parts1 = parse_semver(clean1);
    let parts2 = parse_semver(clean2);
    let max_len = parts1.len().max(parts2.len());
    for i in 0..max_len {
        let val1 = parts1.get(i).copied().unwrap_or(0);
        let val2 = parts2.get(i).copied().unwrap_or(0);
        if val1 < val2 {
            return -1;
        }
        if val1 > val2 {
            return 1;
        }
    }
    0
}

#[tauri::command]
pub async fn get_app_version() -> Result<AppVersionInfo, String> {
    Ok(AppVersionInfo {
        version: APP_VERSION.to_string(),
        git_commit: GIT_COMMIT.to_string(),
        build_date: BUILD_DATE.to_string(),
        go_version: "Rust/Tauri v2".to_string(),
        platform: format!("{}/{}", std::env::consts::OS, std::env::consts::ARCH),
    })
}

#[tauri::command]
pub async fn check_for_updates() -> Result<UpdateCheckResult, String> {
    let repo_url = "https://github.com/x86cloud/terminals".to_string();
    let now_str = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;

    let resp = client
        .get("https://api.github.com/repos/x86cloud/terminals/tags?per_page=5")
        .header("User-Agent", format!("xTerminal/{}", APP_VERSION))
        .header("Accept", "application/vnd.github.v3+json")
        .send()
        .await;

    let resp = match resp {
        Ok(r) => r,
        Err(e) => {
            return Ok(UpdateCheckResult {
                current_version: APP_VERSION.to_string(),
                latest_version: APP_VERSION.to_string(),
                has_update: false,
                release_url: format!("{}/releases", repo_url),
                repo_url,
                checked_at: now_str,
                error_message: Some(format!("连接 GitHub API 失败，请检查网络设置: {}", e)),
            });
        }
    };

    if !resp.status().is_success() {
        return Ok(UpdateCheckResult {
            current_version: APP_VERSION.to_string(),
            latest_version: APP_VERSION.to_string(),
            has_update: false,
            release_url: format!("{}/releases", repo_url),
            repo_url,
            checked_at: now_str,
            error_message: Some(format!(
                "GitHub 返回状态异常 ({}): 可能遇到 API 请求速率限制，请稍后重试",
                resp.status().as_u16()
            )),
        });
    }

    let tags: Vec<GitHubTagItem> = match resp.json().await {
        Ok(t) => t,
        Err(e) => {
            return Ok(UpdateCheckResult {
                current_version: APP_VERSION.to_string(),
                latest_version: APP_VERSION.to_string(),
                has_update: false,
                release_url: format!("{}/releases", repo_url),
                repo_url,
                checked_at: now_str,
                error_message: Some(format!("解析版本数据失败: {}", e)),
            });
        }
    };

    if tags.is_empty() {
        return Ok(UpdateCheckResult {
            current_version: APP_VERSION.to_string(),
            latest_version: APP_VERSION.to_string(),
            has_update: false,
            release_url: format!("{}/releases", repo_url),
            repo_url,
            checked_at: now_str,
            error_message: None,
        });
    }

    let latest_tag = tags[0].name.clone();
    let has_update = compare_versions(APP_VERSION, &latest_tag) < 0;
    let release_url = format!("{}/releases/tag/{}", repo_url, latest_tag);

    Ok(UpdateCheckResult {
        current_version: APP_VERSION.to_string(),
        latest_version: latest_tag,
        has_update,
        release_url,
        repo_url,
        checked_at: now_str,
        error_message: None,
    })
}

#[tauri::command]
pub async fn open_browser(target_url: String) -> Result<(), String> {
    let trimmed = target_url.trim();
    let lower = trimmed.to_ascii_lowercase();
    if !lower.starts_with("http://") && !lower.starts_with("https://") {
        return Err("仅支持通过系统浏览器打开 http:// 或 https:// 协议链接".to_string());
    }
    storage::log_info(format!("调用系统浏览器打开 URL: {}", trimmed));
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("rundll32")
            .args(["url.dll,FileProtocolHandler", trimmed])
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(trimmed)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(trimmed)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub async fn close_active_connections_and_exit(app: AppHandle) {
    set_app_quitting(true);
    if let Some(state) = app.try_state::<AppState>() {
        let _ = tokio::time::timeout(
            std::time::Duration::from_millis(800),
            state.ssh.close_all(),
        )
        .await;
    }
    app.exit(0);
}

#[tauri::command]
pub async fn hide_window(app: AppHandle) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.hide();
    }
    Ok(())
}

#[tauri::command]
pub async fn quit_app(app: AppHandle) -> Result<(), String> {
    close_active_connections_and_exit(app).await;
    Ok(())
}

#[tauri::command]
pub async fn get_app_settings(state: State<'_, AppState>) -> Result<AppSettings, String> {
    Ok(state.store.get_settings())
}

#[tauri::command]
pub async fn save_app_settings(
    state: State<'_, AppState>,
    settings: AppSettings,
) -> Result<AppSettings, String> {
    let saved = state.store.save_settings(settings)?;
    state.agent.update_settings(saved.clone());
    Ok(saved)
}

