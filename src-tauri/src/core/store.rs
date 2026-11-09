use crate::core::crypto::{load_or_create_key, SecretBox};
use crate::core::models::{
    AppSettings, DockerComposeRecord, K8sOrchestrationRecord, ServerConfig, ServerGroup,
};
use crate::core::storage;
use chrono::{Local, Utc};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::RwLock;
use uuid::Uuid;

#[derive(Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
struct ServersFileWrapper {
    servers: Vec<ServerConfig>,
    groups: Vec<ServerGroup>,
    settings: AppSettings,
}

pub struct StoreInner {
    pub servers: Vec<ServerConfig>,
    pub groups: Vec<ServerGroup>,
    pub settings: AppSettings,
    pub composes: Vec<DockerComposeRecord>,
    pub k8s_orchs: Vec<K8sOrchestrationRecord>,
}

pub struct Store {
    file: PathBuf,
    composes_file: PathBuf,
    k8s_orchs_file: PathBuf,
    box_cipher: SecretBox,
    inner: RwLock<StoreInner>,
}

impl Store {
    pub fn new() -> Result<Self, String> {
        storage::ensure_dirs()?;
        let key = load_or_create_key()?;
        let box_cipher = SecretBox::new(&key);
        let file = storage::servers_path();
        let composes_file = storage::composes_path();
        let k8s_orchs_file = storage::k8s_orchestrations_path();

        let store = Self {
            file,
            composes_file,
            k8s_orchs_file,
            box_cipher,
            inner: RwLock::new(StoreInner {
                servers: Vec::new(),
                groups: Vec::new(),
                settings: AppSettings::default(),
                composes: Vec::new(),
                k8s_orchs: Vec::new(),
            }),
        };
        store.load()?;
        Ok(store)
    }

    fn decrypt_server(&self, srv: &mut ServerConfig) {
        srv.password = self.box_cipher.decrypt(&srv.password);
        srv.passphrase = self.box_cipher.decrypt(&srv.passphrase);
        srv.private_key = self.box_cipher.decrypt(&srv.private_key);
        srv.mongo_uri = self.box_cipher.decrypt(&srv.mongo_uri);
        srv.mongo_tls_client_key = self.box_cipher.decrypt(&srv.mongo_tls_client_key);
        srv.postgres_ssh_password = self.box_cipher.decrypt(&srv.postgres_ssh_password);
        srv.postgres_ssh_passphrase = self.box_cipher.decrypt(&srv.postgres_ssh_passphrase);
        srv.postgres_ssh_key_data = self.box_cipher.decrypt(&srv.postgres_ssh_key_data);
    }

    fn encrypt_server(&self, srv: &mut ServerConfig) {
        srv.password = self.box_cipher.encrypt(&srv.password);
        srv.passphrase = self.box_cipher.encrypt(&srv.passphrase);
        srv.private_key = self.box_cipher.encrypt(&srv.private_key);
        srv.mongo_uri = self.box_cipher.encrypt(&srv.mongo_uri);
        srv.mongo_tls_client_key = self.box_cipher.encrypt(&srv.mongo_tls_client_key);
        srv.postgres_ssh_password = self.box_cipher.encrypt(&srv.postgres_ssh_password);
        srv.postgres_ssh_passphrase = self.box_cipher.encrypt(&srv.postgres_ssh_passphrase);
        srv.postgres_ssh_key_data = self.box_cipher.encrypt(&srv.postgres_ssh_key_data);
    }

    fn decrypt_settings(&self, settings: &mut AppSettings) {
        settings.ai_api_key = self.box_cipher.decrypt(&settings.ai_api_key);
        for m in &mut settings.ai_models {
            m.api_key = self.box_cipher.decrypt(&m.api_key);
        }
    }

    fn encrypt_settings(&self, settings: &mut AppSettings) {
        settings.ai_api_key = self.box_cipher.encrypt(&settings.ai_api_key);
        for m in &mut settings.ai_models {
            m.api_key = self.box_cipher.encrypt(&m.api_key);
        }
    }

