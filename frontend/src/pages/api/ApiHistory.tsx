import React, {useState} from 'react'
import { Trash2, X } from 'lucide-react'
import {ConfirmModal, ConfirmState} from '../../components/Modal'
import g from '../../styles/global.module.less'
import a from './ApiHistory.module.less'
import sh from './apiShared.module.less'
import type {ApiState} from './useApi'

export default function ApiHistory({state}: { state: ApiState }) {
    const {history, showHistory, setShowHistory, clearHistory, loadHistory, deleteHistory} = state
    const [confirm, setConfirm] = useState<ConfirmState>({open: false, title: '', message: ''})
    if (!showHistory) return null
    return (
        <aside className={a.historyPanel}>
            <div className={a.historyHead}>
                <span className={a.historyTitle}>请求历史</span>
                <span className={a.historyCount}>{history.length}</span>
                <span className={g.spacer}/>
                <button
                    className={g.iconBtn}
                    title="清空历史"
                    disabled={history.length === 0}
                    onClick={() => {
                        setConfirm({
                            open: true,
                            title: '清空请求历史',
                            danger: true,
                            message: '确定要清空所有 API 请求历史记录吗？',
                            onConfirm: () => {
                                setConfirm({open: false, title: '', message: ''})
                                clearHistory()
                            },
                        })
                    }}
                >
                    <Trash2 size={14}/>
                </button>
                <button className={g.iconBtn} title="关闭历史" onClick={() => setShowHistory(false)}>
                    <X size={14}/>
                </button>
            </div>
            <div className={a.historyList}>
                {history.length === 0 && <div className={sh.respEmpty}>暂无历史记录</div>}
                {history.map((h, i) => (
                    <div key={h.at || i} className={a.historyItem} title={h.url} onClick={() => loadHistory(h)}>
                        <div className={a.historyTop}>
                            <span className={`${a.historyMethod} ${sh['m_' + h.method]}`}>{h.method}</span>
                            {h.error ? (
                                <span className={a.historyErr}>失败</span>
                            ) : (
                                <span className={a.historyCode}>{h.statusCode}</span>
                            )}
                            <button
                                className={a.historyDel}
                                title="删除"
                                onClick={(e) => {
                                    e.stopPropagation()
                                    deleteHistory(i)
                                }}
                            >
                                <X size={12}/>
                            </button>
                        </div>
                        <span className={a.historyUrl}>{h.url}</span>
                    </div>
                ))}
            </div>
            <ConfirmModal state={confirm} onCancel={() => setConfirm({open: false, title: '', message: ''})}/>
        </aside>
    )
}
