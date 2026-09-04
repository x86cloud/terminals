package core

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"sync"
	"time"

	"github.com/google/uuid"
)

// DockerComposeRecord 描述在客户端本地保存的一个 Compose 配置文件记录。
type DockerComposeRecord struct {
	ID          string            `json:"id"`          // 唯一主键 UUID
	ServerID    string            `json:"serverId"`    // 所属 Docker 实例 ID
	ProjectName string            `json:"projectName"` // Docker 项目名 (标准化小写)
	YamlContent string            `json:"yamlContent"` // 完整的 YAML 编排内容
	EnvVars     map[string]string `json:"envVars"`     // 环境变量键值对
	CreatedAt   string            `json:"createdAt"`   // 创建时间
	UpdatedAt   string            `json:"updatedAt"`   // 最近更新/部署时间
}

// ComposeStore 管理 composes.json 的本地持久化。
type ComposeStore struct {
	mu   sync.RWMutex
	file string
	list []DockerComposeRecord
}

// NewComposeStore 初始化 Compose 存储。
func NewComposeStore(dir string) (*ComposeStore, error) {
	cs := &ComposeStore{
		file: filepath.Join(dir, "composes.json"),
		list: []DockerComposeRecord{},
	}
	if err := cs.load(); err != nil {
		return nil, err
	}
	return cs, nil
}

func (cs *ComposeStore) load() error {
	cs.mu.Lock()
	defer cs.mu.Unlock()

	data, err := os.ReadFile(cs.file)
	if err != nil {
		if os.IsNotExist(err) {
			cs.list = []DockerComposeRecord{}
			return nil
		}
		return err
	}
	var list []DockerComposeRecord
	if err := json.Unmarshal(data, &list); err != nil {
		cs.list = []DockerComposeRecord{}
		return nil
	}
	cs.list = list
	return nil
}

func (cs *ComposeStore) save() error {
	data, err := json.MarshalIndent(cs.list, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(cs.file, data, 0o600)
}

// ListRecords 获取指定 serverId 的 Compose 记录（若 serverId 为空则返回全部）。
func (cs *ComposeStore) ListRecords(serverId string) []DockerComposeRecord {
	cs.mu.RLock()
	defer cs.mu.RUnlock()

	res := make([]DockerComposeRecord, 0, len(cs.list))
	for _, r := range cs.list {
		if serverId == "" || r.ServerID == serverId {
			res = append(res, r)
		}
	}
	sort.Slice(res, func(i, j int) bool {
		return res[i].UpdatedAt > res[j].UpdatedAt
	})
	return res
}

// GetRecord 获取单个 Compose 记录。
func (cs *ComposeStore) GetRecord(id string) (*DockerComposeRecord, error) {
	cs.mu.RLock()
	defer cs.mu.RUnlock()

	for _, r := range cs.list {
		if r.ID == id {
			cpy := r
			return &cpy, nil
		}
	}
	return nil, errors.New("未找到指定的 Compose 记录")
}

// SaveRecord 保存或更新一个 Compose 记录。若 ID 为空或不存在则新增，否则更新已有记录。
func (cs *ComposeStore) SaveRecord(r DockerComposeRecord) (*DockerComposeRecord, error) {
	cs.mu.Lock()
	defer cs.mu.Unlock()

	now := time.Now().Format("2006-01-02 15:04:05")
	if r.ID == "" {
		r.ID = uuid.New().String()
		r.CreatedAt = now
	}
	r.UpdatedAt = now
	if r.EnvVars == nil {
		r.EnvVars = make(map[string]string)
	}

	found := false
	for i, existing := range cs.list {
		if existing.ID == r.ID {
			if r.CreatedAt == "" {
				r.CreatedAt = existing.CreatedAt
			}
			cs.list[i] = r
			found = true
			break
		}
	}
	if !found {
		if r.CreatedAt == "" {
			r.CreatedAt = now
		}
		cs.list = append(cs.list, r)
	}

	if err := cs.save(); err != nil {
		return nil, fmt.Errorf("保存 Compose 记录文件失败: %w", err)
	}
	cpy := r
	return &cpy, nil
}

// DeleteRecord 删除一条 Compose 记录。
func (cs *ComposeStore) DeleteRecord(id string) error {
	cs.mu.Lock()
	defer cs.mu.Unlock()

	idx := -1
	for i, r := range cs.list {
		if r.ID == id {
			idx = i
			break
		}
	}
	if idx == -1 {
		return nil // 幂等性删除
	}

	cs.list = append(cs.list[:idx], cs.list[idx+1:]...)
	return cs.save()
}
