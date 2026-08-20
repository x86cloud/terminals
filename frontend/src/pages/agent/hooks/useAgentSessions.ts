import { useState, useCallback, useEffect, useMemo } from 'react'
import { API } from '@/api'
import { AiMessage } from '@/types'

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
    const activeSessionId = DEFAULT_SESSION_ID
    const [messages, setMessages] = useState<AiMessage[]>([])
    const [visibleRounds, setVisibleRounds] = useState<number>(DEFAULT_PAGE_ROUNDS)

    const loadSessionMessages = useCallback(async () => {
        try {
            const msgs = await API.agentGetSessionMessages(DEFAULT_SESSION_ID)
            setMessages(msgs || [])
        } catch {
            setMessages([])
        }
    }, [])

    const saveMessages = useCallback(async (msgs: AiMessage[]) => {
        try {
            await API.agentSaveSessionMessages(DEFAULT_SESSION_ID, msgs)
        } catch {
            /* ignore */
        }
    }, [])

    const clearMessages = useCallback(async () => {
        setMessages([])
        setVisibleRounds(DEFAULT_PAGE_ROUNDS)
        try {
            await API.agentClearHistory()
            await API.agentSaveSessionMessages(DEFAULT_SESSION_ID, [])
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
        loadSessionMessages()
    }, [loadSessionMessages])

    return {
        activeSessionId,
        messages,
        setMessages,
        visibleMessages,
        totalRounds,
        hasMore,
        remainingRounds,
        loadMoreHistory,
        loadSessionMessages,
        saveMessages,
        clearMessages,
    }
}

export default useAgentSessions
