import { useState, useEffect } from 'react'
import {
    Table,
    Space,
    Tag,
    Button,
    Input,
    Segmented,
    App,
    Tooltip,
    Popconfirm,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
    Network,
    Globe,
    Search,
    RefreshCw,
    Copy,
    Code,
    Trash2,
    Plus,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { API } from '@/api'
import { copyText } from '@/utils'
import K8sResourceYamlModal from './K8sResourceYamlModal'
import type { K8sServiceInfo, K8sIngressInfo } from '@/types'
import s from './K8sClient.module.less'

interface Props {
    serverId: string
    currentNamespace: string
    initialSearchKw?: string
    initialSubTab?: 'service' | 'ingress'
}

const DEFAULT_SERVICE_TEMPLATE = (namespace: string) => `apiVersion: v1
kind: Service
metadata:
  name: sample-service
  namespace: ${namespace && namespace !== '_all' ? namespace : 'default'}
  labels:
    app: sample-app
spec:
  type: ClusterIP
  selector:
    app: sample-app
  ports:
  - port: 80
    targetPort: 80
    protocol: TCP
    name: http
`

const DEFAULT_INGRESS_TEMPLATE = (namespace: string) => `apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: sample-ingress
  namespace: ${namespace && namespace !== '_all' ? namespace : 'default'}
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /
spec:
  ingressClassName: nginx
  rules:
  - host: app.example.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: sample-service
            port:
              number: 80
`

export default function NetworkTab({ serverId, currentNamespace, initialSearchKw, initialSubTab }: Props) {
    const { t } = useTranslation(['k8s', 'common'])
    const { message } = App.useApp()
    const [subTab, setSubTab] = useState<'service' | 'ingress'>(initialSubTab || 'service')
    const [services, setServices] = useState<K8sServiceInfo[]>([])
    const [ingresses, setIngresses] = useState<K8sIngressInfo[]>([])
    const [loading, setLoading] = useState(false)
    const [searchKw, setSearchKw] = useState(initialSearchKw || '')
    const [page, setPage] = useState(1)
    const [pageSize, setPageSize] = useState(10)

    useEffect(() => {
        if (initialSearchKw !== undefined) {
            setSearchKw(initialSearchKw)
            setPage(1)
        }
    }, [initialSearchKw])

    useEffect(() => {
        if (initialSubTab) {
            setSubTab(initialSubTab)
        }
    }, [initialSubTab])

    // YAML 模态框 (查看/编辑/新建)
    const [yamlModalOpen, setYamlModalOpen] = useState(false)
    const [yamlKind, setYamlKind] = useState<'Service' | 'Ingress'>('Service')
    const [yamlMode, setYamlMode] = useState<'view' | 'edit' | 'create'>('edit')
    const [yamlTarget, setYamlTarget] = useState<{ namespace: string; name: string } | null>(null)

    const fetchData = async () => {
        setLoading(true)
        try {
            if (subTab === 'service') {
                const list = await API.k8sListServices(serverId, currentNamespace)
                setServices(list)
            } else {
                const list = await API.k8sListIngresses(serverId, currentNamespace)
                setIngresses(list)
            }
        } catch (err: any) {
            message.error(t('k8s:network.fetchFail', { error: err.message || String(err) }))
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchData()
    }, [serverId, currentNamespace, subTab])

    const handleDeleteService = async (record: K8sServiceInfo) => {
        try {
            await API.k8sDeleteService(serverId, record.namespace, record.name)
            fetchData()
        } catch (err: any) {
            message.error(t('k8s:network.deleteServiceFail', { error: err.message || String(err) }))
        }
    }

    const handleDeleteIngress = async (record: K8sIngressInfo) => {
        try {
            await API.k8sDeleteIngress(serverId, record.namespace, record.name)
            fetchData()
        } catch (err: any) {
            message.error(t('k8s:network.deleteIngressFail', { error: err.message || String(err) }))
        }
    }

    const openEditYaml = (kind: 'Service' | 'Ingress', namespace: string, name: string) => {
        setYamlKind(kind)
        setYamlTarget({ namespace, name })
        setYamlMode('edit')
        setYamlModalOpen(true)
    }

    const openCreateYaml = (kind: 'Service' | 'Ingress') => {
        setYamlKind(kind)
        setYamlTarget(null)
        setYamlMode('create')
        setYamlModalOpen(true)
    }

    const filteredServices = services.filter((sItem) => {
        if (!searchKw) return true
        const kw = searchKw.toLowerCase()
        return (
            sItem.name.toLowerCase().includes(kw) ||
            sItem.namespace.toLowerCase().includes(kw) ||
            sItem.clusterIp.includes(kw) ||
            sItem.type.toLowerCase().includes(kw)
        )
    })

    const filteredIngresses = ingresses.filter((ing) => {
        if (!searchKw) return true
        const kw = searchKw.toLowerCase()
        return (
            ing.name.toLowerCase().includes(kw) ||
            ing.namespace.toLowerCase().includes(kw) ||
            (ing.hosts && ing.hosts.some((h) => h.toLowerCase().includes(kw)))
        )
    })

    const serviceColumns: ColumnsType<K8sServiceInfo> = [
        {
            title: t('k8s:network.colServiceName'),
            dataIndex: 'name',
            key: 'name',
            render: (name: string, record) => (
                <Space size={8}>
                    <Network size={14} color="var(--accent)" />
                    <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>{name}</span>
                    <Tooltip title={t('k8s:network.copyServiceName')}>
                        <Button
                            size="small"
                            type="text"
                            icon={<Copy size={11} />}
                            onClick={async () => {
                                if (await copyText(name)) {
                                    message.success(t('k8s:network.copiedServiceName'))
                                }
                            }}
                        />
                    </Tooltip>
                </Space>
            ),
        },
        {
            title: t('k8s:network.colNamespace'),
            dataIndex: 'namespace',
            key: 'namespace',
            width: 140,
            render: (ns: string) => <Tag color="blue">{ns}</Tag>,
        },
        {
            title: t('k8s:network.colType'),
            dataIndex: 'type',
            key: 'type',
            width: 140,
            render: (type: string) => {
                let color = 'default'
                if (type === 'ClusterIP') color = 'processing'
                if (type === 'NodePort') color = 'warning'
                if (type === 'LoadBalancer') color = 'success'
                return <Tag color={color}>{type}</Tag>
            },
        },
        {
            title: 'Cluster IP',
            dataIndex: 'clusterIp',
            key: 'clusterIp',
            width: 160,
            render: (ip: string) => <span className={s.monoText}>{ip || '-'}</span>,
        },
        {
            title: t('k8s:network.colPorts'),
            dataIndex: 'ports',
            key: 'ports',
            render: (ports: string[]) => (
                <Space size={4} wrap>
                    {(ports || []).map((p, idx) => (
                        <Tag key={idx} color="geekblue" style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                            {p}
                        </Tag>
                    ))}
                </Space>
            ),
        },
        {
            title: t('k8s:network.colCreatedAt'),
            dataIndex: 'createdAt',
            key: 'createdAt',
            width: 160,
            render: (tVal: string) => (
                <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{tVal || '-'}</span>
            ),
        },
        {
            title: t('k8s:network.colActions'),
            key: 'actions',
            width: 170,
            align: 'right',
            render: (_, record) => (
                <Space size={6}>
                    <Button
                        size="small"
                        icon={<Code size={12} />}
                        onClick={() => openEditYaml('Service', record.namespace, record.name)}
                    >
                        {t('common.edit')}
                    </Button>
                    <Popconfirm
                        title={t('k8s:network.deleteConfirm', { name: record.name })}
                        description={t('k8s:network.deleteDesc', { namespace: record.namespace })}
                        okText={t('common.confirm')}
                        cancelText={t('common.cancel')}
                        okButtonProps={{ danger: true }}
                        onConfirm={() => handleDeleteService(record)}
                    >
                        <Button size="small" danger icon={<Trash2 size={12} />}>
                            {t('common.delete')}
                        </Button>
                    </Popconfirm>
                </Space>
            ),
        },
    ]

    const ingressColumns: ColumnsType<K8sIngressInfo> = [
        {
            title: t('k8s:network.colIngressName'),
            dataIndex: 'name',
            key: 'name',
            render: (name: string, record) => (
                <Space size={8}>
                    <Globe size={14} color="var(--accent)" />
                    <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>{name}</span>
                    <Tooltip title={t('k8s:network.copyIngressName')}>
                        <Button
                            size="small"
                            type="text"
                            icon={<Copy size={11} />}
                            onClick={async () => {
                                if (await copyText(name)) {
                                    message.success(t('k8s:network.copiedIngressName'))
                                }
                            }}
                        />
                    </Tooltip>
                </Space>
            ),
        },
        {
            title: t('k8s:network.colNamespace'),
            dataIndex: 'namespace',
            key: 'namespace',
            width: 140,
            render: (ns: string) => <Tag color="blue">{ns}</Tag>,
        },
        {
            title: t('k8s:network.colClass'),
            dataIndex: 'ingressClass',
            key: 'ingressClass',
            width: 120,
            render: (cls: string) => <Tag color="purple">{cls || 'default'}</Tag>,
        },
        {
            title: t('k8s:network.colHosts'),
            dataIndex: 'hosts',
            key: 'hosts',
            render: (hosts: string[]) => (
                <Space size={4} wrap>
                    {(hosts || []).map((h, idx) => (
                        <Tag key={idx} color="volcano" style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                            {h}
                        </Tag>
                    ))}
                </Space>
            ),
        },
        {
            title: t('k8s:network.colRules'),
            dataIndex: 'rules',
            key: 'rules',
            render: (rules: string[]) => (
                <div style={{ fontSize: 11.5, fontFamily: 'var(--font-mono)' }}>
                    {(rules || []).map((r, idx) => (
                        <div key={idx} style={{ color: 'var(--text-dim)', marginBottom: 2 }}>
                            {r}
                        </div>
                    ))}
                </div>
            ),
        },
        {
            title: t('k8s:network.colCreatedAt'),
            dataIndex: 'createdAt',
            key: 'createdAt',
            width: 160,
            render: (tVal: string) => (
                <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{tVal || '-'}</span>
            ),
        },
        {
            title: t('k8s:network.colActions'),
            key: 'actions',
            width: 170,
            align: 'right',
            render: (_, record) => (
                <Space size={6}>
                    <Button
                        size="small"
                        icon={<Code size={12} />}
                        onClick={() => openEditYaml('Ingress', record.namespace, record.name)}
                    >
                        {t('common.edit')}
                    </Button>
                    <Popconfirm
                        title={t('k8s:network.deleteIngressConfirm', { name: record.name })}
                        description={t('k8s:network.deleteIngressDesc', { namespace: record.namespace })}
                        okText={t('common.confirm')}
                        cancelText={t('common.cancel')}
                        okButtonProps={{ danger: true }}
                        onConfirm={() => handleDeleteIngress(record)}
                    >
                        <Button size="small" danger icon={<Trash2 size={12} />}>
                            {t('common.delete')}
                        </Button>
                    </Popconfirm>
                </Space>
            ),
        },
    ]

    return (
        <div>
            {/* 顶部工具栏 */}
            <div className={s.toolbar}>
                <div className={s.toolbarLeft}>
                    <Segmented
                        size="small"
                        value={subTab}
                        onChange={(v) => {
                            setSubTab(v as any)
                            setPage(1)
                        }}
                        options={[
                            {
                                label: (
                                    <Space size={6}>
                                        <Network size={13} />
                                        <span>{t('k8s:network.servicesTab', { count: services.length })}</span>
                                    </Space>
                                ),
                                value: 'service',
                            },
                            {
                                label: (
                                    <Space size={6}>
                                        <Globe size={13} />
                                        <span>{t('k8s:network.ingressTab', { count: ingresses.length })}</span>
                                    </Space>
                                ),
                                value: 'ingress',
                            },
                        ]}
                    />

                    <Input
                        placeholder={subTab === 'service' ? t('k8s:network.searchServicePlaceholder') : t('k8s:network.searchIngressPlaceholder')}
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
                        type="primary"
                        icon={<Plus size={13} />}
                        size="small"
                        onClick={() => openCreateYaml(subTab === 'service' ? 'Service' : 'Ingress')}
                    >
                        {`${t('common.create')} ${subTab === 'service' ? 'Service' : 'Ingress'}`}
                    </Button>
                    <Button
                        icon={<RefreshCw size={13} className={loading ? 'animate-spin' : ''} />}
                        size="small"
                        onClick={fetchData}
                    >
                        {t('common.refresh')}
                    </Button>
                </div>
            </div>

            {/* 表格 */}
            {subTab === 'service' ? (
                <Table
                    columns={serviceColumns}
                    dataSource={filteredServices}
                    rowKey={(r) => `${r.namespace}/${r.name}`}
                    loading={loading}
                    size="small"
                    pagination={{
                        current: page,
                        pageSize: pageSize,
                        total: filteredServices.length,
                        showSizeChanger: true,
                        pageSizeOptions: ['10', '20', '50', '100'],
                        showTotal: (total, range) => t('common.paginationTotal', { defaultValue: `第 ${range[0]}-${range[1]} 条 / 共 ${total} 条`, from: range[0], to: range[1], total }),
                        onChange: (p, ps) => {
                            setPage(p)
                            setPageSize(ps)
                        },
                    }}
                />
            ) : (
                <Table
                    columns={ingressColumns}
                    dataSource={filteredIngresses}
                    rowKey={(r) => `${r.namespace}/${r.name}`}
                    loading={loading}
                    size="small"
                    pagination={{
                        current: page,
                        pageSize: pageSize,
                        total: filteredIngresses.length,
                        showSizeChanger: true,
                        pageSizeOptions: ['10', '20', '50', '100'],
                        showTotal: (total, range) => t('common.paginationTotal', { defaultValue: `第 ${range[0]}-${range[1]} 条 / 共 ${total} 条`, from: range[0], to: range[1], total }),
                        onChange: (p, ps) => {
                            setPage(p)
                            setPageSize(ps)
                        },
                    }}
                />
            )}

            {/* YAML 模态框 */}
            <K8sResourceYamlModal
                open={yamlModalOpen}
                onClose={() => {
                    setYamlModalOpen(false)
                    setYamlTarget(null)
                }}
                serverId={serverId}
                kind={yamlKind}
                namespace={yamlTarget?.namespace || (currentNamespace !== '_all' ? currentNamespace : 'default')}
                name={yamlTarget?.name || ''}
                mode={yamlMode}
                initialYaml={
                    yamlMode === 'create'
                        ? yamlKind === 'Service'
                            ? DEFAULT_SERVICE_TEMPLATE(currentNamespace)
                            : DEFAULT_INGRESS_TEMPLATE(currentNamespace)
                        : undefined
                }
                onSuccess={fetchData}
            />
        </div>
    )
}
