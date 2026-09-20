# 后端架构与规范审查报告（Go 全量）

> 审查范围：`agent/`、`core/`、`services/`、`ssh/`、`db/`、`redis/`、`mongo/`、`docker/`、`k8s/`、`proto/`（28,207 行非测试代码，12 个测试文件）。
> 审查基线：Go 官方风格 + Effective Go + Uber Go Style Guide。
> 审查方式：包依赖图构建、函数长度与文件规模度量、`go vet ./...` / `go test ./...` 实跑、工具注册名与权限规则交叉比对、三层读码（主线 + `services`/`core` 专项 + 协议客户端专项）。所有 `#L` 定位均经二次核验。
> 审查日期：2026-09-20。**未修改任何源代码。**

**总体结论**：代码**可运行性无问题**——`go vet ./...` 零告警、内部包**无循环依赖**（`main → services → agent/tools → 各协议包 → core` 单向）、`go test` 除 1 例环境相关失败外全绿。但**安全兜底与数据完整性存在系统性缺陷**，根因是同一个：**错误与状态在层与层之间被静默吞掉**。全仓 219 处 `_ =` 丢弃错误、9 个"存了 ctx 但从不读"的管理器、一封被复制 5 遍的 `InsecureIgnoreHostKey()`、一个直接 `return nil` 的空实现方法——这些不是孤立疏漏，而是"没人对失败负责"这一默认约定的产物，最终表现为**安全缺口 + 静默数据损坏 + 误导性 UI**。

另需注意：`docs/agent-harness-review.md`（2026-08-21）已覆盖 `agent/` 包的行为正确性（后台 ctx、SSH 命令注入、子代理死代码等）。**本报告不重复其内容**，聚焦**架构分层、职责划分、依赖管理、错误处理规范**，并补充该报告未涵盖的 `services/` 与协议客户端层。

---

## 结论速览

| # | 问题 | 层级 | 性质 | 优先级 |
|---|------|------|------|--------|
| 1 | `InsecureIgnoreHostKey()` 硬编码 5 处——每条加密通道不验证对端 | ssh/db/docker/k8s | 安全 | **P0** |
| 2 | 权限守卫 fail-open：规则未命中按调用方级别放行，56 个工具全为 Allow | agent/guard | 安全 | **P0** |
| 3 | SQL 审计用前缀判只读 → `SELECT 1; DROP DATABASE` 放行 | agent/guard | 安全 | **P0** |
| 4 | 高危命令子串匹配 → `/bin/rm -rf /` 绕过 | agent/guard | 安全 | **P0** |
| 5 | 凭证加密名单硬编码 8 字段，7 个私钥字段明文落盘 | core/config | 安全 | **P0** |
| 6 | 会话隔离是假的：`GetOrCreateSession(id)` 丢弃 id，全进程单 Session | agent | 正确性 | **P0** |
| 7 | `globalActiveConn` 全局可变状态→跨会话串目标连接 | agent/tools | 正确性 | **P0** |
| 8 | `K8sClient.GetOverview` 吞掉全部错误，永远报告"集群健康" | k8s | 正确性 | **P0** |
| 9 | 14 处 `for rows.Next()` 仅 3 处检查 `rows.Err()`，结果集静默截断 | db/mongo | 正确性 | **P0** |
| 10 | `SaveSettings` 全量快照覆写 → 并发配置互相覆盖 | services | 正确性 | **P0** |
| 11 | `NewStore` 失败降级为空 `Store` → 永久无法保存且界面正常 | services | 正确性 | **P0** |
| 12 | `websearch` 网络失败伪造搜索结果并返回 nil error | agent/tools | 契约 | **P0** |
| 13 | `servers.json` 解析失败静默清空，下次保存覆盖损坏文件 | core/config | 数据丢失 | **P0** |
| 14 | `DockerClient.closed`/`cli` 双锁竞态 → nil 解引用 panic | docker | 并发 | P1 |
| 15 | 9 个管理器 `SetContext` 存 ctx 但从不读取——取消机制是假的 | 全部协议包 | 并发 | P1 |
| 16 | `TransferManager.ctx` 无锁读写 → race detector 必报 | ssh | 并发 | P1 |
| 17 | 持锁执行网络 I/O（`redis.go`/`redis_data.go`） | redis | 并发 | P1 |
| 18 | SFTP 传输 goroutine 无追踪，关闭与传输竞争 | ssh | 并发 | P1 |
| 19 | Redis 操作全部 `context.Background()` 无 deadline | redis | 资源 | P1 |
| 20 | `http.Client` 无 Timeout + 每请求新建 Transport | proto | 资源 | P1 |
| 21 | ReAct 主循环/工具执行 goroutine 全仓 0 处 `recover()` | agent | 稳定性 | P1 |
| 22 | `redis_data.go:468` 闭包无条件 `return nil` → 熔断器永不触发 | redis | 错误处理 | P1 |
| 23 | `mysqlx.go:266` `db.Ping()` 无 ctx | db | 资源 | P1 |
| 24 | 全部 `Close` 包装为 `return nil`，manager 不返回 error | services | 契约 | P1 |
| 25 | `ToolBus.Invoke` 对未实现 `InvokableTool` 的 BaseTool 返回假成功 | agent/tools | 契约 | P1 |
| 26 | `mongo.go:1282` 探针 `DeleteOne` 失败被丢弃 → 残留文档 | mongo | 正确性 | P1 |
| 27 | `guard.rules` 含 3 条无实现死规则 + `api_management` 命名漂移 | agent/guard | 契约 | P1 |
| 28 | 类型断言式事件载荷静默失败；7 个事件类型无生产者 | agent/events | 契约 | P1 |
| 29 | 硬编码 UI 对话框出现在 `db` 层（6 处） | db | 分层 | P1 |
| 30 | `AgentService` 上帝类（32 方法）+ 304 次 `GetContainer()` | services | SRP | P1 |
| 31 | 零状态巨型门面（6 个 service 各 36~44 方法） | services | SRP | P1 |
| 32 | `MongoManager` 54 方法 / `MysqlManagerEx` 57 方法 | mongo/db | SRP | P1 |
| 33 | `core` 依赖 Wails → 持久化层无法无头测试 | core | 依赖倒置 | P1 |
| 34 | 每次 AI 请求重复注册 56 个工具，12 个注册错误静默丢弃 | agent/runtime | SRP | P1 |
| 35 | `AgentManager` 混合 5 职责；`StreamChat` 350 行 | agent | SRP | P1 |
| 36 | `ServerConfig` ~150 字段上帝结构体，混装 9 种协议配置 | core/config | 建模 | P1 |
| 37 | 测试基建缺失：planner 测试写真实 `%APPDATA%` 且当前失败 | agent/planner | 测试 | P1 |
| 38 | CI 只 build 不 test，无 `go vet`/`golangci-lint` | .github | 工程 | P1 |
| 39 | ID 生成不统一：UUID 与毫秒时间戳混用（同毫秒碰撞） | 全仓 | 正确性 | P1 |
| 40 | 无日志框架：全仓 2 处 `log`、0 处结构化日志 | 全仓 | 可观测性 | P1 |
| 41 | `ResolveID` 7 份 / SSH 隧道 4 份 / TLS 4 份 / ResultSet 4 份拷贝 | 协议包 | 重复 | P2 |
| 42 | `GetClient(id)`+`WithTimeout(15s)` 样板 29×/29×，`15s` 常量 35× | services | 重复 | P2 |
| 43 | 两个 WebSocket 库并存（gorilla + coder via Wails） | proto | 依赖 | P2 |
| 44 | 8 处 `AgentApprovePlan`/`AgentSend` 式复制块与 30 行 notice 块 | services | 重复 | P2 |
| 45 | `compose_store.go` 与 `k8s_orchestration_store.go` 近克隆 | core | 重复 | P2 |
| 46 | 只读 SQL 判定 3 份、值归一化 2 份字节相同 | db | 重复 | P2 |
| 47 | 死代码与残留：`ConvertToEinoTools`、`SkillsRegistry.store`、`var _ = strconv.Itoa` 等 | 全仓 | 整洁 | P2 |
| 48 | `BuildRunner` 空实现、`MongoParseURI` 忽略接收者、`redis_data.go:362` 空实现 | agent/mongo/redis | 整洁 | P2 |
| 49 | `AgentGetPendingApprovals() []any` 类型擦除，与类型化方法重复 | services | 契约 | P2 |
| 50 | `AgentDecideApproval` 的 `remember` 参数为死参数 | services | 整洁 | P2 |
| 51 | `LoadApiTree/SaveApiTree` 用 string 搬运 JSON + 37 行内联字面量 | services | 契约 | P2 |
| 52 | `eino` 引 42 indirect 包但仅用 schema/InferTool，框架能力未用 | 依赖 | 依赖 | P2 |
| 53 | `i18n`/字符串判错：`ErrUserStopped` 未定义，用中文字面量控制流 | services | 契约 | P2 |
| 54 | `mongo.go:1294` `"__rollback__"` 字符串匹配判错误类型 | mongo | 契约 | P2 |
| 55 | `ssh_cron.go:62` `"no crontab for"` 文本嗅探，失败返回空 crontab | ssh | 契约 | P2 |
| 56 | `mqtt.go:154,161,300,307` `fmt.Errorf` 缺 `%w` | proto | 错误处理 | P2 |
| 57 | `core/version.go:179` `strconv.Atoi` 错误丢弃 → 版本比较失真 | core | 正确性 | P2 |
| 58 | `Store.ListMessages`/`ListSessions`/`ListSkills` 扫描失败 `continue` | agent/store | 正确性 | P2 |
| 59 | `agent.Storage` 空壳类型直接引用全局 `DefaultRuntime` | agent | SRP | P2 |
| 60 | EventBus 三套通道并行 emit，前端双订阅 + 双字段兜底 | agent/events | 重复 | P2 |
| 61 | 进程级测试后门 `SetAppConfigDirForTest` 存在于生产代码 | core/config | 整洁 | P2 |
| 62 | `postgres.go` 的 3 个无类型 `sync.Map` 与其它 6 个管理器不一致 | db | 一致性 | P2 |

