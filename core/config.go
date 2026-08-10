package core

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
)

const (
	appDirName = "xClient"
	encPrefix  = "enc:v1:"
)

// ConnType 区分连接类型。
type ConnType string

const (
	// ConnSSH 远程 Linux 服务器（Shell + SFTP）。
	ConnSSH ConnType = "ssh"
	// ConnRedis Redis 实例，使用内置 Redis 客户端管理。
	ConnRedis ConnType = "redis"
	// ConnMysql MySQL 实例，使用内置 MySQL 客户端管理。
	ConnMysql ConnType = "mysql"
	// ConnMqtt MQTT 代理，使用内置 MQTT 客户端管理。
	ConnMqtt ConnType = "mqtt"
	// ConnMongo MongoDB 实例，使用内置 MongoDB 客户端管理。
	ConnMongo ConnType = "mongo"
	// ConnSqlite 本地 SQLite 数据库文件，使用内置 SQLite 客户端管理。
	ConnSqlite ConnType = "sqlite"
)

// ServerGroup 描述服务器分组。
type ServerGroup struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

// ServerConfig 描述一台远程服务器的连接信息。Type 字段区分 SSH / Redis / MySQL。
type ServerConfig struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	GroupID    string `json:"groupId,omitempty"` // 所属分组 ID，空表示未分组
	Host       string `json:"host"`
	Port       int    `json:"port"`
	Username   string `json:"username"`
	AuthType   string `json:"authType"` // password | key (SSH 专用)
	Password   string `json:"password"`
	PrivateKey string `json:"privateKey"` // 私钥文件路径或 PEM 内容
	Passphrase string `json:"passphrase"`
	Remark     string `json:"remark"`
	Type       string `json:"type"`        // ssh | redis | mysql | mqtt
	DB         int    `json:"db,omitempty"` // Redis 数据库编号

	// Redis 高级配置
	RedisMode            string `json:"redisMode,omitempty"`            // single | sentinel | cluster
	RedisSentinels       string `json:"redisSentinels,omitempty"`       // 哨兵地址，逗号分隔
	RedisMasterName      string `json:"redisMasterName,omitempty"`      // 哨兵 master 名称
	RedisClusterNodes    string `json:"redisClusterNodes,omitempty"`    // 集群节点，逗号分隔
	RedisUsername        string `json:"redisUsername,omitempty"`        // Redis 6 ACL 用户名
	RedisSerialization   string `json:"redisSerialization,omitempty"`   // none | json
	RedisPoolSize        int    `json:"redisPoolSize,omitempty"`         // 最大连接数
	RedisMinIdleConns    int    `json:"redisMinIdleConns,omitempty"`     // 最小空闲连接
	RedisMaxIdleConns    int    `json:"redisMaxIdleConns,omitempty"`     // 最大空闲连接
	RedisPoolTimeout     int    `json:"redisPoolTimeout,omitempty"`      // 获取连接超时（秒）
	RedisConnMaxIdleTime int    `json:"redisConnMaxIdleTime,omitempty"`  // 连接最大空闲时间（秒）
	RedisConnMaxLifetime int    `json:"redisConnMaxLifetime,omitempty"`  // 连接最大存活时间（秒）
	RedisDialTimeout     int    `json:"redisDialTimeout,omitempty"`      // 拨号超时（秒）
	RedisReadTimeout     int    `json:"redisReadTimeout,omitempty"`      // 读超时（秒）
	RedisWriteTimeout    int    `json:"redisWriteTimeout,omitempty"`     // 写超时（秒）
	RedisMaxRetries      int    `json:"redisMaxRetries,omitempty"`       // 命令最大重试次数
	RedisMinRetryBackoff int    `json:"redisMinRetryBackoff,omitempty"`  // 重试最小退避（秒）
	RedisMaxRetryBackoff int    `json:"redisMaxRetryBackoff,omitempty"`  // 重试最大退避（秒）
	RedisBreakerThreshold int   `json:"redisBreakerThreshold,omitempty"` // 熔断器打开阈值（连续失败次数）
	RedisBreakerCooldown  int   `json:"redisBreakerCooldown,omitempty"`   // 熔断器冷却时间（秒）

	// MySQL 高级配置
	Database   string `json:"database,omitempty"` // MySQL 默认数据库（可选）
	MysqlMaxOpenConns      int    `json:"mysqlMaxOpenConns,omitempty"`      // 连接池最大打开连接
	MysqlMaxIdleConns      int    `json:"mysqlMaxIdleConns,omitempty"`      // 连接池最大空闲连接
	MysqlConnMaxLifetime   int    `json:"mysqlConnMaxLifetime,omitempty"`   // 连接最大存活（秒）
	MysqlTLS               string `json:"mysqlTLS,omitempty"`               // 空 / "true" / "skip-verify" / "preferred"
	MysqlSSLEnabled        bool   `json:"mysqlSSLEnabled,omitempty"`        // 是否启用 SSL
	MysqlSSHEnabled        bool   `json:"mysqlSSHEnabled,omitempty"`        // 是否启用 SSH 隧道
	MysqlSSHHost           string `json:"mysqlSSHHost,omitempty"`           // 跳板机地址
	MysqlSSHHostPort       int    `json:"mysqlSSHHostPort,omitempty"`       // 跳板机端口
	MysqlSSHUser           string `json:"mysqlSSHUser,omitempty"`           // 跳板机用户名
	MysqlSSHKeyPath        string `json:"mysqlSSHKeyPath,omitempty"`        // 跳板机私钥路径
	MysqlSSHKeyData        string `json:"mysqlSSHKeyData,omitempty"`        // 跳板机私钥内容
	MysqlSSHPassphrase     string `json:"mysqlSSHPassphrase,omitempty"`     // 私钥口令
	MysqlSSHProxyLocalPort int    `json:"mysqlSSHProxyLocalPort,omitempty"` // 本地监听端口（0=自动）

	// MongoDB 高级配置
	MongoURI                 string `json:"mongoUri,omitempty"`                 // 完整连接串，填写后优先生效
	MongoSRV                 bool   `json:"mongoSrv,omitempty"`                 // 使用 mongodb+srv:// 方案
	MongoHosts               string `json:"mongoHosts,omitempty"`               // 多节点种子列表，逗号分隔 host:port
	MongoDatabase            string `json:"mongoDatabase,omitempty"`            // 默认数据库
	MongoAuthMech            string `json:"mongoAuthMech,omitempty"`            // none | SCRAM-SHA-1 | SCRAM-SHA-256 | MONGODB-X509
	MongoAuthSource          string `json:"mongoAuthSource,omitempty"`          // 认证库，默认 admin
	MongoReplicaSet          string `json:"mongoReplicaSet,omitempty"`          // 副本集名称
	MongoReadPreference      string `json:"mongoReadPreference,omitempty"`      // primary | secondary | nearest 等
	MongoTLSEnabled          bool   `json:"mongoTlsEnabled,omitempty"`          // 启用 TLS/SSL
	MongoTLSInsecure         bool   `json:"mongoTlsInsecure,omitempty"`         // 跳过证书校验
	MongoTLSCACert           string `json:"mongoTlsCaCert,omitempty"`           // CA 证书（PEM 内容或路径）
	MongoTLSClientCert       string `json:"mongoTlsClientCert,omitempty"`       // 客户端证书（X.509 认证用）
	MongoTLSClientKey        string `json:"mongoTlsClientKey,omitempty"`        // 客户端私钥
	MongoMaxPoolSize         int    `json:"mongoMaxPoolSize,omitempty"`         // 连接池最大连接数
	MongoMinPoolSize         int    `json:"mongoMinPoolSize,omitempty"`         // 连接池最小连接数
	MongoMaxConnIdleTime     int    `json:"mongoMaxConnIdleTime,omitempty"`     // 连接最大空闲时间（秒）
	MongoConnectTimeout      int    `json:"mongoConnectTimeout,omitempty"`      // 连接超时（秒）
	MongoServerSelectTimeout int    `json:"mongoServerSelectTimeout,omitempty"` // 服务器选择超时（秒）
	MongoSocketTimeout       int    `json:"mongoSocketTimeout,omitempty"`       // 单次操作超时（秒）
	MongoCompressors         string `json:"mongoCompressors,omitempty"`         // 压缩算法，逗号分隔 snappy,zlib,zstd
	MongoAppName             string `json:"mongoAppName,omitempty"`             // 上报给服务端的应用名

	ClientID   string `json:"clientId,omitempty"` // MQTT 客户端 ID（可选）
	UseTLS     bool   `json:"useTLS,omitempty"`    // MQTT 是否使用 TLS

	// SQLite 本地文件配置
	SqlitePath string `json:"sqlitePath,omitempty"` // 本地 .db / .sqlite 文件路径

	// MQTT 高级配置
	MqttProto          string `json:"mqttProto,omitempty"`            // 协议版本："3.1.1" | "3.1"
	MqttKeepAlive      int    `json:"mqttKeepAlive,omitempty"`        // 心跳间隔（秒）
	MqttConnectTimeout int    `json:"mqttConnectTimeout,omitempty"`   // 连接超时（秒）
	MqttCleanSession   bool   `json:"mqttCleanSession,omitempty"`     // 清除会话
	MqttAutoReconnect  bool   `json:"mqttAutoReconnect,omitempty"`    // 自动重连
	MqttReconnectIntvl int    `json:"mqttReconnectIntvl,omitempty"`   // 重连间隔（秒）
	MqttInsecure       bool   `json:"mqttInsecure,omitempty"`         // TLS 跳过证书校验
	MqttCACert         string `json:"mqttCaCert,omitempty"`           // TLS CA 证书（PEM 内容或文件路径）
	MqttClientCert     string `json:"mqttClientCert,omitempty"`       // TLS 客户端证书（PEM 内容或文件路径）
	MqttClientKey      string `json:"mqttClientKey,omitempty"`        // TLS 客户端私钥（PEM 内容或文件路径）
	MqttWillTopic      string `json:"mqttWillTopic,omitempty"`        // 遗嘱主题
	MqttWillPayload    string `json:"mqttWillPayload,omitempty"`      // 遗嘱消息
	MqttWillQos        int    `json:"mqttWillQos,omitempty"`          // 遗嘱 QoS
	MqttWillRetained   bool   `json:"mqttWillRetained,omitempty"`     // 遗嘱保留

	UpdatedAt int64 `json:"updatedAt"`
}

