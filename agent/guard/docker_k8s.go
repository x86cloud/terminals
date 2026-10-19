package guard

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
)

func (g *PolicyGuard) auditDockerCommand(ctx context.Context, inputJSON string) (PermissionLevel, string) {
	clean := strings.TrimSpace(inputJSON)
	if clean == "" || clean == "{}" {
		return LevelAllow, ""
	}

	var obj struct {
		Command string `json:"command"`
	}
	cmdText := clean
	if err := json.Unmarshal([]byte(clean), &obj); err == nil && obj.Command != "" {
		cmdText = obj.Command
	}

	parts := strings.Fields(cmdText)
	if len(parts) > 0 && strings.EqualFold(parts[0], "docker") {
		parts = parts[1:]
	}
	if len(parts) == 0 {
		return LevelAllow, ""
	}

	sub := strings.ToLower(parts[0])

	g.mu.RLock()
	blockHighRisk := g.blockHighRiskCommands
	g.mu.RUnlock()

	if blockHighRisk {
		fullCmdUpper := strings.ToUpper(cmdText)
		if strings.Contains(fullCmdUpper, "SYSTEM PRUNE -A") || strings.Contains(fullCmdUpper, "SYSTEM PRUNE --ALL") || strings.Contains(fullCmdUpper, "RM -F $(DOCKER PS") {
			return LevelForbidden, "禁止执行高风险批量破坏性 Docker 指令"
		}
	}

	// 明确不支持部署/下线操作
	if sub == "run" || sub == "create" {
		return LevelForbidden, fmt.Sprintf("docker_execute 明确不支持部署/下线操作 (docker %s)；请使用 docker_orchestrate 工具", sub)
	}
	if sub == "compose" && len(parts) > 1 {
		subAction := strings.ToLower(parts[1])
		if subAction == "up" || subAction == "down" || subAction == "rm" {
			return LevelForbidden, fmt.Sprintf("docker_execute 明确不支持部署/下线操作 (docker compose %s)；请使用 docker_orchestrate 工具", subAction)
		}
	}

	// 只读/导出命令直接放行
	readCmds := []string{"ps", "logs", "inspect", "images", "image", "save", "volume", "network", "info", "version", "compose"}
	for _, rc := range readCmds {
		if sub == rc {
			if sub == "compose" && len(parts) > 1 && parts[1] == "restart" {
				return LevelConfirm, "执行 Docker Compose restart 操作需人工审批确认"
			}
			if sub == "image" && len(parts) > 1 && parts[1] == "rm" {
				return LevelConfirm, "删除 Docker 镜像操作需人工审批确认"
			}
			return LevelAllow, ""
		}
	}

	// 容器与镜像变更操作需确认
	confirmCmds := []string{"start", "stop", "restart", "pause", "unpause", "rm", "rmi", "kill", "pull", "load"}
	for _, cc := range confirmCmds {
		if sub == cc {
			return LevelConfirm, fmt.Sprintf("执行 Docker 容器/镜像状态变更 (%s) 需人工审批确认", cc)
		}
	}

	return LevelConfirm, "执行该 Docker 命令具有潜在状态变更风险，需人工审批确认"
}

func (g *PolicyGuard) auditDockerOrchestrate(ctx context.Context, inputJSON string) (PermissionLevel, string) {
	clean := strings.TrimSpace(inputJSON)
	if clean == "" || clean == "{}" {
		return LevelAllow, ""
	}

	var obj struct {
		Action string `json:"action"`
		Name   string `json:"name"`
	}
	if err := json.Unmarshal([]byte(clean), &obj); err == nil {
		action := strings.ToLower(strings.TrimSpace(obj.Action))
		switch action {
		case "list":
			return LevelAllow, ""
		case "apply", "up":
			detail := "执行 Docker Compose 编排部署"
			if obj.Name != "" {
				detail = fmt.Sprintf("执行 Docker Compose 编排部署 [项目: %s]", obj.Name)
			}
			return LevelConfirm, detail
		case "delete", "down":
			detail := "下线并销毁 Docker Compose 编排项目及本地记录"
			if obj.Name != "" {
				detail = fmt.Sprintf("下线并销毁 Docker Compose 编排项目及本地记录 [项目: %s]", obj.Name)
			}
			return LevelConfirm, detail
		}
	}

	return LevelConfirm, "执行 Docker Compose 编排操作需人工确认"
}

