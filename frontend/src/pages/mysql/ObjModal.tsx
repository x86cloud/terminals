import React from 'react'
import { X } from 'lucide-react'
import CodeEditor from '../../components/CodeEditor'
import g from '../../styles/global.module.less'
import my from './ObjModal.module.less'

export type ObjModalKind = 'createdb' | 'createtable' | 'dropdb' | 'droptable' | 'truncate' | 'createindex' | 'dropindex'

export default function ObjModal(props: {
    kind: ObjModalKind
    db?: string
    placeholder?: string
    busy: boolean
    msg: string
    name: string
    extra: string
    unique?: boolean
    onName: (v: string) => void
    onExtra: (v: string) => void
    onUnique?: (v: boolean) => void
    onClose: () => void
    onConfirm: () => void
}) {
    const { kind, db, placeholder, busy, msg, name, extra, unique = false, onName, onExtra, onUnique, onClose, onConfirm } = props
    const titleMap: Record<string, string> = {
        createdb: '新建数据库', dropdb: '删除数据库', createtable: db ? `在 ${db} 中新建表` : '新建表',
        droptable: '删除表', truncate: '清空表数据', createindex: '新建索引', dropindex: '删除索引',
    }
    const needName = !['truncate', 'dropindex'].includes(kind)
    const needDef = kind === 'createtable'
    const needCols = kind === 'createindex'
    const needConfirm = ['dropdb', 'droptable', 'truncate'].includes(kind)

    return (
        <div className={g.modalMask} onClick={() => !busy && onClose()}>
            <div className={`${g.modal} ${g.ioModal}`} onClick={(e) => e.stopPropagation()}>
                <div className={g.modalHead}>
                    <span>{titleMap[kind] || '数据库操作'}</span>
                    <button className={g.iconBtn} disabled={busy} onClick={onClose}><X size={14} /></button>
                </div>
                <div className={g.modalBody}>
                    {msg && <div className={`${g.ioMsg} ${msg.startsWith('失败') ? g.err : g.ok}`}>{msg}</div>}
                    {needName && (
                        <div className={g.field}>
                            <label>{kind === 'createindex' ? '索引名称' : kind === 'createdb' ? '数据库名' : '表名'}</label>
                            <input value={name} onChange={(e) => onName(e.target.value)} placeholder={kind === 'createdb' ? '例如 app_db' : '例如 users'} />
                        </div>
                    )}
                    {needDef && (
                        <div className={g.field}>
                            <label>列定义（SQL）</label>
                            <div style={{ border: '1px solid var(--border, #d4dbe6)', borderRadius: '6px', overflow: 'hidden' }}>
                                <CodeEditor
                                    value={extra}
                                    onChange={onExtra}
                                    lang="sql"
                                    height="160px"
                                    minHeight="80px"
                                    placeholder={placeholder || "`id` INT PRIMARY KEY AUTO_INCREMENT, `name` VARCHAR(64)"}
                                    lineNumbers={true}
                                />
                            </div>
                        </div>
                    )}
                    {needCols && (
                        <>
                            <div className={g.field}>
                                <label>索引列（逗号分隔）</label>
                                <input value={extra} onChange={(e) => onExtra(e.target.value)} placeholder="col1, col2" />
                            </div>
                            <label className={g.switchField}>
                                <span>唯一索引 (UNIQUE)</span>
                                <span className={g.switch}>
                                    <input type="checkbox" checked={unique} onChange={(e) => onUnique?.(e.target.checked)} />
                                    <span className={g.slider} />
                                </span>
                            </label>
                        </>
                    )}
                    {needConfirm && <p className={g.ioHint}>该操作不可恢复，请确认。</p>}
                </div>
                <div className={g.modalFoot}>
                    <button className={`${g.btn} ${g.sm}`} disabled={busy} onClick={onClose}>取消</button>
                    <button className={`${g.btn} ${g.sm} ${g.primary}`} disabled={busy || ((needName || needDef || needCols) && !name && !extra)} onClick={onConfirm}>
                        {busy ? '处理中…' : '确定'}
                    </button>
                </div>
            </div>
        </div>
    )
}
