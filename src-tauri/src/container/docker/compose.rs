use chrono::{TimeZone, Utc};
use crate::container::docker::manager::DockerClient;
use crate::AppState;
use crate::container::docker::types::{
    ComposeFileSpec, DockerComposeDeployReq, DockerComposeServiceInfo, DockerComposeStackInfo,
    DockerContainerInfo, COMPOSE_CONFIG_FILES, COMPOSE_CONFIG_HASH,
    COMPOSE_IMAGE_LABEL, COMPOSE_NETWORK_LABEL, COMPOSE_NUMBER_LABEL, COMPOSE_ONEOFF_LABEL,
    COMPOSE_PROJECT_LABEL, COMPOSE_SERVICE_LABEL, COMPOSE_VERSION_LABEL, COMPOSE_VOLUME_LABEL,
    COMPOSE_WORKING_DIR, TERMINAL_COMPOSE_ID_LABEL,
};
use crate::container::docker::utils::{
    compute_service_config_hash, interpolate_env, parse_compose_env, parse_compose_ports,
    parse_compose_volumes, parse_shm_size, parse_string_slice_or_string, resolve_service_networks,
    sanitize_image_name, sanitize_project_name, sort_services_by_dependencies, str_field,
    ServiceNetworkAttachment,
};
use crate::core::DockerComposeRecord;
use serde_json::{json, Value};
use std::collections::HashMap;
use tauri::State;
use uuid::Uuid;

impl DockerClient {
    pub async fn list_compose_stacks(&self) -> Result<Vec<DockerComposeStackInfo>, String> {
        let containers = self.list_containers(true).await?;
        let mut project_map: HashMap<String, DockerComposeStackInfo> = HashMap::new();

        for c in containers {
            let project = c
                .labels
                .get(COMPOSE_PROJECT_LABEL)
                .or_else(|| c.labels.get("io.docker.compose.project"))
                .cloned()
                .unwrap_or_default();
            if project.is_empty() {
                continue;
            }

            let service_name = c
                .labels
                .get(COMPOSE_SERVICE_LABEL)
                .or_else(|| c.labels.get("io.docker.compose.service"))
                .cloned()
                .unwrap_or_else(|| c.name.clone());

            let svc_info = DockerComposeServiceInfo {
                service_name,
                container_id: c.id.clone(),
                short_id: c.short_id.clone(),
                container_name: c.name.clone(),
                image: c.image.clone(),
                state: c.state.clone(),
                status: c.status.clone(),
                ports: c.port_str.clone(),
                health: String::new(),
            };

            let compose_uuid = c
                .labels
                .get(TERMINAL_COMPOSE_ID_LABEL)
                .cloned()
                .unwrap_or_default();

            if let Some(stack) = project_map.get_mut(&project) {
                if stack.uuid.is_empty() && !compose_uuid.is_empty() {
                    stack.uuid = compose_uuid;
                }
                stack.services.push(svc_info);
            } else {
                let cfg_files = c
                    .labels
                    .get(COMPOSE_CONFIG_FILES)
                    .or_else(|| c.labels.get(COMPOSE_WORKING_DIR))
                    .cloned()
                    .unwrap_or_default();
                let created_at = Utc
                    .timestamp_opt(c.created, 0)
                    .single()
                    .map(|dt| dt.format("%Y-%m-%d %H:%M:%S").to_string())
                    .unwrap_or_default();

                project_map.insert(
                    project.clone(),
                    DockerComposeStackInfo {
                        uuid: compose_uuid,
                        name: project,
                        status: String::new(),
                        running_services: 0,
                        total_services: 0,
                        services: vec![svc_info],
                        config_files: cfg_files,
                        yaml_content: String::new(),
                        created_at,
                    },
                );
            }
        }

        let mut res: Vec<DockerComposeStackInfo> = project_map
            .into_values()
            .map(|mut stack| {
                let total = stack.services.len();
                let running = stack
                    .services
                    .iter()
                    .filter(|s| s.state == "running")
                    .count();
                stack.total_services = total;
                stack.running_services = running;
                stack.status = if running == total && total > 0 {
                    "running".to_string()
                } else if running > 0 {
                    "partially_running".to_string()
                } else {
                    "stopped".to_string()
                };
                stack
                    .services
                    .sort_by(|a, b| a.service_name.cmp(&b.service_name));
                stack
            })
            .collect();

        res.sort_by(|a, b| a.name.cmp(&b.name));
        Ok(res)
    }

