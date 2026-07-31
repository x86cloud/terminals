import React, {useCallback, useEffect, useRef, useState} from 'react'
import {API} from '../api'
import type {RedisKeysResult, RedisSessionInfo, RedisValue, RedisValueType} from '../types'
import Icon from './Icon'

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
                .map((p: any) => `${p[0]}\n${p[1]}`)
                .join('\n')
        default:
            return String(v.value ?? '')
    }
}

export function RedisClient({session, onClose, onDbChange}: Props) {
    const [pattern, setPattern] = useState('*')
    const [data, setData] = useState<RedisKeysResult>({cursor: '0', keys: []})
    const [selected, setSelected] = useState<string>('')
    const [value, setValue] = useState<RedisValue | null>(null)
    const [editor, setEditor] = useState('')
    const [ttl, setTtl] = useState(0)
    const [cmd, setCmd] = useState('')
    const [cmdResult, setCmdResult] = useState('')
    const [busy, setBusy] = useState(false)
    const [msg, setMsg] = useState('')
    const [db, setDb] = useState(session.db)
    const [dbInput, setDbInput] = useState(String(session.db))
    const cursorRef = useRef('0')

    const loadKeys = useCallback(
        async (reset = true) => {
            const cur = reset ? '0' : cursorRef.current
            try {
                const res = await API.redisKeys(session.id, pattern, cur)
                cursorRef.current = res.cursor
                setData((d) => ({
                    cursor: res.cursor,
                    keys: reset ? res.keys : [...d.keys, ...res.keys],
                }))
            } catch (e: any) {
                setMsg('加载键失败: ' + (e?.message || e))
            }
        },
        [session.id, pattern]
    )

    const loadValue = useCallback(async (key: string) => {
        if (!key) return
        setSelected(key)
        setBusy(true)
        setMsg('')
        try {
            const v = await API.redisGet(session.id, key)
            setValue(v)
            setEditor(formatValue(v))
            setTtl(v.ttl)
        } catch (e: any) {
            setMsg('读取失败: ' + (e?.message || e))
            setValue(null)
        } finally {
            setBusy(false)
        }
    }, [session.id])

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
        setBusy(true)
        setMsg('')
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
            setMsg('切换数据库失败: ' + (e?.message || e))
        } finally {
            setBusy(false)
        }
    }

    const saveValue = async () => {
        if (!selected || !value) return
        setBusy(true)
        setMsg('')
        try {
            await API.redisSet(session.id, selected, value.type, editor, ttl)
            setMsg('已保存')
            await loadValue(selected)
            loadKeys(true)
        } catch (e: any) {
            setMsg('保存失败: ' + (e?.message || e))
        } finally {
            setBusy(false)
        }
    }

    const delKey = async () => {
        if (!selected) return
        if (!confirm(`确认删除键 ${selected} ?`)) return
        setBusy(true)
        try {
            await API.redisDelete(session.id, selected)
            setSelected('')
            setValue(null)
            loadKeys(true)
        } catch (e: any) {
            setMsg('删除失败: ' + (e?.message || e))
        } finally {
            setBusy(false)
        }
    }

    const runCmd = async () => {
        if (!cmd.trim()) return
        setBusy(true)
        try {
            const r = await API.redisRaw(session.id, cmd)
            setCmdResult(r.result ?? '')
        } catch (e: any) {
            setCmdResult('ERROR: ' + (e?.message || e))
        } finally {
            setBusy(false)
        }
    }

    return (
        <div className="redis-pane">
            <div className="redis-side">
                <div className="redis-side-head">
                    <input
                        className="redis-search"
                        placeholder="搜索 pattern"
                        value={pattern}
                        onChange={(e) => setPattern(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && loadKeys(true)}
                    />
                    <button className="btn sm" onClick={() => loadKeys(true)}>刷新</button>
                    <button className="btn sm" onClick={() => loadKeys(false)} disabled={data.cursor === '0'}>
                        更多
                    </button>
                </div>
                <div className="redis-db-bar">
                    <span className="redis-db-label">DB</span>
                    <input
                        className="redis-db-input"
                        type="number"
                        min={0}
                        value={dbInput}
                        onChange={(e) => setDbInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && switchDb()}
                    />
                    <button
                        className="btn sm"
                        onClick={switchDb}
                        disabled={busy || Number(dbInput) === db}
                    >
                        切换
                    </button>
                    <span className="redis-db-count">{data.keys.length} 键 / 共 {session.dbSize}</span>
                </div>
                <div className="redis-keys">
                    {data.keys.length === 0 && <div className="redis-empty">无键</div>}
                    {data.keys.map((k) => (
                        <div
                            key={k}
                            className={`redis-key ${k === selected ? 'active' : ''}`}
                            onClick={() => loadValue(k)}
                            title={k}
                        >
                            {k}
                        </div>
                    ))}
                </div>
            </div>

            <div className="redis-main">
                {msg && <div className="redis-msg">{msg}</div>}
                {selected && value ? (
                    <>
                        <div className="redis-value-head">
                            <span className="redis-key-name" title={selected}>{selected}</span>
                            <span className="redis-type-badge">{TYPE_LABEL[value.type]}</span>
                            <span className="redis-ttl">TTL: {ttl}</span>
                        </div>
                        <textarea
                            className="redis-editor"
                            value={editor}
                            onChange={(e) => setEditor(e.target.value)}
                            spellCheck={false}
                        />
                        <div className="redis-value-actions">
                            <label className="redis-ttl-input">
                                TTL(秒)
                                <input
                                    type="number"
                                    value={ttl}
                                    onChange={(e) => setTtl(Number(e.target.value) || 0)}
                                />
                            </label>
                            <button className="btn primary sm" onClick={saveValue} disabled={busy}>保存</button>
                            <button className="btn danger sm" onClick={delKey} disabled={busy}>删除</button>
                        </div>
                    </>
                ) : (
                    <div className="redis-empty">从左侧选择一个键查看 / 编辑</div>
                )}

                <div className="redis-cli">
                    <div className="redis-cli-head">命令行</div>
                    <div className="redis-cli-row">
                        <input
                            value={cmd}
                            placeholder="例如 GET foo / HGETALL myhash"
                            onChange={(e) => setCmd(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && runCmd()}
                        />
                        <button className="btn sm" onClick={runCmd} disabled={busy}>执行</button>
                    </div>
                    <pre className="redis-cli-result">{cmdResult}</pre>
                </div>
            </div>
        </div>
    )
}

export default RedisClient
