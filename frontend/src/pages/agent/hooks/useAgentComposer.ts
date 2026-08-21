import { useState, useRef, useCallback, useEffect } from 'react'
import { API, consumePendingAsk } from '@/api'
import { AiMessage, AgentPlan } from '@/types'

interface UseAgentComposerProps {
    activeSessionId: string
    messages: AiMessage[]
    setMessages: React.Dispatch<React.SetStateAction<AiMessage[]>>
    setNoticeText: (msg: string) => void
}

export function useAgentComposer({
    activeSessionId,
    messages,
    setMessages,
    setNoticeText,
}: UseAgentComposerProps) {
    const [input, setInput] = useState<string>('')
    const [images, setImages] = useState<string[]>([])
    const [isGenerating, setIsGenerating] = useState<boolean>(false)
    const [activeReasoning, setActiveReasoning] = useState<string>('')
    const [activeMode, setActiveMode] = useState<'chat' | 'plan'>('chat')
    const [workspaceDir, setWorkspaceDir] = useState<string>('')

    const chatEndRef = useRef<HTMLDivElement | null>(null)
    const textareaRef = useRef<HTMLTextAreaElement | null>(null)

    // Load initial workspace dir
    useEffect(() => {
        API.agentGetWorkspaceDir()
            .then((dir) => {
                if (dir) setWorkspaceDir(dir)
            })
            .catch(() => {})
    }, [])

    // Check consumePendingAsk on mount
    useEffect(() => {
        const ask = consumePendingAsk()
        if (ask) {
            setInput(ask)
            if (textareaRef.current) {
                textareaRef.current.focus()
            }
        }
    }, [])

    const prevMessagesLengthRef = useRef<number>(0)

    // Scroll to bottom on new message or during generation/reasoning
    useEffect(() => {
        if (
            messages.length > prevMessagesLengthRef.current ||
            isGenerating ||
            activeReasoning
        ) {
            chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
        }
        prevMessagesLengthRef.current = messages.length
    }, [messages, isGenerating, activeReasoning])

    const handleSelectWorkspace = useCallback(async () => {
        try {
            const dir = await API.agentSelectWorkspaceDir()
            if (dir) setWorkspaceDir(dir)
        } catch {
            /* ignore */
        }
    }, [])

    const handleClearWorkspace = useCallback(async () => {
        await API.agentSetWorkspaceDir('')
        setWorkspaceDir('')
    }, [])

    const handleApprovePlan = useCallback(
        async (planId: string) => {
            setMessages((current) => {
                const copy = current.map((msg) => {
                    if (msg.plan && msg.plan.id === planId) {
                        return {
                            ...msg,
                            plan: {
                                ...msg.plan,
                                need_confirm: false,
                                executing: true,
                            },
                        }
                    }
                    return msg
                })
                API.agentSaveSessionMessages(activeSessionId, copy).catch(() => {})
                return copy
            })

            try {
                await API.agentApprovePlan(planId)
            } catch (err: any) {
                const errMsg = err?.message || String(err)
                setNoticeText(`❌ 执行规划失败: ${errMsg}`)
                setMessages((current) => {
                    const copy = current.map((msg) => {
                        if (msg.plan && msg.plan.id === planId) {
                            return {
                                ...msg,
                                plan: {
                                    ...msg.plan,
                                    executing: false,
                                },
                            }
                        }
                        return msg
                    })
                    return copy
                })
            }
        },
        [activeSessionId, setMessages, setNoticeText]
    )

    const handleCancelPlan = useCallback(
        async (planId: string) => {
            try {
                await API.agentCancelPlan(planId)
                setNoticeText('已发送规划停止信号')
                setMessages((current) => {
                    const copy = current.map((msg) => {
                        if (msg.plan && msg.plan.id === planId) {
                            return {
                                ...msg,
                                plan: {
                                    ...msg.plan,
                                    executing: false,
                                },
                            }
                        }
                        return msg
                    })
                    API.agentSaveSessionMessages(activeSessionId, copy).catch(() => {})
                    return copy
                })
            } catch {
                /* ignore */
            }
        },
        [activeSessionId, setMessages, setNoticeText]
    )

    const handleRetryPlanStep = useCallback(
        async (planId: string, stepId: string) => {
            try {
                setNoticeText(`正在重新执行步骤 [${stepId}]...`)
                const updatedStep = await API.agentRetryPlanStep(planId, stepId)
                setMessages((current) => {
                    const copy = current.map((msg) => {
                        if (msg.plan && msg.plan.id === planId) {
                            const nextSteps = msg.plan.steps.map((st) =>
                                st.id === stepId ? { ...st, ...updatedStep } : st
                            )
                            return {
                                ...msg,
                                plan: {
                                    ...msg.plan,
                                    steps: nextSteps,
                                },
                            }
                        }
                        return msg
                    })
                    API.agentSaveSessionMessages(activeSessionId, copy).catch(() => {})
                    return copy
                })
                setNoticeText(`步骤 [${stepId}] 重试执行完成`)
            } catch (err: any) {
                setNoticeText(`❌ 步骤重试失败: ${err?.message || err}`)
            }
        },
        [activeSessionId, setMessages, setNoticeText]
    )

    const handleSend = useCallback(async () => {
        const trimmed = input.trim()
        if (!trimmed && images.length === 0) return
        if (isGenerating) return

        // Check if user typed /plan or in Plan mode
        if (activeMode === 'plan' || trimmed.startsWith('/plan ')) {
            const objective = trimmed.replace(/^\/plan\s*/, '').trim()
            if (!objective) return

            const userMsg: AiMessage = {
                role: 'user',
                content: trimmed,
                images: images.length > 0 ? [...images] : undefined,
                timestamp: Date.now(),
            }

            const assistantMsg: AiMessage = {
                role: 'assistant',
                content: '正在深度分析目标并生成 DAG 步骤规划...',
                reasoning_content:
                    '正在结合系统环境、可用工具、权限策略与依赖关系拓扑生成高可靠执行规划...',
                process_steps: [
                    {
                        id: `plan_think_${Date.now()}`,
                        type: 'think',
                        title: '目标规划与拓扑推演',
                        summary: `正在为目标 "${objective}" 构建步骤规划...`,
                        content: '',
                        status: 'running',
                        timestamp: Date.now(),
                    },
                ],
                timestamp: Date.now(),
            }

            const updatedHistory = [...messages, userMsg, assistantMsg]
            setMessages(updatedHistory)
            setInput('')
            setImages([])
            setIsGenerating(true)
            setActiveReasoning(
                '正在结合系统环境、可用工具、权限策略与依赖关系拓扑生成高可靠执行规划...'
            )
            setNoticeText('')

            try {
                const plan: AgentPlan = await API.agentProposePlan(activeSessionId, objective)
                setMessages((current) => {
                    const copy = [...current]
                    const last = copy[copy.length - 1]
                    if (last && last.role === 'assistant') {
                        last.content =
                            '已为您生成执行规划，请核对各步骤依赖与工具调用，并在确认后点击批准执行：'
                        last.plan = plan
                        const reasoning =
                            plan?.reasoning_content || last.reasoning_content || ''
                        if (reasoning) {
                            last.reasoning_content = reasoning
                        }
                        if (last.process_steps) {
                            last.process_steps = last.process_steps.map((st) => ({
                                ...st,
                                status: 'completed',
                                content:
                                    st.type === 'think'
                                        ? reasoning ||
                                          st.content ||
                                          '已完成目标分析与拓扑步骤依赖推演。'
                                        : st.content,
                                summary: `成功生成包含 ${plan?.steps?.length || 0} 个步骤的执行规划`,
                            }))
                        }
                    }
                    API.agentSaveSessionMessages(activeSessionId, copy).catch(() => {})
                    return copy
                })
            } catch (err: any) {
                const errMsg = err?.message || String(err)
                setMessages((current) => {
                    const copy = [...current]
                    const last = copy[copy.length - 1]
                    if (last && last.role === 'assistant') {
                        last.content = `❌ 生成规划失败: ${errMsg}`
                        if (last.process_steps) {
                            last.process_steps = last.process_steps.map((st) => ({
                                ...st,
                                status: 'failed',
                            }))
                        }
                    }
                    return copy
                })
                setNoticeText(`❌ 生成规划失败: ${errMsg}`)
            } finally {
                setIsGenerating(false)
                setActiveReasoning('')
            }
            return
        }

        const userMsg: AiMessage = {
            role: 'user',
            content: trimmed,
            images: images.length > 0 ? [...images] : undefined,
            timestamp: Date.now(),
        }

        const assistantMsg: AiMessage = {
            role: 'assistant',
            content: '',
            reasoning_content: '',
            process_steps: [],
            timestamp: Date.now(),
        }

        const updatedHistory = [...messages, userMsg, assistantMsg]
        setMessages(updatedHistory)
        setInput('')
        setImages([])
        setIsGenerating(true)
        setActiveReasoning('')
        setNoticeText('')

        try {
            const resp = await API.agentSend(activeSessionId, updatedHistory.slice(0, -1))
            setMessages((current) => {
                const copy = [...current]
                const last = copy[copy.length - 1]
                if (last && last.role === 'assistant') {
                    if (!last.content) {
                        last.content =
                            resp ||
                            (last.reasoning_content
                                ? '已完成深度推演与相关操作。'
                                : '任务已完成。')
                    }
                    if (last.process_steps) {
                        last.process_steps = last.process_steps.map((st) => ({
                            ...st,
                            status: 'completed',
                        }))
                    }
                }
                API.agentSaveSessionMessages(activeSessionId, copy).catch(() => {})
                return copy
            })
        } catch (err: any) {
            const errMsg = err?.message || String(err)
            setNoticeText(`❌ 发送失败: ${errMsg}`)
            setMessages((current) => {
                const copy = [...current]
                const last = copy[copy.length - 1]
                if (last && last.role === 'assistant') {
                    if (!last.content) {
                        last.content = `⚠️ 执行中断: ${errMsg}`
                    }
                    if (last.process_steps) {
                        last.process_steps = last.process_steps.map((st) =>
                            st.status === 'running' ? { ...st, status: 'failed' } : st
                        )
                    }
                }
                return copy
            })
        } finally {
            setIsGenerating(false)
            setActiveReasoning('')
        }
    }, [
        input,
        images,
        isGenerating,
        activeMode,
        messages,
        activeSessionId,
        setMessages,
        setNoticeText,
    ])

    const handleStop = useCallback(async () => {
        await API.agentStopSend(activeSessionId)
        messages.forEach((msg) => {
            if (msg.plan && msg.plan.executing) {
                API.agentCancelPlan(msg.plan.id).catch(() => {})
            }
        })
        setIsGenerating(false)
        setActiveReasoning('')
    }, [activeSessionId, messages])

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSend()
            }
        },
        [handleSend]
    )

    return {
        input,
        setInput,
        images,
        setImages,
        isGenerating,
        setIsGenerating,
        activeReasoning,
        setActiveReasoning,
        activeMode,
        setActiveMode,
        workspaceDir,
        setWorkspaceDir,
        chatEndRef,
        textareaRef,
        handleSelectWorkspace,
        handleClearWorkspace,
        handleApprovePlan,
        handleCancelPlan,
        handleRetryPlanStep,
        handleSend,
        handleStop,
        handleKeyDown,
    }
}

export default useAgentComposer
