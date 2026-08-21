import React, { useState, useMemo } from 'react'
import { Button, Tag, Space, Tooltip, Input, Modal, message } from 'antd'
import {
    ShieldCheck,
    User,
    UserPlus,
    RotateCw,
    Copy,
    Check,
    KeyRound,
    Lock,
    Unlock,
    Trash2,
    Search,
    Shield,
    X,
    Plus,
} from 'lucide-react'
import { API } from '@/api'
import { errorMessage } from '@/utils'
import CreateUserModal from './CreateUserModal'
import GrantPrivilegesModal from './GrantPrivilegesModal'
import ChangePasswordModal from './ChangePasswordModal'
import my from './UsersPanel.module.less'
import sh from './mysqlShared.module.less'

interface Props {
    sessionId: string
    databases: string[]
    users: Record<string, any>[]
    selUser: { user: string; host: string } | null
    grants: string
    onSelect: (user: string, host: string) => void
    onRefreshUsers: () => Promise<void> | void
    onRefreshGrants?: () => Promise<void> | void
    onNotify?: (msg: string) => void
}

export default function UsersPanel({
    sessionId,
    databases,
    users,
    selUser,
    grants,
    onSelect,
    onRefreshUsers,
    onRefreshGrants,
    onNotify,
}: Props) {
    const [copied, setCopied] = useState(false)
    const [copiedIdx, setCopiedIdx] = useState<number | null>(null)
    const [searchKeyword, setSearchKeyword] = useState('')
    const [refreshing, setRefreshing] = useState(false)

    // Modals
    const [createUserOpen, setCreateUserOpen] = useState(false)
    const [grantModalOpen, setGrantModalOpen] = useState(false)
    const [changePwdUser, setChangePwdUser] = useState<{ user: string; host: string } | null>(null)

    const notify = (msg: string) => {
        if (onNotify) onNotify(msg)
        else message.success(msg)
    }

    const notifyError = (msg: string) => {
        message.error(msg)
    }

    const handleCopyAll = async () => {
        if (!grants) return
        try {
            await navigator.clipboard.writeText(grants)
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
            notify('已复制全部授权语句')
        } catch {
            /* ignore */
        }
    }

    const handleCopyCard = async (text: string, idx: number) => {
        try {
            await navigator.clipboard.writeText(text)
            setCopiedIdx(idx)
            setTimeout(() => setCopiedIdx(null), 1500)
            notify('已复制授权语句')
        } catch {
            /* ignore */
        }
    }

    const handleRefresh = async () => {
        setRefreshing(true)
        try {
            await onRefreshUsers()
            if (selUser && onRefreshGrants) {
                await onRefreshGrants()
            }
        } finally {
            setRefreshing(false)
        }
    }

    // Toggle user lock
    const handleToggleLock = (targetUser: string, targetHost: string, currentLocked: boolean) => {
        const actionText = currentLocked ? '解锁' : '锁定'
        Modal.confirm({
            title: `确认${actionText}用户`,
            content: `确定要${actionText}用户 "${targetUser}@${targetHost}" 吗？`,
            okText: `确认${actionText}`,
            cancelText: '取消',
            onOk: async () => {
                try {
                    await API.mysqlToggleUserLock(sessionId, targetUser, targetHost, !currentLocked)
                    notify(`用户 ${targetUser}@${targetHost} 已${actionText}`)
                    await onRefreshUsers()
                } catch (e) {
                    notifyError(`${actionText}失败: ` + errorMessage(e))
                }
            },
        })
    }

    // Drop user
    const handleDropUser = (targetUser: string, targetHost: string) => {
        Modal.confirm({
            title: '确认删除用户 (DROP USER)',
            content: `确定要永久删除用户 "${targetUser}@${targetHost}" 吗？此操作不可逆！`,
            okText: '确认删除',
            okType: 'danger',
            cancelText: '取消',
            onOk: async () => {
                try {
                    await API.mysqlDropUser(sessionId, targetUser, targetHost)
                    notify(`已成功删除用户 ${targetUser}@${targetHost}`)
                    if (selUser?.user === targetUser && selUser?.host === targetHost) {
                        // reset selection if active
                        onSelect('', '')
                    }
                    await onRefreshUsers()
                } catch (e) {
                    notifyError('删除用户失败: ' + errorMessage(e))
                }
            },
        })
    }

    // Revoke all privileges
    const handleRevokeAll = (targetUser: string, targetHost: string) => {
        Modal.confirm({
            title: '确认撤销该用户的全部权限 (REVOKE ALL)',
            content: `确定要撤销用户 "${targetUser}@${targetHost}" 的所有全局与库表权限及 GRANT OPTION 吗？`,
            okText: '确认撤销全部',
            okType: 'danger',
            cancelText: '取消',
            onOk: async () => {
                try {
                    await API.mysqlRevokeAllPrivileges(sessionId, targetUser, targetHost)
                    notify(`已撤销 ${targetUser}@${targetHost} 的全部权限`)
                    if (onRefreshGrants) await onRefreshGrants()
                } catch (e) {
                    notifyError('撤销全部权限失败: ' + errorMessage(e))
                }
            },
        })
    }

    // Revoke a single grant rule
    const handleRevokeSingleGrant = (stmt: string, targetUser: string, targetHost: string) => {
        // e.g. "GRANT SELECT, INSERT ON `test_db`.* TO 'u'@'%'" -> REVOKE SELECT, INSERT ON `test_db`.* FROM 'u'@'%'
        let revokeSql = stmt
        if (stmt.startsWith('GRANT ')) {
            revokeSql = stmt.replace(/^GRANT\s+/i, 'REVOKE ')
            // replace " TO " with " FROM "
            const lastToIndex = revokeSql.lastIndexOf(' TO ')
            if (lastToIndex !== -1) {
                revokeSql = revokeSql.substring(0, lastToIndex) + ' FROM ' + revokeSql.substring(lastToIndex + 4)
            }
        }

        Modal.confirm({
            title: '确认撤销此条授权规则 (REVOKE)',
            content: (
                <div>
                    <p>将执行以下撤销语句：</p>
                    <pre
                        style={{
                            padding: '8px 12px',
                            background: 'var(--bg-3)',
                            borderRadius: 6,
                            fontSize: 12,
                            fontFamily: 'var(--font-mono)',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-all',
                        }}
                    >
                        {revokeSql}
                    </pre>
                </div>
            ),
            okText: '确认撤销',
            okType: 'danger',
            cancelText: '取消',
            onOk: async () => {
                try {
                    await API.mysqlRun(sessionId, 'mysql', revokeSql)
                    await API.mysqlRun(sessionId, 'mysql', 'FLUSH PRIVILEGES')
                    notify('已成功撤销该项授权')
                    if (onRefreshGrants) await onRefreshGrants()
                } catch (e) {
                    notifyError('撤销授权失败: ' + errorMessage(e))
                }
            },
        })
    }

    // Filter users by search keyword
    const filteredUsers = useMemo(() => {
        if (!searchKeyword.trim()) return users
        const kw = searchKeyword.toLowerCase()
        return users.filter(
            (u) =>
                (u.User && u.User.toLowerCase().includes(kw)) ||
                (u.Host && u.Host.toLowerCase().includes(kw))
        )
    }, [users, searchKeyword])

    // Parse grant statements
    const grantStatements = useMemo(() => {
        return grants ? grants.split('\n').map((s) => s.trim()).filter(Boolean) : []
    }, [grants])

    // Current selected user object
    const currentSelectedObj = useMemo(() => {
        if (!selUser) return null
        return users.find((u) => u.User === selUser.user && u.Host === selUser.host) || null
    }, [users, selUser])

    return (
        <div className={my.mgmtWrap}>
            {/* Top Toolbar */}
            <div className={my.mgmtHead}>
                <div className={my.headTitle}>
                    <ShieldCheck size={16} color="var(--accent)" />
                    <span>MySQL 用户与权限管理</span>
                    <Tag style={{ marginLeft: 4, borderRadius: 10, fontSize: 11 }}>
                        共 {users.length} 个用户
                    </Tag>
                </div>
                <Space size={8}>
                    <Button
                        size="small"
                        icon={<RotateCw size={13} className={refreshing ? 'spin-icon' : ''} />}
                        onClick={handleRefresh}
                        loading={refreshing}
                        title="刷新用户列表与权限"
                    >
                        刷新
                    </Button>
                    <Button
                        size="small"
                        type="primary"
                        icon={<UserPlus size={13} />}
                        onClick={() => setCreateUserOpen(true)}
                    >
                        新建用户
                    </Button>
                </Space>
            </div>

            <div className={my.mgmtBody}>
                {/* Left User List */}
                <div className={my.userList}>
                    <div className={my.searchWrap}>
                        <Input
                            size="small"
                            prefix={<Search size={12} color="var(--text-dim)" />}
                            placeholder="搜索用户或 Host"
                            value={searchKeyword}
                            onChange={(e) => setSearchKeyword(e.target.value)}
                            allowClear
                        />
                    </div>

                    {filteredUsers.length === 0 && (
                        <div className={`${sh.mysqlEmpty} ${my.small}`}>
                            {users.length === 0 ? '暂无用户（需 mysql 库权限）' : '未匹配到用户'}
                        </div>
                    )}

                    {filteredUsers.map((u, i) => {
                        const isSelected = selUser?.user === u.User && selUser?.host === u.Host
                        const isLocked = u.locked === 'Y'
                        const isRoot = (u.User || '').toLowerCase() === 'root'
                        return (
                            <div
                                key={`${u.User}-${u.Host}-${i}`}
                                className={`${my.userItem}${isSelected ? ' ' + my.active : ''}`}
                                onClick={() => onSelect(u.User, u.Host)}
                                title={`${u.User}@${u.Host}`}
                            >
                                <User size={14} className={my.userIcon} />
                                <div className={my.userMeta}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                        <span className={my.userName}>{u.User || '(匿名)'}</span>
                                        {isRoot && (
                                            <Tag color="gold" style={{ fontSize: 10, lineHeight: '14px', padding: '0 3px', margin: 0 }}>
                                                👑 Root
                                            </Tag>
                                        )}
                                        {isLocked && <span className={my.lockBadge}>已锁定</span>}
                                    </div>
                                    <span className={my.userHost}>@{u.Host}</span>
                                </div>

                                <div className={my.userQuickActions} onClick={(e) => e.stopPropagation()}>
                                    <Tooltip title="修改密码">
                                        <Button
                                            size="small"
                                            type="text"
                                            icon={<KeyRound size={12} />}
                                            onClick={() => setChangePwdUser({ user: u.User, host: u.Host })}
                                        />
                                    </Tooltip>
                                    {!isRoot && (
                                        <>
                                            <Tooltip title={isLocked ? '解锁账户' : '锁定账户'}>
                                                <Button
                                                    size="small"
                                                    type="text"
                                                    icon={isLocked ? <Unlock size={12} /> : <Lock size={12} />}
                                                    onClick={() => handleToggleLock(u.User, u.Host, isLocked)}
                                                />
                                            </Tooltip>
                                            <Tooltip title="删除用户">
                                                <Button
                                                    size="small"
                                                    type="text"
                                                    danger
                                                    icon={<Trash2 size={12} />}
                                                    onClick={() => handleDropUser(u.User, u.Host)}
                                                />
                                            </Tooltip>
                                        </>
                                    )}
                                </div>
                            </div>
                        )
                    })}
                </div>

                {/* Right Grants Detail Box */}
                <div className={my.grantsBox}>
                    {selUser && selUser.user ? (
                        <div className={my.grantsInner}>
                            {(() => {
                                const isSelUserRoot = (selUser.user || '').toLowerCase() === 'root'
                                return (
                                    <>
                                        <div className={my.grantsHead}>
                                            <div className={my.grantsTitle}>
                                                <Shield size={16} color="var(--accent)" />
                                                <span>{selUser.user}@{selUser.host}</span>
                                                {isSelUserRoot && (
                                                    <Tag color="gold" style={{ margin: 0, fontWeight: 500 }}>
                                                        👑 超级管理员 (受安全保护)
                                                    </Tag>
                                                )}
                                                {currentSelectedObj?.locked === 'Y' && (
                                                    <Tag color="error">账户已锁定</Tag>
                                                )}
                                            </div>

                                            <Space size={8}>
                                                {!isSelUserRoot && (
                                                    <Button
                                                        size="small"
                                                        type="primary"
                                                        icon={<Plus size={13} />}
                                                        onClick={() => setGrantModalOpen(true)}
                                                    >
                                                        关联/分配权限 (GRANT)
                                                    </Button>
                                                )}

                                                <Button
                                                    size="small"
                                                    icon={<KeyRound size={13} />}
                                                    onClick={() => setChangePwdUser({ user: selUser.user, host: selUser.host })}
                                                >
                                                    修改密码
                                                </Button>

                                                {grants && (
                                                    <Button
                                                        size="small"
                                                        icon={copied ? <Check size={12} /> : <Copy size={12} />}
                                                        onClick={handleCopyAll}
                                                    >
                                                        {copied ? '已复制' : '复制全部'}
                                                    </Button>
                                                )}

                                                {!isSelUserRoot && (
                                                    <Button
                                                        size="small"
                                                        danger
                                                        icon={<Trash2 size={12} />}
                                                        onClick={() => handleRevokeAll(selUser.user, selUser.host)}
                                                        title="撤销该用户的全部授权与转授权"
                                                    >
                                                        撤销全部权限
                                                    </Button>
                                                )}
                                            </Space>
                                        </div>

                                        <div className={my.grantsList}>
                                            {grantStatements.length > 0 ? (
                                                grantStatements.map((stmt, idx) => {
                                                    const isGrant = stmt.startsWith('GRANT ')
                                                    return (
                                                        <div key={idx} className={my.grantCard}>
                                                            <div className={my.grantCardHead}>
                                                                <div className={my.grantIdx}>
                                                                    <Tag color="cyan" style={{ margin: 0, fontSize: 10, lineHeight: '16px' }}>
                                                                        规则 #{idx + 1}
                                                                    </Tag>
                                                                </div>

                                                                <div className={my.grantCardActions}>
                                                                    <Button
                                                                        size="small"
                                                                        type="text"
                                                                        icon={copiedIdx === idx ? <Check size={12} /> : <Copy size={12} />}
                                                                        onClick={() => handleCopyCard(stmt, idx)}
                                                                        title="复制该条授权 SQL"
                                                                    />
                                                                    {!isSelUserRoot && isGrant && (
                                                                        <Tooltip title="撤销此项授权 (REVOKE)">
                                                                            <Button
                                                                                size="small"
                                                                                type="text"
                                                                                danger
                                                                                icon={<X size={13} />}
                                                                                onClick={() => handleRevokeSingleGrant(stmt, selUser.user, selUser.host)}
                                                                            />
                                                                        </Tooltip>
                                                                    )}
                                                                </div>
                                                            </div>

                                                            <pre className={my.grantText}>{stmt}</pre>
                                                        </div>
                                                    )
                                                })
                                            ) : (
                                                <div className={my.grantsPre}>{grants || '加载中…'}</div>
                                            )}
                                        </div>
                                    </>
                                )
                            })()}
                        </div>
                    ) : (
                        <div className={my.emptyPlaceholder}>
                            <User size={36} />
                            <span>选择左侧用户查看该用户的详细授权信息，或点击上方“新建用户”添加新账户</span>
                        </div>
                    )}
                </div>
            </div>

            {/* Create User Modal */}
            <CreateUserModal
                open={createUserOpen}
                sessionId={sessionId}
                onClose={() => setCreateUserOpen(false)}
                onSuccess={async (newUser, host) => {
                    notify(`用户 ${newUser}@${host} 创建成功`)
                    await onRefreshUsers()
                    onSelect(newUser, host)
                }}
            />

            {/* Grant Privileges Modal */}
            {selUser && (
                <GrantPrivilegesModal
                    open={grantModalOpen}
                    sessionId={sessionId}
                    user={selUser.user}
                    host={selUser.host}
                    databases={databases}
                    onClose={() => setGrantModalOpen(false)}
                    onSuccess={async () => {
                        notify(`已成功为 ${selUser.user}@${selUser.host} 授予权限`)
                        if (onRefreshGrants) await onRefreshGrants()
                    }}
                />
            )}

            {/* Change Password Modal */}
            {changePwdUser && (
                <ChangePasswordModal
                    open={!!changePwdUser}
                    sessionId={sessionId}
                    user={changePwdUser.user}
                    host={changePwdUser.host}
                    onClose={() => setChangePwdUser(null)}
                    onSuccess={() => {
                        notify(`用户 ${changePwdUser.user}@${changePwdUser.host} 密码修改成功`)
                    }}
                />
            )}
        </div>
    )
}
