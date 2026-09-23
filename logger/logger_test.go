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

	if !strings.Contains(content, "caller=logger_test.go:33") {
		t.Errorf("expected log to contain caller=logger_test.go:33, got:\n%s", content)
	}
	if !strings.Contains(content, "caller=logger_test.go:34") {
		t.Errorf("expected log to contain caller=logger_test.go:34, got:\n%s", content)
	}
	// 验证标准库 log 输出也已被归一化，拥有统一的结构与准确行号 (第 39 行)
	if !strings.Contains(content, "caller=logger_test.go:39") {
		t.Errorf("expected standard log to contain caller=logger_test.go:39, got:\n%s", content)
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

func TestFastBase(t *testing.T) {
	cases := []struct {
		input    string
		expected string
	}{
		{"/usr/local/go/src/app.go", "app.go"},
		{"C:\\Users\\system\\project\\main.go", "main.go"},
		{"main.go", "main.go"},
		{"", ""},
		{"/folder/", ""},
	}
	for _, c := range cases {
		if got := fastBase(c.input); got != c.expected {
			t.Errorf("fastBase(%q) = %q, want %q", c.input, got, c.expected)
		}
	}
}

func TestLogLevelFiltering(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "logger_level_test_*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	logFile := filepath.Join(tempDir, "level.log")

	_, err = Init(func(c *Config) {
		c.Filename = logFile
		c.Level = slog.LevelWarn // 仅 Warn 和 Error 允许写入
	})
	if err != nil {
		t.Fatalf("Init failed: %v", err)
	}
	defer Close()

	// 这些应当被快速拦截过滤
	Debug("debug message")
	Debugf("debug formatted %d", 1)
	Info("info message")
	Infof("info formatted %s", "hello")

	// 这些应当成功写入
	Warn("warning alert")
	Errorf("error code %d", 500)

	data, err := os.ReadFile(logFile)
	if err != nil {
		t.Fatalf("failed to read log: %v", err)
	}
	content := string(data)

	if strings.Contains(content, "debug message") || strings.Contains(content, "info formatted") {
		t.Errorf("expected debug/info messages to be filtered out, got:\n%s", content)
	}
	if !strings.Contains(content, "warning alert") || !strings.Contains(content, "error code 500") {
		t.Errorf("expected warn/error to be logged, got:\n%s", content)
	}
}

func BenchmarkDisabledLogf(b *testing.B) {
	tempDir, err := os.MkdirTemp("", "logger_bench_*")
	if err != nil {
		b.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	_, err = Init(func(c *Config) {
		c.Filename = filepath.Join(tempDir, "bench.log")
		c.Level = slog.LevelWarn // Warn 级别，禁用 Info
	})
	if err != nil {
		b.Fatalf("Init failed: %v", err)
	}
	defer Close()

	b.ResetTimer()
	b.ReportAllocs()

	for i := 0; i < b.N; i++ {
		Infof("user %s request query %d", "admin", i)
	}
}

func BenchmarkEnabledLogf(b *testing.B) {
	tempDir, err := os.MkdirTemp("", "logger_bench_*")
	if err != nil {
		b.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	_, err = Init(func(c *Config) {
		c.Filename = filepath.Join(tempDir, "bench.log")
		c.Level = slog.LevelInfo // Info 级别开启
	})
	if err != nil {
		b.Fatalf("Init failed: %v", err)
	}
	defer Close()

	b.ResetTimer()
	b.ReportAllocs()

	for i := 0; i < b.N; i++ {
		Infof("user %s request query %d", "admin", i)
	}
}

func BenchmarkFastBase(b *testing.B) {
	path := "D:\\system\\Desktop\\Terminal\\terminal_v3\\services\\redis_service.go"
	b.ResetTimer()
	b.ReportAllocs()

	for i := 0; i < b.N; i++ {
		_ = fastBase(path)
	}
}

func BenchmarkFilepathBase(b *testing.B) {
	path := "D:\\system\\Desktop\\Terminal\\terminal_v3\\services\\redis_service.go"
	b.ResetTimer()
	b.ReportAllocs()

	for i := 0; i < b.N; i++ {
		_ = filepath.Base(path)
	}
}

