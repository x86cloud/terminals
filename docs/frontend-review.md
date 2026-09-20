# 前端架构与规范审查报告（React + TypeScript）

> 审查范围：`frontend/src/`（265 个文件 / 58,706 行，其中 `.tsx` 141 个、`.less` 89 个、`.ts` 26 个）、`frontend/bindings/`（Wails v3 自动生成绑定，54 个文件）、`package.json` / `tsconfig.json` / `vite.config.ts`。
> 审查基线：React 官方 Hooks 约定 + TypeScript 严格模式 + 前端工程化惯例。
> 审查方式：`tsc --noEmit` 实跑、模块依赖图构建、跨文件逐字重复度比对（行级 `Compare-Object`）、反模式全量计数与逐条核验、与 Go 后端绑定交叉比对。
> 审查日期：2026-09-20。**未修改任何源代码。**

**总体结论**：前端**可编译、可运行、结构清晰**——`tsc --noEmit` 零报错、`src/` 目录按「协议页面」切分得当、组件库（antd v6 + xterm + codemirror）选型合理、`ErrorBoundary` 逐页包裹做得很到位、样式令牌体系（`variables.less` 55 个 token + `mixins.less`）已经建立。

但存在**四个结构性问题**，且它们互相放大：

1. **类型安全在 API 边界被整体放弃**——`strict: true` 与 184 处 `as any` 并存，`api.ts` 用手工类型标注覆盖了自动生成的绑定类型，使编译器无法发现任何契约漂移；
2. **MySQL / PostgreSQL 两套页面是复制粘贴的克隆**——核心组件最大 446 行逐字相同、样式文件 259/347 行逐字相同，且已经各自漂移；
3. **状态层无任何渲染优化**——`React.memo` 全仓零使用，`SessionContext` 的 value 是内联对象字面量，导致任何一处状态变更都会让全部消费者重渲染；
4. **无竞态保护**——全前端 `AbortController` 零使用、`ignore` 标志零使用，而共有 121 个 `useEffect` 在发起异步请求。

另有一处需要澄清的**流程错配**：通用审查提示词假设「已有 Linter 处理格式问题」，但本前端**不存在任何 ESLint / Prettier / EditorConfig 配置**。因此本报告保留了对格式化基础设施缺失的说明（见 #15），但**不逐条列举格式差异**。

---

## 结论速览

| # | 问题 | 层级 | 性质 | 优先级 |
|---|------|------|------|--------|
| **36** | **跨会话事件污染：默认会话激活时收下所有会话事件，A 会话内容被持久化进默认会话历史** | agent/hooks | **数据污染** | **P0** |
| **37** | **"对选中内容问 AI"是死功能：生产 `agent:ask` vs 订阅 `ai_agent:ask`，事件名不一致** | App/terminal | **功能失效** | **P0** |
| 1 | `api.ts` 用 `as any` + 手工类型标注覆盖自动生成绑定 | api/契约 | 类型安全 | **P0** |
| 2 | 184 处 `as any`、322 处 `: any`，且 `noImplicitAny: false` | 全仓 | 类型安全 | **P0** |
| 3 | MySQL↔PostgreSQL 页面是复制粘贴克隆（DataTab 446 行逐字相同） | pages | 重复 | **P0** |
| 4 | MySQL↔PostgreSQL 样式文件同样克隆（DataTab.module.less 259/347 行相同） | styles | 重复 | **P0** |
| 5 | 全前端零 `AbortController`、零取消标志，121 个 useEffect 发请求 | 全仓 | 竞态 | **P0** |
| 6 | `SessionContext` value 为内联对象字面量且 `React.memo` 零使用 | contexts | 性能 | **P0** |
| 7 | `mysql/DataTab.tsx:249` 将 `pageSize` 直接插值进 SQL `LIMIT` | pages | 注入 | P1 |
| 8 | `pages/mongo/` 下 6 个 Tab 组件共 1,155 行完全零引用 | pages | 死代码 | P1 |
| 9 | `api.ts` 是 359 方法的 God object（913 行） | api | SRP | P1 |
| 10 | `(X as any).Method ? ... : fallback` 守卫在类型下恒为真——18 处不可达防御分支 | api | 契约 | P1 |
| 11 | 无 i18n：4,257 处中文字面量散落 149 个文件 | 全仓 | 可维护性 | P1 |
| 12 | `types.ts` 1123 行 God module，且与 `bindings/` 重复定义后端类型 | types | SRP | P1 |
| 13 | 64 处 `.catch(() => ...)` 兜底（19 处空块）+ 空 `catch {}` 4 处静默吞错 | 全仓 | 错误处理 | P1 |
| 14 | `SessionContext` 在渲染期写 ref（`sessionsRef.current = sessions`） | contexts | 正确性 | P1 |
| 15 | 无 ESLint / Prettier / EditorConfig，CI 无 lint 步骤 | 工程 | 工程化 | P1 |
| 16 | `main.tsx` 未挂载顶层 ErrorBoundary（仅有逐页 16 处） | 入口 | 稳定性 | P2 |
| 17 | `redis/ValueEditor.tsx` 291 行零引用（实际使用 `viewers/` 目录） | pages | 死代码 | P2 |
| 18 | 模块级可变状态充当应用状态（`pendingAskPrompt` / `dropUnsubscriber`） | api | 架构 | P2 |
| 19 | `useMemo`/`useCallback` 分布失衡：pages 136/131 vs components 16/19 | 全仓 | 性能 | P2 |
| 20 | `MongoClient` 与 `redis/viewers/` 未复用 `ResizableTable` 等共享组件 | pages | 重复 | P2 |
| 21 | `components/common/Tree/index.ts`、`components/server-forms/index.ts` 为空壳桶文件 | components | 整洁 | P2 |
| 22 | 30 处 `.then(r => r || [])` 与 45 处 `.catch` 兜底把失败伪装成空数据 | 全仓 | 契约 | P2 |
| 23 | `SqliteClient` 跨表竞态 + 无主键时 WHERE 退化为全列匹配 → **可写错表** | pages | 正确性 | **P0** |
| 24 | 连接失败被硬编码为"已连接"（页脚 Tag 无条件渲染） | pages | 契约 | **P0** |
| 25 | Docker 守护进程不可达被渲染为"全部已停止" | pages | 契约 | **P0** |
| 26 | 空结果被报告为"部署成功！已同步 0 项资源" | pages | 契约 | **P0** |
| 27 | Mongo 过滤器 JSON 非法时静默变成"查询全部" | pages | 正确性 | **P0** |
| 28 | 不纯的 state updater：在 `setFilters` 内发起查询（StrictMode 下重复请求） | pages | 正确性 | P1 |
| 29 | SQL 双胞胎缺少取消保护，loading 状态互相覆盖 | pages | 竞态 | P1 |
| 30 | 切换 Tab 丢弃未保存编辑（mysql 卸载、postgres 保持挂载，行为不一致） | pages | 正确性 | P1 |
| 31 | 计数查询失败 + 切表不重置 → 分页器显示上一张表的行数 | pages | 正确性 | P1 |
| 32 | 错误只进 console，UI 呈现为空视图（结构页签空白被读作"没有列"） | pages | 错误处理 | P1 |
| 33 | Mongo 每次按键触发一次数据库查询（CodeEditor 无防抖） | pages | 性能 | P1 |
| 34 | 渲染路径中的重复 `JSON.parse`/`stringify` 与 canvas `measureText` | pages | 性能 | P2 |
| 35 | 类型逃逸中隐藏的真实不匹配（`'WS' as any`、后端状态串强转、`null as any`） | pages | 类型安全 | P1 |
| 38 | `emitEvent` 双重派发（本地 + Wails IPC 回环），参数形态不一致 | api | 正确性 | P1 |
| 39 | `pendingAskPrompt` 单例在挂载时被消费 → 提问永远丢失 | api | 正确性 | P1 |
| 40 | `dropUnsubscriber` 全局槽位，过期 cleanup 杀掉新注册 | api | 正确性 | P1 |
| 41 | `subscribe` 注册表：同函数重复注册误拆 IPC 绑定；零事件类型 | api | 正确性 | P1 |
| 42 | 7 条 legacy 事件通道零订阅者仍在生产；会话删除/Wiki 更新无人订阅 | 前后端 | 契约 | P1 |
| 43 | 有生产者、无处理分支的事件被静默丢弃（作业/子代理进度不可见） | agent/hooks | 契约 | P1 |
| 44 | 会话切换竞态 + `isGenerating` 永久卡死导致新会话无法发送 | agent/hooks | 正确性 | P1 |
| 45 | 就地修改上一次 state + updater 内嵌套 `setMessages` 与 IPC 副作用 | agent/hooks | 正确性 | P1 |
| 46 | `SessionContext` 过度订阅的具体链路（`AiSidebar` → `AiAgentPanel` 重挂载） | contexts | 性能 | P1 |
| 47 | `agentSetActiveConnection` 在每次会话变更时都打一次 IPC | contexts | 性能 | P2 |
| 48 | `system` 主题不跟随系统；无全局拒绝处理；25 处空错误提示 | 全仓 | 工程化 | P1 |

> **两项并行深审另发现 26 项缺陷**（页面层 #23–#35、状态与事件层 #36–#48），其中 **2 项 CRITICAL**（跨会话事件污染导致把 A 会话内容写进默认会话历史；一个完整功能因事件名拼写不一致而静默失效）、**5 项"静默错误结果"**（含一项可导致**写错表**的竞态），并修正了 #3 的重复度量化（实际为 **77%** 而非 40%）。详见文末两节附录。

---

## Critical Issues（P0）

