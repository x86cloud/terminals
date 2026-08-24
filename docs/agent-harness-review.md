# Agent 实现对照现代 Harness 设计的审查报告

> 审查范围：`agent/` 包全部 Go 实现（含子包），以及 `services/agent_service.go`、`frontend/bindings/terminal/agent/`、`agent/events/`、`agent/store/` 等契约边界。
> 审查视角：完整性（completeness）/ 正确性（correctness）/ 影响面（impact）。
> 审查日期：2026-08-21。

**总体结论**：该 agent 包的**架构骨架非常接近现代 harness 范式**（工具总线 + Guard 审批 + Planner/PlanGate + DAG Executor + Subagent + Verifier + Memory/Skills + 事件流），模块划分合理。但存在**多处"宣称了能力但最后一公里未接通"的断点**、**两处实质性的权限绕过**，以及**后台任务生命周期的系统性设计错误**。

---

## Critical Issues (MUST FIX)

### 1. 后台作业/子代理绑定在"单次工具调用 ctx"上，返回即被杀——run_in_background / job_submit / subagent_spawn 三大特性整体失效

- `agent/tools/bus.go#L210-L215`
- `agent/tools/shell.go#L36-L53`
- `agent/tools/orchestration.go#L186-L192`

**Problem**：`ToolBus.Invoke` 为每次调用创建 `toolCtx` 并 `defer cancel()`，但 `jm.SubmitExec(ctx,…)` 与 `sm.Spawn(ctx,…)` 直接把这个请求级 ctx 传给了后台任务。工具返回 → cancel 触发 → `exec.CommandContext` 杀掉后台进程 / 子代理 `Model.Generate` 收到 `context canceled`。所有后台作业提交后毫秒级变为 killed、子代理立即 failed，而系统提示词和工具返回值还向模型/UI 承诺"任务将持续运行"。这与现代 harness "任务绑定 session/app 生命周期而非单次调用"的核心原则直接相悖。

**Fix**：

```go
// tools/shell.go / orchestration.go handler 内：
bgCtx := context.WithoutCancel(ctx) // go.mod 为 go 1.27，可用
jobID, err := jm.SubmitExec(bgCtx, sessionID, "shell_cmd", spec, ...)
```

更好的做法：让 `JobManager`/`SubagentManager` 内部统一从 app 级 ctx（`DefaultRuntime` 已有 `SetContext`）派生，Kill/Interrupt 走各自的 `cancelFunc`。

### 2. SSH 工具路径直接拼进 shell 命令——远程任意命令注入，且 ssh_read_file 为 Allow 级免确认

- `agent/tools/ssh.go#L208-L321`
- `ssh/sftp.go#L225-L239`

**Problem**：`fmt.Sprintf("cat %s", ssh.NormalizeRemote(input.Path))`——`NormalizeRemote` 只做斜杠规范化，不转义 shell 元字符。路径为 `/tmp/x; reboot` 或 `/tmp/$(curl …|sh)` 时，远端 shell 直接执行注入命令。`ssh_read_file`、`ssh_download_file` 的 guard 级别是 `LevelAllow`，被污染的文档触发提示注入后即可**无确认地**在远程主机执行任意命令。

**Fix**：改用 SFTP 读写文件（`SessionManager` 已有 `sftpConn` 基础设施，`ListDir` 就是这么做的）；若必须走 shell，拒绝路径中的 `;`、`&`、`|`、`$`、反引号、换行并用单引号包裹。

### 3. `db_sqlite_query_readonly` 名为只读、实为任意写——免确认破坏 SQLite 数据库

- `agent/tools/db.go#L517-L528`
- `db/sqlite.go#L345-L371`

**Problem**：MySQL 工具有 `isStrictlyReadonlySQL` 白名单校验，SQLite 工具却直接 `SqliteRun(input.SQL)` 无任何校验，非 SELECT/PRAGMA 走 `db.Exec`——`DROP TABLE`、`DELETE` 全部直接执行，guard 级别还是 `LevelAllow`。与"move_file 都要 Confirm"的权限模型直接矛盾。

