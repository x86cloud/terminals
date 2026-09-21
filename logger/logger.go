package logger

import (
	"context"
	"fmt"
	"io"
	"log"
	"log/slog"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"gopkg.in/natefinch/lumberjack.v2"
)

// Config 定义本地日志滚动配置。
type Config struct {
	// Filename 日志文件的完整路径。
	Filename string
	// MaxSize 单个日志文件的最大大小 (MB)，达到后自动切割滚动。默认 10MB。
	MaxSize int
	// MaxBackups 最多保留的旧日志文件数量。默认 5 个。
	MaxBackups int
	// MaxAge 旧日志文件保留的最长天数。默认 30 天。
	MaxAge int
	// Compress 是否对归档的旧日志文件使用 gzip 压缩。默认 true。
	Compress bool
	// Level 日志最低记录级别。默认 slog.LevelInfo。
	Level slog.Level
}

// Option 用于动态定制日志配置。
type Option func(*Config)

var (
	mu            sync.Mutex
	currentWriter *lumberjack.Logger
	currentLogger atomic.Pointer[slog.Logger]
)

func defaultLogPath() string {
	if dir := os.Getenv("XCLIENT_LOG_DIR"); dir != "" {
		return filepath.Join(dir, "app.log")
	}
	if file := os.Getenv("XCLIENT_LOG_FILE"); file != "" {
		return file
	}

	base, err := os.UserConfigDir()
	if err != nil {
		home, herr := os.UserHomeDir()
		if herr != nil {
			base = "."
		} else {
			base = filepath.Join(home, ".config")
		}
	}
	return filepath.Join(base, "xClient", "logs", "app.log")
}

// DefaultConfig 获取默认日志配置，并根据环境变量进行覆盖。
func DefaultConfig() Config {
	cfg := Config{
		Filename:   defaultLogPath(),
		MaxSize:    10, // 10 MB
		MaxBackups: 5,  // 5 个备份
		MaxAge:     30, // 30 天
		Compress:   true,
		Level:      slog.LevelWarn,
	}

	if val := os.Getenv("XCLIENT_LOG_MAX_SIZE"); val != "" {
		if n, err := strconv.Atoi(val); err == nil && n > 0 {
			cfg.MaxSize = n
		}
	}
	if val := os.Getenv("XCLIENT_LOG_MAX_BACKUPS"); val != "" {
		if n, err := strconv.Atoi(val); err == nil && n >= 0 {
			cfg.MaxBackups = n
		}
	}
	if val := os.Getenv("XCLIENT_LOG_MAX_AGE"); val != "" {
		if n, err := strconv.Atoi(val); err == nil && n >= 0 {
			cfg.MaxAge = n
		}
	}
	if val := os.Getenv("XCLIENT_LOG_COMPRESS"); val != "" {
		if b, err := strconv.ParseBool(val); err == nil {
			cfg.Compress = b
		}
	}
	if val := strings.ToLower(os.Getenv("XCLIENT_LOG_LEVEL")); val != "" {
		switch val {
		case "debug":
			cfg.Level = slog.LevelDebug
		case "info":
			cfg.Level = slog.LevelInfo
		case "warn", "warning":
			cfg.Level = slog.LevelWarn
		case "error":
			cfg.Level = slog.LevelError
		}
	}

	return cfg
}

