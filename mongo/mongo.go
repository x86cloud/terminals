package mongo

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"os"
	"sort"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"terminal/core"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
	"go.mongodb.org/mongo-driver/v2/mongo/readpref"
)

// ===================== 认证方式与拓扑 =====================

// MongoAuthMech 支持的认证机制。
type MongoAuthMech string

const (
	// MongoAuthNone 无认证（本地开发实例）。
	MongoAuthNone MongoAuthMech = "none"
	// MongoAuthSCRAM1 SCRAM-SHA-1。
	MongoAuthSCRAM1 MongoAuthMech = "SCRAM-SHA-1"
	// MongoAuthSCRAM256 SCRAM-SHA-256（MongoDB 4.0+ 默认）。
	MongoAuthSCRAM256 MongoAuthMech = "SCRAM-SHA-256"
	// MongoAuthX509 基于客户端证书的 X.509 认证。
	MongoAuthX509 MongoAuthMech = "MONGODB-X509"
)

// MongoTopology 部署拓扑。
type MongoTopology string

const (
	// MongoTopoStandalone 单节点。
	MongoTopoStandalone MongoTopology = "standalone"
	// MongoTopoReplicaSet 副本集。
	MongoTopoReplicaSet MongoTopology = "replicaSet"
	// MongoTopoSharded 分片集群（mongos）。
	MongoTopoSharded MongoTopology = "sharded"
)

// ===================== 连接字符串解析 =====================

// MongoURIInfo 是连接串解析结果，供前端回填表单。
type MongoURIInfo struct {
	Scheme     string   `json:"scheme"`
	Hosts      []string `json:"hosts"`
	Username   string   `json:"username"`
	Password   string   `json:"password"`
	Database   string   `json:"database"`
	AuthSource string   `json:"authSource"`
	AuthMech   string   `json:"authMech"`
	ReplicaSet string   `json:"replicaSet"`
	TLS        bool     `json:"tls"`
	SRV        bool     `json:"srv"`
	Options    map[string]string `json:"options"`
}

// parseMongoURI 解析标准 mongodb:// 或 mongodb+srv:// 连接串。
func parseMongoURI(raw string) (MongoURIInfo, error) {
	out := MongoURIInfo{Options: map[string]string{}}
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return out, errors.New("连接字符串不能为空")
	}
	if !strings.HasPrefix(raw, "mongodb://") && !strings.HasPrefix(raw, "mongodb+srv://") {
		return out, errors.New("连接字符串必须以 mongodb:// 或 mongodb+srv:// 开头")
	}
	u, err := url.Parse(raw)
	if err != nil {
		return out, fmt.Errorf("连接字符串解析失败: %w", err)
	}
	out.Scheme = u.Scheme
	out.SRV = u.Scheme == "mongodb+srv"
	if u.User != nil {
		out.Username = u.User.Username()
		if pwd, ok := u.User.Password(); ok {
			out.Password = pwd
		}
	}
	for _, h := range strings.Split(u.Host, ",") {
		if h = strings.TrimSpace(h); h != "" {
			out.Hosts = append(out.Hosts, h)
		}
	}
	out.Database = strings.TrimPrefix(u.Path, "/")
	q := u.Query()
	for k, v := range q {
		if len(v) > 0 {
			out.Options[k] = v[0]
		}
	}
	out.AuthSource = q.Get("authSource")
	out.AuthMech = q.Get("authMechanism")
	out.ReplicaSet = q.Get("replicaSet")
	// SRV 默认启用 TLS
	out.TLS = out.SRV || strings.EqualFold(q.Get("tls"), "true") || strings.EqualFold(q.Get("ssl"), "true")
	return out, nil
}

// MongoParseURI 供前端调用：解析连接串并回填表单。
func (m *MongoManager) MongoParseURI(uri string) (MongoURIInfo, error) {
	return parseMongoURI(uri)
}

// buildMongoURI 在未提供完整连接串时，用离散字段拼装连接串。
func buildMongoURI(cfg core.ServerConfig) string {
	if s := strings.TrimSpace(cfg.MongoURI); s != "" {
		return s
	}
	scheme := "mongodb"
	if cfg.MongoSRV {
		scheme = "mongodb+srv"
	}
	// 副本集 / 分片允许填写多个种子节点
	hosts := strings.TrimSpace(cfg.MongoHosts)
	if hosts == "" {
		if cfg.MongoSRV {
			hosts = cfg.Host
		} else {
			hosts = cfg.Addr()
		}
	}
	var b strings.Builder
	b.WriteString(scheme + "://")
	if u := strings.TrimSpace(cfg.Username); u != "" {
		b.WriteString(url.QueryEscape(u))
		if cfg.Password != "" {
			b.WriteString(":" + url.QueryEscape(cfg.Password))
		}
		b.WriteString("@")
	}
	b.WriteString(hosts)
	b.WriteString("/")
	if db := strings.TrimSpace(cfg.MongoDatabase); db != "" {
		b.WriteString(url.PathEscape(db))
	}
	q := url.Values{}
	if src := strings.TrimSpace(cfg.MongoAuthSource); src != "" {
		q.Set("authSource", src)
	}
	if rs := strings.TrimSpace(cfg.MongoReplicaSet); rs != "" {
		q.Set("replicaSet", rs)
	}
	if len(q) > 0 {
		b.WriteString("?" + q.Encode())
	}
	return b.String()
}

// buildMongoTLS 组装 TLS 配置，支持自定义 CA 与客户端证书（X.509 双向认证）。
func buildMongoTLS(cfg core.ServerConfig) (*tls.Config, error) {
	if !cfg.MongoTLSEnabled && cfg.MongoAuthMech != string(MongoAuthX509) {
		return nil, nil
	}
	tc := &tls.Config{InsecureSkipVerify: cfg.MongoTLSInsecure}
	if ca := strings.TrimSpace(cfg.MongoTLSCACert); ca != "" {
		pem, err := readPEMSource(ca)
		if err != nil {
			return nil, fmt.Errorf("读取 CA 证书失败: %w", err)
		}
		pool := x509.NewCertPool()
		if !pool.AppendCertsFromPEM(pem) {
			return nil, errors.New("CA 证书解析失败，请确认为有效 PEM 内容")
		}
		tc.RootCAs = pool
	}
	certSrc := strings.TrimSpace(cfg.MongoTLSClientCert)
	keySrc := strings.TrimSpace(cfg.MongoTLSClientKey)
	if certSrc != "" {
		certPEM, err := readPEMSource(certSrc)
		if err != nil {
			return nil, fmt.Errorf("读取客户端证书失败: %w", err)
		}
		// X.509 场景常见把证书与私钥放在同一个 PEM 文件里
		keyPEM := certPEM
		if keySrc != "" {
			keyPEM, err = readPEMSource(keySrc)
			if err != nil {
				return nil, fmt.Errorf("读取客户端私钥失败: %w", err)
			}
		}
		pair, err := tls.X509KeyPair(certPEM, keyPEM)
		if err != nil {
			return nil, fmt.Errorf("客户端证书与私钥不匹配: %w", err)
		}
		tc.Certificates = []tls.Certificate{pair}
	}
	return tc, nil
}

// readPEMSource 允许传入 PEM 文本或文件路径。
func readPEMSource(src string) ([]byte, error) {
	if strings.Contains(src, "-----BEGIN") {
		return []byte(src), nil
	}
	return os.ReadFile(src)
}

