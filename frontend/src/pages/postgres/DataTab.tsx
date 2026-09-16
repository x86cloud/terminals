import React, { useState, useEffect, useMemo } from 'react'
import { Segmented, Button, Input, Pagination, Tooltip, message, Space, Tag, Dropdown, MenuProps, Popconfirm, Modal } from 'antd'
import {
    RotateCw,
    Plus,
    Save,
    Trash2,
    Download,
    Copy,
    Filter,
    X,
    Loader2,
    Table as TableIcon,
    ArrowUp,
    ArrowDown,
    ArrowUpDown,
    FileCode,
    Code,
    Slash,
    CopyPlus,
} from 'lucide-react'
import { API } from '@/api'
import { isSameCellValue, coerceCellValue } from '@/utils'
import ResizableTable, { ColDef, calcColWidthFromName } from '@/components/ResizableTable'
import ColumnFilterPopover, {
    ColumnFilterState,
    buildPgWhereClause,
    OP_LABELS,
} from '@/components/ColumnFilterPopover'
import { buildInsertSql, buildUpdateSql, copyTextToClipboard } from '@/utils/sqlExport'
import { PgColumn, PgIndex, PgConstraint, PgQueryResult } from './postgresTypes'
import CellEditorInline from './CellEditorInline'
import pg from './DataTab.module.less'
import db from '@/pages/mysql/dbTable.module.less'
import sh from '@/pages/mysql/mysqlShared.module.less'

