# 文件组织规范与命名约定

> 适用项目：xClient（Wails + React + TypeScript + Less + Go）
> 目的：统一代码库结构，落实单一职责原则（SRP），控制单文件规模，降低维护成本。
> 配套任务：对现有超过阈值的长文件进行拆分（见 `docs/REFACTOR_PLAN.md`）。

---

## 1. 规模阈值（硬约束）

| 类型 | 文件 | 单文件上限 | 超出判定 |
| --- | --- | --- | --- |
| 前端组件 | `*.tsx` | 200 行 | 必须拆分 |
| 前端逻辑/Hook | `*.ts` | 200 行 | 必须拆分 |
| 前端样式 | `*.module.less` | 250 行 | 建议拆分（按视图/业务域）|
| 后端代码 | `*.go` | 300 行 | 建议拆分（按业务域）|
| 后端业务函数 | 单函数 | 80 行 | 建议抽取子函数 |

> 行数统计以「非空代码行」为参考，注释与空行不计入阈值但应保持精简。
> 超出阈值的文件在 PR 中必须附带拆分说明，或由负责人评审豁免（豁免需书面理由）。

---

## 2. 目录结构

### 2.1 后端（Go，包名统一为 `main`）

```
terminal/
├── main.go              # 仅做 Wails 启动装配，禁止写业务
├── app.go               # App 门面：绑定方法路由 + 生命周期，保持轻量
├── config.go            # 配置存储（Store）相关
├── ssh.go / sftp.go     # SSH 会话与文件传输
├── redis/               # Redis 业务域（新增目录，按能力拆分）
│   ├── manager.go       # 连接管理、熔断、连接池
│   ├── base.go          # 基础 KV 命令（get/set/hash/list/set/zset）
│   ├── cluster.go       # sentinel/cluster 模式
│   ├── publish.go       # pub/sub
│   └── admin.go         # info/slowlog/monitor/queue
├── mysql/               # MySQL 业务域（新增目录）
│   ├── manager.go       # 连接管理、DSN
│   ├── query.go         # 查询/增删改/导入导出
│   ├── schema.go        # 表结构/索引/ER 图数据
│   └── admin.go         # 用户/状态/变量/备份
├── mqtt/                # MQTT 业务域
│   ├── manager.go
│   └── client.go
├── ws/                  # WebSocket 业务域
│   ├── manager.go
│   └── handler.go
└── shared/              # 跨域工具（证书加载、SQL 方言、格式化等）
    └── util.go
```

**规则**
- 每个业务域独占一个子目录，目录下 `manager.go` 负责连接生命周期，其余文件按**能力**命名。
- `App` 结构体只持有各域 Manager，绑定方法统一在该域的 `manager.go` / `handler.go` 中定义，避免 `app.go` 膨胀。
- 跨域复用的纯函数放 `shared/`，禁止在 `shared/` 引用 Wails runtime 之外的业务状态。

### 2.2 前端（React + TS + Less）

```
frontend/src/
├── components/
│   ├── common/          # 通用展示组件（无业务状态）
│   │   ├── Icon.tsx
│   │   ├── Modal.tsx
│   │   ├── CodeEditor.tsx
│   │   └── StatusBadge.tsx
│   ├── layout/          # 容器/布局组件
│   │   ├── Sidebar.tsx
│   │   └── App.tsx
│   ├── session/         # 会话类容器
│   │   ├── TerminalView.tsx
│   │   └── FilePanel.tsx
│   ├── mysql/           # MySQL 客户端（拆分后）
│   │   ├── MysqlClient.tsx        # 容器：状态编排
│   │   ├── MysqlSidebar.tsx       # 展示：库/表树
│   │   ├── MysqlDataGrid.tsx      # 展示：结果表格
│   │   ├── MysqlSqlEditor.tsx     # 展示：SQL 编辑器 + 结果
│   │   ├── MysqlErDiagram.tsx     # 展示：ER 图
│   │   ├── MysqlUsers.tsx
│   │   ├── MysqlStatus.tsx
│   │   └── useMysql.ts             # 自定义 Hook：连接/查询逻辑
│   ├── redis/           # Redis 客户端（拆分后）
│   │   ├── RedisClient.tsx
│   │   ├── RedisKeyView.tsx
│   │   ├── RedisCli.tsx
│   │   └── useRedis.ts
│   ├── mqtt/            # MQTT 客户端（拆分后）
│   │   ├── MqttClient.tsx
│   │   ├── MqttMessageList.tsx
│   │   ├── MqttPubForm.tsx
│   │   └── useMqtt.ts
│   └── api/             # API 调试工具（拆分后）
│       ├── ApiClient.tsx          # 容器：模式切换 + 编排
│       ├── HttpRequest.tsx        # 展示：HTTP 请求/响应
│       ├── WsClient.tsx           # 展示：WebSocket 面板
│       ├── ApiHistory.tsx
│       ├── ApiConfigTabs.tsx      # 请求头/体/鉴权/选项
│       └── useApi.ts / useWs.ts   # 自定义 Hook
├── hooks/               # 跨组件通用 Hook（如 useEvent、useLocalStorage）
├── api.ts               # 后端绑定调用封装（thin wrapper，不超过 200 行，按域分段）
├── types.ts             # 全局类型（按域分段，单类型块不超过 80 行）
├── utils.ts             # 通用工具函数
└── styles/
    ├── variables.less   # 设计变量（颜色/间距/圆角/字体）
    ├── mixins.less      # 复用 mixin
    ├── global.module.less
    └── modules/         # 组件样式，与组件同名同目录或集中一处
        ├── MysqlClient.module.less
        └── ...
```

