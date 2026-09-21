package services

import (
	"errors"
	"terminal/core"
	"terminal/logger"
	"terminal/mongo"
)

type MongoService struct{}

func NewMongoService() *MongoService {
	return &MongoService{}
}

func (s *MongoService) MongoConnect(id string) (bool, error) {
	c := GetContainer()
	cfg, ok := c.Store.Get(id)
	if !ok {
		err := errors.New("服务器配置不存在")
		logger.Errorf("MongoDB 连接失败: 服务器配置不存在 [ID=%s]", id)
		return false, err
	}
	logger.Infof("正在发起 MongoDB 连接: ID=%s, 名称=%s, 主机=%s:%d, 用户=%s", cfg.ID, cfg.Name, cfg.Host, cfg.Port, cfg.Username)
	if err := c.MongoMgr.Open(id, cfg); err != nil {
		logger.Errorf("MongoDB 连接失败 [ID=%s, 主机=%s:%d]: %v", id, cfg.Host, cfg.Port, err)
		return false, err
	}
	logger.Infof("MongoDB 连接成功: ID=%s, 主机=%s:%d", id, cfg.Host, cfg.Port)
	return true, nil
}

func (s *MongoService) MongoClose(id string) error {
	logger.Infof("关闭 MongoDB 连接: ID=%s", id)
	GetContainer().MongoMgr.Close(id)
	return nil
}

func (s *MongoService) MongoParseURI(uri string) (mongo.MongoURIInfo, error) {
	return GetContainer().MongoMgr.MongoParseURI(uri)
}

func (s *MongoService) MongoTestConnection(cfg core.ServerConfig) (map[string]any, error) {
	logger.Infof("测试 MongoDB 连通性: 主机=%s:%d, 用户=%s", cfg.Host, cfg.Port, cfg.Username)
	res, err := GetContainer().MongoMgr.TestConnection(cfg)
	if err != nil {
		logger.Errorf("测试 MongoDB 连通性失败 [主机=%s:%d]: %v", cfg.Host, cfg.Port, err)
		return nil, err
	}
	return res, nil
}

func (s *MongoService) MongoHealthCheck(id string) (map[string]any, error) {
	return GetContainer().MongoMgr.MongoHealthCheck(id)
}

func (s *MongoService) MongoServerStatus(id string) (map[string]any, error) {
	return GetContainer().MongoMgr.MongoServerStatus(id)
}

func (s *MongoService) MongoClientStats(id string) (map[string]any, error) {
	return GetContainer().MongoMgr.MongoClientStats(id)
}

func (s *MongoService) MongoCurrentOps(id string) ([]string, error) {
	return GetContainer().MongoMgr.MongoCurrentOps(id)
}

func (s *MongoService) MongoDatabases(id string) ([]map[string]any, error) {
	dbs, err := GetContainer().MongoMgr.MongoDatabases(id)
	if err != nil {
		logger.Errorf("获取 MongoDB 数据库列表失败 [ID=%s]: %v", id, err)
		return nil, err
	}
	return dbs, nil
}

func (s *MongoService) MongoCollections(id, dbName string) ([]map[string]any, error) {
	colls, err := GetContainer().MongoMgr.MongoCollections(id, dbName)
	if err != nil {
		logger.Errorf("获取 MongoDB 集合列表失败 [ID=%s, DB=%s]: %v", id, dbName, err)
		return nil, err
	}
	return colls, nil
}

func (s *MongoService) MongoCreateDatabase(id, dbName, firstCollection string) error {
	logger.Infof("MongoDB 创建数据库 [ID=%s, DB=%s, FirstCollection=%s]", id, dbName, firstCollection)
	if err := GetContainer().MongoMgr.MongoCreateDatabase(id, dbName, firstCollection); err != nil {
		logger.Errorf("MongoDB 创建数据库失败 [ID=%s, DB=%s]: %v", id, dbName, err)
		return err
	}
	return nil
}

func (s *MongoService) MongoDropDatabase(id, dbName string) error {
	logger.Infof("MongoDB 删除数据库 [ID=%s, DB=%s]", id, dbName)
	if err := GetContainer().MongoMgr.MongoDropDatabase(id, dbName); err != nil {
		logger.Errorf("MongoDB 删除数据库失败 [ID=%s, DB=%s]: %v", id, dbName, err)
		return err
	}
	return nil
}

