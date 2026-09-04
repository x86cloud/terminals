import React, { useState } from 'react'
import { Button, Input, Select, Tag, Tooltip, message } from 'antd'
import { Trash2, X, Eye, Search } from 'lucide-react'
import { ConfirmModal, ConfirmState } from '@/components/Modal'
import ApiHistoryDrawer from './ApiHistoryDrawer'
import { formatHistoryTime } from './apiTypes'
import a from './ApiHistory.module.less'
import sh from './apiShared.module.less'
import type { ApiState } from './useApi'

export default function ApiHistory({ state }: { state: ApiState }) {
    const {
        history,
        filteredHistory,
        showHistory,
        setShowHistory,
        clearHistory,
        loadHistory,
        deleteHistory,
        historyKeyword,
        setHistoryKeyword,
        historyMethodFilter,
        setHistoryMethodFilter,
        drawerHistoryItem,
        setDrawerHistoryItem,
        historicalSnapshotTime,
    } = state

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

    const filterOptions = [
        { label: '全部', value: 'ALL' },
        { label: 'GET', value: 'GET' },
        { label: 'POST', value: 'POST' },
        { label: 'PUT', value: 'PUT' },
        { label: 'DELETE', value: 'DELETE' },
        { label: 'PATCH', value: 'PATCH' },
        { label: 'WS', value: 'WS' },
    ]

    return (
        <aside className={a.historyPanel}>
            {/* 顶部标题栏 */}
            <div className={a.historyHead}>
                <span className={a.historyTitle}>请求历史</span>
                <Tag color="geekblue">{history.length}</Tag>
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
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
                    <Tooltip title="收起历史面板">
                        <Button
                            size="small"
                            type="text"
                            icon={<X size={14} />}
                            onClick={() => setShowHistory(false)}
                        />
                    </Tooltip>
                </div>
            </div>

            {/* 搜索与过滤工具栏 */}
            <div className={a.searchBar}>
                <Input
                    size="small"
                    placeholder="搜索 URL..."
                    value={historyKeyword}
                    allowClear
                    prefix={<Search size={12} style={{ color: 'var(--text-faint)' }} />}
                    style={{ flex: 1 }}
                    onChange={(e) => setHistoryKeyword(e.target.value)}
                />
                <Select
                    size="small"
                    value={historyMethodFilter}
                    style={{ width: 85 }}
                    onChange={setHistoryMethodFilter}
                    options={filterOptions}
                />
            </div>

            {/* 历史列表 */}
            <div className={a.historyList}>
                {filteredHistory.length === 0 && (
                    <div className={sh.respEmpty}>
                        {history.length === 0 ? '暂无请求历史' : '无匹配的历史记录'}
                    </div>
                )}
                {filteredHistory.map((h, i) => {
                    const isWs = h.mode === 'ws' || h.method === ('WS' as any)
                    const isActive = historicalSnapshotTime === h.at

                    return (
                        <div
                            key={h.id || h.at || i}
                            className={`${a.historyItem} ${isActive ? a.historyItemActive : ''}`}
                            onClick={() => {
                                loadHistory(h)
                                message.info({ content: '已载入历史配置与响应快照', duration: 1.5 })
                            }}
                        >
                            {/* 顶部标签与操作按钮 */}
                            <div className={a.historyTop}>
                                <div className={a.historyTopLeft}>
                                    <Tag color={isWs ? 'geekblue' : methodColors[h.method] || 'default'} style={{ marginInlineEnd: 4 }}>
                                        {isWs ? 'WS' : h.method}
                                    </Tag>
                                    {h.error ? (
                                        <Tag color="error" style={{ marginInlineEnd: 0 }}>失败</Tag>
                                    ) : isWs ? (
                                        <Tag color={h.statusCode === 101 ? 'success' : 'default'} style={{ marginInlineEnd: 0 }}>
                                            {h.statusCode === 101 ? '已连' : '断开'}
                                        </Tag>
                                    ) : (
                                        <Tag
                                            color={h.statusCode >= 200 && h.statusCode < 300 ? 'success' : 'warning'}
                                            style={{ marginInlineEnd: 0 }}
                                        >
                                            {h.statusCode || '-'}
                                        </Tag>
                                    )}
                                </div>

                                <div className={a.itemActions}>
                                    <Tooltip title="查看完整报文详情">
                                        <Button
                                            size="small"
                                            type="text"
                                            icon={<Eye size={13} />}
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                setDrawerHistoryItem(h)
                                            }}
                                        />
                                    </Tooltip>
                                    <Tooltip title="删除此记录">
                                        <Button
                                            size="small"
                                            type="text"
                                            danger
                                            icon={<X size={12} />}
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                deleteHistory(h.id || i)
                                            }}
                                        />
                                    </Tooltip>
                                </div>
                            </div>

                            {/* 请求地址 */}
                            <span className={a.historyUrl} title={h.url}>
                                {h.url}
                            </span>

                            {/* 底部时间与耗时 */}
                            <div className={a.historyBottom}>
                                <span className={a.historyTime}>{formatHistoryTime(h.at)}</span>
                                {!isWs && h.durationMs > 0 && (
                                    <span className={a.historyDuration}>{h.durationMs}ms</span>
                                )}
                            </div>
                        </div>
                    )
                })}
            </div>

            {/* 历史详情抽屉 */}
            <ApiHistoryDrawer
                open={!!drawerHistoryItem}
                item={drawerHistoryItem}
                state={state}
                onClose={() => setDrawerHistoryItem(null)}
            />

            {/* 清空确认弹窗 */}
            <ConfirmModal
                state={confirm}
                onCancel={() => setConfirm({ open: false, title: '', message: '' })}
            />
        </aside>
    )
}
