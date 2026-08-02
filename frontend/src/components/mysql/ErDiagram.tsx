import React, {useMemo} from 'react'
import g from '../../styles/global.module.less'
import my from './ErDiagram.module.less'
import sh from './mysqlShared.module.less'
import {Schema} from './mysqlTypes'

export default function ErDiagram({
    schema,
    busy,
    zoom,
    setZoom,
}: {
    schema: Schema
    busy: boolean
    zoom: number
    setZoom: (updater: (z: number) => number) => void
}) {
    const ER = useMemo(() => {
        const colH = 20
        const gapX = 40
        const gapY = 36
        const charW = 7.5
        const padW = 20
        // 根据最长文本行（表名或列定义）动态计算表格宽度，避免文字被截断
        let maxLineLen = 0
        schema.tables.forEach((t) => {
            maxLineLen = Math.max(maxLineLen, String(t.name).length)
            t.columns.forEach((c: any) => {
                const label = `${c.key === 'PRI' ? '🔑 ' : ''}${c.name} ${c.type}`
                maxLineLen = Math.max(maxLineLen, label.length)
            })
        })
        const tblW = Math.max(160, maxLineLen * charW + padW)
        const positions: Record<string, { x: number; y: number; h: number }> = {}
        let x = 0
        let y = 0
        let rowBottom = 0
        let contentRight = 0
        let contentBottom = 0
        schema.tables.forEach((t, i) => {
            // 表头 22 + 首列偏移 14 + 行高 * 列数 + 底部留白 10
            const h = 22 + 14 + t.columns.length * colH + 10
            positions[t.name] = {x, y, h}
            rowBottom = Math.max(rowBottom, y + h)
            contentRight = Math.max(contentRight, x + tblW)
            contentBottom = Math.max(contentBottom, y + h)
            x += tblW + gapX
            if ((i + 1) % 4 === 0) {
                x = 0
                y = rowBottom + gapY
                rowBottom = 0
            }
        })
        const svgW = Math.max(400, contentRight + gapX)
        const svgH = Math.max(200, contentBottom + gapY)
        return {positions, svgW, svgH, tblW}
    }, [schema])

    return (
        <div className={my.erWrap}>
            <div className={my.erToolBar}>
                <button className={my.erZoomBtn} title="缩小"
                        onClick={() => setZoom(z => Math.max(0.3, +(z - 0.1).toFixed(2)))}>−</button>
                <span className={my.erZoomVal}>{Math.round(zoom * 100)}%</span>
                <button className={my.erZoomBtn} title="放大"
                        onClick={() => setZoom(z => Math.min(3, +(z + 0.1).toFixed(2)))}>+</button>
                <button className={my.erZoomBtn} title="重置缩放" onClick={() => setZoom(() => 1)}>⤢</button>
                <span className={g.spacer}/>
                <span className={my.erHint}>缩放后可拖动滚动条查看细节</span>
            </div>
            {schema.tables.length === 0 ? (
                <div className={`${sh.mysqlEmpty}`}>{busy ? '加载中…' : '该数据库暂无表'}</div>
            ) : (
                <div className={my.erCanvas}>
                    <svg
                        className={my.erSvg}
                        viewBox={`0 0 ${ER.svgW / zoom} ${ER.svgH / zoom}`}
                        preserveAspectRatio="xMidYMid meet">
                        {schema.foreignKeys.map((fk, i) => {
                            const from = ER.positions[fk.fromTable]
                            const to = ER.positions[fk.toTable]
                            if (!from || !to) return null
                            const x1 = from.x + ER.tblW
                            const y1 = from.y + (from.h / 2)
                            const x2 = to.x
                            const y2 = to.y + (to.h / 2)
                            return (
                                <path key={i} d={`M ${x1} ${y1} C ${(x1 + x2) / 2} ${y1}, ${(x1 + x2) / 2} ${y2}, ${x2} ${y2}`}
                                      stroke="#5b9bff" strokeWidth={1.5} fill="none" opacity={0.7}/>
                            )
                        })}
                        {schema.tables.map((t) => {
                            const pos = ER.positions[t.name]
                            if (!pos) return null
                            return (
                                <g key={t.name} transform={`translate(${pos.x}, ${pos.y})`}>
                                    <rect width={ER.tblW} height={pos.h} rx={5} className={my.erTable}/>
                                    <rect width={ER.tblW} height={22} rx={5} className={my.erTableHead}/>
                                    <text x={8} y={15} className={my.erTableName}>
                                        <title>{t.name}</title>
                                        {t.name}
                                    </text>
                                    {t.columns.map((c: any, ci: number) => (
                                        <text key={ci} x={8} y={22 + 14 + ci * 18} className={my.erCol}>
                                            <title>{`${c.key === 'PRI' ? '🔑 ' : ''}${c.name} ${c.type}`}</title>
                                            {c.key === 'PRI' ? '🔑 ' : ''}{c.name} <tspan className={my.erType}>{c.type}</tspan>
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
