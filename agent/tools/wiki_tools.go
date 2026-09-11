package tools

import (
	"context"
	"fmt"
	"strings"

	"terminal/agent/guard"
	"terminal/agent/router"
	"terminal/agent/wiki"

	"github.com/cloudwego/eino/components/tool/utils"
	"github.com/cloudwego/eino/schema"
)

// ---------- Wiki Tool Inputs & Outputs ----------

type WikiListInput struct {
	Keyword string `json:"keyword,omitempty" jsonschema:"description=可选过滤关键词，搜索知识库文档标题或摘要"`
}

type WikiListOutput struct {
	Total int                    `json:"total"`
	Pages []wiki.WikiCatalogItem `json:"pages"`
}

type WikiReadInput struct {
	PagePath string `json:"page_path" jsonschema:"description=要读取的 Wiki 文档相对路径 (如 servers/prod-mysql.md 或 playbooks/oom.md)"`
}

type WikiReadOutput struct {
	Path    string `json:"path"`
	Content string `json:"content"`
}

type WikiWriteInput struct {
	PagePath string `json:"page_path" jsonschema:"description=文档相对路径 (如 servers/prod.md，若无后缀将自动补 .md)"`
	Content  string `json:"content" jsonschema:"description=要写入的完整 Markdown 文档内容"`
	Summary  string `json:"summary,omitempty" jsonschema:"description=本次创建或更新的简短说明"`
}

type WikiWriteOutput struct {
	Path    string `json:"path"`
	Success bool   `json:"success"`
	Message string `json:"message"`
}

type WikiUpdateInput struct {
	PagePath       string `json:"page_path" jsonschema:"description=已有 Wiki 文档相对路径"`
	Observations   string `json:"observations,omitempty" jsonschema:"description=本次新排查发现的事实、配置变更或排障经验"`
	UpdatedContent string `json:"updated_content,omitempty" jsonschema:"description=若已准备好完整 Markdown 内容可直接传入；若留空则基于 observations 自动让大模型与已有文档进行合并提炼"`
	Summary        string `json:"summary,omitempty" jsonschema:"description=更新摘要"`
}

type WikiUpdateOutput struct {
	Path    string `json:"path"`
	Success bool   `json:"success"`
	Message string `json:"message"`
}

