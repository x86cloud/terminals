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
import ResizableTable, { ColDef } from '@/components/ResizableTable'
import { MysqlColumn, MysqlIndex, MysqlConstraint } from './mysqlTypes'
import CellEditorInline from './CellEditorInline'
import my from './DataTab.module.less'
import db from '@/pages/mysql/dbTable.module.less'
import sh from '@/pages/mysql/mysqlShared.module.less'

const ROW_ACT_W = 48
const ROW_NUM_W = 46
const DEFAULT_COL_W = 130

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
    const [whereInput, setWhereInput] = useState('')
    const [activeWhere, setActiveWhere] = useState('')
    const [sortCol, setSortCol] = useState('')
    const [sortOrder, setSortOrder] = useState<'ASC' | 'DESC'>('ASC')
    const [countingRows, setCountingRows] = useState(false)

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

    const getColW = (key: string) => colWidths[key] ?? DEFAULT_COL_W

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
    const loadData = async (targetPage = page, targetSize = pageSize, where = activeWhere) => {
        setLoading(true)
        try {
            const offset = (targetPage - 1) * targetSize
            let res: any
            if (where.trim() || sortCol) {
                let sql = `SELECT * FROM \`${tableName}\``
                if (where.trim()) {
                    const cleanWhere = where.trim().replace(/^WHERE\s+/i, '')
                    sql += ` WHERE ${cleanWhere}`
                }
                if (sortCol) {
                    sql += ` ORDER BY \`${sortCol}\` ${sortOrder}`
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
            API.mysqlCount(serverId, dbName, tableName)
                .then((cnt) => setTotalRows(cnt))
                .catch(() => { })
                .finally(() => setCountingRows(false))
        } catch (e: any) {
            message.error('查询数据失败: ' + (e.message || e))
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
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
        if (origVal === newVal) {
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

        setRowDrafts((prev) => ({
            ...prev,
            [rowIdx]: {
                ...(prev[rowIdx] || {}),
                [col]: newVal,
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

            message.success('已成功保存所有数据变更！')
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
            message.success('已成功删除行！')
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

    // 构造数据列定义
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
                return {
                    key: c,
                    label: (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 2, whiteSpace: 'nowrap' }}>
                            <span>{c}</span>
                            {isPk && <span className={my.pkBadge}>PK</span>}
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
    }, [columns, pkList, colWidths])

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
                    {/* WHERE 过滤条件栏 */}
                    <div className={my.filterBar}>
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
                        className={my.editTable}
                    >
                        <tbody>
                            {/* 渲染未保存的新增行 */}
                            {newRows.map((newRow, nIdx) => (
                                <tr key={'new_' + nIdx} className={my.rowNew}>
                                    <td className={my.rownum} style={{ color: '#52c41a', fontWeight: 700 }}>+</td>
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
                                                    <span className={my.cellNull}>NULL</span>
                                                ) : val !== undefined ? (
                                                    String(val)
                                                ) : (
                                                    <span className={my.cellNull}>DEFAULT</span>
                                                )}
                                            </td>
                                        )
                                    })}
                                    <td className={my.rowact}>
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
                                        <td className={my.rownum}>{(page - 1) * pageSize + rIdx + 1}</td>
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
                                        <td className={my.rowact}>
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
                                message.success('已复制 DDL 脚本到剪贴板！')
                            }}
                        >
                            复制 DDL
                        </Button>
                    </div>
                    <pre className={my.ddlViewer}>{ddlText}</pre>
                </div>
            )}
        </div>
    )
}