// buildMongoOptions 根据配置构造驱动选项：认证、TLS、连接池、超时、读偏好。
func buildMongoOptions(cfg core.ServerConfig) (*options.ClientOptions, error) {
	opts := options.Client().ApplyURI(buildMongoURI(cfg))

	// ---- 认证 ----
	mech := MongoAuthMech(strings.TrimSpace(cfg.MongoAuthMech))
	switch mech {
	case MongoAuthX509:
		// X.509 的身份取自客户端证书 subject，无需用户名密码
		opts.SetAuth(options.Credential{
			AuthMechanism: string(MongoAuthX509),
			AuthSource:    "$external",
		})
	case MongoAuthSCRAM1, MongoAuthSCRAM256:
		src := strings.TrimSpace(cfg.MongoAuthSource)
		if src == "" {
			src = "admin"
		}
		opts.SetAuth(options.Credential{
			AuthMechanism: string(mech),
			AuthSource:    src,
			Username:      cfg.Username,
			Password:      cfg.Password,
		})
	case MongoAuthNone, "":
		// URI 中若自带账号密码则沿用；否则匿名访问
		if strings.TrimSpace(cfg.Username) != "" && strings.TrimSpace(cfg.MongoURI) == "" {
			src := strings.TrimSpace(cfg.MongoAuthSource)
			if src == "" {
				src = "admin"
			}
			opts.SetAuth(options.Credential{
				AuthSource: src,
				Username:   cfg.Username,
				Password:   cfg.Password,
			})
		}
	default:
		return nil, fmt.Errorf("不支持的认证机制: %s", mech)
	}

	// ---- TLS ----
	tc, err := buildMongoTLS(cfg)
	if err != nil {
		return nil, err
	}
	if tc != nil {
		opts.SetTLSConfig(tc)
	}

	// ---- 连接池 ----
	if cfg.MongoMaxPoolSize > 0 {
		opts.SetMaxPoolSize(uint64(cfg.MongoMaxPoolSize))
	}
	if cfg.MongoMinPoolSize > 0 {
		opts.SetMinPoolSize(uint64(cfg.MongoMinPoolSize))
	}
	if cfg.MongoMaxConnIdleTime > 0 {
		opts.SetMaxConnIdleTime(time.Duration(cfg.MongoMaxConnIdleTime) * time.Second)
	}

	// ---- 超时 ----
	connectTO := cfg.MongoConnectTimeout
	if connectTO <= 0 {
		connectTO = 10
	}
	opts.SetConnectTimeout(time.Duration(connectTO) * time.Second)

	serverSelTO := cfg.MongoServerSelectTimeout
	if serverSelTO <= 0 {
		serverSelTO = 10
	}
	opts.SetServerSelectionTimeout(time.Duration(serverSelTO) * time.Second)

	if cfg.MongoSocketTimeout > 0 {
		// v2 用统一的 Timeout 控制单次操作耗时上限
		opts.SetTimeout(time.Duration(cfg.MongoSocketTimeout) * time.Second)
	}

	// ---- 副本集 / 读偏好 ----
	if rs := strings.TrimSpace(cfg.MongoReplicaSet); rs != "" {
		opts.SetReplicaSet(rs)
	}
	if rp := strings.TrimSpace(cfg.MongoReadPreference); rp != "" {
		if pref, err := readpref.New(readprefMode(rp)); err == nil {
			opts.SetReadPreference(pref)
		}
	}
	// 驱动自带自动重连；重试读写让瞬时故障（主从切换）自愈
	opts.SetRetryWrites(true)
	opts.SetRetryReads(true)
	if strings.TrimSpace(cfg.MongoAppName) != "" {
		opts.SetAppName(cfg.MongoAppName)
	} else {
		opts.SetAppName("xClient")
	}
	if cfg.MongoCompressors != "" {
		opts.SetCompressors(splitAddrs(cfg.MongoCompressors))
	}
	return opts, nil
}

func splitAddrs(s string) []string {
	parts := strings.Split(s, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if trimmed := strings.TrimSpace(p); trimmed != "" {
			out = append(out, trimmed)
		}
	}
	return out
}

func readprefMode(s string) readpref.Mode {
	switch strings.ToLower(s) {
	case "primarypreferred":
		return readpref.PrimaryPreferredMode
	case "secondary":
		return readpref.SecondaryMode
	case "secondarypreferred":
		return readpref.SecondaryPreferredMode
	case "nearest":
		return readpref.NearestMode
	default:
		return readpref.PrimaryMode
	}
}

// ===================== 连接包装 =====================

// mongoStats 记录轻量性能指标，用于前端监控面板。
type mongoStats struct {
	ops       int64
	failures  int64
	totalNano int64
	slowOps   int64
}

func (s *mongoStats) record(d time.Duration, err error) {
	atomic.AddInt64(&s.ops, 1)
	atomic.AddInt64(&s.totalNano, d.Nanoseconds())
	if err != nil {
		atomic.AddInt64(&s.failures, 1)
	}
	if d >= 100*time.Millisecond {
		atomic.AddInt64(&s.slowOps, 1)
	}
}

func (s *mongoStats) snapshot() map[string]any {
	ops := atomic.LoadInt64(&s.ops)
	total := atomic.LoadInt64(&s.totalNano)
	var avg float64
	if ops > 0 {
		avg = float64(total) / float64(ops) / 1e6
	}
	return map[string]any{
		"ops":        ops,
		"failures":   atomic.LoadInt64(&s.failures),
		"slowOps":    atomic.LoadInt64(&s.slowOps),
		"avgMs":      avg,
		"totalMs":    float64(total) / 1e6,
	}
}

// mongoClient 表示一个 MongoDB 会话。
type mongoClient struct {
	id     string
	cfg    core.ServerConfig
	client *mongo.Client
	stats  *mongoStats

	mu      sync.Mutex
	streams map[string]context.CancelFunc // 变更流，key=watchKey
	closed  bool
}

