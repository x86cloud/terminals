import React, {useEffect, useState} from 'react'
import Icon from '../../components/Icon'
import {AppSettings} from '../../types'
import {applyThemeMode, applyGlobalFont} from '../../utils/theme'
import AppearanceTab from './AppearanceTab'
import AiAgentTab from './AiAgentTab'
import AboutTab from './AboutTab'
import g from '../../styles/global.module.less'
import s from './SettingsModal.module.less'

interface Props {
    open: boolean
    settings: AppSettings
    onClose: () => void
    onSave: (newSettings: AppSettings) => void
}

type SettingsTab = 'appearance' | 'aiAgent' | 'about'

export default function SettingsModal({open, settings, onClose, onSave}: Props) {
    const [activeTab, setActiveTab] = useState<SettingsTab>('appearance')
    const [themeMode, setThemeMode] = useState<'light' | 'dark' | 'system'>('light')
    const [globalFontFamily, setGlobalFontFamily] = useState('system')

    const [aiBaseUrl, setAiBaseUrl] = useState('https://api.deepseek.com')
    const [aiApiKey, setAiApiKey] = useState('')
    const [aiModel, setAiModel] = useState('deepseek-chat')
    const [aiTemperature, setAiTemperature] = useState(0.7)
    const [aiMaxContextTokens, setAiMaxContextTokens] = useState(4096)
    const [aiCompressionStrategy, setAiCompressionStrategy] = useState<'summary' | 'sliding'>('summary')
    const [aiEnableMultimodal, setAiEnableMultimodal] = useState(false)
    const [aiEnableWebSearch, setAiEnableWebSearch] = useState(false)
    const [aiEnablePermissionGuard, setAiEnablePermissionGuard] = useState(true)
    const [aiBlockHighRiskCommands, setAiBlockHighRiskCommands] = useState(true)
    const [aiSystemPrompt, setAiSystemPrompt] = useState('你是一个有用的 AI 助手，能够回答用户的各种技术与日常问题，并给出精准优雅的解答。')
    const [aiWorkspaceDir, setAiWorkspaceDir] = useState('')

    useEffect(() => {
        if (open && settings) {
            setThemeMode(settings.themeMode || 'light')
            setGlobalFontFamily(settings.globalFontFamily || 'system')
            setAiBaseUrl(settings.aiBaseUrl || 'https://api.deepseek.com')
            setAiApiKey(settings.aiApiKey || '')
            setAiModel(settings.aiModel || 'deepseek-chat')
            setAiTemperature(settings.aiTemperature ?? 0.7)
            setAiMaxContextTokens(settings.aiMaxContextTokens || 4096)
            setAiCompressionStrategy(settings.aiCompressionStrategy || 'summary')
            setAiEnableMultimodal(!!settings.aiEnableMultimodal)
            setAiEnableWebSearch(!!settings.aiEnableWebSearch)
            setAiEnablePermissionGuard(settings.aiEnablePermissionGuard ?? true)
            setAiBlockHighRiskCommands(settings.aiBlockHighRiskCommands ?? true)
            setAiSystemPrompt(settings.aiSystemPrompt || '你是一个有用的 AI 助手，能够回答用户的各种技术与日常问题，并给出精准优雅的解答。')
            setAiWorkspaceDir(settings.aiWorkspaceDir || '')
        }
    }, [open, settings])

    if (!open) return null

    const handleThemeChange = (mode: 'light' | 'dark' | 'system') => {
        setThemeMode(mode)
        applyThemeMode(mode)
    }

    const handleGlobalFontChange = (fontKey: string) => {
        setGlobalFontFamily(fontKey)
        applyGlobalFont(fontKey)
    }

    const handleCancel = () => {
        applyThemeMode(settings.themeMode || 'light')
        applyGlobalFont(settings.globalFontFamily || 'system')
        onClose()
    }

    const handleSave = () => {
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
            aiSystemPrompt,
            aiWorkspaceDir,
        })
        onClose()
    }

    return (
        <div className={s.overlay} onClick={handleCancel}>
            <div className={s.modal} onClick={(e) => e.stopPropagation()}>
                <div className={s.header}>
                    <div className={s.title}>
                        <Icon name="settings" size={16}/>
                        <span>设置</span>
                    </div>
                    <button className={g.iconBtn} onClick={handleCancel} title="关闭">
                        <Icon name="close" size={14}/>
                    </button>
                </div>

                <div className={s.body}>
                    {/* 左侧分类导航 */}
                    <div className={s.navSidebar}>
                        <button
                            className={`${s.navItem}${activeTab === 'appearance' ? ' ' + s.active : ''}`}
                            onClick={() => setActiveTab('appearance')}
                        >
                            <Icon name="chart" size={14}/> 外观主题
                        </button>
                        <button
                            className={`${s.navItem}${activeTab === 'aiAgent' ? ' ' + s.active : ''}`}
                            onClick={() => setActiveTab('aiAgent')}
                        >
                            <Icon name="bot" size={14}/> AI 智能体
                        </button>
                        <button
                            className={`${s.navItem}${activeTab === 'about' ? ' ' + s.active : ''}`}
                            onClick={() => setActiveTab('about')}
                        >
                            <Icon name="home" size={14}/> 关于应用
                        </button>
                    </div>

                    {/* 右侧配置面板 */}
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
                                aiSystemPrompt={aiSystemPrompt}
                                onChange={(fields) => {
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
                                    if (fields.aiSystemPrompt !== undefined) setAiSystemPrompt(fields.aiSystemPrompt)
                                }}
                            />
                        )}

                        {activeTab === 'about' && (
                            <AboutTab />
                        )}
                    </div>
                </div>

                <div className={s.footer}>
                    <button className={`${g.btn} ${g.xs}`} onClick={handleCancel}>
                        取消
                    </button>
                    <button className={`${g.btn} ${g.xs} ${g.primary}`} onClick={handleSave}>
                        保存设置
                    </button>
                </div>
            </div>
        </div>
    )
}
