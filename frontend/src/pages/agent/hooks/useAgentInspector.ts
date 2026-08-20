import { useState, useCallback, useEffect } from 'react'
import { API } from '@/api'
import {
    AgentJobItem,
    AgentSubagentItem,
    AgentAuditLogItem,
    AgentSkillItem,
} from '@/types'

export function useAgentInspector(activeSessionId: string, setNoticeText?: (msg: string) => void) {
    const [jobs, setJobs] = useState<AgentJobItem[]>([])
    const [jobOutputs, setJobOutputs] = useState<Record<string, string>>({})
    const [subagents, setSubagents] = useState<AgentSubagentItem[]>([])
    const [auditLogs, setAuditLogs] = useState<AgentAuditLogItem[]>([])
    const [skillsList, setSkillsList] = useState<AgentSkillItem[]>([])
    const [subagentInputs, setSubagentInputs] = useState<Record<string, string>>({})
    const [expandedSkills, setExpandedSkills] = useState<Record<string, boolean>>({})
    const [expandedAudit, setExpandedAudit] = useState<Record<string, boolean>>({})
    const [inspectorTab, setInspectorTab] = useState<'jobs' | 'subagents' | 'audit' | 'skills'>('jobs')
    const [showInspector, setShowInspector] = useState<boolean>(false)

    const loadInspectorData = useCallback(
        async (sessId: string) => {
            try {
                const [jList, sList, aList, skList] = await Promise.all([
                    API.agentListJobs(sessId),
                    API.agentListSubagents(sessId),
                    API.agentGetAuditLogs(sessId, 20),
                    API.agentListSkills(),
                ])
                setJobs(jList || [])
                setSubagents(sList || [])
                setAuditLogs(aList || [])
                setSkillsList(skList || [])
            } catch {
                /* ignore */
            }
        },
        []
    )

    const handleKillJob = useCallback(
        async (jobId: string) => {
            try {
                await API.agentKillJob(jobId)
                await loadInspectorData(activeSessionId)
            } catch (err) {
                console.error('Failed to kill job:', err)
            }
        },
        [activeSessionId, loadInspectorData]
    )

    const handleSendSubagentMessage = useCallback(
        async (subId: string) => {
            const text = (subagentInputs[subId] || '').trim()
            if (!text) return
            try {
                setNoticeText?.(`已向子代理 [${subId.slice(-8)}] 发送追加指令...`)
                setSubagentInputs((prev) => ({ ...prev, [subId]: '' }))
                const res = await API.agentSendSubagent(subId, text)
                setSubagents((prev) =>
                    prev.map((s) =>
                        s.id === subId ? { ...s, result: res, state: 'completed' } : s
                    )
                )
                setNoticeText?.(`子代理 [${subId.slice(-8)}] 追加推演已完成`)
            } catch (err: any) {
                setNoticeText?.(`❌ 子代理执行失败: ${err?.message || err}`)
            }
        },
        [subagentInputs, setNoticeText]
    )

    const handleInterruptSubagent = useCallback(
        async (subId: string) => {
            try {
                await API.agentInterruptSubagent(subId)
                setSubagents((prev) =>
                    prev.map((s) => (s.id === subId ? { ...s, state: 'interrupted' } : s))
                )
                setNoticeText?.(`子代理 [${subId.slice(-8)}] 已被中断`)
            } catch {
                /* ignore */
            }
        },
        [setNoticeText]
    )

    const toggleSkillExpand = useCallback((skillName: string) => {
        setExpandedSkills((prev) => ({ ...prev, [skillName]: !prev[skillName] }))
    }, [])

    const toggleAuditExpand = useCallback((key: string) => {
        setExpandedAudit((prev) => ({ ...prev, [key]: !prev[key] }))
    }, [])

    useEffect(() => {
        loadInspectorData(activeSessionId)
    }, [activeSessionId, showInspector, loadInspectorData])

    return {
        jobs,
        setJobs,
        jobOutputs,
        setJobOutputs,
        subagents,
        setSubagents,
        auditLogs,
        setAuditLogs,
        skillsList,
        setSkillsList,
        subagentInputs,
        setSubagentInputs,
        expandedSkills,
        setExpandedSkills,
        expandedAudit,
        setExpandedAudit,
        inspectorTab,
        setInspectorTab,
        showInspector,
        setShowInspector,
        loadInspectorData,
        handleKillJob,
        handleSendSubagentMessage,
        handleInterruptSubagent,
        toggleSkillExpand,
        toggleAuditExpand,
    }
}

export default useAgentInspector
