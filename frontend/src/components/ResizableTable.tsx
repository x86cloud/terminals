import React, {useRef, useCallback} from 'react'
import s from './ResizableTable.module.less'

export interface ColDef {
    key: string
    label: React.ReactNode
    width: number
    minWidth?: number
}

interface Props {
    cols: ColDef[]
    onColResize: (key: string, newWidth: number) => void
    children: React.ReactNode   // <tbody> content (and optionally extra <thead> rows)
    extraHead?: React.ReactNode // extra content before <tbody>, e.g. new-row rows
    className?: string
    wrapperClassName?: string
}

export default function ResizableTable({cols, onColResize, children, extraHead, className, wrapperClassName}: Props) {
    const dragRef = useRef<{ key: string; startX: number; startW: number } | null>(null)

    const startResize = useCallback((e: React.MouseEvent, col: ColDef) => {
        e.preventDefault()
        e.stopPropagation()
        dragRef.current = {key: col.key, startX: e.clientX, startW: col.width}

        const onMove = (me: MouseEvent) => {
            if (!dragRef.current) return
            const delta = me.clientX - dragRef.current.startX
            const newW = Math.max(col.minWidth ?? 50, dragRef.current.startW + delta)
            onColResize(dragRef.current.key, newW)
        }

        const onUp = () => {
            dragRef.current = null
            document.removeEventListener('mousemove', onMove)
            document.removeEventListener('mouseup', onUp)
            document.body.style.cursor = ''
            document.body.style.userSelect = ''
        }

        document.body.style.cursor = 'col-resize'
        document.body.style.userSelect = 'none'
        document.addEventListener('mousemove', onMove)
        document.addEventListener('mouseup', onUp)
    }, [onColResize])

    const totalWidth = cols.reduce((sum, c) => sum + c.width, 0)

    return (
        <div className={`${s.tableWrapper}${wrapperClassName ? ' ' + wrapperClassName : ''}`}>
            <table
                className={`${s.table}${className ? ' ' + className : ''}`}
                style={{width: totalWidth}}
            >
                <colgroup>
                    {cols.map((col) => (
                        <col key={col.key} style={{width: col.width}}/>
                    ))}
                </colgroup>
                <thead>
                <tr>
                    {cols.map((col) => (
                        <th key={col.key}>
                            <div className={s.thInner}>{col.label}</div>
                            <div
                                className={s.resizeHandle}
                                onMouseDown={(e) => startResize(e, col)}
                            />
                        </th>
                    ))}
                </tr>
                {extraHead}
                </thead>
                {children}
            </table>
        </div>
    )
}
