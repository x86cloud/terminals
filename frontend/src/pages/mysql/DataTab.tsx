import React, { useState, useEffect, useMemo } from 'react'
import { Segmented, Button, Input, Pagination, Tooltip, message, Space, Tag, Dropdown, MenuProps, Popconfirm, Modal } from 'antd'
import {
    RotateCw,
    Plus,
    Save,
    Trash2,
    Copy,
    Filter,
    Key,
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
    buildMysqlWhereClause,
    OP_LABELS,
} from '@/components/ColumnFilterPopover'
import { buildInsertSql, buildUpdateSql, copyTextToClipboard } from '@/utils/sqlExport'
import { MysqlColumn, MysqlIndex, MysqlConstraint } from './mysqlTypes'
import CellEditorInline from './CellEditorInline'
import my from './DataTab.module.less'
import db from '@/pages/mysql/dbTable.module.less'
import sh from '@/pages/mysql/mysqlShared.module.less'

const ROW_NUM_W = 46

export default function DataTab({
    serverId,
    dbName,
    tableName,
    onClose,
}: {
    serverId: string
    dbName: string
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

    const activeWhere = useMemo(() => buildMysqlWhereClause(filters), [filters])
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
            const newWhere = buildMysqlWhereClause(next)
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
    const [columnsMeta, setColumnsMeta] = useState<MysqlColumn[]>([])
    const [indexesMeta, setIndexesMeta] = useState<MysqlIndex[]>([])
    const [constraintsMeta, setConstraintsMeta] = useState<MysqlConstraint[]>([])
    const [primaryKeys, setPrimaryKeys] = useState<Record<string, boolean>>({})
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

    const getColW = (key: string, isPk = false) => {
        const minW = calcColWidthFromName(key, { isPk, hasFilter: true, minWidth: 95 })
        if (colWidths[key] !== undefined) {
            return Math.max(minW, colWidths[key])
        }
        return minW
    }

    const handleColResize = (key: string, newWidth: number) => {
        setColWidths((prev) => ({ ...prev, [key]: newWidth }))
    }

    const pkList = useMemo(() => {
        return columnsMeta.filter((c) => c.isPrimaryKey).map((c) => c.name)
    }, [columnsMeta])

    const dirtyCount = Object.keys(rowDrafts).length + newRows.length

    // 加载表结构与元数据
    const loadStructure = async () => {
        try {
            const [descRes, idxList] = await Promise.all([
                API.mysqlDescribe(serverId, dbName, tableName),
                API.mysqlIndexes(serverId, dbName, tableName).catch(() => []),
            ])

            const cols: MysqlColumn[] = []
            const pks: Record<string, boolean> = {}

            if (descRes && descRes.rows) {
                descRes.rows.forEach((r: any) => {
                    const field = String(r.Field || r.COLUMN_NAME || '')
                    const typ = String(r.Type || r.COLUMN_TYPE || '')
                    const isNull = (r.Null || r.IS_NULLABLE) === 'YES'
                    const defVal = r.Default !== undefined && r.Default !== null ? String(r.Default) : ''
                    const isPri = (r.Key || '') === 'PRI' || (r.COLUMN_KEY || '') === 'PRI'
                    const extra = String(r.Extra || '')
                    const comment = String(r.Comment || r.COLUMN_COMMENT || '')

                    if (isPri) pks[field] = true
                    cols.push({
                        name: field,
                        dataType: typ,
                        isNullable: isNull,
                        defaultVal: defVal,
                        isPrimaryKey: isPri,
                        extra,
                        comment,
                    })
                })
            }

            setColumnsMeta(cols)
            setPrimaryKeys(pks)

            // 处理索引
            if (Array.isArray(idxList)) {
                const map: Record<string, MysqlIndex> = {}
                idxList.forEach((r: any) => {
                    const keyName = String(r.Key_name || r.INDEX_NAME || '')
                    const colName = String(r.Column_name || r.COLUMN_NAME || '')
                    const nonUnique = Number(r.Non_unique ?? 1) === 1
                    const idxType = String(r.Index_type || 'BTREE')
                    if (!map[keyName]) {
                        map[keyName] = {
                            name: keyName,
                            table: tableName,
                            columns: [],
                            isUnique: !nonUnique,
                            isPrimary: keyName === 'PRIMARY',
                            type: idxType,
                        }
                    }
                    map[keyName].columns.push(colName)
                })
                setIndexesMeta(Object.values(map))
            }

            // 加载外键/约束
            loadConstraints()
        } catch (e: any) {
            console.error('加载 MySQL 表结构失败:', e)
        }
    }

    // 加载约束
    const loadConstraints = async () => {
        try {
            const sql = `SELECT CONSTRAINT_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
                         FROM information_schema.KEY_COLUMN_USAGE
                         WHERE TABLE_SCHEMA = '${dbName}' AND TABLE_NAME = '${tableName}'`
            const res = await API.mysqlRun(serverId, dbName, sql)
            if (res && res.rows) {
                const cList: MysqlConstraint[] = res.rows.map((r: any) => ({
                    name: String(r.CONSTRAINT_NAME || ''),
                    type: r.REFERENCED_TABLE_NAME ? 'FOREIGN KEY' : r.CONSTRAINT_NAME === 'PRIMARY' ? 'PRIMARY KEY' : 'UNIQUE / KEY',
                    column: String(r.COLUMN_NAME || ''),
                    foreignTable: r.REFERENCED_TABLE_NAME ? String(r.REFERENCED_TABLE_NAME) : undefined,
                    foreignColumn: r.REFERENCED_COLUMN_NAME ? String(r.REFERENCED_COLUMN_NAME) : undefined,
                }))
                setConstraintsMeta(cList)
            }
        } catch (e) {
            console.warn('获取约束信息失败:', e)
        }
    }

    // 加载 DDL
    const loadDDL = async () => {
        try {
            const res = await API.mysqlRun(serverId, dbName, `SHOW CREATE TABLE \`${tableName}\``)
            if (res && res.rows && res.rows[0]) {
                const createSql = res.rows[0]['Create Table'] || res.rows[0]['Create View'] || JSON.stringify(res.rows[0])
                setDdlText(createSql + ';')
            }
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
            let res: any
            if (where.trim() || targetSortCol) {
                let sql = `SELECT * FROM \`${tableName}\``
                if (where.trim()) {
                    const cleanWhere = where.trim().replace(/^WHERE\s+/i, '')
                    sql += ` WHERE ${cleanWhere}`
                }
                if (targetSortCol) {
                    sql += ` ORDER BY \`${targetSortCol}\` ${targetSortOrder}`
                }
                sql += ` LIMIT ${targetSize} OFFSET ${offset}`
                res = await API.mysqlRun(serverId, dbName, sql)
            } else {
                res = await API.mysqlSelect(serverId, dbName, tableName, targetSize, offset)
            }

            setColumns(res.columns || [])
            setRows(res.rows || [])
            setRowDrafts({})
            setNewRows([])

            // 统计总行数
            setCountingRows(true)
            if (where.trim()) {
                const cleanWhere = where.trim().replace(/^WHERE\s+/i, '')
                API.mysqlRun(serverId, dbName, `SELECT COUNT(*) AS total FROM \`${tableName}\` WHERE ${cleanWhere}`)
                    .then((cntRes: any) => {
                        const total = Number(cntRes?.rows?.[0]?.total ?? cntRes?.rows?.[0]?.TOTAL ?? 0)
                        setTotalRows(total)
                    })
                    .catch(() => { })
                    .finally(() => setCountingRows(false))
            } else {
                API.mysqlCount(serverId, dbName, tableName)
                    .then((cnt) => setTotalRows(cnt))
                    .catch(() => { })
                    .finally(() => setCountingRows(false))
            }
        } catch (e: any) {
            message.error('查询数据失败: ' + (e.message || e))
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
    }, [serverId, dbName, tableName])

    useEffect(() => {
        if (viewMode === 'ddl' && !ddlText) {
            loadDDL()
        }
    }, [viewMode])

    // 行内编辑保存单元格
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
                const whereCols = pkList
                const whereVals = pkList.map((pk) => origRow[pk])

                const setCols = Object.keys(patch)
                const setVals = Object.values(patch)

                await API.mysqlUpdate(
                    serverId,
                    dbName,
                    tableName,
                    setCols,
                    setVals,
                    whereCols,
                    whereVals
                )
            }

            // 2. 保存新增行
            for (const newRow of newRows) {
                const cols = Object.keys(newRow).filter((k) => newRow[k] !== undefined)
                const vals = cols.map((k) => newRow[k])
                if (cols.length > 0) {
                    await API.mysqlInsert(serverId, dbName, tableName, cols, vals)
                }
            }

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

    // 删除现有行
    const handleDeleteRow = async (rowIdx: number) => {
        if (pkList.length === 0) {
            message.error('该表未定义主键，无法执行精确删除！')
            return
        }
        const row = rows[rowIdx]
        const whereCols = pkList
        const whereVals = pkList.map((pk) => row[pk])

        try {
            await API.mysqlDelete(serverId, dbName, tableName, whereCols, whereVals)
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
                    dialect: 'mysql',
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
                        dialect: 'mysql',
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
                // 自增主键置为 null
                pkList.forEach((pk) => {
                    cloned[pk] = null
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

    // 构造数据列定义（已去除“操作”列）
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
                const isSorted = sortCol === c
                const activeFilter = filters[c]
                const headerMinW = calcColWidthFromName(c, {
                    isPk,
                    hasFilter: true,
                    minWidth: 95,
                })
                return {
                    key: c,
                    isPk,
                    hasFilter: true,
                    label: (
                        <div
                            className={my.headerCol}
                            onClick={() => handleHeaderSort(c)}
                            title={isSorted ? `当前按 ${c} ${sortOrder === 'ASC' ? '升序' : '降序'}排列 (点击切换)` : `点击按 ${c} 排序`}
                        >
                            {isPk ? (
                                <span className={my.pkBadge} title="主键 (Primary Key)">{c}</span>
                            ) : (
                                <span className={my.headerColText}>{c}</span>
                            )}
                            <span className={`${my.sortIconWrap} ${isSorted ? my.sortActive : my.sortIdle}`}>
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
                    width: getColW(c, isPk),
                    minWidth: headerMinW,
                }
            }),
        ]
        return cols
    }, [columns, pkList, colWidths, sortCol, sortOrder, filters, rows.length])

    return (
        <div className={my.dataWrap}>
            {/* 顶部工具栏与 5 合 1 视图切换 */}
            <div className={my.tableHead}>
                <div className={my.tableNameWrap}>
                    <TableIcon size={15} style={{ color: '#1677ff', flexShrink: 0 }} />
                    <span className={my.schemaTag}>{dbName}</span>
                    <span className={my.tableName} title={tableName}>{tableName}</span>
                </div>

                <Segmented
                    size="small"
                    className={my.segmented}
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

                <span className={my.countBadge}>
                    {viewMode === 'data' ? (
                        <>
                            {countingRows && <Loader2 size={11} className={my.spinning} style={{ color: 'var(--accent)' }} />}
                            <span>{rows.length} 行{newRows.length ? (' +' + newRows.length + ' 新增') : ''}{dirtyCount > 0 ? (' *' + dirtyCount + ' 待保存') : ''}</span>
                        </>
                    ) : viewMode === 'struct' ? (
                        columnsMeta.length + ' 列'
                    ) : viewMode === 'index' ? (
                        indexesMeta.length + ' 个索引'
                    ) : viewMode === 'constraints' ? (
                        constraintsMeta.length + ' 条约束'
                    ) : (
                        'SQL'
                    )}
                </span>

                {viewMode === 'data' && activeFilterEntries.length > 0 && (
                    <div className={my.activeFiltersWrap}>
                        <Filter size={12} className={my.activeFilterIcon} />
                        <span className={my.activeFilterLabel}>已筛选:</span>
                        <div className={my.activeFilterTags}>
                            {activeFilterEntries.map(([col, f]) => (
                                <Tag
                                    key={col}
                                    closable
                                    className={my.filterTag}
                                    onClose={() => handleFilterChange(col, null)}
                                >
                                    <span className={my.filterTagCol}>{col}</span>
                                    <span className={my.filterTagOp}>{OP_LABELS[f.op]}</span>
                                    {f.op !== 'is_null' && f.op !== 'is_not_null' && (
                                        <span className={my.filterTagVal}>'{f.value}'</span>
                                    )}
                                </Tag>
                            ))}
                        </div>
                        <Button
                            size="small"
                            type="link"
                            className={my.clearAllBtn}
                            onClick={handleClearAllFilters}
                        >
                            清除全部
                        </Button>
                    </div>
                )}

                <div className={my.crudActions}>
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
                                保存修改 {dirtyCount > 0 ? ('(' + dirtyCount + ')') : ''}
                            </Button>
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
                        className={my.editTable}
                    >
                        <tbody>
                            {/* 渲染未保存的新增行 */}
                            {newRows.map((newRow, nIdx) => (
                                <tr
                                    key={'new_' + nIdx}
                                    className={my.rowNew}
                                    onContextMenu={(e) => handleCellContextMenu(e, nIdx, undefined, true)}
                                >
                                    <td
                                        className={my.rownum}
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
                                                    <span className={my.cellNull}>NULL</span>
                                                ) : val !== undefined ? (
                                                    String(val)
                                                ) : (
                                                    <span className={my.cellNull}>DEFAULT</span>
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
                                            className={my.rownum}
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
                                                    className={(isCellDirty ? my.cellDirty : '') + (isNull ? (' ' + my.cellNull) : '')}
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
                    <div className={my.tablePager}>
                        <span className={my.countBadge}>
                            {countingRows ? (
                                <>
                                    <Loader2 size={12} className={my.spinning} style={{ color: 'var(--accent)' }} />
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

            {/* 表结构视图 */}
            {viewMode === 'struct' && (
                <div className={my.tableBody} style={{ padding: 12 }}>
                    <table className={db.dbTable}>
                        <thead>
                            <tr>
                                <th>字段名</th>
                                <th>数据类型</th>
                                <th>允许 NULL</th>
                                <th>默认值</th>
                                <th>主键</th>
                                <th>Extra</th>
                                <th>注释</th>
                            </tr>
                        </thead>
                        <tbody>
                            {columnsMeta.map((col) => (
                                <tr key={col.name}>
                                    <td style={{ fontWeight: col.isPrimaryKey ? 700 : 400 }}>
                                        {col.isPrimaryKey && <Key size={12} color="var(--accent)" style={{ marginRight: 4 }} />}
                                        {col.name}
                                    </td>
                                    <td>
                                        <Tag color="geekblue">{col.dataType}</Tag>
                                    </td>
                                    <td>
                                        <Tag color={col.isNullable ? 'green' : 'orange'}>
                                            {col.isNullable ? 'YES' : 'NO'}
                                        </Tag>
                                    </td>
                                    <td>{col.defaultVal || <span style={{ color: 'var(--text-faint)' }}>-</span>}</td>
                                    <td>{col.isPrimaryKey ? <Tag color="gold">PRI</Tag> : '-'}</td>
                                    <td>{col.extra || '-'}</td>
                                    <td>{col.comment || '-'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* 索引视图 */}
            {viewMode === 'index' && (
                <div className={my.tableBody} style={{ padding: 12 }}>
                    <table className={db.dbTable}>
                        <thead>
                            <tr>
                                <th>索引名</th>
                                <th>包含字段</th>
                                <th>类型</th>
                                <th>唯一性</th>
                                <th>主键</th>
                            </tr>
                        </thead>
                        <tbody>
                            {indexesMeta.map((idx) => (
                                <tr key={idx.name}>
                                    <td style={{ fontWeight: 600 }}>{idx.name}</td>
                                    <td>
                                        {idx.columns.map((c) => (
                                            <Tag key={c} color="blue">
                                                {c}
                                            </Tag>
                                        ))}
                                    </td>
                                    <td>
                                        <Tag color="cyan">{idx.type}</Tag>
                                    </td>
                                    <td>{idx.isUnique ? <Tag color="green">UNIQUE</Tag> : 'NORMAL'}</td>
                                    <td>{idx.isPrimary ? <Tag color="gold">PRIMARY</Tag> : '-'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* 约束与外键视图 */}
            {viewMode === 'constraints' && (
                <div className={my.tableBody} style={{ padding: 12 }}>
                    <table className={db.dbTable}>
                        <thead>
                            <tr>
                                <th>约束名称</th>
                                <th>约束类型</th>
                                <th>本表字段</th>
                                <th>关联目标表</th>
                                <th>关联目标字段</th>
                            </tr>
                        </thead>
                        <tbody>
                            {constraintsMeta.length > 0 ? (
                                constraintsMeta.map((c, i) => (
                                    <tr key={i}>
                                        <td style={{ fontWeight: 600 }}>{c.name}</td>
                                        <td>
                                            <Tag color={c.type.includes('PRIMARY') ? 'gold' : c.type.includes('FOREIGN') ? 'purple' : 'blue'}>
                                                {c.type}
                                            </Tag>
                                        </td>
                                        <td>{c.column}</td>
                                        <td>{c.foreignTable || '-'}</td>
                                        <td>{c.foreignColumn || '-'}</td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-dim)' }}>
                                        暂无额外约束信息
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {/* DDL 视图 */}
            {viewMode === 'ddl' && (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    <div style={{ padding: '6px 12px', background: 'var(--bg-2)', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>CREATE TABLE 语句定义</span>
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
                    <pre className={my.ddlViewer}>{ddlText}</pre>
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
