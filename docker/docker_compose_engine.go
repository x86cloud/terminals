package docker

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/api/types/filters"
	"github.com/docker/docker/api/types/mount"
	"github.com/docker/docker/api/types/network"
	"github.com/docker/docker/api/types/volume"
	"github.com/docker/go-connections/nat"
	"gopkg.in/yaml.v3"
)

const (
	composeProjectLabel = "com.docker.compose.project"
	composeServiceLabel = "com.docker.compose.service"
	composeVersionLabel = "com.docker.compose.version"
	composeConfigHash   = "com.docker.compose.config-hash"
	composeOneOffLabel  = "com.docker.compose.oneoff"
	composeNumberLabel  = "com.docker.compose.container-number"
	composeImageLabel   = "com.docker.compose.image"
	composeNetworkLabel = "com.docker.compose.network"
	composeVolumeLabel  = "com.docker.compose.volume"
	composeWorkingDir   = "com.docker.compose.project.working_dir"
	composeConfigFiles  = "com.docker.compose.project.config_files"
)

// ListComposeStacks 获取所有识别到的 Compose 项目。
func (d *DockerClient) ListComposeStacks(ctx context.Context) ([]DockerComposeStackInfo, error) {
	containers, err := d.cli.ContainerList(ctx, container.ListOptions{All: true})
	if err != nil {
		return nil, fmt.Errorf("读取容器列表失败: %w", err)
	}

	projectMap := make(map[string]*DockerComposeStackInfo)

	for _, c := range containers {
		project := c.Labels[composeProjectLabel]
		if project == "" {
			project = c.Labels["io.docker.compose.project"]
		}
		if project == "" {
			continue
		}

		serviceName := c.Labels[composeServiceLabel]
		if serviceName == "" {
			serviceName = c.Labels["io.docker.compose.service"]
		}
		if serviceName == "" {
			serviceName = strings.TrimPrefix(c.Names[0], "/")
		}

		shortID := c.ID
		if len(shortID) > 12 {
			shortID = shortID[:12]
		}
		cName := ""
		if len(c.Names) > 0 {
			cName = strings.TrimPrefix(c.Names[0], "/")
		}

		var portStrs []string
		for _, p := range c.Ports {
			if p.PublicPort > 0 {
				portStrs = append(portStrs, fmt.Sprintf("%d->%d/%s", p.PublicPort, p.PrivatePort, p.Type))
			} else {
				portStrs = append(portStrs, fmt.Sprintf("%d/%s", p.PrivatePort, p.Type))
			}
		}

		svcInfo := DockerComposeServiceInfo{
			ServiceName:   serviceName,
			ContainerID:   c.ID,
			ShortID:       shortID,
			ContainerName: cName,
			Image:         c.Image,
			State:         c.State,
			Status:        c.Status,
			Ports:         strings.Join(portStrs, ", "),
		}

		stack, ok := projectMap[project]
		if !ok {
			cfgFiles := c.Labels[composeConfigFiles]
			if cfgFiles == "" {
				cfgFiles = c.Labels[composeWorkingDir]
			}
			createdTime := time.Unix(c.Created, 0).Format("2006-01-02 15:04:05")

			stack = &DockerComposeStackInfo{
				Name:        project,
				ConfigFiles: cfgFiles,
				CreatedAt:   createdTime,
				Services:    []DockerComposeServiceInfo{},
			}
			projectMap[project] = stack
		}

		stack.Services = append(stack.Services, svcInfo)
	}

	var res []DockerComposeStackInfo
	for _, stack := range projectMap {
		total := len(stack.Services)
		running := 0
		for _, svc := range stack.Services {
			if svc.State == "running" {
				running++
			}
		}
		stack.TotalServices = total
		stack.RunningServices = running

		if running == total && total > 0 {
			stack.Status = "running"
		} else if running > 0 {
			stack.Status = "partially_running"
		} else {
			stack.Status = "stopped"
		}

		sort.Slice(stack.Services, func(i, j int) bool {
			return stack.Services[i].ServiceName < stack.Services[j].ServiceName
		})

		res = append(res, *stack)
	}

	sort.Slice(res, func(i, j int) bool {
		return res[i].Name < res[j].Name
	})

	return res, nil
}

