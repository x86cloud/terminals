import React, { useState } from 'react'
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

export const ChatMessageItem: React.FC<ChatMessageItemProps> = ({
    message,
    index,
    isStreaming,
    onApprovePlan,
    onCancelPlan,
    onRetryPlanStep,
}) => {
    const isUser = message.role === 'user'
    const [copied, setCopied] = useState(false)

    const handleCopyAssistant = () => {
        if (!message.content) return
        navigator.clipboard.writeText(message.content).then(() => {
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        })
    }

    if (isUser) {
        return (
            <div className={s.messageItem}>
                <div className={s.userBlock}>
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

                {/* Reasoning & Process Steps with Tools */}
                <ProcessStepsList
                    steps={getStepsForMessage(message)}
                    isStreaming={isStreaming}
                />

                {/* Flat Markdown Viewer */}
                {message.content && <MarkdownViewer content={message.content} />}

                {/* Embedded Plan Card */}
                {message.plan && (
                    <MessagePlanCard
                        plan={message.plan}
                        onApprove={onApprovePlan}
                        onCancel={onCancelPlan}
                        onRetryStep={onRetryPlanStep}
                    />
                )}

                {/* Bottom Action Bar */}
                {!isStreaming && message.content && (
                    <div className={s.assistantActions}>
                        <Tooltip title={copied ? '已复制到剪贴板' : '复制全文'}>
                            <Button
                                size="small"
                                type="text"
                                className={s.actionBtn}
                                icon={copied ? <Check size={12} color="var(--ok)" /> : <Copy size={12} />}
                                onClick={handleCopyAssistant}
                            >
                                {copied ? '已复制' : '复制全文'}
                            </Button>
                        </Tooltip>
                    </div>
                )}
            </div>

            {/* Subtle divider separating Q&A rounds */}
            <div className={s.turnDivider} />
        </div>
    )
}

export default ChatMessageItem
