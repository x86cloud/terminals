import React, { useState, useEffect } from 'react'
import { Button, Modal, Tag, Space, Tooltip, Input } from 'antd'
import { Bot, Trash2, AlertTriangle, PanelRightClose, Plus, History } from 'lucide-react'
import { API } from '@/api'
import { AppSettings, AgentHitlConfirmRequest } from '@/types'
import { useAgentSessions } from './hooks/useAgentSessions'
import { useAgentEvents } from './hooks/useAgentEvents'
import { useAgentComposer } from './hooks/useAgentComposer'
import { ChatMessageList } from './components/ChatMessageList'
import { ApprovalDock } from './components/ApprovalDock'
import { AskUserDock } from './components/AskUserDock'
import { HitlConfirmModal } from './components/HitlConfirmModal'
import { HistorySessionsModal } from './components/HistorySessionsModal'
import { Composer } from './components/Composer'
import s from '@/pages/agent/AiAgentPanel.module.less'

interface Props {
    settings: AppSettings
    onUpdateSettings?: (newSettings: AppSettings) => Promise<void>
    onClose?: () => void
}

export default function AiAgentPanel({ settings, onUpdateSettings, onClose }: Props) {
    const [noticeText, setNoticeText] = useState<string>('')
    const [pendingApprovals, setPendingApprovals] = useState<any[]>([])
    const [pendingAsk, setPendingAsk] = useState<any>(null)
    const [pendingHitl, setPendingHitl] = useState<AgentHitlConfirmRequest | null>(null)
    const [pendingPlan, setPendingPlan] = useState<any>(null)
    const [showClearConfirm, setShowClearConfirm] = useState<boolean>(false)
    const [showHistoryModal, setShowHistoryModal] = useState<boolean>(false)
    const [isEditingTitle, setIsEditingTitle] = useState<boolean>(false)
    const [editingTitleValue, setEditingTitleValue] = useState<string>('')

    // 1. Session Hook
    const {
        sessions,
        activeSessionId,
        currentSession,
        messages,
        setMessages,
        visibleMessages,
        hasMore,
        remainingRounds,
        loadMoreHistory,
        clearMessages,
        createSession,
        switchSession,
        renameSession,
        deleteSession,
    } = useAgentSessions()

    const handleStartEditTitle = () => {
        setEditingTitleValue(currentSession?.title || '新会话')
        setIsEditingTitle(true)
    }

    const handleSaveTitle = () => {
        if (editingTitleValue.trim() && editingTitleValue.trim() !== currentSession?.title) {
            renameSession(activeSessionId, editingTitleValue.trim())
        }
        setIsEditingTitle(false)
    }



    // 3. Composer Hook
    const {
        input,
        setInput,
        images,
        setImages,
        isGenerating,
        setIsGenerating,
        activeReasoning,
        setActiveReasoning,
        activeCommand,
        setActiveCommand,
        workspaceDir,
        chatEndRef,
        textareaRef,
        handleSelectWorkspace,
        handleClearWorkspace,
        handleApprovePlan,
        handleCancelPlan,
        handleRetryPlanStep,
        handleSend,
        handleStop,
        handleKeyDown,
    } = useAgentComposer({
        activeSessionId,
        messages,
        setMessages,
        setNoticeText,
    })

    // 4. Events Subscription Hook
    useAgentEvents({
        activeSessionId,
        setMessages,
        setIsGenerating,
        setActiveReasoning,
        setNoticeText,
        setPendingAsk,
        setPendingHitl,
        setPendingPlan,
    })

    // Check pending approvals on mount
    useEffect(() => {
        API.agentGetPendingApprovals()
            .then((list) => {
                if (list && list.length > 0) {
                    setPendingHitl(list[0] as AgentHitlConfirmRequest)
                }
            })
            .catch(() => { })
    }, [])

    const handleResolveHitl = async (confirmId: string, approved: boolean, reason?: string) => {
        // 1. Immediately clear only the current confirmId to prevent clobbering new incoming approvals
        setPendingHitl((curr) => (curr?.confirm_id === confirmId ? null : curr))

        // 2. Resolve on backend
        try {
            await API.agentDecideApproval(confirmId, approved, false, reason || '')
        } catch (err) {
            console.error('Failed to decide approval', err)
        }

        // 3. Update message process steps in UI
        setMessages((curr) => {
            const copy = [...curr]
            const last = copy[copy.length - 1]
            if (last && last.role === 'assistant' && last.process_steps) {
                last.process_steps = last.process_steps.map((st) => {
                    if (
                        st.id === confirmId ||
                        (st.type === 'tool' && st.status === 'running')
                    ) {
                        return {
                            ...st,
                            status: approved ? 'running' : 'completed',
                            summary: approved
                                ? '已审批允许，正在执行...'
                                : `用户已拒绝执行${reason ? ` (理由: ${reason})` : ''}`,
                        }
                    }
                    return st
                })
            }
            return copy
        })

        // 4. Double check if there are subsequent pending approvals in backend queue
        try {
            const list = await API.agentGetPendingApprovals()
            if (list && list.length > 0) {
                const next = list.find((item: any) => item.confirm_id !== confirmId)
                if (next) {
                    setPendingHitl(next as AgentHitlConfirmRequest)
                }
            }
        } catch {
            /* ignore */
        }
    }

    const handleAnswerAsk = async (answer: string) => {
        if (!pendingAsk) return
        const askId = pendingAsk.ask_id
        await API.agentAnswerAsk(askId, answer)
        setPendingAsk(null)
        setMessages((curr) => {
            const copy = [...curr]
            const last = copy[copy.length - 1]
            if (last && last.role === 'assistant' && last.process_steps) {
                let found = false
                last.process_steps = last.process_steps.map((st) => {
                    if (
                        st.id === askId ||
                        (st.title?.includes('ask_user') && st.status === 'running') ||
                        (st.title === '交互询问' && st.status === 'running')
                    ) {
                        found = true
                        return {
                            ...st,
                            status: 'completed',
                            summary: answer ? `已回复: ${answer}` : '用户已取消/忽略',
                        }
                    }
                    return st
                })
                if (!found) {
                    last.process_steps.push({
                        id: `ask_${Date.now()}`,
                        type: 'tool',
                        title: '交互询问',
                        summary: answer ? `已回复: ${answer}` : '用户已取消/忽略',
                        content: '',
                        status: 'completed',
                        timestamp: Date.now(),
                    })
                }
            }
            return copy
        })
    }

    // Token computation
    const totalChars = messages.reduce((acc, m) => acc + (m.content?.length || 0), 0)
    const usedTokens = Math.ceil(totalChars / 3.0)
    const maxTokens = settings.aiModelContextTokens || 65536
    const percent = Math.min(100, Math.round((usedTokens / maxTokens) * 1000) / 10)

    const handleSelectModel = async (modelId: string) => {
        const models = settings.aiModels || []
        const target = models.find((m) => m.id === modelId)
        if (!target) return

        const newSettings: AppSettings = {
            ...settings,
            activeModelId: modelId,
            aiModel: target.model,
            aiBaseUrl: target.baseUrl,
            aiApiKey: target.apiKey,
            aiModelContextTokens: target.contextTokens,
            aiTemperature: target.temperature ?? settings.aiTemperature,
        }

        if (onUpdateSettings) {
            await onUpdateSettings(newSettings)
        } else {
            try {
                await API.saveAppSettings(newSettings)
            } catch (err) {
                console.error('Failed to save settings on model switch', err)
            }
        }
    }

    return (
        <div className={s.workbenchLayout}>
            {/* Center Main Workspace */}
            <div className={s.centerPane}>
                {/* Header Bar */}
                <div className={s.headerBar}>
                    <div className={s.titleSection}>
                        <Bot size={18} color="#2b90ee" />
                        <div className={s.sessionTitleWrapper}>
                            {isEditingTitle ? (
                                <Input
                                    size="small"
                                    value={editingTitleValue}
                                    autoFocus
                                    onChange={(e) => setEditingTitleValue(e.target.value)}
                                    onBlur={handleSaveTitle}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') handleSaveTitle()
                                        if (e.key === 'Escape') setIsEditingTitle(false)
                                    }}
                                    className={s.titleInput}
                                />
                            ) : (
                                <Tooltip title="点击重命名会话">
                                    <span
                                        className={s.sessionTitleText}
                                        onClick={handleStartEditTitle}
                                    >
                                        {currentSession?.title || '新会话'}
                                    </span>
                                </Tooltip>
                            )}
                        </div>
                    </div>

                    <div className={s.actions}>
                        <Tooltip title="新增会话">
                            <Button
                                size="small"
                                type="text"
                                icon={<Plus size={14} />}
                                onClick={() => createSession()}
                            />
                        </Tooltip>
                        <Tooltip title="历史会话">
                            <Button
                                size="small"
                                type="text"
                                icon={<History size={14} />}
                                onClick={() => setShowHistoryModal(true)}
                            />
                        </Tooltip>
                        <Tooltip title="清空会话历史">
                            <Button
                                size="small"
                                type='primary'
                                danger
                                icon={<Trash2 size={12} />}
                                onClick={() => setShowClearConfirm(true)}
                            />
                        </Tooltip>
                        {onClose && (
                            <Tooltip title="收起智能体">
                                <Button
                                    size="small"
                                    type="text"
                                    icon={<PanelRightClose size={14} />}
                                    onClick={onClose}
                                />
                            </Tooltip>
                        )}
                    </div>
                </div>

                {noticeText && (
                    <div className={s.noticeBanner}>
                        <span>{noticeText}</span>
                    </div>
                )}

                {/* Chat Stream & Message List */}
                <ChatMessageList
                    messages={visibleMessages}
                    isGenerating={isGenerating}
                    chatEndRef={chatEndRef}
                    onSelectSuggestion={setInput}
                    onApprovePlan={handleApprovePlan}
                    onCancelPlan={handleCancelPlan}
                    onRetryPlanStep={handleRetryPlanStep}
                    hasMore={hasMore}
                    remainingRounds={remainingRounds}
                    onLoadMore={loadMoreHistory}
                />

                {/* Bottom Composer Area */}
                <div className={s.composerWrapper}>
                    <AskUserDock
                        pendingAsk={pendingAsk}
                        onAnswer={handleAnswerAsk}
                    />

                    <Composer
                        input={input}
                        setInput={setInput}
                        textareaRef={textareaRef}
                        activeCommand={activeCommand}
                        setActiveCommand={setActiveCommand}
                        workspaceDir={workspaceDir}
                        onSelectWorkspace={handleSelectWorkspace}
                        onClearWorkspace={handleClearWorkspace}
                        aiModel={settings.aiModel}
                        aiModels={settings.aiModels}
                        activeModelId={settings.activeModelId}
                        onSelectModel={handleSelectModel}
                        usedTokens={usedTokens}
                        maxTokens={maxTokens}
                        percent={percent}
                        noticeText={noticeText}
                        isGenerating={isGenerating}
                        images={images}
                        onStop={handleStop}
                        onSend={handleSend}
                        onKeyDown={handleKeyDown}
                    />
                </div>
            </div>



            {/* Clear History Confirmation Modal */}
            <Modal
                open={showClearConfirm}
                title={
                    <Space size={6}>
                        <AlertTriangle size={18} color="#faad14" />
                        <span>确认清空会话历史</span>
                    </Space>
                }
                onCancel={() => setShowClearConfirm(false)}
                onOk={async () => {
                    await clearMessages()
                    setShowClearConfirm(false)
                }}
                okText="确定清空"
                okButtonProps={{ danger: true }}
                cancelText="取消"
            >
                <p style={{ margin: '8px 0', fontSize: 14 }}>确定要清空当前的全部对话记录吗？清空后不可恢复。</p>
            </Modal>

            {/* HITL High Risk Action Confirmation Modal */}
            <HitlConfirmModal
                pendingHitl={pendingHitl}
                onResolve={handleResolveHitl}
            />

            {/* History Sessions Modal */}
            <HistorySessionsModal
                open={showHistoryModal}
                sessions={sessions}
                activeSessionId={activeSessionId}
                onSelectSession={switchSession}
                onCreateSession={() => createSession()}
                onRenameSession={renameSession}
                onDeleteSession={deleteSession}
                onClose={() => setShowHistoryModal(false)}
            />
        </div>
    )
}
