package tools

import (
	"context"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
	"terminal/agent/events"
	"terminal/agent/guard"
	"terminal/docker"

	"github.com/cloudwego/eino/adk/filesystem"
	"github.com/cloudwego/eino/components/tool/utils"
)

type DockerExecuteInput struct {
	ServerID string `json:"server_id" jsonschema:"description=Docker 实例连接 ID 或名称，若当前仅有一个连接可留空"`
	Command  string `json:"command" jsonschema:"description=要执行的 Docker 命令行指令，例如: docker ps -a、docker logs -n 50 <容器名/ID>、docker inspect <容器名>、docker start/stop/restart <容器名>、docker images、docker info、docker compose ls"`
}

type DockerExecInput struct {
	ServerID    string `json:"server_id,omitempty" jsonschema:"description=Docker 实例连接 ID 或名称，若当前仅有一个连接可留空"`
	ContainerID string `json:"container_id,omitempty" jsonschema:"description=目标容器的 ID 或名称，例如: my-nginx。若在 command 中已包含容器名可留空"`
	Command     string `json:"command" jsonschema:"description=要在容器内执行的命令或脚本（例如: 'ls -la /app' 或 'cat /etc/hosts'），也支持直接传入完整 CLI 如 'docker exec -it web ps'"`
	WorkingDir  string `json:"working_dir,omitempty" jsonschema:"description=容器内可选工作目录"`
	User        string `json:"user,omitempty" jsonschema:"description=容器内可选执行用户"`
}

func RegisterDockerTools(bus *ToolBus, mgr *docker.DockerManager) error {
	if mgr == nil {
		return nil
	}

	// 1. docker_list_connections
	listConnsTool, err := utils.InferTool("docker_list_connections", "列出当前所有已建立连接的 Docker 实例与通信端点信息",
		func(ctx context.Context, input *EmptyInput) (any, error) {
			return mgr.ListConnections(), nil
		})
	if err == nil {
		bus.Register(&RegisteredTool{
			Name:        "docker_list_connections",
			Description: "列出当前所有已建立连接的 Docker 实例与通信端点信息",
			BaseTool:    listConnsTool,
			Level:       guard.LevelAllow,
		})
	}

	// 2. docker_execute
	execTool, err := utils.InferTool("docker_execute", "以近似原生命令行 CLI 方式执行 Docker 容器/镜像/编排管理指令 (支持 ps, logs, inspect, start, stop, restart, pause, unpause, rm, images, rmi, volume ls, network ls, info, compose ls)",
		func(ctx context.Context, input *DockerExecuteInput) (string, error) {
			serverID, err := mgr.ResolveID(input.ServerID)
			if err != nil {
				return "", err
			}
			cli, err := mgr.GetClient(serverID)
			if err != nil {
				return "", err
			}

			rawCmd := strings.TrimSpace(input.Command)
			if rawCmd == "" {
				return "", fmt.Errorf("命令行指令不能为空")
			}

			return executeDockerCLI(ctx, cli, rawCmd)
		})
	if err == nil {
		bus.Register(&RegisteredTool{
			Name:        "docker_execute",
			Description: "以近似原生命令行 CLI 方式执行 Docker 容器/镜像/编排管理指令 (支持 ps, logs, inspect, start, stop, restart, pause, unpause, rm, images, rmi, volume ls, network ls, info, compose ls)",
			BaseTool:    execTool,
			Level:       guard.LevelAllow,
		})
	}

	// 3. docker_exec (Streaming container command execution)
	dockerExecTool, err := utils.InferTool("docker_exec", "在指定的 Docker 容器内部执行命令行指令并实时流式推流输出 (类似 execute 工具，支持逐行实时输出)",
		func(ctx context.Context, input *DockerExecInput) (*filesystem.ExecuteResponse, error) {
			serverID, err := mgr.ResolveID(input.ServerID)
			if err != nil {
				return nil, err
			}
			cli, err := mgr.GetClient(serverID)
			if err != nil {
				return nil, err
			}

			containerID, cmdSlice, workingDir, user, err := parseDockerExecInput(input)
			if err != nil {
				return nil, err
			}

			sessionID := SessionIDFromContext(ctx)
			callID := CallIDFromContext(ctx)
			traceID := TraceIDFromContext(ctx)

			var outBuilder strings.Builder
			onChunk := func(chunk string) {
				outBuilder.WriteString(chunk)
				if bus != nil && bus.eventBus != nil && sessionID != "" {
					bus.eventBus.Emit(events.Event{
						Type:      events.EventToolEvent,
						SessionID: sessionID,
						TraceID:   traceID,
						Payload: events.ToolEventPayload{
							CallID:   callID,
							ToolName: "docker_exec",
							Input:    input.Command,
							Output:   outBuilder.String(),
						},
					})
				}
			}

			exitCode, err := cli.ExecStream(ctx, containerID, cmdSlice, workingDir, user, onChunk)
			if err != nil {
				return nil, err
			}

			return &filesystem.ExecuteResponse{
				Output:   outBuilder.String(),
				ExitCode: &exitCode,
			}, nil
		})
	if err == nil {
		bus.Register(&RegisteredTool{
			Name:        "docker_exec",
			Description: "在指定的 Docker 容器内部执行命令行指令并实时流式推流输出 (类似 execute 工具，支持逐行实时输出)",
			BaseTool:    dockerExecTool,
			Level:       guard.LevelAllow,
		})
	}

	return nil
}

