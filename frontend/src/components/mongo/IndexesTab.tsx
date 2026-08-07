import React, {useCallback, useEffect, useState} from 'react'
import Icon from '../Icon'
import {API} from '../../api'
import {errorMessage} from '../../utils'
import {MongoSessionInfo, MongoIndexInfo} from '../../types'
import CodeEditor from '../CodeEditor'
import {ConfirmModal, ConfirmState} from '../Modal'
import sh from './mongoShared.module.less'
import g from '../../styles/global.module.less'

interface Props {
    session: MongoSessionInfo
    db: string
    collection: string | null
    onNotify: (msg: string, kind?: 'info' | 'error') => void
}

function formatJSON(text: string): string {
    if (!text) return ''
    try {
        return JSON.stringify(JSON.parse(text), null, 2)
    } catch {
        return text
    }
}

export default function IndexesTab({session, db, collection, onNotify}: Props) {
    const emptyConfirm: ConfirmState = {open: false, title: '', message: ''}
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
            <div className={sh.mongoToolbar}>
                <button className={`${g.btn} ${g.primary}`} disabled={busy} onClick={load}>
                    <Icon name="refresh" size={13}/> 刷新
                </button>
                <button className={g.btn} disabled={busy} onClick={() => { setCreateMsg(''); setShowCreate(v => !v) }}>
                    <Icon name="plus" size={12}/> 新建索引
                </button>
                <span className={g.spacer}/>
                {error && <span className={g.formError}>{error}</span>}
                <span className={sh.mongoBadge}>{indexes.length} 个索引</span>
            </div>

            {showCreate && (
                <div className={sh.mongoGrid2} style={{marginBottom: 12, border: '1px solid ' + g.border, padding: 10, borderRadius: 6}}>
                    <label className={sh.mongoField}>
                        <span>索引键（JSON，如 {"{"}"field":1,"other":-1{"}"}）</span>
                        <CodeEditor lang="json" height="72px" value={keys} onChange={setKeys}/>
                    </label>
                    <div className={sh.mongoRow}>
                        <label className={sh.mongoField} style={{flex: 1}}>
                            <span>名称（可选）</span>
                            <input className={sh.mongoInput} value={name} onChange={e => setName(e.target.value)}/>
                        </label>
                        <label className={sh.mongoField} style={{flex: 1}}>
                            <span>TTL 过期秒（0=无）</span>
                            <input className={sh.mongoInput} type="number" value={ttl} onChange={e => setTtl(Number(e.target.value) || 0)}/>
                        </label>
                    </div>
                    <div className={sh.mongoRow}>
                        <label className={sh.mongoRow} style={{gap: 4, fontSize: 12}}>
                            <input type="checkbox" checked={unique} onChange={e => setUnique(e.target.checked)}/> 唯一
                        </label>
                        <label className={sh.mongoRow} style={{gap: 4, fontSize: 12}}>
                            <input type="checkbox" checked={sparse} onChange={e => setSparse(e.target.checked)}/> 稀疏
                        </label>
                    </div>
                    {createMsg && <span className={createMsg.includes('已创建') ? sh.mongoBadge : g.formError} style={{gridColumn: '1 / -1'}}>{createMsg}</span>}
                    <div className={sh.mongoRow}>
                        <button className={`${g.btn} ${g.primary}`} disabled={createBusy} onClick={create}>创建</button>
                        <button className={g.btn} onClick={() => setShowCreate(false)}>取消</button>
                    </div>
                </div>
            )}

            <div className={sh.mongoGridWrap}>
                <table className={sh.mongoTable}>
                    <thead>
                    <tr><th>名称</th><th>键</th><th>唯一</th><th>稀疏</th><th>TTL</th><th style={{width: 80}}>操作</th></tr>
                    </thead>
                    <tbody>
                    {indexes.map((ix) => (
                        <tr key={ix.name}>
                            <td>{ix.name}</td>
                            <td style={{maxWidth: 360}}>{ix.key}</td>
                            <td>{ix.unique ? '✓' : ''}</td>
                            <td>{ix.sparse ? '✓' : ''}</td>
                            <td>{ix.expireAfterSeconds ?? ''}</td>
                            <td>
                                <button className={sh.mongoInlineBtn} title="删除" onClick={() => drop(ix.name)}>
                                    <Icon name="trash" size={12}/>
                                </button>
                            </td>
                        </tr>
                    ))}
                    </tbody>
                </table>
            </div>

            {stats.length > 0 && (
                <>
                    <div className={sh.mongoH}>索引使用统计（$indexStats）</div>
                    <div className={sh.mongoGridWrap}>
                        <table className={sh.mongoTable}>
                            <thead><tr><th style={{width: 40}}>#</th><th>统计</th></tr></thead>
                            <tbody>
                            {stats.map((s, i) => (
                                <tr key={i}><td>{i + 1}</td><td style={{maxWidth: 520}}>{s}</td></tr>
                            ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}
            <ConfirmModal state={confirm} onCancel={() => setConfirm(emptyConfirm)}/>
        </div>
    )
}
