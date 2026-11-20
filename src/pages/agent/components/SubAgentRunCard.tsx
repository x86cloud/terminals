import { useEffect, useState } from 'react'
import { ChevronRight, CornerDownRight, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { ApprovalDecision, TimelineItem } from '../agentTypes'
import TimelineItemView from './TimelineItemView'
import s from '../AgentPage.module.less'

interface Props {
    item: Extract<TimelineItem, { kind: 'subagent_run' }>
    onRespondApproval: (approvalId: string, decision: ApprovalDecision) => Promise<void>
    onRespondAskUser: (askId: string, answers: Record<string, any>) => Promise<void>
}

export default function SubAgentRunCard({
    item,
    onRespondApproval,
    onRespondAskUser,
}: Props) {
    const { t } = useTranslation('agent')
    const [open, setOpen] = useState(false)
    const [elapsedSec, setElapsedSec] = useState(() =>
        item.durationMs > 0 ? Math.round(item.durationMs / 1000) : 0
    )

    useEffect(() => {
        if (item.status === 'awaiting_approval') {
            setOpen(true)
        }
    }, [item.status])

    useEffect(() => {
        if (item.status !== 'running' && item.status !== 'awaiting_approval') {
            if (item.durationMs > 0) {
                setElapsedSec(Math.round(item.durationMs / 1000))
            }
            return
        }
        const started = item.startedAt || Date.now()
        const timer = window.setInterval(() => {
            setElapsedSec(Math.max(1, Math.round((Date.now() - started) / 1000)))
        }, 500)
        return () => window.clearInterval(timer)
    }, [item.status, item.durationMs, item.startedAt])

    const displayName = item.name || item.agentId
    const secLabel =
        item.durationMs > 0
            ? `${(item.durationMs / 1000).toFixed(1)}s`
            : elapsedSec > 0
              ? `${elapsedSec}s`
              : ''

    return (
        <div className={s.subRunCard}>
            <div className={s.subRunHead} onClick={() => setOpen((v) => !v)}>
                <div className={s.subRunLeft}>
                    <CornerDownRight size={13} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                    <span className={s.subRunAgent}>{displayName}</span>
                    {item.host && (
                        <span className={s.toolDuration}>({item.host})</span>
                    )}
                    <span className={s.subRunTask} title={item.task}>
                        · {item.task}
                    </span>
                </div>
                <div className={s.subRunRight}>
                    <span className={`${s.statusPill} ${s[item.status] || ''}`}>
                        {(item.status === 'running' || item.status === 'awaiting_approval') && (
                            <Loader2 size={11} className={s.spin} />
                        )}
                        <span>{t(`subRun.${item.status}`, { defaultValue: item.status })}</span>
                        {secLabel && <span>{secLabel}</span>}
                    </span>
                    <ChevronRight
                        size={13}
                        className={`${s.thoughtChevron}${open ? ' ' + s.open : ''}`}
                    />
                </div>
            </div>

            {open && item.children.length > 0 && (
                <div className={s.subRunChildren}>
                    {item.children.map((child) => (
                        <TimelineItemView
                            key={child.id}
                            item={child}
                            onRespondApproval={onRespondApproval}
                            onRespondAskUser={onRespondAskUser}
                        />
                    ))}
                </div>
            )}

            {!open && item.report?.summary && (
                <div className={s.subRunSummary}>{item.report.summary}</div>
            )}
            {!open && !item.report?.summary && item.error && (
                <div className={s.subRunSummary} style={{ color: 'var(--danger)' }}>
                    {item.error}
                </div>
            )}
        </div>
    )
}
