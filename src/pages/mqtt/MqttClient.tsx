import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
    Input,
    Select,
    Button,
    Checkbox,
    Space,
    Tag,
    Tooltip,
    Segmented,
} from 'antd'
import {
    Radio,
    Send,
    Plus,
    Trash2,
    X,
    Search,
    Copy,
    Check,
    ChevronDown,
    ChevronUp,
    Sparkles,
    Minimize2,
    Inbox,
    Filter,
    Layers,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { API, subscribe } from '@/api'
import CodeEditor from '@/components/CodeEditor'
import { errorMessage } from '@/utils'
import { MqttMessage, MqttSessionInfo, MqttSubscription } from '@/types'
import m from '@/pages/mqtt/MqttClient.module.less'

interface Props {
    session: MqttSessionInfo
    onClose: () => void
}

function fmtTime(ts: number) {
    const d = new Date(ts)
    const p = (n: number) => String(n).padStart(2, '0')
    return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3, '0')}`
}

const TOPIC_PALETTE = [
    '#3b82f6',
    '#10b981',
    '#8b5cf6',
    '#f59e0b',
    '#ec4899',
    '#06b6d4',
    '#6366f1',
    '#14b8a6',
    '#f97316',
]

function getTopicColor(topic: string) {
    let hash = 0
    for (let i = 0; i < topic.length; i++) {
        hash = (hash << 5) - hash + topic.charCodeAt(i)
        hash |= 0
    }
    const idx = Math.abs(hash) % TOPIC_PALETTE.length
    return TOPIC_PALETTE[idx]
}

const MAX_MESSAGES = 1000
const DISPLAY_LIMIT = 150

export default function MqttClient({ session, onClose }: Props) {
    const { t } = useTranslation(['server', 'common'])
    const [subs, setSubs] = useState<MqttSubscription[]>([])
    const [messages, setMessages] = useState<MqttMessage[]>([])
    const [subTopic, setSubTopic] = useState('')
    const [subQos, setSubQos] = useState<number>(0)
    const [showAddSub, setShowAddSub] = useState(false)

    const [pubTopic, setPubTopic] = useState('')
    const [pubPayload, setPubPayload] = useState('{\n  "msg": "hello mqtt",\n  "time": ' + Date.now() + '\n}')
    const [pubQos, setPubQos] = useState<number>(0)
    const [pubRetained, setPubRetained] = useState(false)
    const [publishDockExpanded, setPublishDockExpanded] = useState(true)

    // Message Filtering
    const [dirFilter, setDirFilter] = useState<'all' | 'in' | 'out'>('all')
    const [filterTopic, setFilterTopic] = useState<string>('')
    const [searchKeyword, setSearchKeyword] = useState<string>('')
    const [autoScroll, setAutoScroll] = useState<boolean>(true)

    // Copying state feedback
    const [copiedId, setCopiedId] = useState<string | null>(null)

    const [status, setStatus] = useState<{ connected: boolean; error?: string }>({
        connected: session.connected,
    })
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')
    const logRef = useRef<HTMLDivElement>(null)
    const bottomRef = useRef<HTMLDivElement>(null)

    // Message batching buffer & sequencer
    const msgSeqRef = useRef(0)
    const msgBufferRef = useRef<MqttMessage[]>([])
    const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    const flushMessages = useCallback(() => {
        if (msgBufferRef.current.length === 0) return
        const chunk = msgBufferRef.current
        msgBufferRef.current = []
        setMessages((prev) => {
            const next = prev.concat(chunk)
            return next.length > MAX_MESSAGES ? next.slice(next.length - MAX_MESSAGES) : next
        })
    }, [])

    const reloadSubs = useCallback(async () => {
        try {
            const list = await API.mqttSubscriptions(session.id)
            setSubs(list || [])
        } catch (e) {
            void e
        }
    }, [session.id])

    useEffect(() => {
        reloadSubs()
        const offMsg = subscribe(`mqtt:message:${session.id}`, (data: any) => {
            const ts = data.ts || Date.now()
            msgBufferRef.current.push({
                id: `${ts}-${++msgSeqRef.current}`,
                dir: 'in',
                topic: data.topic,
                payload: data.payload,
                qos: data.qos,
                retained: !!data.retained,
                ts,
            })
            if (!flushTimerRef.current) {
                flushTimerRef.current = setTimeout(() => {
                    flushTimerRef.current = null
                    flushMessages()
                }, 50)
            }
        })
        const offStatus = subscribe(`mqtt:status:${session.id}`, (data: any) => {
            setStatus({ connected: !!data.connected, error: data.error })
        })
        return () => {
            offMsg()
            offStatus()
            if (flushTimerRef.current) {
                clearTimeout(flushTimerRef.current)
                flushTimerRef.current = null
            }
        }
    }, [session.id, reloadSubs, flushMessages])

    // Stats
    const totalIn = useMemo(() => messages.filter((msgItem) => msgItem.dir === 'in').length, [messages])
    const totalOut = useMemo(() => messages.filter((msgItem) => msgItem.dir === 'out').length, [messages])

    // Topic message counts
    const topicCounts = useMemo(() => {
        const counts: Record<string, number> = {}
        messages.forEach((msgItem) => {
            counts[msgItem.topic] = (counts[msgItem.topic] || 0) + 1
        })
        return counts
    }, [messages])

    // Filtered messages
    const filteredMessages = useMemo(() => {
        return messages.filter((msg) => {
            if (dirFilter !== 'all' && msg.dir !== dirFilter) return false
            if (filterTopic && msg.topic !== filterTopic) return false
            if (searchKeyword.trim()) {
                const kw = searchKeyword.toLowerCase()
                const matchTopic = msg.topic.toLowerCase().includes(kw)
                const matchPayload = msg.payload.toLowerCase().includes(kw)
                if (!matchTopic && !matchPayload) return false
            }
            return true
        })
    }, [messages, dirFilter, filterTopic, searchKeyword])

    // Display sliding window (limit DOM elements to latest 150 items)
    const displayedMessages = useMemo(() => {
        if (filteredMessages.length <= DISPLAY_LIMIT) {
            return filteredMessages
        }
        return filteredMessages.slice(filteredMessages.length - DISPLAY_LIMIT)
    }, [filteredMessages])

    // Auto-scroll message stream
    useEffect(() => {
        if (!autoScroll) return
        const rafId = requestAnimationFrame(() => {
            if (bottomRef.current) {
                bottomRef.current.scrollIntoView({ behavior: 'auto', block: 'end' })
            } else if (logRef.current) {
                logRef.current.scrollTop = logRef.current.scrollHeight
            }
        })
        return () => {
            cancelAnimationFrame(rafId)
        }
    }, [displayedMessages.length, autoScroll])

    // Actions
    const doSubscribe = async () => {
        const tTopic = subTopic.trim()
        if (!tTopic) {
            setError(t('mqtt.client.inputSubTopicReq'))
            return
        }
        setBusy(true)
        setError('')
        try {
            await API.mqttSubscribe(session.id, tTopic, subQos)
            await reloadSubs()
            setSubTopic('')
            setShowAddSub(false)
        } catch (e) {
            setError(errorMessage(e))
        } finally {
            setBusy(false)
        }
    }

    const doUnsubscribe = async (topic: string) => {
        setBusy(true)
        setError('')
        try {
            await API.mqttUnsubscribe(session.id, topic)
            if (filterTopic === topic) setFilterTopic('')
            await reloadSubs()
        } catch (e) {
            setError(errorMessage(e))
        } finally {
            setBusy(false)
        }
    }

    const doPublish = async () => {
        const tTopic = pubTopic.trim()
        if (!tTopic) {
            setError(t('mqtt.client.inputPubTopicReq'))
            return
        }
        setBusy(true)
        setError('')
        try {
            await API.mqttPublish(session.id, tTopic, pubPayload, pubQos, pubRetained)
            const now = Date.now()
            setMessages((prev) => {
                const next = prev.concat({
                    id: `${now}-${++msgSeqRef.current}`,
                    dir: 'out',
                    topic: tTopic,
                    payload: pubPayload,
                    qos: pubQos,
                    retained: pubRetained,
                    ts: now,
                })
                return next.length > MAX_MESSAGES ? next.slice(next.length - MAX_MESSAGES) : next
            })
        } catch (e) {
            setError(errorMessage(e))
        } finally {
            setBusy(false)
        }
    }

    // JSON Formatters
    const beautifyJson = () => {
        try {
            const obj = JSON.parse(pubPayload)
            setPubPayload(JSON.stringify(obj, null, 2))
        } catch (e) {
            setError(t('mqtt.client.invalidJson'))
        }
    }

    const minifyJson = () => {
        try {
            const obj = JSON.parse(pubPayload)
            setPubPayload(JSON.stringify(obj))
        } catch (e) {
            setError(t('mqtt.client.invalidJson'))
        }
    }

    const copyPayload = (payload: string, id: string) => {
        navigator.clipboard.writeText(payload)
        setCopiedId(id)
        setTimeout(() => setCopiedId(null), 1500)
    }

    const fillToPublish = (topic: string, payload?: string) => {
        setPubTopic(topic)
        if (payload) setPubPayload(payload)
        setPublishDockExpanded(true)
    }

    return (
        <div className={m.mqttPane}>
            {/* ==================== LEFT SIDEBAR ==================== */}
            <div className={m.mqttSide}>
                {/* Connection Info Card */}
                <div className={m.connCard}>
                    <div className={m.connHeader}>
                        <div className={m.connTitle} title={session.title ? `${session.title} (${session.host}:${session.port})` : `${session.host}:${session.port}`}>
                            <Radio size={14} color="var(--accent)" />
                            <span>{session.host}:{session.port}</span>
                        </div>
                        <span className={`${m.statusPill} ${status.connected ? m.connected : m.disconnected}`}>
                            <span className={`${m.statusDot} ${status.connected ? m.pulsing : ''}`} />
                            {status.connected ? t('mqtt.client.connected') : t('mqtt.client.disconnected')}
                        </span>
                    </div>

                    <div className={m.connMeta}>
                        <Tag color="purple" style={{ margin: 0, fontSize: 11, fontFamily: 'var(--font-mono)' }} title="Client ID">
                            @{session.clientId || 'auto'}
                        </Tag>
                        <span style={{ fontSize: 11 }}>QoS 0/1/2</span>
                    </div>
                </div>

                {/* Subscriptions Section */}
                <div className={m.subSection}>
                    <div className={m.subSectionHeader}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Layers size={13} color="var(--accent)" />
                            <span>{t('mqtt.client.subList')}</span>
                            <Tag style={{ borderRadius: 10, fontSize: 10, lineHeight: '14px', padding: '0 5px' }}>
                                {subs.length}
                            </Tag>
                        </div>
                        <Button
                            size="small"
                            type={showAddSub ? 'primary' : 'dashed'}
                            icon={showAddSub ? <ChevronUp size={12} /> : <Plus size={12} />}
                            onClick={() => setShowAddSub(!showAddSub)}
                            title={t('mqtt.client.addSubTitle')}
                        >
                            {showAddSub ? t('mqtt.client.collapse') : t('mqtt.client.subscribe')}
                        </Button>
                    </div>

                    {/* Inline Quick Subscribe */}
                    {showAddSub && (
                        <div className={m.subAddInline}>
                            <Input
                                size="small"
                                placeholder={t('mqtt.client.subPlaceholder')}
                                value={subTopic}
                                onChange={(e) => setSubTopic(e.target.value)}
                                onPressEnter={doSubscribe}
                                autoFocus
                            />
                            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                <Select
                                    size="small"
                                    style={{ flex: 1 }}
                                    value={subQos}
                                    onChange={setSubQos}
                                    options={[
                                        { value: 0, label: 'QoS 0' },
                                        { value: 1, label: 'QoS 1' },
                                        { value: 2, label: 'QoS 2' },
                                    ]}
                                />
                                <Button
                                    size="small"
                                    type="primary"
                                    loading={busy}
                                    onClick={doSubscribe}
                                >
                                    {t('mqtt.client.confirmSub')}
                                </Button>
                            </div>
                        </div>
                    )}

                    {/* Subscription List */}
                    <div className={m.subList}>
                        {subs.length === 0 && !showAddSub && (
                            <div style={{ padding: '24px 12px', textAlign: 'center', color: 'var(--text-dim)', fontSize: 12 }}>
                                <Inbox size={28} style={{ opacity: 0.3, marginBottom: 6 }} />
                                <div>{t('mqtt.client.noSubs')}</div>
                                <div style={{ fontSize: 11, marginTop: 2 }}>{t('mqtt.client.noSubsHint')}</div>
                            </div>
                        )}

                        {subs.map((s) => {
                            const isFilteringThis = filterTopic === s.topic
                            const topicColor = getTopicColor(s.topic)
                            const count = topicCounts[s.topic] || 0
                            return (
                                <div
                                    key={s.topic}
                                    className={`${m.subItem}${isFilteringThis ? ' ' + m.active : ''}`}
                                    onClick={() => setFilterTopic(isFilteringThis ? '' : s.topic)}
                                    title={isFilteringThis ? t('mqtt.client.clearFilterHint') : t('mqtt.client.filterTopicHint')}
                                >
                                    <div className={m.subTopicInfo}>
                                        <div className={m.subTopicTitle} style={{ color: topicColor }}>
                                            {s.topic}
                                        </div>
                                        <div className={m.subMetaRow}>
                                            <Tag color="cyan" style={{ fontSize: 10, lineHeight: '14px', padding: '0 3px', margin: 0 }}>
                                                Q{s.qos}
                                            </Tag>
                                            {count > 0 && (
                                                <span style={{ fontSize: 10.5, color: 'var(--text-dim)' }}>
                                                    {t('mqtt.client.messagesCount', { count })}
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    <div className={m.subActions} onClick={(e) => e.stopPropagation()}>
                                        <Tooltip title={t('mqtt.client.quickPublish')}>
                                            <Button
                                                size="small"
                                                type="text"
                                                icon={<Send size={11} />}
                                                onClick={() => fillToPublish(s.topic)}
                                            />
                                        </Tooltip>
                                        <Tooltip title={t('mqtt.client.unsubscribe')}>
                                            <Button
                                                size="small"
                                                type="text"
                                                danger
                                                icon={<Trash2 size={11} />}
                                                disabled={busy}
                                                onClick={() => doUnsubscribe(s.topic)}
                                            />
                                        </Tooltip>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </div>
            </div>

            {/* ==================== MAIN CONTENT AREA ==================== */}
            <div className={m.mqttMain}>
                {/* Top Message Stream Toolbar */}
                <div className={m.streamToolbar}>
                    <div className={m.streamLeftControls}>
                        <Segmented
                            size="small"
                            value={dirFilter}
                            onChange={(v) => setDirFilter(v as any)}
                            options={[
                                { label: t('mqtt.client.allMessages', { count: messages.length }), value: 'all' },
                                { label: t('mqtt.client.incomingMessages', { count: totalIn }), value: 'in' },
                                { label: t('mqtt.client.outgoingMessages', { count: totalOut }), value: 'out' },
                            ]}
                        />

                        {filterTopic && (
                            <span className={m.filterBadge}>
                                <Filter size={11} />
                                <span>{filterTopic}</span>
                                <span
                                    title={t('mqtt.client.clearFilter')}
                                    onClick={() => setFilterTopic('')}
                                    style={{ display: 'inline-flex', cursor: 'pointer', marginLeft: 2 }}
                                >
                                    <X size={12} />
                                </span>
                            </span>
                        )}

                        <Input
                            size="small"
                            style={{ width: 180 }}
                            placeholder={t('mqtt.client.searchPlaceholder')}
                            prefix={<Search size={12} color="var(--text-dim)" />}
                            value={searchKeyword}
                            onChange={(e) => setSearchKeyword(e.target.value)}
                            allowClear
                        />

                        <span style={{ fontSize: 11.5, color: 'var(--text-dim)', whiteSpace: 'nowrap' }} dangerouslySetInnerHTML={{
                            __html: t('mqtt.client.showingCount', { count: filteredMessages.length, total: messages.length })
                        }} />
                    </div>

                    <div className={m.streamRightControls}>
                        {error && (
                            <span style={{ fontSize: 11.5, color: '#ef4444' }}>{error}</span>
                        )}
                        <Checkbox
                            checked={autoScroll}
                            onChange={(e) => setAutoScroll(e.target.checked)}
                            style={{ fontSize: 12 }}
                        >
                            {t('mqtt.client.autoScroll')}
                        </Checkbox>
                        <Button
                            size="small"
                            onClick={() => setMessages([])}
                            disabled={messages.length === 0}
                            title={t('mqtt.client.clearStream')}
                        >
                            {t('mqtt.client.clearStream')}
                        </Button>
                        <Tooltip title={t('mqtt.client.closeClient')}>
                            <Button size="small" type="text" icon={<X size={14} />} onClick={onClose} />
                        </Tooltip>
                    </div>
                </div>

                {/* Message Stream Body */}
                <div className={m.streamBody} ref={logRef}>
                    {filteredMessages.length === 0 && (
                        <div className={m.emptyStream}>
                            <Inbox size={40} style={{ opacity: 0.3 }} />
                            <div className={m.emptyTitle}>
                                {messages.length === 0 ? t('mqtt.client.emptyLiveTitle') : t('mqtt.client.emptyMatchTitle')}
                            </div>
                            <div className={m.emptySubtitle}>
                                {messages.length === 0
                                    ? t('mqtt.client.emptyLiveHint')
                                    : t('mqtt.client.emptyMatchHint')}
                            </div>
                        </div>
                    )}

                    {filteredMessages.length > DISPLAY_LIMIT && (
                        <div style={{
                            textAlign: 'center',
                            padding: '6px 0',
                            fontSize: 11,
                            color: 'var(--text-dim)',
                            borderBottom: '1px dashed var(--border-color, rgba(140, 140, 140, 0.2))',
                            marginBottom: 6,
                        }}>
                            {t('mqtt.client.showingLimit', { limit: DISPLAY_LIMIT, count: filteredMessages.length })}
                        </div>
                    )}

                    {displayedMessages.map((msg) => {
                        const isIncoming = msg.dir === 'in'
                        const topicColor = getTopicColor(msg.topic)
                        const msgId = msg.id || `${msg.ts}-${msg.topic}`
                        const isCopied = copiedId === msgId
                        return (
                            <div
                                key={msgId}
                                className={`${m.msgCard} ${isIncoming ? m.msgIn : m.msgOut}`}
                            >
                                <div className={m.msgCardHeader}>
                                    <div className={m.msgCardMetaLeft}>
                                        <Tag
                                            color={isIncoming ? 'success' : 'processing'}
                                            style={{ margin: 0, fontSize: 10, lineHeight: '16px', padding: '0 4px' }}
                                        >
                                            {isIncoming ? t('mqtt.client.incomingTag') : t('mqtt.client.outgoingTag')}
                                        </Tag>
                                        <span
                                            className={m.msgCardTopic}
                                            style={{ color: topicColor }}
                                            title={msg.topic}
                                        >
                                            {msg.topic}
                                        </span>
                                        <Tag color="cyan" style={{ margin: 0, fontSize: 10, lineHeight: '14px', padding: '0 3px' }}>
                                            Q{msg.qos}
                                        </Tag>
                                        {msg.retained && (
                                            <Tag color="warning" style={{ margin: 0, fontSize: 10, lineHeight: '14px', padding: '0 3px' }}>
                                                Retained
                                            </Tag>
                                        )}
                                    </div>

                                    <div className={m.msgCardMetaRight}>
                                        <div className={m.cardHoverActions}>
                                            <Tooltip title={isCopied ? t('mqtt.client.copied') : t('mqtt.client.copyPayload')}>
                                                <Button
                                                    size="small"
                                                    type="text"
                                                    icon={isCopied ? <Check size={12} color="#22c55e" /> : <Copy size={12} />}
                                                    onClick={() => copyPayload(msg.payload, msgId)}
                                                />
                                            </Tooltip>
                                            <Tooltip title={t('mqtt.client.publishThisTopic')}>
                                                <Button
                                                    size="small"
                                                    type="text"
                                                    icon={<Send size={12} />}
                                                    onClick={() => fillToPublish(msg.topic, msg.payload)}
                                                />
                                            </Tooltip>
                                            <Tooltip title={t('mqtt.client.onlyThisTopic')}>
                                                <Button
                                                    size="small"
                                                    type="text"
                                                    icon={<Filter size={12} />}
                                                    onClick={() => setFilterTopic(msg.topic)}
                                                />
                                            </Tooltip>
                                        </div>
                                        <span className={m.msgTime}>{fmtTime(msg.ts)}</span>
                                    </div>
                                </div>

                                <pre className={m.msgCardPayload}>{msg.payload}</pre>
                            </div>
                        )
                    })}
                    <div ref={bottomRef} style={{ height: 1, flexShrink: 0 }} />
                </div>

                {/* ==================== PUBLISH WORKSHOP DOCK ==================== */}
                <div className={m.publishDock}>
                    <div className={m.publishControlsBar}>
                        <Input
                            style={{ flex: 1 }}
                            size="small"
                            placeholder={t('mqtt.client.pubTopicPlaceholder')}
                            value={pubTopic}
                            onChange={(e) => setPubTopic(e.target.value)}
                            onPressEnter={doPublish}
                        />

                        <Select
                            size="small"
                            style={{ width: 85 }}
                            value={pubQos}
                            onChange={setPubQos}
                            options={[
                                { value: 0, label: 'QoS 0' },
                                { value: 1, label: 'QoS 1' },
                                { value: 2, label: 'QoS 2' },
                            ]}
                        />

                        <Checkbox
                            checked={pubRetained}
                            onChange={(e) => setPubRetained(e.target.checked)}
                            style={{ fontSize: 12 }}
                        >
                            {t('mqtt.client.retain')}
                        </Checkbox>

                        <Space size={4}>
                            <Tooltip title={t('mqtt.client.beautifyTitle')}>
                                <Button
                                    size="small"
                                    icon={<Sparkles size={12} />}
                                    onClick={beautifyJson}
                                >
                                    {t('mqtt.client.beautify')}
                                </Button>
                            </Tooltip>
                            <Tooltip title={t('mqtt.client.minifyTitle')}>
                                <Button
                                    size="small"
                                    icon={<Minimize2 size={12} />}
                                    onClick={minifyJson}
                                >
                                    {t('mqtt.client.minify')}
                                </Button>
                            </Tooltip>
                        </Space>

                        <Button
                            size="small"
                            type="primary"
                            icon={<Send size={12} />}
                            loading={busy}
                            onClick={doPublish}
                        >
                            {t('mqtt.client.send')}
                        </Button>

                        <Tooltip title={publishDockExpanded ? t('mqtt.client.collapseEditor') : t('mqtt.client.expandEditor')}>
                            <Button
                                size="small"
                                type="text"
                                icon={publishDockExpanded ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                                onClick={() => setPublishDockExpanded(!publishDockExpanded)}
                            />
                        </Tooltip>
                    </div>

                    {publishDockExpanded && (
                        <div className={m.publishEditorWrapper}>
                            <CodeEditor
                                value={pubPayload}
                                onChange={setPubPayload}
                                lang={/^\s*[[{]/.test(pubPayload) ? 'json' : 'plain'}
                                height="160px"
                                minHeight="160px"
                                bordered={false}
                                lineNumbers={false}
                                placeholder={t('mqtt.client.editorPlaceholder')}
                                onModEnter={doPublish}
                            />
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
