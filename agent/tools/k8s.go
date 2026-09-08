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
	"terminal/k8s"

	"github.com/cloudwego/eino/adk/filesystem"
	"github.com/cloudwego/eino/components/tool/utils"
)

type K8sKubectlExecuteInput struct {
	ServerID string `json:"server_id,omitempty" jsonschema:"description=Kubernetes 集群连接 ID 或名称，若当前处于活动 Kubernetes 会话或仅有一个连接可留空"`
	Command  string `json:"command" jsonschema:"description=要执行的 Kubectl 命令行指令，例如: kubectl get pods -n default、kubectl get nodes、kubectl logs <pod_name> -n default、kubectl describe deployment <name> -n default、kubectl scale deployment <name> --replicas=3 -n default、kubectl rollout restart deployment <name> -n default、kubectl delete pod <name> -n default、kubectl apply -f <yaml内容>、kubectl cluster-info"`
}

type K8sExecInput struct {
	ServerID      string `json:"server_id,omitempty" jsonschema:"description=Kubernetes 集群连接 ID 或名称，若当前处于活动 Kubernetes 会话或仅有一个连接可留空"`
	Namespace     string `json:"namespace,omitempty" jsonschema:"description=目标命名空间，默认为 default"`
	PodName       string `json:"pod_name,omitempty" jsonschema:"description=目标 Pod 名称，例如: nginx-pod。若在 command 中已指定 Pod 可留空"`
	ContainerName string `json:"container_name,omitempty" jsonschema:"description=Pod 内可选目标容器名称（多容器 Pod 时使用）"`
	Command       string `json:"command" jsonschema:"description=要在 Pod 容器内执行的命令指令（例如: 'ls -la /' 或 'cat /etc/hosts'），也支持直接传入完整 CLI 如 'kubectl exec my-pod -n default -- sh -c env'"`
}

type K8sOrchestrateInput struct {
	Action      string `json:"action" jsonschema:"description=要执行的编排操作类型：'apply' (声明式应用部署 YAML 并落盘保存记录)、'delete' (声明式下线清理集群中的资源并更新记录状态)、'list' (查看当前集群本地已保存的编排方案记录列表与状态),enum=apply,enum=delete,enum=list"`
	ServerID    string `json:"server_id,omitempty" jsonschema:"description=Kubernetes 集群连接 ID 或名称，若当前处于活动 Kubernetes 会话或仅有一个连接可留空自动解析"`
	YamlContent string `json:"yaml_content,omitempty" jsonschema:"description=Kubernetes 资源清单 YAML 文本内容（支持多文档 --- 分隔，例如同时包含 Deployment、Service、ConfigMap 等）。action 为 apply 或 delete 时使用"`
	Name        string `json:"name,omitempty" jsonschema:"description=编排方案自定义名称（例如: 'redis-cluster' 或 'nginx-ingress'）。若留空，apply 时会自动根据 YAML 清单中首个资源的 metadata.name 或 Kind 智能推导"`
	Namespace   string `json:"namespace,omitempty" jsonschema:"description=目标兜底命名空间，若 YAML 资源内部未指定 namespace 时使用，默认为 default"`
	RecordID    string `json:"record_id,omitempty" jsonschema:"description=目标编排记录 ID（可选）。action 为 delete 时，若未提供 yaml_content，可直接根据 record_id 下线已有的编排方案"`
}

func resolveK8sServerID(mgr *k8s.K8sManager, serverID string) (string, error) {
	if mgr == nil {
		return "", fmt.Errorf("Kubernetes 管理器不可用")
	}
	trimmed := strings.TrimSpace(serverID)
	if trimmed == "" {
		if active := GetActiveConnection(); active != nil && active.Protocol == "k8s" && active.ID != "" {
			trimmed = active.ID
		}
	}
	return mgr.ResolveID(trimmed)
}

