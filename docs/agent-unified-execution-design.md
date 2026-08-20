# xAgent 统一执行内核（UTEK）改造设计 —— 解决双执行路径 / 双单例 / Runner 重建

| 项目 | 内容 |
| :--- | :--- |
| 文档版本 | v0.1（设计草案） |
| 依据 | `docs/agent-implementation-review.md` §1.1 遗留的 3 个架构问题 + 连带发现 |
| 目标形态 | 聊天与计划收敛为**同一条回合管线**；运行时单例唯一；Runner 按配置缓存复用 |

---

## 0. 要解决的三个问题与连带发现

| # | 问题 | 现状代码 | 影响 |
| :--- | :--- | :--- | :--- |
| P1 | **双执行路径并存** | 聊天：`AgentSend → StreamChat → runner.Run`（裸 ADK ReAct）；计划：`AgentProposePlan → PlanGate → ExecuteDAG`（旁路） | 普通聊天无规划/验证/DAG/重试；计划路径无流式对话、上下文不延续；两套行为不一致 |
| P2 | **双单例职责重叠** | `agent/agent.go` 的 `AgentManager`（DefaultManager）+ `agent/runtime.go` 的 `AgentRuntime`（DefaultRuntime）并存 | `InitOrUpdate`/`SetContext` 双写；`Storage` 壳；新能力只能挂 Runtime，旧逻辑无人清理 |
| P3 | **Runner 每轮重建** | `Session.BuildRunner` 在 `StreamChat`/`InitOrUpdate` 每次调用都 `adk.NewChatModelAgent + NewRunner` | 无意义的重复构建开销；且 `app_agent.go` 每次请求都调 `SetManagers` → 工具重复注册 |
| P4（连带） | **系统提示双重注入** | `BuildRunner` 的 `Instruction: s.Settings.AiSystemPrompt` + `buildSchemaMessages` 又注入一次 SystemMessage | 相同系统提示出现两遍，浪费 token 且可能弱化指令 |

**设计目标**：
1. 任何用户输入 = 一次**回合（Turn）**，经统一管线处理；计划能力成为模型**可调用的内部工具**，聊天自然获得 DAG/验证/重试；
2. `AgentManager`/`Storage` 退役为薄兼容壳并最终删除，逻辑全部收敛到 `Runtime`/`Session`，Wails API 签名不变（前端零改动）；
3. `Runner` 按"模型配置 + 工具集指纹"缓存，幂等注册不导致失效；同一会话串行回合。

---

## 1. 总体架构：统一回合管线（Turn Pipeline）

```
用户输入 (聊天文本 / /plan / /goal / 模型内部 plan_propose)
        │
        ▼
┌──────────────────────────── Turn Pipeline (Runtime.HandleTurn) ───────────────────────────┐
│  1. 意图分流 resolveMode (显式 / 启发式 / 可选模型)  ── chat │ plan │ goal                 │
│  2. 上下文组装 Session.BuildMessages (唯一系统提示注入点 + 记忆召回)                        │
│  3. 模式分发                                                                              │
│     chat  ──► Runner(缓存).Run ── ReAct 循环（模型可调用 plan_propose 转计划）            │
│     plan  ──► Planner.GeneratePlan ── PlanGate(确认门) ── Executor.ExecuteDAG(并行+重试)  │
│     goal  ──► GoalEngine.StartGoalLoop (已有，保持)                                       │
│  4. 验证与汇报 (Verifier + LLM 诊断报告 → EventDone)                                       │
└────────────────────────────────────────────────────────────────────────────────────────────┘
```

核心思想：**不保留两条路径，而是让"计划"成为回合管线内的一种执行模式 + 一个内部工具**。模型的 ReAct 循环与 Executor 的 DAG 循环通过"工具调用 → 结果回流"连接，上下文天然延续。

---

## 2. 模块设计

### 2.1 回合模型与意图分流（新文件 `agent/turn/turn.go`）

```go
package turn

type TurnMode string

const (
    TurnModeAuto TurnMode = "auto" // 默认：启发式分流，未命中则 chat
    TurnModeChat TurnMode = "chat"
    TurnModePlan TurnMode = "plan"
)

type TurnRequest struct {
    SessionID string
    Mode      TurnMode
    Messages  []FrontendMessage // 完整上下文（含新用户消息）
    Objective string            // plan 模式显式目标
}

type TurnResult struct {
    FullText    string
    Reasoning   string
    Notice      string
    Plan        *planner.Plan // 若生成了计划
    PlanResults []*executor.StepResult
}
```

