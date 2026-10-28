import { useState, useEffect } from 'react'
import { Table, Button, Tag, Input, Modal, Form, Checkbox, InputNumber, Popconfirm, Space, App } from 'antd'
import { UserPlus, Key, Shield, Trash2, RotateCw, Check, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { API } from '@/api'
import { PgRole } from './postgresTypes'
import pg from './RolesPanel.module.less'

export default function RolesPanel({
    serverId,
    dbName,
}: {
    serverId: string
    dbName: string
}) {
    const { t } = useTranslation(['db', 'common'])
    const { message } = App.useApp()
    const [roles, setRoles] = useState<PgRole[]>([])
    const [loading, setLoading] = useState(false)

    // 创建角色弹窗
    const [createModalOpen, setCreateModalOpen] = useState(false)
    const [createForm] = Form.useForm()

    // 修改密码弹窗
    const [pwdModalOpen, setPwdModalOpen] = useState(false)
    const [selectedRole, setSelectedRole] = useState<string>('')
    const [newPassword, setNewPassword] = useState('')

    // 授权弹窗
    const [grantModalOpen, setGrantModalOpen] = useState(false)
    const [grantRole, setGrantRole] = useState('')
    const [grantSchema, setGrantSchema] = useState('public')
    const [grantTable, setGrantTable] = useState('')
    const [grantPrivs, setGrantPrivs] = useState<string[]>(['SELECT', 'INSERT', 'UPDATE', 'DELETE'])

    const loadRoles = async () => {
        setLoading(true)
        try {
            const list = await API.postgresRoles(serverId)
            setRoles(list || [])
        } catch (e: any) {
            message.error(t('postgres.loadRoleFailed', { error: e.message || e }))
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        loadRoles()
    }, [serverId])

    const handleCreateRole = async () => {
        try {
            const vals = await createForm.validateFields()
            await API.postgresCreateRole(
                serverId,
                vals.name,
                vals.password || '',
                !!vals.super,
                !!vals.canLogin,
                !!vals.createDb,
                !!vals.createRole,
                vals.connLimit || -1
            )
            setCreateModalOpen(false)
            createForm.resetFields()
            loadRoles()
        } catch (e: any) {
            message.error(t('postgres.roles.createFail', { error: e.message || e }))
        }
    }

    const handleChangePassword = async () => {
        if (!newPassword.trim()) {
            message.warning(t('postgres.roles.newPwdReq'))
            return
        }
        try {
            await API.postgresUpdateRolePassword(serverId, selectedRole, newPassword.trim())
            setPwdModalOpen(false)
            setNewPassword('')
        } catch (e: any) {
            message.error(t('postgres.roles.updatePwdFail', { error: e.message || e }))
        }
    }

    const handleDropRole = async (roleName: string) => {
        try {
            await API.postgresDropRole(serverId, roleName)
            loadRoles()
        } catch (e: any) {
            message.error(t('postgres.roles.dropFail', { error: e.message || e }))
        }
    }

    const handleGrant = async (isGrant: boolean) => {
        if (grantPrivs.length === 0) {
            message.warning(t('postgres.roles.grantPrivReq'))
            return
        }
        try {
            await API.postgresGrantPrivileges(
                serverId,
                dbName,
                grantRole,
                grantSchema,
                grantTable,
                grantPrivs.join(', '),
                isGrant
            )
            setGrantModalOpen(false)
        } catch (e: any) {
            message.error(t('postgres.roles.opFail', { error: e.message || e }))
        }
    }

    return (
        <div className={pg.rolesWrap}>
            <div className={pg.headBar}>
                <div>
                    <span style={{ fontSize: 15, fontWeight: 700 }}>{t('postgres.roles.title')}</span>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                        {t('postgres.roles.subtitle')}
                    </div>
                </div>

                <Space size={8}>
                    <Button
                        type="primary"
                        size="small"
                        icon={<UserPlus size={14} />}
                        onClick={() => setCreateModalOpen(true)}
                    >
                        {t('postgres.roles.createRole')}
                    </Button>
                    <Button
                        size="small"
                        icon={<RotateCw size={13} />}
                        loading={loading}
                        onClick={loadRoles}
                    />
                </Space>
            </div>

            <div className={pg.tableSection}>
                <Table
                    size="small"
                    dataSource={roles}
                    rowKey="name"
                    pagination={false}
                    columns={[
                        {
                            title: t('postgres.roles.colName'),
                            dataIndex: 'name',
                            render: (name, r: PgRole) => (
                                <span>
                                    <strong>{name}</strong>
                                    {r.super && <Tag color="red" style={{ marginLeft: 6 }}>SUPER</Tag>}
                                    {r.canLogin && <Tag color="green" style={{ marginLeft: 4 }}>LOGIN</Tag>}
                                </span>
                            ),
                        },
                        {
                            title: t('postgres.roles.colSuper'),
                            dataIndex: 'super',
                            render: (v) => (v ? <Check size={14} style={{ color: '#52c41a' }} /> : <X size={14} style={{ color: 'var(--text-faint)' }} />),
                        },
                        {
                            title: t('postgres.roles.colCanLogin'),
                            dataIndex: 'canLogin',
                            render: (v) => (v ? <Check size={14} style={{ color: '#52c41a' }} /> : <X size={14} style={{ color: 'var(--text-faint)' }} />),
                        },
                        {
                            title: t('postgres.roles.colCreateDb'),
                            dataIndex: 'createDb',
                            render: (v) => (v ? <Check size={14} style={{ color: '#52c41a' }} /> : <X size={14} style={{ color: 'var(--text-faint)' }} />),
                        },
                        {
                            title: t('postgres.roles.colCreateRole'),
                            dataIndex: 'createRole',
                            render: (v) => (v ? <Check size={14} style={{ color: '#52c41a' }} /> : <X size={14} style={{ color: 'var(--text-faint)' }} />),
                        },
                        {
                            title: t('postgres.roles.colConnLimit'),
                            dataIndex: 'connLimit',
                            render: (v) => (v < 0 ? t('postgres.roles.unlimited') : v),
                        },
                        {
                            title: t('postgres.roles.colValidUntil'),
                            dataIndex: 'validUntil',
                            render: (v) => v || t('postgres.roles.forever'),
                        },
                        {
                            title: t('postgres.roles.colAction'),
                            width: 220,
                            render: (_, r: PgRole) => (
                                <Space size={6}>
                                    <Button
                                        size="small"
                                        type="link"
                                        icon={<Key size={13} />}
                                        style={{ padding: 0 }}
                                        onClick={() => {
                                            setSelectedRole(r.name)
                                            setPwdModalOpen(true)
                                        }}
                                    >
                                        {t('postgres.roles.changePwd')}
                                    </Button>

                                    <Button
                                        size="small"
                                        type="link"
                                        icon={<Shield size={13} />}
                                        style={{ padding: 0 }}
                                        onClick={() => {
                                            setGrantRole(r.name)
                                            setGrantModalOpen(true)
                                        }}
                                    >
                                        {t('postgres.roles.grant')}
                                    </Button>

                                    <Popconfirm
                                        title={t('postgres.roles.dropConfirm', { name: r.name })}
                                        okButtonProps={{ danger: true }}
                                        onConfirm={() => handleDropRole(r.name)}
                                    >
                                        <Button
                                            size="small"
                                            type="link"
                                            danger
                                            icon={<Trash2 size={13} />}
                                            style={{ padding: 0 }}
                                        >
                                            {t('postgres.roles.delete')}
                                        </Button>
                                    </Popconfirm>
                                </Space>
                            ),
                        },
                    ]}
                />
            </div>

            {/* 新建角色弹窗 */}
            <Modal
                title={t('postgres.roles.createModalTitle')}
                open={createModalOpen}
                onOk={handleCreateRole}
                onCancel={() => setCreateModalOpen(false)}
                okText={t('postgres.obj.create')}
                cancelText={t('postgres.obj.cancel')}
            >
                <Form form={createForm} layout="vertical" initialValues={{ canLogin: true, connLimit: -1 }}>
                    <Form.Item label={t('postgres.roles.roleName')} name="name" rules={[{ required: true, message: t('postgres.roles.roleNameReq') }]}>
                        <Input placeholder={t('postgres.roles.roleNamePlaceholder')} />
                    </Form.Item>
                    <Form.Item label={t('postgres.roles.password')} name="password">
                        <Input.Password placeholder={t('postgres.roles.passwordPlaceholder')} />
                    </Form.Item>
                    <Form.Item label={t('postgres.roles.connLimit')} name="connLimit">
                        <InputNumber style={{ width: '100%' }} placeholder={t('postgres.roles.connLimitPlaceholder')} />
                    </Form.Item>
                    <Form.Item label={t('postgres.roles.privAttrs')}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                            <Form.Item name="canLogin" valuePropName="checked" noStyle>
                                <Checkbox>{t('postgres.roles.attrLogin')}</Checkbox>
                            </Form.Item>
                            <Form.Item name="super" valuePropName="checked" noStyle>
                                <Checkbox>{t('postgres.roles.attrSuper')}</Checkbox>
                            </Form.Item>
                            <Form.Item name="createDb" valuePropName="checked" noStyle>
                                <Checkbox>{t('postgres.roles.attrCreateDb')}</Checkbox>
                            </Form.Item>
                            <Form.Item name="createRole" valuePropName="checked" noStyle>
                                <Checkbox>{t('postgres.roles.attrCreateRole')}</Checkbox>
                            </Form.Item>
                        </div>
                    </Form.Item>
                </Form>
            </Modal>

            {/* 修改密码弹窗 */}
            <Modal
                title={t('postgres.roles.changePwdModalTitle', { name: selectedRole })}
                open={pwdModalOpen}
                onOk={handleChangePassword}
                onCancel={() => setPwdModalOpen(false)}
                okText={t('postgres.roles.updatePwd')}
                cancelText={t('postgres.obj.cancel')}
            >
                <div style={{ marginTop: 12 }}>
                    <Input.Password
                        placeholder={t('postgres.roles.newPwdPlaceholder')}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                    />
                </div>
            </Modal>

            {/* 授权管理弹窗 */}
            <Modal
                title={t('postgres.roles.grantModalTitle', { name: grantRole })}
                open={grantModalOpen}
                onCancel={() => setGrantModalOpen(false)}
                footer={[
                    <Button key="revoke" danger onClick={() => handleGrant(false)}>
                        {t('postgres.roles.revokeBtn')}
                    </Button>,
                    <Button key="grant" type="primary" onClick={() => handleGrant(true)}>
                        {t('postgres.roles.grantBtn')}
                    </Button>,
                ]}
            >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
                    <div>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>{t('postgres.roles.targetSchema')}</div>
                        <Input value={grantSchema} onChange={(e) => setGrantSchema(e.target.value)} placeholder={t('postgres.roles.targetSchemaPlaceholder')} />
                    </div>
                    <div>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>{t('postgres.roles.targetTable')}</div>
                        <Input value={grantTable} onChange={(e) => setGrantTable(e.target.value)} placeholder={t('postgres.roles.targetTablePlaceholder')} />
                    </div>
                    <div>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>{t('postgres.roles.privCollection')}</div>
                        <Checkbox.Group
                            options={['ALL', 'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'USAGE', 'CREATE']}
                            value={grantPrivs}
                            onChange={(checked) => setGrantPrivs(checked as string[])}
                        />
                    </div>
                </div>
            </Modal>
        </div>
    )
}
