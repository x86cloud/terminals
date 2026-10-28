import React, { useEffect, useRef, useState } from 'react'
import { Modal as AntdModal, Input, Button } from 'antd'
import { useTranslation } from 'react-i18next'

interface BaseProps {
    open: boolean
    title: React.ReactNode
    onClose: () => void
    children?: React.ReactNode
    footer?: React.ReactNode
    width?: number | string
}

export function Modal({ open, title, onClose, children, footer, width = 480 }: BaseProps) {
    return (
        <AntdModal
            open={open}
            title={title}
            onCancel={onClose}
            width={width}
            footer={footer !== undefined ? footer : null}
            destroyOnHidden
            centered
        >
            <div style={{ paddingTop: 8 }}>{children}</div>
        </AntdModal>
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
    const { t } = useTranslation('common')
    const [value, setValue] = useState(state.value)
    const inputRef = useRef<any>(null)

    useEffect(() => {
        setValue(state.value)
        if (state.open) {
            const timer = window.setTimeout(() => {
                inputRef.current?.focus({ cursor: 'all' })
            }, 50)
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
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
                    <Button onClick={onCancel}>{t('cancel')}</Button>
                    <Button type="primary" danger={state.danger} onClick={submit}>
                        {state.confirmText || t('ok')}
                    </Button>
                </div>
            }
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 13, opacity: 0.85 }}>{state.label || t('name')}</span>
                <Input
                    ref={inputRef}
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    onPressEnter={submit}
                />
            </div>
        </Modal>
    )
}

export interface ConfirmState {
    open: boolean
    title: string
    message: string
    danger?: boolean
    confirmText?: string
    cancelText?: string
    onConfirm?: () => void
}

export function ConfirmModal({ state, onCancel }: { state: ConfirmState; onCancel: () => void }) {
    const { t } = useTranslation('common')

    return (
        <Modal
            open={state.open}
            title={state.title}
            onClose={onCancel}
            footer={
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
                    <Button onClick={onCancel}>{state.cancelText || t('cancel')}</Button>
                    <Button
                        type="primary"
                        danger={state.danger}
                        onClick={() => state.onConfirm?.()}
                    >
                        {state.confirmText || t('ok')}
                    </Button>
                </div>
            }
        >
            <p style={{ margin: '8px 0', fontSize: 14, lineHeight: 1.6 }}>{state.message}</p>
        </Modal>
    )
}
