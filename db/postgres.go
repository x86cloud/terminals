package db

import (
	"context"
	"errors"
	"fmt"
	"net"
	"net/url"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"terminal/core"

	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/ssh"
)

// ===================== 数据模型定义 =====================

// PostgresSessionInfo 暴露给前端的 PostgreSQL 连接会话元数据。
type PostgresSessionInfo struct {
	ID        string `json:"id"`
	ServerID  string `json:"serverId"`
	Title     string `json:"title"`
	Host      string `json:"host"`
	Port      int    `json:"port"`
	Database  string `json:"database"`
	Schema    string `json:"schema"`
	Connected bool   `json:"connected"`
}

// PostgresQueryResult 表示 SQL 执行的统一输出结构。
type PostgresQueryResult struct {
	Columns     []string         `json:"columns"`
	ColumnTypes []string         `json:"columnTypes"`
	Rows        []map[string]any `json:"rows"`
	Affected    int64            `json:"affected"`
	DurationMs  int64            `json:"durationMs"`
	Error       string           `json:"error,omitempty"`
}

// PgDatabase 描述 PostgreSQL 数据库。
type PgDatabase struct {
	Name       string `json:"name"`
	Owner      string `json:"owner"`
	Encoding   string `json:"encoding"`
	Collate    string `json:"collate"`
	Size       string `json:"size"`
	SizeBytes  int64  `json:"sizeBytes"`
	TableCount int    `json:"tableCount"`
}

// PgSchema 描述 PostgreSQL Schema 命名空间。
type PgSchema struct {
	Name          string `json:"name"`
	Owner         string `json:"owner"`
	TableCount    int    `json:"tableCount"`
	ViewCount     int    `json:"viewCount"`
	FunctionCount int    `json:"functionCount"`
}

// PgTable 描述 PostgreSQL 数据表或视图元数据。
type PgTable struct {
	Name       string `json:"name"`
	Schema     string `json:"schema"`
	Type       string `json:"type"` // BASE TABLE | VIEW | MATERIALIZED VIEW | FOREIGN TABLE | PARTITIONED TABLE
	RowCount   int64  `json:"rowCount"`
	TotalSize  string `json:"totalSize"`
	TableSize  string `json:"tableSize"`
	IndexSize  string `json:"indexSize"`
	Comment    string `json:"comment"`
}

// PgColumn 描述表字段详细定义。
type PgColumn struct {
	Name          string `json:"name"`
	OrdinalPos    int    `json:"ordinalPos"`
	DataType      string `json:"dataType"`
	UdtName       string `json:"udtName"`
	IsNullable    bool   `json:"isNullable"`
	DefaultVal    string `json:"defaultVal"`
	IsPrimaryKey  bool   `json:"isPrimaryKey"`
	IsForeignKey  bool   `json:"isForeignKey"`
	CharMaxLength int    `json:"charMaxLength,omitempty"`
	NumPrecision  int    `json:"numPrecision,omitempty"`
	NumScale      int    `json:"numScale,omitempty"`
	Comment       string `json:"comment"`
}

// PgIndex 描述表索引元数据。
type PgIndex struct {
	Name      string   `json:"name"`
	Table     string   `json:"table"`
	Schema    string   `json:"schema"`
	Def       string   `json:"def"`
	IsPrimary bool     `json:"isPrimary"`
	IsUnique  bool     `json:"isUnique"`
	Columns   []string `json:"columns"`
	Size      string   `json:"size"`
}

// PgConstraint 描述约束。
type PgConstraint struct {
	Name          string `json:"name"`
	Type          string `json:"type"` // PRIMARY KEY | FOREIGN KEY | UNIQUE | CHECK
	Def           string `json:"def"`
	ForeignTable  string `json:"foreignTable,omitempty"`
	ForeignSchema string `json:"foreignSchema,omitempty"`
	ForeignColumn string `json:"foreignColumn,omitempty"`
}

