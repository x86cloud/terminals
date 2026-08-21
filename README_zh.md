# Terminals (v3) 终端与全数据库工作台

<p align="center">
  <a href="https://github.com/x86cloud/terminals/blob/v3/README.md"><img src="https://img.shields.io/badge/Language-English-blue.svg" alt="English"></a>
  <a href="https://github.com/x86cloud/terminals/blob/v3/README_zh.md"><img src="https://img.shields.io/badge/语言-简体中文-green.svg" alt="简体中文"></a>
  <img src="https://img.shields.io/badge/Go-1.24+-00ADD8?logo=go&logoColor=white" alt="Go Version">
  <img src="https://img.shields.io/badge/Wails-v3-DF1A2A?logo=wails&logoColor=white" alt="Wails v3">
  <img src="https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black" alt="React 18">
  <img src="https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/Platform-Windows%20%7C%20macOS-lightgrey.svg" alt="Platform">
  <img src="https://img.shields.io/badge/License-MIT-brightgreen.svg" alt="License">
</p>

<p align="center">
  <b>Terminals</b> 是一款基于 <b>Wails v3</b>、<b>Go</b> 与 <b>React 18</b> 构建的新一代、高性能 <b>All-in-One 现代化云端运维与全数据库工作台</b>。将 SSH 终端、容器管理、全生命周期数据库管理（MySQL、Redis、MongoDB、SQLite）、物联网调试（MQTT）、HTTP/WebSocket API 控制台以及<b>内置自主 AI Agent 智能体</b>无缝融为一体。
</p>

---

## 🌟 核心亮点

- ⚡ **极致轻量与原生极速**：基于 Wails v3 与 Go 原生后端，内存占用仅为传统 Electron 应用的几分之一，具备毫秒级冷启动与极速渲染响应。
- 💻 **All-in-One 多协议集成**：一个工作区聚合 SSH、SFTP、Docker、MySQL、Redis、MongoDB、SQLite、MQTT 以及 HTTP/WebSocket API 测试。
- 🤖 **内置自主 AI Agent 智能体**：基于 Eino 框架驱动，具备完备的底层工具调用能力（Tool Calling），可通过自然语言对话直接执行服务器运维诊断与数据库读写查询。
- 🛡️ **企业级安全与穿透能力**：支持 SSH 跳板机隧道穿透 (Bastion Tunnel)、SSL/TLS 加密、双向证书认证 (mTLS)、X.509 鉴权以及 Redis ACL 用户权限体系。
- 🎨 **现代化 Fluent 美学设计**：内置深色/浅色自适应主题、多标签工作台、表格单元格内联编辑、ER 实体关系图谱与实时监控大盘。
- 🚀 **跨平台自动化 CI/CD**：配套 GitHub Actions 流水线，一键自动编译打包 Windows (`.exe` / `.zip`) 与 macOS Universal 架构 (`.app` / `.dmg`)。

---

## 🎯 功能特性矩阵

### 🖥️ 1. SSH 终端与云服务器运维套件
- **多标签终端**：基于 Xterm.js 打造的高性能终端，支持会话保持、自定义配色主题、快捷搜索与多窗口拆分。
- **SFTP 可视化文件管理器**：双栏图形化文件交互，支持拖拽上传/下载、远程文件内联编辑、权限模式变更与批量操作。
- **实时系统监控大盘**：实时采集 CPU 负载、内存占用、磁盘空间、网络吞吐量及系统基础指标。
- **进程与服务管理**：实时进程列表与终止控制，支持 Systemd 服务状态管理（启动/停止/重启/重载）。
- **Docker 容器全生命周期管理**：容器列表查看、启动/停止/重启、实时日志流追踪、资源使用率监控与镜像管理。
- **Crontab 定时任务**：可视化定时任务解析与在线编辑管理。