func parseDockerExecInput(input *DockerExecInput) (string, []string, string, string, error) {
	rawCmd := strings.TrimSpace(input.Command)
	containerID := strings.TrimSpace(input.ContainerID)
	workingDir := strings.TrimSpace(input.WorkingDir)
	user := strings.TrimSpace(input.User)

	if strings.HasPrefix(strings.ToLower(rawCmd), "docker exec") || strings.HasPrefix(strings.ToLower(rawCmd), "exec ") {
		parts := strings.Fields(rawCmd)
		if len(parts) > 0 && strings.EqualFold(parts[0], "docker") {
			parts = parts[1:]
		}
		if len(parts) > 0 && strings.EqualFold(parts[0], "exec") {
			parts = parts[1:]
		}

		var cmdParts []string
		for i := 0; i < len(parts); i++ {
			p := parts[i]
			if p == "-it" || p == "-i" || p == "-t" || p == "-d" || p == "--detach" {
				continue
			} else if (p == "-w" || p == "--workdir") && i+1 < len(parts) {
				workingDir = parts[i+1]
				i++
			} else if (p == "-u" || p == "--user") && i+1 < len(parts) {
				user = parts[i+1]
				i++
			} else if containerID == "" && !strings.HasPrefix(p, "-") {
				containerID = p
			} else {
				cmdParts = append(cmdParts, parts[i:]...)
				break
			}
		}
		if containerID == "" {
			return "", nil, "", "", fmt.Errorf("未指定目标容器 ID 或名称")
		}
		if len(cmdParts) == 0 {
			return "", nil, "", "", fmt.Errorf("未指定要在容器内执行的命令")
		}
		fullCmd := strings.Join(cmdParts, " ")
		return containerID, []string{"sh", "-c", fullCmd}, workingDir, user, nil
	}

	if containerID == "" {
		return "", nil, "", "", fmt.Errorf("未指定目标容器 ID 或名称 (container_id)")
	}
	if rawCmd == "" {
		return "", nil, "", "", fmt.Errorf("未指定要在容器内执行的命令 (command)")
	}

	return containerID, []string{"sh", "-c", rawCmd}, workingDir, user, nil
}