// PgSequence 描述序列。
type PgSequence struct {
	Name         string `json:"name"`
	Schema       string `json:"schema"`
	DataType     string `json:"dataType"`
	StartValue   int64  `json:"startValue"`
	MinValue     int64  `json:"minValue"`
	MaxValue     int64  `json:"maxValue"`
	Increment    int64  `json:"increment"`
	CurrentValue int64  `json:"currentValue"`
	LastValue    int64  `json:"lastValue"`
}

// PgFunction 描述存储过程与函数。
type PgFunction struct {
	Name       string   `json:"name"`
	Schema     string   `json:"schema"`
	ResultType string   `json:"resultType"`
	ArgTypes   string   `json:"argTypes"`
	ArgNames   []string `json:"argNames"`
	Language   string   `json:"language"`
	Def        string   `json:"def"`
	Comment    string   `json:"comment"`
	IsProc     bool     `json:"isProc"`
}

// PgSession 描述活跃会话（pg_stat_activity）。
type PgSession struct {
	Pid           int    `json:"pid"`
	User          string `json:"user"`
	Database      string `json:"database"`
	ClientAddr    string `json:"clientAddr"`
	ClientPort    int    `json:"clientPort"`
	BackendStart  string `json:"backendStart"`
	QueryStart    string `json:"queryStart"`
	StateChange   string `json:"stateChange"`
	WaitEventType string `json:"waitEventType"`
	WaitEvent     string `json:"waitEvent"`
	State         string `json:"state"`
	Query         string `json:"query"`
	DurationSec   int64  `json:"durationSec"`
}

// PgRole 描述数据库角色/用户。
type PgRole struct {
	Name        string `json:"name"`
	Super       bool   `json:"super"`
	Inherit     bool   `json:"inherit"`
	CreateRole  bool   `json:"createRole"`
	CreateDB    bool   `json:"createDb"`
	CanLogin    bool   `json:"canLogin"`
	Replication bool   `json:"replication"`
	ConnLimit   int    `json:"connLimit"`
	ValidUntil  string `json:"validUntil"`
	MemberOf    string `json:"memberOf"`
}

// PgStatus 描述数据库服务器健康与运行状态。
type PgStatus struct {
	Version           string `json:"version"`
	Uptime            string `json:"uptime"`
	ActiveConnections int    `json:"activeConnections"`
	MaxConnections    int    `json:"maxConnections"`
	DatabaseSize      string `json:"databaseSize"`
	CacheHitRatio     string `json:"cacheHitRatio"`
	TPS               int64  `json:"tps"`
	Deadlocks         int64  `json:"deadlocks"`
	TempFiles         int64  `json:"tempFiles"`
	TempBytes         string `json:"tempBytes"`
}

// ===================== PostgresManager 连接管理器 =====================

type PostgresManager struct {
	pools   sync.Map // key: "serverID:dbName" -> *pgxpool.Pool
	tunnels sync.Map // key: "serverID" -> *pgSshTunnel
	configs sync.Map // key: "serverID" -> core.ServerConfig
}

type pgSshTunnel struct {
	client *ssh.Client
	local  string
	l      net.Listener
}

func NewPostgresManager() *PostgresManager {
	return &PostgresManager{}
}

