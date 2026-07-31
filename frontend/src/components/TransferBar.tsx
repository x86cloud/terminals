import React, {useState} from 'react'
import Icon from './Icon'
import {Transfer} from '../types'
import {formatSize} from '../utils'

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
        <div className={`transfer-bar${open ? ' open' : ''}`}>
            <div className="transfer-head" onClick={() => setOpen((v) => !v)}>
                <Icon name={running.length ? 'upload' : 'download'} size={15}/>
                <span>传输任务</span>
                <span className="badge">{running.length ? `${running.length} 进行中` : `${transfers.length} 条`}</span>
                <span className="spacer"/>
                <button
                    className="btn small"
                    onClick={(e) => {
                        e.stopPropagation()
                        onClear()
                    }}
                >
                    清除已完成
                </button>
                <span className="chevron">{open ? '▾' : '▴'}</span>
            </div>

            {open && (
                <div className="transfer-list">
                    {transfers.map((t) => {
                        const percent = t.size > 0 ? Math.min(100, (t.transferred / t.size) * 100) : 0
                        return (
                            <div key={t.id} className={`transfer-item ${t.status}`}>
                                <span className="t-kind">
                                    <Icon name={t.kind === 'upload' ? 'upload' : 'download'} size={14}/>
                                </span>
                                <span className="t-name" title={t.kind === 'upload' ? t.remotePath : t.localPath}>
                                    {t.name}
                                </span>
                                <span className="t-progress">
                                    <span className="t-bar">
                                        <span className="t-bar-inner" style={{width: `${percent}%`}}/>
                                    </span>
                                    <span className="t-size">
                                        {formatSize(t.transferred)} / {t.size > 0 ? formatSize(t.size) : '--'}
                                    </span>
                                </span>
                                <span className="t-status">{t.error || STATUS_TEXT[t.status] || t.status}</span>
                                <span className="t-action">
                                    {t.status === 'running' && (
                                        <button className="icon-btn" title="取消" onClick={() => onCancel(t.id)}>
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
