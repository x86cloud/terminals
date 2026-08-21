import React from 'react'
import { Card, Select, Typography, Space } from 'antd'
import a from './AppearanceTab.module.less'

const { Text } = Typography

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
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <div>
                <div className={a.sectionTitle}>外观与主题</div>
                <div className={a.sectionDesc}>切换应用视觉风格与整体界面色彩方案。</div>
            </div>

            <Card size="small" style={{ borderRadius: 8 }}>
                <Space direction="vertical" size={20} style={{ width: '100%' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <div style={{ fontWeight: 600, fontSize: 14 }}>界面主题模式</div>
                            <Text type="secondary" style={{ fontSize: 12 }}>
                                选择符合偏好的应用浅色或暗色视觉主题（实时生效）
                            </Text>
                        </div>
                        <Select
                            value={themeMode}
                            onChange={onThemeChange}
                            style={{ width: 220 }}
                            options={[
                                { label: '浅色模式 (Light Default)', value: 'light' },
                                { label: '暗色模式 (Dark)', value: 'dark' },
                                { label: '跟随系统 (System)', value: 'system' },
                            ]}
                        />
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <div style={{ fontWeight: 600, fontSize: 14 }}>全局界面字体 (Global Font)</div>
                            <Text type="secondary" style={{ fontSize: 12 }}>
                                应用整个界面（侧栏、表格、对话框）全局字体风格
                            </Text>
                        </div>
                        <Select
                            value={globalFontFamily}
                            onChange={onGlobalFontChange}
                            style={{ width: 220 }}
                            options={[
                                { label: '系统默认 (System Default)', value: 'system' },
                                { label: '微软雅黑 (Microsoft YaHei)', value: 'msyh' },
                                { label: 'Segoe UI (Windows)', value: 'segoe' },
                                { label: 'Inter / San Francisco', value: 'inter' },
                                { label: 'HarmonyOS Sans (鸿蒙)', value: 'harmony' },
                                { label: '程序员极简风格 (Monospace)', value: 'mono' },
                            ]}
                        />
                    </div>
                </Space>
            </Card>
        </Space>
    )
}
