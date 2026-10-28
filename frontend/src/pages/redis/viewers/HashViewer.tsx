import React, { useState, useMemo } from 'react'
import { Table, Input, Button, Space, Tooltip, Modal, Drawer, Tag, Popconfirm, App } from 'antd'
import { Search, Plus, Trash2, Edit3, Eye, Copy, FileCode, Table as TableIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import CodeEditor from '@/components/CodeEditor'
import { API } from '@/api'
import { RedisSessionInfo, RedisValue } from '@/types'
import { formatBytes } from '../redisTypes'
import { copyText } from '@/utils'
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
    const { t } = useTranslation('redis')
    const { message } = App.useApp()
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
            message.warning(t('viewers.hash.reqField'))
            return
        }
        setSubmitting(true)
        try {
            await API.redisHashFieldSet(session.id, selected, modalField.trim(), modalVal)
            message.success(isAdding ? t('viewers.hash.fieldAdded', { field: modalField }) : t('viewers.hash.fieldUpdated', { field: modalField }))
            setEditModalOpen(false)
            onReload()
        } catch (e: any) {
            message.error(t('viewers.hash.opFail', { error: e?.message || e }))
        } finally {
            setSubmitting(false)
        }
    }

    const handleDeleteSingle = async (field: string) => {
        try {
            await API.redisHashFieldDel(session.id, selected, [field])
            message.success(t('viewers.hash.fieldDeleted', { field }))
            onReload()
        } catch (e: any) {
            message.error(t('viewers.hash.deleteFail', { error: e?.message || e }))
        }
    }

    const handleBatchDelete = async () => {
        const fields = selectedRowKeys.map(String)
        if (fields.length === 0) return
        try {
            await API.redisHashFieldDel(session.id, selected, fields)
            message.success(t('viewers.hash.batchDeleted', { count: fields.length }))
            setSelectedRowKeys([])
            onReload()
        } catch (e: any) {
            message.error(t('viewers.hash.batchDeleteFail', { error: e?.message || e }))
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
            title: t('viewers.hash.colField'),
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
            title: t('viewers.hash.colValue'),
            dataIndex: 'val',
            key: 'val',
            ellipsis: true,
            render: (val: string, row: HashRow) => {
                const isJson = /^\s*[[{]/.test(val)
                return (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span
                            className={s.cellValue}
                            title={t('viewers.hash.clickInspect')}
                            onClick={() => setInspectDrawer({ open: true, field: row.field, val })}
                        >
                            {val || <span style={{ color: 'var(--text-dim)', fontStyle: 'italic' }}>{t('viewers.hash.emptyVal')}</span>}
                        </span>
                        {isJson && <Tag color="geekblue" style={{ fontSize: 10, padding: '0 4px', lineHeight: '16px' }}>JSON</Tag>}
                    </div>
                )
            },
        },
        {
            title: t('viewers.common.colSize'),
            dataIndex: 'size',
            key: 'size',
            width: 90,
            render: (size: number) => (
                <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>{formatBytes(size)}</span>
            ),
        },
        {
            title: t('viewers.common.colAction'),
            key: 'actions',
            width: 120,
            align: 'right' as const,
            render: (_: any, row: HashRow) => (
                <Space size={2}>
                    <Tooltip title={t('viewers.hash.inspectTooltip')}>
                        <Button
                            size="small"
                            type="text"
                            icon={<Eye size={12} />}
                            onClick={() => setInspectDrawer({ open: true, field: row.field, val: row.val })}
                        />
                    </Tooltip>
                    <Tooltip title={t('viewers.hash.editTooltip')}>
                        <Button
                            size="small"
                            type="text"
                            icon={<Edit3 size={12} />}
                            onClick={() => openEditModal(row)}
                        />
                    </Tooltip>
                    <Popconfirm
                        title={t('viewers.hash.deleteConfirm', { field: row.field })}
                        onConfirm={() => handleDeleteSingle(row.field)}
                        okText={t('viewers.common.delete')}
                        cancelText={t('viewers.common.cancel')}
                        okButtonProps={{ danger: true }}
                    >
                        <Tooltip title={t('viewers.hash.deleteTooltip')}>
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
                        placeholder={t('viewers.hash.searchPlaceholder')}
                        value={searchText}
                        onChange={(e) => setSearchText(e.target.value)}
                        allowClear
                        className={s.searchInput}
                    />
                    <span className={s.countBadge}>
                        {t('viewers.hash.totalFields', { count: rows.length })}
                        {searchText && t('viewers.hash.filteredFields', { count: filteredRows.length })}
                    </span>
                    {selectedRowKeys.length > 0 && (
                        <Popconfirm
                            title={t('viewers.hash.batchDeleteConfirm', { count: selectedRowKeys.length })}
                            onConfirm={handleBatchDelete}
                            okText={t('viewers.common.batchDelete')}
                            cancelText={t('viewers.common.cancel')}
                            okButtonProps={{ danger: true }}
                        >
                            <Button size="small" danger icon={<Trash2 size={12} />}>
                                {t('viewers.hash.batchDeleteBtn', { count: selectedRowKeys.length })}
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
                        {viewMode === 'table' ? t('viewers.common.viewJson') : t('viewers.common.viewTable')}
                    </Button>
                    <Button size="small" type="primary" icon={<Plus size={12} />} onClick={openAddModal}>
                        {t('viewers.hash.addFieldBtn')}
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
                            showTotal: (total) => t('viewers.common.totalRecords', { total }),
                            size: 'small',
                        }}
                        rowSelection={{
                            selectedRowKeys,
                            onChange: setSelectedRowKeys,
                        }}
                        locale={{
                            emptyText: (
                                <div className={s.emptyTip}>
                                    <span>{t('viewers.hash.emptyHash')}</span>
                                    <Button size="small" type="primary" icon={<Plus size={12} />} onClick={openAddModal}>
                                        {t('viewers.hash.addFirstField')}
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
                title={isAdding ? t('viewers.hash.addModalTitle') : t('viewers.hash.editModalTitle', { field: modalField })}
                open={editModalOpen}
                onOk={handleSaveField}
                confirmLoading={submitting}
                onCancel={() => setEditModalOpen(false)}
                okText={t('viewers.common.saveWrite')}
                cancelText={t('viewers.common.cancel')}
                width={560}
            >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
                    <div>
                        <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 4 }}>{t('viewers.hash.fieldLabel')}</div>
                        <Input
                            placeholder={t('viewers.hash.fieldPlaceholder')}
                            value={modalField}
                            disabled={!isAdding}
                            onChange={(e) => setModalField(e.target.value)}
                        />
                    </div>
                    <div>
                        <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 4 }}>{t('viewers.hash.valLabel')}</div>
                        <CodeEditor
                            value={modalVal}
                            onChange={setModalVal}
                            lang={/^\s*[[{]/.test(modalVal) ? 'json' : 'plain'}
                            height="200px"
                            bordered
                            placeholder={t('viewers.hash.valPlaceholder')}
                        />
                    </div>
                </div>
            </Modal>

            {/* Inspect Drawer for Large Value */}
            <Drawer
                title={t('viewers.hash.inspectTitle', { field: inspectDrawer.field })}
                open={inspectDrawer.open}
                onClose={() => setInspectDrawer({ open: false, field: '', val: '' })}
                width={620}
                extra={
                    <Space size={6}>
                        <Button
                            size="small"
                            icon={<Copy size={12} />}
                            onClick={async () => {
                                if (await copyText(inspectDrawer.val)) message.success(t('viewers.common.copiedVal'))
                            }}
                        >
                            {t('viewers.common.copy')}
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
                            {t('viewers.common.edit')}
                        </Button>
                    </Space>
                }
            >
                <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                        {t('viewers.common.lengthAndSize', { length: inspectDrawer.val.length, size: formatBytes(new Blob([inspectDrawer.val]).size) })}
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

