import React, { useEffect, useState } from 'react'
import {
    Terminal,
    Pin,
    Settings,
    Minus,
    Square,
    Copy,
    X,
} from 'lucide-react'
import {
    WindowMinimise,
    WindowToggleMaximise,
    Quit,
    WindowIsMaximised,
    WindowSetAlwaysOnTop,
} from '../../wailsjs/runtime/runtime'
import s from './TitleBar.module.less'

interface TitleBarProps {
    onOpenSettings?: () => void
    activeTitle?: string
}

export const TitleBar: React.FC<TitleBarProps> = ({ onOpenSettings, activeTitle }) => {
    const [isMaximised, setIsMaximised] = useState<boolean>(false)
    const [isAlwaysOnTop, setIsAlwaysOnTop] = useState<boolean>(false)

    const updateWindowStates = async () => {
        try {
            if (typeof WindowIsMaximised === 'function') {
                const max = await WindowIsMaximised()
                setIsMaximised(max)
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
            WindowMinimise()
        } catch (e) {
            console.warn('WindowMinimise not supported:', e)
        }
    }

    const handleToggleMaximise = () => {
        try {
            WindowToggleMaximise()
            setTimeout(updateWindowStates, 100)
        } catch (e) {
            console.warn('WindowToggleMaximise not supported:', e)
        }
    }

    const handleClose = () => {
        try {
            if (typeof Quit === 'function') {
                Quit()
            } else if ((window as any).runtime?.WindowClose) {
                (window as any).runtime.WindowClose()
            }
        } catch (e) {
            console.warn('Quit/WindowClose not supported:', e)
        }
    }

    const handleToggleAlwaysOnTop = () => {
        const nextState = !isAlwaysOnTop
        setIsAlwaysOnTop(nextState)
        try {
            WindowSetAlwaysOnTop(nextState)
        } catch (e) {
            console.warn('WindowSetAlwaysOnTop not supported:', e)
        }
    }

    return (
        <header className={s.titleBar} onDoubleClick={handleToggleMaximise}>
            <div className={s.left}>
                <div className={s.logo}>
                    <Terminal size={16} strokeWidth={2} />
                </div>
            </div>

            <div className={s.center}>
                {activeTitle && <span className={s.centerText}>{activeTitle}</span>}
            </div>

            <div className={s.right}>
                <div className={s.quickActions}>
                    <button
                        type="button"
                        className={`${s.actionBtn} ${isAlwaysOnTop ? s.active : ''}`}
                        title={isAlwaysOnTop ? '取消窗口置顶' : '窗口置顶'}
                        onClick={handleToggleAlwaysOnTop}
                    >
                        <Pin size={13} strokeWidth={1.8} />
                    </button>

                    {onOpenSettings && (
                        <button
                            type="button"
                            className={s.actionBtn}
                            title="系统设置"
                            onClick={onOpenSettings}
                        >
                            <Settings size={13} strokeWidth={1.8} />
                        </button>
                    )}
                </div>

                <div className={s.controls}>
                    <button
                        type="button"
                        className={s.controlBtn}
                        title="最小化"
                        onClick={handleMinimise}
                    >
                        <Minus size={12} strokeWidth={1.8} />
                    </button>

                    <button
                        type="button"
                        className={s.controlBtn}
                        title={isMaximised ? '还原窗口' : '最大化'}
                        onClick={handleToggleMaximise}
                    >
                        {isMaximised ? <Copy size={12} strokeWidth={1.8} /> : <Square size={12} strokeWidth={1.8} />}
                    </button>

                    <button
                        type="button"
                        className={`${s.controlBtn} ${s.close}`}
                        title="关闭"
                        onClick={handleClose}
                    >
                        <X size={14} strokeWidth={1.8} />
                    </button>
                </div>
            </div>
        </header>
    )
}

export default TitleBar
