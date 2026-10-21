package ssh

import (
	"os"
	"path/filepath"
	"testing"
)

func TestCalcLocalPathsStats(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "sftp_test_calc_*")
	if err != nil {
		t.Fatalf("创建临时目录失败: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	file1 := filepath.Join(tmpDir, "file1.txt")
	file2 := filepath.Join(tmpDir, "file2.txt")
	subDir := filepath.Join(tmpDir, "subdir")
	file3 := filepath.Join(subDir, "file3.txt")

	if err := os.MkdirAll(subDir, 0o755); err != nil {
		t.Fatalf("创建子目录失败: %v", err)
	}
	if err := os.WriteFile(file1, []byte("hello"), 0o644); err != nil {
		t.Fatalf("创建文件1失败: %v", err)
	}
	if err := os.WriteFile(file2, []byte("world!"), 0o644); err != nil {
		t.Fatalf("创建文件2失败: %v", err)
	}
	if err := os.WriteFile(file3, []byte("sftp test data"), 0o644); err != nil {
		t.Fatalf("创建文件3失败: %v", err)
	}

	// 1. 测试单文件
	size, files, folders, err := calcLocalPathsStats([]string{file1})
	if err != nil {
		t.Fatalf("计算单文件统计失败: %v", err)
	}
	if size != 5 || files != 1 || folders != 0 {
		t.Errorf("预期 (5, 1, 0), 实际 (%d, %d, %d)", size, files, folders)
	}

	// 2. 测试整个目录
	expectedTotal := int64(len("hello") + len("world!") + len("sftp test data"))
	size, files, folders, err = calcLocalPathsStats([]string{tmpDir})
	if err != nil {
		t.Fatalf("计算整目录统计失败: %v", err)
	}
	if size != expectedTotal || files != 3 || folders != 2 {
		t.Errorf("预期 (%d, 3, 2), 实际 (%d, %d, %d)", expectedTotal, size, files, folders)
	}
}