### #1 `api.ts` 用 `as any` + 手工类型标注覆盖自动生成的绑定类型

- `frontend/src/api.ts#L1-L15`（引入 14 个生成的绑定模块）
- `frontend/src/api.ts#L124-L140`、`#L261`、`#L541` 等约 **140 处** `as any`

**Problem**：`api.ts` 从 `bindings/terminal/services/*` 引入后端绑定，这些绑定**已经带有从 Go 结构体生成的精确类型**（例如 `SystemService.GetAppSettings(): $CancellablePromise<AppSettings | null>`）。但代码对所有调用统一做 `as any`，并在 `API` 对象上用**手写的** TypeScript 签名重新标注一遍：

```ts
getAppSettings: (): Promise<AppSettings> => SystemService.GetAppSettings() as any,
listServers: (): Promise<ServerConfig[]> => SystemService.ListServers().then(r => r || []) as any,
saveServer: (cfg: ServerConfig): Promise<ServerConfig> => SystemService.SaveServer(cfg as any) as any,
```

后果是**双向失去保护**：

- 后端改了 Go struct 的字段名/类型，绑定重新生成后**前端零报错**——`as any` 吞掉了不匹配，`types.ts` 里的手写类型继续"声明"旧结构；
- 前端传给后端的参数用 `cfg as any` 绕过检查——Go 侧期望 `dockerSshAuthType`，前端传 `dockerSshAuthType` 之外的名字也不会被发现。

也就是说：`strict: true` 在这条最关键的边界上**完全失效**，而这是整个应用唯一的后端契约面。

**Fix**：删除 `as any`，直接暴露绑定类型；对 Wails 的 `T | null` 返回用显式判空或 `??` 兜底而非 `as any`：

```ts
getAppSettings: async (): Promise<AppSettings> => (await SystemService.GetAppSettings()) ?? DEFAULT_SETTINGS,
listServers: async (): Promise<ServerConfig[]> => (await SystemService.ListServers()) ?? [],
saveServer: (cfg: ServerConfig): Promise<ServerConfig> => SystemService.SaveServer(cfg),
```

进一步：为 `API` 对象加 `satisfies` 约束或建立一处 `type Bindings = typeof import('../bindings/...')` 的对照断言，使"手写类型 ↔ 生成类型"的偏差在编译期暴露。

### #2 184 处 `as any` / 322 处 `: any`，且 `noImplicitAny` 被显式关闭

- `frontend/tsconfig.json#L26-L27`（`noImplicitAny: false`、`noUnusedLocals: false`）
- 全仓计数：`as any` **184**、`: any` **322**（合计 506 处类型逃逸）

**Problem**：`tsconfig` 打开了 `strict: true`，却又单独关掉了 `noImplicitAny`。这是最矛盾的一种组合——`strict` 的价值主要就来自 `noImplicitAny`/`strictNullChecks`，关掉它之后 `strict: true` 在很大程度上变成免责声明。剩余 `as any` 的分布如下（已分类）：

| 类别 | 数量 | 是否合理 |
|---|---|---|
| `api.ts` 中包装后端调用 | ~140 | **不合理**——见 #1 |
| antd `Tabs`/`Segmented` 的 `onChange` 联合类型 | ~30 | 部分合理，但应用类型化包装函数替代 |
| `(Service as any).OptionalMethod` 存在性探测 | ~20 | **不合理**——见 #10 |
| `window`/`navigator` 等宿主对象扩展 | 少量 | 合理 |

**Fix**：分三步——① 先按 #1 清掉 `api.ts` 的 140 处（一次改动解决 76%）；② 为 antd 的 `onChange` 写泛型包装 `<Tabs<TabKey> .../>` 替代 `v as any`；③ 打开 `noImplicitAny` 并把 `: any` 收敛为 `unknown` + 类型守卫。`noUnusedLocals`/`noUnusedParameters` 也应打开（见 #8 的死代码正是无人清理的结果）。

### #3 MySQL ↔ PostgreSQL 页面是复制粘贴克隆

- `frontend/src/pages/mysql/DataTab.tsx`（1094 行）vs `frontend/src/pages/postgres/DataTab.tsx`（1094 行）——**行数完全相同，446 行逐字相同**（约 40% 的正文）
- `frontend/src/pages/mysql/SqlEditor.tsx`（431）vs `pages/postgres/SqlEditor.tsx`（394）——**138 行逐字相同**
- `frontend/src/pages/mysql/MysqlClient.tsx`（966）vs `pages/postgres/PostgresClient.tsx`（760）——**234 行逐字相同**

**Problem**：这不是"两个相似实现"，而是**同一份代码被复制后各自漂移**。证据是跨协议共享的领域逻辑标识符在三处高度一致：

| 标识符 | mysql | postgres |
|---|---|---|
| `page` | 28 | 28 |
| `setPage` | 9 | 9 |
| `pageSize` | 15 | 15 |
| `sortOrder` | 13 | 13 |
| `loadData` | 10 | 10 |
| `buildUpdateSql` / `buildInsertSql` | 2 / 2 | 2 / 2 |
| `editingCell` | 6 | 5 |

（Mongo 的 `DataTab` 是**另一个**实现：`editingCell`/`sortOrder`/`buildInsertSql` 全为 0，改用了 `filterText`。所以重复发生在 MySQL↔PostgreSQL 之间，而不是三者之间。）

漂移证据：`MysqlClient.tsx` 966 行 vs `PostgresClient.tsx` 760 行，同一功能差了 206 行——说明修 bug 时只改了一侧。

**Fix**：抽出协议无关的**数据网格内核**，把 SQL 方言差异下沉为策略对象：

```
pages/common/useDataGrid.ts        // 分页/排序/筛选/编辑态/脏检查/保存
pages/common/DataGrid.tsx          // 表格渲染 + 单元格编辑 + 确认弹窗
pages/common/sqlDialect.ts         // buildInsert/buildUpdate/buildDelete/quoteIdent
pages/mysql/DataTab.tsx            // 仅提供 MysqlDialect + 描述接口
pages/postgres/DataTab.tsx         // 仅提供 PostgresDialect + 描述接口
```

同时把 `MysqlClient`/`PostgresClient` 的 Tab 外壳（结构/索引/约束/用户/状态）统一为 `ConnectionPageShell`。

### #4 MySQL ↔ PostgreSQL 样式文件同样克隆

- `frontend/src/pages/mysql/DataTab.module.less`（347 行）vs `pages/postgres/DataTab.module.less`（347 行）——**259 行逐字相同**
- `frontend/src/pages/mysql/MysqlClient.module.less`（184）vs `PostgresClient.module.less`（173）——**138 行逐字相同**

**Problem**：已核对两文件前 40 行**完全一致**（连注释 `/* 数据/结构/索引/约束/DDL 视图容器 */` 都一样），但 MD5 不同（`249E415D...` vs `B99CB4E8...`）——即**克隆后发生了细微漂移**，是最难维护的形态。同一份数据网格样式维护两遍，任何视觉调整都要做两次且容易漏。

**Fix**：#3 抽出共享 `DataGrid` 组件后，样式随之合并为 `pages/common/DataGrid.module.less`，协议页面只保留各自极少量的差异样式。

### #5 全前端零竞态保护，而 121 个 `useEffect` 在发请求

- 全仓计数：`AbortController` **0**、`let ignore/cancelled/stale/isMounted` 标志 **0**
- `frontend/src/pages/mysql/DataTab.tsx#L76, L84, L301, L310, L400`（多次 `loadData(...)` 入口）

**Problem**：这是一个多会话桌面客户端——用户可能在同一个 Tab 里快速切换表、快速切换连接的库、快速点不同会话。由于没有任何取消或"过期响应丢弃"机制，先发的请求后返回时会**写入当前状态**，用户看到的是 A 表的数据挂在 B 表标题下。这类 bug 在本地开发（延迟低）几乎不出现，在真实远程连接（延迟高）时高频出现，且用户很难描述、开发者很难复现。

**Fix**：统一改为在 effect 中带取消语义，二选一：

```ts
// 方案 A：请求序号守卫（改动最小，适合已有 API 层）
const seq = useRef(0)
useEffect(() => {
  const mine = ++seq.current
  loadData(...).then(d => { if (mine === seq.current) setRows(d) })
}, [tableName])

// 方案 B：API 层透传 AbortSignal（更彻底）
useEffect(() => {
  const ac = new AbortController()
  loadData(..., ac.signal).then(...).catch(e => { if (!ac.signal.aborted) message.error(...) })
  return () => ac.abort()
}, [tableName])
```

方案 B 需要 `api.ts` 的方法接受并透传 `signal`（Wails 绑定不原生支持，需在 `API` 层做 `Promise.race` 或封装可取消包装器）。

### #6 `SessionContext` 的 value 是内联对象字面量，且 `React.memo` 全仓零使用

- `frontend/src/contexts/SessionContext.tsx#L361-L379`
- `frontend/src/contexts/SessionContext.tsx#L98-L101`（渲染期写 ref）
- 全仓计数：`React.memo` **0**、`useMemo` **152**、`useCallback` **173**

**Problem**：

```tsx
<SessionContext.Provider
    value={{                       // ← 每次渲染都是新对象
        sessions, tools, activeTarget, sidebarOpen, toggleSidebar, setSidebarOpen,
        aiSidebarOpen, toggleAiSidebar, setAiSidebarOpen, activateTab, closeSession,
        addSession, updateSession, openTool, closeTool,
    }}
>
```