func (g *PolicyGuard) auditKubectlCommand(ctx context.Context, inputJSON string) (PermissionLevel, string) {
	clean := strings.TrimSpace(inputJSON)
	if clean == "" || clean == "{}" {
		return LevelAllow, ""
	}

	var obj struct {
		Command string `json:"command"`
	}
	cmdText := clean
	if err := json.Unmarshal([]byte(clean), &obj); err == nil && obj.Command != "" {
		cmdText = obj.Command
	}

	parts := strings.Fields(cmdText)
	if len(parts) > 0 && strings.EqualFold(parts[0], "kubectl") {
		parts = parts[1:]
	}
	if len(parts) == 0 {
		return LevelAllow, ""
	}

	sub := strings.ToLower(parts[0])

	g.mu.RLock()
	blockHighRisk := g.blockHighRiskCommands
	g.mu.RUnlock()

	if blockHighRisk {
		fullCmdUpper := strings.ToUpper(cmdText)
		if strings.Contains(fullCmdUpper, "DELETE NAMESPACE KUBE-SYSTEM") || strings.Contains(fullCmdUpper, "DELETE NS KUBE-SYSTEM") ||
			strings.Contains(fullCmdUpper, "DELETE NAMESPACE DEFAULT") || strings.Contains(fullCmdUpper, "DELETE NODE") {
			return LevelForbidden, "禁止删除核心系统命名空间或物理节点"
		}
	}

	// 明确不支持部署/下线操作
	if sub == "apply" || sub == "create" {
		return LevelForbidden, fmt.Sprintf("k8s_kubectl_execute 明确不支持部署/下线操作 (kubectl %s)；请使用 k8s_orchestrate 工具", sub)
	}
	if sub == "delete" && (strings.Contains(cmdText, "-f ") || strings.Contains(cmdText, "--filename") || strings.Contains(cmdText, "-f=")) {
		return LevelForbidden, "k8s_kubectl_execute 明确不支持部署/下线操作 (kubectl delete -f)；请使用 k8s_orchestrate 工具"
	}

	// 只读命令直接放行
	readCmds := []string{"get", "logs", "describe", "cluster-info", "version", "top", "explain"}
	for _, rc := range readCmds {
		if sub == rc {
			return LevelAllow, ""
		}
	}

	// 变更操作需确认
	confirmCmds := []string{"scale", "rollout", "delete", "patch", "cordon", "drain"}
	for _, cc := range confirmCmds {
		if sub == cc {
			return LevelConfirm, fmt.Sprintf("执行 Kubernetes 集群资源变更 (%s) 需人工审批确认", cc)
		}
	}

	return LevelConfirm, "执行该 Kubernetes 变更命令需人工审批确认"
}

func (g *PolicyGuard) auditK8sOrchestrate(ctx context.Context, inputJSON string) (PermissionLevel, string) {
	clean := strings.TrimSpace(inputJSON)
	if clean == "" || clean == "{}" {
		return LevelAllow, ""
	}

	var obj struct {
		Action    string `json:"action"`
		Name      string `json:"name"`
		YAML      string `json:"yaml"`
		Namespace string `json:"namespace"`
	}
	if err := json.Unmarshal([]byte(clean), &obj); err == nil {
		action := strings.ToLower(strings.TrimSpace(obj.Action))
		switch action {
		case "list":
			return LevelAllow, ""
		case "apply":
			detail := "执行 Kubernetes YAML 编排部署"
			if obj.Name != "" {
				detail = fmt.Sprintf("执行 Kubernetes YAML 编排部署 [%s]", obj.Name)
			}
			return LevelConfirm, detail
		case "delete":
			g.mu.RLock()
			blockHighRisk := g.blockHighRiskCommands
			g.mu.RUnlock()

			if blockHighRisk && obj.YAML != "" {
				upperYAML := strings.ToUpper(obj.YAML)
				if strings.Contains(upperYAML, "KIND: NAMESPACE") && (strings.Contains(upperYAML, "NAME: KUBE-SYSTEM") || strings.Contains(upperYAML, "NAME: DEFAULT")) {
					return LevelForbidden, "禁止删除核心系统命名空间"
				}
				if strings.Contains(upperYAML, "KIND: NODE") {
					return LevelForbidden, "禁止删除物理节点"
				}
			}

			detail := "下线/删除 Kubernetes YAML 编排资源"
			if obj.Name != "" {
				detail = fmt.Sprintf("下线/删除 Kubernetes YAML 编排资源 [%s]", obj.Name)
			}
			return LevelConfirm, detail
		}
	}

	return LevelConfirm, "执行 Kubernetes YAML 编排操作需人工确认"
}

