import { useState, useEffect, useCallback, useMemo } from 'react'
import {
    Button,
    Input,
    Select,
    Tag,
    Modal,
    Popconfirm,
    Checkbox,
    Alert,
    Tooltip,
    App,
} from 'antd'
import {
    Users,
    UserPlus,
    RotateCw,
    Search,
    Key,
    Shield,
    Trash2,
    Copy,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { API } from '@/api'
import { errorMessage, copyText } from '@/utils'
import { MongoSessionInfo, MongoUserInfo, MongoRoleItem } from '@/types'
import s from './UsersTab.module.less'

interface Props {
    session: MongoSessionInfo
    databases: string[]
    currentDb: string
}

export default function UsersTab({ session, databases, currentDb }: Props) {
    const { t } = useTranslation(['db', 'common'])
    const { message } = App.useApp()
    const id = session.id
    const [selectedDb, setSelectedDb] = useState<string>(currentDb || 'admin')
    const [searchQuery, setSearchQuery] = useState('')
    const [users, setUsers] = useState<MongoUserInfo[]>([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')

    const presetRoles = useMemo(() => [
        { role: 'read', label: t('mongo.users.roles.read', '只读 (read)'), desc: t('mongo.users.roles.readDesc', '允许读取指定数据库中的所有集合数据') },
        { role: 'readWrite', label: t('mongo.users.roles.readWrite', '读写 (readWrite)'), desc: t('mongo.users.roles.readWriteDesc', '允许读写指定数据库中的所有集合数据') },
        { role: 'dbAdmin', label: t('mongo.users.roles.dbAdmin', '库管 (dbAdmin)'), desc: t('mongo.users.roles.dbAdminDesc', '允许执行数据库管理任务（索引、统计分析、结构校验）') },
        { role: 'userAdmin', label: t('mongo.users.roles.userAdmin', '用户管 (userAdmin)'), desc: t('mongo.users.roles.userAdminDesc', '允许创建和修改当前数据库的用户及自定义角色') },
        { role: 'dbOwner', label: t('mongo.users.roles.dbOwner', '全权库主 (dbOwner)'), desc: t('mongo.users.roles.dbOwnerDesc', '包含 readWrite、dbAdmin 和 userAdmin 的所有权限') },
        { role: 'clusterAdmin', label: t('mongo.users.roles.clusterAdmin', '集群管理 (clusterAdmin)'), desc: t('mongo.users.roles.clusterAdminDesc', '管理副本集/分片集群运维（限 admin 库）') },
        { role: 'readAnyDatabase', label: t('mongo.users.roles.readAnyDatabase', '全库只读 (readAnyDatabase)'), desc: t('mongo.users.roles.readAnyDatabaseDesc', '允许读取除 local/config 外任意库（限 admin 库）') },
        { role: 'readWriteAnyDatabase', label: t('mongo.users.roles.readWriteAnyDatabase', '全库读写 (readWriteAnyDatabase)'), desc: t('mongo.users.roles.readWriteAnyDatabaseDesc', '允许读写除 local/config 外任意库（限 admin 库）') },
        { role: 'root', label: t('mongo.users.roles.root', '超级管理员 (root)'), desc: t('mongo.users.roles.rootDesc', '系统至高特权管理员，拥有全局所有控制权（限 admin 库）') },
    ], [t])

    // 新建用户弹窗
    const [createOpen, setCreateOpen] = useState(false)
    const [newUsername, setNewUsername] = useState('')
    const [newPassword, setNewPassword] = useState('')
    const [newUserDb, setNewUserDb] = useState(selectedDb || 'admin')
    const [newRoles, setNewRoles] = useState<MongoRoleItem[]>([{ role: 'readWrite', db: selectedDb || 'admin' }])
    const [createBusy, setCreateBusy] = useState(false)
    const [createMsg, setCreateMsg] = useState('')

    // 修改密码弹窗
    const [pwdModal, setPwdModal] = useState<{ open: boolean; user: MongoUserInfo | null; newPwd: string }>({
        open: false,
        user: null,
        newPwd: '',
    })
    const [pwdBusy, setPwdBusy] = useState(false)

    // 修改角色弹窗
    const [rolesModal, setRolesModal] = useState<{ open: boolean; user: MongoUserInfo | null; roles: MongoRoleItem[] }>({
        open: false,
        user: null,
        roles: [],
    })
    const [rolesBusy, setRolesBusy] = useState(false)

    // 加载用户列表
    const loadUsers = useCallback(async () => {
        setLoading(true)
        setError('')
        try {
            const list = await API.mongoUsers(id, selectedDb)
            setUsers(list || [])
        } catch (e: any) {
            setError(errorMessage(e))
        } finally {
            setLoading(false)
        }
    }, [id, selectedDb])

    useEffect(() => {
        void loadUsers()
    }, [loadUsers])

    // 本地搜索过滤
    const filteredUsers = useMemo(() => {
        if (!searchQuery.trim()) return users
        const q = searchQuery.toLowerCase()
        return users.filter((u) => {
            const nameMatch = u.user.toLowerCase().includes(q)
            const dbMatch = u.db.toLowerCase().includes(q)
            const roleMatch = u.roles?.some((r) => r.role.toLowerCase().includes(q) || r.db.toLowerCase().includes(q))
            return nameMatch || dbMatch || roleMatch
        })
    }, [users, searchQuery])

    // 处理新建用户
    const handleCreateUser = async () => {
        if (!newUsername.trim() || !newPassword.trim()) {
            setCreateMsg(t('mongo.users.reqUserPwd', '用户名和密码均不能为空'))
            return
        }
        if (!newRoles.length) {
            setCreateMsg(t('mongo.users.reqRole', '请至少分配一个角色权限'))
            return
        }
        setCreateBusy(true)
        setCreateMsg('')
        try {
            await API.mongoCreateUser(id, {
                user: newUsername.trim(),
                pwd: newPassword.trim(),
                db: newUserDb || 'admin',
                roles: newRoles,
            })
            message.success(t('mongo.users.userCreated', { name: newUsername, defaultValue: `用户 ${newUsername} 创建成功` }))
            setCreateOpen(false)
            setNewUsername('')
            setNewPassword('')
            void loadUsers()
        } catch (e: any) {
            setCreateMsg(errorMessage(e))
        } finally {
            setCreateBusy(false)
        }
    }

    // 处理更新密码
    const handleUpdatePassword = async () => {
        if (!pwdModal.user || !pwdModal.newPwd.trim()) {
            message.warning(t('mongo.users.reqNewPwd', '新密码不能为空'))
            return
        }
        setPwdBusy(true)
        try {
            await API.mongoUpdateUser(id, {
                user: pwdModal.user.user,
                db: pwdModal.user.db,
                pwd: pwdModal.newPwd.trim(),
            })
            message.success(t('mongo.users.pwdUpdated', { name: pwdModal.user.user, defaultValue: `用户 ${pwdModal.user.user} 密码已修改` }))
            setPwdModal({ open: false, user: null, newPwd: '' })
        } catch (e: any) {
            message.error(errorMessage(e))
        } finally {
            setPwdBusy(false)
        }
    }

    // 处理更新角色
    const handleUpdateRoles = async () => {
        if (!rolesModal.user) return
        setRolesBusy(true)
        try {
            await API.mongoUpdateUser(id, {
                user: rolesModal.user.user,
                db: rolesModal.user.db,
                roles: rolesModal.roles,
            })
            message.success(t('mongo.users.rolesUpdated', { name: rolesModal.user.user, defaultValue: `用户 ${rolesModal.user.user} 权限已更新` }))
            setRolesModal({ open: false, user: null, roles: [] })
            void loadUsers()
        } catch (e: any) {
            message.error(errorMessage(e))
        } finally {
            setRolesBusy(false)
        }
    }

    // 删除用户
    const handleDeleteUser = async (u: MongoUserInfo) => {
        try {
            await API.mongoDropUser(id, u.db, u.user)
            message.success(t('mongo.users.userDropped', { name: u.user, defaultValue: `用户 ${u.user} 已删除` }))
            void loadUsers()
        } catch (e: any) {
            message.error(errorMessage(e))
        }
    }

    // 复制连接凭据模板
    const handleCopyUri = async (u: MongoUserInfo) => {
        const portPart = session.port ? `:${session.port}` : ''
        const pwdPlaceholder = t('mongo.users.uriPwdPlaceholder', '<密码>')
        const uri = `mongodb://${u.user}:${pwdPlaceholder}@${session.host || 'localhost'}${portPart}/${u.db}?authSource=${u.db}`
        if (await copyText(uri)) {
            message.success(t('mongo.users.copiedUri', '已复制连接串模板'))
        }
    }

    // 预设角色选择切换辅助函数
    const togglePresetRole = (
        roleName: string,
        targetDb: string,
        currentRoles: MongoRoleItem[],
        setter: (roles: MongoRoleItem[]) => void
    ) => {
        const exists = currentRoles.some((r) => r.role === roleName && r.db === targetDb)
        if (exists) {
            setter(currentRoles.filter((r) => !(r.role === roleName && r.db === targetDb)))
        } else {
            setter([...currentRoles, { role: roleName, db: targetDb }])
        }
    }

    return (
        <div className={s.usersWrap}>
            {/* 顶部工具栏 */}
            <div className={s.toolbar}>
                <div className={s.toolbarLeft}>
                    <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{t('mongo.users.dbLabel', '数据库：')}</span>
                    <Select
                        size="small"
                        style={{ width: 150 }}
                        value={selectedDb}
                        onChange={(v) => setSelectedDb(v)}
                        options={[
                            { label: t('mongo.users.allDbsAdminView', '全部库 (admin 视图)'), value: 'admin' },
                            ...databases.map((db) => ({ label: db, value: db })),
                        ]}
                    />

                    <Input
                        size="small"
                        placeholder={t('mongo.users.searchPlaceholder', '搜索用户或角色...')}
                        prefix={<Search size={12} style={{ color: 'var(--text-dim)' }} />}
                        style={{ width: 200 }}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        allowClear
                    />

                    <Tooltip title={t('mongo.users.refreshTooltip', '刷新用户列表')}>
                        <Button
                            size="small"
                            type="text"
                            icon={<RotateCw size={13} className={loading ? 'spin' : ''} />}
                            onClick={() => void loadUsers()}
                        />
                    </Tooltip>
                </div>

                <div className={s.toolbarRight}>
                    <Button
                        size="small"
                        type="primary"
                        icon={<UserPlus size={13} />}
                        onClick={() => {
                            setNewUserDb(selectedDb || 'admin')
                            setNewRoles([{ role: 'readWrite', db: selectedDb || 'admin' }])
                            setCreateOpen(true)
                            setCreateMsg('')
                        }}
                    >
                        {t('mongo.users.newUser', '新建用户')}
                    </Button>
                </div>
            </div>

            {/* 错误警告条 */}
            {error && (
                <Alert
                    type="error"
                    showIcon
                    closable
                    message={t('mongo.users.loadFail', { error, defaultValue: `加载用户列表失败: ${error}` })}
                    style={{ margin: 8 }}
                />
            )}

            {/* 用户列表区 */}
            <div className={s.contentArea}>
                {filteredUsers.length === 0 && !loading ? (
                    <div className={s.emptyState}>
                        <Users size={36} opacity={0.35} />
                        <div>{t('mongo.users.noUsers', '当前数据库未检索到任何用户')}</div>
                        <Button
                            size="small"
                            type="primary"
                            icon={<UserPlus size={12} />}
                            onClick={() => {
                                setNewUserDb(selectedDb || 'admin')
                                setCreateOpen(true)
                            }}
                        >
                            {t('mongo.users.createFirstUser', '创建首个用户')}
                        </Button>
                    </div>
                ) : (
                    filteredUsers.map((u, idx) => (
                        <div key={idx} className={s.userCard}>
                            <div className={s.userInfo}>
                                <div className={s.userHeader}>
                                    <span className={s.userName}>{u.user}</span>
                                    <Tag color={u.db === 'admin' ? 'blue' : 'purple'}>
                                        {t('mongo.users.authDb', { db: u.db, defaultValue: `认证库: ${u.db}` })}
                                    </Tag>
                                </div>

                                <div className={s.rolesList}>
                                    <span style={{ fontSize: 11, color: 'var(--text-dim)', marginRight: 4 }}>
                                        {t('mongo.users.grantedRoles', '授予角色:')}
                                    </span>
                                    {u.roles && u.roles.length > 0 ? (
                                        u.roles.map((r, rIdx) => (
                                            <Tag key={rIdx} color="cyan">
                                                {r.role}@{r.db}
                                            </Tag>
                                        ))
                                    ) : (
                                        <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{t('mongo.users.noRoles', '无角色')}</span>
                                    )}
                                </div>
                            </div>

                            <div className={s.userActions}>
                                <Tooltip title={t('mongo.users.editRolesTooltip', '修改角色分配')}>
                                    <Button
                                        size="small"
                                        type="text"
                                        icon={<Shield size={13} />}
                                        onClick={() => {
                                            setRolesModal({
                                                open: true,
                                                user: u,
                                                roles: [...(u.roles || [])],
                                            })
                                        }}
                                    >
                                        {t('mongo.users.roleBtn', '角色')}
                                    </Button>
                                </Tooltip>

                                <Tooltip title={t('mongo.users.changePwdTooltip', '修改密码')}>
                                    <Button
                                        size="small"
                                        type="text"
                                        icon={<Key size={13} />}
                                        onClick={() => {
                                            setPwdModal({ open: true, user: u, newPwd: '' })
                                        }}
                                    >
                                        {t('mongo.users.changePwdBtn', '改密')}
                                    </Button>
                                </Tooltip>

                                <Tooltip title={t('mongo.users.copyUriTooltip', '复制连接串模板')}>
                                    <Button
                                        size="small"
                                        type="text"
                                        icon={<Copy size={13} />}
                                        onClick={() => handleCopyUri(u)}
                                    />
                                </Tooltip>

                                <Popconfirm
                                    title={t('mongo.users.dropConfirmTitle', '删除确认')}
                                    description={t('mongo.users.dropConfirmDesc', { name: u.user, db: u.db, defaultValue: `确定要永久删除用户 ${u.user} (${u.db}) 吗？` })}
                                    okText={t('mongo.users.dropBtn', '删除')}
                                    cancelText={t('common:cancel', '取消')}
                                    okButtonProps={{ danger: true }}
                                    onConfirm={() => void handleDeleteUser(u)}
                                >
                                    <Tooltip title={t('mongo.users.dropTooltip', '删除用户')}>
                                        <Button
                                            size="small"
                                            type="text"
                                            danger
                                            icon={<Trash2 size={13} />}
                                        />
                                    </Tooltip>
                                </Popconfirm>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* 新建用户弹窗 */}
            <Modal
                title={t('mongo.users.createModalTitle', '新建 MongoDB 用户')}
                open={createOpen}
                onCancel={() => !createBusy && setCreateOpen(false)}
                onOk={handleCreateUser}
                confirmLoading={createBusy}
                okText={t('mongo.users.createBtn', '创建用户')}
                cancelText={t('common:cancel', '取消')}
                width={560}
            >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '8px 0' }}>
                    {createMsg && <Alert type="error" showIcon message={createMsg} />}

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <div>
                            <div style={{ fontSize: 12, marginBottom: 4, fontWeight: 500 }}>{t('mongo.users.username', '用户名：')}</div>
                            <Input
                                size="small"
                                placeholder={t('mongo.users.usernamePlaceholder', '如 app_reader')}
                                value={newUsername}
                                onChange={(e) => setNewUsername(e.target.value)}
                            />
                        </div>
                        <div>
                            <div style={{ fontSize: 12, marginBottom: 4, fontWeight: 500 }}>{t('mongo.users.password', '密码：')}</div>
                            <Input.Password
                                size="small"
                                placeholder={t('mongo.users.passwordPlaceholder', '输入密码')}
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                            />
                        </div>
                    </div>

                    <div>
                        <div style={{ fontSize: 12, marginBottom: 4, fontWeight: 500 }}>{t('mongo.users.authSourceLabel', '认证归属数据库 (authSource)：')}</div>
                        <Select
                            size="small"
                            style={{ width: '100%' }}
                            value={newUserDb}
                            onChange={(v) => setNewUserDb(v)}
                            options={[
                                { label: t('mongo.users.adminRecommended', 'admin (全局管理库推荐)'), value: 'admin' },
                                ...databases.filter((d) => d !== 'admin').map((d) => ({ label: d, value: d })),
                            ]}
                        />
                    </div>

                    <div>
                        <div style={{ fontSize: 12, marginBottom: 4, fontWeight: 500 }}>{t('mongo.users.quickPresetRoles', '快捷分配内置预设角色：')}</div>
                        <div className={s.presetGrid}>
                            {presetRoles.map((pr) => {
                                const isChecked = newRoles.some((r) => r.role === pr.role && r.db === newUserDb)
                                return (
                                    <div
                                        key={pr.role}
                                        className={s.presetItem}
                                        style={{
                                            borderColor: isChecked ? 'var(--accent, #3b82f6)' : undefined,
                                            background: isChecked ? 'rgba(59, 130, 246, 0.08)' : undefined,
                                        }}
                                        onClick={() => togglePresetRole(pr.role, newUserDb, newRoles, setNewRoles)}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <Checkbox checked={isChecked} />
                                            <span className={s.roleName}>{pr.label}</span>
                                        </div>
                                        <div className={s.roleDesc}>{pr.desc}</div>
                                    </div>
                                )
                            })}
                        </div>
                    </div>

                    <div>
                        <div style={{ fontSize: 12, marginBottom: 4, fontWeight: 500 }}>{t('mongo.users.currentSelectedRoles', '当前已选角色：')}</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, minHeight: 28 }}>
                            {newRoles.map((r, i) => (
                                <Tag
                                    key={i}
                                    color="blue"
                                    closable
                                    onClose={() => setNewRoles(newRoles.filter((_, idx) => idx !== i))}
                                >
                                    {r.role}@{r.db}
                                </Tag>
                            ))}
                        </div>
                    </div>
                </div>
            </Modal>

            {/* 修改密码弹窗 */}
            <Modal
                title={t('mongo.users.changePwdTitle', { name: pwdModal.user?.user, defaultValue: `修改用户密码 - ${pwdModal.user?.user}` })}
                open={pwdModal.open}
                onCancel={() => !pwdBusy && setPwdModal({ open: false, user: null, newPwd: '' })}
                onOk={handleUpdatePassword}
                confirmLoading={pwdBusy}
                okText={t('mongo.users.savePwd', '保存密码')}
                cancelText={t('common:cancel', '取消')}
                width={400}
            >
                <div style={{ padding: '12px 0' }}>
                    <div style={{ fontSize: 12, marginBottom: 6 }}>{t('mongo.users.inputNewPwd', '请输入新密码：')}</div>
                    <Input.Password
                        placeholder={t('mongo.users.passwordPlaceholder', '输入新密码')}
                        value={pwdModal.newPwd}
                        onChange={(e) => setPwdModal((prev) => ({ ...prev, newPwd: e.target.value }))}
                    />
                </div>
            </Modal>

            {/* 修改角色弹窗 */}
            <Modal
                title={t('mongo.users.editRolesTitle', { name: rolesModal.user?.user, defaultValue: `修改角色分配 - ${rolesModal.user?.user}` })}
                open={rolesModal.open}
                onCancel={() => !rolesBusy && setRolesModal({ open: false, user: null, roles: [] })}
                onOk={handleUpdateRoles}
                confirmLoading={rolesBusy}
                okText={t('mongo.users.saveRoles', '保存角色')}
                cancelText={t('common:cancel', '取消')}
                width={560}
            >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '8px 0' }}>
                    <div style={{ fontSize: 12, fontWeight: 500 }}>{t('mongo.users.quickPresetCurrentDb', { db: rolesModal.user?.db, defaultValue: `快捷分配当前库 (${rolesModal.user?.db}) 内置角色：` })}</div>
                    <div className={s.presetGrid}>
                        {presetRoles.map((pr) => {
                            const uDb = rolesModal.user?.db || 'admin'
                            const isChecked = rolesModal.roles.some((r) => r.role === pr.role && r.db === uDb)
                            return (
                                <div
                                    key={pr.role}
                                    className={s.presetItem}
                                    style={{
                                        borderColor: isChecked ? 'var(--accent, #3b82f6)' : undefined,
                                        background: isChecked ? 'rgba(59, 130, 246, 0.08)' : undefined,
                                    }}
                                    onClick={() =>
                                        togglePresetRole(pr.role, uDb, rolesModal.roles, (next) =>
                                            setRolesModal((prev) => ({ ...prev, roles: next }))
                                        )
                                    }
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <Checkbox checked={isChecked} />
                                        <span className={s.roleName}>{pr.label}</span>
                                    </div>
                                    <div className={s.roleDesc}>{pr.desc}</div>
                                </div>
                            )
                        })}
                    </div>

                    <div>
                        <div style={{ fontSize: 12, marginBottom: 4, fontWeight: 500 }}>{t('mongo.users.assignedRolesList', '已分配角色清单：')}</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {rolesModal.roles.map((r, i) => (
                                <Tag
                                    key={i}
                                    color="blue"
                                    closable
                                    onClose={() =>
                                        setRolesModal((prev) => ({
                                            ...prev,
                                            roles: prev.roles.filter((_, idx) => idx !== i),
                                        }))
                                    }
                                >
                                    {r.role}@{r.db}
                                </Tag>
                            ))}
                        </div>
                    </div>
                </div>
            </Modal>
        </div>
    )
}
