import React, { useEffect, useRef, useState, useCallback } from 'react'
import { Modal, Space, Tag, Button, Tooltip, message } from 'antd'
import {
    Terminal as TerminalIcon,
    RotateCw,
    Eraser,
    X,
    Copy,
} from 'lucide-react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'
import { API, subscribe } from '@/api'
import { base64ToBytes } from '@/utils'
import { useTheme } from '@/contexts/ThemeContext'

export interface ContainerExecTarget {
    type: 'docker' | 'k8s'
    serverId: string
    title: string
    // Docker 专属属性
    containerId?: string
    // K8s 专属属性
    namespace?: string
    podName?: string
    containerName?: string
    image?: string
}

interface Props {
    open: boolean
    onClose: () => void
    target: ContainerExecTarget | null
}

const LIGHT_TERM_THEME = {
    background: '#ffffff',
    foreground: '#1f2733',
    cursor: '#255cd8',
    selectionBackground: '#cfe4f1',
    black: '#1f2733',
    red: '#d6453f',
    green: '#1c8830',
    yellow: '#9a6700',
    blue: '#0969da',
    magenta: '#8250df',
    cyan: '#1c8fc4',
    white: '#6b7686',
    brightBlack: '#6b7686',
    brightRed: '#e5534b',
    brightGreen: '#2a8536',
    brightYellow: '#bf8700',
    brightBlue: '#218bff',
    brightMagenta: '#a371f7',
    brightCyan: '#39c5de',
    brightWhite: '#1f2733',
}

const DARK_TERM_THEME = {
    background: '#141619',
    foreground: '#e1e4ea',
    cursor: '#29b6f6',
    selectionBackground: '#304d6d',
    black: '#141619',
    red: '#ef5350',
    green: '#66bb6a',
    yellow: '#ffa726',
    blue: '#42a5f5',
    magenta: '#ab47bc',
    cyan: '#26c6da',
    white: '#e1e4ea',
    brightBlack: '#606673',
    brightRed: '#ff7371',
    brightGreen: '#81c784',
    brightYellow: '#ffb74d',
    brightBlue: '#64b5f6',
    brightMagenta: '#ba68c8',
    brightCyan: '#4dd0e1',
    brightWhite: '#ffffff',
}

