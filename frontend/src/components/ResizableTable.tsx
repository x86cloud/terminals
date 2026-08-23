import React, { useRef, useState, useEffect, useCallback, useMemo, useLayoutEffect } from 'react'
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
    tableKey?: string // 当前数据表唯一标识 (切换数据表时触发重测与重置)
    cols: ColDef[]
    data?: Record<string, any>[] // 表格数据源，用于自动测量各列最宽数据
    onColResize?: (key: string, newWidth: number) => void
    children: React.ReactNode // <tbody> content (and optionally extra <thead> rows)
    extraHead?: React.ReactNode // extra content before <tbody>, e.g. new-row rows
    className?: string
    wrapperClassName?: string
    style?: React.CSSProperties
    autoFit?: boolean // 是否开启最宽内容自适应测量（默认 true）
    maxAutoWidth?: number // 单列自适应最大宽度上限（默认 450px，避免单列无限过宽）
}

// 离屏 Canvas 单例，用于精准、极速测量文字像素宽度
let measurementCanvas: HTMLCanvasElement | null = null
let measurementCtx: CanvasRenderingContext2D | null = null

function measureTextWidth(text: string, font = '12.5px Consolas, monospace'): number {
    if (typeof document === 'undefined') return text.length * 8
    if (!measurementCtx) {
        measurementCanvas = document.createElement('canvas')
        measurementCtx = measurementCanvas.getContext('2d')
    }
    if (measurementCtx) {
        measurementCtx.font = font
        return measurementCtx.measureText(text).width
    }
    // 降级粗略计算：中文字符约 14px，ASCII 字符约 7.8px
    let len = 0
    for (let i = 0; i < text.length; i++) {
        len += text.charCodeAt(i) > 255 ? 14 : 7.8
    }
    return len
}

// 纯函数：同步遍历采样数据与表头，预计算每列的最优理想宽度
function computeIdealColumnWidths(
    cols: ColDef[],
    data?: Record<string, any>[],
    domFallback?: Record<string, number>,
    autoFit = true,
    maxAutoWidth = 450
): Record<string, number> {
    const widths: Record<string, number> = {}

    for (const col of cols) {
        // 特殊操作列固定宽度
        if (col.key === '__rowact__' || col.key === '__act__') {
            widths[col.key] = col.width ?? 50
            continue
        }

        if (!autoFit) {
            widths[col.key] = col.width ?? 120
            continue
        }

        // A. 测量表头宽度
        const headerText = typeof col.label === 'string' ? col.label : col.key
        const headerWidth = measureTextWidth(
            headerText,
            '600 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
        ) + 40 // 包含 padding (20px) + 排序/把手空间 (20px)

        // B. 测量内容中最长单元格 (优先从 data 采样，无 data 时使用 domFallback)
        let maxCellWidth = domFallback?.[col.key] ?? 0
        if (data && data.length > 0) {
            const sampleRows = data.slice(0, 200)
            for (const row of sampleRows) {
                const cellVal = row[col.key]
                let strVal = ''
                if (cellVal === null || cellVal === undefined) {
                    strVal = 'NULL'
                } else if (typeof cellVal === 'object' && cellVal !== null && 'value' in cellVal) {
                    strVal = String(cellVal.value ?? '')
                } else {
                    strVal = String(cellVal)
                }

                // 限制最大测量字符长度，避免超长文本阻塞计算
                if (strVal.length > 120) {
                    strVal = strVal.slice(0, 120)
                }

                const cellW = measureTextWidth(strVal, '12.5px Consolas, monospace') + 26
                if (cellW > maxCellWidth) {
                    maxCellWidth = cellW
                }
            }
        }

        const minW = col.minWidth ?? 60
        const maxW = col.maxWidth ?? maxAutoWidth
        const calculated = Math.max(headerWidth, maxCellWidth, minW)
        // 限制最大宽度，避免单列无限过宽
        widths[col.key] = Math.min(calculated, maxW)
    }

    return widths
}

