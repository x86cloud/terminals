import React, {useCallback, useEffect, useRef, useState} from 'react'
import Icon from '../../components/Icon'
import {API} from '../../api'
import {errorMessage} from '../../utils'
import {MongoSessionInfo, MongoQuerySpec, MongoFindResult} from '../../types'
import CodeEditor from '../../components/CodeEditor'
import {ConfirmModal, ConfirmState} from '../../components/Modal'
import sh from './mongoShared.module.less'
import g from '../../styles/global.module.less'

interface Props {
    session: MongoSessionInfo
    db: string
    collection: string | null
    onNotify: (msg: string, kind?: 'info' | 'error') => void
}

const DEFAULT_LIMIT = 50

export default function DocumentsTab({session, db, collection, onNotify}: Props) {
    const emptyConfirm: ConfirmState = {open: false, title: '', message: ''}
    const [confirm, setConfirm] = useState<ConfirmState>(emptyConfirm)
    const [docs, setDocs] = useState<string[]>([])
    const [total, setTotal] = useState(0)
    const [count, setCount] = useState(0)
    const [duration, setDuration] = useState(0)
    const [page, setPage] = useState(1)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')
    const [selected, setSelected] = useState<number | null>(null)

    // 查询构建器状态
    const [filter, setFilter] = useState('{}')
    const [projection, setProjection] = useState('')
    const [sort, setSort] = useState('')
    const [limit, setLimit] = useState(DEFAULT_LIMIT)
    const [skip, setSkip] = useState(0)
    const [showBuilder, setShowBuilder] = useState(false)

    // 编辑器
    const [editOpen, setEditOpen] = useState<null | { mode: 'insert' | 'update' | 'replace'; raw?: string; idx?: number }>(null)
    const [editorText, setEditorText] = useState('')
    const [editorBusy, setEditorBusy] = useState(false)
    const [editorError, setEditorError] = useState('')

    const id = session.id

    const runQuery = useCallback(async (toPage = 1) => {
        if (!db || !collection) return
        setBusy(true)
        setError('')
        const spec: MongoQuerySpec = {
            database: db,
            collection,
            filter,
            projection,
            sort,
            limit,
            skip: toPage > 1 ? skip + (toPage - 1) * limit : skip,
            hint: '',
            collation: '',
        }
        try {
            const res: MongoFindResult = await API.mongoFind(id, spec)
            setDocs(res.documents)
            setTotal(res.total)
            setCount(res.count)
            setDuration(res.durationMs)
            setPage(toPage)
            setSelected(null)
        } catch (e) {
            setError(errorMessage(e))
            onNotify(errorMessage(e), 'error')
        } finally {
            setBusy(false)
        }
    }, [id, db, collection, filter, projection, sort, limit, skip, onNotify])

    // 切换库时清空上一次查询结果；选中集合后自动查询
    const runQueryRef = useRef(runQuery)
    runQueryRef.current = runQuery
    useEffect(() => {
        // 库变化时重置结果，避免残留上一个库的数据
        setDocs([])
        setTotal(0)
        setCount(0)
        setDuration(0)
        setPage(1)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [db])
    useEffect(() => {
        if (db && collection) runQueryRef.current(1)
        // 仅在集合变化时触发，避免输入条件变化引起重复查询
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [collection])

    const insertDoc = async () => {
        setEditorBusy(true)
        setEditorError('')
        try {
            await API.mongoInsertOne(id, db, collection!, editorText)
            setEditOpen(null)
            onNotify('已插入文档')
            await runQuery(page)
        } catch (e) {
            setEditorError(errorMessage(e))
        } finally {
            setEditorBusy(false)
        }
    }

    const updateDoc = async () => {
        if (editOpen?.raw == null) return
        setEditorBusy(true)
        setEditorError('')
        try {
            const res = await API.mongoUpdateOne(id, db, collection!, editOpen.raw, editorText, false)
            setEditOpen(null)
            onNotify(`已更新（匹配 ${res.matched}，修改 ${res.modified}）`)
            await runQuery(page)
        } catch (e) {
            setEditorError(errorMessage(e))
        } finally {
            setEditorBusy(false)
        }
    }

    const replaceDoc = async () => {
        if (editOpen?.raw == null) return
        setEditorBusy(true)
        setEditorError('')
        try {
            const res = await API.mongoReplaceOne(id, db, collection!, editOpen.raw, editorText, false)
            setEditOpen(null)
            onNotify(`已替换（匹配 ${res.matched}，修改 ${res.modified}）`)
            await runQuery(page)
        } catch (e) {
            setEditorError(errorMessage(e))
        } finally {
            setEditorBusy(false)
        }
    }

    const deleteDoc = (raw: string) => {
        setConfirm({
            open: true,
            title: '删除文档',
            danger: true,
            message: '确认删除该文档？操作不可撤销。',
            onConfirm: async () => {
                setConfirm(emptyConfirm)
                setBusy(true)
                try {
                    const n = await API.mongoDeleteOne(id, db, collection!, raw)
                    onNotify(`已删除 ${n} 个文档`)
                    await runQuery(page)
                } catch (e) {
                    setError(errorMessage(e))
                } finally {
                    setBusy(false)
                }
            },
        })
    }

    const openInsert = () => {
        setEditorText('{\n  \n}')
        setEditorError('')
        setEditOpen({mode: 'insert'})
    }

    const openUpdate = (raw: string) => {
        setEditorText(raw)
        setEditorError('')
        setEditOpen({mode: 'update', raw})
    }

    const openReplace = (raw: string) => {
        setEditorText(raw)
        setEditorError('')
        setEditOpen({mode: 'replace', raw})
    }

    const totalPages = Math.max(1, Math.ceil(total / limit))

    if (!collection) {
        return <div className={`${sh.mongoEmpty}`}>请选择左侧集合以浏览文档</div>
    }

    return (
        <div>
            <div className={sh.mongoToolbar}>
                <button className={`${g.btn} ${g.primary}`} disabled={busy} onClick={() => runQuery(1)}>
                    <Icon name="search" size={13}/> 查询
                </button>
                <button className={`${g.btn} ${g.sm}`} disabled={busy} onClick={openInsert}>
                    <Icon name="plus" size={12}/> 插入文档
                </button>
                <button className={`${g.btn} ${g.sm}`} onClick={() => setShowBuilder(v => !v)}>
                    <Icon name={showBuilder ? 'chevron-down' : 'chevron-right'} size={12}/> 查询构建器
                </button>
                <span className={g.spacer}/>
                {error && <span className={sh.mongoError ?? g.formError}>{error}</span>}
                <span className={sh.mongoBadge}>共 {total} 条 · 本页 {count} · {duration}ms</span>
            </div>

            {showBuilder && (
                <div className={sh.mongoGrid2} style={{marginBottom: 12}}>
                <label className={sh.mongoField}>
                    <span>过滤条件（filter）</span>
                    <CodeEditor lang="json" height="72px" value={filter}
                                onChange={setFilter} placeholder='{"status":"active"}'/>
                </label>
                <label className={sh.mongoField}>
                    <span>投影（projection，可选）</span>
                    <CodeEditor lang="json" height="72px" value={projection}
                                onChange={setProjection} placeholder='{"name":1,"_id":0}'/>
                </label>
                <label className={sh.mongoField}>
                    <span>排序（sort，可选）</span>
                    <CodeEditor lang="json" height="56px" value={sort}
                                onChange={setSort} placeholder='{"createdAt":-1}'/>
                </label>
                    <div className={sh.mongoRow}>
                        <label className={sh.mongoField} style={{flex: 1}}>
                            <span>每页数量</span>
                            <input className={sh.mongoInput} type="number" value={limit}
                                   onChange={e => setLimit(Number(e.target.value) || DEFAULT_LIMIT)}/>
                        </label>
                        <label className={sh.mongoField} style={{flex: 1}}>
                            <span>跳过（skip）</span>
                            <input className={sh.mongoInput} type="number" value={skip}
                                   onChange={e => setSkip(Number(e.target.value) || 0)}/>
                        </label>
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
                            <th style={{width: 40}}>#</th>
                            <th>_id / 摘要</th>
                            <th>文档（Extended JSON）</th>
                            <th style={{width: 150}}>操作</th>
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
                                    <td style={{maxWidth: 480}}>{raw}</td>
                                    <td>
                                        <div className={sh.mongoRow}>
                                            <button className={sh.mongoInlineBtn} title="编辑" onClick={(e) => { e.stopPropagation(); openUpdate(raw) }}>
                                                <Icon name="edit" size={12}/>
                                            </button>
                                            <button className={sh.mongoInlineBtn} title="替换整文档" onClick={(e) => { e.stopPropagation(); openReplace(raw) }}>
                                                <Icon name="copy" size={12}/>
                                            </button>
                                            <button className={sh.mongoInlineBtn} title="删除" onClick={(e) => { e.stopPropagation(); deleteDoc(raw) }}>
                                                <Icon name="trash" size={12}/>
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            )
                        })}
                        </tbody>
                    </table>
                </div>
            )}

            <div className={sh.mongoToolbar} style={{marginTop: 10}}>
                <button className={g.btn} disabled={busy || page <= 1} onClick={() => runQuery(page - 1)}>上一页</button>
                <span className={sh.mongoBadge}>第 {page} / {totalPages} 页</span>
                <button className={g.btn} disabled={busy || page >= totalPages} onClick={() => runQuery(page + 1)}>下一页</button>
            </div>

            {editOpen && (
                <div className={sh.mongoField} style={{marginTop: 12, border: '1px solid ' + g.border, padding: 10, borderRadius: 6}}>
                    <div className={sh.mongoRow} style={{justifyContent: 'space-between'}}>
                        <strong>{editOpen.mode === 'insert' ? '插入文档' : editOpen.mode === 'replace' ? '替换文档' : '更新文档（支持 $set 等操作符）'}</strong>
                        <button className={g.iconBtn} onClick={() => setEditOpen(null)}><Icon name="close" size={14}/></button>
                    </div>
                    <div style={{marginTop: 6}}>
                        <CodeEditor lang="json" height="260px" value={editorText} onChange={setEditorText}/>
                    </div>
                    {editorError && <span className={g.formError}>{editorError}</span>}
                    <div className={sh.mongoRow} style={{marginTop: 6}}>
                        {editOpen.mode === 'insert' && (
                            <button className={`${g.btn} ${g.primary}`} disabled={editorBusy} onClick={insertDoc}>插入</button>
                        )}
                        {editOpen.mode === 'update' && (
                            <button className={`${g.btn} ${g.primary}`} disabled={editorBusy} onClick={updateDoc}>更新</button>
                        )}
                        {editOpen.mode === 'replace' && (
                            <button className={`${g.btn} ${g.primary}`} disabled={editorBusy} onClick={replaceDoc}>替换</button>
                        )}
                        <button className={g.btn} onClick={() => setEditOpen(null)}>取消</button>
                    </div>
                </div>
            )}
            <ConfirmModal state={confirm} onCancel={() => setConfirm(emptyConfirm)}/>
        </div>
    )
}
