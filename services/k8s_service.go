package services

import (
	"context"
	"errors"
	"fmt"
	"time"

	"terminal/agent"
	"terminal/core"
	"terminal/k8s"
)

// K8sService 导出给 Wails 的 Kubernetes 集群管理服务接口。
type K8sService struct{}

// NewK8sService 构造 K8sService。
func NewK8sService() *K8sService {
	return &K8sService{}
}

// K8sConnect 连接指定 ID 的 K8s 集群。
func (s *K8sService) K8sConnect(id string) (bool, error) {
	c := GetContainer()
	cfg, ok := c.Store.Get(id)
	if !ok {
		return false, errors.New("服务器配置不存在")
	}
	_, err := c.K8sMgr.Connect(cfg)
	if err != nil {
		return false, err
	}
	return true, nil
}

// K8sClose 关闭指定 ID 的 K8s 连接。
func (s *K8sService) K8sClose(id string) error {
	return GetContainer().K8sMgr.Disconnect(id)
}

// K8sParseKubeconfig 解析 Kubeconfig 文本或文件获取上下文列表。
func (s *K8sService) K8sParseKubeconfig(kubeconfigData string, kubeconfigPath string) (*k8s.KubeconfigContextInfo, error) {
	return k8s.ParseKubeconfigInfo(kubeconfigData, kubeconfigPath)
}

// K8sTestConnection 测试指定配置的连通性。
func (s *K8sService) K8sTestConnection(cfg core.ServerConfig) (string, error) {
	cli, err := k8s.NewK8sClient(cfg)
	if err != nil {
		return "", err
	}
	defer cli.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()

	err = cli.Ping(ctx)
	if err != nil {
		return "", fmt.Errorf("连接测试失败: %w", err)
	}

	overview, err := cli.GetOverview(ctx)
	if err == nil && overview != nil {
		return fmt.Sprintf("连接成功！Kubernetes 版本: %s (%s), 节点数: %d", overview.GitVersion, overview.Platform, overview.NodesTotal), nil
	}
	return "连接成功！Kubernetes API Server 响应正常", nil
}

