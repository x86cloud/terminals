import React, { useState } from 'react'
import { Button, Tag, Space } from 'antd'
import {
    Target,
    RotateCw,
    Check,
    X,
    ChevronDown,
    ChevronRight,
    Play,
    CheckCircle,
} from 'lucide-react'
import MarkdownViewer from '@/components/common/MarkdownViewer'
import { AgentPlan } from '@/types'
import s from './MessagePlanCard.module.less'

export interface MessagePlanCardProps {
    plan: AgentPlan
    onApprove: (planId: string) => void
    onCancel?: (planId: string) => void
    onRetryStep?: (planId: string, stepId: string) => void
}

export const MessagePlanCard: React.FC<MessagePlanCardProps> = ({
    plan,
    onApprove,
    onCancel,
    onRetryStep,
}) => {
    const isCompleted =
        plan.steps &&
        plan.steps.length > 0 &&
        plan.steps.every((s) => s.status === 'completed' || s.status === 'skipped')
    const hasFailed = plan.steps && plan.steps.some((s) => s.status === 'failed')
    const isRunning =
        plan.executing || (plan.steps && plan.steps.some((s) => s.status === 'running'))

    const [expandedSteps, setExpandedSteps] = useState<Record<string, boolean>>({})

    const toggleStep = (stepId: string, e: React.MouseEvent) => {
        e.stopPropagation()
        setExpandedSteps((prev) => ({ ...prev, [stepId]: !prev[stepId] }))
    }

    const riskColor = plan.risk_level === 'high' ? 'error' : plan.risk_level === 'medium' ? 'warning' : 'blue'

    return (
        <div className={s.planCard}>
            <div className={s.planHeader} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px' }}>
                <div className={s.planTitle} style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
                    <Target size={15} color="#2b90ee" />
                    <span>目标规划: {plan.objective}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Tag color={riskColor}>
                        {plan.risk_level?.toUpperCase() || 'LOW'} RISK
                    </Tag>
                    {isRunning && (
                        <Tag color="processing" icon={<RotateCw size={11} className={s.spin} />}>
                            执行中
                        </Tag>
                    )}
                    {isCompleted && !isRunning && (
                        <Tag color="success" icon={<Check size={11} />}>
                            已完成
                        </Tag>
                    )}
                    {hasFailed && !isRunning && (
                        <Tag color="error" icon={<X size={11} />}>
                            存在失败
                        </Tag>
                    )}
                </div>
            </div>

            <div className={s.planStepsList}>
                {plan.steps?.map((st, i) => {
                    const stepRunning = st.status === 'running'
                    const stepDone = st.status === 'completed'
                    const stepFail = st.status === 'failed'
                    const isExpanded = expandedSteps[st.id] ?? false

                    return (
                        <div
                            key={st.id || i}
                            className={`${s.planStepContainer} ${stepRunning ? s.stepRowRunning : ''
                                }`}
                        >
                            <div
                                className={s.planStepRow}
                                onClick={(e) => toggleStep(st.id, e)}
                                title="点击展开/折叠步骤执行详情"
                            >
                                <div className={s.stepLeft}>
                                    {isExpanded ? (
                                        <ChevronDown size={13} style={{ color: 'var(--text-dim)' }} />
                                    ) : (
                                        <ChevronRight size={13} style={{ color: 'var(--text-dim)' }} />
                                    )}
                                    <span className={s.stepIndex}>#{i + 1}</span>
                                    {st.tool_name ? (
                                        <span className={s.stepTool}>[{st.tool_name}]</span>
                                    ) : (
                                        <span className={s.stepTool}>[{st.action}]</span>
                                    )}
                                    <span className={s.stepDesc}>{st.description}</span>
                                </div>
                                <div className={s.stepRight}>
                                    {st.duration_ms !== undefined && st.duration_ms > 0 && (
                                        <span className={s.stepDuration}>{st.duration_ms}ms</span>
                                    )}
                                    <Tag color={stepRunning ? 'processing' : stepDone ? 'success' : stepFail ? 'error' : 'default'}>
                                        {stepRunning
                                            ? '执行中'
                                            : stepDone
                                                ? '成功'
                                                : stepFail
                                                    ? '失败'
                                                    : st.status || '等待'}
                                    </Tag>
                                </div>
                            </div>

                            {/* Expandable Step Details */}
                            {isExpanded && (
                                <div className={s.stepDetailsBox}>
                                    {st.args && (
                                        <div className={s.stepDetailSection}>
                                            <div className={s.stepDetailLabel}>输入参数 (Arguments):</div>
                                            <pre className={s.stepDetailCode}>
                                                {typeof st.args === 'string'
                                                    ? st.args
                                                    : JSON.stringify(st.args, null, 2)}
                                            </pre>
                                        </div>
                                    )}
                                    {st.depends_on && st.depends_on.length > 0 && (
                                        <div className={s.stepDetailSection}>
                                            <div className={s.stepDetailLabel}>前置依赖 (Depends On):</div>
                                            <div style={{ fontSize: 12, color: '#2b90ee' }}>
                                                {st.depends_on.join(', ')}
                                            </div>
                                        </div>
                                    )}
                                    {st.output !== undefined &&
                                        st.output !== null &&
                                        st.output !== '' && (
                                            <div className={s.stepDetailSection}>
                                                <div className={s.stepDetailLabel}>执行产出 (Output):</div>
                                                <pre className={s.stepDetailCode}>
                                                    {typeof st.output === 'object'
                                                        ? JSON.stringify(st.output, null, 2)
                                                        : String(st.output)}
                                                </pre>
                                            </div>
                                        )}
                                    {st.error && (
                                        <div className={s.stepDetailSection}>
                                            <div
                                                className={s.stepDetailLabel}
                                                style={{ color: '#ff4d4f' }}
                                            >
                                                错误信息 (Error):
                                            </div>
                                            <pre className={s.stepDetailError}>{st.error}</pre>
                                        </div>
                                    )}
                                    {st.verdict && (
                                        <div className={s.stepDetailSection}>
                                            <div className={s.stepDetailLabel}>验证器判定 (Verdict):</div>
                                            <div
                                                style={{
                                                    fontSize: 11.5,
                                                    color: 'var(--text-dim)',
                                                }}
                                            >
                                                {st.verdict}
                                            </div>
                                        </div>
                                    )}
                                    {stepFail && onRetryStep && (
                                        <div
                                            style={{
                                                display: 'flex',
                                                justifyContent: 'flex-end',
                                                marginTop: 4,
                                            }}
                                        >
                                            <Button
                                                size="small"
                                                danger
                                                icon={<RotateCw size={11} />}
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    onRetryStep(plan.id, st.id)
                                                }}
                                            >
                                                重试此步骤
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )
                })}
            </div>

            {/* Action Buttons: Cancel or Approve */}
            <div className={s.planActions} style={{ padding: '8px 12px', display: 'flex', justifyContent: 'flex-end' }}>
                {isRunning ? (
                    onCancel && (
                        <Button
                            size="small"
                            danger
                            icon={<X size={12} />}
                            onClick={() => onCancel(plan.id)}
                        >
                            停止执行规划
                        </Button>
                    )
                ) : (
                    plan.need_confirm &&
                    !isCompleted && (
                        <Button
                            size="small"
                            type="primary"
                            icon={<Play size={12} />}
                            onClick={() => onApprove(plan.id)}
                        >
                            批准并执行此规划
                        </Button>
                    )
                )}
            </div>

            {plan.summary && (
                <div className={s.planSummaryReport}>
                    <div className={s.planSummaryHeader} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <CheckCircle size={14} color="#52c41a" />
                        <span>任务执行总结与诊断报告</span>
                    </div>
                    <MarkdownViewer content={plan.summary} />
                </div>
            )}
        </div>
    )
}

export default MessagePlanCard
