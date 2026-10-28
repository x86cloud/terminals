use crate::container::docker::manager::DockerClient;
use crate::container::docker::types::DockerVolumeInfo;
use crate::container::docker::utils::{i64_field, str_field, str_map_field};
use crate::AppState;
use serde_json::Value;
use std::collections::HashMap;
use tauri::State;

impl DockerClient {
    pub async fn list_volumes(&self) -> Result<Vec<DockerVolumeInfo>, String> {
        let resp = self
            .cli
            .list_volumes(None::<bollard::volume::ListVolumesOptions<String>>)
            .await
            .map_err(|e| e.to_string())?;

        let v = serde_json::to_value(&resp).unwrap_or_default();
        let mut res = Vec::new();
        if let Some(vols) = v.get("Volumes").or_else(|| v.get("volumes")).and_then(|x| x.as_array()) {
            for vol in vols {
                let mut size = 0i64;
                let mut ref_count = 0i64;
                if let Some(usage) = vol.get("UsageData").or_else(|| vol.get("usageData")) {
                    size = i64_field(usage, &["Size", "size"]);
                    ref_count = i64_field(usage, &["RefCount", "refCount"]);
                }
                res.push(DockerVolumeInfo {
                    name: str_field(vol, &["Name", "name"]),
                    driver: str_field(vol, &["Driver", "driver"]),
                    scope: str_field(vol, &["Scope", "scope"]),
                    mountpoint: str_field(vol, &["Mountpoint", "mountpoint"]),
                    created_at: str_field(vol, &["CreatedAt", "createdAt"]),
                    labels: str_map_field(vol, &["Labels", "labels"]),
                    size,
                    ref_count,
                });
            }
        }
        Ok(res)
    }

    pub async fn create_volume(
        &self,
        name: String,
        driver: String,
        labels: HashMap<String, String>,
    ) -> Result<DockerVolumeInfo, String> {
        let opts = bollard::volume::CreateVolumeOptions {
            name,
            driver,
            labels,
            ..Default::default()
        };
        let vol = self
            .cli
            .create_volume(opts)
            .await
            .map_err(|e| e.to_string())?;
        let v = serde_json::to_value(&vol).unwrap_or_default();
        Ok(DockerVolumeInfo {
            name: str_field(&v, &["Name", "name"]),
            driver: str_field(&v, &["Driver", "driver"]),
            scope: str_field(&v, &["Scope", "scope"]),
            mountpoint: str_field(&v, &["Mountpoint", "mountpoint"]),
            created_at: str_field(&v, &["CreatedAt", "createdAt"]),
            labels: str_map_field(&v, &["Labels", "labels"]),
            size: 0,
            ref_count: 0,
        })
    }

    pub async fn remove_volume(&self, name: &str, force: bool) -> Result<(), String> {
        self.cli
            .remove_volume(name, Some(bollard::volume::RemoveVolumeOptions { force }))
            .await
            .map_err(|e| e.to_string())
    }
}

// ======================== Tauri Commands ========================

#[tauri::command]
pub async fn docker_list_volumes(
    state: State<'_, AppState>,
    id: String,
) -> Result<Vec<Value>, String> {
    let cli = state.docker.get_client(&id).await?;
    let list = cli.list_volumes().await?;
    list.into_iter()
        .map(|v| serde_json::to_value(v).map_err(|e| e.to_string()))
        .collect()
}

#[tauri::command]
pub async fn docker_create_volume(
    state: State<'_, AppState>,
    id: String,
    name: String,
    driver: String,
    labels: HashMap<String, String>,
) -> Result<Value, String> {
    let cli = state.docker.get_client(&id).await?;
    let v = cli.create_volume(name, driver, labels).await?;
    serde_json::to_value(v).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn docker_remove_volume(
    state: State<'_, AppState>,
    id: String,
    name: String,
    force: bool,
) -> Result<(), String> {
    let cli = state.docker.get_client(&id).await?;
    cli.remove_volume(&name, force).await
}
