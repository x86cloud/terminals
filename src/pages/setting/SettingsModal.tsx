import { useEffect, useState, useCallback, useRef } from 'react'
import { Button } from 'antd'
import { ArrowLeft, Palette, Info } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { AppSettings } from '@/types'
import { applyThemeMode, applyGlobalFont } from '@/utils/theme'
import AppearanceTab from '@/pages/setting/AppearanceTab'
import AboutTab from '@/pages/setting/AboutTab'
import s from '@/pages/setting/SettingsModal.module.less'

interface Props {
    open: boolean
    settings: AppSettings
    onClose: () => void
    onSave: (newSettings: AppSettings) => void
}

type SettingsTab = 'appearance' | 'about'

export default function SettingsModal({ open, settings, onClose, onSave }: Props) {
    const { t } = useTranslation('settings')
    const [activeTab, setActiveTab] = useState<SettingsTab>('appearance')
    const [themeMode, setThemeMode] = useState<'light' | 'dark' | 'system'>('light')
    const [globalFontFamily, setGlobalFontFamily] = useState('system')
    const [closeAction, setCloseAction] = useState<'ask' | 'minimize' | 'quit'>('ask')
    const [language, setLanguage] = useState<'system' | 'zh-CN' | 'en-US'>('system')

    const prevOpenRef = useRef(false)
    useEffect(() => {
        if (open && !prevOpenRef.current && settings) {
            setLanguage(settings.language || 'system')
            setThemeMode(settings.themeMode || 'light')
            setGlobalFontFamily(settings.globalFontFamily || 'system')
            setCloseAction(settings.closeAction || 'ask')
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
            ...partial,
        })
    }, [settings, language, themeMode, globalFontFamily, closeAction, onSave])

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

                {activeTab === 'about' && (
                    <AboutTab />
                )}
            </div>
        </div>
    )
}
