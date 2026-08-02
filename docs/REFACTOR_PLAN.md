# 长文件拆分计划（Refactor Plan）

> 配套文档：`docs/CODE_ORGANIZATION.md`（组织规范与命名约定）
> 目标：单文件不超阈值、单一职责、零回归、接口清晰。
> 统计基线日期：2026-08-02

---

## 0. 拆分总原则

1. 后端绑定方法名（如 `MysqlRun`、`RedisPublish`、`WsConnect`）**保持不变**，前端 `api.ts` 调用签名不变 → 前端无需改动调用点。
2. 前端 `API.*` 封装与组件 props 接口保持不变，仅内部目录重组。
3. 每个拆分独立提交，构建/类型检查必须通过后再进入下一个文件。
4. 复用逻辑下沉：类型→`types.ts`，工具→`utils.ts`/`shared/`，样式变量→`variables.less`/`mixins.less`。

---

## 1. 后端拆分

### 1.1 `redis.go`（1251 → 拆分为 `redis/` 目录）

| 新文件 | 行数预估 | 职责 | 来源函数 |
| --- | --- | --- | --- |
| `redis/manager.go` | ~200 | 连接管理、熔断、连接池、模式探测 | `redisManager*`、`circuitBreaker*`、`RedisModeInfo`、`RedisConnect`、`RedisClose` |
| `redis/base.go` | ~220 | 基础 KV/Hash/List/Set/ZSet 读写 | `RedisGet/Set/Delete/Expire`、`RedisHash*`、`RedisList*`、`RedisSet*`、`RedisZSet*` |
| `redis/pubsub.go` | ~120 | 发布订阅 | `RedisPublish/Subscribe/PSubscribe/Unsubscribe`、`RedisSubscriptions` |
| `redis/admin.go` | ~220 | 运维类 | `RedisInfo`、`RedisSlowLog`、`RedisMonitor`、`RedisKeyspaceNotify`、`RedisQueue*`、`RedisDBSize` |
| `redis/serialize.go` | ~80 | 序列化/反序列化与编解码 | `serializeValue`、`deserializeValue`、`RedisRaw` |

> 注意：原 `RedisConnInfo`、`RedisModeInfo` 等类型随 manager 迁移；`shared/util.go` 放证书/JSON 辅助。

### 1.2 `mysqlx.go`（841 → 拆分为 `mysql/` 目录）

| 新文件 | 职责 | 来源函数 |
| --- | --- | --- |
| `mysql/manager.go` | 连接管理、`MysqlConnectEx`、`MysqlCloseEx`、SSH 隧道 | `mysqlExMgr*`、`newMysqlManager`(扩展) |
| `mysql/query.go` | 查询/增删改/导入导出/CSV | `MysqlRun`、`MysqlInsert/Update/Delete`、`MysqlExport*`、`MysqlImport*`、`MysqlQueryCSV` |
| `mysql/schema.go` | 库/表/结构/索引/ER 数据 | `MysqlDatabases/Tables`、`MysqlDescribe`、`MysqlCreateTable/DropTable`、`MysqlIndexes`、`MysqlSchema`、`MysqlTableStatus` |
| `mysql/admin.go` | 用户/状态/变量/备份 | `MysqlUsers`、`MysqlGrants`、`MysqlStatus`、`MysqlVariables`、`MysqlProcessList`、`MysqlSlowLog`、`MysqlBackup` |

### 1.3 `mysql.go`（896 → `mysql/manager.go` + `mysql/query.go`）

- 基础连接管理（`mysqlManager.open/close/get`）并入 `mysql/manager.go`。
- `MysqlSelect/Count/Describe/CreateDatabase/DropDatabase/CreateIndex/DropIndex` 并入 `mysql/query.go` 与 `mysql/schema.go`。
- 与 `mysqlx.go` 共享的 DSN 构造、方言辅助抽到 `mysql/dsn.go` 或 `shared/`。

### 1.4 其余后端文件（小幅）

- `sftp.go`（616）：`normalizeRemote`、`removeRemote`、`uploadBase64` 等工具抽到 `sftp_util.go`；传输逻辑保留。
- `ssh.go`（413）：会话创建/读写/resize 与 `SessionManager` 定义可分离为 `session.go`。
- `config.go`（437）：`Store` 与 `ServerConfig` 的方法（`connType()` 等）分离为 `config_store.go` 与 `config_types.go`。
- `app.go`（319）：仅保留 App 结构体与生命周期钩子，`MqttConnect` 等迁移到 `mqtt/` 后此处只做路由绑定。
- `mqtt.go`（310）：迁至 `mqtt/manager.go` + `mqtt/client.go`。
- `ws.go`（207，未超 300）：保持，按规范补 `ws/manager.go` 归属说明即可。

