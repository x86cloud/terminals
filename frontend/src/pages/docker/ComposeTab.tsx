import React, { useState, useEffect, useCallback } from 'react'
import {
    Play,
    Square,
    RotateCw,
    FileText,
    Search,
    Plus,
    Trash2,
    RefreshCw,
    Copy,
    Layers,
    Edit3,
    Check,
    ArrowUpRight,
    Sparkles,
    Terminal,
} from 'lucide-react'
import {
    Table as AntTable,
    Button as AntButton,
    Input as AntInput,
    Space as AntSpace,
    Tag as AntTag,
    Modal as AntModal,
    Drawer as AntDrawer,
    Popconfirm as AntPopconfirm,
    Radio as AntRadio,
    Select as AntSelect,
    Switch as AntSwitch,
    message,
    Tooltip as AntTooltip,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { API } from '@/api'
import CodeEditor from '@/components/CodeEditor'
import type {
    DockerComposeStackInfo,
    DockerComposeServiceInfo,
    DockerComposeRecord,
} from '@/types'
import ContainerTerminalModal, { ContainerExecTarget } from '@/components/common/ContainerTerminalModal'
import s from './DockerClient.module.less'

interface Props {
    serverId: string
}

interface MergedComposeItem {
    id: string // UUID (若为外部未关联项目则暂为空)
    name: string // Project Name
    isLocal: boolean
    localRecord?: DockerComposeRecord
    status: 'running' | 'partially_running' | 'stopped' | 'not_deployed'
    runningServices: number
    totalServices: number
    services: DockerComposeServiceInfo[]
    configFiles: string
    createdAt: string
    updatedAt: string
}

const DEFAULT_COMPOSE_NAME = 'nginx-web'
const DEFAULT_COMPOSE_YAML = `version: '3.8'

services:
  web:
    image: nginx:alpine
    container_name: nginx-web
    restart: always
    ports:
      - "8080:80"
`

export default function ComposeTab({ serverId }: Props) {
    const [items, setItems] = useState<MergedComposeItem[]>([])
    const [loading, setLoading] = useState(false)
    const [filterState, setFilterState] = useState<'all' | 'running' | 'stopped' | 'not_deployed'>('all')
    const [searchKw, setSearchKw] = useState('')
    const [page, setPage] = useState(1)
    const [pageSize, setPageSize] = useState(10)
    const [copiedId, setCopiedId] = useState<string | null>(null)

    // 编辑 / 新建 Drawer 状态
    const [editorOpen, setEditorOpen] = useState(false)
    const [currentRecordId, setCurrentRecordId] = useState<string | null>(null) // null 表示新建
    const [projectName, setProjectName] = useState(DEFAULT_COMPOSE_NAME)
    const [yamlContent, setYamlContent] = useState(DEFAULT_COMPOSE_YAML)
    const [forcePull, setForcePull] = useState(false)
    const [recreate, setRecreate] = useState(false)
    const [updating, setUpdating] = useState(false)

    // 单个容器日志抽屉状态
    const [containerLogDrawer, setContainerLogDrawer] = useState<{
        open: boolean
        containerId: string
        containerName: string
    }>({
        open: false,
        containerId: '',
        containerName: '',
    })
    const [containerLogContent, setContainerLogContent] = useState('')
    const [containerLogTail, setContainerLogTail] = useState(200)
    const [containerLogTimestamps, setContainerLogTimestamps] = useState(false)
    const [containerLogLoading, setContainerLogLoading] = useState(false)

    // 容器 Exec 终端模态框
    const [execTarget, setExecTarget] = useState<ContainerExecTarget | null>(null)


    // 核心数据拉取与合并逻辑 (本地 records + 远程 running stacks)
    const fetchData = useCallback(async () => {
        if (!serverId) return
        setLoading(true)
        try {
            const [localRecords, remoteStacks] = await Promise.all([
                API.dockerListComposeRecords(serverId).catch(() => [] as DockerComposeRecord[]),
                API.dockerListComposeStacks(serverId).catch(() => [] as DockerComposeStackInfo[]),
            ])

            const merged: MergedComposeItem[] = []
            const matchedRemoteNames = new Set<string>()

            // 1. 处理所有本地保存的 Compose 记录
            for (const rec of localRecords) {
                // 优先通过 UUID 匹配，其次通过 ProjectName 匹配
                const matchedStack = remoteStacks.find(
                    (s) =>
                        (s.uuid && s.uuid === rec.id) ||
                        s.name.toLowerCase() === rec.projectName.toLowerCase()
                )

                if (matchedStack) {
                    matchedRemoteNames.add(matchedStack.name)
                    merged.push({
                        id: rec.id,
                        name: rec.projectName,
                        isLocal: true,
                        localRecord: rec,
                        status: (matchedStack.status as any) || 'running',
                        runningServices: matchedStack.runningServices || 0,
                        totalServices: matchedStack.totalServices || 0,
                        services: matchedStack.services || [],
                        configFiles: matchedStack.configFiles || '本地记录',
                        createdAt: rec.createdAt || matchedStack.createdAt,
                        updatedAt: rec.updatedAt || rec.createdAt,
                    })
                } else {
                    // 本地记录已保存，但远程容器未运行
                    merged.push({
                        id: rec.id,
                        name: rec.projectName,
                        isLocal: true,
                        localRecord: rec,
                        status: 'not_deployed',
                        runningServices: 0,
                        totalServices: 0,
                        services: [],
                        configFiles: '本地记录 (docker-compose.yml)',
                        createdAt: rec.createdAt,
                        updatedAt: rec.updatedAt || rec.createdAt,
                    })
                }
            }

            // 2. 补齐远程探测到但本地未登记的外部项目
            for (const s of remoteStacks) {
                if (!matchedRemoteNames.has(s.name)) {
                    merged.push({
                        id: s.uuid || '',
                        name: s.name,
                        isLocal: false,
                        status: (s.status as any) || 'running',
                        runningServices: s.runningServices || 0,
                        totalServices: s.totalServices || 0,
                        services: s.services || [],
                        configFiles: s.configFiles || '外部项目',
                        createdAt: s.createdAt,
                        updatedAt: s.createdAt,
                    })
                }
            }

            setItems(merged)
        } catch (err: any) {
            message.error(`获取 Compose 列表失败: ${err.message || String(err)}`)
        } finally {
            setLoading(false)
        }
    }, [serverId])

    useEffect(() => {
        fetchData()
    }, [fetchData])

    // 打开新建抽屉：自动填充默认示例
    const openCreateDrawer = () => {
        setCurrentRecordId(null)
        setProjectName(DEFAULT_COMPOSE_NAME)
        setYamlContent(DEFAULT_COMPOSE_YAML)
        setForcePull(false)
        setRecreate(false)
        setEditorOpen(true)
    }

    // 打开编辑抽屉
    const openEditDrawer = (item: MergedComposeItem) => {
        setCurrentRecordId(item.id || null)
        setProjectName(item.name)
        if (item.localRecord?.yamlContent) {
            setYamlContent(item.localRecord.yamlContent)
        } else {
            // 外部项目尝试构造基础 YAML 模版
            setYamlContent(`version: '3.8'\n# 外部项目: ${item.name}\nservices:\n` +
                (item.services && item.services.length > 0
                    ? item.services.map(svc => `  ${svc.serviceName}:\n    image: ${svc.image}\n`).join('')
                    : `  app:\n    image: alpine\n`))
        }
        setForcePull(false)
        setRecreate(false)
        setEditorOpen(true)
    }

    // 类似 docker compose up：智能增量更新，并在实例部署成功后保存本地记录
    const handleUpAndUpdate = async () => {
        const cleanName = projectName.trim().toLowerCase().replace(/[^a-z0-9-_]/g, '')
        if (!cleanName) {
            message.warning('请输入有效的项目名称 (Project Name)')
            return
        }
        if (!yamlContent.trim()) {
            message.warning('请输入 docker-compose.yml 编排内容')
            return
        }

        setUpdating(true)
        const hideLoading = message.loading('正在执行 Compose 智能更新部署 (docker compose up)...', 0)
        try {
            const record: DockerComposeRecord = {
                id: currentRecordId || '',
                serverId,
                projectName: cleanName,
                yamlContent: yamlContent.trim(),
                envVars: {},
                createdAt: '',
                updatedAt: '',
            }
            await API.dockerUpComposeStack(serverId, record, forcePull, recreate)
            hideLoading()
            message.success(`Compose 项目 [${cleanName}] 实例已成功启动`)
            setEditorOpen(false)
            fetchData()
        } catch (err: any) {
            hideLoading()
            AntModal.error({
                title: 'Compose 部署失败 (配置未落盘)',
                width: 600,
                content: (
                    <div style={{ marginTop: 8 }}>
                        <div style={{ marginBottom: 8, color: 'var(--text-dim)', fontSize: 13 }}>
                            容器未能成功启动，已自动清理本次创建的中间资源。本地 YAML 未保存或覆盖，请排查以下错误后重试：
                        </div>
                        <div
                            style={{
                                maxHeight: 320,
                                overflow: 'auto',
                                whiteSpace: 'pre-wrap',
                                fontFamily: 'var(--font-mono)',
                                fontSize: 12,
                                background: 'var(--bg-2)',
                                padding: '8px 12px',
                                borderRadius: 4,
                                border: '1px solid var(--border)',
                                color: 'var(--danger)',
                            }}
                        >
                            {err.message || String(err)}
                        </div>
                    </div>
                ),
            })
        } finally {
            setUpdating(false)
        }
    }

    // 强力联动删除：清理远程容器与网络，并移除本地记录
    const handleDelete = async (item: MergedComposeItem) => {
        const hide = message.loading(`正在清理并销毁项目 [${item.name}]...`, 0)
        try {
            if (item.isLocal && item.id) {
                await API.dockerDeleteComposeRecord(serverId, item.id)
            } else {
                await API.dockerControlComposeStack(serverId, item.name, 'down')
            }
            message.success(`项目 [${item.name}] 已彻底清理并移除`)
            fetchData()
        } catch (err: any) {
            message.error(`删除清理失败: ${err.message || String(err)}`)
        } finally {
            hide()
        }
    }

    // 控制操作（start, stop, restart, down）
    const handleControl = async (name: string, action: string) => {
        const hide = message.loading(`正在执行 ${action.toUpperCase()} 操作...`, 0)
        try {
            await API.dockerControlComposeStack(serverId, name, action)
            message.success(`操作 ${action} 成功`)
            fetchData()
        } catch (err: any) {
            message.error(`操作失败: ${err.message || String(err)}`)
        } finally {
            hide()
        }
    }

    // 单个服务容器控制（启动、停止、重启）
    const handleContainerControl = async (containerId: string, action: string) => {
        const hide = message.loading(`正在对容器执行 ${action.toUpperCase()}...`, 0)
        try {
            await API.dockerControlContainer(serverId, containerId, action)
            message.success(`容器 ${action} 操作成功`)
            fetchData()
        } catch (err: any) {
            message.error(`容器操作失败: ${err.message || String(err)}`)
        } finally {
            hide()
        }
    }

    // 单个服务容器日志拉取
    const fetchContainerLogs = async (
        containerId: string,
        tail = containerLogTail,
        timestamps = containerLogTimestamps
    ) => {
        setContainerLogLoading(true)
        try {
            const content = await API.dockerGetContainerLogs(serverId, containerId, tail, timestamps)
            setContainerLogContent(content || '(无日志输出)')
        } catch (err: any) {
            message.error(`获取容器日志失败: ${err.message || String(err)}`)
        } finally {
            setContainerLogLoading(false)
        }
    }

    // 打开单个服务容器日志抽屉
    const openContainerLogs = (svc: DockerComposeServiceInfo) => {
        setContainerLogDrawer({
            open: true,
            containerId: svc.containerId,
            containerName: svc.containerName || svc.serviceName,
        })
        setContainerLogContent('')
        fetchContainerLogs(svc.containerId, containerLogTail, containerLogTimestamps)
    }


    const copyUUID = (uuid: string) => {
        navigator.clipboard.writeText(uuid)
        setCopiedId(uuid)
        message.success('UUID 已复制到剪贴板')
        setTimeout(() => setCopiedId(null), 2000)
    }

    const filtered = items.filter((item) => {
        if (filterState === 'running' && item.status !== 'running') return false
        if (filterState === 'stopped' && item.status !== 'stopped') return false
        if (filterState === 'not_deployed' && item.status !== 'not_deployed') return false
        if (!searchKw) return true
        const kw = searchKw.toLowerCase()
        const matchName = item.name.toLowerCase().includes(kw)
        const matchId = item.id.toLowerCase().includes(kw)
        const matchService = item.services?.some(
            (svc) => svc.serviceName.toLowerCase().includes(kw) || svc.image.toLowerCase().includes(kw)
        )
        return matchName || matchId || matchService
    })

    const columns: ColumnsType<MergedComposeItem> = [
        {
            title: 'Compose 项目',
            key: 'name',
            width: 280,
            render: (_, record) => (
                <AntSpace size={10} align="start">
                    <div
                        style={{
                            width: 32,
                            height: 32,
                            borderRadius: 8,
                            background: record.isLocal ? 'var(--accent-soft)' : 'rgba(147, 51, 234, 0.12)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: record.isLocal ? 'var(--accent)' : '#9333ea',
                            marginTop: 2,
                            flexShrink: 0,
                        }}
                    >
                        <Layers size={18} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontWeight: 600, fontSize: 13.5, color: 'var(--text)' }}>
                                {record.name}
                            </span>
                            {record.isLocal ? (
                                <AntTag color="blue" style={{ margin: 0, fontSize: 10, lineHeight: '18px', padding: '0 6px' }}>
                                    本地受管
                                </AntTag>
                            ) : (
                                <AntTag color="purple" style={{ margin: 0, fontSize: 10, lineHeight: '18px', padding: '0 6px' }}>
                                    外部容器
                                </AntTag>
                            )}
                        </div>
                        {record.id ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                <span
                                    style={{
                                        fontSize: 11,
                                        fontFamily: 'var(--font-mono)',
                                        color: 'var(--text-dim)',
                                    }}
                                    title={record.id}
                                >
                                    UUID: {record.id.slice(0, 8)}...{record.id.slice(-4)}
                                </span>
                                <AntButton
                                    size="small"
                                    type="text"
                                    style={{ padding: '0 2px', height: 16 }}
                                    icon={copiedId === record.id ? <Check size={11} color="var(--ok)" /> : <Copy size={11} />}
                                    onClick={() => copyUUID(record.id)}
                                />
                            </div>
                        ) : (
                            <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>暂未生成本地 UUID</span>
                        )}
                    </div>
                </AntSpace>
            ),
        },
        {
            title: '运行状态',
            dataIndex: 'status',
            key: 'status',
            width: 140,
            render: (status: string) => {
                let badgeClass = s.statusStopped
                let label = '已停止'
                if (status === 'running') {
                    badgeClass = s.statusRunning
                    label = '全部运行中'
                } else if (status === 'partially_running') {
                    badgeClass = s.statusPaused
                    label = '部分运行'
                } else if (status === 'not_deployed') {
                    return (
                        <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                            <AntTag style={{ margin: 0 }}>未部署/无容器</AntTag>
                        </span>
                    )
                }
                return (
                    <span className={`${s.statusBadge} ${badgeClass}`}>
                        {status === 'running' && <span className={s.pulseDot} />}
                        <span>{label}</span>
                    </span>
                )
            },
        },
        {
            title: '服务与容器',
            key: 'services',
            width: 170,
            render: (_, record) => {
                if (record.status === 'not_deployed') {
                    return <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>-</span>
                }
                const isAll = record.runningServices === record.totalServices && record.totalServices > 0
                return (
                    <AntTag color={isAll ? 'success' : record.runningServices > 0 ? 'warning' : 'default'}>
                        {record.runningServices} / {record.totalServices} 服务运行中
                    </AntTag>
                )
            },
        },
        {
            title: '配置与更新时间',
            key: 'time',
            render: (_, record) => (
                <div>
                    <div style={{ fontSize: 12, color: 'var(--text)' }}>
                        {record.updatedAt || record.createdAt || '-'}
                    </div>
                    <div
                        style={{
                            fontSize: 11,
                            color: 'var(--text-dim)',
                            fontFamily: 'var(--font-mono)',
                            marginTop: 2,
                        }}
                        title={record.configFiles}
                    >
                        {record.configFiles}
                    </div>
                </div>
            ),
        },
        {
            title: '操作',
            key: 'actions',
            width: 250,
            fixed: 'right',
            render: (_, record) => (
                <AntSpace size={4}>
                    <AntTooltip title={record.isLocal ? '编辑 YAML 配置并更新' : '认领/导入为本地受管 Compose'}>
                        <AntButton
                            size="small"
                            type={record.isLocal ? 'text' : 'link'}
                            icon={<Edit3 size={13} color={record.isLocal ? 'var(--accent)' : undefined} />}
                            onClick={() => openEditDrawer(record)}
                        >
                            {!record.isLocal ? '认领受管' : undefined}
                        </AntButton>
                    </AntTooltip>

                    {record.status !== 'not_deployed' && (
                        <>
                            <AntTooltip title="启动全部服务">
                                <AntButton
                                    size="small"
                                    type="text"
                                    icon={<Play size={13} color="var(--ok)" />}
                                    onClick={() => handleControl(record.name, 'start')}
                                />
                            </AntTooltip>

                            <AntTooltip title="停止全部服务">
                                <AntButton
                                    size="small"
                                    type="text"
                                    icon={<Square size={13} color="var(--warn)" />}
                                    onClick={() => handleControl(record.name, 'stop')}
                                />
                            </AntTooltip>

                            <AntTooltip title="重启所有服务">
                                <AntButton
                                    size="small"
                                    type="text"
                                    icon={<RotateCw size={13} color="var(--accent)" />}
                                    onClick={() => handleControl(record.name, 'restart')}
                                />
                            </AntTooltip>

                        </>
                    )}

                    <AntPopconfirm
                        title="确定清理删除此项目？"
                        description="将联动停止并删除关联的远程容器。"
                        onConfirm={() => handleDelete(record)}
                        okText="确认"
                        cancelText="取消"
                        okButtonProps={{ danger: true }}
                    >
                        <AntTooltip title="强力联动删除 (Down & Clean)">
                            <AntButton size="small" type="text" danger icon={<Trash2 size={13} />} />
                        </AntTooltip>
                    </AntPopconfirm>
                </AntSpace>
            ),
        },
    ]

    const serviceSubColumns: ColumnsType<DockerComposeServiceInfo> = [
        {
            title: '服务名',
            dataIndex: 'serviceName',
            width: 140,
            render: (name: string) => (
                <span style={{ fontWeight: 600, color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>
                    {name}
                </span>
            ),
        },
        {
            title: '容器名称',
            dataIndex: 'containerName',
            width: 180,
            render: (name: string, record) => (
                <span className={s.monoText} style={{ fontSize: 11.5 }}>
                    {name} <span style={{ color: 'var(--text-faint)' }}>({record.shortId})</span>
                </span>
            ),
        },
        {
            title: '镜像',
            dataIndex: 'image',
            render: (img: string) => (
                <span className={s.monoText} style={{ fontSize: 11.5, color: 'var(--text-dim)' }}>
                    {img}
                </span>
            ),
        },
        {
            title: '端口映射',
            dataIndex: 'ports',
            render: (ports: string) => (
                <span className={s.monoText} style={{ fontSize: 11.5, color: 'var(--text)' }}>
                    {ports || '-'}
                </span>
            ),
        },
        {
            title: '状态',
            dataIndex: 'state',
            width: 100,
            render: (state: string) => {
                const isRunning = state === 'running'
                return (
                    <AntTag color={isRunning ? 'success' : 'default'} style={{ margin: 0 }}>
                        {state}
                    </AntTag>
                )
            },
        },
        {
            title: '操作',
            key: 'actions',
            width: 160,
            render: (_, record) => {
                const isRunning = record.state === 'running'
                return (
                    <AntSpace size={4}>
                        {isRunning ? (
                            <>
                                <AntTooltip title="停止容器">
                                    <AntButton
                                        size="small"
                                        type="text"
                                        icon={<Square size={13} color="var(--warn)" />}
                                        onClick={() => handleContainerControl(record.containerId, 'stop')}
                                    />
                                </AntTooltip>
                                <AntTooltip title="重启容器">
                                    <AntButton
                                        size="small"
                                        type="text"
                                        icon={<RotateCw size={13} color="var(--accent)" />}
                                        onClick={() => handleContainerControl(record.containerId, 'restart')}
                                    />
                                </AntTooltip>
                            </>
                        ) : (
                            <AntTooltip title="启动容器">
                                <AntButton
                                    size="small"
                                    type="text"
                                    icon={<Play size={13} color="var(--ok)" />}
                                    onClick={() => handleContainerControl(record.containerId, 'start')}
                                />
                            </AntTooltip>
                        )}
                        <AntTooltip title="查看实时日志">
                            <AntButton
                                size="small"
                                type="text"
                                icon={<FileText size={13} />}
                                onClick={() => openContainerLogs(record)}
                            />
                        </AntTooltip>
                        <AntTooltip title="终端 (Exec)">
                            <AntButton
                                size="small"
                                type="text"
                                disabled={!isRunning}
                                icon={<Terminal size={13} />}
                                onClick={() =>
                                    setExecTarget({
                                        type: 'docker',
                                        serverId,
                                        containerId: record.containerId,
                                        title: `${record.serviceName} (${record.containerName || record.shortId})`,
                                        image: record.image,
                                    })
                                }
                            />
                        </AntTooltip>
                    </AntSpace>
                )
            },
        },
    ]

    return (
        <div>
            {/* 顶部工具栏 */}
            <div className={s.toolbar}>
                <div className={s.toolbarLeft}>
                    <AntRadio.Group
                        value={filterState}
                        onChange={(e) => {
                            setFilterState(e.target.value)
                            setPage(1)
                        }}
                        buttonStyle="solid"
                        size="small"
                    >
                        <AntRadio.Button value="all">全部 ({items.length})</AntRadio.Button>
                        <AntRadio.Button value="running">
                            运行中 ({items.filter((s) => s.status === 'running').length})
                        </AntRadio.Button>
                        <AntRadio.Button value="stopped">
                            已停止 ({items.filter((s) => s.status === 'stopped').length})
                        </AntRadio.Button>
                        <AntRadio.Button value="not_deployed">
                            未部署 ({items.filter((s) => s.status === 'not_deployed').length})
                        </AntRadio.Button>
                    </AntRadio.Group>

                    <AntInput
                        placeholder="搜索项目名称 / UUID / 服务 / 镜像..."
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
                    <AntButton
                        type="primary"
                        icon={<Plus size={14} />}
                        size="small"
                        onClick={openCreateDrawer}
                    >
                        新建
                    </AntButton>
                    <AntButton
                        icon={<RefreshCw size={13} className={loading ? 'animate-spin' : ''} />}
                        size="small"
                        onClick={fetchData}
                    >
                        刷新
                    </AntButton>
                </div>
            </div>

            {/* Compose 项目列表表格 */}
            <AntTable
                columns={columns}
                dataSource={filtered}
                rowKey={(r) => r.id || r.name}
                loading={loading}
                size="small"
                expandable={{
                    expandedRowRender: (record) => (
                        <div style={{ margin: '8px 0', padding: '10px 14px', background: 'var(--bg-2)', borderRadius: 6 }}>
                            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: 'var(--text-dim)' }}>
                                项目内服务列表 ({record.services?.length || 0} 个服务)
                            </div>
                            <AntTable
                                columns={serviceSubColumns}
                                dataSource={record.services || []}
                                rowKey="containerId"
                                pagination={false}
                                size="small"
                            />
                        </div>
                    ),
                    rowExpandable: (record) => (record.services?.length ?? 0) > 0,
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

            {/* 新建 / 编辑 Compose YAML 抽屉 */}
            <AntDrawer
                title={
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' }}>
                        <Layers size={17} color="var(--accent)" style={{ flexShrink: 0 }} />
                        <span style={{ fontWeight: 600, fontSize: 14.5, color: 'var(--text)' }}>
                            {currentRecordId ? '编辑 Compose 配置' : '新建 Docker Compose 项目'}
                        </span>
                        {currentRecordId && projectName && (
                            <AntTag
                                color="blue"
                                style={{
                                    margin: 0,
                                    maxWidth: 180,
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                    verticalAlign: 'middle',
                                    fontSize: 12,
                                    lineHeight: '20px',
                                }}
                                title={projectName}
                            >
                                {projectName}
                            </AntTag>
                        )}
                    </div>
                }
                open={editorOpen}
                onClose={() => !updating && setEditorOpen(false)}
                width={780}
                extra={
                    <AntSpace size={8}>
                        <AntButton
                            onClick={() => setEditorOpen(false)}
                            disabled={updating}
                        >
                            取消
                        </AntButton>
                        <AntButton
                            type="primary"
                            icon={<Sparkles size={13} />}
                            loading={updating}
                            onClick={handleUpAndUpdate}
                        >
                            保存
                        </AntButton>
                    </AntSpace>
                }
            >
                <AntSpace direction="vertical" size={16} style={{ width: '100%' }}>
                    <div>
                        <div
                            style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                marginBottom: 6,
                            }}
                        >
                            <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>
                                项目名称<span style={{ color: 'var(--danger)' }}>*</span>
                            </span>
                            {currentRecordId && (
                                <AntTooltip title={`完整 UUID: ${currentRecordId}（点击复制）`}>
                                    <span
                                        onClick={() => copyUUID(currentRecordId)}
                                        style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: 4,
                                            fontSize: 11,
                                            fontFamily: 'var(--font-mono)',
                                            color: 'var(--text-dim)',
                                            background: 'var(--bg-2)',
                                            padding: '2px 8px',
                                            borderRadius: 4,
                                            border: '1px solid var(--border)',
                                            cursor: 'pointer',
                                            userSelect: 'none',
                                            transition: 'all 0.15s ease',
                                        }}
                                    >
                                        <span style={{ color: 'var(--text-faint)' }}>UUID:</span>
                                        <span style={{ color: 'var(--accent)', fontWeight: 500 }}>
                                            {currentRecordId.slice(0, 8)}...{currentRecordId.slice(-4)}
                                        </span>
                                        {copiedId === currentRecordId ? (
                                            <Check size={11} color="var(--ok)" />
                                        ) : (
                                            <Copy size={11} />
                                        )}
                                    </span>
                                </AntTooltip>
                            )}
                        </div>
                        <AntInput
                            placeholder="例如: my-web-app (仅限小写英文、数字与横杠)"
                            value={projectName}
                            onChange={(e) => setProjectName(e.target.value.toLowerCase().replace(/[^a-z0-9-_]/g, ''))}
                        />
                    </div>

                    <div>
                        <div style={{ fontSize: 13, marginBottom: 6, fontWeight: 500 }}>
                            编排内容 <span style={{ color: 'var(--danger)' }}>*</span>
                        </div>
                        <CodeEditor
                            value={yamlContent}
                            onChange={setYamlContent}
                            lang="yaml"
                            height="400px"
                            bordered
                            placeholder="在此输入或编辑 docker-compose.yml 内容..."
                        />
                    </div>

                    <div
                        style={{
                            display: 'flex',
                            gap: 20,
                            padding: '10px 14px',
                            background: 'var(--bg-2)',
                            borderRadius: 6,
                            border: '1px solid var(--border)',
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <AntSwitch checked={forcePull} onChange={setForcePull} size="small" />
                            <span style={{ fontSize: 12 }}>强制拉取最新镜像 (Force Pull)</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <AntSwitch checked={recreate} onChange={setRecreate} size="small" />
                            <span style={{ fontSize: 12 }}>强制全量重建容器 (Force Recreate)</span>
                        </div>
                    </div>
                </AntSpace>
            </AntDrawer>

            {/* 单个服务容器实时日志抽屉 */}
            <AntDrawer
                title={
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span>容器日志: {containerLogDrawer.containerName}</span>
                        <AntSpace size={8}>
                            <AntSelect
                                size="small"
                                value={containerLogTail}
                                onChange={(val) => {
                                    setContainerLogTail(val)
                                    fetchContainerLogs(containerLogDrawer.containerId, val, containerLogTimestamps)
                                }}
                                options={[
                                    { value: 100, label: '最新 100 行' },
                                    { value: 200, label: '最新 200 行' },
                                    { value: 500, label: '最新 500 行' },
                                    { value: 1000, label: '最新 1000 行' },
                                ]}
                                style={{ width: 120 }}
                            />
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                                <span>时间戳</span>
                                <AntSwitch
                                    size="small"
                                    checked={containerLogTimestamps}
                                    onChange={(checked) => {
                                        setContainerLogTimestamps(checked)
                                        fetchContainerLogs(containerLogDrawer.containerId, containerLogTail, checked)
                                    }}
                                />
                            </div>
                            <AntButton
                                size="small"
                                icon={<RefreshCw size={12} className={containerLogLoading ? 'animate-spin' : ''} />}
                                onClick={() =>
                                    fetchContainerLogs(
                                        containerLogDrawer.containerId,
                                        containerLogTail,
                                        containerLogTimestamps
                                    )
                                }
                            >
                                刷新
                            </AntButton>
                            <AntButton
                                size="small"
                                icon={<Copy size={12} />}
                                onClick={() => {
                                    navigator.clipboard.writeText(containerLogContent)
                                    message.success('日志已复制')
                                }}
                            >
                                复制
                            </AntButton>
                        </AntSpace>
                    </div>
                }
                open={containerLogDrawer.open}
                onClose={() =>
                    setContainerLogDrawer({
                        open: false,
                        containerId: '',
                        containerName: '',
                    })
                }
                size={720}
            >
                <pre className={s.logTerminal}>{containerLogContent}</pre>
            </AntDrawer>

            {/* 统一容器交互式终端 */}
            <ContainerTerminalModal
                open={!!execTarget}
                onClose={() => setExecTarget(null)}
                target={execTarget}
            />
        </div>
    )
}
