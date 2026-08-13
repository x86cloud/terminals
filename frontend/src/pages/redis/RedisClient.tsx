import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react'
import {API, subscribe} from '@/api'
import type {
    RedisKeysResult,
    RedisSessionInfo,
    RedisValue,
    RedisPipelineResult,
    RedisTransactionResult,
    RedisPubsubMessage,
    RedisKeyspaceMessage,
    RedisMonitorInfo,
    RedisSlowLogEntry,
    RedisQueueItem,
} from '@/types'
import {ConfirmModal, ConfirmState} from '@/components/Modal'
import {
    KeyTreeNode,
    Tab,
    TABS,
    TAB_LABEL,
    buildKeyTree,
    collectLeafKeys,
    formatValue,
} from '@/pages/redis/redisTypes'
import KeysTab from '@/pages/redis/KeysTab'
import BatchPanel from '@/pages/redis/BatchPanel'
import PubSubTab from '@/pages/redis/PubSubTab'
import KeyspaceTab from '@/pages/redis/KeyspaceTab'
import QueueTab from '@/pages/redis/QueueTab'
import MonitorTab from '@/pages/redis/MonitorTab'
import g from '@/styles/global.module.less'
import r from '@/pages/redis/RedisClient.module.less'

interface Props {
    session: RedisSessionInfo
    onClose: () => void
    onDbChange: (id: string, db: number, dbSize: number) => void
}

