import React from 'react'
import AppLogo from '@/components/AppLogo'
import ab from './AboutTab.module.less'

export default function AboutTab() {
    return (
        <div className={ab.aboutBox}>
            <AppLogo size={48} />
            <div className={ab.appName}>xClient </div>
            <div className={ab.appVer}>v1.0.0 (Wails v3)</div>
            <div className={ab.appDesc}>
                一款跨平台的现代高颜值客户端，支持 SSH、Redis、MySQL、MongoDB、MQTT 及 SQLite 全套数据协同管理。
            </div>
        </div>
    )
}
