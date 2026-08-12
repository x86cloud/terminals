package agent

import (
	"context"
	"fmt"
	"regexp"
	"time"

	"github.com/cloudwego/eino/components/tool"
	"github.com/cloudwego/eino/schema"
)

type PermissionLevel string

const (
	PermissionLevelReadOnly    PermissionLevel = "read_only"
	PermissionLevelUserConfirm PermissionLevel = "user_confirm"
	PermissionLevelForbidden   PermissionLevel = "forbidden"
)

type ToolPermissionRule struct {
	ToolName    string
	Level       PermissionLevel
	Description string
	AuditFunc   func(ctx context.Context, input string) (PermissionLevel, string)
}

type PermissionGuard struct {
	enableGuard           bool
	blockHighRiskCommands bool
	rules                 map[string]ToolPermissionRule
	wm                    *WorkspaceManager
}

func NewPermissionGuard(enableGuard, blockHighRiskCommands bool, wm *WorkspaceManager) *PermissionGuard {
	guard := &PermissionGuard{
		enableGuard:           enableGuard,
		blockHighRiskCommands: blockHighRiskCommands,
		rules:                 make(map[string]ToolPermissionRule),
		wm:                    wm,
	}
	guard.initDefaultRules()
	return guard
}

func (g *PermissionGuard) initDefaultRules() {
	// 1. Workspace tools
	g.rules["workspace_list_dir"] = ToolPermissionRule{
		ToolName:    "workspace_list_dir",
		Level:       PermissionLevelReadOnly,
		Description: "查看工作目录文件列表",
	}
	g.rules["workspace_read_file"] = ToolPermissionRule{
		ToolName:    "workspace_read_file",
		Level:       PermissionLevelReadOnly,
		Description: "读取工作目录文本文件内容",
	}
	g.rules["workspace_search"] = ToolPermissionRule{
		ToolName:    "workspace_search",
		Level:       PermissionLevelReadOnly,
		Description: "搜索工作目录文件名与关键字",
	}
	g.rules["workspace_write_file"] = ToolPermissionRule{
		ToolName:    "workspace_write_file",
		Level:       PermissionLevelUserConfirm,
		Description: "在工作目录写入或新建文件",
	}
	g.rules["workspace_delete"] = ToolPermissionRule{
		ToolName:    "workspace_delete",
		Level:       PermissionLevelUserConfirm,
		Description: "在工作目录删除文件或文件夹",
	}

	// 2. Web search tool
	g.rules["web_search"] = ToolPermissionRule{
		ToolName:    "web_search",
		Level:       PermissionLevelReadOnly,
		Description: "在互联网检索网页与实时新闻",
	}

	// 3. SSH tools
	g.rules["ssh_list_sessions"] = ToolPermissionRule{
		ToolName:    "ssh_list_sessions",
		Level:       PermissionLevelReadOnly,
		Description: "列出当前连通的 SSH 会话列表",
	}
	g.rules["ssh_get_system_info"] = ToolPermissionRule{
		ToolName:    "ssh_get_system_info",
		Level:       PermissionLevelReadOnly,
		Description: "查询远程服务器 CPU、内存、磁盘与系统负载",
	}
	g.rules["ssh_list_dir"] = ToolPermissionRule{
		ToolName:    "ssh_list_dir",
		Level:       PermissionLevelReadOnly,
		Description: "查看远程服务器文件目录结构",
	}
	g.rules["ssh_read_file"] = ToolPermissionRule{
		ToolName:    "ssh_read_file",
		Level:       PermissionLevelReadOnly,
		Description: "读取远程服务器文件内容",
	}
	g.rules["ssh_download_file"] = ToolPermissionRule{
		ToolName:    "ssh_download_file",
		Level:       PermissionLevelReadOnly,
		Description: "从远程服务器下载文件至本地工作目录",
	}
	g.rules["ssh_list_processes"] = ToolPermissionRule{
		ToolName:    "ssh_list_processes",
		Level:       PermissionLevelReadOnly,
		Description: "查看远程服务器运行的进程列表",
	}
	g.rules["ssh_list_containers"] = ToolPermissionRule{
		ToolName:    "ssh_list_containers",
		Level:       PermissionLevelReadOnly,
		Description: "查看远程服务器 Docker 容器列表",
	}

	g.rules["ssh_write_file"] = ToolPermissionRule{
		ToolName:    "ssh_write_file",
		Level:       PermissionLevelUserConfirm,
		Description: "在远程服务器写入或修改文件",
	}
	g.rules["ssh_delete_file"] = ToolPermissionRule{
		ToolName:    "ssh_delete_file",
		Level:       PermissionLevelUserConfirm,
		Description: "在远程服务器删除文件或目录",
	}
	g.rules["ssh_upload_file"] = ToolPermissionRule{
		ToolName:    "ssh_upload_file",
		Level:       PermissionLevelUserConfirm,
		Description: "上传本地工作目录文件至远程服务器",
	}

	g.rules["ssh_exec_command"] = ToolPermissionRule{
		ToolName:    "ssh_exec_command",
		Level:       PermissionLevelUserConfirm,
		Description: "在远程服务器执行 Shell 命令行",
		AuditFunc:   g.auditShellCommand,
	}
}

