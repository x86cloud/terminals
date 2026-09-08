import React, { useState, useEffect } from 'react'
import { Modal, Button, Tag, Input, Space } from 'antd'
import { ShieldAlert, Check, X } from 'lucide-react'
import { AgentHitlConfirmRequest } from '@/types'

interface Props {
    pendingHitl: AgentHitlConfirmRequest | null
    onResolve: (confirmId: string, approved: boolean, reason?: string) => Promise<void> | void
}

export const HitlConfirmModal: React.FC<Props> = ({ pendingHitl, onResolve }) => {
    const [rejectReason, setRejectReason] = useState<string>('')
    const [submitting, setSubmitting] = useState<boolean>(false)

    useEffect(() => {
        if (pendingHitl) {
            setRejectReason('')
            setSubmitting(false)
        }
    }, [pendingHitl?.confirm_id])

    if (!pendingHitl) return null

    // Extract tool input details
    let commandText = ''
    let sqlText = ''
    let rawJsonText = pendingHitl.input

    try {
        const parsed = JSON.parse(pendingHitl.input)
        if (typeof parsed === 'object' && parsed !== null) {
            if (parsed.command) commandText = parsed.command
            else if (parsed.cmd) commandText = parsed.cmd
            else if (parsed.path) commandText = `path: ${parsed.path}`

            if (parsed.sql) sqlText = parsed.sql

            rawJsonText = JSON.stringify(parsed, null, 2)
        }
    } catch {
        commandText = pendingHitl.input
    }

    const displayText = commandText || sqlText || rawJsonText


    const handleApprove = async () => {
        setSubmitting(true)
        try {
            await onResolve(pendingHitl.confirm_id, true, '')
        } finally {
            setSubmitting(false)
        }
    }

    const handleReject = async () => {
        setSubmitting(true)
        try {
            await onResolve(pendingHitl.confirm_id, false, rejectReason.trim())
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <Modal
            open={!!pendingHitl}
            closable={false}
            centered
            width={580}
            title={
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', paddingRight: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <ShieldAlert size={18} color="#ef4444" />
                        <div>
                            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-color, #1f2937)' }}>
                                高风险操作确认
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--text-secondary, #6b7280)', fontWeight: 400 }}>
                                智能体请求执行以下指令，请核对并决定是否允许
                            </div>
                        </div>
                    </div>
                    <Tag  >
                        {pendingHitl.tool_name}
                    </Tag>
                </div>
            }
            footer={
                <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', width: '100%', paddingTop: 6 }}>
                    <Space size={12}>
                        <Button
                            danger
                            type="primary"
                            icon={<X size={14} />}
                            loading={submitting}
                            onClick={handleReject}
                        >
                            拒绝
                        </Button>
                        <Button
                            type="primary"
                            icon={<Check size={14} />}
                            loading={submitting}
                            onClick={handleApprove}
                        >
                            允许
                        </Button>
                    </Space>
                </div>
            }
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 10 }}>
                {/* Modern Dark Terminal Card */}
                <div
                    style={{
                        borderRadius: 8,
                        border: '1px solid #2d333b',
                        background: '#0d1117',
                        overflow: 'hidden',
                        boxShadow: '0 4px 14px rgba(0, 0, 0, 0.18)',
                    }}
                >

                    {/* Terminal Body */}
                    <div
                        style={{
                            padding: '12px 14px',
                            fontFamily: '"JetBrains Mono", Consolas, Monaco, "Courier New", monospace',
                            fontSize: 12.5,
                            lineHeight: 1.6,
                            maxHeight: 220,
                            overflowY: 'auto',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-all',
                        }}
                    >
                        <span style={{ color: '#7ee787', marginRight: 8, userSelect: 'none', fontWeight: 600 }}>$</span>
                        <span style={{ color: '#e6edf3' }}>{displayText}</span>
                    </div>
                </div>

                {/* Optional Rejection Reason Field */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary, #6b7280)', fontWeight: 500 }}>
                        拒绝原因 / 修正建议给大模型（可选）：
                    </div>
                    <Input
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        placeholder="如：请不要删除整个目录，仅清理 build 临时产物..."
                        style={{
                            fontSize: 12.5,
                            borderRadius: 6,
                            padding: '6px 10px',
                        }}
                    />
                </div>
            </div>
        </Modal>
    )
}

export default HitlConfirmModal
