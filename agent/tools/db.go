package tools

import (
	"context"
	"fmt"
	"strings"
	"terminal/agent/guard"
	"terminal/db"
	"terminal/mongo"
	"terminal/redis"

	"github.com/cloudwego/eino/components/tool/utils"
)

type DatabaseManagers struct {
	RedisMgr    *redis.RedisManager
	MysqlMgr    *db.MysqlManagerEx
	PostgresMgr *db.PostgresManager
	MongoMgr    *mongo.MongoManager
	SqliteMgr   *db.SqliteManager
}

type EmptyInput struct{}

type RedisKeysInput struct {
	ServerID string `json:"server_id,omitempty" jsonschema:"description=Redis 服务器连接 ID 或名称，若当前处于活动 Redis 会话或只有单一连接可留空"`
	Pattern  string `json:"pattern" jsonschema:"description=检索 Key 的匹配模式，例如 *、user:*，默认为 *"`
}

type RedisGetInput struct {
	ServerID string `json:"server_id,omitempty" jsonschema:"description=Redis 服务器连接 ID 或名称，若当前处于活动 Redis 会话或只有单一连接可留空"`
	Key      string `json:"key" jsonschema:"description=要查询的目标 Key 名称"`
}

type RedisInfoInput struct {
	ServerID string `json:"server_id,omitempty" jsonschema:"description=Redis 服务器连接 ID 或名称，若当前处于活动 Redis 会话或只有单一连接可留空"`
	Section  string `json:"section,omitempty" jsonschema:"description=指定查询的 Info 段，例如 server、memory、clients、stats，留空则返回全部"`
}

type RedisSlowlogInput struct {
	ServerID string `json:"server_id,omitempty" jsonschema:"description=Redis 服务器连接 ID 或名称，若当前处于活动 Redis 会话或只有单一连接可留空"`
	Limit    int    `json:"limit,omitempty" jsonschema:"description=要读取的慢查询条数上限，默认 10"`
}

type RedisSetInput struct {
	ServerID string `json:"server_id,omitempty" jsonschema:"description=Redis 服务器连接 ID 或名称，若当前处于活动 Redis 会话或只有单一连接可留空"`
	Key      string `json:"key" jsonschema:"description=要写入或创建的目标 Key 名称"`
	Type     string `json:"type,omitempty" jsonschema:"description=数据类型，支持: string, hash, list, set, zset，默认为 string"`
	Value    string `json:"value" jsonschema:"description=要写入的数据内容。String 支持普通文本或 JSON；Hash 支持 field\\nval 换行键值对；List/Set 支持换行列表；ZSet 支持 member\\nscore 换行对"`
	TTL      int    `json:"ttl,omitempty" jsonschema:"description=过期时间(秒)，-1 表示永久有效，大于 0 为具体存活秒数，默认 -1"`
}

type RedisDeleteInput struct {
	ServerID string   `json:"server_id,omitempty" jsonschema:"description=Redis 服务器连接 ID 或名称，若当前处于活动 Redis 会话或只有单一连接可留空"`
	Keys     []string `json:"keys" jsonschema:"description=要删除的 Key 列表，支持传入单个或多个键名"`
}

type RedisExpireInput struct {
	ServerID string `json:"server_id,omitempty" jsonschema:"description=Redis 服务器连接 ID 或名称，若当前处于活动 Redis 会话或只有单一连接可留空"`
	Key      string `json:"key" jsonschema:"description=要设置或修改过期时间的目标 Key 名称"`
	TTL      int    `json:"ttl" jsonschema:"description=新的过期时间(秒)，-1 表示取消过期时间(永久)，大于 0 为具体存活秒数"`
}

type RedisExecuteRawInput struct {
	ServerID string `json:"server_id,omitempty" jsonschema:"description=Redis 服务器连接 ID 或名称，若当前处于活动 Redis 会话或只有单一连接可留空"`
	Command  string `json:"command" jsonschema:"description=要执行的原生 Redis 命令字符串，例如: HSET myhash field1 val1、LPUSH mylist item1、INCR counter、SADD myset m1"`
}

