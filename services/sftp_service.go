package services

import (
	"encoding/base64"
	"errors"
	"fmt"
	"os"
	"path"
	"strings"
	"terminal/core"
	"terminal/ssh"
)

type SftpService struct{}

func NewSftpService() *SftpService {
	return &SftpService{}
}

func (s *SftpService) ListDir(sessionID string, dir string) (ssh.DirListing, error) {
	return GetContainer().Sessions.ListDir(sessionID, dir)
}

func (s *SftpService) HomeDir(sessionID string) (string, error) {
	session, err := GetContainer().Sessions.Get(sessionID)
	if err != nil {
		return "", err
	}
	info := session.Info()
	if info.HomeDir == "" {
		return "/", nil
	}
	return info.HomeDir, nil
}

func (s *SftpService) MakeDir(sessionID string, parent string, name string) error {
	name = strings.TrimSpace(name)
	if name == "" {
		return errors.New("目录名不能为空")
	}
	c := GetContainer()
	return c.Sessions.StartUpload(c.Transfers, sessionID, parent, name)
}

func (s *SftpService) RemovePath(sessionID string, target string) error {
	return GetContainer().Sessions.RemoveRemotePath(sessionID, target)
}

func (s *SftpService) RemovePaths(sessionID string, targets []string) error {
	for _, item := range targets {
		if err := s.RemovePath(sessionID, item); err != nil {
			return err
		}
	}
	return nil
}

func (s *SftpService) RenamePath(sessionID string, target string, newName string) error {
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
	c := GetContainer()
	session, err := c.Sessions.Get(sessionID)
	if err != nil {
		return err
	}
	_, err = session.ExecCombined(cmd)
	c.Sessions.NotifyDirChanged(sessionID, path.Dir(target))
	return err
}

func (s *SftpService) ReadRemoteFile(sessionID string, remotePath string) (string, error) {
	session, err := GetContainer().Sessions.Get(sessionID)
	if err != nil {
		return "", err
	}
	remotePath = ssh.NormalizeRemote(remotePath)
	cmd := fmt.Sprintf("cat %s", remotePath)
	return session.ExecCombined(cmd)
}

func (s *SftpService) WriteRemoteFile(sessionID string, remotePath string, content string) error {
	c := GetContainer()
	session, err := c.Sessions.Get(sessionID)
	if err != nil {
		return err
	}
	remotePath = ssh.NormalizeRemote(remotePath)
	encoded := base64.StdEncoding.EncodeToString([]byte(content))
	cmd := fmt.Sprintf("echo %s | base64 -d > %s", encoded, remotePath)
	_, err = session.ExecCombined(cmd)
	c.Sessions.NotifyDirChanged(sessionID, path.Dir(remotePath))
	return err
}

func (s *SftpService) ChooseLocalFiles() ([]string, error) {
	return core.OpenMultipleFilesDialog("选择要上传的文件")
}

func (s *SftpService) ChooseLocalFolder() (string, error) {
	return core.OpenDirectoryDialog("选择文件夹")
}

func (s *SftpService) SaveMysqlFile(defaultName string) (string, error) {
	return core.SaveFileDialog("导出文件", defaultName)
}

func (s *SftpService) ReadLocalFile(filePath string) (string, error) {
	data, err := os.ReadFile(filePath)
	if err != nil {
		return "", err
	}
	return string(data), nil
}

func (s *SftpService) WriteLocalFile(filePath string, content string) error {
	return os.WriteFile(filePath, []byte(content), 0o644)
}

func (s *SftpService) ReadLocalFileBase64(filePath string) (string, error) {
	data, err := os.ReadFile(filePath)
	if err != nil {
		return "", err
	}
	return base64.StdEncoding.EncodeToString(data), nil
}

func (s *SftpService) UploadPaths(sessionID string, remoteDir string, localPaths []string) error {
	if len(localPaths) == 0 {
		return nil
	}
	c := GetContainer()
	for _, p := range localPaths {
		if err := c.Sessions.StartUpload(c.Transfers, sessionID, remoteDir, p); err != nil {
			return err
		}
	}
	return nil
}

func (s *SftpService) UploadData(sessionID string, remoteDir string, name string, base64Data string) error {
	c := GetContainer()
	return c.Sessions.UploadBase64(c.Transfers, sessionID, remoteDir, name, base64Data)
}

func (s *SftpService) DownloadPaths(sessionID string, remotePaths []string) error {
	if len(remotePaths) == 0 {
		return nil
	}
	dir, err := core.OpenDirectoryDialog("选择保存位置")
	if err != nil {
		return err
	}
	if dir == "" {
		return nil
	}
	c := GetContainer()
	for _, p := range remotePaths {
		if err := c.Sessions.StartDownload(c.Transfers, sessionID, p, dir); err != nil {
			return err
		}
	}
	return nil
}

func (s *SftpService) DownloadTo(sessionID string, remotePaths []string, localDir string) error {
	c := GetContainer()
	for _, p := range remotePaths {
		if err := c.Sessions.StartDownload(c.Transfers, sessionID, p, localDir); err != nil {
			return err
		}
	}
	return nil
}

func (s *SftpService) ListTransfers() []ssh.Transfer {
	return GetContainer().Transfers.List()
}

func (s *SftpService) CancelTransfer(id string) error {
	GetContainer().Transfers.Cancel(id)
	return nil
}

func (s *SftpService) ClearFinishedTransfers() error {
	GetContainer().Transfers.ClearFinished()
	return nil
}
