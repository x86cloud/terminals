package guard

import (
	"context"
	"encoding/json"
	"fmt"
	"path"
	"path/filepath"
	"strings"

	"mvdan.cc/sh/v3/syntax"
)

// ShellAuditResult 包含 AST 解析出的详细语义特征与审计结果
type ShellAuditResult struct {
	Level      PermissionLevel
	Reason     string
	Commands   []string
	IsReadOnly bool
}

// AuditShellAST 基于 POSIX/Bash 抽象语法树对输入的 Shell 命令行执行深度安全与越权审计
func AuditShellAST(ctx context.Context, input string, blockHighRisk bool, workspaceDir string) (PermissionLevel, string) {
	clean := strings.TrimSpace(input)
	if clean == "" {
		return LevelAllow, ""
	}

	var obj struct {
		Command string `json:"command"`
		Cmd     string `json:"cmd"`
	}
	cmdText := clean
	if err := json.Unmarshal([]byte(clean), &obj); err == nil {
		if obj.Command != "" {
			cmdText = obj.Command
		} else if obj.Cmd != "" {
			cmdText = obj.Cmd
		}
	}
	cleanCmd := strings.TrimSpace(cmdText)
	if cleanCmd == "" {
		return LevelAllow, ""
	}

	res := auditShellText(cleanCmd, blockHighRisk, workspaceDir)
	return res.Level, res.Reason
}

