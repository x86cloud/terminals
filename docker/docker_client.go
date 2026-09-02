package docker

import (
	"bytes"
	"context"
	"crypto/tls"
	"crypto/x509"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/api/types/filters"
	"github.com/docker/docker/api/types/image"
	"github.com/docker/docker/api/types/network"
	"github.com/docker/docker/api/types/volume"
	"github.com/docker/docker/client"
	"github.com/docker/docker/pkg/stdcopy"
	"golang.org/x/crypto/ssh"
	"terminal/core"
)

// DockerClient 封装基于 Docker 官方 SDK 的客户端实例及底层连接。
type DockerClient struct {
	cfg        core.ServerConfig
	cli        *client.Client
	sshConn    *ssh.Client
	mu         sync.RWMutex
	closed     bool
	targetInfo string
}

// NewDockerClient 根据 ServerConfig 初始化 Docker 官方 SDK 客户端。
func NewDockerClient(cfg core.ServerConfig) (*DockerClient, error) {
	d := &DockerClient{
		cfg: cfg,
	}

	endpointType := strings.ToLower(strings.TrimSpace(cfg.DockerEndpointType))
	if endpointType == "" {
		if cfg.DockerSocketPath != "" {
			endpointType = "unix"
		} else if cfg.DockerSSHHost != "" {
			endpointType = "ssh"
		} else if cfg.Host != "" {
			endpointType = "tcp"
		} else {
			endpointType = "unix"
		}
	}

	var opts []client.Opt
	opts = append(opts, client.WithAPIVersionNegotiation())

	switch endpointType {
	case "unix":
		socketPath := strings.TrimSpace(cfg.DockerSocketPath)
		if socketPath == "" {
			if runtime.GOOS == "windows" {
				socketPath = "//./pipe/docker_engine"
			} else {
				socketPath = "/var/run/docker.sock"
			}
		}

		var hostURL string
		if runtime.GOOS == "windows" && strings.HasPrefix(socketPath, "//./pipe/") {
			hostURL = "npipe://" + socketPath
		} else {
			if !strings.HasPrefix(socketPath, "unix://") {
				hostURL = "unix://" + socketPath
			} else {
				hostURL = socketPath
			}
		}
		opts = append(opts, client.WithHost(hostURL))
		d.targetInfo = socketPath

	case "tcp", "http", "https":
		host := strings.TrimSpace(cfg.Host)
		if host == "" {
			host = "127.0.0.1"
		}
		port := cfg.Port
		if port <= 0 {
			if cfg.DockerTLSEnabled {
				port = 2376
			} else {
				port = 2375
			}
		}
		tcpAddr := fmt.Sprintf("tcp://%s:%d", host, port)
		opts = append(opts, client.WithHost(tcpAddr))
		d.targetInfo = fmt.Sprintf("%s:%d", host, port)

		if cfg.DockerTLSEnabled {
			tlsConfig, err := buildTLSConfig(cfg)
			if err != nil {
				return nil, fmt.Errorf("构建 TLS 配置失败: %w", err)
			}
			httpClient := &http.Client{
				Transport: &http.Transport{
					TLSClientConfig: tlsConfig,
				},
				Timeout: 30 * time.Second,
			}
			opts = append(opts, client.WithHTTPClient(httpClient))
		}

	case "ssh":
		sshHost := strings.TrimSpace(cfg.DockerSSHHost)
		if sshHost == "" {
			sshHost = cfg.Host
		}
		sshPort := cfg.DockerSSHPort
		if sshPort <= 0 {
			sshPort = 22
		}
		sshUser := strings.TrimSpace(cfg.DockerSSHUser)
		if sshUser == "" {
			sshUser = cfg.Username
		}
		if sshUser == "" {
			sshUser = "root"
		}

		authMethods, err := buildSSHAuth(cfg)
		if err != nil {
			return nil, fmt.Errorf("SSH 认证配置错误: %w", err)
		}

		sshConfig := &ssh.ClientConfig{
			User:            sshUser,
			Auth:            authMethods,
			HostKeyCallback: ssh.InsecureIgnoreHostKey(),
			Timeout:         15 * time.Second,
		}

		sshTarget := fmt.Sprintf("%s:%d", sshHost, sshPort)
		sshClient, err := ssh.Dial("tcp", sshTarget, sshConfig)
		if err != nil {
			return nil, fmt.Errorf("SSH 连接失败 (%s): %w", sshTarget, err)
		}
		d.sshConn = sshClient

		remoteSocket := strings.TrimSpace(cfg.DockerSocketPath)
		if remoteSocket == "" {
			remoteSocket = "/var/run/docker.sock"
		}

		opts = append(opts,
			client.WithHost("http://docker"),
			client.WithDialContext(func(ctx context.Context, network, addr string) (net.Conn, error) {
				return dialRemoteDocker(sshClient, remoteSocket)
			}),
		)
		d.targetInfo = fmt.Sprintf("ssh://%s@%s:%d -> %s", sshUser, sshHost, sshPort, remoteSocket)

	default:
		return nil, fmt.Errorf("不支持的 Docker 端点类型: %s", endpointType)
	}

	cli, err := client.NewClientWithOpts(opts...)
	if err != nil {
		if d.sshConn != nil {
			_ = d.sshConn.Close()
		}
		return nil, fmt.Errorf("初始化 Docker 客户端失败: %w", err)
	}

	d.cli = cli

	// 快速测试 Ping
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()
	_, err = cli.Ping(ctx)
	if err != nil {
		d.Close()
		return nil, fmt.Errorf("Docker Ping 失败: %w", err)
	}

	return d, nil
}

