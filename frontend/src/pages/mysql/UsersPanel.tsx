import { useState, useMemo } from 'react'
import { Button, Tag, Space, Tooltip, Input, Modal, App } from 'antd'
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
import { useTranslation } from 'react-i18next'
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
}: Props) {
    const { t } = useTranslation(['db', 'common'])
    const { message } = App.useApp()
    const [copied, setCopied] = useState(false)
    const [copiedIdx, setCopiedIdx] = useState<number | null>(null)
    const [searchKeyword, setSearchKeyword] = useState('')
    const [refreshing, setRefreshing] = useState(false)

    // Modals
    const [createUserOpen, setCreateUserOpen] = useState(false)
    const [grantModalOpen, setGrantModalOpen] = useState(false)
    const [changePwdUser, setChangePwdUser] = useState<{ user: string; host: string } | null>(null)

    const notify = (msg: string) => {
        message.success(msg)
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
            notify(t('db:mysql.users.copiedAllNotify'))
        } catch {
            /* ignore */
        }
    }

    const handleCopyCard = async (text: string, idx: number) => {
        try {
            await navigator.clipboard.writeText(text)
            setCopiedIdx(idx)
            setTimeout(() => setCopiedIdx(null), 1500)
            notify(t('db:mysql.users.copiedSingleNotify'))
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
        const actionText = currentLocked ? t('db:mysql.users.unlockAction') : t('db:mysql.users.lockAction')
        Modal.confirm({
            title: t('db:mysql.users.lockConfirmTitle', { action: actionText }),
            content: t('db:mysql.users.lockConfirmContent', { action: actionText, user: targetUser, host: targetHost }),
            okText: t('db:mysql.users.lockOk', { action: actionText }),
            cancelText: t('common:cancel'),
            onOk: async () => {
                try {
                    await API.mysqlToggleUserLock(sessionId, targetUser, targetHost, !currentLocked)
                    notify(t('db:mysql.users.lockSuccess', { user: targetUser, host: targetHost, action: actionText }))
                    await onRefreshUsers()
                } catch (e) {
                    notifyError(t('db:mysql.users.lockFailed', { action: actionText, error: errorMessage(e) }))
                }
            },
        })
    }

    // Drop user
    const handleDropUser = (targetUser: string, targetHost: string) => {
        Modal.confirm({
            title: t('db:mysql.users.dropConfirmTitle'),
            content: t('db:mysql.users.dropConfirmContent', { user: targetUser, host: targetHost }),
            okText: t('db:mysql.users.dropOk'),
            okType: 'danger',
            cancelText: t('common:cancel'),
            onOk: async () => {
                try {
                    await API.mysqlDropUser(sessionId, targetUser, targetHost)
                    notify(t('db:mysql.users.dropSuccess', { user: targetUser, host: targetHost }))
                    if (selUser?.user === targetUser && selUser?.host === targetHost) {
                        // reset selection if active
                        onSelect('', '')
                    }
                    await onRefreshUsers()
                } catch (e) {
                    notifyError(t('db:mysql.users.dropFailed', { error: errorMessage(e) }))
                }
            },
        })
    }

    // Revoke all privileges
    const handleRevokeAll = (targetUser: string, targetHost: string) => {
        Modal.confirm({
            title: t('db:mysql.users.revokeAllConfirmTitle'),
            content: t('db:mysql.users.revokeAllConfirmContent', { user: targetUser, host: targetHost }),
            okText: t('db:mysql.users.revokeAllOk'),
            okType: 'danger',
            cancelText: t('common:cancel'),
            onOk: async () => {
                try {
                    await API.mysqlRevokeAllPrivileges(sessionId, targetUser, targetHost)
                    notify(t('db:mysql.users.revokeAllSuccess', { user: targetUser, host: targetHost }))
                    if (onRefreshGrants) await onRefreshGrants()
                } catch (e) {
                    notifyError(t('db:mysql.users.revokeAllFailed', { error: errorMessage(e) }))
                }
            },
        })
    }

    // Revoke a single grant rule
    const handleRevokeSingleGrant = (stmt: string, targetUser: string, targetHost: string) => {
        let revokeSql = stmt
        if (stmt.startsWith('GRANT ')) {
            revokeSql = stmt.replace(/^GRANT\s+/i, 'REVOKE ')
            const lastToIndex = revokeSql.lastIndexOf(' TO ')
            if (lastToIndex !== -1) {
                revokeSql = revokeSql.substring(0, lastToIndex) + ' FROM ' + revokeSql.substring(lastToIndex + 4)
            }
        }

        Modal.confirm({
            title: t('db:mysql.users.revokeSingleConfirmTitle'),
            content: (
                <div>
                    <p>{t('db:mysql.users.revokeSingleDesc')}</p>
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
            okText: t('db:mysql.users.revokeSingleOk'),
            okType: 'danger',
            cancelText: t('common:cancel'),
            onOk: async () => {
                try {
                    await API.mysqlRun(sessionId, 'mysql', revokeSql)
                    await API.mysqlRun(sessionId, 'mysql', 'FLUSH PRIVILEGES')
                    notify(t('db:mysql.users.revokeSingleSuccess'))
                    if (onRefreshGrants) await onRefreshGrants()
                } catch (e) {
                    notifyError(t('db:mysql.users.revokeSingleFailed', { error: errorMessage(e) }))
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
                    <span>{t('db:mysql.users.title')}</span>
                    <Tag style={{ marginLeft: 4, borderRadius: 10, fontSize: 11 }}>
                        {t('db:mysql.users.userCount', { count: users.length })}
                    </Tag>
                </div>
                <Space size={8}>
                    <Button
                        size="small"
                        icon={<RotateCw size={13} className={refreshing ? 'spin-icon' : ''} />}
                        onClick={handleRefresh}
                        loading={refreshing}
                        title={t('db:mysql.users.refreshTooltip')}
                    >
                        {t('db:mysql.users.refresh')}
                    </Button>
                    <Button
                        size="small"
                        type="primary"
                        icon={<UserPlus size={13} />}
                        onClick={() => setCreateUserOpen(true)}
                    >
                        {t('db:mysql.users.newUser')}
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
                            placeholder={t('db:mysql.users.searchPlaceholder')}
                            value={searchKeyword}
                            onChange={(e) => setSearchKeyword(e.target.value)}
                            allowClear
                        />
                    </div>

                    {filteredUsers.length === 0 && (
                        <div className={`${sh.mysqlEmpty} ${my.small}`}>
                            {users.length === 0 ? t('db:mysql.users.noUsersNeedPriv') : t('db:mysql.users.noMatchingUsers')}
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
                                        <span className={my.userName}>{u.User || t('db:mysql.users.anonymous')}</span>
                                        {isRoot && (
                                            <Tag color="gold" style={{ fontSize: 10, lineHeight: '14px', padding: '0 3px', margin: 0 }}>
                                                {t('db:mysql.users.rootTag')}
                                            </Tag>
                                        )}
                                        {isLocked && <span className={my.lockBadge}>{t('db:mysql.users.lockedBadge')}</span>}
                                    </div>
                                    <span className={my.userHost}>@{u.Host}</span>
                                </div>

                                <div className={my.userQuickActions} onClick={(e) => e.stopPropagation()}>
                                    <Tooltip title={t('db:mysql.users.changePassword')}>
                                        <Button
                                            size="small"
                                            type="text"
                                            icon={<KeyRound size={12} />}
                                            onClick={() => setChangePwdUser({ user: u.User, host: u.Host })}
                                        />
                                    </Tooltip>
                                    {!isRoot && (
                                        <>
                                            <Tooltip title={isLocked ? t('db:mysql.users.unlockAccount') : t('db:mysql.users.lockAccount')}>
                                                <Button
                                                    size="small"
                                                    type="text"
                                                    icon={isLocked ? <Unlock size={12} /> : <Lock size={12} />}
                                                    onClick={() => handleToggleLock(u.User, u.Host, isLocked)}
                                                />
                                            </Tooltip>
                                            <Tooltip title={t('db:mysql.users.deleteUser')}>
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
                                                        {t('db:mysql.users.superAdminProtected')}
                                                    </Tag>
                                                )}
                                                {currentSelectedObj?.locked === 'Y' && (
                                                    <Tag color="error">{t('db:mysql.users.accountLocked')}</Tag>
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
                                                        {t('db:mysql.users.grantPrivileges')}
                                                    </Button>
                                                )}

                                                <Button
                                                    size="small"
                                                    icon={<KeyRound size={13} />}
                                                    onClick={() => setChangePwdUser({ user: selUser.user, host: selUser.host })}
                                                >
                                                    {t('db:mysql.users.changePassword')}
                                                </Button>

                                                {grants && (
                                                    <Button
                                                        size="small"
                                                        icon={copied ? <Check size={12} /> : <Copy size={12} />}
                                                        onClick={handleCopyAll}
                                                    >
                                                        {copied ? t('db:mysql.users.copied') : t('db:mysql.users.copyAll')}
                                                    </Button>
                                                )}

                                                {!isSelUserRoot && (
                                                    <Button
                                                        size="small"
                                                        danger
                                                        icon={<Trash2 size={12} />}
                                                        onClick={() => handleRevokeAll(selUser.user, selUser.host)}
                                                        title={t('db:mysql.users.revokeAllTooltip')}
                                                    >
                                                        {t('db:mysql.users.revokeAll')}
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
                                                                        {t('db:mysql.users.ruleNumber', { idx: idx + 1 })}
                                                                    </Tag>
                                                                </div>

                                                                <div className={my.grantCardActions}>
                                                                    <Button
                                                                        size="small"
                                                                        type="text"
                                                                        icon={copiedIdx === idx ? <Check size={12} /> : <Copy size={12} />}
                                                                        onClick={() => handleCopyCard(stmt, idx)}
                                                                        title={t('db:mysql.users.copyRuleTooltip')}
                                                                    />
                                                                    {!isSelUserRoot && isGrant && (
                                                                        <Tooltip title={t('db:mysql.users.revokeRuleTooltip')}>
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
                                                <div className={my.grantsPre}>{grants || t('common:loading')}</div>
                                            )}
                                        </div>
                                    </>
                                )
                            })()}
                        </div>
                    ) : (
                        <div className={my.emptyPlaceholder}>
                            <User size={36} />
                            <span>{t('db:mysql.users.emptySelectHint')}</span>
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
                    notify(t('db:mysql.users.createdSuccess', { user: newUser, host }))
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
                        notify(t('db:mysql.users.grantSuccess', { user: selUser.user, host: selUser.host }))
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
                        notify(t('db:mysql.users.pwdSuccess', { user: changePwdUser.user, host: changePwdUser.host }))
                    }}
                />
            )}
        </div>
    )
}
