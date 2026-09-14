import React, { useState, useMemo } from 'react'
import { Modal, Input, Button, Tag, Popconfirm, Empty, Tooltip, Space } from 'antd'
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
        return `今天 ${timeStr}`
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
        setEditingTitle(session.title || '新会话')
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
                    <span>历史会话</span>
                    <Tag color="default" style={{ marginLeft: 4 }}>
                        {sessions.length} 个会话
                    </Tag>
                </div>
            }
            onCancel={onClose}
            footer={null}
            width={520}
            centered
            destroyOnClose
        >
            <div className={s.modalBody}>
                {/* Top Controls */}
                <div className={s.topBar}>
                    <Input
                        prefix={<Search size={14} color="#8c8c8c" />}
                        placeholder="搜索会话名称..."
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
                        新建会话
                    </Button>
                </div>

                {/* Session List */}
                <div className={s.sessionList}>
                    {filteredSessions.length === 0 ? (
                        <Empty
                            image={Empty.PRESENTED_IMAGE_SIMPLE}
                            description={searchText ? '未搜索到匹配会话' : '暂无历史会话'}
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
                                                        <span className={s.itemTitle}>{item.title || '新会话'}</span>
                                                        {isActive && (
                                                            <Tag color="processing" style={{ margin: 0, padding: '0 4px', fontSize: 11, lineHeight: '18px' }}>
                                                                当前
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
                                            <Tooltip title="重命名会话">
                                                <Button
                                                    type="text"
                                                    size="small"
                                                    icon={<Edit2 size={13} />}
                                                    onClick={(e) => handleStartEdit(e, item)}
                                                />
                                            </Tooltip>
                                            <Popconfirm
                                                title="确认删除该会话？"
                                                description="删除后该会话下的所有对话与实施方案均无法恢复。"
                                                okText="删除"
                                                cancelText="取消"
                                                okButtonProps={{ danger: true }}
                                                onConfirm={() => onDeleteSession(item.id)}
                                            >
                                                <Tooltip title="删除会话">
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
