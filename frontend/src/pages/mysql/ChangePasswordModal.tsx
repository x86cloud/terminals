import React, { useState } from 'react'
import { Modal, Form, Input, Space, Button, Alert, Tag } from 'antd'
import { KeyRound, Dices } from 'lucide-react'
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
                setError('两次输入的密码不一致')
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
                    <span style={{ fontWeight: 600 }}>修改用户登录密码</span>
                    <Tag color="processing" style={{ margin: 0, fontFamily: 'var(--font-mono)' }}>
                        {user}@{host}
                    </Tag>
                </div>
            }
            open={open}
            onCancel={onClose}
            onOk={handleOk}
            confirmLoading={busy}
            okText="确认修改密码"
            cancelText="取消"
            width={480}
            destroyOnClose
        >
            {error && (
                <Alert
                    type="error"
                    message="修改密码失败"
                    description={error}
                    showIcon
                    style={{ marginBottom: 16 }}
                />
            )}

            <Form form={form} layout="vertical">
                <Form.Item
                    name="password"
                    label="新密码"
                    rules={[{ required: true, message: '请输入新密码' }]}
                >
                    <Space.Compact style={{ width: '100%' }}>
                        <Input.Password
                            prefix={<KeyRound size={14} color="var(--text-dim)" />}
                            placeholder="输入新密码"
                            autoFocus
                        />
                        <Button icon={<Dices size={14} />} onClick={generateRandomPassword} title="生成随机强密码">
                            随机生成
                        </Button>
                    </Space.Compact>
                </Form.Item>

                <Form.Item
                    name="confirmPassword"
                    label="确认新密码"
                    dependencies={['password']}
                    rules={[
                        { required: true, message: '请再次输入新密码' },
                        ({ getFieldValue }) => ({
                            validator(_, value) {
                                if (!value || getFieldValue('password') === value) {
                                    return Promise.resolve()
                                }
                                return Promise.reject(new Error('两次输入的密码不一致'))
                            },
                        }),
                    ]}
                >
                    <Input.Password
                        prefix={<KeyRound size={14} color="var(--text-dim)" />}
                        placeholder="请再次输入新密码"
                    />
                </Form.Item>
            </Form>
        </Modal>
    )
}

export default ChangePasswordModal
