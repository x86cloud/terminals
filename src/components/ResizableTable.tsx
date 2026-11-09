import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import s from './ResizableTable.module.less'

export interface ColDef {
    key: string
    label: React.ReactNode
    width?: number
    minWidth?: number
    maxWidth?: number
    resizable?: boolean
    autoExpand?: boolean // 是否参与未占满 100% 时的自动等额放大，默认为 true（排除特殊固定列）
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
    fillContainer?: boolean // 未占满 100% 时是否平均扩大各数据列铺满容器，默认为 true
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
 * 判断列是否可参与 100% 自动均分扩展
 */
export function isExpandableCol(col: ColDef): boolean {
    if (col.autoExpand === false) return false
    if (col.resizable === false) return false
    if (col.key === '__rownum__' || col.key === '__rowact__' || col.key === '__act__') return false
    return true
}

/**
 * 根据列名文本长度及表头必要修饰元素自动计算列宽
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

    const textW = measureCellTextWidth(
        colName,
        '600 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
    )

    let extraBuffer = 50
    if (options?.isPk) extraBuffer += 10
    if (options?.isFk) extraBuffer += 27
    if (options?.hasFilter) extraBuffer += 26

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

    if (rows && rows.length > 0) {
        const sampleCount = Math.min(rows.length, 200)
        for (let i = 0; i < sampleCount; i++) {
            const row = rows[i]
            if (!row) continue
            const rawVal = row[col.key]
            const strVal = extractCellValueString(rawVal)
            if (strVal) {
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
    fillContainer = true,
}: Props) {
    const { t } = useTranslation('common')
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
        cleanup?: () => void
    } | null>(null)

    useEffect(() => {
        return () => {
            if (dragRef.current?.rafId) {
                cancelAnimationFrame(dragRef.current.rafId)
            }
            dragRef.current?.cleanup?.()
            document.body.style.cursor = ''
            document.body.style.userSelect = ''
        }
    }, [])

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

        const ro = new ResizeObserver(() => {
            if (wrapperRef.current) {
                setWrapperWidth(wrapperRef.current.clientWidth)
            }
        })
        ro.observe(el)
        return () => ro.disconnect()
    }, [])

    const getBaseWidth = useCallback(
        (c: ColDef): number => {
            const colMin = c.minWidth ?? (c.hasFilter ? 95 : defaultMinWidth)
            const colMax = c.maxWidth ?? defaultMaxWidth
            if (resizingCol && resizingCol.key === c.key) {
                return Math.min(colMax, Math.max(colMin, resizingCol.width))
            }
            if (manualWidthsRef.current[c.key] !== undefined) {
                return Math.min(colMax, Math.max(colMin, manualWidthsRef.current[c.key]))
            }
            if (computedWidths[c.key] !== undefined) {
                return Math.min(colMax, Math.max(colMin, computedWidths[c.key]))
            }
            if (c.width && c.width > 0) {
                return Math.min(colMax, Math.max(colMin, c.width))
            }
            return colMin
        },
        [resizingCol, computedWidths, defaultMinWidth, defaultMaxWidth]
    )

    const renderWidths = useMemo<Record<string, number>>(() => {
        const baseMap: Record<string, number> = {}
        let totalBase = 0
        for (const col of cols) {
            const bw = getBaseWidth(col)
            baseMap[col.key] = bw
            totalBase += bw
        }

        if (!fillContainer || !wrapperWidth || totalBase >= wrapperWidth) {
            return baseMap
        }

        const remaining = wrapperWidth - totalBase
        const expandable = cols.filter(isExpandableCol)
        if (expandable.length === 0) {
            return baseMap
        }

        // 联动吸收模式（正在拖拽某一列时）
        if (resizingCol) {
            const resizingKey = resizingCol.key
            const targetCol = cols.find((c) => c.key === resizingKey)
            const isResizingExpandable = targetCol && isExpandableCol(targetCol)

            if (isResizingExpandable) {
                const targetW = baseMap[resizingKey]
                const fixedTotal = cols
                    .filter((c) => !isExpandableCol(c))
                    .reduce((sum, c) => sum + baseMap[c.key], 0)

                const otherExpandable = expandable.filter((c) => c.key !== resizingKey)
                if (otherExpandable.length > 0) {
                    const remainingForOthers = wrapperWidth - fixedTotal - targetW
                    const minOthers = otherExpandable.reduce(
                        (sum, c) => sum + (c.minWidth ?? (c.hasFilter ? 95 : defaultMinWidth)),
                        0
                    )

                    const result: Record<string, number> = { ...baseMap }
                    result[resizingKey] = targetW

                    if (remainingForOthers >= minOthers) {
                        const extraPool = remainingForOthers - minOthers
                        const perCol = Math.floor(extraPool / otherExpandable.length)
                        const remainder = extraPool % otherExpandable.length

                        otherExpandable.forEach((col, idx) => {
                            const minW = col.minWidth ?? (col.hasFilter ? 95 : defaultMinWidth)
                            const extra = perCol + (idx === otherExpandable.length - 1 ? remainder : 0)
                            result[col.key] = minW + extra
                        })
                        return result
                    } else {
                        otherExpandable.forEach((col) => {
                            result[col.key] = col.minWidth ?? (col.hasFilter ? 95 : defaultMinWidth)
                        })
                        return result
                    }
                }
            }
        }

        // 常态展示：所有可扩展列均摊剩余空间
        const perCol = Math.floor(remaining / expandable.length)
        const remainder = remaining % expandable.length

        const result: Record<string, number> = { ...baseMap }
        expandable.forEach((col, idx) => {
            const extra = perCol + (idx === expandable.length - 1 ? remainder : 0)
            result[col.key] = baseMap[col.key] + extra
        })
        return result
    }, [cols, getBaseWidth, fillContainer, wrapperWidth, resizingCol, defaultMinWidth])

    const latestRenderWidthsRef = useRef(renderWidths)
    latestRenderWidthsRef.current = renderWidths

    const startResize = useCallback(
        (e: React.MouseEvent, col: ColDef) => {
            e.preventDefault()
            e.stopPropagation()

            const currentW = renderWidths[col.key] ?? getBaseWidth(col)
            const minW = col.minWidth ?? (col.hasFilter ? 95 : defaultMinWidth)
            const maxW = col.maxWidth ?? defaultMaxWidth
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
                        setResizingCol({ key: targetKey, width: newW })
                    }
                })
            }

            const cleanup = () => {
                document.removeEventListener('mousemove', onMove)
                document.removeEventListener('mouseup', onUp)
            }

            const onUp = () => {
                if (dragRef.current?.rafId) {
                    cancelAnimationFrame(dragRef.current.rafId)
                }
                if (dragRef.current) {
                    const targetKey = dragRef.current.key
                    const finalRenderWidths = latestRenderWidthsRef.current
                    const targetCol = cols.find((c) => c.key === targetKey)
                    for (const c of cols) {
                        if (isExpandableCol(c) && finalRenderWidths[c.key] !== undefined) {
                            manualWidthsRef.current[c.key] = finalRenderWidths[c.key]
                        }
                    }
                    if (targetCol && !isExpandableCol(targetCol)) {
                        manualWidthsRef.current[targetKey] = finalRenderWidths[targetKey]
                    }
                    setComputedWidths((prev) => ({ ...prev, ...finalRenderWidths }))
                    onColResize?.(targetKey, finalRenderWidths[targetKey])
                }
                dragRef.current = null
                setResizingCol(null)
                cleanup()
                document.body.style.cursor = ''
                document.body.style.userSelect = ''
            }

            dragRef.current = {
                key: col.key,
                startX: e.clientX,
                startW: currentW,
                minW,
                maxW,
                rafId: null,
                cleanup,
            }
            setResizingCol({ key: col.key, width: currentW })

            document.body.style.cursor = 'col-resize'
            document.body.style.userSelect = 'none'
            document.addEventListener('mousemove', onMove)
            document.addEventListener('mouseup', onUp)
        },
        [renderWidths, getBaseWidth, cols, defaultMinWidth, defaultMaxWidth, onColResize]
    )

    const handleDoubleClick = useCallback(
        (col: ColDef) => {
            delete manualWidthsRef.current[col.key]
            const optimalW = calculateColumnOptimalWidth(col, effectiveRows, defaultMinWidth, defaultMaxWidth)
            setComputedWidths((prev) => ({ ...prev, [col.key]: optimalW }))
            onColResize?.(col.key, optimalW)
        },
        [effectiveRows, defaultMinWidth, defaultMaxWidth, onColResize]
    )

    const totalRenderWidth = cols.reduce((sum, c) => sum + (renderWidths[c.key] ?? getBaseWidth(c)), 0)
    const tableWidth = Math.max(totalRenderWidth, wrapperWidth || 0, 1)
    const showFiller = !fillContainer && totalRenderWidth < (wrapperWidth || 0)

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
                        const w = renderWidths[col.key] ?? getBaseWidth(col)
                        return <col key={col.key} style={{ width: w }} />
                    })}
                    {showFiller && <col style={{ width: 'auto' }} />}
                </colgroup>
                <thead>
                    <tr>
                        {cols.map((col, idx) => {
                            const isLast = idx === cols.length - 1
                            const isResizable = col.resizable !== false && col.key !== '__act__' && col.key !== '__rowact__'
                            const isResizingThis = resizingCol?.key === col.key
                            const currentW = renderWidths[col.key] ?? getBaseWidth(col)

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
                                            title={t('resizeColTooltip', '拖动调整列宽，双击自适应最佳宽度')}
                                        >
                                            {isResizingThis && (
                                                <div className={s.widthTooltip}>{Math.round(currentW)}px</div>
                                            )}
                                        </div>
                                    )}
                                </th>
                            )
                        })}
                        {showFiller && <th className={s.thFiller} />}
                    </tr>
                    {extraHead}
                </thead>
                {children}
            </table>
        </div>
    )
}
