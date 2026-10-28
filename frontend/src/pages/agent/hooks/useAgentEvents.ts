import { useEffect } from 'react'
import i18n from 'i18next'
import { API, subscribe } from '@/api'
import {
    AiMessage,
    AgentAskRequest,
    AgentHitlConfirmRequest,
} from '@/types'

interface UseAgentEventsProps {
    activeSessionId: string
    setMessages: React.Dispatch<React.SetStateAction<AiMessage[]>>
    setIsGenerating: (generating: boolean) => void
    setActiveReasoning: React.Dispatch<React.SetStateAction<string>>
    setNoticeText: (msg: string) => void
    setPendingAsk: (ask: AgentAskRequest | null) => void
    setPendingHitl: (hitl: AgentHitlConfirmRequest | null) => void
}

export function useAgentEvents({
    activeSessionId,
    setMessages,
    setIsGenerating,
    setActiveReasoning,
    setNoticeText,
    setPendingAsk,
    setPendingHitl,
}: UseAgentEventsProps) {
    useEffect(() => {
        const appendOrUpdateAssistant = (updater: (msg: AiMessage) => AiMessage) => {
            setMessages((prev) => {
                const copy = [...prev]
                const lastIdx = copy.length - 1
                const last = copy[lastIdx]
                const target: AiMessage =
                    last && last.role === 'assistant'
                        ? { ...last }
                        : {
                              role: 'assistant',
                              content: '',
                              reasoning_content: '',
                              process_steps: [],
                              timestamp: Date.now(),
                          }
                const updated = updater(target)
                if (last && last.role === 'assistant') {
                    copy[lastIdx] = updated
                } else {
                    copy.push(updated)
                }
                return copy
            })
        }

        let pendingChat = ''
        let pendingReasoning = ''
        let rafId: number | null = null

        const flushChunks = () => {
            if (rafId !== null) {
                cancelAnimationFrame(rafId)
                rafId = null
            }
            if (!pendingChat && !pendingReasoning) return

            const chatToFlush = pendingChat
            const reasoningToFlush = pendingReasoning
            pendingChat = ''
            pendingReasoning = ''

            if (reasoningToFlush) {
                setActiveReasoning((prev) => prev + reasoningToFlush)
            }

            appendOrUpdateAssistant((last) => {
                let updated = last
                if (reasoningToFlush) {
                    const newReasoning = (updated.reasoning_content || '') + reasoningToFlush
                    const steps = [...(updated.process_steps || [])]
                    const lastStep = steps[steps.length - 1]

                    if (lastStep && lastStep.type === 'think' && lastStep.status === 'running') {
                        steps[steps.length - 1] = {
                            ...lastStep,
                            content: (lastStep.content || '') + reasoningToFlush,
                        }
                    } else {
                        const hasTools = steps.some((s) => s.type === 'tool')
                        steps.push({
                            id: `think_${Date.now()}_${steps.length}`,
                            type: 'think',
                            title: hasTools ? i18n.t('agent:events.continueThinking', { defaultValue: '继续思考与推演' }) : i18n.t('agent:events.deepThinking', { defaultValue: '深度思考过程' }),
                            content: reasoningToFlush,
                            status: 'running',
                            timestamp: Date.now(),
                        })
                    }
                    updated = {
                        ...updated,
                        reasoning_content: newReasoning,
                        process_steps: steps,
                    }
                }

                if (chatToFlush) {
                    updated = {
                        ...updated,
                        content: (updated.content || '') + chatToFlush,
                        process_steps: updated.process_steps
                            ? updated.process_steps.map((st) =>
                                  st.type === 'think' ? { ...st, status: 'completed' } : st
                              )
                            : [],
                    }
                }

                return updated
            })
        }

        const scheduleFlush = () => {
            if (rafId === null) {
                rafId = requestAnimationFrame(() => {
                    rafId = null
                    flushChunks()
                })
            }
        }

        const unsubChatChunk = subscribe(`agent:chunk:${activeSessionId}`, (chunk: string) => {
            if (!chunk) return
            pendingChat += chunk
            scheduleFlush()
        })

        const unsubAskUserSess = subscribe(
            `agent:ask_user:${activeSessionId}`,
            (payload: any) => {
                if (payload) setPendingAsk(payload as AgentAskRequest)
            }
        )

        const unsubAskUserGlobal = subscribe('agent:ask_user', (payload: any) => {
            if (payload) setPendingAsk(payload as AgentAskRequest)
        })

        const unsubHitlConfirmSess = subscribe(
            `agent:hitl_confirm:${activeSessionId}`,
            (payload: any) => {
                if (payload) setPendingHitl(payload as AgentHitlConfirmRequest)
            }
        )

        const unsubHitlConfirmGlobal = subscribe('agent:hitl_confirm', (payload: any) => {
            if (payload) setPendingHitl(payload as AgentHitlConfirmRequest)
        })

        const unsubUnifiedEvent = subscribe('agent:event', (event: any) => {
            if (!event) return
            const isTargetSession =
                !event.session_id ||
                event.session_id === activeSessionId

            if (
                !isTargetSession &&
                event.type !== 'AskUser' &&
                event.type !== 'ask_user' &&
                event.type !== 'HitlConfirm' &&
                event.type !== 'hitl_confirm'
            )
                return

            if (
                event.type !== 'ChatChunk' &&
                event.type !== 'chat_chunk' &&
                event.type !== 'ReasoningChunk' &&
                event.type !== 'reasoning_chunk'
            ) {
                flushChunks()
            }

            switch (event.type) {
                case 'ChatChunk':
                case 'chat_chunk': {
                    const cChunk =
                        typeof event.payload === 'string'
                            ? event.payload
                            : event.payload?.chunk || ''
                    if (cChunk) {
                        pendingChat += cChunk
                        scheduleFlush()
                    }
                    break
                }

                case 'ReasoningChunk':
                case 'reasoning_chunk': {
                    const rChunk =
                        typeof event.payload === 'string'
                            ? event.payload
                            : event.payload?.chunk || ''
                    if (rChunk) {
                        pendingReasoning += rChunk
                        scheduleFlush()
                    }
                    break
                }

                case 'ToolStart':
                case 'tool_start':
                    const startCallId = event.payload?.call_id || event.payload?.id
                    const startToolName =
                        event.payload?.tool_name ||
                        event.payload?.toolName ||
                        event.payload?.name ||
                        i18n.t('agent:events.toolExec', { defaultValue: '工具执行' })
                    const startDetail = event.payload?.detail || ''
                    appendOrUpdateAssistant((last) => {
                        const steps = [...(last.process_steps || [])]
                        const existingIdx = steps.findIndex(
                            (s) =>
                                (startCallId && s.id === startCallId) ||
                                (s.type === 'tool' && s.title === startToolName && s.status === 'running')
                        )
                        if (existingIdx >= 0) {
                            steps[existingIdx] = {
                                ...steps[existingIdx],
                                id: startCallId || steps[existingIdx].id,
                                title: startToolName,
                                summary: startDetail || steps[existingIdx].summary,
                                status: 'running',
                            }
                        } else {
                            steps.push({
                                id: startCallId || `tool_${Date.now()}_${steps.length}`,
                                type: 'tool',
                                title: startToolName,
                                summary: startDetail || i18n.t('agent:events.callingTool', { name: startToolName, defaultValue: `正在调用工具 [${startToolName}]...` }),
                                content: '',
                                status: 'running',
                                timestamp: Date.now(),
                            })
                        }
                        return {
                            ...last,
                            process_steps: steps,
                        }
                    })
                    break

                case 'ToolEvent':
                case 'tool_event':
                    const callId = event.payload?.call_id || event.payload?.id
                    const toolName =
                        event.payload?.tool_name ||
                        event.payload?.name ||
                        event.payload?.toolName ||
                        i18n.t('agent:events.toolExec', { defaultValue: '工具执行' })
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
                    const durationMs = event.payload?.duration_ms || event.payload?.duration
                    appendOrUpdateAssistant((last) => {
                        const steps = [...(last.process_steps || [])]
                        let targetIdx = -1

                        // 1. Match by callId
                        if (callId) {
                            targetIdx = steps.findIndex((s) => s.id === callId)
                        }
                        // 2. Match active running tool step
                        if (targetIdx < 0 && toolName && toolName !== '工具执行' && toolName !== i18n.t('agent:events.toolExec', { defaultValue: '工具执行' })) {
                            targetIdx = steps.findIndex(
                                (s) =>
                                    s.type === 'tool' &&
                                    (s.title === toolName || s.title?.includes(toolName)) &&
                                    s.status === 'running'
                            )
                        }
                        if (targetIdx < 0) {
                            targetIdx = steps.findIndex(
                                (s) => s.type === 'tool' && s.status === 'running'
                            )
                        }
                        // 3. Fallback: match last tool step of same toolName
                        if (targetIdx < 0 && toolName && toolName !== '工具执行' && toolName !== i18n.t('agent:events.toolExec', { defaultValue: '工具执行' })) {
                            for (let i = steps.length - 1; i >= 0; i--) {
                                if (steps[i].type === 'tool' && (steps[i].title === toolName || steps[i].title?.includes(toolName))) {
                                    targetIdx = i
                                    break
                                }
                            }
                        }

                        if (targetIdx >= 0) {
                            const oldStep = steps[targetIdx]
                            const computedDuration =
                                durationMs ||
                                (oldStep.timestamp ? Date.now() - oldStep.timestamp : undefined)

                            steps[targetIdx] = {
                                ...oldStep,
                                id: callId || oldStep.id,
                                title:
                                    toolName && toolName !== '工具执行' && toolName !== i18n.t('agent:events.toolExec', { defaultValue: '工具执行' })
                                        ? toolName
                                        : oldStep.title,
                                summary:
                                    toolInput ||
                                    (oldStep.summary?.startsWith('正在调用') || oldStep.summary?.startsWith('Calling') || oldStep.summary?.startsWith('已授权')
                                        ? i18n.t('agent:events.commandCompleted', { defaultValue: '指令执行完成' })
                                        : oldStep.summary),
                                content: toolOutput,
                                duration_ms: computedDuration || oldStep.duration_ms,
                                status: 'completed',
                            }
                        } else {
                            steps.push({
                                id: callId || `tool_${Date.now()}_${steps.length}`,
                                type: 'tool',
                                title: toolName,
                                summary: toolInput || i18n.t('agent:events.commandCompleted', { defaultValue: '指令执行完成' }),
                                content: toolOutput,
                                duration_ms: durationMs,
                                status: 'completed',
                                timestamp: Date.now(),
                            })
                        }
                        return {
                            ...last,
                            process_steps: steps,
                        }
                    })
                    break

                case 'PlanProposed':
                case 'plan_proposed':
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
                                title: i18n.t('agent:events.interactiveAsk', { defaultValue: '交互询问 (ask_user)' }),
                                summary: event.payload?.question || steps[existingIdx].summary,
                                content: event.payload?.options
                                    ? i18n.t('agent:askUser.presetOptions', { options: event.payload.options.join(', '), defaultValue: `预设选项: ${event.payload.options.join(', ')}` })
                                    : '',
                                status: 'running',
                            }
                        } else {
                            steps.push({
                                id: askId,
                                type: 'tool',
                                title: i18n.t('agent:events.interactiveAsk', { defaultValue: '交互询问 (ask_user)' }),
                                summary: event.payload?.question || i18n.t('agent:askUser.waitingReply', { defaultValue: '等待用户答复...' }),
                                content: event.payload?.options
                                    ? i18n.t('agent:askUser.presetOptions', { options: event.payload.options.join(', '), defaultValue: `预设选项: ${event.payload.options.join(', ')}` })
                                    : '',
                                status: 'running',
                                timestamp: Date.now(),
                            })
                        }
                        return {
                            ...last,
                            process_steps: steps,
                        }
                    })
                    break

                case 'HitlConfirm':
                case 'hitl_confirm':
                    if (event.payload) {
                        setPendingHitl(event.payload as AgentHitlConfirmRequest)
                    }
                    break

                case 'StepStarted':
                case 'step_started':
                case 'StepFinished':
                case 'step_finished':
                    if (event.payload?.step_id) {
                        let toSave: AiMessage[] | null = null
                        setMessages((prev) => {
                            let updated = false
                            const copy = prev.map((msg) => {
                                if (
                                    msg.plan &&
                                    msg.plan.steps &&
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
                                toSave = copy
                            }
                            return copy
                        })
                        if (toSave) {
                            API.agentSaveSessionMessages(activeSessionId, toSave).catch(() => {})
                        }
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
                    setPendingHitl(null)
                    setPendingAsk(null)
                    const doneContent = event.payload?.content || ''
                    const isPlanReport =
                        doneContent.includes('### 🎯 规划执行完成') ||
                        doneContent.includes('Plan execution completed') ||
                        doneContent.includes('全部规划步骤执行完成') ||
                        doneContent.includes('All plan steps completed') ||
                        doneContent.includes('执行过程中断') ||
                        doneContent.includes('Execution interrupted') ||
                        doneContent.includes('规划已被用户手动停止') ||
                        doneContent.includes('Plan stopped by user')

                    let finalMessagesToSave: AiMessage[] | null = null
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
                            }
                            finalMessagesToSave = copy
                            return copy
                        }

                        let lastIdx = copy.length - 1
                        let last = copy[lastIdx]
                        if (!last || last.role !== 'assistant') {
                            last = {
                                role: 'assistant',
                                content: '',
                                reasoning_content: '',
                                process_steps: [],
                                timestamp: Date.now(),
                            }
                            copy.push(last)
                            lastIdx = copy.length - 1
                        }

                        let newContent = last.content
                        if (doneContent) newContent = doneContent
                        if (
                            !newContent &&
                            (event.payload?.reasoning_content || last.reasoning_content)
                        ) {
                            newContent = i18n.t('agent:composer.deepCompleted', { defaultValue: '已完成深度推演与相关操作。' })
                        }
                        const newReasoning =
                            event.payload?.reasoning_content || last.reasoning_content
                        const newSteps = (last.process_steps || []).map((st) => ({
                            ...st,
                            status: 'completed' as const,
                        }))

                        copy[lastIdx] = {
                            ...last,
                            content: newContent,
                            reasoning_content: newReasoning,
                            process_steps: newSteps,
                        }
                        finalMessagesToSave = copy
                        return copy
                    })
                    if (finalMessagesToSave) {
                        API.agentSaveSessionMessages(activeSessionId, finalMessagesToSave).catch(() => {})
                    }
                    break

                case 'Error':
                case 'error':
                    setIsGenerating(false)
                    setActiveReasoning('')
                    setPendingHitl(null)
                    setPendingAsk(null)
                    const errPayload = String(event.payload || '')
                    setNoticeText(i18n.t('agent:events.errorNotice', { error: errPayload, defaultValue: `❌ 出错: ${errPayload}` }))
                    appendOrUpdateAssistant((last) => ({
                        ...last,
                        content: last.content || i18n.t('agent:events.execError', { error: errPayload, defaultValue: `⚠️ 执行遇到错误: ${errPayload}` }),
                        process_steps: last.process_steps
                            ? last.process_steps.map((st) =>
                                  st.status === 'running' ? { ...st, status: 'failed' } : st
                              )
                            : [],
                    }))
                    break
            }
        })

        return () => {
            flushChunks()
            if (rafId !== null) {
                cancelAnimationFrame(rafId)
                rafId = null
            }
            unsubChatChunk()
            unsubAskUserSess()
            unsubAskUserGlobal()
            unsubHitlConfirmSess()
            unsubHitlConfirmGlobal()
            unsubUnifiedEvent()
        }
    }, [
        activeSessionId,
        setMessages,
        setIsGenerating,
        setActiveReasoning,
        setNoticeText,
        setPendingAsk,
        setPendingHitl,
    ])
}

export default useAgentEvents
