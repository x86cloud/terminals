use crate::ssh::manager::{
    calc_local_paths_stats, download_single_file, download_tree_recursive, mkdir_all_remote,
    query_remote_space, remote_tree_size, remove_remote_recursive, upload_single_file,
    upload_tree_recursive,
};
use crate::ssh::types::{
    base_remote, format_unix_mode, join_remote, parent_remote, shell_quote, DirListing, FileEntry,
    Transfer, UploadEstimate,
};
use crate::AppState;
use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, State};
use tokio::io::AsyncWriteExt;

#[tauri::command]
pub async fn sftp_list_dir(
    state: State<'_, AppState>,
    session_id: String,
    dir: String,
) -> Result<DirListing, String> {
    let session = state.ssh.get_session(&session_id).await?;
    let sftp = session.sftp_conn().await?;

    let mut target = if dir.trim().is_empty() && !session.home_dir.is_empty() {
        session.home_dir.clone()
    } else {
        session.resolve_remote_path(&dir)
    };
    if target.is_empty() {
        target = "/".to_string();
    }

    let read_dir = match sftp.read_dir(&target).await {
        Ok(rd) => rd,
        Err(e) => {
            session.invalidate_sftp().await;
            return Err(format!("读取目录 {} 失败: {}", target, e));
        }
    };

    let mut items = Vec::new();
    for entry in read_dir {
        let name = entry.file_name();
        if name == "." || name == ".." {
            continue;
        }
        let full = join_remote(&target, &name);
        let ft = entry.file_type();
        let meta = entry.metadata();
        let is_link = ft.is_symlink() || meta.is_symlink();
        let mut is_dir = ft.is_dir() || meta.is_dir();
        let mut size = meta.size.unwrap_or(0) as i64;
        let mod_time = meta.mtime.unwrap_or(0) as i64;
        let perm = meta.permissions.unwrap_or(if is_dir { 0o755 } else { 0o644 });

        if is_link {
            if let Ok(st) = sftp.metadata(&full).await {
                is_dir = st.is_dir();
                size = st.size.unwrap_or(0) as i64;
            }
        }

        let mode_str = format_unix_mode(perm, is_dir, is_link);
        items.push(FileEntry {
            name,
            path: full,
            size,
            mode: mode_str.clone(),
            mod_time,
            is_dir,
            is_link,
            is_symlink: is_link,
            permissions: mode_str,
        });
    }

    items.sort_by(|a, b| {
        if a.is_dir != b.is_dir {
            b.is_dir.cmp(&a.is_dir)
        } else {
            a.name.to_lowercase().cmp(&b.name.to_lowercase())
        }
    });

    Ok(DirListing {
        path: target.clone(),
        parent: parent_remote(&target),
        entries: items.clone(),
        items,
        home_dir: session.home_dir.clone(),
    })
}

#[tauri::command]
pub async fn sftp_home_dir(
    state: State<'_, AppState>,
    session_id: String,
) -> Result<String, String> {
    let session = state.ssh.get_session(&session_id).await?;
    if session.home_dir.is_empty() {
        Ok("/".to_string())
    } else {
        Ok(session.home_dir.clone())
    }
}

#[tauri::command]
pub async fn sftp_make_dir(
    app: AppHandle,
    state: State<'_, AppState>,
    session_id: String,
    parent: String,
    name: String,
) -> Result<(), String> {
    let name = name.trim();
    if name.is_empty() {
        return Err("目录名不能为空".to_string());
    }
    let session = state.ssh.get_session(&session_id).await?;
    let parent_resolved = session.resolve_remote_path(&parent);
    let target_dir = join_remote(&parent_resolved, name);

    if let Ok(sftp) = session.sftp_conn().await {
        if mkdir_all_remote(&sftp, &target_dir).await.is_ok() {
            state
                .ssh
                .notify_dir_changed(&app, &session_id, &parent_resolved);
            return Ok(());
        }
    }

    let cmd = format!("mkdir -p {}", shell_quote(&target_dir));
    session.exec_combined(&cmd).await?;
    state
        .ssh
        .notify_dir_changed(&app, &session_id, &parent_resolved);
    Ok(())
}

#[tauri::command]
pub async fn sftp_remove_path(
    app: AppHandle,
    state: State<'_, AppState>,
    session_id: String,
    target: String,
) -> Result<(), String> {
    let session = state.ssh.get_session(&session_id).await?;
    let resolved = session.resolve_remote_path(&target);
    if resolved == "/" {
        return Err("禁止删除根目录".to_string());
    }
    let parent = parent_remote(&resolved);
    let sftp = session.sftp_conn().await?;
    remove_remote_recursive(&sftp, &resolved).await?;
    state.ssh.notify_dir_changed(&app, &session_id, &parent);
    Ok(())
}