该 value 字面量每次 render 都重建，且 `SessionProvider` 位于应用根部；它持有 `sessions`（9 种协议的会话数组）、`tools`、`activeTarget`、两个侧栏开关。结果是**任何一处变更都让全部消费组件重渲染**，而 `React.memo` 零使用意味着子组件也无法拦截。对一个持有 xterm 终端、CodeMirror 编辑器、大表格的客户端，这会表现为输入卡顿与终端渲染抖动。

同时 L98-L99 在渲染期写 ref：

```tsx
const sessionsRef = useRef(sessions)
sessionsRef.current = sessions   // ← render 期副作用，React 并发模式下不安全
```

**Fix**：

1. 拆分为多个窄 context：`SessionsDataContext`（9 个数组）、`SessionsActionsContext`（稳定的 action 引用）、`UiStateContext`（sidebar/tools/activeTarget）。actions 天然稳定，data 变更不会传导到只消费 actions 的组件。
2. 或将 value 用 `useMemo` 包裹（必要但不充分——仍是单一大对象）。
3. 渲染期写 ref 改为 `useEffect` 或直接依赖闭包；若必须用 ref 取最新值，改用 `useEffectEvent`（React 19）或 `useRef` + effect 同步。
4. 对昂贵的叶子组件（表格行、终端容器、编辑器）加 `React.memo`。

---

## Warnings（P1）

### #7 `mysql/DataTab.tsx:249` 将 `pageSize` 直接插值进 SQL `LIMIT`

- `frontend/src/pages/mysql/DataTab.tsx#L249`（`sql += \` LIMIT ${targetSize} OFFSET ${offset}\``）
- 同文件 `#L196-L198` 将 `dbName`/`tableName` 插值进 `WHERE TABLE_SCHEMA = '${dbName}'`

**Problem**：`targetSize` 直接来自前端状态 `pageSize`（`#L55` `useState(100)`，可由分页器变更），未经数值校验即拼入 SQL。当前调用链都是内部值，风险有限；但这形成了一条「前端任意字符串 → 后端执行 SQL」的通路，且**后端 `db_mysql_query` 的 guard 审计会把它当普通 SQL 评估**（参见后端报告 `docs/architecture-review.md` #3：前缀判定可被 `;` 堆叠绕过）。两侧叠加后风险不再有限。

**Fix**：① 前端 `targetSize` 强制 `Number.isInteger` + 上下限钳制；② 表名/schema 名改用后端新增的参数化描述接口，不在前端拼 SQL；③ 若必须拼，做标识符白名单校验（`/^[A-Za-z0-9_$]+$/`）并按方言加引号。

### #8 `pages/mongo/` 下 6 个 Tab 组件共 1,155 行完全零引用

| 文件 | 行数 | 引用数 |
|---|---|---|
| `pages/mongo/AggregateTab.tsx` | 122 | 0 |
| `pages/mongo/DocumentsTab.tsx` | 349 | 0 |
| `pages/mongo/MonitorTab.tsx` | 146 | 0 |
| `pages/mongo/ChangeStreamTab.tsx` | 166 | 0 |
| `pages/mongo/IndexesTab.tsx` | 198 | 0 |
| `pages/mongo/SchemaTab.tsx` | 174 | 0 |
| **合计** | **1,155** | — |

**Problem**：`MongoClient.tsx` 实际只 import 6 个模块（`mongoTypes`、`DataTab`、`MqlEditor`、`StatusPanel`、`ObjModal`、`IoModal`）。上述 6 个 Tab 组件全部零引用（已按组件名全局搜索核实，排除了自身定义与样式引用）。这意味着 MongoDB 的聚合/文档/监控/变更流/索引/结构六个功能**要么被 `DataTab` 内联重写了，要么整个功能不存在**——后者更可能，因为 `DataTab.tsx` 有 1142 行（远超 MySQL 的 1017 行），像是把这些 Tab 吞并了。无论哪种，1,155 行未被执行、未被测试、也未被类型检查之外的任何东西守护的代码是纯负债。

**Fix**：确认产品意图后二选一——若功能应存在，把它们接回 `MongoClient` 的 Tab 列表；若已被 `DataTab` 取代，删除这 6 个文件及对应 `.module.less`。**不要**保留"以后可能用得上"的死代码（`noUnusedLocals` 打开后自会暴露同类问题）。

### #9 `api.ts` 是 359 方法的 God object

- `frontend/src/api.ts`（913 行，顶层 **359** 个方法键）

**Problem**：单个对象字面量承载了全部 14 个后端服务的调用包装，同时混入四类正交关注点：

1. **调用转发**（多数方法只有一行）；
2. **兼容性探测**（`(SystemService as any).GetAppVersion ? ... : Promise.resolve({version: 'v1.0.6', ...})`，含 3 处硬编码 mock 版本号）；
3. **返回值兜底**（`.then(r => r || [])` 30 处、`.catch(() => ...)` 45 处非空兜底）；
4. **业务逻辑**（`#L914-L924` 的 `pendingAskPrompt` 跨模块状态、`#L934-L947` 的原生文件拖放注册）。

**Fix**：按后端服务拆分为 `api/system.ts`、`api/ssh.ts`、`api/mysql.ts` … 各自 `export const systemApi = {...}`，`api/index.ts` 只做聚合导出；兼容性探测改为**一次性能力检测**（模块加载时算好 `capabilities` 对象）而非每方法内联三元；返回值兜底统一为 `unwrapList`/`unwrapMap` 两个助手；`pendingAsk` 与拖放注册移出 `api.ts`（见 #18）。

### #10 `(X as any).Method ? ... : fallback` 守卫在类型系统下恒为真

- `frontend/src/api.ts#L95-L96, L105-L106, L116-L117, L132, L194, L205-L206, L305, L386, L471, L697-L705, L716-L718, L781-L857`（精确计数：**18 处**——12 处单行三元 `(X as any).M ? A : B`、5 处可选调用 `(X as any).M?.(...)`、1 处 `if ((X as any).M)`）
- 已核实：`AgentListSessions`、`AgentCreateSession`、`AgentUpdateSessionTitle`、`AgentDeleteSession`、`AgentGenerateSessionTitle`、`AgentGetHistory`、`AgentSaveHistory` 等**全部存在于** `frontend/bindings/terminal/services/agentservice.ts` **和** `services/agent_service.go`

**Problem**：这些守卫形如

```ts
agentListSessions: (): Promise<AgentSessionItem[]> =>
    (AgentService as any).AgentListSessions
        ? (AgentService as any).AgentListSessions().then(...)
        : Promise.resolve([]),
```

由于方法确实存在，`: Promise.resolve([])` 分支**永远不可达**。危害不在"多写了代码"，而在于它**把编译期错误降级为运行期静默降级**：一旦后端删掉 `AgentListSessions`，`tsc` 不会报错（因为是 `as any`），应用启动后会话列表**永远为空**，用户与开发者都拿不到任何线索。这是与后端「fail-open 默认放行」完全同源的失败模式，只是发生在契约层。

**Fix**：删除全部存在性守卫，直接调用（见 #1）；若确实需要兼容多个后端版本，改为一处显式的 `capabilities` 探测 + 明确的不支持提示，而非静默返回空数组。

### #11 无 i18n：4,257 处中文字面量散落 149 个文件

- 全仓计数：含中文字面量的文件 **149**、中文字面量 **4,257**、`i18n`/`useTranslation`/`locale` 相关命中 **26**

**Problem**：项目有英文 `README.md`、英文 Release Notes、`Inter` 字体与英文品牌名，且 `package.json` 无任何 i18n 依赖——说明当前只支持中文且**没有为多语言留出结构**。4,257 处硬编码字符串意味着将来要做多语言时不是"加一个翻译文件"，而是重写所有 UI 文案位置。

**Fix**：若确认长期单语言，至少在文档中明确该决策，避免后来者误以为存在 i18n 层；若有出海计划，现在引入 `i18next`/`react-intl` 并把文案集中到 `locales/zh-CN.ts`，配合 ESLint 规则禁止 JSX 中出现中文字面量。**不建议**在功能开发高峰期做全量迁移——可按新增代码强制、存量渐进。

### #12 `types.ts` 是 1123 行 God module，且与 `bindings/` 重复定义后端类型

- `frontend/src/types.ts`（1123 行）
- `frontend/src/api.ts#L17-L77`（从 `types.ts` 一次性引入 59 个类型）

**Problem**：`types.ts` 手工重新声明了后端 Go 结构体（`ServerConfig`、`MysqlQueryResult`、`RedisValue`、`MongoFindResult`、`K8sApplyResult` …），而这些类型**已由 `bindings/` 从 Go 生成**。两套定义并存且无一致性校验，正是 #1 的根源：手写类型与生成类型可以任意偏离而不被发现。同时单文件 1123 行使类型查找与复用成本很高。

**Fix**：① 优先从 `bindings/terminal/models` 导入后端拥有的类型，`types.ts` 只保留**纯前端的视图模型**（如 `AiMessage`、`TabKind`）；② 按领域拆分为 `types/{conn,agent,mongo,docker,k8s}.ts`；③ 对必须手写的类型加契约测试或 `satisfies` 断言。

### #13 64 处 `.catch(() => ...)` 兜底 + 空 `catch {}` 4 处静默吞错

- 全仓计数：`.catch(() => ...)` **64 处**（其中空块 `.catch(() => {})` **19 处**、返回 `[]` 的 **6 处**、返回 `{}`/`null`/其它的 **39 处**）、空 `catch {}` **4 处**
- 例：`frontend/src/pages/agent/hooks/useAgentEvents.ts#L380-L382, L430-L432, L454`

**Problem**：典型的"保存失败看起来像成功"：

```ts
API.agentSaveSessionMessages(activeSessionId, copy).catch(() => {})
```

