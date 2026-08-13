import React, {useCallback, useEffect, useMemo, useState} from 'react'
import { Send, X, Copy, PanelLeft } from 'lucide-react'
import CodeEditor from '@/components/CodeEditor'
import g from '@/styles/global.module.less'
import a from '@/pages/api/HttpRequest.module.less'
import sh from '@/pages/api/apiShared.module.less'
import {statusClass} from '@/pages/api/apiTypes'
import type {ApiState} from '@/pages/api/useApi'

export default function HttpRequest({state, onClose}: { state: ApiState; onClose: () => void }) {
    const {
        mode, wsStatus, wsConnect, wsDisconnect, wsConnecting, wsSendMsg,
        method, setMethod, methods, url, setUrl, updateUrl, doSend, sending, showHistory, setShowHistory,
        configTab, setConfigTab, showConfig, setShowConfig,
        response, respTab, setRespTab, prettyBody, respLang, respHeaders, bodyPretty, setBodyPretty, copy,
    } = state

    return (
        <>
            {/* 请求工具条 */}
            <div className={a.apiToolbar}>
                <button
                    className={g.iconBtn}
                    title={showHistory ? '隐藏历史' : '显示历史'}
                    onClick={() => setShowHistory((v) => !v)}
                >
                    <PanelLeft size={15}/>
                </button>
                <div className={a.modeToggle}>
                    <button
                        className={mode === 'http' ? a.modeActive : ''}
                        onClick={() => state.wsSwitchMode('http')}
                    >HTTP</button>
                    <button
                        className={mode === 'ws' ? a.modeActive : ''}
                        onClick={() => state.wsSwitchMode('ws')}
                    >WebSocket</button>
                </div>
                {mode === 'http' && (
                    <select
                        className={a.methodSelect}
                        value={method}
                        onChange={(e) => setMethod(e.target.value as ApiState['method'])}
                    >
                        {methods.map((m) => (
                            <option key={m} value={m}>{m}</option>
                        ))}
                    </select>
                )}
                <input
                    className={a.urlInput}
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
                        <button className={`${g.btn} ${g.danger}`} onClick={wsDisconnect}>
                            断开
                        </button>
                    ) : (
                        <button
                            className={`${g.btn} ${g.primary}`}
                            disabled={wsConnecting}
                            onClick={wsConnect}
                        >
                            {wsConnecting ? '连接中…' : '连接'}
                        </button>
                    )
                ) : (
                    <button
                        className={`${g.btn} ${g.primary}`}
                        disabled={sending}
                        onClick={doSend}
                    >
                        {sending ? '请求中…' : '发送'}
                    </button>
                )}
                <button
                    className={`${g.iconBtn} ${a.toolClose}`}
                    title="关闭"
                    onClick={onClose}
                >
                    <X size={15}/>
                </button>
            </div>

            {/* 响应区（仅 HTTP 模式） */}
            {mode === 'http' && (
                <div className={a.responseArea}>
                    <div className={a.respHead}>
                        {response ? (
                            <>
                                <span className={`${a.statusBadge} ${statusClass(response.statusCode, !!response.error)}`}>
                                    {response.error ? 'ERR' : response.statusCode || '-'}
                                </span>
                                <span className={a.statusText}>
                                    {response.error ? response.error : (response.status || '')}
                                </span>
                                <span className={a.respMeta}>{response.durationMs} ms</span>
                                <span className={a.respMeta}>
                                    {response.size >= 1024
                                        ? (response.size / 1024).toFixed(1) + ' KB'
                                        : response.size + ' B'}
                                </span>
                            </>
                        ) : (
                            <span className={a.respPlaceholder}>尚未发送请求</span>
                        )}
                        <span className={g.spacer}/>
                        {response && (
                            <div className={`${g.segmented} ${g.sm}`}>
                                <button
                                    className={respTab === 'body' ? g.active : ''}
                                    onClick={() => setRespTab('body')}
                                >响应体</button>
                                <button
                                    className={respTab === 'headers' ? g.active : ''}
                                    onClick={() => setRespTab('headers')}
                                >响应头</button>
                            </div>
                        )}
                    </div>

                    <div className={a.respBody}>
                        {!response && (
                            <div className={sh.respEmpty}>填写地址与方法后点击「发送」查看响应</div>
                        )}
                        {response && respTab === 'body' && (
                            <div className={a.respBodyWrap}>
                                <div className={a.respBodyTools}>
                                    <label className={sh.prettyCheck}>
                                        <input
                                            type="checkbox"
                                            checked={bodyPretty}
                                            onChange={(e) => setBodyPretty(e.target.checked)}
                                        />
                                        美化 JSON
                                    </label>
                                    <button
                                        className={`${g.btn} ${g.sm}`}
                                        onClick={() => copy(prettyBody)}
                                    >
                                        <Copy size={13}/> 复制
                                    </button>
                                </div>
                                <div className={a.respCodeWrap}>
                                    <CodeEditor
                                        value={prettyBody || '(空响应体)'}
                                        onChange={() => {}}
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
                                        <button
                                            className={`${g.iconBtn}`}
                                            title="复制"
                                            onClick={() => copy(`${k}: ${v}`)}
                                        >
                                            <Copy size={12}/>
                                        </button>
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
