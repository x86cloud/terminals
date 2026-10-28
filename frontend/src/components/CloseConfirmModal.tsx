import { useState } from 'react'
import { Modal, Radio, Checkbox, Space } from 'antd'
import { Minimize2, Power } from 'lucide-react'
import { useTranslation } from 'react-i18next'

export interface CloseConfirmModalProps {
    open: boolean
    onConfirm: (action: 'minimize' | 'quit', remember: boolean) => void
    onCancel: () => void
    afterClose?: () => void
}

export default function CloseConfirmModal({
    open,
    onConfirm,
    onCancel,
    afterClose,
}: CloseConfirmModalProps) {
    const { t } = useTranslation(['titlebar', 'common'])
    const [action, setAction] = useState<'minimize' | 'quit'>('minimize')
    const [remember, setRemember] = useState(false)

    const handleOk = () => {
        onConfirm(action, remember)
    }

    const handleAfterClose = () => {
        setAction('minimize')
        setRemember(false)
        afterClose?.()
    }

    return (
        <Modal
            open={open}
            onOk={handleOk}
            onCancel={onCancel}
            afterClose={handleAfterClose}
            okText={t('common:ok')}
            cancelText={t('common:cancel')}
            width={440}
            centered
            closable={false}
            destroyOnHidden
        >
            <div style={{ padding: '8px 0 4px' }}>
                <Radio.Group
                    value={action}
                    onChange={(e) => setAction(e.target.value)}
                    style={{ width: '100%', marginTop: 14 }}
                >
                    <Space orientation="vertical" size={12} style={{ width: '100%' }}>
                        <div
                            onClick={() => setAction('minimize')}
                            style={{
                                display: 'flex',
                                alignItems: 'flex-start',
                                gap: 10,
                                padding: '10px 12px',
                                borderRadius: 8,
                                border: `1px solid ${action === 'minimize' ? 'var(--primary, #2b90ee)' : 'var(--border)'}`,
                                background: action === 'minimize' ? 'rgba(43, 144, 238, 0.06)' : 'var(--bg-2)',
                                cursor: 'pointer',
                                transition: 'all 0.2s ease',
                            }}
                        >
                            <Radio value="minimize" style={{ marginTop: 2 }} />
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, fontSize: 13 }}>
                                    <Minimize2 size={14} style={{ color: 'var(--primary, #2b90ee)' }} />
                                    <span>{t('titlebar:closeConfirm.minimize')}</span>
                                </div>
                            </div>
                        </div>

                        <div
                            onClick={() => setAction('quit')}
                            style={{
                                display: 'flex',
                                alignItems: 'flex-start',
                                gap: 10,
                                padding: '10px 12px',
                                borderRadius: 8,
                                border: `1px solid ${action === 'quit' ? 'var(--primary, #2b90ee)' : 'var(--border)'}`,
                                background: action === 'quit' ? 'rgba(43, 144, 238, 0.06)' : 'var(--bg-2)',
                                cursor: 'pointer',
                                transition: 'all 0.2s ease',
                            }}
                        >
                            <Radio value="quit" style={{ marginTop: 2 }} />
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, fontSize: 13 }}>
                                    <Power size={14} style={{ color: 'var(--danger, #ff4d4f)' }} />
                                    <span>{t('titlebar:closeConfirm.quit')}</span>
                                </div>
                            </div>
                        </div>
                    </Space>
                </Radio.Group>

                <div style={{ marginTop: 16, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                    <Checkbox
                        checked={remember}
                        onChange={(e) => setRemember(e.target.checked)}
                    >
                        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                            {t('titlebar:closeConfirm.remember')}
                        </span>
                    </Checkbox>
                </div>
            </div>
        </Modal>
    )
}
