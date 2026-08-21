import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Input, Button, Table, Tag, Tooltip, Space, Alert } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { Search, RotateCw, Power } from 'lucide-react'
import { API } from '@/api'
import { SSHProcessInfo } from '@/types'
import { errorMessage } from '@/utils'
import { ConfirmModal, ConfirmState } from '@/components/Modal'
import p from '@/pages/ssh/process/ProcessPanel.module.less'

interface Props {
    sessionId: string
    active: boolean
    onNotify?: (message: string, kind?: 'info' | 'error') => void
}

const emptyConfirm: ConfirmState = { open: false, title: '', message: '' }

function fmtBytes(bytes: number): string {
    if (!bytes || bytes <= 0) return '0 B'
    const units = ['B', 'KB', 'MB', 'GB', 'TB']
    let val = bytes
    let i = 0
    while (val >= 1024 && i < units.length - 1) {
        val /= 1024
        i++
    }
    return `${val.toFixed(1)} ${units[i]}`
}

export default function ProcessPanel({ sessionId, active, onNotify }: Props) {
    const [procs, setProcs] = useState<SSHProcessInfo[]>([])
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')
    const [keyword, setKeyword] = useState('')
    const [lastUpdate, setLastUpdate] = useState<string>('')
    const [confirm, setConfirm] = useState<ConfirmState>(emptyConfirm)
    const [page, setPage] = useState(1)
    const [pageSize, setPageSize] = useState(20)

    useEffect(() => {
        setPage(1)
    }, [keyword])

    const fetchProcesses = useCallback(async () => {
        setBusy(true)
        setError('')
        try {
            const list = await API.sshProcessList(sessionId)
            setProcs(list || [])
            setLastUpdate(new Date().toLocaleTimeString())
        } catch (e) {
            const msg = errorMessage(e)
            setError(msg)
            if (onNotify) onNotify(`读取进程列表失败: ${msg}`, 'error')
        } finally {
            setBusy(false)
        }
    }, [sessionId, onNotify])

    useEffect(() => {
        if (active && procs.length === 0 && !busy) {
            void fetchProcesses()
        }
    }, [active, procs.length, busy, fetchProcesses])

    const filtered = useMemo(() => {
        if (!keyword.trim()) return procs
        const kw = keyword.trim().toLowerCase()
        return procs.filter(
            (pr) =>
                pr.pid.toString().includes(kw) ||
                pr.user.toLowerCase().includes(kw) ||
                pr.command.toLowerCase().includes(kw)
        )
    }, [procs, keyword])

    const handleKill = (proc: SSHProcessInfo) => {
        setConfirm({
            open: true,
            title: '结束进程确认',
            danger: true,
            message: `确认要发送 SIGKILL (kill -9) 结束进程 ${proc.command.split(' ')[0]} (PID: ${proc.pid}) 吗？`,
            onConfirm: async () => {
                setConfirm(emptyConfirm)
                try {
                    await API.sshKillProcess(sessionId, proc.pid)
                    if (onNotify) onNotify(`已成功结束进程 PID ${proc.pid}`)
                    await fetchProcesses()
                } catch (e) {
                    const msg = errorMessage(e)
                    setError(msg)
                    if (onNotify) onNotify(`结束进程失败: ${msg}`, 'error')
                }
            },
        })
    }

    const columns: ColumnsType<SSHProcessInfo> = [
        {
            title: 'PID',
            dataIndex: 'pid',
            key: 'pid',
            width: 80,
            sorter: (a, b) => a.pid - b.pid,
            render: (pid) => <Tag color="blue">{pid}</Tag>,
        },
        {
            title: '用户',
            dataIndex: 'user',
            key: 'user',
            width: 90,
            sorter: (a, b) => a.user.localeCompare(b.user),
            render: (u) => <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>{u}</span>,
        },
        {
            title: 'CPU %',
            dataIndex: 'cpu',
            key: 'cpu',
            width: 85,
            sorter: (a, b) => a.cpu - b.cpu,
            defaultSortOrder: 'descend',
            render: (cpu) => (
                <span style={{ fontWeight: cpu > 50 ? 600 : 400, color: cpu > 50 ? '#ef4444' : 'inherit' }}>
                    {cpu.toFixed(1)}%
                </span>
            ),
        },
        {
            title: 'MEM %',
            dataIndex: 'mem',
            key: 'mem',
            width: 85,
            sorter: (a, b) => a.mem - b.mem,
            render: (mem) => `${mem.toFixed(1)}%`,
        },
        {
            title: 'RSS 内存',
            dataIndex: 'rss',
            key: 'rss',
            width: 100,
            sorter: (a, b) => a.rss - b.rss,
            render: (rss) => fmtBytes(rss),
        },
        {
            title: '进程命令',
            dataIndex: 'command',
            key: 'command',
            ellipsis: true,
            render: (cmd) => <span title={cmd} style={{ fontFamily: 'monospace', fontSize: 12 }}>{cmd}</span>,
        },
        {
            title: '操作',
            key: 'action',
            width: 60,
            render: (_, record) => (
                <Tooltip title={`结束进程 (PID: ${record.pid})`}>
                    <Button
                        size="small"
                        type="text"
                        danger
                        icon={<Power size={13} />}
                        onClick={() => handleKill(record)}
                    />
                </Tooltip>
            ),
        },
    ]

    if (!active) return null

    return (
        <div className={p.processPanel}>
            <div className={p.toolbar}>
                <Input
                    size="small"
                    className={p.searchInput}
                    value={keyword}
                    placeholder="搜索 PID / 用户 / 命令..."
                    prefix={<Search size={13} />}
                    allowClear
                    onChange={(e) => setKeyword(e.target.value)}
                />
                <div className={p.toolbarActions}>
                    {lastUpdate && <span className={p.lastUpdate}>更新于 {lastUpdate}</span>}
                    <Button
                        size="small"
                        icon={<RotateCw size={12} />}
                        loading={busy}
                        onClick={fetchProcesses}
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
                    className={p.alertBox}
                    action={
                        <Button size="small" type="primary" danger onClick={fetchProcesses}>
                            重试
                        </Button>
                    }
                />
            )}

            <div className={p.tableWrap}>
                <Table<SSHProcessInfo>
                    rowKey="pid"
                    size="small"
                    columns={columns}
                    dataSource={filtered}
                    loading={busy}
                    pagination={{
                        current: page,
                        pageSize: pageSize,
                        total: filtered.length,
                        showSizeChanger: true,
                        pageSizeOptions: ['10', '20', '50', '100'],
                        showTotal: (t) => `共 ${t} 个进程`,
                        size: 'small',
                        onChange: (p, ps) => {
                            setPage(p)
                            setPageSize(ps)
                        },
                    }}
                    scroll={{ y: 'calc(100vh - 280px)' }}
                />
            </div>

            <ConfirmModal state={confirm} onCancel={() => setConfirm(emptyConfirm)} />
        </div>
    )
}
