import { useCallback, useEffect, useRef, useState } from 'react'
import { Segmented } from 'antd'
import { Folder, BarChart2, Play, Plug, Clock, ChevronLeft, ChevronRight } from 'lucide-react'
import TerminalView from '@/pages/ssh/terminal/TerminalView'
import FilePanel from '@/pages/ssh/file/FilePanel'
import DashboardPanel from '@/pages/ssh/dashboard/DashboardPanel'
import ProcessPanel from '@/pages/ssh/process/ProcessPanel'
import ServicePanel from '@/pages/ssh/service/ServicePanel'
import CronPanel from '@/pages/ssh/cron/CronPanel'
import DisconnectOverlay, { SshConnectionUiState } from '@/pages/ssh/DisconnectOverlay'
import { API, subscribe } from '@/api'
import { useSession } from '@/contexts/SessionContext'
import { SessionInfo, SshDisconnectCode, SshDisconnectedEvent } from '@/types'
import { errorMessage } from '@/utils'
import { appStorage, StorageKey } from '@/utils/storage'
import { useTranslation } from 'react-i18next'
import w from '@/pages/ssh/SessionWorkspace.module.less'

const MAX_AUTO_RECONNECT = 2
const AUTO_RECONNECT_DELAYS = [800, 1500]

export interface SessionWorkspaceProps {
    session: SessionInfo
    active: boolean
    nativeDrop: boolean
    onPathChange: (sessionId: string, p: string) => void
}

