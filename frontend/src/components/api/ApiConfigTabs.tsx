import React from 'react'
import Icon from '../Icon'
import CodeEditor from '../CodeEditor'
import g from '../../styles/global.module.less'
import a from './ApiConfigTabs.module.less'
import type {ApiState} from './useApi'

export default function ApiConfigTabs({state}: { state: ApiState }) {
    const {
        mode, configTab, setConfigTab, showConfig, setShowConfig,
        headers, addHeader, updateHeader, removeHeader,
        bodyType, setBodyType, body, setBody, allowBody, formatJsonBody, doSend,
        auth, setAuth,
        timeoutMs, setTimeoutMs, insecureTLS, setInsecureTLS, followRedirects, setFollowRedirects,
        wsProtocols, setWsProtocols,
    } = state

    const tabs: Array<{key: 'headers' | 'body' | 'auth' | 'options' | 'messages'; label: string}> =
        mode === 'ws'
            ? [
                {key: 'messages', label: '消息'},
                {key: 'headers', label: '请求头'},
                {key: 'auth', label: '鉴权'},
                {key: 'options', label: '选项'},
            ]
            : [
                {key: 'headers', label: '请求头'},
                {key: 'body', label: '请求体'},
                {key: 'auth', label: '鉴权'},
                {key: 'options', label: '选项'},
            ]

    const selectTab = (key: typeof configTab) => {
        setShowConfig(true)
        setConfigTab(key)
    }

    return (
        <div className={a.configBar}>
            <div className={`${g.segmented} ${g.sm}`}>
                {tabs.map((t) => (
                    <button
                        key={t.key}
                        className={configTab === t.key ? g.active : ''}
                        onClick={() => selectTab(t.key)}
                    >{t.label}</button>
                ))}
            </div>
            <span className={g.spacer}/>
            <button
                className={`${g.btn} ${g.sm}`}
                onClick={() => setShowConfig((v) => !v)}
            >
                {showConfig ? '收起' : '展开'}
            </button>
        </div>
    )
}

export function ConfigBody({state}: { state: ApiState }) {
    const {
        mode, configTab, showConfig,
        headers, addHeader, updateHeader, removeHeader,
        bodyType, setBodyType, body, setBody, allowBody, formatJsonBody, doSend,
        auth, setAuth,
        timeoutMs, setTimeoutMs, insecureTLS, setInsecureTLS, followRedirects, setFollowRedirects,
        wsProtocols, setWsProtocols,
    } = state

    if (!showConfig) return null

    return (
        <div className={`${a.configBody} ${mode === 'ws' && configTab === 'messages' ? a.configBodyWs : ''}`}>
            {configTab === 'headers' && (
                <div className={a.headersEditor}>
                    {headers.length === 0 && (
                        <div className={`${a.emptyHint} ${a.small}`}>暂无请求头，点击「添加」新增</div>
                    )}
                    {headers.map((h, i) => (
                        <div key={i} className={a.headerRow}>
                            <input
                                type="checkbox"
                                checked={h.enabled}
                                title="启用"
                                onChange={(e) => updateHeader(i, {enabled: e.target.checked})}
                            />
                            <input
                                className={a.headerName}
                                placeholder="Header"
                                value={h.name}
                                spellCheck={false}
                                onChange={(e) => updateHeader(i, {name: e.target.value})}
                            />
                            <input
                                className={a.headerValue}
                                placeholder="Value"
                                value={h.value}
                                spellCheck={false}
                                onChange={(e) => updateHeader(i, {value: e.target.value})}
                            />
                            <button
                                className={`${g.iconBtn} ${g.danger}`}
                                title="删除"
                                onClick={() => removeHeader(i)}
                            >
                                <Icon name="trash" size={13}/>
                            </button>
                        </div>
                    ))}
                    <button className={`${g.btn} ${g.sm}`} onClick={addHeader}>
                        <Icon name="plus" size={13}/> 添加请求头
                    </button>
                </div>
            )}

            {configTab === 'body' && (
                <div className={a.bodyEditor}>
                    <div className={a.bodyTypeRow}>
                        <span className={a.label}>类型</span>
                        <select
                            className={a.bodyTypeSelect}
                            value={bodyType}
                            onChange={(e) => setBodyType(e.target.value)}
                        >
                            {(['none', 'json', 'text', 'xml'] as const).map((t) => (
                                <option key={t} value={t}>
                                    {t === 'none' ? '无' : t === 'json' ? 'JSON' : t === 'text' ? '文本' : 'XML'}
                                </option>
                            ))}
                        </select>
                        {bodyType !== 'none' && (
                            <button
                                className={`${g.btn} ${g.sm}`}
                                disabled={!allowBody}
                                title={allowBody ? '格式化 JSON' : '当前方法不支持请求体'}
                                onClick={formatJsonBody}
                            >
                                格式化
                            </button>
                        )}
                        {!allowBody && <span className={a.warnText}>该方法通常不含请求体</span>}
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
                    <div className={a.authRow}>
                        <span className={a.label}>类型</span>
                        <select
                            className={a.authTypeSelect}
                            value={auth.type}
                            onChange={(e) => setAuth((x) => ({...x, type: e.target.value as ApiState['auth']['type']}))}
                        >
                            <option value="none">无</option>
                            <option value="basic">Basic</option>
                            <option value="bearer">Bearer Token</option>
                        </select>
                    </div>
                    {auth.type === 'basic' && (
                        <>
                            <div className={a.authRow}>
                                <span className={a.label}>用户名</span>
                                <input
                                    className={a.authInput}
                                    value={auth.username}
                                    onChange={(e) => setAuth((x) => ({...x, username: e.target.value}))}
                                />
                            </div>
                            <div className={a.authRow}>
                                <span className={a.label}>密码</span>
                                <input
                                    type="password"
                                    className={a.authInput}
                                    value={auth.password}
                                    onChange={(e) => setAuth((x) => ({...x, password: e.target.value}))}
                                />
                            </div>
                        </>
                    )}
                    {auth.type === 'bearer' && (
                        <div className={a.authRow}>
                            <span className={a.label}>Token</span>
                            <input
                                className={a.authInput}
                                value={auth.token}
                                onChange={(e) => setAuth((x) => ({...x, token: e.target.value}))}
                            />
                        </div>
                    )}
                </div>
            )}

            {configTab === 'options' && (
                <div className={a.optionsEditor}>
                    <div className={a.optRow}>
                        <span className={a.label}>超时(ms)</span>
                        <input
                            type="number"
                            className={a.optInput}
                            min={0}
                            value={timeoutMs}
                            onChange={(e) => setTimeoutMs(Number(e.target.value) || 0)}
                        />
                    </div>
                    {mode === 'ws' && (
                        <div className={a.optRow}>
                            <span className={a.label}>子协议</span>
                            <input
                                className={a.optInput}
                                placeholder="逗号分隔，如 chat, json"
                                value={wsProtocols}
                                spellCheck={false}
                                onChange={(e) => setWsProtocols(e.target.value)}
                            />
                        </div>
                    )}
                    <label className={a.optCheck}>
                        <input
                            type="checkbox"
                            checked={followRedirects}
                            onChange={(e) => setFollowRedirects(e.target.checked)}
                        />
                        自动跟随重定向
                    </label>
                    <label className={a.optCheck}>
                        <input
                            type="checkbox"
                            checked={insecureTLS}
                            onChange={(e) => setInsecureTLS(e.target.checked)}
                        />
                        跳过 TLS 证书校验（不推荐）
                    </label>
                </div>
            )}
        </div>
    )
}
