package k8s

import (
	"context"
	"fmt"
	"io"
	"net"
	"os"
	"sort"
	"strings"
	"sync"
	"time"

	"encoding/json"
	"terminal/core"

	"golang.org/x/crypto/ssh"
	"gopkg.in/yaml.v3"
	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/meta"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/types"
	k8syaml "k8s.io/apimachinery/pkg/util/yaml"
	"k8s.io/client-go/discovery"
	"k8s.io/client-go/discovery/cached/memory"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/kubernetes/scheme"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/restmapper"
	"k8s.io/client-go/tools/clientcmd"
	clientcmdapi "k8s.io/client-go/tools/clientcmd/api"
	"k8s.io/client-go/tools/remotecommand"
)

// K8sClient 封装基于 client-go 的 Kubernetes 客户端。
type K8sClient struct {
	cfg        core.ServerConfig
	restConfig *rest.Config
	clientset  *kubernetes.Clientset
	sshClient  *ssh.Client
	targetInfo string
	mu         sync.RWMutex
}

// KubeconfigContextInfo 描述解析出来的 Kubeconfig 上下文及集群信息。
type KubeconfigContextInfo struct {
	CurrentContext string   `json:"currentContext"`
	Contexts       []string `json:"contexts"`
	ClusterHost    string   `json:"clusterHost"`
}

// ParseKubeconfigInfo 解析传入的 Kubeconfig 文本或文件路径。
func ParseKubeconfigInfo(kubeconfigData string, kubeconfigPath string) (*KubeconfigContextInfo, error) {
	var rawConfig *clientcmdapi.Config
	var err error

	if strings.TrimSpace(kubeconfigData) != "" {
		rawConfig, err = clientcmd.Load([]byte(kubeconfigData))
	} else if strings.TrimSpace(kubeconfigPath) != "" {
		rawConfig, err = clientcmd.LoadFromFile(strings.TrimSpace(kubeconfigPath))
	} else {
		return nil, fmt.Errorf("未提供 Kubeconfig 配置内容或文件路径")
	}

	if err != nil {
		return nil, fmt.Errorf("解析 Kubeconfig 失败: %w", err)
	}

	info := &KubeconfigContextInfo{
		CurrentContext: rawConfig.CurrentContext,
		Contexts:       make([]string, 0, len(rawConfig.Contexts)),
	}

	for name := range rawConfig.Contexts {
		info.Contexts = append(info.Contexts, name)
	}
	sort.Strings(info.Contexts)

	if ctx, exists := rawConfig.Contexts[rawConfig.CurrentContext]; exists {
		if cluster, cExists := rawConfig.Clusters[ctx.Cluster]; cExists {
			info.ClusterHost = cluster.Server
		}
	}

	return info, nil
}

// NewK8sClient 创建并初始化一个 K8sClient 实例。
func NewK8sClient(cfg core.ServerConfig) (*K8sClient, error) {
	var restConfig *rest.Config
	var targetInfo string

	isKubeconfig := (cfg.K8sAuthMode == "kubeconfig" || cfg.K8sAuthMode == "") &&
		(strings.TrimSpace(cfg.K8sKubeconfigData) != "" || strings.TrimSpace(cfg.K8sKubeconfigPath) != "")

	if isKubeconfig {
		var clientConfig clientcmd.ClientConfig
		overrides := &clientcmd.ConfigOverrides{}
		if cfg.K8sContext != "" {
			overrides.CurrentContext = cfg.K8sContext
		}

		if strings.TrimSpace(cfg.K8sKubeconfigData) != "" {
			rawConfig, err := clientcmd.Load([]byte(cfg.K8sKubeconfigData))
			if err != nil {
				return nil, fmt.Errorf("解析 Kubeconfig 文本配置失败: %w", err)
			}
			ctxName := overrides.CurrentContext
			if ctxName == "" {
				ctxName = rawConfig.CurrentContext
			}
			clientConfig = clientcmd.NewNonInteractiveClientConfig(*rawConfig, ctxName, overrides, nil)
		} else {
			loadingRules := &clientcmd.ClientConfigLoadingRules{ExplicitPath: strings.TrimSpace(cfg.K8sKubeconfigPath)}
			clientConfig = clientcmd.NewNonInteractiveDeferredLoadingClientConfig(loadingRules, overrides)
		}

		rc, err := clientConfig.ClientConfig()
		if err != nil {
			return nil, fmt.Errorf("构建 Kubernetes RestConfig 失败: %w", err)
		}
		restConfig = rc
		if cfg.K8sNamespace == "" {
			if ns, _, err := clientConfig.Namespace(); err == nil && ns != "" {
				cfg.K8sNamespace = ns
			}
		}
		targetInfo = restConfig.Host
		if targetInfo == "" {
			targetInfo = "Kubeconfig"
		}
	} else {
		apiServer := strings.TrimSpace(cfg.K8sAPIServer)
		if apiServer == "" {
			apiServer = strings.TrimSpace(cfg.Host)
		}
		if apiServer == "" {
			return nil, fmt.Errorf("Kubernetes API Server 地址或 Kubeconfig 不能为空")
		}

		if !strings.HasPrefix(apiServer, "http://") && !strings.HasPrefix(apiServer, "https://") {
			apiServer = "https://" + apiServer
		}

		restConfig = &rest.Config{
			Host:    apiServer,
			Timeout: 15 * time.Second,
		}

		// 认证配置
		token := strings.TrimSpace(cfg.K8sBearerToken)
		if token == "" && cfg.Password != "" {
			token = strings.TrimSpace(cfg.Password)
		}
		if token != "" {
			restConfig.BearerToken = token
		}

		// TLS 配置
		if cfg.K8sInsecureSkipTLS {
			restConfig.TLSClientConfig.Insecure = true
		} else {
			caData := strings.TrimSpace(cfg.K8sCAData)
			if caData != "" {
				if _, err := os.Stat(caData); err == nil {
					restConfig.TLSClientConfig.CAFile = caData
				} else {
					restConfig.TLSClientConfig.CAData = []byte(caData)
				}
			}

			certData := strings.TrimSpace(cfg.K8sCertData)
			keyData := strings.TrimSpace(cfg.K8sKeyData)
			if certData != "" && keyData != "" {
				if _, err := os.Stat(certData); err == nil {
					restConfig.TLSClientConfig.CertFile = certData
				} else {
					restConfig.TLSClientConfig.CertData = []byte(certData)
				}
				if _, err := os.Stat(keyData); err == nil {
					restConfig.TLSClientConfig.KeyFile = keyData
				} else {
					restConfig.TLSClientConfig.KeyData = []byte(keyData)
				}
			}
		}
		targetInfo = apiServer
	}

	if restConfig.Timeout == 0 {
		restConfig.Timeout = 15 * time.Second
	}

	var sshCli *ssh.Client
	// 支持通过 SSH 隧道代理访问内网 API Server
	if cfg.K8sSSHEnabled && cfg.K8sSSHHost != "" {
		sshClient, err := buildSSHClientForK8s(cfg)
		if err != nil {
			return nil, fmt.Errorf("建立 SSH 隧道失败: %w", err)
		}
		sshCli = sshClient

		restConfig.Dial = func(ctx context.Context, network, address string) (net.Conn, error) {
			return sshCli.Dial(network, address)
		}
	}

	clientset, err := kubernetes.NewForConfig(restConfig)
	if err != nil {
		if sshCli != nil {
			_ = sshCli.Close()
		}
		return nil, fmt.Errorf("创建 Kubernetes Clientset 失败: %w", err)
	}

	client := &K8sClient{
		cfg:        cfg,
		restConfig: restConfig,
		clientset:  clientset,
		sshClient:  sshCli,
		targetInfo: targetInfo,
	}

	return client, nil
}

