import {useCallback, useEffect, useMemo, useRef, useState} from 'react'
import {API, subscribe} from '@/api'
import {errorMessage} from '@/utils'
import {
    ApiAuth,
    ApiHeader,
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
    METHODS,
    buildRequest,
    emptyAuth,
    looksLikeJson,
    parseUrlParams,
    buildUrlWithParams,
    findTreeNode,
    removeTreeNode,
    updateTreeNode,
    insertTreeNode,
} from './apiTypes'

const MAX_WS_MESSAGES = 500

export interface ApiExecState {
    response: ApiResponse | null
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
    const [respTab, setRespTab] = useState<'body' | 'headers'>('body')
    const [bodyPretty, setBodyPretty] = useState(true)
    const [showApiTree, setShowApiTree] = useState(true)

    // 每个接口独立的响应与执行状态缓存，防止切换接口时响应互相污染
    const apiExecMapRef = useRef<Record<string, ApiExecState>>({})
    const currentApiIdRef = useRef<string | null>(null)

    // 接口树与接口管理状态
    const [apiTree, setApiTree] = useState<ApiTreeNode[]>([])
    const hasLoadedFileRef = useRef(false)

    const isExternalSyncRef = useRef(false)

    const reloadApiTree = useCallback(() => {
        API.loadApiTree()
            .then((raw) => {
                if (raw && raw.trim()) {
                    try {
                        const parsed = JSON.parse(raw)
                        if (Array.isArray(parsed) && parsed.length > 0) {
                            isExternalSyncRef.current = true
                            setApiTree(parsed)
                        }
                    } catch (e) {
                        console.error('解析本地接口数据失败:', e)
                    }
                }
                hasLoadedFileRef.current = true
            })
            .catch((e) => {
                console.error('加载本地接口数据失败:', e)
                hasLoadedFileRef.current = true
            })
    }, [])

    // 首次挂载时从本地文件 apis.json 加载，并监听全局同步事件
    useEffect(() => {
        reloadApiTree()
        const unsub = subscribe('api:tree-updated', () => {
            reloadApiTree()
        })
        return () => {
            unsub()
        }
    }, [reloadApiTree])

    // 监听接口树变更，自动防抖持久化至本地文件
    useEffect(() => {
        if (!hasLoadedFileRef.current) return
        if (isExternalSyncRef.current) {
            isExternalSyncRef.current = false
            return
        }

        const timer = setTimeout(() => {
            API.saveApiTree(JSON.stringify(apiTree, null, 2)).catch((e) => {
                console.error('持久化接口树失败:', e)
            })
        }, 300)

        return () => clearTimeout(timer)
    }, [apiTree])

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

        const sendApiId = currentApiIdRef.current || '__draft__'
        apiExecMapRef.current[sendApiId] = {
            ...(apiExecMapRef.current[sendApiId] || { respTab: 'body' }),
            sending: true,
            error: '',
        }

        try {
            const res = await API.apiRequest(
                buildRequest({method, url: target, headers, bodyType, body, timeoutMs, insecureTLS, followRedirects, auth, bodyTypes: BODY_TYPES})
            )
            // 写入该接口专属的响应缓存
            apiExecMapRef.current[sendApiId] = {
                response: res,
                error: res.error || '',
                respTab: 'body',
                sending: false,
            }
            // 仅当用户当前仍停留在该接口视图时才同步更新界面，防止异步返回污染其他接口
            if ((currentApiIdRef.current || '__draft__') === sendApiId) {
                setResponse(res)
                setRespTab('body')
                if (res.error) setError(res.error)
            }
        } catch (e) {
            const errMsg = errorMessage(e)
            apiExecMapRef.current[sendApiId] = {
                ...(apiExecMapRef.current[sendApiId] || { response: null, respTab: 'body' }),
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

    // 接口列表 / 树操作方法
    const loadSavedApi = useCallback((item: SavedApiItem) => {
        setCurrentApiId(item.id)
        setCurrentApiName(item.name)
        currentApiIdRef.current = item.id

        // 切换接口时恢复该接口独立的响应与执行状态，防止与其他接口相互影响
        const cached = apiExecMapRef.current[item.id]
        setResponse(cached?.response || null)
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
        setError('')
        const key = currentApiIdRef.current || '__draft__'
        delete apiExecMapRef.current[key]
    }, [])

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

    const exportApis = useCallback(async () => {
        const content = JSON.stringify(apiTree, null, 2)
        return API.chooseExportApiFile(content, 'apis_backup.json')
    }, [apiTree])

    const importApis = useCallback(async (): Promise<{ count: number } | null> => {
        const raw = await API.chooseImportApiFile()
        if (!raw || !raw.trim()) return null
        let parsed: any
        try {
            parsed = JSON.parse(raw)
        } catch {
            throw new Error('导入文件不是合法的 JSON 格式')
        }
        if (!Array.isArray(parsed)) {
            throw new Error('导入文件格式不合法，根节点需为 JSON 数组')
        }
        setApiTree(parsed as ApiTreeNode[])
        await API.saveApiTree(JSON.stringify(parsed, null, 2))
        return { count: parsed.length }
    }, [])

    return {
        // HTTP 状态
        method, setMethod, url, setUrl, updateUrl, params, setParams, addParam, updateParam, removeParam,
        headers, setHeaders, bodyType, setBodyType, body, setBody,
        auth, setAuth, timeoutMs, setTimeoutMs, insecureTLS, setInsecureTLS, followRedirects, setFollowRedirects,
        configTab, setConfigTab, showConfig, setShowConfig, sending, error, setError, response, respTab, setRespTab,
        bodyPretty, setBodyPretty, showApiTree, setShowApiTree,
        allowBody, doSend, prettyBody, clearResponse,
        addHeader, updateHeader, removeHeader, copy, respHeaders, respLang,
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
        exportApis,
        importApis,
        // 常量
        methods: METHODS,
    }
}

export type ApiState = ReturnType<typeof useApi>