func executeDockerCLI(ctx context.Context, cli *docker.DockerClient, rawCmd string) (string, error) {
	// 去除开头的 "docker" 关键字
	parts := strings.Fields(rawCmd)
	if len(parts) > 0 && strings.EqualFold(parts[0], "docker") {
		parts = parts[1:]
	}
	if len(parts) == 0 {
		return "", fmt.Errorf("缺少子命令，例如 ps, logs, inspect, images 等")
	}

	sub := strings.ToLower(parts[0])

	switch sub {
	case "ps", "container":
		if sub == "container" && len(parts) > 1 && strings.EqualFold(parts[1], "ls") {
			parts = append(parts[:1], parts[2:]...)
		}
		all := false
		for _, arg := range parts[1:] {
			if arg == "-a" || arg == "--all" {
				all = true
			}
		}
		list, err := cli.ListContainers(ctx, all)
		if err != nil {
			return "", err
		}
		return formatDockerContainersTable(list), nil

	case "logs":
		if len(parts) < 2 {
			return "", fmt.Errorf("用法: docker logs [-n <tail>] [--timestamps] <container_id/name>")
		}
		tail := 100
		timestamps := false
		var targetID string
		for i := 1; i < len(parts); i++ {
			arg := parts[i]
			if arg == "-t" || arg == "--timestamps" {
				timestamps = true
			} else if (arg == "-n" || arg == "--tail") && i+1 < len(parts) {
				if n, err := strconv.Atoi(parts[i+1]); err == nil {
					tail = n
				}
				i++
			} else if !strings.HasPrefix(arg, "-") {
				targetID = arg
			}
		}
		if targetID == "" {
			return "", fmt.Errorf("未指定目标容器 ID 或名称")
		}
		return cli.GetContainerLogs(ctx, targetID, tail, timestamps)

	case "inspect":
		if len(parts) < 2 {
			return "", fmt.Errorf("用法: docker inspect <container_or_image_id>")
		}
		target := parts[1]
		res, err := cli.InspectContainer(ctx, target)
		if err == nil {
			return res, nil
		}
		imgRes, imgErr := cli.InspectImage(ctx, target)
		if imgErr == nil {
			return imgRes, nil
		}
		return "", fmt.Errorf("inspect 失败: %w", err)

	case "start":
		if len(parts) < 2 {
			return "", fmt.Errorf("用法: docker start <container_id/name>")
		}
		id := parts[1]
		if err := cli.StartContainer(ctx, id); err != nil {
			return "", err
		}
		return fmt.Sprintf("容器已启动: %s", id), nil

	case "stop":
		if len(parts) < 2 {
			return "", fmt.Errorf("用法: docker stop <container_id/name>")
		}
		id := parts[1]
		if err := cli.StopContainer(ctx, id); err != nil {
			return "", err
		}
		return fmt.Sprintf("容器已停止: %s", id), nil

	case "restart":
		if len(parts) < 2 {
			return "", fmt.Errorf("用法: docker restart <container_id/name>")
		}
		id := parts[1]
		if err := cli.RestartContainer(ctx, id); err != nil {
			return "", err
		}
		return fmt.Sprintf("容器已重启: %s", id), nil

	case "pause":
		if len(parts) < 2 {
			return "", fmt.Errorf("用法: docker pause <container_id/name>")
		}
		id := parts[1]
		if err := cli.PauseContainer(ctx, id); err != nil {
			return "", err
		}
		return fmt.Sprintf("容器已暂停: %s", id), nil

	case "unpause":
		if len(parts) < 2 {
			return "", fmt.Errorf("用法: docker unpause <container_id/name>")
		}
		id := parts[1]
		if err := cli.UnpauseContainer(ctx, id); err != nil {
			return "", err
		}
		return fmt.Sprintf("容器已恢复运行: %s", id), nil

	case "rm":
		if len(parts) < 2 {
			return "", fmt.Errorf("用法: docker rm [-f] <container_id/name>")
		}
		force := false
		var id string
		for _, a := range parts[1:] {
			if a == "-f" || a == "--force" {
				force = true
			} else if !strings.HasPrefix(a, "-") {
				id = a
			}
		}
		if id == "" {
			return "", fmt.Errorf("未指定待删除容器 ID")
		}
		if err := cli.RemoveContainer(ctx, id, force); err != nil {
			return "", err
		}
		return fmt.Sprintf("容器已删除: %s", id), nil

	case "images", "image":
		if sub == "image" && len(parts) > 1 && strings.EqualFold(parts[1], "rm") {
			force := false
			var imgID string
			for _, a := range parts[2:] {
				if a == "-f" || a == "--force" {
					force = true
				} else if !strings.HasPrefix(a, "-") {
					imgID = a
				}
			}
			if imgID == "" {
				return "", fmt.Errorf("未指定镜像 ID")
			}
			if err := cli.RemoveImage(ctx, imgID, force); err != nil {
				return "", err
			}
			return fmt.Sprintf("镜像已删除: %s", imgID), nil
		}
		list, err := cli.ListImages(ctx)
		if err != nil {
			return "", err
		}
		return formatDockerImagesTable(list), nil

	case "rmi":
		if len(parts) < 2 {
			return "", fmt.Errorf("用法: docker rmi [-f] <image_id>")
		}
		force := false
		var id string
		for _, a := range parts[1:] {
			if a == "-f" || a == "--force" {
				force = true
			} else if !strings.HasPrefix(a, "-") {
				id = a
			}
		}
		if id == "" {
			return "", fmt.Errorf("未指定待删除镜像 ID")
		}
		if err := cli.RemoveImage(ctx, id, force); err != nil {
			return "", err
		}
		return fmt.Sprintf("镜像已删除: %s", id), nil

	case "volume":
		list, err := cli.ListVolumes(ctx)
		if err != nil {
			return "", err
		}
		return formatDockerVolumesTable(list), nil

	case "network":
		list, err := cli.ListNetworks(ctx)
		if err != nil {
			return "", err
		}
		return formatDockerNetworksTable(list), nil

	case "info", "version":
		overview, err := cli.GetOverview(ctx)
		if err != nil {
			return "", err
		}
		data, _ := json.MarshalIndent(overview, "", "  ")
		return string(data), nil

	case "compose":
		stacks, err := cli.ListComposeStacks(ctx)
		if err != nil {
			return "", err
		}
		return formatDockerComposeTable(stacks), nil

	default:
		return "", fmt.Errorf("未知或暂不支持的 Docker 子命令: %s (支持 ps, logs, inspect, start, stop, restart, pause, unpause, rm, images, rmi, volume ls, network ls, info, compose ls)", sub)
	}
}

