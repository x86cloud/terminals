import { useState, useEffect, useMemo } from 'react'
import { Select, Button, Segmented, Space, Badge, Tag, Tooltip, Input, Modal, App } from 'antd'
import {
    Activity,
    Zap,
    Clock,
    Database,
    Lock,
    ArrowUpDown,
    RotateCw,
    Search,
    Check,
    Copy,
    Power,
    Sliders,
    AlertTriangle,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import StatusCard from '@/pages/mysql/StatusCard'
import { formatSize, errorMessage } from '@/utils'
import { API } from '@/api'
import { useSession } from '@/contexts/SessionContext'
import my from './StatusPanel.module.less'

interface Props {
    sessionId?: string
    status: Record<string, any>
    variables: Record<string, any>
    processList: Record<string, any>[]
    slowLog: Record<string, any>[]
    busy: boolean
    onRefresh: () => void
}

function formatUptime(seconds: number, t: (k: string, opt?: any) => string): string {
    if (!seconds || isNaN(seconds)) return '-'
    const d = Math.floor(seconds / 86400)
    const h = Math.floor((seconds % 86400) / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = Math.floor(seconds % 60)
    if (d > 0) return `${t('db:mysql.status.time.days', { d })}${t('db:mysql.status.time.hours', { h })}${t('db:mysql.status.time.minutes', { m })}`
    if (h > 0) return `${t('db:mysql.status.time.hours', { h })}${t('db:mysql.status.time.minutes', { m })}${t('db:mysql.status.time.seconds', { s })}`
    return `${t('db:mysql.status.time.minutes', { m })}${t('db:mysql.status.time.seconds', { s })}`
}

export default function StatusPanel({
    sessionId,
    status,
    variables,
    processList,
    slowLog,
    busy,
    onRefresh,
}: Props) {
    const { t } = useTranslation(['db', 'common'])
    const { message } = App.useApp()
    const { activeTarget } = useSession()
    const isActive = !sessionId || (activeTarget?.kind === 'mysql' && activeTarget.id === sessionId)

    const [subTab, setSubTab] = useState<'process' | 'slow' | 'variables'>('process')
    const [autoRefreshSec, setAutoRefreshSec] = useState<number>(0)
    const [procSearch, setProcSearch] = useState('')
    const [procFilter, setProcFilter] = useState<'all' | 'query' | 'sleep'>('all')
    const [slowSearch, setSlowSearch] = useState('')
    const [varSearch, setVarSearch] = useState('')
    const [varCategory, setVarCategory] = useState<'core' | 'conn' | 'innodb' | 'log' | 'charset' | 'all'>('core')
    const [copiedKey, setCopiedKey] = useState<string | null>(null)
    const [killingId, setKillingId] = useState<string | null>(null)

    // 定时自动刷新
    useEffect(() => {
        if (autoRefreshSec <= 0 || !isActive) return
        const timer = setInterval(() => {
            if (!busy) onRefresh()
        }, autoRefreshSec * 1000)
        return () => clearInterval(timer)
    }, [autoRefreshSec, busy, onRefresh, isActive])

    const copyText = async (key: string, text: string) => {
        try {
            await navigator.clipboard.writeText(text)
            setCopiedKey(key)
            setTimeout(() => setCopiedKey(null), 1500)
        } catch {
            /* ignore */
        }
    }

    const killProcess = (id: any) => {
        if (!sessionId) return
        const pid = String(id)
        Modal.confirm({
            title: t('db:mysql.status.process.killTitle'),
            content: t('db:mysql.status.process.killConfirm', { id: pid }),
            okText: t('db:mysql.status.process.killOk'),
            okType: 'danger',
            cancelText: t('common:cancel'),
            onOk: async () => {
                setKillingId(pid)
                try {
                    await API.mysqlRun(sessionId, '', `KILL ${pid}`)
                    message.success(t('db:mysql.status.process.killSuccess', { id: pid }))
                    onRefresh()
                } catch (e) {
                    message.error(t('db:mysql.status.process.killFailed', { error: errorMessage(e) }))
                } finally {
                    setKillingId(null)
                }
            },
        })
    }

    // ---------------- 性能指标计算 ----------------
    const uptimeSec = Number(status['Uptime'] || 0)
    const threadsConnected = Number(status['Threads_connected'] || 0)
    const maxConnections = Number(variables['max_connections'] || 151)
    const connProgress = maxConnections > 0 ? (threadsConnected / maxConnections) * 100 : 0
    const threadsRunning = Number(status['Threads_running'] || 0)

    const questions = Number(status['Questions'] || 0)
    const qps = uptimeSec > 0 ? (questions / uptimeSec).toFixed(1) : '0.0'

    const slowQueries = Number(status['Slow_queries'] || 0)
    const longQueryTime = variables['long_query_time'] || '10'

    const bufferPoolReadReq = Number(status['Innodb_buffer_pool_read_requests'] || 0)
    const bufferPoolReads = Number(status['Innodb_buffer_pool_reads'] || 0)
    const bufferHitRate = bufferPoolReadReq > 0
        ? ((1 - bufferPoolReads / bufferPoolReadReq) * 100).toFixed(2)
        : '100.00'
    const bufferPoolSize = formatSize(Number(variables['innodb_buffer_pool_size'] || 0))

    const tableLocksWaited = Number(status['Table_locks_waited'] || 0)
    const tableLocksImmediate = Number(status['Table_locks_immediate'] || 0)

    const bytesRecv = Number(status['Bytes_received'] || 0)
    const bytesSent = Number(status['Bytes_sent'] || 0)

    // ---------------- 筛选进程列表 ----------------
    const filteredProcessList = useMemo(() => {
        return processList.filter((p) => {
            const cmd = String(p['Command'] || '')
            if (procFilter === 'query' && cmd.toLowerCase() !== 'query') return false
            if (procFilter === 'sleep' && cmd.toLowerCase() !== 'sleep') return false

            if (!procSearch) return true
            const q = procSearch.toLowerCase()
            return (
                String(p['Id'] || '').includes(q) ||
                String(p['User'] || '').toLowerCase().includes(q) ||
                String(p['Host'] || '').toLowerCase().includes(q) ||
                String(p['db'] || '').toLowerCase().includes(q) ||
                String(p['Command'] || '').toLowerCase().includes(q) ||
                String(p['State'] || '').toLowerCase().includes(q) ||
                String(p['Info'] || '').toLowerCase().includes(q)
            )
        })
    }, [processList, procFilter, procSearch])

    const runningProcCount = useMemo(
        () => processList.filter((p) => String(p['Command'] || '').toLowerCase() === 'query').length,
        [processList]
    )

    // ---------------- 筛选慢日志 ----------------
    const filteredSlowLog = useMemo(() => {
        if (!slowSearch) return slowLog
        const q = slowSearch.toLowerCase()
        return slowLog.filter(
            (s) =>
                String(s['sql_text'] || '').toLowerCase().includes(q) ||
                String(s['user_host'] || '').toLowerCase().includes(q) ||
                String(s['start_time'] || '').toLowerCase().includes(q)
        )
    }, [slowLog, slowSearch])

    // ---------------- 筛选变量 ----------------
    const filteredVariables = useMemo(() => {
        const entries = Object.entries(variables)
        return entries.filter(([k, v]) => {
            const keyLower = k.toLowerCase()
            if (varCategory === 'core') {
                const isCore = /(max_connections|character_set_server|version|datadir|port|innodb_buffer_pool_size|slow_query_log|long_query_time|wait_timeout|max_allowed_packet|open_files_limit)/i.test(k)
                if (!isCore) return false
            } else if (varCategory === 'conn') {
                const isConn = /(max_connections|max_user_connections|thread_cache_size|wait_timeout|interactive_timeout|connect_timeout|net_read_timeout|net_write_timeout|max_connect_errors)/i.test(k)
                if (!isConn) return false
            } else if (varCategory === 'innodb') {
                const isInno = /(innodb_buffer_pool|innodb_log|innodb_flush|innodb_file_per_table|innodb_lock_wait|innodb_io_capacity|innodb_read_io_threads)/i.test(k)
                if (!isInno) return false
            } else if (varCategory === 'log') {
                const isLog = /(slow_query|general_log|log_error|binlog|sync_binlog|expire_logs|log_output)/i.test(k)
                if (!isLog) return false
            } else if (varCategory === 'charset') {
                const isChar = /(character_set|collation|time_zone)/i.test(k)
                if (!isChar) return false
            }

            if (!varSearch) return true
            const q = varSearch.toLowerCase()
            return keyLower.includes(q) || String(v).toLowerCase().includes(q)
        })
    }, [variables, varCategory, varSearch])

    return (
        <div className={my.mgmtWrap}>
            {/* 顶栏操作区 */}
            <div className={my.mgmtHead}>
                <div className={my.headLeft}>
                    <div className={my.headTitle}>
                        <span>{t('db:mysql.status.title')}</span>
                    </div>
                    {variables['version'] && (
                        <span className={my.versionTag}>MySQL {variables['version']}</span>
                    )}
                    {uptimeSec > 0 && (
                        <span className={my.uptimeTag} title={t('db:mysql.status.uptimeHover', { time: formatUptime(uptimeSec, t) })}>
                            {t('db:mysql.status.uptime', { time: formatUptime(uptimeSec, t) })}
                        </span>
                    )}
                </div>

                <div className={my.headRight} style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <div className={my.autoRefreshWrap} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <span className={my.autoRefreshLabel} style={{ fontSize: 12 }}>{t('db:mysql.status.autoRefresh')}</span>
                        <Select
                            size="small"
                            style={{ width: 85 }}
                            value={autoRefreshSec}
                            onChange={(val) => setAutoRefreshSec(val)}
                            options={[
                                { value: 0, label: t('db:mysql.status.close') },
                                { value: 5, label: '5s' },
                                { value: 10, label: '10s' },
                                { value: 30, label: '30s' },
                                { value: 60, label: '60s' },
                            ]}
                        />
                    </div>

                    <Button
                        size="small"
                        icon={<RotateCw size={12} className={busy ? my.spin : ''} />}
                        onClick={onRefresh}
                        disabled={busy}
                        title={t('db:mysql.status.refreshTooltip')}
                    >
                        {t('db:mysql.status.refreshBtn')}
                    </Button>
                </div>
            </div>

            <div className={my.scrollArea}>
                {/* 顶部核心指标看板 */}
                <div className={my.statusGrid}>
                    <StatusCard
                        title={t('db:mysql.status.cards.connections')}
                        icon={<Activity size={16} />}
                        value={`${threadsConnected} / ${maxConnections}`}
                        subValue={t('db:mysql.status.cards.executingQuery', { count: threadsRunning })}
                        progress={connProgress}
                        variant={connProgress > 80 ? 'danger' : connProgress > 50 ? 'warning' : 'accent'}
                    />

                    <StatusCard
                        title={t('db:mysql.status.cards.totalQueries')}
                        icon={<Zap size={16} />}
                        value={questions.toLocaleString()}
                        subValue={t('db:mysql.status.cards.realtimeQps', { qps })}
                        variant="default"
                    />

                    <StatusCard
                        title={t('db:mysql.status.cards.slowQueries')}
                        icon={<Clock size={16} />}
                        value={slowQueries}
                        subValue={t('db:mysql.status.cards.threshold', { time: longQueryTime, log: variables['slow_query_log'] || 'OFF' })}
                        variant={slowQueries > 0 ? 'warning' : 'default'}
                    />

                    <StatusCard
                        title={t('db:mysql.status.cards.innodbBuffer')}
                        icon={<Database size={16} />}
                        value={`${bufferHitRate}%`}
                        subValue={t('db:mysql.status.cards.bufferCapacity', { size: bufferPoolSize })}
                        variant="success"
                    />

                    <StatusCard
                        title={t('db:mysql.status.cards.tableLocks')}
                        icon={<Lock size={16} />}
                        value={tableLocksWaited}
                        subValue={t('db:mysql.status.cards.immediateLocks', { count: tableLocksImmediate })}
                        variant={tableLocksWaited > 0 ? 'warning' : 'default'}
                    />

                    <StatusCard
                        title={t('db:mysql.status.cards.networkThroughput')}
                        icon={<ArrowUpDown size={16} />}
                        value={`↓ ${formatSize(bytesRecv)}`}
                        subValue={t('db:mysql.status.cards.sent', { size: formatSize(bytesSent) })}
                        variant="default"
                    />
                </div>

                {/* 下半部分：功能子选项卡 */}
                <div className={my.subTabsSection}>
                    <div className={my.subTabsHeader} style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>
                        <Segmented
                            value={subTab}
                            onChange={(v) => setSubTab(v as any)}
                            options={[
                                {
                                    label: (
                                        <Space size={6}>
                                            <Zap size={13} style={{ verticalAlign: -2 }} />
                                            <span>{t('db:mysql.status.subTabs.process')}</span>
                                            <Badge count={processList.length} color="#1677ff" overflowCount={999} style={{ transform: 'scale(0.85)' }} />
                                        </Space>
                                    ),
                                    value: 'process',
                                },
                                {
                                    label: (
                                        <Space size={6}>
                                            <Clock size={13} style={{ verticalAlign: -2 }} />
                                            <span>{t('db:mysql.status.subTabs.slow')}</span>
                                            <Badge count={slowLog.length} color="#fa8c16" overflowCount={999} style={{ transform: 'scale(0.85)' }} />
                                        </Space>
                                    ),
                                    value: 'slow',
                                },
                                {
                                    label: (
                                        <Space size={6}>
                                            <Sliders size={13} style={{ verticalAlign: -2 }} />
                                            <span>{t('db:mysql.status.subTabs.variables')}</span>
                                            <Badge count={filteredVariables.length} color="#52c41a" overflowCount={999} style={{ transform: 'scale(0.85)' }} />
                                        </Space>
                                    ),
                                    value: 'variables',
                                },
                            ]}
                        />
                    </div>

                    <div className={my.subTabBody}>
                        {/* Tab 1: 会话与进程 */}
                        {subTab === 'process' && (
                            <div className={my.sectionContent}>
                                <div className={my.sectionToolbar} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', gap: 10 }}>
                                    <Segmented
                                        size="small"
                                        value={procFilter}
                                        onChange={(v) => setProcFilter(v as any)}
                                        options={[
                                            { label: t('db:mysql.status.process.filterAll', { count: processList.length }), value: 'all' },
                                            { label: t('db:mysql.status.process.filterQuery', { count: runningProcCount }), value: 'query' },
                                            { label: t('db:mysql.status.process.filterSleep', { count: processList.length - runningProcCount }), value: 'sleep' },
                                        ]}
                                    />

                                    <Input
                                        size="small"
                                        style={{ maxWidth: 300 }}
                                        prefix={<Search size={12} style={{ color: 'var(--text-dim)' }} />}
                                        value={procSearch}
                                        placeholder={t('db:mysql.status.process.searchPlaceholder')}
                                        allowClear
                                        onChange={(e) => setProcSearch(e.target.value)}
                                    />
                                </div>

                                {filteredProcessList.length === 0 ? (
                                    <div className={my.emptyBox}>{t('db:mysql.status.process.empty')}</div>
                                ) : (
                                    <div className={my.tableResponsive}>
                                        <table className={my.dataTable}>
                                            <thead>
                                                <tr>
                                                    <th style={{ width: 70 }}>{t('db:mysql.status.process.thId')}</th>
                                                    <th style={{ width: 140 }}>{t('db:mysql.status.process.thUserHost')}</th>
                                                    <th style={{ width: 110 }}>{t('db:mysql.status.process.thDb')}</th>
                                                    <th style={{ width: 90 }}>{t('db:mysql.status.process.thCommand')}</th>
                                                    <th style={{ width: 80 }}>{t('db:mysql.status.process.thTime')}</th>
                                                    <th style={{ width: 120 }}>{t('db:mysql.status.process.thState')}</th>
                                                    <th>{t('db:mysql.status.process.thSql')}</th>
                                                    <th style={{ width: 70, textAlign: 'center' }}>{t('db:mysql.status.process.thAction')}</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {filteredProcessList.map((p) => {
                                                    const pid = String(p['Id'] || '')
                                                    const cmd = String(p['Command'] || '')
                                                    const time = Number(p['Time'] || 0)
                                                    const isQuery = cmd.toLowerCase() === 'query'
                                                    const isLongQuery = isQuery && time > 3
                                                    const sqlInfo = p['Info'] ? String(p['Info']) : ''

                                                    return (
                                                        <tr key={pid}>
                                                            <td>
                                                                <Tag color="geekblue">{pid}</Tag>
                                                            </td>
                                                            <td>
                                                                <div className={my.userHostWrap}>
                                                                    <span className={my.procUser}>{p['User'] || '-'}</span>
                                                                    <span className={my.procHost}>@{p['Host'] || '-'}</span>
                                                                </div>
                                                            </td>
                                                            <td>
                                                                <Tag>{p['db'] || '-'}</Tag>
                                                            </td>
                                                            <td>
                                                                <Tag color={isQuery ? 'processing' : cmd.toLowerCase() === 'sleep' ? 'default' : 'purple'}>
                                                                    {cmd}
                                                                </Tag>
                                                            </td>
                                                            <td>
                                                                <Tag color={isLongQuery ? 'error' : 'default'}>
                                                                    {time}s
                                                                </Tag>
                                                            </td>
                                                            <td>
                                                                <span className={my.stateText} title={String(p['State'] || '')}>
                                                                    {p['State'] || '-'}
                                                                </span>
                                                            </td>
                                                            <td>
                                                                {sqlInfo ? (
                                                                    <div className={my.sqlSnippetWrap}>
                                                                        <code className={my.sqlSnippet} title={sqlInfo}>
                                                                            {sqlInfo}
                                                                        </code>
                                                                        <Tooltip title={t('db:mysql.status.process.copySql')}>
                                                                            <Button
                                                                                size="small"
                                                                                type="text"
                                                                                icon={copiedKey === `proc-${pid}` ? <Check size={12} /> : <Copy size={12} />}
                                                                                onClick={() => copyText(`proc-${pid}`, sqlInfo)}
                                                                            />
                                                                        </Tooltip>
                                                                    </div>
                                                                ) : (
                                                                    <span className={my.nullText}>-</span>
                                                                )}
                                                            </td>
                                                            <td style={{ textAlign: 'center' }}>
                                                                <Tooltip title={t('db:mysql.status.process.killTooltip', { id: pid })}>
                                                                    <Button
                                                                        size="small"
                                                                        danger
                                                                        icon={<Power size={11} />}
                                                                        loading={killingId === pid}
                                                                        disabled={!sessionId}
                                                                        onClick={() => killProcess(pid)}
                                                                    >
                                                                        KILL
                                                                    </Button>
                                                                </Tooltip>
                                                            </td>
                                                        </tr>
                                                    )
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Tab 2: 慢查询日志 */}
                        {subTab === 'slow' && (
                            <div className={my.sectionContent}>
                                <div className={my.sectionToolbar} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px' }}>
                                    <Input
                                        size="small"
                                        style={{ maxWidth: 300 }}
                                        prefix={<Search size={12} style={{ color: 'var(--text-dim)' }} />}
                                        value={slowSearch}
                                        placeholder={t('db:mysql.status.slow.searchPlaceholder')}
                                        allowClear
                                        onChange={(e) => setSlowSearch(e.target.value)}
                                    />

                                    <div className={my.slowHint} style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                                        <span>{t('db:mysql.status.slow.threshold', { time: longQueryTime })}</span>
                                        <span style={{ marginLeft: 10 }}>{t('db:mysql.status.slow.status')} <Tag color={variables['slow_query_log'] === 'ON' ? 'green' : 'default'}>{variables['slow_query_log'] || 'OFF'}</Tag></span>
                                    </div>
                                </div>

                                {filteredSlowLog.length === 0 ? (
                                    <div className={my.slowEmptyGuide}>
                                        <AlertTriangle size={32} />
                                        <div className={my.emptyGuideTitle}>{t('db:mysql.status.slow.emptyTitle')}</div>
                                        <div className={my.emptyGuideSub}>
                                            {t('db:mysql.status.slow.emptySub')}
                                            <pre>
                                                SET GLOBAL slow_query_log = 'ON';{'\n'}
                                                SET GLOBAL long_query_time = 1;{'\n'}
                                                SET GLOBAL log_output = 'TABLE';
                                            </pre>
                                        </div>
                                    </div>
                                ) : (
                                    <div className={my.slowLogList}>
                                        {filteredSlowLog.map((s, idx) => {
                                            const sqlText = String(s['sql_text'] || '')
                                            const key = `slow-${idx}`
                                            return (
                                                <div key={idx} className={my.slowLogCard}>
                                                    <div className={my.slowLogHead}>
                                                        <div className={my.slowLogMeta}>
                                                            <span className={my.slowIdx}>#{idx + 1}</span>
                                                            <span className={my.slowTime}>{s['start_time']}</span>
                                                            <span className={my.slowUserHost}>{s['user_host']}</span>
                                                        </div>
                                                        <div className={my.slowMetrics}>
                                                            <Tag color="warning">
                                                                {t('db:mysql.status.slow.cost', { time: s['query_time'] })}
                                                            </Tag>
                                                            <Tag>
                                                                {t('db:mysql.status.slow.lock', { time: s['lock_time'] })}
                                                            </Tag>
                                                            <Tag>
                                                                {t('db:mysql.status.slow.scan', { count: s['rows_examined'] })}
                                                            </Tag>
                                                            <Button
                                                                size="small"
                                                                icon={copiedKey === key ? <Check size={12} /> : <Copy size={12} />}
                                                                onClick={() => copyText(key, sqlText)}
                                                            >
                                                                {copiedKey === key ? t('db:mysql.status.slow.copied') : t('db:mysql.status.slow.copy')}
                                                            </Button>
                                                        </div>
                                                    </div>
                                                    <pre className={my.slowSqlPre}>{sqlText}</pre>
                                                </div>
                                            )
                                        })}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Tab 3: 系统变量 */}
                        {subTab === 'variables' && (
                            <div className={my.sectionContent}>
                                <div className={my.sectionToolbar} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', gap: 10 }}>
                                    <Segmented
                                        size="small"
                                        value={varCategory}
                                        onChange={(v) => setVarCategory(v as any)}
                                        options={[
                                            { label: t('db:mysql.status.vars.catCore'), value: 'core' },
                                            { label: t('db:mysql.status.vars.catConn'), value: 'conn' },
                                            { label: t('db:mysql.status.vars.catInnodb'), value: 'innodb' },
                                            { label: t('db:mysql.status.vars.catLog'), value: 'log' },
                                            { label: t('db:mysql.status.vars.catCharset'), value: 'charset' },
                                            { label: t('db:mysql.status.vars.catAll', { count: Object.keys(variables).length }), value: 'all' },
                                        ]}
                                    />

                                    <Input
                                        size="small"
                                        style={{ maxWidth: 280 }}
                                        prefix={<Search size={12} style={{ color: 'var(--text-dim)' }} />}
                                        value={varSearch}
                                        placeholder={t('db:mysql.status.vars.searchPlaceholder')}
                                        allowClear
                                        onChange={(e) => setVarSearch(e.target.value)}
                                    />
                                </div>

                                {filteredVariables.length === 0 ? (
                                    <div className={my.emptyBox}>{t('db:mysql.status.vars.empty')}</div>
                                ) : (
                                    <div className={my.tableResponsive}>
                                        <table className={my.dataTable}>
                                            <thead>
                                                <tr>
                                                    <th style={{ width: 280 }}>{t('db:mysql.status.vars.thName')}</th>
                                                    <th>{t('db:mysql.status.vars.thValue')}</th>
                                                    <th style={{ width: 60, textAlign: 'center' }}>{t('db:mysql.status.vars.thAction')}</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {filteredVariables.map(([k, v]) => {
                                                    const valStr = String(v ?? '')
                                                    return (
                                                        <tr key={k}>
                                                            <td>
                                                                <span className={my.varName}>{k}</span>
                                                            </td>
                                                            <td>
                                                                <span className={my.varValue}>{valStr || t('db:mysql.status.vars.emptyVal')}</span>
                                                            </td>
                                                            <td style={{ textAlign: 'center' }}>
                                                                <Tooltip title={t('db:mysql.status.vars.copyValue')}>
                                                                    <Button
                                                                        size="small"
                                                                        type="text"
                                                                        icon={copiedKey === `var-${k}` ? <Check size={12} /> : <Copy size={12} />}
                                                                        onClick={() => copyText(`var-${k}`, valStr)}
                                                                    />
                                                                </Tooltip>
                                                            </td>
                                                        </tr>
                                                    )
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
