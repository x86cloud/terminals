import React, { useEffect, useRef, useState } from 'react'
import MarkdownIt from 'markdown-it'
import hljs from 'highlight.js'
import 'highlight.js/styles/atom-one-dark.css'
import i18n from '@/i18n'
import { copyText as writeClipboardText } from '@/utils'
import s from './MarkdownViewer.module.less'

interface MarkdownViewerProps {
    content?: string
    streaming?: boolean
    className?: string
    onWikiLinkClick?: (target: string) => void
}

function preprocessWikiLinks(raw: string): string {
    // Preserve fenced code blocks and inline code spans untouched
    const segments = raw.split(/(```[\s\S]*?```|`[^`\n]+`)/g)
    return segments
        .map((seg, idx) => {
            if (idx % 2 === 1) return seg
            return seg.replace(/\[\[([^[\]\n]+?)\]\]/g, (_match, inner: string) => {
                const parts = inner.split('|')
                const target = parts[0].split('#')[0].trim()
                const label = (parts[1] || parts[0]).trim()
                if (!target) return _match
                return `[${label}](#wiki-link:${encodeURIComponent(target)})`
            })
        })
        .join('')
}

// 初始化全局单例 markdown-it 解析器，配置极致性能与 GFM 规则
const md = new MarkdownIt({
    html: false,
    xhtmlOut: false,
    breaks: true,
    linkify: true,
    typographer: false,
})

// 辅助函数：渲染统一且紧凑的代码块卡片
function renderCodeCard(content: string, rawLang: string): string {
    const validLang = rawLang && hljs.getLanguage(rawLang) ? rawLang : ''
    // 去除首尾多余换行符，防止 pre-wrap 模式下在代码块首尾渲染空白空行
    const cleanContent = content.replace(/\r\n/g, '\n').replace(/^\n+/, '').replace(/\n+$/, '')
    let highlighted = ''
    try {
        if (validLang) {
            highlighted = hljs.highlight(cleanContent, { language: validLang, ignoreIllegals: true }).value
        } else {
            highlighted = md.utils.escapeHtml(cleanContent)
        }
    } catch {
        highlighted = md.utils.escapeHtml(cleanContent)
    }

    const lines = cleanContent.split('\n')
    const lineCount = lines.length
    const isLongCode = lineCount > 25
    const langDisplay = validLang || (rawLang ? rawLang.toLowerCase() : 'code')
    const safeLang = md.utils.escapeHtml(langDisplay)
    const safeClassLang = validLang ? `language-${md.utils.escapeHtml(validLang)}` : ''
    const rawCodeAttr = encodeURIComponent(cleanContent)
    const copyTitle = md.utils.escapeHtml(i18n.t('common:copyCode', '复制代码'))
    const copyLabel = md.utils.escapeHtml(i18n.t('common:copy', '复制'))
    const expandText = md.utils.escapeHtml(
        i18n.t('common:expandAllCode', '展开全部代码 ({{count}} 行)', { count: lineCount })
    )

    // 注意：整个 HTML 必须保持单行紧凑无多余模板换行与制表符缩进，避免在 pre/code 内被解析为实际空行
    return `<div class="${s.codeBlockContainer} ${isLongCode ? s.collapsibleCode : ''}"><div class="${s.codeHeader}"><span class="${s.langTag}">${safeLang}</span><button type="button" class="${s.copyCodeBtn}" data-raw-code="${rawCodeAttr}" title="${copyTitle}"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg><span>${copyLabel}</span></button></div><div class="${s.codeContentWrap}"><pre class="${s.codePre}"><code class="hljs ${s.wrapCode} ${safeClassLang}">${highlighted}</code></pre>${isLongCode ? `<div class="${s.codeExpandOverlay}"><button type="button" class="${s.expandCodeBtn}">${expandText}</button></div>` : ''}</div></div>\n`
}

// 自定义代码块 (fence 语法 ```lang ... ```) 渲染器
md.renderer.rules.fence = function (tokens, idx) {
    const token = tokens[idx]
    const info = token.info ? md.utils.unescapeAll(token.info).trim() : ''
    const langName = info ? info.split(/\s+/g)[0] : ''
    return renderCodeCard(token.content, langName)
}

// 自定义缩进代码块 (4空格/Tab 缩进) 渲染器
md.renderer.rules.code_block = function (tokens, idx) {
    const token = tokens[idx]
    return renderCodeCard(token.content, '')
}

