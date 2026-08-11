import React, {useCallback, useEffect, useRef, useState} from 'react'
import Sidebar from './components/Sidebar'
import ServerDialog from './components/ServerDialog'
import SettingsModal from './pages/setting/SettingsModal'
import {ConfirmModal, ConfirmState} from './components/Modal'
import SessionTabs from './components/app/SessionTabs'
import Stage from './components/app/Stage'
import TransferBar from './components/TransferBar'
import {API, registerNativeFileDrop, subscribe, unregisterNativeFileDrop} from './api'
import {
    ServerConfig,
    ServerGroup,
    SessionInfo,
    Transfer,
    RedisSessionInfo,
    MysqlSessionInfo,
    MqttSessionInfo,
    MongoSessionInfo,
    SqliteSessionInfo,
    ConnType,
    AppSettings,
} from './types'
import {errorMessage} from './utils'
import {applyThemeMode, applyGlobalFont, getCachedSettings, setCachedSettings} from './utils/theme'
import g from './styles/global.module.less'
import a from './components/App.module.less'

interface Toast {
    id: number
    message: string
    kind: 'info' | 'error'
}

const emptyConfirm: ConfirmState = {open: false, title: '', message: ''}
type ActiveKind = ConnType | 'api' | 'devtools'

/* ========================================================================== */
/*                              协议连接辅助处理器                              */
/* ========================================================================== */

