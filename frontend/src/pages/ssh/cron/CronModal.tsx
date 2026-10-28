import { useEffect, useState } from 'react'
import { Modal, Input, Tag, Space } from 'antd'
import { useTranslation } from 'react-i18next'
import i18n from '@/i18n'
import { SSHCronItem } from '@/types'

interface Props {
    open: boolean
    item: SSHCronItem | null
    onSave: (item: Partial<SSHCronItem>) => void
    onClose: () => void
}

const PRESETS = [
    { get label() { return i18n.t('ssh:cron.preset5m', { defaultValue: '每5分钟 (5m)' }) }, expr: '*/5 * * * *' },
    { get label() { return i18n.t('ssh:cron.preset15m', { defaultValue: '每15分钟 (15m)' }) }, expr: '*/15 * * * *' },
    { get label() { return i18n.t('ssh:cron.presetHourly', { defaultValue: '每小时整点 (Hourly)' }) }, expr: '0 * * * *' },
    { get label() { return i18n.t('ssh:cron.presetDaily', { defaultValue: '每天0点 (Daily)' }) }, expr: '0 0 * * *' },
    { get label() { return i18n.t('ssh:cron.presetWeekly', { defaultValue: '每周一0点 (Weekly)' }) }, expr: '0 0 * * 1' },
    { get label() { return i18n.t('ssh:cron.presetMonthly', { defaultValue: '每月1日0点 (Monthly)' }) }, expr: '0 0 1 * *' },
]

export function explainCron(expr: string): string {
    const trimmed = expr.trim()
    if (!trimmed) return 'Enter Cron expression'
    const parts = trimmed.split(/\s+/)
    if (parts.length !== 5) return 'Expression needs 5 parts: min hour day month weekday'

    const [min, hour, day, month, week] = parts

    if (min.startsWith('*/')) return `Every ${min.replace('*/', '')} minutes`
    if (min === '0' && hour === '0' && day === '*' && month === '*' && week === '*') return 'Every day at 00:00'
    if (min === '0' && hour === '*' && day === '*' && month === '*' && week === '*') return 'Every hour on the hour'
    if (min === '0' && hour === '0' && day === '*' && month === '*' && week !== '*') return `Weekly on day ${week} at 00:00`
    if (min === '0' && hour === '0' && day !== '*' && month === '*') return `Monthly on day ${day} at 00:00`

    return `Schedule: min(${min}) hour(${hour}) day(${day}) month(${month}) week(${week})`
}

export default function CronModal({ open, item, onSave, onClose }: Props) {
    const { t } = useTranslation(['ssh', 'common'])
    const [expression, setExpression] = useState('*/5 * * * *')
    const [command, setCommand] = useState('')
    const [comment, setComment] = useState('')

    useEffect(() => {
        if (item) {
            setExpression(item.expression || '*/5 * * * *')
            setCommand(item.command || '')
            setComment(item.comment || '')
        } else {
            setExpression('*/5 * * * *')
            setCommand('')
            setComment('')
        }
    }, [item, open])

    const handleConfirm = () => {
        if (!expression.trim() || !command.trim()) return
        onSave({
            id: item?.id,
            expression: expression.trim(),
            command: command.trim(),
            comment: comment.trim(),
            enabled: item ? item.enabled : true,
        })
    }

    return (
        <Modal
            open={open}
            title={item ? t('ssh:cron.edit') : t('ssh:cron.add')}
            onCancel={onClose}
            onOk={handleConfirm}
            okText={t('common:save')}
            cancelText={t('common:cancel')}
            okButtonProps={{ disabled: !expression.trim() || !command.trim() }}
            width={580}
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '12px 0' }}>
                <div>
                    <label style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 6, display: 'block' }}>
                        Presets:
                    </label>
                    <Space wrap size={[6, 6]}>
                        {PRESETS.map((p) => (
                            <Tag.CheckableTag
                                key={p.expr}
                                checked={expression === p.expr}
                                onChange={() => setExpression(p.expr)}
                            >
                                {p.label}
                            </Tag.CheckableTag>
                        ))}
                    </Space>
                </div>

                <div>
                    <label style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 6, display: 'block' }}>
                        {t('ssh:cron.schedule')} (Cron):
                    </label>
                    <Input
                        style={{ fontFamily: 'monospace' }}
                        value={expression}
                        placeholder="*/5 * * * *"
                        onChange={(e) => setExpression(e.target.value)}
                    />
                    <div style={{ marginTop: 4, fontSize: 12, color: '#1677ff' }}>
                        💡 {explainCron(expression)}
                    </div>
                </div>

                <div>
                    <label style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 6, display: 'block' }}>
                        {t('ssh:cron.command')}:
                    </label>
                    <Input
                        style={{ fontFamily: 'monospace' }}
                        value={command}
                        placeholder="/usr/bin/python3 /opt/script.py"
                        onChange={(e) => setCommand(e.target.value)}
                    />
                </div>

                <div>
                    <label style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 6, display: 'block' }}>
                        {t('ssh:cron.comment')}:
                    </label>
                    <Input
                        value={comment}
                        placeholder="e.g. Daily DB Backup"
                        onChange={(e) => setComment(e.target.value)}
                    />
                </div>
            </div>
        </Modal>
    )
}
