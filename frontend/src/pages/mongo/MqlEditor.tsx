import React, { useState, useEffect, useMemo, useCallback } from 'react'
import {
    Select,
    Button,
    Space,
    Tag,
    Segmented,
    Tooltip,
    Alert,
    Dropdown,
    MenuProps,
    message,
} from 'antd'
import {
    Play,
    RotateCw,
    Code,
    Table as TableIcon,
    FileText,
    AlignLeft,
    Trash2,
    Copy,
    ChevronDown,
} from 'lucide-react'
import { API } from '@/api'
import { errorMessage } from '@/utils'
import { copyTextToClipboard } from '@/utils/sqlExport'
import { MongoSessionInfo } from '@/types'
import CodeEditor from '@/components/CodeEditor'
import ResizableTable, { ColDef, calcColWidthFromName } from '@/components/ResizableTable'
import e from './MqlEditor.module.less'

interface Props {
    session: MongoSessionInfo
    databases: string[]
    currentDb: string
    onChangeDb: (db: string) => void
    collectionsMap?: Record<string, string[]>
}

const TEMPLATES = [
    {
        key: 'find',
        label: 'find 查询模板',
        content: `{\n  "find": "users",\n  "filter": {},\n  "sort": { "_id": -1 },\n  "limit": 50\n}`,
    },
    {
        key: 'aggregate',
        label: 'aggregate 聚合管道模板',
        content: `{\n  "aggregate": "users",\n  "pipeline": [\n    { "$match": {} },\n    { "$limit": 50 }\n  ],\n  "cursor": {}\n}`,
    },
    {
        key: 'count',
        label: 'count 文档计数',
        content: `{\n  "count": "users",\n  "query": {}\n}`,
    },
    {
        key: 'distinct',
        label: 'distinct 唯一值',
        content: `{\n  "distinct": "users",\n  "key": "status",\n  "query": {}\n}`,
    },
    {
        key: 'serverStatus',
        label: 'serverStatus 服务器状态',
        content: `{\n  "serverStatus": 1\n}`,
    },
]

