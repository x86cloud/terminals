import { useState, useEffect, useRef } from 'react'
import { Button, Progress, Tag, Tooltip } from 'antd'
import { Upload, Download, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Transfer } from '@/types'
import { formatSize } from '@/utils'
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
        running: t('transfers.running', { defaultValue: '传输中' }),
        done: t('transfers.done', { defaultValue: '已完成' }),
        error: t('transfers.error', { defaultValue: '失败' }),
        canceled: t('transfers.canceled', { defaultValue: '已取消' }),
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
        <div className={tb.capsuleWrapper}>
            {/* 嵌入底栏的紧凑胶囊按钮 */}
            <button
                type="button"
                className={`${tb.capsuleBtn}${running.length > 0 ? ' ' + tb.hasRunning : ''}`}
                onClick={() => setOpen((v) => !v)}
                title={t('transfers.title', { defaultValue: '传输列表' })}
            >
                <span className={tb.capsuleLabel}>
                    {running.length
                        ? t('transfers.inProgress', { count: running.length, defaultValue: `${running.length} 传输中` })
                        : t('transfers.totalCount', { count: transfers.length, defaultValue: `${transfers.length} 项完成` })}
                </span>

                {running.length > 0 && runningTotalSize > 0 && (
                    <span className={tb.capsuleProgress}>
                        <Progress
                            percent={runningPercent}
                            size="small"
                            showInfo={false}
                            style={{ width: 36, margin: 0 }}
                        />
                        <span className={tb.percentNum}>{runningPercent}%</span>
                    </span>
                )}

                <span className={tb.chevron}>{open ? '▾' : '▴'}</span>
            </button>

            {/* 向上浮动的传输任务详情抽屉卡片 */}
            {open && (
                <div className={tb.transferDrawer}>
                    <div className={tb.drawerHead}>
                        <div className={tb.drawerTitle}>
                            <span className={tb.drawerBadge}>
                                {running.length
                                    ? t('transfers.inProgress', { count: running.length, defaultValue: `${running.length} 进行中` })
                                    : t('transfers.totalCount', { count: transfers.length, defaultValue: `${transfers.length} 项` })}
                            </span>
                            <span>{t('transfers.title', { defaultValue: '文件传输' })}</span>
                            {running.length > 0 && runningTotalSize > 0 && (
                                <span className={tb.drawerMeta}>
                                    {runningPercent}% ({formatSize(runningTransferred)} / {formatSize(runningTotalSize)})
                                </span>
                            )}
                        </div>

                        <div className={tb.drawerActions}>
                            <Button
                                size="small"
                                type="text"
                                onClick={onClear}
                            >
                                {t('transfers.clear', { defaultValue: '清空' })}
                            </Button>
                            <Button
                                size="small"
                                type="text"
                                icon={<X size={13} />}
                                onClick={() => setOpen(false)}
                            />
                        </div>
                    </div>

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
                                    <span className={tb.tProgress}>
                                        <Progress percent={percent} size="small" style={{ flex: 1, margin: 0, minWidth: 28 }} />
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
                                            <Tooltip title={t('transfers.cancelTip', { defaultValue: '取消传输' })}>
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
                </div>
            )}
        </div>
    )
}
