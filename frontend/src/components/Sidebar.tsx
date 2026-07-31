import React, {useMemo, useState} from 'react'
import Icon from './Icon'
import ClientIcon from './ClientIcon'
import ContextMenu, {closedMenu, MenuState, MenuItem} from './ContextMenu'
import {ServerConfig, SessionInfo, RedisSessionInfo, MysqlSessionInfo, MqttSessionInfo, ConnType} from '../types'

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
    onNew: () => void
    onEdit: (cfg: ServerConfig) => void
    onDelete: (cfg: ServerConfig) => void
    onConnect: (cfg: ServerConfig) => void
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
                                    onNew,
                                    onEdit,
                                    onDelete,
                                    onConnect,
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
                s.type === 'mqtt'
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
            : 'ssh'

    const sessionsOf = (server: ServerConfig) => {
        const kind = kindOf(server)
        if (kind === 'redis') return redisSessions.filter((s) => s.serverId === server.id)
        if (kind === 'mysql') return mysqlSessions.filter((s) => s.serverId === server.id)
        if (kind === 'mqtt') return mqttSessions.filter((s) => s.serverId === server.id)
        return sessions.filter((s) => s.serverId === server.id)
    }

    const activeIdOf = (server: ServerConfig) => {
        const kind = kindOf(server)
        if (kind === 'redis') return activeRedisId
        if (kind === 'mysql') return activeMysqlId
        if (kind === 'mqtt') return activeMqttId
        return activeSessionId
    }

    return (
        <aside className="sidebar">
            <div className="sidebar-head">
                <div className="sidebar-search">
                    <Icon name="search" size={14}/>
                    <input
                        value={keyword}
                        placeholder="搜索服务器 / Redis / MQTT"
                        onChange={(e) => setKeyword(e.target.value)}
                    />
                </div>
                <button
                    className="icon-btn"
                    title="新建服务器"
                    onClick={() => onNew()}
                >
                    <Icon name="plus"/>
                </button>
            </div>

            <div className="server-list">
                {filtered.length === 0 && (
                    <div className="sidebar-empty">
                        还没有服务器
                        <button className="btn small primary" onClick={() => onNew()}>添加一个</button>
                    </div>
                )}

                {filtered.map((server) => {
                    const active = sessionsOf(server)
                    const kind = kindOf(server)
                    const isRedis = kind === 'redis'
                    const isMysql = kind === 'mysql'
                    const activeId = activeIdOf(server)
                    return (
                        <div key={server.id} className="server-group">
                            <div
                                className={`server-item${connectingId === server.id ? ' connecting' : ''}`}
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
                                <span className="server-icon">
                                    <ClientIcon kind={kind} size={18}/>
                                </span>
                                <span className="server-text">
                                    <span className="server-name">
                                        {server.name || ((isRedis || isMysql || kind === 'mqtt') ? `${server.host}:${server.port}` : `${server.username}@${server.host}`)}
                                    </span>
                                    <span className="server-sub">
                                        {isRedis || isMysql || kind === 'mqtt'
                                            ? `${server.host}:${server.port}`
                                            : `${server.username}@${server.host}:${server.port}`}
                                    </span>
                                </span>
                                <span className="server-actions">
                                    {connectingId === server.id ? (
                                        <span className="spinner" title="连接中…"/>
                                    ) : (
                                        <button
                                            className="icon-btn"
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

                            {active.map((s) => (
                                <button
                                    key={s.id}
                                    className={`session-item${s.id === activeId ? ' active' : ''}`}
                                    onClick={() => onFocusSession(s.id, kind)}
                                >
                                    <span className={`dot${s.connected ? ' on' : ''}`}/>
                                    {isRedis
                                        ? `Redis ${server.host}:${server.port}`
                                        : isMysql
                                        ? `MySQL ${server.host}:${server.port}`
                                        : kind === 'mqtt'
                                        ? `MQTT ${server.host}:${server.port}`
                                        : `会话 ${s.id.slice(0, 6)}`}
                                </button>
                            ))}
                        </div>
                    )
                })}
            </div>

            <ContextMenu state={menu} onClose={() => setMenu(closedMenu)}/>
        </aside>
    )
}
