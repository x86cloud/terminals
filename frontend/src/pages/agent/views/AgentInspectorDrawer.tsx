import React, { useRef, useEffect } from 'react'
import { Button, Segmented, Tag, Progress, Input, Tooltip, Space } from 'antd'
import { ChevronDown, ChevronRight, X, FolderOpen } from 'lucide-react'
import MarkdownViewer from '@/components/common/MarkdownViewer'
import { API } from '@/api'
import {
    AgentJobItem,
    AgentSubagentItem,
    AgentAuditLogItem,
    AgentSkillItem,
} from '@/types'
import s from './AgentInspectorDrawer.module.less'

interface AgentInspectorDrawerProps {
    showInspector: boolean
    onClose?: () => void
    inspectorTab: 'jobs' | 'subagents' | 'audit' | 'skills'
    setInspectorTab: (tab: 'jobs' | 'subagents' | 'audit' | 'skills') => void
    jobs: AgentJobItem[]
    jobOutputs: Record<string, string>
    onKillJob: (jobId: string) => void
    subagents: AgentSubagentItem[]
    subagentInputs: Record<string, string>
    setSubagentInputs: React.Dispatch<React.SetStateAction<Record<string, string>>>
    onSendSubagentMessage: (subId: string) => void
    onInterruptSubagent: (subId: string) => void
    auditLogs: AgentAuditLogItem[]
    expandedAudit: Record<string, boolean>
    toggleAuditExpand: (key: string) => void
    skillsList: AgentSkillItem[]
    expandedSkills: Record<string, boolean>
    toggleSkillExpand: (skillName: string) => void
}