---

## Critical Issues（P0）

### #1 `InsecureIgnoreHostKey()` 硬编码 5 处——每条加密通道都不验证对端身份

- `ssh/ssh.go#L251`
- `db/mysqlx.go#L67`
- `db/postgres.go#L241`
- `docker/docker_client.go#L144`
- `k8s/k8s_client.go#L1084`

**Problem**：这 5 处分别是 SSH 终端、MySQL SSH 隧道、PostgreSQL SSH 隧道、Docker over SSH、K8s over SSH 的唯一握手点，全部把 `HostKeyCallback` 设为 `ssh.InsecureIgnoreHostKey()`。即产品宣称支持的**每一条加密通道都不验证服务端身份**，中间人可完整接管数据库凭据、容器与集群控制面。这不是"某处配置缺失"，而是不安全默认值被复制了 5 份——修复点也在于收敛为一份。

**Fix**：抽 `core/sshx.AuthMethods(cfg, prefix)` + `core/sshx.OpenTunnel(addr, target) (*Tunnel, error)`，`HostKeyCallback` 改为从 `known_hosts` 或首次信任指纹（TOFU）策略取得，**默认拒绝未知主机**；为兼容旧行为提供显式开关（默认关闭，并在 UI 中明确标注风险）。

### #2 权限守卫 fail-open——规则未命中即按调用方级别放行

- `agent/guard/guard.go#L827-L870`
- `agent/tools/db.go#L316`（`db_redis_set`）及同文件 `db_redis_delete`/`db_redis_expire`/`db_redis_execute_raw`

**Problem**：`PolicyGuard.Audit` 在规则表未命中时，最终以**调用方传入的 `defaultLevel`** 收尾；而 `ToolBus.Invoke` 传的是 `RegisteredTool.Level`，全部 56 个注册工具**均为 `guard.LevelAllow`**。真正生效的是 `initDefaultRules()` 里的 `ToolRule` 表——两套并行定义、互不校验，必然漂移。已确认的漏网项：`db_redis_set`/`db_redis_delete`/`db_redis_expire` 是写操作却为 `LevelAllow` 且**不在规则表内**；`db_redis_execute_raw` 更是任意原生命令。

**Fix**：

1. 规则表作为唯一事实源，`RegisteredTool.Level` 删除或退化为可选覆盖；
2. 注册时断言"每个工具都有规则"，缺失即 `panic`（开发期）或降级为 `LevelConfirm`（运行期）；
3. 未命中规则的默认值改为 **`LevelConfirm`（fail-closed）**；
4. 补齐 4 个 Redis 写工具的规则并标注 `LevelConfirm`。

### #3 SQL 审计用前缀判定只读——语句堆叠直接放行

- `agent/guard/guard.go#L421-L427`

**Problem**：`readPrefixes` 用 `strings.HasPrefix(upperSQL, "SELECT ")` 判定只读并 `return LevelAllow`。`SELECT 1; DROP DATABASE prod` 首 token 匹配 → 高危部分被放行。同类问题在 `isPlanModeForbidden`（`guard.go#L794-L809`）重复出现，两处逻辑独立演进。

**Fix**：按 `;` 拆分逐句判定（剥离注释与字符串字面量），任一句为写操作即整体升级为 `LevelConfirm`；把只读/写判定收敛为 `agent/guard/sqlclass.go` 单一实现，供审计与 Plan Mode 共用。

### #4 高危命令黑名单为朴素子串匹配——可轻易绕过

- `agent/guard/guard.go#L15-L26`（`HighRiskCommandPatterns`）
- `agent/guard/guard.go#L372-L378`（匹配逻辑）

**Problem**：`strings.Contains(clean, "rm -rf /")` 无法覆盖 `/bin/rm -rf /`、`rm  -rf /`（双空格）、`rm -rf /*` 之外的变体、以及变量/编码拼接。作为会真实执行破坏性操作的最后一道防线，朴素子串匹配不成立。

