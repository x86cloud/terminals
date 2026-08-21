import React from 'react'
import { Select, Input, InputNumber, Button, Segmented, Checkbox, Tooltip, Space } from 'antd'
import { Trash2, Plus } from 'lucide-react'
import CodeEditor from '@/components/CodeEditor'
import a from '@/pages/api/ApiConfigTabs.module.less'
import type { ApiState } from '@/pages/api/useApi'

export default function ApiConfigTabs({ state }: { state: ApiState }) {
    const {
        mode, configTab, setConfigTab, showConfig, setShowConfig,
    } = state

    const tabs: Array<{ key: 'params' | 'headers' | 'body' | 'auth' | 'options' | 'messages'; label: string }> =
        mode === 'ws'
            ? [
                { key: 'messages', label: '消息' },
                { key: 'params', label: 'Params' },
                { key: 'headers', label: '请求头' },
                { key: 'auth', label: '鉴权' },
                { key: 'options', label: '选项' },
            ]
            : [
                { key: 'params', label: 'Params' },
                { key: 'headers', label: '请求头' },
                { key: 'body', label: '请求体' },
                { key: 'auth', label: '鉴权' },
                { key: 'options', label: '选项' },
            ]

    const selectTab = (key: typeof configTab) => {
        setShowConfig(true)
        setConfigTab(key)
    }

    return (
        <div className={a.configBar} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 12px' }}>
            <Segmented
                size="small"
                value={configTab}
                onChange={(v) => selectTab(v as any)}
                options={tabs.map((t) => ({ label: t.label, value: t.key }))}
            />
            <Button
                size="small"
                onClick={() => setShowConfig((v) => !v)}
            >
                {showConfig ? '收起' : '展开'}
            </Button>
        </div>
    )
}

