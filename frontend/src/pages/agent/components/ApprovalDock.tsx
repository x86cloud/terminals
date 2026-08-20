import React from 'react'
import { Shield, X, Clock, Check } from 'lucide-react'
import { AgentApprovalRequest } from '@/types'
import g from '@/styles/global.module.less'
import s from './ApprovalDock.module.less'

interface ApprovalDockProps {
    pendingApproval: AgentApprovalRequest | null
    onApprove: (approved: boolean, remember: boolean) => void
}

export const ApprovalDock: React.FC<ApprovalDockProps> = ({
    pendingApproval,
    onApprove,
}) => {
    if (!pendingApproval) return null

    return (
        <div className={s.approvalDock}>
            <div className={s.approvalHeader}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Shield size={16} />
                    <span>
                        安全审查确认: 需要用户授权执行工具 [{pendingApproval.tool_name}]
                    </span>
                </div>
                <span className={`${s.riskBadge} ${s.riskMedium}`}>
                    {pendingApproval.risk_level}
                </span>
            </div>
            <div className={s.approvalBody}>
                <div>{pendingApproval.description}</div>
                {pendingApproval.arguments && (
                    <div style={{ marginTop: 4, color: '#2b90ee' }}>
                        参数: {pendingApproval.arguments}
                    </div>
                )}
            </div>
            <div className={s.approvalActions}>
                <button
                    type="button"
                    className={`${g.btn} ${g.xs}`}
                    style={{ color: '#ff4d4f' }}
                    onClick={() => onApprove(false, false)}
                >
                    <X size={12} />
                    <span>拒绝</span>
                </button>
                <button
                    type="button"
                    className={`${g.btn} ${g.xs}`}
                    onClick={() => onApprove(true, true)}
                >
                    <Clock size={12} />
                    <span>记住本会话 30分钟</span>
                </button>
                <button
                    type="button"
                    className={`${g.btn} ${g.primary} ${g.xs}`}
                    onClick={() => onApprove(true, false)}
                >
                    <Check size={12} />
                    <span>允许单次执行</span>
                </button>
            </div>
        </div>
    )
}

export default ApprovalDock
