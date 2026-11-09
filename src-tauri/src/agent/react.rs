use crate::agent::model::{stream_chat_turn, ChatMessage, ModelProfile};
use crate::agent::tool::ToolRegistry;
use crate::core::storage;
use chrono::Local;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Instant;
use tauri::{AppHandle, Emitter};

pub const DEFAULT_REACT_MAX_TURNS: usize = 25;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReActStepRecord {
    pub id: String,
    pub turn: usize,
    pub step_type: String, // "think" | "action" | "observation"
    pub title: String,
    pub content: String,
    pub status: String, // "running" | "completed" | "failed"
    pub duration_ms: u64,
    pub timestamp: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReActRunResult {
    pub session_id: String,
    pub content: String,
    pub reasoning_content: String,
    pub steps: Vec<ReActStepRecord>,
    pub turns_used: usize,
}

fn emit_agent_event(app: Option<&AppHandle>, session_id: &str, event_type: &str, payload: Value) {
    if let Some(handle) = app {
        let _ = handle.emit(
            "agent:event",
            json!({
                "type": event_type,
                "session_id": session_id,
                "timestamp": Local::now().timestamp_millis(),
                "payload": payload,
            }),
        );
    }
}

fn build_system_message(base_system_prompt: &str) -> ChatMessage {
    let now_str = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let os_name = std::env::consts::OS;
    let prompt = if base_system_prompt.trim().is_empty() {
        format!(
            "你是一个专业的全栈开发与运维 AI 智能体（ReAct 编排模式）。\n系统环境: {}, 当前时间: [{}]。",
            os_name, now_str
        )
    } else {
        format!(
            "{}\n系统环境: {}, 当前时间: [{}]。",
            base_system_prompt.trim(),
            os_name,
            now_str
        )
    };
    ChatMessage::system(prompt)
}

/// Executes the standard ReAct (Reasoning + Acting) loop:
/// Thought -> Action (Tool Call) -> Observation -> Next Turn until final answer.
pub async fn run_react_loop(
    app: Option<&AppHandle>,
    session_id: &str,
    profile: &ModelProfile,
    system_prompt: &str,
    history: Vec<ChatMessage>,
    tool_registry: &ToolRegistry,
    cancel_flag: Arc<AtomicBool>,
    max_turns: usize,
) -> Result<ReActRunResult, String> {
    let max_turns = if max_turns == 0 {
        DEFAULT_REACT_MAX_TURNS
    } else {
        max_turns
    };

    let mut context_msgs: Vec<ChatMessage> = Vec::with_capacity(history.len() + 8);
    context_msgs.push(build_system_message(system_prompt));
    for m in history {
        if m.role.to_lowercase() != "system" {
            context_msgs.push(m);
        }
    }

    let tool_defs = tool_registry.definitions();
    let mut full_content = String::new();
    let mut full_reasoning = String::new();
    let mut steps: Vec<ReActStepRecord> = Vec::new();
    let mut in_think_tag = false;
    let mut turns_used = 0;

    storage::log_info(format!(
        "[Agent][ReAct] Starting session={} model={} messages={} tools={}",
        session_id,
        profile.model,
        context_msgs.len(),
        tool_defs.len()
    ));

    for turn in 1..=max_turns {
        turns_used = turn;
        if cancel_flag.load(Ordering::SeqCst) {
            return Err("用户手动停止了推导".to_string());
        }

        let turn_start = Instant::now();
        let turn_out = stream_chat_turn(
            profile,
            &context_msgs,
            &tool_defs,
            &cancel_flag,
            &mut in_think_tag,
            |chunk| {
                emit_agent_event(
                    app,
                    session_id,
                    "chat_chunk",
                    json!({ "chunk": chunk, "turn": turn }),
                );
            },
            |r_chunk| {
                emit_agent_event(
                    app,
                    session_id,
                    "reasoning_chunk",
                    json!({ "chunk": r_chunk, "turn": turn }),
                );
            },
        )
        .await?;

        if !turn_out.reasoning_content.is_empty() {
            full_reasoning.push_str(&turn_out.reasoning_content);
            steps.push(ReActStepRecord {
                id: format!("think_{}_{}", session_id, turn),
                turn,
                step_type: "think".to_string(),
                title: format!("第 {} 轮思考推演 (Thought)", turn),
                content: turn_out.reasoning_content.clone(),
                status: "completed".to_string(),
                duration_ms: turn_start.elapsed().as_millis() as u64,
                timestamp: Local::now().timestamp_millis(),
            });
        }

        if !turn_out.content.is_empty() {
            full_content.push_str(&turn_out.content);
        }

        // ReAct Termination Check: No tool calls means the model produced its final answer
        if turn_out.tool_calls.is_empty() {
            storage::log_info(format!(
                "[Agent][ReAct] Session {} completed on turn {}",
                session_id, turn
            ));
            break;
        }

        // ReAct Action Phase: Append Assistant's Thought + Tool Calls to conversation history
        context_msgs.push(ChatMessage::assistant(
            turn_out.content.clone(),
            if turn_out.reasoning_content.is_empty() {
                None
            } else {
                Some(turn_out.reasoning_content.clone())
            },
            turn_out.tool_calls.clone(),
        ));

        // Execute each tool call and feed Observation back into context
        for tc in turn_out.tool_calls {
            if cancel_flag.load(Ordering::SeqCst) {
                return Err("用户手动停止了推导".to_string());
            }

            let step_id = tc.id.clone();
            let action_start = Instant::now();

            emit_agent_event(
                app,
                session_id,
                "step_start",
                json!({
                    "step_id": step_id,
                    "turn": turn,
                    "tool_name": tc.name,
                    "arguments": tc.args,
                }),
            );

            let tool_res = tool_registry.invoke(session_id, &tc.name, &tc.args).await;
            let observation = tool_res.to_observation_string();
            let elapsed_ms = action_start.elapsed().as_millis() as u64;
            let status = if tool_res.ok { "completed" } else { "failed" };

            steps.push(ReActStepRecord {
                id: step_id.clone(),
                turn,
                step_type: "action".to_string(),
                title: tc.name.clone(),
                content: observation.clone(),
                status: status.to_string(),
                duration_ms: elapsed_ms,
                timestamp: Local::now().timestamp_millis(),
            });

            emit_agent_event(
                app,
                session_id,
                "step_end",
                json!({
                    "step_id": step_id,
                    "turn": turn,
                    "tool_name": tc.name,
                    "status": status,
                    "duration_ms": elapsed_ms,
                    "observation": observation,
                }),
            );

            // ReAct Observation Phase: Append Tool Message to conversation history
            context_msgs.push(ChatMessage::tool(observation, tc.id));
        }
    }

    if full_content.trim().is_empty() && !full_reasoning.is_empty() {
        full_content = "已完成任务推演与相关操作。".to_string();
    }

    Ok(ReActRunResult {
        session_id: session_id.to_string(),
        content: full_content,
        reasoning_content: full_reasoning,
        steps,
        turns_used,
    })
}
