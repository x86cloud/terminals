import React from 'react'
import { Server } from 'lucide-react'
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
    return (
        <div className={my.mgmtWrap}>
            <div className={my.mgmtHead}>用户与权限</div>
            <div className={my.mgmtBody}>
                <div className={my.userList}>
                    {users.length === 0 && <div className={`${sh.mysqlEmpty} ${my.small}`}>暂无用户（需 mysql 库权限）</div>}
                    {users.map((u, i) => (
                        <button
                            key={i}
                            className={`${my.userItem}${selUser?.user === u.User && selUser?.host === u.Host ? ' ' + my.active : ''}`}
                            onClick={() => onSelect(u.User, u.Host)}
                        >
                            <Server size={13}/>
                            <span>{u.User}</span>
                            <span className={my.userHost}>@{u.Host}</span>
                            {u.locked === 'Y' && <span className={my.lockBadge}>锁</span>}
                        </button>
                    ))}
                </div>
                <div className={my.grantsBox}>
                    {selUser ? (
                        <>
                            <div className={my.grantsHead}>{selUser.user}@{selUser.host} 的权限</div>
                            <pre className={my.grantsPre}>{grants || '加载中…'}</pre>
                        </>
                    ) : (
                        <div className={`${sh.mysqlEmpty} ${my.small}`}>选择左侧用户查看权限</div>
                    )}
                </div>
            </div>
        </div>
    )
}