**意图分流 `resolveMode`**（`Runtime.HandleTurn` 内）：

```go
func resolveMode(req TurnRequest, cfg core.AppSettings) TurnMode {
    if req.Mode == TurnModeAuto {
        // 显式前缀（前端已处理 /plan /goal，此处兜底）
        if strings.HasPrefix(trimmed, "/plan ")  { return TurnModePlan }
        if strings.HasPrefix(trimmed, "/goal ")  { return TurnModeGoal }
        // 启发式：多步运维任务信号词 + 目标非空
        if cfg.AiAutoPlan && looksMultiStep(req.LastUserContent()) { return TurnModePlan }
    }
    return req.Mode
}
```

- `looksMultiStep`：信号词表（巡检/排查/部署/迁移/对比/搭建/优化/分析…）+ 目标长度阈值（> 40 字）+ 句内多个动词，命中则 plan；
- **默认 `AiAutoPlan=false`**（保持现行为：聊天永远 chat，plan 由 `/plan` 或模型内部 `plan_propose` 触发），auto 作为可选设置，避免改变用户习惯；
- 分流结果写入事件（`EventNotice` 或 plan 卡片标题），用户可感知。

### 2.2 统一 Turn Pipeline（`Runtime.HandleTurn`）

```go
// agent/runtime.go 新增（取代 app_agent.go 的 AgentSend 直调 StreamChat）
func (rt *AgentRuntime) HandleTurn(
    ctx context.Context,
    req turn.TurnRequest,
    onChunk, onReasoning func(string),
) (*turn.TurnResult, error) {

    sess := rt.GetOrCreateSession(req.SessionID)
    sess.TurnMu().Lock()          // 同一会话串行回合（防止 Runner 并发 Run）
    defer sess.TurnMu().Unlock()

    mode := resolveMode(req, rt.cfg)
    traceID := fmt.Sprintf("turn_%d", time.Now().UnixNano())

    switch mode {
    case turn.TurnModePlan:
        return rt.runPlanTurn(ctx, sess, req, traceID)     // §2.3
    case turn.TurnModeGoal:
        return rt.runGoalTurn(ctx, sess, req, traceID)     // 委托 GoalEngine.StartGoalLoop
    default: // chat
        return rt.runChatTurn(ctx, sess, req, traceID, onChunk, onReasoning) // §2.4
    }
}
```

### 2.3 计划回合（`runPlanTurn`）—— 迁移自 `AgentProposePlan + AgentApprovePlan`

```go
func (rt *AgentRuntime) runPlanTurn(ctx, sess, req, traceID) (*turn.TurnResult, error) {
    // 1. 规划
    plan, err := rt.Planner.GeneratePlan(ctx, req.SessionID, req.Objective, rt.ToolBus.Describe())
    if err != nil { return nil, err }
    rt.PlanGate.Submit(plan)
    rt.EventBus.Emit(events.Event{Type: EventPlanProposed, SessionID: req.SessionID, Payload: plan})

    // 2. 确认门（NeedConfirm 时阻塞等待前端 AgentApprovePlan，复用 guard 审批等待模式，5 分钟超时）
    if plan.NeedConfirm {
        approved, cancelReason := rt.PlanGate.AwaitApproval(ctx, plan.ID)   // 新增方法
        if !approved {
            rt.EventBus.Emit(EventDone, "⏹️ 规划未获批准，已取消执行。")
            return &turn.TurnResult{FullText: "规划未获批准，已取消执行。"}, nil
        }
    }

    // 3. DAG 执行（并行+重试+验证，复用现有 Executor）
    results, execErr := rt.Executor.ExecuteDAG(ctx, traceID, plan, nil)

    // 4. LLM 诊断报告（迁移自 AgentApprovePlan 内嵌逻辑 → Executor.Summarize）
    report := rt.Executor.Summarize(ctx, plan, results, execErr)
    rt.Store.AddMessage(store.MessageItem{SessionID: plan.SessionID, Role: "assistant", Content: report})
    rt.EventBus.Emit(events.Event{Type: EventDone, SessionID: plan.SessionID, Payload: DonePayload{Content: report}})
    return &turn.TurnResult{FullText: report, Plan: plan, PlanResults: results}, nil
}
```