// openPgSSHTunnel 为 PostgreSQL 连接创建 SSH 端口转发隧道。
func openPgSSHTunnel(cfg core.ServerConfig, target string) (*pgSshTunnel, error) {
	auths := []ssh.AuthMethod{}
	if strings.TrimSpace(cfg.PostgresSSHKeyData) != "" {
		key := []byte(cfg.PostgresSSHKeyData)
		signer, err := ssh.ParsePrivateKeyWithPassphrase(key, []byte(cfg.PostgresSSHPassphrase))
		if err != nil {
			return nil, fmt.Errorf("解析 SSH 私钥失败: %w", err)
		}
		auths = append(auths, ssh.PublicKeys(signer))
	} else if strings.TrimSpace(cfg.PostgresSSHKeyPath) != "" {
		key, err := os.ReadFile(cfg.PostgresSSHKeyPath)
		if err != nil {
			return nil, fmt.Errorf("读取 SSH 私钥失败: %w", err)
		}
		signer, err := ssh.ParsePrivateKeyWithPassphrase(key, []byte(cfg.PostgresSSHPassphrase))
		if err != nil {
			return nil, fmt.Errorf("解析 SSH 私钥失败: %w", err)
		}
		auths = append(auths, ssh.PublicKeys(signer))
	} else if cfg.Password != "" {
		auths = append(auths, ssh.Password(cfg.Password))
	}

	sshUser := cfg.PostgresSSHUser
	if sshUser == "" {
		sshUser = cfg.Username
	}
	sshPort := cfg.PostgresSSHHostPort
	if sshPort <= 0 {
		sshPort = 22
	}

	sshAddr := fmt.Sprintf("%s:%d", cfg.PostgresSSHHost, sshPort)
	clientConfig := &ssh.ClientConfig{
		User:            sshUser,
		Auth:            auths,
		HostKeyCallback: ssh.InsecureIgnoreHostKey(),
		Timeout:         10 * time.Second,
	}

	sshClient, err := ssh.Dial("tcp", sshAddr, clientConfig)
	if err != nil {
		return nil, fmt.Errorf("连接跳板机 %s 失败: %w", sshAddr, err)
	}

	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		_ = sshClient.Close()
		return nil, fmt.Errorf("建立本地端口转发失败: %w", err)
	}

	tun := &pgSshTunnel{
		client: sshClient,
		local:  listener.Addr().String(),
		l:      listener,
	}

	go func() {
		for {
			conn, err := listener.Accept()
			if err != nil {
				return
			}
			go func(localConn net.Conn) {
				remoteConn, err := sshClient.Dial("tcp", target)
				if err != nil {
					_ = localConn.Close()
					return
				}
				go func() {
					buf := make([]byte, 32*1024)
					for {
						n, err := localConn.Read(buf)
						if n > 0 {
							_, _ = remoteConn.Write(buf[:n])
						}
						if err != nil {
							break
						}
					}
					_ = localConn.Close()
					_ = remoteConn.Close()
				}()
				buf := make([]byte, 32*1024)
				for {
					n, err := remoteConn.Read(buf)
					if n > 0 {
						_, _ = localConn.Write(buf[:n])
					}
					if err != nil {
						break
					}
				}
				_ = localConn.Close()
				_ = remoteConn.Close()
			}(conn)
		}
	}()

	return tun, nil
}

// buildPgConnString 构造 PostgreSQL 连接 URL。
func buildPgConnString(cfg core.ServerConfig, targetHost string, targetPort int, dbName string) string {
	user := url.QueryEscape(cfg.Username)
	pass := url.QueryEscape(cfg.Password)
	if dbName == "" {
		dbName = cfg.PostgresDatabase
	}
	if dbName == "" {
		dbName = "postgres"
	}

	sslMode := cfg.PostgresSSLMode
	if sslMode == "" {
		sslMode = "disable"
	}

	connTimeout := cfg.PostgresConnectTimeout
	if connTimeout <= 0 {
		connTimeout = 10
	}

	return fmt.Sprintf("postgres://%s:%s@%s:%d/%s?sslmode=%s&connect_timeout=%d",
		user, pass, targetHost, targetPort, url.PathEscape(dbName), sslMode, connTimeout)
}