func (c ServerConfig) ConnType() ConnType {
	switch c.Type {
	case string(ConnRedis):
		return ConnRedis
	case string(ConnMysql):
		return ConnMysql
	case string(ConnMqtt):
		return ConnMqtt
	case string(ConnMongo):
		return ConnMongo
	case string(ConnSqlite):
		return ConnSqlite
	}
	return ConnSSH
}

func (c ServerConfig) Label() string {
	if strings.TrimSpace(c.Name) != "" {
		return c.Name
	}
	switch c.ConnType() {
	case ConnRedis, ConnMysql, ConnMqtt, ConnMongo:
		return fmt.Sprintf("%s:%d", c.Host, c.DisplayPort())
	case ConnSqlite:
		if name := c.SqlitePath; name != "" {
			return filepath.Base(name)
		}
	}
	return fmt.Sprintf("%s@%s", c.Username, c.Host)
}

func (c ServerConfig) DisplayPort() int {
	if c.Port > 0 {
		return c.Port
	}
	switch c.ConnType() {
	case ConnRedis:
		return 6379
	case ConnMysql:
		return 3306
	case ConnMqtt:
		return 1883
	case ConnMongo:
		return 27017
	case ConnSqlite:
		return 0
	}
	return 22
}

func (c ServerConfig) MysqlSSHHostPortOr() int {
	if c.MysqlSSHHostPort > 0 {
		return c.MysqlSSHHostPort
	}
	return 22
}

