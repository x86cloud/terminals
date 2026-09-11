package tools

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"terminal/agent/events"
	"terminal/agent/guard"
	"terminal/core"
)

func setupTestApiFile(t *testing.T) (string, func()) {
	t.Helper()
	tempDir, err := os.MkdirTemp("", "api_tool_test_*")
	if err != nil {
		t.Fatalf("创建临时测试目录失败: %v", err)
	}

	// 覆写 AppConfigDir
	core.SetAppConfigDirForTest(tempDir)

	cleanup := func() {
		core.SetAppConfigDirForTest("")
		_ = os.RemoveAll(tempDir)
	}
	return tempDir, cleanup
}

func TestApiManager_CRUD(t *testing.T) {
	_, cleanup := setupTestApiFile(t)
	defer cleanup()

	ctx := context.Background()

	// 1. 测试 List 初始默认列表
	listRes, err := ExecuteApiManager(ctx, &ApiManagerInput{
		Action: "list",
	})
	if err != nil {
		t.Fatalf("List 失败: %v", err)
	}
	if !listRes.Success || len(listRes.List) == 0 {
		t.Fatalf("预期包含默认列表，实际: %+v", listRes)
	}
	t.Logf("默认列表项数: %d", listRes.Total)

	// 2. 测试 Create Folder
	folderRes, err := ExecuteApiManager(ctx, &ApiManagerInput{
		Action:   "create",
		Name:     "测试分组A",
		IsFolder: true,
	})
	if err != nil {
		t.Fatalf("创建分组失败: %v", err)
	}
	if !folderRes.Success || folderRes.Item == nil || folderRes.Item.ID == "" {
		t.Fatalf("创建分组返回异常: %+v", folderRes)
	}
	folderID := folderRes.Item.ID
	t.Logf("创建分组成功, ID: %s", folderID)

	// 3. 测试 Create API 在刚创建的分组下
	apiRes, err := ExecuteApiManager(ctx, &ApiManagerInput{
		Action:         "create",
		Name:           "查询用户接口",
		TargetFolderID: folderID,
		Method:         "POST",
		URL:            "https://api.example.com/v1/users",
		Params: map[string]any{
			"page": 1,
		},
		Headers: map[string]string{
			"X-Custom-Header": "foobar",
		},
		Body: map[string]any{
			"role": "admin",
		},
	})
	if err != nil {
		t.Fatalf("创建接口失败: %v", err)
	}
	if !apiRes.Success || apiRes.Item == nil || apiRes.Item.ID == "" {
		t.Fatalf("创建接口返回异常: %+v", apiRes)
	}
	apiID := apiRes.Item.ID
	t.Logf("创建接口成功, ID: %s", apiID)

	// 4. 测试 Get API
	getRes, err := ExecuteApiManager(ctx, &ApiManagerInput{
		Action: "get",
		ID:     apiID,
	})
	if err != nil {
		t.Fatalf("Get 接口失败: %v", err)
	}
	if !getRes.Success || getRes.Item == nil || getRes.Item.Name != "查询用户接口" {
		t.Fatalf("获取接口详情不匹配: %+v", getRes)
	}
	if len(getRes.Item.Params) != 1 || getRes.Item.Params[0].Name != "page" {
		t.Errorf("接口参数未正确保存: %+v", getRes.Item.Params)
	}

	// 5. 测试 Update API
	updateRes, err := ExecuteApiManager(ctx, &ApiManagerInput{
		Action: "update",
		ID:     apiID,
		Name:   "查询用户接口(已改名)",
		Method: "GET",
		URL:    "https://api.example.com/v1/users/active",
	})
	if err != nil {
		t.Fatalf("更新接口失败: %v", err)
	}
	if !updateRes.Success || updateRes.Item == nil || updateRes.Item.Name != "查询用户接口(已改名)" {
		t.Fatalf("更新接口返回异常: %+v", updateRes)
	}
	if updateRes.Item.Method != "GET" || updateRes.Item.URL != "https://api.example.com/v1/users/active" {
		t.Errorf("更新后的方法或URL不符: %+v", updateRes.Item)
	}

	// 6. 测试 Keyword 搜索
	searchRes, err := ExecuteApiManager(ctx, &ApiManagerInput{
		Action:  "list",
		Keyword: "已改名",
	})
	if err != nil {
		t.Fatalf("搜索接口失败: %v", err)
	}
	if searchRes.Total != 1 || searchRes.List[0].ID != apiID {
		t.Fatalf("搜索结果异常: %+v", searchRes)
	}

	// 7. 测试 Delete API
	delRes, err := ExecuteApiManager(ctx, &ApiManagerInput{
		Action: "delete",
		ID:     apiID,
	})
	if err != nil {
		t.Fatalf("删除接口失败: %v", err)
	}
	if !delRes.Success {
		t.Fatalf("删除接口返回失败: %+v", delRes)
	}

	// 再次 Get 应不存在
	getAfterDel, err := ExecuteApiManager(ctx, &ApiManagerInput{
		Action: "get",
		ID:     apiID,
	})
	if err != nil {
		t.Fatalf("再次 Get 发生异常: %v", err)
	}
	if getAfterDel.Success {
		t.Fatalf("已删除的接口不应被检索到: %+v", getAfterDel)
	}
}

