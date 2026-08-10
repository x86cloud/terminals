import React, {useCallback, useEffect, useMemo, useState} from 'react'
import Icon from '../../components/Icon'
import {API} from '../../api'
import {errorMessage} from '../../utils'
import {MysqlSessionInfo} from '../../types'
import g from '../../styles/global.module.less'
import my from './MysqlClient.module.less'
import sh from './mysqlShared.module.less'
import {SqlTab, RowDrafts, NewRow, Schema, TabKey} from './mysqlTypes'
import DataTab from './DataTab'
import SqlEditor from './SqlEditor'
import UsersPanel from './UsersPanel'
import StatusPanel from './StatusPanel'
import ErDiagram from './ErDiagram'
import {ConfirmModal, ConfirmState, PromptModal, PromptState} from '../../components/Modal'
import ObjModal, {ObjModalKind} from './ObjModal'
import IoModal from './IoModal'

interface Props {
    session: MysqlSessionInfo
    onClose: () => void
    onChange: (id: string, database: string) => void
}

let tabSeq = 0
const newTab = (): SqlTab => ({
    id: `sql-${++tabSeq}`,
    title: `查询 ${tabSeq}`,
    content: '',
    result: null,
    error: '',
})

function notify(msg: string) {
    // 轻量提示：复用全局 toast（若无可忽略）
    if (typeof (window as any).__toast === 'function') (window as any).__toast(msg)
    else console.log(msg)
}

