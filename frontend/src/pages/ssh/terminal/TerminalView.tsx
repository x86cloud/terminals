import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Input, Button, Tooltip, Space } from 'antd'
import { ArrowUp, ArrowDown, X as CloseIcon } from 'lucide-react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { SearchAddon } from '@xterm/addon-search'
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

        const offData = subscribe(`terminal:data:${sessionId}`, (payload: string) => {
            term.write(base64ToBytes(payload))
        })
        const offClosed = subscribe(`terminal:closed:${sessionId}`, (reason: string) => {
            term.writeln(`\r\n\x1b[33m[${reason || '连接已断开'}]\x1b[0m`)
        })

        const observer = new ResizeObserver(() => {
            if (!host.clientWidth || !host.clientHeight) return
            try {
                fit.fit()
            } catch {
                /* ignore */
            }
        })
        observer.observe(host)

        return () => {
            offData()
            offClosed()
            observer.disconnect()
            if (resizeTimerRef.current) {
                window.clearTimeout(resizeTimerRef.current)
            }
            term.dispose()
            termRef.current = null
            fitRef.current = null
            searchRef.current = null
        }
    }, [sessionId, debouncedResize, copySelection, paste])

    useEffect(() => {
        if (!active) return
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
        if (q && searchRef.current) {
            searchRef.current.findNext(q, { caseSensitive, incremental: true })
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
