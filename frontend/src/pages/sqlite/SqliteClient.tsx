import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Segmented, Space, Tooltip, Pagination, Tag, Input } from 'antd'
import { Database, Plus, Folder, FileText, PanelLeft, Table, RotateCw, Trash2, X, Eraser } from 'lucide-react'
import ResizableTable, { ColDef } from '@/components/ResizableTable'
import { API } from '@/api'
import { errorMessage } from '@/utils'
import { SqliteSessionInfo, SqliteTableInfo, SqliteColumnInfo, SqliteIndexInfo } from '@/types'
import { ConfirmModal, ConfirmState } from '@/components/Modal'
import ObjModal from '@/pages/mysql/ObjModal'
import g from '@/styles/global.module.less'
import sq from '@/pages/sqlite/SqliteClient.module.less'
import db from '@/pages/mysql/dbTable.module.less'
import sh from '@/pages/mysql/mysqlShared.module.less'

const DEFAULT_COL_W = 120
const ROW_ACT_W = 50

interface Props {
    session: SqliteSessionInfo
    onClose: () => void
}

const PAGE_SIZE = 100
const emptyConfirm: ConfirmState = { open: false, title: '', message: '' }

function quoteIdent(s: string): string {
    return `"${s.replace(/"/g, '""')}"`
}

function sqlVal(v: any): string {
    if (v === null || v === undefined) return 'NULL'
    if (typeof v === 'number') return String(v)
    if (typeof v === 'boolean') return v ? '1' : '0'
    const str = String(v)
    return `'${str.replace(/'/g, "''")}'`
}

