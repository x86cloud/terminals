use crate::agent::model::{stream_chat_turn, ChatMessage, ModelProfile};
use crate::agent::tool::{ToolCtx, ToolRegistry};
use crate::agent::types::{emit_agent_event, RunCancel, StepCollector, StepNode};
use crate::core::storage;
use futures_util::future::join_all;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::sync::Arc;
use std::time::Instant;
use tauri::AppHandle;

pub const DEFAULT_MAIN_MAX_TURNS: usize = 40;
pub const DEFAULT_SUBAGENT_MAX_TURNS: usize = 20;

#[derive(Debug, Clone)]
pub struct ReactRunConfig {
    pub app: Option<AppHandle>,
    pub conversation_id: String,
    pub run_id: String,
    pub parent_run_id: Option<String>,
    pub agent_id: String,
    pub system_prompt: String,
    pub max_turns: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReActRunResult {
    pub run_id: String,
    pub content: String,
    pub reasoning_content: String,
    pub steps: Vec<StepNode>,
    pub turns_used: usize,
}

/// Executes a generalized ReAct (Reasoning + Acting) loop for either the Main Orchestrator
/// or a Sub-Agent. Multiple tool calls returned in the same assistant turn run concurrently.
pub async fn run_react_loop(
    cfg: &ReactRunConfig,
    profile: &ModelProfile,
    history: Vec<ChatMessage>,
    tool_registry: &ToolRegistry,
    cancel: Arc<RunCancel>,
    collector: Arc<StepCollector>,
) -> Result<ReActRunResult, String> {
    let max_turns = if cfg.max_turns == 0 {
        DEFAULT_MAIN_MAX_TURNS
    } else {
        cfg.max_turns
    };

    let mut context_msgs: Vec<ChatMessage> = Vec::with_capacity(history.len() + 4);
    context_msgs.push(ChatMessage::system(&cfg.system_prompt));
    for m in history {
        if m.role.to_lowercase() != "system" {
            context_msgs.push(m);
        }
    }

    let tool_defs = tool_registry.definitions();
    let mut final_content = String::new();
    let mut full_reasoning = String::new();
    let mut in_think_tag = false;
    let mut turns_used = 0;

    storage::log_info(format!(
        "[Agent][ReAct] Start conv={} run={} agent={} model={} msgs={} tools={}",
        cfg.conversation_id,
        cfg.run_id,
        cfg.agent_id,
        profile.model,
        context_msgs.len(),
        tool_defs.len()
    ));

    emit_agent_event(
        cfg.app.as_ref(),
        &cfg.conversation_id,
        &cfg.run_id,
        cfg.parent_run_id.as_deref(),
        &cfg.agent_id,
        "run_start",
        json!({ "maxTurns": max_turns }),
    );

    let loop_res: Result<(), String> = async {
        for turn in 1..=max_turns {
            turns_used = turn;
            if cancel.is_cancelled() {
                return Err("用户手动停止了推导".to_string());
            }

            let turn_start = Instant::now();
            let turn_out = stream_chat_turn(
                profile,
                &context_msgs,
                &tool_defs,
                &cancel,
                &mut in_think_tag,
                |chunk| {
                    emit_agent_event(
                        cfg.app.as_ref(),
                        &cfg.conversation_id,
                        &cfg.run_id,
                        cfg.parent_run_id.as_deref(),
                        &cfg.agent_id,
                        "content_chunk",
                        json!({ "turn": turn, "chunk": chunk }),
                    );
                },
                |r_chunk| {
                    emit_agent_event(
                        cfg.app.as_ref(),
                        &cfg.conversation_id,
                        &cfg.run_id,
                        cfg.parent_run_id.as_deref(),
                        &cfg.agent_id,
                        "reasoning_chunk",
                        json!({ "turn": turn, "chunk": r_chunk }),
                    );
                },
            )
            .await?;

            if !turn_out.reasoning_content.is_empty() {
                full_reasoning.push_str(&turn_out.reasoning_content);
                let think_ms = turn_start.elapsed().as_millis() as u64;
                collector.push(
                    &cfg.run_id,
                    StepNode {
                        id: format!("think_{}_{}", cfg.run_id, turn),
                        run_id: cfg.run_id.clone(),
                        parent_run_id: cfg.parent_run_id.clone(),
                        agent_id: cfg.agent_id.clone(),
                        kind: "thought".to_string(),
                        title: format!("Thought ({:.1}s)", (think_ms as f64) / 1000.0),
                        status: "completed".to_string(),
                        data: json!({
                            "turn": turn,
                            "text": turn_out.reasoning_content,
                        }),
                        duration_ms: think_ms,
                        children: Vec::new(),
                    },
                );
            }

            if turn_out.tool_calls.is_empty() {
                final_content = turn_out.content;
                storage::log_info(format!(
                    "[Agent][ReAct] Run {} completed on turn {}",
                    cfg.run_id, turn
                ));
                break;
            }

            if !turn_out.content.trim().is_empty() {
                collector.push(
                    &cfg.run_id,
                    StepNode {
                        id: format!("content_{}_{}", cfg.run_id, turn),
                        run_id: cfg.run_id.clone(),
                        parent_run_id: cfg.parent_run_id.clone(),
                        agent_id: cfg.agent_id.clone(),
                        kind: "content".to_string(),
                        title: String::new(),
                        status: "completed".to_string(),
                        data: json!({
                            "turn": turn,
                            "text": turn_out.content,
                        }),
                        duration_ms: 0,
                        children: Vec::new(),
                    },
                );
            }

            context_msgs.push(ChatMessage::assistant(
                turn_out.content.clone(),
                if turn_out.reasoning_content.is_empty() {
                    None
                } else {
                    Some(turn_out.reasoning_content.clone())
                },
                turn_out.tool_calls.clone(),
            ));

            let futs = turn_out.tool_calls.into_iter().map(|tc| {
                let cfg_ref = cfg;
                let cancel_clone = cancel.clone();
                let collector_clone = collector.clone();
                async move {
                    let step_id = tc.id.clone();
                    let action_start = Instant::now();
                    let tool_opt = tool_registry.get(&tc.name);
                    let title = tool_opt
                        .as_ref()
                        .map(|t| t.format_title(&tc.args))
                        .unwrap_or_else(|| tc.name.clone());
                    let records_own = tool_opt
                        .as_ref()
                        .map(|t| t.records_own_step())
                        .unwrap_or(false);

                    emit_agent_event(
                        cfg_ref.app.as_ref(),
                        &cfg_ref.conversation_id,
                        &cfg_ref.run_id,
                        cfg_ref.parent_run_id.as_deref(),
                        &cfg_ref.agent_id,
                        "tool_start",
                        json!({
                            "stepId": step_id,
                            "turn": turn,
                            "tool": tc.name,
                            "title": title,
                            "args": tc.args,
                        }),
                    );

                    let ctx = ToolCtx {
                        conversation_id: cfg_ref.conversation_id.clone(),
                        run_id: cfg_ref.run_id.clone(),
                        parent_run_id: cfg_ref.parent_run_id.clone(),
                        agent_id: cfg_ref.agent_id.clone(),
                        step_id: step_id.clone(),
                        cancel: cancel_clone,
                        app: cfg_ref.app.clone(),
                        collector: collector_clone.clone(),
                    };

                    let tool_res = match tool_opt {
                        Some(tool) => tool.execute(&ctx, &tc.args).await,
                        None => crate::agent::tool::ToolResult::err(format!(
                            "未找到工具: {}",
                            tc.name
                        )),
                    };

                    let observation = tool_res.to_observation_string();
                    let elapsed_ms = action_start.elapsed().as_millis() as u64;
                    let status = if ctx.cancel.is_cancelled() {
                        "cancelled"
                    } else if tool_res.ok {
                        "completed"
                    } else {
                        "failed"
                    };

                    if !records_own {
                        let parsed_args: Value =
                            serde_json::from_str(&tc.args).unwrap_or_else(|_| json!(tc.args));
                        collector_clone.push(
                            &cfg_ref.run_id,
                            StepNode {
                                id: step_id.clone(),
                                run_id: cfg_ref.run_id.clone(),
                                parent_run_id: cfg_ref.parent_run_id.clone(),
                                agent_id: cfg_ref.agent_id.clone(),
                                kind: "tool".to_string(),
                                title: title.clone(),
                                status: status.to_string(),
                                data: json!({
                                    "tool": tc.name,
                                    "args": parsed_args,
                                    "result": if tool_res.ok { tool_res.data.clone() } else { Value::Null },
                                    "error": tool_res.error.clone(),
                                    "observation": observation,
                                }),
                                duration_ms: elapsed_ms,
                                children: Vec::new(),
                            },
                        );
                    }

                    emit_agent_event(
                        cfg_ref.app.as_ref(),
                        &cfg_ref.conversation_id,
                        &cfg_ref.run_id,
                        cfg_ref.parent_run_id.as_deref(),
                        &cfg_ref.agent_id,
                        "tool_end",
                        json!({
                            "stepId": step_id,
                            "turn": turn,
                            "tool": tc.name,
                            "title": title,
                            "status": status,
                            "durationMs": elapsed_ms,
                            "result": observation,
                        }),
                    );

                    (tc.id, observation)
                }
            });

            let results = join_all(futs).await;
            for (tc_id, observation) in results {
                context_msgs.push(ChatMessage::tool(observation, tc_id));
            }
        }
        Ok(())
    }
    .await;

    match loop_res {
        Ok(()) => {
            let steps = collector.take(&cfg.run_id);
            if final_content.trim().is_empty() && !full_reasoning.is_empty() {
                final_content = "已完成任务推演与相关操作。".to_string();
            }
            emit_agent_event(
                cfg.app.as_ref(),
                &cfg.conversation_id,
                &cfg.run_id,
                cfg.parent_run_id.as_deref(),
                &cfg.agent_id,
                "run_end",
                json!({
                    "status": "completed",
                    "turnsUsed": turns_used,
                    "content": final_content,
                }),
            );
            Ok(ReActRunResult {
                run_id: cfg.run_id.clone(),
                content: final_content,
                reasoning_content: full_reasoning,
                steps,
                turns_used,
            })
        }
        Err(err) => {
            let status = if cancel.is_cancelled() {
                "cancelled"
            } else {
                "failed"
            };
            emit_agent_event(
                cfg.app.as_ref(),
                &cfg.conversation_id,
                &cfg.run_id,
                cfg.parent_run_id.as_deref(),
                &cfg.agent_id,
                "error",
                json!({ "message": err, "status": status }),
            );
            emit_agent_event(
                cfg.app.as_ref(),
                &cfg.conversation_id,
                &cfg.run_id,
                cfg.parent_run_id.as_deref(),
                &cfg.agent_id,
                "run_end",
                json!({ "status": status, "turnsUsed": turns_used }),
            );
            Err(err)
        }
    }
}
