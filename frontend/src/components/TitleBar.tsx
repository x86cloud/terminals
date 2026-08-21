import React, { useEffect, useState } from 'react'
import { Button, Tooltip } from 'antd'
import {
    Terminal,
    Pin,
    Settings,
    Minus,
    Square,
    Copy,
    X,
    Sun,
    Moon,
} from 'lucide-react'
import { Window } from '@wailsio/runtime'
import AppLogo from './AppLogo'
import s from './TitleBar.module.less'

interface TitleBarProps {
    onOpenSettings?: () => void
    activeTitle?: string
    themeMode?: 'light' | 'dark' | 'system'
    onToggleTheme?: () => void
}

export const TitleBar: React.FC<TitleBarProps> = ({
    onOpenSettings,
    activeTitle,
    themeMode = 'dark',
    onToggleTheme,
}) => {
    const [isMaximised, setIsMaximised] = useState<boolean>(false)
    const [isAlwaysOnTop, setIsAlwaysOnTop] = useState<boolean>(false)

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
        const interval = setInterval(updateWindowStates, 600)
        window.addEventListener('resize', updateWindowStates)

        return () => {
            clearInterval(interval)
            window.removeEventListener('resize', updateWindowStates)
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
            </div>

            <div className={s.center}>
                {activeTitle && <span className={s.centerText}>{activeTitle}</span>}
            </div>

            <div className={s.right} style={{ ['--wails-draggable' as any]: 'no-drag' }}>
                <div className={s.quickActions}>
                    {onToggleTheme && (
                        <Tooltip title={isCurrentDark ? '切换至浅色模式' : '切换至暗色模式'}>
                            <Button
                                size="small"
                                type="text"
                                icon={isCurrentDark ? <Sun size={13} strokeWidth={1.8} /> : <Moon size={13} strokeWidth={1.8} />}
                                onClick={onToggleTheme}
                            />
                        </Tooltip>
                    )}

                    <Tooltip title={isAlwaysOnTop ? '取消窗口置顶' : '窗口置顶'}>
                        <Button
                            size="small"
                            type={isAlwaysOnTop ? 'primary' : 'text'}
                            icon={<Pin size={13} strokeWidth={1.8} />}
                            onClick={handleToggleAlwaysOnTop}
                        />
                    </Tooltip>

                    {onOpenSettings && (
                        <Tooltip title="系统设置">
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
                        title="最小化"
                        onClick={handleMinimise}
                        aria-label="最小化"
                    >
                        <Minus size={13} strokeWidth={1.5} />
                    </button>

                    <button
                        type="button"
                        className={s.controlBtn}
                        title={isMaximised ? '向下还原' : '最大化'}
                        onClick={handleToggleMaximise}
                        aria-label={isMaximised ? '向下还原' : '最大化'}
                    >
                        {isMaximised ? <Copy size={11} strokeWidth={1.5} /> : <Square size={11} strokeWidth={1.5} />}
                    </button>

                    <button
                        type="button"
                        className={`${s.controlBtn} ${s.close}`}
                        title="关闭"
                        onClick={handleClose}
                        aria-label="关闭"
                    >
                        <X size={14} strokeWidth={1.5} />
                    </button>
                </div>
            </div>
        </header>
    )
}

export default TitleBar
