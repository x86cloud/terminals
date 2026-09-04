import React, { useState, useEffect } from 'react'
import { Table, Button, Tag, Input, Modal, Form, Checkbox, InputNumber, Popconfirm, message, Space } from 'antd'
import { UserPlus, Key, Shield, Trash2, RotateCw, Check, X } from 'lucide-react'
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
            message.error(`加载角色失败: ${e.message || e}`)
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
            message.error(`创建失败: ${e.message || e}`)
        }
    }

    const handleChangePassword = async () => {
        if (!newPassword.trim()) {
            message.warning('请输入新密码')
            return
        }
        try {
            await API.postgresUpdateRolePassword(serverId, selectedRole, newPassword.trim())
            setPwdModalOpen(false)
            setNewPassword('')
        } catch (e: any) {
            message.error(`修改密码失败: ${e.message || e}`)
        }
    }

    const handleDropRole = async (roleName: string) => {
        try {
            await API.postgresDropRole(serverId, roleName)
            loadRoles()
        } catch (e: any) {
            message.error(`删除失败: ${e.message || e}`)
        }
    }

    const handleGrant = async (isGrant: boolean) => {
        if (grantPrivs.length === 0) {
            message.warning('请至少勾选一项权限')
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
            message.error(`操作失败: ${e.message || e}`)
        }
    }

    return (
        <div className={pg.rolesWrap}>
            <div className={pg.headBar}>
                <div>
                    <span style={{ fontSize: 15, fontWeight: 700 }}>角色与权限管理 (Roles & Privileges)</span>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                        查看系统角色、用户登录属性及 Schema/Table 权限配置
                    </div>
                </div>

                <Space size={8}>
                    <Button
                        type="primary"
                        size="small"
                        icon={<UserPlus size={14} />}
                        onClick={() => setCreateModalOpen(true)}
                    >
                        新建角色 / 用户
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
                            title: '角色名称',
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
                            title: '超级用户',
                            dataIndex: 'super',
                            render: (v) => (v ? <Check size={14} style={{ color: '#52c41a' }} /> : <X size={14} style={{ color: 'var(--text-faint)' }} />),
                        },
                        {
                            title: '允许登录',
                            dataIndex: 'canLogin',
                            render: (v) => (v ? <Check size={14} style={{ color: '#52c41a' }} /> : <X size={14} style={{ color: 'var(--text-faint)' }} />),
                        },
                        {
                            title: '建库权限',
                            dataIndex: 'createDb',
                            render: (v) => (v ? <Check size={14} style={{ color: '#52c41a' }} /> : <X size={14} style={{ color: 'var(--text-faint)' }} />),
                        },
                        {
                            title: '建角色权限',
                            dataIndex: 'createRole',
                            render: (v) => (v ? <Check size={14} style={{ color: '#52c41a' }} /> : <X size={14} style={{ color: 'var(--text-faint)' }} />),
                        },
                        {
                            title: '连接限制',
                            dataIndex: 'connLimit',
                            render: (v) => (v < 0 ? '无限制' : v),
                        },
                        {
                            title: '有效期至',
                            dataIndex: 'validUntil',
                            render: (v) => v || '永久',
                        },
                        {
                            title: '操作',
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
                                        改密
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
                                        授权
                                    </Button>

                                    <Popconfirm
                                        title={`确定要删除角色「${r.name}」吗？`}
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
                                            删除
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
                title="新建角色 / 用户"
                open={createModalOpen}
                onOk={handleCreateRole}
                onCancel={() => setCreateModalOpen(false)}
                okText="创建"
                cancelText="取消"
            >
                <Form form={createForm} layout="vertical" initialValues={{ canLogin: true, connLimit: -1 }}>
                    <Form.Item label="角色名称" name="name" rules={[{ required: true, message: '请输入角色名称' }]}>
                        <Input placeholder="输入角色名称 (如 app_user, readonly_role)" />
                    </Form.Item>
                    <Form.Item label="登录密码" name="password">
                        <Input.Password placeholder="输入密码 (若允许登录)" />
                    </Form.Item>
                    <Form.Item label="连接上限" name="connLimit">
                        <InputNumber style={{ width: '100%' }} placeholder="-1 表示不限制" />
                    </Form.Item>
                    <Form.Item label="权限属性">
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                            <Form.Item name="canLogin" valuePropName="checked" noStyle>
                                <Checkbox>允许登录 (LOGIN)</Checkbox>
                            </Form.Item>
                            <Form.Item name="super" valuePropName="checked" noStyle>
                                <Checkbox>超级用户 (SUPERUSER)</Checkbox>
                            </Form.Item>
                            <Form.Item name="createDb" valuePropName="checked" noStyle>
                                <Checkbox>创建数据库 (CREATEDB)</Checkbox>
                            </Form.Item>
                            <Form.Item name="createRole" valuePropName="checked" noStyle>
                                <Checkbox>创建角色 (CREATEROLE)</Checkbox>
                            </Form.Item>
                        </div>
                    </Form.Item>
                </Form>
            </Modal>

            {/* 修改密码弹窗 */}
            <Modal
                title={`修改角色「${selectedRole}」密码`}
                open={pwdModalOpen}
                onOk={handleChangePassword}
                onCancel={() => setPwdModalOpen(false)}
                okText="更新密码"
                cancelText="取消"
            >
                <div style={{ marginTop: 12 }}>
                    <Input.Password
                        placeholder="输入新的角色密码"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                    />
                </div>
            </Modal>

            {/* 授权管理弹窗 */}
            <Modal
                title={`为「${grantRole}」配置权限`}
                open={grantModalOpen}
                onCancel={() => setGrantModalOpen(false)}
                footer={[
                    <Button key="revoke" danger onClick={() => handleGrant(false)}>
                        撤销权限 (REVOKE)
                    </Button>,
                    <Button key="grant" type="primary" onClick={() => handleGrant(true)}>
                        授予权限 (GRANT)
                    </Button>,
                ]}
            >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
                    <div>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>目标 Schema</div>
                        <Input value={grantSchema} onChange={(e) => setGrantSchema(e.target.value)} placeholder="如 public" />
                    </div>
                    <div>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>目标数据表 (留空代表针对整个 Schema)</div>
                        <Input value={grantTable} onChange={(e) => setGrantTable(e.target.value)} placeholder="如 users, orders (可选)" />
                    </div>
                    <div>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>权限集合</div>
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
