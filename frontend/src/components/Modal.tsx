import React, {useEffect, useRef, useState} from 'react'
import g from '@/styles/global.module.less'

interface BaseProps {
    open: boolean
    title: string
    onClose: () => void
    children?: React.ReactNode
    footer?: React.ReactNode
    width?: number
}

export function Modal({open, title, onClose, children, footer, width = 460}: BaseProps) {
    useEffect(() => {
        if (!open) return
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose()
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [open, onClose])

    if (!open) return null
    return (
        <div className={g.modalMask} onMouseDown={onClose}>
            <div className={g.modal} style={{width}} onMouseDown={(e) => e.stopPropagation()}>
                <div className={g.modalHead}>
                    <span>{title}</span>
                    <button className={g.iconBtn} onClick={onClose} title="关闭">✕</button>
                </div>
                <div className={g.modalBody}>{children}</div>
                {footer && <div className={g.modalFoot}>{footer}</div>}
            </div>
        </div>
    )
}

export interface PromptState {
    open: boolean
    title: string
    label?: string
    value: string
    confirmText?: string
    danger?: boolean
    onConfirm?: (value: string) => void
}

export function PromptModal({
                                state,
                                onCancel,
                            }: {
    state: PromptState
    onCancel: () => void
}) {
    const [value, setValue] = useState(state.value)
    const inputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        setValue(state.value)
        if (state.open) {
            const timer = window.setTimeout(() => {
                inputRef.current?.focus()
                inputRef.current?.select()
            }, 30)
            return () => window.clearTimeout(timer)
        }
    }, [state.open, state.value])

    const submit = () => {
        if (!value.trim()) return
        state.onConfirm?.(value.trim())
    }

    return (
        <Modal
            open={state.open}
            title={state.title}
            onClose={onCancel}
            footer={
                <>
                    <button className={g.btn} onClick={onCancel}>取消</button>
                    <button className={`${g.btn} ${g.primary}`} onClick={submit}>{state.confirmText || '确定'}</button>
                </>
            }
        >
            <label className={g.field}>
                <span>{state.label || '名称'}</span>
                <input
                    ref={inputRef}
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') submit()
                    }}
                />
            </label>
        </Modal>
    )
}

export interface ConfirmState {
    open: boolean
    title: string
    message: string
    danger?: boolean
    onConfirm?: () => void
}

export function ConfirmModal({state, onCancel}: { state: ConfirmState; onCancel: () => void }) {
    return (
        <Modal
            open={state.open}
            title={state.title}
            onClose={onCancel}
            footer={
                <>
                    <button className={g.btn} onClick={onCancel}>取消</button>
                    <button
                        className={`${g.btn} ${state.danger ? g.danger : g.primary}`}
                        onClick={() => state.onConfirm?.()}
                    >
                        确定
                    </button>
                </>
            }
        >
            <p className={g.confirmText}>{state.message}</p>
        </Modal>
    )
}
