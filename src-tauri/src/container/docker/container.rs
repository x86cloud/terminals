use crate::container::docker::manager::{DockerClient, DockerManager};
use crate::container::docker::types::{DockerContainerInfo, DockerCreateContainerReq, DockerPortMapping};
use crate::container::docker::utils::{i64_field, parse_port_strings, str_field, str_map_field};
use crate::AppState;
use futures_util::StreamExt;
use serde_json::{json, Value};
use std::time::Duration;
use tauri::{AppHandle, Emitter, State};
use uuid::Uuid;

impl DockerClient {
    pub async fn list_containers(&self, all: bool) -> Result<Vec<DockerContainerInfo>, String> {
        let opts = bollard::container::ListContainersOptions::<String> {
            all,
            ..Default::default()
        };
        let list = self
            .cli
            .list_containers(Some(opts))
            .await
            .map_err(|e| format!("读取容器列表失败: {}", e))?;

        let mut res = Vec::with_capacity(list.len());
        for c in list {
            let v = serde_json::to_value(&c).unwrap_or_default();
            let id = str_field(&v, &["Id", "id"]);
            let short_id = if id.len() > 12 {
                id[..12].to_string()
            } else {
                id.clone()
            };
            let clean_names: Vec<String> = v
                .get("Names")
                .and_then(|x| x.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|item| item.as_str())
                        .map(|s| s.trim_start_matches('/').to_string())
                        .collect()
                })
                .unwrap_or_default();
            let name = clean_names.first().cloned().unwrap_or_default();

            let mut ports = Vec::new();
            let mut port_strs = Vec::new();
            if let Some(p_arr) = v.get("Ports").and_then(|x| x.as_array()) {
                for p in p_arr {
                    let ip = str_field(p, &["IP", "ip"]);
                    let private_port = i64_field(p, &["PrivatePort", "privatePort"]) as u16;
                    let public_port = i64_field(p, &["PublicPort", "publicPort"]) as u16;
                    let port_type = {
                        let t = str_field(p, &["Type", "type"]);
                        if t.is_empty() {
                            "tcp".to_string()
                        } else {
                            t
                        }
                    };
                    ports.push(DockerPortMapping {
                        ip,
                        private_port,
                        public_port,
                        port_type: port_type.clone(),
                    });
                    if public_port > 0 {
                        port_strs.push(format!("{}->{}/{}", public_port, private_port, port_type));
                    } else {
                        port_strs.push(format!("{}/{}", private_port, port_type));
                    }
                }
            }

            let mut ip_address = String::new();
            if let Some(nets) = v
                .get("NetworkSettings")
                .and_then(|ns| ns.get("Networks"))
                .and_then(|n| n.as_object())
            {
                for (_, net_cfg) in nets {
                    let ip = str_field(net_cfg, &["IPAddress", "ipAddress"]);
                    if !ip.is_empty() {
                        ip_address = ip;
                        break;
                    }
                }
            }

            let labels = str_map_field(&v, &["Labels", "labels"]);

