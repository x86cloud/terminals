use crate::agent::model::ChatMessage;
use crate::agent::react::{run_react_loop, ReactRunConfig, DEFAULT_MAIN_MAX_TURNS};
use crate::agent::tool::ToolRegistry;
use crate::agent::tools::{WebFetchTool, WebSearchTool};
use crate::agent::tools_conn::{ConnActivateTool, ConnCreateTool, ConnListTool, ConnManagers};
use crate::agent::tools_local::{
    LocalListTool, LocalReadTool, LocalTreeTool, LocalWriteTool, WorkspaceSandbox,
};
use crate::agent::tools_main::{AskUserTool, DispatchTaskTool, ListAgentsTool, UpdatePlanTool};
use crate::agent::tools_wiki::{
    WikiIndexTool, WikiIngestRawTool, WikiLintTool, WikiReadTool, WikiSearchTool, WikiWriteTool,
};
use crate::agent::types::{StepCollector, SubAgentInfo};
use crate::agent::AgentRuntime;
use crate::core::storage;
use crate::db::mysql::MysqlManager;
use crate::ssh::SshManager;
use crate::wiki::WikiManager;
use chrono::Local;
use serde::{Deserialize, Serialize};
use std::sync::{Arc, RwLock};
use tauri::AppHandle;
use uuid::Uuid;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatSendRequest {
    pub conversation_id: Option<String>,
    pub text: String,
    pub model_id: Option<String>,
    pub mode: Option<String>,
    pub workspace_dir: Option<String>,
    #[serde(default)]
    pub mentions: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatSendResult {
    pub conversation_id: String,
    pub run_id: String,
}

fn auto_title_from_text(text: &str) -> String {
    let clean = text.split_whitespace().collect::<Vec<_>>().join(" ");
    let chars: Vec<char> = clean.chars().collect();
    if chars.len() <= 28 {
        clean
    } else {
        let prefix: String = chars.into_iter().take(28).collect();
        format!("{}...", prefix)
    }
}

fn build_main_system_prompt(
    base_prompt: &str,
    mode: &str,
    subagents: &[SubAgentInfo],
    mentions: &[String],
    workspace_dir: Option<&str>,
    wiki_index_summary: &str,
) -> String {
    let now_str = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let enabled_lines: Vec<String> = subagents
        .iter()
        .filter(|a| a.enabled)
        .map(|a| {
            format!(
                "- `{}` | 类型: {} | 名称: {} | 连接: {}@{}:{} | 环境/版本: {} | 状态: {}",
                a.agent_id, a.kind, a.name, a.user, a.host, a.port, a.os_info, a.status
            )
        })
        .collect();

    let agents_block = if enabled_lines.is_empty() {
        "（当前暂无已启用的子 Agent；如任务需要操作远端 SSH 主机或 MySQL 数据库，可提示用户在右侧面板开启对应连接，或通过 `list_agents` 复查）".to_string()
    } else {
        enabled_lines.join("\n")
    };

    let mention_block = if mentions.is_empty() {
        String::new()
    } else {
        format!(
            "\n\n【用户本轮显式 @ 提及的目标子 Agent】\n{}\n请优先针对上述被提及的子 Agent 规划并派发任务。",
            mentions.join(", ")
        )
    };

    let mode_instruction = if mode == "planning" {
        "【当前运行模式：Planning（先规划后执行）】\n\
        1. 面对复杂或多步骤任务时，先调用 `update_plan` 制定清晰的分步清单，并在推进或完成时更新状态。\n\
        2. 需求不明确、存在多种方案或缺少关键目标信息时，优先调用 `ask_user` 向用户确认。"
    } else {
        "【当前运行模式：Fast（高效直达）】\n\
        1. 对简单明确的任务可直接回答或调用合适工具快速处理；若任务包含 3 个以上步骤，也可调用 `update_plan` 以便跟踪进度。"
    };

    let workspace_block = match workspace_dir.map(str::trim).filter(|s| !s.is_empty()) {
        Some(dir) => format!(
            "\n\n【本地工作目录（已绑定）】\n{}\n你已挂载本地工作目录工具：`local_list`、`local_tree`、`local_read`、`local_write`。所有路径必须为相对该工作目录的相对路径，严禁越权访问目录之外；调用 `local_write` 写入或修改文件时会触发用户审批确认。",
            dir
        ),
        None => "\n\n【本地工作目录（未绑定）】\n当前会话未绑定本地工作目录，因此未挂载 `local_*` 本地文件工具。如果用户需要读写本地项目或文件，请提示用户在底部输入框左下角点击工作目录按钮选择一个本地文件夹。".to_string(),
    };

    let wiki_block = format!(
        "\n\n【LLM Wiki 知识库（已挂载）】\n\
        你已默认接入持久化 LLM Wiki 知识库，并挂载 6 个专用工具：\n\
        - `wiki_index`（读全局目录与 SCHEMA 规范）、`wiki_search`（全文检索 wiki/ 与 raw/）、`wiki_read`（读词条含反向链接）、`wiki_write`（编译或更新 wiki/**/*.md、index.md、log.md，严禁改写 raw/）、`wiki_ingest_raw`（将高价值资料或结论原样归档至 raw/）、`wiki_lint`（巡检断链、孤立页、未入目录或未编译资料）。\n\
        行为准则：\n\
        1. 当问题可能涉及历史资料、既有记录或已整理内容时，优先结合下方目录摘要调用 `wiki_search` 或 `wiki_read` 查阅 Wiki；\n\
        2. 当用户要求导入、编译、整理、沉淀或巡检知识库时，先阅读 `SCHEMA.md`（或调用 `wiki_index`）再按规范生成或更新词条，补全 `[[双向链接]]`，并同步更新 `index.md` 与 `log.md`；\n\
        3. 当产出值得长期复用的总结或资料时，可提示用户按需沉淀入库。\n\n\
        <wiki_index_summary>\n{}\n</wiki_index_summary>",
        if wiki_index_summary.trim().is_empty() {
            "（index.md 暂无词条记录）"
        } else {
            wiki_index_summary.trim()
        }
    );

    let mut sections: Vec<String> = Vec::new();
    if !base_prompt.trim().is_empty() {
        sections.push(base_prompt.trim().to_string());
    }
    sections.push(format!(
        "当前时间：{}\n\n\
        可用能力与基本约束：\n\
        - 根据用户需求自主决定直接回答或调用已挂载工具（联网检索 `web_search` / `web_fetch`、知识库 `wiki_*`、本地工作目录 `local_*`、连接管理 `conn_list` / `conn_create` / `conn_activate`、子 Agent 调度 `list_agents` / `dispatch_task` 等）。\n\
        - 需要查看、新建或激活服务器/数据库/容器连接时，优先使用 `conn_list`（已脱敏）、`conn_create`（缺失密码或私钥时可先通过 `ask_user` 询问用户）、`conn_activate`（激活 SSH/MySQL 后可自动开启子 Agent 授权）；\n\
        - 不直接连接远端服务器；仅当任务确实需要操作远端主机或数据库时，通过 `dispatch_task` 委派给已启用的子 Agent（派发前可先调用 `list_agents` 确认）。\n\
        - 如实基于工具实际返回结果作答，不编造未经观测的数据、输出或结论；若工具或子 Agent 执行失败或被拒绝，如实说明。",
        now_str
    ));
    sections.push(format!(
        "{}\n\n【当前已开启的子 Agent 快照】\n{}{}{}{}",
        mode_instruction, agents_block, mention_block, workspace_block, wiki_block
    ));
    sections.join("\n\n")
}

pub async fn start_chat_run(
    app: AppHandle,
    runtime: Arc<AgentRuntime>,
    ssh: Arc<SshManager>,
    mysql: Arc<MysqlManager>,
    wiki: Arc<WikiManager>,
    conns: ConnManagers,
    req: ChatSendRequest,
) -> Result<ChatSendResult, String> {
    let text = req.text.trim().to_string();
    if text.is_empty() {
        return Err("消息内容不能为空".to_string());
    }

    let mode = match req.mode.as_deref() {
        Some("planning") => "planning".to_string(),
        _ => "fast".to_string(),
    };

    let (main_profile, base_prompt) = runtime.resolve_model_by_id(req.model_id.as_deref())?;
    let sub_profile = runtime.resolve_sub_agent_model(&main_profile)?;

    let store = runtime.store();
    let (conversation_id, effective_workspace_dir) =
        match req.conversation_id.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
            Some(existing_id) => {
                if let Some(existing) = store.get_session(existing_id)? {
                    let wd_update = req.workspace_dir.clone();
                    let _ = store.update_session_prefs(
                        existing_id,
                        Some(main_profile.id.clone()),
                        Some(mode.clone()),
                        None,
                        None,
                        wd_update.clone(),
                    );
                    let resolved_wd = wd_update
                        .map(|s| s.trim().to_string())
                        .unwrap_or(existing.workspace_dir);
                    (existing_id.to_string(), resolved_wd)
                } else {
                    let created = store.create_session(
                        Some(auto_title_from_text(&text)),
                        Some(main_profile.id.clone()),
                        Some(mode.clone()),
                        Some(true),
                        Some(false),
                        req.workspace_dir.clone(),
                    )?;
                    (created.id, created.workspace_dir)
                }
            }
            None => {
                let created = store.create_session(
                    Some(auto_title_from_text(&text)),
                    Some(main_profile.id.clone()),
                    Some(mode.clone()),
                    Some(true),
                    Some(false),
                    req.workspace_dir.clone(),
                )?;
                (created.id, created.workspace_dir)
            }
        };

    // Persist user message immediately
    store.append_message(&conversation_id, "user", &text, "", &[], &[])?;

    // Build history for the LLM from persisted messages
    let db_msgs = store.list_messages(&conversation_id)?;
    let mut history: Vec<ChatMessage> = Vec::with_capacity(db_msgs.len());
    let start_idx = db_msgs.len().saturating_sub(30);
    for m in db_msgs.into_iter().skip(start_idx) {
        if m.role == "user" {
            history.push(ChatMessage::user(m.content));
        } else if m.role == "assistant" && !m.content.trim().is_empty() {
            history.push(ChatMessage::assistant(m.content, None, Vec::new()));
        }
    }

    let wiki_index_summary = match wiki.resolve_vault() {
        Ok((root, _)) => {
            let _ = wiki.db().sync_vault(&root, false);
            wiki.db().read_index_summary(&root, 3072)
        }
        Err(_) => String::new(),
    };

    let subagents = runtime.list_subagents(&ssh, &mysql).await;
    let system_prompt = build_main_system_prompt(
        &base_prompt,
        &mode,
        &subagents,
        &req.mentions,
        Some(effective_workspace_dir.as_str()),
        &wiki_index_summary,
    );

    let run_id = format!("run_{}", Uuid::new_v4());
    let cancel = runtime.register_conv_cancel(&conversation_id);
    let collector = Arc::new(StepCollector::new());
    let plan_summary = Arc::new(RwLock::new(String::new()));

    let registry = ToolRegistry::new();
    registry.register(Arc::new(ListAgentsTool {
        runtime: runtime.clone(),
        ssh: ssh.clone(),
        mysql: mysql.clone(),
    }));
    registry.register(Arc::new(DispatchTaskTool {
        runtime: runtime.clone(),
        ssh: ssh.clone(),
        mysql: mysql.clone(),
        main_profile: main_profile.clone(),
        sub_profile,
        user_goal: text.clone(),
        plan_summary: plan_summary.clone(),
    }));
    registry.register(Arc::new(UpdatePlanTool {
        plan_summary: plan_summary.clone(),
    }));
    registry.register(Arc::new(AskUserTool {
        runtime: runtime.clone(),
    }));
    registry.register(Arc::new(WebSearchTool::new()));
    registry.register(Arc::new(WebFetchTool));

    registry.register(Arc::new(WikiIndexTool { wiki: wiki.clone() }));
    registry.register(Arc::new(WikiSearchTool { wiki: wiki.clone() }));
    registry.register(Arc::new(WikiReadTool { wiki: wiki.clone() }));
    registry.register(Arc::new(WikiWriteTool { wiki: wiki.clone() }));
    registry.register(Arc::new(WikiIngestRawTool { wiki: wiki.clone() }));
    registry.register(Arc::new(WikiLintTool { wiki }));

    registry.register(Arc::new(ConnListTool {
        runtime: runtime.clone(),
        conns: conns.clone(),
    }));
    registry.register(Arc::new(ConnCreateTool {
        runtime: runtime.clone(),
        conns: conns.clone(),
    }));
    registry.register(Arc::new(ConnActivateTool {
        runtime: runtime.clone(),
        conns,
    }));

    if !effective_workspace_dir.trim().is_empty() {
        let sandbox = WorkspaceSandbox::new(&effective_workspace_dir)?;
        registry.register(Arc::new(LocalListTool {
            sandbox: sandbox.clone(),
        }));
        registry.register(Arc::new(LocalReadTool {
            sandbox: sandbox.clone(),
        }));
        registry.register(Arc::new(LocalTreeTool {
            sandbox: sandbox.clone(),
        }));
        registry.register(Arc::new(LocalWriteTool {
            sandbox,
            runtime: runtime.clone(),
        }));
    }

    let conv_id_bg = conversation_id.clone();
    let run_id_bg = run_id.clone();

    tokio::spawn(async move {
        let cfg = ReactRunConfig {
            app: Some(app),
            conversation_id: conv_id_bg.clone(),
            run_id: run_id_bg.clone(),
            parent_run_id: None,
            agent_id: "main".to_string(),
            system_prompt,
            max_turns: DEFAULT_MAIN_MAX_TURNS,
        };

        let run_res = run_react_loop(
            &cfg,
            &main_profile,
            history,
            &registry,
            cancel.clone(),
            collector.clone(),
        )
        .await;

        let store = runtime.store();
        match run_res {
            Ok(out) => {
                if let Err(e) = store.append_message(
                    &conv_id_bg,
                    "assistant",
                    &out.content,
                    &out.reasoning_content,
                    &out.steps,
                    &[],
                ) {
                    storage::log_error(format!("[Agent] 保存助手回复失败: {}", e));
                }
            }
            Err(err) => {
                let partial_steps = collector.take(&run_id_bg);
                let fallback_text = if cancel.is_cancelled() {
                    "已停止当前执行。".to_string()
                } else {
                    format!("执行中断：{}", err)
                };
                if let Err(e) = store.append_message(
                    &conv_id_bg,
                    "assistant",
                    &fallback_text,
                    "",
                    &partial_steps,
                    &[],
                ) {
                    storage::log_error(format!("[Agent] 保存中断记录失败: {}", e));
                }
            }
        }

        runtime.release_pending_for_conv(&conv_id_bg);
        runtime.clear_conv_cancel(&conv_id_bg);
    });

    Ok(ChatSendResult {
        conversation_id,
        run_id,
    })
}