func RegisterK8sTools(bus *ToolBus, mgr *k8s.K8sManager, store *core.Store) error {
	if mgr == nil {
		return nil
	}

	// 1. k8s_kubectl_execute
	execTool, err := utils.InferTool("k8s_kubectl_execute", "以近似原生 Kubectl CLI 方式执行 Kubernetes 集群资源查询与运维指令 (支持 get pods/nodes/deploy/svc/ns/cm/secret/pvc, logs, describe, scale, rollout restart, delete, apply -f, cluster-info, version)",
		func(ctx context.Context, input *K8sKubectlExecuteInput) (string, error) {
			serverID, err := resolveK8sServerID(mgr, input.ServerID)
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

			return executeKubectlCLI(ctx, cli, rawCmd)
		})
	if err == nil {
		bus.Register(&RegisteredTool{
			Name:        "k8s_kubectl_execute",
			Description: "以近似原生 Kubectl CLI 方式执行 Kubernetes 集群资源查询与运维指令 (支持 get pods/nodes/deploy/svc/ns/cm/secret/pvc, logs, describe, scale, rollout restart, delete, apply -f, cluster-info, version)",
			BaseTool:    execTool,
			Level:       guard.LevelAllow,
		})
	}

	// 2. kubectl_exec & k8s_exec (Streaming Pod exec)
	k8sExecHandler := func(ctx context.Context, input *K8sExecInput) (*filesystem.ExecuteResponse, error) {
		serverID, err := resolveK8sServerID(mgr, input.ServerID)
		if err != nil {
			return nil, err
		}
		cli, err := mgr.GetClient(serverID)
		if err != nil {
			return nil, err
		}

		namespace, podName, containerName, cmdSlice, err := parseKubectlExecInput(input)
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
						ToolName: "kubectl_exec",
						Input:    input.Command,
						Output:   outBuilder.String(),
					},
				})
			}
		}

		exitCode, err := cli.ExecStream(ctx, namespace, podName, containerName, cmdSlice, onChunk)
		if err != nil {
			return nil, err
		}

		return &filesystem.ExecuteResponse{
			Output:   outBuilder.String(),
			ExitCode: &exitCode,
		}, nil
	}

	kubectlExecTool, err := utils.InferTool("kubectl_exec", "在指定的 Kubernetes Pod 容器内部执行命令行指令并实时流式推流输出 (类似 execute 工具，支持逐行实时输出)", k8sExecHandler)
	if err == nil {
		bus.Register(&RegisteredTool{
			Name:        "kubectl_exec",
			Description: "在指定的 Kubernetes Pod 容器内部执行命令行指令并实时流式推流输出 (类似 execute 工具，支持逐行实时输出)",
			BaseTool:    kubectlExecTool,
			Level:       guard.LevelAllow,
		})
	}

	k8sExecTool, err := utils.InferTool("k8s_exec", "在指定的 Kubernetes Pod 容器内部执行命令行指令并实时流式推流输出 (kubectl_exec 的别名)", k8sExecHandler)
	if err == nil {
		bus.Register(&RegisteredTool{
			Name:        "k8s_exec",
			Description: "在指定的 Kubernetes Pod 容器内部执行命令行指令并实时流式推流输出 (kubectl_exec 的别名)",
			BaseTool:    k8sExecTool,
			Level:       guard.LevelAllow,
		})
	}

	// 4. k8s_orchestrate (Declarative YAML orchestration)
	orchestrateTool, err := utils.InferTool("k8s_orchestrate", "对指定 Kubernetes 集群执行声明式 YAML 资源编排。支持多资源清单一键部署 (apply) 并自动落盘保存至客户端「YAML 编排」列表、下线清理集群资源 (delete) 以及查看本地已保存的编排方案列表与运行状态 (list)",
		func(ctx context.Context, input *K8sOrchestrateInput) (string, error) {
			if input == nil {
				return "", fmt.Errorf("编排参数不能为空")
			}
			return handleK8sOrchestrate(ctx, mgr, store, input)
		})
	if err == nil {
		bus.Register(&RegisteredTool{
			Name:        "k8s_orchestrate",
			Description: "对指定 Kubernetes 集群执行声明式 YAML 资源编排。支持多资源清单一键部署 (apply) 并自动落盘保存至客户端「YAML 编排」列表、下线清理集群资源 (delete) 以及查看本地已保存的编排方案列表与运行状态 (list)",
			BaseTool:    orchestrateTool,
			Level:       guard.LevelAllow,
		})
	}

	return nil
}

