import React, { useState } from 'react'
import { Modal, Input, Switch, Alert, InputNumber, Space } from 'antd'

export type MongoObjModalKind =
    | 'createdb'
    | 'createcoll'
    | 'dropdb'
    | 'dropcoll'
    | 'truncatecoll'
    | 'renamecoll'

interface Props {
    kind: MongoObjModalKind
    db?: string
    coll?: string
    busy: boolean
    msg: string
    name: string
    onName: (v: string) => void
    onClose: () => void
    onConfirm: (extraOptions?: { capped?: boolean; size?: number; max?: number; firstColl?: string }) => void
}

export default function ObjModal(props: Props) {
    const { kind, db, coll, busy, msg, name, onName, onClose, onConfirm } = props

    const [firstColl, setFirstColl] = useState('default')
    const [isCapped, setIsCapped] = useState(false)
    const [cappedSize, setCappedSize] = useState<number>(10485760) // 10MB
    const [cappedMax, setCappedMax] = useState<number | undefined>(undefined)

    const titleMap: Record<MongoObjModalKind, string> = {
        createdb: '新建数据库',
        createcoll: db ? `在 ${db} 中新建集合` : '新建集合',
        dropdb: '删除数据库',
        dropcoll: '删除集合',
        truncatecoll: '清空集合数据',
        renamecoll: '重命名集合',
    }

    const needName = ['createdb', 'createcoll', 'renamecoll'].includes(kind)
    const needConfirm = ['dropdb', 'dropcoll', 'truncatecoll'].includes(kind)
    const isDanger = needConfirm

    const handleOk = () => {
        if (kind === 'createdb') {
            onConfirm({ firstColl: firstColl.trim() || 'default' })
        } else if (kind === 'createcoll') {
            onConfirm({
                capped: isCapped,
                size: isCapped ? cappedSize : undefined,
                max: isCapped && cappedMax ? cappedMax : undefined,
            })
        } else {
            onConfirm()
        }
    }

    return (
        <Modal
            open={true}
            title={titleMap[kind] || '数据库操作'}
            onCancel={() => !busy && onClose()}
            onOk={handleOk}
            confirmLoading={busy}
            okText={needConfirm ? '确认执行' : '确定'}
            cancelText="取消"
            okButtonProps={{ danger: isDanger, disabled: busy || (needName && !name.trim()) }}
            width={kind === 'createcoll' ? 500 : 440}
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '10px 0' }}>
                {msg && (
                    <Alert
                        type={msg.includes('失败') || msg.includes('错误') ? 'error' : 'success'}
                        showIcon
                        message={msg}
                    />
                )}

                {needConfirm && (
                    <div style={{ fontSize: 13, lineHeight: 1.6 }}>
                        {kind === 'dropdb' && (
                            <p style={{ margin: 0, color: '#ef4444' }}>
                                确定要永久删除数据库 <strong>{name || db}</strong> 吗？
                                <br />
                                警告：库中所有集合与数据将被永久物理删除，操作无法恢复！
                            </p>
                        )}
                        {kind === 'dropcoll' && (
                            <p style={{ margin: 0, color: '#ef4444' }}>
                                确定要删除集合 <strong>{coll || name}</strong> 吗？
                                <br />
                                集合中的所有文档和索引将被清空销毁。
                            </p>
                        )}
                        {kind === 'truncatecoll' && (
                            <p style={{ margin: 0, color: '#f59e0b' }}>
                                确定要清空集合 <strong>{coll || name}</strong> 中的所有文档吗？
                                <br />
                                集合结构与索引将被保留，所有文档数据将被移除。
                            </p>
                        )}
                    </div>
                )}

                {kind === 'createdb' && (
                    <>
                        <div>
                            <label style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 6, display: 'block' }}>
                                数据库名称
                            </label>
                            <Input
                                value={name}
                                onChange={(e) => onName(e.target.value)}
                                placeholder="例如 app_db"
                                autoFocus
                            />
                        </div>
                        <div>
                            <label style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 6, display: 'block' }}>
                                初始默认集合名（MongoDB 需至少包含一个集合方可持久化库）
                            </label>
                            <Input
                                value={firstColl}
                                onChange={(e) => setFirstColl(e.target.value)}
                                placeholder="例如 default"
                            />
                        </div>
                    </>
                )}

                {kind === 'renamecoll' && (
                    <div>
                        <label style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 6, display: 'block' }}>
                            新集合名称
                        </label>
                        <Input
                            value={name}
                            onChange={(e) => onName(e.target.value)}
                            placeholder="新集合名称"
                            autoFocus
                        />
                    </div>
                )}

                {kind === 'createcoll' && (
                    <>
                        <div>
                            <label style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 6, display: 'block' }}>
                                集合名称
                            </label>
                            <Input
                                value={name}
                                onChange={(e) => onName(e.target.value)}
                                placeholder="例如 logs, users, orders"
                                autoFocus
                            />
                        </div>

                        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 4 }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                                <div>
                                    <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>固定上限集合 (Capped Collection)</span>
                                    <p style={{ margin: 0, fontSize: 11.5, color: 'var(--text-dim)' }}>
                                        固定大小的循环队列集合，当达到上限时自动覆盖最老文档
                                    </p>
                                </div>
                                <Switch checked={isCapped} onChange={setIsCapped} size="small" />
                            </div>

                            {isCapped && (
                                <Space direction="vertical" style={{ width: '100%', paddingLeft: 12 }} size={10}>
                                    <div>
                                        <span style={{ fontSize: 12, color: 'var(--text-dim)', display: 'block', marginBottom: 4 }}>
                                            最大存储容量 (Bytes，必填)
                                        </span>
                                        <InputNumber
                                            style={{ width: '100%' }}
                                            min={4096}
                                            value={cappedSize}
                                            onChange={(v) => setCappedSize(v ?? 10485760)}
                                            addonAfter="Bytes (~10MB)"
                                        />
                                    </div>
                                    <div>
                                        <span style={{ fontSize: 12, color: 'var(--text-dim)', display: 'block', marginBottom: 4 }}>
                                            最大文档数 (Max Documents，可选)
                                        </span>
                                        <InputNumber
                                            style={{ width: '100%' }}
                                            min={1}
                                            value={cappedMax}
                                            onChange={(v) => setCappedMax(v ?? undefined)}
                                            placeholder="无上限限制"
                                        />
                                    </div>
                                </Space>
                            )}
                        </div>
                    </>
                )}
            </div>
        </Modal>
    )
}
