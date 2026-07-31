import React, {useCallback, useEffect, useMemo, useState} from 'react'
import {API} from '../api'
import Icon from './Icon'
import {errorMessage} from '../utils'
import {MysqlQueryResult, MysqlSessionInfo} from '../types'

interface Props {
    session: MysqlSessionInfo
    onClose: () => void
    onChange: (id: string, database: string) => void
}

// 单元格编辑态：value 为文本，isNull 表示写入 SQL NULL
interface CellEdit {
    value: string
    isNull: boolean
}

type RowDrafts = Record<number, Record<string, CellEdit>>
type NewRow = Record<string, CellEdit>

function formatCell(v: any) {
    if (v === null || v === undefined) return <span className="mysql-null">NULL</span>
    if (typeof v === 'object') return JSON.stringify(v)
    return String(v)
}

function Grid({columns, rows}: { columns: string[]; rows: Record<string, any>[] }) {
    if (!columns.length) {
        return <div className="mysql-empty">无结果</div>
    }
    return (
        <div className="mysql-grid-wrap">
            <table className="mysql-table">
                <thead>
                <tr>
                    {columns.map((c) => (
                        <th key={c}>{c}</th>
                    ))}
                </tr>
                </thead>
                <tbody>
                {rows.map((r, i) => (
                    <tr key={i}>
                        {columns.map((c) => (
                            <td key={c}>{formatCell(r[c])}</td>
                        ))}
                    </tr>
                ))}
                </tbody>
            </table>
        </div>
    )
}

