import React from 'react'
import { Select, Input, InputNumber, Button, Segmented, Checkbox, Tooltip, Space, Badge, AutoComplete } from 'antd'
import { Trash2, Plus, ChevronDown, ChevronUp } from 'lucide-react'
import CodeEditor from '@/components/CodeEditor'
import a from '@/pages/api/ApiConfigTabs.module.less'
import type { ApiState } from '@/pages/api/useApi'
import { COMMON_HEADER_KEYS, getHeaderValueOptions, getHeaderDefaultValue } from './headerPresets'

export default function ApiConfigTabs({ state }: { state: ApiState }) {
    const {
        mode, configTab, setConfigTab, showConfig, setShowConfig,
        params, headers, bodyType, auth,
    } = state

    const enabledParamsCount = params.filter((p) => p.enabled && p.name.trim()).length
    const enabledHeadersCount = headers.filter((h) => h.enabled && h.name.trim()).length

    const tabs: Array<{ key: 'params' | 'headers' | 'body' | 'auth' | 'options' | 'messages'; label: string }> =
        mode === 'ws'
            ? [
                { key: 'messages', label: '消息' },
                { key: 'params', label: enabledParamsCount > 0 ? `Params (${enabledParamsCount})` : 'Params' },
                { key: 'headers', label: enabledHeadersCount > 0 ? `请求头 (${enabledHeadersCount})` : '请求头' },
                { key: 'auth', label: auth.type !== 'none' ? `鉴权 (${auth.type.toUpperCase()})` : '鉴权' },
                { key: 'options', label: '选项' },
            ]
            : [
                { key: 'params', label: enabledParamsCount > 0 ? `Params (${enabledParamsCount})` : 'Params' },
                { key: 'headers', label: enabledHeadersCount > 0 ? `请求头 (${enabledHeadersCount})` : '请求头' },
                { key: 'body', label: bodyType !== 'none' ? `请求体 (${bodyType.toUpperCase()})` : '请求体' },
                { key: 'auth', label: auth.type !== 'none' ? `鉴权 (${auth.type.toUpperCase()})` : '鉴权' },
                { key: 'options', label: '选项' },
            ]

    const selectTab = (key: typeof configTab) => {
        setShowConfig(true)
        setConfigTab(key)
    }

    return (
        <div className={a.configBar}>
            <Segmented
                style={{ height: 32, display: 'flex', alignItems: 'center' }}
                value={configTab}
                onChange={(v) => selectTab(v as any)}
                options={tabs.map((t) => ({ label: t.label, value: t.key }))}
            />
            <Button
                type="text"
                style={{ height: 32 }}
                icon={showConfig ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                onClick={() => setShowConfig((v) => !v)}
            >
                {showConfig ? '收起配置' : '展开配置'}
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
        <div className={a.configBody}>
            {configTab === 'params' && (
                <div className={a.headersEditor}>
                    {params.length > 0 && (
                        <div className={a.headerTableHead}>
                            <span style={{ width: 24, textAlign: 'center' }}>启用</span>
                            <span style={{ flex: 1 }}>参数名 (Key)</span>
                            <span style={{ flex: 2 }}>参数值 (Value)</span>
                            <span style={{ width: 32 }}></span>
                        </div>
                    )}

                    {params.map((p, i) => (
                        <div key={i} className={a.headerRow}>
                            <Checkbox
                                checked={p.enabled}
                                title="启用"
                                onChange={(e) => updateParam(i, { enabled: e.target.checked })}
                            />
                            <Input
                                style={{ flex: 1, height: 32 }}
                                placeholder="Parameter Key"
                                value={p.name}
                                spellCheck={false}
                                onChange={(e) => updateParam(i, { name: e.target.value })}
                            />
                            <Input
                                style={{ flex: 2, height: 32 }}
                                placeholder="Value"
                                value={p.value}
                                spellCheck={false}
                                onChange={(e) => updateParam(i, { value: e.target.value })}
                            />
                            <Tooltip title="删除">
                                <Button
                                    type="text"
                                    danger
                                    style={{ height: 32, width: 32, padding: 0 }}
                                    icon={<Trash2 size={14} />}
                                    onClick={() => removeParam(i)}
                                />
                            </Tooltip>
                        </div>
                    ))}
                    <Button type="dashed" icon={<Plus size={14} />} onClick={addParam} style={{ width: '100%', height: 32, marginTop: 4 }}>
                        添加 Query 参数
                    </Button>
                </div>
            )}

            {configTab === 'headers' && (
                <div className={a.headersEditor}>
                    {headers.length > 0 && (
                        <div className={a.headerTableHead}>
                            <span style={{ width: 24, textAlign: 'center' }}>启用</span>
                            <span style={{ flex: 1 }}>请求头名称 (Header)</span>
                            <span style={{ flex: 2 }}>请求头值 (Value)</span>
                            <span style={{ width: 32 }}></span>
                        </div>
                    )}
                    {headers.map((h, i) => (
                        <div key={i} className={a.headerRow}>
                            <Checkbox
                                checked={h.enabled}
                                title="启用"
                                onChange={(e) => updateHeader(i, { enabled: e.target.checked })}
                            />
                            <AutoComplete
                                style={{ flex: 1, minWidth: 0 }}
                                placeholder="Header Key (如 Content-Type)"
                                value={h.name}
                                options={COMMON_HEADER_KEYS}
                                filterOption={(inputValue, option) =>
                                    !inputValue ||
                                    (option?.value ?? '')
                                        .toLowerCase()
                                        .includes(inputValue.toLowerCase())
                                }
                                onChange={(val) => updateHeader(i, { name: val })}
                                onSelect={(val) => {
                                    const defaultVal = getHeaderDefaultValue(val)
                                    if (!h.value && defaultVal !== undefined) {
                                        updateHeader(i, { name: val, value: defaultVal })
                                    } else {
                                        updateHeader(i, { name: val })
                                    }
                                }}
                                defaultActiveFirstOption={false}
                            />
                            <AutoComplete
                                style={{ flex: 2, minWidth: 0 }}
                                placeholder="Header Value"
                                value={h.value}
                                options={getHeaderValueOptions(h.name)}
                                popupMatchSelectWidth={false}
                                filterOption={(inputValue, option) =>
                                    !inputValue ||
                                    (option?.value ?? '')
                                        .toLowerCase()
                                        .includes(inputValue.toLowerCase())
                                }
                                onChange={(val) => updateHeader(i, { value: val })}
                                defaultActiveFirstOption={false}
                            />
                            <Tooltip title="删除">
                                <Button
                                    type="text"
                                    danger
                                    style={{ height: 32, width: 32, padding: 0 }}
                                    icon={<Trash2 size={14} />}
                                    onClick={() => removeHeader(i)}
                                />
                            </Tooltip>
                        </div>
                    ))}
                    <Button type="dashed" icon={<Plus size={14} />} onClick={addHeader} style={{ width: '100%', height: 32, marginTop: 4 }}>
                        添加请求头
                    </Button>
                </div>
            )}

            {configTab === 'body' && (
                <div className={a.bodyEditor}>
                    <div className={a.bodyTypeRow}>
                        <span className={a.label}>数据类型</span>
                        <Select
                            style={{ width: 130, height: 32 }}
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
                                style={{ height: 32 }}
                                disabled={!allowBody}
                                title={allowBody ? '格式化 JSON' : '当前方法不支持请求体'}
                                onClick={formatJsonBody}
                            >
                                格式化 JSON
                            </Button>
                        )}
                        {!allowBody && <span className={a.warnText}>GET / HEAD 方法通常不携带请求体</span>}
                    </div>
                    {bodyType !== 'none' && (
                        <div style={{ height: 180, borderRadius: 4, overflow: 'hidden' }}>
                            <CodeEditor
                                value={body}
                                onChange={setBody}
                                lang={bodyType === 'json' ? 'json' : 'plain'}
                                height="100%"
                                readOnly={bodyType === 'none'}
                                placeholder="在此输入请求体内容..."
                                onModEnter={() => doSend()}
                            />
                        </div>
                    )}
                </div>
            )}

            {configTab === 'auth' && (
                <div className={a.authEditor}>
                    <div className={a.authRow}>
                        <span className={a.label} style={{ width: 75 }}>鉴权类型</span>
                        <Select
                            style={{ width: 150, height: 32 }}
                            value={auth.type}
                            onChange={(v) => setAuth((x) => ({ ...x, type: v as ApiState['auth']['type'] }))}
                            options={[
                                { value: 'none', label: '无 (No Auth)' },
                                { value: 'basic', label: 'Basic Auth' },
                                { value: 'bearer', label: 'Bearer Token' },
                            ]}
                        />
                    </div>
                    {auth.type === 'basic' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            <div className={a.authRow}>
                                <span className={a.label} style={{ width: 75 }}>用户名</span>
                                <Input
                                    style={{ maxWidth: 340, height: 32 }}
                                    placeholder="Username"
                                    value={auth.username}
                                    onChange={(e) => setAuth((x) => ({ ...x, username: e.target.value }))}
                                />
                            </div>
                            <div className={a.authRow}>
                                <span className={a.label} style={{ width: 75 }}>密码</span>
                                <Input.Password
                                    style={{ maxWidth: 340, height: 32 }}
                                    placeholder="Password"
                                    value={auth.password}
                                    onChange={(e) => setAuth((x) => ({ ...x, password: e.target.value }))}
                                />
                            </div>
                        </div>
                    )}
                    {auth.type === 'bearer' && (
                        <div className={a.authRow}>
                            <span className={a.label} style={{ width: 75 }}>Token</span>
                            <Input
                                style={{ maxWidth: 440, height: 32 }}
                                placeholder="Bearer token string"
                                value={auth.token}
                                onChange={(e) => setAuth((x) => ({ ...x, token: e.target.value }))}
                            />
                        </div>
                    )}
                </div>
            )}

            {configTab === 'options' && (
                <div className={a.optionsEditor}>
                    <div className={a.optRow}>
                        <span className={a.label} style={{ width: 90 }}>超时时间(ms)</span>
                        <InputNumber
                            min={0}
                            style={{ width: 150, height: 32 }}
                            value={timeoutMs}
                            onChange={(v) => setTimeoutMs(v ?? 0)}
                        />
                    </div>
                    {mode === 'ws' && (
                        <div className={a.optRow}>
                            <span className={a.label} style={{ width: 90 }}>子协议</span>
                            <Input
                                style={{ maxWidth: 340, height: 32 }}
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
                        自动跟随重定向 (Follow Redirects)
                    </Checkbox>
                    <Checkbox
                        checked={insecureTLS}
                        onChange={(e) => setInsecureTLS(e.target.checked)}
                    >
                        跳过 TLS 证书校验 (Insecure TLS)
                    </Checkbox>
                </div>
            )}
        </div>
    )
}
