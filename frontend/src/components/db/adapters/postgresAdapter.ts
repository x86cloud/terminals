import React from 'react'
import { Tag } from 'antd'
import { API } from '@/api'
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
} from '../types'

function renderPgPlanNode(plan: any): any {
    if (!plan) return null
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
            `成本: ${plan['Startup Cost']} .. ${plan['Total Cost']} | 行数: ${plan['Plan Rows']}${
                plan['Actual Total Time'] !== undefined
                    ? ` | 实际耗时: ${plan['Actual Total Time']}ms (${plan['Actual Rows']} 行)`
                    : ''
            }`
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
            return ddl || '-- 未能获取到 DDL'
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
        placeholder: '-- 输入 PostgreSQL SQL 语句，按 Ctrl+Enter 快速执行',

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
