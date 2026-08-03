import React, {useMemo, useState} from 'react'
import Icon from './Icon'
import ClientIcon from './ClientIcon'
import ContextMenu, {closedMenu, MenuState, MenuItem} from './ContextMenu'
import {ServerConfig, SessionInfo, RedisSessionInfo, MysqlSessionInfo, MqttSessionInfo, MongoSessionInfo, SqliteSessionInfo, ConnType} from '../types'
import g from '../styles/global.module.less'
import s from './Sidebar.module.less'

interface Props {
    servers: ServerConfig[]
    sessions: SessionInfo[]
    activeSessionId: string | null
    connectingId: string | null
    redisSessions: RedisSessionInfo[]
    activeRedisId: string | null
    mysqlSessions: MysqlSessionInfo[]
    activeMysqlId: string | null
    mqttSessions: MqttSessionInfo[]
    activeMqttId: string | null
    mongoSessions: MongoSessionInfo[]
    activeMongoId: string | null
    sqliteSessions: SqliteSessionInfo[]
    activeSqliteId: string | null
    onNew: () => void
    onEdit: (cfg: ServerConfig) => void
    onDelete: (cfg: ServerConfig) => void
    onConnect: (cfg: ServerConfig) => void
    onOpenApi: () => void
    onOpenDevTools: () => void
    onFocusSession: (id: string, kind: ConnType) => void
}

