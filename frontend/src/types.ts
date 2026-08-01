export type AuthType = 'password' | 'key'
export type ConnType = 'ssh' | 'redis' | 'mysql' | 'mqtt'

export interface ServerConfig {
    id: string
    name: string
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
