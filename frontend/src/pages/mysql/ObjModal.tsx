import React from 'react'
import { Modal, Input, Switch, Alert, Button, Space } from 'antd'
import CodeEditor from '@/components/CodeEditor'

export type ObjModalKind = 'createdb' | 'createtable' | 'dropdb' | 'droptable' | 'truncate' | 'createindex' | 'dropindex'

export default function ObjModal(props: {
    kind: ObjModalKind
    db?: string
    placeholder?: string
    busy: boolean
    msg: string
    name: string
    extra: string
    unique?: boolean
    onName: (v: string) => void
    onExtra: (v: string) => void
    onUnique?: (v: boolean) => void
    onClose: () => void
    onConfirm: () => void
}) {
    const { kind, db, placeholder, busy, msg, name, extra, unique = false, onName, onExtra, onUnique, onClose, onConfirm } = props
    const titleMap: Record<string, string> = {
        createdb: '新建数据库', dropdb: '删除数据库', createtable: db ? `在 ${db} 中新建表` : '新建表',
        droptable: '删除表', truncate: '清空表数据', createindex: '新建索引', dropindex: '删除索引',
    }
    const needName = !['truncate', 'dropindex'].includes(kind)
    const needDef = kind === 'createtable'
    const needCols = kind === 'createindex'
    const needConfirm = ['dropdb', 'droptable', 'truncate', 'dropindex'].includes(kind)

    const isConfirmDisabled = busy || (!needConfirm && (needName || needDef || needCols) && !name && !extra)

    return (
        <Modal
            closable={false}
            open={true}
            title={titleMap[kind] || '数据库操作'}
            onCancel={() => !busy && onClose()}
            onOk={onConfirm}
            confirmLoading={busy}
            okText={needConfirm ? '确认执行' : '确定'}
            cancelText="取消"
            okButtonProps={{ danger: needConfirm, disabled: isConfirmDisabled }}
            width={kind === 'createtable' ? 620 : 480}
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '10px 0' }}>
                {msg && (
                    <Alert
                        type={msg.startsWith('失败') ? 'error' : 'success'}
                        showIcon
                        message={msg}
                    />
                )}

                {needConfirm && (
                    <div style={{ fontSize: 13 }}>
                        {kind === 'dropindex' && (
                            <p style={{ margin: 0, color: 'var(--text-color)' }}>
                                确定要删除索引 <strong>{name}</strong> 吗？此操作不可撤销。
                            </p>
                        )}
                        {kind === 'dropdb' && (
                            <p style={{ margin: 0, color: '#ef4444' }}>
                                确定要删除数据库 <strong>{name}</strong> 吗？库中所有数据将被永久删除。
                            </p>
                        )}
                        {kind === 'droptable' && (
                            <p style={{ margin: 0, color: '#ef4444' }}>
                                确定要删除表 <strong>{name}</strong> 吗？表中所有数据将被永久删除。
                            </p>
                        )}
                        {kind === 'truncate' && (
                            <p style={{ margin: 0, color: '#ef4444' }}>
                                确定要清空表 <strong>{name}</strong> 的全部数据吗？此操作不可撤销。
                            </p>
                        )}
                    </div>
                )}

                {needName && (
                    <div>
                        <label style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 6, display: 'block' }}>
                            {kind === 'createindex' ? '索引名称' : kind === 'createdb' ? '数据库名' : '表名'}
                        </label>
                        <Input
                            value={name}
                            onChange={(e) => onName(e.target.value)}
                            placeholder={kind === 'createdb' ? '例如 app_db' : '例如 users'}
                        />
                    </div>
                )}

                {needDef && (
                    <div>
                        <label style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 6, display: 'block' }}>
                            列定义（SQL）
                        </label>
                        <div style={{ border: '1px solid var(--border, #d4dbe6)', borderRadius: '6px', overflow: 'hidden' }}>
                            <CodeEditor
                                value={extra}
                                onChange={onExtra}
                                lang="sql"
                                height="160px"
                                minHeight="80px"
                                placeholder={placeholder || "`id` INT PRIMARY KEY AUTO_INCREMENT, `name` VARCHAR(64)"}
                                lineNumbers={true}
                            />
                        </div>
                    </div>
                )}

                {needCols && (
                    <>
                        <div>
                            <label style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 6, display: 'block' }}>
                                索引列（逗号分隔）
                            </label>
                            <Input
                                value={extra}
                                onChange={(e) => onExtra(e.target.value)}
                                placeholder="col1, col2"
                            />
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: 12 }}>唯一索引 (UNIQUE)</span>
                            <Switch checked={unique} onChange={(checked) => onUnique?.(checked)} />
                        </div>
                    </>
                )}
            </div>
        </Modal>
    )
}
