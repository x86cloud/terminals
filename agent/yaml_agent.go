package agent

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"terminal/agent/router"

	"github.com/cloudwego/eino/schema"
)

// GenerateK8sYAML 使用专职的 YAML 生成 Agent 根据用户选定的命名空间、Kind、指定的镜像与业务需求生成标准 Kubernetes YAML 清单。
func GenerateK8sYAML(ctx context.Context, namespace string, kinds []string, images []string, userPrompt string) (string, error) {
	if DefaultRuntime == nil || DefaultRuntime.Router == nil {
		return "", errors.New("Agent 运行环境未就绪")
	}

	modelRes, err := DefaultRuntime.Router.Resolve(ctx, router.RoleDefault)
	if err != nil || modelRes == nil || modelRes.Model == nil {
		return "", errors.New("AI 模型未配置或无效，请在「系统设置 -> AI 智能体」中配置 API Key 与模型信息")
	}

	timeoutCtx, cancel := context.WithTimeout(ctx, 3*time.Minute)
	defer cancel()

	if strings.TrimSpace(namespace) == "" {
		namespace = "default"
	}

	kindStr := "Deployment, Service"
	if len(kinds) > 0 {
		kindStr = strings.Join(kinds, ", ")
	}

	imageStr := "由模型根据需求推荐或默认通用镜像"
	if len(images) > 0 {
		var validImages []string
		for _, img := range images {
			if trimmed := strings.TrimSpace(img); trimmed != "" {
				validImages = append(validImages, trimmed)
			}
		}
		if len(validImages) > 0 {
			imageStr = strings.Join(validImages, ", ")
		}
	}

	if strings.TrimSpace(userPrompt) == "" {
		userPrompt = "请根据选定的命名空间、资源类型与指定镜像生成标准、通用的配置模板。"
	}

	systemPrompt := `你是一位顶尖的云原生 SRE 与 Kubernetes 架构专家，专职编写符合工业级规范、生产就绪的 Kubernetes YAML 资源定义清单。
【编写规范】:
1. 严格按照 Kubernetes 最新稳定版本 API 规范编写（如 Deployment 使用 apps/v1, Service 使用 v1, Ingress 使用 networking.k8s.io/v1, PVC 使用 v1 等）。
2. 对于命名空间级资源，必须在 metadata 中准确声明 namespace（如指定的 namespace 不是集群全局资源）。
3. 如果指定了容器镜像，必须在 Pod/Deployment/StatefulSet/DaemonSet 等工作负载中准确使用指定的容器镜像；若指定了多个镜像，合理配置为多容器 Pod 或主从/Sidecar 架构。
4. 如果生成多个关联资源，必须使用 "---" 规范分隔。
5. 保证资源命名、labels、selector、ports、volumeMounts 等前后关联完全一致对齐。
6. 在关键配置处添加清晰易读的中文注释（如副本数、端口、存储挂载点、探针配置等）。
7. 包含合理的健康检查探针 (livenessProbe/readinessProbe) 与资源配置最佳实践。
8. 直接输出纯 YAML 内容，不要输出任何多余的开场白、总结说明或 Markdown 外部文字（输出的内容将被直接填入代码编辑器中）。`

	userContent := fmt.Sprintf("请根据以下要求生成标准 Kubernetes YAML 资源清单：\n【目标命名空间 (Namespace)】: %s\n【需要包含的资源类型 (Kinds)】: %s\n【指定的容器镜像 (Images)】: %s\n【业务具体需求描述】: %s", namespace, kindStr, imageStr, userPrompt)

	messages := []*schema.Message{
		schema.SystemMessage(systemPrompt),
		schema.UserMessage(userContent),
	}

	resp, err := modelRes.Model.Generate(timeoutCtx, messages)
	if err != nil {
		if errors.Is(err, context.DeadlineExceeded) || strings.Contains(strings.ToLower(err.Error()), "deadline exceeded") || strings.Contains(strings.ToLower(err.Error()), "timeout") {
			return "", errors.New("AI 生成 YAML 超时 (超过 3 分钟)，模型深度推理或网络响应缓慢，请重试或在「系统设置 -> AI 智能体」中检查模型配置")
		}
		return "", fmt.Errorf("AI 生成 YAML 失败: %w", err)
	}
	if resp == nil || strings.TrimSpace(resp.Content) == "" {
		return "", errors.New("模型返回内容为空，请重试")
	}

	clean := strings.TrimSpace(resp.Content)
	// 去除可能存在的 markdown 代码块包裹
	if strings.HasPrefix(clean, "```yaml") {
		clean = strings.TrimPrefix(clean, "```yaml")
	} else if strings.HasPrefix(clean, "```yml") {
		clean = strings.TrimPrefix(clean, "```yml")
	} else if strings.HasPrefix(clean, "```") {
		clean = strings.TrimPrefix(clean, "```")
	}
	clean = strings.TrimSuffix(clean, "```")
	clean = strings.TrimSpace(clean)

	return clean, nil
}