            res.push(DockerContainerInfo {
                id,
                short_id,
                names: clean_names,
                name,
                image: str_field(&v, &["Image", "image"]),
                image_id: str_field(&v, &["ImageID", "imageId"]),
                command: str_field(&v, &["Command", "command"]),
                created: i64_field(&v, &["Created", "created"]),
                state: str_field(&v, &["State", "state"]),
                status: str_field(&v, &["Status", "status"]),
                ports,
                port_str: port_strs.join(", "),
                ip_address,
                size_rw: i64_field(&v, &["SizeRw", "sizeRw"]),
                size_root_fs: i64_field(&v, &["SizeRootFs", "sizeRootFs"]),
                labels,
            });
        }
        Ok(res)
    }

    pub async fn control_container(&self, container_id: &str, action: &str) -> Result<(), String> {
        match action.to_lowercase().as_str() {
            "start" => self
                .cli
                .start_container(
                    container_id,
                    None::<bollard::container::StartContainerOptions<String>>,
                )
                .await
                .map_err(|e| e.to_string()),
            "stop" => self
                .cli
                .stop_container(
                    container_id,
                    Some(bollard::container::StopContainerOptions { t: 10 }),
                )
                .await
                .map_err(|e| e.to_string()),
            "restart" => self
                .cli
                .restart_container(
                    container_id,
                    Some(bollard::container::RestartContainerOptions { t: 10 }),
                )
                .await
                .map_err(|e| e.to_string()),
            "pause" => self
                .cli
                .pause_container(container_id)
                .await
                .map_err(|e| e.to_string()),
            "unpause" => self
                .cli
                .unpause_container(container_id)
                .await
                .map_err(|e| e.to_string()),
            "remove" | "rm" => self
                .cli
                .remove_container(
                    container_id,
                    Some(bollard::container::RemoveContainerOptions {
                        force: false,
                        v: true,
                        ..Default::default()
                    }),
                )
                .await
                .map_err(|e| e.to_string()),
            "forceremove" | "force_remove" | "rm_force" => self
                .cli
                .remove_container(
                    container_id,
                    Some(bollard::container::RemoveContainerOptions {
                        force: true,
                        v: true,
                        ..Default::default()
                    }),
                )
                .await
                .map_err(|e| e.to_string()),
            other => Err(format!("不支持的容器操作: {}", other)),
        }
    }

    pub async fn inspect_container(&self, container_id: &str) -> Result<String, String> {
        let info = self
            .cli
            .inspect_container(
                container_id,
                None::<bollard::container::InspectContainerOptions>,
            )
            .await
            .map_err(|e| e.to_string())?;
        serde_json::to_string_pretty(&info).map_err(|e| e.to_string())
    }

    pub async fn get_container_logs(
        &self,
        container_id: &str,
        tail: i64,
        timestamps: bool,
    ) -> Result<String, String> {
        let tail_str = if tail > 0 {
            tail.to_string()
        } else {
            "all".to_string()
        };
        let opts = bollard::container::LogsOptions::<String> {
            stdout: true,
            stderr: true,
            tail: tail_str,
            timestamps,
            ..Default::default()
        };
        let mut stream = self.cli.logs(container_id, Some(opts));
        let mut buf = String::new();
        while let Some(item) = stream.next().await {
            match item {
                Ok(chunk) => {
                    buf.push_str(&chunk.to_string());
                    if buf.len() >= 10 * 1024 * 1024 {
                        break;
                    }
                }
                Err(e) => return Err(e.to_string()),
            }
        }
        Ok(buf)
    }

    pub async fn create_container(&self, req: DockerCreateContainerReq) -> Result<String, String> {
        let (port_bindings, exposed_ports) = parse_port_strings(&req.ports)?;

        let mut host_cfg = json!({
            "AutoRemove": req.auto_remove,
        });
        if !req.restart_policy.is_empty() {
            host_cfg["RestartPolicy"] = json!({
                "Name": req.restart_policy,
            });
        }
        if req.memory_limit > 0 {
            host_cfg["Memory"] = json!(req.memory_limit * 1024 * 1024);
        }
        if req.cpu_shares > 0 {
            host_cfg["CpuShares"] = json!(req.cpu_shares);
        }
        if !req.network_mode.is_empty() {
            host_cfg["NetworkMode"] = json!(req.network_mode);
        }
        if !req.volumes.is_empty() {
            host_cfg["Binds"] = json!(req.volumes);
        }
        if !port_bindings.is_empty() {
            host_cfg["PortBindings"] = Value::Object(port_bindings);
        }

        let mut cfg_json = json!({
            "Image": req.image,
            "HostConfig": host_cfg,
        });
        if !req.cmd.is_empty() {
            cfg_json["Cmd"] = json!(req.cmd);
        }
        if !req.env.is_empty() {
            cfg_json["Env"] = json!(req.env);
        }
        if !req.labels.is_empty() {
            cfg_json["Labels"] = json!(req.labels);
        }
        if !exposed_ports.is_empty() {
            cfg_json["ExposedPorts"] = Value::Object(exposed_ports);
        }

        let config: bollard::container::Config<String> =
            serde_json::from_value(cfg_json).map_err(|e| format!("构建容器配置失败: {}", e))?;

        let create_opts = if !req.name.trim().is_empty() {
            Some(bollard::container::CreateContainerOptions {
                name: req.name.trim(),
                platform: None,
            })
        } else {
            None
        };

        let resp = self
            .cli
            .create_container(create_opts, config)
            .await
            .map_err(|e| e.to_string())?;
        Ok(resp.id)
    }
}