// GetComposeStack 获取特定 Compose 项目的详细信息。
func (d *DockerClient) GetComposeStack(ctx context.Context, projectName string) (*DockerComposeStackInfo, error) {
	stacks, err := d.ListComposeStacks(ctx)
	if err != nil {
		return nil, err
	}
	for _, s := range stacks {
		if s.Name == projectName {
			return &s, nil
		}
	}
	return nil, fmt.Errorf("未找到项目: %s", projectName)
}

// DeployComposeStack 解析 YAML 并严格遵循官方 Docker Compose 规范编排创建/启动项目。
func (d *DockerClient) DeployComposeStack(ctx context.Context, req DockerComposeDeployReq) error {
	projectName := sanitizeProjectName(req.ProjectName)
	if projectName == "" {
		return fmt.Errorf("项目名称 (Project Name) 不能为空")
	}

	// 1. 变量插值
	interpolatedYaml := interpolateEnv(req.YamlContent, req.EnvVars)

	var spec ComposeFileSpec
	if err := yaml.Unmarshal([]byte(interpolatedYaml), &spec); err != nil {
		return fmt.Errorf("解析 Compose YAML 失败: %w", err)
	}

	if len(spec.Services) == 0 {
		return fmt.Errorf("Compose YAML 中未定义任何服务 (services)")
	}

	version := spec.Version
	if version == "" {
		version = "2.24.0"
	}

	// 2. 网络创建与解析映射
	networkMap := make(map[string]string) // networkKey -> actualNetworkID/Name

	// 默认网络
	defaultNetName := fmt.Sprintf("%s_default", projectName)
	defaultNetID, err := d.ensureNetwork(ctx, defaultNetName, "bridge", map[string]string{
		composeProjectLabel: projectName,
		composeNetworkLabel: "default",
		composeVersionLabel: version,
	})
	if err != nil {
		return fmt.Errorf("创建默认项目网络失败: %w", err)
	}
	networkMap["default"] = defaultNetID

	// 自定义网络
	for nKey, nSpec := range spec.Networks {
		if nSpec.External {
			actualName := nSpec.Name
			if actualName == "" {
				actualName = nKey
			}
			networkMap[nKey] = actualName
			continue
		}

		actualName := nSpec.Name
		if actualName == "" {
			actualName = fmt.Sprintf("%s_%s", projectName, nKey)
		}
		driver := nSpec.Driver
		if driver == "" {
			driver = "bridge"
		}
		labels := map[string]string{
			composeProjectLabel: projectName,
			composeNetworkLabel: nKey,
			composeVersionLabel: version,
		}
		for k, v := range nSpec.Labels {
			labels[k] = v
		}

		nID, err := d.ensureNetwork(ctx, actualName, driver, labels)
		if err != nil {
			return fmt.Errorf("创建网络 (%s) 失败: %w", nKey, err)
		}
		networkMap[nKey] = nID
	}

	// 3. 数据卷创建
	for vKey, vSpec := range spec.Volumes {
		if vSpec.External {
			continue
		}
		actualVolName := vSpec.Name
		if actualVolName == "" {
			actualVolName = fmt.Sprintf("%s_%s", projectName, vKey)
		}
		driver := vSpec.Driver
		if driver == "" {
			driver = "local"
		}
		labels := map[string]string{
			composeProjectLabel: projectName,
			composeVolumeLabel:  vKey,
			composeVersionLabel: version,
		}
		for k, v := range vSpec.Labels {
			labels[k] = v
		}
		_, _ = d.cli.VolumeCreate(ctx, volume.CreateOptions{
			Name:   actualVolName,
			Driver: driver,
			Labels: labels,
		})
	}

	// 4. 服务拓扑依赖排序
	sortedServices, err := sortServicesByDependencies(spec.Services)
	if err != nil {
		return fmt.Errorf("解析服务依赖关系失败: %w", err)
	}

	// 5. 按拓扑顺序创建并启动各个服务容器
	createdContainers := make(map[string]string) // serviceName -> containerID

	for _, serviceName := range sortedServices {
		svc := spec.Services[serviceName]
		if svc.Image == "" {
			return fmt.Errorf("服务 [%s] 未指定 image 镜像", serviceName)
		}

		// 检查/拉取镜像
		if req.ForcePull || !d.hasLocalImage(ctx, svc.Image) {
			_, _ = d.PullImage(ctx, svc.Image)
		}

		containerName := svc.ContainerName
		if containerName == "" {
			containerName = fmt.Sprintf("%s-%s-1", projectName, serviceName)
		}

		// 如果容器已存在，按策略停止并移除
		existingID, _ := d.findContainerByName(ctx, containerName)
		if existingID != "" {
			timeout := 5
			_ = d.cli.ContainerStop(ctx, existingID, container.StopOptions{Timeout: &timeout})
			_ = d.cli.ContainerRemove(ctx, existingID, container.RemoveOptions{Force: true})
		}

		// 解析端口配置
		portMap, exposedPorts, err := parseComposePorts(svc.Ports)
		if err != nil {
			return fmt.Errorf("服务 [%s] 端口配置错误: %w", serviceName, err)
		}
		for _, exp := range svc.Expose {
			p, err := nat.NewPort("tcp", exp)
			if err == nil {
				exposedPorts[p] = struct{}{}
			}
		}

		// 解析环境变量
		envList := parseComposeEnv(svc.Environment)

		// 解析数据卷绑定
		mounts, binds := parseComposeVolumes(projectName, svc.Volumes, spec.Volumes)

		// 命令与 Entrypoint
		var cmd []string
		if svc.Command != nil {
			cmd = parseStringSliceOrString(svc.Command)
		}
		var entrypoint []string
		if svc.Entrypoint != nil {
			entrypoint = parseStringSliceOrString(svc.Entrypoint)
		}

		// 官方标准标签
		labels := map[string]string{
			composeProjectLabel: projectName,
			composeServiceLabel: serviceName,
			composeVersionLabel: version,
			composeNumberLabel:  "1",
			composeOneOffLabel:  "False",
			composeImageLabel:   svc.Image,
			composeConfigHash:   computeServiceConfigHash(svc),
			composeConfigFiles:  "docker-compose.yml",
		}
		for k, v := range svc.Labels {
			labels[k] = v
		}

		// 健康检查
		var healthConfig *container.HealthConfig
		if svc.Healthcheck != nil && !svc.Healthcheck.Disable {
			healthConfig = parseHealthCheck(svc.Healthcheck)
		}

		// 容器配置
		containerConfig := &container.Config{
			Image:        svc.Image,
			Env:          envList,
			Cmd:          cmd,
			Entrypoint:   entrypoint,
			WorkingDir:   svc.WorkingDir,
			User:         svc.User,
			Hostname:     svc.Hostname,
			ExposedPorts: exposedPorts,
			Labels:       labels,
			Tty:          svc.Tty,
			OpenStdin:    svc.StdinOpen,
			Healthcheck:  healthConfig,
			StopSignal:   svc.StopSignal,
		}

		// 重启策略
		var restartPolicy container.RestartPolicy
		switch strings.ToLower(svc.Restart) {
		case "always":
			restartPolicy = container.RestartPolicy{Name: container.RestartPolicyAlways}
		case "unless-stopped":
			restartPolicy = container.RestartPolicy{Name: container.RestartPolicyUnlessStopped}
		case "on-failure":
			restartPolicy = container.RestartPolicy{Name: container.RestartPolicyOnFailure, MaximumRetryCount: 5}
		default:
			restartPolicy = container.RestartPolicy{Name: container.RestartPolicyDisabled}
		}

		// 日志配置
		var logConfig container.LogConfig
		if svc.Logging != nil {
			logConfig = container.LogConfig{
				Type:   svc.Logging.Driver,
				Config: svc.Logging.Options,
			}
		}

		// DNS 与 ExtraHosts
		dnsList := parseStringSliceOrString(svc.DNS)
		shmBytes := parseShmSize(svc.ShmSize)

		// 宿主机配置
		hostConfig := &container.HostConfig{
			PortBindings:  portMap,
			Binds:         binds,
			Mounts:        mounts,
			RestartPolicy: restartPolicy,
			Privileged:    svc.Privileged,
			CapAdd:        svc.CapAdd,
			CapDrop:       svc.CapDrop,
			ExtraHosts:    svc.ExtraHosts,
			DNS:           dnsList,
			ShmSize:       shmBytes,
			LogConfig:     logConfig,
			NetworkMode:   container.NetworkMode(svc.NetworkMode),
		}

		// 确定要加入的网络列表
		targetNetworks := resolveServiceNetworks(projectName, svc.Networks, networkMap)
		if len(targetNetworks) == 0 {
			targetNetworks = []serviceNetworkAttachment{
				{
					NetworkID: networkMap["default"],
					Aliases:   []string{serviceName, containerName},
				},
			}
		}

		// 首选主网络
		primaryNet := targetNetworks[0]
		networkingConfig := &network.NetworkingConfig{
			EndpointsConfig: map[string]*network.EndpointSettings{
				primaryNet.NetworkID: {
					NetworkID: primaryNet.NetworkID,
					Aliases:   primaryNet.Aliases,
					IPAddress: primaryNet.IPv4Address,
				},
			},
		}

		// 创建容器
		created, err := d.cli.ContainerCreate(ctx, containerConfig, hostConfig, networkingConfig, nil, containerName)
		if err != nil {
			return fmt.Errorf("创建容器 [%s] 失败: %w", containerName, err)
		}
		createdContainers[serviceName] = created.ID

		// 连接其余次级网络
		for i := 1; i < len(targetNetworks); i++ {
			netAttach := targetNetworks[i]
			_ = d.cli.NetworkConnect(ctx, netAttach.NetworkID, created.ID, &network.EndpointSettings{
				NetworkID: netAttach.NetworkID,
				Aliases:   netAttach.Aliases,
				IPAddress: netAttach.IPv4Address,
			})
		}

		// 检查依赖服务的健康条件
		if err := d.waitForDependencies(ctx, serviceName, svc.DependsOn, createdContainers); err != nil {
			return fmt.Errorf("服务 [%s] 等待前置依赖失败: %w", serviceName, err)
		}

		// 启动容器
		if err := d.cli.ContainerStart(ctx, created.ID, container.StartOptions{}); err != nil {
			return fmt.Errorf("启动容器 [%s] 失败: %w", containerName, err)
		}
	}

	return nil
}

