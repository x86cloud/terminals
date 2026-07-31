package main

import (
	"crypto/tls"
	"crypto/x509"
	"errors"
	"fmt"
	"os"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/eclipse/paho.mqtt.golang"
	"github.com/google/uuid"
	wruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

type mqttConn struct {
	client mqtt.Client
	subs   map[string]byte
	mu     sync.Mutex
}

type mqttManager struct {
	mu    sync.Mutex
	conns map[string]*mqttConn
}

func newMqttManager() *mqttManager {
	return &mqttManager{conns: map[string]*mqttConn{}}
}

func (m *mqttManager) get(id string) (*mqttConn, bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	c, ok := m.conns[id]
	return c, ok
}

func (m *mqttManager) put(id string, c *mqttConn) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.conns[id] = c
}

func (m *mqttManager) close(id string) {
	m.mu.Lock()
	c, ok := m.conns[id]
	if ok {
		delete(m.conns, id)
	}
	m.mu.Unlock()
	if ok && c.client != nil {
		c.client.Disconnect(250)
	}
}

func (m *mqttManager) closeAll() {
	m.mu.Lock()
	ids := make([]string, 0, len(m.conns))
	for id := range m.conns {
		ids = append(ids, id)
	}
	m.mu.Unlock()
	for _, id := range ids {
		m.close(id)
	}
}

// MqttConnect 建立 MQTT 连接并订阅消息回调（通过事件推送到前端）。
func (a *App) MqttConnect(id string) (bool, error) {
	cfg, ok := a.store.Get(id)
	if !ok {
		return false, errors.New("找不到该服务器配置")
	}
	if cfg.connType() != ConnMqtt {
		return false, errors.New("该连接不是 MQTT 类型")
	}
	a.mqttMgr.close(id)

	scheme := "tcp"
	if cfg.UseTLS {
		scheme = "ssl"
	}
	if cfg.Port == 0 {
		cfg.Port = 1883
	}
	broker := fmt.Sprintf("%s://%s:%d", scheme, cfg.Host, cfg.Port)

	clientID := strings.TrimSpace(cfg.ClientID)
	if clientID == "" {
		clientID = "wails-mqtt-" + uuid.NewString()
	}

	// 解析高级参数（带默认值兜底）
	keepAlive := cfg.MqttKeepAlive
	if keepAlive <= 0 {
		keepAlive = 30
	}
	connectTimeout := cfg.MqttConnectTimeout
	if connectTimeout <= 0 {
		connectTimeout = 10
	}
	reconnectIntvl := cfg.MqttReconnectIntvl
	if reconnectIntvl <= 0 {
		reconnectIntvl = 5
	}
	var protoVersion uint = 4 // MQTT 3.1.1
	if cfg.MqttProto == "3.1" {
		protoVersion = 3
	}
	cleanSession := cfg.MqttCleanSession
	autoReconnect := cfg.MqttAutoReconnect

	conn := &mqttConn{subs: map[string]byte{}}
	opts := mqtt.NewClientOptions().
		AddBroker(broker).
		SetClientID(clientID).
		SetProtocolVersion(protoVersion).
		SetAutoReconnect(autoReconnect).
		SetConnectRetry(autoReconnect).
		SetConnectRetryInterval(time.Duration(reconnectIntvl) * time.Second).
		SetKeepAlive(time.Duration(keepAlive) * time.Second).
		SetPingTimeout(time.Duration(connectTimeout) * time.Second).
		SetCleanSession(cleanSession).
		SetUsername(cfg.Username).
		SetPassword(cfg.Password).
		SetDefaultPublishHandler(func(_ mqtt.Client, msg mqtt.Message) {
			wruntime.EventsEmit(a.ctx, "mqtt:message:"+id, map[string]any{
				"topic":    msg.Topic(),
				"payload":  string(msg.Payload()),
				"qos":      int(msg.Qos()),
				"retained": msg.Retained(),
				"ts":       time.Now().UnixMilli(),
			})
		}).
		SetOnConnectHandler(func(_ mqtt.Client) {
			wruntime.EventsEmit(a.ctx, "mqtt:status:"+id, map[string]any{"connected": true})
		}).
		SetConnectionLostHandler(func(_ mqtt.Client, err error) {
			wruntime.EventsEmit(a.ctx, "mqtt:status:"+id, map[string]any{"connected": false, "error": err.Error()})
		})

	// TLS：支持 CA 证书校验与客户端证书双向认证（自签证书场景）
	if cfg.UseTLS {
		tlsCfg := &tls.Config{}
		if strings.TrimSpace(cfg.MqttCACert) != "" {
			pool, err := loadCertPool(cfg.MqttCACert)
			if err != nil {
				return false, fmt.Errorf("加载 CA 证书失败: %v", err)
			}
			tlsCfg.RootCAs = pool
		}
		if strings.TrimSpace(cfg.MqttClientCert) != "" && strings.TrimSpace(cfg.MqttClientKey) != "" {
			cert, err := loadClientCert(cfg.MqttClientCert, cfg.MqttClientKey)
			if err != nil {
				return false, fmt.Errorf("加载客户端证书失败: %v", err)
			}
			tlsCfg.Certificates = []tls.Certificate{cert}
		}
		if cfg.MqttInsecure {
			tlsCfg.InsecureSkipVerify = true
		}
		opts.SetTLSConfig(tlsCfg)
	}

	// 遗嘱消息 (Last Will)
	if strings.TrimSpace(cfg.MqttWillTopic) != "" {
		willQos := cfg.MqttWillQos
		if willQos < 0 || willQos > 2 {
			willQos = 0
		}
		opts.SetWill(cfg.MqttWillTopic, cfg.MqttWillPayload, byte(willQos), cfg.MqttWillRetained)
	}

	client := mqtt.NewClient(opts)
	token := client.Connect()
	if !token.WaitTimeout(time.Duration(connectTimeout) * time.Second) {
		return false, errors.New("MQTT 连接超时")
	}
	if err := token.Error(); err != nil {
		return false, err
	}
	conn.client = client
	a.mqttMgr.put(id, conn)
	return true, nil
}