func buildTLSConfig(cfg core.ServerConfig) (*tls.Config, error) {
	tlsConfig := &tls.Config{
		InsecureSkipVerify: cfg.DockerTLSInsecure,
	}

	if cfg.DockerTLSCACert != "" {
		caData, err := loadPEMOrFile(cfg.DockerTLSCACert)
		if err != nil {
			return nil, fmt.Errorf("读取 CA 证书失败: %w", err)
		}
		pool := x509.NewCertPool()
		if !pool.AppendCertsFromPEM(caData) {
			return nil, fmt.Errorf("解析 CA 证书失败")
		}
		tlsConfig.RootCAs = pool
	}

	if cfg.DockerTLSClientCert != "" && cfg.DockerTLSClientKey != "" {
		certData, err := loadPEMOrFile(cfg.DockerTLSClientCert)
		if err != nil {
			return nil, fmt.Errorf("读取客户端证书失败: %w", err)
		}
		keyData, err := loadPEMOrFile(cfg.DockerTLSClientKey)
		if err != nil {
			return nil, fmt.Errorf("读取客户端私钥失败: %w", err)
		}
		cert, err := tls.X509KeyPair(certData, keyData)
		if err != nil {
			return nil, fmt.Errorf("加载客户端证书密钥对失败: %w", err)
		}
		tlsConfig.Certificates = []tls.Certificate{cert}
	}

	return tlsConfig, nil
}

func loadPEMOrFile(str string) ([]byte, error) {
	str = strings.TrimSpace(str)
	if strings.Contains(str, "-----BEGIN") {
		return []byte(str), nil
	}
	return os.ReadFile(str)
}

func buildSSHAuth(cfg core.ServerConfig) ([]ssh.AuthMethod, error) {
	authType := cfg.DockerSSHAuthType
	if authType == "" {
		authType = cfg.AuthType
	}
	if authType == "" {
		authType = "password"
	}

	var methods []ssh.AuthMethod
	if authType == "key" {
		var keyData []byte
		if cfg.DockerSSHKeyData != "" {
			keyData = []byte(cfg.DockerSSHKeyData)
		} else if cfg.DockerSSHKeyPath != "" {
			d, err := os.ReadFile(cfg.DockerSSHKeyPath)
			if err != nil {
				return nil, err
			}
			keyData = d
		} else if cfg.PrivateKey != "" {
			d, err := loadPEMOrFile(cfg.PrivateKey)
			if err != nil {
				return nil, err
			}
			keyData = d
		}

		passphrase := cfg.DockerSSHPassphrase
		if passphrase == "" {
			passphrase = cfg.Passphrase
		}

		var signer ssh.Signer
		var err error
		if passphrase != "" {
			signer, err = ssh.ParsePrivateKeyWithPassphrase(keyData, []byte(passphrase))
		} else {
			signer, err = ssh.ParsePrivateKey(keyData)
		}
		if err != nil {
			return nil, fmt.Errorf("解析 SSH 私钥失败: %w", err)
		}
		methods = append(methods, ssh.PublicKeys(signer))
	} else {
		pass := cfg.DockerSSHPassword
		if pass == "" {
			pass = cfg.Password
		}
		methods = append(methods, ssh.Password(pass))
	}

	return methods, nil
}