func (c ServerConfig) Addr() string {
	return fmt.Sprintf("%s:%d", c.Host, c.DisplayPort())
}

func (c ServerConfig) Validate() error {
	// MongoDB 允许仅凭连接串或种子节点列表建立连接，此时主机可留空
	if c.ConnType() == ConnMongo {
		if strings.TrimSpace(c.Host) == "" &&
			strings.TrimSpace(c.MongoURI) == "" &&
			strings.TrimSpace(c.MongoHosts) == "" {
			return errors.New("请填写主机地址、种子节点或完整连接字符串")
		}
		if c.MongoAuthMech == "MONGODB-X509" && strings.TrimSpace(c.MongoTLSClientCert) == "" {
			return errors.New("X.509 认证需要提供客户端证书")
		}
		return nil
	}
	// SQLite 为本地文件连接，仅需有效的文件路径
	if c.ConnType() == ConnSqlite {
		if strings.TrimSpace(c.SqlitePath) == "" {
			return errors.New("请选择 SQLite 数据库文件（.db / .sqlite）")
		}
		return nil
	}
	if strings.TrimSpace(c.Host) == "" {
		return errors.New("主机地址不能为空")
	}
	switch c.ConnType() {
	case ConnRedis:
		return nil
	case ConnMysql:
		if strings.TrimSpace(c.Username) == "" {
			return errors.New("用户名不能为空")
		}
		return nil
	case ConnMqtt:
		return nil
	}
	if strings.TrimSpace(c.Username) == "" {
		return errors.New("用户名不能为空")
	}
	if c.AuthType == authTypeKey && strings.TrimSpace(c.PrivateKey) == "" {
		return errors.New("请选择私钥文件或填写私钥内容")
	}
	return nil
}

