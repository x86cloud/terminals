import { useCallback, useEffect, useState } from 'react'
import { Button, Input, InputNumber, Checkbox, Tag, Tooltip, Alert, App } from 'antd'
import { RotateCw, Plus, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
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
}

export default function IndexesTab({ session, db, collection }: Props) {
    const { t } = useTranslation(['db', 'common'])
    const { message } = App.useApp()
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
            message.error(t('mongo.indexes.unremovableDefault', '默认 _id 索引不可删除'))
            return
        }
        setConfirm({
            open: true,
            title: t('mongo.indexes.dropTitle', '删除索引'),
            danger: true,
            message: t('mongo.indexes.dropConfirm', { name: idxName, defaultValue: `确认删除索引 ${idxName}？` }),
            onConfirm: async () => {
                setConfirm(emptyConfirm)
                try {
                    await API.mongoDropIndex(id, db, collection!, idxName)
                    message.success(t('mongo.indexes.dropSuccess', { name: idxName, defaultValue: `已删除索引 ${idxName}` }))
                    await load()
                } catch (e) {
                    message.error(errorMessage(e))
                }
            },
        })
    }

    const create = async () => {
        setCreateBusy(true)
        setCreateMsg('')
        try {
            const r = await API.mongoCreateIndex(id, db, collection!, keys, name, unique, sparse, ttl)
            setCreateMsg(t('mongo.indexes.createSuccess', { result: r, defaultValue: `已创建索引：${r}` }))
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
        return <div className={`${sh.mongoEmpty}`}>{t('mongo.indexes.selectCollHint', '请选择左侧集合以管理索引')}</div>
    }

    return (
        <div>
            <div className={sh.mongoToolbar} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px' }}>
                <Button size="small" icon={<RotateCw size={13} />} disabled={busy} onClick={load}>
                    {t('mongo.indexes.refresh', '刷新')}
                </Button>
                <Button type="primary" size="small" icon={<Plus size={12} />} disabled={busy} onClick={() => { setCreateMsg(''); setShowCreate(v => !v) }}>
                    {t('mongo.indexes.newIndex', '新建索引')}
                </Button>
                <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
                    {error && <span style={{ color: '#ef4444', fontSize: 12 }}>{error}</span>}
                    <Tag color="geekblue">{t('mongo.indexes.indexesCount', { count: indexes.length, defaultValue: `${indexes.length} 个索引` })}</Tag>
                </span>
            </div>

            {showCreate && (
                <div className={sh.mongoGrid2} style={{ marginBottom: 12, padding: 12, background: 'var(--bg-1)', borderRadius: 6 }}>
                    <label className={sh.mongoField}>
                        <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{t('mongo.indexes.keysLabel', '索引键（JSON，如 {"field":1,"other":-1}）')}</span>
                        <CodeEditor lang="json" height="72px" value={keys} onChange={setKeys} />
                    </label>
                    <div style={{ display: 'flex', gap: 12 }}>
                        <div style={{ flex: 1 }}>
                            <span style={{ fontSize: 12, color: 'var(--text-dim)', display: 'block', marginBottom: 4 }}>{t('mongo.indexes.nameOptional', '名称（可选）')}</span>
                            <Input size="small" value={name} onChange={e => setName(e.target.value)} />
                        </div>
                        <div style={{ flex: 1 }}>
                            <span style={{ fontSize: 12, color: 'var(--text-dim)', display: 'block', marginBottom: 4 }}>{t('mongo.indexes.ttlLabel', 'TTL 过期秒（0=无）')}</span>
                            <InputNumber size="small" style={{ width: '100%' }} min={0} value={ttl} onChange={v => setTtl(v ?? 0)} />
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: 16 }}>
                        <Checkbox checked={unique} onChange={e => setUnique(e.target.checked)}>{t('mongo.indexes.unique', '唯一 (UNIQUE)')}</Checkbox>
                        <Checkbox checked={sparse} onChange={e => setSparse(e.target.checked)}>{t('mongo.indexes.sparse', '稀疏 (SPARSE)')}</Checkbox>
                    </div>
                    {createMsg && (
                        <div style={{ marginTop: 8 }}>
                            <Alert type={createMsg.includes('已创建') || createMsg.toLowerCase().includes('created') ? 'success' : 'error'} showIcon message={createMsg} />
                        </div>
                    )}
                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                        <Button type="primary" size="small" disabled={createBusy} onClick={create}>{t('mongo.indexes.create', '创建')}</Button>
                        <Button size="small" onClick={() => setShowCreate(false)}>{t('common:cancel', '取消')}</Button>
                    </div>
                </div>
            )}

            <div className={sh.mongoGridWrap}>
                <table className={sh.mongoTable}>
                    <thead>
                        <tr>
                            <th>{t('mongo.indexes.colName', '名称')}</th>
                            <th>{t('mongo.indexes.colKey', '键')}</th>
                            <th>{t('mongo.indexes.colUnique', '唯一')}</th>
                            <th>{t('mongo.indexes.colSparse', '稀疏')}</th>
                            <th>{t('mongo.indexes.colTtl', 'TTL')}</th>
                            <th style={{ width: 60, textAlign: 'center' }}>{t('mongo.indexes.colAction', '操作')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {indexes.map((ix) => (
                            <tr key={ix.name}>
                                <td>{ix.name}</td>
                                <td style={{ maxWidth: 360 }}>{ix.key}</td>
                                <td>{ix.unique ? <Tag color="green">{t('mongo.indexes.yes', '是')}</Tag> : ''}</td>
                                <td>{ix.sparse ? <Tag color="blue">{t('mongo.indexes.yes', '是')}</Tag> : ''}</td>
                                <td>{ix.expireAfterSeconds ?? ''}</td>
                                <td style={{ textAlign: 'center' }}>
                                    <Tooltip title={t('mongo.indexes.dropTooltip', '删除索引')}>
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
                    <div className={sh.mongoH} style={{ marginTop: 16 }}>{t('mongo.indexes.statsTitle', '索引使用统计（$indexStats）')}</div>
                    <div className={sh.mongoGridWrap}>
                        <table className={sh.mongoTable}>
                            <thead><tr><th style={{ width: 40 }}>#</th><th>{t('mongo.indexes.colStats', '统计')}</th></tr></thead>
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
