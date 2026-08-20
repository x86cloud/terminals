# xAgent 第三轮实现检查（8/20 改动后）：合理性 / 完整性 / 改进空间

| 项目 | 内容 |
| :--- | :--- |
| 检查基线 | 上轮（`docs/agent-implementation-review.md`）之后的增量改动（8/19-8/20） |
| 主要增量 | 前端组件化拆分、`agent/shell` 跨平台流式 Shell、`execute` 工具、eino 风格文件工具集（read_file/create_file/apply_file_patch…）、eino skill 中间件、文件系统技能、ask_user 完整接通 |
| 验证 | `go build` ✅ / `go vet` ✅ / `go test ./agent/...`（**17 个测试**）✅ / `tsc --noEmit` ✅ |

---

## 一、本轮改动亮点（已确认修复/新增）

| 项 | 说明 |
| :--- | :--- |
| ✅ 前端组件化（Q-F1 修复） | `AiAgentPanel.tsx` 1951 行 → **350 行骨架**，拆出 7 components + 4 hooks（useAgentEvents 22KB / useAgentComposer / useAgentInspector / useAgentSessions）+ views/AgentInspectorDrawer |
| ✅ 本地 Shell 重构（Q-M3 修复） | 新增 `agent/shell`：双管道**并发读**（替代 io.MultiReader 串行）、1MB 输出截断、跨平台进程树杀（proc_unix/proc_windows）、退出码提取、前/后台双模式，实现 eino `filesystem.StreamingShell` |
| ✅ 代码编辑工具升级 | `read_file`（行号切片）/ `create_file`（overwrite 保护）/ `apply_file_patch`（唯一匹配替换）/ `move_file` / `list_dir`（树形+depth+ignore）/ `search_files`，对齐 eino 生态 |
| ✅ 技能生态文件化 | `SkillsRegistry` 支持 SKILL.md + YAML FrontMatter 解析；`Session.BuildRunner` 挂载 eino skill middleware（从 skills 目录自动加载）；新增 `AgentGetSkillsDir/AgentOpenSkillsDir` |
| ✅ ask_user 完整接通 | `AskManager` + SessionID 上下文透传（`WithSessionID`）+ 5 分钟超时 + 前端 AskUserDock |
| ✅ 审计增强 | `auditMysqlQuery` 支持解析 JSON 参数；`HighRiskCommandPatterns` 提取为共享模式表；`WithTraceID` 上下文 |
| ✅ goal 移除一致性 | goal 的 Wails API / 工具 / guard 规则 / 前端面板（Inspector 现有 jobs/subagents/audit/skills 四 tab）全部同步移除，无残留引用 |

---

## 二、实现合理性评估

### 后端 ★★★★☆（同上轮，但注意以下偏差）

- **合理**：shell 包与 eino 接口对齐（编译期断言）、文件工具 Schema 专业、技能中间件方案符合 eino 生态；
- **偏差 1 — 权限配置与工具危险度不匹配**（本轮新发现）：
  - `execute`（本地任意命令）Level=Confirm 但 **guard 规则表无此工具** → 走兜底 confirm，**未挂 `auditShellCommand`**（高危拦截只挂在 `ssh_exec_command`）。本地 `rm -rf /`、`mkfs`、`dd if=` 只会弹确认框，不会被自动拦截——**本地命令比远程更危险，反而缺防护**；
  - `create_file` / `apply_file_patch`（写文件）被设为 **LevelAllow** → 模型可**不经确认直接创建/修改工作区文件**（上轮 `workspace_write_file` 是 confirm）。`create_file` 有 overwrite 保护、patch 是精准替换，但仍属写操作，与"写操作默认确认"原则冲突；
- **偏差 2 — 上轮 UTEK 设计未落地**：`AgentSend` 仍走 `DefaultManager.StreamChat`（P1 双路径 / P2 双单例 / P3 Runner 每轮重建 / P4 系统提示双注入 均未实施；`docs/agent-unified-execution-design.md` 已交付未执行）。

### 前端 ★★★★★（本轮明显提升）

- 组件/hook 拆分彻底、职责单一、无残留 goal 引用；`useAgentEvents` 统一事件分发，`MessagePlanCard`/`AskUserDock`/`ApprovalDock` 独立成组件；
- 轻微：`useAgentEvents.ts`（22KB）与 `AgentInspectorDrawer.tsx`（29KB）仍偏大，可再拆（低优先级）。

---

## 三、功能完整性对照（相对设计文档与上轮）

