import React, {useCallback, useEffect, useMemo, useState} from 'react'
import Icon from '../../../components/Icon'
import {ConfirmModal, ConfirmState} from '../../../components/Modal'
import {API} from '../../../api'
import {SSHDockerContainer, SSHDockerImage} from '../../../types'
import {errorMessage} from '../../../utils'
import g from '../../../styles/global.module.less'
import d from './DockerPanel.module.less'

interface Props {
    sessionId: string
    active: boolean
    onNotify?: (message: string, kind?: 'info' | 'error') => void
}

type SubTab = 'containers' | 'images'

export default function DockerPanel({sessionId, active, onNotify}: Props) {
    const [subTab, setSubTab] = useState<SubTab>('containers')
    const [containers, setContainers] = useState<SSHDockerContainer[]>([])
    const [images, setImages] = useState<SSHDockerImage[]>([])
    const [busy, setBusy] = useState(false)
    const [loaded, setLoaded] = useState(false)
    const [error, setError] = useState('')
    const [keyword, setKeyword] = useState('')
    const [lastUpdate, setLastUpdate] = useState<string>('')

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
        onConfirm: () => {},
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

    // 容器操作
    const handleContainerAction = async (c: SSHDockerContainer, action: 'start' | 'stop' | 'restart' | 'rm') => {
        const actionNames: Record<string, string> = {
            start: '启动',
            stop: '停止',
            restart: '重启',
            rm: '删除',
        }
        if (action === 'rm') {
            setConfirm({
                open: true,
                title: '删除容器',
                message: `确定要强制删除容器 「${c.name} (${c.id})」 吗？`,
                danger: true,
                onConfirm: async () => {
                    setConfirm((prev) => ({ ...prev, open: false }))
                    setBusy(true)
                    try {
                        await API.sshDockerControlContainer(sessionId, c.id, 'rm')
                        if (onNotify) onNotify(`已删除容器 ${c.name}`, 'info')
                        await fetchDockerData()
                    } catch (e) {
                        if (onNotify) onNotify(`删除容器失败: ${errorMessage(e)}`, 'error')
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
            if (onNotify) onNotify(`已${actionNames[action]}容器 ${c.name}`, 'info')
            await fetchDockerData()
        } catch (e) {
            if (onNotify) onNotify(`${actionNames[action]}容器失败: ${errorMessage(e)}`, 'error')
        } finally {
            setBusy(false)
        }
    }

    // 查看容器日志
    const handleViewLogs = async (c: SSHDockerContainer) => {
        setLogTitle(`容器日志 - ${c.name} (${c.id})`)
        setLogOpen(true)
        setLogBusy(true)
        setLogContent('')
        try {
            const logs = await API.sshDockerContainerLogs(sessionId, c.id, 200)
            setLogContent(logs || '（暂无日志输出）')
        } catch (e) {
            setLogContent(`获取日志失败: ${errorMessage(e)}`)
        } finally {
            setLogBusy(false)
        }
    }

    // 删除镜像
    const handleRemoveImage = (img: SSHDockerImage) => {
        const titleName = img.repo !== '<none>' ? `${img.repo}:${img.tag}` : img.id
        setConfirm({
            open: true,
            title: '删除镜像',
            message: `确定要删除 Docker 镜像 「${titleName}」 吗？`,
            danger: true,
            onConfirm: async () => {
                setConfirm((prev) => ({ ...prev, open: false }))
                setBusy(true)
                try {
                    await API.sshDockerRemoveImage(sessionId, img.id)
                    if (onNotify) onNotify(`已删除镜像 ${titleName}`, 'info')
                    await fetchDockerData()
                } catch (e) {
                    if (onNotify) onNotify(`删除镜像失败: ${errorMessage(e)}`, 'error')
                } finally {
                    setBusy(false)
                }
            },
        })
    }

    // 拉取镜像
    const handlePullImage = async () => {
        if (!pullInput.trim()) return
        setPullBusy(true)
        try {
            const out = await API.sshDockerPullImage(sessionId, pullInput.trim())
            if (onNotify) onNotify(`已拉取镜像 ${pullInput.trim()}`, 'info')
            setPullOpen(false)
            setPullInput('')
            setLogTitle(`拉取镜像输出 - ${pullInput.trim()}`)
            setLogContent(out)
            setLogOpen(true)
            await fetchDockerData()
        } catch (e) {
            if (onNotify) onNotify(`拉取镜像失败: ${errorMessage(e)}`, 'error')
        } finally {
            setPullBusy(false)
        }
    }

    return (
        <div className={d.dockerPanel} style={{ display: active ? 'flex' : 'none' }}>
            {/* 子选项卡 */}
            <div className={d.subTabsHeader}>
                <button
                    className={`${d.subTab}${subTab === 'containers' ? ' ' + d.active : ''}`}
                    onClick={() => setSubTab('containers')}
                >
                    <Icon name="box" size={13} />
                    容器列表
                    <span className={`${d.badge} ${d.running}`}>{containers.length}</span>
                </button>

                <button
                    className={`${d.subTab}${subTab === 'images' ? ' ' + d.active : ''}`}
                    onClick={() => setSubTab('images')}
                >
                    <Icon name="layers" size={13} />
                    镜像列表
                    <span className={d.badge}>{images.length}</span>
                </button>
            </div>

            {/* 工具栏 */}
            <div className={d.toolbar}>
                <div className={d.leftActions}>
                    <div className={d.searchWrap}>
                        <Icon name="search" size={12} />
                        <input
                            type="text"
                            placeholder={subTab === 'containers' ? '搜索容器名/镜像/ID...' : '搜索镜像/标签/ID...'}
                            value={keyword}
                            onChange={(e) => setKeyword(e.target.value)}
                        />
                    </div>
                    {subTab === 'containers' ? (
                        <div className={d.statusSummary}>
                            <span>运行中: <strong style={{ color: '#22c55e' }}>{runningCount}</strong></span>
                            <span>已停止: <strong style={{ color: '#ef4444' }}>{stoppedCount}</strong></span>
                        </div>
                    ) : (
                        <button
                            className={`${g.btn} ${g.sm} ${g.primary}`}
                            disabled={busy}
                            onClick={() => setPullOpen(true)}
                        >
                            <Icon name="download" size={12} /> 拉取镜像
                        </button>
                    )}
                </div>

                <div className={d.toolbarActions}>
                    {lastUpdate && <span className={d.lastUpdate}>更新于 {lastUpdate}</span>}
                    <button
                        className={g.iconBtn}
                        title="刷新"
                        disabled={busy}
                        onClick={() => void fetchDockerData()}
                    >
                        <Icon name="refresh" size={13} />
                    </button>
                </div>
            </div>

            {/* 错误诊断 */}
            {error && (
                <div className={d.errorBox}>
                    <div className={d.errorTitle}>
                        <Icon name="close" size={14} /> Docker 环境异常或未安装
                    </div>
                    <div className={d.errorDesc}>
                        {error}
                        <br />
                        请确保目标 Linux 服务器已安装 Docker 并运行守护进程，或者当前 SSH 用户具备 `docker` 权限组访问控制。
                    </div>
                </div>
            )}

            {/* 内容区 */}
            {!error && (
                <div className={d.tableContent}>
                    {subTab === 'containers' ? (
                        <div className={d.tableCard}>
                            <div className={d.tableScroll}>
                                <table>
                                    <thead>
                                    <tr>
                                        <th>容器ID</th>
                                        <th>名称</th>
                                        <th>镜像</th>
                                        <th>状态</th>
                                        <th>端口映射</th>
                                        <th>操作</th>
                                    </tr>
                                    </thead>
                                    <tbody>
                                    {filteredContainers.map((c) => (
                                        <tr key={c.id}>
                                            <td><code>{c.id}</code></td>
                                            <td className={d.containerName}>{c.name}</td>
                                            <td>{c.image}</td>
                                            <td>
                                                    <span className={`${d.statusTag} ${c.running ? d.running : d.stopped}`}>
                                                        <span className={`${d.dot} ${c.running ? d.running : d.stopped}`} />
                                                        {c.status}
                                                    </span>
                                            </td>
                                            <td>{c.ports || '-'}</td>
                                            <td>
                                                <div className={d.actionsCell}>
                                                    {c.running ? (
                                                        <>
                                                            <button
                                                                className={`${g.iconBtn} ${g.danger}`}
                                                                title="停止容器"
                                                                disabled={busy}
                                                                onClick={() => void handleContainerAction(c, 'stop')}
                                                            >
                                                                <Icon name="power" size={13} />
                                                            </button>
                                                            <button
                                                                className={g.iconBtn}
                                                                title="重启容器"
                                                                disabled={busy}
                                                                onClick={() => void handleContainerAction(c, 'restart')}
                                                            >
                                                                <Icon name="refresh" size={13} />
                                                            </button>
                                                        </>
                                                    ) : (
                                                        <button
                                                            className={g.iconBtn}
                                                            title="启动容器"
                                                            disabled={busy}
                                                            onClick={() => void handleContainerAction(c, 'start')}
                                                        >
                                                            <Icon name="play" size={13} />
                                                        </button>
                                                    )}
                                                    <button
                                                        className={g.iconBtn}
                                                        title="查看日志"
                                                        onClick={() => void handleViewLogs(c)}
                                                    >
                                                        <Icon name="file" size={13} />
                                                    </button>
                                                    <button
                                                        className={`${g.iconBtn} ${g.danger}`}
                                                        title="删除容器"
                                                        disabled={busy}
                                                        onClick={() => void handleContainerAction(c, 'rm')}
                                                    >
                                                        <Icon name="trash" size={13} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                    {!filteredContainers.length && (
                                        <tr>
                                            <td colSpan={6}>
                                                <div className={d.emptyState}>
                                                    <Icon name="box" size={32} />
                                                    <span>{keyword ? '未找到匹配的容器' : '暂无容器'}</span>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    ) : (
                        <div className={d.tableCard}>
                            <div className={d.tableScroll}>
                                <table>
                                    <thead>
                                    <tr>
                                        <th>镜像ID</th>
                                        <th>REPOSITORY</th>
                                        <th>TAG</th>
                                        <th>大小</th>
                                        <th>创建时间</th>
                                        <th>操作</th>
                                    </tr>
                                    </thead>
                                    <tbody>
                                    {filteredImages.map((img) => (
                                        <tr key={img.id}>
                                            <td><code>{img.id}</code></td>
                                            <td className={d.containerName}>{img.repo}</td>
                                            <td>{img.tag}</td>
                                            <td>{img.size}</td>
                                            <td>{img.createdAt}</td>
                                            <td>
                                                <button
                                                    className={`${g.iconBtn} ${g.danger}`}
                                                    title="删除镜像"
                                                    disabled={busy}
                                                    onClick={() => handleRemoveImage(img)}
                                                >
                                                    <Icon name="trash" size={13} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                    {!filteredImages.length && (
                                        <tr>
                                            <td colSpan={6}>
                                                <div className={d.emptyState}>
                                                    <Icon name="layers" size={32} />
                                                    <span>{keyword ? '未找到匹配的镜像' : '暂无本地镜像'}</span>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* 查看日志 Modal */}
            {logOpen && (
                <div className={d.modalOverlay} onClick={() => setLogOpen(false)}>
                    <div className={d.logModal} onClick={(e) => e.stopPropagation()}>
                        <div className={d.modalHeader}>
                            <div className={d.modalTitle}>
                                <Icon name="file" size={15} />
                                <span>{logTitle}</span>
                            </div>
                            <button className={g.iconBtn} onClick={() => setLogOpen(false)} title="关闭">
                                <Icon name="close" size={14} />
                            </button>
                        </div>
                        <pre className={d.logBody}>
                            {logBusy ? '正在拉取日志...' : logContent}
                        </pre>
                        <div className={d.modalFooter}>
                            <button className={`${g.btn} ${g.sm}`} onClick={() => setLogOpen(false)}>
                                关闭
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* 拉取镜像 Modal */}
            {pullOpen && (
                <div className={d.modalOverlay} onClick={() => setPullOpen(false)}>
                    <div className={d.pullModal} onClick={(e) => e.stopPropagation()}>
                        <div className={d.modalHeader}>
                            <div className={d.modalTitle}>
                                <Icon name="download" size={15} />
                                <span>拉取 Docker 镜像</span>
                            </div>
                            <button className={g.iconBtn} onClick={() => setPullOpen(false)} title="关闭">
                                <Icon name="close" size={14} />
                            </button>
                        </div>
                        <div className={d.pullForm}>
                            <label>镜像名称 (如 nginx:latest / redis:alpine):</label>
                            <input
                                type="text"
                                placeholder="输入完整的镜像名称和 Tag"
                                value={pullInput}
                                onChange={(e) => setPullInput(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') void handlePullImage()
                                }}
                            />
                        </div>
                        <div className={d.modalFooter}>
                            <button className={`${g.btn} ${g.sm}`} onClick={() => setPullOpen(false)}>
                                取消
                            </button>
                            <button
                                className={`${g.btn} ${g.sm} ${g.primary}`}
                                disabled={pullBusy || !pullInput.trim()}
                                onClick={() => void handlePullImage()}
                            >
                                {pullBusy ? '拉取中...' : '开始拉取'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* 确认 Modal */}
            <ConfirmModal state={confirm} onCancel={() => setConfirm((p) => ({ ...p, open: false }))} />
        </div>
    )
}
