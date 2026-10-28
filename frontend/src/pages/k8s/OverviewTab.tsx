import { useState, useEffect } from 'react'
import { Table, Space, Tag, Button, Input, Tooltip, App } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
    Server,
    Layers,
    Box,
    Network,
    Search,
    RefreshCw,
    Copy,
    CheckCircle,
    Sliders,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { API } from '@/api'
import { copyText } from '@/utils'
import type { K8sOverview, K8sNodeInfo } from '@/types'
import s from './K8sClient.module.less'

interface Props {
    serverId: string
    overview: K8sOverview | null
    loading: boolean
    onRefresh: () => void
}

export default function OverviewTab({ serverId, overview, loading, onRefresh }: Props) {
    const { t } = useTranslation(['k8s', 'common'])
    const { message } = App.useApp()
    const [nodes, setNodes] = useState<K8sNodeInfo[]>([])
    const [nodeLoading, setNodeLoading] = useState(false)
    const [searchKw, setSearchKw] = useState('')
    const [page, setPage] = useState(1)
    const [pageSize, setPageSize] = useState(10)

    const fetchNodes = async () => {
        setNodeLoading(true)
        try {
            const list = await API.k8sListNodes(serverId)
            setNodes(list)
        } catch (err: any) {
            message.error(t('overview.fetchNodesFail', { defaultValue: '获取节点列表失败: {{error}}', error: err.message || String(err) }))
        } finally {
            setNodeLoading(false)
        }
    }

    useEffect(() => {
        fetchNodes()
    }, [serverId])

    const filtered = nodes.filter((n) => {
        if (!searchKw) return true
        const kw = searchKw.toLowerCase()
        return (
            n.name.toLowerCase().includes(kw) ||
            n.internalIp.toLowerCase().includes(kw) ||
            n.roles.toLowerCase().includes(kw) ||
            n.kubeletVersion.toLowerCase().includes(kw)
        )
    })

    const columns: ColumnsType<K8sNodeInfo> = [
        {
            title: t('overview.colNodeName', { defaultValue: '节点名称 (Node Name)' }),
            dataIndex: 'name',
            key: 'name',
            width: 220,
            render: (name: string) => (
                <Space size={8}>
                    <Server size={14} color="var(--accent)" />
                    <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>{name}</span>
                    <Tooltip title={t('overview.copyNodeName', { defaultValue: '复制节点名称' })}>
                        <Button
                            size="small"
                            type="text"
                            icon={<Copy size={11} />}
                            onClick={async () => {
                                if (await copyText(name)) {
                                    message.success(t('overview.copiedNodeName', { defaultValue: '已复制节点名称' }))
                                }
                            }}
                        />
                    </Tooltip>
                </Space>
            ),
        },
        {
            title: t('overview.colStatus', { defaultValue: '状态' }),
            dataIndex: 'status',
            key: 'status',
            width: 120,
            render: (status: string) => {
                const isReady = status === 'Ready'
                return (
                    <span className={`${s.statusBadge} ${isReady ? s.statusRunning : s.statusFailed}`}>
                        {isReady && <span className={s.pulseDot} />}
                        <span>{status}</span>
                    </span>
                )
            },
        },
        {
            title: t('overview.colRoles', { defaultValue: '角色 (Roles)' }),
            dataIndex: 'roles',
            key: 'roles',
            width: 140,
            render: (roles: string) => {
                const parts = (roles || 'worker').split(', ')
                return (
                    <Space size={4} wrap>
                        {parts.map((r) => (
                            <Tag key={r} color={r.includes('control-plane') || r.includes('master') ? 'purple' : 'blue'}>
                                {r}
                            </Tag>
                        ))}
                    </Space>
                )
            },
        },
        {
            title: t('overview.colIp', { defaultValue: 'IP 地址' }),
            key: 'ip',
            width: 160,
            render: (_, record) => (
                <div style={{ fontSize: 12, fontFamily: 'var(--font-mono)' }}>
                    <div>{t('overview.internalIp', { defaultValue: '内网: {{ip}}', ip: record.internalIp || '-' })}</div>
                    {record.externalIp && (
                        <div style={{ color: 'var(--text-dim)' }}>
                            {t('overview.externalIp', { defaultValue: '外网: {{ip}}', ip: record.externalIp })}
                        </div>
                    )}
                </div>
            ),
        },
        {
            title: t('overview.colCompute', { defaultValue: '计算规格 (CPU / 内存 / Pods)' }),
            key: 'capacity',
            width: 200,
            render: (_, record) => (
                <div style={{ fontSize: 12, fontFamily: 'var(--font-mono)' }}>
                    <Space size={8}>
                        <span>{t('overview.cpuCores', { defaultValue: 'CPU: {{cores}} 核', cores: record.cpuCapacity })}</span>
                        <span>{t('overview.memCapacity', { defaultValue: '内存: {{mem}}', mem: record.memCapacity })}</span>
                    </Space>
                    <div style={{ color: 'var(--text-dim)', fontSize: 11, marginTop: 2 }}>
                        {t('overview.podsCapacity', { defaultValue: 'Pods 容量: {{pods}}', pods: record.podsCapacity })}
                    </div>
                </div>
            ),
        },
        {
            title: t('overview.colVersion', { defaultValue: 'Kubelet / 系统版本' }),
            key: 'version',
            render: (_, record) => (
                <div style={{ fontSize: 11.5 }}>
                    <div style={{ color: 'var(--text)' }}>{record.kubeletVersion}</div>
                    <div style={{ color: 'var(--text-dim)' }} title={record.kernelVersion}>
                        {record.osImage}
                    </div>
                </div>
            ),
        },
        {
            title: t('overview.colCreatedAt', { defaultValue: '创建时间' }),
            dataIndex: 'createdAt',
            key: 'createdAt',
            width: 160,
            render: (timeStr: string) => (
                <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{timeStr || '-'}</span>
            ),
        },
    ]

    return (
        <div>
            {/* 核心指标概览卡片 */}
            <div className={s.overviewGrid}>
                <div className={s.statCard}>
                    <div className={s.statCardHeader}>
                        <span>{t('overview.cardNodes', { defaultValue: '集群节点 (Nodes)' })}</span>
                        <Server size={16} color="var(--accent)" />
                    </div>
                    <div className={s.statCardValue}>
                        {overview?.nodesReady ?? 0}
                        <span style={{ fontSize: 14, color: 'var(--text-dim)', fontWeight: 400, marginLeft: 6 }}>
                            / {overview?.nodesTotal ?? 0} {t('common.ready', { defaultValue: '就绪' })}
                        </span>
                    </div>
                    <div className={s.statCardFooter}>
                        <CheckCircle size={12} color="var(--ok)" />
                        <span>K8s Compute Pool</span>
                    </div>
                </div>

                <div className={s.statCard}>
                    <div className={s.statCardHeader}>
                        <span>Namespaces</span>
                        <Layers size={16} color="#8b5cf6" />
                    </div>
                    <div className={s.statCardValue}>{overview?.namespacesTotal ?? 0}</div>
                    <div className={s.statCardFooter}>
                        <span>Tenant & Scope Isolation</span>
                    </div>
                </div>

                <div className={s.statCard}>
                    <div className={s.statCardHeader}>
                        <span>{t('overview.cardPods', { defaultValue: 'Pods 容器组' })}</span>
                        <Box size={16} color="var(--ok)" />
                    </div>
                    <div className={s.statCardValue}>
                        {overview?.podsRunning ?? 0}
                        <span style={{ fontSize: 14, color: 'var(--text-dim)', fontWeight: 400, marginLeft: 6 }}>
                            / {overview?.podsTotal ?? 0} {t('common.running', { defaultValue: '运行中' })}
                        </span>
                    </div>
                    <div className={s.statCardFooter}>
                        <span>Atomic Scheduled Units</span>
                    </div>
                </div>

                <div className={s.statCard}>
                    <div className={s.statCardHeader}>
                        <span>{t('overview.cardDeployments', { defaultValue: 'Deployments 负载' })}</span>
                        <Sliders size={16} color="var(--warn)" />
                    </div>
                    <div className={s.statCardValue}>{overview?.deploymentsTotal ?? 0}</div>
                    <div className={s.statCardFooter}>
                        <span>Stateless Scalable Apps</span>
                    </div>
                </div>

                <div className={s.statCard}>
                    <div className={s.statCardHeader}>
                        <span>{t('overview.cardServices', { defaultValue: 'Services 服务' })}</span>
                        <Network size={16} color="#06b6d4" />
                    </div>
                    <div className={s.statCardValue}>{overview?.servicesTotal ?? 0}</div>
                    <div className={s.statCardFooter}>
                        <span>Discovery & Load Balancing</span>
                    </div>
                </div>
            </div>

            {/* 节点工具栏 */}
            <div className={s.toolbar}>
                <div className={s.toolbarLeft}>
                    <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)' }}>
                        {t('overview.nodesCardTitle', { defaultValue: '集群节点 (Nodes)' })} ({nodes.length})
                    </span>
                    <Input
                        placeholder={t('overview.searchNodePlaceholder', { defaultValue: '搜索节点名称 / IP / 角色 / 版本...' })}
                        prefix={<Search size={13} color="var(--text-dim)" />}
                        value={searchKw}
                        onChange={(e) => {
                            setSearchKw(e.target.value)
                            setPage(1)
                        }}
                        style={{ width: 280 }}
                        size="small"
                        allowClear
                    />
                </div>

                <div className={s.toolbarRight}>
                    <Button
                        icon={<RefreshCw size={13} className={nodeLoading || loading ? 'animate-spin' : ''} />}
                        size="small"
                        onClick={() => {
                            onRefresh()
                            fetchNodes()
                        }}
                    >
                        {t('common.refresh', { defaultValue: '刷新' })}
                    </Button>
                </div>
            </div>

            {/* 节点表格 */}
            <Table
                columns={columns}
                dataSource={filtered}
                rowKey="name"
                loading={nodeLoading || loading}
                size="small"
                pagination={{
                    current: page,
                    pageSize: pageSize,
                    total: filtered.length,
                    showSizeChanger: true,
                    pageSizeOptions: ['10', '20', '50', '100'],
                    showTotal: (total, range) => t('common.paginationTotal', { defaultValue: `第 ${range[0]}-${range[1]} 条 / 共 ${total} 条`, from: range[0], to: range[1], total }),
                    onChange: (p, ps) => {
                        setPage(p)
                        setPageSize(ps)
                    },
                }}
            />
        </div>
    )
}
