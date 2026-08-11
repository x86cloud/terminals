package agent

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/cloudwego/eino/components/tool"
	"github.com/cloudwego/eino/components/tool/utils"
)

type WorkspaceManager struct {
	mu             sync.RWMutex
	dir            string
	confirmChanMap sync.Map // confirmID -> chan bool
	onEmitConfirm  func(confirmID, action, path, desc string)
	onEmitToolStart func(toolName, detail string)
}

var DefaultWorkspaceMgr = &WorkspaceManager{}

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

func (wm *WorkspaceManager) SetEmitConfirmFunc(fn func(confirmID, action, path, desc string)) {
	wm.mu.Lock()
	defer wm.mu.Unlock()
	wm.onEmitConfirm = fn
}

func (wm *WorkspaceManager) SetEmitToolStartFunc(fn func(toolName, detail string)) {
	wm.mu.Lock()
	defer wm.mu.Unlock()
	wm.onEmitToolStart = fn
}

func (wm *WorkspaceManager) EmitToolStart(toolName, detail string) {
	wm.mu.RLock()
	fn := wm.onEmitToolStart
	wm.mu.RUnlock()
	if fn != nil {
		fn(toolName, detail)
	}
}

func (wm *WorkspaceManager) ResolvePath(targetPath string) (string, error) {
	dir := wm.GetDir()
	if dir == "" {
		return "", fmt.Errorf("当前未设置工作空间目录，请先选择工作空间")
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
		return "", fmt.Errorf("越权操作拒绝: 目标路径 %s 超出工作空间范围", targetPath)
	}

	return fullPath, nil
}

func (wm *WorkspaceManager) ConfirmToolResponse(confirmID string, approved bool) {
	if ch, ok := wm.confirmChanMap.LoadAndDelete(confirmID); ok {
		if c, ok := ch.(chan bool); ok {
			c <- approved
		}
	}
}

func (wm *WorkspaceManager) RequestConfirmation(ctx context.Context, confirmID, action, path, description string) bool {
	ch := make(chan bool, 1)
	wm.confirmChanMap.Store(confirmID, ch)
	defer wm.confirmChanMap.Delete(confirmID)

	wm.mu.RLock()
	emitFn := wm.onEmitConfirm
	wm.mu.RUnlock()

	if emitFn != nil {
		emitFn(confirmID, action, path, description)
	}

	select {
	case approved := <-ch:
		return approved
	case <-ctx.Done():
		return false
	}
}

// ---------- Tool Input / Output Definitions ----------

type ListDirInput struct {
	Path string `json:"path" jsonschema:"description=要列出的相对路径或子目录名称。若查看根目录留空即可"`
}

type FileItem struct {
	Name  string `json:"name"`
	IsDir bool   `json:"is_dir"`
	Size  int64  `json:"size"`
}

type ListDirOutput struct {
	Workspace string     `json:"workspace"`
	RelPath   string     `json:"rel_path"`
	Items     []FileItem `json:"items"`
}

type ReadFileInput struct {
	Path string `json:"path" jsonschema:"description=要读取的文件相对路径或完整文件名"`
}

type ReadFileOutput struct {
	Path    string `json:"path"`
	Content string `json:"content"`
}

type WriteFileInput struct {
	Path    string `json:"path" jsonschema:"description=要写入或新建的文件相对路径"`
	Content string `json:"content" jsonschema:"description=要写入文件的文本内容"`
}

type WriteFileOutput struct {
	Path    string `json:"path"`
	Success bool   `json:"success"`
	Message string `json:"message"`
}

type DeleteFileInput struct {
	Path string `json:"path" jsonschema:"description=要删除的文件或文件夹相对路径"`
}

type DeleteFileOutput struct {
	Path    string `json:"path"`
	Success bool   `json:"success"`
	Message string `json:"message"`
}

type SearchInput struct {
	Query string `json:"query" jsonschema:"description=搜寻的文件名关键字或文本关键词"`
}

type SearchMatch struct {
	Path string `json:"path"`
}

type SearchOutput struct {
	Query   string        `json:"query"`
	Matches []SearchMatch `json:"matches"`
}

