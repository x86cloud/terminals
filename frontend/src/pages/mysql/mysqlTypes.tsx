import React from 'react'
import { sql, SQLDialect } from '@codemirror/lang-sql'
import { MysqlQueryResult } from '@/types'
import my from '@/pages/mysql/mysqlShared.module.less'
import db from '@/pages/mysql/dbTable.module.less'

// ---- 标签页体系 ----
export type MysqlTabType = 'status' | 'sql' | 'data' | 'users' | 'er'

export interface MysqlTabItem {
    key: string
    label: string
    type: MysqlTabType
    dbName: string
    table?: string
    closable: boolean
}

// 兼容旧类型
export type TabKey = MysqlTabType | 'structure'

export interface SqlTab {
    id: string
    title: string
    content: string
    result: MysqlQueryResult | null
    error: string
    durationMs?: number
    explainResult?: any | null
    resultMode?: 'table' | 'explain' | 'json'
}

export interface CellEdit {
    value: string
    isNull: boolean
}

export type RowDrafts = Record<number, Record<string, any>>
export type NewRow = Record<string, any>

export interface Schema {
    tables: any[]
    foreignKeys: any[]
}

// ---- 元数据类型 ----
export interface MysqlColumn {
    name: string
    dataType: string
    isNullable: boolean
    defaultVal: string
    isPrimaryKey: boolean
    extra: string
    comment?: string
}

export interface MysqlIndex {
    name: string
    table: string
    columns: string[]
    isUnique: boolean
    isPrimary: boolean
    type: string
    comment?: string
}

export interface MysqlConstraint {
    name: string
    type: 'PRIMARY KEY' | 'FOREIGN KEY' | 'UNIQUE' | 'CHECK' | string
    column: string
    foreignTable?: string
    foreignColumn?: string
}

export interface MysqlTableMeta {
    name: string
    engine?: string
    rowCount?: number
    dataSize?: string
    indexSize?: string
    comment?: string
    createTime?: string
    updateTime?: string
}

// ---- 共享常量 / 方言 ----
export const mysqlDialect = SQLDialect.define({
    keywords:
        'select from where insert into values update set delete create table drop alter index database use show describe join left right inner outer on group order by limit and or not null as distinct count sum avg max min between like in is primary key unique foreign references explain truncate rename lock unlock commit rollback',
})

export function sqlExtension() {
    return sql({ dialect: mysqlDialect })
}

// ---- 共享展示组件 ----
export function formatCell(v: any) {
    if (v === null || v === undefined) return <span className={my.mysqlNull}>NULL</span>
    if (typeof v === 'object') return JSON.stringify(v)
    return String(v)
}

export function Grid({ columns, rows }: { columns: string[]; rows: Record<string, any>[] }) {
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
