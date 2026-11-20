import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { API, subscribe } from '@/api'
import { useSession } from '@/contexts/SessionContext'
import type {
    AgentEventEnvelope,
    AgentMode,
    AgentSessionRecord,
    AppSettings,
    ApprovalDecision,
    SubAgentInfo,
} from '@/types'
import { ChatTurn, stepNodesToTimeline, TimelineItem } from './agentTypes'

function closeTrailingStreams(items: TimelineItem[], now: number, thoughtStartMap: Map<string, number>): TimelineItem[] {
    return items.map((it) => {
        if (it.kind === 'thought' && it.streaming) {
            const started = thoughtStartMap.get(it.id) || now
            return { ...it, streaming: false, durationMs: Math.max(it.durationMs, now - started) }
        }
        if (it.kind === 'content' && it.streaming) {
            return { ...it, streaming: false }
        }
        return it
    })
}

function applyRunEventToItems(
    items: TimelineItem[],
    ev: AgentEventEnvelope,
    thoughtStartMap: Map<string, number>
): TimelineItem[] {
    const p = ev.payload || {}
    const now = ev.ts || Date.now()

    switch (ev.type) {
        case 'reasoning_chunk': {
            const chunk = String(p.chunk || '')
            if (!chunk) return items
            const last = items[items.length - 1]
            if (last && last.kind === 'thought' && last.streaming) {
                const started = thoughtStartMap.get(last.id) || now
                return [
                    ...items.slice(0, -1),
                    { ...last, text: last.text + chunk, durationMs: now - started },
                ]
            }
            const id = `think_${ev.runId}_${p.turn ?? 0}_${items.length}`
            thoughtStartMap.set(id, now)
            return [
                ...closeTrailingStreams(items, now, thoughtStartMap),
                { kind: 'thought', id, title: 'Thinking', text: chunk, durationMs: 0, streaming: true },
            ]
        }

        case 'content_chunk': {
            const chunk = String(p.chunk || '')
            if (!chunk) return items
            const last = items[items.length - 1]
            if (last && last.kind === 'content' && last.streaming) {
                return [
                    ...items.slice(0, -1),
                    { ...last, text: last.text + chunk },
                ]
            }
            const closed = closeTrailingStreams(items, now, thoughtStartMap)
            return [
                ...closed,
                { kind: 'content', id: `content_${ev.runId}_${p.turn ?? 0}_${closed.length}`, text: chunk, streaming: true },
            ]
        }

        case 'tool_start': {
            const closed = closeTrailingStreams(items, now, thoughtStartMap)
            const stepId = String(p.stepId || '')
            const tool = String(p.tool || '')
            const title = String(p.title || tool)
            let parsedArgs: any = p.args
            if (typeof parsedArgs === 'string') {
                try {
                    parsedArgs = JSON.parse(parsedArgs)
                } catch {
                    /* keep raw string */
                }
            }

            if (tool === 'dispatch_task') {
                const agentId = String(parsedArgs?.agent_id || '')
                const task = String(parsedArgs?.task || '')
                return [
                    ...closed,
                    {
                        kind: 'subagent_run',
                        id: stepId,
                        subRunId: '',
                        agentId,
                        name: agentId,
                        host: '',
                        task,
                        status: 'running',
                        durationMs: 0,
                        startedAt: now,
                        children: [],
                    },
                ]
            }

            if (tool === 'ssh_exec' || tool === 'mysql_sql') {
                return [
                    ...closed,
                    {
                        kind: 'exec',
                        id: stepId,
                        command: String(parsedArgs?.command || parsedArgs?.sql || ''),
                        reason: String(parsedArgs?.reason || ''),
                        stdout: '',
                        stderr: '',
                        exitCode: 0,
                        durationMs: 0,
                        truncated: false,
                        status: 'running',
                    },
                ]
            }

            if (tool === 'update_plan' || tool === 'ask_user') {
                return closed
            }

            return [
                ...closed,
                {
                    kind: 'tool',
                    id: stepId,
                    tool,
                    title,
                    args: parsedArgs,
                    status: 'running',
                    durationMs: 0,
                },
            ]
        }

        case 'exec_output': {
            const stepId = String(p.stepId || '')
            const exitCode = typeof p.exitCode === 'number' ? p.exitCode : 0
            const nextStatus: 'completed' | 'failed' = exitCode === 0 ? 'completed' : 'failed'
            const idx = items.findIndex((it) => it.kind === 'exec' && it.id === stepId)
            if (idx === -1) {
                return [
                    ...items,
                    {
                        kind: 'exec',
                        id: stepId,
                        command: String(p.command || ''),
                        reason: '',
                        stdout: String(p.stdout || ''),
                        stderr: String(p.stderr || ''),
                        exitCode,
                        durationMs: Number(p.durationMs || 0),
                        truncated: Boolean(p.truncated),
                        status: nextStatus,
                    },
                ]
            }
            return items.map((it, i) =>
                i === idx && it.kind === 'exec'
                    ? {
                          ...it,
                          stdout: String(p.stdout || ''),
                          stderr: String(p.stderr || ''),
                          exitCode,
                          durationMs: Number(p.durationMs || 0),
                          truncated: Boolean(p.truncated),
                          status: nextStatus,
                      }
                    : it
            )
        }

        case 'approval_request': {
            const approvalId = String(p.approvalId || '')
            return [
                ...items,
                {
                    kind: 'approval',
                    id: approvalId,
                    approvalId,
                    stepId: String(p.stepId || ''),
                    approvalKind: p.kind ? String(p.kind) : undefined,
                    command: String(p.command || ''),
                    risk: String(p.risk || 'modify'),
                    reason: String(p.reason || ''),
                    filePath: p.filePath ? String(p.filePath) : undefined,
                    writeMode: p.writeMode ? String(p.writeMode) : undefined,
                    existed: typeof p.existed === 'boolean' ? p.existed : undefined,
                    bytes: typeof p.bytes === 'number' ? p.bytes : undefined,
                    preview: typeof p.preview === 'string' ? p.preview : undefined,
                    previewTruncated: Boolean(p.previewTruncated),
                    mainVerdict: p.mainVerdict ?? null,
                    canAlwaysAllow: Boolean(p.canAlwaysAllow),
                    status: 'waiting',
                    durationMs: 0,
                },
            ]
        }

        case 'approval_resolved': {
            const approvalId = String(p.approvalId || '')
            const stepId = String(p.stepId || '')
            const decision = p.decision as ApprovalDecision | undefined
            const by = String(p.by || '')
            const approved = decision === 'allow' || decision === 'always'
            const idx = items.findIndex((it) => it.kind === 'approval' && it.approvalId === approvalId)
            if (idx === -1) {
                return [
                    ...items,
                    {
                        kind: 'approval',
                        id: approvalId,
                        approvalId,
                        stepId,
                        command: '',
                        risk: 'modify',
                        reason: String(p.reason || ''),
                        mainVerdict: p.reason ?? null,
                        canAlwaysAllow: true,
                        decision,
                        by,
                        status: approved ? 'completed' : 'failed',
                        durationMs: 0,
                    },
                ]
            }
            return items.map((it, i) =>
                i === idx && it.kind === 'approval'
                    ? {
                          ...it,
                          decision,
                          by,
                          status: approved ? 'completed' : 'failed',
                      }
                    : it
            )
        }

        case 'plan_update': {
            const steps = Array.isArray(p.steps) ? p.steps : []
            const stepId = String(p.stepId || `plan_${ev.runId}`)
            const existingIdx = items.findIndex((it) => it.kind === 'plan')
            if (existingIdx !== -1) {
                return items.map((it, i) =>
                    i === existingIdx && it.kind === 'plan' ? { ...it, steps } : it
                )
            }
            return [...items, { kind: 'plan', id: stepId, steps }]
        }

        case 'ask_user': {
            const askId = String(p.askId || '')
            return [
                ...items,
                {
                    kind: 'ask_user',
                    id: askId,
                    askId,
                    stepId: String(p.stepId || ''),
                    questions: Array.isArray(p.questions) ? p.questions : [],
                    status: 'waiting',
                },
            ]
        }

        case 'ask_user_resolved': {
            const askId = String(p.askId || '')
            const cancelled = Boolean(p.cancelled)
            return items.map((it) =>
                it.kind === 'ask_user' && it.askId === askId
                    ? {
                          ...it,
                          answers: p.answers,
                          cancelled,
                          status: cancelled ? 'failed' : 'completed',
                      }
                    : it
            )
        }

        case 'tool_end': {
            const stepId = String(p.stepId || '')
            const tool = String(p.tool || '')
            const status = (p.status as any) || 'completed'
            const durationMs = Number(p.durationMs || 0)

            if (tool === 'dispatch_task') {
                let parsedReport: any = undefined
                try {
                    parsedReport = typeof p.result === 'string' ? JSON.parse(p.result) : p.result
                } catch {
                    /* ignore */
                }
                return items.map((it) =>
                    it.kind === 'subagent_run' && it.id === stepId
                        ? {
                              ...it,
                              status:
                                  parsedReport?.status === 'cancelled'
                                      ? 'cancelled'
                                      : status === 'completed' && parsedReport?.status !== 'failed'
                                        ? 'completed'
                                        : status,
                              durationMs,
                              report: parsedReport && parsedReport.summary !== undefined ? parsedReport : it.report,
                              error: status === 'failed' ? String(p.result || '') : it.error,
                          }
                        : it
                )
            }

            if (tool === 'ssh_exec' || tool === 'mysql_sql') {
                return items.map((it) =>
                    it.kind === 'exec' && it.id === stepId && it.status === 'running'
                        ? {
                              ...it,
                              status,
                              durationMs,
                              stderr: status !== 'completed' ? String(p.result || '') : it.stderr,
                              exitCode: status === 'completed' ? it.exitCode : -1,
                          }
                        : it
                )
            }

            return items.map((it) =>
                it.kind === 'tool' && it.id === stepId
                    ? {
                          ...it,
                          status,
                          durationMs,
                          observation: String(p.result || ''),
                      }
                    : it
            )
        }

        case 'run_end': {
            return closeTrailingStreams(items, now, thoughtStartMap)
        }

        default:
            return items
    }
}

