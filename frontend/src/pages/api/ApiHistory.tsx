import React, { useState } from 'react'
import { Button, Tag, Tooltip } from 'antd'
import { Trash2, X } from 'lucide-react'
import { ConfirmModal, ConfirmState } from '@/components/Modal'
import a from '@/pages/api/ApiHistory.module.less'
import sh from '@/pages/api/apiShared.module.less'
import type { ApiState } from '@/pages/api/useApi'

export default function ApiHistory({ state }: { state: ApiState }) {
    const { history, showHistory, setShowHistory, clearHistory, loadHistory, deleteHistory } = state
    const [confirm, setConfirm] = useState<ConfirmState>({ open: false, title: '', message: '' })
    if (!showHistory) return null

    const methodColors: Record<string, string> = {
        GET: 'green',
        POST: 'orange',
        PUT: 'blue',
        DELETE: 'red',
        PATCH: 'purple',
        HEAD: 'cyan',
        OPTIONS: 'default',
        WS: 'geekblue',
    }

    return (
        <aside className={a.historyPanel}>
            <div className={a.historyHead} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px' }}>
                <span className={a.historyTitle} style={{ fontWeight: 600 }}>请求历史</span>
                <Tag color="geekblue">{history.length}</Tag>
                <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Tooltip title="清空历史">
                        <Button
                            size="small"
                            type="text"
                            icon={<Trash2 size={13} />}
                            disabled={history.length === 0}
                            onClick={() => {
                                setConfirm({
                                    open: true,
                                    title: '清空请求历史',
                                    danger: true,
                                    message: '确定要清空所有 API 请求历史记录吗？',
                                    onConfirm: () => {
                                        setConfirm({ open: false, title: '', message: '' })
                                        clearHistory()
                                    },
                                })
                            }}
                        />
                    </Tooltip>
                    <Tooltip title="关闭历史">
                        <Button size="small" type="text" icon={<X size={14} />} onClick={() => setShowHistory(false)} />
                    </Tooltip>
                </span>
            </div>
            <div className={a.historyList}>
                {history.length === 0 && <div className={sh.respEmpty}>暂无历史记录</div>}
                {history.map((h, i) => (
                    <div key={h.at || i} className={a.historyItem} title={h.url} onClick={() => loadHistory(h)}>
                        <div className={a.historyTop} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <Tag color={methodColors[h.method] || 'default'}>{h.method}</Tag>
                                {h.error ? (
                                    <Tag color="error">失败</Tag>
                                ) : (
                                    <Tag color={h.statusCode >= 200 && h.statusCode < 300 ? 'success' : 'warning'}>{h.statusCode}</Tag>
                                )}
                            </div>
                            <Tooltip title="删除">
                                <Button
                                    size="small"
                                    type="text"
                                    danger
                                    icon={<X size={12} />}
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        deleteHistory(i)
                                    }}
                                />
                            </Tooltip>
                        </div>
                        <span className={a.historyUrl}>{h.url}</span>
                    </div>
                ))}
            </div>
            <ConfirmModal state={confirm} onCancel={() => setConfirm({ open: false, title: '', message: '' })} />
        </aside>
    )
}
