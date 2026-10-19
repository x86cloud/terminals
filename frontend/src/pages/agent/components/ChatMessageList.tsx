import React, { useRef, useState, useEffect, useLayoutEffect, useCallback } from 'react'
import { Bot, History, ArrowDown } from 'lucide-react'
import { AiMessage } from '@/types'
import { ChatMessageItem } from './ChatMessageItem'
import s from './ChatMessageList.module.less'

interface ChatMessageListProps {
    messages: AiMessage[]
    isGenerating: boolean
    chatEndRef: React.RefObject<any>
    onSelectSuggestion: (prompt: string) => void
    onApprovePlan: (planId: string) => void
    onCancelPlan?: (planId: string) => void
    onRetryPlanStep?: (planId: string, stepId: string) => void
    hasMore?: boolean
    remainingRounds?: number
    onLoadMore?: () => void
}

export const ChatMessageList: React.FC<ChatMessageListProps> = React.memo(({
    messages,
    isGenerating,
    chatEndRef,
    onSelectSuggestion,
    onApprovePlan,
    onCancelPlan,
    onRetryPlanStep,
    hasMore,
    remainingRounds,
    onLoadMore,
}) => {
    const listContainerRef = useRef<HTMLDivElement>(null)
    const prevScrollHeightRef = useRef<number>(0)
    const isLoadingMoreRef = useRef<boolean>(false)
    const hasScrolledDownRef = useRef<boolean>(false)
    const prevScrollTopRef = useRef<number>(0)
    const [isAtBottom, setIsAtBottom] = useState<boolean>(true)

    // Preserve scroll position when older messages are loaded at top
    useLayoutEffect(() => {
        if (isLoadingMoreRef.current && listContainerRef.current && prevScrollHeightRef.current > 0) {
            const newScrollHeight = listContainerRef.current.scrollHeight
            const delta = newScrollHeight - prevScrollHeightRef.current
            if (delta > 0) {
                listContainerRef.current.scrollTop += delta
            }
            isLoadingMoreRef.current = false
            prevScrollHeightRef.current = 0
        }
    }, [messages])

    // 流式生成时的智能吸底控制 (仅当用户处于底部时自动吸底，若用户向上滑动则不打扰阅读)
    useEffect(() => {
        if (isGenerating && isAtBottom && chatEndRef.current) {
            chatEndRef.current.scrollIntoView({ behavior: 'auto' })
        }
    }, [messages, isGenerating, isAtBottom, chatEndRef])

    const handleTriggerLoadMore = useCallback(() => {
        if (!hasMore || !onLoadMore || isLoadingMoreRef.current) return
        if (listContainerRef.current) {
            prevScrollHeightRef.current = listContainerRef.current.scrollHeight
            isLoadingMoreRef.current = true
        }
        onLoadMore()
    }, [hasMore, onLoadMore])

    const handleScroll = useCallback(() => {
        if (!listContainerRef.current) return
        const currentScrollTop = listContainerRef.current.scrollTop
        const scrollHeight = listContainerRef.current.scrollHeight
        const clientHeight = listContainerRef.current.clientHeight

        // 检查视口是否接近底部 (距离底部 80px 以内均视为贴底状态)
        const distanceFromBottom = scrollHeight - currentScrollTop - clientHeight
        setIsAtBottom(distanceFromBottom <= 80)

        // 记录用户曾经向下滚动过
        if (currentScrollTop > 80) {
            hasScrolledDownRef.current = true
        }

        // 仅在向上滚动并且触顶时触发加载更早历史
        if (
            hasMore &&
            onLoadMore &&
            !isLoadingMoreRef.current &&
            hasScrolledDownRef.current &&
            currentScrollTop < prevScrollTopRef.current &&
            currentScrollTop <= 15
        ) {
            handleTriggerLoadMore()
        }

        prevScrollTopRef.current = currentScrollTop
    }, [hasMore, onLoadMore, handleTriggerLoadMore])

    const handleScrollToBottom = useCallback(() => {
        setIsAtBottom(true)
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [chatEndRef])

    return (
        <div className={s.chatListWrapper}>
            <div ref={listContainerRef} className={s.chatList} onScroll={handleScroll}>
                {hasMore && (
                    <div
                        className={s.loadMoreBanner}
                        onClick={handleTriggerLoadMore}
                        title="向上滚动或点击加载更早历史"
                    >
                        <History size={12} />
                        <span>查看更早历史对话 (还有 {remainingRounds} 轮)</span>
                    </div>
                )}

                {messages.length === 0 ? (
                    <div className={s.emptyState}>
                        <Bot size={40} className={s.emptyIcon} />
                        <div className={s.emptyTitle}>智能助手</div>
                        <div className={s.emptySub}>
                            支持全数据库运维、云原生容器诊断与 SSH 交互排查。
                        </div>
                        <div className={s.promptSuggestions}>
                            <div
                                className={s.sugCard}
                                onClick={() =>
                                    onSelectSuggestion('检查当前连通服务器的 CPU、内存负载与异常高消耗进程')
                                }
                            >
                                🖥️ 排查当前服务器负载与异常进程
                            </div>
                            <div
                                className={s.sugCard}
                                onClick={() =>
                                    onSelectSuggestion('/plan 执行数据库健康巡检并生成结构化诊断报告')
                                }
                            >
                                🎯 制定数据库健康巡检执行规划
                            </div>
                            <div
                                className={s.sugCard}
                                onClick={() =>
                                    onSelectSuggestion('查看 Redis 当前慢查询日志并分析潜在瓶颈')
                                }
                            >
                                ⚡ 分析 Redis 慢查询日志
                            </div>
                            <div
                                className={s.sugCard}
                                onClick={() =>
                                    onSelectSuggestion('列出工作区目录下的文件并统计各文件大小')
                                }
                            >
                                📂 统计工作目录文件及体积
                            </div>
                        </div>
                    </div>
                ) : (
                    messages.map((msg, idx) => {
                        const itemKey = (msg as any).id || (msg.timestamp ? `${msg.role}_${msg.timestamp}` : `${msg.role}_${idx}`)
                        return (
                            <ChatMessageItem
                                key={itemKey}
                                message={msg}
                                index={idx}
                                isStreaming={isGenerating && idx === messages.length - 1}
                                onApprovePlan={onApprovePlan}
                                onCancelPlan={onCancelPlan}
                                onRetryPlanStep={onRetryPlanStep}
                            />
                        )
                    })
                )}

                <div ref={chatEndRef} />
            </div>

            {/* 当不在底部时展示的悬浮平滑吸底按钮 */}
            {!isAtBottom && messages.length > 0 && (
                <button
                    type="button"
                    className={s.scrollToBottomBtn}
                    onClick={handleScrollToBottom}
                    title="回到底部最新消息"
                >
                    <ArrowDown size={12} />
                    <span>回到底部</span>
                </button>
            )}
        </div>
    )
})

export default ChatMessageList