func (mc *mongoClient) close() {
	mc.mu.Lock()
	if mc.closed {
		mc.mu.Unlock()
		return
	}
	mc.closed = true
	cancels := make([]context.CancelFunc, 0, len(mc.streams))
	for _, c := range mc.streams {
		cancels = append(cancels, c)
	}
	mc.streams = map[string]context.CancelFunc{}
	mc.mu.Unlock()

	for _, c := range cancels {
		c()
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_ = mc.client.Disconnect(ctx)
}

// opCtx 生成带超时的操作上下文。
func (mc *mongoClient) opCtx() (context.Context, context.CancelFunc) {
	sec := mc.cfg.MongoSocketTimeout
	if sec <= 0 {
		sec = 30
	}
	return context.WithTimeout(context.Background(), time.Duration(sec)*time.Second)
}

// track 统计一次操作耗时。
func (mc *mongoClient) track(start time.Time, err error) {
	mc.stats.record(time.Since(start), err)
}

// ===================== 连接管理 =====================

type MongoManager struct {
	mu      sync.Mutex
	ctx     context.Context
	clients map[string]*mongoClient
}

func NewMongoManager() *MongoManager {
	return &MongoManager{clients: make(map[string]*mongoClient)}
}

func (m *MongoManager) SetContext(ctx context.Context) {
	m.ctx = ctx
}

func (m *MongoManager) ListConnections() []map[string]any {
	m.mu.Lock()
	defer m.mu.Unlock()
	list := make([]map[string]any, 0, len(m.clients))
	for id, mc := range m.clients {
		list = append(list, map[string]any{
			"id":   id,
			"name": mc.cfg.Name,
			"host": mc.cfg.Host,
			"port": mc.cfg.Port,
		})
	}
	return list
}

func (m *MongoManager) ResolveID(idOrName string) (string, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	trimmed := strings.TrimSpace(idOrName)
	if trimmed != "" {
		if _, ok := m.clients[trimmed]; ok {
			return trimmed, nil
		}
		for id, mc := range m.clients {
			if strings.EqualFold(mc.cfg.Name, trimmed) || strings.EqualFold(mc.cfg.Host, trimmed) || strings.EqualFold(id, trimmed) {
				return id, nil
			}
		}
	}
	if len(m.clients) == 1 {
		for id := range m.clients {
			return id, nil
		}
	}
	if len(m.clients) == 0 {
		return "", errors.New("当前暂无已连通的 MongoDB 连接，请先在 MongoDB 界面中连接服务器")
	}
	return "", fmt.Errorf("存在多个活跃的 MongoDB 连接，请指定明确的 server_id (当前活跃连接数: %d)", len(m.clients))
}

func (m *MongoManager) Open(id string, cfg core.ServerConfig) error {
	opts, err := buildMongoOptions(cfg)
	if err != nil {
		return err
	}
	cli, err := mongo.Connect(opts)
	if err != nil {
		return fmt.Errorf("连接 MongoDB 失败: %w", err)
	}

	// 探活，确保配置真实可用
	connectTO := cfg.MongoConnectTimeout
	if connectTO <= 0 {
		connectTO = 10
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(connectTO)*time.Second)
	defer cancel()
	if err := cli.Ping(ctx, readpref.Primary()); err != nil {
		_ = cli.Disconnect(context.Background())
		return fmt.Errorf("MongoDB 探活失败: %w", err)
	}

	mc := &mongoClient{
		id:      id,
		cfg:     cfg,
		client:  cli,
		stats:   &mongoStats{},
		streams: make(map[string]context.CancelFunc),
	}

	m.mu.Lock()
	if old, ok := m.clients[id]; ok {
		delete(m.clients, id)
		m.mu.Unlock()
		old.close()
		m.mu.Lock()
	}
	m.clients[id] = mc
	m.mu.Unlock()
	return nil
}

func MongoParseURI(uri string) (MongoURIInfo, error) {
	return parseMongoURI(uri)
}

// mustMongo 取出连接，统一错误提示。
func (m *MongoManager) mustMongo(id string) (*mongoClient, error) {
	mc, ok := m.Get(id)
	if !ok {
		return nil, errors.New("MongoDB 连接不存在或已断开")
	}
	mc.mu.Lock()
	closed := mc.closed
	mc.mu.Unlock()
	if closed {
		return nil, errors.New("MongoDB 连接已关闭")
	}
	return mc, nil
}

func (m *MongoManager) Get(id string) (*mongoClient, bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	c, ok := m.clients[id]
	return c, ok
}

func (m *MongoManager) Close(id string) {
	m.mu.Lock()
	c, ok := m.clients[id]
	if ok {
		delete(m.clients, id)
	}
	m.mu.Unlock()
	if ok {
		c.close()
	}
}

func (m *MongoManager) CloseAll() {
	m.mu.Lock()
	all := make([]*mongoClient, 0, len(m.clients))
	for _, c := range m.clients {
		all = append(all, c)
	}
	m.clients = make(map[string]*mongoClient)
	m.mu.Unlock()
	for _, c := range all {
		c.close()
	}
}



// ===================== BSON / JSON 互转 =====================

// parseJSONDoc 把前端传入的 JSON 文本解析为 BSON 文档，
// 支持 MongoDB Extended JSON（$oid、$date 等）。
func parseJSONDoc(text string) (bson.D, error) {
	text = strings.TrimSpace(text)
	if text == "" {
		return bson.D{}, nil
	}
	var doc bson.D
	if err := bson.UnmarshalExtJSON([]byte(text), false, &doc); err != nil {
		return nil, fmt.Errorf("JSON 解析失败: %w", err)
	}
	return doc, nil
}

// parseJSONArray 解析 JSON 数组为多个 BSON 文档（批量写入 / 聚合管道）。
func parseJSONArray(text string) ([]bson.D, error) {
	text = strings.TrimSpace(text)
	if text == "" {
		return nil, nil
	}
	// 允许传单个对象
	if strings.HasPrefix(text, "{") {
		d, err := parseJSONDoc(text)
		if err != nil {
			return nil, err
		}
		return []bson.D{d}, nil
	}
	var raws []json.RawMessage
	if err := json.Unmarshal([]byte(text), &raws); err != nil {
		return nil, fmt.Errorf("JSON 数组解析失败: %w", err)
	}
	out := make([]bson.D, 0, len(raws))
	for i, r := range raws {
		d, err := parseJSONDoc(string(r))
		if err != nil {
			return nil, fmt.Errorf("第 %d 个元素解析失败: %w", i+1, err)
		}
		out = append(out, d)
	}
	return out, nil
}

// docToJSON 将 BSON 文档转为 Extended JSON 字符串（保留类型信息）。
func docToJSON(v any) string {
	b, err := bson.MarshalExtJSON(v, false, false)
	if err != nil {
		return "{}"
	}
	return string(b)
}

// docsToJSON 批量转换。
func docsToJSON(list []bson.Raw) []string {
	out := make([]string, 0, len(list))
	for _, d := range list {
		out = append(out, docToJSON(d))
	}
	return out
}

// ===================== 连接生命周期（前端接口） =====================

// Connect 建立连接。
func (m *MongoManager) Connect(cfg core.ServerConfig) (bool, error) {
	if cfg.ConnType() != core.ConnMongo {
		return false, errors.New("该连接不是 MongoDB 类型")
	}
	if err := m.Open(cfg.ID, cfg); err != nil {
		return false, err
	}
	return true, nil
}

// Disconnect 关闭连接。
func (m *MongoManager) Disconnect(id string) {
	m.Close(id)
}

// TestConnection 使用临时配置测试连通性，不写入连接池。
func (m *MongoManager) TestConnection(cfg core.ServerConfig) (map[string]any, error) {
	opts, err := buildMongoOptions(cfg)
	if err != nil {
		return nil, err
	}
	start := time.Now()
	cli, err := mongo.Connect(opts)
	if err != nil {
		return nil, fmt.Errorf("连接失败: %w", err)
	}
	defer func() { _ = cli.Disconnect(context.Background()) }()

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := cli.Ping(ctx, readpref.Primary()); err != nil {
		return nil, fmt.Errorf("探活失败: %w", err)
	}
	var hello bson.M
	_ = cli.Database("admin").RunCommand(ctx, bson.D{{Key: "hello", Value: 1}}).Decode(&hello)
	return map[string]any{
		"ok":       true,
		"latencyMs": time.Since(start).Milliseconds(),
		"topology": detectTopology(hello),
		"version":  serverVersion(ctx, cli),
	}, nil
}

// MongoHealthCheck 健康检查：探活延迟、拓扑、主节点、连接池状态。
func (m *MongoManager) MongoHealthCheck(id string) (map[string]any, error) {
	mc, err := m.mustMongo(id)
	if err != nil {
		return nil, err
	}
	ctx, cancel := mc.opCtx()
	defer cancel()

	start := time.Now()
	pingErr := mc.client.Ping(ctx, readpref.Primary())
	latency := time.Since(start).Milliseconds()
	mc.track(start, pingErr)

	res := map[string]any{
		"ok":        pingErr == nil,
		"latencyMs": latency,
	}
	if pingErr != nil {
		res["error"] = pingErr.Error()
		return res, nil
	}

	var hello bson.M
	if err := mc.client.Database("admin").RunCommand(ctx, bson.D{{Key: "hello", Value: 1}}).Decode(&hello); err == nil {
		res["topology"] = detectTopology(hello)
		res["primary"] = hello["primary"]
		res["setName"] = hello["setName"]
		res["isWritablePrimary"] = hello["isWritablePrimary"]
		if hosts, ok := hello["hosts"].(bson.A); ok {
			list := make([]string, 0, len(hosts))
			for _, h := range hosts {
				list = append(list, fmt.Sprintf("%v", h))
			}
			res["hosts"] = list
		}
	}
	res["version"] = serverVersion(ctx, mc.client)
	return res, nil
}

func detectTopology(hello bson.M) string {
	if hello == nil {
		return string(MongoTopoStandalone)
	}
	if msg, ok := hello["msg"].(string); ok && msg == "isdbgrid" {
		return string(MongoTopoSharded)
	}
	if _, ok := hello["setName"]; ok {
		return string(MongoTopoReplicaSet)
	}
	return string(MongoTopoStandalone)
}

func serverVersion(ctx context.Context, cli *mongo.Client) string {
	var res bson.M
	if err := cli.Database("admin").RunCommand(ctx, bson.D{{Key: "buildInfo", Value: 1}}).Decode(&res); err != nil {
		return ""
	}
	if v, ok := res["version"].(string); ok {
		return v
	}
	return ""
}

// MongoServerStatus 返回 serverStatus 关键指标，用于性能监控。
func (m *MongoManager) MongoServerStatus(id string) (map[string]any, error) {
	mc, err := m.mustMongo(id)
	if err != nil {
		return nil, err
	}
	ctx, cancel := mc.opCtx()
	defer cancel()

	start := time.Now()
	var st bson.M
	err = mc.client.Database("admin").RunCommand(ctx, bson.D{{Key: "serverStatus", Value: 1}}).Decode(&st)
	mc.track(start, err)
	if err != nil {
		return nil, err
	}

	out := map[string]any{
		"host":    st["host"],
		"version": st["version"],
		"uptime":  st["uptime"],
		"process": st["process"],
		"client":  mc.stats.snapshot(),
	}
	if conns, ok := st["connections"].(bson.M); ok {
		out["connections"] = conns
	}
	if net, ok := st["network"].(bson.M); ok {
		out["network"] = net
	}
	if op, ok := st["opcounters"].(bson.M); ok {
		out["opcounters"] = op
	}
	if mem, ok := st["mem"].(bson.M); ok {
		out["mem"] = mem
	}
	if gl, ok := st["globalLock"].(bson.M); ok {
		out["globalLock"] = gl
	}
	return out, nil
}

// MongoClientStats 仅返回客户端侧统计（无需服务端权限）。
func (m *MongoManager) MongoClientStats(id string) (map[string]any, error) {
	mc, err := m.mustMongo(id)
	if err != nil {
		return nil, err
	}
	out := mc.stats.snapshot()
	out["maxPoolSize"] = mc.cfg.MongoMaxPoolSize
	out["minPoolSize"] = mc.cfg.MongoMinPoolSize
	return out, nil
}

// MongoCurrentOps 返回正在执行的操作，便于定位慢查询。
func (m *MongoManager) MongoCurrentOps(id string) ([]string, error) {
	mc, err := m.mustMongo(id)
	if err != nil {
		return nil, err
	}
	ctx, cancel := mc.opCtx()
	defer cancel()

	cur, err := mc.client.Database("admin").Aggregate(ctx, mongo.Pipeline{
		{{Key: "$currentOp", Value: bson.D{{Key: "allUsers", Value: true}}}},
		{{Key: "$match", Value: bson.D{{Key: "active", Value: true}}}},
		{{Key: "$limit", Value: 50}},
	})
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)
	var raws []bson.Raw
	if err := cur.All(ctx, &raws); err != nil {
		return nil, err
	}
	return docsToJSON(raws), nil
}

