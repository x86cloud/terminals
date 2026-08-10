import React from 'react'
import Icon from '../../components/Icon'
import g from '../../styles/global.module.less'
import my from '../mysql/ObjModal.module.less'

export type SqliteObjModalKind = 'createtable' | 'droptable' | 'createindex' | 'dropindex'

export default function SqliteObjModal(props: {
    kind: SqliteObjModalKind
    busy: boolean
    msg: string
    name: string
    extra: string
    unique: boolean
    onName: (v: string) => void
    onExtra: (v: string) => void
    onUnique: (v: boolean) => void
    onClose: () => void
    onConfirm: () => void
}) {
    const { kind, busy, msg, name, extra, unique, onName, onExtra, onUnique, onClose, onConfirm } = props
    const titleMap: Record<string, string> = {
        createtable: '新建 SQLite 数据表',
        droptable: `删除表 ${name}`,
        createindex: '新建索引',
        dropindex: `删除索引 ${name}`,
    }
    const needName = !['dropindex'].includes(kind)
    const needDef = kind === 'createtable'
    const needCols = kind === 'createindex'
    const needConfirm = ['droptable', 'dropindex'].includes(kind)

    return (
        <div className={g.modalMask} onClick={() => !busy && onClose()}>
            <div className={`${g.modal} ${g.ioModal}`} onClick={(e) => e.stopPropagation()}>
                <div className={g.modalHead}>
                    <span>{titleMap[kind] || 'SQLite 操作'}</span>
                    <button className={g.iconBtn} disabled={busy} onClick={onClose}>
                        <Icon name="close" size={14} />
                    </button>
                </div>
                <div className={g.modalBody}>
                    {msg && <div className={`${g.ioMsg} ${msg.startsWith('失败') ? g.err : g.ok}`}>{msg}</div>}
                    {needName && (
                        <div className={g.field}>
                            <label>{kind === 'createindex' ? '索引名称' : '表名称'}</label>
                            <input
                                value={name}
                                onChange={(e) => onName(e.target.value)}
                                placeholder={kind === 'createindex' ? 'idx_user_name' : 'user_info'}
                            />
                        </div>
                    )}
                    {needDef && (
                        <div className={g.field}>
                            <label>列定义（SQL）</label>
                            <textarea
                                className={my.mysqlSqlInput}
                                rows={4}
                                value={extra}
                                onChange={(e) => onExtra(e.target.value)}
                                placeholder="id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, age INTEGER"
                            />
                        </div>
                    )}
                    {needCols && (
                        <>
                            <div className={g.field}>
                                <label>索引列（逗号分隔）</label>
                                <input
                                    value={extra}
                                    onChange={(e) => onExtra(e.target.value)}
                                    placeholder="col1, col2"
                                />
                            </div>
                            <label className={g.switchField}>
                                <span>唯一索引 (UNIQUE)</span>
                                <span className={g.switch}>
                                    <input
                                        type="checkbox"
                                        checked={unique}
                                        onChange={(e) => onUnique(e.target.checked)}
                                    />
                                    <span className={g.slider} />
                                </span>
                            </label>
                        </>
                    )}
                    {needConfirm && <p className={g.ioHint}>该操作不可恢复，请确认是否删除。</p>}
                </div>
                <div className={g.modalFoot}>
                    <button className={`${g.btn} ${g.sm}`} disabled={busy} onClick={onClose}>
                        取消
                    </button>
                    <button
                        className={`${g.btn} ${g.sm} ${needConfirm ? g.danger : g.primary}`}
                        disabled={busy || ((needName || needDef || needCols) && !name && !extra)}
                        onClick={onConfirm}
                    >
                        {busy ? '处理中…' : '确定'}
                    </button>
                </div>
            </div>
        </div>
    )
}
