import { useState, useEffect, useRef } from 'react'
import { Button, Progress, Tag, Tooltip } from 'antd'
import { Upload, Download, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Transfer } from '@/types'
import { formatSize } from '@/utils'
import g from '@/styles/global.module.less'
import tb from '@/components/TransferBar.module.less'

interface Props {
    transfers: Transfer[]
    onCancel: (id: string) => void
    onClear: () => void
}

export default function TransferBar({ transfers, onCancel, onClear }: Props) {
    const { t } = useTranslation('file')
    const [open, setOpen] = useState(false)
    const running = transfers.filter((t) => t.status === 'running')
    const prevRunningCount = useRef(0)

    const statusText: Record<string, string> = {
        running: t('transfers.running'),
        done: t('transfers.done'),
        error: t('transfers.error'),
        canceled: t('transfers.canceled'),
    }

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
                <span>{t('transfers.title')}</span>
                <span className={tb.badge}>
                    {running.length ? t('transfers.inProgress', { count: running.length }) : t('transfers.totalCount', { count: transfers.length })}
                </span>

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
                    {t('transfers.clear')}
                </Button>
                <span className={tb.chevron}>{open ? '▾' : '▴'}</span>
            </div>

            {open && (
                <div className={tb.transferList}>
                    {transfers.map((item) => {
                        const percent = item.size > 0
                            ? Math.min(100, Math.round((item.transferred / item.size) * 100))
                            : (item.status === 'done' ? 100 : 0)
                        return (
                            <div key={item.id} className={`${tb.transferItem} ${item.status}`}>
                                <span className={tb.tKind}>
                                    {item.kind === 'upload' ? <Upload size={13} /> : <Download size={13} />}
                                </span>
                                <span className={tb.tName} title={item.kind === 'upload' ? item.remotePath : item.localPath}>
                                    {item.name}
                                </span>
                                <span className={tb.tProgress} style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
                                    <Progress percent={percent} size="small" style={{ flex: 1, margin: 0, minWidth: 32 }} />
                                    <span className={tb.tSize}>
                                        {formatSize(item.transferred)} / {item.size > 0 ? formatSize(item.size) : '--'}
                                    </span>
                                </span>
                                <span className={tb.tStatus}>
                                    <Tag color={item.status === 'running' ? 'processing' : item.status === 'done' ? 'success' : 'error'}>
                                        {item.error || statusText[item.status] || item.status}
                                    </Tag>
                                </span>
                                <span className={tb.tAction}>
                                    {item.status === 'running' && (
                                        <Tooltip title={t('transfers.cancelTip')}>
                                            <Button
                                                size="small"
                                                type="text"
                                                danger
                                                icon={<X size={13} />}
                                                onClick={() => onCancel(item.id)}
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
