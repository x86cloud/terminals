export interface PgDatabase {
    name: string
    owner: string
    encoding: string
    collate: string
    size: string
    sizeBytes: number
    tableCount: number
}

export interface PgSchema {
    name: string
    owner: string
    tableCount: number
    viewCount: number
    functionCount: number
}

export interface PgTable {
    name: string
    schema: string
    type: 'BASE TABLE' | 'VIEW' | 'MATERIALIZED VIEW' | 'FOREIGN TABLE' | 'PARTITIONED TABLE' | string
    rowCount: number
    totalSize: string
    tableSize: string
    indexSize: string
    comment: string
}

export interface PgColumn {
    name: string
    ordinalPos: number
    dataType: string
    udtName: string
    isNullable: boolean
    defaultVal: string
    isPrimaryKey: boolean
    isForeignKey: boolean
    charMaxLength?: number
    numPrecision?: number
    numScale?: number
    comment: string
}

export interface PgIndex {
    name: string
    table: string
    schema: string
    def: string
    isPrimary: boolean
    isUnique: boolean
    columns?: string[]
    size: string
}

export interface PgConstraint {
    name: string
    type: 'PRIMARY KEY' | 'FOREIGN KEY' | 'UNIQUE' | 'CHECK' | string
    def: string
    foreignTable?: string
    foreignSchema?: string
    foreignColumn?: string
}

export interface PgSequence {
    name: string
    schema: string
    dataType: string
    startValue: number
    minValue: number
    maxValue: number
    increment: number
    currentValue: number
    lastValue: number
}

export interface PgFunction {
    name: string
    schema: string
    resultType: string
    argTypes: string
    argNames?: string[]
    language: string
    def: string
    comment: string
    isProc: boolean
}

export interface PgSession {
    pid: number
    user: string
    database: string
    clientAddr: string
    clientPort: number
    backendStart: string
    queryStart: string
    stateChange: string
    waitEventType: string
    waitEvent: string
    state: string
    query: string
    durationSec: number
}

export interface PgRole {
    name: string
    super: boolean
    inherit: boolean
    createRole: boolean
    createDb: boolean
    canLogin: boolean
    replication: boolean
    connLimit: number
    validUntil: string
    memberOf: string
}

export interface PgStatus {
    version: string
    uptime: string
    activeConnections: number
    maxConnections: number
    databaseSize: string
    cacheHitRatio: string
    tps: number
    deadlocks: number
    tempFiles: number
    tempBytes: string
}

export interface PgQueryResult {
    columns: string[]
    columnTypes?: string[]
    rows: Record<string, any>[]
    affected: number
    durationMs: number
    error?: string
}

export interface PostgresTabItem {
    key: string
    label: string
    closable?: boolean
    type: 'data' | 'structure' | 'sql' | 'status' | 'roles' | 'functions' | 'er'
    dbName: string
    schema?: string
    table?: string
    sqlText?: string
}
