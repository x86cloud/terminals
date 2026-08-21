import React, {useCallback, useEffect, useMemo, useState} from 'react'
import { Select, Button, Space, Tooltip, Segmented, Tag, Modal } from 'antd'
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
                <div className={m.mongoDbHead} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <Select
                        size="small"
                        showSearch
                        placeholder="选择数据库"
                        style={{ flex: 1, minWidth: 0 }}
                        value={db || undefined}
                        disabled={databases.length === 0}
                        onChange={(val) => switchDb(val)}
                        options={databases.map((d) => ({ label: d.name, value: d.name }))}
                        popupMatchSelectWidth={false}
                    />
                    <Button
                        size="small"
                        type="text"
                        icon={<RotateCw size={13} />}
                        title="刷新数据库列表"
                        disabled={busy}
                        onClick={() => void loadDatabases()}
                    />
                </div>
                <div className={m.mongoDbActions} style={{ display: 'flex', gap: 6, padding: '4px 0' }}>
                    <Button
                        size="small"
                        icon={<Plus size={12} />}
                        style={{ flex: 1 }}
                        onClick={createDb}
                    >
                        建库
                    </Button>
                    <Button
                        size="small"
                        icon={<Table size={12} />}
                        style={{ flex: 1 }}
                        disabled={!db}
                        onClick={createColl}
                    >
                        建集合
                    </Button>
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
                                    <div
                                        className={m.mongoCollRow}
                                        style={{ flex: 1, cursor: 'pointer' }}
                                        onClick={() => setSelected(c.name)}
                                    >
                                        <Table size={12} />
                                        <span>{c.name}</span>
                                        {c.hasValidator && <Tag color="blue" style={{ marginLeft: 4 }}>校验</Tag>}
                                    </div>
                                    <div className={m.mongoCollMenu}>
                                        <Tooltip title="统计">
                                            <Button
                                                size="small"
                                                type="text"
                                                icon={<BarChart2 size={12} />}
                                                onClick={() => void viewStats(c.name)}
                                            />
                                        </Tooltip>
                                        <Tooltip title="重命名">
                                            <Button
                                                size="small"
                                                type="text"
                                                icon={<Edit size={12} />}
                                                onClick={() => void renameColl(c.name)}
                                            />
                                        </Tooltip>
                                        <Tooltip title="删除集合">
                                            <Button
                                                size="small"
                                                type="text"
                                                danger
                                                icon={<X size={12} />}
                                                onClick={() => void dropColl(c.name)}
                                            />
                                        </Tooltip>
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
                <div className={m.mongoToolbar} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px' }}>
                    <span className={m.mongoConnTitle} style={{ fontWeight: 600 }}>MongoDB · {session.host}:{session.port}</span>
                    <span className={g.spacer} />
                    {error && <span className={m.mongoError}>{error}</span>}
                    {db && <Tag color="processing">{db}{selected ? ' · ' + selected : ''}</Tag>}
                    <Tooltip title="关闭">
                        <Button size="small" type="text" icon={<X size={15} />} onClick={onClose} />
                    </Tooltip>
                </div>

                <div className={m.mongoTabs} style={{ padding: '4px 12px', borderBottom: '1px solid var(--border)' }}>
                    <Segmented
                        size="small"
                        value={tab}
                        onChange={(v) => setTab(v as MongoTabKey)}
                        options={tabs.map((t) => ({ label: t.label, value: t.key }))}
                    />
                </div>

                <div className={m.mongoContent}>
                    {tab === 'documents' && (
                        <DocumentsTab session={session} db={db} collection={selected} onNotify={notify} />
                    )}
                    {tab === 'aggregate' && (
                        <AggregateTab session={session} db={db} collection={selected} />
                    )}
                    {tab === 'indexes' && (
                        <IndexesTab session={session} db={db} collection={selected} onNotify={notify} />
                    )}
                    {tab === 'schema' && (
                        <SchemaTab session={session} db={db} collection={selected} onNotify={notify} />
                    )}
                    {tab === 'monitor' && (
                        <MonitorTab session={session} onNotify={notify} />
                    )}
                    {tab === 'stream' && (
                        <ChangeStreamTab session={session} db={db} collection={selected} onNotify={notify} />
                    )}
                </div>
            </div>

            {stats && (
                <Modal
                    open={true}
                    title={`${statsName} 集合统计`}
                    onCancel={() => setStats(null)}
                    footer={[
                        <Button key="close" type="primary" onClick={() => setStats(null)}>
                            确定
                        </Button>,
                    ]}
                    width={400}
                >
                    {statsBusy ? <div className={sh.mongoEmpty}>加载中…</div> : (
                        <table className={sh.mongoKV} style={{ width: '100%', marginTop: 8 }}>
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
                </Modal>
            )}
            <ConfirmModal state={confirm} onCancel={() => setConfirm(emptyConfirm)}/>
            <PromptModal state={prompt} onCancel={() => setPrompt(emptyPrompt)}/>
        </div>
    )
}