// 默认链接在系统外部浏览器/新窗口打开
const defaultRender = md.renderer.rules.link_open || function (tokens, idx, options, _env, self) {
    return self.renderToken(tokens, idx, options)
}
md.renderer.rules.link_open = function (tokens, idx, options, env, self) {
    const href = String(tokens[idx].attrGet('href') || '')
    if (!href.startsWith('#wiki-link:')) {
        tokens[idx].attrSet('target', '_blank')
        tokens[idx].attrSet('rel', 'noopener noreferrer')
    }
    return defaultRender(tokens, idx, options, env, self)
}

// 表格包装容器，确保在窄屏下支持水平滚动
md.renderer.rules.table_open = function () {
    return `<div class="${s.tableContainer}"><table>`
}
md.renderer.rules.table_close = function () {
    return `</table></div>`
}

export const MarkdownViewer: React.FC<MarkdownViewerProps> = React.memo(({
    content = '',
    streaming = false,
    className = '',
    onWikiLinkClick,
}) => {
    const containerRef = useRef<HTMLDivElement>(null)
    const [renderedHtml, setRenderedHtml] = useState<string>('')
    const rafIdRef = useRef<number | null>(null)
    const latestContentRef = useRef<string>(content)
    const copyTimersRef = useRef<Set<number>>(new Set())

    latestContentRef.current = content

    useEffect(() => {
        const timers = copyTimersRef.current
        return () => {
            timers.forEach((id) => window.clearTimeout(id))
            timers.clear()
            if (rafIdRef.current !== null) {
                cancelAnimationFrame(rafIdRef.current)
                rafIdRef.current = null
            }
        }
    }, [])

    // 流式 60fps 节流渲染：不取消已排队的 rAF，确保高频 chunk 到达时持续平滑刷新
    useEffect(() => {
        const renderText = (raw: string) =>
            md.render(onWikiLinkClick ? preprocessWikiLinks(raw || '') : raw || '')

        if (!streaming) {
            if (rafIdRef.current !== null) {
                cancelAnimationFrame(rafIdRef.current)
                rafIdRef.current = null
            }
            setRenderedHtml(renderText(content))
            return
        }

        if (rafIdRef.current === null) {
            rafIdRef.current = requestAnimationFrame(() => {
                rafIdRef.current = null
                setRenderedHtml(renderText(latestContentRef.current))
            })
        }
    }, [content, streaming, onWikiLinkClick])

    // 事件委托：处理复制代码按钮、展开超长代码块与 Wiki 双向链接点击
    const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
        const target = e.target as HTMLElement
        const wikiAnchor = target.closest('a[href^="#wiki-link:"]') as HTMLAnchorElement | null
        if (wikiAnchor && onWikiLinkClick) {
            e.preventDefault()
            e.stopPropagation()
            const href = wikiAnchor.getAttribute('href') || ''
            const encoded = href.slice('#wiki-link:'.length)
            if (encoded) {
                onWikiLinkClick(decodeURIComponent(encoded))
            }
            return
        }
        const copyBtn = target.closest(`.${s.copyCodeBtn}`) as HTMLButtonElement | null
        if (copyBtn) {
            e.stopPropagation()
            e.preventDefault()
            const encoded = copyBtn.getAttribute('data-raw-code')
            if (encoded) {
                const code = decodeURIComponent(encoded)
                void writeClipboardText(code).then((ok) => {
                    if (!ok || !copyBtn.isConnected) return
                    const span = copyBtn.querySelector('span')
                    if (span) {
                        const originalText = span.textContent
                        span.textContent = i18n.t('common:copied', '已复制')
                        copyBtn.classList.add(s.copied)
                        const timerId = window.setTimeout(() => {
                            copyTimersRef.current.delete(timerId)
                            if (span.isConnected) {
                                span.textContent = originalText
                            }
                            if (copyBtn.isConnected) {
                                copyBtn.classList.remove(s.copied)
                            }
                        }, 2000)
                        copyTimersRef.current.add(timerId)
                    }
                })
            }
            return
        }

        const expandBtn = target.closest(`.${s.expandCodeBtn}`) as HTMLButtonElement | null
        if (expandBtn) {
            e.stopPropagation()
            e.preventDefault()
            const card = expandBtn.closest(`.${s.codeBlockContainer}`)
            if (card) {
                card.classList.toggle(s.expanded)
                const isExpanded = card.classList.contains(s.expanded)
                expandBtn.textContent = isExpanded
                    ? i18n.t('common:collapseCode', '收起代码')
                    : i18n.t('common:expandCode', '展开全部代码')
            }
        }
    }

    return (
        <div
            ref={containerRef}
            className={`${s.markdownWrapper} ${className}`}
            onClick={handleClick}
        >
            <div dangerouslySetInnerHTML={{ __html: renderedHtml }} />
        </div>
    )
})

export default MarkdownViewer