func handleK8sOrchestrate(ctx context.Context, mgr *k8s.K8sManager, store *core.Store, input *K8sOrchestrateInput) (string, error) {
	action := strings.ToLower(strings.TrimSpace(input.Action))
	switch action {
	case "list":
		if store == nil {
			return "本地编排存储服务暂不可用，无法查询保存的编排方案", nil
		}

		var serverID string
		if mgr != nil {
			resolved, err := resolveK8sServerID(mgr, input.ServerID)
			if err == nil {
				serverID = resolved
			} else if input.ServerID != "" {
				serverID = input.ServerID
			}
		} else {
			serverID = input.ServerID
		}

		records := store.ListK8sOrchestrationRecords(serverID)
		if len(records) == 0 {
			if serverID != "" {
				return fmt.Sprintf("Kubernetes 集群 [%s] 当前暂无本地保存的 YAML 编排方案记录。", serverID), nil
			}
			return "当前暂无本地保存的 Kubernetes YAML 编排方案记录。", nil
		}

		var sb strings.Builder
		if serverID != "" {
			sb.WriteString(fmt.Sprintf("=== Kubernetes 集群 [%s] 已保存的 YAML 编排方案列表 (共 %d 项) ===\n", serverID, len(records)))
		} else {
			sb.WriteString(fmt.Sprintf("=== Kubernetes 全部已保存的 YAML 编排方案列表 (共 %d 项) ===\n", len(records)))
		}
		for i, r := range records {
			statusText := "已部署 (deployed)"
			if r.Status == "not_deployed" {
				statusText = "未部署/已下线 (not_deployed)"
			}
			sb.WriteString(fmt.Sprintf("%d. [%s] 状态: %s\n", i+1, r.Name, statusText))
			sb.WriteString(fmt.Sprintf("   - 记录ID: %s\n", r.ID))
			sb.WriteString(fmt.Sprintf("   - 集群ID: %s\n", r.ServerID))
			sb.WriteString(fmt.Sprintf("   - 命名空间: %s\n", r.Namespace))
			sb.WriteString(fmt.Sprintf("   - 资源概览: %s\n", r.ResourcesSummary))
			sb.WriteString(fmt.Sprintf("   - 最近更新: %s\n", r.UpdatedAt))
		}
		return sb.String(), nil

	case "apply":
		if mgr == nil {
			return "", fmt.Errorf("Kubernetes 管理器不可用")
		}
		serverID, err := resolveK8sServerID(mgr, input.ServerID)
		if err != nil {
			return "", err
		}

		yamlContent := strings.TrimSpace(input.YamlContent)
		if yamlContent == "" {
			return "", fmt.Errorf("action 为 apply 时，yaml_content 不能为空")
		}

		cli, err := mgr.GetClient(serverID)
		if err != nil {
			return "", err
		}

		applyCtx, cancel := context.WithTimeout(ctx, 90*time.Second)
		defer cancel()

		results, applyErr := cli.ApplyYAML(applyCtx, yamlContent)
		if applyErr != nil {
			return "", fmt.Errorf("YAML 声明式部署失败: %w", applyErr)
		}

		hasSuccess := false
		var failureMessages []string
		for _, r := range results {
			if r.Action == "created" || r.Action == "configured" {
				hasSuccess = true
			} else if r.Action == "failed" {
				failureMessages = append(failureMessages, fmt.Sprintf("%s/%s: %s", r.Kind, r.Name, r.Message))
			}
		}

		if !hasSuccess && len(results) > 0 {
			return "", fmt.Errorf("所有资源均应用失败: %s", strings.Join(failureMessages, "; "))
		}

		// 总是自动落盘保存至客户端本地「YAML 编排」列表
		resList, resSummary := k8s.ParseYAMLResourceSummaries(yamlContent)
		name := strings.TrimSpace(input.Name)
		if name == "" {
			if len(resList) > 0 && resList[0].Name != "" {
				name = resList[0].Name
			} else {
				name = fmt.Sprintf("k8s-orchestration-%d", time.Now().Unix())
			}
		}

		ns := strings.TrimSpace(input.Namespace)
		if ns == "" || ns == "_all" {
			for _, r := range resList {
				if r.Namespace != "" {
					ns = r.Namespace
					break
				}
			}
		}
		if ns == "" || ns == "_all" {
			if active := GetActiveConnection(); active != nil && active.Protocol == "k8s" && active.Namespace != "" {
				ns = active.Namespace
			} else {
				ns = "default"
			}
		}

		var recordID string
		if store != nil {
			// 如果已有同名编排方案，沿用其 ID 更新覆盖
			for _, existing := range store.ListK8sOrchestrationRecords(serverID) {
				if existing.Name == name {
					recordID = existing.ID
					break
				}
			}

			rec := core.K8sOrchestrationRecord{
				ID:               recordID,
				ServerID:         serverID,
				Name:             name,
				Namespace:        ns,
				YamlContent:      yamlContent,
				Status:           "deployed",
				Resources:        resList,
				ResourcesSummary: resSummary,
			}
			saved, saveErr := store.SaveK8sOrchestrationRecord(rec)
			if saveErr == nil && saved != nil {
				recordID = saved.ID
			}
		}

		var sb strings.Builder
		sb.WriteString(fmt.Sprintf("✅ Kubernetes YAML 编排方案 [%s] 声明式部署成功！\n", name))
		if recordID != "" {
			sb.WriteString(fmt.Sprintf("📌 已同步落盘保存至客户端「YAML 编排」列表 (记录 ID: %s，状态: deployed)\n", recordID))
		}
		sb.WriteString(fmt.Sprintf("📊 资源应用清单 (共 %d 项，%s):\n", len(results), resSummary))
		for _, r := range results {
			statusIcon := "🟢"
			if r.Action == "failed" {
				statusIcon = "🔴"
			}
			sb.WriteString(fmt.Sprintf("  %s [%s] %s/%s in namespace [%s]", statusIcon, strings.ToUpper(r.Action), r.Kind, r.Name, r.Namespace))
			if r.Message != "" {
				sb.WriteString(fmt.Sprintf(" (信息: %s)", r.Message))
			}
			sb.WriteString("\n")
		}

		return sb.String(), nil

	case "delete":
		if mgr == nil {
			return "", fmt.Errorf("Kubernetes 管理器不可用")
		}
		serverID, err := resolveK8sServerID(mgr, input.ServerID)
		if err != nil {
			return "", err
		}

		yamlContent := strings.TrimSpace(input.YamlContent)
		var targetRecord *core.K8sOrchestrationRecord
		if yamlContent == "" && input.RecordID != "" && store != nil {
			rec, err := store.GetK8sOrchestrationRecord(input.RecordID)
			if err == nil && rec != nil {
				targetRecord = rec
				yamlContent = rec.YamlContent
			}
		}

		if yamlContent == "" {
			return "", fmt.Errorf("action 为 delete 时，必须提供 yaml_content 或有效的 record_id")
		}

		cli, err := mgr.GetClient(serverID)
		if err != nil {
			return "", err
		}

		delCtx, cancel := context.WithTimeout(ctx, 90*time.Second)
		defer cancel()

		results, delErr := cli.DeleteYAML(delCtx, yamlContent)
		if delErr != nil {
			return "", fmt.Errorf("声明式下线资源失败: %w", delErr)
		}

		// 同步将本地编排记录更新为 not_deployed
		if store != nil {
			if targetRecord != nil {
				targetRecord.Status = "not_deployed"
				_, _ = store.SaveK8sOrchestrationRecord(*targetRecord)
			} else {
				// 尝试匹配同名或相同内容的已有记录更新状态
				name := strings.TrimSpace(input.Name)
				for _, rec := range store.ListK8sOrchestrationRecords(serverID) {
					if (name != "" && rec.Name == name) || (input.RecordID != "" && rec.ID == input.RecordID) {
						rec.Status = "not_deployed"
						_, _ = store.SaveK8sOrchestrationRecord(rec)
						break
					}
				}
			}
		}

		var sb strings.Builder
		sb.WriteString("🗑️ Kubernetes YAML 编排资源下线完成！\n")
		sb.WriteString(fmt.Sprintf("📊 资源清理明细 (共 %d 项):\n", len(results)))
		for _, r := range results {
			statusIcon := "⚪"
			if r.Action == "failed" {
				statusIcon = "🔴"
			}
			sb.WriteString(fmt.Sprintf("  %s [%s] %s/%s in namespace [%s]", statusIcon, strings.ToUpper(r.Action), r.Kind, r.Name, r.Namespace))
			if r.Message != "" {
				sb.WriteString(fmt.Sprintf(" (信息: %s)", r.Message))
			}
			sb.WriteString("\n")
		}

		return sb.String(), nil

	default:
		return "", fmt.Errorf("不支持的编排操作: %s。支持的 action 包括: apply、delete、list", input.Action)
	}
}

