package storage

import (
	"os"
	"path/filepath"
	"testing"
)

func TestStoragePathsAndDirs(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "storage_test_*")
	if err != nil {
		t.Fatalf("创建测试临时目录失败: %v", err)
	}
	defer os.RemoveAll(tempDir)

	SetBaseDirForTest(tempDir)
	defer SetBaseDirForTest("")

	if BaseDir() != tempDir {
		t.Fatalf("预期 BaseDir 为 %s，实际为 %s", tempDir, BaseDir())
	}

	if ConfigDir() != filepath.Join(tempDir, "config") {
		t.Fatalf("ConfigDir 计算错误: %s", ConfigDir())
	}
	if DataDir() != filepath.Join(tempDir, "data") {
		t.Fatalf("DataDir 计算错误: %s", DataDir())
	}
	if LogsDir() != filepath.Join(tempDir, "logs") {
		t.Fatalf("LogsDir 计算错误: %s", LogsDir())
	}
	if WikiDir() != filepath.Join(tempDir, "wiki") {
		t.Fatalf("WikiDir 计算错误: %s", WikiDir())
	}
	if SkillsDir() != filepath.Join(tempDir, "skills") {
		t.Fatalf("SkillsDir 计算错误: %s", SkillsDir())
	}
	if PlansDir("sess-123") != filepath.Join(tempDir, "plans", "sess-123") {
		t.Fatalf("PlansDir 计算错误: %s", PlansDir("sess-123"))
	}

	// 验证 EnsureDirs
	if err := EnsureDirs(); err != nil {
		t.Fatalf("EnsureDirs 失败: %v", err)
	}

	// 验证目录真实存在
	for _, dir := range []string{ConfigDir(), DataDir(), LogsDir(), WikiDir(), SkillsDir(), PlansRootDir()} {
		info, err := os.Stat(dir)
		if err != nil || !info.IsDir() {
			t.Fatalf("目录未按预期创建: %s", dir)
		}
	}
}

func TestWriteFileAtomicAndJSON(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "storage_io_test_*")
	if err != nil {
		t.Fatalf("创建临时目录失败: %v", err)
	}
	defer os.RemoveAll(tempDir)

	testFile := filepath.Join(tempDir, "sub", "test.json")
	type payload struct {
		Name  string `json:"name"`
		Value int    `json:"value"`
	}

	p1 := payload{Name: "terminal", Value: 42}
	if err := WriteJSONAtomic(testFile, p1, 0o600); err != nil {
		t.Fatalf("WriteJSONAtomic 失败: %v", err)
	}

	var p2 payload
	if err := ReadJSON(testFile, &p2); err != nil {
		t.Fatalf("ReadJSON 失败: %v", err)
	}
	if p2.Name != "terminal" || p2.Value != 42 {
		t.Fatalf("读取的数据与写入不符: %+v", p2)
	}

	// 测试覆写
	p2.Value = 100
	if err := WriteJSONAtomic(testFile, p2, 0o600); err != nil {
		t.Fatalf("二次覆写失败: %v", err)
	}

	var p3 payload
	if err := ReadJSON(testFile, &p3); err != nil {
		t.Fatalf("二次读取失败: %v", err)
	}
	if p3.Value != 100 {
		t.Fatalf("覆写后数值不正确: %d", p3.Value)
	}
}
