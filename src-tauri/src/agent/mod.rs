pub mod approval;
pub mod model;
pub mod orchestrator;
pub mod react;
pub mod store;
pub mod sub_agent;
pub mod tool;
pub mod tools;
pub mod tools_conn;
pub mod tools_local;
pub mod tools_main;
pub mod tools_mysql;
pub mod tools_ssh;
pub mod tools_wiki;
pub mod types;

pub use model::{ChatMessage, ModelProfile, ToolCallItem, ToolDefinition};
pub use orchestrator::{ChatSendRequest, ChatSendResult};
pub use store::{AgentBrainStore, AgentMessageRecord, AgentSessionRecord};
pub use sub_agent::SubAgentMemory;
pub use tool::{AgentTool, ToolCtx, ToolRegistry, ToolResult};
pub use types::{
    emit_agent_event, ApprovalDecision, PlanStep, RunCancel, StepCollector, StepNode, SubAgentInfo,
    SubAgentReport,
};

use crate::core::{AiModelItem, AppSettings};
use crate::db::mysql::MysqlManager;
use crate::ssh::SshManager;
use crate::AppState;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, RwLock};
use tauri::{AppHandle, State};
use tokio::sync::{oneshot, Mutex as TokioMutex, Semaphore};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentStatusInfo {
    pub enabled: bool,
    pub orchestration_mode: String,
    pub active_model_id: String,
    pub active_model_name: String,
    pub active_model: String,
    pub sub_agent_model_id: String,
    pub has_api_key: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversationDetail {
    pub session: AgentSessionRecord,
    pub messages: Vec<AgentMessageRecord>,
}

struct PendingApproval {
    conversation_id: String,
    agent_id: String,
    tx: oneshot::Sender<ApprovalDecision>,
}

struct PendingAsk {
    conversation_id: String,
    tx: oneshot::Sender<Value>,
}

pub struct AgentRuntime {
    settings: RwLock<AppSettings>,
    store: Arc<AgentBrainStore>,
    enabled_agents: RwLock<HashSet<String>>,
    running_convs: Mutex<HashMap<String, Arc<RunCancel>>>,
    running_agent_cancels: Mutex<HashMap<String, Vec<(u64, Arc<RunCancel>)>>>,
    awaiting_approval_counts: Mutex<HashMap<String, usize>>,
    pending_approvals: Mutex<HashMap<String, PendingApproval>>,
    pending_asks: Mutex<HashMap<String, PendingAsk>>,
    always_allow: RwLock<HashSet<(String, String, String)>>,
    subagent_memories: TokioMutex<HashMap<(String, String), SubAgentMemory>>,
    probed_os: RwLock<HashMap<String, String>>,
    dispatch_sem: Mutex<(usize, Arc<Semaphore>)>,
    next_token: AtomicU64,
}

impl AgentRuntime {
    pub fn new(initial_settings: AppSettings) -> Self {
        let store =
            AgentBrainStore::open_default().expect("failed to initialize Agent SQLite store");
        let max_par = initial_settings.ai_max_parallel.clamp(1, 16) as usize;
        Self {
            settings: RwLock::new(initial_settings),
            store: Arc::new(store),
            enabled_agents: RwLock::new(HashSet::new()),
            running_convs: Mutex::new(HashMap::new()),
            running_agent_cancels: Mutex::new(HashMap::new()),
            awaiting_approval_counts: Mutex::new(HashMap::new()),
            pending_approvals: Mutex::new(HashMap::new()),
            pending_asks: Mutex::new(HashMap::new()),
            always_allow: RwLock::new(HashSet::new()),
            subagent_memories: TokioMutex::new(HashMap::new()),
            probed_os: RwLock::new(HashMap::new()),
            dispatch_sem: Mutex::new((max_par, Arc::new(Semaphore::new(max_par)))),
            next_token: AtomicU64::new(1),
        }
    }

    pub fn store(&self) -> Arc<AgentBrainStore> {
        self.store.clone()
    }

    pub fn update_settings(&self, new_settings: AppSettings) {
        let is_enabled = new_settings.ai_enabled;
        let max_par = new_settings.ai_max_parallel.clamp(1, 16) as usize;
        if let Ok(mut guard) = self.settings.write() {
            *guard = new_settings;
        }
        if let Ok(mut sem_guard) = self.dispatch_sem.lock() {
            if sem_guard.0 != max_par {
                *sem_guard = (max_par, Arc::new(Semaphore::new(max_par)));
            }
        }
        if !is_enabled {
            self.stop_all();
        }
    }

    pub fn get_settings(&self) -> AppSettings {
        self.settings
            .read()
            .map(|g| g.clone())
            .unwrap_or_default()
    }

    pub fn dispatch_semaphore(&self) -> Arc<Semaphore> {
        self.dispatch_sem
            .lock()
            .map(|g| g.1.clone())
            .unwrap_or_else(|_| Arc::new(Semaphore::new(4)))
    }

    pub fn status(&self) -> AgentStatusInfo {
        let cfg = self.get_settings();
        let active_item = cfg
            .ai_models
            .iter()
            .find(|m| m.id == cfg.active_model_id)
            .or_else(|| cfg.ai_models.first());

        let (model_id, model_name, model_ident, api_key) = match active_item {
            Some(item) => (
                item.id.clone(),
                item.name.clone(),
                item.model.clone(),
                item.api_key.clone(),
            ),
            None => (
                cfg.active_model_id.clone(),
                cfg.ai_model.clone(),
                cfg.ai_model.clone(),
                cfg.ai_api_key.clone(),
            ),
        };

        AgentStatusInfo {
            enabled: cfg.ai_enabled,
            orchestration_mode: "MultiLayer".to_string(),
            active_model_id: model_id,
            active_model_name: model_name,
            active_model: model_ident,
            sub_agent_model_id: cfg.ai_sub_agent_model_id,
            has_api_key: !api_key.trim().is_empty(),
        }
    }

    fn build_profile(cfg: &AppSettings, item_opt: Option<&AiModelItem>) -> ModelProfile {
        if let Some(item) = item_opt {
            ModelProfile {
                id: item.id.clone(),
                name: item.name.clone(),
                base_url: if item.base_url.trim().is_empty() {
                    cfg.ai_base_url.clone()
                } else {
                    item.base_url.clone()
                },
                api_key: if item.api_key.trim().is_empty() {
                    cfg.ai_api_key.clone()
                } else {
                    item.api_key.clone()
                },
                model: if item.model.trim().is_empty() {
                    cfg.ai_model.clone()
                } else {
                    item.model.clone()
                },
                temperature: if item.temperature > 0.0 {
                    item.temperature
                } else {
                    cfg.ai_temperature
                },
                context_tokens: if item.context_tokens > 0 {
                    item.context_tokens
                } else {
                    cfg.ai_model_context_tokens
                },
                enable_multimodal: item.enable_multimodal || cfg.ai_enable_multimodal,
                enable_thinking: cfg.ai_enable_thinking,
                reasoning_effort: cfg.ai_reasoning_effort.clone(),
            }
        } else {
            ModelProfile {
                id: "default".to_string(),
                name: cfg.ai_model.clone(),
                base_url: cfg.ai_base_url.clone(),
                api_key: cfg.ai_api_key.clone(),
                model: cfg.ai_model.clone(),
                temperature: cfg.ai_temperature,
                context_tokens: cfg.ai_model_context_tokens,
                enable_multimodal: cfg.ai_enable_multimodal,
                enable_thinking: cfg.ai_enable_thinking,
                reasoning_effort: cfg.ai_reasoning_effort.clone(),
            }
        }
    }

    pub fn resolve_model_by_id(
        &self,
        model_id: Option<&str>,
    ) -> Result<(ModelProfile, String), String> {
        let cfg = self.get_settings();
        if !cfg.ai_enabled {
            return Err("AI 智能体全局开关未开启，请先在「设置 -> AI 智能体」中启用".to_string());
        }

        let target_id = model_id
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .unwrap_or(&cfg.active_model_id);

        let item_opt = cfg
            .ai_models
            .iter()
            .find(|m| m.id == target_id)
            .or_else(|| cfg.ai_models.iter().find(|m| m.id == cfg.active_model_id))
            .or_else(|| cfg.ai_models.first());

        let profile = Self::build_profile(&cfg, item_opt);
        if profile.base_url.trim().is_empty() {
            return Err("未配置大模型 API 服务地址 (Base URL)".to_string());
        }
        if profile.model.trim().is_empty() {
            return Err("未配置大模型标识 (Model)".to_string());
        }
        Ok((profile, cfg.ai_system_prompt))
    }

    pub fn resolve_sub_agent_model(&self, main_profile: &ModelProfile) -> Result<ModelProfile, String> {
        let cfg = self.get_settings();
        let sub_id = cfg.ai_sub_agent_model_id.trim();
        if sub_id.is_empty() {
            return Ok(main_profile.clone());
        }
        if let Some(item) = cfg.ai_models.iter().find(|m| m.id == sub_id) {
            let p = Self::build_profile(&cfg, Some(item));
            if !p.base_url.trim().is_empty() && !p.model.trim().is_empty() {
                return Ok(p);
            }
        }
        Ok(main_profile.clone())
    }

    // ===================== Cancellation Management =====================

    pub fn register_conv_cancel(&self, conversation_id: &str) -> Arc<RunCancel> {
        let cancel = Arc::new(RunCancel::new());
        if let Ok(mut guard) = self.running_convs.lock() {
            if let Some(prev) = guard.insert(conversation_id.to_string(), cancel.clone()) {
                prev.cancel();
            }
        }
        cancel
    }

    pub fn clear_conv_cancel(&self, conversation_id: &str) {
        if let Ok(mut guard) = self.running_convs.lock() {
            guard.remove(conversation_id);
        }
    }

    pub fn stop_conversation(&self, conversation_id: &str) {
        if let Ok(mut guard) = self.running_convs.lock() {
            if let Some(cancel) = guard.remove(conversation_id) {
                cancel.cancel();
            }
        }
        self.release_pending_for_conv(conversation_id);
    }

    pub fn stop_all(&self) {
        if let Ok(mut guard) = self.running_convs.lock() {
            for (_, cancel) in guard.drain() {
                cancel.cancel();
            }
        }
        if let Ok(mut guard) = self.pending_approvals.lock() {
            for (_, item) in guard.drain() {
                let _ = item.tx.send(ApprovalDecision::Deny);
            }
        }
        if let Ok(mut guard) = self.pending_asks.lock() {
            guard.clear();
        }
    }

    pub fn register_agent_cancel(&self, agent_id: &str, cancel: Arc<RunCancel>) -> u64 {
        let tok = self.next_token.fetch_add(1, Ordering::SeqCst);
        if let Ok(mut guard) = self.running_agent_cancels.lock() {
            guard
                .entry(agent_id.to_string())
                .or_default()
                .push((tok, cancel));
        }
        tok
    }

    pub fn unregister_agent_cancel(&self, agent_id: &str, token: u64) {
        if let Ok(mut guard) = self.running_agent_cancels.lock() {
            if let Some(list) = guard.get_mut(agent_id) {
                list.retain(|(t, _)| *t != token);
                if list.is_empty() {
                    guard.remove(agent_id);
                }
            }
        }
    }

    fn cancel_agent_tasks(&self, agent_id: &str) {
        if let Ok(mut guard) = self.running_agent_cancels.lock() {
            if let Some(list) = guard.remove(agent_id) {
                for (_, cancel) in list {
                    cancel.cancel();
                }
            }
        }
        if let Ok(mut guard) = self.pending_approvals.lock() {
            let keys: Vec<String> = guard
                .iter()
                .filter(|(_, p)| p.agent_id == agent_id)
                .map(|(k, _)| k.clone())
                .collect();
            for k in keys {
                if let Some(item) = guard.remove(&k) {
                    let _ = item.tx.send(ApprovalDecision::Deny);
                }
            }
        }
    }

    // ===================== Sub-Agent Status & Enablement =====================

    pub fn is_agent_enabled(&self, agent_id: &str) -> bool {
        self.enabled_agents
            .read()
            .map(|g| g.contains(agent_id))
            .unwrap_or(false)
    }

    fn compute_agent_status(&self, agent_id: &str) -> String {
        let awaiting = self
            .awaiting_approval_counts
            .lock()
            .ok()
            .and_then(|g| g.get(agent_id).copied())
            .unwrap_or(0);
        if awaiting > 0 {
            return "awaiting_approval".to_string();
        }
        let running = self
            .running_agent_cancels
            .lock()
            .ok()
            .and_then(|g| g.get(agent_id).map(|v| v.len()))
            .unwrap_or(0);
        if running > 0 {
            "running".to_string()
        } else {
            "idle".to_string()
        }
    }

    pub fn set_agent_running(
        &self,
        app: Option<&AppHandle>,
        conversation_id: &str,
        run_id: &str,
        agent_id: &str,
        _running: bool,
    ) {
        let status = self.compute_agent_status(agent_id);
        emit_agent_event(
            app,
            conversation_id,
            run_id,
            None,
            agent_id,
            "subagent_status",
            json!({
                "agentId": agent_id,
                "status": status,
            }),
        );
    }

    pub fn set_agent_awaiting_approval(
        &self,
        app: Option<&AppHandle>,
        conversation_id: &str,
        run_id: &str,
        agent_id: &str,
        waiting: bool,
    ) {
        if let Ok(mut guard) = self.awaiting_approval_counts.lock() {
            let cnt = guard.entry(agent_id.to_string()).or_insert(0);
            if waiting {
                *cnt += 1;
            } else if *cnt > 0 {
                *cnt -= 1;
            }
            if *cnt == 0 {
                guard.remove(agent_id);
            }
        }
        let status = self.compute_agent_status(agent_id);
        emit_agent_event(
            app,
            conversation_id,
            run_id,
            None,
            agent_id,
            "subagent_status",
            json!({
                "agentId": agent_id,
                "status": status,
            }),
        );
    }

    pub fn set_probed_os(&self, key: &str, os_info: String) {
        if os_info.trim().is_empty() {
            return;
        }
        if let Ok(mut guard) = self.probed_os.write() {
            guard.insert(key.to_string(), os_info);
        }
    }

    pub async fn list_subagents(
        &self,
        ssh: &SshManager,
        mysql: &MysqlManager,
    ) -> Vec<SubAgentInfo> {
        let sessions = ssh.list_sessions().await;
        let mysql_sessions = mysql.list_sessions().await;
        let probed_map = self
            .probed_os
            .read()
            .map(|g| g.clone())
            .unwrap_or_default();
        let mut out = Vec::new();
        for s in sessions {
            if !s.connected {
                continue;
            }
            let agent_id = format!("ssh:{}", s.id);
            let enabled = self.is_agent_enabled(&agent_id);
            let status = self.compute_agent_status(&agent_id);
            let os_info = if !s.os_info.trim().is_empty() {
                s.os_info
            } else {
                probed_map
                    .get(&agent_id)
                    .or_else(|| probed_map.get(&s.id))
                    .cloned()
                    .unwrap_or_default()
            };
            out.push(SubAgentInfo {
                agent_id,
                session_id: s.id,
                kind: "ssh".to_string(),
                name: s.title,
                user: s.username,
                host: s.host,
                port: s.port,
                os_info,
                enabled,
                status,
            });
        }
        for (m, username) in mysql_sessions {
            if !m.connected {
                continue;
            }
            let agent_id = format!("mysql:{}", m.id);
            let enabled = self.is_agent_enabled(&agent_id);
            let status = self.compute_agent_status(&agent_id);
            let mut os_info = probed_map
                .get(&agent_id)
                .or_else(|| probed_map.get(&m.id))
                .cloned()
                .unwrap_or_default();
            if !m.database.trim().is_empty() {
                if os_info.is_empty() {
                    os_info = format!("db: {}", m.database.trim());
                } else if !os_info.contains(&m.database) {
                    os_info = format!("{} · db: {}", os_info, m.database.trim());
                }
            }
            out.push(SubAgentInfo {
                agent_id,
                session_id: m.id,
                kind: "mysql".to_string(),
                name: m.title,
                user: if username.trim().is_empty() {
                    "root".to_string()
                } else {
                    username
                },
                host: m.host,
                port: m.port,
                os_info,
                enabled,
                status,
            });
        }
        out
    }

    pub async fn emit_subagents_sync(
        &self,
        app: &AppHandle,
        ssh: &SshManager,
        mysql: &MysqlManager,
    ) {
        let list = self.list_subagents(ssh, mysql).await;
        emit_agent_event(
            Some(app),
            "",
            "",
            None,
            "main",
            "subagents_sync",
            json!({ "subagents": list }),
        );
    }

    pub async fn set_subagent_enabled(
        &self,
        app: &AppHandle,
        ssh: &SshManager,
        mysql: &MysqlManager,
        agent_id: &str,
        enabled: bool,
    ) -> Result<Vec<SubAgentInfo>, String> {
        if let Ok(mut guard) = self.enabled_agents.write() {
            if enabled {
                guard.insert(agent_id.to_string());
            } else {
                guard.remove(agent_id);
            }
        }
        if !enabled {
            self.cancel_agent_tasks(agent_id);
        }
        let list = self.list_subagents(ssh, mysql).await;
        let status = self.compute_agent_status(agent_id);
        emit_agent_event(
            Some(app),
            "",
            "",
            None,
            agent_id,
            "subagent_status",
            json!({
                "agentId": agent_id,
                "status": status,
                "enabled": enabled,
            }),
        );
        emit_agent_event(
            Some(app),
            "",
            "",
            None,
            "main",
            "subagents_sync",
            json!({ "subagents": list }),
        );
        Ok(list)
    }

    pub async fn on_ssh_disconnected(&self, app: &AppHandle, session_id: &str) {
        let agent_id = format!("ssh:{}", session_id);
        if let Ok(mut guard) = self.enabled_agents.write() {
            guard.remove(&agent_id);
        }
        self.cancel_agent_tasks(&agent_id);

        if let Ok(mut guard) = self.always_allow.write() {
            guard.retain(|(_, sid, _)| sid != session_id && sid != &agent_id);
        }
        if let Ok(mut guard) = self.probed_os.write() {
            guard.remove(session_id);
            guard.remove(&agent_id);
        }
        {
            let mut mem_guard = self.subagent_memories.lock().await;
            mem_guard.retain(|(_, aid), _| aid != &agent_id);
        }

        emit_agent_event(
            Some(app),
            "",
            "",
            None,
            &agent_id,
            "subagent_status",
            json!({
                "agentId": agent_id,
                "status": "offline",
            }),
        );
    }

    pub async fn on_mysql_disconnected(&self, app: &AppHandle, server_id: &str) {
        let agent_id = format!("mysql:{}", server_id);
        if let Ok(mut guard) = self.enabled_agents.write() {
            guard.remove(&agent_id);
        }
        self.cancel_agent_tasks(&agent_id);

        if let Ok(mut guard) = self.always_allow.write() {
            guard.retain(|(_, sid, _)| sid != server_id && sid != &agent_id);
        }
        if let Ok(mut guard) = self.probed_os.write() {
            guard.remove(server_id);
            guard.remove(&agent_id);
        }
        {
            let mut mem_guard = self.subagent_memories.lock().await;
            mem_guard.retain(|(_, aid), _| aid != &agent_id);
        }

        emit_agent_event(
            Some(app),
            "",
            "",
            None,
            &agent_id,
            "subagent_status",
            json!({
                "agentId": agent_id,
                "status": "offline",
            }),
        );
    }

    // ===================== Approval & AskUser Gates =====================

    pub fn is_always_allowed(
        &self,
        conversation_id: &str,
        session_id: &str,
        prefix: &str,
    ) -> bool {
        self.always_allow
            .read()
            .map(|g| {
                g.contains(&(
                    conversation_id.to_string(),
                    session_id.to_string(),
                    prefix.to_string(),
                ))
            })
            .unwrap_or(false)
    }

    pub fn add_always_allow(&self, conversation_id: &str, session_id: &str, prefix: &str) {
        if let Ok(mut guard) = self.always_allow.write() {
            guard.insert((
                conversation_id.to_string(),
                session_id.to_string(),
                prefix.to_string(),
            ));
        }
    }

    pub fn register_pending_approval(
        &self,
        approval_id: &str,
        conversation_id: &str,
        agent_id: &str,
    ) -> oneshot::Receiver<ApprovalDecision> {
        let (tx, rx) = oneshot::channel();
        if let Ok(mut guard) = self.pending_approvals.lock() {
            guard.insert(
                approval_id.to_string(),
                PendingApproval {
                    conversation_id: conversation_id.to_string(),
                    agent_id: agent_id.to_string(),
                    tx,
                },
            );
        }
        rx
    }

    pub fn remove_pending_approval(&self, approval_id: &str) {
        if let Ok(mut guard) = self.pending_approvals.lock() {
            guard.remove(approval_id);
        }
    }

    pub fn respond_approval(
        &self,
        approval_id: &str,
        decision: ApprovalDecision,
    ) -> Result<(), String> {
        let item = if let Ok(mut guard) = self.pending_approvals.lock() {
            guard.remove(approval_id)
        } else {
            None
        };
        let Some(pending) = item else {
            return Err("该审批请求已失效或已处理".to_string());
        };
        let _ = pending.tx.send(decision);
        Ok(())
    }

    pub fn register_pending_ask(
        &self,
        ask_id: &str,
        conversation_id: &str,
    ) -> oneshot::Receiver<Value> {
        let (tx, rx) = oneshot::channel();
        if let Ok(mut guard) = self.pending_asks.lock() {
            guard.insert(
                ask_id.to_string(),
                PendingAsk {
                    conversation_id: conversation_id.to_string(),
                    tx,
                },
            );
        }
        rx
    }

    pub fn remove_pending_ask(&self, ask_id: &str) {
        if let Ok(mut guard) = self.pending_asks.lock() {
            guard.remove(ask_id);
        }
    }

    pub fn respond_ask_user(&self, ask_id: &str, answers: Value) -> Result<(), String> {
        let item = if let Ok(mut guard) = self.pending_asks.lock() {
            guard.remove(ask_id)
        } else {
            None
        };
        let Some(pending) = item else {
            return Err("该提问已失效或已回答".to_string());
        };
        let _ = pending.tx.send(answers);
        Ok(())
    }

    pub fn release_pending_for_conv(&self, conversation_id: &str) {
        if let Ok(mut guard) = self.pending_approvals.lock() {
            let keys: Vec<String> = guard
                .iter()
                .filter(|(_, p)| p.conversation_id == conversation_id)
                .map(|(k, _)| k.clone())
                .collect();
            for k in keys {
                if let Some(item) = guard.remove(&k) {
                    let _ = item.tx.send(ApprovalDecision::Deny);
                }
            }
        }
        if let Ok(mut guard) = self.pending_asks.lock() {
            let keys: Vec<String> = guard
                .iter()
                .filter(|(_, p)| p.conversation_id == conversation_id)
                .map(|(k, _)| k.clone())
                .collect();
            for k in keys {
                guard.remove(&k);
            }
        }
    }

    // ===================== Sub-Agent Working Memory =====================

    pub async fn get_subagent_memory(
        &self,
        conversation_id: &str,
        agent_id: &str,
    ) -> SubAgentMemory {
        let guard = self.subagent_memories.lock().await;
        guard
            .get(&(conversation_id.to_string(), agent_id.to_string()))
            .cloned()
            .unwrap_or_default()
    }

    pub async fn save_subagent_memory(
        &self,
        conversation_id: &str,
        agent_id: &str,
        mem: SubAgentMemory,
    ) {
        let mut guard = self.subagent_memories.lock().await;
        guard.insert((conversation_id.to_string(), agent_id.to_string()), mem);
    }
}

// ===================== Tauri Commands =====================

#[tauri::command]
pub async fn agent_get_status(state: State<'_, AppState>) -> Result<AgentStatusInfo, String> {
    Ok(state.agent.status())
}

#[tauri::command]
pub async fn agent_chat_send(
    app: AppHandle,
    state: State<'_, AppState>,
    req: ChatSendRequest,
) -> Result<ChatSendResult, String> {
    let conns = tools_conn::ConnManagers {
        store: state.store.clone(),
        ssh: state.ssh.clone(),
        mysql: state.mysql.clone(),
        redis: state.redis.clone(),
        postgres: state.postgres.clone(),
        mongo: state.mongo.clone(),
        docker: state.docker.clone(),
        k8s: state.k8s.clone(),
    };
    orchestrator::start_chat_run(
        app,
        state.agent.clone(),
        state.ssh.clone(),
        state.mysql.clone(),
        state.wiki.clone(),
        conns,
        req,
    )
    .await
}

#[tauri::command]
pub async fn agent_stop(
    state: State<'_, AppState>,
    conversation_id: String,
) -> Result<(), String> {
    state.agent.stop_conversation(&conversation_id);
    Ok(())
}

#[tauri::command]
pub async fn agent_approval_respond(
    state: State<'_, AppState>,
    approval_id: String,
    decision: ApprovalDecision,
) -> Result<(), String> {
    state.agent.respond_approval(&approval_id, decision)
}

#[tauri::command]
pub async fn agent_ask_user_respond(
    state: State<'_, AppState>,
    ask_id: String,
    answers: Value,
) -> Result<(), String> {
    state.agent.respond_ask_user(&ask_id, answers)
}

#[tauri::command]
pub async fn agent_list_subagents(state: State<'_, AppState>) -> Result<Vec<SubAgentInfo>, String> {
    Ok(state.agent.list_subagents(&state.ssh, &state.mysql).await)
}

#[tauri::command]
pub async fn agent_set_subagent_enabled(
    app: AppHandle,
    state: State<'_, AppState>,
    agent_id: String,
    enabled: bool,
) -> Result<Vec<SubAgentInfo>, String> {
    state
        .agent
        .set_subagent_enabled(&app, &state.ssh, &state.mysql, &agent_id, enabled)
        .await
}

#[tauri::command]
pub async fn agent_list_conversations(
    state: State<'_, AppState>,
) -> Result<Vec<AgentSessionRecord>, String> {
    state.agent.store().list_sessions()
}

#[tauri::command]
pub async fn agent_get_conversation(
    state: State<'_, AppState>,
    conversation_id: String,
) -> Result<ConversationDetail, String> {
    let store = state.agent.store();
    let session = store
        .get_session(&conversation_id)?
        .ok_or_else(|| "对话不存在或已删除".to_string())?;
    let messages = store.list_messages(&conversation_id)?;
    Ok(ConversationDetail { session, messages })
}

#[tauri::command]
pub async fn agent_rename_conversation(
    state: State<'_, AppState>,
    conversation_id: String,
    title: String,
) -> Result<(), String> {
    state.agent.store().rename_session(&conversation_id, &title)
}

#[tauri::command]
pub async fn agent_delete_conversation(
    state: State<'_, AppState>,
    conversation_id: String,
) -> Result<(), String> {
    state.agent.stop_conversation(&conversation_id);
    state.agent.store().delete_session(&conversation_id)
}

#[tauri::command]
pub async fn agent_update_conversation_workspace(
    state: State<'_, AppState>,
    conversation_id: String,
    workspace_dir: String,
) -> Result<(), String> {
    state
        .agent
        .store()
        .update_session_prefs(&conversation_id, None, None, None, None, Some(workspace_dir))
}
