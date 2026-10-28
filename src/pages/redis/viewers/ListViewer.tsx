import { useState, useMemo } from 'react'
import { Table, Input, Button, Space, Tooltip, Modal, Drawer, Tag, Popconfirm, App } from 'antd'
import { Search, Plus, Trash2, Edit3, Eye, Copy, CornerDownLeft, CornerDownRight } from 'lucide-react'
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

interface ListRow {
    index: number
    val: string
    size: number
}

export default function ListViewer({ session, selected, value, onReload, flash }: Props) {
    const { t } = useTranslation('redis')
    const { message } = App.useApp()
    const [searchText, setSearchText] = useState('')

    // Push Modal
    const [pushModalOpen, setPushModalOpen] = useState(false)
    const [pushDirection, setPushDirection] = useState<'left' | 'right'>('right')
    const [pushContent, setPushContent] = useState('')
    const [pushing, setPushing] = useState(false)

    // Edit Item Modal (LSET)
    const [editModalOpen, setEditModalOpen] = useState(false)
    const [editIndex, setEditIndex] = useState<number>(0)
    const [editContent, setEditContent] = useState('')
    const [editing, setEditing] = useState(false)

    // Inspect Drawer
    const [inspectDrawer, setInspectDrawer] = useState<{ open: boolean; index: number; val: string }>({
        open: false,
        index: 0,
        val: '',
    })

    // Parse list items
    const rows = useMemo<ListRow[]>(() => {
        if (Array.isArray(value.rawJson)) {
            return value.rawJson.map((v, i) => {
                const str = String(v ?? '')
                return {
                    index: i,
                    val: str,
                    size: new Blob([str]).size,
                }
            })
        }
        if (typeof value.value === 'string' && value.value.length > 0) {
            return value.value.split('\n').map((v, i) => ({
                index: i,
                val: v,
                size: new Blob([v]).size,
            }))
        }
        return []
    }, [value.rawJson, value.value])

    const filteredRows = useMemo(() => {
        if (!searchText.trim()) return rows
        const query = searchText.toLowerCase().trim()
        return rows.filter((r) => r.val.toLowerCase().includes(query))
    }, [rows, searchText])

    const handlePush = async () => {
        if (!pushContent.trim()) {
            message.warning(t('viewers.list.reqPush'))
            return
        }
        setPushing(true)
        try {
            await API.redisListPush(session.id, selected, pushContent, pushDirection === 'left')
            message.success(pushDirection === 'left' ? t('viewers.list.pushLeftSuccess') : t('viewers.list.pushRightSuccess'))
            setPushModalOpen(false)
            setPushContent('')
            onReload()
        } catch (e: any) {
            message.error(t('viewers.list.pushFail', { error: e?.message || e }))
        } finally {
            setPushing(false)
        }
    }

    const handlePop = async (left: boolean) => {
        try {
            const popped = await API.redisListPop(session.id, selected, left)
            Modal.info({
                title: left ? t('viewers.list.lpopTitle') : t('viewers.list.rpopTitle'),
                content: (
                    <div style={{ marginTop: 12 }}>
                        <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 6 }}>{t('viewers.list.popRemoved')}</div>
                        <CodeEditor value={popped || '(nil)'} onChange={() => {}} lang="plain" readOnly height="120px" />
                    </div>
                ),
                okText: t('viewers.list.popOk'),
            })
            onReload()
        } catch (e: any) {
            message.error(t('viewers.list.popFail', { error: e?.message || e }))
        }
    }

    const handleSaveEdit = async () => {
        setEditing(true)
        try {
            // LSET key index value
            const escaped = editContent.replace(/"/g, '\\"')
            const res = await API.redisRaw(session.id, `LSET "${selected}" ${editIndex} "${escaped}"`)
            if (res && res.result && String(res.result).startsWith('ERR')) {
                throw new Error(String(res.result))
            }
            message.success(t('viewers.list.itemUpdated', { idx: editIndex }))
            setEditModalOpen(false)
            onReload()
        } catch (e: any) {
            message.error(t('viewers.list.editFail', { error: e?.message || e }))
        } finally {
            setEditing(false)
        }
    }

    const handleDeleteItem = async (row: ListRow) => {
        try {
            // LREM key 1 value
            const escaped = row.val.replace(/"/g, '\\"')
            await API.redisRaw(session.id, `LREM "${selected}" 1 "${escaped}"`)
            message.success(t('viewers.list.itemDeleted'))
            onReload()
        } catch (e: any) {
            message.error(t('viewers.list.deleteFail', { error: e?.message || e }))
        }
    }

    const columns = [
        {
            title: t('viewers.list.colIndex'),
            dataIndex: 'index',
            key: 'index',
            width: 110,
            render: (idx: number) => (
                <Tag color="blue" style={{ fontFamily: 'monospace', fontWeight: 600 }}>
                    [{idx}]
                </Tag>
            ),
        },
        {
            title: t('viewers.list.colValue'),
            dataIndex: 'val',
            key: 'val',
            ellipsis: true,
            render: (val: string, row: ListRow) => {
                const isJson = /^\s*[[{]/.test(val)
                return (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span
                            className={s.cellValue}
                            title={t('viewers.list.clickInspect')}
                            onClick={() => setInspectDrawer({ open: true, index: row.index, val })}
                        >
                            {val}
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
            render: (_: any, row: ListRow) => (
                <Space size={2}>
                    <Tooltip title={t('viewers.common.inspect')}>
                        <Button
                            size="small"
                            type="text"
                            icon={<Eye size={12} />}
                            onClick={() => setInspectDrawer({ open: true, index: row.index, val: row.val })}
                        />
                    </Tooltip>
                    <Tooltip title={t('viewers.list.editLset')}>
                        <Button
                            size="small"
                            type="text"
                            icon={<Edit3 size={12} />}
                            onClick={() => {
                                setEditIndex(row.index)
                                setEditContent(row.val)
                                setEditModalOpen(true)
                            }}
                        />
                    </Tooltip>
                    <Popconfirm
                        title={t('viewers.list.deleteConfirm')}
                        onConfirm={() => handleDeleteItem(row)}
                        okText={t('viewers.common.delete')}
                        cancelText={t('viewers.common.cancel')}
                        okButtonProps={{ danger: true }}
                    >
                        <Tooltip title={t('viewers.list.deleteTooltip')}>
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
                        placeholder={t('viewers.list.searchPlaceholder')}
                        value={searchText}
                        onChange={(e) => setSearchText(e.target.value)}
                        allowClear
                        className={s.searchInput}
                    />
                    <span className={s.countBadge}>
                        {t('viewers.list.totalElements', { count: rows.length })}
                        {searchText && t('viewers.list.filteredElements', { count: filteredRows.length })}
                    </span>
                </div>

                <div className={s.toolbarRight}>
                    <Tooltip title={t('viewers.list.lpopTooltip')}>
                        <Button size="small" disabled={rows.length === 0} onClick={() => handlePop(true)}>
                            {t('viewers.list.lpopBtn')}
                        </Button>
                    </Tooltip>
                    <Tooltip title={t('viewers.list.rpopTooltip')}>
                        <Button size="small" disabled={rows.length === 0} onClick={() => handlePop(false)}>
                            {t('viewers.list.rpopBtn')}
                        </Button>
                    </Tooltip>
                    <Button
                        size="small"
                        icon={<CornerDownLeft size={12} />}
                        onClick={() => {
                            setPushDirection('left')
                            setPushContent('')
                            setPushModalOpen(true)
                        }}
                    >
                        {t('viewers.list.lpushBtn')}
                    </Button>
                    <Button
                        size="small"
                        type="primary"
                        icon={<CornerDownRight size={12} />}
                        onClick={() => {
                            setPushDirection('right')
                            setPushContent('')
                            setPushModalOpen(true)
                        }}
                    >
                        {t('viewers.list.rpushBtn')}
                    </Button>
                </div>
            </div>

            <div className={s.tableArea}>
                <Table
                    size="small"
                    rowKey="index"
                    dataSource={filteredRows}
                    columns={columns}
                    pagination={{
                        defaultPageSize: 50,
                        pageSizeOptions: ['20', '50', '100', '200'],
                        showSizeChanger: true,
                        showTotal: (total) => t('viewers.common.totalRecords', { total }),
                        size: 'small',
                    }}
                    locale={{
                        emptyText: (
                            <div className={s.emptyTip}>
                                <span>{t('viewers.list.emptyList')}</span>
                                <Button
                                    size="small"
                                    type="primary"
                                    icon={<Plus size={12} />}
                                    onClick={() => {
                                        setPushDirection('right')
                                        setPushModalOpen(true)
                                    }}
                                >
                                    {t('viewers.list.pushFirst')}
                                </Button>
                            </div>
                        ),
                    }}
                />
            </div>

            {/* Push Modal */}
            <Modal
                title={pushDirection === 'left' ? t('viewers.list.lpushModalTitle') : t('viewers.list.rpushModalTitle')}
                open={pushModalOpen}
                onOk={handlePush}
                confirmLoading={pushing}
                onCancel={() => setPushModalOpen(false)}
                okText={t('viewers.list.pushEnqueue')}
                cancelText={t('viewers.common.cancel')}
                width={540}
            >
                <div style={{ marginTop: 16 }}>
                    <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 6 }}>{t('viewers.list.elemContentLabel')}</div>
                    <CodeEditor
                        value={pushContent}
                        onChange={setPushContent}
                        lang={/^\s*[[{]/.test(pushContent) ? 'json' : 'plain'}
                        height="180px"
                        bordered
                        placeholder={t('viewers.list.elemContentPlaceholder')}
                    />
                </div>
            </Modal>

            {/* Edit Item Modal */}
            <Modal
                title={t('viewers.list.editItemTitle', { idx: editIndex })}
                open={editModalOpen}
                onOk={handleSaveEdit}
                confirmLoading={editing}
                onCancel={() => setEditModalOpen(false)}
                okText={t('viewers.list.updateBtn')}
                cancelText={t('viewers.common.cancel')}
                width={540}
            >
                <div style={{ marginTop: 16 }}>
                    <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 6 }}>{t('viewers.list.newElemContent')}</div>
                    <CodeEditor
                        value={editContent}
                        onChange={setEditContent}
                        lang={/^\s*[[{]/.test(editContent) ? 'json' : 'plain'}
                        height="200px"
                        bordered
                    />
                </div>
            </Modal>

            {/* Inspect Drawer */}
            <Drawer
                title={t('viewers.list.inspectTitle', { idx: inspectDrawer.index })}
                open={inspectDrawer.open}
                onClose={() => setInspectDrawer({ open: false, index: 0, val: '' })}
                width={600}
                extra={
                    <Space size={6}>
                        <Button size="small" icon={<Copy size={12} />} onClick={async () => { if (await copyText(inspectDrawer.val)) message.success(t('viewers.common.copiedVal')) }}>
                            {t('viewers.common.copy')}
                        </Button>
                        <Button
                            size="small"
                            type="primary"
                            icon={<Edit3 size={12} />}
                            onClick={() => {
                                setInspectDrawer({ open: false, index: 0, val: '' })
                                setEditIndex(inspectDrawer.index)
                                setEditContent(inspectDrawer.val)
                                setEditModalOpen(true)
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
