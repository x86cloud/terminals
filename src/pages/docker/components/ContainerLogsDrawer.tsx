import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button, Drawer, Input, Select, Space, Switch, Tag, Tooltip, App } from 'antd'
import {
    ArrowDown,
    Copy,
    Download,
    Eraser,
    RefreshCw,
    Search,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { API, subscribe } from '@/api'
import { copyText } from '@/utils'
import s from '../DockerClient.module.less'

interface Props {
    open: boolean
    serverId: string
    containerId: string
    containerName: string
    onClose: () => void
}

type StreamStatus = 'idle' | 'connecting' | 'streaming' | 'closed' | 'error'

const MAX_LOG_LINES = 10000
const ANSI_RE = /\x1b\[[0-9;]*[a-zA-Z]/g

export default function ContainerLogsDrawer({
    open,
    serverId,
    containerId,
    containerName,
    onClose,
}: Props) {
    const { t } = useTranslation(['docker', 'common'])
    const { message } = App.useApp()

    const [lines, setLines] = useState<string[]>([])
    const [status, setStatus] = useState<StreamStatus>('idle')
    const [errorMsg, setErrorMsg] = useState('')
    const [tail, setTail] = useState<number>(200)
    const [follow, setFollow] = useState<boolean>(true)
    const [timestamps, setTimestamps] = useState<boolean>(false)
    const [autoScroll, setAutoScroll] = useState<boolean>(true)
    const [wrapLines, setWrapLines] = useState<boolean>(true)
    const [searchKw, setSearchKw] = useState<string>('')

    const activeStreamIdRef = useRef<string | null>(null)
    const unsubsRef = useRef<Array<() => void>>([])
    const remainderRef = useRef<string>('')
    const preRef = useRef<HTMLPreElement>(null)
    const autoScrollRef = useRef<boolean>(autoScroll)
    autoScrollRef.current = autoScroll

    const stopActiveStream = useCallback(() => {
        unsubsRef.current.forEach((fn) => fn())
        unsubsRef.current = []
        const prevId = activeStreamIdRef.current
        activeStreamIdRef.current = null
        remainderRef.current = ''
        if (prevId) {
            void API.dockerStopLogStream(prevId).catch(() => {})
        }
    }, [])

    const appendChunk = useCallback((rawChunk: string) => {
        if (!rawChunk) return
        const clean = rawChunk.replace(ANSI_RE, '').replace(/\r\n/g, '\n')
        const combined = remainderRef.current + clean
        const parts = combined.split('\n')
        remainderRef.current = parts.pop() || ''
        if (parts.length === 0) return

        setLines((prev) => {
            const next = prev.concat(parts)
            return next.length > MAX_LOG_LINES
                ? next.slice(next.length - MAX_LOG_LINES)
                : next
        })
    }, [])

    const flushRemainder = useCallback(() => {
        const rem = remainderRef.current
        if (!rem) return
        remainderRef.current = ''
        setLines((prev) => {
            const next = [...prev, rem]
            return next.length > MAX_LOG_LINES
                ? next.slice(next.length - MAX_LOG_LINES)
                : next
        })
    }, [])

    const startStream = useCallback(async () => {
        stopActiveStream()
        setLines([])
        setErrorMsg('')

        if (!open || !serverId || !containerId) {
            setStatus('idle')
            return
        }

        const streamId = `dlog_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
        activeStreamIdRef.current = streamId
        setStatus('connecting')

        const offData = subscribe(`docker:logs:data:${streamId}`, (chunk: string) => {
            if (activeStreamIdRef.current !== streamId) return
            setStatus('streaming')
            appendChunk(String(chunk || ''))
        })
        const offErr = subscribe(`docker:logs:error:${streamId}`, (err: string) => {
            if (activeStreamIdRef.current !== streamId) return
            flushRemainder()
            setErrorMsg(String(err || 'Log stream error'))
            setStatus('error')
        })
        const offClosed = subscribe(`docker:logs:closed:${streamId}`, () => {
            if (activeStreamIdRef.current !== streamId) return
            flushRemainder()
            setStatus((prev) => (prev === 'error' ? 'error' : 'closed'))
        })
        unsubsRef.current = [offData, offErr, offClosed]

        try {
            await API.dockerStartLogStream(
                serverId,
                containerId,
                streamId,
                tail,
                timestamps,
                follow
            )
            if (activeStreamIdRef.current !== streamId) {
                void API.dockerStopLogStream(streamId).catch(() => {})
                return
            }
            setStatus((prev) => (prev === 'connecting' ? 'streaming' : prev))
        } catch (err: any) {
            if (activeStreamIdRef.current !== streamId) return
            setErrorMsg(err?.message || String(err))
            setStatus('error')
        }
    }, [open, serverId, containerId, tail, timestamps, follow, stopActiveStream, appendChunk, flushRemainder])

    useEffect(() => {
        if (!open || !containerId) {
            stopActiveStream()
            setLines([])
            setErrorMsg('')
            setStatus('idle')
            return
        }
        setAutoScroll(true)
        void startStream()
        return () => {
            stopActiveStream()
        }
    }, [open, serverId, containerId, tail, timestamps, follow, startStream, stopActiveStream])

    const filteredLines = useMemo(() => {
        const kw = searchKw.trim().toLowerCase()
        if (!kw) return lines
        return lines.filter((line) => line.toLowerCase().includes(kw))
    }, [lines, searchKw])

    const displayText = useMemo(() => {
        if (errorMsg) {
            const prefix = filteredLines.length > 0 ? filteredLines.join('\n') + '\n\n' : ''
            return `${prefix}[Error] ${errorMsg}`
        }
        if (filteredLines.length === 0) {
            if (status === 'connecting') return t('containers.logsConnecting', { defaultValue: '正在连接日志流...' })
            return t('containers.noLogs', { defaultValue: '(暂无日志输出)' })
        }
        return filteredLines.join('\n')
    }, [filteredLines, errorMsg, status, t])

    useEffect(() => {
        if (!autoScrollRef.current) return
        const el = preRef.current
        if (!el) return
        el.scrollTop = el.scrollHeight
    }, [displayText])

    const handleScroll = () => {
        const el = preRef.current
        if (!el) return
        const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 36
        if (nearBottom && !autoScroll) {
            setAutoScroll(true)
        } else if (!nearBottom && autoScroll) {
            setAutoScroll(false)
        }
    }

    const scrollToBottom = () => {
        setAutoScroll(true)
        if (preRef.current) {
            preRef.current.scrollTop = preRef.current.scrollHeight
        }
    }

    const handleDownload = () => {
        const content = filteredLines.join('\n')
        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        const safeName = (containerName || containerId.slice(0, 12) || 'container').replace(/[^a-zA-Z0-9._-]/g, '_')
        a.download = `${safeName}.log`
        a.click()
        URL.revokeObjectURL(url)
    }

    const statusTag = (() => {
        switch (status) {
            case 'connecting':
                return <Tag color="processing">{t('containers.logStatusConnecting', { defaultValue: '连接中' })}</Tag>
            case 'streaming':
                return <Tag color="success">{follow ? t('containers.logStatusLive', { defaultValue: '实时流' }) : t('containers.logStatusLoaded', { defaultValue: '已加载' })}</Tag>
            case 'closed':
                return <Tag color="default">{t('containers.logStatusClosed', { defaultValue: '已结束' })}</Tag>
            case 'error':
                return <Tag color="error">{t('containers.logStatusError', { defaultValue: '异常' })}</Tag>
            default:
                return null
        }
    })()

    return (
        <Drawer
            title={
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                    <Space size={8}>
                        <span>{t('containers.logDrawerTitle', { defaultValue: '容器日志: {{name}}', name: containerName || containerId.slice(0, 12) })}</span>
                        {statusTag}
                    </Space>
                    <Space size={6}>
                        <Tooltip title={t('containers.logReconnect', { defaultValue: '重新拉取 / 重连' })}>
                            <Button
                                size="small"
                                icon={<RefreshCw size={12} className={status === 'connecting' ? 'animate-spin' : ''} />}
                                onClick={() => void startStream()}
                            >
                                {t('common:refresh', { defaultValue: '刷新' })}
                            </Button>
                        </Tooltip>
                        <Tooltip title={t('containers.logClear', { defaultValue: '清空当前视图' })}>
                            <Button
                                size="small"
                                icon={<Eraser size={12} />}
                                onClick={() => {
                                    remainderRef.current = ''
                                    setLines([])
                                }}
                            />
                        </Tooltip>
                        <Tooltip title={t('containers.copyLogs', { defaultValue: '复制日志' })}>
                            <Button
                                size="small"
                                icon={<Copy size={12} />}
                                onClick={async () => {
                                    if (await copyText(filteredLines.join('\n'))) {
                                        message.success(t('containers.copiedLogs', { defaultValue: '已复制日志' }))
                                    }
                                }}
                            />
                        </Tooltip>
                        <Tooltip title={t('containers.downloadLogs', { defaultValue: '下载 .log 文件' })}>
                            <Button size="small" icon={<Download size={12} />} onClick={handleDownload} />
                        </Tooltip>
                    </Space>
                </div>
            }
            open={open}
            onClose={() => {
                stopActiveStream()
                onClose()
            }}
            size={780}
            styles={{ body: { display: 'flex', flexDirection: 'column', gap: 10, padding: '12px 16px' } }}
        >
            <div className={s.logToolbar}>
                <Space size={10} wrap>
                    <Select
                        size="small"
                        value={tail}
                        onChange={setTail}
                        style={{ width: 112 }}
                        options={[
                            { label: t('containers.logLines100', { defaultValue: '最近 100 行' }), value: 100 },
                            { label: t('containers.logLines200', { defaultValue: '最近 200 行' }), value: 200 },
                            { label: t('containers.logLines500', { defaultValue: '最近 500 行' }), value: 500 },
                            { label: t('containers.logLines1000', { defaultValue: '最近 1000 行' }), value: 1000 },
                            { label: t('containers.logLinesAll', { defaultValue: '全部日志' }), value: 0 },
                        ]}
                    />

                    <label className={s.switchLabel}>
                        <span>{t('containers.logFollow', { defaultValue: '实时跟随' })}</span>
                        <Switch size="small" checked={follow} onChange={setFollow} />
                    </label>

                    <label className={s.switchLabel}>
                        <span>{t('containers.timestamps', { defaultValue: '时间戳' })}</span>
                        <Switch size="small" checked={timestamps} onChange={setTimestamps} />
                    </label>

                    <label className={s.switchLabel}>
                        <span>{t('containers.logAutoScroll', { defaultValue: '自动滚底' })}</span>
                        <Switch size="small" checked={autoScroll} onChange={(v) => v ? scrollToBottom() : setAutoScroll(false)} />
                    </label>

                    <label className={s.switchLabel}>
                        <span>{t('containers.logWrap', { defaultValue: '自动换行' })}</span>
                        <Switch size="small" checked={wrapLines} onChange={setWrapLines} />
                    </label>
                </Space>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Input
                        size="small"
                        allowClear
                        prefix={<Search size={12} color="var(--text-dim)" />}
                        placeholder={t('containers.logSearchPlaceholder', { defaultValue: '过滤关键词...' })}
                        value={searchKw}
                        onChange={(e) => setSearchKw(e.target.value)}
                        style={{ width: 200 }}
                    />
                    <span style={{ fontSize: 11.5, color: 'var(--text-faint)', whiteSpace: 'nowrap' }}>
                        {searchKw.trim()
                            ? t('containers.logFilteredCount', { matched: filteredLines.length, total: lines.length, defaultValue: `${filteredLines.length} / ${lines.length} 行` })
                            : t('containers.logTotalCount', { total: lines.length, defaultValue: `${lines.length} 行` })}
                    </span>
                </div>
            </div>

            <div className={s.logDrawerBody}>
                <pre
                    ref={preRef}
                    onScroll={handleScroll}
                    className={`${s.logTerminal} ${s.logPreFill} ${wrapLines ? '' : s.logPreNoWrap}`}
                >
                    {displayText}
                </pre>

                {!autoScroll && lines.length > 0 && (
                    <Button
                        size="small"
                        type="primary"
                        shape="round"
                        icon={<ArrowDown size={12} />}
                        className={s.logScrollBottomBtn}
                        onClick={scrollToBottom}
                    >
                        {t('containers.logScrollBottom', { defaultValue: '回到底部' })}
                    </Button>
                )}
            </div>
        </Drawer>
    )
}
