import React, { useState, useEffect, useMemo } from 'react'
import {
    Segmented,
    Button,
    Pagination,
    Tooltip,
    message,
    Space,
    Tag,
    Dropdown,
    MenuProps,
    Modal,
} from 'antd'
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
    Code,
    Slash,
    CopyPlus,
} from 'lucide-react'
import { isSameCellValue, coerceCellValue } from '@/utils'
import ResizableTable, { ColDef, calcColWidthFromName } from '@/components/ResizableTable'
import ColumnFilterPopover, {
    ColumnFilterState,
    OP_LABELS,
} from '@/components/ColumnFilterPopover'
import { buildInsertSql, buildUpdateSql, copyTextToClipboard } from '@/utils/sqlExport'
import CellEditorInline from '@/components/common/CellEditorInline'
import { DbAdapter, DbTableStructure } from '../types'
import s from './DbDataTab.module.less'

const ROW_NUM_W = 46

export interface DbDataTabProps {
    adapter: DbAdapter
    onClose?: () => void
}

export default function DbDataTab({ adapter, onClose }: DbDataTabProps) {
    const { serverId, dbName, schema, tableName } = adapter

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

    // 列宽状态
    const [colWidths, setColWidths] = useState<Record<string, number>>({})

    // 描述与结构
    const [structure, setStructure] = useState<DbTableStructure | null>(null)
    const [ddlText, setDdlText] = useState('')

    // 编辑与脏数据管理
    const [editingCell, setEditingCell] = useState<{ rowIdx: number; col: string } | null>(null)
    const [rowDrafts, setRowDrafts] = useState<Record<number, Record<string, any>>>({})
    const [newRows, setNewRows] = useState<Record<string, any>[]>([])
    const [editingNewCell, setEditingNewCell] = useState<{ rowIdx: number; col: string } | null>(null)
    const [saving, setSaving] = useState(false)

    // 右键上下文菜单
    const [contextMenu, setContextMenu] = useState<{
        open: boolean
        x: number
        y: number
        rowIdx: number
        colKey?: string
        isNewRow?: boolean
    } | null>(null)

    const activeWhere = useMemo(() => adapter.buildWhereClause(filters), [filters, adapter])
    const activeFilterEntries = useMemo(() => {
        return Object.entries(filters).filter(([_, f]) => !!f)
    }, [filters])

    const pkList = useMemo(() => {
        if (!structure) return []
        return structure.columns.filter((c) => c.isPrimaryKey).map((c) => c.name)
    }, [structure])

    const fkList = useMemo(() => {
        if (!structure) return []
        return structure.columns.filter((c) => c.isForeignKey).map((c) => c.name)
    }, [structure])

    const dirtyCount = Object.keys(rowDrafts).length + newRows.length

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

    // 加载表结构与元数据
    const loadStructure = async () => {
        try {
            const data = await adapter.loadStructure()
            setStructure(data)
        } catch (e: any) {
            console.error('加载结构失败:', e)
        }
    }

    // 加载 DDL
    const loadDDL = async () => {
        try {
            const ddl = await adapter.loadDDL()
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
            const res = await adapter.loadData({
                page: targetPage,
                pageSize: targetSize,
                where,
                sortCol: targetSortCol,
                sortOrder: targetSortOrder,
            })
            setColumns(res.columns || [])
            setRows(res.rows || [])
            setRowDrafts({})
            setNewRows([])

            // 统计总数
            setCountingRows(true)
            adapter
                .countData(where)
                .then((cnt) => setTotalRows(cnt))
                .catch(() => {})
                .finally(() => setCountingRows(false))
        } catch (e: any) {
            message.error('查询数据失败: ' + (e.message || e))
        } finally {
            setLoading(false)
        }
    }

    const handleFilterChange = (col: string, filter: ColumnFilterState | null) => {
        setFilters((prev) => {
            const next = { ...prev }
            if (filter) {
                next[col] = filter
            } else {
                delete next[col]
            }
            const newWhere = adapter.buildWhereClause(next)
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
            if (Object.keys(rowDrafts).length > 0) {
                await adapter.updateRows(rowDrafts, rows, pkList)
            }
            if (newRows.length > 0) {
                await adapter.insertRows(newRows)
            }

            setRowDrafts({})
            setNewRows([])
            message.success('数据已成功保存')
            loadData(page, pageSize, activeWhere)
        } catch (e: any) {
            message.error('保存失败: ' + (e.message || e))
        } finally {
            setSaving(false)
        }
    }

    // 放弃所有草稿修改
    const handleDiscardAll = () => {
        setRowDrafts({})
        setNewRows([])
        setEditingCell(null)
        setEditingNewCell(null)
        message.info('已放弃所有未保存修改')
    }

    // 删除单行
    const handleDeleteRow = async (rowIdx: number) => {
        if (pkList.length === 0) {
            message.error('该表未定义主键，无法执行精准行删除！')
            return
        }
        const row = rows[rowIdx]
        try {
            await adapter.deleteRow(row, pkList)
            message.success('已删除数据行')
            loadData(page, pageSize, activeWhere)
        } catch (e: any) {
            message.error('删除失败: ' + (e.message || e))
        }
    }

    // 新增一行草稿
    const handleAddNewRow = () => {
        const initRow: Record<string, any> = {}
        columns.forEach((c) => {
            initRow[c] = null
        })
        setNewRows((prev) => [...prev, initRow])
    }

    // 导出文件
    const handleExport = async (mode: 'csv' | 'json') => {
        if (!adapter.exportToFile) {
            message.info('当前适配器不支持直接导出到文件')
            return
        }
        try {
            const savedPath = await adapter.exportToFile(mode, 0)
            if (savedPath) {
                message.success(`已导出到: ${savedPath}`)
            }
        } catch (e: any) {
            message.error(`导出失败: ${e.message || e}`)
        }
    }

    // 右键上下文菜单事件
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

        const items: NonNullable<MenuProps['items']> = []

        // 1. 复制单元格值
        if (colKey) {
            const isDraft = !isNewRow && rowDrafts[rowIdx] && rowDrafts[rowIdx][colKey] !== undefined
            const currentVal = isDraft
                ? rowDrafts[rowIdx][colKey]
                : isNewRow
                ? targetRow[colKey]
                : targetRow[colKey]
            const valStr = currentVal === null || currentVal === undefined ? '' : String(currentVal)
            items.push({
                key: 'copy-cell',
                icon: <Copy size={13} />,
                label: `复制单元格值 [${colKey}]`,
                onClick: () => copyTextToClipboard(valStr, '已复制单元格值'),
            })
        }

        // 2. 复制整行作为 INSERT SQL
        items.push({
            key: 'copy-insert',
            icon: <Code size={13} />,
            label: '复制整行为 INSERT SQL',
            onClick: () => {
                const fullRow = { ...targetRow, ...(rowDrafts[rowIdx] || {}) }
                const sql = buildInsertSql({
                    dialect: adapter.dialect,
                    table: tableName,
                    columns,
                    rowData: fullRow,
                })
                copyTextToClipboard(sql, '已复制 INSERT 语句到剪贴板')
            },
        })

        // 3. 复制整行作为 UPDATE SQL
        if (!isNewRow && pkList.length > 0) {
            items.push({
                key: 'copy-update',
                icon: <Code size={13} />,
                label: '复制整行为 UPDATE SQL',
                onClick: () => {
                    const fullRow = { ...targetRow, ...(rowDrafts[rowIdx] || {}) }
                    const sql = buildUpdateSql({
                        dialect: adapter.dialect,
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
                            className={s.headerCol}
                            onClick={() => handleHeaderSort(c)}
                            title={
                                isSorted
                                    ? `当前按 ${c} ${sortOrder === 'ASC' ? '升序' : '降序'}排列 (点击切换)`
                                    : `点击按 ${c} 排序`
                            }
                        >
                            {isPk ? (
                                <span className={s.pkBadge} title="主键 (Primary Key)">
                                    {c}
                                </span>
                            ) : (
                                <span className={s.headerColText}>{c}</span>
                            )}
                            {isFk && <span className={s.fkBadge}>FK</span>}
                            <span className={`${s.sortIconWrap} ${isSorted ? s.sortActive : s.sortIdle}`}>
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
        <div className={s.dataWrap}>
            {/* 顶部工具栏 */}
            <div className={s.tableHead}>
                <div className={s.tableNameWrap}>
                    <TableIcon size={15} style={{ color: '#52c41a', flexShrink: 0 }} />
                    {schema && <span className={s.schemaTag}>{schema}</span>}
                    <span className={s.tableName} title={tableName}>
                        {tableName}
                    </span>
                </div>

                <Segmented
                    size="small"
                    className={s.segmented}
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

                <span className={s.countBadge}>
                    {viewMode === 'data' ? (
                        <>
                            {countingRows && (
                                <Loader2 size={11} className={s.spinning} style={{ color: 'var(--accent)' }} />
                            )}
                            <span>
                                {rows.length} 行{newRows.length ? ' +' + newRows.length + ' 新增' : ''}
                                {dirtyCount > 0 ? ' *' + dirtyCount + ' 待保存' : ''}
                            </span>
                        </>
                    ) : viewMode === 'struct' ? (
                        (structure?.columns?.length ?? 0) + ' 列'
                    ) : viewMode === 'index' ? (
                        (structure?.indexes?.length ?? 0) + ' 个索引'
                    ) : viewMode === 'constraints' ? (
                        (structure?.constraints?.length ?? 0) + ' 条约束'
                    ) : (
                        'SQL'
                    )}
                </span>

                {viewMode === 'data' && activeFilterEntries.length > 0 && (
                    <div className={s.activeFiltersWrap}>
                        <Filter size={12} className={s.activeFilterIcon} />
                        <span className={s.activeFilterLabel}>已筛选:</span>
                        <div className={s.activeFilterTags}>
                            {activeFilterEntries.map(([col, f]) => (
                                <Tag
                                    key={col}
                                    closable
                                    className={s.filterTag}
                                    onClose={() => handleFilterChange(col, null)}
                                >
                                    <span className={s.filterTagCol}>{col}</span>
                                    <span className={s.filterTagOp}>{OP_LABELS[f.op]}</span>
                                    {f.op !== 'is_null' && f.op !== 'is_not_null' && (
                                        <span className={s.filterTagVal}>'{f.value}'</span>
                                    )}
                                </Tag>
                            ))}
                        </div>
                        <Button
                            size="small"
                            type="link"
                            className={s.clearAllBtn}
                            onClick={handleClearAllFilters}
                        >
                            清除全部
                        </Button>
                    </div>
                )}

                <div className={s.crudActions}>
                    {viewMode === 'data' && (
                        <Space size={6}>
                            <Button
                                size="small"
                                icon={<Plus size={13} />}
                                disabled={loading || saving}
                                onClick={handleAddNewRow}
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
                                保存修改 {dirtyCount > 0 ? '(' + dirtyCount + ')' : ''}
                            </Button>

                            {dirtyCount > 0 && (
                                <Button size="small" onClick={handleDiscardAll} disabled={saving}>
                                    放弃
                                </Button>
                            )}

                            {adapter.exportToFile && (
                                <Dropdown menu={{ items: exportMenuItems }}>
                                    <Button size="small" icon={<Download size={13} />}>
                                        导出
                                    </Button>
                                </Dropdown>
                            )}
                        </Space>
                    )}

                    <Tooltip title="刷新">
                        <Button
                            size="small"
                            icon={<RotateCw size={13} />}
                            loading={loading}
                            onClick={() => {
                                if (viewMode === 'data') loadData(page, pageSize, activeWhere)
                                else if (viewMode === 'struct' || viewMode === 'index' || viewMode === 'constraints')
                                    loadStructure()
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
                    <ResizableTable
                        cols={dataCols}
                        data={rows}
                        onColResize={handleColResize}
                        className={s.editTable}
                    >
                        <tbody>
                            {/* 渲染未保存的新增行 */}
                            {newRows.map((newRow, nIdx) => (
                                <tr
                                    key={'new_' + nIdx}
                                    className={s.rowNew}
                                    onContextMenu={(e) => handleCellContextMenu(e, nIdx, undefined, true)}
                                >
                                    <td
                                        className={s.rownum}
                                        style={{ color: '#52c41a', fontWeight: 700 }}
                                        onContextMenu={(e) => handleCellContextMenu(e, nIdx, undefined, true)}
                                    >
                                        +
                                    </td>
                                    {columns.map((c) => {
                                        const isEditing =
                                            editingNewCell?.rowIdx === nIdx && editingNewCell?.col === c
                                        const val = newRow[c]
                                        return (
                                            <td
                                                key={c}
                                                onClick={() =>
                                                    !isEditing && setEditingNewCell({ rowIdx: nIdx, col: c })
                                                }
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
                                                    <span className={s.cellNull}>NULL</span>
                                                ) : val !== undefined ? (
                                                    String(val)
                                                ) : (
                                                    <span className={s.cellNull}>DEFAULT</span>
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
                                            className={s.rownum}
                                            onContextMenu={(e) => handleCellContextMenu(e, rIdx, undefined, false)}
                                        >
                                            {(page - 1) * pageSize + rIdx + 1}
                                        </td>
                                        {columns.map((c) => {
                                            const isEditing =
                                                editingCell?.rowIdx === rIdx && editingCell?.col === c
                                            const isCellDirty =
                                                rowDrafts[rIdx] && rowDrafts[rIdx][c] !== undefined
                                            const val = isCellDirty ? rowDrafts[rIdx][c] : row[c]
                                            const isNull = val === null || val === undefined

                                            return (
                                                <td
                                                    key={c}
                                                    className={
                                                        (isCellDirty ? s.cellDirty : '') +
                                                        (isNull ? ' ' + s.cellNull : '')
                                                    }
                                                    onClick={() =>
                                                        !isEditing && setEditingCell({ rowIdx: rIdx, col: c })
                                                    }
                                                    onContextMenu={(e) => handleCellContextMenu(e, rIdx, c, false)}
                                                    title="点击编辑，右键更多操作"
                                                >
                                                    {isEditing ? (
                                                        <CellEditorInline
                                                            value={isNull ? '' : String(val)}
                                                            isNull={isNull}
                                                            onCommit={(v, isN) =>
                                                                handleCommitCell(rIdx, c, v, isN)
                                                            }
                                                            onCancel={() => setEditingCell(null)}
                                                        />
                                                    ) : isNull ? (
                                                        <span className={s.nullText}>NULL</span>
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
                                    <td colSpan={columns.length + 1} className={s.dbEmpty}>
                                        {loading ? '加载数据中...' : '暂无数据，可点击「新增行」插入数据'}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </ResizableTable>

                    {/* 底部翻页栏 */}
                    <div className={s.tablePager}>
                        <span className={s.countBadge}>
                            {countingRows ? (
                                <>
                                    <Loader2 size={12} className={s.spinning} style={{ color: 'var(--accent)' }} />
                                    <span>共 {totalRows > 0 ? totalRows + '+' : '...'} 条 (计算中)</span>
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
                            onChange={(p, size) => {
                                if (size !== pageSize) {
                                    setPageSize(size)
                                    setPage(1)
                                    loadData(1, size, activeWhere)
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
                <div className={s.dbTableScroll}>
                    <table className={s.dbTable}>
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
                            {(structure?.columns || []).map((col, idx) => (
                                <tr key={col.name}>
                                    <td style={{ textAlign: 'center', color: 'var(--text-faint)' }}>{idx + 1}</td>
                                    <td>
                                        <strong style={{ fontFamily: 'monospace' }}>{col.name}</strong>
                                    </td>
                                    <td>
                                        <Tag color="blue">{col.dataType}</Tag>
                                        {col.udtName && col.udtName !== col.dataType && (
                                            <span style={{ fontSize: 11, color: 'var(--text-dim)', marginLeft: 4 }}>
                                                ({col.udtName})
                                            </span>
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
                                        {col.defaultVal || <span className={s.nullText}>-</span>}
                                    </td>
                                    <td>{col.isPrimaryKey && <span className={s.pkBadge}>PK</span>}</td>
                                    <td>{col.isForeignKey && <span className={s.fkBadge}>FK</span>}</td>
                                    <td style={{ color: 'var(--text-dim)' }}>
                                        {col.comment || col.extra || '-'}
                                    </td>
                                </tr>
                            ))}
                            {(!structure || structure.columns.length === 0) && (
                                <tr>
                                    <td colSpan={8} className={s.dbEmpty}>
                                        暂无结构信息
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {/* 索引视图 */}
            {viewMode === 'index' && (
                <div className={s.dbTableScroll}>
                    <table className={s.dbTable}>
                        <thead>
                            <tr>
                                <th style={{ width: 40, textAlign: 'center' }}>#</th>
                                <th>索引名称 (Index Name)</th>
                                <th>类型 (Type)</th>
                                <th>包含列 (Columns)</th>
                                <th>占用大小 (Size)</th>
                                <th>定义 / 详情 (Definition / Comment)</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(structure?.indexes || []).map((idx, i) => (
                                <tr key={idx.name + '_' + i}>
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
                                            <Tag color="geekblue">{idx.type || 'INDEX'}</Tag>
                                        )}
                                    </td>
                                    <td style={{ fontFamily: 'monospace', fontSize: 12 }}>
                                        {idx.columns && idx.columns.length > 0 ? idx.columns.join(', ') : '-'}
                                    </td>
                                    <td>{idx.size || '-'}</td>
                                    <td
                                        style={{
                                            fontFamily: 'monospace',
                                            fontSize: 12,
                                            maxWidth: 500,
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                        }}
                                    >
                                        {idx.def || idx.comment || '-'}
                                    </td>
                                </tr>
                            ))}
                            {(!structure || structure.indexes.length === 0) && (
                                <tr>
                                    <td colSpan={6} className={s.dbEmpty}>
                                        暂无索引
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {/* 约束视图 */}
            {viewMode === 'constraints' && (
                <div className={s.dbTableScroll}>
                    <table className={s.dbTable}>
                        <thead>
                            <tr>
                                <th style={{ width: 40, textAlign: 'center' }}>#</th>
                                <th>约束名称 (Constraint Name)</th>
                                <th>约束类型 (Type)</th>
                                <th>受约束列 (Column)</th>
                                <th>定义 / 引用目标 (Definition / References)</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(structure?.constraints || []).map((c, i) => (
                                <tr key={c.name + '_' + i}>
                                    <td style={{ textAlign: 'center', color: 'var(--text-faint)' }}>{i + 1}</td>
                                    <td>
                                        <strong style={{ fontFamily: 'monospace' }}>{c.name}</strong>
                                    </td>
                                    <td>
                                        <Tag
                                            color={
                                                c.type === 'PRIMARY KEY'
                                                    ? 'red'
                                                    : c.type === 'FOREIGN KEY'
                                                    ? 'purple'
                                                    : 'cyan'
                                            }
                                        >
                                            {c.type}
                                        </Tag>
                                    </td>
                                    <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{c.column || '-'}</td>
                                    <td style={{ fontFamily: 'monospace', fontSize: 12 }}>
                                        {c.foreignTable ? (
                                            <span>
                                                REFERENCES{' '}
                                                <strong>
                                                    {(c.foreignSchema ? c.foreignSchema + '.' : '') +
                                                        c.foreignTable}
                                                </strong>
                                                {`(${c.foreignColumn || ''})`}
                                            </span>
                                        ) : (
                                            c.def || '-'
                                        )}
                                    </td>
                                </tr>
                            ))}
                            {(!structure || structure.constraints.length === 0) && (
                                <tr>
                                    <td colSpan={5} className={s.dbEmpty}>
                                        暂无约束
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {/* DDL 视图 */}
            {viewMode === 'ddl' && (
                <div
                    style={{
                        display: 'flex',
                        flexDirection: 'column',
                        height: '100%',
                        position: 'relative',
                    }}
                >
                    <div style={{ position: 'absolute', top: 12, right: 16, zIndex: 10 }}>
                        <Button
                            size="small"
                            icon={<Copy size={13} />}
                            onClick={() => {
                                navigator.clipboard.writeText(ddlText)
                                message.success('已复制 DDL 到剪贴板')
                            }}
                        >
                            复制 DDL
                        </Button>
                    </div>
                    <pre className={s.ddlViewer}>{ddlText || '-- 正在生成 DDL 语句...'}</pre>
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