// Ping 测试与 K8s 集群 API Server 的连通性。
func (c *K8sClient) Ping(ctx context.Context) error {
	_, err := c.clientset.Discovery().ServerVersion()
	if err != nil {
		return fmt.Errorf("无法连接 Kubernetes API Server (%s): %w", c.targetInfo, err)
	}
	return nil
}

// Close 关闭客户端与 SSH 隧道。
func (c *K8sClient) Close() error {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.sshClient != nil {
		_ = c.sshClient.Close()
		c.sshClient = nil
	}
	return nil
}

// RestConfig 返回 底层 REST 配置。
func (c *K8sClient) RestConfig() *rest.Config {
	return c.restConfig
}

// Clientset 返回底层 Kubernetes Clientset。
func (c *K8sClient) Clientset() *kubernetes.Clientset {
	return c.clientset
}

// GetOverview 获取集群概览信息。
func (c *K8sClient) GetOverview(ctx context.Context) (*K8sOverview, error) {
	ver, err := c.clientset.Discovery().ServerVersion()
	gitVer := "Unknown"
	platform := "Unknown"
	if err == nil && ver != nil {
		gitVer = ver.GitVersion
		platform = ver.Platform
	}

	nodes, _ := c.clientset.CoreV1().Nodes().List(ctx, metav1.ListOptions{})
	nodesTotal := 0
	nodesReady := 0
	if nodes != nil {
		nodesTotal = len(nodes.Items)
		for _, n := range nodes.Items {
			for _, cond := range n.Status.Conditions {
				if cond.Type == corev1.NodeReady && cond.Status == corev1.ConditionTrue {
					nodesReady++
					break
				}
			}
		}
	}

	nsList, _ := c.clientset.CoreV1().Namespaces().List(ctx, metav1.ListOptions{})
	nsTotal := 0
	if nsList != nil {
		nsTotal = len(nsList.Items)
	}

	pods, _ := c.clientset.CoreV1().Pods("").List(ctx, metav1.ListOptions{})
	podsTotal := 0
	podsRunning := 0
	if pods != nil {
		podsTotal = len(pods.Items)
		for _, p := range pods.Items {
			if p.Status.Phase == corev1.PodRunning {
				podsRunning++
			}
		}
	}

	deps, _ := c.clientset.AppsV1().Deployments("").List(ctx, metav1.ListOptions{})
	depsTotal := 0
	if deps != nil {
		depsTotal = len(deps.Items)
	}

	svcs, _ := c.clientset.CoreV1().Services("").List(ctx, metav1.ListOptions{})
	svcsTotal := 0
	if svcs != nil {
		svcsTotal = len(svcs.Items)
	}

	return &K8sOverview{
		Connected:        true,
		APIServer:        c.targetInfo,
		GitVersion:       gitVer,
		Platform:         platform,
		NodesTotal:       nodesTotal,
		NodesReady:       nodesReady,
		NamespacesTotal:  nsTotal,
		PodsTotal:        podsTotal,
		PodsRunning:      podsRunning,
		DeploymentsTotal: depsTotal,
		ServicesTotal:    svcsTotal,
	}, nil
}

// ListNamespaces 获取所有命名空间。
func (c *K8sClient) ListNamespaces(ctx context.Context) ([]K8sNamespaceInfo, error) {
	list, err := c.clientset.CoreV1().Namespaces().List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, fmt.Errorf("读取命名空间列表失败: %w", err)
	}

	var res []K8sNamespaceInfo
	for _, item := range list.Items {
		res = append(res, K8sNamespaceInfo{
			Name:      item.Name,
			Status:    string(item.Status.Phase),
			CreatedAt: item.CreationTimestamp.Format("2006-01-02 15:04:05"),
			Labels:    item.Labels,
		})
	}

	sort.Slice(res, func(i, j int) bool {
		return res[i].Name < res[j].Name
	})

	return res, nil
}

