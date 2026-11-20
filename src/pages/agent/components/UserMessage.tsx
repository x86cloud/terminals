import React from 'react'
import s from '../AgentPage.module.less'

interface Props {
    content: string
}

const MENTION_RE = /(@ssh:[^\s]+)/g

export default function UserMessage({ content }: Props) {
    const parts = content.split(MENTION_RE)
    return (
        <div className={s.userRow}>
            <div className={s.userBubble}>
                {parts.map((part, idx) =>
                    part.startsWith('@ssh:') ? (
                        <span key={idx} className={s.mentionTag}>
                            {part}
                        </span>
                    ) : (
                        <React.Fragment key={idx}>{part}</React.Fragment>
                    )
                )}
            </div>
        </div>
    )
}
