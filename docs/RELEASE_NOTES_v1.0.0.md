# Terminal v3 Release Notes - v1.0.0

> 🚀 **Terminal v3 首个正式版本 v1.0.0 发布！**
> 本次更新带来了跨平台自动化安装包（Windows MSI 5步向导与 macOS Universal DMG）、深度的 PostgreSQL 与 MySQL 数据库客户端支持、全功能 API 调试工具以及内置 AI 智能体安全引擎。

---

## 🌟 核心新特性与亮点 (Highlights)

### 1. 📦 跨平台企业级安装包与 CI/CD 自动化流水线
- **Windows MSI 微软安装包**：
  - 基于 WiX Toolset 构建标准企业级 `.msi` 安装包，适配个人用户与企业组策略（GPO）集中下发；
  - **完整的 5 步交互向导**：
    1. **协议许可**：展示 Apache 2.0 / MIT 开源许可协议，支持阅读勾选；
    2. **旧版本检查**：内置 `<MajorUpgrade>`，安装前自动检测已安装旧版本并执行平滑覆盖升级，智能检测并提示关闭运行中的实例；
    3. **安装位置选择**：默认安装于 `C:\Program Files\Terminal`，支持用户自由浏览与自定义安装路径；
    4. **安装进度**：执行文件写入与组件注册，在 Windows 开始菜单中生成快捷方式，并向系统注册控制面板卸载项；
    5. **结束界面**：完成安装，安全退出向导。
- **macOS DMG 磁盘镜像包**：
  - 原生 Universal 通用架构构建，同时原生兼容 Apple Silicon (M1/M2/M3/M4) 与 Intel x86_64 处理器；
  - 自动生成带 `/Applications` 拖拽快捷方式的标准 `.dmg` 镜像文件。
- **GitHub Actions CI/CD**：
  - 推送版本标签（`v*`）自动触发多平台并行编译，并将 `.msi` 与 `.dmg` 自动发布至 GitHub Releases 资产中。

---

### 2. 🗄️ 数据库管理客户端深度升级 (Database Tools)
- **全新 PostgreSQL 客户端**：
  - **三级对象层级**：完整支持 `Database -> Schema -> Table / View` 结构浏览；
  - **查询极速化（< 1ms）**：重构后端系统目录查询，去除磁盘目录物理扫描开销，彻底杜绝数据库列表加载阻塞；
  - **超长表名自适应展示**：超长对象名称支持省略截断与 Tooltip 悬浮完整信息提示。
- **MySQL 客户端性能调优**：
  - 引入 `information_schema` 快速行数预估与异步分页计算，百万级大表秒级响应；
  - 展开数据库时自动预加载数据表，彻底解决节点闪烁与空状态问题；
  - 支持 ER 关系图可视化展示、数据库一键备份、多格式数据导出与用户权限管理。
- **树组件体验升级**：
  - 支持单击行即时展开/收起目录；
  - 移除侧边栏多余搜索框，释放完整的对象树展示空间；
  - 数据库与表树均支持右键菜单局部刷新，并恢复系统原生平滑自然滚动。

---

### 3. 🌐 API 接口调试与管理 (API Debugger)
- **树形接口管理**：支持多层级 API 目录与接口树状管理，提供完善的右键上下文菜单操作；
- **未保存变更智能保护**：引入脏数据检测机制（Dirty Detection），在切换或新建接口时主动提示保存，防止编辑内容意外丢失；
- **导入与导出**：支持一键将调试请求快速导出为标准 `cURL` 命令行。

---

### 4. 🤖 内置 AI 智能体与安全执行引擎 (AI Agent & Tools)
- **同步 ReAct 驱动引擎**：重构智能体为原生同步 ReAct 架构，具备更强的问题拆解与推理决策能力；
- **人机协同确认（HITL）**：高风险操作触发人机交互确认审批，保障系统安全；
- **统一数据库安全审计**：
  - 统一抽象 `auditSQLQuery` 审计体系，对 MySQL、PostgreSQL 与 SQLite 的读写操作实施分级权限管控；
  - 支持阻断 `DROP`、`TRUNCATE` 等高危不可逆 SQL 指令；