// ===================== 数据库 / 集合 =====================

// MongoDatabases 列出所有数据库及其大小。
func (m *MongoManager) MongoDatabases(id string) ([]map[string]any, error) {
	mc, err := m.mustMongo(id)
	if err != nil {
		return nil, err
	}
	ctx, cancel := mc.opCtx()
	defer cancel()

	start := time.Now()
	res, err := mc.client.ListDatabases(ctx, bson.D{})
	mc.track(start, err)
	if err != nil {
		return nil, err
	}
	out := make([]map[string]any, 0, len(res.Databases))
	for _, d := range res.Databases {
		out = append(out, map[string]any{
			"name":       d.Name,
			"sizeOnDisk": d.SizeOnDisk,
			"empty":      d.Empty,
		})
	}
	sort.Slice(out, func(i, j int) bool {
		return fmt.Sprintf("%v", out[i]["name"]) < fmt.Sprintf("%v", out[j]["name"])
	})
	return out, nil
}

// MongoCollections 列出指定库下的集合。
func (m *MongoManager) MongoCollections(id, db string) ([]map[string]any, error) {
	mc, err := m.mustMongo(id)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(db) == "" {
		return nil, errors.New("数据库名不能为空")
	}
	ctx, cancel := mc.opCtx()
	defer cancel()

	start := time.Now()
	cur, err := mc.client.Database(db).ListCollections(ctx, bson.D{})
	mc.track(start, err)
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)

	out := make([]map[string]any, 0, 16)
	for cur.Next(ctx) {
		var spec bson.M
		if err := cur.Decode(&spec); err != nil {
			continue
		}
		item := map[string]any{
			"name": spec["name"],
			"type": spec["type"],
		}
		if opts, ok := spec["options"].(bson.M); ok {
			if _, has := opts["validator"]; has {
				item["hasValidator"] = true
			}
			if capped, has := opts["capped"]; has {
				item["capped"] = capped
			}
		}
		out = append(out, item)
	}
	sort.Slice(out, func(i, j int) bool {
		return fmt.Sprintf("%v", out[i]["name"]) < fmt.Sprintf("%v", out[j]["name"])
	})
	return out, nil
}

// MongoCreateDatabase 通过创建首个集合来隐式建库。
func (m *MongoManager) MongoCreateDatabase(id, db, firstCollection string) error {
	if strings.TrimSpace(firstCollection) == "" {
		firstCollection = "default"
	}
	return m.MongoCreateCollection(id, db, firstCollection)
}

// MongoDropDatabase 删除数据库。
func (m *MongoManager) MongoDropDatabase(id, db string) error {
	mc, err := m.mustMongo(id)
	if err != nil {
		return err
	}
	ctx, cancel := mc.opCtx()
	defer cancel()
	start := time.Now()
	err = mc.client.Database(db).Drop(ctx)
	mc.track(start, err)
	return err
}

// MongoCreateCollection 创建集合。
func (m *MongoManager) MongoCreateCollection(id, db, coll string) error {
	mc, err := m.mustMongo(id)
	if err != nil {
		return err
	}
	if strings.TrimSpace(coll) == "" {
		return errors.New("集合名不能为空")
	}
	ctx, cancel := mc.opCtx()
	defer cancel()
	start := time.Now()
	err = mc.client.Database(db).CreateCollection(ctx, coll)
	mc.track(start, err)
	return err
}

// MongoDropCollection 删除集合。
func (m *MongoManager) MongoDropCollection(id, db, coll string) error {
	mc, err := m.mustMongo(id)
	if err != nil {
		return err
	}
	ctx, cancel := mc.opCtx()
	defer cancel()
	start := time.Now()
	err = mc.client.Database(db).Collection(coll).Drop(ctx)
	mc.track(start, err)
	return err
}

// MongoRenameCollection 重命名集合。
func (m *MongoManager) MongoRenameCollection(id, db, coll, newName string) error {
	mc, err := m.mustMongo(id)
	if err != nil {
		return err
	}
	if strings.TrimSpace(newName) == "" {
		return errors.New("新集合名不能为空")
	}
	ctx, cancel := mc.opCtx()
	defer cancel()
	cmd := bson.D{
		{Key: "renameCollection", Value: db + "." + coll},
		{Key: "to", Value: db + "." + newName},
	}
	start := time.Now()
	err = mc.client.Database("admin").RunCommand(ctx, cmd).Err()
	mc.track(start, err)
	return err
}

// MongoCollectionStats 返回集合统计（文档数、大小、索引）。
func (m *MongoManager) MongoCollectionStats(id, db, coll string) (map[string]any, error) {
	mc, err := m.mustMongo(id)
	if err != nil {
		return nil, err
	}
	ctx, cancel := mc.opCtx()
	defer cancel()

	start := time.Now()
	cur, err := mc.client.Database(db).Collection(coll).Aggregate(ctx, mongo.Pipeline{
		{{Key: "$collStats", Value: bson.D{
			{Key: "storageStats", Value: bson.D{}},
			{Key: "count", Value: bson.D{}},
		}}},
	})
	mc.track(start, err)
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)

	var res bson.M
	if cur.Next(ctx) {
		if err := cur.Decode(&res); err != nil {
			return nil, err
		}
	}
	out := map[string]any{}
	if ss, ok := res["storageStats"].(bson.M); ok {
		out["count"] = ss["count"]
		out["size"] = ss["size"]
		out["avgObjSize"] = ss["avgObjSize"]
		out["storageSize"] = ss["storageSize"]
		out["totalIndexSize"] = ss["totalIndexSize"]
		out["nindexes"] = ss["nindexes"]
	}
	return out, nil
}

