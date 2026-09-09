import React, { useEffect, useMemo, useState } from 'react'
import { Select, Input, Button, Segmented, Space, Tag, Checkbox, Tooltip, Alert, message } from 'antd'
import { X, Copy, PanelLeft, Send, Save, Globe, Radio, CheckCircle, Clock, Database, Download, Edit2, Trash2 } from 'lucide-react'
import CodeEditor from '@/components/CodeEditor'
import a from '@/pages/api/HttpRequest.module.less'
import { findTreeNode } from '@/pages/api/apiTypes'
import type { ApiState } from '@/pages/api/useApi'

const methodColorMap: Record<string, string> = {
    GET: '#52c41a',
    POST: '#fa8c16',
    PUT: '#1677ff',
    DELETE: '#ff4d4f',
    PATCH: '#722ed1',
    HEAD: '#13c2c2',
    OPTIONS: '#8c8c8c',
}

export function HttpToolbar({ state, onClose }: { state: ApiState; onClose: () => void }) {
    const {
        mode, wsStatus, wsConnect, wsDisconnect, wsConnecting, wsSendMsg,
        method, setMethod, methods, url, updateUrl, doSend, sending, showHistory, setShowHistory,
        currentApiName, currentApiId, renameTreeNode, saveCurrentApi, setSaveModalOpen, setSaveModalMode,
        params, headers, bodyType, body, auth, timeoutMs, insecureTLS, followRedirects, apiTree, isModified,
    } = state

    const [isEditingName, setIsEditingName] = useState(false)
    const [editingNameValue, setEditingNameValue] = useState('')

    const startEditingName = () => {
        if (!currentApiName) return
        setEditingNameValue(currentApiName)
        setIsEditingName(true)
    }

    const saveEditingName = () => {
        const val = editingNameValue.trim()
        if (val && currentApiId) {
            renameTreeNode(currentApiId, val)
        }
        setIsEditingName(false)
    }

    const handleSaveClick = () => {
        if (currentApiId) {
            saveCurrentApi()
        } else {
            setSaveModalMode('save')
            setSaveModalOpen(true)
        }
    }

    // 快捷键 Ctrl+S / Cmd+S 快速保存
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
                e.preventDefault()
                handleSaveClick()
            }
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [currentApiId, saveCurrentApi, setSaveModalMode, setSaveModalOpen])

    const methodOptions = methods.map((m) => ({
        value: m,
        label: (
            <span style={{ color: methodColorMap[m] || 'inherit', fontWeight: 700, fontSize: 13 }}>
                {m}
            </span>
        ),
    }))

    return (
        <div className={a.apiToolbar}>
            <Tooltip title={showHistory ? '隐藏接口列表' : '显示接口列表'}>
                <Button
                    type="text"
                    style={{ flexShrink: 0, height: 34, width: 34, padding: 0 }}
                    icon={<PanelLeft size={16} />}
                    onClick={() => setShowHistory((v) => !v)}
                />
            </Tooltip>

            <Segmented
                value={mode}
                style={{ flexShrink: 0, height: 34, display: 'flex', alignItems: 'center' }}
                onChange={(v) => state.wsSwitchMode(v as any)}
                options={[
                    { label: 'HTTP', value: 'http' },
                    { label: 'WebSocket', value: 'ws' },
                ]}
            />

            {mode === 'http' && (
                <Select
                    style={{ flexShrink: 0, width: 105, height: 34 }}
                    value={method}
                    onChange={(v) => setMethod(v as ApiState['method'])}
                    options={methodOptions}
                />
            )}

            <Input
                style={{ flex: '1 1 100px', minWidth: 80, height: 34, fontSize: 13 }}
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

            {/* 当前接口名称提示与修改 */}
            {currentApiName && (
                isEditingName ? (
                    <Input
                        autoFocus
                        style={{ flexShrink: 0, width: 140, height: 34, fontSize: 13 }}
                        value={editingNameValue}
                        placeholder="输入新接口名称"
                        onChange={(e) => setEditingNameValue(e.target.value)}
                        onBlur={saveEditingName}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                e.preventDefault()
                                saveEditingName()
                            } else if (e.key === 'Escape') {
                                setIsEditingName(false)
                            }
                        }}
                    />
                ) : (
                    <Tooltip title="点击修改接口名称">
                        <Tag
                            color="blue"
                            style={{
                                flexShrink: 1,
                                height: 34,
                                lineHeight: '32px',
                                fontSize: 13,
                                padding: '0 8px 0 10px',
                                maxWidth: 140,
                                minWidth: 50,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                marginInlineEnd: 0,
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                            }}
                            onClick={startEditingName}
                        >
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{currentApiName}</span>
                            <Edit2 size={12} style={{ opacity: 0.7, flexShrink: 0 }} />
                        </Tag>
                    </Tooltip>
                )
            )}

            {/* 保存修改按钮 */}
            <Tooltip title={currentApiId ? (isModified ? '接口内容已变更，点击保存修改 (Ctrl+S)' : '当前配置已保存 (Ctrl+S)') : '保存为新接口 (Ctrl+S)'}>
                <Button
                    style={{
                        flexShrink: 0,
                        height: 34,
                        padding: '0 14px',
                        fontWeight: isModified ? 600 : 400,
                        borderColor: isModified ? '#1677ff' : undefined,
                        color: isModified ? '#1677ff' : undefined,
                        background: isModified ? 'rgba(22, 119, 255, 0.08)' : undefined,
                    }}
                    icon={<Save size={14} />}
                    onClick={handleSaveClick}
                >
                    {isModified ? '保存*' : '保存'}
                </Button>
            </Tooltip>

            {mode === 'ws' ? (
                wsStatus === 'open' ? (
                    <Button danger style={{ flexShrink: 0, height: 34, padding: '0 16px' }} onClick={wsDisconnect}>
                        断开
                    </Button>
                ) : (
                    <Button
                        type="primary"
                        style={{ flexShrink: 0, height: 34, padding: '0 16px', fontWeight: 600 }}
                        loading={wsConnecting}
                        onClick={wsConnect}
                    >
                        连接
                    </Button>
                )
            ) : (
                <Button
                    type="primary"
                    style={{ flexShrink: 0, height: 34, padding: '0 16px', fontWeight: 600 }}
                    icon={<Send size={14} />}
                    loading={sending}
                    onClick={doSend}
                >
                    发送
                </Button>
            )}
        </div>
    )
}