func parseKubectlExecInput(input *K8sExecInput) (string, string, string, []string, error) {
	rawCmd := strings.TrimSpace(input.Command)
	namespace := strings.TrimSpace(input.Namespace)
	if namespace == "" {
		namespace = "default"
	}
	podName := strings.TrimSpace(input.PodName)
	containerName := strings.TrimSpace(input.ContainerName)

	if strings.HasPrefix(strings.ToLower(rawCmd), "kubectl exec") || strings.HasPrefix(strings.ToLower(rawCmd), "exec ") {
		parts := strings.Fields(rawCmd)
		if len(parts) > 0 && strings.EqualFold(parts[0], "kubectl") {
			parts = parts[1:]
		}
		if len(parts) > 0 && strings.EqualFold(parts[0], "exec") {
			parts = parts[1:]
		}

		var cmdParts []string
		inCmd := false
		for i := 0; i < len(parts); i++ {
			p := parts[i]
			if p == "--" {
				inCmd = true
				continue
			}
			if inCmd {
				cmdParts = append(cmdParts, p)
				continue
			}
			if p == "-it" || p == "-i" || p == "-t" {
				continue
			} else if (p == "-n" || p == "--namespace") && i+1 < len(parts) {
				namespace = parts[i+1]
				i++
			} else if (p == "-c" || p == "--container") && i+1 < len(parts) {
				containerName = parts[i+1]
				i++
			} else if podName == "" && !strings.HasPrefix(p, "-") {
				podName = p
			} else {
				cmdParts = append(cmdParts, parts[i:]...)
				break
			}
		}

		if podName == "" {
			return "", "", "", nil, fmt.Errorf("未指定目标 Pod 名称")
		}
		if len(cmdParts) == 0 {
			return "", "", "", nil, fmt.Errorf("未指定要在 Pod 内执行的命令")
		}
		fullCmd := strings.Join(cmdParts, " ")
		return namespace, podName, containerName, []string{"sh", "-c", fullCmd}, nil
	}

	if podName == "" {
		return "", "", "", nil, fmt.Errorf("未指定目标 Pod 名称 (pod_name)")
	}
	if rawCmd == "" {
		return "", "", "", nil, fmt.Errorf("未指定要在 Pod 内执行的命令 (command)")
	}

	return namespace, podName, containerName, []string{"sh", "-c", rawCmd}, nil
}

