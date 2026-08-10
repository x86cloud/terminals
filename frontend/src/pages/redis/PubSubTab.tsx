import React from 'react'
import {RedisPubsubMessage} from '../../types'
import g from '../../styles/global.module.less'
import ps from './PubSubTab.module.less'

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
    return (
        <div className={ps.panel}>
            <div className={ps.row}>
                <input className={ps.input} placeholder="频道" value={psChannel} onChange={(e) => setPsChannel(e.target.value)}/>
                <button className={`${g.btn} ${g.sm}`} onClick={doSubscribe}>订阅</button>
                <button className={`${g.btn} ${g.sm}`} onClick={doPublish}>发布</button>
            </div>
            <div className={ps.row}>
                <input className={ps.input} placeholder="模式（如 news.*）" value={psPattern} onChange={(e) => setPsPattern(e.target.value)}/>
                <button className={`${g.btn} ${g.sm}`} onClick={doPSubscribe}>模式订阅</button>
            </div>
            <div className={ps.subs}>
                当前订阅：{psSubs.length === 0 ? '无' : psSubs.map((s) => (
                <span key={s} className={ps.subChip}>
                    {s}
                    <button className={ps.subX} onClick={() => doUnsub(s)}>×</button>
                </span>
            ))}
            </div>
            <div className={ps.msgList}>
                {psMessages.length === 0 && <div className={ps.redisEmpty}>暂无消息</div>}
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