会话消息保存失败时用户没有任何感知，下次打开会话才发现消息丢了。同型问题还有 164 处 `.catch(() => [])`（见 #22）。

**Fix**：区分「可忽略」与「必须告知」——可忽略的（如探测性调用、`localStorage` 写入）保留但**加注释说明为何可忽略**；不可忽略的（持久化、删除、连接操作）至少 `message.error(...)`；建议加一个 `reportError(scope, err)` 统一出口，便于后续接日志上报。

### #14 `SessionContext` 在渲染期写 ref

- `frontend/src/contexts/SessionContext.tsx#L98-L101`

**Problem**：见 #6 的分析。渲染期修改 ref 在 React 18 并发渲染下不安全——渲染可能被丢弃或重复，而 ref 的写入已经发生。当前 `closeSession`/`closeTool`（`#L286, #L331`）依赖 `sessionsRef.current` 读取"最新会话"，因此这个模式有实际功能依赖，不能简单删除。

**Fix**：改为在 effect 中同步（`useEffect(() => { sessionsRef.current = sessions }, [sessions])`），或在需要读取最新值的回调里改用 `setSessions(prev => ...)` 的函数式更新来获取权威值（`closeSession` 已经在两个 `set*` 里用了函数式更新，只是 fallback 计算提前读了 ref）。

### #15 无 ESLint / Prettier / EditorConfig，CI 无 lint 步骤

- 已核实：仓库根与 `frontend/` 下均**不存在** `.eslintrc*`、`eslint.config.*`、`.prettierrc*`、`.editorconfig`、`biome.json`
- `frontend/package.json#L7-L10`：scripts 仅有 `dev` / `build:dev` / `build` / `preview`
- `.github/workflows/build.yml`：仅 `wails3 build` + 打包，无任何 lint/test 步骤

**Problem**：这是本报告多条问题的**上游原因**。`tsc` 只能发现类型错误，无法发现：未使用的变量与导入（#8 的 1,155 行死代码）、`any` 蔓延（#2）、`useEffect` 依赖数组缺失（#5）、`catch` 吞错（#13）、JSX 中的硬编码文案（#11）。同时无 Prettier 导致风格已明显分裂：

| 风格项 | 计数 | 说明 |
|---|---|---|
| 单引号字符串 | 1,021 | 与下行并存 |
| 双引号字符串 | 2,249 | 无统一规则 |
| 行尾分号 | 1 | 实际约定为**不加分号**，但未固化 |

**Fix**：① 加 ESLint（`@typescript-eslint` + `eslint-plugin-react-hooks`，后者能直接抓出 #5 类问题）；② 关键规则从 `warn` 起步：`react-hooks/exhaustive-deps`、`no-unused-vars`、`no-explicit-any`、`no-empty`、`no-floating-promises`；③ 加 Prettier + `.editorconfig` 固化现有风格（不加分号、单引号），并做一次全量格式化提交；④ CI 增加 `eslint .` 与 `tsc --noEmit` 作为构建前置。

---

## Suggestions（P2）

### #16 `main.tsx` 未挂载顶层 ErrorBoundary

- `frontend/src/main.tsx`（6 行，直接 `root.render(<App />)`）
- `frontend/src/components/app/Stage.tsx#L86-L195`（16 处逐页 `ErrorBoundary`）
- `frontend/src/components/app/AiSidebar.tsx#L114`

**Problem**：逐页包裹是**做得好的地方**——每个连接页面渲染异常时可被隔离并通过 `onClose` 关闭该会话，用户体验远好于白屏。但 `App` 自身、`Sidebar`、`TitleBar`、`SessionProvider` 的渲染异常没有兜底，会直接白屏。`components/ErrorBoundary.tsx` 已存在且实现完整（`getDerivedStateFromError` + `componentDidCatch`）。

**Fix**：在 `main.tsx` 用 `<ErrorBoundary>` 包裹 `<App />`，提供一个"重新加载"的兜底 UI。注意 React 的 error boundary **不捕获**事件处理器与异步错误，因此 #13 的错误仍需显式处理。

### #17 `redis/ValueEditor.tsx` 291 行零引用

- `frontend/src/pages/redis/ValueEditor.tsx`（291 行，仅自引用自己的 `.module.less`）
- 实际生效的是 `frontend/src/pages/redis/viewers/`（`HashViewer`/`ListViewer`/`SetViewer`/`StreamViewer`/`StringViewer`/`ZSetViewer`）

**Problem**：与 #8 同类。`redis/viewers/` 目录有完整的 7 个查看器实现，`ValueEditor.tsx` 是被取代的旧版。

**Fix**：删除 `ValueEditor.tsx` 与 `ValueEditor.module.less`。

### #18 模块级可变状态充当应用状态

- `frontend/src/api.ts#L879-L880`（`subscribers` / `boundUnsubscribers` 两个模块级 Map）
- `frontend/src/api.ts#L914-L924`（`let pendingAskPrompt: string | null`）
- `frontend/src/api.ts#L931`（`let dropUnsubscriber: (() => void) | null`)

**Problem**：

- `pendingAskPrompt` 是"待消费的一次性提问"存储，通过 `setPendingAsk` / `consumePendingAsk` 跨模块读写。这是**模块级全局状态**：多窗口场景下互相覆盖，HMR 时被重置导致状态丢失，且无法在测试中隔离。
- `dropUnsubscriber` 是单例，只允许一个拖放处理器注册（`registerNativeFileDrop` 会覆盖前一个），当前恰好够用但语义脆弱。

**Fix**：`pendingAsk` 归入 React 状态（放到 `SessionContext` 或专用的 `AgentAskContext`），需要跨组件读取时用 context 而非模块变量；拖放注册改为返回句柄由调用方持有，或支持多处理器集合。

### #19 `useMemo`/`useCallback` 分布失衡

| 目录 | `useMemo` | `useCallback` |
|---|---|---|
| `pages/` | 136 | 131 |
| `contexts/` | 0 | 9 |
| `components/` | 16 | 19 |
| `utils/` | 0 | 0 |

**Problem**：页面层在密集手工优化，共享组件层几乎没有。这通常意味着**优化放在了错误的位置**：页面组件因缺少更上层的抽象而不得不各自 memo，而真正被大量复用的 `Sidebar`（532 行）、`ClientIcon`（411 行）、`Tree`（505 行）反而没有优化。`contexts/` 的 0 处 `useMemo` 正是 #6 的直接体现。

**Fix**：优先修 #6（context value 稳定化）与 #3（抽出共享表格内核），页面层的散点 memo 可随之删除；再对 `Sidebar`/`Tree` 等高频复用组件评估 `React.memo`。

### #20 `MongoClient` 与 `redis/viewers/` 未复用共享组件

- `frontend/src/components/ResizableTable.tsx`（368 行，导出 `ColDef`、`calcColWidthFromName`）被 `pages/mysql/DataTab.tsx#L23` 使用
- `pages/mongo/DataTab.tsx`（1142 行）与 `pages/redis/viewers/*`（合计 ~1,600 行）各自维护表格渲染

**Problem**：已有一个带列宽计算的 `ResizableTable`，但只有 MySQL/PostgreSQL 用了。Mongo 与 Redis 的查看器重复实现同类能力。

**Fix**：#3 抽出 `DataGrid` 时一并统一到 `ResizableTable` 之上；`redis/viewers/*` 评估是否可退化为"列定义 + 数据源"配置。

### #21 空壳桶文件

- `frontend/src/components/common/Tree/index.ts`（3 行）
- `frontend/src/components/server-forms/index.ts`（27 行）

**Problem**：`components/common/Tree/index.ts` 仅 3 行且无引用（`Tree.tsx` 505 行被直接引用），属残留；`server-forms/index.ts` 27 行同样零引用。

**Fix**：删除或在有实际聚合价值时补全 re-export。

### #22 30 处 `.then(r => r || [])` 与 45 处 `.catch` 兜底把失败伪装成空数据

- 全仓计数：`.then(r => r || [])` **30 处**、返回 `[]`/`{}`/`null` 的 `.catch(() => ...)` **45 处**（64 处 `.catch` 中除去 19 处空块）

**Problem**：与 #13 同源但形态不同——失败时返回空数组/空对象，UI 显示"暂无数据"，用户无法区分"真的没有"与"请求失败了"。例：`pages/mysql/DataTab.tsx#L131`（`API.mysqlIndexes(...).catch(() => [])`）——索引查询失败会让"索引"页签显示为空，用户可能据此误判表上没有索引。

**Fix**：把"失败"与"空"在类型层面区分开（如返回 `{ data, error }` 或抛出让调用方决定），至少对**影响用户判断的查询**（索引、表结构、约束、健康状态）不要静默降级为空。可保留兜底但增加 `message.warning` 提示。

---

## 附：页面层缺陷（#23–#35，并行深审 + 二次核验）

> 本节来自针对 11 个大页面组件的专项深审，**每条均由我逐条读码二次核验**。编号续前文，严重度独立标注。

### #23 `SqliteClient` 跨表竞态可导致"写错表"（严重）

- `frontend/src/pages/sqlite/SqliteClient.tsx#L129-L159`（`loadTableData`）
- `frontend/src/pages/sqlite/SqliteClient.tsx#L601-L603`（UPDATE）
- `frontend/src/pages/sqlite/SqliteClient.tsx#L301-L302`（DELETE）
- `frontend/src/pages/sqlite/SqliteClient.tsx#L273-L286`（`buildWhereClause`）

