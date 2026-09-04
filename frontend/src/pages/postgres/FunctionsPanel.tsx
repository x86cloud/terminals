import React, { useState, useEffect } from 'react'
import { Table, Button, Tag, Space, message, Modal, Tooltip } from 'antd'
import { Code2, RotateCw, Play, Copy, Edit2 } from 'lucide-react'
import CodeEditor from '@/components/CodeEditor'
import { API } from '@/api'
import { PgFunction } from './postgresTypes'

export default function FunctionsPanel({
    serverId,
    dbName,
    schema,
}: {
    serverId: string
    dbName: string
    schema: string
}) {
    const [funcs, setFuncs] = useState<PgFunction[]>([])
    const [loading, setLoading] = useState(false)
    const [editingFunc, setEditingFunc] = useState<PgFunction | null>(null)
    const [defContent, setDefContent] = useState('')
    const [saving, setSaving] = useState(false)

    const loadFunctions = async () => {
        setLoading(true)
        try {
            const list = await API.postgresFunctions(serverId, dbName, schema)
            setFuncs(list || [])
        } catch (e: any) {
            message.error(`加载函数失败: ${e.message || e}`)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        loadFunctions()
    }, [serverId, dbName, schema])

    const handleSaveDef = async () => {
        if (!defContent.trim()) return
        setSaving(true)
        try {
            await API.postgresRun(serverId, dbName, defContent.trim())
            setEditingFunc(null)
            loadFunctions()
        } catch (e: any) {
            message.error(`更新失败: ${e.message || e}`)
        } finally {
            setSaving(false)
        }
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: 16, gap: 16, background: 'var(--bg-surface)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg-surface-secondary)', padding: '10px 16px', borderRadius: 8, border: '1px solid var(--border-color)' }}>
                <div>
                    <span style={{ fontSize: 14, fontWeight: 700 }}>函数与存储过程 (Functions & Procedures)</span>
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)', marginLeft: 8 }}>
                        Schema: {schema} (共 {funcs.length} 个)
                    </span>
                </div>
                <Button size="small" icon={<RotateCw size={13} />} loading={loading} onClick={loadFunctions} />
            </div>

            <div style={{ flex: 1, overflow: 'auto', background: 'var(--bg-surface-secondary)', border: '1px solid var(--border-color)', borderRadius: 8, padding: 16 }}>
                <Table
                    size="small"
                    dataSource={funcs}
                    rowKey="name"
                    pagination={false}
                    columns={[
                        {
                            title: '名称',
                            dataIndex: 'name',
                            render: (name, r: PgFunction) => (
                                <span>
                                    <strong>{name}</strong>
                                    {r.isProc ? (
                                        <Tag color="purple" style={{ marginLeft: 6 }}>PROCEDURE</Tag>
                                    ) : (
                                        <Tag color="blue" style={{ marginLeft: 6 }}>FUNCTION</Tag>
                                    )}
                                </span>
                            ),
                        },
                        { title: '返回类型', dataIndex: 'resultType', render: (t) => t || 'void' },
                        { title: '入参列表', dataIndex: 'argTypes', ellipsis: true },
                        { title: '编写语言', dataIndex: 'language', render: (l) => <Tag>{l}</Tag> },
                        { title: '说明', dataIndex: 'comment', render: (c) => c || '-' },
                        {
                            title: '操作',
                            width: 120,
                            render: (_, r: PgFunction) => (
                                <Button
                                    size="small"
                                    type="link"
                                    icon={<Edit2 size={13} />}
                                    style={{ padding: 0 }}
                                    onClick={() => {
                                        setEditingFunc(r)
                                        setDefContent(r.def || '')
                                    }}
                                >
                                    查看 / 编辑
                                </Button>
                            ),
                        },
                    ]}
                />
            </div>

            {/* 编辑源码弹窗 */}
            <Modal
                title={`函数源码: ${editingFunc?.name}`}
                open={!!editingFunc}
                width={800}
                onCancel={() => setEditingFunc(null)}
                onOk={handleSaveDef}
                confirmLoading={saving}
                okText="执行并保存"
                cancelText="关闭"
            >
                <div style={{ marginTop: 12, border: '1px solid var(--border-color)', borderRadius: 6, overflow: 'hidden' }}>
                    <CodeEditor
                        value={defContent}
                        lang="sql"
                        height="400px"
                        onChange={setDefContent}
                    />
                </div>
            </Modal>
        </div>
    )
}
