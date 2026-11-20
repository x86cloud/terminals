use crate::agent::model::{stream_chat_turn, ChatMessage, ModelProfile};
use crate::agent::tool::ToolCtx;
use crate::agent::types::{emit_agent_event, ApprovalDecision, StepNode};
use crate::agent::AgentRuntime;
use regex::Regex;
use serde::Deserialize;
use serde_json::json;
use std::sync::OnceLock;
use std::time::Instant;
use uuid::Uuid;

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum RiskLevel {
    Read = 0,
    Modify = 1,
    Danger = 2,
}

impl RiskLevel {
    pub fn as_str(&self) -> &'static str {
        match self {
            RiskLevel::Read => "read",
            RiskLevel::Modify => "modify",
            RiskLevel::Danger => "danger",
        }
    }

    pub fn from_self_str(s: &str) -> Self {
        match s.trim().to_ascii_lowercase().as_str() {
            "danger" | "dangerous" | "high" => RiskLevel::Danger,
            "modify" | "write" | "medium" => RiskLevel::Modify,
            _ => RiskLevel::Read,
        }
    }
}

fn danger_patterns() -> &'static [Regex] {
    static PATS: OnceLock<Vec<Regex>> = OnceLock::new();
    PATS.get_or_init(|| {
        [
            r"(?i)\brm\s+(-[a-zA-Z]*r[a-zA-Z]*f|-[a-zA-Z]*f[a-zA-Z]*r|--recursive\s+--force|--force\s+--recursive)\s+(/|\*|~|\$HOME)(\s|$)",
            r"(?i)\brm\s+-rf\s+/\S*",
            r"(?i)\b(mkfs(\.[a-z0-9]+)?|fdisk|parted|wipefs)\b",
            r"(?i)\bdd\s+[^\n]*\bof=/dev/",
            r"(?i)\b(shutdown|reboot|halt|poweroff|init\s+[06])\b",
            r":\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;",
            r"(?i)>\s*/dev/(sd|hd|nvme|vd|xvd)",
            r"(?i)\bchmod\s+(-R\s+)?777\s+/(\s|$)",
            r"(?i)\biptables\s+(-F|--flush)\b",
            r"(?i)\b(userdel|groupdel)\b",
            r"(?i)\bdrop\s+(database|schema)\b",
        ]
        .iter()
        .filter_map(|p| Regex::new(p).ok())
        .collect()
    })
}

fn modify_patterns() -> &'static [Regex] {
    static PATS: OnceLock<Vec<Regex>> = OnceLock::new();
    PATS.get_or_init(|| {
        [
            r"(?i)\bsystemctl\s+(start|stop|restart|reload|enable|disable|mask|unmask|daemon-reload)\b",
            r"(?i)\bservice\s+\S+\s+(start|stop|restart|reload)\b",
            r"(?i)\b(apt|apt-get|yum|dnf|apk|pacman|zypper|pip|pip3|npm|pnpm)\s+(install|remove|purge|uninstall|upgrade|update)\b",
            r"(?i)\b(kill|pkill|killall)\b",
            r"(?i)\b(mv|cp|rm|rmdir|mkdir|touch|ln|chmod|chown|chgrp|truncate)\b",
            r"(?i)\bsed\s+[^\n]*-i",
            r"(?i)\btee\b",
            r"(?i)\bdocker\s+(rm|rmi|stop|kill|restart|run|exec|prune|compose\s+(up|down|restart|stop))\b",
            r"(?i)\bkubectl\s+(apply|delete|patch|edit|scale|rollout\s+restart)\b",
            r"(?i)\b(crontab\s+-[er]|ufw\s+|firewall-cmd\s+)\b",
            r"(?i)\b(useradd|usermod|groupadd|passwd)\b",
        ]
        .iter()
        .filter_map(|p| Regex::new(p).ok())
        .collect()
    })
}

fn has_file_redirection(cmd: &str) -> bool {
    // Strip harmless stderr/null redirections before checking for file writes.
    let stripped = cmd
        .replace("2>/dev/null", "")
        .replace("2>&1", "")
        .replace("1>/dev/null", "")
        .replace(">/dev/null", "");
    stripped.contains('>')
}

pub fn classify_command_risk(command: &str, risk_self: &str) -> RiskLevel {
    let self_risk = RiskLevel::from_self_str(risk_self);
    let mut rule_risk = RiskLevel::Read;

    if danger_patterns().iter().any(|re| re.is_match(command)) {
        rule_risk = RiskLevel::Danger;
    } else if modify_patterns().iter().any(|re| re.is_match(command))
        || has_file_redirection(command)
    {
        rule_risk = RiskLevel::Modify;
    }

    self_risk.max(rule_risk)
}

/// Normalizes a command into its leading two whitespace-separated tokens for "Always allow" matching
/// (e.g. `systemctl restart nginx` -> `systemctl restart`).
pub fn normalize_cmd_prefix(command: &str) -> String {
    let tokens: Vec<&str> = command.split_whitespace().take(2).collect();
    tokens.join(" ").to_ascii_lowercase()
}