    fn load(&self) -> Result<(), String> {
        let mut guard = self.inner.write().map_err(|e| e.to_string())?;
        if let Ok(data) = fs::read(&self.file) {
            if let Ok(mut wrapper) = serde_json::from_slice::<ServersFileWrapper>(&data) {
                for s in &mut wrapper.servers {
                    self.decrypt_server(s);
                }
                self.decrypt_settings(&mut wrapper.settings);
                guard.servers = wrapper.servers;
                guard.groups = wrapper.groups;
                if wrapper.settings.theme_mode.is_empty() {
                    guard.settings = AppSettings::default();
                } else {
                    guard.settings = wrapper.settings;
                }
            } else if let Ok(mut legacy) = serde_json::from_slice::<Vec<ServerConfig>>(&data) {
                for s in &mut legacy {
                    self.decrypt_server(s);
                }
                guard.servers = legacy;
            }
        }
        if let Ok(data) = fs::read(&self.composes_file) {
            if let Ok(list) = serde_json::from_slice::<Vec<DockerComposeRecord>>(&data) {
                guard.composes = list;
            }
        }
        if let Ok(data) = fs::read(&self.k8s_orchs_file) {
            if let Ok(list) = serde_json::from_slice::<Vec<K8sOrchestrationRecord>>(&data) {
                guard.k8s_orchs = list;
            }
        }
        Ok(())
    }

    fn persist_servers(&self, guard: &StoreInner) -> Result<(), String> {
        let mut out = guard.servers.clone();
        for s in &mut out {
            self.encrypt_server(s);
        }
        let mut encrypted_settings = guard.settings.clone();
        self.encrypt_settings(&mut encrypted_settings);
        let wrapper = ServersFileWrapper {
            servers: out,
            groups: guard.groups.clone(),
            settings: encrypted_settings,
        };
        storage::write_json_atomic(&self.file, &wrapper)
    }

    pub fn list(&self) -> Vec<ServerConfig> {
        let guard = match self.inner.read() {
            Ok(g) => g,
            Err(_) => return Vec::new(),
        };
        let mut out = guard.servers.clone();
        out.sort_by(|a, b| a.label().to_lowercase().cmp(&b.label().to_lowercase()));
        out
    }

    pub fn get(&self, id: &str) -> Option<ServerConfig> {
        let guard = self.inner.read().ok()?;
        guard.servers.iter().find(|s| s.id == id).cloned()
    }

    pub fn save(&self, mut cfg: ServerConfig) -> Result<ServerConfig, String> {
        cfg.validate()?;
        let ct = cfg.normalized_type().to_string();
        if cfg.port <= 0 {
            cfg.port = match ct.as_str() {
                "redis" => 6379,
                "mysql" => 3306,
                "postgres" => 5432,
                "mqtt" => {
                    if cfg.mqtt_keep_alive <= 0 {
                        cfg.mqtt_keep_alive = 30;
                    }
                    if cfg.mqtt_connect_timeout <= 0 {
                        cfg.mqtt_connect_timeout = 10;
                    }
                    if cfg.mqtt_reconnect_intvl <= 0 {
                        cfg.mqtt_reconnect_intvl = 5;
                    }
                    if cfg.mqtt_proto != "3.1" {
                        cfg.mqtt_proto = "3.1.1".to_string();
                    }
                    1883
                }
                "mongo" => 27017,
                "sqlite" => 0,
                _ => 22,
            };
        }
        if ct == "mongo" {
            if cfg.mongo_auth_source.trim().is_empty() {
                cfg.mongo_auth_source = "admin".to_string();
            }
            if cfg.mongo_connect_timeout <= 0 {
                cfg.mongo_connect_timeout = 10;
            }
            if cfg.mongo_server_select_timeout <= 0 {
                cfg.mongo_server_select_timeout = 10;
            }
            if cfg.mongo_socket_timeout <= 0 {
                cfg.mongo_socket_timeout = 30;
            }
            if cfg.mongo_max_pool_size <= 0 {
                cfg.mongo_max_pool_size = 100;
            }
        }
        if ct == "ssh" && cfg.auth_type != "key" {
            cfg.auth_type = "password".to_string();
        }
        cfg.conn_type = ct;
        cfg.updated_at = Utc::now().timestamp();

        let mut guard = self.inner.write().map_err(|e| e.to_string())?;
        if cfg.id.is_empty() {
            cfg.id = Uuid::new_v4().to_string();
            guard.servers.push(cfg.clone());
        } else if let Some(existing) = guard.servers.iter_mut().find(|s| s.id == cfg.id) {
            *existing = cfg.clone();
        } else {
            guard.servers.push(cfg.clone());
        }
        self.persist_servers(&guard)?;
        Ok(cfg)
    }

