import React, { useCallback, useEffect, useRef, useState } from 'react'
import { ConfigProvider, App as AntdApp, message } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { getAntdTheme } from './theme'
import { ThemeContext } from '@/contexts/ThemeContext'
import { SessionProvider, useSession } from '@/contexts/SessionContext'
import {
    connectK8sHelper,
    connectDockerHelper,
    connectRedisHelper,
    connectMysqlHelper,
    connectPostgresHelper,
    connectMqttHelper,
    connectMongoHelper,
    connectSqliteHelper,
} from '@/contexts/sessionHelpers'
import Sidebar from '@/components/Sidebar'
import TitleBar from '@/components/TitleBar'
import ServerDialog from '@/components/ServerDialog'
import SettingsModal from '@/pages/setting/SettingsModal'
import { ConfirmModal, ConfirmState } from '@/components/Modal'
import SessionTabs from '@/components/app/SessionTabs'
import Stage from '@/components/app/Stage'
import AiSidebar from '@/components/app/AiSidebar'
import TransferBar from '@/components/TransferBar'
import { API, registerNativeFileDrop, setPendingAsk, subscribe, unregisterNativeFileDrop } from '@/api'
import {
    ServerConfig,
    ServerGroup,
    Transfer,
    AppSettings,
} from '@/types'
import { errorMessage } from '@/utils'
import { applyThemeMode, applyGlobalFont, getCachedSettings, setCachedSettings } from '@/utils/theme'
import a from '@/components/App.module.less'

const emptyConfirm: ConfirmState = { open: false, title: '', message: '' }

/* ========================================================================== */
/*                               App 内部主组件                                */
/* ========================================================================== */

interface AppContentProps {
    settings: AppSettings
    onUpdateSettings: (newSettings: AppSettings) => Promise<void>
    onToggleTheme: () => void
}

