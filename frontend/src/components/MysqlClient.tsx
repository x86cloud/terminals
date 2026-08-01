import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react'
import CodeMirror from '@uiw/react-codemirror'
import {sql, SQLDialect} from '@codemirror/lang-sql'
import {API} from '../api'
import {lightEditorTheme} from './editorTheme'
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

type TabKey = 'data' | 'sql' | 'structure' | 'users' | 'status' | 'er'

interface SqlTab {
    id: string
    title: string
    content: string
    result: MysqlQueryResult | null
    error: string
    history: { sql: string; at: number }[]
}

interface CellEdit {
    value: string
    isNull: boolean
}

type RowDrafts = Record<number, Record<string, CellEdit>>
type NewRow = Record<string, CellEdit>

const mysqlDialect = SQLDialect.define({
    keywords: 'select from where insert into values update set delete create table drop alter index database use show describe join left right inner outer on group order by limit and or not null as distinct count sum avg max min between like in is primary key unique foreign references',
})

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

let tabSeq = 0
const newTab = (): SqlTab => ({
    id: `sql-${++tabSeq}`,
    title: `查询 ${tabSeq}`,
    content: '',
    result: null,
    error: '',
    history: [],
})

export default function MysqlClient({session, onClose, onChange}: Props) {
    const [databases, setDatabases] = useState<string[]>([])
    const [db, setDb] = useState<string>(session.database || '')
    const [tables, setTables] = useState<string[]>([])
    const [selected, setSelected] = useState<string | null>(null)
    const [dataView, setDataView] = useState<'data' | 'struct' | 'index'>('data')
    const [tab, setTab] = useState<TabKey>('data')
    const [tableData, setTableData] = useState<MysqlQueryResult | null>(null)
    const [structData, setStructData] = useState<MysqlQueryResult | null>(null)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')
    const [saving, setSaving] = useState(false)

    // 数据库对象管理弹窗
    const [objModal, setObjModal] = useState<null | 'createdb' | 'createtable' | 'dropdb' | 'droptable' | 'truncate' | 'createindex' | 'dropindex'>(null)
    const [objName, setObjName] = useState('')
    const [objExtra, setObjExtra] = useState('')
    const [objUnique, setObjUnique] = useState(false)
    const [objBusy, setObjBusy] = useState(false)
    const [objMsg, setObjMsg] = useState('')

    // 行数据（查）与编辑态（改/增）
    const [rows, setRows] = useState<Record<string, any>[]>([])
    const [drafts, setDrafts] = useState<RowDrafts>({})
    const [newRows, setNewRows] = useState<NewRow[]>([])
    const [editing, setEditing] = useState<{ row: number; col: string } | null>(null)

    // 分页状态
    const [page, setPage] = useState(1)
    const [pageSize, setPageSize] = useState(50)
    const [totalRows, setTotalRows] = useState(0)

    // SQL 多标签编辑
    const [sqlTabs, setSqlTabs] = useState<SqlTab[]>(() => [newTab()])
    const [activeSqlTab, setActiveSqlTab] = useState<string>(sqlTabs[0].id)

    // 结构/索引
    const [indexData, setIndexData] = useState<Record<string, any>[]>([])
    const [tableStatus, setTableStatus] = useState<Record<string, any>[]>([])

    // 用户权限
    const [users, setUsers] = useState<Record<string, any>[]>([])
    const [selUser, setSelUser] = useState<{ user: string; host: string } | null>(null)
    const [grants, setGrants] = useState('')

    // 服务器状态监控
    const [status, setStatus] = useState<Record<string, any>>({})
    const [variables, setVariables] = useState<Record<string, any>>({})
    const [processList, setProcessList] = useState<Record<string, any>[]>([])
    const [slowLog, setSlowLog] = useState<Record<string, any>[]>([])

    // 导入/导出弹窗
    const [ioModal, setIoModal] = useState<null | 'export' | 'import'>(null)
    const [ioBusy, setIoBusy] = useState(false)
    const [ioMsg, setIoMsg] = useState<string>('')

    // ER 图
    const [schema, setSchema] = useState<{ tables: any[]; foreignKeys: any[] }>({tables: [], foreignKeys: []})
    const [erZoom, setErZoom] = useState(1)

    const columns = tableData?.columns ?? []
    const pkCols = useMemo(() => {
        if (!structData) return []
        return structData.rows
            .filter((r) => r['Key'] === 'PRI')
            .map((r) => r['Field'] as string)
    }, [structData])

    const activeTabObj = sqlTabs.find((t) => t.id === activeSqlTab) || sqlTabs[0]

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
        setDataView('data')
        setTab('data')
        setBusy(true)
        setError('')
        setDrafts({})
        setNewRows([])
        setEditing(null)
        try {
            const [data, struct, cnt, idx, ts] = await Promise.all([
                API.mysqlSelect(session.id, db, table, ps, (toPage - 1) * ps),
                API.mysqlDescribe(session.id, db, table),
                API.mysqlCount(session.id, db, table),
                API.mysqlIndexes(session.id, db, table),
                API.mysqlTableStatus(session.id, db),
            ])
            if (data.rows.length === 0 && toPage > 1) {
                setBusy(false)
                await openTable(table, toPage - 1, ps)
                return
            }
            setTableData(data)
            setStructData(struct)
            setRows(data.rows)
            setTotalRows(cnt)
            setIndexData(idx)
            setTableStatus(ts)
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

    /* ----------------- SQL 编辑器（多标签 + 历史） ----------------- */

    const updateActiveTab = (patch: Partial<SqlTab>) => {
        setSqlTabs((prev) => prev.map((t) => (t.id === activeSqlTab ? {...t, ...patch} : t)))
    }

    const runSqlTab = async () => {
        const stmt = activeTabObj.content.trim()
        if (!stmt) {
            updateActiveTab({error: '请输入要执行的 SQL'})
            return
        }
        setBusy(true)
        setError('')
        try {
            const res = await API.mysqlRun(session.id, db, stmt)
            const history = [{sql: stmt, at: Date.now()}, ...activeTabObj.history].slice(0, 50)
            updateActiveTab({result: res, error: '', history})
            // 若切换了数据库（USE xxx）则刷新左侧列表
            if (/^\s*use\s+/i.test(stmt)) {
                await loadDatabases()
            }
        } catch (e) {
            updateActiveTab({error: errorMessage(e), result: null})
            setError(errorMessage(e))
        } finally {
            setBusy(false)
        }
    }

    const addSqlTab = () => {
        const t = newTab()
        setSqlTabs((prev) => [...prev, t])
        setActiveSqlTab(t.id)
    }

    const closeSqlTab = (id: string) => {
        setSqlTabs((prev) => {
            const next = prev.filter((t) => t.id !== id)
            if (id === activeSqlTab && next.length) setActiveSqlTab(next[next.length - 1].id)
            return next.length ? next : [newTab()]
        })
    }

    const loadHistoryIntoTab = (hsql: string) => {
        updateActiveTab({content: hsql})
    }

    /* ----------------- 改 / 增 / 删 ----------------- */

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

    const dirtyCount = Object.keys(drafts).length + newRows.length

    /* ----------------- 数据库对象管理 ----------------- */

    const doObjAction = async () => {
        setObjBusy(true)
        setObjMsg('')
        try {
            switch (objModal) {
                case 'createdb':
                    await API.mysqlCreateDatabase(session.id, objName, objExtra || 'utf8mb4')
                    setObjMsg(`已创建数据库 ${objName}`)
                    await loadDatabases()
                    break
                case 'dropdb':
                    if (!window.confirm(`确认删除数据库 ${objName}？该操作不可恢复！`)) return
                    await API.mysqlDropDatabase(session.id, objName)
                    setObjMsg(`已删除数据库 ${objName}`)
                    await loadDatabases()
                    break
                case 'createtable':
                    await API.mysqlCreateTable(session.id, db, objName, objExtra)
                    setObjMsg(`已创建表 ${objName}`)
                    await loadTables(db)
                    break
                case 'droptable':
                    if (!window.confirm(`确认删除表 ${objName}？`)) return
                    await API.mysqlDropTable(session.id, db, objName)
                    setObjMsg(`已删除表 ${objName}`)
                    await loadTables(db)
                    if (selected === objName) setSelected(null)
                    break
                case 'truncate':
                    if (!window.confirm(`确认清空表 ${objName} 的所有数据？`)) return
                    await API.mysqlTruncateTable(session.id, db, objName)
                    setObjMsg(`已清空表 ${objName}`)
                    if (selected === objName) await openTable(objName, 1)
                    break
                case 'createindex':
                    await API.mysqlCreateIndex(session.id, db, selected || objName, objName, objExtra, objUnique)
                    setObjMsg(`已创建索引 ${objName}`)
                    if (selected) setIndexData(await API.mysqlIndexes(session.id, db, selected))
                    break
                case 'dropindex':
                    await API.mysqlDropIndex(session.id, db, selected || objName, objName)
                    setObjMsg(`已删除索引 ${objName}`)
                    if (selected) setIndexData(await API.mysqlIndexes(session.id, db, selected))
                    break
            }
            setTimeout(() => setObjModal(null), 700)
        } catch (e) {
            setObjMsg(errorMessage(e))
        } finally {
            setObjBusy(false)
        }
    }

    /* ----------------- 用户权限 ----------------- */

    const loadUsers = useCallback(async () => {
        try {
            const list = await API.mysqlUsers(session.id)
            setUsers(list)
        } catch (e) {
            setError(errorMessage(e))
        }
    }, [session.id])

    useEffect(() => {
        if (tab === 'users') loadUsers()
    }, [tab, loadUsers])

    const viewGrants = async (user: string, host: string) => {
        setSelUser({user, host})
        try {
            const gr = await API.mysqlGrants(session.id, user, host)
            setGrants(gr)
        } catch (e) {
            setGrants('查询失败：' + errorMessage(e))
        }
    }

    /* ----------------- 服务器状态监控 ----------------- */

    const loadStatus = useCallback(async () => {
        setBusy(true)
        try {
            const [st, va, pl, sl] = await Promise.all([
                API.mysqlStatus(session.id),
                API.mysqlVariables(session.id),
                API.mysqlProcessList(session.id),
                API.mysqlSlowLog(session.id, 50),
            ])
            setStatus(st)
            setVariables(va)
            setProcessList(pl)
            setSlowLog(sl)
        } catch (e) {
            setError(errorMessage(e))
        } finally {
            setBusy(false)
        }
    }, [session.id])

    useEffect(() => {
        if (tab === 'status') loadStatus()
    }, [tab, loadStatus])

    /* ----------------- ER 图 ----------------- */

    const loadSchema = useCallback(async () => {
        if (!db) return
        setBusy(true)
        try {
            const s = await API.mysqlSchema(session.id, db)
            setSchema({
                tables: (s.tables as any[]) || [],
                foreignKeys: (s.foreignKeys as any[]) || [],
            })
        } catch (e) {
            setError(errorMessage(e))
        } finally {
            setBusy(false)
        }
    }, [session.id, db])

    useEffect(() => {
        if (tab === 'er' && db) loadSchema()
    }, [tab, db, loadSchema])

    /* ----------------- 导入/导出 ----------------- */

    const doExport = useCallback(async (opts: {
        mode: 'sql' | 'csv' | 'json'
        source: 'table' | 'query'
        table: string
        sqlText: string
        limit: number
    }) => {
        try {
            setIoBusy(true)
            setIoMsg('')
            const filePath = await API.mysqlExportToFileEx(
                session.id, db, opts.mode, opts.source, opts.table, opts.sqlText, opts.limit
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

    const doImport = useCallback(async (opts: {
        mode: 'sql' | 'csv' | 'json'
        table: string
    }) => {
        try {
            setIoBusy(true)
            setIoMsg('')
            const msg = await API.mysqlImportFromFileEx(session.id, db, opts.mode, opts.table)
            if (!msg) return
            setIoMsg(msg)
            if (selected && (opts.mode === 'sql' || opts.table === selected)) {
                await openTable(selected)
            }
            await loadTables(db)
            onChange(session.id, db)
        } catch (e) {
            setIoMsg('导入失败：' + errorMessage(e))
        } finally {
            setIoBusy(false)
        }
    }, [session.id, db, selected, onChange, loadTables, openTable])

    /* ----------------- ER 图布局（简单网格 + 外键连线） ----------------- */

    const ER = useMemo(() => {
        const colH = 20
        const gapX = 40
        const gapY = 36
        const charW = 7.5
        const padW = 20
        // 根据最长文本行（表名或列定义）动态计算表格宽度，避免文字被截断
        let maxLineLen = 0
        schema.tables.forEach((t) => {
            maxLineLen = Math.max(maxLineLen, String(t.name).length)
            t.columns.forEach((c: any) => {
                const label = `${c.key === 'PRI' ? '🔑 ' : ''}${c.name} ${c.type}`
                maxLineLen = Math.max(maxLineLen, label.length)
            })
        })
        const tblW = Math.max(160, maxLineLen * charW + padW)
        const positions: Record<string, { x: number; y: number; h: number }> = {}
        let x = 0
        let y = 0
        let rowBottom = 0
        let contentRight = 0
        let contentBottom = 0
        schema.tables.forEach((t, i) => {
            // 表头 22 + 首列偏移 14 + 行高 * 列数 + 底部留白 10
            const h = 22 + 14 + t.columns.length * colH + 10
            positions[t.name] = {x, y, h}
            rowBottom = Math.max(rowBottom, y + h)
            contentRight = Math.max(contentRight, x + tblW)
            contentBottom = Math.max(contentBottom, y + h)
            x += tblW + gapX
            if ((i + 1) % 4 === 0) {
                x = 0
                y = rowBottom + gapY
                rowBottom = 0
            }
        })
        const svgW = Math.max(400, contentRight + gapX)
        const svgH = Math.max(200, contentBottom + gapY)
        return {positions, svgW, svgH, tblW}
    }, [schema])

    const tabs: { key: TabKey; label: string }[] = [
        {key: 'data', label: '数据 / 结构'},
        {key: 'sql', label: 'SQL 编辑器'},
        {key: 'users', label: '用户权限'},
        {key: 'status', label: '状态监控'},
        {key: 'er', label: 'ER 图'},
    ]

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
                    <button className={g.iconBtn} title="刷新" disabled={busy} onClick={() => loadDatabases()}>
                        <Icon name="refresh" size={13}/>
                    </button>
                </div>
                <div className={my.mysqlDbActions}>
                    <button className={`${g.btn} ${g.xs}`} onClick={() => { setObjName(''); setObjExtra(''); setObjMsg(''); setObjModal('createdb') }}>
                        <Icon name="plus" size={12}/> 建库
                    </button>
                    <button className={`${g.btn} ${g.xs}`} onClick={() => { setObjName(''); setObjExtra('`id` INT PRIMARY KEY AUTO_INCREMENT, `name` VARCHAR(64)'); setObjMsg(''); setObjModal('createtable') }}>
                        <Icon name="table" size={12}/> 建表
                    </button>
                </div>
                <div className={my.mysqlTables}>
                    {tables.length === 0 && !busy && (
                        <div className={`${my.mysqlEmpty} ${my.small}`}>暂无表</div>
                    )}
                    {tables.map((t) => (
                        <div key={t} className={my.mysqlTableRow}>
                            <button
                                className={`${my.mysqlTableItem}${selected === t ? ' ' + my.active : ''}`}
                                onClick={() => openTable(t)}
                            >
                                <Icon name="table" size={13}/>
                                <span>{t}</span>
                            </button>
                            <div className={my.mysqlTableMenu}>
                                <button className={g.iconBtn} title="清空" onClick={() => { setObjName(t); setObjModal('truncate') }}>
                                    <Icon name="trash" size={12}/>
                                </button>
                                <button className={g.iconBtn} title="删除表" onClick={() => { setObjName(t); setObjModal('droptable') }}>
                                    <Icon name="close" size={12}/>
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <div className={my.mysqlMain}>
                <div className={my.mysqlToolbar}>
                    <span className={my.mysqlConnTitle}>MySQL · {session.host}:{session.port}</span>
                    <span className={g.spacer}/>
                    {error && <span className={my.mysqlError}>{error}</span>}
                    <button className={`${g.btn} ${g.sm}`} title="导入 SQL/CSV/JSON" disabled={busy} onClick={() => { setIoMsg(''); setIoModal('import') }}>
                        <Icon name="download" size={13}/> 导入
                    </button>
                    <button className={`${g.btn} ${g.sm}`} title="导出 SQL/CSV/JSON" disabled={busy || !selected} onClick={() => { setIoMsg(''); setIoModal('export') }}>
                        <Icon name="upload" size={13}/> 导出
                    </button>
                    <button className={`${g.btn} ${g.sm}`} title="整库备份（SQL）" disabled={busy || !db} onClick={async () => {
                        try {
                            setBusy(true)
                            const sqlText = await API.mysqlBackup(session.id, db)
                            const path = await API.mysqlExportToFileEx(session.id, db, 'sql', 'table', db, sqlText, 0)
                            if (path) notify(`已备份到：${path}`)
                        } catch (e) { setError(errorMessage(e)) } finally { setBusy(false) }
                    }}>
                        <Icon name="copy" size={13}/> 备份
                    </button>
                    <button className={g.iconBtn} title="关闭" onClick={onClose}>
                        <Icon name="close" size={15}/>
                    </button>
                </div>

                <div className={my.mysqlTabs}>
                    {tabs.map((t) => (
                        <button
                            key={t.key}
                            className={`${my.mysqlTab}${tab === t.key ? ' ' + my.active : ''}`}
                            onClick={() => setTab(t.key)}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>

                <div className={my.mysqlContent}>
                    {tab === 'data' && (
                        <DataTab
                            busy={busy}
                            selected={selected}
                            dataView={dataView}
                            setDataView={setDataView}
                            columns={columns}
                            structData={structData}
                            pkCols={pkCols}
                            rows={rows}
                            newRows={newRows}
                            drafts={drafts}
                            editing={editing}
                            page={page}
                            pageSize={pageSize}
                            totalRows={totalRows}
                            totalPages={totalPages}
                            indexData={indexData}
                            tableStatus={tableStatus}
                            onOpenTable={openTable}
                            onCloseTable={() => setSelected(null)}
                            onAddRow={addRow}
                            onDeleteRow={deleteRow}
                            onSaveAll={saveAll}
                            onCommitEdit={commitEdit}
                            onUpdateNewCell={updateNewCell}
                            onDeleteNewRow={deleteNewRow}
                            onCellDisplay={cellDisplay}
                            onSetEditing={setEditing}
                            saving={saving}
                            dirtyCount={dirtyCount}
                            onGoPage={goPage}
                            onChangePageSize={changePageSize}
                            onAddIndex={() => { setObjName(''); setObjExtra(''); setObjUnique(false); setObjMsg(''); setObjModal('createindex') }}
                            onDropIndex={(name: string) => { setObjName(name); setObjModal('dropindex') }}
                        />
                    )}

                    {tab === 'sql' && (
                        <div className={my.sqlWrap}>
                            <div className={my.sqlTabBar}>
                                {sqlTabs.map((t) => (
                                    <div
                                        key={t.id}
                                        className={`${my.sqlTab}${t.id === activeSqlTab ? ' ' + my.active : ''}`}
                                        onClick={() => setActiveSqlTab(t.id)}
                                    >
                                        <span>{t.title}</span>
                                        {sqlTabs.length > 1 && (
                                            <button className={my.sqlTabClose} onClick={(e) => { e.stopPropagation(); closeSqlTab(t.id) }}>
                                                <Icon name="close" size={11}/>
                                            </button>
                                        )}
                                    </div>
                                ))}
                                <button className={my.sqlTabAdd} onClick={addSqlTab} title="新建查询标签">
                                    <Icon name="plus" size={12}/>
                                </button>
                            </div>
                            <CodeMirror
                                value={activeTabObj.content}
                                height="180px"
                                theme={lightEditorTheme}
                                extensions={[sql({dialect: mysqlDialect})]}
                                onChange={(val) => updateActiveTab({content: val})}
                                onKeyDown={(e) => {
                                    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                                        e.preventDefault()
                                        runSqlTab()
                                    }
                                }}
                            />
                            <div className={my.sqlRunBar}>
                                <button className={`${g.btn} ${g.sm} ${g.primary}`} disabled={busy} onClick={runSqlTab}>
                                    执行 (Ctrl+Enter)
                                </button>
                                <span className={my.mysqlCount}>库：{db || '（未选）'}</span>
                                {activeTabObj.error && <span className={my.mysqlError}>{activeTabObj.error}</span>}
                            </div>
                            <div className={my.sqlResultArea}>
                                {activeTabObj.result && activeTabObj.result.columns.length > 0 ? (
                                    <>
                                        <div className={my.mysqlCount}>{activeTabObj.result.rowCount} 行</div>
                                        <Grid columns={activeTabObj.result.columns} rows={activeTabObj.result.rows}/>
                                    </>
                                ) : activeTabObj.result ? (
                                    <div className={`${my.mysqlEmpty} ${my.small}`}>影响行数：{activeTabObj.result.affected}</div>
                                ) : activeTabObj.error ? (
                                    <div className={`${my.mysqlEmpty} ${my.small}`}>{activeTabObj.error}</div>
                                ) : (
                                    <div className={`${my.mysqlEmpty} ${my.small}`}>执行结果将在此显示</div>
                                )}
                            </div>
                            <div className={my.sqlHistory}>
                                <div className={my.sqlHistoryHead}>查询历史（{activeTabObj.history.length}）</div>
                                {activeTabObj.history.length === 0 ? (
                                    <div className={`${my.mysqlEmpty} ${my.small}`}>暂无历史</div>
                                ) : (
                                    activeTabObj.history.map((h, i) => (
                                        <button key={i} className={my.sqlHistoryItem} title="点击载入到编辑器" onClick={() => loadHistoryIntoTab(h.sql)}>
                                            <span className={my.sqlHistoryTime}>{new Date(h.at).toLocaleTimeString()}</span>
                                            <code>{h.sql.slice(0, 80)}</code>
                                        </button>
                                    ))
                                )}
                            </div>
                        </div>
                    )}

                    {tab === 'users' && (
                        <div className={my.mgmtWrap}>
                            <div className={my.mgmtHead}>用户与权限</div>
                            <div className={my.mgmtBody}>
                                <div className={my.userList}>
                                    {users.length === 0 && <div className={`${my.mysqlEmpty} ${my.small}`}>暂无用户（需 mysql 库权限）</div>}
                                    {users.map((u, i) => (
                                        <button
                                            key={i}
                                            className={`${my.userItem}${selUser?.user === u.User && selUser?.host === u.Host ? ' ' + my.active : ''}`}
                                            onClick={() => viewGrants(u.User, u.Host)}
                                        >
                                            <Icon name="server" size={13}/>
                                            <span>{u.User}</span>
                                            <span className={my.userHost}>@{u.Host}</span>
                                            {u.locked === 'Y' && <span className={my.lockBadge}>锁</span>}
                                        </button>
                                    ))}
                                </div>
                                <div className={my.grantsBox}>
                                    {selUser ? (
                                        <>
                                            <div className={my.grantsHead}>{selUser.user}@{selUser.host} 的权限</div>
                                            <pre className={my.grantsPre}>{grants || '加载中…'}</pre>
                                        </>
                                    ) : (
                                        <div className={`${my.mysqlEmpty} ${my.small}`}>选择左侧用户查看权限</div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {tab === 'status' && (
                        <div className={my.mgmtWrap}>
                            <div className={my.mgmtHead}>
                                服务器状态监控
                                <span className={g.spacer}/>
                                <button className={`${g.btn} ${g.xs}`} onClick={loadStatus} disabled={busy}>刷新</button>
                            </div>
                            <div className={my.statusGrid}>
                                <StatusCard title="连接数 (Threads)" value={status['Threads_connected']}/>
                                <StatusCard title="运行查询 (Running)" value={status['Threads_running']}/>
                                <StatusCard title="慢查询数" value={status['Slow_queries']}/>
                                <StatusCard title="QPS (Questions)" value={status['Questions']}/>
                                <StatusCard title="查询缓存命中" value={status['Qcache_hits']}/>
                                <StatusCard title="表锁等待" value={status['Table_locks_waited']}/>
                            </div>
                            <div className={my.statusSection}>当前进程 (SHOW PROCESSLIST)</div>
                            <Grid columns={['Id', 'User', 'Host', 'db', 'Command', 'Time', 'State', 'Info']}
                                  rows={processList.map((p) => ({
                                      Id: p['Id'], User: p['User'], Host: p['Host'], db: p['db'],
                                      Command: p['Command'], Time: p['Time'], State: p['State'], Info: p['Info'],
                                  }))}/>
                            <div className={my.statusSection}>慢查询日志</div>
                            <Grid columns={['start_time', 'user_host', 'query_time', 'lock_time', 'rows_examined', 'sql_text']}
                                  rows={slowLog.map((s) => ({
                                      start_time: s['start_time'], user_host: s['user_host'], query_time: s['query_time'],
                                      lock_time: s['lock_time'], rows_examined: s['rows_examined'], sql_text: s['sql_text'],
                                  }))}/>
                            <div className={my.statusSection}>关键变量</div>
                            <Grid columns={['Variable_name', 'Value']}
                                  rows={Object.entries(variables).filter(([k]) =>
                                      /(max_connections|character_set_server|version|innodb_buffer_pool_size|slow_query_log|long_query_time)/i.test(k)
                                  ).map(([k, v]) => ({Variable_name: k, Value: v}))}/>
                        </div>
                    )}

                    {tab === 'er' && (
                        <div className={my.erWrap}>
                            <div className={my.erToolBar}>
                                <button className={my.erZoomBtn} title="缩小"
                                        onClick={() => setErZoom(z => Math.max(0.3, +(z - 0.1).toFixed(2)))}>−</button>
                                <span className={my.erZoomVal}>{Math.round(erZoom * 100)}%</span>
                                <button className={my.erZoomBtn} title="放大"
                                        onClick={() => setErZoom(z => Math.min(3, +(z + 0.1).toFixed(2)))}>+</button>
                                <button className={my.erZoomBtn} title="重置缩放" onClick={() => setErZoom(1)}>⤢</button>
                                <span className={g.spacer}/>
                                <span className={my.erHint}>缩放后可拖动滚动条查看细节</span>
                            </div>
                            {schema.tables.length === 0 ? (
                                <div className={`${my.mysqlEmpty}`}>{busy ? '加载中…' : '该数据库暂无表'}</div>
                            ) : (
                                <div className={my.erCanvas}>
                                    <svg
                                        className={my.erSvg}
                                        viewBox={`0 0 ${ER.svgW / erZoom} ${ER.svgH / erZoom}`}
                                        preserveAspectRatio="xMidYMid meet">
                                        {schema.foreignKeys.map((fk, i) => {
                                            const from = ER.positions[fk.fromTable]
                                            const to = ER.positions[fk.toTable]
                                            if (!from || !to) return null
                                            const x1 = from.x + ER.tblW
                                            const y1 = from.y + (from.h / 2)
                                            const x2 = to.x
                                            const y2 = to.y + (to.h / 2)
                                            return (
                                                <path key={i} d={`M ${x1} ${y1} C ${(x1 + x2) / 2} ${y1}, ${(x1 + x2) / 2} ${y2}, ${x2} ${y2}`}
                                                      stroke="#5b9bff" strokeWidth={1.5} fill="none" opacity={0.7}/>
                                            )
                                        })}
                                        {schema.tables.map((t) => {
                                            const pos = ER.positions[t.name]
                                            if (!pos) return null
                                            return (
                                                <g key={t.name} transform={`translate(${pos.x}, ${pos.y})`}>
                                                    <rect width={ER.tblW} height={pos.h} rx={5} className={my.erTable}/>
                                                    <rect width={ER.tblW} height={22} rx={5} className={my.erTableHead}/>
                                                    <text x={8} y={15} className={my.erTableName}>
                                                        <title>{t.name}</title>
                                                        {t.name}
                                                    </text>
                                                    {t.columns.map((c: any, ci: number) => (
                                                        <text key={ci} x={8} y={22 + 14 + ci * 18} className={my.erCol}>
                                                            <title>{`${c.key === 'PRI' ? '🔑 ' : ''}${c.name} ${c.type}`}</title>
                                                            {c.key === 'PRI' ? '🔑 ' : ''}{c.name} <tspan className={my.erType}>{c.type}</tspan>
                                                        </text>
                                                    ))}
                                                </g>
                                            )
                                        })}
                                    </svg>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {objModal && (
                <ObjModal
                    kind={objModal}
                    db={db}
                    busy={objBusy}
                    msg={objMsg}
                    name={objName}
                    extra={objExtra}
                    unique={objUnique}
                    onName={setObjName}
                    onExtra={setObjExtra}
                    onUnique={setObjUnique}
                    onClose={() => setObjModal(null)}
                    onConfirm={doObjAction}
                />
            )}

            {ioModal && (
                <IoModal
                    kind={ioModal}
                    table={selected || ''}
                    sqlText={activeTabObj.content}
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

function notify(msg: string) {
    // 轻量提示：复用全局 toast（若无可忽略）
    if (typeof (window as any).__toast === 'function') (window as any).__toast(msg)
    else console.log(msg)
}

/* ---------------- 数据/结构 子视图 ---------------- */

function DataTab(props: {
    busy: boolean
    selected: string | null
    dataView: 'data' | 'struct' | 'index'
    setDataView: (v: 'data' | 'struct' | 'index') => void
    columns: string[]
    structData: MysqlQueryResult | null
    pkCols: string[]
    rows: Record<string, any>[]
    newRows: NewRow[]
    drafts: RowDrafts
    editing: { row: number; col: string } | null
    page: number
    pageSize: number
    totalRows: number
    totalPages: number
    indexData: Record<string, any>[]
    tableStatus: Record<string, any>[]
    onOpenTable: (t: string, p?: number, s?: number) => void
    onCloseTable: () => void
    onAddRow: () => void
    onDeleteRow: (i: number) => void
    onSaveAll: () => void
    onCommitEdit: (row: number, col: string, value: string, isNull: boolean) => void
    onUpdateNewCell: (idx: number, col: string, value: string, isNull: boolean) => void
    onDeleteNewRow: (idx: number) => void
    onCellDisplay: (row: number, col: string) => { text: string; isNull: boolean }
    onSetEditing: (e: { row: number; col: string } | null) => void
    saving: boolean
    dirtyCount: number
    onGoPage: (p: number) => void
    onChangePageSize: (s: number) => void
    onAddIndex: () => void
    onDropIndex: (name: string) => void
}) {
    const {
        busy, selected, dataView, setDataView, columns, structData, pkCols, rows, newRows, drafts,
        editing, page, pageSize, totalRows, totalPages, indexData, tableStatus, onOpenTable, onCloseTable,
        onAddRow, onDeleteRow, onSaveAll, onCommitEdit, onUpdateNewCell, onDeleteNewRow, onCellDisplay,
        onSetEditing, saving, dirtyCount, onGoPage, onChangePageSize, onAddIndex, onDropIndex,
    } = props

    if (!selected) {
        return <div className={my.mysqlEmpty}>从左侧选择一个表查看数据 / 结构，或在「SQL 编辑器」中执行任意 SQL</div>
    }

    return (
        <div className={my.dataWrap}>
            <div className={my.mysqlTableHead}>
                <span className={my.mysqlTableName}>{selected}</span>
                <div className={`${g.segmented} ${g.sm}`}>
                    <button className={dataView === 'data' ? g.active : ''} onClick={() => setDataView('data')}>数据</button>
                    <button className={dataView === 'struct' ? g.active : ''} onClick={() => setDataView('struct')}>结构</button>
                    <button className={dataView === 'index' ? g.active : ''} onClick={() => setDataView('index')}>索引</button>
                </div>
                <span className={my.mysqlCount}>
                    {dataView === 'data'
                        ? `${rows.length} 行${newRows.length ? ` +${newRows.length} 新` : ''}`
                        : dataView === 'struct' ? `${structData?.rowCount ?? 0} 列` : `${indexData.length} 个索引`}
                </span>
                {dataView === 'data' && (
                    <span className={my.mysqlCrudActions}>
                        <button className={`${g.btn} ${g.sm}`} disabled={busy || saving} onClick={onAddRow} title="新增一行">
                            <Icon name="plus" size={13}/> 新建行
                        </button>
                        <button className={`${g.btn} ${g.sm} ${g.primary}`} disabled={busy || saving || !dirtyCount} onClick={onSaveAll} title="保存所有修改">
                            {saving ? '保存中…' : `保存${dirtyCount ? ` (${dirtyCount})` : ''}`}
                        </button>
                        <button className={g.iconBtn} title="刷新数据" disabled={busy || saving} onClick={() => onOpenTable(selected, page)}>
                            <Icon name="refresh" size={13}/>
                        </button>
                    </span>
                )}
                {dataView === 'index' && (
                    <span className={my.mysqlCrudActions}>
                        <button className={`${g.btn} ${g.sm}`} disabled={busy} onClick={onAddIndex}><Icon name="plus" size={13}/> 新建索引</button>
                    </span>
                )}
                <button className={g.iconBtn} title="关闭表" onClick={onCloseTable}><Icon name="close" size={13}/></button>
            </div>

            {dataView === 'data' && (
                <>
                    <div className={my.mysqlPager}>
                        <span className={my.mysqlCount}>
                            共 {totalRows} 行 · 第 {(page - 1) * pageSize + (rows.length ? 1 : 0)}-{(page - 1) * pageSize + rows.length} 行
                        </span>
                        <span className={g.spacer}/>
                        <button className={g.iconBtn} title="首页" disabled={busy || page <= 1} onClick={() => onGoPage(1)}><Icon name="chevrons-left" size={13}/></button>
                        <button className={g.iconBtn} title="上一页" disabled={busy || page <= 1} onClick={() => onGoPage(page - 1)}><Icon name="chevron-left" size={13}/></button>
                        <span className={my.mysqlPageJump}>
                            <input key={page} type="number" min={1} max={totalPages} defaultValue={page} disabled={busy}
                                   onKeyDown={(e) => { if (e.key === 'Enter') { const v = Number((e.target as HTMLInputElement).value); if (v) onGoPage(v) } }}
                                   onBlur={(e) => { const v = Number(e.target.value); if (v && v !== page) onGoPage(v) }}/>
                            <span className={my.mysqlPageTotal}>/ {totalPages} 页</span>
                        </span>
                        <button className={g.iconBtn} title="下一页" disabled={busy || page >= totalPages} onClick={() => onGoPage(page + 1)}><Icon name="chevron-right" size={13}/></button>
                        <button className={g.iconBtn} title="末页" disabled={busy || page >= totalPages} onClick={() => onGoPage(totalPages)}><Icon name="chevrons-right" size={13}/></button>
                        <select className={my.mysqlPageSize} value={pageSize} disabled={busy} onChange={(e) => onChangePageSize(Number(e.target.value))}>
                            <option value={20}>20 行/页</option>
                            <option value={50}>50 行/页</option>
                            <option value={100}>100 行/页</option>
                            <option value={200}>200 行/页</option>
                            <option value={500}>500 行/页</option>
                        </select>
                    </div>
                    <div className={my.dataGridScroll}>
                        {pkCols.length === 0 && (
                            <div className={my.mysqlWarn}>该表无主键，删除/更新将按整行匹配，请谨慎操作。</div>
                        )}
                        <table className={`${my.mysqlTable} ${my.mysqlEditTable}`}>
                            <thead>
                            <tr>
                                <th className={my.mysqlRownum}>#</th>
                                {columns.map((c) => (
                                    <th key={c}>{c}{pkCols.includes(c) && <span className={my.pkBadge}>PK</span>}</th>
                                ))}
                                <th className={my.mysqlRowact}>操作</th>
                            </tr>
                            </thead>
                            <tbody>
                            {rows.map((_, i) => (
                                <tr key={i}>
                                    <td className={my.mysqlRownum}>{(page - 1) * pageSize + i + 1}</td>
                                    {columns.map((c) => {
                                        const disp = onCellDisplay(i, c)
                                        const isEditing = editing?.row === i && editing?.col === c
                                        const dirty = !!drafts[i]?.[c]
                                        return (
                                            <td key={c}
                                                className={`${dirty ? my.cellDirty : ''}${disp.isNull ? ' ' + my.cellNull : ''}`}
                                                onDoubleClick={() => !isEditing && onSetEditing({row: i, col: c})}
                                                title="双击编辑">
                                                {isEditing ? (
                                                    <CellEditorInline value={disp.text === 'NULL' ? '' : disp.text} isNull={disp.isNull}
                                                                       onCommit={(v, n) => onCommitEdit(i, c, v, n)} onCancel={() => onSetEditing(null)}/>
                                                ) : disp.isNull ? (
                                                    <span className={my.mysqlNull}>NULL</span>
                                                ) : (
                                                    String(disp.text)
                                                )}
                                            </td>
                                        )
                                    })}
                                    <td className={my.mysqlRowact}>
                                        <button className={`${g.iconBtn} ${g.danger}`} title="删除该行" disabled={busy || saving} onClick={() => onDeleteRow(i)}>
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
                                                <input className={my.mysqlCellInput} value={cell.isNull ? '' : cell.value} disabled={cell.isNull}
                                                       onChange={(e) => onUpdateNewCell(idx, c, e.target.value, false)}
                                                       onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}/>
                                                <button type="button" className={`${my.nullToggle}${cell.isNull ? ' ' + my.on : ''}`} title="切换为 NULL"
                                                        onClick={() => onUpdateNewCell(idx, c, cell.value, !cell.isNull)}>NULL</button>
                                            </td>
                                        )
                                    })}
                                    <td className={my.mysqlRowact}>
                                        <button className={`${g.iconBtn} ${g.danger}`} title="移除该行" disabled={busy || saving} onClick={() => onDeleteNewRow(idx)}>
                                            <Icon name="trash" size={13}/>
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {!rows.length && !newRows.length && (
                                <tr><td colSpan={columns.length + 2} className={`${my.mysqlEmpty} ${my.small}`}>无数据，可点击「新建行」插入</td></tr>
                            )}
                            </tbody>
                        </table>
                    </div>
                </>
            )}

            {dataView === 'struct' && (
                <div className={my.dataGridScroll}>
                    {structData ? <Grid columns={structData.columns} rows={structData.rows}/> :
                        <div className={my.mysqlEmpty}>加载中…</div>}
                </div>
            )}

            {dataView === 'index' && (
                <div className={my.dataGridScroll}>
                    <div className={my.mysqlCount}>{indexData.length} 个索引</div>
                    <table className={my.mysqlTable}>
                        <thead><tr><th>索引名</th><th>列</th><th>唯一</th><th>类型</th><th>操作</th></tr></thead>
                        <tbody>
                        {indexData.map((ix, i) => (
                            <tr key={i}>
                                <td>{ix['Key_name']}</td>
                                <td>{ix['Column_name']}</td>
                                <td>{ix['Non_unique'] === 0 ? '是' : '否'}</td>
                                <td>{ix['Index_type']}</td>
                                <td>
                                    {ix['Key_name'] !== 'PRIMARY' && (
                                        <button className={g.iconBtn} title="删除索引" onClick={() => onDropIndex(ix['Key_name'])}><Icon name="trash" size={13}/></button>
                                    )}
                                </td>
                            </tr>
                        ))}
                        {indexData.length === 0 && <tr><td colSpan={5} className={`${my.mysqlEmpty} ${my.small}`}>暂无索引</td></tr>}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    )
}

function StatusCard({title, value}: { title: string; value: any }) {
    return (
        <div className={my.statusCard}>
            <div className={my.statusCardVal}>{value === undefined || value === null ? '-' : String(value)}</div>
            <div className={my.statusCardTitle}>{title}</div>
        </div>
    )
}

/* ---------------- 数据库对象管理弹窗 ---------------- */

function ObjModal(props: {
    kind: string
    db: string
    busy: boolean
    msg: string
    name: string
    extra: string
    unique: boolean
    onName: (v: string) => void
    onExtra: (v: string) => void
    onUnique: (v: boolean) => void
    onClose: () => void
    onConfirm: () => void
}) {
    const {kind, db, busy, msg, name, extra, unique, onName, onExtra, onUnique, onClose, onConfirm} = props
    const titleMap: Record<string, string> = {
        createdb: '新建数据库', dropdb: '删除数据库', createtable: `在 ${db} 中新建表`,
        droptable: '删除表', truncate: '清空表数据', createindex: '新建索引', dropindex: '删除索引',
    }
    const needName = !['truncate', 'dropindex'].includes(kind)
    const needDef = kind === 'createtable'
    const needCols = kind === 'createindex'
    const needConfirm = ['dropdb', 'droptable', 'truncate'].includes(kind)

    return (
        <div className={g.modalMask} onClick={() => !busy && onClose()}>
            <div className={`${g.modal} ${g.ioModal}`} onClick={(e) => e.stopPropagation()}>
                <div className={g.modalHead}>
                    <span>{titleMap[kind] || '数据库操作'}</span>
                    <button className={g.iconBtn} disabled={busy} onClick={onClose}><Icon name="close" size={14}/></button>
                </div>
                <div className={g.modalBody}>
                    {msg && <div className={`${g.ioMsg} ${msg.startsWith('失败') ? g.err : g.ok}`}>{msg}</div>}
                    {needName && (
                        <div className={g.field}>
                            <label>{kind === 'createindex' ? '索引名称' : kind === 'createdb' ? '数据库名' : '名称'}</label>
                            <input value={name} onChange={(e) => onName(e.target.value)} placeholder={kind === 'createdb' ? '例如 app_db' : '名称'}/>
                        </div>
                    )}
                    {needDef && (
                        <div className={g.field}>
                            <label>列定义（SQL）</label>
                            <textarea className={my.mysqlSqlInput} rows={4} value={extra} onChange={(e) => onExtra(e.target.value)}
                                      placeholder="`id` INT PRIMARY KEY AUTO_INCREMENT, `name` VARCHAR(64)"/>
                        </div>
                    )}
                    {needCols && (
                        <>
                            <div className={g.field}>
                                <label>索引列（逗号分隔）</label>
                                <input value={extra} onChange={(e) => onExtra(e.target.value)} placeholder="col1, col2"/>
                            </div>
                            <label className={g.switchField}>
                                <span>唯一索引 (UNIQUE)</span>
                                <span className={g.switch}>
                                    <input type="checkbox" checked={unique} onChange={(e) => onUnique(e.target.checked)}/>
                                    <span className={g.slider}/>
                                </span>
                            </label>
                        </>
                    )}
                    {needConfirm && <p className={g.ioHint}>该操作不可恢复，请确认。</p>}
                </div>
                <div className={g.modalFoot}>
                    <button className={`${g.btn} ${g.sm}`} disabled={busy} onClick={onClose}>取消</button>
                    <button className={`${g.btn} ${g.sm} ${g.primary}`} disabled={busy || ((needName || needDef || needCols) && !name && !extra)} onClick={onConfirm}>
                        {busy ? '处理中…' : '确定'}
                    </button>
                </div>
            </div>
        </div>
    )
}

/* ---------------- 导入/导出弹窗 ---------------- */

function IoModal(props: {
    kind: 'export' | 'import'
    table: string
    sqlText: string
    busy: boolean
    msg: string
    onClose: () => void
    onExport: (o: { mode: 'sql' | 'csv' | 'json'; source: 'table' | 'query'; table: string; sqlText: string; limit: number }) => void
    onImport: (o: { mode: 'sql' | 'csv' | 'json'; table: string }) => void
}) {
    const {kind, table, sqlText, busy, msg, onClose, onExport, onImport} = props
    const [mode, setMode] = useState<'sql' | 'csv' | 'json'>(kind === 'export' ? 'sql' : 'sql')
    const [source, setSource] = useState<'table' | 'query'>('table')
    const [tableName, setTableName] = useState(table)
    const [limit, setLimit] = useState(0)

    const canExport = source === 'table' ? tableName.trim() !== '' : sqlText.trim() !== ''
    const canImport = mode === 'sql' ? true : tableName.trim() !== ''

    return (
        <div className={g.modalMask} onClick={() => !busy && onClose()}>
            <div className={`${g.modal} ${g.ioModal}`} onClick={(e) => e.stopPropagation()}>
                <div className={g.modalHead}>
                    <span>{kind === 'export' ? '导出数据' : '导入数据'}</span>
                    <button className={g.iconBtn} disabled={busy} onClick={onClose}><Icon name="close" size={14}/></button>
                </div>
                <div className={g.modalBody}>
                    <div className={g.field}>
                        <label>格式</label>
                        <div className={`${g.segmented} ${g.sm}`}>
                            <button className={mode === 'sql' ? g.active : ''} onClick={() => setMode('sql')}>SQL</button>
                            <button className={mode === 'csv' ? g.active : ''} onClick={() => setMode('csv')}>CSV</button>
                            <button className={mode === 'json' ? g.active : ''} onClick={() => setMode('json')}>JSON</button>
                        </div>
                    </div>
                    {kind === 'export' ? (
                        <>
                            <div className={g.field}>
                                <label>来源</label>
                                <div className={`${g.segmented} ${g.sm}`}>
                                    <button className={source === 'table' ? g.active : ''} disabled={!table} onClick={() => setSource('table')}>当前表</button>
                                    <button className={source === 'query' ? g.active : ''} onClick={() => setSource('query')}>查询结果</button>
                                </div>
                            </div>
                            {source === 'table' ? (
                                <div className={g.field}>
                                    <label>表名</label>
                                    <input value={tableName} onChange={(e) => setTableName(e.target.value)} placeholder="目标表名"/>
                                </div>
                            ) : (
                                <div className={g.field}>
                                    <label>查询语句（来自 SQL 编辑器）</label>
                                    <textarea value={sqlText} readOnly rows={4} className={my.mysqlSqlInput}/>
                                </div>
                            )}
                            <div className={g.field}>
                                <label>限制行数（0 表示不限制）</label>
                                <input type="number" min={0} value={limit} onChange={(e) => setLimit(Number(e.target.value) || 0)}/>
                            </div>
                        </>
                    ) : (
                        <div className={g.field}>
                            <label>{mode === 'sql' ? '目标数据库' : '目标表名'}（CSV/JSON 必填）</label>
                            <input value={tableName} onChange={(e) => setTableName(e.target.value)}
                                   placeholder={mode === 'sql' ? '可选，留空使用当前库' : '导入到的表名'}/>
                            <p className={g.ioHint}>
                                {mode === 'sql' ? '将逐条执行文件中的 SQL 语句（支持多语句）。'
                                    : mode === 'json' ? 'JSON 为对象数组，键对应列名。'
                                        : 'CSV 首行为列名，其余为数据行，空单元格写入 NULL。'}
                            </p>
                        </div>
                    )}
                    {msg && <div className={`${g.ioMsg} ${msg.startsWith('失败') ? g.err : g.ok}`}>{msg}</div>}
                </div>
                <div className={g.modalFoot}>
                    <button className={`${g.btn} ${g.sm}`} disabled={busy} onClick={onClose}>取消</button>
                    {kind === 'export' ? (
                        <button className={`${g.btn} ${g.sm} ${g.primary}`} disabled={busy || !canExport}
                                onClick={() => onExport({mode, source, table: tableName.trim(), sqlText, limit})}>导出</button>
                    ) : (
                        <button className={`${g.btn} ${g.sm} ${g.primary}`} disabled={busy || !canImport}
                                onClick={() => onImport({mode, table: tableName.trim()})}>选择文件并导入</button>
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
            <input autoFocus className={`${my.mysqlCellInput}${nulled ? ' ' + my.isNull : ''}`} value={nulled ? '' : txt} disabled={nulled}
                   onChange={(e) => setTxt(e.target.value)}
                   onKeyDown={(e) => {
                       if (e.key === 'Enter') { e.preventDefault(); onCommit(txt, nulled) }
                       else if (e.key === 'Escape') { e.preventDefault(); onCancel() }
                   }}
                   onBlur={() => onCommit(txt, nulled)}/>
            <button type="button" className={`${my.nullToggle}${nulled ? ' ' + my.on : ''}`} title="切换为 NULL" onClick={() => setNulled((n) => !n)}>NULL</button>
        </span>
    )
}
