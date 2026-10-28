import {useCallback, useEffect, useRef, useState} from 'react'
import { Select, Button, Space, Tag, App } from 'antd'
import {Play, X} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {API, subscribe} from '@/api'
import {errorMessage} from '@/utils'
import {MongoSessionInfo, MongoChangeEvent} from '@/types'
import CodeEditor from '@/components/CodeEditor'
import sh from '@/pages/mongo/mongoShared.module.less'

interface Props {
    session: MongoSessionInfo
    db: string
    collection: string | null
}

function pretty(text: string): string {
    try {
        return JSON.stringify(JSON.parse(text), null, 2)
    } catch {
        return text
    }
}

export default function ChangeStreamTab({session, db, collection}: Props) {
    const { t } = useTranslation(['db', 'common'])
    const { message } = App.useApp()
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

    const watchKeyRef = useRef('')
    watchKeyRef.current = watchKey

    useEffect(() => {
        subRef.current = subscribe('mongo:change:' + id, (evt: MongoChangeEvent) => {
            if (evt.error) {
                message.error(t('mongo.stream.errorMsg', { error: evt.error, defaultValue: '变更流错误：' + evt.error }))
                return
            }
            setEvents((prev) => [evt, ...prev].slice(0, 200))
        })
        return () => {
            clearSub()
            if (watchKeyRef.current) {
                API.mongoUnwatch(id, watchKeyRef.current).catch(() => undefined)
            }
        }
    }, [id, t, message])

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
            message.success(t('mongo.stream.started', { key, defaultValue: '已开启变更流监听：' + key }))
        } catch (e) {
            message.error(errorMessage(e))
        } finally {
            setBusy(false)
        }
    }, [id, scope, db, collection, pipeline, fullDoc, t, message])

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
            <div className={sh.mongoRow}>
                {!watching ? (
                    <Button type="primary" size="small" icon={<Play size={13}/>} disabled={busy} onClick={start}>
                        {t('mongo.stream.startWatch', '开始监听')}
                    </Button>
                ) : (
                    <Button danger size="small" icon={<X size={13}/>} disabled={busy} onClick={stop}>
                        {t('mongo.stream.stopWatch', '停止监听')}
                    </Button>
                )}
                <Space size={6}>
                    <span className={sh.mongoDim}>{t('mongo.stream.scopeLabel', '范围')}</span>
                    <Select
                        size="small"
                        style={{ width: 100 }}
                        value={scope}
                        onChange={v => setScope(v as any)}
                        options={[
                            { value: 'deployment', label: t('mongo.stream.scopeDeployment', '集群') },
                            { value: 'database', label: t('mongo.stream.scopeDatabase', '数据库') },
                            { value: 'collection', label: t('mongo.stream.scopeCollection', '集合') },
                        ]}
                    />
                </Space>
                <Space size={6}>
                    <span className={sh.mongoDim}>{t('mongo.stream.fullDocLabel', '完整文档')}</span>
                    <Select
                        size="small"
                        style={{ width: 130 }}
                        value={fullDoc}
                        onChange={setFullDoc}
                        options={[
                            { value: 'default', label: t('mongo.stream.fullDocDefault', '默认') },
                            { value: 'updateLookup', label: 'updateLookup' },
                            { value: 'whenAvailable', label: 'whenAvailable' },
                            { value: 'required', label: 'required' },
                        ]}
                    />
                </Space>
                <span className={sh.toolbarRight}>
                    {watching && <Tag color="processing">{t('mongo.stream.watchingTag', { count: events.length, defaultValue: `监听中 · ${events.length} 事件` })}</Tag>}
                </span>
            </div>

            {(scope === 'database' || scope === 'collection') && !db && (
                <div className={sh.mongoEmpty}>{t('mongo.stream.selectDbCollHint', { detail: scope === 'collection' ? t('mongo.stream.andCollection', '与集合') : '', defaultValue: `请先在左上角选择数据库${scope === 'collection' ? '与集合' : ''}` })}</div>
            )}

            <label className={sh.mongoField}>
                <span>{t('mongo.stream.pipelineLabel', '变更流管道（可选，JSON 数组，如只关心 insert）')}</span>
                <CodeEditor lang="json" height="72px" value={pipeline} onChange={setPipeline}
                            placeholder='[ { "$match": { "operationType": "insert" } } ]'/>
            </label>

            {events.length === 0 ? (
                <div className={`${sh.mongoEmpty}`}>{t('mongo.stream.noEvents', '暂无变更事件')}</div>
            ) : (
                <div className={sh.mongoGridWrap}>
                    <table className={sh.mongoTable}>
                        <thead>
                        <tr>
                            <th style={{width: 40}}>#</th>
                            <th>{t('mongo.stream.colOp', '操作')}</th>
                            <th>{t('mongo.stream.colNs', '命名空间')}</th>
                            <th>{t('mongo.stream.colTime', '时间')}</th>
                            <th>{t('mongo.stream.colDoc', '文档')}</th>
                        </tr>
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
                    <div className={sh.mongoH}>{t('mongo.stream.latestDetail', '最近事件详情')}</div>
                    <pre className={sh.mongoJson}>{pretty(events[0].document)}</pre>
                </>
            )}
        </div>
    )
}
