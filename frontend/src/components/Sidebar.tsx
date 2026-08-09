import React, {useEffect, useMemo, useState} from 'react'
import Icon from './Icon'
import ClientIcon from './ClientIcon'
import ContextMenu, {closedMenu, MenuState, MenuItem} from './ContextMenu'
import {ConfirmModal, ConfirmState} from './Modal'
import {ServerConfig, ServerGroup, SessionInfo, RedisSessionInfo, MysqlSessionInfo, MqttSessionInfo, MongoSessionInfo, SqliteSessionInfo, ConnType} from '../types'
import g from '../styles/global.module.less'
import s from './Sidebar.module.less'

interface Props {
    servers: ServerConfig[]
    groups: ServerGroup[]
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
    onCreateGroup: () => Promise<ServerGroup>
    onRenameGroup: (g: ServerGroup) => void
    onDeleteGroup: (id: string) => void
    onMoveServer: (serverId: string, groupId: string) => void
    onOpenApi: () => void
    onOpenDevTools: () => void
    onFocusSession: (id: string, kind: ConnType) => void
}

export default function Sidebar({
                                    servers,
                                    groups,
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
                                    onCreateGroup,
                                    onRenameGroup,
                                    onDeleteGroup,
                                    onMoveServer,
                                    onOpenApi,
                                    onOpenDevTools,
                                    onFocusSession,
                                }: Props) {
    const [keyword, setKeyword] = useState('')
    const [menu, setMenu] = useState<MenuState>(closedMenu)
    // 默认所有分组为折叠状态（未显式展开即为折叠）
    const [expanded, setExpanded] = useState<Record<string, boolean>>({})
    const [ungroupedOpen, setUngroupedOpen] = useState(true)
    const [dragId, setDragId] = useState<string | null>(null)
    const [dropGroup, setDropGroup] = useState<string | null>(null)
    const emptyConfirm: ConfirmState = {open: false, title: '', message: ''}
    const [confirm, setConfirm] = useState<ConfirmState>(emptyConfirm)
    const [editingGroup, setEditingGroup] = useState<{ id: string; name: string } | null>(null)
    const [moveMenu, setMoveMenu] = useState<{ serverId: string; x: number; y: number } | null>(null)

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

    // 搜索时自动展开所有包含匹配项的分组
    useEffect(() => {
        if (!keyword.trim()) return
        const kw = keyword.trim().toLowerCase()
        const autoExpanded: Record<string, boolean> = {}
        groups.forEach((g) => {
            const members = servers.filter(
                (s) =>
                    (s.groupId || '') === g.id &&
                    (s.name.toLowerCase().includes(kw) ||
                        s.host.toLowerCase().includes(kw) ||
                        s.username.toLowerCase().includes(kw))
            )
            if (members.length > 0) {
                autoExpanded[g.id] = true
            }
        })
        setExpanded((prev) => ({...prev, ...autoExpanded}))
    }, [keyword, groups, servers])

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

    const serversOfGroup = (groupId: string) =>
        filtered.filter((s) => (s.groupId || '') === groupId)

    const toggleGroup = (id: string) =>
        setExpanded((prev) => ({...prev, [id]: !prev[id]}))

    const startCreateGroup = async () => {
        try {
            const g = await onCreateGroup()
            setExpanded((prev) => ({...prev, [g.id]: true}))
            setEditingGroup({id: g.id, name: g.name})
        } catch {
            /* ignore */
        }
    }

    const commitRename = () => {
        if (!editingGroup) return
        const name = editingGroup.name.trim()
        if (name) onRenameGroup({id: editingGroup.id, name})
        setEditingGroup(null)
    }

    const openMoveMenu = (server: ServerConfig, e: React.MouseEvent) => {
        e.preventDefault()
        setMoveMenu({serverId: server.id, x: e.clientX, y: e.clientY})
    }

    const renderServer = (server: ServerConfig) => {
        const active = sessionsOf(server)
        const kind = kindOf(server)
        const isRedis = kind === 'redis'
        const isMysql = kind === 'mysql'
        const activeId = activeIdOf(server)
        return (
            <div key={server.id} className={s.serverGroup}>
                <div
                    className={`${s.serverItem}${connectingId === server.id ? ' ' + s.connecting : ''}`}
                    draggable
                    onDragStart={(e) => {
                        setDragId(server.id)
                        e.dataTransfer.effectAllowed = 'move'
                        e.dataTransfer.setData('text/plain', server.id)
                    }}
                    onDragEnd={() => {
                        setDragId(null)
                        setDropGroup(null)
                    }}
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
                            {
                                key: 'move',
                                label: '移动到分组…',
                                icon: 'folder',
                                onClick: () => {
                                    const r = (e.target as HTMLElement).getBoundingClientRect()
                                    setMoveMenu({serverId: server.id, x: r.left, y: r.bottom + 4})
                                },
                            },
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
                            {kind === 'sqlite'
                                ? ((server.name || server.sqlitePath || '').split(/[\\/]/).pop() || 'SQLite 文件')
                                : server.name || ((isRedis || isMysql || kind === 'mqtt' || kind === 'mongo') ? `${server.host}:${server.port}` : `${server.username}@${server.host}`)}
                        </span>
                        <span className={s.serverSub} title={server.sqlitePath}>
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
                        <span className={s.sessionTitle}>
                            {isRedis
                                ? `Redis ${server.host}:${server.port}`
                                : isMysql
                                ? `MySQL ${server.host}:${server.port}`
                                : kind === 'mqtt'
                                ? `MQTT ${server.host}:${server.port}`
                                : kind === 'mongo'
                                ? `MongoDB ${server.host}:${server.port}`
                                : kind === 'sqlite'
                                ? `SQLite ${((sess as any).title || server.name || server.sqlitePath || '').split(/[\\/]/).pop() || '文件'}`
                                : `会话 ${sess.id.slice(0, 6)}`}
                        </span>
                    </button>
                ))}
            </div>
        )
    }

    const ungrouped = filtered.filter((s) => !s.groupId)

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
                    {keyword && (
                        <button className={s.clearBtn} title="清空搜索" onClick={() => setKeyword('')}>
                            <Icon name="close" size={12}/>
                        </button>
                    )}
                </div>
                <button
                    className={g.iconBtn}
                    title="新建服务器"
                    onClick={() => onNew()}
                >
                    <Icon name="plus"/>
                </button>
                <button
                    className={g.iconBtn}
                    title="新建分组"
                    onClick={startCreateGroup}
                >
                    <Icon name="folder"/>
                </button>
            </div>

            <div className={s.serverList}>
                {filtered.length === 0 && (
                    <div className={s.sidebarEmpty}>
                        还没有服务器
                        <button className={`${g.btn} ${g.small} ${g.primary}`} onClick={() => onNew()}>添加一个</button>
                    </div>
                )}

                {groups.map((grp) => {
                    const members = serversOfGroup(grp.id)
                    const isOpen = !!expanded[grp.id]
                    const isEditing = editingGroup?.id === grp.id
                    return (
                        <div
                            key={grp.id}
                            className={`${s.groupBlock}${dropGroup === grp.id ? ' ' + s.dropActive : ''}`}
                            onDragOver={(e) => {
                                if (!dragId) return
                                e.preventDefault()
                                setDropGroup(grp.id)
                            }}
                            onDragLeave={() => setDropGroup((p) => (p === grp.id ? null : p))}
                            onDrop={(e) => {
                                e.preventDefault()
                                const id = dragId || e.dataTransfer.getData('text/plain')
                                if (id) onMoveServer(id, grp.id)
                                setDragId(null)
                                setDropGroup(null)
                            }}
                        >
                            <div className={s.groupHeader}>
                                <button
                                    className={g.iconBtn}
                                    title={isOpen ? '折叠' : '展开'}
                                    onClick={() => toggleGroup(grp.id)}
                                >
                                    <span className={`${s.groupChevron}${isOpen ? ' ' + s.open : ''}`}>
                                        <Icon name="chevron-right" size={14}/>
                                    </span>
                                </button>
                                {isEditing ? (
                                    <input
                                        className={s.groupInput}
                                        autoFocus
                                        value={editingGroup?.name ?? ''}
                                        onChange={(e) => setEditingGroup({id: grp.id, name: e.target.value})}
                                        onBlur={commitRename}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') commitRename()
                                            if (e.key === 'Escape') setEditingGroup(null)
                                        }}
                                    />
                                ) : (
                                    <button className={s.groupTitleBtn} onClick={() => toggleGroup(grp.id)}>
                                        <span className={s.groupName}>{grp.name}</span>
                                        <span className={s.groupCount}>{members.length}</span>
                                    </button>
                                )}
                                <span className={s.groupActions}>
                                    <button
                                        className={g.iconBtn}
                                        title="重命名分组"
                                        onClick={() => setEditingGroup({id: grp.id, name: grp.name})}
                                    >
                                        <Icon name="edit" size={13}/>
                                    </button>
                                    <button
                                        className={`${g.iconBtn} ${g.danger}`}
                                        title="删除分组"
                                        onClick={() => {
                                            setConfirm({
                                                open: true,
                                                title: '删除分组',
                                                danger: true,
                                                message: `删除分组「${grp.name}」？分组下的服务器不会被删除，仅移出分组。`,
                                                onConfirm: () => {
                                                    setConfirm(emptyConfirm)
                                                    onDeleteGroup(grp.id)
                                                },
                                            })
                                        }}
                                    >
                                        <Icon name="trash" size={13}/>
                                    </button>
                                </span>
                            </div>

                            <div className={`${s.groupBody}${isOpen ? ' ' + s.open : ''}`}>
                                <div className={s.groupInner}>
                                    {members.map((server) => renderServer(server))}
                                </div>
                            </div>
                        </div>
                    )
                })}

                {ungrouped.length > 0 && (
                    <div
                        className={`${s.groupBlock}${dropGroup === '__none__' ? ' ' + s.dropActive : ''}`}
                        onDragOver={(e) => {
                            if (!dragId) return
                            e.preventDefault()
                            setDropGroup('__none__')
                        }}
                        onDragLeave={() => setDropGroup((p) => (p === '__none__' ? null : p))}
                        onDrop={(e) => {
                            e.preventDefault()
                            const id = dragId || e.dataTransfer.getData('text/plain')
                            if (id) onMoveServer(id, '')
                            setDragId(null)
                            setDropGroup(null)
                        }}
                    >
                        <div className={s.groupHeader}>
                            <button
                                className={g.iconBtn}
                                title={ungroupedOpen ? '折叠' : '展开'}
                                onClick={() => setUngroupedOpen((v) => !v)}
                            >
                                <Icon name={ungroupedOpen ? 'chevron-down' : 'chevron-right'} size={14}/>
                            </button>
                            <button className={s.groupTitleBtn} onClick={() => setUngroupedOpen((v) => !v)}>
                                <span className={s.groupName}>未分组</span>
                                <span className={s.groupCount}>{ungrouped.length}</span>
                            </button>
                        </div>
                        {ungroupedOpen && ungrouped.map((server) => renderServer(server))}
                    </div>
                )}
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

            {moveMenu && (
                <div
                    className={s.movePopover}
                    style={{left: moveMenu.x, top: moveMenu.y}}
                    onMouseDown={(e) => e.stopPropagation()}
                >
                    <div className={s.movePopTitle}>移动到分组</div>
                    <button
                        className={s.moveItem}
                        onClick={() => {
                            onMoveServer(moveMenu.serverId, '')
                            setMoveMenu(null)
                        }}
                    >
                        未分组
                    </button>
                    {groups.map((grp) => (
                        <button
                            key={grp.id}
                            className={s.moveItem}
                            onClick={() => {
                                onMoveServer(moveMenu.serverId, grp.id)
                                setMoveMenu(null)
                            }}
                        >
                            {grp.name}
                        </button>
                    ))}
                    {groups.length === 0 && <div className={s.moveEmpty}>暂无分组</div>}
                </div>
            )}
            <ConfirmModal state={confirm} onCancel={() => setConfirm(emptyConfirm)}/>
        </aside>
    )
}
