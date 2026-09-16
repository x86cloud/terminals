import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
    Button,
    InputNumber,
    Space,
    Tooltip,
    Pagination,
    Tag,
    Modal,
    Alert,
    message,
    Segmented,
    Dropdown,
    MenuProps,
    Popconfirm,
} from 'antd'
import {
    Search,
    Plus,
    RotateCw,
    Download,
    Trash2,
    Edit,
    Copy,
    Code,
    Table as TableIcon,
    ChevronDown,
    ChevronRight,
    FileText,
    BarChart2,
    Layers,
    Activity,
    SlidersHorizontal,
    CopyPlus,
} from 'lucide-react'
import { API } from '@/api'
import { errorMessage } from '@/utils'
import { copyTextToClipboard } from '@/utils/sqlExport'
import { MongoSessionInfo, MongoQuerySpec, MongoFindResult, MongoCollectionStats } from '@/types'
import CodeEditor from '@/components/CodeEditor'
import ResizableTable, { ColDef, calcColWidthFromName } from '@/components/ResizableTable'
import ColumnFilterPopover, { ColumnFilterState } from '@/components/ColumnFilterPopover'
import { ConfirmModal, ConfirmState } from '@/components/Modal'
import IndexesTab from './IndexesTab'
import SchemaTab from './SchemaTab'
import ChangeStreamTab from './ChangeStreamTab'
import IoModal from './IoModal'
import d from './DataTab.module.less'

interface Props {
    session: MongoSessionInfo
    db: string
    collection: string
    initialSubTab?: 'documents' | 'indexes' | 'schema' | 'stream'
    onClose?: () => void
}

const DEFAULT_LIMIT = 50

