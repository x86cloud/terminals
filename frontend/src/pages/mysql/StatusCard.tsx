import React from 'react'
import my from './StatusCard.module.less'

export default function StatusCard({
    title,
    value,
    subValue,
    icon,
    variant = 'default',
    progress,
}: {
    title: string
    value: any
    subValue?: string
    icon?: React.ReactNode
    variant?: 'default' | 'accent' | 'warning' | 'danger' | 'success'
    progress?: number
}) {
    return (
        <div className={`${my.statusCard} ${my[variant]}`}>
            <div className={my.statusCardHeader}>
                <span className={my.statusCardTitle}>{title}</span>
                {icon && <span className={my.statusCardIcon}>{icon}</span>}
            </div>
            <div className={my.statusCardVal}>
                {value === undefined || value === null || value === '' ? '-' : String(value)}
            </div>
            {progress !== undefined && (
                <div className={my.progressBar}>
                    <div className={my.progressFill} style={{ width: `${Math.min(100, Math.max(0, progress))}%` }} />
                </div>
            )}
            {subValue && <div className={my.statusCardSub}>{subValue}</div>}
        </div>
    )
}
