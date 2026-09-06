# Terminals (v3)

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
  <b>Terminals</b> is a next-generation, high-performance <b>All-in-One DevOps, Cloud-Native & Multi-Database Workstation</b> powered by <b>Wails v3</b>, <b>Go</b>, and <b>React 18</b>. Seamlessly integrate SSH terminals, container management (Docker & Compose), Kubernetes cluster orchestration, full-lifecycle database administration (MySQL, PostgreSQL, Redis, MongoDB, SQLite), IoT debugging (MQTT), HTTP/WebSocket API consoles, and an embedded <b>Autonomous AI Agent</b> into a single lightweight desktop app.
</p>

---

## 🌟 Highlights

- ⚡ **Ultra-Fast & Lightweight**: Built on Wails v3 and Go native backends, consuming a fraction of the memory compared to traditional Electron apps with near-instant cold startup and native performance.
- 💻 **All-in-One Full-Stack Suite**: A unified workspace for SSH/SFTP, Docker & Compose, Kubernetes (K8s), MySQL, PostgreSQL, Redis, MongoDB, SQLite, MQTT, and HTTP/WebSocket API testing.
- 🤖 **Embedded Autonomous AI Agent**: Powered by CloudWeGo Eino with a synchronous ReAct engine, Human-in-the-Loop (HITL) safety approvals, full-stack devops tool bus, and AI generation for Docker Compose and K8s YAML resources.
- ☸️ **Cloud-Native & Container Orchestration**: Comprehensive Docker container lifecycle management, interactive Web Shell, Docker Compose incremental deployment, and Kubernetes multi-cluster switching, workload scaling, and YAML orchestration persistence.
- 🛡️ **Enterprise Security & Connectivity**: Support for SSH bastion tunneling, SSL/TLS encryption, mutual certificate authentication (mTLS), X.509 certificates, and Redis ACL access control.
- 🎨 **Modern Fluent UI**: Dark/Light aesthetic themes, unified terminal styling, inline data grid cell editor, interactive ER diagrams, and dedicated rich editors for all 6 Redis data types.
- 📦 **Enterprise Distribution & In-App Updates**: Production-grade Windows MSI 5-step installer wizard, portable ZIP, macOS Universal DMG; compile-time Git metadata injection with one-click in-app update checks.

---

## 🎯 Feature Matrix

### 🖥️ 1. SSH Terminal & Cloud Server Management
- **Multi-Tab Terminal**: High-performance terminal emulation with Xterm.js, custom themes, search, and session keep-alive.
- **SFTP File Explorer**: Graphical dual-pane file management with drag-and-drop upload/download, remote file editor, permissions management, and batch operations.
- **Live System Dashboard**: Real-time hardware telemetry for CPU, Memory, Disk usage, Network throughput, and OS metrics.
- **Process & Service Manager**: Real-time process listing with search, kill signals, and Systemd service status control (Start/Stop/Restart/Reload).
- **Cron Job Scheduler**: Crontab schedule inspector and visual cron job editor.

### 🐳 2. Docker & Docker Compose Container Workstation
- **Container Lifecycle Management**: Real-time status inspection with one-click Start, Stop, Restart, and Force Remove.
- **Direct Web Shell**: Instant interactive container terminal execution with bidirectional streaming.
- **Live Log Streaming**: Real-time stdout/stderr log follower with search and keyword filtering.
- **Resource Metrics**: Live telemetry for container CPU, Memory, Network I/O, and Disk I/O.
- **Images, Networks & Volumes**: Pull, inspect, build, export, and delete images, along with network topology and volume storage management.
- **Docker Compose Studio**: Multi-project Compose workspace with online YAML editing, incremental service updates, and live deployments.
- **AI-Powered Compose Generator**: Generate and refine standardized `docker-compose.yml` configurations from natural language prompts.

