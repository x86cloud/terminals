import React, { useState } from 'react'
import { HelpCircle } from 'lucide-react'
import { AgentAskRequest } from '@/types'
import g from '@/styles/global.module.less'
import s from './AskUserDock.module.less'

interface AskUserDockProps {
    pendingAsk: AgentAskRequest | null
    onAnswer: (answer: string) => void
}

export const AskUserDock: React.FC<AskUserDockProps> = ({
    pendingAsk,
    onAnswer,
}) => {
    const [customAskAnswer, setCustomAskAnswer] = useState<string>('')

    if (!pendingAsk) return null

    const handleCustomSubmit = () => {
        if (!customAskAnswer.trim()) return
        onAnswer(customAskAnswer.trim())
        setCustomAskAnswer('')
    }

    return (
        <div className={s.askDock}>
            <div className={s.askHeader}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <HelpCircle size={15} color="#2b90ee" />
                    <span>智能助理提问 / 澄清确认</span>
                </div>
            </div>
            <div className={s.askBody}>
                <div className={s.askQuestion}>{pendingAsk.question}</div>
                {pendingAsk.options && pendingAsk.options.length > 0 && (
                    <div className={s.askOptionsGrid}>
                        {pendingAsk.options.map((opt, i) => (
                            <button
                                key={i}
                                type="button"
                                className={s.askOptionBtn}
                                onClick={() => onAnswer(opt)}
                            >
                                {opt}
                            </button>
                        ))}
                    </div>
                )}
                <div className={s.askInputRow}>
                    <input
                        type="text"
                        className={g.input}
                        placeholder="输入自定义答复或澄清细节..."
                        value={customAskAnswer}
                        onChange={(e) => setCustomAskAnswer(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                handleCustomSubmit()
                            }
                        }}
                    />
                    <button
                        type="button"
                        className={`${g.btn} ${g.primary} ${g.xs}`}
                        disabled={!customAskAnswer.trim()}
                        onClick={handleCustomSubmit}
                    >
                        <span>提交答复</span>
                    </button>
                    <button
                        type="button"
                        className={`${g.btn} ${g.xs}`}
                        onClick={() => {
                            onAnswer('')
                            setCustomAskAnswer('')
                        }}
                    >
                        <span>忽略/取消</span>
                    </button>
                </div>
            </div>
        </div>
    )
}

export default AskUserDock