**Fix**：改为归一化后按 token 匹配（剥离前导路径、折叠空白、解析常见引号与转义），对 `rm -rf`、`mkfs*`、`dd of=/dev/*`、fork bomb 等做结构化规则；并考虑改为**白名单式危险开关**（默认禁止 `-r`+`-f`+根路径的组合）而非黑名单枚举。

### #5 凭证加密名单硬编码，7 个私钥类字段明文落盘

- `core/config.go#L604-L611`（decrypt）
- `core/config.go#L630-L637`（encrypt）

**Problem**：加解密字段是手写的 8 项清单，而 `DockerTLSClientKey`、`DockerSSHKeyData`、`K8sKeyData`、`K8sSSHKeyData`、`MqttClientKey`、`MysqlSSHKeyData`、`PostgresSSHKeyData` **未纳入**，以明文写入 `%APPDATA%/xClient/servers.json`。清单式实现意味着每新增一个协议字段都会再漏一次。

**Fix**：改为**字段驱动**——在 `ServerConfig` 上以 tag（如 `secret:"true"`）标注敏感字段，`encrypt`/`decrypt` 通过反射统一遍历；或把所有敏感字段收敛为 `map[string]string` / 独立 `Secrets` 结构，使漏标不可能发生。加解密之外，建议将密钥存储迁移到系统凭据库（Windows Credential Manager / Keychain）。

### #6 会话隔离是假的——`GetOrCreateSession(id)` 丢弃 id

- `agent/runtime.go#L230-L237`
- `agent/runtime.go#L83`（唯一的 `defaultSession`）
- `agent/agent.go#L69, L113, L123, L128`、`services/agent_service.go#L39`、`agent/tools/orchestration.go#L36`（硬编码 `"ai_agent_default"`）

**Problem**：

```go
func (rt *AgentRuntime) GetOrCreateSession(id string) *Session {
	return rt.GetSession() // id 被完全丢弃
}
```

全进程只有一个 `Session`，因此：

- `Session.SetCancel`/`Stop`（`agent/session.go#L66-L79`）是**全局**的——用户在 A 会话点"停止"，会掐断并行运行的 B 会话流；
- `planner.GetPlansDir(sessionID)` 按会话分目录，但推理上下文只有一个 session，多会话并存时计划文件与上下文**互相串**；
- 该方法的命名承诺了"创建"，实现是 no-op，比没有这个方法更危险。

**Fix**：`AgentRuntime` 持有 `sessions map[string]*Session` + `sync.RWMutex`，`GetOrCreateSession(id)` 落到实处，`Stop/SetCancel` 按会话隔离；清理所有硬编码的 `"ai_agent_default"`，改为从 ctx 或显式入参取得。

### #7 `globalActiveConn` 全局可变状态——跨会话串目标连接

- `agent/tools/active_conn.go#L22-L41`
- `agent/tools/active_conn.go#L47-L54`（`ActiveConnectionFromContext` 的全局回退）
- 消费方：`agent/tools/db.go#L147, L161, L182, L202, L220`

**Problem**：所有协议工具的默认目标连接来自进程级全局变量，语义是"当前聚焦的 Tab"。两个会话并行提问时，必然有一方取到对方的连接，**可能在错误的机器上执行写操作**。包内已存在正确的 `WithActiveConnection`/`ActiveConnectionFromContext` ctx 方案，却从未被使用（`SetActiveConnection` 只写全局）。

**Fix**：删除 `globalActiveConn` 与全局回退，改为在每次调用时经 ctx 注入当前连接（`activeConnContextKey` 路径），取不到即报错而非猜测。

### #8 `K8sClient.GetOverview` 吞掉全部错误，永远报告"集群健康"

- `k8s/k8s_client.go#L270, L285, L291, L303, L309`

**Problem**：

```go
nodes, _ := c.clientset.CoreV1().Nodes().List(ctx, metav1.ListOptions{})
...
return &K8sOverview{Connected: true, ...}, nil
```

RBAC 被拒、API Server 不可达、网络超时——全部渲染为"已连接，计数为 0"。运维人员会据此判断集群正常。同型：`k8s/k8s_client.go#L565` 的 `_, _ = io.Copy(buf, stream)` 把**截断的 Pod 日志当作完整日志**返回，排障时会推出错误结论。

**Fix**：返回首个错误或 `errors.Join`；`K8sOverview` 增加 `Degraded bool` / `Error string` 字段以区分"空"与"失败"；日志拷贝必须检查 `io.Copy` 返回值与 `stream.Err()`，截断时显式标注。

### #9 结果集静默截断——14 处 `rows.Next()` 仅 3 处检查 `rows.Err()`

- `db/postgresx.go#L299-L309`、`#L494-L504`、`#L1036-L1056`（缺 `rows.Err()`）
- `db/postgres.go#L656-L658`、`#L713-L715`（`rows.Scan` 失败直接 `continue`）
- 反例（正确做法）：`db/mysqlx.go#L457`、`db/sqlite.go#L194`

**Problem**：连接中途断开的结果集被当作**完整结果**返回。对数据库客户端而言这是最危险的一类缺陷——用户会依据不完整数据做决策，且没有任何提示。

**Fix**：统一实现 `db.scanRows(rows *sql.Rows, norm func(any) any) ([]map[string]any, error)`，内部强制 `rows.Err()` 检查；`Scan` 失败不再 `continue` 而是返回错误并附行号。此改动同时消除 4 份重复的 ResultSet 转换（见 #41）。

### #10 `SaveSettings` 全量快照覆写——并发配置互相覆盖

- `services/agent_service.go#L441-L443`、`#L452-L454`
- `services/system_service.go#L47-L58`

**Problem**：

```go
cfg := c.Store.GetSettings() // 返回整个 AppSettings 的快照
cfg.AiWorkspaceDir = dir
_, _ = c.Store.SaveSettings(cfg) // 整体覆写，错误被丢弃
```

`AppSettings` 有 30+ 字段。任意两条并发路径（改工作目录 / 改 AI 设置 / 切换连接）都会互相覆盖对方刚写入的字段，而错误被 `_, _` 吞掉。叠加同一调用链里 `agent.DefaultRuntime.InitOrUpdate(cfg)` 的全量重置，配置漂移几乎必然。

**Fix**：`Store` 提供字段级更新 API（`UpdateAiWorkspaceDir(dir)`、`PatchSettings(func(*AppSettings))`）并在内部持锁完成 read-modify-write；或引入单一设置 owner（串行化写入）。**至少**不能丢弃 `SaveSettings` 的错误。

### #11 `NewStore` 失败降级为空 `Store`——永久无法保存且界面正常

- `services/container.go#L37-L59`

**Problem**：

```go
store, err := core.NewStore()
if err != nil {
	store = &core.Store{} // 空壳，err 被完全丢弃，无日志
}
```

`NewStore` 的失败点通常在 `AppConfigDir()` 或 `load()`，此时 `Store.file`/`dir` 仍为**零值 `""`**。之后 `persist()`（`core/config.go#L652-L656`）会 `WriteFile(".tmp")` → `os.Rename(".tmp", "")`——**此后每一次保存都失败**，而应用看起来完全正常，用户以为配置已保存。