**Fix**：handler 中复用 `isStrictlyReadonlySQL`（加 PRAGMA 只读白名单），或提升为 `guard.LevelConfirm`；同理建议对 `db_mongo_aggregate` 过滤 `$out`/`$merge`。

### 4. 子代理"自主工具调用循环"是死代码——Generate 从未携带工具定义

- `agent/runtime.go#L133-L165`

**Problem**：子代理 runner 调用 `res.Model.Generate(ctx, schemaMsgs)` 时全包无任何 `model.WithTools(...)`，API 请求不含 `tools` 字段 → 模型永不返回 `tool_calls` → 首轮即 return，工具执行分支**永远不会执行**。系统提示宣称"可直接调用系统工具"，实际子代理退化为单轮纯文本问答。"隔离上下文 + 工具增强的并发子代理"这一核心 harness 能力未交付。

**Fix**：子代理构建时用 `toolBus.ConvertToEinoTools(subID)` 生成工具集并 `model.WithTools(...)` 传入，或直接复用 `adk.NewChatModelAgent + adk.Runner`（session.go 主循环做法）。

### 5. Executor 的 "workflow" 动作是空壳——不执行任何阶段却返回成功

- `agent/executor/executor.go#L405-L426`
- `agent/workflow/workflow.go#L41-L76`

**Problem**：`Pipeline(ctx, sessionID, wfSpec.Items, nil, nil)` 第 4 参 stages 传 nil → `for range stages` 零次迭代 → 每个 item 原样 append → stepRes `OK:true`。**计划中的 workflow 步骤什么都没做就报告成功**。真正有执行能力的 `RunWorkflow`（workflow.go L115）从未被接入。

**Fix**：解析 `wfSpec.WorkflowName` 并调用 `e.workflowEng.RunWorkflow(ctx, plan.SessionID, wfSpec.WorkflowName, invoker)`，invoker 复用 ToolBus（参考 orchestration.go `workflow_run` 工具的实现）。

### 6. 子代理递归深度防护失效——所有 Spawn 调用点硬编码 depth=1，可无限递归

- `agent/subagent/subagent.go#L67-L82`
- `agent/tools/orchestration.go#L187`
- `agent/executor/executor.go#L378`

**Problem**：`if depth > sm.maxDepth`（maxDepth=3）意图防递归失控，但两处调用点均硬编码传 1，判断永假；子代理 runner 用**全量**工具列表（含 `subagent_spawn`），可无限串行递归，造成失控的 LLM 调用链。

**Fix**：`SubagentManager` 记录父子关系，spawn 时以 `parent.Depth + 1` 计算真实深度；或从子代理工具集中剔除 `subagent_spawn`/`subagent_send`，禁止二次委派。

### 7. 三个安全/功能设置开关定义了但从未接线——配置契约静默失效

- `agent/runtime.go#L68-L75`
- `core/settings.go#L19-L21`

**Problem**：`AiEnableWebSearch / AiEnablePermissionGuard / AiBlockHighRiskCommands` 前端设置页暴露并可持久化，但全仓 0 处消费：`guard.NewPolicyGuard(true, true, st)` 硬编码，`web_search` 无条件注册。用户关闭权限守卫后仍被弹审批、关闭高危拦截后仍被硬拦、关闭联网后模型仍可外发查询。

**Fix**：为 `PolicyGuard` 增加 `SetEnabled`/`SetBlockHighRiskCommands`，在 `InitOrUpdate` 中按 cfg 应用；`web_search` 的注册/移除根据 `AiEnableWebSearch` 动态决定。

---

## Warnings (SHOULD FIX)

### 8. 同一会话无单飞控制——并发发送交错输出、聊天回合与后台 Plan 执行互相覆盖

