import React, { useState, useEffect, useMemo } from 'react'
import { Plus, RotateCw, X, Trash2, ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight } from 'lucide-react'
import ResizableTable, { ColDef } from '../../components/ResizableTable'
import g from '../../styles/global.module.less'
import my from './DataTab.module.less'
import sh from './mysqlShared.module.less'
import db from './dbTable.module.less'
import { MysqlQueryResult } from '../../types'
import { Grid } from './mysqlTypes'
import { RowDrafts, NewRow } from './mysqlTypes'
import CellEditorInline from './CellEditorInline'

const ROW_NUM_W = 40
const ROW_ACT_W = 50
const DEFAULT_COL_W = 120

export default function DataTab(props: {
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

    // Column widths state — reset when table or columns change
    const [colWidths, setColWidths] = useState<Record<string, number>>({})

    useEffect(() => {
        setColWidths({})
    }, [selected, columns.join(',')])

    const getColW = (key: string) => colWidths[key] ?? DEFAULT_COL_W

    const handleColResize = (key: string, newWidth: number) => {
        setColWidths((prev) => ({ ...prev, [key]: newWidth }))
    }

    // Build ColDef array for ResizableTable
    const dataCols: ColDef[] = [
        ...columns.map((c) => ({
            key: c,
            label: (
                <>
                    {c}
                    {pkCols.includes(c) && <span className={my.pkBadge}>PK</span>}
                </>
            ),
            width: getColW(c),
            minWidth: 50,
        })),
        { key: '__rowact__', label: '操作', width: ROW_ACT_W, minWidth: 38 },
    ]

    if (!selected) {
        return <div className={sh.mysqlEmpty}>从左侧选择一个表查看数据 / 结构，或在「SQL 编辑器」中执行任意 SQL</div>
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
                            <Plus size={13} /> 新建行
                        </button>
                        <button className={`${g.btn} ${g.sm} ${g.primary}`} disabled={busy || saving || !dirtyCount} onClick={onSaveAll} title="保存所有修改">
                            {saving ? '保存中…' : `保存${dirtyCount ? ` (${dirtyCount})` : ''}`}
                        </button>
                        <button className={g.iconBtn} title="刷新数据" disabled={busy || saving} onClick={() => onOpenTable(selected, page)}>
                            <RotateCw size={13} />
                        </button>
                    </span>
                )}
                {dataView === 'index' && (
                    <span className={my.mysqlCrudActions}>
                        <button className={`${g.btn} ${g.sm}`} disabled={busy} onClick={onAddIndex}><Plus size={13} /> 新建索引</button>
                    </span>
                )}
                <button className={g.iconBtn} title="关闭表" onClick={onCloseTable}><X size={13} /></button>
            </div>

            {dataView === 'data' && (
                <>
                    {pkCols.length === 0 && (
                        <div className={my.mysqlWarn}>该表无主键，删除/更新将按整行匹配，请谨慎操作。</div>
                    )}
                    <ResizableTable
                        cols={dataCols}
                        onColResize={handleColResize}
                        className={my.mysqlEditTable}
                    >
                        <tbody>
                            {newRows.map((nr, idx) => (
                                <tr key={`new-${idx}`} className={my.rowNew}>
                                    {columns.map((c) => {
                                        const cell = nr[c] || { value: '', isNull: false }
                                        return (
                                            <td key={c}>
                                                <input className={sh.mysqlCellInput} value={cell.value}
                                                    onChange={(e) => onUpdateNewCell(idx, c, e.target.value, false)}
                                                    onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
                                            </td>
                                        )
                                    })}
                                    <td className={my.mysqlRowact}>
                                        <button className={`${g.iconBtn} ${g.danger}`} title="移除该行" disabled={busy || saving} onClick={() => onDeleteNewRow(idx)}>
                                            <Trash2 size={13} />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {rows.map((_, i) => (
                                <tr key={i}>
                                    {columns.map((c) => {
                                        const disp = onCellDisplay(i, c)
                                        const isEditing = editing?.row === i && editing?.col === c
                                        const dirty = !!drafts[i]?.[c]
                                        return (
                                            <td key={c}
                                                className={`${dirty ? my.cellDirty : ''}${disp.isNull ? ' ' + db.dbNullCell : ''}`}
                                                onClick={() => !isEditing && onSetEditing({ row: i, col: c })}
                                                title="点击编辑">
                                                {isEditing ? (
                                                    <CellEditorInline value={disp.text === 'NULL' ? '' : disp.text} isNull={disp.isNull}
                                                        onCommit={(v, n) => onCommitEdit(i, c, v, n)} onCancel={() => onSetEditing(null)} />
                                                ) : disp.isNull ? (
                                                    <span className={sh.mysqlNull}>NULL</span>
                                                ) : (
                                                    String(disp.text)
                                                )}
                                            </td>
                                        )
                                    })}
                                    <td className={my.mysqlRowact}>
                                        <button className={`${g.iconBtn} ${g.danger}`} title="删除该行" disabled={busy || saving} onClick={() => onDeleteRow(i)}>
                                            <Trash2 size={13} />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {!rows.length && !newRows.length && (
                                <tr><td colSpan={columns.length + 2} className={db.dbEmpty}>无数据，可点击「新建行」插入</td></tr>
                            )}
                        </tbody>
                    </ResizableTable>
                    <div className={my.mysqlPager}>
                        <span className={my.mysqlCount}>
                            共 {totalRows} 行 · 第 {(page - 1) * pageSize + (rows.length ? 1 : 0)}-{(page - 1) * pageSize + rows.length} 行
                        </span>
                        <span className={g.spacer} />
                        <button className={g.iconBtn} title="首页" disabled={busy || page <= 1} onClick={() => onGoPage(1)}><ChevronsLeft size={13} /></button>
                        <button className={g.iconBtn} title="上一页" disabled={busy || page <= 1} onClick={() => onGoPage(page - 1)}><ChevronLeft size={13} /></button>
                        <span className={my.mysqlPageJump}>
                            <input key={page} type="number" min={1} max={totalPages} defaultValue={page} disabled={busy}
                                onKeyDown={(e) => { if (e.key === 'Enter') { const v = Number((e.target as HTMLInputElement).value); if (v) onGoPage(v) } }}
                                onBlur={(e) => { const v = Number(e.target.value); if (v && v !== page) onGoPage(v) }} />
                            <span className={my.mysqlPageTotal}>/ {totalPages} 页</span>
                        </span>
                        <button className={g.iconBtn} title="下一页" disabled={busy || page >= totalPages} onClick={() => onGoPage(page + 1)}><ChevronRight size={13} /></button>
                        <button className={g.iconBtn} title="末页" disabled={busy || page >= totalPages} onClick={() => onGoPage(totalPages)}><ChevronsRight size={13} /></button>
                        <select className={my.mysqlPageSize} value={pageSize} disabled={busy} onChange={(e) => onChangePageSize(Number(e.target.value))}>
                            <option value={20}>20 行/页</option>
                            <option value={50}>50 行/页</option>
                            <option value={100}>100 行/页</option>
                            <option value={200}>200 行/页</option>
                            <option value={500}>500 行/页</option>
                        </select>
                    </div>
                </>
            )}

            {dataView === 'struct' && (
                <div className={db.dbTableScroll}>
                    {structData ? <Grid columns={structData.columns} rows={structData.rows} /> :
                        <div className={db.dbEmpty}>加载中…</div>}
                </div>
            )}

            {dataView === 'index' && (
                <div className={db.dbTableScroll}>
                    <table className={db.dbTable}>
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
                                            <button className={g.iconBtn} title="删除索引" onClick={() => onDropIndex(ix['Key_name'])}><Trash2 size={13} /></button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                            {indexData.length === 0 && <tr><td colSpan={5} className={db.dbEmpty}>暂无索引</td></tr>}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    )
}