fn strip_leading_sql_comments(sql: &str) -> &str {
    let mut s = sql.trim();
    loop {
        if s.starts_with("/*") {
            if let Some(idx) = s.find("*/") {
                s = s[idx + 2..].trim();
                continue;
            }
            break;
        }
        if s.starts_with("--") || s.starts_with('#') {
            if let Some(idx) = s.find('\n') {
                s = s[idx + 1..].trim();
                continue;
            } else {
                return "";
            }
        }
        break;
    }
    s
}

fn sql_danger_patterns() -> &'static [Regex] {
    static PATS: OnceLock<Vec<Regex>> = OnceLock::new();
    PATS.get_or_init(|| {
        [
            r"(?i)\bdrop\s+(database|schema|table|user|role)\b",
            r"(?i)\btruncate\s+(table\s+)?\S+",
            r"(?i)\b(grant|revoke)\b",
            r"(?i)\b(set\s+global|set\s+persist)\b",
            r"(?i)\b(flush\s+privileges|flush\s+tables|reset\s+master|reset\s+slave|reset\s+replica|purge\s+binary\s+logs)\b",
            r"(?i)\b(kill\s+(query\s+|connection\s+)?\d+|shutdown)\b",
            r"(?i)\balter\s+user\b",
        ]
        .iter()
        .filter_map(|p| Regex::new(p).ok())
        .collect()
    })
}

fn sql_where_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"(?i)\bwhere\b").unwrap())
}

pub fn classify_sql_risk(sql: &str, risk_self: &str) -> RiskLevel {
    let self_risk = RiskLevel::from_self_str(risk_self);
    let cleaned = strip_leading_sql_comments(sql);
    let upper = cleaned.to_ascii_uppercase();

    let mut rule_risk = if crate::db::mysql::is_read_query(cleaned) {
        RiskLevel::Read
    } else {
        RiskLevel::Modify
    };

    if sql_danger_patterns().iter().any(|re| re.is_match(cleaned)) {
        rule_risk = RiskLevel::Danger;
    } else if (upper.starts_with("DELETE ") || upper.starts_with("UPDATE "))
        && !sql_where_re().is_match(cleaned)
    {
        // Unconditional DELETE or UPDATE without WHERE clause is high-risk
        rule_risk = RiskLevel::Danger;
    }

    self_risk.max(rule_risk)
}

pub fn normalize_sql_prefix(sql: &str) -> String {
    let cleaned = strip_leading_sql_comments(sql);
    let tokens: Vec<&str> = cleaned.split_whitespace().take(2).collect();
    tokens.join(" ").to_ascii_lowercase()
}

#[derive(Debug, Clone, Deserialize)]
struct MainApprovalRaw {
    decision: String,
    #[serde(default)]
    reason: String,
}

#[derive(Debug, Clone)]
pub struct MainVerdict {
    pub decision: String, // "approve" | "reject" | "escalate"
    pub reason: String,
}

fn parse_main_verdict(raw: &str) -> MainVerdict {
    let trimmed = raw.trim();
    let cleaned = trimmed
        .strip_prefix("```json")
        .or_else(|| trimmed.strip_prefix("```"))
        .map(|s| s.trim())
        .and_then(|s| s.strip_suffix("```").map(|x| x.trim()))
        .unwrap_or(trimmed);

    if let Ok(parsed) = serde_json::from_str::<MainApprovalRaw>(cleaned) {
        let dec = match parsed.decision.trim().to_ascii_lowercase().as_str() {
            "approve" => "approve",
            "reject" | "deny" => "reject",
            _ => "escalate",
        };
        return MainVerdict {
            decision: dec.to_string(),
            reason: parsed.reason,
        };
    }

    if let (Some(start), Some(end)) = (cleaned.find('{'), cleaned.rfind('}')) {
        if end > start {
            if let Ok(parsed) = serde_json::from_str::<MainApprovalRaw>(&cleaned[start..=end]) {
                let dec = match parsed.decision.trim().to_ascii_lowercase().as_str() {
                    "approve" => "approve",
                    "reject" | "deny" => "reject",
                    _ => "escalate",
                };
                return MainVerdict {
                    decision: dec.to_string(),
                    reason: parsed.reason,
                };
            }
        }
    }

    MainVerdict {
        decision: "escalate".to_string(),
        reason: "主 Agent 审批结果格式无法确定，转交用户确认".to_string(),
    }
}

