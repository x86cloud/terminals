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
  <b>Terminals</b> is a next-generation, high-performance <b>All-in-One DevOps & Multi-Database Workstation</b> powered by <b>Wails v3</b>, <b>Go</b>, and <b>React 18</b>. Seamlessly integrate SSH terminals, container management, full-lifecycle database administration (MySQL, Redis, MongoDB, SQLite), IoT protocol testing (MQTT), HTTP/WebSocket API consoles, and an embedded <b>Autonomous AI Agent</b> into a single lightweight desktop app.
</p>

---

## 🌟 Highlights

- ⚡ **Ultra-Fast & Lightweight**: Built on Wails v3 and Go native backends, consuming a fraction of memory compared to traditional Electron apps with near-instant cold startup.
- 💻 **All-in-One Multi-Protocol Suite**: Single workspace for SSH, SFTP, Docker, MySQL, Redis, MongoDB, SQLite, MQTT, and HTTP/WebSocket APIs.
- 🤖 **Embedded Autonomous AI Agent**: Eino-powered LLM assistant with real-time tool calling to query, inspect, analyze, and operate on your servers and databases in natural language.
- 🛡️ **Enterprise Security & Connectivity**: Support for SSH bastion tunneling, SSL/TLS, mutual certificate authentication (mTLS), X.509, and Redis ACLs.
- 🎨 **Modern Fluent UI**: Dark/Light aesthetic themes, multi-tab workspace, inline data grid editor, ER diagrams, and real-time interactive monitors.
- 🚀 **Automated Cross-Platform CI/CD**: One-click GitHub Actions builds for Windows (`.exe` / `.zip`) and macOS Universal (`.app` / `.dmg`).

---

## 🎯 Feature Matrix

### 🖥️ 1. SSH Terminal & Cloud Server Management
- **Multi-Tab Terminal**: High-performance terminal emulation with Xterm.js, custom themes, search, and session keep-alive.
- **SFTP File Explorer**: Graphical dual-pane file management with drag-and-drop upload/download, remote file editor, permissions management, and batch operations.
- **Live System Dashboard**: Real-time hardware telemetry for CPU, Memory, Disk usage, Network throughput, and OS metrics.
- **Process & Service Manager**: Real-time process listing with search, kill signals, and Systemd service status control (Start/Stop/Restart/Reload).
- **Docker Container Management**: Live container list, start/stop/restart, real-time log streaming, resource utilization, and image browser.
- **Cron Job Scheduler**: Crontab schedule inspector and visual cron job editor.

### 🐬 2. MySQL Enterprise Database Client
- **Schema & Table Explorer**: Visual navigation of databases, tables, columns, indexes, foreign keys, and triggers.
- **Interactive SQL Console**: Intelligent SQL editor with auto-completion, syntax highlighting, multi-query execution, and execution plan (`EXPLAIN`) visualization.
- **Inline Data Grid**: Paginated data grid with inline cell editing, sorting, filtering, and instant batch change committing.
- **ER Diagram Visualizer**: Interactive relational entity-relationship diagrams for database schemas.
- **User & Privileges Management**: Visual user creator, password reset, and granular privilege grant/revoke panel.
- **Bastion SSH Tunnel & SSL**: Seamless connection to private VPC databases through SSH jump hosts with `preferred` / `true` / `skip-verify` TLS modes.
- **Import & Export**: Support for SQL dumps and CSV data import/export.

### 🔴 3. Redis Modern Data Browser
- **Multi-Topology Support**: Single-instance, Sentinel (with dynamic sentinel nodes & master discovery), and Cluster mode.
- **Keyspace Tree & Flat Views**: Dual display modes (Folder Tree / Flat List) with real-time regex filtering and type filtering.
- **Multi-Data-Type Viewer & Editor**: Full CRUD support for `String`, `List`, `Hash`, `Set`, `ZSet`, and `Stream` with TTL inspection and modification.
- **Batch Operations**: Batch key deletion, dump/restore, pattern scanning, and key expiration management.
- **Pub/Sub & KeySpace Live Stream**: Real-time channel message publisher/subscriber and keyspace event notification monitor.
- **Performance & SlowLog Monitor**: Real-time command ops/sec, memory fragmentation, connected clients, and slow query logs.
- **ACL & TLS Security**: Support for Redis 6+ ACL username/passwords and TLS-encrypted connections.

