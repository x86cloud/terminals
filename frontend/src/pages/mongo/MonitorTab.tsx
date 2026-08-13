import React, {useCallback, useEffect, useState} from 'react'
import { RotateCw } from 'lucide-react'
import {API} from '@/api'
import {errorMessage} from '@/utils'
import {MongoSessionInfo, MongoHealthInfo, MongoServerStatus} from '@/types'
import sh from '@/pages/mongo/mongoShared.module.less'
import g from '@/styles/global.module.less'

interface Props {
    session: MongoSessionInfo
    onNotify: (msg: string, kind?: 'info' | 'error') => void
}

function fmt(v: any): string {
    if (v == null) return ''
    if (typeof v === 'object') {
        try {
            return JSON.stringify(v)
        } catch {
            return String(v)
        }
    }
    return String(v)
}

function KVTable({title, obj}: { title: string; obj: any }) {
    if (!obj) return null
    const entries = Object.entries(obj as Record<string, any>)
    if (!entries.length) return null
    return (
        <>
            <div className={sh.mongoH}>{title}</div>
            <table className={sh.mongoKV}>
                <tbody>
                {entries.map(([k, v]) => (
                    <tr key={k}><th>{k}</th><td style={{maxWidth: 480}}>{fmt(v)}</td></tr>
                ))}
                </tbody>
            </table>
        </>
    )
}

export default function MonitorTab({session, onNotify}: Props) {
    const [health, setHealth] = useState<MongoHealthInfo | null>(null)
    const [status, setStatus] = useState<MongoServerStatus | null>(null)
    const [client, setClient] = useState<Record<string, any>>({})
    const [ops, setOps] = useState<string[]>([])
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')

    const id = session.id

    const load = useCallback(async () => {
        setBusy(true)
        setError('')
        try {
            const [h, st, cl, op] = await Promise.all([
                API.mongoHealthCheck(id).catch(() => null),
                API.mongoServerStatus(id).catch(() => null),
                API.mongoClientStats(id).catch(() => ({} as Record<string, any>)),
                API.mongoCurrentOps(id).catch(() => [] as string[]),
            ])
            setHealth(h)
            setStatus(st)
            setClient(cl)
            setOps(op)
        } catch (e) {
            setError(errorMessage(e))
            onNotify(errorMessage(e), 'error')
        } finally {
            setBusy(false)
        }
    }, [id, onNotify])

    useEffect(() => {
        void load()
    }, [load])

    return (
        <div>
            <div className={sh.mongoToolbar}>
                <button className={`${g.btn} ${g.primary}`} disabled={busy} onClick={load}>
                    <RotateCw size={13}/> 刷新监控
                </button>
                <span className={g.spacer}/>
                {error && <span className={g.formError}>{error}</span>}
                {health && (
                    health.ok ? (
                        <span className={`${sh.mongoBadge} ok`}>健康 · 延迟 {health.latencyMs}ms</span>
                    ) : (
                        <span className={`${sh.mongoBadge} danger`}>异常 · {health.error}</span>
                    )
                )}
            </div>

            {health && (
                <>
                    <div className={sh.mongoH}>健康检查</div>
                    <div className={sh.mongoRow} style={{gap: 10, marginBottom: 8}}>
                        <div className={sh.mongoStatCard}><div className="k">拓扑</div><div className="v">{health.topology || '-'}</div></div>
                        <div className={sh.mongoStatCard}><div className="k">版本</div><div className="v">{health.version || '-'}</div></div>
                        <div className={sh.mongoStatCard}><div className="k">主节点</div><div className="v">{health.primary ? '是' : '否'}</div></div>
                        <div className={sh.mongoStatCard}><div className="k">副本集</div><div className="v">{health.setName || '-'}</div></div>
                    </div>
                    {health.hosts && health.hosts.length > 0 && (
                        <div className={sh.mongoRow} style={{flexWrap: 'wrap', marginBottom: 6}}>
                            {health.hosts.map((h) => (
                                <span key={h} className={sh.mongoBadge}>{h}</span>
                            ))}
                        </div>
                    )}
                </>
            )}

            <div className={sh.mongoH}>客户端性能监控（连接侧统计）</div>
            <div className={sh.mongoRow} style={{gap: 10, marginBottom: 8}}>
                <div className={sh.mongoStatCard}><div className="k">操作数</div><div className="v">{client.ops ?? 0}</div></div>
                <div className={sh.mongoStatCard}><div className="k">失败数</div><div className="v">{client.failures ?? 0}</div></div>
                <div className={sh.mongoStatCard}><div className="k">慢操作(&gt;100ms)</div><div className="v">{client.slowOps ?? 0}</div></div>
                <div className={sh.mongoStatCard}><div className="k">平均耗时(ms)</div><div className="v">{(client.avgMs ?? 0).toFixed(2)}</div></div>
                <div className={sh.mongoStatCard}><div className="k">最大连接池</div><div className="v">{client.maxPoolSize ?? '-'}</div></div>
            </div>

            {status && (
                <>
                    <KVTable title="serverStatus（关键指标）" obj={{
                        host: status.host,
                        version: status.version,
                        uptime: status.uptime,
                        process: status.process,
                    }}/>
                    <KVTable title="连接 (connections)" obj={status.connections}/>
                    <KVTable title="网络 (network)" obj={status.network}/>
                    <KVTable title="操作计数 (opcounters)" obj={status.opcounters}/>
                    <KVTable title="内存 (mem)" obj={status.mem}/>
                    <KVTable title="全局锁 (globalLock)" obj={status.globalLock}/>
                </>
            )}

            <div className={sh.mongoH}>当前操作（$currentOp）</div>
            {ops.length === 0 ? (
                <div className={`${sh.mongoEmpty}`}>暂无活动操作</div>
            ) : (
                <div className={sh.mongoGridWrap}>
                    <table className={sh.mongoTable}>
                        <thead><tr><th style={{width: 40}}>#</th><th>操作</th></tr></thead>
                        <tbody>
                        {ops.map((o, i) => (
                            <tr key={i}><td>{i + 1}</td><td style={{maxWidth: 560}}>{o}</td></tr>
                        ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    )
}
