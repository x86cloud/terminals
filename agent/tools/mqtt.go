package tools

import (
	"context"
	"fmt"
	"terminal/agent/guard"
	"terminal/proto"

	"github.com/cloudwego/eino/components/tool/utils"
)

type MqttPublishInput struct {
	ServerID string `json:"server_id" jsonschema:"description=已连接的 MQTT 会话 ID"`
	Topic    string `json:"topic" jsonschema:"description=要发布的目标 Topic"`
	Payload  string `json:"payload" jsonschema:"description=消息内容 (文本或 JSON)"`
	QoS      int    `json:"qos" jsonschema:"description=服务质量等级 QoS (0, 1, 2)，默认为 0"`
	Retained bool   `json:"retained" jsonschema:"description=是否设置为保留消息 (Retain)"`
}

type MqttSubscribeInput struct {
	ServerID string `json:"server_id" jsonschema:"description=已连接的 MQTT 会话 ID"`
	Topic    string `json:"topic" jsonschema:"description=要订阅的目标 Topic"`
	QoS      int    `json:"qos" jsonschema:"description=服务质量等级 QoS (0, 1, 2)，默认为 0"`
}

func RegisterMqttTools(bus *ToolBus, mgr *proto.MqttManager) error {
	if mgr == nil {
		return nil
	}

	pubTool, err := utils.InferTool("mqtt_publish", "向已连接的 MQTT Broker 发布指定 Topic 消息",
		func(ctx context.Context, input *MqttPublishInput) (string, error) {
			if err := mgr.Publish(input.ServerID, input.Topic, input.Payload, input.QoS, input.Retained); err != nil {
				return "", fmt.Errorf("MQTT 消息发布失败: %w", err)
			}
			return fmt.Sprintf("成功向 Topic [%s] 发送消息 (%d 字节)", input.Topic, len(input.Payload)), nil
		})
	if err == nil {
		bus.Register(&RegisteredTool{
			Name:        "mqtt_publish",
			Description: "向已连接的 MQTT Broker 发布指定 Topic 消息",
			BaseTool:    pubTool,
			Level:       guard.LevelConfirm,
		})
	}

	subTool, err := utils.InferTool("mqtt_subscribe_once", "订阅 MQTT Broker 指定 Topic",
		func(ctx context.Context, input *MqttSubscribeInput) (string, error) {
			if err := mgr.Subscribe(input.ServerID, input.Topic, input.QoS); err != nil {
				return "", fmt.Errorf("MQTT 订阅失败: %w", err)
			}
			return fmt.Sprintf("成功订阅 Topic [%s]", input.Topic), nil
		})
	if err == nil {
		bus.Register(&RegisteredTool{
			Name:        "mqtt_subscribe_once",
			Description: "订阅 MQTT Broker 指定 Topic",
			BaseTool:    subTool,
			Level:       guard.LevelAllow,
		})
	}

	return nil
}
