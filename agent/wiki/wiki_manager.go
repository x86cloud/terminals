package wiki

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"sync"

	"terminal/agent/router"
	"terminal/core"

	"github.com/cloudwego/eino/schema"
)

var (
	wikiMu sync.RWMutex
)

// WikiNode 树状导航节点定义 (与通用树组件对齐)
type WikiNode struct {
	ID        string     `json:"id"`
	Name      string     `json:"name"`
	RelPath   string     `json:"rel_path"`
	IsFolder  bool       `json:"is_folder"`
	Size      int64      `json:"size,omitempty"`
	UpdatedAt int64      `json:"updated_at"`
	Children  []WikiNode `json:"children,omitempty"`
}

// WikiCatalogItem 紧凑目录清单项，用于 System Prompt 注入与极速索引
type WikiCatalogItem struct {
	RelPath   string `json:"rel_path"`
	Title     string `json:"title"`
	Summary   string `json:"summary"`
	UpdatedAt int64  `json:"updated_at"`
}

// GetWikiDir 获取本地 Wiki 知识库根目录路径
func GetWikiDir() (string, error) {
	configDir, err := core.AppConfigDir()
	if err != nil {
		return "", err
	}
	wikiDir := filepath.Join(configDir, "wiki")
	if err := os.MkdirAll(wikiDir, 0o755); err != nil {
		return "", fmt.Errorf("创建 Wiki 目录失败: %w", err)
	}

	// 若首次创建为空目录，写入初始引导说明
	entries, _ := os.ReadDir(wikiDir)
	if len(entries) == 0 {
		initContent := `# 知识库 (LLM Wiki)

欢迎使用基于 **LLM Wiki（Compilation over Retrieval）** 理念构建的自进化知识库！

## 💡 核心理念
- **编译演进而非检索**：AI 在排障与对话过程中，会将关键环境参数、配置、故障诊断 SOP 结构化沉淀到此知识库，并持续修补迭代已有文档。
- **纯文本 Markdown**：所有知识均为纯本地 Markdown 文件，位于本地配置目录中，您可随时通过外部编辑器（如 Obsidian、VSCode）自由阅读与协同编辑。
- **双向协同**：您可以让 AI“将排障经验整理到 Wiki”，也可以在主界面左侧随时新建分类与文档。

---
`
		_ = os.WriteFile(filepath.Join(wikiDir, "README.md"), []byte(initContent), 0o644)
	}

	return wikiDir, nil
}

// resolveSafePath 路径安全校验，防止路径穿越
func resolveSafePath(relPath string) (string, string, error) {
	wikiDir, err := GetWikiDir()
	if err != nil {
		return "", "", err
	}

	// 统一转为斜杠清理
	cleanedRel := filepath.Clean(strings.TrimSpace(relPath))
	cleanedRel = strings.TrimPrefix(cleanedRel, "/" )
	cleanedRel = strings.TrimPrefix(cleanedRel, "\\" )

	if cleanedRel == "." || cleanedRel == "" {
		return wikiDir, "", nil
	}

	if strings.HasPrefix(cleanedRel, "..") || strings.Contains(cleanedRel, ":") {
		return "", "", fmt.Errorf("非法路径穿越尝试: %s", relPath)
	}

	fullPath := filepath.Join(wikiDir, cleanedRel)
	// 再次校验完整路径前缀
	if !strings.HasPrefix(filepath.Clean(fullPath), filepath.Clean(wikiDir)) {
		return "", "", fmt.Errorf("非法路径越界: %s", relPath)
	}

	// 统一相对路径格式为正斜杠便于跨平台与前端展示
	normalizedRel := filepath.ToSlash(cleanedRel)
	return fullPath, normalizedRel, nil
}

// OpenWikiDir 在操作系统文件管理器中打开 Wiki 本地目录
func OpenWikiDir() error {
	dir, err := GetWikiDir()
	if err != nil {
		return err
	}

	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "windows":
		cmd = exec.Command("explorer", dir)
	case "darwin":
		cmd = exec.Command("open", dir)
	default:
		cmd = exec.Command("xdg-open", dir)
	}
	return cmd.Start()
}

