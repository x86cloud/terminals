import React, { useEffect, useState } from 'react'
import { Modal, Input, Button, Tag, Space, Alert } from 'antd'
import { SSHCronItem } from '@/types'

interface Props {
    open: boolean
    item: SSHCronItem | null
    onSave: (item: Partial<SSHCronItem>) => void
    onClose: () => void
}

const PRESETS = [
    { label: '每5分钟', expr: '*/5 * * * *' },
    { label: '每15分钟', expr: '*/15 * * * *' },
    { label: '每小时整点', expr: '0 * * * *' },
    { label: '每天0点', expr: '0 0 * * *' },
    { label: '每周一0点', expr: '0 0 * * 1' },
    { label: '每月1日0点', expr: '0 0 1 * *' },
]

export function explainCron(expr: string): string {
    const trimmed = expr.trim()
    if (!trimmed) return '请输入 Cron 表达式'
    const parts = trimmed.split(/\s+/)
    if (parts.length !== 5) return '表达式格式需包含 5 个部分（分 时 日 月 周）'

    const [min, hour, day, month, week] = parts

    if (min.startsWith('*/')) return `每隔 ${min.replace('*/', '')} 分钟执行一次`
    if (min === '0' && hour === '0' && day === '*' && month === '*' && week === '*') return '每天 00:00 执行'
    if (min === '0' && hour === '*' && day === '*' && month === '*' && week === '*') return '每小时整点执行'
    if (min === '0' && hour === '0' && day === '*' && month === '*' && week !== '*') return `每周 ${week} 00:00 执行`
    if (min === '0' && hour === '0' && day !== '*' && month === '*') return `每月 ${day} 日 00:00 执行`

    return `运行周期: 分(${min}) 时(${hour}) 日(${day}) 月(${month}) 周(${week})`
}

export default function CronModal({ open, item, onSave, onClose }: Props) {
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
            title={item ? '编辑定时任务' : '新建定时任务'}
            onCancel={onClose}
            onOk={handleConfirm}
            okText="保存"
            cancelText="取消"
            okButtonProps={{ disabled: !expression.trim() || !command.trim() }}
            width={580}
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '12px 0' }}>
                <div>
                    <label style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 6, display: 'block' }}>
                        常用运行周期快捷选择:
                    </label>
                    <Space wrap size={[6, 6]}>
                        {PRESETS.map((p) => (
                            <Tag.CheckableTag
                                key={p.label}
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
                        Cron 表达式 (分 时 日 月 周):
                    </label>
                    <Input
                        style={{ fontFamily: 'monospace' }}
                        value={expression}
                        placeholder="如: */5 * * * *"
                        onChange={(e) => setExpression(e.target.value)}
                    />
                    <div style={{ marginTop: 4, fontSize: 12, color: '#1677ff' }}>
                        💡 {explainCron(expression)}
                    </div>
                </div>

                <div>
                    <label style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 6, display: 'block' }}>
                        执行命令 / 脚本路径:
                    </label>
                    <Input
                        style={{ fontFamily: 'monospace' }}
                        value={command}
                        placeholder="如: /usr/bin/python3 /opt/script.py > /dev/null 2>&1"
                        onChange={(e) => setCommand(e.target.value)}
                    />
                </div>

                <div>
                    <label style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 6, display: 'block' }}>
                        备注说明 (可选):
                    </label>
                    <Input
                        value={comment}
                        placeholder="如: 每日数据库备份任务"
                        onChange={(e) => setComment(e.target.value)}
                    />
                </div>
            </div>
        </Modal>
    )
}
