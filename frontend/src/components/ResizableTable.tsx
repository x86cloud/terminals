import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react'
import s from './ResizableTable.module.less'

export interface ColDef {
    key: string
    label: React.ReactNode
    width?: number
    minWidth?: number
    maxWidth?: number
    resizable?: boolean
    align?: 'left' | 'center' | 'right'
    isPk?: boolean
    isFk?: boolean
    hasFilter?: boolean
}

interface Props {
    cols: ColDef[]
    data?: any[]
    rows?: any[]
    onColResize?: (key: string, newWidth: number) => void
    children: React.ReactNode // <tbody> content
    extraHead?: React.ReactNode // extra content before <tbody>, e.g. new-row rows
    defaultMinWidth?: number
    defaultMaxWidth?: number
    className?: string
    wrapperClassName?: string
    style?: React.CSSProperties
}

const DEFAULT_GLOBAL_MIN_W = 70
const DEFAULT_GLOBAL_MAX_W = 450
const CELL_HORIZONTAL_PADDING = 28 // 10px padding * 2 + border + buffer

let measurementCanvas: HTMLCanvasElement | null = null
let measurementCtx: CanvasRenderingContext2D | null = null

function measureCellTextWidth(text: string, font = '12.5px Consolas, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace'): number {
    if (!text) return 0
    if (typeof window === 'undefined') return text.length * 8
    try {
        if (!measurementCanvas) {
            measurementCanvas = document.createElement('canvas')
            measurementCtx = measurementCanvas.getContext('2d')
        }
        if (measurementCtx) {
            measurementCtx.font = font
            return measurementCtx.measureText(text).width
        }
    } catch {
        /* fallback */
    }
    // 纯字符长度估算降级（中文字符约 12px，英文字符约 8px）
    let est = 0
    for (let i = 0; i < text.length; i++) {
        est += text.charCodeAt(i) > 255 ? 12 : 8
    }
    return est
}

function extractCellValueString(val: any): string {
    if (val === null || val === undefined) return 'NULL'
    if (typeof val === 'object') {
        // e.g. { value: 'abc', isNull: false } in MySQL editable cell
        if ('value' in val && typeof val.value !== 'object') {
            return val.isNull ? 'NULL' : String(val.value ?? '')
        }
        try {
            return JSON.stringify(val)
        } catch {
            return String(val)
        }
    }
    return String(val)
}

/**
 * 根据列名文本长度及表头必要修饰元素（PK角标/FK标签/排序图标/列筛选搜索按钮/单元格内边距）自动计算列宽
 */
export function calcColWidthFromName(
    colName: string,
    options?: {
        isPk?: boolean
        isFk?: boolean
        hasFilter?: boolean
        minWidth?: number
        maxWidth?: number
    }
): number {
    const minW = options?.minWidth ?? (options?.hasFilter ? 95 : DEFAULT_GLOBAL_MIN_W)
    const maxW = options?.maxWidth ?? DEFAULT_GLOBAL_MAX_W

    if (!colName) return minW

    // 测量表头文本实际像素宽度（使用与表头一致的 12px 粗体无衬线字体）
    const textW = measureCellTextWidth(
        colName,
        '600 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
    )

    // 表头基础必需空间：
    // th 左右 padding 20px (10px * 2)
    // 排序按钮宽度与间隙 16px (12px + 4px)
    // 拖拽手柄与子像素渲染安全冗余 14px
    let extraBuffer = 50

    // 若为主键列，pkBadge 左右内边距额外占据 10px (5px * 2)
    if (options?.isPk) {
        extraBuffer += 10
    }

    // 若为外键列，fkBadge 占据约 27px (margin 4px + "FK" 文本约 15px + padding 8px)
    if (options?.isFk) {
        extraBuffer += 27
    }

    // 若包含列筛选/搜索按钮，额外占据 26px (按钮 18px + 间距 4px + 边距与防挤压冗余 4px)
    if (options?.hasFilter) {
        extraBuffer += 26
    }

    const calculatedW = Math.ceil(textW + extraBuffer)
    return Math.min(maxW, Math.max(minW, calculatedW))
}

