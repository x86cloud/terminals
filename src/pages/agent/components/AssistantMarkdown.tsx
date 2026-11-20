import { MarkdownViewer } from '@/components/common/MarkdownViewer'
import s from '../AgentPage.module.less'

interface Props {
    content: string
    streaming?: boolean
}

export default function AssistantMarkdown({ content, streaming }: Props) {
    if (!content) return null
    return <MarkdownViewer content={content} streaming={streaming} className={s.markdownProse} />
}