**Problem**：`loadTableData` 先 `setSelected(table)`，随后 `await Promise.all([...])` 并无条件写入 `setRows/setColumns/setStructData/setTotalRows`，**没有请求序号、没有 abort**。表列表点击也没有 `busy` 守卫（分页有，见 `#L618`）。因此"先点表 A、再点表 B、A 的响应后到"时，`selected === "B"` 而 `rows/columns` 是 A 的。随后 `handleSaveAll` 用 `selected`（表名）拼 SQL、用 `columns`（列集）拼 SET 子句：

```ts
setParts.push(`${quoteIdent(col)} = ${sqlVal(rowDraft[col])}`)   // col 来自 columns（可能是 A 的）
const sql = `UPDATE ${quoteIdent(selected)} SET ... WHERE ${whereSql}`  // selected 是 B
```

→ **对 B 表执行来自 A 表结构的 UPDATE**。叠加第二重缺陷：`buildWhereClause` 在无主键时退化为"用全部列做 WHERE"（`targetCols = pkNames.length > 0 ? pkNames : columns`）且不加 `LIMIT`，重复行会被**批量命中并一起改掉**，而 UI 报告成功。mysql/postgres 在无主键时是**拒绝写入**的（`mysql/DataTab.tsx#L363-L366, #L419-L422`），sqlite 没有这道防线。

**Fix**：① `loadTableData` 加单调请求序号或 `AbortController`，每次 `set*` 前校验；② 保存路径重新校验 `table === selectedRef.current` 并在不一致时中止；③ sqlite 无主键时拒绝 UPDATE/DELETE（对齐 mysql/postgres），或强制要求显式指定 `rowid`。

### #24 连接失败被硬编码为"已连接"（严重）

- `frontend/src/pages/postgres/PostgresClient.tsx#L85`、`#L711-L713`
- `frontend/src/pages/mysql/MysqlClient.tsx#L119`

**Problem**：`await API.postgresConnect(serverId)` 的**布尔返回值被丢弃**，随后照常拉取库列表；页脚的成功标签是**无条件渲染**的：

```tsx
<Tag color="success" ...>已连接</Tag>
```

连接失败时用户看到"已连接"标记 + 空对象树，无法判断是"库为空"还是"连不上"。这与后端报告 `docs/architecture-review.md` #24（`Close` 一律 `return nil`）是同一模式：**界面断言了代码无法知道的状态**。

**Fix**：接收布尔返回值并据此渲染状态（`已连接` / `连接失败` / `连接中`）；失败时给出错误详情而非空树。

### #25 Docker 守护进程不可达被渲染为"全部已停止"（严重）

- `frontend/src/pages/docker/ComposeTab.tsx#L120-L123`

**Problem**：

```tsx
API.dockerListComposeRecords(serverId).catch(() => [] as DockerComposeRecord[]),
API.dockerListComposeStacks(serverId).catch(() => [] as DockerComposeStackInfo[]),
```

两个调用都把失败吞成空数组。远端栈为空 → 本地记录无法匹配 → 状态列落到默认分支渲染为 `已停止`。**连接故障被呈现为"所有服务都已停止"**，运维人员可能据此去重启根本连不上的服务。

**Fix**：不要吞错。失败时渲染明确的错误态，并把状态列改为"未知（无法连接）"而非 `已停止`。

### #26 空结果被报告为部署成功（严重）

- `frontend/src/pages/k8s/YamlTab.tsx#L215-L220`

**Problem**：

```tsx
const results = await API.k8sApplyOrchestration(serverId, rec)
const failures = results?.filter((r) => r.action === 'failed') || []
const successes = results?.filter((r) => r.action !== 'failed') || []
if (failures.length === 0) {
    message.success(`编排 [${rec.name}] 部署成功！已同步 ${successes.length} 项资源`)
}
```

`results` 为空数组时 `failures` 也为空 → 弹出"部署成功！已同步 **0** 项资源"。同文件的 `handleSaveAndApply` 有 `results.length` 守卫（`#L181-L184`），**行内一键部署这条路没有**——典型的"同一功能两条路径，只修了一条"。

**Fix**：抽统一的 `reportApplyResult(results)` 助手供两条路径共用；`results.length === 0` 时 `message.warning('未同步任何资源')`。

### #27 Mongo 过滤器 JSON 非法时静默变成"查询全部"（严重）

- `frontend/src/pages/mongo/DataTab.tsx#L194-L203`

**Problem**：

```tsx
try {
    if (filterText.trim() && filterText.trim() !== '{}') {
        baseObj = JSON.parse(filterText)
    }
} catch {
    baseObj = {}          // ← 非法 JSON 静默丢弃用户的过滤条件
}
```

用户在过滤器里写错一个括号，结果不是报错，而是**在整张集合上跑查询**，并把结果当成"符合过滤条件的数据"呈现。用户会据此得出错误的分析结论。

**Fix**：解析失败时设置 `filterError` 状态、阻止查询执行、在编辑器旁提示语法错误位置。

### #28 不纯的 state updater：在 `setFilters` 内发起请求并再 set 状态

- `frontend/src/pages/mysql/DataTab.tsx#L66-L79`
- `frontend/src/pages/postgres/DataTab.tsx#L69-L81`

**Problem**：

```tsx
setFilters((prev) => {
    const next = { ...prev }
    ...
    const newWhere = buildMysqlWhereClause(next)
    setPage(1)                        // ← updater 内 set 状态
    loadData(1, pageSize, newWhere)   // ← updater 内发起副作用
    return next
})
```

React 要求 updater **必须是纯函数**——在 StrictMode 下会被调用两次，在并发渲染下可能被丢弃或重放。这里每个字符的过滤输入都可能触发**重复的数据库查询**。

**Fix**：在 updater 外计算 `next`，`setFilters(next)` 之后再 `setPage(1)` 与 `loadData(...)`。

### #29 SQL 双胞胎缺少取消保护，且 loading 状态互相覆盖

- `frontend/src/pages/mysql/DataTab.tsx#L304-L311`、`#L279-L281`
- `frontend/src/pages/postgres/DataTab.tsx#L224-L231`、`#L199-L201`

**Problem**：切换表时 `loadStructure()` + `loadData(...)` 无 `ignore` 标志；`loadData` 在自己的 `finally` 里 `setLoading(false)`，因此**较慢的旧响应既会覆盖新表的数据，又会提前关掉新请求的 loading**。与 #5 同源，此处给出具体位置——这正是 #5 判断"本地低延迟不易复现、远程高延迟高频发生"的实例。

**Fix**：见 #5 的请求序号/AbortController 方案。

### #30 切换 Tab 会丢弃未保存的编辑

- `frontend/src/pages/mysql/MysqlClient.tsx#L863-L865`（`if (!isVisible) return null` → 卸载非活动 `DataTab`）
- 对照：`frontend/src/pages/postgres/PostgresClient.tsx#L673-L684`（用 `display:none` 保持挂载）

**Problem**：mysql 卸载非活动 Tab 会销毁 `rowDrafts`/`newRows`，用户切走再切回，**编辑内容无声消失**；postgres 保持挂载所以不会。同一交互在两个协议下行为不同。

**Fix**：统一策略——优先保持挂载，或把草稿状态提升到 `MysqlClient` 层。**不能**两套并存。

### #31 计数查询失败导致分页器显示**上一张表**的行数

- `frontend/src/pages/mysql/DataTab.tsx#L262-L276`
- `frontend/src/pages/postgres/DataTab.tsx#L193-L196`

**Problem**：`.catch(() => { }).finally(() => setCountingRows(false))` —— 失败被吞、spinner 停止、无提示，且 `totalRows` **在切表时未被重置**，于是分页器沿用上一张表的计数。

**Fix**：`catch` 中 `setTotalRows(0)` 并提示；切表时同步重置。

### #32 错误只进 console，UI 呈现为空视图

- `frontend/src/pages/mysql/DataTab.tsx#L188-L190`（`loadStructure` 失败 → 结构页签空表）
- `frontend/src/pages/mysql/DataTab.tsx#L210-L212`（约束失败 → 渲染"暂无额外约束信息"）
- `frontend/src/pages/mysql/MysqlClient.tsx#L170-L171`（对象树显示"数据表 (0)"）
- `frontend/src/pages/mysql/MysqlClient.tsx#L469-L471`（用户列表为空）
- `frontend/src/pages/postgres/PostgresClient.tsx#L113-L114, #L127-L128`（schema/表节点为空）
- `frontend/src/pages/sqlite/SqliteClient.tsx#L91-L93`（`catch { /* ignore */ }`）

**Problem**：这些都是"空视图 = 失败"的伪装。#32 的第一条尤其危险：**结构页签空白会被理解为"这张表没有列"**，而 `#210-L212` 的"暂无额外约束信息"会被理解为"表上没有外键/唯一约束"。

**Fix**：区分空数据与失败态；对结构/约束这类影响判断的查询，失败必须显式提示。

### #33 Mongo 每次按键触发一次数据库查询

- `frontend/src/pages/mongo/DataTab.tsx#L194-L215`、`#L250-L254`
- `frontend/src/pages/components/CodeEditor.tsx#L131`（`onChange` 直通，无防抖）

**Problem**：`combinedFilterJSON` 是 `useMemo`，效果依赖它；`CodeEditor` 不做防抖，因此**过滤器编辑器里每敲一个字符就发一次 `API.mongoFind`**。在远程 Mongo 上这会产生明显的延迟叠加与无意义的服务端负载。

**Fix**：加 ~400ms 防抖，或仅由已有的"执行查询"按钮触发。

### #34 渲染路径中的重复 `JSON.parse`/`stringify` 与 canvas 测量

