import { API } from '@/api'
import {
    ServerConfig,
    SessionInfo,
    RedisSessionInfo,
    MysqlSessionInfo,
    PostgresSessionInfo,
    MqttSessionInfo,
    MongoSessionInfo,
    SqliteSessionInfo,
    DockerSessionInfo,
    K8sSessionInfo,
    ConnType,
} from '@/types'

export async function connectK8sHelper(cfg: ServerConfig): Promise<K8sSessionInfo> {
    const ok = await API.k8sConnect(cfg.id)
    if (!ok) throw new Error('Kubernetes 集群连接失败')
    const target = cfg.k8sContext ? `Context: ${cfg.k8sContext}` : (cfg.k8sApiServer || cfg.host || 'Kubeconfig')
    return {
        id: cfg.id,
        serverId: cfg.id,
        title: cfg.name || (cfg.k8sContext ? `K8s (${cfg.k8sContext})` : `K8s (${target})`),
        apiServer: target,
        namespace: cfg.k8sNamespace || '_all',
        connected: true,
    }
}

export async function connectDockerHelper(cfg: ServerConfig): Promise<DockerSessionInfo> {
    const ok = await API.dockerConnect(cfg.id)
    if (!ok) throw new Error('Docker 守护进程连接失败')
    const epType = cfg.dockerEndpointType || 'unix'
    let target = cfg.dockerSocketPath || '/var/run/docker.sock'
    if (epType === 'tcp') {
        target = `${cfg.host}:${cfg.port || (cfg.dockerTlsEnabled ? 2376 : 2375)}`
    } else if (epType === 'ssh') {
        target = `ssh://${cfg.dockerSshUser || 'root'}@${cfg.dockerSshHost || cfg.host}:${cfg.dockerSshPort || 22}`
    }
    return {
        id: cfg.id,
        serverId: cfg.id,
        title: cfg.name || (epType === 'ssh' ? `Docker (${cfg.dockerSshHost || cfg.host})` : epType === 'tcp' ? `Docker (${cfg.host})` : 'Docker (Local Socket)'),
        endpointType: epType,
        target,
        connected: true,
    }
}

export async function connectRedisHelper(cfg: ServerConfig): Promise<RedisSessionInfo> {
    const ok = await API.redisConnect(cfg.id)
    if (!ok) throw new Error('Redis 连接失败')
    const dbSize = await API.redisDBSize(cfg.id).catch(() => 0)
    const modeInfo = await API.redisModeInfo(cfg.id).catch(() => ({} as any))
    return {
        id: cfg.id,
        serverId: cfg.id,
        title: cfg.name || `${cfg.host}:${cfg.port || 6379}`,
        host: cfg.host,
        port: cfg.port || 6379,
        connected: true,
        db: cfg.db ?? 0,
        dbSize,
        mode: modeInfo?.mode || cfg.redisMode || 'single',
        breaker: modeInfo?.breaker || 'closed',
        serialization: modeInfo?.serialization || cfg.redisSerialization || 'none',
    }
}

export async function connectMysqlHelper(cfg: ServerConfig): Promise<MysqlSessionInfo> {
    const ok = await API.mysqlConnectEx(cfg.id)
    if (!ok) throw new Error('MySQL 连接失败')
    return {
        id: cfg.id,
        serverId: cfg.id,
        title: cfg.name || `${cfg.host}:${cfg.port || 3306}`,
        host: cfg.host,
        port: cfg.port || 3306,
        connected: true,
        database: cfg.database || '',
    }
}

export async function connectPostgresHelper(cfg: ServerConfig): Promise<PostgresSessionInfo> {
    const ok = await API.postgresConnect(cfg.id)
    if (!ok) throw new Error('PostgreSQL 连接失败')
    return {
        id: cfg.id,
        serverId: cfg.id,
        title: cfg.name || `${cfg.host}:${cfg.port || 5432}`,
        host: cfg.host,
        port: cfg.port || 5432,
        connected: true,
        database: cfg.postgresDatabase || cfg.database || 'postgres',
        schema: cfg.postgresSchema || 'public',
    }
}

export async function connectMqttHelper(cfg: ServerConfig): Promise<MqttSessionInfo> {
    const ok = await API.mqttConnect(cfg.id)
    if (!ok) throw new Error('MQTT 连接失败')
    return {
        id: cfg.id,
        serverId: cfg.id,
        host: cfg.host,
        port: cfg.port || 1883,
        username: cfg.username,
        clientId: cfg.clientId || '',
        connected: true,
    }
}

export async function connectMongoHelper(cfg: ServerConfig): Promise<MongoSessionInfo> {
    const ok = await API.mongoConnect(cfg.id)
    if (!ok) throw new Error('MongoDB 连接失败')
    return {
        id: cfg.id,
        serverId: cfg.id,
        title: cfg.name || `${cfg.host}:${cfg.port || 27017}`,
        host: cfg.host,
        port: cfg.port || 27017,
        connected: true,
        database: cfg.mongoDatabase || '',
        topology: '',
        version: '',
    }
}

export async function connectSqliteHelper(cfg: ServerConfig): Promise<SqliteSessionInfo | null> {
    let path = cfg.sqlitePath || ''
    if (!path) {
        path = await API.sqliteOpenFile()
        if (!path) return null
    }
    const ok = await API.sqliteConnect(cfg.id, path)
    if (!ok) throw new Error('无法打开该 SQLite 文件')
    const stat = await API.sqliteInfo(cfg.id).catch(() => ({ path, size: 0 }))
    const finalPath = stat?.path || path
    const dbName = finalPath.split(/[\\/]/).pop() || finalPath
    const displayTitle = (cfg.name && !cfg.name.includes('/') && !cfg.name.includes('\\'))
        ? cfg.name
        : (cfg.name ? cfg.name.split(/[\\/]/).pop() : dbName)
    return {
        id: cfg.id,
        serverId: cfg.id,
        title: displayTitle || dbName,
        path: finalPath,
        connected: true,
        size: Number(stat?.size) || 0,
    }
}

export async function disconnectHelper(kind: ConnType, id: string): Promise<void> {
    try {
        switch (kind) {
            case 'ssh':
                await API.disconnect(id)
                break
            case 'docker':
                await API.dockerClose(id)
                break
            case 'k8s':
                await API.k8sClose(id)
                break
            case 'redis':
                await API.redisClose(id)
                break
            case 'mysql':
                await API.mysqlCloseEx(id)
                break
            case 'postgres':
                await API.postgresClose(id)
                break
            case 'mqtt':
                await API.mqttClose(id)
                break
            case 'mongo':
                await API.mongoClose(id)
                break
            case 'sqlite':
                await API.sqliteClose(id)
                break
        }
    } catch {
        /* ignore */
    }
}

export function pickFallback(
    kind: ConnType,
    sessionsMap: Record<ConnType, Array<{ id: string }>>
): { kind: ConnType; id: string } | null {
    const rest = (['ssh', 'docker', 'k8s', 'redis', 'mysql', 'postgres', 'mqtt', 'mongo', 'sqlite'] as ConnType[]).filter((k) => k !== kind)
    for (const k of [kind, ...rest]) {
        const list = sessionsMap[k]
        if (list && list.length) return { kind: k, id: list[list.length - 1].id }
    }
    return null
}