// RegisterWikiTools 注册 Wiki 知识库相关 Agent 工具
func RegisterWikiTools(bus *ToolBus, r *router.ModelRouter) error {
	// 1. wiki_list
	listTool, err := utils.InferTool(
		"wiki_list",
		"列出本地 Wiki 知识库的文档目录与摘要清单 (支持关键词模糊过滤)",
		func(ctx context.Context, in *WikiListInput) (*WikiListOutput, error) {
			catalog, err := wiki.GetCatalog()
			if err != nil {
				return nil, err
			}
			kw := ""
			if in != nil {
				kw = strings.ToLower(strings.TrimSpace(in.Keyword))
			}
			var filtered []wiki.WikiCatalogItem
			for _, p := range catalog {
				if kw == "" || strings.Contains(strings.ToLower(p.RelPath), kw) ||
					strings.Contains(strings.ToLower(p.Title), kw) ||
					strings.Contains(strings.ToLower(p.Summary), kw) {
					filtered = append(filtered, p)
				}
			}
			return &WikiListOutput{
				Total: len(filtered),
				Pages: filtered,
			}, nil
		},
	)
	if err != nil {
		return fmt.Errorf("初始化 wiki_list 工具失败: %w", err)
	}

	bus.Register(&RegisteredTool{
		Name:        "wiki_list",
		Description: "查看 Wiki 知识库文档目录清单与摘要",
		BaseTool:    listTool,
		Level:       guard.LevelAllow,
	})

	// 2. wiki_read
	readTool, err := utils.InferTool(
		"wiki_read",
		"读取指定 Wiki 文档的完整 Markdown 内容 (用于深入参考主机参数、环境配置或故障排查 SOP)",
		func(ctx context.Context, in *WikiReadInput) (*WikiReadOutput, error) {
			if in == nil || strings.TrimSpace(in.PagePath) == "" {
				return nil, fmt.Errorf("page_path 不能为空")
			}
			content, err := wiki.ReadPage(in.PagePath)
			if err != nil {
				return nil, err
			}
			return &WikiReadOutput{
				Path:    in.PagePath,
				Content: content,
			}, nil
		},
	)
	if err != nil {
		return fmt.Errorf("初始化 wiki_read 工具失败: %w", err)
	}

	bus.Register(&RegisteredTool{
		Name:        "wiki_read",
		Description: "读取 Wiki 文档的完整 Markdown 内容",
		BaseTool:    readTool,
		Level:       guard.LevelAllow,
	})

	// 3. wiki_write
	writeTool, err := utils.InferTool(
		"wiki_write",
		"创建新 Wiki 文档或全量覆盖已有文档",
		func(ctx context.Context, in *WikiWriteInput) (*WikiWriteOutput, error) {
			if in == nil || strings.TrimSpace(in.PagePath) == "" {
				return nil, fmt.Errorf("page_path 不能为空")
			}
			relPath := strings.TrimSpace(in.PagePath)
			if !strings.HasSuffix(strings.ToLower(relPath), ".md") {
				relPath += ".md"
			}
			if err := wiki.SavePage(relPath, in.Content); err != nil {
				return nil, err
			}
			msg := fmt.Sprintf("成功写入 Wiki 文档 [%s]", relPath)
			if in.Summary != "" {
				msg += " - " + in.Summary
			}
			return &WikiWriteOutput{
				Path:    relPath,
				Success: true,
				Message: msg,
			}, nil
		},
	)
	if err != nil {
		return fmt.Errorf("初始化 wiki_write 工具失败: %w", err)
	}

	bus.Register(&RegisteredTool{
		Name:        "wiki_write",
		Description: "创建新 Wiki 文档或全量覆写",
		BaseTool:    writeTool,
		Level:       guard.LevelAllow,
	})

	// 4. wiki_update
	updateTool, err := utils.InferTool(
		"wiki_update",
		"增量修补/融合更新已有 Wiki 文档 (遵循 LLM Wiki 编译合并理念，融入新发现事实并淘汰过时信息)",
		func(ctx context.Context, in *WikiUpdateInput) (*WikiUpdateOutput, error) {
			if in == nil || strings.TrimSpace(in.PagePath) == "" {
				return nil, fmt.Errorf("page_path 不能为空")
			}
			relPath := strings.TrimSpace(in.PagePath)
			if !strings.HasSuffix(strings.ToLower(relPath), ".md") {
				relPath += ".md"
			}

			// 若调用方已明确提供了更新后的 Markdown 内容，直接保存
			if in.UpdatedContent != "" {
				if err := wiki.SavePage(relPath, in.UpdatedContent); err != nil {
					return nil, err
				}
				return &WikiUpdateOutput{
					Path:    relPath,
					Success: true,
					Message: fmt.Sprintf("已成功更新 Wiki 文档 [%s]", relPath),
				}, nil
			}

			// 若未提供完整内容但提供了 observations，尝试读取原内容并让模型智能融合
			existingContent, _ := wiki.ReadPage(relPath)
			if r == nil {
				return nil, fmt.Errorf("模型路由器未就绪，无法自动融合，请直接提供 updated_content")
			}

			modelRes, err := r.Resolve(ctx, router.RoleDefault)
			if err != nil || modelRes == nil || modelRes.Model == nil {
				return nil, fmt.Errorf("解析模型失败: %w", err)
			}

			prompt := fmt.Sprintf(`任务：请将【新观察事实/更新信息】融合进【已有 Markdown 文档】中。
要求：
1. 保持原文档良好的 Markdown 排版与层级；
2. 合并新增的事实、配置参数或排查步骤；
3. 若新事实与原文档冲突，以最新事实为准（修改或废弃过时内容）；
4. 输出更新后的完整 Markdown 文档内容，不要包含 markdown 代码块包裹，直接输出文档内容。

【已有文档内容】:
%s

【新观察事实/更新信息】:
%s`, existingContent, in.Observations)

			resp, err := modelRes.Model.Generate(ctx, []*schema.Message{
				schema.SystemMessage("你是专业的 Wiki 知识库维护助手，精通 Markdown 与知识提炼融合。"),
				schema.UserMessage(prompt),
			})
			if err != nil || resp == nil || resp.Content == "" {
				return nil, fmt.Errorf("大模型智能融合失败: %w", err)
			}

			merged := strings.TrimSpace(resp.Content)
			if err := wiki.SavePage(relPath, merged); err != nil {
				return nil, err
			}

			return &WikiUpdateOutput{
				Path:    relPath,
				Success: true,
				Message: fmt.Sprintf("已成功将新事实融合更新至 Wiki 文档 [%s]", relPath),
			}, nil
		},
	)
	if err != nil {
		return fmt.Errorf("初始化 wiki_update 工具失败: %w", err)
	}

	bus.Register(&RegisteredTool{
		Name:        "wiki_update",
		Description: "增量修补/融合更新已有 Wiki 文档",
		BaseTool:    updateTool,
		Level:       guard.LevelAllow,
	})

	return nil
}
