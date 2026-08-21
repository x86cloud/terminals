import React from 'react'
import { Button, Tag, Space } from 'antd'
import { Shield, X, Clock, Check } from 'lucide-react'
import { AgentApprovalRequest } from '@/types'
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

    const riskColor = pendingApproval.risk_level === 'high' ? 'error' : pendingApproval.risk_level === 'medium' ? 'warning' : 'blue'

    return (
        <div className={s.approvalDock}>
            <div className={s.approvalHeader} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Shield size={16} />
                    <span style={{ fontWeight: 600 }}>
                        安全审查确认: 需要用户授权执行工具 [{pendingApproval.tool_name}]
                    </span>
                </div>
                <Tag color={riskColor}>
                    {pendingApproval.risk_level}
                </Tag>
            </div>
            <div className={s.approvalBody} style={{ padding: '8px 12px' }}>
                <div>{pendingApproval.description}</div>
                {pendingApproval.arguments && (
                    <div style={{ marginTop: 4, color: '#2b90ee', fontSize: 12 }}>
                        参数: {pendingApproval.arguments}
                    </div>
                )}
            </div>
            <div className={s.approvalActions} style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '8px 12px' }}>
                <Button
                    size="small"
                    danger
                    icon={<X size={12} />}
                    onClick={() => onApprove(false, false)}
                >
                    拒绝
                </Button>
                <Button
                    size="small"
                    icon={<Clock size={12} />}
                    onClick={() => onApprove(true, true)}
                >
                    记住本会话 30分钟
                </Button>
                <Button
                    size="small"
                    type="primary"
                    icon={<Check size={12} />}
                    onClick={() => onApprove(true, false)}
                >
                    允许单次执行
                </Button>
            </div>
        </div>
    )
}

export default ApprovalDock
