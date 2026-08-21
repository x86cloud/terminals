package tools

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"

	"terminal/agent/guard"

	"github.com/cloudwego/eino/components/tool/utils"
)

type WorkspaceManager struct {
	mu  sync.RWMutex
	dir string
}

func NewWorkspaceManager(dir string) *WorkspaceManager {
	return &WorkspaceManager{dir: dir}
}

func (wm *WorkspaceManager) SetDir(dir string) {
	wm.mu.Lock()
	defer wm.mu.Unlock()
	wm.dir = dir
}

func (wm *WorkspaceManager) GetDir() string {
	wm.mu.RLock()
	defer wm.mu.RUnlock()
	return wm.dir
}

func (wm *WorkspaceManager) ResolvePath(targetPath string) (string, error) {
	dir := wm.GetDir()
	if dir == "" {
		return "", fmt.Errorf("当前未设置工作目录，请先在右上角或设置中选择工作目录")
	}

	cleanedDir := filepath.Clean(dir)
	var fullPath string
	if filepath.IsAbs(targetPath) {
		fullPath = filepath.Clean(targetPath)
	} else {
		fullPath = filepath.Clean(filepath.Join(cleanedDir, targetPath))
	}

	rel, err := filepath.Rel(cleanedDir, fullPath)
	if err != nil || strings.HasPrefix(rel, "..") {
		return "", fmt.Errorf("【路径越权拦截】: 目标路径 %s 超出了绑定的工作区目录沙箱", targetPath)
	}

	return fullPath, nil
}

// ---------------------- Input / Output Schemas ----------------------

type ReadFileInput struct {
	Path      string `json:"path" jsonschema:"description=文件的相对路径（基于项目根目录），如 'src/utils/auth.ts'"`
	StartLine int    `json:"start_line,omitempty" jsonschema:"description=起始行号（从 1 开始计数，可选）"`
	EndLine   int    `json:"end_line,omitempty" jsonschema:"description=结束行号（包含该行，可选）"`
}

type ReadFileOutput struct {
	Path       string `json:"path"`
	TotalLines int    `json:"total_lines"`
	StartLine  int    `json:"start_line"`
	EndLine    int    `json:"end_line"`
	Content    string `json:"content"`
}

type CreateFileInput struct {
	Path      string `json:"path" jsonschema:"description=待创建文件的相对路径，如 'src/components/Button.vue'"`
	Content   string `json:"content" jsonschema:"description=文件的初始内容"`
	Overwrite bool   `json:"overwrite,omitempty" jsonschema:"description=是否强制覆盖已存在的文件，默认 false"`
}

type CreateFileOutput struct {
	Path         string `json:"path"`
	Success      bool   `json:"success"`
	BytesWritten int    `json:"bytes_written"`
	Message      string `json:"message"`
}

type ApplyFilePatchInput struct {
	Path       string `json:"path" jsonschema:"description=待修改文件的相对路径"`
	OldContent string `json:"old_content" jsonschema:"description=需要被替换的原始内容片段（需包含足够上下文以保证唯一性）"`
	NewContent string `json:"new_content" jsonschema:"description=用于替换的新内容片段"`
}

type ApplyFilePatchOutput struct {
	Path    string `json:"path"`
	Success bool   `json:"success"`
	Message string `json:"message"`
}

type MoveFileInput struct {
	SourcePath      string `json:"source_path" jsonschema:"description=源文件相对路径"`
	DestinationPath string `json:"destination_path" jsonschema:"description=目标文件相对路径"`
	Overwrite       bool   `json:"overwrite,omitempty" jsonschema:"description=若目标路径已存在文件是否覆盖，默认 false"`
}

type MoveFileOutput struct {
	SourcePath      string `json:"source_path"`
	DestinationPath string `json:"destination_path"`
	Success         bool   `json:"success"`
	Message         string `json:"message"`
}

type DeleteFileInput struct {
	Path string `json:"path" jsonschema:"description=待删除文件的相对路径"`
}

type DeleteFileOutput struct {
	Path    string `json:"path"`
	Success bool   `json:"success"`
	Message string `json:"message"`
}

