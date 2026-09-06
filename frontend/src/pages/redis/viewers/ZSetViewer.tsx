import React, { useState, useMemo } from 'react'
import { Table, Input, InputNumber, Button, Space, Tooltip, Modal, Drawer, Tag, Popconfirm, message } from 'antd'
import { Search, Plus, Trash2, Edit3, Eye, Copy, ArrowUpDown } from 'lucide-react'
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

interface ZSetRow {
    member: string
    score: number
    size: number
}

export default function ZSetViewer({ session, selected, value, onReload, flash }: Props) {
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
            message.warning('成员内容不能为空')
            return
        }
        setSubmitting(true)
        try {
            await API.redisZSetAdd(session.id, selected, modalMember.trim(), modalScore ?? 0)
            message.success(isAdding ? `已新增有序成员 [${modalMember}]` : `已更新分值 [${modalScore}]`)
            setModalOpen(false)
            onReload()
        } catch (e: any) {
            message.error('操作失败: ' + (e?.message || e))
        } finally {
            setSubmitting(false)
        }
    }

    const handleDeleteSingle = async (member: string) => {
        try {
            await API.redisZSetRem(session.id, selected, [member])
            message.success(`已从有序集中移除成员`)
            onReload()
        } catch (e: any) {
            message.error('移除失败: ' + (e?.message || e))
        }
    }

    const handleBatchDelete = async () => {
        const members = selectedRowKeys.map(String)
        if (members.length === 0) return
        try {
            await API.redisZSetRem(session.id, selected, members)
            message.success(`已成功批量移除 ${members.length} 个成员`)
            setSelectedRowKeys([])
            onReload()
        } catch (e: any) {
            message.error('批量移除失败: ' + (e?.message || e))
        }
    }

    const copyText = async (text: string) => {
        try {
            await navigator.clipboard.writeText(text)
            message.success('已复制到剪贴板')
        } catch {
            message.error('复制失败')
        }
    }

    const columns = [
        {
            title: '排名 (Rank)',
            width: 90,
            align: 'center' as const,
            render: (_: any, __: any, index: number) => (
                <Tag color="cyan" style={{ fontFamily: 'monospace', fontWeight: 600 }}>
                    #{index + 1}
                </Tag>
            ),
        },
        {
            title: '分值 (Score)',
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
            title: '成员值 (Member)',
            dataIndex: 'member',
            key: 'member',
            ellipsis: true,
            render: (member: string, row: ZSetRow) => {
                const isJson = /^\s*[[{]/.test(member)
                return (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span
                            className={s.cellValue}
                            title="点击查看详情"
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
            render: (_: any, row: ZSetRow) => (
                <Space size={2}>
                    <Tooltip title="查看完整详情">
                        <Button
                            size="small"
                            type="text"
                            icon={<Eye size={12} />}
                            onClick={() => setInspectDrawer({ open: true, member: row.member, score: row.score })}
                        />
                    </Tooltip>
                    <Tooltip title="修改分值 (Score)">
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
                        title={`确定从有序集中移除该成员吗？(ZREM)`}
                        onConfirm={() => handleDeleteSingle(row.member)}
                        okText="删除"
                        cancelText="取消"
                        okButtonProps={{ danger: true }}
                    >
                        <Tooltip title="删除成员 (ZREM)">
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
                        placeholder="搜索成员内容..."
                        value={searchText}
                        onChange={(e) => setSearchText(e.target.value)}
                        allowClear
                        className={s.searchInput}
                    />
                    <span className={s.countBadge}>
                        共 {rows.length} 个成员
                        {searchText && ` (匹配 ${filteredRows.length} 个)`}
                    </span>
                    {selectedRowKeys.length > 0 && (
                        <Popconfirm
                            title={`确定批量移除选中的 ${selectedRowKeys.length} 个成员吗？`}
                            onConfirm={handleBatchDelete}
                            okText="批量移除"
                            cancelText="取消"
                            okButtonProps={{ danger: true }}
                        >
                            <Button size="small" danger icon={<Trash2 size={12} />}>
                                批量移除 ({selectedRowKeys.length})
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
                        添加有序成员 (ZADD)
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
                                <span>当前 ZSet 有序集为空</span>
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
                                    添加第一个成员 (ZADD)
                                </Button>
                            </div>
                        ),
                    }}
                />
            </div>

            {/* Add / Edit Modal */}
            <Modal
                title={isAdding ? '添加有序成员 (ZADD)' : `修改分值 (Score) - ${modalMember}`}
                open={modalOpen}
                onOk={handleSave}
                confirmLoading={submitting}
                onCancel={() => setModalOpen(false)}
                okText="保存写入"
                cancelText="取消"
                width={520}
            >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 16 }}>
                    <div>
                        <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 4 }}>成员值 (Member)</div>
                        <Input
                            placeholder="输入唯一成员值..."
                            value={modalMember}
                            disabled={!isAdding}
                            onChange={(e) => setModalMember(e.target.value)}
                        />
                    </div>
                    <div>
                        <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 4 }}>分值 (Score)</div>
                        <InputNumber
                            style={{ width: '100%' }}
                            step={1}
                            placeholder="分值数值，支持负数与小数..."
                            value={modalScore}
                            onChange={(v) => setModalScore(v ?? 0)}
                        />
                    </div>
                </div>
            </Modal>

            {/* Inspect Drawer */}
            <Drawer
                title={`查看 ZSet 成员详情 (分值: ${inspectDrawer.score})`}
                open={inspectDrawer.open}
                onClose={() => setInspectDrawer({ open: false, member: '', score: 0 })}
                width={600}
                extra={
                    <Space size={6}>
                        <Button size="small" icon={<Copy size={12} />} onClick={() => copyText(inspectDrawer.member)}>
                            复制
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
                            修改分值
                        </Button>
                    </Space>
                }
            >
                <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                        长度: {inspectDrawer.member.length} 字符 | 大小: {formatBytes(new Blob([inspectDrawer.member]).size)}
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
