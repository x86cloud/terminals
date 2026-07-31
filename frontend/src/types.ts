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
        updatedAt: 0,
    }
}

/* ---------------- Redis ---------------- */

export type RedisValueType = 'string' | 'list' | 'set' | 'hash' | 'zset'

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

export interface MysqlQueryResult {
    columns: string[]
    rows: Record<string, any>[]
    rowCount: number
    affected: number
}