// ===================== 数据模型映射（Schema 推断） =====================

// MongoInferSchema 采样若干文档，推断字段结构（类型、出现率），
// 相当于为无固定 Schema 的集合生成一份数据模型映射。
func (m *MongoManager) MongoInferSchema(id, db, coll string, sampleSize int) ([]map[string]any, error) {
	mc, err := m.mustMongo(id)
	if err != nil {
		return nil, err
	}
	if sampleSize <= 0 {
		sampleSize = 200
	}
	ctx, cancel := mc.opCtx()
	defer cancel()

	start := time.Now()
	cur, err := mc.client.Database(db).Collection(coll).Aggregate(ctx, mongo.Pipeline{
		{{Key: "$sample", Value: bson.D{{Key: "size", Value: sampleSize}}}},
	})
	mc.track(start, err)
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)

	type fieldInfo struct {
		count int
		types map[string]int
	}
	fields := map[string]*fieldInfo{}
	total := 0

	for cur.Next(ctx) {
		var doc bson.M
		if err := cur.Decode(&doc); err != nil {
			continue
		}
		total++
		collectFields("", doc, func(path, typ string) {
			fi, ok := fields[path]
			if !ok {
				fi = &fieldInfo{types: map[string]int{}}
				fields[path] = fi
			}
			fi.count++
			fi.types[typ]++
		})
	}

	out := make([]map[string]any, 0, len(fields))
	for path, fi := range fields {
		// 取出现最多的类型作为主类型
		mainType, best := "", 0
		typeList := make([]string, 0, len(fi.types))
		for t, c := range fi.types {
			typeList = append(typeList, t)
			if c > best {
				best, mainType = c, t
			}
		}
		sort.Strings(typeList)
		ratio := 0.0
		if total > 0 {
			ratio = float64(fi.count) / float64(total)
		}
		out = append(out, map[string]any{
			"field":    path,
			"type":     mainType,
			"types":    typeList,
			"count":    fi.count,
			"presence": ratio,
			"required": ratio >= 0.999,
		})
	}
	sort.Slice(out, func(i, j int) bool {
		return fmt.Sprintf("%v", out[i]["field"]) < fmt.Sprintf("%v", out[j]["field"])
	})
	return out, nil
}

// collectFields 递归遍历文档，回调每个字段路径及其 BSON 类型。
func collectFields(prefix string, doc bson.M, emit func(path, typ string)) {
	for k, v := range doc {
		path := k
		if prefix != "" {
			path = prefix + "." + k
		}
		emit(path, bsonTypeName(v))
		// 只下钻一层嵌套对象，避免字段爆炸
		if sub, ok := v.(bson.M); ok && strings.Count(path, ".") < 2 {
			collectFields(path, sub, emit)
		}
	}
}

func bsonTypeName(v any) string {
	switch v.(type) {
	case nil:
		return "null"
	case bool:
		return "bool"
	case int32:
		return "int"
	case int64:
		return "long"
	case float64:
		return "double"
	case string:
		return "string"
	case bson.M, bson.D:
		return "object"
	case bson.A:
		return "array"
	case bson.ObjectID:
		return "objectId"
	case bson.DateTime:
		return "date"
	case bson.Binary:
		return "binData"
	case bson.Decimal128:
		return "decimal"
	default:
		return fmt.Sprintf("%T", v)
	}
}

// ===================== Schema 验证 =====================

// MongoGetValidator 读取集合当前的 JSON Schema 校验规则。
func (m *MongoManager) MongoGetValidator(id, db, coll string) (map[string]any, error) {
	mc, err := m.mustMongo(id)
	if err != nil {
		return nil, err
	}
	ctx, cancel := mc.opCtx()
	defer cancel()

	filter := bson.D{{Key: "name", Value: coll}}
	cur, err := mc.client.Database(db).ListCollections(ctx, filter)
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)

	out := map[string]any{"validator": "", "validationLevel": "", "validationAction": ""}
	if cur.Next(ctx) {
		var spec bson.M
		if err := cur.Decode(&spec); err != nil {
			return nil, err
		}
		if opts, ok := spec["options"].(bson.M); ok {
			if v, has := opts["validator"]; has {
				out["validator"] = docToJSON(v)
			}
			if v, has := opts["validationLevel"]; has {
				out["validationLevel"] = v
			}
			if v, has := opts["validationAction"]; has {
				out["validationAction"] = v
			}
		}
	}
	return out, nil
}

// MongoSetValidator 设置 / 更新集合的 JSON Schema 校验规则。
// level: off | moderate | strict；action: error | warn。
func (m *MongoManager) MongoSetValidator(id, db, coll, validatorJSON, level, action string) error {
	mc, err := m.mustMongo(id)
	if err != nil {
		return err
	}
	validator, err := parseJSONDoc(validatorJSON)
	if err != nil {
		return err
	}
	if level == "" {
		level = "strict"
	}
	if action == "" {
		action = "error"
	}
	ctx, cancel := mc.opCtx()
	defer cancel()

	cmd := bson.D{
		{Key: "collMod", Value: coll},
		{Key: "validator", Value: validator},
		{Key: "validationLevel", Value: level},
		{Key: "validationAction", Value: action},
	}
	start := time.Now()
	err = mc.client.Database(db).RunCommand(ctx, cmd).Err()
	mc.track(start, err)
	return err
}

// MongoValidateDocument 用集合现有校验规则试跑一个文档，返回是否通过。
// 通过在事务/临时校验中执行 insert 再回滚的方式避免脏数据。
func (m *MongoManager) MongoValidateDocument(id, db, coll, docJSON string) (map[string]any, error) {
	mc, err := m.mustMongo(id)
	if err != nil {
		return nil, err
	}
	doc, err := parseJSONDoc(docJSON)
	if err != nil {
		return nil, err
	}
	ctx, cancel := mc.opCtx()
	defer cancel()

	// 借助 $jsonSchema 的 aggregate 校验能力：直接尝试写入并回滚
	sess, err := mc.client.StartSession()
	if err != nil {
		// 会话不可用（单机未开副本集）时降级：直接插入再删除
		res, insErr := mc.client.Database(db).Collection(coll).InsertOne(ctx, doc)
		if insErr != nil {
			return map[string]any{"valid": false, "error": insErr.Error()}, nil
		}
		_, _ = mc.client.Database(db).Collection(coll).DeleteOne(ctx, bson.D{{Key: "_id", Value: res.InsertedID}})
		return map[string]any{"valid": true}, nil
	}
	defer sess.EndSession(ctx)

	validationErr := ""
	_, txErr := sess.WithTransaction(ctx, func(sc context.Context) (any, error) {
		if _, err := mc.client.Database(db).Collection(coll).InsertOne(sc, doc); err != nil {
			validationErr = err.Error()
			return nil, err
		}
		// 主动回滚，保证只做校验
		return nil, errors.New("__rollback__")
	})
	if validationErr != "" {
		return map[string]any{"valid": false, "error": validationErr}, nil
	}
	if txErr != nil && !strings.Contains(txErr.Error(), "__rollback__") {
		return map[string]any{"valid": false, "error": txErr.Error()}, nil
	}
	return map[string]any{"valid": true}, nil
}

// ===================== 查询构建器 =====================

// MongoQuerySpec 描述一次结构化查询，由前端查询构建器生成。
type MongoQuerySpec struct {
	Database   string `json:"database"`
	Collection string `json:"collection"`
	Filter     string `json:"filter"`     // JSON
	Projection string `json:"projection"` // JSON
	Sort       string `json:"sort"`       // JSON
	Limit      int    `json:"limit"`
	Skip       int    `json:"skip"`
	Hint       string `json:"hint"`   // 索引名或 JSON
	Collation  string `json:"collation"` // JSON
}

