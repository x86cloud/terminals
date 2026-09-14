import React, { useState, useEffect, useRef } from 'react'
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
    const prevRunningCount = useRef(0)

    // 当有新传输任务启动（进行中任务增加）时，自动展开面板
    useEffect(() => {
        if (running.length > prevRunningCount.current && running.length > 0) {
            setOpen(true)
        }
        prevRunningCount.current = running.length
    }, [running.length])

    if (transfers.length === 0) return null

    // 计算当前所有正在传输任务的总进度摘要
    const runningTotalSize = running.reduce((sum, t) => sum + (t.size > 0 ? t.size : 0), 0)
    const runningTransferred = running.reduce((sum, t) => sum + t.transferred, 0)
    const runningPercent = runningTotalSize > 0 ? Math.min(100, Math.round((runningTransferred / runningTotalSize) * 100)) : 0

    return (
        <div className={`${tb.transferBar}${open ? ' ' + tb.open : ''}`}>
            <div className={tb.transferHead} onClick={() => setOpen((v) => !v)}>
                {running.length ? <Upload size={15} /> : <Download size={15} />}
                <span>传输任务</span>
                <span className={tb.badge}>{running.length ? `${running.length} 进行中` : `${transfers.length} 条`}</span>

                {/* 头部进度摘要展示：无论是折叠还是展开均能直观看到总进度 */}
                {running.length > 0 && runningTotalSize > 0 && (
                    <div className={tb.headProgress} onClick={(e) => e.stopPropagation()}>
                        <Progress percent={runningPercent} size="small" showInfo={false} style={{ width: 60, flexShrink: 0, margin: 0 }} />
                        <span className={tb.headProgressText}>
                            {runningPercent}% ({formatSize(runningTransferred)} / {formatSize(runningTotalSize)})
                        </span>
                    </div>
                )}

                <span className={g.spacer} />
                <Button
                    size="small"
                    onClick={(e) => {
                        e.stopPropagation()
                        onClear()
                    }}
                >
                    清除
                </Button>
                <span className={tb.chevron}>{open ? '▾' : '▴'}</span>
            </div>

            {open && (
                <div className={tb.transferList}>
                    {transfers.map((t) => {
                        const percent = t.size > 0
                            ? Math.min(100, Math.round((t.transferred / t.size) * 100))
                            : (t.status === 'done' ? 100 : 0)
                        return (
                            <div key={t.id} className={`${tb.transferItem} ${t.status}`}>
                                <span className={tb.tKind}>
                                    {t.kind === 'upload' ? <Upload size={13} /> : <Download size={13} />}
                                </span>
                                <span className={tb.tName} title={t.kind === 'upload' ? t.remotePath : t.localPath}>
                                    {t.name}
                                </span>
                                <span className={tb.tProgress} style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
                                    <Progress percent={percent} size="small" style={{ flex: 1, margin: 0, minWidth: 32 }} />
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
