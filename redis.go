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
	wruntime "github.com/wailsapp/wails/v2/pkg/runtime"
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

// ===================== 类型专属命令 =====================

// RedisStringSet/Get 等细粒度操作省略时由 RedisSet/RedisGet 覆盖，这里补充常用扩展命令。

func (a *App) RedisStringAppend(id, key, value string) (int, error) {
	rc, ok := a.redisMgr.get(id)
	if !ok {
		return 0, errors.New("Redis 连接不存在或已断开")
	}
	var n int64
	err := rc.do(context.Background(), func(c context.Context) error {
		var e error
		n, e = rc.client.Append(c, key, value).Result()
		return e
	})
	return int(n), err
}

func (a *App) RedisHashFieldSet(id, key, field, value string) error {
	rc, ok := a.redisMgr.get(id)
	if !ok {
		return errors.New("Redis 连接不存在或已断开")
	}
	return rc.do(context.Background(), func(c context.Context) error {
		return rc.client.HSet(c, key, field, value).Err()
	})
}

func (a *App) RedisHashFieldGet(id, key, field string) (string, error) {
	rc, ok := a.redisMgr.get(id)
	if !ok {
		return "", errors.New("Redis 连接不存在或已断开")
	}
	var v string
	err := rc.do(context.Background(), func(c context.Context) error {
		r, e := rc.client.HGet(c, key, field).Result()
		v = r
		return e
	})
	return v, err
}

func (a *App) RedisHashFieldDel(id, key string, fields []string) (int, error) {
	rc, ok := a.redisMgr.get(id)
	if !ok {
		return 0, errors.New("Redis 连接不存在或已断开")
	}
	var n int64
	err := rc.do(context.Background(), func(c context.Context) error {
		var e error
		n, e = rc.client.HDel(c, key, fields...).Result()
		return e
	})
	return int(n), err
}

func (a *App) RedisListPush(id, key, value string, left bool) (int, error) {
	rc, ok := a.redisMgr.get(id)
	if !ok {
		return 0, errors.New("Redis 连接不存在或已断开")
	}
	var n int64
	err := rc.do(context.Background(), func(c context.Context) error {
		var e error
		if left {
			n, e = rc.client.LPush(c, key, value).Result()
		} else {
			n, e = rc.client.RPush(c, key, value).Result()
		}
		return e
	})
	return int(n), err
}

func (a *App) RedisListPop(id, key string, left bool) (string, error) {
	rc, ok := a.redisMgr.get(id)
	if !ok {
		return "", errors.New("Redis 连接不存在或已断开")
	}
	var v string
	err := rc.do(context.Background(), func(c context.Context) error {
		var e error
		if left {
			v, e = rc.client.LPop(c, key).Result()
		} else {
			v, e = rc.client.RPop(c, key).Result()
		}
		return e
	})
	return v, err
}

func (a *App) RedisSetAdd(id, key string, members []string) (int, error) {
	rc, ok := a.redisMgr.get(id)
	if !ok {
		return 0, errors.New("Redis 连接不存在或已断开")
	}
	var n int64
	err := rc.do(context.Background(), func(c context.Context) error {
		var e error
		n, e = rc.client.SAdd(c, key, toInterfaces(members)...).Result()
		return e
	})
	return int(n), err
}

func (a *App) RedisSetRem(id, key string, members []string) (int, error) {
	rc, ok := a.redisMgr.get(id)
	if !ok {
		return 0, errors.New("Redis 连接不存在或已断开")
	}
	var n int64
	err := rc.do(context.Background(), func(c context.Context) error {
		var e error
		n, e = rc.client.SRem(c, key, toInterfaces(members)...).Result()
		return e
	})
	return int(n), err
}

func (a *App) RedisZSetAdd(id, key, member string, score float64) (int, error) {
	rc, ok := a.redisMgr.get(id)
	if !ok {
		return 0, errors.New("Redis 连接不存在或已断开")
	}
	var n int64
	err := rc.do(context.Background(), func(c context.Context) error {
		var e error
		n, e = rc.client.ZAdd(c, key, redis.Z{Score: score, Member: member}).Result()
		return e
	})
	return int(n), err
}

