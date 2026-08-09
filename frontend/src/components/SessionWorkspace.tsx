import React, {useCallback, useEffect, useRef, useState} from 'react'
import TerminalView from './TerminalView'
import FilePanel from './FilePanel'
import DashboardPanel from './DashboardPanel'
import ProcessPanel from './ProcessPanel'
import Icon from './Icon'
import {SessionInfo} from '../types'
import w from './SessionWorkspace.module.less'

interface Props {
    session: SessionInfo
    active: boolean
    nativeDrop: boolean
    onPathChange: (sessionId: string, path: string) => void
    onNotify: (message: string, kind?: 'info' | 'error') => void
}

const MIN_PANEL = 320
type PanelTab = 'files' | 'dashboard' | 'process'

export default function SessionWorkspace({session, active, nativeDrop, onPathChange, onNotify}: Props) {
    const [panelWidth, setPanelWidth] = useState(440)
    const [showPanel, setShowPanel] = useState(true)
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

    return (
        <div ref={rootRef} className={w.workspace} style={{display: active ? 'flex' : 'none'}}>
            <div className={w.terminalPane}>
                <TerminalView sessionId={session.id} active={active}/>
                <button
                    className={w.panelToggle}
                    title={showPanel ? '隐藏侧栏面板' : '显示侧栏面板'}
                    onClick={() => setShowPanel((v) => !v)}
                >
                    <Icon name="panel" size={15}/>
                </button>
            </div>

            {showPanel && (
                <>
                    <div
                        className={w.splitter}
                        onMouseDown={() => {
                            draggingRef.current = true
                            document.body.classList.add('resizing')
                        }}
                    />
                    <div className={w.filePane} style={{width: panelWidth}}>
                        <div className={w.panelHeader}>
                            <button
                                className={`${w.panelTab}${activeTab === 'files' ? ' ' + w.active : ''}`}
                                onClick={() => setActiveTab('files')}
                            >
                                <Icon name="folder" size={13}/> 文件管理
                            </button>
                            <button
                                className={`${w.panelTab}${activeTab === 'dashboard' ? ' ' + w.active : ''}`}
                                onClick={() => setActiveTab('dashboard')}
                            >
                                <Icon name="chart" size={13}/> 系统仪表盘
                            </button>
                            <button
                                className={`${w.panelTab}${activeTab === 'process' ? ' ' + w.active : ''}`}
                                onClick={() => setActiveTab('process')}
                            >
                                <Icon name="play" size={13}/> 进程管理
                            </button>
                        </div>

                        <div className={w.panelContent}>
                            <div style={{display: activeTab === 'files' ? 'flex' : 'none', flexDirection: 'column', flex: 1, height: '100%', width: '100%', minHeight: 0}}>
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
                        </div>
                    </div>
                </>
            )}
        </div>
    )
}