    pub async fn get_compose_stack(
        &self,
        project_name: &str,
    ) -> Result<Option<DockerComposeStackInfo>, String> {
        let stacks = self.list_compose_stacks().await?;
        Ok(stacks.into_iter().find(|s| s.name == project_name))
    }

    pub async fn control_compose_stack(
        &self,
        project_name: &str,
        action: &str,
    ) -> Result<(), String> {
        let clean_proj = sanitize_project_name(project_name);
        if clean_proj.is_empty() {
            return Err("项目名称不能为空".to_string());
        }

        let all_containers = self.list_containers(true).await?;
        let matched: Vec<DockerContainerInfo> = all_containers
            .into_iter()
            .filter(|c| {
                c.labels.get(COMPOSE_PROJECT_LABEL).map(|s| s.as_str()) == Some(&clean_proj)
                    || c.labels.get("io.docker.compose.project").map(|s| s.as_str())
                        == Some(&clean_proj)
                    || (c.labels.get(TERMINAL_COMPOSE_ID_LABEL).map(|s| s.as_str())
                        == Some(project_name)
                        && !project_name.is_empty())
            })
            .collect();

        match action.to_lowercase().as_str() {
            "start" => {
                for c in matched {
                    if c.state != "running" {
                        let _ = self.control_container(&c.id, "start").await;
                    }
                }
            }
            "stop" => {
                for c in matched {
                    if c.state == "running" {
                        let _ = self.control_container(&c.id, "stop").await;
                    }
                }
            }
            "restart" => {
                for c in matched {
                    let _ = self.control_container(&c.id, "restart").await;
                }
            }
            "down" | "remove" => {
                for c in matched {
                    let _ = self.control_container(&c.id, "stop").await;
                    let _ = self.control_container(&c.id, "forceremove").await;
                }
                if let Ok(nets) = self.list_networks().await {
                    for n in nets {
                        if n.labels.get(COMPOSE_PROJECT_LABEL).map(|s| s.as_str())
                            == Some(&clean_proj)
                            || (n.labels.get(TERMINAL_COMPOSE_ID_LABEL).map(|s| s.as_str())
                                == Some(project_name)
                                && !project_name.is_empty())
                        {
                            let _ = self.remove_network(&n.id).await;
                        }
                    }
                }
            }
            other => return Err(format!("不支持的 Compose 操作: {}", other)),
        }
        Ok(())
    }

    pub async fn get_compose_stack_logs(
        &self,
        project_name: &str,
        tail: i64,
    ) -> Result<String, String> {
        let tail_val = if tail <= 0 { 200 } else { tail };
        let clean_proj = sanitize_project_name(project_name);
        let all_containers = self.list_containers(true).await?;
        let matched: Vec<DockerContainerInfo> = all_containers
            .into_iter()
            .filter(|c| {
                c.labels.get(COMPOSE_PROJECT_LABEL).map(|s| s.as_str()) == Some(&clean_proj)
                    || c.labels.get("io.docker.compose.project").map(|s| s.as_str())
                        == Some(&clean_proj)
            })
            .collect();

        if matched.is_empty() {
            return Ok("该项目当前没有任何容器".to_string());
        }

        let per_container_tail = (tail_val / (matched.len() as i64)) + 20;
        let mut combined = String::new();
        for c in matched {
            let svc_name = c
                .labels
                .get(COMPOSE_SERVICE_LABEL)
                .cloned()
                .unwrap_or_else(|| c.name.clone());
            if let Ok(logs) = self.get_container_logs(&c.id, per_container_tail, true).await {
                for line in logs.lines() {
                    let trimmed = line.trim();
                    if !trimmed.is_empty() {
                        combined.push_str(&format!("[{}] {}\n", svc_name, trimmed));
                    }
                }
            }
        }
        Ok(combined)
    }

