import React, { useState, useEffect } from 'react'
import { RotateCw, ChevronDown, ChevronRight } from 'lucide-react'
import { ProcessStep, AiMessage } from '@/types'
import s from './ProcessStepsList.module.less'

interface ProcessStepsListProps {
    steps: ProcessStep[]
    isStreaming?: boolean
}

export const ProcessStepsList: React.FC<ProcessStepsListProps> = ({
    steps,
    isStreaming = false,
}) => {
    const [masterExpanded, setMasterExpanded] = useState<boolean>(isStreaming)
    const [expandedSteps, setExpandedSteps] = useState<Record<string, boolean>>({})

    useEffect(() => {
        if (isStreaming) {
            setMasterExpanded(true)
        }
    }, [isStreaming])

    if (!steps || steps.length === 0) {
        if (isStreaming) {
            return (
                <div className={s.pipelineMinimalContainer}>
                    <div className={s.pipelineMasterHeader}>
                        <div className={s.pipelineMasterLeft}>
                            <RotateCw size={12} className={s.spinIcon} />
                            <span className={s.pipelineMasterTitle}>正在深度推演与准备中…</span>
                        </div>
                    </div>
                </div>
            )
        }
        return null
    }

    const thinkCount = steps.filter((s) => s.type === 'think').length
    const toolCount = steps.filter((s) => s.type === 'tool').length

    const toggleStep = (stepId: string, e: React.MouseEvent) => {
        e.stopPropagation()
        setExpandedSteps((prev) => ({ ...prev, [stepId]: !prev[stepId] }))
    }

    const formatSummary = (step: ProcessStep) => {
        if (step.type === 'think') return '深度思考过程'
        if (step.status === 'running') {
            return `${step.title} (正在调用...)`
        }
        if (step.summary && !step.summary.startsWith('正在调用')) {
            const trimmed = step.summary.trim()
            if (trimmed.length > 50 || trimmed.includes('\n')) {
                return step.title
            }
            return `${step.title} (${trimmed})`
        }
        return step.title
    }

    return (
        <div className={s.pipelineMinimalContainer}>
            <div
                className={s.pipelineMasterHeader}
                onClick={() => setMasterExpanded(!masterExpanded)}
                title="点击展开/折叠推演与工具调用"
            >
                <div className={s.pipelineMasterLeft}>
                    {isStreaming ? (
                        <RotateCw size={12} className={s.spinIcon} />
                    ) : (
                        <span>💭</span>
                    )}
                    <span className={s.pipelineMasterTitle}>
                        {isStreaming
                            ? '正在深度推演中…'
                            : `思考与工具执行 (${thinkCount ? `${thinkCount} 思考` : ''}${thinkCount && toolCount ? ' · ' : ''}${toolCount ? `${toolCount} 工具` : ''})`}
                    </span>
                </div>
                {masterExpanded ? (
                    <ChevronDown size={14} style={{ color: 'var(--text-dim)' }} />
                ) : (
                    <ChevronRight size={14} style={{ color: 'var(--text-dim)' }} />
                )}
            </div>

            {masterExpanded && (
                <div className={s.stepsListContainer}>
                    {steps.map((step) => {
                        const isStepExpanded =
                            expandedSteps[step.id] ??
                            (isStreaming && step.status === 'running')
                        return (
                            <div key={step.id} className={s.stepBlockRow}>
                                <div
                                    className={s.stepBlockHeader}
                                    onClick={(e) => toggleStep(step.id, e)}
                                >
                                    <div className={s.stepBlockHeaderLeft}>
                                        <span className={s.stepIconText}>
                                            {step.type === 'tool' ? '🛠️' : '💭'}
                                        </span>
                                        <span className={s.stepTitleText}>
                                            {formatSummary(step)}
                                        </span>
                                        {step.status === 'running' && (
                                            <RotateCw size={11} className={s.spinIcon} />
                                        )}
                                    </div>
                                    {isStepExpanded ? (
                                        <ChevronDown size={12} style={{ color: 'var(--text-dim)' }} />
                                    ) : (
                                        <ChevronRight size={12} style={{ color: 'var(--text-dim)' }} />
                                    )}
                                </div>
                                {isStepExpanded && (
                                    <div className={s.stepBlockBody}>
                                        {step.type === 'think' ? (
                                            <div className={s.reasoningBox}>{step.content || '思考中...'}</div>
                                        ) : (
                                            <div>
                                                {step.summary && !step.summary.startsWith('正在调用') && (
                                                    <div className={s.toolSection}>
                                                        <div className={s.toolSectionTitle}>输入参数 (Input):</div>
                                                        <pre className={s.toolCodeBox}>{step.summary}</pre>
                                                    </div>
                                                )}
                                                {step.content ? (
                                                    <div className={s.toolSection}>
                                                        <div className={s.toolSectionTitle}>输出结果 (Output):</div>
                                                        <pre className={s.toolCodeBox}>{step.content}</pre>
                                                    </div>
                                                ) : step.status === 'running' ? (
                                                    <div className={s.toolSection}>
                                                        <div className={s.toolSectionTitle}>执行状态:</div>
                                                        <div style={{ color: 'var(--text-dim)', fontSize: 11, display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0' }}>
                                                            <RotateCw size={11} className={s.spinIcon} />
                                                            <span>正在执行工具中...</span>
                                                        </div>
                                                    </div>
                                                ) : null}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}

export const getStepsForMessage = (msg: AiMessage): ProcessStep[] => {
    const reasoning = msg.reasoning_content || msg.plan?.reasoning_content || ''
    if (msg.process_steps && msg.process_steps.length > 0) {
        return msg.process_steps.map((st) => {
            if (st.type === 'think' && !st.content && reasoning) {
                return { ...st, content: reasoning }
            }
            return st
        })
    }
    const steps: ProcessStep[] = []
    if (reasoning) {
        steps.push({
            id: `think_${msg.timestamp || Date.now()}`,
            type: 'think',
            title: '深度思考过程',
            content: reasoning,
            status: 'completed',
            timestamp: msg.timestamp || Date.now(),
        })
    }
    if (msg.tool_calls && msg.tool_calls.length > 0) {
        msg.tool_calls.forEach((tc, i) => {
            steps.push({
                id: tc.id || `tool_${i}_${msg.timestamp || Date.now()}`,
                type: 'tool',
                title: tc.name,
                summary: tc.args,
                content: '',
                status: 'completed',
                timestamp: msg.timestamp || Date.now(),
            })
        })
    }
    return steps
}

export default ProcessStepsList
