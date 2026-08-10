import React, {useCallback, useEffect, useRef, useState} from 'react'
import Icon from '../../components/Icon'
import {API, subscribe} from '../../api'
import {errorMessage} from '../../utils'
import {MongoSessionInfo, MongoChangeEvent} from '../../types'
import CodeEditor from '../../components/CodeEditor'
import sh from './mongoShared.module.less'
import g from '../../styles/global.module.less'

interface Props {
    session: MongoSessionInfo
    db: string
    collection: string | null
    onNotify: (msg: string, kind?: 'info' | 'error') => void
}

function pretty(text: string): string {
    try {
        return JSON.stringify(JSON.parse(text), null, 2)
    } catch {
        return text
    }
}

export default function ChangeStreamTab({session, db, collection, onNotify}: Props) {
    const [scope, setScope] = useState<'deployment' | 'database' | 'collection'>('collection')
    const [pipeline, setPipeline] = useState('[]')
    const [fullDoc, setFullDoc] = useState('default')
    const [watching, setWatching] = useState(false)
    const [watchKey, setWatchKey] = useState('')
    const [events, setEvents] = useState<MongoChangeEvent[]>([])
    const [busy, setBusy] = useState(false)
    const id = session.id
    const subRef = useRef<(() => void) | null>(null)

    const clearSub = () => {
        if (subRef.current) {
            subRef.current()
            subRef.current = null
        }
    }

    useEffect(() => {
        subRef.current = subscribe('mongo:change:' + id, (evt: MongoChangeEvent) => {
            if (evt.error) {
                onNotify('变更流错误：' + evt.error, 'error')
                return
            }
            setEvents((prev) => [evt, ...prev].slice(0, 200))
        })
        return () => clearSub()
    }, [id, onNotify])

    // 切换库时清空上一个库的事件列表
    useEffect(() => {
        setEvents([])
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [db])

    const start = useCallback(async () => {
        setBusy(true)
        try {
            const key = await API.mongoWatch(id, scope, db, collection || '', pipeline, fullDoc)
            setWatchKey(key)
            setWatching(true)
            setEvents([])
            onNotify('已开启变更流监听：' + key)
        } catch (e) {
            onNotify(errorMessage(e), 'error')
        } finally {
            setBusy(false)
        }
    }, [id, scope, db, collection, pipeline, fullDoc, onNotify])

    const stop = useCallback(async () => {
        try {
            if (watchKey) await API.mongoUnwatch(id, watchKey)
        } catch {
            /* ignore */
        }
        setWatching(false)
        setWatchKey('')
    }, [id, watchKey])

    return (
        <div>
            <div className={sh.mongoToolbar}>
                {!watching ? (
                    <button className={`${g.btn} ${g.primary}`} disabled={busy || (scope !== 'deployment' && !db)} onClick={start}>
                        <Icon name="play" size={13}/> 开始监听
                    </button>
                ) : (
                    <button className={g.btn} disabled={busy} onClick={stop}>
                        <Icon name="close" size={13}/> 停止监听
                    </button>
                )}
                <label className={sh.mongoRow} style={{gap: 4, fontSize: 12, color: sh.mongoDim}}>
                    范围
                    <select className={sh.mongoSelect} style={{width: 120}} value={scope} onChange={e => setScope(e.target.value as any)}>
                        <option value="deployment">集群</option>
                        <option value="database">数据库</option>
                        <option value="collection">集合</option>
                    </select>
                </label>
                <label className={sh.mongoRow} style={{gap: 4, fontSize: 12, color: sh.mongoDim}}>
                    完整文档
                    <select className={sh.mongoSelect} style={{width: 140}} value={fullDoc} onChange={e => setFullDoc(e.target.value)}>
                        <option value="default">默认</option>
                        <option value="updateLookup">updateLookup</option>
                        <option value="whenAvailable">whenAvailable</option>
                        <option value="required">required</option>
                    </select>
                </label>
                <span className={g.spacer}/>
                {watching && <span className={`${sh.mongoBadge} ok`}>监听中 · {events.length} 事件</span>}
            </div>

            {(scope === 'database' || scope === 'collection') && !db && (
                <div className={sh.mongoEmpty}>请先在左上角选择数据库{scope === 'collection' ? '与集合' : ''}</div>
            )}

            <label className={sh.mongoField}>
                <span>变更流管道（可选，JSON 数组，如只关心 insert）</span>
                <CodeEditor lang="json" height="72px" value={pipeline} onChange={setPipeline}
                            placeholder='[ { "$match": { "operationType": "insert" } } ]'/>
            </label>

            {events.length === 0 ? (
                <div className={`${sh.mongoEmpty}`}>暂无变更事件</div>
            ) : (
                <div className={sh.mongoGridWrap}>
                    <table className={sh.mongoTable}>
                        <thead>
                        <tr><th style={{width: 40}}>#</th><th>操作</th><th>命名空间</th><th>时间</th><th>文档</th></tr>
                        </thead>
                        <tbody>
                        {events.map((ev, i) => (
                            <tr key={i}>
                                <td>{i + 1}</td>
                                <td>{ev.operation}</td>
                                <td style={{maxWidth: 200}}>{ev.ns}</td>
                                <td>{new Date(ev.ts).toLocaleTimeString()}</td>
                                <td style={{maxWidth: 420}}>{ev.document}</td>
                            </tr>
                        ))}
                        </tbody>
                    </table>
                </div>
            )}

            {events.length > 0 && (
                <>
                    <div className={sh.mongoH}>最近事件详情</div>
                    <pre className={sh.mongoJson}>{pretty(events[0].document)}</pre>
                </>
            )}
        </div>
    )
}