// ListTree 递归列出 Wiki 文档树
func ListTree() ([]WikiNode, error) {
	wikiMu.RLock()
	defer wikiMu.RUnlock()

	wikiDir, err := GetWikiDir()
	if err != nil {
		return nil, err
	}

	var walk func(currentDir string, relBase string) ([]WikiNode, error)
	walk = func(currentDir string, relBase string) ([]WikiNode, error) {
		entries, err := os.ReadDir(currentDir)
		if err != nil {
			return nil, err
		}

		var folders []WikiNode
		var files []WikiNode

		for _, entry := range entries {
			name := entry.Name()
			if strings.HasPrefix(name, ".") {
				continue // 忽略隐藏文件
			}

			subRel := name
			if relBase != "" {
				subRel = relBase + "/" + name
			}
			fullPath := filepath.Join(currentDir, name)
			info, err := entry.Info()
			if err != nil {
				continue
			}

			if entry.IsDir() {
				children, err := walk(fullPath, subRel)
				if err != nil {
					children = []WikiNode{}
				}
				folders = append(folders, WikiNode{
					ID:        "folder:" + subRel,
					Name:      name,
					RelPath:   subRel,
					IsFolder:  true,
					UpdatedAt: info.ModTime().UnixMilli(),
					Children:  children,
				})
			} else {
				if !strings.HasSuffix(strings.ToLower(name), ".md") {
					continue // 仅处理 Markdown 文件
				}
				files = append(files, WikiNode{
					ID:        "file:" + subRel,
					Name:      name,
					RelPath:   subRel,
					IsFolder:  false,
					Size:      info.Size(),
					UpdatedAt: info.ModTime().UnixMilli(),
				})
			}
		}

		sort.Slice(folders, func(i, j int) bool {
			return folders[i].Name < folders[j].Name
		})
		sort.Slice(files, func(i, j int) bool {
			return files[i].Name < files[j].Name
		})

		return append(folders, files...), nil
	}

	return walk(wikiDir, "")
}

// GetCatalog 提取紧凑的 Wiki 目录与摘要列表，供 LLM 上下文感知
func GetCatalog() ([]WikiCatalogItem, error) {
	wikiMu.RLock()
	defer wikiMu.RUnlock()

	wikiDir, err := GetWikiDir()
	if err != nil {
		return nil, err
	}

	var catalog []WikiCatalogItem

	err = filepath.WalkDir(wikiDir, func(path string, d os.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return nil
		}
		name := d.Name()
		if strings.HasPrefix(name, ".") || !strings.HasSuffix(strings.ToLower(name), ".md") {
			return nil
		}

		rel, err := filepath.Rel(wikiDir, path)
		if err != nil {
			return nil
		}
		rel = filepath.ToSlash(rel)

		file, err := os.Open(path)
		if err != nil {
			return nil
		}
		defer file.Close()

		info, _ := d.Info()
		var modTime int64
		if info != nil {
			modTime = info.ModTime().UnixMilli()
		}

		scanner := bufio.NewScanner(file)
		var title string
		var summaryBuilder strings.Builder

		for scanner.Scan() {
			line := strings.TrimSpace(scanner.Text())
			if line == "" {
				continue
			}
			if title == "" && strings.HasPrefix(line, "#") {
				title = strings.TrimSpace(strings.TrimLeft(line, "#"))
				continue
			}
			if !strings.HasPrefix(line, "#") && !strings.HasPrefix(line, "---") {
				if summaryBuilder.Len() < 120 {
					if summaryBuilder.Len() > 0 {
						summaryBuilder.WriteString(" ")
					}
					summaryBuilder.WriteString(line)
				}
			}
		}

		if title == "" {
			title = strings.TrimSuffix(name, filepath.Ext(name))
		}
		summary := summaryBuilder.String()
		if len(summary) > 120 {
			summary = summary[:120] + "..."
		}

		catalog = append(catalog, WikiCatalogItem{
			RelPath:   rel,
			Title:     title,
			Summary:   summary,
			UpdatedAt: modTime,
		})
		return nil
	})

	if err != nil {
		return nil, err
	}

	sort.Slice(catalog, func(i, j int) bool {
		return catalog[i].RelPath < catalog[j].RelPath
	})

	return catalog, nil
}