type MysqlQueryInput struct {
	ServerID string `json:"server_id,omitempty" jsonschema:"description=MySQL 服务器连接 ID 或名称，若当前处于活动 MySQL 会话或只有单一连接可留空"`
	Database string `json:"database,omitempty" jsonschema:"description=目标数据库名称，若当前活动会话已选库或未指定可留空"`
	SQL      string `json:"sql" jsonschema:"description=要执行的 SQL 语句 (支持 SELECT / SHOW / INSERT / UPDATE / DELETE / DDL 等读写操作)"`
}

type MysqlDatabasesInput struct {
	ServerID string `json:"server_id,omitempty" jsonschema:"description=MySQL 服务器连接 ID 或名称，若当前处于活动 MySQL 会话或只有单一连接可留空"`
}

type MysqlTablesInput struct {
	ServerID string `json:"server_id,omitempty" jsonschema:"description=MySQL 服务器连接 ID 或名称，若当前处于活动 MySQL 会话或只有单一连接可留空"`
	Database string `json:"database,omitempty" jsonschema:"description=目标数据库名称，若当前活动会话已选库可留空"`
}

type MysqlSchemaInput struct {
	ServerID string `json:"server_id,omitempty" jsonschema:"description=MySQL 服务器连接 ID 或名称，若当前处于活动 MySQL 会话或只有单一连接可留空"`
	Database string `json:"database,omitempty" jsonschema:"description=目标数据库名称，若当前活动会话已选库可留空"`
}

type MysqlStatusInput struct {
	ServerID string `json:"server_id,omitempty" jsonschema:"description=MySQL 服务器连接 ID 或名称，若当前处于活动 MySQL 会话或只有单一连接可留空"`
}

type MongoFindInput struct {
	ServerID   string `json:"server_id,omitempty" jsonschema:"description=MongoDB 服务器连接 ID 或名称，若当前处于活动 MongoDB 会话或只有单一连接可留空"`
	Database   string `json:"database,omitempty" jsonschema:"description=目标数据库名称，若当前活动会话已选库可留空"`
	Collection string `json:"collection" jsonschema:"description=目标集合名称"`
	QueryJSON  string `json:"query_json,omitempty" jsonschema:"description=查询过滤条件的 JSON 字符串，例如 {\"status\": \"active\"}，留空则匹配全部"`
	Limit      int    `json:"limit,omitempty" jsonschema:"description=查询返回文档数量上限，默认 10，最大 50"`
}

type MongoAggregateInput struct {
	ServerID     string `json:"server_id,omitempty" jsonschema:"description=MongoDB 服务器连接 ID 或名称，若当前处于活动 MongoDB 会话或只有单一连接可留空"`
	Database     string `json:"database,omitempty" jsonschema:"description=目标数据库名称，若当前活动会话已选库可留空"`
	Collection   string `json:"collection" jsonschema:"description=目标集合名称"`
	PipelineJSON string `json:"pipeline_json" jsonschema:"description=MongoDB 聚合管道阶段的 JSON 数组字符串，例如 [ {\"$match\": ...}, {\"$group\": ...} ]"`
}

type MongoHealthInput struct {
	ServerID string `json:"server_id,omitempty" jsonschema:"description=MongoDB 服务器连接 ID 或名称，若当前处于活动 MongoDB 会话或只有单一连接可留空"`
}

type SqliteQueryInput struct {
	FileID string `json:"file_id,omitempty" jsonschema:"description=已打开的 SQLite 文件会话 ID 或路径，若当前处于活动 SQLite 会话或只有一个连接可留空"`
	SQL    string `json:"sql" jsonschema:"description=要执行的 SQL 语句 (支持 SELECT / PRAGMA / INSERT / UPDATE / DELETE / DDL 等读写操作)"`
}

type SqliteTablesInput struct {
	FileID string `json:"file_id,omitempty" jsonschema:"description=已打开的 SQLite 文件会话 ID 或路径，若当前处于活动 SQLite 会话或只有一个连接可留空"`
}

type SqliteSchemaInput struct {
	FileID string `json:"file_id,omitempty" jsonschema:"description=已打开的 SQLite 文件会话 ID 或路径，若当前处于活动 SQLite 会话或只有一个连接可留空"`
}

