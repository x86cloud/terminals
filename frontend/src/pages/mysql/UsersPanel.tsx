import React, { useState } from 'react'
import { Server, Copy, Check, ShieldCheck, User } from 'lucide-react'
import g from '@/styles/global.module.less'
import my from './UsersPanel.module.less'
import sh from './mysqlShared.module.less'

export default function UsersPanel({
    users,
    selUser,
    grants,
    onSelect,
}: {
    users: Record<string, any>[]
    selUser: { user: string; host: string } | null
    grants: string
    onSelect: (user: string, host: string) => void
}) {
    const [copied, setCopied] = useState(false)

    const handleCopy = async () => {
        if (!grants) return
        try {
            await navigator.clipboard.writeText(grants)
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
        } catch {
            /* ignore */
        }
    }

    const grantStatements = grants ? grants.split('\n').map((s) => s.trim()).filter(Boolean) : []

    return (
        <div className={my.mgmtWrap}>
            <div className={my.mgmtHead}>
                <div className={my.headTitle}>
                    <ShieldCheck size={15} />
                    <span>MySQL 用户与权限管理</span>
                </div>
                <div className={my.userCount}>共 {users.length} 个用户</div>
            </div>
            <div className={my.mgmtBody}>
                <div className={my.userList}>
                    {users.length === 0 && <div className={`${sh.mysqlEmpty} ${my.small}`}>暂无用户（需 mysql 系统库权限）</div>}
                    {users.map((u, i) => {
                        const isSelected = selUser?.user === u.User && selUser?.host === u.Host
                        return (
                            <button
                                key={`${u.User}-${u.Host}-${i}`}
                                className={`${my.userItem}${isSelected ? ' ' + my.active : ''}`}
                                onClick={() => onSelect(u.User, u.Host)}
                                title={`${u.User}@${u.Host}`}
                            >
                                <User size={14} className={my.userIcon} />
                                <div className={my.userMeta}>
                                    <span className={my.userName}>{u.User || '(空)'}</span>
                                    <span className={my.userHost}>@{u.Host}</span>
                                </div>
                                {u.locked === 'Y' && <span className={my.lockBadge}>已锁定</span>}
                            </button>
                        )
                    })}
                </div>
                <div className={my.grantsBox}>
                    {selUser ? (
                        <div className={my.grantsInner}>
                            <div className={my.grantsHead}>
                                <div className={my.grantsTitle}>
                                    <span>{selUser.user}@{selUser.host}</span> 的授权语句 (SHOW GRANTS)
                                </div>
                                {grants && (
                                    <button
                                        className={`${g.btn} ${g.xs}`}
                                        onClick={handleCopy}
                                        title="复制完整授权语句"
                                    >
                                        {copied ? <Check size={12} /> : <Copy size={12} />}
                                        <span>{copied ? '已复制' : '复制语句'}</span>
                                    </button>
                                )}
                            </div>
                            <div className={my.grantsList}>
                                {grantStatements.length > 0 ? (
                                    grantStatements.map((stmt, idx) => (
                                        <div key={idx} className={my.grantCard}>
                                            <div className={my.grantIdx}>#{idx + 1}</div>
                                            <pre className={my.grantText}>{stmt}</pre>
                                        </div>
                                    ))
                                ) : (
                                    <div className={my.grantsPre}>{grants || '加载中…'}</div>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className={my.emptyPlaceholder}>
                            <User size={32} />
                            <span>选择左侧用户查看该用户的详细授权信息</span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
