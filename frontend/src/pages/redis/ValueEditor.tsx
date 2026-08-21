import React, { useState } from 'react'
import { Input, InputNumber, Button, Space, Tooltip, message } from 'antd'
import { Plus, Trash2, ArrowLeft, ArrowRight, CornerDownLeft, CornerDownRight } from 'lucide-react'
import { API } from '@/api'
import { RedisSessionInfo, RedisValue } from '@/types'
import v from '@/pages/redis/ValueEditor.module.less'

interface Props {
    session: RedisSessionInfo
    value: RedisValue
    selected: string
    flash?: (m: string) => void
    onReload?: () => Promise<void> | void
}

export default function ValueEditor({
    session,
    value,
    selected,
    flash,
    onReload,
}: Props) {
    const [field, setField] = useState('')
    const [fval, setFval] = useState('')
    const [delField, setDelField] = useState('')

    const [member, setMember] = useState('')
    const [score, setScore] = useState<number | null>(0)
    const [delMember, setDelMember] = useState('')

    const [pushVal, setPushVal] = useState('')
    const [busy, setBusy] = useState(false)

    const handleOp = async (fn: () => Promise<void>, successMsg: string) => {
        setBusy(true)
        try {
            await fn()
            message.success(successMsg)
            if (onReload) await onReload()
        } catch (e: any) {
            message.error('操作失败: ' + (e.message || String(e)))
        } finally {
            setBusy(false)
        }
    }

    if (value.type === 'hash') {
        return (
            <div className={v.miniEdit}>
                <div className={v.subHead}>Hash 结构化写入与操作</div>
                {/* HSET */}
                <div className={v.row} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <Input
                        size="small"
                        style={{ width: 140 }}
                        placeholder="字段名 (field)"
                        value={field}
                        onChange={(e) => setField(e.target.value)}
                    />
                    <Input
                        size="small"
                        style={{ flex: 1 }}
                        placeholder="字段值 (value)"
                        value={fval}
                        onChange={(e) => setFval(e.target.value)}
                        onPressEnter={() => {
                            if (!field.trim()) return
                            handleOp(async () => {
                                await API.redisHashFieldSet(session.id, selected, field.trim(), fval)
                                setField('')
                                setFval('')
                            }, `已设置 Hash 字段 [${field}]`)
                        }}
                    />
                    <Button
                        size="small"
                        type="primary"
                        loading={busy}
                        disabled={!field.trim()}
                        onClick={() =>
                            handleOp(async () => {
                                await API.redisHashFieldSet(session.id, selected, field.trim(), fval)
                                setField('')
                                setFval('')
                            }, `已设置 Hash 字段 [${field}]`)
                        }
                    >
                        HSET 写入
                    </Button>
                </div>

                {/* HDEL */}
                <div className={v.row} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <Input
                        size="small"
                        style={{ width: 140 }}
                        placeholder="要删除的 field"
                        value={delField}
                        onChange={(e) => setDelField(e.target.value)}
                        onPressEnter={() => {
                            if (!delField.trim()) return
                            handleOp(async () => {
                                await API.redisHashFieldDel(session.id, selected, [delField.trim()])
                                setDelField('')
                            }, `已删除字段 [${delField}]`)
                        }}
                    />
                    <Button
                        size="small"
                        danger
                        loading={busy}
                        disabled={!delField.trim()}
                        onClick={() =>
                            handleOp(async () => {
                                await API.redisHashFieldDel(session.id, selected, [delField.trim()])
                                setDelField('')
                            }, `已删除字段 [${delField}]`)
                        }
                    >
                        HDEL 删除字段
                    </Button>
                </div>
            </div>
        )
    }

    if (value.type === 'list') {
        return (
            <div className={v.miniEdit}>
                <div className={v.subHead}>List 结构化推入与弹出操作</div>
                <div className={v.row} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <Input
                        size="small"
                        style={{ flex: 1 }}
                        placeholder="元素值 (value)"
                        value={pushVal}
                        onChange={(e) => setPushVal(e.target.value)}
                    />
                    <Button
                        size="small"
                        type="primary"
                        loading={busy}
                        disabled={!pushVal.trim()}
                        icon={<CornerDownLeft size={12} />}
                        onClick={() =>
                            handleOp(async () => {
                                await API.redisListPush(session.id, selected, pushVal.trim(), true)
                                setPushVal('')
                            }, '已 LPUSH (左侧推入)')
                        }
                    >
                        LPUSH
                    </Button>
                    <Button
                        size="small"
                        type="primary"
                        loading={busy}
                        disabled={!pushVal.trim()}
                        icon={<CornerDownRight size={12} />}
                        onClick={() =>
                            handleOp(async () => {
                                await API.redisListPush(session.id, selected, pushVal.trim(), false)
                                setPushVal('')
                            }, '已 RPUSH (右侧推入)')
                        }
                    >
                        RPUSH
                    </Button>
                    <Button
                        size="small"
                        loading={busy}
                        onClick={() =>
                            handleOp(async () => {
                                const val = await API.redisListPop(session.id, selected, true)
                                message.info('LPOP 出栈值: ' + (val || '(nil)'))
                            }, '已 LPOP')
                        }
                    >
                        LPOP
                    </Button>
                    <Button
                        size="small"
                        loading={busy}
                        onClick={() =>
                            handleOp(async () => {
                                const val = await API.redisListPop(session.id, selected, false)
                                message.info('RPOP 出栈值: ' + (val || '(nil)'))
                            }, '已 RPOP')
                        }
                    >
                        RPOP
                    </Button>
                </div>
            </div>
        )
    }

    if (value.type === 'set') {
        return (
            <div className={v.miniEdit}>
                <div className={v.subHead}>Set 成员增删操作</div>
                <div className={v.row} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <Input
                        size="small"
                        style={{ flex: 1 }}
                        placeholder="成员内容 (member)"
                        value={member}
                        onChange={(e) => setMember(e.target.value)}
                        onPressEnter={() => {
                            if (!member.trim()) return
                            handleOp(async () => {
                                await API.redisSetAdd(session.id, selected, [member.trim()])
                                setMember('')
                            }, `已 SADD 添加成员 [${member}]`)
                        }}
                    />
                    <Button
                        size="small"
                        type="primary"
                        loading={busy}
                        disabled={!member.trim()}
                        onClick={() =>
                            handleOp(async () => {
                                await API.redisSetAdd(session.id, selected, [member.trim()])
                                setMember('')
                            }, `已 SADD 添加成员 [${member}]`)
                        }
                    >
                        SADD 添加
                    </Button>
                    <Button
                        size="small"
                        danger
                        loading={busy}
                        disabled={!member.trim()}
                        onClick={() =>
                            handleOp(async () => {
                                await API.redisSetRem(session.id, selected, [member.trim()])
                                setMember('')
                            }, `已 SREM 移除成员 [${member}]`)
                        }
                    >
                        SREM 移除
                    </Button>
                </div>
            </div>
        )
    }

    if (value.type === 'zset') {
        return (
            <div className={v.miniEdit}>
                <div className={v.subHead}>ZSet 有序集成员分值写入</div>
                <div className={v.row} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <Input
                        size="small"
                        style={{ flex: 1 }}
                        placeholder="成员内容 (member)"
                        value={member}
                        onChange={(e) => setMember(e.target.value)}
                    />
                    <InputNumber
                        size="small"
                        style={{ width: 110 }}
                        placeholder="分值 score"
                        value={score}
                        onChange={(v) => setScore(v)}
                    />
                    <Button
                        size="small"
                        type="primary"
                        loading={busy}
                        disabled={!member.trim()}
                        onClick={() =>
                            handleOp(async () => {
                                await API.redisZSetAdd(session.id, selected, member.trim(), score ?? 0)
                                setMember('')
                            }, `已 ZADD 写入 [${member}] (score: ${score})`)
                        }
                    >
                        ZADD 写入
                    </Button>
                    <Button
                        size="small"
                        danger
                        loading={busy}
                        disabled={!member.trim()}
                        onClick={() =>
                            handleOp(async () => {
                                await API.redisZSetRem(session.id, selected, [member.trim()])
                                setMember('')
                            }, `已 ZREM 移除成员 [${member}]`)
                        }
                    >
                        ZREM 移除
                    </Button>
                </div>
            </div>
        )
    }

    return null
}