// GetPool 获取或创建指定服务器和数据库的连接池。
func (m *PostgresManager) GetPool(serverID, dbName string) (*pgxpool.Pool, error) {
	if dbName == "" {
		dbName = "postgres"
	}
	poolKey := fmt.Sprintf("%s:%s", serverID, dbName)

	if val, ok := m.pools.Load(poolKey); ok {
		pool := val.(*pgxpool.Pool)
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		if err := pool.Ping(ctx); err == nil {
			return pool, nil
		}
		pool.Close()
		m.pools.Delete(poolKey)
	}

	cfgVal, ok := m.configs.Load(serverID)
	if !ok {
		return nil, fmt.Errorf("服务器配置未加载: %s", serverID)
	}
	cfg := cfgVal.(core.ServerConfig)

	host := cfg.Host
	port := cfg.Port
	if port <= 0 {
		port = 5432
	}

	if cfg.PostgresSSHEnabled && cfg.PostgresSSHHost != "" {
		tunVal, ok := m.tunnels.Load(serverID)
		var tun *pgSshTunnel
		if ok {
			tun = tunVal.(*pgSshTunnel)
		} else {
			target := fmt.Sprintf("%s:%d", host, port)
			var err error
			tun, err = openPgSSHTunnel(cfg, target)
			if err != nil {
				return nil, fmt.Errorf("建立 SSH 隧道失败: %w", err)
			}
			m.tunnels.Store(serverID, tun)
		}
		parts := strings.Split(tun.local, ":")
		host = parts[0]
		port, _ = strconv.Atoi(parts[1])
	}

	connStr := buildPgConnString(cfg, host, port, dbName)
	poolConfig, err := pgxpool.ParseConfig(connStr)
	if err != nil {
		return nil, fmt.Errorf("解析 PostgreSQL 连接串失败: %w", err)
	}

	maxConns := cfg.PostgresMaxOpenConns
	if maxConns <= 0 {
		maxConns = 20
	}
	minConns := cfg.PostgresMinIdleConns
	if minConns <= 0 {
		minConns = 2
	}
	poolConfig.MaxConns = int32(maxConns)
	poolConfig.MinConns = int32(minConns)
	if cfg.PostgresConnMaxLifetime > 0 {
		poolConfig.MaxConnLifetime = time.Duration(cfg.PostgresConnMaxLifetime) * time.Second
	}
	if cfg.PostgresConnMaxIdleTime > 0 {
		poolConfig.MaxConnIdleTime = time.Duration(cfg.PostgresConnMaxIdleTime) * time.Second
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	pool, err := pgxpool.NewWithConfig(ctx, poolConfig)
	if err != nil {
		return nil, fmt.Errorf("连接 PostgreSQL 失败: %w", err)
	}

	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("Ping PostgreSQL 失败: %w", err)
	}

	m.pools.Store(poolKey, pool)
	return pool, nil
}

// PostgresTestConnection 使用临时配置测试 PostgreSQL 连通性并返回网络延迟。
func (m *PostgresManager) PostgresTestConnection(cfg core.ServerConfig) (map[string]any, error) {
	host := cfg.Host
	port := cfg.Port
	if port <= 0 {
		port = 5432
	}
	if host == "" {
		return nil, fmt.Errorf("主机地址不能为空")
	}

	var tun *pgSshTunnel
	if cfg.PostgresSSHEnabled && cfg.PostgresSSHHost != "" {
		target := fmt.Sprintf("%s:%d", host, port)
		var err error
		tun, err = openPgSSHTunnel(cfg, target)
		if err != nil {
			return nil, fmt.Errorf("建立 SSH 隧道失败: %w", err)
		}
		defer func() {
			if tun != nil {
				_ = tun.l.Close()
				_ = tun.client.Close()
			}
		}()
		parts := strings.Split(tun.local, ":")
		host = parts[0]
		port, _ = strconv.Atoi(parts[1])
	}

	dbName := cfg.PostgresDatabase
	if dbName == "" {
		dbName = "postgres"
	}

	connStr := buildPgConnString(cfg, host, port, dbName)
	poolConfig, err := pgxpool.ParseConfig(connStr)
	if err != nil {
		return nil, fmt.Errorf("解析 PostgreSQL 连接串失败: %w", err)
	}
	poolConfig.MaxConns = 1
	poolConfig.MinConns = 0
	poolConfig.MaxConnLifetime = 5 * time.Second

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	start := time.Now()
	pool, err := pgxpool.NewWithConfig(ctx, poolConfig)
	if err != nil {
		return nil, fmt.Errorf("创建测试连接池失败: %w", err)
	}
	defer pool.Close()

	if err := pool.Ping(ctx); err != nil {
		return nil, fmt.Errorf("连接 PostgreSQL 失败: %w", err)
	}
	latency := time.Since(start).Milliseconds()
	return map[string]any{
		"connected": true,
		"pingMs":    latency,
	}, nil
}

