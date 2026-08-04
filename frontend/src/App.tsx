import React, {useCallback, useEffect, useRef, useState} from 'react'
import Sidebar from './components/Sidebar'
import SessionWorkspace from './components/SessionWorkspace'
import ServerDialog from './components/ServerDialog'
import RedisClient from './components/RedisClient'
import MysqlClient from './components/MysqlClient'
import MqttClient from './components/MqttClient'
import MongoClient from './components/MongoClient'
import SqliteClient from './components/SqliteClient'
import ApiClient from './components/ApiClient'
import DevTools from './components/DevTools'
import TransferBar from './components/TransferBar'
import Icon from './components/Icon'
import ClientIcon from './components/ClientIcon'
import {ConfirmModal, ConfirmState} from './components/Modal'
import SessionTabs from './components/app/SessionTabs'
import Stage from './components/app/Stage'
import {API, registerNativeFileDrop, subscribe, unregisterNativeFileDrop} from './api'
import {ServerConfig, ServerGroup, SessionInfo, Transfer, RedisSessionInfo, MysqlSessionInfo, MqttSessionInfo, MongoSessionInfo, SqliteSessionInfo, ConnType} from './types'
import {errorMessage} from './utils'
import g from './styles/global.module.less'
import a from './components/App.module.less'

interface Toast {
    id: number
    message: string
    kind: 'info' | 'error'
}

const emptyConfirm: ConfirmState = {open: false, title: '', message: ''}