**规则**
- 组件按「容器（Container）/ 展示（Presentational）」分层：**容器**只管状态、事件与数据流；**展示**只接收 props 渲染，不发请求、不持有业务 state。
- 复杂交互状态（如 MySQL 多 Tab、WebSocket 连接）抽成 `useXxx.ts` 自定义 Hook，组件内不超过 10 个 `useState`。
- 每个「页面级」容器对应一个同名 `*.module.less`；可复用小组件样式就近放在所属模块的样式文件，或抽 `common.module.less`。

---

## 3. 命名约定

### 3.1 后端（Go）

| 类别 | 约定 | 示例 |
| --- | --- | --- |
| 文件/目录 | 小写蛇形（snake_case） | `mysql/query.go`、`redis/publish.go` |
| 包 | 小写单字，业务域同名 | `package redis`、`package mysql` |
| 导出类型 | 大驼峰 PascalCase | `MysqlManager`、`WsConn` |
| 管理器 | `<域>Manager` 或 `<域>Mgr` | `redisManager`、`wsManager` |
| 业务方法 | 大驼峰，动词开头 | `MysqlQuery`、`RedisPublish` |
| 私有工具 | 小驼峰 camelCase | `buildMysqlDSN`、`loadCertPool` |
| 常量 | 大驼峰或全大写下划线 | `RedisModeCluster`、`MAX_BODY` |
| 错误变量 | `err` 前缀或 `Err` 后缀 | `ErrConnClosed` |

- 绑定到前端的方法必须写在对应业务域文件，命名与前端 `api.ts` 调用一致（如 `API.mysqlRun` ↔ `MysqlRun`）。
- 一个 Go 文件只承载一个清晰职责，例如 `redis/base.go` 只放基础 KV 命令，不放 pub/sub。

### 3.2 前端（TS / TSX / Less）

| 类别 | 约定 | 示例 |
| --- | --- | --- |
| 组件文件 | PascalCase，与默认导出组件同名 | `MysqlDataGrid.tsx` |
| 容器 vs 展示 | 容器可带 `Client`/`Panel` 后缀，展示用名词 | `MysqlClient`（容器）、`MysqlDataGrid`（展示）|
| Hook 文件 | `use` 前缀 + 大驼峰 | `useMysql.ts`、`useWs.ts` |
| 样式模块 | 与组件同名 + `.module.less` | `MysqlClient.module.less` |
| CSS 类名 | camelCase（CSS Modules 默认） | `dataGrid`、`statusBadge` |
| 类型/接口 | PascalCase | `MysqlQueryResult`、`ApiMode` |
| 工具函数 | camelCase，动词开头 | `formatJson`、`errorMessage` |
| 事件回调 | `on` + 事件名 / `handle` + 动作 | `onClose`、`handleSend` |

- Props 接口命名：`XxxProps`；展示组件优先 `React.FC<XxxProps>` 或函数签名。
- 状态变量：`const [xxx, setXxx] = useState(...)` 严格成对，避免 `tmpXxx` 之类模糊命名。
- Less 中按「块注释 + 区块」组织，如 `/* 数据表格 */`，单文件超过 250 行按视图拆成多个 `*.module.less` 并在组件内分别 import。

---

## 4. 拆分原则（落地 Checklist）

1. **单一职责**：一个文件只回答「它负责哪一块功能」。
2. **接口清晰**：拆分后父子通过显式 props / 函数参数通信，禁止跨文件共享可变全局变量。
3. **零回归**：拆分不改变任何对外行为；后端绑定方法名、前端 `API.*` 调用签名保持不变。
4. **就近组织**：被多个文件共用的类型提升 `types.ts`；被共用的样式提取 `variables.less`/`mixins.less` 或 `common.module.less`。
5. **可测试**：纯逻辑（格式化、SQL 构造、DSN 拼装）优先抽成无状态函数，便于单测。
6. **逐步提交**：每个文件拆分独立成 commit，便于 review 与回滚。

---

## 5. 现有超长文件清单（待拆分）

> 完整行数与拆分方案见 `docs/REFACTOR_PLAN.md`。

**后端（Go）**
- `redis.go` (1251) → `redis/` 多文件
- `mysqlx.go` (841) → `mysql/` 多文件
- `mysql.go` (896) → `mysql/manager.go` + `mysql/query.go`
- `sftp.go` (616)、`ssh.go` (413)、`config.go` (437)、`app.go` (319)、`mqtt.go` (310)

**前端（TSX）**
- `MysqlClient.tsx` (1435) → `mysql/` 容器 + 展示 + `useMysql`
- `RedisClient.tsx` (788) → `redis/` 容器 + 展示 + `useRedis`
- `ApiClient.tsx` (795) → `api/` HTTP + WS + 历史 + 配置
- `ServerDialog.tsx` (648)、`App.tsx` (595)、`FilePanel.tsx` (384)、`MqttClient.tsx` (280)

**前端（Less）**
- `MysqlClient.module.less` (845)、`ApiClient.module.less` (723)、`RedisClient.module.less` (496)、`global.module.less` (529)、`MqttClient.module.less` (289)

**前端（TS）**
- `types.ts` (448) 按域分段、`api.ts` (334) 按域分段
