package redis

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"terminal/core"

	goredis "github.com/redis/go-redis/v9"
)

// ===================== Redis 模式与序列化 =====================

type RedisMode string

const (
	RedisModeSingle   RedisMode = "single"
	RedisModeSentinel RedisMode = "sentinel"
	RedisModeCluster  RedisMode = "cluster"
)

type RedisSerialization string

const (
	RedisSerNone RedisSerialization = "none"
	RedisSerJSON RedisSerialization = "json"
)

// ===================== 熔断器 =====================

type circuitBreaker struct {
	failures   int64
	threshold  int64
	cooldown   time.Duration
	openUntil  int64 // 纳秒时间戳；0 表示闭合
	lastResult int64 // 1 成功 0 失败，用于状态展示
}

func newCircuitBreaker(threshold int, cooldown time.Duration) *circuitBreaker {
	if threshold <= 0 {
		threshold = 5
	}
	if cooldown <= 0 {
		cooldown = 10 * time.Second
	}
	return &circuitBreaker{
		threshold: int64(threshold),
		cooldown:  cooldown,
	}
}

func (cb *circuitBreaker) allow() bool {
	openUntil := atomic.LoadInt64(&cb.openUntil)
	if openUntil == 0 {
		return true
	}
	now := time.Now().UnixNano()
	if now > openUntil {
		return true // 半开状态，允许试探
	}
	return false
}

func (cb *circuitBreaker) onSuccess() {
	atomic.StoreInt64(&cb.failures, 0)
	atomic.StoreInt64(&cb.openUntil, 0)
	atomic.StoreInt64(&cb.lastResult, 1)
}

func (cb *circuitBreaker) onFailure() {
	atomic.StoreInt64(&cb.lastResult, 0)
	fails := atomic.AddInt64(&cb.failures, 1)
	if fails >= cb.threshold {
		openUntil := time.Now().Add(cb.cooldown).UnixNano()
		atomic.StoreInt64(&cb.openUntil, openUntil)
	}
}

func (cb *circuitBreaker) state() string {
	openUntil := atomic.LoadInt64(&cb.openUntil)
	if openUntil == 0 {
		return "closed"
	}
	if time.Now().UnixNano() > openUntil {
		return "half-open"
	}
	return "open"
}

// ===================== Redis 客户端封装 =====================

type redisClient struct {
	id      string
	cfg     core.ServerConfig
	client  goredis.UniversalClient
	mode    RedisMode
	ser     RedisSerialization
	breaker *circuitBreaker

	mu      sync.Mutex
	pubsubs map[string]*goredis.PubSub
	kssub   *goredis.PubSub
}