- **丰富工具集成**：支持多连接会话管理、联网检索与子智能体解耦执行。

---

### 5. 💻 终端与全局 UI 优化 (Terminal & Components)
- **终端输入与焦点修复**：
  - 修复终端在文本粘贴后的输入焦点丢失问题；
  - 修复快捷键导致的重复粘贴 Bug；
  - 修正暗色模式下的背景色渲染匹配问题。
- **高性能表格列宽自适应 (`ResizableTable`)**：
  - 内置基于内容宽度的智能自动算宽算法，具备最大/最小安全边界；
  - 渲染前同步预计算列宽并锁定表格宽度，彻底解决数据加载时的界面闪烁与抖动。

---

## 📥 资产下载 (Downloads)

| 操作系统 | 安装包文件 | 说明 |
| :--- | :--- | :--- |
| **Windows** | `terminal-v3-windows-amd64.msi` | 64 位标准 MSI 安装包（含 5 步安装向导） |
| **macOS** | `terminal-v3-macos-universal.dmg` | macOS 通用镜像（同时支持 Apple Silicon 与 Intel） |

---

## 🛠️ 完整提交记录 (Changelog)

- `b36f944` - **ci(release)**: 添加Windows MSI 5步向导打包、macOS DMG打包脚本与GitHub Actions CI发布流水线
- `4737d47` - **perf(db)**: 优化PostgreSQL库查询性能并移除数据库树搜索框
- `4f48e9f` - **feat(db)**: 统一MySQL与Postgres客户端交互并优化树形结构与预加载
- `254d7a2` - **feat(postgres)**: 完整支持 PostgreSQL 管理客户端与界面层级重构
- `26a0bf8` - **feat(api)**: add unsaved changes confirmation prompt before loading other APIs or creating new ones
- `5f46945` - **feat(api)**: upgrade API debugging tool with tree-based list, context menu, curl export, and dirty detection
- `cfb511a` - **feat(agent)**: refactor agent to native synchronous ReAct engine with hitl approval
- `53a2edc` - **fix(terminal)**: fix focus loss after paste, double paste, and dark mode background mismatch
- `c5c9df6` - **feat(mysql)**: add loading spinner animation for asynchronous table row count calculation
- `aab0987` - **fix(mysql)**: fix row count query and totalRows initialization for table pagination
- `0d8c6cb` - **perf(mysql)**: decouple table loading with async lazy requests and avoid redundant calls on pagination
- `81b6650` - **perf(mysql)**: optimize large table loading via information_schema row estimation and on-demand pagination queries
- `852b4e1` - **feat(agent)**: add db_sqlite_list_connections and complete SQLite toolset in ToolBus
- `0ad57a8` - **feat(ui)**: auto-calculate optimal column widths in ResizableTable from data content with min/max bounds
- `8d6b98a` - **perf(ui)**: pre-calculate column widths synchronously before rendering and lock table width to prevent jitter
- `b08424f` - **feat(ui)**: encapsulate column auto-width calculation inside ResizableTable with maxAutoWidth guard and DOM fallback
- `c82966e` - **feat(ui)**: auto-calculate column widths based on widest data and fit container in ResizableTable
- `1fc68df` - **refactor(guard)**: unify SQL audit function into auditSQLQuery for MySQL and SQLite
- `7a4fdd6` - **feat(agent)**: update SQLite tool to db_sqlite_query with read-write support and tiered permission guard
- `83b91e6` - **feat(agent)**: update MySQL tool to db_mysql_query with read-write support and tiered permission guard
- `0a1b1d4` - **refactor(agent)**: remove residual multi-session code and unify into single session runtime
- `a0f8e9e` - **fix(settings)**: wire AiEnableWebSearch, AiEnablePermissionGuard, and AiBlockHighRiskCommands dynamically
- `545fc75` - **fix(executor)**: connect RunWorkflow with tool invoker in workflow action execution
- `bbb03e0` - **fix(subagent)**: bind tools to subagent runner with model.WithTools and filter recursive orchestration tools
- `cad520d` - **fix(agent)**: decouple background job and subagent contexts from tool call lifecycle
