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
  <b>Terminals</b> 是一款基于 <b>Wails v3</b>、<b>Go</b> 与 <b>React 18</b> 构建的新一代、高性能 <b>All-in-One 现代化云端运维与全数据库工作台</b>。将 SSH 终端、容器管理（Docker & Compose）、Kubernetes 云原生编排、全生命周期数据库管理（MySQL、PostgreSQL、Redis、MongoDB、SQLite）、物联网调试（MQTT）、HTTP/WebSocket API 控制台以及<b>内置自主 AI Agent 智能体</b>无缝融为一体。
</p>

---

## 🌟 核心亮点

- ⚡ **极致轻量与原生极速**：基于 Wails v3 与 Go 原生后端，内存占用仅为传统 Electron 应用的几分之一，具备毫秒级冷启动与极速渲染响应。
- 💻 **All-in-One 现代化全栈套件**：一个工作区无缝集成 SSH/SFTP、Docker & Compose、Kubernetes (K8s)、MySQL、PostgreSQL、Redis、MongoDB、SQLite、MQTT 以及 HTTP/WebSocket API 测试。
- 🤖 **内置自主 AI Agent 智能体**：基于 Eino 框架打造的 ReAct 推理引擎，支持人机协同确认机制（HITL），具备全栈运维工具调用能力，支持自然语言运维诊断与 Docker Compose / K8s 资源智能生成。
- ☸️ **云原生与容器化深度编排**：一站式管理 Docker 容器/镜像/网络/卷、Docker Compose 增量更新与实时部署，以及 Kubernetes 多集群切换、Pods/Deployments/Services/Config/Storage 全生命周期管理与 YAML 编排持久化。
- 🛡️ **企业级安全与穿透能力**：支持 SSH 跳板机隧道穿透 (Bastion Tunnel)、SSL/TLS 加密、双向证书认证 (mTLS)、X.509 鉴权以及 Redis ACL 用户权限体系。
- 🎨 **现代化 Fluent 美学设计**：内置深色/浅色自适应主题、统一终端主题风格、双栏紧凑数据网格内联编辑、ER 实体关系图谱与 Redis 6 大数据类型专属精细编辑器。
- 📦 **企业级分发与在线更新**：支持 Windows 5 步向导 MSI 安装包、便携版 Zip、macOS Universal DMG 镜像；内置版本元数据注入与一键在线检查更新机制。

---

## 🎯 功能特性矩阵

### 🖥️ 1. SSH 终端与云服务器运维套件
- **多标签终端**：基于 Xterm.js 打造的高性能终端，支持会话保持、自定义配色主题、快捷搜索与多窗口拆分。
- **SFTP 可视化文件管理器**：双栏图形化文件交互，支持拖拽上传/下载、远程文件内联编辑、权限模式变更与批量操作。
- **实时系统监控大盘**：实时采集 CPU 负载、内存占用、磁盘空间、网络吞吐量及系统基础指标。
- **进程与服务管理**：实时进程列表与终止控制，支持 Systemd 服务状态管理（启动/停止/重启/重载）。
- **Crontab 定时任务**：可视化定时任务解析与在线编辑管理。

### 🐳 2. Docker & Docker Compose 容器编排套件
- **容器生命周期管理**：直观查看容器运行状态、一键启动/停止/重启/强制删除。
- **Web Shell 终端直连**：一键进入容器执行 Shell 命令，支持交互式操作与输入输出实时同步。
- **实时日志流追踪**：毫秒级容器 stdout/stderr 日志流实时滚动追踪，支持关键词检索与过滤。
- **资源利用率大盘**：实时呈现容器 CPU、内存、网络 IO 与磁盘读写占用。
- **镜像与网络卷管理**：镜像一键拉取/删除/导出，Docker 虚拟网络与持久化存储卷管理。
- **Docker Compose 可视化工作台**：支持多项目 Compose 项目编排、配置在线编辑、增量服务更新与启停部署。
- **AI 智能生成 Compose**：基于自然语言一键智能生成标准化 `docker-compose.yml` 配置并支持一键应用。

