package agent

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"terminal/agent/ask"
	"terminal/agent/events"
	"terminal/agent/executor"
	"terminal/agent/guard"
	"terminal/agent/planner"
	"terminal/agent/skills"
	"terminal/agent/store"
	"terminal/agent/tools"
	"terminal/agent/verifier"
	"terminal/core"
	"terminal/db"
	"terminal/docker"
	"terminal/k8s"

	"github.com/cloudwego/eino/components/tool"
)

func setupTestStore(t *testing.T) (*store.Store, func()) {
	tmpDir, err := os.MkdirTemp("", "agent_test_*")
	if err != nil {
		t.Fatalf("创建临时目录失败: %v", err)
	}
	dbPath := filepath.Join(tmpDir, "test_agent.db")
	st, err := store.NewStore(dbPath)
	if err != nil {
		t.Fatalf("初始化测试存储失败: %v", err)
	}

	cleanup := func() {
		_ = st.Close()
		_ = os.RemoveAll(tmpDir)
	}
	return st, cleanup
}

func TestStoreCRUD(t *testing.T) {
	st, cleanup := setupTestStore(t)
	defer cleanup()

	// 1. Messages Operations
	msg := store.MessageItem{
		SessionID: "test_sess_1",
		Role:      "user",
		Content:   "你好，这是一条测试消息",
		CreatedAt: time.Now().UnixMilli(),
	}
	if err := st.AddMessage(msg); err != nil {
		t.Fatalf("添加消息失败: %v", err)
	}
	msgs, err := st.ListMessages("test_sess_1")
	if err != nil || len(msgs) != 1 || msgs[0].Content != "你好，这是一条测试消息" {
		t.Fatalf("读取消息失败: %v", err)
	}
}

func TestPolicyGuardAndAuthorizationMemory(t *testing.T) {
	st, cleanup := setupTestStore(t)
	defer cleanup()

	g := guard.NewPolicyGuard(true, true, st)

	// 1. Safe commands should allow
	lvl, _ := g.Audit(context.Background(), "s1", "read_file", `{"path": "a.txt"}`, guard.LevelAllow)
	if lvl != guard.LevelAllow {
		t.Fatalf("期望 LevelAllow，得到 %v", lvl)
	}

	// 2. Dangerous Shell command should be forbidden (both remote ssh_exec_command and local execute)
	lvl, reason := g.Audit(context.Background(), "s1", "ssh_exec_command", `rm -rf /`, guard.LevelAllow)
	if lvl != guard.LevelForbidden {
		t.Fatalf("期望 LevelForbidden，得到 %v (理由: %s)", lvl, reason)
	}

	lvl, reason = g.Audit(context.Background(), "s1", "execute", `{"command": "rm -rf /*"}`, guard.LevelAllow)
	if lvl != guard.LevelForbidden {
		t.Fatalf("本地危险命令期望 LevelForbidden，得到 %v (理由: %s)", lvl, reason)
	}

	lvl, _ = g.Audit(context.Background(), "s1", "execute", `{"command": "git status"}`, guard.LevelAllow)
	if lvl != guard.LevelConfirm {
		t.Fatalf("本地安全命令期望 LevelConfirm 触发审批，得到 %v", lvl)
	}
}

func TestToolBusGuardWrappedEinoTool(t *testing.T) {
	st, cleanup := setupTestStore(t)
	defer cleanup()

	eb := events.NewEventBus()
	g := guard.NewPolicyGuard(true, true, st)
	tb := tools.NewToolBus(g, eb)

	// Register a tool with LevelAllow
	tb.Register(&tools.RegisteredTool{
		Name:        "custom_write_file",
		Description: "写文件",
		Level:       guard.LevelAllow,
		Handler: func(ctx context.Context, input string) (any, error) {
			return "written", nil
		},
	})

	einoTools := tb.ConvertToEinoTools("test_sess_guard")
	if len(einoTools) != 1 {
		t.Fatalf("期望转换出 1 个工具，实际 %d", len(einoTools))
	}

	inv, ok := einoTools[0].(tool.InvokableTool)
	if !ok {
		t.Fatalf("工具未实现 tool.InvokableTool")
	}

	res, err := inv.InvokableRun(context.Background(), `{"path":"test.txt","content":"hello"}`)
	if err != nil {
		t.Fatalf("InvokableRun 执行失败: %v", err)
	}

	if res == "" {
		t.Fatalf("期望输出不为空")
	}

}