---

## 2. 前端拆分

### 2.1 `MysqlClient.tsx`（1435 → `mysql/` 多文件）

- `mysql/useMysql.ts`：连接、库表加载、Tab 状态、SQL 执行、ER 数据。
- `mysql/MysqlSidebar.tsx`：库/表树（展示）。
- `mysql/MysqlDataGrid.tsx`：结果表格 + 单元格编辑（展示）。
- `mysql/MysqlSqlEditor.tsx`：SQL 编辑器 + 结果区（展示）。
- `mysql/MysqlErDiagram.tsx`：ER 图 SVG（展示，已含布局算法）。
- `mysql/MysqlUsers.tsx`、`mysql/MysqlStatus.tsx`：运维页（展示）。
- `mysql/MysqlClient.tsx`：容器，组合上述 + 编排。
- 样式 `MysqlClient.module.less`（845）按区块拆为 `mysql/*.module.less` 或保留单文件但分段（≤250 行则保留，否则拆 `MysqlGrid.module.less` 等）。

### 2.2 `RedisClient.tsx`（788 → `redis/`）

- `redis/useRedis.ts`：连接、key 列表、值读写、pub/sub 状态。
- `redis/RedisKeyView.tsx`：各类数据结构查看/编辑（展示）。
- `redis/RedisCli.tsx`：命令行（展示）。
- `redis/RedisClient.tsx`：容器。
- 样式 `RedisClient.module.less`（496）按视图拆 `RedisKeyView.module.less` + `RedisCli.module.less`。

### 2.3 `ApiClient.tsx`（795 → `api/`）

- `api/useApi.ts`：HTTP 请求、历史、配置状态。
- `api/useWs.ts`：WebSocket 连接/消息/发送。
- `api/ApiHistory.tsx`：历史面板（展示）。
- `api/ApiConfigTabs.tsx`：请求头/体/鉴权/选项（展示）。
- `api/HttpRequest.tsx`：HTTP 请求条 + 响应区（展示）。
- `api/WsClient.tsx`：WebSocket 面板（展示）。
- `api/ApiClient.tsx`：容器，模式切换（HTTP/WS）。
- 样式 `ApiClient.module.less`（723）拆 `ApiHistory.module.less` + `WsClient.module.less` + 保留主文件。

### 2.4 其余前端文件

- `MqttClient.tsx`（280）：抽 `mqtt/MqttMessageList.tsx` + `mqtt/MqttPubForm.tsx` + `mqtt/useMqtt.ts`，容器保留。
- `ServerDialog.tsx`（648）：按协议（SSH/Redis/MySQL/MQTT）拆 `ServerForm*.tsx`，容器只做路由与保存。
- `App.tsx`（595）：会话列表/连接逻辑下沉到 `hooks/useSessions.ts`，App 只做布局与路由。
- `FilePanel.tsx`（384）：拆 `SftpTree.tsx` + `TransferList.tsx`。
- `Sidebar.tsx`（226）：略超，抽 `SidebarItem.tsx` 即可。
- `types.ts`（448）：按域分段（Server/Redis/MySQL/MQTT/API），不改内容。
- `api.ts`（334）：按域分段注释，行数可接受，重点在配套 `useXxx` Hook。

---

## 3. 执行顺序与验收

1. 先拆**纯逻辑/工具**（后端 `shared/`、`mysql/dsn.go`；前端 `useXxx`）→ 风险最低。
2. 再拆**单域容器+展示**（MySQL/Redis/MQTT/API）→ 独立可验证。
3. 最后拆**基础设施**（App/Sidebar/ServerDialog/全局样式）。
4. 每步验收：`go build .` 通过；`cd frontend && npm run build` 通过；人工核对 UI 行为不变。

---

## 4. 风险与缓解

| 风险 | 缓解 |
| --- | --- |
| 后端绑定方法改名导致前端调用失败 | 方法名严格不变；`api.ts` 不改签名 |
| CSS Modules 类名跨文件引用错乱 | 拆分样式时同步更新 import 与类名，构建报错即发现 |
| 循环依赖（Hook 与容器互相 import） | 容器 import 展示与 Hook；Hook 不 import 容器 |
| 大量文件改动导致 review 困难 | 每文件一 commit，PR 描述标注对应新文件 |