- `frontend/src/pages/mongo/DataTab.tsx#L956`（每行、每次渲染 `JSON.parse` + `JSON.stringify(..., null, 2)`）
- `frontend/src/pages/mongo/DataTab.tsx#L363`、`#L370-L372`（对象单元格每次渲染先完整 stringify 再截断到 150 字符）
- `frontend/src/pages/sqlite/SqliteClient.tsx#L766-L773`（列宽构建在 JSX 内联 IIFE 中，对每列每渲染调用 `calcColWidthFromName` → `canvas.measureText`）
- `frontend/src/pages/mysql/DataTab.tsx#L688`、`pages/postgres/DataTab.tsx#L627`（`dataCols` 依赖含 `rows.length`/`colWidths`，导致 `ResizableTable` 的宽度效应反复重测最多 200 行×每列）
- `frontend/src/pages/docker/ComposeTab.tsx`（全文 0 处 `useMemo`：`filtered`/`columns`/`serviceSubColumns`/`dataSource` 每渲染重建，另有 3 次额外 `items.filter` 与内联 `expandable` 对象）；`pages/k8s/YamlTab.tsx#L326-L538, #L571-L577` 同型

**Fix**：`mongo` 的解析结果预计算进 `parsedRows`（按 `docs` 记忆）；`sqlite` 的列构建提出 JSX 并 `useMemo`；SQL 双胞胎从 `dataCols` 依赖中移除 `rows.length`/`colWidths`；`ComposeTab`/`YamlTab` 的列定义与派生列表加 `useMemo`。

### #35 类型逃逸中隐藏的真实不匹配

- `frontend/src/pages/api/ApiTreeList.tsx#L322`：`item.method === ('WS' as any)` —— `ApiMethod`（`types.ts#L546`）**不含 `'WS'`**，类型系统否认了一个应用确实在存储和渲染的值
- `frontend/src/pages/docker/ComposeTab.tsx#L144, #L177`：`status: (matchedStack.status as any) || 'running'` —— 后端状态串被强塞进本地四值联合类型，而过滤只比较其中三个字面量（`#L374-L376`），任何其他后端值都会静默渲染为 `已停止`
- `frontend/src/pages/sqlite/SqliteClient.tsx#L496, #L498`：`updateNewCell(rowIdx, colKey, null as any)` —— 参数类型是 `string`，而"设为 NULL"需要 `string | null`；草稿模型应改为可空
- `frontend/src/api.ts#L389-L406`：PostgreSQL 全部调用被标注为 `Promise<any>`/`Promise<any[]>`（`postgresSelect`/`postgresDescribe`/`postgresSchemas`/`postgresTables`…），使 `PostgresClient`/`DataTab` 的类型**是断言而非检查**；`#L349-L356` 的 mysql 状态/变量/进程/慢日志/用户同理

**Fix**：`ApiMethod` 补 `'WS'`；后端状态串用运行期映射表归一化；草稿模型改 `string | null`；把 `api.ts` 里这些 `any` 换成绑定类型（与 #1 合并处理）。

### 附：对前文重复度量化的修正

深审采用了更严格的度量（**剔除空行与纯注释行**后逐行 `Compare-Object`），结论比我在 #3 中给出的数字**更严重**，据实修正：

| 指标 | 前文（含空行/注释） | 修正后（剔除空行/注释） |
|---|---|---|
| `mysql` vs `postgres` `DataTab.tsx` 逐字相同行 | 446 行（约 40%） | **757 / 988 行 = 77%** |
| 唯一行 Jaccard 相似度 | 未测 | **55.6%** |
| `handleCommitCell` | 未测 | **27/27 行完全相同** |
| `handleCommitNewCell` | 未测 | 11/11 |
| `handleHeaderSort` | 未测 | 18/18 |
| `contextMenu` 状态 + handler | 未测 | 26/26 |
| `getContextMenuItems` | 未测 | 152/156（97%） |
| 数据 `<tbody>` JSX | 未测 | 105/112（94%） |
| 右键菜单 `<Dropdown>` | 未测 | 16/16 |
| Tab 外壳（`MysqlClient` vs `PostgresClient`） | 未测 | `handleCloseAllTabs` 7/7、`handleCloseLeftTabs` 9/9、`handleCloseRightTabs` 9/9、`handleCloseTab` 11/12；696 归一化行中 417 行逐字相同 |

差异仅在于方言字符串、`mysqlDescribe`/`postgresDescribe` 的函数名，以及 mysql 多出的 `handleDiscardAll`（`#L409-L415`，postgres 没有）。**这确证 #3 的判断：不是"相似实现"，是同一份代码分叉后各自漂移。**

另核实一条同源问题：`SqliteClient.tsx` 甚至在**同一个文件内**重复定义了两个字节级相同的函数——`getEditValue`（`#L201-L208`）与 `getDisplayValue`（`#L210-L217`）。

### 附：#34 之外的性能结论澄清

深审明确给出**否定性结论**：**不存在无界渲染**——所有数据网格都有分页（`PAGE_SIZE`/`pageSizeOptions ≤ 500 行）或上限（mongo 文档与 JSON 卡片 ≤ 200），因此**当前不引入虚拟化是合理的**，不是缺陷。同时在全范围内**未发现**「渲染期 setState」与「非空断言 `x!.y`」。这三项此前在 #19/#5 中属于推测，现予澄清。



## 附：状态层与事件总线缺陷（#36–#48，并行深审 + 二次核验）

> 本节来自针对 `contexts/`、`pages/agent/hooks/`、`api.ts` 事件总线、`App.tsx` 与共享组件的专项深审。**每条均已逐条读码二次核验**，并对照 Go 侧生产者与 `bindings/` 交叉验证。

### #36 【CRITICAL】跨会话事件污染——A 会话内容被写入默认会话历史

- `frontend/src/pages/agent/hooks/useAgentEvents.ts#L115-L119`（过滤条件）
- `frontend/src/pages/agent/hooks/useAgentEvents.ts#L454`（持久化）

**Problem**：

```ts
const isTargetSession =
    !event.session_id ||                              // ① 无 session 的事件全收
    event.session_id === activeSessionId ||
    event.session_id === 'ai_agent_default' ||        // ② 默认会话的事件全收
    activeSessionId === 'ai_agent_default'            // ③ 默认会话激活时收下「所有」会话的事件
```

`ai_agent_default` 既是**硬编码的兜底会话 ID**，又在这里被当作**通配符**。当默认会话处于激活状态时，条件③使**任何**会话的事件都被判定为"当前会话"；条件①则放行所有无 session 的事件。后果：

- 后台会话的 `Done` 会执行 `setMessages(...)` 并调用 `API.agentSaveSessionMessages(activeSessionId, copy)`（`#L454`）——**把另一个会话的内容写进 `ai_agent_default` 的历史**；
- `Done`/`Error` 还会 `setIsGenerating(false)`、`setPendingHitl(null)`、`setPendingAsk(null)`（`#L396-L399`），**篡改当前会话的 UI 状态**。

这不是显示错乱，是**持久化层面的数据污染**。后端报告 `docs/architecture-review.md` #6 记录了"服务端会话隔离是假的"，这里是**前端同源的第二个污染点**——两侧都必须修。

**Fix**：改为严格相等匹配（`if (event.session_id && event.session_id !== activeSessionId) return`）；持久化时用 `event.session_id` 而非闭包捕获的 `activeSessionId`。

### #37 【CRITICAL】"对选中内容问 AI"是死功能——事件名拼写不一致

- 生产端：`frontend/src/pages/ssh/terminal/TerminalView.tsx#L351` → `emitEvent('agent:ask', prompt)`
- 消费端：`frontend/src/App.tsx#L155` → `subscribe('ai_agent:ask', ...)`

**Problem**：已全仓库（含全部 Go 代码）核对：**没有任何生产者发出 `ai_agent:ask`，也没有任何订阅者监听 `agent:ask`**。用户选中终端文本、点"问 AI"，代码执行到底但**什么都不会发生**——没有报错、没有提示、没有请求。这是一个完整功能静默失效，且因为事件名是裸字符串（`AnyFn = (...args: any[]) => void`），TypeScript 完全无法发现。

**Fix**：① 统一事件名（建议 `ai_agent:ask`，与 `App.tsx` 的订阅语义一致）；② 建立**类型化事件映射**（见 #41），使这类拼写错误在编译期暴露。

### #38 `emitEvent` 双重派发，且参数形态不一致

- `frontend/src/api.ts#L926-L929`

**Problem**：

```ts
export function emitEvent(event: string, ...args: any[]): void {
    subscribers.get(event)?.forEach((fn) => fn(...args))   // ① 本地同步派发
    Events.Emit(event, args.length === 1 ? args[0] : args) // ② Wails IPC 回环
}
```

已核对 Wails v3 链路：JS `Events.Emit` → Go `messageprocessor_events.go#L36-L47` → `Event.EmitEvent` → `frontendEvents.Send` → `dispatchEventToWindows` → 回落到**发起窗口**的 `window._wails.dispatchWailsEvent`。即同一个事件，每个订阅者会被调用**两次**：一次同步、参数展开；一次异步、`data` 为**数组**（多参数时）。造成副作用重复执行，且多参数事件的参数绑定形态与首次不同。

**Fix**：二选一——删掉本地 map 只依赖 Wails，或只做本地派发不发 IPC；并**统一只传一个 payload 对象**。

### #39 `pendingAskPrompt` 单例在错误的时机被消费，提问永远丢失

- `frontend/src/api.ts#L914-L924`（模块级 `let pendingAskPrompt`）
- `frontend/src/pages/agent/hooks/useAgentComposer.ts#L43-L51`（**仅挂载时**执行 `consumePendingAsk()`）
- `frontend/src/components/app/AiSidebar.tsx#L118`（`<AiAgentPanel/>` 常驻挂载）
- `frontend/src/App.tsx#L156`（`setPendingAsk(question)`）

