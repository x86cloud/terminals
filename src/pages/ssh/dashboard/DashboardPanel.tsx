import { useCallback, useEffect, useState } from 'react'
import { Button, Progress, Checkbox, Table, Tag, Alert, Space, App } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { RotateCw, Server, Terminal, Database, Plug } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { API } from '@/api'
import { SSHDashboardInfo } from '@/types'
import { errorMessage } from '@/utils'
import d from '@/pages/ssh/dashboard/DashboardPanel.module.less'

interface Props {
    sessionId: string
    active: boolean
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

export default function DashboardPanel({ sessionId, active }: Props) {
    const { t } = useTranslation(['ssh', 'common'])
    const { message } = App.useApp()
    const [data, setData] = useState<SSHDashboardInfo | null>(null)
    const [busy, setBusy] = useState(false)
    const [loaded, setLoaded] = useState(false)
    const [error, setError] = useState('')
    const [lastUpdate, setLastUpdate] = useState<string>('')
    const [showVirtual, setShowVirtual] = useState(false)
    const [showVirtualNet, setShowVirtualNet] = useState(false)

    useEffect(() => {
        setLoaded(false)
        setData(null)
        setError('')
    }, [sessionId])

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
            message.error(msg)
        } finally {
            setBusy(false)
            setLoaded(true)
        }
    }, [sessionId])

    useEffect(() => {
        if (active && !loaded && !busy) {
            void fetchStats()
        }
    }, [active, loaded, busy, fetchStats])

    if (!active) return null

    const disksToDisplay = data?.disks
        ? data.disks.filter((dk) => showVirtual || !dk.isVirtual)
        : []

    const netsToDisplay = data?.nets
        ? data.nets.filter((n) => showVirtualNet || (!n.isVirtual && !n.isLoopback))
        : []

    const diskColumns: ColumnsType<NonNullable<SSHDashboardInfo['disks']>[0]> = [
        {
            title: t('ssh:dashboard.mount'),
            dataIndex: 'mount',
            key: 'mount',
            render: (mount, record) => (
                <Space size={4}>
                    <Tag color="blue">{mount}</Tag>
                    {record.isVirtual && <Tag>{t('ssh:dashboard.virtual')}</Tag>}
                </Space>
            ),
        },
        {
            title: t('ssh:dashboard.filesystem'),
            dataIndex: 'filesystem',
            key: 'filesystem',
            render: (fs, record) => (
                <span title={fs}>
                    {fs.split(/[\\/]/).pop() || fs} {record.fsType !== 'unknown' ? `(${record.fsType})` : ''}
                </span>
            ),
        },
        {
            title: t('ssh:dashboard.total'),
            dataIndex: 'total',
            key: 'total',
            render: (total) => fmtBytes(total),
        },
        {
            title: t('ssh:dashboard.used'),
            dataIndex: 'used',
            key: 'used',
            render: (used) => fmtBytes(used),
        },
        {
            title: t('ssh:dashboard.available'),
            dataIndex: 'available',
            key: 'available',
            render: (avail) => fmtBytes(avail),
        },
        {
            title: t('ssh:dashboard.usagePercent'),
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
            title: t('ssh:dashboard.netInterface'),
            dataIndex: 'name',
            key: 'name',
            render: (name, record) => (
                <Space size={4}>
                    <Tag color="cyan">{name}</Tag>
                    {record.isLoopback && <Tag>{t('ssh:dashboard.loopback')}</Tag>}
                    {record.isVirtual && <Tag>{t('ssh:dashboard.virtual')}</Tag>}
                </Space>
            ),
        },
        {
            title: t('ssh:dashboard.ip'),
            dataIndex: 'ip',
            key: 'ip',
            render: (ip) => ip || '-',
        },
        {
            title: t('ssh:dashboard.rx'),
            dataIndex: 'rxBytes',
            key: 'rxBytes',
            render: (rx) => fmtBytes(rx),
        },
        {
            title: t('ssh:dashboard.tx'),
            dataIndex: 'txBytes',
            key: 'txBytes',
            render: (tx) => fmtBytes(tx),
        },
    ]

    return (
        <div className={d.dashboard}>
            <div className={d.toolbar}>
                <div className={d.toolbarActions}>
                    {lastUpdate && <span className={d.lastUpdate}>{t('ssh:dashboard.updatedAt', { time: lastUpdate })}</span>}
                    <Button
                        size="small"
                        icon={<RotateCw size={12} />}
                        loading={busy}
                        onClick={fetchStats}
                    >
                        {t('common:refresh')}
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
                                {t('common:retry')}
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
                                <span className={d.label}>{t('ssh:dashboard.hostname')}:</span>
                                <span className={d.value}>{data.hostname || '-'}</span>
                            </div>
                            <div className={d.summaryItem}>
                                <span className={d.icon}><Terminal size={14} /></span>
                                <span className={d.label}>{t('ssh:dashboard.osKernel')}</span>
                                <span className={d.value}>{data.os || '-'}</span>
                            </div>
                            <div className={d.summaryItem}>
                                <span className={d.icon}><RotateCw size={14} /></span>
                                <span className={d.label}>{t('ssh:dashboard.uptime')}:</span>
                                <span className={d.value}>{cleanUptime(data.uptime)}</span>
                            </div>
                        </div>

                        {/* CPU & Memory 网格 */}
                        <div className={d.metricsGrid}>
                            {/* CPU 卡片 */}
                            <div className={d.card}>
                                <div className={d.cardHeader}>
                                    <span className={d.cardTitle}>{t('ssh:dashboard.cpu')}</span>
                                    <span className={d.cardSubtitle}>{t('ssh:dashboard.cores', { count: data.cpu.cores })}</span>
                                </div>
                                <div className={d.cardStatRow}>
                                    <span className={d.statLabel}>{t('ssh:dashboard.currentLoad')}</span>
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
                                    <span className={d.cardTitle}>{t('ssh:dashboard.physicalMemory')}</span>
                                    <span className={d.cardSubtitle}>{fmtBytes(data.mem.used)} / {fmtBytes(data.mem.total)}</span>
                                </div>
                                <div className={d.cardStatRow}>
                                    <span className={d.statLabel}>{t('ssh:dashboard.memory')}</span>
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
                                    <span>{t('ssh:dashboard.available')}: {fmtBytes(data.mem.available)}</span>
                                    {data.mem.swapTotal > 0 && (
                                        <span>Swap {t('ssh:dashboard.used')}: {fmtBytes(data.mem.swapUsed)} / {fmtBytes(data.mem.swapTotal)}</span>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* 磁盘分区列表卡片 */}
                        <div className={d.card}>
                            <div className={d.cardHeader}>
                                <Space size={6} className={d.cardTitle}>
                                    <Database size={14} />
                                    <span>{t('ssh:dashboard.diskPartitions', { count: disksToDisplay.length })}</span>
                                </Space>
                                <Checkbox
                                    checked={showVirtual}
                                    onChange={(e) => setShowVirtual(e.target.checked)}
                                >
                                    {t('ssh:dashboard.showVirtualDisks')}
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
                                    <span>{t('ssh:dashboard.networkCards', { count: netsToDisplay.length })}</span>
                                </Space>
                                <Checkbox
                                    checked={showVirtualNet}
                                    onChange={(e) => setShowVirtualNet(e.target.checked)}
                                >
                                    {t('ssh:dashboard.showVirtualNets')}
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
                    <div className={d.emptyState}>{t('ssh:dashboard.loading')}</div>
                )}
            </div>
        </div>
    )
}