要点：
- `AgentProposePlan`/`AgentApprovePlan`/`AgentCancelPlan`/`AgentRetryPlanStep` **Wails API 保留**（前端已用），内部改为委托 `HandleTurn`/`Executor`，签名不变；
- 计划执行结果经 `EventDone` 与 Store 写入，聊天消息流中已有 `MessagePlanCard` 渲染（`msg.plan.summary`），前端零改动；
- 取消（`AgentCancelPlan` → `PlanGate.Cancel`）使 `AwaitApproval` 与执行中的 ctx 同时取消。

### 2.4 聊天回合（`runChatTurn`）—— 迁移 `StreamChat`

```go
func (rt *AgentRuntime) runChatTurn(ctx, sess, req, traceID, onChunk, onReasoning) (*turn.TurnResult, error) {
    // 1. 上下文压缩（迁移自 applyContextCompression，归属 memory 层）
    compressed, notice := rt.Memory.Compress(ctx, sess, req.Messages, rt.cfg)

    // 2. 上下文组装（唯一系统提示注入点，见 §2.6）
    schemaMsgs := sess.BuildMessages(compressed, rt, traceID)

    // 3. 复用缓存 Runner（见 §2.5）
    runner, err := sess.EnsureRunner(ctx, rt.Router, rt.ToolBus)
    if err != nil { return nil, err }

    // 4. ReAct 流式循环（现有 StreamChat 的 chunk/reasoning 归一化逻辑原样迁移）
    iter := runner.Run(ctx, schemaMsgs)
    full, reasoning := drainStream(ctx, iter, onChunk, onReasoning, sess)
    return &turn.TurnResult{FullText: full, Reasoning: reasoning, Notice: notice}, nil
}
```

### 2.5 Runner 缓存（`session.go` 改造）

```go
type Session struct {
    ...
    runner    *adk.Runner
    runnerKey string   // 缓存键
    turnMu    sync.Mutex
}

// EnsureRunner 按缓存键复用 Runner；Instruction 不再参与构建（见 §2.6）
func (s *Session) EnsureRunner(ctx context.Context, r *router.ModelRouter, tb *tools.ToolBus) (*adk.Runner, error) {
    key := runnerCacheKey(r, tb)
    s.mu.Lock()
    defer s.mu.Unlock()
    if s.runner != nil && s.runnerKey == key {
        return s.runner, nil
    }
    resolved, err := r.Resolve(ctx, router.RoleDefault)
    if err != nil { return nil, err }
    runner, err := buildRunner(ctx, s.ID, resolved.Model, tb, s.Settings.AiSystemPrompt /* 不再传入 */)
    if err != nil { return nil, err }
    s.runner, s.runnerKey = runner, key
    return runner, nil
}

// 缓存键：模型 profile 哈希 + 工具集指纹；系统提示不参与（动态内容走消息注入）
func runnerCacheKey(r *router.ModelRouter, tb *tools.ToolBus) string {
    return r.ProfileHash(router.RoleDefault) + "|" + tb.Fingerprint()
}
```

配套（`tools/bus.go`、`router/router.go` 各加一个方法）：

```go
// ToolBus.Fingerprint：工具名+描述排序后哈希；Register 幂等覆盖同名 → 指纹不变
func (b *ToolBus) Fingerprint() string {
    names := sortedKeys(b.tools)
    h := sha256.New()
    for _, n := range names { h.Write([]byte(n + "\x00" + b.tools[n].Description + "\x00")) }
    return hex.EncodeToString(h.Sum(nil)[:16])
}

// ModelRouter.ProfileHash：baseURL/model/apiKey/thinking/effort/temp 序列化哈希
func (r *ModelRouter) ProfileHash(role ModelRole) string { ... }
```

缓存失效规则：
| 事件 | 指纹/哈希 | 缓存 |
| :--- | :--- | :--- |
| `SetManagers` 重复调用（幂等注册） | 工具集指纹不变 | **命中**（解决现状：每次请求 SetManagers 导致重建） |
| 新增/删除工具（注册新协议） | 指纹变化 | 失效重建 |
| 修改模型配置（API Key/模型/思考模式） | profile 哈希变化 | 失效重建 |
| 修改 System Prompt | 不参与键 | **不重建**（动态内容走消息注入） |

