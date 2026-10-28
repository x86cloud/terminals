import { Card, Select, Typography, Space } from 'antd'
import { useTranslation } from 'react-i18next'
import a from './AppearanceTab.module.less'

const { Text } = Typography

interface AppearanceTabProps {
    themeMode: 'light' | 'dark' | 'system'
    globalFontFamily: string
    closeAction?: 'ask' | 'minimize' | 'quit'
    language?: 'system' | 'zh-CN' | 'en-US'
    onThemeChange: (mode: 'light' | 'dark' | 'system') => void
    onGlobalFontChange: (fontKey: string) => void
    onCloseActionChange: (action: 'ask' | 'minimize' | 'quit') => void
    onLanguageChange?: (lang: 'system' | 'zh-CN' | 'en-US') => void
}

export default function AppearanceTab({
    themeMode,
    globalFontFamily,
    closeAction = 'ask',
    language = 'system',
    onThemeChange,
    onGlobalFontChange,
    onCloseActionChange,
    onLanguageChange,
}: AppearanceTabProps) {
    const { t } = useTranslation('settings')

    return (
        <Space orientation="vertical" size={16} style={{ width: '100%' }}>
            <div>
                <div className={a.sectionTitle}>{t('appearance.sectionTitle')}</div>
                <div className={a.sectionDesc}>{t('appearance.sectionDesc')}</div>
            </div>

            <Card size="small" style={{ borderRadius: 8 }}>
                <Space orientation="vertical" size={20} style={{ width: '100%' }}>
                    {onLanguageChange && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <div style={{ fontWeight: 600, fontSize: 14 }}>{t('appearance.languageTitle')}</div>
                                <Text type="secondary" style={{ fontSize: 12 }}>
                                    {t('appearance.languageDesc')}
                                </Text>
                            </div>
                            <Select
                                value={language}
                                onChange={onLanguageChange}
                                style={{ width: 220 }}
                                options={[
                                    { label: t('options.lang.system'), value: 'system' },
                                    { label: t('options.lang.zhCN'), value: 'zh-CN' },
                                    { label: t('options.lang.enUS'), value: 'en-US' },
                                ]}
                            />
                        </div>
                    )}

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <div style={{ fontWeight: 600, fontSize: 14 }}>{t('appearance.themeTitle')}</div>
                            <Text type="secondary" style={{ fontSize: 12 }}>
                                {t('appearance.themeDesc')}
                            </Text>
                        </div>
                        <Select
                            value={themeMode}
                            onChange={onThemeChange}
                            style={{ width: 220 }}
                            options={[
                                { label: t('options.theme.light'), value: 'light' },
                                { label: t('options.theme.dark'), value: 'dark' },
                                { label: t('options.theme.system'), value: 'system' },
                            ]}
                        />
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <div style={{ fontWeight: 600, fontSize: 14 }}>{t('appearance.fontTitle')}</div>
                            <Text type="secondary" style={{ fontSize: 12 }}>
                                {t('appearance.fontDesc')}
                            </Text>
                        </div>
                        <Select
                            value={globalFontFamily}
                            onChange={onGlobalFontChange}
                            style={{ width: 220 }}
                            options={[
                                { label: t('options.fonts.system'), value: 'system' },
                                { label: t('options.fonts.msyh'), value: 'msyh' },
                                { label: t('options.fonts.segoe'), value: 'segoe' },
                                { label: t('options.fonts.inter'), value: 'inter' },
                                { label: t('options.fonts.harmony'), value: 'harmony' },
                                { label: t('options.fonts.mono'), value: 'mono' },
                            ]}
                        />
                    </div>
                </Space>
            </Card>

            <div>
                <div className={a.sectionTitle}>{t('appearance.windowSectionTitle')}</div>
                <div className={a.sectionDesc}>{t('appearance.windowSectionDesc')}</div>
            </div>

            <Card size="small" style={{ borderRadius: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{t('appearance.closeActionTitle')}</div>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                            {t('appearance.closeActionDesc')}
                        </Text>
                    </div>
                    <Select
                        value={closeAction}
                        onChange={onCloseActionChange}
                        style={{ width: 220 }}
                        options={[
                            { label: t('options.closeAction.ask'), value: 'ask' },
                            { label: t('options.closeAction.minimize'), value: 'minimize' },
                            { label: t('options.closeAction.quit'), value: 'quit' },
                        ]}
                    />
                </div>
            </Card>
        </Space>
    )
}