// ReadPage 读取指定 Markdown 页面完整内容
func ReadPage(relPath string) (string, error) {
	wikiMu.RLock()
	defer wikiMu.RUnlock()

	fullPath, _, err := resolveSafePath(relPath)
	if err != nil {
		return "", err
	}

	data, err := os.ReadFile(fullPath)
	if err != nil {
		return "", fmt.Errorf("读取文档失败: %w", err)
	}
	return string(data), nil
}

// SavePage 保存或覆写指定 Markdown 页面
func SavePage(relPath string, content string) error {
	wikiMu.Lock()
	defer wikiMu.Unlock()

	fullPath, _, err := resolveSafePath(relPath)
	if err != nil {
		return err
	}

	parent := filepath.Dir(fullPath)
	if err := os.MkdirAll(parent, 0o755); err != nil {
		return fmt.Errorf("创建父级目录失败: %w", err)
	}

	if err := os.WriteFile(fullPath, []byte(content), 0o644); err != nil {
		return fmt.Errorf("写入文档失败: %w", err)
	}

	core.EmitEvent("wiki:tree-updated", nil)
	return nil
}

// CreateNode 创建新文档或新目录
func CreateNode(parentPath string, name string, isFolder bool) (string, error) {
	wikiMu.Lock()
	defer wikiMu.Unlock()

	name = strings.TrimSpace(name)
	if name == "" {
		return "", fmt.Errorf("名称不能为空")
	}
	if strings.ContainsAny(name, `\/:"*?<>|`) {
		return "", fmt.Errorf("名称包含非法字符")
	}

	if !isFolder && !strings.HasSuffix(strings.ToLower(name), ".md") {
		name = name + ".md"
	}

	targetRel := name
	if parentPath != "" && parentPath != "__root__" && parentPath != "." {
		targetRel = filepath.ToSlash(filepath.Join(parentPath, name))
	}

	fullPath, safeRel, err := resolveSafePath(targetRel)
	if err != nil {
		return "", err
	}

	if _, err := os.Stat(fullPath); err == nil {
		return "", fmt.Errorf("已存在同名文档或目录: %s", safeRel)
	}

	if isFolder {
		if err := os.MkdirAll(fullPath, 0o755); err != nil {
			return "", fmt.Errorf("创建目录失败: %w", err)
		}
	} else {
		parent := filepath.Dir(fullPath)
		_ = os.MkdirAll(parent, 0o755)
		initialDoc := fmt.Sprintf("# %s\n\n", strings.TrimSuffix(name, ".md"))
		if err := os.WriteFile(fullPath, []byte(initialDoc), 0o644); err != nil {
			return "", fmt.Errorf("创建文档失败: %w", err)
		}
	}

	core.EmitEvent("wiki:tree-updated", nil)
	return safeRel, nil
}

// RenameNode 重命名或移动文档/目录
func RenameNode(oldRelPath string, newRelPath string) error {
	wikiMu.Lock()
	defer wikiMu.Unlock()

	oldFull, _, err := resolveSafePath(oldRelPath)
	if err != nil {
		return err
	}
	newFull, _, err := resolveSafePath(newRelPath)
	if err != nil {
		return err
	}

	if _, err := os.Stat(oldFull); err != nil {
		return fmt.Errorf("原文档或目录不存在: %s", oldRelPath)
	}

	parent := filepath.Dir(newFull)
	_ = os.MkdirAll(parent, 0o755)

	if err := os.Rename(oldFull, newFull); err != nil {
		return fmt.Errorf("重命名失败: %w", err)
	}

	core.EmitEvent("wiki:tree-updated", nil)
	return nil
}

