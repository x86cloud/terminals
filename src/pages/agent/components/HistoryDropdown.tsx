import { useState } from 'react'
import { Button, Input, Popconfirm, Popover, Tooltip } from 'antd'
import { Check, Edit2, History, Trash2, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { AgentSessionRecord } from '@/types'
import s from '../AgentPage.module.less'

interface Props {
    conversations: AgentSessionRecord[]
    activeId: string | null
    onRefresh: () => Promise<void>
    onSelect: (id: string) => Promise<void>
    onRename: (id: string, title: string) => Promise<void>
    onDelete: (id: string) => Promise<void>
}

export default function HistoryDropdown({
    conversations,
    activeId,
    onRefresh,
    onSelect,
    onRename,
    onDelete,
}: Props) {
    const { t } = useTranslation(['agent', 'common'])
    const [open, setOpen] = useState(false)
    const [editingId, setEditingId] = useState<string | null>(null)
    const [draftTitle, setDraftTitle] = useState('')

    const formatRelTime = (ts: number): string => {
        if (!ts) return ''
        const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000))
        if (diffSec < 60) return t('agent:history.justNow')
        if (diffSec < 3600) return t('agent:history.minutesAgo', { count: Math.floor(diffSec / 60) })
        if (diffSec < 86400) return t('agent:history.hoursAgo', { count: Math.floor(diffSec / 3600) })
        return t('agent:history.daysAgo', { count: Math.floor(diffSec / 86400) })
    }

    const handleOpenChange = (next: boolean) => {
        setOpen(next)
        if (next) {
            void onRefresh()
        } else {
            setEditingId(null)
        }
    }

    const commitRename = async (id: string) => {
        const clean = draftTitle.trim()
        if (!clean) {
            setEditingId(null)
            return
        }
        await onRename(id, clean)
        setEditingId(null)
    }

    const content = (
        <div className={s.historyPopover}>
            <div className={s.historyHead}>
                <span>{t('agent:history.header', { count: conversations.length })}</span>
            </div>
            <div className={s.historyList}>
                {conversations.length === 0 ? (
                    <div className={s.subEmptyHint}>{t('agent:history.empty')}</div>
                ) : (
                    conversations.map((c) => {
                        const isEditing = editingId === c.id
                        return (
                            <div
                                key={c.id}
                                className={`${s.historyItem}${c.id === activeId ? ' ' + s.active : ''}`}
                                onClick={() => {
                                    if (isEditing) return
                                    void onSelect(c.id).then(() => setOpen(false))
                                }}
                            >
                                <div className={s.historyMeta}>
                                    {isEditing ? (
                                        <Input
                                            size="small"
                                            value={draftTitle}
                                            autoFocus
                                            onClick={(e) => e.stopPropagation()}
                                            onChange={(e) => setDraftTitle(e.target.value)}
                                            onPressEnter={(e) => {
                                                e.stopPropagation()
                                                void commitRename(c.id)
                                            }}
                                        />
                                    ) : (
                                        <>
                                            <span className={s.historyTitle}>{c.title}</span>
                                            <span className={s.historySub}>
                                                {t('agent:history.countUnit', { count: c.messageCount })} · {formatRelTime(c.updatedAt)}
                                                {c.preview ? ` · ${c.preview}` : ''}
                                            </span>
                                        </>
                                    )}
                                </div>

                                <div
                                    className={s.historyBtns}
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    {isEditing ? (
                                        <>
                                            <Button
                                                size="small"
                                                type="text"
                                                icon={<Check size={12} />}
                                                onClick={() => void commitRename(c.id)}
                                            />
                                            <Button
                                                size="small"
                                                type="text"
                                                icon={<X size={12} />}
                                                onClick={() => setEditingId(null)}
                                            />
                                        </>
                                    ) : (
                                        <>
                                            <Button
                                                size="small"
                                                type="text"
                                                icon={<Edit2 size={12} />}
                                                onClick={() => {
                                                    setEditingId(c.id)
                                                    setDraftTitle(c.title)
                                                }}
                                            />
                                            <Popconfirm
                                                title={t('agent:history.deleteConfirm')}
                                                okText={t('agent:history.deleteOk')}
                                                cancelText={t('common:cancel')}
                                                onConfirm={() => void onDelete(c.id)}
                                            >
                                                <Button
                                                    size="small"
                                                    type="text"
                                                    danger
                                                    icon={<Trash2 size={12} />}
                                                />
                                            </Popconfirm>
                                        </>
                                    )}
                                </div>
                            </div>
                        )
                    })
                )}
            </div>
        </div>
    )

    return (
        <Popover
            trigger="click"
            placement="bottomRight"
            open={open}
            onOpenChange={handleOpenChange}
            content={content}
        >
            <Tooltip title={t('agent:history.tooltip')}>
                <Button size="small" type="text" icon={<History size={14} />}>
                    {t('agent:history.button')}
                </Button>
            </Tooltip>
        </Popover>
    )
}
