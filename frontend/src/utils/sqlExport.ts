import { message } from 'antd'

export type SqlDialect = 'mysql' | 'postgres' | 'sqlite'

/**
 * 根据数据库方言转义标识符（表名、列名）
 */
export function escapeSqlIdentifier(name: string, dialect: SqlDialect): string {
    if (!name) return ''
    if (dialect === 'mysql') {
        return `\`${name.replace(/`/g, '``')}\``
    }
    return `"${name.replace(/"/g, '""')}"`
}

/**
 * 根据数据库方言格式化 SQL 字段值
 */
export function formatSqlValue(val: any, dialect: SqlDialect): string {
    if (val === null || val === undefined) {
        return 'NULL'
    }

    // 处理草稿对象结构如 { value: '...', isNull: false }
    if (typeof val === 'object' && 'isNull' in val) {
        if (val.isNull) return 'NULL'
        return formatSqlValue(val.value, dialect)
    }

    if (typeof val === 'number') {
        return isNaN(val) || !isFinite(val) ? 'NULL' : String(val)
    }

    if (typeof val === 'boolean') {
        if (dialect === 'mysql') {
            return val ? '1' : '0'
        }
        return val ? 'TRUE' : 'FALSE'
    }

    if (typeof val === 'object') {
        try {
            const jsonStr = JSON.stringify(val)
            return formatSqlValue(jsonStr, dialect)
        } catch {
            return formatSqlValue(String(val), dialect)
        }
    }

    const str = String(val)
    if (dialect === 'mysql') {
        return `'${str.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
    }
    return `'${str.replace(/'/g, "''")}'`
}

/**
 * 构建单行 INSERT 语句
 */
export function buildInsertSql({
    dialect,
    table,
    columns,
    rowData,
}: {
    dialect: SqlDialect
    table: string
    columns: string[]
    rowData: Record<string, any>
}): string {
    const escapedTable = escapeSqlIdentifier(table, dialect)
    const escapedCols = columns.map((c) => escapeSqlIdentifier(c, dialect)).join(', ')
    const values = columns.map((c) => formatSqlValue(rowData[c], dialect)).join(', ')

    return `INSERT INTO ${escapedTable} (${escapedCols})\nVALUES (${values});`
}

/**
 * 基于主键构建单行 UPDATE 语句
 */
export function buildUpdateSql({
    dialect,
    table,
    columns,
    rowData,
    pkList,
}: {
    dialect: SqlDialect
    table: string
    columns: string[]
    rowData: Record<string, any>
    pkList: string[]
}): string {
    const escapedTable = escapeSqlIdentifier(table, dialect)
    const setCols = columns.filter((c) => !pkList.includes(c))
    const whereCols = pkList.length > 0 ? pkList : columns

    const setClauses = (setCols.length > 0 ? setCols : columns)
        .map((c) => `${escapeSqlIdentifier(c, dialect)} = ${formatSqlValue(rowData[c], dialect)}`)
        .join(', ')

    const whereClauses = whereCols
        .map((pk) => {
            const val = rowData[pk]
            if (val === null || val === undefined) {
                return `${escapeSqlIdentifier(pk, dialect)} IS NULL`
            }
            return `${escapeSqlIdentifier(pk, dialect)} = ${formatSqlValue(val, dialect)}`
        })
        .join(' AND ')

    return `UPDATE ${escapedTable}\nSET ${setClauses}\nWHERE ${whereClauses};`
}

/**
 * 复制文本到系统剪贴板并给出反馈提示
 */
export async function copyTextToClipboard(text: string, successMsg?: string): Promise<boolean> {
    try {
        if (navigator?.clipboard?.writeText) {
            await navigator.clipboard.writeText(text)
        } else {
            const textarea = document.createElement('textarea')
            textarea.value = text
            textarea.style.position = 'fixed'
            textarea.style.opacity = '0'
            document.body.appendChild(textarea)
            textarea.focus()
            textarea.select()
            document.execCommand('copy')
            document.body.removeChild(textarea)
        }
        if (successMsg) {
            message.success(successMsg)
        }
        return true
    } catch (err) {
        console.error('写入剪贴板失败:', err)
        message.error('复制到剪贴板失败，请重试')
        return false
    }
}