// ControlComposeStack 控制 Compose 项目的生命周期（start, stop, restart, down, remove）。
func (d *DockerClient) ControlComposeStack(ctx context.Context, projectName string, action string) error {
	projectName = sanitizeProjectName(projectName)
	if projectName == "" {
		return fmt.Errorf("项目名称不能为空")
	}

	containers, err := d.cli.ContainerList(ctx, container.ListOptions{
		All: true,
		Filters: filters.NewArgs(
			filters.Arg("label", fmt.Sprintf("%s=%s", composeProjectLabel, projectName)),
		),
	})
	if err != nil {
		return fmt.Errorf("获取项目容器失败: %w", err)
	}

	switch action {
	case "start":
		for _, c := range containers {
			if c.State != "running" {
				_ = d.cli.ContainerStart(ctx, c.ID, container.StartOptions{})
			}
		}
	case "stop":
		timeout := 10
		for _, c := range containers {
			if c.State == "running" {
				_ = d.cli.ContainerStop(ctx, c.ID, container.StopOptions{Timeout: &timeout})
			}
		}
	case "restart":
		timeout := 10
		for _, c := range containers {
			_ = d.cli.ContainerRestart(ctx, c.ID, container.StopOptions{Timeout: &timeout})
		}
	case "down", "remove":
		timeout := 5
		for _, c := range containers {
			_ = d.cli.ContainerStop(ctx, c.ID, container.StopOptions{Timeout: &timeout})
			_ = d.cli.ContainerRemove(ctx, c.ID, container.RemoveOptions{Force: true})
		}

		// 清理该项目创建的非外部网络
		nets, _ := d.cli.NetworkList(ctx, network.ListOptions{
			Filters: filters.NewArgs(
				filters.Arg("label", fmt.Sprintf("%s=%s", composeProjectLabel, projectName)),
			),
		})
		for _, n := range nets {
			_ = d.cli.NetworkRemove(ctx, n.ID)
		}
	default:
		return fmt.Errorf("不支持的 Compose 操作: %s", action)
	}

	return nil
}

