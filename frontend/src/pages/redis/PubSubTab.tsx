import { Input, Button, Tag } from 'antd'
import { useTranslation } from 'react-i18next'
import { RedisPubsubMessage } from '@/types'
import ps from '@/pages/redis/PubSubTab.module.less'

export default function PubSubTab({
    psChannel,
    setPsChannel,
    psPattern,
    setPsPattern,
    psSubs,
    psMessages,
    doSubscribe,
    doPSubscribe,
    doPublish,
    doUnsub,
}: {
    psChannel: string
    setPsChannel: (v: string) => void
    psPattern: string
    setPsPattern: (v: string) => void
    psSubs: string[]
    psMessages: RedisPubsubMessage[]
    doSubscribe: () => Promise<void>
    doPSubscribe: () => Promise<void>
    doPublish: () => Promise<void>
    doUnsub: (ch: string) => Promise<void>
}) {
    const { t } = useTranslation('redis')

    return (
        <div className={ps.panel}>
            <div className={ps.row} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <Input
                    size="small"
                    style={{ maxWidth: 260 }}
                    placeholder={t('pubsub.channelPlaceholder', '频道名称 (Channel)')}
                    value={psChannel}
                    onChange={(e) => setPsChannel(e.target.value)}
                />
                <Button size="small" type="primary" onClick={doSubscribe}>{t('pubsub.subscribe', '订阅')}</Button>
                <Button size="small" onClick={doPublish}>{t('pubsub.publish', '发布')}</Button>
            </div>
            <div className={ps.row} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <Input
                    size="small"
                    style={{ maxWidth: 260 }}
                    placeholder={t('pubsub.patternPlaceholder', '模式 (如 news.*)')}
                    value={psPattern}
                    onChange={(e) => setPsPattern(e.target.value)}
                />
                <Button size="small" onClick={doPSubscribe}>{t('pubsub.psubscribe', '模式订阅')}</Button>
            </div>
            <div className={ps.subs} style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{t('pubsub.currentSubs', '当前订阅:')}</span>
                {psSubs.length === 0 ? <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{t('pubsub.none', '无')}</span> : psSubs.map((s) => (
                    <Tag
                        key={s}
                        closable
                        color="processing"
                        onClose={(e) => {
                            e.preventDefault()
                            void doUnsub(s)
                        }}
                    >
                        {s}
                    </Tag>
                ))}
            </div>
            <div className={ps.msgList}>
                {psMessages.length === 0 && <div className={ps.redisEmpty}>{t('pubsub.noMsgs', '暂无消息')}</div>}
                {psMessages.map((m, i) => (
                    <div key={i} className={ps.msgItem}>
                        <span className={ps.msgChan}>[{m.channel}]</span>
                        <span className={ps.msgPayload}>{m.payload}</span>
                    </div>
                ))}
            </div>
        </div>
    )
}
