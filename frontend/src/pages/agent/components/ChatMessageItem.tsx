import React, { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Copy, Check } from 'lucide-react'
import { Button, Tooltip } from 'antd'
import MarkdownViewer from '@/components/common/MarkdownViewer'
import { AiMessage } from '@/types'
import { ProcessStepsList, getStepsForMessage } from './ProcessStepsList'
import { MessagePlanCard } from './MessagePlanCard'
import s from './ChatMessageList.module.less'

interface ChatMessageItemProps {
    message: AiMessage
    index: number
    isStreaming: boolean
    onApprovePlan: (planId: string) => void
    onCancelPlan?: (planId: string) => void
    onRetryPlanStep?: (planId: string, stepId: string) => void
}

export const ChatMessageItem: React.FC<ChatMessageItemProps> = React.memo(({
    message,
    index,
    isStreaming,
    onApprovePlan,
    onCancelPlan,
    onRetryPlanStep,
}) => {
    const { t } = useTranslation(['agent', 'common'])
    const isUser = message.role === 'user'
    const [copied, setCopied] = useState(false)

    const steps = useMemo(() => getStepsForMessage(message), [message])

    const handleCopy = () => {
        if (!message.content) return
        navigator.clipboard.writeText(message.content).then(() => {
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        })
    }

    if (isUser) {
        return (
            <div className={s.messageItem}>
                <div className={s.userRow}>
                    <div className={s.userBubble}>
                        {message.images && message.images.length > 0 && (
                            <div className={s.imagesGrid}>
                                {message.images.map((img, i) => (
                                    <img key={i} src={img} alt="attachment" />
                                ))}
                            </div>
                        )}
                        <div className={s.userContent}>{message.content}</div>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className={s.messageItem}>
            <div className={s.assistantBlock}>
                {message.images && message.images.length > 0 && (
                    <div className={s.imagesGrid}>
                        {message.images.map((img, i) => (
                            <img key={i} src={img} alt="attachment" />
                        ))}
                    </div>
                )}

                {/* 推演过程与工具调用 (微型胶囊折叠) */}
                <ProcessStepsList
                    steps={steps}
                    isStreaming={isStreaming}
                />

                {/* Markdown 渲染正文 (支持流式动画与代码块优化) */}
                {message.content && !message.plan && (
                    <MarkdownViewer content={message.content} streaming={isStreaming} />
                )}

                {/* 方案推演卡片 */}
                {message.plan && (
                    <MessagePlanCard
                        plan={message.plan}
                        isGenerating={isStreaming}
                        onApprove={onApprovePlan}
                        onCancel={onCancelPlan}
                        onRetryStep={onRetryPlanStep}
                    />
                )}

                {/* 底部轻量操作栏 */}
                {!isStreaming && message.content && (
                    <div className={s.assistantActions}>
                        <Tooltip title={copied ? t('agent:copiedToClipboard', { defaultValue: '已复制到剪贴板' }) : t('agent:copyFull', { defaultValue: '复制全文' })}>
                            <Button
                                size="small"
                                type="text"
                                className={s.actionBtn}
                                icon={copied ? <Check size={11} color="#10b981" /> : <Copy size={11} />}
                                onClick={handleCopy}
                            >
                                {copied ? t('agent:copied', { defaultValue: '已复制' }) : t('agent:copy', { defaultValue: '复制' })}
                            </Button>
                        </Tooltip>
                    </div>
                )}
            </div>

            {/* 会话轮次微细分隔线 */}
            <div className={s.turnDivider} />
        </div>
    )
})

export default ChatMessageItem
