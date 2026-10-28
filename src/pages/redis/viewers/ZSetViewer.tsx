import React, { useState, useMemo } from 'react'
import { Table, Input, InputNumber, Button, Space, Tooltip, Modal, Drawer, Tag, Popconfirm, App } from 'antd'
import { Search, Plus, Trash2, Edit3, Eye, Copy } from 'lucide-react'
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

interface ZSetRow {
    member: string
    score: number
    size: number
}

export default function ZSetViewer({ session, selected, value, onReload, flash }: Props) {
    const { t } = useTranslation('redis')
    const { message } = App.useApp()
    const [searchText, setSearchText] = useState('')
    const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([])

    // Add / Edit Modal
    const [modalOpen, setModalOpen] = useState(false)
    const [isAdding, setIsAdding] = useState(false)
    const [modalMember, setModalMember] = useState('')
    const [modalScore, setModalScore] = useState<number>(0)
    const [submitting, setSubmitting] = useState(false)

    // Inspect Drawer
    const [inspectDrawer, setInspectDrawer] = useState<{ open: boolean; member: string; score: number }>({
        open: false,
        member: '',
        score: 0,
    })

    const rows = useMemo<ZSetRow[]>(() => {
        if (Array.isArray(value.rawJson)) {
            return value.rawJson.map((item) => {
                const member = String(item.member ?? item.Member ?? '')
                const score = Number(item.score ?? item.Score ?? 0)
                return {
                    member,
                    score,
                    size: new Blob([member]).size,
                }
            })
        }
        if (typeof value.value === 'string' && value.value.length > 0) {
            const lines = value.value.split('\n')
            const list: ZSetRow[] = []
            for (let i = 0; i < lines.length; i += 2) {
                if (i < lines.length) {
                    const m = lines[i]
                    const sc = Number(i + 1 < lines.length ? lines[i + 1] : 0)
                    if (m !== undefined) {
                        list.push({
                            member: m,
                            score: isNaN(sc) ? 0 : sc,
                            size: new Blob([m]).size,
                        })
                    }
                }
            }
            return list
        }
        return []
    }, [value.rawJson, value.value])

    const filteredRows = useMemo(() => {
        if (!searchText.trim()) return rows
        const query = searchText.toLowerCase().trim()
        return rows.filter((r) => r.member.toLowerCase().includes(query))
    }, [rows, searchText])

    const handleSave = async () => {
        if (!modalMember.trim()) {
            message.warning(t('viewers.zset.reqMember'))
            return
        }
        setSubmitting(true)
        try {
            await API.redisZSetAdd(session.id, selected, modalMember.trim(), modalScore ?? 0)
            message.success(isAdding ? t('viewers.zset.memberAdded', { member: modalMember }) : t('viewers.zset.scoreUpdated', { score: modalScore }))
            setModalOpen(false)
            onReload()
        } catch (e: any) {
            message.error(t('viewers.zset.opFail', { error: e?.message || e }))
        } finally {
            setSubmitting(false)
        }
    }

    const handleDeleteSingle = async (member: string) => {
        try {
            await API.redisZSetRem(session.id, selected, [member])
            message.success(t('viewers.zset.memberRemoved'))
            onReload()
        } catch (e: any) {
            message.error(t('viewers.zset.removeFail', { error: e?.message || e }))
        }
    }

    const handleBatchDelete = async () => {
        const members = selectedRowKeys.map(String)
        if (members.length === 0) return
        try {
            await API.redisZSetRem(session.id, selected, members)
            message.success(t('viewers.zset.batchRemoved', { count: members.length }))
            setSelectedRowKeys([])
            onReload()
        } catch (e: any) {
            message.error(t('viewers.zset.batchRemoveFail', { error: e?.message || e }))
        }
    }

    const columns = [
        {
            title: t('viewers.zset.colRank'),
            width: 90,
            align: 'center' as const,
            render: (_: any, __: any, index: number) => (
                <Tag color="cyan" style={{ fontFamily: 'monospace', fontWeight: 600 }}>
                    #{index + 1}
                </Tag>
            ),
        },
        {
            title: t('viewers.zset.colScore'),
            dataIndex: 'score',
            key: 'score',
            width: 140,
            sorter: (a: ZSetRow, b: ZSetRow) => a.score - b.score,
            defaultSortOrder: 'ascend' as const,
            render: (score: number) => (
                <span style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--accent)' }}>
                    {score}
                </span>
            ),
        },
        {
            title: t('viewers.zset.colMember'),
            dataIndex: 'member',
            key: 'member',
            ellipsis: true,
            render: (member: string, row: ZSetRow) => {
                const isJson = /^\s*[[{]/.test(member)
                return (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span
                            className={s.cellValue}
                            title={t('viewers.zset.clickInspect')}
                            onClick={() => setInspectDrawer({ open: true, member, score: row.score })}
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
            width: 120,
            align: 'right' as const,
            render: (_: any, row: ZSetRow) => (
                <Space size={2}>
                    <Tooltip title={t('viewers.zset.inspectTooltip')}>
                        <Button
                            size="small"
                            type="text"
                            icon={<Eye size={12} />}
                            onClick={() => setInspectDrawer({ open: true, member: row.member, score: row.score })}
                        />
                    </Tooltip>
                    <Tooltip title={t('viewers.zset.editScoreTooltip')}>
                        <Button
                            size="small"
                            type="text"
                            icon={<Edit3 size={12} />}
                            onClick={() => {
                                setIsAdding(false)
                                setModalMember(row.member)
                                setModalScore(row.score)
                                setModalOpen(true)
                            }}
                        />
                    </Tooltip>
                    <Popconfirm
                        title={t('viewers.zset.removeConfirm')}
                        onConfirm={() => handleDeleteSingle(row.member)}
                        okText={t('viewers.common.delete')}
                        cancelText={t('viewers.common.cancel')}
                        okButtonProps={{ danger: true }}
                    >
                        <Tooltip title={t('viewers.zset.removeTooltip')}>
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
                        placeholder={t('viewers.zset.searchPlaceholder')}
                        value={searchText}
                        onChange={(e) => setSearchText(e.target.value)}
                        allowClear
                        className={s.searchInput}
                    />
                    <span className={s.countBadge}>
                        {t('viewers.zset.totalMembers', { count: rows.length })}
                        {searchText && t('viewers.zset.filteredMembers', { count: filteredRows.length })}
                    </span>
                    {selectedRowKeys.length > 0 && (
                        <Popconfirm
                            title={t('viewers.zset.batchRemoveConfirm', { count: selectedRowKeys.length })}
                            onConfirm={handleBatchDelete}
                            okText={t('viewers.common.batchRemove')}
                            cancelText={t('viewers.common.cancel')}
                            okButtonProps={{ danger: true }}
                        >
                            <Button size="small" danger icon={<Trash2 size={12} />}>
                                {t('viewers.zset.batchRemoveBtn', { count: selectedRowKeys.length })}
                            </Button>
                        </Popconfirm>
                    )}
                </div>

                <div className={s.toolbarRight}>
                    <Button
                        size="small"
                        type="primary"
                        icon={<Plus size={12} />}
                        onClick={() => {
                            setIsAdding(true)
                            setModalMember('')
                            setModalScore(0)
                            setModalOpen(true)
                        }}
                    >
                        {t('viewers.zset.addMemberBtn')}
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
                                <span>{t('viewers.zset.emptyZSet')}</span>
                                <Button
                                    size="small"
                                    type="primary"
                                    icon={<Plus size={12} />}
                                    onClick={() => {
                                        setIsAdding(true)
                                        setModalMember('')
                                        setModalScore(0)
                                        setModalOpen(true)
                                    }}
                                >
                                    {t('viewers.zset.addFirstMember')}
                                </Button>
                            </div>
                        ),
                    }}
                />
            </div>

            {/* Add / Edit Modal */}
            <Modal
                title={isAdding ? t('viewers.zset.addModalTitle') : t('viewers.zset.editScoreModalTitle', { member: modalMember })}
                open={modalOpen}
                onOk={handleSave}
                confirmLoading={submitting}
                onCancel={() => setModalOpen(false)}
                okText={t('viewers.common.saveWrite')}
                cancelText={t('viewers.common.cancel')}
                width={520}
            >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 16 }}>
                    <div>
                        <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 4 }}>{t('viewers.zset.memberLabel')}</div>
                        <Input
                            placeholder={t('viewers.zset.memberPlaceholder')}
                            value={modalMember}
                            disabled={!isAdding}
                            onChange={(e) => setModalMember(e.target.value)}
                        />
                    </div>
                    <div>
                        <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 4 }}>{t('viewers.zset.scoreLabel')}</div>
                        <InputNumber
                            style={{ width: '100%' }}
                            step={1}
                            placeholder={t('viewers.zset.scorePlaceholder')}
                            value={modalScore}
                            onChange={(v) => setModalScore(v ?? 0)}
                        />
                    </div>
                </div>
            </Modal>

            {/* Inspect Drawer */}
            <Drawer
                title={t('viewers.zset.inspectTitle', { score: inspectDrawer.score })}
                open={inspectDrawer.open}
                onClose={() => setInspectDrawer({ open: false, member: '', score: 0 })}
                width={600}
                extra={
                    <Space size={6}>
                        <Button size="small" icon={<Copy size={12} />} onClick={async () => { if (await copyText(inspectDrawer.member)) message.success(t('viewers.common.copiedMember')) }}>
                            {t('viewers.common.copy')}
                        </Button>
                        <Button
                            size="small"
                            type="primary"
                            icon={<Edit3 size={12} />}
                            onClick={() => {
                                setInspectDrawer({ open: false, member: '', score: 0 })
                                setIsAdding(false)
                                setModalMember(inspectDrawer.member)
                                setModalScore(inspectDrawer.score)
                                setModalOpen(true)
                            }}
                        >
                            {t('viewers.zset.modifyScore')}
                        </Button>
                    </Space>
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
