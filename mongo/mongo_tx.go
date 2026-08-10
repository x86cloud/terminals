package mongo

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
	wruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// ===================== 事务 =====================

// MongoTxOp 事务中的一个操作。
type MongoTxOp struct {
	Type       string `json:"type"`       // insert | update | updateMany | delete | deleteMany | replace
	Database   string `json:"database"`
	Collection string `json:"collection"`
	Filter     string `json:"filter"`
	Document   string `json:"document"`
	Upsert     bool   `json:"upsert"`
}

// MongoTransaction 在单个事务中按顺序执行多个操作，全部成功才提交。
// 需要副本集或分片集群；单机实例不支持事务。
func (m *MongoManager) MongoTransaction(id string, ops []MongoTxOp) (map[string]any, error) {
	mc, err := m.mustMongo(id)
	if err != nil {
		return nil, err
	}
	if len(ops) == 0 {
		return nil, errors.New("事务中没有可执行的操作")
	}

	sess, err := mc.client.StartSession()
	if err != nil {
		return nil, fmt.Errorf("开启会话失败（事务需要副本集或分片集群）: %w", err)
	}
	defer sess.EndSession(context.Background())

	ctx, cancel := mc.opCtx()
	defer cancel()

	results := make([]map[string]any, 0, len(ops))
	start := time.Now()

	_, txErr := sess.WithTransaction(ctx, func(sc context.Context) (any, error) {
		results = results[:0]
		for i, op := range ops {
			c := mc.client.Database(op.Database).Collection(op.Collection)
			step := map[string]any{"index": i, "type": op.Type}

			switch strings.ToLower(op.Type) {
			case "insert":
				doc, err := parseJSONDoc(op.Document)
				if err != nil {
					return nil, fmt.Errorf("第 %d 项 %w", i+1, err)
				}
				r, err := c.InsertOne(sc, doc)
				if err != nil {
					return nil, fmt.Errorf("第 %d 项插入失败: %w", i+1, err)
				}
				step["insertedId"] = docToJSON(bson.D{{Key: "id", Value: r.InsertedID}})

			case "update", "updatemany":
				filter, err := parseJSONDoc(op.Filter)
				if err != nil {
					return nil, fmt.Errorf("第 %d 项过滤条件 %w", i+1, err)
				}
				update, err := parseJSONDoc(op.Document)
				if err != nil {
					return nil, fmt.Errorf("第 %d 项更新内容 %w", i+1, err)
				}
				if len(update) > 0 && !strings.HasPrefix(update[0].Key, "$") {
					update = bson.D{{Key: "$set", Value: update}}
				}
				var r *mongo.UpdateResult
				if strings.ToLower(op.Type) == "updatemany" {
					r, err = c.UpdateMany(sc, filter, update, options.UpdateMany().SetUpsert(op.Upsert))
				} else {
					r, err = c.UpdateOne(sc, filter, update, options.UpdateOne().SetUpsert(op.Upsert))
				}
				if err != nil {
					return nil, fmt.Errorf("第 %d 项更新失败: %w", i+1, err)
				}
				step["matched"] = r.MatchedCount
				step["modified"] = r.ModifiedCount

			case "replace":
				filter, err := parseJSONDoc(op.Filter)
				if err != nil {
					return nil, fmt.Errorf("第 %d 项过滤条件 %w", i+1, err)
				}
				doc, err := parseJSONDoc(op.Document)
				if err != nil {
					return nil, fmt.Errorf("第 %d 项替换文档 %w", i+1, err)
				}
				r, err := c.ReplaceOne(sc, filter, doc, options.Replace().SetUpsert(op.Upsert))
				if err != nil {
					return nil, fmt.Errorf("第 %d 项替换失败: %w", i+1, err)
				}
				step["matched"] = r.MatchedCount
				step["modified"] = r.ModifiedCount

			case "delete", "deletemany":
				filter, err := parseJSONDoc(op.Filter)
				if err != nil {
					return nil, fmt.Errorf("第 %d 项过滤条件 %w", i+1, err)
				}
				var r *mongo.DeleteResult
				if strings.ToLower(op.Type) == "deletemany" {
					r, err = c.DeleteMany(sc, filter)
				} else {
					r, err = c.DeleteOne(sc, filter)
				}
				if err != nil {
					return nil, fmt.Errorf("第 %d 项删除失败: %w", i+1, err)
				}
				step["deleted"] = r.DeletedCount

			default:
				return nil, fmt.Errorf("第 %d 项：不支持的操作类型 %s", i+1, op.Type)
			}
			results = append(results, step)
		}
		return nil, nil
	})

	mc.track(start, txErr)
	out := map[string]any{
		"results":    results,
		"committed":  txErr == nil,
		"durationMs": time.Since(start).Milliseconds(),
	}
	if txErr != nil {
		out["error"] = txErr.Error()
	}
	return out, nil
}

