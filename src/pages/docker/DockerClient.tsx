import { useState, useEffect, useRef } from 'react'
import { Segmented, Button, Space, Tag, App } from 'antd'
import {
    Activity,
    Box,
    Layers,
    HardDrive,
    Network,
    RefreshCw,
    Sliders,
} from 'lucide-react'
import { API } from '@/api'
import type { DockerSessionInfo, DockerOverview } from '@/types'
import { useSession } from '@/contexts/SessionContext'
import { useTranslation } from 'react-i18next'
import ClientIcon from '@/components/ClientIcon'
import OverviewTab from './OverviewTab'
import ComposeTab from './ComposeTab'
import ContainersTab from './ContainersTab'
import ImagesTab from './ImagesTab'
import VolumesTab from './VolumesTab'
import NetworksTab from './NetworksTab'
import s from './DockerClient.module.less'

interface Props {
    session: DockerSessionInfo
    onClose?: () => void
}

type TabKey = 'overview' | 'compose' | 'containers' | 'images' | 'volumes' | 'networks'

export default function DockerClient({ session, onClose }: Props) {
    const { t } = useTranslation(['docker', 'common'])
    const { message } = App.useApp()
    const { activeTarget } = useSession()
    const isActive = activeTarget?.kind === 'docker' && activeTarget.id === session.id

    const [activeTab, setActiveTab] = useState<TabKey>('overview')
    const [mountedTabs, setMountedTabs] = useState<Set<TabKey>>(() => new Set(['overview']))
    const [refreshCounters, setRefreshCounters] = useState<Record<TabKey, number>>({
        overview: 0,
        compose: 0,
        containers: 0,
        images: 0,
        volumes: 0,
        networks: 0,
    })
    const [pendingRunImage, setPendingRunImage] = useState<{ image: string; nonce: number } | null>(null)
    const [overview, setOverview] = useState<DockerOverview | null>(null)
    const [loading, setLoading] = useState(false)
    const [pingLatency, setPingLatency] = useState<number | null>(null)
    const timerRef = useRef<any>(null)

    const selectTab = (tab: TabKey) => {
        setActiveTab(tab)
        setMountedTabs((prev) => {
            if (prev.has(tab)) return prev
            const next = new Set(prev)
            next.add(tab)
            return next
        })
    }

    const fetchOverview = async (quiet = false) => {
        if (!quiet) setLoading(true)
        const t0 = performance.now()
        try {
            const data = await API.dockerGetOverview(session.serverId)
            const t1 = performance.now()
            setPingLatency(Math.round(t1 - t0))
            setOverview(data)
        } catch (err: any) {
            if (!quiet) {
                message.error(t('client.statusFail', { defaultValue: '获取 Docker 状态失败: {{error}}', error: err.message || String(err) }))
            }
        } finally {
            if (!quiet) setLoading(false)
        }
    }

    const handleGlobalRefresh = () => {
        void fetchOverview(false)
        if (activeTab !== 'overview') {
            setRefreshCounters((prev) => ({
                ...prev,
                [activeTab]: prev[activeTab] + 1,
            }))
        }
    }

    useEffect(() => {
        if (!isActive) return
        fetchOverview()
        timerRef.current = setInterval(() => {
            fetchOverview(true)
        }, 15000)
        return () => {
            if (timerRef.current) clearInterval(timerRef.current)
        }
    }, [session.serverId, isActive])

    const handleRunImage = (imageName: string) => {
        setPendingRunImage({ image: imageName, nonce: Date.now() })
        selectTab('containers')
    }

    const tabItems = [
        {
            value: 'overview',
            label: (
                <Space size={6}>
                    <Activity size={14} />
                    <span>{t('tabs.overview', '系统概览')}</span>
                </Space>
            ),
        },
        {
            value: 'compose',
            label: (
                <Space size={6}>
                    <Layers size={14} />
                    <span>Compose ({overview?.composeTotal ?? 0})</span>
                </Space>
            ),
        },
        {
            value: 'containers',
            label: (
                <Space size={6}>
                    <Box size={14} />
                    <span>{t('tabs.containers', '容器')} ({overview?.containersTotal ?? 0})</span>
                </Space>
            ),
        },
        {
            value: 'images',
            label: (
                <Space size={6}>
                    <Sliders size={14} />
                    <span>{t('tabs.images', '镜像')} ({overview?.imagesTotal ?? 0})</span>
                </Space>
            ),
        },
        {
            value: 'volumes',
            label: (
                <Space size={6}>
                    <HardDrive size={14} />
                    <span>{t('tabs.volumes', '数据卷')} ({overview?.volumesTotal ?? 0})</span>
                </Space>
            ),
        },
        {
            value: 'networks',
            label: (
                <Space size={6}>
                    <Network size={14} />
                    <span>{t('tabs.networks', '网络')} ({overview?.networksTotal ?? 0})</span>
                </Space>
            ),
        },
    ]

    return (
        <div className={s.dockerWorkspace}>
            {/* 顶栏 */}
            <div className={s.headerBar}>
                <div className={s.headerLeft}>
                    <div className={s.titleArea}>
                        <ClientIcon kind="docker" size={20} />
                        {/* <span>{session.title || 'Docker 容器管理'}</span> */}
                    </div>

                    <div className={s.targetBadge} title={session.target}>
                        <span className={s.onlineDot} />
                        <span>{session.endpointType.toUpperCase()}</span>
                        <span style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {session.target}
                        </span>

                        {pingLatency !== null && (
                            <Tag color={pingLatency < 80 ? 'success' : pingLatency < 300 ? 'warning' : 'default'} style={{ margin: 0 }}>
                                {pingLatency} ms
                            </Tag>
                        )}
                    </div>
                </div>

                <div className={s.headerRight}>
                    <Segmented
                        value={activeTab}
                        onChange={(v) => selectTab(v as TabKey)}
                        options={tabItems}
                        size="small"
                    />

                    <Button
                        type='primary'
                        size="small"
                        icon={<RefreshCw size={13} className={loading ? 'animate-spin' : ''} />}
                        onClick={handleGlobalRefresh}
                    >
                        {t('common:refresh', '刷新')}
                    </Button>
                </div>
            </div>

            {/* 标签页视图：已访问过的子 Tab 保持挂载以保留筛选与分页状态 */}
            <div className={s.tabContent}>
                <div style={{ display: activeTab === 'overview' ? 'block' : 'none' }}>
                    <OverviewTab
                        serverId={session.serverId}
                        overview={overview}
                        loading={loading}
                        onRefresh={() => fetchOverview(false)}
                        onNavigateTab={(tab) => selectTab(tab)}
                    />
                </div>
                {mountedTabs.has('compose') && (
                    <div style={{ display: activeTab === 'compose' ? 'block' : 'none' }}>
                        <ComposeTab
                            serverId={session.serverId}
                            refreshSignal={refreshCounters.compose}
                            onMutate={() => fetchOverview(true)}
                        />
                    </div>
                )}
                {mountedTabs.has('containers') && (
                    <div style={{ display: activeTab === 'containers' ? 'block' : 'none' }}>
                        <ContainersTab
                            serverId={session.serverId}
                            isActive={isActive && activeTab === 'containers'}
                            refreshSignal={refreshCounters.containers}
                            onMutate={() => fetchOverview(true)}
                            pendingRunImage={pendingRunImage}
                            onConsumePendingRunImage={() => setPendingRunImage(null)}
                        />
                    </div>
                )}
                {mountedTabs.has('images') && (
                    <div style={{ display: activeTab === 'images' ? 'block' : 'none' }}>
                        <ImagesTab
                            serverId={session.serverId}
                            refreshSignal={refreshCounters.images}
                            onMutate={() => fetchOverview(true)}
                            onRunImage={handleRunImage}
                        />
                    </div>
                )}
                {mountedTabs.has('volumes') && (
                    <div style={{ display: activeTab === 'volumes' ? 'block' : 'none' }}>
                        <VolumesTab
                            serverId={session.serverId}
                            refreshSignal={refreshCounters.volumes}
                            onMutate={() => fetchOverview(true)}
                        />
                    </div>
                )}
                {mountedTabs.has('networks') && (
                    <div style={{ display: activeTab === 'networks' ? 'block' : 'none' }}>
                        <NetworksTab
                            serverId={session.serverId}
                            refreshSignal={refreshCounters.networks}
                            onMutate={() => fetchOverview(true)}
                        />
                    </div>
                )}
            </div>
        </div>
    )
}
