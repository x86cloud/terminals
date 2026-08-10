import React from 'react'
import a from './AppearanceTab.module.less'

interface AppearanceTabProps {
    themeMode: 'light' | 'dark' | 'system'
    globalFontFamily: string
    onThemeChange: (mode: 'light' | 'dark' | 'system') => void
    onGlobalFontChange: (fontKey: string) => void
}

export default function AppearanceTab({
    themeMode,
    globalFontFamily,
    onThemeChange,
    onGlobalFontChange,
}: AppearanceTabProps) {
    return (
        <div>
            <div className={a.sectionTitle}>外观与主题</div>
            <div className={a.sectionDesc}>切换应用视觉风格与整体界面色彩方案。</div>

            <div className={a.card}>
                <div className={a.formRow}>
                    <div className={a.labelInfo}>
                        <span className={a.rowTitle}>界面主题模式</span>
                        <span className={a.rowSub}>选择符合偏好的应用浅色或暗色视觉主题（实时生效）</span>
                    </div>
                    <select
                        value={themeMode}
                        onChange={(e) => onThemeChange(e.target.value as 'light' | 'dark' | 'system')}
                    >
                        <option value="light">浅色模式 (Light Default)</option>
                        <option value="dark">暗色模式 (Dark)</option>
                        <option value="system">跟随系统 (System)</option>
                    </select>
                </div>

                <div className={a.formRow}>
                    <div className={a.labelInfo}>
                        <span className={a.rowTitle}>全局界面字体 (Global Font)</span>
                        <span className={a.rowSub}>应用整个界面（侧栏、表格、对话框）全局字体风格</span>
                    </div>
                    <select
                        value={globalFontFamily}
                        onChange={(e) => onGlobalFontChange(e.target.value)}
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
    )
}
