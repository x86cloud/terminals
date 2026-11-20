import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, Input } from 'antd'
import { RotateCcw, Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { WikiGraphData, WikiGraphNode } from '@/types'
import s from '../WikiPage.module.less'

interface Props {
    graph: WikiGraphData
    onSelectNode: (relPath: string) => void
}

interface SimNode extends WikiGraphNode {
    x: number
    y: number
    vx: number
    vy: number
    radius: number
}

const CATEGORY_COLORS: Record<string, string> = {
    entities: '#3370ff',
    concepts: '#8b5cf6',
    runbooks: '#10b981',
    summaries: '#f59e0b',
    raw: '#64748b',
    system: '#06b6d4',
    wiki: '#3b82f6',
    missing: '#ef4444',
}

const LEGEND_CATEGORIES = ['entities', 'concepts', 'runbooks', 'summaries', 'raw', 'system']

export default function WikiGraphView({ graph, onSelectNode }: Props) {
    const { t } = useTranslation('wiki')
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const wrapRef = useRef<HTMLDivElement>(null)

    const [filterText, setFilterText] = useState('')
    const [hiddenCategories, setHiddenCategories] = useState<Set<string>>(new Set())
    const [hovered, setHovered] = useState<{
        node: SimNode
        sx: number
        sy: number
    } | null>(null)

    const simNodesRef = useRef<SimNode[]>([])
    const viewRef = useRef({ tx: 0, ty: 0, scale: 1 })
    const dragRef = useRef<{
        mode: 'pan' | 'node'
        nodeIdx: number
        startX: number
        startY: number
        lastX: number
        lastY: number
        moved: boolean
    } | null>(null)
    const hoveredIdRef = useRef<string | null>(null)
    const alphaRef = useRef<number>(1)

    const visibleGraph = useMemo(() => {
        const nodes = graph.nodes.filter((n) => !hiddenCategories.has(n.category))
        const idSet = new Set(nodes.map((n) => n.id))
        const edges = graph.edges.filter(
            (e) => !e.broken && idSet.has(e.source) && idSet.has(e.target)
        )
        return { nodes, edges }
    }, [graph, hiddenCategories])

    const adjMap = useMemo(() => {
        const map = new Map<string, Set<string>>()
        for (const e of visibleGraph.edges) {
            if (!map.has(e.source)) map.set(e.source, new Set())
            if (!map.has(e.target)) map.set(e.target, new Set())
            map.get(e.source)!.add(e.target)
            map.get(e.target)!.add(e.source)
        }
        return map
    }, [visibleGraph])

    useEffect(() => {
        const n = visibleGraph.nodes.length
        const prevMap = new Map(simNodesRef.current.map((nd) => [nd.id, nd]))
        simNodesRef.current = visibleGraph.nodes.map((nd, idx) => {
            const old = prevMap.get(nd.id)
            const angle = (idx / Math.max(1, n)) * Math.PI * 2
            const ring = 90 + (idx % 3) * 55
            return {
                ...nd,
                x: old ? old.x : Math.cos(angle) * ring,
                y: old ? old.y : Math.sin(angle) * ring,
                vx: 0,
                vy: 0,
                radius: Math.min(18, 6 + Math.sqrt(nd.degree) * 3.2),
            }
        })
        alphaRef.current = 1
    }, [visibleGraph])

    useEffect(() => {
        const canvas = canvasRef.current
        const wrap = wrapRef.current
        if (!canvas || !wrap) return

        let width = wrap.clientWidth
        let height = wrap.clientHeight
        const resize = () => {
            width = wrap.clientWidth
            height = wrap.clientHeight
            const dpr = window.devicePixelRatio || 1
            canvas.width = Math.max(1, Math.floor(width * dpr))
            canvas.height = Math.max(1, Math.floor(height * dpr))
            alphaRef.current = Math.max(alphaRef.current, 0.05)
        }
        resize()
        const ro = new ResizeObserver(resize)
        ro.observe(wrap)

        let raf = 0
        const queryLower = filterText.trim().toLowerCase()

        const stepAndDraw = () => {
            const nodes = simNodesRef.current
            const nodeMap = new Map(nodes.map((n, i) => [n.id, i]))
            const alpha = alphaRef.current

            if (alpha > 0.01 && nodes.length > 0) {
                const draggedIdx = dragRef.current?.mode === 'node' ? dragRef.current.nodeIdx : -1
                // Repulsion
                for (let i = 0; i < nodes.length; i++) {
                    for (let j = i + 1; j < nodes.length; j++) {
                        let dx = nodes[j].x - nodes[i].x
                        let dy = nodes[j].y - nodes[i].y
                        let distSq = dx * dx + dy * dy
                        if (distSq < 1) {
                            dx = 0.5
                            dy = 0.5
                            distSq = 0.5
                        }
                        const force = (1800 / distSq) * alpha
                        const invDist = 1 / Math.sqrt(distSq)
                        const fx = dx * invDist * force
                        const fy = dy * invDist * force
                        if (i !== draggedIdx) {
                            nodes[i].vx -= fx
                            nodes[i].vy -= fy
                        }
                        if (j !== draggedIdx) {
                            nodes[j].vx += fx
                            nodes[j].vy += fy
                        }
                    }
                }

                // Spring along edges
                for (const e of visibleGraph.edges) {
                    const si = nodeMap.get(e.source)
                    const ti = nodeMap.get(e.target)
                    if (si === undefined || ti === undefined) continue
                    const dx = nodes[ti].x - nodes[si].x
                    const dy = nodes[ti].y - nodes[si].y
                    const dist = Math.max(1, Math.hypot(dx, dy))
                    const targetDist = 110
                    const spring = (dist - targetDist) * 0.035 * alpha
                    const fx = (dx / dist) * spring
                    const fy = (dy / dist) * spring
                    if (si !== draggedIdx) {
                        nodes[si].vx += fx
                        nodes[si].vy += fy
                    }
                    if (ti !== draggedIdx) {
                        nodes[ti].vx -= fx
                        nodes[ti].vy -= fy
                    }
                }

                // Gravity toward center + damping
                for (let i = 0; i < nodes.length; i++) {
                    if (i === draggedIdx) continue
                    nodes[i].vx = (nodes[i].vx - nodes[i].x * 0.012 * alpha) * 0.82
                    nodes[i].vy = (nodes[i].vy - nodes[i].y * 0.012 * alpha) * 0.82
                    nodes[i].x += nodes[i].vx
                    nodes[i].y += nodes[i].vy
                }
                alphaRef.current *= 0.985
            }

            // Draw
            const ctx = canvas.getContext('2d')
            if (ctx) {
                const dpr = window.devicePixelRatio || 1
                const styles = getComputedStyle(document.documentElement)
                const textColor = styles.getPropertyValue('--text').trim() || '#1f2733'
                const borderColor = styles.getPropertyValue('--border').trim() || '#dcdfe4'
                const bgColor = styles.getPropertyValue('--stage-bg').trim() || '#ffffff'

                ctx.save()
                ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
                ctx.clearRect(0, 0, width, height)

                const { tx, ty, scale } = viewRef.current
                ctx.translate(width / 2 + tx, height / 2 + ty)
                ctx.scale(scale, scale)

                const hovId = hoveredIdRef.current
                const neighbors = hovId ? adjMap.get(hovId) : undefined

                // Edges
                for (const e of visibleGraph.edges) {
                    const si = nodeMap.get(e.source)
                    const ti = nodeMap.get(e.target)
                    if (si === undefined || ti === undefined) continue
                    const a = nodes[si]
                    const b = nodes[ti]
                    const isActiveEdge = hovId && (e.source === hovId || e.target === hovId)
                    ctx.beginPath()
                    ctx.moveTo(a.x, a.y)
                    ctx.lineTo(b.x, b.y)
                    ctx.strokeStyle = isActiveEdge ? '#3370ff' : borderColor
                    ctx.globalAlpha = hovId ? (isActiveEdge ? 0.95 : 0.18) : 0.65
                    ctx.lineWidth = isActiveEdge ? 1.8 / scale : 1 / scale
                    ctx.stroke()
                }

                // Nodes & labels
                for (const nd of nodes) {
                    const matched =
                        !queryLower ||
                        nd.title.toLowerCase().includes(queryLower) ||
                        nd.id.toLowerCase().includes(queryLower)
                    const isHov = nd.id === hovId
                    const isNeighbor = neighbors?.has(nd.id)
                    let opacity = matched ? 1 : 0.2
                    if (hovId && !isHov && !isNeighbor) {
                        opacity = Math.min(opacity, 0.22)
                    }

                    ctx.globalAlpha = opacity
                    const fill = CATEGORY_COLORS[nd.category] || '#3b82f6'

                    ctx.beginPath()
                    ctx.arc(nd.x, nd.y, nd.radius + (isHov ? 2.5 : 0), 0, Math.PI * 2)
                    ctx.fillStyle = fill
                    ctx.fill()
                    ctx.lineWidth = (isHov ? 2.5 : 1.5) / scale
                    ctx.strokeStyle = bgColor
                    ctx.stroke()

                    if (scale > 0.55 || isHov || isNeighbor || nd.degree >= 2) {
                        ctx.font = `${isHov ? '600 ' : ''}${Math.max(10, Math.round(11.5 / Math.pow(scale, 0.2)))}px sans-serif`
                        ctx.fillStyle = textColor
                        ctx.textAlign = 'center'
                        ctx.textBaseline = 'top'
                        ctx.fillText(nd.title, nd.x, nd.y + nd.radius + 4)
                    }
                }

                ctx.restore()
            }

            raf = requestAnimationFrame(stepAndDraw)
        }

        raf = requestAnimationFrame(stepAndDraw)
        return () => {
            cancelAnimationFrame(raf)
            ro.disconnect()
        }
    }, [visibleGraph, adjMap, filterText])

    const screenToWorld = (clientX: number, clientY: number) => {
        const canvas = canvasRef.current
        if (!canvas) return { wx: 0, wy: 0, sx: 0, sy: 0 }
        const rect = canvas.getBoundingClientRect()
        const sx = clientX - rect.left
        const sy = clientY - rect.top
        const { tx, ty, scale } = viewRef.current
        const wx = (sx - rect.width / 2 - tx) / scale
        const wy = (sy - rect.height / 2 - ty) / scale
        return { wx, wy, sx, sy }
    }

    const hitTest = (wx: number, wy: number): number => {
        const nodes = simNodesRef.current
        for (let i = nodes.length - 1; i >= 0; i--) {
            const nd = nodes[i]
            const dist = Math.hypot(wx - nd.x, wy - nd.y)
            if (dist <= nd.radius + 5) return i
        }
        return -1
    }

    const toggleCategory = (cat: string) => {
        setHiddenCategories((prev) => {
            const next = new Set(prev)
            if (next.has(cat)) next.delete(cat)
            else next.add(cat)
            return next
        })
    }

    return (
        <div ref={wrapRef} className={s.graphContainer}>
            <canvas
                ref={canvasRef}
                className={s.graphCanvas}
                onMouseDown={(e) => {
                    const { wx, wy } = screenToWorld(e.clientX, e.clientY)
                    const idx = hitTest(wx, wy)
                    dragRef.current = {
                        mode: idx >= 0 ? 'node' : 'pan',
                        nodeIdx: idx,
                        startX: e.clientX,
                        startY: e.clientY,
                        lastX: e.clientX,
                        lastY: e.clientY,
                        moved: false,
                    }
                }}
                onMouseMove={(e) => {
                    const { wx, wy, sx, sy } = screenToWorld(e.clientX, e.clientY)
                    const drag = dragRef.current
                    if (drag) {
                        const dx = e.clientX - drag.lastX
                        const dy = e.clientY - drag.lastY
                        if (Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) > 3) {
                            drag.moved = true
                        }
                        drag.lastX = e.clientX
                        drag.lastY = e.clientY
                        if (drag.mode === 'node' && drag.nodeIdx >= 0) {
                            const nd = simNodesRef.current[drag.nodeIdx]
                            if (nd) {
                                nd.x += dx / viewRef.current.scale
                                nd.y += dy / viewRef.current.scale
                                nd.vx = 0
                                nd.vy = 0
                                alphaRef.current = Math.max(alphaRef.current, 0.25)
                            }
                        } else {
                            viewRef.current.tx += dx
                            viewRef.current.ty += dy
                        }
                        return
                    }

                    const idx = hitTest(wx, wy)
                    if (idx >= 0) {
                        const nd = simNodesRef.current[idx]
                        hoveredIdRef.current = nd.id
                        setHovered({ node: nd, sx, sy })
                    } else if (hoveredIdRef.current !== null) {
                        hoveredIdRef.current = null
                        setHovered(null)
                    }
                }}
                onMouseUp={(e) => {
                    const drag = dragRef.current
                    dragRef.current = null
                    if (drag && !drag.moved && drag.mode === 'node' && drag.nodeIdx >= 0) {
                        const nd = simNodesRef.current[drag.nodeIdx]
                        if (nd) onSelectNode(nd.id)
                    }
                }}
                onMouseLeave={() => {
                    dragRef.current = null
                    hoveredIdRef.current = null
                    setHovered(null)
                }}
                onWheel={(e) => {
                    e.preventDefault()
                    const factor = e.deltaY < 0 ? 1.12 : 0.89
                    const nextScale = Math.min(3.5, Math.max(0.25, viewRef.current.scale * factor))
                    viewRef.current.scale = nextScale
                }}
            />

            <div className={s.graphOverlayTop}>
                <div className={s.graphControls}>
                    <Input
                        size="small"
                        prefix={<Search size={12} />}
                        placeholder={t('graph.filterPlaceholder')}
                        value={filterText}
                        onChange={(e) => setFilterText(e.target.value)}
                        style={{ width: 170 }}
                    />
                    <Button
                        size="small"
                        icon={<RotateCcw size={12} />}
                        onClick={() => {
                            viewRef.current = { tx: 0, ty: 0, scale: 1 }
                            alphaRef.current = 1
                        }}
                    >
                        {t('graph.resetZoom')}
                    </Button>
                </div>

                <div className={s.graphLegend}>
                    {LEGEND_CATEGORIES.map((cat) => (
                        <button
                            key={cat}
                            type="button"
                            className={`${s.legendItem}${hiddenCategories.has(cat) ? ' ' + s.dimmed : ''}`}
                            onClick={() => toggleCategory(cat)}
                        >
                            <span
                                className={s.legendDot}
                                style={{ background: CATEGORY_COLORS[cat] }}
                            />
                            <span>{cat}</span>
                        </button>
                    ))}
                </div>
            </div>

            {graph.nodes.length === 0 && (
                <div
                    className={s.emptyState}
                    style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
                >
                    <span>{t('graph.empty')}</span>
                </div>
            )}

            {hovered && (
                <div
                    className={s.graphTooltip}
                    style={{
                        left: hovered.sx + 14,
                        top: hovered.sy + 14,
                    }}
                >
                    <div style={{ fontWeight: 600 }}>{hovered.node.title}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 2 }}>
                        {hovered.node.id}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>
                        {hovered.node.category} · {t('graph.degree', { count: hovered.node.degree })}
                    </div>
                </div>
            )}

            <div className={s.graphHint}>{t('graph.clickHint')}</div>
        </div>
    )
}
