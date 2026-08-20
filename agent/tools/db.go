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
	RedisMgr  *redis.RedisManager
	MysqlMgr  *db.MysqlManagerEx
	MongoMgr  *mongo.MongoManager
	SqliteMgr *db.SqliteManager
}

type EmptyInput struct{}

type RedisKeysInput struct {
	ServerID string `json:"server_id" jsonschema:"description=Redis 服务器连接 ID 或名称，若只有单一连接可留空"`
	Pattern  string `json:"pattern" jsonschema:"description=检索 Key 的匹配模式，例如 *、user:*，默认为 *"`
}

type RedisGetInput struct {
	ServerID string `json:"server_id" jsonschema:"description=Redis 服务器连接 ID 或名称，若只有单一连接可留空"`
	Key      string `json:"key" jsonschema:"description=要查询的目标 Key 名称"`
}

type RedisInfoInput struct {
	ServerID string `json:"server_id" jsonschema:"description=Redis 服务器连接 ID 或名称，若只有单一连接可留空"`
	Section  string `json:"section" jsonschema:"description=指定查询的 Info 段，例如 server、memory、clients、stats，留空则返回全部"`
}

type RedisSlowlogInput struct {
	ServerID string `json:"server_id" jsonschema:"description=Redis 服务器连接 ID 或名称，若只有单一连接可留空"`
	Limit    int    `json:"limit" jsonschema:"description=要读取的慢查询条数上限，默认 10"`
}

type MysqlQueryInput struct {
	ServerID string `json:"server_id" jsonschema:"description=MySQL 服务器连接 ID 或名称，若只有单一连接可留空"`
	Database string `json:"database" jsonschema:"description=目标数据库名称，若未指定可留空"`
	SQL      string `json:"sql" jsonschema:"description=要执行的只读 SQL 查询语句 (仅限 SELECT / SHOW / DESCRIBE / EXPLAIN)"`
}

type MysqlDatabasesInput struct {
	ServerID string `json:"server_id" jsonschema:"description=MySQL 服务器连接 ID 或名称，若只有单一连接可留空"`
}

type MysqlTablesInput struct {
	ServerID string `json:"server_id" jsonschema:"description=MySQL 服务器连接 ID 或名称，若只有单一连接可留空"`
	Database string `json:"database" jsonschema:"description=目标数据库名称"`
}

type MysqlSchemaInput struct {
	ServerID string `json:"server_id" jsonschema:"description=MySQL 服务器连接 ID 或名称，若只有单一连接可留空"`
	Database string `json:"database" jsonschema:"description=目标数据库名称"`
}

type MysqlStatusInput struct {
	ServerID string `json:"server_id" jsonschema:"description=MySQL 服务器连接 ID 或名称，若只有单一连接可留空"`
}

type MongoFindInput struct {
	ServerID   string `json:"server_id" jsonschema:"description=MongoDB 服务器连接 ID 或名称，若只有单一连接可留空"`
	Database   string `json:"database" jsonschema:"description=目标数据库名称"`
	Collection string `json:"collection" jsonschema:"description=目标集合名称"`
	QueryJSON  string `json:"query_json" jsonschema:"description=查询过滤条件的 JSON 字符串，例如 {\"status\": \"active\"}，留空则匹配全部"`
	Limit      int    `json:"limit" jsonschema:"description=查询返回文档数量上限，默认 10，最大 50"`
}

type MongoAggregateInput struct {
	ServerID     string `json:"server_id" jsonschema:"description=MongoDB 服务器连接 ID 或名称，若只有单一连接可留空"`
	Database     string `json:"database" jsonschema:"description=目标数据库名称"`
	Collection   string `json:"collection" jsonschema:"description=目标集合名称"`
	PipelineJSON string `json:"pipeline_json" jsonschema:"description=MongoDB 聚合管道阶段的 JSON 数组字符串，例如 [ {\"$match\": ...}, {\"$group\": ...} ]"`
}

type MongoHealthInput struct {
	ServerID string `json:"server_id" jsonschema:"description=MongoDB 服务器连接 ID 或名称，若只有单一连接可留空"`
}

