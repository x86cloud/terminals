import React from 'react'
import { Button, Input, Tag } from 'antd'
import a from '@/pages/api/WsClient.module.less'
import sh from '@/pages/api/apiShared.module.less'
import type { ApiState } from '@/pages/api/useApi'

export default function WsClient({ state }: { state: ApiState }) {
    const { configTab, wsStatus, wsMessages, wsClear, url, wsInput, setWsInput, wsSendMsg } = state
    if (configTab !== 'messages') return null

    const statusColor = wsStatus === 'open' ? 'success' : wsStatus === 'connecting' ? 'processing' : wsStatus === 'error' ? 'error' : 'default'
    const statusText = wsStatus === 'open' ? '已连接' : wsStatus === 'connecting' ? '连接中…' : wsStatus === 'error' ? '连接失败' : '未连接'

    return (
        <div className={a.wsPanel}>
            <div className={a.wsBar}>
                <Tag color={statusColor}>{statusText}</Tag>
                <span className={a.wsUrl} title={url}>{url}</span>
                <span className={a.toolbarRight}>
                    <Button size="small" onClick={wsClear}>清空消息</Button>
                </span>
            </div>
            <div className={a.wsMsgList}>
                {wsMessages.length === 0 && <div className={sh.respEmpty}>连接后收发消息会显示在这里</div>}
                {wsMessages.map((m, i) => (
                    <div key={i} className={`${a.wsMsg} ${a['w_' + m.dir]}`}>
                        <div className={a.wsMsgHead}>
                            <Tag color={m.dir === 'in' ? 'green' : m.dir === 'out' ? 'blue' : 'default'}>
                                {m.dir === 'in' ? '收' : m.dir === 'out' ? '发' : '系统'}
                            </Tag>
                            {m.type === 'binary' && <Tag color="purple">二进制</Tag>}
                            <span className={a.wsTime}>{new Date(m.ts).toLocaleTimeString()}</span>
                        </div>
                        <pre className={a.wsPayload} title={m.payload}>{m.payload}</pre>
                    </div>
                ))}
            </div>
            <div className={a.wsComposer}>
                <Input.TextArea
                    style={{ flex: 1 }}
                    rows={3}
                    placeholder={wsStatus === 'open' ? '输入要发送的消息，Ctrl+Enter 发送' : '请先建立连接'}
                    value={wsInput}
                    disabled={wsStatus !== 'open'}
                    onChange={(e) => setWsInput(e.target.value)}
                    onKeyDown={(e) => {
                        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                            e.preventDefault()
                            wsSendMsg()
                        }
                    }}
                />
                <Button
                    type="primary"
                    disabled={wsStatus !== 'open' || !wsInput.trim()}
                    onClick={wsSendMsg}
                >
                    发送
                </Button>
            </div>
        </div>
    )
}
