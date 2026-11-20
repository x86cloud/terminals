import { CheckCircle2, Circle, Loader2, XCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { PlanChecklistItem } from '../agentTypes'
import s from '../AgentPage.module.less'

interface Props {
    steps: PlanChecklistItem[]
}

export default function PlanChecklist({ steps }: Props) {
    const { t } = useTranslation('agent')
    if (!steps.length) return null
    const doneCount = steps.filter((st) => st.status === 'done').length

    return (
        <div className={s.planCard}>
            <div className={s.planHead}>
                <span>{t('plan.title')}</span>
                <span className={s.planProgress}>
                    {doneCount}/{steps.length}
                </span>
            </div>
            <div className={s.planList}>
                {steps.map((st) => (
                    <div key={st.id} className={`${s.planItem} ${s[st.status] || ''}`}>
                        {st.status === 'done' ? (
                            <CheckCircle2 size={14} style={{ color: 'var(--ok, #2f9e44)', flexShrink: 0 }} />
                        ) : st.status === 'in_progress' ? (
                            <Loader2 size={14} className={s.spin} style={{ color: 'var(--accent, #3370ff)', flexShrink: 0 }} />
                        ) : st.status === 'failed' ? (
                            <XCircle size={14} style={{ color: 'var(--danger, #d6453f)', flexShrink: 0 }} />
                        ) : (
                            <Circle size={14} style={{ color: 'var(--text-faint, #98a2b3)', flexShrink: 0 }} />
                        )}
                        <span>{st.title}</span>
                    </div>
                ))}
            </div>
        </div>
    )
}