- `agent/agent.go#L349-L379`
- `services/agent_service.go#L178-L270`

**Problem**：`AgentSend` 无会话级互斥，两次并发 `StreamChat` 的 ChatChunk 交错、`cancelMap` 相互覆盖导致 `StopChat` 只能停最后一次；`AgentApprovePlan` 后台执行期间用户仍可发消息，两条流都写"最后一条 assistant 消息"，Plan 的 Done 报告会**整体覆盖正在流式输出的聊天内容**。

**Fix**：`StreamChat` 入口 per-session 忙则拒绝（`sess.mu.TryLock` 或状态检查）；事件 payload 增加 `turn_id`，前端按回合定位消息。

### 9. 编排工具信任模型自报的 session_id；子代理事件挂伪造会话——跨流污染

- `agent/tools/orchestration.go#L107-L129`
- `agent/runtime.go#L145-L165`

**Problem**：`job_submit`/`subagent_spawn` 直接用 LLM 输入的 `input.SessionID` 无回退（对比 ask_user 有 `SessionIDFromContext` 回退）；子代理调用工具时 sessionID 写死为 `"subagent_"+subID`，而前端过滤器 `activeSessionId === 'ai_agent_default'` 恒真放行——子代理的工具步骤/审批卡被追加进当前聊天最后一条消息，与主对话互踩；模型不填 session_id 时作业在工作台永远不可见。

**Fix**：编排工具一律以 `SessionIDFromContext(ctx)` 为权威；子代理 runner 透传父会话 ID，事件按父会话路由。

### 10. 流式 shell 取消路径存在 send-on-closed-channel panic 竞态——可崩溃整个桌面进程

- `agent/shell/shell.go#L200-L261`

**Problem**：取消时外层 goroutine 提前 return → defer `sw.Close()` 关闭 channel；两个 `readPipe` goroutine 通过 ctx 检查后仍可能 `sw.Send(...)` → 向已 close 的 channel 发送 → panic 击穿整个进程（无 recover）。

**Fix**：`sw.Close()` 移到 `wg.Wait()` 之后统一执行；`ctx.Done` 分支只做 `killProcessTree + sw.Send(nil, ctx.Err())`，不提前 return。

### 11. `LocalExecutor` 顺序读 stdout/stderr——stderr 写满管道时作业假死；Unix 无进程组隔离，孙进程泄漏

- `agent/job/executor.go#L95-L122`

**Problem**：`io.MultiReader(stdout, stderr)` 先读尽 stdout 才读 stderr，stderr 超 64KB 未退出时进程阻塞、作业挂到超时被误杀；Unix 分支无 `Setpgid`，取消后 `bash -c "npm run dev"` 的 npm/node 子进程全部存活为孤儿。同仓库 `agent/shell/shell.go#L210-L246` 与 proc_unix.go 已有正确范本。

**Fix**：参照 `agent/shell` 实现：双 goroutine 并发读管道 + `wg.Wait()` 后 `cmd.Wait()`；`Setpgid: true` + 取消时 `Kill(-pid, SIGKILL)`，建议直接复用抽出的实现。

### 12. `GetStore` 失败后错误不持久化——二次调用返回 `(nil, nil)`，持久层静默失效

- `agent/store/store.go#L112-L122`
- `agent/runtime.go#L69`

**Problem**：`err` 是每次调用的局部变量，首次初始化失败后 `sync.Once` 不再执行、err 恒为 nil；runtime.go 用 `st, _ :=` 丢弃错误——历史消息、作业、审计日志、记忆、工作流**全部静默不落盘**且无任何告警。

**Fix**：错误缓存为包级 sticky error，`container.go` 启动时显式调用一次并在失败时向 UI 报错。

### 13. `ExecuteDAG` 取消后返回 nil error——手动停止的计划被报告为"全部执行完成"

- `agent/executor/executor.go#L177-L253`