export default function App() {
    const [servers, setServers] = useState<ServerConfig[]>([])
    const [groups, setGroups] = useState<ServerGroup[]>([])
    const [sessions, setSessions] = useState<SessionInfo[]>([])
    const [activeId, setActiveId] = useState<string | null>(null)
    const [transfers, setTransfers] = useState<Transfer[]>([])
    const [connectingId, setConnectingId] = useState<string | null>(null)
    const [dialog, setDialog] = useState<{ open: boolean; initial: ServerConfig | null }>({
        open: false,
        initial: null,
    })
    const [confirm, setConfirm] = useState<ConfirmState>(emptyConfirm)
    const [toasts, setToasts] = useState<Toast[]>([])
    const [nativeDrop, setNativeDrop] = useState(true)

    // Redis 会话
    const [redisSessions, setRedisSessions] = useState<RedisSessionInfo[]>([])
    const [activeRedisId, setActiveRedisId] = useState<string | null>(null)

    // MySQL 会话
    const [mysqlSessions, setMysqlSessions] = useState<MysqlSessionInfo[]>([])
    const [activeMysqlId, setActiveMysqlId] = useState<string | null>(null)
    const [mqttSessions, setMqttSessions] = useState<MqttSessionInfo[]>([])
    const [activeMqttId, setActiveMqttId] = useState<string | null>(null)

    // MongoDB 会话
    const [mongoSessions, setMongoSessions] = useState<MongoSessionInfo[]>([])
    const [activeMongoId, setActiveMongoId] = useState<string | null>(null)

    // SQLite 会话
    const [sqliteSessions, setSqliteSessions] = useState<SqliteSessionInfo[]>([])
    const [activeSqliteId, setActiveSqliteId] = useState<string | null>(null)

    // API 调试工具（独立的工具面板，不依赖服务器配置）
    const [apiOpen, setApiOpen] = useState(false)
    const [apiActive, setApiActive] = useState(false)

    // 常用开发工具集（独立的工具面板，位于 API 调试上方）
    const [devToolsOpen, setDevToolsOpen] = useState(false)
    const [devToolsActive, setDevToolsActive] = useState(false)

    // 唯一激活描述符的来源（kind = 哪个 tab 类型，id = 该类型下的会话 id；工具类为 'api' / 'devtools'）
    // 通过单一入口写入，确保任意时刻“最多且恰好一个”激活态，杜绝多 active 或全 inactive 异常。
    type ActiveKind = ConnType | 'api' | 'devtools'
    const activateTab = useCallback((kind: ActiveKind | null, id: string | null = null) => {
        setActiveId(kind === 'ssh' ? id : null)
        setActiveRedisId(kind === 'redis' ? id : null)
        setActiveMysqlId(kind === 'mysql' ? id : null)
        setActiveMqttId(kind === 'mqtt' ? id : null)
        setActiveMongoId(kind === 'mongo' ? id : null)
        setActiveSqliteId(kind === 'sqlite' ? id : null)
        setApiActive(kind === 'api')
        setDevToolsActive(kind === 'devtools')
    }, [])

    const activeIdRef = useRef<string | null>(null)
    const pathsRef = useRef<Record<string, string>>({})
    const connectingRef = useRef<Set<string>>(new Set())

    const notify = useCallback((message: string, kind: 'info' | 'error' = 'info') => {
        const id = Date.now() + Math.random()
        setToasts((prev) => [...prev, {id, message, kind}])
        window.setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000)
    }, [])

    /* ---------------- 初始化 ---------------- */

    const reloadServers = useCallback(async () => {
        try {
            setServers((await API.listServers()) || [])
        } catch (err) {
            notify(errorMessage(err), 'error')
        }
    }, [notify])

    const reloadGroups = useCallback(async () => {
        try {
            setGroups((await API.listGroups()) || [])
        } catch (err) {
            notify(errorMessage(err), 'error')
        }
    }, [notify])

    // 新建分组：先落库再刷新本地；返回新建的分组供侧边栏继续内联重命名
    const createGroup = useCallback(async (): Promise<ServerGroup> => {
        const g = await API.saveGroup({id: '', name: '新分组'})
        await reloadGroups()
        return g
    }, [reloadGroups])

    const renameGroup = useCallback(async (g: ServerGroup) => {
        try {
            await API.saveGroup(g)
            await reloadGroups()
        } catch (err) {
            notify(errorMessage(err), 'error')
        }
    }, [reloadGroups, notify])

    const deleteGroup = useCallback(async (id: string) => {
        try {
            await API.deleteGroup(id)
            await reloadGroups()
        } catch (err) {
            notify(errorMessage(err), 'error')
        }
    }, [reloadGroups, notify])

    const moveServer = useCallback(async (serverId: string, groupId: string) => {
        try {
            await API.moveServerToGroup(serverId, groupId)
            await reloadServers()
        } catch (err) {
            notify(errorMessage(err), 'error')
        }
    }, [reloadServers, notify])

    useEffect(() => {
        void reloadServers()
        void reloadGroups()
        API.listTransfers()
            .then((list) => setTransfers(list || []))
            .catch(() => undefined)
    }, [reloadServers, reloadGroups])

    useEffect(() => {
        const offTransfer = subscribe('transfer:update', (t: Transfer) => {
            setTransfers((prev) => {
                const idx = prev.findIndex((item) => item.id === t.id)
                if (idx === -1) return [...prev, t]
                const next = prev.slice()
                next[idx] = t
                return next
            })
        })
        const offClosed = subscribe('session:closed', (sessionId: string) => {
            setSessions((prev) =>
                prev.map((s) => (s.id === sessionId ? {...s, connected: false} : s))
            )
        })
        return () => {
            offTransfer()
            offClosed()
        }
    }, [])

    /* ---------------- 系统级拖拽上传 ---------------- */

    useEffect(() => {
        const ok = registerNativeFileDrop((paths) => {
            const sessionId = activeIdRef.current
            if (!sessionId) {
                notify('请先连接服务器再拖入文件', 'error')
                return
            }
            const remoteDir = pathsRef.current[sessionId] || '/'
            API.uploadPaths(sessionId, remoteDir, paths).catch((err) =>
                notify(errorMessage(err), 'error')
            )
        })
        setNativeDrop(ok)
        return () => {
            if (ok) unregisterNativeFileDrop()
        }
    }, [notify])

    useEffect(() => {
        activeIdRef.current = activeId
    }, [activeId])

    const handlePathChange = useCallback((sessionId: string, p: string) => {
        pathsRef.current[sessionId] = p
    }, [])

    /* ---------------- 新建 / 编辑 ---------------- */

    // 新建与编辑均走同一个对话框，类型（SSH/Redis）在表单内部选择。
    const addServer = useCallback(() => {
        setDialog({open: true, initial: null})
    }, [])

    const editServer = useCallback((cfg: ServerConfig) => {
        setDialog({open: true, initial: cfg})
    }, [])

    /* ---------------- 会话操作 ---------------- */

    const connect = useCallback(
        async (cfg: ServerConfig) => {
        if (connectingRef.current.has(cfg.id)) return
        connectingRef.current.add(cfg.id)
        setConnectingId(cfg.id)
        try {
            if (cfg.type === 'redis') {
                    const ok = await API.redisConnect(cfg.id)
                    if (!ok) throw new Error('Redis 连接失败')
                    const dbSize = await API.redisDBSize(cfg.id).catch(() => 0)
                    const modeInfo = await API.redisModeInfo(cfg.id).catch(() => ({} as any))
                    const info: RedisSessionInfo = {
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
                    setRedisSessions((prev) => [
                        ...prev.filter((s) => s.id !== cfg.id),
                        info,
                    ])
                    setActiveRedisId(cfg.id)
                    activateTab('redis', cfg.id)
                    notify(`已连接 Redis ${info.title}`)
                } else if (cfg.type === 'mysql') {
                    const ok = await API.mysqlConnectEx(cfg.id)
                    if (!ok) throw new Error('MySQL 连接失败')
                    const info: MysqlSessionInfo = {
                        id: cfg.id,
                        serverId: cfg.id,
                        title: cfg.name || `${cfg.host}:${cfg.port || 3306}`,
                        host: cfg.host,
                        port: cfg.port || 3306,
                        connected: true,
                        database: cfg.database || '',
                    }
                    setMysqlSessions((prev) => [
                        ...prev.filter((s) => s.id !== cfg.id),
                        info,
                    ])
                    setActiveMysqlId(cfg.id)
                    activateTab('mysql', cfg.id)
                    notify(`已连接 MySQL ${info.title}`)
                } else if (cfg.type === 'mqtt') {
                    const ok = await API.mqttConnect(cfg.id)
                    if (!ok) throw new Error('MQTT 连接失败')
                    const info: MqttSessionInfo = {
                        id: cfg.id,
                        serverId: cfg.id,
                        host: cfg.host,
                        port: cfg.port || 1883,
                        username: cfg.username,
                        clientId: cfg.clientId || '',
                        connected: true,
                    }
                    setMqttSessions((prev) => [...prev.filter((s) => s.id !== cfg.id), info])
                    setActiveMqttId(cfg.id)
                    activateTab('mqtt', cfg.id)
                    notify(`已连接 MQTT ${info.host}:${info.port}`)
                } else if (cfg.type === 'mongo') {
                    const ok = await API.mongoConnect(cfg.id)
                    if (!ok) throw new Error('MongoDB 连接失败')
                    const db = cfg.mongoDatabase || ''
                    const info: MongoSessionInfo = {
                        id: cfg.id,
                        serverId: cfg.id,
                        title: cfg.name || `${cfg.host}:${cfg.port || 27017}`,
                        host: cfg.host,
                        port: cfg.port || 27017,
                        connected: true,
                        database: db,
                        topology: '',
                        version: '',
                    }
                    setMongoSessions((prev) => [...prev.filter((s) => s.id !== cfg.id), info])
                    setActiveMongoId(cfg.id)
                    activateTab('mongo', cfg.id)
                    notify(`已连接 MongoDB ${info.title}`)
                } else if (cfg.type === 'sqlite') {
                    // SQLite 为本地文件连接：优先使用已保存的文件路径，否则再弹出文件选择器
                    let path = cfg.sqlitePath || ''
                    if (!path) {
                        path = await API.sqliteOpenFile()
                        if (!path) {
                            notify('未选择文件', 'info')
                            return
                        }
                    }
                    const ok = await API.sqliteConnect(cfg.id, path)
                    if (!ok) throw new Error('无法打开该 SQLite 文件')
                    const stat = await API.sqliteInfo(cfg.id).catch(() => ({path, size: 0}))
                    const info: SqliteSessionInfo = {
                        id: cfg.id,
                        serverId: cfg.id,
                        title: cfg.name || (path.split(/[\\/]/).pop() || path),
                        path: stat?.path || path,
                        connected: true,
                        size: Number(stat?.size) || 0,
                    }
                    setSqliteSessions((prev) => [
                        ...prev.filter((s) => s.id !== cfg.id),
                        info,
                    ])
                    setActiveSqliteId(cfg.id)
                    activateTab('sqlite', cfg.id)
                    notify(`已打开 SQLite 文件：${info.title}`)
                } else {
                    const info = await API.connect(cfg.id, 120, 32)
                    setSessions((prev) => [...prev, info])
                    setActiveId(info.id)
                    activateTab('ssh', info.id)
                    pathsRef.current[info.id] = info.homeDir || '/'
                    notify(`已连接 ${info.title}`)
                }
            } catch (err) {
                notify(errorMessage(err), 'error')
            } finally {
                connectingRef.current.delete(cfg.id)
                setConnectingId(null)
            }
        },
        [notify, activateTab]
    )

    // 将激活指针同步为唯一一个会话（其余类型置空），无目标则全部置空。
    // 统一走 activateTab，确保关闭会话回退时也会取消 API / 开发工具的激活态。
    const applyActive = useCallback((target: { kind: ConnType; id: string } | null) => {
        activateTab(target ? target.kind : null, target ? target.id : null)
    }, [activateTab])

    // 关闭激活会话后挑选唯一的回退目标：优先同类型剩余会话，其次按 ssh > redis > mysql > mqtt > mongo 顺序
    // lists 中被关闭类型需传入已过滤的 remaining，避免读取到陈旧（未删除）的会话
    const pickFallback = useCallback(
        (kind: ConnType, lists: Record<ConnType, Array<{ id: string }>>): { kind: ConnType; id: string } | null => {
            const rest = (['ssh', 'redis', 'mysql', 'mqtt', 'mongo', 'sqlite'] as ConnType[]).filter((k) => k !== kind)
            for (const k of [kind, ...rest]) {
                const list = lists[k]
                if (list.length) return { kind: k, id: list[list.length - 1].id }
            }
            return null
        },
        []
    )

    const closeSession = useCallback(
        async (sessionId: string) => {
            try {
                await API.disconnect(sessionId)
            } catch {
                /* ignore */
            }
            const remaining = sessions.filter((s) => s.id !== sessionId)
            setSessions(remaining)
            delete pathsRef.current[sessionId]
            if (activeId !== sessionId) return
            applyActive(pickFallback('ssh', { ssh: remaining, redis: redisSessions, mysql: mysqlSessions, mqtt: mqttSessions, mongo: mongoSessions, sqlite: sqliteSessions }))
        },
        [sessions, redisSessions, mysqlSessions, mqttSessions, mongoSessions, sqliteSessions, activeId, applyActive, pickFallback]
    )

    const closeRedisSession = useCallback(async (id: string) => {
        try {
            await API.redisClose(id)
        } catch {
            /* ignore */
        }
        const remaining = redisSessions.filter((s) => s.id !== id)
        setRedisSessions(remaining)
        if (activeRedisId !== id) return
        applyActive(pickFallback('redis', { ssh: sessions, redis: remaining, mysql: mysqlSessions, mqtt: mqttSessions, mongo: mongoSessions, sqlite: sqliteSessions }))
    }, [sessions, redisSessions, mysqlSessions, mqttSessions, mongoSessions, sqliteSessions, activeRedisId, applyActive, pickFallback])

    const closeMysqlSession = useCallback(async (id: string) => {
        try {
            await API.mysqlCloseEx(id)
        } catch {
            /* ignore */
        }
        const remaining = mysqlSessions.filter((s) => s.id !== id)
        setMysqlSessions(remaining)
        if (activeMysqlId !== id) return
        applyActive(pickFallback('mysql', { ssh: sessions, redis: redisSessions, mysql: remaining, mqtt: mqttSessions, mongo: mongoSessions, sqlite: sqliteSessions }))
    }, [sessions, redisSessions, mysqlSessions, mqttSessions, mongoSessions, sqliteSessions, activeMysqlId, applyActive, pickFallback])

    const closeMqttSession = useCallback(async (id: string) => {
        try {
            await API.mqttClose(id)
        } catch {
            /* ignore */
        }
        const remaining = mqttSessions.filter((s) => s.id !== id)
        setMqttSessions(remaining)
        if (activeMqttId !== id) return
        applyActive(pickFallback('mqtt', { ssh: sessions, redis: redisSessions, mysql: mysqlSessions, mqtt: remaining, mongo: mongoSessions, sqlite: sqliteSessions }))
    }, [sessions, redisSessions, mysqlSessions, mqttSessions, mongoSessions, sqliteSessions, activeMqttId, applyActive, pickFallback])

    const closeMongoSession = useCallback(async (id: string) => {
        try {
            await API.mongoClose(id)
        } catch {
            /* ignore */
        }
        const remaining = mongoSessions.filter((s) => s.id !== id)
        setMongoSessions(remaining)
        if (activeMongoId !== id) return
        applyActive(pickFallback('mongo', { ssh: sessions, redis: redisSessions, mysql: mysqlSessions, mqtt: mqttSessions, mongo: remaining, sqlite: sqliteSessions }))
    }, [sessions, redisSessions, mysqlSessions, mqttSessions, mongoSessions, sqliteSessions, activeMongoId, applyActive, pickFallback])

    const closeSqliteSession = useCallback(async (id: string) => {
        try {
            await API.sqliteClose(id)
        } catch {
            /* ignore */
        }
        const remaining = sqliteSessions.filter((s) => s.id !== id)
        setSqliteSessions(remaining)
        if (activeSqliteId !== id) return
        applyActive(pickFallback('sqlite', { ssh: sessions, redis: redisSessions, mysql: mysqlSessions, mqtt: mqttSessions, mongo: mongoSessions, sqlite: remaining }))
    }, [sessions, redisSessions, mysqlSessions, mqttSessions, mongoSessions, sqliteSessions, activeSqliteId, applyActive, pickFallback])

    const deleteServer = useCallback(
        (cfg: ServerConfig) => {
            setConfirm({
                open: true,
                title: '删除服务器',
                danger: true,
                message: `确定要删除“${cfg.name || cfg.host}”的连接配置吗？`,
                onConfirm: async () => {
                    setConfirm(emptyConfirm)
                    try {
                        await API.deleteServer(cfg.id)
                        await reloadServers()
                    } catch (err) {
                        notify(errorMessage(err), 'error')
                    }
                },
            })
        },
        [notify, reloadServers]
    )

    const activeRedis = redisSessions.find((s) => s.id === activeRedisId) || null

    // 打开 / 关闭 API 调试工具面板
    const openApiTool = useCallback(() => {
        setApiOpen(true)
        activateTab('api')
    }, [activateTab])

    const closeApiTool = useCallback(() => {
        setApiOpen(false)
        setApiActive(false)
    }, [])

    // 打开 / 关闭 常用开发工具集面板
    const openDevTools = useCallback(() => {
        setDevToolsOpen(true)
        activateTab('devtools')
    }, [activateTab])

    const closeDevTools = useCallback(() => {
        setDevToolsOpen(false)
        setDevToolsActive(false)
    }, [])

    // 任一 tab 被点击：通过单一入口激活目标，自动取消其余所有激活态（含 API / 开发工具）。
    // 点击已激活的 tab 时 kind/id 不变，结果为幂等，不会产生副作用。
    const focusSession = useCallback((id: string, kind: ConnType) => {
        activateTab(kind, id)
    }, [activateTab])

    return (
        <div className={a.app}>
            <Sidebar
                servers={servers}
                groups={groups}
                sessions={sessions}
                activeSessionId={activeId}
                connectingId={connectingId}
                redisSessions={redisSessions}
                activeRedisId={activeRedisId}
                mysqlSessions={mysqlSessions}
                activeMysqlId={activeMysqlId}
                mqttSessions={mqttSessions}
                activeMqttId={activeMqttId}
                mongoSessions={mongoSessions}
                activeMongoId={activeMongoId}
                sqliteSessions={sqliteSessions}
                activeSqliteId={activeSqliteId}
                onNew={addServer}
                onEdit={editServer}
                onDelete={deleteServer}
                onConnect={connect}
                onCreateGroup={createGroup}
                onRenameGroup={renameGroup}
                onDeleteGroup={deleteGroup}
                onMoveServer={moveServer}
                onOpenApi={openApiTool}
                onOpenDevTools={openDevTools}
                onFocusSession={(id, kind) => focusSession(id, kind)}
            />

            <main className={a.main}>
                <SessionTabs
                    sessions={sessions}
                    activeId={activeId}
                    redisSessions={redisSessions}
                    activeRedisId={activeRedisId}
                    mysqlSessions={mysqlSessions}
                    activeMysqlId={activeMysqlId}
                    mqttSessions={mqttSessions}
                    activeMqttId={activeMqttId}
                    mongoSessions={mongoSessions}
                    activeMongoId={activeMongoId}
                    sqliteSessions={sqliteSessions}
                    activeSqliteId={activeSqliteId}
                    devToolsOpen={devToolsOpen}
                    devToolsActive={devToolsActive}
                    apiOpen={apiOpen}
                    apiActive={apiActive}
                    onFocusSession={focusSession}
                    onCloseSession={(id) => void closeSession(id)}
                    onCloseRedis={(id) => void closeRedisSession(id)}
                    onCloseMysql={(id) => void closeMysqlSession(id)}
                    onCloseMqtt={(id) => void closeMqttSession(id)}
                    onCloseMongo={(id) => void closeMongoSession(id)}
                    onCloseSqlite={(id) => void closeSqliteSession(id)}
                    onActivateDevTools={openDevTools}
                    onCloseDevTools={closeDevTools}
                    onActivateApi={openApiTool}
                    onCloseApi={closeApiTool}
                />

                <Stage
                    sessions={sessions}
                    activeId={activeId}
                    nativeDrop={nativeDrop}
                    redisSessions={redisSessions}
                    activeRedisId={activeRedisId}
                    mysqlSessions={mysqlSessions}
                    activeMysqlId={activeMysqlId}
                    mqttSessions={mqttSessions}
                    activeMqttId={activeMqttId}
                    mongoSessions={mongoSessions}
                    activeMongoId={activeMongoId}
                    sqliteSessions={sqliteSessions}
                    activeSqliteId={activeSqliteId}
                    devToolsOpen={devToolsOpen}
                    devToolsActive={devToolsActive}
                    apiOpen={apiOpen}
                    apiActive={apiActive}
                    onPathChange={handlePathChange}
                    onNotify={notify}
                    onCloseRedis={(id) => void closeRedisSession(id)}
                    onRedisDbChange={(id, db, dbSize) =>
                        setRedisSessions((prev) => prev.map((x) => (x.id === id ? {...x, db, dbSize} : x)))
                    }
                    onCloseMysql={(id) => void closeMysqlSession(id)}
                    onMysqlChange={(id, database) =>
                        setMysqlSessions((prev) => prev.map((x) => (x.id === id ? {...x, database} : x)))
                    }
                    onCloseMqtt={(id) => void closeMqttSession(id)}
                    onCloseMongo={(id) => void closeMongoSession(id)}
                    onCloseSqlite={(id) => void closeSqliteSession(id)}
                    onMongoChange={(id, database) =>
                        setMongoSessions((prev) => prev.map((x) => (x.id === id ? {...x, database} : x)))
                    }
                    onCloseDevTools={closeDevTools}
                    onCloseApi={closeApiTool}
                    onNewServer={addServer}
                />

                <TransferBar
                    transfers={transfers}
                    onCancel={(id) => API.cancelTransfer(id).catch(() => undefined)}
                    onClear={() => {
                        API.clearFinishedTransfers()
                            .then(() => setTransfers((prev) => prev.filter((t) => t.status === 'running')))
                            .catch(() => undefined)
                    }}
                />
            </main>

            <ServerDialog
                open={dialog.open}
                initial={dialog.initial}
                groups={groups}
                onClose={() => setDialog({open: false, initial: null})}
                onSaved={() => void reloadServers()}
                onSaveAndConnect={async (cfg: ServerConfig) => {
                    await reloadServers()
                    void connect(cfg)
                }}
            />

            <ConfirmModal state={confirm} onCancel={() => setConfirm(emptyConfirm)}/>

            <div className={g.toasts}>
                {toasts.map((t) => (
                    <div key={t.id} className={`${g.toast}${t.kind === 'error' ? ' ' + g.error : ''}`}>
                        {t.message}
                    </div>
                ))}
            </div>
        </div>
    )
}
