package redis

import (
	"context"
	"errors"

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