// Close 释放 Docker 客户端及底层 SSH 隧道。
func (d *DockerClient) Close() error {
	d.mu.Lock()
	defer d.mu.Unlock()
	if d.closed {
		return nil
	}
	d.closed = true
	if d.cli != nil {
		_ = d.cli.Close()
		d.cli = nil
	}
	if d.sshConn != nil {
		_ = d.sshConn.Close()
		d.sshConn = nil
	}
	return nil
}

// Ping 测试连通性。
func (d *DockerClient) Ping(ctx context.Context) (string, error) {
	p, err := d.cli.Ping(ctx)
	if err != nil {
		return "", err
	}
	return p.APIVersion, nil
}

// GetOverview 获取系统概览。
func (d *DockerClient) GetOverview(ctx context.Context) (*DockerOverview, error) {
	info, err := d.cli.Info(ctx)
	if err != nil {
		return nil, fmt.Errorf("获取 Docker 守护进程信息失败: %w", err)
	}
	version, err := d.cli.ServerVersion(ctx)
	if err != nil {
		return nil, fmt.Errorf("获取 Docker 版本失败: %w", err)
	}

	vList, _ := d.cli.VolumeList(ctx, volume.ListOptions{})
	nList, _ := d.cli.NetworkList(ctx, network.ListOptions{})
	stacks, _ := d.ListComposeStacks(ctx)

	epType := d.cfg.DockerEndpointType
	if epType == "" {
		epType = "unix"
	}

	return &DockerOverview{
		Connected:         true,
		ServerVersion:     version.Version,
		APIVersion:        version.APIVersion,
		OS:                version.Os,
		Arch:              version.Arch,
		KernelVersion:     version.KernelVersion,
		OperatingSystem:   info.OperatingSystem,
		NCPU:              info.NCPU,
		MemTotal:          info.MemTotal,
		ContainersTotal:   info.Containers,
		ContainersRunning: info.ContainersRunning,
		ContainersPaused:  info.ContainersPaused,
		ContainersStopped: info.ContainersStopped,
		ImagesTotal:       info.Images,
		ComposeTotal:      len(stacks),
		VolumesTotal:      len(vList.Volumes),
		NetworksTotal:     len(nList),
		DockerRootDir:     info.DockerRootDir,
		StorageDriver:     info.Driver,
		EndpointType:      epType,
		EndpointTarget:    d.targetInfo,
	}, nil
}

// ListContainers 获取容器列表。
func (d *DockerClient) ListContainers(ctx context.Context, all bool) ([]DockerContainerInfo, error) {
	containers, err := d.cli.ContainerList(ctx, container.ListOptions{All: all})
	if err != nil {
		return nil, err
	}

	var res []DockerContainerInfo
	for _, c := range containers {
		shortID := c.ID
		if len(shortID) > 12 {
			shortID = shortID[:12]
		}
		var cleanNames []string
		for _, n := range c.Names {
			cleanNames = append(cleanNames, strings.TrimPrefix(n, "/"))
		}
		name := ""
		if len(cleanNames) > 0 {
			name = cleanNames[0]
		}

		var ports []DockerPortMapping
		var portStrs []string
		for _, p := range c.Ports {
			ports = append(ports, DockerPortMapping{
				IP:          p.IP,
				PrivatePort: p.PrivatePort,
				PublicPort:  p.PublicPort,
				Type:        p.Type,
			})
			if p.PublicPort > 0 {
				portStrs = append(portStrs, fmt.Sprintf("%d->%d/%s", p.PublicPort, p.PrivatePort, p.Type))
			} else {
				portStrs = append(portStrs, fmt.Sprintf("%d/%s", p.PrivatePort, p.Type))
			}
		}

		var ip string
		if c.NetworkSettings != nil && len(c.NetworkSettings.Networks) > 0 {
			for _, netConfig := range c.NetworkSettings.Networks {
				if netConfig.IPAddress != "" {
					ip = netConfig.IPAddress
					break
				}
			}
		}

		res = append(res, DockerContainerInfo{
			ID:         c.ID,
			ShortID:    shortID,
			Names:      cleanNames,
			Name:       name,
			Image:      c.Image,
			ImageID:    c.ImageID,
			Command:    c.Command,
			Created:    c.Created,
			State:      c.State,
			Status:     c.Status,
			Ports:      ports,
			PortStr:    strings.Join(portStrs, ", "),
			IPAddress:  ip,
			SizeRw:     c.SizeRw,
			SizeRootFs: c.SizeRootFs,
			Labels:     c.Labels,
		})
	}
	return res, nil
}

