import { DbDialect } from './types'

export interface DataTypeOption {
    value: string
    label: string
    desc?: string
    supportsLength?: boolean
    defaultLength?: string
}

export interface DataTypeCategory {
    label: string
    options: DataTypeOption[]
}

export const MYSQL_DATA_TYPES: DataTypeCategory[] = [
    {
        label: '数字类型 (Numeric)',
        options: [
            { value: 'int', label: 'int', desc: '标准整数 (4 字节)' },
            { value: 'bigint', label: 'bigint', desc: '大整数 (8 字节)' },
            { value: 'tinyint', label: 'tinyint', desc: '微型整数/布尔', supportsLength: true, defaultLength: '1' },
            { value: 'smallint', label: 'smallint', desc: '短整数 (2 字节)' },
            { value: 'mediumint', label: 'mediumint', desc: '中等整数 (3 字节)' },
            { value: 'decimal', label: 'decimal', desc: '高精度小数 (金额推荐)', supportsLength: true, defaultLength: '10,2' },
            { value: 'float', label: 'float', desc: '单精度浮点数' },
            { value: 'double', label: 'double', desc: '双精度浮点数' },
        ],
    },
    {
        label: '字符串与文本 (String & Text)',
        options: [
            { value: 'varchar', label: 'varchar', desc: '变长字符串', supportsLength: true, defaultLength: '255' },
            { value: 'char', label: 'char', desc: '定长字符串 (如 UUID)', supportsLength: true, defaultLength: '36' },
            { value: 'text', label: 'text', desc: '长文本 (最多 64KB)' },
            { value: 'mediumtext', label: 'mediumtext', desc: '中长文本 (最多 16MB)' },
            { value: 'longtext', label: 'longtext', desc: '极大文本 (最多 4GB)' },
            { value: 'json', label: 'json', desc: '原生 JSON 格式' },
        ],
    },
    {
        label: '日期与时间 (Date & Time)',
        options: [
            { value: 'datetime', label: 'datetime', desc: '日期时间 (1000-9999)' },
            { value: 'timestamp', label: 'timestamp', desc: '时间戳 (带时区 1970-2038)' },
            { value: 'date', label: 'date', desc: '纯日期' },
            { value: 'time', label: 'time', desc: '纯时间' },
            { value: 'year', label: 'year', desc: '年份' },
        ],
    },
    {
        label: '二进制 (Binary)',
        options: [
            { value: 'blob', label: 'blob', desc: '二进制大对象 (64KB)' },
            { value: 'longblob', label: 'longblob', desc: '极大二进制大对象 (4GB)' },
        ],
    },
]

export const POSTGRES_DATA_TYPES: DataTypeCategory[] = [
    {
        label: '数字类型 (Numeric)',
        options: [
            { value: 'integer', label: 'integer', desc: '标准 4 字节整数' },
            { value: 'bigint', label: 'bigint', desc: '大整数 (8 字节)' },
            { value: 'smallint', label: 'smallint', desc: '小整数 (2 字节)' },
            { value: 'numeric', label: 'numeric', desc: '任意精度小数 (金融推荐)', supportsLength: true, defaultLength: '12,2' },
            { value: 'decimal', label: 'decimal', desc: '高精度定点小数', supportsLength: true, defaultLength: '10,2' },
            { value: 'real', label: 'real', desc: '单精度浮点数 (4 字节)' },
            { value: 'double precision', label: 'double precision', desc: '双精度浮点数 (8 字节)' },
            { value: 'serial', label: 'serial', desc: '自增 4 字节整数' },
            { value: 'bigserial', label: 'bigserial', desc: '自增 8 字节大整数' },
        ],
    },
    {
        label: '字符与文本 (String & Text)',
        options: [
            { value: 'varchar', label: 'varchar', desc: '有界变长字符串', supportsLength: true, defaultLength: '255' },
            { value: 'char', label: 'char', desc: '定长字符串', supportsLength: true, defaultLength: '36' },
            { value: 'text', label: 'text', desc: '无限制变长文本' },
            { value: 'uuid', label: 'uuid', desc: '通用唯一识别码' },
            { value: 'json', label: 'json', desc: '文本存储 JSON' },
            { value: 'jsonb', label: 'jsonb', desc: '二进制快速解析 JSON' },
        ],
    },
    {
        label: '日期与时间 (Date & Time)',
        options: [
            { value: 'timestamp without time zone', label: 'timestamp', desc: '无时区日期时间' },
            { value: 'timestamp with time zone', label: 'timestamptz', desc: '带时区日期时间' },
            { value: 'date', label: 'date', desc: '纯日期' },
            { value: 'time without time zone', label: 'time', desc: '纯时间' },
            { value: 'interval', label: 'interval', desc: '时间跨度' },
        ],
    },
    {
        label: '布尔与二进制 (Boolean & Binary)',
        options: [
            { value: 'boolean', label: 'boolean', desc: '真/假状态值' },
            { value: 'bytea', label: 'bytea', desc: '二进制变长数据' },
        ],
    },
]