func (a *App) RedisZSetRem(id, key string, members []string) (int, error) {
	rc, ok := a.redisMgr.get(id)
	if !ok {
		return 0, errors.New("Redis 连接不存在或已断开")
	}
	var n int64
	err := rc.do(context.Background(), func(c context.Context) error {
		var e error
		n, e = rc.client.ZRem(c, key, toInterfaces(members)...).Result()
		return e
	})
	return int(n), err
}

// ===================== Pipeline =====================

// RedisPipeline 批量执行一组命令（非事务）。commands 为字符串数组，每条一个命令。
func (a *App) RedisPipeline(id string, commands []string) (map[string]any, error) {
	rc, ok := a.redisMgr.get(id)
	if !ok {
		return nil, errors.New("Redis 连接不存在或已断开")
	}
	results := make([]map[string]any, 0, len(commands))
	cmds := make([]*redis.Cmd, 0, len(commands))
	err := rc.do(context.Background(), func(c context.Context) error {
		pipe := rc.client.Pipeline()
		for _, line := range commands {
			parts := strings.Fields(strings.TrimSpace(line))
			if len(parts) == 0 {
				cmds = append(cmds, redis.NewCmd(c))
				continue
			}
			cmd := redis.NewCmd(c, toInterfaces(parts)...)
			pipe.Process(c, cmd)
			cmds = append(cmds, cmd)
		}
		_, e := pipe.Exec(c)
		// 即便部分失败也收集结果
		for _, cmd := range cmds {
			val, err := cmd.Result()
			results = append(results, map[string]any{
				"result": formatRedisResult(val),
				"error":  errToString(err),
			})
		}
		return e
	})
	return map[string]any{"results": results, "error": errToString(err)}, nil
}

// ===================== 事务 MULTI / EXEC / WATCH =====================

// RedisTransaction 在 WATCH 指定键的前提下执行事务。
// commands 为待执行命令；watch 为需监听的键（乐观锁）。
func (a *App) RedisTransaction(id string, watch []string, commands []string) (map[string]any, error) {
	rc, ok := a.redisMgr.get(id)
	if !ok {
		return nil, errors.New("Redis 连接不存在或已断开")
	}
	results := make([]map[string]any, 0, len(commands))
	var txErr error
	err := rc.do(context.Background(), func(c context.Context) error {
		err := rc.client.Watch(c, func(tx *redis.Tx) error {
		_, err := tx.TxPipelined(c, func(pipe redis.Pipeliner) error {
		cmds := make([]*redis.Cmd, 0, len(commands))
			for _, line := range commands {
				parts := strings.Fields(strings.TrimSpace(line))
				if len(parts) == 0 {
					continue
				}
				cmd := redis.NewCmd(c, toInterfaces(parts)...)
				pipe.Process(c, cmd)
				cmds = append(cmds, cmd)
			}
			_, e := pipe.Exec(c)
			for _, cmd := range cmds {
				val, cerr := cmd.Result()
				results = append(results, map[string]any{
					"result": formatRedisResult(val),
					"error":  errToString(cerr),
				})
			}
			return e
		})
		return err
		}, watch...)
		txErr = err
		return err
	})
	return map[string]any{
		"results": results,
		"aborted": errors.Is(txErr, redis.TxFailedErr),
		"error":   errToString(err),
	}, nil
}

// ===================== 发布 / 订阅 =====================

// RedisPublish 向频道发布消息。
func (a *App) RedisPublish(id, channel, message string) (int, error) {
	rc, ok := a.redisMgr.get(id)
	if !ok {
		return 0, errors.New("Redis 连接不存在或已断开")
	}
	var n int64
	err := rc.do(context.Background(), func(c context.Context) error {
		var e error
		n, e = rc.client.Publish(c, channel, message).Result()
		return e
	})
	return int(n), err
}