func (g *PermissionGuard) auditShellCommand(ctx context.Context, input string) (PermissionLevel, string) {
	if !g.blockHighRiskCommands {
		return PermissionLevelUserConfirm, ""
	}

	highRiskRegexes := []*regexp.Regexp{
		regexp.MustCompile(`(?i)\brm\s+-[rRfF]*\s+/*\s*$`),
		regexp.MustCompile(`(?i)\brm\s+-[rRfF]*\s+/(etc|boot|bin|usr|lib|var|dev|sys|proc|sbin)\b`),
		regexp.MustCompile(`(?i)\bmkfs(\.\w+)?\b`),
		regexp.MustCompile(`(?i)\bdd\s+if=.*of=/dev/`),
		regexp.MustCompile(`(?i)\b(reboot|shutdown|init\s+0|poweroff)\b`),
		regexp.MustCompile(`(?i)>\s*/dev/sd[a-z]`),
		regexp.MustCompile(`:\(\)\{\s*:\|\:&\s*\};:`),
	}

	for _, re := range highRiskRegexes {
		if re.MatchString(input) {
			return PermissionLevelForbidden, fmt.Sprintf("动作命中了极高风险 Shell 命令规则 (%s)，已被权限审查模块自动拦截", re.String())
		}
	}

	return PermissionLevelUserConfirm, ""
}

func (g *PermissionGuard) Audit(ctx context.Context, toolName string, input string) (PermissionLevel, string) {
	if !g.enableGuard {
		return PermissionLevelReadOnly, ""
	}

	rule, ok := g.rules[toolName]
	if !ok {
		return PermissionLevelUserConfirm, ""
	}

	if rule.AuditFunc != nil {
		lvl, reason := rule.AuditFunc(ctx, input)
		if lvl != "" {
			return lvl, reason
		}
	}

	return rule.Level, ""
}

type PermissionWrappedTool struct {
	target tool.InvokableTool
	rule   ToolPermissionRule
	guard  *PermissionGuard
}

func (w *PermissionWrappedTool) Info(ctx context.Context) (*schema.ToolInfo, error) {
	return w.target.Info(ctx)
}

func (w *PermissionWrappedTool) InvokableRun(ctx context.Context, input string, opts ...tool.Option) (string, error) {
	info, _ := w.target.Info(ctx)
	toolName := ""
	if info != nil {
		toolName = info.Name
	}

	lvl, reason := w.guard.Audit(ctx, toolName, input)

	switch lvl {
	case PermissionLevelForbidden:
		return "", fmt.Errorf("【权限审查模块拦截】操作拒绝: %s", reason)

	case PermissionLevelUserConfirm:
		if w.guard.wm != nil {
			confirmID := fmt.Sprintf("guard_%d", time.Now().UnixNano())
			descText := w.rule.Description
			if descText == "" {
				descText = toolName
			}
			desc := fmt.Sprintf("【权限审查触发】即将执行敏感操作 [%s (%s)]：\n%s", descText, toolName, input)
			approved := w.guard.wm.RequestConfirmation(ctx, confirmID, "permission_guard", toolName, desc)
			if !approved {
				return "【用户拒绝】用户在权限审查界面取消了该工具的执行操作", nil
			}
		}
		return w.target.InvokableRun(ctx, input, opts...)

	default:
		return w.target.InvokableRun(ctx, input, opts...)
	}
}

func WrapToolWithPermissionGuard(t tool.BaseTool, guard *PermissionGuard) tool.BaseTool {
	invokable, ok := t.(tool.InvokableTool)
	if !ok {
		return t
	}
	info, _ := invokable.Info(context.Background())
	toolName := ""
	if info != nil {
		toolName = info.Name
	}
	rule := guard.rules[toolName]

	return &PermissionWrappedTool{
		target: invokable,
		rule:   rule,
		guard:  guard,
	}
}