| 功能 | 状态 | 变化 |
| :--- | :--- | :--- |
| 本地命令执行 | ✅ 新增且增强 | `execute`（同步/后台）+ `job_submit`（local/ssh）+ `agent/shell` 流式执行 |
| 代码编辑 | ✅ 升级 | eino 风格 6 工具（行号读取/精准 patch/树形目录） |
| 技能体系 | ◐ 形态变化 | 文件系统 SKILL.md + skill middleware 替代 DB 技能 + skill_load 工具；**内置 4 个 SOP 技能消失**（需用户自建） |
| ask_user | ✅ 完成 | 上轮占位 → 本轮完整接通 |
| **长期目标引擎** | ❌ **整体移除** | GoalEngine 代码保留但无生产调用方；Wails API/工具/规则/前端面板全部删除。**需确认是刻意简化还是误删**（设计文档中目标引擎是 L3 核心能力） |
| 计划/DAG/重试/验证 | ✅ 保留 | 无变化 |
| 作业/子代理/工作流/记忆/审计 | ✅ 保留 | 无变化 |
| UTEK 统一执行内核 | ❌ 未实施 | 设计文档已交付，四步迁移未执行 |

---

## 四、改进空间（按优先级）

### 🔴 安全改进（建议立即）

| # | 问题 | 现状 | 建议 |
| :--- | :--- | :--- | :--- |
| S1 | `execute` 本地命令**无高危拦截** | guard 规则表无 execute，`auditShellCommand` 仅挂 ssh_exec_command | guard 规则补 `execute`：`Level: Confirm, AuditFunc: g.auditShellCommand`（复用 HighRiskCommandPatterns） |
| S2 | `execute` 的 `Cwd` **未做工作区沙箱** | handler 中 `input.Cwd` 非空则直接用，未过 `ResolvePath`；模型可指定任意绝对路径执行 | Cwd 非空时先 `wm.ResolvePath` 校验，越界报错；或仅允许工作区相对路径 |
| S3 | `create_file`/`apply_file_patch` 写操作 **LevelAllow** | 免确认直接改文件 | 改为 LevelConfirm；或引入"已读文件才可改"（read-before-write）语义：patch 前要求先 read_file 过该文件 |

### 🟡 架构改进（按 UTEK 设计文档执行）

| # | 问题 | 建议 |
| :--- | :--- | :--- |
| A1 | 双执行路径并存 | 落地 `Runtime.HandleTurn` 统一管线 + `plan_propose/plan_execute` 内部工具（设计文档 §2.3/§2.7） |
| A2 | 双单例重叠 | 删 `AgentManager`/`Storage` 壳，`app_agent.go` 直调 Runtime（设计文档 §2.8） |
| A3 | Runner 每轮重建 + 系统提示双注入 | `EnsureRunner` 指纹缓存 + Instruction 置空、`BuildMessages` 唯一注入（设计文档 §2.5/§2.6） |

### 🟡 功能决策与清理

| # | 问题 | 建议 |
| :--- | :--- | :--- |
| F1 | goal 功能整体移除 | 明确决策：若保留，恢复 Wails API + 工具 + 前端 GoalView；若下线，删除 `goal/goal.go` 死代码（含 blockTracker/cancelMap）与相关测试 |
| F2 | guard 规则表与工具表不同步 | 清理死规则（`skill_load`/`skill_list`）；补 execute 规则（S1）；核对 db/ssh 工具全量 |
| F3 | 双技能体系并存 | Filesystem skills（skill middleware）与 store skills（表仍存在）职责不清；确认以文件系统为准后移除 store skills 代码路径 |

### 🟢 质量改进

| # | 问题 | 建议 |
| :--- | :--- | :--- |
| Q1 | `LocalStreamingShell.Execute` 同步模式 stdout/stderr 并发顺序不确定（`isStderr` 参数未用） | 可接受（终端合并输出）；如需区分可加前缀标记 |
| Q2 | `execute` 高频工具每次 Confirm 打扰 | 结合授权记忆（30 分钟）可接受；可提供"本会话信任 execute" |
| Q3 | 内置技能消失 | 在 `%APPDATA%/xClient/skills/` 预置 4 个 SKILL.md（server-troubleshooting 等），保持开箱即用 |
| Q4 | `app_agent.go` AgentSend 每次调用 `SetManagers` 重复注册 | UTEK-A2/A3 落地后随单例合并消除；临时可加幂等短路 |

---

## 五、结论

**本轮增量质量高**：前端组件化、shell 跨平台实现、文件工具升级、skill 中间件均属优秀实现，且 17 个测试与类型检查全绿。

**但存在 1 项安全缺口（S1 execute 无高危拦截）、2 项权限配置偏差（S2 Cwd 沙箱、S3 写文件 allow）与 1 项重大功能变化（goal 移除），以及上轮已交付的 UTEK 架构设计尚未实施。**

**建议行动顺序**：
1. 立即修 S1/S2/S3（安全，合计约 1 小时工作量）；
2. 明确 goal 去留（F1）；
3. 按 `docs/agent-unified-execution-design.md` 执行 UTEK 四步迁移（A1-A3）；
4. 清理 guard 死规则与双技能路径（F2/F3）。

---

*检查方式：增量代码走读 + 前后端协议比对 + 构建/静态检查/单测（17 项）/类型检查验证。*
