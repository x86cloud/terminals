import React, { createContext, useContext, useState, useCallback, useEffect, useRef, useMemo, ReactNode } from 'react'
import {
    SessionInfo,
    RedisSessionInfo,
    MysqlSessionInfo,
    PostgresSessionInfo,
    MqttSessionInfo,
    MongoSessionInfo,
    SqliteSessionInfo,
    DockerSessionInfo,
    K8sSessionInfo,
    ConnType,
} from '@/types'
import { disconnectHelper, getAllOpenTabs, pickAdjacentFallback } from './sessionHelpers'

export type ToolKind = 'api' | 'devtools'
export type TabKind = ConnType | ToolKind

export interface ActiveTarget {
    kind: TabKind
    id?: string | null
}

export interface SessionsState {
    ssh: SessionInfo[]
    redis: RedisSessionInfo[]
    mysql: MysqlSessionInfo[]
    postgres: PostgresSessionInfo[]
    mqtt: MqttSessionInfo[]
    mongo: MongoSessionInfo[]
    sqlite: SqliteSessionInfo[]
    docker: DockerSessionInfo[]
    k8s: K8sSessionInfo[]
}

export interface ToolsState {
    api: { open: boolean; active: boolean }
    devtools: { open: boolean; active: boolean }
}

export interface SessionContextValue {
    sessions: SessionsState
    tools: ToolsState
    activeTarget: ActiveTarget | null
    sidebarOpen: boolean
    toggleSidebar: () => void
    setSidebarOpen: React.Dispatch<React.SetStateAction<boolean>>
    activateTab: (kind: TabKind | null, id?: string | null) => void
    closeSession: (kind: ConnType, id: string) => Promise<void>
    addSession: <K extends keyof SessionsState>(kind: K, info: SessionsState[K][number]) => void
    updateSession: <K extends keyof SessionsState>(kind: K, id: string, updater: Partial<SessionsState[K][number]>) => void
    openTool: (tool: ToolKind) => void
    closeTool: (tool: ToolKind) => void
}

const initialSessionsState: SessionsState = {
    ssh: [],
    redis: [],
    mysql: [],
    postgres: [],
    mqtt: [],
    mongo: [],
    sqlite: [],
    docker: [],
    k8s: [],
}

const initialToolsState: ToolsState = {
    api: { open: false, active: false },
    devtools: { open: false, active: false },
}

export const SessionContext = createContext<SessionContextValue | null>(null)

export function useSession() {
    const ctx = useContext(SessionContext)
    if (!ctx) {
        throw new Error('useSession must be used within a SessionProvider')
    }
    return ctx
}

