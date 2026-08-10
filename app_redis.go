package main

import (
	"errors"
	"terminal/redis"
)

// ---------- Redis API ----------

func (a *App) RedisConnect(id string) (bool, error) {
	cfg, ok := a.store.Get(id)
	if !ok {
		return false, errors.New("服务器配置不存在")
	}
	if _, err := a.redisMgr.Connect(cfg); err != nil {
		return false, err
	}
	return true, nil
}

func (a *App) RedisClose(id string) error {
	a.redisMgr.Close(id)
	return nil
}

func (a *App) RedisSelectDB(id string, db int) error {
	return a.redisMgr.SelectDB(id, db)
}

func (a *App) RedisKeys(id string, pattern string, cursor string) (redis.RedisKeysResult, error) {
	return a.redisMgr.Keys(id, pattern, cursor)
}

func (a *App) RedisGet(id string, key string) (redis.RedisValue, error) {
	return a.redisMgr.GetKey(id, key)
}

func (a *App) RedisSet(id string, key string, typ string, val string, ttl int) error {
	return a.redisMgr.SetKey(id, key, typ, val, int64(ttl))
}

func (a *App) RedisDelete(id string, key string) error {
	_, err := a.redisMgr.DelKeys(id, []string{key})
	return err
}

func (a *App) RedisExpire(id string, key string, ttl int) error {
	return a.redisMgr.ExpireKey(id, key, int64(ttl))
}

func (a *App) RedisRaw(id string, cmd string) (map[string]any, error) {
	return a.redisMgr.ExecuteRawCommand(id, cmd)
}

func (a *App) RedisDBSize(id string) (int, error) {
	return a.redisMgr.DBSize(id)
}

func (a *App) RedisModeInfo(id string) (map[string]any, error) {
	return a.redisMgr.ModeInfo(id)
}

func (a *App) RedisStringAppend(id string, key string, value string) (int, error) {
	return a.redisMgr.RedisStringAppend(id, key, value)
}

func (a *App) RedisHashFieldSet(id string, key string, field string, value string) error {
	return a.redisMgr.RedisHashFieldSet(id, key, field, value)
}

func (a *App) RedisHashFieldGet(id string, key string, field string) (string, error) {
	return a.redisMgr.RedisHashFieldGet(id, key, field)
}

func (a *App) RedisHashFieldDel(id string, key string, fields []string) (int, error) {
	return a.redisMgr.RedisHashFieldDel(id, key, fields)
}

func (a *App) RedisListPush(id string, key string, value string, left bool) (int, error) {
	return a.redisMgr.RedisListPush(id, key, value, left)
}

func (a *App) RedisListPop(id string, key string, left bool) (string, error) {
	return a.redisMgr.RedisListPop(id, key, left)
}

func (a *App) RedisSetAdd(id string, key string, members []string) (int, error) {
	return a.redisMgr.RedisSetAdd(id, key, members)
}

func (a *App) RedisSetRem(id string, key string, members []string) (int, error) {
	return a.redisMgr.RedisSetRem(id, key, members)
}

func (a *App) RedisZSetAdd(id string, key string, member string, score float64) (int, error) {
	return a.redisMgr.RedisZSetAdd(id, key, member, score)
}

func (a *App) RedisZSetRem(id string, key string, members []string) (int, error) {
	return a.redisMgr.RedisZSetRem(id, key, members)
}

func (a *App) RedisPipeline(id string, commands []string) (redis.RedisPipelineResult, error) {
	return a.redisMgr.Pipeline(id, commands)
}

func (a *App) RedisTransaction(id string, watch []string, commands []string) (redis.RedisTransactionResult, error) {
	return a.redisMgr.Transaction(id, watch, commands)
}

func (a *App) RedisPublish(id string, channel string, message string) (int64, error) {
	return a.redisMgr.Publish(id, channel, message)
}

func (a *App) RedisSubscribe(id string, channel string) error {
	return a.redisMgr.Subscribe(id, channel)
}

func (a *App) RedisPSubscribe(id string, pattern string) error {
	return a.redisMgr.PSubscribe(id, pattern)
}

func (a *App) RedisUnsubscribe(id string, channel string) error {
	return a.redisMgr.Unsubscribe(id, channel)
}

func (a *App) RedisSubscriptions(id string) ([]string, error) {
	return a.redisMgr.Subscriptions(id)
}

func (a *App) RedisKeyspaceNotify(id string, db int, event string) error {
	return a.redisMgr.KeyspaceNotify(id, db, event)
}

func (a *App) RedisQueueEnqueue(id string, queue string, payload string, mode string) (string, error) {
	return a.redisMgr.QueueEnqueue(id, queue, payload, mode)
}

func (a *App) RedisQueueDequeue(id string, queue string, mode string, timeout int) (*redis.RedisQueueItem, error) {
	return a.redisMgr.QueueDequeue(id, queue, mode, timeout)
}

func (a *App) RedisQueueLength(id string, queue string, mode string) (int64, error) {
	return a.redisMgr.QueueLength(id, queue, mode)
}

func (a *App) RedisSlowLog(id string, count int) ([]redis.RedisSlowLogEntry, error) {
	return a.redisMgr.SlowLog(id, count)
}

func (a *App) RedisInfo(id string, section string) (string, error) {
	return a.redisMgr.Info(id, section)
}

func (a *App) RedisMonitor(id string) (*redis.RedisMonitorInfo, error) {
	return a.redisMgr.Monitor(id)
}