func executeKubectlCLI(ctx context.Context, cli *k8s.K8sClient, rawCmd string) (string, error) {
	// 去除开头的 "kubectl" 关键字
	parts := strings.Fields(rawCmd)
	if len(parts) > 0 && strings.EqualFold(parts[0], "kubectl") {
		parts = parts[1:]
	}
	if len(parts) == 0 {
		return "", fmt.Errorf("缺少子命令，例如 get, logs, describe, scale, delete 等")
	}

	sub := strings.ToLower(parts[0])

	switch sub {
	case "get":
		return handleKubectlGet(ctx, cli, parts[1:])

	case "logs":
		return handleKubectlLogs(ctx, cli, parts[1:])

	case "describe":
		if len(parts) < 3 {
			return "", fmt.Errorf("用法: kubectl describe <kind> <name> [-n <namespace>]")
		}
		kind := parts[1]
		name := parts[2]
		namespace := extractNamespaceFlag(parts[3:], "default")
		return cli.GetResourceYAML(ctx, kind, namespace, name)

	case "scale":
		// kubectl scale deployment <name> --replicas=<n> [-n <ns>]
		var name string
		replicas := 1
		namespace := "default"
		for i := 1; i < len(parts); i++ {
			arg := parts[i]
			if strings.HasPrefix(arg, "--replicas=") {
				if r, err := strconv.Atoi(strings.TrimPrefix(arg, "--replicas=")); err == nil {
					replicas = r
				}
			} else if (arg == "-n" || arg == "--namespace") && i+1 < len(parts) {
				namespace = parts[i+1]
				i++
			} else if !strings.HasPrefix(arg, "-") && strings.ToLower(arg) != "deployment" && strings.ToLower(arg) != "deploy" {
				name = arg
			}
		}
		if name == "" {
			return "", fmt.Errorf("用法: kubectl scale deployment <name> --replicas=<n> [-n <namespace>]")
		}
		if err := cli.ScaleDeployment(ctx, namespace, name, int32(replicas)); err != nil {
			return "", err
		}
		return fmt.Sprintf("deployment.apps/%s scaled (replicas: %d, namespace: %s)", name, replicas, namespace), nil

	case "rollout":
		// kubectl rollout restart deployment <name> [-n <ns>]
		if len(parts) < 4 || strings.ToLower(parts[1]) != "restart" {
			return "", fmt.Errorf("用法: kubectl rollout restart deployment <name> [-n <namespace>]")
		}
		name := parts[3]
		namespace := extractNamespaceFlag(parts[4:], "default")
		if err := cli.RestartDeployment(ctx, namespace, name); err != nil {
			return "", err
		}
		return fmt.Sprintf("deployment.apps/%s restarted (namespace: %s)", name, namespace), nil

	case "delete":
		if len(parts) < 3 {
			return "", fmt.Errorf("用法: kubectl delete <pod|deployment|service|namespace> <name> [-n <namespace>]")
		}
		kind := strings.ToLower(parts[1])
		name := parts[2]
		namespace := extractNamespaceFlag(parts[3:], "default")
		switch kind {
		case "pod", "po":
			if err := cli.DeletePod(ctx, namespace, name); err != nil {
				return "", err
			}
			return fmt.Sprintf("pod \"%s\" deleted (namespace: %s)", name, namespace), nil
		case "deployment", "deploy":
			if err := cli.DeleteDeployment(ctx, namespace, name); err != nil {
				return "", err
			}
			return fmt.Sprintf("deployment.apps \"%s\" deleted (namespace: %s)", name, namespace), nil
		case "service", "svc":
			if err := cli.DeleteService(ctx, namespace, name); err != nil {
				return "", err
			}
			return fmt.Sprintf("service \"%s\" deleted (namespace: %s)", name, namespace), nil
		case "namespace", "ns":
			if err := cli.DeleteNamespace(ctx, name); err != nil {
				return "", err
			}
			return fmt.Sprintf("namespace \"%s\" deleted", name), nil
		default:
			return "", fmt.Errorf("暂不支持通过 CLI 删除类型 %s", kind)
		}

	case "apply":
		// kubectl apply -f <yaml>
		yamlIdx := strings.Index(rawCmd, "-f")
		if yamlIdx == -1 {
			return "", fmt.Errorf("用法: kubectl apply -f <yaml_content>")
		}
		yamlContent := strings.TrimSpace(rawCmd[yamlIdx+2:])
		if yamlContent == "" {
			return "", fmt.Errorf("未提供 YAML 清单内容")
		}
		results, err := cli.ApplyYAML(ctx, yamlContent)
		if err != nil {
			return "", err
		}
		var sb strings.Builder
		for _, r := range results {
			if r.Message != "" {
				sb.WriteString(fmt.Sprintf("%s/%s %s: %s\n", strings.ToLower(r.Kind), r.Name, r.Action, r.Message))
			} else {
				sb.WriteString(fmt.Sprintf("%s/%s %s\n", strings.ToLower(r.Kind), r.Name, r.Action))
			}
		}
		return strings.TrimRight(sb.String(), "\n"), nil

	case "version", "cluster-info":
		overview, err := cli.GetOverview(ctx)
		if err != nil {
			return "", err
		}
		data, _ := json.MarshalIndent(overview, "", "  ")
		return string(data), nil

	default:
		return "", fmt.Errorf("未知或暂不支持的 Kubectl 子命令: %s (支持 get, logs, describe, scale, rollout restart, delete, apply -f, cluster-info, version)", sub)
	}
}