// ListNodes 获取所有节点信息。
func (c *K8sClient) ListNodes(ctx context.Context) ([]K8sNodeInfo, error) {
	list, err := c.clientset.CoreV1().Nodes().List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, fmt.Errorf("读取节点列表失败: %w", err)
	}

	var res []K8sNodeInfo
	for _, n := range list.Items {
		status := "NotReady"
		for _, cond := range n.Status.Conditions {
			if cond.Type == corev1.NodeReady && cond.Status == corev1.ConditionTrue {
				status = "Ready"
				break
			}
		}

		roles := []string{}
		for k := range n.Labels {
			if strings.HasPrefix(k, "node-role.kubernetes.io/") {
				role := strings.TrimPrefix(k, "node-role.kubernetes.io/")
				if role != "" {
					roles = append(roles, role)
				}
			}
		}
		if len(roles) == 0 {
			roles = append(roles, "worker")
		}

		var internalIP, externalIP string
		for _, addr := range n.Status.Addresses {
			if addr.Type == corev1.NodeInternalIP {
				internalIP = addr.Address
			} else if addr.Type == corev1.NodeExternalIP {
				externalIP = addr.Address
			}
		}

		cpuCap := n.Status.Capacity.Cpu().String()
		memCap := fmt.Sprintf("%.1f GiB", float64(n.Status.Capacity.Memory().Value())/(1024*1024*1024))
		podsCap := n.Status.Capacity.Pods().String()

		res = append(res, K8sNodeInfo{
			Name:           n.Name,
			Status:         status,
			Roles:          strings.Join(roles, ", "),
			KubeletVersion: n.Status.NodeInfo.KubeletVersion,
			OSImage:        n.Status.NodeInfo.OSImage,
			KernelVersion:  n.Status.NodeInfo.KernelVersion,
			InternalIP:     internalIP,
			ExternalIP:     externalIP,
			CPUCapacity:    cpuCap,
			MemCapacity:    memCap,
			PodsCapacity:   podsCap,
			CreatedAt:      n.CreationTimestamp.Format("2006-01-02 15:04:05"),
			Labels:         n.Labels,
		})
	}

	sort.Slice(res, func(i, j int) bool {
		return res[i].Name < res[j].Name
	})

	return res, nil
}

// ListPods 获取 Pod 列表（支持特定命名空间或全命名空间）。
func (c *K8sClient) ListPods(ctx context.Context, namespace string) ([]K8sPodInfo, error) {
	if namespace == "_all" {
		namespace = ""
	}

	list, err := c.clientset.CoreV1().Pods(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, fmt.Errorf("读取 Pod 列表失败: %w", err)
	}

	var res []K8sPodInfo
	for _, p := range list.Items {
		totalContainers := len(p.Spec.Containers)
		readyContainers := 0
		var restarts int32 = 0
		var containerSummaries []K8sContainerSummary

		for _, cs := range p.Status.ContainerStatuses {
			if cs.Ready {
				readyContainers++
			}
			restarts += cs.RestartCount

			state := "unknown"
			reason := ""
			if cs.State.Running != nil {
				state = "running"
			} else if cs.State.Waiting != nil {
				state = "waiting"
				reason = cs.State.Waiting.Reason
			} else if cs.State.Terminated != nil {
				state = "terminated"
				reason = cs.State.Terminated.Reason
			}

			containerSummaries = append(containerSummaries, K8sContainerSummary{
				Name:         cs.Name,
				Image:        cs.Image,
				Ready:        cs.Ready,
				State:        state,
				Reason:       reason,
				RestartCount: cs.RestartCount,
				IsInit:       false,
			})
		}

		if len(containerSummaries) == 0 {
			for _, c := range p.Spec.Containers {
				containerSummaries = append(containerSummaries, K8sContainerSummary{
					Name:         c.Name,
					Image:        c.Image,
					Ready:        false,
					State:        "waiting",
					RestartCount: 0,
					IsInit:       false,
				})
			}
		}

		// Init 初始化容器
		for _, ics := range p.Status.InitContainerStatuses {
			state := "unknown"
			reason := ""
			if ics.State.Running != nil {
				state = "running"
			} else if ics.State.Waiting != nil {
				state = "waiting"
				reason = ics.State.Waiting.Reason
			} else if ics.State.Terminated != nil {
				state = "terminated"
				reason = ics.State.Terminated.Reason
			}

			containerSummaries = append(containerSummaries, K8sContainerSummary{
				Name:         ics.Name,
				Image:        ics.Image,
				Ready:        ics.Ready,
				State:        state,
				Reason:       reason,
				RestartCount: ics.RestartCount,
				IsInit:       true,
			})
		}

		status := string(p.Status.Phase)
		// 检查 Waiting 原因 (如 CrashLoopBackOff, ImagePullBackOff)
		for _, cs := range p.Status.ContainerStatuses {
			if cs.State.Waiting != nil && cs.State.Waiting.Reason != "" {
				status = cs.State.Waiting.Reason
				break
			}
		}

		age := formatAge(p.CreationTimestamp.Time)

		res = append(res, K8sPodInfo{
			Name:       p.Name,
			Namespace:  p.Namespace,
			Status:     status,
			Ready:      fmt.Sprintf("%d/%d", readyContainers, totalContainers),
			Restarts:   restarts,
			NodeName:   p.Spec.NodeName,
			HostIP:     p.Status.HostIP,
			IP:         p.Status.PodIP,
			Containers: containerSummaries,
			CreatedAt:  p.CreationTimestamp.Format("2006-01-02 15:04:05"),
			Age:        age,
		})
	}

	sort.Slice(res, func(i, j int) bool {
		if res[i].Namespace != res[j].Namespace {
			return res[i].Namespace < res[j].Namespace
		}
		return res[i].Name < res[j].Name
	})

	return res, nil
}

