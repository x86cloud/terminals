import React, { useState, useMemo } from 'react'
import { Table, Input, Button, Space, Tooltip, Modal, Drawer, Tag, Popconfirm, message } from 'antd'
import { Search, Plus, Trash2, Eye, Copy } from 'lucide-react'
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

interface SetRow {
    member: string
    size: number
}

export default function SetViewer({ session, selected, value, onReload, flash }: Props) {
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
            message.warning('请输入至少一个成员内容')
            return
        }
        setAdding(true)
        try {
            await API.redisSetAdd(session.id, selected, members)
            message.success(`已成功向集合添加 ${members.length} 个成员`)
            setAddModalOpen(false)
            setAddText('')
            onReload()
        } catch (e: any) {
            message.error('添加失败: ' + (e?.message || e))
        } finally {
            setAdding(false)
        }
    }

    const handleDeleteSingle = async (member: string) => {
        try {
            await API.redisSetRem(session.id, selected, [member])
            message.success(`已从集合中移除成员`)
            onReload()
        } catch (e: any) {
            message.error('移除失败: ' + (e?.message || e))
        }
    }

    const handleBatchDelete = async () => {
        const members = selectedRowKeys.map(String)
        if (members.length === 0) return
        try {
            await API.redisSetRem(session.id, selected, members)
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
            title: '#',
            width: 50,
            align: 'center' as const,
            render: (_: any, __: any, index: number) => (
                <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>{index + 1}</span>
            ),
        },
        {
            title: '成员值 (Member)',
            dataIndex: 'member',
            key: 'member',
            ellipsis: true,
            render: (member: string) => {
                const isJson = /^\s*[[{]/.test(member)
                return (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span
                            className={s.cellValue}
                            title="点击查看详情"
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
            width: 90,
            align: 'right' as const,
            render: (_: any, row: SetRow) => (
                <Space size={2}>
                    <Tooltip title="查看完整详情">
                        <Button
                            size="small"
                            type="text"
                            icon={<Eye size={12} />}
                            onClick={() => setInspectDrawer({ open: true, member: row.member })}
                        />
                    </Tooltip>
                    <Popconfirm
                        title={`确定从集合中移除该成员吗？(SREM)`}
                        onConfirm={() => handleDeleteSingle(row.member)}
                        okText="删除"
                        cancelText="取消"
                        okButtonProps={{ danger: true }}
                    >
                        <Tooltip title="删除成员 (SREM)">
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
                        共 {rows.length} 个唯一成员
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
                    <Button size="small" type="primary" icon={<Plus size={12} />} onClick={() => setAddModalOpen(true)}>
                        添加成员 (SADD)
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
                                <span>当前 Set 集合为空</span>
                                <Button size="small" type="primary" icon={<Plus size={12} />} onClick={() => setAddModalOpen(true)}>
                                    添加成员
                                </Button>
                            </div>
                        ),
                    }}
                />
            </div>

            {/* Add Member Modal */}
            <Modal
                title="向集合添加成员 (SADD)"
                open={addModalOpen}
                onOk={handleAddMembers}
                confirmLoading={adding}
                onCancel={() => setAddModalOpen(false)}
                okText="添加"
                cancelText="取消"
                width={540}
            >
                <div style={{ marginTop: 16 }}>
                    <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 6 }}>
                        成员内容（支持换行一次性添加多个成员）
                    </div>
                    <Input.TextArea
                        rows={6}
                        value={addText}
                        onChange={(e) => setAddText(e.target.value)}
                        placeholder="每行输入一个成员值，如：&#10;user_1001&#10;user_1002&#10;user_1003"
                    />
                </div>
            </Modal>

            {/* Inspect Drawer */}
            <Drawer
                title="查看 Set 成员详情"
                open={inspectDrawer.open}
                onClose={() => setInspectDrawer({ open: false, member: '' })}
                width={600}
                extra={
                    <Button size="small" icon={<Copy size={12} />} onClick={() => copyText(inspectDrawer.member)}>
                        复制内容
                    </Button>
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
