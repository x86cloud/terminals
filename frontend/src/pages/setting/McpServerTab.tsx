import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
    Switch,
    InputNumber,
    Select,
    Button,
    Tag,
    App,
    Input,
    Tabs,
    Empty,
} from 'antd'
import {
    Server,
    RotateCw,
    Copy,
    Check,
    Search,
    ShieldCheck,
    Clock,
    Terminal,
    ChevronDown,
    ChevronUp,
    Activity,
} from 'lucide-react'
import { API } from '@/api'
import { copyText } from '@/utils'
import { McpServerStatus, McpSessionInfo, McpToolItem, AppSettings } from '@/types'
import { useTranslation } from 'react-i18next'
import s from './McpServerTab.module.less'

interface McpServerTabProps {
    mcpServerEnabled: boolean
    mcpServerPort: number
    mcpServerHost: string
    onChange: (fields: Partial<AppSettings>) => void
}

function formatUptime(seconds: number): string {
    if (!seconds || seconds <= 0) return '0s'
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const sec = seconds % 60
    if (h > 0) return `${h}h ${m}m ${sec}s`
    if (m > 0) return `${m}m ${sec}s`
    return `${sec}s`
}

export default function McpServerTab({
    mcpServerEnabled,
    mcpServerPort = 4096,
    mcpServerHost = '127.0.0.1',
    onChange,
}: McpServerTabProps) {
    const { t } = useTranslation(['settings', 'common'])
    const { message } = App.useApp()
    const [status, setStatus] = useState<McpServerStatus | null>(null)
    const [tools, setTools] = useState<McpToolItem[]>([])
    const [sessions, setSessions] = useState<McpSessionInfo[]>([])
    const [restarting, setRestarting] = useState(false)
    const [toolSearch, setToolSearch] = useState('')
    const [expandedTool, setExpandedTool] = useState<string | null>(null)
    const [copiedKey, setCopiedKey] = useState<string | null>(null)

    const mountedRef = useRef(true)
    const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    useEffect(() => {
        mountedRef.current = true
        return () => {
            mountedRef.current = false
            if (restartTimerRef.current) {
                clearTimeout(restartTimerRef.current)
                restartTimerRef.current = null
            }
            if (copyTimerRef.current) {
                clearTimeout(copyTimerRef.current)
                copyTimerRef.current = null
            }
        }
    }, [])

    const fetchStatusAndData = useCallback(async () => {
        try {
            const st = await API.getMcpServerStatus()
            if (!mountedRef.current) return
            setStatus(st)
            if (st && st.running) {
                const [toolList, sessList] = await Promise.all([
                    API.getMcpTools(),
                    API.getMcpSessions(),
                ])
                if (!mountedRef.current) return
                setTools(toolList || [])
                setSessions(sessList || [])
            } else {
                setSessions([])
            }
        } catch (e: any) {
            console.error('Failed to fetch MCP status', e)
        }
    }, [])

    useEffect(() => {
        fetchStatusAndData()
        const timer = setInterval(() => {
            fetchStatusAndData()
        }, 5000)
        return () => clearInterval(timer)
    }, [fetchStatusAndData])

    const handleToggleEnabled = async (checked: boolean) => {
        onChange({ mcpServerEnabled: checked })
        setRestarting(true)
        if (restartTimerRef.current) {
            clearTimeout(restartTimerRef.current)
            restartTimerRef.current = null
        }
        try {
            // Give settings a moment to persist then restart
            restartTimerRef.current = setTimeout(async () => {
                try {
                    const res = await API.restartMcpServer()
                    if (!mountedRef.current) return
                    setStatus(res)
                    await fetchStatusAndData()
                    setRestarting(false)
                    message.success(checked ? t('mcp.startedSuccess', { defaultValue: 'MCP 服务已启用并启动' }) : t('mcp.stoppedSuccess', { defaultValue: 'MCP 服务已停止' }))
                } catch (e: any) {
                    if (!mountedRef.current) return
                    setRestarting(false)
                    message.error(t('mcp.toggleFailed', { error: e?.message || e, defaultValue: `切换 MCP 服务状态失败: ${e?.message || e}` }))
                }
            }, 100)
        } catch (e: any) {
            setRestarting(false)
            message.error(t('mcp.toggleFailed', { error: e?.message || e, defaultValue: `切换 MCP 服务状态失败: ${e?.message || e}` }))
        }
    }

    const handleRestartServer = async () => {
        setRestarting(true)
        try {
            const res = await API.restartMcpServer()
            if (!mountedRef.current) return
            setStatus(res)
            await fetchStatusAndData()
            message.success(res.running ? t('mcp.restartSuccess', { defaultValue: 'MCP 服务已成功应用并重启' }) : t('mcp.stoppedSuccess', { defaultValue: 'MCP 服务已停止' }))
        } catch (e: any) {
            if (mountedRef.current) {
                message.error(t('mcp.restartFailed', { error: e?.message || e, defaultValue: `重启 MCP 服务失败: ${e?.message || e}` }))
            }
        } finally {
            if (mountedRef.current) {
                setRestarting(false)
            }
        }
    }

    const handleCopy = async (text: string, key: string) => {
        if (await copyText(text)) {
            if (!mountedRef.current) return
            setCopiedKey(key)
            message.success(t('common:copiedToClipboard', { defaultValue: '已复制到剪贴板' }))
            if (copyTimerRef.current) {
                clearTimeout(copyTimerRef.current)
                copyTimerRef.current = null
            }
            copyTimerRef.current = setTimeout(() => {
                if (mountedRef.current) {
                    setCopiedKey(null)
                }
            }, 2000)
        }
    }

    const filteredTools = useMemo(() => {
        if (!toolSearch.trim()) return tools
        const q = toolSearch.toLowerCase().trim()
        return tools.filter(
            (t) =>
                t.name.toLowerCase().includes(q) ||
                (t.description && t.description.toLowerCase().includes(q))
        )
    }, [tools, toolSearch])

    const sseUrl = status && status.endpoint ? status.endpoint : `http://${mcpServerHost || '127.0.0.1'}:${mcpServerPort || 4096}/sse`
    const messagesUrl = `http://${mcpServerHost || '127.0.0.1'}:${mcpServerPort || 4096}/messages`

    const claudeDesktopConfig = JSON.stringify(
        {
            mcpServers: {
                terminals: {
                    url: sseUrl,
                },
            },
        },
        null,
        2
    )

    const cursorConfig = JSON.stringify(
        {
            mcpServers: {
                terminals: {
                    url: sseUrl,
                },
            },
        },
        null,
        2
    )

    return (
        <div className={s.container}>
            {/* 顶栏说明 */}
            <div className={s.headerSection}>
                <div className={s.sectionTitle}>
                    <Server size={18} />
                    {t('mcp.headerTitle', 'MCP 协议服务 (Model Context Protocol)')}
                </div>
                <div className={s.sectionDesc}>
                    {t('mcp.headerDesc', '内置轻量原生 HTTP + SSE 协议 MCP 服务端，将 Terminals 的终端管理、Docker 容器、K8s 编排、数据库及各种自动化工具安全暴露给外部客户端（Claude Desktop、Cursor、Windsurf 等），实现一站式智能交互运维。')}
                </div>
            </div>

            {/* 服务运行控制与状态卡片 */}
            <div className={s.card}>
                <div className={s.cardTitle}>
                    <span>{t('mcp.cardTitle', '服务控制与配置')}</span>
                    <Button
                        size="small"
                        icon={<RotateCw size={13} className={restarting ? 'animate-spin' : ''} />}
                        loading={restarting}
                        onClick={handleRestartServer}
                    >
                        {t('mcp.applyAndRestart', '应用配置并重启服务')}
                    </Button>
                </div>

                <div className={s.controlRow}>
                    <div className={s.labelInfo}>
                        <div className={s.rowTitle}>{t('mcp.enableTitle', '启用 MCP 服务')}</div>
                        <div className={s.rowSub}>{t('mcp.enableDesc', '开启后将启动本地 HTTP + SSE 监听，供客户端连接')}</div>
                    </div>
                    <Switch
                        checked={mcpServerEnabled}
                        loading={restarting}
                        onChange={handleToggleEnabled}
                    />
                </div>

                <div className={s.controlRow}>
                    <div className={s.labelInfo}>
                        <div className={s.rowTitle}>{t('mcp.portTitle', '监听端口 (Port)')}</div>
                        <div className={s.rowSub}>{t('mcp.portDesc', 'MCP HTTP/SSE 服务的通信端口（默认 4096）')}</div>
                    </div>
                    <InputNumber
                        min={1024}
                        max={65535}
                        value={mcpServerPort}
                        onChange={(val) => onChange({ mcpServerPort: val || 4096 })}
                        style={{ width: 140 }}
                    />
                </div>

                <div className={s.controlRow}>
                    <div className={s.labelInfo}>
                        <div className={s.rowTitle}>{t('mcp.hostTitle', '绑定地址 (Host)')}</div>
                        <div className={s.rowSub}>{t('mcp.hostDesc', '仅本机 (127.0.0.1) 更安全，所有接口 (0.0.0.0) 支持跨主机')}</div>
                    </div>
                    <Select
                        value={mcpServerHost}
                        onChange={(val) => onChange({ mcpServerHost: val })}
                        style={{ width: 200 }}
                        options={[
                            { label: t('mcp.hostLocal', '127.0.0.1 (仅本机，推荐)'), value: '127.0.0.1' },
                            { label: t('mcp.hostAll', '0.0.0.0 (所有网卡/局域网)'), value: '0.0.0.0' },
                        ]}
                    />
                </div>

                {/* 运行状态横幅 */}
                <div className={`${s.statusBanner} ${status?.running ? s.running : s.stopped}`}>
                    <div className={s.statusHeader}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            {status?.running ? (
                                <Tag color="success" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: '#52c41a' }} />
                                    {t('mcp.active', '服务监听中 (Active)')}
                                </Tag>
                            ) : (
                                <Tag color="default" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: '#8c8c8c' }} />
                                    {t('mcp.stoppedStatus', '未启动 (Stopped)')}
                                </Tag>
                            )}
                            <span style={{ fontSize: 12, color: 'var(--text-dim, #666)' }}>
                                {status?.running
                                    ? t('mcp.boundTo', { host: status.host, port: status.port, defaultValue: `已绑定 ${status.host}:${status.port}` })
                                    : t('mcp.turnOnTip', '打开开关并点击重启以启动服务')}
                            </span>
                        </div>
                    </div>

                    {status?.running && (
                        <>
                            <div className={s.metricsGrid}>
                                <div className={s.metricCard}>
                                    <div className={s.metricLabel}>
                                        <Activity size={12} /> {t('mcp.activeSessions', '活跃连接数')}
                                    </div>
                                    <div className={s.metricVal}>{status.sessionsCount}</div>
                                </div>
                                <div className={s.metricCard}>
                                    <div className={s.metricLabel}>
                                        <Terminal size={12} /> {t('mcp.exposedTools', '暴露工具数')}
                                    </div>
                                    <div className={s.metricVal}>{status.toolsCount}</div>
                                </div>
                                <div className={s.metricCard}>
                                    <div className={s.metricLabel}>
                                        <Clock size={12} /> {t('mcp.uptime', '运行时间')}
                                    </div>
                                    <div className={s.metricVal}>{formatUptime(status.uptimeSeconds)}</div>
                                </div>
                            </div>

                            <div className={s.endpointBox}>
                                <span className={s.endpointLabel}>{t('mcp.sseEndpoint', 'SSE 端点:')}</span>
                                <span className={s.endpointUrl}>{sseUrl}</span>
                                <Button
                                    type="text"
                                    size="small"
                                    icon={copiedKey === 'sse' ? <Check size={13} color="#52c41a" /> : <Copy size={13} />}
                                    onClick={() => handleCopy(sseUrl, 'sse')}
                                >
                                    {t('common:copy', '复制')}
                                </Button>
                            </div>

                            <div className={s.endpointBox}>
                                <span className={s.endpointLabel}>{t('mcp.messagesEndpoint', '消息端点:')}</span>
                                <span className={s.endpointUrl}>{messagesUrl}</span>
                                <Button
                                    type="text"
                                    size="small"
                                    icon={copiedKey === 'messages' ? <Check size={13} color="#52c41a" /> : <Copy size={13} />}
                                    onClick={() => handleCopy(messagesUrl, 'messages')}
                                >
                                    {t('common:copy', '复制')}
                                </Button>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* 外部客户端接入指南 */}
            <div className={s.card}>
                <div className={s.cardTitle}>
                    <span>{t('mcp.clientIntegration', '客户端一键配置集成')}</span>
                    <Tag color="blue" icon={<ShieldCheck size={12} />}>
                        {t('mcp.noAuthBadge', '免授权免弹窗全通调用')}
                    </Tag>
                </div>

                <Tabs
                    size="small"
                    items={[
                        {
                            key: 'claude',
                            label: 'Claude Desktop',
                            children: (
                                <div className={s.configCard}>
                                    <div className={s.configHeader}>
                                        <span>{t('mcp.claudeHint', '将以下配置追加到 Claude Desktop 配置文件：')}</span>
                                        <Button
                                            type="primary"
                                            size="small"
                                            icon={copiedKey === 'claude_json' ? <Check size={13} /> : <Copy size={13} />}
                                            onClick={() => handleCopy(claudeDesktopConfig, 'claude_json')}
                                        >
                                            {t('mcp.copyJsonConfig', '复制 JSON 配置')}
                                        </Button>
                                    </div>
                                    <div className={s.filePathHint}>
                                        {t('mcp.claudePath', '配置文件路径: %APPDATA%\\Claude\\claude_desktop_config.json')}
                                    </div>
                                    <div className={s.codeBlock}>{claudeDesktopConfig}</div>
                                </div>
                            ),
                        },
                        {
                            key: 'cursor',
                            label: 'Cursor / Windsurf',
                            children: (
                                <div className={s.configCard}>
                                    <div className={s.configHeader}>
                                        <span>{t('mcp.cursorHint', '在 Cursor 中设置 MCP：')}</span>
                                        <Button
                                            type="primary"
                                            size="small"
                                            icon={copiedKey === 'cursor_url' ? <Check size={13} /> : <Copy size={13} />}
                                            onClick={() => handleCopy(sseUrl, 'cursor_url')}
                                        >
                                            {t('mcp.copySseUrl', '复制 SSE URL')}
                                        </Button>
                                    </div>
                                    <div className={s.filePathHint}>
                                        {t('mcp.cursorPath', '设置路径: Cursor Settings -> Features -> MCP -> Add New MCP Server')}
                                    </div>
                                    <div style={{ fontSize: 12, lineHeight: 1.6, color: 'var(--text, #333)' }}>
                                        <div><strong>Name:</strong> terminals</div>
                                        <div><strong>Type:</strong> sse</div>
                                        <div><strong>Server URL:</strong> {sseUrl}</div>
                                    </div>
                                    <div style={{ marginTop: 8 }}>
                                        <div style={{ fontSize: 11.5, color: 'var(--text-dim, #777)', marginBottom: 4 }}>
                                            {t('mcp.cursorOr', '或者将以下内容存入项目根目录')} <code>.cursor/mcp.json</code>:
                                        </div>
                                        <div className={s.codeBlock}>{cursorConfig}</div>
                                    </div>
                                </div>
                            ),
                        },
                    ]}
                />
            </div>

            {/* 活跃外部客户端会话 */}
            <div className={s.card}>
                <div className={s.cardTitle}>
                    <span>{t('mcp.connectedClients', '已连接外部客户端')} ({sessions.length})</span>
                    <Button
                        size="small"
                        icon={<RotateCw size={12} />}
                        onClick={fetchStatusAndData}
                    >
                        {t('common:refresh', '刷新')}
                    </Button>
                </div>

                {sessions.length === 0 ? (
                    <Empty
                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                        description={t('mcp.noClients', '暂无外部客户端连接。当 Claude Desktop 或 Cursor 启动并建立 SSE 连接后将在此展示。')}
                    />
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {sessions.map((sess) => (
                            <div key={sess.id} className={s.sessionItem}>
                                <div className={s.sessionMeta}>
                                    <div className={s.sessionId}>
                                        {t('mcp.session', '会话')}: {sess.id}
                                    </div>
                                    <div className={s.sessionClient}>
                                        {t('mcp.source', '来源')}: {sess.remoteAddr} | {t('mcp.client', '客户端')}: {sess.userAgent || 'Unknown MCP Client'}
                                    </div>
                                </div>
                                <div style={{ fontSize: 11, color: 'var(--text-dim, #888)', textAlign: 'right' }}>
                                    <div>{t('mcp.connectedAt', '建立时间')}: {sess.connectedAt}</div>
                                    <div>{t('mcp.lastActiveAt', '活跃于')}: {sess.lastActiveAt}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* 对外暴露工具列表 */}
            <div className={s.card}>
                <div className={s.cardTitle}>
                    <span>{t('mcp.toolsList', '已暴露 MCP 工具清单')} ({filteredTools.length} / {tools.length})</span>
                    <Button
                        size="small"
                        icon={<RotateCw size={12} />}
                        onClick={fetchStatusAndData}
                    >
                        {t('mcp.refreshTools', '刷新工具')}
                    </Button>
                </div>

                <div className={s.toolsToolbar}>
                    <Input
                        prefix={<Search size={14} style={{ color: 'var(--text-dim, #999)' }} />}
                        placeholder={t('mcp.searchToolsPlaceholder', '搜索工具名称或功能描述...')}
                        value={toolSearch}
                        onChange={(e) => setToolSearch(e.target.value)}
                        allowClear
                        style={{ maxWidth: 360 }}
                    />
                </div>

                {filteredTools.length === 0 ? (
                    <Empty
                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                        description={status?.running ? t('mcp.noMatchingTools', '未找到匹配的工具') : t('mcp.startMcpFirst', '请先启动 MCP 服务')}
                    />
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {filteredTools.map((tool) => {
                            const isExpanded = expandedTool === tool.name
                            const paramCount = tool.inputSchema?.properties
                                ? Object.keys(tool.inputSchema.properties).length
                                : 0

                            return (
                                <div key={tool.name} className={s.toolItem}>
                                    <div className={s.toolHeader}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <span className={s.toolName}>{tool.name}</span>
                                            <Tag color="cyan">{t('mcp.paramsCount', { count: paramCount, defaultValue: `${paramCount} 个参数` })}</Tag>
                                            <Tag color="green">{t('mcp.noAuthTag', '免授权全通')}</Tag>
                                        </div>
                                        <Button
                                            type="text"
                                            size="small"
                                            icon={isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                                            onClick={() => setExpandedTool(isExpanded ? null : tool.name)}
                                        >
                                            {isExpanded ? t('mcp.collapseSchema', '收起 Schema') : t('mcp.viewSchema', '查看 Schema')}
                                        </Button>
                                    </div>
                                    {tool.description && (
                                        <div className={s.toolDesc}>{tool.description}</div>
                                    )}
                                    {isExpanded && (
                                        <div className={s.schemaPreview}>
                                            {JSON.stringify(tool.inputSchema, null, 2)}
                                        </div>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>
        </div>
    )
}
