import React, { useEffect, useLayoutEffect, useRef } from 'react'
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

const iconSize = 13

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
    const ref = useRef<HTMLDivElement>(null)

    useLayoutEffect(() => {
        if (!state.open || !ref.current) return
        const el = ref.current
        const rect = el.getBoundingClientRect()
        let x = state.x
        let y = state.y
        if (x + rect.width > window.innerWidth - 6) {
            x = window.innerWidth - rect.width - 6
        }
        if (y + rect.height > window.innerHeight - 6) {
            y = window.innerHeight - rect.height - 6
        }
        el.style.left = `${Math.max(4, x)}px`
        el.style.top = `${Math.max(4, y)}px`
        el.style.visibility = 'visible'
    }, [state.open, state.x, state.y, state.items])

    useEffect(() => {
        if (!state.open) return
        const onMouseDown = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                onClose()
            }
        }
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose()
        }
        window.addEventListener('mousedown', onMouseDown)
        window.addEventListener('resize', onClose)
        window.addEventListener('keydown', onKey)
        return () => {
            window.removeEventListener('mousedown', onMouseDown)
            window.removeEventListener('resize', onClose)
            window.removeEventListener('keydown', onKey)
        }
    }, [state.open, onClose])

    if (!state.open || !state.items || state.items.length === 0) return null

    const menuContent = (
        <div
            ref={ref}
            className={g.contextMenu}
            style={{
                left: state.x,
                top: state.y,
                visibility: 'hidden',
            }}
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
                        {item.icon && (
                            <span className={g.menuIcon}>
                                {renderMenuIcon(item.icon)}
                            </span>
                        )}
                        <span>{item.label}</span>
                    </button>
                )
            )}
        </div>
    )

    return typeof document !== 'undefined'
        ? createPortal(menuContent, document.body)
        : menuContent
}