func auditShellText(cmdText string, blockHighRisk bool, workspaceDir string) ShellAuditResult {
	// 特殊检测：经典 fork-bomb 特征字符串
	if strings.Contains(cmdText, ":(){ :|:& };:") || strings.Contains(cmdText, ":(){ :|:&};:") {
		if blockHighRisk {
			return ShellAuditResult{
				Level:  LevelForbidden,
				Reason: "禁止执行耗尽系统资源的恶意 Fork-Bomb 炸弹指令",
			}
		}
	}

	parser := syntax.NewParser()
	file, err := parser.Parse(strings.NewReader(cmdText), "")
	if err != nil {
		// 语法解析失败时执行严格的降级审查
		return auditShellFallback(cmdText, blockHighRisk, workspaceDir)
	}

	hasForbidden := false
	forbiddenReason := ""
	hasConfirm := false
	confirmReason := ""
	var detectedCommands []string

	hasWriteRedirect := false

	// 使用 syntax.Walk 深度递归遍历全语法树节点 (包括管道、子 Shell、命令替换、代码块等)
	syntax.Walk(file, func(node syntax.Node) bool {
		if node == nil || hasForbidden {
			return false
		}

		switch n := node.(type) {
		case *syntax.BinaryCmd:
			// 审查管道恶意下载执行: 如 curl ... | sh, wget ... | bash
			if n.Op == syntax.Pipe {
				leftCmd := getCallExprCmdName(n.X)
				rightCmd := getCallExprCmdName(n.Y)
				if (leftCmd == "curl" || leftCmd == "wget" || leftCmd == "nc") &&
					(rightCmd == "sh" || rightCmd == "bash" || rightCmd == "zsh" || rightCmd == "python" || rightCmd == "perl") {
					if blockHighRisk {
						hasForbidden = true
						forbiddenReason = fmt.Sprintf("禁止通过管道下载并直接执行网络未知脚本 (%s | %s)", leftCmd, rightCmd)
						return false
					}
					hasConfirm = true
					confirmReason = "检测到管道直接执行网络下载脚本，需人工审批确认"
				}
			}

		case *syntax.Redirect:
			// 审查重定向输出 (>, >>, >&, >|)
			if n.Op == syntax.RdrOut || n.Op == syntax.AppOut || n.Op == syntax.DplOut || n.Op == syntax.ClbOut {
				hasWriteRedirect = true
				target := printWord(n.Word)
				cleanTarget := strings.TrimSpace(strings.ToLower(target))

				if blockHighRisk {
					// 阻断写入底层硬件设备
					if strings.HasPrefix(cleanTarget, "/dev/sd") ||
						strings.HasPrefix(cleanTarget, "/dev/nvme") ||
						strings.HasPrefix(cleanTarget, "/dev/hd") ||
						strings.HasPrefix(cleanTarget, "/dev/mem") ||
						strings.HasPrefix(cleanTarget, "/dev/kmem") {
						hasForbidden = true
						forbiddenReason = fmt.Sprintf("禁止通过重定向覆写底层硬件设备 (%s)", target)
						return false
					}

					// 阻断重定向篡改关键系统敏感文件
					sensitiveFiles := []string{
						"/etc/passwd", "/etc/shadow", "/etc/sudoers", "/etc/crontab",
						"/etc/hosts", "/etc/resolv.conf", "/etc/ld.so.preload",
					}
					for _, sf := range sensitiveFiles {
						if cleanTarget == sf {
							hasForbidden = true
							forbiddenReason = fmt.Sprintf("禁止通过重定向篡改核心系统配置 (%s)", target)
							return false
						}
					}
				}
			}

		case *syntax.CallExpr:
			if len(n.Args) == 0 {
				return true
			}

			cmdName := printWord(n.Args[0])
			baseCmd := filepath.Base(cmdName)
			detectedCommands = append(detectedCommands, baseCmd)

			var args []string
			for i := 1; i < len(n.Args); i++ {
				args = append(args, printWord(n.Args[i]))
			}

			// 1. rm 指令深度审查 (参数重排容错: -r -f / 或 --recursive /)
			if baseCmd == "rm" {
				isRecursive := false
				isForce := false
				var targetPaths []string

				for _, arg := range args {
					if strings.HasPrefix(arg, "-") {
						if strings.Contains(arg, "r") || strings.Contains(arg, "R") || arg == "--recursive" {
							isRecursive = true
						}
						if strings.Contains(arg, "f") || arg == "--force" {
							isForce = true
						}
					} else {
						targetPaths = append(targetPaths, arg)
					}
				}

				if isRecursive {
					for _, target := range targetPaths {
						raw := strings.TrimSpace(target)
						normTarget := path.Clean(strings.ReplaceAll(raw, "\\", "/"))
						// 阻断根目录与核心系统目录全量擦除 (支持 rm -r 与 rm -rf)
						if normTarget == "/" || normTarget == "/*" || normTarget == "~" || normTarget == "~/*" ||
							normTarget == "$HOME" || normTarget == "/root" || normTarget == "/boot" ||
							normTarget == "/etc" || normTarget == "/bin" || normTarget == "/sbin" ||
							normTarget == "/usr" || normTarget == "/var" || normTarget == "/sys" ||
							normTarget == "/proc" || normTarget == "/dev" ||
							raw == "/" || raw == "/*" || raw == "~" || raw == "~/*" || raw == "$HOME" ||
							strings.HasSuffix(normTarget, ":/") || strings.HasSuffix(normTarget, ":") {
							if blockHighRisk {
								hasForbidden = true
								detail := "递归"
								if isForce {
									detail = "强制递归"
								}
								forbiddenReason = fmt.Sprintf("禁止执行对核心系统目录的%s删除指令 [目标: %s]", detail, target)
								return false
							}
						}

						// 阻断工作区路径逃逸越权 (Path Containment)
						if workspaceDir != "" && isPathEscapingWorkspace(target, workspaceDir) {
							if blockHighRisk {
								hasForbidden = true
								forbiddenReason = fmt.Sprintf("越权访问: 命令目标路径 [%s] 超出当前工作区目录限制", target)
								return false
							}
						}
					}
				}
				hasConfirm = true
				if confirmReason == "" {
					confirmReason = "执行 rm 删除文件操作需人工审批确认"
				}
				return true
			}

			// 2. 磁盘分区与格式化破坏性指令
			if baseCmd == "mkfs" || strings.HasPrefix(baseCmd, "mkfs.") ||
				baseCmd == "fdisk" || baseCmd == "parted" || baseCmd == "sfdisk" {
				if blockHighRisk {
					hasForbidden = true
					forbiddenReason = fmt.Sprintf("禁止执行磁盘分区与文件系统格式化指令 (%s)", baseCmd)
					return false
				}
				hasConfirm = true
				confirmReason = fmt.Sprintf("执行磁盘分区/格式化指令 (%s) 需人工审批", baseCmd)
				return true
			}

			// 3. dd 指令深度审查
			if baseCmd == "dd" {
				for _, arg := range args {
					if strings.HasPrefix(arg, "of=/dev/sd") ||
						strings.HasPrefix(arg, "of=/dev/nvme") ||
						strings.HasPrefix(arg, "of=/dev/hd") ||
						strings.HasPrefix(arg, "of=/dev/vd") {
						if blockHighRisk {
							hasForbidden = true
							forbiddenReason = fmt.Sprintf("禁止通过 dd 指令覆写底层物理存储设备 (%s)", arg)
							return false
						}
					}
				}
				hasConfirm = true
				confirmReason = "执行底层 dd 磁盘读写操作需人工审批确认"
				return true
			}

			// 4. 系统关机与重启指令
			if baseCmd == "reboot" || baseCmd == "shutdown" || baseCmd == "poweroff" || baseCmd == "halt" {
				if blockHighRisk {
					hasForbidden = true
					forbiddenReason = fmt.Sprintf("禁止执行导致主机服务中断的系统关机/重启指令 (%s)", baseCmd)
					return false
				}
				hasConfirm = true
				confirmReason = fmt.Sprintf("执行系统关机/重启 (%s) 需人工审批", baseCmd)
				return true
			}

			if baseCmd == "init" && len(args) > 0 && (args[0] == "0" || args[0] == "6") {
				if blockHighRisk {
					hasForbidden = true
					forbiddenReason = fmt.Sprintf("禁止切换至关机/重启运行级别 (init %s)", args[0])
					return false
				}
				hasConfirm = true
				confirmReason = "执行系统关机/重启需人工审批"
				return true
			}

			// 5. 提权命令审计 (sudo / su)
			if baseCmd == "sudo" || baseCmd == "su" {
				if blockHighRisk {
					hasForbidden = true
					forbiddenReason = fmt.Sprintf("禁止使用特权提升指令 (%s) 执行未授权系统命令", baseCmd)
					return false
				}
				hasConfirm = true
				confirmReason = fmt.Sprintf("执行特权命令 (%s) 需人工审批确认", baseCmd)
				return true
			}

			// 6. 判定是否为已知纯只读安全命令
			if !isReadOnlyCommand(baseCmd, args) {
				hasConfirm = true
				if confirmReason == "" {
					confirmReason = fmt.Sprintf("执行命令 [%s] 可能改变系统状态，需人工审批确认", baseCmd)
				}
			}
		}

		return true
	})

	if hasForbidden {
		return ShellAuditResult{
			Level:    LevelForbidden,
			Reason:   forbiddenReason,
			Commands: detectedCommands,
		}
	}

	// 若存在输出重定向，即使命令本身为 echo/cat，也构成了写操作
	if hasWriteRedirect && !hasConfirm {
		hasConfirm = true
		confirmReason = "命令包含重定向写文件操作，需人工审批确认"
	}

	if hasConfirm {
		if confirmReason == "" {
			confirmReason = "执行本地/远程 Shell 命令行可能改变系统状态，需人工审批确认"
		}
		return ShellAuditResult{
			Level:    LevelConfirm,
			Reason:   confirmReason,
			Commands: detectedCommands,
		}
	}

	return ShellAuditResult{
		Level:      LevelAllow,
		Commands:   detectedCommands,
		IsReadOnly: true,
	}
}