// GetPodLogs 获取 Pod 容器日志。
func (c *K8sClient) GetPodLogs(ctx context.Context, namespace, podName, containerName string, tail int, timestamps bool) (string, error) {
	if tail <= 0 {
		tail = 200
	}
	t64 := int64(tail)

	opts := &corev1.PodLogOptions{
		TailLines:  &t64,
		Timestamps: timestamps,
	}
	if containerName != "" {
		opts.Container = containerName
	}

	req := c.clientset.CoreV1().Pods(namespace).GetLogs(podName, opts)
	stream, err := req.Stream(ctx)
	if err != nil {
		return "", fmt.Errorf("读取 Pod 日志失败: %w", err)
	}
	defer stream.Close()

	buf := new(strings.Builder)
	_, _ = io.Copy(buf, stream)
	return buf.String(), nil
}

// DeletePod 删除指定 Pod。
func (c *K8sClient) DeletePod(ctx context.Context, namespace, podName string) error {
	err := c.clientset.CoreV1().Pods(namespace).Delete(ctx, podName, metav1.DeleteOptions{})
	if err != nil {
		return fmt.Errorf("删除 Pod [%s] 失败: %w", podName, err)
	}
	return nil
}

// ListDeployments 获取 Deployment 列表。
func (c *K8sClient) ListDeployments(ctx context.Context, namespace string) ([]K8sDeploymentInfo, error) {
	if namespace == "_all" {
		namespace = ""
	}

	list, err := c.clientset.AppsV1().Deployments(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, fmt.Errorf("读取 Deployment 列表失败: %w", err)
	}

	var res []K8sDeploymentInfo
	for _, d := range list.Items {
		var images []string
		for _, container := range d.Spec.Template.Spec.Containers {
			images = append(images, container.Image)
		}

		var replicas int32 = 0
		if d.Spec.Replicas != nil {
			replicas = *d.Spec.Replicas
		}

		res = append(res, K8sDeploymentInfo{
			Name:              d.Name,
			Namespace:         d.Namespace,
			Replicas:          replicas,
			ReadyReplicas:     d.Status.ReadyReplicas,
			AvailableReplicas: d.Status.AvailableReplicas,
			UpdatedReplicas:   d.Status.UpdatedReplicas,
			Images:            images,
			Selector:          d.Spec.Selector.MatchLabels,
			CreatedAt:         d.CreationTimestamp.Format("2006-01-02 15:04:05"),
		})
	}

	sort.Slice(res, func(i, j int) bool {
		if res[i].Namespace != res[j].Namespace {
			return res[i].Namespace < res[j].Namespace
		}
		return res[i].Name < res[j].Name
	})

	return res, nil
}

// ScaleDeployment 动态调整 Deployment 副本数。
func (c *K8sClient) ScaleDeployment(ctx context.Context, namespace, name string, replicas int32) error {
	scale, err := c.clientset.AppsV1().Deployments(namespace).GetScale(ctx, name, metav1.GetOptions{})
	if err != nil {
		return fmt.Errorf("获取 Deployment 扩缩容配置失败: %w", err)
	}

	scale.Spec.Replicas = replicas
	_, err = c.clientset.AppsV1().Deployments(namespace).UpdateScale(ctx, name, scale, metav1.UpdateOptions{})
	if err != nil {
		return fmt.Errorf("调整 Deployment [%s] 副本数失败: %w", name, err)
	}
	return nil
}

// RestartDeployment 触发 Deployment 滚动重启。
func (c *K8sClient) RestartDeployment(ctx context.Context, namespace, name string) error {
	patchData := fmt.Sprintf(`{"spec":{"template":{"metadata":{"annotations":{"kubectl.kubernetes.io/restartedAt":"%s"}}}}}`, time.Now().Format(time.RFC3339))
	_, err := c.clientset.AppsV1().Deployments(namespace).Patch(ctx, name, types.StrategicMergePatchType, []byte(patchData), metav1.PatchOptions{})
	if err != nil {
		return fmt.Errorf("重启 Deployment [%s] 失败: %w", name, err)
	}
	return nil
}

// ListServices 获取 Service 列表。
func (c *K8sClient) ListServices(ctx context.Context, namespace string) ([]K8sServiceInfo, error) {
	if namespace == "_all" {
		namespace = ""
	}

	list, err := c.clientset.CoreV1().Services(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, fmt.Errorf("读取 Service 列表失败: %w", err)
	}

	var res []K8sServiceInfo
	for _, s := range list.Items {
		var ports []string
		for _, p := range s.Spec.Ports {
			if p.NodePort > 0 {
				ports = append(ports, fmt.Sprintf("%d:%d/%s", p.Port, p.NodePort, p.Protocol))
			} else {
				ports = append(ports, fmt.Sprintf("%d/%s", p.Port, p.Protocol))
			}
		}

		var extIP string
		if len(s.Status.LoadBalancer.Ingress) > 0 {
			extIP = s.Status.LoadBalancer.Ingress[0].IP
			if extIP == "" {
				extIP = s.Status.LoadBalancer.Ingress[0].Hostname
			}
		}

		res = append(res, K8sServiceInfo{
			Name:       s.Name,
			Namespace:  s.Namespace,
			Type:       string(s.Spec.Type),
			ClusterIP:  s.Spec.ClusterIP,
			ExternalIP: extIP,
			Ports:      ports,
			Selector:   s.Spec.Selector,
			CreatedAt:  s.CreationTimestamp.Format("2006-01-02 15:04:05"),
		})
	}

	sort.Slice(res, func(i, j int) bool {
		if res[i].Namespace != res[j].Namespace {
			return res[i].Namespace < res[j].Namespace
		}
		return res[i].Name < res[j].Name
	})

	return res, nil
}