// RedisSubscribe 订阅频道，消息经 Wails 事件推送到前端。
func (a *App) RedisSubscribe(id, channel string) error {
	rc, ok := a.redisMgr.get(id)
	if !ok {
		return errors.New("Redis 连接不存在或已断开")
	}
	rc.mu.Lock()
	if _, exists := rc.pubsubs[channel]; exists {
		rc.mu.Unlock()
		return nil
	}
	ps := rc.client.Subscribe(context.Background(), channel)
	rc.pubsubs[channel] = ps
	rc.mu.Unlock()

	go func() {
		ctx := context.Background()
		for msg := range ps.Channel() {
			wruntime.EventsEmit(a.ctx, "redis:pubsub:"+id, map[string]any{
				"channel": msg.Channel,
				"pattern": msg.Pattern,
				"payload": msg.Payload,
			})
		}
		_ = ctx
	}()
	return nil
}

// RedisPSubscribe 模式订阅。
func (a *App) RedisPSubscribe(id, pattern string) error {
	rc, ok := a.redisMgr.get(id)
	if !ok {
		return errors.New("Redis 连接不存在或已断开")
	}
	rc.mu.Lock()
	if _, exists := rc.pubsubs["~"+pattern]; exists {
		rc.mu.Unlock()
		return nil
	}
	ps := rc.client.PSubscribe(context.Background(), pattern)
	rc.pubsubs["~"+pattern] = ps
	rc.mu.Unlock()

	go func() {
		for msg := range ps.Channel() {
			wruntime.EventsEmit(a.ctx, "redis:pubsub:"+id, map[string]any{
				"channel": msg.Channel,
				"pattern": msg.Pattern,
				"payload": msg.Payload,
			})
		}
	}()
	return nil
}

// RedisUnsubscribe 取消订阅。
func (a *App) RedisUnsubscribe(id, channel string) error {
	rc, ok := a.redisMgr.get(id)
	if !ok {
		return errors.New("Redis 连接不存在或已断开")
	}
	rc.mu.Lock()
	defer rc.mu.Unlock()
	for _, key := range []string{channel, "~" + channel} {
		if ps, ok := rc.pubsubs[key]; ok {
			_ = ps.Close()
			delete(rc.pubsubs, key)
		}
	}
	return nil
}

// RedisSubscriptions 返回当前订阅列表。
func (a *App) RedisSubscriptions(id string) ([]string, error) {
	rc, ok := a.redisMgr.get(id)
	if !ok {
		return nil, errors.New("Redis 连接不存在或已断开")
	}
	rc.mu.Lock()
	defer rc.mu.Unlock()
	out := make([]string, 0, len(rc.pubsubs))
	for k := range rc.pubsubs {
		out = append(out, strings.TrimPrefix(k, "~"))
	}
	return out, nil
}

// ===================== 键空间事件（过期监听） =====================

// RedisKeyspaceNotify 开启键空间事件订阅，将事件推送到前端。
// 事件类型如 expired / set / del / expire 等，由 event 参数（如 "expired"）过滤。
func (a *App) RedisKeyspaceNotify(id string, db int, event string) error {
	rc, ok := a.redisMgr.get(id)
	if !ok {
		return errors.New("Redis 连接不存在或已断开")
	}
	rc.mu.Lock()
	if rc.kssub != nil {
		rc.mu.Unlock()
		return nil
	}
	// __keyevent@<db>__:<event>
	pattern := fmt.Sprintf("__keyevent@%d__:%s", db, event)
	ps := rc.client.PSubscribe(context.Background(), pattern)
	rc.kssub = ps
	rc.mu.Unlock()

	// 确保配置 notify-keyspace-events 包含对应事件
	_ = rc.client.ConfigSet(context.Background(), "notify-keyspace-events", "KEA")

	go func() {
		for msg := range ps.Channel() {
			wruntime.EventsEmit(a.ctx, "redis:keyspace:"+id, map[string]any{
				"channel": msg.Channel,
				"key":     extractKeyFromEvent(msg.Channel),
				"event":   event,
				"payload": msg.Payload,
			})
		}
	}()
	return nil
}

