import React, { useState } from 'react'
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
import g from '@/styles/global.module.less'
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

    return (
        <div className={s.planCard}>
            <div className={s.planHeader}>
                <div className={s.planTitle}>
                    <Target size={15} color="#2b90ee" />
                    <span>目标规划: {plan.objective}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span
                        className={`${s.riskBadge} ${
                            plan.risk_level === 'high'
                                ? s.riskHigh
                                : plan.risk_level === 'medium'
                                ? s.riskMedium
                                : s.riskLow
                        }`}
                    >
                        {plan.risk_level?.toUpperCase() || 'LOW'} RISK
                    </span>
                    {isRunning && (
                        <span className={s.planRunningBadge}>
                            <RotateCw size={11} className={s.spin} />
                            执行中
                        </span>
                    )}
                    {isCompleted && !isRunning && (
                        <span className={s.planSuccessBadge}>
                            <Check size={11} />
                            已完成
                        </span>
                    )}
                    {hasFailed && !isRunning && (
                        <span className={s.planFailBadge}>
                            <X size={11} />
                            存在失败
                        </span>
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
                            className={`${s.planStepContainer} ${
                                stepRunning ? s.stepRowRunning : ''
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
                                    <span
                                        className={`${s.stepStatus} ${
                                            stepDone
                                                ? s.statusSuccess
                                                : stepFail
                                                ? s.statusFail
                                                : stepRunning
                                                ? s.statusRunning
                                                : ''
                                        }`}
                                    >
                                        {stepRunning && <RotateCw size={11} className={s.spin} />}
                                        {stepDone && <Check size={11} />}
                                        {stepFail && <X size={11} />}
                                        <span>
                                            {stepRunning
                                                ? '执行中'
                                                : stepDone
                                                ? '成功'
                                                : stepFail
                                                ? '失败'
                                                : st.status || '等待'}
                                        </span>
                                    </span>
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
                                            <button
                                                type="button"
                                                className={`${g.btn} ${g.xs}`}
                                                style={{
                                                    borderColor: 'rgba(255,77,79,0.4)',
                                                    color: '#ff4d4f',
                                                }}
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    onRetryStep(plan.id, st.id)
                                                }}
                                            >
                                                <RotateCw size={11} />
                                                <span>重试此步骤</span>
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )
                })}
            </div>

            {/* Action Buttons: Cancel or Approve */}
            <div className={s.planActions}>
                {isRunning ? (
                    onCancel && (
                        <button
                            type="button"
                            className={`${g.btn} ${g.xs}`}
                            style={{ borderColor: 'rgba(255,77,79,0.4)', color: '#ff4d4f' }}
                            onClick={() => onCancel(plan.id)}
                        >
                            <X size={12} />
                            <span>停止执行规划</span>
                        </button>
                    )
                ) : (
                    plan.need_confirm &&
                    !isCompleted && (
                        <button
                            type="button"
                            className={`${g.btn} ${g.primary} ${g.xs}`}
                            onClick={() => onApprove(plan.id)}
                        >
                            <Play size={12} />
                            <span>批准并执行此规划</span>
                        </button>
                    )
                )}
            </div>

            {plan.summary && (
                <div className={s.planSummaryReport}>
                    <div className={s.planSummaryHeader}>
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
