import React, {useCallback, useEffect, useState} from 'react'
import { RotateCw, Server, Terminal, Database, Plug } from 'lucide-react'
import {API} from '@/api'
import {SSHDashboardInfo} from '@/types'
import {errorMessage} from '@/utils'
import g from '@/styles/global.module.less'
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

export default function DashboardPanel({sessionId, active, onNotify}: Props) {
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

    return (
        <div className={d.dashboard}>
            <div className={d.toolbar}>
                <span className={g.spacer}/>
                <div className={d.toolbarActions}>
                    {lastUpdate && <span className={d.lastUpdate}>更新于 {lastUpdate}</span>}
                    <button
                        className={`${g.btn} ${g.xs}`}
                        onClick={fetchStats}
                        disabled={busy}
                        title="刷新系统数据"
                    >
                        <RotateCw size={12}/> {busy ? '刷新中…' : '刷新'}
                    </button>
                </div>
            </div>

            <div className={d.content}>
                {error && (
                    <div className={d.errorState}>
                        <span>{error}</span>
                        <button className={`${g.btn} ${g.xs}`} onClick={fetchStats}>重试</button>
                    </div>
                )}

                {data && (
                    <>
                        {/* 系统摘要卡片 */}
                        <div className={d.summaryCard}>
                            <div className={d.summaryItem}>
                                <span className={d.icon}><Server size={14}/></span>
                                <span className={d.label}>主机名:</span>
                                <span className={d.value}>{data.hostname || '-'}</span>
                            </div>
                            <div className={d.summaryItem}>
                                <span className={d.icon}><Terminal size={14}/></span>
                                <span className={d.label}>系统/内核:</span>
                                <span className={d.value}>{data.os || '-'}</span>
                            </div>
                            <div className={d.summaryItem}>
                                <span className={d.icon}><RotateCw size={14}/></span>
                                <span className={d.label}>运行时间:</span>
                                <span className={d.value}>{cleanUptime(data.uptime)}</span>
                            </div>
                        </div>

                        {/* CPU & Memory 网格 */}
                        <div className={d.metricsGrid}>
                            {/* CPU 卡片 */}
                            <div className={d.card}>
                                <div className={d.cardHeader}>
                                    <span>CPU 使用率</span>
                                    <span>{data.cpu.cores} 核心</span>
                                </div>
                                <div className={d.cardStatRow}>
                                    <span className={d.statLabel}>当前负载</span>
                                    <span className={d.statValue}>{data.cpu.usagePercent.toFixed(1)}%</span>
                                </div>
                                <div className={d.progressTrack}>
                                    <div
                                        className={d.progressBar}
                                        style={{
                                            width: `${Math.min(100, Math.max(0, data.cpu.usagePercent))}%`,
                                            backgroundColor: getProgressColor(data.cpu.usagePercent),
                                        }}
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
                                    <span>物理内存</span>
                                    <span>{fmtBytes(data.mem.used)} / {fmtBytes(data.mem.total)}</span>
                                </div>
                                <div className={d.cardStatRow}>
                                    <span className={d.statLabel}>内存使用率</span>
                                    <span className={d.statValue}>{data.mem.usagePercent.toFixed(1)}%</span>
                                </div>
                                <div className={d.progressTrack}>
                                    <div
                                        className={d.progressBar}
                                        style={{
                                            width: `${Math.min(100, Math.max(0, data.mem.usagePercent))}%`,
                                            backgroundColor: getProgressColor(data.mem.usagePercent),
                                        }}
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
                        <div className={d.diskCard}>
                            <div className={d.diskHeader}>
                                <div className={d.title}>
                                    <Database size={14}/>
                                    <span>磁盘分区 ({disksToDisplay.length})</span>
                                </div>
                                <label className={d.filterToggle}>
                                    <input
                                        type="checkbox"
                                        checked={showVirtual}
                                        onChange={(e) => setShowVirtual(e.target.checked)}
                                    />
                                    <span>显示虚拟/临时挂载点</span>
                                </label>
                            </div>

                            {disksToDisplay.length === 0 ? (
                                <div className={d.emptyState}>暂无匹配的磁盘分区数据</div>
                            ) : (
                                <div className={d.diskTableWrap}>
                                    <table className={d.diskTable}>
                                        <thead>
                                            <tr>
                                                <th>挂载点</th>
                                                <th>文件系统</th>
                                                <th>容量</th>
                                                <th>已用</th>
                                                <th>可用</th>
                                                <th>使用率</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {disksToDisplay.map((dk, idx) => (
                                                <tr key={`${dk.mount}-${idx}`}>
                                                    <td>
                                                        <span className={d.mountBadge}>{dk.mount}</span>
                                                        {dk.isVirtual && <span className={d.virtBadge}>虚拟</span>}
                                                    </td>
                                                    <td title={dk.filesystem}>
                                                        {dk.filesystem.split(/[\\/]/).pop() || dk.filesystem} {dk.fsType !== 'unknown' ? `(${dk.fsType})` : ''}
                                                    </td>
                                                    <td>{fmtBytes(dk.total)}</td>
                                                    <td>{fmtBytes(dk.used)}</td>
                                                    <td>{fmtBytes(dk.available)}</td>
                                                    <td>
                                                        <div className={d.usageCell}>
                                                            <div className={d.progressTrack} style={{flex: 1}}>
                                                                <div
                                                                    className={d.progressBar}
                                                                    style={{
                                                                        width: `${Math.min(100, Math.max(0, dk.usagePercent))}%`,
                                                                        backgroundColor: getProgressColor(dk.usagePercent),
                                                                    }}
                                                                />
                                                            </div>
                                                            <span
                                                                className={d.usageText}
                                                                style={{color: getProgressColor(dk.usagePercent)}}
                                                            >
                                                                {dk.usagePercent.toFixed(1)}%
                                                            </span>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>

                        {/* 网络网卡列表卡片 */}
                        <div className={d.diskCard}>
                            <div className={d.diskHeader}>
                                <div className={d.title}>
                                    <Plug size={14}/>
                                    <span>网络网卡 ({netsToDisplay.length})</span>
                                </div>
                                <label className={d.filterToggle}>
                                    <input
                                        type="checkbox"
                                        checked={showVirtualNet}
                                        onChange={(e) => setShowVirtualNet(e.target.checked)}
                                    />
                                    <span>显示虚拟/回环网卡</span>
                                </label>
                            </div>

                            {netsToDisplay.length === 0 ? (
                                <div className={d.emptyState}>暂无匹配的网络网卡数据</div>
                            ) : (
                                <div className={d.diskTableWrap}>
                                    <table className={d.diskTable}>
                                        <thead>
                                            <tr>
                                                <th>网卡接口</th>
                                                <th>IP 地址</th>
                                                <th>接收流量 (RX)</th>
                                                <th>发送流量 (TX)</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {netsToDisplay.map((net, idx) => (
                                                <tr key={`${net.name}-${idx}`}>
                                                    <td>
                                                        <span className={d.mountBadge}>{net.name}</span>
                                                        {net.isLoopback && <span className={d.virtBadge}>回环</span>}
                                                        {net.isVirtual && <span className={d.virtBadge}>虚拟</span>}
                                                    </td>
                                                    <td>{net.ip || '-'}</td>
                                                    <td>{fmtBytes(net.rxBytes)}</td>
                                                    <td>{fmtBytes(net.txBytes)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </>
                )}

                {!data && !error && busy && (
                    <div className={d.emptyState}>正在读取远程系统数据…</div>
                )}
            </div>
        </div>
    )
}
