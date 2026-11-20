import { useState } from 'react'
import { Button, Input } from 'antd'
import { HelpCircle, Send } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { AskQuestionItem } from '../agentTypes'
import s from '../AgentPage.module.less'

interface Props {
    askId: string
    questions: AskQuestionItem[]
    answers?: Record<string, any>
    cancelled?: boolean
    status: 'waiting' | 'completed' | 'failed'
    onRespond: (askId: string, answers: Record<string, any>) => Promise<void>
}

export default function AskUserCard({
    askId,
    questions,
    answers,
    cancelled,
    status,
    onRespond,
}: Props) {
    const { t } = useTranslation('agent')
    const [selectedMap, setSelectedMap] = useState<Record<string, string[]>>({})
    const [customMap, setCustomMap] = useState<Record<string, string>>({})
    const [submitting, setSubmitting] = useState(false)

    const isWaiting = status === 'waiting'

    const toggleOption = (qKey: string, opt: string, multi?: boolean) => {
        if (!isWaiting) return
        setSelectedMap((prev) => {
            const curr = prev[qKey] || []
            if (multi) {
                return {
                    ...prev,
                    [qKey]: curr.includes(opt) ? curr.filter((x) => x !== opt) : [...curr, opt],
                }
            }
            return { ...prev, [qKey]: [opt] }
        })
    }

    const handleSubmit = async () => {
        if (!isWaiting || submitting) return
        setSubmitting(true)
        try {
            const payload: Record<string, any> = {}
            questions.forEach((q, idx) => {
                const key = q.id || `q_${idx}`
                const chosen = selectedMap[key] || []
                const custom = (customMap[key] || '').trim()
                if (q.multiSelect) {
                    payload[key] = custom ? [...chosen, custom] : chosen
                } else {
                    payload[key] = custom || chosen[0] || ''
                }
            })
            await onRespond(askId, payload)
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <div className={s.askCard}>
            <div className={s.approvalTitle}>
                <HelpCircle size={14} />
                <span>
                    {isWaiting
                        ? t('askUser.waitingTitle')
                        : cancelled
                          ? t('askUser.cancelledTitle')
                          : t('askUser.answeredTitle')}
                </span>
            </div>

            {questions.map((q, idx) => {
                const key = q.id || `q_${idx}`
                const chosen = selectedMap[key] || []
                const answeredVal = answers?.[key]
                return (
                    <div key={key} className={s.askQuestionBlock}>
                        <div className={s.askQuestionTitle}>
                            {idx + 1}. {q.question}
                        </div>
                        {q.options && q.options.length > 0 && (
                            <div className={s.askOptions}>
                                {q.options.map((opt) => {
                                    const active = isWaiting
                                        ? chosen.includes(opt)
                                        : Array.isArray(answeredVal)
                                          ? answeredVal.includes(opt)
                                          : answeredVal === opt
                                    return (
                                        <button
                                            key={opt}
                                            type="button"
                                            disabled={!isWaiting}
                                            className={`${s.askOptionBtn}${active ? ' ' + s.selected : ''}`}
                                            onClick={() => toggleOption(key, opt, q.multiSelect)}
                                        >
                                            {opt}
                                        </button>
                                    )
                                })}
                            </div>
                        )}
                        {isWaiting ? (
                            <Input
                                size="small"
                                placeholder={t('askUser.customPlaceholder')}
                                value={customMap[key] || ''}
                                onChange={(e) =>
                                    setCustomMap((prev) => ({ ...prev, [key]: e.target.value }))
                                }
                            />
                        ) : (
                            answeredVal !== undefined && (
                                <div className={s.approvalReason}>
                                    {t('askUser.answerLabel')}
                                    {Array.isArray(answeredVal)
                                        ? answeredVal.join(', ')
                                        : String(answeredVal)}
                                </div>
                            )
                        )}
                    </div>
                )
            })}

            {isWaiting && (
                <div>
                    <Button
                        size="small"
                        type="primary"
                        icon={<Send size={12} />}
                        loading={submitting}
                        onClick={() => void handleSubmit()}
                    >
                        {t('askUser.submit')}
                    </Button>
                </div>
            )}
        </div>
    )
}
