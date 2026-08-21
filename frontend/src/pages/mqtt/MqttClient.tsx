import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
    Input,
    Select,
    Button,
    Checkbox,
    Space,
    Tag,
    Tooltip,
    Segmented,
    Switch,
    Badge,
    Alert,
    Dropdown,
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
    ArrowDownToLine,
    ArrowUpFromLine,
    Inbox,
    Filter,
    Layers,
    Share2,
    Activity,
} from 'lucide-react'
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

export default function MqttClient({ session, onClose }: Props) {
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
    const [copiedIdx, setCopiedIdx] = useState<number | null>(null)

    const [status, setStatus] = useState<{ connected: boolean; error?: string }>({
        connected: session.connected,
    })
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')
    const logRef = useRef<HTMLDivElement>(null)

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
            setMessages((prev) => {
                const next = prev.concat({
                    dir: 'in',
                    topic: data.topic,
                    payload: data.payload,
                    qos: data.qos,
                    retained: !!data.retained,
                    ts: data.ts,
                })
                return next.length > MAX_MESSAGES ? next.slice(next.length - MAX_MESSAGES) : next
            })
        })
        const offStatus = subscribe(`mqtt:status:${session.id}`, (data: any) => {
            setStatus({ connected: !!data.connected, error: data.error })
        })
        return () => {
            offMsg()
            offStatus()
        }
    }, [session.id, reloadSubs])

    // Auto-scroll message stream
    useEffect(() => {
        if (autoScroll && logRef.current) {
            logRef.current.scrollTop = logRef.current.scrollHeight
        }
    }, [messages, autoScroll])

    // Stats
    const totalIn = useMemo(() => messages.filter((m) => m.dir === 'in').length, [messages])
    const totalOut = useMemo(() => messages.filter((m) => m.dir === 'out').length, [messages])

    // Topic message counts
    const topicCounts = useMemo(() => {
        const counts: Record<string, number> = {}
        messages.forEach((m) => {
            counts[m.topic] = (counts[m.topic] || 0) + 1
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

    // Actions
    const doSubscribe = async () => {
        const t = subTopic.trim()
        if (!t) {
            setError('请输入要订阅的主题')
            return
        }
        setBusy(true)
        setError('')
        try {
            await API.mqttSubscribe(session.id, t, subQos)
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
        const t = pubTopic.trim()
        if (!t) {
            setError('请输入发布主题')
            return
        }
        setBusy(true)
        setError('')
        try {
            await API.mqttPublish(session.id, t, pubPayload, pubQos, pubRetained)
            setMessages((prev) => {
                const next = prev.concat({
                    dir: 'out',
                    topic: t,
                    payload: pubPayload,
                    qos: pubQos,
                    retained: pubRetained,
                    ts: Date.now(),
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
            setError('当前内容不是合法的 JSON 格式')
        }
    }

    const minifyJson = () => {
        try {
            const obj = JSON.parse(pubPayload)
            setPubPayload(JSON.stringify(obj))
        } catch (e) {
            setError('当前内容不是合法的 JSON 格式')
        }
    }

    const copyPayload = (payload: string, idx: number) => {
        navigator.clipboard.writeText(payload)
        setCopiedIdx(idx)
        setTimeout(() => setCopiedIdx(null), 1500)
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
                        <div className={m.connTitle} title={`${session.host}:${session.port}`}>
                            <Radio size={14} color="var(--accent)" />
                            <span>{session.host}:{session.port}</span>
                        </div>
                        <span className={`${m.statusPill} ${status.connected ? m.connected : m.disconnected}`}>
                            <span className={`${m.statusDot} ${status.connected ? m.pulsing : ''}`} />
                            {status.connected ? '已连接' : '已断开'}
                        </span>
                    </div>

                    <div className={m.connMeta}>
                        <Tag color="purple" style={{ margin: 0, fontSize: 11, fontFamily: 'var(--font-mono)' }} title="Client ID">
                            @{session.clientId || 'auto'}
                        </Tag>
                        <span style={{ fontSize: 11 }}>QoS 0/1/2</span>
                    </div>

                    <div className={m.statsBar}>
                        <div className={m.statItem} title="接收到的消息总量">
                            <ArrowDownToLine size={11} color="#10b981" />
                            <span>接收</span>
                            <strong>{totalIn}</strong>
                        </div>
                        <div className={m.statItem} title="发出的消息总量">
                            <ArrowUpFromLine size={11} color="#3b82f6" />
                            <span>发送</span>
                            <strong>{totalOut}</strong>
                        </div>
                    </div>
                </div>

                {/* Subscriptions Section */}
                <div className={m.subSection}>
                    <div className={m.subSectionHeader}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Layers size={13} color="var(--accent)" />
                            <span>订阅列表</span>
                            <Tag style={{ borderRadius: 10, fontSize: 10, lineHeight: '14px', padding: '0 5px' }}>
                                {subs.length}
                            </Tag>
                        </div>
                        <Button
                            size="small"
                            type={showAddSub ? 'primary' : 'dashed'}
                            icon={showAddSub ? <ChevronUp size={12} /> : <Plus size={12} />}
                            onClick={() => setShowAddSub(!showAddSub)}
                            title="添加新主题订阅"
                        >
                            {showAddSub ? '收起' : '订阅'}
                        </Button>
                    </div>

                    {/* Inline Quick Subscribe */}
                    {showAddSub && (
                        <div className={m.subAddInline}>
                            <Input
                                size="small"
                                placeholder="主题，如 sensor/# 或 home/+"
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
                                    确认订阅
                                </Button>
                            </div>
                        </div>
                    )}

                    {/* Subscription List */}
                    <div className={m.subList}>
                        {subs.length === 0 && !showAddSub && (
                            <div style={{ padding: '24px 12px', textAlign: 'center', color: 'var(--text-dim)', fontSize: 12 }}>
                                <Inbox size={28} style={{ opacity: 0.3, marginBottom: 6 }} />
                                <div>暂无订阅主题</div>
                                <div style={{ fontSize: 11, marginTop: 2 }}>点击上方按钮添加订阅</div>
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
                                    title={isFilteringThis ? '点击清除当前主题筛选' : '点击仅查看此主题消息'}
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
                                                    {count} 条消息
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    <div className={m.subActions} onClick={(e) => e.stopPropagation()}>
                                        <Tooltip title="快速以此主题发布">
                                            <Button
                                                size="small"
                                                type="text"
                                                icon={<Send size={11} />}
                                                onClick={() => fillToPublish(s.topic)}
                                            />
                                        </Tooltip>
                                        <Tooltip title="取消订阅">
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
                                { label: '全部', value: 'all' },
                                { label: '📥 接收', value: 'in' },
                                { label: '📤 发送', value: 'out' },
                            ]}
                        />

                        {filterTopic && (
                            <span className={m.filterBadge}>
                                <Filter size={11} />
                                <span>{filterTopic}</span>
                                <span
                                    title="清除主题筛选"
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
                            placeholder="搜索主题或内容..."
                            prefix={<Search size={12} color="var(--text-dim)" />}
                            value={searchKeyword}
                            onChange={(e) => setSearchKeyword(e.target.value)}
                            allowClear
                        />

                        <span style={{ fontSize: 11.5, color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>
                            显示 <strong>{filteredMessages.length}</strong> / {messages.length} 条
                        </span>
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
                            自动滚屏
                        </Checkbox>
                        <Button
                            size="small"
                            onClick={() => setMessages([])}
                            disabled={messages.length === 0}
                            title="清空当前消息流"
                        >
                            清空
                        </Button>
                        <Tooltip title="关闭 MQTT 客户端">
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
                                {messages.length === 0 ? '暂无实时消息' : '未匹配到符合条件的消息'}
                            </div>
                            <div className={m.emptySubtitle}>
                                {messages.length === 0
                                    ? '订阅主题并发布或接收消息后，实时消息流将在此展示'
                                    : '请尝试更换搜索关键词或重置筛选条件'}
                            </div>
                        </div>
                    )}

                    {filteredMessages.map((msg, i) => {
                        const isIncoming = msg.dir === 'in'
                        const topicColor = getTopicColor(msg.topic)
                        return (
                            <div
                                key={i}
                                className={`${m.msgCard} ${isIncoming ? m.msgIn : m.msgOut}`}
                            >
                                <div className={m.msgCardHeader}>
                                    <div className={m.msgCardMetaLeft}>
                                        <Tag
                                            color={isIncoming ? 'success' : 'processing'}
                                            style={{ margin: 0, fontSize: 10, lineHeight: '16px', padding: '0 4px' }}
                                        >
                                            {isIncoming ? '📥 接收' : '📤 发送'}
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
                                            <Tooltip title={copiedIdx === i ? '已复制' : '复制 Payload'}>
                                                <Button
                                                    size="small"
                                                    type="text"
                                                    icon={copiedIdx === i ? <Check size={12} color="#22c55e" /> : <Copy size={12} />}
                                                    onClick={() => copyPayload(msg.payload, i)}
                                                />
                                            </Tooltip>
                                            <Tooltip title="以此主题发布">
                                                <Button
                                                    size="small"
                                                    type="text"
                                                    icon={<Send size={12} />}
                                                    onClick={() => fillToPublish(msg.topic, msg.payload)}
                                                />
                                            </Tooltip>
                                            <Tooltip title="仅看此主题">
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
                </div>

                {/* ==================== PUBLISH WORKSHOP DOCK ==================== */}
                <div className={m.publishDock}>
                    <div className={m.publishControlsBar}>
                        <Input
                            style={{ flex: 1 }}
                            size="small"
                            placeholder="发布主题，如 sensor/temperature/1"
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
                            保留 (Retain)
                        </Checkbox>

                        <Space size={4}>
                            <Tooltip title="美化 JSON 格式">
                                <Button
                                    size="small"
                                    icon={<Sparkles size={12} />}
                                    onClick={beautifyJson}
                                >
                                    美化
                                </Button>
                            </Tooltip>
                            <Tooltip title="压缩为单行 JSON">
                                <Button
                                    size="small"
                                    icon={<Minimize2 size={12} />}
                                    onClick={minifyJson}
                                >
                                    压缩
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
                            发送
                        </Button>

                        <Tooltip title={publishDockExpanded ? '收起编辑器' : '展开编辑器'}>
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
                                placeholder="输入发布内容（Ctrl/Cmd + Enter 快速发布）"
                                onModEnter={doPublish}
                            />
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
