import React, {useCallback, useEffect, useMemo, useState} from 'react'
import {API, subscribe} from '../api'
import Icon from './Icon'
import CodeEditor from './CodeEditor'
import {errorMessage} from '../utils'
import {ApiAuth, ApiHeader, ApiHistoryItem, ApiMethod, ApiRequest, ApiResponse, ApiMode, WsStatus, WsMessage} from '../types'
import g from '../styles/global.module.less'
import a from '../styles/ApiClient.module.less'

const METHODS: ApiMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']
const BODY_TYPES: Array<{ value: string; label: string; ct: string }> = [
    {value: 'none', label: '无', ct: ''},
    {value: 'json', label: 'JSON', ct: 'application/json'},
    {value: 'text', label: '文本', ct: 'text/plain'},
    {value: 'xml', label: 'XML', ct: 'application/xml'},
]

const HISTORY_KEY = 'api_client_history'

function emptyAuth(): ApiAuth {
    return {type: 'none', username: '', password: '', token: ''}
}

function statusClass(code: number, hasError: boolean): string {
    if (hasError) return a.statusError
    if (code >= 200 && code < 300) return a.statusOk
    if (code >= 300 && code < 400) return a.statusRedirect
    if (code >= 400 && code < 500) return a.statusClientErr
    if (code >= 500) return a.statusServerErr
    return a.statusUnknown
}

