import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react'
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
import { disconnectHelper, pickFallback } from './sessionHelpers'

export type ToolKind = 'api' | 'devtools' | 'aiAgent'
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
    aiAgent: { open: boolean; active: boolean }
}

export interface SessionContextValue {
    sessions: SessionsState
    tools: ToolsState
    activeTarget: ActiveTarget | null
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
    aiAgent: { open: false, active: false },
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

    const activateTab = useCallback((kind: TabKind | null, id: string | null = null) => {
        if (!kind) {
            setActiveTarget(null)
            setTools((prev) => ({
                api: { ...prev.api, active: false },
                devtools: { ...prev.devtools, active: false },
                aiAgent: { ...prev.aiAgent, active: false },
            }))
            return
        }

        if (kind === 'api' || kind === 'devtools' || kind === 'aiAgent') {
            setActiveTarget({ kind, id: null })
            setTools((prev) => ({
                api: { open: kind === 'api' ? true : prev.api.open, active: kind === 'api' },
                devtools: { open: kind === 'devtools' ? true : prev.devtools.open, active: kind === 'devtools' },
                aiAgent: { open: kind === 'aiAgent' ? true : prev.aiAgent.open, active: kind === 'aiAgent' },
            }))
        } else {
            setActiveTarget({ kind, id })
            setTools((prev) => ({
                api: { ...prev.api, active: false },
                devtools: { ...prev.devtools, active: false },
                aiAgent: { ...prev.aiAgent, active: false },
            }))
        }
    }, [])

    const openTool = useCallback((tool: ToolKind) => {
        setTools((prev) => ({
            ...prev,
            [tool]: { open: true, active: true },
        }))
        setActiveTarget({ kind: tool, id: null })
    }, [])

    const closeTool = useCallback((tool: ToolKind) => {
        setTools((prev) => ({
            ...prev,
            [tool]: { open: false, active: false },
        }))
        setActiveTarget((curr) => (curr?.kind === tool ? null : curr))
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
            return {
                ...prev,
                [kind]: list.map((item) => (item.id === id ? { ...item, ...updater } : item)),
            }
        })
    }, [])

    const closeSession = useCallback(async (kind: ConnType, id: string) => {
        await disconnectHelper(kind, id)

        let remainingTarget: { kind: ConnType; id: string } | null = null

        setSessions((prev) => {
            const currentList = prev[kind] as Array<{ id: string }>
            const nextList = currentList.filter((s) => s.id !== id)
            const nextSessions = {
                ...prev,
                [kind]: nextList,
            }

            const sessionsMap: Record<ConnType, Array<{ id: string }>> = {
                ssh: nextSessions.ssh,
                docker: nextSessions.docker,
                k8s: nextSessions.k8s,
                redis: nextSessions.redis,
                mysql: nextSessions.mysql,
                postgres: nextSessions.postgres,
                mqtt: nextSessions.mqtt,
                mongo: nextSessions.mongo,
                sqlite: nextSessions.sqlite,
            }

            remainingTarget = pickFallback(kind, sessionsMap)
            return nextSessions
        })

        setActiveTarget((curr) => {
            if (curr?.kind === kind && curr?.id === id) {
                return remainingTarget
            }
            return curr
        })
    }, [])

    return (
        <SessionContext.Provider
            value={{
                sessions,
                tools,
                activeTarget,
                activateTab,
                closeSession,
                addSession,
                updateSession,
                openTool,
                closeTool,
            }}
        >
            {children}
        </SessionContext.Provider>
    )
}
