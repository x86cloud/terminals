package services

import (
	"errors"
	"terminal/core"
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
		return false, errors.New("服务器配置不存在")
	}
	if err := c.MongoMgr.Open(id, cfg); err != nil {
		return false, err
	}
	return true, nil
}

func (s *MongoService) MongoClose(id string) error {
	GetContainer().MongoMgr.Close(id)
	return nil
}

func (s *MongoService) MongoParseURI(uri string) (mongo.MongoURIInfo, error) {
	return GetContainer().MongoMgr.MongoParseURI(uri)
}

func (s *MongoService) MongoTestConnection(cfg core.ServerConfig) (map[string]any, error) {
	return GetContainer().MongoMgr.TestConnection(cfg)
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
	return GetContainer().MongoMgr.MongoDatabases(id)
}

func (s *MongoService) MongoCollections(id, dbName string) ([]map[string]any, error) {
	return GetContainer().MongoMgr.MongoCollections(id, dbName)
}

func (s *MongoService) MongoCreateDatabase(id, dbName, firstCollection string) error {
	return GetContainer().MongoMgr.MongoCreateDatabase(id, dbName, firstCollection)
}

func (s *MongoService) MongoDropDatabase(id, dbName string) error {
	return GetContainer().MongoMgr.MongoDropDatabase(id, dbName)
}

func (s *MongoService) MongoCreateCollection(id, dbName, coll string) error {
	return GetContainer().MongoMgr.MongoCreateCollection(id, dbName, coll)
}

func (s *MongoService) MongoDropCollection(id, dbName, coll string) error {
	return GetContainer().MongoMgr.MongoDropCollection(id, dbName, coll)
}

func (s *MongoService) MongoRenameCollection(id, dbName, coll, newName string) error {
	return GetContainer().MongoMgr.MongoRenameCollection(id, dbName, coll, newName)
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
	return GetContainer().MongoMgr.MongoSetValidator(id, dbName, coll, validatorJSON, level, action)
}

func (s *MongoService) MongoValidateDocument(id, dbName, coll, docJSON string) (map[string]any, error) {
	return GetContainer().MongoMgr.MongoValidateDocument(id, dbName, coll, docJSON)
}

func (s *MongoService) MongoFind(id string, spec mongo.MongoQuerySpec) (mongo.MongoFindResult, error) {
	return GetContainer().MongoMgr.MongoFind(id, spec)
}

func (s *MongoService) MongoCountDocuments(id, dbName, coll, filterJSON string) (int64, error) {
	return GetContainer().MongoMgr.MongoCountDocuments(id, dbName, coll, filterJSON)
}

func (s *MongoService) MongoDistinct(id, dbName, coll, field, filterJSON string) ([]string, error) {
	return GetContainer().MongoMgr.MongoDistinct(id, dbName, coll, field, filterJSON)
}

func (s *MongoService) MongoExplain(id string, spec mongo.MongoQuerySpec, verbosity string) (string, error) {
	return GetContainer().MongoMgr.MongoExplain(id, spec, verbosity)
}

func (s *MongoService) MongoInsertOne(id, dbName, coll, docJSON string) (string, error) {
	return GetContainer().MongoMgr.MongoInsertOne(id, dbName, coll, docJSON)
}

func (s *MongoService) MongoInsertMany(id, dbName, coll, docsJSON string, ordered bool) (map[string]any, error) {
	return GetContainer().MongoMgr.MongoInsertMany(id, dbName, coll, docsJSON, ordered)
}

func (s *MongoService) MongoUpdateOne(id, dbName, coll, filterJSON, updateJSON string, upsert bool) (map[string]any, error) {
	return GetContainer().MongoMgr.MongoUpdateOne(id, dbName, coll, filterJSON, updateJSON, upsert)
}

func (s *MongoService) MongoUpdateMany(id, dbName, coll, filterJSON, updateJSON string, upsert bool) (map[string]any, error) {
	return GetContainer().MongoMgr.MongoUpdateMany(id, dbName, coll, filterJSON, updateJSON, upsert)
}

func (s *MongoService) MongoReplaceOne(id, dbName, coll, filterJSON, docJSON string, upsert bool) (map[string]any, error) {
	return GetContainer().MongoMgr.MongoReplaceOne(id, dbName, coll, filterJSON, docJSON, upsert)
}

func (s *MongoService) MongoDeleteOne(id, dbName, coll, filterJSON string) (int64, error) {
	return GetContainer().MongoMgr.MongoDeleteOne(id, dbName, coll, filterJSON)
}

func (s *MongoService) MongoDeleteMany(id, dbName, coll, filterJSON string) (int64, error) {
	return GetContainer().MongoMgr.MongoDeleteMany(id, dbName, coll, filterJSON)
}

func (s *MongoService) MongoFindOneAndUpdate(id, dbName, coll, filterJSON, updateJSON string, returnNew bool) (string, error) {
	return GetContainer().MongoMgr.MongoFindOneAndUpdate(id, dbName, coll, filterJSON, updateJSON, returnNew)
}

func (s *MongoService) MongoBulkWrite(id, dbName, coll string, ops []mongo.MongoBulkOp, ordered bool) (map[string]any, error) {
	return GetContainer().MongoMgr.MongoBulkWrite(id, dbName, coll, ops, ordered)
}

func (s *MongoService) MongoAggregate(id, dbName, coll, pipelineJSON string, allowDiskUse bool, maxTimeMS int) (mongo.MongoFindResult, error) {
	return GetContainer().MongoMgr.MongoAggregate(id, dbName, coll, pipelineJSON, allowDiskUse, maxTimeMS)
}

func (s *MongoService) MongoAggregateExplain(id, dbName, coll, pipelineJSON string) (string, error) {
	return GetContainer().MongoMgr.MongoAggregateExplain(id, dbName, coll, pipelineJSON)
}

func (s *MongoService) MongoRunCommand(id, dbName, commandJSON string) (string, error) {
	return GetContainer().MongoMgr.MongoRunCommand(id, dbName, commandJSON)
}

func (s *MongoService) MongoIndexes(id, dbName, coll string) ([]map[string]any, error) {
	return GetContainer().MongoMgr.MongoIndexes(id, dbName, coll)
}

func (s *MongoService) MongoCreateIndex(id, dbName, coll, keysJSON, name string, unique bool, sparse bool, expireAfterSeconds int) (string, error) {
	return GetContainer().MongoMgr.MongoCreateIndex(id, dbName, coll, keysJSON, name, unique, sparse, expireAfterSeconds)
}

func (s *MongoService) MongoDropIndex(id, dbName, coll, name string) error {
	return GetContainer().MongoMgr.MongoDropIndex(id, dbName, coll, name)
}

func (s *MongoService) MongoIndexStats(id, dbName, coll string) ([]string, error) {
	return GetContainer().MongoMgr.MongoIndexStats(id, dbName, coll)
}

func (s *MongoService) MongoTransaction(id string, ops []mongo.MongoTxOp) (map[string]any, error) {
	return GetContainer().MongoMgr.MongoTransaction(id, ops)
}

func (s *MongoService) MongoWatch(id, scope, dbName, coll, pipelineJSON, fullDocument string) (string, error) {
	return GetContainer().MongoMgr.MongoWatch(id, scope, dbName, coll, pipelineJSON, fullDocument)
}

func (s *MongoService) MongoUnwatch(id, watchKey string) error {
	return GetContainer().MongoMgr.MongoUnwatch(id, watchKey)
}

func (s *MongoService) MongoWatchList(id string) ([]string, error) {
	return GetContainer().MongoMgr.MongoWatchList(id)
}
