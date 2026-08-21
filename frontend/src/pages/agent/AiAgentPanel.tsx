import React, { useState } from 'react'
import { Button, Modal, Tag, Space, Tooltip } from 'antd'
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
                <div className={s.headerBar} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px' }}>
                    <div className={s.titleSection} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Bot size={18} color="#2b90ee" />
                        <span style={{ fontWeight: 600, fontSize: 14 }}>xAgent 2.0</span>
                        {settings.aiModel && <Tag color="blue">{settings.aiModel}</Tag>}
                        {settings.aiEnableThinking && (
                            <Tag color="purple">
                                💭{' '}
                                {settings.aiReasoningEffort &&
                                    settings.aiReasoningEffort !== 'none'
                                    ? settings.aiReasoningEffort
                                    : 'Thinking'}
                            </Tag>
                        )}
                    </div>

                    <div className={s.actions} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Button
                            size="small"
                            type={showInspector ? 'primary' : 'default'}
                            icon={<Activity size={13} />}
                            onClick={() => setShowInspector(!showInspector)}
                        >
                            工作台 ({jobs.filter((j) => j.state === 'running').length || 0})
                        </Button>
                        <Tooltip title="清空会话历史">
                            <Button
                                size="small"
                                danger
                                icon={<Trash2 size={12} />}
                                onClick={() => setShowClearConfirm(true)}
                            >
                                清空
                            </Button>
                        </Tooltip>
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
        </div>
    )
}