export default function MqlEditor({ session, databases, currentDb, onChangeDb, collectionsMap = {} }: Props) {
    const id = session.id
    const [db, setDb] = useState<string>(currentDb || databases[0] || 'admin')
    const [selectedColl, setSelectedColl] = useState<string>('')
    const [code, setCode] = useState<string>(TEMPLATES[0].content)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')
    const [duration, setDuration] = useState(0)

    // 执行结果状态
    const [rawResult, setRawResult] = useState<string>('')
    const [parsedResult, setParsedResult] = useState<any>(null)
    const [resultMode, setResultMode] = useState<'table' | 'json' | 'explain'>('json')
    const [explainText, setExplainText] = useState('')

    const collections = useMemo(() => {
        return collectionsMap[db] || []
    }, [collectionsMap, db])

    useEffect(() => {
        if (currentDb && currentDb !== db) {
            setDb(currentDb)
        }
    }, [currentDb])

    useEffect(() => {
        if (collections.length > 0 && !selectedColl) {
            setSelectedColl(collections[0])
        }
    }, [collections, selectedColl])

    // 格式化当前输入的 JSON
    const formatCode = () => {
        try {
            const obj = JSON.parse(code)
            setCode(JSON.stringify(obj, null, 2))
            message.success('JSON 已格式化')
        } catch {
            message.warning('当前输入不是有效的 JSON')
        }
    }

    // 运行查询
    const handleRun = useCallback(async () => {
        if (!db) {
            message.warning('请先选择目标数据库')
            return
        }
        setBusy(true)
        setError('')
        setExplainText('')
        const startTime = Date.now()

        try {
            let cmdObj: any
            try {
                cmdObj = JSON.parse(code.trim())
            } catch (err: any) {
                throw new Error(`JSON 语法解析失败: ${err.message}`)
            }

            // 如果输入的是纯数组，且选了集合，自动包装为 aggregate
            if (Array.isArray(cmdObj)) {
                if (!selectedColl) {
                    throw new Error('当前输入为聚合管道数组，请在上方选择目标集合')
                }
                cmdObj = {
                    aggregate: selectedColl,
                    pipeline: cmdObj,
                    cursor: {},
                }
            }

            // 如果输入的是纯 filter 对象（不含 command 动词），自动包装为 find
            const commandKeys = ['find', 'aggregate', 'count', 'distinct', 'delete', 'insert', 'update', 'serverStatus', 'ping', 'collStats', 'buildInfo', 'drop']
            const hasCmdKey = Object.keys(cmdObj).some((k) => commandKeys.includes(k))
            if (!hasCmdKey && selectedColl) {
                cmdObj = {
                    find: selectedColl,
                    filter: cmdObj,
                    limit: 50,
                }
            }

            const commandJSON = JSON.stringify(cmdObj)
            const resStr = await API.mongoRunCommand(id, db, commandJSON)
            const cost = Date.now() - startTime
            setDuration(cost)
            setRawResult(resStr)

            let parsed: any = null
            try {
                parsed = JSON.parse(resStr)
            } catch {
                parsed = resStr
            }
            setParsedResult(parsed)

            // 如果结果中有 cursor.firstBatch，优先切到 table 视图
            if (parsed?.cursor?.firstBatch && Array.isArray(parsed.cursor.firstBatch) && parsed.cursor.firstBatch.length > 0) {
                setResultMode('table')
            } else {
                setResultMode('json')
            }
        } catch (e) {
            setError(errorMessage(e))
        } finally {
            setBusy(false)
        }
    }, [code, db, id, selectedColl])

    // 执行 Explain 执行计划
    const handleExplain = async () => {
        if (!db) return
        setBusy(true)
        setError('')
        const startTime = Date.now()
        try {
            let cmdObj: any = JSON.parse(code.trim())
            // 包装成 explain 命令
            const explainCmd = {
                explain: cmdObj,
                verbosity: 'executionStats',
            }
            const resStr = await API.mongoRunCommand(id, db, JSON.stringify(explainCmd))
            setDuration(Date.now() - startTime)
            let pretty = resStr
            try {
                pretty = JSON.stringify(JSON.parse(resStr), null, 2)
            } catch {
                /* keep */
            }
            setExplainText(pretty)
            setResultMode('explain')
        } catch (e) {
            setError(errorMessage(e))
        } finally {
            setBusy(false)
        }
    }

    // 提取结果中的文档行
    const resultRows = useMemo((): any[] => {
        if (!parsedResult) return []
        if (Array.isArray(parsedResult)) return parsedResult
        if (parsedResult.cursor?.firstBatch && Array.isArray(parsedResult.cursor.firstBatch)) {
            return parsedResult.cursor.firstBatch
        }
        if (parsedResult.documents && Array.isArray(parsedResult.documents)) {
            return parsedResult.documents
        }
        return []
    }, [parsedResult])

    // 动态提取结果列
    const resultCols = useMemo((): ColDef[] => {
        if (!resultRows.length) return []
        const keySet = new Set<string>()
        resultRows.forEach((r) => {
            if (r && typeof r === 'object') {
                Object.keys(r).forEach((k) => keySet.add(k))
            }
        })
        const keys = Array.from(keySet)
        const idIdx = keys.indexOf('_id')
        if (idIdx > -1) {
            keys.splice(idIdx, 1)
            keys.unshift('_id')
        }

        const indexCol: ColDef = {
            key: '__idx',
            label: '#',
            width: 46,
            minWidth: 42,
            resizable: false,
            align: 'center',
        }

        const cols: ColDef[] = keys.map((k) => {
            const isPk = k === '_id'
            const minW = calcColWidthFromName(k, { isPk, minWidth: 85 })
            return {
                key: k,
                label: k,
                width: minW,
                minWidth: minW,
                resizable: true,
                isPk,
            }
        })
        return [indexCol, ...cols]
    }, [resultRows])

    const templateMenu: MenuProps = {
        items: TEMPLATES.map((t) => ({
            key: t.key,
            label: t.label,
            onClick: () => {
                let text = t.content
                if (selectedColl && (t.key === 'find' || t.key === 'aggregate' || t.key === 'count' || t.key === 'distinct')) {
                    text = text.replace(/"users"/g, `"${selectedColl}"`)
                }
                setCode(text)
            },
        })),
    }

    return (
        <div className={e.mqlWrap}>
            {/* 顶部工具栏 */}
            <div className={e.toolbar}>
                <Space size={8}>
                    <Select
                        size="small"
                        style={{ width: 140 }}
                        value={db}
                        onChange={(v) => {
                            setDb(v)
                            onChangeDb(v)
                        }}
                        options={databases.map((d) => ({ label: d, value: d }))}
                        placeholder="选择数据库"
                    />
                    <Select
                        size="small"
                        style={{ width: 140 }}
                        value={selectedColl || undefined}
                        onChange={setSelectedColl}
                        options={collections.map((c) => ({ label: c, value: c }))}
                        placeholder="选择集合"
                        allowClear
                    />
                    <Dropdown menu={templateMenu}>
                        <Button size="small" icon={<ChevronDown size={12} />}>
                            指令模板
                        </Button>
                    </Dropdown>
                </Space>

                <Space size={8} style={{ marginLeft: 8 }}>
                    <Tooltip title="执行当前指令 (快捷键: Ctrl + Enter)">
                        <Button
                            type="primary"
                            size="small"
                            icon={<Play size={12} />}
                            loading={busy}
                            onClick={handleRun}
                        >
                            执行
                        </Button>
                    </Tooltip>
                    <Button size="small" icon={<FileText size={12} />} loading={busy} onClick={handleExplain}>
                        Explain 执行计划
                    </Button>
                    <Button size="small" icon={<AlignLeft size={12} />} onClick={formatCode}>
                        格式化
                    </Button>
                    <Button size="small" icon={<Trash2 size={12} />} onClick={() => setCode('{\n  \n}')}>
                        清空
                    </Button>
                </Space>

                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
                    {duration > 0 && <Tag color="geekblue">{duration}ms</Tag>}
                    {resultRows.length > 0 && <Tag color="green">{resultRows.length} 条数据</Tag>}
                </div>
            </div>

            {/* 编辑区 */}
            <div className={e.editorPane}>
                <CodeEditor
                    lang="json"
                    value={code}
                    onChange={setCode}
                    height="100%"
                    placeholder="输入 MongoDB 数据库命令 JSON 或 MQL"
                />
            </div>

            {/* 结果区 */}
            <div className={e.resultPane}>
                <div className={e.resultHeader}>
                    <Segmented
                        size="small"
                        value={resultMode}
                        onChange={(v) => setResultMode(v as any)}
                        options={[
                            { label: '表格视图', value: 'table', icon: <TableIcon size={12} />, disabled: resultRows.length === 0 },
                            { label: 'JSON 响应', value: 'json', icon: <Code size={12} /> },
                            { label: '执行计划', value: 'explain', icon: <FileText size={12} />, disabled: !explainText },
                        ]}
                    />

                    <Space size={6}>
                        {resultMode === 'json' && rawResult && (
                            <Button
                                size="small"
                                type="text"
                                icon={<Copy size={12} />}
                                onClick={() => copyTextToClipboard(rawResult, '已复制 JSON 响应')}
                            >
                                复制 JSON
                            </Button>
                        )}
                        {resultMode === 'explain' && explainText && (
                            <Button
                                size="small"
                                type="text"
                                icon={<Copy size={12} />}
                                onClick={() => copyTextToClipboard(explainText, '已复制执行计划')}
                            >
                                复制计划
                            </Button>
                        )}
                    </Space>
                </div>

                <div className={e.resultBody}>
                    {error && (
                        <div style={{ padding: 12 }}>
                            <Alert type="error" showIcon message={error} />
                        </div>
                    )}

                    {resultMode === 'table' && resultRows.length > 0 && (
                        <ResizableTable cols={resultCols} data={resultRows}>
                            <tbody>
                                {resultRows.map((r, rIdx) => (
                                    <tr key={rIdx}>
                                        <td style={{ textAlign: 'center', color: 'var(--text-faint)', fontSize: 11 }}>
                                            {rIdx + 1}
                                        </td>
                                        {resultCols
                                            .filter((c) => c.key !== '__idx')
                                            .map((c) => {
                                                const val = r[c.key]
                                                const str =
                                                    val === null || val === undefined
                                                        ? 'null'
                                                        : typeof val === 'object'
                                                        ? JSON.stringify(val)
                                                        : String(val)
                                                return (
                                                    <td key={c.key} title={str}>
                                                        {str}
                                                    </td>
                                                )
                                            })}
                                    </tr>
                                ))}
                            </tbody>
                        </ResizableTable>
                    )}

                    {resultMode === 'json' && (
                        rawResult ? (
                            <pre className={e.jsonViewer}>
                                {(() => {
                                    try {
                                        return JSON.stringify(JSON.parse(rawResult), null, 2)
                                    } catch {
                                        return rawResult
                                    }
                                })()}
                            </pre>
                        ) : (
                            !error && (
                                <div className={e.emptyTip}>
                                    <span>暂无执行结果</span>
                                    <span style={{ fontSize: 11 }}>点击上方「执行」或按 Ctrl+Enter 运行 MQL 指令</span>
                                </div>
                            )
                        )
                    )}

                    {resultMode === 'explain' && explainText && (
                        <pre className={e.jsonViewer}>{explainText}</pre>
                    )}
                </div>
            </div>
        </div>
    )
}