// MongoFindResult 查询结果。
type MongoFindResult struct {
	Documents []string `json:"documents"` // Extended JSON 字符串数组
	Count     int      `json:"count"`
	Total     int64    `json:"total"`
	DurationMs int64   `json:"durationMs"`
}

// MongoFind 按查询构建器规格执行查询。
func (m *MongoManager) MongoFind(id string, spec MongoQuerySpec) (MongoFindResult, error) {
	out := MongoFindResult{Documents: []string{}}
	mc, err := m.mustMongo(id)
	if err != nil {
		return out, err
	}
	filter, err := parseJSONDoc(spec.Filter)
	if err != nil {
		return out, fmt.Errorf("过滤条件 %w", err)
	}
	opt := options.Find()
	if strings.TrimSpace(spec.Projection) != "" {
		proj, err := parseJSONDoc(spec.Projection)
		if err != nil {
			return out, fmt.Errorf("投影字段 %w", err)
		}
		opt.SetProjection(proj)
	}
	if strings.TrimSpace(spec.Sort) != "" {
		s, err := parseJSONDoc(spec.Sort)
		if err != nil {
			return out, fmt.Errorf("排序条件 %w", err)
		}
		opt.SetSort(s)
	}
	limit := spec.Limit
	if limit <= 0 {
		limit = 50
	}
	opt.SetLimit(int64(limit))
	if spec.Skip > 0 {
		opt.SetSkip(int64(spec.Skip))
	}
	if h := strings.TrimSpace(spec.Hint); h != "" {
		if strings.HasPrefix(h, "{") {
			if hd, err := parseJSONDoc(h); err == nil {
				opt.SetHint(hd)
			}
		} else {
			opt.SetHint(h)
		}
	}

	ctx, cancel := mc.opCtx()
	defer cancel()

	start := time.Now()
	coll := mc.client.Database(spec.Database).Collection(spec.Collection)
	cur, err := coll.Find(ctx, filter, opt)
	mc.track(start, err)
	if err != nil {
		return out, err
	}
	defer cur.Close(ctx)

	var raws []bson.Raw
	if err := cur.All(ctx, &raws); err != nil {
		return out, err
	}
	out.Documents = docsToJSON(raws)
	out.Count = len(raws)
	out.DurationMs = time.Since(start).Milliseconds()

	// 总数用于分页；大集合下 CountDocuments 可能较慢，失败则忽略
	cctx, ccancel := mc.opCtx()
	defer ccancel()
	if total, err := coll.CountDocuments(cctx, filter); err == nil {
		out.Total = total
	}
	return out, nil
}

// MongoCountDocuments 统计匹配文档数。
func (m *MongoManager) MongoCountDocuments(id, db, coll, filterJSON string) (int64, error) {
	mc, err := m.mustMongo(id)
	if err != nil {
		return 0, err
	}
	filter, err := parseJSONDoc(filterJSON)
	if err != nil {
		return 0, err
	}
	ctx, cancel := mc.opCtx()
	defer cancel()
	start := time.Now()
	n, err := mc.client.Database(db).Collection(coll).CountDocuments(ctx, filter)
	mc.track(start, err)
	return n, err
}

// MongoDistinct 返回某字段的去重值。
func (m *MongoManager) MongoDistinct(id, db, coll, field, filterJSON string) ([]string, error) {
	mc, err := m.mustMongo(id)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(field) == "" {
		return nil, errors.New("字段名不能为空")
	}
	filter, err := parseJSONDoc(filterJSON)
	if err != nil {
		return nil, err
	}
	ctx, cancel := mc.opCtx()
	defer cancel()

	start := time.Now()
	res := mc.client.Database(db).Collection(coll).Distinct(ctx, field, filter)
	err = res.Err()
	mc.track(start, err)
	if err != nil {
		return nil, err
	}
	var vals []any
	if err := res.Decode(&vals); err != nil {
		return nil, err
	}
	out := make([]string, 0, len(vals))
	for _, v := range vals {
		out = append(out, docToJSON(bson.D{{Key: "v", Value: v}}))
	}
	return out, nil
}

// MongoExplain 返回查询执行计划，用于性能分析。
func (m *MongoManager) MongoExplain(id string, spec MongoQuerySpec, verbosity string) (string, error) {
	mc, err := m.mustMongo(id)
	if err != nil {
		return "", err
	}
	filter, err := parseJSONDoc(spec.Filter)
	if err != nil {
		return "", err
	}
	if verbosity == "" {
		verbosity = "queryPlanner"
	}
	ctx, cancel := mc.opCtx()
	defer cancel()

	inner := bson.D{
		{Key: "find", Value: spec.Collection},
		{Key: "filter", Value: filter},
	}
	if spec.Limit > 0 {
		inner = append(inner, bson.E{Key: "limit", Value: spec.Limit})
	}
	if strings.TrimSpace(spec.Sort) != "" {
		if s, err := parseJSONDoc(spec.Sort); err == nil {
			inner = append(inner, bson.E{Key: "sort", Value: s})
		}
	}
	cmd := bson.D{
		{Key: "explain", Value: inner},
		{Key: "verbosity", Value: verbosity},
	}
	start := time.Now()
	var res bson.M
	err = mc.client.Database(spec.Database).RunCommand(ctx, cmd).Decode(&res)
	mc.track(start, err)
	if err != nil {
		return "", err
	}
	return docToJSON(res), nil
}

// ===================== CRUD =====================

// MongoInsertOne 插入单个文档。
func (m *MongoManager) MongoInsertOne(id, db, coll, docJSON string) (string, error) {
	mc, err := m.mustMongo(id)
	if err != nil {
		return "", err
	}
	doc, err := parseJSONDoc(docJSON)
	if err != nil {
		return "", err
	}
	ctx, cancel := mc.opCtx()
	defer cancel()
	start := time.Now()
	res, err := mc.client.Database(db).Collection(coll).InsertOne(ctx, doc)
	mc.track(start, err)
	if err != nil {
		return "", err
	}
	return docToJSON(bson.D{{Key: "insertedId", Value: res.InsertedID}}), nil
}

// MongoInsertMany 批量插入。ordered=false 时部分失败不中断。
func (m *MongoManager) MongoInsertMany(id, db, coll, docsJSON string, ordered bool) (map[string]any, error) {
	mc, err := m.mustMongo(id)
	if err != nil {
		return nil, err
	}
	docs, err := parseJSONArray(docsJSON)
	if err != nil {
		return nil, err
	}
	if len(docs) == 0 {
		return nil, errors.New("没有可插入的文档")
	}
	items := make([]any, 0, len(docs))
	for _, d := range docs {
		items = append(items, d)
	}
	ctx, cancel := mc.opCtx()
	defer cancel()

	start := time.Now()
	res, err := mc.client.Database(db).Collection(coll).
		InsertMany(ctx, items, options.InsertMany().SetOrdered(ordered))
	mc.track(start, err)

	out := map[string]any{"requested": len(items)}
	if res != nil {
		out["insertedCount"] = len(res.InsertedIDs)
	}
	if err != nil {
		out["error"] = err.Error()
		// 非 ordered 模式下部分成功仍然返回结果
		if res == nil {
			return out, err
		}
	}
	return out, nil
}

// MongoUpdateOne 更新单个文档。update 需为含 $set 等操作符的 JSON。
func (m *MongoManager) MongoUpdateOne(id, db, coll, filterJSON, updateJSON string, upsert bool) (map[string]any, error) {
	return m.mongoUpdate(id, db, coll, filterJSON, updateJSON, upsert, false)
}

// MongoUpdateMany 批量更新。
func (m *MongoManager) MongoUpdateMany(id, db, coll, filterJSON, updateJSON string, upsert bool) (map[string]any, error) {
	return m.mongoUpdate(id, db, coll, filterJSON, updateJSON, upsert, true)
}

