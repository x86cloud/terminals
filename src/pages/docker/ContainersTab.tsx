import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
    Terminal,
    Loader2,
    X,
} from 'lucide-react'
import { API } from '@/api'
import type { DockerContainerInfo, DockerCreateContainerReq } from '@/types'
import ContainerTerminalModal, { ContainerExecTarget } from '@/components/common/ContainerTerminalModal'
import ContainerLogsDrawer from './components/ContainerLogsDrawer'
import InspectModal from './components/InspectModal'
import { useTranslation } from 'react-i18next'
import s from './DockerClient.module.less'

interface Props {
    serverId: string
    isActive?: boolean
    refreshSignal?: number
    onMutate?: () => void
    pendingRunImage?: { image: string; nonce: number } | null
    onConsumePendingRunImage?: () => void
}

interface PortRow {
    host: string
    container: string
    proto: 'tcp' | 'udp'
}

interface VolumeRow {
    host: string
    container: string
}

interface EnvRow {
    key: string
    value: string
}

export default function ContainersTab({
    serverId,
    isActive = true,
    refreshSignal = 0,
    onMutate,
    pendingRunImage,
    onConsumePendingRunImage,
}: Props) {
    const { t } = useTranslation(['docker', 'common'])
    const { message } = App.useApp()

    const [containers, setContainers] = useState<DockerContainerInfo[]>([])
    const [loading, setLoading] = useState(false)
    const [busyMap, setBusyMap] = useState<Record<string, string>>({})
    const busyMapRef = useRef(busyMap)
    busyMapRef.current = busyMap

    const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([])
    const [batchBusy, setBatchBusy] = useState(false)
    const [autoRefreshMs, setAutoRefreshMs] = useState<number>(0)

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

    // Inspect 模态框
    const [inspectModal, setInspectModal] = useState<{ open: boolean; title: string; json: string }>({
        open: false,
        title: '',
        json: '',
    })

    // 新建容器模态框（结构化表单，避免逗号分隔破坏含逗号的 ENV 值）
    const [createModal, setCreateModal] = useState(false)
    const [creating, setCreating] = useState(false)
    const [createImage, setCreateImage] = useState('')
    const [createName, setCreateName] = useState('')
    const [createPorts, setCreatePorts] = useState<PortRow[]>([{ host: '', container: '', proto: 'tcp' }])
    const [createVolumes, setCreateVolumes] = useState<VolumeRow[]>([{ host: '', container: '' }])
    const [createEnv, setCreateEnv] = useState<EnvRow[]>([{ key: '', value: '' }])
    const [createRestartPolicy, setCreateRestartPolicy] = useState('unless-stopped')
    const [createAutoRemove, setCreateAutoRemove] = useState(false)
    const [startAfterCreate, setStartAfterCreate] = useState(true)

    const resetCreateForm = useCallback((initialImage = '') => {
        setCreateImage(initialImage)
        setCreateName('')
        setCreatePorts([{ host: '', container: '', proto: 'tcp' }])
        setCreateVolumes([{ host: '', container: '' }])
        setCreateEnv([{ key: '', value: '' }])
        setCreateRestartPolicy('unless-stopped')
        setCreateAutoRemove(false)
        setStartAfterCreate(true)
    }, [])

    const fetchContainers = useCallback(
        async (quiet = false) => {
            if (!serverId) return
            if (!quiet) setLoading(true)
            try {
                const list = await API.dockerListContainers(serverId, true)
                setContainers(list)
                const aliveIds = new Set(list.map((c) => c.id))
                setSelectedRowKeys((prev) => prev.filter((k) => aliveIds.has(String(k))))
            } catch (err: any) {
                if (!quiet) {
                    message.error(
                        t('containers.fetchFail', {
                            defaultValue: '获取容器列表失败: {{error}}',
                            error: err.message || String(err),
                        })
                    )
                }
            } finally {
                if (!quiet) setLoading(false)
            }
        },
        [serverId, message, t]
    )

    useEffect(() => {
        void fetchContainers(false)
    }, [fetchContainers])

    useEffect(() => {
        if (refreshSignal > 0) {
            void fetchContainers(false)
        }
    }, [refreshSignal, fetchContainers])

    useEffect(() => {
        if (!autoRefreshMs || !isActive) return
        const timer = window.setInterval(() => {
            if (Object.keys(busyMapRef.current).length === 0) {
                void fetchContainers(true)
            }
        }, autoRefreshMs)
        return () => window.clearInterval(timer)
    }, [autoRefreshMs, isActive, fetchContainers])

    useEffect(() => {
        if (pendingRunImage?.image) {
            resetCreateForm(pendingRunImage.image)
            setCreateModal(true)
            onConsumePendingRunImage?.()
        }
    }, [pendingRunImage?.nonce, pendingRunImage?.image, resetCreateForm, onConsumePendingRunImage])

    const actionPendingLabel = (action: string): string => {
        switch (action) {
            case 'start':
                return t('containers.pendingStart', { defaultValue: '启动中...' })
            case 'stop':
                return t('containers.pendingStop', { defaultValue: '停止中...' })
            case 'restart':
                return t('containers.pendingRestart', { defaultValue: '重启中...' })
            case 'pause':
                return t('containers.pendingPause', { defaultValue: '暂停中...' })
            case 'unpause':
                return t('containers.pendingUnpause', { defaultValue: '恢复中...' })
            case 'remove':
            case 'forceremove':
                return t('containers.pendingRemove', { defaultValue: '删除中...' })
            default:
                return action
        }
    }

    const actionSuccessLabel = (action: string, name: string): string => {
        switch (action) {
            case 'start':
                return t('containers.startedToast', { defaultValue: '容器 [{{name}}] 已启动', name })
            case 'stop':
                return t('containers.stoppedToast', { defaultValue: '容器 [{{name}}] 已停止', name })
            case 'restart':
                return t('containers.restartedToast', { defaultValue: '容器 [{{name}}] 重启完成', name })
            case 'pause':
                return t('containers.pausedToast', { defaultValue: '容器 [{{name}}] 已暂停', name })
            case 'unpause':
                return t('containers.unpausedToast', { defaultValue: '容器 [{{name}}] 已恢复运行', name })
            case 'remove':
            case 'forceremove':
                return t('containers.removedToast', { defaultValue: '容器 [{{name}}] 已删除', name })
            default:
                return `${name}: ${action}`
        }
    }

    const handleControl = async (record: DockerContainerInfo, action: string) => {
        if (busyMap[record.id]) return
        const displayName = record.name || record.shortId
        setBusyMap((prev) => ({ ...prev, [record.id]: action }))
        const hide = message.loading(`[${displayName}] ${actionPendingLabel(action)}`, 0)
        try {
            await API.dockerControlContainer(serverId, record.id, action)
            message.success(actionSuccessLabel(action, displayName))
            await fetchContainers(true)
            onMutate?.()
        } catch (err: any) {
            message.error(
                t('containers.opFail', {
                    defaultValue: '操作失败: {{error}}',
                    error: err.message || String(err),
                })
            )
        } finally {
            hide()
            setBusyMap((prev) => {
                const next = { ...prev }
                delete next[record.id]
                return next
            })
        }
    }

    const handleBatchAction = async (action: 'start' | 'stop' | 'restart' | 'forceremove') => {
        if (batchBusy || selectedRowKeys.length === 0) return
        const ids = selectedRowKeys.map(String)
        setBatchBusy(true)
        setBusyMap((prev) => {
            const next = { ...prev }
            ids.forEach((id) => {
                next[id] = action
            })
            return next
        })
        const hide = message.loading(
            t('containers.batchExecuting', {
                defaultValue: '正在对 {{count}} 个容器执行操作...',
                count: ids.length,
            }),
            0
        )
        try {
            const results = await Promise.allSettled(
                ids.map((id) => API.dockerControlContainer(serverId, id, action))
            )
            const failedCount = results.filter((r) => r.status === 'rejected').length
            const okCount = results.length - failedCount
            if (failedCount === 0) {
                message.success(
                    t('containers.batchSuccess', {
                        defaultValue: '批量操作完成（成功 {{count}} 个）',
                        count: okCount,
                    })
                )
            } else {
                message.warning(
                    t('containers.batchPartial', {
                        defaultValue: '批量操作完成：成功 {{ok}} 个，失败 {{failed}} 个',
                        ok: okCount,
                        failed: failedCount,
                    })
                )
            }
            setSelectedRowKeys([])
            await fetchContainers(true)
            onMutate?.()
        } finally {
            hide()
            setBatchBusy(false)
            setBusyMap((prev) => {
                const next = { ...prev }
                ids.forEach((id) => delete next[id])
                return next
            })
        }
    }

    const openLogs = (c: DockerContainerInfo) => {
        setLogDrawer({ open: true, container: c })
    }

    const openInspect = async (c: DockerContainerInfo) => {
        if (busyMap[c.id]) return
        setBusyMap((prev) => ({ ...prev, [c.id]: 'inspect' }))
        try {
            const json = await API.dockerInspectContainer(serverId, c.id)
            setInspectModal({
                open: true,
                title: t('containers.inspectTitle', {
                    defaultValue: '容器详情 (Inspect): {{name}}',
                    name: c.name || c.shortId,
                }),
                json,
            })
        } catch (err: any) {
            message.error(
                t('containers.inspectFail', {
                    defaultValue: '查看详情失败: {{error}}',
                    error: err.message || String(err),
                })
            )
        } finally {
            setBusyMap((prev) => {
                const next = { ...prev }
                delete next[c.id]
                return next
            })
        }
    }

    const handleCreateSubmit = async () => {
        if (!createImage.trim()) {
            message.warning(t('containers.reqImage', '请输入镜像名称'))
            return
        }
        setCreating(true)
        try {
            const ports = createPorts
                .filter((r) => r.container.trim() !== '')
                .map((r) => {
                    const c = `${r.container.trim()}/${r.proto}`
                    return r.host.trim() ? `${r.host.trim()}:${c}` : c
                })
            const volumes = createVolumes
                .filter((r) => r.host.trim() !== '' && r.container.trim() !== '')
                .map((r) => `${r.host.trim()}:${r.container.trim()}`)
            const env = createEnv
                .filter((r) => r.key.trim() !== '')
                .map((r) => `${r.key.trim()}=${r.value}`)

            const req: DockerCreateContainerReq = {
                name: createName.trim(),
                image: createImage.trim(),
                ports,
                volumes,
                env,
                restartPolicy: createRestartPolicy,
                autoRemove: createAutoRemove,
            }
            const newId = await API.dockerCreateContainer(serverId, req)
            if (startAfterCreate && newId) {
                try {
                    await API.dockerControlContainer(serverId, newId, 'start')
                    message.success(
                        t('containers.createAndStarted', {
                            defaultValue: '容器创建并启动成功',
                        })
                    )
                } catch (startErr: any) {
                    message.warning(
                        t('containers.createdStartFail', {
                            defaultValue: '容器已创建，但启动失败: {{error}}',
                            error: startErr?.message || String(startErr),
                        })
                    )
                }
            } else {
                message.success(t('containers.createSuccess', { defaultValue: '容器创建成功' }))
            }
            setCreateModal(false)
            resetCreateForm('')
            await fetchContainers(true)
            onMutate?.()
        } catch (err: any) {
            message.error(
                t('containers.createFail', {
                    defaultValue: '创建容器失败: {{error}}',
                    error: err.message || String(err),
                })
            )
        } finally {
            setCreating(false)
        }
    }

    const filtered = useMemo(
        () =>
            containers.filter((c) => {
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
            }),
        [containers, filterState, searchKw]
    )

    const columns: ColumnsType<DockerContainerInfo> = [
        {
            title: t('containers.colState', { defaultValue: '状态' }),
            dataIndex: 'state',
            width: 135,
            render: (state: string, record) => {
                const busyAction = busyMap[record.id]
                if (busyAction && busyAction !== 'inspect') {
                    return (
                        <div className={`${s.statusBadge} ${s.statusPending}`} title={record.status}>
                            <Loader2 size={12} className="animate-spin" />
                            <span>{actionPendingLabel(busyAction)}</span>
                        </div>
                    )
                }
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
            render: (status: string) => (
                <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{status}</span>
            ),
        },
        {
            title: t('containers.colActions', { defaultValue: '快捷操作' }),
            key: 'actions',
            width: 265,
            fixed: 'right',
            render: (_, record) => {
                const isRunning = record.state === 'running'
                const isPaused = record.state === 'paused'
                const busyAction = busyMap[record.id]
                const isLifecycleBusy = !!busyAction && busyAction !== 'inspect'
                const isInspecting = busyAction === 'inspect'
                return (
                    <Space size={4}>
                        {isRunning ? (
                            <>
                                <Tooltip title={t('containers.stopTooltip', { defaultValue: '停止容器' })}>
                                    <Button
                                        size="small"
                                        type="text"
                                        danger
                                        loading={busyAction === 'stop'}
                                        disabled={isLifecycleBusy && busyAction !== 'stop'}
                                        icon={<Square size={13} />}
                                        onClick={() => handleControl(record, 'stop')}
                                    />
                                </Tooltip>
                                <Tooltip title={t('containers.restartTooltip', { defaultValue: '重启容器' })}>
                                    <Button
                                        size="small"
                                        type="text"
                                        loading={busyAction === 'restart'}
                                        disabled={isLifecycleBusy && busyAction !== 'restart'}
                                        icon={<RotateCw size={13} />}
                                        onClick={() => handleControl(record, 'restart')}
                                    />
                                </Tooltip>
                                <Tooltip title={t('containers.pauseTooltip', { defaultValue: '暂停容器' })}>
                                    <Button
                                        size="small"
                                        type="text"
                                        loading={busyAction === 'pause'}
                                        disabled={isLifecycleBusy && busyAction !== 'pause'}
                                        icon={<Pause size={13} />}
                                        onClick={() => handleControl(record, 'pause')}
                                    />
                                </Tooltip>
                            </>
                        ) : isPaused ? (
                            <Tooltip title={t('containers.resumeTooltip', { defaultValue: '恢复运行' })}>
                                <Button
                                    size="small"
                                    type="text"
                                    style={{ color: 'var(--ok)' }}
                                    loading={busyAction === 'unpause'}
                                    disabled={isLifecycleBusy && busyAction !== 'unpause'}
                                    icon={<Play size={13} />}
                                    onClick={() => handleControl(record, 'unpause')}
                                />
                            </Tooltip>
                        ) : (
                            <Tooltip title={t('containers.startTooltip', { defaultValue: '启动容器' })}>
                                <Button
                                    size="small"
                                    type="text"
                                    style={{ color: 'var(--ok)' }}
                                    loading={busyAction === 'start'}
                                    disabled={isLifecycleBusy && busyAction !== 'start'}
                                    icon={<Play size={13} />}
                                    onClick={() => handleControl(record, 'start')}
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
                                loading={isInspecting}
                                icon={<Code size={13} />}
                                onClick={() => openInspect(record)}
                            />
                        </Tooltip>

                        <Tooltip title={t('containers.execTooltip', { defaultValue: '终端 (Exec)' })}>
                            <Button
                                size="small"
                                type="text"
                                disabled={!isRunning || isLifecycleBusy}
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
                            description={
                                isRunning
                                    ? t('containers.deleteRunningDesc', { defaultValue: '该容器当前正在运行，将执行强制删除 (-f)' })
                                    : t('containers.deleteDesc', { defaultValue: '此操作不可逆' })
                            }
                            onConfirm={() => handleControl(record, isRunning ? 'forceremove' : 'remove')}
                            okText={t('containers.deleteBtn', { defaultValue: '删除' })}
                            cancelText={t('containers.cancelBtn', { defaultValue: '取消' })}
                            okButtonProps={{ danger: true }}
                            disabled={isLifecycleBusy}
                        >
                            <Tooltip title={t('containers.deleteTooltip', { defaultValue: '删除容器' })}>
                                <Button
                                    size="small"
                                    type="text"
                                    danger
                                    loading={busyAction === 'remove' || busyAction === 'forceremove'}
                                    disabled={isLifecycleBusy && busyAction !== 'remove' && busyAction !== 'forceremove'}
                                    icon={<Trash2 size={13} />}
                                />
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
                        <Radio.Button value="all">
                            {t('containers.filterAll', { defaultValue: '全部 ({{count}})', count: containers.length })}
                        </Radio.Button>
                        <Radio.Button value="running">
                            {t('containers.filterRunning', {
                                defaultValue: '运行中 ({{count}})',
                                count: containers.filter((c) => c.state === 'running').length,
                            })}
                        </Radio.Button>
                        <Radio.Button value="stopped">
                            {t('containers.filterStopped', {
                                defaultValue: '已停止 ({{count}})',
                                count: containers.filter((c) => c.state !== 'running').length,
                            })}
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
                    <Select
                        size="small"
                        value={autoRefreshMs}
                        onChange={setAutoRefreshMs}
                        style={{ width: 122 }}
                        options={[
                            { label: t('containers.autoRefreshOff', { defaultValue: '自动刷新: 关' }), value: 0 },
                            { label: t('containers.autoRefresh5s', { defaultValue: '自动刷新: 5s' }), value: 5000 },
                            { label: t('containers.autoRefresh10s', { defaultValue: '自动刷新: 10s' }), value: 10000 },
                        ]}
                    />
                    <Button
                        type="primary"
                        icon={<Plus size={14} />}
                        size="small"
                        onClick={() => {
                            resetCreateForm('')
                            setCreateModal(true)
                        }}
                    >
                        {t('containers.createBtn', { defaultValue: '创建容器' })}
                    </Button>
                    <Button
                        icon={<RefreshCw size={13} className={loading ? 'animate-spin' : ''} />}
                        size="small"
                        onClick={() => void fetchContainers(false)}
                    >
                        {t('common:refresh', { defaultValue: '刷新' })}
                    </Button>
                </div>
            </div>

            {selectedRowKeys.length > 0 && (
                <div className={s.batchBar}>
                    <span style={{ fontSize: 12.5, fontWeight: 500 }}>
                        {t('containers.selectedCount', {
                            defaultValue: '已选 {{count}} 个容器',
                            count: selectedRowKeys.length,
                        })}
                    </span>
                    <Space size={6} wrap>
                        <Button
                            size="small"
                            icon={<Play size={12} />}
                            loading={batchBusy}
                            onClick={() => void handleBatchAction('start')}
                        >
                            {t('containers.batchStart', { defaultValue: '批量启动' })}
                        </Button>
                        <Button
                            size="small"
                            icon={<Square size={12} />}
                            loading={batchBusy}
                            onClick={() => void handleBatchAction('stop')}
                        >
                            {t('containers.batchStop', { defaultValue: '批量停止' })}
                        </Button>
                        <Button
                            size="small"
                            icon={<RotateCw size={12} />}
                            loading={batchBusy}
                            onClick={() => void handleBatchAction('restart')}
                        >
                            {t('containers.batchRestart', { defaultValue: '批量重启' })}
                        </Button>
                        <Popconfirm
                            title={t('containers.batchDeleteConfirm', {
                                defaultValue: '确认强制删除选中的 {{count}} 个容器？',
                                count: selectedRowKeys.length,
                            })}
                            okText={t('containers.deleteBtn', { defaultValue: '删除' })}
                            cancelText={t('containers.cancelBtn', { defaultValue: '取消' })}
                            okButtonProps={{ danger: true }}
                            onConfirm={() => void handleBatchAction('forceremove')}
                        >
                            <Button size="small" danger icon={<Trash2 size={12} />} loading={batchBusy}>
                                {t('containers.batchDelete', { defaultValue: '批量删除' })}
                            </Button>
                        </Popconfirm>
                        <Button size="small" type="text" onClick={() => setSelectedRowKeys([])}>
                            {t('containers.clearSelection', { defaultValue: '取消选择' })}
                        </Button>
                    </Space>
                </div>
            )}

            {/* 容器表格 */}
            <Table
                columns={columns}
                dataSource={filtered}
                rowKey="id"
                loading={loading}
                size="small"
                rowSelection={{
                    selectedRowKeys,
                    onChange: setSelectedRowKeys,
                }}
                pagination={{
                    current: page,
                    pageSize: pageSize,
                    total: filtered.length,
                    showSizeChanger: true,
                    pageSizeOptions: ['10', '20', '50', '100'],
                    showTotal: (total, range) =>
                        t('common:paginationTotal', {
                            defaultValue: `第 ${range[0]}-${range[1]} 条 / 共 ${total} 条`,
                            from: range[0],
                            to: range[1],
                            total,
                        }),
                    onChange: (p, ps) => {
                        setPage(p)
                        setPageSize(ps)
                    },
                }}
                scroll={{ x: 1050 }}
            />

            {/* 统一实时容器日志抽屉 */}
            <ContainerLogsDrawer
                open={logDrawer.open}
                serverId={serverId}
                containerId={logDrawer.container?.id || ''}
                containerName={logDrawer.container?.name || logDrawer.container?.shortId || ''}
                onClose={() => setLogDrawer({ open: false, container: null })}
            />

            {/* Inspect 详情模态框 */}
            <InspectModal
                open={inspectModal.open}
                title={inspectModal.title}
                json={inspectModal.json}
                kind="container"
                onClose={() => setInspectModal({ open: false, title: '', json: '' })}
            />

            {/* 新建容器模态框 */}
            <AntdModal
                title={t('containers.createModalTitle', { defaultValue: '创建并配置新容器' })}
                open={createModal}
                onCancel={() => !creating && setCreateModal(false)}
                onOk={handleCreateSubmit}
                confirmLoading={creating}
                okText={t('containers.createBtn', { defaultValue: '创建容器' })}
                cancelText={t('containers.cancelBtn', { defaultValue: '取消' })}
                width={620}
                centered
            >
                <Space orientation="vertical" size={12} style={{ width: '100%', padding: '8px 0' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 10 }}>
                        <div>
                            <div style={{ fontSize: 13, marginBottom: 4, fontWeight: 500 }}>
                                {t('containers.imageLabel', { defaultValue: '镜像名称 (Image)' })}{' '}
                                <span style={{ color: 'var(--danger)' }}>*</span>
                            </div>
                            <Input
                                placeholder={t('containers.imagePlaceholder', {
                                    defaultValue: '如: nginx:alpine / redis:latest',
                                })}
                                value={createImage}
                                onChange={(e) => setCreateImage(e.target.value)}
                            />
                        </div>
                        <div>
                            <div style={{ fontSize: 13, marginBottom: 4, fontWeight: 500 }}>
                                {t('containers.nameLabel', { defaultValue: '容器名称 (Name, 可选)' })}
                            </div>
                            <Input
                                placeholder={t('containers.namePlaceholder', { defaultValue: '如: my-nginx-web' })}
                                value={createName}
                                onChange={(e) => setCreateName(e.target.value)}
                            />
                        </div>
                    </div>

                    {/* 端口映射逐行配置 */}
                    <div>
                        <div className={s.kvGroupHeader}>
                            <span style={{ fontSize: 13, fontWeight: 500 }}>
                                {t('containers.portsLabel', { defaultValue: '端口映射 (宿主端口:容器端口)' })}
                            </span>
                            <Button
                                size="small"
                                type="dashed"
                                icon={<Plus size={12} />}
                                onClick={() =>
                                    setCreatePorts((prev) => [...prev, { host: '', container: '', proto: 'tcp' }])
                                }
                            >
                                {t('common:add', { defaultValue: '添加' })}
                            </Button>
                        </div>
                        {createPorts.map((row, idx) => (
                            <div key={idx} className={s.kvRow}>
                                <Input
                                    size="small"
                                    placeholder={t('containers.hostPortPh', { defaultValue: '宿主端口 (如 8080)' })}
                                    value={row.host}
                                    onChange={(e) =>
                                        setCreatePorts((prev) =>
                                            prev.map((r, i) => (i === idx ? { ...r, host: e.target.value } : r))
                                        )
                                    }
                                />
                                <span style={{ color: 'var(--text-faint)' }}>:</span>
                                <Input
                                    size="small"
                                    placeholder={t('containers.containerPortPh', { defaultValue: '容器端口 (如 80)' })}
                                    value={row.container}
                                    onChange={(e) =>
                                        setCreatePorts((prev) =>
                                            prev.map((r, i) => (i === idx ? { ...r, container: e.target.value } : r))
                                        )
                                    }
                                />
                                <Select
                                    size="small"
                                    value={row.proto}
                                    style={{ width: 80 }}
                                    onChange={(val) =>
                                        setCreatePorts((prev) =>
                                            prev.map((r, i) => (i === idx ? { ...r, proto: val } : r))
                                        )
                                    }
                                    options={[
                                        { label: 'tcp', value: 'tcp' },
                                        { label: 'udp', value: 'udp' },
                                    ]}
                                />
                                <Button
                                    size="small"
                                    type="text"
                                    icon={<X size={13} />}
                                    disabled={createPorts.length <= 1}
                                    onClick={() =>
                                        setCreatePorts((prev) => prev.filter((_, i) => i !== idx))
                                    }
                                />
                            </div>
                        ))}
                    </div>

                    {/* 数据卷映射逐行配置 */}
                    <div>
                        <div className={s.kvGroupHeader}>
                            <span style={{ fontSize: 13, fontWeight: 500 }}>
                                {t('containers.volumesLabel', { defaultValue: '数据卷映射 (宿主路径:容器路径)' })}
                            </span>
                            <Button
                                size="small"
                                type="dashed"
                                icon={<Plus size={12} />}
                                onClick={() => setCreateVolumes((prev) => [...prev, { host: '', container: '' }])}
                            >
                                {t('common:add', { defaultValue: '添加' })}
                            </Button>
                        </div>
                        {createVolumes.map((row, idx) => (
                            <div key={idx} className={s.kvRow}>
                                <Input
                                    size="small"
                                    placeholder={t('containers.hostVolPh', { defaultValue: '宿主机路径或卷名' })}
                                    value={row.host}
                                    onChange={(e) =>
                                        setCreateVolumes((prev) =>
                                            prev.map((r, i) => (i === idx ? { ...r, host: e.target.value } : r))
                                        )
                                    }
                                />
                                <span style={{ color: 'var(--text-faint)' }}>:</span>
                                <Input
                                    size="small"
                                    placeholder={t('containers.containerVolPh', { defaultValue: '容器内挂载路径' })}
                                    value={row.container}
                                    onChange={(e) =>
                                        setCreateVolumes((prev) =>
                                            prev.map((r, i) => (i === idx ? { ...r, container: e.target.value } : r))
                                        )
                                    }
                                />
                                <Button
                                    size="small"
                                    type="text"
                                    icon={<X size={13} />}
                                    disabled={createVolumes.length <= 1}
                                    onClick={() =>
                                        setCreateVolumes((prev) => prev.filter((_, i) => i !== idx))
                                    }
                                />
                            </div>
                        ))}
                    </div>

                    {/* 环境变量逐行配置 */}
                    <div>
                        <div className={s.kvGroupHeader}>
                            <span style={{ fontSize: 13, fontWeight: 500 }}>
                                {t('containers.envLabel', { defaultValue: '环境变量 (KEY = VALUE)' })}
                            </span>
                            <Button
                                size="small"
                                type="dashed"
                                icon={<Plus size={12} />}
                                onClick={() => setCreateEnv((prev) => [...prev, { key: '', value: '' }])}
                            >
                                {t('common:add', { defaultValue: '添加' })}
                            </Button>
                        </div>
                        {createEnv.map((row, idx) => (
                            <div key={idx} className={s.kvRow}>
                                <Input
                                    size="small"
                                    placeholder="KEY"
                                    value={row.key}
                                    onChange={(e) =>
                                        setCreateEnv((prev) =>
                                            prev.map((r, i) => (i === idx ? { ...r, key: e.target.value } : r))
                                        )
                                    }
                                />
                                <span style={{ color: 'var(--text-faint)' }}>=</span>
                                <Input
                                    size="small"
                                    placeholder="VALUE"
                                    value={row.value}
                                    onChange={(e) =>
                                        setCreateEnv((prev) =>
                                            prev.map((r, i) => (i === idx ? { ...r, value: e.target.value } : r))
                                        )
                                    }
                                />
                                <Button
                                    size="small"
                                    type="text"
                                    icon={<X size={13} />}
                                    disabled={createEnv.length <= 1}
                                    onClick={() => setCreateEnv((prev) => prev.filter((_, i) => i !== idx))}
                                />
                            </div>
                        ))}
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: 12, alignItems: 'center' }}>
                        <div>
                            <div style={{ fontSize: 13, marginBottom: 4, fontWeight: 500 }}>
                                {t('containers.restartPolicyLabel', { defaultValue: '重启策略 (Restart Policy)' })}
                            </div>
                            <Select
                                style={{ width: '100%' }}
                                value={createRestartPolicy}
                                onChange={setCreateRestartPolicy}
                                options={[
                                    { label: 'unless-stopped', value: 'unless-stopped' },
                                    { label: 'always', value: 'always' },
                                    { label: 'on-failure', value: 'on-failure' },
                                    { label: 'no', value: 'no' },
                                ]}
                            />
                        </div>
                        <div>
                            <div style={{ fontSize: 13, marginBottom: 4, fontWeight: 500 }}>
                                {t('containers.autoRemoveLabel', { defaultValue: '退出自动清理 (--rm)' })}
                            </div>
                            <Switch checked={createAutoRemove} onChange={setCreateAutoRemove} />
                        </div>
                        <div>
                            <div style={{ fontSize: 13, marginBottom: 4, fontWeight: 500 }}>
                                {t('containers.startAfterCreate', { defaultValue: '创建后立即启动' })}
                            </div>
                            <Switch checked={startAfterCreate} onChange={setStartAfterCreate} />
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
