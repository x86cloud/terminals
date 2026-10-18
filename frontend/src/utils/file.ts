/**
 * 通过浏览器触发 Blob 文件下载，并自动释放 ObjectURL 内存
 */
export function downloadBlob(filename: string, blob: Blob): void {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.style.display = 'none'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => {
        URL.revokeObjectURL(url)
    }, 1000)
}

/**
 * 将纯文本或 JSON 字符串通过浏览器直接下载为本地文件
 * @param filename 下载的文件名（含后缀）
 * @param content 文本内容
 * @param mimeType MIME 类型，默认 'text/plain;charset=utf-8'
 */
export function downloadText(
    filename: string,
    content: string,
    mimeType: string = 'text/plain;charset=utf-8'
): void {
    const blob = new Blob([content], { type: mimeType })
    downloadBlob(filename, blob)
}

export function joinRemote(dir: string, name: string): string {
    if (!dir || dir === '/') return `/${name}`
    return `${dir.replace(/\/+$/, '')}/${name}`
}

export function parentRemote(p: string): string {
    if (!p || p === '/') return '/'
    const trimmed = p.replace(/\/+$/, '')
    const idx = trimmed.lastIndexOf('/')
    if (idx <= 0) return '/'
    return trimmed.slice(0, idx)
}

export function base64ToBytes(b64: string): Uint8Array {
    if (!b64) return new Uint8Array(0)
    try {
        const binary = atob(b64)
        const bytes = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
        return bytes
    } catch {
        return new Uint8Array(0)
    }
}

export function bytesToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer)
    let binary = ''
    const chunk = 0x8000
    for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)) as any)
    }
    return btoa(binary)
}

/**
 * 将 UTF-8 字符串安全编码为 Base64（利用标准 TextEncoder 与 bytesToBase64，替代已废弃的 unescape/escape）
 */
export function stringToBase64(str: string): string {
    if (!str) return ''
    const bytes = new TextEncoder().encode(str)
    return bytesToBase64(bytes.buffer)
}

/**
 * 将 Base64 字符串解码为 UTF-8 字符串（利用标准 TextDecoder，替代已废弃的 unescape/escape）
 */
export function base64ToString(b64: string): string {
    if (!b64) return ''
    const binary = atob(b64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i)
    }
    return new TextDecoder().decode(bytes)
}

export const toBase64 = stringToBase64
export const fromBase64 = base64ToString

// w 访问 Wails runtime（对话框等）
export const w: any = (window as any).runtime || (window as any).go?.runtime

// openFileDialog 弹出打开文件对话框，返回选中的文件路径（取消则返回 null）
export async function openFileDialog(title: string, filters?: { displayName: string; pattern: string }[]): Promise<string | null> {
    if (!w) {
        throw new Error('当前环境不支持文件对话框')
    }
    const opts: any = { Title: title }
    if (filters && filters.length) {
        opts.Filters = filters.map((f) => [f.displayName, f.pattern])
    }
    const fn = w.OpenFileDialog || (w.Window && w.Window.OpenFileDialog)
    if (!fn) throw new Error('当前环境不支持文件对话框')
    const path = await fn(opts)
    return path || null
}

// saveFileDialog 弹出保存文件对话框，返回目标路径（取消则返回 null）
export async function saveFileDialog(title: string, defaultName: string): Promise<string | null> {
    if (!w) {
        throw new Error('当前环境不支持文件对话框')
    }
    const opts: any = { Title: title, DefaultFilename: defaultName }
    const fn = w.SaveFileDialog || (w.Window && w.Window.SaveFileDialog)
    if (!fn) throw new Error('当前环境不支持文件对话框')
    const path = await fn(opts)
    return path || null
}
