import React, { useState, useMemo } from 'react'
import { Button, Tooltip, Segmented, message, Space, Table, Tree } from 'antd'
import {
    Play,
    Plus,
    Clock,
    Zap,
    Download,
    FileCode,
    AlertCircle,
    Sparkles,
} from 'lucide-react'
import CodeEditor from '@/components/CodeEditor'
import TabBar, { TabItem } from '@/components/common/TabBar'
import { DbSqlEditorAdapter, DbQueryResult, ExplainPlanResult } from '../types'
import s from './DbSqlEditor.module.less'

interface QueryTab {
    id: string
    title: string
    sql: string
    result: DbQueryResult | null
    durationMs?: number
    error?: string
    explainResult?: ExplainPlanResult | null
    resultMode: 'table' | 'explain' | 'json'
}

export interface DbSqlEditorProps {
    adapter: DbSqlEditorAdapter
    initialSql?: string
}

export default function DbSqlEditor({ adapter, initialSql }: DbSqlEditorProps) {
    const { dialect, placeholder, defaultSql } = adapter

    const [tabs, setTabs] = useState<QueryTab[]>([
        {
            id: 'tab_1',
            title: '查询 1',
            sql: initialSql || defaultSql,
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
            const res = await adapter.runSql(sqlText)
            const durationMs = res.durationMs ?? Math.round(performance.now() - t0)
            updateActiveTab({
                result: res,
                durationMs,
                error: res.error || '',
                resultMode: 'table',
            })
            if (res.error) {
                message.error(`执行出错: ${res.error}`)
            }
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

        if (!adapter.explainSql) {
            message.info('当前数据库方言未实现 EXPLAIN 解析')
            return
        }

        setRunning(true)
        try {
            const planRes = await adapter.explainSql(sqlText)
            updateActiveTab({
                explainResult: planRes,
                resultMode: 'explain',
            })
        } catch (e: any) {
            message.error(`执行 EXPLAIN 失败: ${e.message || e}`)
        } finally {
            setRunning(false)
        }
    }

    // 导出 CSV
    const handleExportCsv = () => {
        if (!activeTab.result?.rows?.length) {
            message.info('无结果可导出')
            return
        }
        const cols = activeTab.result.columns || []
        const csv = [
            cols.join(','),
            ...activeTab.result.rows.map((r) =>
                cols.map((c) => JSON.stringify(r[c] ?? '')).join(',')
            ),
        ].join('\n')
        navigator.clipboard.writeText(csv)
        message.success('已将查询结果作为 CSV 复制到剪贴板')
    }

    const planTreeData = useMemo(() => {
        if (!activeTab.explainResult?.treeData) return []
        return activeTab.explainResult.treeData
    }, [activeTab.explainResult])

    return (
        <div className={s.sqlWrap}>
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
                className={s.tabBar}
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
            <div className={s.editorContainer}>
                <CodeEditor
                    value={activeTab.sql}
                    lang="sql"
                    bordered={false}
                    height="180px"
                    placeholder={
                        placeholder || `-- 输入 ${dialect.toUpperCase()} SQL 语句，按 Ctrl+Enter 快速执行`
                    }
                    onChange={(val) => updateActiveTab({ sql: val })}
                    onModEnter={handleRunSql}
                />
            </div>

            {/* 快捷操作栏 */}
            <div className={s.runBar}>
                <Space size={8}>
                    <Button
                        type="primary"
                        icon={<Play size={14} />}
                        loading={running}
                        onClick={handleRunSql}
                    >
                        运行 (Ctrl+Enter)
                    </Button>
                    {adapter.explainSql && (
                        <Button
                            icon={<Sparkles size={14} />}
                            disabled={running}
                            onClick={handleExplain}
                        >
                            EXPLAIN 分析
                        </Button>
                    )}
                </Space>

                {activeTab.result && (
                    <Segmented
                        size="small"
                        value={activeTab.resultMode}
                        onChange={(v) => updateActiveTab({ resultMode: v as any })}
                        options={[
                            {
                                label: `结果集 (${activeTab.result.rows?.length ?? 0})`,
                                value: 'table',
                            },
                            {
                                label: '执行计划树',
                                value: 'explain',
                                disabled: !activeTab.explainResult,
                            },
                            {
                                label: 'JSON 视图',
                                value: 'json',
                                disabled: !activeTab.result.rows?.length,
                            },
                        ]}
                    />
                )}
            </div>

            {/* 结果显示区 */}
            <div className={s.resultArea}>
                {activeTab.error && (
                    <div className={s.errorBanner}>
                        <AlertCircle size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                        {activeTab.error}
                    </div>
                )}

                {activeTab.resultMode === 'table' && activeTab.result && (
                    <>
                        <div className={s.resultHead}>
                            <Space size={12}>
                                <span className={s.metaTag}>
                                    <Clock size={12} /> 耗时: {activeTab.durationMs || 0} ms
                                </span>
                                <span className={s.metaTag}>
                                    <Zap size={12} /> 返回:{' '}
                                    {activeTab.result.rows?.length ?? activeTab.result.affected ?? 0} 行
                                </span>
                            </Space>

                            <Button size="small" icon={<Download size={13} />} onClick={handleExportCsv}>
                                导出 CSV
                            </Button>
                        </div>

                        <div className={s.tableWrap}>
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
                                        if (val === null || val === undefined) {
                                            return (
                                                <span
                                                    style={{
                                                        color: 'var(--text-faint)',
                                                        fontStyle: 'italic',
                                                    }}
                                                >
                                                    NULL
                                                </span>
                                            )
                                        }
                                        if (typeof val === 'object') return JSON.stringify(val)
                                        return String(val)
                                    },
                                }))}
                            />
                        </div>
                    </>
                )}

                {activeTab.resultMode === 'explain' && activeTab.explainResult && (
                    <div className={s.explainTreeWrap}>
                        {planTreeData.length > 0 ? (
                            <Tree defaultExpandAll showLine treeData={planTreeData} />
                        ) : activeTab.explainResult.tableResult ? (
                            <Table
                                size="small"
                                pagination={false}
                                dataSource={activeTab.explainResult.tableResult.rows}
                                rowKey={(_, idx) => idx!}
                                columns={activeTab.explainResult.tableResult.columns.map(
                                    (col: string) => ({
                                        title: col,
                                        dataIndex: col,
                                        key: col,
                                    })
                                )}
                            />
                        ) : (
                            <pre style={{ padding: 12, fontFamily: 'monospace', fontSize: 12 }}>
                                {JSON.stringify(activeTab.explainResult.raw, null, 2)}
                            </pre>
                        )}
                    </div>
                )}

                {activeTab.resultMode === 'json' && activeTab.result && (
                    <pre className={s.jsonWrap}>
                        {JSON.stringify(activeTab.result.rows, null, 2)}
                    </pre>
                )}

                {!activeTab.result && !activeTab.error && !activeTab.explainResult && (
                    <div className={s.emptyTip}>
                        <FileCode size={36} opacity={0.3} />
                        <span>输入 SQL 语句并点击「运行」查看执行结果</span>
                    </div>
                )}
            </div>
        </div>
    )
}
