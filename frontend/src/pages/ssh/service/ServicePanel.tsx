import { useCallback, useEffect, useMemo, useState } from 'react'
import { Segmented, Input, Button, Table, Badge, Modal, Alert, Space, Spin, Tooltip, App } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { Search, RotateCw, Play, Power, FileText } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { API } from '@/api'
import { SSHServiceInfo } from '@/types'
import { errorMessage } from '@/utils'
import s from '@/pages/ssh/service/ServicePanel.module.less'

interface Props {
    sessionId: string
    active: boolean
}

type FilterTab = 'all' | 'active' | 'inactive' | 'failed'

export default function ServicePanel({ sessionId, active }: Props) {
    const { t } = useTranslation(['ssh', 'common'])
    const { message } = App.useApp()
    const [services, setServices] = useState<SSHServiceInfo[]>([])
    const [busy, setBusy] = useState(false)
    const [loaded, setLoaded] = useState(false)
    const [actionBusy, setActionBusy] = useState<string>('')
    const [error, setError] = useState('')
    const [keyword, setKeyword] = useState('')
    const [filterTab, setFilterTab] = useState<FilterTab>('all')
    const [lastUpdate, setLastUpdate] = useState<string>('')
    const [page, setPage] = useState(1)
    const [pageSize, setPageSize] = useState(20)

    useEffect(() => {
        setLoaded(false)
        setServices([])
        setError('')
    }, [sessionId])

    useEffect(() => {
        setPage(1)
    }, [keyword, filterTab])

    // 日志 Modal
    const [logService, setLogService] = useState('')
    const [logText, setLogText] = useState('')
    const [logLoading, setLogLoading] = useState(false)

    const fetchServices = useCallback(async () => {
        setBusy(true)
        setError('')
        try {
            const list = await API.sshServiceList(sessionId)
            setServices(list || [])
            setLastUpdate(new Date().toLocaleTimeString())
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
            void fetchServices()
        }
    }, [active, loaded, busy, fetchServices])

    const counts = useMemo(() => {
        let active = 0
        let inactive = 0
        let failed = 0
        for (const svc of services) {
            if (svc.active === 'active') active++
            else if (svc.active === 'failed' || svc.sub === 'failed') failed++
            else inactive++
        }
        return { all: services.length, active, inactive, failed }
    }, [services])

    const filteredServices = useMemo(() => {
        let list = services
        if (filterTab === 'active') {
            list = list.filter((svc) => svc.active === 'active')
        } else if (filterTab === 'inactive') {
            list = list.filter((svc) => svc.active !== 'active' && svc.active !== 'failed' && svc.sub !== 'failed')
        } else if (filterTab === 'failed') {
            list = list.filter((svc) => svc.active === 'failed' || svc.sub === 'failed')
        }

        if (keyword.trim()) {
            const kw = keyword.trim().toLowerCase()
            list = list.filter(
                (svc) =>
                    svc.name.toLowerCase().includes(kw) ||
                    svc.description.toLowerCase().includes(kw)
            )
        }

        return list
    }, [services, filterTab, keyword])

    const handleControl = async (svc: SSHServiceInfo, action: 'start' | 'stop' | 'restart') => {
        const actionText = action === 'start' ? t('ssh:service.start') : action === 'stop' ? t('ssh:service.stop') : t('ssh:service.restart')
        setActionBusy(`${svc.name}-${action}`)
        try {
            await API.sshControlService(sessionId, svc.name, action)
            message.success(`${actionText}: ${svc.name}`)
            await fetchServices()
        } catch (e) {
            const msg = errorMessage(e)
            message.error(`${actionText} failed: ${msg}`)
        } finally {
            setActionBusy('')
        }
    }

    const openLogs = async (svc: SSHServiceInfo) => {
        setLogService(svc.name)
        setLogLoading(true)
        setLogText('')
        try {
            const text = await API.sshServiceLogs(sessionId, svc.name)
            setLogText(text || '')
        } catch (e) {
            const msg = errorMessage(e)
            setLogText(msg)
        } finally {
            setLogLoading(false)
        }
    }

    const columns: ColumnsType<SSHServiceInfo> = [
        {
            title: t('ssh:service.name'),
            dataIndex: 'name',
            key: 'name',
            width: 220,
            sorter: (a, b) => a.name.localeCompare(b.name),
            render: (name) => <span style={{ fontWeight: 500, fontFamily: 'monospace' }}>{name}</span>,
        },
        {
            title: t('ssh:service.status'),
            dataIndex: 'active',
            key: 'active',
            width: 110,
            render: (active, record) => {
                const isRunning = active === 'active'
                const isFailed = active === 'failed' || record.sub === 'failed'
                const status = isRunning ? 'success' : isFailed ? 'error' : 'default'
                return <Badge status={status} text={active} />
            },
        },
        {
            title: 'Sub',
            dataIndex: 'sub',
            key: 'sub',
            width: 100,
            render: (sub) => <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>{sub}</span>,
        },
        {
            title: t('ssh:service.description'),
            dataIndex: 'description',
            key: 'description',
            ellipsis: true,
            render: (desc) => desc || '-',
        },
        {
            title: t('common:actions'),
            key: 'actions',
            width: 110,
            render: (_, svc) => {
                const isRunning = svc.active === 'active'
                return (
                    <Space size={2}>
                        {isRunning ? (
                            <Tooltip title={t('ssh:service.stop')}>
                                <Button
                                    size="small"
                                    type="text"
                                    danger
                                    icon={<Power size={13} />}
                                    loading={actionBusy === `${svc.name}-stop`}
                                    onClick={() => handleControl(svc, 'stop')}
                                />
                            </Tooltip>
                        ) : (
                            <Tooltip title={t('ssh:service.start')}>
                                <Button
                                    size="small"
                                    type="text"
                                    icon={<Play size={13} />}
                                    loading={actionBusy === `${svc.name}-start`}
                                    onClick={() => handleControl(svc, 'start')}
                                />
                            </Tooltip>
                        )}
                        <Tooltip title={t('ssh:service.restart')}>
                            <Button
                                size="small"
                                type="text"
                                icon={<RotateCw size={13} />}
                                loading={actionBusy === `${svc.name}-restart`}
                                onClick={() => handleControl(svc, 'restart')}
                            />
                        </Tooltip>
                        <Tooltip title={t('ssh:service.logs')}>
                            <Button
                                size="small"
                                type="text"
                                icon={<FileText size={13} />}
                                onClick={() => openLogs(svc)}
                            />
                        </Tooltip>
                    </Space>
                )
            },
        },
    ]

    if (!active) return null

    return (
        <div className={s.servicePanel}>
            <div className={s.toolbar}>
                <Segmented
                    size="small"
                    value={filterTab}
                    onChange={(v) => setFilterTab(v as FilterTab)}
                    options={[
                        { label: `${t('ssh:service.filterAll')} (${counts.all})`, value: 'all' },
                        { label: `${t('ssh:service.filterActive')} (${counts.active})`, value: 'active' },
                        { label: `${t('ssh:service.filterInactive')} (${counts.inactive})`, value: 'inactive' },
                        { label: `${t('ssh:service.filterFailed')} (${counts.failed})`, value: 'failed' },
                    ]}
                />

                <Input
                    size="small"
                    className={s.searchInput}
                    value={keyword}
                    placeholder={t('ssh:service.searchPlaceholder')}
                    prefix={<Search size={13} />}
                    allowClear
                    onChange={(e) => setKeyword(e.target.value)}
                />

                <div className={s.toolbarActions}>
                    {lastUpdate && <span className={s.lastUpdate}>{t('ssh:service.updatedAt', { time: lastUpdate })}</span>}
                    <Button
                        size="small"
                        icon={<RotateCw size={12} />}
                        loading={busy}
                        onClick={fetchServices}
                    >
                        {t('common:refresh')}
                    </Button>
                </div>
            </div>

            {error && (
                <Alert
                    type="error"
                    showIcon
                    message={error}
                    className={s.alertBox}
                    action={
                        <Button size="small" type="primary" danger onClick={fetchServices}>
                            {t('common:retry')}
                        </Button>
                    }
                />
            )}

            <div className={s.tableWrap}>
                <Table<SSHServiceInfo>
                    rowKey="name"
                    size="small"
                    columns={columns}
                    dataSource={filteredServices}
                    loading={busy}
                    pagination={{
                        current: page,
                        pageSize: pageSize,
                        total: filteredServices.length,
                        showSizeChanger: true,
                        pageSizeOptions: ['10', '20', '50', '100'],
                        showTotal: (total) => `${t('common:total', { defaultValue: '共' })} ${total}`,
                        size: 'small',
                        onChange: (p, ps) => {
                            setPage(p)
                            setPageSize(ps)
                        },
                    }}
                    scroll={{ y: 'calc(100vh - 280px)' }}
                />
            </div>

            <Modal
                open={!!logService}
                title={`${t('ssh:service.serviceLogs')}: ${logService}`}
                onCancel={() => setLogService('')}
                width={800}
                footer={<Button onClick={() => setLogService('')}>{t('common:close')}</Button>}
            >
                <div className={s.logContainer}>
                    {logLoading ? (
                        <Spin />
                    ) : (
                        <pre style={{ margin: 0, fontFamily: 'Consolas, monospace', fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                            {logText}
                        </pre>
                    )}
                </div>
            </Modal>
        </div>
    )
}
