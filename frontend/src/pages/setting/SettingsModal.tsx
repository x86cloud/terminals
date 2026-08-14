import React, { useEffect, useState, useCallback } from 'react'
import { ArrowLeft, Palette, Bot, Info } from 'lucide-react'
import { AppSettings } from '@/types'
import { applyThemeMode, applyGlobalFont } from '@/utils/theme'
import AppearanceTab from '@/pages/setting/AppearanceTab'
import AiAgentTab from '@/pages/setting/AiAgentTab'
import AboutTab from '@/pages/setting/AboutTab'
import s from '@/pages/setting/SettingsModal.module.less'

interface Props {
    open: boolean
    settings: AppSettings
    onClose: () => void
    onSave: (newSettings: AppSettings) => void
}

type SettingsTab = 'appearance' | 'aiAgent' | 'about'

export default function SettingsModal({ open, settings, onClose, onSave }: Props) {
    const [activeTab, setActiveTab] = useState<SettingsTab>('appearance')
    const [themeMode, setThemeMode] = useState<'light' | 'dark' | 'system'>('light')
    const [globalFontFamily, setGlobalFontFamily] = useState('system')

    const [aiBaseUrl, setAiBaseUrl] = useState('https://api.deepseek.com')
    const [aiApiKey, setAiApiKey] = useState('')
    const [aiModel, setAiModel] = useState('deepseek-v4-flash')
    const [aiTemperature, setAiTemperature] = useState(0.7)
    const [aiMaxContextTokens, setAiMaxContextTokens] = useState(4096)
    const [aiCompressionStrategy, setAiCompressionStrategy] = useState<'summary' | 'sliding'>('summary')
    const [aiEnableMultimodal, setAiEnableMultimodal] = useState(false)
    const [aiEnableWebSearch, setAiEnableWebSearch] = useState(false)
    const [aiEnablePermissionGuard, setAiEnablePermissionGuard] = useState(true)
    const [aiBlockHighRiskCommands, setAiBlockHighRiskCommands] = useState(true)
    const [aiEnableThinking, setAiEnableThinking] = useState(false)
    const [aiReasoningEffort, setAiReasoningEffort] = useState<'none' | 'low' | 'medium' | 'high'>('none')
    const [aiSystemPrompt, setAiSystemPrompt] = useState('你是一个有用的 AI 助手，能够回答用户的各种技术与日常问题，并给出精准优雅的解答。')
    const [aiWorkspaceDir, setAiWorkspaceDir] = useState('')

    useEffect(() => {
        if (open && settings) {
            setThemeMode(settings.themeMode || 'light')
            setGlobalFontFamily(settings.globalFontFamily || 'system')
            setAiBaseUrl(settings.aiBaseUrl || 'https://api.deepseek.com')
            setAiApiKey(settings.aiApiKey || '')
            setAiModel(settings.aiModel || 'deepseek-v4-flash')
            setAiTemperature(settings.aiTemperature ?? 0.7)
            setAiMaxContextTokens(settings.aiMaxContextTokens || 4096)
            setAiCompressionStrategy(settings.aiCompressionStrategy || 'summary')
            setAiEnableMultimodal(!!settings.aiEnableMultimodal)
            setAiEnableWebSearch(!!settings.aiEnableWebSearch)
            setAiEnablePermissionGuard(settings.aiEnablePermissionGuard ?? true)
            setAiBlockHighRiskCommands(settings.aiBlockHighRiskCommands ?? true)
            setAiEnableThinking(!!settings.aiEnableThinking)
            setAiReasoningEffort(settings.aiReasoningEffort || 'medium')
            setAiSystemPrompt(settings.aiSystemPrompt || '你是一个有用的 AI 助手，能够回答用户的各种技术与日常问题，并给出精准优雅的解答。')
            setAiWorkspaceDir(settings.aiWorkspaceDir || '')
        }
    }, [open, settings])

    // 按 Esc 键平滑返回主界面
    useEffect(() => {
        if (!open) return
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose()
            }
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [open, onClose])

    const persistSettings = useCallback((partial: Partial<AppSettings>) => {
        onSave({
            ...settings,
            themeMode,
            globalFontFamily,
            aiBaseUrl,
            aiApiKey,
            aiModel,
            aiTemperature,
            aiMaxContextTokens,
            aiCompressionStrategy,
            aiEnableMultimodal,
            aiEnableWebSearch,
            aiEnablePermissionGuard,
            aiBlockHighRiskCommands,
            aiEnableThinking,
            aiReasoningEffort,
            aiSystemPrompt,
            aiWorkspaceDir,
            ...partial,
        })
    }, [settings, themeMode, globalFontFamily, aiBaseUrl, aiApiKey, aiModel, aiTemperature, aiMaxContextTokens, aiCompressionStrategy, aiEnableMultimodal, aiEnableWebSearch, aiEnablePermissionGuard, aiBlockHighRiskCommands, aiEnableThinking, aiReasoningEffort, aiSystemPrompt, aiWorkspaceDir, onSave])

    if (!open) return null

    const handleThemeChange = (mode: 'light' | 'dark' | 'system') => {
        setThemeMode(mode)
        applyThemeMode(mode)
        persistSettings({ themeMode: mode })
    }

    const handleGlobalFontChange = (fontKey: string) => {
        setGlobalFontFamily(fontKey)
        applyGlobalFont(fontKey)
        persistSettings({ globalFontFamily: fontKey })
    }

    const handleAiAgentChange = (fields: Partial<AppSettings>) => {
        if (fields.aiBaseUrl !== undefined) setAiBaseUrl(fields.aiBaseUrl)
        if (fields.aiApiKey !== undefined) setAiApiKey(fields.aiApiKey)
        if (fields.aiModel !== undefined) setAiModel(fields.aiModel)
        if (fields.aiTemperature !== undefined) setAiTemperature(fields.aiTemperature)
        if (fields.aiMaxContextTokens !== undefined) setAiMaxContextTokens(fields.aiMaxContextTokens)
        if (fields.aiCompressionStrategy !== undefined) setAiCompressionStrategy(fields.aiCompressionStrategy)
        if (fields.aiEnableMultimodal !== undefined) setAiEnableMultimodal(fields.aiEnableMultimodal)
        if (fields.aiEnableWebSearch !== undefined) setAiEnableWebSearch(fields.aiEnableWebSearch)
        if (fields.aiEnablePermissionGuard !== undefined) setAiEnablePermissionGuard(fields.aiEnablePermissionGuard)
        if (fields.aiBlockHighRiskCommands !== undefined) setAiBlockHighRiskCommands(fields.aiBlockHighRiskCommands)
        if (fields.aiEnableThinking !== undefined) setAiEnableThinking(fields.aiEnableThinking)
        if (fields.aiReasoningEffort !== undefined) setAiReasoningEffort(fields.aiReasoningEffort)
        if (fields.aiSystemPrompt !== undefined) setAiSystemPrompt(fields.aiSystemPrompt)

        persistSettings(fields)
    }

    return (
        <div className={s.fullPane}>
            {/* 左侧 Sidebar 导航区 */}
            <div className={s.navSidebar}>
                <button className={s.backBtn} onClick={onClose} title="返回主界面 (Esc)">
                    <ArrowLeft size={16} />
                    <span>返回主界面</span>
                </button>

                <div className={s.sidebarHeader}>
                    <span className={s.sidebarTitle}>系统设置</span>
                </div>

                <div className={s.navList}>
                    <button
                        className={`${s.navItem}${activeTab === 'appearance' ? ' ' + s.active : ''}`}
                        onClick={() => setActiveTab('appearance')}
                    >
                        <Palette size={15} />
                        <span>外观主题</span>
                    </button>
                    <button
                        className={`${s.navItem}${activeTab === 'aiAgent' ? ' ' + s.active : ''}`}
                        onClick={() => setActiveTab('aiAgent')}
                    >
                        <Bot size={15} />
                        <span>AI 智能体</span>
                    </button>
                    <button
                        className={`${s.navItem}${activeTab === 'about' ? ' ' + s.active : ''}`}
                        onClick={() => setActiveTab('about')}
                    >
                        <Info size={15} />
                        <span>关于应用</span>
                    </button>
                </div>
            </div>

            {/* 右侧 Content 内容区 */}
            <div className={s.contentPanel}>
                {activeTab === 'appearance' && (
                    <AppearanceTab
                        themeMode={themeMode}
                        globalFontFamily={globalFontFamily}
                        onThemeChange={handleThemeChange}
                        onGlobalFontChange={handleGlobalFontChange}
                    />
                )}

                {activeTab === 'aiAgent' && (
                    <AiAgentTab
                        aiBaseUrl={aiBaseUrl}
                        aiApiKey={aiApiKey}
                        aiModel={aiModel}
                        aiTemperature={aiTemperature}
                        aiMaxContextTokens={aiMaxContextTokens}
                        aiCompressionStrategy={aiCompressionStrategy}
                        aiEnableMultimodal={aiEnableMultimodal}
                        aiEnableWebSearch={aiEnableWebSearch}
                        aiEnablePermissionGuard={aiEnablePermissionGuard}
                        aiBlockHighRiskCommands={aiBlockHighRiskCommands}
                        aiEnableThinking={aiEnableThinking}
                        aiReasoningEffort={aiReasoningEffort}
                        aiSystemPrompt={aiSystemPrompt}
                        onChange={handleAiAgentChange}
                    />
                )}

                {activeTab === 'about' && (
                    <AboutTab />
                )}
            </div>
        </div>
    )
}
