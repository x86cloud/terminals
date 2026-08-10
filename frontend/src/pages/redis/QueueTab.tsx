import React from 'react'
import {RedisQueueItem} from '../../types'
import {fmtFields} from './redisTypes'
import g from '../../styles/global.module.less'
import q from './QueueTab.module.less'

export default function QueueTab({
    qName,
    setQName,
    qPayload,
    setQPayload,
    qMode,
    setQMode,
    qTimeout,
    setQTimeout,
    qLen,
    qOut,
    enqueue,
    dequeue,
}: {
    qName: string
    setQName: (v: string) => void
    qPayload: string
    setQPayload: (v: string) => void
    qMode: 'list' | 'stream'
    setQMode: (v: 'list' | 'stream') => void
    qTimeout: number
    setQTimeout: (v: number) => void
    qLen: number
    qOut: RedisQueueItem | null
    enqueue: () => Promise<void>
    dequeue: () => Promise<void>
}) {
    return (
        <div className={q.panel}>
            <div className={q.row}>
                <input className={q.input} placeholder="队列名" value={qName} onChange={(e) => setQName(e.target.value)}/>
                <select className={q.inputSm} value={qMode} onChange={(e) => setQMode(e.target.value as any)}>
                    <option value="list">List (RPUSH/BLPOP)</option>
                    <option value="stream">Stream (XADD/XREAD)</option>
                </select>
                <span>长度 {qLen}</span>
            </div>
            <div className={q.row}>
                <input className={q.input} placeholder="消息内容" value={qPayload} onChange={(e) => setQPayload(e.target.value)}/>
                <button className={`${g.btn} ${g.sm}`} onClick={enqueue}>入队</button>
                <span>超时(s)</span>
                <input className={q.inputSm} style={{width: 60}} type="number" value={qTimeout} onChange={(e) => setQTimeout(Number(e.target.value))}/>
                <button className={`${g.btn} ${g.sm}`} onClick={dequeue}>出队</button>
            </div>
            {qOut && (
                <div className={q.msgItem}>
                    <span className={q.msgChan}>[{qOut.id}]</span>
                    <span className={q.msgPayload}>{fmtFields(qOut.payload)}</span>
                </div>
            )}
        </div>
    )
}
