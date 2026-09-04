import React, { useState, useEffect, useMemo } from 'react'
import { Segmented, Button, Input, Pagination, Tooltip, message, Space, Tag, Dropdown, MenuProps } from 'antd'
import {
    RotateCw,
    Plus,
    Save,
    Trash2,
    Download,
    Copy,
    Filter,
    X,
    Key,
    Link2,
    Loader2,
    Database,
    Table as TableIcon,
    Layers,
    Code,
    Shield,
    Check,
} from 'lucide-react'
import { API } from '@/api'
import { isSameCellValue, coerceCellValue } from '@/utils'
import ResizableTable, { ColDef } from '@/components/ResizableTable'
import { PgColumn, PgIndex, PgConstraint, PgQueryResult } from './postgresTypes'
import CellEditorInline from './CellEditorInline'
import pg from './DataTab.module.less'
import db from '@/pages/mysql/dbTable.module.less'
import sh from '@/pages/mysql/mysqlShared.module.less'

const ROW_ACT_W = 48
const ROW_NUM_W = 46
const DEFAULT_COL_W = 130

export default function DataTab({
    serverId,
    dbName,
    schema,
    tableName,
    onClose,
}: {
    serverId: string
    dbName: string
    schema: string
    tableName: string
    onClose?: () => void
}) {
    const [viewMode, setViewMode] = useState<'data' | 'struct' | 'index' | 'constraints' | 'ddl'>('data')
    const [loading, setLoading] = useState(false)
    const [rows, setRows] = useState<Record<string, any>[]>([])
    const [columns, setColumns] = useState<string[]>([])
    const [totalRows, setTotalRows] = useState(0)
    const [page, setPage] = useState(1)
    const [pageSize, setPageSize] = useState(100)
    const [whereInput, setWhereInput] = useState('')
    const [activeWhere, setActiveWhere] = useState('')
    const [sortCol, setSortCol] = useState('')
    const [sortOrder, setSortOrder] = useState<'ASC' | 'DESC'>('ASC')
    const [countingRows, setCountingRows] = useState(false)

    // 列宽状态
    const [colWidths, setColWidths] = useState<Record<string, number>>({})

    // 描述与结构
    const [describeData, setDescribeData] = useState<{
        columns: PgColumn[]
        indexes: PgIndex[]
        constraints: PgConstraint[]
        primaryKeys: Record<string, boolean>
    } | null>(null)
    const [ddlText, setDdlText] = useState('')

    // 编辑与脏数据管理
    const [editingCell, setEditingCell] = useState<{ rowIdx: number; col: string } | null>(null)
    const [rowDrafts, setRowDrafts] = useState<Record<number, Record<string, any>>>({})
    const [newRows, setNewRows] = useState<Record<string, any>[]>([])
    const [editingNewCell, setEditingNewCell] = useState<{ rowIdx: number; col: string } | null>(null)
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        setColWidths({})
    }, [tableName, columns.join(',')])

    const getColW = (key: string) => colWidths[key] ?? DEFAULT_COL_W

    const handleColResize = (key: string, newWidth: number) => {
        setColWidths((prev) => ({ ...prev, [key]: newWidth }))
    }

    const pkList = useMemo(() => {
        if (!describeData) return []
        return describeData.columns.filter((c) => c.isPrimaryKey).map((c) => c.name)
    }, [describeData])

    const fkList = useMemo(() => {
        if (!describeData) return []
        return describeData.columns.filter((c) => c.isForeignKey).map((c) => c.name)
    }, [describeData])

    const dirtyCount = Object.keys(rowDrafts).length + newRows.length

    // 加载表结构与元数据
    const loadStructure = async () => {
        try {
            const desc = await API.postgresDescribe(serverId, dbName, schema, tableName)
            if (desc) {
                setDescribeData({
                    columns: desc.columns || [],
                    indexes: desc.indexes || [],
                    constraints: desc.constraints || [],
                    primaryKeys: desc.primaryKeys || {},
                })
            }
        } catch (e: any) {
            console.error('加载结构失败:', e)
        }
    }

    // 加载 DDL
    const loadDDL = async () => {
        try {
            const ddl = await API.postgresTableDDL(serverId, dbName, schema, tableName)
            setDdlText(ddl || '')
        } catch (e: any) {
            setDdlText('-- 获取 DDL 失败: ' + (e.message || e))
        }
    }

    // 加载数据
    const loadData = async (targetPage = page, targetSize = pageSize, where = activeWhere) => {
        setLoading(true)
        try {
            const offset = (targetPage - 1) * targetSize
            const res: PgQueryResult = await API.postgresSelect(
                serverId,
                dbName,
                schema,
                tableName,
                targetSize,
                offset,
                sortCol,
                sortOrder,
                where
            )
            setColumns(res.columns || [])
            setRows(res.rows || [])
            setRowDrafts({})
            setNewRows([])

            // 统计总数
            setCountingRows(true)
            API.postgresCount(serverId, dbName, schema, tableName, where)
                .then((cnt) => setTotalRows(cnt))
                .catch(() => { })
                .finally(() => setCountingRows(false))
        } catch (e: any) {
            message.error('查询失败: ' + (e.message || e))
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        loadStructure()
        loadData(1, pageSize, '')
    }, [serverId, dbName, schema, tableName])

    useEffect(() => {
        if (viewMode === 'ddl' && !ddlText) {
            loadDDL()
        }
    }, [viewMode])

    // 行内编辑保存
    const handleCommitCell = (rowIdx: number, col: string, val: any, isNull: boolean) => {
        setEditingCell(null)
        const origVal = rows[rowIdx]?.[col]
        const newVal = isNull ? null : val
        if (isSameCellValue(origVal, newVal)) {
            setRowDrafts((prev) => {
                const next = { ...prev }
                if (next[rowIdx]) {
                    delete next[rowIdx][col]
                    if (Object.keys(next[rowIdx]).length === 0) {
                        delete next[rowIdx]
                    }
                }
                return next
            })
            return
        }

        const coerced = coerceCellValue(origVal, val, isNull)
        setRowDrafts((prev) => ({
            ...prev,
            [rowIdx]: {
                ...(prev[rowIdx] || {}),
                [col]: coerced,
            },
        }))
    }

    // 新增行单元格编辑
    const handleCommitNewCell = (rowIdx: number, col: string, val: any, isNull: boolean) => {
        setEditingNewCell(null)
        setNewRows((prev) => {
            const next = [...prev]
            next[rowIdx] = {
                ...next[rowIdx],
                [col]: isNull ? null : val,
            }
            return next
        })
    }

    // 提交保存所有修改
    const handleSaveAll = async () => {
        if (pkList.length === 0 && Object.keys(rowDrafts).length > 0) {
            message.error('该表未定义主键，无法执行基于主键的精确更新！')
            return
        }

        setSaving(true)
        try {
            // 1. 保存修改行
            for (const [rowIdxStr, patch] of Object.entries(rowDrafts)) {
                const rowIdx = Number(rowIdxStr)
                const origRow = rows[rowIdx]
                const pkCols = pkList
                const pkVals = pkList.map((pk) => origRow[pk])

                const setCols = Object.keys(patch)
                const setVals = Object.values(patch)

                await API.postgresUpdate(
                    serverId,
                    dbName,
                    schema,
                    tableName,
                    setCols,
                    setVals,
                    pkCols,
                    pkVals
                )
            }

            // 2. 保存新增行
            for (const newRow of newRows) {
                const cols = Object.keys(newRow).filter((k) => newRow[k] !== undefined)
                const vals = cols.map((k) => newRow[k])
                if (cols.length > 0) {
                    await API.postgresInsert(serverId, dbName, schema, tableName, cols, vals)
                }
            }

            setRowDrafts({})
            setNewRows([])
            loadData(page, pageSize, activeWhere)
        } catch (e: any) {
            message.error('保存失败: ' + (e.message || e))
        } finally {
            setSaving(false)
        }
    }

    // 删除单行
    const handleDeleteRow = async (rowIdx: number) => {
        if (pkList.length === 0) {
            message.error('该表未定义主键，无法执行精准行删除！')
            return
        }
        const row = rows[rowIdx]
        const pkCols = pkList
        const pkVals = pkList.map((pk) => row[pk])

        try {
            await API.postgresDelete(serverId, dbName, schema, tableName, pkCols, pkVals)
            loadData(page, pageSize, activeWhere)
        } catch (e: any) {
            message.error('删除失败: ' + (e.message || e))
        }
    }

    // 导出文件
    const handleExport = async (mode: 'csv' | 'json') => {
        try {
            const savedPath = await API.postgresExportToFile(
                serverId,
                dbName,
                schema,
                mode,
                'table',
                tableName,
                '',
                0
            )
            if (savedPath) {
                message.success('导出成功: ' + savedPath)
            }
        } catch (e: any) {
            message.error('导出失败: ' + (e.message || e))
        }
    }

    // 新增行
    const handleAddRow = () => {
        const defaultNew: Record<string, any> = {}
        columns.forEach((c) => {
            defaultNew[c] = undefined
        })
        setNewRows((prev) => [defaultNew, ...prev])
    }

    // 构建数据列定义 (ColDef) 用于 ResizableTable
    const dataCols: ColDef[] = useMemo(() => {
        const cols: ColDef[] = [
            {
                key: '__rownum__',
                label: '#',
                width: ROW_NUM_W,
                minWidth: 38,
                resizable: false,
                align: 'center',
            },
            ...columns.map((c) => {
                const isPk = pkList.includes(c)
                const isFk = fkList.includes(c)
                return {
                    key: c,
                    label: (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 2, whiteSpace: 'nowrap' }}>
                            <span>{c}</span>
                            {isPk && <span className={pg.pkBadge}>PK</span>}
                            {isFk && <span className={pg.fkBadge}>FK</span>}
                        </div>
                    ),
                    width: getColW(c),
                    minWidth: 60,
                }
            }),
            {
                key: '__rowact__',
                label: '操作',
                width: ROW_ACT_W,
                minWidth: 42,
                resizable: false,
                align: 'center',
            },
        ]
        return cols
    }, [columns, pkList, fkList, colWidths])

    // 导出菜单项
    const exportMenuItems: MenuProps['items'] = [
        {
            key: 'csv',
            label: '导出为 CSV 文件',
            onClick: () => handleExport('csv'),
        },
        {
            key: 'json',
            label: '导出为 JSON 文件',
            onClick: () => handleExport('json'),
        },
    ]

    return (
        <div className={pg.dataWrap}>
            {/* 顶部工具栏 */}
            <div className={pg.tableHead}>
                <div className={pg.tableNameWrap}>
                    <TableIcon size={15} style={{ color: '#52c41a', flexShrink: 0 }} />
                    <span className={pg.schemaTag}>{schema}</span>
                    <span className={pg.tableName} title={tableName}>{tableName}</span>
                </div>

                <Segmented
                    size="small"
                    className={pg.segmented}
                    value={viewMode}
                    onChange={(v) => setViewMode(v as any)}
                    options={[
                        { label: '数据', value: 'data' },
                        { label: '结构', value: 'struct' },
                        { label: '索引', value: 'index' },
                        { label: '约束', value: 'constraints' },
                        { label: 'DDL', value: 'ddl' },
                    ]}
                />

                <span className={pg.countBadge}>
                    {viewMode === 'data' ? (
                        <>
                            {countingRows && <Loader2 size={11} className={pg.spinning} style={{ color: 'var(--accent)' }} />}
                            <span>{rows.length} 行{newRows.length ? (' +' + newRows.length + ' 新增') : ''}{dirtyCount > 0 ? (' *' + dirtyCount + ' 待保存') : ''}</span>
                        </>
                    ) : viewMode === 'struct' ? (
                        (describeData?.columns?.length ?? 0) + ' 列'
                    ) : viewMode === 'index' ? (
                        (describeData?.indexes?.length ?? 0) + ' 个索引'
                    ) : viewMode === 'constraints' ? (
                        (describeData?.constraints?.length ?? 0) + ' 条约束'
                    ) : (
                        'SQL'
                    )}
                </span>

                <div className={pg.crudActions}>
                    {viewMode === 'data' && (
                        <Space size={6}>
                            <Button
                                size="small"
                                icon={<Plus size={13} />}
                                disabled={loading || saving}
                                onClick={handleAddRow}
                            >
                                新增行
                            </Button>

                            <Button
                                size="small"
                                type={dirtyCount > 0 ? 'primary' : 'default'}
                                icon={<Save size={13} />}
                                disabled={dirtyCount === 0 || saving}
                                loading={saving}
                                onClick={handleSaveAll}
                            >
                                保存修改 {dirtyCount > 0 ? ('(' + dirtyCount + ')') : ''}
                            </Button>

                            <Dropdown menu={{ items: exportMenuItems }}>
                                <Button size="small" icon={<Download size={13} />}>
                                    导出
                                </Button>
                            </Dropdown>
                        </Space>
                    )}

                    <Tooltip title="刷新">
                        <Button
                            size="small"
                            icon={<RotateCw size={13} />}
                            loading={loading}
                            onClick={() => {
                                if (viewMode === 'data') loadData(page, pageSize, activeWhere)
                                else if (viewMode === 'struct') loadStructure()
                                else if (viewMode === 'index' || viewMode === 'constraints') loadStructure()
                                else loadDDL()
                            }}
                        />
                    </Tooltip>

                    {onClose && (
                        <Tooltip title="关闭表">
                            <Button size="small" type="text" icon={<X size={13} />} onClick={onClose} />
                        </Tooltip>
                    )}
                </div>
            </div>

            {/* 数据视图 */}
            {viewMode === 'data' && (
                <>
                    {/* WHERE 过滤条件栏 */}
                    <div className={pg.filterBar}>
                        <Filter size={14} style={{ color: 'var(--text-dim)', flexShrink: 0 }} />
                        <Input
                            size="small"
                            style={{ flex: 1, fontFamily: 'monospace', fontSize: 12 }}
                            placeholder="输入过滤条件 (例如: id > 100 AND status = 'active')"
                            value={whereInput}
                            onChange={(e) => setWhereInput(e.target.value)}
                            onPressEnter={() => {
                                setActiveWhere(whereInput.trim())
                                setPage(1)
                                loadData(1, pageSize, whereInput.trim())
                            }}
                        />
                        <Button
                            size="small"
                            type="primary"
                            onClick={() => {
                                setActiveWhere(whereInput.trim())
                                setPage(1)
                                loadData(1, pageSize, whereInput.trim())
                            }}
                        >
                            筛选
                        </Button>
                        {activeWhere && (
                            <Button
                                size="small"
                                onClick={() => {
                                    setWhereInput('')
                                    setActiveWhere('')
                                    setPage(1)
                                    loadData(1, pageSize, '')
                                }}
                            >
                                清除
                            </Button>
                        )}
                    </div>

                    {/* 表格主体：使用 ResizableTable 渲染 */}
                    <ResizableTable
                        cols={dataCols}
                        data={rows}
                        onColResize={handleColResize}
                        className={pg.editTable}
                    >
                        <tbody>
                            {/* 渲染未保存的新增行 */}
                            {newRows.map((newRow, nIdx) => (
                                <tr key={'new_' + nIdx} className={pg.rowNew}>
                                    <td className={pg.rownum} style={{ color: '#52c41a', fontWeight: 700 }}>+</td>
                                    {columns.map((c) => {
                                        const isEditing = editingNewCell?.rowIdx === nIdx && editingNewCell?.col === c
                                        const val = newRow[c]
                                        return (
                                            <td
                                                key={c}
                                                onClick={() => !isEditing && setEditingNewCell({ rowIdx: nIdx, col: c })}
                                                title="点击编辑"
                                            >
                                                {isEditing ? (
                                                    <CellEditorInline
                                                        value={val !== undefined && val !== null ? String(val) : ''}
                                                        isNull={val === null}
                                                        onCommit={(v, isN) => handleCommitNewCell(nIdx, c, v, isN)}
                                                        onCancel={() => setEditingNewCell(null)}
                                                    />
                                                ) : val === null ? (
                                                    <span className={pg.cellNull}>NULL</span>
                                                ) : val !== undefined ? (
                                                    String(val)
                                                ) : (
                                                    <span className={pg.cellNull}>DEFAULT</span>
                                                )}
                                            </td>
                                        )
                                    })}
                                    <td className={pg.rowact}>
                                        <Tooltip title="移除该新增行">
                                            <Button
                                                type="text"
                                                danger
                                                size="small"
                                                icon={<Trash2 size={13} />}
                                                onClick={() => setNewRows((prev) => prev.filter((_, i) => i !== nIdx))}
                                            />
                                        </Tooltip>
                                    </td>
                                </tr>
                            ))}

                            {/* 渲染已持久化的行 */}
                            {rows.map((row, rIdx) => {
                                const isRowDirty = !!rowDrafts[rIdx]
                                return (
                                    <tr key={rIdx}>
                                        <td className={pg.rownum}>{(page - 1) * pageSize + rIdx + 1}</td>
                                        {columns.map((c) => {
                                            const isEditing = editingCell?.rowIdx === rIdx && editingCell?.col === c
                                            const isCellDirty = rowDrafts[rIdx] && rowDrafts[rIdx][c] !== undefined
                                            const val = isCellDirty ? rowDrafts[rIdx][c] : row[c]
                                            const isNull = val === null || val === undefined

                                            return (
                                                <td
                                                    key={c}
                                                    className={(isCellDirty ? pg.cellDirty : '') + (isNull ? (' ' + pg.cellNull) : '')}
                                                    onClick={() => !isEditing && setEditingCell({ rowIdx: rIdx, col: c })}
                                                    title="点击编辑"
                                                >
                                                    {isEditing ? (
                                                        <CellEditorInline
                                                            value={isNull ? '' : String(val)}
                                                            isNull={isNull}
                                                            onCommit={(v, isN) => handleCommitCell(rIdx, c, v, isN)}
                                                            onCancel={() => setEditingCell(null)}
                                                        />
                                                    ) : isNull ? (
                                                        <span className={sh.mysqlNull}>NULL</span>
                                                    ) : typeof val === 'object' ? (
                                                        JSON.stringify(val)
                                                    ) : (
                                                        String(val)
                                                    )}
                                                </td>
                                            )
                                        })}
                                        <td className={pg.rowact}>
                                            <Tooltip title="删除该行">
                                                <Button
                                                    type="text"
                                                    danger
                                                    size="small"
                                                    icon={<Trash2 size={13} />}
                                                    disabled={loading || saving}
                                                    onClick={() => handleDeleteRow(rIdx)}
                                                />
                                            </Tooltip>
                                        </td>
                                    </tr>
                                )
                            })}

                            {!rows.length && !newRows.length && (
                                <tr>
                                    <td colSpan={columns.length + 2} className={db.dbEmpty}>
                                        {loading ? '加载数据中...' : '暂无数据，可点击「新增行」插入数据'}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </ResizableTable>

                    {/* 底部翻页栏 */}
                    <div className={pg.tablePager}>
                        <span className={pg.countBadge}>
                            {countingRows ? (
                                <>
                                    <Loader2 size={12} className={pg.spinning} style={{ color: 'var(--accent)' }} />
                                    <span>共 {totalRows > 0 ? (totalRows + '+') : '...'} 条 (计算中)</span>
                                </>
                            ) : (
                                '共 ' + totalRows + ' 条数据'
                            )}
                        </span>

                        <Pagination
                            size="small"
                            current={page}
                            pageSize={pageSize}
                            total={totalRows}
                            disabled={loading}
                            showSizeChanger
                            pageSizeOptions={['20', '50', '100', '200', '500']}
                            onChange={(p, s) => {
                                if (s !== pageSize) {
                                    setPageSize(s)
                                    setPage(1)
                                    loadData(1, s, activeWhere)
                                } else {
                                    setPage(p)
                                    loadData(p, pageSize, activeWhere)
                                }
                            }}
                        />
                    </div>
                </>
            )}

            {/* 结构视图 */}
            {viewMode === 'struct' && (
                <div className={db.dbTableScroll}>
                    <table className={db.dbTable}>
                        <thead>
                            <tr>
                                <th style={{ width: 40, textAlign: 'center' }}>#</th>
                                <th>列名 (Column)</th>
                                <th>数据类型 (Data Type)</th>
                                <th>允许为空 (Nullable)</th>
                                <th>默认值 (Default)</th>
                                <th>主键 (PK)</th>
                                <th>外键 (FK)</th>
                                <th>注释 (Comment)</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(describeData?.columns || []).map((col, idx) => (
                                <tr key={col.name}>
                                    <td style={{ textAlign: 'center', color: 'var(--text-faint)' }}>{idx + 1}</td>
                                    <td>
                                        <strong style={{ fontFamily: 'monospace' }}>{col.name}</strong>
                                    </td>
                                    <td>
                                        <Tag color="blue">{col.dataType}</Tag>
                                        {col.udtName && col.udtName !== col.dataType && (
                                            <span style={{ fontSize: 11, color: 'var(--text-dim)', marginLeft: 4 }}>({col.udtName})</span>
                                        )}
                                    </td>
                                    <td>
                                        {col.isNullable ? (
                                            <Tag color="default">YES</Tag>
                                        ) : (
                                            <Tag color="error">NO (NOT NULL)</Tag>
                                        )}
                                    </td>
                                    <td style={{ fontFamily: 'monospace', fontSize: 12 }}>
                                        {col.defaultVal || <span className={sh.mysqlNull}>-</span>}
                                    </td>
                                    <td>
                                        {col.isPrimaryKey && <span className={pg.pkBadge}>PK</span>}
                                    </td>
                                    <td>
                                        {col.isForeignKey && <span className={pg.fkBadge}>FK</span>}
                                    </td>
                                    <td style={{ color: 'var(--text-dim)' }}>
                                        {col.comment || '-'}
                                    </td>
                                </tr>
                            ))}
                            {(!describeData || describeData.columns.length === 0) && (
                                <tr>
                                    <td colSpan={8} className={db.dbEmpty}>暂无结构信息</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {/* 索引视图 */}
            {viewMode === 'index' && (
                <div className={db.dbTableScroll}>
                    <table className={db.dbTable}>
                        <thead>
                            <tr>
                                <th style={{ width: 40, textAlign: 'center' }}>#</th>
                                <th>索引名称 (Index Name)</th>
                                <th>类型 (Type)</th>
                                <th>占用大小 (Size)</th>
                                <th>定义语句 (Definition)</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(describeData?.indexes || []).map((idx, i) => (
                                <tr key={idx.name}>
                                    <td style={{ textAlign: 'center', color: 'var(--text-faint)' }}>{i + 1}</td>
                                    <td>
                                        <strong style={{ fontFamily: 'monospace' }}>{idx.name}</strong>
                                    </td>
                                    <td>
                                        {idx.isPrimary ? (
                                            <Tag color="red">PRIMARY KEY</Tag>
                                        ) : idx.isUnique ? (
                                            <Tag color="orange">UNIQUE</Tag>
                                        ) : (
                                            <Tag color="geekblue">INDEX</Tag>
                                        )}
                                    </td>
                                    <td>{idx.size || '-'}</td>
                                    <td style={{ fontFamily: 'monospace', fontSize: 12, maxWidth: 500, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        {idx.def}
                                    </td>
                                </tr>
                            ))}
                            {(!describeData || describeData.indexes.length === 0) && (
                                <tr>
                                    <td colSpan={5} className={db.dbEmpty}>暂无索引</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {/* 约束视图 */}
            {viewMode === 'constraints' && (
                <div className={db.dbTableScroll}>
                    <table className={db.dbTable}>
                        <thead>
                            <tr>
                                <th style={{ width: 40, textAlign: 'center' }}>#</th>
                                <th>约束名称 (Constraint Name)</th>
                                <th>约束类型 (Type)</th>
                                <th>定义 / 引用目标 (Definition / References)</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(describeData?.constraints || []).map((c, i) => (
                                <tr key={c.name}>
                                    <td style={{ textAlign: 'center', color: 'var(--text-faint)' }}>{i + 1}</td>
                                    <td>
                                        <strong style={{ fontFamily: 'monospace' }}>{c.name}</strong>
                                    </td>
                                    <td>
                                        <Tag color={c.type === 'PRIMARY KEY' ? 'red' : c.type === 'FOREIGN KEY' ? 'purple' : 'cyan'}>
                                            {c.type}
                                        </Tag>
                                    </td>
                                    <td style={{ fontFamily: 'monospace', fontSize: 12 }}>
                                        {c.foreignTable ? (
                                            <span>
                                                REFERENCES <strong>{(c.foreignSchema ? (c.foreignSchema + '.') : '') + c.foreignTable}</strong>{`(${c.foreignColumn || ''})`}
                                            </span>
                                        ) : (
                                            c.def || '-'
                                        )}
                                    </td>
                                </tr>
                            ))}
                            {(!describeData || describeData.constraints.length === 0) && (
                                <tr>
                                    <td colSpan={4} className={db.dbEmpty}>暂无约束</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {/* DDL 视图 */}
            {viewMode === 'ddl' && (
                <div style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>
                    <div style={{ position: 'absolute', top: 12, right: 16, zIndex: 10 }}>
                        <Button
                            size="small"
                            icon={<Copy size={13} />}
                            onClick={() => {
                                navigator.clipboard.writeText(ddlText)
                            }}
                        >
                            复制 DDL
                        </Button>
                    </div>
                    <pre className={pg.ddlViewer}>{ddlText || '-- 正在生成 DDL 语句...'}</pre>
                </div>
            )}
        </div>
    )
}