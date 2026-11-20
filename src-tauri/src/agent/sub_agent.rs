use crate::agent::model::{ChatMessage, ModelProfile};
use crate::agent::react::{run_react_loop, ReactRunConfig, DEFAULT_SUBAGENT_MAX_TURNS};
use crate::agent::tool::ToolRegistry;
use crate::agent::tools_mysql::{MysqlSchemaTool, MysqlSqlTool};
use crate::agent::tools_ssh::SshExecTool;
use crate::agent::types::{RunCancel, StepCollector, StepNode, SubAgentInfo, SubAgentReport};
use crate::agent::AgentRuntime;
use crate::db::mysql::MysqlManager;
use crate::ssh::SshManager;
use async_trait::async_trait;
use chrono::Local;
use std::sync::{Arc, RwLock};
use std::time::Duration;
use tauri::AppHandle;

#[derive(Debug, Clone, Default)]
pub struct SubAgentMemory {
    pub probed_info: Option<String>,
    pub past_reports: Vec<String>,
}

impl SubAgentMemory {
    pub fn push_report(&mut self, task: &str, report: &SubAgentReport) {
        let task_short: String = task.chars().take(80).collect();
        let sum_short: String = report.summary.chars().take(240).collect();
        let conc_short: String = report.conclusion.chars().take(200).collect();
        let entry = format!(
            "- 任务「{}」[{}]：{}；结论：{}",
            task_short, report.status, sum_short, conc_short
        );
        self.past_reports.push(entry);
        if self.past_reports.len() > 6 {
            let excess = self.past_reports.len() - 6;
            self.past_reports.drain(0..excess);
        }
    }
}

#[async_trait]
pub trait SubAgent: Send + Sync {
    fn agent_id(&self) -> String;
    fn session_id(&self) -> &str;
    fn kind(&self) -> &'static str;
    fn display(&self) -> SubAgentInfo;
    fn tools(&self) -> Arc<ToolRegistry>;
    fn system_prompt(&self, memory: &SubAgentMemory) -> String;
    async fn probe(&self, cancel: &RunCancel) -> Result<String, String>;
    fn extract_badge_info(&self, probed: &str) -> Option<String>;
}

pub struct SshSubAgent {
    pub session_id: String,
    pub info: SubAgentInfo,
    pub ssh: Arc<SshManager>,
    pub runtime: Arc<AgentRuntime>,
    pub main_profile: ModelProfile,
    pub user_goal: String,
    pub plan_summary: Arc<RwLock<String>>,
}

impl SshSubAgent {
    pub fn new(
        session_id: String,
        info: SubAgentInfo,
        ssh: Arc<SshManager>,
        runtime: Arc<AgentRuntime>,
        main_profile: ModelProfile,
        user_goal: String,
        plan_summary: Arc<RwLock<String>>,
    ) -> Self {
        Self {
            session_id,
            info,
            ssh,
            runtime,
            main_profile,
            user_goal,
            plan_summary,
        }
    }
}

#[async_trait]
impl SubAgent for SshSubAgent {
    fn agent_id(&self) -> String {
        self.info.agent_id.clone()
    }

    fn session_id(&self) -> &str {
        &self.session_id
    }