// PostgresConnectEx 连接并测试 PostgreSQL 实例。
func (m *PostgresManager) PostgresConnectEx(cfg core.ServerConfig) (bool, error) {
	m.configs.Store(cfg.ID, cfg)
	dbName := cfg.PostgresDatabase
	if dbName == "" {
		dbName = "postgres"
	}
	_, err := m.GetPool(cfg.ID, dbName)
	if err != nil {
		return false, err
	}
	return true, nil
}

// PostgresCloseEx 断开并清理指定服务器的所有连接池与隧道。
func (m *PostgresManager) PostgresCloseEx(serverID string) {
	m.pools.Range(func(key, value any) bool {
		k := key.(string)
		if strings.HasPrefix(k, serverID+":") {
			if pool, ok := value.(*pgxpool.Pool); ok {
				pool.Close()
			}
			m.pools.Delete(k)
		}
		return true
	})

	if tunVal, ok := m.tunnels.Load(serverID); ok {
		if tun, ok := tunVal.(*pgSshTunnel); ok {
			_ = tun.l.Close()
			_ = tun.client.Close()
		}
		m.tunnels.Delete(serverID)
	}

	m.configs.Delete(serverID)
}

// ListConnections 列出当前所有已建立连接的 PostgreSQL 数据库实例。
func (m *PostgresManager) ListConnections() []map[string]any {
	list := make([]map[string]any, 0)
	m.configs.Range(func(key, value any) bool {
		if cfg, ok := value.(core.ServerConfig); ok {
			list = append(list, map[string]any{
				"id":       cfg.ID,
				"name":     cfg.Name,
				"host":     cfg.Host,
				"port":     cfg.Port,
				"database": cfg.PostgresDatabase,
				"user":     cfg.Username,
			})
		}
		return true
	})
	return list
}

// ResolveID 根据 serverID 或别名解析目标 PostgreSQL 连接 ID。
func (m *PostgresManager) ResolveID(idOrName string) (string, error) {
	trimmed := strings.TrimSpace(idOrName)
	if trimmed != "" {
		if _, ok := m.configs.Load(trimmed); ok {
			return trimmed, nil
		}
		var foundID string
		m.configs.Range(func(key, value any) bool {
			if cfg, ok := value.(core.ServerConfig); ok {
				if strings.EqualFold(cfg.Name, trimmed) || strings.EqualFold(cfg.Host, trimmed) || strings.EqualFold(cfg.ID, trimmed) {
					foundID = cfg.ID
					return false
				}
			}
			return true
		})
		if foundID != "" {
			return foundID, nil
		}
	}
	var ids []string
	m.configs.Range(func(key, value any) bool {
		if id, ok := key.(string); ok {
			ids = append(ids, id)
		}
		return true
	})
	if len(ids) == 1 {
		return ids[0], nil
	}
	if len(ids) == 0 {
		return "", errors.New("当前暂无已连通的 PostgreSQL 数据库连接，请先在 PostgreSQL 界面中连接数据库")
	}
	return "", fmt.Errorf("存在多个活跃的 PostgreSQL 连接，请指定明确的 server_id (当前活跃连接数: %d)", len(ids))
}

// normalizePgVal 转换 PostgreSQL 数据值为前端 JSON 安全格式。
func normalizePgVal(v any) any {
	if v == nil {
		return nil
	}
	switch t := v.(type) {
	case []byte:
		return string(t)
	case time.Time:
		return t.Format("2006-01-02 15:04:05.000000-07")
	case fmt.Stringer:
		return t.String()
	default:
		return v
	}
}