### 🐬 2. MySQL 企业级数据库客户端
- **库表结构与对象导航**：直观浏览数据库、数据表、字段定义、主外键、索引、触发器与存储过程。
- **智能 SQL 编辑控制台**：支持语法高亮、智能补全、多语句执行、查询耗时分析与执行计划（`EXPLAIN`）图形化解析。
- **数据网格内联编辑**：支持分页查询、字段值双击就地编辑、排序过滤与变更批量提交保存。
- **ER 实体关系图谱**：根据外键与表结构自动生成交互式数据库 ER 图。
- **用户与权限管理**：可视化创建数据库用户、密码重置、主机权限划分与细粒度 Grant/Revoke 授权。
- **跳板机隧道与 SSL 传输**：支持通过 Bastion SSH 跳板机穿透私网 VPC 数据库，支持 `禁用` / `首选` / `强制加密` / `跳过校验` 等 TLS 模式。
- **导入与导出**：支持 SQL 脚本与 CSV 数据文件的快速导入导出。

### 🔴 3. Redis 现代化数据管理套件
- **多拓扑架构支持**：单机模式 (Single)、哨兵模式 (Sentinel，支持哨兵节点与 Master 动态寻址)、集群模式 (Cluster)。
- **键树与扁平双视图**：支持 Folder 树形目录与扁平列表切换，具备正则模糊搜索与数据类型过滤。
- **全数据类型读写与编辑**：全面支持 `String`、`List`、`Hash`、`Set`、`ZSet` 与 `Stream` 的 CRUD 与 TTL 过期时间调整。
- **批量数据操作**：支持键批量删除、Dump/Restore 导出恢复与模式扫描清理。
- **Pub/Sub 与 KeySpace 实时流**：支持实时频道订阅与消息发布、KeySpace 键空间事件通知监听。
- **性能监控与慢查询**：实时呈现每秒指令数 (OPS)、内存碎片率、连接客户端数与 SlowLog 慢日志排查。
- **ACL 与 TLS 安全**：支持 Redis 6+ ACL 用户名密码认证与 TLS 加密传输。

### 🍃 4. MongoDB 文档管理工作台
- **集合与文档 CRUD**：支持 JSON 与表格双模式浏览文档，提供可视化过滤条件构建、投影与排序。
- **URI 智能解析器**：一键解析 `mongodb://` 与 `mongodb+srv://` 连接字符串并自动回填节点配置。
- **聚合管道构建器**：多阶段（Stages）可视化构建聚合操作，实时预览管道各步骤输出。
- **索引与 Schema 分析**：集合 Schema 字段类型分布探测，索引一键创建、删除与命中统计。
- **Change Streams 变更捕获**：实时监听数据库与集合级别的数据变更事件（CDC）。
- **副本集与读偏好**：支持副本集 (ReplicaSet)、DNS SRV 寻址与 5 种读偏好策略（`primary`、`secondary`、`nearest` 等）。
- **TLS 与 X.509 认证**：支持 TLS 加密通道与 X.509 客户端证书双向鉴权。

### 📁 5. SQLite 本地数据库套件
- 本地 SQLite 数据库文件快速打开、表结构与视图浏览、SQL 执行与调试，零额外依赖。

### 📡 6. MQTT 3.1.1 / 3.1 物联网客户端
- **主题订阅与消息发布**：支持多主题同时订阅，自定义 QoS 0/1/2、Retain 保留标志与主题颜色标签。
- **实时消息流**：毫秒级消息推送接收，支持 Payload 内容检索、JSON 格式化、Hex 视图与暂停/清屏。
- **遗嘱消息 (LWT)**：支持配置遗嘱主题、遗嘱 Payload、遗嘱 QoS 与 Retain 标志。
- **TLS 与 mTLS 双向认证**：支持单向 TLS 与客户端双向证书认证（CA 根证书、客户端证书、私钥文件选择器）。

### 🌐 7. HTTP & WebSocket API 测试套件
- **HTTP 接口测试**：支持 GET、POST、PUT、DELETE 等常用请求方式，自定义请求头、Query 参数、Body（JSON/Form-Data）与响应格式化预览。
- **WebSocket 交互客户端**：支持在线握手连接、双向消息即时收发、心跳保活与历史记录追踪。

