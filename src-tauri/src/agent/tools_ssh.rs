use crate::agent::approval::authorize_ssh_command;
use crate::agent::model::ModelProfile;
use crate::agent::tool::{AgentTool, ToolCtx, ToolResult};
use crate::agent::types::{emit_agent_event, StepNode};
use crate::agent::AgentRuntime;
use crate::ssh::SshManager;
use async_trait::async_trait;
use serde_json::{json, Value};
use std::sync::Arc;
use std::time::{Duration, Instant};

const MAX_EXEC_OUTPUT_BYTES: usize = 16 * 1024;
const DEFAULT_EXEC_TIMEOUT_SECS: u64 = 60;
const MAX_EXEC_TIMEOUT_SECS: u64 = 300;

/// Truncates long command output to `max_bytes`, preserving both the head and tail
/// on valid UTF-8 boundaries.
pub fn truncate_head_tail(text: &str, max_bytes: usize) -> (String, bool) {
    if text.len() <= max_bytes {
        return (text.to_string(), false);
    }
    let half = max_bytes / 2;
    let mut head_end = half.min(text.len());
    while head_end > 0 && !text.is_char_boundary(head_end) {
        head_end -= 1;
    }
    let mut tail_start = text.len().saturating_sub(half);
    while tail_start < text.len() && !text.is_char_boundary(tail_start) {
        tail_start += 1;
    }
    if tail_start <= head_end {
        return (text.to_string(), false);
    }
    let omitted = tail_start - head_end;
    let combined = format!(
        "{}\n... [已省略 {} 字节输出] ...\n{}",
        &text[..head_end],
        omitted,
        &text[tail_start..]
    );
    (combined, true)
}

pub struct SshExecTool {
    pub session_id: String,
    pub host_label: String,
    pub ssh: Arc<SshManager>,
    pub runtime: Arc<AgentRuntime>,
    pub main_profile: ModelProfile,
    pub user_goal: String,
    pub plan_summary: Arc<std::sync::RwLock<String>>,
}

#[async_trait]
impl AgentTool for SshExecTool {
    fn name(&self) -> &str {
        "ssh_exec"
    }

    fn description(&self) -> &str {
        "Execute a non-interactive shell command on the bound remote SSH host and return stdout, stderr, exitCode, and duration. \
        Before execution, accurately assess `risk_self` (read = read-only inspection, modify = config/service/package changes, danger = destructive operations) and provide a clear `reason`."
    }

