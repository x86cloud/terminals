import React, {useCallback, useEffect, useRef, useState} from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { Trash2, X } from 'lucide-react'
import {API, subscribe} from '@/api'
import CodeEditor from '@/components/CodeEditor'
import {errorMessage} from '@/utils'
import {MqttMessage, MqttSessionInfo, MqttSubscription} from '@/types'
import g from '@/styles/global.module.less'
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

const MAX_MESSAGES = 500

export default function MqttClient({session, onClose}: Props) {
    const [subs, setSubs] = useState<MqttSubscription[]>([])
    const [messages, setMessages] = useState<MqttMessage[]>([])
    const [subTopic, setSubTopic] = useState('')
    const [subQos, setSubQos] = useState(0)
    const [pubTopic, setPubTopic] = useState('')
    const [pubPayload, setPubPayload] = useState('')
    const [pubQos, setPubQos] = useState(0)
    const [pubRetained, setPubRetained] = useState(false)
    const [status, setStatus] = useState<{ connected: boolean; error?: string }>({
        connected: session.connected,
    })
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')
    const logRef = useRef<HTMLDivElement>(null)

    const reloadSubs = useCallback(async () => {
        try {
            const list = await API.mqttSubscriptions(session.id)
            setSubs(list)
        } catch (e) {
            // 连接可能已断开
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
            setStatus({connected: !!data.connected, error: data.error})
        })
        return () => {
            offMsg()
            offStatus()
        }
    }, [session.id, reloadSubs])

    useEffect(() => {
        const el = logRef.current
        if (el) el.scrollTop = el.scrollHeight
    }, [messages])

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

    return (
        <div className={m.mqttPane}>
            <div className={m.mqttSide}>
                <div className={m.mqttSubHead}>
                    <span>订阅</span>
                    <span className={g.spacer}/>
                    <span className={m.mqttCount}>{subs.length}</span>
                </div>
                <div className={m.mqttSubList}>
                    {subs.length === 0 && <div className={`${m.mqttEmpty} ${m.small}`}>尚未订阅任何主题</div>}
                    {subs.map((s) => (
                        <div key={s.topic} className={m.mqttSubItem}>
                            <div className={m.mqttSubTopic} title={s.topic}>
                                {s.topic}
                            </div>
                            <div className={m.mqttSubMeta}>
                                <span className={m.qosBadge}>Q{s.qos}</span>
                                <button
                                    className={`${g.iconBtn} ${g.danger}`}
                                    title="取消订阅"
                                    disabled={busy}
                                    onClick={() => doUnsubscribe(s.topic)}
                                >
                                    <Trash2 size={13}/>
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <div className={m.mqttMain}>
                <div className={m.mqttToolbar}>
                    <span className={m.mqttConnTitle}>MQTT · {session.host}:{session.port}</span>
                    {session.clientId && (
                        <span className={m.mqttClientId} title="客户端 ID">@{session.clientId}</span>
                    )}
                    <span className={`${m.mqttStatus} ${status.connected ? m.on : m.off}`}>
                        {status.connected ? '已连接' : '已断开'}
                    </span>
                    <span className={g.spacer}/>
                    {error && <span className={m.mqttError}>{error}</span>}
                    <button className={`${g.btn} ${g.sm}`} onClick={() => setMessages([])}>
                        清空消息
                    </button>
                    <button className={g.iconBtn} title="关闭" onClick={onClose}>
                        <X size={15}/>
                    </button>
                </div>

                <div className={m.mqttPub}>
                    <div className={m.mqttFieldRow}>
                        <input
                            className={m.mqttInputTopic}
                            placeholder="发布主题，如 home/light/1"
                            value={pubTopic}
                            onChange={(e) => setPubTopic(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) doPublish()
                            }}
                        />
                        <select
                            className={m.mqttQos}
                            value={pubQos}
                            onChange={(e) => setPubQos(Number(e.target.value))}
                        >
                            <option value={0}>QoS 0</option>
                            <option value={1}>QoS 1</option>
                            <option value={2}>QoS 2</option>
                        </select>
                        <label className={m.mqttRetained} title="保留消息">
                            <input
                                type="checkbox"
                                checked={pubRetained}
                                onChange={(e) => setPubRetained(e.target.checked)}
                            />
                            保留
                        </label>
                        <button
                            className={`${g.btn} ${g.sm} ${g.primary}`}
                            disabled={busy}
                            onClick={doPublish}
                        >
                            发布
                        </button>
                    </div>
                    <CodeEditor
                        value={pubPayload}
                        onChange={setPubPayload}
                        lang={/^\s*[[{]/.test(pubPayload) ? 'json' : 'plain'}
                        height="120px"
                        placeholder="消息内容（Ctrl/Cmd + Enter 发布）"
                        onModEnter={() => doPublish()}
                    />
                </div>

                <div className={m.mqttSubBar}>
                    <input
                        className={m.mqttInputTopic}
                        placeholder="订阅主题，支持通配符 # +，如 sensor/#"
                        value={subTopic}
                        onChange={(e) => setSubTopic(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') doSubscribe()
                        }}
                    />
                    <select
                        className={m.mqttQos}
                        value={subQos}
                        onChange={(e) => setSubQos(Number(e.target.value))}
                    >
                        <option value={0}>QoS 0</option>
                        <option value={1}>QoS 1</option>
                        <option value={2}>QoS 2</option>
                    </select>
                    <button className={`${g.btn} ${g.sm}`} disabled={busy} onClick={doSubscribe}>
                        订阅
                    </button>
                </div>

                <div className={m.mqttLog} ref={logRef}>
                    {messages.length === 0 && (
                        <div className={m.mqttEmpty}>订阅主题并发布/接收消息后，将在此显示</div>
                    )}
                    {messages.map((msg, i) => (
                        <div key={i} className={`${m.mqttMsg} ${msg.dir}`}>
                            <div className={m.mqttMsgHead}>
                                <span className={`${m.mqttDir} ${msg.dir}`}>
                                    {msg.dir === 'in' ? '收' : '发'}
                                </span>
                                <span className={m.mqttMsgTopic}>{msg.topic}</span>
                                <span className={m.mqttMsgTime}>{fmtTime(msg.ts)}</span>
                                <span className={m.qosBadge}>Q{msg.qos}</span>
                                {msg.retained && <span className={m.retainedBadge}>保留</span>}
                            </div>
                            <pre className={m.mqttMsgPayload}>{msg.payload}</pre>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}
