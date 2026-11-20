import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import s from '../AgentPage.module.less'

interface Props {
    text: string
    durationMs: number
    streaming?: boolean
}

export default function ThoughtBlock({ text, durationMs, streaming }: Props) {
    const { t } = useTranslation('agent')
    const [open, setOpen] = useState(false)
    if (!text.trim() && !streaming) return null

    const sec = Math.max(1, Math.round(durationMs / 1000))
    const label = streaming ? t('thinking.running') : t('thinking.done', { sec })

    return (
        <div className={s.thoughtWrap}>
            <button
                type="button"
                className={s.thoughtToggle}
                onClick={() => setOpen((v) => !v)}
            >
                <span>{label}</span>
                <ChevronRight
                    size={13}
                    className={`${s.thoughtChevron}${open ? ' ' + s.open : ''}`}
                />
            </button>
            {open && <div className={s.thoughtBody}>{text}</div>}
        </div>
    )
}