export default function MysqlClient({session, onClose, onChange}: Props) {
    const [databases, setDatabases] = useState<string[]>([])
    const [db, setDb] = useState<string>(session.database || '')
    const [tables, setTables] = useState<string[]>([])
    const [selected, setSelected] = useState<string | null>(null)
    const [view, setView] = useState<'data' | 'struct'>('data')
    const [tableData, setTableData] = useState<MysqlQueryResult | null>(null)
    const [structData, setStructData] = useState<MysqlQueryResult | null>(null)
    const [sql, setSql] = useState<string>('')
    const [sqlResult, setSqlResult] = useState<MysqlQueryResult | null>(null)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')
    const [saving, setSaving] = useState(false)

    // 导入/导出弹窗状态
    const [ioModal, setIoModal] = useState<null | 'export' | 'import'>(null)
    const [ioBusy, setIoBusy] = useState(false)
    const [ioMsg, setIoMsg] = useState<string>('')

    // 行数据（查）与编辑态（改/增）
    const [rows, setRows] = useState<Record<string, any>[]>([])
    const [drafts, setDrafts] = useState<RowDrafts>({})
    const [newRows, setNewRows] = useState<NewRow[]>([])
    const [editing, setEditing] = useState<{ row: number; col: string } | null>(null)

    // 分页状态
    const [page, setPage] = useState(1)
    const [pageSize, setPageSize] = useState(50)
    const [totalRows, setTotalRows] = useState(0)

    const columns = tableData?.columns ?? []
    const pkCols = useMemo(() => {
        if (!structData) return []
        return structData.rows
            .filter((r) => r['Key'] === 'PRI')
            .map((r) => r['Field'] as string)
    }, [structData])

    const loadDatabases = useCallback(async () => {
        setBusy(true)
        setError('')
        try {
            const dbs = await API.mysqlDatabases(session.id)
            setDatabases(dbs)
            const cur = session.database || dbs[0] || ''
            if (cur) setDb(cur)
        } catch (e) {
            setError(errorMessage(e))
        } finally {
            setBusy(false)
        }
    }, [session.id, session.database])

    const loadTables = useCallback(async (database: string) => {
        if (!database) {
            setTables([])
            return
        }
        setBusy(true)
        setError('')
        try {
            const list = await API.mysqlTables(session.id, database)
            setTables(list)
        } catch (e) {
            setError(errorMessage(e))
        } finally {
            setBusy(false)
        }
    }, [session.id])

    useEffect(() => {
        loadDatabases()
    }, [loadDatabases])

    useEffect(() => {
        if (db) {
            loadTables(db)
            setSelected(null)
            setTableData(null)
            setStructData(null)
            setRows([])
            setDrafts({})
            setNewRows([])
        }
    }, [db, loadTables])

    const switchDb = (value: string) => {
        setDb(value)
        onChange(session.id, value)
    }

    const openTable = useCallback(async (table: string, toPage = 1, size?: number) => {
        const ps = size ?? pageSize
        setSelected(table)
        setView('data')
        setBusy(true)
        setError('')
        setDrafts({})
        setNewRows([])
        setEditing(null)
        try {
            const [data, struct, cnt] = await Promise.all([
                API.mysqlSelect(session.id, db, table, ps, (toPage - 1) * ps),
                API.mysqlDescribe(session.id, db, table),
                API.mysqlCount(session.id, db, table),
            ])
            // 删除/保存后当前页可能已无数据，自动回退一页
            if (data.rows.length === 0 && toPage > 1) {
                setBusy(false)
                await openTable(table, toPage - 1, ps)
                return
            }
            setTableData(data)
            setStructData(struct)
            setRows(data.rows)
            setTotalRows(cnt)
            setPage(toPage)
        } catch (e) {
            setError(errorMessage(e))
        } finally {
            setBusy(false)
        }
    }, [session.id, db, pageSize])

    const totalPages = Math.max(1, Math.ceil(totalRows / pageSize))

    const goPage = (p: number) => {
        if (!selected || busy) return
        const target = Math.min(Math.max(1, p), totalPages)
        if (target === page) return
        void openTable(selected, target)
    }

    const changePageSize = (size: number) => {
        setPageSize(size)
        if (selected) void openTable(selected, 1, size)
    }

    const runSql = async () => {
        const stmt = sql.trim()
        if (!stmt) {
            setError('请输入要执行的 SQL')
            return
        }
        setBusy(true)
        setError('')
        setSqlResult(null)
        try {
            const res = await API.mysqlRun(session.id, db, stmt)
            setSqlResult(res)
        } catch (e) {
            setError(errorMessage(e))
        } finally {
            setBusy(false)
        }
    }

    // ---------- 改 / 增 / 删 ----------

    const cellDisplay = (row: number, col: string): { text: string; isNull: boolean } => {
        const d = drafts[row]?.[col]
        if (d) return {text: d.isNull ? 'NULL' : d.value, isNull: d.isNull}
        const orig = rows[row]?.[col]
        const isn = orig === null || orig === undefined
        return {text: isn ? 'NULL' : String(orig), isNull: isn}
    }

    const commitEdit = (row: number, col: string, value: string, isNull: boolean) => {
        setDrafts((prev) => ({
            ...prev,
            [row]: {...(prev[row] || {}), [col]: {value, isNull}},
        }))
        setEditing(null)
    }

    const addRow = () => {
        const blank: NewRow = {}
        for (const c of columns) blank[c] = {value: '', isNull: false}
        setNewRows((prev) => [...prev, blank])
    }

    const updateNewCell = (idx: number, col: string, value: string, isNull: boolean) => {
        setNewRows((prev) =>
            prev.map((r, i) => (i === idx ? {...r, [col]: {value, isNull}} : r))
        )
    }

    const deleteNewRow = (idx: number) => {
        setNewRows((prev) => prev.filter((_, i) => i !== idx))
    }

    const deleteRow = async (row: number) => {
        if (!selected) return
        const wCols = pkCols.length ? pkCols : columns
        const wVals = wCols.map((c) => rows[row]?.[c] ?? null)
        const hint = pkCols.length ? '' : '（该表无主键，将按整行匹配，请谨慎操作）'
        if (!window.confirm(`确认删除该行？${hint}`)) return
        setBusy(true)
        setError('')
        try {
            const aff = await API.mysqlDelete(session.id, db, selected, wCols, wVals)
            setError('')
            await openTable(selected, page)
            void aff
        } catch (e) {
            setError(errorMessage(e))
        } finally {
            setBusy(false)
        }
    }

    const saveAll = async () => {
        if (!selected) return
        setSaving(true)
        setError('')
        let total = 0
        try {
            // 更新已存在行中发生变化的单元格
            for (const [idxStr, cells] of Object.entries(drafts)) {
                const idx = Number(idxStr)
                const setCols: string[] = []
                const setVals: any[] = []
                for (const [c, cell] of Object.entries(cells)) {
                    const orig = rows[idx]?.[c]
                    const origEff = orig === null || orig === undefined ? null : String(orig)
                    const newEff = cell.isNull ? null : cell.value
                    if (origEff !== newEff) {
                        setCols.push(c)
                        setVals.push(cell.isNull ? null : cell.value)
                    }
                }
                if (!setCols.length) continue
                const wCols = pkCols.length ? pkCols : columns
                const wVals = wCols.map((c) => rows[idx]?.[c] ?? null)
                const aff = await API.mysqlUpdate(session.id, db, selected, setCols, setVals, wCols, wVals)
                total += aff
            }
            // 插入新行（仅包含填写过的列；NULL 切换的列也写入 NULL）
            for (const nr of newRows) {
                const insCols: string[] = []
                const insVals: any[] = []
                for (const c of columns) {
                    const cell = nr[c]
                    if (!cell) continue
                    if (cell.isNull) {
                        insCols.push(c)
                        insVals.push(null)
                    } else if (cell.value.trim() !== '') {
                        insCols.push(c)
                        insVals.push(cell.value)
                    }
                }
                if (!insCols.length) continue
                const aff = await API.mysqlInsert(session.id, db, selected, insCols, insVals)
                total += aff
            }
            setDrafts({})
            setNewRows([])
            await openTable(selected, page)
            setError('')
        } catch (e) {
            setError(errorMessage(e))
        } finally {
            setSaving(false)
        }
        void total
    }

    const dirtyCount =
        Object.keys(drafts).length + newRows.length

    // 导出：由后端弹出保存对话框并写入文件，返回最终路径（取消返回空字符串）
    const doExport = useCallback(async (opts: {
        mode: 'sql' | 'csv'
        source: 'table' | 'query'
        table: string
        sqlText: string
        limit: number
    }) => {
        try {
            setIoBusy(true)
            setIoMsg('')
            const filePath = await API.mysqlExportToFile(
                session.id,
                db,
                opts.mode,
                opts.source,
                opts.table,
                opts.sqlText,
                opts.limit
            )
            if (!filePath) return
            setIoMsg(`已导出到：${filePath}`)
            setTimeout(() => setIoModal(null), 800)
        } catch (e) {
            setIoMsg('导出失败：' + errorMessage(e))
        } finally {
            setIoBusy(false)
        }
    }, [session.id, db])

    // 导入：由后端弹出打开对话框并写入数据库，返回结果消息（取消返回空字符串）
    const doImport = useCallback(async (opts: {
        mode: 'sql' | 'csv'
        table: string
    }) => {
        try {
            setIoBusy(true)
            setIoMsg('')
            const msg = await API.mysqlImportFromFile(
                session.id,
                db,
                opts.mode,
                opts.table
            )
            if (!msg) return
            setIoMsg(msg)
            // 导入后刷新当前表数据
            if (selected && (opts.mode === 'sql' || opts.table === selected)) {
                await openTable(selected)
            }
            onChange(session.id, db)
        } catch (e) {
            setIoMsg('导入失败：' + errorMessage(e))
        } finally {
            setIoBusy(false)
        }
    }, [session.id, db, selected, onChange])

    return (
        <div className="mysql-pane">
            <div className="mysql-side">
                <div className="mysql-db-head">
                    <Icon name="database" size={13}/>
                    <select
                        className="mysql-db-select"
                        value={db}
                        disabled={busy || databases.length === 0}
                        onChange={(e) => switchDb(e.target.value)}
                    >
                        {databases.length === 0 && <option value="">（无数据库）</option>}
                        {databases.map((d) => (
                            <option key={d} value={d}>{d}</option>
                        ))}
                    </select>
                    <button
                        className="icon-btn"
                        title="刷新"
                        disabled={busy}
                        onClick={() => loadDatabases()}
                    >
                        <Icon name="refresh" size={13}/>
                    </button>
                </div>
                <div className="mysql-tables">
                    {tables.length === 0 && !busy && (
                        <div className="mysql-empty small">暂无表</div>
                    )}
                    {tables.map((t) => (
                        <button
                            key={t}
                            className={`mysql-table-item${selected === t ? ' active' : ''}`}
                            onClick={() => openTable(t)}
                        >
                            <Icon name="table" size={13}/>
                            <span>{t}</span>
                        </button>
                    ))}
                </div>
            </div>

            <div className="mysql-main">
                <div className="mysql-toolbar">
                    <span className="mysql-conn-title">
                        MySQL · {session.host}:{session.port}
                    </span>
                    <span className="spacer"/>
                    {error && <span className="mysql-error">{error}</span>}
                    <button
                        className="btn sm"
                        title="导入 SQL / CSV 文件"
                        disabled={busy}
                        onClick={() => {
                            setIoMsg('')
                            setIoModal('import')
                        }}
                    >
                        <Icon name="download" size={13}/> 导入
                    </button>
                    <button
                        className="btn sm"
                        title="导出数据为 SQL / CSV 文件"
                        disabled={busy || !selected}
                        onClick={() => {
                            setIoMsg('')
                            setIoModal('export')
                        }}
                    >
                        <Icon name="upload" size={13}/> 导出
                    </button>
                    <button
                        className="icon-btn"
                        title="关闭"
                        onClick={onClose}
                    >
                        <Icon name="close" size={15}/>
                    </button>
                </div>

                {selected && (
                    <div className="mysql-table-head">
                        <span className="mysql-table-name">{selected}</span>
                        <div className="segmented sm">
                            <button
                                className={view === 'data' ? 'active' : ''}
                                onClick={() => setView('data')}
                            >
                                数据
                            </button>
                            <button
                                className={view === 'struct' ? 'active' : ''}
                                onClick={() => setView('struct')}
                            >
                                结构
                            </button>
                        </div>
                        <span className="mysql-count">
                            {view === 'data'
                                ? `${rows.length} 行${newRows.length ? ` +${newRows.length} 新` : ''}`
                                : `${structData?.rowCount ?? 0} 列`}
                        </span>
                        {view === 'data' && (
                            <span className="mysql-crud-actions">
                                <button
                                    className="btn sm"
                                    disabled={busy || saving}
                                    onClick={addRow}
                                    title="新增一行"
                                >
                                    <Icon name="plus" size={13}/> 新建行
                                </button>
                                <button
                                    className="btn sm primary"
                                    disabled={busy || saving || !dirtyCount}
                                    onClick={saveAll}
                                    title="保存所有修改"
                                >
                                    {saving ? '保存中…' : `保存${dirtyCount ? ` (${dirtyCount})` : ''}`}
                                </button>
                                <button
                                    className="icon-btn"
                                    title="刷新数据"
                                    disabled={busy || saving}
                                    onClick={() => openTable(selected, page)}
                                >
                                    <Icon name="refresh" size={13}/>
                                </button>
                            </span>
                        )}
                    </div>
                )}

                {selected && view === 'data' && (
                    <div className="mysql-pager">
                        <span className="mysql-count">
                            共 {totalRows} 行 · 第 {(page - 1) * pageSize + (rows.length ? 1 : 0)}-{(page - 1) * pageSize + rows.length} 行
                        </span>
                        <span className="spacer"/>
                        <button
                            className="icon-btn"
                            title="首页"
                            disabled={busy || page <= 1}
                            onClick={() => goPage(1)}
                        >
                            <Icon name="chevrons-left" size={13}/>
                        </button>
                        <button
                            className="icon-btn"
                            title="上一页"
                            disabled={busy || page <= 1}
                            onClick={() => goPage(page - 1)}
                        >
                            <Icon name="chevron-left" size={13}/>
                        </button>
                        <span className="mysql-page-jump">
                            <input
                                key={page}
                                type="number"
                                min={1}
                                max={totalPages}
                                defaultValue={page}
                                disabled={busy}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        const v = Number((e.target as HTMLInputElement).value)
                                        if (v) goPage(v)
                                    }
                                }}
                                onBlur={(e) => {
                                    const v = Number(e.target.value)
                                    if (v && v !== page) goPage(v)
                                }}
                            />
                            <span className="mysql-page-total">/ {totalPages} 页</span>
                        </span>
                        <button
                            className="icon-btn"
                            title="下一页"
                            disabled={busy || page >= totalPages}
                            onClick={() => goPage(page + 1)}
                        >
                            <Icon name="chevron-right" size={13}/>
                        </button>
                        <button
                            className="icon-btn"
                            title="末页"
                            disabled={busy || page >= totalPages}
                            onClick={() => goPage(totalPages)}
                        >
                            <Icon name="chevrons-right" size={13}/>
                        </button>
                        <select
                            className="mysql-page-size"
                            value={pageSize}
                            disabled={busy}
                            onChange={(e) => changePageSize(Number(e.target.value))}
                        >
                            <option value={20}>20 行/页</option>
                            <option value={50}>50 行/页</option>
                            <option value={100}>100 行/页</option>
                            <option value={200}>200 行/页</option>
                            <option value={500}>500 行/页</option>
                        </select>
                    </div>
                )}

                <div className="mysql-content">
                    {!selected && (
                        <div className="mysql-empty">从左侧选择一个表查看数据，或在下方执行 SQL</div>
                    )}
                    {selected && view === 'struct' && (
                        structData ? <Grid columns={structData.columns} rows={structData.rows}/> :
                            <div className="mysql-empty">加载中…</div>
                    )}
                    {selected && view === 'data' && (
                        <div className="mysql-grid-wrap">
                            {pkCols.length === 0 && (
                                <div className="mysql-warn">
                                    该表无主键，删除/更新将按整行匹配，请谨慎操作。
                                </div>
                            )}
                            <table className="mysql-table mysql-edit-table">
                                <thead>
                                <tr>
                                    <th className="mysql-rownum">#</th>
                                    {columns.map((c) => (
                                        <th key={c}>
                                            {c}
                                            {pkCols.includes(c) && <span className="pk-badge">PK</span>}
                                        </th>
                                    ))}
                                    <th className="mysql-rowact">操作</th>
                                </tr>
                                </thead>
                                <tbody>
                                {rows.map((_, i) => (
                                    <tr key={i}>
                                        <td className="mysql-rownum">{(page - 1) * pageSize + i + 1}</td>
                                        {columns.map((c) => {
                                            const disp = cellDisplay(i, c)
                                            const isEditing = editing?.row === i && editing?.col === c
                                            const dirty = !!drafts[i]?.[c]
                                            return (
                                                <td
                                                    key={c}
                                                    className={`${dirty ? 'cell-dirty' : ''}${disp.isNull ? ' cell-null' : ''}`}
                                                    onDoubleClick={() => !isEditing && setEditing({row: i, col: c})}
                                                    title="双击编辑"
                                                >
                                                    {isEditing ? (
                                                        <CellEditorInline
                                                            value={disp.text === 'NULL' ? '' : disp.text}
                                                            isNull={disp.isNull}
                                                            onCommit={(v, n) => commitEdit(i, c, v, n)}
                                                            onCancel={() => setEditing(null)}
                                                        />
                                                    ) : disp.isNull ? (
                                                        <span className="mysql-null">NULL</span>
                                                    ) : (
                                                        String(disp.text)
                                                    )}
                                                </td>
                                            )
                                        })}
                                        <td className="mysql-rowact">
                                            <button
                                                className="icon-btn danger"
                                                title="删除该行"
                                                disabled={busy || saving}
                                                onClick={() => deleteRow(i)}
                                            >
                                                <Icon name="trash" size={13}/>
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                {newRows.map((nr, idx) => (
                                    <tr key={`new-${idx}`} className="row-new">
                                        <td className="mysql-rownum">+</td>
                                        {columns.map((c) => {
                                            const cell = nr[c] || {value: '', isNull: false}
                                            return (
                                                <td key={c} className={cell.isNull ? 'cell-null' : ''}>
                                                    <input
                                                        className="mysql-cell-input"
                                                        value={cell.isNull ? '' : cell.value}
                                                        disabled={cell.isNull}
                                                        placeholder=""
                                                        onChange={(e) => updateNewCell(idx, c, e.target.value, false)}
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter') {
                                                                const next = (e.target as HTMLInputElement)
                                                                next.blur()
                                                            }
                                                        }}
                                                    />
                                                    <button
                                                        type="button"
                                                        className={`null-toggle${cell.isNull ? ' on' : ''}`}
                                                        title="切换为 NULL"
                                                        onClick={() => updateNewCell(idx, c, cell.value, !cell.isNull)}
                                                    >
                                                        NULL
                                                    </button>
                                                </td>
                                            )
                                        })}
                                        <td className="mysql-rowact">
                                            <button
                                                className="icon-btn danger"
                                                title="移除该行"
                                                disabled={busy || saving}
                                                onClick={() => deleteNewRow(idx)}
                                            >
                                                <Icon name="trash" size={13}/>
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                {!rows.length && !newRows.length && (
                                    <tr>
                                        <td colSpan={columns.length + 2} className="mysql-empty small">
                                            无数据，可点击「新建行」插入
                                        </td>
                                    </tr>
                                )}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                <div className="mysql-sql">
                    <div className="mysql-sql-head">
                        <span>SQL 执行</span>
                        <span className="spacer"/>
                        <button
                            className="btn sm primary"
                            disabled={busy}
                            onClick={runSql}
                        >
                            执行
                        </button>
                    </div>
                    <textarea
                        className="mysql-sql-input"
                        value={sql}
                        placeholder="SELECT * FROM table LIMIT 100;"
                        spellCheck={false}
                        onChange={(e) => setSql(e.target.value)}
                        onKeyDown={(e) => {
                            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                                e.preventDefault()
                                runSql()
                            }
                        }}
                    />
                    <div className="mysql-sql-result">
                        {sqlResult && sqlResult.columns.length > 0 ? (
                            <>
                                <div className="mysql-count">{sqlResult.rowCount} 行</div>
                                <Grid columns={sqlResult.columns} rows={sqlResult.rows}/>
                            </>
                        ) : sqlResult ? (
                            <div className="mysql-empty small">影响行数：{sqlResult.affected}</div>
                        ) : (
                            <div className="mysql-empty small">执行结果将在此显示</div>
                        )}
                    </div>
                </div>
            </div>

            {ioModal && (
                <IoModal
                    kind={ioModal}
                    table={selected || ''}
                    sqlText={sql}
                    busy={ioBusy}
                    msg={ioMsg}
                    onClose={() => setIoModal(null)}
                    onExport={doExport}
                    onImport={doImport}
                />
            )}
        </div>
    )
}

// IoModal 导入/导出设置弹窗
function IoModal(props: {
    kind: 'export' | 'import'
    table: string
    sqlText: string
    busy: boolean
    msg: string
    onClose: () => void
    onExport: (o: { mode: 'sql' | 'csv'; source: 'table' | 'query'; table: string; sqlText: string; limit: number }) => void
    onImport: (o: { mode: 'sql' | 'csv'; table: string }) => void
}) {
    const { kind, table, sqlText, busy, msg, onClose, onExport, onImport } = props
    const [mode, setMode] = useState<'sql' | 'csv'>(kind === 'export' ? 'sql' : 'sql')
    const [source, setSource] = useState<'table' | 'query'>('table')
    const [tableName, setTableName] = useState(table)
    const [limit, setLimit] = useState(0)

    const canExport = source === 'table'
        ? tableName.trim() !== ''
        : sqlText.trim() !== ''
    const canImport = mode === 'sql' ? true : tableName.trim() !== ''

    return (
        <div className="modal-mask" onClick={() => !busy && onClose()}>
            <div className="modal io-modal" onClick={(e) => e.stopPropagation()}>
                <div className="modal-head">
                    <span>{kind === 'export' ? '导出数据' : '导入数据'}</span>
                    <button className="icon-btn" disabled={busy} onClick={onClose}>
                        <Icon name="close" size={14}/>
                    </button>
                </div>
                <div className="modal-body">
                    <div className="field">
                        <label>格式</label>
                        <div className="segmented sm">
                            <button className={mode === 'sql' ? 'active' : ''} onClick={() => setMode('sql')}>SQL</button>
                            <button className={mode === 'csv' ? 'active' : ''} onClick={() => setMode('csv')}>CSV</button>
                        </div>
                    </div>

                    {kind === 'export' ? (
                        <>
                            <div className="field">
                                <label>来源</label>
                                <div className="segmented sm">
                                    <button
                                        className={source === 'table' ? 'active' : ''}
                                        onClick={() => setSource('table')}
                                        disabled={!table}
                                    >当前表</button>
                                    <button
                                        className={source === 'query' ? 'active' : ''}
                                        onClick={() => setSource('query')}
                                    >查询结果</button>
                                </div>
                            </div>
                            {source === 'table' ? (
                                <div className="field">
                                    <label>表名</label>
                                    <input value={tableName} onChange={(e) => setTableName(e.target.value)} placeholder="目标表名"/>
                                </div>
                            ) : (
                                <div className="field">
                                    <label>查询语句（来自 SQL 执行框）</label>
                                    <textarea value={sqlText} readOnly rows={4} className="mysql-sql-input"/>
                                </div>
                            )}
                            <div className="field">
                                <label>限制行数（0 表示不限制）</label>
                                <input
                                    type="number"
                                    min={0}
                                    value={limit}
                                    onChange={(e) => setLimit(Number(e.target.value) || 0)}
                                />
                            </div>
                        </>
                    ) : (
                        <div className="field">
                            <label>{mode === 'sql' ? '目标数据库' : '目标表名'}（CSV 必填）</label>
                            <input
                                value={tableName}
                                onChange={(e) => setTableName(e.target.value)}
                                placeholder={mode === 'sql' ? '可选，留空使用当前库' : '导入到的表名'}
                            />
                            <p className="io-hint">
                                {mode === 'sql'
                                    ? '将逐条执行文件中的 SQL 语句（支持多语句）。'
                                    : 'CSV 首行为列名，其余为数据行，空单元格写入 NULL。'}
                            </p>
                        </div>
                    )}

                    {msg && <div className={`io-msg ${msg.startsWith('失败') || msg.startsWith('导入失败') || msg.startsWith('导出失败') ? 'err' : 'ok'}`}>{msg}</div>}
                </div>
                <div className="modal-foot">
                    <button className="btn sm" disabled={busy} onClick={onClose}>取消</button>
                    {kind === 'export' ? (
                        <button
                            className="btn sm primary"
                            disabled={busy || !canExport}
                            onClick={() => onExport({ mode, source, table: tableName.trim(), sqlText, limit })}
                        >导出</button>
                    ) : (
                        <button
                            className="btn sm primary"
                            disabled={busy || !canImport}
                            onClick={() => onImport({ mode, table: tableName.trim() })}
                        >选择文件并导入</button>
                    )}
                </div>
            </div>
        </div>
    )
}

// 单元格编辑器（双击现有单元格时弹出）
function CellEditorInline({
                              value,
                              isNull,
                              onCommit,
                              onCancel,
                          }: {
    value: string
    isNull: boolean
    onCommit: (v: string, n: boolean) => void
    onCancel: () => void
}) {
    const [txt, setTxt] = useState(isNull ? '' : value)
    const [nulled, setNulled] = useState(isNull)
    return (
        <span className="mysql-cell-edit">
            <input
                autoFocus
                className={`mysql-cell-input${nulled ? ' is-null' : ''}`}
                value={nulled ? '' : txt}
                disabled={nulled}
                onChange={(e) => setTxt(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault()
                        onCommit(txt, nulled)
                    } else if (e.key === 'Escape') {
                        e.preventDefault()
                        onCancel()
                    }
                }}
                onBlur={() => onCommit(txt, nulled)}
            />
            <button
                type="button"
                className={`null-toggle${nulled ? ' on' : ''}`}
                title="切换为 NULL"
                onClick={() => setNulled((n) => !n)}
            >
                NULL
            </button>
        </span>
    )
}