// StartContainer 启动容器。
func (d *DockerClient) StartContainer(ctx context.Context, id string) error {
	return d.cli.ContainerStart(ctx, id, container.StartOptions{})
}

// StopContainer 停止容器。
func (d *DockerClient) StopContainer(ctx context.Context, id string) error {
	timeout := 10
	return d.cli.ContainerStop(ctx, id, container.StopOptions{Timeout: &timeout})
}

// RestartContainer 重启容器。
func (d *DockerClient) RestartContainer(ctx context.Context, id string) error {
	timeout := 10
	return d.cli.ContainerRestart(ctx, id, container.StopOptions{Timeout: &timeout})
}

// PauseContainer 暂停容器。
func (d *DockerClient) PauseContainer(ctx context.Context, id string) error {
	return d.cli.ContainerPause(ctx, id)
}

// UnpauseContainer 恢复容器。
func (d *DockerClient) UnpauseContainer(ctx context.Context, id string) error {
	return d.cli.ContainerUnpause(ctx, id)
}

// RemoveContainer 删除容器。
func (d *DockerClient) RemoveContainer(ctx context.Context, id string, force bool) error {
	return d.cli.ContainerRemove(ctx, id, container.RemoveOptions{Force: force, RemoveVolumes: true})
}

// InspectContainer 查看容器 JSON 详情。
func (d *DockerClient) InspectContainer(ctx context.Context, id string) (string, error) {
	inspect, err := d.cli.ContainerInspect(ctx, id)
	if err != nil {
		return "", err
	}
	bytes, err := json.MarshalIndent(inspect, "", "  ")
	if err != nil {
		return "", err
	}
	return string(bytes), nil
}

// GetContainerLogs 获取容器日志。
func (d *DockerClient) GetContainerLogs(ctx context.Context, id string, tail int, timestamps bool) (string, error) {
	tailStr := "all"
	if tail > 0 {
		tailStr = strconv.Itoa(tail)
	}

	reader, err := d.cli.ContainerLogs(ctx, id, container.LogsOptions{
		ShowStdout: true,
		ShowStderr: true,
		Tail:       tailStr,
		Timestamps: timestamps,
	})
	if err != nil {
		return "", err
	}
	defer reader.Close()

	buf := new(bytes.Buffer)
	// Docker 头部格式为 8 字节 header，简易过滤控制头保证阅读纯净
	raw, err := io.ReadAll(reader)
	if err != nil {
		return "", err
	}

	// 剥离 docker stdcopy header (8 字节前缀)
	offset := 0
	for offset < len(raw) {
		if offset+8 <= len(raw) {
			size := int(raw[offset+4])<<24 | int(raw[offset+5])<<16 | int(raw[offset+6])<<8 | int(raw[offset+7])
			offset += 8
			if size > 0 && offset+size <= len(raw) {
				buf.Write(raw[offset : offset+size])
				offset += size
				continue
			}
		}
		buf.Write(raw[offset:])
		break
	}

	return buf.String(), nil
}

// CreateContainer 创建容器。
func (d *DockerClient) CreateContainer(ctx context.Context, req DockerCreateContainerReq) (string, error) {
	cConfig := &container.Config{
		Image:  req.Image,
		Cmd:    req.Cmd,
		Env:    req.Env,
		Labels: req.Labels,
	}

	hostConfig := &container.HostConfig{
		AutoRemove: req.AutoRemove,
	}

	if req.RestartPolicy != "" {
		hostConfig.RestartPolicy = container.RestartPolicy{
			Name: container.RestartPolicyMode(req.RestartPolicy),
		}
	}

	if req.MemoryLimit > 0 {
		hostConfig.Memory = req.MemoryLimit * 1024 * 1024
	}
	if req.CPUShares > 0 {
		hostConfig.CPUShares = req.CPUShares
	}

	if req.NetworkMode != "" {
		hostConfig.NetworkMode = container.NetworkMode(req.NetworkMode)
	}

	if len(req.Volumes) > 0 {
		hostConfig.Binds = req.Volumes
	}

	resp, err := d.cli.ContainerCreate(ctx, cConfig, hostConfig, nil, nil, req.Name)
	if err != nil {
		return "", err
	}
	return resp.ID, nil
}