// isReadOnlyCommand 判定特定命令是否为绝对只读、不修改任何环境状态的安全指令
func isReadOnlyCommand(baseCmd string, args []string) bool {
	readOnlySet := map[string]bool{
		"ls": true, "ll": true, "dir": true,
		"cat": true, "head": true, "tail": true, "more": true, "less": true,
		"grep": true, "egrep": true, "fgrep": true, "awk": true, "sed": false, // sed 默认可写或复杂
		"find": true, "locate": true, "which": true, "whereis": true,
		"ps": true, "top": true, "htop": true, "pstree": true,
		"df": true, "du": true, "free": true, "vmstat": true, "iostat": true,
		"uname": true, "whoami": true, "id": true, "hostname": true,
		"uptime": true, "date": true, "cal": true, "env": true, "printenv": true,
		"pwd": true, "echo": true, "printf": true, "wc": true, "diff": true,
		"netstat": true, "ss": true, "ip": false, "ifconfig": true,
		"ping": true, "traceroute": true,
	}

	if readOnlySet[baseCmd] {
		return true
	}

	// 针对 git 只读子命令判定
	if baseCmd == "git" && len(args) > 0 {
		sub := args[0]
		if sub == "status" || sub == "log" || sub == "diff" || sub == "show" ||
			sub == "branch" || sub == "remote" || sub == "tag" || sub == "config" {
			return true
		}
	}

	return false
}