func buildUniversalOptions(cfg core.ServerConfig) *goredis.UniversalOptions {
	poolSize := cfg.RedisPoolSize
	if poolSize <= 0 {
		poolSize = 20
	}
	minIdle := cfg.RedisMinIdleConns
	maxIdle := cfg.RedisMaxIdleConns

	poolTimeout := time.Duration(cfg.RedisPoolTimeout) * time.Second
	if poolTimeout <= 0 {
		poolTimeout = 4 * time.Second
	}
	idleTimeout := time.Duration(cfg.RedisConnMaxIdleTime) * time.Second
	if idleTimeout <= 0 {
		idleTimeout = 5 * time.Minute
	}
	maxLifetime := time.Duration(cfg.RedisConnMaxLifetime) * time.Second

	dialTimeout := time.Duration(cfg.RedisDialTimeout) * time.Second
	if dialTimeout <= 0 {
		dialTimeout = 5 * time.Second
	}
	readTimeout := time.Duration(cfg.RedisReadTimeout) * time.Second
	if readTimeout <= 0 {
		readTimeout = 3 * time.Second
	}
	writeTimeout := time.Duration(cfg.RedisWriteTimeout) * time.Second
	if writeTimeout <= 0 {
		writeTimeout = 3 * time.Second
	}

	maxRetries := cfg.RedisMaxRetries
	if maxRetries < 0 {
		maxRetries = 3
	}
	minBackoff := time.Duration(cfg.RedisMinRetryBackoff) * time.Second
	if minBackoff <= 0 {
		minBackoff = 8 * time.Millisecond
	}
	maxBackoff := time.Duration(cfg.RedisMaxRetryBackoff) * time.Second
	if maxBackoff <= 0 {
		maxBackoff = 512 * time.Millisecond
	}

	opt := &goredis.UniversalOptions{
		Username:         cfg.RedisUsername,
		Password:         cfg.Password,
		DB:               cfg.DB,
		PoolSize:         poolSize,
		MinIdleConns:     minIdle,
		MaxIdleConns:     maxIdle,
		PoolTimeout:      poolTimeout,
		ConnMaxIdleTime:  idleTimeout,
		ConnMaxLifetime:  maxLifetime,
		DialTimeout:      dialTimeout,
		ReadTimeout:      readTimeout,
		WriteTimeout:     writeTimeout,
		MaxRetries:       maxRetries,
		MinRetryBackoff:  minBackoff,
		MaxRetryBackoff:  maxBackoff,
	}

	switch cfg.RedisMode {
	case string(RedisModeSentinel):
		if cfg.RedisSentinels != "" {
			opt.Addrs = strings.Split(cfg.RedisSentinels, ",")
			for i := range opt.Addrs {
				opt.Addrs[i] = strings.TrimSpace(opt.Addrs[i])
			}
		}
		opt.MasterName = cfg.RedisMasterName
	case string(RedisModeCluster):
		if cfg.RedisClusterNodes != "" {
			opt.Addrs = strings.Split(cfg.RedisClusterNodes, ",")
			for i := range opt.Addrs {
				opt.Addrs[i] = strings.TrimSpace(opt.Addrs[i])
			}
		}
	default:
		opt.Addrs = []string{cfg.Addr()}
	}

	return opt
}

func newRedisClient(id string, cfg core.ServerConfig) *redisClient {
	opt := buildUniversalOptions(cfg)
	cli := goredis.NewUniversalClient(opt)

	mode := RedisModeSingle
	if cfg.RedisMode != "" {
		mode = RedisMode(cfg.RedisMode)
	}

	ser := RedisSerNone
	if cfg.RedisSerialization != "" {
		ser = RedisSerialization(cfg.RedisSerialization)
	}

	cbThreshold := cfg.RedisBreakerThreshold
	if cbThreshold <= 0 {
		cbThreshold = 5
	}
	cbCooldown := time.Duration(cfg.RedisBreakerCooldown) * time.Second
	if cbCooldown <= 0 {
		cbCooldown = 10 * time.Second
	}

	return &redisClient{
		id:      id,
		cfg:     cfg,
		client:  cli,
		mode:    mode,
		ser:     ser,
		breaker: newCircuitBreaker(cbThreshold, cbCooldown),
		pubsubs: make(map[string]*goredis.PubSub),
	}
}

func (rc *redisClient) do(ctx context.Context, fn func(context.Context) error) error {
	if !rc.breaker.allow() {
		return errors.New("熔断器开启中：Redis 持续失败，暂时拒绝请求")
	}
	err := fn(ctx)
	if err != nil && !errors.Is(err, goredis.Nil) {
		rc.breaker.onFailure()
		return err
	}
	rc.breaker.onSuccess()
	return err
}

func (rc *redisClient) close() {
	rc.mu.Lock()
	defer rc.mu.Unlock()
	for _, ps := range rc.pubsubs {
		_ = ps.Close()
	}
	if rc.kssub != nil {
		_ = rc.kssub.Close()
	}
	_ = rc.client.Close()
}

// ===================== 连接管理 =====================

type RedisManager struct {
	mu      sync.Mutex
	clients map[string]*redisClient
}

func NewRedisManager() *RedisManager {
	return &RedisManager{clients: make(map[string]*redisClient)}
}

