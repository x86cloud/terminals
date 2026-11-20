use crate::agent::model::ModelProfile;
use crate::agent::sub_agent::{execute_subagent_task, MysqlSubAgent, SshSubAgent, SubAgent};
use crate::agent::tool::{AgentTool, ToolCtx, ToolResult};
use crate::agent::types::{emit_agent_event, PlanStep, StepNode, SubAgentReport};
use crate::agent::AgentRuntime;
use crate::db::mysql::MysqlManager;
use crate::ssh::SshManager;
use async_trait::async_trait;
use serde_json::{json, Value};
use std::sync::{Arc, RwLock};
use std::time::Instant;
use uuid::Uuid;

// ============================================================================
// list_agents
// ============================================================================

pub struct ListAgentsTool {
    pub runtime: Arc<AgentRuntime>,
    pub ssh: Arc<SshManager>,
    pub mysql: Arc<MysqlManager>,
}

#[async_trait]
impl AgentTool for ListAgentsTool {
    fn name(&self) -> &str {
        "list_agents"
    }

    fn description(&self) -> &str {
        "List currently enabled and online sub-agents that can be dispatched (including SSH hosts and MySQL instances with names, endpoints, OS/version info, and status)."
    }

    fn parameters_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {}
        })
    }

    fn format_title(&self, _arguments: &str) -> String {
        "Checked available sub-agents".to_string()
    }

    async fn execute(&self, _ctx: &ToolCtx, _arguments: &str) -> ToolResult {
        let all = self.runtime.list_subagents(&self.ssh, &self.mysql).await;
        let enabled: Vec<_> = all.into_iter().filter(|a| a.enabled).collect();
        ToolResult::success(json!({
            "count": enabled.len(),
            "agents": enabled,
        }))
    }
}

// ============================================================================
// dispatch_task
// ============================================================================

pub struct DispatchTaskTool {
    pub runtime: Arc<AgentRuntime>,
    pub ssh: Arc<SshManager>,
    pub mysql: Arc<MysqlManager>,
    pub main_profile: ModelProfile,
    pub sub_profile: ModelProfile,
    pub user_goal: String,
    pub plan_summary: Arc<RwLock<String>>,
}

#[async_trait]
impl AgentTool for DispatchTaskTool {
    fn name(&self) -> &str {
        "dispatch_task"
    }

    fn description(&self) -> &str {
        "Dispatch a sub-task to a specified enabled sub-agent (supports SSH `ssh:<id>` and MySQL `mysql:<id>`, and multiple sub-agents can be called in parallel in the same turn). \
        Each sub-agent runs in an isolated context with remote command or SQL execution capabilities and returns a structured report (status/summary/commands/keyOutput/conclusion)."
    }

