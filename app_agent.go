package main

import (
	"context"
	"errors"
	"strings"
	"terminal/agent"

	wruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// ---------- AI Agent API ----------

func (a *App) AgentSend(sessionID string, messages []agent.FrontendMessage) (string, error) {
	if a.ctx != nil {
		agent.DefaultManager.SetContext(a.ctx)
		agent.DefaultWorkspaceMgr.SetEmitConfirmFunc(func(confirmID, action, path, desc string) {
			wruntime.EventsEmit(a.ctx, "agent:confirm_request:"+sessionID, map[string]string{
				"confirmID":   confirmID,
				"action":      action,
				"path":        path,
				"description": desc,
			})
		})
		agent.DefaultWorkspaceMgr.SetEmitToolStartFunc(func(toolName, detail string) {
			wruntime.EventsEmit(a.ctx, "agent:tool_start:"+sessionID, map[string]string{
				"toolName": toolName,
				"detail":   detail,
			})
		})
		agent.DefaultWorkspaceMgr.SetEmitToolEventFunc(func(callID, toolName, input, output string) {
			wruntime.EventsEmit(a.ctx, "agent:tool_event:"+sessionID, map[string]string{
				"id":     callID,
				"name":   toolName,
				"args":   input,
				"result": output,
			})
		})
	}

	cfg := a.store.GetSettings()
	agent.DefaultManager.SetSSHManager(a.sessions)
	_ = agent.DefaultManager.InitOrUpdate(cfg)

	fullText, notice, err := agent.DefaultManager.StreamChat(
		context.Background(),
		sessionID,
		messages,
		func(chunk string) {
			if a.ctx != nil {
				wruntime.EventsEmit(a.ctx, "agent:chunk:"+sessionID, chunk)
			}
		},
	)

	if notice != "" && a.ctx != nil {
		wruntime.EventsEmit(a.ctx, "agent:notice:"+sessionID, notice)
	}

	if err != nil {
		if err.Error() == "用户手动停止了推导" {
			stoppedText := fullText
			if strings.TrimSpace(stoppedText) != "" {
				stoppedText += "\n\n⏹️ [用户手动停止了推导]"
			} else {
				stoppedText = "⏹️ [用户手动停止了推导]"
			}
			if a.ctx != nil {
				wruntime.EventsEmit(a.ctx, "agent:done:"+sessionID, stoppedText)
			}
			return stoppedText, nil
		}
		if a.ctx != nil {
			wruntime.EventsEmit(a.ctx, "agent:error:"+sessionID, err.Error())
		}
		return fullText, err
	}

	if a.ctx != nil {
		wruntime.EventsEmit(a.ctx, "agent:done:"+sessionID, fullText)
	}
	return fullText, nil
}

func (a *App) AgentStopSend(sessionID string) bool {
	agent.DefaultManager.StopChat(sessionID)
	return true
}

func (a *App) AgentSelectWorkspaceDir() (string, error) {
	if a.ctx == nil {
		return "", errors.New("app context is nil")
	}
	dir, err := wruntime.OpenDirectoryDialog(a.ctx, wruntime.OpenDialogOptions{
		Title: "选择工作目录",
	})
	if err != nil {
		return "", err
	}
	if dir != "" {
		agent.DefaultWorkspaceMgr.SetDir(dir)
		cfg := a.store.GetSettings()
		cfg.AiWorkspaceDir = dir
		_, _ = a.store.SaveSettings(cfg)
		_ = agent.DefaultManager.InitOrUpdate(cfg)
	}
	return dir, nil
}

func (a *App) AgentSetWorkspaceDir(dir string) string {
	agent.DefaultWorkspaceMgr.SetDir(dir)
	cfg := a.store.GetSettings()
	cfg.AiWorkspaceDir = dir
	_, _ = a.store.SaveSettings(cfg)
	_ = agent.DefaultManager.InitOrUpdate(cfg)
	return dir
}

func (a *App) AgentGetWorkspaceDir() string {
	dir := agent.DefaultWorkspaceMgr.GetDir()
	if dir == "" {
		cfg := a.store.GetSettings()
		if cfg.AiWorkspaceDir != "" {
			agent.DefaultWorkspaceMgr.SetDir(cfg.AiWorkspaceDir)
			dir = cfg.AiWorkspaceDir
		}
	}
	return dir
}

func (a *App) AgentConfirmTool(confirmID string, approved bool) bool {
	agent.DefaultWorkspaceMgr.ConfirmToolResponse(confirmID, approved)
	return true
}

func (a *App) AgentGetHistory() ([]agent.FrontendMessage, error) {
	return agent.DefaultManager.Storage().LoadHistory()
}

func (a *App) AgentSaveHistory(messages []agent.FrontendMessage) error {
	return agent.DefaultManager.Storage().SaveHistory(messages)
}

func (a *App) AgentClearHistory() error {
	return agent.DefaultManager.Storage().ClearHistory()
}