// ===================== 核心元数据查询 =====================

// PostgresDatabases 获取所有可访问数据库列表。
func (m *PostgresManager) PostgresDatabases(serverID string) ([]PgDatabase, error) {
	pool, err := m.GetPool(serverID, "postgres")
	if err != nil {
		return nil, err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	query := `
		SELECT 
			d.datname,
			COALESCE(pg_catalog.pg_get_userbyid(d.datdba), '') AS owner,
			COALESCE(pg_catalog.pg_encoding_to_char(d.encoding), '') AS encoding,
			COALESCE(d.datcollate, '') AS collate,
			'' AS size,
			0::bigint AS size_bytes
		FROM pg_catalog.pg_database d
		WHERE d.datistemplate = false
		ORDER BY d.datname ASC;
	`

	rows, err := pool.Query(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("获取数据库列表失败: %w", err)
	}
	defer rows.Close()

	var result []PgDatabase
	for rows.Next() {
		var db PgDatabase
		if err := rows.Scan(&db.Name, &db.Owner, &db.Encoding, &db.Collate, &db.Size, &db.SizeBytes); err != nil {
			continue
		}
		result = append(result, db)
	}
	return result, nil
}

// PostgresSchemas 获取指定数据库下的所有 Schema 命名空间。
func (m *PostgresManager) PostgresSchemas(serverID, dbName string) ([]PgSchema, error) {
	pool, err := m.GetPool(serverID, dbName)
	if err != nil {
		return nil, err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	query := `
		SELECT 
			n.nspname AS schema_name,
			COALESCE(r.rolname, '') AS owner,
			COALESCE(t.table_count, 0) AS table_count,
			COALESCE(t.view_count, 0) AS view_count,
			COALESCE(p.function_count, 0) AS function_count
		FROM pg_catalog.pg_namespace n
		LEFT JOIN pg_catalog.pg_roles r ON r.oid = n.nspowner
		LEFT JOIN (
			SELECT 
				relnamespace,
				count(1) FILTER (WHERE relkind IN ('r', 'p', 'f')) AS table_count,
				count(1) FILTER (WHERE relkind IN ('v', 'm')) AS view_count
			FROM pg_catalog.pg_class
			GROUP BY relnamespace
		) t ON t.relnamespace = n.oid
		LEFT JOIN (
			SELECT 
				pronamespace,
				count(1) AS function_count
			FROM pg_catalog.pg_proc
			GROUP BY pronamespace
		) p ON p.pronamespace = n.oid
		WHERE n.nspname NOT LIKE 'pg_toast%'
		ORDER BY 
			CASE WHEN n.nspname = 'public' THEN 0 ELSE 1 END,
			n.nspname ASC;
	`

	rows, err := pool.Query(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("获取 Schema 列表失败: %w", err)
	}
	defer rows.Close()

	var result []PgSchema
	for rows.Next() {
		var s PgSchema
		if err := rows.Scan(&s.Name, &s.Owner, &s.TableCount, &s.ViewCount, &s.FunctionCount); err != nil {
			continue
		}
		result = append(result, s)
	}
	return result, nil
}

// PostgresTables 获取指定 Schema 下的所有表与视图。
func (m *PostgresManager) PostgresTables(serverID, dbName, schema string) ([]PgTable, error) {
	pool, err := m.GetPool(serverID, dbName)
	if err != nil {
		return nil, err
	}
	if schema == "" {
		schema = "public"
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	query := `
		SELECT
			c.relname AS table_name,
			n.nspname AS schema_name,
			CASE c.relkind
				WHEN 'r' THEN 'BASE TABLE'
				WHEN 'v' THEN 'VIEW'
				WHEN 'm' THEN 'MATERIALIZED VIEW'
				WHEN 'f' THEN 'FOREIGN TABLE'
				WHEN 'p' THEN 'PARTITIONED TABLE'
				ELSE 'OTHER'
			END AS table_type,
			GREATEST(0, c.reltuples::bigint) AS row_count,
			'' AS total_size,
			'' AS table_size,
			'' AS index_size,
			'' AS comment
		FROM pg_catalog.pg_class c
		JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
		WHERE n.nspname = $1
		  AND c.relkind IN ('r', 'v', 'm', 'f', 'p')
		ORDER BY c.relname ASC;
	`

	rows, err := pool.Query(ctx, query, schema)
	if err != nil {
		return nil, fmt.Errorf("获取表列表失败: %w", err)
	}
	defer rows.Close()

	var result []PgTable
	for rows.Next() {
		var t PgTable
		if err := rows.Scan(&t.Name, &t.Schema, &t.Type, &t.RowCount, &t.TotalSize, &t.TableSize, &t.IndexSize, &t.Comment); err != nil {
			continue
		}
		if t.RowCount < 0 {
			t.RowCount = 0
		}
		result = append(result, t)
	}
	return result, nil
}

// PostgresSequences 获取指定 Schema 下的所有序列。
func (m *PostgresManager) PostgresSequences(serverID, dbName, schema string) ([]PgSequence, error) {
	pool, err := m.GetPool(serverID, dbName)
	if err != nil {
		return nil, err
	}
	if schema == "" {
		schema = "public"
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	query := `
		SELECT
			c.relname AS sequence_name,
			n.nspname AS schema_name,
			s.seqtypid::regtype::text AS data_type,
			s.seqstart AS start_value,
			s.seqmin AS min_value,
			s.seqmax AS max_value,
			s.seqincrement AS increment
		FROM pg_catalog.pg_sequence s
		JOIN pg_catalog.pg_class c ON c.oid = s.seqrelid
		JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
		WHERE n.nspname = $1
		ORDER BY c.relname ASC;
	`

	rows, err := pool.Query(ctx, query, schema)
	if err != nil {
		return nil, fmt.Errorf("获取序列列表失败: %w", err)
	}
	defer rows.Close()

	var result []PgSequence
	for rows.Next() {
		var s PgSequence
		if err := rows.Scan(&s.Name, &s.Schema, &s.DataType, &s.StartValue, &s.MinValue, &s.MaxValue, &s.Increment); err != nil {
			continue
		}
		result = append(result, s)
	}
	return result, nil
}

// PostgresFunctions 获取指定 Schema 下的所有函数与存储过程。
func (m *PostgresManager) PostgresFunctions(serverID, dbName, schema string) ([]PgFunction, error) {
	pool, err := m.GetPool(serverID, dbName)
	if err != nil {
		return nil, err
	}
	if schema == "" {
		schema = "public"
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	query := `
		SELECT
			p.proname AS func_name,
			n.nspname AS schema_name,
			pg_catalog.pg_get_function_result(p.oid) AS result_type,
			pg_catalog.pg_get_function_arguments(p.oid) AS arg_types,
			l.lanname AS language,
			COALESCE(pg_catalog.pg_get_functiondef(p.oid), '') AS def,
			COALESCE(pg_catalog.obj_description(p.oid, 'pg_proc'), '') AS comment,
			p.prokind = 'p' AS is_proc
		FROM pg_catalog.pg_proc p
		JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
		JOIN pg_catalog.pg_language l ON l.oid = p.prolang
		WHERE n.nspname = $1
		ORDER BY p.proname ASC;
	`

	rows, err := pool.Query(ctx, query, schema)
	if err != nil {
		return nil, fmt.Errorf("获取函数列表失败: %w", err)
	}
	defer rows.Close()

	var result []PgFunction
	for rows.Next() {
		var f PgFunction
		if err := rows.Scan(&f.Name, &f.Schema, &f.ResultType, &f.ArgTypes, &f.Language, &f.Def, &f.Comment, &f.IsProc); err != nil {
			continue
		}
		result = append(result, f)
	}
	return result, nil
}