type SqliteQueryInput struct {
	FileID string `json:"file_id" jsonschema:"description=已打开的 SQLite 文件会话 ID"`
	SQL    string `json:"sql" jsonschema:"description=只读 SQL 查询语句 (SELECT / SHOW / EXPLAIN)"`
}

func RegisterDatabaseTools(bus *ToolBus, mgrs DatabaseManagers) error {
	// ---------- 1. Redis Tools ----------
	if mgrs.RedisMgr != nil {
		listRedisConnsTool, err := utils.InferTool("db_redis_list_connections", "列出当前所有已建立连接的 Redis 数据库实例列表",
			func(ctx context.Context, input *EmptyInput) (any, error) {
				return mgrs.RedisMgr.ListConnections(), nil
			})
		if err == nil {
			bus.Register(&RegisteredTool{
				Name:        "db_redis_list_connections",
				Description: "列出当前所有已建立连接的 Redis 数据库实例列表",
				BaseTool:    listRedisConnsTool,
				Level:       guard.LevelAllow,
			})
		}

		keysTool, err := utils.InferTool("db_redis_keys", "基于 SCAN 分页查询 Redis 服务器中的键列表 (只读诊断)",
			func(ctx context.Context, input *RedisKeysInput) (any, error) {
				serverID, err := mgrs.RedisMgr.ResolveID(input.ServerID)
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
				serverID, err := mgrs.RedisMgr.ResolveID(input.ServerID)
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
				serverID, err := mgrs.RedisMgr.ResolveID(input.ServerID)
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
				serverID, err := mgrs.RedisMgr.ResolveID(input.ServerID)
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
	}

	// ---------- 2. MySQL Tools ----------
	if mgrs.MysqlMgr != nil {
		listMysqlConnsTool, err := utils.InferTool("db_mysql_list_connections", "列出当前所有已建立连接的 MySQL 数据库实例与会话信息",
			func(ctx context.Context, input *EmptyInput) (any, error) {
				return mgrs.MysqlMgr.ListConnections(), nil
			})
		if err == nil {
			bus.Register(&RegisteredTool{
				Name:        "db_mysql_list_connections",
				Description: "列出当前所有已建立连接的 MySQL 数据库实例与会话信息",
				BaseTool:    listMysqlConnsTool,
				Level:       guard.LevelAllow,
			})
		}

		mysqlDatabasesTool, err := utils.InferTool("db_mysql_databases", "列出 MySQL 服务器上的所有数据库名称",
			func(ctx context.Context, input *MysqlDatabasesInput) (any, error) {
				serverID, err := mgrs.MysqlMgr.ResolveID(input.ServerID)
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
				serverID, err := mgrs.MysqlMgr.ResolveID(input.ServerID)
				if err != nil {
					return nil, err
				}
				return mgrs.MysqlMgr.MysqlTables(serverID, input.Database)
			})
		if err == nil {
			bus.Register(&RegisteredTool{
				Name:        "db_mysql_tables",
				Description: "列出 MySQL 指定数据库中的所有数据表名称",
				BaseTool:    mysqlTablesTool,
				Level:       guard.LevelAllow,
			})
		}

		mysqlQueryTool, err := utils.InferTool("db_mysql_query_readonly", "执行只读 MySQL SELECT/SHOW/DESCRIBE/EXPLAIN 查询 (受 100 行上限与 10s 超时保护)",
			func(ctx context.Context, input *MysqlQueryInput) (any, error) {
				serverID, err := mgrs.MysqlMgr.ResolveID(input.ServerID)
				if err != nil {
					return nil, err
				}
				cleanSQL := strings.TrimSpace(input.SQL)
				if err := isStrictlyReadonlySQL(cleanSQL); err != nil {
					return nil, err
				}
				return mgrs.MysqlMgr.MysqlRun(serverID, input.Database, cleanSQL)
			})
		if err == nil {
			bus.Register(&RegisteredTool{
				Name:        "db_mysql_query_readonly",
				Description: "执行只读 MySQL SELECT/SHOW/DESCRIBE/EXPLAIN 查询 (受 100 行上限与 10s 超时保护)",
				BaseTool:    mysqlQueryTool,
				Level:       guard.LevelAllow,
			})
		}

		schemaTool, err := utils.InferTool("db_mysql_schema", "获取 MySQL 指定数据库的表结构与字段索引元信息",
			func(ctx context.Context, input *MysqlSchemaInput) (any, error) {
				serverID, err := mgrs.MysqlMgr.ResolveID(input.ServerID)
				if err != nil {
					return nil, err
				}
				return mgrs.MysqlMgr.MysqlSchema(serverID, input.Database)
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
				serverID, err := mgrs.MysqlMgr.ResolveID(input.ServerID)
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
				serverID, err := mgrs.MysqlMgr.ResolveID(input.ServerID)
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
		listMongoConnsTool, err := utils.InferTool("db_mongo_list_connections", "列出当前所有已建立连接的 MongoDB 数据库实例列表",
			func(ctx context.Context, input *EmptyInput) (any, error) {
				return mgrs.MongoMgr.ListConnections(), nil
			})
		if err == nil {
			bus.Register(&RegisteredTool{
				Name:        "db_mongo_list_connections",
				Description: "列出当前所有已建立连接的 MongoDB 数据库实例列表",
				BaseTool:    listMongoConnsTool,
				Level:       guard.LevelAllow,
			})
		}

		findTool, err := utils.InferTool("db_mongo_find", "查询 MongoDB 集合中的 JSON 文档",
			func(ctx context.Context, input *MongoFindInput) (any, error) {
				serverID, err := mgrs.MongoMgr.ResolveID(input.ServerID)
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
					Database:   input.Database,
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
				serverID, err := mgrs.MongoMgr.ResolveID(input.ServerID)
				if err != nil {
					return nil, err
				}
				return mgrs.MongoMgr.MongoAggregate(serverID, input.Database, input.Collection, input.PipelineJSON, false, 10000)
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
				serverID, err := mgrs.MongoMgr.ResolveID(input.ServerID)
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
		sqliteTool, err := utils.InferTool("db_sqlite_query_readonly", "执行只读 SQLite SELECT/SHOW 查询",
			func(ctx context.Context, input *SqliteQueryInput) (any, error) {
				return mgrs.SqliteMgr.SqliteRun(input.FileID, input.SQL)
			})
		if err == nil {
			bus.Register(&RegisteredTool{
				Name:        "db_sqlite_query_readonly",
				Description: "执行只读 SQLite SELECT/SHOW 查询",
				BaseTool:    sqliteTool,
				Level:       guard.LevelAllow,
			})
		}
	}

	return nil
}

func isStrictlyReadonlySQL(sqlText string) error {
	trimmed := strings.TrimSpace(sqlText)
	if trimmed == "" {
		return fmt.Errorf("SQL 查询语句不能为空")
	}
	parts := strings.Split(trimmed, ";")
	nonEmptyCount := 0
	for _, p := range parts {
		if strings.TrimSpace(p) != "" {
			nonEmptyCount++
		}
	}
	if nonEmptyCount > 1 {
		return fmt.Errorf("【安全拦截】只读工具每次仅允许执行单条 SQL 语句，禁止多语句拼接执行")
	}

	upper := strings.ToUpper(strings.TrimSpace(parts[0]))
	allowedPrefixes := []string{"SELECT", "SHOW", "DESCRIBE", "DESC", "EXPLAIN"}
	hasAllowedPrefix := false
	for _, prefix := range allowedPrefixes {
		if strings.HasPrefix(upper, prefix+" ") || upper == prefix {
			hasAllowedPrefix = true
			break
		}
	}
	if !hasAllowedPrefix {
		return fmt.Errorf("【安全拦截】只读 MySQL 工具仅允许 SELECT / SHOW / DESCRIBE / EXPLAIN 查询，检测到非法操作")
	}

	dangerousClauses := []string{"INTO OUTFILE", "INTO DUMPFILE", "LOAD DATA", "SLEEP(", "BENCHMARK("}
	for _, clause := range dangerousClauses {
		if strings.Contains(upper, clause) {
			return fmt.Errorf("【安全拦截】检测到高危或注入语句模式: %s", clause)
		}
	}
	return nil
}
