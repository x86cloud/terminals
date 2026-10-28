import React, { useState, useMemo } from 'react'
import { Table, Input, Button, Space, Tooltip, Modal, Drawer, Tag, Popconfirm, App } from 'antd'
import { Search, Plus, Trash2, Eye, Copy } from 'lucide-react'
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

interface SetRow {
    member: string
    size: number
}

export default function SetViewer({ session, selected, value, onReload, flash }: Props) {
    const { t } = useTranslation('redis')
    const { message } = App.useApp()
    const [searchText, setSearchText] = useState('')
    const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([])

    // Add Modal
    const [addModalOpen, setAddModalOpen] = useState(false)
    const [addText, setAddText] = useState('')
    const [adding, setAdding] = useState(false)

    // Inspect Drawer
    const [inspectDrawer, setInspectDrawer] = useState<{ open: boolean; member: string }>({
        open: false,
        member: '',
    })

    const rows = useMemo<SetRow[]>(() => {
        if (Array.isArray(value.rawJson)) {
            return value.rawJson.map((v) => {
                const str = String(v ?? '')
                return { member: str, size: new Blob([str]).size }
            })
        }
        if (typeof value.value === 'string' && value.value.length > 0) {
            return value.value.split('\n').map((v) => ({
                member: v,
                size: new Blob([v]).size,
            }))
        }
        return []
    }, [value.rawJson, value.value])

    const filteredRows = useMemo(() => {
        if (!searchText.trim()) return rows
        const query = searchText.toLowerCase().trim()
        return rows.filter((r) => r.member.toLowerCase().includes(query))
    }, [rows, searchText])

    const handleAddMembers = async () => {
        const members = addText
            .split('\n')
            .map((s) => s.trim())
            .filter(Boolean)
        if (members.length === 0) {
            message.warning(t('viewers.set.reqMember'))
            return
        }
        setAdding(true)
        try {
            await API.redisSetAdd(session.id, selected, members)
            message.success(t('viewers.set.membersAdded', { count: members.length }))
            setAddModalOpen(false)
            setAddText('')
            onReload()
        } catch (e: any) {
            message.error(t('viewers.set.addFail', { error: e?.message || e }))
        } finally {
            setAdding(false)
        }
    }

    const handleDeleteSingle = async (member: string) => {
        try {
            await API.redisSetRem(session.id, selected, [member])
            message.success(t('viewers.set.memberRemoved'))
            onReload()
        } catch (e: any) {
            message.error(t('viewers.set.removeFail', { error: e?.message || e }))
        }
    }

    const handleBatchDelete = async () => {
        const members = selectedRowKeys.map(String)
        if (members.length === 0) return
        try {
            await API.redisSetRem(session.id, selected, members)
            message.success(t('viewers.set.batchRemoved', { count: members.length }))
            setSelectedRowKeys([])
            onReload()
        } catch (e: any) {
            message.error(t('viewers.set.batchRemoveFail', { error: e?.message || e }))
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
            title: t('viewers.set.colMember'),
            dataIndex: 'member',
            key: 'member',
            ellipsis: true,
            render: (member: string) => {
                const isJson = /^\s*[[{]/.test(member)
                return (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span
                            className={s.cellValue}
                            title={t('viewers.set.clickInspect')}
                            onClick={() => setInspectDrawer({ open: true, member })}
                        >
                            {member}
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
            width: 90,
            align: 'right' as const,
            render: (_: any, row: SetRow) => (
                <Space size={2}>
                    <Tooltip title={t('viewers.set.inspectTooltip')}>
                        <Button
                            size="small"
                            type="text"
                            icon={<Eye size={12} />}
                            onClick={() => setInspectDrawer({ open: true, member: row.member })}
                        />
                    </Tooltip>
                    <Popconfirm
                        title={t('viewers.set.removeConfirm')}
                        onConfirm={() => handleDeleteSingle(row.member)}
                        okText={t('viewers.common.delete')}
                        cancelText={t('viewers.common.cancel')}
                        okButtonProps={{ danger: true }}
                    >
                        <Tooltip title={t('viewers.set.removeTooltip')}>
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
                        placeholder={t('viewers.set.searchPlaceholder')}
                        value={searchText}
                        onChange={(e) => setSearchText(e.target.value)}
                        allowClear
                        className={s.searchInput}
                    />
                    <span className={s.countBadge}>
                        {t('viewers.set.totalMembers', { count: rows.length })}
                        {searchText && t('viewers.set.filteredMembers', { count: filteredRows.length })}
                    </span>
                    {selectedRowKeys.length > 0 && (
                        <Popconfirm
                            title={t('viewers.set.batchRemoveConfirm', { count: selectedRowKeys.length })}
                            onConfirm={handleBatchDelete}
                            okText={t('viewers.common.batchRemove')}
                            cancelText={t('viewers.common.cancel')}
                            okButtonProps={{ danger: true }}
                        >
                            <Button size="small" danger icon={<Trash2 size={12} />}>
                                {t('viewers.set.batchRemoveBtn', { count: selectedRowKeys.length })}
                            </Button>
                        </Popconfirm>
                    )}
                </div>

                <div className={s.toolbarRight}>
                    <Button size="small" type="primary" icon={<Plus size={12} />} onClick={() => setAddModalOpen(true)}>
                        {t('viewers.set.addMemberBtn')}
                    </Button>
                </div>
            </div>

            <div className={s.tableArea}>
                <Table
                    size="small"
                    rowKey="member"
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
                                <span>{t('viewers.set.emptySet')}</span>
                                <Button size="small" type="primary" icon={<Plus size={12} />} onClick={() => setAddModalOpen(true)}>
                                    {t('viewers.set.addFirstMember')}
                                </Button>
                            </div>
                        ),
                    }}
                />
            </div>

            {/* Add Member Modal */}
            <Modal
                title={t('viewers.set.addModalTitle')}
                open={addModalOpen}
                onOk={handleAddMembers}
                confirmLoading={adding}
                onCancel={() => setAddModalOpen(false)}
                okText={t('viewers.common.add')}
                cancelText={t('viewers.common.cancel')}
                width={540}
            >
                <div style={{ marginTop: 16 }}>
                    <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 6 }}>
                        {t('viewers.set.membersLabel')}
                    </div>
                    <Input.TextArea
                        rows={6}
                        value={addText}
                        onChange={(e) => setAddText(e.target.value)}
                        placeholder={t('viewers.set.membersPlaceholder')}
                    />
                </div>
            </Modal>

            {/* Inspect Drawer */}
            <Drawer
                title={t('viewers.set.inspectTitle')}
                open={inspectDrawer.open}
                onClose={() => setInspectDrawer({ open: false, member: '' })}
                width={600}
                extra={
                    <Button size="small" icon={<Copy size={12} />} onClick={async () => { if (await copyText(inspectDrawer.member)) message.success(t('viewers.common.copiedMember')) }}>
                        {t('viewers.set.copyContent')}
                    </Button>
                }
            >
                <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                        {t('viewers.common.lengthAndSize', { length: inspectDrawer.member.length, size: formatBytes(new Blob([inspectDrawer.member]).size) })}
                    </div>
                    <div style={{ flex: 1, minHeight: 0 }}>
                        <CodeEditor
                            value={inspectDrawer.member}
                            onChange={() => {}}
                            lang={/^\s*[[{]/.test(inspectDrawer.member) ? 'json' : 'plain'}
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