const (
	authTypePassword = "password"
	authTypeKey      = "key"
)

// secretBox 使用 AES-GCM 加密本地保存的敏感字段。
type secretBox struct {
	gcm cipher.AEAD
}

func newSecretBox(key []byte) (*secretBox, error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	return &secretBox{gcm: gcm}, nil
}

func (s *secretBox) encrypt(plain string) string {
	if plain == "" {
		return ""
	}
	nonce := make([]byte, s.gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return plain
	}
	sealed := s.gcm.Seal(nonce, nonce, []byte(plain), nil)
	return encPrefix + base64.StdEncoding.EncodeToString(sealed)
}

func (s *secretBox) decrypt(value string) string {
	if !strings.HasPrefix(value, encPrefix) {
		return value
	}
	raw, err := base64.StdEncoding.DecodeString(strings.TrimPrefix(value, encPrefix))
	if err != nil || len(raw) <= s.gcm.NonceSize() {
		return ""
	}
	nonce, cipherText := raw[:s.gcm.NonceSize()], raw[s.gcm.NonceSize():]
	plain, err := s.gcm.Open(nil, nonce, cipherText, nil)
	if err != nil {
		return ""
	}
	return string(plain)
}

// Store 负责服务器列表与分组的持久化。
type Store struct {
	mu       sync.RWMutex
	dir      string
	file     string
	box      *secretBox
	servers  []ServerConfig
	groups   []ServerGroup
	settings AppSettings
}

func appConfigDir() (string, error) {
	base, err := os.UserConfigDir()
	if err != nil {
		home, herr := os.UserHomeDir()
		if herr != nil {
			return "", err
		}
		base = filepath.Join(home, ".config")
	}
	dir := filepath.Join(base, appDirName)
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return "", err
	}
	return dir, nil
}

func loadOrCreateKey(dir string) ([]byte, error) {
	keyPath := filepath.Join(dir, "secret.key")
	if data, err := os.ReadFile(keyPath); err == nil && len(data) == 32 {
		return data, nil
	}
	key := make([]byte, 32)
	if _, err := io.ReadFull(rand.Reader, key); err != nil {
		return nil, err
	}
	if err := os.WriteFile(keyPath, key, 0o600); err != nil {
		return nil, err
	}
	return key, nil
}

func NewStore() (*Store, error) {
	dir, err := appConfigDir()
	if err != nil {
		return nil, err
	}
	key, err := loadOrCreateKey(dir)
	if err != nil {
		return nil, err
	}
	box, err := newSecretBox(key)
	if err != nil {
		return nil, err
	}
	s := &Store{
		dir:      dir,
		file:     filepath.Join(dir, "servers.json"),
		box:      box,
		settings: DefaultAppSettings(),
	}
	if err := s.load(); err != nil {
		return nil, err
	}
	return s, nil
}

