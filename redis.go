package main

import (
	"bufio"
	"errors"
	"fmt"
	"io"
	"net"
	"strconv"
	"strings"
	"sync"
	"time"
)

// RESP 协议常量
const (
	respSimple  = '+'
	respError   = '-'
	respInt     = ':'
	respBulk    = '$'
	respArray   = '*'
	redisDialTO = 5 * time.Second
	redisReadTO = 30 * time.Second
)

// redisConn 表示一个到 Redis 的 TCP 连接，使用手写 RESP 协议。
type redisConn struct {
	conn   net.Conn
	reader *bufio.Reader
	mu     sync.Mutex
}

func dialRedis(host string, port int, password string, db int) (*redisConn, error) {
	address := net.JoinHostPort(host, strconv.Itoa(port))
	c, err := net.DialTimeout("tcp", address, redisDialTO)
	if err != nil {
		return nil, fmt.Errorf("连接 Redis 失败: %w", err)
	}
	c.SetReadDeadline(time.Now().Add(redisReadTO))
	rc := &redisConn{conn: c, reader: bufio.NewReader(c)}

	if password != "" {
		if _, err := rc.doCmd(nil, "AUTH", password); err != nil {
			_ = c.Close()
			return nil, err
		}
	}
	if db > 0 {
		if _, err := rc.doCmd(nil, "SELECT", strconv.Itoa(db)); err != nil {
			_ = c.Close()
			return nil, err
		}
	}
	return rc, nil
}

func (r *redisConn) send(args ...string) error {
	var sb strings.Builder
	sb.WriteByte(respArray)
	sb.WriteString(strconv.Itoa(len(args)))
	sb.WriteString("\r\n")
	for _, a := range args {
		sb.WriteByte(respBulk)
		sb.WriteString(strconv.Itoa(len(a)))
		sb.WriteString("\r\n")
		sb.WriteString(a)
		sb.WriteString("\r\n")
	}
	r.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
	_, err := r.conn.Write([]byte(sb.String()))
	return err
}

// readReply 读取一个 RESP 回复，raw 为 true 时返回最外层 Bulk 字符串原文。
func (r *redisConn) readReply(raw bool) (string, error) {
	r.conn.SetReadDeadline(time.Now().Add(redisReadTO))
	line, err := r.reader.ReadString('\n')
	if err != nil {
		return "", err
	}
	line = strings.TrimRight(line, "\r\n")
	if line == "" {
		return "", errors.New("Redis 返回空响应")
	}
	switch line[0] {
	case respSimple, respInt:
		return line[1:], nil
	case respError:
		return "", errors.New(line[1:])
	case respBulk:
		n, err := strconv.Atoi(line[1:])
		if err != nil {
			return "", err
		}
		if n < 0 {
			return "", nil // nil bulk
		}
		buf := make([]byte, n+2)
		if _, err := io.ReadFull(r.reader, buf); err != nil {
			return "", err
		}
		return string(buf[:n]), nil
	case respArray:
		n, err := strconv.Atoi(line[1:])
		if err != nil {
			return "", err
		}
		if raw || n < 0 {
			return "", nil
		}
		parts := make([]string, 0, n)
		for i := 0; i < n; i++ {
			s, err := r.readReply(false)
			if err != nil {
				return "", err
			}
			parts = append(parts, s)
		}
		return strings.Join(parts, "\n"), nil
	default:
		return "", fmt.Errorf("未知 RESP 类型: %q", line[0])
	}
}

// doCmd 发送命令并读取返回（多条批量结果以换行拼接）。
func (r *redisConn) doCmd(raw *bool, args ...string) (string, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if err := r.send(args...); err != nil {
		return "", err
	}
	isRaw := raw != nil && *raw
	return r.readReply(isRaw)
}

func (r *redisConn) close() error {
	return r.conn.Close()
}

// ---- RedisManager 管理多个已打开的 Redis 会话 ----

