import React, {useCallback, useEffect, useRef, useState} from 'react'
import Sidebar from './components/Sidebar'
import SessionWorkspace from './components/SessionWorkspace'
import ServerDialog from './components/ServerDialog'
import TransferBar from './components/TransferBar'
import Icon from './components/Icon'
import {ConfirmModal, ConfirmState} from './components/Modal'
import {API, registerNativeFileDrop, subscribe, unregisterNativeFileDrop} from './api'
import {ServerConfig, SessionInfo, Transfer} from './types'
import {errorMessage} from './utils'

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

    /* ---------------- 会话操作 ---------------- */

    const connect = useCallback(
        async (cfg: ServerConfig) => {
            if (connectingRef.current.has(cfg.id)) return
            connectingRef.current.add(cfg.id)
            setConnectingId(cfg.id)
            try {
                const info = await API.connect(cfg.id, 120, 32)
                setSessions((prev) => [...prev, info])
                setActiveId(info.id)
                pathsRef.current[info.id] = info.homeDir || '/'
                notify(`已连接 ${info.title}`)
            } catch (err) {
                notify(errorMessage(err), 'error')
            } finally {
                connectingRef.current.delete(cfg.id)
                setConnectingId(null)
            }
        },
        [notify]
    )

    const closeSession = useCallback(
        async (sessionId: string) => {
            try {
                await API.disconnect(sessionId)
            } catch {
                /* ignore */
            }
            setSessions((prev) => {
                const next = prev.filter((s) => s.id !== sessionId)
                setActiveId((current) => {
                    if (current !== sessionId) return current
                    return next.length ? next[next.length - 1].id : null
                })
                return next
            })
            delete pathsRef.current[sessionId]
        },
        []
    )

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

    return (
        <div className="app">
            <Sidebar
                servers={servers}
                sessions={sessions}
                activeSessionId={activeId}
                connectingId={connectingId}
                onNew={() => setDialog({open: true, initial: null})}
                onEdit={(cfg) => setDialog({open: true, initial: cfg})}
                onDelete={deleteServer}
                onConnect={connect}
                onFocusSession={setActiveId}
            />

            <main className="main">
                <div className="tabbar">
                    {sessions.map((s) => (
                        <div
                            key={s.id}
                            className={`tab${s.id === activeId ? ' active' : ''}`}
                            onClick={() => setActiveId(s.id)}
                        >
                            <span className={`dot${s.connected ? ' on' : ''}`}/>
                            <span className="tab-title">{s.title}</span>
                            <button
                                className="tab-close"
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
                    <span className="spacer"/>
                </div>

                <div className="stage">
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

                    {sessions.length === 0 && (
                        <div className="empty-stage">
                            <Icon name="terminal" size={44}/>
                            <h2>SSH 终端 + SFTP 文件管理</h2>
                            <p>在左侧添加服务器后双击即可连接；连接后右侧文件面板支持拖拽上传、右键下载/删除。</p>
                            <button className="btn primary" onClick={() => setDialog({open: true, initial: null})}>
                                新建服务器
                            </button>
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
                onSaveAndConnect={async (cfg) => {
                    await reloadServers()
                    void connect(cfg)
                }}
            />

            <ConfirmModal state={confirm} onCancel={() => setConfirm(emptyConfirm)}/>

            <div className="toasts">
                {toasts.map((t) => (
                    <div key={t.id} className={`toast ${t.kind}`}>
                        {t.message}
                    </div>
                ))}
            </div>
        </div>
    )
}