**Problem**：层间 `ctx.Err()` break 后直接 `return allResults, nil`，调用方只查 err，被 `AgentCancelPlan` 停止的计划会生成"✅ 全部规划步骤执行完成"的误导性报告；另外 `StepResult.Fatal`（retry.go 专门设置）在 DAG 调度中从未被检查，fail-fast 语义与字段设计不一致。

**Fix**：break 后 `return allResults, ctx.Err()`；中止条件改为 `if r.Fatal`。

### 14. planner 降级路径产生"伪成功"计划——空步骤什么都不做却报 OK

- `agent/planner/planner.go#L71-L90`
- `agent/executor/executor.go#L456-L473`

**Problem**：无 API key / 模型失败 / JSON 解析失败的三处 fallback 返回 `Action:"tool_call"` 但 ToolName/Args 为空的单步计划，进 executor default 分支后 `OK:true, Output: step.Description`——表面全部成功，实际零执行。与 #5、#13 叠加导致系统对用户报告与事实不符的"成功"。

**Fix**：fallback 计划显式标记 `Status:"skipped"`；executor 对无 ToolName 的 tool_call 返回失败/跳过；service 层拦截"无可用 planner 模型"直接提示用户。

### 15. 计划失败恢复不闭环：单步重试丢上下文、不可取消、数据竞争

- `services/agent_service.go#L285-L315`
- `agent/planner/plangate.go#L36-L51`

**Problem**：(a) 重试时 `stepOutputs` 传空 map，`{{step_x.output}}` 模板渲染失效，下游步骤不会级联重跑；(b) 用 `context.Background()` 且未注册进 `planCancelMap`，`AgentCancelPlan` 停不掉重试，Wails 调用同步阻塞分钟级；(c) 直接写 `&plan.Steps[i].Status` 与后台 Executor 的写构成数据竞争。另外 `ExemptStep/IsStepExempted` 全仓无调用方。

**Fix**：重试时从已完成步骤的 Output 重建 stepOutputs；注册 cancel + 异步执行返回 jobID；plan 状态更新收敛到单一加锁写路径；豁免机制删除或真正接入。

### 16. 应用退出零清理 + jobs/subagents/PlanGate 四处无界增长

- `services/container.go#L70-L78`
- `agent/job/job.go#L142-L144`
- `agent/planner/plangate.go#L22-L28`

**Problem**：`Shutdown` 只关连接管理器；`JobManager` 无 KillAll，运行中的本地作业进程成为孤儿继续执行；store 的 `Close()` 无调用方；`jobs`/`subagents` map 只增不删（含大 Result 字符串），`PlanGate.activePlans`/`exemptions` 永不清理且持有完整 Plan；`DeleteSession` 不级联删 jobs/job_output/subagents——长驻桌面应用内存与 DB 持续膨胀。

**Fix**：新增 `AgentRuntime.Shutdown`（KillAll、取消会话、`Store.Close()`）挂入 container.Shutdown；作业/子代理终态后延迟剔除；`PlanGate` 增加 `Complete(planID)`；`DeleteSession` 级联删除。

### 17. Plan/Job 状态仅存内存——重启后 executing 计划永久悬挂，resume 语义缺失

- `agent/planner/plangate.go#L7-L63`

**Problem**：Plan 与 `planCancelMap` 均为内存态。重启后：前端 plan 消息 `executing:true` 永久悬挂；`AgentCancelPlan`/`AgentRetryPlanStep` 返回"规划不存在"；DB 中 job 停在 running 且内存丢失后 `Kill` 永远返回 false。与现代 harness 要求的"中断后可恢复/可收敛"相悖。

**Fix**：Plan 步骤状态写回 store；启动时将 running 态的 job/plan 收敛为 stopped/failed。

### 18. 上下文压缩不闭环：估算失真 + 摘要不持久化 + 不回写

- `agent/agent.go#L278-L330`

