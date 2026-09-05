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
    FileCode,
    Lock,
    HardDrive,
    Search,
    RefreshCw,
    Copy,
    Code,
    Trash2,
    Plus,
} from 'lucide-react'
import { API } from '@/api'
import K8sResourceYamlModal from './K8sResourceYamlModal'
import type { K8sConfigMapInfo, K8sSecretInfo, K8sPVCInfo } from '@/types'
import s from './K8sClient.module.less'

interface Props {
    serverId: string
    currentNamespace: string
    initialSearchKw?: string
    initialSubTab?: 'configmap' | 'secret' | 'pvc'
}

const DEFAULT_CONFIGMAP_TEMPLATE = (namespace: string) => `apiVersion: v1
kind: ConfigMap
metadata:
  name: sample-config
  namespace: ${namespace && namespace !== '_all' ? namespace : 'default'}
data:
  APP_ENV: "production"
  DATABASE_URL: "mysql://user:pass@host:3306/db"
  config.json: |
    {
      "debug": false,
      "port": 8080
    }
`

const DEFAULT_SECRET_TEMPLATE = (namespace: string) => `apiVersion: v1
kind: Secret
metadata:
  name: sample-secret
  namespace: ${namespace && namespace !== '_all' ? namespace : 'default'}
type: Opaque
stringData:
  DB_PASSWORD: "YourSecretPassword123!"
  API_KEY: "sk-abcdef123456"
`

const DEFAULT_PVC_TEMPLATE = (namespace: string) => `apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: sample-pvc
  namespace: ${namespace && namespace !== '_all' ? namespace : 'default'}
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 10Gi
  # storageClassName: standard
`