#[tauri::command]
pub async fn sftp_remove_paths(
    app: AppHandle,
    state: State<'_, AppState>,
    session_id: String,
    targets: Vec<String>,
) -> Result<(), String> {
    let session = state.ssh.get_session(&session_id).await?;
    let sftp = session.sftp_conn().await?;
    let mut last_parent = String::new();
    for t in targets {
        let resolved = session.resolve_remote_path(&t);
        if resolved == "/" {
            return Err("禁止删除根目录".to_string());
        }
        last_parent = parent_remote(&resolved);
        remove_remote_recursive(&sftp, &resolved).await?;
    }
    if !last_parent.is_empty() {
        state
            .ssh
            .notify_dir_changed(&app, &session_id, &last_parent);
    }
    Ok(())
}

#[tauri::command]
pub async fn sftp_rename_path(
    app: AppHandle,
    state: State<'_, AppState>,
    session_id: String,
    target: String,
    new_name: String,
) -> Result<(), String> {
    let new_name = new_name.trim();
    if new_name.is_empty() {
        return Err("新名称不能为空".to_string());
    }
    let session = state.ssh.get_session(&session_id).await?;
    let target_resolved = session.resolve_remote_path(&target);
    let parent = parent_remote(&target_resolved);
    let dest_resolved = if new_name.contains('/') {
        session.resolve_remote_path(new_name)
    } else {
        join_remote(&parent, new_name)
    };

    if let Ok(sftp) = session.sftp_conn().await {
        if sftp.rename(&target_resolved, &dest_resolved).await.is_ok() {
            state.ssh.notify_dir_changed(&app, &session_id, &parent);
            return Ok(());
        }
    }

    let cmd = format!(
        "mv {} {}",
        shell_quote(&target_resolved),
        shell_quote(&dest_resolved)
    );
    session.exec_combined(&cmd).await?;
    state.ssh.notify_dir_changed(&app, &session_id, &parent);
    Ok(())
}

#[tauri::command]
pub async fn sftp_read_remote_file(
    state: State<'_, AppState>,
    session_id: String,
    remote_path: String,
) -> Result<String, String> {
    let bytes = state
        .ssh
        .read_file_content(&session_id, &remote_path)
        .await?;
    Ok(String::from_utf8_lossy(&bytes).to_string())
}

#[tauri::command]
pub async fn sftp_write_remote_file(
    app: AppHandle,
    state: State<'_, AppState>,
    session_id: String,
    remote_path: String,
    content: String,
) -> Result<(), String> {
    state
        .ssh
        .write_file_content(Some(&app), &session_id, &remote_path, content.as_bytes())
        .await
}

#[tauri::command]
pub async fn sftp_choose_local_files(_app: AppHandle) -> Result<Vec<String>, String> {
    let files = rfd::AsyncFileDialog::new()
        .set_title("选择要上传的文件")
        .pick_files()
        .await;
    Ok(files
        .unwrap_or_default()
        .into_iter()
        .map(|f| f.path().to_string_lossy().to_string())
        .collect())
}

#[tauri::command]
pub async fn sftp_choose_local_folder(_app: AppHandle) -> Result<String, String> {
    let folder = rfd::AsyncFileDialog::new()
        .set_title("选择文件夹")
        .pick_folder()
        .await;
    Ok(folder
        .map(|f| f.path().to_string_lossy().to_string())
        .unwrap_or_default())
}

#[tauri::command]
pub async fn sftp_save_mysql_file(
    _app: AppHandle,
    default_name: String,
) -> Result<String, String> {
    let file = rfd::AsyncFileDialog::new()
        .set_title("导出文件")
        .set_file_name(&default_name)
        .save_file()
        .await;
    Ok(file
        .map(|f| f.path().to_string_lossy().to_string())
        .unwrap_or_default())
}

#[tauri::command]
pub async fn sftp_read_local_file(file_path: String) -> Result<String, String> {
    tokio::fs::read_to_string(&file_path)
        .await
        .map_err(|e| format!("读取本地文件失败 [{}]: {}", file_path, e))
}

#[tauri::command]
pub async fn sftp_write_local_file(file_path: String, content: String) -> Result<(), String> {
    tokio::fs::write(&file_path, content.as_bytes())
        .await
        .map_err(|e| format!("写入本地文件失败 [{}]: {}", file_path, e))
}

#[tauri::command]
pub async fn sftp_read_local_file_base64(file_path: String) -> Result<String, String> {
    let bytes = tokio::fs::read(&file_path)
        .await
        .map_err(|e| format!("读取本地文件失败 [{}]: {}", file_path, e))?;
    Ok(BASE64.encode(bytes))
}

