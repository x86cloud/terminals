package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/redis/go-redis/v9"
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

// circuitBreaker 实现简单的失败计数熔断：连续失败达到阈值后进入 open 状态，
// 在冷却时间内直接拒绝请求，之后进入 half-open 试探。
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
		cooldown = 15 * time.Second
	}
	return &circuitBreaker{threshold: int64(threshold), cooldown: cooldown}
}

func (b *circuitBreaker) allow() bool {
	ou := atomic.LoadInt64(&b.openUntil)
	if ou == 0 {
		return true
	}
	if time.Now().UnixNano() >= ou {
		// 冷却结束，进入半开试探
		atomic.StoreInt64(&b.openUntil, 0)
		atomic.StoreInt64(&b.failures, 0)
		return true
	}
	return false
}

func (b *circuitBreaker) recordSuccess() {
	atomic.StoreInt64(&b.failures, 0)
	atomic.StoreInt64(&b.openUntil, 0)
	atomic.StoreInt64(&b.lastResult, 1)
}

func (b *circuitBreaker) recordFailure() {
	f := atomic.AddInt64(&b.failures, 1)
	atomic.StoreInt64(&b.lastResult, 0)
	if f >= b.threshold {
		atomic.StoreInt64(&b.openUntil, time.Now().UnixNano()+b.cooldown.Nanoseconds())
	}
}

func (b *circuitBreaker) state() string {
	if atomic.LoadInt64(&b.openUntil) != 0 {
		return "open"
	}
	if atomic.LoadInt64(&b.failures) > 0 {
		return "half-open"
	}
	return "closed"
}

// ===================== 连接包装 =====================

// redisClient 表示一个 Redis 会话（单机 / 哨兵 / 集群），统一使用 go-redis 的 UniversalClient。
type redisClient struct {
	id      string
	cfg     ServerConfig
	mode    RedisMode
	ser     RedisSerialization
	client  redis.UniversalClient
	breaker *circuitBreaker

	mu      sync.Mutex
	pubsubs map[string]*redis.PubSub // 普通频道订阅，key=channel
	kssub   *redis.PubSub            // 键空间事件订阅
	closed  bool
}

// buildUniversalOptions 根据配置构造 go-redis 的通用选项（兼容单机/哨兵/集群）。
func buildUniversalOptions(cfg ServerConfig) *redis.UniversalOptions {
	mode := RedisMode(cfg.RedisMode)
	if mode == "" {
		mode = RedisModeSingle
	}
	opts := &redis.UniversalOptions{
		Password: cfg.Password,
		DB:       cfg.DB,
	}
	switch mode {
	case RedisModeSentinel:
		opts.Addrs = splitAddrs(cfg.RedisSentinels)
		opts.MasterName = cfg.RedisMasterName
	case RedisModeCluster:
		opts.Addrs = splitAddrs(cfg.RedisClusterNodes)
	default:
		opts.Addrs = []string{cfg.addr()}
	}

	// 连接池配置
	if cfg.RedisPoolSize > 0 {
		opts.PoolSize = cfg.RedisPoolSize
	}
	if cfg.RedisMinIdleConns > 0 {
		opts.MinIdleConns = cfg.RedisMinIdleConns
	}
	if cfg.RedisMaxIdleConns > 0 {
		opts.MaxIdleConns = cfg.RedisMaxIdleConns
	}
	if cfg.RedisPoolTimeout > 0 {
		opts.PoolTimeout = time.Duration(cfg.RedisPoolTimeout) * time.Second
	}
	if cfg.RedisConnMaxIdleTime > 0 {
		opts.ConnMaxIdleTime = time.Duration(cfg.RedisConnMaxIdleTime) * time.Second
	}
	if cfg.RedisConnMaxLifetime > 0 {
		opts.ConnMaxLifetime = time.Duration(cfg.RedisConnMaxLifetime) * time.Second
	}
	// 超时与重试
	dialTO := cfg.RedisDialTimeout
	if dialTO <= 0 {
		dialTO = 5
	}
	opts.DialTimeout = time.Duration(dialTO) * time.Second
	readTO := cfg.RedisReadTimeout
	if readTO <= 0 {
		readTO = 3
	}
	opts.ReadTimeout = time.Duration(readTO) * time.Second
	writeTO := cfg.RedisWriteTimeout
	if writeTO <= 0 {
		writeTO = 3
	}
	opts.WriteTimeout = time.Duration(writeTO) * time.Second
	opts.MaxRetries = cfg.RedisMaxRetries
	if opts.MaxRetries <= 0 {
		opts.MaxRetries = 3
	}
	if cfg.RedisMinRetryBackoff > 0 {
		opts.MinRetryBackoff = time.Duration(cfg.RedisMinRetryBackoff) * time.Second
	}
	if cfg.RedisMaxRetryBackoff > 0 {
		opts.MaxRetryBackoff = time.Duration(cfg.RedisMaxRetryBackoff) * time.Second
	}
	if cfg.Username != "" {
		opts.Username = cfg.Username
	}
	return opts
}

