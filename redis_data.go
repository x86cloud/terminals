package main

import (
	"context"
	"errors"

	"github.com/redis/go-redis/v9"
)

// ===================== 类型专属命令 =====================

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
