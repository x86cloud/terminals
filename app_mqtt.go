package main

import (
	"errors"
)

// ---------- MQTT API ----------

func (a *App) MqttConnect(id string) (bool, error) {
	cfg, ok := a.store.Get(id)
	if !ok {
		return false, errors.New("服务器配置不存在")
	}
	return a.mqttMgr.Connect(cfg)
}

func (a *App) MqttClose(id string) error {
	a.mqttMgr.Close(id)
	return nil
}

func (a *App) MqttPublish(id string, topic string, payload string, qos int, retained bool) error {
	return a.mqttMgr.Publish(id, topic, payload, qos, retained)
}

func (a *App) MqttSubscribe(id string, topic string, qos int) error {
	return a.mqttMgr.Subscribe(id, topic, qos)
}

func (a *App) MqttUnsubscribe(id string, topic string) error {
	return a.mqttMgr.Unsubscribe(id, topic)
}

func (a *App) MqttSubscriptions(id string) ([]map[string]any, error) {
	return a.mqttMgr.Subscriptions(id)
}