    pub async fn up_compose_stack(&self, req: DockerComposeDeployReq) -> Result<(), String> {
        let project_name = sanitize_project_name(&req.project_name);
        if project_name.is_empty() {
            return Err("项目名称 (Project Name) 不能为空".to_string());
        }

        let interpolated = interpolate_env(&req.yaml_content, &req.env_vars);
        let mut spec: ComposeFileSpec = serde_yaml::from_str(&interpolated)
            .map_err(|e| format!("解析 Compose YAML 失败: {}", e))?;

        if spec.services.is_empty() {
            return Err("Compose YAML 中未定义任何服务 (services)".to_string());
        }

        let version = if spec.version.is_empty() {
            "2.24.0".to_string()
        } else {
            spec.version.clone()
        };

        let mut newly_created_containers: Vec<String> = Vec::new();
        let mut newly_created_networks: Vec<String> = Vec::new();

        let existing_containers = self.list_containers(true).await.unwrap_or_default();
        let mut existing_by_service: HashMap<String, DockerContainerInfo> = HashMap::new();
        let mut all_existing_project_containers: Vec<DockerContainerInfo> = Vec::new();

        for c in existing_containers {
            let is_match = (!req.id.is_empty()
                && c.labels.get(TERMINAL_COMPOSE_ID_LABEL) == Some(&req.id))
                || c.labels.get(COMPOSE_PROJECT_LABEL) == Some(&project_name)
                || c.labels.get("io.docker.compose.project") == Some(&project_name);
            if is_match {
                let svc_name = c
                    .labels
                    .get(COMPOSE_SERVICE_LABEL)
                    .or_else(|| c.labels.get("io.docker.compose.service"))
                    .cloned()
                    .unwrap_or_default();
                if !svc_name.is_empty() {
                    existing_by_service.insert(svc_name, c.clone());
                }
                all_existing_project_containers.push(c);
            }
        }
        let is_brand_new_project = all_existing_project_containers.is_empty();

        let res = self
            .up_compose_stack_inner(
                &req,
                &project_name,
                &version,
                &mut spec,
                &existing_by_service,
                &all_existing_project_containers,
                &mut newly_created_containers,
                &mut newly_created_networks,
            )
            .await;

        if res.is_err() {
            for cid in newly_created_containers {
                let _ = self.control_container(&cid, "stop").await;
                let _ = self.control_container(&cid, "forceremove").await;
            }
            if is_brand_new_project {
                for nid in newly_created_networks {
                    let _ = self.remove_network(&nid).await;
                }
            }
        }

        res
    }

