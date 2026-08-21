import { useEffect } from 'react'
import { API, subscribe } from '@/api'
import {
    AiMessage,
    AgentApprovalRequest,
    AgentAskRequest,
    AgentPlan,
} from '@/types'

interface UseAgentEventsProps {
    activeSessionId: string
    setMessages: React.Dispatch<React.SetStateAction<AiMessage[]>>
    setIsGenerating: (generating: boolean) => void
    setActiveReasoning: React.Dispatch<React.SetStateAction<string>>
    setNoticeText: (msg: string) => void
    setPendingApproval: (approval: AgentApprovalRequest | null) => void
    setPendingAsk: (ask: AgentAskRequest | null) => void
    setPendingPlan: (plan: AgentPlan | null) => void
    setJobOutputs: React.Dispatch<React.SetStateAction<Record<string, string>>>
    loadInspectorData: (sessId: string) => Promise<void>
}

export function useAgentEvents({
    activeSessionId,
    setMessages,
    setIsGenerating,
    setActiveReasoning,
    setNoticeText,
    setPendingApproval,
    setPendingAsk,
    setPendingPlan,
    setJobOutputs,
    loadInspectorData,
}: UseAgentEventsProps) {
    useEffect(() => {
        const appendOrUpdateAssistant = (updater: (msg: AiMessage) => void) => {
            setMessages((prev) => {
                const copy = [...prev]
                let last = copy[copy.length - 1]
                if (!last || last.role !== 'assistant') {
                    last = {
                        role: 'assistant',
                        content: '',
                        reasoning_content: '',
                        process_steps: [],
                        timestamp: Date.now(),
                    }
                    copy.push(last)
                }
                updater(last)
                return copy
            })
        }

        const unsubChatChunk = subscribe(`agent:chunk:${activeSessionId}`, (chunk: string) => {
            appendOrUpdateAssistant((last) => {
                last.content = (last.content || '') + chunk
                if (last.process_steps) {
                    last.process_steps = last.process_steps.map((st) =>
                        st.type === 'think' ? { ...st, status: 'completed' } : st
                    )
                }
            })
        })

        const handleReasoningChunk = (chunk: string) => {
            setActiveReasoning((prev) => prev + chunk)
            appendOrUpdateAssistant((last) => {
                const newReasoning = (last.reasoning_content || '') + chunk
                last.reasoning_content = newReasoning

                const steps = [...(last.process_steps || [])]
                const thinkIdx = steps.findIndex((s) => s.type === 'think')
                if (thinkIdx >= 0) {
                    steps[thinkIdx] = {
                        ...steps[thinkIdx],
                        content: newReasoning,
                    }
                } else {
                    steps.unshift({
                        id: `think_${last.timestamp || Date.now()}`,
                        type: 'think',
                        title: '深度思考过程',
                        content: newReasoning,
                        status: 'running',
                        timestamp: Date.now(),
                    })
                }
                last.process_steps = steps
            })
        }

        const unsubAskUserSess = subscribe(
            `agent:ask_user:${activeSessionId}`,
            (payload: any) => {
                if (payload) setPendingAsk(payload as AgentAskRequest)
            }
        )

        const unsubAskUserGlobal = subscribe('agent:ask_user', (payload: any) => {
            if (payload) setPendingAsk(payload as AgentAskRequest)
        })

        const unsubConfirmSess = subscribe(
            `agent:confirm_request:${activeSessionId}`,
            (payload: any) => {
                if (payload) setPendingApproval(payload as AgentApprovalRequest)
            }
        )

        const unsubUnifiedEvent = subscribe('agent:event', (event: any) => {
            if (!event) return
            const isTargetSession =
                !event.session_id ||
                event.session_id === activeSessionId ||
                event.session_id === 'ai_agent_default' ||
                activeSessionId === 'ai_agent_default'

            if (!isTargetSession && event.type !== 'AskUser' && event.type !== 'ask_user') return

            switch (event.type) {
                case 'ReasoningChunk':
                case 'reasoning_chunk':
                    const rChunk =
                        typeof event.payload === 'string'
                            ? event.payload
                            : event.payload?.chunk || ''
                    if (rChunk) {
                        handleReasoningChunk(rChunk)
                    }
                    break

                case 'ConfirmRequest':
                case 'confirm_request':
                    setPendingApproval(event.payload as AgentApprovalRequest)
                    appendOrUpdateAssistant((last) => {
                        const steps = [...(last.process_steps || [])]
                        steps.push({
                            id: `confirm_${event.payload?.confirm_id || Date.now()}`,
                            type: 'tool',
                            title: `安全审批: [${event.payload?.tool_name || '工具执行'}]`,
                            summary: `等待授权: ${event.payload?.description || ''}`,
                            content: event.payload?.arguments
                                ? `调用参数:\n${event.payload.arguments}`
                                : '',
                            status: 'running',
                            timestamp: Date.now(),
                        })
                        last.process_steps = steps
                    })
                    break

                case 'ToolStart':
                case 'tool_start':
                    const startCallId = event.payload?.call_id || event.payload?.id
                    const startToolName =
                        event.payload?.tool_name ||
                        event.payload?.toolName ||
                        event.payload?.name ||
                        '工具执行'
                    const startDetail = event.payload?.detail || ''
                    appendOrUpdateAssistant((last) => {
                        const steps = [...(last.process_steps || [])]
                        const existingIdx = steps.findIndex(
                            (s) => startCallId && s.id === startCallId
                        )
                        if (existingIdx >= 0) {
                            steps[existingIdx] = {
                                ...steps[existingIdx],
                                title: startToolName,
                                summary: startDetail || steps[existingIdx].summary,
                                status: 'running',
                            }
                        } else {
                            steps.push({
                                id: startCallId || `tool_${Date.now()}_${steps.length}`,
                                type: 'tool',
                                title: startToolName,
                                summary: startDetail,
                                content: '',
                                status: 'running',
                                timestamp: Date.now(),
                            })
                        }
                        last.process_steps = steps
                    })
                    break

                case 'ToolEvent':
                case 'tool_event':
                    const callId = event.payload?.call_id || event.payload?.id
                    const toolName =
                        event.payload?.tool_name ||
                        event.payload?.name ||
                        event.payload?.toolName ||
                        '工具执行'
                    const toolInput =
                        event.payload?.input ||
                        event.payload?.args ||
                        event.payload?.arguments ||
                        ''
                    const toolOutput =
                        event.payload?.output ||
                        event.payload?.result ||
                        event.payload?.data ||
                        ''
                    appendOrUpdateAssistant((last) => {
                        const steps = [...(last.process_steps || [])]
                        let targetIdx = -1
                        if (callId) {
                            targetIdx = steps.findIndex((s) => s.id === callId)
                        }
                        if (targetIdx < 0 && toolName && toolName !== '工具执行') {
                            targetIdx = steps.findIndex(
                                (s) =>
                                    s.type === 'tool' &&
                                    s.title === toolName &&
                                    s.status === 'running'
                            )
                        }
                        if (targetIdx < 0) {
                            targetIdx = steps.findIndex(
                                (s) => s.type === 'tool' && s.status === 'running'
                            )
                        }

                        if (targetIdx >= 0) {
                            steps[targetIdx] = {
                                ...steps[targetIdx],
                                title:
                                    toolName && toolName !== '工具执行'
                                        ? toolName
                                        : steps[targetIdx].title,
                                summary:
                                    toolInput ||
                                    (steps[targetIdx].summary?.startsWith('正在调用')
                                        ? ''
                                        : steps[targetIdx].summary),
                                content: toolOutput,
                                status: 'completed',
                            }
                        } else {
                            steps.push({
                                id: callId || `tool_${Date.now()}_${steps.length}`,
                                type: 'tool',
                                title: toolName,
                                summary: toolInput,
                                content: toolOutput,
                                status: 'completed',
                                timestamp: Date.now(),
                            })
                        }
                        last.process_steps = steps
                    })
                    break

                case 'JobCreated':
                case 'job_created':
                case 'JobProgress':
                case 'job_progress':
                case 'JobFinished':
                case 'job_finished':
                    loadInspectorData(activeSessionId)
                    if (event.payload?.job_id) {
                        const chunk = event.payload?.new_output || event.payload?.chunk
                        if (chunk) {
                            setJobOutputs((prev) => ({
                                ...prev,
                                [event.payload.job_id]:
                                    (prev[event.payload.job_id] || '') + chunk,
                            }))
                        }
                    }
                    break

                case 'SubagentCreated':
                case 'subagent_created':
                case 'SubagentFinished':
                case 'subagent_finished':
                    loadInspectorData(activeSessionId)
                    break

                case 'PlanProposed':
                case 'plan_proposed':
                    setPendingPlan(event.payload)
                    break

                case 'AskUser':
                case 'ask_user':
                    setPendingAsk(event.payload as AgentAskRequest)
                    appendOrUpdateAssistant((last) => {
                        const steps = [...(last.process_steps || [])]
                        const askId = event.payload?.ask_id || `ask_${Date.now()}`
                        const existingIdx = steps.findIndex(
                            (s) =>
                                s.id === askId ||
                                (s.title?.includes('ask_user') && s.status === 'running')
                        )
                        if (existingIdx >= 0) {
                            steps[existingIdx] = {
                                ...steps[existingIdx],
                                title: '交互询问 (ask_user)',
                                summary: event.payload?.question || steps[existingIdx].summary,
                                content: event.payload?.options
                                    ? `预设选项: ${event.payload.options.join(', ')}`
                                    : '',
                                status: 'running',
                            }
                        } else {
                            steps.push({
                                id: askId,
                                type: 'tool',
                                title: '交互询问 (ask_user)',
                                summary: event.payload?.question || '等待用户答复...',
                                content: event.payload?.options
                                    ? `预设选项: ${event.payload.options.join(', ')}`
                                    : '',
                                status: 'running',
                                timestamp: Date.now(),
                            })
                        }
                        last.process_steps = steps
                    })
                    break

                case 'StepStarted':
                case 'step_started':
                case 'StepFinished':
                case 'step_finished':
                    if (event.payload?.step_id) {
                        setMessages((prev) => {
                            let updated = false
                            const copy = prev.map((msg) => {
                                if (
                                    msg.plan &&
                                    (!event.payload.plan_id ||
                                        msg.plan.id === event.payload.plan_id)
                                ) {
                                    const nextSteps = msg.plan.steps.map((st, idx) => {
                                        const pId = event.payload.step_id
                                        const match =
                                            st.id === pId ||
                                            st.id === String(pId) ||
                                            `step_${idx + 1}` === pId ||
                                            st.id === `step_${pId}` ||
                                            (idx === 0 && (pId === 'step_1' || pId === '1'))

                                        if (match) {
                                            updated = true
                                            const isStarted =
                                                event.type === 'StepStarted' ||
                                                event.type === 'step_started' ||
                                                event.payload.status === 'running'
                                            return {
                                                ...st,
                                                status:
                                                    event.payload.status ||
                                                    (isStarted
                                                        ? 'running'
                                                        : st.status || 'completed'),
                                                duration_ms:
                                                    event.payload.duration_ms ??
                                                    event.payload.duration ??
                                                    st.duration_ms,
                                                error: event.payload.error ?? st.error,
                                                output: event.payload.output ?? st.output,
                                                verdict: event.payload.verdict ?? st.verdict,
                                            }
                                        }
                                        return st
                                    })
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
                            if (updated) {
                                API.agentSaveSessionMessages(activeSessionId, copy).catch(
                                    () => {}
                                )
                            }
                            return copy
                        })
                    }
                    break

                case 'Notice':
                case 'notice':
                    setNoticeText(String(event.payload || ''))
                    break

                case 'Done':
                case 'done':
                    setIsGenerating(false)
                    setActiveReasoning('')
                    const doneContent = event.payload?.content || ''
                    const isPlanReport =
                        doneContent.includes('### 🎯 规划执行完成') ||
                        doneContent.includes('全部规划步骤执行完成') ||
                        doneContent.includes('执行过程中断') ||
                        doneContent.includes('规划已被用户手动停止')

                    setMessages((curr) => {
                        const copy = [...curr]
                        if (isPlanReport) {
                            let targetIdx = -1
                            for (let i = copy.length - 1; i >= 0; i--) {
                                if (
                                    copy[i].plan &&
                                    (copy[i].plan?.executing || !copy[i].plan?.summary)
                                ) {
                                    targetIdx = i
                                    break
                                }
                            }
                            if (targetIdx >= 0 && copy[targetIdx].plan) {
                                copy[targetIdx] = {
                                    ...copy[targetIdx],
                                    plan: {
                                        ...copy[targetIdx].plan!,
                                        executing: false,
                                        need_confirm: false,
                                        summary: doneContent,
                                    },
                                }
                                API.agentSaveSessionMessages(activeSessionId, copy).catch(
                                    () => {}
                                )
                            }
                            return copy
                        }

                        appendOrUpdateAssistant((last) => {
                            if (doneContent) last.content = doneContent
                            if (
                                !last.content &&
                                (event.payload?.reasoning_content || last.reasoning_content)
                            ) {
                                last.content = '已完成深度推演与相关操作。'
                            }
                            if (event.payload?.reasoning_content)
                                last.reasoning_content = event.payload.reasoning_content
                            if (last.process_steps) {
                                last.process_steps = last.process_steps.map((st) => ({
                                    ...st,
                                    status: 'completed',
                                }))
                            }
                        })
                        API.agentSaveSessionMessages(activeSessionId, copy).catch(() => {})
                        return copy
                    })
                    loadInspectorData(activeSessionId)
                    break

                case 'error':
                    setIsGenerating(false)
                    setActiveReasoning('')
                    const errPayload = String(event.payload || '')
                    setNoticeText(`❌ 出错: ${errPayload}`)
                    appendOrUpdateAssistant((last) => {
                        if (!last.content) {
                            last.content = `⚠️ 执行遇到错误: ${errPayload}`
                        }
                        if (last.process_steps) {
                            last.process_steps = last.process_steps.map((st) =>
                                st.status === 'running' ? { ...st, status: 'failed' } : st
                            )
                        }
                    })
                    break
            }
        })

        return () => {
            unsubChatChunk()
            unsubAskUserSess()
            unsubAskUserGlobal()
            unsubConfirmSess()
            unsubUnifiedEvent()
        }
    }, [
        activeSessionId,
        setMessages,
        setIsGenerating,
        setActiveReasoning,
        setNoticeText,
        setPendingApproval,
        setPendingAsk,
        setPendingPlan,
        setJobOutputs,
        loadInspectorData,
    ])
}

export default useAgentEvents