export function HttpResponseArea({ state }: { state: ApiState }) {
    const {
        response, respTab, setRespTab, prettyBody, respLang, respHeaders, bodyPretty, setBodyPretty, copy,
    } = state

    const downloadResponse = () => {
        if (!response?.body) return
        const blob = new Blob([response.body], { type: 'text/plain;charset=utf-8' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `response_${Date.now()}.${respLang === 'json' ? 'json' : 'txt'}`
        a.click()
        URL.revokeObjectURL(url)
    }

    return (
        <div className={a.responseArea}>
            <div className={a.respHead}>
                {response ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Tag
                            color={response.error ? 'error' : response.statusCode >= 200 && response.statusCode < 300 ? 'success' : response.statusCode >= 400 ? 'error' : 'warning'}
                            style={{ fontWeight: 700, padding: '2px 8px', fontSize: 13 }}
                        >
                            {response.error
                                ? 'ERR'
                                : response.status
                                    ? (response.status.startsWith(String(response.statusCode))
                                        ? response.status
                                        : `${response.statusCode} ${response.status}`.trim())
                                    : `${response.statusCode || 'OK'}`}
                        </Tag>
                        {response.durationMs > 0 && (
                            <Tag color="geekblue" icon={<Clock size={12} style={{ verticalAlign: -1, marginRight: 4 }} />} style={{ padding: '2px 8px', fontSize: 12 }}>
                                {response.durationMs} ms
                            </Tag>
                        )}
                        {response.size > 0 && (
                            <Tag color="purple" icon={<Database size={12} style={{ verticalAlign: -1, marginRight: 4 }} />} style={{ padding: '2px 8px', fontSize: 12 }}>
                                {response.size >= 1024
                                    ? (response.size / 1024).toFixed(1) + ' KB'
                                    : response.size + ' B'}
                            </Tag>
                        )}
                    </div>
                ) : (
                    <span className={a.respPlaceholder}>响应报文 (Response)</span>
                )}
                {response && (
                    <Segmented
                        value={respTab}
                        onChange={(v) => setRespTab(v as any)}
                        options={[
                            { label: `响应体 (${respLang.toUpperCase()})`, value: 'body' },
                            { label: `响应头 (${respHeaders.length})`, value: 'headers' },
                        ]}
                    />
                )}
            </div>

            <div className={a.respBody}>
                {!response && (
                    <div className={a.emptyStateWrap}>
                        <Globe size={44} style={{ opacity: 0.3 }} />
                        <div style={{ fontSize: 14, fontWeight: 600 }}>准备就绪</div>
                        <div style={{ fontSize: 13, opacity: 0.75, maxWidth: 380 }}>
                            输入目标地址并配置请求参数后，点击「发送」或按 <kbd style={{ padding: '2px 6px', background: 'var(--bg-3)', borderRadius: 3, border: '1px solid var(--border)' }}>Ctrl + Enter</kbd> 查看即时响应数据
                        </div>
                    </div>
                )}

                {response && respTab === 'body' && (
                    <div className={a.respBodyWrap}>
                        {response.error && (
                            <div style={{ padding: '10px 14px' }}>
                                <Alert
                                    type="error"
                                    showIcon
                                    message="请求失败"
                                    description={response.error}
                                />
                            </div>
                        )}
                        <div className={a.respBodyTools}>
                            <Checkbox
                                checked={bodyPretty}
                                onChange={(e) => setBodyPretty(e.target.checked)}
                            >
                                美化 JSON
                            </Checkbox>
                            <Button
                                icon={<Copy size={13} />}
                                onClick={() => copy(prettyBody)}
                                disabled={!prettyBody}
                            >
                                复制
                            </Button>
                            <Button
                                icon={<Download size={13} />}
                                onClick={downloadResponse}
                                disabled={!response.body}
                            >
                                下载
                            </Button>
                            <Button
                                icon={<Trash2 size={13} />}
                                onClick={state.clearResponse}
                                disabled={!response}
                            >
                                清空
                            </Button>
                        </div>
                        <div className={a.respCodeWrap}>
                            <CodeEditor
                                value={prettyBody || (response.error ? `// 错误: ${response.error}` : '(空响应体)')}
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
                        {respHeaders.length === 0 && <div className={a.emptyStateWrap}>无响应头</div>}
                        {respHeaders.map(([k, v]) => (
                            <div key={k} className={a.respHeaderRow}>
                                <span className={a.respHeaderKey}>{k}</span>
                                <span className={a.respHeaderVal}>{v}</span>
                                <Tooltip title="复制响应头">
                                    <Button
                                        type="text"
                                        style={{ height: 26, width: 26, padding: 0 }}
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
    )
}

export default function HttpRequest({ state, onClose }: { state: ApiState; onClose: () => void }) {
    return (
        <>
            <HttpToolbar state={state} onClose={onClose} />
            {state.mode === 'http' && <HttpResponseArea state={state} />}
        </>
    )
}