    fn kind(&self) -> &'static str {
        "ssh"
    }

    fn display(&self) -> SubAgentInfo {
        self.info.clone()
    }

    fn tools(&self) -> Arc<ToolRegistry> {
        let reg = ToolRegistry::new();
        reg.register(Arc::new(SshExecTool {
            session_id: self.session_id.clone(),
            host_label: format!("{} ({}@{})", self.info.name, self.info.user, self.info.host),
            ssh: self.ssh.clone(),
            runtime: self.runtime.clone(),
            main_profile: self.main_profile.clone(),
            user_goal: self.user_goal.clone(),
            plan_summary: self.plan_summary.clone(),
        }));
        Arc::new(reg)
    }

    fn system_prompt(&self, memory: &SubAgentMemory) -> String {
        let now_str = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
        let probe_block = memory
            .probed_info
            .as_deref()
            .filter(|s| !s.trim().is_empty())
            .unwrap_or("（暂未探测主机详细信息）");

        let history_block = if memory.past_reports.is_empty() {
            "（本次对话中尚无历史派发记录）".to_string()
        } else {
            memory.past_reports.join("\n")
        };

        format!(
            "你是多层智能体系统中的底层【SSH 执行子 Agent】（{}）。\n\
            当前时间：{}\n\
            目标主机：{}（{}@{}:{}）\n\n\
            【主机探测信息】\n{}\n\n\
            【本对话历史任务记忆（已压缩）】\n{}\n\n\
            【工作规范】\n\
            1. 你只负责在当前绑定的这台主机上通过 `ssh_exec` 工具完成主 Agent 派发的具体任务，不可臆测或编造未执行命令的输出。\n\
            2. 不要重复检查本次对话历史任务记忆中已经确认过的静态信息。\n\
            3. 调用 `ssh_exec` 时必须如实评估 `risk_self`（read/modify/danger）并写明 `reason`；若审批被拒绝，应根据拒绝原因调整方案或如实汇报。\n\
            4. 使用非交互式命令（禁止启动 top/vim/less/tail -f 等阻塞交互程序）。\n\
            5. 完成任务后，你的最终回复必须严格输出为一个合法 JSON 对象（不要额外附加无关说明），格式如下：\n\
            {{\n  \"status\": \"success | partial | failed\",\n  \"summary\": \"一句话总结执行过程与结果\",\n  \"commands\": [\"执行过的关键命令1\", \"...\"],\n  \"keyOutput\": \"最核心的观测输出或错误摘要\",\n  \"conclusion\": \"面向主 Agent 的明确结论与建议\"\n}}",
            self.agent_id(),
            now_str,
            self.info.name,
            self.info.user,
            self.info.host,
            self.info.port,
            probe_block,
            history_block
        )
    }

    async fn probe(&self, cancel: &RunCancel) -> Result<String, String> {
        let session = self.ssh.get_session(&self.session_id).await?;
        let probe_cmd = "sh -c 'echo \"host=$(hostname 2>/dev/null)\"; echo \"uname=$(uname -a 2>/dev/null)\"; echo \"user=$(whoami 2>/dev/null)\"; echo \"pwd=$(pwd 2>/dev/null)\"; if [ -f /etc/os-release ]; then head -n 5 /etc/os-release; fi'";
        let (stdout, stderr, exit_code) = session
            .exec_with_timeout(
                probe_cmd,
                Duration::from_secs(10),
                &cancel.flag,
                &cancel.notify,
            )
            .await?;
        if exit_code != 0 && stdout.trim().is_empty() {
            return Err(format!("主机信息探测失败: {}", stderr.trim()));
        }
        Ok(stdout.trim().to_string())
    }

    fn extract_badge_info(&self, probed: &str) -> Option<String> {
        extract_pretty_os(probed)
    }
}

pub struct MysqlSubAgent {
    pub server_id: String,
    pub info: SubAgentInfo,
    pub mysql: Arc<MysqlManager>,
    pub runtime: Arc<AgentRuntime>,
    pub main_profile: ModelProfile,
    pub user_goal: String,
    pub plan_summary: Arc<RwLock<String>>,
}

impl MysqlSubAgent {
    pub fn new(
        server_id: String,
        info: SubAgentInfo,
        mysql: Arc<MysqlManager>,
        runtime: Arc<AgentRuntime>,
        main_profile: ModelProfile,
        user_goal: String,
        plan_summary: Arc<RwLock<String>>,
    ) -> Self {
        Self {
            server_id,
            info,
            mysql,
            runtime,
            main_profile,
            user_goal,
            plan_summary,
        }
    }
}

#[async_trait]
impl SubAgent for MysqlSubAgent {
    fn agent_id(&self) -> String {
        self.info.agent_id.clone()
    }

    fn session_id(&self) -> &str {
        &self.server_id
    }

