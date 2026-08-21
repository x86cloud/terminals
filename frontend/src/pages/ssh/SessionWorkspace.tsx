import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Button, Tooltip, Segmented } from 'antd'
import { PanelLeft, Folder, BarChart2, Play, Plug, Clock, Box, Maximize2, Minimize2, X } from 'lucide-react'
import TerminalView from '@/pages/ssh/terminal/TerminalView'
import FilePanel from '@/pages/ssh/file/FilePanel'
import DashboardPanel from '@/pages/ssh/dashboard/DashboardPanel'
import ProcessPanel from '@/pages/ssh/process/ProcessPanel'
import ServicePanel from '@/pages/ssh/service/ServicePanel'
import CronPanel from '@/pages/ssh/cron/CronPanel'
import DockerPanel from '@/pages/ssh/docker/DockerPanel'
import { SessionInfo } from '@/types'
import g from '@/styles/global.module.less'
import w from '@/pages/ssh/SessionWorkspace.module.less'

export interface SessionWorkspaceProps {
    session: SessionInfo
    active: boolean
    nativeDrop: boolean
    onPathChange: (sessionId: string, p: string) => void
    onNotify: (msg: string, kind?: 'info' | 'error') => void
}

export default function SessionWorkspace({
    session,
    active,
    nativeDrop,
    onPathChange,
    onNotify,
}: SessionWorkspaceProps) {
    const rootRef = useRef<HTMLDivElement | null>(null)
    const [panelWidth, setPanelWidth] = useState<number>(() => {
        const saved = localStorage.getItem('ssh_file_panel_width')
        if (saved) {
            const num = parseInt(saved, 10)
            if (!isNaN(num) && num >= 300 && num <= 1400) return num
        }
        return 540
    })
    const [showPanel, setShowPanel] = useState<boolean>(true)
    const [isMaximized, setIsMaximized] = useState<boolean>(false)
    const [activeTab, setActiveTab] = useState<'files' | 'process' | 'service' | 'cron' | 'docker' | 'dashboard'>('files')

    const draggingRef = useRef(false)
    const panelWidthRef = useRef(panelWidth)
    panelWidthRef.current = panelWidth

    const handlePath = useCallback(
        (p: string) => onPathChange(session.id, p),
        [session.id, onPathChange]
    )

    useEffect(() => {
        const onMouseMove = (e: MouseEvent) => {
            if (!draggingRef.current || !rootRef.current) return
            const rect = rootRef.current.getBoundingClientRect()
            const rawWidth = rect.right - e.clientX
            const clamped = Math.min(1200, Math.max(300, rawWidth))
            setPanelWidth(clamped)
        }

        const onMouseUp = () => {
            if (draggingRef.current) {
                draggingRef.current = false
                document.body.classList.remove('resizing')
                localStorage.setItem('ssh_file_panel_width', String(panelWidthRef.current))
            }
        }

        window.addEventListener('mousemove', onMouseMove)
        window.addEventListener('mouseup', onMouseUp)
        return () => {
            window.removeEventListener('mousemove', onMouseMove)
            window.removeEventListener('mouseup', onMouseUp)
        }
    }, [])

    const toggleShowPanel = useCallback(() => {
        setShowPanel((prev) => !prev)
    }, [])

    const toggleMaximized = useCallback(() => {
        setIsMaximized((prev) => !prev)
    }, [])

    return (
        <div ref={rootRef} className={w.workspace} style={{ display: active ? 'flex' : 'none' }}>
            <div className={w.terminalPane} style={{ display: showPanel && isMaximized ? 'none' : 'block' }}>
                <TerminalView sessionId={session.id} active={active} />
                <Tooltip title={showPanel ? '隐藏侧栏面板' : '显示侧栏面板'}>
                    <Button
                        size="small"
                        type="text"
                        className={w.panelToggle}
                        icon={<PanelLeft size={15} />}
                        onClick={toggleShowPanel}
                    />
                </Tooltip>
            </div>

            {showPanel && (
                <>
                    {!isMaximized && (
                        <div
                            className={w.splitter}
                            onMouseDown={() => {
                                draggingRef.current = true
                                document.body.classList.add('resizing')
                            }}
                        />
                    )}
                    <div className={w.filePane} style={{ width: isMaximized ? '100%' : panelWidth, flex: isMaximized ? '1' : 'none' }}>
                        <div className={w.panelHeader}>
                            <div className={w.panelTabsScroll}>
                                <Segmented
                                    size="small"
                                    value={activeTab}
                                    onChange={(val) => setActiveTab(val as any)}
                                    options={[
                                        { label: <span className={w.tabLabel}><Folder size={13} /> 文件</span>, value: 'files' },
                                        { label: <span className={w.tabLabel}><BarChart2 size={13} /> 仪表盘</span>, value: 'dashboard' },
                                        { label: <span className={w.tabLabel}><Play size={13} /> 进程</span>, value: 'process' },
                                        { label: <span className={w.tabLabel}><Plug size={13} /> 服务</span>, value: 'service' },
                                        { label: <span className={w.tabLabel}><Clock size={13} /> 定时任务</span>, value: 'cron' },
                                        { label: <span className={w.tabLabel}><Box size={13} /> Docker</span>, value: 'docker' },
                                    ]}
                                />
                            </div>
                            <div className={w.panelHeaderActions}>
                                <Tooltip title={isMaximized ? '还原侧栏面板' : '侧栏面板占满'}>
                                    <Button
                                        size="small"
                                        type="text"
                                        icon={isMaximized ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
                                        onClick={toggleMaximized}
                                    />
                                </Tooltip>
                                <Tooltip title="隐藏侧栏面板">
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
                                    onNotify={onNotify}
                                />
                            </div>
                            <DashboardPanel
                                sessionId={session.id}
                                active={activeTab === 'dashboard'}
                                onNotify={onNotify}
                            />
                            <ProcessPanel
                                sessionId={session.id}
                                active={activeTab === 'process'}
                                onNotify={onNotify}
                            />
                            <ServicePanel
                                sessionId={session.id}
                                active={activeTab === 'service'}
                                onNotify={onNotify}
                            />
                            <CronPanel
                                sessionId={session.id}
                                active={activeTab === 'cron'}
                                onNotify={onNotify}
                            />
                            <DockerPanel
                                sessionId={session.id}
                                active={activeTab === 'docker'}
                                onNotify={onNotify}
                            />
                        </div>
                    </div>
                </>
            )}
        </div>
    )
}