/// Standalone tool-free LLM call using the Main Agent's model & context to evaluate
/// whether a modifying command from a sub-agent aligns with the user's goal and plan.
async fn request_main_agent_approval(
    profile: &ModelProfile,
    user_goal: &str,
    plan_summary: &str,
    agent_id: &str,
    command: &str,
    reason: &str,
    risk: RiskLevel,
    ctx: &ToolCtx,
) -> MainVerdict {
    let sys = "你是多层 AI 运维系统中的【主 Agent 审批官】。\
        你的职责是审核底层子 Agent 提交的远端修改类操作，判断是否严格符合用户原始目标与当前计划，且不存在越权、误删、破坏生产稳定性的风险。\n\
        你必须只输出一个合法 JSON 对象，格式严格为：\n\
        {\"decision\": \"approve\" | \"reject\" | \"escalate\", \"reason\": \"简明中文理由\"}\n\
        判定准则：\n\
        - approve：明确在用户目标授权范围内、影响可控、命令参数准确；\n\
        - reject：与用户目标不符、命令有误或存在明显破坏风险；\n\
        - escalate：涉及生产服务中断、配置文件覆写、批量变更或你无法百分之百确认用户意图时，必须转交用户确认。";

    let user_msg = format!(
        "用户原始需求：{}\n当前任务计划：{}\n请求子 Agent：{}\n风险等级：{}\n待执行命令：{}\n子 Agent 申请理由：{}",
        user_goal,
        if plan_summary.trim().is_empty() {
            "（未制定显式清单）"
        } else {
            plan_summary
        },
        agent_id,
        risk.as_str(),
        command,
        reason
    );

    let msgs = vec![ChatMessage::system(sys), ChatMessage::user(user_msg)];
    let mut in_think = false;
    match stream_chat_turn(
        profile,
        &msgs,
        &[],
        &ctx.cancel,
        &mut in_think,
        |_| {},
        |_| {},
    )
    .await
    {
        Ok(out) => parse_main_verdict(&out.content),
        Err(_) => MainVerdict {
            decision: "escalate".to_string(),
            reason: "主 Agent 审批调用异常，转交用户确认".to_string(),
        },
    }
}

