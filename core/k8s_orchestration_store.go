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

// K8sResourceItemSummary 记录编排中单个资源的基本元信息。
type K8sResourceItemSummary struct {
	Kind      string `json:"kind"`      // 例如: Deployment, Service, ConfigMap, Pod
	Name      string `json:"name"`      // metadata.name
	Namespace string `json:"namespace"` // metadata.namespace
}

// K8sOrchestrationRecord 描述在客户端本地保存的一个 Kubernetes YAML 资源编排记录。
type K8sOrchestrationRecord struct {
	ID               string                   `json:"id"`               // 唯一主键 UUID
	ServerID         string                   `json:"serverId"`         // 所属 K8s 集群 ID
	Name             string                   `json:"name"`             // 编排名称 (如: nginx-ingress, redis-ha)
	Namespace        string                   `json:"namespace"`        // 默认命名空间
	YamlContent      string                   `json:"yamlContent"`      // 完整的 YAML 编排内容
	Status           string                   `json:"status"`           // 状态: "deployed" (已部署) | "not_deployed" (未部署/已下线)
	Resources        []K8sResourceItemSummary `json:"resources"`        // 解析出的资源列表
	ResourcesSummary string                   `json:"resourcesSummary"` // 统计摘要，如 "Deployment (1), Service (1)"
	CreatedAt        string                   `json:"createdAt"`        // 创建时间
	UpdatedAt        string                   `json:"updatedAt"`        // 最近更新/部署时间
}

// K8sOrchestrationStore 管理 k8s_orchestrations.json 的本地持久化。
type K8sOrchestrationStore struct {
	mu   sync.RWMutex
	file string
	list []K8sOrchestrationRecord
}

// NewK8sOrchestrationStore 初始化 K8s 编排存储。
func NewK8sOrchestrationStore(dir string) (*K8sOrchestrationStore, error) {
	ks := &K8sOrchestrationStore{
		file: filepath.Join(dir, "k8s_orchestrations.json"),
		list: []K8sOrchestrationRecord{},
	}
	if err := ks.load(); err != nil {
		return nil, err
	}
	return ks, nil
}

func (ks *K8sOrchestrationStore) load() error {
	ks.mu.Lock()
	defer ks.mu.Unlock()

	data, err := os.ReadFile(ks.file)
	if err != nil {
		if os.IsNotExist(err) {
			ks.list = []K8sOrchestrationRecord{}
			return nil
		}
		return err
	}
	var list []K8sOrchestrationRecord
	if err := json.Unmarshal(data, &list); err != nil {
		ks.list = []K8sOrchestrationRecord{}
		return nil
	}
	ks.list = list
	return nil
}

func (ks *K8sOrchestrationStore) save() error {
	data, err := json.MarshalIndent(ks.list, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(ks.file, data, 0o600)
}

// ListRecords 获取指定 serverId 的编排记录（若 serverId 为空则返回全部）。
func (ks *K8sOrchestrationStore) ListRecords(serverId string) []K8sOrchestrationRecord {
	ks.mu.RLock()
	defer ks.mu.RUnlock()

	res := make([]K8sOrchestrationRecord, 0, len(ks.list))
	for _, r := range ks.list {
		if serverId == "" || r.ServerID == serverId {
			res = append(res, r)
		}
	}
	sort.Slice(res, func(i, j int) bool {
		return res[i].UpdatedAt > res[j].UpdatedAt
	})
	return res
}

// GetRecord 获取单个编排记录。
func (ks *K8sOrchestrationStore) GetRecord(id string) (*K8sOrchestrationRecord, error) {
	ks.mu.RLock()
	defer ks.mu.RUnlock()

	for _, r := range ks.list {
		if r.ID == id {
			cpy := r
			return &cpy, nil
		}
	}
	return nil, errors.New("未找到指定的 K8s 编排记录")
}

// SaveRecord 保存或更新一条编排记录。若 ID 为空或不存在则新增，否则更新已有记录。
func (ks *K8sOrchestrationStore) SaveRecord(r K8sOrchestrationRecord) (*K8sOrchestrationRecord, error) {
	ks.mu.Lock()
	defer ks.mu.Unlock()

	now := time.Now().Format("2006-01-02 15:04:05")
	if r.ID == "" {
		r.ID = uuid.New().String()
		r.CreatedAt = now
	}
	r.UpdatedAt = now
	if r.Resources == nil {
		r.Resources = []K8sResourceItemSummary{}
	}
	if r.Status == "" {
		r.Status = "deployed"
	}

	found := false
	for i, existing := range ks.list {
		if existing.ID == r.ID {
			if r.CreatedAt == "" {
				r.CreatedAt = existing.CreatedAt
			}
			ks.list[i] = r
			found = true
			break
		}
	}
	if !found {
		if r.CreatedAt == "" {
			r.CreatedAt = now
		}
		ks.list = append(ks.list, r)
	}

	if err := ks.save(); err != nil {
		return nil, fmt.Errorf("保存 K8s 编排记录文件失败: %w", err)
	}
	cpy := r
	return &cpy, nil
}

// DeleteRecord 删除一条编排记录。
func (ks *K8sOrchestrationStore) DeleteRecord(id string) error {
	ks.mu.Lock()
	defer ks.mu.Unlock()

	idx := -1
	for i, r := range ks.list {
		if r.ID == id {
			idx = i
			break
		}
	}
	if idx == -1 {
		return nil // 幂等删除
	}

	ks.list = append(ks.list[:idx], ks.list[idx+1:]...)
	return ks.save()
}
