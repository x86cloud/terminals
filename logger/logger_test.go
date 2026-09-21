package logger

import (
	"log"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestLoggerBasicsAndCaller(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "logger_test_*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	logFile := filepath.Join(tempDir, "test.log")

	_, err = Init(func(c *Config) {
		c.Filename = logFile
		c.MaxSize = 1
		c.MaxBackups = 2
		c.Level = slog.LevelDebug
	})
	if err != nil {
		t.Fatalf("Init failed: %v", err)
	}
	defer Close()

	// 记录日志，注意此处的行号
	Info("user login successful", "userId", 10086) // 这一行触发日志
	Infof("server listening on port %d", 8080)
	Warn("disk usage high", "percent", 85)
	Errorf("failed to connect to host: %s", "127.0.0.1")

	// 标准库 log 输出
	log.Printf("standard library log message")

	// 强制读取写入的内容
	data, err := os.ReadFile(logFile)
	if err != nil {
		t.Fatalf("failed to read log file: %v", err)
	}
	content := string(data)

	// 验证包含消息文本
	if !strings.Contains(content, "user login successful") {
		t.Errorf("expected log to contain user login message, got: %s", content)
	}
	if !strings.Contains(content, "server listening on port 8080") {
		t.Errorf("expected log to contain formatted message, got: %s", content)
	}
	if !strings.Contains(content, "standard library log message") {
		t.Errorf("expected log to contain standard library message, got: %s", content)
	}

	// 验证包含调用者文件名与精确行号 (行号 33 和 34)
	if !strings.Contains(content, "caller=logger_test.go:33") {
		t.Errorf("expected log to contain caller=logger_test.go:33, got:\n%s", content)
	}
	if !strings.Contains(content, "caller=logger_test.go:34") {
		t.Errorf("expected log to contain caller=logger_test.go:34, got:\n%s", content)
	}
}

func TestEnvConfigOverrides(t *testing.T) {
	os.Setenv("XCLIENT_LOG_MAX_SIZE", "50")
	os.Setenv("XCLIENT_LOG_MAX_BACKUPS", "10")
	os.Setenv("XCLIENT_LOG_MAX_AGE", "7")
	os.Setenv("XCLIENT_LOG_COMPRESS", "false")
	os.Setenv("XCLIENT_LOG_LEVEL", "debug")
	defer func() {
		os.Unsetenv("XCLIENT_LOG_MAX_SIZE")
		os.Unsetenv("XCLIENT_LOG_MAX_BACKUPS")
		os.Unsetenv("XCLIENT_LOG_MAX_AGE")
		os.Unsetenv("XCLIENT_LOG_COMPRESS")
		os.Unsetenv("XCLIENT_LOG_LEVEL")
	}()

	cfg := DefaultConfig()
	if cfg.MaxSize != 50 {
		t.Errorf("expected MaxSize 50, got %d", cfg.MaxSize)
	}
	if cfg.MaxBackups != 10 {
		t.Errorf("expected MaxBackups 10, got %d", cfg.MaxBackups)
	}
	if cfg.MaxAge != 7 {
		t.Errorf("expected MaxAge 7, got %d", cfg.MaxAge)
	}
	if cfg.Compress != false {
		t.Errorf("expected Compress false, got %v", cfg.Compress)
	}
	if cfg.Level != slog.LevelDebug {
		t.Errorf("expected Level Debug, got %v", cfg.Level)
	}
}
