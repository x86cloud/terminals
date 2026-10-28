import { Input, Select, Button, InputNumber } from 'antd'
import { useTranslation } from 'react-i18next'
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
    const { t } = useTranslation('redis')

    return (
        <div className={q.panel}>
            <div className={q.row} style={{ gap: 8, alignItems: 'center' }}>
                <Input
                    style={{ flex: 1 }}
                    placeholder={t('queue.queueName')}
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
                <span style={{ fontSize: 12, opacity: 0.85, whiteSpace: 'nowrap' }}>
                    {t('queue.length', { len: qLen })}
                </span>
            </div>
            <div className={q.row} style={{ gap: 8, alignItems: 'center', marginTop: 8 }}>
                <Input
                    style={{ flex: 1 }}
                    placeholder={t('queue.msgContent')}
                    value={qPayload}
                    onChange={(e) => setQPayload(e.target.value)}
                />
                <Button type="primary" onClick={enqueue}>
                    {t('queue.enqueue')}
                </Button>
                <span style={{ fontSize: 12, opacity: 0.85 }}>{t('queue.timeoutSec')}</span>
                <InputNumber
                    min={0}
                    style={{ width: 80 }}
                    value={qTimeout}
                    onChange={(v) => setQTimeout(v || 0)}
                />
                <Button onClick={dequeue}>{t('queue.dequeue')}</Button>
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
