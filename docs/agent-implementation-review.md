# xAgent 2.0 前后端实现检查报告（合理性 / 完整性 / 代码质量）

| 项目 | 内容 |
| :--- | :--- |
| 检查范围 | `agent/` 全部 27 个源文件 + `app_agent.go` + 引擎层扩展 + 前端 `AiAgentPanel.tsx`（1951 行）/ `api.ts` / `types.ts` / `AiAgentTab.tsx` / `wailsjs` 绑定 |
| 检查方法 | 全量代码走读 + 前后端事件协议逐项比对 + 设计文档承诺对照 + 构建/静态检查/测试验证 |
| 验证结果 | `go build` ✅ / `go vet` ✅ / `go test ./agent/...`（**14 个测试**）✅ / 前端 `tsc --noEmit` ✅ |
| 总体结论 | **架构合理、功能完整度约 90%、代码质量良好**。存在 1 项 MEDIUM 功能缺陷（换招无效）、1 项 MEDIUM 完整性缺口（MQTT 订阅无法取消息）、若干 LOW 级质量问题，无 P0/P1 安全与正确性问题 |

---

## 一、前后端实现是否合理（架构评估）

### 1.1 后端（合理，评级 ★★★★☆）

| 维度 | 评估 |
| :--- | :--- |
| 分层 | ✅ `runtime`（装配根）→ `session`（会话隔离）→ Harness Core（job/event/store/guard/router）→ 编排层（planner/executor/verifier/goal/subagent/workflow/ask）→ 工具总线 → 领域引擎，层次清晰、无循环依赖 |
| 依赖注入 | ✅ `SetManagers` / `RegisterExecutor` / `executor.SetManagers` 装配点集中，组件可测（测试直接构造各子系统） |
| 权限闭环 | ✅ `ConvertToEinoTools` 统一包 `guardWrappedEinoTool` → `ToolBus.Invoke` → `guard.Audit`（规则+高危拦截+授权记忆）→ 审批队列 → 审计落库，聊天与计划两条路径都闭环 |
| 事件驱动 | ✅ 类型化 Event + `agent:event` 统一流 + 向后兼容通道；TraceID 贯穿计划执行链路 |
| 引擎复用 | ✅ 作业执行复用 `ssh.ExecCombinedWithContext`、`queryEx` 等既有能力，未重复造轮子 |
| 遗留问题 | ◐ **双执行路径并存**：聊天（`StreamChat` → ADK ReAct）与计划（Planner/Executor/DAG）是两条独立路径，普通聊天无规划/验证/DAG 能力（设计文档的"核心循环"仅对 `/plan` 生效）。◐ `DefaultManager`（兼容层）与 `DefaultRuntime`（新运行时）双单例职责重叠，长期应合并。◐ `Session.BuildRunner` 每轮对话重建 ADK Runner，无缓存 |

### 1.2 前端（合理，评级 ★★★★☆）

| 维度 | 评估 |
| :--- | :--- |
| 事件订阅 | ✅ 收敛为统一流 `agent:event` 单入口 + 仅 chat/reasoning chunk 走旧通道（无双渲染）；大小写双 case 兼容后端命名不一致 |
| 组件化 | ✅ `MessagePlanCard`（步骤卡片/展开详情/风险徽标/重试/取消）、`ProcessStepsList`、AskDock、ApprovalDock 均为独立组件 |
| 状态管理 | ✅ 消息/计划/审批/询问/作业/目标/子代理/审计/技能各状态独立，`loadInspectorData` 批量刷新 |
| 遗留问题 | ◐ **`AiAgentPanel.tsx` 单文件 1951 行**，组件虽拆分但同文件内，可读性与可维护性下降；◐ 消息保存 `agentSaveSessionMessages` 在 done/step_finished/plan 更新多处全量 `ReplaceMessages`，长会话有写库放大 |

---

## 二、前后端功能是否完整（设计承诺对照）

### 2.1 后端功能清单

