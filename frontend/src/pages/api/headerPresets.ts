export interface HeaderPreset {
    key: string
    defaultValue?: string
    values: string[]
}

export const COMMON_HEADERS: HeaderPreset[] = [
    {
        key: 'Content-Type',
        defaultValue: 'application/json',
        values: [
            'application/json',
            'application/x-www-form-urlencoded',
            'multipart/form-data',
            'application/xml',
            'text/plain',
            'text/html',
            'application/octet-stream',
        ],
    },
    {
        key: 'Authorization',
        defaultValue: 'Bearer ',
        values: [
            'Bearer ',
            'Basic ',
            'Token ',
            'JWT ',
        ],
    },
    {
        key: 'Accept',
        defaultValue: 'application/json, text/plain, */*',
        values: [
            'application/json, text/plain, */*',
            'application/json',
            '*/*',
            'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'application/octet-stream',
        ],
    },
    {
        key: 'Accept-Language',
        defaultValue: 'zh-CN,zh;q=0.9,en;q=0.8',
        values: [
            'zh-CN,zh;q=0.9,en;q=0.8',
            'zh-CN,zh;q=0.9',
            'en-US,en;q=0.9',
            '*',
        ],
    },
    {
        key: 'Accept-Encoding',
        defaultValue: 'gzip, deflate, br',
        values: [
            'gzip, deflate, br',
            'gzip, deflate',
            'gzip',
            'br',
            'identity',
        ],
    },
    {
        key: 'Cache-Control',
        defaultValue: 'no-cache',
        values: [
            'no-cache',
            'no-store',
            'max-age=0',
            'must-revalidate',
            'no-cache, no-store, must-revalidate',
        ],
    },
    {
        key: 'User-Agent',
        defaultValue: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        values: [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'PostmanRuntime/7.36.0',
            'curl/8.4.0',
        ],
    },
    {
        key: 'Connection',
        defaultValue: 'keep-alive',
        values: [
            'keep-alive',
            'close',
        ],
    },
    {
        key: 'Cookie',
        defaultValue: '',
        values: [],
    },
    {
        key: 'Origin',
        defaultValue: 'http://localhost:3000',
        values: [
            'http://localhost:3000',
            'http://localhost:8080',
            'http://127.0.0.1:3000',
            'http://localhost:5173',
        ],
    },
    {
        key: 'Referer',
        defaultValue: 'http://localhost:3000/',
        values: [
            'http://localhost:3000/',
            'http://localhost:8080/',
            'http://localhost:5173/',
        ],
    },
    {
        key: 'X-Requested-With',
        defaultValue: 'XMLHttpRequest',
        values: [
            'XMLHttpRequest',
        ],
    },
    {
        key: 'X-Forwarded-For',
        defaultValue: '127.0.0.1',
        values: [
            '127.0.0.1',
        ],
    },
    {
        key: 'X-Token',
        defaultValue: '',
        values: [],
    },
    {
        key: 'X-Api-Key',
        defaultValue: '',
        values: [],
    },
    {
        key: 'Sec-Fetch-Mode',
        defaultValue: 'cors',
        values: [
            'cors',
            'navigate',
            'no-cors',
            'same-origin',
        ],
    },
    {
        key: 'Sec-Fetch-Site',
        defaultValue: 'same-origin',
        values: [
            'same-origin',
            'cross-site',
            'same-site',
            'none',
        ],
    },
    {
        key: 'Pragma',
        defaultValue: 'no-cache',
        values: [
            'no-cache',
        ],
    },
    {
        key: 'If-None-Match',
        defaultValue: '*',
        values: [
            '*',
        ],
    },
    {
        key: 'If-Modified-Since',
        defaultValue: '',
        values: [],
    },
]

// 预构筑常用的 Header Key 补全项
export const COMMON_HEADER_KEYS: { value: string }[] = COMMON_HEADERS.map((h) => ({
    value: h.key,
}))

// 根据当前 Header Key 查找对应候选 Value 列表
export function getHeaderValueOptions(headerName: string): { value: string }[] {
    if (!headerName) return []
    const trimmed = headerName.trim().toLowerCase()
    const found = COMMON_HEADERS.find((h) => h.key.toLowerCase() === trimmed)
    return found ? found.values.map((v) => ({ value: v })) : []
}

// 获取某个 Header Key 的推荐默认 Value
export function getHeaderDefaultValue(headerName: string): string | undefined {
    if (!headerName) return undefined
    const trimmed = headerName.trim().toLowerCase()
    const found = COMMON_HEADERS.find((h) => h.key.toLowerCase() === trimmed)
    return found?.defaultValue
}