**Problem**：(a) `estTokens = totalChars / 3` 对中文低估约 3 倍，实际早已超限才触发；(b) 每次触发都重新 LLM 摘要且结果不落盘，下一轮对同段历史重复摘要；(c) 压缩后的消息不回写 store，历史持续膨胀。现代 harness 的 compaction 是"一次摘要、持久替换、增量维护"。

**Fix**：摘要持久化到 messages 表（标记 `kind=summary` 替换被压缩段）；CJK 字符按约 1:1 计 token；压缩后回写。

### 19. 会话状态机、WorkingMemory、EventBus 订阅均为"声明了但未接线"的半成品

- `agent/session.go#L21-L65`
- `agent/events/events.go#L139-L179`
- `agent/memory/memory.go#L53-L79`

**Problem**：8 个 `SessionState` 中 6 个从未流转，前端无法感知会话生命周期；`workingMem` 创建后全链路无读写、`CompressSlidingWindow` 无调用方；`EventBus.Subscribe`/`rawEvents` 无订阅方、`go h(e)` 无 recover 且无顺序保证；`EventGoalUpdated` 无 emit 方。这也是 resume 能力缺失的根因之一。

**Fix**：接线（`StreamChat`/`AgentApprovePlan` 前后置 `executing/verifying/done/failed` 并广播；每轮迭代维护 working memory）或删除，避免误导维护者。

### 20. AgentManager 多字段无锁读写——data race

- `agent/agent.go#L137-L237`

**Problem**：`SetSSHManager`（每次 `AgentSend` 都调用）在写锁下写 `sshMgr`/`cfg`，但 `buildSchemaMessages` 不持锁读 `m.sshMgr` 和 `m.cfg`；`SetContext` 完全无锁写 `m.ctx` 与持锁读它的 `InitOrUpdate` 竞争，`-race` 下必报。

**Fix**：`buildSchemaMessages`/`SetContext` 统一在 `m.mu` 保护下访问，或传入已拷贝的快照。

### 21. LLM 调用全程无超时——端点挂起则请求永久悬挂

- `agent/router/router.go#L74-L104`
- `agent/agent.go#L319`
- `agent/agent.go#L384`

**Problem**：eino-ext openai 的 `ChatModelConfig.Timeout` 默认 no timeout 且 router 从不设置；`StreamChat` 的 chatCtx 派生自 `context.Background()` 无 deadline；压缩摘要的 `Generate` 同样裸奔。

**Fix**：`router.Resolve` 构造 cfg 时设置 Timeout（如 120–300s），或关键调用处包 `context.WithTimeout`。

### 22. `BuildDAG` 重复步骤 ID 改名不回写——步骤执行了但结果被静默丢弃

- `agent/executor/dag.go#L20-L48`
- `agent/executor/executor.go#L212-L224`

**Problem**：重命名只写入 `stepMap` 副本，原 `steps` 切片不变；executor 用原 ID 匹配回写结果时永远匹配不上——步骤照常执行、消耗配额，结果却无法进入 `plan.Steps` 与 `stepOutputs` 供下游引用。

**Fix**：重复 ID 直接判错返回让 planner 重试，或让 `BuildDAG` 接收 `*planner.Plan` 原地改名。

### 23. 高危命令黑名单是朴素子串匹配，且不覆盖 Windows/PowerShell 语义

- `agent/guard/guard.go#L14-L25`

**Problem**：仅 10 个 `strings.Contains` 模式。`rm -fr /`（调换标志）、`rm -rf "/"`（引号）、`Remove-Item -Recurse`、`Format-Volume`、base64 解码管道、`r"m" -rf /` 全部绕过——本项目主环境正是 Windows/PowerShell，现有模式基本无效。更实际的风险：用户"本次会话记住授权"后（30 分钟自动放行），绕过变体的破坏性命令不再经过任何确认。

**Fix**：按平台分 shell 维护模式集，匹配前做规范化（去引号、压缩空白）；Remember 授权期间高危模式仍独立拦截；长期在 shell 层用参数化执行。

