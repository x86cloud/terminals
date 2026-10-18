import { message } from 'antd'

export interface CopyOptions {
    /** 成功的直接提示文案，如 '已复制整行 JSON' */
    successMsg?: string
    /** 复制的目标内容标签，如 '值内容' 会生成 '已复制值内容' */
    label?: string
    /** 是否展示 Toast 提示，默认 true */
    showToast?: boolean
}

/**
 * 复制文本到系统剪贴板并给出交互反馈（支持现代 Clipboard API 与 textarea fallback）
 * @param text 要复制的文本
 * @param optionsOrLabel 可传入成功提示文案、label 字符串，或配置对象
 */
export async function copyText(text: string, optionsOrLabel?: string | CopyOptions): Promise<boolean> {
    const opts: CopyOptions =
        typeof optionsOrLabel === 'string'
            ? { successMsg: optionsOrLabel }
            : optionsOrLabel || {}

    const showToast = opts.showToast !== false

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

        if (showToast) {
            let msg: string
            if (typeof optionsOrLabel === 'string') {
                msg = optionsOrLabel.startsWith('已复制') ? optionsOrLabel : `已复制${optionsOrLabel}`
            } else if (opts.successMsg) {
                msg = opts.successMsg
            } else if (opts.label) {
                msg = `已复制${opts.label}`
            } else {
                msg = '已复制到剪贴板'
            }
            message.success(msg)
        }
        return true
    } catch (err) {
        console.error('写入剪贴板失败:', err)
        if (showToast) {
            message.error('复制失败，请重试')
        }
        return false
    }
}

/**
 * copyText 的完全别名，保证向后兼容性
 */
export const copyTextToClipboard = copyText
