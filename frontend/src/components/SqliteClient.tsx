import React, {useCallback, useEffect, useState} from 'react'
import Icon from './Icon'
import {API} from '../api'
import {errorMessage} from '../utils'
import {SqliteSessionInfo, SqliteTableInfo, SqliteColumnInfo, SqliteQueryResult, SqliteIndexInfo} from '../types'
import g from '../styles/global.module.less'
import sq from './SqliteClient.module.less'
import sh from './mysql/mysqlShared.module.less'

interface Props {
    session: SqliteSessionInfo
    onClose: () => void
}

const PAGE_SIZE = 100

export default function SqliteClient({session, onClose}: Props) {
    const [tables, setTables] = useState<SqliteTableInfo[]>([])
    const [selected, setSelected] = useState<string | null>(null)
    const [dataView, setDataView] = useState<'data' | 'struct' | 'index'>('data')
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')
    const [info, setInfo] = useState<{ path: string; size: number }>({path: session.path, size: session.size})
    const [pathError, setPathError] = useState('')

    // 数据态
    const [rows, setRows] = useState<Record<string, any>[]>([])
    const [columns, setColumns] = useState<string[]>([])
    const [page, setPage] = useState(1)
    const [totalRows, setTotalRows] = useState(0)

    // 结构态
    const [structData, setStructData] = useState<SqliteColumnInfo[]>([])
    // 索引态
    const [indexData, setIndexData] = useState<SqliteIndexInfo[]>([])

    const id = session.id

    const loadTables = useCallback(async () => {
        setBusy(true)
        setError('')
        try {
            const list = await API.sqliteTables(id)
            setTables(list)
        } catch (e) {
            setError(errorMessage(e))
        } finally {
            setBusy(false)
        }
    }, [id])

    const loadInfo = useCallback(async () => {
        try {
            const i = await API.sqliteInfo(id)
            if (i) setInfo({path: i.path, size: Number(i.size) || 0})
        } catch {
            /* ignore */
        }
    }, [id])

    useEffect(() => {
        void loadTables()
        void loadInfo()
    }, [loadTables, loadInfo])

    const switchFile = async () => {
        try {
            const path = await API.sqliteOpenFile()
            if (!path) return
            setBusy(true)
            setError('')
            setPathError('')
            const ok = await API.sqliteConnect(id, path)
            if (!ok) throw new Error('无法打开该 SQLite 文件')
            setSelected(null)
            setRows([])
            setColumns([])
            setStructData([])
            setIndexData([])
            setTotalRows(0)
            setPage(1)
            await Promise.all([loadTables(), loadInfo()])
        } catch (e) {
            setPathError(errorMessage(e))
            setError(errorMessage(e))
        } finally {
            setBusy(false)
        }
    }

    const openTable = useCallback(async (table: string, toPage = 1) => {
        setSelected(table)
        setDataView('data')
        setBusy(true)
        setError('')
        try {
            const [data, cnt] = await Promise.all([
                API.sqliteSelect(id, table, PAGE_SIZE, (toPage - 1) * PAGE_SIZE),
                API.sqliteCount(id, table),
            ])
            setRows(data.rows)
            setColumns(data.columns)
            setTotalRows(cnt)
            setPage(toPage)
        } catch (e) {
            setError(errorMessage(e))
        } finally {
            setBusy(false)
        }
    }, [id])

    const viewStruct = useCallback(async (table: string) => {
        setSelected(table)
        setDataView('struct')
        setBusy(true)
        setError('')
        try {
            setStructData(await API.sqliteDescribe(id, table))
        } catch (e) {
            setError(errorMessage(e))
        } finally {
            setBusy(false)
        }
    }, [id])

    const viewIndex = useCallback(async (table: string) => {
        setSelected(table)
        setDataView('index')
        setBusy(true)
        setError('')
        try {
            setIndexData(await API.sqliteIndexes(id, table))
        } catch (e) {
            setError(errorMessage(e))
        } finally {
            setBusy(false)
        }
    }, [id])

    const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE))
    const goPage = (p: number) => {
        if (!selected || busy) return
        const target = Math.min(Math.max(1, p), totalPages)
        if (target === page) return
        void openTable(selected, target)
    }

    const fmtSize = (n: number) => {
        if (!n) return '0 B'
        const units = ['B', 'KB', 'MB', 'GB']
        let i = 0
        let v = n
        while (v >= 1024 && i < units.length - 1) {
            v /= 1024
            i++
        }
        return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`
    }

    return (
        <div className={sq.sqlitePane}>
            <div className={sq.sqliteSide}>
                <div className={sq.sqliteHead}>
                    <Icon name="database" size={13}/>
                    <span className={sq.sqliteTitle}>SQLite</span>
                    <button className={`${g.btn} ${g.xs}`} onClick={switchFile} disabled={busy} title="选择其他数据库文件">
                        <Icon name="folder" size={12}/> 切换文件
                    </button>
                </div>
                <div className={sq.sqlitePath} title={info.path}>
                    <Icon name="file" size={12}/>
                    <span>{info.path ? info.path.split(/[\\/]/).pop() : '未选择文件'}</span>
                </div>
                <div className={sq.sqliteStatus}>
                    <span className={`${g.dot}${session.connected ? ' ' + g.on : ''}`}/>
                    {session.connected ? `已连接 · ${fmtSize(info.size)}` : '未连接'}
                    {pathError && <span className={sq.pathErr}>{pathError}</span>}
                </div>
                <div className={sq.sqliteTables}>
                    {tables.length === 0 && !busy && (
                        <div className={`${sh.mongoEmpty} ${sh.small}`}>暂无表</div>
                    )}
                    {tables.map((t) => (
                        <div key={t.name} className={sq.sqliteTableRow}>
                            <button
                                className={`${sq.sqliteTableItem}${selected === t.name ? ' ' + sq.active : ''}`}
                                onClick={() => openTable(t.name)}
                            >
                                <Icon name={t.type === 'view' ? 'panel' : 'table'} size={13}/>
                                <span>{t.name}</span>
                                {t.type === 'view' && <span className={sh.mongoBadge} style={{marginLeft: 4}}>视图</span>}
                            </button>
                            <div className={sq.sqliteTableMenu}>
                                <button className={g.iconBtn} title="表结构" onClick={() => viewStruct(t.name)}>
                                    <Icon name="chart" size={12}/>
                                </button>
                                <button className={g.iconBtn} title="索引" onClick={() => viewIndex(t.name)}>
                                    <Icon name="database" size={12}/>
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <div className={sq.sqliteMain}>
                <div className={sq.sqliteToolbar}>
                    <span className={sq.sqliteConnTitle}>
                        {selected ? `${selected} · ${totalRows} 行` : 'SQLite 浏览器'}
                    </span>
                    <span className={g.spacer}/>
                    {error && <span className={sq.sqliteError}>{error}</span>}
                    <button className={g.iconBtn} title="关闭" onClick={onClose}>
                        <Icon name="close" size={15}/>
                    </button>
                </div>

                <div className={sq.sqliteTabs}>
                    {(['data', 'struct', 'index'] as const).map((v) => (
                        <button
                            key={v}
                            className={`${sq.sqliteTab}${dataView === v ? ' ' + sq.active : ''}`}
                            onClick={() => {
                                if (!selected) return
                                if (v === 'data') void openTable(selected, page)
                                else if (v === 'struct') void viewStruct(selected)
                                else void viewIndex(selected)
                            }}
                            disabled={!selected}
                        >
                            {v === 'data' ? '数据预览' : v === 'struct' ? '表结构' : '索引'}
                        </button>
                    ))}
                </div>

                <div className={sq.sqliteContent}>
                    {!selected && (
                        <div className={`${sh.mongoEmpty}`}>请选择左侧的表或视图以查看数据</div>
                    )}

                    {selected && dataView === 'data' && (
                        <div className={sq.sqliteDataWrap}>
                            {columns.length > 0 ? (
                                <div className={sq.sqliteTableScroll}>
                                    <table className={sq.sqliteTable}>
                                        <thead>
                                        <tr>
                                            {columns.map((c) => (
                                                <th key={c}>{c}</th>
                                            ))}
                                        </tr>
                                        </thead>
                                        <tbody>
                                        {rows.map((r, i) => (
                                            <tr key={i}>
                                                {columns.map((c) => {
                                                    const v = r[c]
                                                    const isn = v === null || v === undefined
                                                    return (
                                                        <td key={c} className={isn ? sq.nullCell : ''}>
                                                            {isn ? 'NULL' : String(v)}
                                                        </td>
                                                    )
                                                })}
                                            </tr>
                                        ))}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <div className={`${sh.mongoEmpty} ${sh.small}`}>该表暂无数据</div>
                            )}
                            <div className={sq.pager}>
                                <button className={g.btn} disabled={page <= 1 || busy} onClick={() => goPage(1)}>首页</button>
                                <button className={g.btn} disabled={page <= 1 || busy} onClick={() => goPage(page - 1)}>上一页</button>
                                <span className={sq.pageInfo}>第 {page} / {totalPages} 页</span>
                                <button className={g.btn} disabled={page >= totalPages || busy} onClick={() => goPage(page + 1)}>下一页</button>
                            </div>
                        </div>
                    )}

                    {selected && dataView === 'struct' && (
                        <div className={sq.sqliteDataWrap}>
                            {structData.length > 0 ? (
                                <div className={sq.sqliteTableScroll}>
                                    <table className={sq.sqliteTable}>
                                        <thead>
                                        <tr>
                                            <th>列名</th>
                                            <th>类型</th>
                                            <th>非空</th>
                                            <th>默认值</th>
                                            <th>主键</th>
                                        </tr>
                                        </thead>
                                        <tbody>
                                        {structData.map((c) => (
                                            <tr key={c.cid}>
                                                <td>{c.name}</td>
                                                <td>{c.type || ''}</td>
                                                <td>{c.notnull ? '是' : ''}</td>
                                                <td>{c.default === null || c.default === undefined ? '' : String(c.default)}</td>
                                                <td>{c.pk > 0 ? '是' : ''}</td>
                                            </tr>
                                        ))}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <div className={`${sh.mongoEmpty} ${sh.small}`}>无结构信息</div>
                            )}
                        </div>
                    )}

                    {selected && dataView === 'index' && (
                        <div className={sq.sqliteDataWrap}>
                            {indexData.length > 0 ? (
                                <div className={sq.sqliteTableScroll}>
                                    <table className={sq.sqliteTable}>
                                        <thead>
                                        <tr>
                                            <th>索引名</th>
                                            <th>唯一</th>
                                            <th>来源</th>
                                            <th>部分索引</th>
                                        </tr>
                                        </thead>
                                        <tbody>
                                        {indexData.map((ix) => (
                                            <tr key={ix.name}>
                                                <td>{ix.name}</td>
                                                <td>{ix.unique ? '是' : ''}</td>
                                                <td>{ix.origin || ''}</td>
                                                <td>{ix.partial ? '是' : ''}</td>
                                            </tr>
                                        ))}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <div className={`${sh.mongoEmpty} ${sh.small}`}>该表暂无索引</div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
