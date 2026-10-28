import React from 'react'
import { Tag } from 'antd'
import { API } from '@/api'
import i18n from '@/i18n'
import { buildPgWhereClause } from '@/components/ColumnFilterPopover'
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

function renderPgPlanNode(plan: any): any {
    if (!plan) return null
    const costText = i18n.t('db:adapters.pgCost', { start: plan['Startup Cost'], total: plan['Total Cost'], rows: plan['Plan Rows'] })
    const actualText = plan['Actual Total Time'] !== undefined
        ? i18n.t('db:adapters.pgActual', { time: plan['Actual Total Time'], rows: plan['Actual Rows'] })
        : ''
    const title = React.createElement(
        'div',
        { style: { display: 'inline-flex', alignItems: 'center', gap: 8, padding: '2px 0' } },
        React.createElement(
            Tag,
            { color: 'geekblue', style: { fontWeight: 700, marginInlineEnd: 0 } },
            plan['Node Type'] || 'Node'
        ),
        plan['Relation Name']
            ? React.createElement(
                  Tag,
                  { color: 'blue', style: { marginInlineEnd: 0 } },
                  plan['Schema'] ? `${plan['Schema']}.${plan['Relation Name']}` : plan['Relation Name']
              )
            : null,
        plan['Index Name']
            ? React.createElement(Tag, { color: 'purple', style: { marginInlineEnd: 0 } }, plan['Index Name'])
            : null,
        React.createElement(
            'span',
            { style: { color: 'var(--text-secondary)', fontSize: 12 } },
            `${costText}${actualText}`
        )
    )

    return {
        key: Math.random().toString(),
        title,
        children: (plan.Plans || []).map((child: any) => renderPgPlanNode(child)),
    }
}

