import { useCallback, useEffect, useMemo, useState } from 'react'
import { Input, Button, Switch, Table, Modal, Alert, Space, Tooltip, App } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { Plus, Search, RotateCw, Play, Edit, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { ConfirmModal, ConfirmState } from '@/components/Modal'
import CronModal, { explainCron } from '@/pages/ssh/cron/CronModal'
import { API } from '@/api'
import { SSHCronItem } from '@/types'
import { errorMessage } from '@/utils'
import c from '@/pages/ssh/cron/CronPanel.module.less'

interface Props {
    sessionId: string
    active: boolean
}

export default function CronPanel({ sessionId, active }: Props) {
    const { t } = useTranslation(['ssh', 'common'])
    const { message } = App.useApp()
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

    useEffect(() => {
        setLoaded(false)
        setItems([])
        setError('')
    }, [sessionId])

    const fetchCrons = useCallback(async () => {
        setBusy(true)
        setError('')
        try {
            const list = await API.sshCronList(sessionId)
            setItems(list || [])
            setLastUpdate(new Date().toLocaleTimeString())
        } catch (e) {
            const msg = errorMessage(e)
            setError(msg)
            message.error(msg)
        } finally {
            setBusy(false)
            setLoaded(true)
        }
    }, [sessionId])

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
            message.success(t('ssh:cron.saveSuccess'))
        } catch (e) {
            const msg = errorMessage(e)
            message.error(msg)
            await fetchCrons()
        } finally {
            setBusy(false)
        }
    }

    const handleToggleEnabled = (target: SSHCronItem) => {
        const nextList = items.map((it) =>
            it.id === target.id ? { ...it, enabled: !it.enabled } : it
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
                it.id === editingItem.id ? ({ ...it, ...itemData } as SSHCronItem) : it
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
            title: t('ssh:cron.delete'),
            message: `${t('ssh:cron.deleteConfirm')} "${target.expression} ${target.command}"`,
            danger: true,
            onConfirm: () => {
                setConfirm((prev) => ({ ...prev, open: false }))
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
            setRunOutput(out || '')
        } catch (e) {
            setRunOutput(errorMessage(e))
        } finally {
            setRunBusy(false)
        }
    }

    const columns: ColumnsType<SSHCronItem> = [
        {
            title: t('common:status'),
            dataIndex: 'enabled',
            key: 'enabled',
            width: 70,
            render: (enabled, record) => (
                <Tooltip title={enabled ? 'Disable' : 'Enable'}>
                    <Switch size="small" checked={enabled} onChange={() => handleToggleEnabled(record)} />
                </Tooltip>
            ),
        },
        {
            title: t('ssh:cron.schedule'),
            dataIndex: 'expression',
            key: 'expression',
            width: 180,
            render: (expr) => (
                <div style={{ whiteSpace: 'nowrap' }}>
                    <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#2b90ee' }}>{expr}</span>
                    <div style={{ fontSize: 11.5, color: 'var(--text-dim)' }}>{explainCron(expr)}</div>
                </div>
            ),
        },
        {
            title: t('ssh:cron.command'),
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
            title: t('common:actions'),
            key: 'actions',
            width: 110,
            render: (_, item) => (
                <Space size={4}>
                    <Tooltip title={t('ssh:cron.testRun')}>
                        <Button
                            size="small"
                            type="text"
                            icon={<Play size={13} />}
                            onClick={() => handleRunNow(item)}
                        />
                    </Tooltip>
                    <Tooltip title={t('ssh:cron.edit')}>
                        <Button
                            size="small"
                            type="text"
                            icon={<Edit size={13} />}
                            onClick={() => handleOpenEdit(item)}
                        />
                    </Tooltip>
                    <Tooltip title={t('ssh:cron.delete')}>
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
                    {t('ssh:cron.add')}
                </Button>

                <Input
                    size="small"
                    className={c.searchInput}
                    value={keyword}
                    placeholder="Search command / expression..."
                    prefix={<Search size={13} />}
                    allowClear
                    onChange={(e) => setKeyword(e.target.value)}
                />

                <div className={c.toolbarActions}>
                    {lastUpdate && <span className={c.lastUpdate}>{t('ssh:cron.updatedAt', { time: lastUpdate })}</span>}
                    <Button
                        size="small"
                        icon={<RotateCw size={12} />}
                        loading={busy}
                        onClick={fetchCrons}
                    >
                        {t('common:refresh')}
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
                            {t('common:retry')}
                        </Button>
                    }
                />
            )}

            <div className={c.tableWrap}>
                <div className={c.tableInner}>
                    <Table<SSHCronItem>
                        rowKey="id"
                        size="small"
                        columns={columns}
                        dataSource={filteredItems}
                        loading={busy}
                        pagination={{ pageSize: 50, showSizeChanger: true, pageSizeOptions: ['20', '50', '100', '200'] }}
                    />
                </div>
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
                title={`${t('ssh:cron.testRun')}: ${runCommand}`}
                onCancel={() => setRunCommand('')}
                width={720}
                footer={<Button onClick={() => setRunCommand('')}>{t('common:close')}</Button>}
            >
                <div className={c.outputContainer}>
                    <pre style={{ margin: 0, fontFamily: 'Consolas, monospace', fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                        {runBusy ? t('ssh:cron.running') : runOutput}
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
