package services

import (
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"terminal/core"
	"terminal/logger"
)

func TestServicesLoggingIntegration(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "services_log_test_*")
	if err != nil {
		t.Fatalf("创建临时目录失败: %v", err)
	}
	defer os.RemoveAll(tempDir)

	logFile := filepath.Join(tempDir, "services_test.log")

	// 初始化日志为该临时文件
	_, err = logger.Init(func(c *logger.Config) {
		c.Filename = logFile
		c.MaxSize = 1
		c.MaxBackups = 1
		c.Level = slog.LevelDebug
	})
	if err != nil {
		t.Fatalf("logger.Init 失败: %v", err)
	}
	defer logger.Close()

	// 1. 测试 SystemService 日志记录
	sysSvc := NewSystemService()
	serverCfg := core.ServerConfig{
		ID:       "srv_test_001",
		Name:     "Test Server",
		Type:     "ssh",
		Host:     "127.0.0.1",
		Port:     22,
		Username: "root",
		Password: "SuperSecretPassword123", // 确保敏感密码不被记录
	}
	_, _ = sysSvc.SaveServer(serverCfg)

	// 2. 测试 SshService 日志记录 (触发失败分支，验证错误记录)
	sshSvc := NewSshService()
	_, _ = sshSvc.Connect("non_existent_server_id", 80, 24)

	// 3. 测试 SftpService 日志记录
	sftpSvc := NewSftpService()
	_ = sftpSvc.CancelTransfer("transfer_test_999")

	// 4. 测试 RedisService 日志记录
	redisSvc := NewRedisService()
	_, _ = redisSvc.RedisConnect("non_existent_redis_id")

	// 5. 校验日志文件内容
	data, err := os.ReadFile(logFile)
	if err != nil {
		t.Fatalf("读取日志文件失败: %v", err)
	}
	content := string(data)

	// 验证日志中包含各 Service 的调用者源文件名与行号
	if !strings.Contains(content, "caller=system_service.go:") {
		t.Errorf("日志应包含 caller=system_service.go:, 实际内容:\n%s", content)
	}
	if !strings.Contains(content, "caller=ssh_service.go:") {
		t.Errorf("日志应包含 caller=ssh_service.go:, 实际内容:\n%s", content)
	}
	if !strings.Contains(content, "caller=sftp_service.go:") {
		t.Errorf("日志应包含 caller=sftp_service.go:, 实际内容:\n%s", content)
	}
	if !strings.Contains(content, "caller=redis_service.go:") {
		t.Errorf("日志应包含 caller=redis_service.go:, 实际内容:\n%s", content)
	}

	// 验证密码敏感字段被严格过滤（绝不落盘）
	if strings.Contains(content, "SuperSecretPassword123") {
		t.Errorf("严重安全漏洞: 日志中泄露了明文密码 SuperSecretPassword123!")
	}

	// 验证包含操作的关键业务信息
	if !strings.Contains(content, "srv_test_001") {
		t.Errorf("日志应包含 ServerID srv_test_001, 实际内容:\n%s", content)
	}
	if !strings.Contains(content, "non_existent_server_id") {
		t.Errorf("日志应包含 non_existent_server_id, 实际内容:\n%s", content)
	}
}