    #[allow(clippy::too_many_arguments)]
    async fn up_compose_stack_inner(
        &self,
        req: &DockerComposeDeployReq,
        project_name: &str,
        version: &str,
        spec: &mut ComposeFileSpec,
        existing_by_service: &HashMap<String, DockerContainerInfo>,
        all_existing_project_containers: &[DockerContainerInfo],
        newly_created_containers: &mut Vec<String>,
        newly_created_networks: &mut Vec<String>,
    ) -> Result<(), String> {
        let mut network_map: HashMap<String, String> = HashMap::new();

        // Default network
        let default_net_name = format!("{}_default", project_name);
        let mut default_labels = HashMap::new();
        default_labels.insert(COMPOSE_PROJECT_LABEL.to_string(), project_name.to_string());
        default_labels.insert(COMPOSE_NETWORK_LABEL.to_string(), "default".to_string());
        default_labels.insert(COMPOSE_VERSION_LABEL.to_string(), version.to_string());
        default_labels.insert(TERMINAL_COMPOSE_ID_LABEL.to_string(), req.id.clone());

        let default_net_id = self
            .ensure_network(&default_net_name, "bridge", default_labels)
            .await?;
        network_map.insert("default".to_string(), default_net_id.clone());
        newly_created_networks.push(default_net_id);

        // Custom networks
        for (n_key, n_spec) in &spec.networks {
            if n_spec.external {
                let actual_name = if n_spec.name.is_empty() {
                    n_key.clone()
                } else {
                    n_spec.name.clone()
                };
                network_map.insert(n_key.clone(), actual_name);
                continue;
            }
            let actual_name = if n_spec.name.is_empty() {
                format!("{}_{}", project_name, n_key)
            } else {
                n_spec.name.clone()
            };
            let driver = if n_spec.driver.is_empty() {
                "bridge"
            } else {
                &n_spec.driver
            };
            let mut labels = HashMap::new();
            labels.insert(COMPOSE_PROJECT_LABEL.to_string(), project_name.to_string());
            labels.insert(COMPOSE_NETWORK_LABEL.to_string(), n_key.clone());
            labels.insert(COMPOSE_VERSION_LABEL.to_string(), version.to_string());
            labels.insert(TERMINAL_COMPOSE_ID_LABEL.to_string(), req.id.clone());
            for (k, v) in &n_spec.labels {
                labels.insert(k.clone(), v.clone());
            }
            let n_id = self.ensure_network(&actual_name, driver, labels).await?;
            network_map.insert(n_key.clone(), n_id.clone());
            newly_created_networks.push(n_id);
        }

        // Volumes
        for (v_key, v_spec) in &spec.volumes {
            if v_spec.external {
                continue;
            }
            let actual_vol_name = if v_spec.name.is_empty() {
                format!("{}_{}", project_name, v_key)
            } else {
                v_spec.name.clone()
            };
            let driver = if v_spec.driver.is_empty() {
                "local".to_string()
            } else {
                v_spec.driver.clone()
            };
            let mut labels = HashMap::new();
            labels.insert(COMPOSE_PROJECT_LABEL.to_string(), project_name.to_string());
            labels.insert(COMPOSE_VOLUME_LABEL.to_string(), v_key.clone());
            labels.insert(COMPOSE_VERSION_LABEL.to_string(), version.to_string());
            labels.insert(TERMINAL_COMPOSE_ID_LABEL.to_string(), req.id.clone());
            for (k, v) in &v_spec.labels {
                labels.insert(k.clone(), v.clone());
            }
            let _ = self.create_volume(actual_vol_name, driver, labels).await;
        }

        // Topological sort
        let sorted_services = sort_services_by_dependencies(&spec.services)?;

        // Remove orphan containers
        for c in all_existing_project_containers {
            let svc_name = c
                .labels
                .get(COMPOSE_SERVICE_LABEL)
                .or_else(|| c.labels.get("io.docker.compose.service"))
                .cloned()
                .unwrap_or_default();
            if !svc_name.is_empty() && !spec.services.contains_key(&svc_name) {
                let _ = self.control_container(&c.id, "stop").await;
                let _ = self.control_container(&c.id, "forceremove").await;
            }
        }

        for service_name in sorted_services {
            let mut svc = spec.services.get(&service_name).cloned().unwrap_or_default();
            svc.image = sanitize_image_name(&svc.image);
            spec.services.insert(service_name.clone(), svc.clone());

            if svc.image.is_empty() || svc.image == ":latest" || svc.image.starts_with(':') {
                return Err(format!(
                    "服务 [{}] 镜像名称格式无效 ({:?})，请检查 docker-compose.yml 中的 image 配置或关联的 .env 环境变量",
                    service_name, svc.image
                ));
            }

            let new_hash = compute_service_config_hash(&svc);
            let existing_opt = existing_by_service.get(&service_name);

            let container_name = if svc.container_name.is_empty() {
                format!("{}-{}-1", project_name, service_name)
            } else {
                svc.container_name.clone()
            };

            let mut needs_recreate = true;
            if let Some(existing) = existing_opt {
                if !req.recreate && !req.force_pull {
                    let old_hash = existing
                        .labels
                        .get(COMPOSE_CONFIG_HASH)
                        .map(|s| s.as_str())
                        .unwrap_or("");
                    let has_same_uuid = req.id.is_empty()
                        || existing.labels.get(TERMINAL_COMPOSE_ID_LABEL) == Some(&req.id);
                    let has_same_project = existing
                        .labels
                        .get(COMPOSE_PROJECT_LABEL)
                        .map(|s| s.as_str())
                        == Some(project_name);
                    if old_hash == new_hash
                        && has_same_uuid
                        && has_same_project
                        && existing.state == "running"
                    {
                        needs_recreate = false;
                    }
                }
            }

            if !needs_recreate {
                continue;
            }

            if req.force_pull || !self.has_local_image(&svc.image).await {
                self.pull_image(&svc.image)
                    .await
                    .map_err(|e| format!("拉取服务 [{}] 镜像 [{}] 失败: {}", service_name, svc.image, e))?;
            }

            if let Some(existing) = existing_opt {
                let _ = self.control_container(&existing.id, "stop").await;
                let _ = self.control_container(&existing.id, "forceremove").await;
            }

            if let Ok(Some(conflict_id)) = self.find_container_by_name(&container_name).await {
                let _ = self.control_container(&conflict_id, "stop").await;
                let _ = self.control_container(&conflict_id, "forceremove").await;
            }

            let (port_bindings, mut exposed_ports) = parse_compose_ports(&svc.ports)?;
            for exp in &svc.expose {
                let key = if exp.contains('/') {
                    exp.clone()
                } else {
                    format!("{}/tcp", exp)
                };
                exposed_ports.insert(key, json!({}));
            }

            let env_list = parse_compose_env(&svc.environment);
            let (mounts, binds) =
                parse_compose_volumes(project_name, &svc.volumes, &spec.volumes);

            let cmd = parse_string_slice_or_string(&svc.command);
            let entrypoint = parse_string_slice_or_string(&svc.entrypoint);

            let mut labels = HashMap::new();
            labels.insert(COMPOSE_PROJECT_LABEL.to_string(), project_name.to_string());
            labels.insert(COMPOSE_SERVICE_LABEL.to_string(), service_name.clone());
            labels.insert(COMPOSE_VERSION_LABEL.to_string(), version.to_string());
            labels.insert(COMPOSE_NUMBER_LABEL.to_string(), "1".to_string());
            labels.insert(COMPOSE_ONEOFF_LABEL.to_string(), "False".to_string());
            labels.insert(COMPOSE_IMAGE_LABEL.to_string(), svc.image.clone());
            labels.insert(COMPOSE_CONFIG_HASH.to_string(), new_hash);
            labels.insert(
                COMPOSE_CONFIG_FILES.to_string(),
                "docker-compose.yml".to_string(),
            );
            if !req.id.is_empty() {
                labels.insert(TERMINAL_COMPOSE_ID_LABEL.to_string(), req.id.clone());
            }
            for (k, v) in &svc.labels {
                labels.insert(k.clone(), v.clone());
            }

            let restart_policy = match svc.restart.to_lowercase().as_str() {
                "always" => json!({"Name": "always"}),
                "unless-stopped" => json!({"Name": "unless-stopped"}),
                "on-failure" => json!({"Name": "on-failure", "MaximumRetryCount": 5}),
                _ => json!({"Name": "no"}),
            };

            let dns_list = parse_string_slice_or_string(&svc.dns);
            let shm_bytes = parse_shm_size(&svc.shm_size);

            let mut host_cfg = json!({
                "PortBindings": port_bindings,
                "Binds": binds,
                "Mounts": mounts,
                "RestartPolicy": restart_policy,
                "Privileged": svc.privileged,
            });
            if !svc.cap_add.is_empty() {
                host_cfg["CapAdd"] = json!(svc.cap_add);
            }
            if !svc.cap_drop.is_empty() {
                host_cfg["CapDrop"] = json!(svc.cap_drop);
            }
            if !svc.extra_hosts.is_empty() {
                host_cfg["ExtraHosts"] = json!(svc.extra_hosts);
            }
            if !dns_list.is_empty() {
                host_cfg["Dns"] = json!(dns_list);
            }
            if shm_bytes > 0 {
                host_cfg["ShmSize"] = json!(shm_bytes);
            }
            if let Some(logging) = &svc.logging {
                if !logging.driver.is_empty() {
                    host_cfg["LogConfig"] = json!({
                        "Type": logging.driver,
                        "Config": logging.options,
                    });
                }
            }
            if !svc.network_mode.is_empty() {
                host_cfg["NetworkMode"] = json!(svc.network_mode);
            }

            let mut target_networks =
                resolve_service_networks(project_name, &svc.networks, &network_map);
            if target_networks.is_empty() {
                if let Some(def_net) = network_map.get("default") {
                    target_networks.push(ServiceNetworkAttachment {
                        network_id: def_net.clone(),
                        aliases: vec![service_name.clone(), container_name.clone()],
                        ipv4_address: String::new(),
                    });
                }
            }

            let mut cfg_json = json!({
                "Image": svc.image,
                "Env": env_list,
                "Labels": labels,
                "Tty": svc.tty,
                "OpenStdin": svc.stdin_open,
                "ExposedPorts": exposed_ports,
                "HostConfig": host_cfg,
            });
            if !cmd.is_empty() {
                cfg_json["Cmd"] = json!(cmd);
            }
            if !entrypoint.is_empty() {
                cfg_json["Entrypoint"] = json!(entrypoint);
            }
            if !svc.working_dir.is_empty() {
                cfg_json["WorkingDir"] = json!(svc.working_dir);
            }
            if !svc.user.is_empty() {
                cfg_json["User"] = json!(svc.user);
            }
            if !svc.hostname.is_empty() {
                cfg_json["Hostname"] = json!(svc.hostname);
            }
            if !svc.stop_signal.is_empty() {
                cfg_json["StopSignal"] = json!(svc.stop_signal);
            }

            if let Some(primary) = target_networks.first() {
                let mut ep = json!({
                    "NetworkID": primary.network_id,
                    "Aliases": primary.aliases,
                });
                if !primary.ipv4_address.is_empty() {
                    ep["IPAddress"] = json!(primary.ipv4_address);
                }
                let mut endpoints = serde_json::Map::new();
                endpoints.insert(primary.network_id.clone(), ep);
                cfg_json["NetworkingConfig"] = json!({
                    "EndpointsConfig": endpoints,
                });
            }

            let container_config: bollard::container::Config<String> =
                serde_json::from_value(cfg_json)
                    .map_err(|e| format!("构建容器 [{}] 配置失败: {}", container_name, e))?;

            let created = self
                .cli
                .create_container(
                    Some(bollard::container::CreateContainerOptions {
                        name: container_name.as_str(),
                        platform: None,
                    }),
                    container_config,
                )
                .await
                .map_err(|e| format!("创建容器 [{}] 失败: {}", container_name, e))?;

            newly_created_containers.push(created.id.clone());

            for net_attach in target_networks.iter().skip(1) {
                let ep_cfg: bollard::models::EndpointSettings = serde_json::from_value(json!({
                    "NetworkID": net_attach.network_id,
                    "Aliases": net_attach.aliases,
                    "IPAddress": net_attach.ipv4_address,
                }))
                .unwrap_or_default();
                let _ = self
                    .cli
                    .connect_network(
                        &net_attach.network_id,
                        bollard::network::ConnectNetworkOptions {
                            container: created.id.clone(),
                            endpoint_config: ep_cfg,
                        },
                    )
                    .await;
            }

            self.cli
                .start_container(
                    &created.id,
                    None::<bollard::container::StartContainerOptions<String>>,
                )
                .await
                .map_err(|e| format!("启动容器 [{}] 失败: {}", container_name, e))?;
        }

        Ok(())
    }

