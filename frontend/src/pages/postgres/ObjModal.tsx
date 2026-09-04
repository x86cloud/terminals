import React, { useState } from 'react'
import { Modal, Form, Input, Select, message } from 'antd'
import CodeEditor from '@/components/CodeEditor'
import { API } from '@/api'

export function CreateDbModal({
    open,
    serverId,
    onClose,
    onSuccess,
}: {
    open: boolean
    serverId: string
    onClose: () => void
    onSuccess: () => void
}) {
    const [form] = Form.useForm()
    const [loading, setLoading] = useState(false)

    const handleCreate = async () => {
        try {
            const vals = await form.validateFields()
            setLoading(true)
            await API.postgresCreateDatabase(serverId, vals.name.trim(), vals.owner || '', vals.encoding || 'UTF8', '')
            form.resetFields()
            onSuccess()
            onClose()
        } catch (e: any) {
            message.error(`创建数据库失败: ${e.message || e}`)
        } finally {
            setLoading(false)
        }
    }

    return (
        <Modal
            title="新建数据库 (Create Database)"
            open={open}
            onOk={handleCreate}
            onCancel={onClose}
            confirmLoading={loading}
            okText="创建"
            cancelText="取消"
        >
            <Form form={form} layout="vertical" initialValues={{ encoding: 'UTF8' }}>
                <Form.Item label="数据库名称" name="name" rules={[{ required: true, message: '请输入数据库名称' }]}>
                    <Input placeholder="输入数据库名称 (例如: mydb_dev)" />
                </Form.Item>
                <Form.Item label="字符集编码" name="encoding">
                    <Select
                        options={[
                            { label: 'UTF8', value: 'UTF8' },
                            { label: 'LATIN1', value: 'LATIN1' },
                            { label: 'GBK', value: 'GBK' },
                        ]}
                    />
                </Form.Item>
                <Form.Item label="所有者角色 (Owner)" name="owner">
                    <Input placeholder="留空使用当前连接用户" />
                </Form.Item>
            </Form>
        </Modal>
    )
}

export function CreateSchemaModal({
    open,
    serverId,
    dbName,
    onClose,
    onSuccess,
}: {
    open: boolean
    serverId: string
    dbName: string
    onClose: () => void
    onSuccess: () => void
}) {
    const [form] = Form.useForm()
    const [loading, setLoading] = useState(false)

    const handleCreate = async () => {
        try {
            const vals = await form.validateFields()
            setLoading(true)
            await API.postgresCreateSchema(serverId, dbName, vals.name.trim(), vals.owner || '')
            form.resetFields()
            onSuccess()
            onClose()
        } catch (e: any) {
            message.error(`创建 Schema 失败: ${e.message || e}`)
        } finally {
            setLoading(false)
        }
    }

    return (
        <Modal
            title="新建 Schema 命名空间"
            open={open}
            onOk={handleCreate}
            onCancel={onClose}
            confirmLoading={loading}
            okText="创建"
            cancelText="取消"
        >
            <Form form={form} layout="vertical">
                <Form.Item label="Schema 名称" name="name" rules={[{ required: true, message: '请输入 Schema 名称' }]}>
                    <Input placeholder="输入 Schema 名称 (例如: auth, analytics)" />
                </Form.Item>
                <Form.Item label="所有者角色 (Owner)" name="owner">
                    <Input placeholder="留空使用当前用户" />
                </Form.Item>
            </Form>
        </Modal>
    )
}

export function CreateTableModal({
    open,
    serverId,
    dbName,
    schema,
    onClose,
    onSuccess,
}: {
    open: boolean
    serverId: string
    dbName: string
    schema: string
    onClose: () => void
    onSuccess: () => void
}) {
    const [tableName, setTableName] = useState('')
    const [defs, setDefs] = useState(`  id SERIAL PRIMARY KEY,\n  name VARCHAR(100) NOT NULL,\n  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`)
    const [loading, setLoading] = useState(false)

    const handleCreate = async () => {
        if (!tableName.trim()) {
            message.warning('请输入表名')
            return
        }
        setLoading(true)
        try {
            await API.postgresCreateTable(serverId, dbName, schema, tableName.trim(), defs.trim())
            setTableName('')
            onSuccess()
            onClose()
        } catch (e: any) {
            message.error(`创建表失败: ${e.message || e}`)
        } finally {
            setLoading(false)
        }
    }

    return (
        <Modal
            title={`在 Schema「${schema}」下新建数据表`}
            open={open}
            width={640}
            onOk={handleCreate}
            onCancel={onClose}
            confirmLoading={loading}
            okText="创建"
            cancelText="取消"
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
                <div>
                    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>数据表名称</div>
                    <Input placeholder="输入表名 (如 orders, accounts)" value={tableName} onChange={(e) => setTableName(e.target.value)} />
                </div>
                <div>
                    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>字段定义与约束 (Column Definitions)</div>
                    <div style={{ border: '1px solid var(--border-color)', borderRadius: 6, overflow: 'hidden' }}>
                        <CodeEditor value={defs} lang="sql" height="200px" onChange={setDefs} />
                    </div>
                </div>
            </div>
        </Modal>
    )
}
