import React, { useCallback, useEffect, useState } from 'react'
import { Button, Input, InputNumber, Checkbox, Tag, Tooltip, Space, Alert } from 'antd'
import { RotateCw, Plus, Trash2 } from 'lucide-react'
import { API } from '@/api'
import { errorMessage } from '@/utils'
import { MongoSessionInfo, MongoIndexInfo } from '@/types'
import CodeEditor from '@/components/CodeEditor'
import { ConfirmModal, ConfirmState } from '@/components/Modal'
import sh from '@/pages/mongo/mongoShared.module.less'

interface Props {
    session: MongoSessionInfo
    db: string
    collection: string | null
    onNotify: (msg: string, kind?: 'info' | 'error') => void
}

export default function IndexesTab({ session, db, collection, onNotify }: Props) {
    const emptyConfirm: ConfirmState = { open: false, title: '', message: '' }
    const [confirm, setConfirm] = useState<ConfirmState>(emptyConfirm)
    const [indexes, setIndexes] = useState<MongoIndexInfo[]>([])
    const [stats, setStats] = useState<string[]>([])
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')

    const [showCreate, setShowCreate] = useState(false)
    const [keys, setKeys] = useState('{"field":1}')
    const [name, setName] = useState('')
    const [unique, setUnique] = useState(false)
    const [sparse, setSparse] = useState(false)
    const [ttl, setTtl] = useState(0)
    const [createBusy, setCreateBusy] = useState(false)
    const [createMsg, setCreateMsg] = useState('')

    const id = session.id

    const load = useCallback(async () => {
        if (!db || !collection) {
            setIndexes([])
            setStats([])
            return
        }
        setBusy(true)
        setError('')
        try {
            const [idx, st] = await Promise.all([
                API.mongoIndexes(id, db, collection),
                API.mongoIndexStats(id, db, collection).catch(() => [] as string[]),
            ])
            setIndexes(idx)
            setStats(st)
        } catch (e) {
            setError(errorMessage(e))
        } finally {
            setBusy(false)
        }
    }, [id, db, collection])

    useEffect(() => {
        void load()
    }, [load])

    const drop = (idxName: string) => {
        if (idxName === '_id_') {
            onNotify('默认 _id 索引不可删除', 'error')
            return
        }
        setConfirm({
            open: true,
            title: '删除索引',
            danger: true,
            message: `确认删除索引 ${idxName}？`,
            onConfirm: async () => {
                setConfirm(emptyConfirm)
                try {
                    await API.mongoDropIndex(id, db, collection!, idxName)
                    onNotify(`已删除索引 ${idxName}`)
                    await load()
                } catch (e) {
                    onNotify(errorMessage(e), 'error')
                }
            },
        })
    }

    const create = async () => {
        setCreateBusy(true)
        setCreateMsg('')
        try {
            const r = await API.mongoCreateIndex(id, db, collection!, keys, name, unique, sparse, ttl)
            setCreateMsg(`已创建索引：${r}`)
            setShowCreate(false)
            setKeys('{"field":1}')
            setName('')
            setUnique(false)
            setSparse(false)
            setTtl(0)
            await load()
        } catch (e) {
            setCreateMsg(errorMessage(e))
        } finally {
            setCreateBusy(false)
        }
    }

    if (!collection) {
        return <div className={`${sh.mongoEmpty}`}>请选择左侧集合以管理索引</div>
    }

    return (
        <div>
            <div className={sh.mongoToolbar} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px' }}>
                <Button size="small" icon={<RotateCw size={13} />} disabled={busy} onClick={load}>
                    刷新
                </Button>
                <Button type="primary" size="small" icon={<Plus size={12} />} disabled={busy} onClick={() => { setCreateMsg(''); setShowCreate(v => !v) }}>
                    新建索引
                </Button>
                <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
                    {error && <span style={{ color: '#ef4444', fontSize: 12 }}>{error}</span>}
                    <Tag color="geekblue">{indexes.length} 个索引</Tag>
                </span>
            </div>

            {showCreate && (
                <div className={sh.mongoGrid2} style={{ marginBottom: 12, padding: 12, background: 'var(--bg-1)', borderRadius: 6 }}>
                    <label className={sh.mongoField}>
                        <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>索引键（JSON，如 {"{"}"field":1,"other":-1{"}"}）</span>
                        <CodeEditor lang="json" height="72px" value={keys} onChange={setKeys} />
                    </label>
                    <div style={{ display: 'flex', gap: 12 }}>
                        <div style={{ flex: 1 }}>
                            <span style={{ fontSize: 12, color: 'var(--text-dim)', display: 'block', marginBottom: 4 }}>名称（可选）</span>
                            <Input size="small" value={name} onChange={e => setName(e.target.value)} />
                        </div>
                        <div style={{ flex: 1 }}>
                            <span style={{ fontSize: 12, color: 'var(--text-dim)', display: 'block', marginBottom: 4 }}>TTL 过期秒（0=无）</span>
                            <InputNumber size="small" style={{ width: '100%' }} min={0} value={ttl} onChange={v => setTtl(v ?? 0)} />
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: 16 }}>
                        <Checkbox checked={unique} onChange={e => setUnique(e.target.checked)}>唯一 (UNIQUE)</Checkbox>
                        <Checkbox checked={sparse} onChange={e => setSparse(e.target.checked)}>稀疏 (SPARSE)</Checkbox>
                    </div>
                    {createMsg && (
                        <div style={{ marginTop: 8 }}>
                            <Alert type={createMsg.includes('已创建') ? 'success' : 'error'} showIcon message={createMsg} />
                        </div>
                    )}
                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                        <Button type="primary" size="small" disabled={createBusy} onClick={create}>创建</Button>
                        <Button size="small" onClick={() => setShowCreate(false)}>取消</Button>
                    </div>
                </div>
            )}

            <div className={sh.mongoGridWrap}>
                <table className={sh.mongoTable}>
                    <thead>
                        <tr>
                            <th>名称</th>
                            <th>键</th>
                            <th>唯一</th>
                            <th>稀疏</th>
                            <th>TTL</th>
                            <th style={{ width: 60, textAlign: 'center' }}>操作</th>
                        </tr>
                    </thead>
                    <tbody>
                        {indexes.map((ix) => (
                            <tr key={ix.name}>
                                <td>{ix.name}</td>
                                <td style={{ maxWidth: 360 }}>{ix.key}</td>
                                <td>{ix.unique ? <Tag color="green">是</Tag> : ''}</td>
                                <td>{ix.sparse ? <Tag color="blue">是</Tag> : ''}</td>
                                <td>{ix.expireAfterSeconds ?? ''}</td>
                                <td style={{ textAlign: 'center' }}>
                                    <Tooltip title="删除索引">
                                        <Button
                                            size="small"
                                            type="text"
                                            danger
                                            icon={<Trash2 size={12} />}
                                            onClick={() => drop(ix.name)}
                                        />
                                    </Tooltip>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {stats.length > 0 && (
                <>
                    <div className={sh.mongoH} style={{ marginTop: 16 }}>索引使用统计（$indexStats）</div>
                    <div className={sh.mongoGridWrap}>
                        <table className={sh.mongoTable}>
                            <thead><tr><th style={{ width: 40 }}>#</th><th>统计</th></tr></thead>
                            <tbody>
                                {stats.map((s, i) => (
                                    <tr key={i}><td>{i + 1}</td><td style={{ maxWidth: 520 }}>{s}</td></tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}
            <ConfirmModal state={confirm} onCancel={() => setConfirm(emptyConfirm)} />
        </div>
    )
}
