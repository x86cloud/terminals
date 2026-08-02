import React, {useCallback, useEffect, useRef, useState} from 'react'
import {API} from '../api'
import type {
    RedisKeysResult,
    RedisSessionInfo,
    RedisValue,
    RedisValueType,
    RedisMode,
    RedisSerialization,
    RedisPipelineResult,
    RedisTransactionResult,
    RedisPubsubMessage,
    RedisKeyspaceMessage,
    RedisMonitorInfo,
    RedisSlowLogEntry,
    RedisQueueItem,
} from '../types'
import Icon from './Icon'
import CodeEditor from './CodeEditor'
import g from '../styles/global.module.less'
import r from './RedisClient.module.less'

interface Props {
    session: RedisSessionInfo
    onClose: () => void
    onDbChange: (id: string, db: number, dbSize: number) => void
}

const TYPE_LABEL: Record<RedisValueType, string> = {
    string: 'String',
    list: 'List',
    set: 'Set',
    hash: 'Hash',
    zset: 'ZSet',
    stream: 'Stream',
}

function formatValue(v: RedisValue): string {
    switch (v.type) {
        case 'string':
            return String(v.value ?? '')
        case 'list':
        case 'set':
            return (Array.isArray(v.value) ? v.value : []).join('\n')
        case 'hash':
            return Object.entries(v.value ?? {})
                .map(([k, val]) => `${k}\n${val}`)
                .join('\n')
        case 'zset':
            return (Array.isArray(v.value) ? v.value : [])
                .map((p: any) => `${p.member}\n${p.score}`)
                .join('\n')
        case 'stream':
            return (Array.isArray(v.value) ? v.value : [])
                .map((e: any) => `${e.id}\n${fmtFields(e.fields)}`)
                .join('\n---\n')
        default:
            return String(v.value ?? '')
    }
}

function fmtFields(f: any): string {
    if (!f) return ''
    if (typeof f === 'object') return Object.entries(f).map(([k, v]) => `${k}=${v}`).join(' ')
    return String(f)
}

const TABS = ['keys', 'pipeline', 'tx', 'pubsub', 'keyspace', 'queue', 'monitor'] as const
type Tab = typeof TABS[number]
const TAB_LABEL: Record<Tab, string> = {
    keys: '键值',
    pipeline: 'Pipeline',
    tx: '事务',
    pubsub: '发布订阅',
    keyspace: '键事件',
    queue: '队列',
    monitor: '监控',
}

