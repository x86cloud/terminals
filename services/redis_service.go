package services

import (
	"errors"
	"strings"
	"terminal/core"
	"terminal/logger"
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
		err := errors.New("服务器配置不存在")
		logger.Errorf("Redis 连接失败: 服务器配置不存在 [ID=%s]", id)
		return false, err
	}
	logger.Infof("正在发起 Redis 连接: ID=%s, 名称=%s, 主机=%s:%d", cfg.ID, cfg.Name, cfg.Host, cfg.Port)
	if _, err := c.RedisMgr.Connect(cfg); err != nil {
		logger.Errorf("Redis 连接失败 [ID=%s, 主机=%s:%d]: %v", id, cfg.Host, cfg.Port, err)
		return false, err
	}
	logger.Infof("Redis 连接成功: ID=%s, 主机=%s:%d", id, cfg.Host, cfg.Port)
	return true, nil
}

func (s *RedisService) RedisClose(id string) error {
	logger.Infof("关闭 Redis 连接: ID=%s", id)
	GetContainer().RedisMgr.Close(id)
	return nil
}

func (s *RedisService) RedisSelectDB(id string, db int) error {
	logger.Infof("Redis 切换数据库 [ID=%s, DB=%d]", id, db)
	if err := GetContainer().RedisMgr.SelectDB(id, db); err != nil {
		logger.Errorf("Redis 切换数据库失败 [ID=%s, DB=%d]: %v", id, db, err)
		return err
	}
	return nil
}

func (s *RedisService) RedisKeys(id string, pattern string, cursor string) (redis.RedisKeysResult, error) {
	res, err := GetContainer().RedisMgr.Keys(id, pattern, cursor)
	if err != nil {
		logger.Errorf("Redis 扫描 Key 失败 [ID=%s, Pattern=%s]: %v", id, pattern, err)
		return res, err
	}
	return res, nil
}

func (s *RedisService) RedisGet(id string, key string) (redis.RedisValue, error) {
	val, err := GetContainer().RedisMgr.GetKey(id, key)
	if err != nil {
		logger.Errorf("Redis 获取 Key 失败 [ID=%s, Key=%s]: %v", id, key, err)
		return val, err
	}
	return val, nil
}

func (s *RedisService) RedisSet(id string, key string, typ string, val string, ttl int) error {
	logger.Infof("Redis 设置 Key [ID=%s, Key=%s, Type=%s, TTL=%d]", id, key, typ, ttl)
	if err := GetContainer().RedisMgr.SetKey(id, key, typ, val, int64(ttl)); err != nil {
		logger.Errorf("Redis 设置 Key 失败 [ID=%s, Key=%s]: %v", id, key, err)
		return err
	}
	return nil
}

func (s *RedisService) RedisDelete(id string, key string) error {
	logger.Infof("Redis 删除 Key [ID=%s, Key=%s]", id, key)
	_, err := GetContainer().RedisMgr.DelKeys(id, []string{key})
	if err != nil {
		logger.Errorf("Redis 删除 Key 失败 [ID=%s, Key=%s]: %v", id, key, err)
		return err
	}
	return nil
}

func (s *RedisService) RedisExpire(id string, key string, ttl int) error {
	logger.Infof("Redis 设置 Key 过期时间 [ID=%s, Key=%s, TTL=%d]", id, key, ttl)
	if err := GetContainer().RedisMgr.ExpireKey(id, key, int64(ttl)); err != nil {
		logger.Errorf("Redis 设置 Key 过期时间失败 [ID=%s, Key=%s]: %v", id, key, err)
		return err
	}
	return nil
}

func (s *RedisService) RedisRenameKey(id string, oldKey string, newKey string) error {
	logger.Infof("Redis 重命名 Key [ID=%s, Old=%s, New=%s]", id, oldKey, newKey)
	if err := GetContainer().RedisMgr.RenameKey(id, oldKey, newKey); err != nil {
		logger.Errorf("Redis 重命名 Key 失败 [ID=%s, Old=%s, New=%s]: %v", id, oldKey, newKey, err)
		return err
	}
	return nil
}

func (s *RedisService) RedisRaw(id string, cmd string) (map[string]any, error) {
	safeCmd := cmd
	if strings.HasPrefix(strings.ToLower(strings.TrimSpace(cmd)), "auth") {
		safeCmd = "AUTH ***"
	}
	logger.Infof("Redis 执行原生命令 [ID=%s, Cmd=%s]", id, safeCmd)
	res, err := GetContainer().RedisMgr.ExecuteRawCommand(id, cmd)
	if err != nil {
		logger.Errorf("Redis 原生命令执行失败 [ID=%s, Cmd=%s]: %v", id, safeCmd, err)
		return nil, err
	}
	return res, nil
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
	logger.Infof("Redis Hash 删除字段 [ID=%s, Key=%s, Fields=%v]", id, key, fields)
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
	logger.Infof("Redis 执行 Pipeline [ID=%s, CmdCount=%d]", id, len(commands))
	return GetContainer().RedisMgr.Pipeline(id, commands)
}

func (s *RedisService) RedisTransaction(id string, watch []string, commands []string) (redis.RedisTransactionResult, error) {
	logger.Infof("Redis 执行事务 [ID=%s, CmdCount=%d]", id, len(commands))
	return GetContainer().RedisMgr.Transaction(id, watch, commands)
}

func (s *RedisService) RedisPublish(id string, channel string, message string) (int64, error) {
	logger.Infof("Redis 发布消息 [ID=%s, Channel=%s]", id, channel)
	return GetContainer().RedisMgr.Publish(id, channel, message)
}

func (s *RedisService) RedisSubscribe(id string, channel string) error {
	logger.Infof("Redis 订阅频道 [ID=%s, Channel=%s]", id, channel)
	return GetContainer().RedisMgr.Subscribe(id, channel)
}

func (s *RedisService) RedisPSubscribe(id string, pattern string) error {
	logger.Infof("Redis 模式订阅 [ID=%s, Pattern=%s]", id, pattern)
	return GetContainer().RedisMgr.PSubscribe(id, pattern)
}

func (s *RedisService) RedisUnsubscribe(id string, channel string) error {
	logger.Infof("Redis 取消订阅 [ID=%s, Channel=%s]", id, channel)
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
	logger.Infof("测试 Redis 连通性: 主机=%s:%d", cfg.Host, cfg.Port)
	res, err := GetContainer().RedisMgr.TestConnection(cfg)
	if err != nil {
		logger.Errorf("测试 Redis 连通性失败 [主机=%s:%d]: %v", cfg.Host, cfg.Port, err)
		return nil, err
	}
	return res, nil
}
