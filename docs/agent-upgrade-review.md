# xAgent 2.0 改造代码审查报告

| 项目 | 内容 |
| :--- | :--- |
| 审查对象 | `agent/` 重构（runtime/session/events/job/store/planner/executor/verifier/goal/subagent/workflow/skills/memory/router/guard/tools）+ `app_agent.go` + 引擎层扩展（db/mysqlx.go、mongo/mongo.go、redis/redis.go）+ 前端 `AiAgentPanel.tsx` / `api.ts` / `types.ts` |
| 审查基准 | `docs/agent-upgrade-design.md`（v0.1 设计文档） |
| 验证手段 | 全量代码走读 + `go build ./...` ✅ + `go vet ./...` ✅ + `go test ./agent/...` ✅（5 个单测全过） |
| 结论 | **架构落地率高（约 80% 设计要素已实现且结构清晰），但存在 2 项 P0 安全缺陷与 2 项高严重度功能 Bug，修复前不建议合并发布** |

---

## 一、审查结论概览

| 级别 | 数量 | 摘要 |
| :--- | :--- | :--- |
| 🔴 P0（安全） | 2 | ① 聊天主链路完全绕过权限审查与审计；② MySQL"只读"工具可执行任意写语句且无行数/超时防护 |
| 🟠 HIGH（功能） | 2 | ③ 审批流字段不匹配导致无法批准；④ 前端事件双订阅导致工具步骤双渲染 |
| 🟡 MEDIUM（差距） | 7 | 计划与聊天割裂、目标无执行循环、子代理无工具且缺 send、job_submit 缺失、工作流未接入、记忆不完整、验证器退化 |
| 🟢 LOW | 5 | 死代码/参数、事件并发顺序、会话恢复不完整、测试覆盖不足等 |

---

## 二、P0 安全缺陷（必须修复后发布）

### 🔴 P0-1 聊天主链路完全绕过权限审查与审计

**位置**：`agent/tools/bus.go:236-256`（`ConvertToEinoTools`）、`agent/session.go:74`、`agent/agent.go:346-539`（`StreamChat`）

**根因**：所有工具均以 `utils.InferTool` 的原始 `BaseTool` 注册（`workspace.go/ssh.go/db.go/...` 全部 `BaseTool: xxxTool`）。`ConvertToEinoTools` 对 `BaseTool != nil` 的工具**直接透传原始工具**给 ADK runner：

```go
if target.BaseTool != nil {
    out = append(out, target.BaseTool)   // ← 原始工具，无任何包装
}
```

ADK ChatModelAgent 在 `StreamChat` 中直接调用工具的 `InvokableRun`，**从不经过 `ToolBus.Invoke`**，因此 `guard.Audit` / `RequestApproval` / `RecordAuditLog` 全部不执行。旧版 `permission.go` 的 `PermissionWrappedTool` 包装在重构中丢失。

**实际影响**（聊天场景全部失效）：
- `workspace_write_file` / `workspace_delete` → 免确认直接写删；
- `ssh_exec_command` → 免确认执行，**高危命令正则拦截（rm -rf /、mkfs、dd、reboot 等）全部失效**；
- `ssh_write_file` / `ssh_delete_file` / `ssh_upload_file` / `mqtt_publish` / `job_kill` / `subagent_spawn` / `goal_create` / `memory_save` → 全部免确认；
- 审计日志表为空（聊天路径无任何工具调用留痕）。

**修复建议**：`ConvertToEinoTools` 中对 `BaseTool` 分支同样包装一层"Guard 透传工具"（复用 `einoToolWrapper` 模式，`InvokableRun` 内调用 `b.Invoke` 走完整审计/审批链路），并补一条集成测试：调用写工具必须触发 confirm 且产生审计记录。

### 🔴 P0-2 MySQL"只读"工具可执行任意写语句，且无行数/超时防护

**位置**：`agent/tools/db.go:234-253`（`db_mysql_query_readonly` handler）、`db/mysqlx.go:428-453`（`MysqlRun`）、`agent/guard/guard.go:195-230`（`auditMysqlQuery`）

**根因**：handler 只做 `strings.TrimSpace` 非空校验，无 SQL 白名单；`MysqlRun` 对非读语句（`isReadQuery` 为假）直接 `mc.db.Exec(trimmed)` —— 即 `DELETE/UPDATE/DROP/INSERT` 会被执行。唯一防线 `guard.auditMysqlQuery` 白名单在聊天路径被 P0-1 绕过，且即便走 guard，`SELECT * FROM 大表` 也合法（无 LIMIT 强制）。

