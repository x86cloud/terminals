import { useState } from 'react'
import { message } from 'antd'
import { BookPlus, Check, Copy, RotateCcw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { API } from '@/api'
import { useSession } from '@/contexts/SessionContext'
import { copyText } from '@/utils'
import s from '../AgentPage.module.less'

interface Props {
    content: string
    userQuestion?: string
    onRetry?: () => void
}

export default function MessageActions({ content, userQuestion, onRetry }: Props) {
    const { t } = useTranslation('agent')
    const { dispatchAgentPrompt } = useSession()
    const [copied, setCopied] = useState(false)
    const [savingWiki, setSavingWiki] = useState(false)

    const handleCopy = () => {
        if (!content) return
        void copyText(content).then((ok) => {
            if (!ok) return
            setCopied(true)
            window.setTimeout(() => setCopied(false), 1500)
        })
    }

    const handleSaveToWiki = async () => {
        if (!content || savingWiki) return
        setSavingWiki(true)
        try {
            const rawTitle = (userQuestion || content.split('\n')[0] || 'agent-session-note')
                .replace(/[#*`]/g, '')
                .trim()
                .slice(0, 48)
            const fullText = userQuestion
                ? `## 提问\n\n${userQuestion}\n\n## 主 Agent 诊断与总结\n\n${content}`
                : content
            const res = await API.wikiIngestText(rawTitle || 'agent-session-note', fullText, 'agent-session')
            dispatchAgentPrompt(
                `我已将刚才的排障/对话结论原样归档至 \`${res.relPath}\`。请调用 \`wiki_index\` 与 \`wiki_read\` 查阅后，按 \`SCHEMA.md\` 规范将其提炼编译为结构化 Wiki 词条（放在 \`wiki/runbooks/\`、\`wiki/entities/\` 或 \`wiki/summaries/\`），补全 \`[[双向链接]]\` 并更新 \`index.md\` 与 \`log.md\`。`
            )
        } catch (err) {
            message.error(typeof err === 'string' ? err : String(err))
        } finally {
            setSavingWiki(false)
        }
    }

    return (
        <div className={s.msgActions}>
            {content && (
                <button type="button" className={s.actionBtn} onClick={handleCopy}>
                    {copied ? <Check size={12} /> : <Copy size={12} />}
                    <span>{copied ? t('actions.copied') : t('actions.copy')}</span>
                </button>
            )}
            {content && (
                <button
                    type="button"
                    className={s.actionBtn}
                    disabled={savingWiki}
                    onClick={() => void handleSaveToWiki()}
                >
                    <BookPlus size={12} />
                    <span>{savingWiki ? t('actions.savingToWiki') : t('actions.saveToWiki')}</span>
                </button>
            )}
            {onRetry && (
                <button type="button" className={s.actionBtn} onClick={onRetry}>
                    <RotateCcw size={12} />
                    <span>{t('actions.retry')}</span>
                </button>
            )}
        </div>
    )
}