### 24. 其余正确性/契约缺陷（合并条目）

- **ask_user 超时/忽略返回"成功+空答案"**——`agent/ask/ask.go#L71-L81`、`agent/executor/executor.go#L439-L446`：executor 分支把空串当成功，下游步骤在无用户输入下盲跑。Fix：超时返回明确 error 或复用工具路径的"用户未回应"语义。
- **`Temperature=0` 被强制改为 0.7**——`agent/router/router.go#L74-L77`：把"未设置"与"明确设 0"混为一谈。Fix：用指针区分，仅 nil 时取默认。
- **Executor fallback 调用不存在的工具名 `exec_command`**——`agent/executor/executor.go#L355-L365`：注册名是 `execute`，该分支必然失败。Fix：改为 `"execute"`。
- **`expected_schema` 是假校验**——`agent/subagent/subagent.go#L154-L164`：只 `json.Unmarshal` 判合法性，任意 JSON（含 `{}`）都通过。Fix：引入 JSON Schema 校验库真实校验并回传重试，或改名为 `expect_json`。
- **skill_load/skill_list 工具未注册但 guard 有规则、DB skills 表无写入路径**——`agent/guard/guard.go#L184-L185`、`agent/store/store.go#L778-L814`：模型无法自主发现/加载技能；`SkillsReg.Get(name)` 的 `filepath.Join` 未来注册时会引入路径穿越。Fix：补注册这两个工具（name 做 `filepath.Base` 清洗）或删除死规则/死表。
- **verifier 只覆盖 plan 路径**——`agent/verifier/verifier.go#L57`：主对话循环（agent 的主要工作路径）的工具执行结果不经过任何验证。Fix：在 `guardWrappedEinoTool.InvokableRun` 或 `ToolBus.Invoke` 出口挂接可选规则级 Verify。
- **主循环工具调用 traceID 恒为空、全包无结构化日志**——`agent/tools/bus.go#L313-L322`：audit_logs.trace_id 全 NULL，无法串联一轮对话的工具调用。Fix：`StreamChat` 生成 traceID 写入 context，包装时提取传入；关键路径补 slog。
- **会话 Settings 为创建时快照**——`agent/runtime.go#L257-L284`：修改系统提示词后默认会话（存活整个应用生命周期）仍用旧提示词，新旧两套并存漂移。Fix：`InitOrUpdate` 刷新 active 会话的 Settings，或 `BuildRunner` 直接读当前 cfg。

---

## Suggestions (CONSIDER)

### 25. 迭代上限与预算熔断不可配置

- `agent/session.go#L135`

MaxIterations 硬编码 100，无 token 预算。Fix：接入 AppSettings，超限时注入"预算耗尽，请总结进展"的收尾指令。

### 26. 工具结果无统一截断策略

- `agent/tools/bus.go#L23-L32`

`ToolResult.String()` 无长度上限，`read_file` 可全量返回任意大文件，shell/http/job 各自为政。Fix：`ToolBus.Invoke` 出口统一施加 maxOutputChars（如 30KB）截断并附 `truncated:true` 标记。

### 27. http_request_readonly 无 SSRF 内网防护

- `agent/tools/http.go#L36-L66`

可直连云元数据 169.254.169.254、内网段、127.0.0.1。Fix：请求前解析 DNS 拒绝环回/私网/链路本地地址，重定向后二次校验。

### 28. "语义记忆"实为 SQL LIKE 匹配且不自动注入

- `agent/store/store.go#L731-L755`

措辞不同即召回失败，且召回结果只在模型显式调用 memory_recall 时可见。Fix：短期抽取关键词入 tags；长期引入 sqlite-vec 向量检索；`buildSchemaMessages` 中对 user 消息自动注入 top-3 记忆。

### 29. 事件系统三轨并行、命名混乱、含死分支

- `agent/events/events.go#L14-L34`

