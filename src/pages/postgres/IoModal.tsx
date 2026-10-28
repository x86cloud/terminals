import { useState } from 'react'
import { Modal, Segmented, InputNumber, App } from 'antd'
import { useTranslation } from 'react-i18next'
import CodeEditor from '@/components/CodeEditor'
import { API } from '@/api'

export function ExportModal({
    open,
    serverId,
    dbName,
    schema,
    tableName,
    onClose,
}: {
    open: boolean
    serverId: string
    dbName: string
    schema: string
    tableName: string
    onClose: () => void
}) {
    const { t } = useTranslation(['db', 'common'])
    const { message } = App.useApp()
    const [mode, setMode] = useState<'csv' | 'json'>('csv')
    const [exportSource, setExportSource] = useState<'table' | 'sql'>('table')
    const [customSql, setCustomSql] = useState(`SELECT * FROM "${schema}"."${tableName}";`)
    const [limit, setLimit] = useState<number>(0)
    const [loading, setLoading] = useState(false)

    const handleExport = async () => {
        setLoading(true)
        try {
            const savedPath = await API.postgresExportToFile(
                serverId,
                dbName,
                schema,
                mode,
                exportSource,
                tableName,
                customSql,
                limit
            )
            if (savedPath) {
                message.success(t('postgres.io.exportSuccess', { path: savedPath }))
                onClose()
            }
        } catch (e: any) {
            message.error(t('postgres.io.exportFail', { error: e.message || e }))
        } finally {
            setLoading(false)
        }
    }

    return (
        <Modal
            title={t('postgres.io.exportTitle', { target: tableName || dbName })}
            open={open}
            onOk={handleExport}
            onCancel={onClose}
            confirmLoading={loading}
            okText={t('postgres.io.exportBtn')}
            cancelText={t('postgres.obj.cancel')}
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 12 }}>
                <div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>{t('postgres.io.exportFormat')}</div>
                    <Segmented
                        value={mode}
                        onChange={(v) => setMode(v as any)}
                        options={[
                            { label: t('postgres.io.csvFormat'), value: 'csv' },
                            { label: t('postgres.io.jsonFormat'), value: 'json' },
                        ]}
                    />
                </div>

                <div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>{t('postgres.io.exportScope')}</div>
                    <Segmented
                        value={exportSource}
                        onChange={(v) => setExportSource(v as any)}
                        options={[
                            { label: t('postgres.io.fullTable'), value: 'table' },
                            { label: t('postgres.io.customSql'), value: 'sql' },
                        ]}
                    />
                </div>

                {exportSource === 'sql' && (
                    <div>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>{t('postgres.io.sqlStmt')}</div>
                        <div style={{ border: '1px solid var(--border-color)', borderRadius: 6, overflow: 'hidden' }}>
                            <CodeEditor value={customSql} lang="sql" height="120px" onChange={setCustomSql} />
                        </div>
                    </div>
                )}

                <div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>{t('postgres.io.limitRows')}</div>
                    <InputNumber min={0} value={limit} onChange={(v) => setLimit(v ?? 0)} style={{ width: '100%' }} />
                </div>
            </div>
        </Modal>
    )
}

export function ImportModal({
    open,
    serverId,
    dbName,
    schema,
    tableName,
    onClose,
    onSuccess,
}: {
    open: boolean
    serverId: string
    dbName: string
    schema: string
    tableName: string
    onClose: () => void
    onSuccess: () => void
}) {
    const { t } = useTranslation(['db', 'common'])
    const { message } = App.useApp()
    const [mode, setMode] = useState<'csv' | 'sql'>('csv')
    const [loading, setLoading] = useState(false)

    const handleImportFile = async () => {
        setLoading(true)
        try {
            const res = await API.postgresImportFromFile(serverId, dbName, schema, mode, tableName)
            if (res) {
                message.success(res)
                onSuccess()
                onClose()
            }
        } catch (e: any) {
            message.error(t('postgres.io.importFail', { error: e.message || e }))
        } finally {
            setLoading(false)
        }
    }

    return (
        <Modal
            title={t('postgres.io.importTitle', { schema, table: tableName })}
            open={open}
            onOk={handleImportFile}
            onCancel={onClose}
            confirmLoading={loading}
            okText={t('postgres.io.importBtn')}
            cancelText={t('postgres.obj.cancel')}
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 12 }}>
                <div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>{t('postgres.io.importFileType')}</div>
                    <Segmented
                        value={mode}
                        onChange={(v) => setMode(v as any)}
                        options={[
                            { label: t('postgres.io.csvFile'), value: 'csv' },
                            { label: t('postgres.io.sqlFile'), value: 'sql' },
                        ]}
                    />
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                    {t('postgres.io.importHint')}
                </div>
            </div>
        </Modal>
    )
}
