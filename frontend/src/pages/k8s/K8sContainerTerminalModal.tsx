import React, { useEffect, useRef, useState, useCallback } from 'react'
import { Modal, Space, Tag, Button, Tooltip, message } from 'antd'
import {
    Terminal as TerminalIcon,
    RotateCw,
    Eraser,
    X,
    Maximize2,
    Minimize2,
    Copy,
} from 'lucide-react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'
import { API, subscribe } from '@/api'
import { base64ToBytes } from '@/utils'
import { useTheme } from '@/contexts/ThemeContext'
import { getTerminalTheme } from '@/theme'

interface Props {
    open: boolean
    onClose: () => void
    serverId: string
    namespace: string
    podName: string
    containerName: string
    image?: string
}

export default function K8sContainerTerminalModal({
    open,
    onClose,
    serverId,
    namespace,
    podName,
    containerName,
    image,
}: Props) {
    const { isDark } = useTheme()
    const hostRef = useRef<HTMLDivElement>(null)
    const termRef = useRef<Terminal | null>(null)
    const fitRef = useRef<FitAddon | null>(null)
    const execIdRef = useRef<string | null>(null)

    const [status, setStatus] = useState<'connecting' | 'connected' | 'closed'>('connecting')
    const [isMaximized, setIsMaximized] = useState(false)

    // 清理并断开终端连接
    const cleanSession = useCallback(() => {
        if (execIdRef.current) {
            API.k8sExecClose(execIdRef.current).catch(() => undefined)
            execIdRef.current = null
        }
    }, [])

    // 建立连接
    const connectTerminal = useCallback(async () => {
        if (!open || !serverId || !namespace || !podName || !containerName) return

        cleanSession()
        setStatus('connecting')

        if (termRef.current) {
            termRef.current.reset()
        }

        try {
            const cols = termRef.current?.cols || 120
            const rows = termRef.current?.rows || 32
            const execId = await API.k8sExecStart(
                serverId,
                namespace,
                podName,
                containerName,
                '/bin/sh',
                cols,
                rows
            )
            execIdRef.current = execId
            setStatus('connected')
            if (termRef.current) {
                termRef.current.focus()
            }
        } catch (err: any) {
            setStatus('closed')
            termRef.current?.writeln(`\r\n\x1b[31m[连接失败] ${err?.message || err}\x1b[0m\r\n`)
        }
    }, [open, serverId, namespace, podName, containerName, cleanSession])

    // 初始化 Terminal 实例
    useEffect(() => {
        if (!open) return

        let unsubData: (() => void) | null = null
        let unsubClose: (() => void) | null = null
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
                theme: getTerminalTheme(isDark),
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

            // 监听数据输入
            term.onData((data) => {
                if (execIdRef.current) {
                    API.k8sExecWrite(execIdRef.current, data).catch(() => undefined)
                }
            })

            // 监听尺寸改变
            term.onResize(({ cols, rows }) => {
                if (execIdRef.current) {
                    API.k8sExecResize(execIdRef.current, cols, rows).catch(() => undefined)
                }
            })

            // 快捷键支持
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
                            API.k8sExecWrite(execIdRef.current, text).catch(() => undefined)
                        }
                    })
                    return false
                }
                return true
            })

            // 自适应容器尺寸
            resizeObserver = new ResizeObserver(() => {
                try {
                    fit.fit()
                } catch {
                    /* ignore */
                }
            })
            resizeObserver.observe(host)

            // 连接
            connectTerminal()
        }, 50)

        return () => {
            clearTimeout(timer)
            cleanSession()
            if (resizeObserver) resizeObserver.disconnect()
            if (termRef.current) {
                termRef.current.dispose()
                termRef.current = null
            }
        }
    }, [open])

    // 单独订阅动态 execId 的输出与退出事件
    useEffect(() => {
        if (!open) return

        let unsubData: (() => void) | null = null
        let unsubClosed: (() => void) | null = null

        const interval = setInterval(() => {
            const execId = execIdRef.current
            if (execId && !unsubData) {
                unsubData = subscribe(`k8s:terminal:data:${execId}`, (payload: string) => {
                    if (termRef.current && payload) {
                        try {
                            const bytes = base64ToBytes(payload)
                            termRef.current.write(bytes)
                        } catch {
                            /* ignore */
                        }
                    }
                })

                unsubClosed = subscribe(`k8s:terminal:closed:${execId}`, (reason: string) => {
                    setStatus('closed')
                    termRef.current?.writeln(`\r\n\x1b[33m[连接断开] ${reason || '容器终端已关闭'}\x1b[0m\r\n`)
                })
                clearInterval(interval)
            }
        }, 60)

        return () => {
            clearInterval(interval)
            if (unsubData) unsubData()
            if (unsubClosed) unsubClosed()
        }
    }, [open])

    // 跟随主题变化
    useEffect(() => {
        if (termRef.current) {
            termRef.current.options.theme = getTerminalTheme(isDark)
        }
    }, [isDark])

    const handleClear = () => {
        termRef.current?.clear()
        termRef.current?.focus()
    }

    const handleCopy = () => {
        const sel = termRef.current?.getSelection()
        if (sel) {
            navigator.clipboard.writeText(sel)
        } else {
            message.info('请先在终端中选择要复制的文本')
        }
    }

    return (
        <Modal
            closeIcon={false}
            open={open}
            title={
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: 8 }}>
                    <Space size={10}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span
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
                            <span style={{ fontWeight: 600, fontSize: 13.5 }}>容器终端</span>
                        </div>

                        <Tag color="cyan" style={{ fontFamily: 'var(--font-mono)' }}>
                            Pod: {podName}
                        </Tag>
                        <Tag color="blue" style={{ fontFamily: 'var(--font-mono)' }}>
                            容器: {containerName}
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
                        <Tooltip title={isMaximized ? '还原窗口' : '最大化窗口'}>
                            <Button
                                size="small"
                                icon={isMaximized ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
                                onClick={() => {
                                    setIsMaximized(!isMaximized)
                                    setTimeout(() => fitRef.current?.fit(), 100)
                                }}
                            />
                        </Tooltip>
                        <Tooltip title="关闭终端">
                            <Button size="small" icon={<X size={13} />} onClick={onClose} />
                        </Tooltip>
                    </Space>
                </div>
            }
            width={isMaximized ? '96vw' : 920}
            style={isMaximized ? { top: 16 } : { top: 40 }}
            styles={{
                body: {
                    padding: 0,
                    height: isMaximized ? 'calc(90vh - 80px)' : '540px',
                    backgroundColor: 'var(--bg-1)',
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
