import React, {useCallback, useEffect, useState} from 'react'
import {Play} from 'lucide-react'
import {API} from '@/api'
import {errorMessage} from '@/utils'
import {MongoSessionInfo, MongoAggregateResult} from '@/types'
import CodeEditor from '@/components/CodeEditor'
import sh from '@/pages/mongo/mongoShared.module.less'
import g from '@/styles/global.module.less'

interface Props {
    session: MongoSessionInfo
    db: string
    collection: string | null
}

export default function AggregateTab({session, db, collection}: Props) {
    const [pipeline, setPipeline] = useState('[\n  { "$match": {} }\n]')
    const [allowDisk, setAllowDisk] = useState(false)
    const [maxTime, setMaxTime] = useState(0)
    const [result, setResult] = useState<string[]>([])
    const [count, setCount] = useState(0)
    const [duration, setDuration] = useState(0)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')
    const [explain, setExplain] = useState('')

    const id = session.id

    const run = useCallback(async () => {
        if (!db || !collection) return
        setBusy(true)
        setError('')
        setExplain('')
        try {
            const res: MongoAggregateResult = await API.mongoAggregate(id, db, collection, pipeline, allowDisk, maxTime)
            setResult(res.documents)
            setCount(res.count)
            setDuration(res.durationMs)
        } catch (e) {
            setError(errorMessage(e))
        } finally {
            setBusy(false)
        }
    }, [id, db, collection, pipeline, allowDisk, maxTime])

    // 切换库时清空上一个库的结果
    useEffect(() => {
        setResult([])
        setCount(0)
        setDuration(0)
        setExplain('')
        setError('')
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [db])

    const explainPipeline = useCallback(async () => {
        if (!db || !collection) return
        setBusy(true)
        setError('')
        try {
            setExplain(await API.mongoAggregateExplain(id, db, collection, pipeline))
        } catch (e) {
            setError(errorMessage(e))
        } finally {
            setBusy(false)
        }
    }, [id, db, collection, pipeline])

    if (!collection) {
        return <div className={`${sh.mongoEmpty}`}>请选择左侧集合以运行聚合管道</div>
    }

    return (
        <div>
            <div className={sh.mongoToolbar}>
                <button className={`${g.btn} ${g.primary}`} disabled={busy} onClick={run}>
                    <Play size={13}/> 运行聚合
                </button>
                <button className={g.btn} disabled={busy} onClick={explainPipeline}>执行计划</button>
                <label className={sh.mongoRow} style={{gap: 4, fontSize: 12, color: sh.mongoDim}}>
                    <input type="checkbox" checked={allowDisk} onChange={e => setAllowDisk(e.target.checked)}/> 允许磁盘使用
                </label>
                <label className={sh.mongoRow} style={{gap: 4, fontSize: 12, color: sh.mongoDim}}>
                    超时(ms)
                    <input className={sh.mongoInput} style={{width: 80}} type="number" value={maxTime}
                           onChange={e => setMaxTime(Number(e.target.value) || 0)}/>
                </label>
                <span className={g.spacer}/>
                {error && <span className={g.formError}>{error}</span>}
                <span className={sh.mongoBadge}>结果 {count} 条 · {duration}ms</span>
            </div>

            <label className={sh.mongoField}>
                <span>聚合管道（JSON 数组，每个元素是一个阶段）</span>
                <CodeEditor lang="json" height="300px" value={pipeline} onChange={setPipeline}/>
            </label>

            {result.length > 0 && (
                <>
                    <div className={sh.mongoH}>结果</div>
                    <div className={sh.mongoGridWrap}>
                        <table className={sh.mongoTable}>
                            <thead>
                            <tr><th style={{width: 40}}>#</th><th>文档（Extended JSON）</th></tr>
                            </thead>
                            <tbody>
                            {result.map((raw, i) => (
                                <tr key={i}><td>{i + 1}</td><td style={{maxWidth: 520}}>{raw}</td></tr>
                            ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}

            {explain && (
                <>
                    <div className={sh.mongoH}>执行计划</div>
                    <pre className={sh.mongoJson}>{formatExplain(explain)}</pre>
                </>
            )}
        </div>
    )
}

function formatExplain(text: string): string {
    try {
        return JSON.stringify(JSON.parse(text), null, 2)
    } catch {
        return text
    }
}