### ☸️ 3. Kubernetes (K8s) Cloud-Native Multi-Cluster Suite
- **Multi-Cluster & Namespace Switching**: Import and parse Kubeconfig files with instant cluster and namespace switching.
- **Cluster Overview**: Live cluster node status, Pod distributions, and quota usage overview.
- **Pods Dashboard & Exec Shell**: Pod health, restart counts, and event feeds with direct Web Shell execution into Pod containers.
- **Real-Time Pod Logs**: Stream stdout/stderr container logs with tail lines and keyword highlighting.
- **Workload Management**: Inspect Deployments, StatefulSets, and DaemonSets with rolling restarts and smooth replica scaling.
- **Config & Storage Explorer**: Visual management of ConfigMaps, Secrets, PersistentVolumes (PV), and PersistentVolumeClaims (PVC).
- **Services & Routing Topology**: Port mappings, Endpoints, and Ingress routing rules.
- **K8s YAML Orchestration Studio**: Interactive YAML editor with local persistent storage, change history, and resource navigation.
- **AI-Powered K8s YAML Generator**: Generate production-ready Kubernetes YAML manifests with natural language instructions.

### 🐬 4. MySQL Enterprise Database Client
- **Schema & Table Explorer**: Visual navigation of databases, tables, columns, indexes, foreign keys, and triggers.
- **Interactive SQL Console**: Intelligent SQL editor with auto-completion, syntax highlighting, multi-query execution, and execution plan (`EXPLAIN`) visualization.
- **Inline Data Grid**: Paginated data grid with inline cell editing, sorting, filtering, and instant batch change committing.
- **ER Diagram Visualizer**: Interactive relational entity-relationship diagrams for database schemas.
- **User & Privileges Management**: Visual user creator, password reset, and granular privilege grant/revoke panel.
- **Bastion SSH Tunnel & SSL**: Seamless connection to private VPC databases through SSH jump hosts with `preferred` / `true` / `skip-verify` TLS modes.
- **Import & Export**: Support for SQL dumps and CSV data import/export.

### 🐘 5. PostgreSQL High-Performance Database Client
- **Multi-Schema & Object Navigation**: Full support for PostgreSQL hierarchical trees (Database -> Schema -> Table/View) with seamless schema switching.
- **Intelligent SQL Editor**: Tailored auto-completion, syntax highlighting, and execution timing optimized for PostgreSQL.
- **Inline Data Grid**: Consistent cell editing, paginated streaming, and instant CRUD operations.
- **ER Diagram Visualizer**: Dynamic entity-relationship diagram generation based on foreign key constraints.
- **Roles & Privileges Management**: Visual management of Postgres roles, login privileges, superuser flags, and object grants.
- **Functions & Stored Procedures**: View, inspect, and execute PL/pgSQL routines.
- **Live Status & Activity Monitor**: Active connections, running queries, and deadlock investigation.
- **Bastion Tunnel & SSL/TLS**: Private network penetration via SSH bastion hosts with multiple SSL security modes.

### 🔴 6. Redis Modern Data Studio
- **Multi-Topology Support**: Single-instance, Sentinel (dynamic master discovery), and Cluster mode.
- **Refined Dual-Pane Layout**: Streamlined responsive workspace with fast key search on the left and comprehensive data editing on the right.
- **Keyspace Tree & Flat Views**: Dual display modes (Folder Tree / Flat List) with real-time regex filtering and type filtering.
- **Dedicated Editors for All 6 Data Types**:
  - **String**: Raw text and formatted JSON tree views with instant updates.
  - **List**: Tabular element viewer with Head/Tail Push/Pop and inline cell modification.
  - **Hash**: Field-value table with search, inline edits, and new field insertion.
  - **Set**: Deduplicated member viewer with fast addition and deletion.
  - **ZSet**: Sorted set with visual Score rank ordering, score adjustment, and member controls.
  - **Stream**: Chronological message ID and field-value streams with append support.
