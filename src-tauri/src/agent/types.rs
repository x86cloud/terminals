use chrono::Local;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter};
use tokio::sync::Notify;

/// Hierarchical cancellation token shared by a main run and its dispatched sub-agent runs.
pub struct RunCancel {
    pub flag: Arc<AtomicBool>,
    pub notify: Arc<Notify>,
    children: Mutex<Vec<Arc<RunCancel>>>,
}

impl Default for RunCancel {
    fn default() -> Self {
        Self::new()
    }
}

impl RunCancel {
    pub fn new() -> Self {
        Self {
            flag: Arc::new(AtomicBool::new(false)),
            notify: Arc::new(Notify::new()),
            children: Mutex::new(Vec::new()),
        }
    }

    pub fn child(&self) -> Arc<Self> {
        let c = Arc::new(Self::new());
        if self.is_cancelled() {
            c.cancel();
            return c;
        }
        if let Ok(mut guard) = self.children.lock() {
            guard.push(c.clone());
        }
        c
    }

    pub fn is_cancelled(&self) -> bool {
        self.flag.load(Ordering::SeqCst)
    }

    pub fn cancel(&self) {
        self.flag.store(true, Ordering::SeqCst);
        self.notify.notify_waiters();
        if let Ok(guard) = self.children.lock() {
            for child in guard.iter() {
                child.cancel();
            }
        }
    }
}

/// Persisted and live step tree node representing thoughts, tool calls, terminal output,
/// approvals, user questions, plan updates, and nested sub-agent runs.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StepNode {
    pub id: String,
    pub run_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub parent_run_id: Option<String>,
    pub agent_id: String,
    /// "thought" | "tool" | "exec" | "approval" | "ask_user" | "plan" | "subagent_run" | "content"
    pub kind: String,
    pub title: String,
    /// "running" | "completed" | "failed" | "cancelled" | "waiting"
    pub status: String,
    #[serde(default)]
    pub data: Value,
    #[serde(default)]
    pub duration_ms: u64,
    #[serde(default)]
    pub children: Vec<StepNode>,
}

/// Collects StepNodes per run_id so nested sub-agent steps attach cleanly to their parent
/// `subagent_run` node for conversation persistence.
#[derive(Default)]
pub struct StepCollector {
    runs: Mutex<HashMap<String, Vec<StepNode>>>,
}

impl StepCollector {
    pub fn new() -> Self {
        Self {
            runs: Mutex::new(HashMap::new()),
        }
    }

    pub fn push(&self, run_id: &str, step: StepNode) {
        if let Ok(mut guard) = self.runs.lock() {
            guard.entry(run_id.to_string()).or_default().push(step);
        }
    }

    pub fn upsert_plan(&self, run_id: &str, step: StepNode) {
        if let Ok(mut guard) = self.runs.lock() {
            let list = guard.entry(run_id.to_string()).or_default();
            if let Some(existing) = list.iter_mut().find(|s| s.kind == "plan") {
                existing.data = step.data;
                existing.status = step.status;
                existing.title = step.title;
            } else {
                list.push(step);
            }
        }
    }

    pub fn take(&self, run_id: &str) -> Vec<StepNode> {
        if let Ok(mut guard) = self.runs.lock() {
            guard.remove(run_id).unwrap_or_default()
        } else {
            Vec::new()
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlanStep {
    pub id: String,
    pub title: String,
    /// "pending" | "in_progress" | "done" | "failed"
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubAgentInfo {
    pub agent_id: String,
    pub session_id: String,
    pub kind: String,
    pub name: String,
    pub user: String,
    pub host: String,
    pub port: i32,
    pub os_info: String,
    pub enabled: bool,
    /// "idle" | "running" | "awaiting_approval" | "offline"
    pub status: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ApprovalDecision {
    Allow,
    Deny,
    Always,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubAgentReport {
    pub status: String,
    pub summary: String,
    #[serde(default)]
    pub commands: Vec<String>,
    #[serde(default)]
    pub key_output: String,
    #[serde(default)]
    pub conclusion: String,
}

/// Emits a unified `agent:event` envelope to the frontend.
pub fn emit_agent_event(
    app: Option<&AppHandle>,
    conversation_id: &str,
    run_id: &str,
    parent_run_id: Option<&str>,
    agent_id: &str,
    event_type: &str,
    payload: Value,
) {
    if let Some(handle) = app {
        let _ = handle.emit(
            "agent:event",
            json!({
                "type": event_type,
                "conversationId": conversation_id,
                "runId": run_id,
                "parentRunId": parent_run_id,
                "agentId": agent_id,
                "ts": Local::now().timestamp_millis(),
                "payload": payload,
            }),
        );
    }
}
