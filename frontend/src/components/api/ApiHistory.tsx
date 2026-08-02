import React from 'react'
import Icon from '../Icon'
import g from '../../styles/global.module.less'
import a from './ApiHistory.module.less'
import sh from './apiShared.module.less'
import type {ApiState} from './useApi'

export default function ApiHistory({state}: { state: ApiState }) {
    const {history, showHistory, setShowHistory, clearHistory, loadHistory, deleteHistory} = state
    if (!showHistory) return null
    return (
        <aside className={a.historyPanel}>
            <div className={a.historyHead}>
                <span className={a.historyTitle}>请求历史</span>
                <span className={a.historyCount}>{history.length}</span>
                <span className={g.spacer}/>
                <button className={g.iconBtn} title="清空历史" onClick={clearHistory}>
                    <Icon name="trash" size={14}/>
                </button>
                <button className={g.iconBtn} title="关闭历史" onClick={() => setShowHistory(false)}>
                    <Icon name="close" size={14}/>
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
                                <Icon name="close" size={12}/>
                            </button>
                        </div>
                        <span className={a.historyUrl}>{h.url}</span>
                    </div>
                ))}
            </div>
        </aside>
    )
}
