package services

import (
	"errors"
	"terminal/core"
)

type MqttService struct{}

func NewMqttService() *MqttService {
	return &MqttService{}
}

func (s *MqttService) MqttConnect(id string) (bool, error) {
	c := GetContainer()
	cfg, ok := c.Store.Get(id)
	if !ok {
		return false, errors.New("服务器配置不存在")
	}
	return c.MqttMgr.Connect(cfg)
}

func (s *MqttService) MqttClose(id string) error {
	GetContainer().MqttMgr.Close(id)
	return nil
}

func (s *MqttService) MqttPublish(id string, topic string, payload string, qos int, retained bool) error {
	return GetContainer().MqttMgr.Publish(id, topic, payload, qos, retained)
}

func (s *MqttService) MqttSubscribe(id string, topic string, qos int) error {
	return GetContainer().MqttMgr.Subscribe(id, topic, qos)
}

func (s *MqttService) MqttUnsubscribe(id string, topic string) error {
	return GetContainer().MqttMgr.Unsubscribe(id, topic)
}

func (s *MqttService) MqttSubscriptions(id string) ([]map[string]any, error) {
	return GetContainer().MqttMgr.Subscriptions(id)
}

func (s *MqttService) MqttTestConnection(cfg core.ServerConfig) (map[string]any, error) {
	return GetContainer().MqttMgr.TestConnection(cfg)
}
