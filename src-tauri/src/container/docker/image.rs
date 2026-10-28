use crate::container::docker::manager::DockerClient;
use crate::container::docker::types::DockerImageInfo;
use crate::container::docker::utils::{format_bytes, i64_field, str_field, str_map_field};
use crate::AppState;
use futures_util::StreamExt;
use serde_json::Value;
use tauri::{AppHandle, State};
use tokio::io::AsyncWriteExt;

impl DockerClient {
    pub async fn list_images(&self) -> Result<Vec<DockerImageInfo>, String> {
        let opts = bollard::image::ListImagesOptions::<String> {
            all: true,
            ..Default::default()
        };
        let images = self
            .cli
            .list_images(Some(opts))
            .await
            .map_err(|e| e.to_string())?;

        let mut res = Vec::with_capacity(images.len());
        for img in images {
            let v = serde_json::to_value(&img).unwrap_or_default();
            let id = str_field(&v, &["Id", "id"]);
            let trimmed = id.strip_prefix("sha256:").unwrap_or(&id);
            let short_id = if trimmed.len() > 12 {
                trimmed[..12].to_string()
            } else {
                trimmed.to_string()
            };

            let repo_tags: Vec<String> = v
                .get("RepoTags")
                .and_then(|x| x.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|i| i.as_str().map(|s| s.to_string()))
                        .collect()
                })
                .unwrap_or_default();

            let mut repo = "<none>".to_string();
            let mut tag = "<none>".to_string();
            if let Some(first) = repo_tags.first() {
                if first != "<none>:<none>" {
                    if let Some((r, t)) = first.rsplit_once(':') {
                        repo = r.to_string();
                        tag = t.to_string();
                    } else {
                        repo = first.clone();
                    }
                }
            }

            let size = i64_field(&v, &["Size", "size"]);
            let labels = str_map_field(&v, &["Labels", "labels"]);

            res.push(DockerImageInfo {
                id,
                short_id,
                repo_tags,
                repository: repo,
                tag,
                size,
                size_str: format_bytes(size),
                created: i64_field(&v, &["Created", "created"]),
                containers: i64_field(&v, &["Containers", "containers"]),
                labels,
            });
        }
        Ok(res)
    }

    pub async fn inspect_image(&self, image_id: &str) -> Result<String, String> {
        let info = self
            .cli
            .inspect_image(image_id)
            .await
            .map_err(|e| e.to_string())?;
        serde_json::to_string_pretty(&info).map_err(|e| e.to_string())
    }

    pub async fn pull_image(&self, image_name: &str) -> Result<String, String> {
        let opts = bollard::image::CreateImageOptions {
            from_image: image_name,
            ..Default::default()
        };
        let mut stream = self.cli.create_image(Some(opts), None, None);
        let mut out = String::new();
        while let Some(item) = stream.next().await {
            match item {
                Ok(msg) => {
                    let v = serde_json::to_value(&msg).unwrap_or_default();
                    let err_msg = str_field(&v, &["error", "Error"]);
                    if !err_msg.is_empty() {
                        return Err(format!("拉取失败: {}", err_msg));
                    }
                    let status = str_field(&v, &["status", "Status"]);
                    let progress = str_field(&v, &["progress", "Progress"]);
                    let id = str_field(&v, &["id", "Id"]);
                    if !id.is_empty() {
                        out.push_str(&format!("[{}] {} {}\n", id, status, progress));
                    } else {
                        out.push_str(&format!("{}\n", status));
                    }
                }
                Err(e) => return Err(format!("拉取失败: {}", e)),
            }
        }
        Ok(out)
    }

    pub async fn remove_image(&self, image_id: &str, force: bool) -> Result<(), String> {
        let opts = bollard::image::RemoveImageOptions {
            force,
            noprune: false,
        };
        self.cli
            .remove_image(image_id, Some(opts), None)
            .await
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub async fn save_image(&self, image_id_or_tag: &str, dest_path: &str) -> Result<(), String> {
        let mut stream = self.cli.export_image(image_id_or_tag);
        let mut file = tokio::fs::File::create(dest_path)
            .await
            .map_err(|e| format!("创建导出目标文件失败 ({}): {}", dest_path, e))?;
        while let Some(chunk_res) = stream.next().await {
            let chunk = chunk_res.map_err(|e| format!("导出镜像失败: {}", e))?;
            file.write_all(&chunk)
                .await
                .map_err(|e| format!("写入镜像数据到本地文件失败: {}", e))?;
        }
        file.flush().await.map_err(|e| e.to_string())?;
        Ok(())
    }

    pub async fn load_image(&self, src_path: &str, quiet: bool) -> Result<String, String> {
        let bytes = tokio::fs::read(src_path)
            .await
            .map_err(|e| format!("打开镜像文件失败 ({}): {}", src_path, e))?;
        let opts = bollard::image::ImportImageOptions { quiet };
        let mut stream = self.cli.import_image(opts, bytes.into(), None);
        let mut out = String::new();
        while let Some(item) = stream.next().await {
            match item {
                Ok(info) => {
                    if let Some(s) = &info.stream {
                        out.push_str(s);
                    } else if let Some(s) = &info.status {
                        out.push_str(s);
                    }
                    if let Some(err) = &info.error {
                        return Err(format!("导入镜像失败: {}", err));
                    }
                }
                Err(e) => return Err(format!("导入镜像失败: {}", e)),
            }
        }
        Ok(out)
    }
}

