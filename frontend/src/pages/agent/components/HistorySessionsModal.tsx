import React, { useState, useMemo } from 'react'
import i18n from 'i18next'
import { useTranslation } from 'react-i18next'
import { Modal, Input, Button, Tag, Popconfirm, Empty, Tooltip } from 'antd'
import { History, Plus, Search, MessageSquare, Edit2, Trash2, Check, X } from 'lucide-react'
import { AgentSessionItem } from '@/types'
import s from './HistorySessionsModal.module.less'

interface Props {
    open: boolean
    sessions: AgentSessionItem[]
    activeSessionId: string
    onSelectSession: (id: string) => void
    onCreateSession: () => void
    onRenameSession: (id: string, newTitle: string) => void
    onDeleteSession: (id: string) => void
    onClose: () => void
}

function formatTime(timestamp?: number): string {
    if (!timestamp) return ''
    const d = new Date(timestamp)
    const now = new Date()
    const isToday = d.toDateString() === now.toDateString()
    const pad = (n: number) => (n < 10 ? `0${n}` : n)
    const timeStr = `${pad(d.getHours())}:${pad(d.getMinutes())}`
    if (isToday) {
        return i18n.t('agent:historyModal.today', { time: timeStr, defaultValue: `今天 ${timeStr}` })
    }
    const yearDiff = now.getFullYear() - d.getFullYear()
    if (yearDiff === 0) {
        return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${timeStr}`
    }
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${timeStr}`
}

export const HistorySessionsModal: React.FC<Props> = ({
    open,
    sessions,
    activeSessionId,
    onSelectSession,
    onCreateSession,
    onRenameSession,
    onDeleteSession,
    onClose,
}) => {
    const { t } = useTranslation(['agent', 'common'])
    const [searchText, setSearchText] = useState<string>('')
    const [editingId, setEditingId] = useState<string | null>(null)
    const [editingTitle, setEditingTitle] = useState<string>('')

    const filteredSessions = useMemo(() => {
        const text = searchText.trim().toLowerCase()
        if (!text) return sessions
        return sessions.filter((s) => s.title?.toLowerCase().includes(text))
    }, [sessions, searchText])

    const handleStartEdit = (e: React.MouseEvent, session: AgentSessionItem) => {
        e.stopPropagation()
        setEditingId(session.id)
        setEditingTitle(session.title || t('agent:newSessionDefault', { defaultValue: '新会话' }))
    }

    const handleSaveEdit = (e?: React.MouseEvent | React.KeyboardEvent, id?: string) => {
        if (e) e.stopPropagation()
        const targetId = id || editingId
        if (targetId && editingTitle.trim()) {
            onRenameSession(targetId, editingTitle.trim())
        }
        setEditingId(null)
    }

    const handleCancelEdit = (e?: React.MouseEvent) => {
        if (e) e.stopPropagation()
        setEditingId(null)
    }

    const handleCreate = () => {
        onCreateSession()
        onClose()
    }

    return (
        <Modal
            open={open}
            title={
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <History size={18} color="#2b90ee" />
                    <span>{t('agent:historyModal.title', { defaultValue: '历史会话' })}</span>
                    <Tag color="default" style={{ marginLeft: 4 }}>
                        {t('agent:historyModal.sessionsCount', { count: sessions.length, defaultValue: `${sessions.length} 个会话` })}
                    </Tag>
                </div>
            }
            onCancel={onClose}
            footer={null}
            width={640}
            centered
            destroyOnHidden
        >
            <div className={s.modalBody}>
                {/* Top Controls */}
                <div className={s.topBar}>
                    <Input
                        prefix={<Search size={14} color="#8c8c8c" />}
                        placeholder={t('agent:historyModal.searchPlaceholder', { defaultValue: '搜索会话名称...' })}
                        value={searchText}
                        onChange={(e) => setSearchText(e.target.value)}
                        allowClear
                        size="middle"
                        className={s.searchInput}
                    />
                    <Button
                        type="primary"
                        icon={<Plus size={14} />}
                        onClick={handleCreate}
                        size="middle"
                    >
                        {t('agent:historyModal.newSession', { defaultValue: '新建会话' })}
                    </Button>
                </div>

                {/* Session List */}
                <div className={s.sessionList}>
                    {filteredSessions.length === 0 ? (
                        <Empty
                            image={Empty.PRESENTED_IMAGE_SIMPLE}
                            description={searchText ? t('agent:historyModal.noMatchingSessions', { defaultValue: '未搜索到匹配会话' }) : t('agent:historyModal.noHistorySessions', { defaultValue: '暂无历史会话' })}
                            style={{ margin: '32px 0' }}
                        />
                    ) : (
                        filteredSessions.map((item) => {
                            const isActive = item.id === activeSessionId
                            const isEditing = item.id === editingId
                            const timeStr = formatTime(
                                item.updated_at || item.updatedAt || item.created_at || item.createdAt
                            )

                            return (
                                <div
                                    key={item.id}
                                    className={`${s.sessionItem} ${isActive ? s.active : ''}`}
                                    onClick={() => {
                                        if (isEditing) return
                                        onSelectSession(item.id)
                                        onClose()
                                    }}
                                >
                                    <div className={s.itemLeft}>
                                        <div className={s.itemIcon}>
                                            <MessageSquare size={16} />
                                        </div>

                                        <div className={s.itemContent}>
                                            {isEditing ? (
                                                <div
                                                    className={s.editRow}
                                                    onClick={(e) => e.stopPropagation()}
                                                >
                                                    <Input
                                                        size="small"
                                                        value={editingTitle}
                                                        autoFocus
                                                        onChange={(e) => setEditingTitle(e.target.value)}
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter') handleSaveEdit(e, item.id)
                                                            if (e.key === 'Escape') handleCancelEdit()
                                                        }}
                                                    />
                                                    <Button
                                                        type="text"
                                                        size="small"
                                                        icon={<Check size={14} color="#52c41a" />}
                                                        onClick={(e) => handleSaveEdit(e, item.id)}
                                                    />
                                                    <Button
                                                        type="text"
                                                        size="small"
                                                        icon={<X size={14} color="#ff4d4f" />}
                                                        onClick={handleCancelEdit}
                                                    />
                                                </div>
                                            ) : (
                                                <>
                                                    <div className={s.itemTitleRow}>
                                                        <Tooltip title={item.title || t('agent:newSessionDefault', { defaultValue: '新会话' })} placement="topLeft" mouseEnterDelay={0.3}>
                                                            <span className={s.itemTitle}>{item.title || t('agent:newSessionDefault', { defaultValue: '新会话' })}</span>
                                                        </Tooltip>
                                                        {isActive && (
                                                            <Tag color="processing" style={{ margin: 0, padding: '0 4px', fontSize: 11, lineHeight: '18px', flexShrink: 0 }}>
                                                                {t('agent:historyModal.currentBadge', { defaultValue: '当前' })}
                                                            </Tag>
                                                        )}
                                                    </div>
                                                    {timeStr && <span className={s.itemTime}>{timeStr}</span>}
                                                </>
                                            )}
                                        </div>
                                    </div>

                                    {!isEditing && (
                                        <div
                                            className={s.itemActions}
                                            onClick={(e) => e.stopPropagation()}
                                        >
                                            <Tooltip title={t('agent:historyModal.renameTooltip', { defaultValue: '重命名会话' })}>
                                                <Button
                                                    type="text"
                                                    size="small"
                                                    icon={<Edit2 size={13} />}
                                                    onClick={(e) => handleStartEdit(e, item)}
                                                />
                                            </Tooltip>
                                            <Popconfirm
                                                title={t('agent:historyModal.deleteConfirmTitle', { defaultValue: '确认删除该会话？' })}
                                                description={t('agent:historyModal.deleteConfirmDesc', { defaultValue: '删除后该会话下的所有对话与实施方案均无法恢复。' })}
                                                okText={t('common:delete', { defaultValue: '删除' })}
                                                cancelText={t('common:cancel', { defaultValue: '取消' })}
                                                okButtonProps={{ danger: true }}
                                                onConfirm={() => onDeleteSession(item.id)}
                                            >
                                                <Tooltip title={t('agent:historyModal.deleteTooltip', { defaultValue: '删除会话' })}>
                                                    <Button
                                                        type="text"
                                                        danger
                                                        size="small"
                                                        icon={<Trash2 size={13} />}
                                                    />
                                                </Tooltip>
                                            </Popconfirm>
                                        </div>
                                    )}
                                </div>
                            )
                        })
                    )}
                </div>
            </div>
        </Modal>
    )
}

export default HistorySessionsModal