### ☸️ 3. Kubernetes (K8s) 云原生多集群与资源编排套件
- **多集群与命名空间切换**：支持导入/解析 Kubeconfig，秒级切换不同 K8s 集群与 Namespaces。
- **集群概览大盘**：快速掌握集群节点健康度、Pod 分布与整体资源配额占用。
- **Pods 全景监控与 Exec 终端**：查看 Pod 状态、重启计数、事件流；一键打开 Pod 容器 Web Shell 交互式终端。
- **实时 Pod 日志追踪**：支持实时跟踪指定 Pod/容器的运行日志，支持历史行数获取与关键字高亮。
- **工作负载调度**：支持 Deployments、StatefulSets、DaemonSets 的查看、滚动重启与副本数平滑扩缩容。
- **配置与存储管理**：可视化管理 ConfigMaps、Secrets、PersistentVolumes (PV) 与 PersistentVolumeClaims (PVC)。
- **服务发现与路由**：可视化查看 Services 端口映射、Endpoints 以及 Ingress 域名路由规则。
- **K8s YAML 资源编排器**：支持在线编写/校验 YAML 编排文件，支持本地持久化存储、历史记录追溯与资源联动定位。
- **AI 智能生成 K8s 资源**：通过自然语言描述一键生成 Deployment/Service/Ingress 等 K8s 标准 YAML 配置。

### 🐬 4. MySQL 企业级数据库客户端
- **库表结构与对象导航**：直观浏览数据库、数据表、字段定义、主外键、索引、触发器与存储过程。
- **智能 SQL 编辑控制台**：支持语法高亮、智能补全、多语句执行、查询耗时分析与执行计划（`EXPLAIN`）图形化解析。
- **数据网格内联编辑**：支持分页查询、字段值双击就地编辑、排序过滤与变更批量提交保存。
- **ER 实体关系图谱**：根据外键与表结构自动生成交互式数据库 ER 图。
- **用户与权限管理**：可视化创建数据库用户、密码重置、主机权限划分与细粒度 Grant/Revoke 授权。
- **跳板机隧道与 SSL 传输**：支持通过 Bastion SSH 跳板机穿透私网 VPC 数据库，支持 `禁用` / `首选` / `强制加密` / `跳过校验` 等 TLS 模式。
- **导入与导出**：支持 SQL 脚本与 CSV 数据文件的快速导入导出。

### 🐘 5. PostgreSQL 高性能数据库客户端
- **多 Schema（模式）与对象支持**：完整支持 PostgreSQL 树形层级（Database -> Schema -> Table/View），支持多模式自由切换。
- **智能 SQL 控制台**：专为 Postgres 方言优化的智能补全、语法高亮与查询执行性能统计。
- **数据网格内联编辑**：与 MySQL 体验高度一致的数据网格，双击就地编辑、分页流式拉取、数据即时增删改查。
- **ER 实体关系图谱**：自动分析外键约束并动态绘制实体关系图谱。
- **角色与权限管理 (Roles & Privileges)**：可视化管理 Postgres 角色、登录权限、超级用户设置与对象授权。
- **函数与存储过程**：支持 PL/pgSQL 函数与存储过程的代码查看与调试。
- **状态大盘与会话排查**：实时查看数据库活动连接数、执行中查询与死锁排查。
- **跳板机隧道与 SSL/TLS**：支持 Bastion SSH 跳板机穿透与多种 SSL 加密连接模式。

