import React, { useState, useEffect } from 'react'
import {
    Table,
    Button,
    Input,
    Radio,
    Space,
    Tag,
    Modal as AntdModal,
    Tooltip,
    message,
    Popconfirm,
    Drawer,
    Select,
    Switch,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
    Play,
    Square,
    RotateCw,
    Pause,
    FileText,
    Search,
    Plus,
    Trash2,
    Code,
    RefreshCw,
    Copy,
    Info,
} from 'lucide-react'
import { API } from '@/api'
import type { DockerContainerInfo, DockerCreateContainerReq } from '@/types'
import s from './DockerClient.module.less'

interface Props {
    serverId: string
}

export default function ContainersTab({ serverId }: Props) {
    const [containers, setContainers] = useState<DockerContainerInfo[]>([])
    const [loading, setLoading] = useState(false)
    const [filterState, setFilterState] = useState<'all' | 'running' | 'stopped'>('all')
    const [searchKw, setSearchKw] = useState('')
    const [page, setPage] = useState(1)
    const [pageSize, setPageSize] = useState(10)

    // 日志抽屉
    const [logDrawer, setLogDrawer] = useState<{ open: boolean; container: DockerContainerInfo | null }>({
        open: false,
        container: null,
    })
    const [logContent, setLogContent] = useState('')
    const [logTail, setLogTail] = useState(200)
    const [logTimestamps, setLogTimestamps] = useState(false)
    const [logLoading, setLogLoading] = useState(false)

    // Inspect 模态框
    const [inspectModal, setInspectModal] = useState<{ open: boolean; title: string; json: string }>({
        open: false,
        title: '',
        json: '',
    })

    // 新建容器模态框
    const [createModal, setCreateModal] = useState(false)
    const [creating, setCreating] = useState(false)
    const [createForm, setCreateForm] = useState<DockerCreateContainerReq>({
        name: '',
        image: '',
        ports: [''],
        volumes: [''],
        env: [''],
        restartPolicy: 'unless-stopped',
        autoRemove: false,
    })

    const fetchContainers = async () => {
        setLoading(true)
        try {
            const list = await API.dockerListContainers(serverId, true)
            setContainers(list)
        } catch (err: any) {
            message.error(`获取容器列表失败: ${err.message || String(err)}`)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchContainers()
    }, [serverId])

    const handleControl = async (containerId: string, action: string) => {
        try {
            await API.dockerControlContainer(serverId, containerId, action)
            message.success(`容器操作 [${action}] 执行成功`)
            fetchContainers()
        } catch (err: any) {
            message.error(`操作失败: ${err.message || String(err)}`)
        }
    }

    const openLogs = async (c: DockerContainerInfo) => {
        setLogDrawer({ open: true, container: c })
        fetchLogs(c.id, logTail, logTimestamps)
    }

    const fetchLogs = async (id: string, tail: number, timestamps: boolean) => {
        setLogLoading(true)
        try {
            const text = await API.dockerGetContainerLogs(serverId, id, tail, timestamps)
            setLogContent(text || '(暂无日志输出)')
        } catch (err: any) {
            setLogContent(`获取日志失败: ${err.message || String(err)}`)
        } finally {
            setLogLoading(false)
        }
    }

    const openInspect = async (c: DockerContainerInfo) => {
        try {
            const json = await API.dockerInspectContainer(serverId, c.id)
            setInspectModal({ open: true, title: `容器详情 (Inspect): ${c.name}`, json })
        } catch (err: any) {
            message.error(`查看详情失败: ${err.message || String(err)}`)
        }
    }

    const handleCreateSubmit = async () => {
        if (!createForm.image.trim()) {
            message.warning('请输入镜像名称')
            return
        }
        setCreating(true)
        try {
            const req: DockerCreateContainerReq = {
                name: createForm.name.trim(),
                image: createForm.image.trim(),
                ports: (createForm.ports || []).filter((p) => p.trim() !== ''),
                volumes: (createForm.volumes || []).filter((v) => v.trim() !== ''),
                env: (createForm.env || []).filter((e) => e.trim() !== ''),
                restartPolicy: createForm.restartPolicy,
                autoRemove: createForm.autoRemove,
            }
            await API.dockerCreateContainer(serverId, req)
            message.success('容器创建成功')
            setCreateModal(false)
            setCreateForm({
                name: '',
                image: '',
                ports: [''],
                volumes: [''],
                env: [''],
                restartPolicy: 'unless-stopped',
                autoRemove: false,
            })
            fetchContainers()
        } catch (err: any) {
            message.error(`创建容器失败: ${err.message || String(err)}`)
        } finally {
            setCreating(false)
        }
    }

    const filtered = containers.filter((c) => {
        if (filterState === 'running' && c.state !== 'running') return false
        if (filterState === 'stopped' && c.state === 'running') return false
        if (searchKw.trim()) {
            const kw = searchKw.toLowerCase()
            const matchName = c.name.toLowerCase().includes(kw)
            const matchImg = c.image.toLowerCase().includes(kw)
            const matchId = c.shortId.toLowerCase().includes(kw)
            const matchPorts = (c.portStr || '').toLowerCase().includes(kw)
            if (!matchName && !matchImg && !matchId && !matchPorts) return false
        }
        return true
    })

    const columns: ColumnsType<DockerContainerInfo> = [
        {
            title: '状态',
            dataIndex: 'state',
            width: 130,
            render: (state: string, record) => {
                const isRunning = state === 'running'
                const isPaused = state === 'paused'
                const isExited = state === 'exited' || state === 'dead'
                return (
                    <div
                        className={`${s.statusBadge} ${
                            isRunning
                                ? s.statusRunning
                                : isPaused
                                ? s.statusPaused
                                : isExited
                                ? s.statusDead
                                : s.statusStopped
                        }`}
                        title={record.status}
                    >
                        {isRunning && <span className={s.pulseDot} />}
                        <span style={{ textTransform: 'capitalize' }}>{state}</span>
                    </div>
                )
            },
        },
        {
            title: '容器名称',
            dataIndex: 'name',
            width: 180,
            render: (name: string, record) => (
                <div>
                    <div style={{ fontWeight: 600, color: 'var(--text)' }}>{name}</div>
                    <div className={s.monoText} style={{ color: 'var(--text-dim)', fontSize: 11 }}>
                        {record.shortId}
                    </div>
                </div>
            ),
        },
        {
            title: '镜像',
            dataIndex: 'image',
            ellipsis: true,
            render: (img: string) => (
                <span className={s.monoText} title={img}>
                    <Tag color="cyan">{img}</Tag>
                </span>
            ),
        },
        {
            title: '端口映射 (Ports)',
            dataIndex: 'portStr',
            width: 200,
            render: (portStr: string) =>
                portStr ? (
                    <span className={s.monoText} style={{ fontSize: 11.5 }}>
                        {portStr}
                    </span>
                ) : (
                    <span style={{ color: 'var(--text-faint)' }}>-</span>
                ),
        },
        {
            title: '容器 IP',
            dataIndex: 'ipAddress',
            width: 120,
            render: (ip: string) => (
                <span className={s.monoText} style={{ color: ip ? 'var(--text)' : 'var(--text-faint)' }}>
                    {ip || '-'}
                </span>
            ),
        },
        {
            title: '运行状态 / 创建时间',
            dataIndex: 'status',
            width: 160,
            render: (status: string) => <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{status}</span>,
        },
        {
            title: '快捷操作',
            key: 'actions',
            width: 220,
            fixed: 'right',
            render: (_, record) => {
                const isRunning = record.state === 'running'
                const isPaused = record.state === 'paused'
                return (
                    <Space size={4}>
                        {isRunning ? (
                            <>
                                <Tooltip title="停止容器">
                                    <Button
                                        size="small"
                                        type="text"
                                        danger
                                        icon={<Square size={13} />}
                                        onClick={() => handleControl(record.id, 'stop')}
                                    />
                                </Tooltip>
                                <Tooltip title="重启容器">
                                    <Button
                                        size="small"
                                        type="text"
                                        icon={<RotateCw size={13} />}
                                        onClick={() => handleControl(record.id, 'restart')}
                                    />
                                </Tooltip>
                                <Tooltip title="暂停容器">
                                    <Button
                                        size="small"
                                        type="text"
                                        icon={<Pause size={13} />}
                                        onClick={() => handleControl(record.id, 'pause')}
                                    />
                                </Tooltip>
                            </>
                        ) : isPaused ? (
                            <Tooltip title="恢复运行">
                                <Button
                                    size="small"
                                    type="text"
                                    style={{ color: 'var(--ok)' }}
                                    icon={<Play size={13} />}
                                    onClick={() => handleControl(record.id, 'unpause')}
                                />
                            </Tooltip>
                        ) : (
                            <Tooltip title="启动容器">
                                <Button
                                    size="small"
                                    type="text"
                                    style={{ color: 'var(--ok)' }}
                                    icon={<Play size={13} />}
                                    onClick={() => handleControl(record.id, 'start')}
                                />
                            </Tooltip>
                        )}

                        <Tooltip title="实时日志">
                            <Button
                                size="small"
                                type="text"
                                icon={<FileText size={13} />}
                                onClick={() => openLogs(record)}
                            />
                        </Tooltip>

                        <Tooltip title="JSON 详情 (Inspect)">
                            <Button
                                size="small"
                                type="text"
                                icon={<Code size={13} />}
                                onClick={() => openInspect(record)}
                            />
                        </Tooltip>

                        <Popconfirm
                            title="确定要删除此容器吗？"
                            description={isRunning ? '该容器当前正在运行，将执行强制删除 (-f)' : '此操作不可逆'}
                            onConfirm={() => handleControl(record.id, isRunning ? 'forceremove' : 'remove')}
                            okText="删除"
                            cancelText="取消"
                            okButtonProps={{ danger: true }}
                        >
                            <Tooltip title="删除容器">
                                <Button size="small" type="text" danger icon={<Trash2 size={13} />} />
                            </Tooltip>
                        </Popconfirm>
                    </Space>
                )
            },
        },
    ]

    return (
        <div>
            {/* 顶部工具栏 */}
            <div className={s.toolbar}>
                <div className={s.toolbarLeft}>
                    <Radio.Group
                        value={filterState}
                        onChange={(e) => {
                            setFilterState(e.target.value)
                            setPage(1)
                        }}
                        buttonStyle="solid"
                        size="small"
                    >
                        <Radio.Button value="all">全部 ({containers.length})</Radio.Button>
                        <Radio.Button value="running">
                            运行中 ({containers.filter((c) => c.state === 'running').length})
                        </Radio.Button>
                        <Radio.Button value="stopped">
                            已停止 ({containers.filter((c) => c.state !== 'running').length})
                        </Radio.Button>
                    </Radio.Group>

                    <Input
                        placeholder="搜索容器名称 / 镜像 / 端口 / ID..."
                        prefix={<Search size={13} color="var(--text-dim)" />}
                        value={searchKw}
                        onChange={(e) => {
                            setSearchKw(e.target.value)
                            setPage(1)
                        }}
                        style={{ width: 240 }}
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
                        创建容器
                    </Button>
                    <Button
                        icon={<RefreshCw size={13} className={loading ? 'animate-spin' : ''} />}
                        size="small"
                        onClick={fetchContainers}
                    >
                        刷新
                    </Button>
                </div>
            </div>

            {/* 容器表格 */}
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
                scroll={{ x: 1000 }}
            />

            {/* 日志抽屉 */}
            <Drawer
                title={
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span>容器日志: {logDrawer.container?.name}</span>
                        <Space size={8}>
                            <Select
                                size="small"
                                value={logTail}
                                onChange={(val) => {
                                    setLogTail(val)
                                    if (logDrawer.container) fetchLogs(logDrawer.container.id, val, logTimestamps)
                                }}
                                options={[
                                    { label: '最近 100 行', value: 100 },
                                    { label: '最近 200 行', value: 200 },
                                    { label: '最近 500 行', value: 500 },
                                    { label: '最近 1000 行', value: 1000 },
                                    { label: '全部日志', value: 0 },
                                ]}
                            />
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                                <span>时间戳</span>
                                <Switch
                                    size="small"
                                    checked={logTimestamps}
                                    onChange={(val) => {
                                        setLogTimestamps(val)
                                        if (logDrawer.container) fetchLogs(logDrawer.container.id, logTail, val)
                                    }}
                                />
                            </div>
                            <Button
                                size="small"
                                icon={<RefreshCw size={12} className={logLoading ? 'animate-spin' : ''} />}
                                onClick={() => {
                                    if (logDrawer.container) fetchLogs(logDrawer.container.id, logTail, logTimestamps)
                                }}
                            >
                                刷新
                            </Button>
                            <Button
                                size="small"
                                icon={<Copy size={12} />}
                                onClick={() => {
                                    navigator.clipboard.writeText(logContent)
                                    message.success('日志已复制到剪贴板')
                                }}
                            >
                                复制
                            </Button>
                        </Space>
                    </div>
                }
                open={logDrawer.open}
                onClose={() => setLogDrawer({ open: false, container: null })}
                size={720}
            >
                <pre className={s.logTerminal}>{logContent}</pre>
            </Drawer>

            {/* Inspect JSON 详情模态框 */}
            <AntdModal
                title={inspectModal.title}
                open={inspectModal.open}
                onCancel={() => setInspectModal({ open: false, title: '', json: '' })}
                footer={[
                    <Button
                        key="copy"
                        icon={<Copy size={13} />}
                        onClick={() => {
                            navigator.clipboard.writeText(inspectModal.json)
                            message.success('JSON 已复制')
                        }}
                    >
                        复制 JSON
                    </Button>,
                    <Button key="close" type="primary" onClick={() => setInspectModal({ open: false, title: '', json: '' })}>
                        关闭
                    </Button>,
                ]}
                width={800}
                centered
            >
                <pre className={s.inspectJsonViewer}>{inspectModal.json}</pre>
            </AntdModal>

            {/* 新建容器模态框 */}
            <AntdModal
                title="创建并配置新容器"
                open={createModal}
                onCancel={() => !creating && setCreateModal(false)}
                onOk={handleCreateSubmit}
                confirmLoading={creating}
                okText="创建容器"
                cancelText="取消"
                width={560}
                centered
            >
                <Space orientation="vertical" size={12} style={{ width: '100%', padding: '8px 0' }}>
                    <div>
                        <div style={{ fontSize: 13, marginBottom: 4, fontWeight: 500 }}>
                            镜像名称 (Image) <span style={{ color: 'var(--danger)' }}>*</span>
                        </div>
                        <Input
                            placeholder="如: nginx:alpine / redis:latest / mysql:8.0"
                            value={createForm.image}
                            onChange={(e) => setCreateForm({ ...createForm, image: e.target.value })}
                        />
                    </div>

                    <div>
                        <div style={{ fontSize: 13, marginBottom: 4, fontWeight: 500 }}>容器名称 (Name, 可选)</div>
                        <Input
                            placeholder="如: my-nginx-web"
                            value={createForm.name}
                            onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                        />
                    </div>

                    <div>
                        <div style={{ fontSize: 13, marginBottom: 4, fontWeight: 500 }}>端口映射 (宿主端口:容器端口)</div>
                        <Input
                            placeholder="如: 8080:80, 8443:443"
                            value={(createForm.ports || []).join(', ')}
                            onChange={(e) =>
                                setCreateForm({
                                    ...createForm,
                                    ports: e.target.value.split(',').map((p) => p.trim()),
                                })
                            }
                        />
                    </div>

                    <div>
                        <div style={{ fontSize: 13, marginBottom: 4, fontWeight: 500 }}>数据卷映射 (宿主路径:容器路径)</div>
                        <Input
                            placeholder="如: /home/data:/var/lib/data, vol_name:/app"
                            value={(createForm.volumes || []).join(', ')}
                            onChange={(e) =>
                                setCreateForm({
                                    ...createForm,
                                    volumes: e.target.value.split(',').map((v) => v.trim()),
                                })
                            }
                        />
                    </div>

                    <div>
                        <div style={{ fontSize: 13, marginBottom: 4, fontWeight: 500 }}>环境变量 (KEY=VALUE, 逗号分隔)</div>
                        <Input
                            placeholder="如: ENV=production, PORT=8080"
                            value={(createForm.env || []).join(', ')}
                            onChange={(e) =>
                                setCreateForm({
                                    ...createForm,
                                    env: e.target.value.split(',').map((item) => item.trim()),
                                })
                            }
                        />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <div>
                            <div style={{ fontSize: 13, marginBottom: 4, fontWeight: 500 }}>重启策略 (Restart Policy)</div>
                            <Select
                                style={{ width: '100%' }}
                                value={createForm.restartPolicy || 'unless-stopped'}
                                onChange={(val) => setCreateForm({ ...createForm, restartPolicy: val })}
                                options={[
                                    { label: '除非手动停止 (unless-stopped)', value: 'unless-stopped' },
                                    { label: '总是重启 (always)', value: 'always' },
                                    { label: '失败时重启 (on-failure)', value: 'on-failure' },
                                    { label: '不重启 (no)', value: 'no' },
                                ]}
                            />
                        </div>
                        <div>
                            <div style={{ fontSize: 13, marginBottom: 4, fontWeight: 500 }}>退出自动清理 (--rm)</div>
                            <Switch
                                checked={!!createForm.autoRemove}
                                onChange={(checked) => setCreateForm({ ...createForm, autoRemove: checked })}
                            />
                        </div>
                    </div>
                </Space>
            </AntdModal>
        </div>
    )
}