export default function ContainerTerminalModal({ open, onClose, target }: Props) {
    const { isDark } = useTheme()
    const hostRef = useRef<HTMLDivElement>(null)
    const termRef = useRef<Terminal | null>(null)
    const fitRef = useRef<FitAddon | null>(null)
    const execIdRef = useRef<string | null>(null)

    const [status, setStatus] = useState<'connecting' | 'connected' | 'closed'>('connecting')

    // 清理并断开终端会话
    const cleanSession = useCallback(() => {
        if (execIdRef.current) {
            const id = execIdRef.current
            execIdRef.current = null
            if (target?.type === 'docker') {
                API.dockerExecClose(id).catch(() => undefined)
            } else if (target?.type === 'k8s') {
                API.k8sExecClose(id).catch(() => undefined)
            }
        }
    }, [target])

    // 建立终端连接
    const connectTerminal = useCallback(async () => {
        if (!open || !target || !target.serverId) return

        cleanSession()
        setStatus('connecting')

        if (termRef.current) {
            termRef.current.reset()
        }

        try {
            const cols = termRef.current?.cols || 120
            const rows = termRef.current?.rows || 32
            let execId = ''

            if (target.type === 'docker') {
                if (!target.containerId) {
                    throw new Error('未指定 Docker 容器 ID')
                }
                execId = await API.dockerExecStart(
                    target.serverId,
                    target.containerId,
                    '/bin/sh',
                    cols,
                    rows
                )
            } else if (target.type === 'k8s') {
                if (!target.namespace || !target.podName || !target.containerName) {
                    throw new Error('缺少 Kubernetes Pod 容器参数')
                }
                execId = await API.k8sExecStart(
                    target.serverId,
                    target.namespace,
                    target.podName,
                    target.containerName,
                    '/bin/sh',
                    cols,
                    rows
                )
            }

            execIdRef.current = execId
            setStatus('connected')
            if (termRef.current) {
                termRef.current.focus()
            }
        } catch (err: any) {
            setStatus('closed')
            termRef.current?.writeln(`\r\n\x1b[31m[连接终端失败] ${err?.message || err}\x1b[0m\r\n`)
        }
    }, [open, target, cleanSession])

    // 初始化 Terminal 实例
    useEffect(() => {
        if (!open || !target) return

        let resizeObserver: ResizeObserver | null = null

        const timer = setTimeout(() => {
            const host = hostRef.current
            if (!host) return

            const term = new Terminal({
                fontFamily: 'Consolas, "Courier New", monospace, "Cascadia Mono", "JetBrains Mono"',
                fontSize: 13,
                lineHeight: 1.25,
                cursorBlink: true,
                scrollback: 10000,
                theme: isDark ? DARK_TERM_THEME : LIGHT_TERM_THEME,
            })
            const fit = new FitAddon()
            term.loadAddon(fit)
            term.loadAddon(new WebLinksAddon())

            term.open(host)
            termRef.current = term
            fitRef.current = fit

            try {
                fit.fit()
            } catch {
                /* ignore */
            }

            // 监听用户输入
            term.onData((data) => {
                if (execIdRef.current) {
                    if (target.type === 'docker') {
                        API.dockerExecWrite(execIdRef.current, data).catch(() => undefined)
                    } else if (target.type === 'k8s') {
                        API.k8sExecWrite(execIdRef.current, data).catch(() => undefined)
                    }
                }
            })

            // 监听尺寸改变
            term.onResize(({ cols, rows }) => {
                if (execIdRef.current) {
                    if (target.type === 'docker') {
                        API.dockerExecResize(target.serverId, execIdRef.current, cols, rows).catch(() => undefined)
                    } else if (target.type === 'k8s') {
                        API.k8sExecResize(execIdRef.current, cols, rows).catch(() => undefined)
                    }
                }
            })

            // 快捷键复制与粘贴支持
            term.attachCustomKeyEventHandler((e: KeyboardEvent) => {
                if (e.type !== 'keydown') return true
                const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0
                const ctrlOrCmd = isMac ? e.metaKey : e.ctrlKey

                if (ctrlOrCmd && (e.key === 'c' || e.key === 'C')) {
                    if (term.hasSelection()) {
                        navigator.clipboard.writeText(term.getSelection())
                        return false
                    }
                }
                if (ctrlOrCmd && (e.key === 'v' || e.key === 'V')) {
                    navigator.clipboard.readText().then((text) => {
                        if (text && execIdRef.current) {
                            if (target.type === 'docker') {
                                API.dockerExecWrite(execIdRef.current, text).catch(() => undefined)
                            } else if (target.type === 'k8s') {
                                API.k8sExecWrite(execIdRef.current, text).catch(() => undefined)
                            }
                        }
                    })
                    return false
                }
                return true
            })

            // 尺寸自适应观察器
            resizeObserver = new ResizeObserver(() => {
                try {
                    fit.fit()
                } catch {
                    /* ignore */
                }
            })
            resizeObserver.observe(host)

            // 发起连接
            connectTerminal()
        }, 60)

        return () => {
            clearTimeout(timer)
            cleanSession()
            if (resizeObserver) resizeObserver.disconnect()
            if (termRef.current) {
                termRef.current.dispose()
                termRef.current = null
            }
        }
    }, [open, target?.serverId, target?.containerId, target?.podName, target?.containerName])

    // 订阅当前会话的流式数据与关闭事件
    useEffect(() => {
        if (!open || !target) return

        let unsubData: (() => void) | null = null
        let unsubClosed: (() => void) | null = null

        const eventPrefix = target.type === 'docker' ? 'docker:terminal' : 'k8s:terminal'

        const interval = setInterval(() => {
            const execId = execIdRef.current
            if (execId && !unsubData) {
                unsubData = subscribe(`${eventPrefix}:data:${execId}`, (payload: string) => {
                    if (termRef.current && payload) {
                        try {
                            const bytes = base64ToBytes(payload)
                            termRef.current.write(bytes)
                        } catch {
                            /* ignore */
                        }
                    }
                })

                unsubClosed = subscribe(`${eventPrefix}:closed:${execId}`, (reason: string) => {
                    setStatus('closed')
                    termRef.current?.writeln(`\r\n\x1b[33m[会话已退出] ${reason || '容器终端已关闭'}\x1b[0m\r\n`)
                })
                clearInterval(interval)
            }
        }, 60)

        return () => {
            clearInterval(interval)
            if (unsubData) unsubData()
            if (unsubClosed) unsubClosed()
        }
    }, [open, target?.type, status])

    // 动态同步深浅色主题
    useEffect(() => {
        if (termRef.current) {
            termRef.current.options.theme = isDark ? DARK_TERM_THEME : LIGHT_TERM_THEME
        }
    }, [isDark])

    const handleClear = () => {
        termRef.current?.clear()
        termRef.current?.focus()
    }

    const handleCopy = () => {
        if (termRef.current && termRef.current.hasSelection()) {
            navigator.clipboard.writeText(termRef.current.getSelection())
            message.success('已复制选中终端内容')
        } else {
            message.info('请先用鼠标划选终端文本内容')
        }
    }

    if (!target) return null

    return (
        <Modal
            open={open}
            centered
            closable={false}
            title={
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: 8 }}>
                    <Space size={10} wrap>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <div
                                style={{
                                    width: 8,
                                    height: 8,
                                    borderRadius: '50%',
                                    background:
                                        status === 'connected'
                                            ? 'var(--ok, #52c41a)'
                                            : status === 'connecting'
                                            ? 'var(--warn, #faad14)'
                                            : 'var(--danger, #f5222d)',
                                    boxShadow:
                                        status === 'connected'
                                            ? '0 0 6px var(--ok, #52c41a)'
                                            : undefined,
                                }}
                            />
                            <TerminalIcon size={16} color="var(--accent)" />
                            <span style={{ fontWeight: 600, fontSize: 14 }}>容器终端 (Exec)</span>
                        </div>

                        <Tag color={target.type === 'docker' ? 'blue' : 'purple'}>
                            {target.type === 'docker' ? 'Docker' : 'Kubernetes'}
                        </Tag>

                        <span style={{ fontWeight: 500, fontSize: 13, color: 'var(--text)' }}>
                            {target.title}
                        </span>

                        <Tag color="default" style={{ fontFamily: 'var(--font-mono)' }}>
                            /bin/sh
                        </Tag>
                    </Space>

                    <Space size={6}>
                        <Tooltip title="复制选中内容">
                            <Button size="small" icon={<Copy size={12} />} onClick={handleCopy} />
                        </Tooltip>
                        <Tooltip title="清空终端屏幕">
                            <Button size="small" icon={<Eraser size={12} />} onClick={handleClear} />
                        </Tooltip>
                        <Tooltip title="重新连接">
                            <Button size="small" icon={<RotateCw size={12} />} onClick={connectTerminal} />
                        </Tooltip>
                        <Tooltip title="关闭终端">
                            <Button size="small" icon={<X size={13} />} onClick={onClose} />
                        </Tooltip>
                    </Space>
                </div>
            }
            width="85vw"
            style={{ padding: 0 }}
            styles={{
                body: {
                    padding: 0,
                    height: '75vh',
                    backgroundColor: isDark ? '#141619' : '#ffffff',
                    overflow: 'hidden',
                },
            }}
            footer={null}
            onCancel={onClose}
            destroyOnHidden
        >
            <div
                ref={hostRef}
                style={{
                    width: '100%',
                    height: '100%',
                    padding: '8px 12px',
                    boxSizing: 'border-box',
                    backgroundColor: 'inherit',
                }}
            />
        </Modal>
    )
}