// ListIngresses 获取 Ingress 路由列表。
func (c *K8sClient) ListIngresses(ctx context.Context, namespace string) ([]K8sIngressInfo, error) {
	if namespace == "_all" {
		namespace = ""
	}

	list, err := c.clientset.NetworkingV1().Ingresses(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, fmt.Errorf("读取 Ingress 列表失败: %w", err)
	}

	var res []K8sIngressInfo
	for _, ing := range list.Items {
		var hosts []string
		var rules []string

		for _, r := range ing.Spec.Rules {
			if r.Host != "" {
				hosts = append(hosts, r.Host)
			}
			if r.HTTP != nil {
				for _, p := range r.HTTP.Paths {
					rules = append(rules, fmt.Sprintf("%s%s -> %s:%d", r.Host, p.Path, p.Backend.Service.Name, p.Backend.Service.Port.Number))
				}
			}
		}

		ingClass := ""
		if ing.Spec.IngressClassName != nil {
			ingClass = *ing.Spec.IngressClassName
		}

		res = append(res, K8sIngressInfo{
			Name:         ing.Name,
			Namespace:    ing.Namespace,
			IngressClass: ingClass,
			Hosts:        hosts,
			Rules:        rules,
			CreatedAt:    ing.CreationTimestamp.Format("2006-01-02 15:04:05"),
		})
	}

	sort.Slice(res, func(i, j int) bool {
		return res[i].Name < res[j].Name
	})

	return res, nil
}

// ListConfigMaps 获取 ConfigMap 列表。
func (c *K8sClient) ListConfigMaps(ctx context.Context, namespace string) ([]K8sConfigMapInfo, error) {
	if namespace == "_all" {
		namespace = ""
	}

	list, err := c.clientset.CoreV1().ConfigMaps(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, fmt.Errorf("读取 ConfigMap 列表失败: %w", err)
	}

	var res []K8sConfigMapInfo
	for _, cm := range list.Items {
		res = append(res, K8sConfigMapInfo{
			Name:      cm.Name,
			Namespace: cm.Namespace,
			DataCount: len(cm.Data) + len(cm.BinaryData),
			Data:      cm.Data,
			CreatedAt: cm.CreationTimestamp.Format("2006-01-02 15:04:05"),
		})
	}

	sort.Slice(res, func(i, j int) bool {
		return res[i].Name < res[j].Name
	})

	return res, nil
}

// ListSecrets 获取 Secret 凭据列表。
func (c *K8sClient) ListSecrets(ctx context.Context, namespace string) ([]K8sSecretInfo, error) {
	if namespace == "_all" {
		namespace = ""
	}

	list, err := c.clientset.CoreV1().Secrets(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, fmt.Errorf("读取 Secret 列表失败: %w", err)
	}

	var res []K8sSecretInfo
	for _, sec := range list.Items {
		var keys []string
		for k := range sec.Data {
			keys = append(keys, k)
		}

		res = append(res, K8sSecretInfo{
			Name:      sec.Name,
			Namespace: sec.Namespace,
			Type:      string(sec.Type),
			DataCount: len(sec.Data),
			Keys:      keys,
			CreatedAt: sec.CreationTimestamp.Format("2006-01-02 15:04:05"),
		})
	}

	sort.Slice(res, func(i, j int) bool {
		return res[i].Name < res[j].Name
	})

	return res, nil
}

// ListPVCs 获取持久存储卷声明 PVC 列表。
func (c *K8sClient) ListPVCs(ctx context.Context, namespace string) ([]K8sPVCInfo, error) {
	if namespace == "_all" {
		namespace = ""
	}

	list, err := c.clientset.CoreV1().PersistentVolumeClaims(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, fmt.Errorf("读取 PVC 列表失败: %w", err)
	}

	var res []K8sPVCInfo
	for _, pvc := range list.Items {
		var accessModes []string
		for _, am := range pvc.Spec.AccessModes {
			accessModes = append(accessModes, string(am))
		}

		sc := ""
		if pvc.Spec.StorageClassName != nil {
			sc = *pvc.Spec.StorageClassName
		}

		capStr := ""
		if qty, ok := pvc.Status.Capacity[corev1.ResourceStorage]; ok {
			capStr = qty.String()
		}

		res = append(res, K8sPVCInfo{
			Name:         pvc.Name,
			Namespace:    pvc.Namespace,
			Status:       string(pvc.Status.Phase),
			VolumeName:   pvc.Spec.VolumeName,
			Capacity:     capStr,
			AccessModes:  accessModes,
			StorageClass: sc,
			CreatedAt:    pvc.CreationTimestamp.Format("2006-01-02 15:04:05"),
		})
	}

	sort.Slice(res, func(i, j int) bool {
		return res[i].Name < res[j].Name
	})

	return res, nil
}

// DeleteDeployment 删除指定 Deployment。
func (c *K8sClient) DeleteDeployment(ctx context.Context, namespace, name string) error {
	err := c.clientset.AppsV1().Deployments(namespace).Delete(ctx, name, metav1.DeleteOptions{})
	if err != nil {
		return fmt.Errorf("删除 Deployment [%s] 失败: %w", name, err)
	}
	return nil
}

// DeleteService 删除指定 Service。
func (c *K8sClient) DeleteService(ctx context.Context, namespace, name string) error {
	err := c.clientset.CoreV1().Services(namespace).Delete(ctx, name, metav1.DeleteOptions{})
	if err != nil {
		return fmt.Errorf("删除 Service [%s] 失败: %w", name, err)
	}
	return nil
}

