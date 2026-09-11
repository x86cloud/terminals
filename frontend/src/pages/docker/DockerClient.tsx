import React, { useState, useEffect, useRef } from 'react'
import { Segmented, Button, Space, Tag, message } from 'antd'
import {
    Activity,
    Box,
    Layers,
    HardDrive,
    Network,
    RefreshCw,
    Radio,
    Sliders,
} from 'lucide-react'
import { API } from '@/api'
import type { DockerSessionInfo, DockerOverview } from '@/types'
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
    const [activeTab, setActiveTab] = useState<TabKey>('overview')
    const [overview, setOverview] = useState<DockerOverview | null>(null)
    const [loading, setLoading] = useState(false)
    const [pingLatency, setPingLatency] = useState<number | null>(null)
    const timerRef = useRef<any>(null)

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
                message.error(`获取 Docker 状态失败: ${err.message || String(err)}`)
            }
        } finally {
            if (!quiet) setLoading(false)
        }
    }

    useEffect(() => {
        fetchOverview()
        timerRef.current = setInterval(() => {
            fetchOverview(true)
        }, 15000)
        return () => {
            if (timerRef.current) clearInterval(timerRef.current)
        }
    }, [session.serverId])

    const handleRunImage = (imageName: string) => {
        setActiveTab('containers')
    }

    const tabItems = [
        {
            value: 'overview',
            label: (
                <Space size={6}>
                    <Activity size={14} />
                    <span>系统概览</span>
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
                    <span>容器 ({overview?.containersTotal ?? 0})</span>
                </Space>
            ),
        },
        {
            value: 'images',
            label: (
                <Space size={6}>
                    <Sliders size={14} />
                    <span>镜像 ({overview?.imagesTotal ?? 0})</span>
                </Space>
            ),
        },
        {
            value: 'volumes',
            label: (
                <Space size={6}>
                    <HardDrive size={14} />
                    <span>数据卷 ({overview?.volumesTotal ?? 0})</span>
                </Space>
            ),
        },
        {
            value: 'networks',
            label: (
                <Space size={6}>
                    <Network size={14} />
                    <span>网络 ({overview?.networksTotal ?? 0})</span>
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
                        onChange={(v) => setActiveTab(v as TabKey)}
                        options={tabItems}
                        size="small"
                    />

                    <Button
                        type='primary'
                        size="small"
                        icon={<RefreshCw size={13} className={loading ? 'animate-spin' : ''} />}
                        onClick={() => fetchOverview(false)}
                    >
                        刷新
                    </Button>
                </div>
            </div>

            {/* 标签页视图 */}
            <div className={s.tabContent}>
                {activeTab === 'overview' && (
                    <OverviewTab
                        serverId={session.serverId}
                        overview={overview}
                        loading={loading}
                        onRefresh={() => fetchOverview(false)}
                    />
                )}
                {activeTab === 'compose' && (
                    <ComposeTab serverId={session.serverId} />
                )}
                {activeTab === 'containers' && (
                    <ContainersTab serverId={session.serverId} />
                )}
                {activeTab === 'images' && (
                    <ImagesTab serverId={session.serverId} onRunImage={handleRunImage} />
                )}
                {activeTab === 'volumes' && (
                    <VolumesTab serverId={session.serverId} />
                )}
                {activeTab === 'networks' && (
                    <NetworksTab serverId={session.serverId} />
                )}
            </div>
        </div>
    )
}