// ListImages 获取镜像列表。
func (d *DockerClient) ListImages(ctx context.Context) ([]DockerImageInfo, error) {
	images, err := d.cli.ImageList(ctx, image.ListOptions{All: true})
	if err != nil {
		return nil, err
	}

	var res []DockerImageInfo
	for _, img := range images {
		shortID := strings.TrimPrefix(img.ID, "sha256:")
		if len(shortID) > 12 {
			shortID = shortID[:12]
		}

		repo := "<none>"
		tag := "<none>"
		if len(img.RepoTags) > 0 && img.RepoTags[0] != "<none>:<none>" {
			parts := strings.Split(img.RepoTags[0], ":")
			if len(parts) >= 2 {
				repo = strings.Join(parts[:len(parts)-1], ":")
				tag = parts[len(parts)-1]
			} else {
				repo = img.RepoTags[0]
			}
		}

		res = append(res, DockerImageInfo{
			ID:         img.ID,
			ShortID:    shortID,
			RepoTags:   img.RepoTags,
			Repository: repo,
			Tag:        tag,
			Size:       img.Size,
			SizeStr:    formatBytes(img.Size),
			Created:    img.Created,
			Containers: img.Containers,
			Labels:     img.Labels,
		})
	}
	return res, nil
}

// InspectImage 查看镜像详情。
func (d *DockerClient) InspectImage(ctx context.Context, id string) (string, error) {
	inspect, _, err := d.cli.ImageInspectWithRaw(ctx, id)
	if err != nil {
		return "", err
	}
	bytes, err := json.MarshalIndent(inspect, "", "  ")
	if err != nil {
		return "", err
	}
	return string(bytes), nil
}

// PullImage 拉取镜像。
func (d *DockerClient) PullImage(ctx context.Context, imageName string) (string, error) {
	reader, err := d.cli.ImagePull(ctx, imageName, image.PullOptions{})
	if err != nil {
		return "", err
	}
	defer reader.Close()

	buf := new(bytes.Buffer)
	dec := json.NewDecoder(reader)
	for dec.More() {
		var msg struct {
			Status   string `json:"status"`
			Progress string `json:"progress"`
			ID       string `json:"id"`
			Error    string `json:"error"`
		}
		if err := dec.Decode(&msg); err != nil {
			break
		}
		if msg.Error != "" {
			return buf.String(), fmt.Errorf("拉取失败: %s", msg.Error)
		}
		line := msg.Status
		if msg.ID != "" {
			line = fmt.Sprintf("[%s] %s %s", msg.ID, msg.Status, msg.Progress)
		}
		buf.WriteString(line + "\n")
	}
	return buf.String(), nil
}

// RemoveImage 删除镜像。
func (d *DockerClient) RemoveImage(ctx context.Context, id string, force bool) error {
	_, err := d.cli.ImageRemove(ctx, id, image.RemoveOptions{Force: force, PruneChildren: true})
	return err
}

// ListVolumes 获取数据卷列表。
func (d *DockerClient) ListVolumes(ctx context.Context) ([]DockerVolumeInfo, error) {
	volResp, err := d.cli.VolumeList(ctx, volume.ListOptions{})
	if err != nil {
		return nil, err
	}

	var res []DockerVolumeInfo
	for _, v := range volResp.Volumes {
		var size int64 = 0
		var refCount int64 = 0
		if v.UsageData != nil {
			size = v.UsageData.Size
			refCount = v.UsageData.RefCount
		}
		res = append(res, DockerVolumeInfo{
			Name:       v.Name,
			Driver:     v.Driver,
			Scope:      v.Scope,
			Mountpoint: v.Mountpoint,
			CreatedAt:  v.CreatedAt,
			Labels:     v.Labels,
			Size:       size,
			RefCount:   refCount,
		})
	}
	return res, nil
}

