import React, {useCallback, useEffect, useMemo, useState} from 'react'
import { Input, Button, Switch, Table, Modal, Alert, Tag, Space, Tooltip } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { Plus, Search, RotateCw, Play, Edit, Trash2 } from 'lucide-react'
import {ConfirmModal, ConfirmState} from '@/components/Modal'
import CronModal, {explainCron} from '@/pages/ssh/cron/CronModal'
import {API} from '@/api'
import {SSHCronItem} from '@/types'
import {errorMessage} from '@/utils'
import c from '@/pages/ssh/cron/CronPanel.module.less'

interface Props {
    sessionId: string
    active: boolean
    onNotify?: (message: string, kind?: 'info' | 'error') => void
}

export default function CronPanel({sessionId, active, onNotify}: Props) {
    const [items, setItems] = useState<SSHCronItem[]>([])
    const [busy, setBusy] = useState(false)
    const [loaded, setLoaded] = useState(false)
    const [error, setError] = useState('')
    const [keyword, setKeyword] = useState('')
    const [lastUpdate, setLastUpdate] = useState<string>('')

    // Modal 开关
    const [modalOpen, setModalOpen] = useState(false)
    const [editingItem, setEditingItem] = useState<SSHCronItem | null>(null)

    // 删除 Confirmation Modal
    const [confirm, setConfirm] = useState<ConfirmState>({
        open: false,
        title: '',
        message: '',
        danger: true,
        onConfirm: () => {},
    })

    // 试运行 Modal
    const [runOutput, setRunOutput] = useState<string>('')
    const [runCommand, setRunCommand] = useState<string>('')
    const [runBusy, setRunBusy] = useState(false)

    const fetchCrons = useCallback(async () => {
        setBusy(true)
        setError('')
        try {
            const list = await API.sshCronList(sessionId)
            setItems(list || [])
            setLastUpdate(new Date().toLocaleTimeString())
            setLoaded(true)
        } catch (e) {
            const msg = errorMessage(e)
            setError(msg)
            if (onNotify) onNotify(`读取 Crontab 任务失败: ${msg}`, 'error')
        } finally {
            setBusy(false)
        }
    }, [sessionId, onNotify])

    useEffect(() => {
        if (active && !loaded && !busy) {
            void fetchCrons()
        }
    }, [active, loaded, busy, fetchCrons])

    const filteredItems = useMemo(() => {
        if (!keyword.trim()) return items
        const kw = keyword.trim().toLowerCase()
        return items.filter(
            (it) =>
                it.expression.toLowerCase().includes(kw) ||
                it.command.toLowerCase().includes(kw) ||
                it.comment.toLowerCase().includes(kw)
        )
    }, [items, keyword])

    const handleSaveList = async (nextList: SSHCronItem[]) => {
        setBusy(true)
        try {
            await API.sshSaveCronList(sessionId, nextList)
            setItems(nextList)
            if (onNotify) onNotify('Crontab 定时任务保存成功')
        } catch (e) {
            const msg = errorMessage(e)
            if (onNotify) onNotify(`保存失败: ${msg}`, 'error')
            await fetchCrons()
        } finally {
            setBusy(false)
        }
    }

    const handleToggleEnabled = (target: SSHCronItem) => {
        const nextList = items.map((it) =>
            it.id === target.id ? {...it, enabled: !it.enabled} : it
        )
        void handleSaveList(nextList)
    }

    const handleOpenCreate = () => {
        setEditingItem(null)
        setModalOpen(true)
    }

    const handleOpenEdit = (item: SSHCronItem) => {
        setEditingItem(item)
        setModalOpen(true)
    }

    const handleSaveItem = (itemData: Partial<SSHCronItem>) => {
        setModalOpen(false)
        if (editingItem) {
            // 编辑
            const nextList = items.map((it) =>
                it.id === editingItem.id ? ({...it, ...itemData} as SSHCronItem) : it
            )
            void handleSaveList(nextList)
        } else {
            // 新建
            const newItem: SSHCronItem = {
                id: `cron-${Date.now()}`,
                expression: itemData.expression || '*/5 * * * *',
                command: itemData.command || '',
                enabled: true,
                comment: itemData.comment || '',
            }
            void handleSaveList([...items, newItem])
        }
    }

    const handleDelete = (target: SSHCronItem) => {
        setConfirm({
            open: true,
            title: '删除定时任务',
            message: `确定要删除任务 "${target.expression} ${target.command}" 吗？`,
            danger: true,
            onConfirm: () => {
                setConfirm((prev) => ({...prev, open: false}))
                const nextList = items.filter((it) => it.id !== target.id)
                void handleSaveList(nextList)
            },
        })
    }

    const handleRunNow = async (target: SSHCronItem) => {
        setRunCommand(target.command)
        setRunBusy(true)
        setRunOutput('')
        try {
            const out = await API.sshRunCronCommand(sessionId, target.command)
            setRunOutput(out || '（无输出）')
        } catch (e) {
            setRunOutput(`试运行失败: ${errorMessage(e)}`)
        } finally {
            setRunBusy(false)
        }
    }

    const columns: ColumnsType<SSHCronItem> = [
        {
            title: '状态',
            dataIndex: 'enabled',
            key: 'enabled',
            width: 70,
            render: (enabled, record) => (
                <Tooltip title={enabled ? '点击禁用 (加 # 注释)' : '点击启用'}>
                    <Switch size="small" checked={enabled} onChange={() => handleToggleEnabled(record)} />
                </Tooltip>
            ),
        },
        {
            title: '运行周期',
            dataIndex: 'expression',
            key: 'expression',
            width: 180,
            render: (expr) => (
                <div>
                    <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#2b90ee' }}>{expr}</span>
                    <div style={{ fontSize: 11.5, color: 'var(--text-dim)' }}>{explainCron(expr)}</div>
                </div>
            ),
        },
        {
            title: '执行命令 / 备注',
            key: 'command',
            render: (_, item) => (
                <div>
                    <div className={c.cmdText}>{item.command}</div>
                    {item.comment && (
                        <div className={c.commentText}>
                            # {item.comment}
                        </div>
                    )}
                </div>
            ),
        },
        {
            title: '操作',
            key: 'actions',
            width: 110,
            render: (_, item) => (
                <Space size={4}>
                    <Tooltip title="手动运行一次该命令">
                        <Button
                            size="small"
                            type="text"
                            icon={<Play size={13} />}
                            onClick={() => handleRunNow(item)}
                        />
                    </Tooltip>
                    <Tooltip title="编辑任务">
                        <Button
                            size="small"
                            type="text"
                            icon={<Edit size={13} />}
                            onClick={() => handleOpenEdit(item)}
                        />
                    </Tooltip>
                    <Tooltip title="删除任务">
                        <Button
                            size="small"
                            type="text"
                            danger
                            icon={<Trash2 size={13} />}
                            onClick={() => handleDelete(item)}
                        />
                    </Tooltip>
                </Space>
            ),
        },
    ]

    if (!active) return null

    return (
        <div className={c.cronPanel}>
            <div className={c.toolbar}>
                <Button
                    size="small"
                    type="primary"
                    icon={<Plus size={13} />}
                    onClick={handleOpenCreate}
                >
                    新建任务
                </Button>

                <Input
                    size="small"
                    className={c.searchInput}
                    value={keyword}
                    placeholder="搜索 命令 / 说明 / 表达式..."
                    prefix={<Search size={13} />}
                    allowClear
                    onChange={(e) => setKeyword(e.target.value)}
                />

                <div className={c.toolbarActions}>
                    {lastUpdate && <span className={c.lastUpdate}>更新于 {lastUpdate}</span>}
                    <Button
                        size="small"
                        icon={<RotateCw size={12} />}
                        loading={busy}
                        onClick={fetchCrons}
                    >
                        刷新
                    </Button>
                </div>
            </div>

            {error && (
                <Alert
                    type="error"
                    showIcon
                    message={error}
                    className={c.alertBox}
                    action={
                        <Button size="small" type="primary" danger onClick={fetchCrons}>
                            重试
                        </Button>
                    }
                />
            )}

            <div className={c.tableWrap}>
                <Table<SSHCronItem>
                    rowKey="id"
                    size="small"
                    columns={columns}
                    dataSource={filteredItems}
                    loading={busy}
                    pagination={{ pageSize: 50, showSizeChanger: true, pageSizeOptions: ['20', '50', '100', '200'] }}
                    scroll={{ y: 'calc(100vh - 280px)' }}
                />
            </div>

            {/* 新建/编辑 Modal */}
            <CronModal
                open={modalOpen}
                item={editingItem}
                onSave={handleSaveItem}
                onClose={() => setModalOpen(false)}
            />

            {/* 试运行输出 Modal */}
            <Modal
                open={!!runCommand}
                title={`试运行输出: ${runCommand}`}
                onCancel={() => setRunCommand('')}
                width={720}
                footer={<Button onClick={() => setRunCommand('')}>关闭</Button>}
            >
                <div className={c.outputContainer}>
                    <pre style={{ margin: 0, fontFamily: 'Consolas, monospace', fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                        {runBusy ? '正在远端命令行后台试运行该命令…' : runOutput}
                    </pre>
                </div>
            </Modal>

            {/* 删除确认 Modal */}
            <ConfirmModal
                state={confirm}
                onCancel={() => setConfirm((prev) => ({ ...prev, open: false }))}
            />
        </div>
    )
}