// GetComposeStackLogs 聚合获取项目下所有容器的运行日志。
func (d *DockerClient) GetComposeStackLogs(ctx context.Context, projectName string, tail int) (string, error) {
	if tail <= 0 {
		tail = 200
	}

	projectName = sanitizeProjectName(projectName)
	containers, err := d.cli.ContainerList(ctx, container.ListOptions{
		All: true,
		Filters: filters.NewArgs(
			filters.Arg("label", fmt.Sprintf("%s=%s", composeProjectLabel, projectName)),
		),
	})
	if err != nil {
		return "", err
	}
	if len(containers) == 0 {
		return "该项目当前没有任何容器", nil
	}

	var combinedLogs bytes.Buffer
	for _, c := range containers {
		svcName := c.Labels[composeServiceLabel]
		if svcName == "" {
			svcName = strings.TrimPrefix(c.Names[0], "/")
		}

		reader, err := d.cli.ContainerLogs(ctx, c.ID, container.LogsOptions{
			ShowStdout: true,
			ShowStderr: true,
			Tail:       strconv.Itoa(tail/len(containers) + 20),
			Timestamps: true,
		})
		if err != nil {
			continue
		}

		rawBytes, _ := io.ReadAll(reader)
		_ = reader.Close()

		lines := strings.Split(string(rawBytes), "\n")
		for _, line := range lines {
			line = strings.TrimSpace(line)
			if line == "" {
				continue
			}
			if len(line) > 8 && (line[0] == 1 || line[0] == 2) && line[1] == 0 && line[2] == 0 {
				line = line[8:]
			}
			combinedLogs.WriteString(fmt.Sprintf("[%s] %s\n", svcName, line))
		}
	}

	return combinedLogs.String(), nil
}