type ListDirInput struct {
	Path   string   `json:"path,omitempty" jsonschema:"description=要查看的相对子目录路径，留空表示工作区根目录"`
	Depth  int      `json:"depth,omitempty" jsonschema:"description=目录遍历的最大递归深度，默认为 2（1 表示仅当前目录直接子项）"`
	Ignore []string `json:"ignore,omitempty" jsonschema:"description=额外需要忽略的文件或目录模式列表，如 ['*.tmp', 'coverage']"`
}

type ListDirOutput struct {
	Workspace  string `json:"workspace"`
	RelPath    string `json:"rel_path"`
	MaxDepth   int    `json:"max_depth"`
	TotalFiles int    `json:"total_files"`
	TotalDirs  int    `json:"total_dirs"`
	Tree       string `json:"tree"`
}

type SearchFilesInput struct {
	Query string `json:"query" jsonschema:"description=搜寻的文件名关键字或文本关键词"`
}

type SearchMatch struct {
	Path string `json:"path"`
}

type SearchFilesOutput struct {
	Query   string        `json:"query"`
	Matches []SearchMatch `json:"matches"`
}

// ---------------------- Directory Tree Helpers ----------------------

var defaultIgnoreDirs = map[string]bool{
	"node_modules": true,
	"vendor":       true,
	".git":         true,
	".idea":        true,
	".vscode":      true,
	"dist":         true,
	"build":        true,
	"target":       true,
	"bin":          true,
	"obj":          true,
	"__pycache__":  true,
	".next":        true,
	".nuxt":        true,
	".turbo":       true,
	".cache":       true,
	".DS_Store":    true,
}

func isIgnored(name string, customIgnores []string) bool {
	if defaultIgnoreDirs[name] {
		return true
	}
	for _, pattern := range customIgnores {
		pattern = strings.TrimSpace(pattern)
		if pattern == "" {
			continue
		}
		if name == pattern {
			return true
		}
		if matched, _ := filepath.Match(pattern, name); matched {
			return true
		}
	}
	return false
}

func buildDirTree(dirPath string, currentDepth, maxDepth int, customIgnores []string, prefix string, totalFiles, totalDirs *int, sb *strings.Builder) error {
	entries, err := os.ReadDir(dirPath)
	if err != nil {
		return err
	}

	var filtered []os.DirEntry
	for _, e := range entries {
		if isIgnored(e.Name(), customIgnores) {
			continue
		}
		filtered = append(filtered, e)
	}

	sort.Slice(filtered, func(i, j int) bool {
		iDir := filtered[i].IsDir()
		jDir := filtered[j].IsDir()
		if iDir != jDir {
			return iDir // directories first
		}
		return strings.ToLower(filtered[i].Name()) < strings.ToLower(filtered[j].Name())
	})

	n := len(filtered)
	for i, entry := range filtered {
		isLast := (i == n-1)
		branch := "├── "
		subPrefix := prefix + "│   "
		if isLast {
			branch = "└── "
			subPrefix = prefix + "    "
		}

		name := entry.Name()
		if entry.IsDir() {
			*totalDirs++
			sb.WriteString(prefix + branch + name + "/\n")
			if currentDepth < maxDepth {
				subPath := filepath.Join(dirPath, name)
				_ = buildDirTree(subPath, currentDepth+1, maxDepth, customIgnores, subPrefix, totalFiles, totalDirs, sb)
			} else {
				subEntries, err := os.ReadDir(filepath.Join(dirPath, name))
				if err == nil {
					subCount := 0
					for _, se := range subEntries {
						if !isIgnored(se.Name(), customIgnores) {
							subCount++
						}
					}
					if subCount > 0 {
						sb.WriteString(subPrefix + fmt.Sprintf("└── ... (%d 项未展开)\n", subCount))
					}
				}
			}
		} else {
			*totalFiles++
			sb.WriteString(prefix + branch + name + "\n")
		}
	}
	return nil
}

// ---------------------- Tool Registrations ----------------------

