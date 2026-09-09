import {useCallback, useEffect, useMemo, useRef, useState} from 'react'
import {API, subscribe} from '@/api'
import {errorMessage} from '@/utils'
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
    SavedApiItem,
    ApiFolderNode,
    ApiTreeNode,
    BODY_TYPES,
    HISTORY_KEY,
    SAVED_APIS_KEY,
    METHODS,
    buildRequest,
    emptyAuth,
    looksLikeJson,
    parseUrlParams,
    buildUrlWithParams,
    sanitizeHistoryItem,
    findTreeNode,
    removeTreeNode,
    updateTreeNode,
    insertTreeNode,
} from './apiTypes'

const MAX_HISTORY = 50
const MAX_WS_MESSAGES = 500

export interface ApiExecState {
    response: ApiResponse | null
    historicalSnapshotTime: number | null
    error: string
    respTab: 'body' | 'headers'
    sending: boolean
}

export function useApi() {
    const [method, setMethod] = useState<ApiMethod>('GET')
    const [url, setUrl] = useState('')
    const [params, setParams] = useState<ApiHeader[]>([])
    const [headers, setHeaders] = useState<ApiHeader[]>([])
    const [bodyType, setBodyType] = useState('none')
    const [body, setBody] = useState('')
    const [auth, setAuth] = useState<ApiAuth>(emptyAuth())
    const [timeoutMs, setTimeoutMs] = useState(30000)
    const [insecureTLS, setInsecureTLS] = useState(false)
    const [followRedirects, setFollowRedirects] = useState(true)

    const [configTab, setConfigTab] = useState<ConfigTab>('params')
    const [showConfig, setShowConfig] = useState(true)

    const [sending, setSending] = useState(false)
    const [error, setError] = useState('')
    const [response, setResponse] = useState<ApiResponse | null>(null)
    const [historicalSnapshotTime, setHistoricalSnapshotTime] = useState<number | null>(null)
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
    const [historyKeyword, setHistoryKeyword] = useState('')
    const [historyMethodFilter, setHistoryMethodFilter] = useState('ALL')
    const [drawerHistoryItem, setDrawerHistoryItem] = useState<ApiHistoryItem | null>(null)

    // 每个接口独立的响应与执行状态缓存，防止切换接口时响应互相污染
    const apiExecMapRef = useRef<Record<string, ApiExecState>>({})
    const currentApiIdRef = useRef<string | null>(null)

    // 接口树与接口管理状态
    const [apiTree, setApiTree] = useState<ApiTreeNode[]>(() => {
        try {
            const raw = localStorage.getItem(SAVED_APIS_KEY)
            if (raw) {
                const parsed = JSON.parse(raw)
                if (Array.isArray(parsed) && parsed.length > 0) return parsed as ApiTreeNode[]
            }
        } catch {}
        return [
            {
                id: 'folder_default',
                name: '默认分组',
                isFolder: true,
                createdAt: Date.now(),
                updatedAt: Date.now(),
                children: [
                    {
                        id: 'api_example_get',
                        name: '示例: GET 请求',
                        isFolder: false,
                        mode: 'http',
                        method: 'GET',
                        url: 'https://httpbin.org/get',
                        params: [{ name: 'test', value: '123', enabled: true }],
                        headers: [],
                        bodyType: 'none',
                        body: '',
                        auth: emptyAuth(),
                        timeoutMs: 30000,
                        insecureTLS: false,
                        followRedirects: true,
                        createdAt: Date.now(),
                        updatedAt: Date.now(),
                    },
                ],
            },
        ]
    })
    const [currentApiId, setCurrentApiId] = useState<string | null>(null)
    currentApiIdRef.current = currentApiId
    const [currentApiName, setCurrentApiName] = useState<string | null>(null)
    const [apiTreeSearch, setApiTreeSearch] = useState('')
    const [apiTreeExpandedKeys, setApiTreeExpandedKeys] = useState<string[]>(['folder_default'])

    const [saveModalOpen, setSaveModalOpen] = useState(false)
    const [saveModalMode, setSaveModalMode] = useState<'save' | 'saveAs'>('save')

    const [mode, setMode] = useState<ApiMode>('http')
    const [wsConnId, setWsConnId] = useState<string | null>(null)
    const [wsStatus, setWsStatus] = useState<WsStatus>('idle')
    const [wsMessages, setWsMessages] = useState<WsMessage[]>([])
    const [wsInput, setWsInput] = useState('')
    const [wsProtocols, setWsProtocols] = useState('')
    const [wsConnecting, setWsConnecting] = useState(false)

    // 手动输入 URL 时同步解析 query 参数至 params 表格
    const updateUrl = useCallback((newUrl: string) => {
        setUrl(newUrl)
        const {params: parsed} = parseUrlParams(newUrl)
        if (parsed.length > 0) {
            setParams(parsed)
        }
    }, [])

    useEffect(() => {
        try {
            localStorage.setItem(HISTORY_KEY, JSON.stringify(history))
        } catch {
            /* 忽略写入失败 */
        }
    }, [history])

    useEffect(() => {
        try {
            localStorage.setItem(SAVED_APIS_KEY, JSON.stringify(apiTree))
        } catch {
            /* 忽略写入失败 */
        }
    }, [apiTree])

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
        setHistoricalSnapshotTime(null)

        const sendApiId = currentApiIdRef.current || '__draft__'
        apiExecMapRef.current[sendApiId] = {
            ...(apiExecMapRef.current[sendApiId] || { respTab: 'body' }),
            sending: true,
            error: '',
            historicalSnapshotTime: null,
        }

        try {
            const res = await API.apiRequest(
                buildRequest({method, url: target, headers, bodyType, body, timeoutMs, insecureTLS, followRedirects, auth, bodyTypes: BODY_TYPES})
            )
            // 写入该接口专属的响应缓存
            apiExecMapRef.current[sendApiId] = {
                response: res,
                historicalSnapshotTime: null,
                error: res.error || '',
                respTab: 'body',
                sending: false,
            }
            // 仅当用户当前仍停留在该接口视图时才同步更新界面，防止异步返回污染其他接口
            if ((currentApiIdRef.current || '__draft__') === sendApiId) {
                setResponse(res)
                setRespTab('body')
                setHistoricalSnapshotTime(null)
                if (res.error) setError(res.error)
            }
            const histItem: ApiHistoryItem = {
                id: 'hist_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
                mode: 'http',
                method,
                url: target,
                params: [...params],
                headers: [...headers],
                bodyType,
                body,
                auth: {...auth},
                timeoutMs,
                insecureTLS,
                followRedirects,
                statusCode: res.statusCode,
                durationMs: res.durationMs,
                at: Date.now(),
                error: res.error,
                response: res,
            }
            setHistory((h) => [sanitizeHistoryItem(histItem), ...h].slice(0, MAX_HISTORY))
        } catch (e) {
            const errMsg = errorMessage(e)
            apiExecMapRef.current[sendApiId] = {
                ...(apiExecMapRef.current[sendApiId] || { response: null, historicalSnapshotTime: null, respTab: 'body' }),
                sending: false,
                error: errMsg,
            }
            if ((currentApiIdRef.current || '__draft__') === sendApiId) {
                setError(errMsg)
            }
        } finally {
            if (apiExecMapRef.current[sendApiId]) {
                apiExecMapRef.current[sendApiId].sending = false
            }
            if ((currentApiIdRef.current || '__draft__') === sendApiId) {
                setSending(false)
            }
        }
    }, [url, method, params, headers, bodyType, body, timeoutMs, insecureTLS, followRedirects, auth])

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
            const wsHistItem: ApiHistoryItem = {
                id: 'hist_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
                mode: 'ws',
                method: 'WS' as any,
                url: target,
                headers: [...headers],
                auth: {...auth},
                insecureTLS,
                wsProtocols,
                statusCode: res.error ? 0 : 101,
                durationMs: 0,
                at: Date.now(),
                error: res.error || '',
            }
            setHistory((h) => [sanitizeHistoryItem(wsHistItem), ...h].slice(0, MAX_HISTORY))

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

    // 销毁组件时释放 WebSocket 连接
    useEffect(() => {
        return () => {
            if (wsConnId) {
                API.wsClose(wsConnId)
            }
        }
    }, [wsConnId])

    const formatJsonBody = useCallback(() => {
        if (bodyType !== 'json') return
        try {
            setBody(JSON.stringify(JSON.parse(body), null, 2))
            setError('')
        } catch {
            setError('请求体不是合法的 JSON')
        }
    }, [body, bodyType])

    const prettyBody = useMemo(() => {
        if (!response?.body) return ''
        if (bodyPretty) {
            const ct = Object.entries(response.headers || {}).find(([k]) => k.toLowerCase() === 'content-type')?.[1] ?? ''
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

    const addParam = useCallback(() => setParams((p) => [...p, {name: '', value: '', enabled: true}]), [])
    const updateParam = useCallback((i: number, patch: Partial<ApiHeader>) => {
        setParams((list) => {
            const next = list.map((x, idx) => (idx === i ? {...x, ...patch} : x))
            const {baseUrl} = parseUrlParams(url)
            setUrl(buildUrlWithParams(baseUrl, next))
            return next
        })
    }, [url])
    const removeParam = useCallback((i: number) => {
        setParams((list) => {
            const next = list.filter((_, idx) => idx !== i)
            const {baseUrl} = parseUrlParams(url)
            setUrl(buildUrlWithParams(baseUrl, next))
            return next
        })
    }, [url])

    const addHeader = useCallback(() => setHeaders((h) => [...h, {name: '', value: '', enabled: true}]), [])
    const updateHeader = useCallback((i: number, patch: Partial<ApiHeader>) =>
        setHeaders((h) => h.map((x, idx) => (idx === i ? {...x, ...patch} : x))), [])
    const removeHeader = useCallback((i: number) => setHeaders((h) => h.filter((_, idx) => idx !== i)), [])
    const copy = useCallback((text: string) => {
        if (navigator.clipboard) navigator.clipboard.writeText(text).catch(() => {})
    }, [])

    const loadHistory = useCallback((item: ApiHistoryItem) => {
        const isWs = item.mode === 'ws' || item.method === ('WS' as any)
        if (isWs) {
            setMode('ws')
            setUrl(item.url)
            if (item.headers) setHeaders(item.headers)
            if (item.auth) setAuth(item.auth)
            if (item.insecureTLS !== undefined) setInsecureTLS(item.insecureTLS)
            if (item.wsProtocols !== undefined) setWsProtocols(item.wsProtocols)
            setConfigTab('messages')
            setShowConfig(true)
            setError(item.error || '')
        } else {
            setMode('http')
            setMethod(item.method || 'GET')
            setUrl(item.url)
            if (item.params) {
                setParams(item.params)
            } else {
                const {params: parsed} = parseUrlParams(item.url)
                setParams(parsed)
            }
            if (item.headers) setHeaders(item.headers)
            if (item.bodyType !== undefined) setBodyType(item.bodyType)
            if (item.body !== undefined) setBody(item.body)
            if (item.auth) setAuth(item.auth)
            if (item.timeoutMs !== undefined) setTimeoutMs(item.timeoutMs)
            if (item.insecureTLS !== undefined) setInsecureTLS(item.insecureTLS)
            if (item.followRedirects !== undefined) setFollowRedirects(item.followRedirects)

            const key = currentApiIdRef.current || '__draft__'
            if (item.response) {
                setResponse(item.response)
                setHistoricalSnapshotTime(item.at)
                setRespTab('body')
                apiExecMapRef.current[key] = {
                    response: item.response,
                    historicalSnapshotTime: item.at,
                    error: item.error || '',
                    respTab: 'body',
                    sending: false,
                }
            } else {
                const fallbackResp: ApiResponse = {
                    status: item.statusCode ? String(item.statusCode) : '',
                    statusCode: item.statusCode || 0,
                    proto: '',
                    headers: {},
                    body: '',
                    durationMs: item.durationMs || 0,
                    size: 0,
                    error: item.error || '',
                }
                setResponse(fallbackResp)
                setHistoricalSnapshotTime(item.at)
                apiExecMapRef.current[key] = {
                    response: fallbackResp,
                    historicalSnapshotTime: item.at,
                    error: item.error || '',
                    respTab: 'body',
                    sending: false,
                }
            }
            setError(item.error || '')
            setShowConfig(true)
        }
    }, [])

    const deleteHistory = useCallback((idxOrId: number | string) => {
        setHistory((h) => {
            if (typeof idxOrId === 'number') {
                return h.filter((_, i) => i !== idxOrId)
            }
            return h.filter((item) => item.id !== idxOrId)
        })
    }, [])

    const clearHistory = useCallback(() => {
        setHistory([])
        try {
            localStorage.removeItem(HISTORY_KEY)
        } catch {}
    }, [])

    // 接口列表 / 树操作方法
    const loadSavedApi = useCallback((item: SavedApiItem) => {
        setCurrentApiId(item.id)
        setCurrentApiName(item.name)
        currentApiIdRef.current = item.id

        // 切换接口时恢复该接口独立的响应与执行状态，防止与其他接口相互影响
        const cached = apiExecMapRef.current[item.id]
        setResponse(cached?.response || null)
        setHistoricalSnapshotTime(cached?.historicalSnapshotTime || null)
        setError(cached?.error || '')
        setRespTab(cached?.respTab || 'body')
        setSending(!!cached?.sending)

        if (item.mode === 'ws' || item.method === ('WS' as any)) {
            setMode('ws')
            setUrl(item.url || '')
            setHeaders(item.headers || [])
            setAuth(item.auth || emptyAuth())
            setInsecureTLS(item.insecureTLS || false)
            setWsProtocols(item.wsProtocols || '')
            setConfigTab('messages')
        } else {
            setMode('http')
            setMethod(item.method || 'GET')
            setUrl(item.url || '')
            setParams(item.params || (item.url ? parseUrlParams(item.url).params : []))
            setHeaders(item.headers || [])
            setBodyType(item.bodyType || 'none')
            setBody(item.body || '')
            setAuth(item.auth || emptyAuth())
            setTimeoutMs(item.timeoutMs || 30000)
            setInsecureTLS(item.insecureTLS || false)
            setFollowRedirects(item.followRedirects ?? true)
            setConfigTab('params')
        }
        setShowConfig(true)
    }, [])

    const saveCurrentApi = useCallback((name?: string) => {
        if (currentApiId) {
            const existing = findTreeNode(apiTree, currentApiId)
            if (existing && !existing.isFolder) {
                setApiTree((prev) =>
                    updateTreeNode(prev, currentApiId, {
                        name: name || currentApiName || existing.name,
                        mode,
                        method,
                        url,
                        params,
                        headers,
                        bodyType,
                        body,
                        auth,
                        timeoutMs,
                        insecureTLS,
                        followRedirects,
                        wsProtocols,
                        updatedAt: Date.now(),
                    })
                )
                if (name) setCurrentApiName(name)
                return true
            }
        }
        return false
    }, [currentApiId, currentApiName, apiTree, mode, method, url, params, headers, bodyType, body, auth, timeoutMs, insecureTLS, followRedirects, wsProtocols])

    const saveAsNewApi = useCallback((name: string, targetFolderId?: string | null) => {
        const id = 'api_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7)
        const apiName = name.trim() || (mode === 'ws' ? 'WebSocket 连接' : `${method} ${url || '新接口'}`)
        const newItem: SavedApiItem = {
            id,
            name: apiName,
            isFolder: false,
            mode,
            method,
            url,
            params: [...params],
            headers: [...headers],
            bodyType,
            body,
            auth: {...auth},
            timeoutMs,
            insecureTLS,
            followRedirects,
            wsProtocols,
            createdAt: Date.now(),
            updatedAt: Date.now(),
        }
        setApiTree((prev) => insertTreeNode(prev, targetFolderId || null, newItem))
        setCurrentApiId(id)
        setCurrentApiName(apiName)
        currentApiIdRef.current = id

        // 如果草稿有响应数据，平移给新保存的接口
        if (apiExecMapRef.current['__draft__']) {
            apiExecMapRef.current[id] = { ...apiExecMapRef.current['__draft__'] }
            delete apiExecMapRef.current['__draft__']
        }

        if (targetFolderId) {
            setApiTreeExpandedKeys((keys) => Array.from(new Set([...keys, targetFolderId])))
        }
    }, [mode, method, url, params, headers, bodyType, body, auth, timeoutMs, insecureTLS, followRedirects, wsProtocols])

    const createFolder = useCallback((name: string, parentFolderId?: string | null) => {
        const id = 'folder_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7)
        const folderName = name.trim() || '新建分组'
        const newFolder: ApiFolderNode = {
            id,
            name: folderName,
            isFolder: true,
            children: [],
            createdAt: Date.now(),
            updatedAt: Date.now(),
        }
        setApiTree((prev) => insertTreeNode(prev, parentFolderId || null, newFolder))
        setApiTreeExpandedKeys((keys) => Array.from(new Set([...keys, id, ...(parentFolderId ? [parentFolderId] : [])])))
    }, [])

    const renameTreeNode = useCallback((id: string, newName: string) => {
        setApiTree((prev) => updateTreeNode(prev, id, { name: newName.trim() }))
        if (currentApiId === id) {
            setCurrentApiName(newName.trim())
        }
    }, [currentApiId])

    const deleteTreeNode = useCallback((id: string) => {
        setApiTree((prev) => {
            const { newNodes } = removeTreeNode(prev, id)
            return newNodes
        })
        delete apiExecMapRef.current[id]
        if (currentApiId === id) {
            setCurrentApiId(null)
            setCurrentApiName(null)
            currentApiIdRef.current = null
            const cached = apiExecMapRef.current['__draft__']
            setResponse(cached?.response || null)
            setHistoricalSnapshotTime(cached?.historicalSnapshotTime || null)
            setError(cached?.error || '')
            setRespTab(cached?.respTab || 'body')
            setSending(!!cached?.sending)
        }
    }, [currentApiId])

    const duplicateApiItem = useCallback((id: string) => {
        const target = findTreeNode(apiTree, id)
        if (!target || target.isFolder) return
        const cloneId = 'api_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7)
        const cloneItem: SavedApiItem = {
            ...(target as SavedApiItem),
            id: cloneId,
            name: `${target.name} - 副本`,
            createdAt: Date.now(),
            updatedAt: Date.now(),
        }
        setApiTree((prev) => insertTreeNode(prev, null, cloneItem))
    }, [apiTree])

    const moveTreeNode = useCallback((dragKey: string, dropKey: string, dropPosition: number, dropToGap: boolean) => {
        setApiTree((prev) => {
            const { newNodes, removed } = removeTreeNode(prev, dragKey)
            if (!removed) return prev

            if (!dropToGap) {
                // 拖入分组内部
                return insertTreeNode(newNodes, dropKey, removed)
            } else {
                // 拖到兄弟节点前后
                const insertAtLevel = (list: ApiTreeNode[]): ApiTreeNode[] => {
                    const idx = list.findIndex((n) => n.id === dropKey)
                    if (idx !== -1) {
                        const copy = [...list]
                        const insertIdx = dropPosition === -1 ? idx : idx + 1
                        copy.splice(insertIdx, 0, removed!)
                        return copy
                    }
                    return list.map((n) => {
                        if (n.isFolder && n.children) {
                            return {
                                ...n,
                                children: insertAtLevel(n.children),
                            }
                        }
                        return n
                    })
                }
                return insertAtLevel(newNodes)
            }
        })
    }, [])

    const newBlankApi = useCallback(() => {
        setCurrentApiId(null)
        setCurrentApiName(null)
        currentApiIdRef.current = null

        // 切换到空白接口时恢复草稿专属的响应状态
        const cached = apiExecMapRef.current['__draft__']
        setResponse(cached?.response || null)
        setHistoricalSnapshotTime(cached?.historicalSnapshotTime || null)
        setError(cached?.error || '')
        setRespTab(cached?.respTab || 'body')
        setSending(!!cached?.sending)

        setMode('http')
        setMethod('GET')
        setUrl('')
        setParams([])
        setHeaders([])
        setBodyType('none')
        setBody('')
        setAuth(emptyAuth())
    }, [])

    // 主动清空当前接口的响应内容
    const clearResponse = useCallback(() => {
        setResponse(null)
        setHistoricalSnapshotTime(null)
        setError('')
        const key = currentApiIdRef.current || '__draft__'
        delete apiExecMapRef.current[key]
    }, [])

    const filteredHistory = useMemo(() => {
        return history.filter((item) => {
            const isWs = item.mode === 'ws' || item.method === ('WS' as any)
            if (historyMethodFilter !== 'ALL') {
                if (historyMethodFilter === 'WS') {
                    if (!isWs) return false
                } else {
                    if (isWs || item.method !== historyMethodFilter) return false
                }
            }
            if (historyKeyword.trim()) {
                const kw = historyKeyword.trim().toLowerCase()
                const matchUrl = item.url.toLowerCase().includes(kw)
                const matchMethod = (item.method || '').toLowerCase().includes(kw)
                if (!matchUrl && !matchMethod) return false
            }
            return true
        })
    }, [history, historyKeyword, historyMethodFilter])

    const currentSavedItem = useMemo(() => {
        if (!currentApiId) return null
        const found = findTreeNode(apiTree, currentApiId)
        return found && !found.isFolder ? (found as SavedApiItem) : null
    }, [apiTree, currentApiId])

    const isModified = useMemo(() => {
        if (!currentSavedItem) {
            return false
        }
        if (currentSavedItem.mode !== mode) return true
        if (currentSavedItem.url !== url) return true
        if (mode === 'http' && currentSavedItem.method !== method) return true
        if (currentSavedItem.bodyType !== bodyType) return true
        if ((currentSavedItem.body || '') !== (body || '')) return true
        if (JSON.stringify(currentSavedItem.params || []) !== JSON.stringify(params || [])) return true
        if (JSON.stringify(currentSavedItem.headers || []) !== JSON.stringify(headers || [])) return true
        if (JSON.stringify(currentSavedItem.auth || {}) !== JSON.stringify(auth || {})) return true
        if (currentSavedItem.timeoutMs !== timeoutMs) return true
        if (currentSavedItem.insecureTLS !== insecureTLS) return true
        if (currentSavedItem.followRedirects !== followRedirects) return true
        return false
    }, [currentSavedItem, mode, method, url, params, headers, bodyType, body, auth, timeoutMs, insecureTLS, followRedirects])

    const respHeaders = response ? Object.entries(response.headers || {}) : []
    const respLang: 'json' | 'plain' = useMemo(() => {
        if (!response) return 'plain'
        const ct = respHeaders.find(([k]) => k.toLowerCase() === 'content-type')?.[1] ?? ''
        return ct.toLowerCase().includes('json') || looksLikeJson(prettyBody) ? 'json' : 'plain'
    }, [response, prettyBody, respHeaders])

    return {
        // HTTP 状态
        method, setMethod, url, setUrl, updateUrl, params, setParams, addParam, updateParam, removeParam,
        headers, setHeaders, bodyType, setBodyType, body, setBody,
        auth, setAuth, timeoutMs, setTimeoutMs, insecureTLS, setInsecureTLS, followRedirects, setFollowRedirects,
        configTab, setConfigTab, showConfig, setShowConfig, sending, error, setError, response, respTab, setRespTab,
        historicalSnapshotTime, setHistoricalSnapshotTime,
        bodyPretty, setBodyPretty, history, filteredHistory, showHistory, setShowHistory,
        historyKeyword, setHistoryKeyword, historyMethodFilter, setHistoryMethodFilter,
        drawerHistoryItem, setDrawerHistoryItem,
        allowBody, doSend, prettyBody, clearResponse,
        addHeader, updateHeader, removeHeader, copy, loadHistory, deleteHistory, clearHistory, respHeaders, respLang,
        formatJsonBody,
        // WS 状态
        mode, setMode, wsSwitchMode, wsConnId, wsStatus, wsMessages, wsInput, setWsInput, wsProtocols, setWsProtocols,
        wsConnecting, wsConnect, wsDisconnect, wsSendMsg, wsClear,
        // 接口列表与树管理
        apiTree, setApiTree,
        currentApiId, setCurrentApiId,
        currentApiName, setCurrentApiName,
        apiTreeSearch, setApiTreeSearch,
        apiTreeExpandedKeys, setApiTreeExpandedKeys,
        saveModalOpen, setSaveModalOpen,
        saveModalMode, setSaveModalMode,
        isModified,
        loadSavedApi,
        saveCurrentApi,
        saveAsNewApi,
        createFolder,
        renameTreeNode,
        deleteTreeNode,
        duplicateApiItem,
        moveTreeNode,
        newBlankApi,
        // 常量
        methods: METHODS,
    }
}

export type ApiState = ReturnType<typeof useApi>
