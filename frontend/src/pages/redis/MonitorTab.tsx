import React from 'react'
import {RedisMonitorInfo} from '@/types'
import g from '@/styles/global.module.less'
import m from '@/pages/redis/MonitorTab.module.less'

function Metric({label, value}: { label: string; value: any }) {
    return (
        <div className={m.metric}>
            <span className={m.metricLabel}>{label}</span>
            <span className={m.metricValue}>{value !== undefined && value !== null && value !== '' ? String(value) : '-'}</span>
        </div>
    )
}

export default function MonitorTab({
    monitor,
    refreshMonitor,
}: {
    monitor: RedisMonitorInfo | null
    refreshMonitor: () => Promise<void>
}) {
    return (
        <div className={m.panel}>
            <div style={{display: 'flex', marginBottom: 12}}>
                <button className={`${g.btn} ${g.sm}`} onClick={refreshMonitor}>刷新监控指标</button>
            </div>
            {monitor && (
                <div className={m.monitorGrid}>
                    <Metric label="Redis 版本" value={monitor.version}/>
                    <Metric label="内存开销" value={monitor.memoryUsed}/>
                    <Metric label="在线客户端" value={monitor.connectedClients}/>
                    <Metric label="运行天数" value={monitor.uptimeDays ? `${monitor.uptimeDays} 天` : '-'}/>
                    <Metric label="熔断状态" value={monitor.breaker}/>
                    <Metric label="连接池命中" value={monitor.hits}/>
                    <Metric label="未命中" value={monitor.misses}/>
                    <Metric label="超时" value={monitor.timeouts}/>
                    <Metric label="总连接数" value={monitor.totalConns}/>
                    <Metric label="空闲连接数" value={monitor.idleConns}/>
                    <Metric label="陈旧连接数" value={monitor.staleConns}/>
                    <Metric label="部署模式" value={monitor.mode}/>
                    <Metric label="序列化" value={monitor.serialization}/>
                </div>
            )}
        </div>
    )
}