**Fix**：fail-fast——启动即返回错误，由 `main.go` 弹出明确错误对话框并退出；绝不进入"能操作但存不下"的状态。`GetContainer` 改为返回 `(*Container, error)`。

### #12 `websearch` 网络失败伪造搜索结果并返回 nil error

- `agent/tools/websearch.go#L50-L63`

**Problem**：HTTP 请求失败时返回一条编造的 `SearchResultItem`（标题为 `"搜索: <query>"`、链接指向 Google 搜索页）且 `err == nil`。LLM 会把这条编造内容当作**检索到的事实**写入技术方案与 Wiki 知识库。这是工具契约的原则性错误：失败必须显式失败。

**Fix**：`return nil, fmt.Errorf("联网检索失败: %w", err)`；如需降级，返回明确的"检索不可用"提示文本而非伪造的结果条目。

### #13 `servers.json` 解析失败静默清空，下次保存覆盖损坏文件

- `core/config.go#L590-L595`

**Problem**：

```go
if err := json.Unmarshal(data, &wrapper); err != nil {
	s.servers = []ServerConfig{}
	s.settings = DefaultAppSettings()
	return nil // 错误被吞，返回成功
}
```

用户全部连接配置在内存中被清空，且返回 `nil` 表示成功；下一次 `persist()` 会把损坏文件**覆盖**——原始数据永久丢失，无备份、无提示。

**Fix**：解析失败必须返回错误；同时把损坏文件重命名为 `servers.json.corrupt-<ts>` 保留现场，并在 UI 明确告知用户。`persist()` 已有 `.tmp` + `Rename` 的原子写（`core/config.go#L652-L656`），保留该做法并补充写入前备份。

---

## Warnings（P1）

### #14 `DockerClient.closed`/`cli` 双锁竞态 → nil 解引用 panic

- 写：`docker/docker_client.go#L294-L307`（持 `DockerClient.mu`）
- 读：`docker/docker_manager.go#L42, L61, L74, L97, L101, L113`（仅持 `DockerManager.mu`）
- 无锁解引用：`docker/docker_client.go#L314`（`d.cli.Ping(ctx)`）

**Problem**：`Disconnect` 与 `Ping`/`ListContainers` 竞争时，`d.cli` 已被置 nil 而读方仍在使用 → panic。同型问题见 `k8s/k8s_client.go#L240-L244` vs `k8s/k8s_manager.go#L110-L124`。

**Fix**：`closed` 改 `atomic.Bool`，`cli` 通过持锁访问器暴露（`isClosed()` / `apiClient() (*client.Client, error)`），调用点统一走访问器。

### #15 9 个管理器 `SetContext` 存 ctx 但从不读取——取消机制是假的

- `ssh/ssh.go#L130, L137`、`ssh/sftp.go#L66, L82`、`db/mysqlx.go#L200, L208`、`db/sqlite.go#L27, L35`、`mongo/mongo.go#L429, L437`、`docker/docker_manager.go#L14, L31`、`k8s/k8s_manager.go#L14, L31`、`proto/ws.go#L68, L76`、`proto/mqtt.go#L29, L37`

**Problem**：共 9 个 `SetContext` 定义，全仓对 `ctx` 字段的**真实读取仅 1 处**（其余均为赋值行）。用户点"停止"时，驱动层的 `QueryContext`/网络请求收不到取消信号——`gui.ExecuteDAG` 层面的取消无法下沉。`MongoManager.SetContext` 还在无锁情况下写字段。Uber Go Style Guide 明确要求不要把 `Context` 存在结构体里。

**Fix**：删除这些 `ctx` 字段与 `SetContext` 方法，`ctx` 改为方法参数逐层透传（各协议方法的签名已普遍接受 ctx，只需传入真实请求 ctx 而非 `context.Background()`）。

### #16 `TransferManager.ctx` 无锁读写 → race detector 必报

- 写：`ssh/sftp.go#L81-L83`
- 读：`ssh/sftp.go#L97`、`#L114`

**Problem**：传输在其它 goroutine 上运行时读 `tm.ctx`，无任何同步。

**Fix**：构造期用 `sync.Once` 一次性捕获，或 `atomic.Pointer[context.Context]`；更好的做法见 #15（不存储 ctx）。

### #17 持锁执行网络 I/O

- `redis/redis_data.go#L338-L344`（持 `rc.mu` 调 `ps.Close()`）
- `redis/redis.go#L246-L256`（持 `rc.mu` 调 `client.Close()`）

**Problem**：连接卡住会阻塞所有 `Subscribe`/`Subscriptions`/`ResolveID` 调用。反例：`mongo/mongo.go#L549-L558` 的 `Close` 做法是正确的。

**Fix**：在锁内收集句柄，解锁后再执行关闭。

### #18 SFTP 传输 goroutine 无追踪，关闭与传输竞争

- `ssh/sftp.go#L578`、`#L612`（启动传输，无 WaitGroup/完成信号）
- `ssh/sftp.go#L177-L187`（`CancelAll`/`CloseAll` 无法等待）

**Problem**：SFTP 客户端可能在复制进行中被关闭。**Fix**：维护在飞计数（`sync.WaitGroup` 或原子计数），关闭时等待（带超时上限）。

### #19 Redis 操作全部 `context.Background()`，无 deadline

- `redis/redis_data.go#L21, L34, L45, L59, L73, L91, L109, L123, L137, L151, L166, L201, L244, L293, L371, L383, L403, L421`
- `redis/redis.go#L455, L466, L496, L620, L714, L727, L740, L755, L773`

**Problem**：`rc.do(ctx, ...)` 只检查熔断器（`redis/redis.go#L233-L244`），不施加 deadline；正确性完全依赖客户端 `ReadTimeout` 配置。**Fix**：由管理器按操作类型派生 `context.WithTimeout`。

### #20 `http.Client` 无 Timeout + 每请求新建 Transport

- `proto/httpapi.go#L116-L130`

**Problem**：

```go
transport := &http.Transport{TLSClientConfig: &tls.Config{InsecureSkipVerify: req.InsecureTLS}}
defer transport.CloseIdleConnections()
client := &http.Client{Transport: transport}
ctx := context.Background()
```

既无 `Client.Timeout` 也无 ctx deadline（16MB `LimitReader` 在 `#L152` 只约束大小不约束时间）——服务端 accept 后挂起即**永久阻塞**。每请求重建 Transport 又彻底放弃了 keep-alive 连接池。

**Fix**：进程级共享一个 `http.Transport`，请求用 `context.WithTimeout` 派生；`InsecureSkipVerify` 改为按请求的独立 client 缓存而非重建 Transport。

### #21 ReAct 主循环/工具执行 goroutine 零 `recover()`

- `agent/agent.go#L517`、`agent/executor/executor.go#L181`、`agent/shell/shell.go#L207, L234`