/// Two-level authorization gate for `ssh_exec`:
/// - `Read`: runs directly.
/// - `Modify`: checks whitelist -> main agent bypass approval -> escalates to user if needed.
/// - `Danger`: always requires explicit user approval (never covered by "Always allow").
pub async fn authorize_ssh_command(
    runtime: &AgentRuntime,
    main_profile: &ModelProfile,
    user_goal: &str,
    plan_summary: &str,
    session_id: &str,
    command: &str,
    reason: &str,
    risk_self: &str,
    ctx: &ToolCtx,
) -> Result<(), String> {
    let settings = runtime.get_settings();
    let risk = classify_command_risk(command, risk_self);

    if risk == RiskLevel::Read {
        return Ok(());
    }

    if !settings.ai_enable_permission_guard
        && (risk == RiskLevel::Modify || !settings.ai_block_high_risk_commands)
    {
        return Ok(());
    }

    let prefix = normalize_cmd_prefix(command);
    let mut main_verdict_text: Option<String> = None;

    if risk == RiskLevel::Modify {
        if runtime.is_always_allowed(&ctx.conversation_id, session_id, &prefix) {
            let approval_id = format!("appr_{}", Uuid::new_v4());
            let step_node = StepNode {
                id: approval_id.clone(),
                run_id: ctx.run_id.clone(),
                parent_run_id: ctx.parent_run_id.clone(),
                agent_id: ctx.agent_id.clone(),
                kind: "approval".to_string(),
                title: format!("已自动放行（始终允许）: {}", command),
                status: "completed".to_string(),
                data: json!({
                    "approvalId": approval_id,
                    "stepId": ctx.step_id,
                    "command": command,
                    "risk": risk.as_str(),
                    "reason": reason,
                    "decision": "always",
                    "by": "whitelist",
                }),
                duration_ms: 0,
                children: Vec::new(),
            };
            ctx.collector.push(&ctx.run_id, step_node);
            emit_agent_event(
                ctx.app.as_ref(),
                &ctx.conversation_id,
                &ctx.run_id,
                ctx.parent_run_id.as_deref(),
                &ctx.agent_id,
                "approval_resolved",
                json!({
                    "approvalId": approval_id,
                    "stepId": ctx.step_id,
                    "decision": "always",
                    "by": "whitelist",
                }),
            );
            return Ok(());
        }

        let start = Instant::now();
        let verdict = request_main_agent_approval(
            main_profile,
            user_goal,
            plan_summary,
            &ctx.agent_id,
            command,
            reason,
            risk,
            ctx,
        )
        .await;
        let elapsed_ms = start.elapsed().as_millis() as u64;

        if ctx.cancel.is_cancelled() {
            return Err("任务已取消".to_string());
        }

        match verdict.decision.as_str() {
            "approve" => {
                let approval_id = format!("appr_{}", Uuid::new_v4());
                ctx.collector.push(
                    &ctx.run_id,
                    StepNode {
                        id: approval_id.clone(),
                        run_id: ctx.run_id.clone(),
                        parent_run_id: ctx.parent_run_id.clone(),
                        agent_id: ctx.agent_id.clone(),
                        kind: "approval".to_string(),
                        title: format!("主 Agent 已批准: {}", command),
                        status: "completed".to_string(),
                        data: json!({
                            "approvalId": approval_id,
                            "stepId": ctx.step_id,
                            "command": command,
                            "risk": risk.as_str(),
                            "reason": reason,
                            "mainVerdict": verdict.reason,
                            "decision": "allow",
                            "by": "main",
                        }),
                        duration_ms: elapsed_ms,
                        children: Vec::new(),
                    },
                );
                emit_agent_event(
                    ctx.app.as_ref(),
                    &ctx.conversation_id,
                    &ctx.run_id,
                    ctx.parent_run_id.as_deref(),
                    &ctx.agent_id,
                    "approval_resolved",
                    json!({
                        "approvalId": approval_id,
                        "stepId": ctx.step_id,
                        "decision": "allow",
                        "by": "main",
                        "reason": verdict.reason,
                    }),
                );
                return Ok(());
            }
            "reject" => {
                let approval_id = format!("appr_{}", Uuid::new_v4());
                ctx.collector.push(
                    &ctx.run_id,
                    StepNode {
                        id: approval_id.clone(),
                        run_id: ctx.run_id.clone(),
                        parent_run_id: ctx.parent_run_id.clone(),
                        agent_id: ctx.agent_id.clone(),
                        kind: "approval".to_string(),
                        title: format!("主 Agent 已拒绝: {}", command),
                        status: "failed".to_string(),
                        data: json!({
                            "approvalId": approval_id,
                            "stepId": ctx.step_id,
                            "command": command,
                            "risk": risk.as_str(),
                            "reason": reason,
                            "mainVerdict": verdict.reason,
                            "decision": "deny",
                            "by": "main",
                        }),
                        duration_ms: elapsed_ms,
                        children: Vec::new(),
                    },
                );
                emit_agent_event(
                    ctx.app.as_ref(),
                    &ctx.conversation_id,
                    &ctx.run_id,
                    ctx.parent_run_id.as_deref(),
                    &ctx.agent_id,
                    "approval_resolved",
                    json!({
                        "approvalId": approval_id,
                        "stepId": ctx.step_id,
                        "decision": "deny",
                        "by": "main",
                        "reason": verdict.reason,
                    }),
                );
                return Err(format!("主 Agent 审批拒绝: {}", verdict.reason));
            }
            _ => {
                main_verdict_text = Some(verdict.reason);
            }
        }
    }

    // Escalate to user approval card (no timeout; released on user click or run cancel).
    let approval_id = format!("appr_{}", Uuid::new_v4());
    let rx = runtime.register_pending_approval(&approval_id, &ctx.conversation_id, &ctx.agent_id);
    runtime.set_agent_awaiting_approval(
        ctx.app.as_ref(),
        &ctx.conversation_id,
        &ctx.run_id,
        &ctx.agent_id,
        true,
    );

    emit_agent_event(
        ctx.app.as_ref(),
        &ctx.conversation_id,
        &ctx.run_id,
        ctx.parent_run_id.as_deref(),
        &ctx.agent_id,
        "approval_request",
        json!({
            "approvalId": approval_id,
            "stepId": ctx.step_id,
            "command": command,
            "risk": risk.as_str(),
            "reason": reason,
            "mainVerdict": main_verdict_text,
            "canAlwaysAllow": risk == RiskLevel::Modify,
        }),
    );

    let wait_start = Instant::now();
    let user_decision = tokio::select! {
        _ = ctx.cancel.notify.notified() => {
            runtime.remove_pending_approval(&approval_id);
            None
        }
        res = rx => {
            res.ok()
        }
    };
    let wait_ms = wait_start.elapsed().as_millis() as u64;

    runtime.set_agent_awaiting_approval(
        ctx.app.as_ref(),
        &ctx.conversation_id,
        &ctx.run_id,
        &ctx.agent_id,
        false,
    );

    let Some(decision) = user_decision else {
        emit_agent_event(
            ctx.app.as_ref(),
            &ctx.conversation_id,
            &ctx.run_id,
            ctx.parent_run_id.as_deref(),
            &ctx.agent_id,
            "approval_resolved",
            json!({
                "approvalId": approval_id,
                "stepId": ctx.step_id,
                "decision": "deny",
                "by": "user",
                "cancelled": true,
            }),
        );
        return Err("审批已取消".to_string());
    };

    let dec_str = match decision {
        ApprovalDecision::Allow => "allow",
        ApprovalDecision::Deny => "deny",
        ApprovalDecision::Always => "always",
    };

    if decision == ApprovalDecision::Always && risk == RiskLevel::Modify {
        runtime.add_always_allow(&ctx.conversation_id, session_id, &prefix);
    }

    let approved = matches!(decision, ApprovalDecision::Allow | ApprovalDecision::Always);
    ctx.collector.push(
        &ctx.run_id,
        StepNode {
            id: approval_id.clone(),
            run_id: ctx.run_id.clone(),
            parent_run_id: ctx.parent_run_id.clone(),
            agent_id: ctx.agent_id.clone(),
            kind: "approval".to_string(),
            title: if approved {
                format!("用户已批准: {}", command)
            } else {
                format!("用户已拒绝: {}", command)
            },
            status: if approved { "completed" } else { "failed" }.to_string(),
            data: json!({
                "approvalId": approval_id,
                "stepId": ctx.step_id,
                "command": command,
                "risk": risk.as_str(),
                "reason": reason,
                "mainVerdict": main_verdict_text,
                "decision": dec_str,
                "by": "user",
            }),
            duration_ms: wait_ms,
            children: Vec::new(),
        },
    );

    emit_agent_event(
        ctx.app.as_ref(),
        &ctx.conversation_id,
        &ctx.run_id,
        ctx.parent_run_id.as_deref(),
        &ctx.agent_id,
        "approval_resolved",
        json!({
            "approvalId": approval_id,
            "stepId": ctx.step_id,
            "decision": dec_str,
            "by": "user",
        }),
    );

    if approved {
        Ok(())
    } else {
        Err("用户拒绝执行该命令".to_string())
    }
}