// CreateVolume 创建数据卷。
func (d *DockerClient) CreateVolume(ctx context.Context, name, driver string, labels map[string]string) (*DockerVolumeInfo, error) {
	v, err := d.cli.VolumeCreate(ctx, volume.CreateOptions{
		Name:   name,
		Driver: driver,
		Labels: labels,
	})
	if err != nil {
		return nil, err
	}
	return &DockerVolumeInfo{
		Name:       v.Name,
		Driver:     v.Driver,
		Scope:      v.Scope,
		Mountpoint: v.Mountpoint,
		CreatedAt:  v.CreatedAt,
		Labels:     v.Labels,
	}, nil
}

// RemoveVolume 删除数据卷。
func (d *DockerClient) RemoveVolume(ctx context.Context, name string, force bool) error {
	return d.cli.VolumeRemove(ctx, name, force)
}

// ListNetworks 获取网络列表。
func (d *DockerClient) ListNetworks(ctx context.Context) ([]DockerNetworkInfo, error) {
	nets, err := d.cli.NetworkList(ctx, network.ListOptions{})
	if err != nil {
		return nil, err
	}

	var res []DockerNetworkInfo
	for _, n := range nets {
		shortID := n.ID
		if len(shortID) > 12 {
			shortID = shortID[:12]
		}
		var subnet, gateway string
		if len(n.IPAM.Config) > 0 {
			subnet = n.IPAM.Config[0].Subnet
			gateway = n.IPAM.Config[0].Gateway
		}

		cMap := make(map[string]string)
		for cID, cEndpoint := range n.Containers {
			cMap[cID] = fmt.Sprintf("%s (%s)", cEndpoint.Name, cEndpoint.IPv4Address)
		}

		res = append(res, DockerNetworkInfo{
			ID:         n.ID,
			ShortID:    shortID,
			Name:       n.Name,
			Driver:     n.Driver,
			Scope:      n.Scope,
			Internal:   n.Internal,
			EnableIPv6: n.EnableIPv6,
			Subnet:     subnet,
			Gateway:    gateway,
			Containers: cMap,
			Labels:     n.Labels,
		})
	}
	return res, nil
}

// CreateNetwork 创建网络。
func (d *DockerClient) CreateNetwork(ctx context.Context, name, driver string) (string, error) {
	resp, err := d.cli.NetworkCreate(ctx, name, network.CreateOptions{
		Driver: driver,
	})
	if err != nil {
		return "", err
	}
	return resp.ID, nil
}

// RemoveNetwork 删除网络。
func (d *DockerClient) RemoveNetwork(ctx context.Context, id string) error {
	return d.cli.NetworkRemove(ctx, id)
}

// SystemPrune 执行清理操作。
func (d *DockerClient) SystemPrune(ctx context.Context, pruneContainers, pruneImages, pruneVolumes, pruneNetworks bool) (*DockerPruneReport, error) {
	report := &DockerPruneReport{}

	if pruneContainers {
		cReport, err := d.cli.ContainersPrune(ctx, filters.Args{})
		if err == nil {
			report.ContainersDeleted = cReport.ContainersDeleted
			report.SpaceReclaimed += cReport.SpaceReclaimed
		}
	}

	if pruneImages {
		iReport, err := d.cli.ImagesPrune(ctx, filters.Args{})
		if err == nil {
			for _, item := range iReport.ImagesDeleted {
				if item.Deleted != "" {
					report.ImagesDeleted = append(report.ImagesDeleted, item.Deleted)
				} else if item.Untagged != "" {
					report.ImagesDeleted = append(report.ImagesDeleted, item.Untagged)
				}
			}
			report.SpaceReclaimed += iReport.SpaceReclaimed
		}
	}

	if pruneVolumes {
		vReport, err := d.cli.VolumesPrune(ctx, filters.Args{})
		if err == nil {
			report.VolumesDeleted = vReport.VolumesDeleted
			report.SpaceReclaimed += vReport.SpaceReclaimed
		}
	}

	if pruneNetworks {
		nReport, err := d.cli.NetworksPrune(ctx, filters.Args{})
		if err == nil {
			report.NetworksDeleted = nReport.NetworksDeleted
		}
	}

	report.SpaceReclaimedStr = formatBytes(int64(report.SpaceReclaimed))
	return report, nil
}

func formatBytes(b int64) string {
	const unit = 1024
	if b < unit {
		return fmt.Sprintf("%d B", b)
	}
	div, exp := int64(unit), 0
	for n := b / unit; n >= unit; n /= unit {
		div *= unit
		exp++
	}
	return fmt.Sprintf("%.2f %cB", float64(b)/float64(div), "KMGTPE"[exp])
}