impl DockerManager {
    pub async fn start_log_stream(
        &self,
        app: AppHandle,
        docker_cli: &DockerClient,
        container_id: &str,
        stream_id: &str,
        tail: i64,
        timestamps: bool,
        follow: bool,
    ) -> Result<String, String> {
        let sid = if stream_id.trim().is_empty() {
            Uuid::new_v4().to_string()
        } else {
            stream_id.trim().to_string()
        };
        let tail_str = if tail > 0 {
            tail.to_string()
        } else {
            "all".to_string()
        };
        let opts = bollard::container::LogsOptions::<String> {
            stdout: true,
            stderr: true,
            follow,
            tail: tail_str,
            timestamps,
            ..Default::default()
        };

        let mut stream = docker_cli.cli.logs(container_id, Some(opts));
        let streams_ref = self.log_streams.clone();
        let sid_clone = sid.clone();
        let server_id = docker_cli.cfg.id.clone();

        let mut guard = self.log_streams.write().await;
        if let Some((_, old_handle)) = guard.remove(&sid) {
            old_handle.abort();
        }

        let join_handle = tokio::spawn(async move {
            let data_ev = format!("docker:logs:data:{}", sid_clone);
            let err_ev = format!("docker:logs:error:{}", sid_clone);
            let closed_ev = format!("docker:logs:closed:{}", sid_clone);

            let mut pending = String::new();
            let mut ticker = tokio::time::interval(Duration::from_millis(50));
            ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);

            loop {
                tokio::select! {
                    item = stream.next() => {
                        match item {
                            Some(Ok(chunk)) => {
                                pending.push_str(&chunk.to_string());
                                if pending.len() >= 16 * 1024 {
                                    let _ = app.emit(&data_ev, std::mem::take(&mut pending));
                                }
                            }
                            Some(Err(e)) => {
                                if !pending.is_empty() {
                                    let _ = app.emit(&data_ev, std::mem::take(&mut pending));
                                }
                                let _ = app.emit(&err_ev, e.to_string());
                                break;
                            }
                            None => {
                                if !pending.is_empty() {
                                    let _ = app.emit(&data_ev, std::mem::take(&mut pending));
                                }
                                break;
                            }
                        }
                    }
                    _ = ticker.tick() => {
                        if !pending.is_empty() {
                            let _ = app.emit(&data_ev, std::mem::take(&mut pending));
                        }
                    }
                }
            }

            streams_ref.write().await.remove(&sid_clone);
            let _ = app.emit(&closed_ev, String::new());
        });

        guard.insert(sid.clone(), (server_id, join_handle.abort_handle()));
        Ok(sid)
    }

    pub async fn stop_log_stream(&self, stream_id: &str) {
        if let Some((_, handle)) = self.log_streams.write().await.remove(stream_id) {
            handle.abort();
        }
    }
}

// ======================== Tauri Commands ========================

#[tauri::command]
pub async fn docker_list_containers(
    state: State<'_, AppState>,
    id: String,
    all: bool,
) -> Result<Vec<Value>, String> {
    let cli = state.docker.get_client(&id).await?;
    let list = cli.list_containers(all).await?;
    list.into_iter()
        .map(|c| serde_json::to_value(c).map_err(|e| e.to_string()))
        .collect()
}

#[tauri::command]
pub async fn docker_control_container(
    state: State<'_, AppState>,
    id: String,
    container_id: String,
    action: String,
) -> Result<(), String> {
    let cli = state.docker.get_client(&id).await?;
    cli.control_container(&container_id, &action).await
}

#[tauri::command]
pub async fn docker_inspect_container(
    state: State<'_, AppState>,
    id: String,
    container_id: String,
) -> Result<String, String> {
    let cli = state.docker.get_client(&id).await?;
    cli.inspect_container(&container_id).await
}

#[tauri::command]
pub async fn docker_get_container_logs(
    state: State<'_, AppState>,
    id: String,
    container_id: String,
    tail: i64,
    timestamps: bool,
) -> Result<String, String> {
    let cli = state.docker.get_client(&id).await?;
    cli.get_container_logs(&container_id, tail, timestamps).await
}

#[tauri::command]
pub async fn docker_create_container(
    state: State<'_, AppState>,
    id: String,
    req: Value,
) -> Result<String, String> {
    let cli = state.docker.get_client(&id).await?;
    let parsed: DockerCreateContainerReq =
        serde_json::from_value(req).map_err(|e| format!("参数解析失败: {}", e))?;
    cli.create_container(parsed).await
}

#[tauri::command]
pub async fn docker_logs_stream_start(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
    container_id: String,
    stream_id: String,
    tail: i64,
    timestamps: bool,
    follow: bool,
) -> Result<String, String> {
    let cli = state.docker.get_client(&id).await?;
    state
        .docker
        .start_log_stream(app, &cli, &container_id, &stream_id, tail, timestamps, follow)
        .await
}

#[tauri::command]
pub async fn docker_logs_stream_stop(
    state: State<'_, AppState>,
    stream_id: String,
) -> Result<(), String> {
    state.docker.stop_log_stream(&stream_id).await;
    Ok(())
}
