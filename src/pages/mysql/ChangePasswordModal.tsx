import React, { useState } from 'react'
import { Modal, Form, Input, Space, Button, Alert, Tag } from 'antd'
import { KeyRound, Dices } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { API } from '@/api'
import { errorMessage } from '@/utils'

interface Props {
    open: boolean
    sessionId: string
    user: string
    host: string
    onClose: () => void
    onSuccess: () => void
}

export const ChangePasswordModal: React.FC<Props> = ({
    open,
    sessionId,
    user,
    host,
    onClose,
    onSuccess,
}) => {
    const { t } = useTranslation(['db', 'common'])
    const [form] = Form.useForm()
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')

    const generateRandomPassword = () => {
        const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%^&*'
        let pwd = ''
        for (let i = 0; i < 16; i++) {
            pwd += chars.charAt(Math.floor(Math.random() * chars.length))
        }
        form.setFieldsValue({ password: pwd, confirmPassword: pwd })
    }

    const handleOk = async () => {
        try {
            const values = await form.validateFields()
            if (values.password !== values.confirmPassword) {
                setError(t('db:mysql.changePassword.mismatch'))
                return
            }
            setBusy(true)
            setError('')

            await API.mysqlChangeUserPassword(sessionId, user, host, values.password)

            form.resetFields()
            onSuccess()
            onClose()
        } catch (e: any) {
            if (e?.errorFields) return
            setError(errorMessage(e))
        } finally {
            setBusy(false)
        }
    }

    return (
        <Modal
            closable={false}
            title={
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <KeyRound size={18} color="var(--accent)" />
                    <span style={{ fontWeight: 600 }}>{t('db:mysql.changePassword.title')}</span>
                    <Tag color="processing" style={{ margin: 0, fontFamily: 'var(--font-mono)' }}>
                        {user}@{host}
                    </Tag>
                </div>
            }
            open={open}
            onCancel={onClose}
            onOk={handleOk}
            confirmLoading={busy}
            okText={t('db:mysql.changePassword.ok')}
            cancelText={t('common:cancel')}
            width={480}
            destroyOnHidden
        >
            {error && (
                <Alert
                    type="error"
                    title={t('db:mysql.changePassword.fail')}
                    description={error}
                    showIcon
                    style={{ marginBottom: 16 }}
                />
            )}

            <Form form={form} layout="vertical">
                <Form.Item
                    name="password"
                    label={t('db:mysql.changePassword.newPassword')}
                    rules={[{ required: true, message: t('db:mysql.changePassword.newPasswordRequired') }]}
                >
                    <Space.Compact style={{ width: '100%' }}>
                        <Input.Password
                            prefix={<KeyRound size={14} color="var(--text-dim)" />}
                            placeholder={t('db:mysql.changePassword.newPasswordPlaceholder')}
                            autoFocus
                        />
                        <Button icon={<Dices size={14} />} onClick={generateRandomPassword} title={t('db:mysql.changePassword.randomGenTitle')}>
                            {t('db:mysql.changePassword.randomGen')}
                        </Button>
                    </Space.Compact>
                </Form.Item>

                <Form.Item
                    name="confirmPassword"
                    label={t('db:mysql.changePassword.confirmPassword')}
                    dependencies={['password']}
                    rules={[
                        { required: true, message: t('db:mysql.changePassword.confirmPasswordRequired') },
                        ({ getFieldValue }) => ({
                            validator(_, value) {
                                if (!value || getFieldValue('password') === value) {
                                    return Promise.resolve()
                                }
                                return Promise.reject(new Error(t('db:mysql.changePassword.mismatch')))
                            },
                        }),
                    ]}
                >
                    <Input.Password
                        prefix={<KeyRound size={14} color="var(--text-dim)" />}
                        placeholder={t('db:mysql.changePassword.confirmPasswordPlaceholder')}
                    />
                </Form.Item>
            </Form>
        </Modal>
    )
}

export default ChangePasswordModal
