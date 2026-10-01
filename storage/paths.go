package storage

import (
	"fmt"
	"os"
	"path/filepath"
	"sync"
)

const (
	appDirName = "xTerminal"
)

var (
	testBaseDir   string
	testBaseDirMu sync.RWMutex
)

// SetBaseDirForTest 用于单元测试环境隔离基础目录。
// 传入空字符串即可重置恢复默认路径。
func SetBaseDirForTest(dir string) {
	testBaseDirMu.Lock()
	defer testBaseDirMu.Unlock()
	testBaseDir = dir
}

// BaseDir 获取应用根目录（如 Windows 下的 %APPDATA%/xTerminal 或 Linux/macOS 下的 ~/.config/xTerminal）。
func BaseDir() string {
	testBaseDirMu.RLock()
	if testBaseDir != "" {
		dir := testBaseDir
		testBaseDirMu.RUnlock()
		return dir
	}
	testBaseDirMu.RUnlock()

	base, err := os.UserConfigDir()
	if err != nil {
		home, herr := os.UserHomeDir()
		if herr != nil {
			base = "."
		} else {
			base = filepath.Join(home, ".config")
		}
	}
	return filepath.Join(base, appDirName)
}

// ConfigDir 配置文件与密钥目录 (%APPDATA%/xTerminal/config)
func ConfigDir() string {
	return filepath.Join(BaseDir(), "config")
}

// DataDir SQLite 数据库与持久化数据目录 (%APPDATA%/xTerminal/data)
func DataDir() string {
	return filepath.Join(BaseDir(), "data")
}

// LogsDir 日志目录 (%APPDATA%/xTerminal/logs)
func LogsDir() string {
	return filepath.Join(BaseDir(), "logs")
}

// WikiDir 知识库 Markdown 目录 (%APPDATA%/xTerminal/wiki)
func WikiDir() string {
	return filepath.Join(BaseDir(), "wiki")
}

// SkillsDir 智能体技能库目录 (%APPDATA%/xTerminal/skills)
func SkillsDir() string {
	return filepath.Join(BaseDir(), "skills")
}

// PlansRootDir 实施方案根目录 (%APPDATA%/xTerminal/plans)
func PlansRootDir() string {
	return filepath.Join(BaseDir(), "plans")
}

// PlansDir 特定会话方案目录 (%APPDATA%/xTerminal/plans/<sessionID>)
func PlansDir(sessionID string) string {
	if sessionID == "" {
		sessionID = "default"
	}
	return filepath.Join(PlansRootDir(), sessionID)
}

// SecretKeyPath 密码加密密钥路径
func SecretKeyPath() string {
	return filepath.Join(ConfigDir(), "secret.key")
}

// ServersPath 连接配置与全局设置文件路径
func ServersPath() string {
	return filepath.Join(ConfigDir(), "servers.json")
}

// ComposesPath Docker 编排配置文件路径
func ComposesPath() string {
	return filepath.Join(ConfigDir(), "composes.json")
}

// K8sOrchestrationsPath K8s 编排配置文件路径
func K8sOrchestrationsPath() string {
	return filepath.Join(ConfigDir(), "k8s_orchestrations.json")
}

// ApisPath 接口树配置文件路径
func ApisPath() string {
	return filepath.Join(ConfigDir(), "apis.json")
}

// AgentDBPath 智能体 SQLite 数据库路径
func AgentDBPath() string {
	return filepath.Join(DataDir(), "xagent.db")
}

// LogFilePath 日志文件绝对路径
func LogFilePath() string {
	return filepath.Join(LogsDir(), "app.log")
}

// EnsureDirs 一次性确保所有核心子目录创建完成
func EnsureDirs() error {
	dirs := []string{
		ConfigDir(),
		DataDir(),
		LogsDir(),
		WikiDir(),
		SkillsDir(),
		PlansRootDir(),
	}
	for _, dir := range dirs {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return fmt.Errorf("创建存储子目录失败 [%s]: %w", dir, err)
		}
	}
	return nil
}