    async fn ensure_network(
        &self,
        net_name: &str,
        driver: &str,
        labels: HashMap<String, String>,
    ) -> Result<String, String> {
        if let Ok(nets) = self.list_networks().await {
            if let Some(found) = nets.into_iter().find(|n| n.name == net_name) {
                return Ok(found.id);
            }
        }
        let opts = bollard::network::CreateNetworkOptions {
            name: net_name.to_string(),
            driver: driver.to_string(),
            labels,
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

    async fn has_local_image(&self, image_name: &str) -> bool {
        self.cli.inspect_image(image_name).await.is_ok()
    }

    async fn find_container_by_name(&self, name: &str) -> Result<Option<String>, String> {
        let list = self.list_containers(true).await?;
        let clean = name.trim_start_matches('/');
        for c in list {
            if c.name == clean || c.names.iter().any(|n| n == clean) {
                return Ok(Some(c.id));
            }
        }
        Ok(None)
    }
}

// ======================== Tauri Commands ========================

#[tauri::command]
pub async fn docker_list_compose_stacks(
    state: State<'_, AppState>,
    id: String,
) -> Result<Vec<Value>, String> {
    let cli = state.docker.get_client(&id).await?;
    let stacks = cli.list_compose_stacks().await?;
    stacks
        .into_iter()
        .map(|s| serde_json::to_value(s).map_err(|e| e.to_string()))
        .collect()
}

#[tauri::command]
pub async fn docker_get_compose_stack(
    state: State<'_, AppState>,
    id: String,
    project_name: String,
) -> Result<Option<Value>, String> {
    let cli = state.docker.get_client(&id).await?;
    match cli.get_compose_stack(&project_name).await? {
        Some(s) => Ok(Some(serde_json::to_value(s).map_err(|e| e.to_string())?)),
        None => Ok(None),
    }
}

#[tauri::command]
pub async fn docker_deploy_compose_stack(
    state: State<'_, AppState>,
    id: String,
    req: Value,
) -> Result<(), String> {
    let cli = state.docker.get_client(&id).await?;
    let parsed: DockerComposeDeployReq =
        serde_json::from_value(req).map_err(|e| format!("参数解析失败: {}", e))?;
    cli.up_compose_stack(parsed).await
}

#[tauri::command]
pub async fn docker_control_compose_stack(
    state: State<'_, AppState>,
    id: String,
    project_name: String,
    action: String,
) -> Result<(), String> {
    let cli = state.docker.get_client(&id).await?;
    cli.control_compose_stack(&project_name, &action).await
}

#[tauri::command]
pub async fn docker_get_compose_stack_logs(
    state: State<'_, AppState>,
    id: String,
    project_name: String,
    tail: i64,
) -> Result<String, String> {
    let cli = state.docker.get_client(&id).await?;
    cli.get_compose_stack_logs(&project_name, tail).await
}

#[tauri::command]
pub async fn docker_list_compose_records(
    state: State<'_, AppState>,
    server_id: String,
) -> Result<Vec<DockerComposeRecord>, String> {
    Ok(state.store.list_compose_records(&server_id))
}

#[tauri::command]
pub async fn docker_get_compose_record(
    state: State<'_, AppState>,
    id: String,
) -> Result<Option<DockerComposeRecord>, String> {
    Ok(state.store.get_compose_record(&id))
}

#[tauri::command]
pub async fn docker_save_compose_record(
    state: State<'_, AppState>,
    record: DockerComposeRecord,
) -> Result<Option<DockerComposeRecord>, String> {
    let saved = state.store.save_compose_record(record)?;
    Ok(Some(saved))
}

#[tauri::command]
pub async fn docker_delete_compose_record(
    state: State<'_, AppState>,
    server_id: String,
    id: String,
) -> Result<(), String> {
    if let Some(rec) = state.store.get_compose_record(&id) {
        if !server_id.is_empty() {
            if let Ok(cli) = state.docker.get_client(&server_id).await {
                if !rec.project_name.is_empty() {
                    let _ = cli.control_compose_stack(&rec.project_name, "down").await;
                }
                let _ = cli.control_compose_stack(&rec.id, "down").await;
            }
        }
    }
    state.store.delete_compose_record(&id)
}

#[tauri::command]
pub async fn docker_up_compose_stack(
    state: State<'_, AppState>,
    server_id: String,
    mut record: DockerComposeRecord,
    force_pull: bool,
    recreate: bool,
) -> Result<Option<DockerComposeRecord>, String> {
    record.server_id = server_id.clone();
    if record.id.is_empty() {
        record.id = Uuid::new_v4().to_string();
    }

    let cli = state.docker.get_client(&server_id).await?;
    let req = DockerComposeDeployReq {
        id: record.id.clone(),
        project_name: record.project_name.clone(),
        yaml_content: record.yaml_content.clone(),
        env_vars: record.env_vars.clone(),
        force_pull,
        recreate,
    };

    cli.up_compose_stack(req).await?;
    let saved = state.store.save_compose_record(record)?;
    Ok(Some(saved))
}
