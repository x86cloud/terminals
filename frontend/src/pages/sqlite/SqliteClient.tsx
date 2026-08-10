import React, {useCallback, useEffect, useState} from 'react'
import Icon from '../../components/Icon'
import {API} from '../../api'
import {errorMessage} from '../../utils'
import {SqliteSessionInfo, SqliteTableInfo, SqliteColumnInfo, SqliteQueryResult, SqliteIndexInfo} from '../../types'
import g from '../../styles/global.module.less'
import sq from './SqliteClient.module.less'
import db from '../mysql/dbTable.module.less'
import sh from '../mysql/mysqlShared.module.less'
import CellEditorInline from '../mysql/CellEditorInline'
import SqliteObjModal, {SqliteObjModalKind} from './SqliteObjModal'

interface Props {
    session: SqliteSessionInfo
    onClose: () => void
}

const PAGE_SIZE = 100

export default function SqliteClient({session, onClose}: Props) {
    const [tables, setTables] = useState<SqliteTableInfo[]>([])
    const [selected, setSelected] = useState<string | null>(null)
    const [dataView, setDataView] = useState<'data' | 'struct' | 'index'>('data')
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')
    const [info, setInfo] = useState<{ path: string; size: number }>({path: session.path, size: session.size})
    const [pathError, setPathError] = useState('')

    // 数据态
    const [rows, setRows] = useState<Record<string, any>[]>([])
    const [columns, setColumns] = useState<string[]>([])
    const [page, setPage] = useState(1)
    const [totalRows, setTotalRows] = useState(0)
    const [selectedRowIdx, setSelectedRowIdx] = useState<number | null>(null)

    // 单元格在线编辑
    const [editingCell, setEditingCell] = useState<{ rowIdx: number; col: string } | null>(null)

    // 结构态与索引态
    const [structData, setStructData] = useState<SqliteColumnInfo[]>([])
    const [indexData, setIndexData] = useState<SqliteIndexInfo[]>([])

    // 对象弹窗态 (新建表/删表/新建索引/删索引)
    const [objModal, setObjModal] = useState<{
        open: boolean
        kind: SqliteObjModalKind
        name: string
        extra: string
        unique: boolean
        msg: string
        busy: boolean
    }>({
        open: false,
        kind: 'createtable',
        name: '',
        extra: '',
        unique: false,
        msg: '',
        busy: false,
    })

    // 新增行弹窗
    const [insertModalOpen, setInsertModalOpen] = useState(false)
    const [insertData, setInsertData] = useState<Record<string, string>>({})

    const id = session.id

    const loadTables = useCallback(async () => {
        setBusy(true)
        setError('')
        try {
            const list = await API.sqliteTables(id)
            setTables(list)
        } catch (e) {
            setError(errorMessage(e))
        } finally {
            setBusy(false)
        }
    }, [id])

    const loadInfo = useCallback(async () => {
        try {
            const i = await API.sqliteInfo(id)
            if (i) setInfo({path: i.path, size: Number(i.size) || 0})
        } catch {
            /* ignore */
        }
    }, [id])

    useEffect(() => {
        void loadTables()
        void loadInfo()
    }, [loadTables, loadInfo])

    const switchFile = async () => {
        try {
            const path = await API.sqliteOpenFile()
            if (!path) return
            setBusy(true)
            setError('')
            setPathError('')
            const ok = await API.sqliteConnect(id, path)
            if (!ok) throw new Error('无法打开该 SQLite 文件')
            setSelected(null)
            setRows([])
            setColumns([])
            setStructData([])
            setIndexData([])
            setTotalRows(0)
            setPage(1)
            await Promise.all([loadTables(), loadInfo()])
        } catch (e) {
            setPathError(errorMessage(e))
            setError(errorMessage(e))
        } finally {
            setBusy(false)
        }
    }

    const openTable = useCallback(async (table: string, toPage = 1) => {
        setSelected(table)
        setDataView('data')
        setBusy(true)
        setError('')
        setSelectedRowIdx(null)
        setEditingCell(null)
        try {
            const [data, cnt, struct] = await Promise.all([
                API.sqliteSelect(id, table, PAGE_SIZE, (toPage - 1) * PAGE_SIZE),
                API.sqliteCount(id, table),
                API.sqliteDescribe(id, table),
            ])
            if (data.rows.length === 0 && toPage > 1) {
                setBusy(false)
                await openTable(table, 1)
                return
            }
            setRows(data.rows)
            setColumns(data.columns)
            setTotalRows(cnt)
            setStructData(struct)
            setPage(toPage)
        } catch (e) {
            setError(errorMessage(e))
        } finally {
            setBusy(false)
        }
    }, [id])

    const viewStruct = useCallback(async (table: string) => {
        setSelected(table)
        setDataView('struct')
        setBusy(true)
        setError('')
        try {
            setStructData(await API.sqliteDescribe(id, table))
        } catch (e) {
            setError(errorMessage(e))
        } finally {
            setBusy(false)
        }
    }, [id])

    const viewIndex = useCallback(async (table: string) => {
        setSelected(table)
        setDataView('index')
        setBusy(true)
        setError('')
        try {
            setIndexData(await API.sqliteIndexes(id, table))
        } catch (e) {
            setError(errorMessage(e))
        } finally {
            setBusy(false)
        }
    }, [id])

    const getPkWhere = (row: Record<string, any>) => {
        const pkCols = structData.filter((c) => c.pk > 0).map((c) => c.name)
        const whereCols: string[] = []
        const whereVals: any[] = []

        if (pkCols.length > 0) {
            for (const col of pkCols) {
                whereCols.push(col)
                whereVals.push(row[col])
            }
        } else {
            for (const col of columns) {
                if (row[col] !== undefined && row[col] !== null) {
                    whereCols.push(col)
                    whereVals.push(row[col])
                }
            }
        }
        return {whereCols, whereVals}
    }

    const saveCellEdit = async (rowIdx: number, col: string, rawVal: string, isNull: boolean) => {
        if (!selected) return
        const oldRow = rows[rowIdx]
        if (!oldRow) return
        const {whereCols, whereVals} = getPkWhere(oldRow)
        const newVal = isNull ? null : rawVal

        try {
            await API.sqliteUpdate(id, selected, [col], [newVal], whereCols, whereVals)
            setRows((prev) => {
                const next = [...prev]
                next[rowIdx] = {...next[rowIdx], [col]: newVal}
                return next
            })
            setEditingCell(null)
        } catch (e) {
            setError('编辑失败: ' + errorMessage(e))
        }
    }

    const handleDeleteRow = async () => {
        if (!selected || selectedRowIdx === null) return
        const row = rows[selectedRowIdx]
        if (!row) return
        if (!window.confirm('确定要删除选中的记录吗？')) return

        const {whereCols, whereVals} = getPkWhere(row)
        try {
            await API.sqliteDelete(id, selected, whereCols, whereVals)
            setRows((prev) => prev.filter((_, idx) => idx !== selectedRowIdx))
            setSelectedRowIdx(null)
            setTotalRows((prev) => Math.max(0, prev - 1))
        } catch (e) {
            setError('删除记录失败: ' + errorMessage(e))
        }
    }

    const handleInsertSubmit = async () => {
        if (!selected) return
        const cols: string[] = []
        const vals: any[] = []
        for (const col of columns) {
            const v = insertData[col]
            if (v !== undefined && v !== '') {
                cols.push(col)
                vals.push(v)
            }
        }
        if (cols.length === 0) {
            setError('请至少填写一个字段的值')
            return
        }
        try {
            await API.sqliteInsert(id, selected, cols, vals)
            setInsertModalOpen(false)
            setInsertData({})
            await openTable(selected, page)
        } catch (e) {
            setError('新增记录失败: ' + errorMessage(e))
        }
    }

    const handleObjConfirm = async () => {
        const {kind, name, extra, unique} = objModal
        setObjModal((prev) => ({...prev, busy: true, msg: ''}))
        try {
            if (kind === 'createtable') {
                await API.sqliteCreateTable(id, name, extra)
                setObjModal((prev) => ({...prev, open: false}))
                await loadTables()
                await openTable(name, 1)
            } else if (kind === 'droptable') {
                await API.sqliteDropTable(id, name)
                setObjModal((prev) => ({...prev, open: false}))
                if (selected === name) setSelected(null)
                await loadTables()
            } else if (kind === 'truncate') {
                await API.sqliteTruncateTable(id, name)
                setObjModal((prev) => ({...prev, open: false}))
                if (selected === name) {
                    await openTable(name, 1)
                }
            } else if (kind === 'createindex') {
                if (!selected) return
                await API.sqliteCreateIndex(id, selected, name, extra, unique)
                setObjModal((prev) => ({...prev, open: false}))
                await viewIndex(selected)
            } else if (kind === 'dropindex') {
                if (!selected) return
                await API.sqliteDropIndex(id, selected, name)
                setObjModal((prev) => ({...prev, open: false}))
                await viewIndex(selected)
            }
        } catch (e) {
            setObjModal((prev) => ({...prev, busy: false, msg: '失败: ' + errorMessage(e)}))
        }
    }

    const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE))
    const goPage = (p: number) => {
        if (!selected || busy) return
        const target = Math.min(Math.max(1, p), totalPages)
        if (target === page) return
        void openTable(selected, target)
    }

    const fmtSize = (n: number) => {
        if (!n) return '0 B'
        const units = ['B', 'KB', 'MB', 'GB']
        let i = 0
        let v = n
        while (v >= 1024 && i < units.length - 1) {
            v /= 1024
            i++
        }
        return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`
    }

    return (
        <div className={sq.sqlitePane}>
            <div className={sq.sqliteSide}>
                <div className={sq.sqliteHead}>
                    <Icon name="database" size={13}/>
                    <span className={sq.sqliteTitle}>SQLite</span>
                    <button
                        className={`${g.btn} ${g.xs}`}
                        onClick={() =>
                            setObjModal({
                                open: true,
                                kind: 'createtable',
                                name: '',
                                extra: 'id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT',
                                unique: false,
                                msg: '',
                                busy: false,
                            })
                        }
                        title="新建表"
                    >
                        <Icon name="plus" size={12}/> 建表
                    </button>
                    <button className={`${g.btn} ${g.xs}`} onClick={switchFile} disabled={busy} title="选择其他数据库文件">
                        <Icon name="folder" size={12}/> 切换
                    </button>
                </div>
                <div className={sq.sqlitePath} title={info.path}>
                    <Icon name="file" size={12}/>
                    <span>{info.path ? info.path.split(/[\\/]/).pop() : '未选择文件'}</span>
                </div>
                <div className={sq.sqliteStatus}>
                    <span className={`${g.dot}${session.connected ? ' ' + g.on : ''}`}/>
                    {session.connected ? `已连接 · ${fmtSize(info.size)}` : '未连接'}
                    {pathError && <span className={sq.pathErr}>{pathError}</span>}
                </div>
                <div className={sq.sqliteTables}>
                    {tables.length === 0 && !busy && (
                        <div className={`${sh.mongoEmpty} ${sh.small}`}>暂无表</div>
                    )}
                    {tables.map((t) => (
                        <div key={t.name} className={sq.sqliteTableRow}>
                            <button
                                className={`${sq.sqliteTableItem}${selected === t.name ? ' ' + sq.active : ''}`}
                                onClick={() => openTable(t.name)}
                            >
                                <Icon name={t.type === 'view' ? 'panel' : 'table'} size={13}/>
                                <span>{t.name}</span>
                                {t.type === 'view' && <span className={sh.mongoBadge} style={{marginLeft: 4}}>视图</span>}
                            </button>
                            <div className={sq.sqliteTableMenu}>
                                <button
                                    className={g.iconBtn}
                                    title="清空表数据"
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        setObjModal({
                                            open: true,
                                            kind: 'truncate',
                                            name: t.name,
                                            extra: '',
                                            unique: false,
                                            msg: '',
                                            busy: false,
                                        })
                                    }}
                                >
                                    <Icon name="refresh" size={12}/>
                                </button>
                                <button
                                    className={`${g.iconBtn} ${g.danger}`}
                                    title="删除表"
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        setObjModal({
                                            open: true,
                                            kind: 'droptable',
                                            name: t.name,
                                            extra: '',
                                            unique: false,
                                            msg: '',
                                            busy: false,
                                        })
                                    }}
                                >
                                    <Icon name="close" size={12}/>
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <div className={sq.sqliteMain}>
                <div className={sq.sqliteToolbar}>
                    <span className={sq.sqliteConnTitle}>
                        {selected ? `${selected} · ${totalRows} 行` : `${session.title || (info.path ? info.path.split(/[\\/]/).pop() : 'SQLite')} 浏览器`}
                    </span>
                    <span className={g.spacer}/>
                    {error && <span className={sq.sqliteError}>{error}</span>}
                    <button className={g.iconBtn} title="关闭" onClick={onClose}>
                        <Icon name="close" size={15}/>
                    </button>
                </div>

                <div className={sq.sqliteTabs}>
                    {(['data', 'struct', 'index'] as const).map((v) => (
                        <button
                            key={v}
                            className={`${sq.sqliteTab}${dataView === v ? ' ' + sq.active : ''}`}
                            onClick={() => {
                                if (!selected) return
                                if (v === 'data') void openTable(selected, page)
                                else if (v === 'struct') void viewStruct(selected)
                                else void viewIndex(selected)
                            }}
                            disabled={!selected}
                        >
                            {v === 'data' ? '数据预览' : v === 'struct' ? '表结构' : '索引'}
                        </button>
                    ))}
                    {selected && (
                        <div style={{marginLeft: 'auto', display: 'flex', gap: 6, paddingRight: 8}}>
                            {dataView === 'data' && (
                                <>
                                    <button className={`${g.btn} ${g.xs}`} onClick={() => openTable(selected, page)} title="刷新">
                                        <Icon name="refresh" size={12}/> 刷新
                                    </button>
                                    <button className={`${g.btn} ${g.xs} ${g.primary}`} onClick={() => setInsertModalOpen(true)} title="新增行">
                                        <Icon name="plus" size={12}/> 新增记录
                                    </button>
                                    <button
                                        className={`${g.btn} ${g.xs} ${g.danger}`}
                                        disabled={selectedRowIdx === null}
                                        onClick={handleDeleteRow}
                                        title="删除选中行"
                                    >
                                        <Icon name="close" size={12}/> 删除选中行
                                    </button>
                                </>
                            )}
                            {dataView === 'index' && (
                                <button
                                    className={`${g.btn} ${g.xs} ${g.primary}`}
                                    onClick={() =>
                                        setObjModal({
                                            open: true,
                                            kind: 'createindex',
                                            name: '',
                                            extra: '',
                                            unique: false,
                                            msg: '',
                                            busy: false,
                                        })
                                    }
                                >
                                    <Icon name="plus" size={12}/> 新建索引
                                </button>
                            )}
                            <button
                                className={`${g.btn} ${g.xs} ${g.danger}`}
                                onClick={() =>
                                    setObjModal({
                                        open: true,
                                        kind: 'droptable',
                                        name: selected,
                                        extra: '',
                                        unique: false,
                                        msg: '',
                                        busy: false,
                                    })
                                }
                            >
                                删表
                            </button>
                        </div>
                    )}
                </div>

                <div className={sq.sqliteContent}>
                    {!selected && (
                        <div className={`${sh.mongoEmpty}`}>请选择左侧的表或视图以查看数据</div>
                    )}

                    {selected && dataView === 'data' && (
                        <div className={sq.sqliteDataWrap}>
                            {columns.length > 0 ? (
                                <div className={db.dbTableScroll}>
                                    <table className={db.dbTable}>
                                        <thead>
                                        <tr>
                                            {columns.map((c) => (
                                                <th key={c}>{c}</th>
                                            ))}
                                        </tr>
                                        </thead>
                                        <tbody>
                                        {rows.map((r, i) => (
                                            <tr
                                                key={i}
                                                className={selectedRowIdx === i ? db.selectedTr : ''}
                                                onClick={() => setSelectedRowIdx(i)}
                                            >
                                                {columns.map((c) => {
                                                    const isEditing = editingCell?.rowIdx === i && editingCell?.col === c
                                                    const v = r[c]
                                                    const isn = v === null || v === undefined
                                                    return (
                                                        <td
                                                            key={c}
                                                            className={isn ? db.dbNullCell : ''}
                                                            onDoubleClick={(e) => {
                                                                e.stopPropagation()
                                                                setEditingCell({rowIdx: i, col: c})
                                                            }}
                                                        >
                                                            {isEditing ? (
                                                                <CellEditorInline
                                                                    value={v === null || v === undefined ? '' : String(v)}
                                                                    isNull={isn}
                                                                    onCommit={(raw: string, isN: boolean) => saveCellEdit(i, c, raw, isN)}
                                                                    onCancel={() => setEditingCell(null)}
                                                                />
                                                            ) : isn ? (
                                                                'NULL'
                                                            ) : (
                                                                String(v)
                                                            )}
                                                        </td>
                                                    )
                                                })}
                                            </tr>
                                        ))}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <div className={db.dbEmpty}>该表暂无数据</div>
                            )}
                            <div className={sq.pager}>
                                <button className={g.btn} disabled={page <= 1 || busy} onClick={() => goPage(1)}>首页</button>
                                <button className={g.btn} disabled={page <= 1 || busy} onClick={() => goPage(page - 1)}>上一页</button>
                                <span className={sq.pageInfo}>第 {page} / {totalPages} 页</span>
                                <button className={g.btn} disabled={page >= totalPages || busy} onClick={() => goPage(page + 1)}>下一页</button>
                            </div>
                        </div>
                    )}

                    {selected && dataView === 'struct' && (
                        <div className={sq.sqliteDataWrap}>
                            {structData.length > 0 ? (
                                <div className={db.dbTableScroll}>
                                    <table className={db.dbTable}>
                                        <thead>
                                        <tr>
                                            <th>列名</th>
                                            <th>类型</th>
                                            <th>非空</th>
                                            <th>默认值</th>
                                            <th>主键</th>
                                        </tr>
                                        </thead>
                                        <tbody>
                                        {structData.map((c) => (
                                            <tr key={c.cid}>
                                                <td>{c.name}</td>
                                                <td>{c.type || ''}</td>
                                                <td>{c.notnull ? '是' : ''}</td>
                                                <td>{c.default === null || c.default === undefined ? '' : String(c.default)}</td>
                                                <td>{c.pk > 0 ? '是' : ''}</td>
                                            </tr>
                                        ))}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <div className={`${sh.mongoEmpty} ${sh.small}`}>无结构信息</div>
                            )}
                        </div>
                    )}

                    {selected && dataView === 'index' && (
                        <div className={sq.sqliteDataWrap}>
                            {indexData.length > 0 ? (
                                <div className={db.dbTableScroll}>
                                    <table className={db.dbTable}>
                                        <thead>
                                        <tr>
                                            <th>索引名</th>
                                            <th>唯一</th>
                                            <th>来源</th>
                                            <th>部分索引</th>
                                            <th>操作</th>
                                        </tr>
                                        </thead>
                                        <tbody>
                                        {indexData.map((ix) => (
                                            <tr key={ix.name}>
                                                <td>{ix.name}</td>
                                                <td>{ix.unique ? '是' : ''}</td>
                                                <td>{ix.origin || ''}</td>
                                                <td>{ix.partial ? '是' : ''}</td>
                                                <td>
                                                    <button
                                                        className={`${g.btn} ${g.xs} ${g.danger}`}
                                                        onClick={() =>
                                                            setObjModal({
                                                                open: true,
                                                                kind: 'dropindex',
                                                                name: ix.name,
                                                                extra: '',
                                                                unique: false,
                                                                msg: '',
                                                                busy: false,
                                                            })
                                                        }
                                                    >
                                                        删除
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <div className={`${sh.mongoEmpty} ${sh.small}`}>该表暂无索引</div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {objModal.open && (
                <SqliteObjModal
                    kind={objModal.kind}
                    busy={objModal.busy}
                    msg={objModal.msg}
                    name={objModal.name}
                    extra={objModal.extra}
                    unique={objModal.unique}
                    onName={(v) => setObjModal((prev) => ({...prev, name: v}))}
                    onExtra={(v) => setObjModal((prev) => ({...prev, extra: v}))}
                    onUnique={(v) => setObjModal((prev) => ({...prev, unique: v}))}
                    onClose={() => setObjModal((prev) => ({...prev, open: false}))}
                    onConfirm={handleObjConfirm}
                />
            )}

            {insertModalOpen && (
                <div className={g.modalMask} onClick={() => setInsertModalOpen(false)}>
                    <div className={`${g.modal} ${g.ioModal}`} onClick={(e) => e.stopPropagation()}>
                        <div className={g.modalHead}>
                            <span>新增记录到 {selected}</span>
                            <button className={g.iconBtn} onClick={() => setInsertModalOpen(false)}>
                                <Icon name="close" size={14}/>
                            </button>
                        </div>
                        <div className={g.modalBody}>
                            {columns.map((col) => (
                                <div key={col} className={g.field}>
                                    <label>{col}</label>
                                    <input
                                        value={insertData[col] || ''}
                                        onChange={(e) =>
                                            setInsertData((prev) => ({...prev, [col]: e.target.value}))
                                        }
                                        placeholder="留空则插入默认值/NULL"
                                    />
                                </div>
                            ))}
                        </div>
                        <div className={g.modalFoot}>
                            <button className={`${g.btn} ${g.sm}`} onClick={() => setInsertModalOpen(false)}>
                                取消
                            </button>
                            <button className={`${g.btn} ${g.sm} ${g.primary}`} onClick={handleInsertSubmit}>
                                保存插入
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
