package services

import (
	"encoding/base64"
	"os"
	"terminal/core"
	"terminal/logger"
	"terminal/ssh"
)

type SftpService struct{}

func NewSftpService() *SftpService {
	return &SftpService{}
}

func (s *SftpService) ListDir(sessionID string, dir string) (ssh.DirListing, error) {
	listing, err := GetContainer().Sessions.ListDir(sessionID, dir)
	if err != nil {
		logger.Errorf("SFTP 读取目录失败 [SessionID=%s, Dir=%s]: %v", sessionID, dir, err)
		return listing, err
	}
	return listing, nil
}

func (s *SftpService) HomeDir(sessionID string) (string, error) {
	session, err := GetContainer().Sessions.Get(sessionID)
	if err != nil {
		logger.Errorf("SFTP 获取主目录失败 [SessionID=%s]: %v", sessionID, err)
		return "", err
	}
	info := session.Info()
	if info.HomeDir == "" {
		return "/", nil
	}
	return info.HomeDir, nil
}

func (s *SftpService) MakeDir(sessionID string, parent string, name string) error {
	logger.Infof("SFTP 创建目录 [SessionID=%s, Parent=%s, Name=%s]", sessionID, parent, name)
	c := GetContainer()
	if err := c.Sessions.MakeDir(sessionID, parent, name); err != nil {
		logger.Errorf("SFTP 创建目录失败 [SessionID=%s, Parent=%s, Name=%s]: %v", sessionID, parent, name, err)
		return err
	}
	return nil
}

func (s *SftpService) RemovePath(sessionID string, target string) error {
	logger.Infof("SFTP 删除路径 [SessionID=%s, Target=%s]", sessionID, target)
	if err := GetContainer().Sessions.RemoveRemotePath(sessionID, target); err != nil {
		logger.Errorf("SFTP 删除路径失败 [SessionID=%s, Target=%s]: %v", sessionID, target, err)
		return err
	}
	return nil
}

func (s *SftpService) RemovePaths(sessionID string, targets []string) error {
	logger.Infof("SFTP 批量删除路径 [SessionID=%s, Count=%d]", sessionID, len(targets))
	for _, item := range targets {
		if err := s.RemovePath(sessionID, item); err != nil {
			return err
		}
	}
	return nil
}

func (s *SftpService) RenamePath(sessionID string, target string, newName string) error {
	logger.Infof("SFTP 重命名路径 [SessionID=%s, Target=%s, NewName=%s]", sessionID, target, newName)
	c := GetContainer()
	if err := c.Sessions.RenameRemotePath(sessionID, target, newName); err != nil {
		logger.Errorf("SFTP 重命名路径失败 [SessionID=%s, Target=%s, NewName=%s]: %v", sessionID, target, newName, err)
		return err
	}
	return nil
}

func (s *SftpService) ReadRemoteFile(sessionID string, remotePath string) (string, error) {
	logger.Infof("SFTP 读取远程文件 [SessionID=%s, Path=%s]", sessionID, remotePath)
	c := GetContainer()
	data, err := c.Sessions.ReadFileContent(sessionID, remotePath)
	if err != nil {
		logger.Errorf("SFTP 读取远程文件失败 [SessionID=%s, Path=%s]: %v", sessionID, remotePath, err)
		return "", err
	}
	return string(data), nil
}

func (s *SftpService) WriteRemoteFile(sessionID string, remotePath string, content string) error {
	logger.Infof("SFTP 保存远程文件 [SessionID=%s, Path=%s, Bytes=%d]", sessionID, remotePath, len(content))
	c := GetContainer()
	if err := c.Sessions.WriteFileContent(sessionID, remotePath, []byte(content)); err != nil {
		logger.Errorf("SFTP 保存远程文件失败 [SessionID=%s, Path=%s]: %v", sessionID, remotePath, err)
		return err
	}
	return nil
}

func (s *SftpService) ChooseLocalFiles() ([]string, error) {
	files, err := core.OpenMultipleFilesDialog("选择要上传的文件")
	if err != nil {
		logger.Errorf("选择本地文件失败: %v", err)
	}
	return files, err
}

func (s *SftpService) ChooseLocalFolder() (string, error) {
	folder, err := core.OpenDirectoryDialog("选择文件夹")
	if err != nil {
		logger.Errorf("选择本地文件夹失败: %v", err)
	}
	return folder, err
}