**Problem**：全仓 **0 处 `recover()`**。任一工具 panic（例如 #14 的 nil 解引用、`agent/tools/workspace.go#L558-L569` 潜在 nil 的 `info.Name()`）直接终结桌面进程。

**Fix**：工具执行与流式循环统一包一层 recover，转为 `ToolResult{OK:false, Error:"工具内部异常"}` 并记录堆栈；`errgroup` 中每个 goroutine 同样处理。

### #22 `redis_data.go` 闭包无条件 `return nil` → 熔断器永不触发

- `redis/redis_data.go#L452-L469`

**Problem**：`_ = rc.do(ctx, func(...) error { ...; return nil })` 中的闭包在 `#L468` 无条件返回 `nil`，`Info()` 的失败永远无法到达熔断器。

**Fix**：闭包返回真实错误；`rc.do` 的返回值不得丢弃。

### #23 `mysqlx.go:266` `db.Ping()` 无 ctx

- `db/mysqlx.go#L266`（对比 `#L237` 已正确使用 `PingContext`）

**Problem**：DSN 的 `timeout=10s`（`#L169`）只约束拨号，握手中途挂起不受控。**Fix**：统一 `PingContext`。

### #24 全部 `Close` 包装为 `return nil`——manager 不返回 error

- `services/mysql_service.go#L24-L27`、`postgres_service.go#L28`、`redis_service.go#L27`、`mongo_service.go#L27`、`mqtt_service.go#L23`、`sqlite_service.go#L21`
- 根因：`redis/redis.go#L363`、`proto/mqtt.go#L54`、`mongo/mongo.go#L549`、`db/mysqlx.go#L373, L473`、`db/postgres.go#L500`、`db/sqlite.go#L83, L231` 均不返回错误

**Problem**：`return nil` 断言了代码无法知道的事实——用户看到"已断开"，连接可能仍在。**Fix**：manager 的 `Close*` 返回 `error`，service 层透传。

### #25 `ToolBus.Invoke` 对未实现 `InvokableTool` 的 BaseTool 返回假成功

- `agent/tools/bus.go#L219-L236`

**Problem**：若 `BaseTool != nil` 但不实现 `tool.InvokableTool`，既不执行也不报错，`resultObj` 保持 nil，最终返回 `{OK: true, Data: nil}`——静默假成功。

**Fix**：显式返回 `&ToolResult{OK:false, Error:"工具未实现 InvokableTool 接口"}`。

### #26 `mongo.go:1282` 探针 `DeleteOne` 失败被丢弃

- `mongo/mongo.go#L1282`

**Problem**："插入后删除"的校验探针若删除失败，探针文档**永久残留在用户集合**中。**Fix**：检查错误并至少记录；更好的是改用 `$jsonSchema` 本地校验，避免写入用户数据。

### #27 `guard.rules` 死规则与命名漂移

- `agent/guard/guard.go#L233`（`ssh_list_containers`——无对应实现）
- `agent/guard/guard.go#L341-L342`（`skill_load`/`skill_list`——无对应实现）
- `agent/guard/guard.go#L812`（判断 `api_management`，而注册名为 `api_manager`，见 `agent/tools/api_manager.go`）

**Problem**：规则表与工具注册表无一致性校验，已出现 3 条死规则与 1 处命名漂移（后者导致 Plan Mode 下拦不住 API 树删除）。**Fix**：见 #2 第 2 点（注册期一致性断言）。

### #28 类型断言式事件载荷静默失败；7 个事件类型无生产者

- `agent/events/events.go#L190-L250`（`if p, ok := e.Payload.(XxxPayload); ok` 失败即静默丢弃）
- `agent/events/events.go#L19-L28`：`EventJobCreated`/`EventJobProgress`/`EventJobFinished`/`EventSubagentCreated`/`EventSubagentFinished`/`EventPlanApproved`/`EventGoalUpdated` 全仓无生产者，前端亦无消费者

**Problem**：事件契约无法自证，载荷类型不匹配时静默丢失，调试成本极高。**Fix**：`Emit` 改为泛型 `Emit[T any](e Event[T])` 或载荷改为 `json.RawMessage` + 显式类型标签；删除孤儿事件类型。

### #29 硬编码 UI 对话框出现在 `db` 层（6 处）

- `db/mysqlx.go#L1486, L1501, L1594`、`db/postgresx.go#L1180, L1196`、`db/sqlite.go#L219`

**Problem**：数据层调用 `core.SaveFileDialog`/`core.OpenFileDialog`，使 `db` 包依赖 GUI，既无法无头测试也无法复用。**Fix**：导入/导出流程改为接受 `io.Reader`/`io.Writer` 或目标路径，由 `services/` 层负责选文件。

### #30 `AgentService` 上帝类 + 304 次 `GetContainer()`

- `services/agent_service.go`（786 行、32 个导出方法、仅 1 个字段）
- 服务定位器调用：`services/*.go` 中 `GetContainer()` 共 **304 次**

**Problem**：`AgentService` 同时承担 LLM 流式、计划生命周期、会话/DB CRUD、设置持久化、工作区配置、技能目录 shell-out（`#L630-L651` 起 `explorer`/`open`/`xdg-open`）、HITL 管道与 UI 事件发射。**Fix**：拆 `ChatService` / `PlanService` / `SessionService` / `WorkspaceService`，并注入依赖替代服务定位器。

### #31 零状态巨型门面

- `services/mysql_service.go`（44 方法）、`mongo_service.go`（44）、`k8s_service.go`（40）、`docker_service.go`（38）、`redis_service.go`（37）、`postgres_service.go`（36）

**Problem**：这些类型 0 字段、无状态，只是把 manager 的每个方法机械包一层（Wails 绑定需要方法）。`DockerService` 单文件覆盖 9 个不相关关注点：连接、容器、镜像、卷、网络、prune、compose 栈、compose 记录持久化、exec 会话、AI 生成。**Fix**：`DockerService` 拆 `DockerContainerService`/`DockerImageService`/`DockerComposeService`/`DockerExecService`；其余按领域拆分或评估代码生成。

### #32 `MongoManager` 54 方法 / `MysqlManagerEx` 57 方法

- `mongo/mongo.go#L427-L431`（3 字段、54 方法、2041 行）+ `mongo/mongo_tx.go`
- `db/mysqlx.go#L198-L202`（3 字段、57 方法、1607 行）

**Problem**：`MongoManager` 混合连接注册表、服务端内省、catalog DDL、schema 推断、JSON-Schema 校验、查询构建、CRUD、批量写、聚合、索引管理、事务、change stream；`MysqlManagerEx` 混合隧道/DSN/TLS 构建、DDL、用户与授权、状态与慢日志、CSV/SQL/JSON 导入导出、以及 UI 对话框（见 #29）。**Fix**：按资源种类拆分（`MongoRegistry`/`MongoCatalog`/`MongoQueryService`/`MongoStreamHub`/`MongoIndexService`；MySQL 拆 tunnel、DDL、admin、io）。

### #33 `core` 依赖 Wails → 持久化层无法无头测试

- `core/dialogs.go#L6`、`core/events.go#L4`