#[tauri::command]
pub async fn sftp_estimate_upload(
    state: State<'_, AppState>,
    session_id: String,
    remote_dir: String,
    local_paths: Vec<String>,
) -> Result<UploadEstimate, String> {
    if local_paths.is_empty() {
        return Ok(UploadEstimate::default());
    }
    let session = state.ssh.get_session(&session_id).await?;
    let (total_size, file_count, folder_count) = calc_local_paths_stats(&local_paths)?;
    let target_dir = session.resolve_remote_path(&remote_dir);
    let (free, total, supported) = query_remote_space(&session, &target_dir).await;
    let is_insufficient = supported && free > 0 && (total_size.max(0) as u64) > free;

    Ok(UploadEstimate {
        total_size,
        file_count,
        folder_count,
        remote_free: free,
        remote_total: total,
        is_insufficient,
        supported,
    })
}

#[tauri::command]
pub async fn sftp_estimate_upload_data(
    state: State<'_, AppState>,
    session_id: String,
    remote_dir: String,
    data_size: i64,
) -> Result<UploadEstimate, String> {
    let session = state.ssh.get_session(&session_id).await?;
    let target_dir = session.resolve_remote_path(&remote_dir);
    let (free, total, supported) = query_remote_space(&session, &target_dir).await;
    let is_insufficient = supported && free > 0 && (data_size.max(0) as u64) > free;

    Ok(UploadEstimate {
        total_size: data_size,
        file_count: 1,
        folder_count: 0,
        remote_free: free,
        remote_total: total,
        is_insufficient,
        supported,
    })
}

#[tauri::command]
pub async fn sftp_upload_paths(
    app: AppHandle,
    state: State<'_, AppState>,
    session_id: String,
    remote_dir: String,
    local_paths: Vec<String>,
) -> Result<(), String> {
    if local_paths.is_empty() {
        return Ok(());
    }
    let session = state.ssh.get_session(&session_id).await?;
    let remote_dir_norm = session.resolve_remote_path(&remote_dir);

    for local_str in local_paths {
        let local_path = PathBuf::from(&local_str);
        let meta = std::fs::metadata(&local_path)
            .map_err(|e| format!("读取本地文件状态失败 [{}]: {}", local_str, e))?;
        let name = local_path
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("file")
            .to_string();
        let remote_path = join_remote(&remote_dir_norm, &name);
        let initial_size = if meta.is_file() { meta.len() as i64 } else { 0 };
        let is_dir = meta.is_dir();

        let (tid, mut cancel_rx) = state.ssh.create_transfer(
            &app,
            &session_id,
            "upload",
            &name,
            &local_str,
            &remote_path,
            initial_size,
        );

        let ssh_mgr = state.ssh.clone();
        let session_clone = session.clone();
        let app_clone = app.clone();
        let sid_clone = session_id.clone();
        let rdir_clone = remote_dir_norm.clone();

        tokio::spawn(async move {
            let res = async {
                let sftp = session_clone.open_new_sftp().await?;
                if is_dir {
                    if let Ok((sz, _, _)) =
                        calc_local_paths_stats(&[local_path.to_string_lossy().to_string()])
                    {
                        ssh_mgr.set_transfer_size(&app_clone, &tid, sz);
                    }
                    upload_tree_recursive(
                        &ssh_mgr,
                        &app_clone,
                        &tid,
                        &mut cancel_rx,
                        &sftp,
                        &local_path,
                        &remote_path,
                    )
                    .await
                } else {
                    upload_single_file(
                        &ssh_mgr,
                        &app_clone,
                        &tid,
                        &mut cancel_rx,
                        &sftp,
                        &local_path,
                        &remote_path,
                    )
                    .await
                }
            }
            .await;

            ssh_mgr.finish_transfer(&app_clone, &tid, res);
            ssh_mgr.notify_dir_changed(&app_clone, &sid_clone, &rdir_clone);
        });
    }

    Ok(())
}