func splitAddrs(s string) []string {
	parts := strings.Split(s, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" {
			out = append(out, p)
		}
	}
	return out
}

func newRedisClient(id string, cfg ServerConfig) *redisClient {
	opts := buildUniversalOptions(cfg)
	ser := RedisSerialization(cfg.RedisSerialization)
	if ser == "" {
		ser = RedisSerNone
	}
	return &redisClient{
		id:      id,
		cfg:     cfg,
		mode:    RedisMode(cfg.RedisMode),
		ser:     ser,
		client:  redis.NewUniversalClient(opts),
		breaker: newCircuitBreaker(cfg.RedisBreakerThreshold, time.Duration(cfg.RedisBreakerCooldown)*time.Second),
		pubsubs: make(map[string]*redis.PubSub),
	}
}

// do 在熔断器保护下执行命令，保证线程安全。
func (rc *redisClient) do(ctx context.Context, fn func(c context.Context) error) error {
	if !rc.breaker.allow() {
		return errors.New("熔断器已打开，暂时拒绝请求（冷却中）")
	}
	rc.mu.Lock()
	closed := rc.closed
	rc.mu.Unlock()
	if closed {
		return errors.New("Redis 连接已关闭")
	}
	err := fn(ctx)
	if err != nil {
		rc.breaker.recordFailure()
	} else {
		rc.breaker.recordSuccess()
	}
	return err
}

func (rc *redisClient) close() {
	rc.mu.Lock()
	defer rc.mu.Unlock()
	if rc.closed {
		return
	}
	rc.closed = true
	for _, ps := range rc.pubsubs {
		_ = ps.Close()
	}
	if rc.kssub != nil {
		_ = rc.kssub.Close()
	}
	_ = rc.client.Close()
}

// ===================== 连接管理 =====================

type redisManager struct {
	mu      sync.Mutex
	clients map[string]*redisClient
}

func newRedisManager() *redisManager {
	return &redisManager{clients: make(map[string]*redisClient)}
}

