import React from 'react'
import { Tag } from 'antd'
import { API } from '@/api'
import { buildMysqlWhereClause } from '@/components/ColumnFilterPopover'
import {
    DbAdapter,
    DbSqlEditorAdapter,
    DbTableStructure,
    DbQueryParams,
    DbQueryResult,
    DbColumnMeta,
    DbIndexMeta,
    DbConstraintMeta,
    ExplainPlanResult,
} from '../types'

function renderMysqlPlanNode(node: any): any {
    if (!node) return null

    if (node.query_block) {
        const qb = node.query_block
        const costInfo = qb.cost_info?.query_cost ? ` (Cost: ${qb.cost_info.query_cost})` : ''
        const children: any[] = []
        if (qb.table) children.push(renderMysqlPlanNode({ table: qb.table }))
        if (qb.nested_loop) {
            qb.nested_loop.forEach((nl: any) => children.push(renderMysqlPlanNode(nl)))
        }
        if (qb.grouping_operation) {
            children.push(renderMysqlPlanNode(qb.grouping_operation))
        }
        if (qb.ordering_operation) {
            children.push(renderMysqlPlanNode(qb.ordering_operation))
        }

        return {
            key: Math.random().toString(),
            title: React.createElement(
                'div',
                { style: { display: 'inline-flex', alignItems: 'center', gap: 8, padding: '2px 0' } },
                React.createElement(
                    Tag,
                    { color: 'geekblue', style: { fontWeight: 700, marginInlineEnd: 0 } },
                    `Query Block #${qb.select_id || 1}`
                ),
                React.createElement('span', { style: { color: 'var(--text-secondary)', fontSize: 12 } }, costInfo)
            ),
            children: children.filter(Boolean),
        }
    }

    if (node.table) {
        const t = node.table
        return {
            key: Math.random().toString(),
            title: React.createElement(
                'div',
                { style: { display: 'inline-flex', alignItems: 'center', gap: 8, padding: '2px 0' } },
                React.createElement(Tag, { color: 'blue', style: { fontWeight: 600, marginInlineEnd: 0 } }, `Table: ${t.table_name}`),
                React.createElement(
                    Tag,
                    {
                        color: t.access_type === 'ALL' ? 'red' : t.access_type === 'index' ? 'orange' : 'green',
                        style: { marginInlineEnd: 0 },
                    },
                    t.access_type || 'Scan'
                ),
                t.key ? React.createElement(Tag, { color: 'purple', style: { marginInlineEnd: 0 } }, `Key: ${t.key}`) : null,
                React.createElement(
                    'span',
                    { style: { color: 'var(--text-secondary)', fontSize: 12 } },
                    `扫描行数: ${t.rows_examined_per_scan ?? t.rows ?? '-'} ${t.filtered ? ` | 过滤率: ${t.filtered}%` : ''}`
                )
            ),
        }
    }

    return {
        key: Math.random().toString(),
        title: React.createElement('span', null, JSON.stringify(node)),
    }
}