### 🤖 8. 内置自主 AI Agent 智能体
- **原生 LLM 智能融合**：基于 CloudWeGo Eino 架构构建，兼容 OpenAI / DeepSeek / Ollama 等主流大模型。
- **完备底层工具库**：为 AI Agent 赋予直接执行 SSH 指令、MySQL 查询、Redis 读写、MongoDB 聚合与 MQTT 交互的工具权限。
- **自然语言运维对话**：通过自然语言即可让 AI 诊断服务器性能瓶颈、排查慢 SQL、清理特定格式的 Redis 缓存或分析数据库结构。

### 🧰 9. 开发者实用工具箱
- **CertGen 证书生成器**：内置可视化 SSL/TLS CA 根证书、服务端证书与客户端证书一键快速生成工具，助力本地开发与 mTLS 测试。

---

## 🏗️ 系统架构与技术栈

| 层次 | 技术选型 |
|---|---|
| **桌面端底座** | [Wails v3](https://v3.wails.io/) + [Go 1.24+](https://golang.org/) |
| **前端架构** | [React 18](https://react.dev/) + [TypeScript 5](https://www.typescriptlang.org/) + [Vite 8](https://vitejs.dev/) |
| **UI 组件库** | [Ant Design 6](https://ant.design/) + [Lucide Icons](https://lucide.dev/) + 深度定制深浅色主题系统 |
| **终端与编辑器** | [Xterm.js 6](https://xtermjs.org/) + [CodeMirror 6](https://codemirror.net/) |
| **AI Agent 引擎** | [CloudWeGo Eino](https://github.com/cloudwego/eino) + Eino Local ADK |
| **底层驱动与协议** | `golang.org/x/crypto/ssh`、`go-sql-driver/mysql`、`go-redis/v9`、`mongo-driver/v2`、`paho.mqtt.golang`、`modernc.org/sqlite` |
| **构建与流水线** | [Taskfile](https://taskfile.dev/) + [pnpm 9](https://pnpm.io/) + GitHub Actions |

---

## 🚀 快速上手与本地开发

### 环境要求

1. **Go**：1.24 及以上版本（[下载地址](https://golang.org/dl/)）
2. **Node.js**：20 或 24 版本（[下载地址](https://nodejs.org/)）
3. **pnpm**：9 及以上版本（`npm install -g pnpm`）
4. **Wails v3 CLI**：
   ```bash
   go install github.com/wailsapp/wails/v3/cmd/wails3@v3.0.0-beta.10
   go install github.com/go-task/task/v3/cmd/task@latest
   ```

### 安装与启动调试

```bash
# 1. 克隆仓库代码
git clone -b v3 https://github.com/x86cloud/terminals.git
cd terminals

# 2. 安装前端依赖
cd frontend
pnpm install
cd ..

# 3. 启动开发模式（支持热重载）
wails3 dev
```

### 生产打包编译

```bash
# 编译当前平台生产安装包
wails3 build

# 编译生成文件位于：
# Windows: bin/terminal-v3.exe
# macOS:   bin/terminal-v3.app
```

---

## 🔄 CI / CD 自动化构建发布

项目内置完善的 GitHub Actions 跨平台流水线（[`.github/workflows/build.yml`](.github/workflows/build.yml)）：
- 每次向 `v3`、`main` 或 `master` 分支推送代码时，自动触发 **Windows** (`.exe` / `.zip`) 与 **macOS Universal** (`.app` / `.zip`) 的编译打包与测试；
- 每次推送版本标签（如 `git tag v3.0.0 && git push origin v3.0.0`）时，自动汇总各平台产物并发布 GitHub Release。

---

## 🤝 参与贡献

非常欢迎提交 Issue、提出功能建议或发起 Pull Request！
1. Fork 本仓库
2. 创建您的特性分支 (`git checkout -b feature/awesome-feature`)
3. 提交您的修改 (`git commit -m 'feat: add awesome feature'`)
4. 推送分支 (`git push origin feature/awesome-feature`)
5. 提交 Pull Request

---

## 📄 开源协议

本项目采用 [MIT License](LICENSE) 开源协议。
