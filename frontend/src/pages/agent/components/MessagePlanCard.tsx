import React, { useState } from 'react'
import { Button } from 'antd'
import { FileText, Play, Check } from 'lucide-react'
import { AgentPlan } from '@/types'
import { PlanDrawer } from './PlanDrawer'
import s from './MessagePlanCard.module.less'

export interface MessagePlanCardProps {
    plan: AgentPlan
    isGenerating?: boolean
    onApprove: (planId: string) => void
    onCancel?: (planId: string) => void
    onRetryStep?: (planId: string, stepId: string) => void
}

export const MessagePlanCard: React.FC<MessagePlanCardProps> = ({
    plan,
    isGenerating = false,
    onApprove,
}) => {
    const [drawerOpen, setDrawerOpen] = useState(false)
    const isApproved = plan.status === 'approved'
    const isExpired = plan.status === 'expired'

    return (
        <>
            {/* 简化实时方案条: Implementation Plan ... 执行 */}
            <div className={`${s.planBar} ${isExpired ? s.planBarExpired : ''}`}>
                <div
                    className={s.planBarLeft}
                    onClick={() => setDrawerOpen(true)}
                    title={isExpired ? '方案已过期，点击在抽屉中查看归档方案' : '点击在抽屉中查看完整实施方案'}
                >
                    <FileText size={15} className={`${s.planIcon} ${isExpired ? s.planIconExpired : ''}`} />
                    <span className={`${s.planTitleLink} ${isExpired ? s.planTitleExpired : ''}`}>
                        {isExpired
                            ? (plan.is_update ? '实施方案 (已过期)' : 'Implementation Plan (已过期)')
                            : (plan.is_update ? '实施方案 (已根据意见更新)' : 'Implementation Plan')}
                    </span>
                    {plan.objective && (
                        <span className={s.planObjective} title={plan.objective}>
                            · {plan.objective}
                        </span>
                    )}
                    <span className={s.viewHint}>查看详情 →</span>
                </div>

                <div className={s.planBarRight}>
                    {isExpired ? null : isApproved ? (
                        <span className={s.approvedTag}>
                            <Check size={12} color="#52c41a" />
                            <span>已执行</span>
                        </span>
                    ) : (
                        <Button
                            type="primary"
                            size="small"
                            icon={<Play size={12} />}
                            disabled={isGenerating}
                            onClick={(e) => {
                                e.stopPropagation()
                                if (isGenerating) return
                                onApprove(plan.id)
                            }}
                        >
                            执行
                        </Button>
                    )}
                </div>
            </div>

            {/* 点击方案名称打开抽屉显示全部 */}
            <PlanDrawer
                open={drawerOpen}
                onClose={() => setDrawerOpen(false)}
                plan={plan}
                isGenerating={isGenerating}
                onApprove={onApprove}
            />
        </>
    )
}

export default MessagePlanCard
