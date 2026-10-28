import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, Tooltip, Segmented } from 'antd'
import { Folder, BarChart2, Play, Plug, Clock, Maximize2, Minimize2, X, ChevronLeft, ChevronRight } from 'lucide-react'
import TerminalView from '@/pages/ssh/terminal/TerminalView'
import FilePanel from '@/pages/ssh/file/FilePanel'
import DashboardPanel from '@/pages/ssh/dashboard/DashboardPanel'
import ProcessPanel from '@/pages/ssh/process/ProcessPanel'
import ServicePanel from '@/pages/ssh/service/ServicePanel'
import CronPanel from '@/pages/ssh/cron/CronPanel'
import { SessionInfo } from '@/types'
import { appStorage, StorageKey } from '@/utils/storage'
import { useTranslation } from 'react-i18next'
import w from '@/pages/ssh/SessionWorkspace.module.less'

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
    const rootRef = useRef<HTMLDivElement | null>(null)
    const [panelWidth, setPanelWidth] = useState<number>(() => {
        const num = appStorage.getNumber(StorageKey.SshFilePanelWidth, 540)
        if (num >= 300 && num <= 1400) return num
        return 540
    })
    const [showPanel, setShowPanel] = useState<boolean>(false)
    const [isMaximized, setIsMaximized] = useState<boolean>(false)
    const [activeTab, setActiveTab] = useState<'files' | 'process' | 'service' | 'cron' | 'dashboard'>('files')
    const [isDragging, setIsDragging] = useState(false)
    const draggingRef = useRef(false)
    const panelWidthRef = useRef(panelWidth)
    panelWidthRef.current = panelWidth

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

    const toggleShowPanel = useCallback(() => {
        setShowPanel((prev) => !prev)
    }, [])

    const toggleMaximized = useCallback(() => {
        setIsMaximized((prev) => !prev)
    }, [])

    return (
        <div ref={rootRef} className={w.workspace} style={{ display: active ? 'block' : 'none' }}>
            {/* 底层全屏终端视图（100% 宽度，无论侧栏如何开闭均不被挤压变形） */}
            <div className={w.terminalPane}>
                <TerminalView sessionId={session.id} active={active} />
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
                    width: isMaximized ? '100%' : panelWidth,
                }}
            >
                {/* 居中浮动胶囊吸附手柄（展开状态按住拖拽调宽/单击收起；收起状态仅支持轻击展开，不支持拖拉） */}
                {!isMaximized && (
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
                )}

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
                    <div className={w.panelHeaderActions}>
                        <Tooltip title={isMaximized ? t('workspace.restorePanel') : t('workspace.maximizePanel')}>
                            <Button
                                size="small"
                                type="text"
                                icon={isMaximized ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
                                onClick={toggleMaximized}
                            />
                        </Tooltip>
                        <Tooltip title={t('workspace.collapsePanel')}>
                            <Button
                                size="small"
                                type="text"
                                icon={<X size={13} />}
                                onClick={toggleShowPanel}
                            />
                        </Tooltip>
                    </div>
                </div>

                <div className={w.panelContent}>
                    <div className={w.fileTabContent} style={{ display: activeTab === 'files' ? 'flex' : 'none' }}>
                        <FilePanel
                            sessionId={session.id}
                            homeDir={session.homeDir}
                            nativeDrop={nativeDrop}
                            onPathChange={handlePath}
                        />
                    </div>
                    <DashboardPanel
                        sessionId={session.id}
                        active={showPanel && activeTab === 'dashboard'}
                    />
                    <ProcessPanel
                        sessionId={session.id}
                        active={showPanel && activeTab === 'process'}
                    />
                    <ServicePanel
                        sessionId={session.id}
                        active={showPanel && activeTab === 'service'}
                    />
                    <CronPanel
                        sessionId={session.id}
                        active={showPanel && activeTab === 'cron'}
                    />
                </div>
            </div>
        </div>
    )
}
