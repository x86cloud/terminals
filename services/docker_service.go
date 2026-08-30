package services

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"terminal/core"
	"terminal/docker"
)

// DockerService 导出给 Wails 的 Docker 管理服务接口。
type DockerService struct{}

// NewDockerService 构造 DockerService。
func NewDockerService() *DockerService {
	return &DockerService{}
}

// DockerConnect 连接指定 ID 的 Docker 实例。
func (s *DockerService) DockerConnect(id string) (bool, error) {
	c := GetContainer()
	cfg, ok := c.Store.Get(id)
	if !ok {
		return false, errors.New("服务器配置不存在")
	}
	_, err := c.DockerMgr.Connect(cfg)
	if err != nil {
		return false, err
	}
	return true, nil
}

// DockerClose 关闭指定 ID 的 Docker 连接。
func (s *DockerService) DockerClose(id string) error {
	return GetContainer().DockerMgr.Disconnect(id)
}

// DockerTestConnection 测试指定配置的连通性。
func (s *DockerService) DockerTestConnection(cfg core.ServerConfig) (string, error) {
	cli, err := docker.NewDockerClient(cfg)
	if err != nil {
		return "", err
	}
	defer cli.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()

	apiVersion, err := cli.Ping(ctx)
	if err != nil {
		return "", fmt.Errorf("Ping 失败: %w", err)
	}
	return fmt.Sprintf("连接成功！Docker API 版本: %s", apiVersion), nil
}