export function SessionProvider({ children }: { children: ReactNode }) {
    const [sessions, setSessions] = useState<SessionsState>(initialSessionsState)
    const [tools, setTools] = useState<ToolsState>(initialToolsState)
    const [activeTarget, setActiveTarget] = useState<ActiveTarget | null>(null)
    const [sidebarOpen, setSidebarOpen] = useState<boolean>(true)

    const sessionsRef = useRef(sessions)
    const toolsRef = useRef(tools)
    const closingSessionsRef = useRef<Set<string>>(new Set())
    useEffect(() => {
        sessionsRef.current = sessions
        toolsRef.current = tools
    }, [sessions, tools])

    const toggleSidebar = useCallback(() => {
        setSidebarOpen((prev) => !prev)
    }, [])

    const activateTab = useCallback((kind: TabKind | null, id: string | null = null) => {
        if (!kind) {
            setActiveTarget(null)
            setTools((prev) => ({
                api: { ...prev.api, active: false },
                devtools: { ...prev.devtools, active: false },
            }))
            return
        }

        if (kind === 'api' || kind === 'devtools') {
            setActiveTarget({ kind, id: null })
            setTools((prev) => ({
                api: { open: kind === 'api' ? true : prev.api.open, active: kind === 'api' },
                devtools: { open: kind === 'devtools' ? true : prev.devtools.open, active: kind === 'devtools' },
            }))
        } else {
            setActiveTarget({ kind, id })
            setTools((prev) => ({
                api: { ...prev.api, active: false },
                devtools: { ...prev.devtools, active: false },
            }))
        }
    }, [])

    const openTool = useCallback((tool: ToolKind) => {
        activateTab(tool)
    }, [activateTab])

    const closeTool = useCallback((tool: ToolKind) => {
        const closedTarget: ActiveTarget = { kind: tool, id: null }
        const allTabs = getAllOpenTabs(sessionsRef.current, toolsRef.current)
        const fallback = pickAdjacentFallback(closedTarget, allTabs)

        setTools((prev) => ({
            ...prev,
            [tool]: { open: false, active: false },
            ...(fallback && (fallback.kind === 'api' || fallback.kind === 'devtools')
                ? { [fallback.kind]: { ...prev[fallback.kind], active: true } }
                : {}),
        }))

        setActiveTarget((curr) => {
            if (curr?.kind === tool) {
                return fallback
            }
            return curr
        })
    }, [])

    const addSession = useCallback(<K extends keyof SessionsState>(kind: K, info: SessionsState[K][number]) => {
        setSessions((prev) => {
            const list = prev[kind] as Array<{ id: string }>
            const filtered = list.filter((s) => s.id !== info.id)
            return {
                ...prev,
                [kind]: [...filtered, info],
            }
        })
        activateTab(kind as TabKind, info.id)
    }, [activateTab])

    const updateSession = useCallback(<K extends keyof SessionsState>(kind: K, id: string, updater: Partial<SessionsState[K][number]>) => {
        setSessions((prev) => {
            const list = prev[kind] as Array<{ id: string }>
            if (!list || !list.some((item) => item.id === id)) {
                return prev
            }
            return {
                ...prev,
                [kind]: list.map((item) => (item.id === id ? { ...item, ...updater } : item)),
            }
        })
    }, [])

    const closeSession = useCallback(async (kind: ConnType, id: string) => {
        const sessionKey = `${kind}:${id}`
        if (closingSessionsRef.current.has(sessionKey)) {
            return
        }

        const list = sessionsRef.current[kind] as Array<{ id: string }> | undefined
        if (!list || !list.some((s) => s.id === id)) {
            return
        }

        closingSessionsRef.current.add(sessionKey)
        try {
            await disconnectHelper(kind, id)
        } finally {
            closingSessionsRef.current.delete(sessionKey)
        }

        const closedTarget: ActiveTarget = { kind, id }
        const allTabs = getAllOpenTabs(sessionsRef.current, toolsRef.current)
        const fallback = pickAdjacentFallback(closedTarget, allTabs)

        setSessions((prev) => {
            const currentList = prev[kind] as Array<{ id: string }>
            if (!currentList.some((s) => s.id === id)) {
                return prev
            }
            const nextList = currentList.filter((s) => s.id !== id)
            return {
                ...prev,
                [kind]: nextList,
            }
        })

        setActiveTarget((curr) => {
            if (curr?.kind === kind && curr?.id === id) {
                return fallback
            }
            return curr
        })

        if (fallback && (fallback.kind === 'api' || fallback.kind === 'devtools')) {
            setTools((prev) => ({
                ...prev,
                api: { ...prev.api, active: fallback.kind === 'api' },
                devtools: { ...prev.devtools, active: fallback.kind === 'devtools' },
            }))
        }
    }, [])

    const contextValue = useMemo<SessionContextValue>(
        () => ({
            sessions,
            tools,
            activeTarget,
            sidebarOpen,
            toggleSidebar,
            setSidebarOpen,
            activateTab,
            closeSession,
            addSession,
            updateSession,
            openTool,
            closeTool,
        }),
        [
            sessions,
            tools,
            activeTarget,
            sidebarOpen,
            toggleSidebar,
            activateTab,
            closeSession,
            addSession,
            updateSession,
            openTool,
            closeTool,
        ]
    )

    return (
        <SessionContext.Provider value={contextValue}>
            {children}
        </SessionContext.Provider>
    )
}
