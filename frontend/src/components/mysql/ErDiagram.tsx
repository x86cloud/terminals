import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react'
import Icon from '../Icon'
import g from '../../styles/global.module.less'
import my from './ErDiagram.module.less'
import sh from './mysqlShared.module.less'
import {Schema} from './mysqlTypes'

export default function ErDiagram({
    schema,
    busy,
}: {
    schema: Schema
    busy: boolean
}) {
    const canvasRef = useRef<HTMLDivElement>(null)
    const [scale, setScale] = useState(1)
    const [pan, setPan] = useState<{x: number; y: number}>({x: 0, y: 0})
    const [isDragging, setIsDragging] = useState(false)
    const [hoveredTable, setHoveredTable] = useState<string | null>(null)
    const [isFullscreen, setIsFullscreen] = useState(false)

    const dragStartRef = useRef<{x: number; y: number}>({x: 0, y: 0})
    const panStartRef = useRef<{x: number; y: number}>({x: 0, y: 0})

    const ER = useMemo(() => {
        const colH = 20
        const gapX = 50
        const gapY = 46
        const charW = 7.5
        const padW = 24
        const n = schema.tables.length
        if (n === 0) return {positions: {}, svgW: 0, svgH: 0, tblW: 160}

        let maxLineLen = 0
        schema.tables.forEach((t) => {
            maxLineLen = Math.max(maxLineLen, String(t.name).length)
            t.columns.forEach((c: any) => {
                const label = `${c.key === 'PRI' ? '🔑 ' : ''}${c.name} ${c.type}`
                maxLineLen = Math.max(maxLineLen, label.length)
            })
        })
        const tblW = Math.max(170, maxLineLen * charW + padW)

        // 动态计算合理的网格列数
        let cols = 4
        if (n <= 2) cols = 2
        else if (n <= 6) cols = 3
        else if (n <= 16) cols = 4
        else cols = 5

        const positions: Record<string, {x: number; y: number; h: number}> = {}
        let x = 0
        let y = 0
        let rowBottom = 0
        let contentRight = 0
        let contentBottom = 0

        schema.tables.forEach((t, i) => {
            const h = 22 + 14 + t.columns.length * colH + 10
            positions[t.name] = {x, y, h}
            rowBottom = Math.max(rowBottom, y + h)
            contentRight = Math.max(contentRight, x + tblW)
            contentBottom = Math.max(contentBottom, y + h)
            x += tblW + gapX
            if ((i + 1) % cols === 0) {
                x = 0
                y = rowBottom + gapY
                rowBottom = 0
            }
        })

        const svgW = contentRight
        const svgH = contentBottom
        return {positions, svgW, svgH, tblW}
    }, [schema])

    // 智能计算合适比例并居中展示 ER 图
    const autoFit = useCallback(() => {
        if (!canvasRef.current || ER.svgW === 0 || ER.svgH === 0) return
        const rect = canvasRef.current.getBoundingClientRect()
        const containerW = rect.width - 40
        const containerH = rect.height - 40
        if (containerW <= 0 || containerH <= 0) return

        const scaleX = containerW / ER.svgW
        const scaleY = containerH / ER.svgH
        const fitScale = Math.min(Math.min(scaleX, scaleY), 1.2)
        const finalScale = Math.max(0.25, +(fitScale.toFixed(2)))

        const fitX = (rect.width - ER.svgW * finalScale) / 2
        const fitY = (rect.height - ER.svgH * finalScale) / 2

        setScale(finalScale)
        setPan({x: Math.max(10, fitX), y: Math.max(10, fitY)})
    }, [ER.svgW, ER.svgH])

    useEffect(() => {
        autoFit()
    }, [autoFit])

    // 切换全屏时延迟重新自适应居中
    useEffect(() => {
        const timer = setTimeout(() => autoFit(), 50)
        return () => clearTimeout(timer)
    }, [isFullscreen, autoFit])

    // 按 Esc 键退出全屏
    useEffect(() => {
        if (!isFullscreen) return
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setIsFullscreen(false)
            }
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [isFullscreen])

    // 监听容器 Resize 事件
    useEffect(() => {
        const el = canvasRef.current
        if (!el || typeof ResizeObserver === 'undefined') return
        const ro = new ResizeObserver(() => {
            autoFit()
        })
        ro.observe(el)
        return () => ro.disconnect()
    }, [autoFit])

    const handleMouseDown = (e: React.MouseEvent) => {
        if (e.button !== 0) return
        setIsDragging(true)
        dragStartRef.current = {x: e.clientX, y: e.clientY}
        panStartRef.current = {...pan}
    }

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!isDragging) return
        const dx = e.clientX - dragStartRef.current.x
        const dy = e.clientY - dragStartRef.current.y
        setPan({
            x: panStartRef.current.x + dx,
            y: panStartRef.current.y + dy,
        })
    }

    const handleMouseUp = () => setIsDragging(false)

    const handleWheel = (e: React.WheelEvent) => {
        e.preventDefault()
        const delta = e.deltaY > 0 ? -0.06 : 0.06
        const nextScale = Math.max(0.2, Math.min(3, +(scale + delta).toFixed(2)))
        if (canvasRef.current) {
            const rect = canvasRef.current.getBoundingClientRect()
            const mouseX = e.clientX - rect.left
            const mouseY = e.clientY - rect.top
            const ratio = nextScale / scale
            setPan({
                x: mouseX - (mouseX - pan.x) * ratio,
                y: mouseY - (mouseY - pan.y) * ratio,
            })
        }
        setScale(nextScale)
    }

    const activeTables = useMemo(() => {
        if (!hoveredTable) return null
        const set = new Set<string>([hoveredTable])
        schema.foreignKeys.forEach((fk) => {
            if (fk.fromTable === hoveredTable) set.add(fk.toTable)
            if (fk.toTable === hoveredTable) set.add(fk.fromTable)
        })
        return set
    }, [hoveredTable, schema.foreignKeys])

    return (
        <div className={`${my.erWrap} ${isFullscreen ? my.fullscreen : ''}`}>
            <div className={my.erToolBar}>
                <button
                    className={my.erZoomBtn}
                    title="缩小"
                    onClick={() => setScale((s) => Math.max(0.2, +(s - 0.1).toFixed(2)))}
                >
                    −
                </button>
                <span className={my.erZoomVal}>{Math.round(scale * 100)}%</span>
                <button
                    className={my.erZoomBtn}
                    title="放大"
                    onClick={() => setScale((s) => Math.min(3, +(s + 0.1).toFixed(2)))}
                >
                    +
                </button>
                <button
                    className={`${g.btn} ${g.xs}`}
                    title="1:1 原始比例"
                    onClick={() => setScale(1)}
                >
                    100%
                </button>
                <button
                    className={`${g.btn} ${g.xs} ${g.primary}`}
                    title="适应视口居中展示"
                    onClick={autoFit}
                >
                    <Icon name="panel" size={12} /> 适应画布
                </button>
                <button
                    className={`${g.btn} ${g.xs} ${isFullscreen ? g.danger : ''}`}
                    title={isFullscreen ? '退出全屏 (Esc)' : '全屏沉浸展示'}
                    onClick={() => setIsFullscreen((v) => !v)}
                >
                    <Icon name={isFullscreen ? 'close' : 'panel'} size={12} /> {isFullscreen ? '退出全屏' : '全屏'}
                </button>
                <span className={g.spacer} />
                <span className={my.erHint}>
                    {isFullscreen
                        ? '按 Esc 键或点击按钮退出全屏'
                        : '提示：按住鼠标左键可拖拽平移，滚轮/按钮控制缩放，悬停数据表高亮关系链'}
                </span>
            </div>

            {schema.tables.length === 0 ? (
                <div className={`${sh.mysqlEmpty}`}>{busy ? '加载中…' : '该数据库暂无表'}</div>
            ) : (
                <div
                    ref={canvasRef}
                    className={`${my.erCanvas} ${isDragging ? my.dragging : ''}`}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                    onWheel={handleWheel}
                >
                    <svg
                        className={my.erSvg}
                        width={ER.svgW}
                        height={ER.svgH}
                        style={{
                            transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
                            transformOrigin: '0 0',
                        }}
                    >
                        {schema.foreignKeys.map((fk, i) => {
                            const from = ER.positions[fk.fromTable]
                            const to = ER.positions[fk.toTable]
                            if (!from || !to) return null
                            const x1 = from.x + ER.tblW
                            const y1 = from.y + from.h / 2
                            const x2 = to.x
                            const y2 = to.y + to.h / 2
                            const isHighlighted =
                                hoveredTable && (fk.fromTable === hoveredTable || fk.toTable === hoveredTable)
                            const isDimmed = hoveredTable && !isHighlighted
                            return (
                                <path
                                    key={i}
                                    d={`M ${x1} ${y1} C ${(x1 + x2) / 2} ${y1}, ${(x1 + x2) / 2} ${y2}, ${x2} ${y2}`}
                                    className={`${my.fkPath} ${isHighlighted ? my.highlighted : ''} ${
                                        isDimmed ? my.dimmed : ''
                                    }`}
                                />
                            )
                        })}
                        {schema.tables.map((t) => {
                            const pos = ER.positions[t.name]
                            if (!pos) return null
                            const isHighlighted = activeTables ? activeTables.has(t.name) : false
                            const isDimmed = activeTables ? !activeTables.has(t.name) : false
                            return (
                                <g
                                    key={t.name}
                                    transform={`translate(${pos.x}, ${pos.y})`}
                                    className={`${my.erTableGroup} ${isHighlighted ? my.highlighted : ''} ${
                                        isDimmed ? my.dimmed : ''
                                    }`}
                                    onMouseEnter={() => setHoveredTable(t.name)}
                                    onMouseLeave={() => setHoveredTable(null)}
                                >
                                    <rect width={ER.tblW} height={pos.h} rx={5} className={my.erTable} />
                                    <rect width={ER.tblW} height={22} rx={5} className={my.erTableHead} />
                                    <text x={8} y={15} className={my.erTableName}>
                                        <title>{t.name}</title>
                                        {t.name}
                                    </text>
                                    {t.columns.map((c: any, ci: number) => (
                                        <text key={ci} x={8} y={22 + 14 + ci * 18} className={my.erCol}>
                                            <title>{`${c.key === 'PRI' ? '🔑 ' : ''}${c.name} ${c.type}`}</title>
                                            {c.key === 'PRI' ? '🔑 ' : ''}
                                            {c.name} <tspan className={my.erType}>{c.type}</tspan>
                                        </text>
                                    ))}
                                </g>
                            )
                        })}
                    </svg>
                </div>
            )}
        </div>
    )
}
