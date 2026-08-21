package services

import (
	"errors"
	"terminal/core"
	"terminal/redis"
)

type RedisService struct{}

func NewRedisService() *RedisService {
	return &RedisService{}
}

func (s *RedisService) RedisConnect(id string) (bool, error) {
	c := GetContainer()
	cfg, ok := c.Store.Get(id)
	if !ok {
		return false, errors.New("服务器配置不存在")
	}
	if _, err := c.RedisMgr.Connect(cfg); err != nil {
		return false, err
	}
	return true, nil
}

func (s *RedisService) RedisClose(id string) error {
	GetContainer().RedisMgr.Close(id)
	return nil
}

func (s *RedisService) RedisSelectDB(id string, db int) error {
	return GetContainer().RedisMgr.SelectDB(id, db)
}

func (s *RedisService) RedisKeys(id string, pattern string, cursor string) (redis.RedisKeysResult, error) {
	return GetContainer().RedisMgr.Keys(id, pattern, cursor)
}

func (s *RedisService) RedisGet(id string, key string) (redis.RedisValue, error) {
	return GetContainer().RedisMgr.GetKey(id, key)
}

func (s *RedisService) RedisSet(id string, key string, typ string, val string, ttl int) error {
	return GetContainer().RedisMgr.SetKey(id, key, typ, val, int64(ttl))
}

func (s *RedisService) RedisDelete(id string, key string) error {
	_, err := GetContainer().RedisMgr.DelKeys(id, []string{key})
	return err
}

func (s *RedisService) RedisExpire(id string, key string, ttl int) error {
	return GetContainer().RedisMgr.ExpireKey(id, key, int64(ttl))
}

func (s *RedisService) RedisRaw(id string, cmd string) (map[string]any, error) {
	return GetContainer().RedisMgr.ExecuteRawCommand(id, cmd)
}

func (s *RedisService) RedisDBSize(id string) (int, error) {
	return GetContainer().RedisMgr.DBSize(id)
}

func (s *RedisService) RedisModeInfo(id string) (map[string]any, error) {
	return GetContainer().RedisMgr.ModeInfo(id)
}

func (s *RedisService) RedisStringAppend(id string, key string, value string) (int, error) {
	return GetContainer().RedisMgr.RedisStringAppend(id, key, value)
}

func (s *RedisService) RedisHashFieldSet(id string, key string, field string, value string) error {
	return GetContainer().RedisMgr.RedisHashFieldSet(id, key, field, value)
}

func (s *RedisService) RedisHashFieldGet(id string, key string, field string) (string, error) {
	return GetContainer().RedisMgr.RedisHashFieldGet(id, key, field)
}

func (s *RedisService) RedisHashFieldDel(id string, key string, fields []string) (int, error) {
	return GetContainer().RedisMgr.RedisHashFieldDel(id, key, fields)
}

func (s *RedisService) RedisListPush(id string, key string, value string, left bool) (int, error) {
	return GetContainer().RedisMgr.RedisListPush(id, key, value, left)
}

func (s *RedisService) RedisListPop(id string, key string, left bool) (string, error) {
	return GetContainer().RedisMgr.RedisListPop(id, key, left)
}

func (s *RedisService) RedisSetAdd(id string, key string, members []string) (int, error) {
	return GetContainer().RedisMgr.RedisSetAdd(id, key, members)
}

func (s *RedisService) RedisSetRem(id string, key string, members []string) (int, error) {
	return GetContainer().RedisMgr.RedisSetRem(id, key, members)
}

func (s *RedisService) RedisZSetAdd(id string, key string, member string, score float64) (int, error) {
	return GetContainer().RedisMgr.RedisZSetAdd(id, key, member, score)
}

func (s *RedisService) RedisZSetRem(id string, key string, members []string) (int, error) {
	return GetContainer().RedisMgr.RedisZSetRem(id, key, members)
}

func (s *RedisService) RedisPipeline(id string, commands []string) (redis.RedisPipelineResult, error) {
	return GetContainer().RedisMgr.Pipeline(id, commands)
}

func (s *RedisService) RedisTransaction(id string, watch []string, commands []string) (redis.RedisTransactionResult, error) {
	return GetContainer().RedisMgr.Transaction(id, watch, commands)
}

func (s *RedisService) RedisPublish(id string, channel string, message string) (int64, error) {
	return GetContainer().RedisMgr.Publish(id, channel, message)
}

func (s *RedisService) RedisSubscribe(id string, channel string) error {
	return GetContainer().RedisMgr.Subscribe(id, channel)
}

func (s *RedisService) RedisPSubscribe(id string, pattern string) error {
	return GetContainer().RedisMgr.PSubscribe(id, pattern)
}

func (s *RedisService) RedisUnsubscribe(id string, channel string) error {
	return GetContainer().RedisMgr.Unsubscribe(id, channel)
}

func (s *RedisService) RedisSubscriptions(id string) ([]string, error) {
	return GetContainer().RedisMgr.Subscriptions(id)
}

func (s *RedisService) RedisKeyspaceNotify(id string, db int, event string) error {
	return GetContainer().RedisMgr.KeyspaceNotify(id, db, event)
}

func (s *RedisService) RedisQueueEnqueue(id string, queue string, payload string, mode string) (string, error) {
	return GetContainer().RedisMgr.QueueEnqueue(id, queue, payload, mode)
}

func (s *RedisService) RedisQueueDequeue(id string, queue string, mode string, timeout int) (*redis.RedisQueueItem, error) {
	return GetContainer().RedisMgr.QueueDequeue(id, queue, mode, timeout)
}

func (s *RedisService) RedisQueueLength(id string, queue string, mode string) (int64, error) {
	return GetContainer().RedisMgr.QueueLength(id, queue, mode)
}

func (s *RedisService) RedisSlowLog(id string, count int) ([]redis.RedisSlowLogEntry, error) {
	return GetContainer().RedisMgr.SlowLog(id, count)
}

func (s *RedisService) RedisInfo(id string, section string) (string, error) {
	return GetContainer().RedisMgr.Info(id, section)
}

func (s *RedisService) RedisMonitor(id string) (*redis.RedisMonitorInfo, error) {
	return GetContainer().RedisMgr.Monitor(id)
}

func (s *RedisService) RedisTestConnection(cfg core.ServerConfig) (map[string]any, error) {
	return GetContainer().RedisMgr.TestConnection(cfg)
}