export default function Sidebar({
                                    servers,
                                    sessions,
                                    activeSessionId,
                                    connectingId,
                                    redisSessions,
                                    activeRedisId,
                                    mysqlSessions,
                                    activeMysqlId,
                                    mqttSessions,
                                    activeMqttId,
                                    mongoSessions,
                                    activeMongoId,
                                    sqliteSessions,
                                    activeSqliteId,
                                    onNew,
                                    onEdit,
                                    onDelete,
                                    onConnect,
                                    onOpenApi,
                                    onOpenDevTools,
                                    onFocusSession,
                                }: Props) {
    const [keyword, setKeyword] = useState('')
    const [menu, setMenu] = useState<MenuState>(closedMenu)

    // 合并 SSH 与 Redis，按名称/主机排序，统一展示。
    const filtered = useMemo(() => {
        const kw = keyword.trim().toLowerCase()
        const list = servers.filter(
            (s) =>
                (s.type ?? 'ssh') === 'ssh' ||
                s.type === 'redis' ||
                s.type === 'mysql' ||
                s.type === 'mqtt' ||
                s.type === 'mongo' ||
                s.type === 'sqlite'
        )
        const matched = kw
            ? list.filter(
                (s) =>
                    s.name.toLowerCase().includes(kw) ||
                    s.host.toLowerCase().includes(kw) ||
                    s.username.toLowerCase().includes(kw)
            )
            : list
        return matched.slice().sort((a, b) => {
            const na = (a.name || a.host).toLowerCase()
            const nb = (b.name || b.host).toLowerCase()
            return na < nb ? -1 : na > nb ? 1 : 0
        })
    }, [servers, keyword])

    const kindOf = (s: ServerConfig): ConnType =>
        s.type === 'redis'
            ? 'redis'
            : s.type === 'mysql'
            ? 'mysql'
            : s.type === 'mqtt'
            ? 'mqtt'
        : s.type === 'mongo'
        ? 'mongo'
        : s.type === 'sqlite'
        ? 'sqlite'
        : 'ssh'

    const sessionsOf = (server: ServerConfig) => {
        const kind = kindOf(server)
        if (kind === 'redis') return redisSessions.filter((s) => s.serverId === server.id)
        if (kind === 'mysql') return mysqlSessions.filter((s) => s.serverId === server.id)
        if (kind === 'mqtt') return mqttSessions.filter((s) => s.serverId === server.id)
        if (kind === 'mongo') return mongoSessions.filter((s) => s.serverId === server.id)
        if (kind === 'sqlite') return sqliteSessions.filter((s) => s.serverId === server.id)
        return sessions.filter((s) => s.serverId === server.id)
    }

    const activeIdOf = (server: ServerConfig) => {
        const kind = kindOf(server)
        if (kind === 'redis') return activeRedisId
        if (kind === 'mysql') return activeMysqlId
        if (kind === 'mqtt') return activeMqttId
        if (kind === 'mongo') return activeMongoId
        if (kind === 'sqlite') return activeSqliteId
        return activeSessionId
    }

    return (
        <aside className={s.sidebar}>
            <div className={s.sidebarHead}>
                <div className={s.sidebarSearch}>
                    <Icon name="search" size={14}/>
                    <input
                        value={keyword}
                        placeholder="搜索服务器 / Redis / MQTT"
                        onChange={(e) => setKeyword(e.target.value)}
                    />
                </div>
                <button
                    className={g.iconBtn}
                    title="新建服务器"
                    onClick={() => onNew()}
                >
                    <Icon name="plus"/>
                </button>
            </div>

            <div className={s.serverList}>
                {filtered.length === 0 && (
                    <div className={s.sidebarEmpty}>
                        还没有服务器
                        <button className={`${g.btn} ${g.small} ${g.primary}`} onClick={() => onNew()}>添加一个</button>
                    </div>
                )}

                {filtered.map((server) => {
                    const active = sessionsOf(server)
                    const kind = kindOf(server)
                    const isRedis = kind === 'redis'
                    const isMysql = kind === 'mysql'
                    const activeId = activeIdOf(server)
                    return (
                        <div key={server.id} className={s.serverGroup}>
                            <div
                                className={`${s.serverItem}${connectingId === server.id ? ' ' + s.connecting : ''}`}
                                onDoubleClick={() => {
                                    if (connectingId === server.id) return
                                    onConnect(server)
                                }}
                                onContextMenu={(e) => {
                                    e.preventDefault()
                                    const items: MenuItem[] = [
                                        {
                                            key: 'connect',
                                            label: '连接',
                                            icon: 'plug',
                                            disabled: connectingId === server.id,
                                            onClick: () => onConnect(server),
                                        },
                                        {key: 'edit', label: '编辑', icon: 'edit', onClick: () => onEdit(server)},
                                        {key: 'd1', label: '', divider: true},
                                        {
                                            key: 'delete',
                                            label: '删除',
                                            icon: 'trash',
                                            danger: true,
                                            onClick: () => onDelete(server),
                                        },
                                    ]
                                    setMenu({open: true, x: e.clientX, y: e.clientY, items})
                                }}
                            >
                                <span className={s.serverIcon}>
                                    <ClientIcon kind={kind} size={18}/>
                                </span>
                                <span className={s.serverText}>
                                    <span className={s.serverName}>
                                        {server.name || ((isRedis || isMysql || kind === 'mqtt' || kind === 'mongo' || kind === 'sqlite') ? (kind === 'sqlite' ? (server.sqlitePath || 'SQLite 文件') : `${server.host}:${server.port}`) : `${server.username}@${server.host}`)}
                                    </span>
                                    <span className={s.serverSub}>
                                        {isRedis || isMysql || kind === 'mqtt' || kind === 'mongo'
                                            ? `${server.host}:${server.port}`
                                            : kind === 'sqlite'
                                            ? (server.sqlitePath || '')
                                            : `${server.username}@${server.host}:${server.port}`}
                                    </span>
                                </span>
                                <span className={s.serverActions}>
                                    {connectingId === server.id ? (
                                        <span className={s.spinner} title="连接中…"/>
                                    ) : (
                                        <button
                                            className={g.iconBtn}
                                            title="连接"
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                onConnect(server)
                                            }}
                                        >
                                            <Icon name="plug" size={15}/>
                                        </button>
                                    )}
                                </span>
                            </div>

                            {active.map((sess) => (
                                <button
                                    key={sess.id}
                                    className={`${s.sessionItem}${sess.id === activeId ? ' ' + s.active : ''}`}
                                    onClick={() => onFocusSession(sess.id, kind)}
                                >
                                    <span className={`${g.dot}${sess.connected ? ' ' + g.on : ''}`}/>
                                {isRedis
                                    ? `Redis ${server.host}:${server.port}`
                                    : isMysql
                                    ? `MySQL ${server.host}:${server.port}`
                                    : kind === 'mqtt'
                                    ? `MQTT ${server.host}:${server.port}`
                                    : kind === 'mongo'
                                    ? `MongoDB ${server.host}:${server.port}`
                                    : kind === 'sqlite'
                                    ? `SQLite ${(server.sqlitePath || '').split(/[\\/]/).pop() || '文件'}`
                                    : `会话 ${sess.id.slice(0, 6)}`}
                                </button>
                            ))}
                        </div>
                    )
                })}
            </div>

            <div className={s.tools}>
                <button className={s.toolItem} onClick={onOpenDevTools}>
                    <Icon name="chart" size={15}/>
                    <span>开发工具</span>
                </button>
                <button className={s.toolItem} onClick={onOpenApi}>
                    <Icon name="link" size={15}/>
                    <span>API 调试</span>
                </button>
            </div>

            <ContextMenu state={menu} onClose={() => setMenu(closedMenu)}/>
        </aside>
    )
}