type PostgresDatabasesInput struct {
	ServerID string `json:"server_id,omitempty" jsonschema:"description=PostgreSQL 服务器连接 ID 或名称，若当前处于活动 PostgreSQL 会话或只有单一连接可留空"`
}

type PostgresTablesInput struct {
	ServerID string `json:"server_id,omitempty" jsonschema:"description=PostgreSQL 服务器连接 ID 或名称，若当前处于活动 PostgreSQL 会话或只有单一连接可留空"`
	Database string `json:"database,omitempty" jsonschema:"description=目标数据库名称，例如 postgres，若当前活动会话已选库可留空"`
	Schema   string `json:"schema,omitempty" jsonschema:"description=目标 Schema 命名空间，默认为 public"`
}

type PostgresQueryInput struct {
	ServerID string `json:"server_id,omitempty" jsonschema:"description=PostgreSQL 服务器连接 ID 或名称，若当前处于活动 PostgreSQL 会话或只有单一连接可留空"`
	Database string `json:"database,omitempty" jsonschema:"description=目标数据库名称，若未指定默认连接当前活动库、配置库或 postgres"`
	SQL      string `json:"sql" jsonschema:"description=要执行的 SQL 语句 (支持 SELECT / INSERT / UPDATE / DELETE / DDL / EXPLAIN 等读写操作)"`
}

func resolveRedisServerID(mgr *redis.RedisManager, serverID string) (string, error) {
	if mgr == nil {
		return "", fmt.Errorf("Redis 管理器不可用")
	}
	trimmed := strings.TrimSpace(serverID)
	if trimmed == "" {
		if active := GetActiveConnection(); active != nil && active.Protocol == "redis" && active.ID != "" {
			trimmed = active.ID
		}
	}
	return mgr.ResolveID(trimmed)
}

func resolveMysqlTarget(mgr *db.MysqlManagerEx, serverID, dbName string) (string, string, error) {
	if mgr == nil {
		return "", "", fmt.Errorf("MySQL 管理器不可用")
	}
	trimmed := strings.TrimSpace(serverID)
	database := strings.TrimSpace(dbName)
	if trimmed == "" {
		if active := GetActiveConnection(); active != nil && active.Protocol == "mysql" && active.ID != "" {
			trimmed = active.ID
			if database == "" && active.Database != "" {
				database = active.Database
			}
		}
	}
	resID, err := mgr.ResolveID(trimmed)
	if err != nil {
		return "", "", err
	}
	return resID, database, nil
}

func resolveMongoTarget(mgr *mongo.MongoManager, serverID, dbName string) (string, string, error) {
	if mgr == nil {
		return "", "", fmt.Errorf("MongoDB 管理器不可用")
	}
	trimmed := strings.TrimSpace(serverID)
	database := strings.TrimSpace(dbName)
	if trimmed == "" {
		if active := GetActiveConnection(); active != nil && active.Protocol == "mongo" && active.ID != "" {
			trimmed = active.ID
			if database == "" && active.Database != "" {
				database = active.Database
			}
		}
	}
	resID, err := mgr.ResolveID(trimmed)
	if err != nil {
		return "", "", err
	}
	return resID, database, nil
}

func resolveSqliteFileID(mgr *db.SqliteManager, fileID string) (string, error) {
	if mgr == nil {
		return "", fmt.Errorf("SQLite 管理器不可用")
	}
	trimmed := strings.TrimSpace(fileID)
	if trimmed == "" {
		if active := GetActiveConnection(); active != nil && active.Protocol == "sqlite" {
			if active.ID != "" {
				trimmed = active.ID
			} else if active.Path != "" {
				trimmed = active.Path
			}
		}
	}
	return mgr.ResolveID(trimmed)
}

func resolvePostgresTarget(mgr *db.PostgresManager, serverID, dbName string) (string, string, error) {
	if mgr == nil {
		return "", "", fmt.Errorf("PostgreSQL 管理器不可用")
	}
	trimmed := strings.TrimSpace(serverID)
	database := strings.TrimSpace(dbName)
	if trimmed == "" {
		if active := GetActiveConnection(); active != nil && (active.Protocol == "postgres" || active.Protocol == "postgresql") && active.ID != "" {
			trimmed = active.ID
			if database == "" && active.Database != "" {
				database = active.Database
			}
		}
	}
	resID, err := mgr.ResolveID(trimmed)
	if err != nil {
		return "", "", err
	}
	if database == "" {
		database = "postgres"
	}
	return resID, database, nil
}

