import React from 'react'
import {RedisKeyspaceMessage, RedisSlowLogEntry} from '../../types'
import g from '../../styles/global.module.less'
import ks from './KeyspaceTab.module.less'

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
            <div className={ks.row}>
                <span>DB</span>
                <input className={ks.inputSm} type="number" value={ksDb} onChange={(e) => setKsDb(Number(e.target.value))}/>
                <span>事件</span>
                <input className={ks.input} placeholder="expired / set / del ..." value={ksEvent} onChange={(e) => setKsEvent(e.target.value)}/>
                <button className={`${g.btn} ${g.sm}`} onClick={startKeyspace}>开始监听</button>
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
            <div className={ks.subHead}>慢查询日志（最近 20 条）</div>
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
