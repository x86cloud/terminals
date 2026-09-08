package tools

import (
	"context"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
	"time"
	"terminal/agent/events"
	"terminal/agent/guard"
	"terminal/core"
	"terminal/docker"

	"github.com/cloudwego/eino/adk/filesystem"
	"github.com/cloudwego/eino/components/tool/utils"
	"github.com/google/uuid"
	"gopkg.in/yaml.v3"
)

type DockerExecuteInput struct {
	ServerID string `json:"server_id,omitempty" jsonschema:"description=Docker 实例连接 ID 或名称，若当前处于活动 Docker 会话或仅有一个连接可留空"`
	Command  string `json:"command" jsonschema:"description=要执行的 Docker 命令行指令，例如: docker ps -a、docker logs -n 50 <容器名/ID>、docker inspect <容器名>、docker start/stop/restart <容器名>、docker images、docker info、docker compose ls。注意：本工具明确不支持部署/下线操作（不支持 docker run, docker create, docker compose up/down 等）；涉及容器栈的编排部署、发布或下线销毁，请务必使用 docker_orchestrate 工具"`
}

type DockerExecInput struct {
	ServerID    string `json:"server_id,omitempty" jsonschema:"description=Docker 实例连接 ID 或名称，若当前处于活动 Docker 会话或仅有一个连接可留空"`
	ContainerID string `json:"container_id,omitempty" jsonschema:"description=目标容器的 ID 或名称，例如: my-nginx。若在 command 中已包含容器名可留空"`
	Command     string `json:"command" jsonschema:"description=要在容器内执行的命令或脚本（例如: 'ls -la /app' 或 'cat /etc/hosts'），也支持直接传入完整 CLI 如 'docker exec -it web ps'"`
	WorkingDir  string `json:"working_dir,omitempty" jsonschema:"description=容器内可选工作目录"`
	User        string `json:"user,omitempty" jsonschema:"description=容器内可选执行用户"`
}

type DockerOrchestrateInput struct {
	Action      string            `json:"action" jsonschema:"description=要执行的编排操作类型：'apply' (部署/增量更新 Compose 容器栈并保存记录，同 'up')、'delete' (下线销毁 Compose 容器栈及网络并清除本地记录，同 'down')、'list' (查看本地保存的 Compose 方案与远程运行态 Stack 列表),enum=apply,enum=delete,enum=list,enum=up,enum=down"`
	ServerID    string            `json:"server_id,omitempty" jsonschema:"description=Docker 实例连接 ID 或名称，若当前处于活动 Docker 会话或仅有一个连接可留空自动解析"`
	YamlContent string            `json:"yaml_content,omitempty" jsonschema:"description=完整的 docker-compose.yml 编排内容。action 为 apply/up 时必填；action 为 delete/down 时可选"`
	Name        string            `json:"name,omitempty" jsonschema:"description=Compose 项目名称 (Project Name，如 'my-app' 或 'redis-cluster')。留空时 apply 自动从 YAML 顶级 name 或首个服务名智能推导"`
	RecordID    string            `json:"record_id,omitempty" jsonschema:"description=目标本地 Compose 记录 ID。action 为 delete 时，可直接提供 record_id 进行精准下线删除"`
	EnvVars     map[string]string `json:"env_vars,omitempty" jsonschema:"description=可选的环境变量键值对，用于在部署时对 Compose YAML 中的 ${VAR} 变量进行插值替换"`
	ForcePull   bool              `json:"force_pull,omitempty" jsonschema:"description=部署前是否强制拉取最新镜像，默认 false"`
	Recreate    bool              `json:"recreate,omitempty" jsonschema:"description=是否强制重建所有已存在的容器实例，默认 false"`
}

