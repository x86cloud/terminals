import React, { useState, useMemo } from 'react'
import { Button, Tooltip, Segmented, Tag, message, Space, Table, Tree } from 'antd'
import { Play, Sparkles, Plus, X, RotateCw, FileCode, CheckCircle2, AlertCircle, Clock, Zap, Download } from 'lucide-react'
import CodeEditor from '@/components/CodeEditor'
import TabBar, { TabItem } from '@/components/common/TabBar'
import { API } from '@/api'
import { MysqlQueryResult } from '@/types'
import { SqlTab } from './mysqlTypes'
import my from './SqlEditor.module.less'
import db from '@/pages/mysql/dbTable.module.less'

interface QueryTab {
    id: string
    title: string
    sql: string
    result: MysqlQueryResult | null
    durationMs?: number
    error?: string
    explainResult: any | null
    resultMode: 'table' | 'explain' | 'raw'
}

export default function SqlEditor({
    serverId,
    dbName,
    initialSql,
}: {
    serverId: string
    dbName: string
    initialSql?: string
}) {
    const [tabs, setTabs] = useState<QueryTab[]>([
        {
            id: 'tab_1',
            title: '查询 1',
            sql: initialSql || `SELECT table_name, table_rows, data_length, create_time FROM information_schema.tables WHERE table_schema = '${dbName}' LIMIT 20;`,
            result: null,
            explainResult: null,
            resultMode: 'table',
        },
    ])
    const [activeTabId, setActiveTabId] = useState('tab_1')
    const [running, setRunning] = useState(false)

    const activeTab = tabs.find((t) => t.id === activeTabId) || tabs[0]

    const updateActiveTab = (patch: Partial<QueryTab>) => {
        setTabs((prev) => prev.map((t) => (t.id === activeTabId ? { ...t, ...patch } : t)))
    }

    const tabItems: TabItem[] = useMemo(() => {
        return tabs.map((t) => ({
            key: t.id,
            label: t.title,
            icon: <Play size={12} />,
            closable: tabs.length > 1,
        }))
    }, [tabs])

    const handleAddTab = () => {
        const id = 'tab_' + Date.now()
        const newTab: QueryTab = {
            id,
            title: `查询 ${tabs.length + 1}`,
            sql: '',
            result: null,
            explainResult: null,
            resultMode: 'table',
        }
        setTabs((prev) => [...prev, newTab])
        setActiveTabId(id)
    }

    const handleCloseTab = (id: string) => {
        if (tabs.length <= 1) return
        const nextTabs = tabs.filter((t) => t.id !== id)
        setTabs(nextTabs)
        if (activeTabId === id && nextTabs.length > 0) {
            const closedIdx = tabs.findIndex((t) => t.id === id)
            const nextActive = nextTabs[Math.min(closedIdx, nextTabs.length - 1)]
            if (nextActive) setActiveTabId(nextActive.id)
        }
    }

    const handleCloseAllTabs = () => {
        if (tabs.length <= 1) return
        const first = tabs[0]
        setTabs([first])
        setActiveTabId(first.id)
    }

    const handleCloseLeftTabs = (targetId: string) => {
        const idx = tabs.findIndex((t) => t.id === targetId)
        if (idx <= 0) return
        const nextTabs = tabs.slice(idx)
        setTabs(nextTabs)
        setActiveTabId(targetId)
    }

    const handleCloseRightTabs = (targetId: string) => {
        const idx = tabs.findIndex((t) => t.id === targetId)
        if (idx < 0 || idx >= tabs.length - 1) return
        const nextTabs = tabs.slice(0, idx + 1)
        setTabs(nextTabs)
        setActiveTabId(targetId)
    }

    // 执行 SQL
    const handleRunSql = async () => {
        const sqlText = activeTab.sql.trim()
        if (!sqlText) {
            message.warning('请输入要执行的 SQL 语句')
            return
        }

        setRunning(true)
        const t0 = performance.now()
        try {
            const res = await API.mysqlRun(serverId, dbName, sqlText)
            const durationMs = Math.round(performance.now() - t0)
            updateActiveTab({
                result: res,
                durationMs,
                error: '',
                resultMode: 'table',
            })
        } catch (e: any) {
            const durationMs = Math.round(performance.now() - t0)
            const errStr = e.message || String(e)
            updateActiveTab({
                result: { columns: [], rows: [], affected: 0, rowCount: 0 },
                durationMs,
                error: errStr,
                resultMode: 'table',
            })
            message.error(`执行失败: ${errStr}`)
        } finally {
            setRunning(false)
        }
    }

    // 执行 EXPLAIN 分析
    const handleExplain = async () => {
        const sqlText = activeTab.sql.trim()
        if (!sqlText) {
            message.warning('请输入要分析的 SQL 语句')
            return
        }

        setRunning(true)
        try {
            // 尝试 EXPLAIN FORMAT=JSON
            let jsonParsed: any = null
            try {
                const jsonRes = await API.mysqlRun(serverId, dbName, `EXPLAIN FORMAT=JSON ${sqlText}`)
                if (jsonRes && jsonRes.rows && jsonRes.rows[0]) {
                    const rawVal = jsonRes.rows[0]['EXPLAIN'] || Object.values(jsonRes.rows[0])[0]
                    if (typeof rawVal === 'string') {
                        jsonParsed = JSON.parse(rawVal)
                    } else {
                        jsonParsed = rawVal
                    }
                }
            } catch {
                // 如果不支持 JSON，退回到传统 EXPLAIN
                const tabRes = await API.mysqlRun(serverId, dbName, `EXPLAIN ${sqlText}`)
                jsonParsed = tabRes
            }

            updateActiveTab({
                explainResult: jsonParsed,
                resultMode: 'explain',
            })
        } catch (e: any) {
            message.error(`执行 EXPLAIN 失败: ${e.message || e}`)
        } finally {
            setRunning(false)
        }
    }

    // 格式化解析 MySQL EXPLAIN 树节点
    const renderPlanNode = (node: any): any => {
        if (!node) return null

        if (node.query_block) {
            const qb = node.query_block
            const costInfo = qb.cost_info?.query_cost ? ` (Cost: ${qb.cost_info.query_cost})` : ''
            const children: any[] = []
            if (qb.table) children.push(renderPlanNode({ table: qb.table }))
            if (qb.nested_loop) {
                qb.nested_loop.forEach((nl: any) => children.push(renderPlanNode(nl)))
            }
            if (qb.grouping_operation) {
                children.push(renderPlanNode(qb.grouping_operation))
            }
            if (qb.ordering_operation) {
                children.push(renderPlanNode(qb.ordering_operation))
            }

            return {
                key: Math.random().toString(),
                title: (
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '2px 0' }}>
                        <Tag color="geekblue" style={{ fontWeight: 700, marginInlineEnd: 0 }}>
                            Query Block #{qb.select_id || 1}
                        </Tag>
                        <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{costInfo}</span>
                    </div>
                ),
                children: children.filter(Boolean),
            }
        }

        if (node.table) {
            const t = node.table
            return {
                key: Math.random().toString(),
                title: (
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '2px 0' }}>
                        <Tag color="blue" style={{ fontWeight: 600, marginInlineEnd: 0 }}>
                            Table: {t.table_name}
                        </Tag>
                        <Tag color={t.access_type === 'ALL' ? 'red' : t.access_type === 'index' ? 'orange' : 'green'} style={{ marginInlineEnd: 0 }}>
                            {t.access_type || 'Scan'}
                        </Tag>
                        {t.key && (
                            <Tag color="purple" style={{ marginInlineEnd: 0 }}>
                                Key: {t.key}
                            </Tag>
                        )}
                        <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                            扫描行数: {t.rows_examined_per_scan ?? t.rows ?? '-'}
                            {t.filtered && ` | 过滤率: ${t.filtered}%`}
                        </span>
                    </div>
                ),
            }
        }

        return {
            key: Math.random().toString(),
            title: <span>{JSON.stringify(node)}</span>,
        }
    }

    const planTreeData = React.useMemo(() => {
        if (!activeTab.explainResult) return []
        if (activeTab.explainResult.query_block) {
            return [renderPlanNode(activeTab.explainResult)]
        }
        return []
    }, [activeTab.explainResult])

    return (
        <div className={my.sqlWrap}>
            {/* 多查询 Tab 栏 */}
            <TabBar
                items={tabItems}
                activeKey={activeTabId}
                onChange={setActiveTabId}
                onClose={handleCloseTab}
                onCloseAll={handleCloseAllTabs}
                onCloseLeft={handleCloseLeftTabs}
                onCloseRight={handleCloseRightTabs}
                size="small"
                className={my.tabBar}
                extraRight={
                    <Tooltip title="新建查询标签">
                        <Button
                            type="text"
                            size="small"
                            style={{
                                width: 26,
                                height: 26,
                                padding: 0,
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                            }}
                            icon={<Plus size={13} />}
                            onClick={handleAddTab}
                        />
                    </Tooltip>
                }
            />

            {/* SQL 编辑区 */}
            <div style={{ minHeight: 160, maxHeight: '40vh', borderBottom: '1px solid var(--border-color)' }}>
                <CodeEditor
                    value={activeTab.sql}
                    lang="sql"
                    bordered={false}
                    height="180px"
                    placeholder="-- 输入 MySQL SQL 语句，按 Ctrl+Enter 快速执行"
                    onChange={(val) => updateActiveTab({ sql: val })}
                    onModEnter={handleRunSql}
                />
            </div>

            {/* 快捷操作栏 */}
            <div className={my.runBar}>
                <Space size={8}>
                    <Button
                        type="primary"
                        icon={<Play size={14} />}
                        loading={running}
                        onClick={handleRunSql}
                    >
                        运行 (Ctrl+Enter)
                    </Button>
                    <Button
                        icon={<Sparkles size={14} />}
                        disabled={running}
                        onClick={handleExplain}
                    >
                        EXPLAIN 分析
                    </Button>
                </Space>

                {activeTab.result && (
                    <Segmented
                        size="small"
                        value={activeTab.resultMode}
                        onChange={(v) => updateActiveTab({ resultMode: v as any })}
                        options={[
                            { label: `结果集 (${activeTab.result.rows?.length ?? 0})`, value: 'table' },
                            { label: '执行计划树', value: 'explain', disabled: !activeTab.explainResult },
                        ]}
                    />
                )}
            </div>

            {/* 结果显示区 */}
            <div className={my.resultArea}>
                {activeTab.error && (
                    <div className={my.errorBanner}>
                        <AlertCircle size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                        {activeTab.error}
                    </div>
                )}

                {activeTab.resultMode === 'table' && activeTab.result && (
                    <>
                        <div className={my.resultHead}>
                            <Space size={12}>
                                <span className={my.metaTag}>
                                    <Clock size={12} /> 耗时: {activeTab.durationMs || 0} ms
                                </span>
                                <span className={my.metaTag}>
                                    <Zap size={12} /> 返回: {activeTab.result.rows?.length ?? activeTab.result.affected ?? 0} 行
                                </span>
                            </Space>

                            <Button
                                size="small"
                                icon={<Download size={13} />}
                                onClick={() => {
                                    if (!activeTab.result?.rows?.length) {
                                        message.info('无结果可导出')
                                        return
                                    }
                                    const cols = activeTab.result.columns || []
                                    const csv = [
                                        cols.join(','),
                                        ...activeTab.result.rows.map((r) => cols.map((c) => JSON.stringify(r[c] ?? '')).join(',')),
                                    ].join('\n')
                                    navigator.clipboard.writeText(csv)
                                }}
                            >
                                导出 CSV
                            </Button>
                        </div>

                        <div className={my.tableWrap}>
                            <Table
                                size="small"
                                pagination={{ pageSize: 50, showSizeChanger: true }}
                                dataSource={activeTab.result.rows || []}
                                rowKey={(_, idx) => idx!}
                                scroll={{ x: 'max-content', y: 'calc(100vh - 420px)' }}
                                columns={(activeTab.result.columns || []).map((col) => ({
                                    title: col,
                                    dataIndex: col,
                                    key: col,
                                    render: (val) => {
                                        if (val === null || val === undefined) return <span style={{ color: 'var(--text-faint)', fontStyle: 'italic' }}>NULL</span>
                                        if (typeof val === 'object') return JSON.stringify(val)
                                        return String(val)
                                    },
                                }))}
                            />
                        </div>
                    </>
                )}

                {activeTab.resultMode === 'explain' && (
                    <div className={my.explainTreeWrap}>
                        {planTreeData.length > 0 ? (
                            <Tree
                                defaultExpandAll
                                showLine
                                treeData={planTreeData}
                            />
                        ) : activeTab.explainResult?.rows ? (
                            <Table
                                size="small"
                                pagination={false}
                                dataSource={activeTab.explainResult.rows}
                                rowKey={(_, idx) => idx!}
                                columns={(activeTab.explainResult.columns || []).map((col: string) => ({
                                    title: col,
                                    dataIndex: col,
                                    key: col,
                                }))}
                            />
                        ) : (
                            <pre style={{ padding: 12, fontFamily: 'monospace', fontSize: 12 }}>
                                {JSON.stringify(activeTab.explainResult, null, 2)}
                            </pre>
                        )}
                    </div>
                )}

                {!activeTab.result && !activeTab.error && !activeTab.explainResult && (
                    <div className={my.emptyTip}>
                        <FileCode size={36} opacity={0.3} />
                        <span>输入 SQL 语句并点击「运行」查看执行结果</span>
                    </div>
                )}
            </div>
        </div>
    )
}