- **Key Expiration & TTL Management**: Millisecond-accurate TTL viewer, persistence setting (PERSIST), and custom expiration timeouts.
- **Batch Operations**: Batch key deletion, dump/restore, pattern scanning, and key cleanup.
- **Pub/Sub & KeySpace Live Stream**: Real-time channel message publisher/subscriber and keyspace event notification monitor.
- **Performance & SlowLog Monitor**: Real-time command ops/sec, memory fragmentation, connected clients, and slow query logs.
- **ACL & TLS Security**: Support for Redis 6+ ACL username/passwords and TLS-encrypted connections.

### 🍃 7. MongoDB Document Studio
- **Collections & Documents**: Document CRUD tree with JSON and tabular view modes, complex query builder, projection, and sorting.
- **URI Smart Parser**: Instant one-click parsing of `mongodb://` and `mongodb+srv://` connection strings with automatic parameter extraction.
- **Aggregation Pipeline Builder**: Visual step-by-step aggregation stages with real-time pipeline result preview.
- **Index & Schema Analyzer**: Collection schema distribution inspector and index manager (creation, drop, usage stats).
- **Change Streams**: Real-time change data capture (CDC) listener for databases and collections.
- **Replica Sets & Read Preferences**: Support for Replica Sets, SRV lookup, and 5 read preference strategies (`primary`, `secondary`, `nearest`, etc.).
- **TLS & X.509 Mutual Auth**: TLS encrypted channels and X.509 client certificate authentication.

### 📁 8. SQLite Local Studio
- Local SQLite database file picker, table and view explorer, schema viewer, and SQL query console with zero external configuration required.

### 📡 9. MQTT 3.1.1 / 3.1 IoT Client
- **Topic Subscription & Publishing**: Multi-topic subscriber with QoS 0, 1, 2, message retain flags, and color-coded topic tags.
- **Live Message Stream**: Real-time message receiver with payload search, JSON formatting, hex view, and pause/clear controls.
- **Last Will and Testament (LWT)**: Configurable will topic, payload, QoS, and retain flags.
- **TLS & mTLS Security**: Support for one-way TLS and mutual certificate authentication (CA cert, Client cert, Client key) with native file pickers.

### 🌐 10. HTTP & WebSocket API Suite
- **Tree-Based Collection Management**: Organize API requests into hierarchical folders with context menus for fast renaming, cloning, and deletion.
- **Unsaved Changes Protection**: Built-in dirty state detection prevents accidental loss when switching between requests.
- **Export to cURL**: One-click generation of executable cURL commands from active HTTP configurations.
- **HTTP Request Builder**: Method selector (GET, POST, PUT, DELETE, etc.), query parameters, custom headers, body payloads (JSON, form-data), and formatted response inspectors.
- **WebSocket Interactive Client**: Real-time handshake, live bidirectional messaging stream, heartbeats, and message history logs.

### 🤖 11. Embedded Autonomous AI Agent
- **Synchronous ReAct Engine**: Powered by CloudWeGo Eino with autonomous Thought-Action-Observation loops for multi-step reasoning.
- **Human-in-the-Loop (HITL) Approvals**: Built-in confirmation prompts for destructive operations (e.g. data modification, service stops), keeping operations safe.
- **Full Protocol ToolBus**: Comprehensive tool bus enabling direct AI execution across SSH commands, Docker, Kubernetes, MySQL, PostgreSQL, Redis, MongoDB, SQLite, MQTT, and HTTP.
- **Automated Resource Generation**: Natural language prompts to generate production-ready Docker Compose and Kubernetes manifests.
- **Streaming Telemetry**: Live stream output for thoughts, tool actions, and diagnostic observations.