// ----------------- 内部核心辅助函数 -----------------

type serviceNetworkAttachment struct {
	NetworkID   string
	Aliases     []string
	IPv4Address string
}

func sanitizeProjectName(name string) string {
	name = strings.ToLower(strings.TrimSpace(name))
	re := regexp.MustCompile(`[^a-z0-9_-]`)
	return re.ReplaceAllString(name, "")
}

func computeServiceConfigHash(svc ComposeServiceSpec) string {
	b, _ := json.Marshal(svc)
	h := sha256.Sum256(b)
	return hex.EncodeToString(h[:])
}

func (d *DockerClient) ensureNetwork(ctx context.Context, netName, driver string, labels map[string]string) (string, error) {
	nets, err := d.cli.NetworkList(ctx, network.ListOptions{
		Filters: filters.NewArgs(filters.Arg("name", fmt.Sprintf("^%s$", regexp.QuoteMeta(netName)))),
	})
	if err == nil && len(nets) > 0 {
		for _, n := range nets {
			if n.Name == netName {
				return n.ID, nil
			}
		}
	}

	resp, err := d.cli.NetworkCreate(ctx, netName, network.CreateOptions{
		Driver: driver,
		Labels: labels,
	})
	if err != nil {
		return "", err
	}
	return resp.ID, nil
}

func (d *DockerClient) hasLocalImage(ctx context.Context, imageName string) bool {
	_, _, err := d.cli.ImageInspectWithRaw(ctx, imageName)
	return err == nil
}

func (d *DockerClient) findContainerByName(ctx context.Context, name string) (string, error) {
	containers, err := d.cli.ContainerList(ctx, container.ListOptions{All: true})
	if err != nil {
		return "", err
	}
	targetName := "/" + strings.TrimPrefix(name, "/")
	for _, c := range containers {
		for _, n := range c.Names {
			if n == targetName {
				return c.ID, nil
			}
		}
	}
	return "", nil
}

