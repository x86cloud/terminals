import React from 'react'
import { Terminal } from 'lucide-react'
import ab from './AboutTab.module.less'

export default function AboutTab() {
    return (
        <div className={ab.aboutBox}>
            <Terminal size={42}/>
            <div className={ab.appName}>xClient Terminal</div>
            <div className={ab.appVer}>v1.0.0 (Wails 2.13)</div>
            <div className={ab.appDesc}>
                一款跨平台的现代高颜值 Terminal 客户端，支持 SSH、Redis、MySQL、MongoDB、MQTT 及 SQLite 全套数据协同管理。
            </div>
        </div>
    )
}
