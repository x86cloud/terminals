package main

import (
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"os"
	"path"
	"strings"

	"terminal/core"
	"terminal/db"
	"terminal/mongo"
	"terminal/proto"
	"terminal/redis"
	"terminal/ssh"

	wruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// App 是绑定给前端的应用门面。
type App struct {
	ctx       context.Context
	store     *core.Store
	sessions  *ssh.SessionManager
	transfers *ssh.TransferManager
	redisMgr  *redis.RedisManager
	mysqlMgr  *db.MysqlManager
	mqttMgr   *proto.MqttManager
	mongoMgr  *mongo.MongoManager
	wsMgr     *proto.WsManager
}

func NewApp() *App {
	store, err := core.NewStore()
	if err != nil {
		store = &core.Store{}
	}
	return &App{
		store:     store,
		sessions:  ssh.NewSessionManager(),
		transfers: ssh.NewTransferManager(),
		redisMgr:  redis.NewRedisManager(),
		mysqlMgr:  db.NewMysqlManager(),
		mqttMgr:   proto.NewMqttManager(),
		mongoMgr:  mongo.NewMongoManager(),
		wsMgr:     proto.NewWsManager(),
	}
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	a.sessions.SetContext(ctx)
	a.transfers.SetContext(ctx)
	a.mqttMgr.SetContext(ctx)
	a.wsMgr.SetContext(ctx)
}

func (a *App) shutdown(ctx context.Context) {
	a.sessions.CloseAll()
	a.redisMgr.CloseAll()
	db.MysqlExMgr.CloseAll()
	a.mqttMgr.CloseAll()
	a.mongoMgr.CloseAll()
	db.SqliteMgr.CloseAll()
	a.wsMgr.CloseAll()
}

// ---------- 服务器配置 ----------

func (a *App) ListServers() []core.ServerConfig {
	if a.store == nil {
		return []core.ServerConfig{}
	}
	return a.store.List()
}

func (a *App) SaveServer(cfg core.ServerConfig) (core.ServerConfig, error) {
	if a.store == nil {
		return core.ServerConfig{}, errors.New("配置存储不可用")
	}
	return a.store.Save(cfg)
}

func (a *App) DeleteServer(id string) error {
	if a.store == nil {
		return errors.New("配置存储不可用")
	}
	return a.store.Delete(id)
}

// ---------- 设置持久化 ----------

func (a *App) GetAppSettings() core.AppSettings {
	if a.store == nil {
		return core.DefaultAppSettings()
	}
	return a.store.GetSettings()
}

func (a *App) SaveAppSettings(settings core.AppSettings) (core.AppSettings, error) {
	if a.store == nil {
		return settings, errors.New("配置存储不可用")
	}
	return a.store.SaveSettings(settings)
}

// ---------- 分组管理 ----------

func (a *App) ListGroups() []core.ServerGroup {
	if a.store == nil {
		return []core.ServerGroup{}
	}
	return a.store.ListGroups()
}

func (a *App) SaveGroup(g core.ServerGroup) (core.ServerGroup, error) {
	if a.store == nil {
		return core.ServerGroup{}, errors.New("配置存储不可用")
	}
	return a.store.SaveGroup(g)
}

func (a *App) DeleteGroup(id string) error {
	if a.store == nil {
		return errors.New("配置存储不可用")
	}
	return a.store.DeleteGroup(id)
}

func (a *App) MoveServerToGroup(serverID, groupID string) error {
	if a.store == nil {
		return errors.New("配置存储不可用")
	}
	return a.store.MoveServerToGroup(serverID, groupID)
}

// SelectPrivateKey 打开文件选择框以挑选私钥文件。
func (a *App) SelectPrivateKey() (string, error) {
	return wruntime.OpenFileDialog(a.ctx, wruntime.OpenDialogOptions{
		Title: "选择 SSH 私钥文件",
	})
}

// ---------- 会话 ----------

func (a *App) ListSessions() []ssh.SessionInfo {
	return a.sessions.List()
}

// Connect 使用已保存的服务器配置建立连接。
func (a *App) Connect(serverID string, cols int, rows int) (ssh.SessionInfo, error) {
	cfg, ok := a.store.Get(serverID)
	if !ok {
		return ssh.SessionInfo{}, errors.New("服务器配置不存在")
	}
	return a.sessions.Connect(cfg, cols, rows)
}

// ConnectWithConfig 使用临时配置建立连接（不保存）。
func (a *App) ConnectWithConfig(cfg core.ServerConfig, cols int, rows int) (ssh.SessionInfo, error) {
	return a.sessions.Connect(cfg, cols, rows)
}

func (a *App) Disconnect(sessionID string) error {
	a.sessions.Remove(sessionID)
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

func (a *App) SSHDashboardStats(sessionID string) (*ssh.SSHDashboardInfo, error) {
	return a.sessions.GetDashboardStats(sessionID)
}

func (a *App) SSHProcessList(sessionID string) ([]ssh.SSHProcessInfo, error) {
	return a.sessions.GetProcessList(sessionID)
}

func (a *App) SSHKillProcess(sessionID string, pid int) error {
	return a.sessions.KillProcess(sessionID, pid)
}

func (a *App) SSHServiceList(sessionID string) ([]ssh.SSHServiceInfo, error) {
	return a.sessions.GetServiceList(sessionID)
}

func (a *App) SSHControlService(sessionID string, serviceName string, action string) error {
	return a.sessions.ControlService(sessionID, serviceName, action)
}

func (a *App) SSHServiceLogs(sessionID string, serviceName string) (string, error) {
	return a.sessions.GetServiceLogs(sessionID, serviceName)
}

func (a *App) SSHCronList(sessionID string) ([]ssh.SSHCronItem, error) {
	return a.sessions.GetCronList(sessionID)
}

func (a *App) SSHSaveCronList(sessionID string, items []ssh.SSHCronItem) error {
	return a.sessions.SaveCronList(sessionID, items)
}

func (a *App) SSHRunCronCommand(sessionID string, command string) (string, error) {
	return a.sessions.RunCronCommand(sessionID, command)
}

// ---------- Docker 运维 ----------

func (a *App) SSHDockerContainerList(sessionID string) ([]ssh.SSHDockerContainer, error) {
	return a.sessions.GetDockerContainerList(sessionID)
}

func (a *App) SSHDockerControlContainer(sessionID string, containerID string, action string) error {
	return a.sessions.ControlDockerContainer(sessionID, containerID, action)
}

func (a *App) SSHDockerContainerLogs(sessionID string, containerID string, tail int) (string, error) {
	return a.sessions.GetDockerContainerLogs(sessionID, containerID, tail)
}

func (a *App) SSHDockerImageList(sessionID string) ([]ssh.SSHDockerImage, error) {
	return a.sessions.GetDockerImageList(sessionID)
}

func (a *App) SSHDockerRemoveImage(sessionID string, imageID string) error {
	return a.sessions.RemoveDockerImage(sessionID, imageID)
}

func (a *App) SSHDockerPullImage(sessionID string, imageName string) (string, error) {
	return a.sessions.PullDockerImage(sessionID, imageName)
}

// ---------- SFTP ----------

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

// ---------- HTTP API & WebSocket 调试 ----------

func (a *App) ApiRequest(req proto.ApiRequest) (proto.ApiResponse, error) {
	return proto.HttpApiRequest(req)
}

func (a *App) WsConnect(req proto.WsConnectRequest) (proto.WsConnectResult, error) {
	return a.wsMgr.WsConnect(req)
}

func (a *App) WsSend(id string, message string) error {
	return a.wsMgr.WsSend(id, message)
}

func (a *App) WsClose(id string) {
	a.wsMgr.WsClose(id)
}