**Problem**：`core` 直接 import `wailsapp/wails/v3/pkg/application`，把持久化/事件层绑死在桌面框架上——这是"11 个包零测试"的结构性原因之一（见 #37）。**Fix**：在 `core` 定义 `Dialogs` 与 `EventSink` 小接口，由 `main.go` 注入 Wails 实现。

### #34 每次 AI 请求重复注册 56 个工具，注册错误静默丢弃

- `agent/runtime.go#L130-L177`（`SetManagers` 内注册 12 组工具）
- 调用点：`services/agent_service.go#L48, L156, L284, L418`、`services/container.go#L75`

**Problem**：`SetManagers` 接受 9 个**位置参数**（顺序错编译器不报错），且函数体每次重新注册全部工具；`services/agent_service.go` 在**每次 AI 请求**里都调用它——即每次对话重复注册 56 个工具。12 个 `Register*` 的返回 `error` **全部 `_ =` 丢弃**（`agent/runtime.go#L154-L176`）：某工具注册失败时，AI 只是"莫名少了这个能力"，零日志线索。**Fix**：入参改结构体；工具注册只在 `Container.Startup` 执行一次，`InitOrUpdate` 只更新配置（`AiEnableWebSearch` 走单点 `Unregister`/`Register`）；注册错误聚合返回。

### #35 `AgentManager` 混合 5 职责；`StreamChat` 350 行

- `agent/agent.go#L456-L804`（`StreamChat`，含 ReAct 循环、心跳、事件发射、工具分发、think 标签解析）
- `agent/agent.go#L195-L360`（`buildSchemaMessages`，165 行，系统提示词拼接 10 余处 `fmt.Sprintf`）
- `agent/agent.go#L372-L433`（`applyContextCompression`）

**Problem**：ReAct 主循环、提示词装配、消息 DTO 转换、上下文压缩、会话起名五件事混在一个类型里。**Fix**：拆 `ReActLoop`、`PromptBuilder`（模板化）、`MessageCodec`、`ContextCompressor`、`TitleGenerator`。

### #36 `ServerConfig` 上帝结构体

- `core/config.go#L58-L215`（约 150 字段）
- 派生长函数：`Validate` `#L317-L420`（约 104 行）、`ConnType` `#L218`、`Label` `#L240`、`DisplayPort` `#L274`

**Problem**：SSH/Redis/MySQL/PostgreSQL/MongoDB/MQTT/SQLite/Docker/K8s 九种协议的配置全部平铺在一个结构体里，导致 `Validate` 变成巨型 `switch`，也让 #5 的加密清单必然遗漏。**Fix**：`ServerConfig` 保留通用字段 + 各协议独立子结构（`Redis *RedisConfig` 等），校验由 `ConnType` 分派到独立 validator。

### #37 测试基建缺失：planner 测试写真实 `%APPDATA%` 且当前失败

- `agent/planner/planner_test.go`（`TestPlanner_SavePlanMarkdown_UpdateLifecycle` 失败：`mkdir C:\Users\...\AppData\Roaming\xClient\plans\...: Access is denied`）
- 对照：`core/config.go#L491` 已有 `SetAppConfigDirForTest` 钩子

**Problem**：`planner`/`skills`/`wiki` 各自拼路径，**均不支持注入**，测试写真实用户目录、互相污染、无法在只读环境/CI 稳定运行。全仓 28,207 行生产代码仅 2,478 行测试；`ssh/db/redis/mongo/docker/k8s/services/executor/verifier/store/memory/events` **零测试文件**。**Fix**：为这些包引入路径注入（复用 `AppConfigDir` 思路），修掉失败用例，优先为 `guard`/`executor`/`ToolBus`/`store` 补单测。

### #38 CI 只 build 不 test

- `.github/workflows/build.yml`（仅 `wails3 build` + 打包，无 `go test`/`go vet`/`golangci-lint`）

**Problem**：本报告绝大多数错误处理问题（`errcheck` 可全量捕获）与 #37 的失败用例没有任何拦截网。**Fix**：新增 lint/test job 并作为 release 的前置依赖。

### #39 ID 生成不统一（同毫秒碰撞）

- UUID：`core/config.go#L861, L913`、`core/compose_store.go#L113`、`core/k8s_orchestration_store.go#L123`、`services/docker_service.go#L454`、`ssh/sftp.go`、`proto/mqtt.go` 等
- 毫秒时间戳：`services/agent_service.go#L279`（`trace_%d`）、`#L419`（`retry_%d`）、`#L681`（`sess_%d`）、`agent/ask/ask.go#L41`（`ask_%d`）、`agent/guard/guard.go#L92`（`hitl_%d`）、`agent/planner/planner.go#L138`（`plan_%d`）

**Problem**：`time.Now().UnixMilli()` 生成会话/计划/审批 ID，**同一毫秒内两次调用会产生相同 ID**（HITL 与 Ask 的 ID 直接作为 pending map 的键）。**Fix**：统一改为 UUIDv4（或 `crypto/rand` 助手），随后可考虑移除 `google/uuid` 依赖。

### #40 无日志框架：全仓 2 处 `log`、0 处结构化日志

**Problem**：上述所有被吞掉的错误在运行期**完全不可见**，唯一信号是发往 UI 的 Wails 事件载荷。而大量模块（`guard`、`ToolBus`、`planner`、`executor`）已经持有 `SessionID`/`TraceID`，却从不写日志——对一个会执行 `rm -rf`、`DROP DATABASE` 的工具，缺少审计线索不可接受。**Fix**：引入 `log/slog`（标准库，零新依赖），在容器中注入 logger；安全拦截、工具失败、配置写入失败必须落盘。

---

## Suggestions（P2）

### #41 协议层重复实现

| 重复项 | 份数 | 位置 |
|---|---|---|
| `ResolveID` 连接注册表 | 7 | `redis/redis.go#L285`、`mongo/mongo.go#L456`、`db/mysqlx.go#L348`、`db/sqlite.go#L114`、`db/postgres.go#L569`、`docker/docker_manager.go#L91`、`k8s/k8s_manager.go#L88` |
| SSH 隧道 + 认证构造 | 4 + 3 | `db/mysqlx.go#L34`、`db/postgres.go#L205`、`docker/docker_client.go#L238`、`k8s/k8s_client.go#L1069`、`ssh/ssh.go#L187` |
| TLS 配置 + 证书加载 | 4 + 3 | `mongo/mongo.go#L164, L205`、`docker/docker_client.go#L194, L230`、`proto/mqtt.go#L150, L295, L334, L349` |
| ResultSet → `[]map[string]any` | 4 | `db/mysqlx.go#L439`、`db/sqlite.go#L179`、`db/postgresx.go#L299, L494` |

**Fix**：抽 `core.Registry[T]`、`core/sshx`、`core/tlsx.ClientConfig(...)`、`db.scanRows(rows, norm)`。

### #42 `services/` 层样板