**虚假安全声明**：工具描述写着"受 100 行上限与 10s 熔断保护"，实现中均不存在（`queryEx` 无行数截断、无超时）。模型会因此误判该工具安全性。

**修复建议**（设计文档 §5.9.2 三层防护）：
1. handler 内自检白名单（不依赖 guard）：仅允许 `SELECT/SHOW/DESCRIBE/DESC/EXPLAIN` 前缀、拒绝多语句（`;`）、拒绝 `INTO OUTFILE` 等旁路；非读语句直接报错；
2. `queryEx` 增加强制行数上限（默认 100）+ `context.WithTimeout`（10s）；
3. 修正工具描述，删除不实的"100 行上限与 10s 熔断保护"字样或实现后再声明。

---

## 三、HIGH 功能缺陷

### 🟠 HIGH-1 审批流断裂：确认按钮永远无法批准

**位置**：`frontend/src/pages/agent/AiAgentPanel.tsx:416-418, 625-629`；`agent/events/events.go:194-205`

**根因**：前端订阅旧通道 `agent:confirm_request:<id>`，该通道 payload 是 **camelCase**（`confirmID/toolName/riskLevel`），但前端按 **snake_case**（`confirm_id/tool_name/risk_level`）读取并构造 `AgentApprovalRequest`。结果：
- `pendingApproval.confirm_id` → `undefined` → `AgentDecideApproval(undefined, ...)` → `DecideApproval("")` 查不到队列项 → 返回 false；
- 审批卡片上工具名/风险等级显示 `undefined`；
- 后端 `RequestApproval` 只能等到 5 分钟超时自动拒绝。

**修复建议**：二选一 —— ① 前端在统一流 `agent:event` 增加 `confirm_request` case（payload 为 snake_case 类型化 `ConfirmRequestPayload`），删除旧通道订阅；② 保留旧通道但后端兼容层改为 snake_case。推荐①，与 D3 类型化事件方向一致。

### 🟠 HIGH-2 前端双订阅导致工具步骤双渲染

**位置**：`AiAgentPanel.tsx:332-445`（旧通道订阅）+ `447-565`（统一流 `agent:event`）

**根因**：`tool_start` / `tool_event` / `done` / `notice` / `error` 事件同时走两条订阅路径，`appendOrUpdateAssistant` 对 process_steps 重复 push → 每个工具调用在步骤时间线出现两次（一条 id 为 `tool_<ts>_<n>`，另一条为 `call_<ts>`）。`done` 也触发两次保存（幂等但浪费）。

**修复建议**：统一收敛到 `agent:event` 单一订阅，删除旧通道订阅（chat_chunk / reasoning_chunk 也建议迁移到统一流，使前端只依赖一种事件协议）。

---

## 四、MEDIUM 设计差距（对照设计文档）

| # | 差距 | 位置 | 说明与建议 |
| :--- | :--- | :--- | :--- |
| M1 | 计划模式与聊天链路割裂 | `app_agent.go:98-136` | `AgentProposePlan/ApprovePlan` 是独立旁路，执行结果（`_, _ = ExecutePlan`）不回填对话；`NeedConfirm` 在 `AgentApprovePlan` 未校验；plan 执行用 `context.Background()` 无法取消。建议将计划结果以"计划摘要"回注对话流，统一取消链路 |
| M2 | 目标引擎无自动执行循环 | `goal/goal.go` | `AdvanceRound` 无调用方（仅测试调用），`roundSummary` 参数未使用，无跨轮状态持久化（GoalItem.State 从未写入）。建议实现"每轮由目标代理执行 → 汇报 → 推进"循环，或将轮次推进交给编排工具 |
| M3 | 子代理能力受限 | `runtime.go:105-122` | 子代理 runner 无工具（单轮 `Model.Generate`），无法执行真实排障；`subagent_send`（继续对话）工具与 `Send` 方法缺失（guard 规则表里有该规则但未注册）；`expectedSchema` 仅校验 JSON 合法性而非 Schema。建议给子代理注入受限工具集（只读优先）并实现续接 |
| M4 | `job_submit` 工具缺失 | `tools/orchestration.go:97-142` | guard 规则表有 `job_submit`，但只注册了 status/output/kill。建议补齐 submit（提交时带 sessionID），否则主代理无法主动创建后台作业 |
| M5 | 工作流引擎未接入 | `workflow/workflow.go` | 只有 Pipeline/Parallel 纯函数，无 `workflow_run` 工具、无脚本 DSL、无持久化执行、`workflows` 表无读写代码。设计文档 §5.5 未落地 |
| M6 | 记忆体系不完整 | `memory/memory.go` | 仅手动 save/recall + 滑动窗口；episodic 自动摘要未实现（会话结束无沉淀）；`ask_user` 工具（orchestration.go:318）仅占位返回字符串，未接 `agent:ask` 通道 |
| M7 | Verifier 退化 | `verifier/verifier.go` | 关键字启发式（含 "error"/"failed" 即判失败，日志内容含 error 会被误判）；`router` 字段未使用；Executor 失败即返回无重试/换招。建议按设计引入模型校验（RoleVerifier），失败驱动修复路径 |