export const AgentInspectorDrawer: React.FC<AgentInspectorDrawerProps> = ({
    showInspector,
    onClose,
    inspectorTab,
    setInspectorTab,
    jobs,
    jobOutputs,
    onKillJob,
    subagents,
    subagentInputs,
    setSubagentInputs,
    onSendSubagentMessage,
    onInterruptSubagent,
    auditLogs,
    expandedAudit,
    toggleAuditExpand,
    skillsList,
    expandedSkills,
    toggleSkillExpand,
}) => {
    const drawerRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (!showInspector || !onClose) return

        const handleMouseDown = (e: MouseEvent) => {
            const target = e.target as HTMLElement | null
            if (!target) return
            // If clicked inside the drawer, do not close
            if (drawerRef.current && drawerRef.current.contains(target)) return
            // If clicked on the toggle button itself, let the button onClick handle it
            if (target.closest('[data-inspector-toggle="true"]')) return

            onClose()
        }

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose()
            }
        }

        window.addEventListener('mousedown', handleMouseDown)
        window.addEventListener('keydown', handleKeyDown)

        return () => {
            window.removeEventListener('mousedown', handleMouseDown)
            window.removeEventListener('keydown', handleKeyDown)
        }
    }, [showInspector, onClose])

    if (!showInspector) return null

    return (
        <div ref={drawerRef} className={s.inspectorPane}>
            <div className={s.inspectorHeader}>
                <Segmented
                    size="small"
                    value={inspectorTab}
                    onChange={(val) => setInspectorTab(val as any)}
                    options={[
                        { label: `作业 (${jobs.length})`, value: 'jobs' },
                        { label: `子代理 (${subagents.length})`, value: 'subagents' },
                        { label: `审计 (${auditLogs.length})`, value: 'audit' },
                        { label: 'SOP 技能', value: 'skills' },
                    ]}
                />
                {onClose && (
                    <Tooltip title="关闭工作台抽屉">
                        <Button
                            size="small"
                            type="text"
                            icon={<X size={14} />}
                            onClick={onClose}
                        />
                    </Tooltip>
                )}
            </div>

            <div className={s.inspectorBody}>
                {inspectorTab === 'jobs' &&
                    (jobs.length === 0 ? (
                        <div className={s.emptyTip}>
                            暂无后台异步作业
                        </div>
                    ) : (
                        jobs.map((jb) => (
                            <div key={jb.id} className={s.jobCard}>
                                <div className={s.jobHeader} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                                    <span style={{ fontWeight: 600 }}>
                                        {jb.description}
                                    </span>
                                    <Tag color={jb.state === 'completed' ? 'success' : jb.state === 'failed' ? 'error' : 'warning'}>
                                        {jb.state}
                                    </Tag>
                                </div>
                                <div style={{ marginBottom: 6 }}>
                                    <Progress
                                        percent={Math.floor(jb.progress * 100)}
                                        size="small"
                                        status={jb.state === 'failed' ? 'exception' : jb.state === 'completed' ? 'success' : 'active'}
                                    />
                                </div>
                                <div
                                    style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        color: '#888',
                                        fontSize: 11,
                                    }}
                                >
                                    <span>{jb.progressMsg || '运行中'}</span>
                                    {jb.state === 'running' && (
                                        <Button
                                            size="small"
                                            danger
                                            onClick={() => onKillJob(jb.id)}
                                        >
                                            终止
                                        </Button>
                                    )}
                                </div>
                                {jobOutputs[jb.id] && (
                                    <div className={s.jobOutputTerminal}>
                                        {jobOutputs[jb.id]}
                                    </div>
                                )}
                            </div>
                        ))
                    ))}

                {inspectorTab === 'subagents' &&
                    (subagents.length === 0 ? (
                        <div className={s.emptyTip}>
                            暂无委派的子代理
                        </div>
                    ) : (
                        subagents.map((sub) => (
                            <div key={sub.id} className={s.jobCard}>
                                <div className={s.jobHeader}>
                                    <Space size={6}>
                                        <span style={{ fontWeight: 600 }}>
                                            子代理 {sub.id.slice(-8)}
                                        </span>
                                        <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>
                                            深度: {sub.depth || 1}
                                        </span>
                                    </Space>
                                    <Space size={4}>
                                        <Tag color={sub.state === 'completed' ? 'success' : sub.state === 'failed' ? 'error' : 'warning'}>
                                            {sub.state}
                                        </Tag>
                                        {sub.state === 'running' && (
                                            <Button
                                                size="small"
                                                danger
                                                onClick={() => onInterruptSubagent(sub.id)}
                                            >
                                                中断
                                            </Button>
                                        )}
                                    </Space>
                                </div>
                                <div style={{ color: 'var(--text)', fontSize: 12, lineHeight: 1.4 }}>
                                    <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>
                                        任务:{' '}
                                    </span>
                                    {sub.prompt}
                                </div>
                                {sub.result && (
                                    <div className={s.jobOutputTerminal}>
                                        {sub.result}
                                    </div>
                                )}
                                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                                    <Input
                                        size="small"
                                        style={{ flex: 1 }}
                                        placeholder="追加提问或指令..."
                                        value={subagentInputs[sub.id] || ''}
                                        onChange={(e) =>
                                            setSubagentInputs({
                                                ...subagentInputs,
                                                [sub.id]: e.target.value,
                                            })
                                        }
                                        onPressEnter={() => onSendSubagentMessage(sub.id)}
                                    />
                                    <Button
                                        size="small"
                                        type="primary"
                                        disabled={!(subagentInputs[sub.id] || '').trim()}
                                        onClick={() => onSendSubagentMessage(sub.id)}
                                    >
                                        发送
                                    </Button>
                                </div>
                            </div>
                        ))
                    ))}

                {inspectorTab === 'audit' &&
                    (auditLogs.length === 0 ? (
                        <div className={s.emptyTip}>
                            暂无审计日志记录
                        </div>
                    ) : (
                        auditLogs.map((log, i) => {
                            const auditKey = String(log.id ?? i)
                            const isExp = expandedAudit[auditKey] ?? false
                            return (
                                <div
                                    key={auditKey}
                                    className={s.auditRow}
                                    onClick={() => toggleAuditExpand(auditKey)}
                                    style={{ cursor: 'pointer' }}
                                >
                                    <div className={s.auditTop}>
                                        <span className={s.auditTool}>
                                            [{log.tool}]
                                        </span>
                                        <Tag color={log.decision === 'allow' ? 'success' : log.decision === 'forbidden' ? 'error' : 'warning'}>
                                            {log.decision}
                                        </Tag>
                                    </div>
                                    <div
                                        style={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            color: 'var(--text-dim)',
                                            fontSize: 10,
                                        }}
                                    >
                                        <span>
                                            Trace:{' '}
                                            {(
                                                log.trace_id ||
                                                log.traceId ||
                                                'trace'
                                            ).slice(0, 10)}
                                            ...
                                        </span>
                                        <span>
                                            耗时:{' '}
                                            {log.duration_ms ??
                                                log.durationMs ??
                                                0}
                                            ms ·{' '}
                                            {new Date(
                                                log.created_at ||
                                                log.createdAt ||
                                                Date.now()
                                            ).toLocaleTimeString()}
                                        </span>
                                    </div>
                                    {isExp && (
                                        <div
                                            style={{
                                                marginTop: 4,
                                                padding: 6,
                                                background: 'rgba(0,0,0,0.15)',
                                                borderRadius: 4,
                                                fontSize: 11,
                                            }}
                                        >
                                            {log.input && (
                                                <div>
                                                    <strong>参数/入参:</strong>{' '}
                                                    {log.input}
                                                </div>
                                            )}
                                            {(log.outputPreview ||
                                                log.output_head) && (
                                                    <div>
                                                        <strong>输出摘要:</strong>{' '}
                                                        {log.outputPreview ||
                                                            log.output_head}
                                                    </div>
                                                )}
                                        </div>
                                    )}
                                </div>
                            )
                        })
                    ))}

                {inspectorTab === 'skills' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <div className={s.skillsHeader}>
                            <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                                本地已发现 {skillsList.length} 个技能
                            </span>
                            <Button
                                size="small"
                                icon={<FolderOpen size={12} />}
                                onClick={() => API.agentOpenSkillsDir()}
                                title="在系统文件管理器中打开本地 Skills 根目录"
                            >
                                打开 Skills 目录
                            </Button>
                        </div>

                        {skillsList.length === 0 ? (
                            <div className={s.skillsEmpty}>
                                <div>暂无本地 SOP 技能包</div>
                                <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 6 }}>
                                    在本地 Skills 目录下创建 <code>&lt;技能名&gt;/SKILL.md</code> 即可生效
                                </div>
                                <Button
                                    size="small"
                                    icon={<FolderOpen size={12} />}
                                    onClick={() => API.agentOpenSkillsDir()}
                                    style={{ marginTop: 12 }}
                                >
                                    打开本地目录
                                </Button>
                            </div>
                        ) : (
                            skillsList.map((sk) => {
                                const isExpanded = expandedSkills[sk.name] ?? false
                                return (
                                    <div key={sk.name} className={s.skillCard}>
                                        <div className={s.skillHeader}>
                                            <Space size={6}>
                                                <span style={{ fontWeight: 600, color: 'var(--text)' }}>
                                                    {sk.name}
                                                </span>
                                                {sk.context && (
                                                    <Tag color="blue">
                                                        {sk.context}
                                                    </Tag>
                                                )}
                                            </Space>
                                        </div>
                                        <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>
                                            {sk.description}
                                        </div>
                                        {sk.tools && sk.tools.length > 0 && (
                                            <div className={s.skillTools}>
                                                {sk.tools.map((t) => (
                                                    <Tag key={t}>{t}</Tag>
                                                ))}
                                            </div>
                                        )}
                                        <div
                                            className={s.skillExpandBtn}
                                            onClick={() =>
                                                toggleSkillExpand(sk.name)
                                            }
                                        >
                                            {isExpanded ? (
                                                <ChevronDown size={12} />
                                            ) : (
                                                <ChevronRight size={12} />
                                            )}
                                            <span>
                                                {isExpanded
                                                    ? '折叠详细 SOP 指引'
                                                    : '查看详细 SOP 指引'}
                                            </span>
                                        </div>
                                        {isExpanded && (
                                            <div
                                                className={s.jobOutputTerminal}
                                                style={{
                                                    maxHeight: 180,
                                                    color: '#e0e0e0',
                                                    background: 'rgba(0,0,0,0.3)',
                                                    marginTop: 6,
                                                }}
                                            >
                                                <MarkdownViewer
                                                    content={sk.instructions}
                                                />
                                            </div>
                                        )}
                                    </div>
                                )
                            })
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}

export default AgentInspectorDrawer