### 🔴 6. Redis 现代化数据管理套件
- **多拓扑架构支持**：单机模式 (Single)、哨兵模式 (Sentinel，支持哨兵节点与 Master 动态寻址)、集群模式 (Cluster)。
- **重构双栏紧凑工作台**：优化的响应式布局，左侧键树/列表快速搜索，右侧数据深度查看与编辑。
- **键树与扁平双视图**：支持 Folder 树形目录与扁平列表切换，具备正则模糊搜索与数据类型过滤。
- **6 大数据类型专属精细编辑器**：
  - **String**：支持文本格式化、JSON 树形预览、直接修改与保存。
  - **List**：支持列表元素表格化浏览、首尾 Push/Pop 操作、行内就地修改。
  - **Hash**：表格化 Field/Value 键值对管理，支持字段快速检索、新增字段与行内编辑。
  - **Set**：集合成员去重展示、一键新增/删除成员。
  - **ZSet**：有序集合 Score 分值可视化排序显示，支持分值调整与成员管理。
  - **Stream**：流式数据消息 ID 与字段值时间序展示，支持追加新消息。
- **键生命周期控制**：TTL 毫秒级过期时间快速查看、永久化 (PERSIST) 与按秒设置过期时间。
- **批量数据操作**：支持键批量删除、Dump/Restore 导出恢复与模式扫描清理。
- **Pub/Sub 与 KeySpace 实时流**：支持实时频道订阅与消息发布、KeySpace 键空间事件通知监听。
- **性能监控与慢查询**：实时呈现每秒指令数 (OPS)、内存碎片率、连接客户端数与 SlowLog 慢日志排查。
- **ACL 与 TLS 安全**：支持 Redis 6+ ACL 用户名密码认证与 TLS 加密传输。

### 🍃 7. MongoDB 文档管理工作台
- **集合与文档 CRUD**：支持 JSON 与表格双模式浏览文档，提供可视化过滤条件构建、投影与排序。
- **URI 智能解析器**：一键解析 `mongodb://` 与 `mongodb+srv://` 连接字符串并自动回填节点配置。
- **聚合管道构建器**：多阶段（Stages）可视化构建聚合操作，实时预览管道各步骤输出。
- **索引与 Schema 分析**：集合 Schema 字段类型分布探测，索引一键创建、删除与命中统计。
- **Change Streams 变更捕获**：实时监听数据库与集合级别的数据变更事件（CDC）。
- **副本集与读偏好**：支持副本集 (ReplicaSet)、DNS SRV 寻址与 5 种读偏好策略（`primary`、`secondary`、`nearest` 等）。
- **TLS 与 X.509 认证**：支持 TLS 加密通道与 X.509 客户端证书双向鉴权。

### 📁 8. SQLite 本地数据库套件
- 本地 SQLite 数据库文件快速打开、表结构与视图浏览、SQL 执行与调试，零额外依赖。

### 📡 9. MQTT 3.1.1 / 3.1 物联网客户端
- **主题订阅与消息发布**：支持多主题同时订阅，自定义 QoS 0/1/2、Retain 保留标志与主题颜色标签。
- **实时消息流**：毫秒级消息推送接收，支持 Payload 内容检索、JSON 格式化、Hex 视图与暂停/清屏。
- **遗嘱消息 (LWT)**：支持配置遗嘱主题、遗嘱 Payload、遗嘱 QoS 与 Retain 标志。
- **TLS 与 mTLS 双向认证**：支持单向 TLS 与客户端双向证书认证（CA 根证书、客户端证书、私钥文件选择器）。

### 🌐 10. HTTP & WebSocket API 测试套件
- **树形集合管理**：支持类似 Postman 的树形多层级 API 分组与请求管理，支持右键快捷重命名、复制与删除。
- **未保存变更保护**：内置 Dirty Detection 脏检测机制，在切换或离开未保存请求时弹出提示，防止接口改动丢失。
- **cURL 一键导出**：支持将配置好的 HTTP 请求一键转换为标准的 cURL 命令行，方便终端直接复现与协作。
- **HTTP 接口调试**：支持 GET、POST、PUT、DELETE 等常用请求方式，自定义 Headers、Query 参数、Body（JSON/Form-Data）与响应格式化预览。
- **WebSocket 交互客户端**：支持在线握手连接、双向消息即时收发、心跳保活与历史记录追踪。

