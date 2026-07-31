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
    const binary = atob(b64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return bytes
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

export function errorMessage(err: unknown): string {
    if (!err) return '未知错误'
    if (typeof err === 'string') return err
    if (err instanceof Error) return err.message
    return String(err)
}
