import React, {useState} from 'react'
import my from './CellEditorInline.module.less'
import sh from './mysqlShared.module.less'

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
    const [nulled, setNulled] = useState(isNull)
    return (
        <span className={my.mysqlCellEdit}>
            <input autoFocus className={`${sh.mysqlCellInput}${nulled ? ' ' + sh.isNull : ''}`} value={nulled ? '' : txt} disabled={nulled}
                   onChange={(e) => setTxt(e.target.value)}
                   onKeyDown={(e) => {
                       if (e.key === 'Enter') { e.preventDefault(); onCommit(txt, nulled) }
                       else if (e.key === 'Escape') { e.preventDefault(); onCancel() }
                   }}
                   onBlur={() => onCommit(txt, nulled)}/>
            <button type="button" className={`${sh.nullToggle}${nulled ? ' ' + sh.on : ''}`} title="切换为 NULL" onClick={() => setNulled((n) => !n)}>NULL</button>
        </span>
    )
}