export function createMysqlAdapter(
    serverId: string,
    dbName: string,
    tableName: string
): DbAdapter {
    const quoteIdent = (name: string) => `\`${name.replace(/`/g, '``')}\``

    return {
        dialect: 'mysql',
        serverId,
        dbName,
        tableName,
        quoteIdent,
        buildWhereClause: buildMysqlWhereClause,

        async loadStructure(): Promise<DbTableStructure> {
            const [descRes, idxList] = await Promise.all([
                API.mysqlDescribe(serverId, dbName, tableName),
                API.mysqlIndexes(serverId, dbName, tableName).catch(() => []),
            ])

            // 加载约束/外键
            let constraintRows: any[] = []
            try {
                const sql = `SELECT CONSTRAINT_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
                             FROM information_schema.KEY_COLUMN_USAGE
                             WHERE TABLE_SCHEMA = '${dbName}' AND TABLE_NAME = '${tableName}'`
                const res = await API.mysqlRun(serverId, dbName, sql)
                if (res && res.rows) {
                    constraintRows = res.rows
                }
            } catch (e) {
                console.warn('获取 MySQL 约束信息失败:', e)
            }

            const fkColMap = new Set<string>()
            const constraints: DbConstraintMeta[] = constraintRows.map((r: any) => {
                const col = String(r.COLUMN_NAME || '')
                const refTable = r.REFERENCED_TABLE_NAME ? String(r.REFERENCED_TABLE_NAME) : undefined
                const refCol = r.REFERENCED_COLUMN_NAME ? String(r.REFERENCED_COLUMN_NAME) : undefined
                if (refTable) {
                    fkColMap.add(col)
                }
                return {
                    name: String(r.CONSTRAINT_NAME || ''),
                    type: refTable
                        ? 'FOREIGN KEY'
                        : r.CONSTRAINT_NAME === 'PRIMARY'
                        ? 'PRIMARY KEY'
                        : 'UNIQUE / KEY',
                    column: col,
                    foreignTable: refTable,
                    foreignColumn: refCol,
                }
            })

            const columns: DbColumnMeta[] = []
            const primaryKeys: Record<string, boolean> = {}

            if (descRes && descRes.rows) {
                descRes.rows.forEach((r: any) => {
                    const field = String(r.Field || r.COLUMN_NAME || '')
                    const typ = String(r.Type || r.COLUMN_TYPE || '')
                    const isNull = (r.Null || r.IS_NULLABLE) === 'YES'
                    const defVal = r.Default !== undefined && r.Default !== null ? String(r.Default) : ''
                    const isPri = (r.Key || '') === 'PRI' || (r.COLUMN_KEY || '') === 'PRI'
                    const extra = String(r.Extra || '')
                    const comment = String(r.Comment || r.COLUMN_COMMENT || '')

                    if (isPri) primaryKeys[field] = true
                    columns.push({
                        name: field,
                        dataType: typ,
                        isNullable: isNull,
                        defaultVal: defVal,
                        isPrimaryKey: isPri,
                        isForeignKey: fkColMap.has(field),
                        extra,
                        comment,
                    })
                })
            }

            // 处理索引
            const indexes: DbIndexMeta[] = []
            if (Array.isArray(idxList)) {
                const map: Record<string, DbIndexMeta> = {}
                idxList.forEach((r: any) => {
                    const keyName = String(r.Key_name || r.INDEX_NAME || '')
                    const colName = String(r.Column_name || r.COLUMN_NAME || '')
                    const nonUnique = Number(r.Non_unique ?? 1) === 1
                    const idxType = String(r.Index_type || 'BTREE')
                    if (!map[keyName]) {
                        map[keyName] = {
                            name: keyName,
                            table: tableName,
                            columns: [],
                            isUnique: !nonUnique,
                            isPrimary: keyName === 'PRIMARY',
                            type: idxType,
                        }
                    }
                    map[keyName].columns?.push(colName)
                })
                indexes.push(...Object.values(map))
            }

            return {
                columns,
                indexes,
                constraints,
                primaryKeys,
            }
        },

        async loadData(params: DbQueryParams): Promise<DbQueryResult> {
            const { page, pageSize, where, sortCol, sortOrder } = params
            const offset = (page - 1) * pageSize

            if (where.trim() || sortCol) {
                let sql = `SELECT * FROM ${quoteIdent(tableName)}`
                if (where.trim()) {
                    const cleanWhere = where.trim().replace(/^WHERE\s+/i, '')
                    sql += ` WHERE ${cleanWhere}`
                }
                if (sortCol) {
                    sql += ` ORDER BY ${quoteIdent(sortCol)} ${sortOrder}`
                }
                sql += ` LIMIT ${pageSize} OFFSET ${offset}`
                const res = await API.mysqlRun(serverId, dbName, sql)
                return {
                    columns: res.columns || [],
                    rows: res.rows || [],
                    affected: res.affected,
                    rowCount: res.rowCount,
                }
            }

            const res = await API.mysqlSelect(serverId, dbName, tableName, pageSize, offset)
            return {
                columns: res.columns || [],
                rows: res.rows || [],
                affected: res.affected,
                rowCount: res.rowCount,
            }
        },

        async countData(where: string): Promise<number> {
            if (where.trim()) {
                const cleanWhere = where.trim().replace(/^WHERE\s+/i, '')
                const cntRes = await API.mysqlRun(
                    serverId,
                    dbName,
                    `SELECT COUNT(*) AS total FROM ${quoteIdent(tableName)} WHERE ${cleanWhere}`
                )
                return Number(cntRes?.rows?.[0]?.total ?? cntRes?.rows?.[0]?.TOTAL ?? 0)
            }
            return API.mysqlCount(serverId, dbName, tableName)
        },

        async updateRows(
            drafts: Record<number, Record<string, any>>,
            origRows: any[],
            pkList: string[]
        ): Promise<void> {
            for (const [rowIdxStr, patch] of Object.entries(drafts)) {
                const rowIdx = Number(rowIdxStr)
                const origRow = origRows[rowIdx]
                const whereCols = pkList
                const whereVals = pkList.map((pk) => origRow[pk])

                const setCols = Object.keys(patch)
                const setVals = Object.values(patch)

                await API.mysqlUpdate(
                    serverId,
                    dbName,
                    tableName,
                    setCols,
                    setVals,
                    whereCols,
                    whereVals
                )
            }
        },

        async insertRows(newRows: Record<string, any>[]): Promise<void> {
            for (const newRow of newRows) {
                const cols = Object.keys(newRow).filter((k) => newRow[k] !== undefined)
                const vals = cols.map((k) => newRow[k])
                if (cols.length > 0) {
                    await API.mysqlInsert(serverId, dbName, tableName, cols, vals)
                }
            }
        },

        async deleteRow(row: any, pkList: string[]): Promise<void> {
            const whereCols = pkList
            const whereVals = pkList.map((pk) => row[pk])
            await API.mysqlDelete(serverId, dbName, tableName, whereCols, whereVals)
        },

        async loadDDL(): Promise<string> {
            const res = await API.mysqlRun(serverId, dbName, `SHOW CREATE TABLE ${quoteIdent(tableName)}`)
            if (res && res.rows && res.rows[0]) {
                const createSql =
                    res.rows[0]['Create Table'] ||
                    res.rows[0]['Create View'] ||
                    JSON.stringify(res.rows[0])
                return createSql + ';'
            }
            return '-- 未能获取到 DDL'
        },

        async exportToFile(mode: 'csv' | 'json', limit = 0): Promise<string> {
            return API.mysqlExportToFileEx(serverId, dbName, mode, 'table', tableName, '', limit)
        },
    }
}

