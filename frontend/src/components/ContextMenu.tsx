import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
    Plug,
    Edit2,
    Folder,
    FolderPlus,
    FolderOpen,
    FolderUp,
    Trash2,
    Download,
    Upload,
    Copy,
    ClipboardPaste,
    RotateCw,
    FileText,
    FilePlus,
    Bot,
    Search,
    Eraser,
    Settings,
    Terminal,
    Database,
    Play,
    Power,
} from 'lucide-react'
import g from '@/styles/global.module.less'

export interface MenuItem {
    key: string
    label: string
    icon?: React.ReactNode
    danger?: boolean
    disabled?: boolean
    divider?: boolean
    onClick?: () => void
}

export interface MenuState {
    open: boolean
    x: number
    y: number
    items: MenuItem[]
}

export const closedMenu: MenuState = { open: false, x: 0, y: 0, items: [] }

const iconSize = 14

function renderMenuIcon(icon?: React.ReactNode): React.ReactNode {
    if (!icon) return null
    if (typeof icon === 'string') {
        switch (icon.toLowerCase()) {
            case 'plug':
            case 'connect':
                return <Plug size={iconSize} />
            case 'edit':
            case 'pencil':
            case 'rename':
                return <Edit2 size={iconSize} />
            case 'folder':
            case 'dir':
                return <Folder size={iconSize} />
            case 'open':
                return <FolderOpen size={iconSize} />
            case 'newfolder':
            case 'mkdir':
                return <FolderPlus size={iconSize} />
            case 'uploaddir':
                return <FolderUp size={iconSize} />
            case 'newfile':
                return <FilePlus size={iconSize} />
            case 'trash':
            case 'delete':
                return <Trash2 size={iconSize} />
            case 'download':
                return <Download size={iconSize} />
            case 'upload':
                return <Upload size={iconSize} />
            case 'copy':
                return <Copy size={iconSize} />
            case 'paste':
                return <ClipboardPaste size={iconSize} />
            case 'refresh':
            case 'reload':
                return <RotateCw size={iconSize} />
            case 'file':
            case 'filetext':
                return <FileText size={iconSize} />
            case 'bot':
            case 'ai':
            case 'askai':
                return <Bot size={iconSize} />
            case 'search':
                return <Search size={iconSize} />
            case 'clear':
                return <Eraser size={iconSize} />
            case 'settings':
                return <Settings size={iconSize} />
            case 'terminal':
                return <Terminal size={iconSize} />
            case 'database':
                return <Database size={iconSize} />
            case 'play':
                return <Play size={iconSize} />
            case 'power':
                return <Power size={iconSize} />
            default:
                return null
        }
    }
    return icon
}

export default function ContextMenu({
    state,
    onClose,
}: {
    state: MenuState
    onClose: () => void
}) {
    const menuRef = useRef<HTMLDivElement>(null)
    const [pos, setPos] = useState({ x: state.x, y: state.y })

    useLayoutEffect(() => {
        if (!state.open || !menuRef.current) return
        const rect = menuRef.current.getBoundingClientRect()
        const viewportWidth = window.innerWidth
        const viewportHeight = window.innerHeight
        const margin = 6

        let targetX = state.x
        let targetY = state.y

        if (targetX + rect.width > viewportWidth - margin) {
            targetX = Math.max(margin, viewportWidth - rect.width - margin)
        }
        if (targetY + rect.height > viewportHeight - margin) {
            targetY = Math.max(margin, viewportHeight - rect.height - margin)
        }

        targetX = Math.max(margin, targetX)
        targetY = Math.max(margin, targetY)

        setPos({ x: targetX, y: targetY })
    }, [state.open, state.x, state.y, state.items])

    useEffect(() => {
        if (!state.open) return

        const handlePointerDown = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                onClose()
            }
        }

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose()
            }
        }

        const handleBlur = () => {
            onClose()
        }

        document.addEventListener('mousedown', handlePointerDown, true)
        document.addEventListener('contextmenu', handlePointerDown, true)
        window.addEventListener('keydown', handleKeyDown)
        window.addEventListener('resize', onClose)
        window.addEventListener('blur', handleBlur)

        return () => {
            document.removeEventListener('mousedown', handlePointerDown, true)
            document.removeEventListener('contextmenu', handlePointerDown, true)
            window.removeEventListener('keydown', handleKeyDown)
            window.removeEventListener('resize', onClose)
            window.removeEventListener('blur', handleBlur)
        }
    }, [state.open, onClose])

    if (!state.open || !state.items || state.items.length === 0) return null

    return createPortal(
        <div
            ref={menuRef}
            className={g.contextMenu}
            style={{
                left: pos.x,
                top: pos.y,
                zIndex: 10000,
            }}
            onContextMenu={(e) => {
                e.preventDefault()
                e.stopPropagation()
            }}
        >
            {state.items.map((item, idx) => {
                if (item.divider) {
                    return <div key={item.key || `d-${idx}`} className={g.menuDivider} />
                }
                return (
                    <button
                        key={item.key || `item-${idx}`}
                        className={`${g.menuItem} ${item.danger ? g.danger : ''}`}
                        disabled={item.disabled}
                        onClick={(e) => {
                            e.stopPropagation()
                            onClose()
                            item.onClick?.()
                        }}
                    >
                        {item.icon && <span className={g.menuIcon}>{renderMenuIcon(item.icon)}</span>}
                        <span>{item.label}</span>
                    </button>
                )
            })}
        </div>,
        document.body
    )
}
