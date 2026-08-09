export type AuthType = 'password' | 'key'
export type ConnType = 'ssh' | 'redis' | 'mysql' | 'mqtt' | 'mongo' | 'sqlite'

export interface ServerGroup {
    id: string
    name: string
}

export interface ServerConfig {
    id: string
    name: string
    groupId?: string
    host: string
    port: number
    username: string
    authType: AuthType
    password: string
    privateKey: string
    passphrase: string
    remark: string
    type?: ConnType
    db?: number
    // Redis 高级配置
    redisMode?: string
    redisSentinels?: string
    redisMasterName?: string
    redisClusterNodes?: string
    redisUsername?: string
    redisSerialization?: string
    redisPoolSize?: number
    redisMinIdleConns?: number
    redisMaxIdleConns?: number
    redisPoolTimeout?: number
    redisConnMaxIdleTime?: number
    redisConnMaxLifetime?: number
    redisDialTimeout?: number
    redisReadTimeout?: number
    redisWriteTimeout?: number
    redisMaxRetries?: number
    redisMinRetryBackoff?: number
    redisMaxRetryBackoff?: number
    redisBreakerThreshold?: number
    redisBreakerCooldown?: number
    database?: string
    clientId?: string
    useTLS?: boolean
    // MQTT 高级配置
    mqttProto?: string
    mqttKeepAlive?: number
    mqttConnectTimeout?: number
    mqttCleanSession?: boolean
    mqttAutoReconnect?: boolean
    mqttReconnectIntvl?: number
    mqttInsecure?: boolean
    mqttCACert?: string
    mqttClientCert?: string
    mqttClientKey?: string
    mqttWillTopic?: string
    mqttWillPayload?: string
    mqttWillQos?: number
    mqttWillRetained?: boolean
    // MySQL 高级配置
    mysqlMaxOpenConns?: number
    mysqlMaxIdleConns?: number
    mysqlConnMaxLifetime?: number
    mysqlTLS?: string
    mysqlSSLEnabled?: boolean
    mysqlSSHEnabled?: boolean
    mysqlSSHHost?: string
    mysqlSSHHostPort?: number
    mysqlSSHUser?: string
    mysqlSSHKeyPath?: string
    mysqlSSHKeyData?: string
    mysqlSSHPassphrase?: string
    mysqlSSHProxyLocalPort?: number
    // MongoDB 高级配置
    mongoUri?: string
    mongoSrv?: boolean
    mongoHosts?: string
    mongoDatabase?: string
    mongoAuthMech?: string
    mongoAuthSource?: string
    mongoReplicaSet?: string
    mongoReadPreference?: string
    mongoTlsEnabled?: boolean
    mongoTlsInsecure?: boolean
    mongoTlsCaCert?: string
    mongoTlsClientCert?: string
    mongoTlsClientKey?: string
    mongoMaxPoolSize?: number
    mongoMinPoolSize?: number
    mongoMaxConnIdleTime?: number
    mongoConnectTimeout?: number
    mongoServerSelectTimeout?: number
    mongoSocketTimeout?: number
    mongoCompressors?: string
    mongoAppName?: string
    // SQLite 本地文件配置
    sqlitePath?: string
    updatedAt: number
}

export interface SessionInfo {
    id: string
    serverId: string
    title: string
    host: string
    port: number
    username: string
    connected: boolean
    homeDir: string
}

export interface FileItem {
    name: string
    path: string
    isDir: boolean
    isLink: boolean
    size: number
    mode: string
    modTime: number
}

export interface DirListing {
    path: string
    parent: string
    items: FileItem[]
}

export type TransferStatus = 'running' | 'done' | 'error' | 'canceled'

export interface Transfer {
    id: string
    sessionId: string
    kind: 'upload' | 'download'
    name: string
    localPath: string
    remotePath: string
    size: number
    transferred: number
    status: TransferStatus
    error: string
    startedAt: number
    updatedAt: number
}

