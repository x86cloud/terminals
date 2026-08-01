import React, {useState} from 'react'
import Icon from './Icon'
import {Transfer} from '../types'
import {formatSize} from '../utils'
import g from '../styles/global.module.less'
import tb from '../styles/TransferBar.module.less'

interface Props {
    transfers: Transfer[]
    onCancel: (id: string) => void
    onClear: () => void
}

const STATUS_TEXT: Record<string, string> = {
    running: '传输中',
    done: '已完成',
    error: '失败',
    canceled: '已取消',
}

export default function TransferBar({transfers, onCancel, onClear}: Props) {
    const [open, setOpen] = useState(false)
    const running = transfers.filter((t) => t.status === 'running')

    if (transfers.length === 0) return null

    return (
        <div className={`${tb.transferBar}${open ? ' ' + tb.open : ''}`}>
            <div className={tb.transferHead} onClick={() => setOpen((v) => !v)}>
                <Icon name={running.length ? 'upload' : 'download'} size={15}/>
                <span>传输任务</span>
                <span className={tb.badge}>{running.length ? `${running.length} 进行中` : `${transfers.length} 条`}</span>
                <span className={g.spacer}/>
                <button
                    className={`${g.btn} ${g.small}`}
                    onClick={(e) => {
                        e.stopPropagation()
                        onClear()
                    }}
                >
                    清除已完成
                </button>
                <span className={tb.chevron}>{open ? '▾' : '▴'}</span>
            </div>

            {open && (
                <div className={tb.transferList}>
                    {transfers.map((t) => {
                        const percent = t.size > 0 ? Math.min(100, (t.transferred / t.size) * 100) : 0
                        return (
                            <div key={t.id} className={`${tb.transferItem} ${t.status}`}>
                                <span className={tb.tKind}>
                                    <Icon name={t.kind === 'upload' ? 'upload' : 'download'} size={14}/>
                                </span>
                                <span className={tb.tName} title={t.kind === 'upload' ? t.remotePath : t.localPath}>
                                    {t.name}
                                </span>
                                <span className={tb.tProgress}>
                                    <span className={tb.tBar}>
                                        <span className={tb.tBarInner} style={{width: `${percent}%`}}/>
                                    </span>
                                    <span className={tb.tSize}>
                                        {formatSize(t.transferred)} / {t.size > 0 ? formatSize(t.size) : '--'}
                                    </span>
                                </span>
                                <span className={tb.tStatus}>{t.error || STATUS_TEXT[t.status] || t.status}</span>
                                <span className={tb.tAction}>
                                    {t.status === 'running' && (
                                        <button className={g.iconBtn} title="取消" onClick={() => onCancel(t.id)}>
                                            <Icon name="close" size={14}/>
                                        </button>
                                    )}
                                </span>
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