export function createPostgresAdapter(
    serverId: string,
    dbName: string,
    schema: string,
    tableName: string
): DbAdapter {
    const quoteIdent = (name: string) => `"${name.replace(/"/g, '""')}"`
    const fullTable = schema ? `${quoteIdent(schema)}.${quoteIdent(tableName)}` : quoteIdent(tableName)

    return {
        dialect: 'postgres',
        serverId,
        dbName,
        schema,
        tableName,
        quoteIdent,
        buildWhereClause: buildPgWhereClause,

        async loadStructure(): Promise<DbTableStructure> {
            const desc = await API.postgresDescribe(serverId, dbName, schema, tableName)
            if (!desc) {
                return {
                    columns: [],
                    indexes: [],
                    constraints: [],
                    primaryKeys: {},
                }
            }

            const columns: DbColumnMeta[] = (desc.columns || []).map((c: any) => ({
                name: c.name,
                origName: c.name,
                dataType: c.dataType,
                udtName: c.udtName,
                isNullable: c.isNullable,
                defaultVal: c.defaultVal,
                isPrimaryKey: c.isPrimaryKey,
                isForeignKey: c.isForeignKey,
                comment: c.comment,
            }))

            const indexes: DbIndexMeta[] = (desc.indexes || []).map((idx: any) => ({
                name: idx.name,
                table: idx.table || tableName,
                schema: idx.schema || schema,
                columns: idx.columns || [],
                isUnique: idx.isUnique,
                isPrimary: idx.isPrimary,
                def: idx.def,
                size: idx.size,
            }))

            const constraints: DbConstraintMeta[] = (desc.constraints || []).map((c: any) => ({
                name: c.name,
                type: c.type,
                def: c.def,
                foreignTable: c.foreignTable,
                foreignSchema: c.foreignSchema,
                foreignColumn: c.foreignColumn,
            }))

            return {
                columns,
                indexes,
                constraints,
                primaryKeys: desc.primaryKeys || {},
            }
        },

        async loadData(params: DbQueryParams): Promise<DbQueryResult> {
            const { page, pageSize, where, sortCol, sortOrder } = params
            const offset = (page - 1) * pageSize

            const res = await API.postgresSelect(
                serverId,
                dbName,
                schema,
                tableName,
                pageSize,
                offset,
                sortCol,
                sortOrder,
                where
            )

            return {
                columns: res.columns || [],
                rows: res.rows || [],
                affected: res.affected,
                durationMs: res.durationMs,
            }
        },

        async countData(where: string): Promise<number> {
            return API.postgresCount(serverId, dbName, schema, tableName, where)
        },

        async updateRows(
            drafts: Record<number, Record<string, any>>,
            origRows: any[],
            pkList: string[]
        ): Promise<void> {
            for (const [rowIdxStr, patch] of Object.entries(drafts)) {
                const rowIdx = Number(rowIdxStr)
                const origRow = origRows[rowIdx]
                const pkCols = pkList
                const pkVals = pkList.map((pk) => origRow[pk])

                const setCols = Object.keys(patch)
                const setVals = Object.values(patch)

                await API.postgresUpdate(
                    serverId,
                    dbName,
                    schema,
                    tableName,
                    setCols,
                    setVals,
                    pkCols,
                    pkVals
                )
            }
        },

        async insertRows(newRows: Record<string, any>[]): Promise<void> {
            for (const newRow of newRows) {
                const cols = Object.keys(newRow).filter((k) => newRow[k] !== undefined)
                const vals = cols.map((k) => newRow[k])
                if (cols.length > 0) {
                    await API.postgresInsert(serverId, dbName, schema, tableName, cols, vals)
                }
            }
        },

        async deleteRow(row: any, pkList: string[]): Promise<void> {
            const pkCols = pkList
            const pkVals = pkList.map((pk) => row[pk])
            await API.postgresDelete(serverId, dbName, schema, tableName, pkCols, pkVals)
        },

        async loadDDL(): Promise<string> {
            const ddl = await API.postgresTableDDL(serverId, dbName, schema, tableName)
            return ddl || i18n.t('db:adapters.cannotGetDdl')
        },

        async exportToFile(mode: 'csv' | 'json', limit = 0): Promise<string> {
            return API.postgresExportToFile(
                serverId,
                dbName,
                schema,
                mode,
                'table',
                tableName,
                '',
                limit
            )
        },

        async generateAlterTableSql(currentCols: DbColumnMeta[], origCols: DbColumnMeta[]): Promise<AlterTablePlan> {
            const sqls: string[] = []
            const fullTable = schema ? `${quoteIdent(schema)}.${quoteIdent(tableName)}` : quoteIdent(tableName)
            const origMap = new Map<string, DbColumnMeta>()
            origCols.forEach((c) => origMap.set(c.name, c))

            const currentOrigNames = new Set<string>()
            currentCols.forEach((c) => {
                if (c.origName) currentOrigNames.add(c.origName)
            })

            // 1. 删除列
            const droppedCols = origCols.filter((c) => !currentOrigNames.has(c.name))
            for (const col of droppedCols) {
                sqls.push(`ALTER TABLE ${fullTable} DROP COLUMN ${quoteIdent(col.name)};`)
            }

            // 2. 变更现有列与新增列
            for (const col of currentCols) {
                if (col.isNew || !col.origName || !origMap.has(col.origName)) {
                    // 新增列
                    const nullSql = col.isNullable ? '' : ' NOT NULL'
                    let defSql = ''
                    if (col.defaultVal !== undefined && col.defaultVal.trim() !== '') {
                        const dv = col.defaultVal.trim()
                        if (dv.toUpperCase() === 'NULL' || dv.toUpperCase().includes('()') || /^-?\d+(\.\d+)?$/.test(dv)) {
                            defSql = ` DEFAULT ${dv}`
                        } else {
                            defSql = ` DEFAULT '${dv.replace(/'/g, "''")}'`
                        }
                    }
                    sqls.push(`ALTER TABLE ${fullTable} ADD COLUMN ${quoteIdent(col.name)} ${col.dataType}${nullSql}${defSql};`)
                    if (col.comment) {
                        sqls.push(`COMMENT ON COLUMN ${fullTable}.${quoteIdent(col.name)} IS '${col.comment.replace(/'/g, "''")}';`)
                    }
                } else {
                    const orig = origMap.get(col.origName)!
                    let workingColName = col.origName

                    // 2.1 重命名
                    if (col.name !== col.origName) {
                        sqls.push(`ALTER TABLE ${fullTable} RENAME COLUMN ${quoteIdent(col.origName)} TO ${quoteIdent(col.name)};`)
                        workingColName = col.name
                    }

                    // 2.2 修改类型 (带 USING "col"::type 强转)
                    if (col.dataType !== orig.dataType) {
                        sqls.push(`ALTER TABLE ${fullTable} ALTER COLUMN ${quoteIdent(workingColName)} TYPE ${col.dataType} USING ${quoteIdent(workingColName)}::${col.dataType};`)
                    }

                    // 2.3 修改可空约束
                    if (col.isNullable !== orig.isNullable) {
                        if (col.isNullable) {
                            sqls.push(`ALTER TABLE ${fullTable} ALTER COLUMN ${quoteIdent(workingColName)} DROP NOT NULL;`)
                        } else {
                            sqls.push(`ALTER TABLE ${fullTable} ALTER COLUMN ${quoteIdent(workingColName)} SET NOT NULL;`)
                        }
                    }

                    // 2.4 修改默认值
                    if (col.defaultVal !== orig.defaultVal) {
                        const dv = (col.defaultVal || '').trim()
                        if (!dv || dv.toUpperCase() === 'NULL') {
                            sqls.push(`ALTER TABLE ${fullTable} ALTER COLUMN ${quoteIdent(workingColName)} DROP DEFAULT;`)
                        } else {
                            if (dv.toUpperCase().includes('()') || /^-?\d+(\.\d+)?$/.test(dv) || dv.toUpperCase().startsWith('CURRENT_')) {
                                sqls.push(`ALTER TABLE ${fullTable} ALTER COLUMN ${quoteIdent(workingColName)} SET DEFAULT ${dv};`)
                            } else {
                                sqls.push(`ALTER TABLE ${fullTable} ALTER COLUMN ${quoteIdent(workingColName)} SET DEFAULT '${dv.replace(/'/g, "''")}';`)
                            }
                        }
                    }

                    // 2.5 修改注释
                    if ((col.comment || '') !== (orig.comment || '')) {
                        const cm = col.comment ? `'${col.comment.replace(/'/g, "''")}'` : 'NULL'
                        sqls.push(`COMMENT ON COLUMN ${fullTable}.${quoteIdent(workingColName)} IS ${cm};`)
                    }
                }
            }

            return {
                sqls,
                isRebuild: false,
                warning: droppedCols.length > 0 ? i18n.t('db:adapters.warnDropCol', { cols: droppedCols.map((c) => c.name).join(', ') }) : undefined,
            }
        },

        async executeAlterTable(sqls: string[]): Promise<void> {
            for (const sql of sqls) {
                const trimmed = sql.trim()
                if (!trimmed) continue
                await API.postgresRun(serverId, dbName, trimmed)
            }
        },

        previewCreateIndexSql(params: CreateIndexParams): string {
            const typeSql = params.isUnique ? 'UNIQUE ' : ''
            const colsSql = (params.columns || []).map((c) => quoteIdent(c)).join(', ')
            return `CREATE ${typeSql}INDEX ${quoteIdent(params.name)} ON ${fullTable} (${colsSql});`
        },

        async createIndex(params: CreateIndexParams): Promise<void> {
            const sql = this.previewCreateIndexSql!(params)
            await API.postgresRun(serverId, dbName, sql)
        },

        previewDropIndexSql(indexName: string): string {
            const schemaPrefix = schema ? `${quoteIdent(schema)}.` : ''
            return `DROP INDEX ${schemaPrefix}${quoteIdent(indexName)};`
        },

        async dropIndex(indexName: string): Promise<void> {
            const sql = this.previewDropIndexSql!(indexName)
            await API.postgresRun(serverId, dbName, sql)
        },

        previewCreateConstraintSql(params: CreateConstraintParams): string {
            if (params.type === 'FOREIGN KEY') {
                const targetRef = params.foreignTable ? (schema ? `${quoteIdent(schema)}.${quoteIdent(params.foreignTable)}` : quoteIdent(params.foreignTable)) : ''
                let sql = `ALTER TABLE ${fullTable} ADD CONSTRAINT ${quoteIdent(params.name)} FOREIGN KEY (${quoteIdent(params.column || '')}) REFERENCES ${targetRef} (${quoteIdent(params.foreignColumn || '')})`
                if (params.onDelete && params.onDelete !== 'RESTRICT') sql += ` ON DELETE ${params.onDelete}`
                if (params.onUpdate && params.onUpdate !== 'RESTRICT') sql += ` ON UPDATE ${params.onUpdate}`
                return sql + ';'
            }
            return `ALTER TABLE ${fullTable} ADD CONSTRAINT ${quoteIdent(params.name)} CHECK (${params.checkExpr || ''});`
        },

        async createConstraint(params: CreateConstraintParams): Promise<void> {
            const sql = this.previewCreateConstraintSql!(params) as string
            await API.postgresRun(serverId, dbName, sql)
        },

        previewDropConstraintSql(constraint: DbConstraintMeta): string {
            return `ALTER TABLE ${fullTable} DROP CONSTRAINT ${quoteIdent(constraint.name)};`
        },

        async dropConstraint(constraint: DbConstraintMeta): Promise<void> {
            const sql = this.previewDropConstraintSql!(constraint) as string
            await API.postgresRun(serverId, dbName, sql)
        },

        async listTables(): Promise<string[]> {
            const tables = await API.postgresTables(serverId, dbName, schema)
            return (tables || []).map((t: any) => (typeof t === 'string' ? t : t.table_name || t.name || ''))
        },

        async listTableColumns(targetTable: string): Promise<string[]> {
            const desc = await API.postgresDescribe(serverId, dbName, schema, targetTable)
            return (desc?.columns || []).map((c: any) => String(c.name || ''))
        },
    }
}