### 2.6 系统提示注入统一（顺带修复 P4）

- `buildRunner` 的 `Instruction` **置空**（或固定为 `"你是 xClient 智能运维助手"`，不含用户可配置内容）；
- 全部动态上下文（用户 System Prompt、当前时间、工作区、已连通 SSH 会话、ask_user 规范、记忆召回段）收敛到 `Session.BuildMessages`（迁移自 `buildSchemaMessages`）的唯一 SystemMessage；
- 收益：① 消除双注入；② Runner 缓存键稳定（不随系统提示变）；③ 记忆召回/会话上下文变化不再触发重建。

### 2.7 计划作为模型内部工具（打通聊天与 DAG 的关键）

在 `tools/orchestration.go` 注册两个**内部工具**（不展示给用户工具列表的 UI，但模型可见）：

```go
// plan_propose —— 模型在聊天中遇到多步任务时主动转计划
plan_propose(objective string) → {plan_id, objective, step_count, risk_level, steps_brief}
  实现：rt.Planner.GeneratePlan → rt.PlanGate.Submit → EventBus.Emit(EventPlanProposed)
        → 返回计划摘要（模型据此转述给用户，等待前端批准）
  Level: allow（只读生成，不执行）

// plan_execute —— 执行已批准/待批准的计划，结果回流上下文
plan_execute(plan_id string) → 执行报告（截断 8KB）
  实现：if plan.NeedConfirm && !approved → PlanGate.AwaitApproval（阻塞，5 分钟超时）
        → Executor.ExecuteDAG → Executor.Summarize → 返回报告文本
  Level: confirm
```

**模型提示词补充**（BuildMessages 注入）："当用户请求包含多个相互关联的运维步骤时，可调用 `plan_propose` 生成执行计划，待用户批准后调用 `plan_execute` 执行。"

效果：
- 聊天 ReAct 循环中模型自然地把复杂任务拆成计划 → 前端弹出计划卡片（复用 `MessagePlanCard` + `plan_proposed` 事件，零前端改动）→ 用户批准 → 执行结果作为 **tool result 回流模型** → 模型基于真实数据继续总结/追问；
- 计划能力对聊天路径完全开放，P1 解决；
- `plan_propose` 有 `AiAutoPlan` 之外的另一触发面：**由模型自主决策**，比启发式更准。

### 2.8 单例合并（P2）

| 阶段 | 动作 |
| :--- | :--- |
| A | `AgentManager` 变**薄门面**：`StreamChat`/`buildSchemaMessages`/`applyContextCompression` 迁入 `Runtime`/`Session`/`memory`；`DefaultManager` 方法全部委托 `DefaultRuntime` |
| B | 删除 `AgentManager`/`DefaultManager`/`Storage` 壳（`agent/agent.go` 仅保留 `FrontendMessage`/`ProcessStep`/`ToolCallItem` 等 DTO）；`app_agent.go` 全部改调 `DefaultRuntime` |
| C | 兼容清理：`AgentGetHistory` 等旧方法保留（委托 Store），标记 deprecated；前端 `wailsjs` 绑定不变 |

关键点：**Wails API 签名（`AgentSend` 等）一个都不变**，前端无需改动；`InitOrUpdate`/`SetContext` 双写消除，`SetManagers` 收敛为幂等注册（配合指纹缓存）。

---

## 3. 前后端协议变更

| 项 | 变更 | 前端影响 |
| :--- | :--- | :--- |
| 事件 | 无新增（复用 `PlanProposed`/`StepStarted`/`StepFinished`/`Done`/`AskUser`） | 无 |
| Wails API | 签名不变；`AgentProposePlan`/`AgentApprovePlan`/`AgentCancelPlan`/`AgentRetryPlanStep` 内部委托新管线 | 无 |
| 内部工具 | `plan_propose`（allow）/ `plan_execute`（confirm）加入 ToolBus | 计划卡片复用现有 `MessagePlanCard`（`msg.plan` 已支持） |
| 设置 | 新增 `AiAutoPlan`（默认 false） | 设置页加一个开关（可选） |