// BuildWorkspaceTools creates Eino invokable tools for file operations
func BuildWorkspaceTools(wm *WorkspaceManager) ([]tool.BaseTool, error) {
	listTool, err := utils.InferTool("workspace_list_dir", "查看工作空间目录下的文件和子目录列表",
		func(ctx context.Context, input *ListDirInput) (*ListDirOutput, error) {
			wm.EmitToolStart("workspace_list_dir", fmt.Sprintf("正在列出文件目录 [%s]...", input.Path))
			fullPath, err := wm.ResolvePath(input.Path)
			if err != nil {
				return nil, err
			}
			entries, err := os.ReadDir(fullPath)
			if err != nil {
				return nil, fmt.Errorf("读取目录失败: %w", err)
			}
			var items []FileItem
			for _, entry := range entries {
				info, _ := entry.Info()
				var sz int64
				if info != nil {
					sz = info.Size()
				}
				items = append(items, FileItem{
					Name:  entry.Name(),
					IsDir: entry.IsDir(),
					Size:  sz,
				})
			}
			return &ListDirOutput{
				Workspace: wm.GetDir(),
				RelPath:   input.Path,
				Items:     items,
			}, nil
		})
	if err != nil {
		return nil, err
	}

	readTool, err := utils.InferTool("workspace_read_file", "读取工作空间内指定文本文件的完整内容",
		func(ctx context.Context, input *ReadFileInput) (*ReadFileOutput, error) {
			wm.EmitToolStart("workspace_read_file", fmt.Sprintf("正在读取文件 [%s]...", input.Path))
			fullPath, err := wm.ResolvePath(input.Path)
			if err != nil {
				return nil, err
			}
			data, err := os.ReadFile(fullPath)
			if err != nil {
				return nil, fmt.Errorf("读取文件失败: %w", err)
			}
			// Limit to 200KB to avoid context overflow
			contentStr := string(data)
			if len(contentStr) > 200000 {
				contentStr = contentStr[:200000] + "\n...(文件内容过长，已被截断)"
			}
			return &ReadFileOutput{
				Path:    input.Path,
				Content: contentStr,
			}, nil
		})
	if err != nil {
		return nil, err
	}

	writeTool, err := utils.InferTool("workspace_write_file", "新建或改写工作空间内指定文本文件的内容",
		func(ctx context.Context, input *WriteFileInput) (*WriteFileOutput, error) {
			wm.EmitToolStart("workspace_write_file", fmt.Sprintf("正在写入文件 [%s]...", input.Path))
			fullPath, err := wm.ResolvePath(input.Path)
			if err != nil {
				return nil, err
			}
			dir := filepath.Dir(fullPath)
			if err := os.MkdirAll(dir, 0o755); err != nil {
				return nil, fmt.Errorf("创建文件父目录失败: %w", err)
			}
			if err := os.WriteFile(fullPath, []byte(input.Content), 0o644); err != nil {
				return nil, fmt.Errorf("写入文件失败: %w", err)
			}
			return &WriteFileOutput{
				Path:    input.Path,
				Success: true,
				Message: fmt.Sprintf("成功写入文件 [%s]", input.Path),
			}, nil
		})
	if err != nil {
		return nil, err
	}

	deleteTool, err := utils.InferTool("workspace_delete", "删除工作空间内的指定文件或目录（需要用户在界面二次确认）",
		func(ctx context.Context, input *DeleteFileInput) (*DeleteFileOutput, error) {
			wm.EmitToolStart("workspace_delete", fmt.Sprintf("正在删除 [%s]...", input.Path))
			fullPath, err := wm.ResolvePath(input.Path)
			if err != nil {
				return nil, err
			}

			confirmID := fmt.Sprintf("delete_%d", time.Now().UnixNano())
			approved := wm.RequestConfirmation(ctx, confirmID, "delete", input.Path, fmt.Sprintf("确认要删除工作空间中的文件/目录 [%s] 吗？", input.Path))
			if !approved {
				return &DeleteFileOutput{
					Path:    input.Path,
					Success: false,
					Message: "用户在界面拒绝了删除操作",
				}, nil
			}

			if err := os.RemoveAll(fullPath); err != nil {
				return nil, fmt.Errorf("删除失败: %w", err)
			}
			return &DeleteFileOutput{
				Path:    input.Path,
				Success: true,
				Message: fmt.Sprintf("成功删除 [%s]", input.Path),
			}, nil
		})
	if err != nil {
		return nil, err
	}

	searchTool, err := utils.InferTool("workspace_search", "在工作空间内搜索文件名或指定关键字",
		func(ctx context.Context, input *SearchInput) (*SearchOutput, error) {
			wm.EmitToolStart("workspace_search", fmt.Sprintf("正在搜索关键字 [%s]...", input.Query))
			rootDir := wm.GetDir()
			if rootDir == "" {
				return nil, fmt.Errorf("未设置工作空间目录")
			}
			var matches []SearchMatch
			q := strings.ToLower(input.Query)

			_ = filepath.Walk(rootDir, func(path string, info os.FileInfo, err error) error {
				if err != nil || len(matches) >= 30 {
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

			return &SearchOutput{
				Query:   input.Query,
				Matches: matches,
			}, nil
		})
	if err != nil {
		return nil, err
	}

	return []tool.BaseTool{listTool, readTool, writeTool, deleteTool, searchTool}, nil
}
