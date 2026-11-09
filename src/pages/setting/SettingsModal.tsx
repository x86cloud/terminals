import { useEffect, useState, useCallback, useRef } from 'react'
import { Button } from 'antd'
import { ArrowLeft, Palette, Bot, Info } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { AppSettings, AiModelItem } from '@/types'
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
    const { t } = useTranslation('settings')
    const [activeTab, setActiveTab] = useState<SettingsTab>('appearance')
    const [themeMode, setThemeMode] = useState<'light' | 'dark' | 'system'>('light')
    const [globalFontFamily, setGlobalFontFamily] = useState('system')
    const [closeAction, setCloseAction] = useState<'ask' | 'minimize' | 'quit'>('ask')
    const [language, setLanguage] = useState<'system' | 'zh-CN' | 'en-US'>('system')

    const [aiEnabled, setAiEnabled] = useState(false)
    const [aiBaseUrl, setAiBaseUrl] = useState('https://api.deepseek.com')
    const [aiApiKey, setAiApiKey] = useState('')
    const [aiModel, setAiModel] = useState('deepseek-v4-flash')
    const [aiModels, setAiModels] = useState<AiModelItem[]>([])
    const [activeModelId, setActiveModelId] = useState<string>('')
    const [aiTemperature, setAiTemperature] = useState(0.7)
    const [aiModelContextTokens, setAiModelContextTokens] = useState(65536)
    const [aiEnableMultimodal, setAiEnableMultimodal] = useState(false)
    const [aiEnableThinking, setAiEnableThinking] = useState(false)
    const [aiReasoningEffort, setAiReasoningEffort] = useState<'none' | 'low' | 'medium' | 'high'>('medium')
    const [aiSystemPrompt, setAiSystemPrompt] = useState('')

    const prevOpenRef = useRef(false)
    useEffect(() => {
        if (open && !prevOpenRef.current && settings) {
            setLanguage(settings.language || 'system')
            setThemeMode(settings.themeMode || 'light')
            setGlobalFontFamily(settings.globalFontFamily || 'system')
            setCloseAction(settings.closeAction || 'ask')
            setAiEnabled(!!settings.aiEnabled)
            setAiBaseUrl(settings.aiBaseUrl || 'https://api.deepseek.com')
            setAiApiKey(settings.aiApiKey || '')
            setAiModel(settings.aiModel || 'deepseek-v4-flash')
            setAiModels(settings.aiModels || [])
            setActiveModelId(settings.activeModelId || '')
            setAiTemperature(settings.aiTemperature ?? 0.7)
            setAiModelContextTokens(settings.aiModelContextTokens || 65536)
            setAiEnableMultimodal(!!settings.aiEnableMultimodal)
            setAiEnableThinking(!!settings.aiEnableThinking)
            setAiReasoningEffort(settings.aiReasoningEffort || 'medium')
            setAiSystemPrompt(settings.aiSystemPrompt || '')
        }
        prevOpenRef.current = open
    }, [open, settings])

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
            language,
            themeMode,
            globalFontFamily,
            closeAction,
            aiEnabled,
            aiBaseUrl,
            aiApiKey,
            aiModel,
            aiModels,
            activeModelId,
            aiTemperature,
            aiModelContextTokens,
            aiEnableMultimodal,
            aiEnableThinking,
            aiReasoningEffort,
            aiSystemPrompt,
            ...partial,
        })
    }, [
        settings,
        language,
        themeMode,
        globalFontFamily,
        closeAction,
        aiEnabled,
        aiBaseUrl,
        aiApiKey,
        aiModel,
        aiModels,
        activeModelId,
        aiTemperature,
        aiModelContextTokens,
        aiEnableMultimodal,
        aiEnableThinking,
        aiReasoningEffort,
        aiSystemPrompt,
        onSave,
    ])

    if (!open) return null

    const handleLanguageChange = (lang: 'system' | 'zh-CN' | 'en-US') => {
        setLanguage(lang)
        persistSettings({ language: lang })
    }

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

    const handleCloseActionChange = (action: 'ask' | 'minimize' | 'quit') => {
        setCloseAction(action)
        persistSettings({ closeAction: action })
    }

    const handleAiAgentChange = (fields: Partial<AppSettings>) => {
        if (fields.aiEnabled !== undefined) setAiEnabled(fields.aiEnabled)
        if (fields.aiBaseUrl !== undefined) setAiBaseUrl(fields.aiBaseUrl)
        if (fields.aiApiKey !== undefined) setAiApiKey(fields.aiApiKey)
        if (fields.aiModel !== undefined) setAiModel(fields.aiModel)
        if (fields.aiModels !== undefined) setAiModels(fields.aiModels)
        if (fields.activeModelId !== undefined) setActiveModelId(fields.activeModelId)
        if (fields.aiTemperature !== undefined) setAiTemperature(fields.aiTemperature)
        if (fields.aiModelContextTokens !== undefined) setAiModelContextTokens(fields.aiModelContextTokens)
        if (fields.aiEnableMultimodal !== undefined) setAiEnableMultimodal(fields.aiEnableMultimodal)
        if (fields.aiEnableThinking !== undefined) setAiEnableThinking(fields.aiEnableThinking)
        if (fields.aiReasoningEffort !== undefined) setAiReasoningEffort(fields.aiReasoningEffort)
        if (fields.aiSystemPrompt !== undefined) setAiSystemPrompt(fields.aiSystemPrompt)

        persistSettings(fields)
    }

    return (
        <div className={s.fullPane}>
            {/* 左侧 Sidebar 导航区 */}
            <div className={s.navSidebar}>
                <Button
                    type="text"
                    icon={<ArrowLeft size={16} />}
                    onClick={onClose}
                    title={t('backToMainTip')}
                    style={{ width: '100%', justifyContent: 'flex-start', marginBottom: 12 }}
                >
                    {t('backToMain')}
                </Button>

                <div className={s.sidebarHeader}>
                    <span className={s.sidebarTitle}>{t('title')}</span>
                </div>

                <div className={s.navList}>
                    <Button
                        type={activeTab === 'appearance' ? 'primary' : 'text'}
                        icon={<Palette size={15} />}
                        onClick={() => setActiveTab('appearance')}
                        style={{ width: '100%', justifyContent: 'flex-start', textAlign: 'left', height: 36, marginBottom: 4 }}
                    >
                        {t('tabs.appearance')}
                    </Button>
                    <Button
                        type={activeTab === 'aiAgent' ? 'primary' : 'text'}
                        icon={<Bot size={15} />}
                        onClick={() => setActiveTab('aiAgent')}
                        style={{ width: '100%', justifyContent: 'flex-start', textAlign: 'left', height: 36, marginBottom: 4 }}
                    >
                        {t('tabs.aiAgent')}
                    </Button>
                    <Button
                        type={activeTab === 'about' ? 'primary' : 'text'}
                        icon={<Info size={15} />}
                        onClick={() => setActiveTab('about')}
                        style={{ width: '100%', justifyContent: 'flex-start', textAlign: 'left', height: 36, marginBottom: 4 }}
                    >
                        {t('tabs.about')}
                    </Button>
                </div>
            </div>

            {/* 右侧 Content 内容区 */}
            <div className={s.contentPanel}>
                {activeTab === 'appearance' && (
                    <AppearanceTab
                        themeMode={themeMode}
                        globalFontFamily={globalFontFamily}
                        closeAction={closeAction}
                        language={language}
                        onThemeChange={handleThemeChange}
                        onGlobalFontChange={handleGlobalFontChange}
                        onCloseActionChange={handleCloseActionChange}
                        onLanguageChange={handleLanguageChange}
                    />
                )}

                {activeTab === 'aiAgent' && (
                    <AiAgentTab
                        aiEnabled={aiEnabled}
                        aiBaseUrl={aiBaseUrl}
                        aiApiKey={aiApiKey}
                        aiModel={aiModel}
                        aiModels={aiModels}
                        activeModelId={activeModelId}
                        aiTemperature={aiTemperature}
                        aiModelContextTokens={aiModelContextTokens}
                        aiEnableMultimodal={aiEnableMultimodal}
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
