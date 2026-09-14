import React, { useState, useMemo } from 'react'
import { Drawer, Button, Tooltip, message, Tag } from 'antd'
import {
    FileText,
    Play,
    Check,
    Copy,
    Folder,
} from 'lucide-react'
import MarkdownViewer from '@/components/common/MarkdownViewer'
import { AgentPlan } from '@/types'
import s from './PlanDrawer.module.less'

export interface PlanDrawerProps {
    open: boolean
    onClose: () => void
    plan: AgentPlan
    isGenerating?: boolean
    onApprove: (planId: string) => void
}

export const PlanDrawer: React.FC<PlanDrawerProps> = ({
    open,
    onClose,
    plan,
    isGenerating = false,
    onApprove,
}) => {
    const [copied, setCopied] = useState(false)
    const isApproved = plan.status === 'approved'
    const isExpired = plan.status === 'expired'

    // 格式化展示的 Markdown 实施方案内容
    const markdownContent = useMemo(() => {
        if (plan.content && plan.content.trim()) {
            return plan.content
        }
        // 兼容旧版 steps 数据的兜底呈现
        if (plan.steps && plan.steps.length > 0) {
            let md = `### 目标: ${plan.objective}\n\n`
            plan.steps.forEach((st, idx) => {
                md += `${idx + 1}. **${st.description || st.action}** ${st.tool_name ? `(\`${st.tool_name}\`)` : ''}\n`
            })
            return md
        }
        return `# ${plan.objective}\n\n暂无详细规划内容。`
    }, [plan.content, plan.objective, plan.steps])

    const handleCopy = (e: React.MouseEvent) => {
        e.stopPropagation()
        if (!markdownContent) return
        navigator.clipboard.writeText(markdownContent).then(() => {
            setCopied(true)
            message.success('实施方案已复制到剪贴板')
            setTimeout(() => setCopied(false), 2000)
        }).catch(() => {
            message.error('复制失败')
        })
    }

    return (
        <Drawer
            open={open}
            onClose={onClose}
            width="min(780px, 88vw)"
            title={
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <FileText size={16} style={{ color: isExpired ? 'var(--text-dim, #8c8c8c)' : 'var(--accent, #1677ff)', flexShrink: 0 }} />
                    <span style={{ fontWeight: 600, fontSize: 14, color: isExpired ? 'var(--text-dim, #8c8c8c)' : 'var(--text)' }}>
                        {isExpired
                            ? (plan.is_update ? '实施方案 (已过期)' : '技术实施方案 (已过期)')
                            : (plan.is_update ? '实施方案 (已根据意见更新)' : '技术实施方案 (Implementation Plan)')}
                    </span>
                    {plan.objective && (
                        <span
                            style={{
                                fontSize: 12,
                                color: 'var(--text-dim)',
                                fontWeight: 'normal',
                                maxWidth: 320,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                            }}
                            title={plan.objective}
                        >
                            · {plan.objective}
                        </span>
                    )}
                </div>
            }
            extra={
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {plan.file_path && (
                        <Tooltip title={`落盘路径: ${plan.file_path} (点击复制)`}>
                            <span
                                className={s.filePathBadge}
                                onClick={(e) => {
                                    e.stopPropagation()
                                    navigator.clipboard.writeText(plan.file_path || '')
                                    message.info('文件路径已复制')
                                }}
                            >
                                <Folder size={12} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
                                implementation_plan.md
                            </span>
                        </Tooltip>
                    )}

                    <Tooltip title={copied ? '已复制' : '复制方案 Markdown'}>
                        <Button
                            size="small"
                            type="text"
                            icon={copied ? <Check size={13} color="#52c41a" /> : <Copy size={13} />}
                            onClick={handleCopy}
                        />
                    </Tooltip>
                </div>
            }
            footer={
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0' }}>
                    <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                        {isExpired
                            ? '该方案已被后续更新覆盖，仅供归档查看'
                            : isApproved
                            ? '方案已批准，正在对话中自主执行'
                            : '请审阅技术实施方案，确认无误后点击执行'}
                    </span>
                    <div>
                        {isExpired ? (
                            <Tag color="default">
                                已过期
                            </Tag>
                        ) : isApproved ? (
                            <Tag color="success" icon={<Check size={12} style={{ verticalAlign: 'middle', marginRight: 2 }} />}>
                                已批准执行
                            </Tag>
                        ) : (
                            <Button
                                type="primary"
                                size="small"
                                icon={<Play size={12} />}
                                disabled={isGenerating}
                                onClick={() => {
                                    if (isGenerating) return
                                    onApprove(plan.id)
                                    onClose()
                                }}
                            >
                                批准并执行 (Proceed)
                            </Button>
                        )}
                    </div>
                </div>
            }
            destroyOnClose={false}
        >
            <div className={s.drawerBody}>
                <MarkdownViewer content={markdownContent} />
            </div>
        </Drawer>
    )
}

export default PlanDrawer
