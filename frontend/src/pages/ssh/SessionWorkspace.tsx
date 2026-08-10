import React, { useCallback, useEffect, useRef, useState } from 'react'
import TerminalView from './terminal/TerminalView'
import FilePanel from './file/FilePanel'
import DashboardPanel from './dashboard/DashboardPanel'
import ProcessPanel from './process/ProcessPanel'
import ServicePanel from './service/ServicePanel'
import CronPanel from './cron/CronPanel'
import DockerPanel from './docker/DockerPanel'
import Icon from '../../components/Icon'
import { SessionInfo } from '../../types'
import g from '../../styles/global.module.less'
import w from './SessionWorkspace.module.less'

interface Props {
    session: SessionInfo
    active: boolean
    nativeDrop: boolean
    onPathChange: (sessionId: string, path: string) => void
    onNotify: (message: string, kind?: 'info' | 'error') => void
}

const MIN_PANEL = 320
type PanelTab = 'files' | 'dashboard' | 'process' | 'service' | 'cron' | 'docker'

export default function SessionWorkspace({ session, active, nativeDrop, onPathChange, onNotify }: Props) {
    const [panelWidth, setPanelWidth] = useState(440)
    const [showPanel, setShowPanel] = useState(true)
    const [isMaximized, setIsMaximized] = useState(false)
    const [activeTab, setActiveTab] = useState<PanelTab>('files')
    const rootRef = useRef<HTMLDivElement>(null)
    const draggingRef = useRef(false)

    const handlePath = useCallback(
        (p: string) => onPathChange(session.id, p),
        [session.id, onPathChange]
    )

    useEffect(() => {
        const onMove = (e: MouseEvent) => {
            if (!draggingRef.current || !rootRef.current) return
            const rect = rootRef.current.getBoundingClientRect()
            const next = rect.right - e.clientX
            setPanelWidth(Math.min(Math.max(next, MIN_PANEL), rect.width - 320))
        }
        const onUp = () => {
            draggingRef.current = false
            document.body.classList.remove('resizing')
        }
        window.addEventListener('mousemove', onMove)
        window.addEventListener('mouseup', onUp)
        return () => {
            window.removeEventListener('mousemove', onMove)
            window.removeEventListener('mouseup', onUp)
        }
    }, [])

    const toggleMaximized = () => {
        setIsMaximized((v) => !v)
        if (!showPanel) setShowPanel(true)
    }

    const toggleShowPanel = () => {
        setShowPanel((v) => {
            if (v && isMaximized) setIsMaximized(false)
            return !v
        })
    }

    return (
        <div ref={rootRef} className={w.workspace} style={{ display: active ? 'flex' : 'none' }}>
            <div className={w.terminalPane} style={{ display: showPanel && isMaximized ? 'none' : 'block' }}>
                <TerminalView sessionId={session.id} active={active} />
                <button
                    className={w.panelToggle}
                    title={showPanel ? '隐藏侧栏面板' : '显示侧栏面板'}
                    onClick={toggleShowPanel}
                >
                    <Icon name="panel" size={15} />
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
                                    <Icon name="folder" size={13} /> 文件
                                </button>
                                <button
                                    className={`${w.panelTab}${activeTab === 'dashboard' ? ' ' + w.active : ''}`}
                                    onClick={() => setActiveTab('dashboard')}
                                >
                                    <Icon name="chart" size={13} /> 仪表盘
                                </button>
                                <button
                                    className={`${w.panelTab}${activeTab === 'process' ? ' ' + w.active : ''}`}
                                    onClick={() => setActiveTab('process')}
                                >
                                    <Icon name="play" size={13} /> 进程
                                </button>
                                <button
                                    className={`${w.panelTab}${activeTab === 'service' ? ' ' + w.active : ''}`}
                                    onClick={() => setActiveTab('service')}
                                >
                                    <Icon name="plug" size={13} /> 服务
                                </button>
                                <button
                                    className={`${w.panelTab}${activeTab === 'cron' ? ' ' + w.active : ''}`}
                                    onClick={() => setActiveTab('cron')}
                                >
                                    <Icon name="clock" size={13} /> 定时任务
                                </button>
                                <button
                                    className={`${w.panelTab}${activeTab === 'docker' ? ' ' + w.active : ''}`}
                                    onClick={() => setActiveTab('docker')}
                                >
                                    <Icon name="box" size={13} /> Docker
                                </button>
                            </div>
                            <div className={w.panelHeaderActions}>
                                <button
                                    className={g.iconBtn}
                                    title={isMaximized ? '还原侧栏面板' : '侧栏面板占满'}
                                    onClick={toggleMaximized}
                                >
                                    <Icon name={isMaximized ? 'minimize' : 'maximize'} size={13} />
                                </button>
                                <button
                                    className={g.iconBtn}
                                    title="隐藏侧栏面板"
                                    onClick={toggleShowPanel}
                                >
                                    <Icon name="close" size={13} />
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
