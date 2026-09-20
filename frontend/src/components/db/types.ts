import { ColumnFilterState } from '@/components/ColumnFilterPopover'

export type DbDialect = 'mysql' | 'postgres' | 'sqlite'

export interface DbColumnMeta {
    name: string
    dataType: string
    udtName?: string
    isNullable: boolean
    defaultVal: string
    isPrimaryKey: boolean
    isForeignKey?: boolean
    extra?: string
    comment?: string
}

export interface DbIndexMeta {
    name: string
    table?: string
    schema?: string
    columns?: string[]
    isUnique: boolean
    isPrimary: boolean
    type?: string
    size?: string
    def?: string
    comment?: string
}

export interface DbConstraintMeta {
    name: string
    type: string
    column?: string
    foreignTable?: string
    foreignSchema?: string
    foreignColumn?: string
    def?: string
}

export interface DbTableStructure {
    columns: DbColumnMeta[]
    indexes: DbIndexMeta[]
    constraints: DbConstraintMeta[]
    primaryKeys: Record<string, boolean>
}

export interface DbQueryParams {
    page: number
    pageSize: number
    where: string
    sortCol: string
    sortOrder: 'ASC' | 'DESC'
}

export interface DbQueryResult {
    columns: string[]
    rows: Record<string, any>[]
    affected?: number
    rowCount?: number
    durationMs?: number
    error?: string
}

export interface DbAdapter {
    dialect: DbDialect
    tableName: string
    schema?: string
    dbName: string
    serverId: string
    quoteIdent: (name: string) => string
    buildWhereClause: (filters: Record<string, ColumnFilterState>) => string
    loadStructure: () => Promise<DbTableStructure>
    loadData: (params: DbQueryParams) => Promise<DbQueryResult>
    countData: (where: string) => Promise<number>
    updateRows: (
        drafts: Record<number, Record<string, any>>,
        origRows: any[],
        pkList: string[]
    ) => Promise<void>
    insertRows: (newRows: Record<string, any>[]) => Promise<void>
    deleteRow: (row: any, pkList: string[]) => Promise<void>
    loadDDL: () => Promise<string>
    exportToFile?: (mode: 'csv' | 'json', limit?: number) => Promise<string>
}

export interface ExplainPlanResult {
    raw?: any
    treeData?: any[]
    tableResult?: DbQueryResult
}

export interface DbSqlEditorAdapter {
    dialect: DbDialect
    serverId: string
    dbName: string
    schema?: string
    defaultSql: string
    placeholder?: string
    runSql: (sql: string) => Promise<DbQueryResult>
    explainSql?: (sql: string, analyze?: boolean) => Promise<ExplainPlanResult>
}