export default function SqliteClient({ session, onClose }: Props) {
    const [tables, setTables] = useState<SqliteTableInfo[]>([])
    const [selected, setSelected] = useState<string | null>(null)
    const [dataView, setDataView] = useState<'data' | 'struct' | 'index'>('data')
    const [busy, setBusy] = useState(false)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')
    const [info, setInfo] = useState<{ path: string; size: number }>({ path: session.path, size: session.size })
    const [pathError, setPathError] = useState('')
    const [confirmState, setConfirmState] = useState<ConfirmState>(emptyConfirm)

    // 建表弹窗态
    const [createModalOpen, setCreateModalOpen] = useState(false)
    const [createTableName, setCreateTableName] = useState('')
    const [createColDefs, setCreateColDefs] = useState('')
    const [createBusy, setCreateBusy] = useState(false)
    const [createMsg, setCreateMsg] = useState('')

    // 数据态
    const [rows, setRows] = useState<Record<string, any>[]>([])
    const [columns, setColumns] = useState<string[]>([])
    const [page, setPage] = useState(1)
    const [totalRows, setTotalRows] = useState(0)

    // 草稿修改态 (行行内编辑 & 新建行)
    const [newRows, setNewRows] = useState<Record<string, any>[]>([])
    const [drafts, setDrafts] = useState<Record<number, Record<string, any>>>({})
    const [editing, setEditing] = useState<{ row: number; col: string } | null>(null)

    // 结构态与索引态
    const [structData, setStructData] = useState<SqliteColumnInfo[]>([])
    const [indexData, setIndexData] = useState<SqliteIndexInfo[]>([])

    // 列宽状态 — 切换表时重置
    const [colWidths, setColWidths] = useState<Record<string, number>>({})

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
            if (i) setInfo({ path: i.path, size: Number(i.size) || 0 })
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
            setNewRows([])
            setDrafts({})
            setEditing(null)
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

    const loadTableData = async (table: string, toPage = 1) => {
        setSelected(table)
        setDataView('data')
        setBusy(true)
        setError('')
        setNewRows([])
        setDrafts({})
        setEditing(null)
        setColWidths({})  // reset column widths on table switch
        try {
            const [data, cnt, struct] = await Promise.all([
                API.sqliteSelect(id, table, PAGE_SIZE, (toPage - 1) * PAGE_SIZE),
                API.sqliteCount(id, table),
                API.sqliteDescribe(id, table).catch(() => []),
            ])
            if (data.rows.length === 0 && toPage > 1) {
                setBusy(false)
                await loadTableData(table, 1)
                return
            }
            setRows(data.rows)
            setColumns(data.columns)
            setStructData(struct)
            setTotalRows(cnt)
            setPage(toPage)
        } catch (e) {
            setError(errorMessage(e))
        } finally {
            setBusy(false)
        }
    }

    const openTable = useCallback((table: string, toPage = 1) => loadTableData(table, toPage), [id])

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

    // ---- 草稿变动计算 ----
    const dirtyCount = useMemo(() => {
        let count = newRows.length
        for (const rowIdx in drafts) {
            count += Object.keys(drafts[rowIdx]).length
        }
        return count
    }, [newRows, drafts])

    // ---- 单元格编辑辅助 ----
    const getEditValue = (rowIdx: number, col: string): string => {
        if (drafts[rowIdx] && drafts[rowIdx][col] !== undefined) {
            const v = drafts[rowIdx][col]
            return v === null || v === undefined ? '' : String(v)
        }
        const orig = rows[rowIdx]?.[col]
        return orig === null || orig === undefined ? '' : String(orig)
    }

    const getDisplayValue = (rowIdx: number, col: string): string => {
        if (drafts[rowIdx] && drafts[rowIdx][col] !== undefined) {
            const v = drafts[rowIdx][col]
            return v === null || v === undefined ? '' : String(v)
        }
        const orig = rows[rowIdx]?.[col]
        return orig === null || orig === undefined ? '' : String(orig)
    }

    const isNull = (rowIdx: number, col: string): boolean => {
        if (drafts[rowIdx] && drafts[rowIdx][col] !== undefined) {
            return drafts[rowIdx][col] === null || drafts[rowIdx][col] === undefined
        }
        const orig = rows[rowIdx]?.[col]
        return orig === null || orig === undefined
    }

    const isDirty = (rowIdx: number, col: string): boolean => {
        if (!drafts[rowIdx]) return false
        return drafts[rowIdx][col] !== undefined
    }

    const updateDraft = (rowIdx: number, col: string, rawVal: string) => {
        const orig = rows[rowIdx]?.[col]
        const origStr = orig === null || orig === undefined ? '' : String(orig)
        setDrafts((prev) => {
            const rowDraft = { ...(prev[rowIdx] || {}) }
            if (rawVal === origStr) {
                delete rowDraft[col]
            } else {
                rowDraft[col] = rawVal
            }
            const next = { ...prev }
            if (Object.keys(rowDraft).length === 0) {
                delete next[rowIdx]
            } else {
                next[rowIdx] = rowDraft
            }
            return next
        })
    }

    // ---- 新建行操作 ----
    const handleAddRow = () => {
        const emptyRow: Record<string, any> = {}
        for (const c of columns) {
            emptyRow[c] = ''
        }
        setNewRows((prev) => [...prev, emptyRow])
    }

    const updateNewCell = (idx: number, col: string, val: string) => {
        setNewRows((prev) => {
            const next = [...prev]
            next[idx] = { ...next[idx], [col]: val }
            return next
        })
    }

    const removeNewRow = (idx: number) => {
        setNewRows((prev) => prev.filter((_, i) => i !== idx))
    }

    // ---- 生成安全的 SQLite WHERE 条件 ----
    const buildWhereClause = (row: Record<string, any>): string => {
        const pkNames = structData.filter((c) => c.pk > 0).map((c) => c.name)
        const targetCols = pkNames.length > 0 ? pkNames : columns
        const parts: string[] = []
        for (const c of targetCols) {
            const v = row[c]
            if (v === null || v === undefined) {
                parts.push(`${quoteIdent(c)} IS NULL`)
            } else {
                parts.push(`${quoteIdent(c)} = ${sqlVal(v)}`)
            }
        }
        return parts.join(' AND ')
    }

    // ---- 删除整行数据 ----
    const confirmDeleteRow = (rowIdx: number) => {
        if (!selected) return
        const targetRow = rows[rowIdx]
        setConfirmState({
            open: true,
            title: '删除整行数据',
            danger: true,
            message: `确认删除当前选中的第 ${rowIdx + 1} 行数据吗？该操作不可撤销。`,
            onConfirm: async () => {
                setConfirmState(emptyConfirm)
                setSaving(true)
                try {
                    const whereSql = buildWhereClause(targetRow)
                    const sql = `DELETE FROM ${quoteIdent(selected)} WHERE ${whereSql}`
                    await API.sqliteRun(id, sql)
                    await openTable(selected, page)
                } catch (e) {
                    setError(errorMessage(e))
                } finally {
                    setSaving(false)
                }
            },
        })
    }

    // ---- 清空表数据 (DELETE FROM table) ----
    const confirmTruncateTable = (tableName: string) => {
        setConfirmState({
            open: true,
            title: '清空表数据',
            danger: true,
            message: `确认清空表 "${tableName}" 吗？表中所有数据将被清空且不可恢复！`,
            onConfirm: async () => {
                setConfirmState(emptyConfirm)
                setBusy(true)
                try {
                    await API.sqliteRun(id, `DELETE FROM ${quoteIdent(tableName)}`)
                    if (selected === tableName) {
                        await openTable(tableName, 1)
                    }
                } catch (e) {
                    setError(errorMessage(e))
                } finally {
                    setBusy(false)
                }
            },
        })
    }

    // ---- 删除表 (DROP TABLE table) ----
    const confirmDropTable = (tableName: string) => {
        setConfirmState({
            open: true,
            title: '删除表 (Drop Table)',
            danger: true,
            message: `确认删除表 "${tableName}" 吗？该表及其结构将被永久删除且不可恢复！`,
            onConfirm: async () => {
                setConfirmState(emptyConfirm)
                setBusy(true)
                try {
                    await API.sqliteRun(id, `DROP TABLE ${quoteIdent(tableName)}`)
                    if (selected === tableName) {
                        setSelected(null)
                        setRows([])
                        setColumns([])
                    }
                    await loadTables()
                } catch (e) {
                    setError(errorMessage(e))
                } finally {
                    setBusy(false)
                }
            },
        })
    }

    // ---- 新建表操作 (CREATE TABLE) ----
    const handleOpenCreateModal = () => {
        setCreateTableName('')
        setCreateColDefs('"id" INTEGER PRIMARY KEY AUTOINCREMENT, "name" TEXT')
        setCreateMsg('')
        setCreateModalOpen(true)
    }

    const handleConfirmCreateTable = async () => {
        const tName = createTableName.trim()
        const cols = createColDefs.trim()
        if (!tName || !cols) {
            setCreateMsg('失败：表名和列定义不能为空')
            return
        }
        setCreateBusy(true)
        setCreateMsg('')
        try {
            const sql = `CREATE TABLE ${quoteIdent(tName)} (${cols})`
            await API.sqliteRun(id, sql)
            setCreateMsg(`已成功创建表 ${tName}`)
            await loadTables()
            await openTable(tName)
            setTimeout(() => {
                setCreateModalOpen(false)
                setCreateBusy(false)
            }, 700)
        } catch (e) {
            setCreateMsg(`失败：${errorMessage(e)}`)
            setCreateBusy(false)
        }
    }

    // ---- 批量保存更改 ----
    const handleSaveAll = async () => {
        if (!selected || dirtyCount === 0) return
        setSaving(true)
        setError('')
        try {
            // 1. 提交草稿新增行 (INSERT)
            for (const nr of newRows) {
                const validCols: string[] = []
                const validVals: string[] = []
                for (const c of columns) {
                    if (nr[c] !== undefined && nr[c] !== '') {
                        validCols.push(quoteIdent(c))
                        validVals.push(sqlVal(nr[c]))
                    }
                }
                if (validCols.length > 0) {
                    const sql = `INSERT INTO ${quoteIdent(selected)} (${validCols.join(', ')}) VALUES (${validVals.join(', ')})`
                    await API.sqliteRun(id, sql)
                }
            }

            // 2. 提交单元格修改 (UPDATE)
            for (const rowIdxStr in drafts) {
                const rowIdx = Number(rowIdxStr)
                const origRow = rows[rowIdx]
                const rowDraft = drafts[rowIdx]
                if (!origRow || !rowDraft) continue

                const setParts: string[] = []
                for (const col in rowDraft) {
                    setParts.push(`${quoteIdent(col)} = ${sqlVal(rowDraft[col])}`)
                }
                if (setParts.length > 0) {
                    const whereSql = buildWhereClause(origRow)
                    const sql = `UPDATE ${quoteIdent(selected)} SET ${setParts.join(', ')} WHERE ${whereSql}`
                    await API.sqliteRun(id, sql)
                }
            }

            // 重新刷新
            await openTable(selected, page)
        } catch (e) {
            setError(errorMessage(e))
        } finally {
            setSaving(false)
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
            <ConfirmModal state={confirmState} onCancel={() => setConfirmState(emptyConfirm)} />

            {createModalOpen && (
                <ObjModal
                    kind="createtable"
                    busy={createBusy}
                    msg={createMsg}
                    name={createTableName}
                    extra={createColDefs}
                    placeholder='"id" INTEGER PRIMARY KEY AUTOINCREMENT, "name" TEXT'
                    onName={setCreateTableName}
                    onExtra={setCreateColDefs}
                    onClose={() => !createBusy && setCreateModalOpen(false)}
                    onConfirm={handleConfirmCreateTable}
                />
            )}

            <div className={sq.sqliteSide}>
                <div className={sq.sqliteHead} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px' }}>
                    <Database size={14} />
                    <span className={sq.sqliteTitle} style={{ fontWeight: 600 }}>SQLite</span>
                    <span className={g.spacer} />
                    <Button size="small" icon={<Plus size={12} />} onClick={handleOpenCreateModal} disabled={busy}>
                        新建表
                    </Button>
                    <Button size="small" icon={<Folder size={12} />} onClick={switchFile} disabled={busy}>
                        切换
                    </Button>
                </div>
                <div className={sq.sqlitePath} title={info.path}>
                    <FileText size={12} />
                    <span>{info.path ? info.path.split(/[\\/]/).pop() : '未选择文件'}</span>
                </div>
                <div className={sq.sqliteStatus}>
                    <span className={`${g.dot}${session.connected ? ' ' + g.on : ''}`} />
                    {session.connected ? `已连接 · ${fmtSize(info.size)}` : '未连接'}
                    {pathError && <span className={sq.pathErr}>{pathError}</span>}
                </div>
                <div className={sq.sqliteTables}>
                    {tables.length === 0 && !busy && (
                        <div className={`${sh.mongoEmpty} ${sh.small}`}>暂无表</div>
                    )}
                    {tables.map((t) => (
                        <div
                            key={t.name}
                            className={`${sq.sqliteTableRow}${selected === t.name ? ' ' + sq.active : ''}`}
                            onClick={() => openTable(t.name)}
                        >
                            {t.type === 'view' ? <PanelLeft size={13} className={sq.tableIcon} /> : <Table size={13} className={sq.tableIcon} />}
                            <span className={sq.tableName} title={t.name}>{t.name}</span>
                            {t.type === 'view' && <Tag color="cyan" style={{ margin: 0, padding: '0 4px', fontSize: 10, lineHeight: '16px' }}>视图</Tag>}
                            <div className={sq.sqliteTableMenu} onClick={(e) => e.stopPropagation()}>
                                <Tooltip title="清空表数据">
                                    <Button
                                        size="small"
                                        type="text"
                                        icon={<Eraser size={12} />}
                                        onClick={() => confirmTruncateTable(t.name)}
                                    />
                                </Tooltip>
                                <Tooltip title="删除表 (Drop)">
                                    <Button
                                        size="small"
                                        type="text"
                                        danger
                                        icon={<Trash2 size={12} />}
                                        onClick={() => confirmDropTable(t.name)}
                                    />
                                </Tooltip>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <div className={sq.sqliteMain}>
                <div className={sq.sqliteToolbar} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px' }}>
                    <span className={sq.sqliteConnTitle} style={{ fontWeight: 600 }}>
                        {selected ? `${selected} · ${totalRows} 行` : `${session.title || (info.path ? info.path.split(/[\\/]/).pop() : 'SQLite')} 浏览器`}
                    </span>
                    <span className={g.spacer} />
                    {error && <span className={sq.sqliteError}>{error}</span>}
                    <Tooltip title="关闭">
                        <Button size="small" type="text" icon={<X size={15} />} onClick={onClose} />
                    </Tooltip>
                </div>

                <div className={sq.sqliteTabs} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 12px', borderBottom: '1px solid var(--border)' }}>
                    <Segmented
                        size="small"
                        value={dataView}
                        disabled={!selected}
                        onChange={(v) => {
                            if (!selected) return
                            const nextV = v as 'data' | 'struct' | 'index'
                            setDataView(nextV)
                            if (nextV === 'data') void openTable(selected, page)
                            else if (nextV === 'struct') void viewStruct(selected)
                            else void viewIndex(selected)
                        }}
                        options={[
                            { label: '数据预览', value: 'data' },
                            { label: '表结构', value: 'struct' },
                            { label: '索引', value: 'index' },
                        ]}
                    />
                    {selected && dataView === 'data' && (
                        <Space size={6}>
                            <Button size="small" icon={<Plus size={12} />} disabled={busy || saving} onClick={handleAddRow}>
                                新建行
                            </Button>
                            <Button size="small" type="primary" disabled={busy || saving || dirtyCount === 0} onClick={handleSaveAll}>
                                {saving ? '保存中…' : `保存${dirtyCount ? ` (${dirtyCount})` : ''}`}
                            </Button>
                            <Tooltip title="刷新表格数据">
                                <Button size="small" icon={<RotateCw size={12} />} disabled={busy || saving} onClick={() => openTable(selected, page)} />
                            </Tooltip>
                        </Space>
                    )}
                </div>

                <div className={sq.sqliteContent}>
                    {!selected && (
                        <div className={`${sh.mongoEmpty}`}>请选择左侧的表或视图以查看数据</div>
                    )}

                    {selected && dataView === 'data' && (
                        <div className={sq.sqliteDataWrap}>
                            {(() => {
                                const getColW = (key: string) => colWidths[key] ?? DEFAULT_COL_W
                                const handleColResize = (key: string, w: number) =>
                                    setColWidths((prev) => ({ ...prev, [key]: w }))

                                const sqCols: ColDef[] = [
                                    ...columns.map((c) => ({ key: c, label: c, width: getColW(c), minWidth: 50 })),
                                    { key: '__act__', label: '操作', width: ROW_ACT_W, minWidth: 38 },
                                ]

                                return columns.length > 0 ? (
                                    <ResizableTable cols={sqCols} onColResize={handleColResize}>
                                        <tbody>
                                            {/* 草稿新增行 */}
                                            {newRows.map((nr, idx) => (
                                                <tr key={`new_${idx}`} className={sq.rowNew}>
                                                    {columns.map((c) => (
                                                        <td key={c}>
                                                            <input
                                                                className={sq.cellInput}
                                                                value={nr[c] ?? ''}
                                                                onChange={(e) => updateNewCell(idx, c, e.target.value)}
                                                                placeholder="NULL"
                                                                onKeyDown={(e) => {
                                                                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                                                                }}
                                                            />
                                                        </td>
                                                    ))}
                                                    <td className={sq.centerCell}>
                                                        <Tooltip title="移除此新增行">
                                                            <Button
                                                                size="small"
                                                                type="text"
                                                                danger
                                                                icon={<Trash2 size={12} />}
                                                                onClick={() => removeNewRow(idx)}
                                                            />
                                                        </Tooltip>
                                                    </td>
                                                </tr>
                                            ))}
                                            {/* 现存数据行 */}
                                            {rows.map((r, i) => (
                                                <tr key={i}>
                                                    {columns.map((c) => {
                                                        const isEd = editing?.row === i && editing?.col === c
                                                        const dirty = isDirty(i, c)
                                                        const isn = isNull(i, c)
                                                        const disp = getDisplayValue(i, c)
                                                        return (
                                                            <td
                                                                key={c}
                                                                className={`${dirty ? db.dbDirtyCell : ''} ${isn && !isEd ? db.dbNullCell : ''} ${sq.editableCell}`}
                                                                onClick={() => !isEd && setEditing({ row: i, col: c })}
                                                                title="点击可编辑"
                                                            >
                                                                {isEd ? (
                                                                    <input
                                                                        className={sq.cellInput}
                                                                        autoFocus
                                                                        value={getEditValue(i, c)}
                                                                        onChange={(e) => updateDraft(i, c, e.target.value)}
                                                                        onBlur={() => setEditing(null)}
                                                                        onKeyDown={(e) => {
                                                                            if (e.key === 'Enter' || e.key === 'Escape') {
                                                                                setEditing(null)
                                                                            }
                                                                        }}
                                                                    />
                                                                ) : isn ? 'NULL' : disp}
                                                            </td>
                                                        )
                                                    })}
                                                    <td className={sq.centerCell}>
                                                        <Tooltip title="删除整行数据">
                                                            <Button
                                                                size="small"
                                                                type="text"
                                                                danger
                                                                icon={<Trash2 size={12} />}
                                                                onClick={() => confirmDeleteRow(i)}
                                                            />
                                                        </Tooltip>
                                                    </td>
                                                </tr>
                                            ))}
                                            {!rows.length && !newRows.length && (
                                                <tr><td colSpan={columns.length + 1} className={db.dbEmpty}>该表暂无数据</td></tr>
                                            )}
                                        </tbody>
                                    </ResizableTable>
                                ) : (
                                    <div className={db.dbEmpty}>该表暂无数据</div>
                                )
                            })()}
                            <div className={sq.pager} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px' }}>
                                <span className={sq.pageInfo} style={{ fontSize: 12, color: 'var(--text-dim)' }}>共 {totalRows} 行 · 第 {page} / {totalPages} 页</span>
                                <Pagination
                                    size="small"
                                    current={page}
                                    pageSize={PAGE_SIZE}
                                    total={totalRows}
                                    disabled={busy}
                                    showSizeChanger={false}
                                    onChange={(p) => goPage(p)}
                                />
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
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {indexData.map((ix) => (
                                                <tr key={ix.name}>
                                                    <td>{ix.name}</td>
                                                    <td>{ix.unique ? '是' : ''}</td>
                                                    <td>{ix.origin || ''}</td>
                                                    <td>{ix.partial ? '是' : ''}</td>
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
        </div>
    )
}
