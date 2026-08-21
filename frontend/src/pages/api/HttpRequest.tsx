import React from 'react'
import { Select, Input, Button, Segmented, Space, Tag, Checkbox, Tooltip } from 'antd'
import { X, Copy, PanelLeft } from 'lucide-react'
import CodeEditor from '@/components/CodeEditor'
import a from '@/pages/api/HttpRequest.module.less'
import sh from '@/pages/api/apiShared.module.less'
import type { ApiState } from '@/pages/api/useApi'

export default function HttpRequest({ state, onClose }: { state: ApiState; onClose: () => void }) {
    const {
        mode, wsStatus, wsConnect, wsDisconnect, wsConnecting, wsSendMsg,
        method, setMethod, methods, url, updateUrl, doSend, sending, showHistory, setShowHistory,
        response, respTab, setRespTab, prettyBody, respLang, respHeaders, bodyPretty, setBodyPretty, copy,
    } = state

    return (
        <>
            {/* 请求工具条 */}
            <div className={a.apiToolbar} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px' }}>
                <Tooltip title={showHistory ? '隐藏历史' : '显示历史'}>
                    <Button
                        size="small"
                        type="text"
                        icon={<PanelLeft size={15} />}
                        onClick={() => setShowHistory((v) => !v)}
                    />
                </Tooltip>
                <Segmented
                    size="small"
                    value={mode}
                    onChange={(v) => state.wsSwitchMode(v as any)}
                    options={[
                        { label: 'HTTP', value: 'http' },
                        { label: 'WebSocket', value: 'ws' },
                    ]}
                />
                {mode === 'http' && (
                    <Select
                        size="small"
                        style={{ width: 100 }}
                        value={method}
                        onChange={(v) => setMethod(v as ApiState['method'])}
                        options={methods.map((m) => ({ label: m, value: m }))}
                    />
                )}
                <Input
                    size="small"
                    style={{ flex: 1 }}
                    placeholder={mode === 'ws' ? 'ws://example.com/ws' : 'https://example.com/api/v1/resource'}
                    value={url}
                    spellCheck={false}
                    onChange={(e) => updateUrl(e.target.value)}
                    onKeyDown={(e) => {
                        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                            e.preventDefault()
                            if (mode === 'ws') {
                                if (wsStatus === 'open') wsSendMsg()
                                else wsConnect()
                            } else {
                                doSend()
                            }
                        }
                    }}
                />
                {mode === 'ws' ? (
                    wsStatus === 'open' ? (
                        <Button size="small" danger onClick={wsDisconnect}>
                            断开
                        </Button>
                    ) : (
                        <Button
                            size="small"
                            type="primary"
                            loading={wsConnecting}
                            onClick={wsConnect}
                        >
                            连接
                        </Button>
                    )
                ) : (
                    <Button
                        size="small"
                        type="primary"
                        loading={sending}
                        onClick={doSend}
                    >
                        发送
                    </Button>
                )}
                <Tooltip title="关闭">
                    <Button
                        size="small"
                        type="text"
                        icon={<X size={15} />}
                        onClick={onClose}
                    />
                </Tooltip>
            </div>

            {/* 响应区（仅 HTTP 模式） */}
            {mode === 'http' && (
                <div className={a.responseArea}>
                    <div className={a.respHead} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 12px' }}>
                        {response ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <Tag color={response.error ? 'error' : response.statusCode >= 200 && response.statusCode < 300 ? 'success' : 'warning'}>
                                    {response.error ? 'ERR' : response.statusCode || '-'}
                                </Tag>
                                <span style={{ fontSize: 13, fontWeight: 500 }}>
                                    {response.error ? response.error : (response.status || '')}
                                </span>
                                <Tag color="geekblue">{response.durationMs} ms</Tag>
                                <Tag color="purple">
                                    {response.size >= 1024
                                        ? (response.size / 1024).toFixed(1) + ' KB'
                                        : response.size + ' B'}
                                </Tag>
                            </div>
                        ) : (
                            <span className={a.respPlaceholder}>尚未发送请求</span>
                        )}
                        {response && (
                            <Segmented
                                size="small"
                                value={respTab}
                                onChange={(v) => setRespTab(v as any)}
                                options={[
                                    { label: '响应体', value: 'body' },
                                    { label: '响应头', value: 'headers' },
                                ]}
                            />
                        )}
                    </div>

                    <div className={a.respBody}>
                        {!response && (
                            <div className={sh.respEmpty}>填写地址与方法后点击「发送」查看响应</div>
                        )}
                        {response && respTab === 'body' && (
                            <div className={a.respBodyWrap}>
                                <div className={a.respBodyTools}>
                                    <Checkbox
                                        checked={bodyPretty}
                                        onChange={(e) => setBodyPretty(e.target.checked)}
                                    >
                                        美化 JSON
                                    </Checkbox>
                                    <Button
                                        size="small"
                                        icon={<Copy size={13} />}
                                        onClick={() => copy(prettyBody)}
                                    >
                                        复制
                                    </Button>
                                </div>
                                <div className={a.respCodeWrap}>
                                    <CodeEditor
                                        value={prettyBody || '(空响应体)'}
                                        onChange={() => { }}
                                        lang={respLang}
                                        height="100%"
                                        readOnly
                                    />
                                </div>
                            </div>
                        )}
                        {response && respTab === 'headers' && (
                            <div className={a.respHeaders}>
                                {respHeaders.length === 0 && <div className={sh.respEmpty}>无响应头</div>}
                                {respHeaders.map(([k, v]) => (
                                    <div key={k} className={a.respHeaderRow}>
                                        <span className={a.respHeaderKey}>{k}</span>
                                        <span className={a.respHeaderVal}>{v}</span>
                                        <Tooltip title="复制">
                                            <Button
                                                size="small"
                                                type="text"
                                                icon={<Copy size={12} />}
                                                onClick={() => copy(`${k}: ${v}`)}
                                            />
                                        </Tooltip>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </>
    )
}