export const SQLITE_DATA_TYPES: DataTypeCategory[] = [
    {
        label: '基础亲和类型 (Affinity Types)',
        options: [
            { value: 'INTEGER', label: 'INTEGER', desc: '有符号整数 (可自增 PRIMARY KEY)' },
            { value: 'TEXT', label: 'TEXT', desc: '文本字符串 (UTF-8 编码)' },
            { value: 'REAL', label: 'REAL', desc: '浮点数 (8 字节 IEEE 浮点数)' },
            { value: 'NUMERIC', label: 'NUMERIC', desc: '数字类型 (自动识别整数/浮点)' },
            { value: 'BLOB', label: 'BLOB', desc: '二进制数据对象' },
        ],
    },
    {
        label: '常用兼容类型 (Common Aliases)',
        options: [
            { value: 'VARCHAR', label: 'VARCHAR', desc: '兼容变长字符文本', supportsLength: true, defaultLength: '255' },
            { value: 'CHAR', label: 'CHAR', desc: '兼容定长字符', supportsLength: true, defaultLength: '36' },
            { value: 'BOOLEAN', label: 'BOOLEAN', desc: '布尔值 (实际存储 0 或 1)' },
            { value: 'DATETIME', label: 'DATETIME', desc: '日期时间字符串' },
            { value: 'DATE', label: 'DATE', desc: '纯日期字符串' },
            { value: 'DECIMAL', label: 'DECIMAL', desc: '定点小数', supportsLength: true, defaultLength: '10,2' },
        ],
    },
]

export function getDialectTypeCategories(dialect: DbDialect): DataTypeCategory[] {
    switch (dialect) {
        case 'mysql':
            return MYSQL_DATA_TYPES
        case 'postgres':
            return POSTGRES_DATA_TYPES
        case 'sqlite':
            return SQLITE_DATA_TYPES
        default:
            return MYSQL_DATA_TYPES
    }
}

/**
 * 拆分完整数据类型表达式为基础类型与长度/精度参数
 * 例：
 *   varchar(255) -> { baseType: 'varchar', length: '255' }
 *   decimal(10, 2) -> { baseType: 'decimal', length: '10, 2' }
 *   integer -> { baseType: 'integer', length: '' }
 *   timestamp without time zone -> { baseType: 'timestamp without time zone', length: '' }
 */
export function splitDataType(fullType: string): { baseType: string; length: string } {
    if (!fullType) return { baseType: '', length: '' }
    const trimmed = fullType.trim()
    const match = trimmed.match(/^([^(]+)(?:\((.*)\))?$/)
    if (!match) {
        return { baseType: trimmed, length: '' }
    }
    return {
        baseType: match[1].trim(),
        length: match[2] ? match[2].trim() : '',
    }
}

/**
 * 组装基础类型与长度/精度参数为完整 SQL 类型
 */
export function combineDataType(baseType: string, length?: string): string {
    const cleanBase = (baseType || '').trim()
    const cleanLen = (length || '').trim()
    if (!cleanBase) return ''
    if (cleanLen) {
        return `${cleanBase}(${cleanLen})`
    }
    return cleanBase
}

/**
 * 判断指定方言下的基础类型是否支持/需要长度与精度输入
 */
export function isLengthSupported(dialect: DbDialect, baseType: string): boolean {
    const cleanBase = (baseType || '').trim().toLowerCase()
    const categories = getDialectTypeCategories(dialect)
    for (const cat of categories) {
        for (const opt of cat.options) {
            if (opt.value.toLowerCase() === cleanBase) {
                return Boolean(opt.supportsLength)
            }
        }
    }
    return ['varchar', 'char', 'decimal', 'numeric', 'tinyint', 'nvarchar', 'nchar'].includes(cleanBase)
}

/**
 * 获取切换到该类型时的智能默认长度
 */
export function getDefaultLength(dialect: DbDialect, baseType: string): string {
    const cleanBase = (baseType || '').trim().toLowerCase()
    const categories = getDialectTypeCategories(dialect)
    for (const cat of categories) {
        for (const opt of cat.options) {
            if (opt.value.toLowerCase() === cleanBase) {
                return opt.defaultLength || ''
            }
        }
    }
    if (cleanBase === 'varchar') return '255'
    if (cleanBase === 'char') return '36'
    if (cleanBase === 'decimal' || cleanBase === 'numeric') return '10,2'
    if (cleanBase === 'tinyint') return '1'
    return ''
}
