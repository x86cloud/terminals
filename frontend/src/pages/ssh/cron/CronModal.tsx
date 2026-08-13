import React, {useEffect, useState} from 'react'
import { X } from 'lucide-react'
import {SSHCronItem} from '../../../types'
import g from '../../../styles/global.module.less'
import m from './CronModal.module.less'

interface Props {
    open: boolean
    item: SSHCronItem | null
    onSave: (item: Partial<SSHCronItem>) => void
    onClose: () => void
}

const PRESETS = [
    {label: '每5分钟', expr: '*/5 * * * *'},
    {label: '每15分钟', expr: '*/15 * * * *'},
    {label: '每小时整点', expr: '0 * * * *'},
    {label: '每天0点', expr: '0 0 * * *'},
    {label: '每周一0点', expr: '0 0 * * 1'},
    {label: '每月1日0点', expr: '0 0 1 * *'},
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

export default function CronModal({open, item, onSave, onClose}: Props) {
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

    if (!open) return null

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
        <div className={m.overlay} onClick={onClose}>
            <div className={m.modal} onClick={(e) => e.stopPropagation()}>
                <div className={m.header}>
                    <span>{item ? '编辑定时任务' : '新建定时任务'}</span>
                    <button className={g.iconBtn} onClick={onClose}>
                        <X size={14}/>
                    </button>
                </div>

                <div className={m.body}>
                    <div className={m.field}>
                        <label>常用运行周期</label>
                        <div className={m.presets}>
                            {PRESETS.map((p) => (
                                <button
                                    key={p.label}
                                    className={m.presetBtn}
                                    onClick={() => setExpression(p.expr)}
                                >
                                    {p.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className={m.field}>
                        <label>Cron 表达式 (分 时 日 月 周)</label>
                        <input
                            className={m.mono}
                            value={expression}
                            placeholder="如: */5 * * * *"
                            onChange={(e) => setExpression(e.target.value)}
                        />
                        <div className={m.cronHint}>
                            💡 {explainCron(expression)}
                        </div>
                    </div>

                    <div className={m.field}>
                        <label>执行命令 / 脚本路径</label>
                        <input
                            className={m.mono}
                            value={command}
                            placeholder="如: /usr/bin/python3 /opt/script.py > /dev/null 2>&1"
                            onChange={(e) => setCommand(e.target.value)}
                        />
                    </div>

                    <div className={m.field}>
                        <label>备注说明 (可选)</label>
                        <input
                            value={comment}
                            placeholder="如: 每日数据库备份任务"
                            onChange={(e) => setComment(e.target.value)}
                        />
                    </div>
                </div>

                <div className={m.footer}>
                    <button className={`${g.btn} ${g.xs}`} onClick={onClose}>
                        取消
                    </button>
                    <button
                        className={`${g.btn} ${g.xs} ${g.primary}`}
                        onClick={handleConfirm}
                        disabled={!expression.trim() || !command.trim()}
                    >
                        保存
                    </button>
                </div>
            </div>
        </div>
    )
}
