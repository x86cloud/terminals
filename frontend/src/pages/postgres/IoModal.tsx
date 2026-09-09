import React, { useState } from 'react'
import { Modal, Segmented, Button, Input, InputNumber, Select, message } from 'antd'
import { Download, Upload, FileCode } from 'lucide-react'
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
                message.success(`导出成功: ${savedPath}`)
                onClose()
            }
        } catch (e: any) {
            message.error(`导出失败: ${e.message || e}`)
        } finally {
            setLoading(false)
        }
    }

    return (
        <Modal
            title={`导出数据: ${tableName || dbName}`}
            open={open}
            onOk={handleExport}
            onCancel={onClose}
            confirmLoading={loading}
            okText="选择路径并导出"
            cancelText="取消"
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 12 }}>
                <div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>导出格式</div>
                    <Segmented
                        value={mode}
                        onChange={(v) => setMode(v as any)}
                        options={[
                            { label: 'CSV 格式 (*.csv)', value: 'csv' },
                            { label: 'JSON 格式 (*.json)', value: 'json' },
                        ]}
                    />
                </div>

                <div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>导出范围</div>
                    <Segmented
                        value={exportSource}
                        onChange={(v) => setExportSource(v as any)}
                        options={[
                            { label: '整表数据', value: 'table' },
                            { label: '自定义 SQL 导出', value: 'sql' },
                        ]}
                    />
                </div>

                {exportSource === 'sql' && (
                    <div>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>SQL 语句</div>
                        <div style={{ border: '1px solid var(--border-color)', borderRadius: 6, overflow: 'hidden' }}>
                            <CodeEditor value={customSql} lang="sql" height="120px" onChange={setCustomSql} />
                        </div>
                    </div>
                )}

                <div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>限制行数（0 表示不限制）</div>
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
            message.error(`导入失败: ${e.message || e}`)
        } finally {
            setLoading(false)
        }
    }

    return (
        <Modal
            title={`导入数据至「${schema}.${tableName}」`}
            open={open}
            onOk={handleImportFile}
            onCancel={onClose}
            confirmLoading={loading}
            okText="选择文件并导入"
            cancelText="取消"
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 12 }}>
                <div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>导入文件类型</div>
                    <Segmented
                        value={mode}
                        onChange={(v) => setMode(v as any)}
                        options={[
                            { label: 'CSV 数据文件 (*.csv)', value: 'csv' },
                            { label: 'SQL 脚本文件 (*.sql)', value: 'sql' },
                        ]}
                    />
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                    点击「选择文件并导入」将打开系统文件选择对话框。导入 CSV 时首行需包含对应列名。
                </div>
            </div>
        </Modal>
    )
}
