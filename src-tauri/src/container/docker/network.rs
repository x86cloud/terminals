use crate::container::docker::manager::DockerClient;
use crate::container::docker::types::DockerNetworkInfo;
use crate::container::docker::utils::{bool_field, str_field, str_map_field};
use crate::AppState;
use serde_json::Value;
use std::collections::HashMap;
use tauri::State;

impl DockerClient {
    pub async fn list_networks(&self) -> Result<Vec<DockerNetworkInfo>, String> {
        let nets = self
            .cli
            .list_networks(None::<bollard::network::ListNetworksOptions<String>>)
            .await
            .map_err(|e| e.to_string())?;

        let mut res = Vec::with_capacity(nets.len());
        for n in nets {
            let v = serde_json::to_value(&n).unwrap_or_default();
            let id = str_field(&v, &["Id", "id"]);
            let short_id = if id.len() > 12 {
                id[..12].to_string()
            } else {
                id.clone()
            };

            let mut subnet = String::new();
            let mut gateway = String::new();
            if let Some(cfg_arr) = v
                .get("IPAM")
                .and_then(|ipam| ipam.get("Config"))
                .and_then(|c| c.as_array())
            {
                if let Some(first) = cfg_arr.first() {
                    subnet = str_field(first, &["Subnet", "subnet"]);
                    gateway = str_field(first, &["Gateway", "gateway"]);
                }
            }

            let mut c_map = HashMap::new();
            if let Some(containers_obj) = v.get("Containers").and_then(|c| c.as_object()) {
                for (cid, ep) in containers_obj {
                    let c_name = str_field(ep, &["Name", "name"]);
                    let ipv4 = str_field(ep, &["IPv4Address", "ipv4Address"]);
                    c_map.insert(cid.clone(), format!("{} ({})", c_name, ipv4));
                }
            }

            res.push(DockerNetworkInfo {
                id,
                short_id,
                name: str_field(&v, &["Name", "name"]),
                driver: str_field(&v, &["Driver", "driver"]),
                scope: str_field(&v, &["Scope", "scope"]),
                internal: bool_field(&v, &["Internal", "internal"]),
                enable_ipv6: bool_field(&v, &["EnableIPv6", "enableIPv6"]),
                subnet,
                gateway,
                containers: c_map,
                labels: str_map_field(&v, &["Labels", "labels"]),
            });
        }
        Ok(res)
    }

    pub async fn create_network(&self, name: String, driver: String) -> Result<String, String> {
        let opts = bollard::network::CreateNetworkOptions {
            name,
            driver: if driver.is_empty() {
                "bridge".to_string()
            } else {
                driver
            },
            ..Default::default()
        };
        let resp = self
            .cli
            .create_network(opts)
            .await
            .map_err(|e| e.to_string())?;
        let v = serde_json::to_value(&resp).unwrap_or_default();
        Ok(str_field(&v, &["Id", "id"]))
    }

    pub async fn remove_network(&self, network_id: &str) -> Result<(), String> {
        self.cli
            .remove_network(network_id)
            .await
            .map_err(|e| e.to_string())
    }
}

// ======================== Tauri Commands ========================

#[tauri::command]
pub async fn docker_list_networks(
    state: State<'_, AppState>,
    id: String,
) -> Result<Vec<Value>, String> {
    let cli = state.docker.get_client(&id).await?;
    let list = cli.list_networks().await?;
    list.into_iter()
        .map(|n| serde_json::to_value(n).map_err(|e| e.to_string()))
        .collect()
}

#[tauri::command]
pub async fn docker_create_network(
    state: State<'_, AppState>,
    id: String,
    name: String,
    driver: String,
) -> Result<String, String> {
    let cli = state.docker.get_client(&id).await?;
    cli.create_network(name, driver).await
}

#[tauri::command]
pub async fn docker_remove_network(
    state: State<'_, AppState>,
    id: String,
    network_id: String,
) -> Result<(), String> {
    let cli = state.docker.get_client(&id).await?;
    cli.remove_network(&network_id).await
}