// K8sPing 检测连接状态。
func (s *K8sService) K8sPing(id string) (string, error) {
	cli, err := GetContainer().K8sMgr.GetClient(id)
	if err != nil {
		return "", err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	err = cli.Ping(ctx)
	if err != nil {
		return "", err
	}
	return "ok", nil
}

// K8sGetOverview 获取集群概览。
func (s *K8sService) K8sGetOverview(id string) (*k8s.K8sOverview, error) {
	cli, err := GetContainer().K8sMgr.GetClient(id)
	if err != nil {
		return nil, err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	return cli.GetOverview(ctx)
}

// K8sListNamespaces 获取所有命名空间。
func (s *K8sService) K8sListNamespaces(id string) ([]k8s.K8sNamespaceInfo, error) {
	cli, err := GetContainer().K8sMgr.GetClient(id)
	if err != nil {
		return nil, err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	return cli.ListNamespaces(ctx)
}

// K8sListNodes 获取所有节点。
func (s *K8sService) K8sListNodes(id string) ([]k8s.K8sNodeInfo, error) {
	cli, err := GetContainer().K8sMgr.GetClient(id)
	if err != nil {
		return nil, err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	return cli.ListNodes(ctx)
}

// K8sListPods 获取指定命名空间（或全量）的 Pod 列表。
func (s *K8sService) K8sListPods(id string, namespace string) ([]k8s.K8sPodInfo, error) {
	cli, err := GetContainer().K8sMgr.GetClient(id)
	if err != nil {
		return nil, err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	return cli.ListPods(ctx, namespace)
}

// K8sGetPodLogs 获取 Pod 容器日志。
func (s *K8sService) K8sGetPodLogs(id string, namespace string, podName string, containerName string, tail int, timestamps bool) (string, error) {
	cli, err := GetContainer().K8sMgr.GetClient(id)
	if err != nil {
		return "", err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	return cli.GetPodLogs(ctx, namespace, podName, containerName, tail, timestamps)
}

// K8sDeletePod 删除指定 Pod。
func (s *K8sService) K8sDeletePod(id string, namespace string, podName string) error {
	cli, err := GetContainer().K8sMgr.GetClient(id)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	return cli.DeletePod(ctx, namespace, podName)
}

// K8sListDeployments 获取 Deployment 列表。
func (s *K8sService) K8sListDeployments(id string, namespace string) ([]k8s.K8sDeploymentInfo, error) {
	cli, err := GetContainer().K8sMgr.GetClient(id)
	if err != nil {
		return nil, err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	return cli.ListDeployments(ctx, namespace)
}

// K8sScaleDeployment 动态调整 Deployment 副本数。
func (s *K8sService) K8sScaleDeployment(id string, namespace string, name string, replicas int32) error {
	cli, err := GetContainer().K8sMgr.GetClient(id)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	return cli.ScaleDeployment(ctx, namespace, name, replicas)
}

// K8sRestartDeployment 触发 Deployment 滚动重启。
func (s *K8sService) K8sRestartDeployment(id string, namespace string, name string) error {
	cli, err := GetContainer().K8sMgr.GetClient(id)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	return cli.RestartDeployment(ctx, namespace, name)
}

// K8sListServices 获取 Service 列表。
func (s *K8sService) K8sListServices(id string, namespace string) ([]k8s.K8sServiceInfo, error) {
	cli, err := GetContainer().K8sMgr.GetClient(id)
	if err != nil {
		return nil, err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	return cli.ListServices(ctx, namespace)
}

// K8sListIngresses 获取 Ingress 列表。
func (s *K8sService) K8sListIngresses(id string, namespace string) ([]k8s.K8sIngressInfo, error) {
	cli, err := GetContainer().K8sMgr.GetClient(id)
	if err != nil {
		return nil, err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	return cli.ListIngresses(ctx, namespace)
}

// K8sListConfigMaps 获取 ConfigMap 列表。
func (s *K8sService) K8sListConfigMaps(id string, namespace string) ([]k8s.K8sConfigMapInfo, error) {
	cli, err := GetContainer().K8sMgr.GetClient(id)
	if err != nil {
		return nil, err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	return cli.ListConfigMaps(ctx, namespace)
}

// K8sListSecrets 获取 Secret 列表。
func (s *K8sService) K8sListSecrets(id string, namespace string) ([]k8s.K8sSecretInfo, error) {
	cli, err := GetContainer().K8sMgr.GetClient(id)
	if err != nil {
		return nil, err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	return cli.ListSecrets(ctx, namespace)
}

// K8sListPVCs 获取 PVC 列表。
func (s *K8sService) K8sListPVCs(id string, namespace string) ([]k8s.K8sPVCInfo, error) {
	cli, err := GetContainer().K8sMgr.GetClient(id)
	if err != nil {
		return nil, err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	return cli.ListPVCs(ctx, namespace)
}

// K8sDeleteDeployment 删除指定 Deployment。
func (s *K8sService) K8sDeleteDeployment(id string, namespace string, name string) error {
	cli, err := GetContainer().K8sMgr.GetClient(id)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	return cli.DeleteDeployment(ctx, namespace, name)
}

// K8sDeleteService 删除指定 Service。
func (s *K8sService) K8sDeleteService(id string, namespace string, name string) error {
	cli, err := GetContainer().K8sMgr.GetClient(id)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	return cli.DeleteService(ctx, namespace, name)
}

// K8sDeleteIngress 删除指定 Ingress。
func (s *K8sService) K8sDeleteIngress(id string, namespace string, name string) error {
	cli, err := GetContainer().K8sMgr.GetClient(id)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	return cli.DeleteIngress(ctx, namespace, name)
}

// K8sDeleteConfigMap 删除指定 ConfigMap。
func (s *K8sService) K8sDeleteConfigMap(id string, namespace string, name string) error {
	cli, err := GetContainer().K8sMgr.GetClient(id)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	return cli.DeleteConfigMap(ctx, namespace, name)
}

// K8sDeleteSecret 删除指定 Secret。
func (s *K8sService) K8sDeleteSecret(id string, namespace string, name string) error {
	cli, err := GetContainer().K8sMgr.GetClient(id)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	return cli.DeleteSecret(ctx, namespace, name)
}

// K8sDeletePVC 删除指定 PVC。
func (s *K8sService) K8sDeletePVC(id string, namespace string, name string) error {
	cli, err := GetContainer().K8sMgr.GetClient(id)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	return cli.DeletePVC(ctx, namespace, name)
}

// K8sCreateNamespace 创建新命名空间。
func (s *K8sService) K8sCreateNamespace(id string, name string) error {
	cli, err := GetContainer().K8sMgr.GetClient(id)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	return cli.CreateNamespace(ctx, name)
}

// K8sDeleteNamespace 删除指定命名空间。
func (s *K8sService) K8sDeleteNamespace(id string, name string) error {
	cli, err := GetContainer().K8sMgr.GetClient(id)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	return cli.DeleteNamespace(ctx, name)
}

// K8sGetResourceYAML 获取指定资源的 YAML 文本。
func (s *K8sService) K8sGetResourceYAML(id string, kind string, namespace string, name string) (string, error) {
	cli, err := GetContainer().K8sMgr.GetClient(id)
	if err != nil {
		return "", err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	return cli.GetResourceYAML(ctx, kind, namespace, name)
}

// K8sExecStart 启动指定 Pod 容器的交互式终端会话。
func (s *K8sService) K8sExecStart(id string, namespace string, podName string, container string, command string, cols int, rows int) (string, error) {
	c := GetContainer()
	cli, err := c.K8sMgr.GetClient(id)
	if err != nil {
		return "", err
	}
	return c.K8sMgr.ExecMgr.StartExec(cli, namespace, podName, container, command, cols, rows)
}

// K8sExecWrite 写入数据到指定终端会话。
func (s *K8sService) K8sExecWrite(execID string, data string) error {
	return GetContainer().K8sMgr.ExecMgr.Write(execID, data)
}

// K8sExecResize 调整终端会话尺寸。
func (s *K8sService) K8sExecResize(execID string, cols int, rows int) error {
	return GetContainer().K8sMgr.ExecMgr.Resize(execID, cols, rows)
}

// K8sExecClose 关闭指定终端会话。
func (s *K8sService) K8sExecClose(execID string) error {
	return GetContainer().K8sMgr.ExecMgr.Close(execID)
}

// K8sGenerateYAMLRequest 描述 AI 生成 YAML 请求参数。
type K8sGenerateYAMLRequest struct {
	Namespace string   `json:"namespace"`
	Kinds     []string `json:"kinds"`
	Images    []string `json:"images"`
	Prompt    string   `json:"prompt"`
}

// K8sGenerateYAML 使用专职 Agent 生成 Kubernetes YAML 配置。
func (s *K8sService) K8sGenerateYAML(req K8sGenerateYAMLRequest) (string, error) {
	c := GetContainer()
	cfg := c.Store.GetSettings()
	_ = agent.DefaultRuntime.InitOrUpdate(cfg)
	return agent.GenerateK8sYAML(context.Background(), req.Namespace, req.Kinds, req.Images, req.Prompt)
}

// K8sApplyYAML 声明式部署并应用 YAML 资源清单。
func (s *K8sService) K8sApplyYAML(id string, yamlContent string) ([]k8s.K8sApplyResult, error) {
	cli, err := GetContainer().K8sMgr.GetClient(id)
	if err != nil {
		return nil, err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	return cli.ApplyYAML(ctx, yamlContent)
}