async function connectRedisHelper(cfg: ServerConfig): Promise<RedisSessionInfo> {
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

async function connectMysqlHelper(cfg: ServerConfig): Promise<MysqlSessionInfo> {
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

async function connectMqttHelper(cfg: ServerConfig): Promise<MqttSessionInfo> {
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

async function connectMongoHelper(cfg: ServerConfig): Promise<MongoSessionInfo> {
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

async function connectSqliteHelper(cfg: ServerConfig): Promise<SqliteSessionInfo | null> {
    let path = cfg.sqlitePath || ''
    if (!path) {
        path = await API.sqliteOpenFile()
        if (!path) return null
    }
    const ok = await API.sqliteConnect(cfg.id, path)
    if (!ok) throw new Error('无法打开该 SQLite 文件')
    const stat = await API.sqliteInfo(cfg.id).catch(() => ({path, size: 0}))
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

/* ========================================================================== */
/*                               App 主组件                                   */
/* ========================================================================== */

export default function App() {
    // ---- 服务器与分组 ----
    const [servers, setServers] = useState<ServerConfig[]>([])
    const [groups, setGroups] = useState<ServerGroup[]>([])
    const [connectingId, setConnectingId] = useState<string | null>(null)

    // ---- 会话列表与激活态 ----
    const [sessions, setSessions] = useState<SessionInfo[]>([])
    const [activeId, setActiveId] = useState<string | null>(null)

    const [redisSessions, setRedisSessions] = useState<RedisSessionInfo[]>([])
    const [activeRedisId, setActiveRedisId] = useState<string | null>(null)

    const [mysqlSessions, setMysqlSessions] = useState<MysqlSessionInfo[]>([])
    const [activeMysqlId, setActiveMysqlId] = useState<string | null>(null)

    const [mqttSessions, setMqttSessions] = useState<MqttSessionInfo[]>([])
    const [activeMqttId, setActiveMqttId] = useState<string | null>(null)

    const [mongoSessions, setMongoSessions] = useState<MongoSessionInfo[]>([])
    const [activeMongoId, setActiveMongoId] = useState<string | null>(null)

    const [sqliteSessions, setSqliteSessions] = useState<SqliteSessionInfo[]>([])
    const [activeSqliteId, setActiveSqliteId] = useState<string | null>(null)

    // ---- 工具面板 (API 调试 / 开发工具集 / AI 智能体 / 设置) ----
    const [apiOpen, setApiOpen] = useState(false)
    const [apiActive, setApiActive] = useState(false)
    const [devToolsOpen, setDevToolsOpen] = useState(false)
    const [devToolsActive, setDevToolsActive] = useState(false)
    const [aiAgentOpen, setAiAgentOpen] = useState(false)
    const [aiAgentActive, setAiAgentActive] = useState(false)
    const [settingsOpen, setSettingsOpen] = useState(false)
    const [settings, setSettings] = useState<AppSettings>(getCachedSettings())

    // ---- 全局 UI 状态 ----
    const [transfers, setTransfers] = useState<Transfer[]>([])
    const [dialog, setDialog] = useState<{ open: boolean; initial: ServerConfig | null }>({
        open: false,
        initial: null,
    })
    const [confirm, setConfirm] = useState<ConfirmState>(emptyConfirm)
    const [toasts, setToasts] = useState<Toast[]>([])
    const [nativeDrop, setNativeDrop] = useState(true)

    // 辅助 Ref 引用
    const activeIdRef = useRef<string | null>(null)
    const pathsRef = useRef<Record<string, string>>({})
    const connectingRef = useRef<Set<string>>(new Set())

    // ---- 通知与激活态同步 ----
    const notify = useCallback((message: string, kind: 'info' | 'error' = 'info') => {
        const id = Date.now() + Math.random()
        setToasts((prev) => [...prev, {id, message, kind}])
        window.setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000)
    }, [])

    const activateTab = useCallback((kind: 'ssh' | 'redis' | 'mysql' | 'mqtt' | 'mongo' | 'sqlite' | 'api' | 'devtools' | 'aiAgent' | null, id: string | null = null) => {
        setActiveId(kind === 'ssh' ? id : null)
        setActiveRedisId(kind === 'redis' ? id : null)
        setActiveMysqlId(kind === 'mysql' ? id : null)
        setActiveMqttId(kind === 'mqtt' ? id : null)
        setActiveMongoId(kind === 'mongo' ? id : null)
        setActiveSqliteId(kind === 'sqlite' ? id : null)
        setApiActive(kind === 'api')
        setDevToolsActive(kind === 'devtools')
        setAiAgentActive(kind === 'aiAgent')
    }, [])

    /* ---------------- 基础数据加载与事件订阅 ---------------- */

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

    const reloadSettings = useCallback(async () => {
        try {
            const s = await API.getAppSettings()
            if (s) {
                setSettings(s)
                setCachedSettings(s)
                applyThemeMode(s.themeMode)
                applyGlobalFont(s.globalFontFamily)
            }
        } catch {
            // fallback
        }
    }, [])

    const handleSaveSettings = useCallback(async (newSettings: AppSettings) => {
        try {
            const saved = await API.saveAppSettings(newSettings)
            setSettings(saved)
            setCachedSettings(saved)
            applyThemeMode(saved.themeMode)
            applyGlobalFont(saved.globalFontFamily)
            notify('设置已保存并全域应用', 'info')
        } catch (err) {
            notify(errorMessage(err), 'error')
        }
    }, [notify])

    useEffect(() => {
        void reloadServers()
        void reloadGroups()
        void reloadSettings()
        API.listTransfers()
            .then((list) => setTransfers(list || []))
            .catch(() => undefined)
    }, [reloadServers, reloadGroups, reloadSettings])

    useEffect(() => {
        applyThemeMode(settings.themeMode)
        applyGlobalFont(settings.globalFontFamily)
        const media = window.matchMedia('(prefers-color-scheme: dark)')
        const listener = () => {
            if (settings.themeMode === 'system') {
                applyThemeMode('system')
            }
        }
        if (media.addEventListener) {
            media.addEventListener('change', listener)
        }
        return () => {
            if (media.removeEventListener) {
                media.removeEventListener('change', listener)
            }
        }
    }, [settings.themeMode, settings.globalFontFamily])

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
        const offAsk = subscribe('agent:ask', () => {
            setAiAgentOpen(true)
            activateTab('aiAgent')
        })
        return () => {
            offTransfer()
            offClosed()
            offAsk()
        }
    }, [activateTab])

    /* ---------------- 系统级文件拖拽 ---------------- */

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

    /* ---------------- 服务器配置管理 ---------------- */

    const addServer = useCallback(() => {
        setDialog({open: true, initial: null})
    }, [])

    const editServer = useCallback((cfg: ServerConfig) => {
        setDialog({open: true, initial: cfg})
    }, [])

    const deleteServer = useCallback((cfg: ServerConfig) => {
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
    }, [notify, reloadServers])

    /* ---------------- 连接逻辑统一分发 ---------------- */

    const connect = useCallback(
        async (cfg: ServerConfig) => {
            if (connectingRef.current.has(cfg.id)) return
            connectingRef.current.add(cfg.id)
            setConnectingId(cfg.id)
            try {
                switch (cfg.type) {
                    case 'redis': {
                        const info = await connectRedisHelper(cfg)
                        setRedisSessions((prev) => [...prev.filter((s) => s.id !== cfg.id), info])
                        setActiveRedisId(cfg.id)
                        activateTab('redis', cfg.id)
                        notify(`已连接 Redis ${info.title}`)
                        break
                    }
                    case 'mysql': {
                        const info = await connectMysqlHelper(cfg)
                        setMysqlSessions((prev) => [...prev.filter((s) => s.id !== cfg.id), info])
                        setActiveMysqlId(cfg.id)
                        activateTab('mysql', cfg.id)
                        notify(`已连接 MySQL ${info.title}`)
                        break
                    }
                    case 'mqtt': {
                        const info = await connectMqttHelper(cfg)
                        setMqttSessions((prev) => [...prev.filter((s) => s.id !== cfg.id), info])
                        setActiveMqttId(cfg.id)
                        activateTab('mqtt', cfg.id)
                        notify(`已连接 MQTT ${info.host}:${info.port}`)
                        break
                    }
                    case 'mongo': {
                        const info = await connectMongoHelper(cfg)
                        setMongoSessions((prev) => [...prev.filter((s) => s.id !== cfg.id), info])
                        setActiveMongoId(cfg.id)
                        activateTab('mongo', cfg.id)
                        notify(`已连接 MongoDB ${info.title}`)
                        break
                    }
                    case 'sqlite': {
                        const info = await connectSqliteHelper(cfg)
                        if (!info) {
                            notify('未选择文件', 'info')
                            return
                        }
                        setSqliteSessions((prev) => [...prev.filter((s) => s.id !== cfg.id), info])
                        setActiveSqliteId(cfg.id)
                        activateTab('sqlite', cfg.id)
                        notify(`已打开 SQLite 文件：${info.title}`)
                        break
                    }
                    default: {
                        const info = await API.connect(cfg.id, 120, 32)
                        setSessions((prev) => [...prev, info])
                        setActiveId(info.id)
                        activateTab('ssh', info.id)
                        pathsRef.current[info.id] = info.homeDir || '/'
                        notify(`已连接 ${info.title}`)
                        break
                    }
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

    /* ---------------- 会话关闭与回退规则 ---------------- */

    const applyActive = useCallback((target: { kind: ConnType; id: string } | null) => {
        activateTab(target ? target.kind : null, target ? target.id : null)
    }, [activateTab])

    const pickFallback = useCallback(
        (kind: ConnType, lists: Record<ConnType, Array<{ id: string }>>): { kind: ConnType; id: string } | null => {
            const rest = (['ssh', 'redis', 'mysql', 'mqtt', 'mongo', 'sqlite'] as ConnType[]).filter((k) => k !== kind)
            for (const k of [kind, ...rest]) {
                const list = lists[k]
                if (list && list.length) return { kind: k, id: list[list.length - 1].id }
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

    /* ---------------- 工具面板与 Tab 激活 ---------------- */

    const openAiAgent = useCallback(() => {
        setAiAgentOpen(true)
        activateTab('aiAgent')
    }, [activateTab])

    const closeAiAgent = useCallback(() => {
        setAiAgentOpen(false)
        setAiAgentActive(false)
    }, [])

    const openApiTool = useCallback(() => {
        setApiOpen(true)
        activateTab('api')
    }, [activateTab])

    const closeApiTool = useCallback(() => {
        setApiOpen(false)
        setApiActive(false)
    }, [])

    const openDevTools = useCallback(() => {
        setDevToolsOpen(true)
        activateTab('devtools')
    }, [activateTab])

    const closeDevTools = useCallback(() => {
        setDevToolsOpen(false)
        setDevToolsActive(false)
    }, [])

    const focusSession = useCallback((id: string, kind: ConnType) => {
        activateTab(kind, id)
    }, [activateTab])

    /* ---------------- UI 渲染 ---------------- */

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
                onOpenAiAgent={openAiAgent}
                onOpenApi={openApiTool}
                onOpenDevTools={openDevTools}
                onOpenSettings={() => setSettingsOpen(true)}
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
                    aiAgentOpen={aiAgentOpen}
                    aiAgentActive={aiAgentActive}
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
                    onActivateAiAgent={openAiAgent}
                    onCloseAiAgent={closeAiAgent}
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
                    aiAgentOpen={aiAgentOpen}
                    aiAgentActive={aiAgentActive}
                    devToolsOpen={devToolsOpen}
                    devToolsActive={devToolsActive}
                    apiOpen={apiOpen}
                    apiActive={apiActive}
                    settings={settings}
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
                    onCloseAiAgent={closeAiAgent}
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

            <SettingsModal
                open={settingsOpen}
                settings={settings}
                onClose={() => setSettingsOpen(false)}
                onSave={(newSettings) => {
                    void handleSaveSettings(newSettings)
                    setSettingsOpen(false)
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
