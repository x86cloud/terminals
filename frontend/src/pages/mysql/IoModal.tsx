import React, { useState } from 'react'
import { Modal, Segmented, Input, InputNumber, Alert, Space } from 'antd'

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
            title={kind === 'export' ? '导出数据' : '导入数据'}
            onCancel={() => !busy && onClose()}
            onOk={handleOk}
            confirmLoading={busy}
            okText={kind === 'export' ? '导出' : '选择文件并导入'}
            cancelText="取消"
            okButtonProps={{ disabled: busy || (kind === 'export' ? !canExport : !canImport) }}
            width={520}
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '10px 0' }}>
                <div>
                    <label style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 6, display: 'block' }}>格式</label>
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
                            <label style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 6, display: 'block' }}>来源</label>
                            <Segmented
                                size="small"
                                value={source}
                                onChange={(v) => setSource(v as 'table' | 'query')}
                                options={[
                                    { label: '当前表', value: 'table', disabled: !table },
                                    { label: '查询结果', value: 'query' },
                                ]}
                            />
                        </div>
                        {source === 'table' ? (
                            <div>
                                <label style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 6, display: 'block' }}>表名</label>
                                <Input value={tableName} onChange={(e) => setTableName(e.target.value)} placeholder="目标表名" />
                            </div>
                        ) : (
                            <div>
                                <label style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 6, display: 'block' }}>查询语句（来自 SQL 编辑器）</label>
                                <Input.TextArea value={sqlText} readOnly rows={4} style={{ fontFamily: 'monospace', fontSize: 12 }} />
                            </div>
                        )}
                        <div>
                            <label style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 6, display: 'block' }}>限制行数（0 表示不限制）</label>
                            <InputNumber min={0} value={limit} onChange={(v) => setLimit(v ?? 0)} style={{ width: '100%' }} />
                        </div>
                    </>
                ) : (
                    <div>
                        <label style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 6, display: 'block' }}>
                            {mode === 'sql' ? '目标数据库' : '目标表名'}（CSV/JSON 必填）
                        </label>
                        <Input
                            value={tableName}
                            onChange={(e) => setTableName(e.target.value)}
                            placeholder={mode === 'sql' ? '可选，留空使用当前库' : '导入到的表名'}
                        />
                        <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 6 }}>
                            {mode === 'sql' ? '将逐条执行文件中的 SQL 语句（支持多语句）。'
                                : mode === 'json' ? 'JSON 为对象数组，键对应列名。'
                                    : 'CSV 首行为列名，其余为数据行，空单元格写入 NULL。'}
                        </div>
                    </div>
                )}

                {msg && (
                    <Alert
                        type={msg.startsWith('失败') ? 'error' : 'success'}
                        showIcon
                        message={msg}
                    />
                )}
            </div>
        </Modal>
    )
}
