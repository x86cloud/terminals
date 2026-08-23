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

const DEFAULT_GLOBAL_MIN_W = 80
const DEFAULT_GLOBAL_MAX_W = 450
const CELL_HORIZONTAL_PADDING = 28 // 10px padding * 2 + border + buffer
const HEADER_EXTRA_BUFFER = 28     // padding + potential sort icon / PK badge

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
    return text.length * 8
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

export function calculateColumnOptimalWidth(
    col: ColDef,
    rows: any[] | undefined,
    defaultMinW = DEFAULT_GLOBAL_MIN_W,
    defaultMaxW = DEFAULT_GLOBAL_MAX_W
): number {
    // Action column fixed width
    if (col.key === '__rowact__' || col.key === '__act__') {
        return col.width || 50
    }

    const minW = col.minWidth ?? defaultMinW
    const maxW = col.maxWidth ?? defaultMaxW

    // 1. Measure header label
    let maxWFound = 0
    let labelStr = ''
    if (typeof col.label === 'string') {
        labelStr = col.label
    } else if (col.key) {
        labelStr = col.key
    }
    if (labelStr) {
        const headerW = measureCellTextWidth(labelStr, 'bold 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif') + HEADER_EXTRA_BUFFER
        maxWFound = Math.max(maxWFound, headerW)
    }

    // 2. Measure rows data
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

    // Compute optimal widths whenever cols or data changes
    useEffect(() => {
        const newWidths: Record<string, number> = {}
        for (const c of cols) {
            if (manualWidthsRef.current[c.key] !== undefined) {
                newWidths[c.key] = manualWidthsRef.current[c.key]
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
            if (resizingCol && resizingCol.key === c.key) {
                return resizingCol.width
            }
            if (computedWidths[c.key] !== undefined) {
                return computedWidths[c.key]
            }
            if (c.width && c.width > 0) {
                return c.width
            }
            return defaultMinWidth
        },
        [resizingCol, computedWidths, defaultMinWidth]
    )

    const startResize = useCallback(
        (e: React.MouseEvent, col: ColDef) => {
            e.preventDefault()
            e.stopPropagation()

            const currentW = getColRenderWidth(col)
            const minW = col.minWidth ?? defaultMinWidth
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
            className={`${s.tableWrapper}${resizingCol ? ' ' + s.isResizing : ''}${
                wrapperClassName ? ' ' + wrapperClassName : ''
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