// Init 初始化全局日志记录器。只写入本地滚动日志文件，控制台静默。
func Init(opts ...Option) (*slog.Logger, error) {
	mu.Lock()
	defer mu.Unlock()

	cfg := DefaultConfig()
	for _, opt := range opts {
		if opt != nil {
			opt(&cfg)
		}
	}

	// 确保目标日志目录存在
	dir := filepath.Dir(cfg.Filename)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, fmt.Errorf("创建日志目录 [%s] 失败: %w", dir, err)
	}

	// 如果之前已有 writer，先关闭
	if currentWriter != nil {
		_ = currentWriter.Close()
	}

	lumberjackLogger := &lumberjack.Logger{
		Filename:   cfg.Filename,
		MaxSize:    cfg.MaxSize,
		MaxBackups: cfg.MaxBackups,
		MaxAge:     cfg.MaxAge,
		Compress:   cfg.Compress,
	}
	currentWriter = lumberjackLogger

	// 格式化输出：时间戳精确到毫秒，文件与行号提取为简短形式 (如 main.go:95)
	handlerOpts := &slog.HandlerOptions{
		AddSource: true,
		Level:     cfg.Level,
		ReplaceAttr: func(groups []string, a slog.Attr) slog.Attr {
			if a.Key == slog.TimeKey {
				return slog.String(slog.TimeKey, a.Value.Time().Format("2006-01-02 15:04:05.000"))
			}
			if a.Key == slog.SourceKey {
				if src, ok := a.Value.Any().(*slog.Source); ok && src != nil {
					shortFile := filepath.Base(src.File)
					return slog.String("caller", fmt.Sprintf("%s:%d", shortFile, src.Line))
				}
			}
			return a
		},
	}

	handler := slog.NewTextHandler(lumberjackLogger, handlerOpts)
	logger := slog.New(handler)

	currentLogger.Store(logger)
	slog.SetDefault(logger)

	// 接管标准库 log 输出，使所有已有 log.Printf 自动进入本地滚动日志并带源码文件名与行号
	log.SetOutput(lumberjackLogger)
	log.SetFlags(log.Ldate | log.Ltime | log.Lmicroseconds | log.Lshortfile)

	return logger, nil
}

// EnsureInitialized 确保日志库已经初始化；若尚未显式调用 Init()，则自动使用默认配置初始化。
func EnsureInitialized() {
	if currentLogger.Load() == nil {
		_, _ = Init()
	}
}

// GetLogger 获取全局当前 *slog.Logger 实例。
func GetLogger() *slog.Logger {
	EnsureInitialized()
	return currentLogger.Load()
}

// Close 关闭日志文件流（程序退出时调用）。
func Close() error {
	mu.Lock()
	defer mu.Unlock()
	if currentWriter != nil {
		err := currentWriter.Close()
		currentWriter = nil
		return err
	}
	return nil
}

// logWithCaller 精确获取业务调用处的 PC (跳过封装层级)，并通过 slog 处理。
func logWithCaller(ctx context.Context, level slog.Level, msg string, args ...any) {
	EnsureInitialized()
	l := currentLogger.Load()
	if l == nil {
		return
	}
	h := l.Handler()
	if !h.Enabled(ctx, level) {
		return
	}

	var pcs [1]uintptr
	// 跳过: [0: runtime.Callers, 1: logWithCaller, 2: Info/Infof/etc, 3: 真实调用者]
	runtime.Callers(3, pcs[:])

	r := slog.NewRecord(time.Now(), level, msg, pcs[0])
	r.Add(args...)
	_ = h.Handle(ctx, r)
}

// Debug 记录 Debug 级别结构化日志。
func Debug(msg string, args ...any) {
	logWithCaller(context.Background(), slog.LevelDebug, msg, args...)
}

// Info 记录 Info 级别结构化日志。
func Info(msg string, args ...any) {
	logWithCaller(context.Background(), slog.LevelInfo, msg, args...)
}

// Warn 记录 Warn 级别结构化日志。
func Warn(msg string, args ...any) {
	logWithCaller(context.Background(), slog.LevelWarn, msg, args...)
}

// Error 记录 Error 级别结构化日志。
func Error(msg string, args ...any) {
	logWithCaller(context.Background(), slog.LevelError, msg, args...)
}

// Debugf 记录格式化 Debug 日志。
func Debugf(format string, args ...any) {
	logWithCaller(context.Background(), slog.LevelDebug, fmt.Sprintf(format, args...))
}

// Infof 记录格式化 Info 日志。
func Infof(format string, args ...any) {
	logWithCaller(context.Background(), slog.LevelInfo, fmt.Sprintf(format, args...))
}

// Warnf 记录格式化 Warn 日志。
func Warnf(format string, args ...any) {
	logWithCaller(context.Background(), slog.LevelWarn, fmt.Sprintf(format, args...))
}

// Errorf 记录格式化 Error 日志。
func Errorf(format string, args ...any) {
	logWithCaller(context.Background(), slog.LevelError, fmt.Sprintf(format, args...))
}

// With 返回带有预设属性字段的子 Logger。
func With(args ...any) *slog.Logger {
	return GetLogger().With(args...)
}

// LogWriter 获取底层写入器（可用于某些需要 io.Writer 的第三方组件）。
func LogWriter() io.Writer {
	EnsureInitialized()
	return currentWriter
}
