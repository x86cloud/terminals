import { useState } from 'react'
import { Modal, Form, Input, Select, App } from 'antd'
import { useTranslation } from 'react-i18next'
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
    const { t } = useTranslation(['db', 'common'])
    const { message } = App.useApp()
    const [form] = Form.useForm()
    const [loading, setLoading] = useState(false)

    const handleCreate = async () => {
        try {
            const vals = await form.validateFields()
            setLoading(true)
            await API.postgresCreateDatabase(serverId, vals.name.trim(), vals.owner || '', vals.encoding || 'UTF8', '')
            form.resetFields()
            message.success(t('postgres.obj.createDbSuccess'))
            onSuccess()
            onClose()
        } catch (e: any) {
            message.error(t('postgres.obj.createDbFail', { error: e.message || e }))
        } finally {
            setLoading(false)
        }
    }

    return (
        <Modal
            title={t('postgres.obj.createDbTitle')}
            open={open}
            onOk={handleCreate}
            onCancel={onClose}
            confirmLoading={loading}
            okText={t('postgres.obj.create')}
            cancelText={t('postgres.obj.cancel')}
        >
            <Form form={form} layout="vertical" initialValues={{ encoding: 'UTF8' }}>
                <Form.Item label={t('postgres.obj.dbName')} name="name" rules={[{ required: true, message: t('postgres.obj.dbNameReq') }]}>
                    <Input placeholder={t('postgres.obj.dbNamePlaceholder')} />
                </Form.Item>
                <Form.Item label={t('postgres.obj.encoding')} name="encoding">
                    <Select
                        options={[
                            { label: 'UTF8', value: 'UTF8' },
                            { label: 'LATIN1', value: 'LATIN1' },
                            { label: 'GBK', value: 'GBK' },
                        ]}
                    />
                </Form.Item>
                <Form.Item label={t('postgres.obj.owner')} name="owner">
                    <Input placeholder={t('postgres.obj.ownerDbPlaceholder')} />
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
    const { t } = useTranslation(['db', 'common'])
    const { message } = App.useApp()
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
            message.error(t('postgres.obj.createSchemaFail', { error: e.message || e }))
        } finally {
            setLoading(false)
        }
    }

    return (
        <Modal
            title={t('postgres.obj.createSchemaTitle')}
            open={open}
            onOk={handleCreate}
            onCancel={onClose}
            confirmLoading={loading}
            okText={t('postgres.obj.create')}
            cancelText={t('postgres.obj.cancel')}
        >
            <Form form={form} layout="vertical">
                <Form.Item label={t('postgres.obj.schemaName')} name="name" rules={[{ required: true, message: t('postgres.obj.schemaNameReq') }]}>
                    <Input placeholder={t('postgres.obj.schemaNamePlaceholder')} />
                </Form.Item>
                <Form.Item label={t('postgres.obj.owner')} name="owner">
                    <Input placeholder={t('postgres.obj.ownerSchemaPlaceholder')} />
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
    const { t } = useTranslation(['db', 'common'])
    const { message } = App.useApp()
    const [tableName, setTableName] = useState('')
    const [defs, setDefs] = useState(`  id SERIAL PRIMARY KEY,\n  name VARCHAR(100) NOT NULL,\n  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`)
    const [loading, setLoading] = useState(false)

    const handleCreate = async () => {
        if (!tableName.trim()) {
            message.warning(t('postgres.obj.tableNameReq'))
            return
        }
        setLoading(true)
        try {
            await API.postgresCreateTable(serverId, dbName, schema, tableName.trim(), defs.trim())
            setTableName('')
            onSuccess()
            onClose()
        } catch (e: any) {
            message.error(t('postgres.obj.createTableFail', { error: e.message || e }))
        } finally {
            setLoading(false)
        }
    }

    return (
        <Modal
            title={t('postgres.obj.createTableTitle', { schema })}
            open={open}
            width={640}
            onOk={handleCreate}
            onCancel={onClose}
            confirmLoading={loading}
            okText={t('postgres.obj.create')}
            cancelText={t('postgres.obj.cancel')}
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
                <div>
                    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{t('postgres.obj.tableName')}</div>
                    <Input placeholder={t('postgres.obj.tableNamePlaceholder')} value={tableName} onChange={(e) => setTableName(e.target.value)} />
                </div>
                <div>
                    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{t('postgres.obj.colDefs')}</div>
                    <div style={{ border: '1px solid var(--border-color)', borderRadius: 6, overflow: 'hidden' }}>
                        <CodeEditor value={defs} lang="sql" height="200px" onChange={setDefs} />
                    </div>
                </div>
            </div>
        </Modal>
    )
}
