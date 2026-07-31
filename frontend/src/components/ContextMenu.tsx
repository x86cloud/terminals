import React, {useEffect, useLayoutEffect, useRef, useState} from 'react'
import Icon, {IconName} from './Icon'

export interface MenuItem {
    key: string
    label: string
    icon?: IconName
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

export const closedMenu: MenuState = {open: false, x: 0, y: 0, items: []}

export default function ContextMenu({state, onClose}: { state: MenuState; onClose: () => void }) {
    const ref = useRef<HTMLDivElement>(null)
    const [pos, setPos] = useState({x: state.x, y: state.y})

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
        setPos({x: Math.max(4, x), y: Math.max(4, y)})
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

    return (
        <div
            ref={ref}
            className="context-menu"
            style={{left: pos.x, top: pos.y}}
            onMouseDown={(e) => e.stopPropagation()}
            onContextMenu={(e) => e.preventDefault()}
        >
            {state.items.map((item) =>
                item.divider ? (
                    <div key={item.key} className="menu-divider"/>
                ) : (
                    <button
                        key={item.key}
                        className={`menu-item${item.danger ? ' danger' : ''}`}
                        disabled={item.disabled}
                        onClick={() => {
                            onClose()
                            item.onClick?.()
                        }}
                    >
                        <span className="menu-icon">{item.icon && <Icon name={item.icon} size={15}/>}</span>
                        {item.label}
                    </button>
                )
            )}
        </div>
    )
}