    fn parameters_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "command": {
                    "type": "string",
                    "description": "Non-interactive shell command to execute"
                },
                "reason": {
                    "type": "string",
                    "description": "Purpose and necessity of executing this command (shown to Main Agent / user during approval)"
                },
                "risk_self": {
                    "type": "string",
                    "enum": ["read", "modify", "danger"],
                    "description": "Self-assessed risk level: read (read-only query), modify (state or file mutation), danger (high-risk destructive operation)"
                },
                "timeout_sec": {
                    "type": "integer",
                    "description": "Optional timeout in seconds (default 60, max 300)"
                }
            },
            "required": ["command", "reason", "risk_self"]
        })
    }

    fn format_title(&self, arguments: &str) -> String {
        let args: Value = serde_json::from_str(arguments).unwrap_or_else(|_| json!({}));
        let cmd = args
            .get("command")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .trim();
        if cmd.is_empty() {
            format!("Ran command on {}", self.host_label)
        } else {
            let preview = if cmd.chars().count() > 64 {
                let s: String = cmd.chars().take(64).collect();
                format!("{}...", s)
            } else {
                cmd.to_string()
            };
            format!("Ran `{}` on {}", preview, self.host_label)
        }
    }

    fn records_own_step(&self) -> bool {
        true
    }

    async fn execute(&self, ctx: &ToolCtx, arguments: &str) -> ToolResult {
        if ctx.cancel.is_cancelled() {
            return ToolResult::err("任务已取消");
        }

        let args: Value = serde_json::from_str(arguments).unwrap_or_else(|_| json!({}));
        let command = args
            .get("command")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .trim()
            .to_string();
        if command.is_empty() {
            return ToolResult::err("command 不能为空");
        }

        let reason = args
            .get("reason")
            .and_then(|v| v.as_str())
            .unwrap_or("执行远端运维检查/操作")
            .trim()
            .to_string();
        let risk_self = args
            .get("risk_self")
            .and_then(|v| v.as_str())
            .unwrap_or("read")
            .trim()
            .to_string();
        let timeout_sec = args
            .get("timeout_sec")
            .and_then(|v| v.as_u64())
            .unwrap_or(DEFAULT_EXEC_TIMEOUT_SECS)
            .clamp(1, MAX_EXEC_TIMEOUT_SECS);

        let plan_snapshot = self
            .plan_summary
            .read()
            .map(|g| g.clone())
            .unwrap_or_default();

        if let Err(deny_err) = authorize_ssh_command(
            &self.runtime,
            &self.main_profile,
            &self.user_goal,
            &plan_snapshot,
            &self.session_id,
            &command,
            &reason,
            &risk_self,
            ctx,
        )
        .await
        {
            ctx.collector.push(
                &ctx.run_id,
                StepNode {
                    id: ctx.step_id.clone(),
                    run_id: ctx.run_id.clone(),
                    parent_run_id: ctx.parent_run_id.clone(),
                    agent_id: ctx.agent_id.clone(),
                    kind: "exec".to_string(),
                    title: command.clone(),
                    status: if ctx.cancel.is_cancelled() {
                        "cancelled"
                    } else {
                        "failed"
                    }
                    .to_string(),
                    data: json!({
                        "command": command,
                        "reason": reason,
                        "risk": risk_self,
                        "stdout": "",
                        "stderr": deny_err,
                        "exitCode": -1,
                        "truncated": false,
                    }),
                    duration_ms: 0,
                    children: Vec::new(),
                },
            );
            return ToolResult::err(deny_err);
        }

        let session = match self.ssh.get_session(&self.session_id).await {
            Ok(s) => s,
            Err(e) => return ToolResult::err(e),
        };

        let start = Instant::now();
        let exec_res = session
            .exec_with_timeout(
                &command,
                Duration::from_secs(timeout_sec),
                &ctx.cancel.flag,
                &ctx.cancel.notify,
            )
            .await;
        let duration_ms = start.elapsed().as_millis() as u64;

        match exec_res {
            Ok((raw_out, raw_err, exit_code)) => {
                let (stdout, trunc_out) = truncate_head_tail(&raw_out, MAX_EXEC_OUTPUT_BYTES);
                let (stderr, trunc_err) = truncate_head_tail(&raw_err, MAX_EXEC_OUTPUT_BYTES / 2);
                let truncated = trunc_out || trunc_err;
                let step_status = if exit_code == 0 { "completed" } else { "failed" };

                ctx.collector.push(
                    &ctx.run_id,
                    StepNode {
                        id: ctx.step_id.clone(),
                        run_id: ctx.run_id.clone(),
                        parent_run_id: ctx.parent_run_id.clone(),
                        agent_id: ctx.agent_id.clone(),
                        kind: "exec".to_string(),
                        title: command.clone(),
                        status: step_status.to_string(),
                        data: json!({
                            "command": command,
                            "reason": reason,
                            "stdout": stdout,
                            "stderr": stderr,
                            "exitCode": exit_code,
                            "durationMs": duration_ms,
                            "truncated": truncated,
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
                    "exec_output",
                    json!({
                        "stepId": ctx.step_id,
                        "command": command,
                        "stdout": stdout,
                        "stderr": stderr,
                        "exitCode": exit_code,
                        "durationMs": duration_ms,
                        "truncated": truncated,
                    }),
                );

                ToolResult::success(json!({
                    "exitCode": exit_code,
                    "stdout": stdout,
                    "stderr": stderr,
                    "durationMs": duration_ms,
                    "truncated": truncated,
                }))
            }
            Err(err_msg) => {
                let status = if ctx.cancel.is_cancelled() {
                    "cancelled"
                } else {
                    "failed"
                };
                ctx.collector.push(
                    &ctx.run_id,
                    StepNode {
                        id: ctx.step_id.clone(),
                        run_id: ctx.run_id.clone(),
                        parent_run_id: ctx.parent_run_id.clone(),
                        agent_id: ctx.agent_id.clone(),
                        kind: "exec".to_string(),
                        title: command.clone(),
                        status: status.to_string(),
                        data: json!({
                            "command": command,
                            "reason": reason,
                            "stdout": "",
                            "stderr": err_msg,
                            "exitCode": -1,
                            "durationMs": duration_ms,
                            "truncated": false,
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
                    "exec_output",
                    json!({
                        "stepId": ctx.step_id,
                        "command": command,
                        "stdout": "",
                        "stderr": err_msg,
                        "exitCode": -1,
                        "durationMs": duration_ms,
                        "truncated": false,
                    }),
                );
                ToolResult::err(err_msg)
            }
        }
    }
}