### 🤖 11. 内置自主 AI Agent 智能体
- **原生同步 ReAct 推理引擎**：采用 Thought-Action-Observation 闭环架构，支持连续多步自主规划与问题排查。
- **人机协同确认机制 (HITL)**：针对破坏性指令（如删库、停服、修改数据）自动触发人工审批弹框，安全可靠。
- **全协议底层工具总线 (ToolBus)**：为 Agent 赋予直接执行 SSH 远程指令、Docker/K8s 管理、MySQL/PostgreSQL 查表、Redis 键值读写、MongoDB 聚合、MQTT 发送以及 HTTP 请求的完整工具链。
- **容器与编排辅助生成**：支持自然语言直接对话生成 Docker Compose 与 Kubernetes YAML 资源定义。
- **流式交互体验**：实时流式输出推理步骤与工具执行结果反馈。

### ⚙️ 12. 系统设置与在线版本更新
- **编译期版本注入**：构建流水线自动提取 Git Tag、Commit SHA 与编译时间并注入二进制程序。
- **运行时环境展示**：在「设置 -> 关于」中直观展示当前版本、Git Commit、构建时间、运行平台与 Go 驱动信息。
- **一键检查更新**：内置在线版本检测，直接查询 GitHub Releases/Tags 进行 SemVer 语义化比对。
- **快速升级引导**：发现新版本时实时展示最新 Release 标签并提供一键跳转浏览器下载与链接复制功能。

### 🧰 13. 开发者实用工具箱
- **CertGen 证书生成器**：内置可视化 SSL/TLS CA 根证书、服务端证书与客户端证书一键快速生成工具，助力本地开发与 mTLS 测试。

---

## 🏗️ 系统架构与技术栈

| 层次 | 技术选型 |
|---|---|
| **桌面端底座** | [Wails v3](https://v3.wails.io/) + [Go 1.24+](https://golang.org/) |
| **前端架构** | [React 18](https://react.dev/) + [TypeScript 5](https://www.typescriptlang.org/) + [Vite 8](https://vitejs.dev/) |
| **UI 组件库** | [Ant Design 6](https://ant.design/) + [Lucide Icons](https://lucide.dev/) + 深度定制深浅色主题系统 |
| **终端与编辑器** | [Xterm.js 6](https://xtermjs.org/) + [CodeMirror 6](https://codemirror.net/) |
| **AI Agent 引擎** | [CloudWeGo Eino](https://github.com/cloudwego/eino) + Eino Local ADK + ReAct Engine |
| **底层驱动与协议** | `golang.org/x/crypto/ssh`、`docker/docker`、`k8s.io/client-go`、`go-sql-driver/mysql`、`jackc/pgx/v5`、`redis/go-redis/v9`、`mongo-driver/v2`、`paho.mqtt.golang`、`modernc.org/sqlite` |
| **构建与流水线** | [Taskfile](https://taskfile.dev/) + [WiX Toolset (MSI)](https://wixtoolset.org/) + [pnpm 9+](https://pnpm.io/) + GitHub Actions |

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
# 编译当前平台生产安装包（自动注入 Git Tag、Commit SHA 和构建日期）
wails3 build

# 编译生成文件位于：
# Windows: bin/terminal-v3.exe
# macOS:   bin/terminal-v3.app
```

---

## 🔄 CI / CD 自动化构建发布

项目内置完善的 GitHub Actions 跨平台流水线（[`.github/workflows/build.yml`](.github/workflows/build.yml)）：
- 每次向 `v3`、`main` 或 `master` 分支推送代码时，自动触发 **Windows**（`.exe`、便携版 `.zip` 以及 5 步向导 `.msi`）与 **macOS Universal**（`.app` / `.dmg`）的编译打包与测试；
- 每次推送版本标签（如 `git tag v1.0.3 && git push origin v1.0.3`）时，自动汇总各平台产物并发布 GitHub Release。

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
