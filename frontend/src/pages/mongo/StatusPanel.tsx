import React, { useCallback, useEffect, useState, useMemo } from 'react'
import {
    Button,
    Tag,
    Space,
    Input,
    Table,
    Segmented,
    Popconfirm,
    Tooltip,
    Alert,
    message,
} from 'antd'
import {
    RotateCw,
    Activity,
    Server,
    Zap,
    Cpu,
    Radio,
    HardDrive,
    Search,
    XOctagon,
    AlertTriangle,
} from 'lucide-react'
import { API } from '@/api'
import { errorMessage } from '@/utils'
import { MongoSessionInfo, MongoHealthInfo, MongoServerStatus } from '@/types'
import s from './StatusPanel.module.less'

interface Props {
    session: MongoSessionInfo
}

interface ParsedCurrentOp {
    opid: string | number
    active: boolean
    secs_running?: number
    microsecs_running?: number
    op?: string
    ns?: string
    client?: string
    commandSummary: string
    raw: any
}

function fmtBytes(bytes: number): string {
    if (!bytes || isNaN(bytes)) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
}

function fmtMb(mb?: number): string {
    if (mb === undefined || mb === null || isNaN(mb) || mb <= 0) return '-'
    if (mb >= 1024) {
        return `${(mb / 1024).toFixed(2)} GB`
    }
    return `${mb} MB`
}