type redisManager struct {
	mu    sync.Mutex
	conns map[string]*redisConn
}

func newRedisManager() *redisManager {
	return &redisManager{conns: make(map[string]*redisConn)}
}

func (m *redisManager) open(id string, cfg ServerConfig) error {
	m.mu.Lock()
	if old, ok := m.conns[id]; ok {
		_ = old.close()
		delete(m.conns, id)
	}
	m.mu.Unlock()

	rc, err := dialRedis(cfg.Host, cfg.displayPort(), cfg.Password, cfg.DB)
	if err != nil {
		return err
	}
	m.mu.Lock()
	m.conns[id] = rc
	m.mu.Unlock()
	return nil
}

func (m *redisManager) get(id string) (*redisConn, bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	c, ok := m.conns[id]
	return c, ok
}

func (m *redisManager) close(id string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if c, ok := m.conns[id]; ok {
		_ = c.close()
		delete(m.conns, id)
	}
}

func (m *redisManager) closeAll() {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, c := range m.conns {
		_ = c.close()
	}
	m.conns = make(map[string]*redisConn)
}

func (m *redisManager) cmd(id string, raw bool, args ...string) (string, error) {
	c, ok := m.get(id)
	if !ok {
		return "", errors.New("Redis 连接不存在或已断开")
	}
	return c.doCmd(&raw, args...)
}

// ---- 供前端调用的高层方法 ----

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

// RedisSelectDB 在已建立的连接上切换当前数据库。
func (a *App) RedisSelectDB(id string, db int) error {
	if _, err := a.redisMgr.cmd(id, false, "SELECT", strconv.Itoa(db)); err != nil {
		return err
	}
	return nil
}

func (a *App) RedisKeys(id string, pattern string, cursor string) (map[string]any, error) {
	if pattern == "" {
		pattern = "*"
	}
	if cursor == "" {
		cursor = "0"
	}
	res, err := a.redisMgr.cmd(id, false, "SCAN", cursor, "MATCH", pattern, "COUNT", "200")
	if err != nil {
		return nil, err
	}
	lines := strings.SplitN(res, "\n", 2)
	if len(lines) < 2 {
		return map[string]any{"cursor": "0", "keys": []any{}}, nil
	}
	newCursor := lines[0]
	var keys []any
	for _, k := range strings.Split(lines[1], "\n") {
		if k != "" {
			keys = append(keys, k)
		}
	}
	return map[string]any{"cursor": newCursor, "keys": keys}, nil
}

func (a *App) RedisGet(id string, key string) (map[string]any, error) {
	typ, err := a.redisMgr.cmd(id, false, "TYPE", key)
	if err != nil {
		return nil, err
	}
	typ = strings.TrimSpace(typ)
	switch typ {
	case "string":
		val, err := a.redisMgr.cmd(id, true, "GET", key)
		if err != nil {
			return nil, err
		}
		ttl, _ := a.redisMgr.cmd(id, false, "TTL", key)
		return map[string]any{"type": "string", "value": val, "ttl": parseInt(ttl)}, nil
	case "list":
		res, err := a.redisMgr.cmd(id, false, "LRANGE", key, "0", "-1")
		if err != nil {
			return nil, err
		}
		ttl, _ := a.redisMgr.cmd(id, false, "TTL", key)
		return map[string]any{"type": "list", "value": splitLines(res), "ttl": parseInt(ttl)}, nil
	case "set":
		res, err := a.redisMgr.cmd(id, false, "SMEMBERS", key)
		if err != nil {
			return nil, err
		}
		ttl, _ := a.redisMgr.cmd(id, false, "TTL", key)
		return map[string]any{"type": "set", "value": splitLines(res), "ttl": parseInt(ttl)}, nil
	case "hash":
		res, err := a.redisMgr.cmd(id, false, "HGETALL", key)
		if err != nil {
			return nil, err
		}
		ttl, _ := a.redisMgr.cmd(id, false, "TTL", key)
		return map[string]any{"type": "hash", "value": pairsToMap(res), "ttl": parseInt(ttl)}, nil
	case "zset":
		res, err := a.redisMgr.cmd(id, false, "ZRANGE", key, "0", "-1", "WITHSCORES")
		if err != nil {
			return nil, err
		}
		ttl, _ := a.redisMgr.cmd(id, false, "TTL", key)
		return map[string]any{"type": "zset", "value": zsetToPairs(res), "ttl": parseInt(ttl)}, nil
	case "none":
		return nil, fmt.Errorf("key 不存在: %s", key)
	default:
		val, err := a.redisMgr.cmd(id, true, "GET", key)
		if err != nil {
			return nil, err
		}
		return map[string]any{"type": typ, "value": val, "ttl": -1}, nil
	}
}

