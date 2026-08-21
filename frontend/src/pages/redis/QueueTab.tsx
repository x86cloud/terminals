import React from 'react'
import { Input, Select, Button, InputNumber, Space } from 'antd'
import { RedisQueueItem } from '@/types'
import { fmtFields } from '@/pages/redis/redisTypes'
import q from '@/pages/redis/QueueTab.module.less'

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
            <div className={q.row} style={{ gap: 8, alignItems: 'center' }}>
                <Input
                    style={{ flex: 1 }}
                    placeholder="队列名"
                    value={qName}
                    onChange={(e) => setQName(e.target.value)}
                />
                <Select
                    style={{ width: 190 }}
                    value={qMode}
                    onChange={(v) => setQMode(v)}
                    options={[
                        { value: 'list', label: 'List (RPUSH/BLPOP)' },
                        { value: 'stream', label: 'Stream (XADD/XREAD)' },
                    ]}
                />
                <span style={{ fontSize: 12, opacity: 0.85, whiteSpace: 'nowrap' }}>长度: {qLen}</span>
            </div>
            <div className={q.row} style={{ gap: 8, alignItems: 'center', marginTop: 8 }}>
                <Input
                    style={{ flex: 1 }}
                    placeholder="消息内容"
                    value={qPayload}
                    onChange={(e) => setQPayload(e.target.value)}
                />
                <Button type="primary" onClick={enqueue}>入队</Button>
                <span style={{ fontSize: 12, opacity: 0.85 }}>超时(s)</span>
                <InputNumber
                    min={0}
                    style={{ width: 80 }}
                    value={qTimeout}
                    onChange={(v) => setQTimeout(v || 0)}
                />
                <Button onClick={dequeue}>出队</Button>
            </div>
            {qOut && (
                <div className={q.msgItem} style={{ marginTop: 12 }}>
                    <span className={q.msgChan}>[{qOut.id}]</span>
                    <span className={q.msgPayload}>{fmtFields(qOut.payload)}</span>
                </div>
            )}
        </div>
    )
}
