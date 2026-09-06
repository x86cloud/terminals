import React, { useState } from 'react'
import { Button, Tooltip, Popover, Input, InputNumber, Space, Popconfirm, message, Modal } from 'antd'
import { Copy, Check, Clock, RefreshCw, Trash2, Edit2, Database } from 'lucide-react'
import { API } from '@/api'
import { RedisSessionInfo, RedisValue } from '@/types'
import { TYPE_COLOR, TYPE_LABEL, TYPE_SHORT_LABEL, formatTtl, formatBytes } from './redisTypes'
import h from './KeyHeader.module.less'

interface Props {
    session: RedisSessionInfo
    selected: string
    value: RedisValue
    onReload: () => void
    onKeyRenamed?: (newKey: string) => void
    onKeyDeleted?: () => void
}

const TTL_PRESETS = [
    { label: '永久 (-1)', value: -1 },
    { label: '1 分钟', value: 60 },
    { label: '1 小时', value: 3600 },
    { label: '1 天', value: 86400 },
    { label: '7 天', value: 604800 },
    { label: '30 天', value: 2592000 },
]

export default function KeyHeader({
    session,
    selected,
    value,
    onReload,
    onKeyRenamed,
    onKeyDeleted,
}: Props) {
    const [copied, setCopied] = useState(false)
    const [ttlPopoverOpen, setTtlPopoverOpen] = useState(false)
    const [newTtl, setNewTtl] = useState<number>(value.ttl)
    const [updatingTtl, setUpdatingTtl] = useState(false)

    // Rename
    const [renameOpen, setRenameOpen] = useState(false)
    const [renameVal, setRenameVal] = useState(selected)
    const [renaming, setRenaming] = useState(false)

    const typeColor = TYPE_COLOR[value.type] || TYPE_COLOR.string
    const ttlInfo = formatTtl(value.ttl)

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(selected)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
            message.success('已复制键名')
        } catch {
            message.error('复制失败')
        }
    }

    const handleUpdateTtl = async () => {
        setUpdatingTtl(true)
        try {
            await API.redisExpire(session.id, selected, newTtl)
            message.success(`已更新 TTL 为: ${newTtl === -1 ? '永久有效' : newTtl + '秒'}`)
            setTtlPopoverOpen(false)
            onReload()
        } catch (e: any) {
            message.error('更新 TTL 失败: ' + (e?.message || e))
        } finally {
            setUpdatingTtl(false)
        }
    }

    const handleRename = async () => {
        const trimmed = renameVal.trim()
        if (!trimmed) {
            message.warning('键名不能为空')
            return
        }
        if (trimmed === selected) {
            setRenameOpen(false)
            return
        }
        setRenaming(true)
        try {
            await API.redisRenameKey(session.id, selected, trimmed)
            message.success(`键已重命名为: [${trimmed}]`)
            setRenameOpen(false)
            if (onKeyRenamed) onKeyRenamed(trimmed)
        } catch (e: any) {
            message.error('重命名失败: ' + (e?.message || e))
        } finally {
            setRenaming(false)
        }
    }

    const handleDeleteKey = async () => {
        try {
            await API.redisDelete(session.id, selected)
            message.success(`已删除键 [${selected}]`)
            if (onKeyDeleted) onKeyDeleted()
        } catch (e: any) {
            message.error('删除失败: ' + (e?.message || e))
        }
    }

    // Size / Count text
    const sizeSummary = (() => {
        if (value.type === 'string') {
            const bytes = typeof value.value === 'string' ? new Blob([value.value]).size : (value.size || 0)
            return formatBytes(bytes)
        }
        if (value.size !== undefined && value.size !== null) {
            return `${value.size} 项`
        }
        return null
    })()

    const ttlPopoverContent = (
        <div style={{ width: 220, display: 'flex', flexDirection: 'column', gap: 10, padding: 4 }}>
            <div style={{ fontWeight: 600, fontSize: 13 }}>修改过期时间 (EXPIRE)</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
                {TTL_PRESETS.map((p) => (
                    <Button
                        key={p.value}
                        size="small"
                        type={newTtl === p.value ? 'primary' : 'default'}
                        onClick={() => setNewTtl(p.value)}
                    >
                        {p.label}
                    </Button>
                ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>自定义(秒):</span>
                <InputNumber
                    size="small"
                    style={{ flex: 1 }}
                    value={newTtl}
                    onChange={(v) => setNewTtl(v ?? -1)}
                />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 4 }}>
                <Button size="small" onClick={() => setTtlPopoverOpen(false)}>
                    取消
                </Button>
                <Button size="small" type="primary" loading={updatingTtl} onClick={handleUpdateTtl}>
                    应用修改
                </Button>
            </div>
        </div>
    )

    return (
        <div className={h.header}>
            <div className={h.leftSection}>
                <Tooltip title={`数据类型: ${TYPE_LABEL[value.type] || value.type}`}>
                    <span
                        className={h.typeBadge}
                        style={{
                            backgroundColor: typeColor.bg,
                            color: typeColor.text,
                            border: `1px solid ${typeColor.border}`,
                        }}
                    >
                        {TYPE_SHORT_LABEL[value.type] || value.type.toUpperCase()}
                    </span>
                </Tooltip>

                <span className={h.keyName} title={selected}>
                    {selected}
                </span>

                <Tooltip title={copied ? '已复制' : '复制键名'}>
                    <Button
                        size="small"
                        type="text"
                        icon={copied ? <Check size={13} style={{ color: 'var(--ok)' }} /> : <Copy size={13} />}
                        onClick={handleCopy}
                    />
                </Tooltip>

                <Tooltip title="重命名键 (RENAME)">
                    <Button
                        size="small"
                        type="text"
                        icon={<Edit2 size={13} />}
                        onClick={() => {
                            setRenameVal(selected)
                            setRenameOpen(true)
                        }}
                    />
                </Tooltip>
            </div>

            <div className={h.rightSection}>
                {sizeSummary && (
                    <Tooltip title="数据大小或元素条目数">
                        <span className={h.sizeTag}>
                            <Database size={11} />
                            {sizeSummary}
                        </span>
                    </Tooltip>
                )}

                <Popover
                    content={ttlPopoverContent}
                    trigger="click"
                    open={ttlPopoverOpen}
                    onOpenChange={(open) => {
                        setTtlPopoverOpen(open)
                        if (open) setNewTtl(value.ttl)
                    }}
                >
                    <Tooltip title="点击快速修改 TTL (EXPIRE)">
                        <span className={h.ttlTag}>
                            <Clock size={11} style={{ color: ttlInfo.isPermanent ? 'var(--ok)' : 'var(--warn)' }} />
                            TTL: {ttlInfo.text}
                        </span>
                    </Tooltip>
                </Popover>

                <Tooltip title="重新加载数据">
                    <Button size="small" icon={<RefreshCw size={13} />} onClick={onReload} />
                </Tooltip>

                <Popconfirm
                    title={`确认删除键 [${selected}]？该操作不可撤销！`}
                    onConfirm={handleDeleteKey}
                    okText="删除"
                    cancelText="取消"
                    okButtonProps={{ danger: true }}
                >
                    <Button size="small" danger icon={<Trash2 size={13} />}>
                        删除
                    </Button>
                </Popconfirm>
            </div>

            {/* Rename Modal */}
            <Modal
                title="重命名键 (RENAME)"
                open={renameOpen}
                onOk={handleRename}
                confirmLoading={renaming}
                onCancel={() => setRenameOpen(false)}
                okText="确认重命名"
                cancelText="取消"
            >
                <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 6 }}>新键名:</div>
                    <Input
                        value={renameVal}
                        onChange={(e) => setRenameVal(e.target.value)}
                        onPressEnter={handleRename}
                        placeholder="输入新的键名称..."
                    />
                </div>
            </Modal>
        </div>
    )
}
