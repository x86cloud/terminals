import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'

export interface DropTargetInfo {
    sessionId?: string
    path?: string
    element: HTMLElement
}

export interface DragDropContextValue {
    activeTarget: DropTargetInfo | null
    isTargetActive: (sessionId?: string) => boolean
    clearActiveTarget: () => void
}

const DragDropContext = createContext<DragDropContextValue>({
    activeTarget: null,
    isTargetActive: () => false,
    clearActiveTarget: () => {},
})

/** 清除所有可能由 Wails 底层运行时注入的残留激活类 */
function cleanupWailsActiveClasses() {
    if (typeof document === 'undefined') return
    const activeElements = document.querySelectorAll(
        '.file-drop-target-active, .wails-drop-target-active, .dragOver, .drag-over'
    )
    activeElements.forEach((el) => {
        el.classList.remove('file-drop-target-active', 'wails-drop-target-active', 'dragOver', 'drag-over')
    })
}

export const DragDropProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [activeTarget, setActiveTarget] = useState<DropTargetInfo | null>(null)
    const activeTargetRef = useRef<DropTargetInfo | null>(null)
    activeTargetRef.current = activeTarget

    const clearActiveTarget = useCallback(() => {
        if (activeTargetRef.current !== null) {
            setActiveTarget(null)
        }
        cleanupWailsActiveClasses()
    }, [])

    useEffect(() => {
        const handleDragOver = (e: DragEvent) => {
            // 仅对携带文件的拖拽进行响应
            const types = e.dataTransfer?.types
            const isFileDrag = types ? Array.from(types).includes('Files') : false
            if (!isFileDrag) return

            const x = e.clientX
            const y = e.clientY

            // 根据当前坐标查找最邻近的有效拖放容器
            const hoveredEl = document.elementFromPoint(x, y)
            const dropContainer = hoveredEl?.closest<HTMLElement>('[data-file-drop-target="true"]')

            if (dropContainer) {
                const sessionId = dropContainer.dataset.sessionId || dropContainer.dataset.session
                const path = dropContainer.dataset.path

                const current = activeTargetRef.current
                if (!current || current.element !== dropContainer || current.sessionId !== sessionId) {
                    setActiveTarget({
                        sessionId,
                        path,
                        element: dropContainer,
                    })
                }
            } else {
                // 光标离开有效拖放区（例如移入侧边栏、标题栏、空白区等）
                if (activeTargetRef.current !== null) {
                    setActiveTarget(null)
                }
                cleanupWailsActiveClasses()
            }
        }

        const handleDragLeave = (e: DragEvent) => {
            // 当拖拽离开窗口视口边界或离开整个 document 时触发重置
            const { clientX, clientY } = e
            const { innerWidth, innerHeight } = window
            if (clientX <= 0 || clientY <= 0 || clientX >= innerWidth || clientY >= innerHeight || !e.relatedTarget) {
                clearActiveTarget()
            }
        }

        const handleDropOrEnd = () => {
            clearActiveTarget()
        }

        window.addEventListener('dragover', handleDragOver, { capture: true })
        window.addEventListener('dragleave', handleDragLeave, { capture: true })
        window.addEventListener('drop', handleDropOrEnd, { capture: true })
        window.addEventListener('dragend', handleDropOrEnd, { capture: true })

        return () => {
            window.removeEventListener('dragover', handleDragOver, { capture: true })
            window.removeEventListener('dragleave', handleDragLeave, { capture: true })
            window.removeEventListener('drop', handleDropOrEnd, { capture: true })
            window.removeEventListener('dragend', handleDropOrEnd, { capture: true })
        }
    }, [clearActiveTarget])

    const isTargetActive = useCallback(
        (sessionId?: string) => {
            if (!activeTarget) return false
            if (!sessionId) return true
            return activeTarget.sessionId === sessionId
        },
        [activeTarget]
    )

    return (
        <DragDropContext.Provider value={{ activeTarget, isTargetActive, clearActiveTarget }}>
            {children}
        </DragDropContext.Provider>
    )
}

/** 获取特定会话的拖放激活状态 */
export function useFileDropActive(sessionId?: string): boolean {
    const { isTargetActive } = useContext(DragDropContext)
    return isTargetActive(sessionId)
}

export function useDragDrop(): DragDropContextValue {
    return useContext(DragDropContext)
}
