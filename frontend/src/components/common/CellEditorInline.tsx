import React, { useState, useRef } from 'react'
import s from './CellEditorInline.module.less'

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
    const dirtyRef = useRef(false)
    const closedRef = useRef(false)

    const handleCommit = (val: string, isN: boolean) => {
        if (closedRef.current) return
        closedRef.current = true
        // 若用户从未输入任何内容，直接取消编辑，防止误触发修改状态
        if (!dirtyRef.current) {
            onCancel()
        } else {
            onCommit(val, isN)
        }
    }

    const handleCancel = () => {
        if (closedRef.current) return
        closedRef.current = true
        onCancel()
    }

    return (
        <span className={s.cellEditWrap}>
            <input
                className={s.cellInput}
                autoFocus
                value={txt}
                onChange={(e) => {
                    dirtyRef.current = true
                    setTxt(e.target.value)
                }}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault()
                        handleCommit(txt, false)
                    } else if (e.key === 'Escape') {
                        e.preventDefault()
                        handleCancel()
                    }
                }}
                onBlur={() => handleCommit(txt, false)}
            />
        </span>
    )
}