export function emptyServer(): ServerConfig {
    return {
        id: '',
        name: '',
        host: '',
        port: 22,
        username: 'root',
        authType: 'password',
        password: '',
        privateKey: '',
        passphrase: '',
        remark: '',
        type: 'ssh',
        db: 0,
        // MQTT 高级参数默认值
        mqttProto: '3.1.1',
        mqttKeepAlive: 30,
        mqttConnectTimeout: 10,
        mqttCleanSession: true,
        mqttAutoReconnect: true,
        mqttReconnectIntvl: 5,
        mqttInsecure: false,
        mqttCACert: '',
        mqttClientCert: '',
        mqttClientKey: '',
        mqttWillTopic: '',
        mqttWillPayload: '',
        mqttWillQos: 0,
        mqttWillRetained: false,
        // MySQL 高级参数默认值
        mysqlMaxOpenConns: 10,
        mysqlMaxIdleConns: 5,
        mysqlConnMaxLifetime: 3600,
        mysqlTLS: '',
        mysqlSSLEnabled: false,
        mysqlSSHEnabled: false,
        mysqlSSHHost: '',
        mysqlSSHHostPort: 22,
        mysqlSSHUser: '',
        mysqlSSHKeyPath: '',
        mysqlSSHKeyData: '',
        mysqlSSHPassphrase: '',
        mysqlSSHProxyLocalPort: 13306,
        // MongoDB 高级参数默认值
        mongoUri: '',
        mongoSrv: false,
        mongoHosts: '',
        mongoDatabase: '',
        mongoAuthMech: 'SCRAM-SHA-256',
        mongoAuthSource: 'admin',
        mongoReplicaSet: '',
        mongoReadPreference: 'primary',
        mongoTlsEnabled: false,
        mongoTlsInsecure: false,
        mongoTlsCaCert: '',
        mongoTlsClientCert: '',
        mongoTlsClientKey: '',
        mongoMaxPoolSize: 100,
        mongoMinPoolSize: 0,
        mongoMaxConnIdleTime: 0,
        mongoConnectTimeout: 10,
        mongoServerSelectTimeout: 10,
        mongoSocketTimeout: 30,
        mongoCompressors: '',
        mongoAppName: 'xClient',
        updatedAt: 0,
    }
}

/* ---------------- Redis ---------------- */

export type RedisValueType = 'string' | 'list' | 'set' | 'hash' | 'zset' | 'stream'

export interface RedisKeysResult {
    cursor: string
    keys: string[]
}

export interface RedisValue {
    type: RedisValueType
    value: any
    ttl: number
}

export interface RedisSessionInfo {
    id: string
    serverId: string
    title: string
    host: string
    port: number
    connected: boolean
    db: number
    dbSize: number
    mode?: string        // single | sentinel | cluster
    breaker?: string     // closed | open | half-open
    serialization?: string
}

export type RedisMode = 'single' | 'sentinel' | 'cluster'
export type RedisSerialization = 'none' | 'json'

export interface RedisConfig {
    mode: RedisMode
    sentinels: string
    masterName: string
    clusterNodes: string
    username: string
    serialization: RedisSerialization
    poolSize: number
    minIdleConns: number
    maxIdleConns: number
    poolTimeout: number
    connMaxIdleTime: number
    connMaxLifetime: number
    dialTimeout: number
    readTimeout: number
    writeTimeout: number
    maxRetries: number
    minRetryBackoff: number
    maxRetryBackoff: number
    breakerThreshold: number
    breakerCooldown: number
}

export interface RedisCmdResult {
    result: string
    error: string
}

export interface RedisPipelineResult {
    results: RedisCmdResult[]
    error: string
}

export interface RedisTransactionResult {
    results: RedisCmdResult[]
    aborted: boolean
    error: string
}

export interface RedisPubsubMessage {
    channel: string
    pattern: string
    payload: string
}

export interface RedisKeyspaceMessage {
    channel: string
    key: string
    event: string
    payload: string
}

export interface RedisMonitorInfo {
    breaker: string
    hits: number
    misses: number
    timeouts: number
    totalConns: number
    idleConns: number
    staleConns: number
    mode: string
    serialization: string
}

export interface RedisSlowLogEntry {
    id: number
    timestamp: number
    duration: number
    command: string
    client: string
}

export interface RedisQueueItem {
    id: string
    payload: any
    empty?: boolean
}

export function emptyRedis(): RedisSessionInfo {
    return {
        id: '',
        serverId: '',
        title: '',
        host: '',
        port: 6379,
        connected: false,
        db: 0,
        dbSize: 0,
        mode: 'single',
        breaker: 'closed',
        serialization: 'none',
    }
}

/* ---------------- MySQL ---------------- */

export interface MysqlSessionInfo {
    id: string
    serverId: string
    title: string
    host: string
    port: number
    connected: boolean
    database: string
}

