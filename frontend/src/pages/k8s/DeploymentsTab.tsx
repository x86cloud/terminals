import React, { useState, useEffect } from 'react'
import {
    Table,
    Space,
    Tag,
    Button,
    Input,
    Modal,
    InputNumber,
    message,
    Popconfirm,
    Tooltip,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
    RotateCw,
    Search,
    RefreshCw,
    Copy,
    Code,
    TrendingUp,
    Trash2,
    Plus,
} from 'lucide-react'
import { API } from '@/api'
import K8sResourceYamlModal from './K8sResourceYamlModal'
import type { K8sDeploymentInfo } from '@/types'
import s from './K8sClient.module.less'

interface Props {
    serverId: string
    currentNamespace: string
}

const DEFAULT_DEPLOY_TEMPLATE = (namespace: string) => `apiVersion: apps/v1
kind: Deployment
metadata:
  name: sample-deployment
  namespace: ${namespace && namespace !== '_all' ? namespace : 'default'}
  labels:
    app: sample-app
spec:
  replicas: 2
  selector:
    matchLabels:
      app: sample-app
  template:
    metadata:
      labels:
        app: sample-app
    spec:
      containers:
      - name: sample-app
        image: nginx:alpine
        ports:
        - containerPort: 80
        resources:
          requests:
            cpu: 100m
            memory: 128Mi
          limits:
            cpu: 500m
            memory: 512Mi
`