    fn parameters_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "agent_id": {
                    "type": "string",
                    "description": "Target sub-agent ID, e.g. ssh:<sessionId> or mysql:<serverId>"
                },
                "task": {
                    "type": "string",
                    "description": "Clear, concrete, and actionable sub-task instruction"
                },
                "context": {
                    "type": "string",
                    "description": "Optional prior context or background information to pass to the sub-agent"
                }
            },
            "required": ["agent_id", "task"]
        })
    }

    fn format_title(&self, arguments: &str) -> String {
        let args: Value = serde_json::from_str(arguments).unwrap_or_else(|_| json!({}));
        let agent_id = args.get("agent_id").and_then(|v| v.as_str()).unwrap_or("");
        let task = args.get("task").and_then(|v| v.as_str()).unwrap_or("").trim();
        let short_task: String = task.chars().take(48).collect();
        if agent_id.is_empty() {
            "Dispatched sub-agent task".to_string()
        } else if short_task.is_empty() {
            format!("Dispatched task to {}", agent_id)
        } else {
            format!("{} · {}", agent_id, short_task)
        }
    }

    fn records_own_step(&self) -> bool {
        true
    }

    async fn execute(&self, ctx: &ToolCtx, arguments: &str) -> ToolResult {
        let args: Value = serde_json::from_str(arguments).unwrap_or_else(|_| json!({}));
        let agent_id = args
            .get("agent_id")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .trim()
            .to_string();
        let task = args
            .get("task")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .trim()
            .to_string();
        let extra_context = args
            .get("context")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .trim()
            .to_string();

        if agent_id.is_empty() || task.is_empty() {
            return ToolResult::err("agent_id 与 task 均不能为空");
        }

        let is_ssh = agent_id.starts_with("ssh:");
        let is_mysql = agent_id.starts_with("mysql:");
        if !is_ssh && !is_mysql {
            return ToolResult::err(format!("不支持的子 Agent 类型: {}", agent_id));
        }

        if !self.runtime.is_agent_enabled(&agent_id) {
            return ToolResult::err(format!(
                "子 Agent {} 当前未开启（请在右侧「可调度子 Agent」面板开启后再试）",
                agent_id
            ));
        }

        let all = self.runtime.list_subagents(&self.ssh, &self.mysql).await;
        let Some(agent_info) = all.into_iter().find(|a| a.agent_id == agent_id) else {
            return ToolResult::err(format!("子 Agent {} 不在线或连接已断开", agent_id));
        };

        let sem = self.runtime.dispatch_semaphore();
        let permit = tokio::select! {
            _ = ctx.cancel.notify.notified() => {
                return ToolResult::err("任务已取消");
            }
            p = sem.acquire_owned() => {
                match p {
                    Ok(permit) => permit,
                    Err(_) => return ToolResult::err("并发调度信号量已关闭"),
                }
            }
        };

        // Re-check enabled state after waiting on semaphore
        if !self.runtime.is_agent_enabled(&agent_id) {
            drop(permit);
            return ToolResult::success(json!({
                "status": "cancelled",
                "summary": "用户已禁用该子 Agent",
                "commands": [],
                "keyOutput": "",
                "conclusion": "任务因用户关闭子 Agent 开关而终止"
            }));
        }

        let sub_run_id = format!("sub_{}", Uuid::new_v4());
        let sub_cancel = ctx.cancel.child();
        let reg_token = self
            .runtime
            .register_agent_cancel(&agent_id, sub_cancel.clone());

        self.runtime.set_agent_running(
            ctx.app.as_ref(),
            &ctx.conversation_id,
            &ctx.run_id,
            &agent_id,
            true,
        );

        emit_agent_event(
            ctx.app.as_ref(),
            &ctx.conversation_id,
            &ctx.run_id,
            ctx.parent_run_id.as_deref(),
            &agent_id,
            "subagent_link",
            json!({
                "stepId": ctx.step_id,
                "subRunId": sub_run_id,
                "agentId": agent_id,
                "name": agent_info.name,
                "host": format!("{}@{}", agent_info.user, agent_info.host),
                "task": task,
            }),
        );

        let sub_agent: Box<dyn SubAgent> = if let Some(sid) = agent_id.strip_prefix("ssh:") {
            Box::new(SshSubAgent::new(
                sid.to_string(),
                agent_info.clone(),
                self.ssh.clone(),
                self.runtime.clone(),
                self.main_profile.clone(),
                self.user_goal.clone(),
                self.plan_summary.clone(),
            ))
        } else {
            let sid = agent_id.strip_prefix("mysql:").unwrap_or(&agent_info.session_id);
            Box::new(MysqlSubAgent::new(
                sid.to_string(),
                agent_info.clone(),
                self.mysql.clone(),
                self.runtime.clone(),
                self.main_profile.clone(),
                self.user_goal.clone(),
                self.plan_summary.clone(),
            ))
        };

        let started = Instant::now();
        let run_res = execute_subagent_task(
            sub_agent.as_ref(),
            &self.runtime,
            &self.ssh,
            &self.mysql,
            ctx.app.clone(),
            &ctx.conversation_id,
            &sub_run_id,
            &ctx.run_id,
            &self.sub_profile,
            &task,
            &extra_context,
            sub_cancel.clone(),
            ctx.collector.clone(),
        )
        .await;
        let duration_ms = started.elapsed().as_millis() as u64;

        self.runtime.unregister_agent_cancel(&agent_id, reg_token);
        self.runtime.set_agent_running(
            ctx.app.as_ref(),
            &ctx.conversation_id,
            &ctx.run_id,
            &agent_id,
            false,
        );
        drop(permit);

        match run_res {
            Ok((report, children)) => {
                ctx.collector.push(
                    &ctx.run_id,
                    StepNode {
                        id: ctx.step_id.clone(),
                        run_id: ctx.run_id.clone(),
                        parent_run_id: ctx.parent_run_id.clone(),
                        agent_id: agent_id.clone(),
                        kind: "subagent_run".to_string(),
                        title: format!("{} · {}", agent_info.name, task),
                        status: if report.status == "failed" {
                            "failed"
                        } else {
                            "completed"
                        }
                        .to_string(),
                        data: json!({
                            "subRunId": sub_run_id,
                            "agentId": agent_id,
                            "name": agent_info.name,
                            "host": format!("{}@{}", agent_info.user, agent_info.host),
                            "task": task,
                            "report": report,
                        }),
                        duration_ms,
                        children,
                    },
                );
                ToolResult::success(json!(report))
            }
            Err((err_msg, children)) => {
                let disabled_by_user =
                    !self.runtime.is_agent_enabled(&agent_id) && !ctx.cancel.is_cancelled();
                let step_status = if disabled_by_user || sub_cancel.is_cancelled() {
                    "cancelled"
                } else {
                    "failed"
                };
                let report = SubAgentReport {
                    status: step_status.to_string(),
                    summary: if disabled_by_user {
                        "用户已禁用该子 Agent".to_string()
                    } else {
                        err_msg.clone()
                    },
                    commands: Vec::new(),
                    key_output: String::new(),
                    conclusion: if disabled_by_user {
                        "用户已关闭该子 Agent 开关，任务中止。".to_string()
                    } else {
                        err_msg.clone()
                    },
                };
                ctx.collector.push(
                    &ctx.run_id,
                    StepNode {
                        id: ctx.step_id.clone(),
                        run_id: ctx.run_id.clone(),
                        parent_run_id: ctx.parent_run_id.clone(),
                        agent_id: agent_id.clone(),
                        kind: "subagent_run".to_string(),
                        title: format!("{} · {}", agent_info.name, task),
                        status: step_status.to_string(),
                        data: json!({
                            "subRunId": sub_run_id,
                            "agentId": agent_id,
                            "name": agent_info.name,
                            "host": format!("{}@{}", agent_info.user, agent_info.host),
                            "task": task,
                            "report": report,
                            "error": err_msg,
                        }),
                        duration_ms,
                        children,
                    },
                );
                if disabled_by_user {
                    ToolResult::success(json!(report))
                } else {
                    ToolResult::err(err_msg)
                }
            }
        }
    }
}

