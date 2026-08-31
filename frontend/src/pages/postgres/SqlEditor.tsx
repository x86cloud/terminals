import React, { useState } from 'react'
import { Button, Tooltip, Segmented, Tag, message, Space, Table, Tree } from 'antd'
import { Play, Sparkles, Plus, X, RotateCw, FileCode, CheckCircle2, AlertCircle, Clock, Zap } from 'lucide-react'
import CodeEditor from '@/components/CodeEditor'
import { API } from '@/api'
import { PgQueryResult } from './postgresTypes'
import pg from './SqlEditor.module.less'

interface QueryTab {
    id: string
    title: string
    sql: string
    result: PgQueryResult | null
    explainResult: any | null
    resultMode: 'table' | 'explain' | 'json'
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
            sql: initialSql || `SELECT * FROM information_schema.tables WHERE table_schema = 'public' LIMIT 20;`,
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
        if (activeTabId === id) {
            setActiveTabId(nextTabs[nextTabs.length - 1].id)
        }
    }

    // 执行 SQL
    const handleRunSql = async () => {
        const sqlText = activeTab.sql.trim()
        if (!sqlText) {
            message.warning('请输入要执行的 SQL 语句')
            return
        }

        setRunning(true)
        try {
            const res: PgQueryResult = await API.postgresRun(serverId, dbName, sqlText)
            updateActiveTab({
                result: res,
                resultMode: 'table',
            })
            if (res.error) {
                message.error(`执行出错: ${res.error}`)
            } else {
                message.success(`执行完成 (${res.durationMs} ms)`)
            }
        } catch (e: any) {
            updateActiveTab({
                result: {
                    columns: [],
                    rows: [],
                    affected: 0,
                    durationMs: 0,
                    error: e.message || String(e),
                },
                resultMode: 'table',
            })
            message.error(`执行失败: ${e.message || e}`)
        } finally {
            setRunning(false)
        }
    }

    // 执行 EXPLAIN (ANALYZE)
    const handleExplain = async (analyze = false) => {
        const sqlText = activeTab.sql.trim()
        if (!sqlText) {
            message.warning('请输入要分析的 SQL 语句')
            return
        }

        setRunning(true)
        try {
            const jsonStr = await API.postgresExplain(serverId, dbName, sqlText, analyze, true, true)
            let parsed: any = null
            try {
                parsed = JSON.parse(jsonStr)
            } catch {
                parsed = jsonStr
            }
            updateActiveTab({
                explainResult: parsed,
                resultMode: 'explain',
            })
            message.success(analyze ? 'EXPLAIN ANALYZE 分析完成' : 'EXPLAIN 分析完成')
        } catch (e: any) {
            message.error(`执行 EXPLAIN 失败: ${e.message || e}`)
        } finally {
            setRunning(false)
        }
    }

    // 格式化解析 Plan 树节点
    const renderPlanNode = (plan: any): any => {
        if (!plan) return null
        const title = (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '2px 0' }}>
                <Tag color="geekblue" style={{ fontWeight: 700, marginInlineEnd: 0 }}>
                    {plan['Node Type'] || 'Node'}
                </Tag>
                {plan['Relation Name'] && (
                    <Tag color="blue" style={{ marginInlineEnd: 0 }}>
                        {plan['Schema'] ? `${plan['Schema']}.${plan['Relation Name']}` : plan['Relation Name']}
                    </Tag>
                )}
                {plan['Index Name'] && (
                    <Tag color="purple" style={{ marginInlineEnd: 0 }}>
                        {plan['Index Name']}
                    </Tag>
                )}
                <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                    成本: {plan['Startup Cost']} .. {plan['Total Cost']} | 行数: {plan['Plan Rows']}
                    {plan['Actual Total Time'] !== undefined && ` | 实际耗时: ${plan['Actual Total Time']}ms (${plan['Actual Rows']} 行)`}
                </span>
            </div>
        )

        return {
            key: Math.random().toString(),
            title,
            children: (plan.Plans || []).map((child: any) => renderPlanNode(child)),
        }
    }

    const planTreeData = React.useMemo(() => {
        if (!activeTab.explainResult) return []
        if (Array.isArray(activeTab.explainResult) && activeTab.explainResult[0]?.Plan) {
            return [renderPlanNode(activeTab.explainResult[0].Plan)]
        }
        return []
    }, [activeTab.explainResult])

    return (
        <div className={pg.sqlWrap}>
            {/* 多查询 Tab 栏 */}
            <div className={pg.tabBar}>
                {tabs.map((t) => (
                    <div
                        key={t.id}
                        className={`${pg.sqlTab} ${t.id === activeTabId ? pg.active : ''}`}
                        onClick={() => setActiveTabId(t.id)}
                    >
                        <span>{t.title}</span>
                        {tabs.length > 1 && (
                            <Button
                                type="text"
                                size="small"
                                style={{ width: 16, height: 16, padding: 0 }}
                                icon={<X size={11} />}
                                onClick={(e) => {
                                    e.stopPropagation()
                                    handleCloseTab(t.id)
                                }}
                            />
                        )}
                    </div>
                ))}

                <Tooltip title="新建查询标签">
                    <Button
                        type="text"
                        size="small"
                        style={{ height: 26, width: 26, padding: 0, marginBottom: 3 }}
                        icon={<Plus size={14} />}
                        onClick={handleAddTab}
                    />
                </Tooltip>
            </div>

            {/* SQL 编辑区 */}
            <div style={{ minHeight: 160, maxHeight: '40vh', borderBottom: '1px solid var(--border-color)' }}>
                <CodeEditor
                    value={activeTab.sql}
                    lang="sql"
                    height="180px"
                    placeholder="-- 输入 PostgreSQL SQL 语句，按 Ctrl+Enter 快速执行"
                    onChange={(val) => updateActiveTab({ sql: val })}
                    onModEnter={handleRunSql}
                />
            </div>

            {/* 运行与操作工具栏 */}
            <div className={pg.runBar}>
                <Space size={8}>
                    <Button
                        type="primary"
                        size="small"
                        icon={<Play size={13} fill="currentColor" />}
                        loading={running}
                        onClick={handleRunSql}
                    >
                        执行 (Ctrl+Enter)
                    </Button>

                    <Button
                        size="small"
                        icon={<Zap size={13} />}
                        loading={running}
                        onClick={() => handleExplain(false)}
                    >
                        EXPLAIN
                    </Button>

                    <Button
                        size="small"
                        icon={<Zap size={13} style={{ color: '#ff4d4f' }} />}
                        loading={running}
                        onClick={() => handleExplain(true)}
                    >
                        EXPLAIN ANALYZE
                    </Button>
                </Space>

                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    {activeTab.result && (
                        <span>
                            {activeTab.result.error ? (
                                <Tag color="error">执行失败</Tag>
                            ) : (
                                <>
                                    <Tag color="success">成功</Tag>
                                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                                        {activeTab.result.rows?.length !== undefined
                                            ? `返回 ${activeTab.result.rows.length} 行`
                                            : `影响 ${activeTab.result.affected} 行`}{' '}
                                        | 耗时 {activeTab.result.durationMs} ms
                                    </span>
                                </>
                            )}
                        </span>
                    )}

                    <Segmented
                        size="small"
                        value={activeTab.resultMode}
                        onChange={(v) => updateActiveTab({ resultMode: v as any })}
                        options={[
                            { label: '结果表格', value: 'table' },
                            { label: '执行计划', value: 'explain' },
                        ]}
                    />
                </div>
            </div>

            {/* 结果与展示区 */}
            <div className={pg.resultArea}>
                {activeTab.resultMode === 'table' && (
                    <div className={pg.resultTable}>
                        {activeTab.result?.error ? (
                            <div style={{ padding: 16, color: '#ff4d4f', fontFamily: 'monospace', fontSize: 13 }}>
                                <strong>Error:</strong> {activeTab.result.error}
                            </div>
                        ) : activeTab.result?.rows && activeTab.result.rows.length > 0 ? (
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                                <thead>
                                    <tr style={{ background: 'var(--bg-surface-secondary)', borderBottom: '1px solid var(--border-color)', position: 'sticky', top: 0, zIndex: 2 }}>
                                        <th style={{ width: 45, padding: '6px 8px', textAlign: 'center', color: 'var(--text-secondary)' }}>#</th>
                                        {activeTab.result.columns.map((c) => (
                                            <th key={c} style={{ padding: '6px 10px', borderRight: '1px solid var(--border-color)', fontWeight: 600 }}>
                                                {c}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {activeTab.result.rows.map((row, rIdx) => (
                                        <tr key={rIdx} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                            <td style={{ textAlign: 'center', padding: '6px', color: 'var(--text-secondary)' }}>{rIdx + 1}</td>
                                            {activeTab.result!.columns.map((c) => {
                                                const val = row[c]
                                                return (
                                                    <td key={c} style={{ padding: '6px 10px', borderRight: '1px solid var(--border-color)' }}>
                                                        {val === null ? (
                                                            <span style={{ color: 'var(--text-faint)', fontStyle: 'italic' }}>NULL</span>
                                                        ) : typeof val === 'object' ? (
                                                            JSON.stringify(val)
                                                        ) : (
                                                            String(val)
                                                        )}
                                                    </td>
                                                )
                                            })}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        ) : activeTab.result ? (
                            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>
                                语句执行成功，影响行数: {activeTab.result.affected}
                            </div>
                        ) : (
                            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>
                                点击「执行」或按 Ctrl+Enter 运行 SQL 语句
                            </div>
                        )}
                    </div>
                )}

                {activeTab.resultMode === 'explain' && (
                    <div className={pg.explainTree}>
                        {planTreeData.length > 0 ? (
                            <>
                                <h4 style={{ margin: '0 0 12px', fontSize: 14 }}>执行计划树 (Execution Plan)</h4>
                                <Tree
                                    defaultExpandAll
                                    showLine
                                    treeData={planTreeData}
                                />
                                {Array.isArray(activeTab.explainResult) && activeTab.explainResult[0]?.['Planning Time'] && (
                                    <div style={{ marginTop: 16, color: 'var(--text-secondary)', fontSize: 12 }}>
                                        计划耗时: {activeTab.explainResult[0]['Planning Time']} ms | 执行耗时: {activeTab.explainResult[0]['Execution Time']} ms
                                    </div>
                                )}
                            </>
                        ) : (
                            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-secondary)' }}>
                                点击「EXPLAIN」或「EXPLAIN ANALYZE」分析查询计划
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}
