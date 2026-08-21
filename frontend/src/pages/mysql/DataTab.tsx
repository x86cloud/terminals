import React, { useState, useEffect } from 'react'
import { Select, Button, Segmented, Space, Tooltip, Pagination, Input } from 'antd'
import { Plus, RotateCw, X, Trash2 } from 'lucide-react'
import ResizableTable, { ColDef } from '@/components/ResizableTable'
import my from '@/pages/mysql/DataTab.module.less'
import sh from '@/pages/mysql/mysqlShared.module.less'
import db from '@/pages/mysql/dbTable.module.less'
import { MysqlQueryResult } from '@/types'
import { Grid, RowDrafts, NewRow } from '@/pages/mysql/mysqlTypes'
import CellEditorInline from '@/pages/mysql/CellEditorInline'

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
            <div className={my.mysqlTableHead} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px' }}>
                <span className={my.mysqlTableName} style={{ fontWeight: 600 }}>{selected}</span>
                <Segmented
                    size="small"
                    value={dataView}
                    onChange={(v) => setDataView(v as 'data' | 'struct' | 'index')}
                    options={[
                        { label: '数据', value: 'data' },
                        { label: '结构', value: 'struct' },
                        { label: '索引', value: 'index' },
                    ]}
                />
                <span className={my.mysqlCount} style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                    {dataView === 'data'
                        ? `${rows.length} 行${newRows.length ? ` +${newRows.length} 新` : ''}`
                        : dataView === 'struct' ? `${structData?.rowCount ?? 0} 列` : `${indexData.length} 个索引`}
                </span>
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
                    {dataView === 'data' && (
                        <Space size={6}>
                            <Button size="small" icon={<Plus size={13} />} disabled={busy || saving} onClick={onAddRow}>
                                新建行
                            </Button>
                            <Button size="small" type="primary" disabled={busy || saving || !dirtyCount} onClick={onSaveAll}>
                                {saving ? '保存中…' : `保存${dirtyCount ? ` (${dirtyCount})` : ''}`}
                            </Button>
                            <Tooltip title="刷新数据">
                                <Button size="small" icon={<RotateCw size={13} />} disabled={busy || saving} onClick={() => onOpenTable(selected, page)} />
                            </Tooltip>
                        </Space>
                    )}
                    {dataView === 'index' && (
                        <Button size="small" icon={<Plus size={13} />} disabled={busy} onClick={onAddIndex}>
                            新建索引
                        </Button>
                    )}
                    <Tooltip title="关闭表">
                        <Button size="small" type="text" icon={<X size={13} />} onClick={onCloseTable} />
                    </Tooltip>
                </div>
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
                                                <input
                                                    className={my.cellInput}
                                                    value={cell.value}
                                                    onChange={(e) => onUpdateNewCell(idx, c, e.target.value, false)}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                                                    }}
                                                />
                                            </td>
                                        )
                                    })}
                                    <td className={my.mysqlRowact}>
                                        <Tooltip title="移除该行">
                                            <Button
                                                size="small"
                                                type="text"
                                                danger
                                                icon={<Trash2 size={13} />}
                                                disabled={busy || saving}
                                                onClick={() => onDeleteNewRow(idx)}
                                            />
                                        </Tooltip>
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
                                        <Tooltip title="删除该行">
                                            <Button
                                                size="small"
                                                type="text"
                                                danger
                                                icon={<Trash2 size={13} />}
                                                disabled={busy || saving}
                                                onClick={() => onDeleteRow(i)}
                                            />
                                        </Tooltip>
                                    </td>
                                </tr>
                            ))}
                            {!rows.length && !newRows.length && (
                                <tr><td colSpan={columns.length + 2} className={db.dbEmpty}>无数据，可点击「新建行」插入</td></tr>
                            )}
                        </tbody>
                    </ResizableTable>
                    <div className={my.mysqlPager} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px' }}>
                        <span className={my.mysqlCount} style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                            共 {totalRows} 行
                        </span>
                        <Pagination
                            size="small"
                            current={page}
                            pageSize={pageSize}
                            total={totalRows}
                            disabled={busy}
                            showSizeChanger
                            pageSizeOptions={['20', '50', '100', '200', '500']}
                            onChange={(p, s) => {
                                if (s !== pageSize) {
                                    onChangePageSize(s)
                                } else {
                                    onGoPage(p)
                                }
                            }}
                        />
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
                                            <Tooltip title="删除索引">
                                                <Button
                                                    size="small"
                                                    type="text"
                                                    danger
                                                    icon={<Trash2 size={13} />}
                                                    onClick={() => onDropIndex(ix['Key_name'])}
                                                />
                                            </Tooltip>
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
