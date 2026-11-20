import { useEffect, useRef, useState, useCallback } from 'react'
import { Modal, Space, Tag, Button, Tooltip, Select, Input, App } from 'antd'
import { useTranslation } from 'react-i18next'
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
import { base64ToBytes, copyText } from '@/utils'
import { useTheme } from '@/contexts/ThemeContext'
import { getTerminalTheme } from '@/theme'

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

export default function ContainerTerminalModal({ open, onClose, target }: Props) {
    const { t } = useTranslation('common')
    const { message } = App.useApp()
    const { isDark } = useTheme()
    const hostRef = useRef<HTMLDivElement>(null)
    const termRef = useRef<Terminal | null>(null)
    const fitRef = useRef<FitAddon | null>(null)
    const execIdRef = useRef<string | null>(null)
    const activeTypeRef = useRef<'docker' | 'k8s' | null>(null)
    const connectSeqRef = useRef(0)
    const mountedRef = useRef(true)
    const unsubsRef = useRef<Array<() => void>>([])

    const [status, setStatus] = useState<'connecting' | 'connected' | 'closed'>('connecting')
    const [shellPreset, setShellPreset] = useState<string>('/bin/sh')
    const [customShell, setCustomShell] = useState<string>('/bin/bash')

    const resolvedShell = (shellPreset === 'custom' ? customShell.trim() : shellPreset) || '/bin/sh'

    useEffect(() => {
        mountedRef.current = true
        return () => {
            mountedRef.current = false
        }
    }, [])

    // 清理并断开终端会话
    const cleanSession = useCallback(() => {
        connectSeqRef.current += 1
        unsubsRef.current.forEach((u) => u())
        unsubsRef.current = []
        if (execIdRef.current) {
            const id = execIdRef.current
            const kind = activeTypeRef.current || target?.type
            execIdRef.current = null
            activeTypeRef.current = null
            if (kind === 'docker') {
                API.dockerExecClose(id).catch(() => undefined)
            } else if (kind === 'k8s') {
                API.k8sExecClose(id).catch(() => undefined)
            }
        }
    }, [target?.type])

    // 建立终端连接
    const connectTerminal = useCallback(async (shellOverride?: string) => {
        if (!open || !target || !target.serverId) return

        cleanSession()
        const seq = ++connectSeqRef.current
        const shellCmd = (shellOverride ?? resolvedShell).trim() || '/bin/sh'
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
                    throw new Error(t('missingDockerContainerId', '未指定 Docker 容器 ID'))
                }
                execId = await API.dockerExecStart(
                    target.serverId,
                    target.containerId,
                    shellCmd,
                    cols,
                    rows
                )
            } else if (target.type === 'k8s') {
                if (!target.namespace || !target.podName || !target.containerName) {
                    throw new Error(t('missingK8sPodParams', '缺少 Kubernetes Pod 容器参数'))
                }
                execId = await API.k8sExecStart(
                    target.serverId,
                    target.namespace,
                    target.podName,
                    target.containerName,
                    shellCmd,
                    cols,
                    rows
                )
            }

            if (!mountedRef.current || connectSeqRef.current !== seq) {
                if (execId) {
                    if (target.type === 'docker') {
                        API.dockerExecClose(execId).catch(() => undefined)
                    } else if (target.type === 'k8s') {
                        API.k8sExecClose(execId).catch(() => undefined)
                    }
                }
                return
            }

            execIdRef.current = execId
            activeTypeRef.current = target.type

            // 获得会话 ID 后立即注册事件监听，确保初始欢迎信息与提示符不丢失
            unsubsRef.current.forEach((u) => u())
            unsubsRef.current = []

            const eventPrefix = target.type === 'docker' ? 'docker:terminal' : 'k8s:terminal'
            const offData = subscribe(`${eventPrefix}:data:${execId}`, (payload: string) => {
                if (connectSeqRef.current !== seq) return
                if (termRef.current && payload) {
                    try {
                        const bytes = base64ToBytes(payload)
                        termRef.current.write(bytes)
                    } catch {
                        /* ignore */
                    }
                }
            })
            const offClosed = subscribe(`${eventPrefix}:closed:${execId}`, (reason: string) => {
                if (connectSeqRef.current !== seq) return
                setStatus('closed')
                termRef.current?.writeln(`\r\n\x1b[33m[${t('sessionExited', '会话已退出')}] ${reason || t('containerClosed', '容器终端已关闭')}\x1b[0m\r\n`)
            })
            unsubsRef.current = [offData, offClosed]

            setStatus('connected')
            if (termRef.current) {
                termRef.current.focus()
            }
        } catch (err: any) {
            if (!mountedRef.current || connectSeqRef.current !== seq) return
            setStatus('closed')
            termRef.current?.writeln(`\r\n\x1b[31m[${t('connectFailed', '连接终端失败')}] ${err?.message || err}\x1b[0m\r\n`)
        }
    }, [open, target, resolvedShell, cleanSession, t])

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
                const isMac = /mac/i.test(navigator.userAgent)
                const ctrlOrCmd = isMac ? e.metaKey : e.ctrlKey

                if (ctrlOrCmd && (e.key === 'c' || e.key === 'C')) {
                    if (term.hasSelection()) {
                        void copyText(term.getSelection())
                        return false
                    }
                }
                if (ctrlOrCmd && (e.key === 'v' || e.key === 'V')) {
                    navigator.clipboard
                        .readText()
                        .then((text) => {
                            if (text && execIdRef.current) {
                                if (target.type === 'docker') {
                                    API.dockerExecWrite(execIdRef.current, text).catch(() => undefined)
                                } else if (target.type === 'k8s') {
                                    API.k8sExecWrite(execIdRef.current, text).catch(() => undefined)
                                }
                            }
                        })
                        .catch(() => undefined)
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

    // 动态同步深浅色主题
    useEffect(() => {
        if (termRef.current) {
            termRef.current.options.theme = getTerminalTheme(isDark)
        }
    }, [isDark])

    const handleClear = () => {
        termRef.current?.clear()
        termRef.current?.focus()
    }

    const handleCopy = async () => {
        if (termRef.current && termRef.current.hasSelection()) {
            const ok = await copyText(termRef.current.getSelection())
            if (ok) {
                message.success(t('copiedSelected', '已复制选中终端内容'))
            }
        } else {
            message.info(t('selectTextFirst', '请先用鼠标划选终端文本内容'))
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
                            <span style={{ fontWeight: 600, fontSize: 14 }}>{t('containerTerminal', '容器终端 (Exec)')}</span>
                        </div>

                        <Tag color={target.type === 'docker' ? 'blue' : 'purple'}>
                            {target.type === 'docker' ? 'Docker' : 'Kubernetes'}
                        </Tag>

                        <span style={{ fontWeight: 500, fontSize: 13, color: 'var(--text)' }}>
                            {target.title}
                        </span>

                        <Select
                            size="small"
                            value={shellPreset}
                            style={{ width: 110, fontFamily: 'var(--font-mono)' }}
                            onChange={(val) => {
                                setShellPreset(val)
                                if (val !== 'custom') {
                                    void connectTerminal(val)
                                }
                            }}
                            options={[
                                { label: '/bin/sh', value: '/bin/sh' },
                                { label: '/bin/bash', value: '/bin/bash' },
                                { label: '/bin/ash', value: '/bin/ash' },
                                { label: '/bin/zsh', value: '/bin/zsh' },
                                { label: t('customShell', '自定义'), value: 'custom' },
                            ]}
                        />
                        {shellPreset === 'custom' && (
                            <Input
                                size="small"
                                value={customShell}
                                onChange={(e) => setCustomShell(e.target.value)}
                                onPressEnter={() => void connectTerminal(customShell)}
                                placeholder="/bin/bash"
                                style={{ width: 120, fontFamily: 'var(--font-mono)' }}
                            />
                        )}
                    </Space>

                    <Space size={6}>
                        <Tooltip title={t('copySelected', '复制选中内容')}>
                            <Button size="small" icon={<Copy size={12} />} onClick={handleCopy} />
                        </Tooltip>
                        <Tooltip title={t('clearScreen', '清空终端屏幕')}>
                            <Button size="small" icon={<Eraser size={12} />} onClick={handleClear} />
                        </Tooltip>
                        <Tooltip title={t('reconnect', '重新连接')}>
                            <Button size="small" icon={<RotateCw size={12} />} onClick={() => void connectTerminal()} />
                        </Tooltip>
                        <Tooltip title={t('closeTerminal', '关闭终端')}>
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
                    backgroundColor: isDark ? '#0a0b0e' : '#ffffff',
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
