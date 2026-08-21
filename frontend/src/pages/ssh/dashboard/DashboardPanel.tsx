import React, { useCallback, useEffect, useState } from 'react'
import { Button, Progress, Checkbox, Table, Tag, Alert, Space, Card } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { RotateCw, Server, Terminal, Database, Plug } from 'lucide-react'
import { API } from '@/api'
import { SSHDashboardInfo } from '@/types'
import { errorMessage } from '@/utils'
import d from '@/pages/ssh/dashboard/DashboardPanel.module.less'

interface Props {
    sessionId: string
    active: boolean
    onNotify?: (message: string, kind?: 'info' | 'error') => void
}

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

function getProgressColor(pct: number): string {
    if (pct >= 90) return '#ef4444'
    if (pct >= 75) return '#f59e0b'
    return '#10b981'
}

function cleanUptime(str: string): string {
    if (!str) return '-'
    if (str.includes(' up ')) {
        let part = str.split(' up ')[1] || str
        if (part.includes('load average')) {
            part = part.split('load average')[0]
        }
        const sub = part.split(',').map((s) => s.trim()).filter((s) => !s.includes('user') && s.length > 0)
        if (sub.length > 0) return sub.join(', ')
    }
    return str
}

export default function DashboardPanel({ sessionId, active, onNotify }: Props) {
    const [data, setData] = useState<SSHDashboardInfo | null>(null)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')
    const [lastUpdate, setLastUpdate] = useState<string>('')
    const [showVirtual, setShowVirtual] = useState(false)
    const [showVirtualNet, setShowVirtualNet] = useState(false)

    const fetchStats = useCallback(async () => {
        setBusy(true)
        setError('')
        try {
            const res = await API.sshDashboardStats(sessionId)
            setData(res)
            const now = new Date()
            setLastUpdate(now.toLocaleTimeString())
        } catch (e) {
            const msg = errorMessage(e)
            setError(msg)
            if (onNotify) onNotify(`获取系统仪表盘失败: ${msg}`, 'error')
        } finally {
            setBusy(false)
        }
    }, [sessionId, onNotify])

    useEffect(() => {
        if (active && !data && !busy) {
            void fetchStats()
        }
    }, [active, data, busy, fetchStats])

    if (!active) return null

    const disksToDisplay = data?.disks
        ? data.disks.filter((dk) => showVirtual || !dk.isVirtual)
        : []

    const netsToDisplay = data?.nets
        ? data.nets.filter((n) => showVirtualNet || (!n.isVirtual && !n.isLoopback))
        : []

    const diskColumns: ColumnsType<NonNullable<SSHDashboardInfo['disks']>[0]> = [
        {
            title: '挂载点',
            dataIndex: 'mount',
            key: 'mount',
            render: (mount, record) => (
                <Space size={4}>
                    <Tag color="blue">{mount}</Tag>
                    {record.isVirtual && <Tag>虚拟</Tag>}
                </Space>
            ),
        },
        {
            title: '文件系统',
            dataIndex: 'filesystem',
            key: 'filesystem',
            render: (fs, record) => (
                <span title={fs}>
                    {fs.split(/[\\/]/).pop() || fs} {record.fsType !== 'unknown' ? `(${record.fsType})` : ''}
                </span>
            ),
        },
        {
            title: '容量',
            dataIndex: 'total',
            key: 'total',
            render: (total) => fmtBytes(total),
        },
        {
            title: '已用',
            dataIndex: 'used',
            key: 'used',
            render: (used) => fmtBytes(used),
        },
        {
            title: '可用',
            dataIndex: 'available',
            key: 'available',
            render: (avail) => fmtBytes(avail),
        },
        {
            title: '使用率',
            dataIndex: 'usagePercent',
            key: 'usagePercent',
            width: 220,
            render: (pct) => (
                <Progress
                    percent={Math.min(100, Math.max(0, parseFloat(pct.toFixed(1))))}
                    size="small"
                    strokeColor={getProgressColor(pct)}
                />
            ),
        },
    ]

    const netColumns: ColumnsType<NonNullable<SSHDashboardInfo['nets']>[0]> = [
        {
            title: '网卡接口',
            dataIndex: 'name',
            key: 'name',
            render: (name, record) => (
                <Space size={4}>
                    <Tag color="cyan">{name}</Tag>
                    {record.isLoopback && <Tag>回环</Tag>}
                    {record.isVirtual && <Tag>虚拟</Tag>}
                </Space>
            ),
        },
        {
            title: 'IP 地址',
            dataIndex: 'ip',
            key: 'ip',
            render: (ip) => ip || '-',
        },
        {
            title: '接收流量 (RX)',
            dataIndex: 'rxBytes',
            key: 'rxBytes',
            render: (rx) => fmtBytes(rx),
        },
        {
            title: '发送流量 (TX)',
            dataIndex: 'txBytes',
            key: 'txBytes',
            render: (tx) => fmtBytes(tx),
        },
    ]

    return (
        <div className={d.dashboard}>
            <div className={d.toolbar}>
                <div className={d.toolbarActions}>
                    {lastUpdate && <span className={d.lastUpdate}>更新于 {lastUpdate}</span>}
                    <Button
                        size="small"
                        icon={<RotateCw size={12} />}
                        loading={busy}
                        onClick={fetchStats}
                    >
                        刷新
                    </Button>
                </div>
            </div>

            <div className={d.content}>
                {error && (
                    <Alert
                        type="error"
                        showIcon
                        message={error}
                        className={d.alertBox}
                        action={
                            <Button size="small" type="primary" danger onClick={fetchStats}>
                                重试
                            </Button>
                        }
                    />
                )}

                {data && (
                    <div className={d.stack}>
                        {/* 系统摘要卡片 */}
                        <div className={d.summaryCard}>
                            <div className={d.summaryItem}>
                                <span className={d.icon}><Server size={14} /></span>
                                <span className={d.label}>主机名:</span>
                                <span className={d.value}>{data.hostname || '-'}</span>
                            </div>
                            <div className={d.summaryItem}>
                                <span className={d.icon}><Terminal size={14} /></span>
                                <span className={d.label}>系统/内核:</span>
                                <span className={d.value}>{data.os || '-'}</span>
                            </div>
                            <div className={d.summaryItem}>
                                <span className={d.icon}><RotateCw size={14} /></span>
                                <span className={d.label}>运行时间:</span>
                                <span className={d.value}>{cleanUptime(data.uptime)}</span>
                            </div>
                        </div>

                        {/* CPU & Memory 网格 */}
                        <div className={d.metricsGrid}>
                            {/* CPU 卡片 */}
                            <div className={d.card}>
                                <div className={d.cardHeader}>
                                    <span className={d.cardTitle}>CPU 使用率</span>
                                    <span className={d.cardSubtitle}>{data.cpu.cores} 核心</span>
                                </div>
                                <div className={d.cardStatRow}>
                                    <span className={d.statLabel}>当前负载</span>
                                    <span className={d.statValue}>{data.cpu.usagePercent.toFixed(1)}%</span>
                                </div>
                                <div className={d.progressWrap}>
                                    <Progress
                                        percent={Math.min(100, Math.max(0, parseFloat(data.cpu.usagePercent.toFixed(1))))}
                                        size="small"
                                        strokeColor={getProgressColor(data.cpu.usagePercent)}
                                    />
                                </div>
                                <div className={d.subDetails}>
                                    <span>Load Avg (1/5/15m)</span>
                                    <span>{data.cpu.loadAvg.map((l) => l.toFixed(2)).join(' / ')}</span>
                                </div>
                            </div>

                            {/* 内存卡片 */}
                            <div className={d.card}>
                                <div className={d.cardHeader}>
                                    <span className={d.cardTitle}>物理内存</span>
                                    <span className={d.cardSubtitle}>{fmtBytes(data.mem.used)} / {fmtBytes(data.mem.total)}</span>
                                </div>
                                <div className={d.cardStatRow}>
                                    <span className={d.statLabel}>内存使用率</span>
                                    <span className={d.statValue}>{data.mem.usagePercent.toFixed(1)}%</span>
                                </div>
                                <div className={d.progressWrap}>
                                    <Progress
                                        percent={Math.min(100, Math.max(0, parseFloat(data.mem.usagePercent.toFixed(1))))}
                                        size="small"
                                        strokeColor={getProgressColor(data.mem.usagePercent)}
                                    />
                                </div>
                                <div className={d.subDetails}>
                                    <span>可用: {fmtBytes(data.mem.available)}</span>
                                    {data.mem.swapTotal > 0 && (
                                        <span>Swap 已用: {fmtBytes(data.mem.swapUsed)} / {fmtBytes(data.mem.swapTotal)}</span>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* 磁盘分区列表卡片 */}
                        <div className={d.card}>
                            <div className={d.cardHeader}>
                                <Space size={6} className={d.cardTitle}>
                                    <Database size={14} />
                                    <span>磁盘分区 ({disksToDisplay.length})</span>
                                </Space>
                                <Checkbox
                                    checked={showVirtual}
                                    onChange={(e) => setShowVirtual(e.target.checked)}
                                >
                                    显示虚拟/临时挂载点
                                </Checkbox>
                            </div>

                            <Table
                                rowKey={(r, idx) => `${r.mount}-${idx}`}
                                size="small"
                                columns={diskColumns}
                                dataSource={disksToDisplay}
                                pagination={false}
                            />
                        </div>

                        {/* 网络网卡列表卡片 */}
                        <div className={d.card}>
                            <div className={d.cardHeader}>
                                <Space size={6} className={d.cardTitle}>
                                    <Plug size={14} />
                                    <span>网络网卡 ({netsToDisplay.length})</span>
                                </Space>
                                <Checkbox
                                    checked={showVirtualNet}
                                    onChange={(e) => setShowVirtualNet(e.target.checked)}
                                >
                                    显示虚拟/回环网卡
                                </Checkbox>
                            </div>

                            <Table
                                rowKey={(r, idx) => `${r.name}-${idx}`}
                                size="small"
                                columns={netColumns}
                                dataSource={netsToDisplay}
                                pagination={false}
                            />
                        </div>
                    </div>
                )}

                {!data && !error && busy && (
                    <div className={d.emptyState}>正在读取远程系统数据…</div>
                )}
            </div>
        </div>
    )
}
