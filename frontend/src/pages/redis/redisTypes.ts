import { RedisKeyItem, RedisValue, RedisValueType } from '@/types'

export interface KeyTreeNode {
    key: string
    name: string
    fullKey?: string
    isLeaf: boolean
    count: number
    type?: RedisValueType
    ttl?: number
    children: KeyTreeNode[]
}

interface InternalNode {
    key: string
    name: string
    fullKey?: string
    type?: RedisValueType
    ttl?: number
    hasSelfKey: boolean
    count: number
    children: InternalNode[]
}

export function buildKeyTree(
    keys: (string | RedisKeyItem)[],
    delimiter = ':'
): KeyTreeNode[] {
    if (!Array.isArray(keys)) return []

    const keyMap = new Map<string, { type?: RedisValueType; ttl?: number }>()
    const stringKeys: string[] = []

    for (const item of keys) {
        if (!item) continue
        if (typeof item === 'string') {
            stringKeys.push(item)
        } else if (typeof item === 'object' && item.key) {
            stringKeys.push(item.key)
            keyMap.set(item.key, { type: item.type, ttl: item.ttl })
        }
    }

    if (!delimiter) {
        return stringKeys.map((k) => {
            const meta = keyMap.get(k)
            return {
                key: k,
                name: k,
                fullKey: k,
                isLeaf: true,
                count: 1,
                type: meta?.type,
                ttl: meta?.ttl,
                children: [],
            }
        })
    }

    const rootNodes: InternalNode[] = []

    for (const fullKey of stringKeys) {
        const parts = fullKey.split(delimiter)
        let currentLevel = rootNodes
        let path = ''
        const meta = keyMap.get(fullKey)

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
                    type: isLast ? meta?.type : undefined,
                    ttl: isLast ? meta?.ttl : undefined,
                    hasSelfKey: isLast,
                    count: 0,
                    children: [],
                }
                currentLevel.push(node)
            } else if (isLast) {
                node.hasSelfKey = true
                node.fullKey = fullKey
                node.type = meta?.type
                node.ttl = meta?.ttl
            }
            node.count++
            currentLevel = node.children
        }
    }

    function transform(nodes: InternalNode[]): KeyTreeNode[] {
        return nodes.map((node) => {
            const transformedChildren = transform(node.children)

            if (transformedChildren.length > 0) {
                const children = [...transformedChildren]
                if (node.hasSelfKey && node.fullKey) {
                    children.unshift({
                        key: `${node.key}::__self__`,
                        name: `${node.name} (当前键)`,
                        fullKey: node.fullKey,
                        isLeaf: true,
                        count: 1,
                        type: node.type,
                        ttl: node.ttl,
                        children: [],
                    })
                }
                return {
                    key: node.key,
                    name: node.name,
                    isLeaf: false,
                    count: node.count,
                    children,
                }
            } else {
                return {
                    key: node.key,
                    name: node.name,
                    fullKey: node.fullKey,
                    isLeaf: true,
                    count: node.count,
                    type: node.type,
                    ttl: node.ttl,
                    children: [],
                }
            }
        })
    }

    return transform(rootNodes)
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

export const TYPE_SHORT_LABEL: Record<RedisValueType, string> = {
    string: 'STR',
    list: 'LIST',
    set: 'SET',
    hash: 'HASH',
    zset: 'ZSET',
    stream: 'STRM',
}

export const TYPE_COLOR: Record<RedisValueType, { bg: string; text: string; border: string }> = {
    string: { bg: 'rgba(16, 185, 129, 0.12)', text: '#10b981', border: 'rgba(16, 185, 129, 0.3)' },
    hash: { bg: 'rgba(245, 158, 11, 0.12)', text: '#f59e0b', border: 'rgba(245, 158, 11, 0.3)' },
    list: { bg: 'rgba(59, 130, 246, 0.12)', text: '#3b82f6', border: 'rgba(59, 130, 246, 0.3)' },
    set: { bg: 'rgba(139, 92, 246, 0.12)', text: '#8b5cf6', border: 'rgba(139, 92, 246, 0.3)' },
    zset: { bg: 'rgba(6, 182, 212, 0.12)', text: '#06b6d4', border: 'rgba(6, 182, 212, 0.3)' },
    stream: { bg: 'rgba(236, 72, 153, 0.12)', text: '#ec4899', border: 'rgba(236, 72, 153, 0.3)' },
}

export function formatTtl(ttlSec: number | undefined | null): { text: string; isPermanent: boolean; isExpired: boolean } {
    if (ttlSec === undefined || ttlSec === null) return { text: '--', isPermanent: false, isExpired: false }
    if (ttlSec === -1) return { text: '永久有效', isPermanent: true, isExpired: false }
    if (ttlSec === -2) return { text: '已过期', isPermanent: false, isExpired: true }
    if (ttlSec < 60) return { text: `${ttlSec}秒`, isPermanent: false, isExpired: false }
    if (ttlSec < 3600) {
        const m = Math.floor(ttlSec / 60)
        const s = ttlSec % 60
        return { text: s > 0 ? `${m}分 ${s}秒` : `${m}分钟`, isPermanent: false, isExpired: false }
    }
    if (ttlSec < 86400) {
        const h = Math.floor(ttlSec / 3600)
        const m = Math.floor((ttlSec % 3600) / 60)
        return { text: m > 0 ? `${h}小时 ${m}分` : `${h}小时`, isPermanent: false, isExpired: false }
    }
    const d = Math.floor(ttlSec / 86400)
    const h = Math.floor((ttlSec % 86400) / 3600)
    return { text: h > 0 ? `${d}天 ${h}小时` : `${d}天`, isPermanent: false, isExpired: false }
}

export function formatBytes(bytes: number): string {
    if (!bytes || bytes <= 0) return '0 B'
    const units = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(1024))
    return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

export function formatValue(v: RedisValue): string {
    if (!v) return ''
    if (typeof v.value === 'string') {
        return v.value
    }
    switch (v.type) {
        case 'string':
            return String(v.value ?? '')
        case 'list':
        case 'set':
            return (Array.isArray(v.value) ? v.value : []).join('\n')
        case 'hash':
            if (v.value && typeof v.value === 'object' && !Array.isArray(v.value)) {
                return Object.entries(v.value)
                    .map(([k, val]) => `${k}\n${val}`)
                    .join('\n')
            }
            return String(v.value ?? '')
        case 'zset':
            return (Array.isArray(v.value) ? v.value : [])
                .map((p: any) => `${p.member}\n${p.score}`)
                .join('\n')
        case 'stream':
            return (Array.isArray(v.value) ? v.value : [])
                .map((e: any) => `${e.id}\n${fmtFields(e.fields || e.values)}`)
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
