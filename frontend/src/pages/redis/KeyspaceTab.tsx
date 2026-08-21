import React from 'react'
import { Input, InputNumber, Button } from 'antd'
import { RedisKeyspaceMessage, RedisSlowLogEntry } from '@/types'
import ks from '@/pages/redis/KeyspaceTab.module.less'

export default function KeyspaceTab({
    ksDb,
    setKsDb,
    ksEvent,
    setKsEvent,
    ksMessages,
    slowLogs,
    startKeyspace,
}: {
    ksDb: number
    setKsDb: (v: number) => void
    ksEvent: string
    setKsEvent: (v: string) => void
    ksMessages: RedisKeyspaceMessage[]
    slowLogs: RedisSlowLogEntry[]
    startKeyspace: () => Promise<void>
}) {
    return (
        <div className={ks.panel}>
            <div className={ks.row} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>DB:</span>
                <InputNumber size="small" style={{ width: 60 }} min={0} value={ksDb} onChange={(v) => setKsDb(v ?? 0)} />
                <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>事件:</span>
                <Input size="small" style={{ maxWidth: 220 }} placeholder="expired / set / del ..." value={ksEvent} onChange={(e) => setKsEvent(e.target.value)} />
                <Button size="small" type="primary" onClick={startKeyspace}>开始监听</Button>
            </div>
            <div className={ks.msgList}>
                {ksMessages.length === 0 && <div className={ks.redisEmpty}>暂无键事件（需 Redis 开启 notify-keyspace-events）</div>}
                {ksMessages.map((m, i) => (
                    <div key={i} className={ks.msgItem}>
                        <span className={ks.msgChan}>[{m.event}]</span>
                        <span className={ks.msgKey}>{m.key}</span>
                    </div>
                ))}
            </div>
            <div className={ks.subHead} style={{ marginTop: 16 }}>慢查询日志（最近 20 条）</div>
            <div className={ks.msgList}>
                {slowLogs.length === 0 && <div className={ks.redisEmpty}>暂无慢日志</div>}
                {slowLogs.map((s, i) => (
                    <div key={i} className={ks.msgItem}>
                        <span className={ks.msgChan}>{(s.duration / 1000).toFixed(2)}ms</span>
                        <span className={ks.msgPayload}>{s.command}</span>
                    </div>
                ))}
            </div>
        </div>
    )
}