export function calculateColumnOptimalWidth(
    col: ColDef,
    rows: any[] | undefined,
    defaultMinW = DEFAULT_GLOBAL_MIN_W,
    defaultMaxW = DEFAULT_GLOBAL_MAX_W
): number {
    // 固定的行号列和操作列
    if (col.key === '__rownum__') {
        return col.width || 46
    }
    if (col.key === '__rowact__' || col.key === '__act__') {
        return col.width || 50
    }

    const minW = col.minWidth ?? (col.hasFilter ? 95 : defaultMinW)
    const maxW = col.maxWidth ?? defaultMaxW

    // 1. 基于列名长度自动计算表头宽度
    let maxWFound = 0
    let labelStr = ''
    if (typeof col.label === 'string') {
        labelStr = col.label
    } else if (col.key) {
        labelStr = col.key
    }
    if (labelStr) {
        const headerW = calcColWidthFromName(labelStr, {
            isPk: col.isPk,
            isFk: col.isFk,
            hasFilter: col.hasFilter,
            minWidth: minW,
            maxWidth: maxW,
        })
        maxWFound = Math.max(maxWFound, headerW)
    }

    // 2. 如果包含行数据，采样行数据文本自适应拓宽
    if (rows && rows.length > 0) {
        // Sample up to first 200 rows for high performance
        const sampleCount = Math.min(rows.length, 200)
        for (let i = 0; i < sampleCount; i++) {
            const row = rows[i]
            if (!row) continue
            const rawVal = row[col.key]
            const strVal = extractCellValueString(rawVal)
            if (strVal) {
                // Short-circuit sample length to avoid measuring massive strings
                const sampleLength = Math.min(strVal.length, 120)
                const textW = measureCellTextWidth(strVal.slice(0, sampleLength)) + CELL_HORIZONTAL_PADDING
                if (textW > maxWFound) {
                    maxWFound = textW
                }
                if (maxWFound >= maxW) {
                    maxWFound = maxW
                    break
                }
            }
        }
    }

    // Fallback to col.width if provided and greater than 0, but bound by [minW, maxW]
    if (maxWFound === 0 && col.width && col.width > 0) {
        maxWFound = col.width
    }

    return Math.min(maxW, Math.max(minW, Math.ceil(maxWFound)))
}