func (m *MongoManager) mongoUpdate(id, db, coll, filterJSON, updateJSON string, upsert, many bool) (map[string]any, error) {
	mc, err := m.mustMongo(id)
	if err != nil {
		return nil, err
	}
	filter, err := parseJSONDoc(filterJSON)
	if err != nil {
		return nil, fmt.Errorf("过滤条件 %w", err)
	}
	update, err := parseJSONDoc(updateJSON)
	if err != nil {
		return nil, fmt.Errorf("更新内容 %w", err)
	}
	if len(update) == 0 {
		return nil, errors.New("更新内容不能为空")
	}
	// 未使用操作符时自动包一层 $set，避免整文档覆盖造成数据丢失
	if !strings.HasPrefix(update[0].Key, "$") {
		update = bson.D{{Key: "$set", Value: update}}
	}
	ctx, cancel := mc.opCtx()
	defer cancel()

	c := mc.client.Database(db).Collection(coll)
	start := time.Now()
	var res *mongo.UpdateResult
	if many {
		res, err = c.UpdateMany(ctx, filter, update, options.UpdateMany().SetUpsert(upsert))
	} else {
		res, err = c.UpdateOne(ctx, filter, update, options.UpdateOne().SetUpsert(upsert))
	}
	mc.track(start, err)
	if err != nil {
		return nil, err
	}
	return map[string]any{
		"matched":  res.MatchedCount,
		"modified": res.ModifiedCount,
		"upserted": res.UpsertedCount,
	}, nil
}

// MongoReplaceOne 整文档替换。
func (m *MongoManager) MongoReplaceOne(id, db, coll, filterJSON, docJSON string, upsert bool) (map[string]any, error) {
	mc, err := m.mustMongo(id)
	if err != nil {
		return nil, err
	}
	filter, err := parseJSONDoc(filterJSON)
	if err != nil {
		return nil, fmt.Errorf("过滤条件 %w", err)
	}
	doc, err := parseJSONDoc(docJSON)
	if err != nil {
		return nil, fmt.Errorf("替换文档 %w", err)
	}
	ctx, cancel := mc.opCtx()
	defer cancel()
	start := time.Now()
	res, err := mc.client.Database(db).Collection(coll).
		ReplaceOne(ctx, filter, doc, options.Replace().SetUpsert(upsert))
	mc.track(start, err)
	if err != nil {
		return nil, err
	}
	return map[string]any{
		"matched":  res.MatchedCount,
		"modified": res.ModifiedCount,
		"upserted": res.UpsertedCount,
	}, nil
}

// MongoDeleteOne 删除单个文档。
func (m *MongoManager) MongoDeleteOne(id, db, coll, filterJSON string) (int64, error) {
	return m.mongoDelete(id, db, coll, filterJSON, false)
}

// MongoDeleteMany 批量删除。
func (m *MongoManager) MongoDeleteMany(id, db, coll, filterJSON string) (int64, error) {
	return m.mongoDelete(id, db, coll, filterJSON, true)
}

func (m *MongoManager) mongoDelete(id, db, coll, filterJSON string, many bool) (int64, error) {
	mc, err := m.mustMongo(id)
	if err != nil {
		return 0, err
	}
	filter, err := parseJSONDoc(filterJSON)
	if err != nil {
		return 0, err
	}
	// 防止误删全集合
	if len(filter) == 0 && many {
		return 0, errors.New("批量删除必须指定过滤条件，如需清空请删除集合")
	}
	ctx, cancel := mc.opCtx()
	defer cancel()

	c := mc.client.Database(db).Collection(coll)
	start := time.Now()
	var res *mongo.DeleteResult
	if many {
		res, err = c.DeleteMany(ctx, filter)
	} else {
		res, err = c.DeleteOne(ctx, filter)
	}
	mc.track(start, err)
	if err != nil {
		return 0, err
	}
	return res.DeletedCount, nil
}

// MongoFindOneAndUpdate 原子地查找并更新，返回更新后的文档。
func (m *MongoManager) MongoFindOneAndUpdate(id, db, coll, filterJSON, updateJSON string, returnNew bool) (string, error) {
	mc, err := m.mustMongo(id)
	if err != nil {
		return "", err
	}
	filter, err := parseJSONDoc(filterJSON)
	if err != nil {
		return "", err
	}
	update, err := parseJSONDoc(updateJSON)
	if err != nil {
		return "", err
	}
	if len(update) > 0 && !strings.HasPrefix(update[0].Key, "$") {
		update = bson.D{{Key: "$set", Value: update}}
	}
	rd := options.Before
	if returnNew {
		rd = options.After
	}
	ctx, cancel := mc.opCtx()
	defer cancel()

	start := time.Now()
	var doc bson.M
	err = mc.client.Database(db).Collection(coll).
		FindOneAndUpdate(ctx, filter, update, options.FindOneAndUpdate().SetReturnDocument(rd)).
		Decode(&doc)
	mc.track(start, err)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return "", nil
	}
	if err != nil {
		return "", err
	}
	return docToJSON(doc), nil
}

// ===================== 批量操作 =====================

// MongoBulkOp 描述一次批量写操作。
type MongoBulkOp struct {
	Type       string `json:"type"`       // insert | update | updateMany | replace | delete | deleteMany
	Filter     string `json:"filter"`     // JSON
	Document   string `json:"document"`   // JSON
	Upsert     bool   `json:"upsert"`
}

// MongoBulkWrite 执行批量写（一次网络往返，显著优于逐条操作）。
func (m *MongoManager) MongoBulkWrite(id, db, coll string, ops []MongoBulkOp, ordered bool) (map[string]any, error) {
	mc, err := m.mustMongo(id)
	if err != nil {
		return nil, err
	}
	if len(ops) == 0 {
		return nil, errors.New("没有可执行的操作")
	}
	models := make([]mongo.WriteModel, 0, len(ops))
	for i, op := range ops {
		switch strings.ToLower(op.Type) {
		case "insert":
			doc, err := parseJSONDoc(op.Document)
			if err != nil {
				return nil, fmt.Errorf("第 %d 项 %w", i+1, err)
			}
			models = append(models, mongo.NewInsertOneModel().SetDocument(doc))
		case "update", "updatemany":
			filter, err := parseJSONDoc(op.Filter)
			if err != nil {
				return nil, fmt.Errorf("第 %d 项过滤条件 %w", i+1, err)
			}
			update, err := parseJSONDoc(op.Document)
			if err != nil {
				return nil, fmt.Errorf("第 %d 项更新内容 %w", i+1, err)
			}
			if len(update) > 0 && !strings.HasPrefix(update[0].Key, "$") {
				update = bson.D{{Key: "$set", Value: update}}
			}
			if strings.ToLower(op.Type) == "updatemany" {
				models = append(models, mongo.NewUpdateManyModel().
					SetFilter(filter).SetUpdate(update).SetUpsert(op.Upsert))
			} else {
				models = append(models, mongo.NewUpdateOneModel().
					SetFilter(filter).SetUpdate(update).SetUpsert(op.Upsert))
			}
		case "replace":
			filter, err := parseJSONDoc(op.Filter)
			if err != nil {
				return nil, fmt.Errorf("第 %d 项过滤条件 %w", i+1, err)
			}
			doc, err := parseJSONDoc(op.Document)
			if err != nil {
				return nil, fmt.Errorf("第 %d 项替换文档 %w", i+1, err)
			}
			models = append(models, mongo.NewReplaceOneModel().
				SetFilter(filter).SetReplacement(doc).SetUpsert(op.Upsert))
		case "delete":
			filter, err := parseJSONDoc(op.Filter)
			if err != nil {
				return nil, fmt.Errorf("第 %d 项过滤条件 %w", i+1, err)
			}
			models = append(models, mongo.NewDeleteOneModel().SetFilter(filter))
		case "deletemany":
			filter, err := parseJSONDoc(op.Filter)
			if err != nil {
				return nil, fmt.Errorf("第 %d 项过滤条件 %w", i+1, err)
			}
			models = append(models, mongo.NewDeleteManyModel().SetFilter(filter))
		default:
			return nil, fmt.Errorf("第 %d 项：不支持的操作类型 %s", i+1, op.Type)
		}
	}

	ctx, cancel := mc.opCtx()
	defer cancel()
	start := time.Now()
	res, err := mc.client.Database(db).Collection(coll).
		BulkWrite(ctx, models, options.BulkWrite().SetOrdered(ordered))
	mc.track(start, err)

	out := map[string]any{"requested": len(models)}
	if res != nil {
		out["inserted"] = res.InsertedCount
		out["matched"] = res.MatchedCount
		out["modified"] = res.ModifiedCount
		out["deleted"] = res.DeletedCount
		out["upserted"] = res.UpsertedCount
	}
	if err != nil {
		out["error"] = err.Error()
		if res == nil {
			return out, err
		}
	}
	return out, nil
}