func (s *MongoService) MongoCreateCollection(id, dbName, coll string) error {
	logger.Infof("MongoDB 创建集合 [ID=%s, DB=%s, Coll=%s]", id, dbName, coll)
	if err := GetContainer().MongoMgr.MongoCreateCollection(id, dbName, coll); err != nil {
		logger.Errorf("MongoDB 创建集合失败 [ID=%s, DB=%s, Coll=%s]: %v", id, dbName, coll, err)
		return err
	}
	return nil
}

func (s *MongoService) MongoDropCollection(id, dbName, coll string) error {
	logger.Infof("MongoDB 删除集合 [ID=%s, DB=%s, Coll=%s]", id, dbName, coll)
	if err := GetContainer().MongoMgr.MongoDropCollection(id, dbName, coll); err != nil {
		logger.Errorf("MongoDB 删除集合失败 [ID=%s, DB=%s, Coll=%s]: %v", id, dbName, coll, err)
		return err
	}
	return nil
}

func (s *MongoService) MongoRenameCollection(id, dbName, coll, newName string) error {
	logger.Infof("MongoDB 重命名集合 [ID=%s, DB=%s, Old=%s, New=%s]", id, dbName, coll, newName)
	if err := GetContainer().MongoMgr.MongoRenameCollection(id, dbName, coll, newName); err != nil {
		logger.Errorf("MongoDB 重命名集合失败 [ID=%s, DB=%s, Old=%s, New=%s]: %v", id, dbName, coll, newName, err)
		return err
	}
	return nil
}

func (s *MongoService) MongoCollectionStats(id, dbName, coll string) (map[string]any, error) {
	return GetContainer().MongoMgr.MongoCollectionStats(id, dbName, coll)
}

func (s *MongoService) MongoInferSchema(id, dbName, coll string, sampleSize int) ([]map[string]any, error) {
	return GetContainer().MongoMgr.MongoInferSchema(id, dbName, coll, sampleSize)
}

func (s *MongoService) MongoGetValidator(id, dbName, coll string) (map[string]any, error) {
	return GetContainer().MongoMgr.MongoGetValidator(id, dbName, coll)
}

func (s *MongoService) MongoSetValidator(id, dbName, coll, validatorJSON, level, action string) error {
	logger.Infof("MongoDB 设置集合校验规则 [ID=%s, DB=%s, Coll=%s, Level=%s, Action=%s]", id, dbName, coll, level, action)
	if err := GetContainer().MongoMgr.MongoSetValidator(id, dbName, coll, validatorJSON, level, action); err != nil {
		logger.Errorf("MongoDB 设置校验规则失败 [ID=%s, DB=%s, Coll=%s]: %v", id, dbName, coll, err)
		return err
	}
	return nil
}

func (s *MongoService) MongoValidateDocument(id, dbName, coll, docJSON string) (map[string]any, error) {
	return GetContainer().MongoMgr.MongoValidateDocument(id, dbName, coll, docJSON)
}

func (s *MongoService) MongoFind(id string, spec mongo.MongoQuerySpec) (mongo.MongoFindResult, error) {
	res, err := GetContainer().MongoMgr.MongoFind(id, spec)
	if err != nil {
		logger.Errorf("MongoDB 查询失败 [ID=%s, DB=%s, Coll=%s]: %v", id, spec.Database, spec.Collection, err)
		return res, err
	}
	return res, nil
}

func (s *MongoService) MongoCountDocuments(id, dbName, coll, filterJSON string) (int64, error) {
	count, err := GetContainer().MongoMgr.MongoCountDocuments(id, dbName, coll, filterJSON)
	if err != nil {
		logger.Errorf("MongoDB 统计文档数失败 [ID=%s, DB=%s, Coll=%s]: %v", id, dbName, coll, err)
		return 0, err
	}
	return count, nil
}

func (s *MongoService) MongoDistinct(id, dbName, coll, field, filterJSON string) ([]string, error) {
	return GetContainer().MongoMgr.MongoDistinct(id, dbName, coll, field, filterJSON)
}

func (s *MongoService) MongoExplain(id string, spec mongo.MongoQuerySpec, verbosity string) (string, error) {
	return GetContainer().MongoMgr.MongoExplain(id, spec, verbosity)
}

func (s *MongoService) MongoInsertOne(id, dbName, coll, docJSON string) (string, error) {
	logger.Infof("MongoDB 插入单条文档 [ID=%s, DB=%s, Coll=%s]", id, dbName, coll)
	res, err := GetContainer().MongoMgr.MongoInsertOne(id, dbName, coll, docJSON)
	if err != nil {
		logger.Errorf("MongoDB 插入单条文档失败 [ID=%s, DB=%s, Coll=%s]: %v", id, dbName, coll, err)
		return "", err
	}
	return res, nil
}