export function ConfigBody({ state }: { state: ApiState }) {
    const {
        mode, configTab, showConfig,
        params, addParam, updateParam, removeParam,
        headers, addHeader, updateHeader, removeHeader,
        bodyType, setBodyType, body, setBody, allowBody, formatJsonBody, doSend,
        auth, setAuth,
        timeoutMs, setTimeoutMs, insecureTLS, setInsecureTLS, followRedirects, setFollowRedirects,
        wsProtocols, setWsProtocols,
    } = state

    if (!showConfig) return null

    return (
        <div className={`${a.configBody} ${mode === 'ws' && configTab === 'messages' ? a.configBodyWs : ''}`} style={{ padding: '8px 12px' }}>
            {configTab === 'params' && (
                <div className={a.headersEditor}>
                    {params.length === 0 && (
                        <div className={`${a.emptyHint} ${a.small}`}>暂无 Query 参数，点击「添加」新增</div>
                    )}
                    {params.map((p, i) => (
                        <div key={i} className={a.headerRow} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                            <Checkbox
                                checked={p.enabled}
                                title="启用"
                                onChange={(e) => updateParam(i, { enabled: e.target.checked })}
                            />
                            <Input
                                size="small"
                                style={{ flex: 1 }}
                                placeholder="Parameter Key"
                                value={p.name}
                                spellCheck={false}
                                onChange={(e) => updateParam(i, { name: e.target.value })}
                            />
                            <Input
                                size="small"
                                style={{ flex: 2 }}
                                placeholder="Value"
                                value={p.value}
                                spellCheck={false}
                                onChange={(e) => updateParam(i, { value: e.target.value })}
                            />
                            <Tooltip title="删除">
                                <Button
                                    size="small"
                                    type="text"
                                    danger
                                    icon={<Trash2 size={13} />}
                                    onClick={() => removeParam(i)}
                                />
                            </Tooltip>
                        </div>
                    ))}
                    <Button size="small" icon={<Plus size={13} />} onClick={addParam} style={{ marginTop: 4 }}>
                        添加 Query 参数
                    </Button>
                </div>
            )}

            {configTab === 'headers' && (
                <div className={a.headersEditor}>
                    {headers.length === 0 && (
                        <div className={`${a.emptyHint} ${a.small}`}>暂无请求头，点击「添加」新增</div>
                    )}
                    {headers.map((h, i) => (
                        <div key={i} className={a.headerRow} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                            <Checkbox
                                checked={h.enabled}
                                title="启用"
                                onChange={(e) => updateHeader(i, { enabled: e.target.checked })}
                            />
                            <Input
                                size="small"
                                style={{ flex: 1 }}
                                placeholder="Header"
                                value={h.name}
                                spellCheck={false}
                                onChange={(e) => updateHeader(i, { name: e.target.value })}
                            />
                            <Input
                                size="small"
                                style={{ flex: 2 }}
                                placeholder="Value"
                                value={h.value}
                                spellCheck={false}
                                onChange={(e) => updateHeader(i, { value: e.target.value })}
                            />
                            <Tooltip title="删除">
                                <Button
                                    size="small"
                                    type="text"
                                    danger
                                    icon={<Trash2 size={13} />}
                                    onClick={() => removeHeader(i)}
                                />
                            </Tooltip>
                        </div>
                    ))}
                    <Button size="small" icon={<Plus size={13} />} onClick={addHeader} style={{ marginTop: 4 }}>
                        添加请求头
                    </Button>
                </div>
            )}

            {configTab === 'body' && (
                <div className={a.bodyEditor}>
                    <div className={a.bodyTypeRow} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                        <span className={a.label} style={{ fontSize: 12, color: 'var(--text-dim)' }}>类型</span>
                        <Select
                            size="small"
                            style={{ width: 110 }}
                            value={bodyType}
                            onChange={(val) => setBodyType(val)}
                            options={[
                                { value: 'none', label: '无 (None)' },
                                { value: 'json', label: 'JSON' },
                                { value: 'text', label: '文本 (Text)' },
                                { value: 'xml', label: 'XML' },
                            ]}
                        />
                        {bodyType !== 'none' && (
                            <Button
                                size="small"
                                disabled={!allowBody}
                                title={allowBody ? '格式化 JSON' : '当前方法不支持请求体'}
                                onClick={formatJsonBody}
                            >
                                格式化
                            </Button>
                        )}
                        {!allowBody && <span className={a.warnText} style={{ fontSize: 12, color: 'var(--text-dim)' }}>该方法通常不含请求体</span>}
                    </div>
                    <CodeEditor
                        value={body}
                        onChange={setBody}
                        lang={bodyType === 'json' ? 'json' : 'plain'}
                        height="200px"
                        readOnly={bodyType === 'none'}
                        placeholder={bodyType === 'none' ? '请先选择请求体类型' : '在此输入请求体内容'}
                        onModEnter={() => doSend()}
                    />
                </div>
            )}

            {configTab === 'auth' && (
                <div className={a.authEditor}>
                    <div className={a.authRow} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                        <span className={a.label} style={{ fontSize: 12, color: 'var(--text-dim)', width: 60 }}>类型</span>
                        <Select
                            size="small"
                            style={{ width: 130 }}
                            value={auth.type}
                            onChange={(v) => setAuth((x) => ({ ...x, type: v as ApiState['auth']['type'] }))}
                            options={[
                                { value: 'none', label: '无 (None)' },
                                { value: 'basic', label: 'Basic Auth' },
                                { value: 'bearer', label: 'Bearer Token' },
                            ]}
                        />
                    </div>
                    {auth.type === 'basic' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <div className={a.authRow} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                <span className={a.label} style={{ fontSize: 12, color: 'var(--text-dim)', width: 60 }}>用户名</span>
                                <Input
                                    size="small"
                                    style={{ maxWidth: 300 }}
                                    value={auth.username}
                                    onChange={(e) => setAuth((x) => ({ ...x, username: e.target.value }))}
                                />
                            </div>
                            <div className={a.authRow} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                <span className={a.label} style={{ fontSize: 12, color: 'var(--text-dim)', width: 60 }}>密码</span>
                                <Input.Password
                                    size="small"
                                    style={{ maxWidth: 300 }}
                                    value={auth.password}
                                    onChange={(e) => setAuth((x) => ({ ...x, password: e.target.value }))}
                                />
                            </div>
                        </div>
                    )}
                    {auth.type === 'bearer' && (
                        <div className={a.authRow} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <span className={a.label} style={{ fontSize: 12, color: 'var(--text-dim)', width: 60 }}>Token</span>
                            <Input
                                size="small"
                                style={{ maxWidth: 400 }}
                                value={auth.token}
                                onChange={(e) => setAuth((x) => ({ ...x, token: e.target.value }))}
                            />
                        </div>
                    )}
                </div>
            )}

            {configTab === 'options' && (
                <div className={a.optionsEditor} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div className={a.optRow} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <span className={a.label} style={{ fontSize: 12, color: 'var(--text-dim)', width: 70 }}>超时(ms)</span>
                        <InputNumber
                            size="small"
                            min={0}
                            value={timeoutMs}
                            onChange={(v) => setTimeoutMs(v ?? 0)}
                        />
                    </div>
                    {mode === 'ws' && (
                        <div className={a.optRow} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <span className={a.label} style={{ fontSize: 12, color: 'var(--text-dim)', width: 70 }}>子协议</span>
                            <Input
                                size="small"
                                style={{ maxWidth: 300 }}
                                placeholder="逗号分隔，如 chat, json"
                                value={wsProtocols}
                                spellCheck={false}
                                onChange={(e) => setWsProtocols(e.target.value)}
                            />
                        </div>
                    )}
                    <Checkbox
                        checked={followRedirects}
                        onChange={(e) => setFollowRedirects(e.target.checked)}
                    >
                        自动跟随重定向
                    </Checkbox>
                    <Checkbox
                        checked={insecureTLS}
                        onChange={(e) => setInsecureTLS(e.target.checked)}
                    >
                        跳过 TLS 证书校验（不推荐）
                    </Checkbox>
                </div>
            )}
        </div>
    )
}