| 功能 | 状态 | 说明 |
| :--- | :--- | :--- |
| 作业真实执行（MEDIUM-1） | ✅ | `LocalExecutor`（PowerShell/bash/cmd、环境变量、2000 行截断、进程树杀、超时）+ `SSHExecutor`；`SubmitExec` 前置高危拦截 |
| DAG 并行（MEDIUM-2） | ✅ | `BuildDAG`（Kahn 分层+环检测）+ `ExecuteDAG`（信号量并发闸，默认 4） |
| 重试/换招（MEDIUM-2） | ◐ | 重试（指数退避 300/600ms）✅；**换招无效**：`_fix_suggestion` 注入 args 后工具解析忽略，实际是"相同参数重试"（见 Q-M1） |
| 模型验证器（MEDIUM-2） | ✅ | 两段式（规则+可选模型，5s 超时降级），`AiEnableVerifier` 设置项默认关 |
| ask_user 接通（MEDIUM-3） | ✅ | `AskManager`（5 分钟超时）+ AskDock + `AgentAnswerAsk`；计划步骤 `ask_user` 动作已接 |
| episodic 摘要（MEDIUM-3） | ✅ | `SummarizeSession`（≥4 条消息+30 分钟去重，episodic+semantic 双写，Meta 列） |
| 子代理工具循环 | ✅ | runner 升级为 4 轮工具调用自主循环（此前无工具），`subagent_send/interrupt/wait` 齐全 |
| 目标自动循环 | ✅ | `StartGoalLoop`（轮次推进、[GOAL_COMPLETED]/[GOAL_BLOCKED:] 识别、暂停/恢复/停止） |
| 计划控制 | ✅ | 批准/取消（`AgentCancelPlan`）/单步重试（`AgentRetryPlanStep`）/LLM 诊断结论报告 |
| 步骤变量渲染 | ✅ | `{{step_id.output.key}}` 模板，支持跨步骤数据流 |
| 多协议工具 | ✅ | workspace/ssh/websearch/redis/mysql/mongo/sqlite/mqtt/http + 编排（job/subagent/goal/workflow/skill/memory/ask） |
| 审计与授权记忆 | ✅ | 全工具审计落库；30 分钟会话授权记忆；审批队列 |
| MQTT 订阅取消息 | ❌ | `mqtt_subscribe_once` 仅注册订阅并返回成功字符串，**模型无法读取订阅到的消息**（消息只推前端），工具语义名不副实 |
| 工作流脚本 DSL | ◐ | 用 JSON spec（`workflow_create` + `RunWorkflow` 串行执行）替代了设计的脚本 DSL，可满足基本场景 |
| 向量/FTS 检索 | ◐ | 记忆检索用 LIKE（设计文档标注向量为可选增强，可接受） |

### 2.2 前端功能清单

| 功能 | 状态 | 说明 |
| :--- | :--- | :--- |
| 聊天 + 步骤时间线 | ✅ | 流式、思考、工具步骤、错误/通知 |
| 计划视图 | ✅ | 批准/取消/单步重试/步骤展开详情/风险徽标/执行中/失败态 |
| 审批中心 | ✅ | 拒绝/允许单次/记住本会话 30 分钟，字段对齐 |
| AskDock | ✅ | 选项+自定义输入+取消 |
| 作业面板 | ✅ | 列表/进度/输出/kill |
| 目标/子代理/审计/技能/记忆 | ✅ | Inspector 侧栏齐备 |
| 会话管理 | ✅ | 新建/删除/切换/消息持久化 |
| 设置页 | ✅ | 思考模式/verifier 开关/并行度/工作区/权限开关 |

**完整度统计**：后端 14/16 项完全或基本实现（2 项部分），前端 8/8 项实现。总体 **≈ 90%**。

---

## 三、代码质量检查（分级问题清单）

### 3.1 后端 Go

| 编号 | 级别 | 问题 | 位置 |
| :--- | :--- | :--- | :--- |
| Q-M1 | 🟡 MEDIUM | **换招机制无效**：`classifyFailure` 判 Permanent 后仅向 args 注入 `_fix_suggestion/_previous_error`，工具（InferTool）解析时忽略未知字段 → 实际以相同参数重试。应让 Verifier 产出可执行的参数修正（如路径/连接修正），或将换招改为"追加错误上下文后交给模型重新生成步骤" | `executor/retry.go:102-117` |
| Q-M2 | 🟡 MEDIUM | **MQTT 订阅工具无法取消息**：`mqtt_subscribe_once` 只 `Subscribe` 返回成功，模型拿不到消息内容；且无取消订阅工具 | `tools/mqtt.go:47-61` |
| Q-M3 | 🟡 MEDIUM | `LocalExecutor` 用 `io.MultiReader(stdout, stderr)` **串行读**：stdout 未 EOF 前 stderr 不读，输出顺序失真、大 stderr 可能延迟/阻塞。应双 goroutine 并发读再按时间合并（或按行交错） | `job/executor.go:95-114` |
| Q-M4 | 🟢 LOW | `job.Wait` / `subagent.Wait` 用 100ms 轮询（违反 Harness"完成即通知"纪律）；建议改为事件/channel 通知 | `job/job.go:328`、`subagent/subagent.go:292` |
| Q-M5 | 🟢 LOW | `executor.go` `case "job"` 的 fallback 调用不存在的工具 `"exec_command"`（死路径，jobMgr 恒装配） | `executor/executor.go:357` |
| Q-M6 | 🟢 LOW | 事件名命名风格不一致：`EventAskUser = "ask_user"`（小写）vs 其余 PascalCase，迫使前端大小写双 case 匹配 | `events/events.go:30` |
| Q-M7 | 🟢 LOW | `goal.AdvanceRound` 的 `roundSummary` 参数始终未使用（死参数）；`blockTracker` 未按"同一具体阻塞条件"计数 | `goal/goal.go:88-136` |
| Q-M8 | 🟢 LOW | `memory.SaveEpisodic` 生产代码未调用（`SummarizeSession` 直接写 store）——半死代码 | `memory/memory.go:127` |
| Q-M9 | 🟢 LOW | `Session.BuildRunner` 每轮对话重建 ADK Runner；`StreamChat` 内 `onChunk` 回调与 EventBus 双通道并存（当前 app_agent 传空回调，未来误用会双发） | `session.go:65`、`agent.go:444-517` |
| Q-M10 | 🟢 LOW | `guardWrappedEinoTool.Invoke` 传空 `traceID`，聊天链路审计无链路关联；`http_request_readonly` 无域名白名单（内网 SSRF 面） | `tools/bus.go:277`、`tools/http.go:30` |

