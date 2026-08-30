package docker

// DockerOverview 描述 Docker 守护进程与系统概览信息。
type DockerOverview struct {
	Connected          bool   `json:"connected"`
	ServerVersion      string `json:"serverVersion"`
	APIVersion         string `json:"apiVersion"`
	OS                 string `json:"os"`
	Arch               string `json:"arch"`
	KernelVersion      string `json:"kernelVersion"`
	OperatingSystem    string `json:"operatingSystem"`
	NCPU               int    `json:"ncpu"`
	MemTotal           int64  `json:"memTotal"`
	ContainersTotal    int    `json:"containersTotal"`
	ContainersRunning  int    `json:"containersRunning"`
	ContainersPaused   int    `json:"containersPaused"`
	ContainersStopped  int    `json:"containersStopped"`
	ImagesTotal        int    `json:"imagesTotal"`
	ComposeTotal       int    `json:"composeTotal"`
	VolumesTotal       int    `json:"volumesTotal"`
	NetworksTotal      int    `json:"networksTotal"`
	DockerRootDir      string `json:"dockerRootDir"`
	StorageDriver      string `json:"storageDriver"`
	EndpointType       string `json:"endpointType"`
	EndpointTarget     string `json:"endpointTarget"`
}

// DockerPortMapping 端口映射。
type DockerPortMapping struct {
	IP          string `json:"ip,omitempty"`
	PrivatePort uint16 `json:"privatePort"`
	PublicPort  uint16 `json:"publicPort,omitempty"`
	Type        string `json:"type"` // tcp | udp
}

// DockerContainerInfo 描述容器信息。
type DockerContainerInfo struct {
	ID         string              `json:"id"`
	ShortID    string              `json:"shortId"`
	Names      []string            `json:"names"`
	Name       string              `json:"name"`
	Image      string              `json:"image"`
	ImageID    string              `json:"imageId"`
	Command    string              `json:"command"`
	Created    int64               `json:"created"`
	State      string              `json:"state"`  // running | exited | paused | restarting | created | dead
	Status     string              `json:"status"` // e.g. "Up 2 hours", "Exited (0) 5 minutes ago"
	Ports      []DockerPortMapping `json:"ports"`
	PortStr    string              `json:"portStr"`
	IPAddress  string              `json:"ipAddress"`
	SizeRw     int64               `json:"sizeRw,omitempty"`
	SizeRootFs int64               `json:"sizeRootFs,omitempty"`
	Labels     map[string]string   `json:"labels,omitempty"`
}

// DockerImageInfo 描述镜像信息。
type DockerImageInfo struct {
	ID          string            `json:"id"`
	ShortID     string            `json:"shortId"`
	RepoTags    []string          `json:"repoTags"`
	Repository  string            `json:"repository"`
	Tag         string            `json:"tag"`
	Size        int64             `json:"size"`
	SizeStr     string            `json:"sizeStr"`
	Created     int64             `json:"created"`
	Containers  int64             `json:"containers"`
	Labels      map[string]string `json:"labels,omitempty"`
}

// DockerVolumeInfo 描述数据卷信息。
type DockerVolumeInfo struct {
	Name       string            `json:"name"`
	Driver     string            `json:"driver"`
	Scope      string            `json:"scope"`
	Mountpoint string            `json:"mountpoint"`
	CreatedAt  string            `json:"createdAt"`
	Labels     map[string]string `json:"labels,omitempty"`
	Size       int64             `json:"size,omitempty"`
	RefCount   int64             `json:"refCount,omitempty"`
}

// DockerNetworkInfo 描述网络信息。
type DockerNetworkInfo struct {
	ID         string            `json:"id"`
	ShortID    string            `json:"shortId"`
	Name       string            `json:"name"`
	Driver     string            `json:"driver"`
	Scope      string            `json:"scope"`
	Internal   bool              `json:"internal"`
	EnableIPv6 bool              `json:"enableIPv6"`
	Subnet     string            `json:"subnet"`
	Gateway    string            `json:"gateway"`
	Containers map[string]string `json:"containers,omitempty"` // containerID -> name/ip
	Labels     map[string]string `json:"labels,omitempty"`
}

// DockerCreateContainerReq 创建容器参数。
type DockerCreateContainerReq struct {
	Name          string            `json:"name"`
	Image         string            `json:"image"`
	Cmd           []string          `json:"cmd,omitempty"`
	Env           []string          `json:"env,omitempty"`
	Ports         []string          `json:"ports,omitempty"`   // e.g. "8080:80", "5432:5432/tcp"
	Volumes       []string          `json:"volumes,omitempty"` // e.g. "/host/data:/container/data", "vol_name:/app"
	RestartPolicy string            `json:"restartPolicy,omitempty"` // no | always | unless-stopped | on-failure
	AutoRemove    bool              `json:"autoRemove,omitempty"`
	NetworkMode   string            `json:"networkMode,omitempty"` // bridge | host | none | custom
	MemoryLimit   int64             `json:"memoryLimit,omitempty"` // MB
	CPUShares     int64             `json:"cpuShares,omitempty"`
	Labels        map[string]string `json:"labels,omitempty"`
}

// DockerPruneReport 清理结果报告。
type DockerPruneReport struct {
	ContainersDeleted []string `json:"containersDeleted"`
	ImagesDeleted     []string `json:"imagesDeleted"`
	VolumesDeleted    []string `json:"volumesDeleted"`
	NetworksDeleted   []string `json:"networksDeleted"`
	SpaceReclaimed    uint64   `json:"spaceReclaimed"`
	SpaceReclaimedStr string   `json:"spaceReclaimedStr"`
}
