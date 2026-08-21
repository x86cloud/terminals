import React from 'react'
import { Button, Tooltip } from 'antd'
import { X, Plus, Play } from 'lucide-react'
import CodeEditor from '@/components/CodeEditor'
import my from '@/pages/mysql/SqlEditor.module.less'
import sh from '@/pages/mysql/mysqlShared.module.less'
import dbStyle from '@/pages/mysql/dbTable.module.less'
import { SqlTab } from '@/pages/mysql/mysqlTypes'

export default function SqlEditor({
    sqlTabs,
    activeSqlTab,
    activeTabObj,
    busy,
    db,
    onSelectTab,
    onAddTab,
    onCloseTab,
    onContentChange,
    onRun,
}: {
    sqlTabs: SqlTab[]
    activeSqlTab: string
    activeTabObj: SqlTab
    busy: boolean
    db: string
    onSelectTab: (id: string) => void
    onAddTab: () => void
    onCloseTab: (id: string) => void
    onContentChange: (val: string) => void
    onRun: () => void
}) {
    return (
        <div className={my.sqlWrap}>
            <div className={my.sqlTabBar}>
                {sqlTabs.map((t) => (
                    <div
                        key={t.id}
                        className={`${my.sqlTab}${t.id === activeSqlTab ? ' ' + my.active : ''}`}
                        onClick={() => onSelectTab(t.id)}
                    >
                        <span>{t.title}</span>
                        {sqlTabs.length > 1 && (
                            <Button
                                size="small"
                                type="text"
                                className={my.sqlTabClose}
                                icon={<X size={11} />}
                                onClick={(e) => { e.stopPropagation(); onCloseTab(t.id) }}
                            />
                        )}
                    </div>
                ))}
                <Tooltip title="新建查询标签">
                    <Button
                        size="small"
                        type="text"
                        icon={<Plus size={13} />}
                        onClick={onAddTab}
                    />
                </Tooltip>
            </div>
            <CodeEditor
                value={activeTabObj.content}
                height="180px"
                lang="sql"
                lineNumbers={false}
                bordered={false}
                onChange={(val) => onContentChange(val)}
                onModEnter={() => onRun()}
            />
            <div className={my.sqlRunBar} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px' }}>
                <Button
                    size="small"
                    type="primary"
                    icon={<Play size={12} />}
                    disabled={busy}
                    onClick={onRun}
                >
                    执行
                </Button>
                <span className={sh.mysqlCount} style={{ fontSize: 12, color: 'var(--text-dim)' }}>库：{db || '（未选）'}</span>
                {activeTabObj.error && <span className={sh.mysqlError}>{activeTabObj.error}</span>}
            </div>
            <div className={my.sqlResultArea}>
                {activeTabObj.result && activeTabObj.result.columns.length > 0 ? (
                    <>
                        <div className={my.sqlResultMeta}>共 {activeTabObj.result.rowCount} 行</div>
                        <GridInline columns={activeTabObj.result.columns} rows={activeTabObj.result.rows} />
                    </>
                ) : activeTabObj.result ? (
                    <div className={`${sh.mysqlEmpty} ${my.small}`}>影响行数：{activeTabObj.result.affected}</div>
                ) : activeTabObj.error ? (
                    <div className={`${sh.mysqlEmpty} ${my.small}`}>{activeTabObj.error}</div>
                ) : (
                    <div className={`${sh.mysqlEmpty} ${my.small}`}>执行结果将在此显示</div>
                )}
            </div>
        </div>
    )
}

function GridInline({ columns, rows }: { columns: string[]; rows: Record<string, any>[] }) {
    if (!columns.length) return <div className={sh.mysqlEmpty}>无结果</div>
    return (
        <div className={dbStyle.dbTableScroll} style={{ border: 'none', borderRadius: 0 }}>
            <table className={dbStyle.dbTable}>
                <thead><tr>{columns.map((c) => <th key={c}>{c}</th>)}</tr></thead>
                <tbody>
                    {rows.map((r, i) => (
                        <tr key={i}>
                            {columns.map((c) => (
                                <td key={c}>{r[c] === null || r[c] === undefined ? <span className={sh.mysqlNull}>NULL</span> : String(r[c])}</td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}
