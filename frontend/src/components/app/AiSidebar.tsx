import React, { useState, useEffect, useRef, useCallback } from 'react'
import { AppSettings } from '@/types'
import { useSession } from '@/contexts/SessionContext'
import ErrorBoundary from '@/components/ErrorBoundary'
import AiAgentPanel from '@/pages/agent/AiAgentPanel'
import { appStorage, StorageKey } from '@/utils/storage'
import s from './AiSidebar.module.less'

interface AiSidebarProps {
    settings: AppSettings
    onUpdateSettings?: (newSettings: AppSettings) => Promise<void>
}

const DEFAULT_WIDTH = 440
const MIN_WIDTH = 340
const MAX_WIDTH = 800

export default function AiSidebar({ settings, onUpdateSettings }: AiSidebarProps) {
    const { aiSidebarOpen, setAiSidebarOpen } = useSession()

    const [width, setWidth] = useState<number>(() => {
        const parsed = appStorage.getNumber(StorageKey.AiSidebarWidth, DEFAULT_WIDTH)
        if (parsed >= MIN_WIDTH && parsed <= MAX_WIDTH) {
            return parsed
        }
        return DEFAULT_WIDTH
    })

    const [isResizing, setIsResizing] = useState(false)
    const [mounted, setMounted] = useState(false)
    const resizeRef = useRef<{ startX: number; startWidth: number }>({ startX: 0, startWidth: 440 })

    useEffect(() => {
        const raf = requestAnimationFrame(() => {
            setMounted(true)
        })
        return () => cancelAnimationFrame(raf)
    }, [])

    const handleMouseDown = useCallback(
        (e: React.MouseEvent) => {
            e.preventDefault()
            setIsResizing(true)
            resizeRef.current = {
                startX: e.clientX,
                startWidth: width,
            }
            document.body.style.userSelect = 'none'
            document.body.style.cursor = 'col-resize'
        },
        [width]
    )

    useEffect(() => {
        if (!isResizing) return

        const handleMouseMove = (e: MouseEvent) => {
            const deltaX = resizeRef.current.startX - e.clientX
            const targetWidth = resizeRef.current.startWidth + deltaX
            const clamped = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, targetWidth))
            setWidth(clamped)
        }

        const handleMouseUp = () => {
            setIsResizing(false)
            document.body.style.userSelect = ''
            document.body.style.cursor = ''
            setWidth((curr) => {
                appStorage.set(StorageKey.AiSidebarWidth, curr)
                return curr
            })
        }

        window.addEventListener('mousemove', handleMouseMove)
        window.addEventListener('mouseup', handleMouseUp)
        return () => {
            window.removeEventListener('mousemove', handleMouseMove)
            window.removeEventListener('mouseup', handleMouseUp)
        }
    }, [isResizing])

    const handleClose = useCallback(() => setAiSidebarOpen(false), [setAiSidebarOpen])

    return (
        <aside
            className={`${s.aiSidebar} ${aiSidebarOpen ? s.open : s.closed} ${isResizing || !mounted ? s.noTransition : ''}`}
            style={{
                width: aiSidebarOpen ? width : 0,
            }}
        >
            {aiSidebarOpen && (
                <div
                    className={`${s.resizeHandle} ${isResizing ? s.resizing : ''}`}
                    onMouseDown={handleMouseDown}
                    title="拖拽调整 AI 侧边栏宽度"
                />
            )}
            <div
                className={s.panelContent}
                style={{
                    width,
                    minWidth: width,
                }}
            >
                <ErrorBoundary
                    title="AI 智能体渲染异常"
                    onClose={handleClose}
                >
                    <AiAgentPanel
                        settings={settings}
                        onUpdateSettings={onUpdateSettings}
                        onClose={handleClose}
                    />
                </ErrorBoundary>
            </div>
        </aside>
    )
}