func RegisterDatabaseTools(bus *ToolBus, mgrs DatabaseManagers) error {
	// ---------- 1. Redis Tools ----------
	if mgrs.RedisMgr != nil {
		keysTool, err := utils.InferTool("db_redis_keys", "基于 SCAN 分页查询 Redis 服务器中的键列表 (只读诊断)",
			func(ctx context.Context, input *RedisKeysInput) (any, error) {
				serverID, err := resolveRedisServerID(mgrs.RedisMgr, input.ServerID)
				if err != nil {
					return nil, err
				}
				pat := input.Pattern
				if pat == "" {
					pat = "*"
				}
				return mgrs.RedisMgr.Keys(serverID, pat, "0")
			})
		if err == nil {
			bus.Register(&RegisteredTool{
				Name:        "db_redis_keys",
				Description: "基于 SCAN 分页查询 Redis 服务器中的键列表 (只读诊断)",
				BaseTool:    keysTool,
				Level:       guard.LevelAllow,
			})
		}

		getTool, err := utils.InferTool("db_redis_get", "读取 Redis 中指定 Key 的值、类型及 TTL 过期时间",
			func(ctx context.Context, input *RedisGetInput) (any, error) {
				serverID, err := resolveRedisServerID(mgrs.RedisMgr, input.ServerID)
				if err != nil {
					return nil, err
				}
				return mgrs.RedisMgr.GetKey(serverID, input.Key)
			})
		if err == nil {
			bus.Register(&RegisteredTool{
				Name:        "db_redis_get",
				Description: "读取 Redis 中指定 Key 的值、类型及 TTL 过期时间",
				BaseTool:    getTool,
				Level:       guard.LevelAllow,
			})
		}

		infoTool, err := utils.InferTool("db_redis_info", "获取 Redis 服务器运行指标、内存占用与连接数",
			func(ctx context.Context, input *RedisInfoInput) (string, error) {
				serverID, err := resolveRedisServerID(mgrs.RedisMgr, input.ServerID)
				if err != nil {
					return "", err
				}
				return mgrs.RedisMgr.Info(serverID, input.Section)
			})
		if err == nil {
			bus.Register(&RegisteredTool{
				Name:        "db_redis_info",
				Description: "获取 Redis 服务器运行指标、内存占用与连接数",
				BaseTool:    infoTool,
				Level:       guard.LevelAllow,
			})
		}

		slowlogTool, err := utils.InferTool("db_redis_slowlog", "读取 Redis 慢查询日志",
			func(ctx context.Context, input *RedisSlowlogInput) (any, error) {
				serverID, err := resolveRedisServerID(mgrs.RedisMgr, input.ServerID)
				if err != nil {
					return nil, err
				}
				lim := input.Limit
				if lim <= 0 {
					lim = 10
				}
				return mgrs.RedisMgr.SlowLog(serverID, lim)
			})
		if err == nil {
			bus.Register(&RegisteredTool{
				Name:        "db_redis_slowlog",
				Description: "读取 Redis 慢查询日志",
				BaseTool:    slowlogTool,
				Level:       guard.LevelAllow,
			})
		}

		setTool, err := utils.InferTool("db_redis_set", "创建或更新 Redis 键值数据 (支持 String/Hash/List/Set/ZSet 及 TTL 过期时间设置)",
			func(ctx context.Context, input *RedisSetInput) (any, error) {
				serverID, err := resolveRedisServerID(mgrs.RedisMgr, input.ServerID)
				if err != nil {
					return nil, err
				}
				typ := strings.ToLower(strings.TrimSpace(input.Type))
				if typ == "" {
					typ = "string"
				}
				ttl := input.TTL
				if ttl == 0 {
					ttl = -1
				}
				if err := mgrs.RedisMgr.SetKey(serverID, input.Key, typ, input.Value, int64(ttl)); err != nil {
					return nil, err
				}
				return map[string]any{
					"success": true,
					"message": fmt.Sprintf("已成功写入 Key [%s] (类型: %s, TTL: %d 秒)", input.Key, typ, ttl),
					"key":     input.Key,
					"type":    typ,
					"ttl":     ttl,
				}, nil
			})
		if err == nil {
			bus.Register(&RegisteredTool{
				Name:        "db_redis_set",
				Description: "创建或更新 Redis 键值数据 (支持 String/Hash/List/Set/ZSet 及 TTL 过期时间设置)",
				BaseTool:    setTool,
				Level:       guard.LevelAllow,
			})
		}

		deleteTool, err := utils.InferTool("db_redis_delete", "删除 Redis 中指定的一个或多个 Key",
			func(ctx context.Context, input *RedisDeleteInput) (any, error) {
				serverID, err := resolveRedisServerID(mgrs.RedisMgr, input.ServerID)
				if err != nil {
					return nil, err
				}
				if len(input.Keys) == 0 {
					return map[string]any{"success": true, "deleted_count": 0}, nil
				}
				n, err := mgrs.RedisMgr.DelKeys(serverID, input.Keys)
				if err != nil {
					return nil, err
				}
				return map[string]any{
					"success":       true,
					"deleted_count": n,
					"keys":          input.Keys,
				}, nil
			})
		if err == nil {
			bus.Register(&RegisteredTool{
				Name:        "db_redis_delete",
				Description: "删除 Redis 中指定的一个或多个 Key",
				BaseTool:    deleteTool,
				Level:       guard.LevelAllow,
			})
		}

		expireTool, err := utils.InferTool("db_redis_expire", "设置或修改 Redis Key 的 TTL 过期时间 (秒)",
			func(ctx context.Context, input *RedisExpireInput) (any, error) {
				serverID, err := resolveRedisServerID(mgrs.RedisMgr, input.ServerID)
				if err != nil {
					return nil, err
				}
				if err := mgrs.RedisMgr.ExpireKey(serverID, input.Key, int64(input.TTL)); err != nil {
					return nil, err
				}
				return map[string]any{
					"success": true,
					"key":     input.Key,
					"ttl":     input.TTL,
					"message": fmt.Sprintf("已成功为 Key [%s] 设置过期时间为 %d 秒", input.Key, input.TTL),
				}, nil
			})
		if err == nil {
			bus.Register(&RegisteredTool{
				Name:        "db_redis_expire",
				Description: "设置或修改 Redis Key 的 TTL 过期时间 (秒)",
				BaseTool:    expireTool,
				Level:       guard.LevelAllow,
			})
		}

		executeRawTool, err := utils.InferTool("db_redis_execute_raw", "执行任意原生 Redis 写或读命令 (如 HSET, LPUSH, INCR, SADD, ZADD 等)",
			func(ctx context.Context, input *RedisExecuteRawInput) (any, error) {
				serverID, err := resolveRedisServerID(mgrs.RedisMgr, input.ServerID)
				if err != nil {
					return nil, err
				}
				return mgrs.RedisMgr.ExecuteRawCommand(serverID, input.Command)
			})
		if err == nil {
			bus.Register(&RegisteredTool{
				Name:        "db_redis_execute_raw",
				Description: "执行任意原生 Redis 写或读命令 (如 HSET, LPUSH, INCR, SADD, ZADD 等)",
				BaseTool:    executeRawTool,
				Level:       guard.LevelAllow,
			})
		}
	}

	// ---------- 2. MySQL Tools ----------
	if mgrs.MysqlMgr != nil {
		mysqlDatabasesTool, err := utils.InferTool("db_mysql_databases", "列出 MySQL 服务器上的所有数据库名称",
			func(ctx context.Context, input *MysqlDatabasesInput) (any, error) {
				serverID, _, err := resolveMysqlTarget(mgrs.MysqlMgr, input.ServerID, "")
				if err != nil {
					return nil, err
				}
				return mgrs.MysqlMgr.MysqlDatabases(serverID)
			})
		if err == nil {
			bus.Register(&RegisteredTool{
				Name:        "db_mysql_databases",
				Description: "列出 MySQL 服务器上的所有数据库名称",
				BaseTool:    mysqlDatabasesTool,
				Level:       guard.LevelAllow,
			})
		}

		mysqlTablesTool, err := utils.InferTool("db_mysql_tables", "列出 MySQL 指定数据库中的所有数据表名称",
			func(ctx context.Context, input *MysqlTablesInput) (any, error) {
				serverID, database, err := resolveMysqlTarget(mgrs.MysqlMgr, input.ServerID, input.Database)
				if err != nil {
					return nil, err
				}
				return mgrs.MysqlMgr.MysqlTables(serverID, database)
			})
		if err == nil {
			bus.Register(&RegisteredTool{
				Name:        "db_mysql_tables",
				Description: "列出 MySQL 指定数据库中的所有数据表名称",
				BaseTool:    mysqlTablesTool,
				Level:       guard.LevelAllow,
			})
		}

		mysqlQueryTool, err := utils.InferTool("db_mysql_query", "执行 MySQL 数据库 SQL 语句 (支持 SELECT/SHOW/INSERT/UPDATE/DELETE/DDL 等读写操作)",
			func(ctx context.Context, input *MysqlQueryInput) (any, error) {
				serverID, database, err := resolveMysqlTarget(mgrs.MysqlMgr, input.ServerID, input.Database)
				if err != nil {
					return nil, err
				}
				cleanSQL := strings.TrimSpace(input.SQL)
				if cleanSQL == "" {
					return nil, fmt.Errorf("SQL 语句不能为空")
				}
				return mgrs.MysqlMgr.MysqlRun(serverID, database, cleanSQL)
			})
		if err == nil {
			bus.Register(&RegisteredTool{
				Name:        "db_mysql_query",
				Description: "执行 MySQL 数据库 SQL 语句 (支持 SELECT/SHOW/INSERT/UPDATE/DELETE/DDL 等读写操作)",
				BaseTool:    mysqlQueryTool,
				Level:       guard.LevelAllow,
			})
		}

		schemaTool, err := utils.InferTool("db_mysql_schema", "获取 MySQL 指定数据库的表结构与字段索引元信息",
			func(ctx context.Context, input *MysqlSchemaInput) (any, error) {
				serverID, database, err := resolveMysqlTarget(mgrs.MysqlMgr, input.ServerID, input.Database)
				if err != nil {
					return nil, err
				}
				return mgrs.MysqlMgr.MysqlSchema(serverID, database)
			})
		if err == nil {
			bus.Register(&RegisteredTool{
				Name:        "db_mysql_schema",
				Description: "获取 MySQL 指定数据库的表结构与字段索引元信息",
				BaseTool:    schemaTool,
				Level:       guard.LevelAllow,
			})
		}

		statusTool, err := utils.InferTool("db_mysql_status", "获取 MySQL 服务器状态变量、Threads 连接数与运行统计",
			func(ctx context.Context, input *MysqlStatusInput) (any, error) {
				serverID, _, err := resolveMysqlTarget(mgrs.MysqlMgr, input.ServerID, "")
				if err != nil {
					return nil, err
				}
				return mgrs.MysqlMgr.MysqlStatus(serverID)
			})
		if err == nil {
			bus.Register(&RegisteredTool{
				Name:        "db_mysql_status",
				Description: "获取 MySQL 服务器状态变量、Threads 连接数与运行统计",
				BaseTool:    statusTool,
				Level:       guard.LevelAllow,
			})
		}

		processlistTool, err := utils.InferTool("db_mysql_processlist", "查看 MySQL 当前活跃线程进程列表与慢执行语句",
			func(ctx context.Context, input *MysqlStatusInput) (any, error) {
				serverID, _, err := resolveMysqlTarget(mgrs.MysqlMgr, input.ServerID, "")
				if err != nil {
					return nil, err
				}
				return mgrs.MysqlMgr.MysqlProcessList(serverID)
			})
		if err == nil {
			bus.Register(&RegisteredTool{
				Name:        "db_mysql_processlist",
				Description: "查看 MySQL 当前活跃线程进程列表与慢执行语句",
				BaseTool:    processlistTool,
				Level:       guard.LevelAllow,
			})
		}
	}

	// ---------- 3. MongoDB Tools ----------
	if mgrs.MongoMgr != nil {
		findTool, err := utils.InferTool("db_mongo_find", "查询 MongoDB 集合中的 JSON 文档",
			func(ctx context.Context, input *MongoFindInput) (any, error) {
				serverID, database, err := resolveMongoTarget(mgrs.MongoMgr, input.ServerID, input.Database)
				if err != nil {
					return nil, err
				}
				lim := input.Limit
				if lim <= 0 || lim > 50 {
					lim = 10
				}
				q := input.QueryJSON
				if q == "" {
					q = "{}"
				}
				return mgrs.MongoMgr.MongoFind(serverID, mongo.MongoQuerySpec{
					Database:   database,
					Collection: input.Collection,
					Filter:     q,
					Limit:      lim,
				})
			})
		if err == nil {
			bus.Register(&RegisteredTool{
				Name:        "db_mongo_find",
				Description: "查询 MongoDB 集合中的 JSON 文档",
				BaseTool:    findTool,
				Level:       guard.LevelAllow,
			})
		}

		aggregateTool, err := utils.InferTool("db_mongo_aggregate", "执行 MongoDB 聚合分析管道 (Aggregate Pipeline)",
			func(ctx context.Context, input *MongoAggregateInput) (any, error) {
				serverID, database, err := resolveMongoTarget(mgrs.MongoMgr, input.ServerID, input.Database)
				if err != nil {
					return nil, err
				}
				return mgrs.MongoMgr.MongoAggregate(serverID, database, input.Collection, input.PipelineJSON, false, 10000)
			})
		if err == nil {
			bus.Register(&RegisteredTool{
				Name:        "db_mongo_aggregate",
				Description: "执行 MongoDB 聚合分析管道 (Aggregate Pipeline)",
				BaseTool:    aggregateTool,
				Level:       guard.LevelAllow,
			})
		}

		mongoHealthTool, err := utils.InferTool("db_mongo_health", "检查 MongoDB 服务器健康状态与连接延迟",
			func(ctx context.Context, input *MongoHealthInput) (any, error) {
				serverID, _, err := resolveMongoTarget(mgrs.MongoMgr, input.ServerID, "")
				if err != nil {
					return nil, err
				}
				return mgrs.MongoMgr.MongoHealthCheck(serverID)
			})
		if err == nil {
			bus.Register(&RegisteredTool{
				Name:        "db_mongo_health",
				Description: "检查 MongoDB 服务器健康状态与连接延迟",
				BaseTool:    mongoHealthTool,
				Level:       guard.LevelAllow,
			})
		}
	}

	// ---------- 4. SQLite Tools ----------
	if mgrs.SqliteMgr != nil {
		sqliteTablesTool, err := utils.InferTool("db_sqlite_list_tables", "列出已打开的 SQLite 数据库中的所有数据表与视图列表",
			func(ctx context.Context, input *SqliteTablesInput) (any, error) {
				fileID, err := resolveSqliteFileID(mgrs.SqliteMgr, input.FileID)
				if err != nil {
					return nil, err
				}
				return mgrs.SqliteMgr.SqliteTables(fileID)
			})
		if err == nil {
			bus.Register(&RegisteredTool{
				Name:        "db_sqlite_list_tables",
				Description: "列出已打开的 SQLite 数据库中的所有数据表与视图列表",
				BaseTool:    sqliteTablesTool,
				Level:       guard.LevelAllow,
			})
		}

		sqliteSchemaTool, err := utils.InferTool("db_sqlite_schema", "查看 SQLite 数据库的表结构、字段类型与外键关系 (ER图数据)",
			func(ctx context.Context, input *SqliteSchemaInput) (any, error) {
				fileID, err := resolveSqliteFileID(mgrs.SqliteMgr, input.FileID)
				if err != nil {
					return nil, err
				}
				return mgrs.SqliteMgr.SqliteSchema(fileID)
			})
		if err == nil {
			bus.Register(&RegisteredTool{
				Name:        "db_sqlite_schema",
				Description: "查看 SQLite 数据库的表结构、字段类型与外键关系 (ER图数据)",
				BaseTool:    sqliteSchemaTool,
				Level:       guard.LevelAllow,
			})
		}

		sqliteTool, err := utils.InferTool("db_sqlite_query", "执行 SQLite 数据库 SQL 语句 (支持 SELECT/PRAGMA/INSERT/UPDATE/DELETE/DDL 等读写操作)",
			func(ctx context.Context, input *SqliteQueryInput) (any, error) {
				cleanSQL := strings.TrimSpace(input.SQL)
				if cleanSQL == "" {
					return nil, fmt.Errorf("SQL 语句不能为空")
				}
				fileID, err := resolveSqliteFileID(mgrs.SqliteMgr, input.FileID)
				if err != nil {
					return nil, err
				}
				return mgrs.SqliteMgr.SqliteRun(fileID, cleanSQL)
			})
		if err == nil {
			bus.Register(&RegisteredTool{
				Name:        "db_sqlite_query",
				Description: "执行 SQLite 数据库 SQL 语句 (支持 SELECT/PRAGMA/INSERT/UPDATE/DELETE/DDL 等读写操作)",
				BaseTool:    sqliteTool,
				Level:       guard.LevelAllow,
			})
		}
	}

	// ---------- 5. PostgreSQL Tools ----------
	if mgrs.PostgresMgr != nil {
		pgDatabasesTool, err := utils.InferTool("db_postgres_databases", "列出 PostgreSQL 服务器上的所有数据库名称",
			func(ctx context.Context, input *PostgresDatabasesInput) (any, error) {
				serverID, _, err := resolvePostgresTarget(mgrs.PostgresMgr, input.ServerID, "")
				if err != nil {
					return nil, err
				}
				return mgrs.PostgresMgr.PostgresDatabases(serverID)
			})
		if err == nil {
			bus.Register(&RegisteredTool{
				Name:        "db_postgres_databases",
				Description: "列出 PostgreSQL 服务器上的所有数据库名称",
				BaseTool:    pgDatabasesTool,
				Level:       guard.LevelAllow,
			})
		}

		pgTablesTool, err := utils.InferTool("db_postgres_tables", "列出 PostgreSQL 指定数据库和 Schema (默认 public) 中的所有数据表与视图列表",
			func(ctx context.Context, input *PostgresTablesInput) (any, error) {
				serverID, database, err := resolvePostgresTarget(mgrs.PostgresMgr, input.ServerID, input.Database)
				if err != nil {
					return nil, err
				}
				schema := strings.TrimSpace(input.Schema)
				if schema == "" {
					schema = "public"
				}
				return mgrs.PostgresMgr.PostgresTables(serverID, database, schema)
			})
		if err == nil {
			bus.Register(&RegisteredTool{
				Name:        "db_postgres_tables",
				Description: "列出 PostgreSQL 指定数据库和 Schema (默认 public) 中的所有数据表与视图列表",
				BaseTool:    pgTablesTool,
				Level:       guard.LevelAllow,
			})
		}

		pgQueryTool, err := utils.InferTool("db_postgres_query", "执行 PostgreSQL 数据库 SQL 语句 (支持 SELECT / INSERT / UPDATE / DELETE / DDL / EXPLAIN 等读写操作)",
			func(ctx context.Context, input *PostgresQueryInput) (any, error) {
				serverID, database, err := resolvePostgresTarget(mgrs.PostgresMgr, input.ServerID, input.Database)
				if err != nil {
					return nil, err
				}
				cleanSQL := strings.TrimSpace(input.SQL)
				if cleanSQL == "" {
					return nil, fmt.Errorf("SQL 语句不能为空")
				}
				return mgrs.PostgresMgr.PostgresRun(serverID, database, cleanSQL)
			})
		if err == nil {
			bus.Register(&RegisteredTool{
				Name:        "db_postgres_query",
				Description: "执行 PostgreSQL 数据库 SQL 语句 (支持 SELECT / INSERT / UPDATE / DELETE / DDL / EXPLAIN 等读写操作)",
				BaseTool:    pgQueryTool,
				Level:       guard.LevelAllow,
			})
		}
	}

	return nil
}