export function RedisClient({session, onClose, onDbChange}: Props) {
    const [tab, setTab] = useState<Tab>('keys')
    const [msg, setMsg] = useState('')

    // ---- 键值浏览 ----
    const [pattern, setPattern] = useState('*')
    const [data, setData] = useState<RedisKeysResult>({cursor: '0', keys: []})
    const [selected, setSelected] = useState('')
    const [value, setValue] = useState<RedisValue | null>(null)
    const [editor, setEditor] = useState('')
    const [cliInput, setCliInput] = useState('')
    const [cliResult, setCliResult] = useState('')
    const [ttl, setTtl] = useState(0)
    const [db, setDb] = useState(session.db)
    const [dbInput, setDbInput] = useState(String(session.db))
    const cursorRef = useRef('0')

    // ---- 监控 ----
    const [monitor, setMonitor] = useState<RedisMonitorInfo | null>(null)

    // ---- Pipeline / 事务 ----
    const [batchCmds, setBatchCmds] = useState('')
    const [batchWatch, setBatchWatch] = useState('')
    const [batchResult, setBatchResult] = useState<RedisPipelineResult | RedisTransactionResult | null>(null)

    // ---- Pub/Sub ----
    const [psChannel, setPsChannel] = useState('')
    const [psPattern, setPsPattern] = useState('')
    const [psMessages, setPsMessages] = useState<RedisPubsubMessage[]>([])
    const [psSubs, setPsSubs] = useState<string[]>([])

    // ---- 键事件 ----
    const [ksDb, setKsDb] = useState(session.db)
    const [ksEvent, setKsEvent] = useState('expired')
    const [ksMessages, setKsMessages] = useState<RedisKeyspaceMessage[]>([])

    // ---- 队列 ----
    const [qName, setQName] = useState('')
    const [qPayload, setQPayload] = useState('')
    const [qMode, setQMode] = useState<'list' | 'stream'>('list')
    const [qTimeout, setQTimeout] = useState(1)
    const [qLen, setQLen] = useState(0)
    const [qOut, setQOut] = useState<RedisQueueItem | null>(null)

    // ---- 慢日志 ----
    const [slowLogs, setSlowLogs] = useState<RedisSlowLogEntry[]>([])

    const flash = useCallback((m: string) => {
        setMsg(m)
        setTimeout(() => setMsg(''), 3000)
    }, [])

    // 订阅后端事件
    useEffect(() => {
        const onPs = (ev: any) => {
            try {
                const m = (typeof ev === 'string' ? JSON.parse(ev) : ev) as RedisPubsubMessage
                setPsMessages((prev) => [m, ...prev].slice(0, 200))
            } catch {
            }
        }
        const onKs = (ev: any) => {
            try {
                const m = (typeof ev === 'string' ? JSON.parse(ev) : ev) as RedisKeyspaceMessage
                setKsMessages((prev) => [m, ...prev].slice(0, 200))
            } catch {
            }
        }
        // @ts-ignore - 运行时由 wails 注入
        const rt = (window as any).runtime
        if (rt?.EventsOn) {
            rt.EventsOn('redis:pubsub:' + session.id, onPs)
            rt.EventsOn('redis:keyspace:' + session.id, onKs)
            return () => {
                rt.EventsOff('redis:pubsub:' + session.id)
                rt.EventsOff('redis:keyspace:' + session.id)
            }
        }
        return undefined
    }, [session.id])

    const loadKeys = useCallback(
        async (reset = true) => {
            const cur = reset ? '0' : cursorRef.current
            try {
                const res = await API.redisKeys(session.id, pattern, cur)
                const keys = Array.isArray(res.keys) ? res.keys : []
                cursorRef.current = res.cursor
                setData((d) => ({
                    cursor: res.cursor,
                    keys: reset ? keys : [...d.keys, ...keys],
                }))
            } catch (e: any) {
                flash('加载键失败: ' + (e?.message || e))
            }
        },
        [session.id, pattern]
    )

    const loadValue = useCallback(
        async (key: string) => {
            if (!key) return
            setSelected(key)
            try {
                const v = await API.redisGet(session.id, key)
                setValue(v)
                setEditor(formatValue(v))
                setTtl(v.ttl)
            } catch (e: any) {
                flash('读取失败: ' + (e?.message || e))
                setValue(null)
            }
        },
        [session.id]
    )

    useEffect(() => {
        cursorRef.current = '0'
        setData({cursor: '0', keys: []})
        setSelected('')
        setValue(null)
        setMsg('')
        setDb(session.db)
        setDbInput(String(session.db))
        loadKeys(true)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [session.id])

    const switchDb = async () => {
        const n = Number(dbInput) || 0
        if (n === db) return
        try {
            await API.redisSelectDB(session.id, n)
            const size = await API.redisDBSize(session.id).catch(() => 0)
            setDb(n)
            setSelected('')
            setValue(null)
            cursorRef.current = '0'
            setData({cursor: '0', keys: []})
            await loadKeys(true)
            onDbChange(session.id, n, size)
        } catch (e: any) {
            flash('切换数据库失败: ' + (e?.message || e))
        }
    }

    const saveValue = async () => {
        if (!selected || !value) return
        try {
            await API.redisSet(session.id, selected, value.type, editor, ttl)
            flash('已保存')
            await loadValue(selected)
            loadKeys(true)
        } catch (e: any) {
            flash('保存失败: ' + (e?.message || e))
        }
    }

    const delKey = async () => {
        if (!selected) return
        if (!confirm(`确认删除键 ${selected} ?`)) return
        try {
            await API.redisDelete(session.id, selected)
            setSelected('')
            setValue(null)
            loadKeys(true)
        } catch (e: any) {
            flash('删除失败: ' + (e?.message || e))
        }
    }

    const runRaw = async (cmd: string) => {
        if (!cmd.trim()) return
        try {
            const r = await API.redisRaw(session.id, cmd)
            return r.result ?? ''
        } catch (e: any) {
            return 'ERROR: ' + (e?.message || e)
        }
    }

    // ---- Pipeline ----
    const runPipeline = async () => {
        const cmds = batchCmds.split('\n').map((s) => s.trim()).filter(Boolean)
        if (cmds.length === 0) return
        try {
            const res = await API.redisPipeline(session.id, cmds)
            setBatchResult(res)
            flash('Pipeline 执行完成')
        } catch (e: any) {
            flash('Pipeline 失败: ' + (e?.message || e))
        }
    }

    // ---- 事务 ----
    const runTx = async () => {
        const cmds = batchCmds.split('\n').map((s) => s.trim()).filter(Boolean)
        if (cmds.length === 0) return
        const watch = batchWatch.split(',').map((s) => s.trim()).filter(Boolean)
        try {
            const res = await API.redisTransaction(session.id, watch, cmds)
            setBatchResult(res)
            flash(res.aborted ? '事务因 WATCH 冲突被中止' : '事务执行完成')
        } catch (e: any) {
            flash('事务失败: ' + (e?.message || e))
        }
    }

    // ---- Pub/Sub ----
    const doSubscribe = async () => {
        if (!psChannel.trim()) return
        try {
            await API.redisSubscribe(session.id, psChannel.trim())
            setPsSubs((p) => (p.includes(psChannel.trim()) ? p : [...p, psChannel.trim()]))
            flash('已订阅 ' + psChannel)
        } catch (e: any) {
            flash('订阅失败: ' + (e?.message || e))
        }
    }
    const doPSubscribe = async () => {
        if (!psPattern.trim()) return
        try {
            await API.redisPSubscribe(session.id, psPattern.trim())
            setPsSubs((p) => (p.includes(psPattern.trim()) ? p : [...p, psPattern.trim()]))
            flash('已模式订阅 ' + psPattern)
        } catch (e: any) {
            flash('订阅失败: ' + (e?.message || e))
        }
    }
    const doPublish = async () => {
        if (!psChannel.trim()) return
        try {
            await API.redisPublish(session.id, psChannel.trim(), psPattern)
            flash('已发布')
        } catch (e: any) {
            flash('发布失败: ' + (e?.message || e))
        }
    }
    const doUnsub = async (ch: string) => {
        try {
            await API.redisUnsubscribe(session.id, ch)
            setPsSubs((p) => p.filter((x) => x !== ch))
        } catch (e: any) {
            flash('取消订阅失败: ' + (e?.message || e))
        }
    }

    // ---- 键事件 ----
    const startKeyspace = async () => {
        try {
            await API.redisKeyspaceNotify(session.id, Number(ksDb) || 0, ksEvent.trim() || 'expired')
            flash(`已监听键事件 ${ksEvent} @db${ksDb}`)
        } catch (e: any) {
            flash('监听失败: ' + (e?.message || e))
        }
    }

    // ---- 队列 ----
    const enqueue = async () => {
        if (!qName.trim()) return
        try {
            await API.redisQueueEnqueue(session.id, qName.trim(), qPayload, qMode)
            setQLen(await API.redisQueueLength(session.id, qName.trim(), qMode).catch(() => 0))
            flash('已入队')
        } catch (e: any) {
            flash('入队失败: ' + (e?.message || e))
        }
    }
    const dequeue = async () => {
        if (!qName.trim()) return
        try {
            const item = await API.redisQueueDequeue(session.id, qName.trim(), qMode, Number(qTimeout) || 1)
            setQOut(item)
            setQLen(await API.redisQueueLength(session.id, qName.trim(), qMode).catch(() => 0))
        } catch (e: any) {
            flash('出队失败: ' + (e?.message || e))
        }
    }

    // ---- 监控 ----
    const refreshMonitor = useCallback(async () => {
        try {
            const m = await API.redisMonitor(session.id)
            setMonitor(m)
        } catch (e: any) {
            flash('监控读取失败: ' + (e?.message || e))
        }
    }, [session.id])

    const refreshSlowLog = useCallback(async () => {
        try {
            setSlowLogs(await API.redisSlowLog(session.id, 20))
        } catch (e: any) {
            flash('慢日志读取失败: ' + (e?.message || e))
        }
    }, [session.id])

    useEffect(() => {
        if (tab === 'monitor') refreshMonitor()
        if (tab === 'keyspace') refreshSlowLog()
    }, [tab, refreshMonitor, refreshSlowLog])

    return (
        <div className={r.redisPane}>
            <div className={r.redisTop}>
                <div className={r.tabs}>
                    {TABS.map((t) => (
                        <button
                            key={t}
                            className={`${r.tab} ${t === tab ? ' ' + r.active : ''}`}
                            onClick={() => setTab(t)}
                        >
                            {TAB_LABEL[t]}
                        </button>
                    ))}
                </div>
                <div className={r.modeTag}>
                    {session.mode && <span className={r.modeBadge}>{session.mode}</span>}
                    {session.breaker && <span className={`${r.modeBadge} ${r['bk_' + session.breaker]}`}>{session.breaker}</span>}
                </div>
                <span className={g.spacer}/>
                <button className={`${g.btn} ${g.sm}`} onClick={onClose}>关闭</button>
            </div>

            {msg && <div className={r.redisMsg}>{msg}</div>}

            {tab === 'keys' && (
                <div className={r.body}>
                    <div className={r.redisSide}>
                        <div className={r.redisSideHead}>
                            <input
                                className={r.redisSearch}
                                placeholder="搜索 pattern"
                                value={pattern}
                                onChange={(e) => setPattern(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && loadKeys(true)}
                            />
                            <button className={`${g.btn} ${g.sm}`} onClick={() => loadKeys(true)}>刷新</button>
                            <button className={`${g.btn} ${g.sm}`} onClick={() => loadKeys(false)} disabled={data.cursor === '0'}>
                                更多
                            </button>
                        </div>
                        <div className={r.redisDbBar}>
                            <span className={r.redisDbLabel}>DB</span>
                            <input
                                className={r.redisDbInput}
                                type="number"
                                min={0}
                                value={dbInput}
                                onChange={(e) => setDbInput(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && switchDb()}
                            />
                            <button className={`${g.btn} ${g.sm}`} onClick={switchDb} disabled={Number(dbInput) === db}>
                                切换
                            </button>
                            <span className={r.redisDbCount}>{data.keys.length} 键 / 共 {session.dbSize}</span>
                        </div>
                        <div className={r.redisKeys}>
                            {data.keys.length === 0 && <div className={r.redisEmpty}>无键</div>}
                            {data.keys.map((k) => (
                                <div
                                    key={k}
                                    className={`${r.redisKey} ${k === selected ? ' ' + r.active : ''}`}
                                    onClick={() => loadValue(k)}
                                    title={k}
                                >
                                    {k}
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className={r.redisMain}>
                        {selected && value ? (
                            <>
                                <div className={r.redisValueHead}>
                                    <span className={r.redisKeyName} title={selected}>{selected}</span>
                                    <span className={r.redisTypeBadge}>{TYPE_LABEL[value.type]}</span>
                                    <span className={r.redisTtl}>TTL: {ttl}</span>
                                </div>
                                {value.type === 'stream' ? (
                                    <CodeEditor
                                        value={editor}
                                        onChange={setEditor}
                                        lang="plain"
                                        height="220px"
                                        readOnly
                                        placeholder="值内容"
                                    />
                                ) : (
                                    <CodeEditor
                                        value={editor}
                                        onChange={setEditor}
                                        lang="plain"
                                        height="280px"
                                        placeholder="值内容"
                                    />
                                )}
                                <div className={r.redisValueActions}>
                                    <label className={r.redisTtlInput}>
                                        TTL(秒)
                                        <input
                                            type="number"
                                            value={ttl}
                                            onChange={(e) => setTtl(Number(e.target.value) || 0)}
                                        />
                                    </label>
                                    <button className={`${g.btn} ${g.primary} ${g.sm}`} onClick={saveValue}>保存</button>
                                    <button className={`${g.btn} ${g.danger} ${g.sm}`} onClick={delKey}>删除</button>
                                </div>
                                <ValueEditor session={session} value={value} selected={selected} flash={flash}/>
                            </>
                        ) : (
                            <div className={r.redisEmpty}>从左侧选择一个键查看 / 编辑</div>
                        )}

                        <div className={r.redisCli}>
                            <div className={r.redisCliHead}>命令行</div>
                            <div className={r.redisCliRow}>
                                <CodeEditor
                                    value={cliInput}
                                    onChange={setCliInput}
                                    lang="plain"
                                    height="56px"
                                    placeholder="例如 GET foo / HGETALL myhash"
                                    onEnter={async (v) => {
                                        if (!v.trim()) return
                                        const res = await runRaw(v)
                                        setCliResult(res || '')
                                        setCliInput('')
                                    }}
                                />
                            </div>
                            <pre className={r.redisCliResult}>{cliResult}</pre>
                        </div>
                    </div>
                </div>
            )}

            {tab === 'pipeline' && (
                <BatchPanel
                    title="Pipeline 批量执行（非事务，依次发送）"
                    cmds={batchCmds}
                    setCmds={setBatchCmds}
                    watch={batchWatch}
                    setWatch={setBatchWatch}
                    onRun={runPipeline}
                    runLabel="执行 Pipeline"
                    result={batchResult}
                />
            )}

            {tab === 'tx' && (
                <BatchPanel
                    title="事务 MULTI / EXEC / WATCH（乐观锁）"
                    cmds={batchCmds}
                    setCmds={setBatchCmds}
                    watch={batchWatch}
                    setWatch={setBatchWatch}
                    onRun={runTx}
                    runLabel="执行事务"
                    result={batchResult}
                    showWatch
                />
            )}

            {tab === 'pubsub' && (
                <div className={r.panel}>
                    <div className={r.row}>
                        <input className={r.input} placeholder="频道" value={psChannel} onChange={(e) => setPsChannel(e.target.value)}/>
                        <button className={`${g.btn} ${g.sm}`} onClick={doSubscribe}>订阅</button>
                        <button className={`${g.btn} ${g.sm}`} onClick={doPublish}>发布</button>
                    </div>
                    <div className={r.row}>
                        <input className={r.input} placeholder="模式（如 news.*）" value={psPattern} onChange={(e) => setPsPattern(e.target.value)}/>
                        <button className={`${g.btn} ${g.sm}`} onClick={doPSubscribe}>模式订阅</button>
                    </div>
                    <div className={r.subs}>
                        当前订阅：{psSubs.length === 0 ? '无' : psSubs.map((s) => (
                        <span key={s} className={r.subChip}>
                            {s}
                            <button className={r.subX} onClick={() => doUnsub(s)}>×</button>
                        </span>
                    ))}
                    </div>
                    <div className={r.msgList}>
                        {psMessages.length === 0 && <div className={r.redisEmpty}>暂无消息</div>}
                        {psMessages.map((m, i) => (
                            <div key={i} className={r.msgItem}>
                                <span className={r.msgChan}>[{m.channel}]</span>
                                <span className={r.msgPayload}>{m.payload}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {tab === 'keyspace' && (
                <div className={r.panel}>
                    <div className={r.row}>
                        <span>DB</span>
                        <input className={r.inputSm} type="number" value={ksDb} onChange={(e) => setKsDb(Number(e.target.value))}/>
                        <span>事件</span>
                        <input className={r.input} placeholder="expired / set / del ..." value={ksEvent} onChange={(e) => setKsEvent(e.target.value)}/>
                        <button className={`${g.btn} ${g.sm}`} onClick={startKeyspace}>开始监听</button>
                    </div>
                    <div className={r.msgList}>
                        {ksMessages.length === 0 && <div className={r.redisEmpty}>暂无键事件（需 Redis 开启 notify-keyspace-events）</div>}
                        {ksMessages.map((m, i) => (
                            <div key={i} className={r.msgItem}>
                                <span className={r.msgChan}>[{m.event}]</span>
                                <span className={r.msgKey}>{m.key}</span>
                            </div>
                        ))}
                    </div>
                    <div className={r.subHead}>慢查询日志（最近 20 条）</div>
                    <div className={r.msgList}>
                        {slowLogs.length === 0 && <div className={r.redisEmpty}>暂无慢日志</div>}
                        {slowLogs.map((s, i) => (
                            <div key={i} className={r.msgItem}>
                                <span className={r.msgChan}>{(s.duration / 1000).toFixed(2)}ms</span>
                                <span className={r.msgPayload}>{s.command}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {tab === 'queue' && (
                <div className={r.panel}>
                    <div className={r.row}>
                        <input className={r.input} placeholder="队列名" value={qName} onChange={(e) => setQName(e.target.value)}/>
                        <select className={r.inputSm} value={qMode} onChange={(e) => setQMode(e.target.value as any)}>
                            <option value="list">List (RPUSH/BLPOP)</option>
                            <option value="stream">Stream (XADD/XREAD)</option>
                        </select>
                        <span>长度 {qLen}</span>
                    </div>
                    <div className={r.row}>
                        <input className={r.input} placeholder="消息内容" value={qPayload} onChange={(e) => setQPayload(e.target.value)}/>
                        <button className={`${g.btn} ${g.sm}`} onClick={enqueue}>入队</button>
                        <span>超时(s)</span>
                        <input className={r.inputSm} type="number" value={qTimeout} onChange={(e) => setQTimeout(Number(e.target.value))}/>
                        <button className={`${g.btn} ${g.sm}`} onClick={dequeue}>出队</button>
                    </div>
                    {qOut && (
                        <div className={r.msgItem}>
                            <span className={r.msgChan}>[{qOut.id}]</span>
                            <span className={r.msgPayload}>{fmtFields(qOut.payload)}</span>
                        </div>
                    )}
                </div>
            )}

            {tab === 'monitor' && (
                <div className={r.panel}>
                    <button className={`${g.btn} ${g.sm}`} onClick={refreshMonitor}>刷新</button>
                    {monitor && (
                        <div className={r.monitorGrid}>
                            <Metric label="熔断状态" value={monitor.breaker}/>
                            <Metric label="命中" value={monitor.hits}/>
                            <Metric label="未命中" value={monitor.misses}/>
                            <Metric label="超时" value={monitor.timeouts}/>
                            <Metric label="总连接" value={monitor.totalConns}/>
                            <Metric label="空闲连接" value={monitor.idleConns}/>
                            <Metric label="陈旧连接" value={monitor.staleConns}/>
                            <Metric label="模式" value={monitor.mode}/>
                            <Metric label="序列化" value={monitor.serialization}/>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

function Metric({label, value}: { label: string; value: any }) {
    return (
        <div className={r.metric}>
            <span className={r.metricLabel}>{label}</span>
            <span className={r.metricValue}>{String(value)}</span>
        </div>
    )
}

// 类型专属细粒度编辑
function ValueEditor({session, value, selected, flash}: {
    session: RedisSessionInfo
    value: RedisValue
    selected: string
    flash: (m: string) => void
}) {
    const [field, setField] = useState('')
    const [fval, setFval] = useState('')
    const [member, setMember] = useState('')
    const [score, setScore] = useState('')
    const [pushVal, setPushVal] = useState('')

    if (value.type === 'hash') {
        return (
            <div className={r.miniEdit}>
                <div className={r.subHead}>Hash 字段</div>
                <div className={r.row}>
                    <input className={r.input} placeholder="field" value={field} onChange={(e) => setField(e.target.value)}/>
                    <input className={r.input} placeholder="value" value={fval} onChange={(e) => setFval(e.target.value)}/>
                    <button className={`${g.btn} ${g.sm}`} onClick={async () => {
                        await API.redisHashFieldSet(session.id, selected, field, fval)
                        flash('已设置字段')
                    }}>HSET</button>
                </div>
            </div>
        )
    }
    if (value.type === 'list') {
        return (
            <div className={r.miniEdit}>
                <div className={r.subHead}>List 元素</div>
                <div className={r.row}>
                    <input className={r.input} placeholder="value" value={pushVal} onChange={(e) => setPushVal(e.target.value)}/>
                    <button className={`${g.btn} ${g.sm}`} onClick={async () => {
                        await API.redisListPush(session.id, selected, pushVal, false)
                        flash('已 RPUSH')
                    }}>RPUSH</button>
                    <button className={`${g.btn} ${g.sm}`} onClick={async () => {
                        const v = await API.redisListPop(session.id, selected, true)
                        flash('LPOP: ' + v)
                    }}>LPOP</button>
                </div>
            </div>
        )
    }
    if (value.type === 'set') {
        return (
            <div className={r.miniEdit}>
                <div className={r.subHead}>Set 成员</div>
                <div className={r.row}>
                    <input className={r.input} placeholder="member" value={member} onChange={(e) => setMember(e.target.value)}/>
                    <button className={`${g.btn} ${g.sm}`} onClick={async () => {
                        await API.redisSetAdd(session.id, selected, [member])
                        flash('已 SADD')
                    }}>SADD</button>
                </div>
            </div>
        )
    }
    if (value.type === 'zset') {
        return (
            <div className={r.miniEdit}>
                <div className={r.subHead}>ZSet 成员</div>
                <div className={r.row}>
                    <input className={r.input} placeholder="member" value={member} onChange={(e) => setMember(e.target.value)}/>
                    <input className={r.inputSm} placeholder="score" value={score} onChange={(e) => setScore(e.target.value)}/>
                    <button className={`${g.btn} ${g.sm}`} onClick={async () => {
                        await API.redisZSetAdd(session.id, selected, member, Number(score) || 0)
                        flash('已 ZADD')
                    }}>ZADD</button>
                </div>
            </div>
        )
    }
    return null
}

function BatchPanel({title, cmds, setCmds, watch, setWatch, onRun, runLabel, result, showWatch}: {
    title: string
    cmds: string
    setCmds: (v: string) => void
    watch: string
    setWatch: (v: string) => void
    onRun: () => void
    runLabel: string
    result: RedisPipelineResult | RedisTransactionResult | null
    showWatch?: boolean
}) {
    return (
        <div className={r.panel}>
            <div className={r.subHead}>{title}</div>
            {showWatch && (
                <div className={r.row}>
                    <span>WATCH 键(逗号分隔)</span>
                    <input className={r.input} value={watch} onChange={(e) => setWatch(e.target.value)} placeholder="key1,key2"/>
                </div>
            )}
            <CodeEditor
                value={cmds}
                onChange={setCmds}
                lang="plain"
                height="200px"
                placeholder={'每行一条命令，例如：\nSET foo bar\nINCR counter\nHSET h k v'}
            />
            <button className={`${g.btn} ${g.primary} ${g.sm}`} onClick={onRun}>{runLabel}</button>
            {result && (
                <div className={r.msgList}>
                    {'aborted' in result && result.aborted && <div className={r.redisMsg}>事务被中止（WATCH 冲突）</div>}
                    {result.results?.map((r2, i) => (
                        <div key={i} className={r.msgItem}>
                            <span className={r.msgChan}>#{i + 1}</span>
                            <span className={r.msgPayload}>{r2.result}</span>
                            {r2.error && <span className={r.msgErr}>{r2.error}</span>}
                        </div>
                    ))}
                    {result.error && <div className={r.msgErr}>整体错误: {result.error}</div>}
                </div>
            )}
        </div>
    )
}

export default RedisClient
