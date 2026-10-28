import { useState } from 'react'
import { Button, Modal as AntdModal, Checkbox, Space, Tag, App } from 'antd'
import {
    Box,
    Layers,
    HardDrive,
    Network,
    Server,
    Trash2,
    RefreshCw,
    CheckCircle,
} from 'lucide-react'
import { API } from '@/api'
import type { DockerOverview, DockerPruneReport } from '@/types'
import { useTranslation } from 'react-i18next'
import s from './DockerClient.module.less'

interface Props {
    serverId: string
    overview: DockerOverview | null
    loading: boolean
    onRefresh: () => void
}

export default function OverviewTab({ serverId, overview, loading, onRefresh }: Props) {
    const { t } = useTranslation(['docker', 'common'])
    const { message } = App.useApp()
    const [pruneModal, setPruneModal] = useState(false)
    const [pruneContainers, setPruneContainers] = useState(true)
    const [pruneImages, setPruneImages] = useState(true)
    const [pruneVolumes, setPruneVolumes] = useState(false)
    const [pruneNetworks, setPruneNetworks] = useState(true)
    const [pruning, setPruning] = useState(false)
    const [pruneReport, setPruneReport] = useState<DockerPruneReport | null>(null)

    const handlePrune = async () => {
        setPruning(true)
        try {
            const report = await API.dockerSystemPrune(
                serverId,
                pruneContainers,
                pruneImages,
                pruneVolumes,
                pruneNetworks
            )
            setPruneReport(report)
            message.success(t('overview.pruneSuccess', { defaultValue: '系统清理完成，释放空间: {{space}}', space: report?.spaceReclaimedStr || '0 B' }))
            onRefresh()
        } catch (err: any) {
            message.error(t('overview.pruneFail', { defaultValue: '清理失败: {{error}}', error: err.message || String(err) }))
        } finally {
            setPruning(false)
        }
    }

    const formatMem = (bytes: number) => {
        if (!bytes) return '-'
        const gb = bytes / (1024 * 1024 * 1024)
        return `${gb.toFixed(2)} GB`
    }

    return (
        <div>
            {/* 核心统计指标卡片 */}
            <div className={s.overviewGrid}>
                <div className={s.statCard}>
                    <div className={s.statCardHeader}>
                        <span>{t('overview.containersStatus', '容器运行状态')}</span>
                        <Box size={18} color="var(--accent)" />
                    </div>
                    <div className={s.statCardValue}>{overview?.containersTotal ?? 0}</div>
                    <div className={s.statCardFooter}>
                        <Tag color="success">{t('overview.running', { count: overview?.containersRunning ?? 0, defaultValue: '运行: {{count}}' })}</Tag>
                        <Tag color="warning">{t('overview.paused', { count: overview?.containersPaused ?? 0, defaultValue: '暂停: {{count}}' })}</Tag>
                        <Tag color="default">{t('overview.stopped', { count: overview?.containersStopped ?? 0, defaultValue: '停止: {{count}}' })}</Tag>
                    </div>
                </div>

                <div className={s.statCard}>
                    <div className={s.statCardHeader}>
                        <span>{t('overview.localImages', '本地镜像总数')}</span>
                        <Layers size={18} color="var(--accent)" />
                    </div>
                    <div className={s.statCardValue}>{overview?.imagesTotal ?? 0}</div>
                    <div className={s.statCardFooter}>
                        <span>{t('overview.localImagesDesc', '已拉取并缓存的镜像')}</span>
                    </div>
                </div>

                <div className={s.statCard}>
                    <div className={s.statCardHeader}>
                        <span>{t('overview.volumesTotal', '数据卷总数')}</span>
                        <HardDrive size={18} color="var(--accent)" />
                    </div>
                    <div className={s.statCardValue}>{overview?.volumesTotal ?? 0}</div>
                    <div className={s.statCardFooter}>
                        <span>{t('overview.volumesDesc', '本地持久化卷')}</span>
                    </div>
                </div>

                <div className={s.statCard}>
                    <div className={s.statCardHeader}>
                        <span>{t('overview.networksTotal', '网络桥接总数')}</span>
                        <Network size={18} color="var(--accent)" />
                    </div>
                    <div className={s.statCardValue}>{overview?.networksTotal ?? 0}</div>
                    <div className={s.statCardFooter}>
                        <span>{t('overview.networksDesc', 'Bridge / Host / Overlay')}</span>
                    </div>
                </div>
            </div>

            {/* 守护进程与系统环境详情 */}
            <div className={s.infoSection}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                    <div className={s.sectionTitle} style={{ margin: 0 }}>
                        <Server size={16} /> {t('overview.engineInfo', 'Docker 引擎与环境信息')}
                    </div>
                    <Space size={8}>
                        <Button
                            danger
                            type='primary'
                            icon={<Trash2 size={14} />}
                            onClick={() => {
                                setPruneReport(null)
                                setPruneModal(true)
                            }}
                        >
                            {t('overview.pruneBtn', '系统清理 (Prune)')}
                        </Button>
                        <Button type='primary' icon={<RefreshCw size={14} className={loading ? 'animate-spin' : ''} />} onClick={onRefresh}>
                            {t('overview.refreshOverview', '刷新概览')}
                        </Button>
                    </Space>
                </div>

                <div className={s.infoGrid}>
                    <div className={s.infoItem}>
                        <span className={s.infoLabel}>{t('overview.serverVersion', 'Docker 服务端版本')}</span>
                        <span className={s.infoVal}>{overview?.serverVersion || '-'}</span>
                    </div>
                    <div className={s.infoItem}>
                        <span className={s.infoLabel}>{t('overview.apiVersion', 'API 协议版本')}</span>
                        <span className={s.infoVal}>{overview?.apiVersion || '-'}</span>
                    </div>
                    <div className={s.infoItem}>
                        <span className={s.infoLabel}>{t('overview.os', '操作系统与发行版')}</span>
                        <span className={s.infoVal}>{overview?.operatingSystem || overview?.os || '-'}</span>
                    </div>
                    <div className={s.infoItem}>
                        <span className={s.infoLabel}>{t('overview.kernel', '内核版本')}</span>
                        <span className={s.infoVal}>{overview?.kernelVersion || '-'}</span>
                    </div>
                    <div className={s.infoItem}>
                        <span className={s.infoLabel}>{t('overview.arch', '系统架构')}</span>
                        <span className={s.infoVal}>{overview?.arch || '-'}</span>
                    </div>
                    <div className={s.infoItem}>
                        <span className={s.infoLabel}>{t('overview.cpuCores', 'CPU 核心数')}</span>
                        <span className={s.infoVal}>{overview?.ncpu ? t('overview.cores', { count: overview.ncpu, defaultValue: `${overview.ncpu} 核` }) : '-'}</span>
                    </div>
                    <div className={s.infoItem}>
                        <span className={s.infoLabel}>{t('overview.memTotal', '系统总物理内存')}</span>
                        <span className={s.infoVal}>{formatMem(overview?.memTotal || 0)}</span>
                    </div>
                    <div className={s.infoItem}>
                        <span className={s.infoLabel}>{t('overview.storageDriver', '存储驱动 (Storage Driver)')}</span>
                        <span className={s.infoVal}>{overview?.storageDriver || '-'}</span>
                    </div>
                    <div className={s.infoItem} style={{ gridColumn: 'span 2' }}>
                        <span className={s.infoLabel}>{t('overview.rootDir', 'Docker 数据根目录 (Root Dir)')}</span>
                        <span className={s.infoVal} title={overview?.dockerRootDir}>{overview?.dockerRootDir || '-'}</span>
                    </div>
                    <div className={s.infoItem} style={{ gridColumn: 'span 2' }}>
                        <span className={s.infoLabel}>{t('overview.targetEndpoint', '连接目标端点 (Target Endpoint)')}</span>
                        <span className={s.infoVal} title={overview?.endpointTarget}>
                            <Tag color="blue">{overview?.endpointType?.toUpperCase()}</Tag> {overview?.endpointTarget || '-'}
                        </span>
                    </div>
                </div>
            </div>

            {/* 系统 Prune 模态框 */}
            <AntdModal
                title={
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Trash2 size={18} color="var(--danger)" />
                        <span>{t('overview.pruneModalTitle', 'Docker 系统资源清理 (System Prune)')}</span>
                    </div>
                }
                open={pruneModal}
                onCancel={() => {
                    if (!pruning) setPruneModal(false)
                }}
                footer={[
                    <Button key="cancel" onClick={() => setPruneModal(false)} disabled={pruning}>
                        {t('overview.close', '关闭')}
                    </Button>,
                    <Button key="prune" type="primary" danger loading={pruning} onClick={handlePrune}>
                        {t('overview.startPrune', '开始清理')}
                    </Button>,
                ]}
                width={560}
                centered
            >
                <div style={{ padding: '8px 0' }}>
                    <div style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 14 }}>
                        {t('overview.pruneModalDesc', '清理未被使用的 Docker 资源（已停止容器、未挂载卷、悬空镜像、未关联网络）以释放磁盘空间：')}
                    </div>

                    <Space orientation="vertical" size={10} style={{ width: '100%', marginBottom: 16 }}>
                        <Checkbox checked={pruneContainers} onChange={(e) => setPruneContainers(e.target.checked)}>
                            {t('overview.pruneContainers', '清理已停止运行的容器 (Stopped Containers)')}
                        </Checkbox>
                        <Checkbox checked={pruneImages} onChange={(e) => setPruneImages(e.target.checked)}>
                            {t('overview.pruneImages', '清理无标签/未使用的悬空镜像 (Dangling Images)')}
                        </Checkbox>
                        <Checkbox checked={pruneVolumes} onChange={(e) => setPruneVolumes(e.target.checked)}>
                            {t('overview.pruneVolumes', '清理未挂载的数据卷 (Unused Volumes，谨慎勾选)')}
                        </Checkbox>
                        <Checkbox checked={pruneNetworks} onChange={(e) => setPruneNetworks(e.target.checked)}>
                            {t('overview.pruneNetworks', '清理未被容器使用的自定义网络 (Unused Networks)')}
                        </Checkbox>
                    </Space>

                    {pruneReport && (
                        <div style={{ background: 'var(--bg-2)', padding: 12, borderRadius: 6, border: '1px solid var(--border)' }}>
                            <div style={{ fontWeight: 600, color: 'var(--ok)', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                                <CheckCircle size={15} /> {t('overview.pruneReportTitle', '清理完成报告')}
                            </div>
                            <div style={{ fontSize: 12.5, display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <div>{t('overview.spaceReclaimed', '已释放磁盘空间: ')}<strong style={{ color: 'var(--accent)' }}>{pruneReport.spaceReclaimedStr || '0 B'}</strong></div>
                                <div>{t('overview.containersDeleted', { count: pruneReport.containersDeleted?.length || 0, defaultValue: '删除容器数: {{count}} 个' })}</div>
                                <div>{t('overview.imagesDeleted', { count: pruneReport.imagesDeleted?.length || 0, defaultValue: '删除镜像数: {{count}} 个' })}</div>
                                <div>{t('overview.volumesDeleted', { count: pruneReport.volumesDeleted?.length || 0, defaultValue: '删除数据卷: {{count}} 个' })}</div>
                                <div>{t('overview.networksDeleted', { count: pruneReport.networksDeleted?.length || 0, defaultValue: '删除网络数: {{count}} 个' })}</div>
                            </div>
                        </div>
                    )}
                </div>
            </AntdModal>
        </div>
    )
}
