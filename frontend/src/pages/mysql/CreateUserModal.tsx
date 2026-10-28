import React, { useState, useMemo } from 'react'
import { Modal, Form, Input, Select, Switch, Segmented, Space, Button, Alert } from 'antd'
import { KeyRound, Shield, Dices, Eye } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { API } from '@/api'
import { errorMessage } from '@/utils'

interface Props {
    open: boolean
    sessionId: string
    onClose: () => void
    onSuccess: (newUser: string, host: string) => void
}

export const CreateUserModal: React.FC<Props> = ({ open, sessionId, onClose, onSuccess }) => {
    const { t } = useTranslation(['db', 'common'])
    const [form] = Form.useForm()
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')

    // Form states for SQL preview
    const [user, setUser] = useState('')
    const [host, setHost] = useState('%')
    const [password, setPassword] = useState('')
    const [locked, setLocked] = useState(false)
    const [initialPriv, setInitialPriv] = useState<'none' | 'readonly' | 'readwrite' | 'all'>('none')

    const hostPresets = useMemo(() => [
        { label: t('db:mysql.createUser.hostPresetAll'), value: '%' },
        { label: t('db:mysql.createUser.hostPresetLocal'), value: 'localhost' },
        { label: t('db:mysql.createUser.hostPresetLoopback'), value: '127.0.0.1' },
        { label: t('db:mysql.createUser.hostPresetLan1'), value: '192.168.%.%' },
        { label: t('db:mysql.createUser.hostPresetLan2'), value: '10.%.%.%' },
        { label: t('db:mysql.createUser.hostPresetLan3'), value: '172.16.%.%' },
    ], [t])

    const generateRandomPassword = () => {
        const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%^&*'
        let pwd = ''
        for (let i = 0; i < 16; i++) {
            pwd += chars.charAt(Math.floor(Math.random() * chars.length))
        }
        form.setFieldsValue({ password: pwd })
        setPassword(pwd)
    }

    const sqlPreview = useMemo(() => {
        const u = (user || 'username').replace(/'/g, "''")
        const h = (host || '%').replace(/'/g, "''")
        let sql = `CREATE USER '${u}'@'${h}'`
        if (password) {
            sql += ` IDENTIFIED BY '${password.replace(/'/g, "''")}'`
        }
        if (locked) {
            sql += ' ACCOUNT LOCK'
        }
        sql += ';'

        if (initialPriv === 'readonly') {
            sql += `\nGRANT SELECT, SHOW VIEW ON *.* TO '${u}'@'${h}';`
        } else if (initialPriv === 'readwrite') {
            sql += `\nGRANT SELECT, INSERT, UPDATE, DELETE, EXECUTE, SHOW VIEW ON *.* TO '${u}'@'${h}';`
        } else if (initialPriv === 'all') {
            sql += `\nGRANT ALL PRIVILEGES ON *.* TO '${u}'@'${h}' WITH GRANT OPTION;`
        }

        if (initialPriv !== 'none') {
            sql += '\nFLUSH PRIVILEGES;'
        }

        return sql
    }, [user, host, password, locked, initialPriv])

    const handleOk = async () => {
        try {
            const values = await form.validateFields()
            setBusy(true)
            setError('')

            const targetUser = values.user.trim()
            const targetHost = values.host.trim()

            // 1. Create User
            await API.mysqlCreateUser(
                sessionId,
                targetUser,
                targetHost,
                values.password || '',
                'caching_sha2_password',
                !!values.locked
            )

            // 2. Grant initial privs if selected
            if (initialPriv === 'readonly') {
                await API.mysqlGrantPrivileges(sessionId, targetUser, targetHost, '', '', ['SELECT', 'SHOW VIEW'], false)
            } else if (initialPriv === 'readwrite') {
                await API.mysqlGrantPrivileges(sessionId, targetUser, targetHost, '', '', ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'EXECUTE', 'SHOW VIEW'], false)
            } else if (initialPriv === 'all') {
                await API.mysqlGrantPrivileges(sessionId, targetUser, targetHost, '', '', ['ALL PRIVILEGES'], true)
            }

            form.resetFields()
            onSuccess(targetUser, targetHost)
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
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Shield size={18} color="var(--accent)" />
                    <span>{t('db:mysql.createUser.title')}</span>
                </div>
            }
            open={open}
            onCancel={onClose}
            onOk={handleOk}
            confirmLoading={busy}
            okText={t('db:mysql.createUser.ok')}
            cancelText={t('common:cancel')}
            width={580}
            destroyOnHidden
        >
            {error && (
                <Alert
                    type="error"
                    message={t('db:mysql.createUser.fail')}
                    description={error}
                    showIcon
                    style={{ marginBottom: 16 }}
                />
            )}

            <Form
                form={form}
                layout="vertical"
                initialValues={{ host: '%', locked: false, initialPriv: 'none' }}
                onValuesChange={(_, all) => {
                    if (all.user !== undefined) setUser(all.user)
                    if (all.host !== undefined) setHost(all.host)
                    if (all.password !== undefined) setPassword(all.password)
                    if (all.locked !== undefined) setLocked(all.locked)
                    if (all.initialPriv !== undefined) setInitialPriv(all.initialPriv)
                }}
            >
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
                    <Form.Item
                        name="user"
                        label={t('db:mysql.createUser.username')}
                        rules={[
                            { required: true, message: t('db:mysql.createUser.usernameRequired') },
                            { pattern: /^[a-zA-Z0-9_.-]+$/, message: t('db:mysql.createUser.usernamePattern') },
                        ]}
                    >
                        <Input placeholder={t('db:mysql.createUser.usernamePlaceholder')} autoFocus />
                    </Form.Item>

                    <Form.Item
                        name="host"
                        label={t('db:mysql.createUser.host')}
                        rules={[{ required: true, message: t('db:mysql.createUser.hostRequired') }]}
                    >
                        <Select
                            options={hostPresets}
                            showSearch
                            allowClear={false}
                            placeholder={t('db:mysql.createUser.hostPlaceholder')}
                        />
                    </Form.Item>
                </div>

                <Form.Item label={t('db:mysql.createUser.password')} style={{ marginBottom: 12 }}>
                    <Space.Compact style={{ width: '100%' }}>
                        <Form.Item name="password" noStyle>
                            <Input.Password
                                prefix={<KeyRound size={14} color="var(--text-dim)" />}
                                placeholder={t('db:mysql.createUser.passwordPlaceholder')}
                            />
                        </Form.Item>
                        <Button icon={<Dices size={14} />} onClick={generateRandomPassword} title={t('db:mysql.createUser.randomGenTitle')}>
                            {t('db:mysql.createUser.randomGen')}
                        </Button>
                    </Space.Compact>
                </Form.Item>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, padding: '8px 12px', background: 'var(--bg-2)', borderRadius: 6 }}>
                    <div>
                        <div style={{ fontSize: 13, fontWeight: 500 }}>{t('db:mysql.createUser.lockAccount')}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>{t('db:mysql.createUser.lockAccountDesc')}</div>
                    </div>
                    <Form.Item name="locked" valuePropName="checked" noStyle>
                        <Switch size="small" />
                    </Form.Item>
                </div>

                <Form.Item name="initialPriv" label={t('db:mysql.createUser.initialPriv')}>
                    <Segmented
                        block
                        value={initialPriv}
                        onChange={(v) => {
                            setInitialPriv(v as any)
                            form.setFieldsValue({ initialPriv: v })
                        }}
                        options={[
                            { label: t('db:mysql.createUser.privNone'), value: 'none' },
                            { label: t('db:mysql.createUser.privReadonly'), value: 'readonly' },
                            { label: t('db:mysql.createUser.privReadwrite'), value: 'readwrite' },
                            { label: t('db:mysql.createUser.privAll'), value: 'all' },
                        ]}
                    />
                </Form.Item>

                <div style={{ marginTop: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-dim)', marginBottom: 4 }}>
                        <Eye size={12} />
                        <span>{t('db:mysql.createUser.sqlPreview')}</span>
                    </div>
                    <pre
                        style={{
                            margin: 0,
                            padding: '8px 12px',
                            background: 'var(--bg-3)',
                            borderRadius: 6,
                            fontSize: 11.5,
                            fontFamily: 'var(--font-mono)',
                            color: 'var(--text)',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-all',
                            lineHeight: 1.5,
                        }}
                    >
                        {sqlPreview}
                    </pre>
                </div>
            </Form>
        </Modal>
    )
}

export default CreateUserModal
