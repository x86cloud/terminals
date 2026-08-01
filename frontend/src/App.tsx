import React, {useCallback, useEffect, useRef, useState} from 'react'
import Sidebar from './components/Sidebar'
import SessionWorkspace from './components/SessionWorkspace'
import ServerDialog from './components/ServerDialog'
import RedisClient from './components/RedisClient'
import MysqlClient from './components/MysqlClient'
import MqttClient from './components/MqttClient'
import TransferBar from './components/TransferBar'
import Icon from './components/Icon'
import ClientIcon from './components/ClientIcon'
import {ConfirmModal, ConfirmState} from './components/Modal'
import {API, registerNativeFileDrop, subscribe, unregisterNativeFileDrop} from './api'
import {ServerConfig, SessionInfo, Transfer, RedisSessionInfo, MysqlSessionInfo, MqttSessionInfo, ConnType} from './types'
import {errorMessage} from './utils'
import g from './styles/global.module.less'
import a from './styles/App.module.less'

interface Toast {
    id: number
    message: string
    kind: 'info' | 'error'
}

const emptyConfirm: ConfirmState = {open: false, title: '', message: ''}

export default function App() {
    const [servers, setServers] = useState<ServerConfig[]>([])
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

    useEffect(() => {
        void reloadServers()
        API.listTransfers()
            .then((list) => setTransfers(list || []))
            .catch(() => undefined)
    }, [reloadServers])

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
                    const info: RedisSessionInfo = {
                        id: cfg.id,
                        serverId: cfg.id,
                        title: cfg.name || `${cfg.host}:${cfg.port || 6379}`,
                        host: cfg.host,
                        port: cfg.port || 6379,
                        connected: true,
                        db: cfg.db ?? 0,
                        dbSize,
                    }
                    setRedisSessions((prev) => [
                        ...prev.filter((s) => s.id !== cfg.id),
                        info,
                    ])
                    setActiveRedisId(cfg.id)
                    setActiveId(null)
                    setActiveMysqlId(null)
                    setActiveMqttId(null)
                    notify(`已连接 Redis ${info.title}`)
                } else if (cfg.type === 'mysql') {
                    const ok = await API.mysqlConnect(cfg.id)
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
                    setActiveId(null)
                    setActiveRedisId(null)
                    setActiveMqttId(null)
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
                    setActiveId(null)
                    setActiveRedisId(null)
                    setActiveMysqlId(null)
                    notify(`已连接 MQTT ${info.host}:${info.port}`)
                } else {
                    const info = await API.connect(cfg.id, 120, 32)
                    setSessions((prev) => [...prev, info])
                    setActiveId(info.id)
                    setActiveRedisId(null)
                    setActiveMysqlId(null)
                    setActiveMqttId(null)
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
        [notify]
    )

    // 将激活指针同步为唯一一个会话（其余类型置空），无目标则全部置空
    const applyActive = useCallback((target: { kind: ConnType; id: string } | null) => {
        setActiveId(target && target.kind === 'ssh' ? target.id : null)
        setActiveRedisId(target && target.kind === 'redis' ? target.id : null)
        setActiveMysqlId(target && target.kind === 'mysql' ? target.id : null)
        setActiveMqttId(target && target.kind === 'mqtt' ? target.id : null)
    }, [])

    // 关闭激活会话后挑选唯一的回退目标：优先同类型剩余会话，其次按 ssh > redis > mysql > mqtt 顺序
    // lists 中被关闭类型需传入已过滤的 remaining，避免读取到陈旧（未删除）的会话
    const pickFallback = useCallback(
        (kind: ConnType, lists: Record<ConnType, Array<{ id: string }>>): { kind: ConnType; id: string } | null => {
            const rest = (['ssh', 'redis', 'mysql', 'mqtt'] as ConnType[]).filter((k) => k !== kind)
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
            applyActive(pickFallback('ssh', { ssh: remaining, redis: redisSessions, mysql: mysqlSessions, mqtt: mqttSessions }))
        },
        [sessions, redisSessions, mysqlSessions, mqttSessions, activeId, applyActive, pickFallback]
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
        applyActive(pickFallback('redis', { ssh: sessions, redis: remaining, mysql: mysqlSessions, mqtt: mqttSessions }))
    }, [sessions, redisSessions, mysqlSessions, mqttSessions, activeRedisId, applyActive, pickFallback])

    const closeMysqlSession = useCallback(async (id: string) => {
        try {
            await API.mysqlClose(id)
        } catch {
            /* ignore */
        }
        const remaining = mysqlSessions.filter((s) => s.id !== id)
        setMysqlSessions(remaining)
        if (activeMysqlId !== id) return
        applyActive(pickFallback('mysql', { ssh: sessions, redis: redisSessions, mysql: remaining, mqtt: mqttSessions }))
    }, [sessions, redisSessions, mysqlSessions, mqttSessions, activeMysqlId, applyActive, pickFallback])

    const closeMqttSession = useCallback(async (id: string) => {
        try {
            await API.mqttClose(id)
        } catch {
            /* ignore */
        }
        const remaining = mqttSessions.filter((s) => s.id !== id)
        setMqttSessions(remaining)
        if (activeMqttId !== id) return
        applyActive(pickFallback('mqtt', { ssh: sessions, redis: redisSessions, mysql: mysqlSessions, mqtt: remaining }))
    }, [sessions, redisSessions, mysqlSessions, mqttSessions, activeMqttId, applyActive, pickFallback])

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

    // 同一时刻只显示一个操作窗口：聚焦某一类会话时清空其它类型的 active。
    const focusSession = useCallback((id: string, kind: ConnType) => {
        // 任意时刻只激活一种会话：目标类型置为 id，其余全部置空
        setActiveId(kind === 'ssh' ? id : null)
        setActiveRedisId(kind === 'redis' ? id : null)
        setActiveMysqlId(kind === 'mysql' ? id : null)
        setActiveMqttId(kind === 'mqtt' ? id : null)
    }, [])

    return (
        <div className={a.app}>
            <Sidebar
                servers={servers}
                sessions={sessions}
                activeSessionId={activeId}
                connectingId={connectingId}
                redisSessions={redisSessions}
                activeRedisId={activeRedisId}
                mysqlSessions={mysqlSessions}
                activeMysqlId={activeMysqlId}
                mqttSessions={mqttSessions}
                activeMqttId={activeMqttId}
                onNew={addServer}
                onEdit={editServer}
                onDelete={deleteServer}
                onConnect={connect}
                onFocusSession={(id, kind) => focusSession(id, kind)}
            />

            <main className={a.main}>
                <div className={a.tabbar}>
                    {sessions.map((s) => (
                        <div
                            key={s.id}
                            className={`${a.tab}${s.id === activeId ? ' ' + a.active : ''}`}
                            onClick={() => focusSession(s.id, 'ssh')}
                        >
                            <ClientIcon kind="ssh" size={12}/>
                            <span className={`${g.dot}${s.connected ? ' ' + g.on : ''}`}/>
                            <span className={a.tabTitle}>{s.title}</span>
                            <button
                                className={a.tabClose}
                                title="关闭会话"
                                onClick={(e) => {
                                    e.stopPropagation()
                                    void closeSession(s.id)
                                }}
                            >
                                <Icon name="close" size={13}/>
                            </button>
                        </div>
                    ))}
                    {redisSessions.map((s) => (
                        <div
                            key={s.id}
                            className={`${a.tab}${s.id === activeRedisId ? ' ' + a.active : ''}`}
                            onClick={() => focusSession(s.id, 'redis')}
                        >
                            <ClientIcon kind="redis" size={12}/>
                            <span className={`${g.dot} ${g.on}`}/>
                            <span className={a.tabTitle}>{s.title} · DB{s.db}</span>
                            <button
                                className={a.tabClose}
                                title="关闭连接"
                                onClick={(e) => {
                                    e.stopPropagation()
                                    void closeRedisSession(s.id)
                                }}
                            >
                                <Icon name="close" size={13}/>
                            </button>
                        </div>
                    ))}
                    {mysqlSessions.map((s) => (
                        <div
                            key={s.id}
                            className={`${a.tab}${s.id === activeMysqlId ? ' ' + a.active : ''}`}
                            onClick={() => focusSession(s.id, 'mysql')}
                        >
                            <ClientIcon kind="mysql" size={12}/>
                            <span className={`${g.dot} ${g.on}`}/>
                            <span className={a.tabTitle}>{s.title}{s.database ? ` · ${s.database}` : ''}</span>
                            <button
                                className={a.tabClose}
                                title="关闭连接"
                                onClick={(e) => {
                                    e.stopPropagation()
                                    void closeMysqlSession(s.id)
                                }}
                            >
                                <Icon name="close" size={13}/>
                            </button>
                        </div>
                    ))}
                    {mqttSessions.map((s) => (
                        <div
                            key={s.id}
                            className={`${a.tab}${s.id === activeMqttId ? ' ' + a.active : ''}`}
                            onClick={() => focusSession(s.id, 'mqtt')}
                        >
                            <ClientIcon kind="mqtt" size={12}/>
                            <span className={`${g.dot} ${g.on}`}/>
                            <span className={a.tabTitle}>{s.host}:{s.port}</span>
                            <button
                                className={a.tabClose}
                                title="关闭连接"
                                onClick={(e) => {
                                    e.stopPropagation()
                                    void closeMqttSession(s.id)
                                }}
                            >
                                <Icon name="close" size={13}/>
                            </button>
                        </div>
                    ))}
                    <span className={g.spacer}/>
                </div>

                <div className={a.stage}>
                    {sessions.map((s) => (
                        <SessionWorkspace
                            key={s.id}
                            session={s}
                            active={s.id === activeId}
                            nativeDrop={nativeDrop}
                            onPathChange={handlePathChange}
                            onNotify={notify}
                        />
                    ))}

                    {redisSessions.map((s) => (
                        <div key={s.id} style={{display: s.id === activeRedisId ? 'flex' : 'none', flex: 1, minHeight: 0, minWidth: 0}}>
                            <RedisClient
                                session={s}
                                onClose={() => void closeRedisSession(s.id)}
                                onDbChange={(id, db, dbSize) =>
                                    setRedisSessions((prev) =>
                                        prev.map((x) => (x.id === id ? {...x, db, dbSize} : x))
                                    )
                                }
                            />
                        </div>
                    ))}

                    {mysqlSessions.map((s) => (
                        <div key={s.id} style={{display: s.id === activeMysqlId ? 'flex' : 'none', flex: 1, minHeight: 0, minWidth: 0}}>
                            <MysqlClient
                                session={s}
                                onClose={() => void closeMysqlSession(s.id)}
                                onChange={(id, database) =>
                                    setMysqlSessions((prev) =>
                                        prev.map((x) => (x.id === id ? {...x, database} : x))
                                    )
                                }
                            />
                        </div>
                    ))}

                    {mqttSessions.map((s) => (
                        <div key={s.id} style={{display: s.id === activeMqttId ? 'flex' : 'none', flex: 1, minHeight: 0, minWidth: 0}}>
                            <MqttClient
                                session={s}
                                onClose={() => void closeMqttSession(s.id)}
                            />
                        </div>
                    ))}

                    {sessions.length === 0 && redisSessions.length === 0 && mysqlSessions.length === 0 && mqttSessions.length === 0 && (
                        <div className={g.emptyStage}>
                            <Icon name="terminal" size={44}/>
                            <h2>SSH 终端 + SFTP 文件管理</h2>
                            <p>在左侧添加服务器（SSH、Redis、MySQL 或 MQTT）后双击即可连接。MQTT 客户端支持主题订阅、消息发布与实时收发。</p>
                            <div className={g.emptyActions}>
                                <button className={`${g.btn} ${g.primary}`} onClick={() => addServer()}>新建服务器</button>
                            </div>
                        </div>
                    )}
                </div>

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