// MqttClose 关闭 MQTT 连接。
func (a *App) MqttClose(id string) {
	a.mqttMgr.close(id)
}

// MqttPublish 发布消息。
func (a *App) MqttPublish(id string, topic string, payload string, qos int, retained bool) error {
	c, ok := a.mqttMgr.get(id)
	if !ok {
		return errors.New("MQTT 连接不存在或已断开，请重新连接")
	}
	if strings.TrimSpace(topic) == "" {
		return errors.New("主题不能为空")
	}
	if qos < 0 || qos > 2 {
		qos = 0
	}
	token := c.client.Publish(topic, byte(qos), retained, payload)
	if !token.WaitTimeout(10 * time.Second) {
		return errors.New("发布超时")
	}
	return token.Error()
}

// MqttSubscribe 订阅主题。
func (a *App) MqttSubscribe(id string, topic string, qos int) error {
	c, ok := a.mqttMgr.get(id)
	if !ok {
		return errors.New("MQTT 连接不存在或已断开，请重新连接")
	}
	if strings.TrimSpace(topic) == "" {
		return errors.New("主题不能为空")
	}
	if qos < 0 || qos > 2 {
		qos = 0
	}
	token := c.client.Subscribe(topic, byte(qos), nil)
	if !token.WaitTimeout(10 * time.Second) {
		return errors.New("订阅超时")
	}
	if err := token.Error(); err != nil {
		return err
	}
	c.mu.Lock()
	c.subs[topic] = byte(qos)
	c.mu.Unlock()
	return nil
}

// MqttUnsubscribe 取消订阅。
func (a *App) MqttUnsubscribe(id string, topic string) error {
	c, ok := a.mqttMgr.get(id)
	if !ok {
		return errors.New("MQTT 连接不存在或已断开，请重新连接")
	}
	token := c.client.Unsubscribe(topic)
	if !token.WaitTimeout(10 * time.Second) {
		return errors.New("取消订阅超时")
	}
	if err := token.Error(); err != nil {
		return err
	}
	c.mu.Lock()
	delete(c.subs, topic)
	c.mu.Unlock()
	return nil
}

// MqttSubscriptions 返回当前已订阅的主题列表。
func (a *App) MqttSubscriptions(id string) ([]map[string]any, error) {
	c, ok := a.mqttMgr.get(id)
	if !ok {
		return nil, errors.New("MQTT 连接不存在或已断开，请重新连接")
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	out := make([]map[string]any, 0, len(c.subs))
	for t, q := range c.subs {
		out = append(out, map[string]any{"topic": t, "qos": int(q)})
	}
	sort.Slice(out, func(i, j int) bool {
		return out[i]["topic"].(string) < out[j]["topic"].(string)
	})
	return out, nil
}

// loadCertPool 从 PEM 文件或 PEM 文本加载 CA 证书池。
// 若入参是已存在的文件路径则读取文件，否则当作 PEM 文本内容处理，
// 以便用户既可选填路径也能直接粘贴证书内容。
func loadCertPool(input string) (*x509.CertPool, error) {
	input = strings.TrimSpace(input)
	var data []byte
	if b, err := os.ReadFile(input); err == nil {
		data = b
	} else {
		data = []byte(input)
	}
	pool := x509.NewCertPool()
	if !pool.AppendCertsFromPEM(data) {
		return nil, errors.New("证书内容无法解析（请检查是否为有效的 PEM 格式）")
	}
	return pool, nil
}

// loadClientCert 从 PEM 文件或 PEM 文本加载客户端证书与私钥对。
func loadClientCert(certInput, keyInput string) (tls.Certificate, error) {
	certInput = strings.TrimSpace(certInput)
	keyInput = strings.TrimSpace(keyInput)
	var certData, keyData []byte
	if b, err := os.ReadFile(certInput); err == nil {
		certData = b
	} else {
		certData = []byte(certInput)
	}
	if b, err := os.ReadFile(keyInput); err == nil {
		keyData = b
	} else {
		keyData = []byte(keyInput)
	}
	return tls.X509KeyPair(certData, keyData)
}
