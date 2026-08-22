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
	"terminal/agent/job"
	"terminal/agent/memory"
	"terminal/agent/planner"
	"terminal/agent/router"
	"terminal/agent/skills"
	"terminal/agent/store"
	"terminal/agent/subagent"
	"terminal/agent/tools"
	"terminal/agent/verifier"
	"terminal/agent/workflow"
	"terminal/core"

	"github.com/cloudwego/eino/components/tool"
)

func setupTestStore(t *testing.T) (*store.Store, func()) {
	tmpDir, err := os.MkdirTemp("", "xagent_test_*")
	if err != nil {
		t.Fatalf("创建临时目录失败: %v", err)
	}
	dbPath := filepath.Join(tmpDir, "test_xagent.db")
	st, err := store.NewStore(dbPath)
	if err != nil {
		t.Fatalf("创建测试数据库失败: %v", err)
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

	// 1. Session & Messages
	sess := store.SessionItem{
		ID:        "test_sess_1",
		Title:     "测试会话",
		CreatedAt: time.Now().UnixMilli(),
		UpdatedAt: time.Now().UnixMilli(),
	}
	if err := st.SaveSession(sess); err != nil {
		t.Fatalf("保存会话失败: %v", err)
	}
	sessions, err := st.ListSessions()
	if err != nil || len(sessions) == 0 {
		t.Fatalf("获取会话列表失败: %v", err)
	}

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

	// 2. Audit Log
	if err := st.AddAuditLog(store.AuditLogItem{
		TraceID:    "trace_1",
		SessionID:  "test_sess_1",
		Tool:       "workspace_read_file",
		Input:      `{"path": "README.md"}`,
		Decision:   "allow",
		DurationMs: 15,
	}); err != nil {
		t.Fatalf("记录审计日志失败: %v", err)
	}
	logs, err := st.ListAuditLogs("test_sess_1", 10)
	if err != nil || len(logs) == 0 || logs[0].Tool != "workspace_read_file" {
		t.Fatalf("查询审计日志失败: %v", err)
	}

	// 3. Memory
	if err := st.SaveMemory(store.MemoryItem{
		Kind:    "semantic",
		Content: "Redis 运行在 6379 端口",
		Tags:    "redis,port",
	}); err != nil {
		t.Fatalf("保存记忆失败: %v", err)
	}
	mems, err := st.QueryMemories("Redis", "", 5)
	if err != nil || len(mems) == 0 {
		t.Fatalf("检索记忆失败: %v", err)
	}
}

func TestPolicyGuardAndAuthorizationMemory(t *testing.T) {
	st, cleanup := setupTestStore(t)
	defer cleanup()

	g := guard.NewPolicyGuard(true, true, st)

	// 1. Readonly tool should allow
	lvl, _ := g.Audit(context.Background(), "s1", "read_file", `{"path": "a.txt"}`, guard.LevelAllow)
	if lvl != guard.LevelAllow {
		t.Fatalf("期望 LevelAllow，得到 %v", lvl)
	}

	// 2. Delete / Move tool should confirm
	lvl, _ = g.Audit(context.Background(), "s1", "delete_file", `{"path": "a.txt"}`, guard.LevelConfirm)
	if lvl != guard.LevelConfirm {
		t.Fatalf("期望 LevelConfirm，得到 %v", lvl)
	}

	// 3. Dangerous Shell command should be forbidden (both remote ssh_exec_command and local execute)
	lvl, reason := g.Audit(context.Background(), "s1", "ssh_exec_command", `rm -rf /`, guard.LevelConfirm)
	if lvl != guard.LevelForbidden {
		t.Fatalf("期望 LevelForbidden，得到 %v (理由: %s)", lvl, reason)
	}

	lvl, reason = g.Audit(context.Background(), "s1", "execute", `{"command": "rm -rf /*"}`, guard.LevelConfirm)
	if lvl != guard.LevelForbidden {
		t.Fatalf("本地危险命令期望 LevelForbidden，得到 %v (理由: %s)", lvl, reason)
	}

	lvl, _ = g.Audit(context.Background(), "s1", "execute", `{"command": "git status"}`, guard.LevelConfirm)
	if lvl != guard.LevelConfirm {
		t.Fatalf("本地安全命令期望 LevelConfirm，得到 %v", lvl)
	}

	// 4. Test authorization memory (Remember for session)
	g.RememberAuthorization("s1", "delete_file", 30*time.Minute)
	lvl, _ = g.Audit(context.Background(), "s1", "delete_file", `{"path": "a.txt"}`, guard.LevelConfirm)
	if lvl != guard.LevelAllow {
		t.Fatalf("记住授权后期望 LevelAllow，得到 %v", lvl)
	}
}

func TestToolBusGuardWrappedEinoTool(t *testing.T) {
	st, cleanup := setupTestStore(t)
	defer cleanup()

	eb := events.NewEventBus()
	g := guard.NewPolicyGuard(true, true, st)
	tb := tools.NewToolBus(g, eb)

	// Register a tool with LevelConfirm
	tb.Register(&tools.RegisteredTool{
		Name:        "custom_write_file",
		Description: "写文件",
		Level:       guard.LevelConfirm,
		Handler: func(ctx context.Context, input string) (any, error) {
			return "written", nil
		},
	})

	einoTools := tb.ConvertToEinoTools("test_sess_guard")
	if len(einoTools) != 1 {
		t.Fatalf("期望转换出 1 个工具，实际 %d", len(einoTools))
	}

	// In background, approve the pending request
	go func() {
		for i := 0; i < 50; i++ {
			time.Sleep(10 * time.Millisecond)
			pending := g.ListPendingApprovals()
			if len(pending) > 0 {
				g.DecideApproval(pending[0].ConfirmID, guard.ApprovalDecision{
					Approved: true,
					Remember: false,
				})
				return
			}
		}
	}()

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

	// Verify audit log was recorded in SQLite
	logs, err := st.ListAuditLogs("test_sess_guard", 10)
	if err != nil || len(logs) == 0 {
		t.Fatalf("期望产生审计日志，实际未找到")
	}
	if logs[0].Tool != "custom_write_file" || logs[0].Decision != "approved" {
		t.Fatalf("审计日志记录不符合预期: %+v", logs[0])
	}
}

func TestJobManager(t *testing.T) {
	st, cleanup := setupTestStore(t)
	defer cleanup()

	eb := events.NewEventBus()
	jm := job.NewJobManager(st, eb)

	jobID := jm.Submit(context.Background(), "s1", "test_job", func(jobCtx context.Context, emitProgress job.ProgressFunc) (string, error) {
		emitProgress(0.5, "进行中", "chunk 1 output\n")
		emitProgress(1.0, "完成", "chunk 2 output\n")
		return "执行成功", nil
	})

	time.Sleep(50 * time.Millisecond)

	j, err := jm.GetJob(jobID)
	if err != nil || j == nil {
		t.Fatalf("获取 Job 失败: %v", err)
	}
	if j.State != string(job.StateCompleted) {
		t.Fatalf("期望 Job 状态为 completed，得到 %s", j.State)
	}
	if j.StartedAt == 0 {
		t.Fatalf("期望 StartedAt 被持久化，得到 0")
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

func TestWorkflowEngine(t *testing.T) {
	st, cleanup := setupTestStore(t)
	defer cleanup()

	eb := events.NewEventBus()
	wfEng := workflow.NewWorkflowEngine(eb)
	wfEng.SetStore(st)

	// Save a workflow
	err := st.SaveWorkflow(store.WorkflowItem{
		Name:        "diag_flow",
		Description: "系统诊断工作流",
		Script:      `{"name":"diag_flow","steps":[{"name":"step1","tool_name":"ping","args":{"host":"127.0.0.1"}}]}`,
		Version:     1,
	})
	if err != nil {
		t.Fatalf("保存工作流失败: %v", err)
	}

	wf, err := st.GetWorkflow("diag_flow")
	if err != nil || wf == nil || wf.Name != "diag_flow" {
		t.Fatalf("读取工作流失败: %v", err)
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

func TestLocalExecutor(t *testing.T) {
	wm := tools.NewWorkspaceManager("")
	exec := job.NewLocalExecutor(wm)

	var outputLines []string
	err := exec.Execute(context.Background(), job.ExecSpec{
		Target:     "local",
		Command:    "echo 'xagent-exec-ok'",
		TimeoutSec: 10,
	}, func(line string) {
		outputLines = append(outputLines, line)
	})

	if err != nil {
		t.Fatalf("LocalExecutor 执行失败: %v", err)
	}
	joined := strings.Join(outputLines, " ")
	if !strings.Contains(joined, "xagent-exec-ok") {
		t.Fatalf("输出未包含预期内容: %s", joined)
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

func TestMemoryRecall(t *testing.T) {
	st, cleanup := setupTestStore(t)
	defer cleanup()

	memSys := memory.NewMemorySystem(st)

	// Save episodic and semantic memories
	err := memSys.SaveEpisodic("sess_100", "用户已排查完 MySQL 连接数告警并调整了最大连接参数", "mysql,connections")
	if err != nil {
		t.Fatalf("SaveEpisodic 失败: %v", err)
	}

	err = memSys.SaveFact("semantic", "MySQL 实例端口为 3306", "mysql,port", "sess_100")
	if err != nil {
		t.Fatalf("SaveFact 失败: %v", err)
	}

	// Recall with query
	results := memSys.Recall(context.Background(), "MySQL", 5)
	if len(results) < 2 {
		t.Fatalf("期望检索到至少 2 条记忆，实际 %d", len(results))
	}

	// Recall with source filter
	filtered := memSys.RecallWithSource(context.Background(), "MySQL", "sess_100", 5)
	if len(filtered) < 2 {
		t.Fatalf("期望按 source 检索到至少 2 条记忆，实际 %d", len(filtered))
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

	jm := job.NewJobManager(st, eb)
	jm.RegisterExecutor("local", job.NewLocalExecutor(tools.NewWorkspaceManager("")))
	askMgr := ask.NewAskManager(eb)
	wf := workflow.NewWorkflowEngine(eb)
	wf.SetStore(st)
	sm := subagent.NewSubagentManager(st, eb, func(ctx context.Context, subID, prompt string) (string, error) {
		return "子代理推导结果: " + prompt, nil
	})

	ex.SetManagers(jm, sm, wf, askMgr)

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
				ID:          "step_sub",
				Action:      "subagent",
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
	if !results[1].OK || !strings.Contains(fmt.Sprintf("%v", results[1].Output), "子代理推导结果") {
		t.Fatalf("subagent 步骤结果不符合预期: %v", results[1])
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
	g.RememberAuthorization("s1", "move_file", time.Hour)
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
	g.RememberAuthorization("s1", "delete_file", time.Hour)
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

func TestSession_BuildRunner_WithSkillMiddleware(t *testing.T) {
	ctx := context.Background()
	st, cleanup := setupTestStore(t)
	defer cleanup()

	r := router.NewModelRouter()
	r.SetProfile(router.RoleDefault, router.ModelProfile{
		BaseURL: "https://api.openai.com/v1",
		APIKey:  "sk-test-mock-key",
		Model:   "gpt-4o-mini",
	})

	eb := events.DefaultEventBus
	g := guard.NewPolicyGuard(true, true, st)
	tb := tools.NewToolBus(g, eb)

	sess := NewSession("test_session_skill", "测试技能中间件会话", "", DefaultRuntime.cfg)
	err := sess.BuildRunner(ctx, r, tb)
	if err != nil {
		t.Fatalf("构建集成 Skill 中间件的 ADK Runner 失败: %v", err)
	}

	if sess.GetRunner() == nil {
		t.Fatalf("ADK Runner 构建结果为空")
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
	jm := job.NewJobManager(st, eb)
	jm.RegisterExecutor("local", job.NewLocalExecutor(wm))

	if err := tools.RegisterLocalShellTool(tb, wm, jm); err != nil {
		t.Fatalf("注册 local shell 工具失败: %v", err)
	}

	g.RememberAuthorization("sess_test", "execute", time.Hour)

	// 1. Test synchronous execution
	cmdStr := "echo hello_from_tool"
	res := tb.Invoke(ctx, "tr1", "sess_test", "execute", fmt.Sprintf(`{"command": "%s"}`, cmdStr))
	if !res.OK {
		t.Fatalf("execute 工具调用失败: %s", res.Error)
	}

	// 2. Test background execution (managed by JobManager)
	bgRes := tb.Invoke(ctx, "tr1", "sess_test", "execute", fmt.Sprintf(`{"command": "%s", "run_in_background": true}`, cmdStr))
	if !bgRes.OK {
		t.Fatalf("execute 后台作业调用失败: %s", bgRes.Error)
	}

	// Verify job was persisted in store
	time.Sleep(50 * time.Millisecond)
	jobs, err := st.ListJobs("sess_test")
	if err != nil || len(jobs) == 0 {
		t.Fatalf("预期在 store 中查到后台作业，实际: %v, jobs: %d", err, len(jobs))
	}
}

func TestBackgroundJobAndSubagentLifecycleDecoupling(t *testing.T) {
	st, cleanup := setupTestStore(t)
	defer cleanup()

	eb := events.NewEventBus()
	jm := job.NewJobManager(st, eb)
	wm := tools.NewWorkspaceManager("")
	jm.RegisterExecutor("local", job.NewLocalExecutor(wm))

	// 1. Verify Job execution survives expired/cancelled parent tool context
	ephemeralCtx, cancel := context.WithTimeout(context.Background(), 1*time.Millisecond)
	time.Sleep(5 * time.Millisecond)
	cancel() // Ensure parent ctx is completely cancelled

	jobID := jm.Submit(ephemeralCtx, "sess_bg", "test", func(jobCtx context.Context, emitProgress job.ProgressFunc) (string, error) {
		time.Sleep(30 * time.Millisecond)
		if jobCtx.Err() != nil {
			return "", jobCtx.Err()
		}
		emitProgress(1.0, "ok", "done")
		return "success", nil
	})

	jobItem, summary, err := jm.Wait(context.Background(), jobID)
	if err != nil {
		t.Fatalf("后台作业应脱钩父 Context 正常执行完毕，但返回错误: %v", err)
	}
	if summary != "success" || jobItem.State != string(job.StateCompleted) {
		t.Fatalf("预期作业状态为 completed，实际: %s, summary: %s", jobItem.State, summary)
	}

	// 2. Verify Subagent execution survives expired/cancelled parent context
	subagentRunnerRan := false
	sm := subagent.NewSubagentManager(st, eb, func(ctx context.Context, subID, prompt string) (string, error) {
		time.Sleep(30 * time.Millisecond)
		if ctx.Err() != nil {
			return "", ctx.Err()
		}
		subagentRunnerRan = true
		return "subagent_result", nil
	})

	subID, err := sm.Spawn(ephemeralCtx, "", "sess_sub", "test prompt", "", 1)
	if err != nil {
		t.Fatalf("启动子代理失败: %v", err)
	}

	time.Sleep(80 * time.Millisecond)
	subItem, err := sm.Get(subID)
	if err != nil || subItem.State != string(subagent.StateCompleted) {
		t.Fatalf("预期子代理脱钩父 Context 并成功完成，实际状态: %s, err: %v", subItem.State, err)
	}
	if !subagentRunnerRan {
		t.Fatalf("预期子代理 Runner 正常执行完成")
	}

	// 3. Verify Session.Stop cascade cancellation
	sess := NewSession("sess_cascade", "测试级联停止会话", "", DefaultRuntime.cfg)
	DefaultRuntime.JobMgr = jm
	DefaultRuntime.SubagentM = sm

	longJobID := jm.Submit(context.Background(), "sess_cascade", "long_job", func(jobCtx context.Context, emitProgress job.ProgressFunc) (string, error) {
		select {
		case <-jobCtx.Done():
			return "", jobCtx.Err()
		case <-time.After(2 * time.Second):
			return "done", nil
		}
	})

	time.Sleep(20 * time.Millisecond)
	sess.Stop()

	time.Sleep(30 * time.Millisecond)
	killedJob, _ := jm.GetJob(longJobID)
	if killedJob != nil && killedJob.State != string(job.StateKilled) {
		t.Fatalf("预期 session.Stop 级联终止后台作业，实际状态: %s", killedJob.State)
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

	lvl, _ := rt.Guard.Audit(context.Background(), "s1", "execute", "rm -rf /", guard.LevelConfirm)
	if lvl != guard.LevelAllow {
		t.Fatalf("预期当 AiEnablePermissionGuard=false 时 Audit 返回 LevelAllow，实际: %s", lvl)
	}

	// 2. Test BlockHighRiskCommands wiring
	cfg.AiEnablePermissionGuard = true
	cfg.AiBlockHighRiskCommands = false
	_ = rt.InitOrUpdate(cfg)

	lvl, _ = rt.Guard.Audit(context.Background(), "s1", "execute", "rm -rf /", guard.LevelConfirm)
	if lvl != guard.LevelConfirm {
		t.Fatalf("预期当 AiBlockHighRiskCommands=false 时高危指令降级为 LevelConfirm，实际: %s", lvl)
	}

	cfg.AiBlockHighRiskCommands = true
	_ = rt.InitOrUpdate(cfg)
	lvl, _ = rt.Guard.Audit(context.Background(), "s1", "execute", "rm -rf /", guard.LevelConfirm)
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


