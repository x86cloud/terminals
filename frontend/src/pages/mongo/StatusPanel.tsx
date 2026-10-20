import { useCallback, useEffect, useState, useMemo } from 'react'
import {
    Button,
    Tag,
    Space,
    Input,
    Table,
    Segmented,
    Popconfirm,
    Tooltip,
    Select,
    Radio,
    InputNumber,
    Modal,
    Alert,
    message,
} from 'antd'
import {
    RotateCw,
    Activity,
    Server,
    Zap,
    Cpu,
    Radio as RadioIcon,
    HardDrive,
    Search,
    XOctagon,
    AlertTriangle,
    Sliders,
    Copy,
} from 'lucide-react'
import { API } from '@/api'
import { errorMessage } from '@/utils'
import { copyTextToClipboard } from '@/utils/sqlExport'
import { MongoSessionInfo, MongoHealthInfo, MongoServerStatus } from '@/types'
import s from './StatusPanel.module.less'

interface Props {
    session: MongoSessionInfo
    databases?: string[]
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

export default function StatusPanel({ session, databases = [] }: Props) {
    const id = session.id
    const [subTab, setSubTab] = useState<'overview' | 'currentOps' | 'slowQueries' | 'serverStatus'>('overview')
    const [health, setHealth] = useState<MongoHealthInfo | null>(null)
    const [status, setStatus] = useState<MongoServerStatus | null>(null)
    const [client, setClient] = useState<Record<string, any>>({})
    const [rawOps, setRawOps] = useState<string[]>([])
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')
    const [searchParam, setSearchParam] = useState('')
    const [killingOp, setKillingOp] = useState<string | number | null>(null)

    // 慢查询分析与 Profiler 状态
    const [profilerDb, setProfilerDb] = useState<string>(session.database || databases[0] || 'admin')
    const [profilerStatus, setProfilerStatus] = useState<{ was?: number; slowms?: number } | null>(null)
    const [rawSlowQueries, setRawSlowQueries] = useState<string[]>([])
    const [loadingSlow, setLoadingSlow] = useState(false)
    const [slowError, setSlowError] = useState('')
    const [profilerModalOpen, setProfilerModalOpen] = useState(false)
    const [editLevel, setEditLevel] = useState<number>(1)
    const [editSlowMs, setEditSlowMs] = useState<number>(100)
    const [savingProfiler, setSavingProfiler] = useState(false)
    const [cmdDetailModal, setCmdDetailModal] = useState<{ open: boolean; title: string; json: string } | null>(null)

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

    // 加载指定库的慢查询与 Profiler 状态
    const loadSlowQueries = useCallback(async () => {
        setLoadingSlow(true)
        setSlowError('')
        try {
            const [prof, queries] = await Promise.all([
                API.mongoGetProfilingStatus(id, profilerDb).catch(() => null),
                API.mongoSlowQueries(id, profilerDb, 100).catch(() => [] as string[]),
            ])
            setProfilerStatus(prof)
            if (prof?.was !== undefined) {
                setEditLevel(Number(prof.was))
            }
            if (prof?.slowms !== undefined) {
                setEditSlowMs(Number(prof.slowms))
            }
            setRawSlowQueries(queries || [])
        } catch (e: any) {
            setSlowError(errorMessage(e))
        } finally {
            setLoadingSlow(false)
        }
    }, [id, profilerDb])

    useEffect(() => {
        if (subTab === 'slowQueries') {
            void loadSlowQueries()
        }
    }, [subTab, loadSlowQueries])

    // 保存 Profiler 配置
    const handleSaveProfiler = async () => {
        setSavingProfiler(true)
        try {
            await API.mongoSetProfilingStatus(id, profilerDb, editLevel, editSlowMs)
            message.success(`已更新数据库 [${profilerDb}] 的 Profiling 级别为 Level ${editLevel}`)
            setProfilerModalOpen(false)
            void loadSlowQueries()
        } catch (e: any) {
            message.error(errorMessage(e))
        } finally {
            setSavingProfiler(false)
        }
    }

    // 解析慢查询列表
    const parsedSlowQueries = useMemo(() => {
        return rawSlowQueries.map((str, idx) => {
            let obj: any = {}
            try {
                obj = JSON.parse(str)
            } catch {
                obj = { raw: str }
            }

            let cmdStr = ''
            if (obj.command) {
                try {
                    cmdStr = JSON.stringify(obj.command, null, 2)
                } catch {
                    cmdStr = String(obj.command)
                }
            }

            let tsStr = '-'
            if (obj.ts) {
                if (typeof obj.ts === 'object' && obj.ts.$date) {
                    tsStr = new Date(obj.ts.$date).toLocaleString()
                } else {
                    tsStr = String(obj.ts)
                }
            }

            return {
                key: idx,
                ts: tsStr,
                millis: Number(obj.millis) || 0,
                op: obj.op || '-',
                ns: obj.ns || '-',
                keysExamined: obj.keysExamined !== undefined ? obj.keysExamined : '-',
                docsExamined: obj.docsExamined !== undefined ? obj.docsExamined : '-',
                nreturned: obj.nreturned !== undefined ? obj.nreturned : '-',
                responseLength: obj.responseLength,
                client: obj.client || '-',
                commandSummary: cmdStr ? cmdStr.slice(0, 120) : '-',
                cmdStr,
                raw: str,
            }
        })
    }, [rawSlowQueries])

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
                            {
                                label: `慢查询分析 (${parsedSlowQueries.length})`,
                                value: 'slowQueries',
                                icon: <AlertTriangle size={12} />,
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
                        loading={busy || loadingSlow}
                        onClick={() => {
                            if (subTab === 'slowQueries') {
                                void loadSlowQueries()
                            } else {
                                void loadData()
                            }
                        }}
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
                        <RadioIcon size={13} style={{ color: health?.ok ? '#22c55e' : '#ef4444' }} />
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
                                        />
                                    </Popconfirm>
                                ),
                            },
                        ]}
                    />
                </div>
            )}

            {/* 子视图：慢查询分析 (Profiler) */}
            {subTab === 'slowQueries' && (
                <div className={s.sectionBox}>
                    <div className={s.sectionHeader}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span>慢查询分析 (system.profile)</span>
                            <Select
                                size="small"
                                style={{ width: 140 }}
                                value={profilerDb}
                                onChange={(v) => setProfilerDb(v)}
                                options={[
                                    { label: 'admin 库', value: 'admin' },
                                    ...databases.filter((d) => d !== 'admin').map((d) => ({ label: d, value: d })),
                                ]}
                            />
                            {profilerStatus?.was === 0 && (
                                <Tag color="default">Profiler 未开启 (Level 0)</Tag>
                            )}
                            {profilerStatus?.was === 1 && (
                                <Tag color="green">
                                    Profiler 仅慢操作 (Level 1, 阈值: {profilerStatus.slowms ?? 100}ms)
                                </Tag>
                            )}
                            {profilerStatus?.was === 2 && (
                                <Tag color="warning">
                                    Profiler 全量操作 (Level 2)
                                </Tag>
                            )}
                        </div>

                        <Space size={8}>
                            <Button
                                size="small"
                                icon={<Sliders size={12} />}
                                onClick={() => setProfilerModalOpen(true)}
                            >
                                配置 Profiler
                            </Button>
                            <Button
                                size="small"
                                type="text"
                                icon={<RotateCw size={12} className={loadingSlow ? 'spin' : ''} />}
                                onClick={() => void loadSlowQueries()}
                            >
                                刷新
                            </Button>
                        </Space>
                    </div>

                    {slowError && (
                        <Alert
                            type="info"
                            showIcon
                            message={`提示: ${slowError}`}
                            description="若提示集合不存在，说明当前库尚未开启 Profiler 或尚未产生慢查询记录。可点击上方「配置 Profiler」开启记录。"
                        />
                    )}

                    <Table
                        size="small"
                        rowKey="key"
                        loading={loadingSlow}
                        dataSource={parsedSlowQueries}
                        pagination={{ pageSize: 20, size: 'small', showSizeChanger: true }}
                        columns={[
                            {
                                title: '执行时间',
                                dataIndex: 'ts',
                                width: 160,
                                render: (ts) => <span style={{ fontSize: 11 }}>{ts}</span>,
                            },
                            {
                                title: '耗时',
                                dataIndex: 'millis',
                                width: 90,
                                sorter: (a, b) => a.millis - b.millis,
                                render: (ms) => {
                                    let color = '#22c55e'
                                    if (ms >= 1000) color = '#ef4444'
                                    else if (ms >= 300) color = '#f97316'
                                    else if (ms >= 100) color = '#eab308'
                                    return (
                                        <Tag style={{ color, borderColor: color, background: 'transparent', fontWeight: 600 }}>
                                            {ms}ms
                                        </Tag>
                                    )
                                },
                            },
                            {
                                title: '类型',
                                dataIndex: 'op',
                                width: 85,
                                render: (op) => {
                                    const map: Record<string, string> = {
                                        query: 'blue',
                                        insert: 'green',
                                        update: 'orange',
                                        remove: 'red',
                                        command: 'cyan',
                                    }
                                    return <Tag color={map[op] || 'default'}>{op}</Tag>
                                },
                            },
                            {
                                title: '命名空间 (ns)',
                                dataIndex: 'ns',
                                width: 160,
                                ellipsis: true,
                                render: (ns) => <span style={{ fontFamily: 'monospace', fontSize: 11.5 }}>{ns}</span>,
                            },
                            {
                                title: '扫描 / 返回比',
                                width: 170,
                                render: (_, r) => (
                                    <span style={{ fontSize: 11, fontFamily: 'monospace' }}>
                                        扫描 {r.docsExamined} / 索引 {r.keysExamined} / 返回 {r.nreturned}
                                    </span>
                                ),
                            },
                            {
                                title: '客户端',
                                dataIndex: 'client',
                                width: 130,
                                ellipsis: true,
                                render: (cl) => <span style={{ fontSize: 11 }}>{cl}</span>,
                            },
                            {
                                title: '命令摘要',
                                dataIndex: 'commandSummary',
                                ellipsis: true,
                                render: (cmd, r) => (
                                    <span
                                        style={{ fontFamily: 'monospace', fontSize: 11, cursor: 'pointer', color: 'var(--accent)' }}
                                        onClick={() =>
                                            setCmdDetailModal({
                                                open: true,
                                                title: `慢查询详情 (${r.ns} - ${r.millis}ms)`,
                                                json: r.cmdStr || r.raw,
                                            })
                                        }
                                    >
                                        {cmd}
                                    </span>
                                ),
                            },
                            {
                                title: '操作',
                                width: 80,
                                align: 'center',
                                render: (_, r) => (
                                    <Tooltip title="复制命令 JSON">
                                        <Button
                                            size="small"
                                            type="text"
                                            icon={<Copy size={12} />}
                                            onClick={() => copyTextToClipboard(r.cmdStr || r.raw, '已复制慢查询命令')}
                                        />
                                    </Tooltip>
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

            {/* 慢查询详情弹窗 */}
            <Modal
                title={cmdDetailModal?.title || '慢查询详情'}
                open={Boolean(cmdDetailModal?.open)}
                onCancel={() => setCmdDetailModal(null)}
                footer={[
                    <Button
                        key="copy"
                        icon={<Copy size={12} />}
                        onClick={() => {
                            if (cmdDetailModal) {
                                copyTextToClipboard(cmdDetailModal.json, '已复制完整命令')
                            }
                        }}
                    >
                        复制 JSON
                    </Button>,
                    <Button key="close" type="primary" onClick={() => setCmdDetailModal(null)}>
                        关闭
                    </Button>,
                ]}
                width={650}
            >
                <div style={{ maxHeight: 420, overflow: 'auto', background: 'var(--bg-2, #181a1f)', padding: 12, borderRadius: 6, margin: '10px 0' }}>
                    <pre style={{ margin: 0, fontSize: 12, fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                        {cmdDetailModal?.json}
                    </pre>
                </div>
            </Modal>

            {/* 配置 Profiler 弹窗 */}
            <Modal
                title={`配置数据库 [${profilerDb}] Profiler`}
                open={profilerModalOpen}
                onCancel={() => !savingProfiler && setProfilerModalOpen(false)}
                onOk={handleSaveProfiler}
                confirmLoading={savingProfiler}
                okText="保存配置"
                cancelText="取消"
                width={480}
            >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '10px 0' }}>
                    <div>
                        <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 8 }}>分析日志级别 (Profiling Level)：</div>
                        <Radio.Group
                            value={editLevel}
                            onChange={(e) => setEditLevel(e.target.value)}
                            style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
                        >
                            <Radio value={0}>
                                <div>
                                    <span style={{ fontWeight: 600 }}>Level 0 - 关闭</span>
                                    <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>不收集任何查询日志，零性能损耗</div>
                                </div>
                            </Radio>
                            <Radio value={1}>
                                <div>
                                    <span style={{ fontWeight: 600 }}>Level 1 - 仅慢查询 (推荐)</span>
                                    <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>仅记录耗时超过阈值的操作到 system.profile</div>
                                </div>
                            </Radio>
                            <Radio value={2}>
                                <div>
                                    <span style={{ fontWeight: 600 }}>Level 2 - 全量收集 (调试)</span>
                                    <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>记录库内所有读写操作，会产生一定 I/O 写入开销</div>
                                </div>
                            </Radio>
                        </Radio.Group>
                    </div>

                    {editLevel > 0 && (
                        <div>
                            <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 6 }}>慢查询耗时阈值 (slowms)：</div>
                            <Space size={8}>
                                <InputNumber
                                    min={1}
                                    max={60000}
                                    value={editSlowMs}
                                    onChange={(v) => setEditSlowMs(v || 100)}
                                    addonAfter="ms"
                                    style={{ width: 140 }}
                                />
                                <span style={{ fontSize: 11.5, color: 'var(--text-dim)' }}>默认 100ms</span>
                            </Space>
                        </div>
                    )}

                    <Alert
                        type="info"
                        showIcon
                        message="提示：MongoDB 的 system.profile 是一个固定集合 (Capped Collection)，不会无限增长，重启或手动调用即可重置。"
                    />
                </div>
            </Modal>
        </div>
    )
}
