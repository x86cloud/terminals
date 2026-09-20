import { API } from '@/api'
import { ColumnFilterState } from '@/components/ColumnFilterPopover'
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

function isNumeric(val: string): boolean {
    return val.trim() !== '' && !isNaN(Number(val))
}

function sqlVal(v: any): string {
    if (v === null || v === undefined) return 'NULL'
    if (typeof v === 'number') return isNaN(v) || !isFinite(v) ? 'NULL' : String(v)
    if (typeof v === 'boolean') return v ? '1' : '0'
    const str = String(v)
    return `'${str.replace(/'/g, "''")}'`
}

export function buildSqliteWhereClause(filters: Record<string, ColumnFilterState>): string {
    const parts: string[] = []
    for (const [col, f] of Object.entries(filters)) {
        if (!f) continue
        const escapedCol = `"${col.replace(/"/g, '""')}"`
        const val = f.value.replace(/'/g, "''")
        switch (f.op) {
            case 'contains':
                parts.push(`CAST(${escapedCol} AS TEXT) LIKE '%${val}%'`)
                break
            case 'not_contains':
                parts.push(`CAST(${escapedCol} AS TEXT) NOT LIKE '%${val}%'`)
                break
            case 'starts_with':
                parts.push(`CAST(${escapedCol} AS TEXT) LIKE '${val}%'`)
                break
            case 'ends_with':
                parts.push(`CAST(${escapedCol} AS TEXT) LIKE '%${val}'`)
                break
            case 'equals':
                parts.push(`${escapedCol} = '${val}'`)
                break
            case 'not_equals':
                parts.push(`${escapedCol} != '${val}'`)
                break
            case 'gt':
                parts.push(`${escapedCol} > ${isNumeric(f.value) ? f.value : `'${val}'`}`)
                break
            case 'gte':
                parts.push(`${escapedCol} >= ${isNumeric(f.value) ? f.value : `'${val}'`}`)
                break
            case 'lt':
                parts.push(`${escapedCol} < ${isNumeric(f.value) ? f.value : `'${val}'`}`)
                break
            case 'lte':
                parts.push(`${escapedCol} <= ${isNumeric(f.value) ? f.value : `'${val}'`}`)
                break
            case 'is_null':
                parts.push(`${escapedCol} IS NULL`)
                break
            case 'is_not_null':
                parts.push(`${escapedCol} IS NOT NULL`)
                break
        }
    }
    return parts.join(' AND ')
}

export function createSqliteAdapter(
    sessionId: string,
    tableName: string,
    dbTitle = 'sqlite'
): DbAdapter {
    const quoteIdent = (name: string) => `"${name.replace(/"/g, '""')}"`

    return {
        dialect: 'sqlite',
        serverId: sessionId,
        dbName: dbTitle,
        tableName,
        quoteIdent,
        buildWhereClause: buildSqliteWhereClause,

        async loadStructure(): Promise<DbTableStructure> {
            const [colsData, idxData] = await Promise.all([
                API.sqliteDescribe(sessionId, tableName),
                API.sqliteIndexes(sessionId, tableName).catch(() => []),
            ])

            // 外键与约束：PRAGMA foreign_key_list("tableName")
            let fkRows: any[] = []
            try {
                const fkRes = await API.sqliteRun(
                    sessionId,
                    `PRAGMA foreign_key_list("${tableName.replace(/"/g, '""')}")`
                )
                if (fkRes && fkRes.rows) {
                    fkRows = fkRes.rows
                }
            } catch (e) {
                console.warn('获取 SQLite 外键失败:', e)
            }

            const fkColSet = new Set<string>()
            const constraints: DbConstraintMeta[] = fkRows.map((r: any) => {
                const fromCol = String(r.from || '')
                const toTable = String(r.table || '')
                const toCol = String(r.to || '')
                fkColSet.add(fromCol)
                return {
                    name: `fk_${tableName}_${fromCol}`,
                    type: 'FOREIGN KEY',
                    column: fromCol,
                    foreignTable: toTable,
                    foreignColumn: toCol,
                }
            })

            const columns: DbColumnMeta[] = (colsData || []).map((c: any) => {
                const isPk = Number(c.pk) > 0
                return {
                    name: c.name,
                    dataType: c.type || 'TEXT',
                    isNullable: Number(c.notnull) === 0,
                    defaultVal: c.default === null || c.default === undefined ? '' : String(c.default),
                    isPrimaryKey: isPk,
                    isForeignKey: fkColSet.has(c.name),
                }
            })

            const primaryKeys: Record<string, boolean> = {}
            columns.forEach((c) => {
                if (c.isPrimaryKey) primaryKeys[c.name] = true
            })

            const indexes: DbIndexMeta[] = (idxData || []).map((ix: any) => ({
                name: ix.name,
                table: tableName,
                isUnique: Number(ix.unique) === 1,
                isPrimary: ix.origin === 'pk',
                type: ix.partial ? 'PARTIAL' : 'INDEX',
                def: ix.origin ? `Origin: ${ix.origin}` : undefined,
            }))

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
                let sql = `SELECT * FROM "${tableName.replace(/"/g, '""')}"`
                if (where.trim()) {
                    const cleanWhere = where.trim().replace(/^WHERE\s+/i, '')
                    sql += ` WHERE ${cleanWhere}`
                }
                if (sortCol) {
                    sql += ` ORDER BY "${sortCol.replace(/"/g, '""')}" ${sortOrder}`
                }
                sql += ` LIMIT ${pageSize} OFFSET ${offset}`
                const res = await API.sqliteRun(sessionId, sql)
                return {
                    columns: res.columns || [],
                    rows: res.rows || [],
                    rowCount: res.rowCount,
                    affected: res.affected,
                }
            }

            const res = await API.sqliteSelect(sessionId, tableName, pageSize, offset)
            return {
                columns: res.columns || [],
                rows: res.rows || [],
                rowCount: res.rowCount,
                affected: res.affected,
            }
        },

        async countData(where: string): Promise<number> {
            if (where.trim()) {
                const cleanWhere = where.trim().replace(/^WHERE\s+/i, '')
                const cntRes = await API.sqliteRun(
                    sessionId,
                    `SELECT COUNT(*) AS total FROM "${tableName.replace(/"/g, '""')}" WHERE ${cleanWhere}`
                )
                return Number(cntRes?.rows?.[0]?.total ?? cntRes?.rows?.[0]?.TOTAL ?? 0)
            }
            return API.sqliteCount(sessionId, tableName)
        },

        async updateRows(
            drafts: Record<number, Record<string, any>>,
            origRows: any[],
            pkList: string[]
        ): Promise<void> {
            for (const [rowIdxStr, patch] of Object.entries(drafts)) {
                const rowIdx = Number(rowIdxStr)
                const origRow = origRows[rowIdx]
                const setParts: string[] = []
                for (const [col, val] of Object.entries(patch)) {
                    setParts.push(`"${col.replace(/"/g, '""')}" = ${sqlVal(val)}`)
                }

                const whereParts: string[] = pkList.map((pk) => {
                    const val = origRow[pk]
                    if (val === null || val === undefined) {
                        return `"${pk.replace(/"/g, '""')}" IS NULL`
                    }
                    return `"${pk.replace(/"/g, '""')}" = ${sqlVal(val)}`
                })

                if (setParts.length > 0 && whereParts.length > 0) {
                    const sql = `UPDATE "${tableName.replace(/"/g, '""')}" SET ${setParts.join(
                        ', '
                    )} WHERE ${whereParts.join(' AND ')}`
                    await API.sqliteRun(sessionId, sql)
                }
            }
        },

        async insertRows(newRows: Record<string, any>[]): Promise<void> {
            for (const nr of newRows) {
                const validCols: string[] = []
                const validVals: string[] = []
                for (const [col, val] of Object.entries(nr)) {
                    if (val !== undefined) {
                        validCols.push(`"${col.replace(/"/g, '""')}"`)
                        validVals.push(sqlVal(val))
                    }
                }
                if (validCols.length > 0) {
                    const sql = `INSERT INTO "${tableName.replace(/"/g, '""')}" (${validCols.join(
                        ', '
                    )}) VALUES (${validVals.join(', ')})`
                    await API.sqliteRun(sessionId, sql)
                }
            }
        },

        async deleteRow(row: any, pkList: string[]): Promise<void> {
            const whereParts: string[] = pkList.map((pk) => {
                const val = row[pk]
                if (val === null || val === undefined) {
                    return `"${pk.replace(/"/g, '""')}" IS NULL`
                }
                return `"${pk.replace(/"/g, '""')}" = ${sqlVal(val)}`
            })
            const sql = `DELETE FROM "${tableName.replace(/"/g, '""')}" WHERE ${whereParts.join(
                ' AND '
            )}`
            await API.sqliteRun(sessionId, sql)
        },

        async loadDDL(): Promise<string> {
            const res = await API.sqliteRun(
                sessionId,
                `SELECT sql FROM sqlite_master WHERE type IN ('table', 'view') AND name = '${tableName.replace(
                    /'/g,
                    "''"
                )}'`
            )
            if (res && res.rows && res.rows[0] && res.rows[0].sql) {
                return res.rows[0].sql + ';'
            }
            return '-- 未能获取到 DDL'
        },
    }
}

export function createSqliteSqlAdapter(
    sessionId: string,
    dbTitle = 'sqlite'
): DbSqlEditorAdapter {
    return {
        dialect: 'sqlite',
        serverId: sessionId,
        dbName: dbTitle,
        defaultSql: `SELECT name, type, sql FROM sqlite_master WHERE type IN ('table', 'view');`,
        placeholder: '-- 输入 SQLite SQL 语句，按 Ctrl+Enter 快速执行',

        async runSql(sql: string): Promise<DbQueryResult> {
            const t0 = performance.now()
            const res = await API.sqliteRun(sessionId, sql)
            const durationMs = Math.round(performance.now() - t0)
            return {
                columns: res.columns || [],
                rows: res.rows || [],
                affected: res.affected,
                rowCount: res.rowCount,
                durationMs,
            }
        },

        async explainSql(sql: string): Promise<ExplainPlanResult> {
            const res = await API.sqliteRun(sessionId, `EXPLAIN QUERY PLAN ${sql}`)
            return {
                raw: res,
                tableResult: {
                    columns: res.columns || [],
                    rows: res.rows || [],
                },
            }
        },
    }
}
