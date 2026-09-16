import React, { useState, useEffect, useRef } from 'react'
import { Popover, Select, Input, Button, Space, Tooltip } from 'antd'
import { Filter, X } from 'lucide-react'

export type FilterOp =
    | 'contains'
    | 'not_contains'
    | 'equals'
    | 'not_equals'
    | 'starts_with'
    | 'ends_with'
    | 'gt'
    | 'gte'
    | 'lt'
    | 'lte'
    | 'is_null'
    | 'is_not_null'

export interface ColumnFilterState {
    op: FilterOp
    value: string
}

export const OP_LABELS: Record<FilterOp, string> = {
    contains: '包含',
    not_contains: '不包含',
    equals: '等于 (=)',
    not_equals: '不等于 (!=)',
    starts_with: '开头是',
    ends_with: '结尾是',
    gt: '大于 (>)',
    gte: '大于等于 (>=)',
    lt: '小于 (<)',
    lte: '小于等于 (<=)',
    is_null: '为 NULL',
    is_not_null: '非 NULL',
}

const OP_OPTIONS = [
    {
        label: '模糊匹配',
        options: [
            { label: '包含', value: 'contains' },
            { label: '不包含', value: 'not_contains' },
            { label: '开头是', value: 'starts_with' },
            { label: '结尾是', value: 'ends_with' },
        ],
    },
    {
        label: '精确与比较',
        options: [
            { label: '等于 (=)', value: 'equals' },
            { label: '不等于 (!=)', value: 'not_equals' },
            { label: '大于 (>)', value: 'gt' },
            { label: '大于等于 (>=)', value: 'gte' },
            { label: '小于 (<)', value: 'lt' },
            { label: '小于等于 (<=)', value: 'lte' },
        ],
    },
    {
        label: '空值判断',
        options: [
            { label: '为 NULL', value: 'is_null' },
            { label: '非 NULL', value: 'is_not_null' },
        ],
    },
]

function isNumeric(val: string): boolean {
    return val.trim() !== '' && !isNaN(Number(val))
}

/**
 * 构建 PostgreSQL 的 WHERE 子句
 */
export function buildPgWhereClause(filters: Record<string, ColumnFilterState>): string {
    const parts: string[] = []
    for (const [col, f] of Object.entries(filters)) {
        if (!f) continue
        const escapedCol = `"${col.replace(/"/g, '""')}"`
        const val = f.value.replace(/'/g, "''")
        switch (f.op) {
            case 'contains':
                parts.push(`${escapedCol}::text ILIKE '%${val}%'`)
                break
            case 'not_contains':
                parts.push(`${escapedCol}::text NOT ILIKE '%${val}%'`)
                break
            case 'starts_with':
                parts.push(`${escapedCol}::text ILIKE '${val}%'`)
                break
            case 'ends_with':
                parts.push(`${escapedCol}::text ILIKE '%${val}'`)
                break
            case 'equals':
                parts.push(`${escapedCol}::text = '${val}'`)
                break
            case 'not_equals':
                parts.push(`${escapedCol}::text != '${val}'`)
                break
            case 'gt':
                parts.push(`${escapedCol} > ${isNumeric(f.value) ? f.value : `'${val}'`}`)
                break
            case 'gte':
                parts.push(`${escapedCol} >= ${isNumeric(f.value) ? f.value : `'${val}'`}`)
                break
            case 'lt':
                parts.push(`${escapedCol} < ${isNumeric(f.value) ? f.value : `'${val}'`}`)
                break
            case 'lte':
                parts.push(`${escapedCol} <= ${isNumeric(f.value) ? f.value : `'${val}'`}`)
                break
            case 'is_null':
                parts.push(`${escapedCol} IS NULL`)
                break
            case 'is_not_null':
                parts.push(`${escapedCol} IS NOT NULL`)
                break
        }
    }
    return parts.join(' AND ')
}

/**
 * 构建 MySQL 的 WHERE 子句
 */
export function buildMysqlWhereClause(filters: Record<string, ColumnFilterState>): string {
    const parts: string[] = []
    for (const [col, f] of Object.entries(filters)) {
        if (!f) continue
        const escapedCol = `\`${col.replace(/`/g, '``')}\``
        const val = f.value.replace(/'/g, "''").replace(/\\/g, '\\\\')
        switch (f.op) {
            case 'contains':
                parts.push(`CAST(${escapedCol} AS CHAR) LIKE '%${val}%'`)
                break
            case 'not_contains':
                parts.push(`CAST(${escapedCol} AS CHAR) NOT LIKE '%${val}%'`)
                break
            case 'starts_with':
                parts.push(`CAST(${escapedCol} AS CHAR) LIKE '${val}%'`)
                break
            case 'ends_with':
                parts.push(`CAST(${escapedCol} AS CHAR) LIKE '%${val}'`)
                break
            case 'equals':
                parts.push(`${escapedCol} = '${val}'`)
                break
            case 'not_equals':
                parts.push(`${escapedCol} != '${val}'`)
                break
            case 'gt':
                parts.push(`${escapedCol} > ${isNumeric(f.value) ? f.value : `'${val}'`}`)
                break
            case 'gte':
                parts.push(`${escapedCol} >= ${isNumeric(f.value) ? f.value : `'${val}'`}`)
                break
            case 'lt':
                parts.push(`${escapedCol} < ${isNumeric(f.value) ? f.value : `'${val}'`}`)
                break
            case 'lte':
                parts.push(`${escapedCol} <= ${isNumeric(f.value) ? f.value : `'${val}'`}`)
                break
            case 'is_null':
                parts.push(`${escapedCol} IS NULL`)
                break
            case 'is_not_null':
                parts.push(`${escapedCol} IS NOT NULL`)
                break
        }
    }
    return parts.join(' AND ')
}

