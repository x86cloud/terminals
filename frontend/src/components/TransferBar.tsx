import React, { useState } from 'react'
import { Button, Progress, Tag, Tooltip } from 'antd'
import { Upload, Download, X } from 'lucide-react'
import { Transfer } from '@/types'
import { formatSize } from '@/utils'
import g from '@/styles/global.module.less'
import tb from '@/components/TransferBar.module.less'

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

export default function TransferBar({ transfers, onCancel, onClear }: Props) {
    const [open, setOpen] = useState(false)
    const running = transfers.filter((t) => t.status === 'running')

    if (transfers.length === 0) return null

    return (
        <div className={`${tb.transferBar}${open ? ' ' + tb.open : ''}`}>
            <div className={tb.transferHead} onClick={() => setOpen((v) => !v)}>
                {running.length ? <Upload size={15} /> : <Download size={15} />}
                <span>传输任务</span>
                <span className={tb.badge}>{running.length ? `${running.length} 进行中` : `${transfers.length} 条`}</span>
                <span className={g.spacer} />
                <Button
                    size="small"
                    onClick={(e) => {
                        e.stopPropagation()
                        onClear()
                    }}
                >
                    清除已完成
                </Button>
                <span className={tb.chevron}>{open ? '▾' : '▴'}</span>
            </div>

            {open && (
                <div className={tb.transferList}>
                    {transfers.map((t) => {
                        const percent = t.size > 0 ? Math.min(100, Math.round((t.transferred / t.size) * 100)) : 0
                        return (
                            <div key={t.id} className={`${tb.transferItem} ${t.status}`}>
                                <span className={tb.tKind}>
                                    {t.kind === 'upload' ? <Upload size={14} /> : <Download size={14} />}
                                </span>
                                <span className={tb.tName} title={t.kind === 'upload' ? t.remotePath : t.localPath}>
                                    {t.name}
                                </span>
                                <span className={tb.tProgress} style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 140 }}>
                                    <Progress percent={percent} size="small" style={{ flex: 1, margin: 0 }} />
                                    <span className={tb.tSize}>
                                        {formatSize(t.transferred)} / {t.size > 0 ? formatSize(t.size) : '--'}
                                    </span>
                                </span>
                                <span className={tb.tStatus}>
                                    <Tag color={t.status === 'running' ? 'processing' : t.status === 'done' ? 'success' : 'error'}>
                                        {t.error || STATUS_TEXT[t.status] || t.status}
                                    </Tag>
                                </span>
                                <span className={tb.tAction}>
                                    {t.status === 'running' && (
                                        <Tooltip title="取消传输">
                                            <Button
                                                size="small"
                                                type="text"
                                                danger
                                                icon={<X size={13} />}
                                                onClick={() => onCancel(t.id)}
                                            />
                                        </Tooltip>
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
