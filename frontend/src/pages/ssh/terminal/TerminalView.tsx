import { useCallback, useEffect, useRef, useState } from 'react'
import { Input, Button, Tooltip } from 'antd'
import { ArrowUp, ArrowDown, X as CloseIcon } from 'lucide-react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { SearchAddon } from '@xterm/addon-search'
import { WebglAddon } from '@xterm/addon-webgl'
import { CanvasAddon } from '@xterm/addon-canvas'
import '@xterm/xterm/css/xterm.css'
import { API, emitEvent, subscribe } from '@/api'
import { base64ToBytes } from '@/utils'
import ContextMenu, { closedMenu, MenuState } from '@/components/ContextMenu'
import { useTheme } from '@/contexts/ThemeContext'
import { getTerminalTheme } from '@/theme'
import t from '@/pages/ssh/terminal/Terminal.module.less'

interface Props {
    sessionId: string
    active: boolean
}

export default function TerminalView({ sessionId, active }: Props) {
    const { isDark } = useTheme()
    const hostRef = useRef<HTMLDivElement>(null)
    const termRef = useRef<Terminal | null>(null)
    const fitRef = useRef<FitAddon | null>(null)
    const searchRef = useRef<SearchAddon | null>(null)
    const searchInputRef = useRef<HTMLInputElement>(null)
    const activeRef = useRef<boolean>(active)
    activeRef.current = active

    const flushOutputRef = useRef<(() => void) | null>(null)
    const tryAttachRendererRef = useRef<(() => void) | null>(null)
    const searchDebounceRef = useRef<number | null>(null)

    const [menu, setMenu] = useState<MenuState>(closedMenu)
    const [searchOpen, setSearchOpen] = useState(false)
    const [searchQuery, setSearchQuery] = useState('')
    const [caseSensitive, setCaseSensitive] = useState(false)

    const handleCloseMenu = useCallback(() => {
        setMenu(closedMenu)
        setTimeout(() => {
            termRef.current?.focus()
        }, 10)
    }, [])

    // 防抖 resize
    const resizeTimerRef = useRef<number | null>(null)
    const debouncedResize = useCallback((cols: number, rows: number) => {
        if (resizeTimerRef.current) {
            window.clearTimeout(resizeTimerRef.current)
        }
        resizeTimerRef.current = window.setTimeout(() => {
            API.resize(sessionId, cols, rows).catch(() => undefined)
        }, 100)
    }, [sessionId])

    const copySelection = useCallback(async () => {
        const text = termRef.current?.getSelection()
        if (text) {
            try {
                await navigator.clipboard.writeText(text)
            } catch {
                /* ignore */
            } finally {
                termRef.current?.focus()
            }
        }
    }, [])

    const lastPasteTimeRef = useRef<number>(0)
    const paste = useCallback(async () => {
        const now = Date.now()
        if (now - lastPasteTimeRef.current < 200) {
            return
        }
        lastPasteTimeRef.current = now
        try {
            const text = await navigator.clipboard.readText()
            if (text && termRef.current) {
                // 使用 xterm 的 paste() 以便支持 Bracketed Paste 机制
                termRef.current.paste(text)
            }
        } catch {
            /* ignore */
        } finally {
            termRef.current?.focus()
        }
    }, [])

    // 动态跟从主题模式变动设置 xterm 主题
    useEffect(() => {
        if (termRef.current) {
            termRef.current.options.theme = getTerminalTheme(isDark)
        }
    }, [isDark])

    useEffect(() => {
        const host = hostRef.current
        if (!host) return

        const term = new Terminal({
            fontFamily: 'Consolas, "Courier New", monospace, "Cascadia Mono", "JetBrains Mono"',
            fontSize: 13.5,
            lineHeight: 1.2,
            cursorBlink: true,
            scrollback: 20000,
            allowProposedApi: true,
            fontWeight: "normal",
            theme: getTerminalTheme(isDark),
        })
        const fit = new FitAddon()
        const search = new SearchAddon()

        term.loadAddon(fit)
        term.loadAddon(new WebLinksAddon())
        term.loadAddon(search)
        term.open(host)

        // 优先加载硬件加速 WebGL 渲染器，失败或掉上下文时自动降级到 Canvas 或 DOM
        let webglAddon: WebglAddon | null = null
        let canvasAddon: CanvasAddon | null = null
        let rendererAttached = false

        const tryCanvas = () => {
            if (canvasAddon) return
            try {
                const addon = new CanvasAddon()
                term.loadAddon(addon)
                canvasAddon = addon
                rendererAttached = true
            } catch (err) {
                console.warn('[Terminal] Canvas addon unavailable, fallback to DOM renderer:', err)
                canvasAddon = null
            }
        }

        const attachRenderer = () => {
            if (rendererAttached) return
            // 宿主处于隐藏状态（宽或高为 0）时暂不挂载 WebGL，避免 0x0 异常并在激活时再行挂载
            if (!host || host.clientWidth <= 0 || host.clientHeight <= 0) return

            try {
                const addon = new WebglAddon()
                addon.onContextLoss(() => {
                    console.warn('[Terminal] WebGL context lost, fallback to Canvas/DOM')
                    addon.dispose()
                    if (webglAddon === addon) webglAddon = null
                    tryCanvas()
                })
                term.loadAddon(addon)
                webglAddon = addon
                rendererAttached = true
                return
            } catch (e) {
                console.warn('[Terminal] WebGL addon unavailable, attempting Canvas:', e)
            }
            tryCanvas()
        }

        tryAttachRendererRef.current = attachRenderer
        attachRenderer()

        termRef.current = term
        fitRef.current = fit
        searchRef.current = search

        try {
            fit.fit()
        } catch {
            /* ignore */
        }

        term.onData((data) => {
            API.sendInput(sessionId, data).catch(() => undefined)
        })

        term.onResize(({ cols, rows }) => {
            debouncedResize(cols, rows)
        })

        // 自定义快捷键处理
        term.attachCustomKeyEventHandler((e: KeyboardEvent) => {
            if (e.type !== 'keydown') return true
            const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0
            const ctrlOrCmd = isMac ? e.metaKey : e.ctrlKey

            // Ctrl+Shift+C / Cmd+C / Ctrl+C（有选中文本时复制；无选中文本时放行 Ctrl+C 发送终端中断）
            if (ctrlOrCmd && (e.key === 'c' || e.key === 'C')) {
                if (term.hasSelection()) {
                    e.preventDefault()
                    e.stopPropagation()
                    void copySelection()
                    return false
                }
                if (e.shiftKey) {
                    e.preventDefault()
                    e.stopPropagation()
                    return false
                }
            }
            // Ctrl+V / Ctrl+Shift+V / Cmd+V 粘贴
            if (ctrlOrCmd && (e.key === 'v' || e.key === 'V')) {
                e.preventDefault()
                e.stopPropagation()
                void paste()
                return false
            }
            // Ctrl+F / Cmd+F 打开搜索
            if (ctrlOrCmd && (e.key === 'f' || e.key === 'F')) {
                e.preventDefault()
                e.stopPropagation()
                setSearchOpen((prev) => !prev)
                return false
            }
            // Ctrl+L 清屏
            if (ctrlOrCmd && !e.shiftKey && (e.key === 'l' || e.key === 'L')) {
                e.preventDefault()
                e.stopPropagation()
                term.clear()
                term.focus()
                return false
            }
            return true
        })

        // 帧对齐的终端输出微批次写入队列（将单帧内多条 IPC 数据合并一次性写入 xterm，彻底杜绝掉帧与输入卡顿）
        let pendingChunks: Uint8Array[] = []
        let pendingBytes = 0
        let rafId: number | null = null
        let bgTimer: number | null = null

        const flushOutput = () => {
            rafId = null
            if (bgTimer !== null) {
                window.clearTimeout(bgTimer)
                bgTimer = null
            }
            if (pendingChunks.length === 0 || !termRef.current) return

            if (pendingChunks.length === 1) {
                termRef.current.write(pendingChunks[0])
            } else {
                const merged = new Uint8Array(pendingBytes)
                let offset = 0
                for (let i = 0; i < pendingChunks.length; i++) {
                    merged.set(pendingChunks[i], offset)
                    offset += pendingChunks[i].length
                }
                termRef.current.write(merged)
            }
            pendingChunks = []
            pendingBytes = 0
        }

        flushOutputRef.current = flushOutput

        const offData = subscribe(`terminal:data:${sessionId}`, (payload: string) => {
            const bytes = base64ToBytes(payload)
            if (!bytes || bytes.length === 0) return

            pendingChunks.push(bytes)
            pendingBytes += bytes.length

            if (activeRef.current) {
                // 活动 Tab：若突发量超过 64KB 则立即刷入防堆积，否则在下一个显示器刷新帧（RAF）中集中解析渲染
                if (pendingBytes >= 65536) {
                    if (rafId !== null) {
                        cancelAnimationFrame(rafId)
                        rafId = null
                    }
                    flushOutput()
                    return
                }
                if (rafId === null) {
                    rafId = requestAnimationFrame(flushOutput)
                }
            } else {
                // 后台非激活 Tab：不占用每帧 RAF 与 GPU 渲染，以 200ms 低频归并写入维持 buffer
                if (pendingBytes >= 131072) {
                    flushOutput()
                    return
                }
                if (bgTimer === null) {
                    bgTimer = window.setTimeout(flushOutput, 200)
                }
            }
        })

        const offClosed = subscribe(`terminal:closed:${sessionId}`, (reason: string) => {
            flushOutput()
            term.writeln(`\r\n\x1b[33m[${reason || '连接已断开'}]\x1b[0m`)
        })

        // 通知后端终端视图已挂载就绪，立即同步实际视口尺寸并回放缓冲的早期 Prompt 与 MOTD
        API.terminalAttach(sessionId, term.cols, term.rows).catch(() => undefined)

        // 视口尺寸监听：通过 RAF 节流，避免在分栏拖拽过程中频繁触发同步测量与 forced layout
        let resizeRaf: number | null = null
        const observer = new ResizeObserver(() => {
            if (!host.clientWidth || !host.clientHeight) return
            if (!rendererAttached) {
                attachRenderer()
            }
            if (resizeRaf !== null) return
            resizeRaf = requestAnimationFrame(() => {
                resizeRaf = null
                try {
                    fit.fit()
                } catch {
                    /* ignore */
                }
            })
        })
        observer.observe(host)

        return () => {
            offData()
            offClosed()
            observer.disconnect()
            if (resizeRaf !== null) {
                cancelAnimationFrame(resizeRaf)
                resizeRaf = null
            }
            if (rafId !== null) {
                cancelAnimationFrame(rafId)
                rafId = null
            }
            if (bgTimer !== null) {
                window.clearTimeout(bgTimer)
                bgTimer = null
            }
            if (searchDebounceRef.current !== null) {
                window.clearTimeout(searchDebounceRef.current)
                searchDebounceRef.current = null
            }
            flushOutputRef.current = null
            tryAttachRendererRef.current = null
            pendingChunks = []
            pendingBytes = 0

            if (resizeTimerRef.current) {
                window.clearTimeout(resizeTimerRef.current)
            }
            webglAddon?.dispose()
            canvasAddon?.dispose()
            term.dispose()
            termRef.current = null
            fitRef.current = null
            searchRef.current = null
        }
    }, [sessionId, debouncedResize, copySelection, paste])

    useEffect(() => {
        if (!active) return
        // 切换到当前活动 Tab 时，立即将后台累积的输出刷出，确保硬件加速渲染器已就绪，并重新校准 fit
        flushOutputRef.current?.()
        tryAttachRendererRef.current?.()
        const timer = window.setTimeout(() => {
            try {
                fitRef.current?.fit()
            } catch {
                /* ignore */
            }
            termRef.current?.focus()
        }, 40)
        return () => window.clearTimeout(timer)
    }, [active])

    useEffect(() => {
        if (searchOpen) {
            searchInputRef.current?.focus()
            searchInputRef.current?.select()
        } else {
            termRef.current?.focus()
        }
    }, [searchOpen])

    const handleSearchNext = () => {
        if (!searchQuery || !searchRef.current) return
        searchRef.current.findNext(searchQuery, { caseSensitive, incremental: true })
    }

    const handleSearchPrev = () => {
        if (!searchQuery || !searchRef.current) return
        searchRef.current.findPrevious(searchQuery, { caseSensitive })
    }

    const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            if (e.shiftKey) {
                handleSearchPrev()
            } else {
                handleSearchNext()
            }
        } else if (e.key === 'Escape') {
            setSearchOpen(false)
        }
    }

    const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const q = e.target.value
        setSearchQuery(q)
        if (searchDebounceRef.current !== null) {
            window.clearTimeout(searchDebounceRef.current)
        }
        if (q && searchRef.current) {
            searchDebounceRef.current = window.setTimeout(() => {
                searchRef.current?.findNext(q, { caseSensitive, incremental: true })
            }, 150)
        }
    }

    return (
        <div className={t.terminalWrap} onClick={() => termRef.current?.focus()}>
            {searchOpen && (
                <div
                    className={t.searchBar}
                    style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <Input
                        ref={searchInputRef as any}
                        size="small"
                        placeholder="查找终端内容..."
                        value={searchQuery}
                        onChange={handleSearchChange}
                        onKeyDown={handleSearchKeyDown}
                        style={{ width: 180 }}
                    />
                    <Tooltip title="区分大小写">
                        <Button
                            size="small"
                            type={caseSensitive ? 'primary' : 'text'}
                            onClick={() => {
                                const next = !caseSensitive
                                setCaseSensitive(next)
                                if (searchQuery && searchRef.current) {
                                    searchRef.current.findNext(searchQuery, { caseSensitive: next, incremental: true })
                                }
                            }}
                        >
                            Aa
                        </Button>
                    </Tooltip>
                    <Tooltip title="查找上一个 (Shift+Enter)">
                        <Button
                            size="small"
                            type="text"
                            icon={<ArrowUp size={13} />}
                            onClick={handleSearchPrev}
                        />
                    </Tooltip>
                    <Tooltip title="查找下一个 (Enter)">
                        <Button
                            size="small"
                            type="text"
                            icon={<ArrowDown size={13} />}
                            onClick={handleSearchNext}
                        />
                    </Tooltip>
                    <Tooltip title="关闭 (Esc)">
                        <Button
                            size="small"
                            type="text"
                            icon={<CloseIcon size={13} />}
                            onClick={() => setSearchOpen(false)}
                        />
                    </Tooltip>
                </div>
            )}

            <div
                ref={hostRef}
                className={t.terminalHost}
                onClick={() => termRef.current?.focus()}
                onContextMenu={(e) => {
                    e.preventDefault()
                    const hasSelection = termRef.current?.hasSelection() ?? false
                    const selectionText = termRef.current?.getSelection() ?? ''
                    setMenu({
                        open: true,
                        x: e.clientX,
                        y: e.clientY,
                        items: [
                            {
                                key: 'copy',
                                label: '复制',
                                icon: 'copy',
                                disabled: !hasSelection,
                                onClick: copySelection,
                            },
                            { key: 'paste', label: '粘贴', icon: 'file', onClick: paste },
                            {
                                key: 'askAi',
                                label: '问AI',
                                icon: 'bot',
                                disabled: !hasSelection,
                                onClick: () => {
                                    if (selectionText) {
                                        const prompt = `请分析并解答以下远程服务器上终端选中的内容：\n\`\`\`\n${selectionText}\n\`\`\``
                                        emitEvent('agent:ask', prompt)
                                    }
                                },
                            },
                            {
                                key: 'search',
                                label: '查找 (Ctrl+F)',
                                icon: 'search',
                                onClick: () => setSearchOpen(true),
                            },
                            { key: 'd', label: '', divider: true },
                            {
                                key: 'clear',
                                label: '清屏',
                                icon: 'refresh',
                                onClick: () => {
                                    termRef.current?.clear()
                                    termRef.current?.focus()
                                },
                            },
                        ],
                    })
                }}
            />
            <ContextMenu state={menu} onClose={handleCloseMenu} />
        </div>
    )
}
