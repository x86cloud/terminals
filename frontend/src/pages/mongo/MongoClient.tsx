import React, {useCallback, useEffect, useMemo, useState} from 'react'
import { Database, RotateCw, Plus, Table, BarChart2, Edit, X } from 'lucide-react'
import {API} from '@/api'
import {errorMessage} from '@/utils'
import {MongoSessionInfo, MongoDatabaseInfo, MongoCollectionInfo, MongoCollectionStats} from '@/types'
import g from '@/styles/global.module.less'
import m from '@/pages/mongo/MongoClient.module.less'
import sh from '@/pages/mongo/mongoShared.module.less'
import {MongoTabKey} from '@/pages/mongo/mongoTypes'
import {ConfirmModal, ConfirmState, PromptModal, PromptState} from '@/components/Modal'
import DocumentsTab from '@/pages/mongo/DocumentsTab'
import AggregateTab from '@/pages/mongo/AggregateTab'
import IndexesTab from '@/pages/mongo/IndexesTab'
import SchemaTab from '@/pages/mongo/SchemaTab'
import MonitorTab from '@/pages/mongo/MonitorTab'
import ChangeStreamTab from '@/pages/mongo/ChangeStreamTab'

interface Props {
    session: MongoSessionInfo
    onClose: () => void
    onChange: (id: string, database: string) => void
}

