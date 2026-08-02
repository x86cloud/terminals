import {ApiHeader, ApiMethod, ApiAuth, ApiRequest, ApiResponse, ApiMode, WsStatus, WsMessage, ApiHistoryItem} from '../../types'

export type {
    ApiHeader,
    ApiMethod,
    ApiAuth,
    ApiRequest,
    ApiResponse,
    ApiMode,
    WsStatus,
    WsMessage,
    ApiHistoryItem,
}

export const METHODS: ApiMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']

export const BODY_TYPES: Array<{ value: string; label: string; ct: string }> = [
    {value: 'none', label: '无', ct: ''},
    {value: 'json', label: 'JSON', ct: 'application/json'},
    {value: 'text', label: '文本', ct: 'text/plain'},
    {value: 'xml', label: 'XML', ct: 'application/xml'},
]

export const HISTORY_KEY = 'api_client_history'

export type ConfigTab = 'headers' | 'body' | 'auth' | 'options' | 'messages'

export function emptyAuth(): ApiAuth {
    return {type: 'none', username: '', password: '', token: ''}
}

export function looksLikeJson(s: string): boolean {
    const t = s.trim()
    return (t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'))
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
