pub mod model;
pub mod react;
pub mod tool;

pub use model::{ChatMessage, ModelProfile, ToolCallItem, ToolDefinition};
pub use react::{run_react_loop, ReActRunResult, ReActStepRecord, DEFAULT_REACT_MAX_TURNS};
pub use tool::{AgentTool, ToolRegistry, ToolResult};

use crate::core::AppSettings;
use crate::AppState;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, RwLock};
use tauri::{AppHandle, State};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentStatusInfo {
    pub enabled: bool,
    pub orchestration_mode: String,
    pub active_model_id: String,
    pub active_model_name: String,
    pub active_model: String,
    pub has_api_key: bool,
}

pub struct AgentRuntime {
    settings: RwLock<AppSettings>,
    tool_registry: Arc<ToolRegistry>,
    active_cancels: Mutex<HashMap<String, Arc<AtomicBool>>>,
}

impl AgentRuntime {
    pub fn new(initial_settings: AppSettings) -> Self {
        Self {
            settings: RwLock::new(initial_settings),
            tool_registry: Arc::new(ToolRegistry::new()),
            active_cancels: Mutex::new(HashMap::new()),
        }
    }

    pub fn tool_registry(&self) -> Arc<ToolRegistry> {
        self.tool_registry.clone()
    }

    pub fn update_settings(&self, new_settings: AppSettings) {
        let is_enabled = new_settings.ai_enabled;
        if let Ok(mut guard) = self.settings.write() {
            *guard = new_settings;
        }
        // If the global Agent switch is turned off, immediately stop any running ReAct tasks
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
            orchestration_mode: "ReAct".to_string(),
            active_model_id: model_id,
            active_model_name: model_name,
            active_model: model_ident,
            has_api_key: !api_key.trim().is_empty(),
        }
    }

    pub fn resolve_active_model(&self) -> Result<(ModelProfile, String), String> {
        let cfg = self.get_settings();
        if !cfg.ai_enabled {
            return Err("AI 智能体全局开关未开启，请先在「设置 -> AI 智能体」中启用".to_string());
        }

        let active_item = cfg
            .ai_models
            .iter()
            .find(|m| m.id == cfg.active_model_id)
            .or_else(|| cfg.ai_models.first());

        let profile = if let Some(item) = active_item {
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
        };

        if profile.base_url.trim().is_empty() {
            return Err("未配置大模型 API 服务地址 (Base URL)".to_string());
        }
        if profile.model.trim().is_empty() {
            return Err("未配置大模型标识 (Model)".to_string());
        }

        Ok((profile, cfg.ai_system_prompt))
    }

    pub fn register_cancel(&self, session_id: &str) -> Arc<AtomicBool> {
        let flag = Arc::new(AtomicBool::new(false));
        if let Ok(mut guard) = self.active_cancels.lock() {
            if let Some(prev) = guard.insert(session_id.to_string(), flag.clone()) {
                prev.store(true, Ordering::SeqCst);
            }
        }
        flag
    }

    pub fn clear_cancel(&self, session_id: &str) {
        if let Ok(mut guard) = self.active_cancels.lock() {
            guard.remove(session_id);
        }
    }

    pub fn stop_session(&self, session_id: &str) {
        if let Ok(mut guard) = self.active_cancels.lock() {
            if let Some(flag) = guard.remove(session_id) {
                flag.store(true, Ordering::SeqCst);
            }
        }
    }

    pub fn stop_all(&self) {
        if let Ok(mut guard) = self.active_cancels.lock() {
            for (_, flag) in guard.drain() {
                flag.store(true, Ordering::SeqCst);
            }
        }
    }
}

// ===================== Tauri Commands =====================

#[tauri::command]
pub async fn agent_get_status(state: State<'_, AppState>) -> Result<AgentStatusInfo, String> {
    Ok(state.agent.status())
}

#[tauri::command]
pub async fn agent_run_react(
    app: AppHandle,
    state: State<'_, AppState>,
    session_id: String,
    messages: Vec<ChatMessage>,
    max_turns: Option<usize>,
) -> Result<ReActRunResult, String> {
    let (profile, sys_prompt) = state.agent.resolve_active_model()?;
    let cancel_flag = state.agent.register_cancel(&session_id);
    let registry = state.agent.tool_registry();

    let res = run_react_loop(
        Some(&app),
        &session_id,
        &profile,
        &sys_prompt,
        messages,
        &registry,
        cancel_flag,
        max_turns.unwrap_or(DEFAULT_REACT_MAX_TURNS),
    )
    .await;

    state.agent.clear_cancel(&session_id);
    res
}

#[tauri::command]
pub async fn agent_stop_react(
    state: State<'_, AppState>,
    session_id: String,
) -> Result<(), String> {
    state.agent.stop_session(&session_id);
    Ok(())
}