func (s *SftpService) SaveMysqlFile(defaultName string) (string, error) {
	file, err := core.SaveFileDialog("导出文件", defaultName)
	if err != nil {
		logger.Errorf("选择导出文件保存位置失败: %v", err)
	}
	return file, err
}

func (s *SftpService) ReadLocalFile(filePath string) (string, error) {
	data, err := os.ReadFile(filePath)
	if err != nil {
		logger.Errorf("读取本地文件失败 [Path=%s]: %v", filePath, err)
		return "", err
	}
	return string(data), nil
}

func (s *SftpService) WriteLocalFile(filePath string, content string) error {
	if err := os.WriteFile(filePath, []byte(content), 0o644); err != nil {
		logger.Errorf("写入本地文件失败 [Path=%s]: %v", filePath, err)
		return err
	}
	return nil
}

func (s *SftpService) ReadLocalFileBase64(filePath string) (string, error) {
	data, err := os.ReadFile(filePath)
	if err != nil {
		logger.Errorf("读取本地文件Base64失败 [Path=%s]: %v", filePath, err)
		return "", err
	}
	return base64.StdEncoding.EncodeToString(data), nil
}

func (s *SftpService) UploadPaths(sessionID string, remoteDir string, localPaths []string) error {
	if len(localPaths) == 0 {
		return nil
	}
	logger.Infof("SFTP 触发上传文件 [SessionID=%s, RemoteDir=%s, FileCount=%d]", sessionID, remoteDir, len(localPaths))
	c := GetContainer()
	for _, p := range localPaths {
		if err := c.Sessions.StartUpload(c.Transfers, sessionID, remoteDir, p); err != nil {
			logger.Errorf("SFTP 启动上传失败 [SessionID=%s, RemoteDir=%s, LocalPath=%s]: %v", sessionID, remoteDir, p, err)
			return err
		}
	}
	return nil
}

func (s *SftpService) UploadData(sessionID string, remoteDir string, name string, base64Data string) error {
	logger.Infof("SFTP 触发 Base64 数据上传 [SessionID=%s, RemoteDir=%s, FileName=%s]", sessionID, remoteDir, name)
	c := GetContainer()
	if err := c.Sessions.UploadBase64(c.Transfers, sessionID, remoteDir, name, base64Data); err != nil {
		logger.Errorf("SFTP 启动 Base64 上传失败 [SessionID=%s, FileName=%s]: %v", sessionID, name, err)
		return err
	}
	return nil
}

func (s *SftpService) DownloadPaths(sessionID string, remotePaths []string) error {
	if len(remotePaths) == 0 {
		return nil
	}
	dir, err := core.OpenDirectoryDialog("选择保存位置")
	if err != nil {
		logger.Errorf("选择下载保存位置失败: %v", err)
		return err
	}
	if dir == "" {
		return nil
	}
	logger.Infof("SFTP 触发批量下载 [SessionID=%s, DestDir=%s, FileCount=%d]", sessionID, dir, len(remotePaths))
	c := GetContainer()
	for _, p := range remotePaths {
		if err := c.Sessions.StartDownload(c.Transfers, sessionID, p, dir); err != nil {
			logger.Errorf("SFTP 启动下载失败 [SessionID=%s, RemotePath=%s]: %v", sessionID, p, err)
			return err
		}
	}
	return nil
}

func (s *SftpService) DownloadTo(sessionID string, remotePaths []string, localDir string) error {
	logger.Infof("SFTP 触发下载至指定目录 [SessionID=%s, LocalDir=%s, FileCount=%d]", sessionID, localDir, len(remotePaths))
	c := GetContainer()
	for _, p := range remotePaths {
		if err := c.Sessions.StartDownload(c.Transfers, sessionID, p, localDir); err != nil {
			logger.Errorf("SFTP 启动下载失败 [SessionID=%s, RemotePath=%s, DestDir=%s]: %v", sessionID, p, localDir, err)
			return err
		}
	}
	return nil
}

func (s *SftpService) ListTransfers() []ssh.Transfer {
	return GetContainer().Transfers.List()
}

func (s *SftpService) CancelTransfer(id string) error {
	logger.Infof("SFTP 取消传输任务 [TransferID=%s]", id)
	GetContainer().Transfers.Cancel(id)
	return nil
}

func (s *SftpService) ClearFinishedTransfers() error {
	logger.Info("SFTP 清理已完成的传输任务")
	GetContainer().Transfers.ClearFinished()
	return nil
}