    pub fn delete(&self, id: &str) -> Result<(), String> {
        let mut guard = self.inner.write().map_err(|e| e.to_string())?;
        guard.servers.retain(|s| s.id != id);
        self.persist_servers(&guard)
    }

    pub fn get_settings(&self) -> AppSettings {
        let guard = match self.inner.read() {
            Ok(g) => g,
            Err(_) => return AppSettings::default(),
        };
        if guard.settings.theme_mode.is_empty() {
            AppSettings::default()
        } else {
            guard.settings.clone()
        }
    }

    pub fn save_settings(&self, mut settings: AppSettings) -> Result<AppSettings, String> {
        if settings.theme_mode.is_empty() {
            settings.theme_mode = "light".to_string();
        }
        if settings.font_family.is_empty() {
            settings.font_family = "Consolas".to_string();
        }
        if settings.font_size.is_empty() {
            settings.font_size = "13".to_string();
        }
        if settings.db_default_limit.is_empty() {
            settings.db_default_limit = "50".to_string();
        }
        let mut guard = self.inner.write().map_err(|e| e.to_string())?;
        guard.settings = settings.clone();
        self.persist_servers(&guard)?;
        Ok(settings)
    }

    pub fn list_groups(&self) -> Vec<ServerGroup> {
        self.inner
            .read()
            .map(|g| g.groups.clone())
            .unwrap_or_default()
    }

    pub fn save_group(&self, mut grp: ServerGroup) -> Result<ServerGroup, String> {
        let name = grp.name.trim().to_string();
        if name.is_empty() {
            return Err("分组名称不能为空".to_string());
        }
        grp.name = name.clone();
        let mut guard = self.inner.write().map_err(|e| e.to_string())?;
        if grp.id.is_empty() {
            grp.id = Uuid::new_v4().to_string();
            guard.groups.push(grp.clone());
        } else if let Some(existing) = guard.groups.iter_mut().find(|g| g.id == grp.id) {
            existing.name = name;
            grp = existing.clone();
        } else {
            guard.groups.push(grp.clone());
        }
        self.persist_servers(&guard)?;
        Ok(grp)
    }

    pub fn delete_group(&self, id: &str) -> Result<(), String> {
        let mut guard = self.inner.write().map_err(|e| e.to_string())?;
        guard.groups.retain(|g| g.id != id);
        let now = Utc::now().timestamp();
        for srv in &mut guard.servers {
            if srv.group_id == id {
                srv.group_id.clear();
                srv.updated_at = now;
            }
        }
        self.persist_servers(&guard)
    }

    pub fn move_server_to_group(&self, server_id: &str, group_id: &str) -> Result<(), String> {
        let mut guard = self.inner.write().map_err(|e| e.to_string())?;
        if !group_id.is_empty() && !guard.groups.iter().any(|g| g.id == group_id) {
            return Err("目标分组不存在".to_string());
        }
        let srv = guard
            .servers
            .iter_mut()
            .find(|s| s.id == server_id)
            .ok_or_else(|| "服务器不存在".to_string())?;
        srv.group_id = group_id.to_string();
        srv.updated_at = Utc::now().timestamp();
        self.persist_servers(&guard)
    }