export function emptyMysql(): MysqlSessionInfo {
    return {
        id: '',
        serverId: '',
        title: '',
        host: '',
        port: 3306,
        connected: false,
        database: '',
    }
}

export interface MqttSessionInfo {
    id: string
    serverId: string
    host: string
    port: number
    username: string
    clientId: string
    connected: boolean
}

export function emptyMqtt(): MqttSessionInfo {
    return {id: '', serverId: '', host: '', port: 0, username: '', clientId: '', connected: false}
}

export interface MqttMessage {
    dir: 'in' | 'out'
    topic: string
    payload: string
    qos: number
    retained: boolean
    ts: number
}

export interface MqttSubscription {
    topic: string
    qos: number
}

/* ----------------------------- API 调试工具 ----------------------------- */

export type ApiMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS'

export interface ApiHeader {
    name: string
    value: string
    enabled: boolean
}

export interface ApiAuth {
    type: 'none' | 'basic' | 'bearer'
    username: string
    password: string
    token: string
}

export interface ApiRequest {
    method: ApiMethod
    url: string
    headers: ApiHeader[]
    body: string
    timeoutMs: number
    insecureTLS: boolean
    followRedirects: boolean
    auth: ApiAuth
}

export interface ApiResponse {
    status: string
    statusCode: number
    proto: string
    headers: Record<string, string>
    body: string
    durationMs: number
    size: number
    error: string
}

export interface ApiHistoryItem {
    method: ApiMethod
    url: string
    statusCode: number
    durationMs: number
    at: number
    error: string
}

export type ApiMode = 'http' | 'ws'

export type WsStatus = 'idle' | 'connecting' | 'open' | 'closed' | 'error'

export interface WsConnectResult {
    id: string
    url: string
    status: string
    error: string
}

export interface WsMessage {
    dir: 'in' | 'out' | 'sys'
    payload: string
    type: 'text' | 'binary' | 'system'
    ts: number
    error?: string
}

export interface MysqlQueryResult {
    columns: string[]
    rows: Record<string, any>[]
    rowCount: number
    affected: number
}

export interface MysqlIndexInfo {
    Table: string
    Non_unique: number
    Key_name: string
    Column_name: string
    Seq_in_index: number
    Index_type: string
}

export interface MysqlUserInfo {
    User: string
    Host: string
    locked: any
    expired: any
}

export interface MysqlSchemaTable {
    name: string
    columns: { name: string; type: string; key: string }[]
}

export interface MysqlForeignKey {
    fromTable: string
    fromColumn: any
    toTable: string
    toColumn: any
    name: any
}

export interface MysqlSchema {
    tables: MysqlSchemaTable[]
    foreignKeys: MysqlForeignKey[]
}

/* ---------------- MongoDB ---------------- */

export interface MongoSessionInfo {
    id: string
    serverId: string
    title: string
    host: string
    port: number
    connected: boolean
    database: string
    topology: string
    version: string
}

export function emptyMongo(): MongoSessionInfo {
    return {
        id: '',
        serverId: '',
        title: '',
        host: '',
        port: 27017,
        connected: false,
        database: '',
        topology: '',
        version: '',
    }
}

// 连接字符串解析结果
export interface MongoURIInfo {
    scheme: string
    hosts: string[]
    username: string
    password: string
    database: string
    authSource: string
    authMech: string
    replicaSet: string
    tls: boolean
    srv: boolean
    options: Record<string, string>
}

// 健康检查 / 探活
export interface MongoHealthInfo {
    ok: boolean
    latencyMs: number
    topology?: string
    version?: string
    primary?: boolean
    setName?: string
    isWritablePrimary?: boolean
    hosts?: string[]
    error?: string
}

// 数据库 / 集合条目
export interface MongoDatabaseInfo {
    name: string
    sizeOnDisk: number
    empty: boolean
}

export interface MongoCollectionInfo {
    name: string
    type: string
    hasValidator?: boolean
    capped?: boolean
}

export interface MongoCollectionStats {
    count: number
    size: number
    avgObjSize: number
    storageSize: number
    totalIndexSize: number
    nindexes: number
}

// 查询构建器
export interface MongoQuerySpec {
    database: string
    collection: string
    filter: string
    projection: string
    sort: string
    limit: number
    skip: number
    hint: string
    collation: string
}

export interface MongoFindResult {
    documents: string[]
    count: number
    total: number
    durationMs: number
}

// 数据模型映射（Schema 推断）
export interface MongoFieldInfo {
    field: string
    type: string
    types: string[]
    count: number
    presence: number
    required: boolean
}

