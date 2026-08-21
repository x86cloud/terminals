import React, { useState } from 'react'
import XMarkdown, { ComponentProps } from '@ant-design/x-markdown'
import { Copy, Check } from 'lucide-react'
import s from './MarkdownViewer.module.less'

interface MarkdownViewerProps {
    content?: string
    streaming?: boolean
    className?: string
}

// 模块级常量：避免每次渲染新建对象引用，导致 XMarkdown 重复初始化流式状态引起闪烁
const STREAMING_ACTIVE = { hasNextChunk: true, enableAnimation: false }
const STREAMING_IDLE = { hasNextChunk: false, enableAnimation: false }

// const CodeBlock: React.FC<{ code: string; lang?: string }> = ({ code, lang }) => {
//     const [copied, setCopied] = useState(false)

//     const handleCopy = () => {
//         if (!code) return
//         navigator.clipboard.writeText(code).then(() => {
//             setCopied(true)
//             setTimeout(() => setCopied(false), 2000)
//         })
//     }

//     return (
//         <div className={s.codeBlockContainer}>
//             <div className={s.codeHeader}>
//                 <span className={s.langTag}>{lang || 'code'}</span>
//                 <button
//                     className={`${s.copyBtn} ${copied ? s.copied : ''}`}
//                     onClick={handleCopy}
//                     title="复制代码"
//                 >
//                     <Icon name={copied ? 'check' : 'copy'} size={12} />
//                     <span>{copied ? '已复制' : '复制'}</span>
//                 </button>
//             </div>
//             <pre className={s.codeContent}>
//                 <code>{code}</code>
//             </pre>
//         </div>
//     )
// }

// const CustomCode: React.FC<ComponentProps> = (props) => {
//     const { children, lang, block } = props

//     // Handle string content extraction
//     const rawCode = typeof children === 'string' ? children : String(children || '')

//     if (block) {
//         return <CodeBlock code={rawCode.replace(/\n$/, '')} lang={lang} />
//     }

//     return <code className={s.inlineCode}>{children}</code>
// }

export const MarkdownViewer: React.FC<MarkdownViewerProps> = ({
    content = '',
    streaming = false,
    className = '',
}) => {
    return (
        <div className={`${s.markdownWrapper} ${className}`}>
            <XMarkdown
                content={content}
                openLinksInNewTab={true}
                streaming={streaming ? STREAMING_ACTIVE : STREAMING_IDLE}
            // components={{
            //     code: CustomCode,
            // }}
            />
        </div>
    )
}

export default MarkdownViewer