**Problem**：`AiAgentPanel` 在应用启动时即已挂载，其挂载 effect 在此时执行 `consumePendingAsk()`，而 `pendingAskPrompt` 此刻是 `null`；之后用户从终端触发 `setPendingAsk(question)` 时，**模块级变量变更不会引起任何重渲染**，composer 永远拿不到这个提问。与 #18 同源。

**Fix**：改用 React 状态/context（`AgentAskContext`）或 `useSyncExternalStore`；模块级单例在多窗口、HMR、测试隔离下同样不成立。

### #40 `dropUnsubscriber` 全局槽位 + 清理逻辑会注销别人的订阅

- `frontend/src/api.ts#L931-L953`、`frontend/src/App.tsx#L189-L191`

**Problem**：模块级只保留**一个** unsubscribe 句柄。`App.tsx` 的 effect cleanup 调用 `unregisterNativeFileDrop()` 时，注销的是**当前槽位里的**订阅，而不是该 effect 自己创建的那一个。在 Fast Refresh 重挂载或未来支持多窗口时，**过期的 cleanup 会杀掉新的注册**，原生文件拖放无声失效。另外 `registerNativeFileDrop` 恒返回 `true`，丢弃了真实的注销函数。

**Fix**：改为 `registerNativeFileDrop(handler): () => void`，由调用方持有并直接调用；删除模块级槽位。

### #41 `subscribe` 注册表：重复注册误拆、重复 IPC 绑定、零类型

- `frontend/src/api.ts#L879-L912`

**Problem**：`if (!boundUnsubscribers.has(event))` 有两个失败模式：

1. 用**同一个函数引用**订阅两次时，`Set` 会去重，但任一 unsubscriber 都会移除那唯一一条记录并拆掉 `Events.On` 绑定——**先注册的调用方从此静默收不到事件**；
2. 在派发过程中执行 `subscribe`，若此时最后一个 unsubscribe 刚把 key 删掉，会创建**第二条** `Events.On` 绑定 → 事件重复投递（叠加 #38 的双重派发）。

再加上 `AnyFn = (...args: any[]) => void`，**#37 那类事件名拼写错误无法被发现**。

**Fix**：改为按 `(event, handler)` 引用计数的注册表，返回真实的 `Events.On` 注销函数；用 `EventMap` 联合类型约束事件名与载荷（可直接消灭 #37）。

### #42 遗留 per-session 通道几乎全是死的，且每个 chunk 发 3 次 IPC

- `agent/events/events.go#L184-L249`（每个事件同时发 `agent:event` + `agent:event:<sid>` + 各自的 legacy 通道）
- 前端实际订阅：仅 `agent:event`、`agent:chunk:<sid>`、`agent:ask_user[:sid]`、`agent:hitl_confirm[:sid]`、`agent:session_updated`（`useAgentSessions.ts#L237`）

**Problem**：已逐条核对，**零订阅者**的通道：`agent:reasoning_chunk:*`、`agent:tool_start:*`、`agent:tool_event:*`、`agent:notice:*`、`agent:error:*`、`agent:done:*`、`agent:event:*`——**它们仍在每次往返中被生产并发送**。此外 `agent:session_deleted`（`services/agent_service.go#L710`）与 `wiki:tree-updated`（`agent/wiki/wiki_manager.go#L329,377,406,427`）同样零订阅者，意味着**删除的会话与 Wiki 树变化在界面上永不刷新**。

一个反直觉的结论：前端仍需 `agent:chunk:<id>` 这条 legacy 通道，**唯一原因**是 `agent:event` 的统一 switch **没有 `ChatChunk` 分支**（`useAgentEvents.ts#L130-L478`）。

**Fix**：① 在 `useAgentEvents` 补 `ChatChunk` 分支；② 删除其余全部 legacy 通道，只保留 `agent:event`；③ 补订阅 `agent:session_deleted` 与 `wiki:tree-updated`。

### #43 有生产者、无处理分支的事件被静默丢弃

- Go 侧生产：`agent/events/events.go#L19-L28`（`JobCreated`/`JobProgress`/`JobFinished`/`SubagentCreated`/`SubagentFinished`/`PlanApproved`/`GoalUpdated`）
- 前端 `switch`：`useAgentEvents.ts#L130-L478` **无对应 case，且无 `default`**

**Problem**：已 grep 确认全前端 `src` 对 job/subagent/goal 零引用。**后台作业与子代理的进度对用户完全不可见**，而这类长耗时任务恰恰最需要进度反馈。这与后端报告 #28（7 个事件类型无生产者）是同一问题的另一面：**事件契约两端都没有强制校验**。

**Fix**：补 case，至少加 `default: console.debug(event.type)`；并建立 `agent:event` 载荷的类型定义（与 #41 合并）。

### #44 会话切换竞态 + `isGenerating` 永久卡死

- `useAgentSessions.ts#L145-L154`、`#L91`、`useAgentComposer.ts#L34-L51`、`#L254`

**Problem**：切换会话时，`loadSessionMessages` 的返回值是**旧快照**，会覆盖切换期间已流式到达的新 chunk。更严重的是：`isGenerating` 属于 composer 状态，**没有任何 effect 在 `activeSessionId` 变化时重置它**，于是 `handleSend` 里的 `if (isGenerating) return` 会让**新会话完全无法发送**，直到旧会话的 `Done` 到达——而那个 `Done` 可能已被 #36 的过滤逻辑丢弃。

**Fix**：按会话 key/重置 UI 状态；加载完成后校验 `activeSessionIdRef.current === sessionId` 再写入；`isGenerating` 按会话存储。

### #45 就地修改上一次的 state + 在 updater 内嵌套 `setMessages` 与 IPC 副作用

- `useAgentEvents.ts#L33-L49`、`#L380, #L407-L456, #L430, #L454`、`useAgentComposer.ts#L111`

**Problem**：

```ts
const copy = [...prev]
let last = copy[copy.length - 1]
if (!last || last.role !== 'assistant') { ...; copy.push(last) }
updater(last)      // ← 就地修改了仍然属于 `prev` 的那个对象
return copy
```

`last` 是**上一次 state 持有的同一个对象**，因此已提交的状态被追溯性改写。目前 `ChatMessageList.tsx` 未加 `React.memo` 所以看不出问题，**一旦给消息组件加 memo，它就会静默停止更新**（引用没变）。更严重的是 `Done` 分支在**另一个 `setMessages` updater 内部**再次调用 `setMessages`（`appendOrUpdateAssistant`），还在 updater 内执行 IPC（`#L380`、`#L430`、`#L454`）。React 要求 updater 纯净：并发渲染重放或 StrictMode 双调用会导致**保存 IPC 重复触发**。

**Fix**：改为不可变替换（`copy[i] = { ...last, content }`）；先算出最终数组，再在 updater **外部**统一持久化一次。

### #46 `SessionContext` 巨型 value 无 memo，消费方过度订阅（附具体链路）

- `frontend/src/contexts/SessionContext.tsx#L361-L383`、`frontend/src/App.tsx#L410`

**Problem**：补充 #6 的**具体证据链**——`AiSidebar.tsx#L19` 只取 `{aiSidebarOpen, setAiSidebarOpen}`，却会在**任何**会话新增/标题变更时重渲染，进而重渲染 `<AiAgentPanel>`，从而重新执行 `useAgentSessions`/`useAgentEvents`/`useAgentComposer`。同型消费方：`TitleBar.tsx#L41-L45`、`Stage.tsx#L46`（遍历所有已打开客户端）、`SessionTabs.tsx#L10`、`Sidebar.tsx#L100`、`WikiClient.tsx#L46`。

**Fix**：按关注点拆分（sessions / tabs / layout），或至少 `useMemo` provider value；所有 mutator 已是 `useCallback` 且依赖稳定，拆分成本很低。

### #47 `agentSetActiveConnection` 在每次会话变更时都打一次 IPC

- `frontend/src/contexts/SessionContext.tsx#L234`（依赖数组 `[activeTarget, sessions]`）

**Problem**：effect 体只需要"当前活动会话那一条记录"，但依赖整个 `sessions`（9 个数组）。任何 `updateSession`/`addSession`/dbSize/标题刷新都会重新触发 IPC。**Fix**：用 `useMemo` 派生所需信息，依赖该派生值，并与上次发送值比较后跳过。

### #48 主题与全局错误处理的四处缺口

- `frontend/src/App.tsx#L395-L410`、`frontend/src/theme.ts#L5`、`frontend/src/components/TitleBar.tsx#L125`、`frontend/src/utils/theme.ts#L30`
- `frontend/src/main.tsx#L8`、`frontend/src/utils.ts#L62-L68`

**Problem**：

1. **`system` 主题不会实时跟随系统**：`matchMedia(...).matches` 在 **4 个位置**各自读取一次初值，而全 `src` **不存在任何 `matchMedia(...).addEventListener('change')`**（已 grep 核实）→ 用户切换系统深色模式后应用不变。
2. **无顶层错误边界、无全局拒绝处理器**：`main.tsx` 直接 `root.render(<App />)`；逐页边界只在 `Stage.tsx` 与 `AiAgentPanel` 周围，`TitleBar`/`Sidebar`/`SessionTabs`/`AppContent` 抛错即整屏白屏。且全仓无 `window.onerror` / `unhandledrejection`（已核实）→ `.catch(() => {})` 之外的异步失败**完全不可见**。
3. **`errorMessage()` 对用户取消返回空串，导致 25 处空错误提示**：`utils.ts#L64` 在 `isUserCancelled(err)` 时返回 `''`，而 **25 个调用点**直接 `message.error(errorMessage(err))`（`pages/ssh/file/FilePanel.tsx` 9 处、`App.tsx` 8 处、`pages/mongo/DataTab.tsx` 4 处等）。用户取消对话框后会看到**空白红色提示**。
4. 59 个文件使用**静态** `message`（`App.useApp()` 零使用），虽已挂载 `<AntdApp>`（`App.tsx#L409`），提示仍无法继承应用主题/locale。