func RegisterWorkspaceTools(bus *ToolBus, wm *WorkspaceManager) error {
	// 1. read_file
	readTool, err := utils.InferTool("read_file", "读取指定文件的内容。对于代码文件，建议通过 start_line 和 end_line 进行分段/局部读取。每行附带行号。",
		func(ctx context.Context, input *ReadFileInput) (*ReadFileOutput, error) {
			fullPath, err := wm.ResolvePath(input.Path)
			if err != nil {
				return nil, err
			}
			rawBytes, err := os.ReadFile(fullPath)
			if err != nil {
				return nil, fmt.Errorf("读取文件 [%s] 失败: %w", input.Path, err)
			}

			contentStr := strings.ReplaceAll(string(rawBytes), "\r\n", "\n")
			lines := strings.Split(contentStr, "\n")
			totalLines := len(lines)

			startLine := input.StartLine
			if startLine < 1 {
				startLine = 1
			}
			endLine := input.EndLine
			if endLine <= 0 || endLine > totalLines {
				endLine = totalLines
			}
			if startLine > totalLines {
				return &ReadFileOutput{
					Path:       input.Path,
					TotalLines: totalLines,
					StartLine:  startLine,
					EndLine:    endLine,
					Content:    "(超出文件总行数，内容为空)",
				}, nil
			}
			if startLine > endLine {
				startLine = endLine
			}

			var sb strings.Builder
			for i := startLine; i <= endLine; i++ {
				sb.WriteString(fmt.Sprintf("%4d | %s\n", i, lines[i-1]))
			}

			return &ReadFileOutput{
				Path:       input.Path,
				TotalLines: totalLines,
				StartLine:  startLine,
				EndLine:    endLine,
				Content:    sb.String(),
			}, nil
		})
	if err != nil {
		return err
	}
	bus.Register(&RegisteredTool{
		Name:        "read_file",
		Description: "读取指定文件的内容。对于代码文件，建议通过 start_line 和 end_line 进行分段/局部读取。每行附带行号。",
		BaseTool:    readTool,
		Level:       guard.LevelAllow,
	})

	// 2. create_file
	createTool, err := utils.InferTool("create_file", "创建一个新文件并写入初始内容。若目标文件已存在且未指定 overwrite 则会报错以防止意外覆盖。",
		func(ctx context.Context, input *CreateFileInput) (*CreateFileOutput, error) {
			fullPath, err := wm.ResolvePath(input.Path)
			if err != nil {
				return nil, err
			}
			if _, err := os.Stat(fullPath); err == nil && !input.Overwrite {
				return nil, fmt.Errorf("目标文件 [%s] 已存在，若要覆盖请指定 overwrite: true", input.Path)
			}
			dir := filepath.Dir(fullPath)
			if err := os.MkdirAll(dir, 0o755); err != nil {
				return nil, fmt.Errorf("创建文件父目录失败: %w", err)
			}
			if err := os.WriteFile(fullPath, []byte(input.Content), 0o644); err != nil {
				return nil, fmt.Errorf("写入文件失败: %w", err)
			}
			return &CreateFileOutput{
				Path:         input.Path,
				Success:      true,
				BytesWritten: len(input.Content),
				Message:      fmt.Sprintf("成功创建文件 [%s] (%d 字节)", input.Path, len(input.Content)),
			}, nil
		})
	if err != nil {
		return err
	}
	bus.Register(&RegisteredTool{
		Name:        "create_file",
		Description: "创建一个新文件并写入初始内容。若目标文件已存在且未指定 overwrite 则会报错以防止意外覆盖。",
		BaseTool:    createTool,
		Level:       guard.LevelAllow,
	})

	// 3. apply_file_patch
	patchTool, err := utils.InferTool("apply_file_patch", "通过匹配唯一的旧代码块并替换为新代码块来修改已有文件。要求 old_content 在目标文件中必须唯一匹配。",
		func(ctx context.Context, input *ApplyFilePatchInput) (*ApplyFilePatchOutput, error) {
			fullPath, err := wm.ResolvePath(input.Path)
			if err != nil {
				return nil, err
			}
			rawBytes, err := os.ReadFile(fullPath)
			if err != nil {
				return nil, fmt.Errorf("读取目标文件 [%s] 失败: %w", input.Path, err)
			}
			original := string(rawBytes)

			count := strings.Count(original, input.OldContent)
			if count == 0 {
				normOriginal := strings.ReplaceAll(original, "\r\n", "\n")
				normOld := strings.ReplaceAll(input.OldContent, "\r\n", "\n")
				count = strings.Count(normOriginal, normOld)
				if count == 0 {
					return nil, fmt.Errorf("未在文件 [%s] 中找到匹配的 old_content 代码片段，请确认代码与上下文", input.Path)
				}
				if count > 1 {
					return nil, fmt.Errorf("old_content 在文件 [%s] 中匹配到 %d 处，请提供更多上下文行以保证唯一匹配", input.Path, count)
				}
				normNew := strings.ReplaceAll(input.NewContent, "\r\n", "\n")
				replaced := strings.Replace(normOriginal, normOld, normNew, 1)
				if err := os.WriteFile(fullPath, []byte(replaced), 0o644); err != nil {
					return nil, fmt.Errorf("写入 Patch 结果失败: %w", err)
				}
				return &ApplyFilePatchOutput{
					Path:    input.Path,
					Success: true,
					Message: fmt.Sprintf("成功为文件 [%s] 应用局部代码 Patch 补丁", input.Path),
				}, nil
			}

			if count > 1 {
				return nil, fmt.Errorf("old_content 在文件 [%s] 中匹配到 %d 处，请提供更多上下文行以保证唯一匹配", input.Path, count)
			}

			replaced := strings.Replace(original, input.OldContent, input.NewContent, 1)
			if err := os.WriteFile(fullPath, []byte(replaced), 0o644); err != nil {
				return nil, fmt.Errorf("写入 Patch 结果失败: %w", err)
			}
			return &ApplyFilePatchOutput{
				Path:    input.Path,
				Success: true,
				Message: fmt.Sprintf("成功为文件 [%s] 应用局部代码 Patch 补丁", input.Path),
			}, nil
		})
	if err != nil {
		return err
	}
	bus.Register(&RegisteredTool{
		Name:        "apply_file_patch",
		Description: "通过匹配唯一的旧代码块并替换为新代码块来修改已有文件。要求 old_content 在目标文件中必须唯一匹配。",
		BaseTool:    patchTool,
		Level:       guard.LevelAllow,
	})

	// 4. move_file
	moveTool, err := utils.InferTool("move_file", "重命名文件或将其移动到新路径。可自动创建目标目录。",
		func(ctx context.Context, input *MoveFileInput) (*MoveFileOutput, error) {
			srcFull, err := wm.ResolvePath(input.SourcePath)
			if err != nil {
				return nil, err
			}
			dstFull, err := wm.ResolvePath(input.DestinationPath)
			if err != nil {
				return nil, err
			}
			if _, err := os.Stat(srcFull); os.IsNotExist(err) {
				return nil, fmt.Errorf("源文件 [%s] 不存在", input.SourcePath)
			}
			if _, err := os.Stat(dstFull); err == nil && !input.Overwrite {
				return nil, fmt.Errorf("目标路径 [%s] 已存在文件，若要覆盖请指定 overwrite: true", input.DestinationPath)
			}
			dstDir := filepath.Dir(dstFull)
			if err := os.MkdirAll(dstDir, 0o755); err != nil {
				return nil, fmt.Errorf("创建目标父目录失败: %w", err)
			}
			if err := os.Rename(srcFull, dstFull); err != nil {
				return nil, fmt.Errorf("移动文件失败: %w", err)
			}
			return &MoveFileOutput{
				SourcePath:      input.SourcePath,
				DestinationPath: input.DestinationPath,
				Success:         true,
				Message:         fmt.Sprintf("成功将 [%s] 移动/重命名至 [%s]", input.SourcePath, input.DestinationPath),
			}, nil
		})
	if err != nil {
		return err
	}
	bus.Register(&RegisteredTool{
		Name:        "move_file",
		Description: "重命名文件或将其移动到新路径。可自动创建目标目录。",
		BaseTool:    moveTool,
		Level:       guard.LevelConfirm,
	})

	// 5. delete_file
	deleteTool, err := utils.InferTool("delete_file", "删除工作目录内的指定文件或目录。",
		func(ctx context.Context, input *DeleteFileInput) (*DeleteFileOutput, error) {
			fullPath, err := wm.ResolvePath(input.Path)
			if err != nil {
				return nil, err
			}
			if _, err := os.Stat(fullPath); os.IsNotExist(err) {
				return nil, fmt.Errorf("文件 [%s] 不存在", input.Path)
			}
			if err := os.RemoveAll(fullPath); err != nil {
				return nil, fmt.Errorf("删除失败: %w", err)
			}
			return &DeleteFileOutput{
				Path:    input.Path,
				Success: true,
				Message: fmt.Sprintf("成功删除文件 [%s]", input.Path),
			}, nil
		})
	if err != nil {
		return err
	}
	bus.Register(&RegisteredTool{
		Name:        "delete_file",
		Description: "删除工作目录内的指定文件或目录。",
		BaseTool:    deleteTool,
		Level:       guard.LevelConfirm,
	})

	// 6. list_dir
	listTool, err := utils.InferTool("list_dir", "以 ASCII 树形结构查看工作目录下的文件和子目录。支持 depth 递归深度控制（默认 2）与智能忽略（默认过滤 node_modules、vendor、.git、dist 等）。",
		func(ctx context.Context, input *ListDirInput) (*ListDirOutput, error) {
			targetRel := ""
			maxDepth := 2
			var customIgnores []string
			if input != nil {
				targetRel = input.Path
				if input.Depth > 0 {
					maxDepth = input.Depth
				}
				customIgnores = input.Ignore
			}
			fullPath, err := wm.ResolvePath(targetRel)
			if err != nil {
				return nil, err
			}
			fileInfo, err := os.Stat(fullPath)
			if err != nil {
				return nil, fmt.Errorf("路径 [%s] 不存在: %w", targetRel, err)
			}
			if !fileInfo.IsDir() {
				return nil, fmt.Errorf("路径 [%s] 是文件而不是目录", targetRel)
			}

			totalFiles := 0
			totalDirs := 0
			var sb strings.Builder

			rootTitle := targetRel
			if rootTitle == "" || rootTitle == "." {
				rootTitle = "."
			} else {
				rootTitle = strings.TrimSuffix(rootTitle, "/") + "/"
			}
			sb.WriteString(rootTitle + "\n")

			if err := buildDirTree(fullPath, 1, maxDepth, customIgnores, "", &totalFiles, &totalDirs, &sb); err != nil {
				return nil, fmt.Errorf("遍历目录树失败: %w", err)
			}

			return &ListDirOutput{
				Workspace:  wm.GetDir(),
				RelPath:    targetRel,
				MaxDepth:   maxDepth,
				TotalFiles: totalFiles,
				TotalDirs:  totalDirs,
				Tree:       sb.String(),
			}, nil
		})
	if err != nil {
		return err
	}
	bus.Register(&RegisteredTool{
		Name:        "list_dir",
		Description: "以 ASCII 树形结构查看工作目录下的文件和子目录。支持 depth 递归深度控制（默认 2）与智能忽略（默认过滤 node_modules、vendor、.git、dist 等）。",
		BaseTool:    listTool,
		Level:       guard.LevelAllow,
	})

	// 7. search_files
	searchTool, err := utils.InferTool("search_files", "在工作目录内搜索文件名或指定关键字。",
		func(ctx context.Context, input *SearchFilesInput) (*SearchFilesOutput, error) {
			rootDir := wm.GetDir()
			if rootDir == "" {
				return nil, fmt.Errorf("未设置工作目录")
			}
			var matches []SearchMatch
			q := strings.ToLower(input.Query)

			_ = filepath.Walk(rootDir, func(path string, info os.FileInfo, err error) error {
				if err != nil || len(matches) >= 50 {
					return nil
				}
				rel, _ := filepath.Rel(rootDir, path)
				if rel == "." || strings.HasPrefix(rel, ".") || strings.Contains(rel, "node_modules") || strings.Contains(rel, ".git") {
					if info != nil && info.IsDir() && rel != "." {
						return filepath.SkipDir
					}
					return nil
				}
				if strings.Contains(strings.ToLower(info.Name()), q) || strings.Contains(strings.ToLower(rel), q) {
					matches = append(matches, SearchMatch{Path: rel})
				}
				return nil
			})

			return &SearchFilesOutput{
				Query:   input.Query,
				Matches: matches,
			}, nil
		})
	if err != nil {
		return err
	}
	bus.Register(&RegisteredTool{
		Name:        "search_files",
		Description: "在工作目录内搜索文件名或指定关键字。",
		BaseTool:    searchTool,
		Level:       guard.LevelAllow,
	})

	return nil
}