function AppContent({ settings, onUpdateSettings, onToggleTheme }: AppContentProps) {
    const {
        activeTarget,
        addSession,
        closeSession,
        openTool,
        sidebarOpen,
    } = useSession()

    // ---- 服务器与分组 ----
    const [servers, setServers] = useState<ServerConfig[]>([])
    const [groups, setGroups] = useState<ServerGroup[]>([])
    const [connectingId, setConnectingId] = useState<string | null>(null)

    // ---- 设置与弹窗 ----
    const [settingsOpen, setSettingsOpen] = useState(false)
    const [transfers, setTransfers] = useState<Transfer[]>([])
    const [dialog, setDialog] = useState<{ open: boolean; initial: ServerConfig | null }>({
        open: false,
        initial: null,
    })
    const [confirm, setConfirm] = useState<ConfirmState>(emptyConfirm)
    const [nativeDrop, setNativeDrop] = useState(true)

    // 辅助 Ref 引用
    const activeIdRef = useRef<string | null>(null)
    const pathsRef = useRef<Record<string, string>>({})
    const connectingRef = useRef<Set<string>>(new Set())

    /* ---------------- 基础数据加载与事件订阅 ---------------- */

    const reloadServers = useCallback(async () => {
        try {
            setServers((await API.listServers()) || [])
        } catch (err) {
            message.error(errorMessage(err))
        }
    }, [])

    const reloadGroups = useCallback(async () => {
        try {
            setGroups((await API.listGroups()) || [])
        } catch (err) {
            message.error(errorMessage(err))
        }
    }, [])

    const createGroup = useCallback(async (): Promise<ServerGroup> => {
        const g = await API.saveGroup({ id: '', name: '新建分组' })
        await reloadGroups()
        return g
    }, [reloadGroups])

    const renameGroup = useCallback(
        async (g: ServerGroup) => {
            try {
                await API.saveGroup(g)
                await reloadGroups()
            } catch (err) {
                message.error(errorMessage(err))
            }
        },
        [reloadGroups]
    )

    const deleteGroup = useCallback(
        (id: string) => {
            const grp = groups.find((g) => g.id === id)
            setConfirm({
                open: true,
                title: '删除分组',
                danger: true,
                message: `确定要删除分组“${grp?.name || '此分组'}”吗？组内服务器将被移动到未分组。`,
                onConfirm: async () => {
                    setConfirm(emptyConfirm)
                    try {
                        await API.deleteGroup(id)
                        await reloadGroups()
                        await reloadServers()
                    } catch (err) {
                        message.error(errorMessage(err))
                    }
                },
            })
        },
        [groups, reloadGroups, reloadServers]
    )

    const moveServer = useCallback(
        async (serverId: string, groupId: string) => {
            try {
                await API.moveServerToGroup(serverId, groupId)
                await reloadServers()
            } catch (err) {
                message.error(errorMessage(err))
            }
        },
        [reloadServers]
    )

    useEffect(() => {
        void reloadServers()
        void reloadGroups()
    }, [reloadServers, reloadGroups])

    useEffect(() => {
        const offTransfer = subscribe('transfer:progress', (t: Transfer) => {
            setTransfers((prev) => {
                const idx = prev.findIndex((x) => x.id === t.id)
                if (idx >= 0) {
                    const next = [...prev]
                    next[idx] = t
                    return next
                }
                return [...prev, t]
            })
        })
        const offClosed = subscribe('session:closed', (sessionId: string) => {
            void closeSession('ssh', sessionId)
        })
        const offAsk = subscribe('ai_agent:ask', (question: string) => {
            setPendingAsk(question)
            openTool('aiAgent')
        })
        return () => {
            offTransfer()
            offClosed()
            offAsk()
        }
    }, [closeSession, openTool])

    /* ---------------- 系统级文件拖拽 ---------------- */

    const activeSshId = activeTarget?.kind === 'ssh' ? (activeTarget.id ?? null) : null
    useEffect(() => {
        activeIdRef.current = activeSshId
    }, [activeSshId])

    useEffect(() => {
        const ok = registerNativeFileDrop((paths) => {
            const sessionId = activeIdRef.current
            if (!sessionId) {
                message.warning('请先连接服务器再拖入文件')
                return
            }
            const remoteDir = pathsRef.current[sessionId] || '/'
            API.uploadPaths(sessionId, remoteDir, paths).catch((err) =>
                message.error(errorMessage(err))
            )
        })
        setNativeDrop(ok)
        return () => {
            if (ok) unregisterNativeFileDrop()
        }
    }, [])

    const handlePathChange = useCallback((sessionId: string, p: string) => {
        pathsRef.current[sessionId] = p
    }, [])

    /* ---------------- 服务器配置管理 ---------------- */

    const addServer = useCallback(() => {
        setDialog({ open: true, initial: null })
    }, [])

    const editServer = useCallback((cfg: ServerConfig) => {
        setDialog({ open: true, initial: cfg })
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
                    message.error(errorMessage(err))
                }
            },
        })
    }, [reloadServers])

    /* ---------------- 连接逻辑统一分发 ---------------- */

    const handleConnect = useCallback(
        async (cfg: ServerConfig) => {
            if (connectingRef.current.has(cfg.id)) return
            connectingRef.current.add(cfg.id)
            setConnectingId(cfg.id)
            try {
                switch (cfg.type) {
                    case 'redis': {
                        const info = await connectRedisHelper(cfg)
                        addSession('redis', info)
                        message.success(`已连接 Redis ${info.title}`)
                        break
                    }
                    case 'mysql': {
                        const info = await connectMysqlHelper(cfg)
                        addSession('mysql', info)
                        message.success(`已连接 MySQL ${info.title}`)
                        break
                    }
                    case 'postgres': {
                        const info = await connectPostgresHelper(cfg)
                        addSession('postgres', info)
                        message.success(`已连接 PostgreSQL ${info.title}`)
                        break
                    }
                    case 'mqtt': {
                        const info = await connectMqttHelper(cfg)
                        addSession('mqtt', info)
                        message.success(`已连接 MQTT ${info.host}:${info.port}`)
                        break
                    }
                    case 'mongo': {
                        const info = await connectMongoHelper(cfg)
                        addSession('mongo', info)
                        message.success(`已连接 MongoDB ${info.title}`)
                        break
                    }
                    case 'sqlite': {
                        const info = await connectSqliteHelper(cfg)
                        if (!info) {
                            message.info('未选择文件')
                            return
                        }
                        addSession('sqlite', info)
                        message.success(`已打开 SQLite 文件：${info.title}`)
                        break
                    }
                    case 'docker': {
                        const info = await connectDockerHelper(cfg)
                        addSession('docker', info)
                        message.success(`已连接 Docker ${info.title}`)
                        break
                    }
                    case 'k8s': {
                        const info = await connectK8sHelper(cfg)
                        addSession('k8s', info)
                        message.success(`已连接 Kubernetes ${info.title}`)
                        break
                    }
                    default: {
                        const info = await API.connect(cfg.id, 120, 32)
                        addSession('ssh', info)
                        pathsRef.current[info.id] = info.homeDir || '/'
                        message.success(`已连接 ${info.title}`)
                        break
                    }
                }
            } catch (err) {
                message.error(errorMessage(err))
            } finally {
                connectingRef.current.delete(cfg.id)
                setConnectingId(null)
            }
        },
        [addSession]
    )

    /* ---------------- UI 渲染 ---------------- */

    return (
        <div className={a.app}>
            <TitleBar
                onOpenSettings={() => setSettingsOpen(true)}
                themeMode={settings.themeMode}
                onToggleTheme={onToggleTheme}
            />

            <div className={a.body}>
                <Sidebar
                    servers={servers}
                    groups={groups}
                    connectingId={connectingId}
                    onNew={addServer}
                    onEdit={editServer}
                    onDelete={deleteServer}
                    onConnect={handleConnect}
                    onCreateGroup={createGroup}
                    onRenameGroup={renameGroup}
                    onDeleteGroup={deleteGroup}
                    onMoveServer={moveServer}
                    onOpenSettings={() => setSettingsOpen(true)}
                />

                <main className={a.main}>
                    <div className={`${a.mainCard} ${!sidebarOpen ? a.standalone : ''}`}>
                        <SessionTabs />

                        <Stage
                            nativeDrop={nativeDrop}
                            settings={settings}
                            onPathChange={handlePathChange}
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
                    </div>
                </main>

                <AiSidebar settings={settings} />
            </div>

            <ServerDialog
                open={dialog.open}
                initial={dialog.initial}
                groups={groups}
                onClose={() => setDialog({ open: false, initial: null })}
                onSaved={reloadServers}
                onSaveAndConnect={async (cfg: ServerConfig) => {
                    await reloadServers()
                    void handleConnect(cfg)
                }}
            />

            <SettingsModal
                open={settingsOpen}
                settings={settings}
                onClose={() => setSettingsOpen(false)}
                onSave={onUpdateSettings}
            />

            <ConfirmModal state={confirm} onCancel={() => setConfirm(emptyConfirm)} />
        </div>
    )
}