func (d *DockerClient) waitForDependencies(ctx context.Context, serviceName string, dependsOn any, createdContainers map[string]string) error {
	if dependsOn == nil {
		return nil
	}

	switch v := dependsOn.(type) {
	case map[string]any:
		for depName, condVal := range v {
			depCID, ok := createdContainers[depName]
			if !ok {
				continue
			}

			condition := ""
			if condMap, ok := condVal.(map[string]any); ok {
				if cStr, ok := condMap["condition"].(string); ok {
					condition = cStr
				}
			}

			if condition == "service_healthy" {
				// 轮询等待依赖容器健康
				deadline := time.Now().Add(30 * time.Second)
				for time.Now().Before(deadline) {
					insp, err := d.cli.ContainerInspect(ctx, depCID)
					if err == nil && insp.State != nil {
						if insp.State.Health != nil && insp.State.Health.Status == "healthy" {
							break
						}
					}
					time.Sleep(500 * time.Millisecond)
				}
			}
		}
	}

	return nil
}

func resolveServiceNetworks(projectName string, networks any, networkMap map[string]string) []serviceNetworkAttachment {
	var attachments []serviceNetworkAttachment
	if networks == nil {
		return attachments
	}

	switch v := networks.(type) {
	case []any:
		for _, item := range v {
			if nName, ok := item.(string); ok {
				netID := networkMap[nName]
				if netID == "" {
					netID = fmt.Sprintf("%s_%s", projectName, nName)
				}
				attachments = append(attachments, serviceNetworkAttachment{
					NetworkID: netID,
					Aliases:   []string{nName},
				})
			}
		}
	case []string:
		for _, nName := range v {
			netID := networkMap[nName]
			if netID == "" {
				netID = fmt.Sprintf("%s_%s", projectName, nName)
			}
			attachments = append(attachments, serviceNetworkAttachment{
				NetworkID: netID,
				Aliases:   []string{nName},
			})
		}
	case map[string]any:
		for nName, conf := range v {
			netID := networkMap[nName]
			if netID == "" {
				netID = fmt.Sprintf("%s_%s", projectName, nName)
			}
			var aliases []string
			var ipv4 string
			if cMap, ok := conf.(map[string]any); ok {
				if aList, ok := cMap["aliases"].([]any); ok {
					for _, a := range aList {
						if aStr, ok := a.(string); ok {
							aliases = append(aliases, aStr)
						}
					}
				}
				if ip, ok := cMap["ipv4_address"].(string); ok {
					ipv4 = ip
				}
			}
			attachments = append(attachments, serviceNetworkAttachment{
				NetworkID:   netID,
				Aliases:     aliases,
				IPv4Address: ipv4,
			})
		}
	}

	return attachments
}

func interpolateEnv(content string, envVars map[string]string) string {
	merged := make(map[string]string)
	for _, env := range os.Environ() {
		parts := strings.SplitN(env, "=", 2)
		if len(parts) == 2 {
			merged[parts[0]] = parts[1]
		}
	}
	for k, v := range envVars {
		merged[k] = v
	}

	// 匹配 ${VAR:-default} 或 ${VAR-default} 或 ${VAR}
	re := regexp.MustCompile(`\$\{([a-zA-Z_0-9]+)(?::?-([^}]+))?\}`)
	res := re.ReplaceAllStringFunc(content, func(m string) string {
		sub := re.FindStringSubmatch(m)
		if len(sub) > 1 {
			varName := sub[1]
			if val, ok := merged[varName]; ok && val != "" {
				return val
			}
			if len(sub) > 2 && sub[2] != "" {
				return sub[2]
			}
		}
		return ""
	})

	// 匹配 $VAR (无大括号)
	reSimple := regexp.MustCompile(`\$([a-zA-Z_][a-zA-Z0-9_]*)`)
	res = reSimple.ReplaceAllStringFunc(res, func(m string) string {
		varName := m[1:]
		if val, ok := merged[varName]; ok && val != "" {
			return val
		}
		return ""
	})

	return res
}

