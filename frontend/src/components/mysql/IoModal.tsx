import React, {useState} from 'react'
import Icon from '../Icon'
import g from '../../styles/global.module.less'
import my from './IoModal.module.less'

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
    const {kind, table, sqlText, busy, msg, onClose, onExport, onImport} = props
    const [mode, setMode] = useState<'sql' | 'csv' | 'json'>(kind === 'export' ? 'sql' : 'sql')
    const [source, setSource] = useState<'table' | 'query'>('table')
    const [tableName, setTableName] = useState(table)
    const [limit, setLimit] = useState(0)

    const canExport = source === 'table' ? tableName.trim() !== '' : sqlText.trim() !== ''
    const canImport = mode === 'sql' ? true : tableName.trim() !== ''

    return (
        <div className={g.modalMask} onClick={() => !busy && onClose()}>
            <div className={`${g.modal} ${g.ioModal}`} onClick={(e) => e.stopPropagation()}>
                <div className={g.modalHead}>
                    <span>{kind === 'export' ? '导出数据' : '导入数据'}</span>
                    <button className={g.iconBtn} disabled={busy} onClick={onClose}><Icon name="close" size={14}/></button>
                </div>
                <div className={g.modalBody}>
                    <div className={g.field}>
                        <label>格式</label>
                        <div className={`${g.segmented} ${g.sm}`}>
                            <button className={mode === 'sql' ? g.active : ''} onClick={() => setMode('sql')}>SQL</button>
                            <button className={mode === 'csv' ? g.active : ''} onClick={() => setMode('csv')}>CSV</button>
                            <button className={mode === 'json' ? g.active : ''} onClick={() => setMode('json')}>JSON</button>
                        </div>
                    </div>
                    {kind === 'export' ? (
                        <>
                            <div className={g.field}>
                                <label>来源</label>
                                <div className={`${g.segmented} ${g.sm}`}>
                                    <button className={source === 'table' ? g.active : ''} disabled={!table} onClick={() => setSource('table')}>当前表</button>
                                    <button className={source === 'query' ? g.active : ''} onClick={() => setSource('query')}>查询结果</button>
                                </div>
                            </div>
                            {source === 'table' ? (
                                <div className={g.field}>
                                    <label>表名</label>
                                    <input value={tableName} onChange={(e) => setTableName(e.target.value)} placeholder="目标表名"/>
                                </div>
                            ) : (
                                <div className={g.field}>
                                    <label>查询语句（来自 SQL 编辑器）</label>
                                    <textarea value={sqlText} readOnly rows={4} className={my.mysqlSqlInput}/>
                                </div>
                            )}
                            <div className={g.field}>
                                <label>限制行数（0 表示不限制）</label>
                                <input type="number" min={0} value={limit} onChange={(e) => setLimit(Number(e.target.value) || 0)}/>
                            </div>
                        </>
                    ) : (
                        <div className={g.field}>
                            <label>{mode === 'sql' ? '目标数据库' : '目标表名'}（CSV/JSON 必填）</label>
                            <input value={tableName} onChange={(e) => setTableName(e.target.value)}
                                   placeholder={mode === 'sql' ? '可选，留空使用当前库' : '导入到的表名'}/>
                            <p className={g.ioHint}>
                                {mode === 'sql' ? '将逐条执行文件中的 SQL 语句（支持多语句）。'
                                    : mode === 'json' ? 'JSON 为对象数组，键对应列名。'
                                        : 'CSV 首行为列名，其余为数据行，空单元格写入 NULL。'}
                            </p>
                        </div>
                    )}
                    {msg && <div className={`${g.ioMsg} ${msg.startsWith('失败') ? g.err : g.ok}`}>{msg}</div>}
                </div>
                <div className={g.modalFoot}>
                    <button className={`${g.btn} ${g.sm}`} disabled={busy} onClick={onClose}>取消</button>
                    {kind === 'export' ? (
                        <button className={`${g.btn} ${g.sm} ${g.primary}`} disabled={busy || !canExport}
                                onClick={() => onExport({mode, source, table: tableName.trim(), sqlText, limit})}>导出</button>
                    ) : (
                        <button className={`${g.btn} ${g.sm} ${g.primary}`} disabled={busy || !canImport}
                                onClick={() => onImport({mode, table: tableName.trim()})}>选择文件并导入</button>
                    )}
                </div>
            </div>
        </div>
    )
}