func (a *App) RedisSet(id string, key string, typ string, value string, ttl int) error {
	switch typ {
	case "string":
		if _, err := a.redisMgr.cmd(id, false, "SET", key, value); err != nil {
			return err
		}
	case "list":
		if _, err := a.redisMgr.cmd(id, false, "DEL", key); err != nil {
			return err
		}
		for _, item := range splitLines(value) {
			if item == "" {
				continue
			}
			if _, err := a.redisMgr.cmd(id, false, "RPUSH", key, item); err != nil {
				return err
			}
		}
	case "set":
		if _, err := a.redisMgr.cmd(id, false, "DEL", key); err != nil {
			return err
		}
		for _, item := range splitLines(value) {
			if item == "" {
				continue
			}
			if _, err := a.redisMgr.cmd(id, false, "SADD", key, item); err != nil {
				return err
			}
		}
	case "hash":
		if _, err := a.redisMgr.cmd(id, false, "DEL", key); err != nil {
			return err
		}
		for k, v := range pairsToMap(value) {
			if _, err := a.redisMgr.cmd(id, false, "HSET", key, k, v); err != nil {
				return err
			}
		}
	case "zset":
		if _, err := a.redisMgr.cmd(id, false, "DEL", key); err != nil {
			return err
		}
		for _, p := range zsetToPairs(value) {
			if _, err := a.redisMgr.cmd(id, false, "ZADD", key, p[1], p[0]); err != nil {
				return err
			}
		}
	default:
		return errors.New("不支持的类型: " + typ)
	}
	if ttl > 0 {
		_, err := a.redisMgr.cmd(id, false, "EXPIRE", key, strconv.Itoa(ttl))
		return err
	}
	return nil
}

func (a *App) RedisDelete(id string, key string) error {
	_, err := a.redisMgr.cmd(id, false, "DEL", key)
	return err
}

func (a *App) RedisExpire(id string, key string, ttl int) error {
	if ttl <= 0 {
		_, err := a.redisMgr.cmd(id, false, "PERSIST", key)
		return err
	}
	_, err := a.redisMgr.cmd(id, false, "EXPIRE", key, strconv.Itoa(ttl))
	return err
}

func (a *App) RedisRaw(id string, command string) (map[string]any, error) {
	command = strings.TrimSpace(command)
	if command == "" {
		return nil, errors.New("命令不能为空")
	}
	parts := strings.Fields(command)
	res, err := a.redisMgr.cmd(id, false, parts...)
	if err != nil {
		return nil, err
	}
	return map[string]any{"result": res}, nil
}

func (a *App) RedisDBSize(id string) (int, error) {
	res, err := a.redisMgr.cmd(id, false, "DBSIZE")
	if err != nil {
		return 0, err
	}
	return parseInt(res), nil
}

// ---- 辅助函数 ----

func parseInt(s string) int {
	s = strings.TrimSpace(s)
	if s == "" {
		return -1
	}
	n, err := strconv.Atoi(s)
	if err != nil {
		return -1
	}
	return n
}

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
