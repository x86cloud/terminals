import React, { useCallback, useEffect, useRef, useState } from 'react'
import { PanelLeft, Folder, BarChart2, Play, Plug, Clock, Box, Maximize2, Minimize2, X } from 'lucide-react'
import TerminalView from './terminal/TerminalView'
import FilePanel from './file/FilePanel'
import DashboardPanel from './dashboard/DashboardPanel'
import ProcessPanel from './process/ProcessPanel'
import ServicePanel from './service/ServicePanel'
import CronPanel from './cron/CronPanel'
import DockerPanel from './docker/DockerPanel'
import { SessionInfo } from '../../types'
import g from '../../styles/global.module.less'
import w from './SessionWorkspace.module.less'

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
    const [panelWidth, setPanelWidth] = useState<number>(380)
    const [showPanel, setShowPanel] = useState<boolean>(true)
    const [isMaximized, setIsMaximized] = useState<boolean>(false)
    const [activeTab, setActiveTab] = useState<'files' | 'process' | 'service' | 'cron' | 'docker' | 'dashboard'>('files')

    const draggingRef = useRef(false)

    const handlePath = useCallback(
        (p: string) => onPathChange(session.id, p),
        [session.id, onPathChange]
    )

    useEffect(() => {
        const onMouseMove = (e: MouseEvent) => {
            if (!draggingRef.current || !rootRef.current) return
            const rect = rootRef.current.getBoundingClientRect()
            const rawWidth = rect.right - e.clientX
            const clamped = Math.min(800, Math.max(260, rawWidth))
            setPanelWidth(clamped)
        }

        const onMouseUp = () => {
            if (draggingRef.current) {
                draggingRef.current = false
                document.body.classList.remove('resizing')
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
                <button
                    className={w.panelToggle}
                    title={showPanel ? '隐藏侧栏面板' : '显示侧栏面板'}
                    onClick={toggleShowPanel}
                >
                    <PanelLeft size={15} />
                </button>
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
                                <button
                                    className={`${w.panelTab}${activeTab === 'files' ? ' ' + w.active : ''}`}
                                    onClick={() => setActiveTab('files')}
                                >
                                    <Folder size={13} /> 文件
                                </button>
                                <button
                                    className={`${w.panelTab}${activeTab === 'dashboard' ? ' ' + w.active : ''}`}
                                    onClick={() => setActiveTab('dashboard')}
                                >
                                    <BarChart2 size={13} /> 仪表盘
                                </button>
                                <button
                                    className={`${w.panelTab}${activeTab === 'process' ? ' ' + w.active : ''}`}
                                    onClick={() => setActiveTab('process')}
                                >
                                    <Play size={13} /> 进程
                                </button>
                                <button
                                    className={`${w.panelTab}${activeTab === 'service' ? ' ' + w.active : ''}`}
                                    onClick={() => setActiveTab('service')}
                                >
                                    <Plug size={13} /> 服务
                                </button>
                                <button
                                    className={`${w.panelTab}${activeTab === 'cron' ? ' ' + w.active : ''}`}
                                    onClick={() => setActiveTab('cron')}
                                >
                                    <Clock size={13} /> 定时任务
                                </button>
                                <button
                                    className={`${w.panelTab}${activeTab === 'docker' ? ' ' + w.active : ''}`}
                                    onClick={() => setActiveTab('docker')}
                                >
                                    <Box size={13} /> Docker
                                </button>
                            </div>
                            <div className={w.panelHeaderActions}>
                                <button
                                    className={g.iconBtn}
                                    title={isMaximized ? '还原侧栏面板' : '侧栏面板占满'}
                                    onClick={toggleMaximized}
                                >
                                    {isMaximized ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
                                </button>
                                <button
                                    className={g.iconBtn}
                                    title="隐藏侧栏面板"
                                    onClick={toggleShowPanel}
                                >
                                    <X size={13} />
                                </button>
                            </div>
                        </div>

                        <div className={w.panelContent}>
                            <div style={{ display: activeTab === 'files' ? 'flex' : 'none', flexDirection: 'column', flex: 1, height: '100%', width: '100%', minHeight: 0 }}>
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
