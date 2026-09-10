import {
    ApiHeader,
    ApiMethod,
    ApiAuth,
    ApiRequest,
    ApiResponse,
    ApiMode,
    WsStatus,
    WsMessage,
    SavedApiItem,
    ApiFolderNode,
    ApiTreeNode,
} from '@/types'

export type {
    ApiHeader,
    ApiMethod,
    ApiAuth,
    ApiRequest,
    ApiResponse,
    ApiMode,
    WsStatus,
    WsMessage,
    SavedApiItem,
    ApiFolderNode,
    ApiTreeNode,
}

export const METHODS: ApiMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']

export const BODY_TYPES: Array<{ value: string; label: string; ct: string }> = [
    {value: 'none', label: '无', ct: ''},
    {value: 'json', label: 'JSON', ct: 'application/json'},
    {value: 'text', label: '文本', ct: 'text/plain'},
    {value: 'xml', label: 'XML', ct: 'application/xml'},
]

export const SAVED_APIS_KEY = 'api_client_saved_apis'

export type ConfigTab = 'params' | 'headers' | 'body' | 'auth' | 'options' | 'messages'

export function emptyAuth(): ApiAuth {
    return {type: 'none', username: '', password: '', token: ''}
}

export function looksLikeJson(s: string): boolean {
    const t = s.trim()
    return (t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'))
}

export function parseUrlParams(urlStr: string): { baseUrl: string; params: ApiHeader[] } {
    if (!urlStr.includes('?')) {
        return {baseUrl: urlStr, params: []}
    }
    const [baseUrl, queryStr] = urlStr.split('?', 2)
    const searchParams = new URLSearchParams(queryStr)
    const params: ApiHeader[] = []
    searchParams.forEach((value, name) => {
        params.push({name, value, enabled: true})
    })
    return {baseUrl, params}
}

export function buildUrlWithParams(baseUrl: string, params: ApiHeader[]): string {
    const activeParams = params.filter((p) => p.enabled && p.name.trim())
    if (activeParams.length === 0) return baseUrl
    const searchParams = new URLSearchParams()
    activeParams.forEach((p) => searchParams.append(p.name.trim(), p.value))
    const queryStr = searchParams.toString()
    return queryStr ? `${baseUrl}?${queryStr}` : baseUrl
}

export function statusClass(code: number, hasError: boolean): string {
    return hasError ? 'statusError' : code >= 200 && code < 300 ? 'statusOk'
        : code >= 300 && code < 400 ? 'statusRedirect'
            : code >= 400 && code < 500 ? 'statusClientErr'
                : code >= 500 ? 'statusServerErr' : 'statusUnknown'
}

export function buildRequest(req: {
    method: ApiMethod
    url: string
    headers: ApiHeader[]
    bodyType: string
    body: string
    timeoutMs: number
    insecureTLS: boolean
    followRedirects: boolean
    auth: ApiAuth
    bodyTypes: typeof BODY_TYPES
}): ApiRequest {
    const reqHeaders = req.headers.filter((h) => h.enabled && h.name.trim())
    if (req.bodyType !== 'none' && req.body.trim()) {
        const ct = req.bodyTypes.find((t) => t.value === req.bodyType)?.ct ?? ''
        if (ct && !reqHeaders.some((h) => h.name.toLowerCase() === 'content-type')) {
            reqHeaders.push({name: 'Content-Type', value: ct, enabled: true})
        }
    }
    return {
        method: req.method,
        url: /^https?:\/\//i.test(req.url.trim()) ? req.url.trim() : 'http://' + req.url.trim(),
        headers: reqHeaders,
        body: req.bodyType === 'none' ? '' : req.body,
        timeoutMs: req.timeoutMs,
        insecureTLS: req.insecureTLS,
        followRedirects: req.followRedirects,
        auth: req.auth,
    }
}

export function buildCurlCommand(item: Partial<SavedApiItem>): string {
    const method = item.method || 'GET'
    let url = item.url || ''

    if (item.params && Array.isArray(item.params) && item.params.length > 0) {
        const enabledParams = item.params.filter((p) => p.enabled && p.name && p.name.trim())
        if (enabledParams.length > 0) {
            try {
                const isFullUrl = url.startsWith('http://') || url.startsWith('https://')
                const urlObj = new URL(isFullUrl ? url : `http://${url}`)
                enabledParams.forEach((p) => {
                    urlObj.searchParams.set(p.name, p.value || '')
                })
                url = isFullUrl ? urlObj.toString() : urlObj.toString().replace(/^http:\/\//, '')
            } catch {
                const qs = enabledParams.map((p) => `${encodeURIComponent(p.name)}=${encodeURIComponent(p.value || '')}`).join('&')
                if (qs) {
                    url += (url.includes('?') ? '&' : '?') + qs
                }
            }
        }
    }

    const parts: string[] = ['curl', '-X', method]

    // Auth
    if (item.auth?.type === 'bearer' && item.auth.token) {
        parts.push('-H', `"Authorization: Bearer ${item.auth.token}"`)
    } else if (item.auth?.type === 'basic' && (item.auth.username || item.auth.password)) {
        parts.push('-u', `"${item.auth.username}:${item.auth.password}"`)
    }

    // Headers
    const headers = (item.headers || []).filter((h) => h.enabled && h.name && h.name.trim())
    headers.forEach((h) => {
        parts.push('-H', `"${h.name}: ${h.value}"`)
    })

    if (item.body && item.body.trim() && method !== 'GET' && method !== 'HEAD') {
        const escaped = item.body.replace(/"/g, '\\"')
        parts.push('-d', `"${escaped}"`)
    }

    if (item.insecureTLS) {
        parts.push('-k')
    }

    if (item.followRedirects) {
        parts.push('-L')
    }

    parts.push(`"${url}"`)
    return parts.join(' ')
}

export function findTreeNode(nodes: ApiTreeNode[], id: string): ApiTreeNode | null {
    if (!Array.isArray(nodes) || !id) return null
    for (const node of nodes) {
        if (!node) continue
        if (node.id === id) return node
        if (node.isFolder && Array.isArray(node.children)) {
            const found = findTreeNode(node.children, id)
            if (found) return found
        }
    }
    return null
}

export function removeTreeNode(nodes: ApiTreeNode[], id: string): { newNodes: ApiTreeNode[]; removed: ApiTreeNode | null } {
    let removed: ApiTreeNode | null = null
    if (!Array.isArray(nodes) || !id) return { newNodes: [], removed: null }
    const traverse = (list: ApiTreeNode[]): ApiTreeNode[] => {
        if (!Array.isArray(list)) return []
        const result: ApiTreeNode[] = []
        for (const item of list) {
            if (!item) continue
            if (item.id === id) {
                removed = item
                continue
            }
            if (item.isFolder && Array.isArray(item.children)) {
                result.push({
                    ...item,
                    children: traverse(item.children),
                })
            } else {
                result.push(item)
            }
        }
        return result
    }
    const newNodes = traverse(nodes)
    return { newNodes, removed }
}

export function updateTreeNode(nodes: ApiTreeNode[], id: string, patch: Partial<SavedApiItem | ApiFolderNode>): ApiTreeNode[] {
    if (!Array.isArray(nodes) || !id) return []
    return nodes.map((node) => {
        if (!node) return node
        if (node.id === id) {
            return {
                ...node,
                ...patch,
                updatedAt: Date.now(),
            } as ApiTreeNode
        }
        if (node.isFolder && Array.isArray(node.children)) {
            return {
                ...node,
                children: updateTreeNode(node.children, id, patch),
            }
        }
        return node
    }).filter(Boolean)
}

export function insertTreeNode(nodes: ApiTreeNode[], targetFolderId: string | null, newNode: ApiTreeNode): ApiTreeNode[] {
    if (!Array.isArray(nodes)) nodes = []
    if (!newNode) return nodes
    if (!targetFolderId) {
        return [newNode, ...nodes]
    }
    return nodes.map((node) => {
        if (!node) return node
        if (node.isFolder && node.id === targetFolderId) {
            return {
                ...node,
                children: [newNode, ...(node.children || [])],
                updatedAt: Date.now(),
            }
        }
        if (node.isFolder && Array.isArray(node.children)) {
            return {
                ...node,
                children: insertTreeNode(node.children, targetFolderId, newNode),
            }
        }
        return node
    }).filter(Boolean)
}

export function getFolderOptions(nodes: ApiTreeNode[], prefix = ''): Array<{ label: string; value: string }> {
    if (!Array.isArray(nodes)) return []
    const options: Array<{ label: string; value: string }> = []
    for (const node of nodes) {
        if (!node) continue
        if (node.isFolder) {
            const label = prefix ? `${prefix} / ${node.name || '分组'}` : (node.name || '分组')
            options.push({ label, value: node.id })
            if (Array.isArray(node.children)) {
                options.push(...getFolderOptions(node.children, label))
            }
        }
    }
    return options
}

export function countApiItems(nodes: ApiTreeNode[]): number {
    if (!Array.isArray(nodes)) return 0
    let count = 0
    for (const node of nodes) {
        if (!node) continue
        if (node.isFolder) {
            if (Array.isArray(node.children)) count += countApiItems(node.children)
        } else {
            count++
        }
    }
    return count
}

export function filterApiTree(nodes: ApiTreeNode[], keyword: string): { filtered: ApiTreeNode[]; matchedKeys: string[] } {
    if (!Array.isArray(nodes)) return { filtered: [], matchedKeys: [] }
    const kw = keyword.trim().toLowerCase()
    if (!kw) return { filtered: nodes.filter(Boolean), matchedKeys: [] }

    const matchedKeys: string[] = []

    const traverse = (list: ApiTreeNode[]): ApiTreeNode[] => {
        if (!Array.isArray(list)) return []
        const result: ApiTreeNode[] = []
        for (const item of list) {
            if (!item) continue
            if (item.isFolder) {
                const subChildren = traverse(item.children || [])
                const matchSelf = (item.name || '').toLowerCase().includes(kw)
                if (matchSelf || subChildren.length > 0) {
                    matchedKeys.push(item.id)
                    result.push({
                        ...item,
                        children: subChildren.length > 0 ? subChildren : item.children,
                    })
                }
            } else {
                const matchName = (item.name || '').toLowerCase().includes(kw)
                const matchUrl = (item.url || '').toLowerCase().includes(kw)
                const matchMethod = (item.method || '').toLowerCase().includes(kw)
                if (matchName || matchUrl || matchMethod) {
                    matchedKeys.push(item.id)
                    result.push(item)
                }
            }
        }
        return result
    }

    const filtered = traverse(nodes)
    return { filtered, matchedKeys }
}
