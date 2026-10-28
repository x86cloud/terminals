import { API } from '@/api'
import i18n from '@/i18n'
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
    AlterTablePlan,
    CreateIndexParams,
    CreateConstraintParams,
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

async function getExistingIndexSqls(sessionId: string, tableName: string): Promise<string[]> {
    try {
        const res = await API.sqliteRun(
            sessionId,
            `SELECT sql FROM sqlite_master WHERE type = 'index' AND tbl_name = '${tableName.replace(/'/g, "''")}' AND sql IS NOT NULL;`
        )
        if (res && res.rows) {
            return res.rows
                .map((r: any) => {
                    const s = r.sql ? String(r.sql).trim() : ''
                    return s.endsWith(';') ? s : s ? s + ';' : ''
                })
                .filter((s: string) => Boolean(s))
        }
    } catch (e) {
        console.warn('获取 SQLite 既有索引失败:', e)
    }
    return []
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
                    origName: c.name,
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
            return i18n.t('db:adapters.cannotGetDdl')
        },

        async generateAlterTableSql(currentCols: DbColumnMeta[], origCols: DbColumnMeta[]): Promise<AlterTablePlan> {
            const origMap = new Map<string, DbColumnMeta>()
            origCols.forEach((c) => origMap.set(c.name, c))

            const currentOrigNames = new Set<string>()
            currentCols.forEach((c) => {
                if (c.origName) currentOrigNames.add(c.origName)
            })

            const droppedCols = origCols.filter((c) => !currentOrigNames.has(c.name))

            // 判断是否需要重建表：如果存在既有列修改了数据类型、可空性或默认值，SQLite 必须重建表
            let requiresRebuild = false
            for (const col of currentCols) {
                if (col.origName && origMap.has(col.origName)) {
                    const orig = origMap.get(col.origName)!
                    if (
                        (col.dataType || '').toUpperCase() !== (orig.dataType || '').toUpperCase() ||
                        col.isNullable !== orig.isNullable ||
                        (col.defaultVal || '') !== (orig.defaultVal || '') ||
                        Boolean(col.isPrimaryKey) !== Boolean(orig.isPrimaryKey)
                    ) {
                        requiresRebuild = true
                        break
                    }
                }
            }

            const sqls: string[] = []
            let warning: string | undefined

            if (droppedCols.length > 0) {
                warning = i18n.t('db:adapters.warnDropCol', { cols: droppedCols.map((c) => c.name).join(', ') })
            }

            if (requiresRebuild) {
                const rebuildWarning = i18n.t('db:adapters.sqliteRebuildWarning')
                warning = warning ? `${warning}\n${rebuildWarning}` : rebuildWarning

                const tempTableName = `${tableName}_dg_tmp`

                sqls.push(`PRAGMA foreign_keys = OFF;`)
                sqls.push(`BEGIN TRANSACTION;`)

                // 构建 CREATE TABLE temp
                const colDefs: string[] = []
                const pkCols: string[] = []
                for (const col of currentCols) {
                    let cDef = `${quoteIdent(col.name)} ${col.dataType || 'TEXT'}`
                    if (!col.isNullable) {
                        cDef += ' NOT NULL'
                    }
                    if (col.defaultVal !== undefined && col.defaultVal.trim() !== '') {
                        const dv = col.defaultVal.trim()
                        if (
                            dv.toUpperCase() === 'NULL' ||
                            dv.toUpperCase().includes('()') ||
                            /^-?\d+(\.\d+)?$/.test(dv) ||
                            dv.toUpperCase().startsWith('CURRENT_')
                        ) {
                            cDef += ` DEFAULT ${dv}`
                        } else {
                            cDef += ` DEFAULT '${dv.replace(/'/g, "''")}'`
                        }
                    }
                    if (col.isPrimaryKey) {
                        pkCols.push(quoteIdent(col.name))
                    }
                    colDefs.push(cDef)
                }

                if (pkCols.length > 0) {
                    colDefs.push(`PRIMARY KEY (${pkCols.join(', ')})`)
                }

                sqls.push(`DROP TABLE IF EXISTS ${quoteIdent(tempTableName)};`)
                sqls.push(`CREATE TABLE ${quoteIdent(tempTableName)} (\n  ${colDefs.join(',\n  ')}\n);`)

                // 复制数据 (仅从原表存在的旧列中读取)
                const matchedCols = currentCols.filter((c) => c.origName && origMap.has(c.origName))
                if (matchedCols.length > 0) {
                    const targetNames = matchedCols.map((c) => quoteIdent(c.name)).join(', ')
                    const sourceNames = matchedCols.map((c) => quoteIdent(c.origName!)).join(', ')
                    sqls.push(`INSERT INTO ${quoteIdent(tempTableName)} (${targetNames}) SELECT ${sourceNames} FROM ${quoteIdent(tableName)};`)
                }

                // 删除旧表
                sqls.push(`DROP TABLE ${quoteIdent(tableName)};`)

                // 重命名临时表为原表名
                sqls.push(`ALTER TABLE ${quoteIdent(tempTableName)} RENAME TO ${quoteIdent(tableName)};`)

                // 重新创建未受影响的既有二级索引
                const existingIndexes = await getExistingIndexSqls(sessionId, tableName)
                for (const idxSql of existingIndexes) {
                    const hasDroppedCol = droppedCols.some((dc) => idxSql.toLowerCase().includes(dc.name.toLowerCase()))
                    if (!hasDroppedCol) {
                        sqls.push(idxSql)
                    }
                }

                sqls.push(`COMMIT;`)
                sqls.push(`PRAGMA foreign_keys = ON;`)

                return {
                    sqls,
                    isRebuild: true,
                    warning,
                }
            }

            // 无需重建时（仅列重命名、新增列、删除列），使用原生轻量 ALTER TABLE
            // 1. 删除列 (SQLite 3.35.0+)
            for (const col of droppedCols) {
                sqls.push(`ALTER TABLE ${quoteIdent(tableName)} DROP COLUMN ${quoteIdent(col.name)};`)
            }

            // 2. 列重命名 (SQLite 3.25.0+)
            for (const col of currentCols) {
                if (col.origName && origMap.has(col.origName) && col.name !== col.origName) {
                    sqls.push(`ALTER TABLE ${quoteIdent(tableName)} RENAME COLUMN ${quoteIdent(col.origName)} TO ${quoteIdent(col.name)};`)
                }
            }

            // 3. 新增列
            for (const col of currentCols) {
                if (col.isNew || !col.origName || !origMap.has(col.origName)) {
                    let cDef = `${quoteIdent(col.name)} ${col.dataType || 'TEXT'}`
                    if (!col.isNullable) {
                        cDef += ' NOT NULL'
                    }
                    if (col.defaultVal !== undefined && col.defaultVal.trim() !== '') {
                        const dv = col.defaultVal.trim()
                        if (
                            dv.toUpperCase() === 'NULL' ||
                            dv.toUpperCase().includes('()') ||
                            /^-?\d+(\.\d+)?$/.test(dv) ||
                            dv.toUpperCase().startsWith('CURRENT_')
                        ) {
                            cDef += ` DEFAULT ${dv}`
                        } else {
                            cDef += ` DEFAULT '${dv.replace(/'/g, "''")}'`
                        }
                    }
                    sqls.push(`ALTER TABLE ${quoteIdent(tableName)} ADD COLUMN ${cDef};`)
                }
            }

            return {
                sqls,
                isRebuild: false,
                warning,
            }
        },

        async executeAlterTable(sqls: string[]): Promise<void> {
            for (const sql of sqls) {
                const trimmed = sql.trim()
                if (!trimmed) continue
                await API.sqliteRun(sessionId, trimmed)
            }
        },

        previewCreateIndexSql(params: CreateIndexParams): string {
            const typeSql = params.isUnique ? 'UNIQUE ' : ''
            const colsSql = (params.columns || []).map((c) => quoteIdent(c)).join(', ')
            return `CREATE ${typeSql}INDEX ${quoteIdent(params.name)} ON ${quoteIdent(tableName)} (${colsSql});`
        },

        async createIndex(params: CreateIndexParams): Promise<void> {
            const sql = this.previewCreateIndexSql!(params)
            await API.sqliteRun(sessionId, sql)
        },

        previewDropIndexSql(indexName: string): string {
            return `DROP INDEX ${quoteIdent(indexName)};`
        },

        async dropIndex(indexName: string): Promise<void> {
            const sql = this.previewDropIndexSql!(indexName)
            await API.sqliteRun(sessionId, sql)
        },

        async previewCreateConstraintSql(params: CreateConstraintParams): Promise<AlterTablePlan> {
            const struct = await this.loadStructure()
            const tempTable = `${tableName}_dg_tmp`
            const colDefs: string[] = []
            const pkCols: string[] = []
            for (const col of struct.columns) {
                let cDef = `${quoteIdent(col.name)} ${col.dataType || 'TEXT'}`
                if (!col.isNullable) cDef += ' NOT NULL'
                if (col.defaultVal) {
                    const dv = col.defaultVal.trim()
                    if (
                        dv.toUpperCase() === 'NULL' ||
                        dv.toUpperCase().includes('()') ||
                        /^-?\d+(\.\d+)?$/.test(dv) ||
                        dv.toUpperCase().startsWith('CURRENT_')
                    ) {
                        cDef += ` DEFAULT ${dv}`
                    } else {
                        cDef += ` DEFAULT '${dv.replace(/'/g, "''")}'`
                    }
                }
                if (col.isPrimaryKey) pkCols.push(quoteIdent(col.name))
                colDefs.push(cDef)
            }
            if (pkCols.length > 0) {
                colDefs.push(`PRIMARY KEY (${pkCols.join(', ')})`)
            }

            // 既有外键
            for (const c of struct.constraints) {
                if (c.type === 'FOREIGN KEY' && c.foreignTable && c.column && c.foreignColumn) {
                    colDefs.push(
                        `CONSTRAINT ${quoteIdent(c.name)} FOREIGN KEY (${quoteIdent(c.column)}) REFERENCES ${quoteIdent(
                            c.foreignTable
                        )} (${quoteIdent(c.foreignColumn)})`
                    )
                }
            }

            // 新增约束
            if (params.type === 'FOREIGN KEY' && params.foreignTable && params.column && params.foreignColumn) {
                let fkSql = `CONSTRAINT ${quoteIdent(params.name)} FOREIGN KEY (${quoteIdent(
                    params.column
                )}) REFERENCES ${quoteIdent(params.foreignTable)} (${quoteIdent(params.foreignColumn)})`
                if (params.onDelete && params.onDelete !== 'RESTRICT') fkSql += ` ON DELETE ${params.onDelete}`
                if (params.onUpdate && params.onUpdate !== 'RESTRICT') fkSql += ` ON UPDATE ${params.onUpdate}`
                colDefs.push(fkSql)
            } else if (params.type === 'CHECK' && params.checkExpr) {
                colDefs.push(`CONSTRAINT ${quoteIdent(params.name)} CHECK (${params.checkExpr})`)
            }

            const colNames = struct.columns.map((c) => quoteIdent(c.name)).join(', ')
            const indexSqls = await getExistingIndexSqls(sessionId, tableName)

            const sqls: string[] = [
                `PRAGMA foreign_keys = OFF;`,
                `BEGIN TRANSACTION;`,
                `DROP TABLE IF EXISTS ${quoteIdent(tempTable)};`,
                `CREATE TABLE ${quoteIdent(tempTable)} (\n  ${colDefs.join(',\n  ')}\n);`,
                `INSERT INTO ${quoteIdent(tempTable)} (${colNames}) SELECT ${colNames} FROM ${quoteIdent(tableName)};`,
                `DROP TABLE ${quoteIdent(tableName)};`,
                `ALTER TABLE ${quoteIdent(tempTable)} RENAME TO ${quoteIdent(tableName)};`,
                ...indexSqls,
                `COMMIT;`,
                `PRAGMA foreign_keys = ON;`,
            ]

            return {
                sqls,
                isRebuild: true,
                warning: i18n.t('db:adapters.sqliteAddConstraintWarning'),
            }
        },

        async createConstraint(params: CreateConstraintParams): Promise<void> {
            const plan = (await this.previewCreateConstraintSql!(params)) as AlterTablePlan
            await this.executeAlterTable!(plan.sqls)
        },

        async previewDropConstraintSql(constraint: DbConstraintMeta): Promise<AlterTablePlan> {
            const struct = await this.loadStructure()
            const tempTable = `${tableName}_dg_tmp`
            const colDefs: string[] = []
            const pkCols: string[] = []
            for (const col of struct.columns) {
                let cDef = `${quoteIdent(col.name)} ${col.dataType || 'TEXT'}`
                if (!col.isNullable) cDef += ' NOT NULL'
                if (col.defaultVal) {
                    const dv = col.defaultVal.trim()
                    if (
                        dv.toUpperCase() === 'NULL' ||
                        dv.toUpperCase().includes('()') ||
                        /^-?\d+(\.\d+)?$/.test(dv) ||
                        dv.toUpperCase().startsWith('CURRENT_')
                    ) {
                        cDef += ` DEFAULT ${dv}`
                    } else {
                        cDef += ` DEFAULT '${dv.replace(/'/g, "''")}'`
                    }
                }
                if (col.isPrimaryKey) pkCols.push(quoteIdent(col.name))
                colDefs.push(cDef)
            }
            if (pkCols.length > 0) {
                colDefs.push(`PRIMARY KEY (${pkCols.join(', ')})`)
            }

            // 保留未被删除的约束
            for (const c of struct.constraints) {
                if (c.name === constraint.name) continue
                if (c.type === 'FOREIGN KEY' && c.foreignTable && c.column && c.foreignColumn) {
                    colDefs.push(
                        `CONSTRAINT ${quoteIdent(c.name)} FOREIGN KEY (${quoteIdent(c.column)}) REFERENCES ${quoteIdent(
                            c.foreignTable
                        )} (${quoteIdent(c.foreignColumn)})`
                    )
                }
            }

            const colNames = struct.columns.map((c) => quoteIdent(c.name)).join(', ')
            const indexSqls = await getExistingIndexSqls(sessionId, tableName)

            const sqls: string[] = [
                `PRAGMA foreign_keys = OFF;`,
                `BEGIN TRANSACTION;`,
                `DROP TABLE IF EXISTS ${quoteIdent(tempTable)};`,
                `CREATE TABLE ${quoteIdent(tempTable)} (\n  ${colDefs.join(',\n  ')}\n);`,
                `INSERT INTO ${quoteIdent(tempTable)} (${colNames}) SELECT ${colNames} FROM ${quoteIdent(tableName)};`,
                `DROP TABLE ${quoteIdent(tableName)};`,
                `ALTER TABLE ${quoteIdent(tempTable)} RENAME TO ${quoteIdent(tableName)};`,
                ...indexSqls,
                `COMMIT;`,
                `PRAGMA foreign_keys = ON;`,
            ]

            return {
                sqls,
                isRebuild: true,
                warning: i18n.t('db:adapters.sqliteDropConstraintWarning'),
            }
        },

        async dropConstraint(constraint: DbConstraintMeta): Promise<void> {
            const plan = (await this.previewDropConstraintSql!(constraint)) as AlterTablePlan
            await this.executeAlterTable!(plan.sqls)
        },

        async listTables(): Promise<string[]> {
            const tables = await API.sqliteTables(sessionId)
            return (tables || []).map((t: any) => (typeof t === 'string' ? t : t.name || ''))
        },

        async listTableColumns(targetTable: string): Promise<string[]> {
            const cols = await API.sqliteDescribe(sessionId, targetTable)
            return (cols || []).map((c: any) => String(c.name || ''))
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
        placeholder: i18n.t('db:sql.defaultInputPlaceholder', { dialect: 'SQLite' }),

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
