import React from 'react'
import g from '@/styles/global.module.less'
import a from '@/pages/api/WsClient.module.less'
import sh from '@/pages/api/apiShared.module.less'
import type {ApiState} from '@/pages/api/useApi'

export default function WsClient({state}: { state: ApiState }) {
    const {configTab, wsStatus, wsMessages, wsClear, url, wsInput, setWsInput, wsSendMsg} = state
    if (configTab !== 'messages') return null
    return (
        <div className={a.wsPanel}>
            <div className={a.wsBar}>
                <span className={`${a.wsStatusDot} ${wsStatus === 'open' ? a.on : wsStatus === 'connecting' ? a.connecting : ''}`}/>
                <span className={a.wsStatusText}>
                    {wsStatus === 'open' ? '已连接' : wsStatus === 'connecting' ? '连接中…' : wsStatus === 'error' ? '连接失败' : '未连接'}
                </span>
                <span className={a.wsUrl} title={url}>{url}</span>
                <span className={g.spacer}/>
                <button className={`${g.btn} ${g.sm}`} onClick={wsClear}>清空消息</button>
            </div>
            <div className={a.wsMsgList}>
                {wsMessages.length === 0 && <div className={sh.respEmpty}>连接后收发消息会显示在这里</div>}
                {wsMessages.map((m, i) => (
                    <div key={i} className={`${a.wsMsg} ${a['w_' + m.dir]}`}>
                        <div className={a.wsMsgHead}>
                            <span className={a.wsDir}>{m.dir === 'in' ? '收' : m.dir === 'out' ? '发' : '系统'}</span>
                            {m.type === 'binary' && <span className={a.wsBin}>二进制</span>}
                            <span className={a.wsTime}>{new Date(m.ts).toLocaleTimeString()}</span>
                        </div>
                        <pre className={a.wsPayload} title={m.payload}>{m.payload}</pre>
                    </div>
                ))}
            </div>
            <div className={a.wsComposer}>
                <textarea
                    className={a.wsInput}
                    placeholder={wsStatus === 'open' ? '输入要发送的消息，Ctrl+Enter 发送' : '请先建立连接'}
                    value={wsInput}
                    spellCheck={false}
                    disabled={wsStatus !== 'open'}
                    onChange={(e) => setWsInput(e.target.value)}
                    onKeyDown={(e) => {
                        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                            e.preventDefault()
                            wsSendMsg()
                        }
                    }}
                />
                <button
                    className={`${g.btn} ${g.primary}`}
                    disabled={wsStatus !== 'open' || !wsInput.trim()}
                    onClick={wsSendMsg}
                >发送</button>
            </div>
        </div>
    )
}
