# xClient — 多协议开发运维桌面客户端

基于 [Wails v2](https://wails.io) + React + TypeScript + xterm.js 的跨平台桌面客户端。
集成了 SSH 终端、SFTP 文件管理、Redis、MySQL、MQTT 与 HTTP 接口调试等常用运维工具，
所有连接在同一窗口内以标签 / 侧栏形式管理，互不干扰。

![xClient 主界面](docs/image.png)

![xClient SSH 终端](docs/image-ssh.png)

## 功能

**终端**
- 多服务器、多会话，标签页切换，会话切走后输出不丢失
- 真实 PTY（`xterm-256color`），支持窗口自适应、颜色、鼠标滚动、超链接
- 支持密码认证与私钥认证（可带 passphrase），30s 心跳保活
- 右键菜单：复制 / 粘贴 / 清屏

**SFTP 文件管理（与终端复用同一条 SSH 连接）**
- 目录浏览、面包屑导航、路径直达、过滤、隐藏文件开关
- **拖拽上传**：从系统文件管理器直接把文件/文件夹拖到右侧文件面板即可上传（自动递归目录）
- **右键菜单**：下载、删除（目录递归删除）、重命名、复制路径、新建文件夹、上传
- 多选（Ctrl / Shift）批量下载与删除
- 传输队列：实时进度、速率占比、失败原因、单任务取消、清除已完成

**Redis**
- 多 DB 切换，按模式（pattern）模糊查询，基于 SCAN 游标分页，切换 DB 不丢失已浏览结果
- 多种数据结构查看与编辑：string / hash / list / set / zset
- 新建键值、设置值、删除键、设置 TTL（过期时间）
- 支持发送任意原始命令（Raw Command）
- 显示各 DB 键数量（DBSize）

**MySQL**
- 多数据库、多数据表浏览，表结构（DESCRIBE）查看、索引与表状态查看
- 数据网格浏览，支持分页（limit / offset）、切换每页行数、固定表头与斑马纹
- 单元格在线编辑（新增/修改/删除行，NULL 处理），原表直写
- 自定义 SQL 执行（多标签 + 历史），结果以统一的表格样式展示
- 数据库对象管理：建库 / 删库、建表 / 删表、清空表、建索引 / 删索引
- 用户权限：查看用户与授权（GRANT）
- 服务器状态监控：状态变量、系统变量、进程列表、慢查询日志
- ER 关系图：自动根据外键生成表关系图
- 数据导入 / 导出：支持导出为 SQL / CSV / JSON（到剪贴板或本地文件），并支持从剪贴板 / 文件导入；整库 SQL 备份

**SQLite**
- 通过文件选择器从本地选取 `.db` / `.sqlite` 文件，无需填写主机 / 端口
- 连接管理：打开 / 切换数据库文件，显示文件路径与大小、连接状态
- 浏览库内所有表与视图，点击查看数据预览（分页）、表结构、索引
- 统一的表格展示样式（独立滚动容器 + 吸顶表头 + 斑马纹），与 MySQL 客户端一致
- 纯 Go 驱动（`modernc.org/sqlite`），无 cgo 依赖，跨平台开箱即用

**常用开发工具集**（位于 API 调试上方）
- **MD5 哈希**：输入文本实时计算 32 位 MD5，一键复制（零依赖实现）
- **时间戳转换**：当前时间戳实时刷新（秒级 / 毫秒级），支持时间戳 ↔ 日期双向互转，一键复制
- **Base64 编解码**：文本实时编码 / 解码，分段展示

**MQTT**
- 连接 MQTT Broker（支持账号密码等配置）
- 发布消息：指定主题、QoS、是否保留（retained）
- 订阅 / 取消订阅主题（指定 QoS），查看当前订阅列表
- 接收消息实时展示

**API 接口调试（HTTP 客户端）**
- 支持 GET / POST / PUT / PATCH / DELETE / HEAD / OPTIONS
- 地址自动补全协议头：未填写 `http://` 或 `https://` 时默认补 `http://`
- 自定义请求头（可启停）、请求体（无 / JSON / 文本 / XML，JSON 可一键格式化）
- 鉴权：无 / Basic / Bearer
- 选项：超时（ms）、忽略 TLS 证书校验（InsecureSkipVerify）、跟随重定向
- 响应展示：状态码（按 2xx/3xx/4xx/5xx 着色）、耗时、大小、响应头、JSON 美化与复制
- 请求历史：保存最近 30 条，支持单条删除与一键清空，并持久化到本地（`localStorage`），重启后保留

**连接管理**
- 服务器配置本地持久化，密码 / 私钥 / passphrase 使用 AES-GCM 加密存储
- 配置目录：`%APPDATA%/xClient`（Windows）、`~/.config/xClient`（Linux/macOS）

## 代码结构与文件功能

### 后端结构 (Go Backend)

```
terminal/
├── main.go               // Wails 应用主入口，初始化窗口参数与系统级文件拖放
├── app.go                // 向前端暴露的 Wails 统一 API 门面 (Facade) 绑定层
├── core/                 // 核心基础设施与通用配置
│   ├── config.go         // 服务器连接配置管理、读写与敏感字段 AES-GCM 加密存储
│   └── sftp.go           // SFTP 目录/文件读写、上传下载任务队列与传输进度广播
├── ssh/                  // SSH 协议与 Linux 系统运维工具
│   ├── ssh.go            // SSH 连接建立、PTY 交互终端 Shell 与实时输出推流
│   ├── ssh_cron.go       // Crontab 定时任务查询、解析与编辑
│   ├── ssh_dashboard.go  // 服务器 CPU、内存、磁盘及网络系统资源实时监控
│   ├── ssh_docker.go     // Docker 容器与镜像管理接口
│   ├── ssh_process.go    // 进程列表查询 (ps) 与进程终止 (kill)
│   └── ssh_service.go    // Systemd 系统服务状态查看与控制 (start/stop/restart)
├── redis/                // Redis 数据库引擎
│   ├── redis.go          // Redis 客户端连接管理、基本 Key 扫描与键值增删改
│   ├── redis_data.go     // Redis Pipeline 批量操作、MULTI 事务、Pub/Sub 与 Queue 消息队列
│   └── redis_utils.go    // Redis 数据转换与格式化工具函数
├── mongo/                // MongoDB 数据库引擎
│   ├── mongo.go          // MongoDB 基础连接、数据库/集合浏览及文档 CRUD 操作
│   └── mongo_tx.go       // MongoDB 聚合管道 (Aggregate)、ChangeStream 监听、索引与 Schema 校验
├── db/                   // 关系型数据库引擎 (MySQL / SQLite)
│   ├── mysql.go          // MySQL 连接池管理、网格数据预览、表结构查询与单元格更新
│   ├── mysqlx.go         // MySQL 扩展工具（SQL/CSV/JSON 导入导出及整库 SQL 备份）
│   └── sqlite.go        // SQLite 纯 Go 驱动连接管理、表/结构/索引/数据查询
└── proto/                // 网络接口调试引擎
    ├── httpapi.go        // HTTP / RESTful API 请求发包引擎（支持 Header/Body/Auth/TLS）
    └── ws.go             // WebSocket 客户端连接管理与双向消息推流
```

### 前端结构 (React + TypeScript Frontend)

```
frontend/src/
├── main.tsx              // React 应用入口与 DOM 挂载
├── App.tsx               // 全局根组件，集成 Sidebar 侧栏、SessionTabs 标签页、Stage 主舞台与 Setting 弹窗
├── api.ts                // Wails 绑定 API 统一封装与后端 EventEmitter 事件订阅总线
├── types.ts              // 全局 TypeScript 类型定义（服务器配置、会话信息、API 数据模型）
├── utils.ts              // 全局辅助函数库（字节格式化、时间格式化、Base64 编解码、错误捕获）
├── styles/               // 全局 CSS/LESS 设计 Token 与样式系统
│   ├── global.module.less// 全局通用按钮、标签、微调组件样式库
│   ├── mixins.less       // LESS 通用布局 Mixins 与动画函数
│   └── variables.less    // 设计 Token（主题色、间距、字体、圆角、层级）
├── components/           // 跨页面复用的纯粹共享 UI 组件
│   ├── ClientIcon.tsx    // 协议图标渲染组件（SSH / Redis / MySQL / Mongo / SQLite / MQTT）
│   ├── CodeEditor.tsx    // 基于 CodeMirror 的代码与文本编辑器组件
│   ├── ContextMenu.tsx  // 全局右键上下文菜单
│   ├── DevTools.tsx      // 常用开发工具小组件（MD5、时间戳转换、Base64 编解码）
│   ├── Icon.tsx          // 矢量 SVG 图标组件库
│   ├── Modal.tsx         // 确认对话框 (ConfirmModal) 与输入对话框 (PromptModal)
│   ├── ServerDialog.tsx  // 新建/编辑服务器连接配置对话框组件
│   ├── Sidebar.tsx       // 侧边栏服务器列表、分组管理与连接控制
│   ├── TransferBar.tsx   // 底部 SFTP 文件传输任务进度栏
│   └── app/              // 顶层框架辅助组件
│       ├── SessionTabs.tsx// 已连接多协议会话顶栏标签页
│       └── Stage.tsx      // 主内容舞台组件，根据当前 Tab 路由激活客户端
└── pages/                // 按业务域和功能拆分的页面模块
    ├── api/              // HTTP / WebSocket API 接口调试页面
    │   ├── ApiClient.tsx       // HTTP API 调试主框架
    │   ├── ApiConfigTabs.tsx   // 请求参数 / Params / Headers / Body / Auth 配置面板
    │   ├── ApiHistory.tsx      // 请求历史记录侧边栏
    │   ├── HttpRequest.tsx     // 请求 URL 地址栏与响应结果展示面板
    │   ├── WsClient.tsx        // WebSocket 双向通信测试面板
    │   ├── apiShared.module.less// API 模块共享样式
    │   ├── apiTypes.ts         // API 模块专用类型
    │   └── useApi.ts           // API 状态管理 Hook
    ├── mongo/            // MongoDB 数据管理页面
    │   ├── MongoClient.tsx     // MongoDB 客户端主框架与侧栏数据库/集合树
    │   ├── AggregateTab.tsx    // 聚合管道 (Aggregate Pipeline) 构建与执行
    │   ├── ChangeStreamTab.tsx // 实时 Change Stream 事件流监听
    │   ├── DocumentsTab.tsx    // 集合文档 JSON 列表、分页查询与文档增删改
    │   ├── IndexesTab.tsx      // 集合索引列表与建索引操作
    │   ├── MonitorTab.tsx      // MongoDB 服务器状态与健康监控
    │   ├── SchemaTab.tsx       // 集合 Schema 字段分析与 Validator 验证器配置
    │   ├── mongoShared.module.less// Mongo 模块共享样式
    │   └── mongoTypes.ts       // Mongo 模块专用类型
    ├── mqtt/             // MQTT 客户端页面
    │   └── MqttClient.tsx      // MQTT 消息发布/订阅、QoS 控制与接收列表
    ├── mysql/            // MySQL 数据管理页面
    │   ├── MysqlClient.tsx     // MySQL 客户端主框架与侧栏数据库/数据表树
    │   ├── CellEditorInline.tsx// 数据表格行内单元格编辑器
    │   ├── DataTab.tsx         // 表格数据网格预览与行级增删改
    │   ├── ErDiagram.tsx       // 外键 ER 关系图生成与展示
    │   ├── IoModal.tsx         // SQL/CSV/JSON 数据导入导出与备份对话框
    │   ├── ObjModal.tsx        // 建库/建表/删表/建索引/删索引管理对话框
    │   ├── SqlEditor.tsx       // 自定义 SQL 执行与结果展示编辑器
    │   ├── StatusCard.tsx      // 状态指标卡片展示组件
    │   ├── StatusPanel.tsx     // MySQL 服务器状态与变量监控面板
    │   ├── UsersPanel.tsx      // MySQL 用户账户与 Grant 权限列表
    │   ├── dbTable.module.less // 关系型数据库统一表格展示样式
    │   ├── mysqlShared.module.less// MySQL 模块共享样式
    │   └── mysqlTypes.tsx      // MySQL 模块专用类型
    ├── redis/            // Redis 键值与高级特性调试页面
    │   ├── RedisClient.tsx     // Redis 调试客户端主框架
    │   ├── BatchPanel.tsx      // Pipeline 批量执行与事务 (MULTI/EXEC/WATCH) 面板
    │   ├── KeyItemTree.tsx     // 树状 Key 分层目录展示组件
    │   ├── KeysTab.tsx         // Key 搜索、树状/平铺切换、TTL、值编辑器与命令行 CLI
    │   ├── KeyspaceTab.tsx     // 键事件监听与慢查询日志列表
    │   ├── MonitorTab.tsx      // 熔断状态、命中率与连接池监控看板
    │   ├── PubSubTab.tsx       // 频道/模式发布订阅面板
    │   ├── QueueTab.tsx        // List 与 Stream 消息队列入队/出队面板
    │   ├── ValueEditor.tsx     // Hash / List / Set / ZSet 细粒度修改编辑器
    │   ├── redisShared.module.less// Redis 模块共享样式
    │   └── redisTypes.ts       // Redis 模块类型定义与格式化工具函数
    ├── setting/          // 全局应用设置页面
    │   ├── SettingsModal.tsx   // 设置弹窗主框架与导航侧栏
    │   ├── AppearanceTab.tsx   // 外观与主题设置（浅/暗模式、全局界面字体）
    │   └── AboutTab.tsx        // 关于应用展示（版本标识、环境信息、描述）
    ├── sqlite/           // SQLite 本地数据库管理页面
    │   └── SqliteClient.tsx    // SQLite 客户端（表/视图数据预览、结构与索引查看）
    └── ssh/              // SSH 终端与远程 Linux 运维工作区
        ├── SessionWorkspace.tsx// SSH 工作区主框架（Terminal + 右侧扩展面板）
        ├── cron/               // Crontab 定时任务管理与表达式生成 (CronPanel, CronModal)
        ├── dashboard/          // 服务器 CPU/内存/磁盘/网络状态仪表盘 (DashboardPanel)
        ├── docker/             // Docker 容器与镜像管理面板 (DockerPanel)
        ├── file/               // SFTP 文件管理器与远程文件编辑器 (FilePanel, FileEditorModal)
        ├── process/            // 系统进程监控与终止 (kill) 面板 (ProcessPanel)
        ├── service/            // Systemd 系统服务管理面板 (ServicePanel)
        └── terminal/           // xterm.js 网页终端交互面板 (TerminalView)
```

## 开发

```bash
wails dev
```

## 构建

```bash
wails build
```

> 说明：系统级文件拖放依赖 Wails 的 `DragAndDrop.EnableFileDrop`，需在打包后的桌面窗口中使用；
> 浏览器调试模式下会自动降级为读取文件内容上传。