Provider 嵌套顺序本身合理（`ConfigProvider > AntdApp > ThemeContext.Provider > SessionProvider > AppContent`）；缺的是 `AntdApp`/`AppContent` 之上的兜底边界。

**Fix**：① 抽基于 `matchMedia` + `useSyncExternalStore` 的 `useSystemTheme`；② 顶层加 `ErrorBoundary` + `unhandledrejection` 上报到 Go 日志；③ `errorMessage` 取消时返回可辨识标记；④ 迁移到 `App.useApp()`。

### 附：本节之外的澄清与两条遗留

- **`contexts/sessionHelpers.ts` 无缺陷**（纯函数 + 按类型分派 + try/catch），仅 `pickFallback`（`#L220`）为未使用死代码。
- **`utils/md5.ts` 实现正确**（真实 UTF-8 编码 `toBytesUTF8` `#L100-L117`、小端 `hex()`、padding 与长度处理无误）；`utils.ts` 的 `formatSize`/`formatTime`/`joinRemote`/`parentRemote`/`base64*`/`isSameCellValue`/`coerceCellValue` 无缺陷。
- **Wails v2 遗留死代码**：`utils.ts#L71` 的 `export const w: any = (window as any).runtime || (window as any).go?.runtime` —— Wails v3 只暴露 `window._wails.*`，因此 `w.OpenFileDialog`/`w.SaveFileDialog` 分支必然抛错；且 `openFileDialog`（`#L74`）/`saveFileDialog`（`#L89`）**全仓零调用**（39 处 `@/utils` 导入均只取 `errorMessage`/`formatSize`/`base64*` 等）。同型：`utils/theme.ts#L38-L41` 的 `win.go?.main?.App?.SetNativeTheme` 永不生效（`bindings/` 中无 `SetNativeTheme`）。**Fix**：删除 v2 分支，对话框统一走 `SystemService` 绑定。
- **`Tree.tsx` 拖拽性能**：`#L418-L420` 每次 `dragover` 无守卫地 `setDropTargetKey/dropPosition/dropToGap`，而 `TreeNodeItem`（`#L60`）未 memo、props 透传到每个节点 → **每个拖拽 tick 全树重渲染**；`isDescendant`（`#L29-L33`）每 tick 两次 DFS。`#L116-L119` 是渲染期 setState。

### 附：行数口径说明

本节与上节的部分行数（如 `mongo/DataTab.tsx` 1216、`mysql/DataTab.tsx` 1110、`ComposeTab.tsx` 1070）来自 `read` 工具，比前文报告中 `Get-Content | Measure-Object -Line` 的计数**多 1~74 行**，差异源于两种口径对"末行无换行符"及 CRLF 的处理不同。**前文的规模描述与重复度量化不受影响**（重复度以逐行 `Compare-Object` 计算，与总行数口径无关）；需精确行数时以 `read` 工具计数为准。

---

## 附：建议实施顺序

> **批次 1 与批次 2 是唯一的"正确性"问题**（类型契约失效、克隆漂移、竞态）；批次 3~5 是结构与工程化，可在功能迭代间隙推进。
>
> 下文批次 1/2 需并入本节《附：状态层与事件总线缺陷》中的 **#36（跨会话数据污染，CRITICAL）** 与 **#37（事件名不一致导致功能静默失效，CRITICAL）**；#38–#47 并入批次 3；#48 并入批次 5。

### 批次 1 — 契约与类型安全（建议 1~2 周）

- [ ] #1 清除 `api.ts` 约 140 处 `as any`，直接使用绑定类型（同时解决 76% 的 `as any`）
- [ ] #10 删除约 20 处恒真的存在性守卫
- [ ] #12 让 `types.ts` 从 `bindings/` 复用后端类型，仅保留前端视图模型
- [ ] #2 打开 `noImplicitAny` / `noUnusedLocals` / `noUnusedParameters`，收敛剩余 `: any` 为 `unknown`

### 批次 2 — 并发正确性与重复消除（建议 2~3 周）

- [ ] #3 抽出 `useDataGrid` + `DataGrid` + `sqlDialect`，MySQL/PostgreSQL `DataTab` 各自瘦身至方言适配
- [ ] #4 样式随之合并为 `DataGrid.module.less`
- [ ] #5 为所有异步 effect 加取消语义（请求序号守卫或 `AbortController`）
- [ ] #7 `pageSize` 钳制 + 表名/schema 白名单或参数化

### 批次 3 — 状态与渲染性能（建议 1~2 周）

- [ ] #6 拆分 `SessionContext` 为 data/actions/ui 三个 context，actions 引用稳定化
- [ ] #14 消除渲染期写 ref
- [ ] #19 修正优化位置：先修 context 与共享组件，再清理页面层散点 memo
- [ ] #18 把 `pendingAskPrompt`、拖放单例移出模块级状态

### 批次 4 — 清理（建议 1 周）

- [ ] #8 删除或接回 `pages/mongo/` 下 6 个 Tab（1,155 行）
- [ ] #17 删除 `redis/ValueEditor.tsx`（291 行）
- [ ] #21 删除空壳桶文件
- [ ] #22 对影响用户判断的查询取消静默降级

### 批次 5 — 工程化护栏（持续，建议立即开始）

- [ ] #15 引入 ESLint（`@typescript-eslint` + `react-hooks` + `no-floating-promises`）、Prettier、`.editorconfig`
- [ ] #15 CI 增加 `tsc --noEmit` + `eslint .` 作为构建前置
- [ ] #16 `main.tsx` 挂载顶层 `ErrorBoundary`
- [ ] #11 明确 i18n 决策（长期单语言则写入文档；有出海计划则按新增代码强制）
- [ ] #13 建立 `reportError` 统一错误出口，替换 64 处静默 `catch`

---

## 附：最主要的 5 个前端重构目标

| 文件 | 规模 | 主要问题 |
|---|---|---|
| `src/api.ts` | 913 行 / 359 方法 | #1、#9、#10、#18 —— 应用唯一的后端契约面 |
| `pages/mysql/DataTab.tsx` + `pages/postgres/DataTab.tsx` | 各 1094 行 / 446 行逐字相同 | #3、#5、#7 |
| `pages/mongo/DataTab.tsx` | 1142 行 | #8（吞并了 6 个 Tab？）、#20 |
| `src/types.ts` | 1123 行 | #12 —— 与 `bindings/` 重复定义 |
| `src/contexts/SessionContext.tsx` | 384 行 | #6、#14 —— 全应用状态与渲染的瓶颈 |

---

## 附：审查方法与已确认的"干净"项

**已核验的正面结论**（不应在重构中破坏）：

- `tsc --noEmit` **零报错**（`strict: true`），构建链路 `tsc && vite build` 可用；
- 目录按业务协议切分（`pages/{ssh,redis,mysql,postgres,mongo,sqlite,docker,k8s,mqtt,api,agent,wiki}`），边界清晰；
- **`ErrorBoundary` 逐页包裹共 16 处**（`components/app/Stage.tsx`），并带 `onClose` 关闭故障会话——这一点优于多数同类项目；
- 样式令牌体系已建立：`styles/variables.less` 提供 **55 个 token**，配 `mixins.less`（71 行）与 `global.module.less`（491 行）；硬编码颜色总计 103 处，其中 **22 处集中在 `variables.less` 自身（即令牌定义处，合理）**，其余分散且量少——token 采纳度实际上是好的；
- CSS Modules 命名策略统一（`vite.config.ts` 配 `[name]__[local]___[hash:base64:5]` + `camelCaseOnly`）；
- 无 `@ts-ignore` / `@ts-expect-error` / `@ts-nocheck`（**0 处**）——类型逃逸用了 `as any` 而非直接压制，至少保留了可搜索性；
- 无 `TODO`/`FIXME`/`HACK` 遗留（**0 处**）；
- 无 tab 缩进混用（0 个文件）；无 `alert()`（0 处）；
- `.npmrc` 配置了 `minimum-release-age=10080`（拒绝安装发布不足 7 天的包以降低供应链风险）——一个值得保留的良好实践；
- `bindings/`（54 个文件）**已纳入版本控制**，前端可在无 Go 工具链环境下类型检查。

**需更正的两处初判**（本报告已采用修正后的结论）：

1. 初判「无错误边界」——**错误**，实际有 16 处逐页边界（见 #16 已改为"缺顶层兜底"）；
2. 初判「`React.memo` 使用 101 处」——**错误**，那是 `useMemo` 的误匹配；`React.memo` 实际为 **0 处**（见 #6）。

**审查方式**：本人完成主线精读（目录规模与函数度量、模块依赖图与孤岛检测、跨文件逐字重复度比对、反模式全量计数与逐条核验、`tsc --noEmit` 实跑、与 Go 后端绑定交叉比对、`git ls-files` 版本控制核对）；另有两路并行深审分别覆盖大页面组件（`pages/*/DataTab.tsx`、`ComposeTab`、`YamlTab` 等）与状态层（`contexts/`、`hooks/`、`api.ts` 事件总线）——其结论已并入本报告，重复或未经核验的条目未予采纳。所有计数均为机器统计值，`file:line` 均经二次核验。
