package redis

import (
	"context"
	"errors"
	"fmt"
	"strconv"
	"strings"

	goredis "github.com/redis/go-redis/v9"
)

// ===================== 类型专属命令 =====================

func (m *RedisManager) RedisStringAppend(id, key, value string) (int, error) {
	rc, ok := m.Get(id)
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

func (m *RedisManager) RedisHashFieldSet(id, key, field, value string) error {
	rc, ok := m.Get(id)
	if !ok {
		return errors.New("Redis 连接不存在或已断开")
	}
	return rc.do(context.Background(), func(c context.Context) error {
		return rc.client.HSet(c, key, field, value).Err()
	})
}

func (m *RedisManager) RedisHashFieldGet(id, key, field string) (string, error) {
	rc, ok := m.Get(id)
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

func (m *RedisManager) RedisHashFieldDel(id, key string, fields []string) (int, error) {
	rc, ok := m.Get(id)
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

func (m *RedisManager) RedisListPush(id, key, value string, left bool) (int, error) {
	rc, ok := m.Get(id)
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

func (m *RedisManager) RedisListPop(id, key string, left bool) (string, error) {
	rc, ok := m.Get(id)
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

func (m *RedisManager) RedisSetAdd(id, key string, members []string) (int, error) {
	rc, ok := m.Get(id)
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

func (m *RedisManager) RedisSetRem(id, key string, members []string) (int, error) {
	rc, ok := m.Get(id)
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

func (m *RedisManager) RedisZSetAdd(id, key, member string, score float64) (int, error) {
	rc, ok := m.Get(id)
	if !ok {
		return 0, errors.New("Redis 连接不存在或已断开")
	}
	var n int64
	err := rc.do(context.Background(), func(c context.Context) error {
		var e error
		n, e = rc.client.ZAdd(c, key, goredis.Z{Score: score, Member: member}).Result()
		return e
	})
	return int(n), err
}

func (m *RedisManager) RedisZSetRem(id, key string, members []string) (int, error) {
	rc, ok := m.Get(id)
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

// ===================== 核心/扩展 Redis API =====================

func (m *RedisManager) SelectDB(id string, db int) error {
	rc, ok := m.Get(id)
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

func (m *RedisManager) Keys(id string, pattern string, cursorStr string) (RedisKeysResult, error) {
	var cur uint64
	if cursorStr != "" {
		cur, _ = strconv.ParseUint(cursorStr, 10, 64)
	}
	return m.ScanKeys(id, pattern, cur, 100)
}

func (m *RedisManager) ModeInfo(id string) (map[string]any, error) {
	rc, ok := m.Get(id)
	if !ok {
		return nil, errors.New("Redis 连接不存在或已断开")
	}
	return map[string]any{
		"mode":          rc.mode,
		"serialization": rc.ser,
		"breaker":       rc.breaker.state(),
	}, nil
}

func (m *RedisManager) Pipeline(id string, commands []string) (RedisPipelineResult, error) {
	rc, ok := m.Get(id)
	if !ok {
		return RedisPipelineResult{}, errors.New("Redis 连接不存在或已断开")
	}
	results := make([]RedisCmdResult, 0, len(commands))
	var pipeErr error
	err := rc.do(context.Background(), func(c context.Context) error {
		pipe := rc.client.Pipeline()
		cmds := make([]*goredis.Cmd, 0, len(commands))
		for _, line := range commands {
			parts := strings.Fields(strings.TrimSpace(line))
			if len(parts) == 0 {
				continue
			}
			cmd := goredis.NewCmd(c, toInterfaces(parts)...)
			pipe.Process(c, cmd)
			cmds = append(cmds, cmd)
		}
		_, e := pipe.Exec(c)
		pipeErr = e
		for _, cmd := range cmds {
			val, cerr := cmd.Result()
			errStr := ""
			if cerr != nil {
				errStr = cerr.Error()
			}
			results = append(results, RedisCmdResult{
				Result: fmt.Sprintf("%v", val),
				Error:  errStr,
			})
		}
		return e
	})
	topErr := ""
	if err != nil {
		topErr = err.Error()
	} else if pipeErr != nil {
		topErr = pipeErr.Error()
	}
	return RedisPipelineResult{Results: results, Error: topErr}, nil
}

func (m *RedisManager) Transaction(id string, watch []string, commands []string) (RedisTransactionResult, error) {
	rc, ok := m.Get(id)
	if !ok {
		return RedisTransactionResult{}, errors.New("Redis 连接不存在或已断开")
	}
	results := make([]RedisCmdResult, 0, len(commands))
	var txErr error
	err := rc.do(context.Background(), func(c context.Context) error {
		err := rc.client.Watch(c, func(tx *goredis.Tx) error {
			_, err := tx.TxPipelined(c, func(pipe goredis.Pipeliner) error {
				cmds := make([]*goredis.Cmd, 0, len(commands))
				for _, line := range commands {
					parts := strings.Fields(strings.TrimSpace(line))
					if len(parts) == 0 {
						continue
					}
					cmd := goredis.NewCmd(c, toInterfaces(parts)...)
					pipe.Process(c, cmd)
					cmds = append(cmds, cmd)
				}
				_, e := pipe.Exec(c)
				for _, cmd := range cmds {
					val, cerr := cmd.Result()
					errStr := ""
					if cerr != nil {
						errStr = cerr.Error()
					}
					results = append(results, RedisCmdResult{
						Result: fmt.Sprintf("%v", val),
						Error:  errStr,
					})
				}
				return e
			})
			return err
		}, watch...)
		txErr = err
		return err
	})
	topErr := ""
	if err != nil {
		topErr = err.Error()
	}
	return RedisTransactionResult{
		Results: results,
		Aborted: errors.Is(txErr, goredis.TxFailedErr),
		Error:   topErr,
	}, nil
}

func (m *RedisManager) Publish(id string, channel string, message string) (int64, error) {
	rc, ok := m.Get(id)
	if !ok {
		return 0, errors.New("Redis 连接不存在或已断开")
	}
	var n int64
	err := rc.do(context.Background(), func(c context.Context) error {
		var e error
		n, e = rc.client.Publish(c, channel, message).Result()
		return e
	})
	return n, err
}

func (m *RedisManager) Subscribe(id string, channel string) error {
	rc, ok := m.Get(id)
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
	return nil
}

func (m *RedisManager) PSubscribe(id string, pattern string) error {
	rc, ok := m.Get(id)
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
	return nil
}

func (m *RedisManager) Unsubscribe(id string, channel string) error {
	rc, ok := m.Get(id)
	if !ok {
		return errors.New("Redis 连接不存在或已断开")
	}
	rc.mu.Lock()
	ps, ok := rc.pubsubs[channel]
	if ok {
		delete(rc.pubsubs, channel)
		_ = ps.Close()
	}
	rc.mu.Unlock()
	return nil
}

func (m *RedisManager) Subscriptions(id string) ([]string, error) {
	rc, ok := m.Get(id)
	if !ok {
		return nil, errors.New("Redis 连接不存在或已断开")
	}
	rc.mu.Lock()
	defer rc.mu.Unlock()
	subs := make([]string, 0, len(rc.pubsubs))
	for ch := range rc.pubsubs {
		subs = append(subs, ch)
	}
	return subs, nil
}

func (m *RedisManager) KeyspaceNotify(id string, db int, event string) error {
	return nil
}

func (m *RedisManager) QueueEnqueue(id string, queue string, payload string, mode string) (string, error) {
	rc, ok := m.Get(id)
	if !ok {
		return "", errors.New("Redis 连接不存在或已断开")
	}
	err := rc.do(context.Background(), func(c context.Context) error {
		return rc.client.RPush(c, queue, payload).Err()
	})
	return "ok", err
}

func (m *RedisManager) QueueDequeue(id string, queue string, mode string, timeout int) (*RedisQueueItem, error) {
	rc, ok := m.Get(id)
	if !ok {
		return nil, errors.New("Redis 连接不存在或已断开")
	}
	var res string
	err := rc.do(context.Background(), func(c context.Context) error {
		var e error
		res, e = rc.client.LPop(c, queue).Result()
		return e
	})
	if errors.Is(err, goredis.Nil) {
		return &RedisQueueItem{Empty: true}, nil
	}
	if err != nil {
		return nil, err
	}
	return &RedisQueueItem{Payload: res}, nil
}

func (m *RedisManager) QueueLength(id string, queue string, mode string) (int64, error) {
	rc, ok := m.Get(id)
	if !ok {
		return 0, errors.New("Redis 连接不存在或已断开")
	}
	var n int64
	err := rc.do(context.Background(), func(c context.Context) error {
		var e error
		n, e = rc.client.LLen(c, queue).Result()
		return e
	})
	return n, err
}

func (m *RedisManager) SlowLog(id string, count int) ([]RedisSlowLogEntry, error) {
	return []RedisSlowLogEntry{}, nil
}

func (m *RedisManager) Info(id string, section string) (string, error) {
	rc, ok := m.Get(id)
	if !ok {
		return "", errors.New("Redis 连接不存在或已断开")
	}
	var info string
	err := rc.do(context.Background(), func(c context.Context) error {
		var e error
		info, e = rc.client.Info(c, section).Result()
		return e
	})
	return info, err
}

func (m *RedisManager) Monitor(id string) (*RedisMonitorInfo, error) {
	rc, ok := m.Get(id)
	if !ok {
		return nil, errors.New("Redis 连接不存在或已断开")
	}
	info := &RedisMonitorInfo{
		Breaker:       rc.breaker.state(),
		Mode:          string(rc.mode),
		Serialization: string(rc.ser),
	}

	if rc.client != nil {
		stats := rc.client.PoolStats()
		if stats != nil {
			info.Hits = int64(stats.Hits)
			info.Misses = int64(stats.Misses)
			info.Timeouts = int64(stats.Timeouts)
			info.TotalConns = stats.TotalConns
			info.IdleConns = stats.IdleConns
			info.StaleConns = stats.StaleConns
		}

		ctx := context.Background()
		_ = rc.do(ctx, func(c context.Context) error {
			rawInfo, err := rc.client.Info(c).Result()
			if err == nil {
				for _, line := range strings.Split(rawInfo, "\n") {
					line = strings.TrimSpace(line)
					if strings.HasPrefix(line, "redis_version:") {
						info.Version = strings.TrimPrefix(line, "redis_version:")
					} else if strings.HasPrefix(line, "used_memory_human:") {
						info.MemoryUsed = strings.TrimPrefix(line, "used_memory_human:")
					} else if strings.HasPrefix(line, "uptime_in_days:") {
						info.UptimeDays = strings.TrimPrefix(line, "uptime_in_days:")
					} else if strings.HasPrefix(line, "connected_clients:") {
						info.ConnectedClients = strings.TrimPrefix(line, "connected_clients:")
					}
				}
			}
			return nil
		})
	}

	return info, nil
}