func TestSkillsRegistry(t *testing.T) {
	st, cleanup := setupTestStore(t)
	defer cleanup()

	tmpDir, err := os.MkdirTemp("", "skills_reg_test_*")
	if err != nil {
		t.Fatalf("创建临时技能目录失败: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	sDir := filepath.Join(tmpDir, "sample-sop")
	_ = os.MkdirAll(sDir, 0o755)
	_ = os.WriteFile(filepath.Join(sDir, "SKILL.md"), []byte("---\nname: sample-sop\ndescription: 示例SOP\n---\n# 步骤1"), 0o644)

	sk := skills.NewSkillsRegistry(st)
	sk.SetSkillsDir(tmpDir)

	list := sk.List()
	if len(list) != 1 {
		t.Fatalf("期望技能包 1 个，实际 %d", len(list))
	}
}

func TestVerifier(t *testing.T) {
	v := verifier.NewVerifier(nil)

	// 1. Success verification
	v1 := v.Verify(context.Background(), "ok", "all checks passed", "")
	if v1.Status != verifier.VerdictPass {
		t.Fatalf("期望 VerdictPass，得到 %v", v1.Status)
	}

	// 2. Fatal error verification
	v2 := v.Verify(context.Background(), "ok", "Fatal Error: Connection refused", "")
	if v2.Status != verifier.VerdictFail {
		t.Fatalf("期望 VerdictFail，得到 %v", v2.Status)
	}
}

func TestBuildDAG(t *testing.T) {
	// 1. 合法多层依赖
	steps := []planner.PlanStep{
		{ID: "s1", Action: "tool_call", Description: "Step 1"},
		{ID: "s2", Action: "tool_call", Description: "Step 2", DependsOn: []string{"s1"}},
		{ID: "s3", Action: "tool_call", Description: "Step 3", DependsOn: []string{"s1"}},
		{ID: "s4", Action: "tool_call", Description: "Step 4", DependsOn: []string{"s2", "s3"}},
	}

	layers, err := executor.BuildDAG(steps)
	if err != nil {
		t.Fatalf("构建合法 DAG 失败: %v", err)
	}
	if len(layers) != 3 {
		t.Fatalf("期望分层为 3 层，实际得到 %d 层", len(layers))
	}
	if len(layers[0]) != 1 || layers[0][0].ID != "s1" {
		t.Fatalf("第 1 层期望为 s1")
	}
	if len(layers[1]) != 2 {
		t.Fatalf("第 2 层期望为 2 个并发任务 (s2, s3)")
	}
	if len(layers[2]) != 1 || layers[2][0].ID != "s4" {
		t.Fatalf("第 3 层期望为 s4")
	}

	// 2. 环依赖检测
	cycleSteps := []planner.PlanStep{
		{ID: "c1", Action: "tool_call", DependsOn: []string{"c2"}},
		{ID: "c2", Action: "tool_call", DependsOn: []string{"c1"}},
	}
	_, err = executor.BuildDAG(cycleSteps)
	if err == nil {
		t.Fatalf("期望检测出循环依赖错误，但未报错")
	}

	// 3. 自依赖检测
	selfCycle := []planner.PlanStep{
		{ID: "c1", Action: "tool_call", DependsOn: []string{"c1"}},
	}
	_, err = executor.BuildDAG(selfCycle)
	if err == nil {
		t.Fatalf("期望检测出自依赖错误，但未报错")
	}

	// 4. 不存在依赖检测
	missingDep := []planner.PlanStep{
		{ID: "c1", Action: "tool_call", DependsOn: []string{"c99"}},
	}
	_, err = executor.BuildDAG(missingDep)
	if err == nil {
		t.Fatalf("期望检测出依赖不存在错误，但未报错")
	}
}

func TestExecuteDAGParallel(t *testing.T) {
	st, cleanup := setupTestStore(t)
	defer cleanup()

	eb := events.NewEventBus()
	g := guard.NewPolicyGuard(true, true, st)
	tb := tools.NewToolBus(g, eb)
	vr := verifier.NewVerifier(nil)
	ex := executor.NewExecutor(tb, vr, eb)
	ex.SetMaxParallel(4)

	plan := &planner.Plan{
		ID:        "p1",
		SessionID: "s1",
		Objective: "测试并发计划执行",
		Steps: []planner.PlanStep{
			{ID: "s1", Action: "generic", Description: "Step 1 Action"},
			{ID: "s2", Action: "generic", Description: "Step 2 Action", DependsOn: []string{"s1"}},
			{ID: "s3", Action: "generic", Description: "Step 3 Action", DependsOn: []string{"s1"}},
		},
	}

	results, err := ex.ExecuteDAG(context.Background(), "t1", plan, nil)
	if err != nil {
		t.Fatalf("执行 DAG 失败: %v", err)
	}
	if len(results) != 3 {
		t.Fatalf("期望 3 个步骤结果，实际 %d", len(results))
	}
	for _, r := range results {
		if !r.OK {
			t.Fatalf("步骤 %s 执行不成功: %s", r.StepID, r.Error)
		}
	}
}

func TestAskManager(t *testing.T) {
	eb := events.NewEventBus()
	askMgr := ask.NewAskManager(eb)

	ctx := context.Background()

	// 异步答复
	go func() {
		time.Sleep(50 * time.Millisecond)
		pending := askMgr.ListPending()
		if len(pending) > 0 {
			askMgr.Answer(pending[0].AskID, "生产环境")
		}
	}()

	ans, err := askMgr.Ask(ctx, "sess_1", "请问部署到哪个环境？", []string{"测试环境", "生产环境"})
	if err != nil {
		t.Fatalf("Ask 失败: %v", err)
	}
	if ans != "生产环境" {
		t.Fatalf("期望回答 '生产环境'，得到 '%s'", ans)
	}
}

func TestRenderStepArgsAndActionExecution(t *testing.T) {
	st, cleanup := setupTestStore(t)
	defer cleanup()

	eb := events.NewEventBus()
	g := guard.NewPolicyGuard(true, true, st)
	tb := tools.NewToolBus(g, eb)
	vr := verifier.NewVerifier(nil)
	ex := executor.NewExecutor(tb, vr, eb)

	askMgr := ask.NewAskManager(eb)
	ex.SetAskManager(askMgr)

	// 1. Test template rendering
	stepOutputs := map[string]any{
		"step_1": "192.168.1.100",
		"step_2": map[string]any{
			"output": map[string]any{
				"port": 3306,
			},
		},
	}
	raw := []byte(`{"host":"{{step_1.output}}","port":"{{step_2.output.port}}"}`)
	rendered := executor.RenderStepArgs(raw, stepOutputs)
	if !strings.Contains(rendered, "192.168.1.100") || !strings.Contains(rendered, "3306") {
		t.Fatalf("RenderStepArgs 渲染结果不符合预期: %s", rendered)
	}

	// 2. Test multi-action DAG with step variable passing
	go func() {
		// Answer any ask_user step
		for i := 0; i < 20; i++ {
			time.Sleep(30 * time.Millisecond)
			pending := askMgr.ListPending()
			if len(pending) > 0 {
				_ = askMgr.Answer(pending[0].AskID, "确认通过")
				break
			}
		}
	}()

	plan := &planner.Plan{
		ID:        "plan_multi_act",
		SessionID: "sess_multi",
		Objective: "测试全类型动作与依赖数据流动",
		Steps: []planner.PlanStep{
			{
				ID:          "step_ask",
				Action:      "ask_user",
				Description: "请确认是否继续",
			},
			{
				ID:          "step_custom",
				Action:      "custom_action",
				Description: "分析目标主机配置",
				DependsOn:   []string{"step_ask"},
			},
		},
	}

	results, err := ex.ExecuteDAG(context.Background(), "trace_act", plan, nil)
	if err != nil {
		t.Fatalf("ExecuteDAG 失败: %v", err)
	}
	if len(results) != 2 {
		t.Fatalf("期望 2 个结果，实际 %d", len(results))
	}
	if !results[0].OK || results[0].Output != "确认通过" {
		t.Fatalf("ask_user 步骤结果不符合预期: %v", results[0])
	}
	if !results[1].OK || results[1].Output != "分析目标主机配置" {
		t.Fatalf("step_custom 步骤结果不符合预期: %v", results[1])
	}

	go func() {
		time.Sleep(30 * time.Millisecond)
		pending := askMgr.ListPending()
		if len(pending) > 0 {
			_ = askMgr.Answer(pending[0].AskID, "重试确认通过")
		}
	}()

	// 3. Test single-step direct retry
	retryRes := ex.ExecuteSingleStepDirect(context.Background(), "trace_retry", plan, &plan.Steps[0], nil)
	if retryRes == nil || retryRes.StepID != "step_ask" {
		t.Fatalf("单步执行重试不符合预期: %v", retryRes)
	}
}

func TestCodingFileTools(t *testing.T) {
	st, cleanup := setupTestStore(t)
	defer cleanup()

	tempDir := t.TempDir()
	wm := tools.NewWorkspaceManager(tempDir)
	eb := events.NewEventBus()
	g := guard.NewPolicyGuard(true, true, st)
	tb := tools.NewToolBus(g, eb)

	if err := tools.RegisterWorkspaceTools(tb, wm); err != nil {
		t.Fatalf("注册工作区工具失败: %v", err)
	}

	ctx := context.Background()

	// 1. Test create_file
	createRes := tb.Invoke(ctx, "tr1", "s1", "create_file", `{"path": "src/utils/math.ts", "content": "export function add(a: number, b: number) {\n  return a + b;\n}\n"}`)
	if !createRes.OK {
		t.Fatalf("create_file 失败: %s", createRes.Error)
	}

	// Test create_file duplicate without overwrite
	dupRes := tb.Invoke(ctx, "tr1", "s1", "create_file", `{"path": "src/utils/math.ts", "content": "overwrite", "overwrite": false}`)
	if dupRes.OK {
		t.Fatalf("未指定 overwrite 时重复创建应报错")
	}

	// 2. Test read_file with line numbers
	readRes := tb.Invoke(ctx, "tr1", "s1", "read_file", `{"path": "src/utils/math.ts", "start_line": 1, "end_line": 3}`)
	if !readRes.OK {
		t.Fatalf("read_file 失败: %s", readRes.Error)
	}
	readStr := fmt.Sprintf("%v", readRes.Data)
	if !strings.Contains(readStr, "1 |") || !strings.Contains(readStr, "add(a: number") {
		t.Fatalf("read_file 格式不符合预期: %v", readRes.Data)
	}

	// 3. Test apply_file_patch
	patchRes := tb.Invoke(ctx, "tr1", "s1", "apply_file_patch", `{"path": "src/utils/math.ts", "old_content": "  return a + b;", "new_content": "  // addition\n  return a + b;"}`)
	if !patchRes.OK {
		t.Fatalf("apply_file_patch 失败: %s", patchRes.Error)
	}

	// Test patch non-existent old_content
	badPatch := tb.Invoke(ctx, "tr1", "s1", "apply_file_patch", `{"path": "src/utils/math.ts", "old_content": "non_existent_code_block", "new_content": "fail"}`)
	if badPatch.OK {
		t.Fatalf("不存在的代码块应该返回报错")
	}

	// 4. Test move_file
	moveRes := tb.Invoke(ctx, "tr1", "s1", "move_file", `{"source_path": "src/utils/math.ts", "destination_path": "src/math/calc.ts"}`)
	if !moveRes.OK {
		t.Fatalf("move_file 失败: %s", moveRes.Error)
	}

	// 5. Test list_dir tree output and default ignore
	// Create ignored files to verify filtering
	_ = tb.Invoke(ctx, "tr1", "s1", "create_file", `{"path": "node_modules/axios/index.js", "content": "module.exports={}"}`)
	_ = tb.Invoke(ctx, "tr1", "s1", "create_file", `{"path": "vendor/bundle.js", "content": "bundle"}`)
	_ = tb.Invoke(ctx, "tr1", "s1", "create_file", `{"path": "src/utils/tool.ts", "content": "export const t = 1;"}`)
	_ = tb.Invoke(ctx, "tr1", "s1", "create_file", `{"path": "debug.tmp", "content": "temp"}`)

	// Test default list_dir with depth 3 and ignore filter
	listRes := tb.Invoke(ctx, "tr1", "s1", "list_dir", `{"path": "", "depth": 3, "ignore": ["*.tmp"]}`)
	if !listRes.OK {
		t.Fatalf("list_dir 失败: %s", listRes.Error)
	}
	treeStr := fmt.Sprintf("%v", listRes.Data)
	if strings.Contains(treeStr, "node_modules") || strings.Contains(treeStr, "vendor") || strings.Contains(treeStr, "debug.tmp") {
		t.Fatalf("list_dir 未正确过滤 node_modules/vendor/debug.tmp: %s", treeStr)
	}
	if !strings.Contains(treeStr, "src/") || !strings.Contains(treeStr, "calc.ts") || !strings.Contains(treeStr, "tool.ts") {
		t.Fatalf("list_dir 树形结构缺少预期内容: %s", treeStr)
	}

	searchRes := tb.Invoke(ctx, "tr1", "s1", "search_files", `{"query": "calc"}`)
	if !searchRes.OK {
		t.Fatalf("search_files 失败: %s", searchRes.Error)
	}

	// 6. Test delete_file
	delRes := tb.Invoke(ctx, "tr1", "s1", "delete_file", `{"path": "src/math/calc.ts"}`)
	if !delRes.OK {
		t.Fatalf("delete_file 失败: %s", delRes.Error)
	}

	// 7. Test Sandbox escaping prevention
	escapeRes := tb.Invoke(ctx, "tr1", "s1", "read_file", `{"path": "../../secret.txt"}`)
	if escapeRes.OK {
		t.Fatalf("路径越权访问必须被拦截")
	}
}

func TestSkillsRegistry_Local(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "skills_test_*")
	if err != nil {
		t.Fatalf("创建临时技能目录失败: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	// Create skill 1: server-troubleshooting
	s1Dir := filepath.Join(tmpDir, "server-troubleshooting")
	_ = os.MkdirAll(s1Dir, 0o755)
	s1Content := `---
name: server-troubleshooting
description: 服务器故障排查标准操作程序 (SOP)
context: inline
---
### 服务器故障排查 SOP
1. 获取系统概况
2. 过滤排查高消耗进程
`
	if err := os.WriteFile(filepath.Join(s1Dir, "SKILL.md"), []byte(s1Content), 0o644); err != nil {
		t.Fatalf("写入 SKILL.md 失败: %v", err)
	}

	// Create skill 2: db-health-check (without frontmatter header, using directory name fallback)
	s2Dir := filepath.Join(tmpDir, "db-health-check")
	_ = os.MkdirAll(s2Dir, 0o755)
	s2Content := `### 数据库健康巡检 SOP
1. MySQL 诊断
2. Redis 诊断
`
	if err := os.WriteFile(filepath.Join(s2Dir, "SKILL.md"), []byte(s2Content), 0o644); err != nil {
		t.Fatalf("写入 SKILL.md 失败: %v", err)
	}

	st, cleanup := setupTestStore(t)
	defer cleanup()

	reg := skills.NewSkillsRegistry(st)
	reg.SetSkillsDir(tmpDir)

	if reg.GetSkillsDir() != tmpDir {
		t.Fatalf("SkillsDir 不匹配: %s != %s", reg.GetSkillsDir(), tmpDir)
	}

	list := reg.List()
	if len(list) != 2 {
		t.Fatalf("预期扫描到 2 个技能，实际扫描到 %d 个", len(list))
	}

	s1, err := reg.Get("server-troubleshooting")
	if err != nil {
		t.Fatalf("获取 server-troubleshooting 失败: %v", err)
	}
	if s1.Name != "server-troubleshooting" || s1.Description != "服务器故障排查标准操作程序 (SOP)" || s1.Context != "inline" {
		t.Fatalf("server-troubleshooting 属性解析不符合预期: %+v", s1)
	}
	if !strings.Contains(s1.Instructions, "获取系统概况") {
		t.Fatalf("server-troubleshooting 指令解析不完整: %s", s1.Instructions)
	}

	s2, err := reg.Get("db-health-check")
	if err != nil {
		t.Fatalf("获取 db-health-check 失败: %v", err)
	}
	if s2.Name != "db-health-check" {
		t.Fatalf("db-health-check 名称不匹配: %s", s2.Name)
	}
}

func TestSession_CreationAndMemory(t *testing.T) {
	_, cleanup := setupTestStore(t)
	defer cleanup()

	sess := NewSession("test_session_skill", "测试会话", "", DefaultRuntime.cfg)
	if sess == nil {
		t.Fatalf("Session 创建结果为空")
	}
	if sess.WorkingMemory() == nil {
		t.Fatalf("Session 工作记忆为空")
	}
}

func TestLocalShellTool(t *testing.T) {
	ctx := context.Background()
	st, cleanup := setupTestStore(t)
	defer cleanup()

	eb := events.NewEventBus()
	g := guard.NewPolicyGuard(true, true, st)
	tb := tools.NewToolBus(g, eb)
	wm := tools.NewWorkspaceManager("")

	if err := tools.RegisterLocalShellTool(tb, wm); err != nil {
		t.Fatalf("注册 local shell 工具失败: %v", err)
	}

	// 1. Test synchronous execution
	cmdStr := "echo hello_from_tool"
	res := tb.Invoke(ctx, "tr1", "sess_test", "execute", fmt.Sprintf(`{"command": "%s"}`, cmdStr))
	if !res.OK {
		t.Fatalf("execute 工具调用失败: %s", res.Error)
	}
}

func TestAppSettingsWiring(t *testing.T) {
	rt := NewAgentRuntime()

	// 1. Test Guard Enable / Disable wiring
	cfg := core.DefaultAppSettings()
	cfg.AiEnablePermissionGuard = false
	cfg.AiBlockHighRiskCommands = false
	cfg.AiEnableWebSearch = false

	if err := rt.InitOrUpdate(cfg); err != nil {
		t.Fatalf("InitOrUpdate failed: %v", err)
	}

	lvl, _ := rt.Guard.Audit(context.Background(), "s1", "execute", "rm -rf /", guard.LevelAllow)
	if lvl != guard.LevelAllow {
		t.Fatalf("预期当 AiEnablePermissionGuard=false 时 Audit 返回 LevelAllow，实际: %s", lvl)
	}

	// 2. Test BlockHighRiskCommands wiring
	cfg.AiEnablePermissionGuard = true
	cfg.AiBlockHighRiskCommands = false
	_ = rt.InitOrUpdate(cfg)

	lvl, _ = rt.Guard.Audit(context.Background(), "s1", "execute", "rm -rf /", guard.LevelAllow)
	if lvl != guard.LevelConfirm {
		t.Fatalf("预期当 AiBlockHighRiskCommands=false 时高危指令降级为需审批 LevelConfirm，实际: %s", lvl)
	}

	cfg.AiBlockHighRiskCommands = true
	_ = rt.InitOrUpdate(cfg)
	lvl, _ = rt.Guard.Audit(context.Background(), "s1", "execute", "rm -rf /", guard.LevelAllow)
	if lvl != guard.LevelForbidden {
		t.Fatalf("预期当 AiBlockHighRiskCommands=true 时高危指令被拦截为 LevelForbidden，实际: %s", lvl)
	}

	// 3. Test WebSearch dynamic tool registration
	cfg.AiEnableWebSearch = false
	_ = rt.InitOrUpdate(cfg)
	if _, ok := rt.ToolBus.Get("web_search"); ok {
		t.Fatalf("预期 AiEnableWebSearch=false 时 web_search 工具已注销")
	}

	cfg.AiEnableWebSearch = true
	_ = rt.InitOrUpdate(cfg)
	if _, ok := rt.ToolBus.Get("web_search"); !ok {
		t.Fatalf("预期 AiEnableWebSearch=true 时 web_search 工具已成功注册")
	}

	// 4. Test active session settings propagation
	sess := rt.GetOrCreateSession("test_live_sess")
	cfg.AiSystemPrompt = "自定义更新提示词"
	_ = rt.InitOrUpdate(cfg)

	sess.mu.RLock()
	curPrompt := sess.Settings.AiSystemPrompt
	sess.mu.RUnlock()
	if curPrompt != "自定义更新提示词" {
		t.Fatalf("预期 session Settings 随 InitOrUpdate 自动同步更新，实际: %s", curPrompt)
	}
}

func TestMysqlQueryReadWriteAndGuard(t *testing.T) {
	st, cleanup := setupTestStore(t)
	defer cleanup()

	g := guard.NewPolicyGuard(true, true, st)

	// 1. SELECT query -> LevelAllow
	lvl, _ := g.Audit(context.Background(), "s1", "db_mysql_query", `{"sql": "SELECT id, name FROM users WHERE status = 1"}`, guard.LevelAllow)
	if lvl != guard.LevelAllow {
		t.Fatalf("预期 SELECT 查询自动放行 LevelAllow，实际: %s", lvl)
	}

	// 2. SHOW / DESCRIBE / EXPLAIN -> LevelAllow
	lvl, _ = g.Audit(context.Background(), "s1", "db_mysql_query", `{"sql": "SHOW TABLES"}`, guard.LevelAllow)
	if lvl != guard.LevelAllow {
		t.Fatalf("预期 SHOW TABLES 自动放行 LevelAllow，实际: %s", lvl)
	}

	lvl, _ = g.Audit(context.Background(), "s1", "db_mysql_query", `{"sql": "DESCRIBE users"}`, guard.LevelAllow)
	if lvl != guard.LevelAllow {
		t.Fatalf("预期 DESCRIBE 自动放行 LevelAllow，实际: %s", lvl)
	}

	// 3. Write / DML / DDL operations -> LevelConfirm
	lvl, reason := g.Audit(context.Background(), "s1", "db_mysql_query", `{"sql": "INSERT INTO users (name) VALUES ('alice')"}`, guard.LevelAllow)
	if lvl != guard.LevelConfirm {
		t.Fatalf("预期 INSERT 操作返回 LevelConfirm，实际: %s, reason: %s", lvl, reason)
	}

	lvl, _ = g.Audit(context.Background(), "s1", "db_mysql_query", `{"sql": "UPDATE users SET status = 2 WHERE id = 10"}`, guard.LevelAllow)
	if lvl != guard.LevelConfirm {
		t.Fatalf("预期 UPDATE 操作返回 LevelConfirm，实际: %s", lvl)
	}

	lvl, _ = g.Audit(context.Background(), "s1", "db_mysql_query", `{"sql": "DELETE FROM users WHERE id = 10"}`, guard.LevelAllow)
	if lvl != guard.LevelConfirm {
		t.Fatalf("预期 DELETE 操作返回 LevelConfirm，实际: %s", lvl)
	}

	lvl, _ = g.Audit(context.Background(), "s1", "db_mysql_query", `{"sql": "ALTER TABLE users ADD COLUMN age INT"}`, guard.LevelAllow)
	if lvl != guard.LevelConfirm {
		t.Fatalf("预期 ALTER TABLE 操作返回 LevelConfirm，实际: %s", lvl)
	}

	// 4. High-risk destructive commands -> LevelForbidden when blockHighRiskCommands=true
	lvl, _ = g.Audit(context.Background(), "s1", "db_mysql_query", `{"sql": "DROP DATABASE production_db"}`, guard.LevelAllow)
	if lvl != guard.LevelForbidden {
		t.Fatalf("预期 DROP DATABASE 被拦截为 LevelForbidden，实际: %s", lvl)
	}

	// 5. When blockHighRiskCommands=false -> degrades to LevelConfirm
	g.SetBlockHighRiskCommands(false)
	lvl, _ = g.Audit(context.Background(), "s1", "db_mysql_query", `{"sql": "DROP DATABASE production_db"}`, guard.LevelAllow)
	if lvl != guard.LevelConfirm {
		t.Fatalf("预期当 blockHighRiskCommands=false 时降级为 LevelConfirm，实际: %s", lvl)
	}

	// 6. When enableGuard=false -> directly LevelAllow
	g.SetEnableGuard(false)
	lvl, _ = g.Audit(context.Background(), "s1", "db_mysql_query", `{"sql": "DROP DATABASE production_db"}`, guard.LevelAllow)
	if lvl != guard.LevelAllow {
		t.Fatalf("预期当 enableGuard=false 时所有 SQL 均放行 LevelAllow，实际: %s", lvl)
	}
}

func TestSqliteQueryReadWriteAndGuard(t *testing.T) {
	st, cleanup := setupTestStore(t)
	defer cleanup()

	g := guard.NewPolicyGuard(true, true, st)

	// 1. SELECT query -> LevelAllow
	lvl, _ := g.Audit(context.Background(), "s1", "db_sqlite_query", `{"sql": "SELECT id, title FROM todos WHERE completed = 0"}`, guard.LevelAllow)
	if lvl != guard.LevelAllow {
		t.Fatalf("预期 SELECT 查询自动放行 LevelAllow，实际: %s", lvl)
	}

	// 2. PRAGMA / EXPLAIN / VALUES -> LevelAllow
	lvl, _ = g.Audit(context.Background(), "s1", "db_sqlite_query", `{"sql": "PRAGMA table_info(todos)"}`, guard.LevelAllow)
	if lvl != guard.LevelAllow {
		t.Fatalf("预期 PRAGMA 自动放行 LevelAllow，实际: %s", lvl)
	}

	lvl, _ = g.Audit(context.Background(), "s1", "db_sqlite_query", `{"sql": "EXPLAIN QUERY PLAN SELECT * FROM todos"}`, guard.LevelAllow)
	if lvl != guard.LevelAllow {
		t.Fatalf("预期 EXPLAIN 自动放行 LevelAllow，实际: %s", lvl)
	}

	// 3. Write / DML / DDL operations -> LevelConfirm
	lvl, reason := g.Audit(context.Background(), "s1", "db_sqlite_query", `{"sql": "INSERT INTO todos (title) VALUES ('Buy milk')"}`, guard.LevelAllow)
	if lvl != guard.LevelConfirm {
		t.Fatalf("预期 INSERT 操作返回 LevelConfirm，实际: %s, reason: %s", lvl, reason)
	}

	lvl, _ = g.Audit(context.Background(), "s1", "db_sqlite_query", `{"sql": "UPDATE todos SET completed = 1 WHERE id = 1"}`, guard.LevelAllow)
	if lvl != guard.LevelConfirm {
		t.Fatalf("预期 UPDATE 操作返回 LevelConfirm，实际: %s", lvl)
	}

	lvl, _ = g.Audit(context.Background(), "s1", "db_sqlite_query", `{"sql": "DELETE FROM todos WHERE id = 1"}`, guard.LevelAllow)
	if lvl != guard.LevelConfirm {
		t.Fatalf("预期 DELETE 操作返回 LevelConfirm，实际: %s", lvl)
	}

	lvl, _ = g.Audit(context.Background(), "s1", "db_sqlite_query", `{"sql": "CREATE TABLE logs (id INTEGER PRIMARY KEY, msg TEXT)"}`, guard.LevelAllow)
	if lvl != guard.LevelConfirm {
		t.Fatalf("预期 CREATE TABLE 操作返回 LevelConfirm，实际: %s", lvl)
	}

	// 4. High-risk destructive commands -> LevelForbidden when blockHighRiskCommands=true
	lvl, _ = g.Audit(context.Background(), "s1", "db_sqlite_query", `{"sql": "ATTACH DATABASE '/etc/passwd' AS shadow"}`, guard.LevelAllow)
	if lvl != guard.LevelForbidden {
		t.Fatalf("预期 ATTACH DATABASE 被拦截为 LevelForbidden，实际: %s", lvl)
	}

	// 5. When blockHighRiskCommands=false -> degrades to LevelConfirm
	g.SetBlockHighRiskCommands(false)
	lvl, _ = g.Audit(context.Background(), "s1", "db_sqlite_query", `{"sql": "ATTACH DATABASE '/etc/passwd' AS shadow"}`, guard.LevelAllow)
	if lvl != guard.LevelConfirm {
		t.Fatalf("预期当 blockHighRiskCommands=false 时降级为 LevelConfirm，实际: %s", lvl)
	}

	// 6. When enableGuard=false -> directly LevelAllow
	g.SetEnableGuard(false)
	lvl, _ = g.Audit(context.Background(), "s1", "db_sqlite_query", `{"sql": "ATTACH DATABASE '/etc/passwd' AS shadow"}`, guard.LevelAllow)
	if lvl != guard.LevelAllow {
		t.Fatalf("预期当 enableGuard=false 时所有 SQL 均放行 LevelAllow，实际: %s", lvl)
	}
}

func TestSqliteToolsFullSuite(t *testing.T) {
	st, cleanup := setupTestStore(t)
	defer cleanup()

	tmpDir := t.TempDir()
	dbFile := filepath.Join(tmpDir, "test.db")
	_ = os.WriteFile(dbFile, nil, 0644)

	sqMgr := db.NewSqliteManager()
	if err := sqMgr.Open("conn1", dbFile); err != nil {
		t.Fatalf("打开 SQLite 失败: %v", err)
	}
	defer sqMgr.CloseAll()

	// Create sample table
	_, err := sqMgr.SqliteRun("conn1", "CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL)")
	if err != nil {
		t.Fatalf("创建表失败: %v", err)
	}
	_, _ = sqMgr.SqliteRun("conn1", "INSERT INTO users (name) VALUES ('Alice'), ('Bob')")

	eb := events.NewEventBus()
	g := guard.NewPolicyGuard(true, true, st)
	bus := tools.NewToolBus(g, eb)
	err = tools.RegisterDatabaseTools(bus, tools.DatabaseManagers{
		SqliteMgr: sqMgr,
	})
	if err != nil {
		t.Fatalf("注册数据库工具失败: %v", err)
	}

	// 1. Test db_sqlite_list_tables with active connection fallback (empty file_id)
	tools.SetActiveConnection(&tools.ActiveConnectionInfo{
		Protocol: "sqlite",
		ID:       "conn1",
		Path:     dbFile,
	})
	defer tools.SetActiveConnection(nil)
	res := bus.Invoke(context.Background(), "t1", "s1", "db_sqlite_list_tables", `{"file_id": ""}`)
	if !res.OK {
		t.Fatalf("调用 db_sqlite_list_tables (空 file_id 主动感知) 失败: %v", res.Error)
	}
	resStr := fmt.Sprintf("%v", res.Data)
	if !strings.Contains(resStr, "users") {
		t.Fatalf("db_sqlite_list_tables 输出未包含 users 表: %s", resStr)
	}

	// 3. Test db_sqlite_schema
	res = bus.Invoke(context.Background(), "t3", "s1", "db_sqlite_schema", `{"file_id": ""}`)
	if !res.OK {
		t.Fatalf("调用 db_sqlite_schema 失败: %v", res.Error)
	}
	resStr = fmt.Sprintf("%v", res.Data)
	if !strings.Contains(resStr, "users") || !strings.Contains(resStr, "name") {
		t.Fatalf("db_sqlite_schema 输出未包含 users 字段信息: %s", resStr)
	}

	// 4. Test db_sqlite_query (auto-resolve single connection when file_id is empty)
	res = bus.Invoke(context.Background(), "t4", "s1", "db_sqlite_query", `{"sql": "SELECT * FROM users"}`)
	if !res.OK {
		t.Fatalf("调用 db_sqlite_query 失败: %v", res.Error)
	}
	resStr = fmt.Sprintf("%v", res.Data)
	if !strings.Contains(resStr, "Alice") || !strings.Contains(resStr, "Bob") {
		t.Fatalf("db_sqlite_query 输出未包含查询记录: %s", resStr)
	}
}

func TestPostgresToolsRegistration(t *testing.T) {
	st, cleanup := setupTestStore(t)
	defer cleanup()

	pgMgr := db.NewPostgresManager()
	eb := events.NewEventBus()
	g := guard.NewPolicyGuard(true, true, st)
	bus := tools.NewToolBus(g, eb)

	err := tools.RegisterDatabaseTools(bus, tools.DatabaseManagers{
		PostgresMgr: pgMgr,
	})
	if err != nil {
		t.Fatalf("注册 PostgreSQL 数据库工具失败: %v", err)
	}

	toolList := bus.List()
	expectedTools := []string{
		"db_postgres_databases",
		"db_postgres_tables",
		"db_postgres_query",
	}

	for _, expected := range expectedTools {
		found := false
		for _, tool := range toolList {
			if tool.Name == expected {
				found = true
				break
			}
		}
		if !found {
			t.Fatalf("预期工具 [%s] 未成功注册到 ToolBus", expected)
		}
	}
}

func TestDockerAndK8sToolsRegistrationAndGuard(t *testing.T) {
	st, cleanup := setupTestStore(t)
	defer cleanup()

	dkm := docker.NewDockerManager()
	km := k8s.NewK8sManager()
	eb := events.NewEventBus()
	g := guard.NewPolicyGuard(true, true, st)
	bus := tools.NewToolBus(g, eb)

	err := tools.RegisterDockerTools(bus, dkm, nil)
	if err != nil {
		t.Fatalf("注册 Docker 工具失败: %v", err)
	}
	err = tools.RegisterK8sTools(bus, km, nil)
	if err != nil {
		t.Fatalf("注册 K8s 工具失败: %v", err)
	}

	toolList := bus.List()
	expectedTools := []string{
		"docker_execute",
		"docker_exec",
		"docker_orchestrate",
		"k8s_kubectl_execute",
		"kubectl_exec",
		"k8s_exec",
		"k8s_orchestrate",
	}

	for _, expected := range expectedTools {
		found := false
		for _, tool := range toolList {
			if tool.Name == expected {
				found = true
				break
			}
		}
		if !found {
			t.Fatalf("预期工具 [%s] 未成功注册到 ToolBus", expected)
		}
	}

	// 2. Test PolicyGuard for Docker commands
	lvl, _ := g.Audit(context.Background(), "s1", "docker_execute", `{"command": "docker ps -a"}`, guard.LevelAllow)
	if lvl != guard.LevelAllow {
		t.Fatalf("预期 docker ps 为 LevelAllow，实际: %s", lvl)
	}
	lvl, _ = g.Audit(context.Background(), "s1", "docker_execute", `{"command": "docker logs -n 50 app"}`, guard.LevelAllow)
	if lvl != guard.LevelAllow {
		t.Fatalf("预期 docker logs 为 LevelAllow，实际: %s", lvl)
	}
	lvl, _ = g.Audit(context.Background(), "s1", "docker_execute", `{"command": "docker stop my-container"}`, guard.LevelAllow)
	if lvl != guard.LevelConfirm {
		t.Fatalf("预期 docker stop 为 LevelConfirm，实际: %s", lvl)
	}
	lvl, _ = g.Audit(context.Background(), "s1", "docker_execute", `{"command": "docker rm -f $(docker ps -a -q)"}`, guard.LevelAllow)
	if lvl != guard.LevelForbidden {
		t.Fatalf("预期高危 docker rm 批处理为 LevelForbidden，实际: %s", lvl)
	}
	// docker_execute 明确不支持部署/下线操作测试
	lvl, reason := g.Audit(context.Background(), "s1", "docker_execute", `{"command": "docker run -d --name test nginx"}`, guard.LevelAllow)
	if lvl != guard.LevelForbidden || !strings.Contains(reason, "明确不支持部署/下线操作") {
		t.Fatalf("预期 docker run 为 LevelForbidden 且包含明确不支持提示，实际: %s, %s", lvl, reason)
	}
	lvl, reason = g.Audit(context.Background(), "s1", "docker_execute", `{"command": "docker compose up -d"}`, guard.LevelAllow)
	if lvl != guard.LevelForbidden || !strings.Contains(reason, "明确不支持部署/下线操作") {
		t.Fatalf("预期 docker compose up 为 LevelForbidden 且包含明确不支持提示，实际: %s, %s", lvl, reason)
	}
	lvl, reason = g.Audit(context.Background(), "s1", "docker_execute", `{"command": "docker compose down"}`, guard.LevelAllow)
	if lvl != guard.LevelForbidden || !strings.Contains(reason, "明确不支持部署/下线操作") {
		t.Fatalf("预期 docker compose down 为 LevelForbidden 且包含明确不支持提示，实际: %s, %s", lvl, reason)
	}

	// 3. Test PolicyGuard for Docker Exec
	lvl, _ = g.Audit(context.Background(), "s1", "docker_exec", `{"command": "docker exec -it web ls -la /app"}`, guard.LevelAllow)
	if lvl != guard.LevelAllow {
		t.Fatalf("预期 docker exec ls 为 LevelAllow，实际: %s", lvl)
	}
	lvl, _ = g.Audit(context.Background(), "s1", "docker_exec", `{"command": "docker exec -it web apt update"}`, guard.LevelAllow)
	if lvl != guard.LevelConfirm {
		t.Fatalf("预期 docker exec apt update 为 LevelConfirm，实际: %s", lvl)
	}
	lvl, _ = g.Audit(context.Background(), "s1", "docker_exec", `{"command": "docker exec -it web rm -rf /"}`, guard.LevelAllow)
	if lvl != guard.LevelForbidden {
		t.Fatalf("预期 docker exec rm -rf / 为 LevelForbidden，实际: %s", lvl)
	}

	// 4. Test PolicyGuard for Kubectl commands
	lvl, _ = g.Audit(context.Background(), "s1", "k8s_kubectl_execute", `{"command": "kubectl get pods -n default"}`, guard.LevelAllow)
	if lvl != guard.LevelAllow {
		t.Fatalf("预期 kubectl get pods 为 LevelAllow，实际: %s", lvl)
	}
	lvl, _ = g.Audit(context.Background(), "s1", "k8s_kubectl_execute", `{"command": "kubectl scale deployment app --replicas=3 -n default"}`, guard.LevelAllow)
	if lvl != guard.LevelConfirm {
		t.Fatalf("预期 kubectl scale 为 LevelConfirm，实际: %s", lvl)
	}
	lvl, _ = g.Audit(context.Background(), "s1", "k8s_kubectl_execute", `{"command": "kubectl delete namespace kube-system"}`, guard.LevelAllow)
	if lvl != guard.LevelForbidden {
		t.Fatalf("预期 kubectl delete namespace kube-system 为 LevelForbidden，实际: %s", lvl)
	}
	// k8s_kubectl_execute 明确不支持部署/下线操作测试
	lvl, reason = g.Audit(context.Background(), "s1", "k8s_kubectl_execute", `{"command": "kubectl apply -f app.yaml"}`, guard.LevelAllow)
	if lvl != guard.LevelForbidden || !strings.Contains(reason, "明确不支持部署/下线操作") {
		t.Fatalf("预期 kubectl apply 为 LevelForbidden 且包含明确不支持提示，实际: %s, %s", lvl, reason)
	}
	lvl, reason = g.Audit(context.Background(), "s1", "k8s_kubectl_execute", `{"command": "kubectl create deployment nginx --image=nginx"}`, guard.LevelAllow)
	if lvl != guard.LevelForbidden || !strings.Contains(reason, "明确不支持部署/下线操作") {
		t.Fatalf("预期 kubectl create 为 LevelForbidden 且包含明确不支持提示，实际: %s, %s", lvl, reason)
	}
	lvl, reason = g.Audit(context.Background(), "s1", "k8s_kubectl_execute", `{"command": "kubectl delete -f app.yaml"}`, guard.LevelAllow)
	if lvl != guard.LevelForbidden || !strings.Contains(reason, "明确不支持部署/下线操作") {
		t.Fatalf("预期 kubectl delete -f 为 LevelForbidden 且包含明确不支持提示，实际: %s, %s", lvl, reason)
	}

	// 5. Test PolicyGuard for Kubectl Exec
	lvl, _ = g.Audit(context.Background(), "s1", "kubectl_exec", `{"command": "kubectl exec my-pod -n default -- cat /etc/hosts"}`, guard.LevelAllow)
	if lvl != guard.LevelAllow {
		t.Fatalf("预期 kubectl exec cat 为 LevelAllow，实际: %s", lvl)
	}
	lvl, _ = g.Audit(context.Background(), "s1", "kubectl_exec", `{"command": "kubectl exec my-pod -n default -- rm /tmp/test"}`, guard.LevelAllow)
	if lvl != guard.LevelConfirm {
		t.Fatalf("预期 kubectl exec rm 为 LevelConfirm，实际: %s", lvl)
	}
	lvl, _ = g.Audit(context.Background(), "s1", "kubectl_exec", `{"command": "kubectl exec my-pod -n default -- rm -rf /"}`, guard.LevelAllow)
	if lvl != guard.LevelForbidden {
		t.Fatalf("预期 kubectl exec rm -rf / 为 LevelForbidden，实际: %s", lvl)
	}

	// 6. Test PolicyGuard and execution for k8s_orchestrate
	lvl, _ = g.Audit(context.Background(), "s1", "k8s_orchestrate", `{"action": "list"}`, guard.LevelAllow)
	if lvl != guard.LevelAllow {
		t.Fatalf("预期 k8s_orchestrate list 为 LevelAllow，实际: %s", lvl)
	}
	lvl, _ = g.Audit(context.Background(), "s1", "k8s_orchestrate", `{"action": "apply", "name": "nginx-demo", "yaml": "apiVersion: v1\nkind: Pod\nmetadata:\n  name: nginx"}`, guard.LevelAllow)
	if lvl != guard.LevelConfirm {
		t.Fatalf("预期 k8s_orchestrate apply 为 LevelConfirm，实际: %s", lvl)
	}
	lvl, _ = g.Audit(context.Background(), "s1", "k8s_orchestrate", `{"action": "delete", "name": "nginx-demo"}`, guard.LevelAllow)
	if lvl != guard.LevelConfirm {
		t.Fatalf("预期 k8s_orchestrate delete 为 LevelConfirm，实际: %s", lvl)
	}
	lvl, _ = g.Audit(context.Background(), "s1", "k8s_orchestrate", `{"action": "delete", "yaml": "apiVersion: v1\nkind: Namespace\nmetadata:\n  name: kube-system"}`, guard.LevelAllow)
	if lvl != guard.LevelForbidden {
		t.Fatalf("预期 k8s_orchestrate delete kube-system 为 LevelForbidden，实际: %s", lvl)
	}

	// Test invoke k8s_orchestrate list with nil store (safe fallback)
	res := bus.Invoke(context.Background(), "t3", "s1", "k8s_orchestrate", `{"action": "list"}`)
	if !res.OK {
		t.Fatalf("调用 k8s_orchestrate list 失败: %v", res.Error)
	}

	// 7. Test PolicyGuard and execution for docker_orchestrate
	lvl, _ = g.Audit(context.Background(), "s1", "docker_orchestrate", `{"action": "list"}`, guard.LevelAllow)
	if lvl != guard.LevelAllow {
		t.Fatalf("预期 docker_orchestrate list 为 LevelAllow，实际: %s", lvl)
	}
	lvl, _ = g.Audit(context.Background(), "s1", "docker_orchestrate", `{"action": "apply", "name": "web-stack", "yaml_content": "version: '3.8'\nservices:\n  web:\n    image: nginx"}`, guard.LevelAllow)
	if lvl != guard.LevelConfirm {
		t.Fatalf("预期 docker_orchestrate apply 为 LevelConfirm，实际: %s", lvl)
	}
	lvl, _ = g.Audit(context.Background(), "s1", "docker_orchestrate", `{"action": "up", "name": "web-stack"}`, guard.LevelAllow)
	if lvl != guard.LevelConfirm {
		t.Fatalf("预期 docker_orchestrate up 为 LevelConfirm，实际: %s", lvl)
	}
	lvl, _ = g.Audit(context.Background(), "s1", "docker_orchestrate", `{"action": "delete", "name": "web-stack"}`, guard.LevelAllow)
	if lvl != guard.LevelConfirm {
		t.Fatalf("预期 docker_orchestrate delete 为 LevelConfirm，实际: %s", lvl)
	}
	lvl, _ = g.Audit(context.Background(), "s1", "docker_orchestrate", `{"action": "down", "name": "web-stack"}`, guard.LevelAllow)
	if lvl != guard.LevelConfirm {
		t.Fatalf("预期 docker_orchestrate down 为 LevelConfirm，实际: %s", lvl)
	}

	// Test invoke docker_orchestrate list with nil store (safe fallback)
	res = bus.Invoke(context.Background(), "t4", "s1", "docker_orchestrate", `{"action": "list"}`)
	if !res.OK {
		t.Fatalf("调用 docker_orchestrate list 失败: %v", res.Error)
	}
}

func TestActiveConnectionPerceptionAndFallback(t *testing.T) {
	tools.SetActiveConnection(nil)
	defer tools.SetActiveConnection(nil)

	r := NewAgentRuntime()

	// 1. Initially nil
	if r.GetActiveConnection() != nil {
		t.Fatalf("初始活跃连接应为 nil")
	}

	// 2. Set active connection on runtime
	testConn := &ActiveConnectionInfo{
		Protocol: "mysql",
		ID:       "mysql_prod_01",
		Name:     "生产主库",
		Host:     "10.0.0.88",
		Port:     3306,
		Database: "mall_db",
	}
	r.SetActiveConnection(testConn)

	got := r.GetActiveConnection()
	if got == nil || got.ID != "mysql_prod_01" || got.Database != "mall_db" {
		t.Fatalf("获取活跃连接不符合预期: %+v", got)
	}

	// Verify tools.GetActiveConnection is synchronized
	toolsGot := tools.GetActiveConnection()
	if toolsGot == nil || toolsGot.ID != "mysql_prod_01" || toolsGot.Database != "mall_db" {
		t.Fatalf("tools.GetActiveConnection 同步不符合预期: %+v", toolsGot)
	}

	// 3. Clear active connection
	r.SetActiveConnection(nil)
	if r.GetActiveConnection() != nil {
		t.Fatalf("清理活跃连接后应为 nil")
	}
	if tools.GetActiveConnection() != nil {
		t.Fatalf("清理活跃连接后 tools.GetActiveConnection 应为 nil")
	}
}



