import React, { useState, useMemo } from 'react'
import { Input, Button, Space, Tooltip, Modal, Drawer, Tag, Popconfirm, message } from 'antd'
import { Search, Plus, Trash2, Copy, Clock, KeyRound } from 'lucide-react'
import CodeEditor from '@/components/CodeEditor'
import { API } from '@/api'
import { RedisSessionInfo, RedisValue } from '@/types'
import s from './viewers.module.less'

interface Props {
    session: RedisSessionInfo
    selected: string
    value: RedisValue
    onReload: () => void
    flash?: (m: string) => void
}

interface StreamMessage {
    id: string
    timestampStr?: string
    fields: Record<string, any>
}

export default function StreamViewer({ session, selected, value, onReload, flash }: Props) {
    const [searchText, setSearchText] = useState('')

    // Add Entry Modal
    const [addModalOpen, setAddModalOpen] = useState(false)
    const [entryId, setEntryId] = useState('*')
    const [fieldsText, setFieldsText] = useState('{\n  "event": "order_created",\n  "amount": "99.9"\n}')
    const [adding, setAdding] = useState(false)

    // Inspect Entry Drawer
    const [inspectDrawer, setInspectDrawer] = useState<{ open: boolean; msg: StreamMessage | null }>({
        open: false,
        msg: null,
    })

    const messages = useMemo<StreamMessage[]>(() => {
        if (Array.isArray(value.rawJson)) {
            return value.rawJson.map((item) => {
                const id = String(item.id ?? '')
                let ts = ''
                const ms = Number(id.split('-')[0])
                if (!isNaN(ms) && ms > 0) {
                    try {
                        ts = new Date(ms).toLocaleString()
                    } catch {}
                }
                return {
                    id,
                    timestampStr: ts,
                    fields: (item.values || item.Values || {}) as Record<string, any>,
                }
            })
        }

        // Fallback parse lines
        if (typeof value.value === 'string' && value.value.length > 0) {
            const blocks = value.value.split('\n---\n')
            const list: StreamMessage[] = []
            for (const b of blocks) {
                const lines = b.trim().split('\n')
                if (lines.length > 0 && lines[0]) {
                    const id = lines[0].trim()
                    let ts = ''
                    const ms = Number(id.split('-')[0])
                    if (!isNaN(ms) && ms > 0) {
                        try {
                            ts = new Date(ms).toLocaleString()
                        } catch {}
                    }
                    const fields: Record<string, any> = {}
                    if (lines.length > 1) {
                        const pairs = lines[1].split(' ')
                        for (const p of pairs) {
                            const [fk, fv] = p.split('=')
                            if (fk) fields[fk] = fv ?? ''
                        }
                    }
                    list.push({ id, timestampStr: ts, fields })
                }
            }
            return list
        }

        return []
    }, [value.rawJson, value.value])

    const filteredMessages = useMemo(() => {
        if (!searchText.trim()) return messages
        const query = searchText.toLowerCase().trim()
        return messages.filter((m) => {
            if (m.id.toLowerCase().includes(query)) return true
            for (const [k, v] of Object.entries(m.fields)) {
                if (k.toLowerCase().includes(query) || String(v).toLowerCase().includes(query)) {
                    return true
                }
            }
            return false
        })
    }, [messages, searchText])

    const handleAddEntry = async () => {
        let parsed: Record<string, any> = {}
        try {
            parsed = JSON.parse(fieldsText)
            if (typeof parsed !== 'object' || Array.isArray(parsed) || parsed === null) {
                throw new Error('必须是 JSON 对象格式')
            }
        } catch {
            message.warning('字段必须是合法的 JSON 对象格式，如 {"field": "val"}')
            return
        }

        setAdding(true)
        try {
            // Build raw XADD command
            const parts: string[] = ['XADD', `"${selected}"`, entryId || '*']
            for (const [k, v] of Object.entries(parsed)) {
                const escapedV = String(v).replace(/"/g, '\\"')
                parts.push(`"${k}"`, `"${escapedV}"`)
            }
            const res = await API.redisRaw(session.id, parts.join(' '))
            if (res && res.result && String(res.result).startsWith('ERR')) {
                throw new Error(String(res.result))
            }
            message.success(`已添加 Stream 消息 ID: ${res.result || entryId}`)
            setAddModalOpen(false)
            onReload()
        } catch (e: any) {
            message.error('追加消息失败: ' + (e?.message || e))
        } finally {
            setAdding(false)
        }
    }

    const handleDeleteEntry = async (msgId: string) => {
        try {
            await API.redisRaw(session.id, `XDEL "${selected}" ${msgId}`)
            message.success(`已删除 Stream 消息: ${msgId}`)
            onReload()
        } catch (e: any) {
            message.error('删除失败: ' + (e?.message || e))
        }
    }

    const copyText = async (text: string) => {
        try {
            await navigator.clipboard.writeText(text)
            message.success('已复制到剪贴板')
        } catch {
            message.error('复制失败')
        }
    }

    return (
        <div className={s.viewerContainer}>
            <div className={s.viewerToolbar}>
                <div className={s.toolbarLeft}>
                    <Input
                        size="small"
                        prefix={<Search size={12} style={{ color: 'var(--text-dim)' }} />}
                        placeholder="搜索消息 ID 或字段内容..."
                        value={searchText}
                        onChange={(e) => setSearchText(e.target.value)}
                        allowClear
                        className={s.searchInput}
                    />
                    <span className={s.countBadge}>
                        最新 {messages.length} 条消息
                        {searchText && ` (匹配 ${filteredMessages.length} 条)`}
                    </span>
                </div>

                <div className={s.toolbarRight}>
                    <Button size="small" type="primary" icon={<Plus size={12} />} onClick={() => setAddModalOpen(true)}>
                        追加消息 (XADD)
                    </Button>
                </div>
            </div>

            <div className={s.tableArea} style={{ padding: '8px 12px' }}>
                {filteredMessages.length === 0 ? (
                    <div className={s.emptyTip}>
                        <span>当前 Stream 无消息</span>
                        <Button size="small" type="primary" icon={<Plus size={12} />} onClick={() => setAddModalOpen(true)}>
                            追加第一条消息 (XADD)
                        </Button>
                    </div>
                ) : (
                    filteredMessages.map((msg) => (
                        <div key={msg.id} className={s.streamCard}>
                            <div className={s.streamHead}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span className={s.streamId}>{msg.id}</span>
                                    {msg.timestampStr && (
                                        <span style={{ fontSize: 11, color: 'var(--text-dim)', display: 'flex', alignItems: 'center', gap: 4 }}>
                                            <Clock size={11} /> {msg.timestampStr}
                                        </span>
                                    )}
                                </div>
                                <Space size={4}>
                                    <Tooltip title="复制消息完整 JSON">
                                        <Button
                                            size="small"
                                            type="text"
                                            icon={<Copy size={12} />}
                                            onClick={() => copyText(JSON.stringify(msg.fields, null, 2))}
                                        />
                                    </Tooltip>
                                    <Popconfirm
                                        title={`确定从 Stream 中删除该消息吗？(XDEL)`}
                                        onConfirm={() => handleDeleteEntry(msg.id)}
                                        okText="删除"
                                        cancelText="取消"
                                        okButtonProps={{ danger: true }}
                                    >
                                        <Tooltip title="删除该条消息 (XDEL)">
                                            <Button size="small" type="text" danger icon={<Trash2 size={12} />} />
                                        </Tooltip>
                                    </Popconfirm>
                                </Space>
                            </div>

                            <div className={s.streamFields}>
                                {Object.entries(msg.fields).map(([fk, fv]) => (
                                    <div key={fk} className={s.streamFieldRow}>
                                        <span className={s.streamFieldKey}>{fk}:</span>
                                        <span className={s.streamFieldValue}>{String(fv)}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Add Entry Modal */}
            <Modal
                title="追加 Stream 消息 (XADD)"
                open={addModalOpen}
                onOk={handleAddEntry}
                confirmLoading={adding}
                onCancel={() => setAddModalOpen(false)}
                okText="追加发送"
                cancelText="取消"
                width={540}
            >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
                    <div>
                        <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 4 }}>消息 ID (留 * 为自动生成)</div>
                        <Input value={entryId} onChange={(e) => setEntryId(e.target.value)} placeholder="*" />
                    </div>
                    <div>
                        <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 4 }}>消息键值对 (JSON 格式)</div>
                        <CodeEditor
                            value={fieldsText}
                            onChange={setFieldsText}
                            lang="json"
                            height="180px"
                            bordered
                        />
                    </div>
                </div>
            </Modal>
        </div>
    )
}