// isPathEscapingWorkspace 校验目标路径是否逃逸出工作区目录
func isPathEscapingWorkspace(targetPath string, workspaceDir string) bool {
	if workspaceDir == "" || targetPath == "" {
		return false
	}

	cleanWs := filepath.Clean(workspaceDir)

	var resolved string
	if filepath.IsAbs(targetPath) {
		resolved = filepath.Clean(targetPath)
	} else {
		resolved = filepath.Clean(filepath.Join(cleanWs, targetPath))
	}

	// 判定 resolved 是否位于 cleanWs 内部
	rel, err := filepath.Rel(cleanWs, resolved)
	if err != nil {
		return true
	}
	if strings.HasPrefix(rel, "..") || rel == ".." {
		return true
	}

	return false
}

// printWord 将 syntax.Word 转换还原为文本字符串
func printWord(word *syntax.Word) string {
	if word == nil {
		return ""
	}
	var sb strings.Builder
	syntax.NewPrinter().Print(&sb, word)
	return strings.TrimSpace(sb.String())
}

// getCallExprCmdName 获取命令调用节点的命令名称
func getCallExprCmdName(node syntax.Node) string {
	if node == nil {
		return ""
	}
	var name string
	syntax.Walk(node, func(n syntax.Node) bool {
		if call, ok := n.(*syntax.CallExpr); ok && len(call.Args) > 0 {
			name = filepath.Base(printWord(call.Args[0]))
			return false
		}
		return true
	})
	return name
}

// auditShellFallback 用于在语法解析出现非标准语法时进行严密的词法降级审查
func auditShellFallback(cmdText string, blockHighRisk bool, workspaceDir string) ShellAuditResult {
	lower := strings.ToLower(cmdText)

	if blockHighRisk {
		for _, pat := range HighRiskCommandPatterns {
			if strings.Contains(lower, pat) {
				return ShellAuditResult{
					Level:  LevelForbidden,
					Reason: fmt.Sprintf("命令中包含高危危险指令关键字: %s", pat),
				}
			}
		}

		if strings.Contains(lower, "> /dev/sd") || strings.Contains(lower, "> /dev/nvme") ||
			strings.Contains(lower, "> /etc/passwd") || strings.Contains(lower, "> /etc/shadow") {
			return ShellAuditResult{
				Level:  LevelForbidden,
				Reason: "禁止通过重定向覆写底层存储设备或关键敏感系统配置",
			}
		}

		if strings.Contains(lower, "sudo ") || strings.Contains(lower, "su -") {
			return ShellAuditResult{
				Level:  LevelForbidden,
				Reason: "禁止使用特权提升指令 (sudo/su) 执行未授权命令",
			}
		}
	}

	return ShellAuditResult{
		Level:  LevelConfirm,
		Reason: "执行本地/远程 Shell 命令行可能改变系统状态，需人工审批确认",
	}
}
