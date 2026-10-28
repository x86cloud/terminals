import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Input } from 'antd'
import { HelpCircle } from 'lucide-react'
import { AgentAskRequest } from '@/types'
import s from './AskUserDock.module.less'

interface AskUserDockProps {
    pendingAsk: AgentAskRequest | null
    onAnswer: (answer: string) => void
}

export const AskUserDock: React.FC<AskUserDockProps> = ({
    pendingAsk,
    onAnswer,
}) => {
    const { t } = useTranslation(['agent', 'common'])
    const [customAskAnswer, setCustomAskAnswer] = useState<string>('')

    if (!pendingAsk) return null

    const handleCustomSubmit = () => {
        if (!customAskAnswer.trim()) return
        onAnswer(customAskAnswer.trim())
        setCustomAskAnswer('')
    }

    return (
        <div className={s.askDock}>
            <div className={s.askHeader} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px' }}>
                <HelpCircle size={15} color="#2b90ee" />
                <span style={{ fontWeight: 600 }}>{t('agent:askUser.title', { defaultValue: '智能助理提问 / 澄清确认' })}</span>
            </div>
            <div className={s.askBody} style={{ padding: '8px 12px' }}>
                <div className={s.askQuestion} style={{ marginBottom: 8, fontSize: 13 }}>{pendingAsk.question}</div>
                {pendingAsk.options && pendingAsk.options.length > 0 && (
                    <div className={s.askOptionsGrid} style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                        {pendingAsk.options.map((opt, i) => (
                            <Button
                                key={i}
                                size="small"
                                onClick={() => onAnswer(opt)}
                            >
                                {opt}
                            </Button>
                        ))}
                    </div>
                )}
                <div className={s.askInputRow} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <Input
                        size="small"
                        style={{ flex: 1 }}
                        placeholder={t('agent:askUser.inputPlaceholder', { defaultValue: '输入自定义答复或澄清细节...' })}
                        value={customAskAnswer}
                        onChange={(e) => setCustomAskAnswer(e.target.value)}
                        onPressEnter={handleCustomSubmit}
                    />
                    <Button
                        size="small"
                        type="primary"
                        disabled={!customAskAnswer.trim()}
                        onClick={handleCustomSubmit}
                    >
                        {t('agent:askUser.submit', { defaultValue: '提交答复' })}
                    </Button>
                    <Button
                        size="small"
                        onClick={() => {
                            onAnswer('')
                            setCustomAskAnswer('')
                        }}
                    >
                        {t('agent:askUser.cancel', { defaultValue: '忽略/取消' })}
                    </Button>
                </div>
            </div>
        </div>
    )
}

export default AskUserDock
