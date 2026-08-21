import React from 'react'
import { User, Bot } from 'lucide-react'
import MarkdownViewer from '@/components/common/MarkdownViewer'
import { AiMessage, AgentPlan } from '@/types'
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

    return (
        <div
            className={`${s.messageRow} ${isUser ? s.userRow : s.assistantRow}`}
        >
            <div className={s.avatar}>
                {isUser ? <User size={16} /> : <Bot size={16} />}
            </div>
            <div className={s.bubble}>
                {message.images && message.images.length > 0 && (
                    <div className={s.imagesGrid}>
                        {message.images.map((img, i) => (
                            <img key={i} src={img} alt="attachment" />
                        ))}
                    </div>
                )}

                {/* Reasoning & Process Steps with Tools */}
                {!isUser && (
                    <ProcessStepsList
                        steps={getStepsForMessage(message)}
                        isStreaming={isStreaming}
                    />
                )}

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
            </div>
        </div>
    )
}

export default ChatMessageItem
