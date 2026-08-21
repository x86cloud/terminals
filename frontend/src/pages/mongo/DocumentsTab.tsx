import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Button, InputNumber, Space, Tooltip, Pagination, Tag, Modal, Alert } from 'antd'
import { Search, Plus, ChevronDown, ChevronRight, Edit, Copy, Trash2 } from 'lucide-react'
import { API } from '@/api'
import { errorMessage } from '@/utils'
import { MongoSessionInfo, MongoQuerySpec, MongoFindResult } from '@/types'
import CodeEditor from '@/components/CodeEditor'
import { ConfirmModal, ConfirmState } from '@/components/Modal'
import sh from '@/pages/mongo/mongoShared.module.less'

interface Props {
    session: MongoSessionInfo
    db: string
    collection: string | null
    onNotify: (msg: string, kind?: 'info' | 'error') => void
}

const DEFAULT_LIMIT = 50

export default function DocumentsTab({ session, db, collection, onNotify }: Props) {
    const emptyConfirm: ConfirmState = { open: false, title: '', message: '' }
    const [confirm, setConfirm] = useState<ConfirmState>(emptyConfirm)
    const [docs, setDocs] = useState<string[]>([])
    const [total, setTotal] = useState(0)
    const [count, setCount] = useState(0)
    const [duration, setDuration] = useState(0)
    const [page, setPage] = useState(1)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')
    const [selected, setSelected] = useState<number | null>(null)

    // 查询构建器
    const [showBuilder, setShowBuilder] = useState(false)
    const [filter, setFilter] = useState('{}')
    const [projection, setProjection] = useState('')
    const [sort, setSort] = useState('{}')
    const [limit, setLimit] = useState(DEFAULT_LIMIT)
    const [skip, setSkip] = useState(0)

    // 增改弹窗
    const [editOpen, setEditOpen] = useState<{ mode: 'insert' | 'update' | 'replace'; raw?: string } | null>(null)
    const [editorText, setEditorText] = useState('')
    const [editorBusy, setEditorBusy] = useState(false)
    const [editorError, setEditorError] = useState('')

    const runQuery = useCallback(async (targetPage = 1) => {
        if (!collection || !db) return
        setBusy(true)
        setError('')
        try {
            const spec: MongoQuerySpec = {
                database: db,
                collection,
                filter: filter.trim() || '{}',
                projection: projection.trim() || '',
                sort: sort.trim() || '',
                limit,
                skip: (targetPage - 1) * limit + (skip || 0),
                hint: '',
                collation: '',
            }
            const res: MongoFindResult = await API.mongoFind(session.id, spec)
            setDocs(res.documents || [])
            setTotal(res.total ?? 0)
            setCount(res.count ?? (res.documents?.length ?? 0))
            setDuration(res.durationMs ?? 0)
            setPage(targetPage)
        } catch (e) {
            setError(errorMessage(e))
        } finally {
            setBusy(false)
        }
    }, [collection, db, filter, limit, projection, session.id, skip, sort])

    useEffect(() => {
        if (collection && db) {
            void runQuery(1)
        } else {
            setDocs([])
            setTotal(0)
        }
    }, [collection, db])

    const deleteDoc = (raw: string) => {
        let idStr = ''
        try {
            const obj = JSON.parse(raw)
            if (obj._id !== undefined) idStr = JSON.stringify(obj._id)
        } catch {
            /* ignore */
        }
        setConfirm({
            open: true,
            title: '删除文档',
            message: idStr ? `确定要删除 _id 为 ${idStr} 的文档吗？` : '确定要删除选中的文档吗？',
            danger: true,
            onConfirm: async () => {
                try {
                    const filterSpec = idStr ? `{"_id":${idStr}}` : raw
                    const deletedCount = await API.mongoDeleteOne(session.id, db, collection!, filterSpec)
                    onNotify(`已删除 ${deletedCount} 条文档`)
                    void runQuery(page)
                } catch (e) {
                    onNotify(errorMessage(e), 'error')
                }
            },
        })
    }

    const insertDoc = async () => {
        setEditorBusy(true)
        setEditorError('')
        try {
            await API.mongoInsertOne(session.id, db, collection!, editorText)
            onNotify('文档插入成功')
            setEditOpen(null)
            void runQuery(1)
        } catch (e) {
            setEditorError(errorMessage(e))
        } finally {
            setEditorBusy(false)
        }
    }

    const updateDoc = async () => {
        setEditorBusy(true)
        setEditorError('')
        try {
            let filterSpec = '{}'
            if (editOpen?.raw) {
                try {
                    const obj = JSON.parse(editOpen.raw)
                    if (obj._id !== undefined) filterSpec = JSON.stringify({ _id: obj._id })
                } catch {
                    /* fallback */
                }
            }
            const res = await API.mongoUpdateOne(session.id, db, collection!, filterSpec, editorText, false)
            onNotify(`已更新文档（匹配 ${res.matchedCount ?? 1} 条）`)
            setEditOpen(null)
            void runQuery(page)
        } catch (e) {
            setEditorError(errorMessage(e))
        } finally {
            setEditorBusy(false)
        }
    }

    const replaceDoc = async () => {
        setEditorBusy(true)
        setEditorError('')
        try {
            let filterSpec = '{}'
            if (editOpen?.raw) {
                try {
                    const obj = JSON.parse(editOpen.raw)
                    if (obj._id !== undefined) filterSpec = JSON.stringify({ _id: obj._id })
                } catch {
                    /* fallback */
                }
            }
            const res = await API.mongoReplaceOne(session.id, db, collection!, filterSpec, editorText, false)
            onNotify(`已替换文档（匹配 ${res.matchedCount ?? 1} 条）`)
            setEditOpen(null)
            void runQuery(page)
        } catch (e) {
            setEditorError(errorMessage(e))
        } finally {
            setEditorBusy(false)
        }
    }

    const openInsert = () => {
        setEditorText('{\n  \n}')
        setEditorError('')
        setEditOpen({ mode: 'insert' })
    }

    const openUpdate = (raw: string) => {
        try {
            const obj = JSON.parse(raw)
            delete obj._id
            setEditorText(JSON.stringify({ $set: obj }, null, 2))
        } catch {
            setEditorText('{\n  "$set": {}\n}')
        }
        setEditorError('')
        setEditOpen({ mode: 'update', raw })
    }

    const openReplace = (raw: string) => {
        try {
            const obj = JSON.parse(raw)
            delete obj._id
            setEditorText(JSON.stringify(obj, null, 2))
        } catch {
            setEditorText(raw)
        }
        setEditorError('')
        setEditOpen({ mode: 'replace', raw })
    }

    if (!collection) {
        return <div className={`${sh.mongoEmpty}`}>请选择左侧集合以浏览文档</div>
    }

    return (
        <div>
            <div className={sh.mongoToolbar}>
                <Button type="primary" size="small" icon={<Search size={13} />} disabled={busy} onClick={() => runQuery(1)}>
                    查询
                </Button>
                <Button size="small" icon={<Plus size={12} />} disabled={busy} onClick={openInsert}>
                    插入文档
                </Button>
                <Button size="small" icon={showBuilder ? <ChevronDown size={12} /> : <ChevronRight size={12} />} onClick={() => setShowBuilder(v => !v)}>
                    查询构建器
                </Button>
                <span className={sh.toolbarRight}>
                    {error && <span className={sh.errorText}>{error}</span>}
                    <Tag color="geekblue">共 {total} 条 · 本页 {count} · {duration}ms</Tag>
                </span>
            </div>

            {showBuilder && (
                <div className={`${sh.mongoGrid2} ${sh.builderGrid}`}>
                    <label className={sh.mongoField}>
                        <span>过滤条件（filter）</span>
                        <CodeEditor lang="json" height="72px" value={filter}
                            onChange={setFilter} placeholder='{"status":"active"}' />
                    </label>
                    <label className={sh.mongoField}>
                        <span>投影（projection，可选）</span>
                        <CodeEditor lang="json" height="72px" value={projection}
                            onChange={setProjection} placeholder='{"name":1,"_id":0}' />
                    </label>
                    <label className={sh.mongoField}>
                        <span>排序（sort，可选）</span>
                        <CodeEditor lang="json" height="56px" value={sort}
                            onChange={setSort} placeholder='{"createdAt":-1}' />
                    </label>
                    <div style={{ display: 'flex', gap: 12 }}>
                        <div style={{ flex: 1 }}>
                            <span style={{ fontSize: 12, color: 'var(--text-dim)', display: 'block', marginBottom: 4 }}>每页数量</span>
                            <InputNumber
                                size="small"
                                style={{ width: '100%' }}
                                min={1}
                                max={500}
                                value={limit}
                                onChange={v => setLimit(v ?? DEFAULT_LIMIT)}
                            />
                        </div>
                        <div style={{ flex: 1 }}>
                            <span style={{ fontSize: 12, color: 'var(--text-dim)', display: 'block', marginBottom: 4 }}>跳过（skip）</span>
                            <InputNumber
                                size="small"
                                style={{ width: '100%' }}
                                min={0}
                                value={skip}
                                onChange={v => setSkip(v ?? 0)}
                            />
                        </div>
                    </div>
                </div>
            )}

            {docs.length === 0 && !busy ? (
                <div className={`${sh.mongoEmpty}`}>暂无文档（或查询无结果）</div>
            ) : (
                <div className={sh.mongoGridWrap}>
                    <table className={sh.mongoTable}>
                        <thead>
                            <tr>
                                <th style={{ width: 40 }}>#</th>
                                <th>_id / 摘要</th>
                                <th>文档（Extended JSON）</th>
                                <th style={{ width: 140, textAlign: 'center' }}>操作</th>
                            </tr>
                        </thead>
                        <tbody>
                            {docs.map((raw, i) => {
                                let summary = raw
                                try {
                                    const obj = JSON.parse(raw)
                                    const idv = obj._id !== undefined ? JSON.stringify(obj._id) : '(无 _id)'
                                    summary = idv
                                } catch {
                                    /* keep raw */
                                }
                                return (
                                    <tr key={i} className={selected === i ? 'selected' : ''} onClick={() => setSelected(i)}>
                                        <td>{(page - 1) * limit + i + 1}</td>
                                        <td>{summary}</td>
                                        <td style={{ maxWidth: 480 }}>{raw}</td>
                                        <td>
                                            <Space size={4} className={sh.docActionSpace}>
                                                <Tooltip title="编辑">
                                                    <Button
                                                        size="small"
                                                        type="text"
                                                        icon={<Edit size={12} />}
                                                        onClick={(e) => { e.stopPropagation(); openUpdate(raw) }}
                                                    />
                                                </Tooltip>
                                                <Tooltip title="替换整文档">
                                                    <Button
                                                        size="small"
                                                        type="text"
                                                        icon={<Copy size={12} />}
                                                        onClick={(e) => { e.stopPropagation(); openReplace(raw) }}
                                                    />
                                                </Tooltip>
                                                <Tooltip title="删除">
                                                    <Button
                                                        size="small"
                                                        type="text"
                                                        danger
                                                        icon={<Trash2 size={12} />}
                                                        onClick={(e) => { e.stopPropagation(); deleteDoc(raw) }}
                                                    />
                                                </Tooltip>
                                            </Space>
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            <div className={sh.paginationFooter}>
                <span className={sh.mongoDim}>共 {total} 条文档</span>
                <Pagination
                    size="small"
                    current={page}
                    pageSize={limit}
                    total={total}
                    disabled={busy}
                    showSizeChanger={false}
                    onChange={(p) => runQuery(p)}
                />
            </div>

            {editOpen && (
                <Modal
                    open={true}
                    title={editOpen.mode === 'insert' ? '插入文档' : editOpen.mode === 'replace' ? '替换文档' : '更新文档（支持 $set 等操作符）'}
                    onCancel={() => setEditOpen(null)}
                    onOk={editOpen.mode === 'insert' ? insertDoc : editOpen.mode === 'update' ? updateDoc : replaceDoc}
                    confirmLoading={editorBusy}
                    okText={editOpen.mode === 'insert' ? '插入' : editOpen.mode === 'update' ? '更新' : '替换'}
                    cancelText="取消"
                    width={560}
                >
                    <div style={{ marginTop: 8 }}>
                        <CodeEditor lang="json" height="260px" value={editorText} onChange={setEditorText} />
                    </div>
                    {editorError && (
                        <div style={{ marginTop: 8 }}>
                            <Alert type="error" showIcon message={editorError} />
                        </div>
                    )}
                </Modal>
            )}
            <ConfirmModal state={confirm} onCancel={() => setConfirm(emptyConfirm)} />
        </div>
    )
}