func extractKeyFromEvent(channel string) string {
	// __keyevent@0__:expired 与 __keyspace@0__:mykey 两种格式
	if idx := strings.Index(channel, ":"); idx > 0 {
		return channel[idx+1:]
	}
	return channel
}

// ===================== 消息队列（基于 List / Stream） =====================

// RedisQueueEnqueue 入队：默认 List（RPUSH），mode="stream" 时使用 Stream。
func (a *App) RedisQueueEnqueue(id, queue, payload, mode string) (string, error) {
	rc, ok := a.redisMgr.get(id)
	if !ok {
		return "", errors.New("Redis 连接不存在或已断开")
	}
	var idOut string
	err := rc.do(context.Background(), func(c context.Context) error {
		if mode == "stream" {
			res, e := rc.client.XAdd(c, &redis.XAddArgs{
				Stream: queue,
				Values: map[string]any{"payload": payload},
			}).Result()
			idOut = res
			return e
		}
		n, e := rc.client.RPush(c, queue, payload).Result()
		idOut = strconv.FormatInt(n, 10)
		return e
	})
	return idOut, err
}

// RedisQueueDequeue 出队：List 用 BLPOP（阻塞 timeout 秒），Stream 用 XREADGROUP。
func (a *App) RedisQueueDequeue(id, queue, mode string, timeout int) (map[string]any, error) {
	rc, ok := a.redisMgr.get(id)
	if !ok {
		return nil, errors.New("Redis 连接不存在或已断开")
	}
	if timeout <= 0 {
		timeout = 1
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(timeout)*time.Second)
	defer cancel()
	var item map[string]any
	err := rc.do(ctx, func(c context.Context) error {
		if mode == "stream" {
			res, e := rc.client.XRead(c, &redis.XReadArgs{
				Streams: []string{queue, "0"},
				Count:   1,
			}).Result()
			if e != nil {
				return e
			}
			if len(res) > 0 && len(res[0].Messages) > 0 {
				m := res[0].Messages[0]
				item = map[string]any{"id": m.ID, "payload": m.Values["payload"]}
			}
			return nil
		}
		vals, e := rc.client.BLPop(c, time.Duration(timeout)*time.Second, queue).Result()
		if e != nil {
			return e
		}
		if len(vals) == 2 {
			item = map[string]any{"id": vals[0], "payload": vals[1]}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	if item == nil {
		return map[string]any{"empty": true}, nil
	}
	return item, nil
}

// RedisQueueLength 返回队列长度。
func (a *App) RedisQueueLength(id, queue, mode string) (int, error) {
	rc, ok := a.redisMgr.get(id)
	if !ok {
		return 0, errors.New("Redis 连接不存在或已断开")
	}
	var n int64
	err := rc.do(context.Background(), func(c context.Context) error {
		var e error
		if mode == "stream" {
			n, e = rc.client.XLen(c, queue).Result()
		} else {
			n, e = rc.client.LLen(c, queue).Result()
		}
		return e
	})
	return int(n), err
}

// ===================== 慢查询与监控 =====================

// RedisSlowLog 获取最近 n 条慢查询日志。
func (a *App) RedisSlowLog(id string, count int) ([]map[string]any, error) {
	rc, ok := a.redisMgr.get(id)
	if !ok {
		return nil, errors.New("Redis 连接不存在或已断开")
	}
	if count <= 0 {
		count = 10
	}
	var logs []redis.SlowLog
	err := rc.do(context.Background(), func(c context.Context) error {
		var e error
		logs, e = rc.client.SlowLogGet(c, int64(count)).Result()
		return e
	})
	if err != nil {
		return nil, err
	}
	out := make([]map[string]any, 0, len(logs))
	for _, l := range logs {
		out = append(out, map[string]any{
			"id":        l.ID,
			"timestamp": l.Time.Unix(),
			"duration":  l.Duration.Microseconds(),
			"command":   formatCmds(l.Args),
			"client":    l.ClientAddr,
		})
	}
	return out, nil
}

// RedisInfo 取 INFO 命令指定段（section 为空取全部）。
func (a *App) RedisInfo(id, section string) (string, error) {
	rc, ok := a.redisMgr.get(id)
	if !ok {
		return "", errors.New("Redis 连接不存在或已断开")
	}
	var s string
	err := rc.do(context.Background(), func(c context.Context) error {
		var e error
		s, e = rc.client.Info(c, section).Result()
		return e
	})
	return s, err
}

// RedisMonitor 返回连接统计与熔断器状态，作为轻量性能监控。
func (a *App) RedisMonitor(id string) (map[string]any, error) {
	rc, ok := a.redisMgr.get(id)
	if !ok {
		return nil, errors.New("Redis 连接不存在或已断开")
	}
	stats := rc.client.PoolStats()
	return map[string]any{
		"breaker":      rc.breaker.state(),
		"hits":         stats.Hits,
		"misses":       stats.Misses,
		"timeouts":     stats.Timeouts,
		"totalConns":   stats.TotalConns,
		"idleConns":    stats.IdleConns,
		"staleConns":   stats.StaleConns,
		"mode":         string(rc.mode),
		"serialization": string(rc.ser),
	}, nil
}

// ===================== 辅助 =====================

func toInterfaces(parts []string) []interface{} {
	out := make([]interface{}, len(parts))
	for i, p := range parts {
		out[i] = p
	}
	return out
}

func errToString(err error) string {
	if err == nil {
		return ""
	}
	if errors.Is(err, redis.Nil) {
		return "nil"
	}
	return err.Error()
}

func formatRedisResult(v any) string {
	switch val := v.(type) {
	case nil:
		return "(nil)"
	case string:
		return val
	case []byte:
		return string(val)
	case int64:
		return strconv.FormatInt(val, 10)
	case float64:
		return strconv.FormatFloat(val, 'f', -1, 64)
	case []any:
		parts := make([]string, 0, len(val))
		for _, item := range val {
			parts = append(parts, formatRedisResult(item))
		}
		return "[" + strings.Join(parts, ", ") + "]"
	case map[string]any:
		parts := make([]string, 0, len(val))
		for k, item := range val {
			parts = append(parts, fmt.Sprintf("%v: %v", k, formatRedisResult(item)))
		}
		return "{" + strings.Join(parts, ", ") + "}"
	case map[interface{}]interface{}:
		parts := make([]string, 0, len(val))
		for k, item := range val {
			parts = append(parts, fmt.Sprintf("%v: %v", k, formatRedisResult(item)))
		}
		return "{" + strings.Join(parts, ", ") + "}"
	default:
		return fmt.Sprintf("%v", val)
	}
}

func formatCmds(args []string) string {
	return strings.Join(args, " ")
}

// ---- 文本解析辅助（与前端格式互转） ----

func splitLines(s string) []string {
	s = strings.TrimRight(s, "\n")
	if s == "" {
		return []string{}
	}
	return strings.Split(s, "\n")
}

// pairsToMap 把 "k1\nv1\nk2\nv2" 解析为 map。
func pairsToMap(s string) map[string]string {
	lines := strings.Split(s, "\n")
	m := make(map[string]string)
	for i := 0; i+1 < len(lines); i += 2 {
		m[lines[i]] = lines[i+1]
	}
	return m
}

// zsetToPairs 把 "m1\ns1\nm2\ns2" 解析为 [member, score] 对。
func zsetToPairs(s string) [][2]string {
	lines := strings.Split(s, "\n")
	out := make([][2]string, 0, len(lines)/2)
	for i := 0; i+1 < len(lines); i += 2 {
		out = append(out, [2]string{lines[i], lines[i+1]})
	}
	return out
}
