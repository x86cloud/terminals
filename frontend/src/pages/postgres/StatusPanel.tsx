import React, { useState, useEffect, useMemo } from 'react'
import { Table, Button, Tag, Input, Switch, Tooltip, message, Popconfirm, Space, Segmented, Badge } from 'antd'
import { RotateCw, Activity, HardDrive, ShieldCheck, Clock, Search, Copy, Check } from 'lucide-react'
import { API } from '@/api'
import { PgStatus, PgSession } from './postgresTypes'
import pg from './StatusPanel.module.less'

export default function StatusPanel({
    serverId,
    dbName,
}: {
    serverId: string
    dbName: string
}) {
    const [status, setStatus] = useState<PgStatus | null>(null)
    const [sessions, setSessions] = useState<PgSession[]>([])
    const [loading, setLoading] = useState(false)
    const [autoRefresh, setAutoRefresh] = useState(false)
    const [searchUser, setSearchUser] = useState('')
    const [stateFilter, setStateFilter] = useState<'all' | 'active' | 'idle'>('all')
    const [copiedPid, setCopiedPid] = useState<number | null>(null)

    const loadMetrics = async () => {
        setLoading(true)
        try {
            const [st, sessList] = await Promise.all([
                API.postgresStatus(serverId, dbName),
                API.postgresSessions(serverId, dbName),
            ])
            setStatus(st)
            setSessions(sessList || [])
        } catch (e: any) {
            console.error('加载监控指标失败:', e)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        loadMetrics()
    }, [serverId, dbName])

    useEffect(() => {
        if (!autoRefresh) return
        const timer = setInterval(() => {
            loadMetrics()
        }, 3000)
        return () => clearInterval(timer)
    }, [autoRefresh, serverId, dbName])

    const handleKill = async (pid: number, terminate = true) => {
        try {
            const ok = await API.postgresKillSession(serverId, dbName, pid, terminate)
            if (ok) {
                message.success(terminate ? ('已终止会话 (PID: ' + pid + ')') : ('已取消查询 (PID: ' + pid + ')'))
                loadMetrics()
            } else {
                message.warning('未能终止会话，可能权限不足或会话已退出')
            }
        } catch (e: any) {
            message.error('操作失败: ' + (e.message || e))
        }
    }

    const copySql = (pid: number, text: string) => {
        navigator.clipboard.writeText(text).then(() => {
            setCopiedPid(pid)
            setTimeout(() => setCopiedPid(null), 1500)
        })
    }

    const activeCount = useMemo(() => sessions.filter((s) => s.state === 'active').length, [sessions])
    const idleCount = useMemo(() => sessions.filter((s) => s.state.includes('idle')).length, [sessions])

    const filteredSessions = useMemo(() => {
        return sessions.filter((s) => {
            if (stateFilter === 'active' && s.state !== 'active') return false
            if (stateFilter === 'idle' && !s.state.includes('idle')) return false
            if (!searchUser) return true
            const kw = searchUser.toLowerCase()
            return (
                (s.user || '').toLowerCase().includes(kw) ||
                String(s.pid).includes(kw) ||
                (s.state || '').toLowerCase().includes(kw) ||
                (s.query || '').toLowerCase().includes(kw) ||
                (s.clientAddr || '').toLowerCase().includes(kw)
            )
        })
    }, [sessions, stateFilter, searchUser])

    return (
        <div className={pg.statusWrap}>
            {/* 核心指标卡片网格 */}
            <div className={pg.cardGrid}>
                <div className={pg.statusCard}>
                    <div className={pg.cardLabel} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Activity size={14} style={{ color: '#1890ff' }} />
                        活跃连接 / 最大上限
                    </div>
                    <div className={pg.cardValue}>
                        {status ? (status.activeConnections + ' / ' + status.maxConnections) : '-'}
                    </div>
                </div>

                <div className={pg.statusCard}>
                    <div className={pg.cardLabel} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <HardDrive size={14} style={{ color: '#52c41a' }} />
                        数据库磁盘占用
                    </div>
                    <div className={pg.cardValue}>{status?.databaseSize || '-'}</div>
                </div>

                <div className={pg.statusCard}>
                    <div className={pg.cardLabel} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <ShieldCheck size={14} style={{ color: '#722ed1' }} />
                        缓存命中率 (Cache Hit)
                    </div>
                    <div className={pg.cardValue}>{status?.cacheHitRatio || '100%'}</div>
                </div>

                <div className={pg.statusCard}>
                    <div className={pg.cardLabel} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Clock size={14} style={{ color: '#fa8c16' }} />
                        运行时间 (Uptime)
                    </div>
                    <div className={pg.cardValue} style={{ fontSize: 16, marginTop: 4 }}>
                        {status?.uptime || '-'}
                    </div>
                </div>
            </div>

            {/* 会话与活动监控 (pg_stat_activity) */}
            <div className={pg.sessionSection}>
                <div className={pg.sessionHead}>
                    <span className={pg.sectionTitle}>
                        活跃会话管理 (pg_stat_activity) - 共 {sessions.length} 个
                    </span>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <Segmented
                            size="small"
                            value={stateFilter}
                            onChange={(v) => setStateFilter(v as any)}
                            options={[
                                { label: '全部 (' + sessions.length + ')', value: 'all' },
                                { label: '活跃 (' + activeCount + ')', value: 'active' },
                                { label: '空闲 (' + idleCount + ')', value: 'idle' },
                            ]}
                        />

                        <Input
                            size="small"
                            placeholder="搜索 PID / 用户 / 状态 / SQL..."
                            value={searchUser}
                            allowClear
                            prefix={<Search size={12} style={{ color: 'var(--text-dim)' }} />}
                            style={{ width: 220 }}
                            onChange={(e) => setSearchUser(e.target.value)}
                        />

                        <Space size={6}>
                            <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>自动刷新(3s)</span>
                            <Switch size="small" checked={autoRefresh} onChange={setAutoRefresh} />
                        </Space>

                        <Tooltip title="手动刷新">
                            <Button
                                size="small"
                                icon={<RotateCw size={13} />}
                                loading={loading}
                                onClick={loadMetrics}
                            />
                        </Tooltip>
                    </div>
                </div>

                <div className={pg.tableWrap}>
                    <Table
                        size="small"
                        dataSource={filteredSessions}
                        rowKey="pid"
                        scroll={{ x: 950 }}
                        pagination={{ pageSize: 20, size: 'small', showSizeChanger: true, pageSizeOptions: ['20', '50', '100'] }}
                        columns={[
                            { title: 'PID', dataIndex: 'pid', width: 80, fixed: 'left' },
                            {
                                title: '用户',
                                dataIndex: 'user',
                                width: 100,
                                render: (t) => <strong>{t}</strong>,
                            },
                            {
                                title: '客户端地址',
                                width: 140,
                                render: (_, r: PgSession) => r.clientAddr ? (r.clientAddr + ':' + r.clientPort) : '[本地/内部]',
                            },
                            {
                                title: '状态',
                                dataIndex: 'state',
                                width: 120,
                                render: (st) => {
                                    const color =
                                        st === 'active'
                                            ? 'green'
                                            : st === 'idle in transaction'
                                            ? 'orange'
                                            : 'default'
                                    return <Tag color={color}>{st || '-'}</Tag>
                                },
                            },
                            {
                                title: '持续时长',
                                dataIndex: 'durationSec',
                                width: 90,
                                render: (sec) => (sec > 5 ? <Tag color="error">{sec}s</Tag> : (sec + 's')),
                            },
                            {
                                title: '等待事件',
                                width: 140,
                                render: (_, r: PgSession) =>
                                    r.waitEvent ? ((r.waitEventType ? (r.waitEventType + ': ') : '') + r.waitEvent) : '-',
                            },
                            {
                                title: '当前执行 SQL',
                                dataIndex: 'query',
                                ellipsis: true,
                                render: (q, r: PgSession) => (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, maxWidth: '100%' }}>
                                        <span style={{ fontFamily: 'monospace', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                                            {q || '-'}
                                        </span>
                                        {q && (
                                            <Tooltip title="复制 SQL">
                                                <Button
                                                    size="small"
                                                    type="text"
                                                    style={{ width: 20, height: 20, padding: 0, flexShrink: 0 }}
                                                    icon={copiedPid === r.pid ? <Check size={11} color="#52c41a" /> : <Copy size={11} />}
                                                    onClick={() => copySql(r.pid, q)}
                                                />
                                            </Tooltip>
                                        )}
                                    </div>
                                ),
                            },
                            {
                                title: '操作',
                                width: 120,
                                fixed: 'right',
                                render: (_, r: PgSession) => (
                                    <Space size={6}>
                                        <Popconfirm
                                            title="确定要取消此查询吗？"
                                            onConfirm={() => handleKill(r.pid, false)}
                                        >
                                            <Button size="small" type="link" style={{ padding: 0 }}>
                                                取消
                                            </Button>
                                        </Popconfirm>
                                        <Popconfirm
                                            title="确定要强行终止该会话 (Terminate) 吗？"
                                            okButtonProps={{ danger: true }}
                                            onConfirm={() => handleKill(r.pid, true)}
                                        >
                                            <Button size="small" type="link" danger style={{ padding: 0 }}>
                                                终止
                                            </Button>
                                        </Popconfirm>
                                    </Space>
                                ),
                            },
                        ]}
                    />
                </div>
            </div>
        </div>
    )
}
