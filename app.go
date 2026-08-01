package main

import (
	"context"
	"encoding/base64"
	"errors"
	"os"
	"path"
	"strings"

	wruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// App 是绑定给前端的应用门面。
type App struct {
	ctx       context.Context
	store     *Store
	sessions  *SessionManager
	transfers *transferManager
	redisMgr  *redisManager
	mysqlMgr  *mysqlManager
	mqttMgr   *mqttManager
	wsMgr     *wsManager
}

func NewApp() *App {
	store, err := NewStore()
	if err != nil {
		// 存储不可用时降级为内存模式，保证应用仍可启动
		store = &Store{servers: []ServerConfig{}}
	}
	return &App{
		store:     store,
		sessions:  NewSessionManager(),
		transfers: newTransferManager(),
		redisMgr:  newRedisManager(),
		mysqlMgr:  newMysqlManager(),
		mqttMgr:   newMqttManager(),
		wsMgr:     newWsManager(),
	}
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	a.sessions.setContext(ctx)
	a.transfers.setContext(ctx)
	// 系统级文件拖入由前端 runtime.OnFileDrop 监听（需要它注册 DOM 事件才能解析真实路径）
}

func (a *App) shutdown(ctx context.Context) {
	a.sessions.closeAll()
	a.redisMgr.closeAll()
	mysqlExMgr.closeAll()
	a.mqttMgr.closeAll()
}

// ---------- 服务器配置 ----------

func (a *App) ListServers() []ServerConfig {
	if a.store == nil {
		return []ServerConfig{}
	}
	return a.store.List()
}

func (a *App) SaveServer(cfg ServerConfig) (ServerConfig, error) {
	if a.store == nil {
		return ServerConfig{}, errors.New("配置存储不可用")
	}
	return a.store.Save(cfg)
}

func (a *App) DeleteServer(id string) error {
	if a.store == nil {
		return errors.New("配置存储不可用")
	}
	return a.store.Delete(id)
}

// SelectPrivateKey 打开文件选择框以挑选私钥文件。
func (a *App) SelectPrivateKey() (string, error) {
	return wruntime.OpenFileDialog(a.ctx, wruntime.OpenDialogOptions{
		Title: "选择 SSH 私钥文件",
	})
}

// ---------- 会话 ----------

func (a *App) ListSessions() []SessionInfo {
	return a.sessions.list()
}

// Connect 使用已保存的服务器配置建立连接。
func (a *App) Connect(serverID string, cols int, rows int) (SessionInfo, error) {
	cfg, ok := a.store.Get(serverID)
	if !ok {
		return SessionInfo{}, errors.New("服务器配置不存在")
	}
	return a.sessions.Connect(cfg, cols, rows)
}

// ConnectWithConfig 使用临时配置建立连接（不保存）。
func (a *App) ConnectWithConfig(cfg ServerConfig, cols int, rows int) (SessionInfo, error) {
	return a.sessions.Connect(cfg, cols, rows)
}

func (a *App) Disconnect(sessionID string) error {
	a.sessions.remove(sessionID)
	if a.ctx != nil {
		wruntime.EventsEmit(a.ctx, "session:closed", sessionID)
	}
	return nil
}

func (a *App) SendInput(sessionID string, data string) error {
	return a.sessions.Write(sessionID, data)
}

func (a *App) ResizeTerminal(sessionID string, cols int, rows int) error {
	return a.sessions.Resize(sessionID, cols, rows)
}

// ---------- SFTP ----------

func (a *App) ListDir(sessionID string, dir string) (DirListing, error) {
	return a.listDir(sessionID, dir)
}

func (a *App) HomeDir(sessionID string) (string, error) {
	session, err := a.sessions.get(sessionID)
	if err != nil {
		return "", err
	}
	if session.homeDir == "" {
		return "/", nil
	}
	return session.homeDir, nil
}

func (a *App) MakeDir(sessionID string, parent string, name string) error {
	name = strings.TrimSpace(name)
	if name == "" {
		return errors.New("目录名不能为空")
	}
	session, err := a.sessions.get(sessionID)
	if err != nil {
		return err
	}
	client, err := session.sftpConn()
	if err != nil {
		return err
	}
	return client.Mkdir(path.Join(normalizeRemote(parent), name))
}

func (a *App) RemovePath(sessionID string, target string) error {
	session, err := a.sessions.get(sessionID)
	if err != nil {
		return err
	}
	client, err := session.sftpConn()
	if err != nil {
		return err
	}
	target = normalizeRemote(target)
	if target == "/" {
		return errors.New("拒绝删除根目录")
	}
	if err := a.removeRemote(client, target); err != nil {
		return err
	}
	a.notifyDirChanged(sessionID, path.Dir(target))
	return nil
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
	session, err := a.sessions.get(sessionID)
	if err != nil {
		return err
	}
	client, err := session.sftpConn()
	if err != nil {
		return err
	}
	target = normalizeRemote(target)
	dest := path.Join(path.Dir(target), newName)
	if strings.Contains(newName, "/") {
		dest = normalizeRemote(newName)
	}
	if err := client.Rename(target, dest); err != nil {
		return err
	}
	a.notifyDirChanged(sessionID, path.Dir(target))
	return nil
}

// ---------- 传输 ----------

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
		if err := a.startUpload(sessionID, remoteDir, p); err != nil {
			return err
		}
	}
	return nil
}

// UploadData 用于浏览器内拖拽降级：直接上传 base64 内容。
func (a *App) UploadData(sessionID string, remoteDir string, name string, base64Data string) error {
	return a.uploadBase64(sessionID, remoteDir, name, base64Data)
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
		if err := a.startDownload(sessionID, p, dir); err != nil {
			return err
		}
	}
	return nil
}

// DownloadTo 下载到指定本地目录。
func (a *App) DownloadTo(sessionID string, remotePaths []string, localDir string) error {
	for _, p := range remotePaths {
		if err := a.startDownload(sessionID, p, localDir); err != nil {
			return err
		}
	}
	return nil
}

func (a *App) ListTransfers() []Transfer {
	return a.transfers.list()
}

func (a *App) CancelTransfer(id string) error {
	a.transfers.cancel(id)
	return nil
}

func (a *App) ClearFinishedTransfers() error {
	a.transfers.clearFinished()
	return nil
}
