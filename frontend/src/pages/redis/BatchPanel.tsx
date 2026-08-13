import React from 'react'
import CodeEditor from '@/components/CodeEditor'
import {RedisPipelineResult, RedisTransactionResult} from '@/types'
import g from '@/styles/global.module.less'
import b from '@/pages/redis/BatchPanel.module.less'

export default function BatchPanel({
    title,
    cmds,
    setCmds,
    watch,
    setWatch,
    onRun,
    runLabel,
    result,
    showWatch,
}: {
    title: string
    cmds: string
    setCmds: (v: string) => void
    watch: string
    setWatch: (v: string) => void
    onRun: () => void
    runLabel: string
    result: RedisPipelineResult | RedisTransactionResult | null
    showWatch?: boolean
}) {
    return (
        <div className={b.panel}>
            <div className={b.subHead}>{title}</div>
            {showWatch && (
                <div className={b.row}>
                    <span>WATCH 键(逗号分隔)</span>
                    <input className={b.input} value={watch} onChange={(e) => setWatch(e.target.value)} placeholder="key1,key2"/>
                </div>
            )}
            <CodeEditor
                value={cmds}
                onChange={setCmds}
                lang="plain"
                height="200px"
                placeholder={'每行一条命令，例如：\nSET foo bar\nINCR counter\nHSET h k v'}
            />
            <button className={`${g.btn} ${g.primary} ${g.sm}`} onClick={onRun}>{runLabel}</button>
            {result && (
                <div className={b.msgList}>
                    {'aborted' in result && result.aborted && <div className={b.redisMsg}>事务被中止（WATCH 冲突）</div>}
                    {result.results?.map((r2, i) => (
                        <div key={i} className={b.msgItem}>
                            <span className={b.msgChan}>#{i + 1}</span>
                            <span className={b.msgPayload}>{r2.result}</span>
                            {r2.error && <span className={b.msgErr}>{r2.error}</span>}
                        </div>
                    ))}
                    {result.error && <div className={b.msgErr}>整体错误: {result.error}</div>}
                </div>
            )}
        </div>
    )
}
