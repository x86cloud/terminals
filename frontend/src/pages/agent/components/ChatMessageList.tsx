import React, { useRef, useLayoutEffect, useCallback } from 'react'
import { Bot, History } from 'lucide-react'
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

export const ChatMessageList: React.FC<ChatMessageListProps> = ({
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

        // Mark that user has scrolled down away from top
        if (currentScrollTop > 80) {
            hasScrolledDownRef.current = true
        }

        // Only trigger load more if user previously scrolled down, is scrolling UP, and reaches top
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

    return (
        <div ref={listContainerRef} className={s.chatList} onScroll={handleScroll}>
            {hasMore && (
                <div
                    className={s.loadMoreBanner}
                    onClick={handleTriggerLoadMore}
                    title="向上滚动或点击加载更早历史"
                >
                    <History size={13} />
                    <span>查看更早历史对话 (还有 {remainingRounds} 轮)</span>
                </div>
            )}

            {messages.length === 0 ? (
                <div className={s.emptyState}>
                    <Bot size={48} className={s.emptyIcon} />
                    <div className={s.emptyTitle}>xAgent 2.0 多协议任务工作台</div>
                    <div className={s.emptySub}>
                        支持 SSH、MySQL、Redis、MongoDB、SQLite、MQTT 只读诊断与沙箱操作，集成 Plan-Execute-Verify 自动化规划与后台作业引擎。
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
                messages.map((msg, idx) => (
                    <ChatMessageItem
                        key={idx}
                        message={msg}
                        index={idx}
                        isStreaming={isGenerating && idx === messages.length - 1}
                        onApprovePlan={onApprovePlan}
                        onCancelPlan={onCancelPlan}
                        onRetryPlanStep={onRetryPlanStep}
                    />
                ))
            )}

            <div ref={chatEndRef} />
        </div>
    )
}

export default ChatMessageList
