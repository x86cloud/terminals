import React, { useState } from 'react'
import { Modal, Radio, Button, Input, Space, Alert, Progress, message } from 'antd'
import { Download, Copy } from 'lucide-react'
import { copyTextToClipboard } from '@/utils/sqlExport'
import { API } from '@/api'
import { errorMessage } from '@/utils'

export type MongoExportFormat = 'json' | 'extended-json' | 'csv'
export type MongoExportScope = 'current' | 'all'

interface Props {
    sessionId: string
    db: string
    coll: string
    currentDocs: string[] // Extended JSON strings
    filter: string
    onClose: () => void
}

function convertDocsToCsv(docs: any[]): string {
    if (!docs.length) return ''
    // 收集所有顶层 key
    const headerSet = new Set<string>()
    docs.forEach((d) => {
        if (d && typeof d === 'object') {
            Object.keys(d).forEach((k) => headerSet.add(k))
        }
    })
    const headers = Array.from(headerSet)
    // 确保 _id 放在最前
    const idIdx = headers.indexOf('_id')
    if (idIdx > -1) {
        headers.splice(idIdx, 1)
        headers.unshift('_id')
    }

    const escapeCsv = (val: any): string => {
        if (val === null || val === undefined) return ''
        let s = typeof val === 'object' ? JSON.stringify(val) : String(val)
        if (s.includes('"') || s.includes(',') || s.includes('\n') || s.includes('\r')) {
            s = `"${s.replace(/"/g, '""')}"`
        }
        return s
    }

    const rows = [headers.map((h) => `"${h.replace(/"/g, '""')}"`).join(',')]
    for (const doc of docs) {
        const row = headers.map((h) => escapeCsv(doc?.[h]))
        rows.push(row.join(','))
    }
    return rows.join('\n')
}

export default function IoModal({ sessionId, db, coll, currentDocs, filter, onClose }: Props) {
    const [format, setFormat] = useState<MongoExportFormat>('json')
    const [scope, setScope] = useState<MongoExportScope>('current')
    const [filename, setFilename] = useState(`${coll}_export`)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')

    const triggerDownload = (content: string, ext: string) => {
        const mime = ext === 'csv' ? 'text/csv;charset=utf-8;' : 'application/json;charset=utf-8;'
        const blob = new Blob([content], { type: mime })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${filename || coll}.${ext}`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
    }

    const fetchExportDocs = async (): Promise<string[]> => {
        if (scope === 'current') {
            return currentDocs
        }
        // scope === 'all': 查询满足 filter 的全部文档（最多限制 10000 条防 OOM）
        const res = await API.mongoFind(sessionId, {
            database: db,
            collection: coll,
            filter: filter.trim() || '{}',
            projection: '',
            sort: '',
            limit: 10000,
            skip: 0,
            hint: '',
            collation: '',
        })
        return res.documents || []
    }

    const handleExport = async (action: 'download' | 'copy') => {
        setBusy(true)
        setError('')
        try {
            const rawDocs = await fetchExportDocs()
            if (!rawDocs.length) {
                message.warning('没有可导出的文档数据')
                return
            }

            let exportText = ''
            const parsed = rawDocs.map((s) => {
                try {
                    return JSON.parse(s)
                } catch {
                    return s
                }
            })

            if (format === 'json') {
                exportText = JSON.stringify(parsed, null, 2)
            } else if (format === 'extended-json') {
                // 每行一条或数组
                exportText = parsed.map((item) => JSON.stringify(item)).join('\n')
            } else if (format === 'csv') {
                exportText = convertDocsToCsv(parsed)
            }

            if (action === 'download') {
                triggerDownload(exportText, format === 'csv' ? 'csv' : 'json')
                message.success(`已导出 ${rawDocs.length} 条文档`)
                onClose()
            } else {
                await copyTextToClipboard(exportText, `已复制 ${rawDocs.length} 条文档到剪贴板`)
                onClose()
            }
        } catch (e) {
            setError(errorMessage(e))
        } finally {
            setBusy(false)
        }
    }

    return (
        <Modal
            open={true}
            title={`导出数据 · ${coll}`}
            onCancel={() => !busy && onClose()}
            footer={[
                <Button key="cancel" onClick={onClose} disabled={busy}>
                    取消
                </Button>,
                <Button
                    key="copy"
                    icon={<Copy size={13} />}
                    loading={busy}
                    onClick={() => handleExport('copy')}
                >
                    复制到剪贴板
                </Button>,
                <Button
                    key="download"
                    type="primary"
                    icon={<Download size={13} />}
                    loading={busy}
                    onClick={() => handleExport('download')}
                >
                    下载导出文件
                </Button>,
            ]}
            width={520}
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '8px 0' }}>
                {error && <Alert type="error" showIcon message={error} />}

                <div>
                    <label style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 6, display: 'block' }}>
                        导出格式
                    </label>
                    <Radio.Group value={format} onChange={(e) => setFormat(e.target.value)}>
                        <Radio.Button value="json">标准 JSON 数组</Radio.Button>
                        <Radio.Button value="extended-json">JSON Lines / Extended</Radio.Button>
                        <Radio.Button value="csv">CSV 表格文件</Radio.Button>
                    </Radio.Group>
                </div>

                <div>
                    <label style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 6, display: 'block' }}>
                        导出范围
                    </label>
                    <Radio.Group value={scope} onChange={(e) => setScope(e.target.value)}>
                        <Radio value="current">当前页文档 ({currentDocs.length} 条)</Radio>
                        <Radio value="all">按当前查询条件筛选全部数据 (最多 10000 条)</Radio>
                    </Radio.Group>
                </div>

                <div>
                    <label style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 6, display: 'block' }}>
                        保存文件名
                    </label>
                    <Input
                        value={filename}
                        onChange={(e) => setFilename(e.target.value)}
                        addonAfter={format === 'csv' ? '.csv' : '.json'}
                        placeholder="导出文件名"
                    />
                </div>
            </div>
        </Modal>
    )
}
