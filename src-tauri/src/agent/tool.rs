use crate::agent::model::{FunctionDefinition, ToolDefinition};
use crate::agent::types::{RunCancel, StepCollector};
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::{Arc, RwLock};
use tauri::AppHandle;

#[derive(Clone)]
pub struct ToolCtx {
    pub conversation_id: String,
    pub run_id: String,
    pub parent_run_id: Option<String>,
    pub agent_id: String,
    pub step_id: String,
    pub cancel: Arc<RunCancel>,
    pub app: Option<AppHandle>,
    pub collector: Arc<StepCollector>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolResult {
    pub ok: bool,
    pub data: Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

impl ToolResult {
    pub fn success(data: impl Into<Value>) -> Self {
        Self {
            ok: true,
            data: data.into(),
            error: None,
        }
    }

    pub fn err(msg: impl Into<String>) -> Self {
        Self {
            ok: false,
            data: Value::Null,
            error: Some(msg.into()),
        }
    }

    pub fn to_observation_string(&self) -> String {
        let raw = if !self.ok {
            format!(
                "Error: {}",
                self.error.as_deref().unwrap_or("工具执行失败")
            )
        } else if let Some(s) = self.data.as_str() {
            s.to_string()
        } else if self.data.is_null() {
            "{\"ok\": true}".to_string()
        } else {
            serde_json::to_string(&self.data).unwrap_or_else(|_| format!("{}", self.data))
        };

        const MAX_OBSERVATION_LEN: usize = 32768;
        if raw.len() > MAX_OBSERVATION_LEN {
            let mut cut = MAX_OBSERVATION_LEN;
            while cut > 0 && !raw.is_char_boundary(cut) {
                cut -= 1;
            }
            format!("{}\n...(输出过长已截断)...", &raw[..cut])
        } else {
            raw
        }
    }
}

/// Abstract Tool interface for the ReAct orchestration loop.
#[async_trait]
pub trait AgentTool: Send + Sync {
    fn name(&self) -> &str;
    fn description(&self) -> &str;
    fn parameters_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {},
        })
    }
    /// Short human-readable verb phrase for the step line (e.g. "Searched the web for ...").
    fn format_title(&self, _arguments: &str) -> String {
        self.name().to_string()
    }
    /// Returns true if the tool manages and pushes its own specialized StepNode(s)
    /// (e.g. `exec`, `subagent_run`, `plan`, `ask_user`) into `ctx.collector`.
    fn records_own_step(&self) -> bool {
        false
    }
    async fn execute(&self, ctx: &ToolCtx, arguments: &str) -> ToolResult;
}

#[derive(Default)]
pub struct ToolRegistry {
    tools: RwLock<HashMap<String, Arc<dyn AgentTool>>>,
}

impl ToolRegistry {
    pub fn new() -> Self {
        Self {
            tools: RwLock::new(HashMap::new()),
        }
    }

    pub fn register(&self, tool: Arc<dyn AgentTool>) {
        if let Ok(mut guard) = self.tools.write() {
            guard.insert(tool.name().to_string(), tool);
        }
    }

    pub fn unregister(&self, name: &str) {
        if let Ok(mut guard) = self.tools.write() {
            guard.remove(name);
        }
    }

    pub fn get(&self, name: &str) -> Option<Arc<dyn AgentTool>> {
        self.tools
            .read()
            .ok()
            .and_then(|guard| guard.get(name).cloned())
    }

    pub fn definitions(&self) -> Vec<ToolDefinition> {
        let guard = match self.tools.read() {
            Ok(g) => g,
            Err(_) => return Vec::new(),
        };
        let mut defs: Vec<ToolDefinition> = guard
            .values()
            .map(|t| ToolDefinition {
                tool_type: "function".to_string(),
                function: FunctionDefinition {
                    name: t.name().to_string(),
                    description: t.description().to_string(),
                    parameters: t.parameters_schema(),
                },
            })
            .collect();
        defs.sort_by(|a, b| a.function.name.cmp(&b.function.name));
        defs
    }

    pub async fn invoke(&self, ctx: &ToolCtx, name: &str, arguments: &str) -> ToolResult {
        match self.get(name) {
            Some(tool) => tool.execute(ctx, arguments).await,
            None => ToolResult::err(format!("未找到工具: {}", name)),
        }
    }
}
