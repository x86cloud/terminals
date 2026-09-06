import React, { useState, useMemo } from 'react'
import { Table, Input, Button, Space, Tooltip, Modal, Drawer, Tag, Popconfirm, message } from 'antd'
import { Search, Plus, Trash2, Edit3, Eye, Copy, ArrowLeft, ArrowRight, CornerDownLeft, CornerDownRight } from 'lucide-react'
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

interface ListRow {
    index: number
    val: string
    size: number
}

export default function ListViewer({ session, selected, value, onReload, flash }: Props) {
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
            message.warning('推入内容不能为空')
            return
        }
        setPushing(true)
        try {
            await API.redisListPush(session.id, selected, pushContent, pushDirection === 'left')
            message.success(pushDirection === 'left' ? '已成功 LPUSH 到列表头部' : '已成功 RPUSH 到列表尾部')
            setPushModalOpen(false)
            setPushContent('')
            onReload()
        } catch (e: any) {
            message.error('推入失败: ' + (e?.message || e))
        } finally {
            setPushing(false)
        }
    }

    const handlePop = async (left: boolean) => {
        try {
            const popped = await API.redisListPop(session.id, selected, left)
            Modal.info({
                title: left ? 'LPOP (头部弹出) 结果' : 'RPOP (尾部弹出) 结果',
                content: (
                    <div style={{ marginTop: 12 }}>
                        <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 6 }}>已从列表中移除该元素：</div>
                        <CodeEditor value={popped || '(nil)'} onChange={() => {}} lang="plain" readOnly height="120px" />
                    </div>
                ),
                okText: '好的',
            })
            onReload()
        } catch (e: any) {
            message.error('弹出失败: ' + (e?.message || e))
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
            message.success(`已更新第 [${editIndex}] 项元素`)
            setEditModalOpen(false)
            onReload()
        } catch (e: any) {
            message.error('修改失败: ' + (e?.message || e))
        } finally {
            setEditing(false)
        }
    }

    const handleDeleteItem = async (row: ListRow) => {
        try {
            // LREM key 1 value
            const escaped = row.val.replace(/"/g, '\\"')
            await API.redisRaw(session.id, `LREM "${selected}" 1 "${escaped}"`)
            message.success(`已删除元素`)
            onReload()
        } catch (e: any) {
            message.error('删除失败: ' + (e?.message || e))
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
            title: '索引 (Index)',
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
            title: '元素值 (Value)',
            dataIndex: 'val',
            key: 'val',
            ellipsis: true,
            render: (val: string, row: ListRow) => {
                const isJson = /^\s*[[{]/.test(val)
                return (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span
                            className={s.cellValue}
                            title="点击查看 / 编辑完整值"
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
            render: (_: any, row: ListRow) => (
                <Space size={2}>
                    <Tooltip title="查看完整详情">
                        <Button
                            size="small"
                            type="text"
                            icon={<Eye size={12} />}
                            onClick={() => setInspectDrawer({ open: true, index: row.index, val: row.val })}
                        />
                    </Tooltip>
                    <Tooltip title="编辑元素 (LSET)">
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
                        title={`确定从列表中移除该元素吗？(LREM 1)`}
                        onConfirm={() => handleDeleteItem(row)}
                        okText="删除"
                        cancelText="取消"
                        okButtonProps={{ danger: true }}
                    >
                        <Tooltip title="删除该元素 (LREM)">
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
                        placeholder="搜索元素内容..."
                        value={searchText}
                        onChange={(e) => setSearchText(e.target.value)}
                        allowClear
                        className={s.searchInput}
                    />
                    <span className={s.countBadge}>
                        共 {rows.length} 个元素
                        {searchText && ` (匹配 ${filteredRows.length} 个)`}
                    </span>
                </div>

                <div className={s.toolbarRight}>
                    <Tooltip title="从左侧 (头部) 弹出并移除一个元素">
                        <Button size="small" disabled={rows.length === 0} onClick={() => handlePop(true)}>
                            LPOP (头部弹出)
                        </Button>
                    </Tooltip>
                    <Tooltip title="从右侧 (尾部) 弹出并移除一个元素">
                        <Button size="small" disabled={rows.length === 0} onClick={() => handlePop(false)}>
                            RPOP (尾部弹出)
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
                        LPUSH (头部插入)
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
                        RPUSH (尾部推入)
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
                        showTotal: (total) => `共 ${total} 条`,
                        size: 'small',
                    }}
                    locale={{
                        emptyText: (
                            <div className={s.emptyTip}>
                                <span>当前 List 列表为空</span>
                                <Button
                                    size="small"
                                    type="primary"
                                    icon={<Plus size={12} />}
                                    onClick={() => {
                                        setPushDirection('right')
                                        setPushModalOpen(true)
                                    }}
                                >
                                    推入第一个元素 (RPUSH)
                                </Button>
                            </div>
                        ),
                    }}
                />
            </div>

            {/* Push Modal */}
            <Modal
                title={pushDirection === 'left' ? 'LPUSH 头部推入新元素' : 'RPUSH 尾部推入新元素'}
                open={pushModalOpen}
                onOk={handlePush}
                confirmLoading={pushing}
                onCancel={() => setPushModalOpen(false)}
                okText="推入入队"
                cancelText="取消"
                width={540}
            >
                <div style={{ marginTop: 16 }}>
                    <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 6 }}>元素内容 (Value)</div>
                    <CodeEditor
                        value={pushContent}
                        onChange={setPushContent}
                        lang={/^\s*[[{]/.test(pushContent) ? 'json' : 'plain'}
                        height="180px"
                        bordered
                        placeholder="输入推入的元素内容，支持普通文本或 JSON..."
                    />
                </div>
            </Modal>

            {/* Edit Item Modal */}
            <Modal
                title={`修改第 [${editIndex}] 项元素值 (LSET)`}
                open={editModalOpen}
                onOk={handleSaveEdit}
                confirmLoading={editing}
                onCancel={() => setEditModalOpen(false)}
                okText="更新"
                cancelText="取消"
                width={540}
            >
                <div style={{ marginTop: 16 }}>
                    <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 6 }}>新元素内容</div>
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
                title={`查看 List [${inspectDrawer.index}] 元素`}
                open={inspectDrawer.open}
                onClose={() => setInspectDrawer({ open: false, index: 0, val: '' })}
                width={600}
                extra={
                    <Space size={6}>
                        <Button size="small" icon={<Copy size={12} />} onClick={() => copyText(inspectDrawer.val)}>
                            复制
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
