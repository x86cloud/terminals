import React from 'react'
import {RedisMonitorInfo} from '../../types'
import g from '../../styles/global.module.less'
import m from './MonitorTab.module.less'

function Metric({label, value}: { label: string; value: any }) {
    return (
        <div className={m.metric}>
            <span className={m.metricLabel}>{label}</span>
            <span className={m.metricValue}>{String(value)}</span>
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
            <div style={{display: 'flex'}}>
                <button className={`${g.btn} ${g.sm}`} onClick={refreshMonitor}>刷新</button>
            </div>
            {monitor && (
                <div className={m.monitorGrid}>
                    <Metric label="熔断状态" value={monitor.breaker}/>
                    <Metric label="命中" value={monitor.hits}/>
                    <Metric label="未命中" value={monitor.misses}/>
                    <Metric label="超时" value={monitor.timeouts}/>
                    <Metric label="总连接" value={monitor.totalConns}/>
                    <Metric label="空闲连接" value={monitor.idleConns}/>
                    <Metric label="陈旧连接" value={monitor.staleConns}/>
                    <Metric label="模式" value={monitor.mode}/>
                    <Metric label="序列化" value={monitor.serialization}/>
                </div>
            )}
        </div>
    )
}
