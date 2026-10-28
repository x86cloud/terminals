import React, { useState, useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import {
    Segmented,
    Button,
    Pagination,
    Tooltip,
    App,
    Space,
    Tag,
    Dropdown,
    MenuProps,
    Modal,
    Input,
    Select,
    Switch,
    Popconfirm,
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
import { isSameCellValue, coerceCellValue, copyText } from '@/utils'
import ResizableTable, { ColDef, calcColWidthFromName } from '@/components/ResizableTable'
import ColumnFilterPopover, {
    ColumnFilterState,
    OP_LABELS,
} from '@/components/ColumnFilterPopover'
import { buildInsertSql, buildUpdateSql } from '@/utils/sqlExport'
import CellEditorInline from '@/components/common/CellEditorInline'
import { DbAdapter, DbTableStructure, DbColumnMeta, DbConstraintMeta, AlterTablePlan } from '../types'
import {
    getDialectTypeCategories,
    splitDataType,
    combineDataType,
    isLengthSupported,
    getDefaultLength,
} from '../dialectTypes'
import AlterTableModal from './AlterTableModal'
import CreateIndexModal from './CreateIndexModal'
import CreateConstraintModal from './CreateConstraintModal'
import s from './DbDataTab.module.less'

const ROW_NUM_W = 46

export interface DbDataTabProps {
    adapter: DbAdapter
    onClose?: () => void
}

export default function DbDataTab({ adapter, onClose }: DbDataTabProps) {
    const { t } = useTranslation(['db', 'common'])
    const { message } = App.useApp()
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
    const loadDataReqIdRef = useRef(0)

    // 列宽状态
    const [colWidths, setColWidths] = useState<Record<string, number>>({})

    // 描述与结构
    const [structure, setStructure] = useState<DbTableStructure | null>(null)
    const [ddlText, setDdlText] = useState('')

    // 结构编辑状态
    const [origCols, setOrigCols] = useState<DbColumnMeta[]>([])
    const [structCols, setStructCols] = useState<DbColumnMeta[]>([])
    const [alterModalOpen, setAlterModalOpen] = useState(false)
    const [alterPlan, setAlterPlan] = useState<AlterTablePlan | null>(null)
    const [alterLoading, setAlterLoading] = useState(false)
    const [createIndexOpen, setCreateIndexOpen] = useState(false)
    const [createConstraintOpen, setCreateConstraintOpen] = useState(false)

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
            setDdlText(t('db:dataTab.ddl.fetchFail', { msg: e.message || e, defaultValue: '-- 获取 DDL 失败: ' + (e.message || e) }))
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
        const reqId = ++loadDataReqIdRef.current
        setLoading(true)
        try {
            const res = await adapter.loadData({
                page: targetPage,
                pageSize: targetSize,
                where,
                sortCol: targetSortCol,
                sortOrder: targetSortOrder,
            })
            if (reqId !== loadDataReqIdRef.current) return
            setColumns(res.columns || [])
            setRows(res.rows || [])
            setRowDrafts({})
            setNewRows([])

            // 统计总数
            setCountingRows(true)
            adapter
                .countData(where)
                .then((cnt) => {
                    if (reqId === loadDataReqIdRef.current) {
                        setTotalRows(cnt)
                    }
                })
                .catch(() => { })
                .finally(() => {
                    if (reqId === loadDataReqIdRef.current) {
                        setCountingRows(false)
                    }
                })
        } catch (e: any) {
            if (reqId !== loadDataReqIdRef.current) return
            message.error(t('db:dataTab.queryFail', { msg: e.message || e, defaultValue: '查询数据失败: ' + (e.message || e) }))
        } finally {
            if (reqId === loadDataReqIdRef.current) {
                setLoading(false)
            }
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

    useEffect(() => {
        if (structure?.columns) {
            const cols = structure.columns.map((c) => ({
                ...c,
                origName: c.origName || c.name,
            }))
            setOrigCols(cols)
            setStructCols(cols.map((c) => ({ ...c })))
        }
    }, [structure])

    const allTypeOptions = useMemo(() => {
        const standardCats = getDialectTypeCategories(adapter.dialect)
        const standardSet = new Set<string>()
        standardCats.forEach((cat) => cat.options.forEach((o) => standardSet.add(o.value.toLowerCase())))

        // 收集自定义类型（原表中存在但未在标准列表中的类型）
        const customTypes = new Set<string>()
        structCols.forEach((c) => {
            const { baseType } = splitDataType(c.dataType || '')
            if (baseType && !standardSet.has(baseType.toLowerCase())) {
                customTypes.add(baseType)
            }
        })

        const options = standardCats.map((cat) => ({
            label: (
                <span style={{ fontWeight: 600, fontSize: 11, color: 'var(--accent, #1677ff)' }}>
                    {cat.label}
                </span>
            ),
            options: cat.options.map((opt) => ({
                value: opt.value,
                label: (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{opt.label}</span>
                        {opt.desc && (
                            <span style={{ fontSize: 11, color: 'var(--text-dim, #888)', marginLeft: 8 }}>
                                {opt.desc}
                            </span>
                        )}
                    </div>
                ),
            })),
        }))

        if (customTypes.size > 0) {
            options.push({
                label: (
                    <span style={{ fontWeight: 600, fontSize: 11, color: '#fa8c16' }}>
                        {t('db:dataTab.structure.customTypeGroup')}
                    </span>
                ),
                options: Array.from(customTypes).map((ct) => ({
                    value: ct,
                    label: (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{ct}</span>
                            <span style={{ fontSize: 11, color: 'var(--text-dim, #888)', marginLeft: 8 }}>
                                {t('db:dataTab.structure.existingColTypes')}
                            </span>
                        </div>
                    ),
                })),
            })
        }

        return options
    }, [adapter.dialect, structCols])

    const handleBaseTypeChange = (idx: number, newBase: string) => {
        const { length: curLen } = splitDataType(structCols[idx]?.dataType || '')
        const supportsLen = isLengthSupported(adapter.dialect, newBase)
        let targetLen = ''
        if (supportsLen) {
            targetLen = curLen || getDefaultLength(adapter.dialect, newBase)
        }
        const combined = combineDataType(newBase, targetLen)
        handleStructColChange(idx, { dataType: combined })
    }

    const handleLengthChange = (idx: number, newLen: string) => {
        const { baseType } = splitDataType(structCols[idx]?.dataType || '')
        const combined = combineDataType(baseType, newLen)
        handleStructColChange(idx, { dataType: combined })
    }

    const structDirtyState = useMemo(() => {
        const origMap = new Map<string, DbColumnMeta>()
        origCols.forEach((c) => origMap.set(c.name, c))

        const currentOrigNames = new Set<string>()
        structCols.forEach((c) => {
            if (c.origName) currentOrigNames.add(c.origName)
        })

        const droppedCount = origCols.filter((c) => !currentOrigNames.has(c.name)).length
        let modifiedCount = 0
        let newCount = 0

        for (const col of structCols) {
            if (col.isNew || !col.origName || !origMap.has(col.origName)) {
                newCount++
            } else {
                const orig = origMap.get(col.origName)!
                const isChanged =
                    col.name !== orig.name ||
                    col.dataType !== orig.dataType ||
                    col.isNullable !== orig.isNullable ||
                    (col.defaultVal || '') !== (orig.defaultVal || '') ||
                    (col.comment || '') !== (orig.comment || '')
                if (isChanged) {
                    modifiedCount++
                }
            }
        }

        const totalDirty = droppedCount + newCount + modifiedCount
        return {
            isDirty: totalDirty > 0,
            totalDirty,
            droppedCount,
            newCount,
            modifiedCount,
            origMap,
        }
    }, [structCols, origCols])

    const handleStructColChange = (index: number, patch: Partial<DbColumnMeta>) => {
        setStructCols((prev) => {
            const next = [...prev]
            next[index] = { ...next[index], ...patch }
            return next
        })
    }

    const handleAddStructCol = () => {
        const defaultType =
            adapter.dialect === 'mysql'
                ? 'varchar(255)'
                : adapter.dialect === 'postgres'
                    ? 'varchar(255)'
                    : 'TEXT'
        const existingNames = new Set(structCols.map((c) => c.name.toLowerCase()))
        let colIdx = structCols.length + 1
        while (existingNames.has(`new_column_${colIdx}`)) {
            colIdx++
        }
        const newCol: DbColumnMeta = {
            name: `new_column_${colIdx}`,
            dataType: defaultType,
            isNullable: true,
            defaultVal: '',
            comment: '',
            isPrimaryKey: false,
            isForeignKey: false,
            isNew: true,
        }
        setStructCols((prev) => [...prev, newCol])
    }

    const handleDropStructCol = (index: number) => {
        setStructCols((prev) => prev.filter((_, i) => i !== index))
    }

    const handleDiscardStructChanges = () => {
        setStructCols(origCols.map((c) => ({ ...c })))
    }

    const handleSaveStructChanges = async () => {
        if (!structDirtyState.isDirty) return
        if (!adapter.generateAlterTableSql) {
            message.error(t('db:dataTab.unsupportedAlter'))
            return
        }

        const names = structCols.map((c) => c.name.trim())
        if (names.some((n) => !n)) {
            message.warning(t('db:dataTab.emptyColName'))
            return
        }
        const nameSet = new Set<string>()
        for (const n of names) {
            if (nameSet.has(n.toLowerCase())) {
                message.warning(t('db:dataTab.duplicateColName', { name: n }))
                return
            }
            nameSet.add(n.toLowerCase())
        }

        try {
            const plan = await adapter.generateAlterTableSql(structCols, origCols)
            if (!plan.sqls || plan.sqls.length === 0) {
                return
            }
            setAlterPlan(plan)
            setAlterModalOpen(true)
        } catch (e: any) {
            message.error(t('db:dataTab.generateSqlFail', { msg: e.message || e }))
        }
    }

    const handleExecuteAlterTable = async () => {
        if (!alterPlan || !adapter.executeAlterTable) return
        setAlterLoading(true)
        try {
            await adapter.executeAlterTable(alterPlan.sqls)
            message.success(t('db:dataTab.alterSuccess'))
            setAlterModalOpen(false)
            setAlterPlan(null)
            await Promise.all([loadStructure(), loadDDL()])
            if (viewMode === 'data') {
                loadData(page, pageSize, activeWhere)
            }
        } catch (e: any) {
            message.error(t('db:dataTab.alterFail', { msg: e.message || e }))
        } finally {
            setAlterLoading(false)
        }
    }

    const handleDropIndex = async (indexName: string) => {
        if (!adapter.dropIndex) {
            message.error(t('db:dataTab.indexes.unsupportedDeleteIndex'))
            return
        }
        try {
            await adapter.dropIndex(indexName)
            message.success(t('db:dataTab.indexes.deleteIndexSuccess', { name: indexName }))
            await Promise.all([loadStructure(), loadDDL()])
        } catch (e: any) {
            message.error(t('db:dataTab.indexes.deleteIndexFail', { msg: e.message || e }))
        }
    }

    const handleDropConstraint = async (c: DbConstraintMeta) => {
        if (!adapter.dropConstraint) {
            message.error(t('db:dataTab.constraints.unsupportedDeleteConstraint'))
            return
        }
        try {
            await adapter.dropConstraint(c)
            message.success(t('db:dataTab.constraints.deleteConstraintSuccess', { name: c.name }))
            await Promise.all([loadStructure(), loadDDL()])
        } catch (e: any) {
            message.error(t('db:dataTab.constraints.deleteConstraintFail', { msg: e.message || e }))
        }
    }

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
    const handleSaveAll = async (
        customDrafts?: Record<number, Record<string, any>>,
        customNewRows?: Record<string, any>[]
    ) => {
        const targetDrafts = customDrafts !== undefined ? customDrafts : rowDrafts
        const targetNewRows = customNewRows !== undefined ? customNewRows : newRows

        const hasDrafts = Object.keys(targetDrafts).length > 0
        const hasNew = targetNewRows.length > 0

        if (!hasDrafts && !hasNew) {
            return
        }

        if (pkList.length === 0 && hasDrafts) {
            message.error(t('db:dataTab.noPkForUpdate'))
            return
        }

        setSaving(true)
        try {
            if (hasDrafts) {
                await adapter.updateRows(targetDrafts, rows, pkList)
            }
            if (hasNew) {
                await adapter.insertRows(targetNewRows)
            }

            setRowDrafts({})
            setNewRows([])
            setEditingCell(null)
            setEditingNewCell(null)
            message.success(t('db:dataTab.saveSuccess'))
            loadData(page, pageSize, activeWhere)
        } catch (e: any) {
            message.error(t('db:dataTab.saveFail', { msg: e.message || e }))
        } finally {
            setSaving(false)
        }
    }

    // 单元格快捷键 Ctrl+S 保存 (已有行)
    const handleSaveCellInline = (rowIdx: number, col: string, val: any, isNull: boolean) => {
        setEditingCell(null)
        const origVal = rows[rowIdx]?.[col]
        const newVal = isNull ? null : val
        let nextDrafts = { ...rowDrafts }
        if (isSameCellValue(origVal, newVal)) {
            if (nextDrafts[rowIdx]) {
                const rowCopy = { ...nextDrafts[rowIdx] }
                delete rowCopy[col]
                if (Object.keys(rowCopy).length === 0) {
                    delete nextDrafts[rowIdx]
                } else {
                    nextDrafts[rowIdx] = rowCopy
                }
            }
        } else {
            const coerced = coerceCellValue(origVal, val, isNull)
            nextDrafts = {
                ...nextDrafts,
                [rowIdx]: {
                    ...(nextDrafts[rowIdx] || {}),
                    [col]: coerced,
                },
            }
        }
        setRowDrafts(nextDrafts)
        void handleSaveAll(nextDrafts, newRows)
    }

    // 单元格快捷键 Ctrl+S 保存 (新增行)
    const handleSaveNewCellInline = (rowIdx: number, col: string, val: any, isNull: boolean) => {
        setEditingNewCell(null)
        const nextNewRows = [...newRows]
        nextNewRows[rowIdx] = {
            ...nextNewRows[rowIdx],
            [col]: isNull ? null : val,
        }
        setNewRows(nextNewRows)
        void handleSaveAll(rowDrafts, nextNewRows)
    }

    // 监听全局 Ctrl+S / ⌘S 快捷键保存数据
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
                if (viewMode === 'data') {
                    // 如果正在使用内置的 CellEditorInline 编辑，由 CellEditorInline 自身的 onSave 优先处理
                    const activeTag = document.activeElement?.tagName
                    if (activeTag === 'INPUT' && document.activeElement?.classList.contains('cellInput')) {
                        return
                    }
                    e.preventDefault()
                    e.stopPropagation()
                    if (saving || loading) return
                    const hasDrafts = Object.keys(rowDrafts).length > 0 || newRows.length > 0
                    if (hasDrafts) {
                        void handleSaveAll()
                    }
                }
            }
        }

        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [viewMode, saving, loading, rowDrafts, newRows, pkList, rows, adapter, page, pageSize, activeWhere])

    // 放弃所有草稿修改
    const handleDiscardAll = () => {
        setRowDrafts({})
        setNewRows([])
        setEditingCell(null)
        setEditingNewCell(null)
    }

    // 删除单行
    const handleDeleteRow = async (rowIdx: number) => {
        if (pkList.length === 0) {
            message.error(t('db:dataTab.noPkForDelete'))
            return
        }
        const row = rows[rowIdx]
        try {
            await adapter.deleteRow(row, pkList)
            message.success(t('db:dataTab.deleteRowSuccess'))
            loadData(page, pageSize, activeWhere)
        } catch (e: any) {
            message.error(t('db:dataTab.deleteRowFail', { msg: e.message || e }))
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
            message.info(t('db:dataTab.unsupportedExport'))
            return
        }
        try {
            const savedPath = await adapter.exportToFile(mode, 0)
            if (savedPath) {
                message.success(t('db:dataTab.exportSuccess', { path: savedPath }))
            }
        } catch (e: any) {
            message.error(t('db:dataTab.exportFail', { msg: e.message || e }))
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
                label: t('db:dataTab.copyCell', { col: colKey }),
                onClick: async () => {
                    if (await copyText(valStr)) {
                        message.success(t('db:dataTab.copyCellSuccess'))
                    }
                },
            })
        }

        // 2. 复制整行作为 INSERT SQL
        items.push({
            key: 'copy-insert',
            icon: <Code size={13} />,
            label: t('db:dataTab.copyInsert'),
            onClick: async () => {
                const fullRow = { ...targetRow, ...(rowDrafts[rowIdx] || {}) }
                const sql = buildInsertSql({
                    dialect: adapter.dialect,
                    table: tableName,
                    columns,
                    rowData: fullRow,
                })
                if (await copyText(sql)) {
                    message.success(t('db:dataTab.copyInsertSuccess'))
                }
            },
        })

        // 3. 复制整行作为 UPDATE SQL
        if (!isNewRow && pkList.length > 0) {
            items.push({
                key: 'copy-update',
                icon: <Code size={13} />,
                label: t('db:dataTab.copyUpdate'),
                onClick: async () => {
                    const fullRow = { ...targetRow, ...(rowDrafts[rowIdx] || {}) }
                    const sql = buildUpdateSql({
                        dialect: adapter.dialect,
                        table: tableName,
                        columns,
                        rowData: fullRow,
                        pkList,
                    })
                    if (await copyText(sql)) {
                        message.success(t('db:dataTab.copyUpdateSuccess'))
                    }
                },
            })
        }

        // 4. 复制整行为 JSON
        items.push({
            key: 'copy-json',
            icon: <Code size={13} />,
            label: t('db:dataTab.copyJson'),
            onClick: async () => {
                const fullRow = { ...targetRow, ...(rowDrafts[rowIdx] || {}) }
                const json = JSON.stringify(fullRow, null, 2)
                if (await copyText(json)) {
                    message.success(t('db:dataTab.copyJsonSuccess'))
                }
            },
        })

        items.push({ type: 'divider' })

        // 5. 复制并新增 (克隆行)
        items.push({
            key: 'clone-row',
            icon: <CopyPlus size={13} />,
            label: t('db:dataTab.cloneRow'),
            onClick: () => {
                const cloned: Record<string, any> = { ...targetRow, ...(rowDrafts[rowIdx] || {}) }
                pkList.forEach((pk) => {
                    cloned[pk] = undefined
                })
                setNewRows((prev) => [cloned, ...prev])
                message.success(t('db:dataTab.cloneRowSuccess'))
            },
        })

        // 6. 将单元格设为 NULL
        if (colKey) {
            items.push({
                key: 'set-null',
                icon: <Slash size={13} />,
                label: t('db:dataTab.setNull'),
                onClick: () => {
                    if (isNewRow) {
                        handleCommitNewCell(rowIdx, colKey, '', true)
                    } else {
                        handleCommitCell(rowIdx, colKey, '', true)
                    }
                    message.info(t('db:dataTab.setNullSuccess', { col: colKey }))
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
                label: t('db:dataTab.removeDraft'),
                onClick: () => {
                    setNewRows((prev) => prev.filter((_, i) => i !== rowIdx))
                },
            })
        } else {
            items.push({
                key: 'delete-row',
                icon: <Trash2 size={13} />,
                danger: true,
                disabled: pkList.length === 0,
                label: pkList.length === 0 ? t('db:dataTab.deleteRowNoPk') : t('db:dataTab.deleteRow'),
                onClick: () => {
                    if (pkList.length === 0) {
                        message.warning(t('db:dataTab.noPkForDeletePhysical'))
                        return
                    }
                    const pkSummary = pkList.map((pk) => `${pk} = ${targetRow[pk]}`).join(', ')
                    Modal.confirm({
                        title: t('db:dataTab.deleteRowConfirmTitle'),
                        content: t('db:dataTab.deleteRowConfirmContent', { pk: pkSummary }),
                        okText: t('common:confirmDelete', '确定删除'),
                        cancelText: t('common:cancel', '取消'),
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
                                    ? t('db:dataTab.sortAscDesc', { col: c, order: sortOrder === 'ASC' ? t('db:dataTab.asc') : t('db:dataTab.desc') })
                                    : t('db:dataTab.sortClick', { col: c })
                            }
                        >
                            {isPk ? (
                                <span className={s.pkBadge} title={t('db:dataTab.pkTooltip')}>
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
    }, [columns, pkList, fkList, colWidths, sortCol, sortOrder, filters, rows.length, t])

    // 导出菜单项
    const exportMenuItems: MenuProps['items'] = [
        {
            key: 'csv',
            label: t('db:dataTab.exportCsv'),
            onClick: () => handleExport('csv'),
        },
        {
            key: 'json',
            label: t('db:dataTab.exportJson'),
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
                        { label: t('db:tabs.data'), value: 'data' },
                        { label: t('db:tabs.struct'), value: 'struct' },
                        { label: t('db:tabs.index'), value: 'index' },
                        { label: t('db:tabs.constraints'), value: 'constraints' },
                        { label: t('db:tabs.ddl'), value: 'ddl' },
                    ]}
                />

                <span className={s.countBadge}>
                    {viewMode === 'data' ? (
                        <>
                            {countingRows && (
                                <Loader2 size={11} className={s.spinning} style={{ color: 'var(--accent)' }} />
                            )}
                            <span>
                                {t('db:dataTab.rowCount', { count: rows.length })}
                                {newRows.length ? ' ' + t('db:dataTab.newRows', { count: newRows.length }) : ''}
                                {dirtyCount > 0 ? ' ' + t('db:dataTab.dirtyRows', { count: dirtyCount }) : ''}
                            </span>
                        </>
                    ) : viewMode === 'struct' ? (
                        <>
                            <span>{t('db:dataTab.colCount', { count: structCols.length })}</span>
                            {structDirtyState.isDirty && (
                                <span style={{ color: '#fa8c16', marginLeft: 4 }}>
                                    {t('db:dataTab.dirtyRows', { count: structDirtyState.totalDirty })}
                                </span>
                            )}
                        </>
                    ) : viewMode === 'index' ? (
                        t('db:dataTab.indexCount', { count: structure?.indexes?.length ?? 0 })
                    ) : viewMode === 'constraints' ? (
                        t('db:dataTab.constraintCount', { count: structure?.constraints?.length ?? 0 })
                    ) : (
                        'SQL'
                    )}
                </span>

                {viewMode === 'data' && activeFilterEntries.length > 0 && (
                    <div className={s.activeFiltersWrap}>
                        <Filter size={12} className={s.activeFilterIcon} />
                        <span className={s.activeFilterLabel}>{t('db:dataTab.filtered')}</span>
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
                            {t('db:dataTab.clearAll')}
                        </Button>
                    </div>
                )}

                <div className={s.crudActions}>
                    {viewMode === 'struct' && (
                        <Space size={6}>
                            <Button
                                size="small"
                                icon={<Plus size={13} />}
                                onClick={handleAddStructCol}
                            >
                                {t('db:dataTab.addColumn')}
                            </Button>

                            <Tooltip title={t('db:dataTab.saveStructTooltip')}>
                                <Button
                                    size="small"
                                    type={structDirtyState.isDirty ? 'primary' : 'default'}
                                    icon={<Save size={13} />}
                                    disabled={!structDirtyState.isDirty}
                                    onClick={handleSaveStructChanges}
                                >
                                    {t('db:dataTab.saveChanges')} {structDirtyState.totalDirty > 0 ? `(${structDirtyState.totalDirty})` : ''}
                                </Button>
                            </Tooltip>

                            {structDirtyState.isDirty && (
                                <Button size="small" onClick={handleDiscardStructChanges}>
                                    {t('db:dataTab.discard')}
                                </Button>
                            )}
                        </Space>
                    )}

                    {viewMode === 'index' && (
                        <Space size={6}>
                            <Button
                                size="small"
                                icon={<Plus size={13} />}
                                onClick={() => setCreateIndexOpen(true)}
                            >
                                {t('db:dataTab.addIndex')}
                            </Button>
                        </Space>
                    )}

                    {viewMode === 'constraints' && (
                        <Space size={6}>
                            <Button
                                size="small"
                                icon={<Plus size={13} />}
                                onClick={() => setCreateConstraintOpen(true)}
                            >
                                {t('db:dataTab.addConstraint')}
                            </Button>
                        </Space>
                    )}

                    {viewMode === 'data' && (
                        <Space size={6}>
                            <Button
                                size="small"
                                icon={<Plus size={13} />}
                                disabled={loading || saving}
                                onClick={handleAddNewRow}
                            >
                                {t('db:dataTab.addRow')}
                            </Button>

                            <Tooltip title={t('db:dataTab.saveTooltip')}>
                                <Button
                                    size="small"
                                    type={dirtyCount > 0 ? 'primary' : 'default'}
                                    icon={<Save size={13} />}
                                    disabled={dirtyCount === 0 || saving}
                                    loading={saving}
                                    onClick={() => handleSaveAll()}
                                >
                                    {t('db:dataTab.saveChanges')} {dirtyCount > 0 ? '(' + dirtyCount + ')' : ''}
                                </Button>
                            </Tooltip>

                            {dirtyCount > 0 && (
                                <Button size="small" onClick={handleDiscardAll} disabled={saving}>
                                    {t('db:dataTab.discard')}
                                </Button>
                            )}

                            {adapter.exportToFile && (
                                <Dropdown menu={{ items: exportMenuItems }}>
                                    <Button size="small" icon={<Download size={13} />}>
                                        {t('db:dataTab.export')}
                                    </Button>
                                </Dropdown>
                            )}
                        </Space>
                    )}

                    <Tooltip title={t('db:dataTab.refresh')}>
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
                        <Tooltip title={t('db:dataTab.closeTable')}>
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
                                                title={t('db:dataTab.cellEditTooltip')}
                                            >
                                                {isEditing ? (
                                                    <CellEditorInline
                                                        value={val !== undefined && val !== null ? String(val) : ''}
                                                        isNull={val === null}
                                                        onCommit={(v, isN) => handleCommitNewCell(nIdx, c, v, isN)}
                                                        onSave={(v, isN) => handleSaveNewCellInline(nIdx, c, v, isN)}
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
                                                    title={t('db:dataTab.cellEditTooltip')}
                                                >
                                                    {isEditing ? (
                                                        <CellEditorInline
                                                            value={isNull ? '' : String(val)}
                                                            isNull={isNull}
                                                            onCommit={(v, isN) =>
                                                                handleCommitCell(rIdx, c, v, isN)
                                                            }
                                                            onSave={(v, isN) =>
                                                                handleSaveCellInline(rIdx, c, v, isN)
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
                                        {loading ? t('db:dataTab.loadingData') : t('db:dataTab.emptyData')}
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
                                    <span>{t('db:dataTab.totalRecordsCalculating', { total: totalRows > 0 ? totalRows : 0 })}</span>
                                </>
                            ) : (
                                t('db:dataTab.totalRecords', { total: totalRows })
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
                                <th style={{ width: 44, textAlign: 'center' }}>#</th>
                                <th style={{ minWidth: 150 }}>{t('db:dataTab.structure.colName')}</th>
                                <th style={{ minWidth: 170 }}>{t('db:dataTab.structure.colType')}</th>
                                <th style={{ width: 110 }}>{t('db:dataTab.structure.colLength')}</th>
                                <th style={{ width: 100, textAlign: 'center' }}>{t('db:dataTab.structure.colNullable')}</th>
                                <th style={{ minWidth: 130 }}>{t('db:dataTab.structure.colDefault')}</th>
                                <th style={{ width: 55, textAlign: 'center' }}>{t('db:dataTab.structure.colPk')}</th>
                                <th style={{ width: 55, textAlign: 'center' }}>{t('db:dataTab.structure.colFk')}</th>
                                <th style={{ minWidth: 150 }}>{t('db:dataTab.structure.colComment')}</th>
                                <th style={{ width: 55, textAlign: 'center' }}>{t('db:dataTab.structure.colAction')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {structCols.map((col, idx) => {
                                const orig = col.origName ? structDirtyState.origMap.get(col.origName) : undefined
                                const isNew = col.isNew || !col.origName || !orig
                                const isRenamed = Boolean(orig && col.name !== orig.name)
                                const isTypeChanged = Boolean(orig && col.dataType !== orig.dataType)
                                const isNullChanged = Boolean(orig && col.isNullable !== orig.isNullable)
                                const isDefChanged = Boolean(orig && (col.defaultVal || '') !== (orig.defaultVal || ''))
                                const isCommentChanged = Boolean(orig && (col.comment || '') !== (orig.comment || ''))
                                const isModified = Boolean(
                                    orig && (isRenamed || isTypeChanged || isNullChanged || isDefChanged || isCommentChanged)
                                )
                                const rowClass = isNew ? s.structRowNew : isModified ? s.structRowModified : ''

                                const { baseType, length } = splitDataType(col.dataType || '')
                                const origSplit = orig ? splitDataType(orig.dataType || '') : undefined
                                const supportsLen = isLengthSupported(adapter.dialect, baseType)
                                const isBaseTypeChanged = Boolean(origSplit && baseType.toLowerCase() !== origSplit.baseType.toLowerCase())
                                const isLengthChanged = Boolean(origSplit && supportsLen && length !== origSplit.length)

                                return (
                                    <tr key={col.origName || `col_${idx}`} className={rowClass}>
                                        <td style={{ textAlign: 'center', color: 'var(--text-faint)' }}>
                                            {isNew ? (
                                                <span className={s.structNewBadge} title={t('db:dataTab.structure.newColBadge')} />
                                            ) : isModified ? (
                                                <span className={s.structModifiedBadge} title={t('db:dataTab.structure.modifiedColBadge')} />
                                            ) : null}
                                            {idx + 1}
                                        </td>
                                        <td>
                                            <Input
                                                size="small"
                                                variant="borderless"
                                                className={s.structColInput}
                                                value={col.name}
                                                status={isRenamed ? 'warning' : undefined}
                                                placeholder={t('db:dataTab.structure.colNamePlaceholder')}
                                                onChange={(e) => handleStructColChange(idx, { name: e.target.value })}
                                            />
                                        </td>
                                        <td>
                                            <Select
                                                variant="borderless"
                                                size="small"
                                                showSearch={{
                                                    filterOption: (input: string, option?: any) => {
                                                        if (!option) return false
                                                        const valMatch = option.value
                                                            ? String(option.value).toLowerCase().includes(input.toLowerCase())
                                                            : false
                                                        const labelMatch =
                                                            typeof option.label === 'string'
                                                                ? option.label.toLowerCase().includes(input.toLowerCase())
                                                                : false
                                                        return valMatch || labelMatch
                                                    },
                                                }}
                                                style={{ width: '100%' }}
                                                className={s.structColInput}
                                                options={allTypeOptions}
                                                value={baseType}
                                                status={isBaseTypeChanged ? 'warning' : undefined}
                                                placeholder={t('db:dataTab.structure.colTypePlaceholder')}
                                                onChange={(val) => handleBaseTypeChange(idx, val)}
                                            />
                                        </td>
                                        <td>
                                            <Input
                                                size="small"
                                                variant="borderless"
                                                className={s.structColInput}
                                                disabled={!supportsLen}
                                                value={supportsLen ? length : ''}
                                                status={isLengthChanged ? 'warning' : undefined}
                                                placeholder={supportsLen ? t('db:dataTab.structure.colLengthPlaceholder') : '-'}
                                                onChange={(e) => handleLengthChange(idx, e.target.value)}
                                            />
                                        </td>
                                        <td style={{ textAlign: 'center' }}>
                                            <Switch
                                                size="small"
                                                checked={col.isNullable}
                                                checkedChildren="YES"
                                                unCheckedChildren="NO"
                                                onChange={(checked) => handleStructColChange(idx, { isNullable: checked })}
                                            />
                                        </td>
                                        <td>
                                            <Input
                                                variant="borderless"
                                                size="small"
                                                className={s.structColInput}
                                                value={col.defaultVal || ''}
                                                status={isDefChanged ? 'warning' : undefined}
                                                placeholder={t('db:dataTab.structure.colDefaultPlaceholder')}
                                                onChange={(e) => handleStructColChange(idx, { defaultVal: e.target.value })}
                                            />
                                        </td>
                                        <td style={{ textAlign: 'center' }}>
                                            {col.isPrimaryKey ? <span className={s.pkBadge}>PK</span> : '-'}
                                        </td>
                                        <td style={{ textAlign: 'center' }}>
                                            {col.isForeignKey ? <span className={s.fkBadge}>FK</span> : '-'}
                                        </td>
                                        <td>
                                            <Input
                                                variant="borderless"
                                                size="small"
                                                className={s.structColInput}
                                                value={col.comment || ''}
                                                disabled={adapter.dialect === 'sqlite'}
                                                status={isCommentChanged ? 'warning' : undefined}
                                                placeholder={adapter.dialect === 'sqlite' ? t('db:dataTab.structure.colCommentSqlite') : t('db:dataTab.structure.colCommentPlaceholder')}
                                                onChange={(e) => handleStructColChange(idx, { comment: e.target.value })}
                                            />
                                        </td>
                                        <td style={{ textAlign: 'center' }}>
                                            <Popconfirm
                                                title={t('db:dataTab.structure.deleteColConfirmTitle')}
                                                description={
                                                    isNew
                                                        ? t('db:dataTab.structure.deleteColDraft')
                                                        : t('db:dataTab.structure.deleteColPermanent', { name: col.name })
                                                }
                                                okText={t('common:delete', '删除')}
                                                cancelText={t('common:cancel', '取消')}
                                                okButtonProps={{ danger: true }}
                                                onConfirm={() => handleDropStructCol(idx)}
                                            >
                                                <Button
                                                    size="small"
                                                    type="text"
                                                    danger
                                                    icon={<Trash2 size={13} />}
                                                    title={t('db:dataTab.structure.deleteColTooltip')}
                                                />
                                            </Popconfirm>
                                        </td>
                                    </tr>
                                )
                            })}
                            {structCols.length === 0 && (
                                <tr>
                                    <td colSpan={10} className={s.dbEmpty}>
                                        {t('db:dataTab.structure.emptyColumns')}
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
                                <th>{t('db:dataTab.indexes.name')}</th>
                                <th>{t('db:dataTab.indexes.type')}</th>
                                <th>{t('db:dataTab.indexes.columns')}</th>
                                <th>{t('db:dataTab.indexes.size')}</th>
                                <th>{t('db:dataTab.indexes.definition')}</th>
                                <th style={{ width: 60, textAlign: 'center' }}>{t('db:dataTab.indexes.action')}</th>
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
                                    <td style={{ textAlign: 'center' }}>
                                        {idx.isPrimary ? (
                                            <Tooltip title={t('db:dataTab.indexes.pkIndexTooltip')}>
                                                <Button size="small" type="text" disabled icon={<Trash2 size={13} />} />
                                            </Tooltip>
                                        ) : (
                                            <Popconfirm
                                                title={t('db:dataTab.indexes.deleteIndexConfirmTitle')}
                                                description={t('db:dataTab.indexes.deleteIndexConfirmContent', { name: idx.name })}
                                                okText={t('common:delete', '删除')}
                                                cancelText={t('common:cancel', '取消')}
                                                okButtonProps={{ danger: true }}
                                                onConfirm={() => handleDropIndex(idx.name)}
                                            >
                                                <Button
                                                    size="small"
                                                    type="text"
                                                    danger
                                                    icon={<Trash2 size={13} />}
                                                    title={t('db:dataTab.indexes.deleteIndexTooltip')}
                                                />
                                            </Popconfirm>
                                        )}
                                    </td>
                                </tr>
                            ))}
                            {(!structure || structure.indexes.length === 0) && (
                                <tr>
                                    <td colSpan={7} className={s.dbEmpty}>
                                        {t('db:dataTab.indexes.emptyIndexes')}
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
                                <th>{t('db:dataTab.constraints.name')}</th>
                                <th>{t('db:dataTab.constraints.type')}</th>
                                <th>{t('db:dataTab.constraints.columns')}</th>
                                <th>{t('db:dataTab.constraints.definition')}</th>
                                <th style={{ width: 60, textAlign: 'center' }}>{t('db:dataTab.constraints.action')}</th>
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
                                    <td style={{ textAlign: 'center' }}>
                                        {c.type === 'PRIMARY KEY' ? (
                                            <Tooltip title={t('db:dataTab.constraints.pkConstraintTooltip')}>
                                                <Button size="small" type="text" disabled icon={<Trash2 size={13} />} />
                                            </Tooltip>
                                        ) : (
                                            <Popconfirm
                                                title={t('db:dataTab.constraints.deleteConstraintConfirmTitle')}
                                                description={
                                                    adapter.dialect === 'sqlite'
                                                        ? t('db:dataTab.constraints.deleteConstraintSqlite', { name: c.name })
                                                        : t('db:dataTab.constraints.deleteConstraintDefault', { name: c.name })
                                                }
                                                okText={t('common:delete', '删除')}
                                                cancelText={t('common:cancel', '取消')}
                                                okButtonProps={{ danger: true }}
                                                onConfirm={() => handleDropConstraint(c)}
                                            >
                                                <Button
                                                    size="small"
                                                    type="text"
                                                    danger
                                                    icon={<Trash2 size={13} />}
                                                    title={t('db:dataTab.constraints.deleteConstraintTooltip')}
                                                />
                                            </Popconfirm>
                                        )}
                                    </td>
                                </tr>
                            ))}
                            {(!structure || structure.constraints.length === 0) && (
                                <tr>
                                    <td colSpan={6} className={s.dbEmpty}>
                                        {t('db:dataTab.constraints.emptyConstraints')}
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
                            onClick={async () => {
                                if (await copyText(ddlText)) {
                                    message.success(t('db:dataTab.ddl.copySuccess'))
                                }
                            }}
                        >
                            {t('db:dataTab.copyDdl')}
                        </Button>
                    </div>
                    <pre className={s.ddlViewer}>{ddlText || t('db:dataTab.ddl.generating')}</pre>
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

            {/* 表结构变更预览与确认弹窗 */}
            <AlterTableModal
                open={alterModalOpen}
                tableName={tableName}
                plan={alterPlan}
                loading={alterLoading}
                onOk={handleExecuteAlterTable}
                onCancel={() => setAlterModalOpen(false)}
            />

            {/* 新建索引弹窗 */}
            <CreateIndexModal
                open={createIndexOpen}
                tableName={tableName}
                schema={schema}
                columns={columns}
                adapter={adapter}
                onSuccess={async () => {
                    setCreateIndexOpen(false)
                    await Promise.all([loadStructure(), loadDDL()])
                }}
                onCancel={() => setCreateIndexOpen(false)}
            />

            {/* 新建约束弹窗 */}
            <CreateConstraintModal
                open={createConstraintOpen}
                tableName={tableName}
                schema={schema}
                columns={columns}
                adapter={adapter}
                onSuccess={async () => {
                    setCreateConstraintOpen(false)
                    await Promise.all([loadStructure(), loadDDL()])
                }}
                onCancel={() => setCreateConstraintOpen(false)}
            />
        </div>
    )
}
