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

/**
 * 格式化字节大小（formatSize 别名，统一全项目数据量展示）
 */
export function formatBytes(bytes: number): string {
    if (!bytes || bytes <= 0) return '0 B'
    return formatSize(bytes)
}

export function formatTime(unixSeconds: number): string {
    if (!unixSeconds) return '-'
    const d = new Date(unixSeconds * 1000)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