export default function DataTab({ session, db, collection, initialSubTab = 'documents', onClose }: Props) {
    const id = session.id
    const [subTab, setSubTab] = useState<'documents' | 'indexes' | 'schema' | 'stream'>(initialSubTab)
    const [viewMode, setViewMode] = useState<'table' | 'json'>('table')

    // 数据状态
    const [docs, setDocs] = useState<string[]>([])
    const [total, setTotal] = useState(0)
    const [count, setCount] = useState(0)
    const [duration, setDuration] = useState(0)
    const [page, setPage] = useState(1)
    const [pageSize, setPageSize] = useState(DEFAULT_LIMIT)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')
    const [selectedIdx, setSelectedIdx] = useState<number | null>(null)

    // 列宽与筛选
    const [colWidths, setColWidths] = useState<Record<string, number>>({})
    const [filters, setFilters] = useState<Record<string, ColumnFilterState>>({})

    // 查询构建器状态
    const [showBuilder, setShowBuilder] = useState(false)
    const [filterText, setFilterText] = useState('{}')
    const [projectionText, setProjectionText] = useState('')
    const [sortText, setSortText] = useState('{}')
    const [skip, setSkip] = useState(0)

    // 右键上下文菜单状态
    const [contextMenu, setContextMenu] = useState<{
        open: boolean
        x: number
        y: number
        rowIdx: number
        col?: string
    } | null>(null)

    // 增改弹窗状态
    const [editOpen, setEditOpen] = useState<{ mode: 'insert' | 'update' | 'replace'; raw?: string } | null>(null)
    const [editorText, setEditorText] = useState('')
    const [editorBusy, setEditorBusy] = useState(false)
    const [editorError, setEditorError] = useState('')

    // 导出弹窗与统计弹窗
    const [ioExportOpen, setIoExportOpen] = useState(false)
    const [statsModalOpen, setStatsModalOpen] = useState(false)
    const [stats, setStats] = useState<MongoCollectionStats | null>(null)
    const [statsBusy, setStatsBusy] = useState(false)

    const emptyConfirm: ConfirmState = { open: false, title: '', message: '' }
    const [confirm, setConfirm] = useState<ConfirmState>(emptyConfirm)

    // 将列头筛选转化为 MongoDB 查询条件
    const buildMongoFilterFromColumnFilters = useCallback((): Record<string, any> => {
        const conds: Record<string, any> = {}
        const entries = Object.entries(filters)
        if (!entries.length) return conds

        for (const [col, filter] of entries) {
            if (!filter) continue
            const val = filter.value?.trim() ?? ''
            switch (filter.op) {
                case 'equals': {
                    if (val === 'true') conds[col] = true
                    else if (val === 'false') conds[col] = false
                    else if (val !== '' && !isNaN(Number(val))) {
                        conds[col] = { $in: [val, Number(val)] }
                    } else {
                        conds[col] = val
                    }
                    break
                }
                case 'not_equals': {
                    conds[col] = { $ne: val !== '' && !isNaN(Number(val)) ? Number(val) : val }
                    break
                }
                case 'contains': {
                    conds[col] = { $regex: val, $options: 'i' }
                    break
                }
                case 'not_contains': {
                    conds[col] = { $not: { $regex: val, $options: 'i' } }
                    break
                }
                case 'starts_with': {
                    conds[col] = { $regex: `^${val}`, $options: 'i' }
                    break
                }
                case 'ends_with': {
                    conds[col] = { $regex: `${val}$`, $options: 'i' }
                    break
                }
                case 'gt': {
                    conds[col] = { $gt: isNaN(Number(val)) ? val : Number(val) }
                    break
                }
                case 'gte': {
                    conds[col] = { $gte: isNaN(Number(val)) ? val : Number(val) }
                    break
                }
                case 'lt': {
                    conds[col] = { $lt: isNaN(Number(val)) ? val : Number(val) }
                    break
                }
                case 'lte': {
                    conds[col] = { $lte: isNaN(Number(val)) ? val : Number(val) }
                    break
                }
                case 'is_null': {
                    conds[col] = null
                    break
                }
                case 'is_not_null': {
                    conds[col] = { $ne: null }
                    break
                }
                default:
                    break
            }
        }
        return conds
    }, [filters])

    // 合并文本过滤条件与列头筛选条件
    const combinedFilterJSON = useMemo(() => {
        const colConds = buildMongoFilterFromColumnFilters()
        let baseObj: Record<string, any> = {}
        try {
            if (filterText.trim() && filterText.trim() !== '{}') {
                baseObj = JSON.parse(filterText)
            }
        } catch {
            baseObj = {}
        }

        const hasColConds = Object.keys(colConds).length > 0
        const hasBaseConds = Object.keys(baseObj).length > 0

        if (hasColConds && hasBaseConds) {
            return JSON.stringify({ $and: [baseObj, colConds] })
        }
        if (hasColConds) {
            return JSON.stringify(colConds)
        }
        return filterText.trim() || '{}'
    }, [buildMongoFilterFromColumnFilters, filterText])

    // 查询执行
    const runQuery = useCallback(
        async (targetPage = 1, currentLimit = pageSize) => {
            if (!collection || !db) return
            setBusy(true)
            setError('')
            try {
                const spec: MongoQuerySpec = {
                    database: db,
                    collection,
                    filter: combinedFilterJSON,
                    projection: projectionText.trim() || '',
                    sort: sortText.trim() || '',
                    limit: currentLimit,
                    skip: (targetPage - 1) * currentLimit + (skip || 0),
                    hint: '',
                    collation: '',
                }
                const res: MongoFindResult = await API.mongoFind(id, spec)
                setDocs(res.documents || [])
                setTotal(res.total ?? 0)
                setCount(res.count ?? (res.documents?.length ?? 0))
                setDuration(res.durationMs ?? 0)
                setPage(targetPage)
            } catch (e) {
                setError(errorMessage(e))
            } finally {
                setBusy(false)
            }
        },
        [collection, combinedFilterJSON, db, id, pageSize, projectionText, skip, sortText]
    )

    useEffect(() => {
        if (collection && db) {
            void runQuery(1, pageSize)
        }
    }, [collection, db, combinedFilterJSON])

    // 解析当前页文档为行对象
    const parsedRows = useMemo((): Array<Record<string, any> & { __idx: number; __raw: string }> => {
        return docs.map((raw, idx) => {
            let obj: Record<string, any> = {}
            try {
                obj = JSON.parse(raw)
            } catch {
                obj = { _raw: raw }
            }
            return {
                ...obj,
                __idx: idx,
                __raw: raw,
            }
        })
    }, [docs])

    // 动态提取字段列
    const dynamicColumns = useMemo(() => {
        const keySet = new Set<string>()
        parsedRows.forEach((row) => {
            Object.keys(row).forEach((k) => {
                if (k !== '__idx' && k !== '__raw') {
                    keySet.add(k)
                }
            })
        })
        const keys = Array.from(keySet)
        // 保证 _id 在最前
        const idIdx = keys.indexOf('_id')
        if (idIdx > -1) {
            keys.splice(idIdx, 1)
            keys.unshift('_id')
        } else if (keys.length === 0) {
            keys.unshift('_id')
        }
        return keys
    }, [parsedRows])

    // 计算列宽与 ColDef 表头
    const dataCols: ColDef[] = useMemo(() => {
        const indexCol: ColDef = {
            key: '__index',
            label: '#',
            width: 48,
            minWidth: 44,
            resizable: false,
            align: 'center',
        }

        const cols: ColDef[] = dynamicColumns.map((colKey) => {
            const isPk = colKey === '_id'
            const activeFilter = filters[colKey]
            const minW = calcColWidthFromName(colKey, { isPk, hasFilter: true, minWidth: 95 })
            const currentW = colWidths[colKey] ? Math.max(minW, colWidths[colKey]) : minW

            return {
                key: colKey,
                width: currentW,
                minWidth: minW,
                resizable: true,
                isPk,
                hasFilter: true,
                label: (
                    <div className={d.headerCol}>
                        {isPk && <span className={d.pkBadge}>_id</span>}
                        <span className={d.headerColText} title={colKey}>
                            {colKey}
                        </span>
                        <ColumnFilterPopover
                            col={colKey}
                            activeFilter={activeFilter}
                            onApply={(newFilter) => {
                                setFilters((prev) => {
                                    const next = { ...prev }
                                    if (!newFilter) {
                                        delete next[colKey]
                                    } else {
                                        next[colKey] = newFilter
                                    }
                                    return next
                                })
                            }}
                        />
                    </div>
                ),
            }
        })

        return [indexCol, ...cols]
    }, [colWidths, dynamicColumns, filters])

    // 单元格格式化与渲染
    const renderCellContent = (val: any) => {
        if (val === null || val === undefined) {
            return <span className={d.nullCell}>null</span>
        }
        if (typeof val === 'boolean') {
            return <Tag color={val ? 'green' : 'default'}>{String(val)}</Tag>
        }
        if (typeof val === 'number') {
            return <span className={d.cellText} style={{ color: '#0ea5e9' }}>{String(val)}</span>
        }
        if (typeof val === 'object') {
            const isArr = Array.isArray(val)
            let summary = ''
            try {
                summary = JSON.stringify(val)
            } catch {
                summary = isArr ? '[Array]' : '[Object]'
            }
            return (
                <Tooltip title={summary} mouseEnterDelay={0.3}>
                    <span className={d.jsonCell}>
                        {isArr ? `Array(${val.length})` : Object.keys(val).length ? '{...}' : '{}'}
                    </span>
                </Tooltip>
            )
        }
        return <span className={d.cellText}>{String(val)}</span>
    }

    // 增删改操作
    const deleteDoc = (raw: string) => {
        let idVal: any = undefined
        try {
            const obj = JSON.parse(raw)
            if (obj._id !== undefined) idVal = obj._id
        } catch {
            /* fallback */
        }

        const idStr = idVal !== undefined ? JSON.stringify(idVal) : ''
        setConfirm({
            open: true,
            title: '删除文档',
            message: idStr ? `确定要删除 _id 为 ${idStr} 的文档吗？` : '确定要删除选中的文档吗？',
            danger: true,
            onConfirm: async () => {
                setConfirm(emptyConfirm)
                try {
                    const filterSpec = idStr ? `{"_id":${idStr}}` : raw
                    const deletedCount = await API.mongoDeleteOne(id, db, collection, filterSpec)
                    message.success(`已删除 ${deletedCount} 条文档`)
                    void runQuery(page, pageSize)
                } catch (e) {
                    message.error(errorMessage(e))
                }
            },
        })
    }

    const openInsert = () => {
        setEditorText('{\n  \n}')
        setEditorError('')
        setEditOpen({ mode: 'insert' })
    }

    const openUpdate = (raw: string) => {
        try {
            const obj = JSON.parse(raw)
            delete obj._id
            setEditorText(JSON.stringify({ $set: obj }, null, 2))
        } catch {
            setEditorText('{\n  "$set": {}\n}')
        }
        setEditorError('')
        setEditOpen({ mode: 'update', raw })
    }

    const openReplace = (raw: string) => {
        try {
            const obj = JSON.parse(raw)
            delete obj._id
            setEditorText(JSON.stringify(obj, null, 2))
        } catch {
            setEditorText(raw)
        }
        setEditorError('')
        setEditOpen({ mode: 'replace', raw })
    }

    const handleSaveDocModal = async () => {
        setEditorBusy(true)
        setEditorError('')
        try {
            if (editOpen?.mode === 'insert') {
                await API.mongoInsertOne(id, db, collection, editorText)
                message.success('文档插入成功')
            } else if (editOpen?.mode === 'update') {
                let filterSpec = '{}'
                if (editOpen.raw) {
                    try {
                        const obj = JSON.parse(editOpen.raw)
                        if (obj._id !== undefined) filterSpec = JSON.stringify({ _id: obj._id })
                    } catch {
                        /* fallback */
                    }
                }
                const res = await API.mongoUpdateOne(id, db, collection, filterSpec, editorText, false)
                message.success(`已更新文档（匹配 ${res.matchedCount ?? 1} 条）`)
            } else if (editOpen?.mode === 'replace') {
                let filterSpec = '{}'
                if (editOpen.raw) {
                    try {
                        const obj = JSON.parse(editOpen.raw)
                        if (obj._id !== undefined) filterSpec = JSON.stringify({ _id: obj._id })
                    } catch {
                        /* fallback */
                    }
                }
                const res = await API.mongoReplaceOne(id, db, collection, filterSpec, editorText, false)
                message.success(`已替换文档（匹配 ${res.matchedCount ?? 1} 条）`)
            }
            setEditOpen(null)
            void runQuery(page, pageSize)
        } catch (e) {
            setEditorError(errorMessage(e))
        } finally {
            setEditorBusy(false)
        }
    }

    // 清空集合（Truncate）
    const truncateCollection = () => {
        setConfirm({
            open: true,
            title: '清空集合',
            danger: true,
            message: `确定要清空集合 ${collection} 的全部文档吗？此操作不可逆！`,
            onConfirm: async () => {
                setConfirm(emptyConfirm)
                try {
                    const count = await API.mongoDeleteMany(id, db, collection, '{}')
                    message.success(`已清空 ${count} 条文档`)
                    void runQuery(1, pageSize)
                } catch (e) {
                    message.error(errorMessage(e))
                }
            },
        })
    }

    // 统计弹窗
    const openStats = async () => {
        setStatsBusy(true)
        setStatsModalOpen(true)
        try {
            const st = await API.mongoCollectionStats(id, db, collection)
            setStats(st)
        } catch (e) {
            message.error(errorMessage(e))
            setStats(null)
        } finally {
            setStatsBusy(false)
        }
    }

    // 右键上下文菜单项
    const getContextMenuItems = (): MenuProps['items'] => {
        if (!contextMenu) return []
        const row = parsedRows[contextMenu.rowIdx]
        if (!row) return []
        const raw = row.__raw
        let idStr = ''
        try {
            if (row._id !== undefined) idStr = JSON.stringify(row._id)
        } catch {
            /* ignore */
        }

        const items: MenuProps['items'] = [
            {
                key: 'edit',
                icon: <Edit size={13} />,
                label: '编辑文档 ($set)',
                onClick: () => openUpdate(raw),
            },
            {
                key: 'replace',
                icon: <FileText size={13} />,
                label: '替换整个文档',
                onClick: () => openReplace(raw),
            },
            { type: 'divider' },
            {
                key: 'copy-cell',
                icon: <Copy size={13} />,
                label: '复制当前单元格值',
                onClick: () => {
                    const col = contextMenu.col
                    if (col && row[col] !== undefined) {
                        const cellText = typeof row[col] === 'object' ? JSON.stringify(row[col]) : String(row[col])
                        copyTextToClipboard(cellText, '已复制单元格内容')
                    }
                },
            },
            {
                key: 'copy-json',
                icon: <Code size={13} />,
                label: '复制完整文档 JSON',
                onClick: () => {
                    try {
                        const pretty = JSON.stringify(JSON.parse(raw), null, 2)
                        copyTextToClipboard(pretty, '已复制文档 JSON')
                    } catch {
                        copyTextToClipboard(raw, '已复制文档 JSON')
                    }
                },
            },
            ...(idStr
                ? [
                      {
                          key: 'copy-id',
                          icon: <Copy size={13} />,
                          label: `复制 _id (${idStr})`,
                          onClick: () => copyTextToClipboard(idStr, '已复制 _id 到剪贴板'),
                      },
                  ]
                : []),
            {
                key: 'clone-doc',
                icon: <CopyPlus size={13} />,
                label: '克隆并插入新文档',
                onClick: async () => {
                    try {
                        const cloned = JSON.parse(raw)
                        delete cloned._id
                        await API.mongoInsertOne(id, db, collection, JSON.stringify(cloned))
                        message.success('已克隆文档并保存')
                        void runQuery(1, pageSize)
                    } catch (e) {
                        message.error(errorMessage(e))
                    }
                },
            },
            { type: 'divider' },
            {
                key: 'delete',
                icon: <Trash2 size={13} />,
                danger: true,
                label: '删除此文档',
                onClick: () => deleteDoc(raw),
            },
        ]
        return items
    }

    return (
        <div className={d.dataWrap}>
            {/* 顶部工具栏 */}
            <div className={d.tableHead}>
                <div className={d.tableNameWrap}>
                    <span className={d.dbTag}>{db}</span>
                    <span className={d.collName} title={collection}>
                        {collection}
                    </span>
                    <span className={d.countBadge}>
                        <Tag color="blue">{total} 文档</Tag>
                        {duration > 0 && <span style={{ color: 'var(--text-faint)' }}>{duration}ms</span>}
                    </span>
                </div>

                {/* 集合子功能切换 */}
                <Segmented
                    size="small"
                    value={subTab}
                    onChange={(v) => setSubTab(v as any)}
                    options={[
                        { label: '文档数据', value: 'documents', icon: <TableIcon size={12} /> },
                        { label: '索引管理', value: 'indexes', icon: <Layers size={12} /> },
                        { label: '结构校验', value: 'schema', icon: <SlidersHorizontal size={12} /> },
                        { label: '变更流', value: 'stream', icon: <Activity size={12} /> },
                    ]}
                />

                {/* 右侧动作工具栏 */}
                <div className={d.crudActions}>
                    {subTab === 'documents' && (
                        <>
                            <Segmented
                                size="small"
                                value={viewMode}
                                onChange={(v) => setViewMode(v as any)}
                                options={[
                                    { label: '表格', value: 'table', icon: <TableIcon size={12} /> },
                                    { label: 'JSON', value: 'json', icon: <Code size={12} /> },
                                ]}
                            />
                            <Button
                                size="small"
                                type="primary"
                                icon={<Plus size={12} />}
                                onClick={openInsert}
                            >
                                添加文档
                            </Button>
                            <Button
                                size="small"
                                icon={showBuilder ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                                onClick={() => setShowBuilder((v) => !v)}
                            >
                                查询过滤
                            </Button>
                            <Button
                                size="small"
                                icon={<Download size={12} />}
                                onClick={() => setIoExportOpen(true)}
                            >
                                导出
                            </Button>
                            <Button
                                size="small"
                                icon={<BarChart2 size={12} />}
                                onClick={openStats}
                            >
                                统计
                            </Button>
                            <Popconfirm
                                title="确定要清空该集合中的所有文档吗？"
                                okText="确定清空"
                                cancelText="取消"
                                okButtonProps={{ danger: true }}
                                onConfirm={truncateCollection}
                            >
                                <Button size="small" danger icon={<Trash2 size={12} />}>
                                    清空
                                </Button>
                            </Popconfirm>
                        </>
                    )}

                    <Tooltip title="刷新">
                        <Button
                            size="small"
                            icon={<RotateCw size={12} />}
                            loading={busy}
                            onClick={() => runQuery(page, pageSize)}
                        />
                    </Tooltip>
                </div>
            </div>

            {/* 查询构建器抽屉/展开区 */}
            {subTab === 'documents' && showBuilder && (
                <div className={d.filterBuilder}>
                    <div className={d.filterGrid}>
                        <div className={d.filterField}>
                            <span>过滤条件 Filter (JSON)</span>
                            <CodeEditor
                                lang="json"
                                height="65px"
                                value={filterText}
                                onChange={setFilterText}
                                placeholder='{"status": "active"}'
                            />
                        </div>
                        <div className={d.filterField}>
                            <span>投影 Projection (可选)</span>
                            <CodeEditor
                                lang="json"
                                height="65px"
                                value={projectionText}
                                onChange={setProjectionText}
                                placeholder='{"name": 1, "_id": 0}'
                            />
                        </div>
                        <div className={d.filterField}>
                            <span>排序 Sort (可选)</span>
                            <CodeEditor
                                lang="json"
                                height="65px"
                                value={sortText}
                                onChange={setSortText}
                                placeholder='{"createdAt": -1}'
                            />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: 120 }}>
                            <Button
                                type="primary"
                                size="small"
                                icon={<Search size={12} />}
                                loading={busy}
                                onClick={() => runQuery(1, pageSize)}
                            >
                                执行查询
                            </Button>
                            <Button
                                size="small"
                                onClick={() => {
                                    setFilterText('{}')
                                    setProjectionText('')
                                    setSortText('{}')
                                    setFilters({})
                                    setSkip(0)
                                }}
                            >
                                重置全部
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* 主内容区域 */}
            <div className={d.viewArea}>
                {subTab === 'indexes' && (
                    <IndexesTab session={session} db={db} collection={collection} />
                )}
                {subTab === 'schema' && (
                    <SchemaTab session={session} db={db} collection={collection} />
                )}
                {subTab === 'stream' && (
                    <ChangeStreamTab session={session} db={db} collection={collection} />
                )}

                {subTab === 'documents' && (
                    <>
                        {error && (
                            <div style={{ padding: '8px 12px' }}>
                                <Alert type="error" showIcon message={error} />
                            </div>
                        )}

                        {viewMode === 'table' && (
                            parsedRows.length === 0 && !busy ? (
                                <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-faint)', fontSize: 13 }}>
                                    暂无文档（或当前过滤条件无匹配数据）
                                </div>
                            ) : (
                                <ResizableTable
                                    cols={dataCols}
                                    data={parsedRows}
                                    onColResize={(colKey, newW) =>
                                        setColWidths((prev) => ({ ...prev, [colKey]: newW }))
                                    }
                                >
                                <tbody>
                                    {parsedRows.map((row, rIdx) => {
                                        const isSelected = selectedIdx === rIdx
                                        return (
                                            <tr
                                                key={rIdx}
                                                style={{
                                                    background: isSelected ? 'var(--bg-active, rgba(59,130,246,0.08))' : undefined,
                                                    cursor: 'pointer',
                                                }}
                                                onClick={() => setSelectedIdx(rIdx)}
                                                onDoubleClick={() => openUpdate(row.__raw)}
                                                onContextMenu={(e) => {
                                                    e.preventDefault()
                                                    setSelectedIdx(rIdx)
                                                    setContextMenu({
                                                        open: true,
                                                        x: e.clientX,
                                                        y: e.clientY,
                                                        rowIdx: rIdx,
                                                    })
                                                }}
                                            >
                                                {/* 序号列 */}
                                                <td
                                                    style={{
                                                        textAlign: 'center',
                                                        color: 'var(--text-faint)',
                                                        fontSize: 11,
                                                        userSelect: 'none',
                                                    }}
                                                >
                                                    {(page - 1) * pageSize + rIdx + 1}
                                                </td>
                                                {/* 动态字段数据列 */}
                                                {dynamicColumns.map((colKey) => {
                                                    const cellVal = row[colKey]
                                                    return (
                                                        <td
                                                            key={colKey}
                                                            onContextMenu={(e) => {
                                                                e.preventDefault()
                                                                e.stopPropagation()
                                                                setSelectedIdx(rIdx)
                                                                setContextMenu({
                                                                    open: true,
                                                                    x: e.clientX,
                                                                    y: e.clientY,
                                                                    rowIdx: rIdx,
                                                                    col: colKey,
                                                                })
                                                            }}
                                                        >
                                                            {renderCellContent(cellVal)}
                                                        </td>
                                                    )
                                                })}
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </ResizableTable>
                        ))}

                        {viewMode === 'json' && (
                            <div className={d.jsonViewWrap}>
                                {parsedRows.map((row, rIdx) => {
                                    const idVal = row._id !== undefined ? JSON.stringify(row._id) : `#${rIdx + 1}`
                                    let pretty = ''
                                    try {
                                        pretty = JSON.stringify(JSON.parse(row.__raw), null, 2)
                                    } catch {
                                        pretty = row.__raw
                                    }
                                    return (
                                        <div key={rIdx} className={d.jsonCard}>
                                            <div className={d.jsonCardHead}>
                                                <Space size={8}>
                                                    <Tag color="blue">{(page - 1) * pageSize + rIdx + 1}</Tag>
                                                    <span style={{ fontWeight: 600, color: 'var(--text)' }}>
                                                        _id: {idVal}
                                                    </span>
                                                </Space>
                                                <Space size={4}>
                                                    <Tooltip title="编辑">
                                                        <Button
                                                            size="small"
                                                            type="text"
                                                            icon={<Edit size={12} />}
                                                            onClick={() => openUpdate(row.__raw)}
                                                        />
                                                    </Tooltip>
                                                    <Tooltip title="复制 JSON">
                                                        <Button
                                                            size="small"
                                                            type="text"
                                                            icon={<Copy size={12} />}
                                                            onClick={() => copyTextToClipboard(pretty, '已复制文档 JSON')}
                                                        />
                                                    </Tooltip>
                                                    <Tooltip title="删除文档">
                                                        <Button
                                                            size="small"
                                                            type="text"
                                                            danger
                                                            icon={<Trash2 size={12} />}
                                                            onClick={() => deleteDoc(row.__raw)}
                                                        />
                                                    </Tooltip>
                                                </Space>
                                            </div>
                                            <pre className={d.jsonCardCode}>{pretty}</pre>
                                        </div>
                                    )
                                })}
                            </div>
                        )}

                        {/* 分页控制栏 */}
                        <div className={d.paginationFooter}>
                            <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                                共 {total} 条文档 · 每页 {pageSize} 条
                            </span>
                            <Pagination
                                size="small"
                                current={page}
                                pageSize={pageSize}
                                total={total}
                                disabled={busy}
                                showSizeChanger
                                pageSizeOptions={['10', '20', '50', '100', '200']}
                                onChange={(p, size) => {
                                    setPageSize(size)
                                    runQuery(p, size)
                                }}
                            />
                        </div>
                    </>
                )}
            </div>

            {/* 右键上下文菜单 */}
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

            {/* 增改文档模态框 */}
            {editOpen && (
                <Modal
                    open={true}
                    title={
                        editOpen.mode === 'insert'
                            ? '添加新文档'
                            : editOpen.mode === 'replace'
                            ? '替换完整文档'
                            : '更新文档（支持 $set 等修改器）'
                    }
                    onCancel={() => setEditOpen(null)}
                    onOk={handleSaveDocModal}
                    confirmLoading={editorBusy}
                    okText={editOpen.mode === 'insert' ? '插入' : '保存更新'}
                    cancelText="取消"
                    width={600}
                >
                    <div style={{ marginTop: 8 }}>
                        <CodeEditor lang="json" height="280px" value={editorText} onChange={setEditorText} />
                    </div>
                    {editorError && (
                        <div style={{ marginTop: 8 }}>
                            <Alert type="error" showIcon message={editorError} />
                        </div>
                    )}
                </Modal>
            )}

            {/* 集合统计模态框 */}
            {statsModalOpen && (
                <Modal
                    open={true}
                    title={`${collection} 集合统计`}
                    onCancel={() => setStatsModalOpen(false)}
                    footer={[
                        <Button key="close" type="primary" onClick={() => setStatsModalOpen(false)}>
                            关闭
                        </Button>,
                    ]}
                    width={440}
                >
                    {statsBusy ? (
                        <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-dim)' }}>加载中…</div>
                    ) : stats ? (
                        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 8 }}>
                            <tbody>
                                {[
                                    ['文档总数', String(stats.count)],
                                    ['数据大小', String(stats.size)],
                                    ['平均文档大小', String(stats.avgObjSize)],
                                    ['存储占用大小', String(stats.storageSize)],
                                    ['索引总大小', String(stats.totalIndexSize)],
                                    ['索引数量', String(stats.nindexes)],
                                ].map(([label, val]) => (
                                    <tr key={label} style={{ borderBottom: '1px solid var(--border)' }}>
                                        <th style={{ textAlign: 'left', padding: '8px 4px', color: 'var(--text-dim)', fontSize: 12 }}>
                                            {label}
                                        </th>
                                        <td style={{ textAlign: 'right', padding: '8px 4px', fontWeight: 600, fontSize: 12 }}>
                                            {val}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    ) : (
                        <div style={{ color: 'var(--text-dim)', padding: 12 }}>无法获取统计信息</div>
                    )}
                </Modal>
            )}

            {/* 导出模态框 */}
            {ioExportOpen && (
                <IoModal
                    sessionId={id}
                    db={db}
                    coll={collection}
                    currentDocs={docs}
                    filter={combinedFilterJSON}
                    onClose={() => setIoExportOpen(false)}
                />
            )}

            {/* 二次确认模态框 */}
            <ConfirmModal state={confirm} onCancel={() => setConfirm(emptyConfirm)} />
        </div>
    )
}
