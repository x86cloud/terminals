import React, {useCallback, useEffect, useRef, useState} from 'react'
import {API, subscribe} from '../api'
import Icon from './Icon'
import {errorMessage} from '../utils'
import {MqttMessage, MqttSessionInfo, MqttSubscription} from '../types'

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
        <div className="mqtt-pane">
            <div className="mqtt-side">
                <div className="mqtt-sub-head">
                    <span>订阅</span>
                    <span className="spacer"/>
                    <span className="mqtt-count">{subs.length}</span>
                </div>
                <div className="mqtt-sub-list">
                    {subs.length === 0 && <div className="mqtt-empty small">尚未订阅任何主题</div>}
                    {subs.map((s) => (
                        <div key={s.topic} className="mqtt-sub-item">
                            <div className="mqtt-sub-topic" title={s.topic}>
                                {s.topic}
                            </div>
                            <div className="mqtt-sub-meta">
                                <span className="qos-badge">Q{s.qos}</span>
                                <button
                                    className="icon-btn danger"
                                    title="取消订阅"
                                    disabled={busy}
                                    onClick={() => doUnsubscribe(s.topic)}
                                >
                                    <Icon name="trash" size={13}/>
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <div className="mqtt-main">
                <div className="mqtt-toolbar">
                    <span className="mqtt-conn-title">MQTT · {session.host}:{session.port}</span>
                    {session.clientId && (
                        <span className="mqtt-client-id" title="客户端 ID">@{session.clientId}</span>
                    )}
                    <span className={`mqtt-status ${status.connected ? 'on' : 'off'}`}>
                        {status.connected ? '已连接' : '已断开'}
                    </span>
                    <span className="spacer"/>
                    {error && <span className="mqtt-error">{error}</span>}
                    <button className="icon-btn" title="关闭" onClick={onClose}>
                        <Icon name="close" size={15}/>
                    </button>
                </div>

                <div className="mqtt-pub">
                    <div className="mqtt-field-row">
                        <input
                            className="mqtt-input topic"
                            placeholder="发布主题，如 home/light/1"
                            value={pubTopic}
                            onChange={(e) => setPubTopic(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) doPublish()
                            }}
                        />
                        <select
                            className="mqtt-qos"
                            value={pubQos}
                            onChange={(e) => setPubQos(Number(e.target.value))}
                        >
                            <option value={0}>QoS 0</option>
                            <option value={1}>QoS 1</option>
                            <option value={2}>QoS 2</option>
                        </select>
                        <label className="mqtt-retained" title="保留消息">
                            <input
                                type="checkbox"
                                checked={pubRetained}
                                onChange={(e) => setPubRetained(e.target.checked)}
                            />
                            保留
                        </label>
                        <button
                            className="btn sm primary"
                            disabled={busy}
                            onClick={doPublish}
                        >
                            发布
                        </button>
                    </div>
                    <textarea
                        className="mqtt-pub-payload"
                        placeholder="消息内容（Ctrl/Cmd + Enter 发布）"
                        value={pubPayload}
                        spellCheck={false}
                        onChange={(e) => setPubPayload(e.target.value)}
                        onKeyDown={(e) => {
                            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                                e.preventDefault()
                                doPublish()
                            }
                        }}
                    />
                </div>

                <div className="mqtt-sub-bar">
                    <input
                        className="mqtt-input topic"
                        placeholder="订阅主题，支持通配符 # +，如 sensor/#"
                        value={subTopic}
                        onChange={(e) => setSubTopic(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') doSubscribe()
                        }}
                    />
                    <select
                        className="mqtt-qos"
                        value={subQos}
                        onChange={(e) => setSubQos(Number(e.target.value))}
                    >
                        <option value={0}>QoS 0</option>
                        <option value={1}>QoS 1</option>
                        <option value={2}>QoS 2</option>
                    </select>
                    <button className="btn sm" disabled={busy} onClick={doSubscribe}>
                        订阅
                    </button>
                </div>

                <div className="mqtt-log" ref={logRef}>
                    {messages.length === 0 && (
                        <div className="mqtt-empty">订阅主题并发布/接收消息后，将在此显示</div>
                    )}
                    {messages.map((m, i) => (
                        <div key={i} className={`mqtt-msg ${m.dir}`}>
                            <div className="mqtt-msg-head">
                                <span className={`mqtt-dir ${m.dir}`}>
                                    {m.dir === 'in' ? '收' : '发'}
                                </span>
                                <span className="mqtt-msg-topic">{m.topic}</span>
                                <span className="mqtt-msg-time">{fmtTime(m.ts)}</span>
                                <span className="qos-badge">Q{m.qos}</span>
                                {m.retained && <span className="retained-badge">保留</span>}
                            </div>
                            <pre className="mqtt-msg-payload">{m.payload}</pre>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}