export default function DeploymentsTab({ serverId, currentNamespace }: Props) {
    const [deployments, setDeployments] = useState<K8sDeploymentInfo[]>([])
    const [loading, setLoading] = useState(false)
    const [searchKw, setSearchKw] = useState('')
    const [page, setPage] = useState(1)
    const [pageSize, setPageSize] = useState(10)

    // 扩缩容模态框
    const [scaleModalOpen, setScaleModalOpen] = useState(false)
    const [activeDeploy, setActiveDeploy] = useState<K8sDeploymentInfo | null>(null)
    const [targetReplicas, setTargetReplicas] = useState<number>(1)
    const [scaleLoading, setScaleLoading] = useState(false)

    // YAML 模态框 (查看/编辑/新建)
    const [yamlModalOpen, setYamlModalOpen] = useState(false)
    const [yamlMode, setYamlMode] = useState<'view' | 'edit' | 'create'>('edit')
    const [yamlTarget, setYamlTarget] = useState<{ namespace: string; name: string } | null>(null)

    const fetchDeployments = async () => {
        setLoading(true)
        try {
            const list = await API.k8sListDeployments(serverId, currentNamespace)
            setDeployments(list)
        } catch (err: any) {
            message.error(`获取 Deployment 列表失败: ${err.message || String(err)}`)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchDeployments()
    }, [serverId, currentNamespace])

    const handleScale = async () => {
        if (!activeDeploy) return
        setScaleLoading(true)
        try {
            await API.k8sScaleDeployment(serverId, activeDeploy.namespace, activeDeploy.name, targetReplicas)
            message.success(`Deployment [${activeDeploy.name}] 副本数已调整为 ${targetReplicas}`)
            setScaleModalOpen(false)
            fetchDeployments()
        } catch (err: any) {
            message.error(`扩缩容失败: ${err.message || String(err)}`)
        } finally {
            setScaleLoading(false)
        }
    }

    const handleRestart = async (record: K8sDeploymentInfo) => {
        try {
            await API.k8sRestartDeployment(serverId, record.namespace, record.name)
            message.success(`Deployment [${record.name}] 已触发滚动重启`)
            fetchDeployments()
        } catch (err: any) {
            message.error(`重启 Deployment 失败: ${err.message || String(err)}`)
        }
    }

    const handleDeleteDeployment = async (record: K8sDeploymentInfo) => {
        try {
            await API.k8sDeleteDeployment(serverId, record.namespace, record.name)
            message.success(`Deployment [${record.name}] 已成功删除`)
            fetchDeployments()
        } catch (err: any) {
            message.error(`删除 Deployment 失败: ${err.message || String(err)}`)
        }
    }

    const openEditYaml = (record: K8sDeploymentInfo) => {
        setYamlTarget({ namespace: record.namespace, name: record.name })
        setYamlMode('edit')
        setYamlModalOpen(true)
    }

    const openCreateYaml = () => {
        setYamlTarget(null)
        setYamlMode('create')
        setYamlModalOpen(true)
    }

    const filtered = deployments.filter((d) => {
        if (!searchKw) return true
        const kw = searchKw.toLowerCase()
        return (
            d.name.toLowerCase().includes(kw) ||
            d.namespace.toLowerCase().includes(kw) ||
            (d.images && d.images.some((img) => img.toLowerCase().includes(kw)))
        )
    })

    const columns: ColumnsType<K8sDeploymentInfo> = [
        {
            title: '应用名称 (Deployment Name)',
            dataIndex: 'name',
            key: 'name',
            render: (name: string, record) => (
                <div>
                    <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>{name}</span>
                    <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                        命名空间: <Tag color="blue" style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px' }}>{record.namespace}</Tag>
                    </div>
                </div>
            ),
        },
        {
            title: '状态 (Status)',
            key: 'status',
            width: 140,
            render: (_, record) => {
                const isHealthy = record.readyReplicas === record.replicas && record.replicas > 0
                return (
                    <span className={`${s.statusBadge} ${isHealthy ? s.statusRunning : s.statusPending}`}>
                        {isHealthy && <span className={s.pulseDot} />}
                        <span>{record.readyReplicas} / {record.replicas} Ready</span>
                    </span>
                )
            },
        },
        {
            title: '更新策略',
            dataIndex: 'strategy',
            key: 'strategy',
            width: 120,
            render: (st: string) => <Tag color="default">{st || 'RollingUpdate'}</Tag>,
        },
        {
            title: '容器镜像 (Images)',
            dataIndex: 'images',
            key: 'images',
            render: (images: string[]) => (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {(images || []).map((img, idx) => (
                        <span key={idx} className={s.monoText} style={{ fontSize: 11.5, wordBreak: 'break-all' }}>
                            {img}
                        </span>
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
            width: 290,
            align: 'right',
            render: (_, record) => (
                <Space size={6}>
                    <Button
                        size="small"
                        icon={<TrendingUp size={12} />}
                        onClick={() => {
                            setActiveDeploy(record)
                            setTargetReplicas(record.replicas)
                            setScaleModalOpen(true)
                        }}
                    >
                        扩缩容
                    </Button>
                    <Popconfirm
                        title={`确定重启 Deployment [${record.name}] 吗？`}
                        description="将触发 Rolling Update 滚动平滑重启所有 Pod 副本。"
                        okText="确认重启"
                        cancelText="取消"
                        onConfirm={() => handleRestart(record)}
                    >
                        <Button size="small" icon={<RotateCw size={12} />}>
                            重启
                        </Button>
                    </Popconfirm>
                    <Button
                        size="small"
                        icon={<Code size={12} />}
                        onClick={() => openEditYaml(record)}
                    >
                        编辑
                    </Button>
                    <Popconfirm
                        title={`确定删除 Deployment [${record.name}] 吗？`}
                        description={`所属命名空间: ${record.namespace}。删除后该应用所属的所有 Pod 副本也将被同时销毁，此操作不可逆。`}
                        okText="确认删除"
                        cancelText="取消"
                        okButtonProps={{ danger: true }}
                        onConfirm={() => handleDeleteDeployment(record)}
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
                    <Input
                        placeholder="搜索 Deployment 名称 / 镜像 / 命名空间..."
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
                        onClick={openCreateYaml}
                    >
                        新建
                    </Button>
                    <Button
                        icon={<RefreshCw size={13} className={loading ? 'animate-spin' : ''} />}
                        size="small"
                        onClick={fetchDeployments}
                    >
                        刷新
                    </Button>
                </div>
            </div>

            {/* Deployment 表格 */}
            <Table
                columns={columns}
                dataSource={filtered}
                rowKey={(r) => `${r.namespace}/${r.name}`}
                loading={loading}
                size="small"
                pagination={{
                    current: page,
                    pageSize: pageSize,
                    total: filtered.length,
                    showSizeChanger: true,
                    pageSizeOptions: ['10', '20', '50', '100'],
                    showTotal: (total, range) => `第 ${range[0]}-${range[1]} 条 / 共 ${total} 条`,
                    onChange: (p, ps) => {
                        setPage(p)
                        setPageSize(ps)
                    },
                }}
            />

            {/* 扩缩容模态框 */}
            <Modal
                closeIcon={false}
                open={scaleModalOpen}
                title={
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <TrendingUp size={16} color="var(--accent)" />
                        <span>调整副本数量: {activeDeploy?.name}</span>
                    </div>
                }
                width={420}
                onCancel={() => setScaleModalOpen(false)}
                onOk={handleScale}
                confirmLoading={scaleLoading}
                okText="确认调整"
                cancelText="取消"
            >
                <div style={{ padding: '12px 0' }}>
                    <div style={{ fontSize: 13, marginBottom: 8, color: 'var(--text-dim)' }}>
                        命名空间: <Tag color="blue">{activeDeploy?.namespace}</Tag>
                    </div>
                    <div style={{ fontSize: 13, marginBottom: 8 }}>目标 Pod 副本数 (Replicas):</div>
                    <InputNumber
                        min={0}
                        max={200}
                        value={targetReplicas}
                        onChange={(val) => setTargetReplicas(val ?? 0)}
                        style={{ width: '100%' }}
                    />
                    <div style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 8 }}>
                        提示：设置为 0 时将停止所有副本容器。
                    </div>
                </div>
            </Modal>

            {/* YAML 模态框 */}
            <K8sResourceYamlModal
                open={yamlModalOpen}
                onClose={() => {
                    setYamlModalOpen(false)
                    setYamlTarget(null)
                }}
                serverId={serverId}
                kind="Deployment"
                namespace={yamlTarget?.namespace || (currentNamespace !== '_all' ? currentNamespace : 'default')}
                name={yamlTarget?.name || ''}
                mode={yamlMode}
                initialYaml={yamlMode === 'create' ? DEFAULT_DEPLOY_TEMPLATE(currentNamespace) : undefined}
                onSuccess={fetchDeployments}
            />
        </div>
    )
}