func (s *Store) load() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	data, err := os.ReadFile(s.file)
	if err != nil {
		if os.IsNotExist(err) {
			s.servers = []ServerConfig{}
			s.groups = []ServerGroup{}
			s.settings = DefaultAppSettings()
			return nil
		}
		return err
	}
	var wrapper struct {
		Servers  []ServerConfig `json:"servers"`
		Groups   []ServerGroup  `json:"groups"`
		Settings AppSettings    `json:"settings"`
	}
	if err := json.Unmarshal(data, &wrapper); err != nil {
		s.servers = []ServerConfig{}
		s.groups = []ServerGroup{}
		s.settings = DefaultAppSettings()
		return nil
	}
	list := wrapper.Servers
	if list == nil {
		var legacy []ServerConfig
		if err2 := json.Unmarshal(data, &legacy); err2 == nil {
			list = legacy
		}
	}
	for i := range list {
		list[i].Password = s.box.decrypt(list[i].Password)
		list[i].Passphrase = s.box.decrypt(list[i].Passphrase)
		list[i].PrivateKey = s.box.decrypt(list[i].PrivateKey)
		list[i].MongoURI = s.box.decrypt(list[i].MongoURI)
		list[i].MongoTLSClientKey = s.box.decrypt(list[i].MongoTLSClientKey)
	}
	s.servers = list
	if wrapper.Groups == nil {
		wrapper.Groups = []ServerGroup{}
	}
	s.groups = wrapper.Groups

	if wrapper.Settings.ThemeMode == "" {
		wrapper.Settings = DefaultAppSettings()
	}
	s.settings = wrapper.Settings
	return nil
}

func (s *Store) persist() error {
	out := make([]ServerConfig, len(s.servers))
	copy(out, s.servers)
	for i := range out {
		out[i].Password = s.box.encrypt(out[i].Password)
		out[i].Passphrase = s.box.encrypt(out[i].Passphrase)
		out[i].PrivateKey = s.box.encrypt(out[i].PrivateKey)
		out[i].MongoURI = s.box.encrypt(out[i].MongoURI)
		out[i].MongoTLSClientKey = s.box.encrypt(out[i].MongoTLSClientKey)
	}
	wrapper := struct {
		Servers  []ServerConfig `json:"servers"`
		Groups   []ServerGroup  `json:"groups"`
		Settings AppSettings    `json:"settings"`
	}{
		Servers:  out,
		Groups:   s.groups,
		Settings: s.settings,
	}
	data, err := json.MarshalIndent(wrapper, "", "  ")
	if err != nil {
		return err
	}
	tmp := s.file + ".tmp"
	if err := os.WriteFile(tmp, data, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, s.file)
}

func (s *Store) GetSettings() AppSettings {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if s.settings.ThemeMode == "" {
		return DefaultAppSettings()
	}
	return s.settings
}

func (s *Store) SaveSettings(settings AppSettings) (AppSettings, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if settings.ThemeMode == "" {
		settings.ThemeMode = "light"
	}
	if settings.FontFamily == "" {
		settings.FontFamily = "Consolas"
	}
	if settings.FontSize == "" {
		settings.FontSize = "13"
	}
	if settings.DbDefaultLimit == "" {
		settings.DbDefaultLimit = "50"
	}
	s.settings = settings
	if err := s.persist(); err != nil {
		return settings, err
	}
	return s.settings, nil
}

func (s *Store) List() []ServerConfig {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]ServerConfig, len(s.servers))
	copy(out, s.servers)
	sort.SliceStable(out, func(i, j int) bool {
		return strings.ToLower(out[i].Label()) < strings.ToLower(out[j].Label())
	})
	return out
}

func (s *Store) Get(id string) (ServerConfig, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for _, item := range s.servers {
		if item.ID == id {
			return item, true
		}
	}
	return ServerConfig{}, false
}

