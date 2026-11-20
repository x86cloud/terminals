import { useEffect, useRef, useState } from 'react'
import { Button } from 'antd'
import { AlertCircle, ArrowDown, Bot, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { ApprovalDecision, ChatTurn } from '../agentTypes'
import MessageActions from './MessageActions'
import TimelineItemView from './TimelineItemView'
import UserMessage from './UserMessage'
import s from '../AgentPage.module.less'

interface Props {
    turns: ChatTurn[]
    streaming: boolean
    onSelectStarter: (prompt: string) => void
    onRespondApproval: (approvalId: string, decision: ApprovalDecision) => Promise<void>
    onRespondAskUser: (askId: string, answers: Record<string, any>) => Promise<void>
    onRetryTurn: (turnId: string) => void
}

export default function MessageList({
    turns,
    streaming,
    onSelectStarter,
    onRespondApproval,
    onRespondAskUser,
    onRetryTurn,
}: Props) {
    const { t } = useTranslation('agent')
    const scrollRef = useRef<HTMLDivElement>(null)
    const stickBottomRef = useRef(true)
    const [showScrollBtn, setShowScrollBtn] = useState(false)

    const startersRaw = t('empty.starters', { returnObjects: true })
    const starters = Array.isArray(startersRaw) ? (startersRaw as string[]) : []

    const handleScroll = () => {
        const el = scrollRef.current
        if (!el) return
        const dist = el.scrollHeight - el.scrollTop - el.clientHeight
        const nearBottom = dist < 48
        stickBottomRef.current = nearBottom
        setShowScrollBtn(!nearBottom && turns.length > 0)
    }

    const scrollToBottom = (smooth = true) => {
        const el = scrollRef.current
        if (!el) return
        stickBottomRef.current = true
        setShowScrollBtn(false)
        el.scrollTo({
            top: el.scrollHeight,
            behavior: smooth ? 'smooth' : 'auto',
        })
    }

    useEffect(() => {
        if (stickBottomRef.current) {
            scrollToBottom(false)
        }
    }, [turns, streaming])

    return (
        <>
            <div ref={scrollRef} className={s.scrollArea} onScroll={handleScroll}>
                {turns.length === 0 ? (
                    <div className={s.emptyState}>
                        <div className={s.emptyIcon}>
                            <Bot size={24} />
                        </div>
                        <h2 className={s.emptyTitle}>{t('empty.title')}</h2>
                        <p className={s.emptySub}>{t('empty.subtitle')}</p>
                        <div className={s.starterGrid}>
                            {starters.map((prompt) => (
                                <button
                                    key={prompt}
                                    type="button"
                                    className={s.starterChip}
                                    onClick={() => onSelectStarter(prompt)}
                                >
                                    {prompt}
                                </button>
                            ))}
                        </div>
                    </div>
                ) : (
                    <div className={s.streamInner}>
                        {turns.map((turn, idx) => {
                            if (turn.role === 'user') {
                                return <UserMessage key={turn.id} content={turn.content} />
                            }
                            let userQuestion = ''
                            for (let j = idx - 1; j >= 0; j--) {
                                if (turns[j].role === 'user') {
                                    userQuestion = turns[j].content
                                    break
                                }
                            }
                            const copyContent =
                                turn.content ||
                                [...turn.items]
                                    .reverse()
                                    .find((it) => it.kind === 'content')?.text ||
                                ''
                            return (
                                <div key={turn.id} className={s.assistantRow}>
                                    {turn.items.map((item) => (
                                        <TimelineItemView
                                            key={item.id}
                                            item={item}
                                            onRespondApproval={onRespondApproval}
                                            onRespondAskUser={onRespondAskUser}
                                        />
                                    ))}
                                    {turn.streaming && turn.items.length === 0 && (
                                        <div className={s.toolLineHead} style={{ cursor: 'default' }}>
                                            <Loader2 size={13} className={s.spin} />
                                            <span>{t('stream.planning')}</span>
                                        </div>
                                    )}
                                    {turn.error && (
                                        <div className={s.turnError}>
                                            <AlertCircle size={14} style={{ flexShrink: 0 }} />
                                            <span>{turn.error}</span>
                                        </div>
                                    )}
                                    {!turn.streaming && (
                                        <MessageActions
                                            content={copyContent}
                                            userQuestion={userQuestion}
                                            onRetry={
                                                !streaming ? () => onRetryTurn(turn.id) : undefined
                                            }
                                        />
                                    )}
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>

            {showScrollBtn && (
                <Button
                    shape="circle"
                    size="small"
                    className={s.scrollBottomBtn}
                    icon={<ArrowDown size={14} />}
                    onClick={() => scrollToBottom(true)}
                />
            )}
        </>
    )
}
