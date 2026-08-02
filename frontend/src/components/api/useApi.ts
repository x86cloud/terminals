import {useCallback, useEffect, useMemo, useState} from 'react'
import {API, subscribe} from '../../api'
import {errorMessage} from '../../utils'
import {
    ApiAuth,
    ApiHeader,
    ApiHistoryItem,
    ApiMethod,
    ApiMode,
    ApiRequest,
    ApiResponse,
    ConfigTab,
    WsMessage,
    WsStatus,
    BODY_TYPES,
    HISTORY_KEY,
    METHODS,
    buildRequest,
    emptyAuth,
    looksLikeJson,
} from './apiTypes'

const MAX_HISTORY = 30
const MAX_WS_MESSAGES = 500

export function useApi() {
    const [method, setMethod] = useState<ApiMethod>('GET')
    const [url, setUrl] = useState('')
    const [headers, setHeaders] = useState<ApiHeader[]>([])
    const [bodyType, setBodyType] = useState('none')
    const [body, setBody] = useState('')
    const [auth, setAuth] = useState<ApiAuth>(emptyAuth())
    const [timeoutMs, setTimeoutMs] = useState(30000)
    const [insecureTLS, setInsecureTLS] = useState(false)
    const [followRedirects, setFollowRedirects] = useState(true)

    const [configTab, setConfigTab] = useState<ConfigTab>('headers')
    const [showConfig, setShowConfig] = useState(true)

    const [sending, setSending] = useState(false)
    const [error, setError] = useState('')
    const [response, setResponse] = useState<ApiResponse | null>(null)
    const [respTab, setRespTab] = useState<'body' | 'headers'>('body')
    const [bodyPretty, setBodyPretty] = useState(true)
    const [history, setHistory] = useState<ApiHistoryItem[]>(() => {
        try {
            const raw = localStorage.getItem(HISTORY_KEY)
            return raw ? (JSON.parse(raw) as ApiHistoryItem[]) : []
        } catch {
            return []
        }
    })
    const [showHistory, setShowHistory] = useState(true)

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
            const res = await API.apiRequest(
                buildRequest({method, url: target, headers, bodyType, body, timeoutMs, insecureTLS, followRedirects, auth, bodyTypes: BODY_TYPES})
            )
            setResponse(res)
            setRespTab('body')
            setHistory((h) => [
                {method, url: target, statusCode: res.statusCode, durationMs: res.durationMs, at: Date.now(), error: res.error},
                ...h,
            ].slice(0, MAX_HISTORY))
        } catch (e) {
            setError(errorMessage(e))
        } finally {
            setSending(false)
        }
    }, [url, method, headers, bodyType, body, timeoutMs, insecureTLS, followRedirects, auth])

    const wsSwitchMode = useCallback((next: ApiMode) => {
        setMode(next)
        setConfigTab(next === 'ws' ? 'messages' : 'headers')
    }, [])

    useEffect(() => {
        if (!wsConnId) return
        const offMsg = subscribe(`ws:message:${wsConnId}`, (ev: WsMessage) => {
            setWsMessages((list) => [...list, ev].slice(-MAX_WS_MESSAGES))
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
            const ct = Object.entries(response.headers).find(([k]) => k.toLowerCase() === 'content-type')?.[1] ?? ''
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

    const addHeader = useCallback(() => setHeaders((h) => [...h, {name: '', value: '', enabled: true}]), [])
    const updateHeader = useCallback((i: number, patch: Partial<ApiHeader>) =>
        setHeaders((h) => h.map((x, idx) => (idx === i ? {...x, ...patch} : x))), [])
    const removeHeader = useCallback((i: number) => setHeaders((h) => h.filter((_, idx) => idx !== i)), [])
    const copy = useCallback((text: string) => {
        if (navigator.clipboard) navigator.clipboard.writeText(text).catch(() => {})
    }, [])

    const loadHistory = useCallback((item: ApiHistoryItem) => {
        setMethod(item.method)
        setUrl(item.url)
        setShowConfig(true)
    }, [])
    const deleteHistory = useCallback((idx: number) => setHistory((h) => h.filter((_, i) => i !== idx)), [])
    const clearHistory = useCallback(() => {
        if (history.length === 0) return
        if (window.confirm('确定清空全部请求历史？')) setHistory([])
    }, [history])

    const respHeaders = response ? Object.entries(response.headers) : []
    const respLang: 'json' | 'plain' = useMemo(() => {
        if (!response) return 'plain'
        const ct = respHeaders.find(([k]) => k.toLowerCase() === 'content-type')?.[1] ?? ''
        return ct.toLowerCase().includes('json') || looksLikeJson(prettyBody) ? 'json' : 'plain'
    }, [response, prettyBody, respHeaders])

    return {
        // HTTP 状态
        method, setMethod, url, setUrl, headers, setHeaders, bodyType, setBodyType, body, setBody,
        auth, setAuth, timeoutMs, setTimeoutMs, insecureTLS, setInsecureTLS, followRedirects, setFollowRedirects,
        configTab, setConfigTab, showConfig, setShowConfig, sending, error, setError, response, respTab, setRespTab,
        bodyPretty, setBodyPretty, history, showHistory, setShowHistory, allowBody, doSend, prettyBody,
        addHeader, updateHeader, removeHeader, copy, loadHistory, deleteHistory, clearHistory, respHeaders, respLang,
        formatJsonBody,
        // WS 状态
        mode, setMode, wsSwitchMode, wsConnId, wsStatus, wsMessages, wsInput, setWsInput, wsProtocols, setWsProtocols,
        wsConnecting, wsConnect, wsDisconnect, wsSendMsg, wsClear,
        // 常量
        methods: METHODS,
    }
}

export type ApiState = ReturnType<typeof useApi>