/**
 * 格式化过滤描述文本
 */
export function formatFilterLabel(col: string, f: ColumnFilterState): string {
    if (f.op === 'is_null') return `${col} 为 NULL`
    if (f.op === 'is_not_null') return `${col} 非 NULL`
    return `${col} ${OP_LABELS[f.op]} '${f.value}'`
}

export interface ColumnFilterPopoverProps {
    col: string
    activeFilter?: ColumnFilterState
    onApply: (filter: ColumnFilterState | null) => void
}

export default function ColumnFilterPopover({
    col,
    activeFilter,
    onApply,
}: ColumnFilterPopoverProps) {
    const [open, setOpen] = useState(false)
    const [op, setOp] = useState<FilterOp>(activeFilter?.op || 'contains')
    const [val, setVal] = useState<string>(activeFilter?.value || '')
    const inputRef = useRef<any>(null)

    const isNoVal = op === 'is_null' || op === 'is_not_null'
    const isFiltered = !!activeFilter

    useEffect(() => {
        if (open) {
            setOp(activeFilter?.op || 'contains')
            setVal(activeFilter?.value || '')
            setTimeout(() => {
                inputRef.current?.focus?.()
            }, 50)
        }
    }, [open, activeFilter])

    const handleConfirm = () => {
        if (isNoVal) {
            onApply({ op, value: '' })
            setOpen(false)
            return
        }
        const trimmed = val.trim()
        if (!trimmed) {
            onApply(null)
            setOpen(false)
            return
        }
        onApply({ op, value: trimmed })
        setOpen(false)
    }

    const handleReset = () => {
        setVal('')
        onApply(null)
        setOpen(false)
    }

    const content = (
        <div
            onClick={(e) => e.stopPropagation()}
            style={{ width: 240, display: 'flex', flexDirection: 'column', gap: 10, padding: '4px 0' }}
        >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    筛选: <code style={{ color: 'var(--accent, #1677ff)' }}>{col}</code>
                </span>
                {isFiltered && (
                    <Button
                        type="link"
                        size="small"
                        style={{ padding: 0, height: 'auto', fontSize: 12 }}
                        onClick={handleReset}
                    >
                        清空
                    </Button>
                )}
            </div>

            <Select
                size="small"
                value={op}
                onChange={(v) => setOp(v)}
                options={OP_OPTIONS}
                style={{ width: '100%' }}
                popupMatchSelectWidth={false}
            />

            {!isNoVal && (
                <Input
                    ref={inputRef}
                    size="small"
                    placeholder="输入匹配值..."
                    value={val}
                    onChange={(e) => setVal(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            handleConfirm()
                        }
                    }}
                    allowClear
                />
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 2 }}>
                <Button size="small" onClick={() => setOpen(false)}>
                    取消
                </Button>
                <Button size="small" type="primary" onClick={handleConfirm}>
                    确定
                </Button>
            </div>
        </div>
    )

    const tooltipTitle = isFiltered
        ? `已筛选: ${formatFilterLabel(col, activeFilter)} (点击编辑)`
        : `按 ${col} 筛选`

    return (
        <Popover
            content={content}
            trigger="click"
            open={open}
            onOpenChange={(v) => setOpen(v)}
            placement="bottomLeft"
            arrow={{ pointAtCenter: true }}
            destroyTooltipOnHide
        >
            <Tooltip title={tooltipTitle} mouseEnterDelay={0.4}>
                <span
                    onClick={(e) => {
                        e.stopPropagation()
                        setOpen(!open)
                    }}
                    style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: 18,
                        height: 18,
                        borderRadius: 3,
                        cursor: 'pointer',
                        color: isFiltered ? 'var(--accent, #1677ff)' : 'var(--text-dim, rgba(255, 255, 255, 0.45))',
                        background: isFiltered ? 'rgba(22, 119, 255, 0.12)' : 'transparent',
                        transition: 'all 0.15s ease',
                        marginLeft: 2,
                        flexShrink: 0,
                    }}
                >
                    <Filter size={11} fill={isFiltered ? 'currentColor' : 'none'} />
                </span>
            </Tooltip>
        </Popover>
    )
}
