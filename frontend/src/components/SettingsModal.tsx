import React, {useEffect, useState} from 'react'
import Icon from './Icon'
import {AppSettings} from '../types'
import {applyThemeMode, applyGlobalFont} from '../utils/theme'
import g from '../styles/global.module.less'
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
                            <div>
                                <div className={s.sectionTitle}>外观与主题</div>
                                <div className={s.sectionDesc}>切换应用视觉风格与整体界面色彩方案。</div>

                                <div className={s.card}>
                                    <div className={s.formRow}>
                                        <div className={s.labelInfo}>
                                            <span className={s.rowTitle}>界面主题模式</span>
                                            <span className={s.rowSub}>选择符合偏好的应用浅色或暗色视觉主题（实时生效）</span>
                                        </div>
                                        <select
                                            value={themeMode}
                                            onChange={(e) => handleThemeChange(e.target.value as 'light' | 'dark' | 'system')}
                                        >
                                            <option value="light">浅色模式 (Light Default)</option>
                                            <option value="dark">暗色模式 (Dark)</option>
                                            <option value="system">跟随系统 (System)</option>
                                        </select>
                                    </div>

                                    <div className={s.formRow}>
                                        <div className={s.labelInfo}>
                                            <span className={s.rowTitle}>全局界面字体 (Global Font)</span>
                                            <span className={s.rowSub}>应用整个界面（侧栏、表格、对话框）全局字体风格</span>
                                        </div>
                                        <select
                                            value={globalFontFamily}
                                            onChange={(e) => handleGlobalFontChange(e.target.value)}
                                        >
                                            <option value="system">系统默认 (System Default)</option>
                                            <option value="msyh">微软雅黑 (Microsoft YaHei)</option>
                                            <option value="segoe">Segoe UI (Windows)</option>
                                            <option value="inter">Inter / San Francisco</option>
                                            <option value="harmony">HarmonyOS Sans (鸿蒙)</option>
                                            <option value="mono">程序员极简风格 (Monospace)</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'about' && (
                            <div className={s.aboutBox}>
                                <Icon name="terminal" size={42}/>
                                <div className={s.appName}>xClient Terminal</div>
                                <div className={s.appVer}>v1.0.0 (Wails 2.13)</div>
                                <div className={s.appDesc}>
                                    一款跨平台的现代高颜值 Terminal 客户端，支持 SSH、Redis、MySQL、MongoDB、MQTT 及 SQLite 全套数据协同管理。
                                </div>
                            </div>
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