/* ========================================================================== */
/*                                App 顶层容器                                 */
/* ========================================================================== */

export default function App() {
    const [settings, setSettings] = useState<AppSettings>(() => {
        const cached = getCachedSettings()
        applyThemeMode(cached.themeMode)
        applyGlobalFont(cached.fontFamily)
        return cached
    })

    const handleUpdateSettings = useCallback(async (newSettings: AppSettings) => {
        setCachedSettings(newSettings)
        setSettings(newSettings)
        applyThemeMode(newSettings.themeMode)
        applyGlobalFont(newSettings.fontFamily)
        try {
            await API.saveAppSettings(newSettings)
        } catch {
            /* 忽略保存失败 */
        }
    }, [])

    const prefersDark =
        typeof window !== 'undefined' &&
        window.matchMedia &&
        window.matchMedia('(prefers-color-scheme: dark)').matches
    const isDark = settings.themeMode === 'dark' || (settings.themeMode === 'system' && !!prefersDark)

    const handleToggleTheme = useCallback(() => {
        const nextMode: 'light' | 'dark' = isDark ? 'light' : 'dark'
        const nextSettings: AppSettings = { ...settings, themeMode: nextMode }
        void handleUpdateSettings(nextSettings)
    }, [isDark, settings, handleUpdateSettings])

    return (
        <ConfigProvider locale={zhCN} theme={getAntdTheme(settings.themeMode)}>
            <AntdApp>
                <ThemeContext.Provider value={{ themeMode: settings.themeMode, isDark, toggleTheme: handleToggleTheme }}>
                    <SessionProvider>
                        <AppContent
                            settings={settings}
                            onUpdateSettings={handleUpdateSettings}
                            onToggleTheme={handleToggleTheme}
                        />
                    </SessionProvider>
                </ThemeContext.Provider>
            </AntdApp>
        </ConfigProvider>
    )
}
