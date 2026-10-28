import { Button } from 'antd'
import { RotateCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { RedisMonitorInfo } from '@/types'
import m from '@/pages/redis/MonitorTab.module.less'

function Metric({ label, value }: { label: string; value: any }) {
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
    const { t } = useTranslation('redis')

    return (
        <div className={m.panel}>
            <div style={{ display: 'flex', marginBottom: 12 }}>
                <Button size="small" icon={<RotateCw size={12} />} onClick={refreshMonitor}>
                    {t('monitor.refresh')}
                </Button>
            </div>
            {monitor && (
                <div className={m.monitorGrid}>
                    <Metric label={t('monitor.version')} value={monitor.version} />
                    <Metric label={t('monitor.memoryUsed')} value={monitor.memoryUsed} />
                    <Metric label={t('monitor.connectedClients')} value={monitor.connectedClients} />
                    <Metric label={t('monitor.uptime')} value={monitor.uptimeDays ? t('monitor.uptimeDays', { days: monitor.uptimeDays }) : '-'} />
                    <Metric label={t('monitor.breaker')} value={monitor.breaker} />
                    <Metric label={t('monitor.hits')} value={monitor.hits} />
                    <Metric label={t('monitor.misses')} value={monitor.misses} />
                    <Metric label={t('monitor.timeouts')} value={monitor.timeouts} />
                    <Metric label={t('monitor.totalConns')} value={monitor.totalConns} />
                    <Metric label={t('monitor.idleConns')} value={monitor.idleConns} />
                    <Metric label={t('monitor.staleConns')} value={monitor.staleConns} />
                    <Metric label={t('monitor.mode')} value={monitor.mode} />
                    <Metric label={t('monitor.serialization')} value={monitor.serialization} />
                </div>
            )}
        </div>
    )
}