// DeleteIngress 删除指定 Ingress。
func (c *K8sClient) DeleteIngress(ctx context.Context, namespace, name string) error {
	err := c.clientset.NetworkingV1().Ingresses(namespace).Delete(ctx, name, metav1.DeleteOptions{})
	if err != nil {
		return fmt.Errorf("删除 Ingress [%s] 失败: %w", name, err)
	}
	return nil
}

// DeleteConfigMap 删除指定 ConfigMap。
func (c *K8sClient) DeleteConfigMap(ctx context.Context, namespace, name string) error {
	err := c.clientset.CoreV1().ConfigMaps(namespace).Delete(ctx, name, metav1.DeleteOptions{})
	if err != nil {
		return fmt.Errorf("删除 ConfigMap [%s] 失败: %w", name, err)
	}
	return nil
}

// DeleteSecret 删除指定 Secret。
func (c *K8sClient) DeleteSecret(ctx context.Context, namespace, name string) error {
	err := c.clientset.CoreV1().Secrets(namespace).Delete(ctx, name, metav1.DeleteOptions{})
	if err != nil {
		return fmt.Errorf("删除 Secret [%s] 失败: %w", name, err)
	}
	return nil
}

// DeletePVC 删除指定 PVC。
func (c *K8sClient) DeletePVC(ctx context.Context, namespace, name string) error {
	err := c.clientset.CoreV1().PersistentVolumeClaims(namespace).Delete(ctx, name, metav1.DeleteOptions{})
	if err != nil {
		return fmt.Errorf("删除 PVC [%s] 失败: %w", name, err)
	}
	return nil
}

// CreateNamespace 创建新命名空间。
func (c *K8sClient) CreateNamespace(ctx context.Context, name string) error {
	trimmed := strings.TrimSpace(name)
	if trimmed == "" {
		return fmt.Errorf("命名空间名称不能为空")
	}
	nsObj := &corev1.Namespace{
		ObjectMeta: metav1.ObjectMeta{
			Name: trimmed,
		},
	}
	_, err := c.clientset.CoreV1().Namespaces().Create(ctx, nsObj, metav1.CreateOptions{})
	if err != nil {
		return fmt.Errorf("创建命名空间 [%s] 失败: %w", trimmed, err)
	}
	return nil
}

// DeleteNamespace 删除指定命名空间。
func (c *K8sClient) DeleteNamespace(ctx context.Context, name string) error {
	trimmed := strings.TrimSpace(name)
	if trimmed == "" {
		return fmt.Errorf("命名空间名称不能为空")
	}
	if trimmed == "default" || trimmed == "kube-system" || trimmed == "kube-public" || trimmed == "kube-node-lease" {
		return fmt.Errorf("系统核心命名空间 [%s] 禁止删除", trimmed)
	}
	err := c.clientset.CoreV1().Namespaces().Delete(ctx, trimmed, metav1.DeleteOptions{})
	if err != nil {
		return fmt.Errorf("删除命名空间 [%s] 失败: %w", trimmed, err)
	}
	return nil
}

// GetResourceYAML 获取任意资源的 YAML 描述文本。
func (c *K8sClient) GetResourceYAML(ctx context.Context, kind, namespace, name string) (string, error) {
	kindLower := strings.ToLower(kind)
	var obj any
	var err error

	switch kindLower {
	case "pod", "pods":
		p, e := c.clientset.CoreV1().Pods(namespace).Get(ctx, name, metav1.GetOptions{})
		if e == nil {
			p.TypeMeta = metav1.TypeMeta{APIVersion: "v1", Kind: "Pod"}
			p.ManagedFields = nil
		}
		obj, err = p, e
	case "deployment", "deployments":
		d, e := c.clientset.AppsV1().Deployments(namespace).Get(ctx, name, metav1.GetOptions{})
		if e == nil {
			d.TypeMeta = metav1.TypeMeta{APIVersion: "apps/v1", Kind: "Deployment"}
			d.ManagedFields = nil
		}
		obj, err = d, e
	case "service", "services":
		s, e := c.clientset.CoreV1().Services(namespace).Get(ctx, name, metav1.GetOptions{})
		if e == nil {
			s.TypeMeta = metav1.TypeMeta{APIVersion: "v1", Kind: "Service"}
			s.ManagedFields = nil
		}
		obj, err = s, e
	case "node", "nodes":
		n, e := c.clientset.CoreV1().Nodes().Get(ctx, name, metav1.GetOptions{})
		if e == nil {
			n.TypeMeta = metav1.TypeMeta{APIVersion: "v1", Kind: "Node"}
			n.ManagedFields = nil
		}
		obj, err = n, e
	case "configmap", "configmaps":
		cm, e := c.clientset.CoreV1().ConfigMaps(namespace).Get(ctx, name, metav1.GetOptions{})
		if e == nil {
			cm.TypeMeta = metav1.TypeMeta{APIVersion: "v1", Kind: "ConfigMap"}
			cm.ManagedFields = nil
		}
		obj, err = cm, e
	case "secret", "secrets":
		sec, e := c.clientset.CoreV1().Secrets(namespace).Get(ctx, name, metav1.GetOptions{})
		if e == nil {
			sec.TypeMeta = metav1.TypeMeta{APIVersion: "v1", Kind: "Secret"}
			sec.ManagedFields = nil
		}
		obj, err = sec, e
	case "ingress", "ingresses":
		ing, e := c.clientset.NetworkingV1().Ingresses(namespace).Get(ctx, name, metav1.GetOptions{})
		if e == nil {
			ing.TypeMeta = metav1.TypeMeta{APIVersion: "networking.k8s.io/v1", Kind: "Ingress"}
			ing.ManagedFields = nil
		}
		obj, err = ing, e
	case "pvc", "persistentvolumeclaims", "persistentvolumeclaim":
		pvc, e := c.clientset.CoreV1().PersistentVolumeClaims(namespace).Get(ctx, name, metav1.GetOptions{})
		if e == nil {
			pvc.TypeMeta = metav1.TypeMeta{APIVersion: "v1", Kind: "PersistentVolumeClaim"}
			pvc.ManagedFields = nil
		}
		obj, err = pvc, e
	default:
		return "", fmt.Errorf("不支持的资源类型: %s", kind)
	}

	if err != nil {
		return "", fmt.Errorf("获取资源 [%s/%s] 失败: %w", namespace, name, err)
	}

	// 先通过 JSON 序列化触发 TypeMeta (json:",inline") 自动内联到顶层，再转为结构化 map
	jsonBytes, err := json.Marshal(obj)
	if err != nil {
		return "", fmt.Errorf("序列化 JSON 失败: %w", err)
	}

	var rawMap map[string]interface{}
	if err := json.Unmarshal(jsonBytes, &rawMap); err != nil {
		return "", fmt.Errorf("解析对象结构失败: %w", err)
	}

	// 清理冗余的内部运行态元数据
	if meta, ok := rawMap["metadata"].(map[string]interface{}); ok {
		delete(meta, "managedFields")
	}

	yamlBytes, err := yaml.Marshal(rawMap)
	if err != nil {
		return "", fmt.Errorf("序列化 YAML 失败: %w", err)
	}

	return string(yamlBytes), nil
}