func (m *redisManager) open(id string, cfg ServerConfig) error {
	m.mu.Lock()
	if old, ok := m.clients[id]; ok {
		old.close()
		delete(m.clients, id)
	}
	rc := newRedisClient(id, cfg)
	m.clients[id] = rc
	m.mu.Unlock()

	// 探活：真正建立一条连接
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

func (m *redisManager) get(id string) (*redisClient, bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	c, ok := m.clients[id]
	return c, ok
}

func (m *redisManager) close(id string) {
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

func (m *redisManager) closeAll() {
	m.mu.Lock()
	all := m.clients
	m.clients = make(map[string]*redisClient)
	m.mu.Unlock()
	for _, c := range all {
		c.close()
	}
}

// ===================== 序列化 =====================

// serialize 根据配置将任意 JSON 友好值编码为待存储字符串；none 模式下原样返回字符串。
func (rc *redisClient) serialize(v string) string {
	if rc.ser == RedisSerJSON {
		// 仅当内容不是合法 JSON 时包裹为字符串，保证可反序列化
		if !json.Valid([]byte(v)) {
			if b, err := json.Marshal(v); err == nil {
				return string(b)
			}
		}
	}
	return v
}

func (rc *redisClient) deserialize(v string) string {
	if rc.ser == RedisSerJSON {
		var out any
		if err := json.Unmarshal([]byte(v), &out); err == nil {
			if s, ok := out.(string); ok {
				return s
			}
			if b, err := json.MarshalIndent(out, "", "  "); err == nil {
				return string(b)
			}
		}
	}
	return v
}

// ===================== 高层方法（供前端调用） =====================

func (a *App) RedisConnect(id string) (bool, error) {
	cfg, ok := a.store.Get(id)
	if !ok {
		return false, errors.New("找不到该服务器配置")
	}
	if cfg.connType() != ConnRedis {
		return false, errors.New("该连接不是 Redis 类型")
	}
	if err := a.redisMgr.open(id, cfg); err != nil {
		return false, err
	}
	return true, nil
}

func (a *App) RedisClose(id string) {
	a.redisMgr.close(id)
}

// RedisModeInfo 返回连接模式、状态等元信息。
func (a *App) RedisModeInfo(id string) (map[string]any, error) {
	rc, ok := a.redisMgr.get(id)
	if !ok {
		return nil, errors.New("Redis 连接不存在或已断开")
	}
	return map[string]any{
		"mode":         string(rc.mode),
		"breaker":      rc.breaker.state(),
		"serialization": string(rc.ser),
		"cluster":      rc.mode == RedisModeCluster,
		"sentinel":     rc.mode == RedisModeSentinel,
	}, nil
}

func (a *App) RedisSelectDB(id string, db int) error {
	rc, ok := a.redisMgr.get(id)
	if !ok {
		return errors.New("Redis 连接不存在或已断开")
	}
	return rc.do(context.Background(), func(c context.Context) error {
		if rc.mode == RedisModeCluster {
			return errors.New("集群模式下不支持 SELECT")
		}
		return rc.client.Do(c, "SELECT", strconv.Itoa(db)).Err()
	})
}

func (a *App) RedisKeys(id string, pattern string, cursor string) (map[string]any, error) {
	rc, ok := a.redisMgr.get(id)
	if !ok {
		return nil, errors.New("Redis 连接不存在或已断开")
	}
	if pattern == "" {
		pattern = "*"
	}
	if cursor == "" {
		cursor = "0"
	}
	var keys []string
	newCursor := "0"
	err := rc.do(context.Background(), func(c context.Context) error {
		cur, err := strconv.ParseUint(cursor, 10, 64)
		if err != nil {
			cur = 0
		}
		var k []string
		var nc uint64
		k, nc, err = rc.client.Scan(c, cur, pattern, 200).Result()
		keys = k
		newCursor = strconv.FormatUint(nc, 10)
		return err
	})
	if err != nil {
		return nil, err
	}
	out := make([]any, 0, len(keys))
	for _, k := range keys {
		out = append(out, k)
	}
	return map[string]any{"cursor": newCursor, "keys": out}, nil
}

func (a *App) RedisGet(id string, key string) (map[string]any, error) {
	rc, ok := a.redisMgr.get(id)
	if !ok {
		return nil, errors.New("Redis 连接不存在或已断开")
	}
	typ, err := rc.client.Type(context.Background(), key).Result()
	if err != nil {
		return nil, err
	}
	ttl, _ := rc.client.TTL(context.Background(), key).Result()
	res := map[string]any{"type": typ, "ttl": int(ttl.Seconds())}
	switch typ {
	case "string":
		val, e := rc.client.Get(context.Background(), key).Result()
		if e != nil {
			return nil, e
		}
		res["value"] = rc.deserialize(val)
	case "list":
		vals, e := rc.client.LRange(context.Background(), key, 0, -1).Result()
		if e != nil {
			return nil, e
		}
		res["value"] = vals
	case "set":
		vals, e := rc.client.SMembers(context.Background(), key).Result()
		if e != nil {
			return nil, e
		}
		res["value"] = vals
	case "hash":
		m, e := rc.client.HGetAll(context.Background(), key).Result()
		if e != nil {
			return nil, e
		}
		res["value"] = m
	case "zset":
		vals, e := rc.client.ZRangeWithScores(context.Background(), key, 0, -1).Result()
		if e != nil {
			return nil, e
		}
		pairs := make([]map[string]any, 0, len(vals))
		for _, z := range vals {
			pairs = append(pairs, map[string]any{"member": fmt.Sprintf("%v", z.Member), "score": z.Score})
		}
		res["value"] = pairs
	case "stream":
		entries, e := rc.client.XRange(context.Background(), key, "-", "+").Result()
		if e != nil {
			return nil, e
		}
		items := make([]map[string]any, 0, len(entries))
		for _, en := range entries {
			items = append(items, map[string]any{"id": en.ID, "fields": en.Values})
		}
		res["value"] = items
	case "none":
		return nil, fmt.Errorf("key 不存在: %s", key)
	default:
		res["value"] = ""
	}
	return res, nil
}

// RedisSet 写入键值；typ 决定数据结构。
func (a *App) RedisSet(id string, key string, typ string, value string, ttl int) error {
	rc, ok := a.redisMgr.get(id)
	if !ok {
		return errors.New("Redis 连接不存在或已断开")
	}
	return rc.do(context.Background(), func(c context.Context) error {
		switch typ {
		case "string":
			if err := rc.client.Set(c, key, rc.serialize(value), 0).Err(); err != nil {
				return err
			}
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
			m := pairsToMap(value)
			if len(m) > 0 {
				if err := rc.client.HSet(c, key, m).Err(); err != nil {
					return err
				}
			}
		case "zset":
			if err := rc.client.Del(c, key).Err(); err != nil {
				return err
			}
			for _, p := range zsetToPairs(value) {
				score, err := strconv.ParseFloat(p[1], 64)
				if err != nil {
					return fmt.Errorf("分数非法: %s", p[1])
				}
				if err := rc.client.ZAdd(c, key, redis.Z{Score: score, Member: p[0]}).Err(); err != nil {
					return err
				}
			}
		case "stream":
			if err := rc.client.Del(c, key).Err(); err != nil {
				return err
			}
			// value 每行一个字段，key=value
			fields := pairsToMap(value)
			if len(fields) > 0 {
				if err := rc.client.XAdd(c, &redis.XAddArgs{Stream: key, Values: fields}).Err(); err != nil {
					return err
				}
			}
		default:
			return errors.New("不支持的类型: " + typ)
		}
		if ttl > 0 {
			return rc.client.Expire(c, key, time.Duration(ttl)*time.Second).Err()
		}
		return nil
	})
}

func (a *App) RedisDelete(id string, key string) error {
	rc, ok := a.redisMgr.get(id)
	if !ok {
		return errors.New("Redis 连接不存在或已断开")
	}
	return rc.do(context.Background(), func(c context.Context) error {
		return rc.client.Del(c, key).Err()
	})
}

func (a *App) RedisExpire(id string, key string, ttl int) error {
	rc, ok := a.redisMgr.get(id)
	if !ok {
		return errors.New("Redis 连接不存在或已断开")
	}
	return rc.do(context.Background(), func(c context.Context) error {
		if ttl <= 0 {
			return rc.client.Persist(c, key).Err()
		}
		return rc.client.Expire(c, key, time.Duration(ttl)*time.Second).Err()
	})
}

// RedisRaw 执行任意命令（参数以空格分隔）。
func (a *App) RedisRaw(id string, command string) (map[string]any, error) {
	rc, ok := a.redisMgr.get(id)
	if !ok {
		return nil, errors.New("Redis 连接不存在或已断开")
	}
	command = strings.TrimSpace(command)
	if command == "" {
		return nil, errors.New("命令不能为空")
	}
	parts := strings.Fields(command)
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

func (a *App) RedisDBSize(id string) (int, error) {
	rc, ok := a.redisMgr.get(id)
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