func extractNamespaceFlag(args []string, defaultNs string) string {
	for i := 0; i < len(args); i++ {
		if (args[i] == "-n" || args[i] == "--namespace") && i+1 < len(args) {
			return args[i+1]
		}
		if strings.HasPrefix(args[i], "--namespace=") {
			return strings.TrimPrefix(args[i], "--namespace=")
		}
		if args[i] == "-A" || args[i] == "--all-namespaces" {
			return ""
		}
	}
	return defaultNs
}

func handleKubectlGet(ctx context.Context, cli *k8s.K8sClient, args []string) (string, error) {
	if len(args) == 0 {
		return "", fmt.Errorf("用法: kubectl get <pods|nodes|deployments|services|namespaces|configmaps|secrets|pvcs> [-n <ns>] [-A]")
	}
	resource := strings.ToLower(args[0])
	namespace := extractNamespaceFlag(args[1:], "")

	switch resource {
	case "pods", "pod", "po":
		list, err := cli.ListPods(ctx, namespace)
		if err != nil {
			return "", err
		}
		return formatK8sPodsTable(list), nil

	case "nodes", "node", "no":
		list, err := cli.ListNodes(ctx)
		if err != nil {
			return "", err
		}
		return formatK8sNodesTable(list), nil

	case "deployments", "deployment", "deploy":
		list, err := cli.ListDeployments(ctx, namespace)
		if err != nil {
			return "", err
		}
		return formatK8sDeploymentsTable(list), nil

	case "services", "service", "svc":
		list, err := cli.ListServices(ctx, namespace)
		if err != nil {
			return "", err
		}
		return formatK8sServicesTable(list), nil

	case "namespaces", "namespace", "ns":
		list, err := cli.ListNamespaces(ctx)
		if err != nil {
			return "", err
		}
		return formatK8sNamespacesTable(list), nil

	case "configmaps", "configmap", "cm":
		list, err := cli.ListConfigMaps(ctx, namespace)
		if err != nil {
			return "", err
		}
		return formatK8sConfigMapsTable(list), nil

	case "secrets", "secret":
		list, err := cli.ListSecrets(ctx, namespace)
		if err != nil {
			return "", err
		}
		return formatK8sSecretsTable(list), nil

	case "pvcs", "pvc":
		list, err := cli.ListPVCs(ctx, namespace)
		if err != nil {
			return "", err
		}
		return formatK8sPVCsTable(list), nil

	default:
		return "", fmt.Errorf("暂不支持查询资源类型: %s (支持 pods, nodes, deployments, services, namespaces, configmaps, secrets, pvcs)", resource)
	}
}