#[tauri::command]
pub async fn sftp_upload_data(
    app: AppHandle,
    state: State<'_, AppState>,
    session_id: String,
    remote_dir: String,
    name: String,
    base64_data: String,
) -> Result<(), String> {
    let session = state.ssh.get_session(&session_id).await?;
    let raw = BASE64
        .decode(base64_data.trim())
        .map_err(|e| format!("数据解码失败: {}", e))?;
    let remote_dir_norm = session.resolve_remote_path(&remote_dir);
    let remote_path = join_remote(&remote_dir_norm, &name);

    let (tid, cancel_rx) = state.ssh.create_transfer(
        &app,
        &session_id,
        "upload",
        &name,
        "",
        &remote_path,
        raw.len() as i64,
    );

    let ssh_mgr = state.ssh.clone();
    let app_clone = app.clone();
    let sid_clone = session_id.clone();
    let rdir_clone = remote_dir_norm.clone();

    tokio::spawn(async move {
        let res = async {
            let sftp = session.open_new_sftp().await?;
            mkdir_all_remote(&sftp, &rdir_clone).await?;
            let mut dst = sftp
                .create(&remote_path)
                .await
                .map_err(|e| format!("创建远程文件失败: {}", e))?;
            let chunk_size = 256 * 1024;
            for chunk in raw.chunks(chunk_size) {
                if *cancel_rx.borrow() {
                    return Err("已取消".to_string());
                }
                dst.write_all(chunk)
                    .await
                    .map_err(|e| format!("写入远程文件失败: {}", e))?;
                ssh_mgr.add_transfer_progress(&app_clone, &tid, chunk.len() as i64);
            }
            let _ = dst.flush().await;
            let _ = dst.shutdown().await;
            Ok(())
        }
        .await;

        ssh_mgr.finish_transfer(&app_clone, &tid, res);
        ssh_mgr.notify_dir_changed(&app_clone, &sid_clone, &rdir_clone);
    });

    Ok(())
}

#[tauri::command]
pub async fn sftp_download_paths(
    app: AppHandle,
    state: State<'_, AppState>,
    session_id: String,
    remote_paths: Vec<String>,
) -> Result<(), String> {
    if remote_paths.is_empty() {
        return Ok(());
    }
    let folder = rfd::AsyncFileDialog::new()
        .set_title("选择保存位置")
        .pick_folder()
        .await;
    let local_dir = match folder {
        Some(f) => f.path().to_string_lossy().to_string(),
        None => return Ok(()),
    };
    if local_dir.is_empty() {
        return Ok(());
    }
    sftp_download_to(app, state, session_id, remote_paths, local_dir).await
}

#[tauri::command]
pub async fn sftp_download_to(
    app: AppHandle,
    state: State<'_, AppState>,
    session_id: String,
    remote_paths: Vec<String>,
    local_dir: String,
) -> Result<(), String> {
    if remote_paths.is_empty() {
        return Ok(());
    }
    let session = state.ssh.get_session(&session_id).await?;
    let sftp_check = session.sftp_conn().await?;

    for remote_raw in remote_paths {
        let remote_norm = session.resolve_remote_path(&remote_raw);
        let meta = sftp_check
            .metadata(&remote_norm)
            .await
            .map_err(|e| format!("获取远程文件信息失败 [{}]: {}", remote_norm, e))?;
        let name = base_remote(&remote_norm);
        let local_path = Path::new(&local_dir).join(&name);
        let local_str = local_path.to_string_lossy().to_string();
        let is_dir = meta.is_dir();
        let initial_size = if !is_dir {
            meta.size.unwrap_or(0) as i64
        } else {
            0
        };

        let (tid, mut cancel_rx) = state.ssh.create_transfer(
            &app,
            &session_id,
            "download",
            &name,
            &local_str,
            &remote_norm,
            initial_size,
        );

        let ssh_mgr = state.ssh.clone();
        let session_clone = session.clone();
        let app_clone = app.clone();

        tokio::spawn(async move {
            let res = async {
                let sftp = session_clone.open_new_sftp().await?;
                if is_dir {
                    let total_sz = remote_tree_size(&sftp, &remote_norm).await;
                    ssh_mgr.set_transfer_size(&app_clone, &tid, total_sz);
                    download_tree_recursive(
                        &ssh_mgr,
                        &app_clone,
                        &tid,
                        &mut cancel_rx,
                        &sftp,
                        &remote_norm,
                        &local_path,
                    )
                    .await
                } else {
                    download_single_file(
                        &ssh_mgr,
                        &app_clone,
                        &tid,
                        &mut cancel_rx,
                        &sftp,
                        &remote_norm,
                        &local_path,
                    )
                    .await
                }
            }
            .await;

            ssh_mgr.finish_transfer(&app_clone, &tid, res);
        });
    }

    Ok(())
}

#[tauri::command]
pub async fn sftp_list_transfers(state: State<'_, AppState>) -> Result<Vec<Transfer>, String> {
    Ok(state.ssh.list_transfers())
}

#[tauri::command]
pub async fn sftp_cancel_transfer(
    state: State<'_, AppState>,
    id: String,
) -> Result<(), String> {
    state.ssh.cancel_transfer(&id);
    Ok(())
}

#[tauri::command]
pub async fn sftp_clear_finished_transfers(state: State<'_, AppState>) -> Result<(), String> {
    state.ssh.clear_finished_transfers();
    Ok(())
}

