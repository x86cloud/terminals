package main

import (
	"errors"
	"terminal/core"
	"terminal/mongo"
)

// ---------- MongoDB API ----------

func (a *App) MongoConnect(id string) (bool, error) {
	cfg, ok := a.store.Get(id)
	if !ok {
		return false, errors.New("服务器配置不存在")
	}
	if err := a.mongoMgr.Open(id, cfg); err != nil {
		return false, err
	}
	return true, nil
}

func (a *App) MongoClose(id string) error {
	a.mongoMgr.Close(id)
	return nil
}

func (a *App) MongoParseURI(uri string) (mongo.MongoURIInfo, error) {
	return a.mongoMgr.MongoParseURI(uri)
}

func (a *App) MongoTestConnection(cfg core.ServerConfig) (map[string]any, error) {
	return a.mongoMgr.TestConnection(cfg)
}

func (a *App) MongoHealthCheck(id string) (map[string]any, error) {
	return a.mongoMgr.MongoHealthCheck(id)
}

func (a *App) MongoServerStatus(id string) (map[string]any, error) {
	return a.mongoMgr.MongoServerStatus(id)
}

func (a *App) MongoClientStats(id string) (map[string]any, error) {
	return a.mongoMgr.MongoClientStats(id)
}

func (a *App) MongoCurrentOps(id string) ([]string, error) {
	return a.mongoMgr.MongoCurrentOps(id)
}

func (a *App) MongoDatabases(id string) ([]map[string]any, error) {
	return a.mongoMgr.MongoDatabases(id)
}

func (a *App) MongoCollections(id, dbName string) ([]map[string]any, error) {
	return a.mongoMgr.MongoCollections(id, dbName)
}

func (a *App) MongoCreateDatabase(id, dbName, firstCollection string) error {
	return a.mongoMgr.MongoCreateDatabase(id, dbName, firstCollection)
}

func (a *App) MongoDropDatabase(id, dbName string) error {
	return a.mongoMgr.MongoDropDatabase(id, dbName)
}

func (a *App) MongoCreateCollection(id, dbName, coll string) error {
	return a.mongoMgr.MongoCreateCollection(id, dbName, coll)
}

func (a *App) MongoDropCollection(id, dbName, coll string) error {
	return a.mongoMgr.MongoDropCollection(id, dbName, coll)
}

func (a *App) MongoRenameCollection(id, dbName, coll, newName string) error {
	return a.mongoMgr.MongoRenameCollection(id, dbName, coll, newName)
}

func (a *App) MongoCollectionStats(id, dbName, coll string) (map[string]any, error) {
	return a.mongoMgr.MongoCollectionStats(id, dbName, coll)
}

func (a *App) MongoInferSchema(id, dbName, coll string, sampleSize int) ([]map[string]any, error) {
	return a.mongoMgr.MongoInferSchema(id, dbName, coll, sampleSize)
}

func (a *App) MongoGetValidator(id, dbName, coll string) (map[string]any, error) {
	return a.mongoMgr.MongoGetValidator(id, dbName, coll)
}

func (a *App) MongoSetValidator(id, dbName, coll, validatorJSON, level, action string) error {
	return a.mongoMgr.MongoSetValidator(id, dbName, coll, validatorJSON, level, action)
}

func (a *App) MongoValidateDocument(id, dbName, coll, docJSON string) (map[string]any, error) {
	return a.mongoMgr.MongoValidateDocument(id, dbName, coll, docJSON)
}

func (a *App) MongoFind(id string, spec mongo.MongoQuerySpec) (mongo.MongoFindResult, error) {
	return a.mongoMgr.MongoFind(id, spec)
}

func (a *App) MongoCountDocuments(id, dbName, coll, filterJSON string) (int64, error) {
	return a.mongoMgr.MongoCountDocuments(id, dbName, coll, filterJSON)
}

func (a *App) MongoDistinct(id, dbName, coll, field, filterJSON string) ([]string, error) {
	return a.mongoMgr.MongoDistinct(id, dbName, coll, field, filterJSON)
}

func (a *App) MongoExplain(id string, spec mongo.MongoQuerySpec, verbosity string) (string, error) {
	return a.mongoMgr.MongoExplain(id, spec, verbosity)
}