// ======================== Tauri Commands ========================

#[tauri::command]
pub async fn docker_list_images(
    state: State<'_, AppState>,
    id: String,
) -> Result<Vec<Value>, String> {
    let cli = state.docker.get_client(&id).await?;
    let list = cli.list_images().await?;
    list.into_iter()
        .map(|img| serde_json::to_value(img).map_err(|e| e.to_string()))
        .collect()
}

#[tauri::command]
pub async fn docker_inspect_image(
    state: State<'_, AppState>,
    id: String,
    image_id: String,
) -> Result<String, String> {
    let cli = state.docker.get_client(&id).await?;
    cli.inspect_image(&image_id).await
}

#[tauri::command]
pub async fn docker_pull_image(
    state: State<'_, AppState>,
    id: String,
    image_name: String,
) -> Result<String, String> {
    let cli = state.docker.get_client(&id).await?;
    cli.pull_image(&image_name).await
}

#[tauri::command]
pub async fn docker_save_image(
    _app: AppHandle,
    state: State<'_, AppState>,
    id: String,
    image_id_or_tag: String,
    default_filename: String,
) -> Result<String, String> {
    let cli = state.docker.get_client(&id).await?;
    let mut clean_name = default_filename.trim().to_string();
    if clean_name.is_empty() {
        clean_name = format!(
            "{}.tar",
            image_id_or_tag.replace(['/', ':'], "_")
        );
    }
    if !clean_name.to_lowercase().ends_with(".tar") {
        clean_name.push_str(".tar");
    }

    let file = rfd::AsyncFileDialog::new()
        .set_title("导出保存 Docker 镜像 (.tar)")
        .set_file_name(&clean_name)
        .save_file()
        .await;

    let save_path = match file {
        Some(f) => f.path().to_string_lossy().to_string(),
        None => return Ok(String::new()),
    };

    cli.save_image(&image_id_or_tag, &save_path).await?;
    Ok(save_path)
}

#[tauri::command]
pub async fn docker_load_image(
    _app: AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> Result<String, String> {
    let cli = state.docker.get_client(&id).await?;
    let file = rfd::AsyncFileDialog::new()
        .set_title("选择要导入的 Docker 镜像包 (.tar)")
        .pick_file()
        .await;

    let file_path = match file {
        Some(f) => f.path().to_string_lossy().to_string(),
        None => return Ok(String::new()),
    };

    cli.load_image(&file_path, false).await
}

#[tauri::command]
pub async fn docker_remove_image(
    state: State<'_, AppState>,
    id: String,
    image_id: String,
    force: bool,
) -> Result<(), String> {
    let cli = state.docker.get_client(&id).await?;
    cli.remove_image(&image_id, force).await
}