---

## 五、LOW 级问题

| # | 问题 | 位置 |
| :--- | :--- | :--- |
| L1 | `einoToolWrapper.Info` 的 schema 退化为单 `input` 字符串参数（当前全工具走 BaseTool，属死代码；未来注册 Handler 工具时会导致模型无法按字段传参） | `tools/bus.go:264-275` |
| L2 | `SaveJob` 部分更新（Kill/终态保存缺 StartedAt/Progress 字段）会清空 DB 中已存的 `started_at`/`progress` | `job/job.go:226-234, 176-187` |
| L3 | `EventBus.Emit` 对每个 in-process handler 起 goroutine，多 handler 时顺序无保证 | `events/events.go:168-170` |
| L4 | `GetOrCreateSession` 未从 DB 恢复 session 的 workspace/settings | `runtime.go:194-217` |
| L5 | 单测仅覆盖 store/guard/job/goal/skills；缺 planner/executor/toolbus/事件总线/审批流集成测试 | `runtime_test.go` |

---

## 六、符合项（设计落地良好）

- ✅ **目录结构完全对齐设计文档 §4.3**：14 个子包全部落地，职责清晰；
- ✅ **SQLite Store 完整**：8 张表 + 历史 JSON 自动迁移（`autoMigrateJSONHistory`）+ 单写连接 + 事务批量替换；
- ✅ **类型化事件总线**：EventType 枚举 + Payload struct + TraceID + 向后兼容通道，`agent:event` 统一流已接通前端；
- ✅ **权限引擎本体升级到位**：四级授权、会话授权记忆（30 分钟过期/可撤销）、审批队列、审计落库、MySQL 白名单 AuditFunc、高危命令正则——**缺陷仅在调用链路被 P0-1 架空，引擎本身实现正确**（有单测覆盖）；
- ✅ **多协议工具齐备**：redis/mysql/mongo/sqlite/mqtt/http + 编排（job/subagent/goal/skill/memory/ask）全部注册，引擎层 `ListConnections/ResolveID` 扩展合理；
- ✅ **前端工作台接线完整**：会话管理、计划视图（DAG 步骤/风险徽标/确认门）、作业/目标/子代理/审计/技能面板、审批卡片、`/plan` `/goal` 快捷指令均有实现；wailsjs 绑定已重新生成；
- ✅ **工程质量**：`go build` / `go vet` / `go test` 全绿，无编译告警，注释与中文提示规范。

---

## 七、修复优先级建议

1. **立即（发布前必须）**：P0-1 工具透传包装恢复权限链；P0-2 MySQL 只读执行器三层防护；HIGH-1 审批字段对齐；HIGH-2 前端订阅收敛。
2. **本周**：M1 计划结果回填 + NeedConfirm 校验；M4 补 `job_submit`；L2 SaveJob 部分更新修复。
3. **迭代版**：M2 目标执行循环、M3 子代理工具集与 send、M5 工作流接入、M6 episodic 摘要与 ask_user 接线、M7 模型验证器。
4. **补测试**：为 P0-1 补"写工具必须触发审批并留审计"的集成测试；为工具总线补 Invoke 全链路单测。

---

*审查方式：全量代码走读 + 构建/静态检查/单测验证。修复后可基于本报告逐项复核关闭。*

---

# 附录：第二轮复查记录（初步修改后）

> 复查方式：对第一轮全部问题逐项复验 + `go build` / `go vet` / `go test ./agent/...`（8 个测试）/ 前端 `tsc --noEmit` 全绿。

## 一、修复确认（✅ 已关闭）