// DockerPing 检测连接状态。
func (s *DockerService) DockerPing(id string) (string, error) {
	cli, err := GetContainer().DockerMgr.GetClient(id)
	if err != nil {
		return "", err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	return cli.Ping(ctx)
}

// DockerGetOverview 获取概览信息。
func (s *DockerService) DockerGetOverview(id string) (*docker.DockerOverview, error) {
	cli, err := GetContainer().DockerMgr.GetClient(id)
	if err != nil {
		return nil, err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	return cli.GetOverview(ctx)
}

// DockerListContainers 获取容器列表。
func (s *DockerService) DockerListContainers(id string, all bool) ([]docker.DockerContainerInfo, error) {
	cli, err := GetContainer().DockerMgr.GetClient(id)
	if err != nil {
		return nil, err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	return cli.ListContainers(ctx, all)
}

// DockerControlContainer 控制容器生命周期（start, stop, restart, pause, unpause, remove）。
func (s *DockerService) DockerControlContainer(id string, containerID string, action string) error {
	cli, err := GetContainer().DockerMgr.GetClient(id)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	switch strings.ToLower(action) {
	case "start":
		return cli.StartContainer(ctx, containerID)
	case "stop":
		return cli.StopContainer(ctx, containerID)
	case "restart":
		return cli.RestartContainer(ctx, containerID)
	case "pause":
		return cli.PauseContainer(ctx, containerID)
	case "unpause":
		return cli.UnpauseContainer(ctx, containerID)
	case "remove", "rm":
		return cli.RemoveContainer(ctx, containerID, false)
	case "forceremove", "force_remove", "rm_force":
		return cli.RemoveContainer(ctx, containerID, true)
	default:
		return fmt.Errorf("不支持的容器操作: %s", action)
	}
}

// DockerInspectContainer 查看容器 Inspect 详情。
func (s *DockerService) DockerInspectContainer(id string, containerID string) (string, error) {
	cli, err := GetContainer().DockerMgr.GetClient(id)
	if err != nil {
		return "", err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	return cli.InspectContainer(ctx, containerID)
}

// DockerGetContainerLogs 获取容器日志。
func (s *DockerService) DockerGetContainerLogs(id string, containerID string, tail int, timestamps bool) (string, error) {
	cli, err := GetContainer().DockerMgr.GetClient(id)
	if err != nil {
		return "", err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	return cli.GetContainerLogs(ctx, containerID, tail, timestamps)
}

// DockerCreateContainer 创建新容器。
func (s *DockerService) DockerCreateContainer(id string, req docker.DockerCreateContainerReq) (string, error) {
	cli, err := GetContainer().DockerMgr.GetClient(id)
	if err != nil {
		return "", err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	return cli.CreateContainer(ctx, req)
}

// DockerListImages 获取镜像列表。
func (s *DockerService) DockerListImages(id string) ([]docker.DockerImageInfo, error) {
	cli, err := GetContainer().DockerMgr.GetClient(id)
	if err != nil {
		return nil, err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	return cli.ListImages(ctx)
}

// DockerInspectImage 查看镜像 Inspect 详情。
func (s *DockerService) DockerInspectImage(id string, imageID string) (string, error) {
	cli, err := GetContainer().DockerMgr.GetClient(id)
	if err != nil {
		return "", err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	return cli.InspectImage(ctx, imageID)
}

// DockerPullImage 在线拉取镜像。
func (s *DockerService) DockerPullImage(id string, imageName string) (string, error) {
	cli, err := GetContainer().DockerMgr.GetClient(id)
	if err != nil {
		return "", err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	defer cancel()
	return cli.PullImage(ctx, imageName)
}

// DockerRemoveImage 删除镜像。
func (s *DockerService) DockerRemoveImage(id string, imageID string, force bool) error {
	cli, err := GetContainer().DockerMgr.GetClient(id)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	return cli.RemoveImage(ctx, imageID, force)
}

// DockerListVolumes 获取数据卷列表。
func (s *DockerService) DockerListVolumes(id string) ([]docker.DockerVolumeInfo, error) {
	cli, err := GetContainer().DockerMgr.GetClient(id)
	if err != nil {
		return nil, err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	return cli.ListVolumes(ctx)
}

// DockerCreateVolume 创建数据卷。
func (s *DockerService) DockerCreateVolume(id string, name, driver string, labels map[string]string) (*docker.DockerVolumeInfo, error) {
	cli, err := GetContainer().DockerMgr.GetClient(id)
	if err != nil {
		return nil, err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	return cli.CreateVolume(ctx, name, driver, labels)
}

// DockerRemoveVolume 删除数据卷。
func (s *DockerService) DockerRemoveVolume(id string, name string, force bool) error {
	cli, err := GetContainer().DockerMgr.GetClient(id)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	return cli.RemoveVolume(ctx, name, force)
}

// DockerListNetworks 获取网络列表。
func (s *DockerService) DockerListNetworks(id string) ([]docker.DockerNetworkInfo, error) {
	cli, err := GetContainer().DockerMgr.GetClient(id)
	if err != nil {
		return nil, err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	return cli.ListNetworks(ctx)
}

// DockerCreateNetwork 创建网络。
func (s *DockerService) DockerCreateNetwork(id string, name, driver string) (string, error) {
	cli, err := GetContainer().DockerMgr.GetClient(id)
	if err != nil {
		return "", err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	return cli.CreateNetwork(ctx, name, driver)
}

// DockerRemoveNetwork 删除网络。
func (s *DockerService) DockerRemoveNetwork(id string, networkID string) error {
	cli, err := GetContainer().DockerMgr.GetClient(id)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	return cli.RemoveNetwork(ctx, networkID)
}

// DockerSystemPrune 执行系统清理。
func (s *DockerService) DockerSystemPrune(id string, pruneContainers, pruneImages, pruneVolumes, pruneNetworks bool) (*docker.DockerPruneReport, error) {
	cli, err := GetContainer().DockerMgr.GetClient(id)
	if err != nil {
		return nil, err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	return cli.SystemPrune(ctx, pruneContainers, pruneImages, pruneVolumes, pruneNetworks)
}

// DockerListComposeStacks 获取所有 Compose 项目。
func (s *DockerService) DockerListComposeStacks(id string) ([]docker.DockerComposeStackInfo, error) {
	cli, err := GetContainer().DockerMgr.GetClient(id)
	if err != nil {
		return nil, err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	return cli.ListComposeStacks(ctx)
}

// DockerGetComposeStack 获取特定 Compose 项目详情。
func (s *DockerService) DockerGetComposeStack(id string, projectName string) (*docker.DockerComposeStackInfo, error) {
	cli, err := GetContainer().DockerMgr.GetClient(id)
	if err != nil {
		return nil, err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	return cli.GetComposeStack(ctx, projectName)
}

// DockerDeployComposeStack 部署/更新 Compose 项目。
func (s *DockerService) DockerDeployComposeStack(id string, req docker.DockerComposeDeployReq) error {
	cli, err := GetContainer().DockerMgr.GetClient(id)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 180*time.Second)
	defer cancel()
	return cli.DeployComposeStack(ctx, req)
}

// DockerControlComposeStack 控制 Compose 项目（start, stop, restart, down, remove）。
func (s *DockerService) DockerControlComposeStack(id string, projectName string, action string) error {
	cli, err := GetContainer().DockerMgr.GetClient(id)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	return cli.ControlComposeStack(ctx, projectName, action)
}

// DockerGetComposeStackLogs 获取 Compose 项目聚合日志。
func (s *DockerService) DockerGetComposeStackLogs(id string, projectName string, tail int) (string, error) {
	cli, err := GetContainer().DockerMgr.GetClient(id)
	if err != nil {
		return "", err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	return cli.GetComposeStackLogs(ctx, projectName, tail)
}

