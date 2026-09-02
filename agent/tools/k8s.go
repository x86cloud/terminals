package tools

import (
	"context"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
	"terminal/agent/events"
	"terminal/agent/guard"
	"terminal/k8s"

	"github.com/cloudwego/eino/adk/filesystem"
	"github.com/cloudwego/eino/components/tool/utils"
)

type K8sKubectlExecuteInput struct {
	ServerID string `json:"server_id" jsonschema:"description=Kubernetes 集群连接 ID 或名称，若当前仅有一个连接可留空"`
	Command  string `json:"command" jsonschema:"description=要执行的 Kubectl 命令行指令，例如: kubectl get pods -n default、kubectl get nodes、kubectl logs <pod_name> -n default、kubectl describe deployment <name> -n default、kubectl scale deployment <name> --replicas=3 -n default、kubectl rollout restart deployment <name> -n default、kubectl delete pod <name> -n default、kubectl apply -f <yaml内容>、kubectl cluster-info"`
}

type K8sExecInput struct {
	ServerID      string `json:"server_id,omitempty" jsonschema:"description=Kubernetes 集群连接 ID 或名称，若当前仅有一个连接可留空"`
	Namespace     string `json:"namespace,omitempty" jsonschema:"description=目标命名空间，默认为 default"`
	PodName       string `json:"pod_name,omitempty" jsonschema:"description=目标 Pod 名称，例如: nginx-pod。若在 command 中已指定 Pod 可留空"`
	ContainerName string `json:"container_name,omitempty" jsonschema:"description=Pod 内可选目标容器名称（多容器 Pod 时使用）"`
	Command       string `json:"command" jsonschema:"description=要在 Pod 容器内执行的命令指令（例如: 'ls -la /' 或 'cat /etc/hosts'），也支持直接传入完整 CLI 如 'kubectl exec my-pod -n default -- sh -c env'"`
}

func RegisterK8sTools(bus *ToolBus, mgr *k8s.K8sManager) error {
	if mgr == nil {
		return nil
	}

	// 1. k8s_list_connections
	listConnsTool, err := utils.InferTool("k8s_list_connections", "列出当前所有已建立连接的 Kubernetes 集群实例与上下文信息",
		func(ctx context.Context, input *EmptyInput) (any, error) {
			return mgr.ListConnections(), nil
		})
	if err == nil {
		bus.Register(&RegisteredTool{
			Name:        "k8s_list_connections",
			Description: "列出当前所有已建立连接的 Kubernetes 集群实例与上下文信息",
			BaseTool:    listConnsTool,
			Level:       guard.LevelAllow,
		})
	}

	// 2. k8s_kubectl_execute
	execTool, err := utils.InferTool("k8s_kubectl_execute", "以近似原生 Kubectl CLI 方式执行 Kubernetes 集群资源查询与运维指令 (支持 get pods/nodes/deploy/svc/ns/cm/secret/pvc, logs, describe, scale, rollout restart, delete, apply -f, cluster-info, version)",
		func(ctx context.Context, input *K8sKubectlExecuteInput) (string, error) {
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

	// 3. kubectl_exec & k8s_exec (Streaming Pod exec)
	k8sExecHandler := func(ctx context.Context, input *K8sExecInput) (*filesystem.ExecuteResponse, error) {
		serverID, err := mgr.ResolveID(input.ServerID)
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

	return nil
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