function looksLikeJson(s: string): boolean {
    const t = s.trim()
    return (t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'))
}

export default function ApiClient({onClose}: { onClose: () => void }) {
    const [method, setMethod] = useState<ApiMethod>('GET')
    const [url, setUrl] = useState('')
    const [headers, setHeaders] = useState<ApiHeader[]>([])
    const [bodyType, setBodyType] = useState('none')
    const [body, setBody] = useState('')
    const [auth, setAuth] = useState<ApiAuth>(emptyAuth())
    const [timeoutMs, setTimeoutMs] = useState(30000)
    const [insecureTLS, setInsecureTLS] = useState(false)
    const [followRedirects, setFollowRedirects] = useState(true)

    const [configTab, setConfigTab] = useState<'headers' | 'body' | 'auth' | 'options' | 'messages'>('headers')
    const [showConfig, setShowConfig] = useState(true)

    const [sending, setSending] = useState(false)
    const [error, setError] = useState('')
    const [response, setResponse] = useState<ApiResponse | null>(null)
    const [respTab, setRespTab] = useState<'body' | 'headers'>('body')
    const [bodyPretty, setBodyPretty] = useState(true)
    const [history, setHistory] = useState<ApiHistoryItem[]>(() => {
        try {
            const raw = localStorage.getItem(HISTORY_KEY)
            const parsed = raw ? JSON.parse(raw) : []
            return Array.isArray(parsed) ? parsed : []
        } catch {
            return []
        }
    })
    const [showHistory, setShowHistory] = useState(true)

    // WebSocket 模式相关状态
    const [mode, setMode] = useState<ApiMode>('http')
    const [wsConnId, setWsConnId] = useState<string | null>(null)
    const [wsStatus, setWsStatus] = useState<WsStatus>('idle')
    const [wsMessages, setWsMessages] = useState<WsMessage[]>([])
    const [wsInput, setWsInput] = useState('')
    const [wsProtocols, setWsProtocols] = useState('')
    const [wsConnecting, setWsConnecting] = useState(false)

    useEffect(() => {
        try {
            localStorage.setItem(HISTORY_KEY, JSON.stringify(history))
        } catch {
            /* 忽略写入失败（如隐私模式/容量受限） */
        }
    }, [history])

    const allowBody = method !== 'GET' && method !== 'HEAD'

    const buildRequest = useCallback((): ApiRequest => {
        const reqHeaders = headers.filter((h) => h.enabled && h.name.trim())
        if (bodyType !== 'none' && body.trim()) {
            const ct = BODY_TYPES.find((t) => t.value === bodyType)?.ct ?? ''
            if (ct && !reqHeaders.some((h) => h.name.toLowerCase() === 'content-type')) {
                reqHeaders.push({name: 'Content-Type', value: ct, enabled: true})
            }
        }
        return {
            method,
            url: /^https?:\/\//i.test(url.trim()) ? url.trim() : 'http://' + url.trim(),
            headers: reqHeaders,
            body: bodyType === 'none' ? '' : body,
            timeoutMs,
            insecureTLS,
            followRedirects,
            auth,
        }
    }, [headers, bodyType, body, method, url, timeoutMs, insecureTLS, followRedirects, auth])

    const doSend = useCallback(async () => {
        const raw = url.trim()
        if (!raw) {
            setError('请输入请求地址')
            return
        }
        const target = /^https?:\/\//i.test(raw) ? raw : 'http://' + raw
        if (target !== url) setUrl(target)
        setError('')
        setSending(true)
        try {
            const res = await API.apiRequest(buildRequest())
            setResponse(res)
            setRespTab('body')
            setHistory((h) => [
                {
                    method,
                    url: target,
                    statusCode: res.statusCode,
                    durationMs: res.durationMs,
                    at: Date.now(),
                    error: res.error,
                },
                ...h,
            ].slice(0, 30))
        } catch (e) {
            setError(errorMessage(e))
        } finally {
            setSending(false)
        }
    }, [url, buildRequest, method])

    // ---- WebSocket 逻辑 ----
    const wsSwitchMode = useCallback((next: ApiMode) => {
        setMode(next)
        if (next === 'ws') {
            setConfigTab('messages')
        } else {
            setConfigTab('headers')
        }
    }, [])

    useEffect(() => {
        if (!wsConnId) return
        const offMsg = subscribe(`ws:message:${wsConnId}`, (ev: WsMessage) => {
            setWsMessages((list) => [...list, ev].slice(-500))
        })
        const offStatus = subscribe(`ws:status:${wsConnId}`, (ev: { status: WsStatus; error: string }) => {
            setWsStatus(ev.status === 'open' ? 'open' : 'closed')
            if (ev.error) setError(ev.error)
        })
        return () => {
            offMsg()
            offStatus()
        }
    }, [wsConnId])

    const wsConnect = useCallback(async () => {
        const raw = url.trim()
        if (!raw) {
            setError('请输入 WebSocket 地址')
            return
        }
        const target = /^wss?:\/\//i.test(raw) ? raw : 'ws://' + raw
        if (target !== url) setUrl(target)
        setError('')
        setWsConnecting(true)
        setWsStatus('connecting')
        try {
            const res = await API.wsConnect(
                target,
                headers.filter((h) => h.enabled && h.name.trim()),
                insecureTLS,
                auth,
                wsProtocols.split(',').map((p) => p.trim()).filter(Boolean)
            )
            if (res.error) {
                setWsStatus('error')
                setError(res.error)
                return
            }
            setWsConnId(res.id)
            setWsStatus('open')
            setWsMessages([])
        } catch (e) {
            setWsStatus('error')
            setError(errorMessage(e))
        } finally {
            setWsConnecting(false)
        }
    }, [url, headers, insecureTLS, auth, wsProtocols])

    const wsDisconnect = useCallback(() => {
        if (wsConnId) API.wsClose(wsConnId)
        setWsConnId(null)
        setWsStatus('closed')
    }, [wsConnId])

    const wsSendMsg = useCallback(async () => {
        const msg = wsInput
        if (!wsConnId || !msg) return
        try {
            await API.wsSend(wsConnId, msg)
            setWsInput('')
        } catch (e) {
            setError(errorMessage(e))
        }
    }, [wsConnId, wsInput])

    const wsClear = useCallback(() => setWsMessages([]), [])

    const formatJsonBody = useCallback(() => {
        if (bodyType !== 'json') return
        try {
            setBody(JSON.stringify(JSON.parse(body), null, 2))
        } catch {
            setError('请求体不是合法的 JSON')
        }
    }, [body, bodyType])

    const prettyBody = useMemo(() => {
        if (!response?.body) return ''
        if (bodyPretty) {
            const ct = Object.entries(response.headers).find(
                ([k]) => k.toLowerCase() === 'content-type'
            )?.[1] ?? ''
            if (ct.includes('json') || looksLikeJson(response.body)) {
                try {
                    return JSON.stringify(JSON.parse(response.body), null, 2)
                } catch {
                    /* fall through */
                }
            }
        }
        return response.body
    }, [response, bodyPretty])

    const addHeader = () => setHeaders((h) => [...h, {name: '', value: '', enabled: true}])
    const updateHeader = (i: number, patch: Partial<ApiHeader>) =>
        setHeaders((h) => h.map((x, idx) => (idx === i ? {...x, ...patch} : x)))
    const removeHeader = (i: number) => setHeaders((h) => h.filter((_, idx) => idx !== i))

    const copy = (text: string) => {
        if (navigator.clipboard) navigator.clipboard.writeText(text).catch(() => {})
    }

    const loadHistory = (item: ApiHistoryItem) => {
        setMethod(item.method)
        setUrl(item.url)
        setShowConfig(true)
    }

    const deleteHistory = (idx: number) =>
        setHistory((h) => h.filter((_, i) => i !== idx))

    const clearHistory = () => {
        if (history.length === 0) return
        if (window.confirm('确定清空全部请求历史？')) setHistory([])
    }

    const respHeaders = response ? Object.entries(response.headers) : []

    const respLang: 'json' | 'plain' = useMemo(() => {
        if (!response) return 'plain'
        const ct = respHeaders.find(([k]) => k.toLowerCase() === 'content-type')?.[1] ?? ''
        if (ct.toLowerCase().includes('json') || looksLikeJson(prettyBody)) return 'json'
        return 'plain'
    }, [response, prettyBody, respHeaders])

    return (
        <div className={a.apiPane}>
            {showHistory && (
                <aside className={a.historyPanel}>
                    <div className={a.historyHead}>
                        <span className={a.historyTitle}>请求历史</span>
                        <span className={a.historyCount}>{history.length}</span>
                        <span className={g.spacer}/>
                        <button className={g.iconBtn} title="清空历史" onClick={clearHistory}>
                            <Icon name="trash" size={14}/>
                        </button>
                        <button className={g.iconBtn} title="关闭历史" onClick={() => setShowHistory(false)}>
                            <Icon name="close" size={14}/>
                        </button>
                    </div>
                    <div className={a.historyList}>
                        {history.length === 0 && <div className={a.respEmpty}>暂无历史记录</div>}
                        {history.map((h, i) => (
                            <div key={h.at || i} className={a.historyItem} title={h.url} onClick={() => loadHistory(h)}>
                                <div className={a.historyTop}>
                                    <span className={`${a.historyMethod} ${a['m_' + h.method]}`}>{h.method}</span>
                                    {h.error ? (
                                        <span className={a.historyErr}>失败</span>
                                    ) : (
                                        <span className={a.historyCode}>{h.statusCode}</span>
                                    )}
                                    <button
                                        className={a.historyDel}
                                        title="删除"
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            deleteHistory(i)
                                        }}
                                    >
                                        <Icon name="close" size={12}/>
                                    </button>
                                </div>
                                <span className={a.historyUrl}>{h.url}</span>
                            </div>
                        ))}
                    </div>
                </aside>
            )}
            <div className={a.apiMain}>
            {/* 请求工具条 */}
            <div className={a.apiToolbar}>
                <button
                    className={g.iconBtn}
                    title={showHistory ? '隐藏历史' : '显示历史'}
                    onClick={() => setShowHistory((v) => !v)}
                >
                    <Icon name="panel" size={15}/>
                </button>
                <div className={a.modeToggle}>
                    <button
                        className={mode === 'http' ? a.modeActive : ''}
                        onClick={() => wsSwitchMode('http')}
                    >HTTP</button>
                    <button
                        className={mode === 'ws' ? a.modeActive : ''}
                        onClick={() => wsSwitchMode('ws')}
                    >WebSocket</button>
                </div>
                {mode === 'http' && (
                    <select
                        className={a.methodSelect}
                        value={method}
                        onChange={(e) => setMethod(e.target.value as ApiMethod)}
                    >
                        {METHODS.map((m) => (
                            <option key={m} value={m}>{m}</option>
                        ))}
                    </select>
                )}
                <input
                    className={a.urlInput}
                    placeholder={mode === 'ws' ? 'ws://example.com/ws' : 'https://example.com/api/v1/resource'}
                    value={url}
                    spellCheck={false}
                    onChange={(e) => setUrl(e.target.value)}
                    onKeyDown={(e) => {
                        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                            e.preventDefault()
                            if (mode === 'ws') {
                                if (wsStatus === 'open') wsSendMsg()
                                else wsConnect()
                            } else {
                                doSend()
                            }
                        }
                    }}
                />
                {mode === 'ws' ? (
                    wsStatus === 'open' ? (
                        <button className={`${g.btn} ${g.danger}`} onClick={wsDisconnect}>
                            断开
                        </button>
                    ) : (
                        <button
                            className={`${g.btn} ${g.primary}`}
                            disabled={wsConnecting}
                            onClick={wsConnect}
                        >
                            {wsConnecting ? '连接中…' : '连接'}
                        </button>
                    )
                ) : (
                    <button
                        className={`${g.btn} ${g.primary}`}
                        disabled={sending}
                        onClick={doSend}
                    >
                        {sending ? '请求中…' : '发送'}
                    </button>
                )}
                <button
                    className={`${g.iconBtn} ${a.toolClose}`}
                    title="关闭"
                    onClick={onClose}
                >
                    <Icon name="close" size={15}/>
                </button>
            </div>

            {/* 配置区折叠 */}
            <div className={a.configBar}>
                <div className={`${g.segmented} ${g.sm}`}>
                    {mode === 'ws' ? (
                        <>
                            <button
                                className={configTab === 'messages' ? g.active : ''}
                                onClick={() => {
                                    setShowConfig(true)
                                    setConfigTab('messages')
                                }}
                            >消息</button>
                            <button
                                className={configTab === 'headers' ? g.active : ''}
                                onClick={() => {
                                    setShowConfig(true)
                                    setConfigTab('headers')
                                }}
                            >请求头</button>
                            <button
                                className={configTab === 'auth' ? g.active : ''}
                                onClick={() => {
                                    setShowConfig(true)
                                    setConfigTab('auth')
                                }}
                            >鉴权</button>
                            <button
                                className={configTab === 'options' ? g.active : ''}
                                onClick={() => {
                                    setShowConfig(true)
                                    setConfigTab('options')
                                }}
                            >选项</button>
                        </>
                    ) : (
                        <>
                            <button
                                className={configTab === 'headers' ? g.active : ''}
                                onClick={() => {
                                    setShowConfig(true)
                                    setConfigTab('headers')
                                }}
                            >请求头</button>
                            <button
                                className={configTab === 'body' ? g.active : ''}
                                onClick={() => {
                                    setShowConfig(true)
                                    setConfigTab('body')
                                }}
                            >请求体</button>
                            <button
                                className={configTab === 'auth' ? g.active : ''}
                                onClick={() => {
                                    setShowConfig(true)
                                    setConfigTab('auth')
                                }}
                            >鉴权</button>
                            <button
                                className={configTab === 'options' ? g.active : ''}
                                onClick={() => {
                                    setShowConfig(true)
                                    setConfigTab('options')
                                }}
                            >选项</button>
                        </>
                    )}
                </div>
                <span className={g.spacer}/>
                <button
                    className={`${g.btn} ${g.sm}`}
                    onClick={() => setShowConfig((v) => !v)}
                >
                    {showConfig ? '收起' : '展开'}
                </button>
            </div>

            {showConfig && (
                <div className={`${a.configBody} ${mode === 'ws' && configTab === 'messages' ? a.configBodyWs : ''}`}>
                    {configTab === 'headers' && (
                        <div className={a.headersEditor}>
                            {headers.length === 0 && (
                                <div className={`${a.emptyHint} ${a.small}`}>暂无请求头，点击「添加」新增</div>
                            )}
                            {headers.map((h, i) => (
                                <div key={i} className={a.headerRow}>
                                    <input
                                        type="checkbox"
                                        checked={h.enabled}
                                        title="启用"
                                        onChange={(e) => updateHeader(i, {enabled: e.target.checked})}
                                    />
                                    <input
                                        className={a.headerName}
                                        placeholder="Header"
                                        value={h.name}
                                        spellCheck={false}
                                        onChange={(e) => updateHeader(i, {name: e.target.value})}
                                    />
                                    <input
                                        className={a.headerValue}
                                        placeholder="Value"
                                        value={h.value}
                                        spellCheck={false}
                                        onChange={(e) => updateHeader(i, {value: e.target.value})}
                                    />
                                    <button
                                        className={`${g.iconBtn} ${g.danger}`}
                                        title="删除"
                                        onClick={() => removeHeader(i)}
                                    >
                                        <Icon name="trash" size={13}/>
                                    </button>
                                </div>
                            ))}
                            <button className={`${g.btn} ${g.sm}`} onClick={addHeader}>
                                <Icon name="plus" size={13}/> 添加请求头
                            </button>
                        </div>
                    )}

                    {configTab === 'body' && (
                        <div className={a.bodyEditor}>
                            <div className={a.bodyTypeRow}>
                                <span className={a.label}>类型</span>
                                <select
                                    className={a.bodyTypeSelect}
                                    value={bodyType}
                                    onChange={(e) => setBodyType(e.target.value)}
                                >
                                    {BODY_TYPES.map((t) => (
                                        <option key={t.value} value={t.value}>{t.label}</option>
                                    ))}
                                </select>
                                {bodyType !== 'none' && (
                                    <button
                                        className={`${g.btn} ${g.sm}`}
                                        disabled={!allowBody}
                                        title={allowBody ? '格式化 JSON' : '当前方法不支持请求体'}
                                        onClick={formatJsonBody}
                                    >
                                        格式化
                                    </button>
                                )}
                                {!allowBody && <span className={a.warnText}>该方法通常不含请求体</span>}
                            </div>
                            <CodeEditor
                                value={body}
                                onChange={setBody}
                                lang={bodyType === 'json' ? 'json' : 'plain'}
                                height="200px"
                                readOnly={bodyType === 'none'}
                                placeholder={bodyType === 'none' ? '请先选择请求体类型' : '在此输入请求体内容'}
                                onModEnter={() => doSend()}
                            />
                        </div>
                    )}

                    {configTab === 'auth' && (
                        <div className={a.authEditor}>
                            <div className={a.authRow}>
                                <span className={a.label}>类型</span>
                                <select
                                    className={a.authTypeSelect}
                                    value={auth.type}
                                    onChange={(e) => setAuth((x) => ({...x, type: e.target.value as ApiAuth['type']}))}
                                >
                                    <option value="none">无</option>
                                    <option value="basic">Basic</option>
                                    <option value="bearer">Bearer Token</option>
                                </select>
                            </div>
                            {auth.type === 'basic' && (
                                <>
                                    <div className={a.authRow}>
                                        <span className={a.label}>用户名</span>
                                        <input
                                            className={a.authInput}
                                            value={auth.username}
                                            onChange={(e) => setAuth((x) => ({...x, username: e.target.value}))}
                                        />
                                    </div>
                                    <div className={a.authRow}>
                                        <span className={a.label}>密码</span>
                                        <input
                                            type="password"
                                            className={a.authInput}
                                            value={auth.password}
                                            onChange={(e) => setAuth((x) => ({...x, password: e.target.value}))}
                                        />
                                    </div>
                                </>
                            )}
                            {auth.type === 'bearer' && (
                                <div className={a.authRow}>
                                    <span className={a.label}>Token</span>
                                    <input
                                        className={a.authInput}
                                        value={auth.token}
                                        onChange={(e) => setAuth((x) => ({...x, token: e.target.value}))}
                                    />
                                </div>
                            )}
                        </div>
                    )}

                    {configTab === 'options' && (
                        <div className={a.optionsEditor}>
                            <div className={a.optRow}>
                                <span className={a.label}>超时(ms)</span>
                                <input
                                    type="number"
                                    className={a.optInput}
                                    min={0}
                                    value={timeoutMs}
                                    onChange={(e) => setTimeoutMs(Number(e.target.value) || 0)}
                                />
                            </div>
                            {mode === 'ws' && (
                                <div className={a.optRow}>
                                    <span className={a.label}>子协议</span>
                                    <input
                                        className={a.optInput}
                                        placeholder="逗号分隔，如 chat, json"
                                        value={wsProtocols}
                                        spellCheck={false}
                                        onChange={(e) => setWsProtocols(e.target.value)}
                                    />
                                </div>
                            )}
                            <label className={a.optCheck}>
                                <input
                                    type="checkbox"
                                    checked={followRedirects}
                                    onChange={(e) => setFollowRedirects(e.target.checked)}
                                />
                                自动跟随重定向
                            </label>
                            <label className={a.optCheck}>
                                <input
                                    type="checkbox"
                                    checked={insecureTLS}
                                    onChange={(e) => setInsecureTLS(e.target.checked)}
                                />
                                跳过 TLS 证书校验（不推荐）
                            </label>
                        </div>
                    )}

                    {configTab === 'messages' && (
                        <div className={a.wsPanel}>
                            <div className={a.wsBar}>
                                <span className={`${a.wsStatusDot} ${wsStatus === 'open' ? a.on : wsStatus === 'connecting' ? a.connecting : ''}`}/>
                                <span className={a.wsStatusText}>
                                    {wsStatus === 'open' ? '已连接' : wsStatus === 'connecting' ? '连接中…' : wsStatus === 'error' ? '连接失败' : '未连接'}
                                </span>
                                <span className={a.wsUrl} title={url}>{url}</span>
                                <span className={g.spacer}/>
                                <button className={`${g.btn} ${g.sm}`} onClick={wsClear}>清空消息</button>
                            </div>
                            <div className={a.wsMsgList}>
                                {wsMessages.length === 0 && <div className={a.respEmpty}>连接后收发消息会显示在这里</div>}
                                {wsMessages.map((m, i) => (
                                    <div key={i} className={`${a.wsMsg} ${a['w_' + m.dir]}`}>
                                        <div className={a.wsMsgHead}>
                                            <span className={a.wsDir}>{m.dir === 'in' ? '收' : m.dir === 'out' ? '发' : '系统'}</span>
                                            {m.type === 'binary' && <span className={a.wsBin}>二进制</span>}
                                            <span className={a.wsTime}>{new Date(m.ts).toLocaleTimeString()}</span>
                                        </div>
                                        <pre className={a.wsPayload} title={m.payload}>{m.payload}</pre>
                                    </div>
                                ))}
                            </div>
                            <div className={a.wsComposer}>
                                <textarea
                                    className={a.wsInput}
                                    placeholder={wsStatus === 'open' ? '输入要发送的消息，Ctrl+Enter 发送' : '请先建立连接'}
                                    value={wsInput}
                                    spellCheck={false}
                                    disabled={wsStatus !== 'open'}
                                    onChange={(e) => setWsInput(e.target.value)}
                                    onKeyDown={(e) => {
                                        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                                            e.preventDefault()
                                            wsSendMsg()
                                        }
                                    }}
                                />
                                <button
                                    className={`${g.btn} ${g.primary}`}
                                    disabled={wsStatus !== 'open' || !wsInput.trim()}
                                    onClick={wsSendMsg}
                                >发送</button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {error && <div className={a.errorBar}>{error}</div>}

            {/* 响应区（仅 HTTP 模式） */}
            {mode === 'http' && (
            <div className={a.responseArea}>
                <div className={a.respHead}>
                    {response ? (
                        <>
                            <span className={`${a.statusBadge} ${statusClass(response.statusCode, !!response.error)}`}>
                                {response.error ? 'ERR' : response.statusCode || '-'}
                            </span>
                            <span className={a.statusText}>
                                {response.error ? response.error : (response.status || '')}
                            </span>
                            <span className={a.respMeta}>{response.durationMs} ms</span>
                            <span className={a.respMeta}>
                                {response.size >= 1024
                                    ? (response.size / 1024).toFixed(1) + ' KB'
                                    : response.size + ' B'}
                            </span>
                        </>
                    ) : (
                        <span className={a.respPlaceholder}>尚未发送请求</span>
                    )}
                    <span className={g.spacer}/>
                    {response && (
                        <div className={`${g.segmented} ${g.sm}`}>
                            <button
                                className={respTab === 'body' ? g.active : ''}
                                onClick={() => setRespTab('body')}
                            >响应体</button>
                            <button
                                className={respTab === 'headers' ? g.active : ''}
                                onClick={() => setRespTab('headers')}
                            >响应头</button>
                        </div>
                    )}
                </div>

                <div className={a.respBody}>
                    {!response && (
                        <div className={a.respEmpty}>填写地址与方法后点击「发送」查看响应</div>
                    )}
                    {response && respTab === 'body' && (
                        <div className={a.respBodyWrap}>
                            <div className={a.respBodyTools}>
                                <label className={a.prettyCheck}>
                                    <input
                                        type="checkbox"
                                        checked={bodyPretty}
                                        onChange={(e) => setBodyPretty(e.target.checked)}
                                    />
                                    美化 JSON
                                </label>
                                <button
                                    className={`${g.btn} ${g.sm}`}
                                    onClick={() => copy(prettyBody)}
                                >
                                    <Icon name="copy" size={13}/> 复制
                                </button>
                            </div>
                            <div className={a.respCodeWrap}>
                                <CodeEditor
                                    value={prettyBody || '(空响应体)'}
                                    onChange={() => {}}
                                    lang={respLang}
                                    height="100%"
                                    readOnly
                                />
                            </div>
                        </div>
                    )}
                    {response && respTab === 'headers' && (
                        <div className={a.respHeaders}>
                            {respHeaders.length === 0 && <div className={a.respEmpty}>无响应头</div>}
                            {respHeaders.map(([k, v]) => (
                                <div key={k} className={a.respHeaderRow}>
                                    <span className={a.respHeaderKey}>{k}</span>
                                    <span className={a.respHeaderVal}>{v}</span>
                                    <button
                                        className={`${g.iconBtn}`}
                                        title="复制"
                                        onClick={() => copy(`${k}: ${v}`)}
                                    >
                                        <Icon name="copy" size={12}/>
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
            )}

            </div>
        </div>
    )
}