// ============================================================================
// update_plan
// ============================================================================

pub struct UpdatePlanTool {
    pub plan_summary: Arc<RwLock<String>>,
}

#[async_trait]
impl AgentTool for UpdatePlanTool {
    fn name(&self) -> &str {
        "update_plan"
    }

    fn description(&self) -> &str {
        "Create or update the execution plan checklist for the current task (rendered as an interactive checklist in the chat timeline). \
        In Planning mode, plan steps before dispatching sub-agents and update each step's status as work progresses."
    }

    fn parameters_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "steps": {
                    "type": "array",
                    "description": "Full list of task steps with their latest status",
                    "items": {
                        "type": "object",
                        "properties": {
                            "id": { "type": "string" },
                            "title": { "type": "string" },
                            "status": {
                                "type": "string",
                                "enum": ["pending", "in_progress", "done", "failed"]
                            }
                        },
                        "required": ["id", "title", "status"]
                    }
                }
            },
            "required": ["steps"]
        })
    }

    fn format_title(&self, _arguments: &str) -> String {
        "Updated task plan".to_string()
    }

    fn records_own_step(&self) -> bool {
        true
    }

    async fn execute(&self, ctx: &ToolCtx, arguments: &str) -> ToolResult {
        let args: Value = serde_json::from_str(arguments).unwrap_or_else(|_| json!({}));
        let steps_val = args.get("steps").cloned().unwrap_or_else(|| json!([]));
        let steps: Vec<PlanStep> = serde_json::from_value(steps_val).unwrap_or_default();
        if steps.is_empty() {
            return ToolResult::err("steps 不能为空");
        }

        let summary_lines: Vec<String> = steps
            .iter()
            .map(|s| format!("[{}] {}", s.status, s.title))
            .collect();
        if let Ok(mut guard) = self.plan_summary.write() {
            *guard = summary_lines.join("; ");
        }

        ctx.collector.upsert_plan(
            &ctx.run_id,
            StepNode {
                id: ctx.step_id.clone(),
                run_id: ctx.run_id.clone(),
                parent_run_id: ctx.parent_run_id.clone(),
                agent_id: ctx.agent_id.clone(),
                kind: "plan".to_string(),
                title: "任务执行计划".to_string(),
                status: "completed".to_string(),
                data: json!({ "steps": steps }),
                duration_ms: 0,
                children: Vec::new(),
            },
        );

        emit_agent_event(
            ctx.app.as_ref(),
            &ctx.conversation_id,
            &ctx.run_id,
            ctx.parent_run_id.as_deref(),
            &ctx.agent_id,
            "plan_update",
            json!({
                "stepId": ctx.step_id,
                "steps": steps,
            }),
        );

        ToolResult::success(json!({ "ok": true, "stepCount": steps.len() }))
    }
}