export default function SessionWorkspace({
    session,
    active,
    nativeDrop,
    onPathChange,
}: SessionWorkspaceProps) {
    const { t } = useTranslation('ssh')
    const { updateSession, closeSession } = useSession()
    const rootRef = useRef<HTMLDivElement | null>(null)
    const [panelWidth, setPanelWidth] = useState<number>(() => {
        const num = appStorage.getNumber(StorageKey.SshFilePanelWidth, 540)
        if (num >= 300 && num <= 1400) return num
        return 540
    })
    const [showPanel, setShowPanel] = useState<boolean>(false)
    const [activeTab, setActiveTab] = useState<'files' | 'process' | 'service' | 'cron' | 'dashboard'>('files')
    const [isDragging, setIsDragging] = useState(false)
    const draggingRef = useRef(false)
    const panelWidthRef = useRef(panelWidth)
    panelWidthRef.current = panelWidth

    // SSH 断线状态与自动/手动重连状态机
    const [connStatus, setConnStatus] = useState<SshConnectionUiState>('connected')
    const connStatusRef = useRef<SshConnectionUiState>('connected')
    connStatusRef.current = connStatus
    const [autoAttempt, setAutoAttempt] = useState(0)
    const [attemptInFlight, setAttemptInFlight] = useState(false)
    const [disconnectCode, setDisconnectCode] = useState<SshDisconnectCode>('unknown')
    const [rawReason, setRawReason] = useState('')
    const [reconnectError, setReconnectError] = useState('')
    const [reconnectSeq, setReconnectSeq] = useState(0)

    const termSizeRef = useRef<{ cols: number; rows: number }>({ cols: 120, rows: 32 })
    const opEpochRef = useRef(0)
    const inFlightRef = useRef(false)
    const retryTimerRef = useRef<number | null>(null)
    const unmountedRef = useRef(false)

    const clearRetryTimer = useCallback(() => {
        if (retryTimerRef.current !== null) {
            window.clearTimeout(retryTimerRef.current)
            retryTimerRef.current = null
        }
    }, [])

    useEffect(() => {
        unmountedRef.current = false
        return () => {
            unmountedRef.current = true
            opEpochRef.current += 1
            clearRetryTimer()
        }
    }, [clearRetryTimer])

    const handleTermDimensions = useCallback((cols: number, rows: number) => {
        if (cols > 0 && rows > 0) {
            termSizeRef.current = { cols, rows }
        }
    }, [])

    const sleepAbortable = useCallback(
        (ms: number, epoch: number): Promise<boolean> => {
            return new Promise((resolve) => {
                clearRetryTimer()
                retryTimerRef.current = window.setTimeout(() => {
                    retryTimerRef.current = null
                    resolve(!unmountedRef.current && opEpochRef.current === epoch)
                }, ms)
            })
        },
        [clearRetryTimer]
    )

    const attemptReconnect = useCallback(
        async (epoch: number): Promise<boolean> => {
            if (inFlightRef.current) return false
            inFlightRef.current = true
            setAttemptInFlight(true)
            updateSession('ssh', session.id, {
                connected: false,
                reconnectState: 'reconnecting',
            })

            try {
                const { cols, rows } = termSizeRef.current
                const info = await API.reconnect(session.id, cols, rows)
                if (unmountedRef.current || opEpochRef.current !== epoch) {
                    return false
                }
                updateSession('ssh', session.id, {
                    ...info,
                    connected: true,
                    reconnectState: 'connected',
                })
                setConnStatus('connected')
                setReconnectError('')
                setRawReason('')
                setAutoAttempt(0)
                setReconnectSeq((prev) => prev + 1)
                return true
            } catch (err) {
                if (!unmountedRef.current && opEpochRef.current === epoch) {
                    setReconnectError(errorMessage(err))
                }
                return false
            } finally {
                inFlightRef.current = false
                if (!unmountedRef.current) {
                    setAttemptInFlight(false)
                }
            }
        },
        [session.id, updateSession]
    )

    const runAutoReconnect = useCallback(
        async (code: SshDisconnectCode, reason: string) => {
            const epoch = ++opEpochRef.current
            clearRetryTimer()
            setDisconnectCode(code)
            setRawReason(reason)
            setReconnectError('')

            for (let i = 1; i <= MAX_AUTO_RECONNECT; i++) {
                if (unmountedRef.current || opEpochRef.current !== epoch) return
                setConnStatus('auto_reconnecting')
                setAutoAttempt(i)
                updateSession('ssh', session.id, {
                    connected: false,
                    reconnectState: 'reconnecting',
                })

                const delay = AUTO_RECONNECT_DELAYS[i - 1] ?? 1500
                const okWait = await sleepAbortable(delay, epoch)
                if (!okWait) return

                const ok = await attemptReconnect(epoch)
                if (ok || unmountedRef.current || opEpochRef.current !== epoch) return
            }

            setConnStatus('disconnected')
            updateSession('ssh', session.id, {
                connected: false,
                reconnectState: 'disconnected',
            })
        },
        [attemptReconnect, clearRetryTimer, session.id, sleepAbortable, updateSession]
    )

    const handleManualReconnect = useCallback(async () => {
        if (inFlightRef.current) return
        const epoch = ++opEpochRef.current
        clearRetryTimer()
        setConnStatus('manual_reconnecting')
        setReconnectError('')

        const ok = await attemptReconnect(epoch)
        if (!ok && !unmountedRef.current && opEpochRef.current === epoch) {
            setConnStatus('disconnected')
            updateSession('ssh', session.id, {
                connected: false,
                reconnectState: 'disconnected',
            })
        }
    }, [attemptReconnect, clearRetryTimer, session.id, updateSession])

    const handleCloseDisconnectedTab = useCallback(() => {
        opEpochRef.current += 1
        clearRetryTimer()
        void closeSession('ssh', session.id)
    }, [clearRetryTimer, closeSession, session.id])

    useEffect(() => {
        const off = subscribe('ssh:disconnected', (ev: SshDisconnectedEvent) => {
            if (!ev || ev.sessionId !== session.id) return
            if (ev.normalExit) return
            if (connStatusRef.current !== 'connected') return
            void runAutoReconnect(ev.code || 'unknown', ev.reason || '')
        })
        return () => {
            off()
        }
    }, [session.id, runAutoReconnect])

    const handlePath = useCallback(
        (p: string) => onPathChange(session.id, p),
        [session.id, onPathChange]
    )

    const startXRef = useRef(0)
    const hasDraggedRef = useRef(false)
    const showPanelRef = useRef(showPanel)
    showPanelRef.current = showPanel

    const onHandleMouseDown = useCallback((e: React.MouseEvent) => {
        if (e.button !== 0) return
        hasDraggedRef.current = false
        // 关键：侧栏收起状态下，不支持拖拉，直接让其走纯点击展开流程
        if (!showPanelRef.current) {
            return
        }
        startXRef.current = e.clientX
        draggingRef.current = true
        setIsDragging(true)
    }, [])

    useEffect(() => {
        if (!isDragging) return

        let rafId: number | null = null
        let latestWidth = panelWidthRef.current

        const onMouseMove = (e: MouseEvent) => {
            if (!showPanelRef.current) return
            const dx = Math.abs(e.clientX - startXRef.current)
            if (dx > 3) {
                hasDraggedRef.current = true
            }
            if (!hasDraggedRef.current) return

            if (!rootRef.current) return
            const rect = rootRef.current.getBoundingClientRect()
            const rawWidth = rect.right - e.clientX
            const maxAllowed = Math.max(300, Math.min(1200, (rect.width || 1200) - 200))
            latestWidth = Math.min(maxAllowed, Math.max(300, rawWidth))

            if (rafId === null) {
                rafId = requestAnimationFrame(() => {
                    rafId = null
                    setPanelWidth(latestWidth)
                })
            }
        }

        const onMouseUp = () => {
            if (rafId !== null) {
                cancelAnimationFrame(rafId)
                rafId = null
            }
            draggingRef.current = false
            setIsDragging(false)

            if (hasDraggedRef.current) {
                setPanelWidth(latestWidth)
                appStorage.set(StorageKey.SshFilePanelWidth, latestWidth)
            } else {
                // 展开状态下未拖拽，按短按单击处理：收起侧栏
                setShowPanel(false)
            }
        }

        window.addEventListener('mousemove', onMouseMove)
        window.addEventListener('mouseup', onMouseUp)
        return () => {
            if (rafId !== null) {
                cancelAnimationFrame(rafId)
                rafId = null
            }
            window.removeEventListener('mousemove', onMouseMove)
            window.removeEventListener('mouseup', onMouseUp)
        }
    }, [isDragging])

    return (
        <div ref={rootRef} className={w.workspace} style={{ display: active ? 'block' : 'none' }}>
            {/* 底层全屏终端视图（100% 宽度，无论侧栏如何开闭均不被挤压变形） */}
            <div className={w.terminalPane}>
                <TerminalView
                    sessionId={session.id}
                    active={active}
                    disabled={connStatus !== 'connected'}
                    reconnectSeq={reconnectSeq}
                    reconnectHost={session.title || `${session.host}:${session.port}`}
                    onDimensionsChange={handleTermDimensions}
                />
            </div>

            {/* 鼠标拖拽过程全屏捕获层 */}
            {isDragging && (
                <div
                    style={{
                        position: 'fixed',
                        inset: 0,
                        zIndex: 99999,
                        cursor: 'col-resize',
                        userSelect: 'none',
                    }}
                />
            )}

            {/* 顶层浮动侧栏抽屉 */}
            <div
                className={`${w.drawerPane} ${!showPanel ? w.closed : ''} ${isDragging ? w.dragging : ''}`}
                style={{
                    width: panelWidth,
                }}
            >
                {/* 居中浮动胶囊吸附手柄（展开状态按住拖拽调宽/单击收起；收起状态仅支持轻击展开，不支持拖拉） */}
                <div
                    className={w.edgeHandle}
                    onMouseDown={onHandleMouseDown}
                    onClick={() => {
                        if (!showPanel) {
                            setShowPanel(true)
                        }
                    }}
                >
                    {showPanel ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
                </div>

                <div className={w.panelHeader}>
                    <div className={w.panelTabsScroll}>
                        <Segmented
                            size="small"
                            value={activeTab}
                            onChange={(val) => setActiveTab(val as any)}
                            options={[
                                { label: <span className={w.tabLabel}><Folder size={13} /> {t('tabs.files')}</span>, value: 'files' },
                                { label: <span className={w.tabLabel}><BarChart2 size={13} /> {t('tabs.dashboard')}</span>, value: 'dashboard' },
                                { label: <span className={w.tabLabel}><Play size={13} /> {t('tabs.process')}</span>, value: 'process' },
                                { label: <span className={w.tabLabel}><Plug size={13} /> {t('tabs.service')}</span>, value: 'service' },
                                { label: <span className={w.tabLabel}><Clock size={13} /> {t('tabs.cron')}</span>, value: 'cron' },
                            ]}
                        />
                    </div>
                </div>

                <div className={w.panelContent}>
                    <div className={w.fileTabContent} style={{ display: activeTab === 'files' ? 'flex' : 'none' }}>
                        <FilePanel
                            sessionId={session.id}
                            homeDir={session.homeDir}
                            nativeDrop={nativeDrop}
                            reconnectSeq={reconnectSeq}
                            onPathChange={handlePath}
                        />
                    </div>
                    <DashboardPanel
                        sessionId={session.id}
                        active={showPanel && activeTab === 'dashboard'}
                        reconnectSeq={reconnectSeq}
                    />
                    <ProcessPanel
                        sessionId={session.id}
                        active={showPanel && activeTab === 'process'}
                        reconnectSeq={reconnectSeq}
                    />
                    <ServicePanel
                        sessionId={session.id}
                        active={showPanel && activeTab === 'service'}
                        reconnectSeq={reconnectSeq}
                    />
                    <CronPanel
                        sessionId={session.id}
                        active={showPanel && activeTab === 'cron'}
                        reconnectSeq={reconnectSeq}
                    />
                </div>
            </div>

            {connStatus !== 'connected' && (
                <DisconnectOverlay
                    session={session}
                    status={connStatus}
                    attempt={autoAttempt}
                    maxAttempts={MAX_AUTO_RECONNECT}
                    attemptInFlight={attemptInFlight}
                    disconnectCode={disconnectCode}
                    rawReason={rawReason}
                    errorDetail={reconnectError}
                    onReconnect={() => void handleManualReconnect()}
                    onClose={handleCloseDisconnectedTab}
                />
            )}
        </div>
    )
}
