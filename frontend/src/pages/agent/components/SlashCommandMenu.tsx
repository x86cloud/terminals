import React, { useMemo } from 'react'
import { FileText, MessageSquare } from 'lucide-react'
import s from './SlashCommandMenu.module.less'

export type SlashCommandType = 'plan' | 'grill-me'

export interface SlashCommandDef {
    key: SlashCommandType
    command: string
    title: string
    description: string
    icon: React.ReactNode
}

export const SLASH_COMMANDS: SlashCommandDef[] = [
    {
        key: 'plan',
        command: '/plan',
        title: '实施方案规划',
        description: '调研现场并生成实施方案 (implementation_plan.md) 供确认',
        icon: <FileText size={14} color="#2b90ee" />,
    },
    {
        key: 'grill-me',
        command: '/grill-me',
        title: '深度需求访谈',
        description: '交互式提问排查关键分歧与设计决策，逐步理清需求',
        icon: <MessageSquare size={14} color="#a855f7" />,
    },
]

interface Props {
    visible: boolean
    filterText: string
    selectedIndex: number
    onSelect: (key: SlashCommandType) => void
    onClose: () => void
}

export const SlashCommandMenu: React.FC<Props> = ({
    visible,
    filterText,
    selectedIndex,
    onSelect,
}) => {
    const filteredList = useMemo(() => {
        const query = filterText.toLowerCase().replace(/^\//, '').trim()
        if (!query) return SLASH_COMMANDS
        return SLASH_COMMANDS.filter(
            (c) =>
                c.command.toLowerCase().includes(query) ||
                c.key.toLowerCase().includes(query) ||
                c.title.toLowerCase().includes(query)
        )
    }, [filterText])

    if (!visible || filteredList.length === 0) return null

    return (
        <div className={s.menuOverlay}>
            <div className={s.menuHeader}>
                <span>快捷指令</span>
                <span className={s.headerHint}>↑↓ 切换 · Enter 选中 · Esc 退出</span>
            </div>
            <div className={s.commandList}>
                {filteredList.map((cmd, idx) => {
                    const isSelected = idx === selectedIndex
                    return (
                        <div
                            key={cmd.key}
                            className={`${s.commandItem} ${isSelected ? s.selected : ''}`}
                            onClick={() => onSelect(cmd.key)}
                        >
                            <div className={s.cmdIcon}>{cmd.icon}</div>
                            <div className={s.cmdContent}>
                                <div className={s.cmdTitleRow}>
                                    <span className={s.cmdLabel}>{cmd.command}</span>
                                    <span className={s.cmdTitle}>{cmd.title}</span>
                                </div>
                                <span className={s.cmdDesc}>{cmd.description}</span>
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}

export default SlashCommandMenu
