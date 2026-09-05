import React, { useState, useEffect } from 'react'
import {
    Table,
    Space,
    Tag,
    Button,
    Input,
    Segmented,
    Modal,
    message,
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
import { API } from '@/api'
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
            message.error(`获取数据失败: ${err.message || String(err)}`)
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
            message.error(`删除 Service 失败: ${err.message || String(err)}`)
        }
    }

    const handleDeleteIngress = async (record: K8sIngressInfo) => {
        try {
            await API.k8sDeleteIngress(serverId, record.namespace, record.name)
            fetchData()
        } catch (err: any) {
            message.error(`删除 Ingress 失败: ${err.message || String(err)}`)
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
            title: '服务名称',
            dataIndex: 'name',
            key: 'name',
            render: (name: string, record) => (
                <Space size={8}>
                    <Network size={14} color="var(--accent)" />
                    <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>{name}</span>
                    <Tooltip title="复制服务名称">
                        <Button
                            size="small"
                            type="text"
                            icon={<Copy size={11} />}
                            onClick={() => {
                                navigator.clipboard.writeText(name)
                            }}
                        />
                    </Tooltip>
                </Space>
            ),
        },
        {
            title: '命名空间',
            dataIndex: 'namespace',
            key: 'namespace',
            width: 140,
            render: (ns: string) => <Tag color="blue">{ns}</Tag>,
        },
        {
            title: '服务类型',
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
            title: '暴露端口 (Port : Target / Node)',
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
            title: '创建时间',
            dataIndex: 'createdAt',
            key: 'createdAt',
            width: 160,
            render: (t: string) => (
                <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{t || '-'}</span>
            ),
        },
        {
            title: '操作',
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
                        编辑
                    </Button>
                    <Popconfirm
                        title={`确定删除 Service [${record.name}] 吗？`}
                        description={`所属命名空间: ${record.namespace}。删除后将停止该服务的集群内外部流量转发，此操作不可逆。`}
                        okText="确认删除"
                        cancelText="取消"
                        okButtonProps={{ danger: true }}
                        onConfirm={() => handleDeleteService(record)}
                    >
                        <Button size="small" danger icon={<Trash2 size={12} />}>
                            删除
                        </Button>
                    </Popconfirm>
                </Space>
            ),
        },
    ]

    const ingressColumns: ColumnsType<K8sIngressInfo> = [
        {
            title: '路由名称 (Ingress Name)',
            dataIndex: 'name',
            key: 'name',
            render: (name: string, record) => (
                <Space size={8}>
                    <Globe size={14} color="var(--accent)" />
                    <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>{name}</span>
                    <Tooltip title="复制 Ingress 名称">
                        <Button
                            size="small"
                            type="text"
                            icon={<Copy size={11} />}
                            onClick={() => {
                                navigator.clipboard.writeText(name)
                            }}
                        />
                    </Tooltip>
                </Space>
            ),
        },
        {
            title: '命名空间',
            dataIndex: 'namespace',
            key: 'namespace',
            width: 140,
            render: (ns: string) => <Tag color="blue">{ns}</Tag>,
        },
        {
            title: 'Class',
            dataIndex: 'ingressClass',
            key: 'ingressClass',
            width: 120,
            render: (cls: string) => <Tag color="purple">{cls || 'default'}</Tag>,
        },
        {
            title: 'Hosts 域名',
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
            title: '路由规则 (Rules)',
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
            title: '创建时间',
            dataIndex: 'createdAt',
            key: 'createdAt',
            width: 160,
            render: (t: string) => (
                <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{t || '-'}</span>
            ),
        },
        {
            title: '操作',
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
                        编辑
                    </Button>
                    <Popconfirm
                        title={`确定删除 Ingress [${record.name}] 吗？`}
                        description={`所属命名空间: ${record.namespace}。删除后域名路由转发将立即失效，此操作不可逆。`}
                        okText="确认删除"
                        cancelText="取消"
                        okButtonProps={{ danger: true }}
                        onConfirm={() => handleDeleteIngress(record)}
                    >
                        <Button size="small" danger icon={<Trash2 size={12} />}>
                            删除
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
                                        <span>Services ({services.length})</span>
                                    </Space>
                                ),
                                value: 'service',
                            },
                            {
                                label: (
                                    <Space size={6}>
                                        <Globe size={13} />
                                        <span>Ingress 路由 ({ingresses.length})</span>
                                    </Space>
                                ),
                                value: 'ingress',
                            },
                        ]}
                    />

                    <Input
                        placeholder={`搜索 ${subTab === 'service' ? '服务' : 'Ingress'} 名称 / 命名空间 / IP / 域名...`}
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
                        新建 {subTab === 'service' ? 'Service' : 'Ingress'}
                    </Button>
                    <Button
                        icon={<RefreshCw size={13} className={loading ? 'animate-spin' : ''} />}
                        size="small"
                        onClick={fetchData}
                    >
                        刷新
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
                        showTotal: (total, range) => `第 ${range[0]}-${range[1]} 条 / 共 ${total} 条`,
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
                        showTotal: (total, range) => `第 ${range[0]}-${range[1]} 条 / 共 ${total} 条`,
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