// ===================== 聚合管道 =====================

// MongoAggregate 执行聚合管道。pipelineJSON 为 JSON 数组。
func (m *MongoManager) MongoAggregate(id, db, coll, pipelineJSON string, allowDiskUse bool, maxTimeMS int) (MongoFindResult, error) {
	out := MongoFindResult{Documents: []string{}}
	mc, err := m.mustMongo(id)
	if err != nil {
		return out, err
	}
	stages, err := parseJSONArray(pipelineJSON)
	if err != nil {
		return out, err
	}
	if len(stages) == 0 {
		return out, errors.New("聚合管道不能为空")
	}
	pipeline := make(mongo.Pipeline, 0, len(stages))
	for _, s := range stages {
		pipeline = append(pipeline, s)
	}

	opt := options.Aggregate().SetAllowDiskUse(allowDiskUse)
	ctx, cancel := mc.opCtx()
	defer cancel()
	if maxTimeMS > 0 {
		var c2 context.CancelFunc
		ctx, c2 = context.WithTimeout(context.Background(), time.Duration(maxTimeMS)*time.Millisecond)
		defer c2()
	}

	start := time.Now()
	cur, err := mc.client.Database(db).Collection(coll).Aggregate(ctx, pipeline, opt)
	mc.track(start, err)
	if err != nil {
		return out, err
	}
	defer cur.Close(ctx)

	var raws []bson.Raw
	if err := cur.All(ctx, &raws); err != nil {
		return out, err
	}
	out.Documents = docsToJSON(raws)
	out.Count = len(raws)
	out.DurationMs = time.Since(start).Milliseconds()
	return out, nil
}

// MongoAggregateExplain 解释聚合管道的执行计划。
func (m *MongoManager) MongoAggregateExplain(id, db, coll, pipelineJSON string) (string, error) {
	mc, err := m.mustMongo(id)
	if err != nil {
		return "", err
	}
	stages, err := parseJSONArray(pipelineJSON)
	if err != nil {
		return "", err
	}
	arr := make(bson.A, 0, len(stages))
	for _, s := range stages {
		arr = append(arr, s)
	}
	ctx, cancel := mc.opCtx()
	defer cancel()

	cmd := bson.D{
		{Key: "explain", Value: bson.D{
			{Key: "aggregate", Value: coll},
			{Key: "pipeline", Value: arr},
			{Key: "cursor", Value: bson.D{}},
		}},
		{Key: "verbosity", Value: "queryPlanner"},
	}
	start := time.Now()
	var res bson.M
	err = mc.client.Database(db).RunCommand(ctx, cmd).Decode(&res)
	mc.track(start, err)
	if err != nil {
		return "", err
	}
	return docToJSON(res), nil
}

// MongoRunCommand 执行任意数据库命令，作为高级出口。
func (m *MongoManager) MongoRunCommand(id, db, commandJSON string) (string, error) {
	mc, err := m.mustMongo(id)
	if err != nil {
		return "", err
	}
	cmd, err := parseJSONDoc(commandJSON)
	if err != nil {
		return "", err
	}
	if len(cmd) == 0 {
		return "", errors.New("命令不能为空")
	}
	if strings.TrimSpace(db) == "" {
		db = "admin"
	}
	ctx, cancel := mc.opCtx()
	defer cancel()
	start := time.Now()
	var res bson.M
	err = mc.client.Database(db).RunCommand(ctx, cmd).Decode(&res)
	mc.track(start, err)
	if err != nil {
		return "", err
	}
	return docToJSON(res), nil
}

// ===================== 索引管理 =====================

// MongoIndexes 列出集合索引。
func (m *MongoManager) MongoIndexes(id, db, coll string) ([]map[string]any, error) {
	mc, err := m.mustMongo(id)
	if err != nil {
		return nil, err
	}
	ctx, cancel := mc.opCtx()
	defer cancel()

	start := time.Now()
	cur, err := mc.client.Database(db).Collection(coll).Indexes().List(ctx)
	mc.track(start, err)
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)

	out := make([]map[string]any, 0, 8)
	for cur.Next(ctx) {
		var idx bson.M
		if err := cur.Decode(&idx); err != nil {
			continue
		}
		item := map[string]any{
			"name":   idx["name"],
			"key":    docToJSON(idx["key"]),
			"unique": idx["unique"] == true,
			"sparse": idx["sparse"] == true,
		}
		if v, ok := idx["expireAfterSeconds"]; ok {
			item["expireAfterSeconds"] = v
		}
		if v, ok := idx["partialFilterExpression"]; ok {
			item["partialFilterExpression"] = docToJSON(v)
		}
		out = append(out, item)
	}
	return out, nil
}

// MongoCreateIndex 创建索引。keysJSON 形如 {"field":1,"other":-1}。
func (m *MongoManager) MongoCreateIndex(id, db, coll, keysJSON, name string, unique, sparse bool, expireAfterSeconds int) (string, error) {
	mc, err := m.mustMongo(id)
	if err != nil {
		return "", err
	}
	keys, err := parseJSONDoc(keysJSON)
	if err != nil {
		return "", fmt.Errorf("索引键 %w", err)
	}
	if len(keys) == 0 {
		return "", errors.New("索引键不能为空")
	}
	idxOpts := options.Index().SetUnique(unique).SetSparse(sparse)
	if strings.TrimSpace(name) != "" {
		idxOpts.SetName(name)
	}
	if expireAfterSeconds > 0 {
		idxOpts.SetExpireAfterSeconds(int32(expireAfterSeconds))
	}
	ctx, cancel := mc.opCtx()
	defer cancel()

	start := time.Now()
	res, err := mc.client.Database(db).Collection(coll).Indexes().
		CreateOne(ctx, mongo.IndexModel{Keys: keys, Options: idxOpts})
	mc.track(start, err)
	return res, err
}

// MongoDropIndex 删除索引。
func (m *MongoManager) MongoDropIndex(id, db, coll, name string) error {
	mc, err := m.mustMongo(id)
	if err != nil {
		return err
	}
	if name == "_id_" {
		return errors.New("_id 索引不可删除")
	}
	ctx, cancel := mc.opCtx()
	defer cancel()
	start := time.Now()
	err = mc.client.Database(db).Collection(coll).Indexes().DropOne(ctx, name)
	mc.track(start, err)
	return err
}

// MongoIndexStats 返回索引使用统计，帮助识别无效索引。
func (m *MongoManager) MongoIndexStats(id, db, coll string) ([]string, error) {
	mc, err := m.mustMongo(id)
	if err != nil {
		return nil, err
	}
	ctx, cancel := mc.opCtx()
	defer cancel()

	start := time.Now()
	cur, err := mc.client.Database(db).Collection(coll).Aggregate(ctx, mongo.Pipeline{
		{{Key: "$indexStats", Value: bson.D{}}},
	})
	mc.track(start, err)
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)
	var raws []bson.Raw
	if err := cur.All(ctx, &raws); err != nil {
		return nil, err
	}
	return docsToJSON(raws), nil
}
