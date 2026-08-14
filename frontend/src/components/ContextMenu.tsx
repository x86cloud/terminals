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
    Power
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

function renderMenuIcon(icon?: React.ReactNode): React.ReactNode {
    if (!icon) return null
    if (typeof icon === 'string') {
        const size = 14
        switch (icon.toLowerCase()) {
            case 'plug':
            case 'connect':
                return <Plug size={size} />
            case 'edit':
            case 'pencil':
            case 'rename':
                return <Edit2 size={size} />
            case 'folder':
            case 'dir':
                return <Folder size={size} />
            case 'open':
                return <FolderOpen size={size} />
            case 'newfolder':
            case 'mkdir':
                return <FolderPlus size={size} />
            case 'uploaddir':
                return <FolderUp size={size} />
            case 'newfile':
                return <FilePlus size={size} />
            case 'trash':
            case 'delete':
                return <Trash2 size={size} />
            case 'download':
                return <Download size={size} />
            case 'upload':
                return <Upload size={size} />
            case 'copy':
                return <Copy size={size} />
            case 'paste':
                return <ClipboardPaste size={size} />
            case 'refresh':
            case 'reload':
                return <RotateCw size={size} />
            case 'file':
            case 'filetext':
                return <FileText size={size} />
            case 'bot':
            case 'ai':
            case 'askai':
                return <Bot size={size} />
            case 'search':
                return <Search size={size} />
            case 'clear':
                return <Eraser size={size} />
            case 'settings':
                return <Settings size={size} />
            case 'terminal':
                return <Terminal size={size} />
            case 'database':
                return <Database size={size} />
            case 'play':
                return <Play size={size} />
            case 'power':
                return <Power size={size} />
            default:
                return null
        }
    }
    return icon
}

export default function ContextMenu({ state, onClose }: { state: MenuState; onClose: () => void }) {
    const ref = useRef<HTMLDivElement>(null)
    const [pos, setPos] = useState({ x: state.x, y: state.y })

    useLayoutEffect(() => {
        if (!state.open) return
        const el = ref.current
        let x = state.x
        let y = state.y
        if (el) {
            const rect = el.getBoundingClientRect()
            if (x + rect.width > window.innerWidth - 8) x = window.innerWidth - rect.width - 8
            if (y + rect.height > window.innerHeight - 8) y = window.innerHeight - rect.height - 8
        }
        setPos({ x: Math.max(4, x), y: Math.max(4, y) })
    }, [state.open, state.x, state.y])

    useEffect(() => {
        if (!state.open) return
        const close = () => onClose()
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose()
        }
        window.addEventListener('mousedown', close)
        window.addEventListener('resize', close)
        window.addEventListener('keydown', onKey)
        return () => {
            window.removeEventListener('mousedown', close)
            window.removeEventListener('resize', close)
            window.removeEventListener('keydown', onKey)
        }
    }, [state.open, onClose])

    if (!state.open) return null

    const menuContent = (
        <div
            ref={ref}
            className={g.contextMenu}
            style={{ left: pos.x, top: pos.y }}
            onMouseDown={(e) => e.stopPropagation()}
            onContextMenu={(e) => e.preventDefault()}
        >
            {state.items.map((item) =>
                item.divider ? (
                    <div key={item.key} className={g.menuDivider} />
                ) : (
                    <button
                        key={item.key}
                        className={`${g.menuItem}${item.danger ? ' ' + g.danger : ''}`}
                        disabled={item.disabled}
                        onClick={() => {
                            onClose()
                            item.onClick?.()
                        }}
                    >
                        {item.icon && <span className={g.menuIcon}>{renderMenuIcon(item.icon)}</span>}
                        <span>{item.label}</span>
                    </button>
                )
            )}
        </div>
    )

    return typeof document !== 'undefined' ? createPortal(menuContent, document.body) : menuContent
}
