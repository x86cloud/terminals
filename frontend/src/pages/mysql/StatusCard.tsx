import React from 'react'
import my from './StatusCard.module.less'

export default function StatusCard({title, value}: { title: string; value: any }) {
    return (
        <div className={my.statusCard}>
            <div className={my.statusCardVal}>{value === undefined || value === null ? '-' : String(value)}</div>
            <div className={my.statusCardTitle}>{title}</div>
        </div>
    )
}
