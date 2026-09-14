import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { API, subscribe } from '@/api'
import { AiMessage, AgentSessionItem } from '@/types'

const DEFAULT_SESSION_ID = 'ai_agent_default'
const DEFAULT_PAGE_ROUNDS = 5

export function sliceLatestRounds(allMsgs: AiMessage[], roundCount: number): {
    sliced: AiMessage[]
    totalRounds: number
    visibleRounds: number
    hasMore: boolean
    remainingRounds: number
} {
    if (!allMsgs || allMsgs.length === 0) {
        return { sliced: [], totalRounds: 0, visibleRounds: 0, hasMore: false, remainingRounds: 0 }
    }

    const userIndices: number[] = []
    for (let i = 0; i < allMsgs.length; i++) {
        if (allMsgs[i].role === 'user') {
            userIndices.push(i)
        }
    }

    const totalRounds = userIndices.length === 0 ? 1 : userIndices.length
    if (userIndices.length <= roundCount) {
        return {
            sliced: allMsgs,
            totalRounds,
            visibleRounds: totalRounds,
            hasMore: false,
            remainingRounds: 0,
        }
    }

    const targetUserIndex = userIndices[userIndices.length - roundCount]
    const remainingRounds = userIndices.length - roundCount
    return {
        sliced: allMsgs.slice(targetUserIndex),
        totalRounds,
        visibleRounds: roundCount,
        hasMore: true,
        remainingRounds,
    }
}