export function createMysqlSqlAdapter(serverId: string, dbName: string): DbSqlEditorAdapter {
    return {
        dialect: 'mysql',
        serverId,
        dbName,
        defaultSql: `SELECT table_name, table_rows, data_length, create_time FROM information_schema.tables WHERE table_schema = '${dbName}' LIMIT 20;`,
        placeholder: '-- 输入 MySQL SQL 语句，按 Ctrl+Enter 快速执行',

        async runSql(sql: string): Promise<DbQueryResult> {
            const t0 = performance.now()
            const res = await API.mysqlRun(serverId, dbName, sql)
            const durationMs = Math.round(performance.now() - t0)
            return {
                columns: res.columns || [],
                rows: res.rows || [],
                affected: res.affected,
                rowCount: res.rowCount,
                durationMs,
                error: '',
            }
        },

        async explainSql(sql: string): Promise<ExplainPlanResult> {
            // 尝试 EXPLAIN FORMAT=JSON
            let jsonParsed: any = null
            try {
                const jsonRes = await API.mysqlRun(serverId, dbName, `EXPLAIN FORMAT=JSON ${sql}`)
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
                const tabRes = await API.mysqlRun(serverId, dbName, `EXPLAIN ${sql}`)
                return {
                    raw: tabRes,
                    tableResult: {
                        columns: tabRes.columns || [],
                        rows: tabRes.rows || [],
                    },
                }
            }

            if (jsonParsed && jsonParsed.query_block) {
                return {
                    raw: jsonParsed,
                    treeData: [renderMysqlPlanNode(jsonParsed)],
                }
            }

            return {
                raw: jsonParsed,
            }
        },
    }
}
