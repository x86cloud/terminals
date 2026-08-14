import React, {useCallback, useEffect, useMemo, useState} from 'react'
import { Search, X, RotateCw } from 'lucide-react'
import {API} from '@/api'
import {SSHServiceInfo} from '@/types'
import {errorMessage} from '@/utils'
import g from '@/styles/global.module.less'
import s from '@/pages/ssh/service/ServicePanel.module.less'

interface Props {
    sessionId: string
    active: boolean
    onNotify?: (message: string, kind?: 'info' | 'error') => void
}

type FilterTab = 'all' | 'active' | 'inactive' | 'failed'

export default function ServicePanel({sessionId, active, onNotify}: Props) {
    const [services, setServices] = useState<SSHServiceInfo[]>([])
    const [busy, setBusy] = useState(false)
    const [actionBusy, setActionBusy] = useState<string>('')
    const [error, setError] = useState('')
    const [keyword, setKeyword] = useState('')
    const [filterTab, setFilterTab] = useState<FilterTab>('all')
    const [lastUpdate, setLastUpdate] = useState<string>('')

    // 日志 Modal
    const [logService, setLogService] = useState('')
    const [logText, setLogText] = useState('')
    const [logLoading, setLogLoading] = useState(false)

    const fetchServices = useCallback(async () => {
        setBusy(true)
        setError('')
        try {
            const list = await API.sshServiceList(sessionId)
            setServices(list || [])
            setLastUpdate(new Date().toLocaleTimeString())
        } catch (e) {
            const msg = errorMessage(e)
            setError(msg)
            if (onNotify) onNotify(`读取 Systemd 服务列表失败: ${msg}`, 'error')
        } finally {
            setBusy(false)
        }
    }, [sessionId, onNotify])

    useEffect(() => {
        if (active && services.length === 0 && !busy) {
            void fetchServices()
        }
    }, [active, services.length, busy, fetchServices])

    const counts = useMemo(() => {
        let active = 0
        let inactive = 0
        let failed = 0
        for (const svc of services) {
            if (svc.active === 'active') active++
            else if (svc.active === 'failed' || svc.sub === 'failed') failed++
            else inactive++
        }
        return {all: services.length, active, inactive, failed}
    }, [services])

    const filteredServices = useMemo(() => {
        let list = services
        if (filterTab === 'active') {
            list = list.filter((svc) => svc.active === 'active')
        } else if (filterTab === 'inactive') {
            list = list.filter((svc) => svc.active !== 'active' && svc.active !== 'failed' && svc.sub !== 'failed')
        } else if (filterTab === 'failed') {
            list = list.filter((svc) => svc.active === 'failed' || svc.sub === 'failed')
        }

        if (keyword.trim()) {
            const kw = keyword.trim().toLowerCase()
            list = list.filter(
                (svc) =>
                    svc.name.toLowerCase().includes(kw) ||
                    svc.description.toLowerCase().includes(kw)
            )
        }

        return list
    }, [services, filterTab, keyword])

    const handleControl = async (svc: SSHServiceInfo, action: 'start' | 'stop' | 'restart') => {
        const actionText = action === 'start' ? '启动' : action === 'stop' ? '停止' : '重启'
        setActionBusy(`${svc.name}-${action}`)
        try {
            await API.sshControlService(sessionId, svc.name, action)
            if (onNotify) onNotify(`已成功${actionText}服务 ${svc.name}`)
            await fetchServices()
        } catch (e) {
            const msg = errorMessage(e)
            if (onNotify) onNotify(`执行 ${actionText} 失败: ${msg}`, 'error')
        } finally {
            setActionBusy('')
        }
    }

    const openLogs = async (svc: SSHServiceInfo) => {
        setLogService(svc.name)
        setLogLoading(true)
        setLogText('')
        try {
            const logs = await API.sshServiceLogs(sessionId, svc.name)
            setLogText(logs || '暂无日志输出')
        } catch (e) {
            setLogText(`获取日志失败: ${errorMessage(e)}`)
        } finally {
            setLogLoading(false)
        }
    }

    if (!active) return null

    return (
        <div className={s.servicePanel}>
            <div className={s.toolbar}>
                <div className={s.filterTabs}>
                    <button
                        className={`${s.filterBtn}${filterTab === 'all' ? ' ' + s.active : ''}`}
                        onClick={() => setFilterTab('all')}
                    >
                        <span>全部</span>
                        <span className={s.countBadge}>({counts.all})</span>
                    </button>
                    <button
                        className={`${s.filterBtn}${filterTab === 'active' ? ' ' + s.active : ''}`}
                        onClick={() => setFilterTab('active')}
                    >
                        <span>运行中</span>
                        <span className={s.countBadge}>({counts.active})</span>
                    </button>
                    <button
                        className={`${s.filterBtn}${filterTab === 'inactive' ? ' ' + s.active : ''}`}
                        onClick={() => setFilterTab('inactive')}
                    >
                        <span>已停止</span>
                        <span className={s.countBadge}>({counts.inactive})</span>
                    </button>
                    <button
                        className={`${s.filterBtn}${filterTab === 'failed' ? ' ' + s.active : ''}`}
                        onClick={() => setFilterTab('failed')}
                    >
                        <span>失败</span>
                        <span className={`${s.countBadge}${counts.failed > 0 ? ' ' + s.dangerCount : ''}`}>
                            ({counts.failed})
                        </span>
                    </button>
                </div>

                <div className={s.searchWrap}>
                    <Search size={13}/>
                    <input
                        value={keyword}
                        placeholder="搜索服务名 / 描述..."
                        onChange={(e) => setKeyword(e.target.value)}
                    />
                    {keyword && (
                        <button className={g.iconBtn} onClick={() => setKeyword('')} title="清空搜索">
                            <X size={12}/>
                        </button>
                    )}
                </div>

                <div className={s.toolbarActions}>
                    {lastUpdate && <span className={s.lastUpdate} title={`更新于 ${lastUpdate}`}>更新于 {lastUpdate}</span>}
                    <button
                        className={`${g.btn} ${g.xs}`}
                        onClick={fetchServices}
                        disabled={busy}
                        title="刷新服务列表"
                    >
                        <RotateCw size={12} className={busy ? s.spin : ''}/> {busy ? '刷新中…' : '刷新'}
                    </button>
                </div>
            </div>

            {error && (
                <div className={s.errorState}>
                    <span>{error}</span>
                    <button className={`${g.btn} ${g.xs}`} onClick={fetchServices}>重试</button>
                </div>
            )}

            <div className={s.tableContent}>
                <div className={s.tableCard}>
                    {filteredServices.length === 0 ? (
                        <div className={s.emptyState}>
                            {busy ? '正在读取远程服务列表…' : '暂无匹配的服务数据'}
                        </div>
                    ) : (
                        <table className={s.serviceTable}>
                            <thead>
                                <tr>
                                    <th className={s.colName}>服务名称</th>
                                    <th className={s.colActive}>状态</th>
                                    <th className={s.colSub}>子状态</th>
                                    <th className={s.colDesc}>服务描述</th>
                                    <th className={s.colActions}>操作</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredServices.map((svc) => {
                                    const isRunning = svc.active === 'active'
                                    const isFailed = svc.active === 'failed' || svc.sub === 'failed'
                                    const badgeClass = isRunning
                                        ? s.active
                                        : isFailed
                                        ? s.failed
                                        : s.inactive

                                    return (
                                        <tr key={svc.name}>
                                            <td className={s.colName} title={svc.name}>{svc.name}</td>
                                            <td className={s.colActive}>
                                                <span className={`${s.statusBadge} ${badgeClass}`}>
                                                    <span className={s.dot}/>
                                                    {svc.active}
                                                </span>
                                            </td>
                                            <td className={s.colSub}>{svc.sub}</td>
                                            <td className={s.colDesc} title={svc.description}>{svc.description || '-'}</td>
                                            <td className={s.colActions}>
                                                <div className={s.actionBtnGroup}>
                                                    {isRunning ? (
                                                        <button
                                                            className={`${s.actionBtn} ${s.danger}`}
                                                            onClick={() => handleControl(svc, 'stop')}
                                                            disabled={actionBusy === `${svc.name}-stop`}
                                                            title="停止服务 (systemctl stop)"
                                                        >
                                                            停止
                                                        </button>
                                                    ) : (
                                                        <button
                                                            className={s.actionBtn}
                                                            onClick={() => handleControl(svc, 'start')}
                                                            disabled={actionBusy === `${svc.name}-start`}
                                                            title="启动服务 (systemctl start)"
                                                        >
                                                            启动
                                                        </button>
                                                    )}
                                                    <button
                                                        className={s.actionBtn}
                                                        onClick={() => handleControl(svc, 'restart')}
                                                        disabled={actionBusy === `${svc.name}-restart`}
                                                        title="重启服务 (systemctl restart)"
                                                    >
                                                        重启
                                                    </button>
                                                    <button
                                                        className={s.actionBtn}
                                                        onClick={() => openLogs(svc)}
                                                        title="查看 systemd 日志 (journalctl)"
                                                    >
                                                        日志
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>

            {/* 日志 Modal */}
            {logService && (
                <div className={s.logOverlay} onClick={() => setLogService('')}>
                    <div className={s.logModal} onClick={(e) => e.stopPropagation()}>
                        <div className={s.logHeader}>
                            <span>服务日志: {logService}</span>
                            <button className={`${g.btn} ${g.xs}`} onClick={() => setLogService('')}>关闭</button>
                        </div>
                        <div className={s.logBody}>
                            {logLoading ? '正在读取 journalctl 日志…' : logText}
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