// ============================================================================
// ask_user
// ============================================================================

pub struct AskUserTool {
    pub runtime: Arc<AgentRuntime>,
}

#[async_trait]
impl AgentTool for AskUserTool {
    fn name(&self) -> &str {
        "ask_user"
    }

    fn description(&self) -> &str {
        "Prompt the user with single-select, multi-select, or free-text questions to clarify requirements, confirm an approach, or gather missing inputs."
    }

    fn parameters_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "questions": {
                    "type": "array",
                    "description": "List of questions to ask the user",
                    "items": {
                        "type": "object",
                        "properties": {
                            "id": { "type": "string" },
                            "question": { "type": "string" },
                            "options": {
                                "type": "array",
                                "items": { "type": "string" },
                                "description": "Optional preset choices; if empty, only a free-text input is shown"
                            },
                            "multiSelect": { "type": "boolean" }
                        },
                        "required": ["question"]
                    }
                }
            },
            "required": ["questions"]
        })
    }

    fn format_title(&self, _arguments: &str) -> String {
        "Asked user for clarification".to_string()
    }

    fn records_own_step(&self) -> bool {
        true
    }

    async fn execute(&self, ctx: &ToolCtx, arguments: &str) -> ToolResult {
        let args: Value = serde_json::from_str(arguments).unwrap_or_else(|_| json!({}));
        let questions = args.get("questions").cloned().unwrap_or_else(|| json!([]));
        if !questions.is_array() || questions.as_array().map(|a| a.is_empty()).unwrap_or(true) {
            return ToolResult::err("questions 不能为空");
        }

        let ask_id = format!("ask_{}", Uuid::new_v4());
        let rx = self.runtime.register_pending_ask(&ask_id, &ctx.conversation_id);

        emit_agent_event(
            ctx.app.as_ref(),
            &ctx.conversation_id,
            &ctx.run_id,
            ctx.parent_run_id.as_deref(),
            &ctx.agent_id,
            "ask_user",
            json!({
                "askId": ask_id,
                "stepId": ctx.step_id,
                "questions": questions,
            }),
        );

        let started = Instant::now();
        let answer_opt = tokio::select! {
            _ = ctx.cancel.notify.notified() => {
                self.runtime.remove_pending_ask(&ask_id);
                None
            }
            res = rx => {
                res.ok()
            }
        };
        let duration_ms = started.elapsed().as_millis() as u64;

        let Some(answers) = answer_opt else {
            emit_agent_event(
                ctx.app.as_ref(),
                &ctx.conversation_id,
                &ctx.run_id,
                ctx.parent_run_id.as_deref(),
                &ctx.agent_id,
                "ask_user_resolved",
                json!({
                    "askId": ask_id,
                    "stepId": ctx.step_id,
                    "cancelled": true,
                }),
            );
            return ToolResult::err("用户取消或停止了对话");
        };

        ctx.collector.push(
            &ctx.run_id,
            StepNode {
                id: ask_id.clone(),
                run_id: ctx.run_id.clone(),
                parent_run_id: ctx.parent_run_id.clone(),
                agent_id: ctx.agent_id.clone(),
                kind: "ask_user".to_string(),
                title: "用户确认".to_string(),
                status: "completed".to_string(),
                data: json!({
                    "askId": ask_id,
                    "stepId": ctx.step_id,
                    "questions": questions,
                    "answers": answers,
                }),
                duration_ms,
                children: Vec::new(),
            },
        );

        emit_agent_event(
            ctx.app.as_ref(),
            &ctx.conversation_id,
            &ctx.run_id,
            ctx.parent_run_id.as_deref(),
            &ctx.agent_id,
            "ask_user_resolved",
            json!({
                "askId": ask_id,
                "stepId": ctx.step_id,
                "answers": answers,
            }),
        );

        ToolResult::success(json!({ "answers": answers }))
    }
}
