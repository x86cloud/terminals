package storage

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"
)

// WriteFileAtomic 通过“写临时文件 -> 落盘同步 -> 重命名替换”实现安全的原子写入，
// 避免因进程意外崩溃或断电导致目标文件截断损坏。
func WriteFileAtomic(filePath string, data []byte, perm os.FileMode) error {
	dir := filepath.Dir(filePath)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return fmt.Errorf("创建文件目标目录失败 [%s]: %w", dir, err)
	}

	// 在同一目录下生成临时文件，保证与目标文件位于同一文件系统/驱动器以便原子 rename
	tmpFile := fmt.Sprintf("%s.tmp.%d", filePath, time.Now().UnixNano())
	f, err := os.OpenFile(tmpFile, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, perm)
	if err != nil {
		return fmt.Errorf("创建原子写入临时文件失败 [%s]: %w", tmpFile, err)
	}

	cleanup := true
	defer func() {
		if cleanup {
			_ = f.Close()
			_ = os.Remove(tmpFile)
		}
	}()

	if _, err := f.Write(data); err != nil {
		return fmt.Errorf("写入临时文件失败 [%s]: %w", tmpFile, err)
	}

	// 强制刷盘，确保数据真正写入持久介质
	if err := f.Sync(); err != nil {
		return fmt.Errorf("同步文件到磁盘失败 [%s]: %w", tmpFile, err)
	}

	if err := f.Close(); err != nil {
		return fmt.Errorf("关闭临时文件失败 [%s]: %w", tmpFile, err)
	}

	// 针对 Windows 平台，如果目标文件已存在，先做一次防御性探测或重命名
	if err := os.Rename(tmpFile, filePath); err != nil {
		// 若 rename 直接失败（如旧版 Windows 锁定），尝试先删除目标文件再 rename
		_ = os.Remove(filePath)
		if err2 := os.Rename(tmpFile, filePath); err2 != nil {
			return fmt.Errorf("重命名替换目标文件失败 [%s -> %s]: %w", tmpFile, filePath, err2)
		}
	}

	cleanup = false
	return nil
}

// WriteJSONAtomic 将结构体格式化为缩进 JSON 并以原子方式写入本地文件。
func WriteJSONAtomic(filePath string, v any, perm os.FileMode) error {
	data, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return fmt.Errorf("序列化 JSON 失败: %w", err)
	}
	return WriteFileAtomic(filePath, data, perm)
}

// ReadJSON 读取指定路径文件并反序列化到 target。
func ReadJSON(filePath string, target any) error {
	data, err := os.ReadFile(filePath)
	if err != nil {
		return err
	}
	if err := json.Unmarshal(data, target); err != nil {
		return fmt.Errorf("解析 JSON 失败 [%s]: %w", filePath, err)
	}
	return nil
}