// ===================== 变更流（Change Stream） =====================

// MongoWatch 监听变更流。scope 为 deployment / database / collection。
// 事件通过 Wails 事件 mongo:change:<id> 推送到前端。
func (m *MongoManager) MongoWatch(id, scope, db, coll, pipelineJSON, fullDocument string) (string, error) {
	mc, err := m.mustMongo(id)
	if err != nil {
		return "", err
	}

	key := scope + ":" + db + ":" + coll
	mc.mu.Lock()
	if _, exists := mc.streams[key]; exists {
		mc.mu.Unlock()
		return key, nil
	}
	mc.mu.Unlock()

	// 可选的管道过滤，如只关心 insert
	var pipeline mongo.Pipeline
	if strings.TrimSpace(pipelineJSON) != "" {
		stages, err := parseJSONArray(pipelineJSON)
		if err != nil {
			return "", err
		}
		for _, s := range stages {
			pipeline = append(pipeline, s)
		}
	} else {
		pipeline = mongo.Pipeline{}
	}

	opt := options.ChangeStream()
	switch strings.ToLower(fullDocument) {
	case "updatelookup":
		opt.SetFullDocument(options.UpdateLookup)
	case "whenavailable":
		opt.SetFullDocument(options.WhenAvailable)
	case "required":
		opt.SetFullDocument(options.Required)
	}

	ctx, cancel := context.WithCancel(context.Background())

	var stream *mongo.ChangeStream
	switch strings.ToLower(scope) {
	case "deployment":
		stream, err = mc.client.Watch(ctx, pipeline, opt)
	case "database":
		if strings.TrimSpace(db) == "" {
			cancel()
			return "", errors.New("监听数据库变更需要指定数据库名")
		}
		stream, err = mc.client.Database(db).Watch(ctx, pipeline, opt)
	default:
		if strings.TrimSpace(db) == "" || strings.TrimSpace(coll) == "" {
			cancel()
			return "", errors.New("监听集合变更需要指定数据库与集合名")
		}
		stream, err = mc.client.Database(db).Collection(coll).Watch(ctx, pipeline, opt)
	}
	if err != nil {
		cancel()
		return "", fmt.Errorf("开启变更流失败（需要副本集或分片集群）: %w", err)
	}

	mc.mu.Lock()
	mc.streams[key] = cancel
	mc.mu.Unlock()

	// 后台读取事件并推送给前端
	go func() {
		defer func() {
			_ = stream.Close(context.Background())
			mc.mu.Lock()
			delete(mc.streams, key)
			mc.mu.Unlock()
		}()
		for stream.Next(ctx) {
			var evt bson.M
			if err := stream.Decode(&evt); err != nil {
				continue
			}
			wruntime.EventsEmit(m.ctx, "mongo:change:"+id, map[string]any{
				"watchKey":  key,
				"operation": evt["operationType"],
				"ns":        docToJSON(evt["ns"]),
				"document":  docToJSON(evt),
				"ts":        time.Now().UnixMilli(),
			})
		}
		if err := stream.Err(); err != nil && ctx.Err() == nil {
			wruntime.EventsEmit(m.ctx, "mongo:change:"+id, map[string]any{
				"watchKey": key,
				"error":    err.Error(),
				"ts":       time.Now().UnixMilli(),
			})
		}
	}()

	return key, nil
}

// MongoUnwatch 停止指定的变更流。
func (m *MongoManager) MongoUnwatch(id, watchKey string) error {
	mc, err := m.mustMongo(id)
	if err != nil {
		return err
	}
	mc.mu.Lock()
	cancel, ok := mc.streams[watchKey]
	if ok {
		delete(mc.streams, watchKey)
	}
	mc.mu.Unlock()
	if ok {
		cancel()
	}
	return nil
}

// MongoWatchList 返回当前活跃的变更流。
func (m *MongoManager) MongoWatchList(id string) ([]string, error) {
	mc, err := m.mustMongo(id)
	if err != nil {
		return nil, err
	}
	mc.mu.Lock()
	defer mc.mu.Unlock()
	out := make([]string, 0, len(mc.streams))
	for k := range mc.streams {
		out = append(out, k)
	}
	sort.Strings(out)
	return out, nil
}