### ⚙️ 12. Settings & In-App Update Checker
- **Compile-Time Metadata**: Build pipeline automatically extracts and embeds Git Tag, Commit SHA, and build timestamp into the binary.
- **Runtime Environment Inspector**: View application version, Git commit, build date, OS platform, and Go runtime under Settings -> About.
- **One-Click Update Checker**: Queries GitHub Releases/Tags to perform SemVer comparisons against the current version.
- **Update Alert Card**: Displays available versions with direct one-click browser download navigation and URL copying.

### 🧰 13. Developer Tools
- **CertGen Tool**: Built-in visual SSL/TLS Certificate Authority (CA), server certificate, and client certificate generator for quick local testing and mTLS deployments.

---

## 🏗️ Architecture & Technology Stack

| Layer | Technologies |
|---|---|
| **Desktop Core** | [Wails v3](https://v3.wails.io/) + [Go 1.24+](https://golang.org/) |
| **Frontend Framework** | [React 18](https://react.dev/) + [TypeScript 5](https://www.typescriptlang.org/) + [Vite 8](https://vitejs.dev/) |
| **UI Components** | [Ant Design 6](https://ant.design/) + [Lucide Icons](https://lucide.dev/) + Custom Dark/Light Theme System |
| **Terminal & Editors** | [Xterm.js 6](https://xtermjs.org/) + [CodeMirror 6](https://codemirror.net/) |
| **AI Agent Engine** | [CloudWeGo Eino](https://github.com/cloudwego/eino) + Eino Local ADK + ReAct Engine |
| **Protocols & Drivers** | `golang.org/x/crypto/ssh`, `docker/docker`, `k8s.io/client-go`, `go-sql-driver/mysql`, `jackc/pgx/v5`, `redis/go-redis/v9`, `mongo-driver/v2`, `paho.mqtt.golang`, `modernc.org/sqlite` |
| **Build & CI/CD** | [Taskfile](https://taskfile.dev/) + [WiX Toolset (MSI)](https://wixtoolset.org/) + [pnpm 9+](https://pnpm.io/) + GitHub Actions |

---

## 🚀 Getting Started

### Prerequisites

1. **Go**: Version 1.24 or later ([Download](https://golang.org/dl/))
2. **Node.js**: Version 20 or 24 ([Download](https://nodejs.org/))
3. **pnpm**: Version 9 or later (`npm install -g pnpm`)
4. **Wails v3 CLI**:
   ```bash
   go install github.com/wailsapp/wails/v3/cmd/wails3@v3.0.0-beta.10
   go install github.com/go-task/task/v3/cmd/task@latest
   ```

### Installation & Development

```bash
# 1. Clone the repository
git clone -b v3 https://github.com/x86cloud/terminals.git
cd terminals

# 2. Install frontend dependencies
cd frontend
pnpm install
cd ..

# 3. Start development mode with hot-reload
wails3 dev
```

### Production Build

```bash
# Build for current platform (automatically injects Git Tag, Commit SHA, and Build Date)
wails3 build

# Output binary will be located in:
# Windows: bin/terminal-v3.exe
# macOS:   bin/terminal-v3.app
```

---

## 🔄 CI / CD Automation

The repository includes a production-grade GitHub Actions workflow ([`.github/workflows/build.yml`](.github/workflows/build.yml)):
- Automatically builds and packages **Windows** (`.exe`, portable `.zip`, and 5-step wizard `.msi`) and **macOS Universal** (`.app` / `.dmg`) upon pushes to `v3`, `main`, or `master`.
- Automatically publishes a **GitHub Release** with compiled multi-platform assets when a Git Tag (e.g. `v1.0.3`) is pushed.

---

## 🤝 Contributing

Contributions, feature requests, and bug reports are welcome!
1. Fork the repository
2. Create your feature branch (`git checkout -b feature/awesome-feature`)
3. Commit your changes (`git commit -m 'feat: add awesome feature'`)
4. Push to the branch (`git push origin feature/awesome-feature`)
5. Open a Pull Request

---

## 📄 License

This project is open-sourced under the [MIT License](LICENSE).