export function useAgentSessions() {
    const [sessions, setSessions] = useState<AgentSessionItem[]>([])
    const [activeSessionId, setActiveSessionId] = useState<string>(() => {
        return localStorage.getItem('active_agent_session_id') || DEFAULT_SESSION_ID
    })
    const activeSessionIdRef = useRef<string>(activeSessionId)
    activeSessionIdRef.current = activeSessionId

    const [messages, setMessages] = useState<AiMessage[]>([])
    const [visibleRounds, setVisibleRounds] = useState<number>(DEFAULT_PAGE_ROUNDS)
    const [loadingSessions, setLoadingSessions] = useState<boolean>(false)
    const [loadingMessages, setLoadingMessages] = useState<boolean>(false)

    const currentSession = useMemo(() => {
        return sessions.find((s) => s.id === activeSessionId) || null
    }, [sessions, activeSessionId])

    const loadSessionMessages = useCallback(async (sessionId?: string) => {
        const targetId = sessionId || activeSessionIdRef.current
        if (!targetId) return
        setLoadingMessages(true)
        try {
            const rawMsgs = await API.agentGetSessionMessages(targetId)
            const msgs = (rawMsgs || []).map((m) => ({ ...m }))
            // 规范化历史消息中的 Plan 状态：
            // 找到所有带有未批准 plan 的消息，只保留最后一个为 proposed，更早的旧方案自动标记为 expired
            const unapprovedPlanIndices: number[] = []
            msgs.forEach((m, idx) => {
                if (m.plan && m.plan.status !== 'approved') {
                    unapprovedPlanIndices.push(idx)
                }
            })
            if (unapprovedPlanIndices.length > 1) {
                for (let i = 0; i < unapprovedPlanIndices.length - 1; i++) {
                    const targetIdx = unapprovedPlanIndices[i]
                    if (msgs[targetIdx]?.plan) {
                        msgs[targetIdx].plan = {
                            ...msgs[targetIdx].plan!,
                            status: 'expired',
                        }
                    }
                }
            }
            setMessages(msgs)
            setVisibleRounds(DEFAULT_PAGE_ROUNDS)
        } catch {
            setMessages([])
        } finally {
            setLoadingMessages(false)
        }
    }, [])

    const loadSessions = useCallback(async () => {
        setLoadingSessions(true)
        try {
            const list = await API.agentListSessions()
            if (!list || list.length === 0) {
                const created = await API.agentCreateSession('新会话')
                setSessions([created])
                setActiveSessionId(created.id)
                activeSessionIdRef.current = created.id
                localStorage.setItem('active_agent_session_id', created.id)
                await loadSessionMessages(created.id)
            } else {
                setSessions(list)
                const savedId = localStorage.getItem('active_agent_session_id')
                const exists = list.find((s) => s.id === savedId)
                const targetId = exists ? exists.id : list[0].id
                setActiveSessionId(targetId)
                activeSessionIdRef.current = targetId
                localStorage.setItem('active_agent_session_id', targetId)
                await loadSessionMessages(targetId)
            }
        } catch (e) {
            console.error('Failed to load agent sessions', e)
        } finally {
            setLoadingSessions(false)
        }
    }, [loadSessionMessages])

    const createSession = useCallback(async (title?: string) => {
        try {
            const sessionTitle = title?.trim() || '新会话'
            const created = await API.agentCreateSession(sessionTitle)
            setSessions((prev) => [created, ...prev.filter((s) => s.id !== created.id)])
            setActiveSessionId(created.id)
            activeSessionIdRef.current = created.id
            localStorage.setItem('active_agent_session_id', created.id)
            setMessages([])
            setVisibleRounds(DEFAULT_PAGE_ROUNDS)
            return created
        } catch (e) {
            console.error('Failed to create session', e)
            return null
        }
    }, [])

    const switchSession = useCallback(
        async (sessionId: string) => {
            if (!sessionId || sessionId === activeSessionIdRef.current) return
            setActiveSessionId(sessionId)
            activeSessionIdRef.current = sessionId
            localStorage.setItem('active_agent_session_id', sessionId)
            await loadSessionMessages(sessionId)
        },
        [loadSessionMessages]
    )

    const renameSession = useCallback(async (sessionId: string, newTitle: string) => {
        const trimmed = newTitle.trim()
        if (!trimmed) return
        try {
            await API.agentUpdateSessionTitle(sessionId, trimmed)
            setSessions((prev) =>
                prev.map((s) =>
                    s.id === sessionId
                        ? { ...s, title: trimmed, updated_at: Date.now(), updatedAt: Date.now() }
                        : s
                )
            )
        } catch (e) {
            console.error('Failed to rename session', e)
        }
    }, [])

    const deleteSession = useCallback(
        async (sessionId: string) => {
            try {
                await API.agentDeleteSession(sessionId)
                const remaining = sessions.filter((s) => s.id !== sessionId)
                setSessions(remaining)
                if (activeSessionIdRef.current === sessionId) {
                    if (remaining.length > 0) {
                        const nextId = remaining[0].id
                        setActiveSessionId(nextId)
                        activeSessionIdRef.current = nextId
                        localStorage.setItem('active_agent_session_id', nextId)
                        await loadSessionMessages(nextId)
                    } else {
                        const created = await API.agentCreateSession('新会话')
                        setSessions([created])
                        setActiveSessionId(created.id)
                        activeSessionIdRef.current = created.id
                        localStorage.setItem('active_agent_session_id', created.id)
                        setMessages([])
                        setVisibleRounds(DEFAULT_PAGE_ROUNDS)
                    }
                }
            } catch (e) {
                console.error('Failed to delete session', e)
            }
        },
        [sessions, loadSessionMessages]
    )

    const saveMessages = useCallback(async (msgs: AiMessage[]) => {
        const targetId = activeSessionIdRef.current
        try {
            await API.agentSaveSessionMessages(targetId, msgs)
        } catch {
            /* ignore */
        }
    }, [])

    const clearMessages = useCallback(async () => {
        const targetId = activeSessionIdRef.current
        setMessages([])
        setVisibleRounds(DEFAULT_PAGE_ROUNDS)
        try {
            await API.agentClearHistory()
            await API.agentSaveSessionMessages(targetId, [])
        } catch {
            /* ignore */
        }
    }, [])

    const loadMoreHistory = useCallback(() => {
        setVisibleRounds((prev) => prev + DEFAULT_PAGE_ROUNDS)
    }, [])

    const { sliced: visibleMessages, totalRounds, hasMore, remainingRounds } = useMemo(() => {
        return sliceLatestRounds(messages, visibleRounds)
    }, [messages, visibleRounds])

    useEffect(() => {
        loadSessions()
    }, [loadSessions])

    useEffect(() => {
        const unsub = subscribe('agent:session_updated', (data: any) => {
            if (!data || !data.id) return
            setSessions((prev) =>
                prev.map((s) =>
                    s.id === data.id
                        ? {
                              ...s,
                              title: data.title || s.title,
                              updated_at: Date.now(),
                              updatedAt: Date.now(),
                          }
                        : s
                )
            )
        })
        return () => {
            unsub()
        }
    }, [])

    return {
        sessions,
        activeSessionId,
        currentSession,
        messages,
        setMessages,
        visibleMessages,
        totalRounds,
        hasMore,
        remainingRounds,
        loadingSessions,
        loadingMessages,
        loadMoreHistory,
        loadSessionMessages,
        saveMessages,
        clearMessages,
        createSession,
        switchSession,
        renameSession,
        deleteSession,
        refreshSessions: loadSessions,
    }
}

export default useAgentSessions
