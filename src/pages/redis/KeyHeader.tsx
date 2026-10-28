import { useState, useMemo } from 'react'
import { Button, Tooltip, Popover, Input, InputNumber, Popconfirm, Modal, App } from 'antd'
import { Copy, Check, Clock, RefreshCw, Trash2, Edit2, Database } from 'lucide-react'
import { useTranslation } from 'react-i18next'
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

export default function KeyHeader({
    session,
    selected,
    value,
    onReload,
    onKeyRenamed,
    onKeyDeleted,
}: Props) {
    const { t } = useTranslation('redis')
    const { message } = App.useApp()
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

    const ttlPresets = useMemo(() => [
        { label: t('header.ttlForever'), value: -1 },
        { label: t('header.preset1m'), value: 60 },
        { label: t('header.preset1h'), value: 3600 },
        { label: t('header.preset1d'), value: 86400 },
        { label: t('header.preset7d'), value: 604800 },
        { label: t('header.preset30d'), value: 2592000 },
    ], [t])

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(selected)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
            message.success(t('header.copiedKey'))
        } catch {
            message.error(t('viewers.string.copyFail'))
        }
    }

    const handleUpdateTtl = async () => {
        setUpdatingTtl(true)
        try {
            await API.redisExpire(session.id, selected, newTtl)
            message.success(newTtl === -1 ? t('header.ttlPermanentSuccess') : t('header.ttlSuccess', { ttl: newTtl }))
            setTtlPopoverOpen(false)
            onReload()
        } catch (e: any) {
            message.error(t('header.ttlFail', { error: e?.message || e }))
        } finally {
            setUpdatingTtl(false)
        }
    }

    const handleRename = async () => {
        const trimmed = renameVal.trim()
        if (!trimmed) {
            message.warning(t('header.reqKeyName'))
            return
        }
        if (trimmed === selected) {
            setRenameOpen(false)
            return
        }
        setRenaming(true)
        try {
            await API.redisRenameKey(session.id, selected, trimmed)
            message.success(t('header.renameSuccess', { key: trimmed }))
            setRenameOpen(false)
            if (onKeyRenamed) onKeyRenamed(trimmed)
        } catch (e: any) {
            message.error(t('header.renameFail', { error: e?.message || e }))
        } finally {
            setRenaming(false)
        }
    }

    const handleDeleteKey = async () => {
        try {
            await API.redisDelete(session.id, selected)
            message.success(t('client.deleteKeyConfirm', { key: selected }))
            if (onKeyDeleted) onKeyDeleted()
        } catch (e: any) {
            message.error(t('client.deleteFail', { error: e?.message || e }))
        }
    }

    // Size / Count text
    const sizeSummary = (() => {
        if (value.type === 'string') {
            const bytes = typeof value.value === 'string' ? new Blob([value.value]).size : (value.size || 0)
            return formatBytes(bytes)
        }
        if (value.size !== undefined && value.size !== null) {
            return t('header.itemCount', { count: value.size })
        }
        return null
    })()

    const ttlPopoverContent = (
        <div style={{ width: 220, display: 'flex', flexDirection: 'column', gap: 10, padding: 4 }}>
            <div style={{ fontWeight: 600, fontSize: 13 }}>{t('header.changeTtlTitle')}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
                {ttlPresets.map((p) => (
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
                <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{t('header.customSeconds')}</span>
                <InputNumber
                    size="small"
                    style={{ flex: 1 }}
                    value={newTtl}
                    onChange={(v) => setNewTtl(v ?? -1)}
                />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 4 }}>
                <Button size="small" onClick={() => setTtlPopoverOpen(false)}>
                    {t('viewers.common.cancel')}
                </Button>
                <Button size="small" type="primary" loading={updatingTtl} onClick={handleUpdateTtl}>
                    {t('header.apply')}
                </Button>
            </div>
        </div>
    )

    return (
        <div className={h.header}>
            <div className={h.leftSection}>
                <Tooltip title={t('header.dataType', { type: TYPE_LABEL[value.type] || value.type })}>
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

                <Tooltip title={copied ? t('viewers.common.copied') : t('header.copyKey')}>
                    <Button
                        size="small"
                        type="text"
                        icon={copied ? <Check size={13} style={{ color: 'var(--ok)' }} /> : <Copy size={13} />}
                        onClick={handleCopy}
                    />
                </Tooltip>

                <Tooltip title={t('header.renameKey')}>
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
                    <Tooltip title={t('header.dataSizeTooltip')}>
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
                    <Tooltip title={t('header.ttlTooltip')}>
                        <span className={h.ttlTag}>
                            <Clock size={11} style={{ color: ttlInfo.isPermanent ? 'var(--ok)' : 'var(--warn)' }} />
                            TTL: {ttlInfo.text}
                        </span>
                    </Tooltip>
                </Popover>

                <Tooltip title={t('header.reloadTooltip')}>
                    <Button size="small" icon={<RefreshCw size={13} />} onClick={onReload} />
                </Tooltip>

                <Popconfirm
                    title={t('header.deleteConfirmDesc', { key: selected })}
                    onConfirm={handleDeleteKey}
                    okText={t('viewers.common.delete')}
                    cancelText={t('viewers.common.cancel')}
                    okButtonProps={{ danger: true }}
                >
                    <Button size="small" danger icon={<Trash2 size={13} />}>
                        {t('viewers.common.delete')}
                    </Button>
                </Popconfirm>
            </div>

            {/* Rename Modal */}
            <Modal
                title={t('header.renameModalTitle')}
                open={renameOpen}
                onOk={handleRename}
                confirmLoading={renaming}
                onCancel={() => setRenameOpen(false)}
                okText={t('header.confirmRename')}
                cancelText={t('viewers.common.cancel')}
            >
                <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 6 }}>{t('header.newKeyName')}</div>
                    <Input
                        value={renameVal}
                        onChange={(e) => setRenameVal(e.target.value)}
                        onPressEnter={handleRename}
                        placeholder={t('header.newKeyPlaceholder')}
                    />
                </div>
            </Modal>
        </div>
    )
}