---

## 4. 数据模型变更

无表结构变更。可选增强：`plans` 表持久化计划与步骤结果（便于历史回放），作为 Phase D 之后的可选项，本期不做。

---

## 5. 迁移步骤（分 4 步，每步可独立回归）

| 步骤 | 内容 | 验收 |
| :--- | :--- | :--- |
| **A. 内核统一** | 新建 `turn` 包与 `HandleTurn`；`StreamChat` 迁入 `runChatTurn`；`AgentSend` 委托；`PlanGate.AwaitApproval`/`Cancel` | 聊天与 /plan 功能回归全绿；无行为变化 |
| **B. Runner 缓存** | `EnsureRunner` + `Fingerprint`/`ProfileHash` + `turnMu`；`Instruction` 置空、`BuildMessages` 唯一注入（修复 P4） | 连续两次聊天：第二次不重建 runner（打点验证）；系统提示不再双注入 |
| **C. 单例合并** | 删 `AgentManager`/`Storage` 壳；`app_agent.go` 直调 Runtime；清理死代码 | `go build/vet/test` 全绿；前端全功能回归 |
| **D. 计划工具** | 注册 `plan_propose`/`plan_execute`；模型提示词补充；`AiAutoPlan` 设置项 | 聊天中模型可自主发起计划并执行；结果回流上下文 |

---

## 6. 风险与对策

| 风险 | 等级 | 对策 |
| :--- | :--- | :--- |
| 模型过度调用 `plan_propose` 打断体验 | 中 | 提示词约束"仅多步任务"；`plan_propose` 只读成本低；`AiAutoPlan` 独立开关 |
| `plan_execute` 阻塞等批准卡住回合 | 中 | 复用审批 5 分钟超时 → 返回"未批准"文本，模型继续；用户可取消（`AgentCancelPlan`） |
| Runner 并发 Run 状态错乱 | 中 | `Session.turnMu` 串行回合；前端 `isGenerating` 已禁用重复发送 |
| 指纹计算开销 | 低 | 工具 ≤ 50，sha256 廉价；仅在 `EnsureRunner` 调用时计算 |
| 兼容期双代码路径回归 | 中 | 步骤 A→C 每步回归；facade 标记 deprecated 一个版本后删除 |
| Runner 缓存持有旧模型实例（API Key 轮换） | 低 | profile 哈希含 APIKey，变化即失效 |

---

## 7. 测试计划（新增）

| 用例 | 覆盖 |
| :--- | :--- |
| `TestEnsureRunnerCache` | 相同配置命中；profile 变更失效；工具注册幂等后指纹不变仍命中 |
| `TestBuildMessagesSingleSystem` | 结果中 SystemMessage 恰好 1 条（修复 P4） |
| `TestResolveMode` | 显式/前缀/启发式/默认 chat 分流正确 |
| `TestPlanProposeTool` | 调用 `plan_propose` → 返回 plan_id+摘要 + 发 `PlanProposed` 事件 |
| `TestPlanExecuteAwaitApproval` | 未批准阻塞超时返回"未批准"；批准后执行并回流报告 |
| `TestHandleTurnChatRegression` | AgentSend 委托后聊天流式输出与历史行为一致 |
| `TestTurnMuSerial` | 同会话并发回合被串行化 |

---

## 8. 验收标准

1. 聊天中输入"帮我排查 3 台服务器的磁盘并对比"（多步任务）：模型可自主调用 `plan_propose` → 前端出现计划卡片 → 批准后 DAG 并行执行 → 诊断报告回流聊天上下文，**全程不离开聊天窗口**；
2. `/plan` 显式模式行为与现状一致（回归）；
3. 连续多轮聊天不再重建 Runner（可通过日志/打点确认）；
4. 系统提示在最终请求中仅出现一次；
5. `agent/agent.go` 中不再存在 `AgentManager`（仅 DTO）；
6. `go build / go vet / go test ./agent/...` 全绿，前端 `tsc --noEmit` 通过，`wailsjs` 绑定无 diff 或仅新增无删改。

---

*本文档为统一执行内核的设计依据；实现后按 §7 补测试，并在 `docs/agent-implementation-review.md` 关闭对应遗留项（R1 双路径 / R2 双单例 / R3 Runner 重建 / P4 双注入）。*
