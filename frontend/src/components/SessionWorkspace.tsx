import React, {useCallback, useEffect, useRef, useState} from 'react'
import TerminalView from './TerminalView'
import FilePanel from './FilePanel'
import Icon from './Icon'
import {SessionInfo} from '../types'

interface Props {
    session: SessionInfo
    active: boolean
    nativeDrop: boolean
    onPathChange: (sessionId: string, path: string) => void
    onNotify: (message: string, kind?: 'info' | 'error') => void
}

const MIN_PANEL = 320

export default function SessionWorkspace({session, active, nativeDrop, onPathChange, onNotify}: Props) {
    const [panelWidth, setPanelWidth] = useState(440)
    const [showPanel, setShowPanel] = useState(true)
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
        <div ref={rootRef} className="workspace" style={{display: active ? 'flex' : 'none'}}>
            <div className="terminal-pane">
                <TerminalView sessionId={session.id} active={active}/>
                <button
                    className="panel-toggle"
                    title={showPanel ? '隐藏文件管理器' : '显示文件管理器'}
                    onClick={() => setShowPanel((v) => !v)}
                >
                    <Icon name="panel" size={15}/>
                </button>
            </div>

            {showPanel && (
                <>
                    <div
                        className="splitter"
                        onMouseDown={() => {
                            draggingRef.current = true
                            document.body.classList.add('resizing')
                        }}
                    />
                    <div className="file-pane" style={{width: panelWidth}}>
                        <FilePanel
                            sessionId={session.id}
                            homeDir={session.homeDir}
                            nativeDrop={nativeDrop}
                            onPathChange={handlePath}
                            onNotify={onNotify}
                        />
                    </div>
                </>
            )}
        </div>
    )
}
