import { useState, useEffect } from 'react'
import {
    Table,
    Button,
    Input,
    Radio,
    Space,
    Tag,
    Modal as AntdModal,
    Tooltip,
    App,
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
    Terminal,
} from 'lucide-react'
import { API } from '@/api'
import { copyText } from '@/utils'
import type { DockerContainerInfo, DockerCreateContainerReq } from '@/types'
import ContainerTerminalModal, { ContainerExecTarget } from '@/components/common/ContainerTerminalModal'
import { useTranslation } from 'react-i18next'
import s from './DockerClient.module.less'

interface Props {
    serverId: string
}

export default function ContainersTab({ serverId }: Props) {
    const { t } = useTranslation(['docker', 'common'])
    const { message } = App.useApp()
    const [containers, setContainers] = useState<DockerContainerInfo[]>([])
    const [loading, setLoading] = useState(false)
    const [filterState, setFilterState] = useState<'all' | 'running' | 'stopped'>('all')
    const [searchKw, setSearchKw] = useState('')
    const [page, setPage] = useState(1)
    const [pageSize, setPageSize] = useState(10)

    // 终端 Exec 模态框
    const [execTarget, setExecTarget] = useState<ContainerExecTarget | null>(null)

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
            message.error(t('containers.fetchFail', { defaultValue: '获取容器列表失败: {{error}}', error: err.message || String(err) }))
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
            fetchContainers()
        } catch (err: any) {
            message.error(t('containers.opFail', { defaultValue: '操作失败: {{error}}', error: err.message || String(err) }))
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
            setLogContent(text || t('containers.noLogs', '(暂无日志输出)'))
        } catch (err: any) {
            setLogContent(t('containers.fetchLogsFail', { defaultValue: '获取日志失败: {{error}}', error: err.message || String(err) }))
        } finally {
            setLogLoading(false)
        }
    }

    const openInspect = async (c: DockerContainerInfo) => {
        try {
            const json = await API.dockerInspectContainer(serverId, c.id)
            setInspectModal({ open: true, title: t('containers.inspectTitle', { defaultValue: '容器详情 (Inspect): {{name}}', name: c.name }), json })
        } catch (err: any) {
            message.error(t('containers.inspectFail', { defaultValue: '查看详情失败: {{error}}', error: err.message || String(err) }))
        }
    }

    const handleCreateSubmit = async () => {
        if (!createForm.image.trim()) {
            message.warning(t('containers.reqImage', '请输入镜像名称'))
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
            message.error(t('containers.createFail', { defaultValue: '创建容器失败: {{error}}', error: err.message || String(err) }))
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
            title: t('containers.colState', { defaultValue: '状态' }),
            dataIndex: 'state',
            width: 130,
            render: (state: string, record) => {
                const isRunning = state === 'running'
                const isPaused = state === 'paused'
                const isExited = state === 'exited' || state === 'dead'
                return (
                    <div
                        className={`${s.statusBadge} ${isRunning
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
            title: t('containers.colName', { defaultValue: '容器名称' }),
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
            title: t('containers.colImage', { defaultValue: '镜像' }),
            dataIndex: 'image',
            ellipsis: true,
            render: (img: string) => (
                <span className={s.monoText} title={img}>
                    <Tag color="cyan">{img}</Tag>
                </span>
            ),
        },
        {
            title: t('containers.colPorts', { defaultValue: '端口映射 (Ports)' }),
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
            title: t('containers.colIp', { defaultValue: '容器 IP' }),
            dataIndex: 'ipAddress',
            width: 120,
            render: (ip: string) => (
                <span className={s.monoText} style={{ color: ip ? 'var(--text)' : 'var(--text-faint)' }}>
                    {ip || '-'}
                </span>
            ),
        },
        {
            title: t('containers.colStatus', { defaultValue: '运行状态 / 创建时间' }),
            dataIndex: 'status',
            width: 160,
            render: (status: string) => <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{status}</span>,
        },
        {
            title: t('containers.colActions', { defaultValue: '快捷操作' }),
            key: 'actions',
            width: 250,
            fixed: 'right',
            render: (_, record) => {
                const isRunning = record.state === 'running'
                const isPaused = record.state === 'paused'
                return (
                    <Space size={4}>
                        {isRunning ? (
                            <>
                                <Tooltip title={t('containers.stopTooltip', { defaultValue: '停止容器' })}>
                                    <Button
                                        size="small"
                                        type="text"
                                        danger
                                        icon={<Square size={13} />}
                                        onClick={() => handleControl(record.id, 'stop')}
                                    />
                                </Tooltip>
                                <Tooltip title={t('containers.restartTooltip', { defaultValue: '重启容器' })}>
                                    <Button
                                        size="small"
                                        type="text"
                                        icon={<RotateCw size={13} />}
                                        onClick={() => handleControl(record.id, 'restart')}
                                    />
                                </Tooltip>
                                <Tooltip title={t('containers.pauseTooltip', { defaultValue: '暂停容器' })}>
                                    <Button
                                        size="small"
                                        type="text"
                                        icon={<Pause size={13} />}
                                        onClick={() => handleControl(record.id, 'pause')}
                                    />
                                </Tooltip>
                            </>
                        ) : isPaused ? (
                            <Tooltip title={t('containers.resumeTooltip', { defaultValue: '恢复运行' })}>
                                <Button
                                    size="small"
                                    type="text"
                                    style={{ color: 'var(--ok)' }}
                                    icon={<Play size={13} />}
                                    onClick={() => handleControl(record.id, 'unpause')}
                                />
                            </Tooltip>
                        ) : (
                            <Tooltip title={t('containers.startTooltip', { defaultValue: '启动容器' })}>
                                <Button
                                    size="small"
                                    type="text"
                                    style={{ color: 'var(--ok)' }}
                                    icon={<Play size={13} />}
                                    onClick={() => handleControl(record.id, 'start')}
                                />
                            </Tooltip>
                        )}

                        <Tooltip title={t('containers.logsTooltip', { defaultValue: '实时日志' })}>
                            <Button
                                size="small"
                                type="text"
                                icon={<FileText size={13} />}
                                onClick={() => openLogs(record)}
                            />
                        </Tooltip>

                        <Tooltip title={t('containers.inspectTooltip', { defaultValue: 'JSON 详情 (Inspect)' })}>
                            <Button
                                size="small"
                                type="text"
                                icon={<Code size={13} />}
                                onClick={() => openInspect(record)}
                            />
                        </Tooltip>

                        <Tooltip title={t('containers.execTooltip', { defaultValue: '终端 (Exec)' })}>
                            <Button
                                size="small"
                                type="text"
                                disabled={!isRunning}
                                icon={<Terminal size={13} />}
                                onClick={() =>
                                    setExecTarget({
                                        type: 'docker',
                                        serverId,
                                        containerId: record.id,
                                        title: record.name || record.shortId || record.id.slice(0, 12),
                                        image: record.image,
                                    })
                                }
                            />
                        </Tooltip>

                        <Popconfirm
                            title={t('containers.deleteConfirm', { defaultValue: '确定要删除此容器吗？' })}
                            description={isRunning ? t('containers.deleteRunningDesc', { defaultValue: '该容器当前正在运行，将执行强制删除 (-f)' }) : t('containers.deleteDesc', { defaultValue: '此操作不可逆' })}
                            onConfirm={() => handleControl(record.id, isRunning ? 'forceremove' : 'remove')}
                            okText={t('containers.deleteBtn', { defaultValue: '删除' })}
                            cancelText={t('containers.cancelBtn', { defaultValue: '取消' })}
                            okButtonProps={{ danger: true }}
                        >
                            <Tooltip title={t('containers.deleteTooltip', { defaultValue: '删除容器' })}>
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
                        <Radio.Button value="all">{t('containers.filterAll', { defaultValue: '全部 ({{count}})', count: containers.length })}</Radio.Button>
                        <Radio.Button value="running">
                            {t('containers.filterRunning', { defaultValue: '运行中 ({{count}})', count: containers.filter((c) => c.state === 'running').length })}
                        </Radio.Button>
                        <Radio.Button value="stopped">
                            {t('containers.filterStopped', { defaultValue: '已停止 ({{count}})', count: containers.filter((c) => c.state !== 'running').length })}
                        </Radio.Button>
                    </Radio.Group>

                    <Input
                        placeholder={t('containers.searchPlaceholder', { defaultValue: '搜索容器名称 / 镜像 / 端口 / ID...' })}
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
                        {t('containers.createBtn', { defaultValue: '创建容器' })}
                    </Button>
                    <Button
                        icon={<RefreshCw size={13} className={loading ? 'animate-spin' : ''} />}
                        size="small"
                        onClick={fetchContainers}
                    >
                        {t('common.refresh', { defaultValue: '刷新' })}
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
                    showTotal: (total, range) => t('common.paginationTotal', { defaultValue: `第 ${range[0]}-${range[1]} 条 / 共 ${total} 条`, from: range[0], to: range[1], total }),
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
                        <span>{t('containers.logDrawerTitle', { defaultValue: '容器日志: {{name}}', name: logDrawer.container?.name || '' })}</span>
                        <Space size={8}>
                            <Select
                                size="small"
                                value={logTail}
                                onChange={(val) => {
                                    setLogTail(val)
                                    if (logDrawer.container) fetchLogs(logDrawer.container.id, val, logTimestamps)
                                }}
                                options={[
                                    { label: t('containers.logLines100', { defaultValue: '最近 100 行' }), value: 100 },
                                    { label: t('containers.logLines200', { defaultValue: '最近 200 行' }), value: 200 },
                                    { label: t('containers.logLines500', { defaultValue: '最近 500 行' }), value: 500 },
                                    { label: t('containers.logLines1000', { defaultValue: '最近 1000 行' }), value: 1000 },
                                    { label: t('containers.logLinesAll', { defaultValue: '全部日志' }), value: 0 },
                                ]}
                            />
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                                <span>{t('containers.timestamps', { defaultValue: '时间戳' })}</span>
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
                                {t('common.refresh', { defaultValue: '刷新' })}
                            </Button>
                            <Button
                                size="small"
                                icon={<Copy size={12} />}
                                onClick={async () => {
                                    if (await copyText(logContent)) {
                                        message.success(t('containers.copiedLogs', { defaultValue: '已复制日志' }))
                                    }
                                }}
                            >
                                {t('containers.copyLogs', { defaultValue: '复制' })}
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
                        onClick={async () => {
                            if (await copyText(inspectModal.json)) {
                                message.success(t('images.copiedJson', { defaultValue: '已复制 JSON' }))
                            }
                        }}
                    >
                        {t('images.copyJson', { defaultValue: '复制 JSON' })}
                    </Button>,
                    <Button key="close" type="primary" onClick={() => setInspectModal({ open: false, title: '', json: '' })}>
                        {t('images.close', { defaultValue: '关闭' })}
                    </Button>,
                ]}
                width={800}
                centered
            >
                <pre className={s.inspectJsonViewer}>{inspectModal.json}</pre>
            </AntdModal>

            {/* 新建容器模态框 */}
            <AntdModal
                title={t('containers.createModalTitle', { defaultValue: '创建并配置新容器' })}
                open={createModal}
                onCancel={() => !creating && setCreateModal(false)}
                onOk={handleCreateSubmit}
                confirmLoading={creating}
                okText={t('containers.createBtn', { defaultValue: '创建容器' })}
                cancelText={t('containers.cancelBtn', { defaultValue: '取消' })}
                width={560}
                centered
            >
                <Space orientation="vertical" size={12} style={{ width: '100%', padding: '8px 0' }}>
                    <div>
                        <div style={{ fontSize: 13, marginBottom: 4, fontWeight: 500 }}>
                            {t('containers.imageLabel', { defaultValue: '镜像名称 (Image)' })} <span style={{ color: 'var(--danger)' }}>*</span>
                        </div>
                        <Input
                            placeholder={t('containers.imagePlaceholder', { defaultValue: '如: nginx:alpine / redis:latest / mysql:8.0' })}
                            value={createForm.image}
                            onChange={(e) => setCreateForm({ ...createForm, image: e.target.value })}
                        />
                    </div>

                    <div>
                        <div style={{ fontSize: 13, marginBottom: 4, fontWeight: 500 }}>{t('containers.nameLabel', { defaultValue: '容器名称 (Name, 可选)' })}</div>
                        <Input
                            placeholder={t('containers.namePlaceholder', { defaultValue: '如: my-nginx-web' })}
                            value={createForm.name}
                            onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                        />
                    </div>

                    <div>
                        <div style={{ fontSize: 13, marginBottom: 4, fontWeight: 500 }}>{t('containers.portsLabel', { defaultValue: '端口映射 (宿主端口:容器端口)' })}</div>
                        <Input
                            placeholder={t('containers.portsPlaceholder', { defaultValue: '如: 8080:80, 8443:443' })}
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
                        <div style={{ fontSize: 13, marginBottom: 4, fontWeight: 500 }}>{t('containers.volumesLabel', { defaultValue: '数据卷映射 (宿主路径:容器路径)' })}</div>
                        <Input
                            placeholder={t('containers.volumesPlaceholder', { defaultValue: '如: /home/data:/var/lib/data, vol_name:/app' })}
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
                        <div style={{ fontSize: 13, marginBottom: 4, fontWeight: 500 }}>{t('containers.envLabel', { defaultValue: '环境变量 (KEY=VALUE, 逗号分隔)' })}</div>
                        <Input
                            placeholder={t('containers.envPlaceholder', { defaultValue: '如: ENV=production, PORT=8080' })}
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
                            <div style={{ fontSize: 13, marginBottom: 4, fontWeight: 500 }}>{t('containers.restartPolicyLabel', { defaultValue: '重启策略 (Restart Policy)' })}</div>
                            <Select
                                style={{ width: '100%' }}
                                value={createForm.restartPolicy || 'unless-stopped'}
                                onChange={(val) => setCreateForm({ ...createForm, restartPolicy: val })}
                                options={[
                                    { label: t('containers.policyUnlessStopped', { defaultValue: '除非手动停止 (unless-stopped)' }), value: 'unless-stopped' },
                                    { label: t('containers.policyAlways', { defaultValue: '总是重启 (always)' }), value: 'always' },
                                    { label: t('containers.policyOnFailure', { defaultValue: '失败时重启 (on-failure)' }), value: 'on-failure' },
                                    { label: t('containers.policyNo', { defaultValue: '不重启 (no)' }), value: 'no' },
                                ]}
                            />
                        </div>
                        <div>
                            <div style={{ fontSize: 13, marginBottom: 4, fontWeight: 500 }}>{t('containers.autoRemoveLabel', { defaultValue: '退出自动清理 (--rm)' })}</div>
                            <Switch
                                checked={!!createForm.autoRemove}
                                onChange={(checked) => setCreateForm({ ...createForm, autoRemove: checked })}
                            />
                        </div>
                    </div>
                </Space>
            </AntdModal>

            {/* 统一容器交互式终端 */}
            <ContainerTerminalModal
                open={!!execTarget}
                onClose={() => setExecTarget(null)}
                target={execTarget}
            />
        </div>
    )
}