export function createPostgresSqlAdapter(
    serverId: string,
    dbName: string,
    schema = 'public'
): DbSqlEditorAdapter {
    return {
        dialect: 'postgres',
        serverId,
        dbName,
        schema,
        defaultSql: `SELECT * FROM information_schema.tables WHERE table_schema = '${schema}' LIMIT 20;`,
        placeholder: i18n.t('db:sql.defaultInputPlaceholder', { dialect: 'PostgreSQL' }),

        async runSql(sql: string): Promise<DbQueryResult> {
            const res = await API.postgresRun(serverId, dbName, sql)
            return {
                columns: res.columns || [],
                rows: res.rows || [],
                affected: res.affected,
                durationMs: res.durationMs,
                error: res.error,
            }
        },

        async explainSql(sql: string, analyze = false): Promise<ExplainPlanResult> {
            const jsonStr = await API.postgresExplain(serverId, dbName, sql, analyze, true, true)
            let parsed: any = null
            try {
                parsed = JSON.parse(jsonStr)
            } catch {
                parsed = jsonStr
            }

            let rootPlan: any = null
            if (Array.isArray(parsed) && parsed[0]?.Plan) {
                rootPlan = parsed[0].Plan
            } else if (parsed?.Plan) {
                rootPlan = parsed.Plan
            }

            if (rootPlan) {
                return {
                    raw: parsed,
                    treeData: [renderPgPlanNode(rootPlan)],
                }
            }

            return {
                raw: parsed,
            }
        },
    }
}
