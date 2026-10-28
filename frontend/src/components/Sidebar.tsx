import { useEffect, useMemo, useState, useCallback } from 'react'
import { Input, Button, Tooltip } from 'antd'
import { useTranslation } from 'react-i18next'
import {
    Plug,
    Search,
    Plus,
    Folder,
    ChevronRight,
    Edit,
    Trash2,
    BarChart2,
    Link as LinkIcon,
    BookOpen,
} from 'lucide-react'
import ClientIcon from '@/components/ClientIcon'
import ContextMenu, { closedMenu, MenuState, MenuItem } from '@/components/ContextMenu'
import { ConfirmModal, ConfirmState } from '@/components/Modal'
import { ServerConfig, ServerGroup, SessionInfo, RedisSessionInfo, MysqlSessionInfo, PostgresSessionInfo, MqttSessionInfo, MongoSessionInfo, SqliteSessionInfo, DockerSessionInfo, K8sSessionInfo, ConnType } from '@/types'
import g from '@/styles/global.module.less'
import s from '@/components/Sidebar.module.less'
import { useSession } from '@/contexts/SessionContext'

interface Props {
    servers: ServerConfig[]
    groups: ServerGroup[]
    connectingId: string | null
    onNew: (groupId?: string) => void
    onEdit: (cfg: ServerConfig) => void
    onDelete: (cfg: ServerConfig) => void
    onConnect: (cfg: ServerConfig) => void
    onCreateGroup: () => Promise<ServerGroup>
    onRenameGroup: (g: ServerGroup) => void
    onDeleteGroup: (id: string) => void
    onMoveServer: (serverId: string, groupId: string) => void
    onOpenSettings: () => void
    onExportConfig?: () => void
    onImportConfig?: () => void
    // 可选参数（兼容旧调用）
    sessions?: SessionInfo[]
    activeSessionId?: string | null
    redisSessions?: RedisSessionInfo[]
    activeRedisId?: string | null
    mysqlSessions?: MysqlSessionInfo[]
    activeMysqlId?: string | null
    postgresSessions?: PostgresSessionInfo[]
    activePostgresId?: string | null
    mqttSessions?: MqttSessionInfo[]
    activeMqttId?: string | null
    mongoSessions?: MongoSessionInfo[]
    activeMongoId?: string | null
    sqliteSessions?: SqliteSessionInfo[]
    activeSqliteId?: string | null
    dockerSessions?: DockerSessionInfo[]
    activeDockerId?: string | null
    k8sSessions?: K8sSessionInfo[]
    activeK8sId?: string | null
    onOpenAiAgent?: () => void
    onOpenApi?: () => void
    onOpenDevTools?: () => void
    onOpenWiki?: () => void
    onFocusSession?: (id: string, kind: ConnType) => void
}



// 匹配搜索关键字（支持名称、主机、用户名、Docker/K8s 配置路径）
const matchServer = (server: ServerConfig, kw: string): boolean => {
    const searchFields = [
        server.name,
        server.host,
        server.username,
        server.dockerSocketPath,
        server.k8sApiServer,
    ]
    return searchFields.some((field) => field?.toLowerCase().includes(kw))
}

// 统一获取排序权重键
const getServerSortKey = (server: ServerConfig): string =>
    (server.name || server.host || server.dockerSocketPath || server.k8sApiServer || '').toLowerCase()

