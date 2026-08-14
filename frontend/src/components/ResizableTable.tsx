import React, { useRef, useState, useEffect, useCallback } from 'react'
import s from './ResizableTable.module.less'

export interface ColDef {
    key: string
    label: React.ReactNode
    width: number
    minWidth?: number
    maxWidth?: number
    resizable?: boolean
    align?: 'left' | 'center' | 'right'
}

interface Props {
    cols: ColDef[]
    onColResize: (key: string, newWidth: number) => void
    children: React.ReactNode // <tbody> content (and optionally extra <thead> rows)
    extraHead?: React.ReactNode // extra content before <tbody>, e.g. new-row rows
    className?: string
    wrapperClassName?: string
    style?: React.CSSProperties
}

export default function ResizableTable({
    cols,
    onColResize,
    children,
    extraHead,
    className,
    wrapperClassName,
    style,
}: Props) {
    const wrapperRef = useRef<HTMLDivElement>(null)
    const [wrapperWidth, setWrapperWidth] = useState<number>(0)
    const [resizingCol, setResizingCol] = useState<{ key: string; width: number } | null>(null)
    const dragRef = useRef<{
        key: string
        startX: number
        startW: number
        minW: number
        maxW: number
        rafId: number | null
    } | null>(null)

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

    const startResize = useCallback(
        (e: React.MouseEvent, col: ColDef) => {
            e.preventDefault()
            e.stopPropagation()

            const minW = col.minWidth ?? 40
            const maxW = col.maxWidth ?? 1600
            dragRef.current = {
                key: col.key,
                startX: e.clientX,
                startW: col.width,
                minW,
                maxW,
                rafId: null,
            }
            setResizingCol({ key: col.key, width: col.width })

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
                        onColResize(dragRef.current.key, newW)
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

    const handleDoubleClick = useCallback(
        (col: ColDef) => {
            // 双击重置为合理默认宽度
            const resetW = Math.max(col.minWidth ?? 80, 160)
            onColResize(col.key, resetW)
        },
        [onColResize]
    )

    const totalWidth = cols.reduce((sum, c) => sum + (resizingCol?.key === c.key ? resizingCol.width : c.width), 0)
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
                        const w = resizingCol?.key === col.key ? resizingCol.width : col.width
                        return <col key={col.key} style={{ width: w }} />
                    })}
                    <col style={{ width: 'auto' }} />
                </colgroup>
                <thead>
                    <tr>
                        {cols.map((col, idx) => {
                            const isLast = idx === cols.length - 1
                            const isResizable = col.resizable !== false && col.key !== '__act__'
                            const isResizingThis = resizingCol?.key === col.key
                            const currentW = isResizingThis ? resizingCol.width : col.width

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
                                            title="拖动调整列宽，双击恢复默认"
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