func formatDockerContainersTable(list []docker.DockerContainerInfo) string {
	if len(list) == 0 {
		return "没有匹配的容器"
	}
	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("%-14s %-25s %-16s %-22s %-25s %s\n", "CONTAINER ID", "IMAGE", "STATUS", "CREATED", "PORTS", "NAMES"))
	for _, c := range list {
		id := c.ID
		if len(id) > 12 {
			id = id[:12]
		}
		img := c.Image
		if len(img) > 24 {
			img = img[:21] + "..."
		}
		status := c.Status
		if status == "" {
			status = c.State
		}
		if len(status) > 15 {
			status = status[:15]
		}
		ports := c.PortStr
		if len(ports) > 24 {
			ports = ports[:21] + "..."
		}
		names := c.Name
		if names == "" && len(c.Names) > 0 {
			names = strings.Join(c.Names, ",")
		}
		created := fmt.Sprintf("%d", c.Created)
		sb.WriteString(fmt.Sprintf("%-14s %-25s %-16s %-22s %-25s %s\n", id, img, status, created, ports, names))
	}
	return strings.TrimRight(sb.String(), "\n")
}

func formatDockerImagesTable(list []docker.DockerImageInfo) string {
	if len(list) == 0 {
		return "没有本地镜像"
	}
	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("%-30s %-15s %-14s %-18s %s\n", "REPOSITORY", "TAG", "IMAGE ID", "SIZE", "CREATED"))
	for _, img := range list {
		repo := img.Repository
		if repo == "" {
			repo = "<none>"
		}
		tag := img.Tag
		if tag == "" {
			tag = "<none>"
		}
		id := img.ShortID
		if id == "" {
			id = img.ID
			if strings.HasPrefix(id, "sha256:") {
				id = id[7:]
			}
			if len(id) > 12 {
				id = id[:12]
			}
		}
		sizeStr := img.SizeStr
		if sizeStr == "" {
			sizeStr = fmt.Sprintf("%d B", img.Size)
		}
		created := fmt.Sprintf("%d", img.Created)
		sb.WriteString(fmt.Sprintf("%-30s %-15s %-14s %-18s %s\n", repo, tag, id, sizeStr, created))
	}
	return strings.TrimRight(sb.String(), "\n")
}

func formatDockerVolumesTable(list []docker.DockerVolumeInfo) string {
	if len(list) == 0 {
		return "没有存储卷"
	}
	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("%-15s %s\n", "DRIVER", "VOLUME NAME"))
	for _, v := range list {
		sb.WriteString(fmt.Sprintf("%-15s %s\n", v.Driver, v.Name))
	}
	return strings.TrimRight(sb.String(), "\n")
}

func formatDockerNetworksTable(list []docker.DockerNetworkInfo) string {
	if len(list) == 0 {
		return "没有网络"
	}
	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("%-14s %-25s %-12s %s\n", "NETWORK ID", "NAME", "DRIVER", "SCOPE"))
	for _, n := range list {
		id := n.ID
		if len(id) > 12 {
			id = id[:12]
		}
		sb.WriteString(fmt.Sprintf("%-14s %-25s %-12s %s\n", id, n.Name, n.Driver, n.Scope))
	}
	return strings.TrimRight(sb.String(), "\n")
}

func formatDockerComposeTable(list []docker.DockerComposeStackInfo) string {
	if len(list) == 0 {
		return "没有 Docker Compose 项目"
	}
	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("%-25s %-12s %-15s %s\n", "PROJECT", "STATUS", "SERVICES", "CONTAINERS"))
	for _, s := range list {
		status := fmt.Sprintf("%d/%d running", s.RunningServices, s.TotalServices)
		var svcNames []string
		for _, svc := range s.Services {
			svcNames = append(svcNames, svc.ServiceName)
		}
		sb.WriteString(fmt.Sprintf("%-25s %-12s %-15s %s\n", s.Name, s.Status, status, strings.Join(svcNames, ",")))
	}
	return strings.TrimRight(sb.String(), "\n")
}
