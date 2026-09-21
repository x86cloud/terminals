package services

import (
	"errors"
	"terminal/core"
	"terminal/logger"
)

type MqttService struct{}

func NewMqttService() *MqttService {
	return &MqttService{}
}

func (s *MqttService) MqttConnect(id string) (bool, error) {
	c := GetContainer()
	cfg, ok := c.Store.Get(id)
	if !ok {
		err := errors.New("服务器配置不存在")
		logger.Errorf("MQTT 连接失败: 服务器配置不存在 [ID=%s]", id)
		return false, err
	}
	logger.Infof("正在发起 MQTT Broker 连接: ID=%s, 名称=%s, 主机=%s:%d", cfg.ID, cfg.Name, cfg.Host, cfg.Port)
	ok, err := c.MqttMgr.Connect(cfg)
	if err != nil {
		logger.Errorf("MQTT Broker 连接失败 [ID=%s, 主机=%s:%d]: %v", id, cfg.Host, cfg.Port, err)
		return false, err
	}
	logger.Infof("MQTT Broker 连接成功: ID=%s, 主机=%s:%d", id, cfg.Host, cfg.Port)
	return ok, nil
}

func (s *MqttService) MqttClose(id string) error {
	logger.Infof("关闭 MQTT Broker 连接 [ID=%s]", id)
	GetContainer().MqttMgr.Close(id)
	return nil
}

func (s *MqttService) MqttPublish(id string, topic string, payload string, qos int, retained bool) error {
	logger.Infof("MQTT 发布消息 [ID=%s, Topic=%s, QoS=%d, Retained=%v, PayloadBytes=%d]", id, topic, qos, retained, len(payload))
	if err := GetContainer().MqttMgr.Publish(id, topic, payload, qos, retained); err != nil {
		logger.Errorf("MQTT 发布消息失败 [ID=%s, Topic=%s]: %v", id, topic, err)
		return err
	}
	return nil
}

func (s *MqttService) MqttSubscribe(id string, topic string, qos int) error {
	logger.Infof("MQTT 订阅主题 [ID=%s, Topic=%s, QoS=%d]", id, topic, qos)
	if err := GetContainer().MqttMgr.Subscribe(id, topic, qos); err != nil {
		logger.Errorf("MQTT 订阅失败 [ID=%s, Topic=%s]: %v", id, topic, err)
		return err
	}
	return nil
}

func (s *MqttService) MqttUnsubscribe(id string, topic string) error {
	logger.Infof("MQTT 取消订阅 [ID=%s, Topic=%s]", id, topic)
	if err := GetContainer().MqttMgr.Unsubscribe(id, topic); err != nil {
		logger.Errorf("MQTT 取消订阅失败 [ID=%s, Topic=%s]: %v", id, topic, err)
		return err
	}
	return nil
}

func (s *MqttService) MqttSubscriptions(id string) ([]map[string]any, error) {
	return GetContainer().MqttMgr.Subscriptions(id)
}

func (s *MqttService) MqttTestConnection(cfg core.ServerConfig) (map[string]any, error) {
	logger.Infof("测试 MQTT Broker 连通性: 主机=%s:%d", cfg.Host, cfg.Port)
	res, err := GetContainer().MqttMgr.TestConnection(cfg)
	if err != nil {
		logger.Errorf("测试 MQTT 连通性失败 [主机=%s:%d]: %v", cfg.Host, cfg.Port, err)
		return nil, err
	}
	return res, nil
}