export default function MongoClient({session, onClose, onChange}: Props) {
    const [databases, setDatabases] = useState<MongoDatabaseInfo[]>([])
    const [db, setDb] = useState<string>(session.database || '')
    const [collections, setCollections] = useState<MongoCollectionInfo[]>([])
    const [selected, setSelected] = useState<string | null>(null)
    const [tab, setTab] = useState<MongoTabKey>('documents')
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')

    const emptyConfirm: ConfirmState = {open: false, title: '', message: ''}
    const emptyPrompt: PromptState = {open: false, title: '', value: ''}
    const [confirm, setConfirm] = useState<ConfirmState>(emptyConfirm)
    const [prompt, setPrompt] = useState<PromptState>(emptyPrompt)

    // 集合统计弹窗
    const [stats, setStats] = useState<MongoCollectionStats | null>(null)
    const [statsName, setStatsName] = useState('')
    const [statsBusy, setStatsBusy] = useState(false)

    const id = session.id

    const loadDatabases = useCallback(async () => {
        setBusy(true)
        setError('')
        try {
            const dbs = await API.mongoDatabases(id)
            setDatabases(dbs)
            const cur = session.database || dbs[0]?.name || ''
            if (cur) {
                setDb(cur)
                onChange(id, cur)
            }
        } catch (e) {
            setError(errorMessage(e))
        } finally {
            setBusy(false)
        }
    }, [id, session.database, onChange])

    const loadCollections = useCallback(async (database: string) => {
        if (!database) {
            setCollections([])
            return
        }
        setBusy(true)
        setError('')
        try {
            setCollections(await API.mongoCollections(id, database))
        } catch (e) {
            setError(errorMessage(e))
        } finally {
            setBusy(false)
        }
    }, [id])

    useEffect(() => {
        void loadDatabases()
    }, [loadDatabases])

    useEffect(() => {
        if (db) {
            void loadCollections(db)
            setSelected(null)
        }
    }, [db, loadCollections])

    const switchDb = (value: string) => {
        setDb(value)
        setSelected(null)
        setCollections([])
        onChange(id, value)
    }

    const createDb = () => {
        setPrompt({
            open: true,
            title: '新建数据库',
            label: '新数据库名称（将自动创建默认集合）',
            value: '',
            onConfirm: async (name) => {
                setPrompt(emptyPrompt)
                try {
                    await API.mongoCreateDatabase(id, name, 'default')
                    await loadDatabases()
                } catch (e) {
                    setError(errorMessage(e))
                }
            },
        })
    }

    const dropDb = (name: string) => {
        setConfirm({
            open: true,
            title: '删除数据库',
            danger: true,
            message: `确认删除数据库 ${name}？该操作不可恢复！`,
            onConfirm: async () => {
                setConfirm(emptyConfirm)
                try {
                    await API.mongoDropDatabase(id, name)
                    await loadDatabases()
                } catch (e) {
                    setError(errorMessage(e))
                }
            },
        })
    }

    const createColl = () => {
        setPrompt({
            open: true,
            title: '新建集合',
            label: '新集合名称',
            value: '',
            onConfirm: async (name) => {
                setPrompt(emptyPrompt)
                try {
                    await API.mongoCreateCollection(id, db, name)
                    await loadCollections(db)
                } catch (e) {
                    setError(errorMessage(e))
                }
            },
        })
    }

    const dropColl = (name: string) => {
        setConfirm({
            open: true,
            title: '删除集合',
            danger: true,
            message: `确认删除集合 ${name}？`,
            onConfirm: async () => {
                setConfirm(emptyConfirm)
                try {
                    await API.mongoDropCollection(id, db, name)
                    await loadCollections(db)
                    if (selected === name) setSelected(null)
                } catch (e) {
                    setError(errorMessage(e))
                }
            },
        })
    }

    const renameColl = (name: string) => {
        setPrompt({
            open: true,
            title: '重命名集合',
            label: '新集合名称',
            value: name,
            onConfirm: async (nn) => {
                setPrompt(emptyPrompt)
                if (nn === name) return
                try {
                    await API.mongoRenameCollection(id, db, name, nn)
                    await loadCollections(db)
                } catch (e) {
                    setError(errorMessage(e))
                }
            },
        })
    }

    const viewStats = async (name: string) => {
        setStatsBusy(true)
        setStatsName(name)
        try {
            setStats(await API.mongoCollectionStats(id, db, name))
        } catch (e) {
            setError(errorMessage(e))
            setStats(null)
        } finally {
            setStatsBusy(false)
        }
    }

    const tabs: { key: MongoTabKey; label: string }[] = [
        {key: 'documents', label: '文档 / CRUD'},
        {key: 'aggregate', label: '聚合管道'},
        {key: 'indexes', label: '索引'},
        {key: 'schema', label: '模型 / Schema'},
        {key: 'monitor', label: '性能监控'},
        {key: 'stream', label: '变更流'},
    ]

    const notify = (msg: string, kind?: 'info' | 'error') => {
        if (typeof (window as any).__toast === 'function') (window as any).__toast(msg, kind)
        else console.log(msg)
    }

    return (
        <div className={m.mongoPane}>
            <div className={m.mongoSide}>
                <div className={m.mongoDbHead}>
                    <Database size={13}/>
                    <select className={m.mongoDbSelect} value={db} disabled={databases.length === 0}
                            onChange={(e) => switchDb(e.target.value)}>
                        {databases.length === 0 && <option value="">（无数据库）</option>}
                        {databases.map((d) => (
                            <option key={d.name} value={d.name}>{d.name}</option>
                        ))}
                    </select>
                    <button className={g.iconBtn} title="刷新" disabled={busy} onClick={() => void loadDatabases()}>
                        <RotateCw size={13}/>
                    </button>
                </div>
                <div className={m.mongoDbActions}>
                    <button className={`${g.btn} ${g.xs}`} onClick={createDb}><Plus size={12}/> 建库</button>
                    <button className={`${g.btn} ${g.xs}`} disabled={!db} onClick={createColl}><Table size={12}/> 建集合</button>
                </div>
                <div className={m.mongoTree}>
                    {databases.length === 0 && !busy && (
                        <div className={`${sh.mongoEmpty} ${sh.small}`}>暂无数据库</div>
                    )}
                    {db ? (
                        <>
                            {collections.length === 0 && !busy && (
                                <div className={`${sh.mongoEmpty} ${sh.small}`}>暂无集合</div>
                            )}
                            {collections.map((c) => (
                                <div key={c.name} className={`${m.mongoCollRow}${selected === c.name ? ' ' + m.active : ''}`}>
                                    <button className={m.mongoCollRow} style={{flex: 1}} onClick={() => setSelected(c.name)}>
                                        <Table size={12}/>
                                        <span>{c.name}</span>
                                        {c.hasValidator && <span className={sh.mongoBadge} style={{marginLeft: 4}}>校验</span>}
                                    </button>
                                    <div className={m.mongoCollMenu}>
                                        <button className={g.iconBtn} title="统计" onClick={() => void viewStats(c.name)}>
                                            <BarChart2 size={12}/>
                                        </button>
                                        <button className={g.iconBtn} title="重命名" onClick={() => void renameColl(c.name)}>
                                            <Edit size={12}/>
                                        </button>
                                        <button className={g.iconBtn} title="删除" onClick={() => void dropColl(c.name)}>
                                            <X size={12}/>
                                        </button>
                                    </div>
                                </div>
                            ))}
                            {busy && (
                                <div className={`${sh.mongoEmpty} ${sh.small}`}>加载中…</div>
                            )}
                        </>
                    ) : (
                        !busy && <div className={`${sh.mongoEmpty} ${sh.small}`}>请先选择数据库</div>
                    )}
                </div>
            </div>

            <div className={m.mongoMain}>
                <div className={m.mongoToolbar}>
                    <span className={m.mongoConnTitle}>MongoDB · {session.host}:{session.port}</span>
                    <span className={g.spacer}/>
                    {error && <span className={m.mongoError}>{error}</span>}
                    {db && <span className={sh.mongoBadge}>{db}{selected ? ' · ' + selected : ''}</span>}
                    <button className={g.iconBtn} title="关闭" onClick={onClose}>
                        <X size={15}/>
                    </button>
                </div>

                <div className={m.mongoTabs}>
                    {tabs.map((t) => (
                        <button key={t.key} className={`${m.mongoTab}${tab === t.key ? ' ' + m.active : ''}`}
                                onClick={() => setTab(t.key)}>
                            {t.label}
                        </button>
                    ))}
                </div>

                <div className={m.mongoContent}>
                    {tab === 'documents' && (
                        <DocumentsTab session={session} db={db} collection={selected} onNotify={notify}/>
                    )}
                    {tab === 'aggregate' && (
                        <AggregateTab session={session} db={db} collection={selected}/>
                    )}
                    {tab === 'indexes' && (
                        <IndexesTab session={session} db={db} collection={selected} onNotify={notify}/>
                    )}
                    {tab === 'schema' && (
                        <SchemaTab session={session} db={db} collection={selected} onNotify={notify}/>
                    )}
                    {tab === 'monitor' && (
                        <MonitorTab session={session} onNotify={notify}/>
                    )}
                    {tab === 'stream' && (
                        <ChangeStreamTab session={session} db={db} collection={selected} onNotify={notify}/>
                    )}
                </div>
            </div>

            {stats && (
                <div className={sh.mongoField} style={{position: 'absolute', right: 20, bottom: 20, width: 300, background: '#ffffff', border: '1px solid #d4dbe6', padding: 12, borderRadius: 8, boxShadow: '0 12px 32px rgba(0,0,0,0.25)'}}>
                    <div className={sh.mongoRow} style={{justifyContent: 'space-between'}}>
                        <strong>{statsName} 统计</strong>
                        <button className={g.iconBtn} onClick={() => setStats(null)}><X size={14}/></button>
                    </div>
                    {statsBusy ? <div className={sh.mongoEmpty}>加载中…</div> : (
                        <table className={sh.mongoKV}>
                            <tbody>
                            <tr><th>文档数</th><td>{String(stats.count)}</td></tr>
                            <tr><th>数据大小</th><td>{String(stats.size)}</td></tr>
                            <tr><th>平均对象大小</th><td>{String(stats.avgObjSize)}</td></tr>
                            <tr><th>存储大小</th><td>{String(stats.storageSize)}</td></tr>
                            <tr><th>索引总大小</th><td>{String(stats.totalIndexSize)}</td></tr>
                            <tr><th>索引数</th><td>{String(stats.nindexes)}</td></tr>
                            </tbody>
                        </table>
                    )}
                </div>
            )}
            <ConfirmModal state={confirm} onCancel={() => setConfirm(emptyConfirm)}/>
            <PromptModal state={prompt} onCancel={() => setPrompt(emptyPrompt)}/>
        </div>
    )
}