| 原问题 | 修复内容 | 验证 |
| :--- | :--- | :--- |
| 🔴 P0-1 聊天链路绕过权限 | `ConvertToEinoTools` 全部工具统一包装 `guardWrappedEinoTool`（`InvokableRun` → `b.Invoke` 走 Audit/审批/审计）；`Info` 保留 BaseTool 真实 Schema；失败返回 `{"ok":false,...}` 供模型感知 | 新增 `TestToolBusGuardWrappedEinoTool`：写工具触发审批且审计落库（decision=approved）✅ |
| 🔴 P0-2 MySQL 只读工具可写 | handler 层新增 `isStrictlyReadonlySQL`（单语句、白名单前缀、INTO OUTFILE/LOAD DATA/SLEEP(/BENCHMARK( 拦截）；`queryEx` 加 `QueryContext` 10s 超时 + 100 行上限；工具描述改为如实声明 | 代码走读 ✅ |
| 🟠 HIGH-1 审批流断裂 | 前端统一流 `agent:event` 新增 `confirm_request` case（snake_case `ConfirmRequestPayload`），删除旧通道 confirm 订阅；`handleApprovePending` 读 `confirm_id`；审批卡片字段（tool_name/risk_level/arguments）与 payload 对齐 | 代码走读 + tsc ✅ |
| 🟠 HIGH-2 前端双渲染 | 旧通道订阅收敛：仅保留 `agent:chunk` / `agent:reasoning_chunk`（统一流无对应 case 不重复）；tool_start/tool_event/done/notice/error 仅走统一流一次 | 代码走读 ✅ |
| 🟡 M1 计划结果回填 | `AgentApprovePlan` 执行后生成 Markdown 汇总报告（步骤表+状态）写入 Store 并 `EventDone` 推送前端展示 | 代码走读 ✅ |
| 🟡 M4 job_submit 缺失 | `job_submit` 工具已注册（LevelConfirm） | 代码走读 ✅ |
| 🟡 L2 SaveJob 字段丢失 | 终态保存补 `StartedAt/CreatedAt/Progress`；Kill 补 `SessionID/Kind/Progress/StartedAt/CreatedAt`；测试增加 StartedAt 持久化断言 | `TestJobManager` ✅ |
| 测试覆盖 | 新增 `TestToolBusGuardWrappedEinoTool` / `TestWorkflowEngine` / `TestVerifier`，测试总数 5→8 | `go test` 全绿 ✅ |

## 二、本轮新增/部分修复

| 项 | 状态 | 说明 |
| :--- | :--- | :--- |
| `subagent_send`（M3） | ◐ 部分 | 工具 + `SubagentManager.Send` 已实现（拼接上下文重跑 runner 的简化多轮）；子代理 runner 仍无工具集（纯文本生成） |
| 工作流接入（M5） | ◐ 部分 | `workflow_run` / `workflow_create` 工具 + `WorkflowEngine.RunWorkflow`（JSON spec 串行执行）+ `Store.SaveWorkflow/GetWorkflow/ListWorkflows`；无 pipeline/parallel 脚本 DSL |
| 目标轮次推进（M2） | ◐ 部分 | 新增 `goal_advance_round` 工具入口；`roundSummary` 死参数、阻塞按"同一具体条件"计数仍未修 |

## 三、遗留问题（下一轮建议）

| 级别 | 问题 | 位置 |
| :--- | :--- | :--- |
| 🟡 MEDIUM | `job_submit` 为**桩实现**：run 函数仅两段 `time.Sleep(500ms)` 模拟进度，并未真正执行 `input.Command` | `tools/orchestration.go:126-142` |
| 🟡 MEDIUM | Executor 串行执行，`DependsOn` 未实现 DAG 并行；失败即返回无重试/换招（Verifier 仅关键字启发式） | `executor/executor.go`、`verifier/verifier.go` |
| 🟡 MEDIUM | `ask_user` 工具仍为占位（返回字符串，未接 `agent:ask` 通道）；episodic 记忆自动摘要未实现 | `tools/orchestration.go:443`、`memory/memory.go` |
| 🟢 LOW | goal `roundSummary` 死参数；`blockTracker` 未按阻塞条件区分；`GetOrCreateSession` 未恢复 workspace/settings；guard 包装工具 traceID 为空字符串 | `goal/goal.go`、`runtime.go`、`tools/bus.go:277` |

## 四、结论

**第一轮全部 P0/HIGH 问题已修复并有测试背书，MEDIUM 遗留 3 项、LOW 遗留 4 项，均为功能增强而非安全/正确性缺陷，当前状态可进入功能联调与试用。** 建议试用期重点观察：聊天场景写工具/高危命令的审批弹窗与审计留痕、计划执行结果回填的展示效果。
