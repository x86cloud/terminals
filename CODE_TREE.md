# 🌲 CodeTree Overview: `terminal`

**Languages:** `go`, `typescript` | **Go Version:** `1.27.1` | **Root:** `D:\system\Desktop\Terminal\terminal_v3`

> 📊 **Metrics:** 87 Packages | 333 Files (go: 102, typescript: 231) | 316 Classes/Structs | 367 Interfaces | 1352 Functions | 947 Methods | ~114650 Est. Tokens

## 📁 File Structure

```text
├── agent/
│   ├── ask/
│   │   └── ask.go
│   ├── events/
│   │   └── events.go
│   ├── executor/
│   │   ├── dag.go
│   │   ├── executor.go
│   │   └── retry.go
│   ├── guard/
│   │   ├── docker_k8s.go
│   │   ├── guard.go
│   │   ├── shell_ast.go
│   │   └── sql_ast.go
│   ├── mcp/
│   │   ├── adapter.go
│   │   ├── protocol.go
│   │   └── server.go
│   ├── memory/
│   │   └── memory.go
│   ├── planner/
│   │   ├── plangate.go
│   │   └── planner.go
│   ├── router/
│   │   └── router.go
│   ├── shell/
│   │   ├── proc_unix.go
│   │   ├── proc_windows.go
│   │   └── shell.go
│   ├── skills/
│   │   └── skills.go
│   ├── store/
│   │   └── store.go
│   ├── tools/
│   │   ├── active_conn.go
│   │   ├── api_manager.go
│   │   ├── api_model.go
│   │   ├── bus.go
│   │   ├── db.go
│   │   ├── docker.go
│   │   ├── http.go
│   │   ├── k8s.go
│   │   ├── mqtt.go
│   │   ├── orchestration.go
│   │   ├── shell.go
│   │   ├── ssh.go
│   │   ├── websearch.go
│   │   ├── wiki_tools.go
│   │   └── workspace.go
│   ├── verifier/
│   │   └── verifier.go
│   ├── wiki/
│   │   └── wiki_manager.go
│   ├── agent.go
│   ├── compose_agent.go
│   ├── local.go
│   ├── runtime.go
│   ├── session.go
│   └── yaml_agent.go
├── core/
│   ├── compose_store.go
│   ├── concurrent_map.go
│   ├── config.go
│   ├── dialogs.go
│   ├── events.go
│   ├── k8s_orchestration_store.go
│   ├── settings.go
│   └── version.go
├── db/
│   ├── db_generic.go
│   ├── mysql.go
│   ├── mysqlx.go
│   ├── postgres.go
│   ├── postgresx.go
│   └── sqlite.go
├── docker/
│   ├── docker_client.go
│   ├── docker_compose_engine.go
│   ├── docker_compose_types.go
│   ├── docker_exec.go
│   ├── docker_manager.go
│   └── docker_types.go
├── frontend/
│   ├── bindings/
│   │   ├── encoding/
│   │   │   └── json/
│   │   │       ├── index.ts
│   │   │       └── models.ts
│   │   ├── github.com/
│   │   │   └── wailsapp/
│   │   │       └── wails/
│   │   │           └── v3/
│   │   │               └── internal/
│   │   │                   ├── eventcreate.ts
│   │   │                   └── eventdata.d.ts
│   │   └── terminal/
│   │       ├── agent/
│   │       │   ├── ask/
│   │       │   │   ├── index.ts
│   │       │   │   └── models.ts
│   │       │   ├── guard/
│   │       │   │   ├── index.ts
│   │       │   │   └── models.ts
│   │       │   ├── mcp/
│   │       │   │   ├── index.ts
│   │       │   │   └── models.ts
│   │       │   ├── planner/
│   │       │   │   ├── index.ts
│   │       │   │   └── models.ts
│   │       │   ├── skills/
│   │       │   │   ├── index.ts
│   │       │   │   └── models.ts
│   │       │   ├── store/
│   │       │   │   ├── index.ts
│   │       │   │   └── models.ts
│   │       │   ├── tools/
│   │       │   │   ├── index.ts
│   │       │   │   └── models.ts
│   │       │   ├── wiki/
│   │       │   │   ├── index.ts
│   │       │   │   └── models.ts
│   │       │   ├── index.ts
│   │       │   └── models.ts
│   │       ├── core/
│   │       │   ├── index.ts
│   │       │   └── models.ts
│   │       ├── db/
│   │       │   ├── index.ts
│   │       │   └── models.ts
│   │       ├── docker/
│   │       │   ├── index.ts
│   │       │   └── models.ts
│   │       ├── k8s/
│   │       │   ├── index.ts
│   │       │   └── models.ts
│   │       ├── mongo/
│   │       │   ├── index.ts
│   │       │   └── models.ts
│   │       ├── proto/
│   │       │   ├── index.ts
│   │       │   └── models.ts
│   │       ├── redis/
│   │       │   ├── index.ts
│   │       │   └── models.ts
│   │       ├── services/
│   │       │   ├── agentservice.ts
│   │       │   ├── apiservice.ts
│   │       │   ├── dockerservice.ts
│   │       │   ├── index.ts
│   │       │   ├── k8sservice.ts
│   │       │   ├── mcpservice.ts
│   │       │   ├── models.ts
│   │       │   ├── mongoservice.ts
│   │       │   ├── mqttservice.ts
│   │       │   ├── mysqlservice.ts
│   │       │   ├── postgresservice.ts
│   │       │   ├── redisservice.ts
│   │       │   ├── sftpservice.ts
│   │       │   ├── sqliteservice.ts
│   │       │   ├── sshservice.ts
│   │       │   ├── systemservice.ts
│   │       │   └── wikiservice.ts
│   │       └── ssh/
│   │           ├── index.ts
│   │           └── models.ts
│   ├── src/
│   │   ├── components/
│   │   │   ├── app/
│   │   │   │   ├── AiSidebar.tsx
│   │   │   │   ├── SessionTabs.tsx
│   │   │   │   └── Stage.tsx
│   │   │   ├── common/
│   │   │   │   ├── Tree/
│   │   │   │   │   ├── Tree.tsx
│   │   │   │   │   ├── index.ts
│   │   │   │   │   └── types.ts
│   │   │   │   ├── CellEditorInline.tsx
│   │   │   │   ├── ContainerTerminalModal.tsx
│   │   │   │   ├── MarkdownViewer.tsx
│   │   │   │   └── TabBar.tsx
│   │   │   ├── db/
│   │   │   │   ├── DataTab/
│   │   │   │   │   ├── DbDataTab.tsx
│   │   │   │   │   └── index.ts
│   │   │   │   ├── SqlEditor/
│   │   │   │   │   ├── DbSqlEditor.tsx
│   │   │   │   │   └── index.ts
│   │   │   │   ├── adapters/
│   │   │   │   │   ├── index.ts
│   │   │   │   │   ├── mysqlAdapter.ts
│   │   │   │   │   ├── postgresAdapter.ts
│   │   │   │   │   └── sqliteAdapter.ts
│   │   │   │   ├── index.ts
│   │   │   │   └── types.ts
│   │   │   ├── server-forms/
│   │   │   │   ├── BasicFields.tsx
│   │   │   │   ├── DockerForm.tsx
│   │   │   │   ├── K8sForm.tsx
│   │   │   │   ├── MongoForm.tsx
│   │   │   │   ├── MqttForm.tsx
│   │   │   │   ├── MysqlForm.tsx
│   │   │   │   ├── PostgresForm.tsx
│   │   │   │   ├── RedisForm.tsx
│   │   │   │   ├── SqliteForm.tsx
│   │   │   │   ├── SshForm.tsx
│   │   │   │   ├── defaults.ts
│   │   │   │   ├── index.ts
│   │   │   │   ├── types.ts
│   │   │   │   └── validator.ts
│   │   │   ├── AppLogo.tsx
│   │   │   ├── ClientIcon.tsx
│   │   │   ├── CloseConfirmModal.tsx
│   │   │   ├── CodeEditor.tsx
│   │   │   ├── ColumnFilterPopover.tsx
│   │   │   ├── ContextMenu.tsx
│   │   │   ├── DevTools.tsx
│   │   │   ├── ErrorBoundary.tsx
│   │   │   ├── Modal.tsx
│   │   │   ├── ResizableTable.tsx
│   │   │   ├── ServerDialog.tsx
│   │   │   ├── Sidebar.tsx
│   │   │   ├── TitleBar.tsx
│   │   │   ├── TransferBar.tsx
│   │   │   └── editorTheme.ts
│   │   ├── contexts/
│   │   │   ├── SessionContext.tsx
│   │   │   ├── ThemeContext.tsx
│   │   │   └── sessionHelpers.ts
│   │   ├── pages/
│   │   │   ├── agent/
│   │   │   │   ├── components/
│   │   │   │   │   ├── AskUserDock.tsx
│   │   │   │   │   ├── ChatMessageItem.tsx
│   │   │   │   │   ├── ChatMessageList.tsx
│   │   │   │   │   ├── Composer.tsx
│   │   │   │   │   ├── HistorySessionsModal.tsx
│   │   │   │   │   ├── HitlConfirmModal.tsx
│   │   │   │   │   ├── MessagePlanCard.tsx
│   │   │   │   │   ├── PlanDrawer.tsx
│   │   │   │   │   ├── ProcessStepsList.tsx
│   │   │   │   │   └── SlashCommandMenu.tsx
│   │   │   │   ├── hooks/
│   │   │   │   │   ├── useAgentComposer.ts
│   │   │   │   │   ├── useAgentEvents.ts
│   │   │   │   │   └── useAgentSessions.ts
│   │   │   │   └── AiAgentPanel.tsx
│   │   │   ├── api/
│   │   │   │   ├── ApiClient.tsx
│   │   │   │   ├── ApiConfigTabs.tsx
│   │   │   │   ├── ApiTreeList.tsx
│   │   │   │   ├── HttpRequest.tsx
│   │   │   │   ├── SaveApiModal.tsx
│   │   │   │   ├── WsClient.tsx
│   │   │   │   ├── apiTypes.ts
│   │   │   │   ├── headerPresets.ts
│   │   │   │   └── useApi.ts
│   │   │   ├── docker/
│   │   │   │   ├── ComposeTab.tsx
│   │   │   │   ├── ContainersTab.tsx
│   │   │   │   ├── DockerClient.tsx
│   │   │   │   ├── DockerComposeGenerateModal.tsx
│   │   │   │   ├── ImagesTab.tsx
│   │   │   │   ├── NetworksTab.tsx
│   │   │   │   ├── OverviewTab.tsx
│   │   │   │   └── VolumesTab.tsx
│   │   │   ├── k8s/
│   │   │   │   ├── ConfigStorageTab.tsx
│   │   │   │   ├── DeploymentsTab.tsx
│   │   │   │   ├── K8sClient.tsx
│   │   │   │   ├── K8sResourceYamlModal.tsx
│   │   │   │   ├── K8sYamlGenerateModal.tsx
│   │   │   │   ├── NetworkTab.tsx
│   │   │   │   ├── OverviewTab.tsx
│   │   │   │   ├── PodsTab.tsx
│   │   │   │   └── YamlTab.tsx
│   │   │   ├── mongo/
│   │   │   │   ├── ChangeStreamTab.tsx
│   │   │   │   ├── DataTab.tsx
│   │   │   │   ├── IndexesTab.tsx
│   │   │   │   ├── IoModal.tsx
│   │   │   │   ├── MongoClient.tsx
│   │   │   │   ├── MqlEditor.tsx
│   │   │   │   ├── ObjModal.tsx
│   │   │   │   ├── SchemaTab.tsx
│   │   │   │   ├── StatusPanel.tsx
│   │   │   │   └── mongoTypes.ts
│   │   │   ├── mqtt/
│   │   │   │   └── MqttClient.tsx
│   │   │   ├── mysql/
│   │   │   │   ├── ChangePasswordModal.tsx
│   │   │   │   ├── CreateUserModal.tsx
│   │   │   │   ├── ErDiagram.tsx
│   │   │   │   ├── GrantPrivilegesModal.tsx
│   │   │   │   ├── IoModal.tsx
│   │   │   │   ├── MysqlClient.tsx
│   │   │   │   ├── ObjModal.tsx
│   │   │   │   ├── StatusCard.tsx
│   │   │   │   ├── StatusPanel.tsx
│   │   │   │   ├── UsersPanel.tsx
│   │   │   │   └── mysqlTypes.tsx
│   │   │   ├── postgres/
│   │   │   │   ├── ErDiagram.tsx
│   │   │   │   ├── FunctionsPanel.tsx
│   │   │   │   ├── IoModal.tsx
│   │   │   │   ├── ObjModal.tsx
│   │   │   │   ├── PostgresClient.tsx
│   │   │   │   ├── RolesPanel.tsx
│   │   │   │   ├── StatusPanel.tsx
│   │   │   │   └── postgresTypes.ts
│   │   │   ├── redis/
│   │   │   │   ├── viewers/
│   │   │   │   │   ├── HashViewer.tsx
│   │   │   │   │   ├── ListViewer.tsx
│   │   │   │   │   ├── SetViewer.tsx
│   │   │   │   │   ├── StreamViewer.tsx
│   │   │   │   │   ├── StringViewer.tsx
│   │   │   │   │   └── ZSetViewer.tsx
│   │   │   │   ├── BatchPanel.tsx
│   │   │   │   ├── CreateKeyModal.tsx
│   │   │   │   ├── KeyHeader.tsx
│   │   │   │   ├── KeyItemTree.tsx
│   │   │   │   ├── KeysTab.tsx
│   │   │   │   ├── KeyspaceTab.tsx
│   │   │   │   ├── MonitorTab.tsx
│   │   │   │   ├── PubSubTab.tsx
│   │   │   │   ├── QueueTab.tsx
│   │   │   │   ├── RedisCliDrawer.tsx
│   │   │   │   ├── RedisClient.tsx
│   │   │   │   └── redisTypes.ts
│   │   │   ├── setting/
│   │   │   │   ├── components/
│   │   │   │   │   └── ModelEditModal.tsx
│   │   │   │   ├── AboutTab.tsx
│   │   │   │   ├── AiAgentTab.tsx
│   │   │   │   ├── AppearanceTab.tsx
│   │   │   │   ├── McpServerTab.tsx
│   │   │   │   └── SettingsModal.tsx
│   │   │   ├── sqlite/
│   │   │   │   └── SqliteClient.tsx
│   │   │   ├── ssh/
│   │   │   │   ├── cron/
│   │   │   │   │   ├── CronModal.tsx
│   │   │   │   │   └── CronPanel.tsx
│   │   │   │   ├── dashboard/
│   │   │   │   │   └── DashboardPanel.tsx
│   │   │   │   ├── file/
│   │   │   │   │   ├── FileEditorModal.tsx
│   │   │   │   │   └── FilePanel.tsx
│   │   │   │   ├── process/
│   │   │   │   │   └── ProcessPanel.tsx
│   │   │   │   ├── service/
│   │   │   │   │   └── ServicePanel.tsx
│   │   │   │   ├── terminal/
│   │   │   │   │   └── TerminalView.tsx
│   │   │   │   └── SessionWorkspace.tsx
│   │   │   └── wiki/
│   │   │       └── WikiClient.tsx
│   │   ├── utils/
│   │   │   ├── clipboard.ts
│   │   │   ├── db.ts
│   │   │   ├── error.ts
│   │   │   ├── file.ts
│   │   │   ├── format.ts
│   │   │   ├── index.ts
│   │   │   ├── md5.ts
│   │   │   ├── sqlExport.ts
│   │   │   ├── storage.ts
│   │   │   ├── theme.ts
│   │   │   └── updater.tsx
│   │   ├── App.tsx
│   │   ├── api.ts
│   │   ├── css-modules.d.ts
│   │   ├── main.tsx
│   │   ├── theme.ts
│   │   ├── types.ts
│   │   └── vite-env.d.ts
│   └── vite.config.ts
├── k8s/
│   ├── k8s_client.go
│   ├── k8s_exec.go
│   ├── k8s_manager.go
│   └── k8s_types.go
├── logger/
│   └── logger.go
├── mongo/
│   ├── mongo.go
│   └── mongo_tx.go
├── proto/
│   ├── httpapi.go
│   ├── mqtt.go
│   └── ws.go
├── redis/
│   ├── redis.go
│   ├── redis_data.go
│   └── redis_utils.go
├── services/
│   ├── agent_service.go
│   ├── api_service.go
│   ├── container.go
│   ├── docker_service.go
│   ├── k8s_service.go
│   ├── mcp_service.go
│   ├── mongo_service.go
│   ├── mqtt_service.go
│   ├── mysql_service.go
│   ├── postgres_service.go
│   ├── redis_service.go
│   ├── sftp_service.go
│   ├── sqlite_service.go
│   ├── ssh_service.go
│   ├── system_service.go
│   └── wiki_service.go
├── ssh/
│   ├── sftp.go
│   ├── ssh.go
│   ├── ssh_cron.go
│   ├── ssh_dashboard.go
│   ├── ssh_process.go
│   └── ssh_service.go
├── storage/
│   ├── file_io.go
│   └── paths.go
└── main.go
```

## 📦 Packages & Modules

### Package `main` (`.`)

- **Imports (8):** `context`, `embed`, `github.com/wailsapp/wails/v3/pkg/application`, `github.com/wailsapp/wails/v3/pkg/events`, `log`, `terminal/core`, `terminal/logger`, `terminal/services`

#### Constants & Variables

```go
var assets embed.FS
var trayIcon []byte
```

#### Functions

```go
// Calls: [app.NewMenu, app.Quit, app.Run, app.SystemTray.New, app.Window.NewWithOptions, application.AssetFileServerFS, application.Get, application.Get().Window.GetByName, application.New, application.NewRGB, application.NewService, container.Shutdown, container.Startup, container.Store.GetSettings, context.Background, core.EmitEvent, core.IsAppQuitting, core.SetAppQuitting, event.Cancel, event.Context, event.Context().DropTargetDetails, event.Context().DroppedFiles, log.Fatal, log.Printf, logger.Close, logger.Errorf, logger.Info, logger.Init, restoreWindow, services.GetContainer, services.NewAgentService, services.NewApiService, services.NewDockerService, services.NewK8sService, services.NewMcpService, services.NewMongoService, services.NewMqttService, services.NewMysqlService, services.NewPostgresService, services.NewRedisService, services.NewSftpService, services.NewSqliteService, services.NewSshService, services.NewSystemService, services.NewWikiService, tray.OnClick, tray.OnDoubleClick, tray.SetIcon, tray.SetMenu, tray.SetTooltip, trayMenu.Add, trayMenu.Add().OnClick, trayMenu.AddSeparator, w.Focus, w.Show, w.UnMinimise, win.Focus, win.Hide, win.OnWindowEvent, win.RegisterHook, win.Show, win.UnMinimise]
func main() { ... }

```

---

### Package `agent` (`agent`)

- **Imports (34):** `context`, `encoding/json`, `errors`, `fmt`, `github.com/cloudwego/eino-ext/components/model/openai`, `github.com/cloudwego/eino/adk/filesystem`, `github.com/cloudwego/eino/components/model`, `github.com/cloudwego/eino/schema`, `io`, `log`, `runtime`, `strings`, `sync`, `terminal/agent/ask`, `terminal/agent/events`, `terminal/agent/executor`, `terminal/agent/guard`, `terminal/agent/memory`, `terminal/agent/planner`, `terminal/agent/router`, `terminal/agent/skills`, `terminal/agent/store`, `terminal/agent/tools`, `terminal/agent/verifier`, `terminal/agent/wiki`, `terminal/core`, `terminal/db`, `terminal/docker`, `terminal/k8s`, `terminal/mongo`, `terminal/proto`, `terminal/redis`, `terminal/ssh`, `time`

#### Constants & Variables

```go
const SessionStateIdle SessionState = "idle"
const SessionStatePlanning SessionState = "planning"
const SessionStateWaitingApproval SessionState = "waiting_approval"
const SessionStateExecuting SessionState = "executing"
const SessionStateVerifying SessionState = "verifying"
const SessionStateDone SessionState = "done"
const SessionStateFailed SessionState = "failed"
const SessionStateStopped SessionState = "stopped"
var DefaultManager
var DefaultWorkspaceMgr
var DefaultRuntime
```

#### Structs & Methods

```go
type AgentManager struct {
	mu sync.RWMutex
	ctx context.Context
	cfg core.AppSettings
	cm *openai.ChatModel
	storage *Storage
	sshMgr *ssh.SessionManager
	activeCancel context.CancelFunc
}

// GenerateSessionTitle 根据用户首条消息及助手回复，利用 LLM 概括生成简短精炼的会话标题（4-10字）。
// Calls: [cancel, cm.Generate, context.WithTimeout, fallbackTitle, fmt.Sprintf, m.mu.RLock, m.mu.RUnlock, string, strings.Trim, strings.TrimPrefix, strings.TrimSpace]
func (m *AgentManager) GenerateSessionTitle(ctx context.Context, firstUserMsg string, firstAssistantMsg string) (string, error) { ... }

// Calls: [DefaultRuntime.GetOrCreateSession, DefaultRuntime.InitOrUpdate, DefaultRuntime.Router.Resolve, context.Background, fmt.Errorf, m.mu.Lock, m.mu.Unlock, strings.TrimSpace]
func (m *AgentManager) InitOrUpdate(cfg core.AppSettings) error { ... }

// Calls: [DefaultRuntime.SetContext]
func (m *AgentManager) SetContext(ctx context.Context) { ... }

// Calls: [m.mu.Lock, m.mu.Unlock]
func (m *AgentManager) SetSSHManager(sm *ssh.SessionManager) { ... }

// Calls: [DefaultRuntime.GetSession, m.activeCancel, m.mu.Lock, m.mu.Unlock, sess.Stop]
func (m *AgentManager) StopChat(sessionID string) { ... }

func (m *AgentManager) Storage() *Storage { ... }

// Calls: [DefaultRuntime.EventBus.Emit, DefaultRuntime.GetOrCreateSession, DefaultRuntime.GetSession, DefaultRuntime.Router.Resolve, DefaultRuntime.ToolBus.ConvertToToolInfos, DefaultRuntime.ToolBus.Invoke, cancel, chatCtx.Err, context.WithCancel, errors.Is, errors.New, fmt.Errorf, fmt.Sprintf, fullResp.Len, fullResp.String, fullResp.WriteString, guard.IsPlanningMode, int, json.Marshal, log.Printf, m.applyContextCompression, m.buildSchemaMessages, m.mu.Lock, m.mu.RLock, m.mu.RUnlock, m.mu.Unlock, model.WithTools, normalizeChunkDelta, onChunk, onReasoningChunk, reasoningResp.Len, reasoningResp.String, reasoningResp.WriteString, resolved.Model.Stream, schema.ToolMessage, sess.SetCancel, streamReader.Close, streamReader.Recv, string, strings.Contains, strings.SplitN, strings.TrimSpace, time.NewTicker, time.Now, time.Since, time.Since().Seconds, turnContentAcc.String, turnContentAcc.WriteString, turnReasoningAcc.String, turnReasoningAcc.WriteString, waitTicker.Stop]
func (m *AgentManager) StreamChat(ctx context.Context, sessionID string, messages []FrontendMessage, onChunk func(chunk string), onReasoningChunk func(chunk string)) (string, string, string, error) { ... }

// Calls: [alignCutToUserMessage, fmt.Sprintf, m.cm.Generate, schema.UserMessage, strings.TrimSpace, summaryContent.String, summaryContent.WriteString]
func (m *AgentManager) applyContextCompression(ctx context.Context, messages []FrontendMessage) ([]FrontendMessage, string) { ... }

// Calls: [DefaultRuntime.GetActiveConnection, DefaultRuntime.WorkspaceMgr.GetDir, activeDetail.String, activeDetail.WriteString, fmt.Sprintf, guard.IsPlanningMode, m.sshMgr.List, planSysPrompt.String, planSysPrompt.WriteString, planner.GetExistingPlan, schema.AssistantMessage, schema.SystemMessage, schema.ToolMessage, schema.UserMessage, strings.Contains, strings.Join, strings.ToLower, strings.ToUpper, strings.TrimSpace, time.Now, time.Now().Format, wiki.GetCatalog]
func (m *AgentManager) buildSchemaMessages(ctx context.Context, sessionID string, messages []FrontendMessage, sysPrompt string) []*schema.Message { ... }

type AgentRuntime struct {
	mu sync.RWMutex
	ctx context.Context
	cfg core.AppSettings
	session *Session
	Store *store.Store
	EventBus *events.EventBus
	Guard *guard.PolicyGuard
	Router *router.ModelRouter
	ToolBus *tools.ToolBus
	WorkspaceMgr *tools.WorkspaceManager
	SkillsReg *skills.SkillsRegistry
	Planner *planner.Planner
	PlanGate *planner.PlanGate
	Executor *executor.Executor
	Verifier *verifier.Verifier
	AskMgr *ask.AskManager
	HitlMgr *guard.HitlManager
	sshMgr *ssh.SessionManager
	redisMgr *redis.RedisManager
	mysqlMgr *db.MysqlManagerEx
	postgresMgr *db.PostgresManager
	mongoMgr *mongo.MongoManager
	sqliteMgr *db.SqliteManager
	mqttMgr *proto.MqttManager
	dockerMgr *docker.DockerManager
	k8sMgr *k8s.K8sManager
	coreStore *core.Store
	activeConn *ActiveConnectionInfo
}

// Calls: [tools.GetActiveConnection]
func (rt *AgentRuntime) GetActiveConnection() *ActiveConnectionInfo { ... }

// Calls: [rt.GetSession]
func (rt *AgentRuntime) GetOrCreateSession(id string) *Session { ... }

// Calls: [rt.mu.RLock, rt.mu.RUnlock]
func (rt *AgentRuntime) GetSession() *Session { ... }

// Calls: [float32, rt.Executor.SetMaxParallel, rt.Guard.SetBlockHighRiskCommands, rt.Guard.SetEnableGuard, rt.Guard.SetWorkspaceDir, rt.Router.SetProfile, rt.ToolBus.Unregister, rt.Verifier.SetEnabled, rt.WorkspaceMgr.SetDir, rt.mu.Lock, rt.mu.Unlock, rt.session.mu.Lock, rt.session.mu.Unlock, tools.RegisterWebSearchTool]
func (rt *AgentRuntime) InitOrUpdate(cfg core.AppSettings) error { ... }

// Calls: [rt.mu.Lock, rt.mu.Unlock, tools.SetActiveConnection]
func (rt *AgentRuntime) SetActiveConnection(info *ActiveConnectionInfo) { ... }

// Calls: [rt.EventBus.SetContext, rt.mu.Lock, rt.mu.Unlock]
func (rt *AgentRuntime) SetContext(ctx context.Context) { ... }

// Calls: [rt.mu.Lock, rt.mu.Unlock]
func (rt *AgentRuntime) SetCoreStore(st *core.Store) { ... }

// Calls: [rt.mu.Lock, rt.mu.Unlock, tools.RegisterApiManagerTool, tools.RegisterDatabaseTools, tools.RegisterDockerTools, tools.RegisterHttpTools, tools.RegisterK8sTools, tools.RegisterLocalShellTool, tools.RegisterMqttTools, tools.RegisterOrchestrationTools, tools.RegisterSSHTools, tools.RegisterWebSearchTool, tools.RegisterWikiTools, tools.RegisterWorkspaceTools]
func (rt *AgentRuntime) SetManagers(sm *ssh.SessionManager, rm *redis.RedisManager, mm *db.MysqlManagerEx, pgm *db.PostgresManager, mgm *mongo.MongoManager, sq *db.SqliteManager, mq *proto.MqttManager, dkm *docker.DockerManager, km *k8s.K8sManager) { ... }

type FrontendMessage struct {
	Role string `json:"role"`
	Content string `json:"content"`
	ReasoningContent string `json:"reasoning_content,omitempty"`
	ProcessSteps []ProcessStep `json:"process_steps,omitempty"`
	Images []string `json:"images,omitempty"`
	ToolCalls []ToolCallItem `json:"tool_calls,omitempty"`
	ToolCallID string `json:"tool_call_id,omitempty"`
	Name string `json:"name,omitempty"`
	Plan *planner.Plan `json:"plan,omitempty"`
	Timestamp int64 `json:"timestamp,omitempty"`
}

type Local struct {
	filesystem.Backend filesystem.Backend
	filesystem.StreamingShell filesystem.StreamingShell
}

// Calls: [l.StreamingShell.ExecuteStreaming]
func (l *Local) ExecuteStreaming(ctx context.Context, input *filesystem.ExecuteRequest) (result *schema.StreamReader[*filesystem.ExecuteResponse], err error) { ... }

type ProcessStep struct {
	ID string `json:"id"`
	// "think" | "tool"
	Type string `json:"type"`
	Title string `json:"title"`
	Summary string `json:"summary,omitempty"`
	Content string `json:"content"`
	Timestamp int64 `json:"timestamp"`
	DurationMs int64 `json:"duration_ms,omitempty"`
	Status string `json:"status,omitempty"`
}

type Session struct {
	ID string
	Title string
	State SessionState
	Workspace string
	Settings core.AppSettings
	CreatedAt time.Time
	UpdatedAt time.Time
	workingMem *memory.WorkingMemory
	cancelFunc context.CancelFunc
	mu sync.RWMutex
}

// BuildRunner is retained for backward compatibility as a clean no-op in standalone sync mode
func (s *Session) BuildRunner(ctx context.Context, routerInstance *router.ModelRouter, toolBus *tools.ToolBus) error { ... }

// Calls: [s.mu.Lock, s.mu.Unlock]
func (s *Session) SetCancel(cancel context.CancelFunc) { ... }

// Calls: [s.cancelFunc, s.mu.Lock, s.mu.Unlock]
func (s *Session) Stop() { ... }

func (s *Session) WorkingMemory() *memory.WorkingMemory { ... }

type Storage struct {
}

// Calls: [DefaultRuntime.Store.ClearSessionMessages]
func (s *Storage) ClearHistory() error { ... }

// Calls: [DefaultRuntime.Store.ListMessages, json.Unmarshal]
func (s *Storage) LoadHistory() ([]FrontendMessage, error) { ... }

// Calls: [DefaultRuntime.Store.ReplaceMessages, json.Marshal, string]
func (s *Storage) SaveHistory(messages []FrontendMessage) error { ... }

type ToolCallItem struct {
	ID string `json:"id"`
	Name string `json:"name"`
	Args string `json:"args"`
}

```

#### Functions

```go
// GenerateDockerCompose 使用专职 Agent 根据指定的镜像与业务需求生成符合工业级生产规范的 docker-compose.yml 文本。
// Calls: [DefaultRuntime.Router.Resolve, cancel, context.WithTimeout, err.Error, errors.Is, errors.New, fmt.Errorf, fmt.Sprintf, modelRes.Model.Generate, schema.SystemMessage, schema.UserMessage, strings.Contains, strings.HasPrefix, strings.Join, strings.ToLower, strings.TrimPrefix, strings.TrimSpace, strings.TrimSuffix]
func GenerateDockerCompose(ctx context.Context, images []string, userPrompt string) (string, error) { ... }

// GenerateK8sYAML 使用专职的 YAML 生成 Agent 根据用户选定的命名空间、Kind、指定的镜像与业务需求生成标准 Kubernetes YAML 清单。
// Calls: [DefaultRuntime.Router.Resolve, cancel, context.WithTimeout, err.Error, errors.Is, errors.New, fmt.Errorf, fmt.Sprintf, modelRes.Model.Generate, schema.SystemMessage, schema.UserMessage, strings.Contains, strings.HasPrefix, strings.Join, strings.ToLower, strings.TrimPrefix, strings.TrimSpace, strings.TrimSuffix]
func GenerateK8sYAML(ctx context.Context, namespace string, kinds []string, images []string, userPrompt string) (string, error) { ... }

// Calls: [NewStorage]
func NewAgentManager() *AgentManager { ... }

// Calls: [NewSession, ask.NewAskManager, core.DefaultAppSettings, ex.SetAskManager, executor.NewExecutor, g.SetHitlManager, g.SetWorkspaceDir, guard.NewHitlManager, guard.NewPolicyGuard, planner.NewPlanGate, planner.NewPlanner, router.NewModelRouter, skills.NewSkillsRegistry, store.GetStore, tools.NewToolBus, tools.NewWorkspaceManager, verifier.NewVerifier, wm.GetDir]
func NewAgentRuntime() *AgentRuntime { ... }

func NewLocal(filesystem filesystem.Backend, shell filesystem.StreamingShell) *Local { ... }

// Calls: [memory.NewWorkingMemory, time.Now]
func NewSession(id string, title string, workspace string, settings core.AppSettings) *Session { ... }

func NewStorage() *Storage { ... }

// Calls: [strings.ToLower]
func alignCutToUserMessage(messages []FrontendMessage, cutIdx int) int { ... }

// Calls: [strings.HasPrefix]
func normalizeChunkDelta(accumulated string, chunk string) string { ... }

```

---

### Package `ask` (`agent/ask`)

- **Imports (6):** `context`, `fmt`, `strings`, `sync`, `terminal/agent/events`, `time`

#### Structs & Methods

```go
type AskManager struct {
	mu sync.RWMutex
	// askID -> *AskRequest
	pending sync.Map
	eventBus *events.EventBus
}

// Calls: [m.pending.Load, strings.TrimSpace]
func (m *AskManager) Answer(askID string, answer string) bool { ... }

// Calls: [ctx.Done, ctx.Err, fmt.Sprintf, m.eventBus.Emit, m.pending.Delete, m.pending.Store, time.NewTimer, time.Now, time.Now().UnixMilli, time.Now().UnixNano, timeoutTimer.Stop]
func (m *AskManager) Ask(ctx context.Context, sessionID string, question string, options []string) (string, error) { ... }

// Calls: [m.pending.Range]
func (m *AskManager) ListPending() []*AskRequest { ... }

type AskRequest struct {
	AskID string `json:"ask_id"`
	SessionID string `json:"session_id"`
	TraceID string `json:"trace_id,omitempty"`
	Question string `json:"question"`
	Options []string `json:"options,omitempty"`
	CreatedAt int64 `json:"created_at"`
	ResponseCh chan AskResponse `json:"-"`
}

type AskResponse struct {
	Answered bool `json:"answered"`
	Answer string `json:"answer,omitempty"`
}

```

#### Functions

```go
func NewAskManager(eb *events.EventBus) *AskManager { ... }

```

---

### Package `events` (`agent/events`)

- **Imports (5):** `context`, `fmt`, `sync`, `terminal/core`, `time`

#### Constants & Variables

```go
const EventChatChunk EventType = "ChatChunk"
const EventReasoningChunk EventType = "ReasoningChunk"
const EventToolStart EventType = "ToolStart"
const EventToolEvent EventType = "ToolEvent"
const EventJobCreated EventType = "JobCreated"
const EventJobProgress EventType = "JobProgress"
const EventJobFinished EventType = "JobFinished"
const EventSubagentCreated EventType = "SubagentCreated"
const EventSubagentFinished EventType = "SubagentFinished"
const EventPlanProposed EventType = "PlanProposed"
const EventPlanApproved EventType = "PlanApproved"
const EventStepStarted EventType = "StepStarted"
const EventStepFinished EventType = "StepFinished"
const EventGoalUpdated EventType = "GoalUpdated"
const EventAskUser EventType = "ask_user"
const EventHitlConfirm EventType = "HitlConfirm"
const EventNotice EventType = "Notice"
const EventError EventType = "Error"
const EventDone EventType = "Done"
var DefaultEventBus
```

#### Structs & Methods

```go
type AskUserPayload struct {
	AskID string `json:"ask_id"`
	SessionID string `json:"session_id"`
	Question string `json:"question"`
	Options []string `json:"options,omitempty"`
}

type ChatChunkPayload struct {
	Chunk string `json:"chunk"`
}

type DonePayload struct {
	Content string `json:"content"`
	ReasoningContent string `json:"reasoning_content,omitempty"`
}

type Event struct {
	Type EventType `json:"type"`
	SessionID string `json:"session_id"`
	TraceID string `json:"trace_id,omitempty"`
	Timestamp int64 `json:"timestamp"`
	Payload any `json:"payload"`
}

// EventBus provides thread-safe event pub/sub and bridges to Wails
type EventBus struct {
	mu sync.RWMutex
	ctx context.Context
	handlers map[EventType][]func(e Event)
}

// Calls: [b.mu.RLock, b.mu.RUnlock, core.EmitEvent, fmt.Sprintf, h, time.Now, time.Now().UnixMilli]
func (b *EventBus) Emit(e Event) { ... }

// Calls: [b.mu.Lock, b.mu.Unlock]
func (b *EventBus) SetContext(ctx context.Context) { ... }

// Calls: [b.mu.Lock, b.mu.Unlock]
func (b *EventBus) Subscribe(t EventType, handler func(e Event)) { ... }

type GoalUpdatedPayload struct {
	GoalID string `json:"goal_id"`
	Objective string `json:"objective"`
	Phase string `json:"phase"`
	Rounds int `json:"rounds"`
	MaxRounds int `json:"max_rounds"`
	Blocker string `json:"blocker,omitempty"`
}

type HitlConfirmPayload struct {
	ConfirmID string `json:"confirm_id"`
	SessionID string `json:"session_id"`
	TraceID string `json:"trace_id,omitempty"`
	ToolName string `json:"tool_name"`
	ToolDesc string `json:"tool_desc"`
	Input string `json:"input"`
	RiskDetail string `json:"risk_detail"`
}

type JobFinishedPayload struct {
	JobID string `json:"job_id"`
	SessionID string `json:"session_id"`
	// completed | failed | killed
	State string `json:"state"`
	Error string `json:"error,omitempty"`
	Summary string `json:"summary,omitempty"`
	Duration int64 `json:"duration_ms"`
}

type JobProgressPayload struct {
	JobID string `json:"job_id"`
	SessionID string `json:"session_id"`
	Progress float64 `json:"progress"`
	Description string `json:"description,omitempty"`
	NewOutput string `json:"new_output,omitempty"`
	State string `json:"state"`
}

type ReasoningChunkPayload struct {
	Chunk string `json:"chunk"`
}

type StepEventPayload struct {
	PlanID string `json:"plan_id"`
	StepID string `json:"step_id"`
	Action string `json:"action"`
	ToolName string `json:"tool_name,omitempty"`
	// running | completed | failed | skipped
	Status string `json:"status"`
	Output any `json:"output,omitempty"`
	Error string `json:"error,omitempty"`
	DurationMs int64 `json:"duration_ms,omitempty"`
	// pass | fail | partial
	Verdict string `json:"verdict,omitempty"`
}

type SubagentEventPayload struct {
	SubagentID string `json:"subagent_id"`
	ParentID string `json:"parent_id,omitempty"`
	SessionID string `json:"session_id"`
	Prompt string `json:"prompt"`
	State string `json:"state"`
	Result string `json:"result,omitempty"`
	Error string `json:"error,omitempty"`
}

type ToolEventPayload struct {
	CallID string `json:"call_id"`
	ToolName string `json:"tool_name"`
	Input string `json:"input"`
	Output string `json:"output"`
	DurationMs int64 `json:"duration_ms,omitempty"`
}

type ToolStartPayload struct {
	CallID string `json:"call_id"`
	ToolName string `json:"tool_name"`
	Detail string `json:"detail"`
}

```

#### Functions

```go
func NewEventBus() *EventBus { ... }

```

---

### Package `executor` (`agent/executor`)

- **Imports (12):** `context`, `encoding/json`, `fmt`, `regexp`, `strings`, `sync`, `terminal/agent/ask`, `terminal/agent/events`, `terminal/agent/planner`, `terminal/agent/tools`, `terminal/agent/verifier`, `time`

#### Constants & Variables

```go
const FailureTransient FailureClass = iota
const FailurePermanent = 
const FailureFatal = 
var placeholderRegex
```

#### Structs & Methods

```go
type Executor struct {
	mu sync.RWMutex
	toolBus *tools.ToolBus
	verifier *verifier.Verifier
	eventBus *events.EventBus
	askMgr *ask.AskManager
	maxParallel int
}

// ExecuteDAG 基于拓扑分层的 DAG 并行调度与失败重试
// Calls: [BuildDAG, ctx.Err, e.GetMaxParallel, e.executeStepWithRetry, fmt.Errorf, onStepProgress, outputsMu.Lock, outputsMu.RLock, outputsMu.RUnlock, outputsMu.Unlock, resultsMu.Lock, resultsMu.Unlock, string, wg.Add, wg.Done, wg.Wait]
func (e *Executor) ExecuteDAG(ctx context.Context, traceID string, plan *planner.Plan, onStepProgress func(step *planner.PlanStep, res *StepResult)) ([]*StepResult, error) { ... }

// ExecutePlan 兼容入口，内部自动调用 DAG 并发调度引擎
// Calls: [e.ExecuteDAG]
func (e *Executor) ExecutePlan(ctx context.Context, traceID string, plan *planner.Plan, onStepProgress func(step *planner.PlanStep, res *StepResult)) ([]*StepResult, error) { ... }

// ExecuteSingleStepDirect 单步直接执行（用于单步重试）
// Calls: [e.executeStepWithRetry]
func (e *Executor) ExecuteSingleStepDirect(ctx context.Context, traceID string, plan *planner.Plan, step *planner.PlanStep, stepOutputs map[string]any) *StepResult { ... }

// Calls: [e.mu.RLock, e.mu.RUnlock]
func (e *Executor) GetMaxParallel() int { ... }

// Calls: [e.mu.Lock, e.mu.Unlock]
func (e *Executor) SetAskManager(ask *ask.AskManager) { ... }

// Calls: [e.mu.Lock, e.mu.Unlock]
func (e *Executor) SetMaxParallel(max int) { ... }

// Calls: [RenderStepArgs, e.askMgr.Ask, e.eventBus.Emit, e.toolBus.Invoke, e.verifier.Verify, err.Error, json.Unmarshal, string, strings.ToLower, strings.TrimSpace, time.Now, time.Since, time.Since().Milliseconds]
func (e *Executor) executeSingleStep(ctx context.Context, traceID string, plan *planner.Plan, step *planner.PlanStep, stepOutputs map[string]any) *StepResult { ... }

// executeStepWithRetry 执行单步：支持指数退避重试与换招机制
// Calls: [classifyFailure, ctx.Done, ctx.Err, ctx.Err().Error, e.executeSingleStep, json.Marshal, json.Unmarshal, string, time.After, time.Duration]
func (e *Executor) executeStepWithRetry(ctx context.Context, traceID string, plan *planner.Plan, step *planner.PlanStep, stepOutputs map[string]any) *StepResult { ... }

type StepResult struct {
	StepID string `json:"step_id"`
	OK bool `json:"ok"`
	Output any `json:"output"`
	Error string `json:"error,omitempty"`
	DurationMs int64 `json:"duration_ms"`
	Verdict verifier.Verdict `json:"verdict"`
	Fatal bool `json:"fatal,omitempty"`
}

```

#### Functions

```go
// BuildDAG 校验依赖合法性、执行环检测并返回拓扑分层（同层步骤无相互依赖，可并发调度）。
// Calls: [fmt.Errorf, fmt.Sprintf, strings.TrimSpace]
func BuildDAG(steps []planner.PlanStep) ([][]planner.PlanStep, error) { ... }

func NewExecutor(tb *tools.ToolBus, v *verifier.Verifier, eb *events.EventBus) *Executor { ... }

// RenderStepArgs 动态变量模板渲染：支持 {{step_id.output}} 或 {{step_id.output.key}} 占位符替换
// Calls: [fmt.Sprintf, json.Marshal, placeholderRegex.ReplaceAllStringFunc, string, strings.Split, strings.Trim, strings.TrimSpace]
func RenderStepArgs(raw json.RawMessage, stepOutputs map[string]any) string { ... }

// Calls: [strings.Contains, strings.ToLower]
func classifyFailure(step *planner.PlanStep, res *StepResult) FailureClass { ... }

```

---

### Package `guard` (`agent/guard`)

- **Imports (12):** `context`, `encoding/json`, `fmt`, `github.com/xwb1989/sqlparser`, `mvdan.cc/sh/v3/syntax`, `path`, `path/filepath`, `strings`, `sync`, `terminal/agent/events`, `terminal/agent/store`, `time`

#### Constants & Variables

```go
const LevelAllow PermissionLevel = "allow"
const LevelConfirm PermissionLevel = "confirm"
const LevelForbidden PermissionLevel = "forbidden"
const ContextKeyPlanningMode contextKey = "is_planning_mode"
var HighRiskCommandPatterns
```

#### Structs & Methods

```go
// HitlDecision represents user's approval response
type HitlDecision struct {
	Approved bool `json:"approved"`
	Reason string `json:"reason,omitempty"`
}

// HitlManager handles synchronous human-in-the-loop approvals with zero timeout
type HitlManager struct {
	mu sync.RWMutex
	// confirmID -> *HitlRequest
	pending sync.Map
	eventBus *events.EventBus
}

// Calls: [m.pending.Range]
func (m *HitlManager) ListPending() []*HitlRequest { ... }

// Calls: [ctx.Done, ctx.Err, fmt.Sprintf, m.eventBus.Emit, m.pending.Delete, m.pending.Store, time.Now, time.Now().UnixMilli, time.Now().UnixNano]
func (m *HitlManager) RequestApproval(ctx context.Context, sessionID string, traceID string, toolName string, toolDesc string, input string, riskDetail string) (bool, string, error) { ... }

// Calls: [m.pending.Load, strings.TrimSpace]
func (m *HitlManager) ResolveApproval(confirmID string, approved bool, reason string) bool { ... }

// HitlRequest represents an in-flight human approval request
type HitlRequest struct {
	ConfirmID string `json:"confirm_id"`
	SessionID string `json:"session_id"`
	TraceID string `json:"trace_id,omitempty"`
	ToolName string `json:"tool_name"`
	ToolDesc string `json:"tool_desc"`
	Input string `json:"input"`
	RiskDetail string `json:"risk_detail"`
	CreatedAt int64 `json:"created_at"`
	ResponseCh chan HitlDecision `json:"-"`
}

type PolicyGuard struct {
	mu sync.RWMutex
	enableGuard bool
	blockHighRiskCommands bool
	workspaceDir string
	rules map[string]ToolRule
	store *store.Store
	hitlMgr *HitlManager
}

// Calls: [IsPlanningMode, g.mu.RLock, g.mu.RUnlock, isPlanModeForbidden, rule.AuditFunc]
func (g *PolicyGuard) Audit(ctx context.Context, sessionID string, toolName string, input string, defaultLevel PermissionLevel) (PermissionLevel, string) { ... }

// Calls: [g.mu.RLock, g.mu.RUnlock]
func (g *PolicyGuard) HitlManager() *HitlManager { ... }

// Calls: [g.mu.Lock, g.mu.Unlock]
func (g *PolicyGuard) SetBlockHighRiskCommands(block bool) { ... }

// Calls: [g.mu.Lock, g.mu.Unlock]
func (g *PolicyGuard) SetEnableGuard(enable bool) { ... }

// Calls: [g.mu.Lock, g.mu.Unlock]
func (g *PolicyGuard) SetHitlManager(hm *HitlManager) { ... }

// Calls: [g.mu.Lock, g.mu.Unlock]
func (g *PolicyGuard) SetWorkspaceDir(dir string) { ... }

// Calls: [g.mu.RLock, g.mu.RUnlock]
func (g *PolicyGuard) WorkspaceDir() string { ... }

// auditSQLQuery 接入 SQL AST 深度安全审计引擎
// Calls: [AuditSQLAST, g.mu.RLock, g.mu.RUnlock]
func (g *PolicyGuard) auditSQLQuery(ctx context.Context, input string) (PermissionLevel, string) { ... }

// auditShellCommand 接入 Shell AST 深度安全审计引擎
// Calls: [AuditShellAST, g.mu.RLock, g.mu.RUnlock]
func (g *PolicyGuard) auditShellCommand(ctx context.Context, input string) (PermissionLevel, string) { ... }

func (g *PolicyGuard) initDefaultRules() { ... }

// SQLAuditResult 包含 AST 解析出的详细语义特征与审计结果
type SQLAuditResult struct {
	Level PermissionLevel
	Reason string
	Tables []string
	StmtTypes []string
	IsReadOnly bool
	HasTautology bool
}

// ShellAuditResult 包含 AST 解析出的详细语义特征与审计结果
type ShellAuditResult struct {
	Level PermissionLevel
	Reason string
	Commands []string
	IsReadOnly bool
}

type ToolRule struct {
	ToolName string
	Level PermissionLevel
	Description string
	AuditFunc func(ctx context.Context, input string) (PermissionLevel, string)
}

```

#### Functions

```go
// AuditSQLAST 基于 AST 抽象语法树对输入的 SQL 执行深度安全与越权审计
// Calls: [auditSQLText, json.Unmarshal, strings.TrimSpace]
func AuditSQLAST(ctx context.Context, input string, blockHighRisk bool) (PermissionLevel, string) { ... }

// AuditShellAST 基于 POSIX/Bash 抽象语法树对输入的 Shell 命令行执行深度安全与越权审计
// Calls: [auditShellText, json.Unmarshal, strings.TrimSpace]
func AuditShellAST(ctx context.Context, input string, blockHighRisk bool, workspaceDir string) (PermissionLevel, string) { ... }

// Calls: [ctx.Value]
func IsPlanningMode(ctx context.Context) bool { ... }

func NewHitlManager(eb *events.EventBus) *HitlManager { ... }

// Calls: [g.initDefaultRules]
func NewPolicyGuard(enableGuard bool, blockHighRiskCommands bool, st *store.Store) *PolicyGuard { ... }

// Calls: [context.WithValue]
func WithPlanningMode(ctx context.Context, isPlanning bool) context.Context { ... }

// Calls: [fmt.Sprintf, json.Unmarshal, strings.ToLower, strings.TrimSpace]
func (g *PolicyGuard) auditApiManager(ctx context.Context, input string) (PermissionLevel, string) { ... }

// Calls: [AuditShellAST, fmt.Sprintf, g.mu.RLock, g.mu.RUnlock, json.Unmarshal, strings.EqualFold, strings.Fields, strings.HasPrefix, strings.Join, strings.TrimSpace]
func (g *PolicyGuard) auditContainerExecCommand(ctx context.Context, inputJSON string) (PermissionLevel, string) { ... }

// Calls: [fmt.Sprintf, g.mu.RLock, g.mu.RUnlock, json.Unmarshal, strings.Contains, strings.EqualFold, strings.Fields, strings.ToLower, strings.ToUpper, strings.TrimSpace]
func (g *PolicyGuard) auditDockerCommand(ctx context.Context, inputJSON string) (PermissionLevel, string) { ... }

// Calls: [fmt.Sprintf, json.Unmarshal, strings.ToLower, strings.TrimSpace]
func (g *PolicyGuard) auditDockerOrchestrate(ctx context.Context, inputJSON string) (PermissionLevel, string) { ... }

// Calls: [fmt.Sprintf, g.mu.RLock, g.mu.RUnlock, json.Unmarshal, strings.Contains, strings.ToLower, strings.ToUpper, strings.TrimSpace]
func (g *PolicyGuard) auditK8sOrchestrate(ctx context.Context, inputJSON string) (PermissionLevel, string) { ... }

// Calls: [fmt.Sprintf, g.mu.RLock, g.mu.RUnlock, json.Unmarshal, strings.Contains, strings.EqualFold, strings.Fields, strings.ToLower, strings.ToUpper, strings.TrimSpace]
func (g *PolicyGuard) auditKubectlCommand(ctx context.Context, inputJSON string) (PermissionLevel, string) { ... }

// auditNonStandardDialect 用于在标准 AST 解析失败时进行降级但严密的方言语法审计
// Calls: [fmt.Sprintf, strings.Contains, strings.HasPrefix, strings.ToUpper, strings.TrimSpace]
func auditNonStandardDialect(sqlText string, blockHighRisk bool) SQLAuditResult { ... }

// Calls: [auditSingleStatement, splitStatements, strings.TrimRight, strings.TrimSpace]
func auditSQLText(sqlText string, blockHighRisk bool) SQLAuditResult { ... }

// auditShellFallback 用于在语法解析出现非标准语法时进行严密的词法降级审查
// Calls: [fmt.Sprintf, strings.Contains, strings.ToLower]
func auditShellFallback(cmdText string, blockHighRisk bool, workspaceDir string) ShellAuditResult { ... }

// Calls: [auditShellFallback, filepath.Base, fmt.Sprintf, getCallExprCmdName, isPathEscapingWorkspace, isReadOnlyCommand, parser.Parse, path.Clean, printWord, strings.Contains, strings.HasPrefix, strings.HasSuffix, strings.NewReader, strings.ReplaceAll, strings.ToLower, strings.TrimSpace, syntax.NewParser, syntax.Walk]
func auditShellText(cmdText string, blockHighRisk bool, workspaceDir string) ShellAuditResult { ... }

// auditSingleStatement 审计单个独立 SQL 语句
// Calls: [auditNonStandardDialect, fmt.Sprintf, isTautology, node.Table.Name.String, sqlparser.Parse, strings.Contains, strings.HasPrefix, strings.Join, strings.ToLower, strings.ToUpper, strings.TrimSpace, tab.Name.String]
func auditSingleStatement(stmtSQL string, blockHighRisk bool) SQLAuditResult { ... }

// getCallExprCmdName 获取命令调用节点的命令名称
// Calls: [filepath.Base, printWord, syntax.Walk]
func getCallExprCmdName(node syntax.Node) string { ... }

// isPathEscapingWorkspace 校验目标路径是否逃逸出工作区目录
// Calls: [filepath.Clean, filepath.IsAbs, filepath.Join, filepath.Rel, strings.HasPrefix]
func isPathEscapingWorkspace(targetPath string, workspaceDir string) bool { ... }

// Calls: [AuditSQLAST, context.Background, json.Unmarshal, strings.HasPrefix, strings.HasSuffix, strings.ToLower, strings.TrimSpace]
func isPlanModeForbidden(toolName string, input string) bool { ... }

// isReadOnlyCommand 判定特定命令是否为绝对只读、不修改任何环境状态的安全指令
func isReadOnlyCommand(baseCmd string, args []string) bool { ... }

// isTautology 判定 WHERE 条件是否为恒真表达式（如 1=1, 'a'='a', TRUE 等）
// Calls: [isTautology, node.Name.String, sqlparser.String, string, strings.ToLower]
func isTautology(expr sqlparser.Expr) bool { ... }

// printWord 将 syntax.Word 转换还原为文本字符串
// Calls: [sb.String, strings.TrimSpace, syntax.NewPrinter, syntax.NewPrinter().Print]
func printWord(word *syntax.Word) string { ... }

// splitStatements 安全分割可能存在的以分号分隔的多条 SQL 语句（忽略单双引号内的分号）
// Calls: [current.Reset, current.String, current.WriteRune, strings.TrimSpace]
func splitStatements(sql string) []string { ... }

```

---

### Package `mcp` (`agent/mcp`)

- **Imports (13):** `context`, `encoding/json`, `errors`, `fmt`, `github.com/cloudwego/eino/components/tool`, `github.com/google/uuid`, `io`, `net`, `net/http`, `sync`, `terminal/agent/tools`, `terminal/logger`, `time`

#### Constants & Variables

```go
// JSON-RPC 2.0 标准规范常量与结构
const JSONRPCVersion = "2.0"
// JSON-RPC 2.0 标准规范常量与结构
const MCPProtocolVersion = "2024-11-05"
// JSON-RPC 2.0 标准规范常量与结构
const CodeParseError = -32700
// JSON-RPC 2.0 标准规范常量与结构
const CodeInvalidRequest = -32600
// JSON-RPC 2.0 标准规范常量与结构
const CodeMethodNotFound = -32601
// JSON-RPC 2.0 标准规范常量与结构
const CodeInvalidParams = -32602
// JSON-RPC 2.0 标准规范常量与结构
const CodeInternalError = -32603
```

#### Structs & Methods

```go
type CallToolParams struct {
	Name string `json:"name"`
	Arguments map[string]any `json:"arguments,omitempty"`
}

type CallToolResult struct {
	Content []ToolContent `json:"content"`
	IsError bool `json:"isError,omitempty"`
}

type ClientCapabilities struct {
	Roots any `json:"roots,omitempty"`
	Sampling any `json:"sampling,omitempty"`
	Experimental any `json:"experimental,omitempty"`
}

// MCP 协议核心实体
type ImplementationInfo struct {
	Name string `json:"name"`
	Version string `json:"version"`
}

type InitializeParams struct {
	ProtocolVersion string `json:"protocolVersion"`
	Capabilities ClientCapabilities `json:"capabilities"`
	ClientInfo ImplementationInfo `json:"clientInfo"`
}

type InitializeResult struct {
	ProtocolVersion string `json:"protocolVersion"`
	Capabilities ServerCapabilities `json:"capabilities"`
	ServerInfo ImplementationInfo `json:"serverInfo"`
}

type JSONRPCError struct {
	Code int `json:"code"`
	Message string `json:"message"`
	Data any `json:"data,omitempty"`
}

type JSONRPCRequest struct {
	JSONRPC string `json:"jsonrpc"`
	ID any `json:"id,omitempty"`
	Method string `json:"method"`
	Params json.RawMessage `json:"params,omitempty"`
}

type JSONRPCResponse struct {
	JSONRPC string `json:"jsonrpc"`
	ID any `json:"id"`
	Result any `json:"result,omitempty"`
	Error *JSONRPCError `json:"error,omitempty"`
}

type Server struct {
	mu sync.RWMutex
	adapter *ToolAdapter
	httpSrv *http.Server
	listener net.Listener
	host string
	port int
	startTime time.Time
	running bool
	sessionsMu sync.RWMutex
	sessions map[string]*SessionInfo
}

// Calls: [s.sessionsMu.RLock, s.sessionsMu.RUnlock]
func (s *Server) ListSessions() []SessionInfo { ... }

// Calls: [s.mu.Lock, s.mu.Unlock]
func (s *Server) SetAdapter(adapter *ToolAdapter) { ... }

// Calls: [errors.Is, fmt.Errorf, fmt.Sprintf, http.NewServeMux, logger.Errorf, logger.Infof, mux.HandleFunc, net.Listen, s.corsMiddleware, s.mu.Lock, s.mu.Unlock, srv.Serve, time.Now]
func (s *Server) Start(host string, port int) error { ... }

// Calls: [context.Background, fmt.Sprintf, int64, s.adapter.ListTools, s.mu.RLock, s.mu.RUnlock, s.sessionsMu.RLock, s.sessionsMu.RUnlock, s.startTime.IsZero, time.Since, time.Since().Seconds]
func (s *Server) Status() ServerStatus { ... }

// Calls: [cancel, context.Background, context.WithTimeout, logger.Infof, s.httpSrv.Shutdown, s.mu.Lock, s.mu.Unlock, s.sessionsMu.Lock, s.sessionsMu.Unlock]
func (s *Server) Stop() error { ... }

// Calls: [http.HandlerFunc, next.ServeHTTP, w.Header, w.Header().Set, w.WriteHeader]
func (s *Server) corsMiddleware(next http.Handler) http.Handler { ... }

// Calls: [NewErrorResponse, NewResponse, adapter.CallTool, adapter.ListTools, err.Error, fmt.Sprintf, json.Unmarshal, s.mu.RLock, s.mu.RUnlock]
func (s *Server) dispatchRPC(ctx context.Context, req JSONRPCRequest) JSONRPCResponse { ... }

// Calls: [json.NewEncoder, json.NewEncoder().Encode, w.Header, w.Header().Set]
func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) { ... }

// Calls: [NewErrorResponse, err.Error, http.Error, io.ReadAll, json.Marshal, json.NewEncoder, json.NewEncoder().Encode, json.Unmarshal, r.Body.Close, r.Context, r.URL.Query, r.URL.Query().Get, s.dispatchRPC, s.sessionsMu.Lock, s.sessionsMu.RLock, s.sessionsMu.RUnlock, s.sessionsMu.Unlock, time.Now, w.Header, w.Header().Set, w.Write, w.WriteHeader]
func (s *Server) handleMessages(w http.ResponseWriter, r *http.Request) { ... }

// Calls: [http.NotFound, s.handleHealth]
func (s *Server) handleRoot(w http.ResponseWriter, r *http.Request) { ... }

// Calls: [flusher.Flush, fmt.Fprintf, fmt.Sprintf, http.Error, logger.Infof, r.Context, r.Context().Done, r.UserAgent, s.sessionsMu.Lock, s.sessionsMu.Unlock, string, ticker.Stop, time.NewTicker, time.Now, uuid.NewString, w.Header, w.Header().Set, w.WriteHeader]
func (s *Server) handleSSE(w http.ResponseWriter, r *http.Request) { ... }

type ServerCapabilities struct {
	Tools *ToolsCapability `json:"tools,omitempty"`
}

type ServerStatus struct {
	Running bool `json:"running"`
	Host string `json:"host"`
	Port int `json:"port"`
	Endpoint string `json:"endpoint"`
	ToolsCount int `json:"toolsCount"`
	SessionsCount int `json:"sessionsCount"`
	UptimeSeconds int64 `json:"uptimeSeconds"`
}

type SessionInfo struct {
	ID string `json:"id"`
	RemoteAddr string `json:"remoteAddr"`
	UserAgent string `json:"userAgent"`
	ConnectedAt time.Time `json:"connectedAt"`
	LastActiveAt time.Time `json:"lastActiveAt"`
	ch chan []byte
}

type ToolAdapter struct {
	bus *tools.ToolBus
}

// CallTool 直接执行 MCP 工具调用并返回标准 CallToolResult (完全开放模式)
// Calls: [a.bus.Get, cancel, context.WithTimeout, fmt.Errorf, fmt.Sprintf, inv.InvokableRun, json.Marshal, json.MarshalIndent, json.Unmarshal, string, t.Handler]
func (a *ToolAdapter) CallTool(ctx context.Context, name string, arguments map[string]any) CallToolResult { ... }

// ListTools 将 ToolBus 中的所有工具转译为标准 MCP ToolDefinition 列表
// Calls: [a.bus.List, info.ParamsOneOf.ToJSONSchema, json.Marshal, json.Unmarshal, rt.BaseTool.Info]
func (a *ToolAdapter) ListTools(ctx context.Context) []ToolDefinition { ... }

type ToolContent struct {
	// "text"
	Type string `json:"type"`
	Text string `json:"text"`
}

type ToolDefinition struct {
	Name string `json:"name"`
	Description string `json:"description,omitempty"`
	InputSchema map[string]any `json:"inputSchema"`
}

type ToolsCapability struct {
	ListChanged bool `json:"listChanged,omitempty"`
}

type ToolsListResult struct {
	Tools []ToolDefinition `json:"tools"`
	NextCursor string `json:"nextCursor,omitempty"`
}

```

#### Functions

```go
func NewErrorResponse(id any, code int, message string, data any) JSONRPCResponse { ... }

func NewResponse(id any, result any) JSONRPCResponse { ... }

func NewServer(adapter *ToolAdapter) *Server { ... }

func NewToolAdapter(bus *tools.ToolBus) *ToolAdapter { ... }

```

---

### Package `memory` (`agent/memory`)

- **Imports (2):** `github.com/cloudwego/eino/schema`, `sync`

#### Structs & Methods

```go
type WorkingMemory struct {
	mu sync.RWMutex
	messages []*schema.Message
	maxTokens int
	lastRecallAt int64
}

// Calls: [w.mu.Lock, w.mu.Unlock]
func (w *WorkingMemory) Append(msg *schema.Message) { ... }

// Calls: [w.mu.Lock, w.mu.Unlock]
func (w *WorkingMemory) CompressSlidingWindow() { ... }

// Calls: [w.mu.RLock, w.mu.RUnlock]
func (w *WorkingMemory) GetMessages() []*schema.Message { ... }

// Calls: [w.mu.Lock, w.mu.Unlock]
func (w *WorkingMemory) SetMessages(msgs []*schema.Message) { ... }

```

#### Functions

```go
func NewWorkingMemory(maxTokens int) *WorkingMemory { ... }

```

---

### Package `planner` (`agent/planner`)

- **Imports (13):** `context`, `encoding/json`, `fmt`, `github.com/cloudwego/eino/schema`, `os`, `path/filepath`, `strings`, `sync`, `terminal/agent/events`, `terminal/agent/guard`, `terminal/agent/router`, `terminal/storage`, `time`

#### Constants & Variables

```go
const RiskLow RiskLevel = "low"
const RiskMedium RiskLevel = "medium"
const RiskHigh RiskLevel = "high"
```

#### Structs & Methods

```go
// Plan 规划方案实体 (对齐 Antigravity IDE 规范，以 Markdown 为核心资产)
type Plan struct {
	ID string `json:"id"`
	SessionID string `json:"session_id"`
	Objective string `json:"objective"`
	// Markdown 格式完整实施方案
	Content string `json:"content"`
	// 本地落盘路径 (%APPDATA%/xTerminal/plans/<sessionId>/implementation_plan.md)
	FilePath string `json:"file_path"`
	// proposed | approved | rejected
	Status string `json:"status"`
	// 是否是对已有方案的更新版本
	IsUpdate bool `json:"is_update,omitempty"`
	// 兼容字段
	Steps []PlanStep `json:"steps,omitempty"`
	// 兼容字段
	RiskLevel RiskLevel `json:"risk_level,omitempty"`
	NeedConfirm bool `json:"need_confirm"`
	ReasoningContent string `json:"reasoning_content,omitempty"`
	CreatedAt int64 `json:"created_at"`
}

type PlanGate struct {
	mu sync.RWMutex
	pendingPlans map[string]*Plan
	activePlans map[string]*Plan
	// planID -> stepID -> exempted
	exemptions map[string]map[string]bool
}

// Calls: [pg.mu.Lock, pg.mu.Unlock]
func (pg *PlanGate) Approve(planID string) (*Plan, bool) { ... }

// Calls: [pg.mu.Lock, pg.mu.Unlock]
func (pg *PlanGate) ExemptStep(planID string, stepID string) { ... }

// Calls: [pg.mu.RLock, pg.mu.RUnlock]
func (pg *PlanGate) Get(planID string) *Plan { ... }

// Calls: [pg.mu.RLock, pg.mu.RUnlock]
func (pg *PlanGate) IsStepExempted(planID string, stepID string) bool { ... }

// Calls: [pg.mu.Lock, pg.mu.Unlock]
func (pg *PlanGate) Submit(p *Plan) { ... }

type PlanStep struct {
	ID string `json:"id"`
	// tool_call | subagent | job | ask_user
	Action string `json:"action"`
	ToolName string `json:"tool_name,omitempty"`
	Args json.RawMessage `json:"args,omitempty"`
	Description string `json:"description"`
	DependsOn []string `json:"depends_on,omitempty"`
	ExpectedOut string `json:"expected_out,omitempty"`
	Exempted bool `json:"exempted,omitempty"`
	// pending | running | completed | failed | skipped
	Status string `json:"status"`
	DurationMs int64 `json:"duration_ms,omitempty"`
	Error string `json:"error,omitempty"`
	Output any `json:"output,omitempty"`
	Verdict string `json:"verdict,omitempty"`
}

type Planner struct {
	mu sync.RWMutex
	router *router.ModelRouter
	guard *guard.PolicyGuard
	eventBus *events.EventBus
}

func (p *Planner) EvaluateNeedConfirm(plan *Plan) bool { ... }

// Calls: [GetPlansDir, contentAcc.String, contentAcc.WriteString, filepath.Join, fmt.Sprintf, p.eventBus.Emit, p.router.Resolve, reasoningAcc.String, reasoningAcc.WriteString, resolved.Model.Generate, resolved.Model.Stream, schema.SystemMessage, schema.UserMessage, storage.WriteFileAtomic, stream.Close, stream.Recv, strings.TrimSpace, time.Now, time.Now().UnixMilli, time.Now().UnixNano]
func (p *Planner) GeneratePlan(ctx context.Context, sessionID string, objective string, toolDescriptions string) (*Plan, error) { ... }

```

#### Functions

```go
// DeletePlan 删除会话对应的实施方案目录
// Calls: [os.RemoveAll, storage.PlansDir]
func DeletePlan(sessionID string) error { ... }

// GetExistingPlan 获取会话已有方案内容（若无则返回空字符串）
// Calls: [GetPlansDir, filepath.Join, os.ReadFile, string, strings.TrimSpace]
func GetExistingPlan(sessionID string) string { ... }

// GetPlansDir 获取会话专用的 plans 应用目录
// Calls: [os.MkdirAll, storage.PlansDir]
func GetPlansDir(sessionID string) (string, error) { ... }

func NewPlanGate() *PlanGate { ... }

func NewPlanner(r *router.ModelRouter, g *guard.PolicyGuard, eb *events.EventBus) *Planner { ... }

// SavePlanMarkdown 保存 Markdown 方案到会话应用目录，并返回包装好的 Plan 对象
// Calls: [GetPlansDir, filepath.Join, fmt.Sprintf, os.ReadFile, storage.WriteFileAtomic, string, strings.TrimSpace, time.Now, time.Now().UnixMilli, time.Now().UnixNano]
func SavePlanMarkdown(sessionID string, objective string, content string) (*Plan, error) { ... }

```

---

### Package `router` (`agent/router`)

- **Imports (8):** `context`, `fmt`, `github.com/cloudwego/eino-ext/components/model/openai`, `net`, `net/http`, `strings`, `sync`, `time`

#### Constants & Variables

```go
const RoleDefault ModelRole = "default"
const RolePlanner ModelRole = "planner"
const RoleVerifier ModelRole = "verifier"
```

#### Structs & Methods

```go
type ModelProfile struct {
	BaseURL string `json:"base_url"`
	APIKey string `json:"api_key"`
	Model string `json:"model"`
	Temperature float32 `json:"temperature"`
	EnableThinking bool `json:"enable_thinking"`
	ReasoningEffort string `json:"reasoning_effort"`
}

type ModelRouter struct {
	mu sync.RWMutex
	profiles map[ModelRole]ModelProfile
	models map[ModelRole]*openai.ChatModel
}

// Calls: [fmt.Errorf, openai.NewChatModel, openai.ReasoningEffortLevel, r.mu.Lock, r.mu.Unlock, strings.TrimSpace]
func (r *ModelRouter) Resolve(ctx context.Context, role ModelRole) (*ResolvedModel, error) { ... }

// Calls: [r.mu.Lock, r.mu.Unlock]
func (r *ModelRouter) SetProfile(role ModelRole, profile ModelProfile) { ... }

type ResolvedModel struct {
	Role ModelRole
	Model *openai.ChatModel
	Profile ModelProfile
}

```

#### Functions

```go
func NewModelRouter() *ModelRouter { ... }

```

---

### Package `shell` (`agent/shell`)

- **Imports (13):** `context`, `errors`, `fmt`, `github.com/cloudwego/eino/adk/filesystem`, `github.com/cloudwego/eino/schema`, `io`, `os`, `os/exec`, `strconv`, `strings`, `sync`, `sync/atomic`, `syscall`

#### Constants & Variables

```go
// maxOutputBytes caps output at 1MB to prevent buffer explosion
const maxOutputBytes = 1024 * 1024
// Ensure LocalStreamingShell implements filesystem.StreamingShell and filesystem.Shell
var _ filesystem.StreamingShell
// Ensure LocalStreamingShell implements filesystem.StreamingShell and filesystem.Shell
var _ filesystem.Shell
```

#### Structs & Methods

```go
// LocalStreamingShell provides cross-platform streaming shell execution supporting Windows, Linux and macOS.
type LocalStreamingShell struct {
	mu sync.RWMutex
	cwd string
}

// Execute executes a command synchronously and returns the complete result.
// Calls: [errors.Is, errors.New, outBuilder.String, outBuilder.WriteString, s.ExecuteStreaming, sr.Close, sr.Recv, strings.TrimSpace]
func (s *LocalStreamingShell) Execute(ctx context.Context, input *filesystem.ExecuteRequest) (*filesystem.ExecuteResponse, error) { ... }

// ExecuteStreaming executes a command and streams output line by line to a StreamReader.
// Calls: [cmd.Start, cmd.Wait, ctx.Done, errors.As, errors.New, exitError.ExitCode, fmt.Errorf, killProcessTree, outPipe.Flush, outPipe.truncated.Load, s.buildCommand, schema.Pipe, strings.TrimSpace, sw.Close, sw.Send]
func (s *LocalStreamingShell) ExecuteStreaming(ctx context.Context, input *filesystem.ExecuteRequest) (*schema.StreamReader[*filesystem.ExecuteResponse], error) { ... }

// GetCwd returns the current working directory.
// Calls: [fi.IsDir, os.Getwd, os.Stat, s.mu.RLock, s.mu.RUnlock]
func (s *LocalStreamingShell) GetCwd() string { ... }

// SetCwd updates the current working directory.
// Calls: [s.mu.Lock, s.mu.Unlock]
func (s *LocalStreamingShell) SetCwd(cwd string) { ... }

// buildCommand creates the platform-appropriate exec.Cmd for the given command string.
// Calls: [newOSCommand, s.GetCwd, strings.TrimSpace]
func (s *LocalStreamingShell) buildCommand(ctx context.Context, command string) *exec.Cmd { ... }

// streamWriterPipe adapts io.Writer to schema.StreamWriter[*filesystem.ExecuteResponse] line by line without pipe descriptor deadlocks.
type streamWriterPipe struct {
	sw *schema.StreamWriter[*filesystem.ExecuteResponse]
	ctx context.Context
	totalBytes int64
	truncated atomic.Bool
	buf strings.Builder
	mu sync.Mutex
}

// Calls: [w.buf.Reset, w.buf.String, w.mu.Lock, w.mu.Unlock, w.sw.Send, w.truncated.Load]
func (w *streamWriterPipe) Flush() { ... }

// Calls: [atomic.AddInt64, int64, strings.IndexByte, w.buf.Reset, w.buf.String, w.buf.Write, w.buf.WriteString, w.ctx.Done, w.ctx.Err, w.mu.Lock, w.mu.Unlock, w.sw.Send, w.truncated.Load, w.truncated.Swap]
func (w *streamWriterPipe) Write(p []byte) (n int, err error) { ... }

```

#### Functions

```go
// NewLocalStreamingShell creates a new LocalStreamingShell instance with the specified working directory.
func NewLocalStreamingShell(cwd string) *LocalStreamingShell { ... }

// killProcessTree terminates the process group on Unix platforms.
// Calls: [cmd.Process.Kill, syscall.Kill]
func killProcessTree(cmd *exec.Cmd) { ... }

// killProcessTree terminates the command and all its child processes on Windows.
// Calls: [cmd.Process.Kill, exec.Command, killCmd.Run, strconv.Itoa]
func killProcessTree(cmd *exec.Cmd) { ... }

// newOSCommand creates a Unix/Linux/macOS-specific exec.Cmd using Bash (or Sh fallback).
// Calls: [exec.CommandContext, exec.LookPath, strings.NewReader]
func newOSCommand(ctx context.Context, command string) *exec.Cmd { ... }

// newOSCommand creates an optimized Windows-specific exec.Cmd using PowerShell (or CMD fallback) with UTF-8 output encoding.
// Calls: [exec.CommandContext, exec.LookPath, os.Environ, strings.NewReader]
func newOSCommand(ctx context.Context, command string) *exec.Cmd { ... }

```

---

### Package `skills` (`agent/skills`)

- **Imports (8):** `fmt`, `gopkg.in/yaml.v3`, `os`, `path/filepath`, `strings`, `sync`, `terminal/agent/store`, `terminal/storage`

#### Structs & Methods

```go
type Skill struct {
	Name string `json:"name"`
	Description string `json:"description"`
	Instructions string `json:"instructions"`
	Tools []string `json:"tools,omitempty"`
	Context string `json:"context,omitempty"`
	Path string `json:"path,omitempty"`
}

type SkillFrontMatter struct {
	Name string `yaml:"name" json:"name"`
	Description string `yaml:"description" json:"description"`
	Context string `yaml:"context" json:"context,omitempty"`
	Agent string `yaml:"agent" json:"agent,omitempty"`
	Model string `yaml:"model" json:"model,omitempty"`
}

type SkillsRegistry struct {
	mu sync.RWMutex
	skillsDir string
	store *store.Store
}

// Calls: [ParseSkillFile, filepath.Join, fmt.Errorf, os.Stat, r.List, r.mu.RLock, r.mu.RUnlock, strings.EqualFold]
func (r *SkillsRegistry) Get(name string) (*Skill, error) { ... }

// Calls: [r.mu.RLock, r.mu.RUnlock]
func (r *SkillsRegistry) GetSkillsDir() string { ... }

// Calls: [ParseSkillFile, entry.IsDir, entry.Name, filepath.Join, os.ReadDir, os.Stat, r.mu.RLock, r.mu.RUnlock]
func (r *SkillsRegistry) List() []Skill { ... }

// Calls: [os.MkdirAll, r.mu.Lock, r.mu.Unlock]
func (r *SkillsRegistry) SetSkillsDir(dir string) { ... }

```

#### Functions

```go
// GetDefaultSkillsDir returns the standard skills directory (%APPDATA%/xTerminal/skills or ~/.config/xTerminal/skills)
// Calls: [os.MkdirAll, storage.SkillsDir]
func GetDefaultSkillsDir() string { ... }

// Calls: [GetDefaultSkillsDir]
func NewSkillsRegistry(st *store.Store) *SkillsRegistry { ... }

// ParseSkillFile parses a SKILL.md file with YAML FrontMatter and markdown body
// Calls: [filepath.Base, filepath.Dir, os.ReadFile, string, strings.HasPrefix, strings.Index, strings.Split, strings.TrimPrefix, strings.TrimSpace, yaml.Unmarshal]
func ParseSkillFile(filePath string) (*Skill, error) { ... }

```

---

### Package `store` (`agent/store`)

- **Imports (11):** `database/sql`, `encoding/json`, `errors`, `fmt`, `modernc.org/sqlite`, `os`, `path/filepath`, `strings`, `sync`, `terminal/storage`, `time`

#### Constants & Variables

```go
var defaultStore *Store
var storeOnce sync.Once
```

#### Structs & Methods

```go
type MessageItem struct {
	ID int64 `json:"id"`
	SessionID string `json:"session_id"`
	Role string `json:"role"`
	Content string `json:"content"`
	Reasoning string `json:"reasoning,omitempty"`
	// JSON
	ToolCalls string `json:"tool_calls,omitempty"`
	// JSON
	ProcessSteps string `json:"process_steps,omitempty"`
	// JSON
	Plan string `json:"plan,omitempty"`
	CreatedAt int64 `json:"created_at"`
}

type SessionItem struct {
	ID string `json:"id"`
	Title string `json:"title"`
	CreatedAt int64 `json:"created_at"`
	UpdatedAt int64 `json:"updated_at"`
}

type SkillItem struct {
	Name string `json:"name"`
	Description string `json:"description"`
	Instructions string `json:"instructions"`
	// comma separated
	Tools string `json:"tools"`
}

type Store struct {
	mu sync.RWMutex
	db *sql.DB
}

// Calls: [s.db.Exec, s.mu.Lock, s.mu.Unlock, time.Now, time.Now().UnixMilli]
func (s *Store) AddMessage(it MessageItem) error { ... }

// Calls: [s.db.Exec, s.mu.Lock, s.mu.Unlock]
func (s *Store) ClearSessionMessages(sessionID string) error { ... }

// Calls: [s.db.Close, s.mu.Lock, s.mu.Unlock]
func (s *Store) Close() error { ... }

// Calls: [fmt.Sprintf, s.db.Exec, s.mu.Lock, s.mu.Unlock, strings.TrimSpace, time.Now, time.Now().UnixMilli]
func (s *Store) CreateSession(id string, title string) (SessionItem, error) { ... }

// Calls: [s.db.Begin, s.mu.Lock, s.mu.Unlock, tx.Commit, tx.Exec, tx.Rollback]
func (s *Store) DeleteSession(id string) error { ... }

// Calls: [errors.Is, s.db.QueryRow, s.db.QueryRow().Scan, s.mu.RLock, s.mu.RUnlock]
func (s *Store) GetSession(id string) (*SessionItem, error) { ... }

// Calls: [rows.Close, rows.Next, rows.Scan, s.db.Query, s.mu.RLock, s.mu.RUnlock]
func (s *Store) ListMessages(sessionID string) ([]MessageItem, error) { ... }

// Calls: [rows.Close, rows.Next, rows.Scan, s.db.Query, s.mu.RLock, s.mu.RUnlock]
func (s *Store) ListSessions() ([]SessionItem, error) { ... }

// Calls: [rows.Close, rows.Next, rows.Scan, s.db.Query, s.mu.RLock, s.mu.RUnlock]
func (s *Store) ListSkills() ([]SkillItem, error) { ... }

// Calls: [s.db.Begin, s.mu.Lock, s.mu.Unlock, stmt.Close, stmt.Exec, time.Now, time.Now().UnixMilli, tx.Commit, tx.Exec, tx.Prepare, tx.Rollback]
func (s *Store) ReplaceMessages(sessionID string, msgs []MessageItem) error { ... }

// Calls: [s.db.Exec, s.mu.Lock, s.mu.Unlock]
func (s *Store) SaveSkill(it SkillItem) error { ... }

// Calls: [s.db.Exec, s.mu.Lock, s.mu.Unlock, time.Now, time.Now().UnixMilli]
func (s *Store) TouchSession(id string) error { ... }

// Calls: [s.db.Exec, s.mu.Lock, s.mu.Unlock, strings.TrimSpace, time.Now, time.Now().UnixMilli]
func (s *Store) UpdateSessionTitle(id string, title string) error { ... }

// Calls: [filepath.Join, json.Unmarshal, os.ReadFile, os.Stat, s.AddMessage, s.db.QueryRow, s.db.QueryRow().Scan, storage.BaseDir, string, time.Now, time.Now().UnixMilli]
func (s *Store) autoMigrateJSONHistory() { ... }

// Calls: [rows.Close, rows.Next, rows.Scan, s.db.Exec, s.db.Query, s.db.QueryRow, s.db.QueryRow().Scan, time.Now, time.Now().UnixMilli]
func (s *Store) autoMigrateSessions() { ... }

// Calls: [s.db.Exec]
func (s *Store) initSchema() error { ... }

```

#### Functions

```go
// Calls: [NewStore, filepath.Dir, os.MkdirAll, storage.AgentDBPath, storeOnce.Do]
func GetStore() (*Store, error) { ... }

// Calls: [db.SetMaxOpenConns, fmt.Errorf, s.autoMigrateJSONHistory, s.autoMigrateSessions, s.initSchema, sql.Open]
func NewStore(dbPath string) (*Store, error) { ... }

```

---

### Package `tools` (`agent/tools`)

- **Imports (39):** `bytes`, `context`, `crypto/tls`, `encoding/base64`, `encoding/json`, `errors`, `fmt`, `github.com/cloudwego/eino/adk/filesystem`, `github.com/cloudwego/eino/components/tool`, `github.com/cloudwego/eino/components/tool/utils`, `github.com/cloudwego/eino/schema`, `github.com/google/uuid`, `gopkg.in/yaml.v3`, `io`, `net/http`, `net/url`, `os`, `path/filepath`, `sort`, `strconv`, `strings`, `sync`, `terminal/agent/ask`, `terminal/agent/events`, `terminal/agent/guard`, `terminal/agent/router`, `terminal/agent/shell`, `terminal/agent/skills`, `terminal/agent/wiki`, `terminal/core`, `terminal/db`, `terminal/docker`, `terminal/k8s`, `terminal/mongo`, `terminal/proto`, `terminal/redis`, `terminal/ssh`, `terminal/storage`, `time`

#### Constants & Variables

```go
const defaultApiTreeJson = `[
  {
    "id": "folder_default",
    "name": "默认分组",
    "isFolder": true,
    "createdAt": 1700000000000,
    "updatedAt": 1700000000000,
    "children": [
      {
        "id": "api_example_get",
        "name": "示例: GET 请求",
        "isFolder": false,
        "mode": "http",
        "method": "GET",
        "url": "https://httpbin.org/get",
        "params": [
          {
            "name": "test",
            "value": "123",
            "enabled": true
          }
        ],
        "headers": [],
        "bodyType": "none",
        "body": "",
        "auth": {
          "type": "none"
        },
        "timeoutMs": 30000,
        "insecureTLS": false,
        "followRedirects": true,
        "createdAt": 1700000000000,
        "updatedAt": 1700000000000
      }
    ]
  }
]`
var activeConnMu sync.RWMutex
var globalActiveConn *ActiveConnectionInfo
var apiFileMu sync.Mutex
var defaultIgnoreDirs
```

#### Structs & Methods

```go
type ActiveConnectionInfo struct {
	// ssh, redis, mysql, postgres, mongo, sqlite, docker, k8s, mqtt
	Protocol string `json:"protocol"`
	// 连接 ID / Session ID
	ID string `json:"id"`
	// 会话/连接名称
	Name string `json:"name"`
	// 主机地址
	Host string `json:"host,omitempty"`
	// 端口
	Port int `json:"port,omitempty"`
	// 数据库名 / Redis DB
	Database string `json:"database,omitempty"`
	// K8s 命名空间
	Namespace string `json:"namespace,omitempty"`
	// 连接用户
	Username string `json:"username,omitempty"`
	// SQLite 路径
	Path string `json:"path,omitempty"`
}

// ApiAuthItem 接口鉴权配置
type ApiAuthItem struct {
	// none | basic | bearer
	Type string `json:"type"`
	Username string `json:"username,omitempty"`
	Password string `json:"password,omitempty"`
	Token string `json:"token,omitempty"`
}

// ApiHeaderItem 接口的请求头或 Query 参数项
type ApiHeaderItem struct {
	Name string `json:"name"`
	Value string `json:"value"`
	Enabled bool `json:"enabled"`
}

// ApiManagerInput 接口管理工具输入结构体
type ApiManagerInput struct {
	Action string `json:"action" jsonschema:"description=操作类型: list (列出/搜索接口与分组摘要), get (获取单个接口或分组详情), create (新建接口或分组), update (更新接口或分组), delete (删除接口或分组),required"`
	Keyword string `json:"keyword,omitempty" jsonschema:"description=搜索关键词 (用于 action=list 时按名称/URL/方法过滤)"`
	ID string `json:"id,omitempty" jsonschema:"description=目标接口或分组 ID (用于 get / update / delete)"`
	Name string `json:"name,omitempty" jsonschema:"description=接口或分组名称 (用于 create / update，或在 get/delete 时按名称查找)"`
	IsFolder bool `json:"is_folder,omitempty" jsonschema:"description=是否为分组节点 (用于 create，true 表示新建分组，false 表示新建接口)"`
	TargetFolderID string `json:"target_folder_id,omitempty" jsonschema:"description=目标父分组 ID (用于 create 时指定放入哪个分组，默认为根目录)"`
	Method string `json:"method,omitempty" jsonschema:"description=HTTP 请求方法 (GET, POST, PUT, DELETE, PATCH 等，用于接口)"`
	URL string `json:"url,omitempty" jsonschema:"description=接口请求 URL 地址 (用于接口)"`
	Params map[string]any `json:"params,omitempty" jsonschema:"description=可选 Query 查询参数字典 (键值对)"`
	Headers map[string]string `json:"headers,omitempty" jsonschema:"description=可选自定义请求头字典 (键值对)"`
	BodyType string `json:"body_type,omitempty" jsonschema:"description=请求体类型: none, json, text, xml"`
	Body any `json:"body,omitempty" jsonschema:"description=请求体内容，可为普通字符串或 JSON 对象/字典"`
	AuthType string `json:"auth_type,omitempty" jsonschema:"description=鉴权类型: none, basic, bearer"`
	AuthToken string `json:"auth_token,omitempty" jsonschema:"description=Bearer Token 鉴权值"`
	AuthUsername string `json:"auth_username,omitempty" jsonschema:"description=Basic Auth 用户名"`
	AuthPassword string `json:"auth_password,omitempty" jsonschema:"description=Basic Auth 密码"`
	TimeoutMs int `json:"timeout_ms,omitempty" jsonschema:"description=请求超时时间 (毫秒)，默认 30000"`
	InsecureTLS bool `json:"insecure_tls,omitempty" jsonschema:"description=是否跳过 SSL 证书校验"`
	FollowRedirects *bool `json:"follow_redirects,omitempty" jsonschema:"description=是否自动跟随 3xx 重定向，默认 true"`
}

// ApiManagerOutput 接口管理工具输出结构体
type ApiManagerOutput struct {
	Action string `json:"action"`
	Success bool `json:"success"`
	Message string `json:"message,omitempty"`
	List []ApiSummary `json:"list,omitempty"`
	Item *ApiTreeItem `json:"item,omitempty"`
	Total int `json:"total,omitempty"`
}

// ApiSummary 接口或分组的精简摘要结构（便于 LLM 快速通览）
type ApiSummary struct {
	ID string `json:"id"`
	Name string `json:"name"`
	IsFolder bool `json:"is_folder"`
	FolderPath string `json:"folder_path,omitempty"`
	Method string `json:"method,omitempty"`
	URL string `json:"url,omitempty"`
	ChildCount int `json:"child_count,omitempty"`
}

// ApiTreeItem 接口树节点（支持分组与接口项）
type ApiTreeItem struct {
	ID string `json:"id"`
	Name string `json:"name"`
	IsFolder bool `json:"isFolder"`
	// "http" | "ws"
	Mode string `json:"mode,omitempty"`
	Method string `json:"method,omitempty"`
	URL string `json:"url,omitempty"`
	Params []ApiHeaderItem `json:"params,omitempty"`
	Headers []ApiHeaderItem `json:"headers,omitempty"`
	BodyType string `json:"bodyType,omitempty"`
	Body string `json:"body,omitempty"`
	Auth *ApiAuthItem `json:"auth,omitempty"`
	TimeoutMs int `json:"timeoutMs,omitempty"`
	InsecureTLS bool `json:"insecureTLS,omitempty"`
	FollowRedirects bool `json:"followRedirects,omitempty"`
	WsProtocols string `json:"wsProtocols,omitempty"`
	Children []ApiTreeItem `json:"children,omitempty"`
	CreatedAt int64 `json:"createdAt,omitempty"`
	UpdatedAt int64 `json:"updatedAt,omitempty"`
}

type ApplyFilePatchInput struct {
	Path string `json:"path" jsonschema:"description=待修改文件的相对路径"`
	OldContent string `json:"old_content" jsonschema:"description=需要被替换的原始内容片段（需包含足够上下文以保证唯一性）"`
	NewContent string `json:"new_content" jsonschema:"description=用于替换的新内容片段"`
}

type ApplyFilePatchOutput struct {
	Path string `json:"path"`
	Success bool `json:"success"`
	Message string `json:"message"`
}

// ---------- Ask User Tool ----------
type AskUserInput struct {
	SessionID string `json:"session_id,omitempty" jsonschema:"description=当前所属会话 ID"`
	Question string `json:"question" jsonschema:"description=向用户提问的具体内容"`
	Options []string `json:"options,omitempty" jsonschema:"description=可选的预设快捷选项列表"`
}

type CreateFileInput struct {
	Path string `json:"path" jsonschema:"description=待创建文件的相对路径，如 'src/components/Button.vue'"`
	Content string `json:"content" jsonschema:"description=文件的初始内容"`
	Overwrite bool `json:"overwrite,omitempty" jsonschema:"description=是否强制覆盖已存在的文件，默认 false"`
}

type CreateFileOutput struct {
	Path string `json:"path"`
	Success bool `json:"success"`
	BytesWritten int `json:"bytes_written"`
	Message string `json:"message"`
}

type DatabaseManagers struct {
	RedisMgr *redis.RedisManager
	MysqlMgr *db.MysqlManagerEx
	PostgresMgr *db.PostgresManager
	MongoMgr *mongo.MongoManager
	SqliteMgr *db.SqliteManager
}

type DeleteFileInput struct {
	Path string `json:"path" jsonschema:"description=待删除文件的相对路径"`
}

type DeleteFileOutput struct {
	Path string `json:"path"`
	Success bool `json:"success"`
	Message string `json:"message"`
}

type DockerExecInput struct {
	ServerID string `json:"server_id,omitempty" jsonschema:"description=Docker 实例连接 ID 或名称，若当前处于活动 Docker 会话或仅有一个连接可留空"`
	ContainerID string `json:"container_id,omitempty" jsonschema:"description=目标容器的 ID 或名称，例如: my-nginx。若在 command 中已包含容器名可留空"`
	Command string `json:"command" jsonschema:"description=要在容器内执行的命令或脚本（例如: 'ls -la /app' 或 'cat /etc/hosts'），也支持直接传入完整 CLI 如 'docker exec -it web ps'"`
	WorkingDir string `json:"working_dir,omitempty" jsonschema:"description=容器内可选工作目录"`
	User string `json:"user,omitempty" jsonschema:"description=容器内可选执行用户"`
}

type DockerExecuteInput struct {
	ServerID string `json:"server_id,omitempty" jsonschema:"description=Docker 实例连接 ID 或名称，若当前处于活动 Docker 会话或仅有一个连接可留空"`
	Command string `json:"command" jsonschema:"description=要执行的 Docker 命令行指令，例如: docker ps -a、docker logs -n 50 <容器名/ID>、docker inspect <容器名>、docker start/stop/restart <容器名>、docker images、docker info、docker compose ls。注意：本工具明确不支持部署/下线操作（不支持 docker run, docker create, docker compose up/down 等）；涉及容器栈的编排部署、发布或下线销毁，请务必使用 docker_orchestrate 工具"`
}

type DockerOrchestrateInput struct {
	Action string `json:"action" jsonschema:"description=要执行的编排操作类型：'apply' (部署/增量更新 Compose 容器栈并保存记录，同 'up')、'delete' (下线销毁 Compose 容器栈及网络并清除本地记录，同 'down')、'list' (查看本地保存的 Compose 方案与远程运行态 Stack 列表),enum=apply,enum=delete,enum=list,enum=up,enum=down"`
	ServerID string `json:"server_id,omitempty" jsonschema:"description=Docker 实例连接 ID 或名称，若当前处于活动 Docker 会话或仅有一个连接可留空自动解析"`
	YamlContent string `json:"yaml_content,omitempty" jsonschema:"description=完整的 docker-compose.yml 编排内容。action 为 apply/up 时必填；action 为 delete/down 时可选"`
	Name string `json:"name,omitempty" jsonschema:"description=Compose 项目名称 (Project Name，如 'my-app' 或 'redis-cluster')。留空时 apply 自动从 YAML 顶级 name 或首个服务名智能推导"`
	RecordID string `json:"record_id,omitempty" jsonschema:"description=目标本地 Compose 记录 ID。action 为 delete 时，可直接提供 record_id 进行精准下线删除"`
	EnvVars map[string]string `json:"env_vars,omitempty" jsonschema:"description=可选的环境变量键值对，用于在部署时对 Compose YAML 中的 ${VAR} 变量进行插值替换"`
	ForcePull bool `json:"force_pull,omitempty" jsonschema:"description=部署前是否强制拉取最新镜像，默认 false"`
	Recreate bool `json:"recreate,omitempty" jsonschema:"description=是否强制重建所有已存在的容器实例，默认 false"`
}

type EmptyInput struct {
}

type ExecuteCommandInput struct {
	Command string `json:"command" jsonschema:"description=要执行的命令行指令字符串（例如：'npm run build'、'go test ./...'、'git status'等）"`
	Cwd string `json:"cwd,omitempty" jsonschema:"description=可选的工作目录绝对或相对路径。留空时默认使用当前绑定的工作区目录"`
}

// HttpRequestInput 全功能 HTTP 请求输入结构体
type HttpRequestInput struct {
	ApiID string `json:"api_id,omitempty" jsonschema:"description=可选已保存接口的 ID (若提供将自动从接口列表中加载该接口的 URL/Method/Headers/Params/Body/Auth 等基础配置)"`
	ApiName string `json:"api_name,omitempty" jsonschema:"description=可选已保存接口的名称 (用于通过名称查找已存接口配置)"`
	Method string `json:"method,omitempty" jsonschema:"description=HTTP 请求方法 (GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS)，大小写不敏感，默认为 GET 或从已保存接口继承"`
	URL string `json:"url,omitempty" jsonschema:"description=目标 HTTP/HTTPS URL 地址 (若缺少协议头将自动补齐 http://；若提供了 api_id/api_name 可省略)"`
	Params map[string]any `json:"params,omitempty" jsonschema:"description=可选的 URL Query 查询参数字典，会自动进行 URL 编码并拼接到 URL 尾部 (会与已保存接口的参数合并)"`
	Headers map[string]string `json:"headers,omitempty" jsonschema:"description=可选的自定义请求头键值对，如 Authorization, Content-Type, Accept 等 (会与已保存接口的请求头合并)"`
	Body any `json:"body,omitempty" jsonschema:"description=请求体内容，可为普通字符串、JSON 对象/数组或字典"`
	FormData map[string]string `json:"form_data,omitempty" jsonschema:"description=表单数据 (x-www-form-urlencoded)，会自动编码为表单格式并设置对应 Content-Type"`
	ContentType string `json:"content_type,omitempty" jsonschema:"description=显式指定 Content-Type，若未指定但 body 为对象时自动设为 application/json"`
	TimeoutSeconds int `json:"timeout_seconds,omitempty" jsonschema:"description=请求超时时间（秒），默认 15 秒，最大支持 300 秒"`
	InsecureSkipVerify bool `json:"insecure_skip_verify,omitempty" jsonschema:"description=是否跳过 SSL/TLS 证书有效性校验（在测试自签名证书或本地 HTTPS 服务时开启）"`
	FollowRedirects *bool `json:"follow_redirects,omitempty" jsonschema:"description=是否自动跟随 3xx 重定向，默认为 true"`
	ProxyURL string `json:"proxy_url,omitempty" jsonschema:"description=可选的 HTTP/SOCKS5 代理地址，如 http://127.0.0.1:7890"`
	SaveToList bool `json:"save_to_list,omitempty" jsonschema:"description=是否在执行后将本次请求保存/更新到接口列表中，默认 false"`
	SaveName string `json:"save_name,omitempty" jsonschema:"description=保存到接口列表时的接口名称 (若未提供且指定了 api_id 则更新原接口，否则使用 URL 或请求方法作为名称)"`
	TargetFolderID string `json:"target_folder_id,omitempty" jsonschema:"description=保存到接口列表时的目标分组 ID (默认为默认分组或根目录)"`
}

// HttpRequestOutput 全功能 HTTP 请求输出结构体
type HttpRequestOutput struct {
	StatusCode int `json:"status_code" jsonschema:"description=HTTP 响应状态码"`
	StatusText string `json:"status_text" jsonschema:"description=HTTP 响应状态描述文本"`
	Headers map[string]string `json:"headers" jsonschema:"description=响应头集合"`
	Body string `json:"body" jsonschema:"description=完整响应体文本"`
	DurationMs int64 `json:"duration_ms" jsonschema:"description=请求执行总耗时 (毫秒)"`
	Size int64 `json:"size" jsonschema:"description=响应体总字节数"`
	SavedApiID string `json:"saved_api_id,omitempty" jsonschema:"description=若保存到接口列表，返回保存/更新后的接口 ID"`
}

type K8sExecInput struct {
	ServerID string `json:"server_id,omitempty" jsonschema:"description=Kubernetes 集群连接 ID 或名称，若当前处于活动 Kubernetes 会话或仅有一个连接可留空"`
	Namespace string `json:"namespace,omitempty" jsonschema:"description=目标命名空间，默认为 default"`
	PodName string `json:"pod_name,omitempty" jsonschema:"description=目标 Pod 名称，例如: nginx-pod。若在 command 中已指定 Pod 可留空"`
	ContainerName string `json:"container_name,omitempty" jsonschema:"description=Pod 内可选目标容器名称（多容器 Pod 时使用）"`
	Command string `json:"command" jsonschema:"description=要在 Pod 容器内执行的命令指令（例如: 'ls -la /' 或 'cat /etc/hosts'），也支持直接传入完整 CLI 如 'kubectl exec my-pod -n default -- sh -c env'"`
}

type K8sKubectlExecuteInput struct {
	ServerID string `json:"server_id,omitempty" jsonschema:"description=Kubernetes 集群连接 ID 或名称，若当前处于活动 Kubernetes 会话或仅有一个连接可留空"`
	Command string `json:"command" jsonschema:"description=要执行的 Kubectl 命令行指令，例如: kubectl get pods -n default、kubectl get nodes、kubectl logs <pod_name> -n default、kubectl describe deployment <name> -n default、kubectl scale deployment <name> --replicas=3 -n default、kubectl rollout restart deployment <name> -n default、kubectl cluster-info、kubectl version。注意：本工具明确不支持部署/下线操作（不支持 kubectl apply, kubectl create, kubectl delete 等）；集群应用的声明式部署发布、批量资源下线与销毁清理，请务必使用 k8s_orchestrate 工具"`
}

type K8sOrchestrateInput struct {
	Action string `json:"action" jsonschema:"description=要执行的编排操作类型：'apply' (声明式应用部署 YAML 并落盘保存记录)、'delete' (声明式下线清理集群中的资源并更新记录状态)、'list' (查看当前集群本地已保存的编排方案记录列表与状态),enum=apply,enum=delete,enum=list"`
	ServerID string `json:"server_id,omitempty" jsonschema:"description=Kubernetes 集群连接 ID 或名称，若当前处于活动 Kubernetes 会话或仅有一个连接可留空自动解析"`
	YamlContent string `json:"yaml_content,omitempty" jsonschema:"description=Kubernetes 资源清单 YAML 文本内容（支持多文档 --- 分隔，例如同时包含 Deployment、Service、ConfigMap 等）。action 为 apply 或 delete 时使用"`
	Name string `json:"name,omitempty" jsonschema:"description=编排方案自定义名称（例如: 'redis-cluster' 或 'nginx-ingress'）。若留空，apply 时会自动根据 YAML 清单中首个资源的 metadata.name 或 Kind 智能推导"`
	Namespace string `json:"namespace,omitempty" jsonschema:"description=目标兜底命名空间，若 YAML 资源内部未指定 namespace 时使用，默认为 default"`
	RecordID string `json:"record_id,omitempty" jsonschema:"description=目标编排记录 ID（可选）。action 为 delete 时，若未提供 yaml_content，可直接根据 record_id 下线已有的编排方案"`
}

type ListDirInput struct {
	Path string `json:"path,omitempty" jsonschema:"description=要查看的相对子目录路径，留空表示工作区根目录"`
	Depth int `json:"depth,omitempty" jsonschema:"description=目录遍历的最大递归深度，默认为 2（1 表示仅当前目录直接子项）"`
	Ignore []string `json:"ignore,omitempty" jsonschema:"description=额外需要忽略的文件或目录模式列表，如 ['*.tmp', 'coverage']"`
}

type ListDirOutput struct {
	Workspace string `json:"workspace"`
	RelPath string `json:"rel_path"`
	MaxDepth int `json:"max_depth"`
	TotalFiles int `json:"total_files"`
	TotalDirs int `json:"total_dirs"`
	Tree string `json:"tree"`
}

type MongoAggregateInput struct {
	ServerID string `json:"server_id,omitempty" jsonschema:"description=MongoDB 服务器连接 ID 或名称，若当前处于活动 MongoDB 会话或只有单一连接可留空"`
	Database string `json:"database,omitempty" jsonschema:"description=目标数据库名称，若当前活动会话已选库可留空"`
	Collection string `json:"collection" jsonschema:"description=目标集合名称"`
	PipelineJSON string `json:"pipeline_json" jsonschema:"description=MongoDB 聚合管道阶段的 JSON 数组字符串，例如 [ {\"$match\": ...}, {\"$group\": ...} ]"`
}

type MongoFindInput struct {
	ServerID string `json:"server_id,omitempty" jsonschema:"description=MongoDB 服务器连接 ID 或名称，若当前处于活动 MongoDB 会话或只有单一连接可留空"`
	Database string `json:"database,omitempty" jsonschema:"description=目标数据库名称，若当前活动会话已选库可留空"`
	Collection string `json:"collection" jsonschema:"description=目标集合名称"`
	QueryJSON string `json:"query_json,omitempty" jsonschema:"description=查询过滤条件的 JSON 字符串，例如 {\"status\": \"active\"}，留空则匹配全部"`
	Limit int `json:"limit,omitempty" jsonschema:"description=查询返回文档数量上限，默认 10，最大 50"`
}

type MongoHealthInput struct {
	ServerID string `json:"server_id,omitempty" jsonschema:"description=MongoDB 服务器连接 ID 或名称，若当前处于活动 MongoDB 会话或只有单一连接可留空"`
}

type MoveFileInput struct {
	SourcePath string `json:"source_path" jsonschema:"description=源文件相对路径"`
	DestinationPath string `json:"destination_path" jsonschema:"description=目标文件相对路径"`
	Overwrite bool `json:"overwrite,omitempty" jsonschema:"description=若目标路径已存在文件是否覆盖，默认 false"`
}

type MoveFileOutput struct {
	SourcePath string `json:"source_path"`
	DestinationPath string `json:"destination_path"`
	Success bool `json:"success"`
	Message string `json:"message"`
}

type MqttPublishInput struct {
	ServerID string `json:"server_id" jsonschema:"description=已连接的 MQTT 会话 ID"`
	Topic string `json:"topic" jsonschema:"description=要发布的目标 Topic"`
	Payload string `json:"payload" jsonschema:"description=消息内容 (文本或 JSON)"`
	QoS int `json:"qos" jsonschema:"description=服务质量等级 QoS (0, 1, 2)，默认为 0"`
	Retained bool `json:"retained" jsonschema:"description=是否设置为保留消息 (Retain)"`
}

type MqttSubscribeInput struct {
	ServerID string `json:"server_id" jsonschema:"description=已连接的 MQTT 会话 ID"`
	Topic string `json:"topic" jsonschema:"description=要订阅的目标 Topic"`
	QoS int `json:"qos" jsonschema:"description=服务质量等级 QoS (0, 1, 2)，默认为 0"`
}

type MysqlDatabasesInput struct {
	ServerID string `json:"server_id,omitempty" jsonschema:"description=MySQL 服务器连接 ID 或名称，若当前处于活动 MySQL 会话或只有单一连接可留空"`
}

type MysqlQueryInput struct {
	ServerID string `json:"server_id,omitempty" jsonschema:"description=MySQL 服务器连接 ID 或名称，若当前处于活动 MySQL 会话或只有单一连接可留空"`
	Database string `json:"database,omitempty" jsonschema:"description=目标数据库名称，若当前活动会话已选库或未指定可留空"`
	SQL string `json:"sql" jsonschema:"description=要执行的 SQL 语句 (支持 SELECT / SHOW / INSERT / UPDATE / DELETE / DDL 等读写操作)"`
}

type MysqlSchemaInput struct {
	ServerID string `json:"server_id,omitempty" jsonschema:"description=MySQL 服务器连接 ID 或名称，若当前处于活动 MySQL 会话或只有单一连接可留空"`
	Database string `json:"database,omitempty" jsonschema:"description=目标数据库名称，若当前活动会话已选库可留空"`
}

type MysqlStatusInput struct {
	ServerID string `json:"server_id,omitempty" jsonschema:"description=MySQL 服务器连接 ID 或名称，若当前处于活动 MySQL 会话或只有单一连接可留空"`
}

type MysqlTablesInput struct {
	ServerID string `json:"server_id,omitempty" jsonschema:"description=MySQL 服务器连接 ID 或名称，若当前处于活动 MySQL 会话或只有单一连接可留空"`
	Database string `json:"database,omitempty" jsonschema:"description=目标数据库名称，若当前活动会话已选库可留空"`
}

type OrchestrationManagers struct {
	SkillsReg *skills.SkillsRegistry
	AskMgr *ask.AskManager
}

type PostgresDatabasesInput struct {
	ServerID string `json:"server_id,omitempty" jsonschema:"description=PostgreSQL 服务器连接 ID 或名称，若当前处于活动 PostgreSQL 会话或只有单一连接可留空"`
}

type PostgresQueryInput struct {
	ServerID string `json:"server_id,omitempty" jsonschema:"description=PostgreSQL 服务器连接 ID 或名称，若当前处于活动 PostgreSQL 会话或只有单一连接可留空"`
	Database string `json:"database,omitempty" jsonschema:"description=目标数据库名称，若未指定默认连接当前活动库、配置库或 postgres"`
	SQL string `json:"sql" jsonschema:"description=要执行的 SQL 语句 (支持 SELECT / INSERT / UPDATE / DELETE / DDL / EXPLAIN 等读写操作)"`
}

type PostgresTablesInput struct {
	ServerID string `json:"server_id,omitempty" jsonschema:"description=PostgreSQL 服务器连接 ID 或名称，若当前处于活动 PostgreSQL 会话或只有单一连接可留空"`
	Database string `json:"database,omitempty" jsonschema:"description=目标数据库名称，例如 postgres，若当前活动会话已选库可留空"`
	Schema string `json:"schema,omitempty" jsonschema:"description=目标 Schema 命名空间，默认为 public"`
}

type ReadFileInput struct {
	Path string `json:"path" jsonschema:"description=文件的相对路径（基于项目根目录），如 'src/utils/auth.ts'"`
	StartLine int `json:"start_line,omitempty" jsonschema:"description=起始行号（从 1 开始计数，可选）"`
	EndLine int `json:"end_line,omitempty" jsonschema:"description=结束行号（包含该行，可选）"`
}

type ReadFileOutput struct {
	Path string `json:"path"`
	TotalLines int `json:"total_lines"`
	StartLine int `json:"start_line"`
	EndLine int `json:"end_line"`
	Content string `json:"content"`
}

type RedisDeleteInput struct {
	ServerID string `json:"server_id,omitempty" jsonschema:"description=Redis 服务器连接 ID 或名称，若当前处于活动 Redis 会话或只有单一连接可留空"`
	Keys []string `json:"keys" jsonschema:"description=要删除的 Key 列表，支持传入单个或多个键名"`
}

type RedisExecuteRawInput struct {
	ServerID string `json:"server_id,omitempty" jsonschema:"description=Redis 服务器连接 ID 或名称，若当前处于活动 Redis 会话或只有单一连接可留空"`
	Command string `json:"command" jsonschema:"description=要执行的原生 Redis 命令字符串，例如: HSET myhash field1 val1、LPUSH mylist item1、INCR counter、SADD myset m1"`
}

type RedisExpireInput struct {
	ServerID string `json:"server_id,omitempty" jsonschema:"description=Redis 服务器连接 ID 或名称，若当前处于活动 Redis 会话或只有单一连接可留空"`
	Key string `json:"key" jsonschema:"description=要设置或修改过期时间的目标 Key 名称"`
	TTL int `json:"ttl" jsonschema:"description=新的过期时间(秒)，-1 表示取消过期时间(永久)，大于 0 为具体存活秒数"`
}

type RedisGetInput struct {
	ServerID string `json:"server_id,omitempty" jsonschema:"description=Redis 服务器连接 ID 或名称，若当前处于活动 Redis 会话或只有单一连接可留空"`
	Key string `json:"key" jsonschema:"description=要查询的目标 Key 名称"`
}

type RedisInfoInput struct {
	ServerID string `json:"server_id,omitempty" jsonschema:"description=Redis 服务器连接 ID 或名称，若当前处于活动 Redis 会话或只有单一连接可留空"`
	Section string `json:"section,omitempty" jsonschema:"description=指定查询的 Info 段，例如 server、memory、clients、stats，留空则返回全部"`
}

type RedisKeysInput struct {
	ServerID string `json:"server_id,omitempty" jsonschema:"description=Redis 服务器连接 ID 或名称，若当前处于活动 Redis 会话或只有单一连接可留空"`
	Pattern string `json:"pattern" jsonschema:"description=检索 Key 的匹配模式，例如 *、user:*，默认为 *"`
}

type RedisSetInput struct {
	ServerID string `json:"server_id,omitempty" jsonschema:"description=Redis 服务器连接 ID 或名称，若当前处于活动 Redis 会话或只有单一连接可留空"`
	Key string `json:"key" jsonschema:"description=要写入或创建的目标 Key 名称"`
	Type string `json:"type,omitempty" jsonschema:"description=数据类型，支持: string, hash, list, set, zset，默认为 string"`
	Value string `json:"value" jsonschema:"description=要写入的数据内容。String 支持普通文本或 JSON；Hash 支持 field\\nval 换行键值对；List/Set 支持换行列表；ZSet 支持 member\\nscore 换行对"`
	TTL int `json:"ttl,omitempty" jsonschema:"description=过期时间(秒)，-1 表示永久有效，大于 0 为具体存活秒数，默认 -1"`
}

type RedisSlowlogInput struct {
	ServerID string `json:"server_id,omitempty" jsonschema:"description=Redis 服务器连接 ID 或名称，若当前处于活动 Redis 会话或只有单一连接可留空"`
	Limit int `json:"limit,omitempty" jsonschema:"description=要读取的慢查询条数上限，默认 10"`
}

type RegisteredTool struct {
	Name string
	Description string
	BaseTool tool.BaseTool
	Handler ToolHandler
	Level guard.PermissionLevel
	Timeout time.Duration
}

type SSHDeleteFileInput struct {
	SessionID string `json:"session_id" jsonschema:"description=目标 SSH 会话 ID 或服务器名称，如留空则自动使用当前激活的会话"`
	Path string `json:"path" jsonschema:"description=要删除的远程文件或文件夹路径"`
}

type SSHDownloadFileInput struct {
	SessionID string `json:"session_id" jsonschema:"description=目标 SSH 会话 ID 或服务器名称，如留空则自动使用当前激活的会话"`
	RemotePath string `json:"remote_path" jsonschema:"description=要下载的远程文件路径"`
	LocalName string `json:"local_name" jsonschema:"description=保存至本地工作目录的文件名，留空则默认保持原文件名"`
}

type SSHExecCommandInput struct {
	SessionID string `json:"session_id" jsonschema:"description=目标 SSH 会话 ID 或服务器名称，如留空则自动使用当前激活的会话"`
	Command string `json:"command" jsonschema:"description=要在远程服务器上执行的 Shell 命令行"`
}

type SSHExecCommandOutput struct {
	SessionID string `json:"session_id"`
	Command string `json:"command"`
	Output string `json:"output"`
}

type SSHGetSystemInfoInput struct {
	SessionID string `json:"session_id" jsonschema:"description=要查询的目标 SSH 会话 ID 或服务器名称，如留空则自动使用当前激活的会话"`
}

type SSHListDirInput struct {
	SessionID string `json:"session_id" jsonschema:"description=目标 SSH 会话 ID 或服务器名称，如留空则自动使用当前激活的会话"`
	Path string `json:"path" jsonschema:"description=远程服务器目标目录路径，留空或 ~ 表示家目录"`
}

type SSHReadFileInput struct {
	SessionID string `json:"session_id" jsonschema:"description=目标 SSH 会话 ID 或服务器名称，如留空则自动使用当前激活的会话"`
	Path string `json:"path" jsonschema:"description=要读取的远程文件路径"`
}

type SSHUploadFileInput struct {
	SessionID string `json:"session_id" jsonschema:"description=目标 SSH 会话 ID 或服务器名称，如留空则自动使用当前激活的会话"`
	LocalPath string `json:"local_path" jsonschema:"description=本地工作目录中的文件路径（可以是相对路径）"`
	RemotePath string `json:"remote_path" jsonschema:"description=目标远程服务器保存路径"`
}

type SSHWriteFileInput struct {
	SessionID string `json:"session_id" jsonschema:"description=目标 SSH 会话 ID 或服务器名称，如留空则自动使用当前激活的会话"`
	Path string `json:"path" jsonschema:"description=要写入的远程文件路径"`
	Content string `json:"content" jsonschema:"description=要写入的文本内容"`
}

type SearchFilesInput struct {
	Query string `json:"query" jsonschema:"description=搜寻的文件名关键字或文本关键词"`
}

type SearchFilesOutput struct {
	Query string `json:"query"`
	Matches []SearchMatch `json:"matches"`
}

type SearchMatch struct {
	Path string `json:"path"`
}

type SearchResultItem struct {
	Title string `json:"title"`
	Link string `json:"link"`
	Snippet string `json:"snippet"`
}

type SqliteQueryInput struct {
	FileID string `json:"file_id,omitempty" jsonschema:"description=已打开的 SQLite 文件会话 ID 或路径，若当前处于活动 SQLite 会话或只有一个连接可留空"`
	SQL string `json:"sql" jsonschema:"description=要执行的 SQL 语句 (支持 SELECT / PRAGMA / INSERT / UPDATE / DELETE / DDL 等读写操作)"`
}

type SqliteSchemaInput struct {
	FileID string `json:"file_id,omitempty" jsonschema:"description=已打开的 SQLite 文件会话 ID 或路径，若当前处于活动 SQLite 会话或只有一个连接可留空"`
}

type SqliteTablesInput struct {
	FileID string `json:"file_id,omitempty" jsonschema:"description=已打开的 SQLite 文件会话 ID 或路径，若当前处于活动 SQLite 会话或只有一个连接可留空"`
}

type ToolBus struct {
	mu sync.RWMutex
	tools map[string]*RegisteredTool
	guard *guard.PolicyGuard
	eventBus *events.EventBus
}

// ConvertToEinoTools converts all registered tools into Eino BaseTool wrappers
// Calls: [b.mu.RLock, b.mu.RUnlock]
func (b *ToolBus) ConvertToEinoTools(sessionID string) []tool.BaseTool { ... }

// ConvertToToolInfos converts all registered tools into schema.ToolInfo for ChatModel
// Calls: [b.mu.RLock, b.mu.RUnlock, rt.BaseTool.Info, schema.NewParamsOneOfByParams]
func (b *ToolBus) ConvertToToolInfos(ctx context.Context) []*schema.ToolInfo { ... }

// Calls: [b.mu.RLock, b.mu.RUnlock]
func (b *ToolBus) Get(name string) (*RegisteredTool, bool) { ... }

// Calls: [WithCallID, WithSessionID, WithTraceID, b.Get, b.emitToolEvent, b.eventBus.Emit, b.guard.Audit, b.guard.HitlManager, cancel, context.WithTimeout, err.Error, finalRes.String, fmt.Sprintf, hitlMgr.RequestApproval, inv.InvokableRun, json.Unmarshal, res.String, runErr.Error, start.UnixNano, strings.TrimSpace, t.Handler, time.Now, time.Since, time.Since().Milliseconds]
func (b *ToolBus) Invoke(ctx context.Context, traceID string, sessionID string, toolName string, input string) *ToolResult { ... }

// Calls: [b.mu.RLock, b.mu.RUnlock]
func (b *ToolBus) List() []*RegisteredTool { ... }

// Calls: [b.mu.Lock, b.mu.Unlock]
func (b *ToolBus) Register(t *RegisteredTool) { ... }

// Calls: [b.mu.Lock, b.mu.Unlock]
func (b *ToolBus) Unregister(name string) { ... }

// Calls: [b.eventBus.Emit]
func (b *ToolBus) emitToolEvent(sessionID string, callID string, toolName string, input string, output string, durationMs int64) { ... }

type ToolResult struct {
	OK bool `json:"ok"`
	Data any `json:"data,omitempty"`
	Error string `json:"error,omitempty"`
}

// Calls: [fmt.Sprintf, json.MarshalIndent, string]
func (tr *ToolResult) String() string { ... }

type WebSearchInput struct {
	Query string `json:"query" jsonschema:"description=要在搜索引擎中检索的问题或关键词"`
}

type WebSearchOutput struct {
	Query string `json:"query"`
	Results []SearchResultItem `json:"results"`
}

type WikiListInput struct {
	Keyword string `json:"keyword,omitempty" jsonschema:"description=可选过滤关键词，搜索知识库文档标题或摘要"`
}

type WikiListOutput struct {
	Total int `json:"total"`
	Pages []wiki.WikiCatalogItem `json:"pages"`
}

type WikiReadInput struct {
	PagePath string `json:"page_path" jsonschema:"description=要读取的 Wiki 文档相对路径 (如 servers/prod-mysql.md 或 playbooks/oom.md)"`
}

type WikiReadOutput struct {
	Path string `json:"path"`
	Content string `json:"content"`
}

type WikiUpdateInput struct {
	PagePath string `json:"page_path" jsonschema:"description=已有 Wiki 文档相对路径"`
	Observations string `json:"observations,omitempty" jsonschema:"description=本次新排查发现的事实、配置变更或排障经验"`
	UpdatedContent string `json:"updated_content,omitempty" jsonschema:"description=若已准备好完整 Markdown 内容可直接传入；若留空则基于 observations 自动让大模型与已有文档进行合并提炼"`
	Summary string `json:"summary,omitempty" jsonschema:"description=更新摘要"`
}

type WikiUpdateOutput struct {
	Path string `json:"path"`
	Success bool `json:"success"`
	Message string `json:"message"`
}

type WikiWriteInput struct {
	PagePath string `json:"page_path" jsonschema:"description=文档相对路径 (如 servers/prod.md，若无后缀将自动补 .md)"`
	Content string `json:"content" jsonschema:"description=要写入的完整 Markdown 文档内容"`
	Summary string `json:"summary,omitempty" jsonschema:"description=本次创建或更新的简短说明"`
}

type WikiWriteOutput struct {
	Path string `json:"path"`
	Success bool `json:"success"`
	Message string `json:"message"`
}

type WorkspaceManager struct {
	mu sync.RWMutex
	dir string
}

// Calls: [wm.mu.RLock, wm.mu.RUnlock]
func (wm *WorkspaceManager) GetDir() string { ... }

// Calls: [filepath.Clean, filepath.IsAbs, filepath.Join, filepath.Rel, fmt.Errorf, normalizeDriveLetter, strings.HasPrefix, wm.GetDir]
func (wm *WorkspaceManager) ResolvePath(targetPath string) (string, error) { ... }

// Calls: [wm.mu.Lock, wm.mu.Unlock]
func (wm *WorkspaceManager) SetDir(dir string) { ... }

type activeConnContextKey struct {
}

type callIDCtxKey struct {
}

type guardWrappedEinoTool struct {
	bus *ToolBus
	tool *RegisteredTool
	sessionID string
}

// Calls: [schema.NewParamsOneOfByParams, w.tool.BaseTool.Info]
func (w *guardWrappedEinoTool) Info(ctx context.Context) (*schema.ToolInfo, error) { ... }

// Calls: [fmt.Sprintf, json.Marshal, string, w.bus.Invoke]
func (w *guardWrappedEinoTool) InvokableRun(ctx context.Context, input string, opts ...tool.Option) (string, error) { ... }

type sessionCtxKey struct {
}

type traceCtxKey struct {
}

```

#### Functions

```go
// Calls: [GetActiveConnection, ctx.Value]
func ActiveConnectionFromContext(ctx context.Context) *ActiveConnectionInfo { ... }

// Calls: [ctx.Value]
func CallIDFromContext(ctx context.Context) string { ... }

// DeleteApiNode 递归删除指定 ID 的节点
// Calls: [traverse]
func DeleteApiNode(nodes []ApiTreeItem, id string) ([]ApiTreeItem, bool) { ... }

// ExecuteApiManager 执行接口与分组管理操作
// Calls: [DeleteApiNode, FindNodeByIDOrName, FlattenApiList, InsertApiNode, LoadApiTreeNodes, SaveApiTreeNodes, UpdateApiNode, fmt.Errorf, fmt.Sprintf, formatBodyString, strings.ToLower, strings.ToUpper, strings.TrimSpace]
func ExecuteApiManager(ctx context.Context, input *ApiManagerInput) (*ApiManagerOutput, error) { ... }

// ExecuteHttpRequest 执行全功能 HTTP 请求核心逻辑
// Calls: [FindNodeByIDOrName, InsertApiNode, LoadApiTreeNodes, SaveApiTreeNodes, UpdateApiNode, base64.StdEncoding.EncodeToString, bytes.NewReader, client.Do, fmt.Errorf, fmt.Sprintf, formVals.Encode, formVals.Set, formatBodyString, http.DefaultTransport.(*http.Transport).Clone, http.NewRequestWithContext, http.ProxyURL, int, int64, io.LimitReader, io.ReadAll, json.Marshal, parsedURL.Query, parsedURL.String, query.Encode, query.Set, req.Header.Get, req.Header.Set, resp.Body.Close, string, strings.HasPrefix, strings.HasSuffix, strings.Join, strings.NewReader, strings.ToLower, strings.ToUpper, strings.TrimSpace, time.Duration, time.Now, time.Since, time.Since().Milliseconds, timeout.Milliseconds, transport.CloseIdleConnections, url.Parse, val.String]
func ExecuteHttpRequest(ctx context.Context, input *HttpRequestInput) (*HttpRequestOutput, error) { ... }

// FindNodeByIDOrName 深度遍历查找指定 ID 或名称的节点（若传入 name 则大小写不敏感匹配）
// Calls: [findNodeByID, findNodeByName, strings.ToLower, strings.TrimSpace]
func FindNodeByIDOrName(nodes []ApiTreeItem, query string) *ApiTreeItem { ... }

// FlattenApiList 将树状结构扁平化为便于 LLM 理解的列表摘要
// Calls: [FlattenApiList, strings.Contains, strings.ToLower, strings.TrimSpace]
func FlattenApiList(nodes []ApiTreeItem, currentPath string, keyword string) []ApiSummary { ... }

// Calls: [activeConnMu.RLock, activeConnMu.RUnlock]
func GetActiveConnection() *ActiveConnectionInfo { ... }

// GetApiPath 获取接口配置文件的存储绝对路径
// Calls: [storage.ApisPath]
func GetApiPath() (string, error) { ... }

// InsertApiNode 将新节点插入至指定父分组中，若 parentID 为空则放入根目录，并返回插入成功后的完整节点
// Calls: [strings.ReplaceAll, time.Now, time.Now().UnixMilli, traverse, uuid.New, uuid.New().String]
func InsertApiNode(nodes []ApiTreeItem, parentID string, newItem ApiTreeItem) ([]ApiTreeItem, ApiTreeItem) { ... }

// LoadApiTreeNodes 从本地 apis.json 文件中读取解析接口树
// Calls: [apiFileMu.Lock, apiFileMu.Unlock, fmt.Errorf, json.Unmarshal, os.IsNotExist, os.ReadFile, storage.ApisPath, storage.WriteFileAtomic, string, strings.TrimSpace]
func LoadApiTreeNodes() ([]ApiTreeItem, error) { ... }

func NewToolBus(g *guard.PolicyGuard, eb *events.EventBus) *ToolBus { ... }

func NewWorkspaceManager(dir string) *WorkspaceManager { ... }

// RegisterApiManagerTool 注册 api_manager 工具到 ToolBus
// Calls: [ExecuteApiManager, bus.Register, fmt.Errorf, utils.InferTool]
func RegisterApiManagerTool(bus *ToolBus) error { ... }

// Calls: [bus.Register, fmt.Errorf, fmt.Sprintf, int64, mgrs.MongoMgr.MongoAggregate, mgrs.MongoMgr.MongoFind, mgrs.MongoMgr.MongoHealthCheck, mgrs.MysqlMgr.MysqlDatabases, mgrs.MysqlMgr.MysqlProcessList, mgrs.MysqlMgr.MysqlRun, mgrs.MysqlMgr.MysqlSchema, mgrs.MysqlMgr.MysqlStatus, mgrs.MysqlMgr.MysqlTables, mgrs.PostgresMgr.PostgresDatabases, mgrs.PostgresMgr.PostgresRun, mgrs.PostgresMgr.PostgresTables, mgrs.RedisMgr.DelKeys, mgrs.RedisMgr.ExecuteRawCommand, mgrs.RedisMgr.ExpireKey, mgrs.RedisMgr.GetKey, mgrs.RedisMgr.Info, mgrs.RedisMgr.Keys, mgrs.RedisMgr.SetKey, mgrs.RedisMgr.SlowLog, mgrs.SqliteMgr.SqliteRun, mgrs.SqliteMgr.SqliteSchema, mgrs.SqliteMgr.SqliteTables, resolveMongoTarget, resolveMysqlTarget, resolvePostgresTarget, resolveRedisServerID, resolveSqliteFileID, strings.ToLower, strings.TrimSpace, utils.InferTool]
func RegisterDatabaseTools(bus *ToolBus, mgrs DatabaseManagers) error { ... }

// Calls: [CallIDFromContext, SessionIDFromContext, TraceIDFromContext, bus.Register, bus.eventBus.Emit, cli.ExecStream, executeDockerCLI, fmt.Errorf, handleDockerOrchestrate, mgr.GetClient, outBuilder.String, outBuilder.WriteString, parseDockerExecInput, resolveDockerServerID, strings.TrimSpace, utils.InferTool]
func RegisterDockerTools(bus *ToolBus, mgr *docker.DockerManager, store *core.Store) error { ... }

// RegisterHttpTools 注册全功能 http_request 工具
// Calls: [ExecuteHttpRequest, bus.Register, fmt.Errorf, utils.InferTool]
func RegisterHttpTools(bus *ToolBus) error { ... }

// Calls: [CallIDFromContext, SessionIDFromContext, TraceIDFromContext, bus.Register, bus.eventBus.Emit, cli.ExecStream, executeKubectlCLI, fmt.Errorf, handleK8sOrchestrate, mgr.GetClient, outBuilder.String, outBuilder.WriteString, parseKubectlExecInput, resolveK8sServerID, strings.TrimSpace, utils.InferTool]
func RegisterK8sTools(bus *ToolBus, mgr *k8s.K8sManager, store *core.Store) error { ... }

// Calls: [CallIDFromContext, SessionIDFromContext, TraceIDFromContext, bus.Register, bus.eventBus.Emit, errors.Is, outBuilder.String, outBuilder.WriteString, sh.ExecuteStreaming, shell.NewLocalStreamingShell, sr.Close, sr.Recv, utils.InferTool, wm.GetDir]
func RegisterLocalShellTool(bus *ToolBus, wm *WorkspaceManager) error { ... }

// Calls: [bus.Register, fmt.Errorf, fmt.Sprintf, mgr.Publish, mgr.Subscribe, utils.InferTool]
func RegisterMqttTools(bus *ToolBus, mgr *proto.MqttManager) error { ... }

// Calls: [SessionIDFromContext, bus.Register, fmt.Sprintf, mgrs.AskMgr.Ask, utils.InferTool]
func RegisterOrchestrationTools(bus *ToolBus, mgrs OrchestrationManagers) error { ... }

// Calls: [GetActiveConnection, bus.Register, filepath.Base, fmt.Errorf, fmt.Sprintf, resolveSession, sess.ExecCombined, sess.Info, sm.DownloadFileDirect, sm.Get, sm.GetDashboardStats, sm.List, sm.ListDir, sm.ReadFileContent, sm.RemoveRemotePath, sm.UploadFileDirect, sm.WriteFileContent, string, strings.Contains, strings.EqualFold, strings.ToLower, utils.InferTool, wm.ResolvePath]
func RegisterSSHTools(bus *ToolBus, sm *ssh.SessionManager, wm *WorkspaceManager) error { ... }

// Calls: [bus.Register, client.Do, fmt.Errorf, fmt.Sprintf, http.NewRequestWithContext, io.ReadAll, json.Unmarshal, req.Header.Set, resp.Body.Close, strings.TrimSpace, url.QueryEscape, utils.InferTool]
func RegisterWebSearchTool(bus *ToolBus) error { ... }

// RegisterWikiTools 注册 Wiki 知识库相关 Agent 工具
// Calls: [bus.Register, fmt.Errorf, fmt.Sprintf, modelRes.Model.Generate, r.Resolve, schema.SystemMessage, schema.UserMessage, strings.Contains, strings.HasSuffix, strings.ToLower, strings.TrimSpace, utils.InferTool, wiki.GetCatalog, wiki.ReadPage, wiki.SavePage]
func RegisterWikiTools(bus *ToolBus, r *router.ModelRouter) error { ... }

// Calls: [buildDirTree, bus.Register, fileInfo.IsDir, filepath.Dir, filepath.Rel, filepath.Walk, fmt.Errorf, fmt.Sprintf, info.IsDir, info.Name, os.IsNotExist, os.MkdirAll, os.ReadFile, os.RemoveAll, os.Rename, os.Stat, os.WriteFile, sb.String, sb.WriteString, string, strings.Contains, strings.Count, strings.HasPrefix, strings.Replace, strings.ReplaceAll, strings.Split, strings.ToLower, strings.TrimSuffix, utils.InferTool, wm.GetDir, wm.ResolvePath]
func RegisterWorkspaceTools(bus *ToolBus, wm *WorkspaceManager) error { ... }

// SaveApiTreeNodes 将接口树持久化到本地 apis.json 文件，并广播全局事件
// Calls: [apiFileMu.Lock, apiFileMu.Unlock, core.EmitEvent, fmt.Errorf, storage.ApisPath, storage.WriteJSONAtomic]
func SaveApiTreeNodes(nodes []ApiTreeItem) error { ... }

// Calls: [ctx.Value]
func SessionIDFromContext(ctx context.Context) string { ... }

// Calls: [activeConnMu.Lock, activeConnMu.Unlock]
func SetActiveConnection(info *ActiveConnectionInfo) { ... }

// Calls: [ctx.Value]
func TraceIDFromContext(ctx context.Context) string { ... }

// UpdateApiNode 递归更新指定 ID 的节点字段
// Calls: [strings.ToUpper, time.Now, time.Now().UnixMilli, traverse]
func UpdateApiNode(nodes []ApiTreeItem, id string, patch ApiTreeItem) ([]ApiTreeItem, bool) { ... }

// Calls: [context.WithValue]
func WithActiveConnection(ctx context.Context, info *ActiveConnectionInfo) context.Context { ... }

// Calls: [context.WithValue]
func WithCallID(ctx context.Context, callID string) context.Context { ... }

// Calls: [context.WithValue]
func WithSessionID(ctx context.Context, sessionID string) context.Context { ... }

// Calls: [context.WithValue]
func WithTraceID(ctx context.Context, traceID string) context.Context { ... }

// Calls: [buildDirTree, e.Name, entry.IsDir, entry.Name, filepath.Join, filtered[i].IsDir, filtered[i].Name, filtered[j].IsDir, filtered[j].Name, fmt.Sprintf, isIgnored, os.ReadDir, sb.WriteString, se.Name, sort.Slice, strings.ToLower]
func buildDirTree(dirPath string, currentDepth int, maxDepth int, customIgnores []string, prefix string, totalFiles *int, totalDirs *int, sb *strings.Builder) error { ... }

// Calls: [cli.GetContainerLogs, cli.GetOverview, cli.InspectContainer, cli.InspectImage, cli.ListComposeStacks, cli.ListContainers, cli.ListImages, cli.ListNetworks, cli.ListVolumes, cli.LoadImage, cli.PauseContainer, cli.PullImage, cli.RemoveContainer, cli.RemoveImage, cli.RestartContainer, cli.SaveImage, cli.StartContainer, cli.StopContainer, cli.UnpauseContainer, fmt.Errorf, fmt.Sprintf, formatDockerComposeTable, formatDockerContainersTable, formatDockerImagesTable, formatDockerNetworksTable, formatDockerVolumesTable, json.MarshalIndent, strconv.Atoi, string, strings.EqualFold, strings.Fields, strings.HasPrefix, strings.Join, strings.ToLower]
func executeDockerCLI(ctx context.Context, cli *docker.DockerClient, rawCmd string) (string, error) { ... }

// Calls: [cli.DeleteNamespace, cli.DeletePod, cli.GetOverview, cli.GetResourceYAML, cli.RestartDeployment, cli.ScaleDeployment, extractNamespaceFlag, fmt.Errorf, fmt.Sprintf, handleKubectlGet, handleKubectlLogs, int32, json.MarshalIndent, strconv.Atoi, string, strings.EqualFold, strings.Fields, strings.HasPrefix, strings.ToLower, strings.TrimPrefix]
func executeKubectlCLI(ctx context.Context, cli *k8s.K8sClient, rawCmd string) (string, error) { ... }

// Calls: [strings.HasPrefix, strings.TrimPrefix]
func extractNamespaceFlag(args []string, defaultNs string) string { ... }

// Calls: [findNodeByID]
func findNodeByID(nodes []ApiTreeItem, id string) *ApiTreeItem { ... }

// Calls: [findNodeByName, strings.ToLower, strings.TrimSpace]
func findNodeByName(nodes []ApiTreeItem, lowerName string) *ApiTreeItem { ... }

// Calls: [fmt.Sprintf, json.MarshalIndent, string]
func formatBodyString(body any) string { ... }

// Calls: [fmt.Sprintf, sb.String, sb.WriteString, strings.Join, strings.TrimRight]
func formatDockerComposeTable(list []docker.DockerComposeStackInfo) string { ... }

// Calls: [fmt.Sprintf, sb.String, sb.WriteString, strings.Join, strings.TrimRight]
func formatDockerContainersTable(list []docker.DockerContainerInfo) string { ... }

// Calls: [fmt.Sprintf, sb.String, sb.WriteString, strings.HasPrefix, strings.TrimRight]
func formatDockerImagesTable(list []docker.DockerImageInfo) string { ... }

// Calls: [fmt.Sprintf, sb.String, sb.WriteString, strings.TrimRight]
func formatDockerNetworksTable(list []docker.DockerNetworkInfo) string { ... }

// Calls: [fmt.Sprintf, sb.String, sb.WriteString, strings.TrimRight]
func formatDockerVolumesTable(list []docker.DockerVolumeInfo) string { ... }

// Calls: [fmt.Sprintf, sb.String, sb.WriteString, strings.TrimRight]
func formatK8sConfigMapsTable(list []k8s.K8sConfigMapInfo) string { ... }

// Calls: [fmt.Sprintf, sb.String, sb.WriteString, strings.TrimRight]
func formatK8sDeploymentsTable(list []k8s.K8sDeploymentInfo) string { ... }

// Calls: [fmt.Sprintf, sb.String, sb.WriteString, strings.TrimRight]
func formatK8sNamespacesTable(list []k8s.K8sNamespaceInfo) string { ... }

// Calls: [fmt.Sprintf, sb.String, sb.WriteString, strings.TrimRight]
func formatK8sNodesTable(list []k8s.K8sNodeInfo) string { ... }

// Calls: [fmt.Sprintf, sb.String, sb.WriteString, strings.TrimRight]
func formatK8sPVCsTable(list []k8s.K8sPVCInfo) string { ... }

// Calls: [fmt.Sprintf, sb.String, sb.WriteString, strings.TrimRight]
func formatK8sPodsTable(list []k8s.K8sPodInfo) string { ... }

// Calls: [fmt.Sprintf, sb.String, sb.WriteString, strings.TrimRight]
func formatK8sSecretsTable(list []k8s.K8sSecretInfo) string { ... }

// Calls: [fmt.Sprintf, sb.String, sb.WriteString, strings.Join, strings.TrimRight]
func formatK8sServicesTable(list []k8s.K8sServiceInfo) string { ... }

// Calls: [cancel, cli.ControlComposeStack, cli.GetComposeStack, cli.ListComposeStacks, cli.UpComposeStack, context.WithTimeout, fmt.Errorf, fmt.Sprintf, inferDockerComposeProjectName, mgr.GetClient, resolveDockerServerID, sanitizeDockerProjectName, sb.String, sb.WriteString, store.DeleteComposeRecord, store.GetComposeRecord, store.ListComposeRecords, store.SaveComposeRecord, strings.EqualFold, strings.ToLower, strings.TrimSpace, uuid.New, uuid.New().String]
func handleDockerOrchestrate(ctx context.Context, mgr *docker.DockerManager, store *core.Store, input *DockerOrchestrateInput) (string, error) { ... }

// Calls: [GetActiveConnection, cancel, cli.ApplyYAML, cli.DeleteYAML, context.WithTimeout, fmt.Errorf, fmt.Sprintf, k8s.ParseYAMLResourceSummaries, mgr.GetClient, resolveK8sServerID, sb.String, sb.WriteString, store.GetK8sOrchestrationRecord, store.ListK8sOrchestrationRecords, store.SaveK8sOrchestrationRecord, strings.Join, strings.ToLower, strings.ToUpper, strings.TrimSpace, time.Now, time.Now().Unix]
func handleK8sOrchestrate(ctx context.Context, mgr *k8s.K8sManager, store *core.Store, input *K8sOrchestrateInput) (string, error) { ... }

// Calls: [cli.ListConfigMaps, cli.ListDeployments, cli.ListNamespaces, cli.ListNodes, cli.ListPVCs, cli.ListPods, cli.ListSecrets, cli.ListServices, extractNamespaceFlag, fmt.Errorf, formatK8sConfigMapsTable, formatK8sDeploymentsTable, formatK8sNamespacesTable, formatK8sNodesTable, formatK8sPVCsTable, formatK8sPodsTable, formatK8sSecretsTable, formatK8sServicesTable, strings.ToLower]
func handleKubectlGet(ctx context.Context, cli *k8s.K8sClient, args []string) (string, error) { ... }

// Calls: [cli.GetPodLogs, fmt.Errorf, strconv.Atoi, strings.HasPrefix]
func handleKubectlLogs(ctx context.Context, cli *k8s.K8sClient, args []string) (string, error) { ... }

// Calls: [sanitizeDockerProjectName, strings.TrimSpace, yaml.Unmarshal]
func inferDockerComposeProjectName(yamlContent string, fallback string) string { ... }

// Calls: [filepath.Match, strings.TrimSpace]
func isIgnored(name string, customIgnores []string) bool { ... }

// Calls: [strings.ToUpper]
func normalizeDriveLetter(p string) string { ... }

// Calls: [fmt.Errorf, strings.EqualFold, strings.Fields, strings.HasPrefix, strings.Join, strings.ToLower, strings.TrimSpace]
func parseDockerExecInput(input *DockerExecInput) (string, []string, string, string, error) { ... }

// Calls: [fmt.Errorf, strings.EqualFold, strings.Fields, strings.HasPrefix, strings.Join, strings.ToLower, strings.TrimSpace]
func parseKubectlExecInput(input *K8sExecInput) (string, string, string, []string, error) { ... }

// Calls: [GetActiveConnection, fmt.Errorf, mgr.ResolveID, strings.TrimSpace]
func resolveDockerServerID(mgr *docker.DockerManager, serverID string) (string, error) { ... }

// Calls: [GetActiveConnection, fmt.Errorf, mgr.ResolveID, strings.TrimSpace]
func resolveK8sServerID(mgr *k8s.K8sManager, serverID string) (string, error) { ... }

// Calls: [GetActiveConnection, fmt.Errorf, mgr.ResolveID, strings.TrimSpace]
func resolveMongoTarget(mgr *mongo.MongoManager, serverID string, dbName string) (string, string, error) { ... }

// Calls: [GetActiveConnection, fmt.Errorf, mgr.ResolveID, strings.TrimSpace]
func resolveMysqlTarget(mgr *db.MysqlManagerEx, serverID string, dbName string) (string, string, error) { ... }

// Calls: [GetActiveConnection, fmt.Errorf, mgr.ResolveID, strings.TrimSpace]
func resolvePostgresTarget(mgr *db.PostgresManager, serverID string, dbName string) (string, string, error) { ... }

// Calls: [GetActiveConnection, fmt.Errorf, mgr.ResolveID, strings.TrimSpace]
func resolveRedisServerID(mgr *redis.RedisManager, serverID string) (string, error) { ... }

// Calls: [GetActiveConnection, fmt.Errorf, mgr.ResolveID, strings.TrimSpace]
func resolveSqliteFileID(mgr *db.SqliteManager, fileID string) (string, error) { ... }

// Calls: [sb.String, sb.WriteRune, strings.ToLower, strings.TrimSpace]
func sanitizeDockerProjectName(name string) string { ... }

```

---

### Package `verifier` (`agent/verifier`)

- **Imports (8):** `context`, `encoding/json`, `fmt`, `github.com/cloudwego/eino/schema`, `strings`, `sync`, `terminal/agent/router`, `time`

#### Constants & Variables

```go
const VerdictPass VerdictStatus = "pass"
const VerdictFail VerdictStatus = "fail"
const VerdictPartial VerdictStatus = "partial"
```

#### Structs & Methods

```go
type Verdict struct {
	// pass | fail | partial
	Status VerdictStatus `json:"status"`
	Reason string `json:"reason,omitempty"`
	FixSuggestion string `json:"fix_suggestion,omitempty"`
	// 0~1
	Confidence float64 `json:"confidence,omitempty"`
	// transient | permanent | fatal
	Class string `json:"class,omitempty"`
}

type Verifier struct {
	mu sync.RWMutex
	router *router.ModelRouter
	enabled bool
}

// Calls: [v.mu.RLock, v.mu.RUnlock]
func (v *Verifier) IsEnabled() bool { ... }

// Calls: [v.mu.Lock, v.mu.Unlock]
func (v *Verifier) SetEnabled(enabled bool) { ... }

// Calls: [cancel, context.WithTimeout, fmt.Sprintf, r.Resolve, strings.TrimSpace, v.modelVerify, v.mu.RLock, v.mu.RUnlock, v.ruleVerify]
func (v *Verifier) Verify(ctx context.Context, expectedOut string, actualOut any, execErr string) Verdict { ... }

// Calls: [fmt.Errorf, fmt.Sprintf, json.Unmarshal, modelRes.Model.Generate, schema.SystemMessage, schema.UserMessage, strings.TrimPrefix, strings.TrimSpace, strings.TrimSuffix]
func (v *Verifier) modelVerify(ctx context.Context, modelRes *router.ResolvedModel, expectedOut string, actualOut string) (Verdict, error) { ... }

// Calls: [fmt.Sprintf, strings.Contains, strings.ToLower]
func (v *Verifier) ruleVerify(expectedOut string, actualOut any, execErr string) Verdict { ... }

```

#### Functions

```go
func NewVerifier(r *router.ModelRouter) *Verifier { ... }

```

---

### Package `wiki` (`agent/wiki`)

- **Imports (15):** `bufio`, `context`, `encoding/json`, `fmt`, `github.com/cloudwego/eino/schema`, `os`, `os/exec`, `path/filepath`, `runtime`, `sort`, `strings`, `sync`, `terminal/agent/router`, `terminal/core`, `terminal/storage`

#### Constants & Variables

```go
var wikiMu sync.RWMutex
```

#### Structs & Methods

```go
// WikiCatalogItem 紧凑目录清单项，用于 System Prompt 注入与极速索引
type WikiCatalogItem struct {
	RelPath string `json:"rel_path"`
	Title string `json:"title"`
	Summary string `json:"summary"`
	UpdatedAt int64 `json:"updated_at"`
}

// WikiNode 树状导航节点定义 (与通用树组件对齐)
type WikiNode struct {
	ID string `json:"id"`
	Name string `json:"name"`
	RelPath string `json:"rel_path"`
	IsFolder bool `json:"is_folder"`
	Size int64 `json:"size,omitempty"`
	UpdatedAt int64 `json:"updated_at"`
	Children []WikiNode `json:"children,omitempty"`
}

```

#### Functions

```go
// CompileSession 提炼会话中的关键资产，并自动合并/新建到 Wiki
// Calls: [GetCatalog, SavePage, fmt.Errorf, fmt.Sprintf, json.MarshalIndent, json.Unmarshal, r.Resolve, res.Model.Generate, schema.SystemMessage, schema.UserMessage, string, strings.HasSuffix, strings.ToLower, strings.TrimPrefix, strings.TrimSpace, strings.TrimSuffix]
func CompileSession(ctx context.Context, r *router.ModelRouter, sessionID string, convText string) (string, error) { ... }

// CreateNode 创建新文档或新目录
// Calls: [core.EmitEvent, filepath.Dir, filepath.Join, filepath.ToSlash, fmt.Errorf, fmt.Sprintf, os.MkdirAll, os.Stat, resolveSafePath, storage.WriteFileAtomic, strings.ContainsAny, strings.HasSuffix, strings.ToLower, strings.TrimSpace, strings.TrimSuffix, wikiMu.Lock, wikiMu.Unlock]
func CreateNode(parentPath string, name string, isFolder bool) (string, error) { ... }

// DeleteNode 删除文档或目录
// Calls: [core.EmitEvent, fmt.Errorf, os.RemoveAll, resolveSafePath, wikiMu.Lock, wikiMu.Unlock]
func DeleteNode(relPath string) error { ... }

// GetCatalog 提取紧凑的 Wiki 目录与摘要列表，供 LLM 上下文感知
// Calls: [GetWikiDir, bufio.NewScanner, d.Info, d.IsDir, d.Name, file.Close, filepath.Ext, filepath.Rel, filepath.ToSlash, filepath.WalkDir, info.ModTime, info.ModTime().UnixMilli, os.Open, scanner.Scan, scanner.Text, sort.Slice, strings.HasPrefix, strings.HasSuffix, strings.ToLower, strings.TrimLeft, strings.TrimSpace, strings.TrimSuffix, summaryBuilder.Len, summaryBuilder.String, summaryBuilder.WriteString, wikiMu.RLock, wikiMu.RUnlock]
func GetCatalog() ([]WikiCatalogItem, error) { ... }

// GetWikiDir 获取本地 Wiki 知识库根目录路径
// Calls: [filepath.Join, fmt.Errorf, os.MkdirAll, os.ReadDir, storage.WikiDir, storage.WriteFileAtomic]
func GetWikiDir() (string, error) { ... }

// ListTree 递归列出 Wiki 文档树
// Calls: [GetWikiDir, entry.Info, entry.IsDir, entry.Name, filepath.Join, info.ModTime, info.ModTime().UnixMilli, info.Size, os.ReadDir, sort.Slice, strings.HasPrefix, strings.HasSuffix, strings.ToLower, walk, wikiMu.RLock, wikiMu.RUnlock]
func ListTree() ([]WikiNode, error) { ... }

// OpenWikiDir 在操作系统文件管理器中打开 Wiki 本地目录
// Calls: [GetWikiDir, cmd.Start, exec.Command]
func OpenWikiDir() error { ... }

// ReadPage 读取指定 Markdown 页面完整内容
// Calls: [fmt.Errorf, os.ReadFile, resolveSafePath, string, wikiMu.RLock, wikiMu.RUnlock]
func ReadPage(relPath string) (string, error) { ... }

// RenameNode 重命名或移动文档/目录
// Calls: [core.EmitEvent, filepath.Dir, fmt.Errorf, os.MkdirAll, os.Rename, os.Stat, resolveSafePath, wikiMu.Lock, wikiMu.Unlock]
func RenameNode(oldRelPath string, newRelPath string) error { ... }

// SavePage 保存或覆写指定 Markdown 页面
// Calls: [core.EmitEvent, filepath.Dir, fmt.Errorf, os.MkdirAll, resolveSafePath, storage.WriteFileAtomic, wikiMu.Lock, wikiMu.Unlock]
func SavePage(relPath string, content string) error { ... }

// resolveSafePath 路径安全校验，防止路径穿越
// Calls: [GetWikiDir, filepath.Clean, filepath.Join, filepath.ToSlash, fmt.Errorf, strings.Contains, strings.HasPrefix, strings.TrimPrefix, strings.TrimSpace]
func resolveSafePath(relPath string) (string, string, error) { ... }

```

---

### Package `main` (`build/android`)

- **Imports (1):** `github.com/wailsapp/wails/v3/pkg/application`

#### Functions

```go
// Calls: [application.RegisterAndroidMain]
func init() { ... }

```

---

### Package `main` (`build/android/scripts/deps`)

- **Imports (8):** `bufio`, `fmt`, `os`, `os/exec`, `path/filepath`, `runtime`, `strconv`, `strings`

#### Functions

```go
// Calls: [cmd.Run, exec.Command]
func checkCommand(name string, args ...string) bool { ... }

// findAVDManager returns the avdmanager path from PATH, or from the SDK's
// cmdline-tools (preferring the newest version), or "" if not found.
// Calls: [exec.LookPath, filepath.Base, filepath.Dir, filepath.Glob, filepath.Join, strconv.ParseFloat]
func findAVDManager(androidHome string) string { ... }

// Calls: [checkCommand, cmd.Output, entry.IsDir, entry.Name, exec.Command, filepath.Join, fmt.Printf, fmt.Println, fmt.Sprintf, offerCreateAVD, os.Exit, os.Getenv, os.ReadDir, os.Stat, os.UserHomeDir, string, strings.Split, strings.TrimSpace]
func main() { ... }

// offerCreateAVD mirrors the iOS installer's simulator offer: when no AVD
// exists, offer to create one — but ONLY from a system image that is already
// installed. We never run sdkmanager here (a multi-GB download with a license
// prompt is a surprise the user should trigger themselves).
// Calls: [cmd.Run, exec.Command, filepath.Base, filepath.Dir, filepath.Glob, filepath.Join, findAVDManager, fmt.Printf, fmt.Println, promptUser, strconv.Atoi, string, strings.NewReader, strings.ReplaceAll, strings.TrimPrefix]
func offerCreateAVD(androidHome string) { ... }

// Calls: [bufio.NewReader, fmt.Printf, os.Getenv, reader.ReadString, strings.ToLower, strings.TrimSpace]
func promptUser(question string) bool { ... }

```

---

### Package `main` (`build/ios`)

- **Imports (2):** `C`, `github.com/wailsapp/wails/v3/pkg/application`

#### Functions

```go
// WailsIOSMain runs the user's main() (application.New / app.Run). It is invoked
// by the WailsAppDelegate from didFinishLaunchingWithOptions — i.e. only AFTER
// UIKit has launched — on a BACKGROUND thread, so the Go runtime never starts
// concurrently with UIApplicationMain (that race intermittently corrupts the
// FrontBoard launch handshake on a physical device → blank cold launch /
// scene-create watchdog 0x8BADF00D). Keeping all app setup off the OS main
// thread also leaves UIApplicationMain unobstructed on the main thread.
// Calls: [main]
func WailsIOSMain() { ... }

// modifyOptionsForIOS is a no-op on non-iOS platforms
func modifyOptionsForIOS(opts *application.Options) { ... }

// modifyOptionsForIOS adjusts the application options for iOS
func modifyOptionsForIOS(opts *application.Options) { ... }

```

---

### Package `main` (`build/ios/scripts/deps`)

- **Imports (5):** `bufio`, `fmt`, `os`, `os/exec`, `strings`

#### Structs & Methods

```go
type Dependency struct {
	Name string
	// Returns (success, details)
	CheckFunc func() (bool, string)
	Required bool
	InstallCmd []string
	InstallMsg string
	SuccessMsg string
	FailureMsg string
}

```

#### Functions

```go
// Calls: [cmd.Run, exec.Command]
func checkCommand(args []string) bool { ... }

// Calls: [checkCommand, cmd.Output, cmd.Run, dep.CheckFunc, exec.Command, exec.Command().Output, fmt.Printf, fmt.Println, fmt.Sprintf, os.Exit, os.Stat, promptUser, string, strings.Contains, strings.Fields, strings.HasPrefix, strings.HasSuffix, strings.Join, strings.Repeat, strings.Split, strings.Trim, strings.TrimSpace, versionCmd.Output]
func main() { ... }

// Calls: [bufio.NewReader, fmt.Printf, os.Getenv, reader.ReadString, strings.ToLower, strings.TrimSpace]
func promptUser(question string) bool { ... }

```

---

### Package `core` (`core`)

- **Imports (22):** `crypto/aes`, `crypto/cipher`, `crypto/rand`, `encoding/base64`, `encoding/json`, `errors`, `fmt`, `github.com/google/uuid`, `github.com/wailsapp/wails/v3/pkg/application`, `io`, `net/http`, `os`, `os/exec`, `path/filepath`, `runtime`, `sort`, `strconv`, `strings`, `sync`, `sync/atomic`, `terminal/storage`, `time`

#### Constants & Variables

```go
const appDirName = "xTerminal"
const encPrefix = "enc:v1:"
// ConnSSH 远程 Linux 服务器（Shell + SFTP）。
const ConnSSH ConnType = "ssh"
// ConnRedis Redis 实例，使用内置 Redis 客户端管理。
const ConnRedis ConnType = "redis"
// ConnMysql MySQL 实例，使用内置 MySQL 客户端管理。
const ConnMysql ConnType = "mysql"
// ConnMqtt MQTT 代理，使用内置 MQTT 客户端管理。
const ConnMqtt ConnType = "mqtt"
// ConnMongo MongoDB 实例，使用内置 MongoDB 客户端管理。
const ConnMongo ConnType = "mongo"
// ConnSqlite 本地 SQLite 数据库文件，使用内置 SQLite 客户端管理。
const ConnSqlite ConnType = "sqlite"
// ConnPostgres PostgreSQL 实例，使用内置 PostgreSQL 客户端管理。
const ConnPostgres ConnType = "postgres"
// ConnDocker 独立 Docker 实例，支持 Unix Socket / TCP / SSH 访问。
const ConnDocker ConnType = "docker"
// ConnK8s Kubernetes 集群，支持直连 API Server 与 SSH 隧道。
const ConnK8s ConnType = "k8s"
const authTypePassword = "password"
const authTypeKey = "key"
var isAppQuitting atomic.Bool
// Injected via ldflags during build:
// -ldflags "-X 'terminal/core.Version=v1.0.13' -X 'terminal/core.GitCommit=dev' -X 'terminal/core.BuildDate=2026-10-18'"
var Version
// Injected via ldflags during build:
// -ldflags "-X 'terminal/core.Version=v1.0.13' -X 'terminal/core.GitCommit=dev' -X 'terminal/core.BuildDate=2026-10-18'"
var GitCommit
// Injected via ldflags during build:
// -ldflags "-X 'terminal/core.Version=v1.0.13' -X 'terminal/core.GitCommit=dev' -X 'terminal/core.BuildDate=2026-10-18'"
var BuildDate
```

#### Structs & Methods

```go
type AiModelItem struct {
	ID string `json:"id"`
	Name string `json:"name"`
	Model string `json:"model"`
	BaseURL string `json:"baseUrl"`
	APIKey string `json:"apiKey"`
	ContextTokens int `json:"contextTokens"`
	Temperature float64 `json:"temperature"`
	EnableMultimodal bool `json:"enableMultimodal"`
}

type AppSettings struct {
	ThemeMode string `json:"themeMode"`
	FontFamily string `json:"fontFamily"`
	FontSize string `json:"fontSize"`
	AutoConnect bool `json:"autoConnect"`
	DbDefaultLimit string `json:"dbDefaultLimit"`
	GlobalFontFamily string `json:"globalFontFamily"`
	AiBaseURL string `json:"aiBaseUrl"`
	AiAPIKey string `json:"aiApiKey"`
	AiModel string `json:"aiModel"`
	AiModels []AiModelItem `json:"aiModels"`
	ActiveModelID string `json:"activeModelId"`
	AiTemperature float64 `json:"aiTemperature"`
	// 模型上下文窗口总长度 (如 131072 / 128k, 65536 / 64k)
	AiModelContextTokens int `json:"aiModelContextTokens"`
	// 压缩触发百分比 (例如 80 即 80%)
	AiContextCompressRatio int `json:"aiContextCompressRatio"`
	// 实际触发 Token 数
	AiMaxContextTokens int `json:"aiMaxContextTokens"`
	// "none" | "summary" | "sliding"
	AiCompressionStrategy string `json:"aiCompressionStrategy"`
	AiEnableMultimodal bool `json:"aiEnableMultimodal"`
	AiSystemPrompt string `json:"aiSystemPrompt"`
	AiWorkspaceDir string `json:"aiWorkspaceDir"`
	AiEnableWebSearch bool `json:"aiEnableWebSearch"`
	AiEnablePermissionGuard bool `json:"aiEnablePermissionGuard"`
	AiBlockHighRiskCommands bool `json:"aiBlockHighRiskCommands"`
	AiEnableThinking bool `json:"aiEnableThinking"`
	// "low" | "medium" | "high"
	AiReasoningEffort string `json:"aiReasoningEffort"`
	AiEnableVerifier bool `json:"aiEnableVerifier"`
	AiMaxParallel int `json:"aiMaxParallel"`
	McpServerEnabled bool `json:"mcpServerEnabled"`
	McpServerPort int `json:"mcpServerPort"`
	McpServerHost string `json:"mcpServerHost"`
	// "ask" | "minimize" | "quit"
	CloseAction string `json:"closeAction"`
}

type AppVersionInfo struct {
	Version string `json:"version"`
	GitCommit string `json:"gitCommit"`
	BuildDate string `json:"buildDate"`
	GoVersion string `json:"goVersion"`
	Platform string `json:"platform"`
}

// ComposeStore 管理 composes.json 的本地持久化。
type ComposeStore struct {
	mu sync.RWMutex
	file string
	list []DockerComposeRecord
}

// DeleteRecord 删除一条 Compose 记录。
// Calls: [cs.mu.Lock, cs.mu.Unlock, cs.save]
func (cs *ComposeStore) DeleteRecord(id string) error { ... }

// GetRecord 获取单个 Compose 记录。
// Calls: [cs.mu.RLock, cs.mu.RUnlock, errors.New]
func (cs *ComposeStore) GetRecord(id string) (*DockerComposeRecord, error) { ... }

// ListRecords 获取指定 serverId 的 Compose 记录（若 serverId 为空则返回全部）。
// Calls: [cs.mu.RLock, cs.mu.RUnlock, sort.Slice]
func (cs *ComposeStore) ListRecords(serverId string) []DockerComposeRecord { ... }

// SaveRecord 保存或更新一个 Compose 记录。若 ID 为空或不存在则新增，否则更新已有记录。
// Calls: [cs.mu.Lock, cs.mu.Unlock, cs.save, fmt.Errorf, time.Now, time.Now().Format, uuid.New, uuid.New().String]
func (cs *ComposeStore) SaveRecord(r DockerComposeRecord) (*DockerComposeRecord, error) { ... }

// Calls: [cs.mu.Lock, cs.mu.Unlock, json.Unmarshal, os.IsNotExist, os.ReadFile]
func (cs *ComposeStore) load() error { ... }

// Calls: [storage.WriteJSONAtomic]
func (cs *ComposeStore) save() error { ... }

// ConcurrentMap 是一个强类型、线程安全的泛型字典容器，避免无类型 sync.Map 带来的堆装箱与运行时动态类型断言。
type ConcurrentMap struct {
	mu sync.RWMutex
	m map[K]V
}

// DockerComposeRecord 描述在客户端本地保存的一个 Compose 配置文件记录。
type DockerComposeRecord struct {
	// 唯一主键 UUID
	ID string `json:"id"`
	// 所属 Docker 实例 ID
	ServerID string `json:"serverId"`
	// Docker 项目名 (标准化小写)
	ProjectName string `json:"projectName"`
	// 完整的 YAML 编排内容
	YamlContent string `json:"yamlContent"`
	// 环境变量键值对
	EnvVars map[string]string `json:"envVars"`
	// 创建时间
	CreatedAt string `json:"createdAt"`
	// 最近更新/部署时间
	UpdatedAt string `json:"updatedAt"`
}

// K8sOrchestrationRecord 描述在客户端本地保存的一个 Kubernetes YAML 资源编排记录。
type K8sOrchestrationRecord struct {
	// 唯一主键 UUID
	ID string `json:"id"`
	// 所属 K8s 集群 ID
	ServerID string `json:"serverId"`
	// 编排名称 (如: nginx-ingress, redis-ha)
	Name string `json:"name"`
	// 默认命名空间
	Namespace string `json:"namespace"`
	// 完整的 YAML 编排内容
	YamlContent string `json:"yamlContent"`
	// 状态: "deployed" (已部署) | "not_deployed" (未部署/已下线)
	Status string `json:"status"`
	// 解析出的资源列表
	Resources []K8sResourceItemSummary `json:"resources"`
	// 统计摘要，如 "Deployment (1), Service (1)"
	ResourcesSummary string `json:"resourcesSummary"`
	// 创建时间
	CreatedAt string `json:"createdAt"`
	// 最近更新/部署时间
	UpdatedAt string `json:"updatedAt"`
}

// K8sOrchestrationStore 管理 k8s_orchestrations.json 的本地持久化。
type K8sOrchestrationStore struct {
	mu sync.RWMutex
	file string
	list []K8sOrchestrationRecord
}

// DeleteRecord 删除一条编排记录。
// Calls: [ks.mu.Lock, ks.mu.Unlock, ks.save]
func (ks *K8sOrchestrationStore) DeleteRecord(id string) error { ... }

// GetRecord 获取单个编排记录。
// Calls: [errors.New, ks.mu.RLock, ks.mu.RUnlock]
func (ks *K8sOrchestrationStore) GetRecord(id string) (*K8sOrchestrationRecord, error) { ... }

// ListRecords 获取指定 serverId 的编排记录（若 serverId 为空则返回全部）。
// Calls: [ks.mu.RLock, ks.mu.RUnlock, sort.Slice]
func (ks *K8sOrchestrationStore) ListRecords(serverId string) []K8sOrchestrationRecord { ... }

// SaveRecord 保存或更新一条编排记录。若 ID 为空或不存在则新增，否则更新已有记录。
// Calls: [fmt.Errorf, ks.mu.Lock, ks.mu.Unlock, ks.save, time.Now, time.Now().Format, uuid.New, uuid.New().String]
func (ks *K8sOrchestrationStore) SaveRecord(r K8sOrchestrationRecord) (*K8sOrchestrationRecord, error) { ... }

// Calls: [json.Unmarshal, ks.mu.Lock, ks.mu.Unlock, os.IsNotExist, os.ReadFile]
func (ks *K8sOrchestrationStore) load() error { ... }

// Calls: [storage.WriteJSONAtomic]
func (ks *K8sOrchestrationStore) save() error { ... }

// K8sResourceItemSummary 记录编排中单个资源的基本元信息。
type K8sResourceItemSummary struct {
	// 例如: Deployment, Service, ConfigMap, Pod
	Kind string `json:"kind"`
	// metadata.name
	Name string `json:"name"`
	// metadata.namespace
	Namespace string `json:"namespace"`
}

// ServerConfig 描述一台远程服务器的连接信息。Type 字段区分 SSH / Redis / MySQL / Docker / Postgres。
type ServerConfig struct {
	ID string `json:"id"`
	Name string `json:"name"`
	// 所属分组 ID，空表示未分组
	GroupID string `json:"groupId,omitempty"`
	Host string `json:"host"`
	Port int `json:"port"`
	Username string `json:"username"`
	// password | key (SSH 专用)
	AuthType string `json:"authType"`
	Password string `json:"password"`
	// 私钥文件路径或 PEM 内容
	PrivateKey string `json:"privateKey"`
	Passphrase string `json:"passphrase"`
	Remark string `json:"remark"`
	// ssh | redis | mysql | mqtt | mongo | sqlite | docker | postgres
	Type string `json:"type"`
	// Redis 数据库编号
	DB int `json:"db,omitempty"`
	// Redis 高级配置
	RedisMode string `json:"redisMode,omitempty"`
	// 哨兵地址，逗号分隔
	RedisSentinels string `json:"redisSentinels,omitempty"`
	// 哨兵 master 名称
	RedisMasterName string `json:"redisMasterName,omitempty"`
	// 集群节点，逗号分隔
	RedisClusterNodes string `json:"redisClusterNodes,omitempty"`
	// Redis 6 ACL 用户名
	RedisUsername string `json:"redisUsername,omitempty"`
	// none | json
	RedisSerialization string `json:"redisSerialization,omitempty"`
	// 最大连接数
	RedisPoolSize int `json:"redisPoolSize,omitempty"`
	// 最小空闲连接
	RedisMinIdleConns int `json:"redisMinIdleConns,omitempty"`
	// 最大空闲连接
	RedisMaxIdleConns int `json:"redisMaxIdleConns,omitempty"`
	// 获取连接超时（秒）
	RedisPoolTimeout int `json:"redisPoolTimeout,omitempty"`
	// 连接最大空闲时间（秒）
	RedisConnMaxIdleTime int `json:"redisConnMaxIdleTime,omitempty"`
	// 连接最大存活时间（秒）
	RedisConnMaxLifetime int `json:"redisConnMaxLifetime,omitempty"`
	// 拨号超时（秒）
	RedisDialTimeout int `json:"redisDialTimeout,omitempty"`
	// 读超时（秒）
	RedisReadTimeout int `json:"redisReadTimeout,omitempty"`
	// 写超时（秒）
	RedisWriteTimeout int `json:"redisWriteTimeout,omitempty"`
	// 命令最大重试次数
	RedisMaxRetries int `json:"redisMaxRetries,omitempty"`
	// 重试最小退避（秒）
	RedisMinRetryBackoff int `json:"redisMinRetryBackoff,omitempty"`
	// 重试最大退避（秒）
	RedisMaxRetryBackoff int `json:"redisMaxRetryBackoff,omitempty"`
	// 熔断器打开阈值（连续失败次数）
	RedisBreakerThreshold int `json:"redisBreakerThreshold,omitempty"`
	// 熔断器冷却时间（秒）
	RedisBreakerCooldown int `json:"redisBreakerCooldown,omitempty"`
	// MySQL 高级配置
	Database string `json:"database,omitempty"`
	// 连接池最大打开连接
	MysqlMaxOpenConns int `json:"mysqlMaxOpenConns,omitempty"`
	// 连接池最大空闲连接
	MysqlMaxIdleConns int `json:"mysqlMaxIdleConns,omitempty"`
	// 连接最大存活（秒）
	MysqlConnMaxLifetime int `json:"mysqlConnMaxLifetime,omitempty"`
	// 空 / "true" / "skip-verify" / "preferred"
	MysqlTLS string `json:"mysqlTLS,omitempty"`
	// 是否启用 SSL
	MysqlSSLEnabled bool `json:"mysqlSSLEnabled,omitempty"`
	// 是否启用 SSH 隧道
	MysqlSSHEnabled bool `json:"mysqlSSHEnabled,omitempty"`
	// 跳板机地址
	MysqlSSHHost string `json:"mysqlSSHHost,omitempty"`
	// 跳板机端口
	MysqlSSHHostPort int `json:"mysqlSSHHostPort,omitempty"`
	// 跳板机用户名
	MysqlSSHUser string `json:"mysqlSSHUser,omitempty"`
	// 跳板机私钥路径
	MysqlSSHKeyPath string `json:"mysqlSSHKeyPath,omitempty"`
	// 跳板机私钥内容
	MysqlSSHKeyData string `json:"mysqlSSHKeyData,omitempty"`
	// 私钥口令
	MysqlSSHPassphrase string `json:"mysqlSSHPassphrase,omitempty"`
	// 本地监听端口（0=自动）
	MysqlSSHProxyLocalPort int `json:"mysqlSSHProxyLocalPort,omitempty"`
	// PostgreSQL 高级配置
	PostgresDatabase string `json:"postgresDatabase,omitempty"`
	// 默认 Schema（默认 public）
	PostgresSchema string `json:"postgresSchema,omitempty"`
	// disable | require | verify-ca | verify-full
	PostgresSSLMode string `json:"postgresSSLMode,omitempty"`
	// 连接池最大连接数
	PostgresMaxOpenConns int `json:"postgresMaxOpenConns,omitempty"`
	// 最小空闲连接数
	PostgresMinIdleConns int `json:"postgresMinIdleConns,omitempty"`
	// 连接最大存活（秒）
	PostgresConnMaxLifetime int `json:"postgresConnMaxLifetime,omitempty"`
	// 连接最大空闲（秒）
	PostgresConnMaxIdleTime int `json:"postgresConnMaxIdleTime,omitempty"`
	// 连接超时（秒）
	PostgresConnectTimeout int `json:"postgresConnectTimeout,omitempty"`
	// 是否启用 SSH 隧道
	PostgresSSHEnabled bool `json:"postgresSSHEnabled,omitempty"`
	// 跳板机地址
	PostgresSSHHost string `json:"postgresSSHHost,omitempty"`
	// 跳板机端口
	PostgresSSHHostPort int `json:"postgresSSHHostPort,omitempty"`
	// 跳板机用户名
	PostgresSSHUser string `json:"postgresSSHUser,omitempty"`
	// password | key
	PostgresSSHAuthType string `json:"postgresSSHAuthType,omitempty"`
	// 跳板机密码
	PostgresSSHPassword string `json:"postgresSSHPassword,omitempty"`
	// 跳板机私钥路径
	PostgresSSHKeyPath string `json:"postgresSSHKeyPath,omitempty"`
	// 跳板机私钥内容
	PostgresSSHKeyData string `json:"postgresSSHKeyData,omitempty"`
	// 私钥口令
	PostgresSSHPassphrase string `json:"postgresSSHPassphrase,omitempty"`
	// MongoDB 高级配置
	MongoURI string `json:"mongoUri,omitempty"`
	// 使用 mongodb+srv:// 方案
	MongoSRV bool `json:"mongoSrv,omitempty"`
	// 多节点种子列表，逗号分隔 host:port
	MongoHosts string `json:"mongoHosts,omitempty"`
	// 默认数据库
	MongoDatabase string `json:"mongoDatabase,omitempty"`
	// none | SCRAM-SHA-1 | SCRAM-SHA-256 | MONGODB-X509
	MongoAuthMech string `json:"mongoAuthMech,omitempty"`
	// 认证库，默认 admin
	MongoAuthSource string `json:"mongoAuthSource,omitempty"`
	// 副本集名称
	MongoReplicaSet string `json:"mongoReplicaSet,omitempty"`
	// primary | secondary | nearest 等
	MongoReadPreference string `json:"mongoReadPreference,omitempty"`
	// 启用 TLS/SSL
	MongoTLSEnabled bool `json:"mongoTlsEnabled,omitempty"`
	// 跳过证书校验
	MongoTLSInsecure bool `json:"mongoTlsInsecure,omitempty"`
	// CA 证书（PEM 内容或路径）
	MongoTLSCACert string `json:"mongoTlsCaCert,omitempty"`
	// 客户端证书（X.509 认证用）
	MongoTLSClientCert string `json:"mongoTlsClientCert,omitempty"`
	// 客户端私钥
	MongoTLSClientKey string `json:"mongoTlsClientKey,omitempty"`
	// 连接池最大连接数
	MongoMaxPoolSize int `json:"mongoMaxPoolSize,omitempty"`
	// 连接池最小连接数
	MongoMinPoolSize int `json:"mongoMinPoolSize,omitempty"`
	// 连接最大空闲时间（秒）
	MongoMaxConnIdleTime int `json:"mongoMaxConnIdleTime,omitempty"`
	// 连接超时（秒）
	MongoConnectTimeout int `json:"mongoConnectTimeout,omitempty"`
	// 服务器选择超时（秒）
	MongoServerSelectTimeout int `json:"mongoServerSelectTimeout,omitempty"`
	// 单次操作超时（秒）
	MongoSocketTimeout int `json:"mongoSocketTimeout,omitempty"`
	// 压缩算法，逗号分隔 snappy,zlib,zstd
	MongoCompressors string `json:"mongoCompressors,omitempty"`
	// 上报给服务端的应用名
	MongoAppName string `json:"mongoAppName,omitempty"`
	// MQTT 客户端 ID（可选）
	ClientID string `json:"clientId,omitempty"`
	// MQTT 是否使用 TLS
	UseTLS bool `json:"useTLS,omitempty"`
	// SQLite 本地文件配置
	SqlitePath string `json:"sqlitePath,omitempty"`
	// Docker 专用配置
	DockerEndpointType string `json:"dockerEndpointType,omitempty"`
	// unix 套接字路径 (默认 /var/run/docker.sock 或 //./pipe/docker_engine)
	DockerSocketPath string `json:"dockerSocketPath,omitempty"`
	// TCP 是否启用 TLS
	DockerTLSEnabled bool `json:"dockerTlsEnabled,omitempty"`
	// TLS 是否跳过证书校验
	DockerTLSInsecure bool `json:"dockerTlsInsecure,omitempty"`
	// TLS CA 证书
	DockerTLSCACert string `json:"dockerTlsCaCert,omitempty"`
	// TLS 客户端证书
	DockerTLSClientCert string `json:"dockerTlsClientCert,omitempty"`
	// TLS 客户端私钥
	DockerTLSClientKey string `json:"dockerTlsClientKey,omitempty"`
	// SSH 模式：跳板主机
	DockerSSHHost string `json:"dockerSshHost,omitempty"`
	// SSH 模式：跳板端口 (默认 22)
	DockerSSHPort int `json:"dockerSshPort,omitempty"`
	// SSH 模式：用户名
	DockerSSHUser string `json:"dockerSshUser,omitempty"`
	// password | key
	DockerSSHAuthType string `json:"dockerSshAuthType,omitempty"`
	// SSH 模式：密码
	DockerSSHPassword string `json:"dockerSshPassword,omitempty"`
	// SSH 模式：私钥路径
	DockerSSHKeyPath string `json:"dockerSshKeyPath,omitempty"`
	// SSH 模式：私钥内容
	DockerSSHKeyData string `json:"dockerSshKeyData,omitempty"`
	// SSH 模式：私钥口令
	DockerSSHPassphrase string `json:"dockerSshPassphrase,omitempty"`
	// Kubernetes (K8s) 专用配置
	K8sAuthMode string `json:"k8sAuthMode,omitempty"`
	// Kubeconfig 文本内容 (YAML)
	K8sKubeconfigData string `json:"k8sKubeconfigData,omitempty"`
	// Kubeconfig 本地文件路径
	K8sKubeconfigPath string `json:"k8sKubeconfigPath,omitempty"`
	// 指定 context 上下文名称（可选）
	K8sContext string `json:"k8sContext,omitempty"`
	// API Server 地址，如 https://192.168.1.100:6443
	K8sAPIServer string `json:"k8sApiServer,omitempty"`
	// token | cert | none
	K8sAuthType string `json:"k8sAuthType,omitempty"`
	// Bearer Token
	K8sBearerToken string `json:"k8sBearerToken,omitempty"`
	// CA 证书（PEM 字符串或文件路径）
	K8sCAData string `json:"k8sCaData,omitempty"`
	// 客户端证书（PEM 字符串或文件路径）
	K8sCertData string `json:"k8sCertData,omitempty"`
	// 客户端私钥（PEM 字符串或文件路径）
	K8sKeyData string `json:"k8sKeyData,omitempty"`
	// 跳过 TLS 证书校验
	K8sInsecureSkipTLS bool `json:"k8sInsecureSkipTLS,omitempty"`
	// 默认命名空间（可选）
	K8sNamespace string `json:"k8sNamespace,omitempty"`
	// 是否启用 SSH 隧道代理
	K8sSSHEnabled bool `json:"k8sSshEnabled,omitempty"`
	// SSH 跳板机地址
	K8sSSHHost string `json:"k8sSshHost,omitempty"`
	// SSH 跳板机端口 (默认 22)
	K8sSSHPort int `json:"k8sSshPort,omitempty"`
	// SSH 用户名
	K8sSSHUser string `json:"k8sSshUser,omitempty"`
	// password | key
	K8sSSHAuthType string `json:"k8sSshAuthType,omitempty"`
	// SSH 密码
	K8sSSHPassword string `json:"k8sSshPassword,omitempty"`
	// SSH 私钥路径
	K8sSSHKeyPath string `json:"k8sSshKeyPath,omitempty"`
	// SSH 私钥内容
	K8sSSHKeyData string `json:"k8sSshKeyData,omitempty"`
	// SSH 私钥口令
	K8sSSHPassphrase string `json:"k8sSshPassphrase,omitempty"`
	// MQTT 高级配置
	MqttProto string `json:"mqttProto,omitempty"`
	// 心跳间隔（秒）
	MqttKeepAlive int `json:"mqttKeepAlive,omitempty"`
	// 连接超时（秒）
	MqttConnectTimeout int `json:"mqttConnectTimeout,omitempty"`
	// 清除会话
	MqttCleanSession bool `json:"mqttCleanSession,omitempty"`
	// 自动重连
	MqttAutoReconnect bool `json:"mqttAutoReconnect,omitempty"`
	// 重连间隔（秒）
	MqttReconnectIntvl int `json:"mqttReconnectIntvl,omitempty"`
	// TLS 跳过证书校验
	MqttInsecure bool `json:"mqttInsecure,omitempty"`
	// TLS CA 证书（PEM 内容或文件路径）
	MqttCACert string `json:"mqttCaCert,omitempty"`
	// TLS 客户端证书（PEM 内容或文件路径）
	MqttClientCert string `json:"mqttClientCert,omitempty"`
	// TLS 客户端私钥（PEM 内容或文件路径）
	MqttClientKey string `json:"mqttClientKey,omitempty"`
	// 遗嘱主题
	MqttWillTopic string `json:"mqttWillTopic,omitempty"`
	// 遗嘱消息
	MqttWillPayload string `json:"mqttWillPayload,omitempty"`
	// 遗嘱 QoS
	MqttWillQos int `json:"mqttWillQos,omitempty"`
	// 遗嘱保留
	MqttWillRetained bool `json:"mqttWillRetained,omitempty"`
	UpdatedAt int64 `json:"updatedAt"`
}

// Calls: [c.DisplayPort, fmt.Sprintf]
func (c ServerConfig) Addr() string { ... }

// Calls: [string]
func (c ServerConfig) ConnType() ConnType { ... }

// Calls: [c.ConnType]
func (c ServerConfig) DisplayPort() int { ... }

// Calls: [c.ConnType, c.DisplayPort, filepath.Base, fmt.Sprintf, strings.TrimSpace]
func (c ServerConfig) Label() string { ... }

func (c ServerConfig) MysqlSSHHostPortOr() int { ... }

// Calls: [c.ConnType, errors.New, strings.ToLower, strings.TrimSpace]
func (c ServerConfig) Validate() error { ... }

// ServerGroup 描述服务器分组。
type ServerGroup struct {
	ID string `json:"id"`
	Name string `json:"name"`
}

// Store 负责服务器列表与分组的持久化。
type Store struct {
	mu sync.RWMutex
	dir string
	file string
	box *secretBox
	servers []ServerConfig
	groups []ServerGroup
	settings AppSettings
	composeStore *ComposeStore
	k8sOrchStore *K8sOrchestrationStore
}

// Calls: [s.mu.Lock, s.mu.Unlock, s.persist]
func (s *Store) Delete(id string) error { ... }

// DeleteComposeRecord 删除一条 Compose 记录。
// Calls: [errors.New, s.composeStore.DeleteRecord]
func (s *Store) DeleteComposeRecord(id string) error { ... }

// Calls: [s.mu.Lock, s.mu.Unlock, s.persist, time.Now, time.Now().Unix]
func (s *Store) DeleteGroup(id string) error { ... }

// DeleteK8sOrchestrationRecord 删除一条 K8s 编排记录。
// Calls: [errors.New, s.k8sOrchStore.DeleteRecord]
func (s *Store) DeleteK8sOrchestrationRecord(id string) error { ... }

// Calls: [s.mu.RLock, s.mu.RUnlock]
func (s *Store) Get(id string) (ServerConfig, bool) { ... }

// GetComposeRecord 获取单个 Compose 记录。
// Calls: [errors.New, s.composeStore.GetRecord]
func (s *Store) GetComposeRecord(id string) (*DockerComposeRecord, error) { ... }

// GetK8sOrchestrationRecord 获取单个 K8s 编排记录。
// Calls: [errors.New, s.k8sOrchStore.GetRecord]
func (s *Store) GetK8sOrchestrationRecord(id string) (*K8sOrchestrationRecord, error) { ... }

// Calls: [DefaultAppSettings, fillAiDefaults, s.mu.RLock, s.mu.RUnlock]
func (s *Store) GetSettings() AppSettings { ... }

// Calls: [out[i].Label, out[j].Label, s.mu.RLock, s.mu.RUnlock, sort.SliceStable, strings.ToLower]
func (s *Store) List() []ServerConfig { ... }

// ListComposeRecords 获取指定 serverId 的本地 Compose 记录。
// Calls: [s.composeStore.ListRecords]
func (s *Store) ListComposeRecords(serverId string) []DockerComposeRecord { ... }

// Calls: [s.mu.RLock, s.mu.RUnlock]
func (s *Store) ListGroups() []ServerGroup { ... }

// ListK8sOrchestrationRecords 获取指定 serverId 的本地 K8s 编排记录。
// Calls: [s.k8sOrchStore.ListRecords]
func (s *Store) ListK8sOrchestrationRecords(serverId string) []K8sOrchestrationRecord { ... }

// MoveServerToGroup 将服务器移入指定分组；groupId 为空表示移出分组。
// Calls: [errors.New, s.mu.Lock, s.mu.Unlock, s.persist, time.Now, time.Now().Unix]
func (s *Store) MoveServerToGroup(serverID string, groupID string) error { ... }

// Calls: [cfg.ConnType, cfg.Validate, s.mu.Lock, s.mu.Unlock, s.persist, string, strings.TrimSpace, time.Now, time.Now().Unix, uuid.NewString]
func (s *Store) Save(cfg ServerConfig) (ServerConfig, error) { ... }

// SaveComposeRecord 保存或更新一条 Compose 记录。
// Calls: [errors.New, s.composeStore.SaveRecord]
func (s *Store) SaveComposeRecord(r DockerComposeRecord) (*DockerComposeRecord, error) { ... }

// Calls: [errors.New, s.mu.Lock, s.mu.Unlock, s.persist, strings.TrimSpace, uuid.NewString]
func (s *Store) SaveGroup(g ServerGroup) (ServerGroup, error) { ... }

// SaveK8sOrchestrationRecord 保存或更新一条 K8s 编排记录。
// Calls: [errors.New, s.k8sOrchStore.SaveRecord]
func (s *Store) SaveK8sOrchestrationRecord(r K8sOrchestrationRecord) (*K8sOrchestrationRecord, error) { ... }

// Calls: [fillAiDefaults, s.mu.Lock, s.mu.Unlock, s.persist]
func (s *Store) SaveSettings(settings AppSettings) (AppSettings, error) { ... }

// Calls: [DefaultAppSettings, json.Unmarshal, os.IsNotExist, os.ReadFile, s.box.decrypt, s.mu.Lock, s.mu.Unlock]
func (s *Store) load() error { ... }

// Calls: [s.box.encrypt, storage.WriteJSONAtomic]
func (s *Store) persist() error { ... }

type UpdateCheckResult struct {
	CurrentVersion string `json:"currentVersion"`
	LatestVersion string `json:"latestVersion"`
	HasUpdate bool `json:"hasUpdate"`
	ReleaseURL string `json:"releaseUrl"`
	RepoURL string `json:"repoUrl"`
	CheckedAt string `json:"checkedAt"`
	ErrorMessage string `json:"errorMessage,omitempty"`
}

type gitHubTagItem struct {
	Name string `json:"name"`
}

// secretBox 使用 AES-GCM 加密本地保存的敏感字段。
type secretBox struct {
	gcm cipher.AEAD
}

// Calls: [base64.StdEncoding.DecodeString, s.gcm.NonceSize, s.gcm.Open, string, strings.HasPrefix, strings.TrimPrefix]
func (s *secretBox) decrypt(value string) string { ... }

// Calls: [base64.StdEncoding.EncodeToString, io.ReadFull, s.gcm.NonceSize, s.gcm.Seal]
func (s *secretBox) encrypt(plain string) string { ... }

```

#### Functions

```go
// AppConfigDir 获取当前配置目录（对应 %APPDATA%/xTerminal/config）
// Calls: [os.MkdirAll, storage.ConfigDir]
func AppConfigDir() (string, error) { ... }

// Calls: [CompareVersions, client.Do, fmt.Sprintf, http.NewRequest, json.NewDecoder, json.NewDecoder().Decode, req.Header.Set, resp.Body.Close, time.Now, time.Now().Format]
func CheckForUpdates() UpdateCheckResult { ... }

// Clear 清空容器。
// Calls: [c.mu.Lock, c.mu.Unlock]
func (c *ConcurrentMap[K, V]) Clear() { ... }

// CompareVersions 比较两个版本号。
// 返回: -1 当 v1 < v2; 0 当 v1 == v2; 1 当 v1 > v2
// Calls: [parseSemVer, strings.TrimPrefix]
func CompareVersions(v1 string, v2 string) int { ... }

func DefaultAppSettings() AppSettings { ... }

// Delete 删除指定键。
// Calls: [c.mu.Lock, c.mu.Unlock]
func (c *ConcurrentMap[K, V]) Delete(k K) { ... }

// EmitEvent 向前端分发全局事件
// Calls: [app.Event.Emit, application.Get]
func EmitEvent(eventName string, data any) { ... }

// Get 读取指定键的值。如果存在返回对应强类型值与 true，否则返回零值与 false。
// Calls: [c.mu.RLock, c.mu.RUnlock]
func (c *ConcurrentMap[K, V]) Get(k K) (V, bool) { ... }

// GetAndDelete 获取并删除指定键。
// Calls: [c.mu.Lock, c.mu.Unlock]
func (c *ConcurrentMap[K, V]) GetAndDelete(k K) (V, bool) { ... }

// Calls: [fmt.Sprintf, runtime.Version]
func GetAppVersionInfo() AppVersionInfo { ... }

// GetOrSet 若键存在则返回已有值；若不存在则存入 defaultVal 并返回 defaultVal。
// loaded 表示是否是读取到了已有值。
// Calls: [c.initIfNeeded, c.mu.Lock, c.mu.Unlock]
func (c *ConcurrentMap[K, V]) GetOrSet(k K, defaultVal V) (actual V, loaded bool) { ... }

// Calls: [isAppQuitting.Load]
func IsAppQuitting() bool { ... }

// Keys 获取当前所有键的快照切片。
// Calls: [c.mu.RLock, c.mu.RUnlock]
func (c *ConcurrentMap[K, V]) Keys() []K { ... }

// Len 获取容器中键值对数量。
// Calls: [c.mu.RLock, c.mu.RUnlock]
func (c *ConcurrentMap[K, V]) Len() int { ... }

// NewComposeStore 初始化 Compose 存储。
// Calls: [cs.load, filepath.Join, storage.ComposesPath]
func NewComposeStore(dir ...string) (*ComposeStore, error) { ... }

// NewConcurrentMap 创建并初始化一个 ConcurrentMap。
func NewConcurrentMap() (*ConcurrentMap[K, V]) { ... }

// NewK8sOrchestrationStore 初始化 K8s 编排存储。
// Calls: [filepath.Join, ks.load, storage.K8sOrchestrationsPath]
func NewK8sOrchestrationStore(dir ...string) (*K8sOrchestrationStore, error) { ... }

// Calls: [DefaultAppSettings, NewComposeStore, NewK8sOrchestrationStore, loadOrCreateKey, newSecretBox, s.load, storage.ConfigDir, storage.EnsureDirs, storage.ServersPath]
func NewStore() (*Store, error) { ... }

// OpenBrowser 在操作系统默认浏览器中打开指定链接。
// Calls: [cmd.Start, exec.Command]
func OpenBrowser(targetURL string) error { ... }

// OpenDirectoryDialog 弹出目录选择框
// Calls: [app.Dialog.OpenFile, app.Dialog.OpenFile().SetTitle, app.Dialog.OpenFile().SetTitle().CanChooseDirectories, app.Dialog.OpenFile().SetTitle().CanChooseDirectories().CanChooseFiles, app.Dialog.OpenFile().SetTitle().CanChooseDirectories().CanChooseFiles().PromptForSingleSelection, application.Get, isCancelledErr]
func OpenDirectoryDialog(title string) (string, error) { ... }

// OpenFileDialog 弹出单个文件选择框
// Calls: [app.Dialog.OpenFile, app.Dialog.OpenFile().SetTitle, app.Dialog.OpenFile().SetTitle().PromptForSingleSelection, application.Get, isCancelledErr]
func OpenFileDialog(title string) (string, error) { ... }

// OpenMultipleFilesDialog 弹出多文件选择框
// Calls: [app.Dialog.OpenFile, app.Dialog.OpenFile().SetTitle, app.Dialog.OpenFile().SetTitle().CanChooseFiles, app.Dialog.OpenFile().SetTitle().CanChooseFiles().PromptForMultipleSelection, application.Get, isCancelledErr]
func OpenMultipleFilesDialog(title string) ([]string, error) { ... }

// Range 遍历容器中所有的键值对。如果 fn 返回 false，则中止遍历。
// Calls: [c.mu.RLock, c.mu.RUnlock, fn]
func (c *ConcurrentMap[K, V]) Range(fn func(k K, v V) bool) { ... }

// SaveFileDialog 弹出文件保存框
// Calls: [app.Dialog.SaveFile, app.Dialog.SaveFile().SetFilename, app.Dialog.SaveFile().SetFilename().PromptForSingleSelection, application.Get, isCancelledErr]
func SaveFileDialog(title string, defaultFilename string) (string, error) { ... }

// Set 写入指定键值对。
// Calls: [c.initIfNeeded, c.mu.Lock, c.mu.Unlock]
func (c *ConcurrentMap[K, V]) Set(k K, v V) { ... }

// SetAppConfigDirForTest 用于单测隔离自定义配置目录
// Calls: [storage.SetBaseDirForTest]
func SetAppConfigDirForTest(dir string) { ... }

// Calls: [isAppQuitting.Store]
func SetAppQuitting(q bool) { ... }

// Values 获取当前所有值的快照切片。
// Calls: [c.mu.RLock, c.mu.RUnlock]
func (c *ConcurrentMap[K, V]) Values() []V { ... }

func fillAiDefaults(settings *AppSettings) { ... }

func (c *ConcurrentMap[K, V]) initIfNeeded() { ... }

// Calls: [err.Error, strings.Contains, strings.ToLower]
func isCancelledErr(err error) bool { ... }

// Calls: [filepath.Base, filepath.Join, io.ReadFull, os.ReadFile, storage.SecretKeyPath, storage.WriteFileAtomic]
func loadOrCreateKey(keyPathOpt ...string) ([]byte, error) { ... }

// Calls: [aes.NewCipher, cipher.NewGCM]
func newSecretBox(key []byte) (*secretBox, error) { ... }

// Calls: [strconv.Atoi, strings.Split]
func parseSemVer(ver string) []int { ... }

```

---

### Package `db` (`db`)

- **Imports (19):** `context`, `database/sql`, `encoding/csv`, `encoding/json`, `errors`, `fmt`, `github.com/go-sql-driver/mysql`, `github.com/jackc/pgx/v5/pgxpool`, `golang.org/x/crypto/ssh`, `io`, `modernc.org/sqlite`, `net`, `net/url`, `os`, `strconv`, `strings`, `sync`, `terminal/core`, `time`

#### Constants & Variables

```go
var _
```

#### Structs & Methods

```go
type MysqlManagerEx struct {
	mu sync.Mutex
	ctx context.Context
	conns map[string]*mysqlConnEx
}

// Calls: [c.db.Close, c.tunnel.close, m.mu.Lock, m.mu.Unlock]
func (m *MysqlManagerEx) Close(id string) { ... }

// Calls: [c.db.Close, c.tunnel.close, m.mu.Lock, m.mu.Unlock]
func (m *MysqlManagerEx) CloseAll() { ... }

// Calls: [m.mu.Lock, m.mu.Unlock]
func (m *MysqlManagerEx) Get(id string) (*mysqlConnEx, bool) { ... }

// Calls: [m.mu.Lock, m.mu.Unlock]
func (m *MysqlManagerEx) ListConnections() []map[string]any { ... }

// MysqlBackup 通过 mysqldump 风格逻辑导出全量 SQL（包含建表 DDL 与插入 DML 数据）。
// Calls: [fmt.Sprintf, m.MysqlExportSQL, m.MysqlTables, m.queryEx, quoteIdent, sb.String, sb.WriteString, time.Now, time.Now().Format]
func (m *MysqlManagerEx) MysqlBackup(id string, db string) (string, error) { ... }

// Calls: [core.SaveFileDialog, fmt.Errorf, m.MysqlBackup, os.WriteFile]
func (m *MysqlManagerEx) MysqlBackupToFile(id string, db string) (string, error) { ... }

// Calls: [errors.New, fmt.Sprintf, m.Get, mc.db.Exec, quoteLiteral, quoteUserHost]
func (m *MysqlManagerEx) MysqlChangeUserPassword(id string, user string, host string, newPassword string) error { ... }

// Calls: [m.Close]
func (m *MysqlManagerEx) MysqlCloseEx(id string) { ... }

// MysqlConnectEx 支持 SSH/SSL/连接池的连接入口。
// Calls: [cfg.ConnType, errors.New, m.Open]
func (m *MysqlManagerEx) MysqlConnectEx(cfg core.ServerConfig) (bool, error) { ... }

// Calls: [fmt.Sprintf, fmt.Sscanf, int64, m.MysqlRun, quoteIdent, string]
func (m *MysqlManagerEx) MysqlCount(id string, dbName string, table string) (int64, error) { ... }

// Calls: [errors.New, fmt.Sprintf, m.Get, mc.db.Exec, quoteIdent]
func (m *MysqlManagerEx) MysqlCreateDatabase(id string, name string, charset string) error { ... }

// Calls: [errors.New, fmt.Sprintf, m.Get, mc.db.Exec, quoteIdent, strings.Join, strings.Split, strings.TrimSpace]
func (m *MysqlManagerEx) MysqlCreateIndex(id string, db string, table string, name string, colsCSV string, unique bool) error { ... }

// Calls: [errors.New, fmt.Sprintf, m.Get, mc.db.Exec, quoteIdent, strings.TrimSpace]
func (m *MysqlManagerEx) MysqlCreateTable(id string, db string, table string, defs string) error { ... }

// Calls: [errors.New, fmt.Sprintf, m.Get, mc.db.Exec, quoteLiteral, quoteUserHost, strings.TrimSpace]
func (m *MysqlManagerEx) MysqlCreateUser(id string, user string, host string, password string, authPlugin string, lock bool) error { ... }

// Calls: [QuerySingleColumn, cancel, context.Background, context.WithTimeout, errors.New, m.Get]
func (m *MysqlManagerEx) MysqlDatabases(id string) ([]string, error) { ... }

// Calls: [errors.New, fmt.Errorf, fmt.Sprintf, m.Get, mc.db.Exec, quoteIdent, res.RowsAffected, strings.Join, strings.TrimSpace]
func (m *MysqlManagerEx) MysqlDelete(id string, dbName string, table string, whereCols []string, whereVals []any) (int64, error) { ... }

// Calls: [fmt.Sprintf, m.MysqlRun, quoteIdent]
func (m *MysqlManagerEx) MysqlDescribe(id string, dbName string, table string) (MysqlQueryResult, error) { ... }

// Calls: [errors.New, m.Get, mc.db.Exec, quoteIdent]
func (m *MysqlManagerEx) MysqlDropDatabase(id string, name string) error { ... }

// Calls: [errors.New, fmt.Sprintf, m.Get, mc.db.Exec, quoteIdent]
func (m *MysqlManagerEx) MysqlDropIndex(id string, db string, table string, name string) error { ... }

// Calls: [errors.New, m.Get, mc.db.Exec, quoteIdent]
func (m *MysqlManagerEx) MysqlDropTable(id string, db string, table string) error { ... }

// Calls: [errors.New, fmt.Sprintf, m.Get, mc.db.Exec, quoteUserHost, strings.ToLower, strings.TrimSpace]
func (m *MysqlManagerEx) MysqlDropUser(id string, user string, host string) error { ... }

// Calls: [errors.New, m.MysqlExportCSV, m.MysqlExportJSON, m.MysqlExportSQL]
func (m *MysqlManagerEx) MysqlExport(id string, db string, mode string, source string, table string, sqlText string, limit int) (string, error) { ... }

// Calls: [asString, buildExportQuery, csv.NewWriter, m.queryExWithTimeoutLimit, sb.String, w.Flush, w.Write]
func (m *MysqlManagerEx) MysqlExportCSV(id string, db string, source string, table string, sqlText string, limit int) (string, error) { ... }

// Calls: [buildExportQuery, errors.New, fmt.Errorf, json.MarshalIndent, m.Get, m.queryExWithTimeoutLimit, mc.db.Exec, quoteIdent, string, strings.TrimSpace]
func (m *MysqlManagerEx) MysqlExportJSON(id string, db string, source string, table string, sqlText string, limit int) (string, error) { ... }

// Calls: [buildExportQuery, fmt.Sprintf, formatSQLValue, m.queryExWithTimeoutLimit, quoteIdent, sb.String, sb.WriteString, strings.Join, strings.TrimSpace]
func (m *MysqlManagerEx) MysqlExportSQL(id string, db string, source string, table string, sqlText string, limit int) (string, error) { ... }

// MysqlExportToFileEx 支持 csv/json/sql，并通过系统对话框保存。
// Calls: [core.SaveFileDialog, errors.New, m.MysqlExport, m.MysqlExportJSON, os.WriteFile]
func (m *MysqlManagerEx) MysqlExportToFileEx(id string, db string, mode string, source string, table string, sqlText string, limit int) (string, error) { ... }

// Calls: [errors.New, fmt.Sprintf, m.Get, mc.db.Exec, quoteIdent, quoteUserHost, strings.Join, strings.TrimSpace]
func (m *MysqlManagerEx) MysqlGrantPrivileges(id string, user string, host string, dbName string, table string, privs []string, withGrantOption bool) error { ... }

// Calls: [asString, errors.New, fmt.Sprintf, m.Get, queryRaw, quoteUserHost, sb.String, sb.WriteString]
func (m *MysqlManagerEx) MysqlGrants(id string, user string, host string) (string, error) { ... }

// Calls: [errors.New, m.MysqlImportCSV, m.MysqlImportJSON, m.MysqlImportSQL]
func (m *MysqlManagerEx) MysqlImport(id string, db string, mode string, table string, content string) (string, error) { ... }

// Calls: [csv.NewReader, errors.New, fmt.Errorf, fmt.Sprintf, m.Get, mc.db.Exec, quoteIdent, r.ReadAll, strings.Join, strings.NewReader, strings.ToUpper, strings.TrimSpace]
func (m *MysqlManagerEx) MysqlImportCSV(id string, db string, table string, content string) (string, error) { ... }

// MysqlImportFromFileEx 支持 csv/json/sql，并通过系统对话框选择文件。
// Calls: [core.OpenFileDialog, errors.New, m.MysqlImport, m.MysqlImportJSON, os.ReadFile, string]
func (m *MysqlManagerEx) MysqlImportFromFileEx(id string, db string, mode string, table string) (string, error) { ... }

// MysqlImportJSON 将 JSON 数组导入到指定表（与列名对应）。
// Calls: [err.Error, errors.New, fmt.Errorf, fmt.Sprintf, json.Unmarshal, m.Get, mc.db.Exec, quoteIdent, strings.Join, strings.Repeat, strings.TrimSuffix]
func (m *MysqlManagerEx) MysqlImportJSON(id string, db string, table string, content string) (string, error) { ... }

// Calls: [errors.New, fmt.Errorf, fmt.Sprintf, m.Get, mc.db.Exec, quoteIdent, splitSQLStatements, strings.TrimSpace, truncateStr]
func (m *MysqlManagerEx) MysqlImportSQL(id string, db string, content string) (string, error) { ... }

// MysqlIndexes 返回表的索引信息。
// Calls: [fmt.Sprintf, m.queryEx, quoteIdent]
func (m *MysqlManagerEx) MysqlIndexes(id string, db string, table string) ([]map[string]any, error) { ... }

// Calls: [errors.New, fmt.Errorf, fmt.Sprintf, m.Get, mc.db.Exec, quoteIdent, res.RowsAffected, strings.Join, strings.TrimSpace]
func (m *MysqlManagerEx) MysqlInsert(id string, dbName string, table string, columns []string, values []any) (int64, error) { ... }

// Calls: [m.queryEx]
func (m *MysqlManagerEx) MysqlProcessList(id string) ([]map[string]any, error) { ... }

// MysqlQueryCSV 以 CSV 字符串返回查询结果（供前端下载/复制）。
// Calls: [asString, csv.NewWriter, fmt.Sprintf, m.queryExWithTimeoutLimit, sb.String, strings.HasSuffix, strings.ToUpper, strings.TrimSpace, w.Flush, w.Write]
func (m *MysqlManagerEx) MysqlQueryCSV(id string, db string, sqlText string, limit int) (string, error) { ... }

// Calls: [errors.New, fmt.Sprintf, m.Get, mc.db.Exec, quoteUserHost, strings.ToLower, strings.TrimSpace]
func (m *MysqlManagerEx) MysqlRevokeAllPrivileges(id string, user string, host string) error { ... }

// Calls: [errors.New, fmt.Sprintf, m.Get, mc.db.Exec, quoteIdent, quoteUserHost, strings.Join, strings.ToLower, strings.TrimSpace]
func (m *MysqlManagerEx) MysqlRevokePrivileges(id string, user string, host string, dbName string, table string, privs []string) error { ... }

// Calls: [errors.New, fmt.Errorf, isReadQuery, m.Get, m.queryEx, mc.db.Exec, quoteIdent, res.RowsAffected, strings.TrimSpace]
func (m *MysqlManagerEx) MysqlRun(id string, dbName string, sqlText string) (MysqlQueryResult, error) { ... }

// MysqlSchema 返回数据库所有表的列与之间外键关系，供前端绘制 ER 图。
// Calls: [fmt.Sprintf, m.MysqlTables, m.queryEx, quoteIdent, quoteString]
func (m *MysqlManagerEx) MysqlSchema(id string, db string) (map[string]any, error) { ... }

// Calls: [fmt.Sprintf, m.MysqlRun, quoteIdent]
func (m *MysqlManagerEx) MysqlSelect(id string, dbName string, table string, limit int, offset int) (MysqlQueryResult, error) { ... }

// MysqlSlowLog 返回慢查询日志内容（需开启 log_output=FILE 且 slow_query_log=ON）。
// Calls: [fmt.Sprintf, m.queryEx]
func (m *MysqlManagerEx) MysqlSlowLog(id string, limit int) ([]map[string]any, error) { ... }

// Calls: [m.queryEx]
func (m *MysqlManagerEx) MysqlStatus(id string) (map[string]any, error) { ... }

// MysqlTableStatus 返回表状态信息（引擎、行数、大小等）。
// Calls: [m.queryEx]
func (m *MysqlManagerEx) MysqlTableStatus(id string, db string) ([]map[string]any, error) { ... }

// Calls: [QuerySingleColumn, cancel, context.Background, context.WithTimeout, errors.New, fmt.Errorf, m.Get, mc.db.Exec, quoteIdent, strings.TrimSpace]
func (m *MysqlManagerEx) MysqlTables(id string, dbName string) ([]string, error) { ... }

// Calls: [errors.New, fmt.Sprintf, m.Get, mc.db.Exec, quoteUserHost, strings.ToLower, strings.TrimSpace]
func (m *MysqlManagerEx) MysqlToggleUserLock(id string, user string, host string, lock bool) error { ... }

// Calls: [errors.New, m.Get, mc.db.Exec, quoteIdent]
func (m *MysqlManagerEx) MysqlTruncateTable(id string, db string, table string) error { ... }

// Calls: [errors.New, fmt.Errorf, fmt.Sprintf, m.Get, mc.db.Exec, quoteIdent, res.RowsAffected, strings.Join, strings.TrimSpace]
func (m *MysqlManagerEx) MysqlUpdate(id string, dbName string, table string, setCols []string, setVals []any, whereCols []string, whereVals []any) (int64, error) { ... }

// Calls: [m.queryEx]
func (m *MysqlManagerEx) MysqlUsers(id string) ([]map[string]any, error) { ... }

// Calls: [m.queryEx]
func (m *MysqlManagerEx) MysqlVariables(id string) (map[string]any, error) { ... }

// Calls: [buildMysqlDSNExtended, cancel, context.Background, context.WithTimeout, db.Close, db.Ping, db.SetConnMaxLifetime, db.SetMaxIdleConns, db.SetMaxOpenConns, fmt.Errorf, isSameMysqlConfig, m.mu.Lock, m.mu.Unlock, old.db.PingContext, sql.Open, time.Duration, toClose.db.Close, toClose.tunnel.close, tunnel.close]
func (m *MysqlManagerEx) Open(id string, cfg core.ServerConfig) error { ... }

// Calls: [errors.New, fmt.Errorf, m.mu.Lock, m.mu.Unlock, strings.EqualFold, strings.TrimSpace]
func (m *MysqlManagerEx) ResolveID(idOrName string) (string, error) { ... }

func (m *MysqlManagerEx) SetContext(ctx context.Context) { ... }

// TestConnection 测试 MySQL 数据库连通性并返回网络延迟
// Calls: [buildMysqlDSNExtended, cancel, context.Background, context.WithTimeout, db.Close, db.PingContext, db.SetConnMaxLifetime, db.SetMaxIdleConns, db.SetMaxOpenConns, fmt.Errorf, sql.Open, time.Now, time.Since, time.Since().Milliseconds, tunnel.close]
func (m *MysqlManagerEx) TestConnection(cfg core.ServerConfig) (map[string]any, error) { ... }

// queryEx 在扩展连接上执行查询，默认不截断（兼容库表元数据查询等场景）。
// Calls: [m.queryExWithTimeoutLimit]
func (m *MysqlManagerEx) queryEx(id string, dbName string, sqlText string) (columns []string, rows []map[string]any, err error) { ... }

// queryExWithTimeoutLimit 支持自定义超时时间与最大行数（maxRows <= 0 表示全量不限制）。
// Calls: [cancel, context.Background, context.WithTimeout, errors.New, fmt.Errorf, m.Get, mc.db.Exec, mc.db.QueryContext, normalizeMysqlVal, quoteIdent, res.Close, res.Columns, res.Err, res.Next, res.Scan, strings.TrimSpace]
func (m *MysqlManagerEx) queryExWithTimeoutLimit(id string, dbName string, sqlText string, timeout time.Duration, maxRows int) (columns []string, rows []map[string]any, err error) { ... }

// MysqlQueryResult 表示单次 SQL 执行的统一输出。
type MysqlQueryResult struct {
	Columns []string `json:"columns"`
	Rows []map[string]any `json:"rows"`
	Affected int64 `json:"affected"`
}

// MysqlSessionInfo 是暴露给前端的 MySQL 连接状态。
type MysqlSessionInfo struct {
	ID string `json:"id"`
	ServerID string `json:"serverId"`
	Title string `json:"title"`
	Host string `json:"host"`
	Port int `json:"port"`
	Database string `json:"database"`
	Connected bool `json:"connected"`
}

// PgColumn 描述表字段详细定义。
type PgColumn struct {
	Name string `json:"name"`
	OrdinalPos int `json:"ordinalPos"`
	DataType string `json:"dataType"`
	UdtName string `json:"udtName"`
	IsNullable bool `json:"isNullable"`
	DefaultVal string `json:"defaultVal"`
	IsPrimaryKey bool `json:"isPrimaryKey"`
	IsForeignKey bool `json:"isForeignKey"`
	CharMaxLength int `json:"charMaxLength,omitempty"`
	NumPrecision int `json:"numPrecision,omitempty"`
	NumScale int `json:"numScale,omitempty"`
	Comment string `json:"comment"`
}

// PgConstraint 描述约束。
type PgConstraint struct {
	Name string `json:"name"`
	// PRIMARY KEY | FOREIGN KEY | UNIQUE | CHECK
	Type string `json:"type"`
	Def string `json:"def"`
	ForeignTable string `json:"foreignTable,omitempty"`
	ForeignSchema string `json:"foreignSchema,omitempty"`
	ForeignColumn string `json:"foreignColumn,omitempty"`
}

// PgDatabase 描述 PostgreSQL 数据库。
type PgDatabase struct {
	Name string `json:"name"`
	Owner string `json:"owner"`
	Encoding string `json:"encoding"`
	Collate string `json:"collate"`
	Size string `json:"size"`
	SizeBytes int64 `json:"sizeBytes"`
	TableCount int `json:"tableCount"`
}

// PgFunction 描述存储过程与函数。
type PgFunction struct {
	Name string `json:"name"`
	Schema string `json:"schema"`
	ResultType string `json:"resultType"`
	ArgTypes string `json:"argTypes"`
	ArgNames []string `json:"argNames"`
	Language string `json:"language"`
	Def string `json:"def"`
	Comment string `json:"comment"`
	IsProc bool `json:"isProc"`
}

// PgIndex 描述表索引元数据。
type PgIndex struct {
	Name string `json:"name"`
	Table string `json:"table"`
	Schema string `json:"schema"`
	Def string `json:"def"`
	IsPrimary bool `json:"isPrimary"`
	IsUnique bool `json:"isUnique"`
	Columns []string `json:"columns"`
	Size string `json:"size"`
}

// PgRole 描述数据库角色/用户。
type PgRole struct {
	Name string `json:"name"`
	Super bool `json:"super"`
	Inherit bool `json:"inherit"`
	CreateRole bool `json:"createRole"`
	CreateDB bool `json:"createDb"`
	CanLogin bool `json:"canLogin"`
	Replication bool `json:"replication"`
	ConnLimit int `json:"connLimit"`
	ValidUntil string `json:"validUntil"`
	MemberOf string `json:"memberOf"`
}

// PgSchema 描述 PostgreSQL Schema 命名空间。
type PgSchema struct {
	Name string `json:"name"`
	Owner string `json:"owner"`
	TableCount int `json:"tableCount"`
	ViewCount int `json:"viewCount"`
	FunctionCount int `json:"functionCount"`
}

// PgSequence 描述序列。
type PgSequence struct {
	Name string `json:"name"`
	Schema string `json:"schema"`
	DataType string `json:"dataType"`
	StartValue int64 `json:"startValue"`
	MinValue int64 `json:"minValue"`
	MaxValue int64 `json:"maxValue"`
	Increment int64 `json:"increment"`
	CurrentValue int64 `json:"currentValue"`
	LastValue int64 `json:"lastValue"`
}

// PgSession 描述活跃会话（pg_stat_activity）。
type PgSession struct {
	Pid int `json:"pid"`
	User string `json:"user"`
	Database string `json:"database"`
	ClientAddr string `json:"clientAddr"`
	ClientPort int `json:"clientPort"`
	BackendStart string `json:"backendStart"`
	QueryStart string `json:"queryStart"`
	StateChange string `json:"stateChange"`
	WaitEventType string `json:"waitEventType"`
	WaitEvent string `json:"waitEvent"`
	State string `json:"state"`
	Query string `json:"query"`
	DurationSec int64 `json:"durationSec"`
}

// PgStatus 描述数据库服务器健康与运行状态。
type PgStatus struct {
	Version string `json:"version"`
	Uptime string `json:"uptime"`
	ActiveConnections int `json:"activeConnections"`
	MaxConnections int `json:"maxConnections"`
	DatabaseSize string `json:"databaseSize"`
	CacheHitRatio string `json:"cacheHitRatio"`
	TPS int64 `json:"tps"`
	Deadlocks int64 `json:"deadlocks"`
	TempFiles int64 `json:"tempFiles"`
	TempBytes string `json:"tempBytes"`
}

// PgTable 描述 PostgreSQL 数据表或视图元数据。
type PgTable struct {
	Name string `json:"name"`
	Schema string `json:"schema"`
	// BASE TABLE | VIEW | MATERIALIZED VIEW | FOREIGN TABLE | PARTITIONED TABLE
	Type string `json:"type"`
	RowCount int64 `json:"rowCount"`
	TotalSize string `json:"totalSize"`
	TableSize string `json:"tableSize"`
	IndexSize string `json:"indexSize"`
	Comment string `json:"comment"`
}

type PostgresManager struct {
	pools core.ConcurrentMap[string, *pgxpool.Pool]
	tunnels core.ConcurrentMap[string, *pgSshTunnel]
	configs core.ConcurrentMap[string, core.ServerConfig]
}

// CloseAll 关闭所有 PostgreSQL 连接池与 SSH 隧道。
// Calls: [m.configs.Clear, m.pools.Clear, m.pools.Range, m.tunnels.Clear, m.tunnels.Range, pool.Close, tun.client.Close, tun.l.Close]
func (m *PostgresManager) CloseAll() { ... }

// GetPool 获取或创建指定服务器和数据库的连接池。
// Calls: [buildPgConnString, cancel, context.Background, context.WithTimeout, fmt.Errorf, fmt.Sprintf, int32, m.configs.Get, m.pools.Delete, m.pools.Get, m.pools.Set, m.tunnels.Get, m.tunnels.Set, openPgSSHTunnel, pgxpool.NewWithConfig, pgxpool.ParseConfig, pool.Close, pool.Ping, strconv.Atoi, strings.Split, time.Duration]
func (m *PostgresManager) GetPool(serverID string, dbName string) (*pgxpool.Pool, error) { ... }

// ListConnections 列出当前所有已建立连接的 PostgreSQL 数据库实例。
// Calls: [m.configs.Values]
func (m *PostgresManager) ListConnections() []map[string]any { ... }

// PostgresCloseEx 断开并清理指定服务器的所有连接池与隧道。
// Calls: [m.configs.Delete, m.pools.Delete, m.pools.Range, m.tunnels.GetAndDelete, pool.Close, strings.HasPrefix, tun.client.Close, tun.l.Close]
func (m *PostgresManager) PostgresCloseEx(serverID string) { ... }

// PostgresConnectEx 连接并测试 PostgreSQL 实例。
// Calls: [m.GetPool, m.configs.Set]
func (m *PostgresManager) PostgresConnectEx(cfg core.ServerConfig) (bool, error) { ... }

// PostgresCount 获取指定表在过滤条件下的记录总数。
// Calls: [cancel, context.Background, context.WithTimeout, fmt.Sprintf, m.GetPool, pool.QueryRow, pool.QueryRow().Scan, strings.TrimSpace]
func (m *PostgresManager) PostgresCount(serverID string, dbName string, schema string, table string, whereClause string) (int64, error) { ... }

// PostgresCreateDatabase 创建数据库。
// Calls: [cancel, context.Background, context.WithTimeout, fmt.Sprintf, m.GetPool, pool.Exec, strings.Join]
func (m *PostgresManager) PostgresCreateDatabase(serverID string, name string, owner string, encoding string, template string) error { ... }

// PostgresCreateRole 创建新角色。
// Calls: [cancel, context.Background, context.WithTimeout, fmt.Sprintf, m.GetPool, pool.Exec, strings.Join, strings.ReplaceAll, strings.TrimSpace]
func (m *PostgresManager) PostgresCreateRole(serverID string, roleName string, password string, super bool, canLogin bool, createDB bool, createRole bool, connLimit int) error { ... }

// PostgresCreateSchema 创建 Schema。
// Calls: [cancel, context.Background, context.WithTimeout, fmt.Sprintf, m.GetPool, pool.Exec]
func (m *PostgresManager) PostgresCreateSchema(serverID string, dbName string, schema string, owner string) error { ... }

// PostgresCreateTable 创建数据表。
// Calls: [cancel, context.Background, context.WithTimeout, fmt.Sprintf, m.GetPool, pool.Exec]
func (m *PostgresManager) PostgresCreateTable(serverID string, dbName string, schema string, table string, defs string) error { ... }

// PostgresDatabases 获取所有可访问数据库列表。
// Calls: [cancel, context.Background, context.WithTimeout, fmt.Errorf, m.GetPool, pool.Query, rows.Close, rows.Next, rows.Scan]
func (m *PostgresManager) PostgresDatabases(serverID string) ([]PgDatabase, error) { ... }

// PostgresDelete 根据主键定位删除记录。
// Calls: [cancel, context.Background, context.WithTimeout, fmt.Errorf, fmt.Sprintf, m.GetPool, pool.Exec, strings.Join, tag.RowsAffected]
func (m *PostgresManager) PostgresDelete(serverID string, dbName string, schema string, table string, whereCols []string, whereVals []any) (int64, error) { ... }

// PostgresDescribe 获取表或视图的详细结构（字段、主键、外键、约束、索引）。
// Calls: [cancel, colRows.Close, colRows.Next, colRows.Scan, consRows.Close, consRows.Next, consRows.Scan, context.Background, context.WithTimeout, fkRows.Close, fkRows.Next, fkRows.Scan, fmt.Errorf, idxRows.Close, idxRows.Next, idxRows.Scan, m.GetPool, pkRows.Close, pkRows.Next, pkRows.Scan, pool.Query]
func (m *PostgresManager) PostgresDescribe(serverID string, dbName string, schema string, table string) (map[string]any, error) { ... }

// PostgresDropDatabase 删除数据库。
// Calls: [cancel, context.Background, context.WithTimeout, fmt.Sprintf, m.GetPool, pool.Exec]
func (m *PostgresManager) PostgresDropDatabase(serverID string, name string) error { ... }

// PostgresDropRole 删除角色。
// Calls: [cancel, context.Background, context.WithTimeout, fmt.Sprintf, m.GetPool, pool.Exec]
func (m *PostgresManager) PostgresDropRole(serverID string, roleName string) error { ... }

// PostgresDropSchema 删除 Schema。
// Calls: [cancel, context.Background, context.WithTimeout, fmt.Sprintf, m.GetPool, pool.Exec]
func (m *PostgresManager) PostgresDropSchema(serverID string, dbName string, schema string, cascade bool) error { ... }

// PostgresDropTable 删除数据表。
// Calls: [cancel, context.Background, context.WithTimeout, fmt.Sprintf, m.GetPool, pool.Exec]
func (m *PostgresManager) PostgresDropTable(serverID string, dbName string, schema string, table string, cascade bool) error { ... }

// PostgresExplain 执行 EXPLAIN ANALYZE 并返回格式化执行计划。
// Calls: [cancel, context.Background, context.WithTimeout, fmt.Errorf, fmt.Sprintf, m.GetPool, pool.QueryRow, pool.QueryRow().Scan, strings.Join]
func (m *PostgresManager) PostgresExplain(serverID string, dbName string, sqlText string, analyze bool, buffers bool, verbose bool) (string, error) { ... }

// PostgresExport 导出为 CSV 或 JSON 格式文本。
// Calls: [cancel, context.Background, context.WithTimeout, csv.NewWriter, fmt.Sprintf, json.MarshalIndent, m.GetPool, normalizePgVal, pool.Query, rows.Close, rows.FieldDescriptions, rows.Next, rows.Values, sb.String, string, strings.Contains, strings.ToUpper, strings.TrimSpace, w.Flush, w.Write]
func (m *PostgresManager) PostgresExport(serverID string, dbName string, schema string, mode string, source string, table string, sqlText string, limit int) (string, error) { ... }

// PostgresExportToFile 弹出文件保存对话框并导出为文件。
// Calls: [core.SaveFileDialog, fmt.Sprintf, m.PostgresExport, os.WriteFile]
func (m *PostgresManager) PostgresExportToFile(serverID string, dbName string, schema string, mode string, source string, table string, sqlText string, limit int) (string, error) { ... }

// PostgresFunctions 获取指定 Schema 下的所有函数与存储过程。
// Calls: [cancel, context.Background, context.WithTimeout, fmt.Errorf, m.GetPool, pool.Query, rows.Close, rows.Next, rows.Scan]
func (m *PostgresManager) PostgresFunctions(serverID string, dbName string, schema string) ([]PgFunction, error) { ... }

// PostgresGrantPrivileges 授予或撤销权限。
// Calls: [cancel, context.Background, context.WithTimeout, fmt.Sprintf, m.GetPool, pool.Exec]
func (m *PostgresManager) PostgresGrantPrivileges(serverID string, dbName string, roleName string, schema string, table string, privileges string, isGrant bool) error { ... }

// PostgresImport 导入数据。
// Calls: [cancel, context.Background, context.WithTimeout, csv.NewReader, fmt.Errorf, fmt.Sprintf, m.GetPool, pool.Begin, pool.Exec, r.Read, strings.Join, strings.NewReader, tag.RowsAffected, tx.Commit, tx.Exec, tx.Rollback]
func (m *PostgresManager) PostgresImport(serverID string, dbName string, schema string, mode string, table string, content string) (string, error) { ... }

// PostgresImportFromFile 弹出文件选择对话框并导入 CSV/SQL 文件。
// Calls: [core.OpenFileDialog, errors.New, m.PostgresImport, os.ReadFile, string]
func (m *PostgresManager) PostgresImportFromFile(serverID string, dbName string, schema string, mode string, table string) (string, error) { ... }

// PostgresInsert 向指定表插入一行新记录。
// Calls: [cancel, context.Background, context.WithTimeout, fmt.Errorf, fmt.Sprintf, m.GetPool, pool.Exec, strings.Join, tag.RowsAffected]
func (m *PostgresManager) PostgresInsert(serverID string, dbName string, schema string, table string, columns []string, values []any) (int64, error) { ... }

// PostgresKillSession 终止或取消指定会话。
// Calls: [cancel, context.Background, context.WithTimeout, fmt.Errorf, fmt.Sprintf, m.GetPool, pool.QueryRow, pool.QueryRow().Scan]
func (m *PostgresManager) PostgresKillSession(serverID string, dbName string, pid int, terminate bool) (bool, error) { ... }

// PostgresRoles 获取数据库角色列表。
// Calls: [cancel, context.Background, context.WithTimeout, fmt.Errorf, m.GetPool, pool.Query, rows.Close, rows.Next, rows.Scan]
func (m *PostgresManager) PostgresRoles(serverID string) ([]PgRole, error) { ... }

// PostgresRun 执行自定义 SQL 语句。
// Calls: [cancel, context.Background, context.WithTimeout, err.Error, int64, isPgReadQuery, m.GetPool, normalizePgVal, pool.Exec, pool.Query, rows.Close, rows.FieldDescriptions, rows.Next, rows.Values, strings.TrimSpace, tag.RowsAffected, time.Now, time.Since, time.Since().Milliseconds]
func (m *PostgresManager) PostgresRun(serverID string, dbName string, sqlText string) (PostgresQueryResult, error) { ... }

// PostgresSchemas 获取指定数据库下的所有 Schema 命名空间。
// Calls: [cancel, context.Background, context.WithTimeout, fmt.Errorf, m.GetPool, pool.Query, rows.Close, rows.Next, rows.Scan]
func (m *PostgresManager) PostgresSchemas(serverID string, dbName string) ([]PgSchema, error) { ... }

// PostgresSelect 执行带分页、排序与过滤的数据表查询。
// Calls: [cancel, context.Background, context.WithTimeout, err.Error, fmt.Sprintf, int64, m.GetPool, normalizePgVal, pool.Query, rows.Close, rows.FieldDescriptions, rows.Next, rows.Values, strings.ToUpper, strings.TrimSpace, time.Now, time.Since, time.Since().Milliseconds]
func (m *PostgresManager) PostgresSelect(serverID string, dbName string, schema string, table string, limit int, offset int, sortCol string, sortOrder string, whereClause string) (PostgresQueryResult, error) { ... }

// PostgresSequences 获取指定 Schema 下的所有序列。
// Calls: [cancel, context.Background, context.WithTimeout, fmt.Errorf, m.GetPool, pool.Query, rows.Close, rows.Next, rows.Scan]
func (m *PostgresManager) PostgresSequences(serverID string, dbName string, schema string) ([]PgSequence, error) { ... }

// PostgresSessions 查询当前数据库活跃会话 (pg_stat_activity)。
// Calls: [cancel, context.Background, context.WithTimeout, fmt.Errorf, m.GetPool, pool.Query, rows.Close, rows.Next, rows.Scan]
func (m *PostgresManager) PostgresSessions(serverID string, dbName string) ([]PgSession, error) { ... }

// PostgresStatus 获取 PostgreSQL 运行状态指标。
// Calls: [cancel, context.Background, context.WithTimeout, fmt.Sprintf, m.GetPool, pool.QueryRow, pool.QueryRow().Scan]
func (m *PostgresManager) PostgresStatus(serverID string, dbName string) (PgStatus, error) { ... }

// PostgresTableDDL 获取指定表的 DDL 创建脚本。
// Calls: [fmt.Sprintf, m.PostgresDescribe, strings.Join, strings.ToUpper]
func (m *PostgresManager) PostgresTableDDL(serverID string, dbName string, schema string, table string) (string, error) { ... }

// PostgresTables 获取指定 Schema 下的所有表与视图。
// Calls: [cancel, context.Background, context.WithTimeout, fmt.Errorf, m.GetPool, pool.Query, rows.Close, rows.Next, rows.Scan]
func (m *PostgresManager) PostgresTables(serverID string, dbName string, schema string) ([]PgTable, error) { ... }

// PostgresTestConnection 使用临时配置测试 PostgreSQL 连通性并返回网络延迟。
// Calls: [buildPgConnString, cancel, context.Background, context.WithTimeout, fmt.Errorf, fmt.Sprintf, openPgSSHTunnel, pgxpool.NewWithConfig, pgxpool.ParseConfig, pool.Close, pool.Ping, strconv.Atoi, strings.Split, time.Now, time.Since, time.Since().Milliseconds, tun.client.Close, tun.l.Close]
func (m *PostgresManager) PostgresTestConnection(cfg core.ServerConfig) (map[string]any, error) { ... }

// PostgresTruncateTable 清空数据表。
// Calls: [cancel, context.Background, context.WithTimeout, fmt.Sprintf, m.GetPool, pool.Exec]
func (m *PostgresManager) PostgresTruncateTable(serverID string, dbName string, schema string, table string, restartIdentity bool, cascade bool) error { ... }

// PostgresUpdate 根据主键定位更新单行或多行记录。
// Calls: [cancel, context.Background, context.WithTimeout, fmt.Errorf, fmt.Sprintf, m.GetPool, pool.Exec, strings.Join, tag.RowsAffected]
func (m *PostgresManager) PostgresUpdate(serverID string, dbName string, schema string, table string, setCols []string, setVals []any, whereCols []string, whereVals []any) (int64, error) { ... }

// PostgresUpdateRolePassword 修改角色密码。
// Calls: [cancel, context.Background, context.WithTimeout, fmt.Sprintf, m.GetPool, pool.Exec, strings.ReplaceAll]
func (m *PostgresManager) PostgresUpdateRolePassword(serverID string, roleName string, newPassword string) error { ... }

// ResolveID 根据 serverID 或别名解析目标 PostgreSQL 连接 ID。
// Calls: [errors.New, fmt.Errorf, m.configs.Get, m.configs.Keys, m.configs.Range, strings.EqualFold, strings.TrimSpace]
func (m *PostgresManager) ResolveID(idOrName string) (string, error) { ... }

// PostgresQueryResult 表示 SQL 执行的统一输出结构。
type PostgresQueryResult struct {
	Columns []string `json:"columns"`
	ColumnTypes []string `json:"columnTypes"`
	Rows []map[string]any `json:"rows"`
	Affected int64 `json:"affected"`
	DurationMs int64 `json:"durationMs"`
	Error string `json:"error,omitempty"`
}

// PostgresSessionInfo 暴露给前端的 PostgreSQL 连接会话元数据。
type PostgresSessionInfo struct {
	ID string `json:"id"`
	ServerID string `json:"serverId"`
	Title string `json:"title"`
	Host string `json:"host"`
	Port int `json:"port"`
	Database string `json:"database"`
	Schema string `json:"schema"`
	Connected bool `json:"connected"`
}

// SqliteManager 按会话（连接）ID 维护已打开的 SQLite 文件。
type SqliteManager struct {
	mu sync.Mutex
	ctx context.Context
	conns map[string]*sqliteConn
}

// Calls: [c.db.Close, m.mu.Lock, m.mu.Unlock]
func (m *SqliteManager) Close(id string) { ... }

// Calls: [c.db.Close, m.mu.Lock, m.mu.Unlock]
func (m *SqliteManager) CloseAll() { ... }

// Calls: [m.mu.Lock, m.mu.Unlock]
func (m *SqliteManager) Get(id string) (*sqliteConn, bool) { ... }

// Calls: [m.mu.Lock, m.mu.Unlock]
func (m *SqliteManager) ListConnections() []map[string]any { ... }

// Open 打开（或重建）一个 SQLite 数据库文件连接。
// Calls: [db.Close, db.Ping, db.SetConnMaxLifetime, db.SetMaxOpenConns, errors.New, fmt.Errorf, m.mu.Lock, m.mu.Unlock, old.db.Close, os.Stat, sql.Open, strings.TrimSpace]
func (m *SqliteManager) Open(id string, path string) error { ... }

// Calls: [errors.New, fmt.Errorf, m.mu.Lock, m.mu.Unlock, strings.EqualFold, strings.TrimSpace]
func (m *SqliteManager) ResolveID(idOrPath string) (string, error) { ... }

func (m *SqliteManager) SetContext(ctx context.Context) { ... }

// SqliteClose 关闭 SQLite 连接。
// Calls: [m.Close]
func (m *SqliteManager) SqliteClose(id string) { ... }

// SqliteConnect 打开指定路径的 SQLite 文件。
// Calls: [m.Open]
func (m *SqliteManager) SqliteConnect(id string, path string) (bool, error) { ... }

// SqliteCount 返回表总行数。
// Calls: [fmt.Sprintf, fmt.Sscanf, int64, m.querySqlite, quoteSqliteIdent, string]
func (m *SqliteManager) SqliteCount(id string, table string) (int64, error) { ... }

// SqliteDescribe 返回表结构（列名、类型、可否为空、默认值、是否主键）。
// Calls: [errors.New, fmt.Sprintf, m.Get, mc.db.Query, quoteSqliteIdent, rows.Close, rows.Err, rows.Next, rows.Scan]
func (m *SqliteManager) SqliteDescribe(id string, table string) ([]map[string]any, error) { ... }

// SqliteIndexes 返回表的索引信息。
// Calls: [errors.New, fmt.Sprintf, m.Get, mc.db.Query, quoteSqliteIdent, rows.Close, rows.Err, rows.Next, rows.Scan]
func (m *SqliteManager) SqliteIndexes(id string, table string) ([]map[string]any, error) { ... }

// SqliteInfo 返回当前连接的基本信息：文件路径与大小。
// Calls: [errors.New, fi.Size, int64, m.Get, os.Stat]
func (m *SqliteManager) SqliteInfo(id string) (map[string]any, error) { ... }

// SqliteOpenFile 弹出系统文件选择框，返回选中的本地 SQLite 文件路径。
// Calls: [core.OpenFileDialog]
func (m *SqliteManager) SqliteOpenFile() (string, error) { ... }

// SqliteRun 执行任意 SQL：只读查询返回结果集，写操作返回影响行数。
// Calls: [errors.New, m.Get, m.querySqlite, mc.db.Exec, res.RowsAffected, sqliteIsReadQuery, strings.HasPrefix, strings.ToUpper, strings.TrimSpace]
func (m *SqliteManager) SqliteRun(id string, sqlText string) (map[string]any, error) { ... }

// SqliteSchema 返回所有表的列信息，供前端绘制 ER 图（外键作为关系）。
// Calls: [fkRows.Close, fkRows.Next, fkRows.Scan, fmt.Sprintf, m.Get, m.SqliteDescribe, m.SqliteTables, mc.db.Query, quoteSqliteIdent]
func (m *SqliteManager) SqliteSchema(id string) (map[string]any, error) { ... }

// SqliteSelect 返回表前 limit 行数据（分页）。
// Calls: [fmt.Sprintf, m.querySqlite, quoteSqliteIdent]
func (m *SqliteManager) SqliteSelect(id string, table string, limit int, offset int) (map[string]any, error) { ... }

// SqliteTables 返回数据库中的用户表与视图（排除 SQLite 内部表）。
// Calls: [errors.New, m.Get, mc.db.Query, rows.Close, rows.Err, rows.Next, rows.Scan]
func (m *SqliteManager) SqliteTables(id string) ([]map[string]any, error) { ... }

// querySqlite 执行查询并返回列名与行数据。
// Calls: [errors.New, m.Get, mc.db.Query, normalizeSqliteVal, res.Close, res.Columns, res.Err, res.Next, res.Scan]
func (m *SqliteManager) querySqlite(id string, sqlText string) (columns []string, rows []map[string]any, err error) { ... }

// ---- 扩展 mysqlConn：携带 SSH 隧道以便关闭时释放 ----
type mysqlConnEx struct {
	db *sql.DB
	cfg core.ServerConfig
	curDb string
	tunnel *sshTunnel
}

type pgSshTunnel struct {
	client *ssh.Client
	local string
	l net.Listener
}

// sqliteConn 保存一个本地 SQLite 文件连接。
type sqliteConn struct {
	db *sql.DB
	path string
}

// sshTunnel 维护一条到跳板机的 SSH 连接，并在本地监听端口转发到远端 MySQL。
type sshTunnel struct {
	client *ssh.Client
	// 本地监听地址 host:port
	local string
	l net.Listener
}

// Calls: [t.client.Close, t.l.Close]
func (t *sshTunnel) close() { ... }

```

#### Functions

```go
// MysqlSSHHostPortOr 返回 SSH 端口（0 时默认 22）。
func MysqlSSHHostPortOr(c core.ServerConfig) int { ... }

func NewMysqlManagerEx() *MysqlManagerEx { ... }

func NewPostgresManager() *PostgresManager { ... }

func NewSqliteManager() *SqliteManager { ... }

// QueryScalar 查询单行第一列的标量值（如 COUNT、VERSION、配置项等），直接返回强类型 T。
// Calls: [db.QueryRowContext, db.QueryRowContext().Scan]
func QueryScalar(ctx context.Context, db *sql.DB, query string, args ...any) (T, error) { ... }

// QuerySingleColumn 直接将 SQL 查询的第一列强类型扫描并装配为切片 []T，避免中间 map 分配与动态类型断言。
// Calls: [db.QueryContext, rows.Close, rows.Err, rows.Next, rows.Scan]
func QuerySingleColumn(ctx context.Context, db *sql.DB, query string, args ...any) ([]T, error) { ... }

// Calls: [fmt.Sprintf, string]
func asString(v any) string { ... }

// Calls: [errors.New, fmt.Sprintf, quoteIdent, strings.Contains, strings.ToUpper, strings.TrimSpace]
func buildExportQuery(source string, table string, sqlText string, limit int) (string, error) { ... }

// buildMysqlDSNExtended 构造完整 MySQL DSN，支持 SSL/TLS 与 SSH 隧道。
// Calls: [cfg.DisplayPort, fmt.Sprintf, openSSHTunnel, strings.Join, strings.TrimSpace]
func buildMysqlDSNExtended(cfg core.ServerConfig) (string, *sshTunnel, error) { ... }

// buildPgConnString 构造 PostgreSQL 连接 URL。
// Calls: [fmt.Sprintf, url.PathEscape, url.QueryEscape]
func buildPgConnString(cfg core.ServerConfig, targetHost string, targetPort int, dbName string) string { ... }

// Calls: [fmt.Sprint, string, strings.ReplaceAll, t.Format]
func formatSQLValue(v any) string { ... }

// isPgReadQuery 判断是否为查询类语句。
// Calls: [strings.HasPrefix, strings.ToUpper, strings.TrimSpace]
func isPgReadQuery(sql string) bool { ... }

// Calls: [strings.HasPrefix, strings.Index, strings.ToUpper, strings.TrimSpace]
func isReadQuery(sql string) bool { ... }

// Calls: [a.DisplayPort, b.DisplayPort]
func isSameMysqlConfig(a core.ServerConfig, b core.ServerConfig) bool { ... }

// normalizeMysqlVal 将数据库驱动原生值转换为前端友好的类型。
// Calls: [string, t.Format]
func normalizeMysqlVal(v any) any { ... }

// normalizePgVal 转换 PostgreSQL 数据值为前端 JSON 安全格式。
// Calls: [string, t.Format, t.String]
func normalizePgVal(v any) any { ... }

// normalizeSqliteVal 将驱动原生值转换为前端友好的类型。
// Calls: [string, t.Format]
func normalizeSqliteVal(v any) any { ... }

// openPgSSHTunnel 为 PostgreSQL 连接创建 SSH 端口转发隧道。
// Calls: [c.Close, fmt.Errorf, fmt.Sprintf, io.Copy, listener.Accept, listener.Addr, listener.Addr().String, net.Listen, os.ReadFile, remoteConn.Close, ssh.Dial, ssh.InsecureIgnoreHostKey, ssh.ParsePrivateKeyWithPassphrase, ssh.Password, ssh.PublicKeys, sshClient.Close, sshClient.Dial, strings.TrimSpace]
func openPgSSHTunnel(cfg core.ServerConfig, target string) (*pgSshTunnel, error) { ... }

// openSSHTunnel 建立到跳板机的 SSH 连接，并在本地开启转发到 target(host:port)。
// Calls: [MysqlSSHHostPortOr, c.Close, fmt.Errorf, fmt.Sprintf, io.Copy, listener.Accept, listener.Addr, listener.Addr().String, net.Listen, os.ReadFile, remoteConn.Close, ssh.Dial, ssh.InsecureIgnoreHostKey, ssh.ParsePrivateKeyWithPassphrase, ssh.Password, ssh.PublicKeys, sshClient.Close, sshClient.Dial, strings.TrimSpace]
func openSSHTunnel(cfg core.ServerConfig, target string) (*sshTunnel, error) { ... }

// Calls: [db.Query, normalizeMysqlVal, res.Close, res.Columns, res.Err, res.Next, res.Scan]
func queryRaw(db *sql.DB, sqlText string) ([]map[string]any, error) { ... }

// Calls: [strings.ReplaceAll]
func quoteIdent(s string) string { ... }

// Calls: [strings.ReplaceAll]
func quoteLiteral(s string) string { ... }

// Calls: [strings.ReplaceAll]
func quoteSqliteIdent(name string) string { ... }

// Calls: [strings.ReplaceAll]
func quoteString(s string) string { ... }

// Calls: [fmt.Sprintf, quoteLiteral]
func quoteUserHost(user string, host string) string { ... }

// Calls: [current.Reset, current.String, current.WriteByte, current.WriteString, strings.HasPrefix, strings.HasSuffix, strings.Split, strings.TrimSpace]
func splitSQLStatements(sqlText string) []string { ... }

// Calls: [fmt.Sprint, string]
func sqliteAsString(v any) string { ... }

// Calls: [strings.HasPrefix, strings.ToUpper, strings.TrimLeft, strings.TrimSpace]
func sqliteIsReadQuery(s string) bool { ... }

func truncateStr(s string, maxLen int) string { ... }

```

---

### Package `docker` (`docker`)

- **Imports (34):** `bytes`, `context`, `crypto/sha256`, `crypto/tls`, `crypto/x509`, `encoding/base64`, `encoding/hex`, `encoding/json`, `errors`, `fmt`, `github.com/docker/docker/api/types/container`, `github.com/docker/docker/api/types/filters`, `github.com/docker/docker/api/types/image`, `github.com/docker/docker/api/types/mount`, `github.com/docker/docker/api/types/network`, `github.com/docker/docker/api/types/volume`, `github.com/docker/docker/client`, `github.com/docker/docker/pkg/stdcopy`, `github.com/docker/go-connections/nat`, `github.com/google/uuid`, `golang.org/x/crypto/ssh`, `gopkg.in/yaml.v3`, `io`, `net`, `net/http`, `os`, `regexp`, `runtime`, `sort`, `strconv`, `strings`, `sync`, `terminal/core`, `time`

#### Constants & Variables

```go
const composeProjectLabel = "com.docker.compose.project"
const composeServiceLabel = "com.docker.compose.service"
const composeVersionLabel = "com.docker.compose.version"
const composeConfigHash = "com.docker.compose.config-hash"
const composeOneOffLabel = "com.docker.compose.oneoff"
const composeNumberLabel = "com.docker.compose.container-number"
const composeImageLabel = "com.docker.compose.image"
const composeNetworkLabel = "com.docker.compose.network"
const composeVolumeLabel = "com.docker.compose.volume"
const composeWorkingDir = "com.docker.compose.project.working_dir"
const composeConfigFiles = "com.docker.compose.project.config_files"
const terminalComposeIDLabel = "terminal.compose.id"
```

#### Structs & Methods

```go
// ComposeFileSpec 定义 docker-compose.yml 的数据结构。
type ComposeFileSpec struct {
	Version string `yaml:"version"`
	Services map[string]ComposeServiceSpec `yaml:"services"`
	Networks map[string]ComposeNetworkSpec `yaml:"networks"`
	Volumes map[string]ComposeVolumeSpec `yaml:"volumes"`
}

// ComposeHealthCheckSpec 定义服务的健康检查。
type ComposeHealthCheckSpec struct {
	Test any `yaml:"test"`
	Interval string `yaml:"interval"`
	Timeout string `yaml:"timeout"`
	Retries int `yaml:"retries"`
	StartPeriod string `yaml:"start_period"`
	Disable bool `yaml:"disable"`
}

// ComposeLoggingSpec 定义日志配置。
type ComposeLoggingSpec struct {
	Driver string `yaml:"driver"`
	Options map[string]string `yaml:"options"`
}

// ComposeNetworkSpec 定义网络配置。
type ComposeNetworkSpec struct {
	Driver string `yaml:"driver"`
	External bool `yaml:"external"`
	Name string `yaml:"name"`
	Labels map[string]string `yaml:"labels"`
	Attachable bool `yaml:"attachable"`
}

// ComposeServiceSpec 定义单个服务的配置。
type ComposeServiceSpec struct {
	Image string `yaml:"image"`
	ContainerName string `yaml:"container_name"`
	Command any `yaml:"command"`
	Entrypoint any `yaml:"entrypoint"`
	Environment any `yaml:"environment"`
	Ports any `yaml:"ports"`
	Expose []string `yaml:"expose"`
	Volumes any `yaml:"volumes"`
	Networks any `yaml:"networks"`
	Restart string `yaml:"restart"`
	DependsOn any `yaml:"depends_on"`
	Labels map[string]string `yaml:"labels"`
	WorkingDir string `yaml:"working_dir"`
	User string `yaml:"user"`
	Privileged bool `yaml:"privileged"`
	Hostname string `yaml:"hostname"`
	NetworkMode string `yaml:"network_mode"`
	DNS any `yaml:"dns"`
	ExtraHosts []string `yaml:"extra_hosts"`
	Healthcheck *ComposeHealthCheckSpec `yaml:"healthcheck"`
	ShmSize any `yaml:"shm_size"`
	CapAdd []string `yaml:"cap_add"`
	CapDrop []string `yaml:"cap_drop"`
	Sysctls any `yaml:"sysctls"`
	Logging *ComposeLoggingSpec `yaml:"logging"`
	StopSignal string `yaml:"stop_signal"`
	StopGracePeriod any `yaml:"stop_grace_period"`
	Tty bool `yaml:"tty"`
	StdinOpen bool `yaml:"stdin_open"`
}

// ComposeVolumeSpec 定义数据卷配置。
type ComposeVolumeSpec struct {
	Driver string `yaml:"driver"`
	External bool `yaml:"external"`
	Name string `yaml:"name"`
	Labels map[string]string `yaml:"labels"`
}

// DockerClient 封装基于 Docker 官方 SDK 的客户端实例及底层连接。
type DockerClient struct {
	cfg core.ServerConfig
	cli *client.Client
	sshConn *ssh.Client
	mu sync.RWMutex
	closed bool
	targetInfo string
}

// Close 释放 Docker 客户端及底层 SSH 隧道。
// Calls: [d.cli.Close, d.mu.Lock, d.mu.Unlock, d.sshConn.Close]
func (d *DockerClient) Close() error { ... }

// ControlComposeStack 控制 Compose 项目的生命周期（start, stop, restart, down, remove）。
// Calls: [d.cli.ContainerList, d.cli.ContainerRemove, d.cli.ContainerRestart, d.cli.ContainerStart, d.cli.ContainerStop, d.cli.NetworkList, d.cli.NetworkRemove, fmt.Errorf, sanitizeProjectName]
func (d *DockerClient) ControlComposeStack(ctx context.Context, projectName string, action string) error { ... }

// CreateContainer 创建容器。
// Calls: [container.NetworkMode, container.RestartPolicyMode, d.cli.ContainerCreate]
func (d *DockerClient) CreateContainer(ctx context.Context, req DockerCreateContainerReq) (string, error) { ... }

// CreateNetwork 创建网络。
// Calls: [d.cli.NetworkCreate]
func (d *DockerClient) CreateNetwork(ctx context.Context, name string, driver string) (string, error) { ... }

// CreateVolume 创建数据卷。
// Calls: [d.cli.VolumeCreate]
func (d *DockerClient) CreateVolume(ctx context.Context, name string, driver string, labels map[string]string) (*DockerVolumeInfo, error) { ... }

// DeployComposeStack 兼容旧接口，内部调用 UpComposeStack 实现部署与智能更新。
// Calls: [d.UpComposeStack]
func (d *DockerClient) DeployComposeStack(ctx context.Context, req DockerComposeDeployReq) error { ... }

// ExecStream 在指定容器内部执行命令并实时流式回调输出，返回 (exitCode, error)。
// Calls: [attachResp.Close, d.cli.ContainerExecAttach, d.cli.ContainerExecCreate, d.cli.ContainerExecInspect, d.mu.RLock, d.mu.RUnlock, errors.New, fmt.Errorf, stdcopy.StdCopy]
func (d *DockerClient) ExecStream(ctx context.Context, containerID string, cmd []string, workingDir string, user string, onChunk func(chunk string)) (int, error) { ... }

// GetComposeStack 获取特定 Compose 项目的详细信息。
// Calls: [d.ListComposeStacks, fmt.Errorf]
func (d *DockerClient) GetComposeStack(ctx context.Context, projectName string) (*DockerComposeStackInfo, error) { ... }

// GetComposeStackLogs 聚合获取项目下所有容器的运行日志。
// Calls: [combinedLogs.String, combinedLogs.WriteString, d.cli.ContainerList, d.cli.ContainerLogs, filters.Arg, filters.NewArgs, fmt.Sprintf, io.ReadAll, reader.Close, sanitizeProjectName, strconv.Itoa, string, strings.Split, strings.TrimPrefix, strings.TrimSpace]
func (d *DockerClient) GetComposeStackLogs(ctx context.Context, projectName string, tail int) (string, error) { ... }

// GetContainerLogs 获取容器日志。
// Calls: [buf.String, buf.Write, d.cli.ContainerLogs, int, io.ReadAll, reader.Close, strconv.Itoa]
func (d *DockerClient) GetContainerLogs(ctx context.Context, id string, tail int, timestamps bool) (string, error) { ... }

// GetOverview 获取系统概览。
// Calls: [d.ListComposeStacks, d.cli.Info, d.cli.NetworkList, d.cli.ServerVersion, d.cli.VolumeList, fmt.Errorf]
func (d *DockerClient) GetOverview(ctx context.Context) (*DockerOverview, error) { ... }

// InspectContainer 查看容器 JSON 详情。
// Calls: [d.cli.ContainerInspect, json.MarshalIndent, string]
func (d *DockerClient) InspectContainer(ctx context.Context, id string) (string, error) { ... }

// InspectImage 查看镜像详情。
// Calls: [d.cli.ImageInspectWithRaw, json.MarshalIndent, string]
func (d *DockerClient) InspectImage(ctx context.Context, id string) (string, error) { ... }

// ListComposeStacks 获取所有识别到的 Compose 项目。
// Calls: [d.cli.ContainerList, fmt.Errorf, fmt.Sprintf, sort.Slice, strings.Join, strings.TrimPrefix, time.Unix, time.Unix().Format]
func (d *DockerClient) ListComposeStacks(ctx context.Context) ([]DockerComposeStackInfo, error) { ... }

// ListContainers 获取容器列表。
// Calls: [d.cli.ContainerList, fmt.Sprintf, strings.Join, strings.TrimPrefix]
func (d *DockerClient) ListContainers(ctx context.Context, all bool) ([]DockerContainerInfo, error) { ... }

// ListImages 获取镜像列表。
// Calls: [d.cli.ImageList, formatBytes, strings.Join, strings.Split, strings.TrimPrefix]
func (d *DockerClient) ListImages(ctx context.Context) ([]DockerImageInfo, error) { ... }

// ListNetworks 获取网络列表。
// Calls: [d.cli.NetworkList, fmt.Sprintf]
func (d *DockerClient) ListNetworks(ctx context.Context) ([]DockerNetworkInfo, error) { ... }

// ListVolumes 获取数据卷列表。
// Calls: [d.cli.VolumeList]
func (d *DockerClient) ListVolumes(ctx context.Context) ([]DockerVolumeInfo, error) { ... }

// LoadImage 从本地 tar 文件导入/加载镜像。
// Calls: [client.ImageLoadWithQuiet, d.cli.ImageLoad, d.mu.RLock, d.mu.RUnlock, errors.New, file.Close, fmt.Errorf, io.ReadAll, os.Open, resp.Body.Close, string]
func (d *DockerClient) LoadImage(ctx context.Context, srcFilePath string, quiet bool) (string, error) { ... }

// PauseContainer 暂停容器。
// Calls: [d.cli.ContainerPause]
func (d *DockerClient) PauseContainer(ctx context.Context, id string) error { ... }

// Ping 测试连通性。
// Calls: [d.cli.Ping]
func (d *DockerClient) Ping(ctx context.Context) (string, error) { ... }

// PullImage 拉取镜像。
// Calls: [buf.String, buf.WriteString, d.cli.ImagePull, dec.Decode, dec.More, fmt.Errorf, fmt.Sprintf, json.NewDecoder, reader.Close]
func (d *DockerClient) PullImage(ctx context.Context, imageName string) (string, error) { ... }

// RemoveContainer 删除容器。
// Calls: [d.cli.ContainerRemove]
func (d *DockerClient) RemoveContainer(ctx context.Context, id string, force bool) error { ... }

// RemoveImage 删除镜像。
// Calls: [d.cli.ImageRemove]
func (d *DockerClient) RemoveImage(ctx context.Context, id string, force bool) error { ... }

// RemoveNetwork 删除网络。
// Calls: [d.cli.NetworkRemove]
func (d *DockerClient) RemoveNetwork(ctx context.Context, id string) error { ... }

// RemoveVolume 删除数据卷。
// Calls: [d.cli.VolumeRemove]
func (d *DockerClient) RemoveVolume(ctx context.Context, name string, force bool) error { ... }

// RestartContainer 重启容器。
// Calls: [d.cli.ContainerRestart]
func (d *DockerClient) RestartContainer(ctx context.Context, id string) error { ... }

// SaveImage 导出/下载指定镜像为本地 tar 文件。
// Calls: [d.cli.ImageSave, d.mu.RLock, d.mu.RUnlock, errors.New, fmt.Errorf, io.Copy, os.Create, outFile.Close, reader.Close]
func (d *DockerClient) SaveImage(ctx context.Context, imageIDs []string, destFilePath string) error { ... }

// StartContainer 启动容器。
// Calls: [d.cli.ContainerStart]
func (d *DockerClient) StartContainer(ctx context.Context, id string) error { ... }

// StopContainer 停止容器。
// Calls: [d.cli.ContainerStop]
func (d *DockerClient) StopContainer(ctx context.Context, id string) error { ... }

// SystemPrune 执行清理操作。
// Calls: [d.cli.ContainersPrune, d.cli.ImagesPrune, d.cli.NetworksPrune, d.cli.VolumesPrune, formatBytes, int64]
func (d *DockerClient) SystemPrune(ctx context.Context, pruneContainers bool, pruneImages bool, pruneVolumes bool, pruneNetworks bool) (*DockerPruneReport, error) { ... }

// UnpauseContainer 恢复容器。
// Calls: [d.cli.ContainerUnpause]
func (d *DockerClient) UnpauseContainer(ctx context.Context, id string) error { ... }

// UpComposeStack 解析 YAML 并遵循官方 docker compose up 规范智能增量更新创建/启动项目。
// Calls: [computeServiceConfigHash, container.NetworkMode, context.Background, d.PullImage, d.cli.ContainerCreate, d.cli.ContainerList, d.cli.ContainerRemove, d.cli.ContainerStart, d.cli.ContainerStop, d.cli.NetworkConnect, d.cli.NetworkRemove, d.cli.VolumeCreate, d.ensureNetwork, d.findContainerByName, d.hasLocalImage, d.waitForDependencies, fmt.Errorf, fmt.Sprintf, interpolateEnv, nat.NewPort, parseComposeEnv, parseComposePorts, parseComposeVolumes, parseHealthCheck, parseShmSize, parseStringSliceOrString, resolveServiceNetworks, sanitizeImageName, sanitizeProjectName, sortServicesByDependencies, strings.HasPrefix, strings.ToLower, yaml.Unmarshal]
func (d *DockerClient) UpComposeStack(ctx context.Context, req DockerComposeDeployReq) (retErr error) { ... }

// Calls: [d.cli.NetworkCreate, d.cli.NetworkList, filters.Arg, filters.NewArgs, fmt.Sprintf, regexp.QuoteMeta]
func (d *DockerClient) ensureNetwork(ctx context.Context, netName string, driver string, labels map[string]string) (string, error) { ... }

// Calls: [d.cli.ContainerList, strings.TrimPrefix]
func (d *DockerClient) findContainerByName(ctx context.Context, name string) (string, error) { ... }

// Calls: [d.cli.ImageInspectWithRaw]
func (d *DockerClient) hasLocalImage(ctx context.Context, imageName string) bool { ... }

// Calls: [d.cli.ContainerInspect, time.Now, time.Now().Add, time.Now().Before, time.Sleep]
func (d *DockerClient) waitForDependencies(ctx context.Context, serviceName string, dependsOn any, createdContainers map[string]string) error { ... }

// DockerComposeDeployReq 用于创建或更新 Compose 项目。
type DockerComposeDeployReq struct {
	// 客户端生成的 UUID
	ID string `json:"id,omitempty"`
	ProjectName string `json:"projectName"`
	YamlContent string `json:"yamlContent"`
	EnvVars map[string]string `json:"envVars"`
	ForcePull bool `json:"forcePull"`
	Recreate bool `json:"recreate"`
}

// DockerComposeServiceInfo 表示 Stack 内单个服务的运行状态。
type DockerComposeServiceInfo struct {
	ServiceName string `json:"serviceName"`
	ContainerID string `json:"containerId"`
	ShortID string `json:"shortId"`
	ContainerName string `json:"containerName"`
	Image string `json:"image"`
	// running, exited, paused, dead
	State string `json:"state"`
	Status string `json:"status"`
	Ports string `json:"ports"`
	Health string `json:"health"`
}

// DockerComposeStackInfo 表示一个 Compose 项目（Stack）的聚合状态信息。
type DockerComposeStackInfo struct {
	// 客户端关联的本地 UUID
	UUID string `json:"uuid,omitempty"`
	Name string `json:"name"`
	// running, partially_running, stopped
	Status string `json:"status"`
	RunningServices int `json:"runningServices"`
	TotalServices int `json:"totalServices"`
	Services []DockerComposeServiceInfo `json:"services"`
	ConfigFiles string `json:"configFiles"`
	YamlContent string `json:"yamlContent"`
	CreatedAt string `json:"createdAt"`
}

// DockerContainerInfo 描述容器信息。
type DockerContainerInfo struct {
	ID string `json:"id"`
	ShortID string `json:"shortId"`
	Names []string `json:"names"`
	Name string `json:"name"`
	Image string `json:"image"`
	ImageID string `json:"imageId"`
	Command string `json:"command"`
	Created int64 `json:"created"`
	// running | exited | paused | restarting | created | dead
	State string `json:"state"`
	// e.g. "Up 2 hours", "Exited (0) 5 minutes ago"
	Status string `json:"status"`
	Ports []DockerPortMapping `json:"ports"`
	PortStr string `json:"portStr"`
	IPAddress string `json:"ipAddress"`
	SizeRw int64 `json:"sizeRw,omitempty"`
	SizeRootFs int64 `json:"sizeRootFs,omitempty"`
	Labels map[string]string `json:"labels,omitempty"`
}

// DockerCreateContainerReq 创建容器参数。
type DockerCreateContainerReq struct {
	Name string `json:"name"`
	Image string `json:"image"`
	Cmd []string `json:"cmd,omitempty"`
	Env []string `json:"env,omitempty"`
	// e.g. "8080:80", "5432:5432/tcp"
	Ports []string `json:"ports,omitempty"`
	// e.g. "/host/data:/container/data", "vol_name:/app"
	Volumes []string `json:"volumes,omitempty"`
	// no | always | unless-stopped | on-failure
	RestartPolicy string `json:"restartPolicy,omitempty"`
	AutoRemove bool `json:"autoRemove,omitempty"`
	// bridge | host | none | custom
	NetworkMode string `json:"networkMode,omitempty"`
	// MB
	MemoryLimit int64 `json:"memoryLimit,omitempty"`
	CPUShares int64 `json:"cpuShares,omitempty"`
	Labels map[string]string `json:"labels,omitempty"`
}

// DockerExecManager 管理全局 Docker 容器终端交互会话。
type DockerExecManager struct {
	sessions map[string]*DockerExecSession
	mu sync.RWMutex
}

// Close 关闭指定终端会话。
// Calls: [m.mu.Lock, m.mu.Unlock, s.Close]
func (m *DockerExecManager) Close(sessionID string) error { ... }

// CloseAll 关闭所有终端会话。
// Calls: [m.mu.Lock, m.mu.Unlock, s.Close]
func (m *DockerExecManager) CloseAll() { ... }

// Resize 调整终端行列尺寸。
// Calls: [context.Background, dockerCli.cli.ContainerExecResize, errors.New, m.mu.RLock, m.mu.RUnlock, uint]
func (m *DockerExecManager) Resize(dockerCli *DockerClient, sessionID string, cols int, rows int) error { ... }

// StartExec 启动一个容器交互终端会话。
// Calls: [attachResp.Reader.Read, base64.StdEncoding.EncodeToString, cancel, context.Background, context.WithCancel, core.EmitEvent, dockerCli.cli.ContainerExecAttach, dockerCli.cli.ContainerExecCreate, dockerCli.cli.ContainerExecResize, errors.New, fmt.Errorf, m.mu.Lock, m.mu.Unlock, m.remove, session.Close, strings.TrimSpace, time.Sleep, uint, uuid.New, uuid.New().String]
func (m *DockerExecManager) StartExec(dockerCli *DockerClient, containerID string, command string, cols int, rows int) (string, error) { ... }

// Write 写入终端输入数据。
// Calls: [errors.New, m.mu.RLock, m.mu.RUnlock, s.Write]
func (m *DockerExecManager) Write(sessionID string, data string) error { ... }

// Calls: [m.mu.Lock, m.mu.Unlock]
func (m *DockerExecManager) remove(sessionID string) { ... }

// DockerExecSession 维护单个 Docker 容器的交互式 TTY 终端执行会话。
type DockerExecSession struct {
	id string
	serverID string
	containerID string
	execID string
	conn net.Conn
	cancel context.CancelFunc
	closed bool
	closeOnce sync.Once
	mu sync.Mutex
}

// Close 关闭终端会话并释放连接与上下文。
// Calls: [s.cancel, s.closeOnce.Do, s.conn.Close, s.mu.Lock, s.mu.Unlock]
func (s *DockerExecSession) Close() error { ... }

// Write 写入用户输入的终端字符数据。
// Calls: [errors.New, s.conn.Write, s.mu.Lock, s.mu.Unlock]
func (s *DockerExecSession) Write(data string) error { ... }

// DockerImageInfo 描述镜像信息。
type DockerImageInfo struct {
	ID string `json:"id"`
	ShortID string `json:"shortId"`
	RepoTags []string `json:"repoTags"`
	Repository string `json:"repository"`
	Tag string `json:"tag"`
	Size int64 `json:"size"`
	SizeStr string `json:"sizeStr"`
	Created int64 `json:"created"`
	Containers int64 `json:"containers"`
	Labels map[string]string `json:"labels,omitempty"`
}

// DockerManager 管理 Docker 客户端连接生命周期。
type DockerManager struct {
	ctx context.Context
	clients map[string]*DockerClient
	configs map[string]core.ServerConfig
	ExecMgr *DockerExecManager
	mu sync.RWMutex
}

// CloseAll 关闭所有活动连接。
// Calls: [cli.Close, m.ExecMgr.CloseAll, m.mu.Lock, m.mu.Unlock]
func (m *DockerManager) CloseAll() { ... }

// Connect 建立或复用指定 serverID 的 Docker 连接。
// Calls: [NewDockerClient, m.mu.Lock, m.mu.Unlock]
func (m *DockerManager) Connect(cfg core.ServerConfig) (*DockerClient, error) { ... }

// Disconnect 关闭并移除连接。
// Calls: [cli.Close, m.mu.Lock, m.mu.Unlock]
func (m *DockerManager) Disconnect(serverID string) error { ... }

// GetClient 获取已连接的客户端。
// Calls: [fmt.Errorf, m.mu.RLock, m.mu.RUnlock]
func (m *DockerManager) GetClient(serverID string) (*DockerClient, error) { ... }

// ListConnections 列出当前所有已建立连接的 Docker 实例与端点信息。
// Calls: [m.mu.RLock, m.mu.RUnlock]
func (m *DockerManager) ListConnections() []map[string]any { ... }

// ResolveID 根据 serverID 或别名解析目标 Docker 连接 ID。
// Calls: [errors.New, fmt.Errorf, m.mu.RLock, m.mu.RUnlock, strings.EqualFold, strings.TrimSpace]
func (m *DockerManager) ResolveID(idOrName string) (string, error) { ... }

// SetContext 设置上下文。
func (m *DockerManager) SetContext(ctx context.Context) { ... }

// DockerNetworkInfo 描述网络信息。
type DockerNetworkInfo struct {
	ID string `json:"id"`
	ShortID string `json:"shortId"`
	Name string `json:"name"`
	Driver string `json:"driver"`
	Scope string `json:"scope"`
	Internal bool `json:"internal"`
	EnableIPv6 bool `json:"enableIPv6"`
	Subnet string `json:"subnet"`
	Gateway string `json:"gateway"`
	// containerID -> name/ip
	Containers map[string]string `json:"containers,omitempty"`
	Labels map[string]string `json:"labels,omitempty"`
}

// DockerOverview 描述 Docker 守护进程与系统概览信息。
type DockerOverview struct {
	Connected bool `json:"connected"`
	ServerVersion string `json:"serverVersion"`
	APIVersion string `json:"apiVersion"`
	OS string `json:"os"`
	Arch string `json:"arch"`
	KernelVersion string `json:"kernelVersion"`
	OperatingSystem string `json:"operatingSystem"`
	NCPU int `json:"ncpu"`
	MemTotal int64 `json:"memTotal"`
	ContainersTotal int `json:"containersTotal"`
	ContainersRunning int `json:"containersRunning"`
	ContainersPaused int `json:"containersPaused"`
	ContainersStopped int `json:"containersStopped"`
	ImagesTotal int `json:"imagesTotal"`
	ComposeTotal int `json:"composeTotal"`
	VolumesTotal int `json:"volumesTotal"`
	NetworksTotal int `json:"networksTotal"`
	DockerRootDir string `json:"dockerRootDir"`
	StorageDriver string `json:"storageDriver"`
	EndpointType string `json:"endpointType"`
	EndpointTarget string `json:"endpointTarget"`
}

// DockerPortMapping 端口映射。
type DockerPortMapping struct {
	IP string `json:"ip,omitempty"`
	PrivatePort uint16 `json:"privatePort"`
	PublicPort uint16 `json:"publicPort,omitempty"`
	// tcp | udp
	Type string `json:"type"`
}

// DockerPruneReport 清理结果报告。
type DockerPruneReport struct {
	ContainersDeleted []string `json:"containersDeleted"`
	ImagesDeleted []string `json:"imagesDeleted"`
	VolumesDeleted []string `json:"volumesDeleted"`
	NetworksDeleted []string `json:"networksDeleted"`
	SpaceReclaimed uint64 `json:"spaceReclaimed"`
	SpaceReclaimedStr string `json:"spaceReclaimedStr"`
}

// DockerVolumeInfo 描述数据卷信息。
type DockerVolumeInfo struct {
	Name string `json:"name"`
	Driver string `json:"driver"`
	Scope string `json:"scope"`
	Mountpoint string `json:"mountpoint"`
	CreatedAt string `json:"createdAt"`
	Labels map[string]string `json:"labels,omitempty"`
	Size int64 `json:"size,omitempty"`
	RefCount int64 `json:"refCount,omitempty"`
}

type serviceNetworkAttachment struct {
	NetworkID string
	Aliases []string
	IPv4Address string
}

type sshCommandConn struct {
	session *ssh.Session
	stdin io.WriteCloser
	stdout io.Reader
}

// Calls: [c.session.Close, c.stdin.Close]
func (c *sshCommandConn) Close() error { ... }

func (c *sshCommandConn) LocalAddr() net.Addr { ... }

// Calls: [c.stdout.Read]
func (c *sshCommandConn) Read(b []byte) (int, error) { ... }

func (c *sshCommandConn) RemoteAddr() net.Addr { ... }

func (c *sshCommandConn) SetDeadline(t time.Time) error { ... }

func (c *sshCommandConn) SetReadDeadline(t time.Time) error { ... }

func (c *sshCommandConn) SetWriteDeadline(t time.Time) error { ... }

// Calls: [c.stdin.Write]
func (c *sshCommandConn) Write(b []byte) (int, error) { ... }

type streamChunkWriter struct {
	onChunk func(chunk string)
}

// Calls: [string, w.onChunk]
func (w *streamChunkWriter) Write(p []byte) (n int, err error) { ... }

```

#### Functions

```go
// NewDockerClient 根据 ServerConfig 初始化 Docker 官方 SDK 客户端。
// Calls: [buildSSHAuth, buildTLSConfig, cancel, cli.Ping, client.NewClientWithOpts, client.WithAPIVersionNegotiation, client.WithDialContext, client.WithHTTPClient, client.WithHost, context.Background, context.WithTimeout, d.Close, d.sshConn.Close, dialRemoteDocker, fmt.Errorf, fmt.Sprintf, ssh.Dial, ssh.InsecureIgnoreHostKey, strings.HasPrefix, strings.ToLower, strings.TrimSpace]
func NewDockerClient(cfg core.ServerConfig) (*DockerClient, error) { ... }

// NewDockerExecManager 创建 DockerExecManager。
func NewDockerExecManager() *DockerExecManager { ... }

// NewDockerManager 创建 DockerManager 实例。
// Calls: [NewDockerExecManager]
func NewDockerManager() *DockerManager { ... }

// Calls: [fmt.Errorf, loadPEMOrFile, os.ReadFile, ssh.ParsePrivateKey, ssh.ParsePrivateKeyWithPassphrase, ssh.Password, ssh.PublicKeys]
func buildSSHAuth(cfg core.ServerConfig) ([]ssh.AuthMethod, error) { ... }

// Calls: [fmt.Errorf, loadPEMOrFile, pool.AppendCertsFromPEM, tls.X509KeyPair, x509.NewCertPool]
func buildTLSConfig(cfg core.ServerConfig) (*tls.Config, error) { ... }

// Calls: [hex.EncodeToString, json.Marshal, sha256.Sum256]
func computeServiceConfigHash(svc ComposeServiceSpec) string { ... }

// Calls: [fmt.Errorf, fmt.Sprintf, sess.Close, sess.Start, sess.StdinPipe, sess.StdoutPipe, sshClient.Dial, sshClient.NewSession]
func dialRemoteDocker(sshClient *ssh.Client, remoteSocket string) (net.Conn, error) { ... }

// Calls: [float64, fmt.Sprintf, int64]
func formatBytes(b int64) string { ... }

// Calls: [os.Environ, re.FindStringSubmatch, re.ReplaceAllStringFunc, reSimple.ReplaceAllStringFunc, regexp.MustCompile, strings.ReplaceAll, strings.SplitN]
func interpolateEnv(content string, envVars map[string]string) string { ... }

// Calls: [os.ReadFile, strings.Contains, strings.TrimSpace]
func loadPEMOrFile(str string) ([]byte, error) { ... }

// Calls: [fmt.Sprintf]
func parseComposeEnv(env any) []string { ... }

// Calls: [fmt.Sprintf, nat.NewPort, strings.Contains, strings.Split, strings.TrimSpace]
func parseComposePorts(ports any) (nat.PortMap, nat.PortSet, error) { ... }

// Calls: [fmt.Sprintf, strings.Contains, strings.HasPrefix, strings.Split, strings.TrimSpace]
func parseComposeVolumes(projectName string, vols any, topVolumes map[string]ComposeVolumeSpec) ([]mount.Mount, []string) { ... }

// Calls: [parseStringSliceOrString, time.ParseDuration]
func parseHealthCheck(spec *ComposeHealthCheckSpec) *container.HealthConfig { ... }

// Calls: [int64, strconv.ParseInt, strings.HasSuffix, strings.ToLower, strings.TrimRight, strings.TrimSpace]
func parseShmSize(val any) int64 { ... }

func parseStringSliceOrMap(input any) []string { ... }

// Calls: [strings.Fields]
func parseStringSliceOrString(input any) []string { ... }

// Calls: [fmt.Sprintf]
func resolveServiceNetworks(projectName string, networks any, networkMap map[string]string) []serviceNetworkAttachment { ... }

// Calls: [strings.HasSuffix, strings.Trim, strings.TrimPrefix, strings.TrimSpace, strings.TrimSuffix]
func sanitizeImageName(image string) string { ... }

// Calls: [re.ReplaceAllString, regexp.MustCompile, strings.ToLower, strings.TrimSpace]
func sanitizeProjectName(name string) string { ... }

// Calls: [fmt.Errorf, parseStringSliceOrMap, visit]
func sortServicesByDependencies(services map[string]ComposeServiceSpec) ([]string, error) { ... }

```

---

### Package `k8s` (`k8s`)

- **Imports (33):** `context`, `encoding/base64`, `encoding/json`, `errors`, `fmt`, `github.com/google/uuid`, `golang.org/x/crypto/ssh`, `gopkg.in/yaml.v3`, `io`, `k8s.io/api/core/v1`, `k8s.io/apimachinery/pkg/api/errors`, `k8s.io/apimachinery/pkg/api/meta`, `k8s.io/apimachinery/pkg/apis/meta/v1`, `k8s.io/apimachinery/pkg/apis/meta/v1/unstructured`, `k8s.io/apimachinery/pkg/types`, `k8s.io/apimachinery/pkg/util/yaml`, `k8s.io/client-go/discovery`, `k8s.io/client-go/discovery/cached/memory`, `k8s.io/client-go/dynamic`, `k8s.io/client-go/kubernetes`, `k8s.io/client-go/kubernetes/scheme`, `k8s.io/client-go/rest`, `k8s.io/client-go/restmapper`, `k8s.io/client-go/tools/clientcmd`, `k8s.io/client-go/tools/clientcmd/api`, `k8s.io/client-go/tools/remotecommand`, `net`, `os`, `sort`, `strings`, `sync`, `terminal/core`, `time`

#### Structs & Methods

```go
// K8sApplyResult 描述 YAML 部署单个资源的结果。
type K8sApplyResult struct {
	Kind string `json:"kind"`
	Name string `json:"name"`
	Namespace string `json:"namespace,omitempty"`
	// "created" | "configured" | "failed"
	Action string `json:"action"`
	Message string `json:"message,omitempty"`
}

// K8sClient 封装基于 client-go 的 Kubernetes 客户端。
type K8sClient struct {
	cfg core.ServerConfig
	restConfig *rest.Config
	clientset *kubernetes.Clientset
	sshClient *ssh.Client
	targetInfo string
	mu sync.RWMutex
}

// ApplyYAML 解析并声明式部署 YAML 清单中的所有资源（支持多文档 --- 分隔）。
// Calls: [appliedObj.GetName, appliedObj.GetNamespace, createErr.Error, decoder.Decode, discovery.NewDiscoveryClientForConfig, dri.Create, dri.Get, dri.Patch, dri.Update, dynClient.Resource, dynClient.Resource().Namespace, dynamic.NewForConfig, existing.GetResourceVersion, fmt.Errorf, fmt.Sprintf, gvk.GroupKind, gvk.String, json.Marshal, k8syaml.NewYAMLOrJSONDecoder, mapper.RESTMapping, mapping.Scope.Name, memory.NewMemCacheClient, restmapper.NewDeferredDiscoveryRESTMapper, strings.NewReader, strings.ToLower, strings.TrimSpace, unstructObj.GetName, unstructObj.GetNamespace, unstructObj.GroupVersionKind, unstructObj.SetGroupVersionKind, unstructObj.SetNamespace, unstructObj.SetResourceVersion, updateErr.Error]
func (c *K8sClient) ApplyYAML(ctx context.Context, yamlContent string) ([]K8sApplyResult, error) { ... }

// Clientset 返回底层 Kubernetes Clientset。
func (c *K8sClient) Clientset() *kubernetes.Clientset { ... }

// Close 关闭客户端与 SSH 隧道。
// Calls: [c.mu.Lock, c.mu.Unlock, c.sshClient.Close]
func (c *K8sClient) Close() error { ... }

// CreateNamespace 创建新命名空间。
// Calls: [c.clientset.CoreV1, c.clientset.CoreV1().Namespaces, c.clientset.CoreV1().Namespaces().Create, fmt.Errorf, strings.TrimSpace]
func (c *K8sClient) CreateNamespace(ctx context.Context, name string) error { ... }

// DeleteConfigMap 删除指定 ConfigMap。
// Calls: [c.clientset.CoreV1, c.clientset.CoreV1().ConfigMaps, c.clientset.CoreV1().ConfigMaps().Delete, fmt.Errorf]
func (c *K8sClient) DeleteConfigMap(ctx context.Context, namespace string, name string) error { ... }

// DeleteDeployment 删除指定 Deployment。
// Calls: [c.clientset.AppsV1, c.clientset.AppsV1().Deployments, c.clientset.AppsV1().Deployments().Delete, fmt.Errorf]
func (c *K8sClient) DeleteDeployment(ctx context.Context, namespace string, name string) error { ... }

// DeleteIngress 删除指定 Ingress。
// Calls: [c.clientset.NetworkingV1, c.clientset.NetworkingV1().Ingresses, c.clientset.NetworkingV1().Ingresses().Delete, fmt.Errorf]
func (c *K8sClient) DeleteIngress(ctx context.Context, namespace string, name string) error { ... }

// DeleteNamespace 删除指定命名空间。
// Calls: [c.clientset.CoreV1, c.clientset.CoreV1().Namespaces, c.clientset.CoreV1().Namespaces().Delete, fmt.Errorf, strings.TrimSpace]
func (c *K8sClient) DeleteNamespace(ctx context.Context, name string) error { ... }

// DeletePVC 删除指定 PVC。
// Calls: [c.clientset.CoreV1, c.clientset.CoreV1().PersistentVolumeClaims, c.clientset.CoreV1().PersistentVolumeClaims().Delete, fmt.Errorf]
func (c *K8sClient) DeletePVC(ctx context.Context, namespace string, name string) error { ... }

// DeletePod 删除指定 Pod。
// Calls: [c.clientset.CoreV1, c.clientset.CoreV1().Pods, c.clientset.CoreV1().Pods().Delete, fmt.Errorf]
func (c *K8sClient) DeletePod(ctx context.Context, namespace string, podName string) error { ... }

// DeleteSecret 删除指定 Secret。
// Calls: [c.clientset.CoreV1, c.clientset.CoreV1().Secrets, c.clientset.CoreV1().Secrets().Delete, fmt.Errorf]
func (c *K8sClient) DeleteSecret(ctx context.Context, namespace string, name string) error { ... }

// DeleteService 删除指定 Service。
// Calls: [c.clientset.CoreV1, c.clientset.CoreV1().Services, c.clientset.CoreV1().Services().Delete, fmt.Errorf]
func (c *K8sClient) DeleteService(ctx context.Context, namespace string, name string) error { ... }

// DeleteYAML 解析并声明式下线/删除 YAML 清单中的所有资源（等价于 kubectl delete -f）。
// Calls: [apierrors.IsNotFound, decoder.Decode, deleteErr.Error, discovery.NewDiscoveryClientForConfig, dri.Delete, dynClient.Resource, dynClient.Resource().Namespace, dynamic.NewForConfig, fmt.Errorf, fmt.Sprintf, gvk.GroupKind, gvk.String, k8syaml.NewYAMLOrJSONDecoder, mapper.RESTMapping, mapping.Scope.Name, memory.NewMemCacheClient, restmapper.NewDeferredDiscoveryRESTMapper, strings.NewReader, strings.ToLower, strings.TrimSpace, unstructObj.GetName, unstructObj.GetNamespace, unstructObj.GroupVersionKind, unstructObj.SetGroupVersionKind]
func (c *K8sClient) DeleteYAML(ctx context.Context, yamlContent string) ([]K8sDeleteResult, error) { ... }

// ExecStream 在指定的 Pod / Container 内部执行命令并实时流式回调输出，返回 (exitCode, error)。
// Calls: [c.clientset.CoreV1, c.clientset.CoreV1().RESTClient, c.clientset.CoreV1().RESTClient().Post, c.clientset.CoreV1().RESTClient().Post().Resource, c.clientset.CoreV1().RESTClient().Post().Resource().Name, c.clientset.CoreV1().RESTClient().Post().Resource().Name().Namespace, c.clientset.CoreV1().RESTClient().Post().Resource().Name().Namespace().SubResource, c.clientset.CoreV1().RESTClient().Post().Resource().Name().Namespace().SubResource().VersionedParams, executor.StreamWithContext, fmt.Errorf, remotecommand.NewSPDYExecutor, req.URL]
func (c *K8sClient) ExecStream(ctx context.Context, namespace string, podName string, containerName string, cmd []string, onChunk func(chunk string)) (int, error) { ... }

// GetOverview 获取集群概览信息。
// Calls: [c.clientset.AppsV1, c.clientset.AppsV1().Deployments, c.clientset.AppsV1().Deployments().List, c.clientset.CoreV1, c.clientset.CoreV1().Namespaces, c.clientset.CoreV1().Namespaces().List, c.clientset.CoreV1().Nodes, c.clientset.CoreV1().Nodes().List, c.clientset.CoreV1().Pods, c.clientset.CoreV1().Pods().List, c.clientset.CoreV1().Services, c.clientset.CoreV1().Services().List, c.clientset.Discovery, c.clientset.Discovery().ServerVersion]
func (c *K8sClient) GetOverview(ctx context.Context) (*K8sOverview, error) { ... }

// GetPodLogs 获取 Pod 容器日志。
// Calls: [buf.String, c.clientset.CoreV1, c.clientset.CoreV1().Pods, c.clientset.CoreV1().Pods().GetLogs, fmt.Errorf, int64, io.Copy, req.Stream, stream.Close]
func (c *K8sClient) GetPodLogs(ctx context.Context, namespace string, podName string, containerName string, tail int, timestamps bool) (string, error) { ... }

// GetResourceYAML 获取任意资源的 YAML 描述文本。
// Calls: [c.clientset.AppsV1, c.clientset.AppsV1().Deployments, c.clientset.AppsV1().Deployments().Get, c.clientset.CoreV1, c.clientset.CoreV1().ConfigMaps, c.clientset.CoreV1().ConfigMaps().Get, c.clientset.CoreV1().Nodes, c.clientset.CoreV1().Nodes().Get, c.clientset.CoreV1().PersistentVolumeClaims, c.clientset.CoreV1().PersistentVolumeClaims().Get, c.clientset.CoreV1().Pods, c.clientset.CoreV1().Pods().Get, c.clientset.CoreV1().Secrets, c.clientset.CoreV1().Secrets().Get, c.clientset.CoreV1().Services, c.clientset.CoreV1().Services().Get, c.clientset.NetworkingV1, c.clientset.NetworkingV1().Ingresses, c.clientset.NetworkingV1().Ingresses().Get, fmt.Errorf, json.Marshal, json.Unmarshal, string, strings.ToLower, yaml.Marshal]
func (c *K8sClient) GetResourceYAML(ctx context.Context, kind string, namespace string, name string) (string, error) { ... }

// ListConfigMaps 获取 ConfigMap 列表。
// Calls: [c.clientset.CoreV1, c.clientset.CoreV1().ConfigMaps, c.clientset.CoreV1().ConfigMaps().List, cm.CreationTimestamp.Format, fmt.Errorf, sort.Slice]
func (c *K8sClient) ListConfigMaps(ctx context.Context, namespace string) ([]K8sConfigMapInfo, error) { ... }

// ListDeployments 获取 Deployment 列表。
// Calls: [c.clientset.AppsV1, c.clientset.AppsV1().Deployments, c.clientset.AppsV1().Deployments().List, d.CreationTimestamp.Format, fmt.Errorf, sort.Slice]
func (c *K8sClient) ListDeployments(ctx context.Context, namespace string) ([]K8sDeploymentInfo, error) { ... }

// ListIngresses 获取 Ingress 路由列表。
// Calls: [c.clientset.NetworkingV1, c.clientset.NetworkingV1().Ingresses, c.clientset.NetworkingV1().Ingresses().List, fmt.Errorf, fmt.Sprintf, ing.CreationTimestamp.Format, sort.Slice]
func (c *K8sClient) ListIngresses(ctx context.Context, namespace string) ([]K8sIngressInfo, error) { ... }

// ListNamespaces 获取所有命名空间。
// Calls: [c.clientset.CoreV1, c.clientset.CoreV1().Namespaces, c.clientset.CoreV1().Namespaces().List, fmt.Errorf, item.CreationTimestamp.Format, sort.Slice, string]
func (c *K8sClient) ListNamespaces(ctx context.Context) ([]K8sNamespaceInfo, error) { ... }

// ListNodes 获取所有节点信息。
// Calls: [c.clientset.CoreV1, c.clientset.CoreV1().Nodes, c.clientset.CoreV1().Nodes().List, float64, fmt.Errorf, fmt.Sprintf, n.CreationTimestamp.Format, n.Status.Capacity.Cpu, n.Status.Capacity.Cpu().String, n.Status.Capacity.Memory, n.Status.Capacity.Memory().Value, n.Status.Capacity.Pods, n.Status.Capacity.Pods().String, sort.Slice, strings.HasPrefix, strings.Join, strings.TrimPrefix]
func (c *K8sClient) ListNodes(ctx context.Context) ([]K8sNodeInfo, error) { ... }

// ListPVCs 获取持久存储卷声明 PVC 列表。
// Calls: [c.clientset.CoreV1, c.clientset.CoreV1().PersistentVolumeClaims, c.clientset.CoreV1().PersistentVolumeClaims().List, fmt.Errorf, pvc.CreationTimestamp.Format, qty.String, sort.Slice, string]
func (c *K8sClient) ListPVCs(ctx context.Context, namespace string) ([]K8sPVCInfo, error) { ... }

// ListPods 获取 Pod 列表（支持特定命名空间或全命名空间）。
// Calls: [c.clientset.CoreV1, c.clientset.CoreV1().Pods, c.clientset.CoreV1().Pods().List, fmt.Errorf, fmt.Sprintf, formatAge, p.CreationTimestamp.Format, sort.Slice, string]
func (c *K8sClient) ListPods(ctx context.Context, namespace string) ([]K8sPodInfo, error) { ... }

// ListSecrets 获取 Secret 凭据列表。
// Calls: [c.clientset.CoreV1, c.clientset.CoreV1().Secrets, c.clientset.CoreV1().Secrets().List, fmt.Errorf, sec.CreationTimestamp.Format, sort.Slice, string]
func (c *K8sClient) ListSecrets(ctx context.Context, namespace string) ([]K8sSecretInfo, error) { ... }

// ListServices 获取 Service 列表。
// Calls: [c.clientset.CoreV1, c.clientset.CoreV1().Services, c.clientset.CoreV1().Services().List, fmt.Errorf, fmt.Sprintf, s.CreationTimestamp.Format, sort.Slice, string]
func (c *K8sClient) ListServices(ctx context.Context, namespace string) ([]K8sServiceInfo, error) { ... }

// Ping 测试与 K8s 集群 API Server 的连通性。
// Calls: [c.clientset.Discovery, c.clientset.Discovery().ServerVersion, fmt.Errorf]
func (c *K8sClient) Ping(ctx context.Context) error { ... }

// RestConfig 返回 底层 REST 配置。
func (c *K8sClient) RestConfig() *rest.Config { ... }

// RestartDeployment 触发 Deployment 滚动重启。
// Calls: [c.clientset.AppsV1, c.clientset.AppsV1().Deployments, c.clientset.AppsV1().Deployments().Patch, fmt.Errorf, fmt.Sprintf, time.Now, time.Now().Format]
func (c *K8sClient) RestartDeployment(ctx context.Context, namespace string, name string) error { ... }

// ScaleDeployment 动态调整 Deployment 副本数。
// Calls: [c.clientset.AppsV1, c.clientset.AppsV1().Deployments, c.clientset.AppsV1().Deployments().GetScale, c.clientset.AppsV1().Deployments().UpdateScale, fmt.Errorf]
func (c *K8sClient) ScaleDeployment(ctx context.Context, namespace string, name string, replicas int32) error { ... }

// K8sConfigMapInfo 描述 ConfigMap 配置信息。
type K8sConfigMapInfo struct {
	Name string `json:"name"`
	Namespace string `json:"namespace"`
	DataCount int `json:"dataCount"`
	Data map[string]string `json:"data,omitempty"`
	CreatedAt string `json:"createdAt"`
}

// K8sContainerSummary 描述 Pod 内容器状态。
type K8sContainerSummary struct {
	Name string `json:"name"`
	Image string `json:"image"`
	Ready bool `json:"ready"`
	// running | waiting | terminated
	State string `json:"state"`
	Reason string `json:"reason,omitempty"`
	RestartCount int32 `json:"restartCount"`
	IsInit bool `json:"isInit,omitempty"`
}

// K8sDeleteResult 描述 YAML 下线删除单个资源的结果。
type K8sDeleteResult struct {
	Kind string `json:"kind"`
	Name string `json:"name"`
	Namespace string `json:"namespace,omitempty"`
	// "deleted" | "not_found" | "failed"
	Action string `json:"action"`
	Message string `json:"message,omitempty"`
}

// K8sDeploymentInfo 描述 Deployment 无状态负载信息。
type K8sDeploymentInfo struct {
	Name string `json:"name"`
	Namespace string `json:"namespace"`
	Replicas int32 `json:"replicas"`
	ReadyReplicas int32 `json:"readyReplicas"`
	AvailableReplicas int32 `json:"availableReplicas"`
	UpdatedReplicas int32 `json:"updatedReplicas"`
	Images []string `json:"images"`
	Selector map[string]string `json:"selector,omitempty"`
	CreatedAt string `json:"createdAt"`
}

// K8sExecManager 管理全局 Kubernetes 容器终端会话。
type K8sExecManager struct {
	sessions map[string]*K8sExecSession
	mu sync.RWMutex
}

// Close 关闭并注销终端会话。
// Calls: [m.mu.Lock, m.mu.Unlock, s.Close]
func (m *K8sExecManager) Close(execID string) error { ... }

// CloseAll 关闭所有活动终端会话。
// Calls: [m.mu.Lock, m.mu.Unlock, s.Close]
func (m *K8sExecManager) CloseAll() { ... }

// Resize 调整指定终端会话尺寸。
// Calls: [m.mu.RLock, m.mu.RUnlock, s.Resize]
func (m *K8sExecManager) Resize(execID string, cols int, rows int) error { ... }

// StartExec 启动一个容器交互终端会话。
// Calls: [context.Background, context.WithCancel, core.EmitEvent, errors.Is, errors.New, executor.StreamWithContext, fmt.Errorf, fmt.Sprintf, io.Pipe, k8sCli.Clientset, k8sCli.Clientset().CoreV1, k8sCli.Clientset().CoreV1().RESTClient, k8sCli.Clientset().CoreV1().RESTClient().Post, k8sCli.Clientset().CoreV1().RESTClient().Post().Resource, k8sCli.Clientset().CoreV1().RESTClient().Post().Resource().Name, k8sCli.Clientset().CoreV1().RESTClient().Post().Resource().Name().Namespace, k8sCli.Clientset().CoreV1().RESTClient().Post().Resource().Name().Namespace().SubResource, k8sCli.Clientset().CoreV1().RESTClient().Post().Resource().Name().Namespace().SubResource().VersionedParams, k8sCli.RestConfig, m.mu.Lock, m.mu.Unlock, m.remove, outWriter.Write, remotecommand.NewSPDYExecutor, req.URL, session.Close, sizeQueue.Push, strings.TrimSpace, time.Sleep, uuid.New, uuid.New().String]
func (m *K8sExecManager) StartExec(k8sCli *K8sClient, namespace string, podName string, container string, command string, cols int, rows int) (string, error) { ... }

// Write 发送输入数据到指定终端会话。
// Calls: [fmt.Errorf, m.mu.RLock, m.mu.RUnlock, s.Write]
func (m *K8sExecManager) Write(execID string, data string) error { ... }

// Calls: [m.mu.Lock, m.mu.Unlock]
func (m *K8sExecManager) remove(execID string) { ... }

// K8sExecSession 维护单个 Pod 容器的交互式终端执行会话。
type K8sExecSession struct {
	id string
	serverID string
	namespace string
	podName string
	container string
	command string
	stdinWriter *io.PipeWriter
	sizeQueue *K8sTerminalSizeQueue
	cancel context.CancelFunc
	closed bool
	closeOnce sync.Once
	mu sync.Mutex
}

// Close 关闭终端会话并释放资源。
// Calls: [s.cancel, s.closeOnce.Do, s.mu.Lock, s.mu.Unlock, s.stdinWriter.Close]
func (s *K8sExecSession) Close() error { ... }

// Resize 调整终端行列尺寸。
// Calls: [s.mu.Lock, s.mu.Unlock, s.sizeQueue.Push]
func (s *K8sExecSession) Resize(cols int, rows int) error { ... }

// Write 写入终端输入数据。
// Calls: [errors.New, s.mu.Lock, s.mu.Unlock, s.stdinWriter.Write]
func (s *K8sExecSession) Write(data string) error { ... }

// K8sIngressInfo 描述 Ingress 路由规则信息。
type K8sIngressInfo struct {
	Name string `json:"name"`
	Namespace string `json:"namespace"`
	IngressClass string `json:"ingressClass"`
	Hosts []string `json:"hosts"`
	Rules []string `json:"rules"`
	CreatedAt string `json:"createdAt"`
}

// K8sManager 管理 Kubernetes 客户端连接实例生命周期。
type K8sManager struct {
	ctx context.Context
	clients map[string]*K8sClient
	configs map[string]core.ServerConfig
	ExecMgr *K8sExecManager
	mu sync.RWMutex
}

// CloseAll 关闭所有活动连接及终端会话。
// Calls: [cli.Close, m.ExecMgr.CloseAll, m.mu.Lock, m.mu.Unlock]
func (m *K8sManager) CloseAll() { ... }

// Connect 建立或复用指定 serverID 的 K8s 连接。
// Calls: [NewK8sClient, m.mu.Lock, m.mu.Unlock]
func (m *K8sManager) Connect(cfg core.ServerConfig) (*K8sClient, error) { ... }

// Disconnect 关闭并移除连接。
// Calls: [cli.Close, m.mu.Lock, m.mu.Unlock]
func (m *K8sManager) Disconnect(serverID string) error { ... }

// GetClient 获取已连接的客户端。
// Calls: [fmt.Errorf, m.mu.RLock, m.mu.RUnlock]
func (m *K8sManager) GetClient(serverID string) (*K8sClient, error) { ... }

// ListConnections 列出当前所有已建立连接的 Kubernetes 集群实例。
// Calls: [m.mu.RLock, m.mu.RUnlock]
func (m *K8sManager) ListConnections() []map[string]any { ... }

// ResolveID 根据 serverID 或别名解析目标 Kubernetes 连接 ID。
// Calls: [errors.New, fmt.Errorf, m.mu.RLock, m.mu.RUnlock, strings.EqualFold, strings.TrimSpace]
func (m *K8sManager) ResolveID(idOrName string) (string, error) { ... }

// SetContext 设置上下文。
func (m *K8sManager) SetContext(ctx context.Context) { ... }

// K8sNamespaceInfo 描述命名空间信息。
type K8sNamespaceInfo struct {
	Name string `json:"name"`
	// Active | Terminating
	Status string `json:"status"`
	CreatedAt string `json:"createdAt"`
	Labels map[string]string `json:"labels,omitempty"`
}

// K8sNodeInfo 描述集群节点信息。
type K8sNodeInfo struct {
	Name string `json:"name"`
	// Ready | NotReady | Unknown
	Status string `json:"status"`
	// control-plane | worker | master
	Roles string `json:"roles"`
	KubeletVersion string `json:"kubeletVersion"`
	OSImage string `json:"osImage"`
	KernelVersion string `json:"kernelVersion"`
	InternalIP string `json:"internalIp"`
	ExternalIP string `json:"externalIp"`
	CPUCapacity string `json:"cpuCapacity"`
	MemCapacity string `json:"memCapacity"`
	PodsCapacity string `json:"podsCapacity"`
	CreatedAt string `json:"createdAt"`
	Labels map[string]string `json:"labels,omitempty"`
}

// K8sOverview 描述 Kubernetes 集群的概览信息。
type K8sOverview struct {
	Connected bool `json:"connected"`
	APIServer string `json:"apiServer"`
	GitVersion string `json:"gitVersion"`
	Platform string `json:"platform"`
	NodesTotal int `json:"nodesTotal"`
	NodesReady int `json:"nodesReady"`
	NamespacesTotal int `json:"namespacesTotal"`
	PodsTotal int `json:"podsTotal"`
	PodsRunning int `json:"podsRunning"`
	DeploymentsTotal int `json:"deploymentsTotal"`
	ServicesTotal int `json:"servicesTotal"`
}

// K8sPVCInfo 描述持久卷声明信息。
type K8sPVCInfo struct {
	Name string `json:"name"`
	Namespace string `json:"namespace"`
	// Bound | Pending | Lost
	Status string `json:"status"`
	VolumeName string `json:"volumeName"`
	Capacity string `json:"capacity"`
	AccessModes []string `json:"accessModes"`
	StorageClass string `json:"storageClass"`
	CreatedAt string `json:"createdAt"`
}

// K8sPodInfo 描述 Pod 实例信息。
type K8sPodInfo struct {
	Name string `json:"name"`
	Namespace string `json:"namespace"`
	// Running | Pending | Succeeded | Failed | CrashLoopBackOff
	Status string `json:"status"`
	// e.g. "1/1"
	Ready string `json:"ready"`
	Restarts int32 `json:"restarts"`
	NodeName string `json:"nodeName"`
	HostIP string `json:"hostIp,omitempty"`
	IP string `json:"ip"`
	Containers []K8sContainerSummary `json:"containers"`
	CreatedAt string `json:"createdAt"`
	Age string `json:"age"`
}

// K8sSecretInfo 描述 Secret 凭据信息。
type K8sSecretInfo struct {
	Name string `json:"name"`
	Namespace string `json:"namespace"`
	Type string `json:"type"`
	DataCount int `json:"dataCount"`
	Keys []string `json:"keys"`
	CreatedAt string `json:"createdAt"`
}

// K8sServiceInfo 描述 Service 网络服务信息。
type K8sServiceInfo struct {
	Name string `json:"name"`
	Namespace string `json:"namespace"`
	// ClusterIP | NodePort | LoadBalancer | ExternalName
	Type string `json:"type"`
	ClusterIP string `json:"clusterIp"`
	ExternalIP string `json:"externalIp"`
	Ports []string `json:"ports"`
	Selector map[string]string `json:"selector,omitempty"`
	CreatedAt string `json:"createdAt"`
}

// K8sTerminalSizeQueue 实现 remotecommand.TerminalSizeQueue 接口。
type K8sTerminalSizeQueue struct {
	sizeChan chan remotecommand.TerminalSize
}

// Next 获取下一个终端尺寸。
func (q *K8sTerminalSizeQueue) Next() *remotecommand.TerminalSize { ... }

// Push 动态更新终端窗口大小。
// Calls: [uint16]
func (q *K8sTerminalSizeQueue) Push(cols int, rows int) { ... }

// KubeconfigContextInfo 描述解析出来的 Kubeconfig 上下文及集群信息。
type KubeconfigContextInfo struct {
	CurrentContext string `json:"currentContext"`
	Contexts []string `json:"contexts"`
	ClusterHost string `json:"clusterHost"`
}

// k8sOutputWriter 将输出数据 Base64 编码后通过 Wails 事件广播给前端。
type k8sOutputWriter struct {
	sessionID string
}

// Calls: [base64.StdEncoding.EncodeToString, core.EmitEvent]
func (w *k8sOutputWriter) Write(p []byte) (n int, err error) { ... }

type k8sStreamWriter struct {
	onChunk func(chunk string)
}

// Calls: [string, w.onChunk]
func (w *k8sStreamWriter) Write(p []byte) (n int, err error) { ... }

```

#### Functions

```go
// NewK8sClient 创建并初始化一个 K8sClient 实例。
// Calls: [buildSSHClientForK8s, clientConfig.ClientConfig, clientConfig.Namespace, clientcmd.Load, clientcmd.NewNonInteractiveClientConfig, clientcmd.NewNonInteractiveDeferredLoadingClientConfig, fmt.Errorf, kubernetes.NewForConfig, os.Stat, sshCli.Close, sshCli.Dial, strings.HasPrefix, strings.TrimSpace]
func NewK8sClient(cfg core.ServerConfig) (*K8sClient, error) { ... }

// NewK8sExecManager 创建 K8sExecManager。
func NewK8sExecManager() *K8sExecManager { ... }

// NewK8sManager 创建 K8sManager 实例。
// Calls: [NewK8sExecManager]
func NewK8sManager() *K8sManager { ... }

// ParseKubeconfigInfo 解析传入的 Kubeconfig 文本或文件路径。
// Calls: [clientcmd.Load, clientcmd.LoadFromFile, fmt.Errorf, sort.Strings, strings.TrimSpace]
func ParseKubeconfigInfo(kubeconfigData string, kubeconfigPath string) (*KubeconfigContextInfo, error) { ... }

// ParseYAMLResourceSummaries 从 YAML 文本中解析出声明的资源列表与汇总统计文本。
// Calls: [decoder.Decode, fmt.Sprintf, k8syaml.NewYAMLOrJSONDecoder, sort.Strings, strings.Join, strings.NewReader, strings.TrimSpace]
func ParseYAMLResourceSummaries(yamlContent string) ([]core.K8sResourceItemSummary, string) { ... }

// Calls: [fmt.Errorf, fmt.Sprintf, os.ReadFile, ssh.Dial, ssh.InsecureIgnoreHostKey, ssh.ParsePrivateKey, ssh.ParsePrivateKeyWithPassphrase, ssh.Password, ssh.PublicKeys]
func buildSSHClientForK8s(cfg core.ServerConfig) (*ssh.Client, error) { ... }

// Calls: [d.Hours, d.Minutes, d.Seconds, fmt.Sprintf, int, time.Since]
func formatAge(t time.Time) string { ... }

```

---

### Package `logger` (`logger`)

- **Imports (15):** `context`, `fmt`, `gopkg.in/natefinch/lumberjack.v2`, `io`, `log`, `log/slog`, `os`, `path/filepath`, `runtime`, `strconv`, `strings`, `sync`, `sync/atomic`, `terminal/storage`, `time`

#### Constants & Variables

```go
var mu sync.Mutex
var currentWriter *lumberjack.Logger
var currentLogger atomic.Pointer[slog.Logger]
```

#### Structs & Methods

```go
// Config 定义本地日志滚动配置。
type Config struct {
	// Filename 日志文件的完整路径。
	Filename string
	// MaxSize 单个日志文件的最大大小 (MB)，达到后自动切割滚动。默认 10MB。
	MaxSize int
	// MaxBackups 最多保留的旧日志文件数量。默认 5 个。
	MaxBackups int
	// MaxAge 旧日志文件保留的最长天数。默认 30 天。
	MaxAge int
	// Compress 是否对归档的旧日志文件使用 gzip 压缩。默认 true。
	Compress bool
	// Level 日志最低记录级别。默认 slog.LevelInfo。
	Level slog.Level
}

// logBridgeWriter 将标准库 log 的输出重定向到全局 slog，使所有 log.Printf 输出与 slog 结构化格式统一。
type logBridgeWriter struct {
}

// Calls: [context.Background, currentLogger.Load, frames.Next, h.Enabled, h.Handle, l.Handler, runtime.Callers, runtime.CallersFrames, slog.NewRecord, string, strings.Contains, strings.HasPrefix, strings.TrimRight, time.Now]
func (w *logBridgeWriter) Write(p []byte) (int, error) { ... }

```

#### Functions

```go
// Close 关闭日志文件流（程序退出时调用）。
// Calls: [currentWriter.Close, mu.Lock, mu.Unlock]
func Close() error { ... }

// Debug 记录 Debug 级别结构化日志。
// Calls: [context.Background, logWithCaller]
func Debug(msg string, args ...any) { ... }

// Debugf 记录格式化 Debug 日志。
// Calls: [context.Background, logfWithCaller]
func Debugf(format string, args ...any) { ... }

// DefaultConfig 获取默认日志配置，并根据环境变量进行覆盖。
// Calls: [defaultLogPath]
func DefaultConfig() Config { ... }

// EnsureInitialized 确保日志库已经初始化；若尚未显式调用 Init()，则自动使用默认配置初始化。
// Calls: [Init, currentLogger.Load]
func EnsureInitialized() { ... }

// Error 记录 Error 级别结构化日志。
// Calls: [context.Background, logWithCaller]
func Error(msg string, args ...any) { ... }

// Errorf 记录格式化 Error 日志。
// Calls: [context.Background, logfWithCaller]
func Errorf(format string, args ...any) { ... }

// GetLogger 获取全局当前 *slog.Logger 实例。
// Calls: [EnsureInitialized, currentLogger.Load]
func GetLogger() *slog.Logger { ... }

// Info 记录 Info 级别结构化日志。
// Calls: [context.Background, logWithCaller]
func Info(msg string, args ...any) { ... }

// Infof 记录格式化 Info 日志。
// Calls: [context.Background, logfWithCaller]
func Infof(format string, args ...any) { ... }

// Init 初始化全局日志记录器。只写入本地滚动日志文件，控制台静默。
// Calls: [DefaultConfig, a.Value.Any, a.Value.Time, a.Value.Time().Format, currentLogger.Store, currentWriter.Close, fastBase, filepath.Dir, fmt.Errorf, log.SetFlags, log.SetOutput, log.SetPrefix, mu.Lock, mu.Unlock, opt, os.MkdirAll, slog.New, slog.NewTextHandler, slog.SetDefault, slog.String, strconv.Itoa]
func Init(opts ...Option) (*slog.Logger, error) { ... }

// LogWriter 获取底层写入器（可用于某些需要 io.Writer 的第三方组件）。
// Calls: [mu.Lock, mu.Unlock]
func LogWriter() io.Writer { ... }

// NewStandardLogger 创建一个适配到全局 slog 的标准库 *log.Logger 实例，方便传给只接受 *log.Logger 的第三方库。
// Calls: [GetLogger, GetLogger().Handler, slog.NewLogLogger]
func NewStandardLogger(level slog.Level) *log.Logger { ... }

// Warn 记录 Warn 级别结构化日志。
// Calls: [context.Background, logWithCaller]
func Warn(msg string, args ...any) { ... }

// Warnf 记录格式化 Warn 日志。
// Calls: [context.Background, logfWithCaller]
func Warnf(format string, args ...any) { ... }

// With 返回带有预设属性字段的子 Logger。
// Calls: [GetLogger, GetLogger().With]
func With(args ...any) *slog.Logger { ... }

// Calls: [storage.LogFilePath]
func defaultLogPath() string { ... }

// fastBase 快速截取文件路径中的纯文件名，避免全量 filepath.Base 解析与堆分配。
func fastBase(path string) string { ... }

// Calls: [Init]
func init() { ... }

// logWithCaller 精确获取业务调用处的 PC (跳过封装层级)，并通过 slog 处理。
// Calls: [currentLogger.Load, h.Enabled, h.Handle, l.Handler, r.Add, runtime.Callers, slog.NewRecord, time.Now]
func logWithCaller(ctx context.Context, level slog.Level, msg string, args ...any) { ... }

// logfWithCaller 针对格式化输出进行快速级别预检，若未开启级别则直接跳过 fmt.Sprintf 与调用栈捕获，达成 0 分配。
// Calls: [currentLogger.Load, fmt.Sprintf, h.Enabled, h.Handle, l.Handler, runtime.Callers, slog.NewRecord, time.Now]
func logfWithCaller(ctx context.Context, level slog.Level, format string, args ...any) { ... }

```

---

### Package `mongo` (`mongo`)

- **Imports (18):** `context`, `crypto/tls`, `crypto/x509`, `encoding/json`, `errors`, `fmt`, `go.mongodb.org/mongo-driver/v2/bson`, `go.mongodb.org/mongo-driver/v2/mongo`, `go.mongodb.org/mongo-driver/v2/mongo/options`, `go.mongodb.org/mongo-driver/v2/mongo/readpref`, `net/url`, `os`, `sort`, `strings`, `sync`, `sync/atomic`, `terminal/core`, `time`

#### Constants & Variables

```go
// MongoAuthNone 无认证（本地开发实例）。
const MongoAuthNone MongoAuthMech = "none"
// MongoAuthSCRAM1 SCRAM-SHA-1。
const MongoAuthSCRAM1 MongoAuthMech = "SCRAM-SHA-1"
// MongoAuthSCRAM256 SCRAM-SHA-256（MongoDB 4.0+ 默认）。
const MongoAuthSCRAM256 MongoAuthMech = "SCRAM-SHA-256"
// MongoAuthX509 基于客户端证书的 X.509 认证。
const MongoAuthX509 MongoAuthMech = "MONGODB-X509"
// MongoTopoStandalone 单节点。
const MongoTopoStandalone MongoTopology = "standalone"
// MongoTopoReplicaSet 副本集。
const MongoTopoReplicaSet MongoTopology = "replicaSet"
// MongoTopoSharded 分片集群（mongos）。
const MongoTopoSharded MongoTopology = "sharded"
```

#### Structs & Methods

```go
// MongoBulkOp 描述一次批量写操作。
type MongoBulkOp struct {
	// insert | update | updateMany | replace | delete | deleteMany
	Type string `json:"type"`
	// JSON
	Filter string `json:"filter"`
	// JSON
	Document string `json:"document"`
	Upsert bool `json:"upsert"`
}

// MongoFindResult 查询结果。
type MongoFindResult struct {
	// Extended JSON 字符串数组
	Documents []string `json:"documents"`
	Count int `json:"count"`
	Total int64 `json:"total"`
	DurationMs int64 `json:"durationMs"`
}

type MongoManager struct {
	mu sync.Mutex
	ctx context.Context
	clients map[string]*mongoClient
}

// Calls: [c.close, m.mu.Lock, m.mu.Unlock]
func (m *MongoManager) Close(id string) { ... }

// Calls: [c.close, m.mu.Lock, m.mu.Unlock]
func (m *MongoManager) CloseAll() { ... }

// Connect 建立连接。
// Calls: [cfg.ConnType, errors.New, m.Open]
func (m *MongoManager) Connect(cfg core.ServerConfig) (bool, error) { ... }

// Disconnect 关闭连接。
// Calls: [m.Close]
func (m *MongoManager) Disconnect(id string) { ... }

// Calls: [m.mu.Lock, m.mu.Unlock]
func (m *MongoManager) Get(id string) (*mongoClient, bool) { ... }

// Calls: [m.mu.Lock, m.mu.Unlock]
func (m *MongoManager) ListConnections() []map[string]any { ... }

// MongoAggregate 执行聚合管道。pipelineJSON 为 JSON 数组。
// Calls: [c2, cancel, context.Background, context.WithTimeout, cur.All, cur.Close, docsToJSON, errors.New, m.mustMongo, mc.client.Database, mc.client.Database().Collection, mc.client.Database().Collection().Aggregate, mc.opCtx, mc.track, options.Aggregate, options.Aggregate().SetAllowDiskUse, parseJSONArray, time.Duration, time.Now, time.Since, time.Since().Milliseconds]
func (m *MongoManager) MongoAggregate(id string, db string, coll string, pipelineJSON string, allowDiskUse bool, maxTimeMS int) (MongoFindResult, error) { ... }

// MongoAggregateExplain 解释聚合管道的执行计划。
// Calls: [cancel, docToJSON, m.mustMongo, mc.client.Database, mc.client.Database().RunCommand, mc.client.Database().RunCommand().Decode, mc.opCtx, mc.track, parseJSONArray, time.Now]
func (m *MongoManager) MongoAggregateExplain(id string, db string, coll string, pipelineJSON string) (string, error) { ... }

// MongoBulkWrite 执行批量写（一次网络往返，显著优于逐条操作）。
// Calls: [cancel, err.Error, errors.New, fmt.Errorf, m.mustMongo, mc.client.Database, mc.client.Database().Collection, mc.client.Database().Collection().BulkWrite, mc.opCtx, mc.track, mongo.NewDeleteManyModel, mongo.NewDeleteManyModel().SetFilter, mongo.NewDeleteOneModel, mongo.NewDeleteOneModel().SetFilter, mongo.NewInsertOneModel, mongo.NewInsertOneModel().SetDocument, mongo.NewReplaceOneModel, mongo.NewReplaceOneModel().SetFilter, mongo.NewReplaceOneModel().SetFilter().SetReplacement, mongo.NewReplaceOneModel().SetFilter().SetReplacement().SetUpsert, mongo.NewUpdateManyModel, mongo.NewUpdateManyModel().SetFilter, mongo.NewUpdateManyModel().SetFilter().SetUpdate, mongo.NewUpdateManyModel().SetFilter().SetUpdate().SetUpsert, mongo.NewUpdateOneModel, mongo.NewUpdateOneModel().SetFilter, mongo.NewUpdateOneModel().SetFilter().SetUpdate, mongo.NewUpdateOneModel().SetFilter().SetUpdate().SetUpsert, options.BulkWrite, options.BulkWrite().SetOrdered, parseJSONDoc, strings.HasPrefix, strings.ToLower, time.Now]
func (m *MongoManager) MongoBulkWrite(id string, db string, coll string, ops []MongoBulkOp, ordered bool) (map[string]any, error) { ... }

// MongoClientStats 仅返回客户端侧统计（无需服务端权限）。
// Calls: [m.mustMongo, mc.stats.snapshot]
func (m *MongoManager) MongoClientStats(id string) (map[string]any, error) { ... }

// MongoCollectionStats 返回集合统计（文档数、大小、索引）。
// Calls: [cancel, cur.Close, cur.Decode, cur.Next, m.mustMongo, mc.client.Database, mc.client.Database().Collection, mc.client.Database().Collection().Aggregate, mc.opCtx, mc.track, time.Now, toBsonMap]
func (m *MongoManager) MongoCollectionStats(id string, db string, coll string) (map[string]any, error) { ... }

// MongoCollections 列出指定库下的集合。
// Calls: [cancel, cur.Close, cur.Decode, cur.Next, errors.New, fmt.Sprintf, m.mustMongo, mc.client.Database, mc.client.Database().ListCollections, mc.opCtx, mc.track, sort.Slice, strings.TrimSpace, time.Now, toBsonMap]
func (m *MongoManager) MongoCollections(id string, db string) ([]map[string]any, error) { ... }

// MongoCountDocuments 统计匹配文档数。
// Calls: [cancel, m.mustMongo, mc.client.Database, mc.client.Database().Collection, mc.client.Database().Collection().CountDocuments, mc.opCtx, mc.track, parseJSONDoc, time.Now]
func (m *MongoManager) MongoCountDocuments(id string, db string, coll string, filterJSON string) (int64, error) { ... }

// MongoCreateCollection 创建集合。
// Calls: [cancel, errors.New, m.mustMongo, mc.client.Database, mc.client.Database().CreateCollection, mc.opCtx, mc.track, strings.TrimSpace, time.Now]
func (m *MongoManager) MongoCreateCollection(id string, db string, coll string) error { ... }

// MongoCreateDatabase 通过创建首个集合来隐式建库。
// Calls: [m.MongoCreateCollection, strings.TrimSpace]
func (m *MongoManager) MongoCreateDatabase(id string, db string, firstCollection string) error { ... }

// MongoCreateIndex 创建索引。keysJSON 形如 {"field":1,"other":-1}。
// Calls: [cancel, errors.New, fmt.Errorf, idxOpts.SetExpireAfterSeconds, idxOpts.SetName, int32, m.mustMongo, mc.client.Database, mc.client.Database().Collection, mc.client.Database().Collection().Indexes, mc.client.Database().Collection().Indexes().CreateOne, mc.opCtx, mc.track, options.Index, options.Index().SetUnique, options.Index().SetUnique().SetSparse, parseJSONDoc, strings.TrimSpace, time.Now]
func (m *MongoManager) MongoCreateIndex(id string, db string, coll string, keysJSON string, name string, unique bool, sparse bool, expireAfterSeconds int) (string, error) { ... }

// MongoCurrentOps 返回正在执行的操作，便于定位慢查询。
// Calls: [cancel, cur.All, cur.Close, docsToJSON, m.mustMongo, mc.client.Database, mc.client.Database().Aggregate, mc.opCtx]
func (m *MongoManager) MongoCurrentOps(id string) ([]string, error) { ... }

// MongoDatabases 列出所有数据库及其大小。
// Calls: [cancel, fmt.Sprintf, m.mustMongo, mc.client.ListDatabases, mc.opCtx, mc.track, sort.Slice, time.Now]
func (m *MongoManager) MongoDatabases(id string) ([]map[string]any, error) { ... }

// MongoDeleteMany 批量删除。
// Calls: [m.mongoDelete]
func (m *MongoManager) MongoDeleteMany(id string, db string, coll string, filterJSON string) (int64, error) { ... }

// MongoDeleteOne 删除单个文档。
// Calls: [m.mongoDelete]
func (m *MongoManager) MongoDeleteOne(id string, db string, coll string, filterJSON string) (int64, error) { ... }

// MongoDistinct 返回某字段的去重值。
// Calls: [cancel, docToJSON, errors.New, m.mustMongo, mc.client.Database, mc.client.Database().Collection, mc.client.Database().Collection().Distinct, mc.opCtx, mc.track, parseJSONDoc, res.Decode, res.Err, strings.TrimSpace, time.Now]
func (m *MongoManager) MongoDistinct(id string, db string, coll string, field string, filterJSON string) ([]string, error) { ... }

// MongoDropCollection 删除集合。
// Calls: [cancel, m.mustMongo, mc.client.Database, mc.client.Database().Collection, mc.client.Database().Collection().Drop, mc.opCtx, mc.track, time.Now]
func (m *MongoManager) MongoDropCollection(id string, db string, coll string) error { ... }

// MongoDropDatabase 删除数据库。
// Calls: [cancel, m.mustMongo, mc.client.Database, mc.client.Database().Drop, mc.opCtx, mc.track, time.Now]
func (m *MongoManager) MongoDropDatabase(id string, db string) error { ... }

// MongoDropIndex 删除索引。
// Calls: [cancel, errors.New, m.mustMongo, mc.client.Database, mc.client.Database().Collection, mc.client.Database().Collection().Indexes, mc.client.Database().Collection().Indexes().DropOne, mc.opCtx, mc.track, time.Now]
func (m *MongoManager) MongoDropIndex(id string, db string, coll string, name string) error { ... }

// MongoExplain 返回查询执行计划，用于性能分析。
// Calls: [cancel, docToJSON, m.mustMongo, mc.client.Database, mc.client.Database().RunCommand, mc.client.Database().RunCommand().Decode, mc.opCtx, mc.track, parseJSONDoc, strings.TrimSpace, time.Now]
func (m *MongoManager) MongoExplain(id string, spec MongoQuerySpec, verbosity string) (string, error) { ... }

// MongoFind 按查询构建器规格执行查询。
// Calls: [cancel, ccancel, coll.CountDocuments, coll.Find, cur.All, cur.Close, docsToJSON, fmt.Errorf, int64, m.mustMongo, mc.client.Database, mc.client.Database().Collection, mc.opCtx, mc.track, opt.SetHint, opt.SetLimit, opt.SetProjection, opt.SetSkip, opt.SetSort, options.Find, parseJSONDoc, strings.HasPrefix, strings.TrimSpace, time.Now, time.Since, time.Since().Milliseconds]
func (m *MongoManager) MongoFind(id string, spec MongoQuerySpec) (MongoFindResult, error) { ... }

// MongoFindOneAndUpdate 原子地查找并更新，返回更新后的文档。
// Calls: [cancel, docToJSON, errors.Is, m.mustMongo, mc.client.Database, mc.client.Database().Collection, mc.client.Database().Collection().FindOneAndUpdate, mc.client.Database().Collection().FindOneAndUpdate().Decode, mc.opCtx, mc.track, options.FindOneAndUpdate, options.FindOneAndUpdate().SetReturnDocument, parseJSONDoc, strings.HasPrefix, time.Now]
func (m *MongoManager) MongoFindOneAndUpdate(id string, db string, coll string, filterJSON string, updateJSON string, returnNew bool) (string, error) { ... }

// MongoGetValidator 读取集合当前的 JSON Schema 校验规则。
// Calls: [cancel, cur.Close, cur.Decode, cur.Next, docToJSON, m.mustMongo, mc.client.Database, mc.client.Database().ListCollections, mc.opCtx, toBsonMap]
func (m *MongoManager) MongoGetValidator(id string, db string, coll string) (map[string]any, error) { ... }

// MongoHealthCheck 健康检查：探活延迟、拓扑、主节点、连接池状态。
// Calls: [cancel, detectTopology, fmt.Sprintf, m.mustMongo, mc.client.Database, mc.client.Database().RunCommand, mc.client.Database().RunCommand().Decode, mc.client.Ping, mc.opCtx, mc.track, pingErr.Error, readpref.Primary, serverVersion, time.Now, time.Since, time.Since().Milliseconds]
func (m *MongoManager) MongoHealthCheck(id string) (map[string]any, error) { ... }

// MongoIndexStats 返回索引使用统计，帮助识别无效索引。
// Calls: [cancel, cur.All, cur.Close, docsToJSON, m.mustMongo, mc.client.Database, mc.client.Database().Collection, mc.client.Database().Collection().Aggregate, mc.opCtx, mc.track, time.Now]
func (m *MongoManager) MongoIndexStats(id string, db string, coll string) ([]string, error) { ... }

// MongoIndexes 列出集合索引。
// Calls: [cancel, cur.Close, cur.Decode, cur.Next, docToJSON, m.mustMongo, mc.client.Database, mc.client.Database().Collection, mc.client.Database().Collection().Indexes, mc.client.Database().Collection().Indexes().List, mc.opCtx, mc.track, time.Now]
func (m *MongoManager) MongoIndexes(id string, db string, coll string) ([]map[string]any, error) { ... }

// MongoInferSchema 采样若干文档，推断字段结构（类型、出现率），
// 相当于为无固定 Schema 的集合生成一份数据模型映射。
// Calls: [cancel, collectFields, cur.Close, cur.Decode, cur.Next, float64, fmt.Sprintf, m.mustMongo, mc.client.Database, mc.client.Database().Collection, mc.client.Database().Collection().Aggregate, mc.opCtx, mc.track, sort.Slice, sort.Strings, time.Now]
func (m *MongoManager) MongoInferSchema(id string, db string, coll string, sampleSize int) ([]map[string]any, error) { ... }

// MongoInsertMany 批量插入。ordered=false 时部分失败不中断。
// Calls: [cancel, err.Error, errors.New, m.mustMongo, mc.client.Database, mc.client.Database().Collection, mc.client.Database().Collection().InsertMany, mc.opCtx, mc.track, options.InsertMany, options.InsertMany().SetOrdered, parseJSONArray, time.Now]
func (m *MongoManager) MongoInsertMany(id string, db string, coll string, docsJSON string, ordered bool) (map[string]any, error) { ... }

// MongoInsertOne 插入单个文档。
// Calls: [cancel, docToJSON, m.mustMongo, mc.client.Database, mc.client.Database().Collection, mc.client.Database().Collection().InsertOne, mc.opCtx, mc.track, parseJSONDoc, time.Now]
func (m *MongoManager) MongoInsertOne(id string, db string, coll string, docJSON string) (string, error) { ... }

// MongoRenameCollection 重命名集合。
// Calls: [cancel, errors.New, m.mustMongo, mc.client.Database, mc.client.Database().RunCommand, mc.client.Database().RunCommand().Err, mc.opCtx, mc.track, strings.TrimSpace, time.Now]
func (m *MongoManager) MongoRenameCollection(id string, db string, coll string, newName string) error { ... }

// MongoReplaceOne 整文档替换。
// Calls: [cancel, fmt.Errorf, m.mustMongo, mc.client.Database, mc.client.Database().Collection, mc.client.Database().Collection().ReplaceOne, mc.opCtx, mc.track, options.Replace, options.Replace().SetUpsert, parseJSONDoc, time.Now]
func (m *MongoManager) MongoReplaceOne(id string, db string, coll string, filterJSON string, docJSON string, upsert bool) (map[string]any, error) { ... }

// MongoRunCommand 执行任意数据库命令，作为高级出口。
// Calls: [cancel, docToJSON, errors.New, m.mustMongo, mc.client.Database, mc.client.Database().RunCommand, mc.client.Database().RunCommand().Decode, mc.opCtx, mc.track, parseJSONDoc, strings.TrimSpace, time.Now]
func (m *MongoManager) MongoRunCommand(id string, db string, commandJSON string) (string, error) { ... }

// MongoServerStatus 返回 serverStatus 关键指标，用于性能监控。
// Calls: [cancel, m.mustMongo, mc.client.Database, mc.client.Database().RunCommand, mc.client.Database().RunCommand().Decode, mc.opCtx, mc.stats.snapshot, mc.track, time.Now, toBsonMap]
func (m *MongoManager) MongoServerStatus(id string) (map[string]any, error) { ... }

// MongoSetValidator 设置 / 更新集合的 JSON Schema 校验规则。
// level: off | moderate | strict；action: error | warn。
// Calls: [cancel, m.mustMongo, mc.client.Database, mc.client.Database().RunCommand, mc.client.Database().RunCommand().Err, mc.opCtx, mc.track, parseJSONDoc, time.Now]
func (m *MongoManager) MongoSetValidator(id string, db string, coll string, validatorJSON string, level string, action string) error { ... }

// MongoTransaction 在单个事务中按顺序执行多个操作，全部成功才提交。
// 需要副本集或分片集群；单机实例不支持事务。
// Calls: [c.DeleteMany, c.DeleteOne, c.InsertOne, c.ReplaceOne, c.UpdateMany, c.UpdateOne, cancel, context.Background, docToJSON, errors.New, fmt.Errorf, m.mustMongo, mc.client.Database, mc.client.Database().Collection, mc.client.StartSession, mc.opCtx, mc.track, options.Replace, options.Replace().SetUpsert, options.UpdateMany, options.UpdateMany().SetUpsert, options.UpdateOne, options.UpdateOne().SetUpsert, parseJSONDoc, sess.EndSession, sess.WithTransaction, strings.HasPrefix, strings.ToLower, time.Now, time.Since, time.Since().Milliseconds, txErr.Error]
func (m *MongoManager) MongoTransaction(id string, ops []MongoTxOp) (map[string]any, error) { ... }

// MongoUnwatch 停止指定的变更流。
// Calls: [cancel, m.mustMongo, mc.mu.Lock, mc.mu.Unlock]
func (m *MongoManager) MongoUnwatch(id string, watchKey string) error { ... }

// MongoUpdateMany 批量更新。
// Calls: [m.mongoUpdate]
func (m *MongoManager) MongoUpdateMany(id string, db string, coll string, filterJSON string, updateJSON string, upsert bool) (map[string]any, error) { ... }

// MongoUpdateOne 更新单个文档。update 需为含 $set 等操作符的 JSON。
// Calls: [m.mongoUpdate]
func (m *MongoManager) MongoUpdateOne(id string, db string, coll string, filterJSON string, updateJSON string, upsert bool) (map[string]any, error) { ... }

// MongoValidateDocument 用集合现有校验规则试跑一个文档，返回是否通过。
// 通过在事务/临时校验中执行 insert 再回滚的方式避免脏数据。
// Calls: [cancel, err.Error, errors.New, insErr.Error, m.mustMongo, mc.client.Database, mc.client.Database().Collection, mc.client.Database().Collection().DeleteOne, mc.client.Database().Collection().InsertOne, mc.client.StartSession, mc.opCtx, parseJSONDoc, sess.EndSession, sess.WithTransaction, strings.Contains, txErr.Error]
func (m *MongoManager) MongoValidateDocument(id string, db string, coll string, docJSON string) (map[string]any, error) { ... }

// MongoWatch 监听变更流。scope 为 deployment / database / collection。
// 事件通过 Wails 事件 mongo:change:<id> 推送到前端。
// Calls: [cancel, context.Background, context.WithCancel, core.EmitEvent, ctx.Err, docToJSON, err.Error, errors.New, fmt.Errorf, m.mustMongo, mc.client.Database, mc.client.Database().Collection, mc.client.Database().Collection().Watch, mc.client.Database().Watch, mc.client.Watch, mc.mu.Lock, mc.mu.Unlock, opt.SetFullDocument, options.ChangeStream, parseJSONArray, stream.Close, stream.Decode, stream.Err, stream.Next, strings.ToLower, strings.TrimSpace, time.Now, time.Now().UnixMilli]
func (m *MongoManager) MongoWatch(id string, scope string, db string, coll string, pipelineJSON string, fullDocument string) (string, error) { ... }

// MongoWatchList 返回当前活跃的变更流。
// Calls: [m.mustMongo, mc.mu.Lock, mc.mu.Unlock, sort.Strings]
func (m *MongoManager) MongoWatchList(id string) ([]string, error) { ... }

// Calls: [buildMongoOptions, cancel, cli.Disconnect, cli.Ping, context.Background, context.WithTimeout, fmt.Errorf, m.mu.Lock, m.mu.Unlock, mongo.Connect, old.close, readpref.Primary, time.Duration]
func (m *MongoManager) Open(id string, cfg core.ServerConfig) error { ... }

// Calls: [errors.New, fmt.Errorf, m.mu.Lock, m.mu.Unlock, strings.EqualFold, strings.TrimSpace]
func (m *MongoManager) ResolveID(idOrName string) (string, error) { ... }

func (m *MongoManager) SetContext(ctx context.Context) { ... }

// TestConnection 使用临时配置测试连通性，不写入连接池。
// Calls: [buildMongoOptions, cancel, cli.Database, cli.Database().RunCommand, cli.Database().RunCommand().Decode, cli.Disconnect, cli.Ping, context.Background, context.WithTimeout, detectTopology, fmt.Errorf, mongo.Connect, readpref.Primary, serverVersion, time.Now, time.Since, time.Since().Milliseconds]
func (m *MongoManager) TestConnection(cfg core.ServerConfig) (map[string]any, error) { ... }

// Calls: [c.DeleteMany, c.DeleteOne, cancel, errors.New, m.mustMongo, mc.client.Database, mc.client.Database().Collection, mc.opCtx, mc.track, parseJSONDoc, time.Now]
func (m *MongoManager) mongoDelete(id string, db string, coll string, filterJSON string, many bool) (int64, error) { ... }

// Calls: [c.UpdateMany, c.UpdateOne, cancel, errors.New, fmt.Errorf, m.mustMongo, mc.client.Database, mc.client.Database().Collection, mc.opCtx, mc.track, options.UpdateMany, options.UpdateMany().SetUpsert, options.UpdateOne, options.UpdateOne().SetUpsert, parseJSONDoc, strings.HasPrefix, time.Now]
func (m *MongoManager) mongoUpdate(id string, db string, coll string, filterJSON string, updateJSON string, upsert bool, many bool) (map[string]any, error) { ... }

// mustMongo 取出连接，统一错误提示。
// Calls: [errors.New, m.Get, mc.mu.Lock, mc.mu.Unlock]
func (m *MongoManager) mustMongo(id string) (*mongoClient, error) { ... }

// MongoQuerySpec 描述一次结构化查询，由前端查询构建器生成。
type MongoQuerySpec struct {
	Database string `json:"database"`
	Collection string `json:"collection"`
	// JSON
	Filter string `json:"filter"`
	// JSON
	Projection string `json:"projection"`
	// JSON
	Sort string `json:"sort"`
	Limit int `json:"limit"`
	Skip int `json:"skip"`
	// 索引名或 JSON
	Hint string `json:"hint"`
	// JSON
	Collation string `json:"collation"`
}

// MongoTxOp 事务中的一个操作。
type MongoTxOp struct {
	// insert | update | updateMany | delete | deleteMany | replace
	Type string `json:"type"`
	Database string `json:"database"`
	Collection string `json:"collection"`
	Filter string `json:"filter"`
	Document string `json:"document"`
	Upsert bool `json:"upsert"`
}

// MongoURIInfo 是连接串解析结果，供前端回填表单。
type MongoURIInfo struct {
	Scheme string `json:"scheme"`
	Hosts []string `json:"hosts"`
	Username string `json:"username"`
	Password string `json:"password"`
	Database string `json:"database"`
	AuthSource string `json:"authSource"`
	AuthMech string `json:"authMech"`
	ReplicaSet string `json:"replicaSet"`
	TLS bool `json:"tls"`
	SRV bool `json:"srv"`
	Options map[string]string `json:"options"`
}

// mongoClient 表示一个 MongoDB 会话。
type mongoClient struct {
	id string
	cfg core.ServerConfig
	client *mongo.Client
	stats *mongoStats
	mu sync.Mutex
	// 变更流，key=watchKey
	streams map[string]context.CancelFunc
	closed bool
}

// Calls: [c, cancel, context.Background, context.WithTimeout, mc.client.Disconnect, mc.mu.Lock, mc.mu.Unlock]
func (mc *mongoClient) close() { ... }

// opCtx 生成带超时的操作上下文。
// Calls: [context.Background, context.WithTimeout, time.Duration]
func (mc *mongoClient) opCtx() (context.Context, context.CancelFunc) { ... }

// track 统计一次操作耗时。
// Calls: [mc.stats.record, time.Since]
func (mc *mongoClient) track(start time.Time, err error) { ... }

// mongoStats 记录轻量性能指标，用于前端监控面板。
type mongoStats struct {
	ops int64
	failures int64
	totalNano int64
	slowOps int64
}

// Calls: [atomic.AddInt64, d.Nanoseconds]
func (s *mongoStats) record(d time.Duration, err error) { ... }

// Calls: [atomic.LoadInt64, float64]
func (s *mongoStats) snapshot() map[string]any { ... }

```

#### Functions

```go
// MongoParseURI 供前端调用：解析连接串并回填表单。
// Calls: [parseMongoURI]
func (m *MongoManager) MongoParseURI(uri string) (MongoURIInfo, error) { ... }

// Calls: [parseMongoURI]
func MongoParseURI(uri string) (MongoURIInfo, error) { ... }

func NewMongoManager() *MongoManager { ... }

// Calls: [fmt.Sprintf]
func bsonTypeName(v any) string { ... }

// buildMongoOptions 根据配置构造驱动选项：认证、TLS、连接池、超时、读偏好。
// Calls: [MongoAuthMech, buildMongoTLS, buildMongoURI, fmt.Errorf, options.Client, options.Client().ApplyURI, opts.SetAppName, opts.SetAuth, opts.SetCompressors, opts.SetConnectTimeout, opts.SetMaxConnIdleTime, opts.SetMaxPoolSize, opts.SetMinPoolSize, opts.SetReadPreference, opts.SetReplicaSet, opts.SetRetryReads, opts.SetRetryWrites, opts.SetServerSelectionTimeout, opts.SetTLSConfig, opts.SetTimeout, readpref.New, readprefMode, splitAddrs, string, strings.TrimSpace, time.Duration, uint64]
func buildMongoOptions(cfg core.ServerConfig) (*options.ClientOptions, error) { ... }

// buildMongoTLS 组装 TLS 配置，支持自定义 CA 与客户端证书（X.509 双向认证）。
// Calls: [errors.New, fmt.Errorf, pool.AppendCertsFromPEM, readPEMSource, string, strings.TrimSpace, tls.X509KeyPair, x509.NewCertPool]
func buildMongoTLS(cfg core.ServerConfig) (*tls.Config, error) { ... }

// buildMongoURI 在未提供完整连接串时，用离散字段拼装连接串。
// Calls: [b.String, b.WriteString, cfg.Addr, q.Encode, q.Set, strings.TrimSpace, url.PathEscape, url.QueryEscape]
func buildMongoURI(cfg core.ServerConfig) string { ... }

// collectFields 递归遍历文档，回调每个字段路径及其 BSON 类型。
// Calls: [bsonTypeName, collectFields, emit, strings.Count, toBsonMap]
func collectFields(prefix string, doc map[string]any, emit func(path, typ string)) { ... }

// Calls: [string]
func detectTopology(hello bson.M) string { ... }

// docToJSON 将 BSON 文档转为 Extended JSON 字符串（保留类型信息）。
// Calls: [bson.MarshalExtJSON, string]
func docToJSON(v any) string { ... }

// docsToJSON 批量转换。
// Calls: [docToJSON]
func docsToJSON(list []bson.Raw) []string { ... }

// normalizeBsonValue 递归将 bson.D / bson.M / bson.A 转换为标准 map[string]any 和 []any，
// 确保能够正确进行 JSON 序列化并彻底解决嵌套 bson.D 强转 .(bson.M) 失败的问题。
// Calls: [normalizeBsonValue]
func normalizeBsonValue(v any) any { ... }

// parseJSONArray 解析 JSON 数组为多个 BSON 文档（批量写入 / 聚合管道）。
// Calls: [fmt.Errorf, json.Unmarshal, parseJSONDoc, string, strings.HasPrefix, strings.TrimSpace]
func parseJSONArray(text string) ([]bson.D, error) { ... }

// parseJSONDoc 把前端传入的 JSON 文本解析为 BSON 文档，
// 支持 MongoDB Extended JSON（$oid、$date 等）。
// Calls: [bson.UnmarshalExtJSON, fmt.Errorf, strings.TrimSpace]
func parseJSONDoc(text string) (bson.D, error) { ... }

// parseMongoURI 解析标准 mongodb:// 或 mongodb+srv:// 连接串。
// Calls: [errors.New, fmt.Errorf, q.Get, strings.EqualFold, strings.HasPrefix, strings.Split, strings.TrimPrefix, strings.TrimSpace, u.Query, u.User.Password, u.User.Username, url.Parse]
func parseMongoURI(raw string) (MongoURIInfo, error) { ... }

// readPEMSource 允许传入 PEM 文本或文件路径。
// Calls: [os.ReadFile, strings.Contains]
func readPEMSource(src string) ([]byte, error) { ... }

// Calls: [strings.ToLower]
func readprefMode(s string) readpref.Mode { ... }

// Calls: [cli.Database, cli.Database().RunCommand, cli.Database().RunCommand().Decode]
func serverVersion(ctx context.Context, cli *mongo.Client) string { ... }

// Calls: [strings.Split, strings.TrimSpace]
func splitAddrs(s string) []string { ... }

// toBsonMap 统一将任意 BSON 文档（bson.D / bson.M / map[string]any）转为 map[string]any
// Calls: [normalizeBsonValue]
func toBsonMap(v any) map[string]any { ... }

```

---

### Package `proto` (`proto`)

- **Imports (18):** `context`, `crypto/tls`, `crypto/x509`, `encoding/base64`, `errors`, `fmt`, `github.com/eclipse/paho.mqtt.golang`, `github.com/google/uuid`, `github.com/gorilla/websocket`, `io`, `net/http`, `net/url`, `os`, `sort`, `strings`, `sync`, `terminal/core`, `time`

#### Constants & Variables

```go
// 不需要发送请求体的方法。
var noBodyMethods
```

#### Structs & Methods

```go
// ApiAuth 描述鉴权信息。
type ApiAuth struct {
	// none | basic | bearer
	Type string `json:"type"`
	Username string `json:"username"`
	Password string `json:"password"`
	Token string `json:"token"`
}

// ApiHeader 是请求头的一行，支持启用/禁用。
type ApiHeader struct {
	Name string `json:"name"`
	Value string `json:"value"`
	Enabled bool `json:"enabled"`
}

// ApiRequest 描述一次 HTTP 调试请求。
type ApiRequest struct {
	Method string `json:"method"`
	URL string `json:"url"`
	Headers []ApiHeader `json:"headers"`
	Body string `json:"body"`
	TimeoutMs int `json:"timeoutMs"`
	InsecureTLS bool `json:"insecureTLS"`
	FollowRedirects bool `json:"followRedirects"`
	Auth *ApiAuth `json:"auth,omitempty"`
}

// ApiResponse 描述一次 HTTP 调试的响应结果。
type ApiResponse struct {
	Status string `json:"status"`
	StatusCode int `json:"statusCode"`
	Proto string `json:"proto"`
	Headers map[string]string `json:"headers"`
	Body string `json:"body"`
	DurationMs int64 `json:"durationMs"`
	Size int64 `json:"size"`
	Error string `json:"error"`
}

type MqttManager struct {
	mu sync.Mutex
	ctx context.Context
	conns map[string]*mqttConn
}

// Calls: [c.client.Disconnect, m.mu.Lock, m.mu.Unlock]
func (m *MqttManager) Close(id string) { ... }

// Calls: [m.Close, m.mu.Lock, m.mu.Unlock]
func (m *MqttManager) CloseAll() { ... }

// Connect 建立 MQTT 连接并订阅消息回调（通过事件推送到前端）。
// Calls: [byte, cfg.ConnType, client.Connect, core.EmitEvent, err.Error, errors.New, fmt.Errorf, fmt.Sprintf, int, loadCertPool, loadClientCert, m.Close, m.put, msg.Payload, msg.Qos, msg.Retained, msg.Topic, opts.SetTLSConfig, opts.SetWill, pahomqtt.NewClient, pahomqtt.NewClientOptions, pahomqtt.NewClientOptions().AddBroker, pahomqtt.NewClientOptions().AddBroker().SetClientID, pahomqtt.NewClientOptions().AddBroker().SetClientID().SetProtocolVersion, pahomqtt.NewClientOptions().AddBroker().SetClientID().SetProtocolVersion().SetAutoReconnect, pahomqtt.NewClientOptions().AddBroker().SetClientID().SetProtocolVersion().SetAutoReconnect().SetConnectRetry, pahomqtt.NewClientOptions().AddBroker().SetClientID().SetProtocolVersion().SetAutoReconnect().SetConnectRetry().SetConnectRetryInterval, pahomqtt.NewClientOptions().AddBroker().SetClientID().SetProtocolVersion().SetAutoReconnect().SetConnectRetry().SetConnectRetryInterval().SetKeepAlive, pahomqtt.NewClientOptions().AddBroker().SetClientID().SetProtocolVersion().SetAutoReconnect().SetConnectRetry().SetConnectRetryInterval().SetKeepAlive().SetPingTimeout, pahomqtt.NewClientOptions().AddBroker().SetClientID().SetProtocolVersion().SetAutoReconnect().SetConnectRetry().SetConnectRetryInterval().SetKeepAlive().SetPingTimeout().SetCleanSession, pahomqtt.NewClientOptions().AddBroker().SetClientID().SetProtocolVersion().SetAutoReconnect().SetConnectRetry().SetConnectRetryInterval().SetKeepAlive().SetPingTimeout().SetCleanSession().SetUsername, pahomqtt.NewClientOptions().AddBroker().SetClientID().SetProtocolVersion().SetAutoReconnect().SetConnectRetry().SetConnectRetryInterval().SetKeepAlive().SetPingTimeout().SetCleanSession().SetUsername().SetPassword, pahomqtt.NewClientOptions().AddBroker().SetClientID().SetProtocolVersion().SetAutoReconnect().SetConnectRetry().SetConnectRetryInterval().SetKeepAlive().SetPingTimeout().SetCleanSession().SetUsername().SetPassword().SetDefaultPublishHandler, pahomqtt.NewClientOptions().AddBroker().SetClientID().SetProtocolVersion().SetAutoReconnect().SetConnectRetry().SetConnectRetryInterval().SetKeepAlive().SetPingTimeout().SetCleanSession().SetUsername().SetPassword().SetDefaultPublishHandler().SetOnConnectHandler, pahomqtt.NewClientOptions().AddBroker().SetClientID().SetProtocolVersion().SetAutoReconnect().SetConnectRetry().SetConnectRetryInterval().SetKeepAlive().SetPingTimeout().SetCleanSession().SetUsername().SetPassword().SetDefaultPublishHandler().SetOnConnectHandler().SetConnectionLostHandler, string, strings.TrimSpace, time.Duration, time.Now, time.Now().UnixMilli, token.Error, token.WaitTimeout, uuid.NewString]
func (m *MqttManager) Connect(cfg core.ServerConfig) (bool, error) { ... }

// Calls: [m.mu.Lock, m.mu.Unlock]
func (m *MqttManager) Get(id string) (*mqttConn, bool) { ... }

// Calls: [byte, c.client.Publish, errors.New, m.Get, strings.TrimSpace, token.Error, token.WaitTimeout]
func (m *MqttManager) Publish(id string, topic string, payload string, qos int, retained bool) error { ... }

func (m *MqttManager) SetContext(ctx context.Context) { ... }

// Calls: [byte, c.client.Subscribe, c.mu.Lock, c.mu.Unlock, errors.New, m.Get, strings.TrimSpace, token.Error, token.WaitTimeout]
func (m *MqttManager) Subscribe(id string, topic string, qos int) error { ... }

// Calls: [c.mu.Lock, c.mu.Unlock, errors.New, int, m.Get, sort.Slice]
func (m *MqttManager) Subscriptions(id string) ([]map[string]any, error) { ... }

// TestConnection 测试 MQTT Broker 连接连通性
// Calls: [client.Connect, client.Disconnect, errors.New, fmt.Errorf, fmt.Sprintf, loadCertPool, loadClientCert, opts.SetTLSConfig, pahomqtt.NewClient, pahomqtt.NewClientOptions, pahomqtt.NewClientOptions().AddBroker, pahomqtt.NewClientOptions().AddBroker().SetClientID, pahomqtt.NewClientOptions().AddBroker().SetClientID().SetConnectTimeout, pahomqtt.NewClientOptions().AddBroker().SetClientID().SetConnectTimeout().SetAutoReconnect, pahomqtt.NewClientOptions().AddBroker().SetClientID().SetConnectTimeout().SetAutoReconnect().SetCleanSession, pahomqtt.NewClientOptions().AddBroker().SetClientID().SetConnectTimeout().SetAutoReconnect().SetCleanSession().SetUsername, pahomqtt.NewClientOptions().AddBroker().SetClientID().SetConnectTimeout().SetAutoReconnect().SetCleanSession().SetUsername().SetPassword, strings.TrimSpace, time.Now, time.Since, time.Since().Milliseconds, token.Error, token.WaitTimeout, uuid.NewString]
func (m *MqttManager) TestConnection(cfg core.ServerConfig) (map[string]any, error) { ... }

// Calls: [c.client.Unsubscribe, c.mu.Lock, c.mu.Unlock, errors.New, m.Get, token.Error, token.WaitTimeout]
func (m *MqttManager) Unsubscribe(id string, topic string) error { ... }

// Calls: [m.mu.Lock, m.mu.Unlock]
func (m *MqttManager) put(id string, c *mqttConn) { ... }

// WsConnectRequest 是建立 WebSocket 连接所需的参数
type WsConnectRequest struct {
	URL string `json:"url"`
	Headers []ApiHeader `json:"headers"`
	InsecureTLS bool `json:"insecureTLS"`
	Auth *ApiAuth `json:"auth,omitempty"`
	Protocols []string `json:"protocols"`
}

// WsConnectResult 是连接结果
type WsConnectResult struct {
	ID string `json:"id"`
	URL string `json:"url"`
	Status string `json:"status"`
	Error string `json:"error"`
}

type WsManager struct {
	mu sync.Mutex
	ctx context.Context
	conns map[string]*wsConn
}

// Calls: [c.closeOnce.Do, c.conn.Close, c.writeMessage, m.mu.Lock, m.mu.Unlock, websocket.FormatCloseMessage]
func (m *WsManager) CloseAll() { ... }

func (m *WsManager) SetContext(ctx context.Context) { ... }

// WsClose 关闭指定连接
// Calls: [core.EmitEvent, m.close, time.Now, time.Now().UnixMilli]
func (m *WsManager) WsClose(id string) { ... }

// WsConnect 建立一个新的 WebSocket 连接，连接成功后持续推送消息事件
// Calls: [base64.StdEncoding.EncodeToString, core.EmitEvent, d.Dial, err.Error, errors.New, fmt.Sprintf, header.Set, m.put, m.wsReadLoop, strings.HasPrefix, strings.TrimSpace, time.Now, time.Now().UnixMilli, uuid.NewString]
func (m *WsManager) WsConnect(req WsConnectRequest) (WsConnectResult, error) { ... }

// WsSend 通过指定连接发送一条文本消息
// Calls: [c.writeMessage, core.EmitEvent, errors.New, m.get, time.Now, time.Now().UnixMilli]
func (m *WsManager) WsSend(id string, message string) error { ... }

// Calls: [c.closeOnce.Do, c.conn.Close, c.writeMessage, m.mu.Lock, m.mu.Unlock, websocket.FormatCloseMessage]
func (m *WsManager) close(id string) { ... }

// Calls: [m.mu.Lock, m.mu.Unlock]
func (m *WsManager) get(id string) (*wsConn, bool) { ... }

// Calls: [m.mu.Lock, m.mu.Unlock]
func (m *WsManager) put(c *wsConn) { ... }

// Calls: [base64.StdEncoding.EncodeToString, conn.conn.ReadMessage, core.EmitEvent, err.Error, m.close, string, time.Now, time.Now().UnixMilli]
func (m *WsManager) wsReadLoop(conn *wsConn) { ... }

// WsMessageEvent 描述一条收发消息
type WsMessageEvent struct {
	// in | out
	Dir string `json:"dir"`
	Payload string `json:"payload"`
	// text | binary
	Type string `json:"type"`
	Ts int64 `json:"ts"`
	Error string `json:"error"`
}

// WsStatusEvent 描述连接状态变化
type WsStatusEvent struct {
	Status string `json:"status"`
	Error string `json:"error"`
}

type mqttConn struct {
	client pahomqtt.Client
	subs map[string]byte
	mu sync.Mutex
}

type wsConn struct {
	id string
	conn *websocket.Conn
	done chan struct{}
	closeOnce sync.Once
	writeMu sync.Mutex
}

// Calls: [c.conn.WriteMessage, c.writeMu.Lock, c.writeMu.Unlock]
func (c *wsConn) writeMessage(messageType int, data []byte) error { ... }

```

#### Functions

```go
// HttpApiRequest 在后端执行一次 HTTP 请求，返回结构化结果。
// 网络错误、超时、非 2xx 状态都会返回（写入 Error / StatusCode），不会让调用失败。
// Calls: [client.Do, context.Background, err.Error, http.NewRequest, httpReq.Header.Set, httpReq.SetBasicAuth, httpReq.WithContext, httpResp.Body.Close, int64, io.LimitReader, io.ReadAll, string, strings.EqualFold, strings.NewReader, strings.ToUpper, strings.TrimSpace, time.Now, time.Since, time.Since().Milliseconds, transport.CloseIdleConnections, u.String, url.Parse]
func HttpApiRequest(req ApiRequest) (ApiResponse, error) { ... }

func NewMqttManager() *MqttManager { ... }

func NewWsManager() *WsManager { ... }

// Calls: [errors.New, os.ReadFile, pool.AppendCertsFromPEM, strings.TrimSpace, x509.NewCertPool]
func loadCertPool(input string) (*x509.CertPool, error) { ... }

// Calls: [os.ReadFile, strings.TrimSpace, tls.X509KeyPair]
func loadClientCert(certInput string, keyInput string) (tls.Certificate, error) { ... }

```

---

### Package `redis` (`redis`)

- **Imports (11):** `context`, `encoding/json`, `errors`, `fmt`, `github.com/redis/go-redis/v9`, `strconv`, `strings`, `sync`, `sync/atomic`, `terminal/core`, `time`

#### Constants & Variables

```go
const RedisModeSingle RedisMode = "single"
const RedisModeSentinel RedisMode = "sentinel"
const RedisModeCluster RedisMode = "cluster"
const RedisSerNone RedisSerialization = "none"
const RedisSerJSON RedisSerialization = "json"
```

#### Structs & Methods

```go
type RedisCmdResult struct {
	Result string `json:"result"`
	Error string `json:"error"`
}

type RedisKeyItem struct {
	Key string `json:"key"`
	Type string `json:"type"`
	// 秒；-1 永久，-2 不存在
	TTL int64 `json:"ttl"`
}

type RedisKeysResult struct {
	Keys []RedisKeyItem `json:"keys"`
	Cursor uint64 `json:"cursor"`
}

type RedisManager struct {
	mu sync.Mutex
	clients map[string]*redisClient
}

// Calls: [c.close, m.mu.Lock, m.mu.Unlock]
func (m *RedisManager) Close(id string) { ... }

// Calls: [c.close, m.mu.Lock, m.mu.Unlock]
func (m *RedisManager) CloseAll() { ... }

// Calls: [errors.New, m.Get, m.Open, rc.info]
func (m *RedisManager) Connect(cfg core.ServerConfig) (RedisSessionInfo, error) { ... }

// Calls: [context.Background, errors.New, int, m.Get, rc.client.DBSize, rc.client.DBSize().Result, rc.do]
func (m *RedisManager) DBSize(id string) (int, error) { ... }

// Calls: [context.Background, errors.New, int, m.Get, rc.client.Del, rc.client.Del().Result, rc.do]
func (m *RedisManager) DelKeys(id string, keys []string) (int, error) { ... }

// Calls: [m.Close]
func (m *RedisManager) Disconnect(id string) error { ... }

// Calls: [context.Background, errors.New, formatRedisResult, m.Get, r.Result, rc.client.Do, rc.do, strings.Fields, strings.TrimSpace, toInterfaces]
func (m *RedisManager) ExecuteRawCommand(id string, command string) (map[string]any, error) { ... }

// Calls: [context.Background, errors.New, m.Get, rc.client.Expire, rc.client.Expire().Err, rc.client.Persist, rc.client.Persist().Err, rc.do, time.Duration]
func (m *RedisManager) ExpireKey(id string, key string, ttlSec int64) error { ... }

// Calls: [m.mu.Lock, m.mu.Unlock]
func (m *RedisManager) Get(id string) (*redisClient, bool) { ... }

// Calls: [context.Background, errors.New, fmt.Sprintf, int64, json.Unmarshal, m.Get, rc.client.Get, rc.client.Get().Result, rc.client.HGetAll, rc.client.HGetAll().Result, rc.client.LRange, rc.client.LRange().Result, rc.client.SMembers, rc.client.SMembers().Result, rc.client.TTL, rc.client.TTL().Result, rc.client.Type, rc.client.Type().Result, rc.client.XRevRangeN, rc.client.XRevRangeN().Result, rc.client.ZRangeWithScores, rc.client.ZRangeWithScores().Result, rc.do, strings.Join, ttl.Seconds]
func (m *RedisManager) GetKey(id string, key string) (RedisValue, error) { ... }

// Calls: [context.Background, errors.New, m.Get, rc.client.Info, rc.client.Info().Result, rc.do]
func (m *RedisManager) Info(id string, section string) (string, error) { ... }

// Calls: [m.ScanKeys, strconv.ParseUint]
func (m *RedisManager) Keys(id string, pattern string, cursorStr string) (RedisKeysResult, error) { ... }

func (m *RedisManager) KeyspaceNotify(id string, db int, event string) error { ... }

// Calls: [m.mu.Lock, m.mu.Unlock, string]
func (m *RedisManager) ListConnections() []map[string]any { ... }

// Calls: [errors.New, m.Get, rc.breaker.state]
func (m *RedisManager) ModeInfo(id string) (map[string]any, error) { ... }

// Calls: [context.Background, errors.New, int64, m.Get, rc.breaker.state, rc.client.Info, rc.client.Info().Result, rc.client.PoolStats, rc.do, string, strings.HasPrefix, strings.Split, strings.TrimPrefix, strings.TrimSpace]
func (m *RedisManager) Monitor(id string) (*RedisMonitorInfo, error) { ... }

// Calls: [cancel, context.Background, context.WithTimeout, fmt.Errorf, m.mu.Lock, m.mu.Unlock, newRedisClient, old.close, rc.client.Close, rc.client.Ping, rc.client.Ping().Err]
func (m *RedisManager) Open(id string, cfg core.ServerConfig) error { ... }

// Calls: [context.Background, errors.New, m.Get, rc.client.PSubscribe, rc.mu.Lock, rc.mu.Unlock]
func (m *RedisManager) PSubscribe(id string, pattern string) error { ... }

// Calls: [cerr.Error, cmd.Result, context.Background, err.Error, errors.New, fmt.Sprintf, goredis.NewCmd, m.Get, pipe.Exec, pipe.Process, pipeErr.Error, rc.client.Pipeline, rc.do, strings.Fields, strings.TrimSpace, toInterfaces]
func (m *RedisManager) Pipeline(id string, commands []string) (RedisPipelineResult, error) { ... }

// Calls: [context.Background, errors.New, m.Get, rc.client.Publish, rc.client.Publish().Result, rc.do]
func (m *RedisManager) Publish(id string, channel string, message string) (int64, error) { ... }

// Calls: [context.Background, errors.Is, errors.New, m.Get, rc.client.LPop, rc.client.LPop().Result, rc.do]
func (m *RedisManager) QueueDequeue(id string, queue string, mode string, timeout int) (*RedisQueueItem, error) { ... }

// Calls: [context.Background, errors.New, m.Get, rc.client.RPush, rc.client.RPush().Err, rc.do]
func (m *RedisManager) QueueEnqueue(id string, queue string, payload string, mode string) (string, error) { ... }

// Calls: [context.Background, errors.New, m.Get, rc.client.LLen, rc.client.LLen().Result, rc.do]
func (m *RedisManager) QueueLength(id string, queue string, mode string) (int64, error) { ... }

// Calls: [context.Background, errors.New, int, m.Get, rc.client.HDel, rc.client.HDel().Result, rc.do]
func (m *RedisManager) RedisHashFieldDel(id string, key string, fields []string) (int, error) { ... }

// Calls: [context.Background, errors.New, m.Get, rc.client.HGet, rc.client.HGet().Result, rc.do]
func (m *RedisManager) RedisHashFieldGet(id string, key string, field string) (string, error) { ... }

// Calls: [context.Background, errors.New, m.Get, rc.client.HSet, rc.client.HSet().Err, rc.do]
func (m *RedisManager) RedisHashFieldSet(id string, key string, field string, value string) error { ... }

// Calls: [context.Background, errors.New, m.Get, rc.client.LPop, rc.client.LPop().Result, rc.client.RPop, rc.client.RPop().Result, rc.do]
func (m *RedisManager) RedisListPop(id string, key string, left bool) (string, error) { ... }

// Calls: [context.Background, errors.New, int, m.Get, rc.client.LPush, rc.client.LPush().Result, rc.client.RPush, rc.client.RPush().Result, rc.do]
func (m *RedisManager) RedisListPush(id string, key string, value string, left bool) (int, error) { ... }

// Calls: [context.Background, errors.New, int, m.Get, rc.client.SAdd, rc.client.SAdd().Result, rc.do, toInterfaces]
func (m *RedisManager) RedisSetAdd(id string, key string, members []string) (int, error) { ... }

// Calls: [context.Background, errors.New, int, m.Get, rc.client.SRem, rc.client.SRem().Result, rc.do, toInterfaces]
func (m *RedisManager) RedisSetRem(id string, key string, members []string) (int, error) { ... }

// Calls: [context.Background, errors.New, int, m.Get, rc.client.Append, rc.client.Append().Result, rc.do]
func (m *RedisManager) RedisStringAppend(id string, key string, value string) (int, error) { ... }

// Calls: [context.Background, errors.New, int, m.Get, rc.client.ZAdd, rc.client.ZAdd().Result, rc.do]
func (m *RedisManager) RedisZSetAdd(id string, key string, member string, score float64) (int, error) { ... }

// Calls: [context.Background, errors.New, int, m.Get, rc.client.ZRem, rc.client.ZRem().Result, rc.do, toInterfaces]
func (m *RedisManager) RedisZSetRem(id string, key string, members []string) (int, error) { ... }

// Calls: [context.Background, errors.New, m.Get, rc.client.Rename, rc.client.Rename().Err, rc.do]
func (m *RedisManager) RenameKey(id string, oldKey string, newKey string) error { ... }

// Calls: [errors.New, fmt.Errorf, m.mu.Lock, m.mu.Unlock, strings.EqualFold, strings.TrimSpace]
func (m *RedisManager) ResolveID(idOrName string) (string, error) { ... }

// Calls: [context.Background, errors.New, int64, m.Get, rc.client.Scan, rc.client.Scan().Result, rc.client.TTL, rc.client.TTL().Result, rc.client.Type, rc.client.Type().Result, rc.do, ttl.Seconds]
func (m *RedisManager) ScanKeys(id string, pattern string, cursor uint64, count int64) (RedisKeysResult, error) { ... }

// Calls: [context.Background, errors.New, m.Get, rc.client.Do, rc.client.Do().Err, rc.do, strconv.Itoa]
func (m *RedisManager) SelectDB(id string, db int) error { ... }

// Calls: [context.Background, errors.New, fmt.Errorf, fmt.Sscanf, m.Get, pairsToMap, rc.client.Del, rc.client.Del().Err, rc.client.Expire, rc.client.Expire().Err, rc.client.HSet, rc.client.HSet().Err, rc.client.RPush, rc.client.RPush().Err, rc.client.SAdd, rc.client.SAdd().Err, rc.client.Set, rc.client.Set().Err, rc.client.XAdd, rc.client.XAdd().Err, rc.client.ZAdd, rc.client.ZAdd().Err, rc.do, splitLines, strings.Fields, strings.SplitN, strings.TrimSpace, time.Duration, toInterfaces, zsetToPairs]
func (m *RedisManager) SetKey(id string, key string, keyType string, value string, ttlSec int64) error { ... }

func (m *RedisManager) SlowLog(id string, count int) ([]RedisSlowLogEntry, error) { ... }

// Calls: [context.Background, errors.New, m.Get, rc.client.Subscribe, rc.mu.Lock, rc.mu.Unlock]
func (m *RedisManager) Subscribe(id string, channel string) error { ... }

// Calls: [errors.New, m.Get, rc.mu.Lock, rc.mu.Unlock]
func (m *RedisManager) Subscriptions(id string) ([]string, error) { ... }

// TestConnection 测试 Redis 服务器连通性并返回网络延迟
// Calls: [buildUniversalOptions, cancel, cli.Close, cli.Ping, cli.Ping().Err, context.Background, context.WithTimeout, fmt.Errorf, goredis.NewUniversalClient, time.Now, time.Since, time.Since().Milliseconds]
func (m *RedisManager) TestConnection(cfg core.ServerConfig) (map[string]any, error) { ... }

// Calls: [cerr.Error, cmd.Result, context.Background, err.Error, errors.Is, errors.New, fmt.Sprintf, goredis.NewCmd, m.Get, pipe.Exec, pipe.Process, rc.client.Watch, rc.do, strings.Fields, strings.TrimSpace, toInterfaces, tx.TxPipelined]
func (m *RedisManager) Transaction(id string, watch []string, commands []string) (RedisTransactionResult, error) { ... }

// Calls: [errors.New, m.Get, ps.Close, rc.mu.Lock, rc.mu.Unlock]
func (m *RedisManager) Unsubscribe(id string, channel string) error { ... }

type RedisMonitorInfo struct {
	Breaker string `json:"breaker"`
	Hits int64 `json:"hits"`
	Misses int64 `json:"misses"`
	Timeouts int64 `json:"timeouts"`
	TotalConns uint32 `json:"totalConns"`
	IdleConns uint32 `json:"idleConns"`
	StaleConns uint32 `json:"staleConns"`
	Mode string `json:"mode"`
	Serialization string `json:"serialization"`
	Version string `json:"version,omitempty"`
	MemoryUsed string `json:"memoryUsed,omitempty"`
	UptimeDays string `json:"uptimeDays,omitempty"`
	ConnectedClients string `json:"connectedClients,omitempty"`
}

type RedisPipelineResult struct {
	Results []RedisCmdResult `json:"results"`
	Error string `json:"error"`
}

type RedisQueueItem struct {
	ID string `json:"id"`
	Payload any `json:"payload"`
	Empty bool `json:"empty,omitempty"`
}

type RedisSessionInfo struct {
	ID string `json:"id"`
	ServerID string `json:"serverId"`
	Title string `json:"title"`
	Host string `json:"host"`
	Port int `json:"port"`
	DB int `json:"db"`
	Connected bool `json:"connected"`
}

type RedisSlowLogEntry struct {
	ID int64 `json:"id"`
	Timestamp int64 `json:"timestamp"`
	Duration int64 `json:"duration"`
	Command string `json:"command"`
	Client string `json:"client"`
}

type RedisTransactionResult struct {
	Results []RedisCmdResult `json:"results"`
	Aborted bool `json:"aborted"`
	Error string `json:"error"`
}

type RedisValue struct {
	Key string `json:"key"`
	Type string `json:"type"`
	TTL int64 `json:"ttl"`
	Value string `json:"value"`
	Size int64 `json:"size"`
	RawJSON any `json:"rawJson,omitempty"`
}

type circuitBreaker struct {
	failures int64
	threshold int64
	cooldown time.Duration
	// 纳秒时间戳；0 表示闭合
	openUntil int64
	// 1 成功 0 失败，用于状态展示
	lastResult int64
}

// Calls: [atomic.LoadInt64, time.Now, time.Now().UnixNano]
func (cb *circuitBreaker) allow() bool { ... }

// Calls: [atomic.AddInt64, atomic.StoreInt64, time.Now, time.Now().Add, time.Now().Add().UnixNano]
func (cb *circuitBreaker) onFailure() { ... }

// Calls: [atomic.StoreInt64]
func (cb *circuitBreaker) onSuccess() { ... }

// Calls: [atomic.LoadInt64, time.Now, time.Now().UnixNano]
func (cb *circuitBreaker) state() string { ... }

type redisClient struct {
	id string
	cfg core.ServerConfig
	client goredis.UniversalClient
	mode RedisMode
	ser RedisSerialization
	breaker *circuitBreaker
	mu sync.Mutex
	pubsubs map[string]*goredis.PubSub
	kssub *goredis.PubSub
}

// Calls: [ps.Close, rc.client.Close, rc.kssub.Close, rc.mu.Lock, rc.mu.Unlock]
func (rc *redisClient) close() { ... }

// Calls: [errors.Is, errors.New, fn, rc.breaker.allow, rc.breaker.onFailure, rc.breaker.onSuccess]
func (rc *redisClient) do(ctx context.Context, fn func(context.Context) error) error { ... }

// Calls: [rc.cfg.Label]
func (rc *redisClient) info() RedisSessionInfo { ... }

```

#### Functions

```go
func NewRedisManager() *RedisManager { ... }

// Calls: [cfg.Addr, string, strings.Split, strings.TrimSpace, time.Duration]
func buildUniversalOptions(cfg core.ServerConfig) *goredis.UniversalOptions { ... }

// Calls: [fmt.Sprintf, formatRedisResult, strconv.FormatFloat, strconv.FormatInt, string, strings.Join]
func formatRedisResult(v any) string { ... }

// Calls: [int64]
func newCircuitBreaker(threshold int, cooldown time.Duration) *circuitBreaker { ... }

// Calls: [RedisMode, RedisSerialization, buildUniversalOptions, goredis.NewUniversalClient, newCircuitBreaker, time.Duration]
func newRedisClient(id string, cfg core.ServerConfig) *redisClient { ... }

// pairsToMap 把 "k1\nv1\nk2\nv2" 解析为 map。
// Calls: [strings.Split]
func pairsToMap(s string) map[string]string { ... }

// Calls: [strings.Split, strings.TrimRight]
func splitLines(s string) []string { ... }

func toInterfaces(parts []string) []interface{} { ... }

// zsetToPairs 把 "m1\ns1\nm2\ns2" 解析为 [member, score] 对。
// Calls: [strings.Split]
func zsetToPairs(s string) [][2]string { ... }

```

---

### Package `services` (`services`)

- **Imports (35):** `context`, `encoding/base64`, `encoding/json`, `errors`, `fmt`, `github.com/cloudwego/eino/schema`, `github.com/google/uuid`, `github.com/wailsapp/wails/v3/pkg/application`, `os`, `os/exec`, `path/filepath`, `runtime`, `strings`, `sync`, `terminal/agent`, `terminal/agent/ask`, `terminal/agent/events`, `terminal/agent/guard`, `terminal/agent/mcp`, `terminal/agent/planner`, `terminal/agent/router`, `terminal/agent/skills`, `terminal/agent/store`, `terminal/agent/wiki`, `terminal/core`, `terminal/db`, `terminal/docker`, `terminal/k8s`, `terminal/logger`, `terminal/mongo`, `terminal/proto`, `terminal/redis`, `terminal/ssh`, `terminal/storage`, `time`

#### Constants & Variables

```go
const defaultApiTreeJson = `[
  {
    "id": "folder_default",
    "name": "默认分组",
    "isFolder": true,
    "createdAt": 1700000000000,
    "updatedAt": 1700000000000,
    "children": [
      {
        "id": "api_example_get",
        "name": "示例: GET 请求",
        "isFolder": false,
        "mode": "http",
        "method": "GET",
        "url": "https://httpbin.org/get",
        "params": [
          {
            "name": "test",
            "value": "123",
            "enabled": true
          }
        ],
        "headers": [],
        "bodyType": "none",
        "body": "",
        "auth": {
          "type": "none"
        },
        "timeoutMs": 30000,
        "insecureTLS": false,
        "followRedirects": true,
        "createdAt": 1700000000000,
        "updatedAt": 1700000000000
      }
    ]
  }
]`
var GlobalContainer *Container
var once sync.Once
```

#### Structs & Methods

```go
type AgentService struct {
	planCancelMap sync.Map
}

// Calls: [agent.DefaultRuntime.AskMgr.Answer]
func (s *AgentService) AgentAnswerAsk(askID string, answer string) bool { ... }

// Calls: [GetContainer, agent.DefaultRuntime.EventBus.Emit, agent.DefaultRuntime.Executor.ExecutePlan, agent.DefaultRuntime.PlanGate.Approve, agent.DefaultRuntime.Router.Resolve, agent.DefaultRuntime.SetCoreStore, agent.DefaultRuntime.SetManagers, agent.DefaultRuntime.Store.AddMessage, context.Background, context.WithCancel, err.Error, errors.New, fmt.Sprintf, logger.Errorf, logger.Infof, planCancel, planCtx.Err, report.String, report.WriteString, resolved.Model.Generate, s.planCancelMap.Delete, s.planCancelMap.Store, schema.SystemMessage, schema.UserMessage, stepsSummary.String, stepsSummary.WriteString, strings.TrimSpace, time.Now, time.Now().UnixNano]
func (s *AgentService) AgentApprovePlan(planID string) (bool, error) { ... }

// Calls: [cancel, s.planCancelMap.LoadAndDelete]
func (s *AgentService) AgentCancelPlan(planID string) bool { ... }

// Calls: [agent.DefaultManager.Storage, agent.DefaultManager.Storage().ClearHistory, agent.DefaultRuntime.Store.ClearSessionMessages]
func (s *AgentService) AgentClearHistory() error { ... }

// Calls: [agent.DefaultRuntime.HitlMgr.ResolveApproval]
func (s *AgentService) AgentConfirmTool(confirmID string, approved bool) bool { ... }

// Calls: [agent.DefaultRuntime.Store.CreateSession, errors.New, fmt.Sprintf, logger.Errorf, logger.Infof, strings.TrimSpace, time.Now, time.Now().UnixMilli]
func (s *AgentService) AgentCreateSession(title string) (store.SessionItem, error) { ... }

// Calls: [agent.DefaultRuntime.HitlMgr.ResolveApproval]
func (s *AgentService) AgentDecideApproval(confirmID string, approved bool, remember bool, reason string) bool { ... }

// Calls: [agent.DefaultRuntime.Store.DeleteSession, core.EmitEvent, errors.New, logger.Errorf, logger.Infof, planner.DeletePlan]
func (s *AgentService) AgentDeleteSession(sessionID string) error { ... }

// Calls: [agent.DefaultManager.GenerateSessionTitle, agent.DefaultRuntime.Store.UpdateSessionTitle, context.Background, core.EmitEvent, errors.New, s.AgentGetSessionMessages]
func (s *AgentService) AgentGenerateSessionTitle(sessionID string) (string, error) { ... }

// Calls: [agent.DefaultRuntime.GetActiveConnection]
func (s *AgentService) AgentGetActiveConnection() *agent.ActiveConnectionInfo { ... }

// Calls: [s.AgentGetSessionMessages]
func (s *AgentService) AgentGetHistory() ([]agent.FrontendMessage, error) { ... }

// Calls: [agent.DefaultRuntime.HitlMgr.ListPending]
func (s *AgentService) AgentGetPendingApprovals() []any { ... }

// Calls: [agent.DefaultRuntime.AskMgr.ListPending]
func (s *AgentService) AgentGetPendingAsks() []*ask.AskRequest { ... }

// Calls: [agent.DefaultRuntime.HitlMgr.ListPending]
func (s *AgentService) AgentGetPendingHitls() []*guard.HitlRequest { ... }

// Calls: [agent.DefaultRuntime.Store.ListMessages, filepath.Join, fmt.Sprintf, json.Unmarshal, planner.GetExistingPlan, planner.GetPlansDir]
func (s *AgentService) AgentGetSessionMessages(sessionID string) ([]agent.FrontendMessage, error) { ... }

// Calls: [agent.DefaultRuntime.SkillsReg.GetSkillsDir]
func (s *AgentService) AgentGetSkillsDir() string { ... }

// Calls: [GetContainer, agent.DefaultRuntime.WorkspaceMgr.GetDir, agent.DefaultRuntime.WorkspaceMgr.SetDir, c.Store.GetSettings]
func (s *AgentService) AgentGetWorkspaceDir() string { ... }

// Calls: [agent.DefaultRuntime.Store.ListSessions]
func (s *AgentService) AgentListSessions() ([]store.SessionItem, error) { ... }

// Calls: [agent.DefaultRuntime.SkillsReg.List]
func (s *AgentService) AgentListSkills() []skills.Skill { ... }

// Calls: [cmd.Start, exec.Command, fmt.Errorf, os.MkdirAll, s.AgentGetSkillsDir]
func (s *AgentService) AgentOpenSkillsDir() (string, error) { ... }

// Calls: [GetContainer, agent.DefaultManager.InitOrUpdate, agent.DefaultManager.SetSSHManager, agent.DefaultManager.StreamChat, agent.DefaultRuntime.EventBus.Emit, agent.DefaultRuntime.InitOrUpdate, agent.DefaultRuntime.PlanGate.Submit, agent.DefaultRuntime.SetCoreStore, agent.DefaultRuntime.SetManagers, agent.DefaultRuntime.Store.ListMessages, c.Store.GetSettings, context.Background, err.Error, guard.WithPlanningMode, json.Unmarshal, planner.SavePlanMarkdown, s.tryAutoGenerateTitle, strings.TrimSpace, time.Now, time.Now().UnixMilli]
func (s *AgentService) AgentProposePlan(sessionID string, objective string) (*planner.Plan, error) { ... }

// Calls: [agent.DefaultRuntime.HitlMgr.ResolveApproval]
func (s *AgentService) AgentResolveHitl(confirmID string, approved bool, reason string) bool { ... }

// Calls: [GetContainer, agent.DefaultRuntime.Executor.ExecuteSingleStepDirect, agent.DefaultRuntime.PlanGate.Get, agent.DefaultRuntime.SetCoreStore, agent.DefaultRuntime.SetManagers, context.Background, errors.New, fmt.Errorf, fmt.Sprintf, time.Now, time.Now().UnixNano]
func (s *AgentService) AgentRetryPlanStep(planID string, stepID string) (*planner.PlanStep, error) { ... }

// Calls: [s.AgentSaveSessionMessages]
func (s *AgentService) AgentSaveHistory(messages []agent.FrontendMessage) error { ... }

// Calls: [agent.DefaultRuntime.Store.CreateSession, agent.DefaultRuntime.Store.GetSession, agent.DefaultRuntime.Store.ReplaceMessages, agent.DefaultRuntime.Store.TouchSession, json.Marshal, string]
func (s *AgentService) AgentSaveSessionMessages(sessionID string, messages []agent.FrontendMessage) error { ... }

// Calls: [GetContainer, agent.DefaultRuntime.InitOrUpdate, agent.DefaultRuntime.WorkspaceMgr.SetDir, c.Store.GetSettings, c.Store.SaveSettings, core.OpenDirectoryDialog]
func (s *AgentService) AgentSelectWorkspaceDir() (string, error) { ... }

// Calls: [GetContainer, agent.DefaultManager.InitOrUpdate, agent.DefaultManager.SetSSHManager, agent.DefaultManager.StreamChat, agent.DefaultRuntime.EventBus.Emit, agent.DefaultRuntime.InitOrUpdate, agent.DefaultRuntime.SetCoreStore, agent.DefaultRuntime.SetManagers, c.Store.GetSettings, context.Background, err.Error, logger.Errorf, logger.Infof, s.tryAutoGenerateTitle, strings.TrimSpace]
func (s *AgentService) AgentSend(sessionID string, messages []agent.FrontendMessage) (string, error) { ... }

// Calls: [agent.DefaultRuntime.SetActiveConnection]
func (s *AgentService) AgentSetActiveConnection(info agent.ActiveConnectionInfo) { ... }

// Calls: [GetContainer, agent.DefaultRuntime.InitOrUpdate, agent.DefaultRuntime.WorkspaceMgr.SetDir, c.Store.GetSettings, c.Store.SaveSettings]
func (s *AgentService) AgentSetWorkspaceDir(dir string) string { ... }

// Calls: [agent.DefaultManager.StopChat, logger.Infof]
func (s *AgentService) AgentStopSend(sessionID string) bool { ... }

// Calls: [agent.DefaultRuntime.Store.UpdateSessionTitle, core.EmitEvent, errors.New, logger.Errorf, logger.Infof, strings.TrimSpace]
func (s *AgentService) AgentUpdateSessionTitle(sessionID string, title string) error { ... }

// Calls: [agent.DefaultManager.GenerateSessionTitle, agent.DefaultRuntime.Store.CreateSession, agent.DefaultRuntime.Store.GetSession, agent.DefaultRuntime.Store.UpdateSessionTitle, context.Background, core.EmitEvent, strings.TrimSpace]
func (s *AgentService) tryAutoGenerateTitle(sessionID string, messages []agent.FrontendMessage, assistantReply string) { ... }

type ApiService struct {
	mu sync.Mutex
}

// Calls: [logger.Errorf, logger.Infof, proto.HttpApiRequest]
func (s *ApiService) ApiRequest(req proto.ApiRequest) (proto.ApiResponse, error) { ... }

// ChooseExportApiFile 弹出文件保存对话框，将内容写入用户指定的路径
// Calls: [core.SaveFileDialog, storage.WriteFileAtomic]
func (s *ApiService) ChooseExportApiFile(content string, defaultName string) (string, error) { ... }

// ChooseImportApiFile 弹出文件选择对话框，读取用户选择的 JSON 文件内容
// Calls: [core.OpenFileDialog, os.ReadFile, string]
func (s *ApiService) ChooseImportApiFile() (string, error) { ... }

// LoadApiTree 读取本地接口树文件内容。如果文件不存在则自动创建并写入默认接口树
// Calls: [os.IsNotExist, os.ReadFile, s.mu.Lock, s.mu.Unlock, storage.ApisPath, storage.WriteFileAtomic, string]
func (s *ApiService) LoadApiTree() (string, error) { ... }

// SaveApiTree 保存接口树数据到本地文件
// Calls: [s.mu.Lock, s.mu.Unlock, storage.ApisPath, storage.WriteFileAtomic]
func (s *ApiService) SaveApiTree(content string) error { ... }

// Calls: [GetContainer, GetContainer().WsMgr.WsClose, logger.Infof]
func (s *ApiService) WsClose(id string) { ... }

// Calls: [GetContainer, GetContainer().WsMgr.WsConnect, logger.Errorf, logger.Infof]
func (s *ApiService) WsConnect(req proto.WsConnectRequest) (proto.WsConnectResult, error) { ... }

// Calls: [GetContainer, GetContainer().WsMgr.WsSend, logger.Errorf, logger.Infof]
func (s *ApiService) WsSend(id string, message string) error { ... }

// Calls: [storage.ApisPath]
func (s *ApiService) getApiPath() (string, error) { ... }

// ConfigIOResult 描述配置导入/导出操作的结果
type ConfigIOResult struct {
	Success bool `json:"success"`
	Cancelled bool `json:"cancelled"`
	FilePath string `json:"filePath"`
	ServersCount int `json:"serversCount"`
	GroupsCount int `json:"groupsCount"`
	Message string `json:"message"`
}

type Container struct {
	Store *core.Store
	Sessions *ssh.SessionManager
	Transfers *ssh.TransferManager
	RedisMgr *redis.RedisManager
	MqttMgr *proto.MqttManager
	MongoMgr *mongo.MongoManager
	WsMgr *proto.WsManager
	MysqlMgr *db.MysqlManagerEx
	PostgresMgr *db.PostgresManager
	SqliteMgr *db.SqliteManager
	DockerMgr *docker.DockerManager
	K8sMgr *k8s.K8sManager
	McpServer *mcp.Server
}

// Calls: [c.DockerMgr.CloseAll, c.K8sMgr.CloseAll, c.McpServer.Stop, c.MongoMgr.CloseAll, c.MqttMgr.CloseAll, c.MysqlMgr.CloseAll, c.PostgresMgr.CloseAll, c.RedisMgr.CloseAll, c.Sessions.CloseAll, c.SqliteMgr.CloseAll, c.Transfers.CancelAll, c.WsMgr.CloseAll]
func (c *Container) Shutdown(ctx context.Context) { ... }

// Calls: [agent.DefaultManager.SetContext, agent.DefaultRuntime.InitOrUpdate, agent.DefaultRuntime.SetCoreStore, agent.DefaultRuntime.SetManagers, c.DockerMgr.SetContext, c.K8sMgr.SetContext, c.McpServer.Start, c.MongoMgr.SetContext, c.MqttMgr.SetContext, c.MysqlMgr.SetContext, c.Sessions.SetContext, c.SqliteMgr.SetContext, c.Store.GetSettings, c.Transfers.SetContext, c.WsMgr.SetContext, logger.Errorf, logger.Info, logger.Warnf]
func (c *Container) Startup(ctx context.Context) { ... }

// DockerGenerateComposeRequest 描述 AI 生成 Docker Compose 请求参数。
type DockerGenerateComposeRequest struct {
	Images []string `json:"images"`
	Prompt string `json:"prompt"`
}

// DockerService 导出给 Wails 的 Docker 管理服务接口。
type DockerService struct {
}

// DockerClose 关闭指定 ID 的 Docker 连接。
// Calls: [GetContainer, GetContainer().DockerMgr.Disconnect, logger.Infof]
func (s *DockerService) DockerClose(id string) error { ... }

// DockerConnect 连接指定 ID 的 Docker 实例。
// Calls: [GetContainer, c.DockerMgr.Connect, c.Store.Get, errors.New, logger.Errorf, logger.Infof]
func (s *DockerService) DockerConnect(id string) (bool, error) { ... }

// DockerControlComposeStack 控制 Compose 项目（start, stop, restart, down, remove）。
// Calls: [GetContainer, GetContainer().DockerMgr.GetClient, cancel, cli.ControlComposeStack, context.Background, context.WithTimeout]
func (s *DockerService) DockerControlComposeStack(id string, projectName string, action string) error { ... }

// DockerControlContainer 控制容器生命周期（start, stop, restart, pause, unpause, remove）。
// Calls: [GetContainer, GetContainer().DockerMgr.GetClient, cancel, cli.PauseContainer, cli.RemoveContainer, cli.RestartContainer, cli.StartContainer, cli.StopContainer, cli.UnpauseContainer, context.Background, context.WithTimeout, fmt.Errorf, logger.Errorf, logger.Infof, strings.ToLower]
func (s *DockerService) DockerControlContainer(id string, containerID string, action string) error { ... }

// DockerCreateContainer 创建新容器。
// Calls: [GetContainer, GetContainer().DockerMgr.GetClient, cancel, cli.CreateContainer, context.Background, context.WithTimeout, logger.Errorf, logger.Infof]
func (s *DockerService) DockerCreateContainer(id string, req docker.DockerCreateContainerReq) (string, error) { ... }

// DockerCreateNetwork 创建网络。
// Calls: [GetContainer, GetContainer().DockerMgr.GetClient, cancel, cli.CreateNetwork, context.Background, context.WithTimeout]
func (s *DockerService) DockerCreateNetwork(id string, name string, driver string) (string, error) { ... }

// DockerCreateVolume 创建数据卷。
// Calls: [GetContainer, GetContainer().DockerMgr.GetClient, cancel, cli.CreateVolume, context.Background, context.WithTimeout]
func (s *DockerService) DockerCreateVolume(id string, name string, driver string, labels map[string]string) (*docker.DockerVolumeInfo, error) { ... }

// DockerDeleteComposeRecord 强力联动删除 Compose 记录（同时清理关联容器和网络）。
// Calls: [GetContainer, c.DockerMgr.GetClient, c.Store.DeleteComposeRecord, c.Store.GetComposeRecord, cancel, cli.ControlComposeStack, context.Background, context.WithTimeout, errors.New]
func (s *DockerService) DockerDeleteComposeRecord(serverId string, id string) error { ... }

// DockerDeployComposeStack 部署/更新 Compose 项目。
// Calls: [GetContainer, GetContainer().DockerMgr.GetClient, cancel, cli.DeployComposeStack, context.Background, context.WithTimeout]
func (s *DockerService) DockerDeployComposeStack(id string, req docker.DockerComposeDeployReq) error { ... }

// DockerExecClose 关闭指定 Docker 容器终端会话。
// Calls: [GetContainer, c.DockerMgr.ExecMgr.Close]
func (s *DockerService) DockerExecClose(execId string) error { ... }

// DockerExecResize 调整 Docker 容器终端会话行列尺寸。
// Calls: [GetContainer, c.DockerMgr.ExecMgr.Resize, c.DockerMgr.GetClient, errors.New]
func (s *DockerService) DockerExecResize(serverId string, execId string, cols int, rows int) error { ... }

// DockerExecStart 启动指定 Docker 容器的交互式终端会话。
// Calls: [GetContainer, c.DockerMgr.ExecMgr.StartExec, c.DockerMgr.GetClient, errors.New]
func (s *DockerService) DockerExecStart(serverId string, containerId string, command string, cols int, rows int) (string, error) { ... }

// DockerExecWrite 写入数据到指定 Docker 容器终端会话。
// Calls: [GetContainer, c.DockerMgr.ExecMgr.Write, errors.New]
func (s *DockerService) DockerExecWrite(execId string, data string) error { ... }

// DockerGenerateCompose 使用专职 Agent 生成 Docker Compose 配置。
// Calls: [GetContainer, agent.DefaultRuntime.InitOrUpdate, agent.GenerateDockerCompose, c.Store.GetSettings, context.Background]
func (s *DockerService) DockerGenerateCompose(req DockerGenerateComposeRequest) (string, error) { ... }

// DockerGetComposeRecord 获取特定 Compose 记录详情。
// Calls: [GetContainer, c.Store.GetComposeRecord, errors.New]
func (s *DockerService) DockerGetComposeRecord(id string) (*core.DockerComposeRecord, error) { ... }

// DockerGetComposeStack 获取特定 Compose 项目详情。
// Calls: [GetContainer, GetContainer().DockerMgr.GetClient, cancel, cli.GetComposeStack, context.Background, context.WithTimeout]
func (s *DockerService) DockerGetComposeStack(id string, projectName string) (*docker.DockerComposeStackInfo, error) { ... }

// DockerGetComposeStackLogs 获取 Compose 项目聚合日志。
// Calls: [GetContainer, GetContainer().DockerMgr.GetClient, cancel, cli.GetComposeStackLogs, context.Background, context.WithTimeout]
func (s *DockerService) DockerGetComposeStackLogs(id string, projectName string, tail int) (string, error) { ... }

// DockerGetContainerLogs 获取容器日志。
// Calls: [GetContainer, GetContainer().DockerMgr.GetClient, cancel, cli.GetContainerLogs, context.Background, context.WithTimeout]
func (s *DockerService) DockerGetContainerLogs(id string, containerID string, tail int, timestamps bool) (string, error) { ... }

// DockerGetOverview 获取概览信息。
// Calls: [GetContainer, GetContainer().DockerMgr.GetClient, cancel, cli.GetOverview, context.Background, context.WithTimeout]
func (s *DockerService) DockerGetOverview(id string) (*docker.DockerOverview, error) { ... }

// DockerInspectContainer 查看容器 Inspect 详情。
// Calls: [GetContainer, GetContainer().DockerMgr.GetClient, cancel, cli.InspectContainer, context.Background, context.WithTimeout]
func (s *DockerService) DockerInspectContainer(id string, containerID string) (string, error) { ... }

// DockerInspectImage 查看镜像 Inspect 详情。
// Calls: [GetContainer, GetContainer().DockerMgr.GetClient, cancel, cli.InspectImage, context.Background, context.WithTimeout]
func (s *DockerService) DockerInspectImage(id string, imageID string) (string, error) { ... }

// DockerListComposeRecords 获取指定 Docker 服务器的本地 Compose 记录。
// Calls: [GetContainer, c.Store.ListComposeRecords]
func (s *DockerService) DockerListComposeRecords(serverId string) ([]core.DockerComposeRecord, error) { ... }

// DockerListComposeStacks 获取所有 Compose 项目。
// Calls: [GetContainer, GetContainer().DockerMgr.GetClient, cancel, cli.ListComposeStacks, context.Background, context.WithTimeout]
func (s *DockerService) DockerListComposeStacks(id string) ([]docker.DockerComposeStackInfo, error) { ... }

// DockerListContainers 获取容器列表。
// Calls: [GetContainer, GetContainer().DockerMgr.GetClient, cancel, cli.ListContainers, context.Background, context.WithTimeout]
func (s *DockerService) DockerListContainers(id string, all bool) ([]docker.DockerContainerInfo, error) { ... }

// DockerListImages 获取镜像列表。
// Calls: [GetContainer, GetContainer().DockerMgr.GetClient, cancel, cli.ListImages, context.Background, context.WithTimeout]
func (s *DockerService) DockerListImages(id string) ([]docker.DockerImageInfo, error) { ... }

// DockerListNetworks 获取网络列表。
// Calls: [GetContainer, GetContainer().DockerMgr.GetClient, cancel, cli.ListNetworks, context.Background, context.WithTimeout]
func (s *DockerService) DockerListNetworks(id string) ([]docker.DockerNetworkInfo, error) { ... }

// DockerListVolumes 获取数据卷列表。
// Calls: [GetContainer, GetContainer().DockerMgr.GetClient, cancel, cli.ListVolumes, context.Background, context.WithTimeout]
func (s *DockerService) DockerListVolumes(id string) ([]docker.DockerVolumeInfo, error) { ... }

// DockerLoadImage 弹出选择文件对话框并从本地 tar 包导入镜像。
// Calls: [GetContainer, GetContainer().DockerMgr.GetClient, cancel, cli.LoadImage, context.Background, context.WithTimeout, core.OpenFileDialog]
func (s *DockerService) DockerLoadImage(id string) (string, error) { ... }

// DockerPing 检测连接状态。
// Calls: [GetContainer, GetContainer().DockerMgr.GetClient, cancel, cli.Ping, context.Background, context.WithTimeout]
func (s *DockerService) DockerPing(id string) (string, error) { ... }

// DockerPullImage 在线拉取镜像。
// Calls: [GetContainer, GetContainer().DockerMgr.GetClient, cancel, cli.PullImage, context.Background, context.WithTimeout, logger.Errorf, logger.Infof]
func (s *DockerService) DockerPullImage(id string, imageName string) (string, error) { ... }

// DockerRemoveImage 删除镜像。
// Calls: [GetContainer, GetContainer().DockerMgr.GetClient, cancel, cli.RemoveImage, context.Background, context.WithTimeout, logger.Errorf, logger.Infof]
func (s *DockerService) DockerRemoveImage(id string, imageID string, force bool) error { ... }

// DockerRemoveNetwork 删除网络。
// Calls: [GetContainer, GetContainer().DockerMgr.GetClient, cancel, cli.RemoveNetwork, context.Background, context.WithTimeout]
func (s *DockerService) DockerRemoveNetwork(id string, networkID string) error { ... }

// DockerRemoveVolume 删除数据卷。
// Calls: [GetContainer, GetContainer().DockerMgr.GetClient, cancel, cli.RemoveVolume, context.Background, context.WithTimeout]
func (s *DockerService) DockerRemoveVolume(id string, name string, force bool) error { ... }

// DockerSaveComposeRecord 保存/创建本地 Compose 记录。
// Calls: [GetContainer, c.Store.SaveComposeRecord, errors.New]
func (s *DockerService) DockerSaveComposeRecord(record core.DockerComposeRecord) (*core.DockerComposeRecord, error) { ... }

// DockerSaveImage 弹出保存文件对话框并将镜像导出保存为本地 tar 压缩包。
// Calls: [GetContainer, GetContainer().DockerMgr.GetClient, cancel, cli.SaveImage, context.Background, context.WithTimeout, core.SaveFileDialog, strings.HasSuffix, strings.ReplaceAll, strings.ToLower]
func (s *DockerService) DockerSaveImage(id string, imageIDOrTag string, defaultFilename string) (string, error) { ... }

// DockerSystemPrune 执行系统清理。
// Calls: [GetContainer, GetContainer().DockerMgr.GetClient, cancel, cli.SystemPrune, context.Background, context.WithTimeout]
func (s *DockerService) DockerSystemPrune(id string, pruneContainers bool, pruneImages bool, pruneVolumes bool, pruneNetworks bool) (*docker.DockerPruneReport, error) { ... }

// DockerTestConnection 测试指定配置的连通性。
// Calls: [cancel, cli.Close, cli.Ping, context.Background, context.WithTimeout, docker.NewDockerClient, fmt.Errorf, fmt.Sprintf, logger.Errorf, logger.Infof]
func (s *DockerService) DockerTestConnection(cfg core.ServerConfig) (string, error) { ... }

// DockerUpComposeStack 执行类似 docker compose up 的智能增量更新，仅在实例创建/启动成功后才同步保存本地 YAML。
// Calls: [GetContainer, c.DockerMgr.GetClient, c.Store.SaveComposeRecord, cancel, cli.UpComposeStack, context.Background, context.WithTimeout, errors.New, fmt.Errorf, logger.Errorf, logger.Infof, uuid.New, uuid.New().String]
func (s *DockerService) DockerUpComposeStack(serverId string, record core.DockerComposeRecord, forcePull bool, recreate bool) (*core.DockerComposeRecord, error) { ... }

// K8sGenerateYAMLRequest 描述 AI 生成 YAML 请求参数。
type K8sGenerateYAMLRequest struct {
	Namespace string `json:"namespace"`
	Kinds []string `json:"kinds"`
	Images []string `json:"images"`
	Prompt string `json:"prompt"`
}

// K8sService 导出给 Wails 的 Kubernetes 集群管理服务接口。
type K8sService struct {
}

// K8sApplyOrchestration 部署并保存 Kubernetes YAML 编排。严格遵循后验强一致性：先部署，成功后再落盘。
// Calls: [GetContainer, c.K8sMgr.GetClient, c.Store.SaveK8sOrchestrationRecord, cancel, cli.ApplyYAML, context.Background, context.WithTimeout, errors.New, fmt.Errorf, k8s.ParseYAMLResourceSummaries, logger.Errorf, logger.Infof, logger.Warnf]
func (s *K8sService) K8sApplyOrchestration(serverId string, record core.K8sOrchestrationRecord) ([]k8s.K8sApplyResult, error) { ... }

// K8sApplyYAML 声明式部署并应用 YAML 资源清单。
// Calls: [GetContainer, GetContainer().K8sMgr.GetClient, cancel, cli.ApplyYAML, context.Background, context.WithTimeout]
func (s *K8sService) K8sApplyYAML(id string, yamlContent string) ([]k8s.K8sApplyResult, error) { ... }

// K8sClose 关闭指定 ID 的 K8s 连接。
// Calls: [GetContainer, GetContainer().K8sMgr.Disconnect, logger.Infof]
func (s *K8sService) K8sClose(id string) error { ... }

// K8sConnect 连接指定 ID 的 K8s 集群。
// Calls: [GetContainer, c.K8sMgr.Connect, c.Store.Get, errors.New, logger.Errorf, logger.Infof]
func (s *K8sService) K8sConnect(id string) (bool, error) { ... }

// K8sCreateNamespace 创建新命名空间。
// Calls: [GetContainer, GetContainer().K8sMgr.GetClient, cancel, cli.CreateNamespace, context.Background, context.WithTimeout]
func (s *K8sService) K8sCreateNamespace(id string, name string) error { ... }

// K8sDeleteConfigMap 删除指定 ConfigMap。
// Calls: [GetContainer, GetContainer().K8sMgr.GetClient, cancel, cli.DeleteConfigMap, context.Background, context.WithTimeout]
func (s *K8sService) K8sDeleteConfigMap(id string, namespace string, name string) error { ... }

// K8sDeleteDeployment 删除指定 Deployment。
// Calls: [GetContainer, GetContainer().K8sMgr.GetClient, cancel, cli.DeleteDeployment, context.Background, context.WithTimeout]
func (s *K8sService) K8sDeleteDeployment(id string, namespace string, name string) error { ... }

// K8sDeleteIngress 删除指定 Ingress。
// Calls: [GetContainer, GetContainer().K8sMgr.GetClient, cancel, cli.DeleteIngress, context.Background, context.WithTimeout]
func (s *K8sService) K8sDeleteIngress(id string, namespace string, name string) error { ... }

// K8sDeleteNamespace 删除指定命名空间。
// Calls: [GetContainer, GetContainer().K8sMgr.GetClient, cancel, cli.DeleteNamespace, context.Background, context.WithTimeout]
func (s *K8sService) K8sDeleteNamespace(id string, name string) error { ... }

// K8sDeleteOrchestrationRecordOnly 仅删除本地编排记录，不下线集群中的资源。
// Calls: [GetContainer, c.Store.DeleteK8sOrchestrationRecord]
func (s *K8sService) K8sDeleteOrchestrationRecordOnly(recordId string) error { ... }

// K8sDeletePVC 删除指定 PVC。
// Calls: [GetContainer, GetContainer().K8sMgr.GetClient, cancel, cli.DeletePVC, context.Background, context.WithTimeout]
func (s *K8sService) K8sDeletePVC(id string, namespace string, name string) error { ... }

// K8sDeletePod 删除指定 Pod。
// Calls: [GetContainer, GetContainer().K8sMgr.GetClient, cancel, cli.DeletePod, context.Background, context.WithTimeout, logger.Errorf, logger.Infof]
func (s *K8sService) K8sDeletePod(id string, namespace string, podName string) error { ... }

// K8sDeleteSecret 删除指定 Secret。
// Calls: [GetContainer, GetContainer().K8sMgr.GetClient, cancel, cli.DeleteSecret, context.Background, context.WithTimeout]
func (s *K8sService) K8sDeleteSecret(id string, namespace string, name string) error { ... }

// K8sDeleteService 删除指定 Service。
// Calls: [GetContainer, GetContainer().K8sMgr.GetClient, cancel, cli.DeleteService, context.Background, context.WithTimeout]
func (s *K8sService) K8sDeleteService(id string, namespace string, name string) error { ... }

// K8sDeleteYAML 声明式删除并下线 YAML 资源清单中的资源。
// Calls: [GetContainer, GetContainer().K8sMgr.GetClient, cancel, cli.DeleteYAML, context.Background, context.WithTimeout]
func (s *K8sService) K8sDeleteYAML(id string, yamlContent string) ([]k8s.K8sDeleteResult, error) { ... }

// K8sExecClose 关闭指定终端会话。
// Calls: [GetContainer, GetContainer().K8sMgr.ExecMgr.Close]
func (s *K8sService) K8sExecClose(execID string) error { ... }

// K8sExecResize 调整终端会话尺寸。
// Calls: [GetContainer, GetContainer().K8sMgr.ExecMgr.Resize]
func (s *K8sService) K8sExecResize(execID string, cols int, rows int) error { ... }

// K8sExecStart 启动指定 Pod 容器的交互式终端会话。
// Calls: [GetContainer, c.K8sMgr.ExecMgr.StartExec, c.K8sMgr.GetClient]
func (s *K8sService) K8sExecStart(id string, namespace string, podName string, container string, command string, cols int, rows int) (string, error) { ... }

// K8sExecWrite 写入数据到指定终端会话。
// Calls: [GetContainer, GetContainer().K8sMgr.ExecMgr.Write]
func (s *K8sService) K8sExecWrite(execID string, data string) error { ... }

// K8sGenerateYAML 使用专职 Agent 生成 Kubernetes YAML 配置。
// Calls: [GetContainer, agent.DefaultRuntime.InitOrUpdate, agent.GenerateK8sYAML, c.Store.GetSettings, context.Background]
func (s *K8sService) K8sGenerateYAML(req K8sGenerateYAMLRequest) (string, error) { ... }

// K8sGetOrchestrationRecord 获取单个 K8s 编排记录详情。
// Calls: [GetContainer, c.Store.GetK8sOrchestrationRecord]
func (s *K8sService) K8sGetOrchestrationRecord(id string) (*core.K8sOrchestrationRecord, error) { ... }

// K8sGetOverview 获取集群概览。
// Calls: [GetContainer, GetContainer().K8sMgr.GetClient, cancel, cli.GetOverview, context.Background, context.WithTimeout]
func (s *K8sService) K8sGetOverview(id string) (*k8s.K8sOverview, error) { ... }

// K8sGetPodLogs 获取 Pod 容器日志。
// Calls: [GetContainer, GetContainer().K8sMgr.GetClient, cancel, cli.GetPodLogs, context.Background, context.WithTimeout]
func (s *K8sService) K8sGetPodLogs(id string, namespace string, podName string, containerName string, tail int, timestamps bool) (string, error) { ... }

// K8sGetResourceYAML 获取指定资源的 YAML 文本。
// Calls: [GetContainer, GetContainer().K8sMgr.GetClient, cancel, cli.GetResourceYAML, context.Background, context.WithTimeout]
func (s *K8sService) K8sGetResourceYAML(id string, kind string, namespace string, name string) (string, error) { ... }

// K8sListConfigMaps 获取 ConfigMap 列表。
// Calls: [GetContainer, GetContainer().K8sMgr.GetClient, cancel, cli.ListConfigMaps, context.Background, context.WithTimeout]
func (s *K8sService) K8sListConfigMaps(id string, namespace string) ([]k8s.K8sConfigMapInfo, error) { ... }

// K8sListDeployments 获取 Deployment 列表。
// Calls: [GetContainer, GetContainer().K8sMgr.GetClient, cancel, cli.ListDeployments, context.Background, context.WithTimeout]
func (s *K8sService) K8sListDeployments(id string, namespace string) ([]k8s.K8sDeploymentInfo, error) { ... }

// K8sListIngresses 获取 Ingress 列表。
// Calls: [GetContainer, GetContainer().K8sMgr.GetClient, cancel, cli.ListIngresses, context.Background, context.WithTimeout]
func (s *K8sService) K8sListIngresses(id string, namespace string) ([]k8s.K8sIngressInfo, error) { ... }

// K8sListNamespaces 获取所有命名空间。
// Calls: [GetContainer, GetContainer().K8sMgr.GetClient, cancel, cli.ListNamespaces, context.Background, context.WithTimeout]
func (s *K8sService) K8sListNamespaces(id string) ([]k8s.K8sNamespaceInfo, error) { ... }

// K8sListNodes 获取所有节点。
// Calls: [GetContainer, GetContainer().K8sMgr.GetClient, cancel, cli.ListNodes, context.Background, context.WithTimeout]
func (s *K8sService) K8sListNodes(id string) ([]k8s.K8sNodeInfo, error) { ... }

// K8sListOrchestrationRecords 获取指定集群本地持久化存储的 K8s 编排记录。
// Calls: [GetContainer, c.Store.ListK8sOrchestrationRecords]
func (s *K8sService) K8sListOrchestrationRecords(serverId string) []core.K8sOrchestrationRecord { ... }

// K8sListPVCs 获取 PVC 列表。
// Calls: [GetContainer, GetContainer().K8sMgr.GetClient, cancel, cli.ListPVCs, context.Background, context.WithTimeout]
func (s *K8sService) K8sListPVCs(id string, namespace string) ([]k8s.K8sPVCInfo, error) { ... }

// K8sListPods 获取指定命名空间（或全量）的 Pod 列表。
// Calls: [GetContainer, GetContainer().K8sMgr.GetClient, cancel, cli.ListPods, context.Background, context.WithTimeout]
func (s *K8sService) K8sListPods(id string, namespace string) ([]k8s.K8sPodInfo, error) { ... }

// K8sListSecrets 获取 Secret 列表。
// Calls: [GetContainer, GetContainer().K8sMgr.GetClient, cancel, cli.ListSecrets, context.Background, context.WithTimeout]
func (s *K8sService) K8sListSecrets(id string, namespace string) ([]k8s.K8sSecretInfo, error) { ... }

// K8sListServices 获取 Service 列表。
// Calls: [GetContainer, GetContainer().K8sMgr.GetClient, cancel, cli.ListServices, context.Background, context.WithTimeout]
func (s *K8sService) K8sListServices(id string, namespace string) ([]k8s.K8sServiceInfo, error) { ... }

// K8sOfflineOrchestration 下线指定的编排资源，支持同时删除本地记录或标记为已下线。
// Calls: [GetContainer, c.K8sMgr.GetClient, c.Store.DeleteK8sOrchestrationRecord, c.Store.GetK8sOrchestrationRecord, c.Store.SaveK8sOrchestrationRecord, cancel, cli.DeleteYAML, context.Background, context.WithTimeout, fmt.Errorf]
func (s *K8sService) K8sOfflineOrchestration(serverId string, recordId string, deleteLocalFile bool) ([]k8s.K8sDeleteResult, error) { ... }

// K8sParseKubeconfig 解析 Kubeconfig 文本或文件获取上下文列表。
// Calls: [k8s.ParseKubeconfigInfo]
func (s *K8sService) K8sParseKubeconfig(kubeconfigData string, kubeconfigPath string) (*k8s.KubeconfigContextInfo, error) { ... }

// K8sPing 检测连接状态。
// Calls: [GetContainer, GetContainer().K8sMgr.GetClient, cancel, cli.Ping, context.Background, context.WithTimeout]
func (s *K8sService) K8sPing(id string) (string, error) { ... }

// K8sRestartDeployment 触发 Deployment 滚动重启。
// Calls: [GetContainer, GetContainer().K8sMgr.GetClient, cancel, cli.RestartDeployment, context.Background, context.WithTimeout, logger.Errorf, logger.Infof]
func (s *K8sService) K8sRestartDeployment(id string, namespace string, name string) error { ... }

// K8sScaleDeployment 动态调整 Deployment 副本数。
// Calls: [GetContainer, GetContainer().K8sMgr.GetClient, cancel, cli.ScaleDeployment, context.Background, context.WithTimeout, logger.Errorf, logger.Infof]
func (s *K8sService) K8sScaleDeployment(id string, namespace string, name string, replicas int32) error { ... }

// K8sTestConnection 测试指定配置的连通性。
// Calls: [cancel, cli.Close, cli.GetOverview, cli.Ping, context.Background, context.WithTimeout, fmt.Errorf, fmt.Sprintf, k8s.NewK8sClient, logger.Errorf, logger.Info, logger.Infof]
func (s *K8sService) K8sTestConnection(cfg core.ServerConfig) (string, error) { ... }

type McpService struct {
}

// GetMcpServerStatus 获取当前内置 MCP Server 的运行状态指标
// Calls: [GetContainer, c.McpServer.Status]
func (s *McpService) GetMcpServerStatus() (mcp.ServerStatus, error) { ... }

// GetMcpSessions 获取当前已连接的外部 MCP 客户端会话列表
// Calls: [GetContainer, c.McpServer.ListSessions]
func (s *McpService) GetMcpSessions() ([]mcp.SessionInfo, error) { ... }

// GetMcpTools 获取已注册且对外暴露的标准 MCP 工具定义列表
// Calls: [GetContainer, adapter.ListTools, context.Background, mcp.NewToolAdapter]
func (s *McpService) GetMcpTools() ([]mcp.ToolDefinition, error) { ... }

// RestartMcpServer 根据当前最新 AppSettings 重启或平滑启停 MCP Server
// Calls: [GetContainer, c.McpServer.SetAdapter, c.McpServer.Start, c.McpServer.Status, c.McpServer.Stop, c.Store.GetSettings, logger.Errorf, logger.Infof, mcp.NewToolAdapter]
func (s *McpService) RestartMcpServer() (mcp.ServerStatus, error) { ... }

type MongoService struct {
}

// Calls: [GetContainer, GetContainer().MongoMgr.MongoAggregate, logger.Errorf, logger.Infof]
func (s *MongoService) MongoAggregate(id string, dbName string, coll string, pipelineJSON string, allowDiskUse bool, maxTimeMS int) (mongo.MongoFindResult, error) { ... }

// Calls: [GetContainer, GetContainer().MongoMgr.MongoAggregateExplain]
func (s *MongoService) MongoAggregateExplain(id string, dbName string, coll string, pipelineJSON string) (string, error) { ... }

// Calls: [GetContainer, GetContainer().MongoMgr.MongoBulkWrite, logger.Infof]
func (s *MongoService) MongoBulkWrite(id string, dbName string, coll string, ops []mongo.MongoBulkOp, ordered bool) (map[string]any, error) { ... }

// Calls: [GetContainer, GetContainer().MongoMgr.MongoClientStats]
func (s *MongoService) MongoClientStats(id string) (map[string]any, error) { ... }

// Calls: [GetContainer, GetContainer().MongoMgr.Close, logger.Infof]
func (s *MongoService) MongoClose(id string) error { ... }

// Calls: [GetContainer, GetContainer().MongoMgr.MongoCollectionStats]
func (s *MongoService) MongoCollectionStats(id string, dbName string, coll string) (map[string]any, error) { ... }

// Calls: [GetContainer, GetContainer().MongoMgr.MongoCollections, logger.Errorf]
func (s *MongoService) MongoCollections(id string, dbName string) ([]map[string]any, error) { ... }

// Calls: [GetContainer, c.MongoMgr.Open, c.Store.Get, errors.New, logger.Errorf, logger.Infof]
func (s *MongoService) MongoConnect(id string) (bool, error) { ... }

// Calls: [GetContainer, GetContainer().MongoMgr.MongoCountDocuments, logger.Errorf]
func (s *MongoService) MongoCountDocuments(id string, dbName string, coll string, filterJSON string) (int64, error) { ... }

// Calls: [GetContainer, GetContainer().MongoMgr.MongoCreateCollection, logger.Errorf, logger.Infof]
func (s *MongoService) MongoCreateCollection(id string, dbName string, coll string) error { ... }

// Calls: [GetContainer, GetContainer().MongoMgr.MongoCreateDatabase, logger.Errorf, logger.Infof]
func (s *MongoService) MongoCreateDatabase(id string, dbName string, firstCollection string) error { ... }

// Calls: [GetContainer, GetContainer().MongoMgr.MongoCreateIndex, logger.Errorf, logger.Infof]
func (s *MongoService) MongoCreateIndex(id string, dbName string, coll string, keysJSON string, name string, unique bool, sparse bool, expireAfterSeconds int) (string, error) { ... }

// Calls: [GetContainer, GetContainer().MongoMgr.MongoCurrentOps]
func (s *MongoService) MongoCurrentOps(id string) ([]string, error) { ... }

// Calls: [GetContainer, GetContainer().MongoMgr.MongoDatabases, logger.Errorf]
func (s *MongoService) MongoDatabases(id string) ([]map[string]any, error) { ... }

// Calls: [GetContainer, GetContainer().MongoMgr.MongoDeleteMany, logger.Errorf, logger.Infof]
func (s *MongoService) MongoDeleteMany(id string, dbName string, coll string, filterJSON string) (int64, error) { ... }

// Calls: [GetContainer, GetContainer().MongoMgr.MongoDeleteOne, logger.Errorf, logger.Infof]
func (s *MongoService) MongoDeleteOne(id string, dbName string, coll string, filterJSON string) (int64, error) { ... }

// Calls: [GetContainer, GetContainer().MongoMgr.MongoDistinct]
func (s *MongoService) MongoDistinct(id string, dbName string, coll string, field string, filterJSON string) ([]string, error) { ... }

// Calls: [GetContainer, GetContainer().MongoMgr.MongoDropCollection, logger.Errorf, logger.Infof]
func (s *MongoService) MongoDropCollection(id string, dbName string, coll string) error { ... }

// Calls: [GetContainer, GetContainer().MongoMgr.MongoDropDatabase, logger.Errorf, logger.Infof]
func (s *MongoService) MongoDropDatabase(id string, dbName string) error { ... }

// Calls: [GetContainer, GetContainer().MongoMgr.MongoDropIndex, logger.Errorf, logger.Infof]
func (s *MongoService) MongoDropIndex(id string, dbName string, coll string, name string) error { ... }

// Calls: [GetContainer, GetContainer().MongoMgr.MongoExplain]
func (s *MongoService) MongoExplain(id string, spec mongo.MongoQuerySpec, verbosity string) (string, error) { ... }

// Calls: [GetContainer, GetContainer().MongoMgr.MongoFind, logger.Errorf]
func (s *MongoService) MongoFind(id string, spec mongo.MongoQuerySpec) (mongo.MongoFindResult, error) { ... }

// Calls: [GetContainer, GetContainer().MongoMgr.MongoFindOneAndUpdate, logger.Infof]
func (s *MongoService) MongoFindOneAndUpdate(id string, dbName string, coll string, filterJSON string, updateJSON string, returnNew bool) (string, error) { ... }

// Calls: [GetContainer, GetContainer().MongoMgr.MongoGetValidator]
func (s *MongoService) MongoGetValidator(id string, dbName string, coll string) (map[string]any, error) { ... }

// Calls: [GetContainer, GetContainer().MongoMgr.MongoHealthCheck]
func (s *MongoService) MongoHealthCheck(id string) (map[string]any, error) { ... }

// Calls: [GetContainer, GetContainer().MongoMgr.MongoIndexStats]
func (s *MongoService) MongoIndexStats(id string, dbName string, coll string) ([]string, error) { ... }

// Calls: [GetContainer, GetContainer().MongoMgr.MongoIndexes]
func (s *MongoService) MongoIndexes(id string, dbName string, coll string) ([]map[string]any, error) { ... }

// Calls: [GetContainer, GetContainer().MongoMgr.MongoInferSchema]
func (s *MongoService) MongoInferSchema(id string, dbName string, coll string, sampleSize int) ([]map[string]any, error) { ... }

// Calls: [GetContainer, GetContainer().MongoMgr.MongoInsertMany, logger.Errorf, logger.Infof]
func (s *MongoService) MongoInsertMany(id string, dbName string, coll string, docsJSON string, ordered bool) (map[string]any, error) { ... }

// Calls: [GetContainer, GetContainer().MongoMgr.MongoInsertOne, logger.Errorf, logger.Infof]
func (s *MongoService) MongoInsertOne(id string, dbName string, coll string, docJSON string) (string, error) { ... }

// Calls: [GetContainer, GetContainer().MongoMgr.MongoParseURI]
func (s *MongoService) MongoParseURI(uri string) (mongo.MongoURIInfo, error) { ... }

// Calls: [GetContainer, GetContainer().MongoMgr.MongoRenameCollection, logger.Errorf, logger.Infof]
func (s *MongoService) MongoRenameCollection(id string, dbName string, coll string, newName string) error { ... }

// Calls: [GetContainer, GetContainer().MongoMgr.MongoReplaceOne, logger.Errorf, logger.Infof]
func (s *MongoService) MongoReplaceOne(id string, dbName string, coll string, filterJSON string, docJSON string, upsert bool) (map[string]any, error) { ... }

// Calls: [GetContainer, GetContainer().MongoMgr.MongoRunCommand, logger.Errorf, logger.Infof]
func (s *MongoService) MongoRunCommand(id string, dbName string, commandJSON string) (string, error) { ... }

// Calls: [GetContainer, GetContainer().MongoMgr.MongoServerStatus]
func (s *MongoService) MongoServerStatus(id string) (map[string]any, error) { ... }

// Calls: [GetContainer, GetContainer().MongoMgr.MongoSetValidator, logger.Errorf, logger.Infof]
func (s *MongoService) MongoSetValidator(id string, dbName string, coll string, validatorJSON string, level string, action string) error { ... }

// Calls: [GetContainer, GetContainer().MongoMgr.TestConnection, logger.Errorf, logger.Infof]
func (s *MongoService) MongoTestConnection(cfg core.ServerConfig) (map[string]any, error) { ... }

// Calls: [GetContainer, GetContainer().MongoMgr.MongoTransaction, logger.Infof]
func (s *MongoService) MongoTransaction(id string, ops []mongo.MongoTxOp) (map[string]any, error) { ... }

// Calls: [GetContainer, GetContainer().MongoMgr.MongoUnwatch, logger.Infof]
func (s *MongoService) MongoUnwatch(id string, watchKey string) error { ... }

// Calls: [GetContainer, GetContainer().MongoMgr.MongoUpdateMany, logger.Errorf, logger.Infof]
func (s *MongoService) MongoUpdateMany(id string, dbName string, coll string, filterJSON string, updateJSON string, upsert bool) (map[string]any, error) { ... }

// Calls: [GetContainer, GetContainer().MongoMgr.MongoUpdateOne, logger.Errorf, logger.Infof]
func (s *MongoService) MongoUpdateOne(id string, dbName string, coll string, filterJSON string, updateJSON string, upsert bool) (map[string]any, error) { ... }

// Calls: [GetContainer, GetContainer().MongoMgr.MongoValidateDocument]
func (s *MongoService) MongoValidateDocument(id string, dbName string, coll string, docJSON string) (map[string]any, error) { ... }

// Calls: [GetContainer, GetContainer().MongoMgr.MongoWatch, logger.Infof]
func (s *MongoService) MongoWatch(id string, scope string, dbName string, coll string, pipelineJSON string, fullDocument string) (string, error) { ... }

// Calls: [GetContainer, GetContainer().MongoMgr.MongoWatchList]
func (s *MongoService) MongoWatchList(id string) ([]string, error) { ... }

type MqttService struct {
}

// Calls: [GetContainer, GetContainer().MqttMgr.Close, logger.Infof]
func (s *MqttService) MqttClose(id string) error { ... }

// Calls: [GetContainer, c.MqttMgr.Connect, c.Store.Get, errors.New, logger.Errorf, logger.Infof]
func (s *MqttService) MqttConnect(id string) (bool, error) { ... }

// Calls: [GetContainer, GetContainer().MqttMgr.Publish, logger.Errorf, logger.Infof]
func (s *MqttService) MqttPublish(id string, topic string, payload string, qos int, retained bool) error { ... }

// Calls: [GetContainer, GetContainer().MqttMgr.Subscribe, logger.Errorf, logger.Infof]
func (s *MqttService) MqttSubscribe(id string, topic string, qos int) error { ... }

// Calls: [GetContainer, GetContainer().MqttMgr.Subscriptions]
func (s *MqttService) MqttSubscriptions(id string) ([]map[string]any, error) { ... }

// Calls: [GetContainer, GetContainer().MqttMgr.TestConnection, logger.Errorf, logger.Infof]
func (s *MqttService) MqttTestConnection(cfg core.ServerConfig) (map[string]any, error) { ... }

// Calls: [GetContainer, GetContainer().MqttMgr.Unsubscribe, logger.Errorf, logger.Infof]
func (s *MqttService) MqttUnsubscribe(id string, topic string) error { ... }

type MysqlService struct {
}

// Calls: [GetContainer, GetContainer().MysqlMgr.MysqlBackup, logger.Infof]
func (s *MysqlService) MysqlBackup(serverID string, dbName string) (string, error) { ... }

// Calls: [GetContainer, GetContainer().MysqlMgr.MysqlBackupToFile, logger.Infof]
func (s *MysqlService) MysqlBackupToFile(serverID string, dbName string) (string, error) { ... }

// Calls: [GetContainer, GetContainer().MysqlMgr.MysqlChangeUserPassword, logger.Errorf, logger.Infof]
func (s *MysqlService) MysqlChangeUserPassword(serverID string, user string, host string, newPassword string) error { ... }

// Calls: [GetContainer, GetContainer().MysqlMgr.MysqlCloseEx, logger.Infof]
func (s *MysqlService) MysqlClose(serverID string) error { ... }

// Calls: [GetContainer, c.MysqlMgr.MysqlConnectEx, c.Store.Get, errors.New, logger.Errorf, logger.Infof]
func (s *MysqlService) MysqlConnect(serverID string) (bool, error) { ... }

// Calls: [GetContainer, GetContainer().MysqlMgr.MysqlCount, logger.Errorf]
func (s *MysqlService) MysqlCount(serverID string, dbName string, table string) (int64, error) { ... }

// Calls: [GetContainer, GetContainer().MysqlMgr.MysqlCreateDatabase, logger.Errorf, logger.Infof]
func (s *MysqlService) MysqlCreateDatabase(serverID string, name string, charset string) error { ... }

// Calls: [GetContainer, GetContainer().MysqlMgr.MysqlCreateIndex, logger.Errorf, logger.Infof]
func (s *MysqlService) MysqlCreateIndex(serverID string, dbName string, table string, name string, colsCSV string, unique bool) error { ... }

// Calls: [GetContainer, GetContainer().MysqlMgr.MysqlCreateTable, logger.Errorf, logger.Infof]
func (s *MysqlService) MysqlCreateTable(serverID string, dbName string, table string, defs string) error { ... }

// Calls: [GetContainer, GetContainer().MysqlMgr.MysqlCreateUser, logger.Errorf, logger.Infof]
func (s *MysqlService) MysqlCreateUser(serverID string, user string, host string, password string, authPlugin string, lock bool) error { ... }

// Calls: [GetContainer, GetContainer().MysqlMgr.MysqlDatabases, logger.Errorf]
func (s *MysqlService) MysqlDatabases(serverID string) ([]string, error) { ... }

// Calls: [GetContainer, GetContainer().MysqlMgr.MysqlDelete, logger.Errorf, logger.Infof]
func (s *MysqlService) MysqlDelete(serverID string, dbName string, table string, whereCols []string, whereVals []any) (int64, error) { ... }

// Calls: [GetContainer, GetContainer().MysqlMgr.MysqlDescribe, logger.Errorf]
func (s *MysqlService) MysqlDescribe(serverID string, dbName string, table string) (db.MysqlQueryResult, error) { ... }

// Calls: [GetContainer, GetContainer().MysqlMgr.MysqlDropDatabase, logger.Errorf, logger.Infof]
func (s *MysqlService) MysqlDropDatabase(serverID string, name string) error { ... }

// Calls: [GetContainer, GetContainer().MysqlMgr.MysqlDropIndex, logger.Errorf, logger.Infof]
func (s *MysqlService) MysqlDropIndex(serverID string, dbName string, table string, name string) error { ... }

// Calls: [GetContainer, GetContainer().MysqlMgr.MysqlDropTable, logger.Errorf, logger.Infof]
func (s *MysqlService) MysqlDropTable(serverID string, dbName string, table string) error { ... }

// Calls: [GetContainer, GetContainer().MysqlMgr.MysqlDropUser, logger.Errorf, logger.Infof]
func (s *MysqlService) MysqlDropUser(serverID string, user string, host string) error { ... }

// Calls: [GetContainer, GetContainer().MysqlMgr.MysqlExport, logger.Infof]
func (s *MysqlService) MysqlExport(serverID string, dbName string, mode string, source string, table string, sqlText string, limit int) (string, error) { ... }

// Calls: [GetContainer, GetContainer().MysqlMgr.MysqlExportJSON]
func (s *MysqlService) MysqlExportJSON(serverID string, dbName string, source string, table string, sqlText string, limit int) (string, error) { ... }

// Calls: [GetContainer, GetContainer().MysqlMgr.MysqlExportToFileEx, logger.Infof]
func (s *MysqlService) MysqlExportToFile(serverID string, dbName string, mode string, source string, table string, sqlText string, limit int) (string, error) { ... }

// Calls: [GetContainer, GetContainer().MysqlMgr.MysqlGrantPrivileges, logger.Errorf, logger.Infof]
func (s *MysqlService) MysqlGrantPrivileges(serverID string, user string, host string, dbName string, table string, privs []string, withGrantOption bool) error { ... }

// Calls: [GetContainer, GetContainer().MysqlMgr.MysqlGrants]
func (s *MysqlService) MysqlGrants(serverID string, user string, host string) (string, error) { ... }

// Calls: [GetContainer, GetContainer().MysqlMgr.MysqlImport, logger.Infof]
func (s *MysqlService) MysqlImport(serverID string, dbName string, mode string, table string, content string) (string, error) { ... }

// Calls: [GetContainer, GetContainer().MysqlMgr.MysqlImportFromFileEx, logger.Infof]
func (s *MysqlService) MysqlImportFromFile(serverID string, dbName string, mode string, table string) (string, error) { ... }

// Calls: [GetContainer, GetContainer().MysqlMgr.MysqlImportJSON, logger.Infof]
func (s *MysqlService) MysqlImportJSON(serverID string, dbName string, table string, content string) (string, error) { ... }

// Calls: [GetContainer, GetContainer().MysqlMgr.MysqlIndexes]
func (s *MysqlService) MysqlIndexes(serverID string, dbName string, table string) ([]map[string]any, error) { ... }

// Calls: [GetContainer, GetContainer().MysqlMgr.MysqlInsert, logger.Errorf, logger.Infof]
func (s *MysqlService) MysqlInsert(serverID string, dbName string, table string, columns []string, values []any) (int64, error) { ... }

// Calls: [GetContainer, GetContainer().MysqlMgr.MysqlProcessList]
func (s *MysqlService) MysqlProcessList(serverID string) ([]map[string]any, error) { ... }

// Calls: [GetContainer, GetContainer().MysqlMgr.MysqlQueryCSV]
func (s *MysqlService) MysqlQueryCSV(serverID string, dbName string, sqlText string, limit int) (string, error) { ... }

// Calls: [GetContainer, GetContainer().MysqlMgr.MysqlRevokeAllPrivileges, logger.Errorf, logger.Infof]
func (s *MysqlService) MysqlRevokeAllPrivileges(serverID string, user string, host string) error { ... }

// Calls: [GetContainer, GetContainer().MysqlMgr.MysqlRevokePrivileges, logger.Errorf, logger.Infof]
func (s *MysqlService) MysqlRevokePrivileges(serverID string, user string, host string, dbName string, table string, privs []string) error { ... }

// Calls: [GetContainer, GetContainer().MysqlMgr.MysqlRun, logger.Errorf, logger.Infof]
func (s *MysqlService) MysqlRun(serverID string, dbName string, sqlText string) (db.MysqlQueryResult, error) { ... }

// Calls: [GetContainer, GetContainer().MysqlMgr.MysqlSchema]
func (s *MysqlService) MysqlSchema(serverID string, dbName string) (map[string]any, error) { ... }

// Calls: [GetContainer, GetContainer().MysqlMgr.MysqlSelect, logger.Errorf]
func (s *MysqlService) MysqlSelect(serverID string, dbName string, table string, limit int, offset int) (db.MysqlQueryResult, error) { ... }

// Calls: [GetContainer, GetContainer().MysqlMgr.MysqlSlowLog]
func (s *MysqlService) MysqlSlowLog(serverID string, limit int) ([]map[string]any, error) { ... }

// Calls: [GetContainer, GetContainer().MysqlMgr.MysqlStatus]
func (s *MysqlService) MysqlStatus(serverID string) (map[string]any, error) { ... }

// Calls: [GetContainer, GetContainer().MysqlMgr.MysqlTableStatus]
func (s *MysqlService) MysqlTableStatus(serverID string, dbName string) ([]map[string]any, error) { ... }

// Calls: [GetContainer, GetContainer().MysqlMgr.MysqlTables, logger.Errorf]
func (s *MysqlService) MysqlTables(serverID string, dbName string) ([]string, error) { ... }

// Calls: [GetContainer, GetContainer().MysqlMgr.TestConnection, logger.Errorf, logger.Infof]
func (s *MysqlService) MysqlTestConnection(cfg core.ServerConfig) (map[string]any, error) { ... }

// Calls: [GetContainer, GetContainer().MysqlMgr.MysqlToggleUserLock, logger.Errorf, logger.Infof]
func (s *MysqlService) MysqlToggleUserLock(serverID string, user string, host string, lock bool) error { ... }

// Calls: [GetContainer, GetContainer().MysqlMgr.MysqlTruncateTable, logger.Errorf, logger.Infof]
func (s *MysqlService) MysqlTruncateTable(serverID string, dbName string, table string) error { ... }

// Calls: [GetContainer, GetContainer().MysqlMgr.MysqlUpdate, logger.Errorf, logger.Infof]
func (s *MysqlService) MysqlUpdate(serverID string, dbName string, table string, setCols []string, setVals []any, whereCols []string, whereVals []any) (int64, error) { ... }

// Calls: [GetContainer, GetContainer().MysqlMgr.MysqlUsers]
func (s *MysqlService) MysqlUsers(serverID string) ([]map[string]any, error) { ... }

// Calls: [GetContainer, GetContainer().MysqlMgr.MysqlVariables]
func (s *MysqlService) MysqlVariables(serverID string) (map[string]any, error) { ... }

type PostgresService struct {
}

// Calls: [GetContainer, GetContainer().PostgresMgr.PostgresCloseEx, logger.Infof]
func (s *PostgresService) PostgresClose(serverID string) error { ... }

// Calls: [GetContainer, c.PostgresMgr.PostgresConnectEx, c.Store.Get, errors.New, logger.Errorf, logger.Infof]
func (s *PostgresService) PostgresConnect(serverID string) (bool, error) { ... }

// Calls: [GetContainer, GetContainer().PostgresMgr.PostgresCount, logger.Errorf]
func (s *PostgresService) PostgresCount(serverID string, dbName string, schema string, table string, whereClause string) (int64, error) { ... }

// Calls: [GetContainer, GetContainer().PostgresMgr.PostgresCreateDatabase, logger.Errorf, logger.Infof]
func (s *PostgresService) PostgresCreateDatabase(serverID string, name string, owner string, encoding string, template string) error { ... }

// Calls: [GetContainer, GetContainer().PostgresMgr.PostgresCreateRole, logger.Errorf, logger.Infof]
func (s *PostgresService) PostgresCreateRole(serverID string, roleName string, password string, super bool, canLogin bool, createDB bool, createRole bool, connLimit int) error { ... }

// Calls: [GetContainer, GetContainer().PostgresMgr.PostgresCreateSchema, logger.Errorf, logger.Infof]
func (s *PostgresService) PostgresCreateSchema(serverID string, dbName string, schema string, owner string) error { ... }

// Calls: [GetContainer, GetContainer().PostgresMgr.PostgresCreateTable, logger.Errorf, logger.Infof]
func (s *PostgresService) PostgresCreateTable(serverID string, dbName string, schema string, table string, defs string) error { ... }

// Calls: [GetContainer, GetContainer().PostgresMgr.PostgresDatabases, logger.Errorf]
func (s *PostgresService) PostgresDatabases(serverID string) ([]db.PgDatabase, error) { ... }

// Calls: [GetContainer, GetContainer().PostgresMgr.PostgresDelete, logger.Errorf, logger.Infof]
func (s *PostgresService) PostgresDelete(serverID string, dbName string, schema string, table string, whereCols []string, whereVals []any) (int64, error) { ... }

// Calls: [GetContainer, GetContainer().PostgresMgr.PostgresDescribe, logger.Errorf]
func (s *PostgresService) PostgresDescribe(serverID string, dbName string, schema string, table string) (map[string]any, error) { ... }

// Calls: [GetContainer, GetContainer().PostgresMgr.PostgresDropDatabase, logger.Errorf, logger.Infof]
func (s *PostgresService) PostgresDropDatabase(serverID string, name string) error { ... }

// Calls: [GetContainer, GetContainer().PostgresMgr.PostgresDropRole, logger.Errorf, logger.Infof]
func (s *PostgresService) PostgresDropRole(serverID string, roleName string) error { ... }

// Calls: [GetContainer, GetContainer().PostgresMgr.PostgresDropSchema, logger.Errorf, logger.Infof]
func (s *PostgresService) PostgresDropSchema(serverID string, dbName string, schema string, cascade bool) error { ... }

// Calls: [GetContainer, GetContainer().PostgresMgr.PostgresDropTable, logger.Errorf, logger.Infof]
func (s *PostgresService) PostgresDropTable(serverID string, dbName string, schema string, table string, cascade bool) error { ... }

// Calls: [GetContainer, GetContainer().PostgresMgr.PostgresExplain]
func (s *PostgresService) PostgresExplain(serverID string, dbName string, sqlText string, analyze bool, buffers bool, verbose bool) (string, error) { ... }

// Calls: [GetContainer, GetContainer().PostgresMgr.PostgresExport, logger.Infof]
func (s *PostgresService) PostgresExport(serverID string, dbName string, schema string, mode string, source string, table string, sqlText string, limit int) (string, error) { ... }

// Calls: [GetContainer, GetContainer().PostgresMgr.PostgresExportToFile, logger.Infof]
func (s *PostgresService) PostgresExportToFile(serverID string, dbName string, schema string, mode string, source string, table string, sqlText string, limit int) (string, error) { ... }

// Calls: [GetContainer, GetContainer().PostgresMgr.PostgresFunctions]
func (s *PostgresService) PostgresFunctions(serverID string, dbName string, schema string) ([]db.PgFunction, error) { ... }

// Calls: [GetContainer, GetContainer().PostgresMgr.PostgresGrantPrivileges, logger.Errorf, logger.Infof]
func (s *PostgresService) PostgresGrantPrivileges(serverID string, dbName string, roleName string, schema string, table string, privileges string, isGrant bool) error { ... }

// Calls: [GetContainer, GetContainer().PostgresMgr.PostgresImport, logger.Infof]
func (s *PostgresService) PostgresImport(serverID string, dbName string, schema string, mode string, table string, content string) (string, error) { ... }

// Calls: [GetContainer, GetContainer().PostgresMgr.PostgresImportFromFile, logger.Infof]
func (s *PostgresService) PostgresImportFromFile(serverID string, dbName string, schema string, mode string, table string) (string, error) { ... }

// Calls: [GetContainer, GetContainer().PostgresMgr.PostgresInsert, logger.Errorf, logger.Infof]
func (s *PostgresService) PostgresInsert(serverID string, dbName string, schema string, table string, columns []string, values []any) (int64, error) { ... }

// Calls: [GetContainer, GetContainer().PostgresMgr.PostgresKillSession, logger.Errorf, logger.Infof]
func (s *PostgresService) PostgresKillSession(serverID string, dbName string, pid int, terminate bool) (bool, error) { ... }

// Calls: [GetContainer, GetContainer().PostgresMgr.PostgresRoles]
func (s *PostgresService) PostgresRoles(serverID string) ([]db.PgRole, error) { ... }

// Calls: [GetContainer, GetContainer().PostgresMgr.PostgresRun, logger.Errorf, logger.Infof]
func (s *PostgresService) PostgresRun(serverID string, dbName string, sqlText string) (db.PostgresQueryResult, error) { ... }

// Calls: [GetContainer, GetContainer().PostgresMgr.PostgresSchemas, logger.Errorf]
func (s *PostgresService) PostgresSchemas(serverID string, dbName string) ([]db.PgSchema, error) { ... }

// Calls: [GetContainer, GetContainer().PostgresMgr.PostgresSelect, logger.Errorf]
func (s *PostgresService) PostgresSelect(serverID string, dbName string, schema string, table string, limit int, offset int, sortCol string, sortOrder string, whereClause string) (db.PostgresQueryResult, error) { ... }

// Calls: [GetContainer, GetContainer().PostgresMgr.PostgresSequences]
func (s *PostgresService) PostgresSequences(serverID string, dbName string, schema string) ([]db.PgSequence, error) { ... }

// Calls: [GetContainer, GetContainer().PostgresMgr.PostgresSessions]
func (s *PostgresService) PostgresSessions(serverID string, dbName string) ([]db.PgSession, error) { ... }

// Calls: [GetContainer, GetContainer().PostgresMgr.PostgresStatus]
func (s *PostgresService) PostgresStatus(serverID string, dbName string) (db.PgStatus, error) { ... }

// Calls: [GetContainer, GetContainer().PostgresMgr.PostgresTableDDL]
func (s *PostgresService) PostgresTableDDL(serverID string, dbName string, schema string, table string) (string, error) { ... }

// Calls: [GetContainer, GetContainer().PostgresMgr.PostgresTables, logger.Errorf]
func (s *PostgresService) PostgresTables(serverID string, dbName string, schema string) ([]db.PgTable, error) { ... }

// Calls: [GetContainer, GetContainer().PostgresMgr.PostgresTestConnection, logger.Errorf, logger.Infof]
func (s *PostgresService) PostgresTestConnection(cfg core.ServerConfig) (map[string]any, error) { ... }

// Calls: [GetContainer, GetContainer().PostgresMgr.PostgresTruncateTable, logger.Errorf, logger.Infof]
func (s *PostgresService) PostgresTruncateTable(serverID string, dbName string, schema string, table string, restartIdentity bool, cascade bool) error { ... }

// Calls: [GetContainer, GetContainer().PostgresMgr.PostgresUpdate, logger.Errorf, logger.Infof]
func (s *PostgresService) PostgresUpdate(serverID string, dbName string, schema string, table string, setCols []string, setVals []any, whereCols []string, whereVals []any) (int64, error) { ... }

// Calls: [GetContainer, GetContainer().PostgresMgr.PostgresUpdateRolePassword, logger.Errorf, logger.Infof]
func (s *PostgresService) PostgresUpdateRolePassword(serverID string, roleName string, newPassword string) error { ... }

type RedisService struct {
}

// Calls: [GetContainer, GetContainer().RedisMgr.Close, logger.Infof]
func (s *RedisService) RedisClose(id string) error { ... }

// Calls: [GetContainer, c.RedisMgr.Connect, c.Store.Get, errors.New, logger.Errorf, logger.Infof]
func (s *RedisService) RedisConnect(id string) (bool, error) { ... }

// Calls: [GetContainer, GetContainer().RedisMgr.DBSize]
func (s *RedisService) RedisDBSize(id string) (int, error) { ... }

// Calls: [GetContainer, GetContainer().RedisMgr.DelKeys, logger.Errorf, logger.Infof]
func (s *RedisService) RedisDelete(id string, key string) error { ... }

// Calls: [GetContainer, GetContainer().RedisMgr.ExpireKey, int64, logger.Errorf, logger.Infof]
func (s *RedisService) RedisExpire(id string, key string, ttl int) error { ... }

// Calls: [GetContainer, GetContainer().RedisMgr.GetKey, logger.Errorf]
func (s *RedisService) RedisGet(id string, key string) (redis.RedisValue, error) { ... }

// Calls: [GetContainer, GetContainer().RedisMgr.RedisHashFieldDel, logger.Infof]
func (s *RedisService) RedisHashFieldDel(id string, key string, fields []string) (int, error) { ... }

// Calls: [GetContainer, GetContainer().RedisMgr.RedisHashFieldGet]
func (s *RedisService) RedisHashFieldGet(id string, key string, field string) (string, error) { ... }

// Calls: [GetContainer, GetContainer().RedisMgr.RedisHashFieldSet]
func (s *RedisService) RedisHashFieldSet(id string, key string, field string, value string) error { ... }

// Calls: [GetContainer, GetContainer().RedisMgr.Info]
func (s *RedisService) RedisInfo(id string, section string) (string, error) { ... }

// Calls: [GetContainer, GetContainer().RedisMgr.Keys, logger.Errorf]
func (s *RedisService) RedisKeys(id string, pattern string, cursor string) (redis.RedisKeysResult, error) { ... }

// Calls: [GetContainer, GetContainer().RedisMgr.KeyspaceNotify]
func (s *RedisService) RedisKeyspaceNotify(id string, db int, event string) error { ... }

// Calls: [GetContainer, GetContainer().RedisMgr.RedisListPop]
func (s *RedisService) RedisListPop(id string, key string, left bool) (string, error) { ... }

// Calls: [GetContainer, GetContainer().RedisMgr.RedisListPush]
func (s *RedisService) RedisListPush(id string, key string, value string, left bool) (int, error) { ... }

// Calls: [GetContainer, GetContainer().RedisMgr.ModeInfo]
func (s *RedisService) RedisModeInfo(id string) (map[string]any, error) { ... }

// Calls: [GetContainer, GetContainer().RedisMgr.Monitor]
func (s *RedisService) RedisMonitor(id string) (*redis.RedisMonitorInfo, error) { ... }

// Calls: [GetContainer, GetContainer().RedisMgr.PSubscribe, logger.Infof]
func (s *RedisService) RedisPSubscribe(id string, pattern string) error { ... }

// Calls: [GetContainer, GetContainer().RedisMgr.Pipeline, logger.Infof]
func (s *RedisService) RedisPipeline(id string, commands []string) (redis.RedisPipelineResult, error) { ... }

// Calls: [GetContainer, GetContainer().RedisMgr.Publish, logger.Infof]
func (s *RedisService) RedisPublish(id string, channel string, message string) (int64, error) { ... }

// Calls: [GetContainer, GetContainer().RedisMgr.QueueDequeue]
func (s *RedisService) RedisQueueDequeue(id string, queue string, mode string, timeout int) (*redis.RedisQueueItem, error) { ... }

// Calls: [GetContainer, GetContainer().RedisMgr.QueueEnqueue]
func (s *RedisService) RedisQueueEnqueue(id string, queue string, payload string, mode string) (string, error) { ... }

// Calls: [GetContainer, GetContainer().RedisMgr.QueueLength]
func (s *RedisService) RedisQueueLength(id string, queue string, mode string) (int64, error) { ... }

// Calls: [GetContainer, GetContainer().RedisMgr.ExecuteRawCommand, logger.Errorf, logger.Infof, strings.HasPrefix, strings.ToLower, strings.TrimSpace]
func (s *RedisService) RedisRaw(id string, cmd string) (map[string]any, error) { ... }

// Calls: [GetContainer, GetContainer().RedisMgr.RenameKey, logger.Errorf, logger.Infof]
func (s *RedisService) RedisRenameKey(id string, oldKey string, newKey string) error { ... }

// Calls: [GetContainer, GetContainer().RedisMgr.SelectDB, logger.Errorf, logger.Infof]
func (s *RedisService) RedisSelectDB(id string, db int) error { ... }

// Calls: [GetContainer, GetContainer().RedisMgr.SetKey, int64, logger.Errorf, logger.Infof]
func (s *RedisService) RedisSet(id string, key string, typ string, val string, ttl int) error { ... }

// Calls: [GetContainer, GetContainer().RedisMgr.RedisSetAdd]
func (s *RedisService) RedisSetAdd(id string, key string, members []string) (int, error) { ... }

// Calls: [GetContainer, GetContainer().RedisMgr.RedisSetRem]
func (s *RedisService) RedisSetRem(id string, key string, members []string) (int, error) { ... }

// Calls: [GetContainer, GetContainer().RedisMgr.SlowLog]
func (s *RedisService) RedisSlowLog(id string, count int) ([]redis.RedisSlowLogEntry, error) { ... }

// Calls: [GetContainer, GetContainer().RedisMgr.RedisStringAppend]
func (s *RedisService) RedisStringAppend(id string, key string, value string) (int, error) { ... }

// Calls: [GetContainer, GetContainer().RedisMgr.Subscribe, logger.Infof]
func (s *RedisService) RedisSubscribe(id string, channel string) error { ... }

// Calls: [GetContainer, GetContainer().RedisMgr.Subscriptions]
func (s *RedisService) RedisSubscriptions(id string) ([]string, error) { ... }

// Calls: [GetContainer, GetContainer().RedisMgr.TestConnection, logger.Errorf, logger.Infof]
func (s *RedisService) RedisTestConnection(cfg core.ServerConfig) (map[string]any, error) { ... }

// Calls: [GetContainer, GetContainer().RedisMgr.Transaction, logger.Infof]
func (s *RedisService) RedisTransaction(id string, watch []string, commands []string) (redis.RedisTransactionResult, error) { ... }

// Calls: [GetContainer, GetContainer().RedisMgr.Unsubscribe, logger.Infof]
func (s *RedisService) RedisUnsubscribe(id string, channel string) error { ... }

// Calls: [GetContainer, GetContainer().RedisMgr.RedisZSetAdd]
func (s *RedisService) RedisZSetAdd(id string, key string, member string, score float64) (int, error) { ... }

// Calls: [GetContainer, GetContainer().RedisMgr.RedisZSetRem]
func (s *RedisService) RedisZSetRem(id string, key string, members []string) (int, error) { ... }

// ServersExportData 定义全量配置导出的 JSON 结构
type ServersExportData struct {
	Version string `json:"version"`
	ExportedAt string `json:"exportedAt"`
	Servers []core.ServerConfig `json:"servers"`
	Groups []core.ServerGroup `json:"groups"`
}

type SftpService struct {
}

// Calls: [GetContainer, GetContainer().Transfers.Cancel, logger.Infof]
func (s *SftpService) CancelTransfer(id string) error { ... }

// Calls: [core.OpenMultipleFilesDialog, logger.Errorf]
func (s *SftpService) ChooseLocalFiles() ([]string, error) { ... }

// Calls: [core.OpenDirectoryDialog, logger.Errorf]
func (s *SftpService) ChooseLocalFolder() (string, error) { ... }

// Calls: [GetContainer, GetContainer().Transfers.ClearFinished, logger.Info]
func (s *SftpService) ClearFinishedTransfers() error { ... }

// Calls: [GetContainer, c.Sessions.StartDownload, core.OpenDirectoryDialog, logger.Errorf, logger.Infof]
func (s *SftpService) DownloadPaths(sessionID string, remotePaths []string) error { ... }

// Calls: [GetContainer, c.Sessions.StartDownload, logger.Errorf, logger.Infof]
func (s *SftpService) DownloadTo(sessionID string, remotePaths []string, localDir string) error { ... }

// Calls: [GetContainer, GetContainer().Sessions.Get, logger.Errorf, session.Info]
func (s *SftpService) HomeDir(sessionID string) (string, error) { ... }

// Calls: [GetContainer, GetContainer().Sessions.ListDir, logger.Errorf]
func (s *SftpService) ListDir(sessionID string, dir string) (ssh.DirListing, error) { ... }

// Calls: [GetContainer, GetContainer().Transfers.List]
func (s *SftpService) ListTransfers() []ssh.Transfer { ... }

// Calls: [GetContainer, c.Sessions.MakeDir, logger.Errorf, logger.Infof]
func (s *SftpService) MakeDir(sessionID string, parent string, name string) error { ... }

// Calls: [logger.Errorf, os.ReadFile, string]
func (s *SftpService) ReadLocalFile(filePath string) (string, error) { ... }

// Calls: [base64.StdEncoding.EncodeToString, logger.Errorf, os.ReadFile]
func (s *SftpService) ReadLocalFileBase64(filePath string) (string, error) { ... }

// Calls: [GetContainer, c.Sessions.ReadFileContent, logger.Errorf, logger.Infof, string]
func (s *SftpService) ReadRemoteFile(sessionID string, remotePath string) (string, error) { ... }

// Calls: [GetContainer, GetContainer().Sessions.RemoveRemotePath, logger.Errorf, logger.Infof]
func (s *SftpService) RemovePath(sessionID string, target string) error { ... }

// Calls: [logger.Infof, s.RemovePath]
func (s *SftpService) RemovePaths(sessionID string, targets []string) error { ... }

// Calls: [GetContainer, c.Sessions.RenameRemotePath, logger.Errorf, logger.Infof]
func (s *SftpService) RenamePath(sessionID string, target string, newName string) error { ... }

// Calls: [core.SaveFileDialog, logger.Errorf]
func (s *SftpService) SaveMysqlFile(defaultName string) (string, error) { ... }

// Calls: [GetContainer, c.Sessions.UploadBase64, logger.Errorf, logger.Infof]
func (s *SftpService) UploadData(sessionID string, remoteDir string, name string, base64Data string) error { ... }

// Calls: [GetContainer, c.Sessions.StartUpload, logger.Errorf, logger.Infof]
func (s *SftpService) UploadPaths(sessionID string, remoteDir string, localPaths []string) error { ... }

// Calls: [logger.Errorf, os.WriteFile]
func (s *SftpService) WriteLocalFile(filePath string, content string) error { ... }

// Calls: [GetContainer, c.Sessions.WriteFileContent, logger.Errorf, logger.Infof]
func (s *SftpService) WriteRemoteFile(sessionID string, remotePath string, content string) error { ... }

type SqliteService struct {
}

// Calls: [GetContainer, GetContainer().SqliteMgr.SqliteClose, logger.Infof]
func (s *SqliteService) SqliteClose(id string) error { ... }

// Calls: [GetContainer, GetContainer().SqliteMgr.SqliteConnect, logger.Errorf, logger.Infof]
func (s *SqliteService) SqliteConnect(id string, filePath string) (bool, error) { ... }

// Calls: [GetContainer, GetContainer().SqliteMgr.SqliteCount, logger.Errorf]
func (s *SqliteService) SqliteCount(id string, table string) (int64, error) { ... }

// Calls: [GetContainer, GetContainer().SqliteMgr.SqliteDescribe, logger.Errorf]
func (s *SqliteService) SqliteDescribe(id string, table string) ([]map[string]any, error) { ... }

// Calls: [GetContainer, GetContainer().SqliteMgr.SqliteIndexes]
func (s *SqliteService) SqliteIndexes(id string, table string) ([]map[string]any, error) { ... }

// Calls: [GetContainer, GetContainer().SqliteMgr.SqliteInfo]
func (s *SqliteService) SqliteInfo(id string) (map[string]any, error) { ... }

// Calls: [core.OpenFileDialog, logger.Errorf]
func (s *SqliteService) SqliteOpenFile() (string, error) { ... }

// Calls: [GetContainer, GetContainer().SqliteMgr.SqliteRun, logger.Errorf, logger.Infof]
func (s *SqliteService) SqliteRun(id string, sqlText string) (map[string]any, error) { ... }

// Calls: [GetContainer, GetContainer().SqliteMgr.SqliteSchema]
func (s *SqliteService) SqliteSchema(id string) (map[string]any, error) { ... }

// Calls: [GetContainer, GetContainer().SqliteMgr.SqliteSelect, logger.Errorf]
func (s *SqliteService) SqliteSelect(id string, table string, limit int, offset int) (map[string]any, error) { ... }

// Calls: [GetContainer, GetContainer().SqliteMgr.SqliteTables, logger.Errorf]
func (s *SqliteService) SqliteTables(id string) ([]map[string]any, error) { ... }

type SshService struct {
}

// Calls: [GetContainer, c.Sessions.Connect, c.Store.Get, errors.New, logger.Errorf, logger.Infof]
func (s *SshService) Connect(serverID string, cols int, rows int) (ssh.SessionInfo, error) { ... }

// Calls: [GetContainer, GetContainer().Sessions.Connect, logger.Errorf, logger.Infof]
func (s *SshService) ConnectWithConfig(cfg core.ServerConfig, cols int, rows int) (ssh.SessionInfo, error) { ... }

// Calls: [GetContainer, GetContainer().Sessions.Remove, core.EmitEvent, logger.Infof]
func (s *SshService) Disconnect(sessionID string) error { ... }

// Calls: [GetContainer, GetContainer().Sessions.List]
func (s *SshService) ListSessions() []ssh.SessionInfo { ... }

// Calls: [GetContainer, GetContainer().Sessions.Resize, logger.Warnf]
func (s *SshService) ResizeTerminal(sessionID string, cols int, rows int) error { ... }

// Calls: [GetContainer, GetContainer().Sessions.ControlService, logger.Errorf, logger.Infof]
func (s *SshService) SSHControlService(sessionID string, serviceName string, action string) error { ... }

// Calls: [GetContainer, GetContainer().Sessions.GetCronList, logger.Errorf]
func (s *SshService) SSHCronList(sessionID string) ([]ssh.SSHCronItem, error) { ... }

// Calls: [GetContainer, GetContainer().Sessions.GetDashboardStats, logger.Errorf]
func (s *SshService) SSHDashboardStats(sessionID string) (*ssh.SSHDashboardInfo, error) { ... }

// Calls: [GetContainer, GetContainer().Sessions.KillProcess, logger.Errorf, logger.Infof]
func (s *SshService) SSHKillProcess(sessionID string, pid int) error { ... }

// Calls: [GetContainer, GetContainer().Sessions.GetProcessList, logger.Errorf]
func (s *SshService) SSHProcessList(sessionID string) ([]ssh.SSHProcessInfo, error) { ... }

// Calls: [GetContainer, GetContainer().Sessions.RunCronCommand, logger.Errorf, logger.Infof]
func (s *SshService) SSHRunCronCommand(sessionID string, command string) (string, error) { ... }

// Calls: [GetContainer, GetContainer().Sessions.SaveCronList, logger.Errorf, logger.Infof]
func (s *SshService) SSHSaveCronList(sessionID string, items []ssh.SSHCronItem) error { ... }

// Calls: [GetContainer, GetContainer().Sessions.GetServiceList, logger.Errorf]
func (s *SshService) SSHServiceList(sessionID string) ([]ssh.SSHServiceInfo, error) { ... }

// Calls: [GetContainer, GetContainer().Sessions.GetServiceLogs, logger.Errorf]
func (s *SshService) SSHServiceLogs(sessionID string, serviceName string) (string, error) { ... }

// Calls: [GetContainer, GetContainer().Sessions.Write, logger.Errorf]
func (s *SshService) SendInput(sessionID string, data string) error { ... }

// SshTestConnection 测试指定配置的 SSH 服务器连通性。
// Calls: [GetContainer, GetContainer().Sessions.TestConnection, logger.Infof, logger.Warnf]
func (s *SshService) SshTestConnection(cfg core.ServerConfig) (map[string]any, error) { ... }

// Calls: [GetContainer, GetContainer().Sessions.Attach, GetContainer().Sessions.Resize, logger.Errorf, logger.Infof]
func (s *SshService) TerminalAttach(sessionID string, cols int, rows int) error { ... }

type SystemService struct {
}

// Calls: [core.CheckForUpdates, logger.Infof]
func (s *SystemService) CheckForUpdates() core.UpdateCheckResult { ... }

// Calls: [GetContainer, c.Store.DeleteGroup, errors.New, logger.Errorf, logger.Infof]
func (s *SystemService) DeleteGroup(id string) error { ... }

// Calls: [GetContainer, c.Store.Delete, errors.New, logger.Errorf, logger.Infof]
func (s *SystemService) DeleteServer(id string) error { ... }

// ExportServersConfig 弹出原生保存对话框并导出所有服务器连接与分组配置
// Calls: [GetContainer, c.Store.List, c.Store.ListGroups, core.SaveFileDialog, errors.New, fmt.Sprintf, json.MarshalIndent, logger.Errorf, logger.Infof, storage.WriteFileAtomic, time.Now, time.Now().Format]
func (s *SystemService) ExportServersConfig() (*ConfigIOResult, error) { ... }

// Calls: [GetContainer, c.Store.GetSettings, core.DefaultAppSettings]
func (s *SystemService) GetAppSettings() core.AppSettings { ... }

// Calls: [core.GetAppVersionInfo]
func (s *SystemService) GetAppVersion() core.AppVersionInfo { ... }

// Calls: [app.Window.GetByName, application.Get, w.Hide]
func (s *SystemService) HideWindow() { ... }

// ImportServersConfig 弹出原生选择对话框并增量智能合并导入服务器连接与分组配置
// Calls: [GetContainer, c.Store.List, c.Store.ListGroups, c.Store.Save, c.Store.SaveGroup, core.OpenFileDialog, errors.New, fmt.Errorf, fmt.Sprintf, json.Unmarshal, logger.Errorf, logger.Infof, logger.Warnf, os.ReadFile, strings.TrimSpace, uuid.NewString]
func (s *SystemService) ImportServersConfig() (*ConfigIOResult, error) { ... }

// Calls: [GetContainer, c.Store.ListGroups]
func (s *SystemService) ListGroups() []core.ServerGroup { ... }

// Calls: [GetContainer, c.Store.List, logger.Warn]
func (s *SystemService) ListServers() []core.ServerConfig { ... }

// Calls: [GetContainer, c.Store.MoveServerToGroup, errors.New, logger.Errorf, logger.Infof]
func (s *SystemService) MoveServerToGroup(serverID string, groupID string) error { ... }

// Calls: [core.OpenBrowser, logger.Errorf, logger.Infof]
func (s *SystemService) OpenBrowser(targetURL string) error { ... }

// Calls: [app.Quit, application.Get, core.SetAppQuitting]
func (s *SystemService) QuitApp() { ... }

// Calls: [GetContainer, agent.DefaultManager.InitOrUpdate, agent.DefaultRuntime.InitOrUpdate, c.Store.SaveSettings, errors.New, logger.Errorf, logger.Info]
func (s *SystemService) SaveAppSettings(settings core.AppSettings) (core.AppSettings, error) { ... }

// Calls: [GetContainer, c.Store.SaveGroup, errors.New, logger.Errorf, logger.Infof]
func (s *SystemService) SaveGroup(g core.ServerGroup) (core.ServerGroup, error) { ... }

// Calls: [GetContainer, c.Store.Save, errors.New, logger.Errorf, logger.Infof]
func (s *SystemService) SaveServer(cfg core.ServerConfig) (core.ServerConfig, error) { ... }

// Calls: [core.OpenFileDialog, logger.Errorf]
func (s *SystemService) SelectCertFile() (string, error) { ... }

// Calls: [core.OpenFileDialog, logger.Errorf]
func (s *SystemService) SelectLocalSqliteFile() (string, error) { ... }

// Calls: [core.OpenFileDialog, logger.Errorf]
func (s *SystemService) SelectPrivateKey() (string, error) { ... }

// WikiService 提供给前端 Wails 绑定的知识库管理服务
type WikiService struct {
}

// CompileSessionToWiki 调用大模型提炼会话中的关键资产，并自动合并更新到 Wiki
// Calls: [context.Background, logger.Errorf, logger.Infof, sb.Len, sb.String, sb.WriteString, strings.TrimSpace, wiki.CompileSession]
func (s *WikiService) CompileSessionToWiki(sessionID string, messages []agent.FrontendMessage) (string, error) { ... }

// CreateWikiNode 创建文档或分组
// Calls: [logger.Errorf, logger.Infof, wiki.CreateNode]
func (s *WikiService) CreateWikiNode(parentPath string, name string, isFolder bool) (string, error) { ... }

// DeleteWikiNode 删除文档或分组
// Calls: [logger.Errorf, logger.Infof, wiki.DeleteNode]
func (s *WikiService) DeleteWikiNode(relPath string) error { ... }

// GetWikiCatalog 获取知识库紧凑目录与摘要
// Calls: [wiki.GetCatalog]
func (s *WikiService) GetWikiCatalog() ([]wiki.WikiCatalogItem, error) { ... }

// GetWikiDir 获取本地 Wiki 根目录
// Calls: [wiki.GetWikiDir]
func (s *WikiService) GetWikiDir() (string, error) { ... }

// ListWikiTree 列出知识库文档树
// Calls: [logger.Errorf, wiki.ListTree]
func (s *WikiService) ListWikiTree() ([]wiki.WikiNode, error) { ... }

// OpenWikiDir 打开本地系统文件浏览器
// Calls: [logger.Errorf, logger.Info, wiki.OpenWikiDir]
func (s *WikiService) OpenWikiDir() error { ... }

// ReadWikiPage 读取指定相对路径的 Markdown 内容
// Calls: [logger.Errorf, wiki.ReadPage]
func (s *WikiService) ReadWikiPage(relPath string) (string, error) { ... }

// RenameWikiNode 重命名或移动文档/分组
// Calls: [logger.Errorf, logger.Infof, wiki.RenameNode]
func (s *WikiService) RenameWikiNode(oldRelPath string, newRelPath string) error { ... }

// SaveWikiPage 保存 Markdown 页面
// Calls: [logger.Errorf, logger.Infof, wiki.SavePage]
func (s *WikiService) SaveWikiPage(relPath string, content string) error { ... }

```

#### Functions

```go
// Calls: [core.NewStore, db.NewMysqlManagerEx, db.NewPostgresManager, db.NewSqliteManager, docker.NewDockerManager, k8s.NewK8sManager, logger.Errorf, mcp.NewServer, mcp.NewToolAdapter, mongo.NewMongoManager, once.Do, proto.NewMqttManager, proto.NewWsManager, redis.NewRedisManager, ssh.NewSessionManager, ssh.NewTransferManager]
func GetContainer() *Container { ... }

func NewAgentService() *AgentService { ... }

func NewApiService() *ApiService { ... }

// NewDockerService 构造 DockerService。
func NewDockerService() *DockerService { ... }

// NewK8sService 构造 K8sService。
func NewK8sService() *K8sService { ... }

func NewMcpService() *McpService { ... }

func NewMongoService() *MongoService { ... }

func NewMqttService() *MqttService { ... }

func NewMysqlService() *MysqlService { ... }

func NewPostgresService() *PostgresService { ... }

func NewRedisService() *RedisService { ... }

func NewSftpService() *SftpService { ... }

func NewSqliteService() *SqliteService { ... }

func NewSshService() *SshService { ... }

func NewSystemService() *SystemService { ... }

func NewWikiService() *WikiService { ... }

```

---

### Package `ssh` (`ssh`)

- **Imports (18):** `context`, `encoding/base64`, `errors`, `fmt`, `github.com/google/uuid`, `github.com/pkg/sftp`, `golang.org/x/crypto/ssh`, `io`, `io/fs`, `net`, `os`, `path`, `path/filepath`, `sort`, `strings`, `sync`, `terminal/core`, `time`

#### Constants & Variables

```go
const statusRunning = "running"
const statusDone = "done"
const statusError = "error"
const statusCanceled = "canceled"
```

#### Structs & Methods

```go
// DirListing 是一次目录读取的结果。
type DirListing struct {
	Path string `json:"path"`
	Parent string `json:"parent"`
	Items []FileItem `json:"items"`
}

// FileItem 是远程目录中的一个条目。
type FileItem struct {
	Name string `json:"name"`
	Path string `json:"path"`
	IsDir bool `json:"isDir"`
	IsLink bool `json:"isLink"`
	Size int64 `json:"size"`
	Mode string `json:"mode"`
	ModTime int64 `json:"modTime"`
}

type SSHCPUInfo struct {
	UsagePercent float64 `json:"usagePercent"`
	Cores int `json:"cores"`
	LoadAvg []float64 `json:"loadAvg"`
}

type SSHCronItem struct {
	ID string `json:"id"`
	Expression string `json:"expression"`
	Command string `json:"command"`
	Enabled bool `json:"enabled"`
	Comment string `json:"comment"`
}

type SSHDashboardInfo struct {
	Hostname string `json:"hostname"`
	OS string `json:"os"`
	Uptime string `json:"uptime"`
	CPU SSHCPUInfo `json:"cpu"`
	Mem SSHMemInfo `json:"mem"`
	Disks []SSHDiskInfo `json:"disks"`
	Nets []SSHNetInfo `json:"nets"`
}

type SSHDiskInfo struct {
	Mount string `json:"mount"`
	Filesystem string `json:"filesystem"`
	FsType string `json:"fsType"`
	Total uint64 `json:"total"`
	Used uint64 `json:"used"`
	Available uint64 `json:"available"`
	UsagePercent float64 `json:"usagePercent"`
	IsVirtual bool `json:"isVirtual"`
}

type SSHMemInfo struct {
	Total uint64 `json:"total"`
	Used uint64 `json:"used"`
	Free uint64 `json:"free"`
	Available uint64 `json:"available"`
	UsagePercent float64 `json:"usagePercent"`
	SwapTotal uint64 `json:"swapTotal"`
	SwapUsed uint64 `json:"swapUsed"`
}

type SSHNetInfo struct {
	Name string `json:"name"`
	IP string `json:"ip"`
	RxBytes uint64 `json:"rxBytes"`
	TxBytes uint64 `json:"txBytes"`
	IsLoopback bool `json:"isLoopback"`
	IsVirtual bool `json:"isVirtual"`
}

type SSHProcessInfo struct {
	PID int `json:"pid"`
	User string `json:"user"`
	CPU float64 `json:"cpu"`
	Mem float64 `json:"mem"`
	Rss uint64 `json:"rss"`
	Command string `json:"command"`
}

type SSHServiceInfo struct {
	Name string `json:"name"`
	Load string `json:"load"`
	Active string `json:"active"`
	Sub string `json:"sub"`
	Description string `json:"description"`
}

// Session 表示一条已建立的 SSH 连接（终端 + SFTP 复用同一 client）。
type Session struct {
	id string
	cfg core.ServerConfig
	client *golangssh.Client
	shellMu sync.Mutex
	shell *golangssh.Session
	stdin io.WriteCloser
	sftpMu sync.Mutex
	sftpClient *sftp.Client
	homeDir string
	closeOnce sync.Once
	done chan struct{}
	bufMu sync.Mutex
	buffer []byte
	attached bool
}

// Calls: [cancel, context.Background, context.WithTimeout, s.ExecCombinedWithContext]
func (s *Session) ExecCombined(cmd string) (string, error) { ... }

// Calls: [cancel, context.WithTimeout, errors.Is, errors.New, execCtx.Deadline, execCtx.Done, execCtx.Err, fmt.Errorf, fmt.Sprintf, s.client.NewSession, s.isClosed, sess.Close, sess.CombinedOutput, sess.Signal, string]
func (s *Session) ExecCombinedWithContext(ctx context.Context, cmd string) (string, error) { ... }

// Calls: [s.cfg.Label, s.isClosed]
func (s *Session) Info() SessionInfo { ... }

// Calls: [s.bufMu.Lock, s.bufMu.Unlock, s.client.Close, s.closeOnce.Do, s.sftpClient.Close, s.sftpMu.Lock, s.sftpMu.Unlock, s.shell.Close, s.shellMu.Lock, s.shellMu.Unlock, s.stdin.Close]
func (s *Session) close() { ... }

// Calls: [errors.New, fmt.Errorf, fmt.Sprintf, s.ExecCombined, strings.TrimSpace]
func (s *Session) controlService(serviceName string, action string) error { ... }

// Calls: [fmt.Errorf, fmt.Sprintf, isCronExpression, s.ExecCombined, strings.Contains, strings.Fields, strings.HasPrefix, strings.Join, strings.Split, strings.TrimPrefix, strings.TrimSpace]
func (s *Session) getCronList() ([]SSHCronItem, error) { ... }

// Calls: [float64, fmt.Errorf, fmt.Sscanf, formatUptime, isVirtualFs, isVirtualNet, parseProcStatCpu, s.ExecCombined, strings.Contains, strings.Fields, strings.HasPrefix, strings.HasSuffix, strings.Index, strings.Split, strings.SplitN, strings.Trim, strings.TrimSpace, strings.TrimSuffix]
func (s *Session) getDashboardInfo() (*SSHDashboardInfo, error) { ... }

// Calls: [fmt.Errorf, fmt.Sscanf, s.ExecCombined, strings.Fields, strings.Join, strings.Split, strings.TrimSpace]
func (s *Session) getProcessList() ([]SSHProcessInfo, error) { ... }

// Calls: [fmt.Errorf, s.ExecCombined, strings.Contains, strings.Fields, strings.HasSuffix, strings.Join, strings.Split, strings.ToLower, strings.TrimSpace]
func (s *Session) getServiceList() ([]SSHServiceInfo, error) { ... }

// Calls: [errors.New, fmt.Errorf, fmt.Sprintf, s.ExecCombined, strings.TrimSpace]
func (s *Session) getServiceLogs(serviceName string) (string, error) { ... }

func (s *Session) isClosed() bool { ... }

// Calls: [errors.New, fmt.Errorf, fmt.Sprintf, s.ExecCombined, strings.TrimSpace]
func (s *Session) killProcess(pid int) error { ... }

// Calls: [errors.New, fmt.Errorf, s.ExecCombined, strings.TrimSpace]
func (s *Session) runCronCommand(command string) (string, error) { ... }

// Calls: [base64.StdEncoding.EncodeToString, fmt.Errorf, fmt.Sprintf, s.ExecCombined, strings.Join, strings.TrimSpace]
func (s *Session) saveCronList(items []SSHCronItem) error { ... }

// sftpConn 惰性创建 SFTP 子系统连接。
// Calls: [errors.New, fmt.Errorf, s.isClosed, s.sftpMu.Lock, s.sftpMu.Unlock, sftp.MaxConcurrentRequestsPerFile, sftp.NewClient]
func (s *Session) sftpConn() (*sftp.Client, error) { ... }

// SessionInfo 是暴露给前端的会话摘要。
type SessionInfo struct {
	ID string `json:"id"`
	ServerID string `json:"serverId"`
	Title string `json:"title"`
	Host string `json:"host"`
	Port int `json:"port"`
	Username string `json:"username"`
	Connected bool `json:"connected"`
	HomeDir string `json:"homeDir"`
}

// SessionManager 管理所有活动会话。
type SessionManager struct {
	mu sync.RWMutex
	sessions map[string]*Session
	ctx context.Context
}

// Attach 挂载前端终端视图，回放缓冲的早期 Prompt/MOTD 数据并开启后续实时事件流。
// Calls: [base64.StdEncoding.EncodeToString, core.EmitEvent, m.Get, s.bufMu.Lock, s.bufMu.Unlock]
func (m *SessionManager) Attach(sessionID string) error { ... }

// Calls: [m.mu.Lock, m.mu.Unlock, s.close]
func (m *SessionManager) CloseAll() { ... }

// Connect 建立 SSH 连接并启动交互式 shell。
// Calls: [base64.StdEncoding.EncodeToString, buildAuthMethods, cfg.Addr, cfg.Validate, conn.Close, core.EmitEvent, fmt.Errorf, golangssh.InsecureIgnoreHostKey, golangssh.NewClient, golangssh.NewClientConn, m.detectHome, m.keepAlive, m.mu.Lock, m.mu.Unlock, m.startShell, net.DialTimeout, session.Info, session.bufMu.Lock, session.bufMu.Unlock, session.close, time.AfterFunc, uuid.NewString]
func (m *SessionManager) Connect(cfg core.ServerConfig, cols int, rows int) (SessionInfo, error) { ... }

// Calls: [m.Get, s.controlService]
func (m *SessionManager) ControlService(sessionID string, serviceName string, action string) error { ... }

// Calls: [errors.New, fmt.Errorf, m.mu.RLock, m.mu.RUnlock, s.isClosed]
func (m *SessionManager) Get(id string) (*Session, error) { ... }

// Calls: [m.Get, s.getCronList]
func (m *SessionManager) GetCronList(sessionID string) ([]SSHCronItem, error) { ... }

// Calls: [m.Get, s.getDashboardInfo]
func (m *SessionManager) GetDashboardStats(sessionID string) (*SSHDashboardInfo, error) { ... }

// Calls: [m.Get, s.getProcessList]
func (m *SessionManager) GetProcessList(sessionID string) ([]SSHProcessInfo, error) { ... }

// Calls: [m.Get, s.getServiceList]
func (m *SessionManager) GetServiceList(sessionID string) ([]SSHServiceInfo, error) { ... }

// Calls: [m.Get, s.getServiceLogs]
func (m *SessionManager) GetServiceLogs(sessionID string, serviceName string) (string, error) { ... }

// Calls: [m.Get, s.killProcess]
func (m *SessionManager) KillProcess(sessionID string, pid int) error { ... }

// Calls: [m.mu.RLock, m.mu.RUnlock, s.Info]
func (m *SessionManager) List() []SessionInfo { ... }

// Calls: [m.mu.Lock, m.mu.Unlock, s.close]
func (m *SessionManager) Remove(id string) { ... }

// Calls: [m.Get, s.shell.WindowChange, s.shellMu.Lock, s.shellMu.Unlock]
func (m *SessionManager) Resize(sessionID string, cols int, rows int) error { ... }

// Calls: [m.Get, s.runCronCommand]
func (m *SessionManager) RunCronCommand(sessionID string, command string) (string, error) { ... }

// Calls: [m.Get, s.saveCronList]
func (m *SessionManager) SaveCronList(sessionID string, items []SSHCronItem) error { ... }

func (m *SessionManager) SetContext(ctx context.Context) { ... }

// TestConnection 使用临时配置测试 SSH 连通性并返回网络延迟。
// Calls: [buildAuthMethods, cfg.Addr, cfg.Validate, client.Close, conn.Close, conn.SetDeadline, fmt.Errorf, golangssh.InsecureIgnoreHostKey, golangssh.NewClient, golangssh.NewClientConn, net.DialTimeout, time.Now, time.Now().Add, time.Since, time.Since().Milliseconds]
func (m *SessionManager) TestConnection(cfg core.ServerConfig) (map[string]any, error) { ... }

// Calls: [errors.New, m.Get, s.shellMu.Lock, s.shellMu.Unlock, s.stdin.Write]
func (m *SessionManager) Write(sessionID string, data string) error { ... }

// Calls: [client.Getwd, s.sftpConn]
func (m *SessionManager) detectHome(s *Session) string { ... }

// Calls: [core.EmitEvent, s.close, s.isClosed]
func (m *SessionManager) handleDisconnect(s *Session, reason string) { ... }

// Calls: [m.handleDisconnect, s.client.SendRequest, ticker.Stop, time.NewTicker]
func (m *SessionManager) keepAlive(s *Session) { ... }

// Calls: [base64.StdEncoding.EncodeToString, core.EmitEvent, r.Read, s.bufMu.Lock, s.bufMu.Unlock]
func (m *SessionManager) pumpOutput(s *Session, r io.Reader) { ... }

// Calls: [fmt.Errorf, m.handleDisconnect, m.pumpOutput, s.client.NewSession, s.shellMu.Lock, s.shellMu.Unlock, shell.Close, shell.RequestPty, shell.Shell, shell.StderrPipe, shell.StdinPipe, shell.StdoutPipe, shell.Wait]
func (m *SessionManager) startShell(s *Session, cols int, rows int) error { ... }

// Transfer 描述一个上传/下载任务。
type Transfer struct {
	ID string `json:"id"`
	SessionID string `json:"sessionId"`
	// upload | download
	Kind string `json:"kind"`
	Name string `json:"name"`
	LocalPath string `json:"localPath"`
	RemotePath string `json:"remotePath"`
	Size int64 `json:"size"`
	Transferred int64 `json:"transferred"`
	// running | done | error | canceled
	Status string `json:"status"`
	Error string `json:"error"`
	StartedAt int64 `json:"startedAt"`
	UpdatedAt int64 `json:"updatedAt"`
}

type TransferManager struct {
	mu sync.Mutex
	ctx context.Context
	items map[string]*Transfer
	order []string
	cancels map[string]context.CancelFunc
	lastEmit map[string]time.Time
}

// Calls: [cancel, tm.mu.Lock, tm.mu.Unlock]
func (tm *TransferManager) Cancel(id string) { ... }

// CancelAll 取消所有正在运行的传输任务。
// Calls: [c, tm.mu.Lock, tm.mu.Unlock]
func (tm *TransferManager) CancelAll() { ... }

// Calls: [tm.mu.Lock, tm.mu.Unlock]
func (tm *TransferManager) ClearFinished() { ... }

// Calls: [tm.mu.Lock, tm.mu.Unlock]
func (tm *TransferManager) List() []Transfer { ... }

func (tm *TransferManager) SetContext(ctx context.Context) { ... }

// Calls: [tm.emit, tm.mu.Lock, tm.mu.Unlock]
func (tm *TransferManager) addProgress(t *Transfer, n int64) { ... }

// Calls: [context.Background, context.WithCancel, time.Now, time.Now().UnixMilli, tm.emit, tm.mu.Lock, tm.mu.Unlock, uuid.NewString]
func (tm *TransferManager) create(sessionID string, kind string, name string, localPath string, remotePath string) (*Transfer, context.Context) { ... }

// Calls: [core.EmitEvent, now.Sub, now.UnixMilli, time.Now, tm.mu.Lock, tm.mu.Unlock]
func (tm *TransferManager) emit(t *Transfer, force bool) { ... }

// Calls: [err.Error, errors.Is, tm.emit, tm.mu.Lock, tm.mu.Unlock]
func (tm *TransferManager) finish(t *Transfer, err error) { ... }

// Calls: [tm.emit, tm.mu.Lock, tm.mu.Unlock]
func (tm *TransferManager) setSize(t *Transfer, size int64) { ... }

// progressReader 在读取过程中上报进度，并响应取消。
type progressReader struct {
	r io.Reader
	ctx context.Context
	report func(int64)
}

// Calls: [int64, p.ctx.Done, p.r.Read, p.report]
func (p *progressReader) Read(b []byte) (int, error) { ... }

```

#### Functions

```go
// Calls: [client.Open, errors.New, filepath.Dir, fmt.Errorf, fmt.Sprintf, io.CopyBuffer, localFile.Close, m.Get, os.Create, os.MkdirAll, session.ResolveRemotePath, session.client.NewSession, session.isClosed, session.sftpConn, src.Close, sshSess.Close, sshSess.Start, sshSess.StdoutPipe, sshSess.Wait]
func (m *SessionManager) DownloadFileDirect(sessionID string, remotePath string, localPath string) error { ... }

// Calls: [NormalizeRemote, client.ReadDir, client.Stat, entry.IsDir, entry.ModTime, entry.ModTime().Unix, entry.Mode, entry.Mode().String, entry.Name, entry.Size, fmt.Errorf, m.Get, path.Dir, path.Join, session.sftpConn, sort.SliceStable, st.IsDir, st.Size, strings.HasPrefix, strings.ToLower, strings.TrimPrefix]
func (m *SessionManager) ListDir(sessionID string, dir string) (DirListing, error) { ... }

// MakeDir 在远程目录 parent 下创建名为 name 的新目录。
// Calls: [errors.New, fmt.Errorf, fmt.Sprintf, m.Get, m.NotifyDirChanged, mkdirAllRemote, path.Join, session.ExecCombined, session.ResolveRemotePath, session.isClosed, session.sftpConn, strings.TrimSpace]
func (m *SessionManager) MakeDir(sessionID string, parent string, name string) error { ... }

func NewSessionManager() *SessionManager { ... }

func NewTransferManager() *TransferManager { ... }

// Calls: [path.Clean, strings.HasPrefix, strings.ReplaceAll, strings.TrimSpace]
func NormalizeRemote(p string) string { ... }

// Calls: [core.EmitEvent]
func (m *SessionManager) NotifyDirChanged(sessionID string, dir string) { ... }

// Calls: [client.Open, errors.New, f.Close, fmt.Errorf, fmt.Sprintf, io.LimitReader, io.ReadAll, m.Get, session.ResolveRemotePath, session.client.NewSession, session.isClosed, session.sftpConn, sshSess.Close, sshSess.Start, sshSess.StdoutPipe, sshSess.Wait]
func (m *SessionManager) ReadFileContent(sessionID string, remotePath string) ([]byte, error) { ... }

// Calls: [NormalizeRemote, errors.New, m.Get, m.removeRemote, session.sftpConn]
func (m *SessionManager) RemoveRemotePath(sessionID string, target string) error { ... }

// RenameRemotePath 重命名远程文件或目录。
// Calls: [client.Rename, errors.New, fmt.Errorf, fmt.Sprintf, m.Get, m.NotifyDirChanged, path.Dir, path.Join, session.ExecCombined, session.ResolveRemotePath, session.isClosed, session.sftpConn, strings.Contains, strings.TrimSpace]
func (m *SessionManager) RenameRemotePath(sessionID string, target string, newName string) error { ... }

// Calls: [NormalizeRemote, path.Join, strings.HasPrefix, strings.TrimPrefix]
func (s *Session) ResolveRemotePath(remotePath string) string { ... }

// Calls: [NormalizeRemote, client.Stat, filepath.Join, m.Get, m.downloadFile, m.downloadTree, path.Base, remoteTreeSize, session.sftpConn, st.IsDir, st.Size, tm.create, tm.finish, tm.setSize]
func (m *SessionManager) StartDownload(tm *TransferManager, sessionID string, remotePath string, localDir string) error { ... }

// Calls: [NormalizeRemote, filepath.Base, info.IsDir, info.Size, localTreeSize, m.Get, m.NotifyDirChanged, m.uploadFile, m.uploadTree, os.Stat, path.Join, session.sftpConn, tm.create, tm.finish, tm.setSize]
func (m *SessionManager) StartUpload(tm *TransferManager, sessionID string, remoteDir string, localPath string) error { ... }

// Calls: [NormalizeRemote, base64.StdEncoding.DecodeString, client.Create, f.Close, fmt.Errorf, int64, io.CopyBuffer, m.Get, m.NotifyDirChanged, mkdirAllRemote, path.Join, session.sftpConn, string, strings.NewReader, tm.addProgress, tm.create, tm.finish, tm.setSize]
func (m *SessionManager) UploadBase64(tm *TransferManager, sessionID string, remoteDir string, name string, data string) error { ... }

// Calls: [client.Chmod, client.Create, dst.Close, errors.New, fmt.Errorf, fmt.Sprintf, info.IsDir, info.Mode, info.Mode().Perm, io.CopyBuffer, localFile.Close, localFile.Stat, m.Get, m.NotifyDirChanged, mkdirAllRemote, os.Open, path.Dir, session.ExecCombined, session.ResolveRemotePath, session.client.NewSession, session.isClosed, session.sftpConn, sshSess.Close, sshSess.Start, sshSess.StdinPipe, sshSess.Wait, stdinPipe.Close]
func (m *SessionManager) UploadFileDirect(sessionID string, localPath string, remotePath string) error { ... }

// Calls: [client.Create, errors.New, f.Close, f.Write, fmt.Errorf, fmt.Sprintf, m.Get, m.NotifyDirChanged, mkdirAllRemote, path.Dir, session.ExecCombined, session.ResolveRemotePath, session.client.NewSession, session.isClosed, session.sftpConn, sshSess.Close, sshSess.Start, sshSess.StdinPipe, sshSess.Wait, stdinPipe.Close, stdinPipe.Write]
func (m *SessionManager) WriteFileContent(sessionID string, remotePath string, data []byte) error { ... }

// Calls: [errors.New, fmt.Errorf, golangssh.KeyboardInteractive, golangssh.ParsePrivateKey, golangssh.ParsePrivateKeyWithPassphrase, golangssh.Password, golangssh.PublicKeys, readPrivateKey, strings.TrimSpace]
func buildAuthMethods(cfg core.ServerConfig) ([]golangssh.AuthMethod, error) { ... }

// Calls: [client.Open, dst.Close, filepath.Dir, fmt.Errorf, io.CopyBuffer, os.Create, os.MkdirAll, src.Close, tm.addProgress]
func (m *SessionManager) downloadFile(tm *TransferManager, ctx context.Context, client *sftp.Client, remotePath string, localPath string, t *Transfer) error { ... }

// Calls: [client.Walk, ctx.Done, filepath.Clean, filepath.FromSlash, filepath.IsAbs, filepath.Join, m.downloadFile, os.MkdirAll, st.IsDir, st.Mode, st.Mode().IsRegular, strings.HasPrefix, strings.TrimPrefix, walker.Err, walker.Path, walker.Stat, walker.Step]
func (m *SessionManager) downloadTree(tm *TransferManager, ctx context.Context, client *sftp.Client, remoteRoot string, localRoot string, t *Transfer) error { ... }

// Calls: [fmt.Sprintf, fmt.Sscanf, int, strings.Contains, strings.Fields, strings.Index, strings.Join, strings.Split, strings.TrimSpace, strings.TrimSuffix]
func formatUptime(upStr string, procUptime string) string { ... }

func isCronExpression(fields []string) bool { ... }

// Calls: [strings.HasPrefix, strings.ToLower]
func isVirtualFs(fs string, fsType string, mount string) bool { ... }

// Calls: [strings.HasPrefix]
func isVirtualNet(name string) bool { ... }

// Calls: [d.Info, d.IsDir, filepath.WalkDir, info.Size]
func localTreeSize(root string) (int64, error) { ... }

// Calls: [client.Mkdir, client.Stat, fmt.Errorf, mkdirAllRemote, path.Dir, st.IsDir]
func mkdirAllRemote(client *sftp.Client, dir string) error { ... }

// Calls: [fmt.Sscanf, strings.Fields]
func parseProcStatCpu(line string) (total uint64, idle uint64) { ... }

// Calls: [fmt.Errorf, os.ReadFile, strings.Contains, strings.TrimSpace]
func readPrivateKey(value string) ([]byte, error) { ... }

// Calls: [client.Walk, walker.Err, walker.Stat, walker.Stat().IsDir, walker.Stat().Size, walker.Step]
func remoteTreeSize(client *sftp.Client, root string) int64 { ... }

// Calls: [client.Lstat, client.ReadDir, client.Remove, client.RemoveDirectory, entry.Name, m.removeRemote, path.Join, st.IsDir, st.Mode]
func (m *SessionManager) removeRemote(client *sftp.Client, target string) error { ... }

// Calls: [client.Chmod, client.Create, dst.Close, fmt.Errorf, info.Mode, info.Mode().Perm, io.CopyBuffer, mkdirAllRemote, os.Open, os.Stat, path.Dir, src.Close, tm.addProgress]
func (m *SessionManager) uploadFile(tm *TransferManager, ctx context.Context, client *sftp.Client, localPath string, remotePath string, t *Transfer) error { ... }

// Calls: [ctx.Done, d.IsDir, d.Type, d.Type().IsRegular, filepath.Rel, filepath.ToSlash, filepath.WalkDir, m.uploadFile, mkdirAllRemote, path.Join]
func (m *SessionManager) uploadTree(tm *TransferManager, ctx context.Context, client *sftp.Client, localRoot string, remoteRoot string, t *Transfer) error { ... }

```

---

### Package `storage` (`storage`)

- **Imports (6):** `encoding/json`, `fmt`, `os`, `path/filepath`, `sync`, `time`

#### Constants & Variables

```go
const appDirName = "xTerminal"
var testBaseDir string
var testBaseDirMu sync.RWMutex
```

#### Functions

```go
// AgentDBPath 智能体 SQLite 数据库路径
// Calls: [DataDir, filepath.Join]
func AgentDBPath() string { ... }

// ApisPath 接口树配置文件路径
// Calls: [ConfigDir, filepath.Join]
func ApisPath() string { ... }

// BaseDir 获取应用根目录（如 Windows 下的 %APPDATA%/xTerminal 或 Linux/macOS 下的 ~/.config/xTerminal）。
// Calls: [filepath.Join, os.UserConfigDir, os.UserHomeDir, testBaseDirMu.RLock, testBaseDirMu.RUnlock]
func BaseDir() string { ... }

// ComposesPath Docker 编排配置文件路径
// Calls: [ConfigDir, filepath.Join]
func ComposesPath() string { ... }

// ConfigDir 配置文件与密钥目录 (%APPDATA%/xTerminal/config)
// Calls: [BaseDir, filepath.Join]
func ConfigDir() string { ... }

// DataDir SQLite 数据库与持久化数据目录 (%APPDATA%/xTerminal/data)
// Calls: [BaseDir, filepath.Join]
func DataDir() string { ... }

// EnsureDirs 一次性确保所有核心子目录创建完成
// Calls: [ConfigDir, DataDir, LogsDir, PlansRootDir, SkillsDir, WikiDir, fmt.Errorf, os.MkdirAll]
func EnsureDirs() error { ... }

// K8sOrchestrationsPath K8s 编排配置文件路径
// Calls: [ConfigDir, filepath.Join]
func K8sOrchestrationsPath() string { ... }

// LogFilePath 日志文件绝对路径
// Calls: [LogsDir, filepath.Join]
func LogFilePath() string { ... }

// LogsDir 日志目录 (%APPDATA%/xTerminal/logs)
// Calls: [BaseDir, filepath.Join]
func LogsDir() string { ... }

// PlansDir 特定会话方案目录 (%APPDATA%/xTerminal/plans/<sessionID>)
// Calls: [PlansRootDir, filepath.Join]
func PlansDir(sessionID string) string { ... }

// PlansRootDir 实施方案根目录 (%APPDATA%/xTerminal/plans)
// Calls: [BaseDir, filepath.Join]
func PlansRootDir() string { ... }

// ReadJSON 读取指定路径文件并反序列化到 target。
// Calls: [fmt.Errorf, json.Unmarshal, os.ReadFile]
func ReadJSON(filePath string, target any) error { ... }

// SecretKeyPath 密码加密密钥路径
// Calls: [ConfigDir, filepath.Join]
func SecretKeyPath() string { ... }

// ServersPath 连接配置与全局设置文件路径
// Calls: [ConfigDir, filepath.Join]
func ServersPath() string { ... }

// SetBaseDirForTest 用于单元测试环境隔离基础目录。
// 传入空字符串即可重置恢复默认路径。
// Calls: [testBaseDirMu.Lock, testBaseDirMu.Unlock]
func SetBaseDirForTest(dir string) { ... }

// SkillsDir 智能体技能库目录 (%APPDATA%/xTerminal/skills)
// Calls: [BaseDir, filepath.Join]
func SkillsDir() string { ... }

// WikiDir 知识库 Markdown 目录 (%APPDATA%/xTerminal/wiki)
// Calls: [BaseDir, filepath.Join]
func WikiDir() string { ... }

// WriteFileAtomic 通过“写临时文件 -> 落盘同步 -> 重命名替换”实现安全的原子写入，
// 避免因进程意外崩溃或断电导致目标文件截断损坏。
// Calls: [f.Close, f.Sync, f.Write, filepath.Dir, fmt.Errorf, fmt.Sprintf, os.MkdirAll, os.OpenFile, os.Remove, os.Rename, time.Now, time.Now().UnixNano]
func WriteFileAtomic(filePath string, data []byte, perm os.FileMode) error { ... }

// WriteJSONAtomic 将结构体格式化为缩进 JSON 并以原子方式写入本地文件。
// Calls: [WriteFileAtomic, fmt.Errorf, json.MarshalIndent]
func WriteJSONAtomic(filePath string, v any, perm os.FileMode) error { ... }

```

---

### TypeScript Module `json` (`frontend/bindings/encoding/json`)

```typescript
// Cynhyrchwyd y ffeil hon yn awtomatig. PEIDIWCH Â MODIWL
// This file is automatically generated. DO NOT EDIT
// RawMessage is a raw encoded JSON value.
// It implements [Marshaler] and [Unmarshaler] and can
// be used to delay JSON decoding or precompute a JSON encoding.
export type RawMessage = any;

```

---

### TypeScript Module `internal` (`frontend/bindings/github.com/wailsapp/wails/v3/internal`)

- **Imports (1):** `@wailsio/runtime`

```typescript
```

---

### TypeScript Module `ask` (`frontend/bindings/terminal/agent/ask`)

```typescript
// Cynhyrchwyd y ffeil hon yn awtomatig. PEIDIWCH Â MODIWL
// This file is automatically generated. DO NOT EDIT
export interface AskRequest {
	...
}

```

---

### TypeScript Module `guard` (`frontend/bindings/terminal/agent/guard`)

```typescript
// Cynhyrchwyd y ffeil hon yn awtomatig. PEIDIWCH Â MODIWL
// This file is automatically generated. DO NOT EDIT
// HitlRequest represents an in-flight human approval request
export interface HitlRequest {
	...
}

```

---

### TypeScript Module `agent` (`frontend/bindings/terminal/agent`)

- **Imports (2):** `./planner/models.js`, `./tools/models.js`

```typescript
export interface FrontendMessage {
	...
}

export interface ProcessStep {
	...
}

export interface ToolCallItem {
	...
}

export type ActiveConnectionInfo = tools$0.ActiveConnectionInfo;

```

---

### TypeScript Module `mcp` (`frontend/bindings/terminal/agent/mcp`)

```typescript
// Cynhyrchwyd y ffeil hon yn awtomatig. PEIDIWCH Â MODIWL
// This file is automatically generated. DO NOT EDIT
export interface ServerStatus {
	...
}

export interface SessionInfo {
	...
}

export interface ToolDefinition {
	...
}

```

---

### TypeScript Module `planner` (`frontend/bindings/terminal/agent/planner`)

- **Imports (1):** `../../../encoding/json/models.js`

```typescript
// Plan 规划方案实体 (对齐 Antigravity IDE 规范，以 Markdown 为核心资产)
export interface Plan {
	...
}

export interface PlanStep {
	...
}

```

---

### TypeScript Module `skills` (`frontend/bindings/terminal/agent/skills`)

```typescript
// Cynhyrchwyd y ffeil hon yn awtomatig. PEIDIWCH Â MODIWL
// This file is automatically generated. DO NOT EDIT
export interface Skill {
	...
}

```

---

### TypeScript Module `store` (`frontend/bindings/terminal/agent/store`)

```typescript
// Cynhyrchwyd y ffeil hon yn awtomatig. PEIDIWCH Â MODIWL
// This file is automatically generated. DO NOT EDIT
export interface SessionItem {
	...
}

```

---

### TypeScript Module `tools` (`frontend/bindings/terminal/agent/tools`)

```typescript
// Cynhyrchwyd y ffeil hon yn awtomatig. PEIDIWCH Â MODIWL
// This file is automatically generated. DO NOT EDIT
export interface ActiveConnectionInfo {
	...
}

```

---

### TypeScript Module `wiki` (`frontend/bindings/terminal/agent/wiki`)

```typescript
// Cynhyrchwyd y ffeil hon yn awtomatig. PEIDIWCH Â MODIWL
// This file is automatically generated. DO NOT EDIT
// WikiCatalogItem 紧凑目录清单项，用于 System Prompt 注入与极速索引
export interface WikiCatalogItem {
	...
}

// WikiNode 树状导航节点定义 (与通用树组件对齐)
export interface WikiNode {
	...
}

```

---

### TypeScript Module `core` (`frontend/bindings/terminal/core`)

```typescript
// Cynhyrchwyd y ffeil hon yn awtomatig. PEIDIWCH Â MODIWL
// This file is automatically generated. DO NOT EDIT
export interface AiModelItem {
	...
}

export interface AppSettings {
	...
}

export interface AppVersionInfo {
	...
}

// DockerComposeRecord 描述在客户端本地保存的一个 Compose 配置文件记录。
export interface DockerComposeRecord {
	...
}

// K8sOrchestrationRecord 描述在客户端本地保存的一个 Kubernetes YAML 资源编排记录。
export interface K8sOrchestrationRecord {
	...
}

// K8sResourceItemSummary 记录编排中单个资源的基本元信息。
export interface K8sResourceItemSummary {
	...
}

// ServerConfig 描述一台远程服务器的连接信息。Type 字段区分 SSH / Redis / MySQL / Docker / Postgres。
export interface ServerConfig {
	...
}

// ServerGroup 描述服务器分组。
export interface ServerGroup {
	...
}

export interface UpdateCheckResult {
	...
}

```

---

### TypeScript Module `db` (`frontend/bindings/terminal/db`)

```typescript
// Cynhyrchwyd y ffeil hon yn awtomatig. PEIDIWCH Â MODIWL
// This file is automatically generated. DO NOT EDIT
// MysqlQueryResult 表示单次 SQL 执行的统一输出。
export interface MysqlQueryResult {
	...
}

// PgDatabase 描述 PostgreSQL 数据库。
export interface PgDatabase {
	...
}

// PgFunction 描述存储过程与函数。
export interface PgFunction {
	...
}

// PgRole 描述数据库角色/用户。
export interface PgRole {
	...
}

// PgSchema 描述 PostgreSQL Schema 命名空间。
export interface PgSchema {
	...
}

// PgSequence 描述序列。
export interface PgSequence {
	...
}

// PgSession 描述活跃会话（pg_stat_activity）。
export interface PgSession {
	...
}

// PgStatus 描述数据库服务器健康与运行状态。
export interface PgStatus {
	...
}

// PgTable 描述 PostgreSQL 数据表或视图元数据。
export interface PgTable {
	...
}

// PostgresQueryResult 表示 SQL 执行的统一输出结构。
export interface PostgresQueryResult {
	...
}

```

---

### TypeScript Module `docker` (`frontend/bindings/terminal/docker`)

```typescript
// Cynhyrchwyd y ffeil hon yn awtomatig. PEIDIWCH Â MODIWL
// This file is automatically generated. DO NOT EDIT
// DockerComposeDeployReq 用于创建或更新 Compose 项目。
export interface DockerComposeDeployReq {
	...
}

// DockerComposeServiceInfo 表示 Stack 内单个服务的运行状态。
export interface DockerComposeServiceInfo {
	...
}

// DockerComposeStackInfo 表示一个 Compose 项目（Stack）的聚合状态信息。
export interface DockerComposeStackInfo {
	...
}

// DockerContainerInfo 描述容器信息。
export interface DockerContainerInfo {
	...
}

// DockerCreateContainerReq 创建容器参数。
export interface DockerCreateContainerReq {
	...
}

// DockerImageInfo 描述镜像信息。
export interface DockerImageInfo {
	...
}

// DockerNetworkInfo 描述网络信息。
export interface DockerNetworkInfo {
	...
}

// DockerOverview 描述 Docker 守护进程与系统概览信息。
export interface DockerOverview {
	...
}

// DockerPortMapping 端口映射。
export interface DockerPortMapping {
	...
}

// DockerPruneReport 清理结果报告。
export interface DockerPruneReport {
	...
}

// DockerVolumeInfo 描述数据卷信息。
export interface DockerVolumeInfo {
	...
}

```

---

### TypeScript Module `k8s` (`frontend/bindings/terminal/k8s`)

```typescript
// Cynhyrchwyd y ffeil hon yn awtomatig. PEIDIWCH Â MODIWL
// This file is automatically generated. DO NOT EDIT
// K8sApplyResult 描述 YAML 部署单个资源的结果。
export interface K8sApplyResult {
	...
}

// K8sConfigMapInfo 描述 ConfigMap 配置信息。
export interface K8sConfigMapInfo {
	...
}

// K8sContainerSummary 描述 Pod 内容器状态。
export interface K8sContainerSummary {
	...
}

// K8sDeleteResult 描述 YAML 下线删除单个资源的结果。
export interface K8sDeleteResult {
	...
}

// K8sDeploymentInfo 描述 Deployment 无状态负载信息。
export interface K8sDeploymentInfo {
	...
}

// K8sIngressInfo 描述 Ingress 路由规则信息。
export interface K8sIngressInfo {
	...
}

// K8sNamespaceInfo 描述命名空间信息。
export interface K8sNamespaceInfo {
	...
}

// K8sNodeInfo 描述集群节点信息。
export interface K8sNodeInfo {
	...
}

// K8sOverview 描述 Kubernetes 集群的概览信息。
export interface K8sOverview {
	...
}

// K8sPVCInfo 描述持久卷声明信息。
export interface K8sPVCInfo {
	...
}

// K8sPodInfo 描述 Pod 实例信息。
export interface K8sPodInfo {
	...
}

// K8sSecretInfo 描述 Secret 凭据信息。
export interface K8sSecretInfo {
	...
}

// K8sServiceInfo 描述 Service 网络服务信息。
export interface K8sServiceInfo {
	...
}

// KubeconfigContextInfo 描述解析出来的 Kubeconfig 上下文及集群信息。
export interface KubeconfigContextInfo {
	...
}

```

---

### TypeScript Module `mongo` (`frontend/bindings/terminal/mongo`)

```typescript
// Cynhyrchwyd y ffeil hon yn awtomatig. PEIDIWCH Â MODIWL
// This file is automatically generated. DO NOT EDIT
// MongoBulkOp 描述一次批量写操作。
export interface MongoBulkOp {
	...
}

// MongoFindResult 查询结果。
export interface MongoFindResult {
	...
}

// MongoQuerySpec 描述一次结构化查询，由前端查询构建器生成。
export interface MongoQuerySpec {
	...
}

// MongoTxOp 事务中的一个操作。
export interface MongoTxOp {
	...
}

// MongoURIInfo 是连接串解析结果，供前端回填表单。
export interface MongoURIInfo {
	...
}

```

---

### TypeScript Module `proto` (`frontend/bindings/terminal/proto`)

```typescript
// Cynhyrchwyd y ffeil hon yn awtomatig. PEIDIWCH Â MODIWL
// This file is automatically generated. DO NOT EDIT
// ApiAuth 描述鉴权信息。
export interface ApiAuth {
	...
}

// ApiHeader 是请求头的一行，支持启用/禁用。
export interface ApiHeader {
	...
}

// ApiRequest 描述一次 HTTP 调试请求。
export interface ApiRequest {
	...
}

// ApiResponse 描述一次 HTTP 调试的响应结果。
export interface ApiResponse {
	...
}

// WsConnectRequest 是建立 WebSocket 连接所需的参数
export interface WsConnectRequest {
	...
}

// WsConnectResult 是连接结果
export interface WsConnectResult {
	...
}

```

---

### TypeScript Module `redis` (`frontend/bindings/terminal/redis`)

```typescript
// Cynhyrchwyd y ffeil hon yn awtomatig. PEIDIWCH Â MODIWL
// This file is automatically generated. DO NOT EDIT
export interface RedisCmdResult {
	...
}

export interface RedisKeyItem {
	...
}

export interface RedisKeysResult {
	...
}

export interface RedisMonitorInfo {
	...
}

export interface RedisPipelineResult {
	...
}

export interface RedisQueueItem {
	...
}

export interface RedisSlowLogEntry {
	...
}

export interface RedisTransactionResult {
	...
}

export interface RedisValue {
	...
}

```

---

### TypeScript Module `services` (`frontend/bindings/terminal/services`)

- **Imports (33):** `../agent/ask/models.js`, `../agent/guard/models.js`, `../agent/mcp/models.js`, `../agent/models.js`, `../agent/planner/models.js`, `../agent/skills/models.js`, `../agent/store/models.js`, `../agent/wiki/models.js`, `../core/models.js`, `../db/models.js`, `../docker/models.js`, `../k8s/models.js`, `../mongo/models.js`, `../proto/models.js`, `../redis/models.js`, `../ssh/models.js`, `./agentservice.js`, `./apiservice.js`, `./dockerservice.js`, `./k8sservice.js`, `./mcpservice.js`, `./models.js`, `./mongoservice.js`, `./mqttservice.js`, `./mysqlservice.js`, `./postgresservice.js`, `./redisservice.js`, `./sftpservice.js`, `./sqliteservice.js`, `./sshservice.js`, `./systemservice.js`, `./wikiservice.js`, `@wailsio/runtime`

```typescript
// Cynhyrchwyd y ffeil hon yn awtomatig. PEIDIWCH Â MODIWL
// This file is automatically generated. DO NOT EDIT
// ConfigIOResult 描述配置导入/导出操作的结果
export interface ConfigIOResult {
	...
}

// DockerGenerateComposeRequest 描述 AI 生成 Docker Compose 请求参数。
export interface DockerGenerateComposeRequest {
	...
}

// K8sGenerateYAMLRequest 描述 AI 生成 YAML 请求参数。
export interface K8sGenerateYAMLRequest {
	...
}

// Calls: [Call.ByID]
export function AgentAnswerAsk(askID: string, answer: string): $CancellablePromise<boolean> { ... }

// Calls: [Call.ByID]
export function AgentApprovePlan(planID: string): $CancellablePromise<boolean> { ... }

// Calls: [Call.ByID]
export function AgentCancelPlan(planID: string): $CancellablePromise<boolean> { ... }

// Calls: [Call.ByID]
export function AgentClearHistory(): $CancellablePromise<void> { ... }

// Calls: [Call.ByID]
export function AgentConfirmTool(confirmID: string, approved: boolean): $CancellablePromise<boolean> { ... }

// Calls: [Call.ByID]
export function AgentCreateSession(title: string): $CancellablePromise<store$0.SessionItem> { ... }

// Calls: [Call.ByID]
export function AgentDecideApproval(confirmID: string, approved: boolean, remember: boolean, reason: string): $CancellablePromise<boolean> { ... }

// Calls: [Call.ByID]
export function AgentDeleteSession(sessionID: string): $CancellablePromise<void> { ... }

// Calls: [Call.ByID]
export function AgentGenerateSessionTitle(sessionID: string): $CancellablePromise<string> { ... }

// Calls: [Call.ByID]
export function AgentGetActiveConnection(): $CancellablePromise<agent$0.ActiveConnectionInfo | null> { ... }

// Calls: [Call.ByID]
export function AgentGetHistory(): $CancellablePromise<agent$0.FrontendMessage[] | null> { ... }

// Calls: [Call.ByID]
export function AgentGetPendingApprovals(): $CancellablePromise<any[] | null> { ... }

// Calls: [Call.ByID]
export function AgentGetPendingAsks(): $CancellablePromise<(ask$0.AskRequest | null)[] | null> { ... }

// Calls: [Call.ByID]
export function AgentGetPendingHitls(): $CancellablePromise<(guard$0.HitlRequest | null)[] | null> { ... }

// Calls: [Call.ByID]
export function AgentGetSessionMessages(sessionID: string): $CancellablePromise<agent$0.FrontendMessage[] | null> { ... }

// Calls: [Call.ByID]
export function AgentGetSkillsDir(): $CancellablePromise<string> { ... }

// Calls: [Call.ByID]
export function AgentGetWorkspaceDir(): $CancellablePromise<string> { ... }

// Calls: [Call.ByID]
export function AgentListSessions(): $CancellablePromise<store$0.SessionItem[] | null> { ... }

// Calls: [Call.ByID]
export function AgentListSkills(): $CancellablePromise<skills$0.Skill[] | null> { ... }

// Calls: [Call.ByID]
export function AgentOpenSkillsDir(): $CancellablePromise<string> { ... }

// Calls: [Call.ByID]
export function AgentProposePlan(sessionID: string, objective: string): $CancellablePromise<planner$0.Plan | null> { ... }

// Calls: [Call.ByID]
export function AgentResolveHitl(confirmID: string, approved: boolean, reason: string): $CancellablePromise<boolean> { ... }

// Calls: [Call.ByID]
export function AgentRetryPlanStep(planID: string, stepID: string): $CancellablePromise<planner$0.PlanStep | null> { ... }

// Calls: [Call.ByID]
export function AgentSaveHistory(messages: agent$0.FrontendMessage[] | null): $CancellablePromise<void> { ... }

// Calls: [Call.ByID]
export function AgentSaveSessionMessages(sessionID: string, messages: agent$0.FrontendMessage[] | null): $CancellablePromise<void> { ... }

// Calls: [Call.ByID]
export function AgentSelectWorkspaceDir(): $CancellablePromise<string> { ... }

// Calls: [Call.ByID]
export function AgentSend(sessionID: string, messages: agent$0.FrontendMessage[] | null): $CancellablePromise<string> { ... }

// Calls: [Call.ByID]
export function AgentSetActiveConnection(info: agent$0.ActiveConnectionInfo): $CancellablePromise<void> { ... }

// Calls: [Call.ByID]
export function AgentSetWorkspaceDir(dir: string): $CancellablePromise<string> { ... }

// Calls: [Call.ByID]
export function AgentStopSend(sessionID: string): $CancellablePromise<boolean> { ... }

// Calls: [Call.ByID]
export function AgentUpdateSessionTitle(sessionID: string, title: string): $CancellablePromise<void> { ... }

// Calls: [Call.ByID]
export function ApiRequest(req: proto$0.ApiRequest): $CancellablePromise<proto$0.ApiResponse> { ... }

// ChooseExportApiFile 弹出文件保存对话框，将内容写入用户指定的路径
// Calls: [Call.ByID]
export function ChooseExportApiFile(content: string, defaultName: string): $CancellablePromise<string> { ... }

// ChooseImportApiFile 弹出文件选择对话框，读取用户选择的 JSON 文件内容
// Calls: [Call.ByID]
export function ChooseImportApiFile(): $CancellablePromise<string> { ... }

// LoadApiTree 读取本地接口树文件内容。如果文件不存在则自动创建并写入默认接口树
// Calls: [Call.ByID]
export function LoadApiTree(): $CancellablePromise<string> { ... }

// SaveApiTree 保存接口树数据到本地文件
// Calls: [Call.ByID]
export function SaveApiTree(content: string): $CancellablePromise<void> { ... }

// Calls: [Call.ByID]
export function WsClose(id: string): $CancellablePromise<void> { ... }

// Calls: [Call.ByID]
export function WsConnect(req: proto$0.WsConnectRequest): $CancellablePromise<proto$0.WsConnectResult> { ... }

// Calls: [Call.ByID]
export function WsSend(id: string, message: string): $CancellablePromise<void> { ... }

// DockerClose 关闭指定 ID 的 Docker 连接。
// Calls: [Call.ByID]
export function DockerClose(id: string): $CancellablePromise<void> { ... }

// DockerConnect 连接指定 ID 的 Docker 实例。
// Calls: [Call.ByID]
export function DockerConnect(id: string): $CancellablePromise<boolean> { ... }

// DockerControlComposeStack 控制 Compose 项目（start, stop, restart, down, remove）。
// Calls: [Call.ByID]
export function DockerControlComposeStack(id: string, projectName: string, action: string): $CancellablePromise<void> { ... }

// DockerControlContainer 控制容器生命周期（start, stop, restart, pause, unpause, remove）。
// Calls: [Call.ByID]
export function DockerControlContainer(id: string, containerID: string, action: string): $CancellablePromise<void> { ... }

// DockerCreateContainer 创建新容器。
// Calls: [Call.ByID]
export function DockerCreateContainer(id: string, req: docker$0.DockerCreateContainerReq): $CancellablePromise<string> { ... }

// DockerCreateNetwork 创建网络。
// Calls: [Call.ByID]
export function DockerCreateNetwork(id: string, name: string, driver: string): $CancellablePromise<string> { ... }

// DockerCreateVolume 创建数据卷。
// Calls: [Call.ByID]
export function DockerCreateVolume(id: string, name: string, driver: string, labels: { [_ in string]?: string } | null): $CancellablePromise<docker$0.DockerVolumeInfo | null> { ... }

// DockerDeleteComposeRecord 强力联动删除 Compose 记录（同时清理关联容器和网络）。
// Calls: [Call.ByID]
export function DockerDeleteComposeRecord(serverId: string, id: string): $CancellablePromise<void> { ... }

// DockerDeployComposeStack 部署/更新 Compose 项目。
// Calls: [Call.ByID]
export function DockerDeployComposeStack(id: string, req: docker$0.DockerComposeDeployReq): $CancellablePromise<void> { ... }

// DockerExecClose 关闭指定 Docker 容器终端会话。
// Calls: [Call.ByID]
export function DockerExecClose(execId: string): $CancellablePromise<void> { ... }

// DockerExecResize 调整 Docker 容器终端会话行列尺寸。
// Calls: [Call.ByID]
export function DockerExecResize(serverId: string, execId: string, cols: number, rows: number): $CancellablePromise<void> { ... }

// DockerExecStart 启动指定 Docker 容器的交互式终端会话。
// Calls: [Call.ByID]
export function DockerExecStart(serverId: string, containerId: string, command: string, cols: number, rows: number): $CancellablePromise<string> { ... }

// DockerExecWrite 写入数据到指定 Docker 容器终端会话。
// Calls: [Call.ByID]
export function DockerExecWrite(execId: string, data: string): $CancellablePromise<void> { ... }

// DockerGenerateCompose 使用专职 Agent 生成 Docker Compose 配置。
// Calls: [Call.ByID]
export function DockerGenerateCompose(req: $models.DockerGenerateComposeRequest): $CancellablePromise<string> { ... }

// DockerGetComposeRecord 获取特定 Compose 记录详情。
// Calls: [Call.ByID]
export function DockerGetComposeRecord(id: string): $CancellablePromise<core$0.DockerComposeRecord | null> { ... }

// DockerGetComposeStack 获取特定 Compose 项目详情。
// Calls: [Call.ByID]
export function DockerGetComposeStack(id: string, projectName: string): $CancellablePromise<docker$0.DockerComposeStackInfo | null> { ... }

// DockerGetComposeStackLogs 获取 Compose 项目聚合日志。
// Calls: [Call.ByID]
export function DockerGetComposeStackLogs(id: string, projectName: string, tail: number): $CancellablePromise<string> { ... }

// DockerGetContainerLogs 获取容器日志。
// Calls: [Call.ByID]
export function DockerGetContainerLogs(id: string, containerID: string, tail: number, timestamps: boolean): $CancellablePromise<string> { ... }

// DockerGetOverview 获取概览信息。
// Calls: [Call.ByID]
export function DockerGetOverview(id: string): $CancellablePromise<docker$0.DockerOverview | null> { ... }

// DockerInspectContainer 查看容器 Inspect 详情。
// Calls: [Call.ByID]
export function DockerInspectContainer(id: string, containerID: string): $CancellablePromise<string> { ... }

// DockerInspectImage 查看镜像 Inspect 详情。
// Calls: [Call.ByID]
export function DockerInspectImage(id: string, imageID: string): $CancellablePromise<string> { ... }

// DockerListComposeRecords 获取指定 Docker 服务器的本地 Compose 记录。
// Calls: [Call.ByID]
export function DockerListComposeRecords(serverId: string): $CancellablePromise<core$0.DockerComposeRecord[] | null> { ... }

// DockerListComposeStacks 获取所有 Compose 项目。
// Calls: [Call.ByID]
export function DockerListComposeStacks(id: string): $CancellablePromise<docker$0.DockerComposeStackInfo[] | null> { ... }

// DockerListContainers 获取容器列表。
// Calls: [Call.ByID]
export function DockerListContainers(id: string, all: boolean): $CancellablePromise<docker$0.DockerContainerInfo[] | null> { ... }

// DockerListImages 获取镜像列表。
// Calls: [Call.ByID]
export function DockerListImages(id: string): $CancellablePromise<docker$0.DockerImageInfo[] | null> { ... }

// DockerListNetworks 获取网络列表。
// Calls: [Call.ByID]
export function DockerListNetworks(id: string): $CancellablePromise<docker$0.DockerNetworkInfo[] | null> { ... }

// DockerListVolumes 获取数据卷列表。
// Calls: [Call.ByID]
export function DockerListVolumes(id: string): $CancellablePromise<docker$0.DockerVolumeInfo[] | null> { ... }

// DockerLoadImage 弹出选择文件对话框并从本地 tar 包导入镜像。
// Calls: [Call.ByID]
export function DockerLoadImage(id: string): $CancellablePromise<string> { ... }

// DockerPing 检测连接状态。
// Calls: [Call.ByID]
export function DockerPing(id: string): $CancellablePromise<string> { ... }

// DockerPullImage 在线拉取镜像。
// Calls: [Call.ByID]
export function DockerPullImage(id: string, imageName: string): $CancellablePromise<string> { ... }

// DockerRemoveImage 删除镜像。
// Calls: [Call.ByID]
export function DockerRemoveImage(id: string, imageID: string, force: boolean): $CancellablePromise<void> { ... }

// DockerRemoveNetwork 删除网络。
// Calls: [Call.ByID]
export function DockerRemoveNetwork(id: string, networkID: string): $CancellablePromise<void> { ... }

// DockerRemoveVolume 删除数据卷。
// Calls: [Call.ByID]
export function DockerRemoveVolume(id: string, name: string, force: boolean): $CancellablePromise<void> { ... }

// DockerSaveComposeRecord 保存/创建本地 Compose 记录。
// Calls: [Call.ByID]
export function DockerSaveComposeRecord(record: core$0.DockerComposeRecord): $CancellablePromise<core$0.DockerComposeRecord | null> { ... }

// DockerSaveImage 弹出保存文件对话框并将镜像导出保存为本地 tar 压缩包。
// Calls: [Call.ByID]
export function DockerSaveImage(id: string, imageIDOrTag: string, defaultFilename: string): $CancellablePromise<string> { ... }

// DockerSystemPrune 执行系统清理。
// Calls: [Call.ByID]
export function DockerSystemPrune(id: string, pruneContainers: boolean, pruneImages: boolean, pruneVolumes: boolean, pruneNetworks: boolean): $CancellablePromise<docker$0.DockerPruneReport | null> { ... }

// DockerTestConnection 测试指定配置的连通性。
// Calls: [Call.ByID]
export function DockerTestConnection(cfg: core$0.ServerConfig): $CancellablePromise<string> { ... }

// DockerUpComposeStack 执行类似 docker compose up 的智能增量更新，仅在实例创建/启动成功后才同步保存本地 YAML。
// Calls: [Call.ByID]
export function DockerUpComposeStack(serverId: string, record: core$0.DockerComposeRecord, forcePull: boolean, recreate: boolean): $CancellablePromise<core$0.DockerComposeRecord | null> { ... }

// K8sApplyOrchestration 部署并保存 Kubernetes YAML 编排。严格遵循后验强一致性：先部署，成功后再落盘。
// Calls: [Call.ByID]
export function K8sApplyOrchestration(serverId: string, record: core$0.K8sOrchestrationRecord): $CancellablePromise<k8s$0.K8sApplyResult[] | null> { ... }

// K8sApplyYAML 声明式部署并应用 YAML 资源清单。
// Calls: [Call.ByID]
export function K8sApplyYAML(id: string, yamlContent: string): $CancellablePromise<k8s$0.K8sApplyResult[] | null> { ... }

// K8sClose 关闭指定 ID 的 K8s 连接。
// Calls: [Call.ByID]
export function K8sClose(id: string): $CancellablePromise<void> { ... }

// K8sConnect 连接指定 ID 的 K8s 集群。
// Calls: [Call.ByID]
export function K8sConnect(id: string): $CancellablePromise<boolean> { ... }

// K8sCreateNamespace 创建新命名空间。
// Calls: [Call.ByID]
export function K8sCreateNamespace(id: string, name: string): $CancellablePromise<void> { ... }

// K8sDeleteConfigMap 删除指定 ConfigMap。
// Calls: [Call.ByID]
export function K8sDeleteConfigMap(id: string, $namespace: string, name: string): $CancellablePromise<void> { ... }

// K8sDeleteDeployment 删除指定 Deployment。
// Calls: [Call.ByID]
export function K8sDeleteDeployment(id: string, $namespace: string, name: string): $CancellablePromise<void> { ... }

// K8sDeleteIngress 删除指定 Ingress。
// Calls: [Call.ByID]
export function K8sDeleteIngress(id: string, $namespace: string, name: string): $CancellablePromise<void> { ... }

// K8sDeleteNamespace 删除指定命名空间。
// Calls: [Call.ByID]
export function K8sDeleteNamespace(id: string, name: string): $CancellablePromise<void> { ... }

// K8sDeleteOrchestrationRecordOnly 仅删除本地编排记录，不下线集群中的资源。
// Calls: [Call.ByID]
export function K8sDeleteOrchestrationRecordOnly(recordId: string): $CancellablePromise<void> { ... }

// K8sDeletePVC 删除指定 PVC。
// Calls: [Call.ByID]
export function K8sDeletePVC(id: string, $namespace: string, name: string): $CancellablePromise<void> { ... }

// K8sDeletePod 删除指定 Pod。
// Calls: [Call.ByID]
export function K8sDeletePod(id: string, $namespace: string, podName: string): $CancellablePromise<void> { ... }

// K8sDeleteSecret 删除指定 Secret。
// Calls: [Call.ByID]
export function K8sDeleteSecret(id: string, $namespace: string, name: string): $CancellablePromise<void> { ... }

// K8sDeleteService 删除指定 Service。
// Calls: [Call.ByID]
export function K8sDeleteService(id: string, $namespace: string, name: string): $CancellablePromise<void> { ... }

// K8sDeleteYAML 声明式删除并下线 YAML 资源清单中的资源。
// Calls: [Call.ByID]
export function K8sDeleteYAML(id: string, yamlContent: string): $CancellablePromise<k8s$0.K8sDeleteResult[] | null> { ... }

// K8sExecClose 关闭指定终端会话。
// Calls: [Call.ByID]
export function K8sExecClose(execID: string): $CancellablePromise<void> { ... }

// K8sExecResize 调整终端会话尺寸。
// Calls: [Call.ByID]
export function K8sExecResize(execID: string, cols: number, rows: number): $CancellablePromise<void> { ... }

// K8sExecStart 启动指定 Pod 容器的交互式终端会话。
// Calls: [Call.ByID]
export function K8sExecStart(id: string, $namespace: string, podName: string, container: string, command: string, cols: number, rows: number): $CancellablePromise<string> { ... }

// K8sExecWrite 写入数据到指定终端会话。
// Calls: [Call.ByID]
export function K8sExecWrite(execID: string, data: string): $CancellablePromise<void> { ... }

// K8sGenerateYAML 使用专职 Agent 生成 Kubernetes YAML 配置。
// Calls: [Call.ByID]
export function K8sGenerateYAML(req: $models.K8sGenerateYAMLRequest): $CancellablePromise<string> { ... }

// K8sGetOrchestrationRecord 获取单个 K8s 编排记录详情。
// Calls: [Call.ByID]
export function K8sGetOrchestrationRecord(id: string): $CancellablePromise<core$0.K8sOrchestrationRecord | null> { ... }

// K8sGetOverview 获取集群概览。
// Calls: [Call.ByID]
export function K8sGetOverview(id: string): $CancellablePromise<k8s$0.K8sOverview | null> { ... }

// K8sGetPodLogs 获取 Pod 容器日志。
// Calls: [Call.ByID]
export function K8sGetPodLogs(id: string, $namespace: string, podName: string, containerName: string, tail: number, timestamps: boolean): $CancellablePromise<string> { ... }

// K8sGetResourceYAML 获取指定资源的 YAML 文本。
// Calls: [Call.ByID]
export function K8sGetResourceYAML(id: string, kind: string, $namespace: string, name: string): $CancellablePromise<string> { ... }

// K8sListConfigMaps 获取 ConfigMap 列表。
// Calls: [Call.ByID]
export function K8sListConfigMaps(id: string, $namespace: string): $CancellablePromise<k8s$0.K8sConfigMapInfo[] | null> { ... }

// K8sListDeployments 获取 Deployment 列表。
// Calls: [Call.ByID]
export function K8sListDeployments(id: string, $namespace: string): $CancellablePromise<k8s$0.K8sDeploymentInfo[] | null> { ... }

// K8sListIngresses 获取 Ingress 列表。
// Calls: [Call.ByID]
export function K8sListIngresses(id: string, $namespace: string): $CancellablePromise<k8s$0.K8sIngressInfo[] | null> { ... }

// K8sListNamespaces 获取所有命名空间。
// Calls: [Call.ByID]
export function K8sListNamespaces(id: string): $CancellablePromise<k8s$0.K8sNamespaceInfo[] | null> { ... }

// K8sListNodes 获取所有节点。
// Calls: [Call.ByID]
export function K8sListNodes(id: string): $CancellablePromise<k8s$0.K8sNodeInfo[] | null> { ... }

// K8sListOrchestrationRecords 获取指定集群本地持久化存储的 K8s 编排记录。
// Calls: [Call.ByID]
export function K8sListOrchestrationRecords(serverId: string): $CancellablePromise<core$0.K8sOrchestrationRecord[] | null> { ... }

// K8sListPVCs 获取 PVC 列表。
// Calls: [Call.ByID]
export function K8sListPVCs(id: string, $namespace: string): $CancellablePromise<k8s$0.K8sPVCInfo[] | null> { ... }

// K8sListPods 获取指定命名空间（或全量）的 Pod 列表。
// Calls: [Call.ByID]
export function K8sListPods(id: string, $namespace: string): $CancellablePromise<k8s$0.K8sPodInfo[] | null> { ... }

// K8sListSecrets 获取 Secret 列表。
// Calls: [Call.ByID]
export function K8sListSecrets(id: string, $namespace: string): $CancellablePromise<k8s$0.K8sSecretInfo[] | null> { ... }

// K8sListServices 获取 Service 列表。
// Calls: [Call.ByID]
export function K8sListServices(id: string, $namespace: string): $CancellablePromise<k8s$0.K8sServiceInfo[] | null> { ... }

// K8sOfflineOrchestration 下线指定的编排资源，支持同时删除本地记录或标记为已下线。
// Calls: [Call.ByID]
export function K8sOfflineOrchestration(serverId: string, recordId: string, deleteLocalFile: boolean): $CancellablePromise<k8s$0.K8sDeleteResult[] | null> { ... }

// K8sParseKubeconfig 解析 Kubeconfig 文本或文件获取上下文列表。
// Calls: [Call.ByID]
export function K8sParseKubeconfig(kubeconfigData: string, kubeconfigPath: string): $CancellablePromise<k8s$0.KubeconfigContextInfo | null> { ... }

// K8sPing 检测连接状态。
// Calls: [Call.ByID]
export function K8sPing(id: string): $CancellablePromise<string> { ... }

// K8sRestartDeployment 触发 Deployment 滚动重启。
// Calls: [Call.ByID]
export function K8sRestartDeployment(id: string, $namespace: string, name: string): $CancellablePromise<void> { ... }

// K8sScaleDeployment 动态调整 Deployment 副本数。
// Calls: [Call.ByID]
export function K8sScaleDeployment(id: string, $namespace: string, name: string, replicas: number): $CancellablePromise<void> { ... }

// K8sTestConnection 测试指定配置的连通性。
// Calls: [Call.ByID]
export function K8sTestConnection(cfg: core$0.ServerConfig): $CancellablePromise<string> { ... }

// GetMcpServerStatus 获取当前内置 MCP Server 的运行状态指标
// Calls: [Call.ByID]
export function GetMcpServerStatus(): $CancellablePromise<mcp$0.ServerStatus> { ... }

// GetMcpSessions 获取当前已连接的外部 MCP 客户端会话列表
// Calls: [Call.ByID]
export function GetMcpSessions(): $CancellablePromise<mcp$0.SessionInfo[] | null> { ... }

// GetMcpTools 获取已注册且对外暴露的标准 MCP 工具定义列表
// Calls: [Call.ByID]
export function GetMcpTools(): $CancellablePromise<mcp$0.ToolDefinition[] | null> { ... }

// RestartMcpServer 根据当前最新 AppSettings 重启或平滑启停 MCP Server
// Calls: [Call.ByID]
export function RestartMcpServer(): $CancellablePromise<mcp$0.ServerStatus> { ... }

// Calls: [Call.ByID]
export function MongoAggregate(id: string, dbName: string, coll: string, pipelineJSON: string, allowDiskUse: boolean, maxTimeMS: number): $CancellablePromise<mongo$0.MongoFindResult> { ... }

// Calls: [Call.ByID]
export function MongoAggregateExplain(id: string, dbName: string, coll: string, pipelineJSON: string): $CancellablePromise<string> { ... }

// Calls: [Call.ByID]
export function MongoBulkWrite(id: string, dbName: string, coll: string, ops: mongo$0.MongoBulkOp[] | null, ordered: boolean): $CancellablePromise< { ... }

// Calls: [Call.ByID]
export function MongoClientStats(id: string): $CancellablePromise< { ... }

// Calls: [Call.ByID]
export function MongoClose(id: string): $CancellablePromise<void> { ... }

// Calls: [Call.ByID]
export function MongoCollectionStats(id: string, dbName: string, coll: string): $CancellablePromise< { ... }

// Calls: [Call.ByID]
export function MongoCollections(id: string, dbName: string): $CancellablePromise<( { ... }

// Calls: [Call.ByID]
export function MongoConnect(id: string): $CancellablePromise<boolean> { ... }

// Calls: [Call.ByID]
export function MongoCountDocuments(id: string, dbName: string, coll: string, filterJSON: string): $CancellablePromise<number> { ... }

// Calls: [Call.ByID]
export function MongoCreateCollection(id: string, dbName: string, coll: string): $CancellablePromise<void> { ... }

// Calls: [Call.ByID]
export function MongoCreateDatabase(id: string, dbName: string, firstCollection: string): $CancellablePromise<void> { ... }

// Calls: [Call.ByID]
export function MongoCreateIndex(id: string, dbName: string, coll: string, keysJSON: string, name: string, unique: boolean, sparse: boolean, expireAfterSeconds: number): $CancellablePromise<string> { ... }

// Calls: [Call.ByID]
export function MongoCurrentOps(id: string): $CancellablePromise<string[] | null> { ... }

// Calls: [Call.ByID]
export function MongoDatabases(id: string): $CancellablePromise<( { ... }

// Calls: [Call.ByID]
export function MongoDeleteMany(id: string, dbName: string, coll: string, filterJSON: string): $CancellablePromise<number> { ... }

// Calls: [Call.ByID]
export function MongoDeleteOne(id: string, dbName: string, coll: string, filterJSON: string): $CancellablePromise<number> { ... }

// Calls: [Call.ByID]
export function MongoDistinct(id: string, dbName: string, coll: string, field: string, filterJSON: string): $CancellablePromise<string[] | null> { ... }

// Calls: [Call.ByID]
export function MongoDropCollection(id: string, dbName: string, coll: string): $CancellablePromise<void> { ... }

// Calls: [Call.ByID]
export function MongoDropDatabase(id: string, dbName: string): $CancellablePromise<void> { ... }

// Calls: [Call.ByID]
export function MongoDropIndex(id: string, dbName: string, coll: string, name: string): $CancellablePromise<void> { ... }

// Calls: [Call.ByID]
export function MongoExplain(id: string, spec: mongo$0.MongoQuerySpec, verbosity: string): $CancellablePromise<string> { ... }

// Calls: [Call.ByID]
export function MongoFind(id: string, spec: mongo$0.MongoQuerySpec): $CancellablePromise<mongo$0.MongoFindResult> { ... }

// Calls: [Call.ByID]
export function MongoFindOneAndUpdate(id: string, dbName: string, coll: string, filterJSON: string, updateJSON: string, returnNew: boolean): $CancellablePromise<string> { ... }

// Calls: [Call.ByID]
export function MongoGetValidator(id: string, dbName: string, coll: string): $CancellablePromise< { ... }

// Calls: [Call.ByID]
export function MongoHealthCheck(id: string): $CancellablePromise< { ... }

// Calls: [Call.ByID]
export function MongoIndexStats(id: string, dbName: string, coll: string): $CancellablePromise<string[] | null> { ... }

// Calls: [Call.ByID]
export function MongoIndexes(id: string, dbName: string, coll: string): $CancellablePromise<( { ... }

// Calls: [Call.ByID]
export function MongoInferSchema(id: string, dbName: string, coll: string, sampleSize: number): $CancellablePromise<( { ... }

// Calls: [Call.ByID]
export function MongoInsertMany(id: string, dbName: string, coll: string, docsJSON: string, ordered: boolean): $CancellablePromise< { ... }

// Calls: [Call.ByID]
export function MongoInsertOne(id: string, dbName: string, coll: string, docJSON: string): $CancellablePromise<string> { ... }

// Calls: [Call.ByID]
export function MongoParseURI(uri: string): $CancellablePromise<mongo$0.MongoURIInfo> { ... }

// Calls: [Call.ByID]
export function MongoRenameCollection(id: string, dbName: string, coll: string, newName: string): $CancellablePromise<void> { ... }

// Calls: [Call.ByID]
export function MongoReplaceOne(id: string, dbName: string, coll: string, filterJSON: string, docJSON: string, upsert: boolean): $CancellablePromise< { ... }

// Calls: [Call.ByID]
export function MongoRunCommand(id: string, dbName: string, commandJSON: string): $CancellablePromise<string> { ... }

// Calls: [Call.ByID]
export function MongoServerStatus(id: string): $CancellablePromise< { ... }

// Calls: [Call.ByID]
export function MongoSetValidator(id: string, dbName: string, coll: string, validatorJSON: string, level: string, action: string): $CancellablePromise<void> { ... }

// Calls: [Call.ByID]
export function MongoTestConnection(cfg: core$0.ServerConfig): $CancellablePromise< { ... }

// Calls: [Call.ByID]
export function MongoTransaction(id: string, ops: mongo$0.MongoTxOp[] | null): $CancellablePromise< { ... }

// Calls: [Call.ByID]
export function MongoUnwatch(id: string, watchKey: string): $CancellablePromise<void> { ... }

// Calls: [Call.ByID]
export function MongoUpdateMany(id: string, dbName: string, coll: string, filterJSON: string, updateJSON: string, upsert: boolean): $CancellablePromise< { ... }

// Calls: [Call.ByID]
export function MongoUpdateOne(id: string, dbName: string, coll: string, filterJSON: string, updateJSON: string, upsert: boolean): $CancellablePromise< { ... }

// Calls: [Call.ByID]
export function MongoValidateDocument(id: string, dbName: string, coll: string, docJSON: string): $CancellablePromise< { ... }

// Calls: [Call.ByID]
export function MongoWatch(id: string, scope: string, dbName: string, coll: string, pipelineJSON: string, fullDocument: string): $CancellablePromise<string> { ... }

// Calls: [Call.ByID]
export function MongoWatchList(id: string): $CancellablePromise<string[] | null> { ... }

// Calls: [Call.ByID]
export function MqttClose(id: string): $CancellablePromise<void> { ... }

// Calls: [Call.ByID]
export function MqttConnect(id: string): $CancellablePromise<boolean> { ... }

// Calls: [Call.ByID]
export function MqttPublish(id: string, topic: string, payload: string, qos: number, retained: boolean): $CancellablePromise<void> { ... }

// Calls: [Call.ByID]
export function MqttSubscribe(id: string, topic: string, qos: number): $CancellablePromise<void> { ... }

// Calls: [Call.ByID]
export function MqttSubscriptions(id: string): $CancellablePromise<( { ... }

// Calls: [Call.ByID]
export function MqttTestConnection(cfg: core$0.ServerConfig): $CancellablePromise< { ... }

// Calls: [Call.ByID]
export function MqttUnsubscribe(id: string, topic: string): $CancellablePromise<void> { ... }

// Calls: [Call.ByID]
export function MysqlBackup(serverID: string, dbName: string): $CancellablePromise<string> { ... }

// Calls: [Call.ByID]
export function MysqlBackupToFile(serverID: string, dbName: string): $CancellablePromise<string> { ... }

// Calls: [Call.ByID]
export function MysqlChangeUserPassword(serverID: string, user: string, host: string, newPassword: string): $CancellablePromise<void> { ... }

// Calls: [Call.ByID]
export function MysqlClose(serverID: string): $CancellablePromise<void> { ... }

// Calls: [Call.ByID]
export function MysqlConnect(serverID: string): $CancellablePromise<boolean> { ... }

// Calls: [Call.ByID]
export function MysqlCount(serverID: string, dbName: string, table: string): $CancellablePromise<number> { ... }

// Calls: [Call.ByID]
export function MysqlCreateDatabase(serverID: string, name: string, charset: string): $CancellablePromise<void> { ... }

// Calls: [Call.ByID]
export function MysqlCreateIndex(serverID: string, dbName: string, table: string, name: string, colsCSV: string, unique: boolean): $CancellablePromise<void> { ... }

// Calls: [Call.ByID]
export function MysqlCreateTable(serverID: string, dbName: string, table: string, defs: string): $CancellablePromise<void> { ... }

// Calls: [Call.ByID]
export function MysqlCreateUser(serverID: string, user: string, host: string, password: string, authPlugin: string, lock: boolean): $CancellablePromise<void> { ... }

// Calls: [Call.ByID]
export function MysqlDatabases(serverID: string): $CancellablePromise<string[] | null> { ... }

// Calls: [Call.ByID]
export function MysqlDelete(serverID: string, dbName: string, table: string, whereCols: string[] | null, whereVals: any[] | null): $CancellablePromise<number> { ... }

// Calls: [Call.ByID]
export function MysqlDescribe(serverID: string, dbName: string, table: string): $CancellablePromise<db$0.MysqlQueryResult> { ... }

// Calls: [Call.ByID]
export function MysqlDropDatabase(serverID: string, name: string): $CancellablePromise<void> { ... }

// Calls: [Call.ByID]
export function MysqlDropIndex(serverID: string, dbName: string, table: string, name: string): $CancellablePromise<void> { ... }

// Calls: [Call.ByID]
export function MysqlDropTable(serverID: string, dbName: string, table: string): $CancellablePromise<void> { ... }

// Calls: [Call.ByID]
export function MysqlDropUser(serverID: string, user: string, host: string): $CancellablePromise<void> { ... }

// Calls: [Call.ByID]
export function MysqlExport(serverID: string, dbName: string, mode: string, source: string, table: string, sqlText: string, limit: number): $CancellablePromise<string> { ... }

// Calls: [Call.ByID]
export function MysqlExportJSON(serverID: string, dbName: string, source: string, table: string, sqlText: string, limit: number): $CancellablePromise<string> { ... }

// Calls: [Call.ByID]
export function MysqlExportToFile(serverID: string, dbName: string, mode: string, source: string, table: string, sqlText: string, limit: number): $CancellablePromise<string> { ... }

// Calls: [Call.ByID]
export function MysqlGrantPrivileges(serverID: string, user: string, host: string, dbName: string, table: string, privs: string[] | null, withGrantOption: boolean): $CancellablePromise<void> { ... }

// Calls: [Call.ByID]
export function MysqlGrants(serverID: string, user: string, host: string): $CancellablePromise<string> { ... }

// Calls: [Call.ByID]
export function MysqlImport(serverID: string, dbName: string, mode: string, table: string, content: string): $CancellablePromise<string> { ... }

// Calls: [Call.ByID]
export function MysqlImportFromFile(serverID: string, dbName: string, mode: string, table: string): $CancellablePromise<string> { ... }

// Calls: [Call.ByID]
export function MysqlImportJSON(serverID: string, dbName: string, table: string, content: string): $CancellablePromise<string> { ... }

// Calls: [Call.ByID]
export function MysqlIndexes(serverID: string, dbName: string, table: string): $CancellablePromise<( { ... }

// Calls: [Call.ByID]
export function MysqlInsert(serverID: string, dbName: string, table: string, columns: string[] | null, values: any[] | null): $CancellablePromise<number> { ... }

// Calls: [Call.ByID]
export function MysqlProcessList(serverID: string): $CancellablePromise<( { ... }

// Calls: [Call.ByID]
export function MysqlQueryCSV(serverID: string, dbName: string, sqlText: string, limit: number): $CancellablePromise<string> { ... }

// Calls: [Call.ByID]
export function MysqlRevokeAllPrivileges(serverID: string, user: string, host: string): $CancellablePromise<void> { ... }

// Calls: [Call.ByID]
export function MysqlRevokePrivileges(serverID: string, user: string, host: string, dbName: string, table: string, privs: string[] | null): $CancellablePromise<void> { ... }

// Calls: [Call.ByID]
export function MysqlRun(serverID: string, dbName: string, sqlText: string): $CancellablePromise<db$0.MysqlQueryResult> { ... }

// Calls: [Call.ByID]
export function MysqlSchema(serverID: string, dbName: string): $CancellablePromise< { ... }

// Calls: [Call.ByID]
export function MysqlSelect(serverID: string, dbName: string, table: string, limit: number, offset: number): $CancellablePromise<db$0.MysqlQueryResult> { ... }

// Calls: [Call.ByID]
export function MysqlSlowLog(serverID: string, limit: number): $CancellablePromise<( { ... }

// Calls: [Call.ByID]
export function MysqlStatus(serverID: string): $CancellablePromise< { ... }

// Calls: [Call.ByID]
export function MysqlTableStatus(serverID: string, dbName: string): $CancellablePromise<( { ... }

// Calls: [Call.ByID]
export function MysqlTables(serverID: string, dbName: string): $CancellablePromise<string[] | null> { ... }

// Calls: [Call.ByID]
export function MysqlTestConnection(cfg: core$0.ServerConfig): $CancellablePromise< { ... }

// Calls: [Call.ByID]
export function MysqlToggleUserLock(serverID: string, user: string, host: string, lock: boolean): $CancellablePromise<void> { ... }

// Calls: [Call.ByID]
export function MysqlTruncateTable(serverID: string, dbName: string, table: string): $CancellablePromise<void> { ... }

// Calls: [Call.ByID]
export function MysqlUpdate(serverID: string, dbName: string, table: string, setCols: string[] | null, setVals: any[] | null, whereCols: string[] | null, whereVals: any[] | null): $CancellablePromise<number> { ... }

// Calls: [Call.ByID]
export function MysqlUsers(serverID: string): $CancellablePromise<( { ... }

// Calls: [Call.ByID]
export function MysqlVariables(serverID: string): $CancellablePromise< { ... }

// Calls: [Call.ByID]
export function PostgresClose(serverID: string): $CancellablePromise<void> { ... }

// Calls: [Call.ByID]
export function PostgresConnect(serverID: string): $CancellablePromise<boolean> { ... }

// Calls: [Call.ByID]
export function PostgresCount(serverID: string, dbName: string, schema: string, table: string, whereClause: string): $CancellablePromise<number> { ... }

// Calls: [Call.ByID]
export function PostgresCreateDatabase(serverID: string, name: string, owner: string, encoding: string, template: string): $CancellablePromise<void> { ... }

// Calls: [Call.ByID]
export function PostgresCreateRole(serverID: string, roleName: string, password: string, $super: boolean, canLogin: boolean, createDB: boolean, createRole: boolean, connLimit: number): $CancellablePromise<void> { ... }

// Calls: [Call.ByID]
export function PostgresCreateSchema(serverID: string, dbName: string, schema: string, owner: string): $CancellablePromise<void> { ... }

// Calls: [Call.ByID]
export function PostgresCreateTable(serverID: string, dbName: string, schema: string, table: string, defs: string): $CancellablePromise<void> { ... }

// Calls: [Call.ByID]
export function PostgresDatabases(serverID: string): $CancellablePromise<db$0.PgDatabase[] | null> { ... }

// Calls: [Call.ByID]
export function PostgresDelete(serverID: string, dbName: string, schema: string, table: string, whereCols: string[] | null, whereVals: any[] | null): $CancellablePromise<number> { ... }

// Calls: [Call.ByID]
export function PostgresDescribe(serverID: string, dbName: string, schema: string, table: string): $CancellablePromise< { ... }

// Calls: [Call.ByID]
export function PostgresDropDatabase(serverID: string, name: string): $CancellablePromise<void> { ... }

// Calls: [Call.ByID]
export function PostgresDropRole(serverID: string, roleName: string): $CancellablePromise<void> { ... }

// Calls: [Call.ByID]
export function PostgresDropSchema(serverID: string, dbName: string, schema: string, cascade: boolean): $CancellablePromise<void> { ... }

// Calls: [Call.ByID]
export function PostgresDropTable(serverID: string, dbName: string, schema: string, table: string, cascade: boolean): $CancellablePromise<void> { ... }

// Calls: [Call.ByID]
export function PostgresExplain(serverID: string, dbName: string, sqlText: string, analyze: boolean, buffers: boolean, verbose: boolean): $CancellablePromise<string> { ... }

// Calls: [Call.ByID]
export function PostgresExport(serverID: string, dbName: string, schema: string, mode: string, source: string, table: string, sqlText: string, limit: number): $CancellablePromise<string> { ... }

// Calls: [Call.ByID]
export function PostgresExportToFile(serverID: string, dbName: string, schema: string, mode: string, source: string, table: string, sqlText: string, limit: number): $CancellablePromise<string> { ... }

// Calls: [Call.ByID]
export function PostgresFunctions(serverID: string, dbName: string, schema: string): $CancellablePromise<db$0.PgFunction[] | null> { ... }

// Calls: [Call.ByID]
export function PostgresGrantPrivileges(serverID: string, dbName: string, roleName: string, schema: string, table: string, privileges: string, isGrant: boolean): $CancellablePromise<void> { ... }

// Calls: [Call.ByID]
export function PostgresImport(serverID: string, dbName: string, schema: string, mode: string, table: string, content: string): $CancellablePromise<string> { ... }

// Calls: [Call.ByID]
export function PostgresImportFromFile(serverID: string, dbName: string, schema: string, mode: string, table: string): $CancellablePromise<string> { ... }

// Calls: [Call.ByID]
export function PostgresInsert(serverID: string, dbName: string, schema: string, table: string, columns: string[] | null, values: any[] | null): $CancellablePromise<number> { ... }

// Calls: [Call.ByID]
export function PostgresKillSession(serverID: string, dbName: string, pid: number, terminate: boolean): $CancellablePromise<boolean> { ... }

// Calls: [Call.ByID]
export function PostgresRoles(serverID: string): $CancellablePromise<db$0.PgRole[] | null> { ... }

// Calls: [Call.ByID]
export function PostgresRun(serverID: string, dbName: string, sqlText: string): $CancellablePromise<db$0.PostgresQueryResult> { ... }

// Calls: [Call.ByID]
export function PostgresSchemas(serverID: string, dbName: string): $CancellablePromise<db$0.PgSchema[] | null> { ... }

// Calls: [Call.ByID]
export function PostgresSelect(serverID: string, dbName: string, schema: string, table: string, limit: number, offset: number, sortCol: string, sortOrder: string, whereClause: string): $CancellablePromise<db$0.PostgresQueryResult> { ... }

// Calls: [Call.ByID]
export function PostgresSequences(serverID: string, dbName: string, schema: string): $CancellablePromise<db$0.PgSequence[] | null> { ... }

// Calls: [Call.ByID]
export function PostgresSessions(serverID: string, dbName: string): $CancellablePromise<db$0.PgSession[] | null> { ... }

// Calls: [Call.ByID]
export function PostgresStatus(serverID: string, dbName: string): $CancellablePromise<db$0.PgStatus> { ... }

// Calls: [Call.ByID]
export function PostgresTableDDL(serverID: string, dbName: string, schema: string, table: string): $CancellablePromise<string> { ... }

// Calls: [Call.ByID]
export function PostgresTables(serverID: string, dbName: string, schema: string): $CancellablePromise<db$0.PgTable[] | null> { ... }

// Calls: [Call.ByID]
export function PostgresTestConnection(cfg: core$0.ServerConfig): $CancellablePromise< { ... }

// Calls: [Call.ByID]
export function PostgresTruncateTable(serverID: string, dbName: string, schema: string, table: string, restartIdentity: boolean, cascade: boolean): $CancellablePromise<void> { ... }

// Calls: [Call.ByID]
export function PostgresUpdate(serverID: string, dbName: string, schema: string, table: string, setCols: string[] | null, setVals: any[] | null, whereCols: string[] | null, whereVals: any[] | null): $CancellablePromise<number> { ... }

// Calls: [Call.ByID]
export function PostgresUpdateRolePassword(serverID: string, roleName: string, newPassword: string): $CancellablePromise<void> { ... }

// Calls: [Call.ByID]
export function RedisClose(id: string): $CancellablePromise<void> { ... }

// Calls: [Call.ByID]
export function RedisConnect(id: string): $CancellablePromise<boolean> { ... }

// Calls: [Call.ByID]
export function RedisDBSize(id: string): $CancellablePromise<number> { ... }

// Calls: [Call.ByID]
export function RedisDelete(id: string, key: string): $CancellablePromise<void> { ... }

// Calls: [Call.ByID]
export function RedisExpire(id: string, key: string, ttl: number): $CancellablePromise<void> { ... }

// Calls: [Call.ByID]
export function RedisGet(id: string, key: string): $CancellablePromise<redis$0.RedisValue> { ... }

// Calls: [Call.ByID]
export function RedisHashFieldDel(id: string, key: string, fields: string[] | null): $CancellablePromise<number> { ... }

// Calls: [Call.ByID]
export function RedisHashFieldGet(id: string, key: string, field: string): $CancellablePromise<string> { ... }

// Calls: [Call.ByID]
export function RedisHashFieldSet(id: string, key: string, field: string, value: string): $CancellablePromise<void> { ... }

// Calls: [Call.ByID]
export function RedisInfo(id: string, section: string): $CancellablePromise<string> { ... }

// Calls: [Call.ByID]
export function RedisKeys(id: string, pattern: string, cursor: string): $CancellablePromise<redis$0.RedisKeysResult> { ... }

// Calls: [Call.ByID]
export function RedisKeyspaceNotify(id: string, db: number, event: string): $CancellablePromise<void> { ... }

// Calls: [Call.ByID]
export function RedisListPop(id: string, key: string, left: boolean): $CancellablePromise<string> { ... }

// Calls: [Call.ByID]
export function RedisListPush(id: string, key: string, value: string, left: boolean): $CancellablePromise<number> { ... }

// Calls: [Call.ByID]
export function RedisModeInfo(id: string): $CancellablePromise< { ... }

// Calls: [Call.ByID]
export function RedisMonitor(id: string): $CancellablePromise<redis$0.RedisMonitorInfo | null> { ... }

// Calls: [Call.ByID]
export function RedisPSubscribe(id: string, pattern: string): $CancellablePromise<void> { ... }

// Calls: [Call.ByID]
export function RedisPipeline(id: string, commands: string[] | null): $CancellablePromise<redis$0.RedisPipelineResult> { ... }

// Calls: [Call.ByID]
export function RedisPublish(id: string, channel: string, message: string): $CancellablePromise<number> { ... }

// Calls: [Call.ByID]
export function RedisQueueDequeue(id: string, queue: string, mode: string, timeout: number): $CancellablePromise<redis$0.RedisQueueItem | null> { ... }

// Calls: [Call.ByID]
export function RedisQueueEnqueue(id: string, queue: string, payload: string, mode: string): $CancellablePromise<string> { ... }

// Calls: [Call.ByID]
export function RedisQueueLength(id: string, queue: string, mode: string): $CancellablePromise<number> { ... }

// Calls: [Call.ByID]
export function RedisRaw(id: string, cmd: string): $CancellablePromise< { ... }

// Calls: [Call.ByID]
export function RedisRenameKey(id: string, oldKey: string, newKey: string): $CancellablePromise<void> { ... }

// Calls: [Call.ByID]
export function RedisSelectDB(id: string, db: number): $CancellablePromise<void> { ... }

// Calls: [Call.ByID]
export function RedisSet(id: string, key: string, typ: string, val: string, ttl: number): $CancellablePromise<void> { ... }

// Calls: [Call.ByID]
export function RedisSetAdd(id: string, key: string, members: string[] | null): $CancellablePromise<number> { ... }

// Calls: [Call.ByID]
export function RedisSetRem(id: string, key: string, members: string[] | null): $CancellablePromise<number> { ... }

// Calls: [Call.ByID]
export function RedisSlowLog(id: string, count: number): $CancellablePromise<redis$0.RedisSlowLogEntry[] | null> { ... }

// Calls: [Call.ByID]
export function RedisStringAppend(id: string, key: string, value: string): $CancellablePromise<number> { ... }

// Calls: [Call.ByID]
export function RedisSubscribe(id: string, channel: string): $CancellablePromise<void> { ... }

// Calls: [Call.ByID]
export function RedisSubscriptions(id: string): $CancellablePromise<string[] | null> { ... }

// Calls: [Call.ByID]
export function RedisTestConnection(cfg: core$0.ServerConfig): $CancellablePromise< { ... }

// Calls: [Call.ByID]
export function RedisTransaction(id: string, watch: string[] | null, commands: string[] | null): $CancellablePromise<redis$0.RedisTransactionResult> { ... }

// Calls: [Call.ByID]
export function RedisUnsubscribe(id: string, channel: string): $CancellablePromise<void> { ... }

// Calls: [Call.ByID]
export function RedisZSetAdd(id: string, key: string, member: string, score: number): $CancellablePromise<number> { ... }

// Calls: [Call.ByID]
export function RedisZSetRem(id: string, key: string, members: string[] | null): $CancellablePromise<number> { ... }

// Calls: [Call.ByID]
export function CancelTransfer(id: string): $CancellablePromise<void> { ... }

// Calls: [Call.ByID]
export function ChooseLocalFiles(): $CancellablePromise<string[] | null> { ... }

// Calls: [Call.ByID]
export function ChooseLocalFolder(): $CancellablePromise<string> { ... }

// Calls: [Call.ByID]
export function ClearFinishedTransfers(): $CancellablePromise<void> { ... }

// Calls: [Call.ByID]
export function DownloadPaths(sessionID: string, remotePaths: string[] | null): $CancellablePromise<void> { ... }

// Calls: [Call.ByID]
export function DownloadTo(sessionID: string, remotePaths: string[] | null, localDir: string): $CancellablePromise<void> { ... }

// Calls: [Call.ByID]
export function HomeDir(sessionID: string): $CancellablePromise<string> { ... }

// Calls: [Call.ByID]
export function ListDir(sessionID: string, dir: string): $CancellablePromise<ssh$0.DirListing> { ... }

// Calls: [Call.ByID]
export function ListTransfers(): $CancellablePromise<ssh$0.Transfer[] | null> { ... }

// Calls: [Call.ByID]
export function MakeDir(sessionID: string, parent: string, name: string): $CancellablePromise<void> { ... }

// Calls: [Call.ByID]
export function ReadLocalFile(filePath: string): $CancellablePromise<string> { ... }

// Calls: [Call.ByID]
export function ReadLocalFileBase64(filePath: string): $CancellablePromise<string> { ... }

// Calls: [Call.ByID]
export function ReadRemoteFile(sessionID: string, remotePath: string): $CancellablePromise<string> { ... }

// Calls: [Call.ByID]
export function RemovePath(sessionID: string, target: string): $CancellablePromise<void> { ... }

// Calls: [Call.ByID]
export function RemovePaths(sessionID: string, targets: string[] | null): $CancellablePromise<void> { ... }

// Calls: [Call.ByID]
export function RenamePath(sessionID: string, target: string, newName: string): $CancellablePromise<void> { ... }

// Calls: [Call.ByID]
export function SaveMysqlFile(defaultName: string): $CancellablePromise<string> { ... }

// Calls: [Call.ByID]
export function UploadData(sessionID: string, remoteDir: string, name: string, base64Data: string): $CancellablePromise<void> { ... }

// Calls: [Call.ByID]
export function UploadPaths(sessionID: string, remoteDir: string, localPaths: string[] | null): $CancellablePromise<void> { ... }

// Calls: [Call.ByID]
export function WriteLocalFile(filePath: string, content: string): $CancellablePromise<void> { ... }

// Calls: [Call.ByID]
export function WriteRemoteFile(sessionID: string, remotePath: string, content: string): $CancellablePromise<void> { ... }

// Calls: [Call.ByID]
export function SqliteClose(id: string): $CancellablePromise<void> { ... }

// Calls: [Call.ByID]
export function SqliteConnect(id: string, filePath: string): $CancellablePromise<boolean> { ... }

// Calls: [Call.ByID]
export function SqliteCount(id: string, table: string): $CancellablePromise<number> { ... }

// Calls: [Call.ByID]
export function SqliteDescribe(id: string, table: string): $CancellablePromise<( { ... }

// Calls: [Call.ByID]
export function SqliteIndexes(id: string, table: string): $CancellablePromise<( { ... }

// Calls: [Call.ByID]
export function SqliteInfo(id: string): $CancellablePromise< { ... }

// Calls: [Call.ByID]
export function SqliteOpenFile(): $CancellablePromise<string> { ... }

// Calls: [Call.ByID]
export function SqliteRun(id: string, sqlText: string): $CancellablePromise< { ... }

// Calls: [Call.ByID]
export function SqliteSchema(id: string): $CancellablePromise< { ... }

// Calls: [Call.ByID]
export function SqliteSelect(id: string, table: string, limit: number, offset: number): $CancellablePromise< { ... }

// Calls: [Call.ByID]
export function SqliteTables(id: string): $CancellablePromise<( { ... }

// Calls: [Call.ByID]
export function Connect(serverID: string, cols: number, rows: number): $CancellablePromise<ssh$0.SessionInfo> { ... }

// Calls: [Call.ByID]
export function ConnectWithConfig(cfg: core$0.ServerConfig, cols: number, rows: number): $CancellablePromise<ssh$0.SessionInfo> { ... }

// Calls: [Call.ByID]
export function Disconnect(sessionID: string): $CancellablePromise<void> { ... }

// Calls: [Call.ByID]
export function ListSessions(): $CancellablePromise<ssh$0.SessionInfo[] | null> { ... }

// Calls: [Call.ByID]
export function ResizeTerminal(sessionID: string, cols: number, rows: number): $CancellablePromise<void> { ... }

// Calls: [Call.ByID]
export function SSHControlService(sessionID: string, serviceName: string, action: string): $CancellablePromise<void> { ... }

// Calls: [Call.ByID]
export function SSHCronList(sessionID: string): $CancellablePromise<ssh$0.SSHCronItem[] | null> { ... }

// Calls: [Call.ByID]
export function SSHDashboardStats(sessionID: string): $CancellablePromise<ssh$0.SSHDashboardInfo | null> { ... }

// Calls: [Call.ByID]
export function SSHKillProcess(sessionID: string, pid: number): $CancellablePromise<void> { ... }

// Calls: [Call.ByID]
export function SSHProcessList(sessionID: string): $CancellablePromise<ssh$0.SSHProcessInfo[] | null> { ... }

// Calls: [Call.ByID]
export function SSHRunCronCommand(sessionID: string, command: string): $CancellablePromise<string> { ... }

// Calls: [Call.ByID]
export function SSHSaveCronList(sessionID: string, items: ssh$0.SSHCronItem[] | null): $CancellablePromise<void> { ... }

// Calls: [Call.ByID]
export function SSHServiceList(sessionID: string): $CancellablePromise<ssh$0.SSHServiceInfo[] | null> { ... }

// Calls: [Call.ByID]
export function SSHServiceLogs(sessionID: string, serviceName: string): $CancellablePromise<string> { ... }

// Calls: [Call.ByID]
export function SendInput(sessionID: string, data: string): $CancellablePromise<void> { ... }

// SshTestConnection 测试指定配置的 SSH 服务器连通性。
// Calls: [Call.ByID]
export function SshTestConnection(cfg: core$0.ServerConfig): $CancellablePromise< { ... }

// Calls: [Call.ByID]
export function TerminalAttach(sessionID: string, cols: number, rows: number): $CancellablePromise<void> { ... }

// Calls: [Call.ByID]
export function CheckForUpdates(): $CancellablePromise<core$0.UpdateCheckResult> { ... }

// Calls: [Call.ByID]
export function DeleteGroup(id: string): $CancellablePromise<void> { ... }

// Calls: [Call.ByID]
export function DeleteServer(id: string): $CancellablePromise<void> { ... }

// ExportServersConfig 弹出原生保存对话框并导出所有服务器连接与分组配置
// Calls: [Call.ByID]
export function ExportServersConfig(): $CancellablePromise<$models.ConfigIOResult | null> { ... }

// Calls: [Call.ByID]
export function GetAppSettings(): $CancellablePromise<core$0.AppSettings> { ... }

// Calls: [Call.ByID]
export function GetAppVersion(): $CancellablePromise<core$0.AppVersionInfo> { ... }

// Calls: [Call.ByID]
export function HideWindow(): $CancellablePromise<void> { ... }

// ImportServersConfig 弹出原生选择对话框并增量智能合并导入服务器连接与分组配置
// Calls: [Call.ByID]
export function ImportServersConfig(): $CancellablePromise<$models.ConfigIOResult | null> { ... }

// Calls: [Call.ByID]
export function ListGroups(): $CancellablePromise<core$0.ServerGroup[] | null> { ... }

// Calls: [Call.ByID]
export function ListServers(): $CancellablePromise<core$0.ServerConfig[] | null> { ... }

// Calls: [Call.ByID]
export function MoveServerToGroup(serverID: string, groupID: string): $CancellablePromise<void> { ... }

// Calls: [Call.ByID]
export function OpenBrowser(targetURL: string): $CancellablePromise<void> { ... }

// Calls: [Call.ByID]
export function QuitApp(): $CancellablePromise<void> { ... }

// Calls: [Call.ByID]
export function SaveAppSettings(settings: core$0.AppSettings): $CancellablePromise<core$0.AppSettings> { ... }

// Calls: [Call.ByID]
export function SaveGroup(g: core$0.ServerGroup): $CancellablePromise<core$0.ServerGroup> { ... }

// Calls: [Call.ByID]
export function SaveServer(cfg: core$0.ServerConfig): $CancellablePromise<core$0.ServerConfig> { ... }

// Calls: [Call.ByID]
export function SelectCertFile(): $CancellablePromise<string> { ... }

// Calls: [Call.ByID]
export function SelectLocalSqliteFile(): $CancellablePromise<string> { ... }

// Calls: [Call.ByID]
export function SelectPrivateKey(): $CancellablePromise<string> { ... }

// CompileSessionToWiki 调用大模型提炼会话中的关键资产，并自动合并更新到 Wiki
// Calls: [Call.ByID]
export function CompileSessionToWiki(sessionID: string, messages: agent$0.FrontendMessage[] | null): $CancellablePromise<string> { ... }

// CreateWikiNode 创建文档或分组
// Calls: [Call.ByID]
export function CreateWikiNode(parentPath: string, name: string, isFolder: boolean): $CancellablePromise<string> { ... }

// DeleteWikiNode 删除文档或分组
// Calls: [Call.ByID]
export function DeleteWikiNode(relPath: string): $CancellablePromise<void> { ... }

// GetWikiCatalog 获取知识库紧凑目录与摘要
// Calls: [Call.ByID]
export function GetWikiCatalog(): $CancellablePromise<wiki$0.WikiCatalogItem[] | null> { ... }

// GetWikiDir 获取本地 Wiki 根目录
// Calls: [Call.ByID]
export function GetWikiDir(): $CancellablePromise<string> { ... }

// ListWikiTree 列出知识库文档树
// Calls: [Call.ByID]
export function ListWikiTree(): $CancellablePromise<wiki$0.WikiNode[] | null> { ... }

// OpenWikiDir 打开本地系统文件浏览器
// Calls: [Call.ByID]
export function OpenWikiDir(): $CancellablePromise<void> { ... }

// ReadWikiPage 读取指定相对路径的 Markdown 内容
// Calls: [Call.ByID]
export function ReadWikiPage(relPath: string): $CancellablePromise<string> { ... }

// RenameWikiNode 重命名或移动文档/分组
// Calls: [Call.ByID]
export function RenameWikiNode(oldRelPath: string, newRelPath: string): $CancellablePromise<void> { ... }

// SaveWikiPage 保存 Markdown 页面
// Calls: [Call.ByID]
export function SaveWikiPage(relPath: string, content: string): $CancellablePromise<void> { ... }

```

---

### TypeScript Module `ssh` (`frontend/bindings/terminal/ssh`)

```typescript
// Cynhyrchwyd y ffeil hon yn awtomatig. PEIDIWCH Â MODIWL
// This file is automatically generated. DO NOT EDIT
// DirListing 是一次目录读取的结果。
export interface DirListing {
	...
}

// FileItem 是远程目录中的一个条目。
export interface FileItem {
	...
}

export interface SSHCPUInfo {
	...
}

export interface SSHCronItem {
	...
}

export interface SSHDashboardInfo {
	...
}

export interface SSHDiskInfo {
	...
}

export interface SSHMemInfo {
	...
}

export interface SSHNetInfo {
	...
}

export interface SSHProcessInfo {
	...
}

export interface SSHServiceInfo {
	...
}

// SessionInfo 是暴露给前端的会话摘要。
export interface SessionInfo {
	...
}

// Transfer 描述一个上传/下载任务。
export interface Transfer {
	...
}

```

---

### TypeScript Module `src` (`frontend/src`)

- **Imports (40):** `../bindings/terminal/services/agentservice`, `../bindings/terminal/services/apiservice`, `../bindings/terminal/services/dockerservice`, `../bindings/terminal/services/k8sservice`, `../bindings/terminal/services/mcpservice`, `../bindings/terminal/services/mongoservice`, `../bindings/terminal/services/mqttservice`, `../bindings/terminal/services/mysqlservice`, `../bindings/terminal/services/postgresservice`, `../bindings/terminal/services/redisservice`, `../bindings/terminal/services/sftpservice`, `../bindings/terminal/services/sqliteservice`, `../bindings/terminal/services/sshservice`, `../bindings/terminal/services/systemservice`, `../bindings/terminal/services/wikiservice`, `./App`, `./styles/global.css`, `./theme`, `@/api`, `@/components/App.module.less`, `@/components/CloseConfirmModal`, `@/components/Modal`, `@/components/ServerDialog`, `@/components/Sidebar`, `@/components/TitleBar`, `@/components/app/AiSidebar`, `@/components/app/SessionTabs`, `@/components/app/Stage`, `@/contexts/SessionContext`, `@/contexts/ThemeContext`, `@/pages/setting/SettingsModal`, `@/utils`, `@/utils/theme`, `@/utils/updater`, `@wailsio/runtime`, `@xterm/xterm`, `antd`, `antd/locale/zh_CN`, `react`, `react-dom/client`

```typescript
export interface AppContentProps {
	...
}

export interface ActiveConnectionInfo {
	...
}

export interface ServerGroup {
	...
}

export interface ServerConfig {
	...
}

export interface SessionInfo {
	...
}

export interface FileItem {
	...
}

export interface DirListing {
	...
}

export interface Transfer {
	...
}

export interface DockerSessionInfo {
	...
}

export interface K8sSessionInfo {
	...
}

export interface RedisKeyItem {
	...
}

export interface RedisKeysResult {
	...
}

export interface RedisValue {
	...
}

export interface RedisSessionInfo {
	...
}

export interface RedisConfig {
	...
}

export interface RedisCmdResult {
	...
}

export interface RedisPipelineResult {
	...
}

export interface RedisTransactionResult {
	...
}

export interface RedisPubsubMessage {
	...
}

export interface RedisKeyspaceMessage {
	...
}

export interface RedisMonitorInfo {
	...
}

export interface RedisSlowLogEntry {
	...
}

export interface RedisQueueItem {
	...
}

export interface MysqlSessionInfo {
	...
}

export interface PostgresSessionInfo {
	...
}

export interface MqttSessionInfo {
	...
}

export interface MqttMessage {
	...
}

export interface MqttSubscription {
	...
}

export interface ApiHeader {
	...
}

export interface ApiAuth {
	...
}

export interface ApiRequest {
	...
}

export interface ApiResponse {
	...
}

export interface SavedApiItem {
	...
}

export interface ApiFolderNode {
	...
}

export interface WsConnectResult {
	...
}

export interface WsMessage {
	...
}

export interface MysqlQueryResult {
	...
}

export interface MysqlIndexInfo {
	...
}

export interface MysqlUserInfo {
	...
}

export interface MysqlSchemaTable {
	...
}

export interface MysqlForeignKey {
	...
}

export interface MysqlSchema {
	...
}

export interface MongoSessionInfo {
	...
}

// 连接字符串解析结果
export interface MongoURIInfo {
	...
}

// 健康检查 / 探活
export interface MongoHealthInfo {
	...
}

// 数据库 / 集合条目
export interface MongoDatabaseInfo {
	...
}

export interface MongoCollectionInfo {
	...
}

export interface MongoCollectionStats {
	...
}

// 查询构建器
export interface MongoQuerySpec {
	...
}

export interface MongoFindResult {
	...
}

// 数据模型映射（Schema 推断）
export interface MongoFieldInfo {
	...
}

// Schema 验证
export interface MongoValidatorInfo {
	...
}

export interface MongoValidationResult {
	...
}

// 索引
export interface MongoIndexInfo {
	...
}

// 聚合 / 命令
export interface MongoAggregateResult {
	...
}

// 批量写
export interface MongoBulkOp {
	...
}

export interface MongoBulkResult {
	...
}

// 事务
export interface MongoTxOp {
	...
}

export interface MongoTxResult {
	...
}

// 性能监控
export interface MongoServerStatus {
	...
}

// 变更流事件
export interface MongoChangeEvent {
	...
}

export interface SqliteSessionInfo {
	...
}

// 表/视图条目
export interface SqliteTableInfo {
	...
}

// 列结构
export interface SqliteColumnInfo {
	...
}

// 索引信息
export interface SqliteIndexInfo {
	...
}

export interface SqliteQueryResult {
	...
}

export interface SqliteInfo {
	...
}

export interface SqliteSchemaTable {
	...
}

export interface SqliteForeignKey {
	...
}

export interface SqliteSchema {
	...
}

export interface SSHDiskInfo {
	...
}

export interface SSHCPUInfo {
	...
}

export interface SSHMemInfo {
	...
}

export interface SSHNetInfo {
	...
}

export interface SSHDashboardInfo {
	...
}

export interface SSHProcessInfo {
	...
}

export interface SSHServiceInfo {
	...
}

export interface SSHCronItem {
	...
}

export interface AiModelItem {
	...
}

export interface AppSettings {
	...
}

export interface McpServerStatus {
	...
}

export interface McpSessionInfo {
	...
}

export interface McpToolItem {
	...
}

export interface ToolCallItem {
	...
}

export interface ProcessStep {
	...
}

export interface FrontendMessage {
	...
}

export interface AiMessage {
	...
}

// ===================== xAgent 2.0 Workbench Types =====================
export interface AgentSessionItem {
	...
}

export interface AgentSkillItem {
	...
}

export interface AgentPlanStep {
	...
}

export interface AgentPlan {
	...
}

export interface AgentApprovalRequest {
	...
}

export interface AgentAskRequest {
	...
}

export interface AgentHitlConfirmRequest {
	...
}

export interface KubeconfigContextInfo {
	...
}

export interface K8sApplyResult {
	...
}

export interface K8sResourceItemSummary {
	...
}

export interface K8sOrchestrationRecord {
	...
}

export interface K8sDeleteResult {
	...
}

export interface AppVersionInfo {
	...
}

export interface UpdateCheckResult {
	...
}

export interface WikiCatalogItem {
	...
}

export interface WikiNode {
	...
}

export interface ConfigIOResult {
	...
}

export type AnyFn = (...args: any[]) => void;

export type AuthType = 'password' | 'key';

export type ConnType = (typeof CONN_TYPES)[number];

export type TransferStatus = 'running' | 'done' | 'error' | 'canceled';

export type RedisValueType = 'string' | 'list' | 'set' | 'hash' | 'zset' | 'stream';

export type RedisMode = 'single' | 'sentinel' | 'cluster';

export type RedisSerialization = 'none' | 'json';

export type ApiMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

export type ApiTreeNode = ApiFolderNode | SavedApiItem;

export type ApiMode = 'http' | 'ws';

export type WsStatus = 'idle' | 'connecting' | 'open' | 'closed' | 'error';

// Calls: [API.connect, API.deleteGroup, API.deleteServer, API.exportServersConfig, API.hideWindow, API.importServersConfig, API.listGroups, API.listServers, API.moveServerToGroup, API.quitApp, API.saveGroup, API.uploadPaths, Set, addSession, async, catch, closeSession, connectDockerHelper, connectK8sHelper, connectMongoHelper, connectMqttHelper, connectMysqlHelper, connectPostgresHelper, connectRedisHelper, connectSqliteHelper, connectingRef.current.add, connectingRef.current.delete, connectingRef.current.has, emptyServer, errorMessage, groups.find, handleConnect, handleRequestClose, if, message.error, message.info, message.success, message.warning, offAsk, offCloseReq, offClosed, onUpdateSettings, openTool, registerNativeFileDrop, reloadGroups, reloadServers, return, setCloseModalOpen, setConfirm, setConnectingId, setDialog, setGroups, setNativeDrop, setPendingAsk, setServers, setSettingsOpen, subscribe, switch, unregisterNativeFileDrop, useCallback, useEffect, useSession, useStartupUpdateCheck, useState]
export function AppContent({ settings, onUpdateSettings, onToggleTheme }: AppContentProps) { ... }

// Calls: [API.saveAppSettings, applyGlobalFont, applyThemeMode, async, getAntdTheme, getCachedSettings, handleUpdateSettings, return, setCachedSettings, setSettings, useCallback, window.matchMedia]
export function App() { ... }

// Calls: [Events.On, Set, boundUnsubscribers.delete, boundUnsubscribers.get, boundUnsubscribers.has, boundUnsubscribers.set, fn, forEach, if, return, s.delete, set.add, subscribers.delete, subscribers.get, subscribers.set, unsub]
export function subscribe(event: string, handler: AnyFn): () => void { ... }

export function setPendingAsk(prompt: string): void { ... }

export function consumePendingAsk(): string | null { ... }

// Calls: [Events.Emit, fn, forEach, subscribers.get]
export function emitEvent(event: string, ...args: any[]): void { ... }

// Calls: [dropUnsubscriber, if]
export function unregisterNativeFileDrop(): void { ... }

// Calls: [window.matchMedia]
export function getAntdTheme(themeMode: 'dark' | 'light' | 'system' = 'dark'): ThemeConfig { ... }

export function getTerminalTheme(isDark: boolean): ITheme { ... }

export function emptyServer(): ServerConfig { ... }

```

---

### TypeScript Module `components` (`frontend/src/components`)

- **Imports (31):** `./AppLogo`, `./ErrorBoundary.module.less`, `./ResizableTable.module.less`, `./TitleBar.module.less`, `./editorTheme`, `@/api`, `@/components/ClientIcon`, `@/components/CodeEditor`, `@/components/ContextMenu`, `@/components/DevTools.module.less`, `@/components/Modal`, `@/components/Sidebar.module.less`, `@/components/TransferBar.module.less`, `@/contexts/SessionContext`, `@/styles/global.module.less`, `@/types`, `@/utils`, `@/utils/md5`, `@codemirror/lang-json`, `@codemirror/lang-sql`, `@codemirror/lang-yaml`, `@codemirror/language`, `@codemirror/state`, `@codemirror/view`, `@lezer/highlight`, `@uiw/react-codemirror`, `@wailsio/runtime`, `antd`, `lucide-react`, `react`, `react-dom`

```typescript
export interface AppLogoProps {
	...
}

export interface ClientIconProps {
	...
}

export interface CloseConfirmModalProps {
	...
}

export interface Props {
	...
}

export interface ColumnFilterState {
	...
}

export interface ColumnFilterPopoverProps {
	...
}

export interface MenuItem {
	...
}

export interface MenuState {
	...
}

export interface Props {
	...
}

export interface State {
	...
}

export interface BaseProps {
	...
}

export interface PromptState {
	...
}

export interface ConfirmState {
	...
}

export interface ColDef {
	...
}

export interface Props {
	...
}

export interface Props {
	...
}

export interface Props {
	...
}

export interface TitleBarProps {
	...
}

export interface Props {
	...
}

export type LangKey = 'json' | 'plain' | 'sql' | 'yaml';

export type ToolKey = 'md5' | 'timestamp' | 'base64' | 'json';

export class ErrorBoundary extends Component {
	getDerivedStateFromError(error: Error): State { ... }

	componentDidCatch(error: Error, errorInfo: ErrorInfo) { ... }

	// Calls: [if, return]
	render() { ... }

}

// Calls: [return, rgba, switch, url]
export function renderLogoSvg(kind: ConnType, size: number) { ... }

// Calls: [onConfirm]
export function handleOk() { ... }

// Calls: [setAction, setRemember]
export function handleAfterClose() { ... }

// Calls: [json, sql, switch, yaml]
export function langExt(lang: LangKey) { ... }

// Calls: [isNaN, val.trim]
export function isNumeric(val: string): boolean { ... }

// 构建 PostgreSQL 的 WHERE 子句
// Calls: [col.replace, f.value.replace, for, if, isNumeric, parts.join, parts.push, switch]
export function buildPgWhereClause(filters: Record<string, ColumnFilterState>): string { ... }

// 构建 MySQL 的 WHERE 子句
// Calls: [CAST, col.replace, f.value.replace, for, if, isNumeric, parts.join, parts.push, replace, switch]
export function buildMysqlWhereClause(filters: Record<string, ColumnFilterState>): string { ... }

// 格式化过滤描述文本
// Calls: [if]
export function formatFilterLabel(col: string, f: ColumnFilterState): string { ... }

// Calls: [if, onApply, setOpen, val.trim]
export function handleConfirm() { ... }

// Calls: [onApply, setOpen, setVal]
export function handleReset() { ... }

// Calls: [icon.toLowerCase, if, switch]
export function renderMenuIcon(icon?: React.ReactNode): React.ReactNode { ... }

// Calls: [if, menuRef.current.contains, onClose]
export function handlePointerDown(e: MouseEvent) { ... }

// Calls: [if, onClose]
export function handleKeyDown(e: KeyboardEvent) { ... }

// Calls: [onClose]
export function handleBlur() { ... }

// Calls: [if, navigator.clipboard.writeText, setCopied, useState]
export async function onClick() { ... }

// Calls: [if, md5, return, setText, useMemo, useState]
export function Md5Tool() { ... }

export function pad(n: number) { ... }

// Calls: [d.getDate, d.getFullYear, d.getHours, d.getMinutes, d.getMonth, d.getSeconds, pad, return]
export function fmtDate(d: Date) { ... }

// Calls: [Date, Date.now, Number.isFinite, d.getTime, fmtDate, if, isNaN, raw.trim, return, setDateResult, setNowMs, setNowSec, useEffect, useState]
export function convertToDate(raw: string) { ... }

// Calls: [Date, d.getTime, if, isNaN, setTsResult]
export function convertToTs(local: string) { ... }

// Calls: [fromBase64]
export function safeFromBase64(b64: string) { ... }

// Calls: [if, return, safeFromBase64, setInput, setMode, toBase64, useMemo, useState]
export function Base64Tool() { ... }

// Calls: [exec, position]
export function findPos(msg: string): number | null { ... }

// Calls: [for, if, str.charCodeAt]
export function locate(str: string, pos: number) { ... }

// Calls: [catch, findPos, if, input.trim, locate, setError, setInput, startTransition, useState, useTransition]
export function run(mode: 'format' | 'minify') { ... }

// Calls: [TOOLS.map, return, setActive]
export function DevTools({ onClose }: { onClose: () { ... }

// Calls: [return]
export function Modal({ open, title, onClose, children, footer, width = 480 }: BaseProps) { ... }

// Calls: [if, value.trim]
export function submit() { ... }

// Calls: [return]
export function ConfirmModal({ state, onCancel }: { state: ConfirmState; onCancel: () { ... }

// Calls: [document.createElement, for, if, measurementCanvas.getContext, measurementCtx.measureText, text.charCodeAt]
export function measureCellTextWidth(text: string, font = '12.5px Consolas, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace'): number { ... }

// Calls: [if]
export function extractCellValueString(val: any): string { ... }

// Calls: [cancelAnimationFrame, if, requestAnimationFrame, setComputedWidths, setResizingCol]
export function onMove(me: MouseEvent) { ... }

// Calls: [document.removeEventListener]
export function cleanup() { ... }

// Calls: [cancelAnimationFrame, cleanup, if, setResizingCol]
export function onUp() { ... }

// Calls: [setError, setForm, setTestResult]
export function update(patch: Partial<ServerConfig>) { ... }

// Calls: [getSwitchedTypePatch, update]
export function switchType(t: ConnType) { ... }

// Calls: [API.saveServer, catch, errorMessage, if, onClose, onSaveAndConnect, onSaved, setBusy, setError, validateServerForm]
export async function save(connect: boolean) { ... }

// Calls: [API.dockerTestConnection, API.k8sTestConnection, API.mongoTestConnection, API.mqttTestConnection, API.mysqlTestConnection, API.postgresTestConnection, API.redisTestConnection, API.sshTestConnection, catch, errorMessage, if, setBusy, setError, setTestResult, validateServerForm]
export async function handleTestConnection() { ... }

// 匹配搜索关键字（支持名称、主机、用户名、Docker/K8s 配置路径）
// Calls: [includes, searchFields.some, toLowerCase]
export function matchServer(server: ServerConfig, kw: string): boolean { ... }

// 统一获取排序权重键
// Calls: [toLowerCase]
export function getServerSortKey(server: ServerConfig): string { ... }

// Calls: [for, if, list.push, map.get, map.set, useMemo]
export function kindOf(s: ServerConfig): ConnType { ... }

// Calls: [kindOf]
export function activeIdOf(server: ServerConfig) { ... }

// Calls: [setUserExpanded]
export function toggleGroup(id: string) { ... }

// Calls: [onCreateGroup, setEditingGroup, setUserExpanded]
export async function startCreateGroup() { ... }

// Calls: [editingGroup.name.trim, if, onRenameGroup, setEditingGroup]
export function commitRename() { ... }

// Calls: [Docker, K8s, activateTab, active.map, activeIdOf, e.dataTransfer.setData, e.preventDefault, e.stopPropagation, getBoundingClientRect, if, kindOf, onConnect, onDelete, onEdit, onFocusSession, pop, return, server.k8sKubeconfigPath.split, sess.id.slice, sessionsOf, setDragId, setDropGroup, setMenu, setMoveMenu, split]
export function renderServer(server: ServerConfig) { ... }

// Calls: [Window.IsMaximised, if, setIsMaximised]
export async function updateWindowStates() { ... }

// Calls: [Window.Minimise, catch]
export function handleMinimise() { ... }

// Calls: [Window.ToggleMaximise, catch]
export function handleToggleMaximise() { ... }

// Calls: [Window.Close, catch, if, onRequestClose]
export function handleClose() { ... }

// Calls: [Window.SetAlwaysOnTop, catch, setIsAlwaysOnTop]
export function handleToggleAlwaysOnTop() { ... }

// Calls: [e.stopPropagation, formatSize, if, onCancel, onClear, return, running.reduce, setOpen, transfers.filter, transfers.map, useEffect, useRef, useState]
export function TransferBar({ transfers, onCancel, onClear }: Props) { ... }

```

---

### TypeScript Module `app` (`frontend/src/components/app`)

- **Imports (27):** `./AiSidebar.module.less`, `./SessionTabs.module.less`, `@/components/AppLogo`, `@/components/ClientIcon`, `@/components/DevTools`, `@/components/ErrorBoundary`, `@/components/app/Stage.module.less`, `@/components/common/TabBar`, `@/contexts/SessionContext`, `@/pages/agent/AiAgentPanel`, `@/pages/api/ApiClient`, `@/pages/docker/DockerClient`, `@/pages/k8s/K8sClient`, `@/pages/mongo/MongoClient`, `@/pages/mqtt/MqttClient`, `@/pages/mysql/MysqlClient`, `@/pages/postgres/PostgresClient`, `@/pages/redis/RedisClient`, `@/pages/sqlite/SqliteClient`, `@/pages/ssh/SessionWorkspace`, `@/pages/wiki/WikiClient`, `@/styles/global.module.less`, `@/types`, `@/utils/storage`, `antd`, `lucide-react`, `react`

```typescript
export interface AiSidebarProps {
	...
}

export interface StageProps {
	...
}

// Calls: [appStorage.getNumber, cancelAnimationFrame, e.preventDefault, if, requestAnimationFrame, return, setIsResizing, setMounted, setWidth, useCallback, useEffect, useSession, useState]
export function handleMouseMove(e: MouseEvent) { ... }

// Calls: [appStorage.set, setIsResizing, setWidth]
export function handleMouseUp() { ... }

// 处理 Tab 切换点击
// Calls: [activateTab, if, key.indexOf, key.slice, list.push, sessions.docker.forEach, sessions.k8s.forEach, sessions.mongo.forEach, sessions.mqtt.forEach, sessions.mysql.forEach, sessions.postgres.forEach, sessions.redis.forEach, sessions.sqlite.forEach, sessions.ssh.forEach, useMemo, useSession]
export function handleChange(key: string) { ... }

// 处理 Tab 关闭
// Calls: [closeSession, closeTool, if, key.indexOf, key.slice]
export function handleClose(key: string) { ... }

```

---

### TypeScript Module `common` (`frontend/src/components/common`)

- **Imports (15):** `./CellEditorInline.module.less`, `./MarkdownViewer.module.less`, `./TabBar.module.less`, `@/api`, `@/contexts/ThemeContext`, `@/theme`, `@/utils`, `@ant-design/x-markdown`, `@xterm/addon-fit`, `@xterm/addon-web-links`, `@xterm/xterm`, `@xterm/xterm/css/xterm.css`, `antd`, `lucide-react`, `react`

```typescript
export interface ContainerExecTarget {
	...
}

export interface Props {
	...
}

export interface MarkdownViewerProps {
	...
}

export interface TabItem {
	...
}

export interface TabBarProps {
	...
}

// Calls: [if, onCancel, onCommit]
export function handleCommit(val: string, isN: boolean) { ... }

// Calls: [if, onCancel, onCommit, onSave]
export function handleSave(val: string, isN: boolean) { ... }

// Calls: [if, onCancel]
export function handleCancel() { ... }

// Calls: [API.dockerExecClose, API.dockerExecResize, API.dockerExecStart, API.dockerExecWrite, API.k8sExecClose, API.k8sExecResize, API.k8sExecStart, API.k8sExecWrite, Error, FitAddon, ResizeObserver, Terminal, WebLinksAddon, async, base64ToBytes, catch, cleanSession, clear, connectTerminal, fit.fit, focus, getTerminalTheme, if, indexOf, navigator.clipboard.readText, navigator.clipboard.writeText, navigator.platform.toUpperCase, resizeObserver.disconnect, resizeObserver.observe, return, setStatus, subscribe, term.attachCustomKeyEventHandler, term.getSelection, term.hasSelection, term.loadAddon, term.onData, term.onResize, term.open, termRef.current.dispose, termRef.current.focus, termRef.current.reset, termRef.current.write, then, u, unsubsRef.current.forEach, useCallback, useEffect, useTheme, writeln]
export function handleClear() { ... }

// Calls: [if, message.info, message.success, navigator.clipboard.writeText, termRef.current.getSelection, termRef.current.hasSelection]
export function handleCopy() { ... }

// Calls: [if, setHasOverflow]
export function checkOverflow() { ... }

// 鼠标滚轮横向滚动
// Calls: [if]
export function handleWheel(e: React.WheelEvent<HTMLDivElement>) { ... }

// 内部通用关闭逻辑
export function executeClose(key: string) { ... }

// Calls: [forEach, if, items.filter, onClose, onCloseAll]
export function executeCloseAll() { ... }

// Calls: [filter, forEach, if, items.findIndex, onClose, onCloseLeft, slice]
export function executeCloseLeft(targetKey: string) { ... }

// Calls: [filter, forEach, if, items.findIndex, onClose, onCloseRight, slice]
export function executeCloseRight(targetKey: string) { ... }

// 构建右键上下文菜单
// Calls: [executeClose, executeCloseAll, executeCloseLeft, executeCloseRight, items.slice, items.some, some]
export function getContextMenuItems(item: TabItem, index: number): MenuProps['items'] { ... }

```

---

### TypeScript Module `Tree` (`frontend/src/components/common/Tree`)

- **Imports (4):** `./Tree.module.less`, `./types`, `lucide-react`, `react`

```typescript
export interface TreeNodeItemProps {
	...
}

export interface TreeNodeData {
	...
}

export interface TreeDropInfo {
	...
}

export interface TreeProps {
	...
}

// Calls: [findNode, for, if]
export function findNode(key: string, nodes: TreeNodeData[]): TreeNodeData | null { ... }

// Calls: [checkInChildren, for, if]
export function checkInChildren(nodes: TreeNodeData[], targetKey: string): boolean { ... }

// Calls: [checkInChildren, findNode, if]
export function isDescendant(parentKey: string, childKey: string, nodes: TreeNodeData[]): boolean { ... }

```

---

### TypeScript Module `DataTab` (`frontend/src/components/db/DataTab`)

- **Imports (7):** `../types`, `./DbDataTab.module.less`, `@/components/ResizableTable`, `@/components/common/CellEditorInline`, `@/utils`, `@/utils/sqlExport`, `react`

```typescript
export interface DbDataTabProps {
	...
}

// Calls: [adapter.buildWhereClause, calcColWidthFromName, columns.join, filter, if, map, setColWidths, structure.columns.filter, useEffect, useMemo, useRef, useState]
export function getColW(key: string, isPk = false, isFk = false) { ... }

// Calls: [setColWidths]
export function handleColResize(key: string, newWidth: number) { ... }

// 加载表结构与元数据
// Calls: [adapter.loadStructure, catch, setStructure]
export async function loadStructure() { ... }

// 加载 DDL
// Calls: [adapter.loadDDL, catch, setDdlText]
export async function loadDDL() { ... }

// Calls: [adapter.buildWhereClause, if, loadData, setFilters, setPage]
export function handleFilterChange(col: string, filter: ColumnFilterState | null) { ... }

// Calls: [loadData, setFilters, setPage]
export function handleClearAllFilters() { ... }

// 列头点击排序循环切换：未排序 -> ASC -> DESC -> 取消排序
// Calls: [if, loadData, setPage, setSortCol, setSortOrder]
export function handleHeaderSort(colName: string) { ... }

// 行内编辑保存
// Calls: [coerceCellValue, if, isSameCellValue, setEditingCell, setRowDrafts]
export function handleCommitCell(rowIdx: number, col: string, val: any, isNull: boolean) { ... }

// 新增行单元格编辑
// Calls: [setEditingNewCell, setNewRows]
export function handleCommitNewCell(rowIdx: number, col: string, val: any, isNull: boolean) { ... }

// 单元格快捷键 Ctrl+S 保存 (已有行)
// Calls: [coerceCellValue, handleSaveAll, if, isSameCellValue, setEditingCell, setRowDrafts]
export function handleSaveCellInline(rowIdx: number, col: string, val: any, isNull: boolean) { ... }

// 单元格快捷键 Ctrl+S 保存 (新增行)
// Calls: [handleSaveAll, setEditingNewCell, setNewRows]
export function handleSaveNewCellInline(rowIdx: number, col: string, val: any, isNull: boolean) { ... }

// Calls: [classList.contains, e.preventDefault, e.stopPropagation, handleSaveAll, if]
export function handleKeyDown(e: KeyboardEvent) { ... }

// 放弃所有草稿修改
// Calls: [message.info, setEditingCell, setEditingNewCell, setNewRows, setRowDrafts]
export function handleDiscardAll() { ... }

// 删除单行
// Calls: [adapter.deleteRow, catch, if, loadData, message.error, message.success]
export async function handleDeleteRow(rowIdx: number) { ... }

// 新增一行草稿
// Calls: [columns.forEach, setNewRows]
export function handleAddNewRow() { ... }

// 导出文件
// Calls: [adapter.exportToFile, catch, if, message.error, message.info, message.success]
export async function handleExport(mode: 'csv' | 'json') { ... }

// Calls: [Modal.confirm, async, buildInsertSql, buildUpdateSql, copyTextToClipboard, handleCommitCell, handleCommitNewCell, handleDeleteRow, if, items.push, join, message.info, message.success, message.warning, pkList.forEach, pkList.map, prev.filter, setNewRows]
export function getContextMenuItems(): MenuProps['items'] { ... }

```

---

### TypeScript Module `SqlEditor` (`frontend/src/components/db/SqlEditor`)

- **Imports (6):** `../types`, `./DbSqlEditor.module.less`, `@/components/CodeEditor`, `@/components/common/TabBar`, `antd`, `react`

```typescript
export interface QueryTab {
	...
}

export interface DbSqlEditorProps {
	...
}

// Calls: [prev.map, setTabs, tabs.find, useState]
export function updateActiveTab(patch: Partial<QueryTab>) { ... }

// Calls: [Date.now, setActiveTabId, setTabs]
export function handleAddTab() { ... }

// Calls: [if, setActiveTabId, setTabs, tabs.filter, tabs.findIndex]
export function handleCloseTab(id: string) { ... }

// Calls: [if, setActiveTabId, setTabs]
export function handleCloseAllTabs() { ... }

// Calls: [if, setActiveTabId, setTabs, tabs.findIndex, tabs.slice]
export function handleCloseLeftTabs(targetId: string) { ... }

// Calls: [if, setActiveTabId, setTabs, tabs.findIndex, tabs.slice]
export function handleCloseRightTabs(targetId: string) { ... }

// 执行 SQL
// Calls: [activeTab.sql.trim, adapter.runSql, catch, if, message.error, message.warning, performance.now, setRunning, updateActiveTab]
export async function handleRunSql() { ... }

// 执行 EXPLAIN 分析
// Calls: [activeTab.sql.trim, adapter.explainSql, catch, if, message.error, message.info, message.warning, setRunning, updateActiveTab]
export async function handleExplain() { ... }

// 导出 CSV
// Calls: [activeTab.result.rows.map, cols.join, cols.map, if, join, message.info, message.success, navigator.clipboard.writeText]
export function handleExportCsv() { ... }

```

---

### TypeScript Module `adapters` (`frontend/src/components/db/adapters`)

- **Imports (4):** `@/api`, `@/components/ColumnFilterPopover`, `antd`, `react`

```typescript
// Calls: [Math.random, React.createElement, children.filter, children.push, if, qb.nested_loop.forEach, renderMysqlPlanNode, toString, var]
export function renderMysqlPlanNode(node: any): any { ... }

// Calls: [API.mysqlCount, API.mysqlDelete, API.mysqlDescribe, API.mysqlExportToFileEx, API.mysqlIndexes, API.mysqlInsert, API.mysqlRun, API.mysqlSelect, API.mysqlUpdate, COUNT, catch, cols.map, columns.push, constraintRows.map, countData, deleteRow, descRes.rows.forEach, exportToFile, filter, fkColMap.add, fkColMap.has, for, idxList.forEach, if, indexes.push, insertRows, loadDDL, loadData, loadStructure, pkList.map, push, quoteIdent, replace, updateRows, where.trim]
export function quoteIdent(name: string) { ... }

// Calls: [API.mysqlRun, explainSql, if, performance.now, renderMysqlPlanNode, runSql]
export function createMysqlSqlAdapter(serverId: string, dbName: string): DbSqlEditorAdapter { ... }

// Calls: [Math.random, React.createElement, if, map, ms, renderPgPlanNode, toString, var]
export function renderPgPlanNode(plan: any): any { ... }

// Calls: [API.postgresCount, API.postgresDelete, API.postgresDescribe, API.postgresExportToFile, API.postgresInsert, API.postgresSelect, API.postgresTableDDL, API.postgresUpdate, cols.map, countData, deleteRow, exportToFile, filter, for, if, insertRows, loadDDL, loadData, loadStructure, map, pkList.map, updateRows]
export function quoteIdent(name: string) { ... }

// Calls: [isNaN, val.trim]
export function isNumeric(val: string): boolean { ... }

// Calls: [if, isFinite, isNaN, str.replace]
export function sqlVal(v: any): string { ... }

// Calls: [CAST, col.replace, f.value.replace, for, if, isNumeric, parts.join, parts.push, switch]
export function buildSqliteWhereClause(filters: Record<string, ColumnFilterState>): string { ... }

// Calls: [API.sqliteCount, API.sqliteDescribe, API.sqliteIndexes, API.sqliteRun, API.sqliteSelect, COUNT, IN, VALUES, catch, col.replace, columns.forEach, countData, deleteRow, fkColSet.add, fkColSet.has, fkRows.map, for, foreign_key_list, if, insertRows, loadDDL, loadData, loadStructure, map, pk.replace, pkList.map, replace, setParts.join, setParts.push, sortCol.replace, sqlVal, tableName.replace, updateRows, validCols.join, validCols.push, validVals.join, validVals.push, where.trim, whereParts.join]
export function quoteIdent(name: string) { ... }

```

---

### TypeScript Module `db` (`frontend/src/components/db`)

- **Imports (1):** `@/components/ColumnFilterPopover`

```typescript
export interface DbColumnMeta {
	...
}

export interface DbIndexMeta {
	...
}

export interface DbConstraintMeta {
	...
}

export interface DbTableStructure {
	...
}

export interface DbQueryParams {
	...
}

export interface DbQueryResult {
	...
}

export interface DbAdapter {
	...
}

export interface ExplainPlanResult {
	...
}

export interface DbSqlEditorAdapter {
	...
}

export type DbDialect = 'mysql' | 'postgres' | 'sqlite';

```

---

### TypeScript Module `server-forms` (`frontend/src/components/server-forms`)

- **Imports (17):** `./BasicFields`, `./DockerForm`, `./K8sForm`, `./MongoForm`, `./MqttForm`, `./MysqlForm`, `./PostgresForm`, `./RedisForm`, `./SqliteForm`, `./SshForm`, `./types`, `@/api`, `@/types`, `@/utils`, `antd`, `lucide-react`, `react`

```typescript
export interface Props {
	...
}

export interface ServerFormProps {
	...
}

// Calls: [API.selectCertFile, catch, errorMessage, if, setError, update]
export async function handlePickCert(field: keyof ServerConfig) { ... }

// Calls: [API.k8sParseKubeconfig, filePath.trim, if, rawData.trim, setKubeconfigContexts, setKubeconfigInfo, update]
export async function handleParseKubeconfig(data?: string, path?: string) { ... }

// Calls: [API.selectCertFile, catch, errorMessage, handleParseKubeconfig, if, setError, update]
export async function handlePickKubeconfigFile() { ... }

// Calls: [API.selectCertFile, catch, errorMessage, if, setError, update]
export async function handlePickCert(field: keyof ServerConfig) { ... }

// Calls: [API.selectCertFile, catch, errorMessage, if, setError, update]
export async function handlePickCert(field: keyof ServerConfig) { ... }

// Calls: [API.mongoParseURI, catch, errorMessage, if, info.hosts.join, setError, setTestResult, split, update, uri.trim]
export async function handleParseMongoURI() { ... }

// Calls: [API.selectCertFile, catch, errorMessage, if, setError, update]
export async function handlePickCert(field: keyof ServerConfig) { ... }

// Calls: [API.sqliteOpenFile, catch, errorMessage, if, setError, update]
export async function handlePickSqlite() { ... }

// Calls: [API.selectPrivateKey, catch, errorMessage, if, setError, update]
export async function handlePickPrivateKey() { ... }

// Calls: [emptyServer, if]
export function initServerForm(initial: ServerConfig | null): ServerConfig { ... }

// Calls: [includes]
export function getSwitchedTypePatch(t: ConnType, currentForm: ServerConfig): Partial<ServerConfig> { ... }

// Calls: [URI, if, isNaN, trim]
export function validateServerForm(cfg: ServerConfig): string | null { ... }

```

---

### TypeScript Module `contexts` (`frontend/src/contexts`)

- **Imports (4):** `./SessionContext`, `./sessionHelpers`, `@/api`, `react`

```typescript
export interface ActiveTarget {
	...
}

export interface SessionsState {
	...
}

export interface ToolsState {
	...
}

export interface SessionContextValue {
	...
}

export interface ThemeContextValue {
	...
}

export type ToolKind = 'api' | 'devtools' | 'aiAgent' | 'wiki';

export type TabKind = ConnType | ToolKind;

export type ThemeMode = 'light' | 'dark' | 'system';

// Calls: [Error, if, useContext]
export function useSession() { ... }

// Calls: [API.agentSetActiveConnection, activateTab, async, catch, currentList.filter, disconnectHelper, getAllOpenTabs, if, list.filter, list.map, pickAdjacentFallback, return, sessions.docker.find, sessions.k8s.find, sessions.mongo.find, sessions.mysql.find, sessions.postgres.find, sessions.redis.find, sessions.sqlite.find, sessions.ssh.find, setActiveTarget, setAiSidebarOpen, setSessions, setSidebarOpen, setTools, switch, useCallback, useEffect, useRef]
export function SessionProvider({ children }: { children: ReactNode }) { ... }

export function useTheme() { ... }

// Calls: [API.k8sConnect, Error, K8s, if]
export async function connectK8sHelper(cfg: ServerConfig): Promise<K8sSessionInfo> { ... }

// Calls: [API.dockerConnect, Docker, Error, if]
export async function connectDockerHelper(cfg: ServerConfig): Promise<DockerSessionInfo> { ... }

// Calls: [API.redisConnect, API.redisDBSize, API.redisModeInfo, Error, catch, if]
export async function connectRedisHelper(cfg: ServerConfig): Promise<RedisSessionInfo> { ... }

// Calls: [API.mysqlConnectEx, Error, if]
export async function connectMysqlHelper(cfg: ServerConfig): Promise<MysqlSessionInfo> { ... }

// Calls: [API.postgresConnect, Error, if]
export async function connectPostgresHelper(cfg: ServerConfig): Promise<PostgresSessionInfo> { ... }

// Calls: [API.mqttConnect, Error, if]
export async function connectMqttHelper(cfg: ServerConfig): Promise<MqttSessionInfo> { ... }

// Calls: [API.mongoConnect, Error, if]
export async function connectMongoHelper(cfg: ServerConfig): Promise<MongoSessionInfo> { ... }

// Calls: [API.sqliteConnect, API.sqliteInfo, API.sqliteOpenFile, Error, catch, cfg.name.includes, cfg.name.split, finalPath.split, if, pop]
export async function connectSqliteHelper(cfg: ServerConfig): Promise<SqliteSessionInfo | null> { ... }

// Calls: [API.disconnect, API.dockerClose, API.k8sClose, API.mongoClose, API.mqttClose, API.mysqlCloseEx, API.postgresClose, API.redisClose, API.sqliteClose, switch]
export async function disconnectHelper(kind: ConnType, id: string): Promise<void> { ... }

// Calls: [for, if]
export function rest(['ssh', 'docker', 'k8s', 'redis', 'mysql', 'postgres', 'mqtt', 'mongo', 'sqlite'] as ConnType[]).filter((k) { ... }

```

---

### TypeScript Module `agent` (`frontend/src/pages/agent`)

- **Imports (14):** `./components/AskUserDock`, `./components/ChatMessageList`, `./components/Composer`, `./components/HistorySessionsModal`, `./components/HitlConfirmModal`, `./hooks/useAgentComposer`, `./hooks/useAgentEvents`, `./hooks/useAgentSessions`, `@/api`, `@/pages/agent/AiAgentPanel.module.less`, `@/types`, `antd`, `lucide-react`, `react`

```typescript
export interface Props {
	...
}

// Calls: [setEditingTitleValue, setIsEditingTitle]
export function handleStartEditTitle() { ... }

// Calls: [editingTitleValue.trim, if, renameSession, setIsEditingTitle]
export function handleSaveTitle() { ... }

// Calls: [API.agentDecideApproval, API.agentGetPendingApprovals, catch, if, last.process_steps.map, list.find, setMessages, setPendingHitl]
export async function handleResolveHitl(confirmId: string, approved: boolean, reason?: string) { ... }

// Calls: [API.agentAnswerAsk, Date.now, if, includes, last.process_steps.map, last.process_steps.push, setMessages, setPendingAsk]
export async function handleAnswerAsk(answer: string) { ... }

// Calls: [API.saveAppSettings, catch, if, models.find, onUpdateSettings]
export async function handleSelectModel(modelId: string) { ... }

```

---

### TypeScript Module `components` (`frontend/src/pages/agent/components`)

- **Imports (18):** `./AskUserDock.module.less`, `./ChatMessageItem`, `./ChatMessageList.module.less`, `./Composer.module.less`, `./HistorySessionsModal.module.less`, `./MessagePlanCard`, `./MessagePlanCard.module.less`, `./PlanDrawer`, `./PlanDrawer.module.less`, `./ProcessStepsList`, `./ProcessStepsList.module.less`, `./SlashCommandMenu`, `./SlashCommandMenu.module.less`, `@/components/common/MarkdownViewer`, `@/types`, `antd`, `lucide-react`, `react`

```typescript
export interface AskUserDockProps {
	...
}

export interface ChatMessageItemProps {
	...
}

export interface ChatMessageListProps {
	...
}

export interface ComposerProps {
	...
}

export interface Props {
	...
}

export interface Props {
	...
}

export interface MessagePlanCardProps {
	...
}

export interface PlanDrawerProps {
	...
}

export interface ProcessStepsListProps {
	...
}

export interface SlashCommandDef {
	...
}

export interface Props {
	...
}

export type SlashCommandType = 'plan' | 'grill-me';

// Calls: [customAskAnswer.trim, if, onAnswer, setCustomAskAnswer]
export function handleCustomSubmit() { ... }

// Calls: [if, navigator.clipboard.writeText, setCopied, then]
export function handleCopyAssistant() { ... }

// Calls: [FileReader, Promise, reader.readAsDataURL, resolve]
export function readFileAsDataURL(file: File): Promise<string> { ... }

// Calls: [if, toFixed]
export function formatTokenK(tokens: number): string { ... }

// Calls: [if]
export function getRingColor(pct: number): string { ... }

// Calls: [catch, f.type.startsWith, files.filter, if, imageFiles.map, message.error, message.warning]
export async function processImageFiles(files: File[]) { ... }

// Calls: [Array.from, e.preventDefault, for, if, imageFiles.push, item.getAsFile, item.type.startsWith, processImageFiles]
export function handlePaste(e: React.ClipboardEvent) { ... }

// Calls: [e.preventDefault, e.stopPropagation, if, setIsDragging]
export function handleDragEnter(e: React.DragEvent) { ... }

// Calls: [e.preventDefault, e.stopPropagation, if, setIsDragging]
export function handleDragLeave(e: React.DragEvent) { ... }

// Calls: [e.preventDefault, e.stopPropagation, if]
export function handleDragOver(e: React.DragEvent) { ... }

// Calls: [Array.from, e.preventDefault, e.stopPropagation, if, processImageFiles, setIsDragging]
export function handleDrop(e: React.DragEvent) { ... }

// Calls: [prev.filter]
export function handleRemoveImage(index: number) { ... }

// Calls: [if, setActiveCommand, setInput, textareaRef.current.focus]
export function handleSelectCommand(cmdKey: SlashCommandType) { ... }

// Calls: [if, setActiveCommand, setInput, setSelectedMenuIndex, val.slice, val.startsWith]
export function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) { ... }

// Calls: [e.preventDefault, handleSelectCommand, if, input.trim, onKeyDown, onSend, setActiveCommand, setInput, setSelectedMenuIndex]
export function handleInternalKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) { ... }

// Calls: [Date, d.getHours, d.getMinutes, d.toDateString, if, now.toDateString, pad]
export function pad(n: number) { ... }

// Calls: [e.stopPropagation, setEditingId, setEditingTitle]
export function handleStartEdit(e: React.MouseEvent, session: AgentSessionItem) { ... }

// Calls: [e.stopPropagation, editingTitle.trim, if, onRenameSession, setEditingId]
export function handleSaveEdit(e?: React.MouseEvent | React.KeyboardEvent, id?: string) { ... }

// Calls: [e.stopPropagation, if, setEditingId]
export function handleCancelEdit(e?: React.MouseEvent) { ... }

// Calls: [onClose, onCreateSession]
export function handleCreate() { ... }

// Calls: [onResolve, setSubmitting]
export async function handleApprove() { ... }

// Calls: [onResolve, rejectReason.trim, setSubmitting]
export async function handleReject() { ... }

// Calls: [catch, e.stopPropagation, if, message.error, message.success, navigator.clipboard.writeText, setCopied, then]
export function handleCopy(e: React.MouseEvent) { ... }

// Calls: [e.stopPropagation, setExpandedSteps]
export function toggleStep(stepId: string, e: React.MouseEvent) { ... }

// Calls: [if, toFixed]
export function formatDuration(ms?: number) { ... }

// Calls: [if, step.summary.startsWith, step.summary.trim, trimmed.includes]
export function formatSummary(step: ProcessStep) { ... }

// Calls: [if, msg.process_steps.map, msg.tool_calls.forEach, replace, slice, steps.push]
export function getStepsForMessage(msg: AiMessage): ProcessStep[] { ... }

```

---

### TypeScript Module `hooks` (`frontend/src/pages/agent/hooks`)

- **Imports (4):** `@/api`, `@/types`, `@/utils/storage`, `react`

```typescript
export interface UseAgentComposerProps {
	...
}

export interface UseAgentEventsProps {
	...
}

export function newSteps(last.process_steps || []).map((st) { ... }

export function newSteps(last.process_steps || []).map((st) { ... }

// Calls: [Date.now, copy.push, if, setMessages, updater]
export function appendOrUpdateAssistant(updater: (msg: AiMessage) { ... }

// Calls: [Date.now, appendOrUpdateAssistant, cancelAnimationFrame, if, setActiveReasoning, steps.push, steps.some, updated.process_steps.map]
export function flushChunks() { ... }

// Calls: [flushChunks, if, requestAnimationFrame]
export function scheduleFlush() { ... }

export function newSteps(last.process_steps || []).map((st) { ... }

// Calls: [allMsgs.slice, for, if, userIndices.push]
export function sliceLatestRounds(allMsgs: AiMessage[], roundCount: number) { ... }

// Calls: [API.agentGetSessionMessages, appStorage.getString, async, if, sessions.find, setLoadingMessages, useCallback, useMemo]
export function msgs(rawMsgs || []).map((m) { ... }

```

---

### TypeScript Module `api` (`frontend/src/pages/api`)

- **Imports (26):** `./ApiClient.module.less`, `./ApiConfigTabs`, `./ApiTreeList`, `./ApiTreeList.module.less`, `./HttpRequest`, `./SaveApiModal`, `./WsClient`, `./apiShared.module.less`, `./apiTypes`, `./headerPresets`, `./useApi`, `@/api`, `@/components/CodeEditor`, `@/components/ContextMenu`, `@/components/Modal`, `@/components/common/Tree`, `@/contexts/SessionContext`, `@/pages/api/ApiConfigTabs.module.less`, `@/pages/api/HttpRequest.module.less`, `@/pages/api/WsClient.module.less`, `@/pages/api/apiShared.module.less`, `@/pages/api/useApi`, `@/utils`, `antd`, `lucide-react`, `react`

```typescript
export interface Props {
	...
}

export interface Props {
	...
}

export interface HeaderPreset {
	...
}

export interface ApiExecState {
	...
}

export type ConfigTab = 'params' | 'headers' | 'body' | 'auth' | 'options' | 'messages';

export type ApiState = ReturnType<typeof useApi>;

// Calls: [return, useApi]
export function ApiClient({ onClose }: { onClose: () { ... }

// Calls: [Params, auth.type.toUpperCase, bodyType.toUpperCase, h.name.trim, headers.filter, p.name.trim, params.filter, setConfigTab, setShowConfig]
export function selectTab(key: typeof configTab) { ... }

// Calls: [Key, doSend, getHeaderDefaultValue, getHeaderValueOptions, headers.map, if, includes, inputValue.toLowerCase, params.map, removeHeader, removeParam, return, setAuth, setBodyType, setFollowRedirects, setInsecureTLS, setTimeoutMs, setWsProtocols, toLowerCase, updateHeader, updateParam]
export function ConfigBody({ state }: { state: ApiState }) { ... }

// Calls: [Array.from, Set, getFolderOptions, if, message.success, moveTreeNode, rawOptions.filter, setExpandedKeys, setMoveModal, useMemo, useState]
export function handleConfirmMove() { ... }

// 安全加载接口（若未保存则提示）
// Calls: [if, loadSavedApi, setConfirm]
export function safeLoadApi(item: SavedApiItem) { ... }

// 安全新建接口（若未保存则提示）
// Calls: [if, newBlankApi, setConfirm, setSaveModalMode, setSaveModalOpen]
export function safeNewBlankApi() { ... }

// Calls: [allFolderIds.push, collect, for, if, setExpandedKeys]
export function collect(nodes: ApiTreeNode[]) { ... }

// Calls: [countApiItems, deleteTreeNode, e.preventDefault, e.stopPropagation, if, setConfirm, setContextMenu, setMoveModal, setNameInputValue, setNameModal, setTargetFolderSelect]
export function handleFolderContextMenu(e: React.MouseEvent) { ... }

// Calls: [buildCurlCommand, catch, deleteTreeNode, duplicateApiItem, e.preventDefault, e.stopPropagation, if, message.success, navigator.clipboard.writeText, setConfirm, setContextMenu, setMoveModal, setNameInputValue, setNameModal, setTargetFolderSelect, state.copy, then]
export function handleApiContextMenu(e: React.MouseEvent) { ... }

// 递归转换通用 Tree 数据
// Calls: [convertNodes, if, map, nodes.filter]
export function convertNodes(nodes: ApiTreeNode[]): TreeNodeData[] { ... }

// Calls: [if, prev.filter, prev.includes, safeLoadApi, setExpandedKeys]
export function handleSelect(_: any[], info: any) { ... }

// Calls: [Array.from, Set, if, moveTreeNode, setExpandedKeys]
export function handleDrop(info: TreeDropInfo) { ... }

// Calls: [createFolder, if, message.warning, nameInputValue.trim, renameTreeNode, setNameModal]
export function handleSaveNameModal() { ... }

// Calls: [catch, exportApis, if, message.error, message.success]
export async function handleExport() { ... }

// Calls: [catch, if, importApis, message.error, message.success]
export async function handleImport() { ... }

// Calls: [e.preventDefault, setContextMenu, setNameInputValue, setNameModal]
export function handleBlankContextMenu(e: React.MouseEvent) { ... }

// Calls: [if, setEditingNameValue, setIsEditingName, useSession, useState]
export function startEditingName() { ... }

// Calls: [editingNameValue.trim, if, renameTreeNode, setIsEditingName]
export function saveEditingName() { ... }

// Calls: [if, saveCurrentApi, setSaveModalMode, setSaveModalOpen]
export function handleSaveClick() { ... }

// Calls: [e.preventDefault, handleSaveClick, if]
export function handleKeyDown(e: KeyboardEvent) { ... }

// Calls: [Date.now, downloadText, if]
export function downloadResponse() { ... }

// Calls: [return]
export function HttpRequest({ state, onClose }: { state: ApiState; onClose: () { ... }

// Calls: [Form.useForm, form.setFieldsValue, form.validateFields, getFolderOptions, if, saveAsNewApi, saveCurrentApi, setSaveModalOpen, useEffect, values.name.trim]
export async function handleOk() { ... }

// Calls: [Date, e.preventDefault, if, return, setWsInput, toLocaleTimeString, wsInput.trim, wsMessages.map, wsSendMsg]
export function WsClient({ state }: { state: ApiState }) { ... }

export function emptyAuth(): ApiAuth { ... }

// Calls: [return, s.trim, t.endsWith, t.startsWith]
export function looksLikeJson(s: string): boolean { ... }

// Calls: [URLSearchParams, if, params.push, searchParams.forEach, urlStr.includes, urlStr.split]
export function parseUrlParams(urlStr: string) { ... }

// Calls: [URLSearchParams, activeParams.forEach, if, p.name.trim, params.filter, searchParams.append, searchParams.toString]
export function buildUrlWithParams(baseUrl: string, params: ApiHeader[]): string { ... }

export function statusClass(code: number, hasError: boolean): string { ... }

// Headers
// Calls: [URL, enabledParams.forEach, enabledParams.map, encodeURIComponent, headers.forEach, if, item.params.filter, join, p.name.trim, parts.push, replace, url.includes, url.startsWith, urlObj.searchParams.set, urlObj.toString]
export function headers(item.headers || []).filter((h) { ... }

// Calls: [findTreeNode, for, if]
export function findTreeNode(nodes: ApiTreeNode[], id: string): ApiTreeNode | null { ... }

// Calls: [for, if, result.push, traverse]
export function traverse(list: ApiTreeNode[]): ApiTreeNode[] { ... }

// Calls: [Date.now, filter, if, nodes.map, updateTreeNode]
export function updateTreeNode(nodes: ApiTreeNode[], id: string, patch: Partial<SavedApiItem | ApiFolderNode>): ApiTreeNode[] { ... }

// Calls: [Date.now, filter, if, insertTreeNode, nodes.map]
export function insertTreeNode(nodes: ApiTreeNode[], targetFolderId: string | null, newNode: ApiTreeNode): ApiTreeNode[] { ... }

// Calls: [for, getFolderOptions, if, options.push]
export function getFolderOptions(nodes: ApiTreeNode[], prefix = ''): Array< { ... }

// Calls: [countApiItems, for, if]
export function countApiItems(nodes: ApiTreeNode[]): number { ... }

// Calls: [for, if, includes, keyword.trim, matchedKeys.push, nodes.filter, result.push, toLowerCase, traverse]
export function traverse(list: ApiTreeNode[]): ApiTreeNode[] { ... }

// 根据当前 Header Key 查找对应候选 Value 列表
// Calls: [COMMON_HEADERS.find, found.values.map, h.key.toLowerCase, headerName.trim, if, toLowerCase]
export function getHeaderValueOptions(headerName: string) { ... }

// 获取某个 Header Key 的推荐默认 Value
// Calls: [COMMON_HEADERS.find, h.key.toLowerCase, headerName.trim, if, toLowerCase]
export function getHeaderDefaultValue(headerName: string): string | undefined { ... }

// 拖到兄弟节点前后
// Calls: [API.apiRequest, API.loadApiTree, API.saveApiTree, API.wsClose, API.wsConnect, API.wsSend, Array.from, Date.now, Math.random, Set, async, buildRequest, buildUrlWithParams, catch, copy.splice, ct.includes, emptyAuth, errorMessage, filter, find, findTreeNode, h.filter, h.map, h.name.trim, headers.filter, i.test, if, insertAtLevel, insertTreeNode, k.toLowerCase, list.filter, list.findIndex, list.map, looksLikeJson, map, name.trim, navigator.clipboard.writeText, newName.trim, offMsg, offStatus, p.trim, parseUrlParams, raw.trim, reloadApiTree, removeTreeNode, return, setApiTree, setApiTreeExpandedKeys, setAuth, setBody, setBodyType, setConfigTab, setCurrentApiId, setCurrentApiName, setError, setFollowRedirects, setHeaders, setInsecureTLS, setMethod, setMode, setParams, setRespTab, setResponse, setSending, setShowConfig, setTimeoutMs, setUrl, setWsConnId, setWsConnecting, setWsInput, setWsMessages, setWsProtocols, setWsStatus, slice, subscribe, then, toString, unsub, updateTreeNode, url.trim, useCallback, useEffect, useMemo, useRef, useState, wsProtocols.split]
export function insertAtLevel(list: ApiTreeNode[]): ApiTreeNode[] { ... }

```

---

### TypeScript Module `docker` (`frontend/src/pages/docker`)

- **Imports (18):** `./ComposeTab`, `./ContainersTab`, `./DockerClient.module.less`, `./DockerComposeGenerateModal`, `./ImagesTab`, `./NetworksTab`, `./OverviewTab`, `./VolumesTab`, `@/api`, `@/components/ClientIcon`, `@/components/CodeEditor`, `@/components/common/ContainerTerminalModal`, `@/contexts/SessionContext`, `@/types`, `antd`, `antd/es/table`, `lucide-react`, `react`

```typescript
export interface ParsedEnvVar {
	...
}

export interface Props {
	...
}

export interface MergedComposeItem {
	...
}

export interface Props {
	...
}

export interface Props {
	...
}

export interface Props {
	...
}

export interface Props {
	...
}

export interface Props {
	...
}

export interface Props {
	...
}

export interface Props {
	...
}

export type TabKey = 'overview' | 'compose' | 'containers' | 'images' | 'volumes' | 'networks';

// 自动从 Compose YAML 文本中扫描 ${VAR}、${VAR:-default}、${VAR-default}、${VAR:?err} 及 $VAR 占位符
// Calls: [if]
export function scanEnvVarsFromYaml(content: string): ParsedEnvVar[] { ... }

// 打开新建抽屉：自动填充默认示例
// Calls: [API.dockerListComposeRecords, API.dockerListComposeStacks, async, catch, fetchData, for, if, matchedRemoteNames.add, matchedRemoteNames.has, merged.push, message.error, rec.projectName.toLowerCase, remoteStacks.find, s.name.toLowerCase, scanEnvVarsFromYaml, setCurrentRecordId, setEditorOpen, setEnvVars, setForcePull, setItems, setLoading, setProjectName, setRecreate, setYamlContent, useCallback, useEffect, useMemo, useState]
export function openCreateDrawer() { ... }

// 打开编辑抽屉
// Calls: [for, if, item.services.map, join, setCurrentRecordId, setEditorOpen, setEnvVars, setForcePull, setProjectName, setRecreate, setYamlContent]
export function openEditDrawer(item: MergedComposeItem) { ... }

// 类似 docker compose up：智能增量更新，并在实例部署成功后保存本地记录
// Calls: [API.dockerUpComposeStack, AntModal.error, catch, fetchData, for, hideLoading, if, message.loading, message.success, message.warning, projectName.trim, replace, setEditorOpen, setUpdating, toLowerCase, var, yamlContent.trim]
export async function handleUpAndUpdate() { ... }

// 强力联动删除：清理远程容器与网络，并移除本地记录
// Calls: [API.dockerControlComposeStack, API.dockerDeleteComposeRecord, catch, fetchData, hide, if, message.error, message.loading, message.success]
export async function handleDelete(item: MergedComposeItem) { ... }

// 控制操作（start, stop, restart, down）
// Calls: [API.dockerControlComposeStack, action.toUpperCase, catch, fetchData, hide, message.error, message.loading, message.success]
export async function handleControl(name: string, action: string) { ... }

// 单个服务容器控制（启动、停止、重启）
// Calls: [API.dockerControlContainer, action.toUpperCase, catch, fetchData, hide, message.error, message.loading, message.success]
export async function handleContainerControl(containerId: string, action: string) { ... }

// 打开单个服务容器日志抽屉
// Calls: [fetchContainerLogs, setContainerLogContent, setContainerLogDrawer]
export function openContainerLogs(svc: DockerComposeServiceInfo) { ... }

// Calls: [message.success, navigator.clipboard.writeText, setCopiedId]
export function copyUUID(uuid: string) { ... }

// Calls: [API.dockerListContainers, catch, message.error, setContainers, setLoading, useState]
export async function fetchContainers() { ... }

// Calls: [API.dockerControlContainer, catch, fetchContainers, message.error]
export async function handleControl(containerId: string, action: string) { ... }

// Calls: [fetchLogs, setLogDrawer]
export async function openLogs(c: DockerContainerInfo) { ... }

// Calls: [API.dockerGetContainerLogs, catch, setLogContent, setLogLoading]
export async function fetchLogs(id: string, tail: number, timestamps: boolean) { ... }

// Calls: [API.dockerInspectContainer, catch, message.error, setInspectModal]
export async function openInspect(c: DockerContainerInfo) { ... }

// Calls: [API.dockerCreateContainer, catch, createForm.image.trim, createForm.name.trim, e.trim, fetchContainers, filter, if, message.error, message.warning, p.trim, setCreateForm, setCreateModal, setCreating, v.trim]
export async function handleCreateSubmit() { ... }

// Calls: [API.dockerGetOverview, catch, if, message.error, performance.now, setLoading, setOverview, setPingLatency, useSession, useState]
export async function fetchOverview(quiet = false) { ... }

// Calls: [setActiveTab]
export function handleRunImage(imageName: string) { ... }

// Calls: [if, prev.trim, setPrompt, trimmed.endsWith]
export function handleAddChip(chip: string) { ... }

// Calls: [API.dockerGenerateCompose, Error, catch, if, message.error, message.success, onClose, onGenerated, prompt.trim, resultYaml.trim, setLoading]
export async function handleGenerate() { ... }

// Calls: [API.dockerListImages, catch, message.error, setImages, setLoading, useState]
export async function fetchImages() { ... }

// Calls: [API.dockerPullImage, catch, fetchImages, if, message.error, message.warning, pullImageName.trim, setPullLogs, setPulling]
export async function handlePull() { ... }

// Calls: [API.dockerSaveImage, catch, hide, if, message.error, message.loading, replace, setSavingId]
export async function handleSaveImage(img: DockerImageInfo) { ... }

// Calls: [API.dockerLoadImage, catch, fetchImages, hide, if, message.error, message.loading, setImporting]
export async function handleLoadImage() { ... }

// Calls: [API.dockerRemoveImage, catch, fetchImages, message.error]
export async function handleDelete(imageId: string, force: boolean) { ... }

// Calls: [API.dockerInspectImage, catch, message.error, setInspectModal]
export async function openInspect(img: DockerImageInfo) { ... }

// Calls: [Date, if, toLocaleString]
export function formatDate(timestamp: number) { ... }

// Calls: [API.dockerListNetworks, catch, message.error, setLoading, setNetworks, useState]
export async function fetchNetworks() { ... }

// Calls: [API.dockerCreateNetwork, catch, fetchNetworks, if, message.error, message.warning, netDriver.trim, netName.trim, setCreateModal, setCreating, setNetName]
export async function handleCreate() { ... }

// Calls: [API.dockerRemoveNetwork, catch, fetchNetworks, message.error]
export async function handleDelete(id: string) { ... }

// Calls: [API.dockerSystemPrune, catch, message.error, message.success, onRefresh, setPruneReport, setPruning, useState]
export async function handlePrune() { ... }

// Calls: [gb.toFixed, if]
export function formatMem(bytes: number) { ... }

// Calls: [API.dockerListVolumes, catch, message.error, setLoading, setVolumes, useState]
export async function fetchVolumes() { ... }

// Calls: [API.dockerCreateVolume, catch, fetchVolumes, if, message.error, message.warning, setCreateModal, setCreating, setVolName, volDriver.trim, volName.trim]
export async function handleCreate() { ... }

// Calls: [API.dockerRemoveVolume, catch, fetchVolumes, message.error]
export async function handleDelete(name: string) { ... }

```

---

### TypeScript Module `k8s` (`frontend/src/pages/k8s`)

- **Imports (19):** `./ConfigStorageTab`, `./DeploymentsTab`, `./K8sClient.module.less`, `./K8sResourceYamlModal`, `./K8sYamlGenerateModal`, `./NetworkTab`, `./OverviewTab`, `./PodsTab`, `./YamlTab`, `@/api`, `@/components/ClientIcon`, `@/components/CodeEditor`, `@/components/common/ContainerTerminalModal`, `@/types`, `@/utils`, `antd`, `antd/es/table`, `lucide-react`, `react`

```typescript
export interface Props {
	...
}

export interface Props {
	...
}

export interface Props {
	...
}

export interface Props {
	...
}

export interface Props {
	...
}

export interface Props {
	...
}

export interface Props {
	...
}

export interface Props {
	...
}

export interface Props {
	...
}

export function DEFAULT_CONFIGMAP_TEMPLATE(namespace: string) { ... }

export function DEFAULT_SECRET_TEMPLATE(namespace: string) { ... }

export function DEFAULT_PVC_TEMPLATE(namespace: string) { ... }

// Calls: [API.k8sListConfigMaps, API.k8sListPVCs, API.k8sListSecrets, catch, if, message.error, setConfigMaps, setLoading, setPage, setPvcs, setSearchKw, setSecrets, setSubTab, useEffect, useState]
export async function fetchData() { ... }

// Calls: [API.k8sDeleteConfigMap, catch, fetchData, message.error]
export async function handleDeleteConfigMap(record: K8sConfigMapInfo) { ... }

// Calls: [API.k8sDeleteSecret, catch, fetchData, message.error]
export async function handleDeleteSecret(record: K8sSecretInfo) { ... }

// Calls: [API.k8sDeletePVC, catch, fetchData, message.error]
export async function handleDeletePVC(record: K8sPVCInfo) { ... }

// Calls: [setYamlKind, setYamlModalOpen, setYamlMode, setYamlTarget]
export function openEditYaml(kind: 'ConfigMap' | 'Secret' | 'PersistentVolumeClaim', namespace: string, name: string) { ... }

// Calls: [setYamlKind, setYamlModalOpen, setYamlMode, setYamlTarget]
export function openCreateYaml(kind: 'ConfigMap' | 'Secret' | 'PersistentVolumeClaim') { ... }

// Calls: [if]
export function getResourceKindName() { ... }

export function DEFAULT_DEPLOY_TEMPLATE(namespace: string) { ... }

// Calls: [API.k8sListDeployments, catch, if, message.error, setDeployments, setLoading, setPage, setSearchKw, useEffect, useState]
export async function fetchDeployments() { ... }

// Calls: [API.k8sScaleDeployment, catch, fetchDeployments, if, message.error, setScaleLoading, setScaleModalOpen]
export async function handleScale() { ... }

// Calls: [API.k8sRestartDeployment, catch, fetchDeployments, message.error]
export async function handleRestart(record: K8sDeploymentInfo) { ... }

// Calls: [API.k8sDeleteDeployment, catch, fetchDeployments, message.error]
export async function handleDeleteDeployment(record: K8sDeploymentInfo) { ... }

// Calls: [setYamlModalOpen, setYamlMode, setYamlTarget]
export function openEditYaml(record: K8sDeploymentInfo) { ... }

// Calls: [setYamlModalOpen, setYamlMode, setYamlTarget]
export function openCreateYaml() { ... }

// Calls: [if, includes, setActiveTab, setCurrentNamespace, setTargetFilters, toLowerCase, trim, useState]
export function handleNavigateToResource(kind: string, name: string, targetNamespace?: string) { ... }

// Calls: [API.k8sGetOverview, API.k8sListNamespaces, catch, message.error, performance.now, setLoading, setNamespaces, setOverview, setPingMs]
export async function fetchOverviewAndNs() { ... }

// Calls: [API.k8sCreateNamespace, catch, fetchOverviewAndNs, if, message.error, message.warning, newNsName.trim, setCreateNsLoading, setCreateNsModalOpen, setCurrentNamespace, setNewNsName]
export async function handleCreateNamespace() { ... }

// Calls: [API.k8sDeleteNamespace, catch, fetchOverviewAndNs, if, message.error, setCurrentNamespace]
export async function handleDeleteCurrentNamespace() { ... }

export function isSystemNs(ns: string) { ... }

// Calls: [API.k8sApplyYAML, Error, catch, content.trim, failures.map, if, join, map, message.error, message.success, message.warning, onClose, results.filter, setSaving, successes.map]
export async function handleSaveAndApply() { ... }

// Calls: [API.k8sGenerateYAML, Error, catch, if, message.error, message.warning, namespace.trim, onClose, onGenerated, resultYaml.trim, setLoading]
export async function handleGenerate() { ... }

export function DEFAULT_SERVICE_TEMPLATE(namespace: string) { ... }

export function DEFAULT_INGRESS_TEMPLATE(namespace: string) { ... }

// Calls: [API.k8sListIngresses, API.k8sListServices, catch, if, message.error, setIngresses, setLoading, setPage, setSearchKw, setServices, setSubTab, useEffect, useState]
export async function fetchData() { ... }

// Calls: [API.k8sDeleteService, catch, fetchData, message.error]
export async function handleDeleteService(record: K8sServiceInfo) { ... }

// Calls: [API.k8sDeleteIngress, catch, fetchData, message.error]
export async function handleDeleteIngress(record: K8sIngressInfo) { ... }

// Calls: [setYamlKind, setYamlModalOpen, setYamlMode, setYamlTarget]
export function openEditYaml(kind: 'Service' | 'Ingress', namespace: string, name: string) { ... }

// Calls: [setYamlKind, setYamlModalOpen, setYamlMode, setYamlTarget]
export function openCreateYaml(kind: 'Service' | 'Ingress') { ... }

// Calls: [API.k8sListNodes, catch, message.error, setNodeLoading, setNodes, useState]
export async function fetchNodes() { ... }

// Calls: [if, setPage, setSearchKw, setTermModalOpen, setTermTarget, useEffect, useState]
export function openTerminalModal(pod: K8sPodInfo, container: K8sContainerSummary) { ... }

// Calls: [API.k8sGetPodLogs, catch, message.error, setLogsContent, setLogsLoading]
export async function fetchLogs(pod: K8sPodInfo, container?: string) { ... }

// Calls: [fetchLogs, setActivePod, setLogsDrawerOpen, setSelectedContainer]
export function openLogsDrawer(pod: K8sPodInfo, containerName?: string) { ... }

// Calls: [setYamlModalOpen, setYamlMode, setYamlTarget]
export function openEditYaml(pod: K8sPodInfo) { ... }

// Calls: [setYamlModalOpen, setYamlMode, setYamlTarget]
export function openCreateYaml() { ... }

// Calls: [API.k8sDeletePod, catch, fetchPods, message.error]
export async function handleDeletePod(pod: K8sPodInfo) { ... }

export function DEFAULT_ORCHESTRATION_TEMPLATE(namespace: string) { ... }

// Calls: [API.k8sListOrchestrationRecords, catch, message.error, setLoading, setRecords, useState]
export async function fetchRecords() { ... }

// 打开新建抽屉
// Calls: [DEFAULT_ORCHESTRATION_TEMPLATE, setCurrentRecord, setDrawerOpen, setFormName, setFormYaml]
export function handleOpenCreateDrawer() { ... }

// 打开编辑抽屉
// Calls: [setCurrentRecord, setDrawerOpen, setFormName, setFormYaml]
export function handleOpenEditDrawer(rec: K8sOrchestrationRecord) { ... }

// 部署并保存到本地（强一致性：后验落盘）
// Calls: [API.k8sApplyOrchestration, catch, failures.map, fetchRecords, formName.trim, formYaml.trim, if, join, message.error, message.success, message.warning, results.filter, setDrawerOpen, setSaving]
export async function handleSaveAndApply() { ... }

// 列表行一键部署
// Calls: [API.k8sApplyOrchestration, catch, failures.map, fetchRecords, filter, if, join, message.error, message.success, message.warning, setDeployingId]
export async function handleRowDeploy(rec: K8sOrchestrationRecord) { ... }

// 打开下线确认弹窗
// Calls: [setOfflineModal]
export function handleOpenOfflineModal(rec: K8sOrchestrationRecord) { ... }

// 确认下线集群资源
// Calls: [API.k8sOfflineOrchestration, catch, failures.map, fetchRecords, filter, if, join, message.error, message.success, message.warning, setOfflineModal]
export async function handleConfirmOffline() { ... }

// 仅删除本地记录（不下线集群资源）
// Calls: [API.k8sDeleteOrchestrationRecordOnly, catch, fetchRecords, message.error, message.success]
export async function handleDeleteRecordOnly(rec: K8sOrchestrationRecord) { ... }

// 资源 Kind 渲染对应图标
// Calls: [if, includes, toLowerCase]
export function renderKindIcon(kind: string) { ... }

```

---

### TypeScript Module `mongo` (`frontend/src/pages/mongo`)

- **Imports (28):** `./ChangeStreamTab`, `./DataTab`, `./DataTab.module.less`, `./IndexesTab`, `./IoModal`, `./MongoClient.module.less`, `./MqlEditor`, `./MqlEditor.module.less`, `./ObjModal`, `./SchemaTab`, `./StatusPanel`, `./StatusPanel.module.less`, `./mongoTypes`, `@/api`, `@/components/ClientIcon`, `@/components/CodeEditor`, `@/components/ColumnFilterPopover`, `@/components/Modal`, `@/components/ResizableTable`, `@/components/common/TabBar`, `@/components/common/Tree`, `@/pages/mongo/mongoShared.module.less`, `@/types`, `@/utils`, `@/utils/sqlExport`, `antd`, `lucide-react`, `react`

```typescript
export interface Props {
	...
}

export interface Props {
	...
}

export interface Props {
	...
}

export interface Props {
	...
}

export interface Props {
	...
}

export interface Props {
	...
}

export interface Props {
	...
}

export interface Props {
	...
}

export interface Props {
	...
}

export interface ParsedCurrentOp {
	...
}

export interface MongoTabItem {
	...
}

export type MongoExportFormat = 'json' | 'extended-json' | 'csv';

export type MongoExportScope = 'current' | 'all';

// MongoDB 子组件共享的工具与类型
export type MongoTabKey = 'documents' | 'aggregate' | 'indexes' | 'schema' | 'monitor' | 'stream';

export type MongoTabType = 'status' | 'query' | 'data';

export function pretty(text: string): string { ... }

// Calls: [if, subRef.current, useState]
export function clearSub() { ... }

// 单元格格式化与渲染
// Calls: [API.mongoFind, Array, Array.from, async, buildMongoFilterFromColumnFilters, calcColWidthFromName, catch, docs.map, dynamicColumns.map, e.stopPropagation, errorMessage, filterText.trim, for, forEach, if, isNaN, keySet.add, keys.indexOf, keys.splice, keys.unshift, parsedRows.forEach, preview.slice, projectionText.trim, return, runQuery, setBusy, setCellModal, setCellModalError, setDocs, setDuration, setError, setFilters, setPage, setTotal, sortText.trim, switch, trim, useCallback, useEffect, useMemo, useRef, useState]
export function renderCellContent(val: any, row?: any, colKey?: string) { ... }

// 保存单元格字段在线修改 ($set)
// Calls: [API.mongoUpdateOne, catch, errorMessage, if, message.success, runQuery, setCellModal, setCellModalBusy, setCellModalError]
export async function handleSaveCellModal() { ... }

// 增删改操作
// Calls: [API.mongoDeleteOne, async, catch, errorMessage, if, message.error, message.success, runQuery, setConfirm]
export function deleteDoc(raw: string) { ... }

// Calls: [setEditOpen, setEditorError, setEditorText]
export function openInsert() { ... }

// Calls: [setEditOpen, setEditorError, setEditorText]
export function openUpdate(raw: string) { ... }

// Calls: [setEditOpen, setEditorError, setEditorText]
export function openReplace(raw: string) { ... }

// Calls: [API.mongoInsertOne, API.mongoReplaceOne, API.mongoUpdateOne, catch, errorMessage, if, message.success, runQuery, setEditOpen, setEditorBusy, setEditorError]
export async function handleSaveDocModal() { ... }

// 清空集合（Truncate）
// Calls: [API.mongoDeleteMany, async, catch, errorMessage, message.error, message.success, runQuery, setConfirm]
export function truncateCollection() { ... }

// 统计弹窗
// Calls: [API.mongoCollectionStats, catch, errorMessage, message.error, setStats, setStatsBusy, setStatsModalOpen]
export async function openStats() { ... }

// 右键上下文菜单项
// Calls: [API.mongoInsertOne, _id, async, catch, copyTextToClipboard, deleteDoc, errorMessage, if, message.error, message.success, openReplace, openUpdate, runQuery]
export function getContextMenuItems(): MenuProps['items'] { ... }

// Calls: [API.mongoDropIndex, API.mongoIndexStats, API.mongoIndexes, async, catch, errorMessage, if, load, message.error, message.success, setBusy, setConfirm, setError, setIndexes, setStats, useCallback, useEffect, useState]
export function drop(idxName: string) { ... }

// Calls: [API.mongoCreateIndex, catch, errorMessage, load, setCreateBusy, setCreateMsg, setKeys, setName, setShowCreate, setSparse, setTtl, setUnique]
export async function create() { ... }

// Calls: [Array.from, docs.forEach, forEach, headerSet.add, headers.indexOf, headers.splice, headers.unshift, if, s.includes, s.replace]
export function escapeCsv(val: any): string { ... }

// Calls: [downloadText, useState]
export function triggerDownload(content: string, ext: string) { ... }

// Calls: [API.mongoFind, filter.trim, if]
export async function fetchExportDocs(): Promise<string[]> { ... }

// Calls: [catch, convertDocsToCsv, copyTextToClipboard, errorMessage, fetchExportDocs, if, join, message.success, message.warning, onClose, parsed.map, rawDocs.map, setBusy, setError, triggerDownload]
export async function handleExport(action: 'download' | 'copy') { ... }

// Calls: [API.mongoCollections, API.mongoDatabases, async, catch, if, setCollectionsMap, setDatabases, setLoadingDbs, setLoadingTree, useCallback, useRef, useState]
export function dbNames(dbs || []).map((d) { ... }

// 打开集合数据 Tab
// Calls: [if, setActiveTabKey, setTabs, tabs.findIndex]
export function openCollectionTab(dbName: string, collName: string, subTab?: 'documents' | 'indexes' | 'schema' | 'stream') { ... }

// 新增 MQL 编辑器 Tab
// Calls: [Date.now, setActiveTabKey, setTabs, tabs.filter]
export function handleNewMqlTab() { ... }

// 关闭 Tab
// Calls: [if, setActiveTabKey, setTabs, tabs.filter, tabs.findIndex]
export function handleCloseTab(targetKey: string) { ... }

// Calls: [if, setActiveTabKey, setTabs, tabs.filter]
export function handleCloseAllTabs() { ... }

// Calls: [if, nextTabs.some, setActiveTabKey, setTabs, tabs.filter, tabs.findIndex]
export function handleCloseLeftTabs(targetKey: string) { ... }

// Calls: [if, nextTabs.some, setActiveTabKey, setTabs, tabs.filter, tabs.findIndex]
export function handleCloseRightTabs(targetKey: string) { ... }

// 弹窗确认操作
// Calls: [API.mongoCreateCollection, API.mongoCreateDatabase, API.mongoDeleteMany, API.mongoDropCollection, API.mongoDropDatabase, API.mongoRenameCollection, API.mongoRunCommand, catch, handleCloseTab, if, initConnection, loadCollections, message.success, openCollectionTab, setObjBusy, setObjModal, setObjMsg, switch]
export async function handleObjConfirm(extra?: { capped?: boolean; size?: number; max?: number; firstColl?: string }) { ... }

// 数据库右键菜单
// Calls: [setObjDb, setObjModal, setObjName]
export function getDbMenuItems(dbName: string): MenuProps['items'] { ... }

// 集合右键菜单
// Calls: [openCollectionTab]
export function getCollMenuItems(dbName: string, collName: string): MenuProps['items'] { ... }

// 格式化当前输入的 JSON
// Calls: [if, message.success, message.warning, setCode, setDb, setSelectedColl, useEffect, useMemo, useState]
export function formatCode() { ... }

// 执行 Explain 执行计划
// Calls: [API.mongoRunCommand, Date.now, catch, code.trim, errorMessage, if, setBusy, setDuration, setError, setExplainText, setResultMode]
export async function handleExplain() { ... }

// Calls: [firstColl.trim, if, includes, onConfirm, useState]
export function handleOk() { ... }

// Calls: [API.mongoGetValidator, API.mongoInferSchema, API.mongoSetValidator, async, catch, errorMessage, if, infer, loadValidator, message.success, setAction, setBusy, setError, setFields, setLevel, setValidator, setValidatorBusy, setValidatorMsg, useCallback, useEffect, useState]
export async function applyValidator() { ... }

// Calls: [API.mongoValidateDocument, catch, errorMessage, setCheckBusy, setCheckResult]
export async function validateDoc() { ... }

// Calls: [Math.log, Math.pow, if, isNaN, toFixed]
export function fmtBytes(bytes: number): string { ... }

// Calls: [if, isNaN, toFixed]
export function fmtMb(mb?: number): string { ... }

// 终止指定活动操作
// Calls: [API.mongoClientStats, API.mongoCurrentOps, API.mongoHealthCheck, API.mongoRunCommand, API.mongoServerStatus, async, catch, errorMessage, if, loadData, message.error, message.success, rawOps.map, setBusy, setClient, setError, setHealth, setKillingOp, setRawOps, setStatus, useCallback, useEffect, useMemo, useState]
export async function handleKillOp(opid: string | number) { ... }

// Calls: [for, if, list.push, walk]
export function walk(obj: any, prefix = '', section = '') { ... }

// 美化 Extended JSON 字符串（已是 JSON，直接格式化）
// Calls: [if]
export function prettyJSON(text: string): string { ... }

// 把文档数组（Extended JSON 字符串数组）转为可点击查看的对象数组
// Calls: [map, return]
export function parseDocs(docs: string[]): Array< { ... }

// 取文档的某个顶层字段用于摘要展示
// Calls: [if]
export function docSummary(obj: any): string { ... }

```

---

### TypeScript Module `mqtt` (`frontend/src/pages/mqtt`)

- **Imports (6):** `@/api`, `@/components/CodeEditor`, `@/pages/mqtt/MqttClient.module.less`, `@/types`, `@/utils`, `react`

```typescript
export interface Props {
	...
}

// Calls: [Date, d.getHours, d.getMilliseconds, d.getMinutes, d.getSeconds, p, padStart]
export function p(n: number) { ... }

// Calls: [Math.abs, for, topic.charCodeAt]
export function getTopicColor(topic: string) { ... }

// Actions
// Calls: [API.mqttSubscribe, API.mqttSubscriptions, Date.now, async, bottomRef.current.scrollIntoView, cancelAnimationFrame, catch, errorMessage, filteredMessages.slice, flushMessages, if, includes, messages.filter, messages.forEach, msg.payload.toLowerCase, msg.topic.toLowerCase, msgBufferRef.current.push, next.slice, offMsg, offStatus, prev.concat, reloadSubs, requestAnimationFrame, return, searchKeyword.toLowerCase, searchKeyword.trim, setBusy, setError, setMessages, setShowAddSub, setStatus, setSubTopic, setSubs, subTopic.trim, subscribe, useCallback, useEffect, useMemo, useRef, useState]
export async function doSubscribe() { ... }

// Calls: [API.mqttUnsubscribe, catch, errorMessage, if, reloadSubs, setBusy, setError, setFilterTopic]
export async function doUnsubscribe(topic: string) { ... }

// Calls: [API.mqttPublish, Date.now, catch, errorMessage, if, next.slice, prev.concat, pubTopic.trim, setBusy, setError, setMessages]
export async function doPublish() { ... }

// JSON Formatters
// Calls: [catch, setError, setPubPayload]
export function beautifyJson() { ... }

// Calls: [catch, setError, setPubPayload]
export function minifyJson() { ... }

// Calls: [navigator.clipboard.writeText, setCopiedId]
export function copyPayload(payload: string, id: string) { ... }

// Calls: [if, setPubPayload, setPubTopic, setPublishDockExpanded]
export function fillToPublish(topic: string, payload?: string) { ... }

```

---

### TypeScript Module `mysql` (`frontend/src/pages/mysql`)

- **Imports (35):** `./ChangePasswordModal`, `./CreateUserModal`, `./ErDiagram`, `./GrantPrivilegesModal`, `./IoModal`, `./MysqlClient.module.less`, `./ObjModal`, `./StatusCard.module.less`, `./StatusPanel`, `./StatusPanel.module.less`, `./UsersPanel`, `./UsersPanel.module.less`, `./mysqlShared.module.less`, `./mysqlTypes`, `@/api`, `@/components/ClientIcon`, `@/components/CodeEditor`, `@/components/Modal`, `@/components/common/TabBar`, `@/components/common/Tree`, `@/components/db/DataTab`, `@/components/db/SqlEditor`, `@/components/db/adapters`, `@/contexts/SessionContext`, `@/pages/mysql/ErDiagram.module.less`, `@/pages/mysql/StatusCard`, `@/pages/mysql/dbTable.module.less`, `@/pages/mysql/mysqlShared.module.less`, `@/pages/mysql/mysqlTypes`, `@/types`, `@/utils`, `@codemirror/lang-sql`, `antd`, `lucide-react`, `react`

```typescript
export interface Props {
	...
}

export interface Props {
	...
}

export interface Props {
	...
}

export interface ExportOptions {
	...
}

export interface ImportOptions {
	...
}

export interface Props {
	...
}

export interface TableStatusItem {
	...
}

export interface Props {
	...
}

export interface Props {
	...
}

export interface MysqlTabItem {
	...
}

export interface SqlTab {
	...
}

export interface CellEdit {
	...
}

export interface Schema {
	...
}

// ---- 元数据类型 ----
export interface MysqlColumn {
	...
}

export interface MysqlIndex {
	...
}

export interface MysqlConstraint {
	...
}

export interface MysqlTableMeta {
	...
}

export type ObjModalKind = 'createdb' | 'createtable' | 'dropdb' | 'droptable' | 'truncate' | 'createindex' | 'dropindex';

// ---- 标签页体系 ----
export type MysqlTabType = 'status' | 'sql' | 'data' | 'users' | 'er';

// 兼容旧类型
export type TabKey = MysqlTabType | 'structure';

export type RowDrafts = Record<number, Record<string, any>>;

export type NewRow = Record<string, any>;

// Calls: [Math.random, chars.charAt, for, form.setFieldsValue]
export function generateRandomPassword() { ... }

// Calls: [API.mysqlChangeUserPassword, catch, errorMessage, form.resetFields, form.validateFields, if, onClose, onSuccess, setBusy, setError]
export async function handleOk() { ... }

// Calls: [Math.random, chars.charAt, for, form.setFieldsValue, setPassword]
export function generateRandomPassword() { ... }

// Calls: [API.mysqlCreateUser, API.mysqlGrantPrivileges, catch, errorMessage, form.resetFields, form.validateFields, if, onClose, onSuccess, setBusy, setError, trim, values.user.trim]
export async function handleOk() { ... }

// Calls: [if, setIsFullscreen]
export function handleKeyDown(e: KeyboardEvent) { ... }

// Calls: [if, setIsDragging]
export function handleMouseDown(e: React.MouseEvent) { ... }

// Calls: [if, setViewState]
export function handleMouseMove(e: React.MouseEvent) { ... }

// Calls: [e.preventDefault, elem.getBoundingClientRect, if, setViewState, toFixed, useEffect]
export function onWheel(e: WheelEvent) { ... }

// Apply Preset templates
// Calls: [if, setCheckedPrivs]
export function applyPreset(type: 'readonly' | 'readwrite' | 'structure' | 'all') { ... }

// Calls: [if, prev.filter, prev.includes, setCheckedPrivs, withoutAll.filter, withoutAll.includes]
export function togglePriv(priv: string) { ... }

// Calls: [Array.from, Set, category.forEach, if, prev.filter, set.add, set.delete, setCheckedPrivs]
export function selectCategory(category: string[], select: boolean) { ... }

// Calls: [API.mysqlGrantPrivileges, catch, errorMessage, if, onClose, onSuccess, setBusy, setError]
export async function handleOk() { ... }

// Calls: [if, onExport, onImport, tableName.trim]
export function handleOk() { ... }

// 加载指定数据库下的表与视图
// Calls: [API.mysqlConnect, API.mysqlDatabases, API.mysqlTableStatus, API.mysqlTables, async, catch, dbs.includes, if, initConnection, loadTables, map, message.error, setCurrentDb, setDatabases, setExpandedKeys, setIsReady, setLoadingDbs, setLoadingTree, setTablesMap, statusList.forEach, useCallback, useEffect, useState]
export async function loadTables(dbName: string) { ... }

// 打开数据表 Tab
// Calls: [if, setActiveTabKey, setTabs, tabs.find]
export function openTableTab(dbName: string, table: string) { ... }

// 打开 ER 关系图 Tab
// Calls: [API.mysqlSchema, catch, if, setActiveTabKey, setSchemaMap, setTabs, tabs.find]
export async function openErTab(dbName: string) { ... }

// 打开用户权限 Tab
// Calls: [if, setActiveTabKey, setTabs, tabs.find]
export function openUsersTab() { ... }

// 关闭单个 Tab
// Calls: [if, setActiveTabKey, setTabs, tabs.filter, tabs.find, tabs.findIndex]
export function handleCloseTab(key: string) { ... }

// 全部关闭
// Calls: [if, setActiveTabKey, setTabs, tabs.filter]
export function handleCloseAllTabs() { ... }

// 关闭左侧
// Calls: [if, nextTabs.some, setActiveTabKey, setTabs, tabs.filter, tabs.findIndex]
export function handleCloseLeftTabs(targetKey: string) { ... }

// 关闭右侧
// Calls: [if, nextTabs.some, setActiveTabKey, setTabs, tabs.filter, tabs.findIndex]
export function handleCloseRightTabs(targetKey: string) { ... }

// 删除数据库
// Calls: [API.mysqlDropDatabase, async, catch, initConnection, message.error, setConfirm]
export async function handleDropDb(dbName: string) { ... }

// 删除表
// Calls: [API.mysqlDropTable, async, catch, handleCloseTab, loadTables, message.error, setConfirm]
export async function handleDropTable(dbName: string, table: string) { ... }

// 清空表
// Calls: [API.mysqlTruncateTable, async, catch, loadTables, message.error, setConfirm]
export async function handleTruncateTable(dbName: string, table: string) { ... }

// 备份数据库
// Calls: [API.mysqlBackupToFile, catch, if, message.error, message.info, message.loading, message.success]
export async function handleBackupDb(dbName: string) { ... }

// 弹窗确认操作 (创建库/表等)
// Calls: [API.mysqlCreateDatabase, API.mysqlCreateTable, catch, if, initConnection, loadTables, openTableTab, setObjBusy, setObjModal, setObjMsg, switch]
export async function doObjAction() { ... }

// 导入 / 导出
// Calls: [API.mysqlExportToFile, catch, if, message.success, setIoBusy, setIoModal, setIoMsg]
export async function doExport(o: ExportOptions) { ... }

// Calls: [API.mysqlImportFromFile, catch, if, loadTables, message.success, setIoBusy, setIoModal, setIoMsg]
export async function doImport(o: ImportOptions) { ... }

// Calls: [API.mysqlGrants, catch, setGrants, setSelUser]
export async function viewGrants(user: string, host: string) { ... }

// 数据库右键菜单
// Calls: [setCurrentDb, setObjExtra, setObjModal, setObjName]
export function getDbMenuItems(dbName: string): MenuProps['items'] { ... }

// 表右键菜单
// Calls: [openTableTab]
export function getTableMenuItems(dbName: string, tableName: string): MenuProps['items'] { ... }

// Calls: [if, isNaN]
export function formatUptime(seconds: number): string { ... }

// Calls: [navigator.clipboard.writeText, setCopiedKey]
export async function copyText(key: string, text: string) { ... }

// Calls: [API.mysqlRun, Modal.confirm, async, catch, errorMessage, if, message.error, message.success, onRefresh, setKillingId]
export function killProcess(id: any) { ... }

// Calls: [message.success]
export function notify(msg: string) { ... }

// Calls: [message.error]
export function notifyError(msg: string) { ... }

// Calls: [if, navigator.clipboard.writeText, notify, setCopied]
export async function handleCopyAll() { ... }

// Calls: [navigator.clipboard.writeText, notify, setCopiedIdx]
export async function handleCopyCard(text: string, idx: number) { ... }

// Calls: [if, onRefreshGrants, onRefreshUsers, setRefreshing]
export async function handleRefresh() { ... }

// Toggle user lock
// Calls: [API.mysqlToggleUserLock, Modal.confirm, async, catch, errorMessage, notify, notifyError, onRefreshUsers]
export function handleToggleLock(targetUser: string, targetHost: string, currentLocked: boolean) { ... }

// Drop user
// Calls: [API.mysqlDropUser, Modal.confirm, async, catch, errorMessage, if, notify, notifyError, onRefreshUsers, onSelect]
export function handleDropUser(targetUser: string, targetHost: string) { ... }

// Revoke all privileges
// Calls: [API.mysqlRevokeAllPrivileges, Modal.confirm, async, catch, errorMessage, if, notify, notifyError, onRefreshGrants]
export function handleRevokeAll(targetUser: string, targetHost: string) { ... }

// Revoke a single grant rule
// Calls: [API.mysqlRun, Modal.confirm, async, catch, errorMessage, if, notify, notifyError, onRefreshGrants, revokeSql.lastIndexOf, revokeSql.substring, stmt.replace, stmt.startsWith, var]
export function handleRevokeSingleGrant(stmt: string, targetUser: string, targetHost: string) { ... }

// Calls: [sql]
export function sqlExtension() { ... }

// ---- 共享展示组件 ----
// Calls: [if]
export function formatCell(v: any) { ... }

// Calls: [columns.map, formatCell, if, return, rows.map]
export function Grid({ columns, rows }: { columns: string[]; rows: Record<string, any>[] }) { ... }

```

---

### TypeScript Module `postgres` (`frontend/src/pages/postgres`)

- **Imports (24):** `./ErDiagram`, `./ErDiagram.module.less`, `./FunctionsPanel`, `./IoModal`, `./ObjModal`, `./PostgresClient.module.less`, `./RolesPanel`, `./RolesPanel.module.less`, `./StatusPanel`, `./StatusPanel.module.less`, `./postgresTypes`, `@/api`, `@/components/ClientIcon`, `@/components/CodeEditor`, `@/components/common/TabBar`, `@/components/common/Tree`, `@/components/db/DataTab`, `@/components/db/SqlEditor`, `@/components/db/adapters`, `@/contexts/SessionContext`, `@/types`, `antd`, `lucide-react`, `react`

```typescript
export interface TableMeta {
	...
}

export interface Props {
	...
}

export interface PgDatabase {
	...
}

export interface PgSchema {
	...
}

export interface PgTable {
	...
}

export interface PgColumn {
	...
}

export interface PgIndex {
	...
}

export interface PgConstraint {
	...
}

export interface PgSequence {
	...
}

export interface PgFunction {
	...
}

export interface PgSession {
	...
}

export interface PgRole {
	...
}

export interface PgStatus {
	...
}

export interface PgQueryResult {
	...
}

export interface PostgresTabItem {
	...
}

// Calls: [API.postgresDescribe, API.postgresTables, async, catch, filter, map, message.error, setLoading, setTablesMeta, slice]
export async function loadSchemaMeta() { ... }

// Calls: [setIsDragging]
export function handleMouseDown(e: React.MouseEvent) { ... }

// Calls: [if, setPan]
export function handleMouseMove(e: React.MouseEvent) { ... }

// Calls: [setIsDragging]
export function handleMouseUp() { ... }

// Calls: [API.postgresFunctions, catch, message.error, setFuncs, setLoading]
export async function loadFunctions() { ... }

// Calls: [API.postgresRun, catch, defContent.trim, if, loadFunctions, message.error, setEditingFunc, setSaving]
export async function handleSaveDef() { ... }

// Calls: [API.postgresExportToFile, catch, if, message.error, message.success, onClose, setLoading]
export async function handleExport() { ... }

// Calls: [API.postgresImportFromFile, catch, if, message.error, message.success, onClose, onSuccess, setLoading]
export async function handleImportFile() { ... }

// Calls: [API.postgresCreateDatabase, catch, form.resetFields, form.validateFields, message.error, onClose, onSuccess, setLoading, vals.name.trim]
export async function handleCreate() { ... }

// Calls: [API.postgresCreateSchema, catch, form.resetFields, form.validateFields, message.error, onClose, onSuccess, setLoading, vals.name.trim]
export async function handleCreate() { ... }

// Calls: [API.postgresCreateTable, catch, defs.trim, if, message.error, message.warning, onClose, onSuccess, setLoading, setTableName, tableName.trim]
export async function handleCreate() { ... }

// 加载指定数据库下的 Schemas
// Calls: [API.postgresConnect, API.postgresDatabases, API.postgresSchemas, async, catch, if, initConnection, loadSchemas, loadTables, message.error, setCurrentDb, setDatabases, setExpandedKeys, setLoadingDbs, setLoadingTree, setSchemasMap, useCallback, useEffect, useState]
export async function loadSchemas(dbName: string) { ... }

// 加载指定 Schema 下的表
// Calls: [API.postgresTables, catch, setLoadingSchemas, setTablesMap]
export async function loadTables(dbName: string, schemaName: string) { ... }

// 打开数据表 Tab
// Calls: [if, setActiveTabKey, setTabs, tabs.find]
export function openTableTab(dbName: string, schema: string, table: string) { ... }

// 打开 ER 关系图 Tab
// Calls: [if, setActiveTabKey, setTabs, tabs.find]
export function openErTab(dbName: string, schema: string) { ... }

// 打开函数管理 Tab
// Calls: [if, setActiveTabKey, setTabs, tabs.find]
export function openFunctionsTab(dbName: string, schema: string) { ... }

// 打开角色权限 Tab
// Calls: [if, setActiveTabKey, setTabs, tabs.find]
export function openRolesTab() { ... }

// 关闭单个 Tab
// Calls: [if, setActiveTabKey, setTabs, tabs.filter, tabs.find, tabs.findIndex]
export function handleCloseTab(key: string) { ... }

// 全部关闭
// Calls: [if, setActiveTabKey, setTabs, tabs.filter]
export function handleCloseAllTabs() { ... }

// 关闭左侧
// Calls: [if, nextTabs.some, setActiveTabKey, setTabs, tabs.filter, tabs.findIndex]
export function handleCloseLeftTabs(targetKey: string) { ... }

// 关闭右侧
// Calls: [if, nextTabs.some, setActiveTabKey, setTabs, tabs.filter, tabs.findIndex]
export function handleCloseRightTabs(targetKey: string) { ... }

// 删除数据库
// Calls: [API.postgresDropDatabase, catch, initConnection, message.error]
export async function handleDropDb(dbName: string) { ... }

// 删除 Schema
// Calls: [API.postgresDropSchema, catch, loadSchemas, message.error]
export async function handleDropSchema(dbName: string, schema: string) { ... }

// 删除表
// Calls: [API.postgresDropTable, catch, loadTables, message.error]
export async function handleDropTable(dbName: string, schema: string, table: string) { ... }

// 清空表
// Calls: [API.postgresTruncateTable, catch, loadTables, message.error]
export async function handleTruncateTable(dbName: string, schema: string, table: string) { ... }

// 渲染数据库右键菜单
// Calls: [setCreateSchemaOpen, setCurrentDb]
export function getDbMenuItems(dbName: string): MenuProps['items'] { ... }

// 渲染 Schema 右键菜单
// Calls: [setCreateTableOpen, setCurrentDb, setCurrentSchema]
export function getSchemaMenuItems(dbName: string, schema: string): MenuProps['items'] { ... }

// 渲染表右键菜单
// Calls: [openTableTab]
export function getTableMenuItems(dbName: string, schema: string, tableName: string): MenuProps['items'] { ... }

// Calls: [API.postgresRoles, catch, message.error, setLoading, setRoles]
export async function loadRoles() { ... }

// Calls: [API.postgresCreateRole, catch, createForm.resetFields, createForm.validateFields, loadRoles, message.error, setCreateModalOpen]
export async function handleCreateRole() { ... }

// Calls: [API.postgresUpdateRolePassword, catch, if, message.error, message.warning, newPassword.trim, setNewPassword, setPwdModalOpen]
export async function handleChangePassword() { ... }

// Calls: [API.postgresDropRole, catch, loadRoles, message.error]
export async function handleDropRole(roleName: string) { ... }

// Calls: [API.postgresGrantPrivileges, catch, grantPrivs.join, if, message.error, message.warning, setGrantModalOpen]
export async function handleGrant(isGrant: boolean) { ... }

// Calls: [API.postgresSessions, API.postgresStatus, catch, setLoading, setSessions, setStatus]
export async function loadMetrics() { ... }

// Calls: [API.postgresKillSession, catch, if, loadMetrics, message.error, message.success, message.warning]
export async function handleKill(pid: number, terminate = true) { ... }

// Calls: [navigator.clipboard.writeText, setCopiedPid, then]
export function copySql(pid: number, text: string) { ... }

```

---

### TypeScript Module `redis` (`frontend/src/pages/redis`)

- **Imports (36):** `./KeyHeader.module.less`, `./KeyItemTree.module.less`, `./RedisCliDrawer.module.less`, `./redisTypes`, `@/api`, `@/components/CodeEditor`, `@/components/Modal`, `@/pages/redis/BatchPanel`, `@/pages/redis/BatchPanel.module.less`, `@/pages/redis/CreateKeyModal`, `@/pages/redis/KeyHeader`, `@/pages/redis/KeyItemTree`, `@/pages/redis/KeysTab`, `@/pages/redis/KeysTab.module.less`, `@/pages/redis/KeyspaceTab`, `@/pages/redis/KeyspaceTab.module.less`, `@/pages/redis/MonitorTab`, `@/pages/redis/MonitorTab.module.less`, `@/pages/redis/PubSubTab`, `@/pages/redis/PubSubTab.module.less`, `@/pages/redis/QueueTab`, `@/pages/redis/QueueTab.module.less`, `@/pages/redis/RedisCliDrawer`, `@/pages/redis/RedisClient.module.less`, `@/pages/redis/redisTypes`, `@/pages/redis/viewers/HashViewer`, `@/pages/redis/viewers/ListViewer`, `@/pages/redis/viewers/SetViewer`, `@/pages/redis/viewers/StreamViewer`, `@/pages/redis/viewers/StringViewer`, `@/pages/redis/viewers/ZSetViewer`, `@/types`, `@/utils/storage`, `antd`, `lucide-react`, `react`

```typescript
export interface HashPair {
	...
}

export interface ZSetPair {
	...
}

export interface Props {
	...
}

export interface Props {
	...
}

export interface KeysTabProps {
	...
}

export interface Props {
	...
}

export interface CliLog {
	...
}

export interface Props {
	...
}

export interface KeyTreeNode {
	...
}

export interface InternalNode {
	...
}

export type RedisKeyType = 'string' | 'hash' | 'list' | 'set' | 'zset';

export type Tab = typeof TABS[number];

// JSON helpers for string
// Calls: [setError, setStringValue, useState]
export function beautifyJson() { ... }

// Calls: [setError, setStringValue]
export function minifyJson() { ... }

// Calls: [setError, setHashPairs, setKey, setListItems, setSetMembers, setStringValue, setTtl, setType, setZsetPairs]
export function resetForm() { ... }

// Calls: [catch, filter, hashPairs.filter, i.trim, if, key.trim, lines.join, lines.push, listItems.map, onClose, onCreate, p.field.trim, p.member.trim, resetForm, setBusy, setError, setMembers.map, valid.forEach, valid.join, zsetPairs.filter]
export async function handleCreate() { ... }

// Calls: [message.error, message.success, navigator.clipboard.writeText, setCopied]
export async function handleCopy() { ... }

// Calls: [API.redisExpire, catch, message.error, message.success, onReload, setTtlPopoverOpen, setUpdatingTtl]
export async function handleUpdateTtl() { ... }

// Calls: [API.redisRenameKey, catch, if, message.error, message.success, message.warning, onKeyRenamed, renameVal.trim, setRenameOpen, setRenaming]
export async function handleRename() { ... }

// Calls: [API.redisDelete, catch, if, message.error, message.success, onKeyDeleted]
export async function handleDeleteKey() { ... }

// Size / Count text
// Calls: [Blob, formatBytes, if]
export function sizeSummary(() { ... }

// Calls: [message.success, navigator.clipboard.writeText]
export function handleCopy(keyName: string) { ... }

// Calls: [setSidebarWidth]
export function onMouseMove(moveEvent: MouseEvent) { ... }

// Calls: [appStorage.set, setIsDragging]
export function onMouseUp() { ... }

// Calls: [setIsDragging]
export function handleMouseDown(e: React.MouseEvent) { ... }

// Calls: [message.success, navigator.clipboard.writeText]
export function copyKeyName(keyName: string) { ... }

// Calls: [return]
export function Metric({ label, value }: { label: string; value: any }) { ... }

// Calls: [if, setHeight, useEffect, useRef, useState]
export function onMouseMove(moveEvent: MouseEvent) { ... }

// Calls: [setIsDragging]
export function onMouseUp() { ... }

// Drag to resize
// Calls: [setIsDragging]
export function handleMouseDown(e: React.MouseEvent) { ... }

// Calls: [Date, Math.random, catch, if, prev.filter, runRaw, setExecuting, setHistIdx, setHistory, setInputVal, setLogs, slice, startsWith, toLocaleTimeString, toString, trim]
export async function handleExecute(cmdToRun?: string) { ... }

// Calls: [e.preventDefault, handleExecute, if, setHistIdx, setInputVal]
export function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) { ... }

// Calls: [Set, buildKeyTree, expanded.add, for, if, includes, next.add, next.delete, next.has, pattern.toLowerCase, pattern.trim, replace, return, setExpandedKeys, toLowerCase, traverse, trim, useCallback, useEffect, useMemo, useRef, useState]
export function traverse(node: KeyTreeNode): boolean { ... }

// Calls: [setPsMessages, slice]
export function onPs(ev: any) { ... }

// Calls: [setKsMessages, slice]
export function onKs(ev: any) { ... }

// Calls: [API.redisDBSize, API.redisSelectDB, catch, flash, if, loadKeys, onDbChange, setData, setDb, setDbInput, setSelected, setValue]
export async function switchDb(target?: number) { ... }

// Calls: [API.redisSet, catch, flash, if, loadKeys, loadValue]
export async function saveValue() { ... }

// Calls: [API.redisDelete, async, catch, flash, if, loadKeys, setConfirmState, setSelected, setValue]
export function delKey(keyName?: string) { ... }

// Calls: [API.redisRaw, catch, cmd.trim, if]
export async function runRaw(cmd: string) { ... }

// ---- Pipeline ----
// Calls: [API.redisPipeline, batchCmds.split, catch, filter, flash, if, map, s.trim, setBatchResult]
export async function runPipeline() { ... }

// ---- 事务 ----
// Calls: [API.redisTransaction, batchCmds.split, batchWatch.split, catch, filter, flash, if, map, s.trim, setBatchResult]
export async function runTx() { ... }

// ---- Pub/Sub ----
// Calls: [API.redisSubscribe, catch, flash, if, p.includes, psChannel.trim, setPsSubs]
export async function doSubscribe() { ... }

// Calls: [API.redisPSubscribe, catch, flash, if, p.includes, psPattern.trim, setPsSubs]
export async function doPSubscribe() { ... }

// Calls: [API.redisPublish, catch, flash, if, psChannel.trim]
export async function doPublish() { ... }

// Calls: [API.redisUnsubscribe, catch, flash, p.filter, setPsSubs]
export async function doUnsub(ch: string) { ... }

// ---- 键事件 ----
// Calls: [API.redisKeyspaceNotify, catch, flash, ksEvent.trim]
export async function startKeyspace() { ... }

// ---- 队列 ----
// Calls: [API.redisQueueEnqueue, API.redisQueueLength, catch, flash, if, qName.trim, setQLen]
export async function enqueue() { ... }

// Calls: [API.redisQueueDequeue, API.redisQueueLength, catch, flash, if, qName.trim, setQLen, setQOut]
export async function dequeue() { ... }

// Calls: [children.unshift, if, nodes.map, transform]
export function transform(nodes: InternalNode[]): KeyTreeNode[] { ... }

// Calls: [collectLeafKeys, for, if, result.push]
export function collectLeafKeys(node: KeyTreeNode): string[] { ... }

// Calls: [if]
export function formatTtl(ttlSec: number | undefined | null) { ... }

// Calls: [fmtFields, if, join, map, return, switch]
export function formatValue(v: RedisValue): string { ... }

// Calls: [if, join, map]
export function fmtFields(f: any): string { ... }

```

---

### TypeScript Module `viewers` (`frontend/src/pages/redis/viewers`)

- **Imports (9):** `../redisTypes`, `./viewers.module.less`, `@/api`, `@/components/CodeEditor`, `@/types`, `@/utils`, `antd`, `lucide-react`, `react`

```typescript
export interface Props {
	...
}

export interface HashRow {
	...
}

export interface Props {
	...
}

export interface ListRow {
	...
}

export interface Props {
	...
}

export interface SetRow {
	...
}

export interface Props {
	...
}

export interface StreamMessage {
	...
}

export interface Props {
	...
}

export interface Props {
	...
}

export interface ZSetRow {
	...
}

export type ViewFormat = 'text' | 'json' | 'base64';

// Calls: [Blob, for, if, includes, list.push, map, r.field.toLowerCase, r.val.toLowerCase, rows.filter, searchText.toLowerCase, searchText.trim, setEditModalOpen, setIsAdding, setModalField, setModalVal, trim, useMemo, useState, value.value.split]
export function openAddModal() { ... }

// Calls: [setEditModalOpen, setIsAdding, setModalField, setModalVal]
export function openEditModal(row: HashRow) { ... }

// Calls: [API.redisHashFieldSet, catch, if, message.error, message.success, message.warning, modalField.trim, onReload, setEditModalOpen, setSubmitting]
export async function handleSaveField() { ... }

// Calls: [API.redisHashFieldDel, catch, message.error, message.success, onReload]
export async function handleDeleteSingle(field: string) { ... }

// Calls: [API.redisHashFieldDel, catch, if, message.error, message.success, onReload, selectedRowKeys.map, setSelectedRowKeys]
export async function handleBatchDelete() { ... }

// Calls: [API.redisListPush, Blob, catch, if, includes, map, message.error, message.success, message.warning, onReload, pushContent.trim, r.val.toLowerCase, rows.filter, searchText.toLowerCase, searchText.trim, setPushContent, setPushModalOpen, setPushing, trim, useMemo, useState, value.rawJson.map, value.value.split]
export async function handlePush() { ... }

// Calls: [API.redisListPop, LPOP, Modal.info, RPOP, catch, message.error, onReload, var]
export async function handlePop(left: boolean) { ... }

// Calls: [API.redisRaw, Error, catch, editContent.replace, if, message.error, message.success, onReload, setEditModalOpen, setEditing, startsWith]
export async function handleSaveEdit() { ... }

// Calls: [API.redisRaw, catch, message.error, message.success, onReload, row.val.replace]
export async function handleDeleteItem(row: ListRow) { ... }

// Calls: [API.redisSetAdd, Blob, catch, filter, if, includes, map, message.error, message.success, message.warning, onReload, r.member.toLowerCase, rows.filter, s.trim, searchText.toLowerCase, searchText.trim, setAddModalOpen, setAddText, setAdding, split, trim, useMemo, useState, value.rawJson.map, value.value.split]
export async function handleAddMembers() { ... }

// Calls: [API.redisSetRem, catch, message.error, message.success, onReload]
export async function handleDeleteSingle(member: string) { ... }

// Calls: [API.redisSetRem, catch, if, message.error, message.success, onReload, selectedRowKeys.map, setSelectedRowKeys]
export async function handleBatchDelete() { ... }

// Calls: [API.redisRaw, Date, Error, b.trim, catch, for, id.split, if, includes, isNaN, k.toLowerCase, list.push, m.id.toLowerCase, message.error, message.success, message.warning, messages.filter, onReload, p.split, parts.join, parts.push, replace, searchText.toLowerCase, searchText.trim, setAddModalOpen, setAdding, split, startsWith, toLocaleString, toLowerCase, trim, useMemo, useState, value.rawJson.map, value.value.split]
export async function handleAddEntry() { ... }

// Calls: [API.redisRaw, catch, message.error, message.success, onReload]
export async function handleDeleteEntry(msgId: string) { ... }

// JSON Validation
// Calls: [catch, content.trim, if, setContent, setFormat, test, useEffect, useState]
export function jsonStatus(() { ... }

// Calls: [message.success, message.warning, setContent, setFormat]
export function beautifyJson() { ... }

// Calls: [message.success, message.warning, setContent, setFormat]
export function minifyJson() { ... }

// Calls: [message.error, message.success, navigator.clipboard.writeText, setCopied]
export async function handleCopy() { ... }

// Calls: [API.redisSet, catch, flash, if, message.error, message.success, onReload, setSaving]
export async function handleSave() { ... }

// Calls: [API.redisStringAppend, catch, if, message.error, message.success, onReload, setAppendModal, setAppendVal]
export async function handleAppend() { ... }

// Base64 representation
// Calls: [stringToBase64]
export function base64Content(() { ... }

// Calls: [API.redisZSetAdd, Blob, catch, for, if, includes, isNaN, list.push, message.error, message.success, message.warning, modalMember.trim, onReload, r.member.toLowerCase, rows.filter, searchText.toLowerCase, searchText.trim, setModalOpen, setSubmitting, trim, useMemo, useState, value.rawJson.map, value.value.split]
export async function handleSave() { ... }

// Calls: [API.redisZSetRem, catch, message.error, message.success, onReload]
export async function handleDeleteSingle(member: string) { ... }

// Calls: [API.redisZSetRem, catch, if, message.error, message.success, onReload, selectedRowKeys.map, setSelectedRowKeys]
export async function handleBatchDelete() { ... }

```

---

### TypeScript Module `setting` (`frontend/src/pages/setting`)

- **Imports (18):** `./AboutTab.module.less`, `./AiAgentTab.module.less`, `./AppearanceTab.module.less`, `./McpServerTab.module.less`, `./components/ModelEditModal`, `@/api`, `@/components/AppLogo`, `@/components/common/MarkdownViewer`, `@/pages/setting/AboutTab`, `@/pages/setting/AiAgentTab`, `@/pages/setting/AppearanceTab`, `@/pages/setting/McpServerTab`, `@/pages/setting/SettingsModal.module.less`, `@/types`, `@/utils/theme`, `antd`, `lucide-react`, `react`

```typescript
export interface Props {
	...
}

export interface AppearanceTabProps {
	...
}

export interface McpServerTabProps {
	...
}

export interface Props {
	...
}

export type SettingsTab = 'appearance' | 'aiAgent' | 'mcp' | 'about';

// Calls: [API.checkForUpdates, API.getAppVersion, Date, catch, if, message.info, return, setChecking, setUpdateResult, setVersionInfo, then, toLocaleString, useEffect, useState]
export async function handleCheckUpdates() { ... }

// Calls: [API.openBrowser]
export function openUrl(url: string) { ... }

// Calls: [message.error, message.success, navigator.clipboard.writeText]
export async function copyUrl(url: string) { ... }

// Calls: [setEditModalOpen, setEditingModel]
export function handleAddModel() { ... }

// Calls: [setEditModalOpen, setEditingModel]
export function handleEditModel(item: AiModelItem) { ... }

// Calls: [currentModels.filter, if, message.success, message.warning, nextModels.find, onChange]
export function handleDeleteModel(id: string) { ... }

// Calls: [currentModels.findIndex, if, message.success, nextModels.find, onChange]
export function handleSaveModelItem(item: AiModelItem) { ... }

// Calls: [API.agentListSkills, setSkills, setSkillsLoading]
export async function loadSkills() { ... }

// Calls: [API.agentOpenSkillsDir, catch, message.error, message.success]
export async function handleOpenSkillsDir() { ... }

// Calls: [if]
export function formatUptime(seconds: number): string { ... }

// Calls: [API.restartMcpServer, async, catch, fetchStatusAndData, if, message.error, message.success, onChange, setRestarting, setStatus]
export async function handleToggleEnabled(checked: boolean) { ... }

// Calls: [API.restartMcpServer, catch, fetchStatusAndData, if, message.error, message.success, setRestarting, setStatus]
export async function handleRestartServer() { ... }

// Calls: [if, message.error, message.success, navigator.clipboard.writeText, setCopiedKey]
export async function handleCopy(text: string, key: string) { ... }

// Calls: [if, onClose, setActiveModelId, setAiApiKey, setAiBaseUrl, setAiBlockHighRiskCommands, setAiCompressionStrategy, setAiContextCompressRatio, setAiEnableMultimodal, setAiEnablePermissionGuard, setAiEnableThinking, setAiEnableVerifier, setAiEnableWebSearch, setAiMaxContextTokens, setAiMaxParallel, setAiModel, setAiModelContextTokens, setAiModels, setAiReasoningEffort, setAiSystemPrompt, setAiTemperature, setAiWorkspaceDir, setCloseAction, setGlobalFontFamily, setMcpServerEnabled, setMcpServerHost, setMcpServerPort, setThemeMode, useEffect, useRef, useState]
export function handleKeyDown(e: KeyboardEvent) { ... }

// Calls: [applyThemeMode, persistSettings, setThemeMode]
export function handleThemeChange(mode: 'light' | 'dark' | 'system') { ... }

// Calls: [applyGlobalFont, persistSettings, setGlobalFontFamily]
export function handleGlobalFontChange(fontKey: string) { ... }

// Calls: [persistSettings, setCloseAction]
export function handleCloseActionChange(action: 'ask' | 'minimize' | 'quit') { ... }

// Calls: [if, persistSettings, setActiveModelId, setAiApiKey, setAiBaseUrl, setAiBlockHighRiskCommands, setAiCompressionStrategy, setAiContextCompressRatio, setAiEnableMultimodal, setAiEnablePermissionGuard, setAiEnableThinking, setAiEnableVerifier, setAiEnableWebSearch, setAiMaxContextTokens, setAiMaxParallel, setAiModel, setAiModelContextTokens, setAiModels, setAiReasoningEffort, setAiSystemPrompt, setAiTemperature]
export function handleAiAgentChange(fields: Partial<AppSettings>) { ... }

// Calls: [if, persistSettings, setMcpServerEnabled, setMcpServerHost, setMcpServerPort]
export function handleMcpChange(fields: Partial<AppSettings>) { ... }

```

---

### TypeScript Module `components` (`frontend/src/pages/setting/components`)

- **Imports (5):** `./ModelEditModal.module.less`, `@/types`, `antd`, `lucide-react`, `react`

```typescript
export interface Props {
	...
}

// Calls: [if, message.success, setBaseUrl, setContextTokens, setEnableMultimodal, setModel, setName, setTemperature]
export function handleApplyPreset(presetData: any) { ... }

// Calls: [Date.now, Math.random, apiKey.trim, baseUrl.trim, if, message.warning, model.trim, name.trim, onClose, onSave, substring, toString]
export function handleSubmit() { ... }

```

---

### TypeScript Module `sqlite` (`frontend/src/pages/sqlite`)

- **Imports (12):** `./SqliteClient.module.less`, `@/api`, `@/components/Modal`, `@/components/common/TabBar`, `@/components/db/DataTab`, `@/components/db/SqlEditor`, `@/components/db/adapters`, `@/pages/mysql/ObjModal`, `@/types`, `@/utils`, `antd`, `react`

```typescript
export interface Props {
	...
}

export interface SqliteTabItem {
	...
}

// Calls: [s.replace]
export function quoteIdent(s: string): string { ... }

// Calls: [API.sqliteInfo, API.sqliteTables, async, catch, errorMessage, if, loadInfo, loadTables, message.error, message.success, message.warning, navigator.clipboard.writeText, setBusy, setInfo, setTables, useCallback, useEffect, useState]
export function copyPath() { ... }

// 打开数据表 Tab
// Calls: [if, setActiveTabKey, setTabs, tabs.find]
export function openTableTab(tableName: string) { ... }

// 打开/激活 SQL 编辑器 Tab
// Calls: [if, setActiveTabKey, setTabs, tabs.find]
export function openSqlEditor(initialSql?: string) { ... }

// 关闭 Tab
// Calls: [if, setActiveTabKey, setTabs, tabs.filter, tabs.findIndex]
export function handleCloseTab(key: string) { ... }

// Calls: [if, setActiveTabKey, setTabs]
export function handleCloseAllTabs() { ... }

// Calls: [if, setActiveTabKey, setTabs, tabs.findIndex, tabs.slice]
export function handleCloseLeftTabs(targetKey: string) { ... }

// Calls: [if, setActiveTabKey, setTabs, tabs.findIndex, tabs.slice]
export function handleCloseRightTabs(targetKey: string) { ... }

// 打开新建表弹窗
// Calls: [setCreateColDefs, setCreateModalOpen, setCreateMsg, setCreateTableName]
export function handleOpenCreateModal() { ... }

// Calls: [API.sqliteRun, catch, createColDefs.trim, createTableName.trim, errorMessage, if, loadTables, openTableTab, quoteIdent, setCreateBusy, setCreateModalOpen, setCreateMsg]
export async function handleConfirmCreateTable() { ... }

// 删除表
// Calls: [API.sqliteRun, async, catch, errorMessage, handleCloseTab, loadTables, message.error, message.success, quoteIdent, setConfirmState]
export function handleDropTable(table: SqliteTableInfo) { ... }

// 清空表
// Calls: [API.sqliteRun, async, catch, errorMessage, loadTables, message.error, message.success, quoteIdent, setConfirmState]
export function handleTruncateTable(table: SqliteTableInfo) { ... }

// Calls: [if, v.toFixed, while]
export function fmtSize(n: number) { ... }

```

---

### TypeScript Module `ssh` (`frontend/src/pages/ssh`)

- **Imports (12):** `@/pages/ssh/SessionWorkspace.module.less`, `@/pages/ssh/cron/CronPanel`, `@/pages/ssh/dashboard/DashboardPanel`, `@/pages/ssh/file/FilePanel`, `@/pages/ssh/process/ProcessPanel`, `@/pages/ssh/service/ServicePanel`, `@/pages/ssh/terminal/TerminalView`, `@/types`, `@/utils/storage`, `antd`, `lucide-react`, `react`

```typescript
export interface SessionWorkspaceProps {
	...
}

// Calls: [if, rootRef.current.getBoundingClientRect, setPanelWidth]
export function onMouseMove(e: MouseEvent) { ... }

// Calls: [appStorage.set, setIsDragging]
export function onMouseUp() { ... }

```

---

### TypeScript Module `cron` (`frontend/src/pages/ssh/cron`)

- **Imports (10):** `@/api`, `@/components/Modal`, `@/pages/ssh/cron/CronModal`, `@/pages/ssh/cron/CronPanel.module.less`, `@/types`, `@/utils`, `antd`, `antd/es/table`, `lucide-react`, `react`

```typescript
export interface Props {
	...
}

export interface Props {
	...
}

// Calls: [expr.trim, if, min.replace, min.startsWith, trimmed.split]
export function explainCron(expr: string): string { ... }

// Calls: [command.trim, comment.trim, expression.trim, if, onSave, setCommand, setComment, setExpression, useEffect, useState]
export function handleConfirm() { ... }

// Calls: [API.sshCronList, API.sshSaveCronList, Date, async, catch, errorMessage, fetchCrons, if, includes, it.command.toLowerCase, it.comment.toLowerCase, it.expression.toLowerCase, items.filter, keyword.trim, message.error, message.success, setBusy, setError, setItems, setLastUpdate, setLoaded, toLocaleTimeString, toLowerCase, useCallback, useEffect, useMemo, useState]
export async function handleSaveList(nextList: SSHCronItem[]) { ... }

// Calls: [handleSaveList, items.map]
export function handleToggleEnabled(target: SSHCronItem) { ... }

// Calls: [setEditingItem, setModalOpen]
export function handleOpenCreate() { ... }

// Calls: [setEditingItem, setModalOpen]
export function handleOpenEdit(item: SSHCronItem) { ... }

// Calls: [Date.now, handleSaveList, if, items.map, setModalOpen]
export function handleSaveItem(itemData: Partial<SSHCronItem>) { ... }

// Calls: [handleSaveList, items.filter, setConfirm]
export function handleDelete(target: SSHCronItem) { ... }

// Calls: [API.sshRunCronCommand, catch, errorMessage, setRunBusy, setRunCommand, setRunOutput]
export async function handleRunNow(target: SSHCronItem) { ... }

```

---

### TypeScript Module `dashboard` (`frontend/src/pages/ssh/dashboard`)

- **Imports (8):** `@/api`, `@/pages/ssh/dashboard/DashboardPanel.module.less`, `@/types`, `@/utils`, `antd`, `antd/es/table`, `lucide-react`, `react`

```typescript
export interface Props {
	...
}

// Calls: [if, val.toFixed, while]
export function fmtBytes(bytes: number): string { ... }

// Calls: [if]
export function getProgressColor(pct: number): string { ... }

// Calls: [filter, if, map, part.includes, part.split, s.includes, s.trim, str.includes, str.split, sub.join]
export function cleanUptime(str: string): string { ... }

// Calls: [API.sshDashboardStats, Avg, Date, async, catch, cleanUptime, data.cpu.loadAvg.map, data.cpu.usagePercent.toFixed, data.disks.filter, data.mem.usagePercent.toFixed, data.nets.filter, errorMessage, fetchStats, fmtBytes, fs.split, getProgressColor, if, join, l.toFixed, message.error, now.toLocaleTimeString, pct.toFixed, pop, return, setBusy, setData, setError, setLastUpdate, setShowVirtual, setShowVirtualNet, useCallback, useEffect, useState]
export function DashboardPanel({ sessionId, active }: Props) { ... }

```

---

### TypeScript Module `file` (`frontend/src/pages/ssh/file`)

- **Imports (14):** `@/api`, `@/components/CodeEditor`, `@/components/ContextMenu`, `@/components/Modal`, `@/components/TransferBar`, `@/pages/ssh/file/FileEditorModal`, `@/pages/ssh/file/FileEditorModal.module.less`, `@/pages/ssh/file/FilePanel.module.less`, `@/styles/global.module.less`, `@/types`, `@/utils`, `antd`, `lucide-react`, `react`

```typescript
export interface Props {
	...
}

export interface Props {
	...
}

// Calls: [API.readRemoteFile, API.writeRemoteFile, async, catch, errorMessage, fileName.endsWith, filePath.split, finally, if, message.error, message.success, onClose, pop, return, setContent, setLoading, setOriginalContent, setSaving, then, useCallback, useEffect, useState]
export function FileEditorModal({ open, sessionId, filePath, onClose }: Props) { ... }

// Calls: [API.listDir, async, catch, errorMessage, if, load, message.error, minmax, onPathChange, prev.findIndex, setItems, setLoading, setPath, setPathInput, setSelected, setTransfers, subscribe, useCallback, useEffect, useMemo, useState]
export function handleTransfer(t: Transfer) { ... }

// Calls: [if, map, prev.filter, prev.includes, setSelected, sort, visible.slice]
export function onRowClick(e: React.MouseEvent, item: FileItem, index: number) { ... }

// Calls: [if, setEditFilePath]
export function askEdit(item: FileItem) { ... }

// Calls: [askEdit, if, load]
export function open(item: FileItem) { ... }

// Calls: [API.downloadPaths, catch, errorMessage, if, message.error]
export async function download(paths: string[]) { ... }

// Calls: [API.chooseLocalFiles, API.uploadPaths, catch, errorMessage, if, message.error]
export async function uploadViaDialog() { ... }

// Calls: [API.chooseLocalFolder, API.uploadPaths, catch, errorMessage, if, message.error]
export async function uploadFolderViaDialog() { ... }

// Calls: [API.writeRemoteFile, async, catch, errorMessage, load, message.error, path.endsWith, setPrompt]
export function askNewFile() { ... }

// Calls: [API.makeDir, async, catch, errorMessage, load, message.error, setPrompt]
export function askNewFolder() { ... }

// Calls: [API.rename, async, catch, errorMessage, load, message.error, setPrompt]
export function askRename(item: FileItem) { ... }

// Calls: [API.removePaths, async, catch, errorMessage, if, load, message.error, pop, setConfirm, split]
export function askDelete(paths: string[]) { ... }

export function itemMenu(item: FileItem, targets: string[]): MenuItem[] { ... }

export function blankMenu(): MenuItem[] { ... }

// Calls: [API.uploadData, Array.from, bytesToBase64, catch, e.preventDefault, errorMessage, file.arrayBuffer, for, if, message.error, setDragOver]
export async function onDrop(e: React.DragEvent) { ... }

```

---

### TypeScript Module `process` (`frontend/src/pages/ssh/process`)

- **Imports (9):** `@/api`, `@/components/Modal`, `@/pages/ssh/process/ProcessPanel.module.less`, `@/types`, `@/utils`, `antd`, `antd/es/table`, `lucide-react`, `react`

```typescript
export interface Props {
	...
}

// Calls: [if, val.toFixed, while]
export function fmtBytes(bytes: number): string { ... }

// Calls: [API.sshKillProcess, API.sshProcessList, Date, SIGKILL, async, catch, errorMessage, fetchProcesses, if, includes, keyword.trim, message.error, message.success, pr.command.toLowerCase, pr.pid.toString, pr.user.toLowerCase, proc.command.split, procs.filter, setBusy, setConfirm, setError, setLastUpdate, setPage, setProcs, toLocaleTimeString, toLowerCase, useCallback, useEffect, useMemo, useState]
export function handleKill(proc: SSHProcessInfo) { ... }

```

---

### TypeScript Module `service` (`frontend/src/pages/ssh/service`)

- **Imports (8):** `@/api`, `@/pages/ssh/service/ServicePanel.module.less`, `@/types`, `@/utils`, `antd`, `antd/es/table`, `lucide-react`, `react`

```typescript
export interface Props {
	...
}

export type FilterTab = 'all' | 'active' | 'inactive' | 'failed';

// Calls: [API.sshControlService, API.sshServiceList, Date, async, catch, errorMessage, fetchServices, for, if, includes, keyword.trim, list.filter, message.error, message.success, setActionBusy, setBusy, setError, setLastUpdate, setPage, setServices, svc.description.toLowerCase, svc.name.toLowerCase, toLocaleTimeString, toLowerCase, useCallback, useEffect, useMemo, useState]
export async function handleControl(svc: SSHServiceInfo, action: 'start' | 'stop' | 'restart') { ... }

// Calls: [API.sshServiceLogs, catch, errorMessage, setLogLoading, setLogService, setLogText]
export async function openLogs(svc: SSHServiceInfo) { ... }

```

---

### TypeScript Module `terminal` (`frontend/src/pages/ssh/terminal`)

- **Imports (14):** `@/api`, `@/components/ContextMenu`, `@/contexts/ThemeContext`, `@/pages/ssh/terminal/Terminal.module.less`, `@/theme`, `@/utils`, `@xterm/addon-fit`, `@xterm/addon-search`, `@xterm/addon-web-links`, `@xterm/xterm`, `@xterm/xterm/css/xterm.css`, `antd`, `lucide-react`, `react`

```typescript
export interface Props {
	...
}

// Calls: [API.resize, API.sendInput, API.terminalAttach, Date.now, FitAddon, ResizeObserver, SearchAddon, Terminal, WebLinksAddon, async, base64ToBytes, catch, copySelection, debouncedResize, e.preventDefault, e.stopPropagation, fit, fit.fit, focus, getSelection, getTerminalTheme, if, indexOf, navigator.clipboard.readText, navigator.clipboard.writeText, navigator.platform.toUpperCase, observer.disconnect, observer.observe, offClosed, offData, paste, return, searchRef.current.findNext, select, setMenu, setSearchOpen, subscribe, term.attachCustomKeyEventHandler, term.clear, term.dispose, term.focus, term.hasSelection, term.loadAddon, term.onData, term.onResize, term.open, term.write, term.writeln, termRef.current.paste, useCallback, useEffect, useState, useTheme, window.clearTimeout, window.setTimeout]
export function handleSearchNext() { ... }

// Calls: [if, searchRef.current.findPrevious]
export function handleSearchPrev() { ... }

// Calls: [handleSearchNext, handleSearchPrev, if, setSearchOpen]
export function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) { ... }

// Calls: [if, searchRef.current.findNext, setSearchQuery]
export function handleSearchChange(e: React.ChangeEvent<HTMLInputElement>) { ... }

```

---

### TypeScript Module `wiki` (`frontend/src/pages/wiki`)

- **Imports (10):** `./WikiClient.module.less`, `@/api`, `@/components/CodeEditor`, `@/components/ContextMenu`, `@/components/Modal`, `@/components/common/MarkdownViewer`, `@/components/common/Tree`, `@/contexts/SessionContext`, `@/types`, `react`

```typescript
export interface Props {
	...
}

export type ViewMode = 'preview' | 'edit' | 'split';

// Calls: [if]
export function getErrorMessage(err: unknown): string { ... }

// Calls: [Modal.confirm, Promise, resolve]
export function confirmSwitchDoc(): Promise<boolean> { ... }

// Calls: [API.wikiGetDir, API.wikiListTree, API.wikiReadPage, Array.from, Set, async, catch, confirmSwitchDoc, filter, findFirstDoc, for, getErrorMessage, if, map, message.destroy, message.error, return, setContent, setExpandedKeys, setLoading, setOriginalContent, setSelectedNode, setSelectedPath, setTreeData, setWikiDir, useCallback, useDeferredValue, useEffect, useMemo, useSession]
export function findFirstDoc(list: WikiNode[]): WikiNode | null { ... }

// 打开系统文件管理器
// Calls: [API.wikiOpenDir, catch, getErrorMessage, message.error]
export async function handleOpenDir() { ... }

// 创建或重命名弹窗确认（修复子级相对路径重命名映射与重复提交问题）
// Calls: [API.wikiCreateNode, API.wikiRenameNode, Date.now, catch, getErrorMessage, if, loadTree, message.error, message.success, message.warning, nameInput.trim, nameModal.targetPath.split, parts.join, selectDoc, selectedPath.slice, selectedPath.startsWith, setNameModal, setSelectedNode, setSelectedPath, setSubmittingName, val.endsWith]
export async function handleConfirmNameModal() { ... }

// 执行会话编译提炼
// Calls: [API.agentGetHistory, API.agentGetSessionMessages, API.wikiCompileSession, catch, getErrorMessage, if, loadTree, message.error, message.loading, message.success, message.warning, msgs.map, setCompileModalOpen, setCompiling]
export async function handleCompileSession() { ... }

// Calls: [filterAndConvert, for, if, includes, node.name.toLowerCase, node.rel_path.toLowerCase, res.push]
export function filterAndConvert(nodes: WikiNode[]): TreeNodeData[] { ... }

// Calls: [for, if, walk]
export function walk(nodes: WikiNode[]) { ... }

```

---

### TypeScript Module `utils` (`frontend/src/utils`)

- **Imports (5):** `@/api`, `@/types`, `@/utils/storage`, `antd`, `react`

```typescript
export interface CopyOptions {
	...
}

export type SqlDialect = 'mysql' | 'postgres' | 'sqlite';

// 复制文本到系统剪贴板并给出交互反馈（支持现代 Clipboard API 与 textarea fallback）
// @param text 要复制的文本
// @param optionsOrLabel 可传入成功提示文案、label 字符串，或配置对象
// Calls: [catch, document.body.appendChild, document.body.removeChild, document.createElement, document.execCommand, if, message.error, message.success, navigator.clipboard.writeText, optionsOrLabel.startsWith, textarea.focus, textarea.select]
export async function copyText(text: string, optionsOrLabel?: string | CopyOptions): Promise<boolean> { ... }

// 比较数据库单元格原始值与编辑输入值是否等价。
// 解决数字类型（如 100 与 "100"）、布尔类型（如 true 与 "true"）、NULL 等因为类型差异误判为已修改的问题。
// Calls: [if, isNaN, origVal.trim, toLowerCase, trim]
export function isSameCellValue(origVal: any, newVal: any): boolean { ... }

// 将编辑输入的字符串还原为对应原始值的类型（数字、布尔等）
// Calls: [Number.isSafeInteger, if, isNaN, s.includes, toLowerCase, trim]
export function coerceCellValue(origVal: any, val: any, isNull: boolean): any { ... }

// Calls: [if, msg.includes, toLowerCase]
export function isUserCancelled(err: unknown): boolean { ... }

// Calls: [if, isUserCancelled]
export function errorMessage(err: unknown): string { ... }

// 通过浏览器触发 Blob 文件下载，并自动释放 ObjectURL 内存
// Calls: [URL.createObjectURL, URL.revokeObjectURL, a.click, document.body.appendChild, document.body.removeChild, document.createElement]
export function downloadBlob(filename: string, blob: Blob): void { ... }

// Calls: [dir.replace, if]
export function joinRemote(dir: string, name: string): string { ... }

// Calls: [if, p.replace, trimmed.lastIndexOf, trimmed.slice]
export function parentRemote(p: string): string { ... }

// Calls: [Uint8Array, atob, binary.charCodeAt, for, if]
export function base64ToBytes(b64: string): Uint8Array { ... }

// Calls: [Array.from, String.fromCharCode.apply, Uint8Array, btoa, bytes.subarray, for]
export function bytesToBase64(buffer: ArrayBuffer): string { ... }

// 将 UTF-8 字符串安全编码为 Base64（利用标准 TextEncoder 与 bytesToBase64，替代已废弃的 unescape/escape）
// Calls: [TextEncoder, bytesToBase64, encode, if]
export function stringToBase64(str: string): string { ... }

// 将 Base64 字符串解码为 UTF-8 字符串（利用标准 TextDecoder，替代已废弃的 unescape/escape）
// Calls: [TextDecoder, Uint8Array, atob, binary.charCodeAt, decode, for, if]
export function base64ToString(b64: string): string { ... }

// openFileDialog 弹出打开文件对话框，返回选中的文件路径（取消则返回 null）
// Calls: [Error, filters.map, fn, if]
export async function openFileDialog(title: string, filters?: { displayName: string; pattern: string }[]): Promise<string | null> { ... }

// saveFileDialog 弹出保存文件对话框，返回目标路径（取消则返回 null）
// Calls: [Error, fn, if]
export async function saveFileDialog(title: string, defaultName: string): Promise<string | null> { ... }

// Calls: [if, value.toFixed, while]
export function formatSize(bytes: number): string { ... }

// 格式化字节大小（formatSize 别名，统一全项目数据量展示）
// Calls: [formatSize, if]
export function formatBytes(bytes: number): string { ... }

// Calls: [Date, d.getDate, d.getFullYear, d.getHours, d.getMinutes, d.getMonth, if, pad]
export function pad(n: number) { ... }

// 轻量 MD5 实现（零依赖，RFC 1321），仅用于本地工具计算。
// Calls: [return]
export function add32(a: number, b: number): number { ... }

// Calls: [add32]
export function cmn(q: number, a: number, b: number, x: number, s: number, t: number): number { ... }

// Calls: [cmn]
export function ff(a: number, b: number, c: number, d: number, x: number, s: number, t: number): number { ... }

// Calls: [cmn]
export function gg(a: number, b: number, c: number, d: number, x: number, s: number, t: number): number { ... }

// Calls: [cmn]
export function hh(a: number, b: number, c: number, d: number, x: number, s: number, t: number): number { ... }

// Calls: [cmn]
export function ii(a: number, b: number, c: number, d: number, x: number, s: number, t: number): number { ... }

// Calls: [add32, ff, gg, hh, ii]
export function cycle(x: number[], k: number[]) { ... }

// Calls: [for, if, out.push, str.charCodeAt]
export function toBytesUTF8(str: string): number[] { ... }

// Calls: [for, padStart, toString]
export function hex(n: number): string { ... }

// Calls: [add32, bytes.push, cycle, fill, for, hex, out.toUpperCase, state.slice, toBytesUTF8, while]
export function md5(input: string, upper = false): string { ... }

// 根据数据库方言转义标识符（表名、列名）
// Calls: [if, name.replace]
export function escapeSqlIdentifier(name: string, dialect: SqlDialect): string { ... }

// 根据数据库方言格式化 SQL 字段值
// Calls: [formatSqlValue, if, isFinite, isNaN, replace, str.replace]
export function formatSqlValue(val: any, dialect: SqlDialect): string { ... }

// Calls: [if, key.startsWith]
export function resolvePrefixedKey(key: string): string { ... }

// Calls: [document.documentElement.style.setProperty]
export function applyGlobalFont(fontKey?: string) { ... }

// Calls: [catch, document.documentElement.setAttribute, if, win.go.main.App.SetNativeTheme, window.matchMedia]
export function applyThemeMode(mode: 'light' | 'dark' | 'system') { ... }

export function getCachedSettings(): AppSettings { ... }

// Calls: [appStorage.set]
export function setCachedSettings(settings: AppSettings) { ... }

// 静默检查新版本并在发现新版本时弹出消息提醒
// Calls: [API.checkForUpdates, API.openBrowser, if, message.info]
export async function checkUpdateSilently(): Promise<void> { ... }

// 软件启动后静默检查新版本的 Hook
// @param delayMs 延迟毫秒数，默认 2500ms，避免与冷启动首屏加载争抢资源
// Calls: [checkUpdateSilently, return, useEffect]
export function useStartupUpdateCheck(delayMs: number = 2500) { ... }

```

---

### TypeScript Module `frontend` (`frontend`)

- **Imports (4):** `@vitejs/plugin-react`, `@wailsio/runtime/plugins/vite`, `node:url`, `vite`

```typescript
```

---

