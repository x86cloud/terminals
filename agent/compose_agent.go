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

// GenerateDockerCompose 使用专职 Agent 根据指定的镜像与业务需求生成符合工业级生产规范的 docker-compose.yml 文本。
func GenerateDockerCompose(ctx context.Context, images []string, userPrompt string) (string, error) {
	if DefaultRuntime == nil || DefaultRuntime.Router == nil {
		return "", errors.New("Agent 运行环境未就绪")
	}

	modelRes, err := DefaultRuntime.Router.Resolve(ctx, router.RoleDefault)
	if err != nil || modelRes == nil || modelRes.Model == nil {
		return "", errors.New("AI 模型未配置或无效，请在「系统设置 -> AI 智能体」中配置 API Key 与模型信息")
	}

	timeoutCtx, cancel := context.WithTimeout(ctx, 3*time.Minute)
	defer cancel()

	imageStr := "由模型根据需求推荐或默认主流镜像"
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
		userPrompt = "请根据选定的镜像生成标准、生产可用的 Docker Compose 编排配置。"
	}

	systemPrompt := `你是一位顶尖的容器化与 DevOps 架构专家，专职编写符合现代 Docker Compose 规范的 docker-compose.yml 配置文件。
【编写规范】:
1. 采用通用稳定的 Docker Compose 标准语法（如 version: '3.8' 或现代 Compose Spec），顶层包含 services、volumes、networks 等必要块。
2. 为每个服务配置合理的 service 名称、container_name、image（必须准确使用用户选定或推荐的镜像及版本标签）。
3. 声明明确的端口映射 (ports: - "宿主机:容器")、环境变量 (environment) 与重启策略 (restart: unless-stopped 或 always)。
4. 如果服务涉及数据持久化（如 MySQL、PostgreSQL、Redis、MongoDB、MinIO 等），必须配置规范的持久化数据卷 (volumes) 并在顶层 volumes 区域声明具名卷或主机挂载目录。
5. 多服务之间若存在网络通信或依赖关系，使用自定义 bridge 网络 (networks) 以及 depends_on，确保各容器可通过服务名互相解析访问。
6. 生产安全与最佳实践：避免明文硬编码敏感秘钥（在注释中说明环境变量替换如 ${DB_PASSWORD}），配置合理的 healthcheck 健康检查。
7. 在关键配置处添加清晰易读的中文注释（如端口用途、挂载路径、账号密码环境变量含义等）。
8. 直接输出纯 YAML 内容，不要输出任何多余的前言、客套话、总结或 Markdown 代码块包裹（输出的内容将被直接填入代码编辑器中）。`

	userContent := fmt.Sprintf("请根据以下要求生成标准 docker-compose.yml 配置文件：\n【指定的容器镜像 (Images)】: %s\n【业务具体需求描述】: %s", imageStr, userPrompt)

	messages := []*schema.Message{
		schema.SystemMessage(systemPrompt),
		schema.UserMessage(userContent),
	}

	resp, err := modelRes.Model.Generate(timeoutCtx, messages)
	if err != nil {
		if errors.Is(err, context.DeadlineExceeded) || strings.Contains(strings.ToLower(err.Error()), "deadline exceeded") || strings.Contains(strings.ToLower(err.Error()), "timeout") {
			return "", errors.New("AI 生成 Compose 超时 (超过 3 分钟)，模型深度推理或网络响应缓慢，请重试或在「系统设置 -> AI 智能体」中检查模型配置")
		}
		return "", fmt.Errorf("AI 生成 Compose 失败: %w", err)
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