func resolveDockerServerID(mgr *docker.DockerManager, serverID string) (string, error) {
	if mgr == nil {
		return "", fmt.Errorf("Docker 管理器不可用")
	}
	trimmed := strings.TrimSpace(serverID)
	if trimmed == "" {
		if active := GetActiveConnection(); active != nil && active.Protocol == "docker" && active.ID != "" {
			trimmed = active.ID
		}
	}
	return mgr.ResolveID(trimmed)
}

func RegisterDockerTools(bus *ToolBus, mgr *docker.DockerManager, store *core.Store) error {
	if mgr == nil {
		return nil
	}

	// 1. docker_execute
	execTool, err := utils.InferTool("docker_execute", "以近似原生命令行 CLI 方式执行 Docker 容器/镜像状态查询与基础运维指令 (支持 ps, logs, inspect, start, stop, restart, pause, unpause, rm, images, rmi, volume ls, network ls, info, compose ls)。注意：本工具明确不支持部署/下线操作（不支持 docker run, docker create, docker compose up/down 等）；涉及容器栈的编排部署、发布或下线销毁，请务必使用 docker_orchestrate 工具",
		func(ctx context.Context, input *DockerExecuteInput) (string, error) {
			serverID, err := resolveDockerServerID(mgr, input.ServerID)
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
			Description: "以近似原生命令行 CLI 方式执行 Docker 容器/镜像状态查询与基础运维指令 (支持 ps, logs, inspect, start, stop, restart, pause, unpause, rm, images, rmi, volume ls, network ls, info, compose ls)。注意：本工具明确不支持部署/下线操作（不支持 docker run, docker create, docker compose up/down 等）；涉及容器栈的编排部署、发布或下线销毁，请务必使用 docker_orchestrate 工具",
			BaseTool:    execTool,
			Level:       guard.LevelAllow,
		})
	}

	// 2. docker_exec (Streaming container command execution)
	dockerExecTool, err := utils.InferTool("docker_exec", "在指定的 Docker 容器内部执行命令行指令并实时流式推流输出 (类似 execute 工具，支持逐行实时输出)",
		func(ctx context.Context, input *DockerExecInput) (*filesystem.ExecuteResponse, error) {
			serverID, err := resolveDockerServerID(mgr, input.ServerID)
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

	// 4. docker_orchestrate
	orchTool, err := utils.InferTool("docker_orchestrate", "Docker Compose 声明式多服务容器栈编排部署、下线销毁与方案查询工具 (支持 apply/up 部署增量更新并落盘记录, delete/down 下线销毁容器与网络并清理记录, list 查询本地与远程运行态 Compose 列表)",
		func(ctx context.Context, input *DockerOrchestrateInput) (string, error) {
			return handleDockerOrchestrate(ctx, mgr, store, input)
		})
	if err == nil {
		bus.Register(&RegisteredTool{
			Name:        "docker_orchestrate",
			Description: "Docker Compose 声明式多服务容器栈编排部署、下线销毁与方案查询工具 (支持 apply/up 部署增量更新并落盘记录, delete/down 下线销毁容器与网络并清理记录, list 查询本地与远程运行态 Compose 列表)",
			BaseTool:    orchTool,
			Level:       guard.LevelConfirm,
		})
	}

	return nil
}

func inferDockerComposeProjectName(yamlContent, fallback string) string {
	var raw struct {
		Name     string                 `yaml:"name"`
		Services map[string]interface{} `yaml:"services"`
	}
	if err := yaml.Unmarshal([]byte(yamlContent), &raw); err == nil {
		if strings.TrimSpace(raw.Name) != "" {
			return sanitizeDockerProjectName(raw.Name)
		}
		if len(raw.Services) > 0 {
			for svcName := range raw.Services {
				if strings.TrimSpace(svcName) != "" {
					return sanitizeDockerProjectName(svcName)
				}
			}
		}
	}
	if fallback != "" {
		return sanitizeDockerProjectName(fallback)
	}
	return "compose-project"
}

func sanitizeDockerProjectName(name string) string {
	clean := strings.TrimSpace(strings.ToLower(name))
	var sb strings.Builder
	for _, r := range clean {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '-' || r == '_' {
			sb.WriteRune(r)
		}
	}
	res := sb.String()
	if res == "" {
		return "compose-project"
	}
	return res
}

func handleDockerOrchestrate(ctx context.Context, mgr *docker.DockerManager, store *core.Store, input *DockerOrchestrateInput) (string, error) {
	action := strings.ToLower(strings.TrimSpace(input.Action))
	switch action {
	case "list":
		var serverID string
		if mgr != nil {
			resolved, err := resolveDockerServerID(mgr, input.ServerID)
			if err == nil {
				serverID = resolved
			} else if input.ServerID != "" {
				serverID = input.ServerID
			}
		} else {
			serverID = input.ServerID
		}

		var localRecords []core.DockerComposeRecord
		if store != nil {
			localRecords = store.ListComposeRecords(serverID)
		}

		var remoteStacks []docker.DockerComposeStackInfo
		if mgr != nil && serverID != "" {
			if cli, err := mgr.GetClient(serverID); err == nil {
				listCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
				remoteStacks, _ = cli.ListComposeStacks(listCtx)
				cancel()
			}
		}

		if len(localRecords) == 0 && len(remoteStacks) == 0 {
			if serverID != "" {
				return fmt.Sprintf("Docker 实例 [%s] 当前暂无已保存的 Compose 编排方案或运行态容器栈。", serverID), nil
			}
			return "当前暂无本地保存的 Docker Compose 编排方案或运行态容器栈。", nil
		}

		// 匹配本地记录与远程运行栈
		matchedRemoteNames := make(map[string]bool)
		var sb strings.Builder
		if serverID != "" {
			sb.WriteString(fmt.Sprintf("=== Docker 实例 [%s] Compose 编排项目清单 ===\n", serverID))
		} else {
			sb.WriteString("=== Docker 全部 Compose 编排项目清单 ===\n")
		}

		idx := 1
		for _, rec := range localRecords {
			var matched *docker.DockerComposeStackInfo
			for _, s := range remoteStacks {
				if (s.UUID != "" && s.UUID == rec.ID) || strings.EqualFold(s.Name, rec.ProjectName) {
					matched = &s
					matchedRemoteNames[strings.ToLower(s.Name)] = true
					break
				}
			}

			if matched != nil {
				sb.WriteString(fmt.Sprintf("%d. [%s] 状态: 🟢 运行中 (running, %d/%d 服务在线)\n", idx, rec.ProjectName, matched.RunningServices, matched.TotalServices))
			} else {
				sb.WriteString(fmt.Sprintf("%d. [%s] 状态: ⚪ 未部署/已停止 (not_deployed)\n", idx, rec.ProjectName))
			}
			sb.WriteString(fmt.Sprintf("   - 记录ID: %s\n", rec.ID))
			sb.WriteString(fmt.Sprintf("   - 实例ID: %s\n", rec.ServerID))
			sb.WriteString(fmt.Sprintf("   - 最近更新: %s\n", rec.UpdatedAt))
			idx++
		}

		// 列出未关联本地记录的外部运行态 Compose 项目
		for _, s := range remoteStacks {
			if !matchedRemoteNames[strings.ToLower(s.Name)] {
				sb.WriteString(fmt.Sprintf("%d. [%s] 状态: 🔵 外部发现 (running, %d/%d 服务在线)\n", idx, s.Name, s.RunningServices, s.TotalServices))
				if s.UUID != "" {
					sb.WriteString(fmt.Sprintf("   - 项目UUID: %s\n", s.UUID))
				}
				sb.WriteString(fmt.Sprintf("   - 配置文件: %s\n", s.ConfigFiles))
				idx++
			}
		}

		return sb.String(), nil

	case "apply", "up":
		if mgr == nil {
			return "", fmt.Errorf("Docker 管理器不可用")
		}
		serverID, err := resolveDockerServerID(mgr, input.ServerID)
		if err != nil {
			return "", err
		}
		cli, err := mgr.GetClient(serverID)
		if err != nil {
			return "", err
		}

		yamlContent := strings.TrimSpace(input.YamlContent)
		if yamlContent == "" {
			return "", fmt.Errorf("action 为 apply 时，yaml_content 不能为空")
		}

		projectName := sanitizeDockerProjectName(input.Name)
		if projectName == "compose-project" && strings.TrimSpace(input.Name) == "" {
			projectName = inferDockerComposeProjectName(yamlContent, "")
		}

		recordID := strings.TrimSpace(input.RecordID)
		if recordID == "" && store != nil {
			for _, rec := range store.ListComposeRecords(serverID) {
				if strings.EqualFold(rec.ProjectName, projectName) {
					recordID = rec.ID
					break
				}
			}
		}
		if recordID == "" {
			recordID = uuid.New().String()
		}

		applyCtx, cancel := context.WithTimeout(ctx, 180*time.Second)
		defer cancel()

		req := docker.DockerComposeDeployReq{
			ID:          recordID,
			ProjectName: projectName,
			YamlContent: yamlContent,
			EnvVars:     input.EnvVars,
			ForcePull:   input.ForcePull,
			Recreate:    input.Recreate,
		}

		if err := cli.UpComposeStack(applyCtx, req); err != nil {
			return "", fmt.Errorf("执行 Compose 部署更新失败: %w", err)
		}

		var savedRec *core.DockerComposeRecord
		if store != nil {
			rec := core.DockerComposeRecord{
				ID:          recordID,
				ServerID:    serverID,
				ProjectName: projectName,
				YamlContent: yamlContent,
				EnvVars:     input.EnvVars,
			}
			savedRec, _ = store.SaveComposeRecord(rec)
		}

		// 获取部署后的运行态详情
		stackInfo, _ := cli.GetComposeStack(ctx, projectName)

		var sb strings.Builder
		sb.WriteString(fmt.Sprintf("🚀 Docker Compose 编排项目 [%s] 部署成功！\n", projectName))
		if savedRec != nil {
			sb.WriteString(fmt.Sprintf("📦 本地配置已保存 (记录ID: %s, 实例: %s)\n", savedRec.ID, serverID))
		}
		if stackInfo != nil {
			sb.WriteString(fmt.Sprintf("📊 运行状态: %d/%d 服务在线\n", stackInfo.RunningServices, stackInfo.TotalServices))
			if len(stackInfo.Services) > 0 {
				sb.WriteString("服务列表:\n")
				for _, svc := range stackInfo.Services {
					sb.WriteString(fmt.Sprintf("  - %s: 状态=%s, 镜像=%s", svc.ServiceName, svc.State, svc.Image))
					if svc.Ports != "" {
						sb.WriteString(fmt.Sprintf(", 端口=[%s]", svc.Ports))
					}
					sb.WriteString("\n")
				}
			}
		}
		return sb.String(), nil

	case "delete", "down":
		if mgr == nil {
			return "", fmt.Errorf("Docker 管理器不可用")
		}
		serverID, err := resolveDockerServerID(mgr, input.ServerID)
		if err != nil {
			return "", err
		}
		cli, err := mgr.GetClient(serverID)
		if err != nil {
			return "", err
		}

		recordID := strings.TrimSpace(input.RecordID)
		projectName := strings.TrimSpace(input.Name)

		if recordID != "" && store != nil {
			rec, err := store.GetComposeRecord(recordID)
			if err == nil && rec != nil {
				if projectName == "" {
					projectName = rec.ProjectName
				}
			}
		}

		if projectName == "" && input.YamlContent != "" {
			projectName = inferDockerComposeProjectName(input.YamlContent, "")
		}

		if projectName == "" && recordID == "" {
			return "", fmt.Errorf("action 为 delete 时，必须提供 name (项目名)、record_id 或包含项目的 yaml_content")
		}

		projectName = sanitizeDockerProjectName(projectName)

		// 若未提供 recordID，尝试按 projectName 寻找已保存的 recordID
		if recordID == "" && store != nil {
			for _, rec := range store.ListComposeRecords(serverID) {
				if strings.EqualFold(rec.ProjectName, projectName) {
					recordID = rec.ID
					break
				}
			}
		}

		delCtx, cancel := context.WithTimeout(ctx, 60*time.Second)
		defer cancel()

		// 销毁远程容器和网络 (按 projectName 与 recordID 均调用 down 确保彻底清理)
		if projectName != "" {
			_ = cli.ControlComposeStack(delCtx, projectName, "down")
		}
		if recordID != "" {
			_ = cli.ControlComposeStack(delCtx, recordID, "down")
		}

		// 从本地存储彻底删除
		if store != nil && recordID != "" {
			_ = store.DeleteComposeRecord(recordID)
		}

		return fmt.Sprintf("🗑️ Docker Compose 编排项目 [%s] 已成功下线清理，关联容器/网络已销毁，本地记录已彻底移除！", projectName), nil

	default:
		return "", fmt.Errorf("未知操作类型: %s (仅支持 apply/up, delete/down, list)", input.Action)
	}
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

	// 明确不支持部署/下线操作，阻断并引导至 docker_orchestrate
	if sub == "run" || sub == "create" {
		return "", fmt.Errorf("docker_execute 明确不支持部署/下线操作 (docker %s)；涉及容器栈的编排部署、发布或下线销毁，请务必使用 docker_orchestrate 工具", sub)
	}
	if sub == "compose" && len(parts) > 1 {
		subAction := strings.ToLower(parts[1])
		if subAction == "up" || subAction == "down" || subAction == "rm" {
			return "", fmt.Errorf("docker_execute 明确不支持部署/下线操作 (docker compose %s)；涉及容器栈的编排部署、发布或下线销毁，请务必使用 docker_orchestrate 工具", subAction)
		}
	}

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

	case "pull":
		if len(parts) < 2 {
			return "", fmt.Errorf("用法: docker pull <image_name>")
		}
		imgName := parts[1]
		return cli.PullImage(ctx, imgName)

	case "save":
		if len(parts) < 2 {
			return "", fmt.Errorf("用法: docker save -o <output.tar> <image_name>")
		}
		var outFile string
		var imgNames []string
		for i := 1; i < len(parts); i++ {
			p := parts[i]
			if (p == "-o" || p == "--output") && i+1 < len(parts) {
				outFile = parts[i+1]
				i++
			} else if !strings.HasPrefix(p, "-") {
				imgNames = append(imgNames, p)
			}
		}
		if outFile == "" {
			return "", fmt.Errorf("未指定导出目标文件路径 (-o <file.tar>)")
		}
		if len(imgNames) == 0 {
			return "", fmt.Errorf("未指定要导出的镜像")
		}
		if err := cli.SaveImage(ctx, imgNames, outFile); err != nil {
			return "", err
		}
		return fmt.Sprintf("镜像 %s 已成功导出保存到: %s", strings.Join(imgNames, ", "), outFile), nil

	case "load":
		if len(parts) < 2 {
			return "", fmt.Errorf("用法: docker load -i <input.tar>")
		}
		var inFile string
		for i := 1; i < len(parts); i++ {
			p := parts[i]
			if (p == "-i" || p == "--input") && i+1 < len(parts) {
				inFile = parts[i+1]
				i++
			} else if !strings.HasPrefix(p, "-") {
				inFile = p
			}
		}
		if inFile == "" {
			return "", fmt.Errorf("未指定导入镜像文件路径 (-i <file.tar>)")
		}
		res, err := cli.LoadImage(ctx, inFile, false)
		if err != nil {
			return "", err
		}
		return fmt.Sprintf("镜像导入结果:\n%s", res), nil

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
