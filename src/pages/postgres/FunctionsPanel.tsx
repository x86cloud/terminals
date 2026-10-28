import { useState, useEffect } from 'react'
import { Table, Button, Tag, Modal, App } from 'antd'
import { RotateCw, Edit2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
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
    const { t } = useTranslation(['db', 'common'])
    const { message } = App.useApp()
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
            message.error(t('postgres.loadFuncFailed', { error: e.message || e }))
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
            message.success(t('postgres.funcs.saveSuccess'))
            loadFunctions()
        } catch (e: any) {
            message.error(t('postgres.funcs.saveFail', { error: e.message || e }))
        } finally {
            setSaving(false)
        }
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: 16, gap: 16, background: 'var(--bg-surface)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg-surface-secondary)', padding: '10px 16px', borderRadius: 8, border: '1px solid var(--border-color)' }}>
                <div>
                    <span style={{ fontSize: 14, fontWeight: 700 }}>{t('postgres.funcs.title')}</span>
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)', marginLeft: 8 }}>
                        {t('postgres.funcs.schemaCount', { schema, count: funcs.length })}
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
                            title: t('postgres.funcs.colName'),
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
                        { title: t('postgres.funcs.colResultType'), dataIndex: 'resultType', render: (val) => val || 'void' },
                        { title: t('postgres.funcs.colArgTypes'), dataIndex: 'argTypes', ellipsis: true },
                        { title: t('postgres.funcs.colLang'), dataIndex: 'language', render: (l) => <Tag>{l}</Tag> },
                        { title: t('postgres.funcs.colComment'), dataIndex: 'comment', render: (c) => c || '-' },
                        {
                            title: t('postgres.funcs.colAction'),
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
                                    {t('postgres.funcs.viewEdit')}
                                </Button>
                            ),
                        },
                    ]}
                />
            </div>

            {/* 编辑源码弹窗 */}
            <Modal
                title={t('postgres.funcs.editorTitle', { name: editingFunc?.name })}
                open={!!editingFunc}
                width={800}
                onCancel={() => setEditingFunc(null)}
                onOk={handleSaveDef}
                confirmLoading={saving}
                okText={t('postgres.funcs.saveBtn')}
                cancelText={t('postgres.funcs.close')}
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
