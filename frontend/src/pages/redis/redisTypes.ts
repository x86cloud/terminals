import {RedisValue, RedisValueType} from '@/types'

export interface KeyTreeNode {
    key: string
    name: string
    fullKey?: string
    isLeaf: boolean
    count: number
    children: KeyTreeNode[]
}

export function buildKeyTree(keys: (string | { key?: string })[], delimiter = ':'): KeyTreeNode[] {
    if (!Array.isArray(keys)) return []
    const stringKeys: string[] = keys
        .map((k) => (typeof k === 'string' ? k : (k && typeof k === 'object' && k.key ? String(k.key) : String(k || ''))))
        .filter(Boolean)

    if (!delimiter) {
        return stringKeys.map((k) => ({
            key: k,
            name: k,
            fullKey: k,
            isLeaf: true,
            count: 1,
            children: [],
        }))
    }

    const rootNodes: KeyTreeNode[] = []

    for (const fullKey of stringKeys) {
        const parts = fullKey.split(delimiter)
        let currentLevel = rootNodes
        let path = ''

        for (let i = 0; i < parts.length; i++) {
            const part = parts[i]
            path = path ? `${path}${delimiter}${part}` : part
            const isLast = i === parts.length - 1

            let node = currentLevel.find((n) => n.name === part)
            if (!node) {
                node = {
                    key: path,
                    name: part,
                    fullKey: isLast ? fullKey : undefined,
                    isLeaf: isLast,
                    count: 0,
                    children: [],
                }
                currentLevel.push(node)
            }
            node.count++
            currentLevel = node.children
        }
    }

    return rootNodes
}

export function collectLeafKeys(node: KeyTreeNode): string[] {
    if (node.isLeaf && node.fullKey) return [node.fullKey]
    const result: string[] = []
    for (const child of node.children) {
        result.push(...collectLeafKeys(child))
    }
    return result
}

export const TYPE_LABEL: Record<RedisValueType, string> = {
    string: 'String',
    list: 'List',
    set: 'Set',
    hash: 'Hash',
    zset: 'ZSet',
    stream: 'Stream',
}

export function formatValue(v: RedisValue): string {
    switch (v.type) {
        case 'string':
            return String(v.value ?? '')
        case 'list':
        case 'set':
            return (Array.isArray(v.value) ? v.value : []).join('\n')
        case 'hash':
            return Object.entries(v.value ?? {})
                .map(([k, val]) => `${k}\n${val}`)
                .join('\n')
        case 'zset':
            return (Array.isArray(v.value) ? v.value : [])
                .map((p: any) => `${p.member}\n${p.score}`)
                .join('\n')
        case 'stream':
            return (Array.isArray(v.value) ? v.value : [])
                .map((e: any) => `${e.id}\n${fmtFields(e.fields)}`)
                .join('\n---\n')
        default:
            return String(v.value ?? '')
    }
}

export function fmtFields(f: any): string {
    if (!f) return ''
    if (typeof f === 'object') return Object.entries(f).map(([k, v]) => `${k}=${v}`).join(' ')
    return String(f)
}

export const TABS = ['keys', 'pipeline', 'tx', 'pubsub', 'keyspace', 'queue', 'monitor'] as const
export type Tab = typeof TABS[number]

export const TAB_LABEL: Record<Tab, string> = {
    keys: '键值',
    pipeline: 'Pipeline',
    tx: '事务',
    pubsub: '发布订阅',
    keyspace: '键事件',
    queue: '队列',
    monitor: '监控',
}