    fn kind(&self) -> &'static str {
        "mysql"
    }

    fn display(&self) -> SubAgentInfo {
        self.info.clone()
    }

    fn tools(&self) -> Arc<ToolRegistry> {
        let reg = ToolRegistry::new();
        let host_label = format!(
            "{} ({}@{}:{})",
            self.info.name, self.info.user, self.info.host, self.info.port
        );
        reg.register(Arc::new(MysqlSchemaTool {
            server_id: self.server_id.clone(),
            host_label: host_label.clone(),
            mysql: self.mysql.clone(),
        }));
        reg.register(Arc::new(MysqlSqlTool {
            server_id: self.server_id.clone(),
            host_label,
            mysql: self.mysql.clone(),
            runtime: self.runtime.clone(),
            main_profile: self.main_profile.clone(),
            user_goal: self.user_goal.clone(),
            plan_summary: self.plan_summary.clone(),
        }));
        Arc::new(reg)
    }

    fn system_prompt(&self, memory: &SubAgentMemory) -> String {
        let now_str = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
        let probe_block = memory
            .probed_info
            .as_deref()
            .filter(|s| !s.trim().is_empty())
            .unwrap_or("（暂未探测 MySQL 实例信息）");

        let history_block = if memory.past_reports.is_empty() {
            "（本次对话中尚无历史派发记录）".to_string()
        } else {
            memory.past_reports.join("\n")
        };

        format!(
            "你是多层智能体系统中的底层【MySQL 数据库子 Agent】（{}）。\n\
            当前时间：{}\n\
            目标数据库实例：{}（{}@{}:{}）\n\n\
            【实例探测信息】\n{}\n\n\
            【本对话历史任务记忆（已压缩）】\n{}\n\n\
            【可用工具与工作规范】\n\
            1. 你只负责在当前绑定的 MySQL 实例上通过 `mysql_schema` 与 `mysql_sql` 工具完成主 Agent 派发的任务，严禁臆测或编造未执行 SQL 的查询结果。\n\
            2. 探查库表结构、字段类型、索引或建表 DDL 时，优先使用 `mysql_schema`（只读免审批，可传 `database` / `table`）。\n\
            3. 执行自定义 SQL 查询（SELECT/SHOW/EXPLAIN）或变更（INSERT/UPDATE/DELETE/CREATE/ALTER/DROP）时使用 `mysql_sql`：\n\
               - 编写 SELECT 查询大表时应主动加上合理的 `LIMIT` 或聚合条件；\n\
               - 调用 `mysql_sql` 时必须准确评估 `risk_self`（`read`=只读查询，`modify`=常规写入/表结构修改，`danger`=DROP/TRUNCATE/无WHERE更新删除/权限或全局变量修改）并写明清晰的 `reason`；\n\
               - 若审批被主 Agent 或用户拒绝，请根据反馈调整方案或如实汇报，不得强行重试相同的高危操作。\n\
            4. 完成任务后，你的最终回复必须严格输出为一个合法 JSON 对象（不要额外附加无关说明），格式如下：\n\
            {{\n  \"status\": \"success | partial | failed\",\n  \"summary\": \"一句话总结执行过程与结果\",\n  \"commands\": [\"执行过的关键 SQL 1\", \"...\"],\n  \"keyOutput\": \"最核心的查询结果、统计数据或错误摘要\",\n  \"conclusion\": \"面向主 Agent 的明确结论与建议\"\n}}",
            self.agent_id(),
            now_str,
            self.info.name,
            self.info.user,
            self.info.host,
            self.info.port,
            probe_block,
            history_block
        )
    }

    async fn probe(&self, cancel: &RunCancel) -> Result<String, String> {
        let meta_fut = self.mysql.query_ex_with_timeout_limit(
            &self.server_id,
            "",
            "SELECT VERSION() AS version, DATABASE() AS current_db, @@character_set_server AS charset, @@version_comment AS comment",
            Duration::from_secs(8),
            1,
        );
        let (_cols, meta_rows) = tokio::select! {
            _ = cancel.notify.notified() => return Err("探测已取消".to_string()),
            res = meta_fut => res?,
        };

        let mut version = String::new();
        let mut current_db = String::new();
        let mut charset = String::new();
        let mut comment = String::new();
        if let Some(r) = meta_rows.first() {
            version = r
                .get("version")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            current_db = r
                .get("current_db")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            charset = r
                .get("charset")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            comment = r
                .get("comment")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
        }

        let dbs = self.mysql.databases(&self.server_id).await.unwrap_or_default();
        let user_dbs: Vec<String> = dbs
            .iter()
            .filter(|d| {
                !matches!(
                    d.to_ascii_lowercase().as_str(),
                    "information_schema" | "performance_schema" | "mysql" | "sys"
                )
            })
            .cloned()
            .collect();

        Ok(format!(
            "mysql_version={}\nversion_comment={}\ncurrent_database={}\ncharacter_set_server={}\nall_databases={}\nuser_databases={}",
            version,
            comment,
            if current_db.is_empty() { "(none)" } else { &current_db },
            charset,
            dbs.join(", "),
            if user_dbs.is_empty() {
                "(none)".to_string()
            } else {
                user_dbs.join(", ")
            }
        ))
    }

    fn extract_badge_info(&self, probed: &str) -> Option<String> {
        for line in probed.lines() {
            if let Some(ver) = line.trim().strip_prefix("mysql_version=") {
                let v = ver.trim();
                if !v.is_empty() {
                    return Some(if v.to_ascii_lowercase().contains("mariadb") {
                        format!("MariaDB {}", v)
                    } else {
                        format!("MySQL {}", v)
                    });
                }
            }
        }
        None
    }
}

