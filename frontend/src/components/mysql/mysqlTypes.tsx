import React from 'react'
import {sql, SQLDialect} from '@codemirror/lang-sql'
import {MysqlQueryResult} from '../../types'
import my from './mysqlShared.module.less'
import db from '../dbTable.module.less'

// ---- 共享类型 ----
export type TabKey = 'data' | 'sql' | 'structure' | 'users' | 'status' | 'er'

export interface SqlTab {
    id: string
    title: string
    content: string
    result: MysqlQueryResult | null
    error: string
    history: { sql: string; at: number }[]
}

export interface CellEdit {
    value: string
    isNull: boolean
}

export type RowDrafts = Record<number, Record<string, CellEdit>>
export type NewRow = Record<string, CellEdit>

export interface Schema {
    tables: any[]
    foreignKeys: any[]
}

// ---- 共享常量 / 方言 ----
export const mysqlDialect = SQLDialect.define({
    keywords: 'select from where insert into values update set delete create table drop alter index database use show describe join left right inner outer on group order by limit and or not null as distinct count sum avg max min between like in is primary key unique foreign references',
})

export function sqlExtension() {
    return sql({dialect: mysqlDialect})
}

// ---- 共享展示组件 ----

export function formatCell(v: any) {
    if (v === null || v === undefined) return <span className={my.mysqlNull}>NULL</span>
    if (typeof v === 'object') return JSON.stringify(v)
    return String(v)
}

export function Grid({columns, rows}: { columns: string[]; rows: Record<string, any>[] }) {
    if (!columns.length) {
        return <div className={db.dbEmpty}>无结果</div>
    }
    return (
        <div className={my.mysqlGridWrap}>
            <table className={db.dbTable}>
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
                        {columns.map((c) => (
                            <td key={c}>{formatCell(r[c])}</td>
                        ))}
                    </tr>
                ))}
                </tbody>
            </table>
        </div>
    )
}
