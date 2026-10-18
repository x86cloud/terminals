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