func (s *MongoService) MongoInsertMany(id, dbName, coll, docsJSON string, ordered bool) (map[string]any, error) {
	logger.Infof("MongoDB 批量插入文档 [ID=%s, DB=%s, Coll=%s, Ordered=%v]", id, dbName, coll, ordered)
	res, err := GetContainer().MongoMgr.MongoInsertMany(id, dbName, coll, docsJSON, ordered)
	if err != nil {
		logger.Errorf("MongoDB 批量插入文档失败 [ID=%s, DB=%s, Coll=%s]: %v", id, dbName, coll, err)
		return nil, err
	}
	return res, nil
}

func (s *MongoService) MongoUpdateOne(id, dbName, coll, filterJSON, updateJSON string, upsert bool) (map[string]any, error) {
	logger.Infof("MongoDB 更新单条文档 [ID=%s, DB=%s, Coll=%s, Upsert=%v]", id, dbName, coll, upsert)
	res, err := GetContainer().MongoMgr.MongoUpdateOne(id, dbName, coll, filterJSON, updateJSON, upsert)
	if err != nil {
		logger.Errorf("MongoDB 更新单条文档失败 [ID=%s, DB=%s, Coll=%s]: %v", id, dbName, coll, err)
		return nil, err
	}
	return res, nil
}

func (s *MongoService) MongoUpdateMany(id, dbName, coll, filterJSON, updateJSON string, upsert bool) (map[string]any, error) {
	logger.Infof("MongoDB 批量更新文档 [ID=%s, DB=%s, Coll=%s, Upsert=%v]", id, dbName, coll, upsert)
	res, err := GetContainer().MongoMgr.MongoUpdateMany(id, dbName, coll, filterJSON, updateJSON, upsert)
	if err != nil {
		logger.Errorf("MongoDB 批量更新文档失败 [ID=%s, DB=%s, Coll=%s]: %v", id, dbName, coll, err)
		return nil, err
	}
	return res, nil
}

func (s *MongoService) MongoReplaceOne(id, dbName, coll, filterJSON, docJSON string, upsert bool) (map[string]any, error) {
	logger.Infof("MongoDB 替换单条文档 [ID=%s, DB=%s, Coll=%s, Upsert=%v]", id, dbName, coll, upsert)
	res, err := GetContainer().MongoMgr.MongoReplaceOne(id, dbName, coll, filterJSON, docJSON, upsert)
	if err != nil {
		logger.Errorf("MongoDB 替换单条文档失败 [ID=%s, DB=%s, Coll=%s]: %v", id, dbName, coll, err)
		return nil, err
	}
	return res, nil
}

func (s *MongoService) MongoDeleteOne(id, dbName, coll, filterJSON string) (int64, error) {
	logger.Infof("MongoDB 删除单条文档 [ID=%s, DB=%s, Coll=%s]", id, dbName, coll)
	count, err := GetContainer().MongoMgr.MongoDeleteOne(id, dbName, coll, filterJSON)
	if err != nil {
		logger.Errorf("MongoDB 删除单条文档失败 [ID=%s, DB=%s, Coll=%s]: %v", id, dbName, coll, err)
		return 0, err
	}
	return count, nil
}

func (s *MongoService) MongoDeleteMany(id, dbName, coll, filterJSON string) (int64, error) {
	logger.Infof("MongoDB 批量删除文档 [ID=%s, DB=%s, Coll=%s]", id, dbName, coll)
	count, err := GetContainer().MongoMgr.MongoDeleteMany(id, dbName, coll, filterJSON)
	if err != nil {
		logger.Errorf("MongoDB 批量删除文档失败 [ID=%s, DB=%s, Coll=%s]: %v", id, dbName, coll, err)
		return 0, err
	}
	return count, nil
}

func (s *MongoService) MongoFindOneAndUpdate(id, dbName, coll, filterJSON, updateJSON string, returnNew bool) (string, error) {
	logger.Infof("MongoDB FindOneAndUpdate [ID=%s, DB=%s, Coll=%s, ReturnNew=%v]", id, dbName, coll, returnNew)
	return GetContainer().MongoMgr.MongoFindOneAndUpdate(id, dbName, coll, filterJSON, updateJSON, returnNew)
}

