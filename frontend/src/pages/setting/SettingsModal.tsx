import React, {useEffect, useState} from 'react'
import Icon from '../../components/Icon'
import {AppSettings} from '../../types'
import {applyThemeMode, applyGlobalFont} from '../../utils/theme'
import AppearanceTab from './AppearanceTab'
import AboutTab from './AboutTab'
import g from '../../styles/global.module.less'
import s from './SettingsModal.module.less'

interface Props {
    open: boolean
    settings: AppSettings
    onClose: () => void
    onSave: (newSettings: AppSettings) => void
}

type SettingsTab = 'appearance' | 'about'

export default function SettingsModal({open, settings, onClose, onSave}: Props) {
    const [activeTab, setActiveTab] = useState<SettingsTab>('appearance')
    const [themeMode, setThemeMode] = useState<'light' | 'dark' | 'system'>('light')
    const [globalFontFamily, setGlobalFontFamily] = useState('system')

    useEffect(() => {
        if (open && settings) {
            setThemeMode(settings.themeMode || 'light')
            setGlobalFontFamily(settings.globalFontFamily || 'system')
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
        })
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
