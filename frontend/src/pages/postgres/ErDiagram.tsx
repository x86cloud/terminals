import React, { useState, useEffect, useRef, useMemo } from 'react'
import { Button, Tooltip, message, Tag, Space } from 'antd'
import { ZoomIn, ZoomOut, RotateCcw, RotateCw, Key } from 'lucide-react'
import { API } from '@/api'
import { PgTable, PgColumn, PgConstraint } from './postgresTypes'
import pg from './ErDiagram.module.less'

interface TableMeta {
    name: string
    columns: PgColumn[]
    constraints: PgConstraint[]
}

export default function ErDiagram({
    serverId,
    dbName,
    schema,
}: {
    serverId: string
    dbName: string
    schema: string
}) {
    const [tablesMeta, setTablesMeta] = useState<TableMeta[]>([])
    const [loading, setLoading] = useState(false)
    const [scale, setScale] = useState(1)
    const [pan, setPan] = useState({ x: 40, y: 40 })
    const [isDragging, setIsDragging] = useState(false)
    const dragStart = useRef({ x: 0, y: 0 })

    const loadSchemaMeta = async () => {
        setLoading(true)
        try {
            const tableList = await API.postgresTables(serverId, dbName, schema)
            const metaPromises = (tableList || [])
                .filter((t) => t.type === 'BASE TABLE')
                .slice(0, 30)
                .map(async (t) => {
                    const desc = await API.postgresDescribe(serverId, dbName, schema, t.name)
                    return {
                        name: t.name,
                        columns: (desc.columns || []) as PgColumn[],
                        constraints: (desc.constraints || []) as PgConstraint[],
                    }
                })
            const metas = await Promise.all(metaPromises)
            setTablesMeta(metas)
        } catch (e: any) {
            message.error(`加载 ER 图数据失败: ${e.message || e}`)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        loadSchemaMeta()
    }, [serverId, dbName, schema])

    const layout = useMemo(() => {
        const CARD_W = 220
        const GAP_X = 60
        const GAP_Y = 40
        const COLS = Math.max(2, Math.ceil(Math.sqrt(tablesMeta.length * 1.5)))

        const positions: Record<string, { x: number; y: number; w: number; h: number }> = {}

        tablesMeta.forEach((t, i) => {
            const colIdx = i % COLS
            const rowIdx = Math.floor(i / COLS)
            const h = 32 + t.columns.length * 20 + 8
            const x = colIdx * (CARD_W + GAP_X)
            const y = rowIdx * 300
            positions[t.name] = { x, y, w: CARD_W, h }
        })

        // 计算外键连线
        const links: Array<{ from: string; to: string; fromPos: { x: number; y: number }; toPos: { x: number; y: number } }> = []
        tablesMeta.forEach((t) => {
            const fromPos = positions[t.name]
            if (!fromPos) return
            t.constraints.forEach((c) => {
                if (c.type === 'FOREIGN KEY' && c.foreignTable && positions[c.foreignTable]) {
                    const toPos = positions[c.foreignTable]
                    links.push({
                        from: t.name,
                        to: c.foreignTable,
                        fromPos: { x: fromPos.x + fromPos.w, y: fromPos.y + 20 },
                        toPos: { x: toPos.x, y: toPos.y + 20 },
                    })
                }
            })
        })

        return { positions, links }
    }, [tablesMeta])

    const handleMouseDown = (e: React.MouseEvent) => {
        setIsDragging(true)
        dragStart.current = { x: e.clientX - pan.x, y: e.clientY - pan.y }
    }

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!isDragging) return
        setPan({
            x: e.clientX - dragStart.current.x,
            y: e.clientY - dragStart.current.y,
        })
    }

    const handleMouseUp = () => {
        setIsDragging(false)
    }

    return (
        <div className={pg.erWrap}>
            <div className={pg.erToolbar}>
                <Space size={4}>
                    <Tooltip title="放大">
                        <Button size="small" icon={<ZoomIn size={14} />} onClick={() => setScale((s) => Math.min(2, s + 0.1))} />
                    </Tooltip>
                    <Tooltip title="缩小">
                        <Button size="small" icon={<ZoomOut size={14} />} onClick={() => setScale((s) => Math.max(0.4, s - 0.1))} />
                    </Tooltip>
                    <Tooltip title="重置视角">
                        <Button
                            size="small"
                            icon={<RotateCcw size={14} />}
                            onClick={() => {
                                setScale(1)
                                setPan({ x: 40, y: 40 })
                            }}
                        />
                    </Tooltip>
                    <Tooltip title="刷新元数据">
                        <Button size="small" icon={<RotateCw size={14} />} loading={loading} onClick={loadSchemaMeta} />
                    </Tooltip>
                </Space>
            </div>

            <div
                className={pg.canvas}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
            >
                <div
                    style={{
                        transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
                        transformOrigin: '0 0',
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: 4000,
                        height: 4000,
                    }}
                >
                    {/* SVG 连线 */}
                    <svg
                        style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            width: '100%',
                            height: '100%',
                            pointerEvents: 'none',
                            zIndex: 1,
                        }}
                    >
                        {layout.links.map((link, idx) => {
                            const dx = (link.toPos.x - link.fromPos.x) / 2
                            const path = `M ${link.fromPos.x} ${link.fromPos.y} C ${link.fromPos.x + dx} ${link.fromPos.y}, ${link.toPos.x - dx} ${link.toPos.y}, ${link.toPos.x} ${link.toPos.y}`
                            return (
                                <g key={idx}>
                                    <path d={path} fill="none" stroke="#1890ff" strokeWidth="2" strokeDasharray="4 2" opacity="0.75" />
                                    <circle cx={link.fromPos.x} cy={link.fromPos.y} r="3" fill="#1890ff" />
                                    <circle cx={link.toPos.x} cy={link.toPos.y} r="3" fill="#1890ff" />
                                </g>
                            )
                        })}
                    </svg>

                    {/* 表卡片 */}
                    {tablesMeta.map((t) => {
                        const pos = layout.positions[t.name]
                        if (!pos) return null
                        return (
                            <div
                                key={t.name}
                                className={pg.tableCard}
                                style={{
                                    position: 'absolute',
                                    left: pos.x,
                                    top: pos.y,
                                    width: pos.w,
                                    zIndex: 2,
                                }}
                            >
                                <div className={pg.cardHead}>
                                    <span>{t.name}</span>
                                    <Tag color="geekblue" style={{ fontSize: 10, marginInlineEnd: 0 }}>
                                        {t.columns.length} 字段
                                    </Tag>
                                </div>
                                <div style={{ padding: '4px 0' }}>
                                    {t.columns.map((c) => (
                                        <div key={c.name} className={pg.colRow}>
                                            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                                {c.isPrimaryKey && <Key size={11} style={{ color: '#ff4d4f' }} />}
                                                <strong>{c.name}</strong>
                                            </span>
                                            <span style={{ color: 'var(--text-secondary)', fontSize: 10 }}>{c.udtName}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )
                    })}
                </div>
            </div>
        </div>
    )
}
