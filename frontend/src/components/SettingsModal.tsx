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

type SettingsTab = 'general' | 'terminal' | 'appearance' | 'about'

export default function SettingsModal({open, settings, onClose, onSave}: Props) {
    const [activeTab, setActiveTab] = useState<SettingsTab>('general')
    const [autoConnect, setAutoConnect] = useState(false)
    const [fontFamily, setFontFamily] = useState('Consolas')
    const [fontSize, setFontSize] = useState('13')
    const [themeMode, setThemeMode] = useState<'light' | 'dark' | 'system'>('light')
    const [dbDefaultLimit, setDbDefaultLimit] = useState('50')
    const [globalFontFamily, setGlobalFontFamily] = useState('system')

    useEffect(() => {
        if (open && settings) {
            setAutoConnect(!!settings.autoConnect)
            setFontFamily(settings.fontFamily || 'Consolas')
            setFontSize(settings.fontSize || '13')
            setThemeMode(settings.themeMode || 'light')
            setDbDefaultLimit(settings.dbDefaultLimit || '50')
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
            themeMode,
            fontFamily,
            fontSize,
            autoConnect,
            dbDefaultLimit,
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
                            className={`${s.navItem}${activeTab === 'general' ? ' ' + s.active : ''}`}
                            onClick={() => setActiveTab('general')}
                        >
                            <Icon name="server" size={14}/> 常规设置
                        </button>
                        <button
                            className={`${s.navItem}${activeTab === 'terminal' ? ' ' + s.active : ''}`}
                            onClick={() => setActiveTab('terminal')}
                        >
                            <Icon name="terminal" size={14}/> 终端配置
                        </button>
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
                        {activeTab === 'general' && (
                            <div>
                                <div className={s.sectionTitle}>常规设置</div>
                                <div className={s.sectionDesc}>管理客户端启动、全局会话与基础行数为默认项。</div>

                                <div className={s.card}>
                                    <div className={s.formRow}>
                                        <div className={s.labelInfo}>
                                            <span className={s.rowTitle}>启动时自动恢复会话</span>
                                            <span className={s.rowSub}>开启后将在应用打开时尝试恢复上一次未关闭的 SSH / 数据库连接</span>
                                        </div>
                                        <input
                                            type="checkbox"
                                            checked={autoConnect}
                                            onChange={(e) => setAutoConnect(e.target.checked)}
                                        />
                                    </div>

                                    <div className={s.formRow}>
                                        <div className={s.labelInfo}>
                                            <span className={s.rowTitle}>默认数据库查询限制</span>
                                            <span className={s.rowSub}>MySQL / SQLite 单页默认读取行数</span>
                                        </div>
                                        <select
                                            value={dbDefaultLimit}
                                            onChange={(e) => setDbDefaultLimit(e.target.value)}
                                        >
                                            <option value="20">20 行/页</option>
                                            <option value="50">50 行/页</option>
                                            <option value="100">100 行/页</option>
                                            <option value="200">200 行/页</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'terminal' && (
                            <div>
                                <div className={s.sectionTitle}>终端配置</div>
                                <div className={s.sectionDesc}>自定义 SSH 终端字体、字号与光标渲染逻辑。</div>

                                <div className={s.card}>
                                    <div className={s.formRow}>
                                        <div className={s.labelInfo}>
                                            <span className={s.rowTitle}>终端字体 (Font Family)</span>
                                            <span className={s.rowSub}>用于 SSH / Shell 命令行界面的等宽字体</span>
                                        </div>
                                        <select value={fontFamily} onChange={(e) => setFontFamily(e.target.value)}>
                                            <option value="Consolas">Consolas</option>
                                            <option value="JetBrains Mono">JetBrains Mono</option>
                                            <option value="Fira Code">Fira Code</option>
                                            <option value="Courier New">Courier New</option>
                                        </select>
                                    </div>

                                    <div className={s.formRow}>
                                        <div className={s.labelInfo}>
                                            <span className={s.rowTitle}>终端字号 (Font Size)</span>
                                            <span className={s.rowSub}>命令行文字大小（px）</span>
                                        </div>
                                        <select value={fontSize} onChange={(e) => setFontSize(e.target.value)}>
                                            <option value="12">12 px</option>
                                            <option value="13">13 px (默认)</option>
                                            <option value="14">14 px</option>
                                            <option value="16">16 px</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                        )}

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