pub fn extract_pretty_os(probed: &str) -> Option<String> {
    for line in probed.lines() {
        let trimmed = line.trim();
        if let Some(rest) = trimmed.strip_prefix("PRETTY_NAME=") {
            return Some(rest.trim_matches('"').trim_matches('\'').to_string());
        }
    }
    for line in probed.lines() {
        let trimmed = line.trim();
        if let Some(rest) = trimmed.strip_prefix("uname=") {
            let short = rest.split_whitespace().take(3).collect::<Vec<_>>().join(" ");
            if !short.is_empty() {
                return Some(short);
            }
        }
    }
    None
}

pub fn parse_subagent_report(raw: &str, commands_fallback: Vec<String>) -> SubAgentReport {
    let trimmed = raw.trim();
    let cleaned = trimmed
        .strip_prefix("```json")
        .or_else(|| trimmed.strip_prefix("```"))
        .map(|s| s.trim())
        .and_then(|s| s.strip_suffix("```").map(|x| x.trim()))
        .unwrap_or(trimmed);

    if let Ok(mut parsed) = serde_json::from_str::<SubAgentReport>(cleaned) {
        if parsed.commands.is_empty() {
            parsed.commands = commands_fallback;
        }
        return parsed;
    }

    if let (Some(start), Some(end)) = (cleaned.find('{'), cleaned.rfind('}')) {
        if end > start {
            if let Ok(mut parsed) = serde_json::from_str::<SubAgentReport>(&cleaned[start..=end]) {
                if parsed.commands.is_empty() {
                    parsed.commands = commands_fallback;
                }
                return parsed;
            }
        }
    }

    SubAgentReport {
        status: "success".to_string(),
        summary: trimmed.chars().take(240).collect(),
        commands: commands_fallback,
        key_output: String::new(),
        conclusion: trimmed.to_string(),
    }
}

pub async fn execute_subagent_task(
    sub_agent: &dyn SubAgent,
    runtime: &Arc<AgentRuntime>,
    ssh: &Arc<SshManager>,
    mysql: &Arc<MysqlManager>,
    app: Option<AppHandle>,
    conversation_id: &str,
    sub_run_id: &str,
    parent_run_id: &str,
    sub_profile: &ModelProfile,
    task: &str,
    extra_context: &str,
    cancel: Arc<RunCancel>,
    collector: Arc<StepCollector>,
) -> Result<(SubAgentReport, Vec<StepNode>), (String, Vec<StepNode>)> {
    let agent_id = sub_agent.agent_id();

    let mut mem = runtime
        .get_subagent_memory(conversation_id, &agent_id)
        .await;

    if mem.probed_info.is_none() {
        if let Ok(probed) = sub_agent.probe(&cancel).await {
            if let Some(badge) = sub_agent.extract_badge_info(&probed) {
                runtime.set_probed_os(&agent_id, badge);
                if let Some(ref handle) = app {
                    runtime.emit_subagents_sync(handle, ssh, mysql).await;
                }
            }
            mem.probed_info = Some(probed);
            runtime
                .save_subagent_memory(conversation_id, &agent_id, mem.clone())
                .await;
        }
    }

    let sys_prompt = sub_agent.system_prompt(&mem);
    let user_prompt = if extra_context.trim().is_empty() {
        format!("请完成以下任务：\n{}", task)
    } else {
        format!("请完成以下任务：\n{}\n\n补充上下文：\n{}", task, extra_context)
    };

    let registry = sub_agent.tools();
    let cfg = ReactRunConfig {
        app,
        conversation_id: conversation_id.to_string(),
        run_id: sub_run_id.to_string(),
        parent_run_id: Some(parent_run_id.to_string()),
        agent_id: agent_id.clone(),
        system_prompt: sys_prompt,
        max_turns: DEFAULT_SUBAGENT_MAX_TURNS,
    };

    let res = run_react_loop(
        &cfg,
        sub_profile,
        vec![ChatMessage::user(user_prompt)],
        &registry,
        cancel.clone(),
        collector.clone(),
    )
    .await;

    match res {
        Ok(run_out) => {
            let cmds: Vec<String> = run_out
                .steps
                .iter()
                .filter(|s| s.kind == "exec")
                .filter_map(|s| {
                    s.data
                        .get("command")
                        .and_then(|v| v.as_str())
                        .map(|c| c.to_string())
                })
                .collect();
            let report = parse_subagent_report(&run_out.content, cmds);
            mem.push_report(task, &report);
            runtime
                .save_subagent_memory(conversation_id, &agent_id, mem)
                .await;
            Ok((report, run_out.steps))
        }
        Err(err) => {
            let partial_steps = collector.take(sub_run_id);
            Err((err, partial_steps))
        }
    }
}
