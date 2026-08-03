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

## 目录结构

```
app.go        // 绑定给前端的 API 门面
ssh.go        // SSH 连接、PTY shell、输出推流、会话管理
sftp.go       // SFTP 目录/文件操作、上传下载、传输队列与进度
redis.go      // Redis 连接、键值/命令操作
mysql.go      // MySQL 连接、查询/编辑、导入导出
mysqlx.go     // MySQL 扩展操作（导入/导出/备份等）
sqlite.go     // SQLite 连接、表/结构/索引/数据查询
mqtt.go       // MQTT 连接、发布/订阅
httpapi.go    // HTTP 接口调试请求执行
config.go     // 服务器配置持久化与敏感字段加密
main.go       // Wails 应用入口与窗口选项（启用系统级文件拖放）
frontend/src
  api.ts               // Wails 绑定封装 + 事件总线
  components/
    Sidebar.tsx        // 服务器列表与工具入口
    ServerDialog.tsx   // 新建/编辑服务器
    SessionWorkspace.tsx // 终端 + 文件面板分栏
    TerminalView.tsx   // xterm 终端
    FilePanel.tsx      // SFTP 文件管理器
    TransferBar.tsx    // 传输任务栏
    RedisClient.tsx    // Redis 调试面板
    MysqlClient.tsx    // MySQL 调试面板（含 mysql/ 子组件：DataTab、SqlEditor、UsersPanel、StatusPanel、ErDiagram 等）
    SqliteClient.tsx   // SQLite 调试面板
    DevTools.tsx       // 常用开发工具集（MD5 / 时间戳 / Base64）
    dbTable.module.less // 数据库表格统一展示样式（SQLite / MySQL 共用）
    ApiClient.tsx      // HTTP 接口调试面板
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
