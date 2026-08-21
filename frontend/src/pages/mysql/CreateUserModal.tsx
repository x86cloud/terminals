import React, { useState, useMemo } from 'react'
import { Modal, Form, Input, Select, Switch, Segmented, Space, Button, Alert } from 'antd'
import { KeyRound, Shield, Dices, Eye } from 'lucide-react'
import { API } from '@/api'
import { errorMessage } from '@/utils'

interface Props {
    open: boolean
    sessionId: string
    onClose: () => void
    onSuccess: (newUser: string, host: string) => void
}

const HOST_PRESETS = [
    { label: '% (允许所有远程主机连接)', value: '%' },
    { label: 'localhost (仅限本机连接)', value: 'localhost' },
    { label: '127.0.0.1 (本地回环)', value: '127.0.0.1' },
    { label: '192.168.%.% (内网网段)', value: '192.168.%.%' },
    { label: '10.%.%.% (内网网段)', value: '10.%.%.%' },
    { label: '172.16.%.% (内网网段)', value: '172.16.%.%' },
]

export const CreateUserModal: React.FC<Props> = ({ open, sessionId, onClose, onSuccess }) => {
    const [form] = Form.useForm()
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')

    // Form states for SQL preview
    const [user, setUser] = useState('')
    const [host, setHost] = useState('%')
    const [password, setPassword] = useState('')
    const [locked, setLocked] = useState(false)
    const [initialPriv, setInitialPriv] = useState<'none' | 'readonly' | 'readwrite' | 'all'>('none')

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
            sql += ` ACCOUNT LOCK`
        }
        sql += `;\n`

        if (initialPriv === 'readonly') {
            sql += `GRANT SELECT, SHOW VIEW ON *.* TO '${u}'@'${h}';\n`
        } else if (initialPriv === 'readwrite') {
            sql += `GRANT SELECT, INSERT, UPDATE, DELETE, EXECUTE, SHOW VIEW ON *.* TO '${u}'@'${h}';\n`
        } else if (initialPriv === 'all') {
            sql += `GRANT ALL PRIVILEGES ON *.* TO '${u}'@'${h}' WITH GRANT OPTION;\n`
        }
        sql += `FLUSH PRIVILEGES;`
        return sql
    }, [user, host, password, locked, initialPriv])

    const handleOk = async () => {
        try {
            const values = await form.validateFields()
            setBusy(true)
            setError('')

            const targetUser = values.user.trim()
            const targetHost = (values.host || '%').trim()
            const targetPassword = values.password || ''
            const isLocked = !!values.locked

            // 1. Create User
            await API.mysqlCreateUser(sessionId, targetUser, targetHost, targetPassword, '', isLocked)

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
                    <span>新建 MySQL 用户</span>
                </div>
            }
            open={open}
            onCancel={onClose}
            onOk={handleOk}
            confirmLoading={busy}
            okText="创建用户"
            cancelText="取消"
            width={580}
            destroyOnClose
        >
            {error && (
                <Alert
                    type="error"
                    message="创建失败"
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
                        label="用户名"
                        rules={[
                            { required: true, message: '请输入用户名' },
                            { pattern: /^[a-zA-Z0-9_.-]+$/, message: '用户名仅支持字母、数字、下划线、减号与点' },
                        ]}
                    >
                        <Input placeholder="如 app_user / dev_rw" autoFocus />
                    </Form.Item>

                    <Form.Item
                        name="host"
                        label="允许连接的主机 (Host)"
                        rules={[{ required: true, message: '请选择或输入 Host' }]}
                    >
                        <Select
                            options={HOST_PRESETS}
                            showSearch
                            allowClear={false}
                            placeholder="如 % 或 localhost"
                        />
                    </Form.Item>
                </div>

                <Form.Item label="登录密码" style={{ marginBottom: 12 }}>
                    <Space.Compact style={{ width: '100%' }}>
                        <Form.Item name="password" noStyle>
                            <Input.Password
                                prefix={<KeyRound size={14} color="var(--text-dim)" />}
                                placeholder="输入密码（留空则为无密码登录）"
                            />
                        </Form.Item>
                        <Button icon={<Dices size={14} />} onClick={generateRandomPassword} title="生成随机强密码">
                            随机生成
                        </Button>
                    </Space.Compact>
                </Form.Item>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, padding: '8px 12px', background: 'var(--bg-2)', borderRadius: 6 }}>
                    <div>
                        <div style={{ fontSize: 13, fontWeight: 500 }}>锁定账户 (ACCOUNT LOCK)</div>
                        <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>锁定后该用户将暂时无法连接登录</div>
                    </div>
                    <Form.Item name="locked" valuePropName="checked" noStyle>
                        <Switch size="small" />
                    </Form.Item>
                </div>

                <Form.Item name="initialPriv" label="初始权限预设">
                    <Segmented
                        block
                        value={initialPriv}
                        onChange={(v) => {
                            setInitialPriv(v as any)
                            form.setFieldsValue({ initialPriv: v })
                        }}
                        options={[
                            { label: '暂不关联', value: 'none' },
                            { label: '🔍 全局只读', value: 'readonly' },
                            { label: '✏️ 全局读写', value: 'readwrite' },
                            { label: '👑 全部权限', value: 'all' },
                        ]}
                    />
                </Form.Item>

                <div style={{ marginTop: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-dim)', marginBottom: 4 }}>
                        <Eye size={12} />
                        <span>实时 SQL 预览</span>
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