/// Two-level authorization gate for `mysql_sql`:
/// - `Read` (`SELECT`/`SHOW`/`EXPLAIN`/`DESCRIBE`/`WITH`): runs directly.
/// - `Modify` (`INSERT`/`UPDATE ... WHERE`/`DELETE ... WHERE`/`CREATE`/`ALTER`): checks whitelist -> main agent approval -> escalates to user if needed.
/// - `Danger` (`DROP`/`TRUNCATE`/`DELETE` or `UPDATE` without `WHERE`/`GRANT`/`REVOKE`/`SET GLOBAL`/`KILL`): always requires explicit user approval (never covered by "Always allow").
pub async fn authorize_mysql_sql(
    runtime: &AgentRuntime,
    main_profile: &ModelProfile,
    user_goal: &str,
    plan_summary: &str,
    server_id: &str,
    sql_display: &str,
    raw_sql: &str,
    reason: &str,
    risk_self: &str,
    ctx: &ToolCtx,
) -> Result<(), String> {
    let settings = runtime.get_settings();
    let risk = classify_sql_risk(raw_sql, risk_self);

    if risk == RiskLevel::Read {
        return Ok(());
    }

    if !settings.ai_enable_permission_guard
        && (risk == RiskLevel::Modify || !settings.ai_block_high_risk_commands)
    {
        return Ok(());
    }

    let prefix = normalize_sql_prefix(raw_sql);
    let session_key = format!("mysql:{}", server_id);
    let mut main_verdict_text: Option<String> = None;

    if risk == RiskLevel::Modify {
        if runtime.is_always_allowed(&ctx.conversation_id, &session_key, &prefix) {
            let approval_id = format!("appr_{}", Uuid::new_v4());
            let step_node = StepNode {
                id: approval_id.clone(),
                run_id: ctx.run_id.clone(),
                parent_run_id: ctx.parent_run_id.clone(),
                agent_id: ctx.agent_id.clone(),
                kind: "approval".to_string(),
                title: format!("已自动放行 SQL（始终允许）: {}", sql_display),
                status: "completed".to_string(),
                data: json!({
                    "approvalId": approval_id,
                    "stepId": ctx.step_id,
                    "kind": "mysql_sql",
                    "command": sql_display,
                    "risk": risk.as_str(),
                    "reason": reason,
                    "decision": "always",
                    "by": "whitelist",
                }),
                duration_ms: 0,
                children: Vec::new(),
            };
            ctx.collector.push(&ctx.run_id, step_node);
            emit_agent_event(
                ctx.app.as_ref(),
                &ctx.conversation_id,
                &ctx.run_id,
                ctx.parent_run_id.as_deref(),
                &ctx.agent_id,
                "approval_resolved",
                json!({
                    "approvalId": approval_id,
                    "stepId": ctx.step_id,
                    "decision": "always",
                    "by": "whitelist",
                }),
            );
            return Ok(());
        }

        let start = Instant::now();
        let verdict = request_main_agent_approval(
            main_profile,
            user_goal,
            plan_summary,
            &ctx.agent_id,
            sql_display,
            reason,
            risk,
            ctx,
        )
        .await;
        let elapsed_ms = start.elapsed().as_millis() as u64;

        if ctx.cancel.is_cancelled() {
            return Err("任务已取消".to_string());
        }

        match verdict.decision.as_str() {
            "approve" => {
                let approval_id = format!("appr_{}", Uuid::new_v4());
                ctx.collector.push(
                    &ctx.run_id,
                    StepNode {
                        id: approval_id.clone(),
                        run_id: ctx.run_id.clone(),
                        parent_run_id: ctx.parent_run_id.clone(),
                        agent_id: ctx.agent_id.clone(),
                        kind: "approval".to_string(),
                        title: format!("主 Agent 已批准 SQL: {}", sql_display),
                        status: "completed".to_string(),
                        data: json!({
                            "approvalId": approval_id,
                            "stepId": ctx.step_id,
                            "kind": "mysql_sql",
                            "command": sql_display,
                            "risk": risk.as_str(),
                            "reason": reason,
                            "mainVerdict": verdict.reason,
                            "decision": "allow",
                            "by": "main",
                        }),
                        duration_ms: elapsed_ms,
                        children: Vec::new(),
                    },
                );
                emit_agent_event(
                    ctx.app.as_ref(),
                    &ctx.conversation_id,
                    &ctx.run_id,
                    ctx.parent_run_id.as_deref(),
                    &ctx.agent_id,
                    "approval_resolved",
                    json!({
                        "approvalId": approval_id,
                        "stepId": ctx.step_id,
                        "decision": "allow",
                        "by": "main",
                        "reason": verdict.reason,
                    }),
                );
                return Ok(());
            }
            "reject" => {
                let approval_id = format!("appr_{}", Uuid::new_v4());
                ctx.collector.push(
                    &ctx.run_id,
                    StepNode {
                        id: approval_id.clone(),
                        run_id: ctx.run_id.clone(),
                        parent_run_id: ctx.parent_run_id.clone(),
                        agent_id: ctx.agent_id.clone(),
                        kind: "approval".to_string(),
                        title: format!("主 Agent 已拒绝 SQL: {}", sql_display),
                        status: "failed".to_string(),
                        data: json!({
                            "approvalId": approval_id,
                            "stepId": ctx.step_id,
                            "kind": "mysql_sql",
                            "command": sql_display,
                            "risk": risk.as_str(),
                            "reason": reason,
                            "mainVerdict": verdict.reason,
                            "decision": "deny",
                            "by": "main",
                        }),
                        duration_ms: elapsed_ms,
                        children: Vec::new(),
                    },
                );
                emit_agent_event(
                    ctx.app.as_ref(),
                    &ctx.conversation_id,
                    &ctx.run_id,
                    ctx.parent_run_id.as_deref(),
                    &ctx.agent_id,
                    "approval_resolved",
                    json!({
                        "approvalId": approval_id,
                        "stepId": ctx.step_id,
                        "decision": "deny",
                        "by": "main",
                        "reason": verdict.reason,
                    }),
                );
                return Err(format!("主 Agent 审批拒绝: {}", verdict.reason));
            }
            _ => {
                main_verdict_text = Some(verdict.reason);
            }
        }
    }

    let approval_id = format!("appr_{}", Uuid::new_v4());
    let rx = runtime.register_pending_approval(&approval_id, &ctx.conversation_id, &ctx.agent_id);
    runtime.set_agent_awaiting_approval(
        ctx.app.as_ref(),
        &ctx.conversation_id,
        &ctx.run_id,
        &ctx.agent_id,
        true,
    );

    emit_agent_event(
        ctx.app.as_ref(),
        &ctx.conversation_id,
        &ctx.run_id,
        ctx.parent_run_id.as_deref(),
        &ctx.agent_id,
        "approval_request",
        json!({
            "approvalId": approval_id,
            "stepId": ctx.step_id,
            "kind": "mysql_sql",
            "command": sql_display,
            "risk": risk.as_str(),
            "reason": reason,
            "mainVerdict": main_verdict_text,
            "canAlwaysAllow": risk == RiskLevel::Modify,
        }),
    );

    let wait_start = Instant::now();
    let user_decision = tokio::select! {
        _ = ctx.cancel.notify.notified() => {
            runtime.remove_pending_approval(&approval_id);
            None
        }
        res = rx => {
            res.ok()
        }
    };
    let wait_ms = wait_start.elapsed().as_millis() as u64;

    runtime.set_agent_awaiting_approval(
        ctx.app.as_ref(),
        &ctx.conversation_id,
        &ctx.run_id,
        &ctx.agent_id,
        false,
    );

    let Some(decision) = user_decision else {
        emit_agent_event(
            ctx.app.as_ref(),
            &ctx.conversation_id,
            &ctx.run_id,
            ctx.parent_run_id.as_deref(),
            &ctx.agent_id,
            "approval_resolved",
            json!({
                "approvalId": approval_id,
                "stepId": ctx.step_id,
                "decision": "deny",
                "by": "user",
                "cancelled": true,
            }),
        );
        return Err("SQL 审批已取消".to_string());
    };

    let dec_str = match decision {
        ApprovalDecision::Allow => "allow",
        ApprovalDecision::Deny => "deny",
        ApprovalDecision::Always => "always",
    };

    if decision == ApprovalDecision::Always && risk == RiskLevel::Modify {
        runtime.add_always_allow(&ctx.conversation_id, &session_key, &prefix);
    }

    let approved = matches!(decision, ApprovalDecision::Allow | ApprovalDecision::Always);
    ctx.collector.push(
        &ctx.run_id,
        StepNode {
            id: approval_id.clone(),
            run_id: ctx.run_id.clone(),
            parent_run_id: ctx.parent_run_id.clone(),
            agent_id: ctx.agent_id.clone(),
            kind: "approval".to_string(),
            title: if approved {
                format!("用户已批准 SQL: {}", sql_display)
            } else {
                format!("用户已拒绝 SQL: {}", sql_display)
            },
            status: if approved { "completed" } else { "failed" }.to_string(),
            data: json!({
                "approvalId": approval_id,
                "stepId": ctx.step_id,
                "kind": "mysql_sql",
                "command": sql_display,
                "risk": risk.as_str(),
                "reason": reason,
                "mainVerdict": main_verdict_text,
                "decision": dec_str,
                "by": "user",
            }),
            duration_ms: wait_ms,
            children: Vec::new(),
        },
    );

    emit_agent_event(
        ctx.app.as_ref(),
        &ctx.conversation_id,
        &ctx.run_id,
        ctx.parent_run_id.as_deref(),
        &ctx.agent_id,
        "approval_resolved",
        json!({
            "approvalId": approval_id,
            "stepId": ctx.step_id,
            "decision": dec_str,
            "by": "user",
        }),
    );

    if approved {
        Ok(())
    } else {
        Err("用户拒绝执行该 SQL 语句".to_string())
    }
}