export default function StatusPanel({ session }: Props) {
    const id = session.id
    const [subTab, setSubTab] = useState<'overview' | 'currentOps' | 'serverStatus'>('overview')
    const [health, setHealth] = useState<MongoHealthInfo | null>(null)
    const [status, setStatus] = useState<MongoServerStatus | null>(null)
    const [client, setClient] = useState<Record<string, any>>({})
    const [rawOps, setRawOps] = useState<string[]>([])
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')
    const [searchParam, setSearchParam] = useState('')
    const [killingOp, setKillingOp] = useState<string | number | null>(null)

    const loadData = useCallback(async () => {
        setBusy(true)
        setError('')
        try {
            const [h, st, cl, op] = await Promise.all([
                API.mongoHealthCheck(id).catch(() => null),
                API.mongoServerStatus(id).catch(() => null),
                API.mongoClientStats(id).catch(() => ({} as Record<string, any>)),
                API.mongoCurrentOps(id).catch(() => [] as string[]),
            ])
            setHealth(h)
            setStatus(st)
            setClient(cl)
            setRawOps(op)
        } catch (e) {
            setError(errorMessage(e))
        } finally {
            setBusy(false)
        }
    }, [id])

    useEffect(() => {
        void loadData()
    }, [loadData])

    // 解析当前操作进程列表
    const currentOpsList = useMemo((): ParsedCurrentOp[] => {
        return rawOps.map((str, idx) => {
            let obj: any = {}
            try {
                obj = JSON.parse(str)
            } catch {
                obj = { raw: str }
            }

            let cmdSummary = ''
            if (obj.command) {
                try {
                    cmdSummary = JSON.stringify(obj.command)
                } catch {
                    cmdSummary = String(obj.command)
                }
            }

            return {
                opid: obj.opid ?? idx,
                active: Boolean(obj.active),
                secs_running: obj.secs_running ?? 0,
                microsecs_running: obj.microsecs_running,
                op: obj.op || '-',
                ns: obj.ns || '-',
                client: obj.client || obj.client_s || '-',
                commandSummary: cmdSummary || '-',
                raw: obj,
            }
        })
    }, [rawOps])

    // 终止指定活动操作
    const handleKillOp = async (opid: string | number) => {
        setKillingOp(opid)
        try {
            await API.mongoRunCommand(id, 'admin', JSON.stringify({ killOp: 1, op: opid }))
            message.success(`已发送终止操作请求 (OpID: ${opid})`)
            void loadData()
        } catch (e) {
            message.error(`终止操作失败: ${errorMessage(e)}`)
        } finally {
            setKillingOp(null)
        }
    }

    // 扁平化 ServerStatus 用于参数检索
    const flattenedParams = useMemo(() => {
        if (!status) return []
        const list: { key: string; value: string; section: string }[] = []

        const walk = (obj: any, prefix = '', section = '') => {
            if (!obj || typeof obj !== 'object') return
            for (const [k, v] of Object.entries(obj)) {
                const fullKey = prefix ? `${prefix}.${k}` : k
                if (v && typeof v === 'object' && !Array.isArray(v)) {
                    walk(v, fullKey, section || k)
                } else {
                    list.push({
                        key: fullKey,
                        value: typeof v === 'object' ? JSON.stringify(v) : String(v),
                        section: section || k,
                    })
                }
            }
        }

        walk(status, '', '')
        return list
    }, [status])

    const filteredParams = useMemo(() => {
        if (!searchParam.trim()) return flattenedParams
        const q = searchParam.toLowerCase()
        return flattenedParams.filter(
            (p) => p.key.toLowerCase().includes(q) || p.value.toLowerCase().includes(q)
        )
    }, [flattenedParams, searchParam])

    // KPI 数据推导
    const connCurrent = status?.connections?.current ?? client.activeConn ?? 0
    const connAvailable = status?.connections?.available ?? client.maxPoolSize ?? 0
    const memResident = Number(status?.mem?.resident) || 0
    const memVirtual = Number(status?.mem?.virtual) || 0
    const wtCacheUsed = Number(status?.wiredTiger?.cache?.['bytes currently in the cache']) || 0
    const opQuery = status?.opcounters?.query ?? 0
    const opInsert = status?.opcounters?.insert ?? 0
    const opUpdate = status?.opcounters?.update ?? 0
    const opDelete = status?.opcounters?.delete ?? 0
    const totalOps = opQuery + opInsert + opUpdate + opDelete

    return (
        <div className={s.statusWrap}>
            {/* 顶部工具与状态栏 */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                <Space size={10}>
                    <Segmented
                        size="small"
                        value={subTab}
                        onChange={(v) => setSubTab(v as any)}
                        options={[
                            { label: '运行指标概览', value: 'overview', icon: <Activity size={12} /> },
                            {
                                label: `实时操作进程 (${currentOpsList.length})`,
                                value: 'currentOps',
                                icon: <Zap size={12} />,
                            },
                            { label: '系统参数检索', value: 'serverStatus', icon: <Search size={12} /> },
                        ]}
                    />
                </Space>

                <Space size={8}>
                    {error && <span style={{ color: '#ef4444', fontSize: 12 }}>{error}</span>}
                    <Button
                        size="small"
                        type="primary"
                        icon={<RotateCw size={12} />}
                        loading={busy}
                        onClick={loadData}
                    >
                        刷新指标
                    </Button>
                </Space>
            </div>

            {/* KPI 指标卡片矩阵 */}
            <div className={s.kpiRow}>
                {/* 1. 健康状态 */}
                <div className={s.kpiCard}>
                    <div className={s.kpiLabel}>
                        <span>服务健康度</span>
                        <Radio size={13} style={{ color: health?.ok ? '#22c55e' : '#ef4444' }} />
                    </div>
                    <div className={s.kpiValue} style={{ color: health?.ok ? '#22c55e' : '#ef4444' }}>
                        {health ? (health.ok ? '健康正常' : '服务异常') : '-'}
                    </div>
                    <div className={s.kpiSub}>
                        延迟: {health?.latencyMs !== undefined ? `${health.latencyMs}ms` : '-'}
                    </div>
                </div>

                {/* 2. 当前连接 */}
                <div className={s.kpiCard}>
                    <div className={s.kpiLabel}>
                        <span>活跃连接数</span>
                        <Server size={13} style={{ color: '#3b82f6' }} />
                    </div>
                    <div className={s.kpiValue}>{connCurrent}</div>
                    <div className={s.kpiSub}>可用空闲: {connAvailable}</div>
                </div>

                {/* 3. 内存使用 */}
                <div className={s.kpiCard}>
                    <div className={s.kpiLabel}>
                        <span>常驻内存 (Resident)</span>
                        <HardDrive size={13} style={{ color: '#eab308' }} />
                    </div>
                    <div className={s.kpiValue}>
                        {memResident > 0 ? fmtMb(memResident) : (wtCacheUsed > 0 ? fmtBytes(wtCacheUsed) : '-')}
                    </div>
                    <div className={s.kpiSub}>
                        {memVirtual > 0
                            ? `虚拟内存: ${fmtMb(memVirtual)}`
                            : (wtCacheUsed > 0 ? `WT 缓存: ${fmtBytes(wtCacheUsed)}` : '虚拟内存: -')}
                    </div>
                </div>

                {/* 4. 拓扑与版本 */}
                <div className={s.kpiCard}>
                    <div className={s.kpiLabel}>
                        <span>拓扑与架构</span>
                        <Cpu size={13} style={{ color: '#8b5cf6' }} />
                    </div>
                    <div className={s.kpiValue} style={{ fontSize: 16 }}>
                        {health?.topology || 'Standalone'}
                    </div>
                    <div className={s.kpiSub}>
                        版本: {health?.version || status?.version || '-'}
                    </div>
                </div>

                {/* 5. 累计操作数 */}
                <div className={s.kpiCard}>
                    <div className={s.kpiLabel}>
                        <span>累计总操作</span>
                        <Zap size={13} style={{ color: '#ec4899' }} />
                    </div>
                    <div className={s.kpiValue}>{totalOps || client.ops || 0}</div>
                    <div className={s.kpiSub}>
                        Q: {opQuery} · I: {opInsert} · U: {opUpdate} · D: {opDelete}
                    </div>
                </div>

                {/* 6. 慢操作统计 */}
                <div className={s.kpiCard}>
                    <div className={s.kpiLabel}>
                        <span>慢操作 (&gt;100ms)</span>
                        <AlertTriangle size={13} style={{ color: client.slowOps ? '#f59e0b' : '#10b981' }} />
                    </div>
                    <div className={s.kpiValue} style={{ color: client.slowOps ? '#f59e0b' : undefined }}>
                        {client.slowOps ?? 0}
                    </div>
                    <div className={s.kpiSub}>
                        失败数: {client.failures ?? 0} · 均耗: {(client.avgMs ?? 0).toFixed(1)}ms
                    </div>
                </div>
            </div>

            {/* 子视图 1：运行指标概览 */}
            {subTab === 'overview' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {status && (
                        <div className={s.sectionBox}>
                            <div className={s.sectionHeader}>
                                <span>连接池与全局状态</span>
                                <Tag color="blue">{status.host}</Tag>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
                                <div>
                                    <h4 style={{ margin: '0 0 8px 0', fontSize: 12, color: 'var(--text-dim)' }}>
                                        连接状态 (Connections)
                                    </h4>
                                    <table className={s.kvTable}>
                                        <tbody>
                                            <tr><th>当前活跃 (current)</th><td>{String(status.connections?.current ?? client.activeConn ?? '-')}</td></tr>
                                            <tr><th>可用余量 (available)</th><td>{String(status.connections?.available ?? client.maxPoolSize ?? '-')}</td></tr>
                                            <tr><th>历史创建累计</th><td>{String(status.connections?.totalCreated ?? '-')}</td></tr>
                                            <tr><th>运行进程名称</th><td>{status.process || 'mongod'}</td></tr>
                                            <tr><th>正常运行时间 (uptime)</th><td>{status.uptime ? `${Math.floor(status.uptime / 3600)}h ${Math.floor((status.uptime % 3600) / 60)}m` : '-'}</td></tr>
                                        </tbody>
                                    </table>
                                </div>
                                <div>
                                    <h4 style={{ margin: '0 0 8px 0', fontSize: 12, color: 'var(--text-dim)' }}>
                                        网络吞吐 (Network)
                                    </h4>
                                    <table className={s.kvTable}>
                                        <tbody>
                                            <tr><th>入站流量 (bytesIn)</th><td>{fmtBytes(status.network?.bytesIn)}</td></tr>
                                            <tr><th>出站流量 (bytesOut)</th><td>{fmtBytes(status.network?.bytesOut)}</td></tr>
                                            <tr><th>请求总数 (numRequests)</th><td>{String(status.network?.numRequests ?? '-')}</td></tr>
                                            <tr><th>全局读锁</th><td>{String(status.globalLock?.currentQueue?.readers ?? 0)}</td></tr>
                                            <tr><th>全局写锁</th><td>{String(status.globalLock?.currentQueue?.writers ?? 0)}</td></tr>
                                        </tbody>
                                    </table>
                                </div>
                                <div>
                                    <h4 style={{ margin: '0 0 8px 0', fontSize: 12, color: 'var(--text-dim)' }}>
                                        内存与引擎缓存 (Memory & Engine)
                                    </h4>
                                    <table className={s.kvTable}>
                                        <tbody>
                                            <tr><th>物理常驻 (Resident)</th><td>{fmtMb(status.mem?.resident)}</td></tr>
                                            <tr><th>虚拟内存 (Virtual)</th><td>{fmtMb(status.mem?.virtual)}</td></tr>
                                            <tr><th>WiredTiger 缓存已用</th><td>{fmtBytes(status.wiredTiger?.cache?.['bytes currently in the cache'])}</td></tr>
                                            <tr><th>WiredTiger 缓存上限</th><td>{fmtBytes(status.wiredTiger?.cache?.['maximum bytes configured'])}</td></tr>
                                            <tr><th>缺页异常 (Page Faults)</th><td>{String(status.extra_info?.page_faults ?? '-')}</td></tr>
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}

                    {health?.hosts && health.hosts.length > 0 && (
                        <div className={s.sectionBox}>
                            <div className={s.sectionHeader}>
                                <span>集群成员主机 (Hosts)</span>
                                <Tag color="purple">{health.setName || 'ReplicaSet'}</Tag>
                            </div>
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                {health.hosts.map((h) => (
                                    <Tag key={h} color="blue" style={{ fontSize: 12, padding: '3px 8px' }}>
                                        {h}
                                    </Tag>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* 子视图 2：实时操作进程 CurrentOps */}
            {subTab === 'currentOps' && (
                <div className={s.sectionBox}>
                    <div className={s.sectionHeader}>
                        <span>活动操作列表（$currentOp）</span>
                        <span style={{ fontSize: 11.5, color: 'var(--text-faint)' }}>
                            共 {currentOpsList.length} 个正在执行的活动操作
                        </span>
                    </div>

                    <Table
                        size="small"
                        rowKey="opid"
                        dataSource={currentOpsList}
                        pagination={false}
                        columns={[
                            {
                                title: 'OpID',
                                dataIndex: 'opid',
                                width: 100,
                                render: (v) => <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{v}</span>,
                            },
                            {
                                title: '命名空间 (ns)',
                                dataIndex: 'ns',
                                width: 160,
                                ellipsis: true,
                            },
                            {
                                title: '操作类型',
                                dataIndex: 'op',
                                width: 90,
                                render: (op) => <Tag color="cyan">{op}</Tag>,
                            },
                            {
                                title: '客户端',
                                dataIndex: 'client',
                                width: 150,
                                ellipsis: true,
                            },
                            {
                                title: '耗时 (s)',
                                dataIndex: 'secs_running',
                                width: 85,
                                sorter: (a, b) => (a.secs_running || 0) - (b.secs_running || 0),
                                render: (sec) => (
                                    <span style={{ color: sec > 2 ? '#ef4444' : 'inherit', fontWeight: sec > 2 ? 700 : 400 }}>
                                        {sec}s
                                    </span>
                                ),
                            },
                            {
                                title: '命令详情',
                                dataIndex: 'commandSummary',
                                ellipsis: true,
                                render: (cmd) => (
                                    <Tooltip title={cmd} mouseEnterDelay={0.3}>
                                        <span style={{ fontFamily: 'monospace', fontSize: 11 }}>{cmd}</span>
                                    </Tooltip>
                                ),
                            },
                            {
                                title: '操作',
                                width: 90,
                                align: 'center',
                                render: (_, record) => (
                                    <Popconfirm
                                        title={`确定要强行终止该操作 (OpID: ${record.opid}) 吗？`}
                                        okText="强行终止"
                                        cancelText="取消"
                                        okButtonProps={{ danger: true }}
                                        onConfirm={() => handleKillOp(record.opid)}
                                    >
                                        <Button
                                            size="small"
                                            type="text"
                                            danger
                                            icon={<XOctagon size={12} />}
                                            loading={killingOp === record.opid}
                                        >
                                            Kill
                                        </Button>
                                    </Popconfirm>
                                ),
                            },
                        ]}
                    />
                </div>
            )}

            {/* 子视图 3：ServerStatus 参数检索 */}
            {subTab === 'serverStatus' && (
                <div className={s.sectionBox}>
                    <div className={s.sectionHeader}>
                        <span>ServerStatus 参数实时检索</span>
                        <Input
                            size="small"
                            placeholder="搜索参数名或值..."
                            prefix={<Search size={12} style={{ color: 'var(--text-faint)' }} />}
                            value={searchParam}
                            onChange={(e) => setSearchParam(e.target.value)}
                            style={{ width: 220 }}
                            allowClear
                        />
                    </div>

                    <Table
                        size="small"
                        rowKey="key"
                        dataSource={filteredParams}
                        pagination={{ pageSize: 50, size: 'small', showSizeChanger: false }}
                        columns={[
                            {
                                title: '所属分组',
                                dataIndex: 'section',
                                width: 140,
                                render: (sec) => <Tag color="default">{sec}</Tag>,
                            },
                            {
                                title: '参数名称 (Key)',
                                dataIndex: 'key',
                                width: 340,
                                render: (k) => <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{k}</span>,
                            },
                            {
                                title: '参数值 (Value)',
                                dataIndex: 'value',
                                ellipsis: true,
                                render: (v) => <span style={{ fontFamily: 'monospace' }}>{v}</span>,
                            },
                        ]}
                    />
                </div>
            )}
        </div>
    )
}