export default function RedisClient({session, onClose, onDbChange}: Props) {
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

    // ---- 树状分层视图 ----
    const [viewMode, setViewMode] = useState<'tree' | 'flat'>('tree')
    const [delimiter, setDelimiter] = useState(':')
    const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set())

    const toggleExpand = useCallback((nodeKey: string) => {
        setExpandedKeys((prev) => {
            const next = new Set(prev)
            if (next.has(nodeKey)) next.delete(nodeKey)
            else next.add(nodeKey)
            return next
        })
    }, [])

    const keyTree = useMemo(() => buildKeyTree(data.keys, delimiter), [data.keys, delimiter])

    useEffect(() => {
        if (!pattern.trim() || pattern === '*') return
        const searchLower = pattern.toLowerCase().trim().replace(/\*/g, '')
        if (!searchLower) return
        const expanded = new Set<string>()

        function traverse(node: KeyTreeNode): boolean {
            if (node.isLeaf) {
                return (node.fullKey || node.name).toLowerCase().includes(searchLower)
            }
            let hasMatch = false
            for (const child of node.children) {
                if (traverse(child)) hasMatch = true
            }
            if (hasMatch) expanded.add(node.key)
            return hasMatch
        }

        for (const rootNode of keyTree) {
            traverse(rootNode)
        }
        if (expanded.size > 0) {
            setExpandedKeys((prev) => new Set([...prev, ...expanded]))
        }
    }, [pattern, keyTree])

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

    const emptyConfirm: ConfirmState = {open: false, title: '', message: ''}
    const [confirmState, setConfirmState] = useState<ConfirmState>(emptyConfirm)

    const msgTimerRef = useRef<number | null>(null)
    const flash = useCallback((m: string) => {
        setMsg(m)
        if (msgTimerRef.current) window.clearTimeout(msgTimerRef.current)
        msgTimerRef.current = window.setTimeout(() => setMsg(''), 3000)
    }, [])

    useEffect(() => {
        return () => {
            if (msgTimerRef.current) window.clearTimeout(msgTimerRef.current)
        }
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
        const offPs = subscribe('redis:pubsub:' + session.id, onPs)
        const offKs = subscribe('redis:keyspace:' + session.id, onKs)
        return () => {
            offPs()
            offKs()
        }
    }, [session.id])

    const loadKeys = useCallback(
        async (reset = true) => {
            const cur = reset ? '0' : cursorRef.current
            try {
                const res = await API.redisKeys(session.id, pattern, cur)
                const rawKeys = Array.isArray(res?.keys) ? res.keys : []
                const keys: string[] = rawKeys
                    .map((item: any) => {
                        if (typeof item === 'string') return item
                        if (item && typeof item === 'object' && item.key) return String(item.key)
                        return String(item ?? '')
                    })
                    .filter(Boolean)
                const nextCursor = String(res?.cursor ?? '0')
                cursorRef.current = nextCursor
                setData((d) => ({
                    cursor: nextCursor,
                    keys: reset ? keys : [...(Array.isArray(d?.keys) ? d.keys : []), ...keys],
                }))
            } catch (e: any) {
                flash('加载键失败: ' + (e?.message || e))
            }
        },
        [session.id, pattern, flash]
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
        [session.id, flash]
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

    const delKey = (keyName?: string) => {
        const k = keyName || selected
        if (!k) return
        setConfirmState({
            open: true,
            title: '删除键',
            danger: true,
            message: `确认删除键 ${k} ？该操作不可撤销。`,
            onConfirm: async () => {
                setConfirmState(emptyConfirm)
                try {
                    await API.redisDelete(session.id, k)
                    if (selected === k) {
                        setSelected('')
                        setValue(null)
                    }
                    loadKeys(true)
                } catch (e: any) {
                    flash('删除失败: ' + (e?.message || e))
                }
            },
        })
    }

    const delFolder = useCallback((node: KeyTreeNode) => {
        const leafKeys = collectLeafKeys(node)
        if (leafKeys.length === 0) return
        setConfirmState({
            open: true,
            title: '批量删除文件夹',
            danger: true,
            message: `确认删除文件夹“${node.name}”下的所有 ${leafKeys.length} 个 Key？该操作不可撤销！`,
            onConfirm: async () => {
                setConfirmState(emptyConfirm)
                try {
                    let deletedCount = 0
                    for (const k of leafKeys) {
                        await API.redisDelete(session.id, k)
                        deletedCount++
                    }
                    if (selected && leafKeys.includes(selected)) {
                        setSelected('')
                        setValue(null)
                    }
                    flash(`已成功批量删除 ${deletedCount} 个 Key`)
                    loadKeys(true)
                } catch (e: any) {
                    flash('批量删除失败: ' + (e?.message || e))
                }
            },
        })
    }, [session.id, selected, flash, loadKeys])

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
    }, [session.id, flash])

    const refreshSlowLog = useCallback(async () => {
        try {
            setSlowLogs(await API.redisSlowLog(session.id, 20))
        } catch (e: any) {
            flash('慢日志读取失败: ' + (e?.message || e))
        }
    }, [session.id, flash])

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
                <KeysTab
                    session={session}
                    pattern={pattern}
                    setPattern={setPattern}
                    data={data}
                    selected={selected}
                    value={value}
                    editor={editor}
                    setEditor={setEditor}
                    ttl={ttl}
                    setTtl={setTtl}
                    db={db}
                    dbInput={dbInput}
                    setDbInput={setDbInput}
                    viewMode={viewMode}
                    setViewMode={setViewMode}
                    delimiter={delimiter}
                    setDelimiter={setDelimiter}
                    expandedKeys={expandedKeys}
                    toggleExpand={toggleExpand}
                    keyTree={keyTree}
                    cliInput={cliInput}
                    setCliInput={setCliInput}
                    cliResult={cliResult}
                    setCliResult={setCliResult}
                    loadKeys={loadKeys}
                    loadValue={loadValue}
                    switchDb={switchDb}
                    saveValue={saveValue}
                    delKey={delKey}
                    delFolder={delFolder}
                    runRaw={runRaw}
                    flash={flash}
                />
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
                <PubSubTab
                    psChannel={psChannel}
                    setPsChannel={setPsChannel}
                    psPattern={psPattern}
                    setPsPattern={setPsPattern}
                    psSubs={psSubs}
                    psMessages={psMessages}
                    doSubscribe={doSubscribe}
                    doPSubscribe={doPSubscribe}
                    doPublish={doPublish}
                    doUnsub={doUnsub}
                />
            )}

            {tab === 'keyspace' && (
                <KeyspaceTab
                    ksDb={ksDb}
                    setKsDb={setKsDb}
                    ksEvent={ksEvent}
                    setKsEvent={setKsEvent}
                    ksMessages={ksMessages}
                    slowLogs={slowLogs}
                    startKeyspace={startKeyspace}
                />
            )}

            {tab === 'queue' && (
                <QueueTab
                    qName={qName}
                    setQName={setQName}
                    qPayload={qPayload}
                    setQPayload={setQPayload}
                    qMode={qMode}
                    setQMode={setQMode}
                    qTimeout={qTimeout}
                    setQTimeout={setQTimeout}
                    qLen={qLen}
                    qOut={qOut}
                    enqueue={enqueue}
                    dequeue={dequeue}
                />
            )}

            {tab === 'monitor' && (
                <MonitorTab
                    monitor={monitor}
                    refreshMonitor={refreshMonitor}
                />
            )}
            <ConfirmModal state={confirmState} onCancel={() => setConfirmState(emptyConfirm)}/>
        </div>
    )
}
