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
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
    Download,
    Upload,
    Play,
    Trash2,
    Code,
    RefreshCw,
    Search,
    Copy,
    Layers,
    CheckCircle,
    HardDriveDownload,
} from 'lucide-react'
import { API } from '@/api'
import type { DockerImageInfo } from '@/types'
import s from './DockerClient.module.less'

interface Props {
    serverId: string
    onRunImage?: (imageName: string) => void
}

export default function ImagesTab({ serverId, onRunImage }: Props) {
    const [images, setImages] = useState<DockerImageInfo[]>([])
    const [loading, setLoading] = useState(false)
    const [searchKw, setSearchKw] = useState('')
    const [page, setPage] = useState(1)
    const [pageSize, setPageSize] = useState(10)

    // 导出镜像状态
    const [savingId, setSavingId] = useState<string | null>(null)
    // 导入镜像状态
    const [importing, setImporting] = useState(false)

    // 拉取镜像模态框
    const [pullModal, setPullModal] = useState(false)
    const [pullImageName, setPullImageName] = useState('')
    const [pulling, setPulling] = useState(false)
    const [pullLogs, setPullLogs] = useState('')

    // Inspect 模态框
    const [inspectModal, setInspectModal] = useState<{ open: boolean; title: string; json: string }>({
        open: false,
        title: '',
        json: '',
    })

    const fetchImages = async () => {
        setLoading(true)
        try {
            const list = await API.dockerListImages(serverId)
            setImages(list)
        } catch (err: any) {
            message.error(`获取镜像列表失败: ${err.message || String(err)}`)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchImages()
    }, [serverId])

    const handlePull = async () => {
        if (!pullImageName.trim()) {
            message.warning('请输入要拉取的镜像名称')
            return
        }
        setPulling(true)
        setPullLogs(`正在连接仓库拉取 ${pullImageName.trim()} ...\n`)
        try {
            const logs = await API.dockerPullImage(serverId, pullImageName.trim())
            setPullLogs(logs || '镜像拉取完成！\n')
            fetchImages()
        } catch (err: any) {
            setPullLogs((prev) => prev + `\n拉取失败: ${err.message || String(err)}`)
            message.error(`拉取镜像失败: ${err.message || String(err)}`)
        } finally {
            setPulling(false)
        }
    }

    const handleSaveImage = async (img: DockerImageInfo) => {
        const fullImage = (img.repository && img.tag && img.tag !== '<none>')
            ? `${img.repository}:${img.tag}`
            : (img.repository && img.repository !== '<none>')
                ? img.repository
                : img.id
        const repoClean = (img.repository || 'image').replace(/[\/\\:]/g, '_')
        const tagClean = (img.tag || 'latest').replace(/[\/\\:]/g, '_')
        const defaultName = `${repoClean}_${tagClean}.tar`

        setSavingId(img.id)
        const hide = message.loading(`正在准备导出镜像 ${fullImage} ...`, 0)
        try {
            const savePath = await API.dockerSaveImage(serverId, fullImage, defaultName)
            hide()
            if (savePath) {
            }
        } catch (err: any) {
            hide()
            message.error(`导出镜像失败: ${err.message || String(err)}`)
        } finally {
            setSavingId(null)
        }
    }

    const handleLoadImage = async () => {
        setImporting(true)
        const hide = message.loading('正在导入镜像文件 (.tar) ...', 0)
        try {
            const result = await API.dockerLoadImage(serverId)
            hide()
            if (result) {
                fetchImages()
            }
        } catch (err: any) {
            hide()
            message.error(`导入镜像失败: ${err.message || String(err)}`)
        } finally {
            setImporting(false)
        }
    }

    const handleDelete = async (imageId: string, force: boolean) => {
        try {
            await API.dockerRemoveImage(serverId, imageId, force)
            fetchImages()
        } catch (err: any) {
            message.error(`删除镜像失败: ${err.message || String(err)}`)
        }
    }

    const openInspect = async (img: DockerImageInfo) => {
        try {
            const json = await API.dockerInspectImage(serverId, img.id)
            setInspectModal({
                open: true,
                title: `镜像详情 (Inspect): ${img.repository}:${img.tag}`,
                json,
            })
        } catch (err: any) {
            message.error(`获取详情失败: ${err.message || String(err)}`)
        }
    }

    const formatDate = (timestamp: number) => {
        if (!timestamp) return '-'
        return new Date(timestamp * 1000).toLocaleString()
    }

    const filtered = images.filter((img) => {
        if (searchKw.trim()) {
            const kw = searchKw.toLowerCase()
            const matchRepo = img.repository.toLowerCase().includes(kw)
            const matchTag = img.tag.toLowerCase().includes(kw)
            const matchId = img.shortId.toLowerCase().includes(kw)
            if (!matchRepo && !matchTag && !matchId) return false
        }
        return true
    })

    const columns: ColumnsType<DockerImageInfo> = [
        {
            title: '仓库名称 / 镜像 (Repository)',
            dataIndex: 'repository',
            render: (repo: string, record) => (
                <div>
                    <div style={{ fontWeight: 600, color: 'var(--text)' }}>{repo}</div>
                    <div className={s.monoText} style={{ color: 'var(--text-dim)', fontSize: 11 }}>
                        ID: {record.shortId}
                    </div>
                </div>
            ),
        },
        {
            title: '标签 (Tag)',
            dataIndex: 'tag',
            width: 140,
            render: (tag: string) => (
                <Tag color={tag === 'latest' ? 'blue' : 'default'} className={s.monoText}>
                    {tag}
                </Tag>
            ),
        },
        {
            title: '大小 (Size)',
            dataIndex: 'sizeStr',
            width: 120,
            render: (sizeStr: string) => <span className={s.monoText}>{sizeStr}</span>,
        },
        {
            title: '创建时间',
            dataIndex: 'created',
            width: 180,
            render: (created: number) => (
                <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{formatDate(created)}</span>
            ),
        },
        {
            title: '关联容器',
            dataIndex: 'containers',
            width: 100,
            render: (cnt: number) => (
                <Tag color={cnt > 0 ? 'processing' : 'default'}>{cnt > 0 ? `${cnt} 个运行` : '未使用'}</Tag>
            ),
        },
        {
            title: '快捷操作',
            key: 'actions',
            width: 210,
            fixed: 'right',
            render: (_, record) => {
                const fullImage = record.tag ? `${record.repository}:${record.tag}` : record.repository
                const isSaving = savingId === record.id
                return (
                    <Space size={4}>
                        {onRunImage && (
                            <Tooltip title="基于此镜像运行容器">
                                <Button
                                    size="small"
                                    type="text"
                                    style={{ color: 'var(--ok)' }}
                                    icon={<Play size={13} />}
                                    onClick={() => onRunImage(fullImage)}
                                />
                            </Tooltip>
                        )}

                        <Tooltip title="导出/下载镜像为本地文件 (.tar)">
                            <Button
                                size="small"
                                type="text"
                                loading={isSaving}
                                icon={<HardDriveDownload size={13} />}
                                onClick={() => handleSaveImage(record)}
                            />
                        </Tooltip>

                        <Tooltip title="查看 Inspect JSON">
                            <Button
                                size="small"
                                type="text"
                                icon={<Code size={13} />}
                                onClick={() => openInspect(record)}
                            />
                        </Tooltip>

                        <Popconfirm
                            title="确定要删除此镜像吗？"
                            description="若镜像被容器使用，删除可能失败，可选择强制删除"
                            onConfirm={() => handleDelete(record.id, false)}
                            okText="删除"
                            cancelText="取消"
                            okButtonProps={{ danger: true }}
                        >
                            <Tooltip title="删除镜像">
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
                    <Input
                        placeholder="搜索镜像名称 / 标签 / ID..."
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
                        icon={<Upload size={14} />}
                        size="small"
                        loading={importing}
                        onClick={handleLoadImage}
                    >
                        导入镜像
                    </Button>
                    <Button
                        type="primary"
                        icon={<Download size={14} />}
                        size="small"
                        onClick={() => {
                            setPullLogs('')
                            setPullModal(true)
                        }}
                    >
                        拉取镜像
                    </Button>
                    <Button
                        icon={<RefreshCw size={13} className={loading ? 'animate-spin' : ''} />}
                        size="small"
                        onClick={fetchImages}
                    >
                        刷新
                    </Button>
                </div>
            </div>

            {/* 镜像表格 */}
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

            {/* 拉取镜像模态框 */}
            <AntdModal
                title="在线拉取 Docker 镜像"
                open={pullModal}
                onCancel={() => !pulling && setPullModal(false)}
                footer={[
                    <Button key="close" onClick={() => setPullModal(false)} disabled={pulling}>
                        关闭
                    </Button>,
                    <Button key="pull" type="primary" loading={pulling} onClick={handlePull}>
                        开始拉取
                    </Button>,
                ]}
                width={620}
                centered
            >
                <div style={{ padding: '8px 0' }}>
                    <div style={{ fontSize: 13, marginBottom: 6, fontWeight: 500 }}>
                        镜像完整名称 (包含 Tag，如未填默认为 :latest)
                    </div>
                    <Space.Compact style={{ width: '100%', marginBottom: 12 }}>
                        <Input
                            placeholder="如: nginx:alpine / redis:7 / ghcr.io/owner/repo:tag"
                            value={pullImageName}
                            onChange={(e) => setPullImageName(e.target.value)}
                            onPressEnter={handlePull}
                        />
                        <Button type="primary" loading={pulling} onClick={handlePull}>
                            拉取
                        </Button>
                    </Space.Compact>

                    <div style={{ marginBottom: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>常用推荐:</span>
                        <Tag style={{ cursor: 'pointer' }} onClick={() => setPullImageName('nginx:alpine')}>nginx:alpine</Tag>
                        <Tag style={{ cursor: 'pointer' }} onClick={() => setPullImageName('redis:alpine')}>redis:alpine</Tag>
                        <Tag style={{ cursor: 'pointer' }} onClick={() => setPullImageName('postgres:16-alpine')}>postgres:16-alpine</Tag>
                        <Tag style={{ cursor: 'pointer' }} onClick={() => setPullImageName('node:20-alpine')}>node:20-alpine</Tag>
                        <Tag style={{ cursor: 'pointer' }} onClick={() => setPullImageName('alpine:latest')}>alpine:latest</Tag>
                    </div>

                    {pullLogs && (
                        <div>
                            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 4 }}>拉取进度日志:</div>
                            <pre className={s.logTerminal} style={{ height: 240 }}>{pullLogs}</pre>
                        </div>
                    )}
                </div>
            </AntdModal>

            {/* Inspect 模态框 */}
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
        </div>
    )
}