func handleKubectlLogs(ctx context.Context, cli *k8s.K8sClient, args []string) (string, error) {
	if len(args) == 0 {
		return "", fmt.Errorf("用法: kubectl logs <pod_name> [-n <namespace>] [-c <container>] [--tail <n>]")
	}
	var podName string
	var containerName string
	namespace := "default"
	tail := 100
	timestamps := false

	for i := 0; i < len(args); i++ {
		arg := args[i]
		if (arg == "-n" || arg == "--namespace") && i+1 < len(args) {
			namespace = args[i+1]
			i++
		} else if (arg == "-c" || arg == "--container") && i+1 < len(args) {
			containerName = args[i+1]
			i++
		} else if (arg == "--tail" || arg == "-n") && i+1 < len(args) {
			if t, err := strconv.Atoi(args[i+1]); err == nil {
				tail = t
			}
			i++
		} else if arg == "-t" || arg == "--timestamps" {
			timestamps = true
		} else if !strings.HasPrefix(arg, "-") {
			podName = arg
		}
	}

	if podName == "" {
		return "", fmt.Errorf("未指定 Pod 名称")
	}

	return cli.GetPodLogs(ctx, namespace, podName, containerName, tail, timestamps)
}

func formatK8sPodsTable(list []k8s.K8sPodInfo) string {
	if len(list) == 0 {
		return "没有匹配的 Pod"
	}
	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("%-20s %-35s %-10s %-12s %-10s %-16s %s\n", "NAMESPACE", "NAME", "READY", "STATUS", "RESTARTS", "IP", "NODE"))
	for _, p := range list {
		sb.WriteString(fmt.Sprintf("%-20s %-35s %-10s %-12s %-10d %-16s %s\n", p.Namespace, p.Name, p.Ready, p.Status, p.Restarts, p.IP, p.NodeName))
	}
	return strings.TrimRight(sb.String(), "\n")
}