func TestHttpRequest_WithApiListIntegration(t *testing.T) {
	_, cleanup := setupTestApiFile(t)
	defer cleanup()

	// 启动一个测试 Mock HTTP 服务器
	var receivedHeader string
	var receivedQuery string
	var receivedBody string

	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		receivedHeader = r.Header.Get("X-Test-Token")
		receivedQuery = r.URL.RawQuery
		b, _ := os.ReadFile(r.URL.Path)
		_ = b
		buf := make([]byte, 1024)
		n, _ := r.Body.Read(buf)
		receivedBody = string(buf[:n])

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"status":"ok","code":200}`))
	}))
	defer ts.Close()

	ctx := context.Background()

	// 1. 预先通过 ApiManager 创建一个测试接口
	createRes, err := ExecuteApiManager(ctx, &ApiManagerInput{
		Action: "create",
		Name:   "测试集成接口",
		Method: "POST",
		URL:    ts.URL + "/api/v1/action",
		Params: map[string]any{
			"base": "origin",
		},
		Headers: map[string]string{
			"X-Test-Token": "secret_abc",
		},
		Body: map[string]any{
			"field1": "val1",
		},
	})
	if err != nil || !createRes.Success {
		t.Fatalf("创建预设接口失败: %v, %+v", err, createRes)
	}
	apiID := createRes.Item.ID

	// 2. 通过 http_request 指定 api_id 执行，并追加/覆盖参数
	reqOutput, err := ExecuteHttpRequest(ctx, &HttpRequestInput{
		ApiID: apiID,
		Params: map[string]any{
			"extra": "123",
		},
		Headers: map[string]string{
			"X-Test-Token": "override_secret",
		},
	})
	if err != nil {
		t.Fatalf("通过 api_id 执行 http_request 失败: %v", err)
	}

	if reqOutput.StatusCode != 200 {
		t.Fatalf("请求响应状态码非 200: %d", reqOutput.StatusCode)
	}
	if receivedHeader != "override_secret" {
		t.Errorf("Header 覆盖失败，期望 override_secret，实际: %s", receivedHeader)
	}
	if !strings.Contains(receivedQuery, "base=origin") || !strings.Contains(receivedQuery, "extra=123") {
		t.Errorf("Query 参数合并失败: %s", receivedQuery)
	}
	if !strings.Contains(receivedBody, "field1") {
		t.Errorf("Body 未正确继承: %s", receivedBody)
	}

	// 3. 测试 save_to_list 功能
	reqOutput2, err := ExecuteHttpRequest(ctx, &HttpRequestInput{
		Method:     "GET",
		URL:        ts.URL + "/status",
		SaveToList: true,
		SaveName:   "新自动保存的接口",
	})
	if err != nil {
		t.Fatalf("执行带有 SaveToList 的请求失败: %v", err)
	}
	if reqOutput2.SavedApiID == "" {
		t.Fatalf("预期返回 SavedApiID，实际为空")
	}

	// 验证该新接口已在接口列表中
	getRes, err := ExecuteApiManager(ctx, &ApiManagerInput{
		Action: "get",
		ID:     reqOutput2.SavedApiID,
	})
	if err != nil || !getRes.Success || getRes.Item == nil {
		t.Fatalf("未能成功查询到自动保存的接口: %v, %+v", err, getRes)
	}
	if getRes.Item.Name != "新自动保存的接口" {
		t.Errorf("保存的接口名称不符合预期: %s", getRes.Item.Name)
	}
}

func TestApiManager_GuardAudit(t *testing.T) {
	g := guard.NewPolicyGuard(true, false, nil)
	eb := events.NewEventBus()
	bus := NewToolBus(g, eb)

	if err := RegisterApiManagerTool(bus); err != nil {
		t.Fatalf("注册 api_manager 工具失败: %v", err)
	}

	tool, ok := bus.Get("api_manager")
	if !ok {
		t.Fatal("未在 ToolBus 中找到 api_manager 工具")
	}
	if tool.Level != guard.LevelAllow {
		t.Errorf("默认等级应为 LevelAllow, 实际: %s", tool.Level)
	}

	// 1. Audit list 操作 -> 应为 LevelAllow
	lvlList, _ := g.Audit(context.Background(), "session_1", "api_manager", `{"action":"list"}`, guard.LevelAllow)
	if lvlList != guard.LevelAllow {
		t.Errorf("list 操作预期放行 LevelAllow，实际: %s", lvlList)
	}

	// 2. Audit create 操作 -> 应为 LevelAllow
	lvlCreate, _ := g.Audit(context.Background(), "session_1", "api_manager", `{"action":"create","name":"接口"}`, guard.LevelAllow)
	if lvlCreate != guard.LevelAllow {
		t.Errorf("create 操作预期放行 LevelAllow，实际: %s", lvlCreate)
	}

	// 3. Audit delete 操作 -> 应拦截为 LevelConfirm
	lvlDel, reason := g.Audit(context.Background(), "session_1", "api_manager", `{"action":"delete","id":"api_123"}`, guard.LevelAllow)
	if lvlDel != guard.LevelConfirm {
		t.Errorf("delete 操作预期为 LevelConfirm，实际: %s", lvlDel)
	}
	if !strings.Contains(reason, "api_123") {
		t.Errorf("拦截理由未包含被删除的 ID: %s", reason)
	}
}
