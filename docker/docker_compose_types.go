package docker

// DockerComposeStackInfo 表示一个 Compose 项目（Stack）的聚合状态信息。
type DockerComposeStackInfo struct {
	UUID            string                     `json:"uuid,omitempty"` // 客户端关联的本地 UUID
	Name            string                     `json:"name"`
	Status          string                     `json:"status"` // running, partially_running, stopped
	RunningServices int                        `json:"runningServices"`
	TotalServices   int                        `json:"totalServices"`
	Services        []DockerComposeServiceInfo `json:"services"`
	ConfigFiles     string                     `json:"configFiles"`
	YamlContent     string                     `json:"yamlContent"`
	CreatedAt       string                     `json:"createdAt"`
}

// DockerComposeServiceInfo 表示 Stack 内单个服务的运行状态。
type DockerComposeServiceInfo struct {
	ServiceName   string `json:"serviceName"`
	ContainerID   string `json:"containerId"`
	ShortID       string `json:"shortId"`
	ContainerName string `json:"containerName"`
	Image         string `json:"image"`
	State         string `json:"state"` // running, exited, paused, dead
	Status        string `json:"status"`
	Ports         string `json:"ports"`
	Health        string `json:"health"`
}

// DockerComposeDeployReq 用于创建或更新 Compose 项目。
type DockerComposeDeployReq struct {
	ID          string            `json:"id,omitempty"` // 客户端生成的 UUID
	ProjectName string            `json:"projectName"`
	YamlContent string            `json:"yamlContent"`
	EnvVars     map[string]string `json:"envVars"`
	ForcePull   bool              `json:"forcePull"`
	Recreate    bool              `json:"recreate"`
}

// ComposeFileSpec 定义 docker-compose.yml 的数据结构。
type ComposeFileSpec struct {
	Version  string                        `yaml:"version"`
	Services map[string]ComposeServiceSpec `yaml:"services"`
	Networks map[string]ComposeNetworkSpec `yaml:"networks"`
	Volumes  map[string]ComposeVolumeSpec  `yaml:"volumes"`
}

// ComposeServiceSpec 定义单个服务的配置。
type ComposeServiceSpec struct {
	Image           string                  `yaml:"image"`
	ContainerName   string                  `yaml:"container_name"`
	Command         any                     `yaml:"command"`
	Entrypoint      any                     `yaml:"entrypoint"`
	Environment     any                     `yaml:"environment"`
	Ports           any                     `yaml:"ports"`
	Expose          []string                `yaml:"expose"`
	Volumes         any                     `yaml:"volumes"`
	Networks        any                     `yaml:"networks"`
	Restart         string                  `yaml:"restart"`
	DependsOn       any                     `yaml:"depends_on"`
	Labels          map[string]string       `yaml:"labels"`
	WorkingDir      string                  `yaml:"working_dir"`
	User            string                  `yaml:"user"`
	Privileged      bool                    `yaml:"privileged"`
	Hostname        string                  `yaml:"hostname"`
	NetworkMode     string                  `yaml:"network_mode"`
	DNS             any                     `yaml:"dns"`
	ExtraHosts      []string                `yaml:"extra_hosts"`
	Healthcheck     *ComposeHealthCheckSpec `yaml:"healthcheck"`
	ShmSize         any                     `yaml:"shm_size"`
	CapAdd          []string                `yaml:"cap_add"`
	CapDrop         []string                `yaml:"cap_drop"`
	Sysctls         any                     `yaml:"sysctls"`
	Logging         *ComposeLoggingSpec     `yaml:"logging"`
	StopSignal      string                  `yaml:"stop_signal"`
	StopGracePeriod any                     `yaml:"stop_grace_period"`
	Tty             bool                    `yaml:"tty"`
	StdinOpen       bool                    `yaml:"stdin_open"`
}

// ComposeHealthCheckSpec 定义服务的健康检查。
type ComposeHealthCheckSpec struct {
	Test        any    `yaml:"test"`
	Interval    string `yaml:"interval"`
	Timeout     string `yaml:"timeout"`
	Retries     int    `yaml:"retries"`
	StartPeriod string `yaml:"start_period"`
	Disable     bool   `yaml:"disable"`
}

// ComposeLoggingSpec 定义日志配置。
type ComposeLoggingSpec struct {
	Driver  string            `yaml:"driver"`
	Options map[string]string `yaml:"options"`
}

// ComposeNetworkSpec 定义网络配置。
type ComposeNetworkSpec struct {
	Driver     string            `yaml:"driver"`
	External   bool              `yaml:"external"`
	Name       string            `yaml:"name"`
	Labels     map[string]string `yaml:"labels"`
	Attachable bool              `yaml:"attachable"`
}

// ComposeVolumeSpec 定义数据卷配置。
type ComposeVolumeSpec struct {
	Driver   string            `yaml:"driver"`
	External bool              `yaml:"external"`
	Name     string            `yaml:"name"`
	Labels   map[string]string `yaml:"labels"`
}