export default function MysqlClient({session, onClose, onChange}: Props) {
    const [databases, setDatabases] = useState<string[]>([])
    const [db, setDb] = useState<string>(session.database || '')
    const [tables, setTables] = useState<string[]>([])
    const [selected, setSelected] = useState<string | null>(null)
    const [dataView, setDataView] = useState<'data' | 'struct' | 'index'>('data')
    const [tab, setTab] = useState<TabKey>('data')
    const [tableData, setTableData] = useState<any>(null)
    const [structData, setStructData] = useState<any>(null)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')
    const [saving, setSaving] = useState(false)
    const emptyConfirm: ConfirmState = {open: false, title: '', message: ''}
    const [confirm, setConfirm] = useState<ConfirmState>(emptyConfirm)

    // 数据库对象管理弹窗
    const [objModal, setObjModal] = useState<ObjModalKind | null>(null)
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
    const [schema, setSchema] = useState<Schema>({tables: [], foreignKeys: []})
    const [erZoom, setErZoom] = useState(1)

    const columns = tableData?.columns ?? []
    const pkCols = useMemo(() => {
        if (!structData) return []
        return structData.rows
            .filter((r: any) => r['Key'] === 'PRI')
            .map((r: any) => r['Field'] as string)
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
            updateActiveTab({result: res, error: ''})
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

    /* ----------------- 改 / 增 / 删 ----------------- */

    const cellDisplay = (row: number, col: string): { text: string; isNull: boolean } => {
        const d = drafts[row]?.[col]
        if (d) return {text: d.isNull ? 'NULL' : d.value, isNull: d.isNull}
        const orig = rows[row]?.[col]
        const isn = orig === null || orig === undefined
        return {text: isn ? 'NULL' : String(orig), isNull: isn}
    }

    const commitEdit = (row: number, col: string, value: string, isNull: boolean) => {
        const orig = rows[row]?.[col]
        const origIsNull = orig === null || orig === undefined
        const origValue = origIsNull ? '' : String(orig)

        let isSame = false
        if (origIsNull) {
            if (isNull || value === '') {
                isSame = true
            }
        } else {
            if (!isNull && value === origValue) {
                isSame = true
            }
        }

        setDrafts((prev) => {
            const rowDraft = { ...(prev[row] || {}) }
            if (isSame) {
                delete rowDraft[col]
            } else {
                rowDraft[col] = { value, isNull }
            }

            const next = { ...prev }
            if (Object.keys(rowDraft).length === 0) {
                delete next[row]
            } else {
                next[row] = rowDraft
            }
            return next
        })
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
        const wVals = wCols.map((c: string) => rows[row]?.[c] ?? null)
        const hint = pkCols.length ? '' : '（该表无主键，将按整行匹配，请谨慎操作）'
        setConfirm({
            open: true,
            title: '删除行数据',
            danger: true,
            message: `确认删除该行？${hint}`,
            onConfirm: async () => {
                setConfirm(emptyConfirm)
                setBusy(true)
                setError('')
                try {
                    await API.mysqlDelete(session.id, db, selected, wCols, wVals)
                    setError('')
                    await openTable(selected, page)
                } catch (e) {
                    setError(errorMessage(e))
                } finally {
                    setBusy(false)
                }
            },
        })
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
                const wVals = wCols.map((c: string) => rows[idx]?.[c] ?? null)
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
                    setObjBusy(false)
                    setConfirm({
                        open: true,
                        title: '删除数据库',
                        danger: true,
                        message: `确认删除数据库 ${objName}？该操作不可恢复！`,
                        onConfirm: async () => {
                            setConfirm(emptyConfirm)
                            setObjBusy(true)
                            try {
                                await API.mysqlDropDatabase(session.id, objName)
                                setObjMsg(`已删除数据库 ${objName}`)
                                await loadDatabases()
                                setTimeout(() => setObjModal(null), 700)
                            } catch (e) {
                                setObjMsg(errorMessage(e))
                            } finally {
                                setObjBusy(false)
                            }
                        },
                    })
                    return
                case 'createtable':
                    await API.mysqlCreateTable(session.id, db, objName, objExtra)
                    setObjMsg(`已创建表 ${objName}`)
                    await loadTables(db)
                    break
                case 'droptable':
                    setObjBusy(false)
                    setConfirm({
                        open: true,
                        title: '删除表',
                        danger: true,
                        message: `确认删除表 ${objName}？`,
                        onConfirm: async () => {
                            setConfirm(emptyConfirm)
                            setObjBusy(true)
                            try {
                                await API.mysqlDropTable(session.id, db, objName)
                                setObjMsg(`已删除表 ${objName}`)
                                await loadTables(db)
                                if (selected === objName) setSelected(null)
                                setTimeout(() => setObjModal(null), 700)
                            } catch (e) {
                                setObjMsg(errorMessage(e))
                            } finally {
                                setObjBusy(false)
                            }
                        },
                    })
                    return
                case 'truncate':
                    setObjBusy(false)
                    setConfirm({
                        open: true,
                        title: '清空表数据',
                        danger: true,
                        message: `确认清空表 ${objName} 的所有数据？`,
                        onConfirm: async () => {
                            setConfirm(emptyConfirm)
                            setObjBusy(true)
                            try {
                                await API.mysqlTruncateTable(session.id, db, objName)
                                setObjMsg(`已清空表 ${objName}`)
                                if (selected === objName) await openTable(objName, 1)
                                setTimeout(() => setObjModal(null), 700)
                            } catch (e) {
                                setObjMsg(errorMessage(e))
                            } finally {
                                setObjBusy(false)
                            }
                        },
                    })
                    return
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
                        <div className={`${sh.mysqlEmpty} ${sh.small}`}>暂无表</div>
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
                            setError('')
                            const path = await API.mysqlBackupToFile(session.id, db)
                            if (path) notify(`已成功备份数据库到：${path}`)
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

                <div className={`${my.mysqlContent} ${tab === 'er' ? my.mysqlContentEr : ''}`}>
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
                        <SqlEditor
                            sqlTabs={sqlTabs}
                            activeSqlTab={activeSqlTab}
                            activeTabObj={activeTabObj}
                            busy={busy}
                            db={db}
                            onSelectTab={setActiveSqlTab}
                            onAddTab={addSqlTab}
                            onCloseTab={closeSqlTab}
                            onContentChange={(val) => updateActiveTab({content: val})}
                            onRun={runSqlTab}
                        />
                    )}

                    {tab === 'users' && (
                        <UsersPanel users={users} selUser={selUser} grants={grants} onSelect={viewGrants}/>
                    )}

                    {tab === 'status' && (
                        <StatusPanel
                            status={status}
                            variables={variables}
                            processList={processList}
                            slowLog={slowLog}
                            busy={busy}
                            onRefresh={loadStatus}
                        />
                    )}

                    {tab === 'er' && (
                        <ErDiagram schema={schema} busy={busy}/>
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
            <ConfirmModal state={confirm} onCancel={() => setConfirm(emptyConfirm)}/>
        </div>
    )
}
