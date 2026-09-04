export function formatSize(bytes: number): string {
    if (bytes < 0) return '-'
    if (bytes < 1024) return `${bytes} B`
    const units = ['KB', 'MB', 'GB', 'TB']
    let value = bytes / 1024
    let i = 0
    while (value >= 1024 && i < units.length - 1) {
        value /= 1024
        i++
    }
    return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[i]}`
}

export function formatTime(unixSeconds: number): string {
    if (!unixSeconds) return '-'
    const d = new Date(unixSeconds * 1000)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
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

export function isUserCancelled(err: unknown): boolean {
    if (!err) return false
    const msg = (typeof err === 'string' ? err : err instanceof Error ? err.message : String(err)).toLowerCase()
    return msg.includes('cancelled') || msg.includes('canceled')
}

export function errorMessage(err: unknown): string {
    if (!err) return '未知错误'
    if (isUserCancelled(err)) return ''
    if (typeof err === 'string') return err
    if (err instanceof Error) return err.message
    return String(err)
}

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

/**
 * 比较数据库单元格原始值与编辑输入值是否等价。
 * 解决数字类型（如 100 与 "100"）、布尔类型（如 true 与 "true"）、NULL 等因为类型差异误判为已修改的问题。
 */
export function isSameCellValue(origVal: any, newVal: any): boolean {
    const isOrigNull = origVal === null || origVal === undefined
    const isNewNull = newVal === null || newVal === undefined

    // 两者皆为 NULL / undefined
    if (isOrigNull && isNewNull) return true
    if (isOrigNull !== isNewNull) return false

    // 严格全等（同类型同值）
    if (origVal === newVal) return true

    // 原始值为数字类型，或编辑值为数字格式
    if (typeof origVal === 'number' || (typeof origVal === 'string' && !isNaN(Number(origVal)) && origVal.trim() !== '')) {
        const sOrig = String(origVal).trim()
        const sNew = String(newVal).trim()
        if (sOrig === sNew) return true

        const nOrig = Number(origVal)
        const nNew = Number(newVal)
        if (!isNaN(nOrig) && !isNaN(nNew) && sNew !== '' && sOrig !== '') {
            return nOrig === nNew
        }
    }

    // 原始值为布尔类型
    if (typeof origVal === 'boolean') {
        const s = String(newVal).trim().toLowerCase()
        if (origVal === true && (s === 'true' || s === '1' || s === 't')) return true
        if (origVal === false && (s === 'false' || s === '0' || s === 'f')) return true
        return false
    }

    // 原始值为复杂对象（JSON / Array）
    if (typeof origVal === 'object') {
        try {
            if (JSON.stringify(origVal) === String(newVal).trim()) return true
        } catch {}
    }

    // 字符串比较
    return String(origVal).trim() === String(newVal).trim()
}

/**
 * 将编辑输入的字符串还原为对应原始值的类型（数字、布尔等）
 */
export function coerceCellValue(origVal: any, val: any, isNull: boolean): any {
    if (isNull || val === null || val === undefined) return null

    if (typeof origVal === 'number') {
        const s = String(val).trim()
        if (s !== '' && !isNaN(Number(s))) {
            const n = Number(s)
            if (Number.isSafeInteger(n) || s.includes('.')) {
                return n
            }
        }
        return s
    }

    if (typeof origVal === 'boolean') {
        const s = String(val).trim().toLowerCase()
        if (s === 'true' || s === '1') return true
        if (s === 'false' || s === '0') return false
    }

    return val
}
