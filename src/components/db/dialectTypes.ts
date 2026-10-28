import i18n from '@/i18n'
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

function isZh(): boolean {
    return (i18n.language || 'zh-CN').startsWith('zh')
}

export function getDialectTypeCategories(dialect: DbDialect): DataTypeCategory[] {
    const zh = isZh()

    if (dialect === 'postgres') {
        return [
            {
                label: zh ? '数字类型 (Numeric)' : 'Numeric Types',
                options: [
                    { value: 'integer', label: 'integer', desc: zh ? '标准 4 字节整数' : 'Standard 4-byte integer' },
                    { value: 'bigint', label: 'bigint', desc: zh ? '大整数 (8 字节)' : 'Large 8-byte integer' },
                    { value: 'smallint', label: 'smallint', desc: zh ? '小整数 (2 字节)' : 'Small 2-byte integer' },
                    { value: 'numeric', label: 'numeric', desc: zh ? '任意精度小数 (金融推荐)' : 'Arbitrary precision numeric', supportsLength: true, defaultLength: '12,2' },
                    { value: 'decimal', label: 'decimal', desc: zh ? '高精度定点小数' : 'Fixed-point decimal', supportsLength: true, defaultLength: '10,2' },
                    { value: 'real', label: 'real', desc: zh ? '单精度浮点数 (4 字节)' : 'Single precision float (4 bytes)' },
                    { value: 'double precision', label: 'double precision', desc: zh ? '双精度浮点数 (8 字节)' : 'Double precision float (8 bytes)' },
                    { value: 'serial', label: 'serial', desc: zh ? '自增 4 字节整数' : 'Auto-incrementing 4-byte integer' },
                    { value: 'bigserial', label: 'bigserial', desc: zh ? '自增 8 字节大整数' : 'Auto-incrementing 8-byte integer' },
                ],
            },
            {
                label: zh ? '字符与文本 (String & Text)' : 'String & Text',
                options: [
                    { value: 'varchar', label: 'varchar', desc: zh ? '有界变长字符串' : 'Variable-length with limit', supportsLength: true, defaultLength: '255' },
                    { value: 'char', label: 'char', desc: zh ? '定长字符串' : 'Fixed-length character', supportsLength: true, defaultLength: '36' },
                    { value: 'text', label: 'text', desc: zh ? '无限制变长文本' : 'Variable unlimited length' },
                    { value: 'uuid', label: 'uuid', desc: zh ? '通用唯一识别码' : 'Universally unique identifier' },
                    { value: 'json', label: 'json', desc: zh ? '文本存储 JSON' : 'Textual JSON data' },
                    { value: 'jsonb', label: 'jsonb', desc: zh ? '二进制快速解析 JSON' : 'Binary decomposed JSON data' },
                ],
            },
            {
                label: zh ? '日期与时间 (Date & Time)' : 'Date & Time',
                options: [
                    { value: 'timestamp without time zone', label: 'timestamp', desc: zh ? '无时区日期时间' : 'Timestamp without time zone' },
                    { value: 'timestamp with time zone', label: 'timestamptz', desc: zh ? '带时区日期时间' : 'Timestamp with time zone' },
                    { value: 'date', label: 'date', desc: zh ? '纯日期' : 'Calendar date' },
                    { value: 'time without time zone', label: 'time', desc: zh ? '纯时间' : 'Time of day without time zone' },
                    { value: 'interval', label: 'interval', desc: zh ? '时间跨度' : 'Time interval' },
                ],
            },
            {
                label: zh ? '布尔与二进制 (Boolean & Binary)' : 'Boolean & Binary',
                options: [
                    { value: 'boolean', label: 'boolean', desc: zh ? '真/假状态值' : 'Logical boolean (true/false)' },
                    { value: 'bytea', label: 'bytea', desc: zh ? '二进制变长数据' : 'Variable-length binary string' },
                ],
            },
        ]
    }

    if (dialect === 'sqlite') {
        return [
            {
                label: zh ? '基础亲和类型 (Affinity Types)' : 'Affinity Types',
                options: [
                    { value: 'INTEGER', label: 'INTEGER', desc: zh ? '有符号整数 (可自增 PRIMARY KEY)' : 'Signed integer (autoincrement PK)' },
                    { value: 'TEXT', label: 'TEXT', desc: zh ? '文本字符串 (UTF-8 编码)' : 'Text string (UTF-8)' },
                    { value: 'REAL', label: 'REAL', desc: zh ? '浮点数 (8 字节 IEEE 浮点数)' : 'Floating point number (8-byte IEEE)' },
                    { value: 'NUMERIC', label: 'NUMERIC', desc: zh ? '数字类型 (自动识别整数/浮点)' : 'Numeric affinity (integer or float)' },
                    { value: 'BLOB', label: 'BLOB', desc: zh ? '二进制数据对象' : 'Binary data blob' },
                ],
            },
            {
                label: zh ? '常用兼容类型 (Common Aliases)' : 'Common Aliases',
                options: [
                    { value: 'VARCHAR', label: 'VARCHAR', desc: zh ? '兼容变长字符文本' : 'Variable character compatibility', supportsLength: true, defaultLength: '255' },
                    { value: 'CHAR', label: 'CHAR', desc: zh ? '兼容定长字符' : 'Fixed character compatibility', supportsLength: true, defaultLength: '36' },
                    { value: 'BOOLEAN', label: 'BOOLEAN', desc: zh ? '布尔值 (实际存储 0 或 1)' : 'Boolean (stored as 0 or 1)' },
                    { value: 'DATETIME', label: 'DATETIME', desc: zh ? '日期时间字符串' : 'Date and time ISO string' },
                    { value: 'DATE', label: 'DATE', desc: zh ? '纯日期字符串' : 'Date ISO string' },
                    { value: 'DECIMAL', label: 'DECIMAL', desc: zh ? '定点小数' : 'Fixed decimal', supportsLength: true, defaultLength: '10,2' },
                ],
            },
        ]
    }

    // Default to MySQL
    return [
        {
            label: zh ? '数字类型 (Numeric)' : 'Numeric Types',
            options: [
                { value: 'int', label: 'int', desc: zh ? '标准整数 (4 字节)' : 'Standard integer (4 bytes)' },
                { value: 'bigint', label: 'bigint', desc: zh ? '大整数 (8 字节)' : 'Big integer (8 bytes)' },
                { value: 'tinyint', label: 'tinyint', desc: zh ? '微型整数/布尔' : 'Tiny integer / boolean', supportsLength: true, defaultLength: '1' },
                { value: 'smallint', label: 'smallint', desc: zh ? '短整数 (2 字节)' : 'Small integer (2 bytes)' },
                { value: 'mediumint', label: 'mediumint', desc: zh ? '中等整数 (3 字节)' : 'Medium integer (3 bytes)' },
                { value: 'decimal', label: 'decimal', desc: zh ? '高精度小数 (金额推荐)' : 'Fixed-point decimal', supportsLength: true, defaultLength: '10,2' },
                { value: 'float', label: 'float', desc: zh ? '单精度浮点数' : 'Single-precision float' },
                { value: 'double', label: 'double', desc: zh ? '双精度浮点数' : 'Double-precision float' },
            ],
        },
        {
            label: zh ? '字符串与文本 (String & Text)' : 'String & Text',
            options: [
                { value: 'varchar', label: 'varchar', desc: zh ? '变长字符串' : 'Variable-length string', supportsLength: true, defaultLength: '255' },
                { value: 'char', label: 'char', desc: zh ? '定长字符串 (如 UUID)' : 'Fixed-length string (e.g. UUID)', supportsLength: true, defaultLength: '36' },
                { value: 'text', label: 'text', desc: zh ? '长文本 (最多 64KB)' : 'Text (up to 64KB)' },
                { value: 'mediumtext', label: 'mediumtext', desc: zh ? '中长文本 (最多 16MB)' : 'Medium text (up to 16MB)' },
                { value: 'longtext', label: 'longtext', desc: zh ? '极大文本 (最多 4GB)' : 'Long text (up to 4GB)' },
                { value: 'json', label: 'json', desc: zh ? '原生 JSON 格式' : 'Native JSON' },
            ],
        },
        {
            label: zh ? '日期与时间 (Date & Time)' : 'Date & Time',
            options: [
                { value: 'datetime', label: 'datetime', desc: zh ? '日期时间 (1000-9999)' : 'Datetime (1000-9999)' },
                { value: 'timestamp', label: 'timestamp', desc: zh ? '时间戳 (带时区 1970-2038)' : 'Timestamp (UTC, 1970-2038)' },
                { value: 'date', label: 'date', desc: zh ? '纯日期' : 'Calendar date' },
                { value: 'time', label: 'time', desc: zh ? '纯时间' : 'Time of day' },
                { value: 'year', label: 'year', desc: zh ? '年份' : 'Year' },
            ],
        },
        {
            label: zh ? '二进制 (Binary)' : 'Binary',
            options: [
                { value: 'blob', label: 'blob', desc: zh ? '二进制大对象 (64KB)' : 'Binary large object (64KB)' },
                { value: 'longblob', label: 'longblob', desc: zh ? '极大二进制大对象 (4GB)' : 'Long binary object (4GB)' },
            ],
        },
    ]
}

export const MYSQL_DATA_TYPES = getDialectTypeCategories('mysql')
export const POSTGRES_DATA_TYPES = getDialectTypeCategories('postgres')
export const SQLITE_DATA_TYPES = getDialectTypeCategories('sqlite')

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
