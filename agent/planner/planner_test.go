package planner

import (
	"context"
	"os"
	"strings"
	"testing"
)

func TestPlanner_GetPlansDirAndFilePersistence(t *testing.T) {
	sessionID := "test_session_123"
	dir, err := GetPlansDir(sessionID)
	if err != nil {
		t.Fatalf("GetPlansDir error: %v", err)
	}
	if !strings.Contains(dir, sessionID) {
		t.Errorf("expected dir to contain sessionID %s, got %s", sessionID, dir)
	}

	p := NewPlanner(nil, nil, nil)
	plan, err := p.GeneratePlan(context.Background(), sessionID, "重构用户认证模块", "- http_request: 接口调用\n- local_shell: 本地执行")
	if err != nil {
		t.Fatalf("GeneratePlan fallback error: %v", err)
	}

	if plan == nil {
		t.Fatal("expected plan not to be nil")
	}
	if plan.Content == "" {
		t.Errorf("expected plan content to be non-empty")
	}
	if plan.FilePath == "" {
		t.Errorf("expected plan file path to be non-empty")
	}

	data, err := os.ReadFile(plan.FilePath)
	if err != nil {
		t.Fatalf("expected file %s to exist on disk: %v", plan.FilePath, err)
	}
	if len(data) == 0 {
		t.Errorf("expected saved plan file content to be non-empty")
	}
	t.Logf("成功落盘实施方案: %s, 方案字数: %d", plan.FilePath, len(data))
}

func TestPlanner_SavePlanMarkdown_UpdateLifecycle(t *testing.T) {
	sessionID := "test_update_session_888"
	if dir, err := GetPlansDir(sessionID); err == nil {
		_ = os.RemoveAll(dir)
	}

	// Round 1: Initial plan creation
	plan1, err := SavePlanMarkdown(sessionID, "初版方案目标", "# 初版方案\n\n## 目标与背景\n实现第一阶段目标。")
	if err != nil {
		t.Fatalf("SavePlanMarkdown round 1 error: %v", err)
	}
	if plan1.IsUpdate {
		t.Errorf("expected plan1.IsUpdate to be false for first save")
	}
	content1 := GetExistingPlan(sessionID)
	if !strings.Contains(content1, "实现第一阶段目标") {
		t.Errorf("expected content1 to contain '实现第一阶段目标', got: %s", content1)
	}

	// Round 2: Plan revision / update
	plan2, err := SavePlanMarkdown(sessionID, "补充安全要求的方案", "# 更新版方案\n\n## 目标与背景\n根据反馈增加安全性约束。")
	if err != nil {
		t.Fatalf("SavePlanMarkdown round 2 error: %v", err)
	}
	if !plan2.IsUpdate {
		t.Errorf("expected plan2.IsUpdate to be true for second save (update)")
	}
	content2 := GetExistingPlan(sessionID)
	if !strings.Contains(content2, "增加安全性约束") {
		t.Errorf("expected content2 to contain '增加安全性约束', got: %s", content2)
	}
}