// ---------------- 内部工具 ----------------

func buildSSHClientForK8s(cfg core.ServerConfig) (*ssh.Client, error) {
	sshPort := cfg.K8sSSHPort
	if sshPort <= 0 {
		sshPort = 22
	}
	addr := fmt.Sprintf("%s:%d", cfg.K8sSSHHost, sshPort)

	var authMethods []ssh.AuthMethod
	if cfg.K8sSSHAuthType == "key" || (cfg.K8sSSHKeyPath != "" || cfg.K8sSSHKeyData != "") {
		var keyBytes []byte
		if cfg.K8sSSHKeyData != "" {
			keyBytes = []byte(cfg.K8sSSHKeyData)
		} else if cfg.K8sSSHKeyPath != "" {
			var err error
			keyBytes, err = os.ReadFile(cfg.K8sSSHKeyPath)
			if err != nil {
				return nil, fmt.Errorf("读取 SSH 私钥失败: %w", err)
			}
		}

		var signer ssh.Signer
		var err error
		if cfg.K8sSSHPassphrase != "" {
			signer, err = ssh.ParsePrivateKeyWithPassphrase(keyBytes, []byte(cfg.K8sSSHPassphrase))
		} else {
			signer, err = ssh.ParsePrivateKey(keyBytes)
		}
		if err != nil {
			return nil, fmt.Errorf("解析 SSH 私钥失败: %w", err)
		}
		authMethods = append(authMethods, ssh.PublicKeys(signer))
	} else if cfg.K8sSSHPassword != "" {
		authMethods = append(authMethods, ssh.Password(cfg.K8sSSHPassword))
	}

	sshConfig := &ssh.ClientConfig{
		User:            cfg.K8sSSHUser,
		Auth:            authMethods,
		HostKeyCallback: ssh.InsecureIgnoreHostKey(),
		Timeout:         10 * time.Second,
	}

	return ssh.Dial("tcp", addr, sshConfig)
}

func formatAge(t time.Time) string {
	d := time.Since(t)
	if d.Hours() >= 48 {
		return fmt.Sprintf("%dd", int(d.Hours()/24))
	}
	if d.Hours() >= 1 {
		return fmt.Sprintf("%dh", int(d.Hours()))
	}
	if d.Minutes() >= 1 {
		return fmt.Sprintf("%dm", int(d.Minutes()))
	}
	return fmt.Sprintf("%ds", int(d.Seconds()))
}

