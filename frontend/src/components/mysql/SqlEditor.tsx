import React from 'react'
import CodeMirror from '@uiw/react-codemirror'
import Icon from '../Icon'
import {lightEditorTheme} from '../editorTheme'
import g from '../../styles/global.module.less'
import my from './SqlEditor.module.less'
import sh from './mysqlShared.module.less'
import dbStyle from '../dbTable.module.less'
import {SqlTab, sqlExtension} from './mysqlTypes'

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
                            <button className={my.sqlTabClose} onClick={(e) => { e.stopPropagation(); onCloseTab(t.id) }}>
                                <Icon name="close" size={11}/>
                            </button>
                        )}
                    </div>
                ))}
                <button className={my.sqlTabAdd} onClick={onAddTab} title="新建查询标签">
                    <Icon name="plus" size={12}/>
                </button>
            </div>
            <CodeMirror
                value={activeTabObj.content}
                height="180px"
                theme={lightEditorTheme}
                extensions={[sqlExtension()]}
                onChange={(val) => onContentChange(val)}
                onKeyDown={(e) => {
                    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                        e.preventDefault()
                        onRun()
                    }
                }}
            />
            <div className={my.sqlRunBar}>
                <button className={`${g.btn} ${g.sm} ${g.primary}`} disabled={busy} onClick={onRun}>
                    执行 (Ctrl+Enter)
                </button>
                <span className={sh.mysqlCount}>库：{db || '（未选）'}</span>
                {activeTabObj.error && <span className={sh.mysqlError}>{activeTabObj.error}</span>}
            </div>
            <div className={my.sqlResultArea}>
                {activeTabObj.result && activeTabObj.result.columns.length > 0 ? (
                    <>
                        <div className={my.sqlResultMeta}>共 {activeTabObj.result.rowCount} 行</div>
                        <GridInline columns={activeTabObj.result.columns} rows={activeTabObj.result.rows}/>
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

function GridInline({columns, rows}: { columns: string[]; rows: Record<string, any>[] }) {
    if (!columns.length) return <div className={sh.mysqlEmpty}>无结果</div>
    return (
        <div className={dbStyle.dbTableScroll} style={{border: 'none', borderRadius: 0}}>
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