func sortServicesByDependencies(services map[string]ComposeServiceSpec) ([]string, error) {
	var result []string
	visited := make(map[string]bool)
	temp := make(map[string]bool)

	var visit func(name string) error
	visit = func(name string) error {
		if temp[name] {
			return fmt.Errorf("检测到循环依赖: %s", name)
		}
		if visited[name] {
			return nil
		}
		temp[name] = true

		svc, ok := services[name]
		if ok && svc.DependsOn != nil {
			deps := parseStringSliceOrMap(svc.DependsOn)
			for _, dep := range deps {
				if _, exists := services[dep]; exists {
					if err := visit(dep); err != nil {
						return err
					}
				}
			}
		}

		temp[name] = false
		visited[name] = true
		result = append(result, name)
		return nil
	}

	for name := range services {
		if !visited[name] {
			if err := visit(name); err != nil {
				return nil, err
			}
		}
	}

	return result, nil
}

func parseComposePorts(ports any) (nat.PortMap, nat.PortSet, error) {
	portMap := nat.PortMap{}
	exposedPorts := nat.PortSet{}
	if ports == nil {
		return portMap, exposedPorts, nil
	}

	var portStrList []string
	switch v := ports.(type) {
	case []any:
		for _, item := range v {
			if s, ok := item.(string); ok {
				portStrList = append(portStrList, s)
			} else if m, ok := item.(map[string]any); ok {
				// 长语法
				target := fmt.Sprintf("%v", m["target"])
				published := fmt.Sprintf("%v", m["published"])
				proto := "tcp"
				if p, ok := m["protocol"].(string); ok && p != "" {
					proto = p
				}
				portStrList = append(portStrList, fmt.Sprintf("%s:%s/%s", published, target, proto))
			}
		}
	case []string:
		portStrList = v
	}

	for _, p := range portStrList {
		p = strings.TrimSpace(p)
		if p == "" {
			continue
		}

		parts := strings.Split(p, ":")
		var hostIP, hostPort, containerPortStr string
		proto := "tcp"

		if len(parts) == 1 {
			containerPortStr = parts[0]
			hostPort = parts[0]
		} else if len(parts) == 2 {
			hostPort = parts[0]
			containerPortStr = parts[1]
		} else if len(parts) == 3 {
			hostIP = parts[0]
			hostPort = parts[1]
			containerPortStr = parts[2]
		}

		if strings.Contains(containerPortStr, "/") {
			cParts := strings.Split(containerPortStr, "/")
			containerPortStr = cParts[0]
			proto = cParts[1]
		}

		cPort, err := nat.NewPort(proto, containerPortStr)
		if err != nil {
			return nil, nil, err
		}

		exposedPorts[cPort] = struct{}{}
		portMap[cPort] = append(portMap[cPort], nat.PortBinding{
			HostIP:   hostIP,
			HostPort: hostPort,
		})
	}

	return portMap, exposedPorts, nil
}

func parseComposeEnv(env any) []string {
	var list []string
	if env == nil {
		return list
	}

	switch v := env.(type) {
	case []any:
		for _, item := range v {
			if s, ok := item.(string); ok && s != "" {
				list = append(list, s)
			}
		}
	case []string:
		return v
	case map[string]any:
		for k, val := range v {
			list = append(list, fmt.Sprintf("%s=%v", k, val))
		}
	case map[string]string:
		for k, val := range v {
			list = append(list, fmt.Sprintf("%s=%s", k, val))
		}
	}
	return list
}

