import React, { useState, useEffect, useMemo, useCallback } from 'react'
import {
    Activity,
    Zap,
    Clock,
    Database,
    Lock,
    ArrowUpDown,
    RotateCw,
    Search,
    X,
    Check,
    Copy,
    Power,
    Sliders,
    Layers,
    Info,
    AlertTriangle,
    Shield,
    Server
} from 'lucide-react'
import StatusCard from '@/pages/mysql/StatusCard'
import { formatSize, errorMessage } from '@/utils'
import { API } from '@/api'
import g from '@/styles/global.module.less'
import my from './StatusPanel.module.less'

interface Props {
    sessionId?: string
    status: Record<string, any>
    variables: Record<string, any>
    processList: Record<string, any>[]
    slowLog: Record<string, any>[]
    busy: boolean
    onRefresh: () => void
    onNotify?: (msg: string, kind?: 'info' | 'error') => void
}

function formatUptime(seconds: number): string {
    if (!seconds || isNaN(seconds)) return '-'
    const d = Math.floor(seconds / 86400)
    const h = Math.floor((seconds % 86400) / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = Math.floor(seconds % 60)
    if (d > 0) return `${d}天 ${h}小时 ${m}分`
    if (h > 0) return `${h}小时 ${m}分 ${s}秒`
    return `${m}分 ${s}秒`
}

export default function StatusPanel({
    sessionId,
    status,
    variables,
    processList,
    slowLog,
    busy,
    onRefresh,
    onNotify,
}: Props) {
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
        if (autoRefreshSec <= 0) return
        const timer = setInterval(() => {
            if (!busy) onRefresh()
        }, autoRefreshSec * 1000)
        return () => clearInterval(timer)
    }, [autoRefreshSec, busy, onRefresh])

    const copyText = async (key: string, text: string) => {
        try {
            await navigator.clipboard.writeText(text)
            setCopiedKey(key)
            setTimeout(() => setCopiedKey(null), 1500)
        } catch {
            /* ignore */
        }
    }

    const killProcess = async (id: any) => {
        if (!sessionId) return
        const pid = String(id)
        if (!window.confirm(`确定要终止会话线程 #${pid} 吗？`)) return
        setKillingId(pid)
        try {
            await API.mysqlRun(sessionId, '', `KILL ${pid}`)
            onNotify?.(`已终止进程 #${pid}`)
            onRefresh()
        } catch (e) {
            onNotify?.(`终止进程失败: ${errorMessage(e)}`, 'error')
        } finally {
            setKillingId(null)
        }
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
                        <span>MySQL 状态监控与性能分析</span>
                    </div>
                    {variables['version'] && (
                        <span className={my.versionTag}>MySQL {variables['version']}</span>
                    )}
                    {uptimeSec > 0 && (
                        <span className={my.uptimeTag} title={`运行时间：${formatUptime(uptimeSec)}`}>
                            运行 {formatUptime(uptimeSec)}
                        </span>
                    )}
                </div>

                <div className={my.headRight}>
                    <div className={my.autoRefreshWrap}>
                        <span className={my.autoRefreshLabel}>自动刷新:</span>
                        <select
                            className={my.autoRefreshSelect}
                            value={autoRefreshSec}
                            onChange={(e) => setAutoRefreshSec(Number(e.target.value))}
                        >
                            <option value={0}>关闭</option>
                            <option value={5}>5 秒</option>
                            <option value={10}>10 秒</option>
                            <option value={30}>30 秒</option>
                            <option value={60}>60 秒</option>
                        </select>
                    </div>

                    <button
                        className={`${g.btn} ${g.xs}`}
                        onClick={onRefresh}
                        disabled={busy}
                        title="立即刷新监控指标"
                    >
                        <RotateCw size={12} className={busy ? my.spin : ''} />
                        <span>{busy ? '刷新中…' : '刷新'}</span>
                    </button>
                </div>
            </div>

            <div className={my.scrollArea}>
                {/* 顶部核心指标看板 */}
                <div className={my.statusGrid}>
                    <StatusCard
                        title="当前连接数"
                        icon={<Activity size={16} />}
                        value={`${threadsConnected} / ${maxConnections}`}
                        subValue={`正在执行查询: ${threadsRunning}`}
                        progress={connProgress}
                        variant={connProgress > 80 ? 'danger' : connProgress > 50 ? 'warning' : 'accent'}
                    />

                    <StatusCard
                        title="总查询量 / QPS"
                        icon={<Zap size={16} />}
                        value={questions.toLocaleString()}
                        subValue={`实时 QPS: ${qps} 次/秒`}
                        variant="default"
                    />

                    <StatusCard
                        title="慢查询累计"
                        icon={<Clock size={16} />}
                        value={slowQueries}
                        subValue={`阈值: ${longQueryTime}s (日志: ${variables['slow_query_log'] || 'OFF'})`}
                        variant={slowQueries > 0 ? 'warning' : 'default'}
                    />

                    <StatusCard
                        title="InnoDB 缓冲池"
                        icon={<Database size={16} />}
                        value={`${bufferHitRate}%`}
                        subValue={`总容量: ${bufferPoolSize} (命中率)`}
                        variant="success"
                    />

                    <StatusCard
                        title="表锁与争用"
                        icon={<Lock size={16} />}
                        value={tableLocksWaited}
                        subValue={`即时锁: ${tableLocksImmediate.toLocaleString()}`}
                        variant={tableLocksWaited > 0 ? 'warning' : 'default'}
                    />

                    <StatusCard
                        title="网络总吞吐"
                        icon={<ArrowUpDown size={16} />}
                        value={`↓ ${formatSize(bytesRecv)}`}
                        subValue={`↑ 发送: ${formatSize(bytesSent)}`}
                        variant="default"
                    />
                </div>

                {/* 下半部分：功能子选项卡 */}
                <div className={my.subTabsSection}>
                    <div className={my.subTabsHeader}>
                        <div className={my.subTabs}>
                            <button
                                className={`${my.subTabBtn}${subTab === 'process' ? ' ' + my.active : ''}`}
                                onClick={() => setSubTab('process')}
                            >
                                <Zap size={14} />
                                <span>会话与进程</span>
                                <span className={my.tabBadge}>{processList.length}</span>
                            </button>

                            <button
                                className={`${my.subTabBtn}${subTab === 'slow' ? ' ' + my.active : ''}`}
                                onClick={() => setSubTab('slow')}
                            >
                                <Clock size={14} />
                                <span>慢查询日志</span>
                                <span className={my.tabBadge}>{slowLog.length}</span>
                            </button>

                            <button
                                className={`${my.subTabBtn}${subTab === 'variables' ? ' ' + my.active : ''}`}
                                onClick={() => setSubTab('variables')}
                            >
                                <Sliders size={14} />
                                <span>系统变量</span>
                                <span className={my.tabBadge}>{filteredVariables.length}</span>
                            </button>
                        </div>
                    </div>

                    <div className={my.subTabBody}>
                        {/* Tab 1: 会话与进程 */}
                        {subTab === 'process' && (
                            <div className={my.sectionContent}>
                                <div className={my.sectionToolbar}>
                                    <div className={my.pillFilterGroup}>
                                        <button
                                            className={`${my.pillBtn}${procFilter === 'all' ? ' ' + my.active : ''}`}
                                            onClick={() => setProcFilter('all')}
                                        >
                                            全部 ({processList.length})
                                        </button>
                                        <button
                                            className={`${my.pillBtn}${procFilter === 'query' ? ' ' + my.active : ''}`}
                                            onClick={() => setProcFilter('query')}
                                        >
                                            执行中 Query ({runningProcCount})
                                        </button>
                                        <button
                                            className={`${my.pillBtn}${procFilter === 'sleep' ? ' ' + my.active : ''}`}
                                            onClick={() => setProcFilter('sleep')}
                                        >
                                            空闲 Sleep ({processList.length - runningProcCount})
                                        </button>
                                    </div>

                                    <div className={my.searchBox}>
                                        <Search size={13} />
                                        <input
                                            value={procSearch}
                                            placeholder="搜索用户 / 库名 / 指令 / SQL..."
                                            onChange={(e) => setProcSearch(e.target.value)}
                                        />
                                        {procSearch && (
                                            <button className={g.iconBtn} onClick={() => setProcSearch('')} title="清空">
                                                <X size={12} />
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {filteredProcessList.length === 0 ? (
                                    <div className={my.emptyBox}>未找到匹配的会话进程</div>
                                ) : (
                                    <div className={my.tableResponsive}>
                                        <table className={my.dataTable}>
                                            <thead>
                                                <tr>
                                                    <th style={{ width: 70 }}>ID</th>
                                                    <th style={{ width: 140 }}>用户 @ 主机</th>
                                                    <th style={{ width: 110 }}>数据库</th>
                                                    <th style={{ width: 90 }}>指令</th>
                                                    <th style={{ width: 80 }}>耗时 (s)</th>
                                                    <th style={{ width: 120 }}>状态</th>
                                                    <th>执行 SQL / 详情</th>
                                                    <th style={{ width: 70, textAlign: 'center' }}>操作</th>
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
                                                                <span className={my.idBadge}>{pid}</span>
                                                            </td>
                                                            <td>
                                                                <div className={my.userHostWrap}>
                                                                    <span className={my.procUser}>{p['User'] || '-'}</span>
                                                                    <span className={my.procHost}>@{p['Host'] || '-'}</span>
                                                                </div>
                                                            </td>
                                                            <td>
                                                                <span className={my.dbBadge}>{p['db'] || '(无)'}</span>
                                                            </td>
                                                            <td>
                                                                <span className={`${my.cmdBadge} ${isQuery ? my.queryCmd : cmd.toLowerCase() === 'sleep' ? my.sleepCmd : ''}`}>
                                                                    {cmd}
                                                                </span>
                                                            </td>
                                                            <td>
                                                                <span className={`${my.timeBadge} ${isLongQuery ? my.dangerTime : ''}`}>
                                                                    {time}s
                                                                </span>
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
                                                                        <button
                                                                            className={g.iconBtn}
                                                                            onClick={() => copyText(`proc-${pid}`, sqlInfo)}
                                                                            title="复制 SQL 语句"
                                                                        >
                                                                            {copiedKey === `proc-${pid}` ? <Check size={12} /> : <Copy size={12} />}
                                                                        </button>
                                                                    </div>
                                                                ) : (
                                                                    <span className={my.nullText}>-</span>
                                                                )}
                                                            </td>
                                                            <td style={{ textAlign: 'center' }}>
                                                                <button
                                                                    className={`${g.btn} ${g.xs} ${g.danger}`}
                                                                    disabled={killingId === pid || !sessionId}
                                                                    onClick={() => killProcess(pid)}
                                                                    title={`终止连接 #${pid}`}
                                                                >
                                                                    {killingId === pid ? '...' : <Power size={11} />}
                                                                    <span>KILL</span>
                                                                </button>
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
                                <div className={my.sectionToolbar}>
                                    <div className={my.searchBox} style={{ maxWidth: 300 }}>
                                        <Search size={13} />
                                        <input
                                            value={slowSearch}
                                            placeholder="搜索慢查询 SQL / 用户..."
                                            onChange={(e) => setSlowSearch(e.target.value)}
                                        />
                                        {slowSearch && (
                                            <button className={g.iconBtn} onClick={() => setSlowSearch('')} title="清空">
                                                <X size={12} />
                                            </button>
                                        )}
                                    </div>

                                    <div className={my.slowHint}>
                                        <span>慢查询阈值: <strong>{longQueryTime}s</strong></span>
                                        <span>记录状态: <strong>{variables['slow_query_log'] || 'OFF'}</strong></span>
                                    </div>
                                </div>

                                {filteredSlowLog.length === 0 ? (
                                    <div className={my.slowEmptyGuide}>
                                        <AlertTriangle size={32} />
                                        <div className={my.emptyGuideTitle}>未查询到慢查询记录</div>
                                        <div className={my.emptyGuideSub}>
                                            若需开启慢查询记录到系统表，可在 SQL 编辑器中执行：
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
                                                            <span className={my.slowMetricBadge}>
                                                                耗时: <strong>{s['query_time']}s</strong>
                                                            </span>
                                                            <span className={my.slowMetricBadge}>
                                                                锁: {s['lock_time']}s
                                                            </span>
                                                            <span className={my.slowMetricBadge}>
                                                                扫描: {s['rows_examined']} 行
                                                            </span>
                                                            <button
                                                                className={`${g.btn} ${g.xs}`}
                                                                onClick={() => copyText(key, sqlText)}
                                                                title="复制 SQL"
                                                            >
                                                                {copiedKey === key ? <Check size={12} /> : <Copy size={12} />}
                                                                <span>{copiedKey === key ? '已复制' : '复制'}</span>
                                                            </button>
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
                                <div className={my.sectionToolbar}>
                                    <div className={my.pillFilterGroup}>
                                        <button
                                            className={`${my.pillBtn}${varCategory === 'core' ? ' ' + my.active : ''}`}
                                            onClick={() => setVarCategory('core')}
                                        >
                                            常用核心
                                        </button>
                                        <button
                                            className={`${my.pillBtn}${varCategory === 'conn' ? ' ' + my.active : ''}`}
                                            onClick={() => setVarCategory('conn')}
                                        >
                                            连接与网络
                                        </button>
                                        <button
                                            className={`${my.pillBtn}${varCategory === 'innodb' ? ' ' + my.active : ''}`}
                                            onClick={() => setVarCategory('innodb')}
                                        >
                                            InnoDB 引擎
                                        </button>
                                        <button
                                            className={`${my.pillBtn}${varCategory === 'log' ? ' ' + my.active : ''}`}
                                            onClick={() => setVarCategory('log')}
                                        >
                                            日志与缓存
                                        </button>
                                        <button
                                            className={`${my.pillBtn}${varCategory === 'charset' ? ' ' + my.active : ''}`}
                                            onClick={() => setVarCategory('charset')}
                                        >
                                            字符集/时区
                                        </button>
                                        <button
                                            className={`${my.pillBtn}${varCategory === 'all' ? ' ' + my.active : ''}`}
                                            onClick={() => setVarCategory('all')}
                                        >
                                            全部 ({Object.keys(variables).length})
                                        </button>
                                    </div>

                                    <div className={my.searchBox}>
                                        <Search size={13} />
                                        <input
                                            value={varSearch}
                                            placeholder="搜索系统变量名或值..."
                                            onChange={(e) => setVarSearch(e.target.value)}
                                        />
                                        {varSearch && (
                                            <button className={g.iconBtn} onClick={() => setVarSearch('')} title="清空">
                                                <X size={12} />
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {filteredVariables.length === 0 ? (
                                    <div className={my.emptyBox}>未找到匹配的变量配置</div>
                                ) : (
                                    <div className={my.tableResponsive}>
                                        <table className={my.dataTable}>
                                            <thead>
                                                <tr>
                                                    <th style={{ width: 280 }}>变量名称 (Variable Name)</th>
                                                    <th>当前配置值 (Value)</th>
                                                    <th style={{ width: 60, textAlign: 'center' }}>操作</th>
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
                                                                <span className={my.varValue}>{valStr || '(空)'}</span>
                                                            </td>
                                                            <td style={{ textAlign: 'center' }}>
                                                                <button
                                                                    className={g.iconBtn}
                                                                    onClick={() => copyText(`var-${k}`, valStr)}
                                                                    title="复制变量值"
                                                                >
                                                                    {copiedKey === `var-${k}` ? <Check size={12} /> : <Copy size={12} />}
                                                                </button>
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