### 3.2 前端 TypeScript / React

| 编号 | 级别 | 问题 | 位置 |
| :--- | :--- | :--- | :--- |
| Q-F1 | 🟡 MEDIUM | `AiAgentPanel.tsx` 单文件 **1951 行**：事件订阅、动作处理、消息/计划/审批/询问/作业/目标/子代理/审计/技能渲染全部内聚一文件，建议按 `hooks/`、`components/`、`views/` 拆分 | `pages/agent/AiAgentPanel.tsx` |
| Q-F2 | 🟢 LOW | 消息保存 `agentSaveSessionMessages`（全量 `ReplaceMessages`）在 done/step_finished/plan 更新等 5+ 处重复触发，长会话写库放大；建议节流或增量追加 | `AiAgentPanel.tsx:745, 788, 803...` |
| Q-F3 | 🟢 LOW | 统一流 switch 大小写双 case（`'GoalUpdated'/'goal_updated'`）是后端命名不一致的补偿，后端统一后可清理 | `AiAgentPanel.tsx:684-702` |
| Q-F4 | 🟢 LOW | `subscribe` 实现正确（handler 级清理、EventsOff 仅当集合空）；但 `consumePendingAsk` 旧通道遗留（新 AskDock 不再使用），可删 | `api.ts:580-590` |

### 3.3 测试质量（良好）

- 14 个测试覆盖：Store CRUD / 权限+授权记忆 / **guard 包装工具链路（审批+审计）** / Job / Goal / Skills / Workflow / Verifier / **LocalExecutor** / **BuildDAG（4 用例）** / **ExecuteDAGParallel** / **AskManager** / **MemoryRecall** / **RenderStepArgs+动作执行**；
- 缺：`job_submit` 高危拦截集成测试、`SubmitExec` 端到端、`ExecuteDAG` 失败层终止语义、前端组件测试（无测试框架）。

---

## 四、验证结果汇总

| 项 | 结果 |
| :--- | :--- |
| `go build ./...` | ✅ 0 错误 |
| `go vet ./...` | ✅ 0 告警 |
| `go test ./agent/...` | ✅ 14/14 通过（3.5s） |
| 前端 `tsc --noEmit` | ✅ 0 错误 |
| wailsjs 绑定 | ✅ 已重新生成（含 AgentAnswerAsk/CancelPlan/RetryPlanStep/SendSubagent/InterruptSubagent/GetJob/KillJob） |

---

## 五、结论与建议优先级

**结论**：本次实现（含 MEDIUM-1/2/3 的后端落地）**架构合理、功能完整、质量良好**，已具备联调试用条件。三项遗留 MEDIUM 中，作业执行、DAG 并行、ask_user、episodic 摘要均已实现并有测试；仅"换招"与"MQTT 取消息"两项仍不完整。

**建议修复优先级**：

| 优先级 | 项 | 工作量 |
| :--- | :--- | :--- |
| P1（功能正确性） | Q-M1 换招机制改为真实参数修正或模型重生成；Q-M2 MQTT 增加 `mqtt_get_messages` 或改 `subscribe_once` 为阻塞取一条 | 中 |
| P2（健壮性） | Q-M3 双管道并发读；Q-M4 Wait 改事件通知 | 小 |
| P3（可维护性） | Q-F1 前端拆文件；Q-M6 事件命名统一；Q-M5/Q-M7/Q-M8 清理死代码 | 中 |
| P4（补测试） | job_submit 高危拦截、SubmitExec 端到端、ExecuteDAG 失败终止语义 | 小 |

---

*检查方式：全量代码走读 + 前后端协议比对 + 设计对照 + 构建/静态检查/单测/类型检查验证。*
