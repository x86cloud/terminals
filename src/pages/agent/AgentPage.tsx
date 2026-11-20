import { useCallback, useEffect, useState } from 'react'
import { Button, Tooltip, message } from 'antd'
import { PanelRightOpen, Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { AppSettings } from '@/types'
import { API } from '@/api'
import { useSession } from '@/contexts/SessionContext'
import Composer from './components/Composer'
import HistoryDropdown from './components/HistoryDropdown'
import MessageList from './components/MessageList'
import SubAgentPanel from './components/SubAgentPanel'
import { useAgentStream } from './useAgentStream'
import s from './AgentPage.module.less'

interface Props {
    settings: AppSettings
    onOpenSettings?: () => void
    onAwaitingApprovalChange?: (waiting: boolean) => void
}

export default function AgentPage({
    settings,
    onOpenSettings,
    onAwaitingApprovalChange,
}: Props) {
    const { t } = useTranslation('agent')
    const { consumePendingAgentPrompt } = useSession()
    const {
        conversationId,
        turns,
        streaming,
        mode,
        setMode,
        modelId,
        setModelId,
        workspaceDir,
        updateWorkspaceDir,
        subagents,
        conversations,
        refreshConversations,
        sendMessage,
        stopRun,
        respondApproval,
        respondAskUser,
        toggleSubagent,
        newConversation,
        loadConversation,
        renameConversation,
        deleteConversation,
        retryFromTurn,
    } = useAgentStream(settings, onAwaitingApprovalChange)

    const [draft, setDraft] = useState<string | null>(null)
    const [panelOpen, setPanelOpen] = useState(true)

    const tryConsumeDispatchedPrompt = useCallback(() => {
        const prompt = consumePendingAgentPrompt()
        if (!prompt) return
        if (streaming) {
            setDraft(prompt)
            message.info('当前对话仍在执行中，指令已填入输入框')
            return
        }
        void sendMessage(prompt)
    }, [consumePendingAgentPrompt, streaming, sendMessage])

    useEffect(() => {
        tryConsumeDispatchedPrompt()
    }, [tryConsumeDispatchedPrompt])

    useEffect(() => {
        const handler = () => tryConsumeDispatchedPrompt()
        window.addEventListener('agent:dispatch-prompt', handler)
        return () => window.removeEventListener('agent:dispatch-prompt', handler)
    }, [tryConsumeDispatchedPrompt])

    const handleSelectStarter = useCallback((prompt: string) => {
        setDraft(prompt)
    }, [])

    const handlePickWorkspace = useCallback(async () => {
        if (streaming) return
        const picked = await API.chooseLocalFolder()
        if (!picked) return
        await updateWorkspaceDir(picked)
    }, [streaming, updateWorkspaceDir])

    const handleClearWorkspace = useCallback(() => {
        if (streaming) return
        void updateWorkspaceDir('')
    }, [streaming, updateWorkspaceDir])

    return (
        <div className={s.page}>
            <div className={s.body}>
                <div className={s.chatColumn}>
                    <div className={s.floatingToolbar}>
                        <HistoryDropdown
                            conversations={conversations}
                            activeId={conversationId}
                            onRefresh={refreshConversations}
                            onSelect={loadConversation}
                            onRename={renameConversation}
                            onDelete={deleteConversation}
                        />
                        <Tooltip title={t('newChatTip', '新建对话')}>
                            <Button
                                size="small"
                                type="text"
                                icon={<Plus size={14} />}
                                onClick={newConversation}
                            >
                                {t('newChat', '新对话')}
                            </Button>
                        </Tooltip>
                        {!panelOpen && (
                            <Tooltip title={t('expandSubPanelTip', '展开子 Agent 栏')}>
                                <Button
                                    size="small"
                                    type="text"
                                    icon={<PanelRightOpen size={14} />}
                                    onClick={() => setPanelOpen(true)}
                                />
                            </Tooltip>
                        )}
                    </div>

                    {!settings.aiEnabled && (
                        <div style={{ padding: '8px 16px 0' }}>
                            <div className={s.turnError} style={{ maxWidth: 760, margin: '0 auto' }}>
                                <span>{t('aiDisabledBanner')}</span>
                                {onOpenSettings && (
                                    <Button size="small" type="link" onClick={onOpenSettings}>
                                        {t('goToSettings', '前往设置')}
                                    </Button>
                                )}
                            </div>
                        </div>
                    )}

                    <MessageList
                        turns={turns}
                        streaming={streaming}
                        onSelectStarter={handleSelectStarter}
                        onRespondApproval={respondApproval}
                        onRespondAskUser={respondAskUser}
                        onRetryTurn={retryFromTurn}
                    />

                    <Composer
                        streaming={streaming}
                        mode={mode}
                        onModeChange={setMode}
                        modelId={modelId}
                        onModelChange={setModelId}
                        models={settings.aiModels || []}
                        workspaceDir={workspaceDir}
                        onPickWorkspace={() => void handlePickWorkspace()}
                        onClearWorkspace={handleClearWorkspace}
                        subagents={subagents}
                        aiEnabled={!!settings.aiEnabled}
                        onSend={(txt, mentions) => void sendMessage(txt, mentions)}
                        onStop={() => void stopRun()}
                        externalDraft={draft}
                        onExternalDraftConsumed={() => setDraft(null)}
                    />
                </div>

                {panelOpen && (
                    <SubAgentPanel
                        subagents={subagents}
                        onToggle={toggleSubagent}
                        onCollapse={() => setPanelOpen(false)}
                    />
                )}
            </div>
        </div>
    )
}