// DeleteNode 删除文档或目录
func DeleteNode(relPath string) error {
	wikiMu.Lock()
	defer wikiMu.Unlock()

	fullPath, safeRel, err := resolveSafePath(relPath)
	if err != nil {
		return err
	}
	if safeRel == "" {
		return fmt.Errorf("不能删除根目录")
	}

	if err := os.RemoveAll(fullPath); err != nil {
		return fmt.Errorf("删除失败: %w", err)
	}

	core.EmitEvent("wiki:tree-updated", nil)
	return nil
}

// CompileSession 提炼会话中的关键资产，并自动合并/新建到 Wiki
func CompileSession(ctx context.Context, r *router.ModelRouter, sessionID string, convText string) (string, error) {
	if r == nil || strings.TrimSpace(convText) == "" {
		return "", nil
	}

	catalog, err := GetCatalog()
	if err != nil {
		catalog = []WikiCatalogItem{}
	}

	catalogJSON, _ := json.MarshalIndent(catalog, "", "  ")

	prompt := fmt.Sprintf(`你是一个遵循 Andrej Karpathy "LLM Wiki (Compilation over Retrieval)" 理念的知识库编译器。
任务：请分析以下运维/开发会话内容，提炼出有长期沉淀价值的主机配置、故障排障 SOP、架构参数或环境规律。
请参考当前已有的 Wiki 知识库目录，决定是将知识融合合并到已有的页面中（推荐），还是创建新的页面。

【当前 Wiki 目录索引】:
%s

【对话排障记录】:
%s

请严格输出纯 JSON 格式（不要输出 markdown 解释）：
{
  "target_page": "相对路径，如 servers/prod-mysql.md 或 playbooks/oom-fix.md",
  "action": "update (融合更新已有文档) 或 create (新建文档)",
  "page_title": "文档标题",
  "compiled_markdown": "整合后的完整 Markdown 内容（若是 update，请结合已有文档结构，融合新增事实、修正过时信息，产出更新后的完整篇章）",
  "summary": "本次更新/沉淀的要点总结(一句话)"
}`, string(catalogJSON), convText)

	res, err := r.Resolve(ctx, router.RoleDefault)
	if err != nil || res == nil || res.Model == nil {
		return "", fmt.Errorf("获取语言模型失败: %w", err)
	}

	resp, err := res.Model.Generate(ctx, []*schema.Message{
		schema.SystemMessage("你是专业的知识库编译专家。只输出纯 JSON，不输出任何额外文本。"),
		schema.UserMessage(prompt),
	})
	if err != nil || resp == nil || resp.Content == "" {
		return "", fmt.Errorf("生成 Wiki 编译内容失败: %w", err)
	}

	clean := strings.TrimSpace(resp.Content)
	clean = strings.TrimPrefix(clean, "```json")
	clean = strings.TrimPrefix(clean, "```")
	clean = strings.TrimSuffix(clean, "```")
	clean = strings.TrimSpace(clean)

	var result struct {
		TargetPage       string `json:"target_page"`
		Action           string `json:"action"`
		PageTitle        string `json:"page_title"`
		CompiledMarkdown string `json:"compiled_markdown"`
		Summary          string `json:"summary"`
	}

	if err := json.Unmarshal([]byte(clean), &result); err != nil {
		return "", fmt.Errorf("解析模型返回的 Wiki 编译数据失败: %w", err)
	}

	if result.TargetPage == "" || strings.TrimSpace(result.CompiledMarkdown) == "" {
		return "会话未发现值得固化的新知识资产", nil
	}

	if !strings.HasSuffix(strings.ToLower(result.TargetPage), ".md") {
		result.TargetPage += ".md"
	}

	if err := SavePage(result.TargetPage, result.CompiledMarkdown); err != nil {
		return "", fmt.Errorf("保存编译后的 Wiki 页面失败: %w", err)
	}

	return fmt.Sprintf("已成功编译沉淀至 Wiki 页面 [%s]: %s", result.TargetPage, result.Summary), nil
}