export default function ResizableTable({
    tableKey,
    cols,
    data,
    onColResize,
    children,
    extraHead,
    className,
    wrapperClassName,
    style,
    autoFit = true,
    maxAutoWidth = 450,
}: Props) {
    const wrapperRef = useRef<HTMLDivElement>(null)
    const tableRef = useRef<HTMLTableElement>(null)
    const [wrapperWidth, setWrapperWidth] = useState<number>(0)
    const [userWidths, setUserWidths] = useState<Record<string, number>>({})
    const [domWidths, setDomWidths] = useState<Record<string, number>>({})
    const [resizingCol, setResizingCol] = useState<{ key: string; width: number } | null>(null)

    const colsSignature = cols.map((c) => c.key).join(',')
    const currentTableKey = `${tableKey ?? ''}::${colsSignature}`

    // 锁定每张表的列宽状态，避免输入/草稿变更时反复跳动
    const [lockedIdealWidths, setLockedIdealWidths] = useState<Record<string, number>>(() =>
        computeIdealColumnWidths(cols, data, undefined, autoFit, maxAutoWidth)
    )

    const lastMeasuredKeyRef = useRef<string>(currentTableKey)
    const hasDataRef = useRef<boolean>(Boolean(data && data.length > 0))

    // 监听外层容器尺寸变化
    useLayoutEffect(() => {
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

    // 监听表切换或数据初次加载：同步重新遍历数据计算宽度，之后锁定稳定列宽
    useEffect(() => {
        const tableChanged = lastMeasuredKeyRef.current !== currentTableKey
        const firstDataArrival = !hasDataRef.current && Boolean(data && data.length > 0)

        if (tableChanged || firstDataArrival) {
            lastMeasuredKeyRef.current = currentTableKey
            hasDataRef.current = Boolean(data && data.length > 0)
            if (tableChanged) {
                setUserWidths({})
            }
            const newIdeal = computeIdealColumnWidths(cols, data, domWidths, autoFit, maxAutoWidth)
            setLockedIdealWidths(newIdeal)
        }
    }, [currentTableKey, data, cols, domWidths, autoFit, maxAutoWidth])

    // 如果未传入 data 属性，自动在挂载/更新后通过 DOM 读取前 50 行单元格计算最宽宽度作为回退
    useEffect(() => {
        if (data && data.length > 0) return
        if (!tableRef.current || !autoFit) return

        const trs = tableRef.current.querySelectorAll('tbody tr')
        if (trs.length === 0) return

        const measured: Record<string, number> = {}
        const sampleRows = Array.from(trs).slice(0, 50)

        cols.forEach((col, colIdx) => {
            if (col.key === '__rowact__' || col.key === '__act__') return
            let maxW = 0
            for (const tr of sampleRows) {
                const td = tr.children[colIdx] as HTMLElement
                if (td) {
                    const text = td.innerText || td.textContent || ''
                    const w = measureTextWidth(text.trim().slice(0, 120), '12.5px Consolas, monospace') + 26
                    if (w > maxW) maxW = w
                }
            }
            if (maxW > 0) {
                measured[col.key] = maxW
            }
        })

        setDomWidths(measured)
        setLockedIdealWidths((prev) => ({
            ...prev,
            ...computeIdealColumnWidths(cols, data, measured, autoFit, maxAutoWidth),
        }))
    }, [data, cols, children, autoFit, maxAutoWidth])

    const dragRef = useRef<{
        key: string
        startX: number
        startW: number
        minW: number
        maxW: number
        rafId: number | null
    } | null>(null)

    // 计算各列最终渲染宽度：若总宽小于容器，按比例自适应弹性拉伸填满右侧留白
    const computedColWidths = useMemo(() => {
        const baseWidths: Record<string, number> = {}
        let totalBaseWidth = 0
        let elasticTotal = 0

        for (const col of cols) {
            const isActionCol = col.key === '__rowact__' || col.key === '__act__'
            const isUserResized = userWidths[col.key] !== undefined
            const baseW = isUserResized
                ? userWidths[col.key]
                : (col.width && col.width !== 120 ? col.width : (lockedIdealWidths[col.key] ?? 120))

            baseWidths[col.key] = baseW
            totalBaseWidth += baseW

            if (!isActionCol && !isUserResized) {
                elasticTotal += baseW
            }
        }

        // 如果容器有剩余空间（如图中右侧空白），按比例分配剩余宽度
        const finalWidths: Record<string, number> = { ...baseWidths }
        const availableExtra = (wrapperWidth || 0) - totalBaseWidth - 2 // 减去边框预留

        if (availableExtra > 0 && elasticTotal > 0) {
            for (const col of cols) {
                const isActionCol = col.key === '__rowact__' || col.key === '__act__'
                const isUserResized = userWidths[col.key] !== undefined
                if (!isActionCol && !isUserResized) {
                    const share = Math.floor(availableExtra * (baseWidths[col.key] / elasticTotal))
                    const maxW = col.maxWidth ?? maxAutoWidth
                    // 容器弹性拉伸时也遵循最大上限控制，防止过度膨胀
                    finalWidths[col.key] = Math.min(baseWidths[col.key] + share, maxW + 100)
                }
            }
        }

        return finalWidths
    }, [cols, lockedIdealWidths, userWidths, wrapperWidth, maxAutoWidth])

    // 启动拖拽列宽
    const startResize = useCallback(
        (e: React.MouseEvent, col: ColDef, currentRenderWidth: number) => {
            e.preventDefault()
            e.stopPropagation()

            const minW = col.minWidth ?? 40
            const maxW = col.maxWidth ?? 1600
            dragRef.current = {
                key: col.key,
                startX: e.clientX,
                startW: currentRenderWidth,
                minW,
                maxW,
                rafId: null,
            }
            setResizingCol({ key: col.key, width: currentRenderWidth })

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
                        setResizingCol({ key: dragRef.current.key, width: newW })
                        setUserWidths((prev) => ({ ...prev, [dragRef.current!.key]: newW }))
                        onColResize?.(dragRef.current.key, newW)
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
        [onColResize]
    )

    // 双击恢复自适应最宽内容宽度
    const handleDoubleClick = useCallback(
        (col: ColDef) => {
            setUserWidths((prev) => {
                const next = { ...prev }
                delete next[col.key]
                return next
            })
            const resetW = lockedIdealWidths[col.key] ?? Math.max(col.minWidth ?? 80, 140)
            onColResize?.(col.key, resetW)
        },
        [lockedIdealWidths, onColResize]
    )

    const totalWidth = cols.reduce(
        (sum, c) => sum + (resizingCol?.key === c.key ? resizingCol.width : (computedColWidths[c.key] ?? 100)),
        0
    )
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
                ref={tableRef}
                className={`${s.table}${className ? ' ' + className : ''}`}
                style={{ width: tableWidth, minWidth: '100%' }}
            >
                <colgroup>
                    {cols.map((col) => {
                        const w = resizingCol?.key === col.key ? resizingCol.width : (computedColWidths[col.key] ?? 100)
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
                            const currentW = isResizingThis
                                ? resizingCol.width
                                : (computedColWidths[col.key] ?? 100)

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
                                            onMouseDown={(e) => startResize(e, col, currentW)}
                                            onDoubleClick={() => handleDoubleClick(col)}
                                            title="拖动调整列宽，双击恢复最宽内容自适应"
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
