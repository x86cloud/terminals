package proto

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"errors"
	"fmt"
	"os"
	"sort"
	"strings"
	"sync"
	"time"

	"terminal/core"

	pahomqtt "github.com/eclipse/paho.mqtt.golang"
	"github.com/google/uuid"
)

type mqttConn struct {
	client pahomqtt.Client
	subs   map[string]byte
	mu     sync.Mutex
}

type MqttManager struct {
	mu    sync.Mutex
	ctx   context.Context
	conns map[string]*mqttConn
}

func NewMqttManager() *MqttManager {
	return &MqttManager{conns: map[string]*mqttConn{}}
}

func (m *MqttManager) SetContext(ctx context.Context) {
	m.ctx = ctx
}

func (m *MqttManager) Get(id string) (*mqttConn, bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	c, ok := m.conns[id]
	return c, ok
}

func (m *MqttManager) put(id string, c *mqttConn) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.conns[id] = c
}

func (m *MqttManager) Close(id string) {
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

func (m *MqttManager) CloseAll() {
	m.mu.Lock()
	ids := make([]string, 0, len(m.conns))
	for id := range m.conns {
		ids = append(ids, id)
	}
	m.mu.Unlock()
	for _, id := range ids {
		m.Close(id)
	}
}

// Connect 建立 MQTT 连接并订阅消息回调（通过事件推送到前端）。
func (m *MqttManager) Connect(cfg core.ServerConfig) (bool, error) {
	id := cfg.ID
	if cfg.ConnType() != core.ConnMqtt {
		return false, errors.New("该连接不是 MQTT 类型")
	}
	m.Close(id)

	scheme := "tcp"
	if cfg.UseTLS {
		scheme = "ssl"
	}
	port := cfg.Port
	if port == 0 {
		port = 1883
	}
	broker := fmt.Sprintf("%s://%s:%d", scheme, cfg.Host, port)

	clientID := strings.TrimSpace(cfg.ClientID)
	if clientID == "" {
		clientID = "wails-mqtt-" + uuid.NewString()
	}

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
	opts := pahomqtt.NewClientOptions().
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
		SetDefaultPublishHandler(func(_ pahomqtt.Client, msg pahomqtt.Message) {
			core.EmitEvent("mqtt:message:"+id, map[string]any{
				"topic":    msg.Topic(),
				"payload":  string(msg.Payload()),
				"qos":      int(msg.Qos()),
				"retained": msg.Retained(),
				"ts":       time.Now().UnixMilli(),
			})
		}).
		SetOnConnectHandler(func(_ pahomqtt.Client) {
			core.EmitEvent("mqtt:status:"+id, map[string]any{"connected": true})
		}).
		SetConnectionLostHandler(func(_ pahomqtt.Client, err error) {
			core.EmitEvent("mqtt:status:"+id, map[string]any{"connected": false, "error": err.Error()})
		})

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

	if strings.TrimSpace(cfg.MqttWillTopic) != "" {
		willQos := cfg.MqttWillQos
		if willQos < 0 || willQos > 2 {
			willQos = 0
		}
		opts.SetWill(cfg.MqttWillTopic, cfg.MqttWillPayload, byte(willQos), cfg.MqttWillRetained)
	}

	client := pahomqtt.NewClient(opts)
	token := client.Connect()
	if !token.WaitTimeout(time.Duration(connectTimeout) * time.Second) {
		return false, errors.New("MQTT 连接超时")
	}
	if err := token.Error(); err != nil {
		return false, err
	}
	conn.client = client
	m.put(id, conn)
	return true, nil
}

func (m *MqttManager) Publish(id string, topic string, payload string, qos int, retained bool) error {
	c, ok := m.Get(id)
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

func (m *MqttManager) Subscribe(id string, topic string, qos int) error {
	c, ok := m.Get(id)
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

func (m *MqttManager) Unsubscribe(id string, topic string) error {
	c, ok := m.Get(id)
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

func (m *MqttManager) Subscriptions(id string) ([]map[string]any, error) {
	c, ok := m.Get(id)
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

// TestConnection 测试 MQTT Broker 连接连通性
func (m *MqttManager) TestConnection(cfg core.ServerConfig) (map[string]any, error) {
	scheme := "tcp"
	if cfg.UseTLS {
		scheme = "ssl"
	}
	port := cfg.Port
	if port == 0 {
		port = 1883
	}
	broker := fmt.Sprintf("%s://%s:%d", scheme, cfg.Host, port)

	clientID := strings.TrimSpace(cfg.ClientID)
	if clientID == "" {
		clientID = "wails-test-mqtt-" + uuid.NewString()
	}

	opts := pahomqtt.NewClientOptions().
		AddBroker(broker).
		SetClientID(clientID).
		SetConnectTimeout(5 * time.Second).
		SetAutoReconnect(false).
		SetCleanSession(true).
		SetUsername(cfg.Username).
		SetPassword(cfg.Password)

	if cfg.UseTLS {
		tlsCfg := &tls.Config{}
		if strings.TrimSpace(cfg.MqttCACert) != "" {
			pool, err := loadCertPool(cfg.MqttCACert)
			if err != nil {
				return nil, fmt.Errorf("加载 CA 证书失败: %v", err)
			}
			tlsCfg.RootCAs = pool
		}
		if strings.TrimSpace(cfg.MqttClientCert) != "" && strings.TrimSpace(cfg.MqttClientKey) != "" {
			cert, err := loadClientCert(cfg.MqttClientCert, cfg.MqttClientKey)
			if err != nil {
				return nil, fmt.Errorf("加载客户端证书失败: %v", err)
			}
			tlsCfg.Certificates = []tls.Certificate{cert}
		}
		if cfg.MqttInsecure {
			tlsCfg.InsecureSkipVerify = true
		}
		opts.SetTLSConfig(tlsCfg)
	}

	client := pahomqtt.NewClient(opts)
	start := time.Now()
	token := client.Connect()
	if !token.WaitTimeout(5 * time.Second) {
		return nil, errors.New("MQTT 连接超时 (5s)")
	}
	if err := token.Error(); err != nil {
		return nil, err
	}
	defer client.Disconnect(100)
	latency := time.Since(start).Milliseconds()
	return map[string]any{
		"connected": true,
		"pingMs":    latency,
	}, nil
}

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
