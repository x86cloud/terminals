// MongoDB 子组件共享的工具与类型

export type MongoTabKey = 'documents' | 'aggregate' | 'indexes' | 'schema' | 'monitor' | 'stream'

// 美化 Extended JSON 字符串（已是 JSON，直接格式化）
export function prettyJSON(text: string): string {
    if (!text) return ''
    try {
        return JSON.stringify(JSON.parse(text), null, 2)
    } catch {
        return text
    }
}

// 把文档数组（Extended JSON 字符串数组）转为可点击查看的对象数组
export function parseDocs(docs: string[]): Array<{ raw: string; obj: any }> {
    return (docs || []).map((d) => {
        try {
            return {raw: d, obj: JSON.parse(d)}
        } catch {
            return {raw: d, obj: null}
        }
    })
}

// 取文档的某个顶层字段用于摘要展示
export function docSummary(obj: any): string {
    if (obj == null) return 'null'
    const id = obj._id
    if (id !== undefined) {
        try {
            return JSON.stringify(id)
        } catch {
            return String(id)
        }
    }
    const keys = Object.keys(obj)
    if (!keys.length) return '{}'
    return keys[0] + ': …'
}