- `K8sMgr.GetClient(id)` **29 次**、`DockerMgr.GetClient(id)` **29 次**、`WithTimeout(context.Background(), 15*time.Second)` **35 次**、`GetContainer()` **304 次**
- 8 处相同连接前言（`mysql_service.go#L17`、`docker_service.go#L27`、`k8s_service.go#L24`、`postgres_service.go#L20`、`redis_service.go#L16`、`mongo_service.go#L16`、`mqtt_service.go#L15`、`ssh_service.go#L20`）

**Fix**：泛型助手 `withClient[T](mgr, id, timeout, fn)` + `resolveConfig(id) (core.ServerConfig, error)`。

### #43 两个 WebSocket 库并存

- `proto/ws.go#L17`（`gorilla/websocket`）vs `go.mod#L40`（`coder/websocket`，Wails v3 已引入）

**Fix**：统一到 `coder/websocket`，移除 `gorilla/websocket` 直接依赖。

### #44 服务层复制粘贴块

- `AgentSend` `services/agent_service.go#L60-L101` vs `AgentProposePlan` `#L206-L263`（约 30 行 notice/error/done 三态处理复制）
- `AgentConfirmTool` `#L590`、`AgentDecideApproval` `#L597`、`AgentResolveHitl` `#L131` — 同一 `ResolveApproval` 的三个包装
- `DockerService` 与 `K8sService` 的 AI 引导块：`docker_service.go#L540-L543` vs `k8s_service.go#L372-L375`

**Fix**：抽 `agentRuntimeReady()` 与 `emitAgentOutcome(...)` 助手；三个审批方法合并为一个。

### #45 `core` 两个记录存储近克隆

- `core/compose_store.go`（164 行）vs `core/k8s_orchestration_store.go`（177 行）

**Fix**：合并为泛型 `jsonRecordStore[T]{mu sync.RWMutex; file string; list []T}`。

### #46 `db` 只读判定与值归一化重复

- `db/mysql.go#L57 isReadQuery`、`db/sqlite.go#L204 sqliteIsReadQuery`、`db/postgresx.go#L457 isPgReadQuery`（三套前缀集，已出现分歧）
- `db/mysql.go#L12 normalizeMysqlVal` 与 `db/sqlite.go#L140 normalizeSqliteVal` 字节级相同

**Fix**：合并为 `db/sqldialect.go`（与 #3 的 SQL 分类器统一）。

### #47 死代码与残留

- `agent/tools/bus.go#L298 ConvertToEinoTools`（导出但全仓无调用者）
- `agent/skills/skills.go#L35` `SkillsRegistry.store` 字段注入后从未使用
- `db/mysqlx.go#L1607` `var _ = strconv.Itoa`（占位声明压制未使用导入）
- `core/version.go` 与 `proto/httpapi.go` 中可清理的未使用导出

**Fix**：删除，并开启 `unused`/`deadcode` 检查。

### #48 空实现与忽略接收者

- `agent/session.go#L62 BuildRunner`（保留的空 no-op）
- `mongo/mongo.go#L114 MongoParseURI`（忽略接收者）
- `redis/redis_data.go#L362-L364 KeyspaceNotify`（直接 `return nil`，前端按"已完成"处理）

**Fix**：删除或改为明确返回 `errors.New("暂不支持")`。

### #49 绑定层类型擦除

- `services/agent_service.go#L604 AgentGetPendingApprovals() []any` → 生成的 `frontend/bindings/.../agentservice.ts` 中唯一的 `any[]`，前端需 `as any` 绕（`frontend/src/api.ts`）
- 它与会话内已存在的类型化方法 `AgentGetPendingHitls() []*guard.HitlRequest`（`#L138`）返回同一列表

**Fix**：删除 `AgentGetPendingApprovals`。

### #50 死参数

- `services/agent_service.go#L597 AgentDecideApproval` 的 `remember` 参数（全仓仅声明处出现一次）

**Fix**：删除参数或实现其语义。

### #51 原始 JSON 跨绑定传递

- `services/api_service.go#L82 LoadApiTree() (string, error)`、`#L107 SaveApiTree(content string) error`
- `services/api_service.go#L35-L71`（37 行内联默认 JSON 字面量）

**Fix**：绑定类型化结构或 `json.RawMessage`；默认树改为 `go:embed` 资源。

### #52 `eino` 依赖使用面过窄

- `go.mod#L6`（`cloudwego/eino`）引入 42 个 indirect 包
- 实际使用：`schema.Message`（27 文件）、`components/tool/utils.InferTool`、`adk/filesystem` 接口（6 文件）
- **未使用**：框架的 graph/compose 与 ReAct agent（`agent/agent.go` 的 ReAct 循环是手写的）

**Fix**：评估是否值得为 `InferTool` 的 JSON Schema 生成承担整个依赖树（含 sonic/base64x/gonja 等）；若保留，至少在文档中说明取舍。同时 `gopkg.in/yaml.v3` 作为直接依赖与 indirect 的 `go-yaml.in/yaml/v2,v3` 重复，应统一。

### #53 字符串字面量当错误码

- `services/agent_service.go#L69, L215`：`if err.Error() == "用户手动停止了推导"`
- `core/dialogs.go#L9-L15`：`strings.Contains(strings.ToLower(err.Error()), "cancelled"/"canceled"/"cancel")`

**Fix**：定义 `var ErrUserStopped = errors.New("用户手动停止了推导")` 并用 `errors.Is`；对话框取消改用 Wails 自身的 sentinel。

### #54 `"__rollback__"` 字符串匹配判错误类型

- `mongo/mongo.go#L1294`（抛出）与 `#L1299`（`strings.Contains` 匹配）

**Problem**：任何文本中含该字面量的驱动错误都会被误判为"回滚成功"。**Fix**：sentinel error + `errors.Is`。

### #55 `"no crontab for"` 文本嗅探

- `ssh/ssh_cron.go#L62`

**Problem**：exec 失败且输出为空时会穿透，返回空 crontab 当作成功。**Fix**：以退出码判定，文本匹配仅作辅助。

### #56 `fmt.Errorf` 缺 `%w`

- `proto/mqtt.go#L154, L161, L300, L307`

**Fix**：改 `%w`，使调用方可 `errors.Is/As` 底层 `os.ReadFile`/`x509` 错误。

### #57 `strconv.Atoi` 错误丢弃

- `core/version.go#L179`：`n, _ := strconv.Atoi(s)` —— 非法版本段静默变 0，`CompareVersions` 结果失真

**Fix**：检查错误并回退为字符串比较或返回错误。

### #58 `agent/store` 扫描失败 `continue`

- `agent/store/store.go#L263-L265`（`ListMessages`）、`#L350-L352`（`ListSessions`）、`#L451-L453`（`ListSkills`）

**Problem**：行扫描失败被跳过，返回看似完整但缺行的列表。**Fix**：返回错误或至少累计并上报跳过行数。

### #59 `agent.Storage` 空壳类型

- `agent/agent.go#L59-L131`（零字段，三个方法全部直接引用全局 `DefaultRuntime.Store`）

**Fix**：删除该类型，把序列化职责合并进 #35 的 `MessageCodec` 并注入 `*store.Store`。

