import { ColumnFilterState } from '@/components/ColumnFilterPopover'

export type DbDialect = 'mysql' | 'postgres' | 'sqlite'

export interface DbColumnMeta {
    name: string
    origName?: string
    dataType: string
    udtName?: string
    isNullable: boolean
    defaultVal: string
    isPrimaryKey: boolean
    isForeignKey?: boolean
    extra?: string
    comment?: string
    isNew?: boolean
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

export interface AlterTablePlan {
    sqls: string[]
    isRebuild: boolean
    warning?: string
}

export interface CreateIndexParams {
    name: string
    isUnique: boolean
    columns: string[]
    type?: string
}

export interface CreateConstraintParams {
    name: string
    type: 'FOREIGN KEY' | 'CHECK'
    column?: string
    foreignTable?: string
    foreignColumn?: string
    onDelete?: string
    onUpdate?: string
    checkExpr?: string
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
    generateAlterTableSql?: (
        currentCols: DbColumnMeta[],
        origCols: DbColumnMeta[]
    ) => Promise<AlterTablePlan>
    executeAlterTable?: (sqls: string[]) => Promise<void>

    // 索引管理
    createIndex?: (params: CreateIndexParams) => Promise<void>
    dropIndex?: (indexName: string) => Promise<void>
    previewCreateIndexSql?: (params: CreateIndexParams) => string
    previewDropIndexSql?: (indexName: string) => string

    // 约束管理
    createConstraint?: (params: CreateConstraintParams) => Promise<void>
    dropConstraint?: (constraint: DbConstraintMeta) => Promise<void>
    previewCreateConstraintSql?: (
        params: CreateConstraintParams
    ) => Promise<string | AlterTablePlan> | string | AlterTablePlan
    previewDropConstraintSql?: (
        constraint: DbConstraintMeta
    ) => Promise<string | AlterTablePlan> | string | AlterTablePlan

    // 元数据关联查询
    listTables?: () => Promise<string[]>
    listTableColumns?: (targetTable: string) => Promise<string[]>
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