export default function Sidebar({
    servers,
    groups,
    connectingId,
    onNew,
    onEdit,
    onDelete,
    onConnect,
    onCreateGroup,
    onRenameGroup,
    onDeleteGroup,
    onMoveServer,
    onOpenSettings,
    onExportConfig,
    onImportConfig,
    onOpenApi,
    onOpenDevTools,
    onOpenWiki,
    onFocusSession,
}: Props) {
    const { t } = useTranslation(['sidebar', 'common'])
    const { sessions: ctxSessions, activeTarget, openTool, activateTab, sidebarOpen } = useSession()
    const [mounted, setMounted] = useState(false)

    useEffect(() => {
        const raf = requestAnimationFrame(() => {
            setMounted(true)
        })
        return () => cancelAnimationFrame(raf)
    }, [])

    const [keyword, setKeyword] = useState('')
    const [menu, setMenu] = useState<MenuState>(closedMenu)
    // 默认所有分组为折叠状态（未显式展开即为折叠）
    const [userExpanded, setUserExpanded] = useState<Record<string, boolean>>({})
    const [dragId, setDragId] = useState<string | null>(null)
    const [dropGroup, setDropGroup] = useState<string | null>(null)
    const emptyConfirm: ConfirmState = { open: false, title: '', message: '' }
    const [confirm, setConfirm] = useState<ConfirmState>(emptyConfirm)
    const [editingGroup, setEditingGroup] = useState<{ id: string; name: string } | null>(null)
    const [moveMenu, setMoveMenu] = useState<{ serverId: string; x: number; y: number } | null>(null)

    // 过滤与排序展示各类型服务器列表
    const filtered = useMemo(() => {
        const kw = keyword.trim().toLowerCase()

        return servers
            .filter((s) => !kw || matchServer(s, kw))
            .sort((a, b) => getServerSortKey(a).localeCompare(getServerSortKey(b)))
    }, [servers, keyword])

    const isSearching = Boolean(keyword.trim())

    const kindOf = (s: ServerConfig): ConnType => (s.type || 'ssh') as ConnType

    // 预先建立按 groupId 分组的服务器映射，避免每个分组反复 filter
    const serversByGroup = useMemo(() => {
        const map = new Map<string, ServerConfig[]>()
        for (const s of filtered) {
            const gid = s.groupId || ''
            let list = map.get(gid)
            if (!list) {
                list = []
                map.set(gid, list)
            }
            list.push(s)
        }
        return map
    }, [filtered])

    // 预先建立 serverId -> sessions 映射，避免每次渲染反复扫描所有会话
    const sessionsByServerId = useMemo(() => {
        const map = new Map<string, Array<{ id: string; serverId?: string; connected?: boolean; [key: string]: any }>>()
        for (const key of Object.keys(ctxSessions) as ConnType[]) {
            const list = ctxSessions[key] || []
            for (const sess of list as Array<{ id: string; serverId?: string; connected?: boolean; [key: string]: any }>) {
                if (sess.serverId) {
                    let arr = map.get(sess.serverId)
                    if (!arr) {
                        arr = []
                        map.set(sess.serverId, arr)
                    }
                    arr.push(sess)
                }
            }
        }
        return map
    }, [ctxSessions])

    const sessionsOf = useCallback(
        (server: ServerConfig): Array<{ id: string; serverId?: string; connected?: boolean; [key: string]: any }> => {
            return sessionsByServerId.get(server.id) || []
        },
        [sessionsByServerId]
    )

    const activeIdOf = (server: ServerConfig) => {
        const kind = kindOf(server)
        return activeTarget?.kind === kind ? activeTarget.id : null
    }

    const serversOfGroup = useCallback(
        (groupId: string) => serversByGroup.get(groupId) || [],
        [serversByGroup]
    )

    const toggleGroup = (id: string) =>
        setUserExpanded((prev) => ({ ...prev, [id]: !prev[id] }))

    const startCreateGroup = async () => {
        try {
            const g = await onCreateGroup()
            setUserExpanded((prev) => ({ ...prev, [g.id]: true }))
            setEditingGroup({ id: g.id, name: g.name })
        } catch {
            /* ignore */
        }
    }

    const commitRename = () => {
        if (!editingGroup) return
        const name = editingGroup.name.trim()
        if (name) onRenameGroup({ id: editingGroup.id, name })
        setEditingGroup(null)
    }

    const renderServer = (server: ServerConfig) => {
        const active = sessionsOf(server)
        const kind = kindOf(server)
        const isRedis = kind === 'redis'
        const isMysql = kind === 'mysql'
        const isPostgres = kind === 'postgres'
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
                        e.stopPropagation()
                        const items: MenuItem[] = [
                            {
                                key: 'connect',
                                label: t('common:connect'),
                                icon: 'plug',
                                disabled: connectingId === server.id,
                                onClick: () => onConnect(server),
                            },
                            { key: 'edit', label: t('common:edit'), icon: 'edit', onClick: () => onEdit(server) },
                            {
                                key: 'move',
                                label: t('sidebar:moveToGroup'),
                                icon: 'folder',
                                onClick: () => {
                                    const r = (e.target as HTMLElement).getBoundingClientRect()
                                    setMoveMenu({ serverId: server.id, x: r.left, y: r.bottom + 4 })
                                },
                            },
                            { key: 'd1', label: '', divider: true },
                            {
                                key: 'delete',
                                label: t('common:delete'),
                                icon: 'trash',
                                danger: true,
                                onClick: () => onDelete(server),
                            },
                        ]
                        setMenu({ open: true, x: e.clientX, y: e.clientY, items })
                    }}
                >
                    <span className={s.serverIcon}>
                        <ClientIcon kind={kind} size={32} />
                    </span>
                    <span className={s.serverText}>
                        <span className={s.serverName}>
                            {kind === 'sqlite'
                                ? ((server.name || server.sqlitePath || '').split(/[\\/]/).pop() || t('sidebar:sqliteFile', 'SQLite 文件'))
                                : kind === 'docker'
                                    ? server.name || (server.dockerEndpointType === 'ssh' ? `Docker (${server.dockerSshHost || server.host})` : server.dockerEndpointType === 'tcp' ? `Docker (${server.host})` : 'Docker (Local Socket)')
                                    : kind === 'k8s'
                                        ? server.name || (server.k8sContext ? `K8s (${server.k8sContext})` : server.k8sApiServer ? `K8s (${server.k8sApiServer})` : 'Kubernetes')
                                        : server.name || ((isRedis || isMysql || isPostgres || kind === 'mqtt' || kind === 'mongo') ? `${server.host}:${server.port}` : `${server.username}@${server.host}`)}
                        </span>
                        <span className={s.serverSub} title={server.sqlitePath || server.dockerSocketPath || server.k8sKubeconfigPath || server.k8sApiServer}>
                            {kind === 'docker'
                                ? (server.dockerEndpointType === 'ssh'
                                    ? `ssh://${server.dockerSshUser || 'root'}@${server.dockerSshHost || server.host}:${server.dockerSshPort || 22}`
                                    : server.dockerEndpointType === 'tcp'
                                        ? `tcp://${server.host}:${server.port || (server.dockerTlsEnabled ? 2376 : 2375)}`
                                        : (server.dockerSocketPath || '/var/run/docker.sock'))
                                : kind === 'k8s'
                                    ? (server.k8sContext ? `Context: ${server.k8sContext}` : server.k8sKubeconfigPath ? (server.k8sKubeconfigPath.split(/[\\/]/).pop() || '') : (server.k8sApiServer || 'Kubeconfig'))
                                    : isRedis || isMysql || isPostgres || kind === 'mqtt' || kind === 'mongo'
                                        ? `${server.host}:${server.port}`
                                        : kind === 'sqlite'
                                            ? (server.sqlitePath || '')
                                            : `${server.username}@${server.host}:${server.port}`}
                        </span>
                    </span>
                    <span className={s.serverActions}>
                        {connectingId === server.id ? (
                            <span className={s.spinner} title={t('sidebar:connecting')}>
                                <svg className={s.spinSvg} viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                    <circle cx="12" cy="12" r="9" strokeOpacity="0.22" strokeWidth="2.5" />
                                    <path d="M21 12a9 9 0 0 0-9-9" strokeWidth="2.5" strokeLinecap="round" />
                                </svg>
                            </span>
                        ) : (
                            <Tooltip title={t('common:connect')}>
                                <Button
                                    size="small"
                                    type="text"
                                    icon={<Plug size={13} />}
                                    onClick={() => onConnect(server)}
                                />
                            </Tooltip>
                        )}
                        <Tooltip title={t('common:edit')}>
                            <Button
                                size="small"
                                type="text"
                                icon={<Edit size={13} />}
                                onClick={() => onEdit(server)}
                            />
                        </Tooltip>
                    </span>
                </div>

                {active.map((sess) => (
                    <Button
                        key={sess.id}
                        size="small"
                        type={sess.id === activeId ? 'primary' : 'text'}
                        className={s.sessionBtn}
                        onClick={() => (onFocusSession ? onFocusSession(sess.id, kind) : activateTab(kind, sess.id))}
                    >
                        <span className={`${g.dot}${sess.connected !== false ? ' ' + g.on : ''}`} />
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
                                                ? `SQLite ${((sess as any).title || server.name || server.sqlitePath || '').split(/[\\/]/).pop() || t('sidebar:file', '文件')}`
                                                : kind === 'k8s'
                                                    ? (sess as any).title || `K8s ${(sess as any).apiServer}`
                                                    : kind === 'docker'
                                                        ? (sess as any).title || `Docker ${(sess as any).serverId || sess.id}`
                                                        : t('sidebar:session', { id: sess.id.slice(0, 6) })}
                        </span>
                    </Button>
                ))}
            </div>
        )
    }

    const ungrouped = serversOfGroup('')

    return (
        <aside
            className={`${s.sidebar} ${sidebarOpen ? s.open : s.closed} ${!mounted ? s.noTransition : ''}`}
            style={{ width: sidebarOpen ? 280 : 0 }}
        >
            <div className={s.inner}>
                <div className={s.sidebarHead}>
                    <Input
                        size="small"
                        className={s.sidebarSearchInput}
                        value={keyword}
                        placeholder={t('sidebar:searchPlaceholder')}
                        prefix={<Search size={13} style={{ color: 'var(--text-dim)' }} />}
                        allowClear
                        onChange={(e) => setKeyword(e.target.value)}
                    />
                    <Tooltip title={t('sidebar:newServer')}>
                        <Button
                            size="small"
                            type="text"
                            icon={<Plus size={15} />}
                            onClick={() => onNew()}
                        />
                    </Tooltip>
                    <Tooltip title={t('sidebar:newGroup')}>
                        <Button
                            size="small"
                            type="text"
                            icon={<Folder size={15} />}
                            onClick={startCreateGroup}
                        />
                    </Tooltip>
                </div>

                <div
                    className={`${s.serverList}${dropGroup === '__none__' ? ' ' + s.dropActive : ''}`}
                    onContextMenu={(e) => {
                        e.preventDefault()
                        const items: MenuItem[] = [
                            {
                                key: 'new-server',
                                label: t('sidebar:newConnection'),
                                icon: 'plug',
                                onClick: () => onNew(),
                            },
                            {
                                key: 'new-group',
                                label: t('sidebar:newGroup'),
                                icon: 'newfolder',
                                onClick: startCreateGroup,
                            },
                            { key: 'd1', label: '', divider: true },
                            {
                                key: 'import-cfg',
                                label: t('sidebar:importConfig'),
                                icon: 'upload',
                                onClick: () => onImportConfig?.(),
                            },
                            {
                                key: 'export-cfg',
                                label: t('sidebar:exportConfig'),
                                icon: 'download',
                                onClick: () => onExportConfig?.(),
                            },
                        ]
                        setMenu({ open: true, x: e.clientX, y: e.clientY, items })
                    }}
                    onDragOver={(e) => {
                        if (!dragId) return
                        e.preventDefault()
                        setDropGroup((prev) => (prev === '__none__' ? prev : '__none__'))
                    }}
                    onDragLeave={(e) => {
                        if (e.currentTarget && e.relatedTarget && (e.currentTarget as Node).contains(e.relatedTarget as Node)) return
                        setDropGroup((p) => (p === '__none__' ? null : p))
                    }}
                    onDrop={(e) => {
                        e.preventDefault()
                        const id = dragId || e.dataTransfer.getData('text/plain')
                        if (id) onMoveServer(id, '')
                        setDragId(null)
                        setDropGroup(null)
                    }}
                >
                    {filtered.length === 0 && (
                        <div className={s.sidebarEmpty}>
                            {t('sidebar:noServers')}
                            <Button size="small" type="primary" onClick={() => onNew()}>{t('sidebar:addOne')}</Button>
                        </div>
                    )}

                    {groups.map((grp) => {
                        const members = serversOfGroup(grp.id)
                        const isOpen = isSearching ? members.length > 0 : !!userExpanded[grp.id]
                        const isEditing = editingGroup?.id === grp.id
                        return (
                            <div
                                key={grp.id}
                                className={`${s.groupBlock}${dropGroup === grp.id ? ' ' + s.dropActive : ''}`}
                                onDragOver={(e) => {
                                    if (!dragId) return
                                    e.preventDefault()
                                    e.stopPropagation()
                                    setDropGroup((prev) => (prev === grp.id ? prev : grp.id))
                                }}
                                onDragLeave={(e) => {
                                    if (e.currentTarget && e.relatedTarget && (e.currentTarget as Node).contains(e.relatedTarget as Node)) return
                                    setDropGroup((p) => (p === grp.id ? null : p))
                                }}
                                onDrop={(e) => {
                                    e.preventDefault()
                                    e.stopPropagation()
                                    const id = dragId || e.dataTransfer.getData('text/plain')
                                    if (id) onMoveServer(id, grp.id)
                                    setDropGroup(null)
                                    setDragId(null)
                                }}
                            >
                                <div
                                    className={s.groupHeader}
                                    onContextMenu={(e) => {
                                        e.preventDefault()
                                        e.stopPropagation()
                                        const items: MenuItem[] = [
                                            {
                                                key: 'new-in-group',
                                                label: t('sidebar:newInGroup'),
                                                icon: 'plug',
                                                onClick: () => onNew(grp.id),
                                            },
                                            {
                                                key: 'rename-group',
                                                label: t('sidebar:renameGroup'),
                                                icon: 'edit',
                                                onClick: () => setEditingGroup({ id: grp.id, name: grp.name }),
                                            },
                                            { key: 'd1', label: '', divider: true },
                                            {
                                                key: 'delete-group',
                                                label: t('sidebar:deleteGroup'),
                                                icon: 'trash',
                                                danger: true,
                                                onClick: () => {
                                                    setConfirm({
                                                        open: true,
                                                        title: t('sidebar:deleteGroupTitle'),
                                                        danger: true,
                                                        message: t('sidebar:deleteGroupConfirm', { name: grp.name }),
                                                        onConfirm: () => {
                                                            setConfirm(emptyConfirm)
                                                            onDeleteGroup(grp.id)
                                                        },
                                                    })
                                                },
                                            },
                                        ]
                                        setMenu({ open: true, x: e.clientX, y: e.clientY, items })
                                    }}
                                >
                                    <Tooltip title={isOpen ? t('sidebar:collapse') : t('sidebar:expand')}>
                                        <Button
                                            size="small"
                                            type="text"
                                            icon={<ChevronRight size={14} className={`${s.groupChevron}${isOpen ? ' ' + s.open : ''}`} />}
                                            onClick={() => toggleGroup(grp.id)}
                                        />
                                    </Tooltip>
                                    {isEditing ? (
                                        <Input
                                            size="small"
                                            autoFocus
                                            value={editingGroup?.name ?? ''}
                                            onChange={(e) => setEditingGroup({ id: grp.id, name: e.target.value })}
                                            onBlur={commitRename}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') commitRename()
                                                if (e.key === 'Escape') setEditingGroup(null)
                                            }}
                                        />
                                    ) : (
                                        <Button
                                            type="text"
                                            size="small"
                                            block
                                            className={s.groupTitleBtn}
                                            onClick={() => toggleGroup(grp.id)}
                                        >
                                            <span className={s.groupName}>{grp.name}</span>
                                            <span className={s.groupCount}>{members.length}</span>
                                        </Button>
                                    )}
                                    <span className={s.groupActions}>
                                        <Tooltip title={t('sidebar:renameGroup')}>
                                            <Button
                                                size="small"
                                                type="text"
                                                icon={<Edit size={12} />}
                                                onClick={() => setEditingGroup({ id: grp.id, name: grp.name })}
                                            />
                                        </Tooltip>
                                        <Tooltip title={t('sidebar:deleteGroup')}>
                                            <Button
                                                size="small"
                                                type="text"
                                                danger
                                                icon={<Trash2 size={12} />}
                                                onClick={() => {
                                                    setConfirm({
                                                        open: true,
                                                        title: t('sidebar:deleteGroupTitle'),
                                                        danger: true,
                                                        message: t('sidebar:deleteGroupConfirm', { name: grp.name }),
                                                        onConfirm: () => {
                                                            setConfirm(emptyConfirm)
                                                            onDeleteGroup(grp.id)
                                                        },
                                                    })
                                                }}
                                            />
                                        </Tooltip>
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

                    {ungrouped.map((server) => renderServer(server))}
                </div>

                <div className={s.tools}>
                    <Button
                        type="text"
                        icon={<BarChart2 size={15} />}
                        onClick={onOpenDevTools || (() => openTool('devtools'))}
                        className={s.toolBtn}
                    >
                        {t('sidebar:tools.devTools')}
                    </Button>
                    <Button
                        type="text"
                        icon={<LinkIcon size={15} />}
                        onClick={onOpenApi || (() => openTool('api'))}
                        className={s.toolBtn}
                    >
                        {t('sidebar:tools.apiDebug')}
                    </Button>
                    <Button
                        type="text"
                        icon={<BookOpen size={15} />}
                        onClick={onOpenWiki || (() => openTool('wiki'))}
                        className={s.toolBtn}
                    >
                        {t('sidebar:tools.wiki')}
                    </Button>
                </div>
            </div>

            <ContextMenu state={menu} onClose={() => setMenu(closedMenu)} />

            {moveMenu && (
                <div
                    className={s.movePopover}
                    style={{ left: moveMenu.x, top: moveMenu.y }}
                    onMouseDown={(e) => e.stopPropagation()}
                >
                    <div className={s.movePopTitle}>{t('sidebar:moveToGroupTitle')}</div>
                    <Button
                        size="small"
                        type="text"
                        className={s.moveItemBtn}
                        onClick={() => {
                            onMoveServer(moveMenu.serverId, '')
                            setMoveMenu(null)
                        }}
                    >
                        {t('sidebar:noGroupRoot')}
                    </Button>
                    {groups.map((grp) => (
                        <Button
                            key={grp.id}
                            size="small"
                            type="text"
                            className={s.moveItemBtn}
                            onClick={() => {
                                onMoveServer(moveMenu.serverId, grp.id)
                                setMoveMenu(null)
                            }}
                        >
                            {grp.name}
                        </Button>
                    ))}
                    {groups.length === 0 && <div className={s.moveEmpty}>{t('sidebar:noGroups')}</div>}
                </div>
            )}
            <ConfirmModal state={confirm} onCancel={() => setConfirm(emptyConfirm)} />
        </aside>
    )
}
