import React, { useState } from 'react'
import my from './CellEditorInline.module.less'

export default function CellEditorInline({
    value,
    isNull,
    onCommit,
    onCancel,
}: {
    value: string
    isNull: boolean
    onCommit: (v: string, n: boolean) => void
    onCancel: () => void
}) {
    const [txt, setTxt] = useState(isNull ? '' : value)

    return (
        <span className={my.mysqlCellEdit}>
            <input
                className={my.cellInput}
                autoFocus
                value={txt}
                onChange={(e) => setTxt(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault()
                        onCommit(txt, false)
                    } else if (e.key === 'Escape') {
                        e.preventDefault()
                        onCancel()
                    }
                }}
                onBlur={() => onCommit(txt, false)}
            />
        </span>
    )
}
