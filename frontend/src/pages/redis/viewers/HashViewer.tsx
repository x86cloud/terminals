import React, { useState, useMemo } from 'react'
import { Table, Input, Button, Space, Tooltip, Modal, Drawer, Tag, Popconfirm, message } from 'antd'
import { Search, Plus, Trash2, Edit3, Eye, Copy, RefreshCw, FileCode, Table as TableIcon } from 'lucide-react'
import CodeEditor from '@/components/CodeEditor'
import { API } from '@/api'
import { RedisSessionInfo, RedisValue } from '@/types'
import { formatBytes } from '../redisTypes'
import s from './viewers.module.less'

interface Props {
    session: RedisSessionInfo
    selected: string
    value: RedisValue
    onReload: () => void
    flash?: (m: string) => void
}

interface HashRow {
    key: string // unique row id
    field: string
    val: string
    size: number
}

export default function HashViewer({ session, selected, value, onReload, flash }: Props) {
    const [searchText, setSearchText] = useState('')
    const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([])
    const [viewMode, setViewMode] = useState<'table' | 'json'>('table')

    // Modal state for Add / Edit
    const [editModalOpen, setEditModalOpen] = useState(false)
    const [isAdding, setIsAdding] = useState(false)
    const [modalField, setModalField] = useState('')
    const [modalVal, setModalVal] = useState('')
    const [submitting, setSubmitting] = useState(false)

    // Inspect drawer for large value
    const [inspectDrawer, setInspectDrawer] = useState<{ open: boolean; field: string; val: string }>({
        open: false,
        field: '',
        val: '',
    })

    // Parse items
    const rows = useMemo<HashRow[]>(() => {
        if (value.rawJson && typeof value.rawJson === 'object' && !Array.isArray(value.rawJson)) {
            return Object.entries(value.rawJson).map(([field, v]) => {
                const str = String(v ?? '')
                return {
                    key: field,
                    field,
                    val: str,
                    size: new Blob([str]).size,
                }
            })
        }

        // Fallback parse lines
        if (typeof value.value === 'string') {
            const lines = value.value.split('\n')
            const list: HashRow[] = []
            for (let i = 0; i < lines.length; i += 2) {
                if (i < lines.length) {
                    const f = lines[i]
                    const v = i + 1 < lines.length ? lines[i + 1] : ''
                    if (f !== undefined) {
                        list.push({
                            key: f || `row_${i}`,
                            field: f,
                            val: v,
                            size: new Blob([v]).size,
                        })
                    }
                }
            }
            return list
        }

        return []
    }, [value.rawJson, value.value])

    // Filtered rows
    const filteredRows = useMemo(() => {
        if (!searchText.trim()) return rows
        const query = searchText.toLowerCase().trim()
        return rows.filter(
            (r) => r.field.toLowerCase().includes(query) || r.val.toLowerCase().includes(query)
        )
    }, [rows, searchText])

    // Convert all to JSON string for json view
    const jsonString = useMemo(() => {
        const obj: Record<string, string> = {}
        for (const r of rows) {
            obj[r.field] = r.val
        }
        return JSON.stringify(obj, null, 2)
    }, [rows])

    const openAddModal = () => {
        setIsAdding(true)
        setModalField('')
        setModalVal('')
        setEditModalOpen(true)
    }

    const openEditModal = (row: HashRow) => {
        setIsAdding(false)
        setModalField(row.field)
        setModalVal(row.val)
        setEditModalOpen(true)
    }

    const handleSaveField = async () => {
        if (!modalField.trim()) {
            message.warning('字段名 (field) 不能为空')
            return
        }
        setSubmitting(true)
        try {
            await API.redisHashFieldSet(session.id, selected, modalField.trim(), modalVal)
            message.success(isAdding ? `已新增字段 [${modalField}]` : `已更新字段 [${modalField}]`)
            setEditModalOpen(false)
            onReload()
        } catch (e: any) {
            message.error('操作失败: ' + (e?.message || e))
        } finally {
            setSubmitting(false)
        }
    }

    const handleDeleteSingle = async (field: string) => {
        try {
            await API.redisHashFieldDel(session.id, selected, [field])
            message.success(`已删除字段 [${field}]`)
            onReload()
        } catch (e: any) {
            message.error('删除失败: ' + (e?.message || e))
        }
    }

    const handleBatchDelete = async () => {
        const fields = selectedRowKeys.map(String)
        if (fields.length === 0) return
        try {
            await API.redisHashFieldDel(session.id, selected, fields)
            message.success(`已成功批量删除 ${fields.length} 个字段`)
            setSelectedRowKeys([])
            onReload()
        } catch (e: any) {
            message.error('批量删除失败: ' + (e?.message || e))
        }
    }

    const copyText = async (text: string, label = '内容') => {
        try {
            await navigator.clipboard.writeText(text)
            message.success(`已复制${label}`)
        } catch {
            message.error('复制失败')
        }
    }

    const columns = [
        {
            title: '#',
            width: 50,
            align: 'center' as const,
            render: (_: any, __: any, index: number) => (
                <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>{index + 1}</span>
            ),
        },
        {
            title: '字段名 (Field)',
            dataIndex: 'field',
            key: 'field',
            width: 220,
            ellipsis: true,
            render: (field: string) => (
                <span className={s.cellKey} title={field}>
                    {field}
                </span>
            ),
        },
        {
            title: '字段值 (Value)',
            dataIndex: 'val',
            key: 'val',
            ellipsis: true,
            render: (val: string, row: HashRow) => {
                const isJson = /^\s*[[{]/.test(val)
                return (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span
                            className={s.cellValue}
                            title="点击查看 / 编辑完整值"
                            onClick={() => setInspectDrawer({ open: true, field: row.field, val })}
                        >
                            {val || <span style={{ color: 'var(--text-dim)', fontStyle: 'italic' }}>(空值)</span>}
                        </span>
                        {isJson && <Tag color="geekblue" style={{ fontSize: 10, padding: '0 4px', lineHeight: '16px' }}>JSON</Tag>}
                    </div>
                )
            },
        },
        {
            title: '大小',
            dataIndex: 'size',
            key: 'size',
            width: 90,
            render: (size: number) => (
                <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>{formatBytes(size)}</span>
            ),
        },
        {
            title: '操作',
            key: 'actions',
            width: 120,
            align: 'right' as const,
            render: (_: any, row: HashRow) => (
                <Space size={2}>
                    <Tooltip title="查看完整详情">
                        <Button
                            size="small"
                            type="text"
                            icon={<Eye size={12} />}
                            onClick={() => setInspectDrawer({ open: true, field: row.field, val: row.val })}
                        />
                    </Tooltip>
                    <Tooltip title="编辑字段">
                        <Button
                            size="small"
                            type="text"
                            icon={<Edit3 size={12} />}
                            onClick={() => openEditModal(row)}
                        />
                    </Tooltip>
                    <Popconfirm
                        title={`确定删除字段 [${row.field}] 吗？`}
                        onConfirm={() => handleDeleteSingle(row.field)}
                        okText="删除"
                        cancelText="取消"
                        okButtonProps={{ danger: true }}
                    >
                        <Tooltip title="删除字段 (HDEL)">
                            <Button size="small" type="text" danger icon={<Trash2 size={12} />} />
                        </Tooltip>
                    </Popconfirm>
                </Space>
            ),
        },
    ]

    return (
        <div className={s.viewerContainer}>
            <div className={s.viewerToolbar}>
                <div className={s.toolbarLeft}>
                    <Input
                        size="small"
                        prefix={<Search size={12} style={{ color: 'var(--text-dim)' }} />}
                        placeholder="搜索字段名或内容..."
                        value={searchText}
                        onChange={(e) => setSearchText(e.target.value)}
                        allowClear
                        className={s.searchInput}
                    />
                    <span className={s.countBadge}>
                        共 {rows.length} 个字段
                        {searchText && ` (过滤显示 ${filteredRows.length} 个)`}
                    </span>
                    {selectedRowKeys.length > 0 && (
                        <Popconfirm
                            title={`确定批量删除选中的 ${selectedRowKeys.length} 个字段吗？`}
                            onConfirm={handleBatchDelete}
                            okText="批量删除"
                            cancelText="取消"
                            okButtonProps={{ danger: true }}
                        >
                            <Button size="small" danger icon={<Trash2 size={12} />}>
                                批量删除 ({selectedRowKeys.length})
                            </Button>
                        </Popconfirm>
                    )}
                </div>

                <div className={s.toolbarRight}>
                    <Button
                        size="small"
                        icon={viewMode === 'table' ? <FileCode size={12} /> : <TableIcon size={12} />}
                        onClick={() => setViewMode(viewMode === 'table' ? 'json' : 'table')}
                    >
                        {viewMode === 'table' ? '查看 JSON' : '表格视图'}
                    </Button>
                    <Button size="small" type="primary" icon={<Plus size={12} />} onClick={openAddModal}>
                        新增字段 (HSET)
                    </Button>
                </div>
            </div>

            <div className={s.tableArea}>
                {viewMode === 'table' ? (
                    <Table
                        size="small"
                        rowKey="field"
                        dataSource={filteredRows}
                        columns={columns}
                        pagination={{
                            defaultPageSize: 50,
                            pageSizeOptions: ['20', '50', '100', '200'],
                            showSizeChanger: true,
                            showTotal: (total) => `共 ${total} 条`,
                            size: 'small',
                        }}
                        rowSelection={{
                            selectedRowKeys,
                            onChange: setSelectedRowKeys,
                        }}
                        locale={{
                            emptyText: (
                                <div className={s.emptyTip}>
                                    <span>当前 Hash 无任何字段</span>
                                    <Button size="small" type="primary" icon={<Plus size={12} />} onClick={openAddModal}>
                                        新增第一个字段
                                    </Button>
                                </div>
                            ),
                        }}
                    />
                ) : (
                    <div style={{ height: '100%', padding: 8 }}>
                        <CodeEditor
                            value={jsonString}
                            onChange={() => {}}
                            lang="json"
                            readOnly
                            height="100%"
                            lineNumbers
                        />
                    </div>
                )}
            </div>

            {/* Edit / Add Field Modal */}
            <Modal
                title={isAdding ? '新增 Hash 字段 (HSET)' : `编辑字段 [${modalField}]`}
                open={editModalOpen}
                onOk={handleSaveField}
                confirmLoading={submitting}
                onCancel={() => setEditModalOpen(false)}
                okText="保存写入"
                cancelText="取消"
                width={560}
            >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
                    <div>
                        <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 4 }}>字段名 (Field)</div>
                        <Input
                            placeholder="例如: username, age, config..."
                            value={modalField}
                            disabled={!isAdding}
                            onChange={(e) => setModalField(e.target.value)}
                        />
                    </div>
                    <div>
                        <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 4 }}>字段值 (Value)</div>
                        <CodeEditor
                            value={modalVal}
                            onChange={setModalVal}
                            lang={/^\s*[[{]/.test(modalVal) ? 'json' : 'plain'}
                            height="200px"
                            bordered
                            placeholder="字段具体内容，支持多行或 JSON 格式..."
                        />
                    </div>
                </div>
            </Modal>

            {/* Inspect Drawer for Large Value */}
            <Drawer
                title={`查看字段: ${inspectDrawer.field}`}
                open={inspectDrawer.open}
                onClose={() => setInspectDrawer({ open: false, field: '', val: '' })}
                width={620}
                extra={
                    <Space size={6}>
                        <Button
                            size="small"
                            icon={<Copy size={12} />}
                            onClick={() => copyText(inspectDrawer.val, '值内容')}
                        >
                            复制
                        </Button>
                        <Button
                            size="small"
                            type="primary"
                            icon={<Edit3 size={12} />}
                            onClick={() => {
                                setInspectDrawer({ open: false, field: '', val: '' })
                                openEditModal({
                                    key: inspectDrawer.field,
                                    field: inspectDrawer.field,
                                    val: inspectDrawer.val,
                                    size: 0,
                                })
                            }}
                        >
                            编辑
                        </Button>
                    </Space>
                }
            >
                <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                        长度: {inspectDrawer.val.length} 字符 | 大小: {formatBytes(new Blob([inspectDrawer.val]).size)}
                    </div>
                    <div style={{ flex: 1, minHeight: 0 }}>
                        <CodeEditor
                            value={inspectDrawer.val}
                            onChange={() => {}}
                            lang={/^\s*[[{]/.test(inspectDrawer.val) ? 'json' : 'plain'}
                            readOnly
                            height="100%"
                            lineNumbers
                        />
                    </div>
                </div>
            </Drawer>
        </div>
    )
}
