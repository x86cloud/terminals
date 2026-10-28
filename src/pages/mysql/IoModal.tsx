import { useState } from 'react'
import { Modal, Segmented, Input, InputNumber, Alert } from 'antd'
import { useTranslation } from 'react-i18next'

export interface ExportOptions {
    mode: 'sql' | 'csv' | 'json'
    source: 'table' | 'query'
    table: string
    sqlText: string
    limit: number
}

export interface ImportOptions {
    mode: 'sql' | 'csv' | 'json'
    table: string
}

export default function IoModal(props: {
    kind: 'export' | 'import'
    table: string
    sqlText: string
    busy: boolean
    msg: string
    onClose: () => void
    onExport: (o: ExportOptions) => void
    onImport: (o: ImportOptions) => void
}) {
    const { kind, table, sqlText, busy, msg, onClose, onExport, onImport } = props
    const { t } = useTranslation(['db', 'common'])
    const [mode, setMode] = useState<'sql' | 'csv' | 'json'>('sql')
    const [source, setSource] = useState<'table' | 'query'>('table')
    const [tableName, setTableName] = useState(table)
    const [limit, setLimit] = useState(0)

    const canExport = source === 'table' ? tableName.trim() !== '' : sqlText.trim() !== ''
    const canImport = mode === 'sql' ? true : tableName.trim() !== ''

    const handleOk = () => {
        if (kind === 'export') {
            onExport({ mode, source, table: tableName.trim(), sqlText, limit })
        } else {
            onImport({ mode, table: tableName.trim() })
        }
    }

    return (
        <Modal
            closable={false}
            open={true}
            title={kind === 'export' ? t('db:io.exportTitle') : t('db:io.importTitle')}
            onCancel={() => !busy && onClose()}
            onOk={handleOk}
            confirmLoading={busy}
            okText={kind === 'export' ? t('db:io.exportBtn') : t('db:io.importBtn')}
            cancelText={t('common:cancel')}
            okButtonProps={{ disabled: busy || (kind === 'export' ? !canExport : !canImport) }}
            width={520}
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '10px 0' }}>
                <div>
                    <label style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 6, display: 'block' }}>{t('db:io.format')}</label>
                    <Segmented
                        size="small"
                        value={mode}
                        onChange={(v) => setMode(v as 'sql' | 'csv' | 'json')}
                        options={[
                            { label: 'SQL', value: 'sql' },
                            { label: 'CSV', value: 'csv' },
                            { label: 'JSON', value: 'json' },
                        ]}
                    />
                </div>

                {kind === 'export' ? (
                    <>
                        <div>
                            <label style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 6, display: 'block' }}>{t('db:io.source')}</label>
                            <Segmented
                                size="small"
                                value={source}
                                onChange={(v) => setSource(v as 'table' | 'query')}
                                options={[
                                    { label: t('db:io.currentTable'), value: 'table', disabled: !table },
                                    { label: t('db:io.queryResult'), value: 'query' },
                                ]}
                            />
                        </div>
                        {source === 'table' ? (
                            <div>
                                <label style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 6, display: 'block' }}>{t('db:io.tableName')}</label>
                                <Input value={tableName} onChange={(e) => setTableName(e.target.value)} placeholder={t('db:io.targetTableName')} />
                            </div>
                        ) : (
                            <div>
                                <label style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 6, display: 'block' }}>{t('db:io.querySql')}</label>
                                <Input.TextArea value={sqlText} readOnly rows={4} style={{ fontFamily: 'monospace', fontSize: 12 }} />
                            </div>
                        )}
                        <div>
                            <label style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 6, display: 'block' }}>{t('db:io.limitRows')}</label>
                            <InputNumber min={0} value={limit} onChange={(v) => setLimit(v ?? 0)} style={{ width: '100%' }} />
                        </div>
                    </>
                ) : (
                    <div>
                        <label style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 6, display: 'block' }}>
                            {mode === 'sql' ? t('db:io.targetDb') : t('db:io.targetTableName')}{t('db:io.csvJsonReq')}
                        </label>
                        <Input
                            value={tableName}
                            onChange={(e) => setTableName(e.target.value)}
                            placeholder={mode === 'sql' ? t('db:io.sqlDbPlaceholder') : t('db:io.importTablePlaceholder')}
                        />
                        <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 6 }}>
                            {mode === 'sql' ? t('db:io.sqlHint')
                                : mode === 'json' ? t('db:io.jsonHint')
                                    : t('db:io.csvHint')}
                        </div>
                    </div>
                )}

                {msg && (
                    <Alert
                        type={msg.includes('失败') || msg.toLowerCase().includes('fail') || msg.toLowerCase().includes('error') ? 'error' : 'success'}
                        showIcon
                        title={msg}
                    />
                )}
            </div>
        </Modal>
    )
}
