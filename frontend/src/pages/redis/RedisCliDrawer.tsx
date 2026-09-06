import React, { useState, useRef, useEffect } from 'react'
import { Button, Input, Tooltip, message, Space } from 'antd'
import { Terminal, ChevronUp, ChevronDown, Trash2, Play, CornerDownLeft } from 'lucide-react'
import { RedisSessionInfo } from '@/types'
import c from './RedisCliDrawer.module.less'

interface Props {
    session: RedisSessionInfo
    currentDb: number
    runRaw: (cmd: string) => Promise<string | undefined>
}

interface CliLog {
    id: string
    cmd: string
    res: string
    time: string
    isError: boolean
}

export default function RedisCliDrawer({ session, currentDb, runRaw }: Props) {
    const [expanded, setExpanded] = useState(false)
    const [height, setHeight] = useState(240)
    const [inputVal, setInputVal] = useState('')
    const [executing, setExecuting] = useState(false)
    const [logs, setLogs] = useState<CliLog[]>([])

    // Command History
    const [history, setHistory] = useState<string[]>([])
    const [histIdx, setHistIdx] = useState<number>(-1)

    const outputRef = useRef<HTMLDivElement>(null)
    const isDraggingRef = useRef(false)
    const startYRef = useRef(0)
    const startHeightRef = useRef(0)

    useEffect(() => {
        if (expanded && outputRef.current) {
            outputRef.current.scrollTop = outputRef.current.scrollHeight
        }
    }, [logs, expanded])

    // Drag to resize
    const handleMouseDown = (e: React.MouseEvent) => {
        isDraggingRef.current = true
        startYRef.current = e.clientY
        startHeightRef.current = height

        const onMouseMove = (moveEvent: MouseEvent) => {
            if (!isDraggingRef.current) return
            const delta = startYRef.current - moveEvent.clientY
            const nextH = Math.max(140, Math.min(600, startHeightRef.current + delta))
            setHeight(nextH)
        }

        const onMouseUp = () => {
            isDraggingRef.current = false
            window.removeEventListener('mousemove', onMouseMove)
            window.removeEventListener('mouseup', onMouseUp)
        }

        window.addEventListener('mousemove', onMouseMove)
        window.addEventListener('mouseup', onMouseUp)
    }

    const handleExecute = async (cmdToRun?: string) => {
        const cmd = (cmdToRun || inputVal).trim()
        if (!cmd) return
        setExecuting(true)

        // Add to history
        setHistory((prev) => [cmd, ...prev.filter((c) => c !== cmd)].slice(0, 50))
        setHistIdx(-1)
        setInputVal('')

        const timeStr = new Date().toLocaleTimeString()
        try {
            const res = await runRaw(cmd)
            const isErr = res?.startsWith('ERR') || res?.startsWith('ERROR') || false
            setLogs((prev) => [
                ...prev,
                {
                    id: Math.random().toString(36).slice(2),
                    cmd,
                    res: res || '(空结果/OK)',
                    time: timeStr,
                    isError: isErr,
                },
            ])
        } catch (e: any) {
            setLogs((prev) => [
                ...prev,
                {
                    id: Math.random().toString(36).slice(2),
                    cmd,
                    res: 'ERROR: ' + (e?.message || e),
                    time: timeStr,
                    isError: true,
                },
            ])
        } finally {
            setExecuting(false)
        }
    }

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            handleExecute()
        } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            if (history.length === 0) return
            const nextIdx = Math.min(history.length - 1, histIdx + 1)
            setHistIdx(nextIdx)
            setInputVal(history[nextIdx] || '')
        } else if (e.key === 'ArrowDown') {
            e.preventDefault()
            if (histIdx <= 0) {
                setHistIdx(-1)
                setInputVal('')
            } else {
                const nextIdx = histIdx - 1
                setHistIdx(nextIdx)
                setInputVal(history[nextIdx] || '')
            }
        }
    }

    return (
        <div
            className={c.cliDock}
            style={{ height: expanded ? height : 34 }}
        >
            {expanded && <div className={c.resizeHandle} onMouseDown={handleMouseDown} />}

            {/* Top Bar */}
            <div className={c.cliBar} onClick={() => setExpanded(!expanded)}>
                <div className={c.barLeft}>
                    <Terminal size={14} style={{ color: 'var(--accent)' }} />
                    <span>Redis 原生命令行 (CLI)</span>
                    <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                        [127.0.0.1:{session.port || 6379} / DB {currentDb}]
                    </span>
                    {!expanded && logs.length > 0 && (
                        <span style={{ fontSize: 11, color: 'var(--text-dim)', marginLeft: 8 }}>
                            最近命令: {logs[logs.length - 1]?.cmd}
                        </span>
                    )}
                </div>

                <div className={c.barRight} onClick={(e) => e.stopPropagation()}>
                    {expanded && logs.length > 0 && (
                        <Tooltip title="清空输出记录">
                            <Button
                                size="small"
                                type="text"
                                icon={<Trash2 size={12} />}
                                onClick={() => setLogs([])}
                            >
                                清空
                            </Button>
                        </Tooltip>
                    )}
                    <Button
                        size="small"
                        type="text"
                        icon={expanded ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                        onClick={() => setExpanded(!expanded)}
                    >
                        {expanded ? '收起' : '展开'}
                    </Button>
                </div>
            </div>

            {/* Expanded Console Content */}
            {expanded && (
                <div className={c.cliContent}>
                    <div className={c.cliOutputArea} ref={outputRef}>
                        {logs.length === 0 ? (
                            <div style={{ color: 'var(--text-dim)', fontStyle: 'italic', padding: '12px 0' }}>
                                支持输入任何 Redis 原生指令（例如: PING / GET key / HGETALL hash / INFO / CLIENT LIST）
                                <br />
                                按 ↑ / ↓ 键可快速回忆历史命令，按 Enter 键即可执行。
                            </div>
                        ) : (
                            logs.map((log) => (
                                <div key={log.id} style={{ marginBottom: 10 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-dim)', fontSize: 11 }}>
                                        <span>[{log.time}]</span>
                                        <span style={{ color: 'var(--accent)', fontWeight: 600 }}>&gt; {log.cmd}</span>
                                    </div>
                                    <div
                                        style={{
                                            marginTop: 2,
                                            paddingLeft: 12,
                                            color: log.isError ? 'var(--danger)' : 'var(--text)',
                                        }}
                                    >
                                        {log.res}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>

                    <div className={c.cliInputRow}>
                        <span className={c.inputPrefix}>redis&gt;</span>
                        <Input
                            size="small"
                            className={c.promptInput}
                            placeholder="输入 Redis 指令并回车执行 (如: PING, KEYS *, DBSIZE)..."
                            value={inputVal}
                            onChange={(e) => setInputVal(e.target.value)}
                            onKeyDown={handleKeyDown}
                            disabled={executing}
                            autoFocus
                        />
                        <Button
                            size="small"
                            type="primary"
                            icon={<CornerDownLeft size={12} />}
                            loading={executing}
                            onClick={() => handleExecute()}
                        >
                            执行
                        </Button>
                    </div>
                </div>
            )}
        </div>
    )
}
