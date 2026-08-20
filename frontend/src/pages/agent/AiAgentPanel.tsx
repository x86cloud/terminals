import React, { useState } from 'react'
import { Bot, Activity, Trash2, AlertTriangle } from 'lucide-react'
import { API } from '@/api'
import { AppSettings, AgentSkillItem } from '@/types'
import { useAgentSessions } from './hooks/useAgentSessions'
import { useAgentInspector } from './hooks/useAgentInspector'
import { useAgentEvents } from './hooks/useAgentEvents'
import { useAgentComposer } from './hooks/useAgentComposer'
import { AgentInspectorDrawer } from './views/AgentInspectorDrawer'
import { ChatMessageList } from './components/ChatMessageList'
import { ApprovalDock } from './components/ApprovalDock'
import { AskUserDock } from './components/AskUserDock'
import { Composer } from './components/Composer'
import g from '@/styles/global.module.less'
import s from '@/pages/agent/AiAgentPanel.module.less'

interface Props {
    settings: AppSettings
}

export default function AiAgentPanel({ settings }: Props) {
    const [noticeText, setNoticeText] = useState<string>('')
    const [pendingApproval, setPendingApproval] = useState<any>(null)
    const [pendingAsk, setPendingAsk] = useState<any>(null)
    const [pendingPlan, setPendingPlan] = useState<any>(null)
    const [showClearConfirm, setShowClearConfirm] = useState<boolean>(false)

    // 1. Single Session Hook
    const {
        activeSessionId,
        messages,
        setMessages,
        visibleMessages,
        hasMore,
        remainingRounds,
        loadMoreHistory,
        clearMessages,
    } = useAgentSessions()

    // 2. Inspector Hook
    const {
        jobs,
        jobOutputs,
        setJobOutputs,
        subagents,
        auditLogs,
        skillsList,
        subagentInputs,
        setSubagentInputs,
        expandedSkills,
        expandedAudit,
        inspectorTab,
        setInspectorTab,
        showInspector,
        setShowInspector,
        loadInspectorData,
        handleKillJob,
        handleSendSubagentMessage,
        handleInterruptSubagent,
        toggleSkillExpand,
        toggleAuditExpand,
    } = useAgentInspector(activeSessionId, setNoticeText)

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
        activeMode,
        setActiveMode,
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
        setPendingApproval,
        setPendingAsk,
        setPendingPlan,
        setJobOutputs,
        loadInspectorData,
    })

    // Approval & Ask handlers
    const handleApprovePending = async (approved: boolean, remember: boolean) => {
        if (!pendingApproval) return
        const confirmId = pendingApproval.confirm_id
        await API.agentDecideApproval(confirmId, approved, remember)
        setPendingApproval(null)
        setMessages((curr) => {
            const copy = [...curr]
            const last = copy[copy.length - 1]
            if (last && last.role === 'assistant' && last.process_steps) {
                last.process_steps = last.process_steps.map((st) =>
                    st.id?.startsWith(`confirm_${confirmId}`)
                        ? {
                              ...st,
                              status: approved ? 'completed' : 'failed',
                              summary: approved ? '已授权执行' : '已拒绝执行',
                          }
                        : st
                )
            }
            return copy
        })
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
    const maxTokens = settings.aiMaxContextTokens || 4096
    const percent = Math.min(100, Math.round((usedTokens / maxTokens) * 1000) / 10)

    return (
        <div className={s.workbenchLayout}>
            {/* Center Main Workspace */}
            <div className={s.centerPane}>
                {/* Header Bar */}
                <div className={s.headerBar}>
                    <div className={s.titleSection}>
                        <Bot size={18} color="#2b90ee" />
                        <span>xAgent 2.0</span>
                        {settings.aiModel && <span className={s.modelTag}>{settings.aiModel}</span>}
                        {settings.aiEnableThinking && (
                            <span className={s.badgeThinking}>
                                💭{' '}
                                {settings.aiReasoningEffort &&
                                settings.aiReasoningEffort !== 'none'
                                    ? settings.aiReasoningEffort
                                    : 'Thinking'}
                            </span>
                        )}
                    </div>

                    <div className={s.actions}>
                        <button
                            data-inspector-toggle="true"
                            className={`${s.inspectorToggle} ${showInspector ? s.active : ''}`}
                            onClick={() => setShowInspector(!showInspector)}
                            title="切换右侧工作台巡检抽屉"
                        >
                            <Activity size={13} />
                            <span>
                                工作台 ({jobs.filter((j) => j.state === 'running').length || 0})
                            </span>
                        </button>
                        <button
                            className={`${g.btn} ${g.xs}`}
                            title="清空会话历史"
                            onClick={() => setShowClearConfirm(true)}
                        >
                            <Trash2 size={12} />
                            <span>清空</span>
                        </button>
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
                    <ApprovalDock
                        pendingApproval={pendingApproval}
                        onApprove={handleApprovePending}
                    />

                    <AskUserDock
                        pendingAsk={pendingAsk}
                        onAnswer={handleAnswerAsk}
                    />

                    <Composer
                        input={input}
                        setInput={setInput}
                        textareaRef={textareaRef}
                        activeMode={activeMode}
                        setActiveMode={setActiveMode}
                        workspaceDir={workspaceDir}
                        onSelectWorkspace={handleSelectWorkspace}
                        onClearWorkspace={handleClearWorkspace}
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

            {/* Right Inspector Drawer */}
            <AgentInspectorDrawer
                showInspector={showInspector}
                onClose={() => setShowInspector(false)}
                inspectorTab={inspectorTab}
                setInspectorTab={setInspectorTab}
                jobs={jobs}
                jobOutputs={jobOutputs}
                onKillJob={handleKillJob}
                subagents={subagents}
                subagentInputs={subagentInputs}
                setSubagentInputs={setSubagentInputs}
                onSendSubagentMessage={handleSendSubagentMessage}
                onInterruptSubagent={handleInterruptSubagent}
                auditLogs={auditLogs}
                expandedAudit={expandedAudit}
                toggleAuditExpand={toggleAuditExpand}
                skillsList={skillsList}
                expandedSkills={expandedSkills}
                toggleSkillExpand={toggleSkillExpand}
            />

            {/* Clear History Confirmation Modal */}
            {showClearConfirm && (
                <div className={s.modalOverlay}>
                    <div className={s.confirmModal}>
                        <div className={s.confirmHeader}>
                            <AlertTriangle size={18} color="#faad14" />
                            <span>确认清空会话历史</span>
                        </div>
                        <div className={s.confirmBody}>
                            确定要清空当前的全部对话记录吗？清空后不可恢复。
                        </div>
                        <div className={s.confirmFooter}>
                            <button
                                type="button"
                                className={`${g.btn} ${g.xs}`}
                                onClick={() => setShowClearConfirm(false)}
                            >
                                取消
                            </button>
                            <button
                                type="button"
                                className={`${g.btn} ${g.danger} ${g.xs}`}
                                onClick={async () => {
                                    await clearMessages()
                                    setShowClearConfirm(false)
                                }}
                            >
                                确定清空
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
