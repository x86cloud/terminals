import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button, Tooltip } from 'antd'
import { Maximize2, Minimize2, PanelLeft } from 'lucide-react'
import g from '@/styles/global.module.less'
import my from '@/pages/mysql/ErDiagram.module.less'
import sh from '@/pages/mysql/mysqlShared.module.less'
import { Schema } from '@/pages/mysql/mysqlTypes'

export default function ErDiagram({
    schema,
    busy,
}: {
    schema: Schema
    busy: boolean
}) {
    const canvasRef = useRef<HTMLDivElement>(null)
    const [scale, setScale] = useState(1)
    const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
    const [isDragging, setIsDragging] = useState(false)
    const [isFullscreen, setIsFullscreen] = useState(false)

    const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 })
    const panStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 })

    const ER = useMemo(() => {
        const colH = 20
        const gapX = 50
        const gapY = 46
        const charW = 7.5
        const padW = 24
        const n = schema.tables.length
        if (n === 0) return { positions: {}, svgW: 0, svgH: 0, tblW: 160 }

        let maxLineLen = 0
        let totalH = 0
        schema.tables.forEach((t) => {
            maxLineLen = Math.max(maxLineLen, String(t.name).length)
            const h = 22 + 14 + t.columns.length * colH + 10
            totalH += h
            t.columns.forEach((c: any) => {
                const label = `${c.key === 'PRI' ? '🔑 ' : ''}${c.name} ${c.type}`
                maxLineLen = Math.max(maxLineLen, label.length)
            })
        })

        // 限制单个表卡片的最大宽度在 180px ~ 280px 之间，防止超长字段/类型无限制拉宽整个画布
        const tblW = Math.min(280, Math.max(180, maxLineLen * charW + padW))
        const avgH = totalH / n

        // 根据 16:9 / 16:10 显示器比例（~1.6），结合平均表高度智能推导最优质的网格矩阵列数
        // 使得生成的全图宽高比趋近视口比例，防止多表时高度被压缩、宽度被拉得过宽
        const targetRatio = 1.6
        let cols = Math.max(2, Math.round(Math.sqrt((n * avgH * targetRatio) / tblW)))
        if (n <= 2) cols = 2
        else if (n <= 4) cols = 3

        const positions: Record<string, { x: number; y: number; h: number }> = {}
        let x = 0
        let y = 0
        let rowBottom = 0
        let contentRight = 0
        let contentBottom = 0

        schema.tables.forEach((t, i) => {
            const h = 22 + 14 + t.columns.length * colH + 10
            positions[t.name] = { x, y, h }
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
        return { positions, svgW, svgH, tblW }
    }, [schema])

    // 智能计算合适比例并居中展示 ER 图
    const autoFit = useCallback(() => {
        if (!canvasRef.current || ER.svgW === 0 || ER.svgH === 0) return
        const rect = canvasRef.current.getBoundingClientRect()
        // 预留 60px 边距（四周各 30px），保证表头与所有字段完整在视口内展示
        const padding = 60
        const containerW = rect.width - padding
        const containerH = rect.height - padding
        if (containerW <= 0 || containerH <= 0) return

        const scaleX = containerW / ER.svgW
        const scaleY = containerH / ER.svgH
        const fitScale = Math.min(scaleX, scaleY)
        // 缩放范围允许在 0.05 到 1.5 之间自适应，无强行 Clamping 截断
        const finalScale = Math.max(0.05, Math.min(1.5, fitScale))

        const fitX = (rect.width - ER.svgW * finalScale) / 2
        const fitY = (rect.height - ER.svgH * finalScale) / 2

        setScale(finalScale)
        setPan({ x: fitX, y: fitY })
    }, [ER.svgW, ER.svgH])

    useEffect(() => {
        autoFit()
        const timer1 = setTimeout(autoFit, 50)
        const timer2 = setTimeout(autoFit, 150)
        return () => {
            clearTimeout(timer1)
            clearTimeout(timer2)
        }
    }, [autoFit])

    // 切换全屏或容器 Resizing 时触发重新适应
    useEffect(() => {
        const timer = setTimeout(() => autoFit(), 60)
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
        const ro = new ResizeObserver((entries) => {
            for (const entry of entries) {
                if (entry.contentRect.width > 0 && entry.contentRect.height > 0) {
                    autoFit()
                }
            }
        })
        ro.observe(el)
        return () => ro.disconnect()
    }, [autoFit])

    const handleMouseDown = (e: React.MouseEvent) => {
        if (e.button !== 0) return
        setIsDragging(true)
        dragStartRef.current = { x: e.clientX, y: e.clientY }
        panStartRef.current = { ...pan }
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

    // 监听非被动 (passive: false) 滚轮事件，防止浏览器 preventDefault 报错
    useEffect(() => {
        const elem = canvasRef.current
        if (!elem) return

        const onWheel = (e: WheelEvent) => {
            e.preventDefault()
            const delta = e.deltaY > 0 ? -0.06 : 0.06
            setScale((prevScale) => {
                const nextScale = Math.max(0.05, Math.min(3, +(prevScale + delta).toFixed(2)))
                const rect = elem.getBoundingClientRect()
                const mouseX = e.clientX - rect.left
                const mouseY = e.clientY - rect.top
                const ratio = nextScale / prevScale
                setPan((prevPan) => ({
                    x: mouseX - (mouseX - prevPan.x) * ratio,
                    y: mouseY - (mouseY - prevPan.y) * ratio,
                }))
                return nextScale
            })
        }

        elem.addEventListener('wheel', onWheel, { passive: false })
        return () => elem.removeEventListener('wheel', onWheel)
    }, [])

    return (
        <div className={`${my.erWrap} ${isFullscreen ? my.fullscreen : ''}`}>
            <div className={my.erToolBar} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px' }}>
                <Tooltip title="缩小">
                    <Button
                        size="small"
                        style={{ width: 24, padding: 0 }}
                        onClick={() => setScale((s) => Math.max(0.05, +(s - 0.1).toFixed(2)))}
                    >
                        −
                    </Button>
                </Tooltip>
                <span className={my.erZoomVal} style={{ fontSize: 12, fontWeight: 500 }}>{Math.round(scale * 100)}%</span>
                <Tooltip title="放大">
                    <Button
                        size="small"
                        style={{ width: 24, padding: 0 }}
                        onClick={() => setScale((s) => Math.min(3, +(s + 0.1).toFixed(2)))}
                    >
                        +
                    </Button>
                </Tooltip>
                <Tooltip title="1:1 原始比例">
                    <Button
                        size="small"
                        onClick={() => setScale(1)}
                    >
                        100%
                    </Button>
                </Tooltip>
                <Tooltip title="适应视口居中展示">
                    <Button
                        size="small"
                        type="primary"
                        icon={<PanelLeft size={12} />}
                        onClick={autoFit}
                    >
                        适应画布
                    </Button>
                </Tooltip>
                <Tooltip title={isFullscreen ? '退出全屏 (Esc)' : '全屏沉浸展示'}>
                    <Button
                        size="small"
                        danger={isFullscreen}
                        icon={isFullscreen ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
                        onClick={() => setIsFullscreen((v) => !v)}
                    >
                        {isFullscreen ? '退出全屏' : '全屏'}
                    </Button>
                </Tooltip>
                <span style={{ marginLeft: 'auto' }} />
                <span className={my.erHint} style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                    {isFullscreen
                        ? '按 Esc 键或点击按钮退出全屏'
                        : '提示：按住鼠标左键可拖拽平移，鼠标滚轮或上方按钮控制缩放画布'}
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
                            return (
                                <path
                                    key={i}
                                    d={`M ${x1} ${y1} C ${(x1 + x2) / 2} ${y1}, ${(x1 + x2) / 2} ${y2}, ${x2} ${y2}`}
                                    className={my.fkPath}
                                />
                            )
                        })}
                        {schema.tables.map((t) => {
                            const pos = ER.positions[t.name]
                            if (!pos) return null
                            const maxChars = Math.max(12, Math.floor((ER.tblW - 20) / 7.5))
                            const tableNameDisplay = t.name.length > maxChars ? `${t.name.slice(0, maxChars - 1)}…` : t.name
                            return (
                                <g
                                    key={t.name}
                                    transform={`translate(${pos.x}, ${pos.y})`}
                                    className={my.erTableGroup}
                                >
                                    <rect width={ER.tblW} height={pos.h} rx={5} className={my.erTable} />
                                    <rect width={ER.tblW} height={22} rx={5} className={my.erTableHead} />
                                    <text x={8} y={15} className={my.erTableName}>
                                        <title>{t.name}</title>
                                        {tableNameDisplay}
                                    </text>
                                    {t.columns.map((c: any, ci: number) => {
                                        const isPri = c.key === 'PRI'
                                        const priIcon = isPri ? '🔑 ' : ''
                                        const fullLabel = `${c.name} ${c.type}`
                                        const availChars = maxChars - (isPri ? 2 : 0)
                                        const colDisplay = fullLabel.length > availChars ? `${fullLabel.slice(0, availChars - 1)}…` : fullLabel
                                        return (
                                            <text key={ci} x={8} y={22 + 14 + ci * 18} className={my.erCol}>
                                                <title>{`${priIcon}${fullLabel}`}</title>
                                                {priIcon}
                                                {colDisplay}
                                            </text>
                                        )
                                    })}
                                </g>
                            )
                        })}
                    </svg>
                </div>
            )}
        </div>
    )
}
