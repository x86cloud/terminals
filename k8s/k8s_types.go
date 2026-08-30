package k8s

// K8sOverview 描述 Kubernetes 集群的概览信息。
type K8sOverview struct {
	Connected        bool   `json:"connected"`
	APIServer        string `json:"apiServer"`
	GitVersion       string `json:"gitVersion"`
	Platform         string `json:"platform"`
	NodesTotal       int    `json:"nodesTotal"`
	NodesReady       int    `json:"nodesReady"`
	NamespacesTotal  int    `json:"namespacesTotal"`
	PodsTotal        int    `json:"podsTotal"`
	PodsRunning      int    `json:"podsRunning"`
	DeploymentsTotal int    `json:"deploymentsTotal"`
	ServicesTotal    int    `json:"servicesTotal"`
}

// K8sNodeInfo 描述集群节点信息。
type K8sNodeInfo struct {
	Name           string            `json:"name"`
	Status         string            `json:"status"` // Ready | NotReady | Unknown
	Roles          string            `json:"roles"`  // control-plane | worker | master
	KubeletVersion string            `json:"kubeletVersion"`
	OSImage        string            `json:"osImage"`
	KernelVersion  string            `json:"kernelVersion"`
	InternalIP     string            `json:"internalIp"`
	ExternalIP     string            `json:"externalIp"`
	CPUCapacity    string            `json:"cpuCapacity"`
	MemCapacity    string            `json:"memCapacity"`
	PodsCapacity   string            `json:"podsCapacity"`
	CreatedAt      string            `json:"createdAt"`
	Labels         map[string]string `json:"labels,omitempty"`
}

// K8sNamespaceInfo 描述命名空间信息。
type K8sNamespaceInfo struct {
	Name      string            `json:"name"`
	Status    string            `json:"status"` // Active | Terminating
	CreatedAt string            `json:"createdAt"`
	Labels    map[string]string `json:"labels,omitempty"`
}

// K8sContainerSummary 描述 Pod 内容器状态。
type K8sContainerSummary struct {
	Name         string `json:"name"`
	Image        string `json:"image"`
	Ready        bool   `json:"ready"`
	State        string `json:"state"` // running | waiting | terminated
	Reason       string `json:"reason,omitempty"`
	RestartCount int32  `json:"restartCount"`
	IsInit       bool   `json:"isInit,omitempty"`
}

// K8sPodInfo 描述 Pod 实例信息。
type K8sPodInfo struct {
	Name       string                `json:"name"`
	Namespace  string                `json:"namespace"`
	Status     string                `json:"status"` // Running | Pending | Succeeded | Failed | CrashLoopBackOff
	Ready      string                `json:"ready"`  // e.g. "1/1"
	Restarts   int32                 `json:"restarts"`
	NodeName   string                `json:"nodeName"`
	HostIP     string                `json:"hostIp,omitempty"`
	IP         string                `json:"ip"`
	Containers []K8sContainerSummary `json:"containers"`
	CreatedAt  string                `json:"createdAt"`
	Age        string                `json:"age"`
}

// K8sDeploymentInfo 描述 Deployment 无状态负载信息。
type K8sDeploymentInfo struct {
	Name              string            `json:"name"`
	Namespace         string            `json:"namespace"`
	Replicas          int32             `json:"replicas"`
	ReadyReplicas     int32             `json:"readyReplicas"`
	AvailableReplicas int32             `json:"availableReplicas"`
	UpdatedReplicas   int32             `json:"updatedReplicas"`
	Images            []string          `json:"images"`
	Selector          map[string]string `json:"selector,omitempty"`
	CreatedAt         string            `json:"createdAt"`
}

// K8sServiceInfo 描述 Service 网络服务信息。
type K8sServiceInfo struct {
	Name       string            `json:"name"`
	Namespace  string            `json:"namespace"`
	Type       string            `json:"type"` // ClusterIP | NodePort | LoadBalancer | ExternalName
	ClusterIP  string            `json:"clusterIp"`
	ExternalIP string            `json:"externalIp"`
	Ports      []string          `json:"ports"`
	Selector   map[string]string `json:"selector,omitempty"`
	CreatedAt  string            `json:"createdAt"`
}

// K8sIngressInfo 描述 Ingress 路由规则信息。
type K8sIngressInfo struct {
	Name         string   `json:"name"`
	Namespace    string   `json:"namespace"`
	IngressClass string   `json:"ingressClass"`
	Hosts        []string `json:"hosts"`
	Rules        []string `json:"rules"`
	CreatedAt    string   `json:"createdAt"`
}

// K8sConfigMapInfo 描述 ConfigMap 配置信息。
type K8sConfigMapInfo struct {
	Name      string            `json:"name"`
	Namespace string            `json:"namespace"`
	DataCount int               `json:"dataCount"`
	Data      map[string]string `json:"data,omitempty"`
	CreatedAt string            `json:"createdAt"`
}

// K8sSecretInfo 描述 Secret 凭据信息。
type K8sSecretInfo struct {
	Name      string   `json:"name"`
	Namespace string   `json:"namespace"`
	Type      string   `json:"type"`
	DataCount int      `json:"dataCount"`
	Keys      []string `json:"keys"`
	CreatedAt string   `json:"createdAt"`
}

// K8sPVCInfo 描述持久卷声明信息。
type K8sPVCInfo struct {
	Name         string   `json:"name"`
	Namespace    string   `json:"namespace"`
	Status       string   `json:"status"` // Bound | Pending | Lost
	VolumeName   string   `json:"volumeName"`
	Capacity     string   `json:"capacity"`
	AccessModes  []string `json:"accessModes"`
	StorageClass string   `json:"storageClass"`
	CreatedAt    string   `json:"createdAt"`
}

// K8sApplyResult 描述 YAML 部署单个资源的结果。
type K8sApplyResult struct {
	Kind      string `json:"kind"`
	Name      string `json:"name"`
	Namespace string `json:"namespace,omitempty"`
	Action    string `json:"action"` // "created" | "configured" | "failed"
	Message   string `json:"message,omitempty"`
}
