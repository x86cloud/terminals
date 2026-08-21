import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Segmented, Input, Button, Table, Badge, Tag, Modal, Space, Alert, Tooltip } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { Box, Layers, Search, Download, RotateCw, Power, Play, FileText, Trash2 } from 'lucide-react'
import { ConfirmModal, ConfirmState } from '@/components/Modal'
import { API } from '@/api'
import { SSHDockerContainer, SSHDockerImage } from '@/types'
import { errorMessage } from '@/utils'
import d from '@/pages/ssh/docker/DockerPanel.module.less'

interface Props {
    sessionId: string
    active: boolean
    onNotify?: (message: string, kind?: 'info' | 'error') => void
}

type SubTab = 'containers' | 'images'

export default function DockerPanel({ sessionId, active, onNotify }: Props) {
    const [subTab, setSubTab] = useState<SubTab>('containers')
    const [containers, setContainers] = useState<SSHDockerContainer[]>([])
    const [images, setImages] = useState<SSHDockerImage[]>([])
    const [busy, setBusy] = useState(false)
    const [loaded, setLoaded] = useState(false)
    const [error, setError] = useState('')
    const [keyword, setKeyword] = useState('')
    const [lastUpdate, setLastUpdate] = useState<string>('')
    const [page, setPage] = useState(1)
    const [pageSize, setPageSize] = useState(20)

    useEffect(() => {
        setPage(1)
    }, [keyword, subTab])

    // 日志 Modal
    const [logOpen, setLogOpen] = useState(false)
    const [logTitle, setLogTitle] = useState('')
    const [logContent, setLogContent] = useState('')
    const [logBusy, setLogBusy] = useState(false)

    // 拉取镜像 Modal
    const [pullOpen, setPullOpen] = useState(false)
    const [pullInput, setPullInput] = useState('')
    const [pullBusy, setPullBusy] = useState(false)

    // 二次确认 Modal
    const [confirm, setConfirm] = useState<ConfirmState>({
        open: false,
        title: '',
        message: '',
        danger: true,
        onConfirm: () => { },
    })

    const fetchDockerData = useCallback(async () => {
        setBusy(true)
        setError('')
        try {
            const [cList, iList] = await Promise.all([
                API.sshDockerContainerList(sessionId),
                API.sshDockerImageList(sessionId),
            ])
            setContainers(cList || [])
            setImages(iList || [])
            setLastUpdate(new Date().toLocaleTimeString())
            setLoaded(true)
        } catch (e) {
            const msg = errorMessage(e)
            setError(msg)
            if (onNotify) onNotify(`读取 Docker 数据失败: ${msg}`, 'error')
        } finally {
            setBusy(false)
        }
    }, [sessionId, onNotify])

    useEffect(() => {
        if (active && !loaded) {
            void fetchDockerData()
        }
    }, [active, loaded, fetchDockerData])

    // 筛选容器
    const filteredContainers = useMemo(() => {
        if (!keyword.trim()) return containers
        const kw = keyword.toLowerCase()
        return containers.filter(
            (c) =>
                c.name.toLowerCase().includes(kw) ||
                c.image.toLowerCase().includes(kw) ||
                c.id.toLowerCase().includes(kw)
        )
    }, [containers, keyword])

    // 筛选镜像
    const filteredImages = useMemo(() => {
        if (!keyword.trim()) return images
        const kw = keyword.toLowerCase()
        return images.filter(
            (img) =>
                img.repo.toLowerCase().includes(kw) ||
                img.tag.toLowerCase().includes(kw) ||
                img.id.toLowerCase().includes(kw)
        )
    }, [images, keyword])

    // 统计数据
    const runningCount = useMemo(() => containers.filter((c) => c.running).length, [containers])
    const stoppedCount = useMemo(() => containers.length - runningCount, [containers, runningCount])

    const handleContainerAction = async (c: SSHDockerContainer, action: 'start' | 'stop' | 'restart' | 'rm') => {
        const actionMap: Record<string, string> = {
            start: '启动',
            stop: '停止',
            restart: '重启',
            rm: '删除',
        }
        const actionText = actionMap[action] || action

        if (action === 'rm') {
            setConfirm({
                open: true,
                title: '删除容器确认',
                message: `确定要删除容器「${c.name}」(${c.id.slice(0, 12)}) 吗？此操作不可逆。`,
                danger: true,
                onConfirm: async () => {
                    setConfirm((p) => ({ ...p, open: false }))
                    setBusy(true)
                    try {
                        await API.sshDockerControlContainer(sessionId, c.id, 'rm')
                        if (onNotify) onNotify(`已成功删除容器 ${c.name}`)
                        await fetchDockerData()
                    } catch (e) {
                        const msg = errorMessage(e)
                        if (onNotify) onNotify(`删除容器失败: ${msg}`, 'error')
                    } finally {
                        setBusy(false)
                    }
                },
            })
            return
        }

        setBusy(true)
        try {
            await API.sshDockerControlContainer(sessionId, c.id, action)
            if (onNotify) onNotify(`已成功${actionText}容器 ${c.name}`)
            await fetchDockerData()
        } catch (e) {
            const msg = errorMessage(e)
            if (onNotify) onNotify(`${actionText}容器失败: ${msg}`, 'error')
        } finally {
            setBusy(false)
        }
    }

    const handleViewLogs = async (c: SSHDockerContainer) => {
        setLogTitle(`容器日志: ${c.name} (${c.id.slice(0, 12)})`)
        setLogOpen(true)
        setLogBusy(true)
        setLogContent('')
        try {
            const logs = await API.sshDockerContainerLogs(sessionId, c.id, 100)
            setLogContent(logs || '（暂无日志输出）')
        } catch (e) {
            setLogContent(`获取日志失败: ${errorMessage(e)}`)
        } finally {
            setLogBusy(false)
        }
    }

    const handleRemoveImage = (img: SSHDockerImage) => {
        setConfirm({
            open: true,
            title: '删除镜像确认',
            message: `确定要删除镜像「${img.repo}:${img.tag}」(${img.id.slice(0, 12)}) 吗？`,
            danger: true,
            onConfirm: async () => {
                setConfirm((p) => ({ ...p, open: false }))
                setBusy(true)
                try {
                    await API.sshDockerRemoveImage(sessionId, img.id)
                    if (onNotify) onNotify(`已成功删除镜像 ${img.repo}:${img.tag}`)
                    await fetchDockerData()
                } catch (e) {
                    const msg = errorMessage(e)
                    if (onNotify) onNotify(`删除镜像失败: ${msg}`, 'error')
                } finally {
                    setBusy(false)
                }
            },
        })
    }

    const handlePullImage = async () => {
        if (!pullInput.trim()) return
        setPullBusy(true)
        try {
            await API.sshDockerPullImage(sessionId, pullInput.trim())
            if (onNotify) onNotify(`镜像 ${pullInput} 开始拉取或拉取完成`)
            setPullOpen(false)
            setPullInput('')
            await fetchDockerData()
        } catch (e) {
            const msg = errorMessage(e)
            if (onNotify) onNotify(`拉取镜像失败: ${msg}`, 'error')
        } finally {
            setPullBusy(false)
        }
    }

    const formatDockerDate = (dStr: string) => {
        if (!dStr) return '-'
        const match = dStr.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})/)
        if (match) {
            return `${match[1]} ${match[2]}`
        }
        return dStr
    }

    const containerColumns: ColumnsType<SSHDockerContainer> = [
        {
            title: '容器 ID',
            dataIndex: 'id',
            key: 'id',
            width: 105,
            render: (id) => (
                <Tag color="blue" style={{ margin: 0, fontFamily: 'monospace', fontSize: 11 }}>
                    {id.slice(0, 12)}
                </Tag>
            ),
        },
        {
            title: '容器 / 镜像',
            dataIndex: 'name',
            key: 'name',
            ellipsis: true,
            sorter: (a, b) => a.name.localeCompare(b.name),
            render: (name, record) => (
                <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontFamily: 'monospace', color: 'var(--text)' }} title={name}>
                        {name}
                    </div>
                    <div
                        style={{ fontSize: 11, color: 'var(--text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 1 }}
                        title={record.image}
                    >
                        {record.image}
                    </div>
                </div>
            ),
        },
        {
            title: '状态 / 端口',
            dataIndex: 'status',
            key: 'status',
            width: 170,
            render: (status, record) => (
                <div>
                    <div>
                        <Badge status={record.running ? 'success' : 'default'} text={<span style={{ fontSize: 12 }}>{status}</span>} />
                    </div>
                    {record.ports && (
                        <div
                            style={{ fontSize: 11, color: 'var(--text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}
                            title={record.ports}
                        >
                            {record.ports}
                        </div>
                    )}
                </div>
            ),
        },
        {
            title: '操作',
            key: 'actions',
            width: 110,
            render: (_, c) => (
                <Space size={2}>
                    {c.running ? (
                        <>
                            <Tooltip title="停止容器">
                                <Button
                                    size="small"
                                    type="text"
                                    danger
                                    icon={<Power size={13} />}
                                    disabled={busy}
                                    onClick={() => void handleContainerAction(c, 'stop')}
                                />
                            </Tooltip>
                            <Tooltip title="重启容器">
                                <Button
                                    size="small"
                                    type="text"
                                    icon={<RotateCw size={13} />}
                                    disabled={busy}
                                    onClick={() => void handleContainerAction(c, 'restart')}
                                />
                            </Tooltip>
                        </>
                    ) : (
                        <Tooltip title="启动容器">
                            <Button
                                size="small"
                                type="text"
                                icon={<Play size={13} />}
                                disabled={busy}
                                onClick={() => void handleContainerAction(c, 'start')}
                            />
                        </Tooltip>
                    )}
                    <Tooltip title="查看日志">
                        <Button
                            size="small"
                            type="text"
                            icon={<FileText size={13} />}
                            onClick={() => void handleViewLogs(c)}
                        />
                    </Tooltip>
                    <Tooltip title="删除容器">
                        <Button
                            size="small"
                            type="text"
                            danger
                            icon={<Trash2 size={13} />}
                            disabled={busy}
                            onClick={() => void handleContainerAction(c, 'rm')}
                        />
                    </Tooltip>
                </Space>
            ),
        },
    ]

    const imageColumns: ColumnsType<SSHDockerImage> = [
        {
            title: '镜像 ID',
            dataIndex: 'id',
            key: 'id',
            width: 105,
            render: (id) => (
                <Tag color="blue" style={{ margin: 0, fontFamily: 'monospace', fontSize: 11 }}>
                    {id.slice(0, 12)}
                </Tag>
            ),
        },
        {
            title: 'REPOSITORY / TAG',
            dataIndex: 'repo',
            key: 'repo',
            ellipsis: true,
            sorter: (a, b) => a.repo.localeCompare(b.repo),
            render: (repo, record) => (
                <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontFamily: 'monospace' }} title={repo}>
                        {repo}
                    </div>
                    <div style={{ marginTop: 2 }}>
                        <Tag style={{ fontSize: 10, lineHeight: '14px', padding: '0 4px', margin: 0 }}>
                            {record.tag}
                        </Tag>
                    </div>
                </div>
            ),
        },
        {
            title: '大小 / 创建时间',
            dataIndex: 'size',
            key: 'size',
            width: 160,
            render: (size, record) => (
                <div>
                    <div style={{ fontWeight: 500, fontSize: 12 }}>{size}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-dim)', whiteSpace: 'nowrap', marginTop: 1 }} title={record.createdAt}>
                        {formatDockerDate(record.createdAt)}
                    </div>
                </div>
            ),
        },
        {
            title: '操作',
            key: 'actions',
            width: 60,
            render: (_, img) => (
                <Tooltip title="删除镜像">
                    <Button
                        size="small"
                        type="text"
                        danger
                        icon={<Trash2 size={13} />}
                        disabled={busy}
                        onClick={() => handleRemoveImage(img)}
                    />
                </Tooltip>
            ),
        },
    ]

    if (!active) return null

    return (
        <div className={d.dockerPanel}>
            <div className={d.toolbar}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <Segmented
                        size="small"
                        value={subTab}
                        onChange={(v) => setSubTab(v as SubTab)}
                        options={[
                            { label: `容器 (${containers.length})`, value: 'containers', icon: <Box size={13} style={{ verticalAlign: -2 }} /> },
                            { label: `镜像 (${images.length})`, value: 'images', icon: <Layers size={13} style={{ verticalAlign: -2 }} /> },
                        ]}
                    />

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {subTab === 'containers' ? (
                            <div style={{ fontSize: 11.5, color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>
                                <span style={{ color: '#22c55e', fontWeight: 600 }}>● {runningCount}</span> 运行
                                <span style={{ margin: '0 4px', opacity: 0.3 }}>|</span>
                                <span style={{ color: '#ef4444', fontWeight: 600 }}>● {stoppedCount}</span> 停止
                            </div>
                        ) : (
                            <Button
                                size="small"
                                type="primary"
                                icon={<Download size={12} />}
                                disabled={busy}
                                onClick={() => setPullOpen(true)}
                            >
                                拉取镜像
                            </Button>
                        )}
                        <Tooltip title={lastUpdate ? `更新于 ${lastUpdate}` : '刷新 Docker 数据'}>
                            <Button
                                size="small"
                                icon={<RotateCw size={12} />}
                                loading={busy}
                                onClick={() => void fetchDockerData()}
                            />
                        </Tooltip>
                    </div>
                </div>

                <div style={{ marginTop: 8 }}>
                    <Input
                        size="small"
                        value={keyword}
                        placeholder={subTab === 'containers' ? '搜索容器名称、ID、镜像...' : '搜索镜像仓库、TAG、ID...'}
                        prefix={<Search size={12} color="var(--text-dim)" />}
                        allowClear
                        onChange={(e) => setKeyword(e.target.value)}
                    />
                </div>
            </div>

            {error && (
                <Alert
                    type="error"
                    showIcon
                    message="Docker 环境异常或未安装"
                    className={d.alertBox}
                    description={
                        <div>
                            {error}
                            <div style={{ marginTop: 4 }}>
                                请确保目标 Linux 服务器已安装 Docker 并运行守护进程，或者当前 SSH 用户具备 <code>docker</code> 权限组访问控制。
                            </div>
                        </div>
                    }
                    action={
                        <Button size="small" type="primary" danger onClick={() => void fetchDockerData()}>
                            重试
                        </Button>
                    }
                />
            )}

            {!error && (
                <div className={d.tableWrap}>
                    {subTab === 'containers' ? (
                        <Table<SSHDockerContainer>
                            rowKey="id"
                            size="small"
                            columns={containerColumns}
                            dataSource={filteredContainers}
                            loading={busy}
                            pagination={{
                                current: page,
                                pageSize: pageSize,
                                total: filteredContainers.length,
                                showSizeChanger: true,
                                pageSizeOptions: ['10', '20', '50', '100'],
                                showTotal: (t) => `共 ${t} 个容器`,
                                size: 'small',
                                onChange: (p, ps) => {
                                    setPage(p)
                                    setPageSize(ps)
                                },
                            }}
                            scroll={{ x: 'max-content', y: 'calc(100vh - 270px)' }}
                        />
                    ) : (
                        <Table<SSHDockerImage>
                            rowKey="id"
                            size="small"
                            columns={imageColumns}
                            dataSource={filteredImages}
                            loading={busy}
                            pagination={{
                                current: page,
                                pageSize: pageSize,
                                total: filteredImages.length,
                                showSizeChanger: true,
                                pageSizeOptions: ['10', '20', '50', '100'],
                                showTotal: (t) => `共 ${t} 个镜像`,
                                size: 'small',
                                onChange: (p, ps) => {
                                    setPage(p)
                                    setPageSize(ps)
                                },
                            }}
                            scroll={{ x: 'max-content', y: 'calc(100vh - 270px)' }}
                        />
                    )}
                </div>
            )}

            {/* 查看日志 Modal */}
            <Modal
                open={logOpen}
                title={logTitle}
                onCancel={() => setLogOpen(false)}
                width={800}
                footer={<Button onClick={() => setLogOpen(false)}>关闭</Button>}
            >
                <div className={d.logContainer}>
                    <pre style={{ margin: 0, fontFamily: 'Consolas, monospace', fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                        {logBusy ? '正在拉取日志...' : logContent}
                    </pre>
                </div>
            </Modal>

            {/* 拉取镜像 Modal */}
            <Modal
                open={pullOpen}
                title="拉取 Docker 镜像"
                onCancel={() => !pullBusy && setPullOpen(false)}
                onOk={handlePullImage}
                confirmLoading={pullBusy}
                okText="开始拉取"
                cancelText="取消"
            >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '8px 0' }}>
                    <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                        镜像名称 (如 nginx:latest / redis:alpine):
                    </span>
                    <Input
                        placeholder="输入完整的镜像名称和 Tag"
                        value={pullInput}
                        onChange={(e) => setPullInput(e.target.value)}
                        onPressEnter={() => void handlePullImage()}
                    />
                </div>
            </Modal>

            {/* 确认 Modal */}
            <ConfirmModal state={confirm} onCancel={() => setConfirm((p) => ({ ...p, open: false }))} />
        </div>
    )
}
