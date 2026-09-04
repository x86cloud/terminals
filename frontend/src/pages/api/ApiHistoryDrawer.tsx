import React, { useMemo, useState } from 'react'
import { Drawer, Tabs, Tag, Button, Tooltip, message, Checkbox, Space, Alert } from 'antd'
import { Copy, RotateCcw, Send, Check, Terminal, Globe, Shield, Settings, Info, AlertCircle } from 'lucide-react'
import CodeEditor from '@/components/CodeEditor'
import { buildCurlCommand, formatHistoryTime, looksLikeJson, parseUrlParams } from './apiTypes'
import type { ApiHistoryItem } from './apiTypes'
import type { ApiState } from './useApi'
import a from './ApiHistoryDrawer.module.less'

interface Props {
    state: ApiState
    open: boolean
    item: ApiHistoryItem | null
    onClose: () => void
}

export default function ApiHistoryDrawer({ state, open, item, onClose }: Props) {
    const [copiedCurl, setCopiedCurl] = useState(false)
    const [copiedBody, setCopiedBody] = useState(false)
    const [copiedRespBody, setCopiedRespBody] = useState(false)
    const [reqBodyPretty, setReqBodyPretty] = useState(true)
    const [respBodyPretty, setRespBodyPretty] = useState(true)

    const isWs = item?.mode === 'ws' || item?.method === ('WS' as any)

    const curlCommand = useMemo(() => {
        if (!item || isWs) return ''
        return buildCurlCommand(item)
    }, [item, isWs])

    const prettyReqBody = useMemo(() => {
        if (!item?.body) return ''
        if (reqBodyPretty && (item.bodyType === 'json' || looksLikeJson(item.body))) {
            try {
                return JSON.stringify(JSON.parse(item.body), null, 2)
            } catch {
                return item.body
            }
        }
        return item.body
    }, [item?.body, item?.bodyType, reqBodyPretty])

    const response = item?.response
    const effectiveStatusCode = response?.statusCode || item?.statusCode || 0
    const effectiveError = item?.error || response?.error || ''
    const effectiveDuration = response?.durationMs ?? item?.durationMs ?? 0
    const effectiveSize = response?.size ?? 0
    const effectiveBody = response?.body || ''

    const prettyRespBody = useMemo(() => {
        if (!effectiveBody) return ''
        if (respBodyPretty) {
            const headers = response?.headers || {}
            const ct = Object.entries(headers).find(([k]) => k.toLowerCase() === 'content-type')?.[1] ?? ''
            if (ct.includes('json') || looksLikeJson(effectiveBody)) {
                try {
                    return JSON.stringify(JSON.parse(effectiveBody), null, 2)
                } catch {
                    return effectiveBody
                }
            }
        }
        return effectiveBody
    }, [effectiveBody, response?.headers, respBodyPretty])

    const methodColors: Record<string, string> = {
        GET: 'green',
        POST: 'orange',
        PUT: 'blue',
        DELETE: 'red',
        PATCH: 'purple',
        HEAD: 'cyan',
        OPTIONS: 'default',
        WS: 'geekblue',
    }

    if (!item) return null

    const handleCopy = (text: string, type: 'curl' | 'body' | 'respBody') => {
        if (!text) return
        state.copy(text)
        if (type === 'curl') {
            setCopiedCurl(true)
            setTimeout(() => setCopiedCurl(false), 2000)
        } else if (type === 'body') {
            setCopiedBody(true)
            setTimeout(() => setCopiedBody(false), 2000)
        } else {
            setCopiedRespBody(true)
            setTimeout(() => setCopiedRespBody(false), 2000)
        }
    }

    const handleRestore = () => {
        state.loadHistory(item)
        onClose()
    }

    const handleSendNow = () => {
        state.loadHistory(item)
        onClose()
        setTimeout(() => {
            if (isWs) {
                state.wsConnect()
            } else {
                state.doSend()
            }
        }, 100)
    }

    const respHeaders = response ? Object.entries(response.headers || {}) : []
    const reqHeaders = item.headers?.filter((h) => h.enabled && h.name.trim()) || []
    const reqQuery = item.params?.filter((p) => p.enabled && p.name.trim()) || 
        (item.url ? parseUrlParams(item.url).params : [])

    return (
        <Drawer
            title={
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Tag color={isWs ? 'geekblue' : methodColors[item.method] || 'default'}>
                        {isWs ? 'WS' : item.method}
                    </Tag>
                    <span>历史请求报文详情</span>
                </div>
            }
            open={open}
            onClose={onClose}
            width={740}
            destroyOnClose
            extra={
                <Space>
                    <Button size="small" icon={<RotateCcw size={13} />} onClick={handleRestore}>
                        恢复到编辑器
                    </Button>
                    <Button size="small" type="primary" icon={<Send size={13} />} onClick={handleSendNow}>
                        {isWs ? '立即连接' : '立即重发'}
                    </Button>
                </Space>
            }
        >
            <div className={a.drawerBody}>
                {/* 概览卡片 */}
                <div className={a.summaryCard}>
                    <div className={a.summaryTop}>
                        <div className={a.summaryTags}>
                            <Tag color={isWs ? 'geekblue' : methodColors[item.method] || 'default'}>
                                {isWs ? 'WS' : item.method}
                            </Tag>
                            {effectiveError ? (
                                <Tag color="error">失败: {effectiveError}</Tag>
                            ) : isWs ? (
                                <Tag color={effectiveStatusCode === 101 ? 'success' : 'default'}>
                                    {effectiveStatusCode === 101 ? '已连接' : '连接关闭'}
                                </Tag>
                            ) : (
                                <Tag color={effectiveStatusCode >= 200 && effectiveStatusCode < 300 ? 'success' : effectiveStatusCode >= 400 ? 'error' : 'warning'}>
                                    状态码: {effectiveStatusCode || '-'}
                                </Tag>
                            )}
                            {effectiveDuration > 0 && <Tag color="geekblue">{effectiveDuration} ms</Tag>}
                            {effectiveSize > 0 && (
                                <Tag color="purple">
                                    {effectiveSize >= 1024
                                        ? (effectiveSize / 1024).toFixed(1) + ' KB'
                                        : effectiveSize + ' B'}
                                </Tag>
                            )}
                        </div>
                        <span className={a.summaryTime}>
                            {new Date(item.at).toLocaleString()}
                        </span>
                    </div>
                    <div className={a.urlRow}>
                        <Globe size={14} style={{ color: 'var(--text-dim)', flexShrink: 0 }} />
                        <span className={a.urlText}>{item.url}</span>
                        <Tooltip title="复制 URL">
                            <Button
                                size="small"
                                type="text"
                                icon={<Copy size={12} />}
                                onClick={() => {
                                    state.copy(item.url)
                                }}
                            />
                        </Tooltip>
                    </div>
                </div>

                {/* 选项卡内容 */}
                <Tabs
                    defaultActiveKey="request"
                    items={[
                        {
                            key: 'request',
                            label: '请求报文 (Request)',
                            children: (
                                <div className={a.tabContent}>
                                    {/* Params */}
                                    <div className={a.section}>
                                        <div className={a.sectionHeader}>
                                            <span className={a.sectionTitle}>Query 参数 ({reqQuery.length})</span>
                                        </div>
                                        {reqQuery.length === 0 ? (
                                            <div className={a.emptyTip}>无 Query 参数</div>
                                        ) : (
                                            <div className={a.kvTable}>
                                                {reqQuery.map((p, i) => (
                                                    <div key={i} className={a.kvRow}>
                                                        <span className={a.kvKey}>{p.name}</span>
                                                        <span className={a.kvVal}>{p.value}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    {/* Headers */}
                                    <div className={a.section}>
                                        <div className={a.sectionHeader}>
                                            <span className={a.sectionTitle}>请求头 Headers ({reqHeaders.length})</span>
                                        </div>
                                        {reqHeaders.length === 0 ? (
                                            <div className={a.emptyTip}>无自定义请求头</div>
                                        ) : (
                                            <div className={a.kvTable}>
                                                {reqHeaders.map((h, i) => (
                                                    <div key={i} className={a.kvRow}>
                                                        <span className={a.kvKey}>{h.name}</span>
                                                        <span className={a.kvVal}>{h.value}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    {/* Body (HTTP only) */}
                                    {!isWs && (
                                        <div className={a.section}>
                                            <div className={a.codeHeader}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                    <span className={a.sectionTitle}>请求体 Body</span>
                                                    <Tag color="cyan">{item.bodyType || 'none'}</Tag>
                                                </div>
                                                {item.body && (
                                                    <Space>
                                                        <Checkbox
                                                            checked={reqBodyPretty}
                                                            onChange={(e) => setReqBodyPretty(e.target.checked)}
                                                        >
                                                            美化 JSON
                                                        </Checkbox>
                                                        <Button
                                                            size="small"
                                                            icon={copiedBody ? <Check size={12} /> : <Copy size={12} />}
                                                            onClick={() => handleCopy(prettyReqBody, 'body')}
                                                        >
                                                            复制
                                                        </Button>
                                                    </Space>
                                                )}
                                            </div>
                                            {!item.body || item.bodyType === 'none' ? (
                                                <div className={a.emptyTip}>无请求体内容</div>
                                            ) : (
                                                <div className={a.editorContainer}>
                                                    <CodeEditor
                                                        value={prettyReqBody}
                                                        onChange={() => { }}
                                                        lang={item.bodyType === 'json' || looksLikeJson(item.body) ? 'json' : 'plain'}
                                                        height="100%"
                                                        readOnly
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Auth */}
                                    {item.auth && item.auth.type !== 'none' && (
                                        <div className={a.section}>
                                            <div className={a.sectionHeader}>
                                                <span className={a.sectionTitle}>鉴权配置 Auth</span>
                                            </div>
                                            <div className={a.authBox}>
                                                <div className={a.authItem}>
                                                    <Shield size={14} />
                                                    <strong>类型:</strong>
                                                    <Tag color="blue">{item.auth.type.toUpperCase()}</Tag>
                                                </div>
                                                {item.auth.type === 'bearer' && (
                                                    <div className={a.authItem}>
                                                        <strong>Token:</strong>
                                                        <span style={{ fontFamily: 'monospace' }}>{item.auth.token}</span>
                                                    </div>
                                                )}
                                                {item.auth.type === 'basic' && (
                                                    <div className={a.authItem}>
                                                        <strong>Username:</strong> <span>{item.auth.username}</span> | <strong>Password:</strong> <span>******</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {/* Options */}
                                    <div className={a.section}>
                                        <div className={a.sectionHeader}>
                                            <span className={a.sectionTitle}>高级选项 Options</span>
                                        </div>
                                        <div className={a.authBox}>
                                            <div className={a.authItem}>
                                                <Settings size={14} />
                                                <span>超时时间: {item.timeoutMs ? `${item.timeoutMs / 1000}s` : '30s'}</span>
                                                <span> | 忽略 TLS 证书: {item.insecureTLS ? '开启' : '关闭'}</span>
                                                {!isWs && <span> | 跟随重定向: {item.followRedirects ? '开启' : '关闭'}</span>}
                                                {isWs && item.wsProtocols && <span> | 子协议: {item.wsProtocols}</span>}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ),
                        },
                        {
                            key: 'response',
                            label: '响应报文 (Response)',
                            children: (
                                <div className={a.tabContent}>
                                    {/* 响应状态概览 */}
                                    <div className={a.section}>
                                        <div className={a.sectionHeader}>
                                            <span className={a.sectionTitle}>响应状态 (Response Status)</span>
                                        </div>
                                        <div className={a.authBox}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                                {effectiveError ? (
                                                    <Tag color="error">请求失败</Tag>
                                                ) : isWs ? (
                                                    <Tag color={effectiveStatusCode === 101 ? 'success' : 'default'}>
                                                        {effectiveStatusCode === 101 ? '101 Switching Protocols' : '断开'}
                                                    </Tag>
                                                ) : (
                                                    <Tag color={effectiveStatusCode >= 200 && effectiveStatusCode < 300 ? 'success' : effectiveStatusCode >= 400 ? 'error' : 'warning'}>
                                                        {response?.status || `HTTP ${effectiveStatusCode}`}
                                                    </Tag>
                                                )}
                                                {response?.proto && <Tag color="default">{response.proto}</Tag>}
                                                {effectiveDuration > 0 && <Tag color="geekblue">耗时: {effectiveDuration} ms</Tag>}
                                                {effectiveSize > 0 && (
                                                    <Tag color="purple">
                                                        大小: {effectiveSize >= 1024 ? (effectiveSize / 1024).toFixed(1) + ' KB' : `${effectiveSize} B`}
                                                    </Tag>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* 错误提示 */}
                                    {effectiveError && (
                                        <Alert
                                            type="error"
                                            showIcon
                                            message="请求发生异常 / 网络错误"
                                            description={effectiveError}
                                        />
                                    )}

                                    {/* 旧版历史无响应快照提示 */}
                                    {!response && !effectiveError && !isWs && (
                                        <Alert
                                            type="info"
                                            showIcon
                                            message="历史响应快照未保存"
                                            description="该条记录生成于历史快照功能升级前，未保存响应体。您可以点击右上角「立即重发」或「恢复到编辑器」重新发送请求以保存完整响应。"
                                        />
                                    )}

                                    {/* 响应头 */}
                                    {!isWs && (
                                        <div className={a.section}>
                                            <div className={a.sectionHeader}>
                                                <span className={a.sectionTitle}>响应头 Response Headers ({respHeaders.length})</span>
                                            </div>
                                            {respHeaders.length === 0 ? (
                                                <div className={a.emptyTip}>无响应头</div>
                                            ) : (
                                                <div className={a.kvTable}>
                                                    {respHeaders.map(([k, v]) => (
                                                        <div key={k} className={a.kvRow}>
                                                            <span className={a.kvKey}>{k}</span>
                                                            <span className={a.kvVal}>{v}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* 响应体 */}
                                    {!isWs && (
                                        <div className={a.section}>
                                            <div className={a.codeHeader}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                    <span className={a.sectionTitle}>响应体 Response Body</span>
                                                    {effectiveBody && (
                                                        <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>
                                                            ({effectiveBody.length} 字符)
                                                        </span>
                                                    )}
                                                </div>
                                                {effectiveBody && (
                                                    <Space>
                                                        <Checkbox
                                                            checked={respBodyPretty}
                                                            onChange={(e) => setRespBodyPretty(e.target.checked)}
                                                        >
                                                            美化 JSON
                                                        </Checkbox>
                                                        <Button
                                                            size="small"
                                                            icon={copiedRespBody ? <Check size={12} /> : <Copy size={12} />}
                                                            onClick={() => handleCopy(prettyRespBody, 'respBody')}
                                                        >
                                                            复制响应体
                                                        </Button>
                                                    </Space>
                                                )}
                                            </div>
                                            {!effectiveBody ? (
                                                <div className={a.emptyTip}>
                                                    {effectiveError
                                                        ? '请求异常，未获得有效响应体'
                                                        : !response
                                                            ? '该记录无已保存的响应体快照'
                                                            : `响应体为空 (状态码: ${effectiveStatusCode || '-'})`}
                                                </div>
                                            ) : (
                                                <div className={a.editorContainer}>
                                                    <CodeEditor
                                                        value={prettyRespBody}
                                                        onChange={() => { }}
                                                        lang={looksLikeJson(effectiveBody) ? 'json' : 'plain'}
                                                        height="100%"
                                                        readOnly
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {isWs && (
                                        <div className={a.emptyTip}>
                                            WebSocket 连接建立快照（状态: {effectiveStatusCode === 101 ? '成功连接' : '连接失败/已断开'}）
                                        </div>
                                    )}
                                </div>
                            ),
                        },
                        ...(!isWs
                            ? [
                                {
                                    key: 'curl',
                                    label: 'cURL 命令行',
                                    children: (
                                        <div className={a.tabContent}>
                                            <div className={a.section}>
                                                <div className={a.codeHeader}>
                                                    <span className={a.sectionTitle}>生成的 cURL 命令</span>
                                                    <Button
                                                        size="small"
                                                        type="primary"
                                                        icon={copiedCurl ? <Check size={12} /> : <Copy size={12} />}
                                                        onClick={() => handleCopy(curlCommand, 'curl')}
                                                    >
                                                        复制 cURL
                                                    </Button>
                                                </div>
                                                <div className={a.editorContainer} style={{ height: 260 }}>
                                                    <CodeEditor
                                                        value={curlCommand}
                                                        onChange={() => { }}
                                                        lang="plain"
                                                        height="100%"
                                                        readOnly
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    ),
                                },
                            ]
                            : []),
                    ]}
                />
            </div>
        </Drawer>
    )
}