export default function ConfigStorageTab({ serverId, currentNamespace, initialSearchKw, initialSubTab }: Props) {
    const [subTab, setSubTab] = useState<'configmap' | 'secret' | 'pvc'>(initialSubTab || 'configmap')
    const [configMaps, setConfigMaps] = useState<K8sConfigMapInfo[]>([])
    const [secrets, setSecrets] = useState<K8sSecretInfo[]>([])
    const [pvcs, setPvcs] = useState<K8sPVCInfo[]>([])
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
    const [yamlKind, setYamlKind] = useState<'ConfigMap' | 'Secret' | 'PersistentVolumeClaim'>('ConfigMap')
    const [yamlMode, setYamlMode] = useState<'view' | 'edit' | 'create'>('edit')
    const [yamlTarget, setYamlTarget] = useState<{ namespace: string; name: string } | null>(null)

    const fetchData = async () => {
        setLoading(true)
        try {
            if (subTab === 'configmap') {
                const list = await API.k8sListConfigMaps(serverId, currentNamespace)
                setConfigMaps(list)
            } else if (subTab === 'secret') {
                const list = await API.k8sListSecrets(serverId, currentNamespace)
                setSecrets(list)
            } else {
                const list = await API.k8sListPVCs(serverId, currentNamespace)
                setPvcs(list)
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

    const handleDeleteConfigMap = async (record: K8sConfigMapInfo) => {
        try {
            await API.k8sDeleteConfigMap(serverId, record.namespace, record.name)
            fetchData()
        } catch (err: any) {
            message.error(`删除 ConfigMap 失败: ${err.message || String(err)}`)
        }
    }

    const handleDeleteSecret = async (record: K8sSecretInfo) => {
        try {
            await API.k8sDeleteSecret(serverId, record.namespace, record.name)
            fetchData()
        } catch (err: any) {
            message.error(`删除 Secret 失败: ${err.message || String(err)}`)
        }
    }

    const handleDeletePVC = async (record: K8sPVCInfo) => {
        try {
            await API.k8sDeletePVC(serverId, record.namespace, record.name)
            fetchData()
        } catch (err: any) {
            message.error(`删除 PVC 失败: ${err.message || String(err)}`)
        }
    }

    const openEditYaml = (kind: 'ConfigMap' | 'Secret' | 'PersistentVolumeClaim', namespace: string, name: string) => {
        setYamlKind(kind)
        setYamlTarget({ namespace, name })
        setYamlMode('edit')
        setYamlModalOpen(true)
    }

    const openCreateYaml = (kind: 'ConfigMap' | 'Secret' | 'PersistentVolumeClaim') => {
        setYamlKind(kind)
        setYamlTarget(null)
        setYamlMode('create')
        setYamlModalOpen(true)
    }

    const filteredConfigMaps = configMaps.filter((cm) => {
        if (!searchKw) return true
        const kw = searchKw.toLowerCase()
        return cm.name.toLowerCase().includes(kw) || cm.namespace.toLowerCase().includes(kw)
    })

    const filteredSecrets = secrets.filter((sec) => {
        if (!searchKw) return true
        const kw = searchKw.toLowerCase()
        return sec.name.toLowerCase().includes(kw) || sec.namespace.toLowerCase().includes(kw) || sec.type.toLowerCase().includes(kw)
    })

    const filteredPvcs = pvcs.filter((pvc) => {
        if (!searchKw) return true
        const kw = searchKw.toLowerCase()
        return pvc.name.toLowerCase().includes(kw) || pvc.namespace.toLowerCase().includes(kw) || (pvc.storageClass && pvc.storageClass.toLowerCase().includes(kw))
    })

    const cmColumns: ColumnsType<K8sConfigMapInfo> = [
        {
            title: '配置名称',
            dataIndex: 'name',
            key: 'name',
            render: (name: string, record) => (
                <Space size={8}>
                    <FileCode size={14} color="var(--accent)" />
                    <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>{name}</span>
                    <Tooltip title="复制名称">
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
            title: '键值项数',
            dataIndex: 'dataCount',
            key: 'dataCount',
            width: 150,
            render: (count: number) => <Tag color="geekblue">{count} 项</Tag>,
        },
        {
            title: '包含的键',
            key: 'keys',
            render: (_, record) => {
                const keys = Object.keys(record.data || {})
                return (
                    <Space size={4} wrap>
                        {keys.slice(0, 5).map((k) => (
                            <Tag key={k} color="default" style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                                {k}
                            </Tag>
                        ))}
                        {keys.length > 5 && <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>+{keys.length - 5} ...</span>}
                    </Space>
                )
            },
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
                        onClick={() => openEditYaml('ConfigMap', record.namespace, record.name)}
                    >
                        编辑
                    </Button>
                    <Popconfirm
                        title={`确定删除 ConfigMap [${record.name}] 吗？`}
                        description={`所属命名空间: ${record.namespace}。引用该 ConfigMap 的容器可能发生配置缺失报错，此操作不可逆。`}
                        okText="确认删除"
                        cancelText="取消"
                        okButtonProps={{ danger: true }}
                        onConfirm={() => handleDeleteConfigMap(record)}
                    >
                        <Button size="small" danger icon={<Trash2 size={12} />}>
                            删除
                        </Button>
                    </Popconfirm>
                </Space>
            ),
        },
    ]

    const secretColumns: ColumnsType<K8sSecretInfo> = [
        {
            title: '密钥名称 (Secret Name)',
            dataIndex: 'name',
            key: 'name',
            render: (name: string, record) => (
                <Space size={8}>
                    <Lock size={14} color="#eab308" />
                    <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>{name}</span>
                    <Tooltip title="复制密钥名称">
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
            title: '密钥类型 (Type)',
            dataIndex: 'type',
            key: 'type',
            width: 200,
            render: (type: string) => (
                <span className={s.monoText} style={{ color: 'var(--text-dim)', fontSize: 11.5 }}>
                    {type}
                </span>
            ),
        },
        {
            title: '键值项数',
            dataIndex: 'dataCount',
            key: 'dataCount',
            width: 120,
            render: (count: number) => <Tag color="gold">{count} 项</Tag>,
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
                        onClick={() => openEditYaml('Secret', record.namespace, record.name)}
                    >
                        编辑
                    </Button>
                    <Popconfirm
                        title={`确定删除 Secret [${record.name}] 吗？`}
                        description={`所属命名空间: ${record.namespace}。引用该 Secret 的容器可能发生凭据丢失认证失败，此操作不可逆。`}
                        okText="确认删除"
                        cancelText="取消"
                        okButtonProps={{ danger: true }}
                        onConfirm={() => handleDeleteSecret(record)}
                    >
                        <Button size="small" danger icon={<Trash2 size={12} />}>
                            删除
                        </Button>
                    </Popconfirm>
                </Space>
            ),
        },
    ]

    const pvcColumns: ColumnsType<K8sPVCInfo> = [
        {
            title: 'PVC 声明名称',
            dataIndex: 'name',
            key: 'name',
            render: (name: string, record) => (
                <Space size={8}>
                    <HardDrive size={14} color="var(--accent)" />
                    <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>{name}</span>
                    <Tooltip title="复制 PVC 名称">
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
            title: '状态 (Status)',
            dataIndex: 'status',
            key: 'status',
            width: 120,
            render: (st: string) => {
                const isBound = st === 'Bound'
                return (
                    <span className={`${s.statusBadge} ${isBound ? s.statusRunning : s.statusPending}`}>
                        {isBound && <span className={s.pulseDot} />}
                        <span>{st}</span>
                    </span>
                )
            },
        },
        {
            title: '存储容量 (Capacity)',
            dataIndex: 'capacity',
            key: 'capacity',
            width: 130,
            render: (cap: string) => (
                <span className={s.monoText} style={{ fontWeight: 600, color: 'var(--ok)' }}>
                    {cap || '-'}
                </span>
            ),
        },
        {
            title: '绑定 PV 卷 / StorageClass',
            key: 'pv',
            render: (_, record) => (
                <div style={{ fontSize: 11.5, fontFamily: 'var(--font-mono)' }}>
                    <div>PV: {record.volumeName || '未绑定'}</div>
                    <div style={{ color: 'var(--text-dim)' }}>SC: {record.storageClass || 'default'}</div>
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
                        onClick={() => openEditYaml('PersistentVolumeClaim', record.namespace, record.name)}
                    >
                        编辑
                    </Button>
                    <Popconfirm
                        title={`确定删除 PVC [${record.name}] 吗？`}
                        description={`所属命名空间: ${record.namespace}。删除持久卷声明可能导致存储数据无法恢复，此操作不可逆。`}
                        okText="确认删除"
                        cancelText="取消"
                        okButtonProps={{ danger: true }}
                        onConfirm={() => handleDeletePVC(record)}
                    >
                        <Button size="small" danger icon={<Trash2 size={12} />}>
                            删除
                        </Button>
                    </Popconfirm>
                </Space>
            ),
        },
    ]

    const getResourceKindName = () => {
        if (subTab === 'configmap') return 'ConfigMap'
        if (subTab === 'secret') return 'Secret'
        return 'PersistentVolumeClaim'
    }

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
                                        <FileCode size={13} />
                                        <span>ConfigMaps ({configMaps.length})</span>
                                    </Space>
                                ),
                                value: 'configmap',
                            },
                            {
                                label: (
                                    <Space size={6}>
                                        <Lock size={13} />
                                        <span>Secrets ({secrets.length})</span>
                                    </Space>
                                ),
                                value: 'secret',
                            },
                            {
                                label: (
                                    <Space size={6}>
                                        <HardDrive size={13} />
                                        <span>PVC 存储卷 ({pvcs.length})</span>
                                    </Space>
                                ),
                                value: 'pvc',
                            },
                        ]}
                    />

                    <Input
                        placeholder="搜索名称 / 命名空间..."
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
                        onClick={() => openCreateYaml(getResourceKindName())}
                    >
                        新建 {subTab === 'configmap' ? 'ConfigMap' : subTab === 'secret' ? 'Secret' : 'PVC'}
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
            {subTab === 'configmap' ? (
                <Table
                    columns={cmColumns}
                    dataSource={filteredConfigMaps}
                    rowKey={(r) => `${r.namespace}/${r.name}`}
                    loading={loading}
                    size="small"
                    pagination={{
                        current: page,
                        pageSize: pageSize,
                        total: filteredConfigMaps.length,
                        showSizeChanger: true,
                        pageSizeOptions: ['10', '20', '50', '100'],
                        showTotal: (total, range) => `第 ${range[0]}-${range[1]} 条 / 共 ${total} 条`,
                        onChange: (p, ps) => {
                            setPage(p)
                            setPageSize(ps)
                        },
                    }}
                />
            ) : subTab === 'secret' ? (
                <Table
                    columns={secretColumns}
                    dataSource={filteredSecrets}
                    rowKey={(r) => `${r.namespace}/${r.name}`}
                    loading={loading}
                    size="small"
                    pagination={{
                        current: page,
                        pageSize: pageSize,
                        total: filteredSecrets.length,
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
                    columns={pvcColumns}
                    dataSource={filteredPvcs}
                    rowKey={(r) => `${r.namespace}/${r.name}`}
                    loading={loading}
                    size="small"
                    pagination={{
                        current: page,
                        pageSize: pageSize,
                        total: filteredPvcs.length,
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
                        ? yamlKind === 'ConfigMap'
                            ? DEFAULT_CONFIGMAP_TEMPLATE(currentNamespace)
                            : yamlKind === 'Secret'
                                ? DEFAULT_SECRET_TEMPLATE(currentNamespace)
                                : DEFAULT_PVC_TEMPLATE(currentNamespace)
                        : undefined
                }
                onSuccess={fetchData}
            />
        </div>
    )
}