// ApplyYAML 解析并声明式部署 YAML 清单中的所有资源（支持多文档 --- 分隔）。
func (c *K8sClient) ApplyYAML(ctx context.Context, yamlContent string) ([]K8sApplyResult, error) {
	if strings.TrimSpace(yamlContent) == "" {
		return nil, fmt.Errorf("YAML 内容为空")
	}

	dynClient, err := dynamic.NewForConfig(c.restConfig)
	if err != nil {
		return nil, fmt.Errorf("创建动态客户端失败: %w", err)
	}

	discoClient, err := discovery.NewDiscoveryClientForConfig(c.restConfig)
	if err != nil {
		return nil, fmt.Errorf("创建发现客户端失败: %w", err)
	}

	mapper := restmapper.NewDeferredDiscoveryRESTMapper(memory.NewMemCacheClient(discoClient))
	decoder := k8syaml.NewYAMLOrJSONDecoder(strings.NewReader(yamlContent), 4096)

	var results []K8sApplyResult

	for {
		var rawObj map[string]interface{}
		err := decoder.Decode(&rawObj)
		if err == io.EOF {
			break
		}
		if err != nil {
			return results, fmt.Errorf("解析 YAML 语法失败: %w", err)
		}
		if len(rawObj) == 0 {
			continue
		}

		// 兼容历史嵌套 typemeta
		if tm, ok := rawObj["typemeta"].(map[string]interface{}); ok {
			for k, v := range tm {
				if _, exists := rawObj[k]; !exists {
					rawObj[k] = v
				}
			}
			delete(rawObj, "typemeta")
		}

		unstructObj := &unstructured.Unstructured{Object: rawObj}
		gvk := unstructObj.GroupVersionKind()
		if gvk.Kind == "" {
			if k, ok := rawObj["kind"].(string); ok && k != "" {
				gvk.Kind = k
			} else if k, ok := rawObj["Kind"].(string); ok && k != "" {
				gvk.Kind = k
			}
		}

		if gvk.Kind == "" {
			results = append(results, K8sApplyResult{
				Action:  "failed",
				Message: "YAML 资源缺少 kind 定义",
			})
			continue
		}

		if gvk.Version == "" {
			switch strings.ToLower(gvk.Kind) {
			case "deployment", "statefulset", "daemonset", "replicaset":
				gvk.Group = "apps"
				gvk.Version = "v1"
			case "ingress":
				gvk.Group = "networking.k8s.io"
				gvk.Version = "v1"
			case "job", "cronjob":
				gvk.Group = "batch"
				gvk.Version = "v1"
			default:
				gvk.Version = "v1"
			}
			unstructObj.SetGroupVersionKind(gvk)
		}

		mapping, err := mapper.RESTMapping(gvk.GroupKind(), gvk.Version)
		if err != nil {
			results = append(results, K8sApplyResult{
				Kind:    gvk.Kind,
				Name:    unstructObj.GetName(),
				Action:  "failed",
				Message: fmt.Sprintf("未识别的资源定义 GVK (%s): %v", gvk.String(), err),
			})
			continue
		}

		var dri dynamic.ResourceInterface
		if mapping.Scope.Name() == meta.RESTScopeNameNamespace {
			ns := unstructObj.GetNamespace()
			if ns == "" {
				ns = "default"
				unstructObj.SetNamespace(ns)
			}
			dri = dynClient.Resource(mapping.Resource).Namespace(ns)
		} else {
			dri = dynClient.Resource(mapping.Resource)
		}

		name := unstructObj.GetName()
		if name == "" {
			results = append(results, K8sApplyResult{
				Kind:    gvk.Kind,
				Action:  "failed",
				Message: "资源缺少 metadata.name",
			})
			continue
		}

		// 序列化对象准备 Server-Side Apply
		data, err := json.Marshal(unstructObj)
		if err != nil {
			results = append(results, K8sApplyResult{
				Kind:    gvk.Kind,
				Name:    name,
				Action:  "failed",
				Message: fmt.Sprintf("序列化对象失败: %v", err),
			})
			continue
		}

		force := true
		appliedObj, applyErr := dri.Patch(ctx, name, types.ApplyPatchType, data, metav1.PatchOptions{
			FieldManager: "terminal-k8s-client",
			Force:        &force,
		})

		if applyErr != nil {
			// 如果 Server-Side Apply 失败，尝试传统 Get -> Create / Update 降级
			existing, getErr := dri.Get(ctx, name, metav1.GetOptions{})
			if getErr != nil {
				// 创建新资源
				_, createErr := dri.Create(ctx, unstructObj, metav1.CreateOptions{})
				if createErr != nil {
					results = append(results, K8sApplyResult{
						Kind:      gvk.Kind,
						Name:      name,
						Namespace: unstructObj.GetNamespace(),
						Action:    "failed",
						Message:   createErr.Error(),
					})
					continue
				}
				results = append(results, K8sApplyResult{
					Kind:      gvk.Kind,
					Name:      name,
					Namespace: unstructObj.GetNamespace(),
					Action:    "created",
				})
			} else {
				// 更新已存在的资源
				unstructObj.SetResourceVersion(existing.GetResourceVersion())
				_, updateErr := dri.Update(ctx, unstructObj, metav1.UpdateOptions{})
				if updateErr != nil {
					results = append(results, K8sApplyResult{
						Kind:      gvk.Kind,
						Name:      name,
						Namespace: unstructObj.GetNamespace(),
						Action:    "failed",
						Message:   updateErr.Error(),
					})
					continue
				}
				results = append(results, K8sApplyResult{
					Kind:      gvk.Kind,
					Name:      name,
					Namespace: unstructObj.GetNamespace(),
					Action:    "configured",
				})
			}
		} else {
			results = append(results, K8sApplyResult{
				Kind:      gvk.Kind,
				Name:      appliedObj.GetName(),
				Namespace: appliedObj.GetNamespace(),
				Action:    "configured",
			})
		}
	}

	return results, nil
}

type k8sStreamWriter struct {
	onChunk func(chunk string)
}

func (w *k8sStreamWriter) Write(p []byte) (n int, err error) {
	if len(p) > 0 && w.onChunk != nil {
		w.onChunk(string(p))
	}
	return len(p), nil
}

// ExecStream 在指定的 Pod / Container 内部执行命令并实时流式回调输出，返回 (exitCode, error)。
func (c *K8sClient) ExecStream(ctx context.Context, namespace, podName, containerName string, cmd []string, onChunk func(chunk string)) (int, error) {
	if c == nil || c.clientset == nil || c.restConfig == nil {
		return -1, fmt.Errorf("Kubernetes 客户端未就绪")
	}
	if namespace == "" {
		namespace = "default"
	}
	if len(cmd) == 0 {
		return -1, fmt.Errorf("命令不能为空")
	}

	req := c.clientset.CoreV1().RESTClient().Post().
		Resource("pods").
		Name(podName).
		Namespace(namespace).
		SubResource("exec").
		VersionedParams(&corev1.PodExecOptions{
			Container: containerName,
			Command:   cmd,
			Stdin:     false,
			Stdout:    true,
			Stderr:    true,
			TTY:       false,
		}, scheme.ParameterCodec)

	executor, err := remotecommand.NewSPDYExecutor(c.restConfig, "POST", req.URL())
	if err != nil {
		return -1, fmt.Errorf("创建 SPDY Executor 失败: %w", err)
	}

	writer := &k8sStreamWriter{onChunk: onChunk}
	execErr := executor.StreamWithContext(ctx, remotecommand.StreamOptions{
		Stdout: writer,
		Stderr: writer,
		Tty:    false,
	})

	if execErr != nil {
		return 1, execErr
	}
	return 0, nil
}