fn build_write_preview(content: &str) -> (String, bool) {
    const MAX_LINES: usize = 20;
    const MAX_CHARS: usize = 2000;
    let mut lines = Vec::new();
    let mut total_lines = 0usize;
    for line in content.lines() {
        total_lines += 1;
        if lines.len() < MAX_LINES {
            lines.push(line);
        }
    }
    let mut preview = lines.join("\n");
    let mut truncated = total_lines > MAX_LINES;
    if preview.chars().count() > MAX_CHARS {
        preview = preview.chars().take(MAX_CHARS).collect();
        truncated = true;
    }
    (preview, truncated)
}

/// Authorization gate for `local_write`:
/// - Respects `ai_enable_permission_guard`.
/// - Checks per-(conversation_id, workspace_root) "Always allow" whitelist.
/// - Otherwise suspends on `pending_approvals` and emits a `local_write` `approval_request`.
pub async fn authorize_local_write(
    runtime: &AgentRuntime,
    workspace_root: &str,
    rel_path: &str,
    write_mode: &str,
    existed: bool,
    content: &str,
    reason: &str,
    ctx: &ToolCtx,
) -> Result<(), String> {
    let settings = runtime.get_settings();
    if !settings.ai_enable_permission_guard {
        return Ok(());
    }

    let bytes = content.len();
    let (preview, preview_truncated) = build_write_preview(content);

    if runtime.is_always_allowed(&ctx.conversation_id, "__local__", workspace_root) {
        let approval_id = format!("appr_{}", Uuid::new_v4());
        ctx.collector.push(
            &ctx.run_id,
            StepNode {
                id: approval_id.clone(),
                run_id: ctx.run_id.clone(),
                parent_run_id: ctx.parent_run_id.clone(),
                agent_id: ctx.agent_id.clone(),
                kind: "approval".to_string(),
                title: format!("已自动放行本地写入（始终允许）: {}", rel_path),
                status: "completed".to_string(),
                data: json!({
                    "approvalId": approval_id,
                    "stepId": ctx.step_id,
                    "kind": "local_write",
                    "filePath": rel_path,
                    "writeMode": write_mode,
                    "existed": existed,
                    "bytes": bytes,
                    "preview": preview,
                    "previewTruncated": preview_truncated,
                    "command": "",
                    "risk": "modify",
                    "reason": reason,
                    "decision": "always",
                    "by": "whitelist",
                }),
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
            "approval_resolved",
            json!({
                "approvalId": approval_id,
                "stepId": ctx.step_id,
                "decision": "always",
                "by": "whitelist",
            }),
        );
        return Ok(());
    }

    let approval_id = format!("appr_{}", Uuid::new_v4());
    let rx = runtime.register_pending_approval(&approval_id, &ctx.conversation_id, &ctx.agent_id);

    emit_agent_event(
        ctx.app.as_ref(),
        &ctx.conversation_id,
        &ctx.run_id,
        ctx.parent_run_id.as_deref(),
        &ctx.agent_id,
        "approval_request",
        json!({
            "approvalId": approval_id,
            "stepId": ctx.step_id,
            "kind": "local_write",
            "filePath": rel_path,
            "writeMode": write_mode,
            "existed": existed,
            "bytes": bytes,
            "preview": preview,
            "previewTruncated": preview_truncated,
            "command": "",
            "risk": "modify",
            "reason": reason,
            "canAlwaysAllow": true,
        }),
    );

    let wait_start = Instant::now();
    let user_decision = tokio::select! {
        _ = ctx.cancel.notify.notified() => {
            runtime.remove_pending_approval(&approval_id);
            None
        }
        res = rx => {
            res.ok()
        }
    };
    let wait_ms = wait_start.elapsed().as_millis() as u64;

    let Some(decision) = user_decision else {
        emit_agent_event(
            ctx.app.as_ref(),
            &ctx.conversation_id,
            &ctx.run_id,
            ctx.parent_run_id.as_deref(),
            &ctx.agent_id,
            "approval_resolved",
            json!({
                "approvalId": approval_id,
                "stepId": ctx.step_id,
                "decision": "deny",
                "by": "user",
                "cancelled": true,
            }),
        );
        return Err("本地写入审批已取消".to_string());
    };

    let dec_str = match decision {
        ApprovalDecision::Allow => "allow",
        ApprovalDecision::Deny => "deny",
        ApprovalDecision::Always => "always",
    };

    if decision == ApprovalDecision::Always {
        runtime.add_always_allow(&ctx.conversation_id, "__local__", workspace_root);
    }

    let approved = matches!(decision, ApprovalDecision::Allow | ApprovalDecision::Always);
    ctx.collector.push(
        &ctx.run_id,
        StepNode {
            id: approval_id.clone(),
            run_id: ctx.run_id.clone(),
            parent_run_id: ctx.parent_run_id.clone(),
            agent_id: ctx.agent_id.clone(),
            kind: "approval".to_string(),
            title: if approved {
                format!("用户已批准本地写入: {}", rel_path)
            } else {
                format!("用户已拒绝本地写入: {}", rel_path)
            },
            status: if approved { "completed" } else { "failed" }.to_string(),
            data: json!({
                "approvalId": approval_id,
                "stepId": ctx.step_id,
                "kind": "local_write",
                "filePath": rel_path,
                "writeMode": write_mode,
                "existed": existed,
                "bytes": bytes,
                "preview": preview,
                "previewTruncated": preview_truncated,
                "command": "",
                "risk": "modify",
                "reason": reason,
                "decision": dec_str,
                "by": "user",
            }),
            duration_ms: wait_ms,
            children: Vec::new(),
        },
    );

    emit_agent_event(
        ctx.app.as_ref(),
        &ctx.conversation_id,
        &ctx.run_id,
        ctx.parent_run_id.as_deref(),
        &ctx.agent_id,
        "approval_resolved",
        json!({
            "approvalId": approval_id,
            "stepId": ctx.step_id,
            "decision": dec_str,
            "by": "user",
        }),
    );

    if approved {
        Ok(())
    } else {
        Err("用户拒绝执行该本地写入操作".to_string())
    }
}

/// User confirmation gate for `conn_create` and `conn_activate`:
/// - Respects `ai_enable_permission_guard`.
/// - Always presents a masked summary card (never exposing passwords/keys/tokens) for user confirmation.
pub async fn authorize_conn_action(
    runtime: &AgentRuntime,
    action_kind: &str,
    conn_type: &str,
    conn_name: &str,
    target_display: &str,
    auth_summary: &str,
    reason: &str,
    extra_note: &str,
    ctx: &ToolCtx,
) -> Result<(), String> {
    let settings = runtime.get_settings();
    if !settings.ai_enable_permission_guard {
        return Ok(());
    }

    let approval_id = format!("appr_{}", Uuid::new_v4());
    let rx = runtime.register_pending_approval(&approval_id, &ctx.conversation_id, &ctx.agent_id);

    emit_agent_event(
        ctx.app.as_ref(),
        &ctx.conversation_id,
        &ctx.run_id,
        ctx.parent_run_id.as_deref(),
        &ctx.agent_id,
        "approval_request",
        json!({
            "approvalId": approval_id,
            "stepId": ctx.step_id,
            "kind": action_kind,
            "command": target_display,
            "filePath": conn_name,
            "writeMode": conn_type.to_uppercase(),
            "preview": if extra_note.is_empty() { auth_summary.to_string() } else { format!("{}\n{}", auth_summary, extra_note) },
            "risk": "modify",
            "reason": reason,
            "canAlwaysAllow": false,
        }),
    );

    let wait_start = Instant::now();
    let user_decision = tokio::select! {
        _ = ctx.cancel.notify.notified() => {
            runtime.remove_pending_approval(&approval_id);
            None
        }
        res = rx => {
            res.ok()
        }
    };
    let wait_ms = wait_start.elapsed().as_millis() as u64;

    let Some(decision) = user_decision else {
        emit_agent_event(
            ctx.app.as_ref(),
            &ctx.conversation_id,
            &ctx.run_id,
            ctx.parent_run_id.as_deref(),
            &ctx.agent_id,
            "approval_resolved",
            json!({
                "approvalId": approval_id,
                "stepId": ctx.step_id,
                "decision": "deny",
                "by": "user",
                "cancelled": true,
            }),
        );
        return Err("连接操作审批已取消".to_string());
    };

    let approved = matches!(decision, ApprovalDecision::Allow | ApprovalDecision::Always);
    let dec_str = if approved { "allow" } else { "deny" };

    ctx.collector.push(
        &ctx.run_id,
        StepNode {
            id: approval_id.clone(),
            run_id: ctx.run_id.clone(),
            parent_run_id: ctx.parent_run_id.clone(),
            agent_id: ctx.agent_id.clone(),
            kind: "approval".to_string(),
            title: if approved {
                format!("用户已确认连接操作: {} ({})", conn_name, target_display)
            } else {
                format!("用户已拒绝连接操作: {} ({})", conn_name, target_display)
            },
            status: if approved { "completed" } else { "failed" }.to_string(),
            data: json!({
                "approvalId": approval_id,
                "stepId": ctx.step_id,
                "kind": action_kind,
                "command": target_display,
                "filePath": conn_name,
                "writeMode": conn_type.to_uppercase(),
                "preview": if extra_note.is_empty() { auth_summary.to_string() } else { format!("{}\n{}", auth_summary, extra_note) },
                "risk": "modify",
                "reason": reason,
                "decision": dec_str,
                "by": "user",
            }),
            duration_ms: wait_ms,
            children: Vec::new(),
        },
    );

    emit_agent_event(
        ctx.app.as_ref(),
        &ctx.conversation_id,
        &ctx.run_id,
        ctx.parent_run_id.as_deref(),
        &ctx.agent_id,
        "approval_resolved",
        json!({
            "approvalId": approval_id,
            "stepId": ctx.step_id,
            "decision": dec_str,
            "by": "user",
        }),
    );

    if approved {
        Ok(())
    } else {
        Err("用户拒绝执行该连接操作".to_string())
    }
}
