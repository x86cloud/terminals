import { useState, useRef, useCallback, useEffect } from 'react'
import { API, consumePendingAsk } from '@/api'
import { AiMessage, AgentPlan } from '@/types'
import { message } from 'antd'

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
    const [activeCommand, setActiveCommand] = useState<'plan' | 'grill-me' | null>(null)
    const activeMode: 'chat' | 'plan' = activeCommand === 'plan' ? 'plan' : 'chat'
    const setActiveMode = useCallback((mode: 'chat' | 'plan') => {
        setActiveCommand(mode === 'plan' ? 'plan' : null)
    }, [])
    const [workspaceDir, setWorkspaceDir] = useState<string>('')

    const chatEndRef = useRef<HTMLDivElement | null>(null)
    const textareaRef = useRef<HTMLTextAreaElement | null>(null)

    // Load initial workspace dir
    useEffect(() => {
        API.agentGetWorkspaceDir()
            .then((dir) => {
                if (dir) setWorkspaceDir(dir)
            })
            .catch(() => { })
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

    // Reset generation state on active session change
    useEffect(() => {
        setIsGenerating(false)
        setActiveReasoning('')
    }, [activeSessionId])

    // Safety watchdog: prevent isGenerating from being stuck indefinitely in case of dropped events
    useEffect(() => {
        if (!isGenerating) return
        const watchdog = setTimeout(() => {
            setIsGenerating(false)
            setActiveReasoning('')
            setNoticeText('智能体响应超时或已停止')
        }, 120000)
        return () => clearTimeout(watchdog)
    }, [isGenerating, setNoticeText])

    // Scroll to bottom only on new messages added or streaming reasoning
    useEffect(() => {
        if (messages.length > prevMessagesLengthRef.current || (isGenerating && activeReasoning)) {
            chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
        }
        prevMessagesLengthRef.current = messages.length
    }, [messages.length, isGenerating, activeReasoning])

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
            if (isGenerating) return

            // 1. 本地更新消息中对应 plan 的状态为 approved，并将更早未批准方案标记为 expired
            let updatedMessages: AiMessage[] = []
            setMessages((current) => {
                const copy = current.map((msg) => {
                    if (msg.plan) {
                        if (msg.plan.id === planId) {
                            return {
                                ...msg,
                                plan: {
                                    ...msg.plan,
                                    status: 'approved' as const,
                                    need_confirm: false,
                                },
                            }
                        } else if (msg.plan.status !== 'approved') {
                            return {
                                ...msg,
                                plan: {
                                    ...msg.plan,
                                    status: 'expired' as const,
                                    need_confirm: false,
                                },
                            }
                        }
                    }
                    return msg
                })
                updatedMessages = copy
                return copy
            })
            if (updatedMessages.length > 0) {
                API.agentSaveSessionMessages(activeSessionId, updatedMessages).catch(() => { })
            }

            // 2. 调用后端标记批准
            try {
                await API.agentApprovePlan(planId)
            } catch (err: any) {
                // ignore
            }

            // 3. 自动切换为对话模式
            setActiveMode('chat')

            // 4. 自动向智能体发送执行指令，启动自主执行循环
            const userMsg: AiMessage = {
                role: 'user',
                content: '已批准实施方案，请按步骤开始执行并进行验证。',
                timestamp: Date.now(),
            }

            const assistantMsg: AiMessage = {
                role: 'assistant',
                content: '',
                reasoning_content: '',
                process_steps: [],
                timestamp: Date.now(),
            }

            setIsGenerating(true)
            setActiveReasoning('')
            setNoticeText('')

            let updatedHistory: AiMessage[] = []
            setMessages((curr) => {
                updatedHistory = [...curr, userMsg, assistantMsg]
                return updatedHistory
            })

            API.agentSend(activeSessionId, updatedHistory.slice(0, -1)).then((resp) => {
                let toSave: AiMessage[] | null = null
                setMessages((finalCurr) => {
                    const copy = [...finalCurr]
                    const lastIdx = copy.length - 1
                    const last = copy[lastIdx]
                    if (last && last.role === 'assistant') {
                        const newContent = last.content || resp || (last.reasoning_content ? '已完成实施方案执行。' : '方案执行完毕。')
                        const newSteps = (last.process_steps || []).map((st) => ({
                            ...st,
                            status: 'completed' as const,
                        }))
                        copy[lastIdx] = {
                            ...last,
                            content: newContent,
                            process_steps: newSteps,
                        }
                    }
                    toSave = copy
                    return copy
                })
                if (toSave) {
                    API.agentSaveSessionMessages(activeSessionId, toSave).catch(() => { })
                }
            }).catch((err: any) => {
                const errMsg = err?.message || String(err)
                setNoticeText(`方案执行失败: ${errMsg}`)
                setMessages((finalCurr) => {
                    const copy = [...finalCurr]
                    const lastIdx = copy.length - 1
                    const last = copy[lastIdx]
                    if (last && last.role === 'assistant') {
                        const newContent = last.content || `执行中断: ${errMsg}`
                        const newSteps = (last.process_steps || []).map((st) =>
                            st.status === 'running' ? { ...st, status: 'failed' as const } : st
                        )
                        copy[lastIdx] = {
                            ...last,
                            content: newContent,
                            process_steps: newSteps,
                        }
                    }
                    return copy
                })
            }).finally(() => {
                setIsGenerating(false)
                setActiveReasoning('')
            })
        },
        [activeSessionId, setMessages, setNoticeText, setActiveMode, isGenerating]
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
                    API.agentSaveSessionMessages(activeSessionId, copy).catch(() => { })
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
                        if (msg.plan && msg.plan.id === planId && msg.plan.steps) {
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
                    API.agentSaveSessionMessages(activeSessionId, copy).catch(() => { })
                    return copy
                })
                setNoticeText(`步骤 [${stepId}] 重试执行完成`)
            } catch (err: any) {
                setNoticeText(`步骤重试失败: ${err?.message || err}`)
            }
        },
        [activeSessionId, setMessages, setNoticeText]
    )

    const handleSend = useCallback(async () => {
        const trimmed = input.trim()
        if (!trimmed && images.length === 0) return
        if (isGenerating) return

        const isPlan = activeCommand === 'plan' || trimmed.startsWith('/plan ') || trimmed === '/plan'
        const isGrillMe = activeCommand === 'grill-me' || trimmed.startsWith('/grill-me ') || trimmed === '/grill-me'

        // 1. Plan Mode
        if (isPlan) {
            const objective = trimmed.replace(/^\/plan\s*/, '').trim()
            if (!objective) return

            const userMsg: AiMessage = {
                role: 'user',
                content: `/plan ${objective}`,
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
            setActiveCommand(null)
            setIsGenerating(true)
            setActiveReasoning('')
            setNoticeText('')

            // 先行将截至 userMsg 的历史存盘，供后端 AgentProposePlan 提取完整会话上下文与多轮演进基线
            API.agentSaveSessionMessages(activeSessionId, updatedHistory.slice(0, -1)).catch(() => { })

            try {
                const plan: AgentPlan = await API.agentProposePlan(activeSessionId, objective)
                setMessages((current) => {
                    // 将历史中此前所有未执行的旧方案自动标记为 expired (已被新方案覆盖)
                    const copy = current.map((msg, idx) => {
                        if (idx < current.length - 1 && msg.plan && msg.plan.status !== 'approved') {
                            return {
                                ...msg,
                                plan: {
                                    ...msg.plan,
                                    status: 'expired' as const,
                                },
                            }
                        }
                        return msg
                    })
                    const last = copy[copy.length - 1]
                    if (last && last.role === 'assistant') {
                        last.content = plan?.is_update
                            ? '已根据您的修改意见更新技术实施方案，请审阅确认后点击批准执行：'
                            : '已为您制定技术实施方案，请审阅确认后点击批准执行：'
                        last.plan = {
                            ...plan,
                            status: 'proposed' as const,
                        }
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
                                        '已完成现场调研与实施方案推演。'
                                        : st.content,
                                summary: plan?.is_update
                                    ? '已更新技术实施方案 (implementation_plan.md)'
                                    : '已生成技术实施方案 (implementation_plan.md)',
                            }))
                        }
                    }
                    API.agentSaveSessionMessages(activeSessionId, copy).catch(() => { })
                    return copy
                })
            } catch (err: any) {
                const errMsg = err?.message || String(err)
                setMessages((current) => {
                    const copy = [...current]
                    const last = copy[copy.length - 1]
                    if (last && last.role === 'assistant') {
                        last.content = `生成规划失败: ${errMsg}`
                        if (last.process_steps) {
                            last.process_steps = last.process_steps.map((st) => ({
                                ...st,
                                status: 'failed',
                            }))
                        }
                    }
                    return copy
                })
                setNoticeText(`生成规划失败: ${errMsg}`)
            } finally {
                setIsGenerating(false)
                setActiveReasoning('')
            }
            return
        }

        // 2. Grill-me Mode
        if (isGrillMe) {
            const objective = trimmed.replace(/^\/grill-me\s*/, '').trim()
            if (!objective) return

            const userMsg: AiMessage = {
                role: 'user',
                content: `/grill-me ${objective}`,
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
            setActiveCommand(null)
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
                            last.content = resp || (last.reasoning_content ? '已完成访谈与推演。' : '请根据提问继续确认。')
                        }
                        if (last.process_steps) {
                            last.process_steps = last.process_steps.map((st) => ({
                                ...st,
                                status: 'completed',
                            }))
                        }
                    }
                    API.agentSaveSessionMessages(activeSessionId, copy).catch(() => { })
                    return copy
                })
            } catch (err: any) {
                const errMsg = err?.message || String(err)
                setNoticeText(`发送失败: ${errMsg}`)
                setMessages((current) => {
                    const copy = [...current]
                    const last = copy[copy.length - 1]
                    if (last && last.role === 'assistant') {
                        if (!last.content) {
                            last.content = `执行中断: ${errMsg}`
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
            return
        }

        // 3. Regular Chat Mode
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
        setActiveCommand(null)
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
                API.agentSaveSessionMessages(activeSessionId, copy).catch(() => { })
                return copy
            })
        } catch (err: any) {
            const errMsg = err?.message || String(err)
            setNoticeText(`发送失败: ${errMsg}`)
            setMessages((current) => {
                const copy = [...current]
                const last = copy[copy.length - 1]
                if (last && last.role === 'assistant') {
                    if (!last.content) {
                        last.content = `执行中断: ${errMsg}`
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
        activeCommand,
        messages,
        activeSessionId,
        setMessages,
        setNoticeText,
    ])

    const handleStop = useCallback(async () => {
        await API.agentStopSend(activeSessionId)
        messages.forEach((msg) => {
            if (msg.plan && msg.plan.executing) {
                API.agentCancelPlan(msg.plan.id).catch(() => { })
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
        activeCommand,
        setActiveCommand,
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
