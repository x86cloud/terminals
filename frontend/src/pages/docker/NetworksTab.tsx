import React, { useState, useEffect } from 'react'
import {
    Table,
    Button,
    Input,
    Space,
    Tag,
    Modal as AntdModal,
    Tooltip,
    message,
    Popconfirm,
    Popover,
    Select,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { Plus, Trash2, RefreshCw, Search, Network as NetIcon, Info } from 'lucide-react'
import { API } from '@/api'
import type { DockerNetworkInfo } from '@/types'
import s from './DockerClient.module.less'

interface Props {
    serverId: string
}

export default function NetworksTab({ serverId }: Props) {
    const [networks, setNetworks] = useState<DockerNetworkInfo[]>([])
    const [loading, setLoading] = useState(false)
    const [searchKw, setSearchKw] = useState('')
    const [page, setPage] = useState(1)
    const [pageSize, setPageSize] = useState(10)

    // 创建网络模态框
    const [createModal, setCreateModal] = useState(false)
    const [netName, setNetName] = useState('')
    const [netDriver, setNetDriver] = useState('bridge')
    const [creating, setCreating] = useState(false)

    const fetchNetworks = async () => {
        setLoading(true)
        try {
            const list = await API.dockerListNetworks(serverId)
            setNetworks(list)
        } catch (err: any) {
            message.error(`获取网络列表失败: ${err.message || String(err)}`)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchNetworks()
    }, [serverId])

    const handleCreate = async () => {
        if (!netName.trim()) {
            message.warning('请输入网络名称')
            return
        }
        setCreating(true)
        try {
            await API.dockerCreateNetwork(serverId, netName.trim(), netDriver.trim() || 'bridge')
            message.success(`网络 ${netName.trim()} 创建成功`)
            setCreateModal(false)
            setNetName('')
            fetchNetworks()
        } catch (err: any) {
            message.error(`创建网络失败: ${err.message || String(err)}`)
        } finally {
            setCreating(false)
        }
    }

    const handleDelete = async (id: string) => {
        try {
            await API.dockerRemoveNetwork(serverId, id)
            message.success('网络已删除')
            fetchNetworks()
        } catch (err: any) {
            message.error(`删除网络失败: ${err.message || String(err)}`)
        }
    }

    const filtered = networks.filter((n) => {
        if (searchKw.trim()) {
            const kw = searchKw.toLowerCase()
            const matchName = n.name.toLowerCase().includes(kw)
            const matchDriver = n.driver.toLowerCase().includes(kw)
            const matchSubnet = (n.subnet || '').toLowerCase().includes(kw)
            if (!matchName && !matchDriver && !matchSubnet) return false
        }
        return true
    })

    const columns: ColumnsType<DockerNetworkInfo> = [
        {
            title: '网络名称 (Network Name)',
            dataIndex: 'name',
            render: (name: string, record) => (
                <div>
                    <div style={{ fontWeight: 600, color: 'var(--text)' }} className={s.monoText}>
                        {name}
                    </div>
                    <div className={s.monoText} style={{ color: 'var(--text-dim)', fontSize: 11 }}>
                        ID: {record.shortId}
                    </div>
                </div>
            ),
        },
        {
            title: '驱动类型 (Driver)',
            dataIndex: 'driver',
            width: 130,
            render: (driver: string) => {
                const color =
                    driver === 'bridge'
                        ? 'blue'
                        : driver === 'host'
                        ? 'purple'
                        : driver === 'null'
                        ? 'default'
                        : 'cyan'
                return <Tag color={color}>{driver}</Tag>
            },
        },
        {
            title: '作用域 (Scope)',
            dataIndex: 'scope',
            width: 100,
            render: (scope: string) => <Tag>{scope || 'local'}</Tag>,
        },
        {
            title: '子网网段 (Subnet)',
            dataIndex: 'subnet',
            width: 180,
            render: (subnet: string) => (
                <span className={s.monoText} style={{ fontSize: 12 }}>
                    {subnet || '-'}
                </span>
            ),
        },
        {
            title: '网关地址 (Gateway)',
            dataIndex: 'gateway',
            width: 160,
            render: (gateway: string) => (
                <span className={s.monoText} style={{ fontSize: 12 }}>
                    {gateway || '-'}
                </span>
            ),
        },
        {
            title: '已连接容器',
            dataIndex: 'containers',
            width: 130,
            render: (cMap: Record<string, string>) => {
                const count = cMap ? Object.keys(cMap).length : 0
                if (count === 0) return <span style={{ color: 'var(--text-faint)' }}>0 个</span>
                const content = (
                    <div style={{ maxHeight: 200, overflow: 'auto' }}>
                        {Object.entries(cMap).map(([id, nameAndIp]) => (
                            <div key={id} style={{ fontSize: 12, padding: '2px 0' }} className={s.monoText}>
                                {nameAndIp}
                            </div>
                        ))}
                    </div>
                )
                return (
                    <Popover content={content} title="已连接容器列表">
                        <Tag color="processing" style={{ cursor: 'pointer' }}>
                            {count} 个容器
                        </Tag>
                    </Popover>
                )
            },
        },
        {
            title: '操作',
            key: 'actions',
            width: 90,
            fixed: 'right',
            render: (_, record) => {
                const isDefault = ['bridge', 'host', 'none'].includes(record.name)
                if (isDefault) {
                    return <span style={{ color: 'var(--text-faint)', fontSize: 11 }}>系统预置</span>
                }
                return (
                    <Popconfirm
                        title="确定要删除此网络吗？"
                        description="如果仍有容器连接在该网络上，删除将会失败"
                        onConfirm={() => handleDelete(record.id)}
                        okText="删除"
                        cancelText="取消"
                        okButtonProps={{ danger: true }}
                    >
                        <Tooltip title="删除自定义网络">
                            <Button size="small" type="text" danger icon={<Trash2 size={13} />} />
                        </Tooltip>
                    </Popconfirm>
                )
            },
        },
    ]

    return (
        <div>
            {/* 顶部工具栏 */}
            <div className={s.toolbar}>
                <div className={s.toolbarLeft}>
                    <Input
                        placeholder="搜索网络名称 / 驱动 / 网段..."
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
                        icon={<Plus size={14} />}
                        size="small"
                        onClick={() => setCreateModal(true)}
                    >
                        新建网络
                    </Button>
                    <Button
                        icon={<RefreshCw size={13} className={loading ? 'animate-spin' : ''} />}
                        size="small"
                        onClick={fetchNetworks}
                    >
                        刷新
                    </Button>
                </div>
            </div>

            {/* 网络表格 */}
            <Table
                columns={columns}
                dataSource={filtered}
                rowKey="id"
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

            {/* 创建网络模态框 */}
            <AntdModal
                title="创建 Docker 自定义网络"
                open={createModal}
                onCancel={() => !creating && setCreateModal(false)}
                onOk={handleCreate}
                confirmLoading={creating}
                okText="创建"
                cancelText="取消"
                width={480}
                centered
            >
                <Space orientation="vertical" size={12} style={{ width: '100%', padding: '8px 0' }}>
                    <div>
                        <div style={{ fontSize: 13, marginBottom: 4, fontWeight: 500 }}>
                            网络名称 (Network Name) <span style={{ color: 'var(--danger)' }}>*</span>
                        </div>
                        <Input
                            placeholder="如: app_net / custom_bridge"
                            value={netName}
                            onChange={(e) => setNetName(e.target.value)}
                            onPressEnter={handleCreate}
                        />
                    </div>
                    <div>
                        <div style={{ fontSize: 13, marginBottom: 4, fontWeight: 500 }}>驱动类型 (Driver)</div>
                        <Select
                            style={{ width: '100%' }}
                            value={netDriver}
                            onChange={(val) => setNetDriver(val)}
                            options={[
                                { label: 'bridge (默认桥接网络)', value: 'bridge' },
                                { label: 'overlay (多主机/集群网络)', value: 'overlay' },
                                { label: 'macvlan (直通物理网卡)', value: 'macvlan' },
                                { label: 'ipvlan (轻量 IP 虚拟化)', value: 'ipvlan' },
                            ]}
                        />
                    </div>
                </Space>
            </AntdModal>
        </div>
    )
}
