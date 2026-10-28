import React, { useEffect, useState } from 'react'
import { Button, Tooltip, Dropdown } from 'antd'
import type { MenuProps } from 'antd'
import {
    Pin,
    Settings,
    Minus,
    Square,
    Copy,
    X,
    Sun,
    Moon,
    PanelLeft,
    Languages,
} from 'lucide-react'
import { Window, Events } from '@wailsio/runtime'
import { useTranslation } from 'react-i18next'
import { useSession } from '@/contexts/SessionContext'
import AppLogo from './AppLogo'
import s from './TitleBar.module.less'

interface TitleBarProps {
    onOpenSettings?: () => void
    activeTitle?: string
    themeMode?: 'light' | 'dark' | 'system'
    onToggleTheme?: () => void
    sidebarOpen?: boolean
    onToggleSidebar?: () => void
    onRequestClose?: () => void
    language?: 'system' | 'zh-CN' | 'en-US'
    onChangeLanguage?: (lang: 'system' | 'zh-CN' | 'en-US') => void
}

export const TitleBar: React.FC<TitleBarProps> = ({
    onOpenSettings,
    activeTitle,
    themeMode = 'dark',
    onToggleTheme,
    sidebarOpen,
    onToggleSidebar,
    onRequestClose,
    language = 'system',
    onChangeLanguage,
}) => {
    const { t } = useTranslation('titlebar')
    const session = useSession()
    const isSidebarOpen = sidebarOpen ?? session.sidebarOpen
    const handleToggleSidebar = onToggleSidebar ?? session.toggleSidebar
    const [isMaximised, setIsMaximised] = useState<boolean>(false)
    const [isAlwaysOnTop, setIsAlwaysOnTop] = useState<boolean>(false)
    const [langDropdownOpen, setLangDropdownOpen] = useState<boolean>(false)

    const updateWindowStates = async () => {
        try {
            if (typeof Window.IsMaximised === 'function') {
                const max = await Window.IsMaximised()
                setIsMaximised(!!max)
            }
        } catch {
            // non-wails env fallback
        }
    }

    useEffect(() => {
        updateWindowStates()
        window.addEventListener('resize', updateWindowStates)

        const unsubs: Array<() => void> = []
        try {
            if (Events && typeof Events.On === 'function') {
                const onMax = Events.On('windows:WindowMaximise', () => setIsMaximised(true))
                const onUnmax = Events.On('windows:WindowUnMaximise', () => setIsMaximised(false))
                const onRestore = Events.On('windows:WindowRestore', () => setIsMaximised(false))
                const onMacMax = Events.On('mac:WindowMaximise' as any, () => setIsMaximised(true))
                const onMacUnmax = Events.On('mac:WindowUnMaximise' as any, () => setIsMaximised(false))
                unsubs.push(onMax, onUnmax, onRestore, onMacMax, onMacUnmax)
            }
        } catch {
            // fallback
        }

        return () => {
            window.removeEventListener('resize', updateWindowStates)
            unsubs.forEach(u => {
                if (typeof u === 'function') u()
            })
        }
    }, [])

    const handleMinimise = () => {
        try {
            Window.Minimise()
        } catch (e) {
            console.warn('Window.Minimise not supported:', e)
        }
    }

    const handleToggleMaximise = () => {
        try {
            Window.ToggleMaximise()
            setTimeout(updateWindowStates, 100)
        } catch (e) {
            console.warn('Window.ToggleMaximise not supported:', e)
        }
    }

    const handleClose = () => {
        if (onRequestClose) {
            onRequestClose()
            return
        }
        try {
            Window.Close()
        } catch (e) {
            console.warn('Window.Close not supported:', e)
        }
    }

    const handleToggleAlwaysOnTop = () => {
        const nextState = !isAlwaysOnTop
        setIsAlwaysOnTop(nextState)
        try {
            Window.SetAlwaysOnTop(nextState)
        } catch (e) {
            console.warn('Window.SetAlwaysOnTop not supported:', e)
        }
    }

    const isCurrentDark =
        themeMode === 'dark' ||
        (themeMode === 'system' &&
            typeof window !== 'undefined' &&
            window.matchMedia &&
            window.matchMedia('(prefers-color-scheme: dark)').matches)

    const langMenuItems: MenuProps['items'] = [
        {
            key: 'system',
            label: t('titlebar:langSystem', '跟随系统'),
            onClick: () => {
                setLangDropdownOpen(false)
                onChangeLanguage?.('system')
            },
        },
        {
            key: 'zh-CN',
            label: t('titlebar:langZh', '简体中文'),
            onClick: () => {
                setLangDropdownOpen(false)
                onChangeLanguage?.('zh-CN')
            },
        },
        {
            key: 'en-US',
            label: t('titlebar:langEn', 'English'),
            onClick: () => {
                setLangDropdownOpen(false)
                onChangeLanguage?.('en-US')
            },
        },
    ]

    return (
        <header
            className={s.titleBar}
            onDoubleClick={handleToggleMaximise}
            style={{ ['--wails-draggable' as any]: 'drag' }}
            data-wml-window-drag
        >
            <div className={s.left} style={{ ['--wails-draggable' as any]: 'no-drag' }}>
                <div className={s.logo}>
                    <AppLogo size={18} />
                </div>
                <div className={s.title}>
                    xTerminal
                </div>
            </div>

            <div className={s.center}>
                {activeTitle && <span className={s.centerText}>{activeTitle}</span>}
            </div>

            <div className={s.right} style={{ ['--wails-draggable' as any]: 'no-drag' }}>
                <div className={s.quickActions}>
                    {handleToggleSidebar && (
                        <Tooltip title={isSidebarOpen ? t('collapseSidebar') : t('expandSidebar')}>
                            <Button
                                size="small"
                                type={isSidebarOpen ? 'primary' : 'text'}
                                icon={<PanelLeft size={13} strokeWidth={1.8} />}
                                onClick={handleToggleSidebar}
                            />
                        </Tooltip>
                    )}

                    {onChangeLanguage && (
                        <Dropdown
                            menu={{
                                items: langMenuItems,
                                selectedKeys: [language],
                                onClick: () => setLangDropdownOpen(false),
                            }}
                            trigger={['click']}
                            open={langDropdownOpen}
                            onOpenChange={setLangDropdownOpen}
                            placement="bottomRight"
                        >
                            <Tooltip
                                title={langDropdownOpen ? null : t('switchLanguage')}
                                open={langDropdownOpen ? false : undefined}
                                destroyTooltipOnHide
                            >
                                <Button
                                    size="small"
                                    type={langDropdownOpen ? 'default' : 'text'}
                                    icon={<Languages size={13} strokeWidth={1.8} />}
                                />
                            </Tooltip>
                        </Dropdown>
                    )}

                    {onToggleTheme && (
                        <Tooltip title={isCurrentDark ? t('switchToLight') : t('switchToDark')}>
                            <Button
                                size="small"
                                type="text"
                                icon={isCurrentDark ? <Sun size={13} strokeWidth={1.8} /> : <Moon size={13} strokeWidth={1.8} />}
                                onClick={onToggleTheme}
                            />
                        </Tooltip>
                    )}

                    <Tooltip title={isAlwaysOnTop ? t('unpinWindow') : t('pinWindow')}>
                        <Button
                            size="small"
                            type={isAlwaysOnTop ? 'primary' : 'text'}
                            icon={<Pin size={13} strokeWidth={1.8} />}
                            onClick={handleToggleAlwaysOnTop}
                        />
                    </Tooltip>

                    {onOpenSettings && (
                        <Tooltip title={t('settings')}>
                            <Button
                                size="small"
                                type="text"
                                icon={<Settings size={13} strokeWidth={1.8} />}
                                onClick={onOpenSettings}
                            />
                        </Tooltip>
                    )}
                </div>

                <div className={s.controls}>
                    <button
                        type="button"
                        className={s.controlBtn}
                        title={t('minimise')}
                        onClick={handleMinimise}
                        aria-label={t('minimise')}
                    >
                        <Minus size={13} strokeWidth={1.5} />
                    </button>

                    <button
                        type="button"
                        className={s.controlBtn}
                        title={isMaximised ? t('restore') : t('maximise')}
                        onClick={handleToggleMaximise}
                        aria-label={isMaximised ? t('restore') : t('maximise')}
                    >
                        {isMaximised ? <Copy size={11} strokeWidth={1.5} /> : <Square size={11} strokeWidth={1.5} />}
                    </button>

                    <button
                        type="button"
                        className={`${s.controlBtn} ${s.close}`}
                        title={t('close')}
                        onClick={handleClose}
                        aria-label={t('close')}
                    >
                        <X size={14} strokeWidth={1.5} />
                    </button>
                </div>
            </div>
        </header>
    )
}

export default TitleBar