`EventAskUser` snake_case 与其余 CamelCase 混用；`EventError="Error"` 而前端只有小写 `case 'error'`——错误事件是永不命中的死分支（靠 promise rejection 兜底）；ChatChunk 走 legacy 通道、ReasoningChunk 走统一流、`agent:event:{sid}` 无人订阅。Fix：统一 snake_case + 单一 `agent:event` 流 + 显式 payload schema，删除 legacy 通道。

### 30. 会话级 workspace 契约未兑现

- `agent/runtime.go#L269-L279`

`SessionItem.Workspace` 落库/读取，但所有工具用全局唯一 `WorkspaceManager`——切换会话不切换沙箱目录。Fix：`BuildRunner` 按 `Session.Workspace` 实例化 per-session WorkspaceManager。

### 31. 每次发送全量重建 Runner + 重复注册约 40 个工具

- `agent/agent.go#L360-L364`
- `services/agent_service.go#L43-L46`

固定性能税。Fix：以配置指纹（BaseURL/Key/Model/Prompt/skills 变更）为重建条件，工具注册改 once。

### 32. 其余建议（合并条目）

- **Plan.NeedConfirm 计算后无人消费**——`agent/planner/planner.go#L238`：建议低风险计划自动执行（auto-approve 语义），高风险才强制审批。
- **`subagent_send` 未设置 Timeout，默认 30s 不够多轮推演**——`agent/tools/orchestration.go#L202-L213`：设 5–10 分钟或改异步。
- **`mqtt_subscribe_once` 契约与实现不符**——`agent/tools/mqtt.go#L47-L61`：只是持久订阅并返回成功，模型永远拿不到消息。实现"订阅后等 N 秒收集再取消"的一次性语义。
- **`web_search` 响应体读取无上限**——`agent/tools/websearch.go#L66`：加 LimitReader（http.go 的 100KB 可参照）。
- **`Wait` 以 100ms 轮询 SQLite**——`agent/job/job.go#L328-L356`、`agent/subagent/subagent.go#L292-L354`：每等待步骤每秒 10 次 DB 查询且与写入争用单连接。改为终态向 per-ID channel 发信号。
- **`ToolBus.Invoke` 对非 Invokable 工具静默返回成功**——`agent/tools/bus.go#L220-L237`：else 分支显式报"工具不支持同步调用"。
- **Plan 报告双写竞态**——`services/agent_service.go#L252-L269`：后端 AddMessage 与前端 ReplaceMessages（先 DELETE 全部）竞争，报告行可能被覆盖删除。消息持久化收敛为单一写入方（建议后端 append-only，前端只读）。

---

## Summary of Changes（审查总结）

1. **架构骨架完整、关键闭环缺失**：模块划分非常贴近 Claude Code / Codex CLI 等现代 harness 范式，但多处"最后一公里"未接通——最严重的是子代理工具循环（#4）与 workflow 空壳（#5）两条宣称能力实际不可用，属于典型的"半成品交付"。
2. **最致命的系统性错误是生命周期耦合（#1）**：后台作业/子代理的 ctx 派生自单次工具调用，系统提示词主推的三条后台路径实际全部秒死；修复应统一改为 app 级 ctx + 显式任务注册表。
3. **权限防线存在三个实质绕过**：SSH shell 拼接注入（#2，Allow 级）、SQLite 伪只读（#3，Allow 级）、高危黑名单子串匹配可绕过（#23）——作为具备本地 shell + 远程 SSH + 数据库写能力的 agent，防护深度需与能力匹配。
4. **失败语义不可信**：planner 伪成功（#14）+ workflow 空壳成功（#5）+ 取消误报成功（#13）+ verifier 不覆盖主路径，叠加会导致系统对用户报告与事实不符的"执行成功"。
5. **建议修复优先级**：先修 #1–#7（能力真实性与安全性），再统一失败语义与会话身份路由（#8–#15），最后补资源回收/resume 语义（#16–#17）与可观测性、上下文管理闭环。