export default function ResizableTable({
    cols,
    data,
    rows,
    onColResize,
    children,
    extraHead,
    defaultMinWidth = DEFAULT_GLOBAL_MIN_W,
    defaultMaxWidth = DEFAULT_GLOBAL_MAX_W,
    className,
    wrapperClassName,
    style,
}: Props) {
    const wrapperRef = useRef<HTMLDivElement>(null)
    const [wrapperWidth, setWrapperWidth] = useState<number>(0)
    const [resizingCol, setResizingCol] = useState<{ key: string; width: number } | null>(null)
    const [computedWidths, setComputedWidths] = useState<Record<string, number>>({})
    const manualWidthsRef = useRef<Record<string, number>>({})

    const dragRef = useRef<{
        key: string
        startX: number
        startW: number
        minW: number
        maxW: number
        rafId: number | null
    } | null>(null)

    const effectiveRows = useMemo(() => data ?? rows ?? [], [data, rows])

    const colsKeySignature = useMemo(() => cols.map((c) => c.key).join(','), [cols])
    const prevColsSignatureRef = useRef(colsKeySignature)
    if (prevColsSignatureRef.current !== colsKeySignature) {
        prevColsSignatureRef.current = colsKeySignature
        manualWidthsRef.current = {}
    }

    // Compute optimal widths whenever cols or data changes
    useEffect(() => {
        const newWidths: Record<string, number> = {}
        for (const c of cols) {
            const colMin = c.minWidth ?? (c.hasFilter ? 95 : defaultMinWidth)
            if (manualWidthsRef.current[c.key] !== undefined) {
                newWidths[c.key] = Math.max(colMin, manualWidthsRef.current[c.key])
            } else {
                newWidths[c.key] = calculateColumnOptimalWidth(c, effectiveRows, defaultMinWidth, defaultMaxWidth)
            }
        }
        setComputedWidths(newWidths)
    }, [cols, effectiveRows, defaultMinWidth, defaultMaxWidth])

    useEffect(() => {
        if (!wrapperRef.current) return
        const el = wrapperRef.current
        setWrapperWidth(el.clientWidth)

        const ro = new ResizeObserver((entries) => {
            for (const entry of entries) {
                setWrapperWidth(entry.contentRect.width)
            }
        })
        ro.observe(el)
        return () => ro.disconnect()
    }, [])

    const getColRenderWidth = useCallback(
        (c: ColDef): number => {
            const colMin = c.minWidth ?? (c.hasFilter ? 95 : defaultMinWidth)
            if (resizingCol && resizingCol.key === c.key) {
                return Math.max(colMin, resizingCol.width)
            }
            if (computedWidths[c.key] !== undefined) {
                return Math.max(colMin, computedWidths[c.key])
            }
            if (c.width && c.width > 0) {
                return Math.max(colMin, c.width)
            }
            return colMin
        },
        [resizingCol, computedWidths, defaultMinWidth]
    )

    const startResize = useCallback(
        (e: React.MouseEvent, col: ColDef) => {
            e.preventDefault()
            e.stopPropagation()

            const currentW = getColRenderWidth(col)
            const minW = col.minWidth ?? (col.hasFilter ? 95 : defaultMinWidth)
            const maxW = col.maxWidth ?? defaultMaxWidth
            dragRef.current = {
                key: col.key,
                startX: e.clientX,
                startW: currentW,
                minW,
                maxW,
                rafId: null,
            }
            setResizingCol({ key: col.key, width: currentW })

            const onMove = (me: MouseEvent) => {
                if (!dragRef.current) return
                const delta = me.clientX - dragRef.current.startX
                const newW = Math.min(
                    dragRef.current.maxW,
                    Math.max(dragRef.current.minW, dragRef.current.startW + delta)
                )

                if (dragRef.current.rafId) {
                    cancelAnimationFrame(dragRef.current.rafId)
                }

                dragRef.current.rafId = requestAnimationFrame(() => {
                    if (dragRef.current) {
                        const targetKey = dragRef.current.key
                        manualWidthsRef.current[targetKey] = newW
                        setResizingCol({ key: targetKey, width: newW })
                        setComputedWidths((prev) => ({ ...prev, [targetKey]: newW }))
                        onColResize?.(targetKey, newW)
                    }
                })
            }

            const onUp = () => {
                if (dragRef.current?.rafId) {
                    cancelAnimationFrame(dragRef.current.rafId)
                }
                dragRef.current = null
                setResizingCol(null)
                document.removeEventListener('mousemove', onMove)
                document.removeEventListener('mouseup', onUp)
                document.body.style.cursor = ''
                document.body.style.userSelect = ''
            }

            document.body.style.cursor = 'col-resize'
            document.body.style.userSelect = 'none'
            document.addEventListener('mousemove', onMove)
            document.addEventListener('mouseup', onUp)
        },
        [getColRenderWidth, defaultMinWidth, defaultMaxWidth, onColResize]
    )

    const handleDoubleClick = useCallback(
        (col: ColDef) => {
            // 双击重置为基于当前数据内容自动计算的最佳宽度
            delete manualWidthsRef.current[col.key]
            const optimalW = calculateColumnOptimalWidth(col, effectiveRows, defaultMinWidth, defaultMaxWidth)
            setComputedWidths((prev) => ({ ...prev, [col.key]: optimalW }))
            onColResize?.(col.key, optimalW)
        },
        [effectiveRows, defaultMinWidth, defaultMaxWidth, onColResize]
    )

    const totalWidth = cols.reduce((sum, c) => sum + getColRenderWidth(c), 0)
    const tableWidth = Math.max(totalWidth, wrapperWidth || 0, 1)

    return (
        <div
            ref={wrapperRef}
            className={`${s.tableWrapper}${resizingCol ? ' ' + s.isResizing : ''}${wrapperClassName ? ' ' + wrapperClassName : ''
                }`}
            style={style}
        >
            <table
                className={`${s.table}${className ? ' ' + className : ''}`}
                style={{ width: tableWidth, minWidth: '100%' }}
            >
                <colgroup>
                    {cols.map((col) => {
                        const w = getColRenderWidth(col)
                        return <col key={col.key} style={{ width: w }} />
                    })}
                    <col style={{ width: 'auto' }} />
                </colgroup>
                <thead>
                    <tr>
                        {cols.map((col, idx) => {
                            const isLast = idx === cols.length - 1
                            const isResizable = col.resizable !== false && col.key !== '__act__' && col.key !== '__rowact__'
                            const isResizingThis = resizingCol?.key === col.key
                            const currentW = getColRenderWidth(col)

                            return (
                                <th
                                    key={col.key}
                                    style={{
                                        textAlign: col.align || 'left',
                                    }}
                                    className={`${isResizingThis ? s.thResizing : ''}`}
                                >
                                    <div className={s.thInner} title={typeof col.label === 'string' ? col.label : undefined}>
                                        {col.label}
                                    </div>

                                    {isResizable && !isLast && (
                                        <div
                                            className={`${s.resizeHandle}${isResizingThis ? ' ' + s.activeHandle : ''}`}
                                            onMouseDown={(e) => startResize(e, col)}
                                            onDoubleClick={() => handleDoubleClick(col)}
                                            title="拖动调整列宽，双击自适应最佳宽度"
                                        >
                                            {isResizingThis && (
                                                <div className={s.widthTooltip}>{Math.round(currentW)}px</div>
                                            )}
                                        </div>
                                    )}
                                </th>
                            )
                        })}
                        <th className={s.thFiller} />
                    </tr>
                    {extraHead}
                </thead>
                {children}
            </table>
        </div>
    )
}