func parseComposeVolumes(projectName string, vols any, topVolumes map[string]ComposeVolumeSpec) ([]mount.Mount, []string) {
	var mounts []mount.Mount
	var binds []string
	if vols == nil {
		return mounts, binds
	}

	var volList []string
	switch v := vols.(type) {
	case []any:
		for _, item := range v {
			if s, ok := item.(string); ok {
				volList = append(volList, s)
			} else if m, ok := item.(map[string]any); ok {
				// 长语法
				mType := fmt.Sprintf("%v", m["type"])
				source := fmt.Sprintf("%v", m["source"])
				target := fmt.Sprintf("%v", m["target"])
				readOnly := false
				if ro, ok := m["read_only"].(bool); ok {
					readOnly = ro
				}

				if mType == "volume" {
					actualVolName := source
					if topV, exists := topVolumes[source]; exists {
						if !topV.External {
							if topV.Name != "" {
								actualVolName = topV.Name
							} else {
								actualVolName = fmt.Sprintf("%s_%s", projectName, source)
							}
						}
					} else {
						actualVolName = fmt.Sprintf("%s_%s", projectName, source)
					}
					mounts = append(mounts, mount.Mount{
						Type:     mount.TypeVolume,
						Source:   actualVolName,
						Target:   target,
						ReadOnly: readOnly,
					})
				} else {
					mounts = append(mounts, mount.Mount{
						Type:     mount.TypeBind,
						Source:   source,
						Target:   target,
						ReadOnly: readOnly,
					})
				}
			}
		}
	case []string:
		volList = v
	}

	for _, v := range volList {
		v = strings.TrimSpace(v)
		if v == "" {
			continue
		}

		parts := strings.Split(v, ":")
		if len(parts) >= 2 {
			source := parts[0]
			target := parts[1]
			ro := false
			if len(parts) >= 3 && strings.Contains(parts[2], "ro") {
				ro = true
			}

			// 如果是具名数据卷 (非路径 / 或 . 开头)
			if !strings.HasPrefix(source, "/") && !strings.HasPrefix(source, "./") && !strings.HasPrefix(source, "~") && !strings.Contains(source, "\\") {
				actualVolName := source
				if topV, exists := topVolumes[source]; exists {
					if !topV.External {
						if topV.Name != "" {
							actualVolName = topV.Name
						} else {
							actualVolName = fmt.Sprintf("%s_%s", projectName, source)
						}
					}
				} else {
					actualVolName = fmt.Sprintf("%s_%s", projectName, source)
				}

				mounts = append(mounts, mount.Mount{
					Type:     mount.TypeVolume,
					Source:   actualVolName,
					Target:   target,
					ReadOnly: ro,
				})
			} else {
				binds = append(binds, v)
			}
		}
	}

	return mounts, binds
}

func parseHealthCheck(spec *ComposeHealthCheckSpec) *container.HealthConfig {
	if spec == nil {
		return nil
	}

	var test []string
	if spec.Test != nil {
		test = parseStringSliceOrString(spec.Test)
	}

	interval, _ := time.ParseDuration(spec.Interval)
	timeout, _ := time.ParseDuration(spec.Timeout)
	startPeriod, _ := time.ParseDuration(spec.StartPeriod)

	return &container.HealthConfig{
		Test:        test,
		Interval:    interval,
		Timeout:     timeout,
		Retries:     spec.Retries,
		StartPeriod: startPeriod,
	}
}

func parseShmSize(val any) int64 {
	if val == nil {
		return 0
	}
	switch v := val.(type) {
	case int:
		return int64(v)
	case int64:
		return v
	case float64:
		return int64(v)
	case string:
		v = strings.ToLower(strings.TrimSpace(v))
		if strings.HasSuffix(v, "g") || strings.HasSuffix(v, "gb") {
			num, _ := strconv.ParseInt(strings.TrimRight(v, "gb"), 10, 64)
			return num * 1024 * 1024 * 1024
		}
		if strings.HasSuffix(v, "m") || strings.HasSuffix(v, "mb") {
			num, _ := strconv.ParseInt(strings.TrimRight(v, "mb"), 10, 64)
			return num * 1024 * 1024
		}
		if strings.HasSuffix(v, "k") || strings.HasSuffix(v, "kb") {
			num, _ := strconv.ParseInt(strings.TrimRight(v, "kb"), 10, 64)
			return num * 1024
		}
		num, _ := strconv.ParseInt(v, 10, 64)
		return num
	}
	return 0
}

func parseStringSliceOrString(input any) []string {
	if input == nil {
		return nil
	}
	switch v := input.(type) {
	case string:
		return strings.Fields(v)
	case []any:
		var list []string
		for _, item := range v {
			if s, ok := item.(string); ok {
				list = append(list, s)
			}
		}
		return list
	case []string:
		return v
	}
	return nil
}

func parseStringSliceOrMap(input any) []string {
	if input == nil {
		return nil
	}
	switch v := input.(type) {
	case []any:
		var list []string
		for _, item := range v {
			if s, ok := item.(string); ok {
				list = append(list, s)
			}
		}
		return list
	case []string:
		return v
	case map[string]any:
		var list []string
		for k := range v {
			list = append(list, k)
		}
		return list
	}
	return nil
}