func (s *MongoService) MongoBulkWrite(id, dbName, coll string, ops []mongo.MongoBulkOp, ordered bool) (map[string]any, error) {
	logger.Infof("MongoDB 批量写入操作 [ID=%s, DB=%s, Coll=%s, OpCount=%d, Ordered=%v]", id, dbName, coll, len(ops), ordered)
	return GetContainer().MongoMgr.MongoBulkWrite(id, dbName, coll, ops, ordered)
}

func (s *MongoService) MongoAggregate(id, dbName, coll, pipelineJSON string, allowDiskUse bool, maxTimeMS int) (mongo.MongoFindResult, error) {
	logger.Infof("MongoDB 聚合查询 [ID=%s, DB=%s, Coll=%s, AllowDiskUse=%v]", id, dbName, coll, allowDiskUse)
	res, err := GetContainer().MongoMgr.MongoAggregate(id, dbName, coll, pipelineJSON, allowDiskUse, maxTimeMS)
	if err != nil {
		logger.Errorf("MongoDB 聚合查询失败 [ID=%s, DB=%s, Coll=%s]: %v", id, dbName, coll, err)
		return res, err
	}
	return res, nil
}

func (s *MongoService) MongoAggregateExplain(id, dbName, coll, pipelineJSON string) (string, error) {
	return GetContainer().MongoMgr.MongoAggregateExplain(id, dbName, coll, pipelineJSON)
}

func (s *MongoService) MongoRunCommand(id, dbName, commandJSON string) (string, error) {
	logger.Infof("MongoDB 执行命令 [ID=%s, DB=%s, Command=%s]", id, dbName, commandJSON)
	res, err := GetContainer().MongoMgr.MongoRunCommand(id, dbName, commandJSON)
	if err != nil {
		logger.Errorf("MongoDB 执行命令失败 [ID=%s, DB=%s]: %v", id, dbName, err)
		return "", err
	}
	return res, nil
}

func (s *MongoService) MongoIndexes(id, dbName, coll string) ([]map[string]any, error) {
	return GetContainer().MongoMgr.MongoIndexes(id, dbName, coll)
}

func (s *MongoService) MongoCreateIndex(id, dbName, coll, keysJSON, name string, unique bool, sparse bool, expireAfterSeconds int) (string, error) {
	logger.Infof("MongoDB 创建索引 [ID=%s, DB=%s, Coll=%s, Index=%s, Unique=%v]", id, dbName, coll, name, unique)
	res, err := GetContainer().MongoMgr.MongoCreateIndex(id, dbName, coll, keysJSON, name, unique, sparse, expireAfterSeconds)
	if err != nil {
		logger.Errorf("MongoDB 创建索引失败 [ID=%s, DB=%s, Coll=%s, Index=%s]: %v", id, dbName, coll, name, err)
		return "", err
	}
	return res, nil
}

func (s *MongoService) MongoDropIndex(id, dbName, coll, name string) error {
	logger.Infof("MongoDB 删除索引 [ID=%s, DB=%s, Coll=%s, Index=%s]", id, dbName, coll, name)
	if err := GetContainer().MongoMgr.MongoDropIndex(id, dbName, coll, name); err != nil {
		logger.Errorf("MongoDB 删除索引失败 [ID=%s, DB=%s, Coll=%s, Index=%s]: %v", id, dbName, coll, name, err)
		return err
	}
	return nil
}

func (s *MongoService) MongoIndexStats(id, dbName, coll string) ([]string, error) {
	return GetContainer().MongoMgr.MongoIndexStats(id, dbName, coll)
}

func (s *MongoService) MongoTransaction(id string, ops []mongo.MongoTxOp) (map[string]any, error) {
	logger.Infof("MongoDB 执行事务操作 [ID=%s, OpCount=%d]", id, len(ops))
	return GetContainer().MongoMgr.MongoTransaction(id, ops)
}

func (s *MongoService) MongoWatch(id, scope, dbName, coll, pipelineJSON, fullDocument string) (string, error) {
	logger.Infof("MongoDB 开启 ChangeStream [ID=%s, Scope=%s, DB=%s, Coll=%s]", id, scope, dbName, coll)
	return GetContainer().MongoMgr.MongoWatch(id, scope, dbName, coll, pipelineJSON, fullDocument)
}

func (s *MongoService) MongoUnwatch(id, watchKey string) error {
	logger.Infof("MongoDB 停止 ChangeStream [ID=%s, WatchKey=%s]", id, watchKey)
	return GetContainer().MongoMgr.MongoUnwatch(id, watchKey)
}

func (s *MongoService) MongoWatchList(id string) ([]string, error) {
	return GetContainer().MongoMgr.MongoWatchList(id)
}