function hasWaitingApproval(turns: ChatTurn[]): boolean {
    const checkItems = (items: TimelineItem[]): boolean => {
        for (const it of items) {
            if (it.kind === 'approval' && it.status === 'waiting') return true
            if (it.kind === 'ask_user' && it.status === 'waiting') return true
            if (it.kind === 'subagent_run' && checkItems(it.children)) return true
        }
        return false
    }
    return turns.some((t) => checkItems(t.items))
}

export function useAgentStream(
    settings: AppSettings,
    onAwaitingApprovalChange?: (waiting: boolean) => void
) {
    const { sessions, tools } = useSession()
    const sshSessionSig = useMemo(
        () => sessions.ssh.map((s) => `${s.id}:${s.connected}`).join('|'),
        [sessions.ssh]
    )
    const mysqlSessionSig = useMemo(
        () => sessions.mysql.map((s) => `${s.id}:${s.connected}`).join('|'),
        [sessions.mysql]
    )

    const [conversationId, setConversationId] = useState<string | null>(null)
    const [turns, setTurns] = useState<ChatTurn[]>([])
    const [streaming, setStreaming] = useState(false)
    const [mode, setMode] = useState<AgentMode>('fast')
    const [modelId, setModelId] = useState<string>(settings.activeModelId || '')
    const [workspaceDir, setWorkspaceDir] = useState<string>('')
    const [subagents, setSubagents] = useState<SubAgentInfo[]>([])
    const [conversations, setConversations] = useState<AgentSessionRecord[]>([])

    const activeConvRef = useRef<string | null>(null)
    const activeRunIdRef = useRef<string | null>(null)
    const pendingNewConvRef = useRef<boolean>(false)
    const streamingRef = useRef<boolean>(false)
    const subRunToStepRef = useRef<Map<string, string>>(new Map())
    const thoughtStartsRef = useRef<Map<string, number>>(new Map())

    useEffect(() => {
        activeConvRef.current = conversationId
    }, [conversationId])

    useEffect(() => {
        streamingRef.current = streaming
    }, [streaming])

    useEffect(() => {
        if (!modelId && settings.activeModelId) {
            setModelId(settings.activeModelId)
        }
    }, [settings.activeModelId, modelId])

    const awaitingApproval = useMemo(() => hasWaitingApproval(turns), [turns])
    useEffect(() => {
        onAwaitingApprovalChange?.(awaitingApproval)
    }, [awaitingApproval, onAwaitingApprovalChange])

    const refreshSubagents = useCallback(async () => {
        try {
            const list = await API.agentListSubagents()
            setSubagents(list || [])
        } catch {
            /* ignore */
        }
    }, [])

    const refreshConversations = useCallback(async () => {
        try {
            const list = await API.agentListConversations()
            setConversations(list || [])
        } catch {
            /* ignore */
        }
    }, [])

    useEffect(() => {
        void refreshSubagents()
    }, [sshSessionSig, mysqlSessionSig, tools.agent.active, refreshSubagents])

    useEffect(() => {
        if (!tools.agent.active) return
        const onFocus = () => void refreshSubagents()
        window.addEventListener('focus', onFocus)
        const timer = window.setInterval(() => {
            void refreshSubagents()
        }, 3000)
        return () => {
            window.removeEventListener('focus', onFocus)
            window.clearInterval(timer)
        }
    }, [tools.agent.active, refreshSubagents])

    useEffect(() => {
        void refreshConversations()
    }, [refreshConversations])

    useEffect(() => {
        const unsubSshDc = subscribe('ssh:disconnected', () => {
            void refreshSubagents()
        })
        const unsubSessClosed = subscribe('session:closed', () => {
            void refreshSubagents()
        })
        const unsubAgent = subscribe('agent:event', (ev: AgentEventEnvelope) => {
            if (!ev || !ev.type) return

            if (ev.type === 'subagents_sync') {
                if (Array.isArray(ev.payload?.subagents)) {
                    setSubagents(ev.payload.subagents as SubAgentInfo[])
                }
                return
            }

            if (ev.type === 'subagent_status') {
                const aid = String(ev.payload?.agentId || ev.agentId || '')
                const nextStatus = String(ev.payload?.status || 'idle')
                if (nextStatus === 'offline') {
                    setSubagents((prev) => prev.filter((a) => a.agentId !== aid))
                    return
                }
                let matched = false
                setSubagents((prev) => {
                    if (!prev.some((a) => a.agentId === aid)) {
                        return prev
                    }
                    matched = true
                    return prev.map((a) =>
                        a.agentId === aid
                            ? {
                                  ...a,
                                  status: nextStatus,
                                  enabled:
                                      typeof ev.payload?.enabled === 'boolean'
                                          ? ev.payload.enabled
                                          : a.enabled,
                              }
                            : a
                    )
                })
                if (!matched) {
                    void refreshSubagents()
                }
                return
            }

            // Route conversation events (handle race where run_start arrives before agentChatSend resolves)
            if (
                ev.type === 'run_start' &&
                !ev.parentRunId &&
                pendingNewConvRef.current &&
                streamingRef.current &&
                !activeConvRef.current
            ) {
                activeConvRef.current = ev.conversationId
                activeRunIdRef.current = ev.runId
                pendingNewConvRef.current = false
                setConversationId(ev.conversationId)
            }

            if (!activeConvRef.current || ev.conversationId !== activeConvRef.current) {
                return
            }

            if (ev.type === 'subagent_link') {
                const stepId = String(ev.payload?.stepId || '')
                const subRunId = String(ev.payload?.subRunId || '')
                if (stepId && subRunId) {
                    subRunToStepRef.current.set(subRunId, stepId)
                }
                setTurns((prev) => {
                    const lastIdx = prev.length - 1
                    if (lastIdx < 0 || prev[lastIdx].role !== 'assistant') return prev
                    const turn = prev[lastIdx]
                    const nextItems = turn.items.map((it) =>
                        it.kind === 'subagent_run' && it.id === stepId
                            ? {
                                  ...it,
                                  subRunId,
                                  name: String(ev.payload?.name || it.name),
                                  host: String(ev.payload?.host || it.host),
                                  task: String(ev.payload?.task || it.task),
                              }
                            : it
                    )
                    return [...prev.slice(0, -1), { ...turn, items: nextItems }]
                })
                return
            }

            // Child sub-agent event
            if (ev.parentRunId) {
                const stepId = subRunToStepRef.current.get(ev.runId)
                if (!stepId) return
                setTurns((prev) => {
                    const lastIdx = prev.length - 1
                    if (lastIdx < 0 || prev[lastIdx].role !== 'assistant') return prev
                    const turn = prev[lastIdx]
                    const nextItems = turn.items.map((it) => {
                        if (it.kind !== 'subagent_run' || it.id !== stepId) return it
                        const nextChildren = applyRunEventToItems(
                            it.children,
                            ev,
                            thoughtStartsRef.current
                        )
                        let nextStatus = it.status
                        if (ev.type === 'approval_request') {
                            nextStatus = 'awaiting_approval'
                        } else if (ev.type === 'approval_resolved') {
                            nextStatus = 'running'
                        } else if (ev.type === 'run_end') {
                            const s = String(ev.payload?.status || 'completed')
                            if (s === 'cancelled' || s === 'failed') {
                                nextStatus = s
                            }
                        }
                        return { ...it, status: nextStatus, children: nextChildren }
                    })
                    return [...prev.slice(0, -1), { ...turn, items: nextItems }]
                })
                return
            }

            // Main agent event
            setTurns((prev) => {
                const lastIdx = prev.length - 1
                if (lastIdx < 0 || prev[lastIdx].role !== 'assistant') return prev
                const turn = prev[lastIdx]
                const nextItems = applyRunEventToItems(turn.items, ev, thoughtStartsRef.current)
                let nextStreaming = turn.streaming
                let nextError = turn.error
                let nextContent = turn.content

                if (ev.type === 'error') {
                    nextError = String(ev.payload?.message || '执行异常')
                } else if (ev.type === 'run_end') {
                    nextStreaming = false
                    if (typeof ev.payload?.content === 'string') {
                        nextContent = ev.payload.content
                    } else {
                        const lastContent = [...nextItems]
                            .reverse()
                            .find((it) => it.kind === 'content')
                        if (lastContent && lastContent.kind === 'content') {
                            nextContent = lastContent.text
                        }
                    }
                }

                return [
                    ...prev.slice(0, -1),
                    {
                        ...turn,
                        items: nextItems,
                        streaming: nextStreaming,
                        error: nextError,
                        content: nextContent,
                    },
                ]
            })

            if (ev.type === 'run_end') {
                setStreaming(false)
                streamingRef.current = false
                activeRunIdRef.current = null
                void refreshConversations()
            }
        })

        return () => {
            unsubSshDc()
            unsubSessClosed()
            unsubAgent()
        }
    }, [refreshSubagents, refreshConversations])

    const sendMessage = useCallback(
        async (rawText: string, mentions: string[] = []) => {
            const text = rawText.trim()
            if (!text || streamingRef.current) return

            const now = Date.now()
            const userTurn: ChatTurn = {
                id: `user_${now}`,
                role: 'user',
                content: text,
                items: [],
                createdAt: now,
            }
            const assistantTurn: ChatTurn = {
                id: `assistant_${now}`,
                role: 'assistant',
                content: '',
                items: [],
                streaming: true,
                createdAt: now + 1,
            }

            subRunToStepRef.current.clear()
            thoughtStartsRef.current.clear()
            setTurns((prev) => [...prev, userTurn, assistantTurn])
            setStreaming(true)
            streamingRef.current = true
            pendingNewConvRef.current = !activeConvRef.current

            try {
                const res = await API.agentChatSend({
                    conversationId: activeConvRef.current,
                    text,
                    modelId: modelId || settings.activeModelId || undefined,
                    mode,
                    workspaceDir,
                    mentions,
                })
                activeConvRef.current = res.conversationId
                activeRunIdRef.current = res.runId
                pendingNewConvRef.current = false
                setConversationId(res.conversationId)
            } catch (err) {
                const msg = typeof err === 'string' ? err : err instanceof Error ? err.message : String(err)
                pendingNewConvRef.current = false
                setStreaming(false)
                streamingRef.current = false
                setTurns((prev) => {
                    const lastIdx = prev.length - 1
                    if (lastIdx < 0) return prev
                    return [
                        ...prev.slice(0, -1),
                        { ...prev[lastIdx], streaming: false, error: msg },
                    ]
                })
            }
        },
        [modelId, mode, workspaceDir, settings.activeModelId]
    )

    const stopRun = useCallback(async () => {
        const cid = activeConvRef.current
        if (!cid) return
        try {
            await API.agentStop(cid)
        } catch {
            /* ignore */
        }
    }, [])

    const respondApproval = useCallback(
        async (approvalId: string, decision: ApprovalDecision) => {
            await API.agentApprovalRespond(approvalId, decision)
        },
        []
    )

    const respondAskUser = useCallback(async (askId: string, answers: any) => {
        await API.agentAskUserRespond(askId, answers)
    }, [])

    const toggleSubagent = useCallback(async (agentId: string, enabled: boolean) => {
        const next = await API.agentSetSubagentEnabled(agentId, enabled)
        setSubagents(next || [])
    }, [])

    const newConversation = useCallback(() => {
        if (streamingRef.current && activeConvRef.current) {
            void API.agentStop(activeConvRef.current).catch(() => {})
        }
        activeConvRef.current = null
        activeRunIdRef.current = null
        pendingNewConvRef.current = false
        subRunToStepRef.current.clear()
        thoughtStartsRef.current.clear()
        setConversationId(null)
        setTurns([])
        setStreaming(false)
        setWorkspaceDir('')
    }, [])

    const updateWorkspaceDir = useCallback(async (dir: string) => {
        const clean = dir.trim()
        const cid = activeConvRef.current
        setWorkspaceDir(clean)
        if (cid) {
            try {
                await API.agentUpdateConversationWorkspace(cid, clean)
                setConversations((prev) =>
                    prev.map((c) => (c.id === cid ? { ...c, workspaceDir: clean } : c))
                )
            } catch {
                /* ignore */
            }
        }
    }, [])

    const loadConversation = useCallback(async (cid: string) => {
        if (streamingRef.current && activeConvRef.current) {
            void API.agentStop(activeConvRef.current).catch(() => {})
        }
        const detail = await API.agentGetConversation(cid)
        activeConvRef.current = detail.session.id
        activeRunIdRef.current = null
        pendingNewConvRef.current = false
        subRunToStepRef.current.clear()
        thoughtStartsRef.current.clear()
        setConversationId(detail.session.id)
        if (detail.session.mode === 'planning' || detail.session.mode === 'fast') {
            setMode(detail.session.mode)
        }
        if (detail.session.modelId) {
            setModelId(detail.session.modelId)
        }
        setWorkspaceDir(detail.session.workspaceDir || '')
        const loadedTurns: ChatTurn[] = detail.messages.map((m) => {
            const items = m.role === 'assistant' ? stepNodesToTimeline(m.steps || []) : []
            if (m.role === 'assistant' && m.content) {
                items.push({
                    kind: 'content',
                    id: `final_${m.id}`,
                    text: m.content,
                    streaming: false,
                })
            }
            return {
                id: m.id,
                role: m.role === 'user' ? 'user' : 'assistant',
                content: m.content,
                items,
                streaming: false,
                createdAt: m.createdAt,
            }
        })
        setTurns(loadedTurns)
        setStreaming(false)
    }, [])

    const renameConversation = useCallback(
        async (cid: string, title: string) => {
            await API.agentRenameConversation(cid, title)
            await refreshConversations()
        },
        [refreshConversations]
    )

    const deleteConversation = useCallback(
        async (cid: string) => {
            await API.agentDeleteConversation(cid)
            if (activeConvRef.current === cid) {
                activeConvRef.current = null
                activeRunIdRef.current = null
                pendingNewConvRef.current = false
                subRunToStepRef.current.clear()
                thoughtStartsRef.current.clear()
                setConversationId(null)
                setTurns([])
                setStreaming(false)
                setWorkspaceDir('')
            }
            await refreshConversations()
        },
        [refreshConversations]
    )

    const retryFromTurn = useCallback(
        (assistantTurnId: string) => {
            if (streamingRef.current) return
            const idx = turns.findIndex((t) => t.id === assistantTurnId)
            if (idx <= 0) return
            for (let i = idx - 1; i >= 0; i--) {
                if (turns[i].role === 'user') {
                    void sendMessage(turns[i].content)
                    return
                }
            }
        },
        [turns, sendMessage]
    )

    return {
        conversationId,
        turns,
        streaming,
        awaitingApproval,
        mode,
        setMode,
        modelId,
        setModelId,
        workspaceDir,
        updateWorkspaceDir,
        subagents,
        conversations,
        refreshSubagents,
        refreshConversations,
        sendMessage,
        stopRun,
        respondApproval,
        respondAskUser,
        toggleSubagent,
        newConversation,
        loadConversation,
        renameConversation,
        deleteConversation,
        retryFromTurn,
    }
}
