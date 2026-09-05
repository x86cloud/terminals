import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
    Table,
    Space,
    Tag,
    Button,
    Input,
    Select,
    Drawer,
    Modal,
    message,
    Popconfirm,
    Tooltip,
    Switch,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
    Box,
    Terminal,
    FileText,
    Trash2,
    Search,
    RefreshCw,
    Copy,
    Code,
    Download,
    Plus,
} from 'lucide-react'
import { API } from '@/api'
import K8sResourceYamlModal from './K8sResourceYamlModal'
import ContainerTerminalModal, { ContainerExecTarget } from '@/components/common/ContainerTerminalModal'
import type { K8sPodInfo, K8sContainerSummary } from '@/types'
import { errorMessage } from '@/utils'
import s from './K8sClient.module.less'

interface Props {
    serverId: string
    currentNamespace: string
    initialSearchKw?: string
}

const DEFAULT_POD_TEMPLATE = (namespace: string) => `apiVersion: v1
kind: Pod
metadata:
  name: sample-pod
  namespace: ${namespace && namespace !== '_all' ? namespace : 'default'}
  labels:
    app: sample-pod
spec:
  containers:
  - name: main
    image: nginx:alpine
    ports:
    - containerPort: 80
`

export default function PodsTab({ serverId, currentNamespace, initialSearchKw }: Props) {
    const [pods, setPods] = useState<K8sPodInfo[]>([])
    const [loading, setLoading] = useState(false)
    const [searchKw, setSearchKw] = useState(initialSearchKw || '')
    const [statusFilter, setStatusFilter] = useState('ALL')
    const [page, setPage] = useState(1)
    const [pageSize, setPageSize] = useState(10)

    useEffect(() => {
        if (initialSearchKw !== undefined) {
            setSearchKw(initialSearchKw)
            setPage(1)
        }
    }, [initialSearchKw])

    // 日志抽屉状态
    const [logsDrawerOpen, setLogsDrawerOpen] = useState(false)
    const [activePod, setActivePod] = useState<K8sPodInfo | null>(null)
    const [selectedContainer, setSelectedContainer] = useState('')
    const [logsTail, setLogsTail] = useState(200)
    const [logsTimestamps, setLogsTimestamps] = useState(true)
    const [logsContent, setLogsContent] = useState('')
    const [logsLoading, setLogsLoading] = useState(false)
    const logScrollRef = useRef<HTMLDivElement>(null)

    // YAML 模态框 (查看/编辑/新建)
    const [yamlModalOpen, setYamlModalOpen] = useState(false)
    const [yamlMode, setYamlMode] = useState<'view' | 'edit' | 'create'>('edit')
    const [yamlTarget, setYamlTarget] = useState<{ namespace: string; name: string } | null>(null)

    // 容器交互式终端模态框
    const [termModalOpen, setTermModalOpen] = useState(false)
    const [termTarget, setTermTarget] = useState<ContainerExecTarget | null>(null)

    const openTerminalModal = (pod: K8sPodInfo, container: K8sContainerSummary) => {
        setTermTarget({
            type: 'k8s',
            serverId,
            namespace: pod.namespace,
            podName: pod.name,
            containerName: container.name,
            title: `${pod.name} (${container.name})`,
            image: container.image,
        })
        setTermModalOpen(true)
    }

    const fetchPods = useCallback(async () => {
        setLoading(true)
        try {
            const list = await API.k8sListPods(serverId, currentNamespace)
            setPods(list || [])
        } catch (err: unknown) {
            message.error(`获取 Pod 列表失败: ${errorMessage(err)}`)
        } finally {
            setLoading(false)
        }
    }, [serverId, currentNamespace])

    useEffect(() => {
        let active = true
        setLoading(true)
        API.k8sListPods(serverId, currentNamespace)
            .then((list) => {
                if (active) setPods(list || [])
            })
            .catch((err: unknown) => {
                if (active) message.error(`获取 Pod 列表失败: ${errorMessage(err)}`)
            })
            .finally(() => {
                if (active) setLoading(false)
            })
        return () => {
            active = false
        }
    }, [serverId, currentNamespace])

    const fetchLogs = async (pod: K8sPodInfo, container?: string) => {
        setLogsLoading(true)
        try {
            const cName = container || pod.containers?.[0]?.name || ''
            const text = await API.k8sGetPodLogs(
                serverId,
                pod.namespace,
                pod.name,
                cName,
                logsTail,
                logsTimestamps
            )
            setLogsContent(text || '（暂无容器日志输出）')
        } catch (err: any) {
            message.error(`获取日志失败: ${err.message || String(err)}`)
            setLogsContent(`错误: ${err.message || String(err)}`)
        } finally {
            setLogsLoading(false)
        }
    }

    const openLogsDrawer = (pod: K8sPodInfo, containerName?: string) => {
        setActivePod(pod)
        const targetContainer = containerName || pod.containers?.[0]?.name || ''
        setSelectedContainer(targetContainer)
        setLogsDrawerOpen(true)
        fetchLogs(pod, targetContainer)
    }

    const openEditYaml = (pod: K8sPodInfo) => {
        setYamlTarget({ namespace: pod.namespace, name: pod.name })
        setYamlMode('edit')
        setYamlModalOpen(true)
    }

    const openCreateYaml = () => {
        setYamlTarget(null)
        setYamlMode('create')
        setYamlModalOpen(true)
    }

    const handleDeletePod = async (pod: K8sPodInfo) => {
        try {
            await API.k8sDeletePod(serverId, pod.namespace, pod.name)
            fetchPods()
        } catch (err: any) {
            message.error(`删除 Pod 失败: ${err.message || String(err)}`)
        }
    }

    const filtered = pods.filter((p) => {
        if (statusFilter !== 'ALL') {
            if (statusFilter === 'Running' && p.status !== 'Running') return false
            if (statusFilter === 'Pending' && p.status !== 'Pending') return false
            if (statusFilter === 'Error' && ['Running', 'Pending', 'Succeeded', 'Completed'].includes(p.status)) return false
        }
        if (!searchKw) return true
        const kw = searchKw.toLowerCase()
        return (
            p.name.toLowerCase().includes(kw) ||
            p.namespace.toLowerCase().includes(kw) ||
            (p.ip && p.ip.includes(kw)) ||
            (p.nodeName && p.nodeName.toLowerCase().includes(kw))
        )
    })

    const columns: ColumnsType<K8sPodInfo> = [
        {
            title: 'Pod 名称',
            dataIndex: 'name',
            key: 'name',
            render: (name: string, record) => (
                <Space size={8}>
                    <Box size={15} color="var(--accent)" />
                    <div>
                        <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>
                            {name}
                        </span>
                        <Tooltip title="复制 Pod 名称">
                            <Button
                                size="small"
                                type="text"
                                icon={<Copy size={11} />}
                                style={{ marginLeft: 4 }}
                                onClick={() => {
                                    navigator.clipboard.writeText(name)
                                }}
                            />
                        </Tooltip>
                    </div>
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
            title: '状态 (Status)',
            dataIndex: 'status',
            key: 'status',
            width: 150,
            render: (status: string) => {
                let badgeClass = s.statusDefault
                let isRunning = false
                if (status === 'Running') {
                    badgeClass = s.statusRunning
                    isRunning = true
                } else if (status === 'Pending') {
                    badgeClass = s.statusPending
                } else if (status.includes('BackOff') || status === 'Failed' || status === 'Error') {
                    badgeClass = s.statusFailed
                }
                return (
                    <span className={`${s.statusBadge} ${badgeClass}`}>
                        {isRunning && <span className={s.pulseDot} />}
                        <span>{status}</span>
                    </span>
                )
            },
        },
        {
            title: '就绪容器',
            dataIndex: 'ready',
            key: 'ready',
            width: 100,
            render: (ready: string) => <span className={s.monoText}>{ready}</span>,
        },
        {
            title: '重启次数',
            dataIndex: 'restarts',
            key: 'restarts',
            width: 100,
            render: (restarts: number) => (
                <span
                    className={s.monoText}
                    style={{ color: restarts > 0 ? 'var(--danger)' : 'var(--text-dim)' }}
                >
                    {restarts}
                </span>
            ),
        },
        {
            title: 'Pod IP',
            dataIndex: 'ip',
            key: 'ip',
            width: 130,
            render: (ip: string) => <span className={s.monoText}>{ip || '-'}</span>,
        },
        {
            title: '运行主机',
            dataIndex: 'nodeName',
            key: 'nodeName',
            width: 160,
            render: (nodeName: string, record) => (
                <div>
                    <span style={{ fontWeight: 500, fontSize: 12.5, color: 'var(--text)' }}>
                        {nodeName || '-'}
                    </span>
                    {record.hostIp && record.hostIp !== nodeName && (
                        <div style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                            {record.hostIp}
                        </div>
                    )}
                </div>
            ),
        },
        {
            title: '存活时间',
            dataIndex: 'age',
            key: 'age',
            width: 100,
            render: (age: string, record) => (
                <span style={{ fontSize: 12, color: 'var(--text-dim)' }} title={record.createdAt}>
                    {age}
                </span>
            ),
        },
        {
            title: '操作',
            key: 'actions',
            width: 250,
            align: 'right',
            render: (_, record) => (
                <Space size={6}>
                    <Button
                        size="small"
                        icon={<FileText size={12} />}
                        onClick={() => openLogsDrawer(record)}
                    >
                        日志
                    </Button>
                    <Button
                        size="small"
                        icon={<Code size={12} />}
                        onClick={() => openEditYaml(record)}
                    >
                        编辑
                    </Button>
                    <Popconfirm
                        title={`确定删除 Pod [${record.name}] 吗？`}
                        description={`所属命名空间: ${record.namespace}。如果是控制器管理的 Pod，集群将自动创建新 Pod 替代。`}
                        okText="确认删除"
                        cancelText="取消"
                        okButtonProps={{ danger: true }}
                        onConfirm={() => handleDeletePod(record)}
                    >
                        <Button
                            size="small"
                            danger
                            icon={<Trash2 size={12} />}
                        >
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
                        placeholder="搜索 Pod 名称 / 命名空间 / IP / 所在节点..."
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

                    <Select
                        size="small"
                        value={statusFilter}
                        onChange={(val) => {
                            setStatusFilter(val)
                            setPage(1)
                        }}
                        style={{ width: 120 }}
                        options={[
                            { label: '全部状态', value: 'ALL' },
                            { label: 'Running', value: 'Running' },
                            { label: 'Pending', value: 'Pending' },
                            { label: '异常/错误', value: 'Error' },
                        ]}
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
                        onClick={fetchPods}
                    >
                        刷新
                    </Button>
                </div>
            </div>

            {/* Pod 表格 */}
            <Table
                columns={columns}
                dataSource={filtered}
                rowKey={(r) => `${r.namespace}/${r.name}`}
                loading={loading}
                size="small"
                expandable={{
                    expandedRowRender: (record: K8sPodInfo) => {
                        const containers = record.containers || []
                        if (containers.length === 0) {
                            return (
                                <div style={{ padding: '8px 16px', color: 'var(--text-dim)', fontSize: 12 }}>
                                    暂无容器详细信息
                                </div>
                            )
                        }
                        return (
                            <div className={s.expandedContainerBox}>
                                <div className={s.expandedHeader}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <Box size={13} color="var(--accent)" />
                                        <span>容器列表 ({containers.length})</span>
                                    </div>
                                </div>
                                <Table
                                    size="small"
                                    pagination={false}
                                    rowKey="name"
                                    dataSource={containers}
                                    columns={[
                                        {
                                            title: '容器名称',
                                            dataIndex: 'name',
                                            key: 'name',
                                            width: 200,
                                            render: (name: string, c: K8sContainerSummary) => (
                                                <Space size={6}>
                                                    <span style={{ fontWeight: 600, fontSize: 12.5, color: 'var(--text)' }}>
                                                        {name}
                                                    </span>
                                                    {c.isInit && (
                                                        <Tag color="purple" style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px', margin: 0 }}>
                                                            Init
                                                        </Tag>
                                                    )}
                                                </Space>
                                            ),
                                        },
                                        {
                                            title: '容器镜像 (Image)',
                                            dataIndex: 'image',
                                            key: 'image',
                                            render: (img: string) => (
                                                <Space size={6}>
                                                    <span className={s.monoText} style={{ fontSize: 11.5, wordBreak: 'break-all' }}>
                                                        {img}
                                                    </span>
                                                    <Tooltip title="复制镜像名称">
                                                        <Button
                                                            size="small"
                                                            type="text"
                                                            icon={<Copy size={11} />}
                                                            onClick={() => {
                                                                navigator.clipboard.writeText(img)
                                                            }}
                                                        />
                                                    </Tooltip>
                                                </Space>
                                            ),
                                        },
                                        {
                                            title: '状态',
                                            dataIndex: 'state',
                                            key: 'state',
                                            width: 140,
                                            render: (st: string, c: K8sContainerSummary) => {
                                                if (st === 'running') return <Tag color="success">Running</Tag>
                                                if (st === 'waiting') return <Tag color="warning">{c.reason || 'Waiting'}</Tag>
                                                if (st === 'terminated') return <Tag color="default">{c.reason || 'Terminated'}</Tag>
                                                return <Tag>{st || 'Unknown'}</Tag>
                                            },
                                        },
                                        {
                                            title: '就绪 (Ready)',
                                            dataIndex: 'ready',
                                            key: 'ready',
                                            width: 100,
                                            render: (ready: boolean) => (
                                                <Tag color={ready ? 'green' : 'default'}>
                                                    {ready ? 'Ready' : 'Not Ready'}
                                                </Tag>
                                            ),
                                        },
                                        {
                                            title: '重启',
                                            dataIndex: 'restartCount',
                                            key: 'restartCount',
                                            width: 80,
                                            render: (count: number) => (
                                                <span
                                                    className={s.monoText}
                                                    style={{ color: count > 0 ? 'var(--danger)' : 'var(--text-dim)' }}
                                                >
                                                    {count}
                                                </span>
                                            ),
                                        },
                                        {
                                            title: '操作',
                                            key: 'cActions',
                                            width: 160,
                                            align: 'right',
                                            render: (_, c: K8sContainerSummary) => {
                                                const isRunning = c.state?.toLowerCase() === 'running'
                                                return (
                                                    <Space size={6}>
                                                        <Button
                                                            size="small"
                                                            disabled={!isRunning}
                                                            icon={<Terminal size={12} />}
                                                            onClick={() => openTerminalModal(record, c)}
                                                            title={isRunning ? "进入容器交互式终端 (/bin/sh)" : "仅 Running 状态容器支持终端连接"}
                                                        >
                                                            终端
                                                        </Button>
                                                        <Button
                                                            size="small"
                                                            icon={<FileText size={12} />}
                                                            onClick={() => openLogsDrawer(record, c.name)}
                                                            title="查看该容器运行日志"
                                                        >
                                                            日志
                                                        </Button>
                                                    </Space>
                                                )
                                            },
                                        },
                                    ]}
                                />
                            </div>
                        )
                    },
                    rowExpandable: (record) => (record.containers?.length ?? 0) > 0,
                }}
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

            {/* 日志抽屉 */}
            <Drawer
                title={
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <FileText size={16} color="var(--accent)" />
                        <span>Pod 日志: {activePod?.name}</span>
                    </div>
                }
                size={820}
                onClose={() => setLogsDrawerOpen(false)}
                destroyOnHidden
                extra={
                    <Space size={10}>
                        {activePod && activePod.containers && activePod.containers.length > 1 && (
                            <Select
                                size="small"
                                value={selectedContainer}
                                onChange={(c) => {
                                    setSelectedContainer(c)
                                    if (activePod) fetchLogs(activePod, c)
                                }}
                                style={{ width: 160 }}
                                options={activePod.containers.map((c) => ({
                                    label: c.isInit ? `[Init] ${c.name}` : `容器: ${c.name}`,
                                    value: c.name,
                                }))}
                            />
                        )}

                        <Select
                            size="small"
                            value={logsTail}
                            onChange={(t) => {
                                setLogsTail(t)
                                if (activePod) fetchLogs(activePod, selectedContainer)
                            }}
                            style={{ width: 110 }}
                            options={[
                                { label: '最新 100 行', value: 100 },
                                { label: '最新 200 行', value: 200 },
                                { label: '最新 500 行', value: 500 },
                                { label: '最新 1000 行', value: 1000 },
                            ]}
                        />

                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <Switch
                                size="small"
                                checked={logsTimestamps}
                                onChange={(checked) => {
                                    setLogsTimestamps(checked)
                                    if (activePod) fetchLogs(activePod, selectedContainer)
                                }}
                            />
                            <span style={{ fontSize: 12 }}>时间戳</span>
                        </div>

                        <Button
                            size="small"
                            icon={<RefreshCw size={12} className={logsLoading ? 'animate-spin' : ''} />}
                            onClick={() => activePod && fetchLogs(activePod, selectedContainer)}
                        >
                            刷新
                        </Button>

                        <Button
                            size="small"
                            icon={<Copy size={12} />}
                            onClick={() => {
                                navigator.clipboard.writeText(logsContent)
                            }}
                        >
                            复制
                        </Button>

                        <Button
                            size="small"
                            icon={<Download size={12} />}
                            onClick={() => {
                                const blob = new Blob([logsContent], { type: 'text/plain;charset=utf-8' })
                                const url = URL.createObjectURL(blob)
                                const a = document.createElement('a')
                                a.href = url
                                a.download = `${activePod?.name}_${selectedContainer || 'log'}.log`
                                a.click()
                                URL.revokeObjectURL(url)
                            }}
                        >
                            导出
                        </Button>
                    </Space>
                }
            >
                <div className={s.logTerminal} ref={logScrollRef}>
                    {logsLoading ? '正在加载日志...' : logsContent}
                </div>
            </Drawer>

            {/* YAML 模态框 */}
            <K8sResourceYamlModal
                open={yamlModalOpen}
                onClose={() => {
                    setYamlModalOpen(false)
                    setYamlTarget(null)
                }}
                serverId={serverId}
                kind="Pod"
                namespace={yamlTarget?.namespace || 'default'}
                name={yamlTarget?.name || ''}
                mode="edit"
                onSuccess={fetchPods}
            />

            {/* 统一容器交互式终端模态框 */}
            <ContainerTerminalModal
                open={termModalOpen}
                onClose={() => {
                    setTermModalOpen(false)
                    setTermTarget(null)
                }}
                target={termTarget}
            />
        </div>
    )
}