### 🍃 4. MongoDB Document Studio
- **Collections & Documents**: Document CRUD tree with JSON and tabular view modes, complex query builder, projection, and sorting.
- **URI Smart Parser**: Instant one-click parsing of `mongodb://` and `mongodb+srv://` connection strings with automatic parameter extraction.
- **Aggregation Pipeline Builder**: Visual step-by-step aggregation stages with real-time pipeline result preview.
- **Index & Schema Analyzer**: Collection schema distribution inspector and index manager (creation, drop, usage stats).
- **Change Streams**: Real-time change data capture (CDC) listener for databases and collections.
- **Replica Sets & Read Preferences**: Support for Replica Sets, SRV lookup, and 5 read preference strategies (`primary`, `secondary`, `nearest`, etc.).
- **TLS & X.509 Mutual Auth**: TLS encrypted channels and X.509 client certificate authentication.

### 📁 5. SQLite Local Studio
- Local SQLite database file picker, table and view explorer, schema viewer, and SQL query console with zero external configuration required.

### 📡 6. MQTT 3.1.1 / 3.1 IoT Client
- **Topic Subscription & Publishing**: Multi-topic subscriber with QoS 0, 1, 2, message retain flags, and color-coded topic tags.
- **Live Message Stream**: Real-time message receiver with payload search, JSON formatting, hex view, and pause/clear controls.
- **Last Will and Testament (LWT)**: Configurable will topic, payload, QoS, and retain flags.
- **TLS & mTLS Security**: Support for one-way TLS and mutual certificate authentication (CA cert, Client cert, Client key) with native file pickers.

### 🌐 7. HTTP & WebSocket API Suite
- **HTTP Request Builder**: Method selector (GET, POST, PUT, DELETE, etc.), query parameters, custom headers, body payloads (JSON, form-data, x-www-form-urlencoded), and response inspectors.
- **WebSocket Interactive Client**: Real-time handshake, live bidirectional messaging stream, heartbeats, and message history logs.

### 🤖 8. Embedded Autonomous AI Agent
- **Native LLM Integration**: Powered by CloudWeGo Eino framework with OpenAI / DeepSeek / Ollama / local model compatibility.
- **Full Database & Server Tools**: AI tools with direct read/write capabilities for SSH commands, MySQL queries, Redis commands, MongoDB operations, and MQTT pub/sub.
- **Natural Language DevOps**: Ask the AI to investigate slow queries, inspect Docker containers, clean Redis keys, optimize MySQL tables, or diagnose server resource bottlenecks.

### 🧰 9. Developer Tools
- **CertGen Tool**: Built-in visual SSL/TLS Certificate Authority (CA), server certificate, and client certificate generator for quick local testing and mTLS deployments.

---

## 🏗️ Architecture & Technology Stack

| Layer | Technologies |
|---|---|
| **Desktop Core** | [Wails v3](https://v3.wails.io/) + [Go 1.24+](https://golang.org/) |
| **Frontend Framework** | [React 18](https://react.dev/) + [TypeScript 5](https://www.typescriptlang.org/) + [Vite 8](https://vitejs.dev/) |
| **UI Components** | [Ant Design 6](https://ant.design/) + [Lucide Icons](https://lucide.dev/) + Custom Dark/Light Theme System |
| **Terminal & Editors** | [Xterm.js 6](https://xtermjs.org/) + [CodeMirror 6](https://codemirror.net/) |
| **AI Agent Engine** | [CloudWeGo Eino](https://github.com/cloudwego/eino) + Eino Local ADK |
| **Protocols & Drivers** | `golang.org/x/crypto/ssh`, `go-sql-driver/mysql`, `go-redis/v9`, `mongo-driver/v2`, `paho.mqtt.golang`, `modernc.org/sqlite` |
| **Build & CI/CD** | [Taskfile](https://taskfile.dev/) + [pnpm 9](https://pnpm.io/) + GitHub Actions |

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
# Build for current platform
wails3 build

# Output binary will be located in:
# Windows: bin/terminal-v3.exe
# macOS:   bin/terminal-v3.app
```

---

## 🔄 CI / CD Automation

The repository includes a production-grade GitHub Actions workflow ([`.github/workflows/build.yml`](.github/workflows/build.yml)):
- Automatically builds and packages **Windows** (`.exe` / `.zip`) and **macOS Universal** (`.app` / `.zip`) upon pushes to `v3`, `main`, or `master`.
- Automatically publishes a **GitHub Release** with compiled multi-platform binaries when a Git Tag (e.g. `v3.0.0`) is pushed.

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