func (g *PolicyGuard) auditContainerExecCommand(ctx context.Context, inputJSON string) (PermissionLevel, string) {
	clean := strings.TrimSpace(inputJSON)
	if clean == "" || clean == "{}" {
		return LevelAllow, ""
	}

	var obj struct {
		Command string `json:"command"`
	}
	cmdText := clean
	if err := json.Unmarshal([]byte(clean), &obj); err == nil && obj.Command != "" {
		cmdText = obj.Command
	}

	// 去除开头的 docker exec 或 kubectl exec 包装
	parts := strings.Fields(cmdText)
	if len(parts) > 0 && (strings.EqualFold(parts[0], "docker") || strings.EqualFold(parts[0], "kubectl")) {
		if len(parts) > 1 && strings.EqualFold(parts[1], "exec") {
			parts = parts[2:]
		}
	} else if len(parts) > 0 && strings.EqualFold(parts[0], "exec") {
		parts = parts[1:]
	}

	// 提取实际在容器内执行的命令
	var innerCmdParts []string
	dashDashIdx := -1
	for idx, p := range parts {
		if p == "--" {
			dashDashIdx = idx
			break
		}
	}
	if dashDashIdx != -1 && dashDashIdx+1 < len(parts) {
		innerCmdParts = parts[dashDashIdx+1:]
	} else {
		for i := 0; i < len(parts); i++ {
			p := parts[i]
			if p == "-it" || p == "-i" || p == "-t" || p == "-d" || p == "--detach" {
				continue
			}
			if (p == "-n" || p == "--namespace" || p == "-c" || p == "--container" || p == "-w" || p == "--workdir" || p == "-u" || p == "--user") && i+1 < len(parts) {
				i++
				continue
			}
			if strings.HasPrefix(p, "--namespace=") || strings.HasPrefix(p, "--container=") || strings.HasPrefix(p, "--workdir=") || strings.HasPrefix(p, "--user=") {
				continue
			}
			if strings.HasPrefix(p, "-") {
				continue
			}
			// 遇到第一个非 flag 参数即容器名/Pod名，之后的所有参数均视为容器内部指令
			if i+1 < len(parts) {
				innerCmdParts = parts[i+1:]
			}
			break
		}
	}
	if len(innerCmdParts) == 0 {
		innerCmdParts = parts
	}

	innerCmd := strings.TrimSpace(strings.Join(innerCmdParts, " "))
	if innerCmd == "" {
		return LevelAllow, ""
	}

	g.mu.RLock()
	blockHighRisk := g.blockHighRiskCommands
	wsDir := g.workspaceDir
	g.mu.RUnlock()

	// 容器内部执行的指令同样接入 Shell AST 深度安全审计
	lvl, reason := AuditShellAST(ctx, innerCmd, blockHighRisk, wsDir)
	if lvl == LevelForbidden {
		return LevelForbidden, fmt.Sprintf("容器内 Exec 命令触发安全拦截: %s", reason)
	}
	if lvl == LevelAllow {
		return LevelAllow, ""
	}

	return LevelConfirm, fmt.Sprintf("执行容器内 Exec 命令 (%s) 具有状态变更潜在风险，需人工审批确认", innerCmd)
}

func (g *PolicyGuard) auditApiManager(ctx context.Context, input string) (PermissionLevel, string) {
	var payload struct {
		Action string `json:"action"`
		ID     string `json:"id"`
		Name   string `json:"name"`
	}
	if err := json.Unmarshal([]byte(input), &payload); err == nil {
		action := strings.ToLower(strings.TrimSpace(payload.Action))
		if action == "delete" {
			target := payload.ID
			if target == "" {
				target = payload.Name
			}
			return LevelConfirm, fmt.Sprintf("删除 API 接口或分组 (ID/名称: %s)", target)
		}
	}
	return LevelAllow, ""
}
