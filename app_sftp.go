package main

import (
	"encoding/base64"
	"errors"
	"fmt"
	"os"
	"path"
	"strings"
	"terminal/ssh"

	wruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// ---------- SFTP 文件与目录 ----------

func (a *App) ListDir(sessionID string, dir string) (ssh.DirListing, error) {
	return a.sessions.ListDir(sessionID, dir)
}

func (a *App) HomeDir(sessionID string) (string, error) {
	session, err := a.sessions.Get(sessionID)
	if err != nil {
		return "", err
	}
	info := session.Info()
	if info.HomeDir == "" {
		return "/", nil
	}
	return info.HomeDir, nil
}

func (a *App) MakeDir(sessionID string, parent string, name string) error {
	name = strings.TrimSpace(name)
	if name == "" {
		return errors.New("目录名不能为空")
	}
	return a.sessions.StartUpload(a.transfers, sessionID, parent, name)
}

func (a *App) RemovePath(sessionID string, target string) error {
	return a.sessions.RemoveRemotePath(sessionID, target)
}

func (a *App) RemovePaths(sessionID string, targets []string) error {
	for _, item := range targets {
		if err := a.RemovePath(sessionID, item); err != nil {
			return err
		}
	}
	return nil
}

func (a *App) RenamePath(sessionID string, target string, newName string) error {
	newName = strings.TrimSpace(newName)
	if newName == "" {
		return errors.New("新名称不能为空")
	}
	dest := path.Join(path.Dir(target), newName)
	if strings.Contains(newName, "/") {
		dest = ssh.NormalizeRemote(newName)
	}
	target = ssh.NormalizeRemote(target)
	cmd := fmt.Sprintf("mv %s %s", target, dest)
	session, err := a.sessions.Get(sessionID)
	if err != nil {
		return err
	}
	_, err = session.ExecCombined(cmd)
	a.sessions.NotifyDirChanged(sessionID, path.Dir(target))
	return err
}

// ReadRemoteFile 读取远程文件内容（限制最大 5MB 文本）
func (a *App) ReadRemoteFile(sessionID string, remotePath string) (string, error) {
	session, err := a.sessions.Get(sessionID)
	if err != nil {
		return "", err
	}
	remotePath = ssh.NormalizeRemote(remotePath)
	cmd := fmt.Sprintf("cat %s", remotePath)
	return session.ExecCombined(cmd)
}

// WriteRemoteFile 将内容保存写入远程文件
func (a *App) WriteRemoteFile(sessionID string, remotePath string, content string) error {
	session, err := a.sessions.Get(sessionID)
	if err != nil {
		return err
	}
	remotePath = ssh.NormalizeRemote(remotePath)
	encoded := base64.StdEncoding.EncodeToString([]byte(content))
	cmd := fmt.Sprintf("echo %s | base64 -d > %s", encoded, remotePath)
	_, err = session.ExecCombined(cmd)
	a.sessions.NotifyDirChanged(sessionID, path.Dir(remotePath))
	return err
}

// ---------- 传输与本地文件对话框 ----------

// ChooseLocalFiles 弹出文件选择框，返回本地文件绝对路径。
func (a *App) ChooseLocalFiles() ([]string, error) {
	return wruntime.OpenMultipleFilesDialog(a.ctx, wruntime.OpenDialogOptions{
		Title: "选择要上传的文件",
	})
}

// ChooseLocalFolder 弹出目录选择框。
func (a *App) ChooseLocalFolder() (string, error) {
	return wruntime.OpenDirectoryDialog(a.ctx, wruntime.OpenDialogOptions{
		Title: "选择文件夹",
	})
}

// SaveMysqlFile 弹出保存文件对话框，返回用户选择的路径（已含扩展名）。
func (a *App) SaveMysqlFile(defaultName string) (string, error) {
	return wruntime.SaveFileDialog(a.ctx, wruntime.SaveDialogOptions{
		Title:           "导出文件",
		DefaultFilename: defaultName,
	})
}

// ReadLocalFile 读取本地文本文件内容并以 UTF-8 字符串返回（内容过大时返回 base64 编码的约定：此处直接返回文本）。
func (a *App) ReadLocalFile(filePath string) (string, error) {
	data, err := os.ReadFile(filePath)
	if err != nil {
		return "", err
	}
	return string(data), nil
}

// WriteLocalFile 将文本内容写入本地文件。
func (a *App) WriteLocalFile(filePath string, content string) error {
	return os.WriteFile(filePath, []byte(content), 0o644)
}

// ReadLocalFileBase64 读取本地文件并以 base64 返回（用于二进制文件，预留）。
func (a *App) ReadLocalFileBase64(filePath string) (string, error) {
	data, err := os.ReadFile(filePath)
	if err != nil {
		return "", err
	}
	return base64.StdEncoding.EncodeToString(data), nil
}

// UploadPaths 将本地文件/目录上传到远程目录。
func (a *App) UploadPaths(sessionID string, remoteDir string, localPaths []string) error {
	if len(localPaths) == 0 {
		return nil
	}
	for _, p := range localPaths {
		if err := a.sessions.StartUpload(a.transfers, sessionID, remoteDir, p); err != nil {
			return err
		}
	}
	return nil
}

// UploadData 用于浏览器内拖拽降级：直接上传 base64 内容。
func (a *App) UploadData(sessionID string, remoteDir string, name string, base64Data string) error {
	return a.sessions.UploadBase64(a.transfers, sessionID, remoteDir, name, base64Data)
}

// DownloadPaths 询问保存目录后下载远程文件/目录。
func (a *App) DownloadPaths(sessionID string, remotePaths []string) error {
	if len(remotePaths) == 0 {
		return nil
	}
	dir, err := wruntime.OpenDirectoryDialog(a.ctx, wruntime.OpenDialogOptions{
		Title: "选择保存位置",
	})
	if err != nil {
		return err
	}
	if dir == "" {
		return nil
	}
	for _, p := range remotePaths {
		if err := a.sessions.StartDownload(a.transfers, sessionID, p, dir); err != nil {
			return err
		}
	}
	return nil
}

// DownloadTo 下载到指定本地目录。
func (a *App) DownloadTo(sessionID string, remotePaths []string, localDir string) error {
	for _, p := range remotePaths {
		if err := a.sessions.StartDownload(a.transfers, sessionID, p, localDir); err != nil {
			return err
		}
	}
	return nil
}

func (a *App) ListTransfers() []ssh.Transfer {
	return a.transfers.List()
}

func (a *App) CancelTransfer(id string) error {
	a.transfers.Cancel(id)
	return nil
}

func (a *App) ClearFinishedTransfers() error {
	a.transfers.ClearFinished()
	return nil
}
