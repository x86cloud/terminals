/**
 * 复制文本到系统剪贴板（支持现代 Clipboard API 与 textarea fallback）
 * @param text 要复制的文本
 * @returns 复制成功返回 true，失败返回 false
 */
export async function copyText(text: string): Promise<boolean> {
    try {
        if (navigator?.clipboard?.writeText) {
            await navigator.clipboard.writeText(text)
        } else {
            const textarea = document.createElement('textarea')
            textarea.value = text
            textarea.style.position = 'fixed'
            textarea.style.opacity = '0'
            textarea.style.left = '-9999px'
            document.body.appendChild(textarea)
            textarea.focus()
            textarea.select()
            document.execCommand('copy')
            document.body.removeChild(textarea)
        }
        return true
    } catch (err) {
        console.error('写入剪贴板失败:', err)
        return false
    }
}