func (s *Store) Save(cfg ServerConfig) (ServerConfig, error) {
	if err := cfg.Validate(); err != nil {
		return ServerConfig{}, err
	}
	ct := cfg.ConnType()
	if cfg.Port <= 0 {
		switch ct {
		case ConnRedis:
			cfg.Port = 6379
		case ConnMysql:
			cfg.Port = 3306
		case ConnMqtt:
			cfg.Port = 1883
			if cfg.MqttKeepAlive <= 0 {
				cfg.MqttKeepAlive = 30
			}
			if cfg.MqttConnectTimeout <= 0 {
				cfg.MqttConnectTimeout = 10
			}
			if cfg.MqttReconnectIntvl <= 0 {
				cfg.MqttReconnectIntvl = 5
			}
			if cfg.MqttProto != "3.1" {
				cfg.MqttProto = "3.1.1"
			}
		case ConnMongo:
			cfg.Port = 27017
		case ConnSqlite:
			cfg.Port = 0
		default:
			cfg.Port = 22
		}
	}
	if ct == ConnMongo {
		if strings.TrimSpace(cfg.MongoAuthSource) == "" {
			cfg.MongoAuthSource = "admin"
		}
		if cfg.MongoConnectTimeout <= 0 {
			cfg.MongoConnectTimeout = 10
		}
		if cfg.MongoServerSelectTimeout <= 0 {
			cfg.MongoServerSelectTimeout = 10
		}
		if cfg.MongoSocketTimeout <= 0 {
			cfg.MongoSocketTimeout = 30
		}
		if cfg.MongoMaxPoolSize <= 0 {
			cfg.MongoMaxPoolSize = 100
		}
	}
	// 非私钥认证统一归为密码认证。
	if ct == ConnSSH && cfg.AuthType != authTypeKey {
		cfg.AuthType = authTypePassword
	}
	cfg.Type = string(ct)
	cfg.UpdatedAt = time.Now().Unix()

	s.mu.Lock()
	defer s.mu.Unlock()

	if cfg.ID == "" {
		cfg.ID = uuid.NewString()
		s.servers = append(s.servers, cfg)
	} else {
		found := false
		for i := range s.servers {
			if s.servers[i].ID == cfg.ID {
				s.servers[i] = cfg
				found = true
				break
			}
		}
		if !found {
			s.servers = append(s.servers, cfg)
		}
	}
	if err := s.persist(); err != nil {
		return ServerConfig{}, err
	}
	return cfg, nil
}

func (s *Store) Delete(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	next := s.servers[:0]
	for _, item := range s.servers {
		if item.ID != id {
			next = append(next, item)
		}
	}
	s.servers = next
	return s.persist()
}

// ---------- 分组管理 ----------

func (s *Store) ListGroups() []ServerGroup {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]ServerGroup, len(s.groups))
	copy(out, s.groups)
	return out
}

func (s *Store) SaveGroup(g ServerGroup) (ServerGroup, error) {
	name := strings.TrimSpace(g.Name)
	if name == "" {
		return ServerGroup{}, errors.New("分组名称不能为空")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if g.ID == "" {
		g.ID = uuid.NewString()
		s.groups = append(s.groups, g)
	} else {
		found := false
		for i := range s.groups {
			if s.groups[i].ID == g.ID {
				s.groups[i].Name = name
				found = true
				break
			}
		}
		if !found {
			s.groups = append(s.groups, g)
		}
	}
	if err := s.persist(); err != nil {
		return ServerGroup{}, err
	}
	return g, nil
}

func (s *Store) DeleteGroup(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	next := s.groups[:0]
	for _, item := range s.groups {
		if item.ID != id {
			next = append(next, item)
		}
	}
	s.groups = next
	// 解除该分组下服务器的归属
	for i := range s.servers {
		if s.servers[i].GroupID == id {
			s.servers[i].GroupID = ""
			s.servers[i].UpdatedAt = time.Now().Unix()
		}
	}
	return s.persist()
}

// MoveServerToGroup 将服务器移入指定分组；groupId 为空表示移出分组。
func (s *Store) MoveServerToGroup(serverID, groupID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if groupID != "" {
		exists := false
		for _, g := range s.groups {
			if g.ID == groupID {
				exists = true
				break
			}
		}
		if !exists {
			return errors.New("目标分组不存在")
		}
	}
	found := false
	for i := range s.servers {
		if s.servers[i].ID == serverID {
			s.servers[i].GroupID = groupID
			s.servers[i].UpdatedAt = time.Now().Unix()
			found = true
			break
		}
	}
	if !found {
		return errors.New("服务器不存在")
	}
	return s.persist()
}
