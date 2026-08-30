package guard_test

import (
	"context"
	"testing"
	"time"

	"terminal/agent/events"
	"terminal/agent/guard"
)

func TestPolicyGuard_Audit_TriState(t *testing.T) {
	g := guard.NewPolicyGuard(true, true, nil)

	// 1. Read-only tool should be LevelAllow
	lvl, reason := g.Audit(context.Background(), "s1", "read_file", `{"path":"main.go"}`, guard.LevelAllow)
	if lvl != guard.LevelAllow {
		t.Fatalf("expected LevelAllow for read_file, got %s (reason: %s)", lvl, reason)
	}

	// 2. Local Shell execute should be LevelConfirm
	lvl, reason = g.Audit(context.Background(), "s1", "execute", `{"command":"kubectl get nodes"}`, guard.LevelAllow)
	if lvl != guard.LevelConfirm {
		t.Fatalf("expected LevelConfirm for execute, got %s (reason: %s)", lvl, reason)
	}

	// 3. Remote SSH write/delete should be LevelConfirm
	lvl, reason = g.Audit(context.Background(), "s1", "ssh_delete_file", `{"path":"/tmp/old.log"}`, guard.LevelAllow)
	if lvl != guard.LevelConfirm {
		t.Fatalf("expected LevelConfirm for ssh_delete_file, got %s (reason: %s)", lvl, reason)
	}

	// 4. SQL SELECT should be LevelAllow
	lvl, reason = g.Audit(context.Background(), "s1", "db_mysql_query", `{"sql":"SELECT * FROM users"}`, guard.LevelAllow)
	if lvl != guard.LevelAllow {
		t.Fatalf("expected LevelAllow for SELECT query, got %s (reason: %s)", lvl, reason)
	}

	// 5. SQL UPDATE / DELETE should be LevelConfirm
	lvl, reason = g.Audit(context.Background(), "s1", "db_mysql_query", `{"sql":"UPDATE users SET status = 1 WHERE id = 5"}`, guard.LevelAllow)
	if lvl != guard.LevelConfirm {
		t.Fatalf("expected LevelConfirm for UPDATE query, got %s (reason: %s)", lvl, reason)
	}

	// 6. Dangerous commands should be LevelForbidden
	lvl, reason = g.Audit(context.Background(), "s1", "execute", `{"command":"rm -rf /"}`, guard.LevelAllow)
	if lvl != guard.LevelForbidden {
		t.Fatalf("expected LevelForbidden for rm -rf /, got %s (reason: %s)", lvl, reason)
	}

	lvl, reason = g.Audit(context.Background(), "s1", "db_mysql_query", `{"sql":"DROP DATABASE production"}`, guard.LevelAllow)
	if lvl != guard.LevelForbidden {
		t.Fatalf("expected LevelForbidden for DROP DATABASE, got %s (reason: %s)", lvl, reason)
	}
}

func TestHitlManager_Approval(t *testing.T) {
	eb := events.NewEventBus()
	hm := guard.NewHitlManager(eb)

	done := make(chan bool)
	go func() {
		approved, reason, err := hm.RequestApproval(context.Background(), "sess1", "trace1", "execute", "执行命令", `{"command":"ls"}`, "高危指令")
		if err != nil {
			t.Errorf("RequestApproval error: %v", err)
		}
		if !approved {
			t.Errorf("expected approved = true")
		}
		if reason != "" {
			t.Errorf("expected empty reason on approval, got %s", reason)
		}
		done <- true
	}()

	// Wait for request to register
	time.Sleep(20 * time.Millisecond)
	list := hm.ListPending()
	if len(list) != 1 {
		t.Fatalf("expected 1 pending hitl request, got %d", len(list))
	}

	confirmID := list[0].ConfirmID
	ok := hm.ResolveApproval(confirmID, true, "")
	if !ok {
		t.Fatalf("expected ResolveApproval to succeed")
	}

	select {
	case <-done:
	case <-time.After(1 * time.Second):
		t.Fatalf("timeout waiting for approval resolution")
	}
}

func TestHitlManager_RejectionWithReason(t *testing.T) {
	eb := events.NewEventBus()
	hm := guard.NewHitlManager(eb)

	done := make(chan bool)
	go func() {
		approved, reason, err := hm.RequestApproval(context.Background(), "sess1", "trace1", "delete_file", "删除文件", `{"path":"/data"}`, "高危删除")
		if err != nil {
			t.Errorf("RequestApproval error: %v", err)
		}
		if approved {
			t.Errorf("expected approved = false on rejection")
		}
		if reason != "请仅清理日志目录" {
			t.Errorf("expected reason '请仅清理日志目录', got %s", reason)
		}
		done <- true
	}()

	time.Sleep(20 * time.Millisecond)
	list := hm.ListPending()
	if len(list) != 1 {
		t.Fatalf("expected 1 pending request, got %d", len(list))
	}

	confirmID := list[0].ConfirmID
	ok := hm.ResolveApproval(confirmID, false, "请仅清理日志目录")
	if !ok {
		t.Fatalf("expected ResolveApproval to succeed")
	}

	select {
	case <-done:
	case <-time.After(1 * time.Second):
		t.Fatalf("timeout waiting for rejection resolution")
	}
}

func TestHitlManager_ContextCancellation(t *testing.T) {
	eb := events.NewEventBus()
	hm := guard.NewHitlManager(eb)

	ctx, cancel := context.WithCancel(context.Background())
	cancel() // Cancel immediately

	approved, _, err := hm.RequestApproval(ctx, "sess1", "trace1", "execute", "执行命令", `{"command":"ls"}`, "高危指令")
	if err == nil {
		t.Fatalf("expected context cancellation error, got nil")
	}
	if approved {
		t.Fatalf("expected approved = false on cancel")
	}
}
