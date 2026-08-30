import React, { useState, useEffect } from 'react'
import { Segmented, Space, Select, Button, message, Badge, Modal, Input, Popconfirm, Tooltip } from 'antd'
import {
    Activity,
    Layers,
    Box,
    Sliders,
    Network,
    HardDrive,
    Code,
    RefreshCw,
    Server,
    Plus,
    Trash2,
} from 'lucide-react'
import ClientIcon from '@/components/ClientIcon'
import { API } from '@/api'
import type { K8sSessionInfo, K8sOverview, K8sNamespaceInfo } from '@/types'
import OverviewTab from './OverviewTab'
import PodsTab from './PodsTab'
import DeploymentsTab from './DeploymentsTab'
import NetworkTab from './NetworkTab'
import ConfigStorageTab from './ConfigStorageTab'
import YamlTab from './YamlTab'
import s from './K8sClient.module.less'

interface Props {
    session: K8sSessionInfo
}

export default function K8sClient({ session }: Props) {
    const [activeTab, setActiveTab] = useState<string>('overview')
    const [overview, setOverview] = useState<K8sOverview | null>(null)
    const [namespaces, setNamespaces] = useState<K8sNamespaceInfo[]>([])
    const [currentNamespace, setCurrentNamespace] = useState<string>(session.namespace || '_all')
    const [loading, setLoading] = useState(false)
    const [pingMs, setPingMs] = useState<number | null>(null)

    // 新建命名空间模态框
    const [createNsModalOpen, setCreateNsModalOpen] = useState(false)
    const [newNsName, setNewNsName] = useState('')
    const [createNsLoading, setCreateNsLoading] = useState(false)

    const fetchOverviewAndNs = async () => {
        setLoading(true)
        const t0 = performance.now()
        try {
            const [ov, nsList] = await Promise.all([
                API.k8sGetOverview(session.serverId),
                API.k8sListNamespaces(session.serverId),
            ])
            setOverview(ov)
            setNamespaces(nsList)
            const t1 = performance.now()
            setPingMs(Math.round(t1 - t0))
        } catch (err: any) {
            message.error(`连接 K8s API Server 失败: ${err.message || String(err)}`)
        } finally {
            setLoading(false)
        }
    }

    const handleCreateNamespace = async () => {
        const trimmed = newNsName.trim()
        if (!trimmed) {
            message.warning('请输入命名空间名称')
            return
        }
        setCreateNsLoading(true)
        try {
            await API.k8sCreateNamespace(session.serverId, trimmed)
            message.success(`命名空间 [${trimmed}] 创建成功`)
            setCreateNsModalOpen(false)
            setNewNsName('')
            await fetchOverviewAndNs()
            setCurrentNamespace(trimmed)
        } catch (err: any) {
            message.error(`创建命名空间失败: ${err.message || String(err)}`)
        } finally {
            setCreateNsLoading(false)
        }
    }

    const handleDeleteCurrentNamespace = async () => {
        if (currentNamespace === '_all') return
        try {
            await API.k8sDeleteNamespace(session.serverId, currentNamespace)
            message.success(`命名空间 [${currentNamespace}] 已删除`)
            setCurrentNamespace('_all')
            await fetchOverviewAndNs()
        } catch (err: any) {
            message.error(`删除命名空间失败: ${err.message || String(err)}`)
        }
    }

    const isSystemNs = (ns: string) =>
        ns === '_all' || ns === 'default' || ns === 'kube-system' || ns === 'kube-public' || ns === 'kube-node-lease'

    useEffect(() => {
        fetchOverviewAndNs()
    }, [session.serverId])

    const tabOptions = [
        {
            label: (
                <Space size={6}>
                    <Activity size={14} />
                    <span>概览 & 节点</span>
                </Space>
            ),
            value: 'overview',
        },
        {
            label: (
                <Space size={6}>
                    <Box size={14} />
                    <span>Pods ({overview?.podsTotal ?? 0})</span>
                </Space>
            ),
            value: 'pods',
        },
        {
            label: (
                <Space size={6}>
                    <Sliders size={14} />
                    <span>Deployments ({overview?.deploymentsTotal ?? 0})</span>
                </Space>
            ),
            value: 'deployments',
        },
        {
            label: (
                <Space size={6}>
                    <Network size={14} />
                    <span>服务 & 路由 ({overview?.servicesTotal ?? 0})</span>
                </Space>
            ),
            value: 'network',
        },
        {
            label: (
                <Space size={6}>
                    <HardDrive size={14} />
                    <span>配置 & 存储</span>
                </Space>
            ),
            value: 'config',
        },
        {
            label: (
                <Space size={6}>
                    <Code size={14} />
                    <span>YAML 编排</span>
                </Space>
            ),
            value: 'yaml',
        },
    ]

    return (
        <div className={s.k8sWorkspace}>
            {/* 顶栏 */}
            <div className={s.headerBar}>
                <div className={s.headerLeft}>
                    <div className={s.titleArea}>
                        <ClientIcon kind="k8s" size={22} />
                        <span>{session.title || 'Kubernetes 集群'}</span>
                    </div>

                    <div className={s.targetBadge} title={session.apiServer}>
                        <span className={s.onlineDot} />
                        <span>{session.apiServer}</span>
                        {pingMs !== null && (
                            <span style={{ color: 'var(--text-faint)', marginLeft: 4 }}>
                                ({pingMs}ms)
                            </span>
                        )}
                    </div>

                    {/* 全局 Namespace 选择器 */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 8 }}>
                        <Layers size={14} color="var(--text-dim)" />
                        <Select
                            size="small"
                            value={currentNamespace}
                            onChange={(ns) => setCurrentNamespace(ns)}
                            style={{ minWidth: 180 }}
                            placeholder="选择 Namespace"
                            options={[
                                { label: 'All Namespaces (全量)', value: '_all' },
                                ...namespaces.map((ns) => ({
                                    label: ns.name,
                                    value: ns.name,
                                })),
                            ]}
                            showSearch
                            filterOption={(input, option) =>
                                (option?.label ?? '').toString().toLowerCase().includes(input.toLowerCase())
                            }
                        />
                        <Tooltip title="新建命名空间">
                            <Button
                                size="small"
                                icon={<Plus size={12} />}
                                onClick={() => setCreateNsModalOpen(true)}
                            />
                        </Tooltip>
                        {!isSystemNs(currentNamespace) && (
                            <Popconfirm
                                title={`确定删除命名空间 [${currentNamespace}] 吗？`}
                                description="删除命名空间将级联清理该命名空间下的所有 Pod、Deployment、Service 及配置，此操作不可逆！"
                                okText="确认删除"
                                cancelText="取消"
                                okButtonProps={{ danger: true }}
                                onConfirm={handleDeleteCurrentNamespace}
                            >
                                <Tooltip title={`删除命名空间 [${currentNamespace}]`}>
                                    <Button
                                        size="small"
                                        danger
                                        icon={<Trash2 size={12} />}
                                    />
                                </Tooltip>
                            </Popconfirm>
                        )}
                    </div>
                </div>

                <div className={s.headerRight}>
                    <Segmented
                        size="middle"
                        value={activeTab}
                        onChange={(val) => setActiveTab(val as string)}
                        options={tabOptions}
                    />

                    <Tooltip title="刷新集群状态与命名空间">
                        <Button
                            icon={<RefreshCw size={13} className={loading ? 'animate-spin' : ''} />}
                            size="small"
                            onClick={fetchOverviewAndNs}
                        />
                    </Tooltip>
                </div>
            </div>

            {/* 内容区 */}
            <div className={s.tabContent}>
                {activeTab === 'overview' && (
                    <OverviewTab
                        serverId={session.serverId}
                        overview={overview}
                        loading={loading}
                        onRefresh={fetchOverviewAndNs}
                    />
                )}

                {activeTab === 'pods' && (
                    <PodsTab
                        serverId={session.serverId}
                        currentNamespace={currentNamespace}
                    />
                )}

                {activeTab === 'deployments' && (
                    <DeploymentsTab
                        serverId={session.serverId}
                        currentNamespace={currentNamespace}
                    />
                )}

                {activeTab === 'network' && (
                    <NetworkTab
                        serverId={session.serverId}
                        currentNamespace={currentNamespace}
                    />
                )}

                {activeTab === 'config' && (
                    <ConfigStorageTab
                        serverId={session.serverId}
                        currentNamespace={currentNamespace}
                    />
                )}

                {activeTab === 'yaml' && (
                    <YamlTab
                        serverId={session.serverId}
                        currentNamespace={currentNamespace}
                    />
                )}
            </div>

            {/* 新建命名空间模态框 */}
            <Modal
                title={
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Layers size={16} color="var(--accent)" />
                        <span>新建 Kubernetes 命名空间</span>
                    </div>
                }
                open={createNsModalOpen}
                onCancel={() => {
                    setCreateNsModalOpen(false)
                    setNewNsName('')
                }}
                onOk={handleCreateNamespace}
                confirmLoading={createNsLoading}
                okText="创建命名空间"
                cancelText="取消"
                width={420}
            >
                <div style={{ padding: '12px 0' }}>
                    <div style={{ marginBottom: 8, fontSize: 13 }}>命名空间名称 (Namespace Name):</div>
                    <Input
                        placeholder="例如: dev, test, staging-01"
                        value={newNsName}
                        onChange={(e) => setNewNsName(e.target.value)}
                        onPressEnter={handleCreateNamespace}
                        autoFocus
                    />
                    <div style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 8 }}>
                        提示：命名空间名称需符合 RFC 1123 规范（小写字母、数字与中划线 - 组合）。
                    </div>
                </div>
            </Modal>
        </div>
    )
}