// Schema 验证
export interface MongoValidatorInfo {
    validator: string
    validationLevel: string
    validationAction: string
}

export interface MongoValidationResult {
    valid: boolean
    error?: string
}

// 索引
export interface MongoIndexInfo {
    name: string
    key: string
    unique: boolean
    sparse: boolean
    expireAfterSeconds?: number
    partialFilterExpression?: string
}

// 聚合 / 命令
export interface MongoAggregateResult {
    documents: string[]
    count: number
    durationMs: number
}

// 批量写
export interface MongoBulkOp {
    type: 'insert' | 'update' | 'updateMany' | 'replace' | 'delete' | 'deleteMany'
    filter: string
    document: string
    upsert: boolean
}

export interface MongoBulkResult {
    requested: number
    inserted: number
    matched: number
    modified: number
    deleted: number
    upserted: number
    error?: string
}

// 事务
export interface MongoTxOp {
    type: 'insert' | 'update' | 'updateMany' | 'replace' | 'delete' | 'deleteMany'
    database: string
    collection: string
    filter: string
    document: string
    upsert: boolean
}

export interface MongoTxResult {
    results: Array<Record<string, any>>
    committed: boolean
    durationMs: number
    error?: string
}

// 性能监控
export interface MongoServerStatus {
    host: string
    version: string
    uptime: number
    process: string
    connections?: any
    network?: any
    opcounters?: any
    mem?: any
    globalLock?: any
    client: {
        ops: number
        failures: number
        slowOps: number
        avgMs: number
        totalMs: number
    }
}

// 变更流事件
export interface MongoChangeEvent {
    watchKey: string
    operation: string
    ns: string
    document: string
    ts: number
    error?: string
}

/* ---------------- SQLite ---------------- */

export interface SqliteSessionInfo {
    id: string
    serverId: string
    title: string
    path: string
    connected: boolean
    size: number
}

export function emptySqlite(): SqliteSessionInfo {
    return {
        id: '',
        serverId: '',
        title: '',
        path: '',
        connected: false,
        size: 0,
    }
}

// 表/视图条目
export interface SqliteTableInfo {
    name: string
    type: string // table | view
}

// 列结构
export interface SqliteColumnInfo {
    cid: number
    name: string
    type: string
    notnull: number
    default: any
    pk: number
}

// 索引信息
export interface SqliteIndexInfo {
    seq: number
    name: string
    unique: number
    origin: string
    partial: string
}

export interface SqliteQueryResult {
    columns: string[]
    rows: Record<string, any>[]
    rowCount: number
    affected: number
}

export interface SqliteInfo {
    path: string
    size: number
}

export interface SqliteSchemaTable {
    name: string
    columns: { name: string; type: string; key: string }[]
}

export interface SqliteForeignKey {
    fromTable: string
    fromColumn: any
    toTable: string
    toColumn: any
    name: any
}

export interface SqliteSchema {
    tables: SqliteSchemaTable[]
    foreignKeys: SqliteForeignKey[]
}

export interface SSHDiskInfo {
    mount: string
    filesystem: string
    fsType: string
    total: number
    used: number
    available: number
    usagePercent: number
    isVirtual: boolean
}

export interface SSHCPUInfo {
    usagePercent: number
    cores: number
    loadAvg: number[]
}

export interface SSHMemInfo {
    total: number
    used: number
    free: number
    available: number
    usagePercent: number
    swapTotal: number
    swapUsed: number
}

export interface SSHNetInfo {
    name: string
    ip: string
    rxBytes: number
    txBytes: number
    isLoopback: boolean
    isVirtual: boolean
}

export interface SSHDashboardInfo {
    hostname: string
    os: string
    uptime: string
    cpu: SSHCPUInfo
    mem: SSHMemInfo
    disks: SSHDiskInfo[]
    nets: SSHNetInfo[]
}

export interface SSHProcessInfo {
    pid: number
    user: string
    cpu: number
    mem: number
    rss: number
    command: string
}

export interface SSHServiceInfo {
    name: string
    load: string
    active: string
    sub: string
    description: string
}

export interface SSHCronItem {
    id: string
    expression: string
    command: string
    enabled: boolean
    comment: string
}

export interface AppSettings {
    themeMode: 'light' | 'dark' | 'system'
    fontFamily: string
    fontSize: string
    autoConnect: boolean
    dbDefaultLimit: string
    globalFontFamily?: string
}