type sshCommandConn struct {
	session *ssh.Session
	stdin   io.WriteCloser
	stdout  io.Reader
}

func (c *sshCommandConn) Read(b []byte) (int, error)  { return c.stdout.Read(b) }
func (c *sshCommandConn) Write(b []byte) (int, error) { return c.stdin.Write(b) }
func (c *sshCommandConn) Close() error {
	_ = c.stdin.Close()
	return c.session.Close()
}
func (c *sshCommandConn) LocalAddr() net.Addr                { return &net.IPAddr{} }
func (c *sshCommandConn) RemoteAddr() net.Addr               { return &net.IPAddr{} }
func (c *sshCommandConn) SetDeadline(t time.Time) error      { return nil }
func (c *sshCommandConn) SetReadDeadline(t time.Time) error  { return nil }
func (c *sshCommandConn) SetWriteDeadline(t time.Time) error { return nil }

func dialRemoteDocker(sshClient *ssh.Client, remoteSocket string) (net.Conn, error) {
	// 1. 尝试使用 direct-streamlocal 建立 Unix Socket 连接 (最快速高效)
	conn, err := sshClient.Dial("unix", remoteSocket)
	if err == nil {
		return conn, nil
	}

	// 2. 回退到通过 SSH 管道执行 docker system dial-stdio (官方标准 SSH 隧道)
	sess, sessErr := sshClient.NewSession()
	if sessErr == nil {
		stdin, inErr := sess.StdinPipe()
		stdout, outErr := sess.StdoutPipe()
		if inErr == nil && outErr == nil {
			cmd := "docker system dial-stdio"
			if err := sess.Start(cmd); err == nil {
				return &sshCommandConn{
					session: sess,
					stdin:   stdin,
					stdout:  stdout,
				}, nil
			}
			_ = sess.Close()
		} else {
			_ = sess.Close()
		}
	}

	// 3. 回退到 nc -U
	sess, sessErr = sshClient.NewSession()
	if sessErr == nil {
		stdin, inErr := sess.StdinPipe()
		stdout, outErr := sess.StdoutPipe()
		if inErr == nil && outErr == nil {
			cmd := fmt.Sprintf("nc -U %s", remoteSocket)
			if err := sess.Start(cmd); err == nil {
				return &sshCommandConn{
					session: sess,
					stdin:   stdin,
					stdout:  stdout,
				}, nil
			}
			_ = sess.Close()
		} else {
			_ = sess.Close()
		}
	}

	return nil, fmt.Errorf("无法连接远程 Docker Socket (streamlocal 错误: %w)", err)
}

type streamChunkWriter struct {
	onChunk func(chunk string)
}

func (w *streamChunkWriter) Write(p []byte) (n int, err error) {
	if len(p) > 0 && w.onChunk != nil {
		w.onChunk(string(p))
	}
	return len(p), nil
}

// ExecStream 在指定容器内部执行命令并实时流式回调输出，返回 (exitCode, error)。
func (d *DockerClient) ExecStream(ctx context.Context, containerID string, cmd []string, workingDir, user string, onChunk func(chunk string)) (int, error) {
	d.mu.RLock()
	defer d.mu.RUnlock()
	if d.closed || d.cli == nil {
		return -1, errors.New("Docker 客户端已关闭")
	}

	execConfig := container.ExecOptions{
		AttachStdout: true,
		AttachStderr: true,
		Cmd:          cmd,
		WorkingDir:   workingDir,
		User:         user,
		Tty:          false,
	}

	execCreateResp, err := d.cli.ContainerExecCreate(ctx, containerID, execConfig)
	if err != nil {
		return -1, fmt.Errorf("创建容器 Exec 任务失败: %w", err)
	}

	attachResp, err := d.cli.ContainerExecAttach(ctx, execCreateResp.ID, container.ExecAttachOptions{
		Tty: false,
	})
	if err != nil {
		return -1, fmt.Errorf("附加容器 Exec 输出流失败: %w", err)
	}
	defer attachResp.Close()

	writer := &streamChunkWriter{onChunk: onChunk}
	_, _ = stdcopy.StdCopy(writer, writer, attachResp.Reader)

	inspectResp, err := d.cli.ContainerExecInspect(ctx, execCreateResp.ID)
	if err != nil {
		return 0, nil
	}
	return inspectResp.ExitCode, nil
}