func (a *App) MongoInsertOne(id, dbName, coll, docJSON string) (string, error) {
	return a.mongoMgr.MongoInsertOne(id, dbName, coll, docJSON)
}

func (a *App) MongoInsertMany(id, dbName, coll, docsJSON string, ordered bool) (map[string]any, error) {
	return a.mongoMgr.MongoInsertMany(id, dbName, coll, docsJSON, ordered)
}

func (a *App) MongoUpdateOne(id, dbName, coll, filterJSON, updateJSON string, upsert bool) (map[string]any, error) {
	return a.mongoMgr.MongoUpdateOne(id, dbName, coll, filterJSON, updateJSON, upsert)
}

func (a *App) MongoUpdateMany(id, dbName, coll, filterJSON, updateJSON string, upsert bool) (map[string]any, error) {
	return a.mongoMgr.MongoUpdateMany(id, dbName, coll, filterJSON, updateJSON, upsert)
}

func (a *App) MongoReplaceOne(id, dbName, coll, filterJSON, docJSON string, upsert bool) (map[string]any, error) {
	return a.mongoMgr.MongoReplaceOne(id, dbName, coll, filterJSON, docJSON, upsert)
}

func (a *App) MongoDeleteOne(id, dbName, coll, filterJSON string) (int64, error) {
	return a.mongoMgr.MongoDeleteOne(id, dbName, coll, filterJSON)
}

func (a *App) MongoDeleteMany(id, dbName, coll, filterJSON string) (int64, error) {
	return a.mongoMgr.MongoDeleteMany(id, dbName, coll, filterJSON)
}

func (a *App) MongoFindOneAndUpdate(id, dbName, coll, filterJSON, updateJSON string, returnNew bool) (string, error) {
	return a.mongoMgr.MongoFindOneAndUpdate(id, dbName, coll, filterJSON, updateJSON, returnNew)
}

func (a *App) MongoBulkWrite(id, dbName, coll string, ops []mongo.MongoBulkOp, ordered bool) (map[string]any, error) {
	return a.mongoMgr.MongoBulkWrite(id, dbName, coll, ops, ordered)
}

func (a *App) MongoAggregate(id, dbName, coll, pipelineJSON string, allowDiskUse bool, maxTimeMS int) (mongo.MongoFindResult, error) {
	return a.mongoMgr.MongoAggregate(id, dbName, coll, pipelineJSON, allowDiskUse, maxTimeMS)
}

func (a *App) MongoAggregateExplain(id, dbName, coll, pipelineJSON string) (string, error) {
	return a.mongoMgr.MongoAggregateExplain(id, dbName, coll, pipelineJSON)
}

func (a *App) MongoRunCommand(id, dbName, commandJSON string) (string, error) {
	return a.mongoMgr.MongoRunCommand(id, dbName, commandJSON)
}

func (a *App) MongoIndexes(id, dbName, coll string) ([]map[string]any, error) {
	return a.mongoMgr.MongoIndexes(id, dbName, coll)
}

func (a *App) MongoCreateIndex(id, dbName, coll, keysJSON, name string, unique bool, sparse bool, expireAfterSeconds int) (string, error) {
	return a.mongoMgr.MongoCreateIndex(id, dbName, coll, keysJSON, name, unique, sparse, expireAfterSeconds)
}

func (a *App) MongoDropIndex(id, dbName, coll, name string) error {
	return a.mongoMgr.MongoDropIndex(id, dbName, coll, name)
}

func (a *App) MongoIndexStats(id, dbName, coll string) ([]string, error) {
	return a.mongoMgr.MongoIndexStats(id, dbName, coll)
}

func (a *App) MongoTransaction(id string, ops []mongo.MongoTxOp) (map[string]any, error) {
	return a.mongoMgr.MongoTransaction(id, ops)
}

func (a *App) MongoWatch(id, scope, dbName, coll, pipelineJSON, fullDocument string) (string, error) {
	return a.mongoMgr.MongoWatch(id, scope, dbName, coll, pipelineJSON, fullDocument)
}

func (a *App) MongoUnwatch(id, watchKey string) error {
	return a.mongoMgr.MongoUnwatch(id, watchKey)
}

func (a *App) MongoWatchList(id string) ([]string, error) {
	return a.mongoMgr.MongoWatchList(id)
}