func formatK8sNodesTable(list []k8s.K8sNodeInfo) string {
	if len(list) == 0 {
		return "没有节点"
	}
	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("%-30s %-10s %-15s %-20s %s\n", "NAME", "STATUS", "ROLES", "VERSION", "INTERNAL-IP"))
	for _, n := range list {
		status := n.Status
		if status == "" {
			status = "Ready"
		}
		sb.WriteString(fmt.Sprintf("%-30s %-10s %-15s %-20s %s\n", n.Name, status, n.Roles, n.KubeletVersion, n.InternalIP))
	}
	return strings.TrimRight(sb.String(), "\n")
}

func formatK8sDeploymentsTable(list []k8s.K8sDeploymentInfo) string {
	if len(list) == 0 {
		return "没有匹配的 Deployment"
	}
	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("%-20s %-30s %-10s %-10s %-10s %s\n", "NAMESPACE", "NAME", "READY", "UP-TO-DATE", "AVAILABLE", "CREATED"))
	for _, d := range list {
		ready := fmt.Sprintf("%d/%d", d.ReadyReplicas, d.Replicas)
		sb.WriteString(fmt.Sprintf("%-20s %-30s %-10s %-10d %-10d %s\n", d.Namespace, d.Name, ready, d.UpdatedReplicas, d.AvailableReplicas, d.CreatedAt))
	}
	return strings.TrimRight(sb.String(), "\n")
}

func formatK8sServicesTable(list []k8s.K8sServiceInfo) string {
	if len(list) == 0 {
		return "没有匹配的 Service"
	}
	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("%-20s %-30s %-15s %-16s %s\n", "NAMESPACE", "NAME", "TYPE", "CLUSTER-IP", "PORTS"))
	for _, s := range list {
		sb.WriteString(fmt.Sprintf("%-20s %-30s %-15s %-16s %s\n", s.Namespace, s.Name, s.Type, s.ClusterIP, strings.Join(s.Ports, ",")))
	}
	return strings.TrimRight(sb.String(), "\n")
}

func formatK8sNamespacesTable(list []k8s.K8sNamespaceInfo) string {
	if len(list) == 0 {
		return "没有命名空间"
	}
	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("%-30s %-12s %s\n", "NAME", "STATUS", "CREATED"))
	for _, ns := range list {
		sb.WriteString(fmt.Sprintf("%-30s %-12s %s\n", ns.Name, ns.Status, ns.CreatedAt))
	}
	return strings.TrimRight(sb.String(), "\n")
}

func formatK8sConfigMapsTable(list []k8s.K8sConfigMapInfo) string {
	if len(list) == 0 {
		return "没有 ConfigMap"
	}
	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("%-20s %-35s %-8s %s\n", "NAMESPACE", "NAME", "DATA", "CREATED"))
	for _, cm := range list {
		sb.WriteString(fmt.Sprintf("%-20s %-35s %-8d %s\n", cm.Namespace, cm.Name, cm.DataCount, cm.CreatedAt))
	}
	return strings.TrimRight(sb.String(), "\n")
}

func formatK8sSecretsTable(list []k8s.K8sSecretInfo) string {
	if len(list) == 0 {
		return "没有 Secret"
	}
	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("%-20s %-35s %-25s %-8s %s\n", "NAMESPACE", "NAME", "TYPE", "DATA", "CREATED"))
	for _, s := range list {
		sb.WriteString(fmt.Sprintf("%-20s %-35s %-25s %-8d %s\n", s.Namespace, s.Name, s.Type, s.DataCount, s.CreatedAt))
	}
	return strings.TrimRight(sb.String(), "\n")
}

func formatK8sPVCsTable(list []k8s.K8sPVCInfo) string {
	if len(list) == 0 {
		return "没有 PersistentVolumeClaim"
	}
	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("%-20s %-30s %-10s %-15s %-12s %s\n", "NAMESPACE", "NAME", "STATUS", "VOLUME", "CAPACITY", "STORAGECLASS"))
	for _, pvc := range list {
		sb.WriteString(fmt.Sprintf("%-20s %-30s %-10s %-15s %-12s %s\n", pvc.Namespace, pvc.Name, pvc.Status, pvc.VolumeName, pvc.Capacity, pvc.StorageClass))
	}
	return strings.TrimRight(sb.String(), "\n")
}