### #60 EventBus 三套通道并行 emit

- `agent/events/events.go#L166-L250`：进程内 handler + `agent:event` + `agent:event:<sid>` + 9 个 legacy 通道
- 为兼容前端在同一 map 里同时填 `call_id`/`id`、`tool_name`/`name`、`input`/`args`、`output`/`result`（`#L224-L233`）
- 前端因此双订阅 + 逐字段 `||` 兜底：`frontend/src/pages/agent/hooks/useAgentEvents.ts#L52, L113`

**Fix**：只保留 `agent:event` 一条流，删除 legacy 通道与重复字段别名。

### #61 生产代码中的测试后门

- `core/config.go#L485-L495`（`SetAppConfigDirForTest` 进程级全局）

**Fix**：#33 的依赖注入落地后，改为构造期传入目录，删除全局钩子。

### #62 `db/postgres.go` 的 `sync.Map` 用法不一致

- `db/postgres.go#L189-L191`（3 个无类型 `sync.Map`，与其余 6 个管理器的 `map` + `sync.RWMutex` 模式不同，丢失键类型安全）

**Fix**：随 #41 的 `Registry[K,V]` 一并统一。

---

## 附：建议实施顺序

> **批次 1（安全）请勿与其他批次混排。** #1、#2 是当前唯一会直接影响用户生产环境的两项；其余问题影响数据完整性、可维护性与可测试性。

### 批次 1 — 安全（建议 1~2 周）

- [ ] #1 `InsecureIgnoreHostKey` 收敛为 `core/sshx` 单点，接入 `known_hosts`/TOFU
- [ ] #2 权限规则表唯一化 + 未命中改 `LevelConfirm` + 注册期一致性断言
- [ ] #3 SQL 审计按 `;` 拆分逐句判定（与 #46 合并实现）
- [ ] #4 高危命令归一化 token 匹配
- [ ] #5 凭证加密改字段驱动（tag 或独立 `Secrets` 结构）

### 批次 2 — 数据完整性（建议 1 周）

- [ ] #9 补 `rows.Err()`（11 处），抽 `db.scanRows`
- [ ] #8 `K8sClient.GetOverview` 返回错误；日志/流拷贝检查截断
- [ ] #11 `Container` 初始化失败 fail-fast
- [ ] #10 `SaveSettings` 改字段级 patch
- [ ] #12/#13/#24/#25/#26/#48 清理 6 处"假成功"路径

### 批次 3 — 并发与基础设施（建议 1~2 周）

- [ ] #39 统一 ID 生成（`crypto/rand`/UUIDv4），消除毫秒碰撞
- [ ] #15/#16 删除 9 个无用 `ctx` 字段；ctx 改参数透传
- [ ] #14 `DockerClient`/`K8sClient` 改原子/持锁访问器
- [ ] #17/#18/#19/#20/#23 资源与超时治理
- [ ] #21 `errgroup` + `recover()` 包裹工具执行
- [ ] #40 引入 `slog`，记录拦截/失败/配置写入，携带 `SessionID`+`TraceID`

### 批次 4 — 去重（建议 2~4 周）

- [ ] #41 `core.Registry[T]`、`core/sshx`、`core/tlsx`、`db/sqldialect.go`、`db.scanRows`
- [ ] #42 `withClient`/`resolveConfig` 泛型助手（消除 300+ 处样板）
- [ ] #45 `jsonRecordStore[T]`
- [ ] #44/#46/#60 服务层与事件层去重

### 批次 5 — 结构拆分（建议 3~4 周）

- [ ] #32 `MongoManager`/`MysqlManagerEx`/`SessionManager`/`DockerClient`/`K8sClient` 按资源种类拆分
- [ ] #29 把 UI 对话框从 `db` 层上移到 `services/`
- [ ] #30/#31 `AgentService` 与 6 个巨型门面拆分
- [ ] #35 `AgentManager` 拆 ReAct 循环 / PromptBuilder / MessageCodec / ContextCompressor
- [ ] #36 `ServerConfig` 按协议拆分；`core/config.go` 拆包
- [ ] #6/#7 会话与活动连接改为按会话隔离
- [ ] #34 工具注册移出请求路径，注册错误聚合上报

### 批次 6 — 护栏（持续）

- [ ] #38 CI 增加 `go test ./...` + `go vet` + `golangci-lint`（至少 `errcheck`、`govet`、`staticcheck`、`unused`）
- [ ] #33 注入 `Dialogs`/`EventSink` 接口，解除 `core` 对 Wails 的依赖
- [ ] #37 修复 planner 失败用例，为 `guard`/`executor`/`ToolBus`/`store` 补单测
- [ ] #47/#48 死代码清理

---

## 附：最主要的 5 个文件级重构目标

| 文件 | 规模 | 主要问题 |
|---|---|---|
| `mongo/mongo.go` | 2041 行 / 54 方法 | #32 上帝类、#41 重复、#26 假成功 |
| `db/mysqlx.go` | 1607 行 / 57 方法 | #32、#29 UI 对话框入数据层、#9 `rows.Err()` |
| `core/config.go` | 1048 行 | #36 上帝结构体、#5 加密遗漏、#13 静默清空、#61 测试后门 |
| `agent/agent.go` | 882 行 | #35 五职责混合、#53 字符串判错 |
| `agent/tools/db.go` | 482 行单函数 | #2 权限遗漏、#34 注册错误丢弃 |

---

## 附：审查方法与已确认的"干净"项

**已核验的正面结论**（不应在重构中破坏）：

- 内部包**无循环依赖**，依赖方向为 `main → services → agent/tools → {ssh,db,redis,mongo,docker,k8s,proto} → core`；
- `go vet ./...` **零告警**，`go build` 通过；
- `core.Store.persist()` 已是 `.tmp` + `Rename` 原子写（`core/config.go#L652-L656`）；
- `ssh/ssh.go#L312-L326` keep-alive ticker 正确 `defer ticker.Stop()`；
- `ssh/ssh.go#L489-L512` 使用带缓冲 `resChan`，超时路径不泄漏 goroutine；
- `mongo/mongo_tx.go#L218-L245` change-stream goroutine 通过 `streams` map 正确取消；
- `mongo/mongo.go#L549-L558` 的 `Close` 是正确的"锁内收集、锁外关闭"写法（可作 #17 的参考实现）；
- 全仓 **无 `panic()`、无 `os.Exit()`、无 `init()`**（副作用集中在包级变量初始化，见 #11）；
- 无 `defer` in loop、无裸 `recover()` 掩盖错误。

**审查方式**：三层并行——主线逐文件精读（包依赖图、函数长度与文件规模自动度量、`go vet`/`go test` 实跑、工具注册名与 `guard.rules` 交叉比对）；`services/`+`core/` 专项深审；协议客户端专项深审。所有 `#L` 均二次核验；对自动化度量的量化结论做了抽样复算（其中两处经复算后大于初始估计：`K8sMgr.GetClient` 29 次而非 27 次，`services/` 中 `GetContainer()` 304 次）。"干净"项为机械核验否定性结论，非抽样推断。
