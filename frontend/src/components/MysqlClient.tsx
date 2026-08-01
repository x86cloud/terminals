import React, {useCallback, useEffect, useMemo, useState} from 'react'
import {API} from '../api'
import Icon from './Icon'
import {errorMessage} from '../utils'
import {MysqlQueryResult, MysqlSessionInfo} from '../types'
import g from '../styles/global.module.less'
import my from '../styles/MysqlClient.module.less'

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
    if (v === null || v === undefined) return <span className={my.mysqlNull}>NULL</span>
    if (typeof v === 'object') return JSON.stringify(v)
    return String(v)
}

function Grid({columns, rows}: { columns: string[]; rows: Record<string, any>[] }) {
    if (!columns.length) {
        return <div className={my.mysqlEmpty}>无结果</div>
    }
    return (
        <div className={my.mysqlGridWrap}>
            <table className={my.mysqlTable}>
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
        <div className={my.mysqlPane}>
            <div className={my.mysqlSide}>
                <div className={my.mysqlDbHead}>
                    <Icon name="database" size={13}/>
                    <select
                        className={my.mysqlDbSelect}
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
                        className={g.iconBtn}
                        title="刷新"
                        disabled={busy}
                        onClick={() => loadDatabases()}
                    >
                        <Icon name="refresh" size={13}/>
                    </button>
                </div>
                <div className={my.mysqlTables}>
                    {tables.length === 0 && !busy && (
                        <div className={`${my.mysqlEmpty} ${my.small}`}>暂无表</div>
                    )}
                    {tables.map((t) => (
                        <button
                            key={t}
                            className={`${my.mysqlTableItem}${selected === t ? ' ' + my.active : ''}`}
                            onClick={() => openTable(t)}
                        >
                            <Icon name="table" size={13}/>
                            <span>{t}</span>
                        </button>
                    ))}
                </div>
            </div>

            <div className={my.mysqlMain}>
                <div className={my.mysqlToolbar}>
                    <span className={my.mysqlConnTitle}>
                        MySQL · {session.host}:{session.port}
                    </span>
                    <span className={g.spacer}/>
                    {error && <span className={my.mysqlError}>{error}</span>}
                    <button
                        className={`${g.btn} ${g.sm}`}
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
                        className={`${g.btn} ${g.sm}`}
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
                        className={g.iconBtn}
                        title="关闭"
                        onClick={onClose}
                    >
                        <Icon name="close" size={15}/>
                    </button>
                </div>

                {selected && (
                    <div className={my.mysqlTableHead}>
                        <span className={my.mysqlTableName}>{selected}</span>
                        <div className={`${g.segmented} ${g.sm}`}>
                            <button
                                className={view === 'data' ? g.active : ''}
                                onClick={() => setView('data')}
                            >
                                数据
                            </button>
                            <button
                                className={view === 'struct' ? g.active : ''}
                                onClick={() => setView('struct')}
                            >
                                结构
                            </button>
                        </div>
                        <span className={my.mysqlCount}>
                            {view === 'data'
                                ? `${rows.length} 行${newRows.length ? ` +${newRows.length} 新` : ''}`
                                : `${structData?.rowCount ?? 0} 列`}
                        </span>
                        {view === 'data' && (
                            <span className={my.mysqlCrudActions}>
                                <button
                                    className={`${g.btn} ${g.sm}`}
                                    disabled={busy || saving}
                                    onClick={addRow}
                                    title="新增一行"
                                >
                                    <Icon name="plus" size={13}/> 新建行
                                </button>
                                <button
                                    className={`${g.btn} ${g.sm} ${g.primary}`}
                                    disabled={busy || saving || !dirtyCount}
                                    onClick={saveAll}
                                    title="保存所有修改"
                                >
                                    {saving ? '保存中…' : `保存${dirtyCount ? ` (${dirtyCount})` : ''}`}
                                </button>
                                <button
                                    className={g.iconBtn}
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
                    <div className={my.mysqlPager}>
                        <span className={my.mysqlCount}>
                            共 {totalRows} 行 · 第 {(page - 1) * pageSize + (rows.length ? 1 : 0)}-{(page - 1) * pageSize + rows.length} 行
                        </span>
                        <span className={g.spacer}/>
                        <button
                            className={g.iconBtn}
                            title="首页"
                            disabled={busy || page <= 1}
                            onClick={() => goPage(1)}
                        >
                            <Icon name="chevrons-left" size={13}/>
                        </button>
                        <button
                            className={g.iconBtn}
                            title="上一页"
                            disabled={busy || page <= 1}
                            onClick={() => goPage(page - 1)}
                        >
                            <Icon name="chevron-left" size={13}/>
                        </button>
                        <span className={my.mysqlPageJump}>
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
                            <span className={my.mysqlPageTotal}>/ {totalPages} 页</span>
                        </span>
                        <button
                            className={g.iconBtn}
                            title="下一页"
                            disabled={busy || page >= totalPages}
                            onClick={() => goPage(page + 1)}
                        >
                            <Icon name="chevron-right" size={13}/>
                        </button>
                        <button
                            className={g.iconBtn}
                            title="末页"
                            disabled={busy || page >= totalPages}
                            onClick={() => goPage(totalPages)}
                        >
                            <Icon name="chevrons-right" size={13}/>
                        </button>
                        <select
                            className={my.mysqlPageSize}
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

                <div className={my.mysqlContent}>
                    {!selected && (
                        <div className={my.mysqlEmpty}>从左侧选择一个表查看数据，或在下方执行 SQL</div>
                    )}
                    {selected && view === 'struct' && (
                        structData ? <Grid columns={structData.columns} rows={structData.rows}/> :
                            <div className={my.mysqlEmpty}>加载中…</div>
                    )}
                    {selected && view === 'data' && (
                        <div className={my.mysqlGridWrap}>
                            {pkCols.length === 0 && (
                                <div className={my.mysqlWarn}>
                                    该表无主键，删除/更新将按整行匹配，请谨慎操作。
                                </div>
                            )}
                            <table className={`${my.mysqlTable} ${my.mysqlEditTable}`}>
                                <thead>
                                <tr>
                                    <th className={my.mysqlRownum}>#</th>
                                    {columns.map((c) => (
                                        <th key={c}>
                                            {c}
                                            {pkCols.includes(c) && <span className={my.pkBadge}>PK</span>}
                                        </th>
                                    ))}
                                    <th className={my.mysqlRowact}>操作</th>
                                </tr>
                                </thead>
                                <tbody>
                                {rows.map((_, i) => (
                                    <tr key={i}>
                                        <td className={my.mysqlRownum}>{(page - 1) * pageSize + i + 1}</td>
                                        {columns.map((c) => {
                                            const disp = cellDisplay(i, c)
                                            const isEditing = editing?.row === i && editing?.col === c
                                            const dirty = !!drafts[i]?.[c]
                                            return (
                                                <td
                                                    key={c}
                                                    className={`${dirty ? my.cellDirty : ''}${disp.isNull ? ' ' + my.cellNull : ''}`}
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
                                                        <span className={my.mysqlNull}>NULL</span>
                                                    ) : (
                                                        String(disp.text)
                                                    )}
                                                </td>
                                            )
                                        })}
                                        <td className={my.mysqlRowact}>
                                            <button
                                                className={`${g.iconBtn} ${g.danger}`}
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
                                    <tr key={`new-${idx}`} className={my.rowNew}>
                                        <td className={my.mysqlRownum}>+</td>
                                        {columns.map((c) => {
                                            const cell = nr[c] || {value: '', isNull: false}
                                            return (
                                                <td key={c} className={cell.isNull ? my.cellNull : ''}>
                                                    <input
                                                        className={my.mysqlCellInput}
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
                                                        className={`${my.nullToggle}${cell.isNull ? ' ' + my.on : ''}`}
                                                        title="切换为 NULL"
                                                        onClick={() => updateNewCell(idx, c, cell.value, !cell.isNull)}
                                                    >
                                                        NULL
                                                    </button>
                                                </td>
                                            )
                                        })}
                                        <td className={my.mysqlRowact}>
                                            <button
                                                className={`${g.iconBtn} ${g.danger}`}
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
                                        <td colSpan={columns.length + 2} className={`${my.mysqlEmpty} ${my.small}`}>
                                            无数据，可点击「新建行」插入
                                        </td>
                                    </tr>
                                )}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                <div className={my.mysqlSql}>
                    <div className={my.mysqlSqlHead}>
                        <span>SQL 执行</span>
                        <span className={g.spacer}/>
                        <button
                            className={`${g.btn} ${g.sm} ${g.primary}`}
                            disabled={busy}
                            onClick={runSql}
                        >
                            执行
                        </button>
                    </div>
                    <textarea
                        className={my.mysqlSqlInput}
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
                    <div className={my.mysqlSqlResult}>
                        {sqlResult && sqlResult.columns.length > 0 ? (
                            <>
                                <div className={my.mysqlCount}>{sqlResult.rowCount} 行</div>
                                <Grid columns={sqlResult.columns} rows={sqlResult.rows}/>
                            </>
                        ) : sqlResult ? (
                            <div className={`${my.mysqlEmpty} ${my.small}`}>影响行数：{sqlResult.affected}</div>
                        ) : (
                            <div className={`${my.mysqlEmpty} ${my.small}`}>执行结果将在此显示</div>
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
        <div className={g.modalMask} onClick={() => !busy && onClose()}>
            <div className={`${g.modal} ${g.ioModal}`} onClick={(e) => e.stopPropagation()}>
                <div className={g.modalHead}>
                    <span>{kind === 'export' ? '导出数据' : '导入数据'}</span>
                    <button className={g.iconBtn} disabled={busy} onClick={onClose}>
                        <Icon name="close" size={14}/>
                    </button>
                </div>
                <div className={g.modalBody}>
                    <div className={g.field}>
                        <label>格式</label>
                        <div className={`${g.segmented} ${g.sm}`}>
                            <button className={mode === 'sql' ? g.active : ''} onClick={() => setMode('sql')}>SQL</button>
                            <button className={mode === 'csv' ? g.active : ''} onClick={() => setMode('csv')}>CSV</button>
                        </div>
                    </div>

                    {kind === 'export' ? (
                        <>
                            <div className={g.field}>
                                <label>来源</label>
                                <div className={`${g.segmented} ${g.sm}`}>
                                    <button
                                        className={source === 'table' ? g.active : ''}
                                        onClick={() => setSource('table')}
                                        disabled={!table}
                                    >当前表</button>
                                    <button
                                        className={source === 'query' ? g.active : ''}
                                        onClick={() => setSource('query')}
                                    >查询结果</button>
                                </div>
                            </div>
                            {source === 'table' ? (
                                <div className={g.field}>
                                    <label>表名</label>
                                    <input value={tableName} onChange={(e) => setTableName(e.target.value)} placeholder="目标表名"/>
                                </div>
                            ) : (
                                <div className={g.field}>
                                    <label>查询语句（来自 SQL 执行框）</label>
                                    <textarea value={sqlText} readOnly rows={4} className={my.mysqlSqlInput}/>
                                </div>
                            )}
                            <div className={g.field}>
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
                        <div className={g.field}>
                            <label>{mode === 'sql' ? '目标数据库' : '目标表名'}（CSV 必填）</label>
                            <input
                                value={tableName}
                                onChange={(e) => setTableName(e.target.value)}
                                placeholder={mode === 'sql' ? '可选，留空使用当前库' : '导入到的表名'}
                            />
                            <p className={g.ioHint}>
                                {mode === 'sql'
                                    ? '将逐条执行文件中的 SQL 语句（支持多语句）。'
                                    : 'CSV 首行为列名，其余为数据行，空单元格写入 NULL。'}
                            </p>
                        </div>
                    )}

                    {msg && <div className={`${g.ioMsg} ${msg.startsWith('失败') || msg.startsWith('导入失败') || msg.startsWith('导出失败') ? g.err : g.ok}`}>{msg}</div>}
                </div>
                <div className={g.modalFoot}>
                    <button className={`${g.btn} ${g.sm}`} disabled={busy} onClick={onClose}>取消</button>
                    {kind === 'export' ? (
                        <button
                            className={`${g.btn} ${g.sm} ${g.primary}`}
                            disabled={busy || !canExport}
                            onClick={() => onExport({ mode, source, table: tableName.trim(), sqlText, limit })}
                        >导出</button>
                    ) : (
                        <button
                            className={`${g.btn} ${g.sm} ${g.primary}`}
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
        <span className={my.mysqlCellEdit}>
            <input
                autoFocus
                className={`${my.mysqlCellInput}${nulled ? ' ' + my.isNull : ''}`}
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
                className={`${my.nullToggle}${nulled ? ' ' + my.on : ''}`}
                title="切换为 NULL"
                onClick={() => setNulled((n) => !n)}
            >
                NULL
            </button>
        </span>
    )
}
