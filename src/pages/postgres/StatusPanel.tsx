import { useState, useEffect, useMemo } from 'react'
import { Table, Button, Tag, Input, Switch, Tooltip, Popconfirm, Space, Segmented, App } from 'antd'
import { RotateCw, Activity, HardDrive, ShieldCheck, Clock, Search, Copy, Check } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { API } from '@/api'
import { useSession } from '@/contexts/SessionContext'
import { PgStatus, PgSession } from './postgresTypes'
import pg from './StatusPanel.module.less'

export default function StatusPanel({
    sessionId,
    serverId,
    dbName,
}: {
    sessionId?: string
    serverId: string
    dbName: string
}) {
    const { t } = useTranslation(['db', 'common'])
    const { message } = App.useApp()
    const { activeTarget } = useSession()
    const isActive = !sessionId || (activeTarget?.kind === 'postgres' && activeTarget.id === sessionId)

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
            console.error('Failed to load metrics:', e)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        loadMetrics()
    }, [serverId, dbName])

    useEffect(() => {
        if (!autoRefresh || !isActive) return
        const timer = setInterval(() => {
            loadMetrics()
        }, 3000)
        return () => clearInterval(timer)
    }, [autoRefresh, isActive, serverId, dbName])

    const handleKill = async (pid: number, terminate = true) => {
        try {
            const ok = await API.postgresKillSession(serverId, dbName, pid, terminate)
            if (ok) {
                message.success(terminate ? t('postgres.status.killTerminated', { pid }) : t('postgres.status.killCanceled', { pid }))
                loadMetrics()
            } else {
                message.warning(t('postgres.status.killWarn'))
            }
        } catch (e: any) {
            message.error(t('postgres.status.opFail', { error: e.message || e }))
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
                        {t('postgres.status.activeMaxConn')}
                    </div>
                    <div className={pg.cardValue}>
                        {status ? (status.activeConnections + ' / ' + status.maxConnections) : '-'}
                    </div>
                </div>

                <div className={pg.statusCard}>
                    <div className={pg.cardLabel} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <HardDrive size={14} style={{ color: '#52c41a' }} />
                        {t('postgres.status.diskUsage')}
                    </div>
                    <div className={pg.cardValue}>{status?.databaseSize || '-'}</div>
                </div>

                <div className={pg.statusCard}>
                    <div className={pg.cardLabel} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <ShieldCheck size={14} style={{ color: '#722ed1' }} />
                        {t('postgres.status.cacheHit')}
                    </div>
                    <div className={pg.cardValue}>{status?.cacheHitRatio || '100%'}</div>
                </div>

                <div className={pg.statusCard}>
                    <div className={pg.cardLabel} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Clock size={14} style={{ color: '#fa8c16' }} />
                        {t('postgres.status.uptime')}
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
                        {t('postgres.status.sessionTitle', { count: sessions.length })}
                    </span>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <Segmented
                            size="small"
                            value={stateFilter}
                            onChange={(v) => setStateFilter(v as any)}
                            options={[
                                { label: t('postgres.status.allCount', { count: sessions.length }), value: 'all' },
                                { label: t('postgres.status.activeCount', { count: activeCount }), value: 'active' },
                                { label: t('postgres.status.idleCount', { count: idleCount }), value: 'idle' },
                            ]}
                        />

                        <Input
                            size="small"
                            placeholder={t('postgres.status.searchPlaceholder')}
                            value={searchUser}
                            allowClear
                            prefix={<Search size={12} style={{ color: 'var(--text-dim)' }} />}
                            style={{ width: 220 }}
                            onChange={(e) => setSearchUser(e.target.value)}
                        />

                        <Space size={6}>
                            <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{t('postgres.status.autoRefresh')}</span>
                            <Switch size="small" checked={autoRefresh} onChange={setAutoRefresh} />
                        </Space>

                        <Tooltip title={t('postgres.status.manualRefresh')}>
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
                            { title: t('postgres.status.colPid'), dataIndex: 'pid', width: 80, fixed: 'left' },
                            {
                                title: t('postgres.status.colUser'),
                                dataIndex: 'user',
                                width: 100,
                                render: (u) => <strong>{u}</strong>,
                            },
                            {
                                title: t('postgres.status.colClientAddr'),
                                width: 140,
                                render: (_, r: PgSession) => r.clientAddr ? (r.clientAddr + ':' + r.clientPort) : t('postgres.status.localInternal'),
                            },
                            {
                                title: t('postgres.status.colState'),
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
                                title: t('postgres.status.colDuration'),
                                dataIndex: 'durationSec',
                                width: 90,
                                render: (sec) => (sec > 5 ? <Tag color="error">{sec}s</Tag> : (sec + 's')),
                            },
                            {
                                title: t('postgres.status.colWaitEvent'),
                                width: 140,
                                render: (_, r: PgSession) =>
                                    r.waitEvent ? ((r.waitEventType ? (r.waitEventType + ': ') : '') + r.waitEvent) : '-',
                            },
                            {
                                title: t('postgres.status.colQuery'),
                                dataIndex: 'query',
                                ellipsis: true,
                                render: (q, r: PgSession) => (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, maxWidth: '100%' }}>
                                        <span style={{ fontFamily: 'monospace', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                                            {q || '-'}
                                        </span>
                                        {q && (
                                            <Tooltip title={t('postgres.status.copySql')}>
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
                                title: t('postgres.status.colAction'),
                                width: 120,
                                fixed: 'right',
                                render: (_, r: PgSession) => (
                                    <Space size={6}>
                                        <Popconfirm
                                            title={t('postgres.status.cancelConfirm')}
                                            onConfirm={() => handleKill(r.pid, false)}
                                        >
                                            <Button size="small" type="link" style={{ padding: 0 }}>
                                                {t('postgres.status.cancel')}
                                            </Button>
                                        </Popconfirm>
                                        <Popconfirm
                                            title={t('postgres.status.terminateConfirm')}
                                            okButtonProps={{ danger: true }}
                                            onConfirm={() => handleKill(r.pid, true)}
                                        >
                                            <Button size="small" type="link" danger style={{ padding: 0 }}>
                                                {t('postgres.status.terminate')}
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