    // Compose Records
    pub fn list_compose_records(&self, server_id: &str) -> Vec<DockerComposeRecord> {
        let guard = match self.inner.read() {
            Ok(g) => g,
            Err(_) => return Vec::new(),
        };
        let mut res: Vec<DockerComposeRecord> = guard
            .composes
            .iter()
            .filter(|r| server_id.is_empty() || r.server_id == server_id)
            .cloned()
            .collect();
        res.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
        res
    }

    pub fn get_compose_record(&self, id: &str) -> Option<DockerComposeRecord> {
        let guard = self.inner.read().ok()?;
        guard.composes.iter().find(|r| r.id == id).cloned()
    }

    pub fn save_compose_record(
        &self,
        mut r: DockerComposeRecord,
    ) -> Result<DockerComposeRecord, String> {
        let now = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
        let mut guard = self.inner.write().map_err(|e| e.to_string())?;
        if r.id.is_empty() {
            r.id = Uuid::new_v4().to_string();
            r.created_at = now.clone();
        }
        r.updated_at = now.clone();
        if let Some(existing) = guard.composes.iter_mut().find(|x| x.id == r.id) {
            if r.created_at.is_empty() {
                r.created_at = existing.created_at.clone();
            }
            *existing = r.clone();
        } else {
            if r.created_at.is_empty() {
                r.created_at = now;
            }
            guard.composes.push(r.clone());
        }
        storage::write_json_atomic(&self.composes_file, &guard.composes)?;
        Ok(r)
    }

    pub fn delete_compose_record(&self, id: &str) -> Result<(), String> {
        let mut guard = self.inner.write().map_err(|e| e.to_string())?;
        guard.composes.retain(|r| r.id != id);
        storage::write_json_atomic(&self.composes_file, &guard.composes)
    }

    // K8s Orchestration Records
    pub fn list_k8s_orchestration_records(
        &self,
        server_id: &str,
    ) -> Vec<K8sOrchestrationRecord> {
        let guard = match self.inner.read() {
            Ok(g) => g,
            Err(_) => return Vec::new(),
        };
        let mut res: Vec<K8sOrchestrationRecord> = guard
            .k8s_orchs
            .iter()
            .filter(|r| server_id.is_empty() || r.server_id == server_id)
            .cloned()
            .collect();
        res.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
        res
    }

    pub fn get_k8s_orchestration_record(&self, id: &str) -> Option<K8sOrchestrationRecord> {
        let guard = self.inner.read().ok()?;
        guard.k8s_orchs.iter().find(|r| r.id == id).cloned()
    }

    pub fn save_k8s_orchestration_record(
        &self,
        mut r: K8sOrchestrationRecord,
    ) -> Result<K8sOrchestrationRecord, String> {
        let now = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
        let mut guard = self.inner.write().map_err(|e| e.to_string())?;
        if r.id.is_empty() {
            r.id = Uuid::new_v4().to_string();
            r.created_at = now.clone();
        }
        r.updated_at = now.clone();
        if r.status.is_empty() {
            r.status = "deployed".to_string();
        }
        if let Some(existing) = guard.k8s_orchs.iter_mut().find(|x| x.id == r.id) {
            if r.created_at.is_empty() {
                r.created_at = existing.created_at.clone();
            }
            *existing = r.clone();
        } else {
            if r.created_at.is_empty() {
                r.created_at = now;
            }
            guard.k8s_orchs.push(r.clone());
        }
        storage::write_json_atomic(&self.k8s_orchs_file, &guard.k8s_orchs)?;
        Ok(r)
    }

    pub fn delete_k8s_orchestration_record(&self, id: &str) -> Result<(), String> {
        let mut guard = self.inner.write().map_err(|e| e.to_string())?;
        guard.k8s_orchs.retain(|r| r.id != id);
        storage::write_json_atomic(&self.k8s_orchs_file, &guard.k8s_orchs)
    }
}

