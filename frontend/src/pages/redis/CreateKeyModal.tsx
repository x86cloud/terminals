import React, { useState } from 'react'
import { Modal, Input, InputNumber, Segmented, Button, Space, Tag, Alert, Tooltip, Select } from 'antd'
import { Plus, Trash2, Sparkles, Minimize2, Key, Database, Clock, Layers } from 'lucide-react'
import CodeEditor from '@/components/CodeEditor'

export type RedisKeyType = 'string' | 'hash' | 'list' | 'set' | 'zset'

interface HashPair {
    field: string
    value: string
}

interface ZSetPair {
    member: string
    score: number
}

interface Props {
    open: boolean
    currentDb: number
    onClose: () => void
    onCreate: (key: string, type: RedisKeyType, serializedValue: string, ttl: number) => Promise<void>
}

const TTL_PRESETS = [
    { label: '永久 (-1)', value: -1 },
    { label: '1 分钟 (60s)', value: 60 },
    { label: '1 小时 (3600s)', value: 3600 },
    { label: '1 天 (86400s)', value: 86400 },
    { label: '7 天', value: 604800 },
    { label: '30 天', value: 2592000 },
]

export default function CreateKeyModal({ open, currentDb, onClose, onCreate }: Props) {
    const [key, setKey] = useState('')
    const [type, setType] = useState<RedisKeyType>('string')
    const [ttl, setTtl] = useState<number>(-1)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')

    // String
    const [stringValue, setStringValue] = useState('{\n  "msg": "hello redis"\n}')

    // Hash
    const [hashPairs, setHashPairs] = useState<HashPair[]>([
        { field: 'name', value: 'Terminal' },
        { field: 'version', value: '3.0' },
    ])

    // List
    const [listItems, setListItems] = useState<string[]>(['item_1', 'item_2'])

    // Set
    const [setMembers, setSetMembers] = useState<string[]>(['member_1', 'member_2'])

    // ZSet
    const [zsetPairs, setZsetPairs] = useState<ZSetPair[]>([
        { member: 'item_1', score: 10 },
        { member: 'item_2', score: 20 },
    ])

    // JSON helpers for string
    const beautifyJson = () => {
        try {
            const obj = JSON.parse(stringValue)
            setStringValue(JSON.stringify(obj, null, 2))
        } catch {
            setError('当前字符串内容不是合法的 JSON 格式')
        }
    }

    const minifyJson = () => {
        try {
            const obj = JSON.parse(stringValue)
            setStringValue(JSON.stringify(obj))
        } catch {
            setError('当前字符串内容不是合法的 JSON 格式')
        }
    }

    const resetForm = () => {
        setKey('')
        setType('string')
        setTtl(-1)
        setError('')
        setStringValue('{\n  "msg": "hello redis"\n}')
        setHashPairs([
            { field: 'name', value: 'Terminal' },
            { field: 'version', value: '3.0' },
        ])
        setListItems(['item_1', 'item_2'])
        setSetMembers(['member_1', 'member_2'])
        setZsetPairs([
            { member: 'item_1', score: 10 },
            { member: 'item_2', score: 20 },
        ])
    }

    const handleCreate = async () => {
        const trimmedKey = key.trim()
        if (!trimmedKey) {
            setError('请输入键名 (Key)')
            return
        }

        let serialized = ''

        if (type === 'string') {
            serialized = stringValue
        } else if (type === 'hash') {
            const valid = hashPairs.filter((p) => p.field.trim() !== '')
            if (valid.length === 0) {
                setError('Hash 至少需要提供一个有效字段 (field)')
                return
            }
            const lines: string[] = []
            valid.forEach((p) => {
                lines.push(p.field.trim(), p.value)
            })
            serialized = lines.join('\n')
        } else if (type === 'list') {
            const valid = listItems.map((i) => i.trim()).filter(Boolean)
            if (valid.length === 0) {
                setError('List 至少需要提供一个元素')
                return
            }
            serialized = valid.join('\n')
        } else if (type === 'set') {
            const valid = setMembers.map((i) => i.trim()).filter(Boolean)
            if (valid.length === 0) {
                setError('Set 至少需要提供一个成员')
                return
            }
            serialized = valid.join('\n')
        } else if (type === 'zset') {
            const valid = zsetPairs.filter((p) => p.member.trim() !== '')
            if (valid.length === 0) {
                setError('ZSet 至少需要提供一个成员 (member)')
                return
            }
            const lines: string[] = []
            valid.forEach((p) => {
                lines.push(p.member.trim(), String(p.score))
            })
            serialized = lines.join('\n')
        }

        setBusy(true)
        setError('')
        try {
            await onCreate(trimmedKey, type, serialized, ttl)
            resetForm()
            onClose()
        } catch (e: any) {
            setError(e.message || String(e))
        } finally {
            setBusy(false)
        }
    }

    return (
        <Modal
            open={open}
            title={
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 600 }}>
                    <Key size={16} color="var(--accent)" />
                    <span>新建 Redis 键</span>
                    <Tag color="geekblue" style={{ marginLeft: 4, borderRadius: 10, fontSize: 11 }}>
                        DB {currentDb}
                    </Tag>
                </div>
            }
            closable={false}
            width={660}
            onCancel={onClose}
            footer={
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 4 }}>
                    <Button onClick={onClose} disabled={busy}>
                        取消
                    </Button>
                    <Button type="primary" loading={busy} onClick={handleCreate} style={{ minWidth: 80 }}>
                        创建
                    </Button>
                </div>
            }
            destroyOnClose
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 4 }}>
                {error && <Alert type="error" message={error} showIcon closable onClose={() => setError('')} />}

                {/* 1. 键名与 TTL 并排两栏网格 */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 220px', gap: 14 }}>
                    <div>
                        <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
                            <Database size={13} color="var(--accent)" />
                            <span>键名 <span style={{ color: '#ef4444' }}>*</span></span>
                        </div>
                        <Input
                            placeholder="例如：user:profile:1001 或 app:config"
                            value={key}
                            onChange={(e) => setKey(e.target.value)}
                            autoFocus
                        />
                    </div>

                    <div>
                        <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                <Clock size={13} color="var(--accent)" />
                                <span>过期时间 (TTL)</span>
                            </span>
                            <span style={{ fontSize: 11, color: 'var(--text-dim)', fontWeight: 400 }}>秒 (-1永久)</span>
                        </div>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            <InputNumber
                                style={{ flex: 1 }}
                                value={ttl}
                                onChange={(v) => setTtl(v ?? -1)}
                                placeholder="-1 永久"
                            />
                            <Select
                                value={TTL_PRESETS.some((p) => p.value === ttl) ? ttl : undefined}
                                placeholder="快捷预设"
                                onChange={(v) => setTtl(v)}
                                style={{ width: 105 }}
                                options={TTL_PRESETS}
                            />
                        </div>
                    </div>
                </div>

                {/* 2. 数据类型切换 */}
                <div>
                    <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
                        <Layers size={13} color="var(--accent)" />
                        <span>数据类型 </span>
                    </div>
                    <Segmented
                        block
                        value={type}
                        onChange={(v) => setType(v as RedisKeyType)}
                        options={[
                            { label: 'String', value: 'string' },
                            { label: 'Hash', value: 'hash' },
                            { label: 'List', value: 'list' },
                            { label: 'Set', value: 'set' },
                            { label: 'ZSet', value: 'zset' },
                        ]}
                    />
                </div>

                {/* 3. 动态数据表单 */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span>数据内容</span>
                        {type === 'string' && (
                            <Space size={6}>
                                <Button size="small" type="dashed" icon={<Sparkles size={11} />} onClick={beautifyJson}>
                                    美化 JSON
                                </Button>
                                <Button size="small" type="dashed" icon={<Minimize2 size={11} />} onClick={minifyJson}>
                                    压缩 JSON
                                </Button>
                            </Space>
                        )}
                    </div>

                    {/* String Form */}
                    {type === 'string' && (
                        <div style={{ border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
                            <CodeEditor
                                value={stringValue}
                                onChange={setStringValue}
                                lang={/^\s*[[{]/.test(stringValue) ? 'json' : 'plain'}
                                height="160px"
                                lineNumbers={false}
                                bordered={false}
                                placeholder="输入字符串或 JSON 内容..."
                            />
                        </div>
                    )}

                    {/* Hash Form */}
                    {type === 'hash' && (
                        <div style={{
                            background: 'var(--bg-2)',
                            border: '1px solid var(--border)',
                            borderRadius: 6,
                            padding: '10px 12px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 8,
                            maxHeight: 220,
                            overflowY: 'auto'
                        }}>
                            {hashPairs.map((pair, idx) => (
                                <div key={idx} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                    <Input
                                        size="small"
                                        style={{ width: 160 }}
                                        placeholder="字段名 (Field)"
                                        value={pair.field}
                                        onChange={(e) => {
                                            const copy = [...hashPairs]
                                            copy[idx].field = e.target.value
                                            setHashPairs(copy)
                                        }}
                                    />
                                    <Input
                                        size="small"
                                        style={{ flex: 1 }}
                                        placeholder="字段值 (Value)"
                                        value={pair.value}
                                        onChange={(e) => {
                                            const copy = [...hashPairs]
                                            copy[idx].value = e.target.value
                                            setHashPairs(copy)
                                        }}
                                    />
                                    <Button
                                        size="small"
                                        type="text"
                                        danger
                                        icon={<Trash2 size={13} />}
                                        disabled={hashPairs.length <= 1}
                                        onClick={() => setHashPairs(hashPairs.filter((_, i) => i !== idx))}
                                    />
                                </div>
                            ))}
                            <Button
                                size="small"
                                type="dashed"
                                icon={<Plus size={12} />}
                                onClick={() => setHashPairs([...hashPairs, { field: '', value: '' }])}
                                style={{ alignSelf: 'flex-start', marginTop: 2 }}
                            >
                                添加字段 (Field)
                            </Button>
                        </div>
                    )}

                    {/* List Form */}
                    {type === 'list' && (
                        <div style={{
                            background: 'var(--bg-2)',
                            border: '1px solid var(--border)',
                            borderRadius: 6,
                            padding: '10px 12px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 8,
                            maxHeight: 220,
                            overflowY: 'auto'
                        }}>
                            {listItems.map((item, idx) => (
                                <div key={idx} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                    <Tag style={{ margin: 0, fontSize: 11, minWidth: 32, textAlign: 'center' }}>#{idx + 1}</Tag>
                                    <Input
                                        size="small"
                                        style={{ flex: 1 }}
                                        placeholder={`元素内容 #${idx + 1}`}
                                        value={item}
                                        onChange={(e) => {
                                            const copy = [...listItems]
                                            copy[idx] = e.target.value
                                            setListItems(copy)
                                        }}
                                    />
                                    <Button
                                        size="small"
                                        type="text"
                                        danger
                                        icon={<Trash2 size={13} />}
                                        disabled={listItems.length <= 1}
                                        onClick={() => setListItems(listItems.filter((_, i) => i !== idx))}
                                    />
                                </div>
                            ))}
                            <Button
                                size="small"
                                type="dashed"
                                icon={<Plus size={12} />}
                                onClick={() => setListItems([...listItems, ''])}
                                style={{ alignSelf: 'flex-start', marginTop: 2 }}
                            >
                                添加元素 (Item)
                            </Button>
                        </div>
                    )}

                    {/* Set Form */}
                    {type === 'set' && (
                        <div style={{
                            background: 'var(--bg-2)',
                            border: '1px solid var(--border)',
                            borderRadius: 6,
                            padding: '10px 12px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 8,
                            maxHeight: 220,
                            overflowY: 'auto'
                        }}>
                            {setMembers.map((member, idx) => (
                                <div key={idx} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                    <Input
                                        size="small"
                                        style={{ flex: 1 }}
                                        placeholder={`唯一成员 #${idx + 1}`}
                                        value={member}
                                        onChange={(e) => {
                                            const copy = [...setMembers]
                                            copy[idx] = e.target.value
                                            setSetMembers(copy)
                                        }}
                                    />
                                    <Button
                                        size="small"
                                        type="text"
                                        danger
                                        icon={<Trash2 size={13} />}
                                        disabled={setMembers.length <= 1}
                                        onClick={() => setSetMembers(setMembers.filter((_, i) => i !== idx))}
                                    />
                                </div>
                            ))}
                            <Button
                                size="small"
                                type="dashed"
                                icon={<Plus size={12} />}
                                onClick={() => setSetMembers([...setMembers, ''])}
                                style={{ alignSelf: 'flex-start', marginTop: 2 }}
                            >
                                添加成员 (Member)
                            </Button>
                        </div>
                    )}

                    {/* ZSet Form */}
                    {type === 'zset' && (
                        <div style={{
                            background: 'var(--bg-2)',
                            border: '1px solid var(--border)',
                            borderRadius: 6,
                            padding: '10px 12px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 8,
                            maxHeight: 220,
                            overflowY: 'auto'
                        }}>
                            {zsetPairs.map((pair, idx) => (
                                <div key={idx} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                    <Input
                                        size="small"
                                        style={{ flex: 1 }}
                                        placeholder="成员内容 (Member)"
                                        value={pair.member}
                                        onChange={(e) => {
                                            const copy = [...zsetPairs]
                                            copy[idx].member = e.target.value
                                            setZsetPairs(copy)
                                        }}
                                    />
                                    <InputNumber
                                        size="small"
                                        style={{ width: 130 }}
                                        placeholder="分数 (Score)"
                                        value={pair.score}
                                        onChange={(v) => {
                                            const copy = [...zsetPairs]
                                            copy[idx].score = v ?? 0
                                            setZsetPairs(copy)
                                        }}
                                    />
                                    <Button
                                        size="small"
                                        type="text"
                                        danger
                                        icon={<Trash2 size={13} />}
                                        disabled={zsetPairs.length <= 1}
                                        onClick={() => setZsetPairs(zsetPairs.filter((_, i) => i !== idx))}
                                    />
                                </div>
                            ))}
                            <Button
                                size="small"
                                type="dashed"
                                icon={<Plus size={12} />}
                                onClick={() => setZsetPairs([...zsetPairs, { member: '', score: 0 }])}
                                style={{ alignSelf: 'flex-start', marginTop: 2 }}
                            >
                                添加有序成员 (Member + Score)
                            </Button>
                        </div>
                    )}
                </div>
            </div>
        </Modal>
    )
}