func (m *RedisManager) ListConnections() []map[string]any {
	m.mu.Lock()
	defer m.mu.Unlock()
	list := make([]map[string]any, 0, len(m.clients))
	for id, rc := range m.clients {
		list = append(list, map[string]any{
			"id":   id,
			"name": rc.cfg.Name,
			"host": rc.cfg.Host,
			"port": rc.cfg.Port,
			"mode": string(rc.mode),
		})
	}
	return list
}

func (m *RedisManager) ResolveID(idOrName string) (string, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	trimmed := strings.TrimSpace(idOrName)
	if trimmed != "" {
		if _, ok := m.clients[trimmed]; ok {
			return trimmed, nil
		}
		for id, rc := range m.clients {
			if strings.EqualFold(rc.cfg.Name, trimmed) || strings.EqualFold(rc.cfg.Host, trimmed) || strings.EqualFold(id, trimmed) {
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
		return "", errors.New("当前暂无已连通的 Redis 连接，请先在 Redis 界面中连接服务器")
	}
	return "", fmt.Errorf("存在多个活跃的 Redis 连接，请指定明确的 server_id (当前活跃连接数: %d)", len(m.clients))
}

func (m *RedisManager) Open(id string, cfg core.ServerConfig) error {
	m.mu.Lock()
	if old, ok := m.clients[id]; ok {
		old.close()
		delete(m.clients, id)
	}
	rc := newRedisClient(id, cfg)
	m.clients[id] = rc
	m.mu.Unlock()

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := rc.client.Ping(ctx).Err(); err != nil {
		m.mu.Lock()
		delete(m.clients, id)
		m.mu.Unlock()
		_ = rc.client.Close()
		return fmt.Errorf("连接 Redis 失败: %w", err)
	}
	return nil
}

// TestConnection 测试 Redis 服务器连通性并返回网络延迟
func (m *RedisManager) TestConnection(cfg core.ServerConfig) (map[string]any, error) {
	opt := buildUniversalOptions(cfg)
	opt.DialTimeout = 5 * time.Second
	opt.ReadTimeout = 5 * time.Second
	opt.WriteTimeout = 5 * time.Second
	opt.MaxRetries = 1
	cli := goredis.NewUniversalClient(opt)
	defer cli.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	start := time.Now()
	if err := cli.Ping(ctx).Err(); err != nil {
		return nil, fmt.Errorf("连接 Redis 失败: %w", err)
	}
	latency := time.Since(start).Milliseconds()
	return map[string]any{
		"connected": true,
		"pingMs":    latency,
	}, nil
}

func (m *RedisManager) Get(id string) (*redisClient, bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	c, ok := m.clients[id]
	return c, ok
}

func (m *RedisManager) Close(id string) {
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

func (m *RedisManager) CloseAll() {
	m.mu.Lock()
	all := make([]*redisClient, 0, len(m.clients))
	for _, c := range m.clients {
		all = append(all, c)
	}
	m.clients = make(map[string]*redisClient)
	m.mu.Unlock()
	for _, c := range all {
		c.close()
	}
}

// ===================== 会话摘要 =====================

type RedisSessionInfo struct {
	ID        string `json:"id"`
	ServerID  string `json:"serverId"`
	Title     string `json:"title"`
	Host      string `json:"host"`
	Port      int    `json:"port"`
	DB        int    `json:"db"`
	Connected bool   `json:"connected"`
}

func (rc *redisClient) info() RedisSessionInfo {
	return RedisSessionInfo{
		ID:        rc.id,
		ServerID:  rc.cfg.ID,
		Title:     rc.cfg.Label(),
		Host:      rc.cfg.Host,
		Port:      rc.cfg.Port,
		DB:        rc.cfg.DB,
		Connected: true,
	}
}

func (m *RedisManager) Connect(cfg core.ServerConfig) (RedisSessionInfo, error) {
	id := cfg.ID
	if id == "" {
		return RedisSessionInfo{}, errors.New("服务器 ID 不能为空")
	}
	if err := m.Open(id, cfg); err != nil {
		return RedisSessionInfo{}, err
	}
	rc, _ := m.Get(id)
	return rc.info(), nil
}

func (m *RedisManager) Disconnect(id string) error {
	m.Close(id)
	return nil
}

// ===================== 键扫描与搜索 =====================

type RedisKeyItem struct {
	Key  string `json:"key"`
	Type string `json:"type"`
	TTL  int64  `json:"ttl"` // 秒；-1 永久，-2 不存在
}

type RedisKeysResult struct {
	Keys   []RedisKeyItem `json:"keys"`
	Cursor uint64         `json:"cursor"`
}

func (m *RedisManager) ScanKeys(id, pattern string, cursor uint64, count int64) (RedisKeysResult, error) {
	rc, ok := m.Get(id)
	if !ok {
		return RedisKeysResult{}, errors.New("Redis 连接不存在或已断开")
	}
	if pattern == "" {
		pattern = "*"
	}
	if count <= 0 {
		count = 100
	}
	var keys []string
	var nextCursor uint64
	err := rc.do(context.Background(), func(c context.Context) error {
		var e error
		keys, nextCursor, e = rc.client.Scan(c, cursor, pattern, count).Result()
		return e
	})
	if err != nil {
		return RedisKeysResult{}, err
	}

	items := make([]RedisKeyItem, 0, len(keys))
	for _, k := range keys {
		ctx := context.Background()
		t, _ := rc.client.Type(ctx, k).Result()
		ttl, _ := rc.client.TTL(ctx, k).Result()
		ttlSec := int64(-1)
		if ttl > 0 {
			ttlSec = int64(ttl.Seconds())
		} else if ttl == -2*time.Second {
			ttlSec = -2
		}
		items = append(items, RedisKeyItem{Key: k, Type: t, TTL: ttlSec})
	}
	return RedisKeysResult{Keys: items, Cursor: nextCursor}, nil
}

// ===================== 键值读写 =====================

type RedisValue struct {
	Key     string `json:"key"`
	Type    string `json:"type"`
	TTL     int64  `json:"ttl"`
	Value   string `json:"value"`
	Size    int64  `json:"size"`
	RawJSON any    `json:"rawJson,omitempty"`
}

func (m *RedisManager) GetKey(id, key string) (RedisValue, error) {
	rc, ok := m.Get(id)
	if !ok {
		return RedisValue{}, errors.New("Redis 连接不存在或已断开")
	}
	ctx := context.Background()
	var kt string
	var ttl time.Duration
	err := rc.do(ctx, func(c context.Context) error {
		var e error
		kt, e = rc.client.Type(c, key).Result()
		if e != nil {
			return e
		}
		ttl, _ = rc.client.TTL(c, key).Result()
		return nil
	})
	if err != nil {
		return RedisValue{}, err
	}

	ttlSec := int64(-1)
	if ttl > 0 {
		ttlSec = int64(ttl.Seconds())
	} else if ttl == -2*time.Second {
		ttlSec = -2
	}

	val := RedisValue{Key: key, Type: kt, TTL: ttlSec}

	err = rc.do(ctx, func(c context.Context) error {
		switch kt {
		case "string":
			s, e := rc.client.Get(c, key).Result()
			if e != nil {
				return e
			}
			val.Value = s
			val.Size = int64(len(s))
			if rc.ser == RedisSerJSON {
				var obj any
				if json.Unmarshal([]byte(s), &obj) == nil {
					val.RawJSON = obj
				}
			}
		case "hash":
			m, e := rc.client.HGetAll(c, key).Result()
			if e != nil {
				return e
			}
			lines := make([]string, 0, len(m)*2)
			for k, v := range m {
				lines = append(lines, k, v)
			}
			val.Value = strings.Join(lines, "\n")
			val.Size = int64(len(m))
		case "list":
			l, e := rc.client.LRange(c, key, 0, -1).Result()
			if e != nil {
				return e
			}
			val.Value = strings.Join(l, "\n")
			val.Size = int64(len(l))
		case "set":
			s, e := rc.client.SMembers(c, key).Result()
			if e != nil {
				return e
			}
			val.Value = strings.Join(s, "\n")
			val.Size = int64(len(s))
		case "zset":
			zs, e := rc.client.ZRangeWithScores(c, key, 0, -1).Result()
			if e != nil {
				return e
			}
			lines := make([]string, 0, len(zs)*2)
			for _, z := range zs {
				lines = append(lines, fmt.Sprintf("%v", z.Member), fmt.Sprintf("%v", z.Score))
			}
			val.Value = strings.Join(lines, "\n")
			val.Size = int64(len(zs))
		case "stream":
			msgs, e := rc.client.XRevRangeN(c, key, "+", "-", 100).Result()
			if e != nil {
				return e
			}
			lines := make([]string, 0, len(msgs))
			for _, msg := range msgs {
				fieldParts := make([]string, 0, len(msg.Values))
				for fk, fv := range msg.Values {
					fieldParts = append(fieldParts, fmt.Sprintf("%s=%v", fk, fv))
				}
				lines = append(lines, fmt.Sprintf("%s\n%s", msg.ID, strings.Join(fieldParts, " ")))
			}
			val.Value = strings.Join(lines, "\n---\n")
			val.Size = int64(len(msgs))
		case "none":
			val.Value = ""
			val.Size = 0
		default:
			val.Value = fmt.Sprintf("(暂不支持该数据类型的可视化编辑: %s)", kt)
			val.Size = 0
		}
		return nil
	})
	if err != nil {
		return RedisValue{}, err
	}
	return val, nil
}

func (m *RedisManager) SetKey(id, key, keyType, value string, ttlSec int64) error {
	rc, ok := m.Get(id)
	if !ok {
		return errors.New("Redis 连接不存在或已断开")
	}
	return rc.do(context.Background(), func(c context.Context) error {
		var exp time.Duration
		if ttlSec > 0 {
			exp = time.Duration(ttlSec) * time.Second
		}
		switch keyType {
		case "string":
			return rc.client.Set(c, key, value, exp).Err()
		case "list":
			if err := rc.client.Del(c, key).Err(); err != nil {
				return err
			}
			items := splitLines(value)
			if len(items) > 0 {
				if err := rc.client.RPush(c, key, toInterfaces(items)...).Err(); err != nil {
					return err
				}
			}
		case "set":
			if err := rc.client.Del(c, key).Err(); err != nil {
				return err
			}
			items := splitLines(value)
			if len(items) > 0 {
				if err := rc.client.SAdd(c, key, toInterfaces(items)...).Err(); err != nil {
					return err
				}
			}
		case "hash":
			if err := rc.client.Del(c, key).Err(); err != nil {
				return err
			}
			pairs := pairsToMap(value)
			if len(pairs) > 0 {
				if err := rc.client.HSet(c, key, pairs).Err(); err != nil {
					return err
				}
			}
		case "zset":
			if err := rc.client.Del(c, key).Err(); err != nil {
				return err
			}
			pairs := zsetToPairs(value)
			if len(pairs) > 0 {
				zs := make([]goredis.Z, 0, len(pairs))
				for _, p := range pairs {
					var sc float64
					fmt.Sscanf(p[1], "%f", &sc)
					zs = append(zs, goredis.Z{Score: sc, Member: p[0]})
				}
				if err := rc.client.ZAdd(c, key, zs...).Err(); err != nil {
					return err
				}
			}
		case "stream":
			lines := splitLines(value)
			for _, line := range lines {
				line = strings.TrimSpace(line)
				if line == "" || line == "---" {
					continue
				}
				fields := make(map[string]any)
				parts := strings.Fields(line)
				for _, p := range parts {
					if kv := strings.SplitN(p, "=", 2); len(kv) == 2 {
						fields[kv[0]] = kv[1]
					}
				}
				if len(fields) > 0 {
					_ = rc.client.XAdd(c, &goredis.XAddArgs{
						Stream: key,
						Values: fields,
					}).Err()
				}
			}
		default:
			return fmt.Errorf("不支持的 keyType: %s", keyType)
		}
		if exp > 0 {
			_ = rc.client.Expire(c, key, exp).Err()
		}
		return nil
	})
}

func (m *RedisManager) DelKeys(id string, keys []string) (int, error) {
	rc, ok := m.Get(id)
	if !ok {
		return 0, errors.New("Redis 连接不存在或已断开")
	}
	if len(keys) == 0 {
		return 0, nil
	}
	var n int64
	err := rc.do(context.Background(), func(c context.Context) error {
		var e error
		n, e = rc.client.Del(c, keys...).Result()
		return e
	})
	return int(n), err
}

func (m *RedisManager) ExpireKey(id, key string, ttlSec int64) error {
	rc, ok := m.Get(id)
	if !ok {
		return errors.New("Redis 连接不存在或已断开")
	}
	return rc.do(context.Background(), func(c context.Context) error {
		if ttlSec <= 0 {
			return rc.client.Persist(c, key).Err()
		}
		return rc.client.Expire(c, key, time.Duration(ttlSec)*time.Second).Err()
	})
}

func (m *RedisManager) RenameKey(id, oldKey, newKey string) error {
	rc, ok := m.Get(id)
	if !ok {
		return errors.New("Redis 连接不存在或已断开")
	}
	return rc.do(context.Background(), func(c context.Context) error {
		return rc.client.Rename(c, oldKey, newKey).Err()
	})
}

func (m *RedisManager) ExecuteRawCommand(id string, command string) (map[string]any, error) {
	rc, ok := m.Get(id)
	if !ok {
		return nil, errors.New("Redis 连接不存在或已断开")
	}
	parts := strings.Fields(strings.TrimSpace(command))
	if len(parts) == 0 {
		return nil, errors.New("命令不能为空")
	}
	var result any
	err := rc.do(context.Background(), func(c context.Context) error {
		r := rc.client.Do(c, toInterfaces(parts)...)
		val, e := r.Result()
		result = val
		return e
	})
	if err != nil {
		return nil, err
	}
	return map[string]any{"result": formatRedisResult(result)}, nil
}

func (m *RedisManager) DBSize(id string) (int, error) {
	rc, ok := m.Get(id)
	if !ok {
		return 0, errors.New("Redis 连接不存在或已断开")
	}
	var n int64
	err := rc.do(context.Background(), func(c context.Context) error {
		var e error
		n, e = rc.client.DBSize(c).Result()
		return e
	})
	if err != nil {
		return 0, err
	}
	return int(n), nil
}

type RedisCmdResult struct {
	Result string `json:"result"`
	Error  string `json:"error"`
}

type RedisPipelineResult struct {
	Results []RedisCmdResult `json:"results"`
	Error   string           `json:"error"`
}

type RedisTransactionResult struct {
	Results []RedisCmdResult `json:"results"`
	Aborted bool             `json:"aborted"`
	Error   string           `json:"error"`
}

type RedisQueueItem struct {
	ID      string `json:"id"`
	Payload any    `json:"payload"`
	Empty   bool   `json:"empty,omitempty"`
}

type RedisSlowLogEntry struct {
	ID        int64  `json:"id"`
	Timestamp int64  `json:"timestamp"`
	Duration  int64  `json:"duration"`
	Command   string `json:"command"`
	Client    string `json:"client"`
}

type RedisMonitorInfo struct {
	Breaker          string `json:"breaker"`
	Hits             int64  `json:"hits"`
	Misses           int64  `json:"misses"`
	Timeouts         int64  `json:"timeouts"`
	TotalConns       uint32 `json:"totalConns"`
	IdleConns        uint32 `json:"idleConns"`
	StaleConns       uint32 `json:"staleConns"`
	Mode             string `json:"mode"`
	Serialization    string `json:"serialization"`
	Version          string `json:"version,omitempty"`
	MemoryUsed       string `json:"memoryUsed,omitempty"`
	UptimeDays       string `json:"uptimeDays,omitempty"`
	ConnectedClients string `json:"connectedClients,omitempty"`
}