const ROW_NUM_W = 46

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
    const [filters, setFilters] = useState<Record<string, ColumnFilterState>>({})
    const [sortCol, setSortCol] = useState('')
    const [sortOrder, setSortOrder] = useState<'ASC' | 'DESC'>('ASC')
    const [countingRows, setCountingRows] = useState(false)

    const activeWhere = useMemo(() => buildPgWhereClause(filters), [filters])
    const activeFilterEntries = useMemo(() => {
        return Object.entries(filters).filter(([_, f]) => !!f)
    }, [filters])

    const handleFilterChange = (col: string, filter: ColumnFilterState | null) => {
        setFilters((prev) => {
            const next = { ...prev }
            if (filter) {
                next[col] = filter
            } else {
                delete next[col]
            }
            const newWhere = buildPgWhereClause(next)
            setPage(1)
            loadData(1, pageSize, newWhere)
            return next
        })
    }

    const handleClearAllFilters = () => {
        setFilters({})
        setPage(1)
        loadData(1, pageSize, '')
    }

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

    const getColW = (key: string, isPk = false, isFk = false) => {
        const minW = calcColWidthFromName(key, { isPk, isFk, hasFilter: true, minWidth: 95 })
        if (colWidths[key] !== undefined) {
            return Math.max(minW, colWidths[key])
        }
        return minW
    }

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
    const loadData = async (
        targetPage = page,
        targetSize = pageSize,
        where = activeWhere,
        targetSortCol = sortCol,
        targetSortOrder = sortOrder
    ) => {
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
                targetSortCol,
                targetSortOrder,
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

    // 列头点击排序循环切换：未排序 -> ASC -> DESC -> 取消排序
    const handleHeaderSort = (colName: string) => {
        let nextSortCol = colName
        let nextSortOrder: 'ASC' | 'DESC' = 'ASC'

        if (sortCol === colName) {
            if (sortOrder === 'ASC') {
                nextSortOrder = 'DESC'
            } else {
                nextSortCol = ''
                nextSortOrder = 'ASC'
            }
        }

        setSortCol(nextSortCol)
        setSortOrder(nextSortOrder)
        setPage(1)
        loadData(1, pageSize, activeWhere, nextSortCol, nextSortOrder)
    }

    useEffect(() => {
        setFilters({})
        setSortCol('')
        setSortOrder('ASC')
        setPage(1)
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

    // 右键上下文菜单状态
    const [contextMenu, setContextMenu] = useState<{
        open: boolean
        x: number
        y: number
        rowIdx: number
        colKey?: string
        isNewRow?: boolean
    } | null>(null)

    const handleCellContextMenu = (
        e: React.MouseEvent,
        rowIdx: number,
        colKey?: string,
        isNewRow = false
    ) => {
        e.preventDefault()
        e.stopPropagation()
        setContextMenu({
            open: true,
            x: e.clientX,
            y: e.clientY,
            rowIdx,
            colKey,
            isNewRow,
        })
    }

    const getContextMenuItems = (): MenuProps['items'] => {
        if (!contextMenu) return []
        const { rowIdx, colKey, isNewRow } = contextMenu
        const targetRow = isNewRow ? newRows[rowIdx] : rows[rowIdx]
        if (!targetRow) return []

        const cellVal = colKey
            ? isNewRow
                ? targetRow[colKey]
                : (rowDrafts[rowIdx] && rowDrafts[rowIdx][colKey] !== undefined ? rowDrafts[rowIdx][colKey] : targetRow[colKey])
            : undefined

        const items: MenuProps['items'] = []

        // 1. 复制单元格值
        if (colKey) {
            items.push({
                key: 'copy-cell',
                icon: <Copy size={13} />,
                label: `复制`,
                onClick: () => {
                    const str = cellVal === null || cellVal === undefined
                        ? ''
                        : (typeof cellVal === 'object' ? JSON.stringify(cellVal) : String(cellVal))
                    copyTextToClipboard(str, `已复制`)
                },
            })
        }

        // 2. 复制为 INSERT 语句
        items.push({
            key: 'copy-insert',
            icon: <FileCode size={13} />,
            label: '复制为 INSERT 语句',
            onClick: () => {
                const fullRow = { ...targetRow, ...(rowDrafts[rowIdx] || {}) }
                const sql = buildInsertSql({
                    dialect: 'postgres',
                    table: tableName,
                    columns,
                    rowData: fullRow,
                })
                copyTextToClipboard(sql, '已复制 INSERT 语句到剪贴板')
            },
        })

        // 3. 复制为 UPDATE 语句 (仅针对已持久化行且存在主键)
        if (!isNewRow && pkList.length > 0) {
            items.push({
                key: 'copy-update',
                icon: <FileCode size={13} />,
                label: '复制为 UPDATE 语句',
                onClick: () => {
                    const fullRow = { ...targetRow, ...(rowDrafts[rowIdx] || {}) }
                    const sql = buildUpdateSql({
                        dialect: 'postgres',
                        table: tableName,
                        columns,
                        rowData: fullRow,
                        pkList,
                    })
                    copyTextToClipboard(sql, '已复制 UPDATE 语句到剪贴板')
                },
            })
        }

        // 4. 复制整行为 JSON
        items.push({
            key: 'copy-json',
            icon: <Code size={13} />,
            label: '复制整行为 JSON',
            onClick: () => {
                const fullRow = { ...targetRow, ...(rowDrafts[rowIdx] || {}) }
                const json = JSON.stringify(fullRow, null, 2)
                copyTextToClipboard(json, '已复制整行 JSON 到剪贴板')
            },
        })

        items.push({ type: 'divider' })

        // 5. 复制并新增 (克隆行)
        items.push({
            key: 'clone-row',
            icon: <CopyPlus size={13} />,
            label: '克隆当前行并新增',
            onClick: () => {
                const cloned: Record<string, any> = { ...targetRow, ...(rowDrafts[rowIdx] || {}) }
                // 主键列置为 undefined
                pkList.forEach((pk) => {
                    cloned[pk] = undefined
                })
                setNewRows((prev) => [cloned, ...prev])
                message.success('已克隆数据并插入到新增行草稿')
            },
        })

        // 6. 将单元格设为 NULL
        if (colKey) {
            items.push({
                key: 'set-null',
                icon: <Slash size={13} />,
                label: `设为 NULL`,
                onClick: () => {
                    if (isNewRow) {
                        handleCommitNewCell(rowIdx, colKey, '', true)
                    } else {
                        handleCommitCell(rowIdx, colKey, '', true)
                    }
                    message.info(`已将 [${colKey}] 标记为 NULL`)
                },
            })
        }

        items.push({ type: 'divider' })

        // 7. 删除行
        if (isNewRow) {
            items.push({
                key: 'delete-row',
                icon: <Trash2 size={13} />,
                danger: true,
                label: '移除该新增行草稿',
                onClick: () => {
                    setNewRows((prev) => prev.filter((_, i) => i !== rowIdx))
                    message.info('已移除新增行草稿')
                },
            })
        } else {
            items.push({
                key: 'delete-row',
                icon: <Trash2 size={13} />,
                danger: true,
                disabled: pkList.length === 0,
                label: pkList.length === 0 ? '删除该行 (表缺少主键)' : '删除该行',
                onClick: () => {
                    if (pkList.length === 0) {
                        message.warning('该表未定义主键，无法执行精确物理删除')
                        return
                    }
                    const pkSummary = pkList.map((pk) => `${pk} = ${targetRow[pk]}`).join(', ')
                    Modal.confirm({
                        title: '确定删除选中的数据行吗？',
                        content: `定位主键: [ ${pkSummary} ]。物理删除后不可撤销，请确认！`,
                        okText: '确定删除',
                        cancelText: '取消',
                        okButtonProps: { danger: true },
                        onOk: async () => {
                            await handleDeleteRow(rowIdx)
                        },
                    })
                },
            })
        }

        return items
    }

    // 构建数据列定义 (ColDef) 用于 ResizableTable（已去除“操作”列）
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
                const isSorted = sortCol === c
                const activeFilter = filters[c]
                const headerMinW = calcColWidthFromName(c, {
                    isPk,
                    isFk,
                    hasFilter: true,
                    minWidth: 95,
                })
                return {
                    key: c,
                    isPk,
                    isFk,
                    hasFilter: true,
                    label: (
                        <div
                            className={pg.headerCol}
                            onClick={() => handleHeaderSort(c)}
                            title={isSorted ? `当前按 ${c} ${sortOrder === 'ASC' ? '升序' : '降序'}排列 (点击切换)` : `点击按 ${c} 排序`}
                        >
                            {isPk ? (
                                <span className={pg.pkBadge} title="主键 (Primary Key)">{c}</span>
                            ) : (
                                <span className={pg.headerColText}>{c}</span>
                            )}
                            {isFk && <span className={pg.fkBadge}>FK</span>}
                            <span className={`${pg.sortIconWrap} ${isSorted ? pg.sortActive : pg.sortIdle}`}>
                                {isSorted ? (
                                    sortOrder === 'ASC' ? (
                                        <ArrowUp size={12} />
                                    ) : (
                                        <ArrowDown size={12} />
                                    )
                                ) : (
                                    <ArrowUpDown size={12} />
                                )}
                            </span>
                            <ColumnFilterPopover
                                col={c}
                                activeFilter={activeFilter}
                                onApply={(f) => handleFilterChange(c, f)}
                            />
                        </div>
                    ),
                    width: getColW(c, isPk, isFk),
                    minWidth: headerMinW,
                }
            }),
        ]
        return cols
    }, [columns, pkList, fkList, colWidths, sortCol, sortOrder, filters, rows.length])

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

                {viewMode === 'data' && activeFilterEntries.length > 0 && (
                    <div className={pg.activeFiltersWrap}>
                        <Filter size={12} className={pg.activeFilterIcon} />
                        <span className={pg.activeFilterLabel}>已筛选:</span>
                        <div className={pg.activeFilterTags}>
                            {activeFilterEntries.map(([col, f]) => (
                                <Tag
                                    key={col}
                                    closable
                                    className={pg.filterTag}
                                    onClose={() => handleFilterChange(col, null)}
                                >
                                    <span className={pg.filterTagCol}>{col}</span>
                                    <span className={pg.filterTagOp}>{OP_LABELS[f.op]}</span>
                                    {f.op !== 'is_null' && f.op !== 'is_not_null' && (
                                        <span className={pg.filterTagVal}>'{f.value}'</span>
                                    )}
                                </Tag>
                            ))}
                        </div>
                        <Button
                            size="small"
                            type="link"
                            className={pg.clearAllBtn}
                            onClick={handleClearAllFilters}
                        >
                            清除全部
                        </Button>
                    </div>
                )}

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
                                <tr
                                    key={'new_' + nIdx}
                                    className={pg.rowNew}
                                    onContextMenu={(e) => handleCellContextMenu(e, nIdx, undefined, true)}
                                >
                                    <td
                                        className={pg.rownum}
                                        style={{ color: '#52c41a', fontWeight: 700 }}
                                        onContextMenu={(e) => handleCellContextMenu(e, nIdx, undefined, true)}
                                    >
                                        +
                                    </td>
                                    {columns.map((c) => {
                                        const isEditing = editingNewCell?.rowIdx === nIdx && editingNewCell?.col === c
                                        const val = newRow[c]
                                        return (
                                            <td
                                                key={c}
                                                onClick={() => !isEditing && setEditingNewCell({ rowIdx: nIdx, col: c })}
                                                onContextMenu={(e) => handleCellContextMenu(e, nIdx, c, true)}
                                                title="点击编辑，右键更多操作"
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
                                </tr>
                            ))}

                            {/* 渲染已持久化的行 */}
                            {rows.map((row, rIdx) => {
                                const isRowDirty = !!rowDrafts[rIdx]
                                return (
                                    <tr
                                        key={rIdx}
                                        onContextMenu={(e) => handleCellContextMenu(e, rIdx, undefined, false)}
                                    >
                                        <td
                                            className={pg.rownum}
                                            onContextMenu={(e) => handleCellContextMenu(e, rIdx, undefined, false)}
                                        >
                                            {(page - 1) * pageSize + rIdx + 1}
                                        </td>
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
                                                    onContextMenu={(e) => handleCellContextMenu(e, rIdx, c, false)}
                                                    title="点击编辑，右键更多操作"
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
                                    </tr>
                                )
                            })}

                            {!rows.length && !newRows.length && (
                                <tr>
                                    <td colSpan={columns.length + 1} className={db.dbEmpty}>
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

            {/* 行右键上下文菜单 */}
            {contextMenu && (
                <Dropdown
                    menu={{ items: getContextMenuItems() }}
                    open={contextMenu.open}
                    onOpenChange={(v) => !v && setContextMenu(null)}
                >
                    <span
                        style={{
                            position: 'fixed',
                            left: contextMenu.x,
                            top: contextMenu.y,
                            width: 1,
                            height: 1,
                            pointerEvents: 'none',
                        }}
                    />
                </Dropdown>
            )}
        </div>
    )
}