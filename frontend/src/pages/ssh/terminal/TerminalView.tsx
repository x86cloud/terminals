import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import { WebLinksAddon } from 'xterm-addon-web-links'
import { SearchAddon } from 'xterm-addon-search'
import 'xterm/css/xterm.css'
import { API, emitEvent, subscribe } from '../../../api'
import { base64ToBytes } from '../../../utils'
import ContextMenu, { closedMenu, MenuState } from '../../../components/ContextMenu'
import Icon from '../../../components/Icon'
import t from './Terminal.module.less'

interface Props {
    sessionId: string
    active: boolean
}

const LIGHT_TERM_THEME = {
    background: '#ffffff',
    foreground: '#1f2733',
    cursor: '#255cd8',
    selectionBackground: '#cfe4f1',
    black: '#1f2733',
    red: '#d6453f',
    green: '#2f9e44',
    yellow: '#9a6700',
    blue: '#0969da',
    magenta: '#8250df',
    cyan: '#1c8fc4',
    white: '#6b7686',
    brightBlack: '#6b7686',
    brightRed: '#e5534b',
    brightGreen: '#3fb950',
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

export default function TerminalView({ sessionId, active }: Props) {
    const hostRef = useRef<HTMLDivElement>(null)
    const termRef = useRef<Terminal | null>(null)
    const fitRef = useRef<FitAddon | null>(null)
    const searchRef = useRef<SearchAddon | null>(null)
    const searchInputRef = useRef<HTMLInputElement>(null)

    const [menu, setMenu] = useState<MenuState>(closedMenu)
    const [searchOpen, setSearchOpen] = useState(false)
    const [searchQuery, setSearchQuery] = useState('')
    const [caseSensitive, setCaseSensitive] = useState(false)

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
            }
        }
    }, [])

    const paste = useCallback(async () => {
        try {
            const text = await navigator.clipboard.readText()
            if (text && termRef.current) {
                // 使用 xterm 的 paste() 以便支持 Bracketed Paste 机制
                termRef.current.paste(text)
            }
        } catch {
            /* ignore */
        }
    }, [])

    // 动态跟从主题模式变动设置 xterm 主题
    useEffect(() => {
        const applyTermTheme = () => {
            const isDark = document.documentElement.getAttribute('data-theme') === 'dark'
            if (termRef.current) {
                termRef.current.options.theme = isDark ? DARK_TERM_THEME : LIGHT_TERM_THEME
            }
        }

        applyTermTheme()

        const observer = new MutationObserver((mutations) => {
            for (const m of mutations) {
                if (m.attributeName === 'data-theme') {
                    applyTermTheme()
                }
            }
        })

        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
        return () => observer.disconnect()
    }, [])

    useEffect(() => {
        const host = hostRef.current
        if (!host) return

        const isDark = document.documentElement.getAttribute('data-theme') === 'dark'
        const term = new Terminal({
            fontFamily: '"Cascadia Mono", "JetBrains Mono", Consolas, "Courier New", monospace',
            fontSize: 13.5,
            lineHeight: 1.2,
            cursorBlink: true,
            scrollback: 20000,
            allowProposedApi: true,
            theme: isDark ? DARK_TERM_THEME : LIGHT_TERM_THEME,
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

            // Ctrl+Shift+C / Cmd+C (存在选中文本时复制)
            if (ctrlOrCmd && (e.shiftKey || isMac) && (e.key === 'c' || e.key === 'C')) {
                if (term.hasSelection()) {
                    void copySelection()
                    return false
                }
            }
            // Ctrl+Shift+V / Cmd+V 粘贴
            if (ctrlOrCmd && (e.shiftKey || isMac) && (e.key === 'v' || e.key === 'V')) {
                void paste()
                return false
            }
            // Ctrl+F / Cmd+F 打开搜索
            if (ctrlOrCmd && (e.key === 'f' || e.key === 'F')) {
                setSearchOpen((prev) => !prev)
                return false
            }
            // Ctrl+L 清屏
            if (ctrlOrCmd && !e.shiftKey && (e.key === 'l' || e.key === 'L')) {
                term.clear()
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
        <div className={t.terminalWrap}>
            {searchOpen && (
                <div className={t.searchBar}>
                    <input
                        ref={searchInputRef}
                        type="text"
                        placeholder="查找终端内容..."
                        value={searchQuery}
                        onChange={handleSearchChange}
                        onKeyDown={handleSearchKeyDown}
                    />
                    <button
                        title="区分大小写"
                        className={caseSensitive ? t.active : ''}
                        onClick={() => {
                            const next = !caseSensitive
                            setCaseSensitive(next)
                            if (searchQuery && searchRef.current) {
                                searchRef.current.findNext(searchQuery, { caseSensitive: next, incremental: true })
                            }
                        }}
                    >
                        Aa
                    </button>
                    <button title="查找上一个 (Shift+Enter)" onClick={handleSearchPrev}>
                        ↑
                    </button>
                    <button title="查找下一个 (Enter)" onClick={handleSearchNext}>
                        ↓
                    </button>
                    <button title="关闭 (Esc)" onClick={() => setSearchOpen(false)}>
                        ✕
                    </button>
                </div>
            )}

            <div
                ref={hostRef}
                className={t.terminalHost}
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
                                onClick: () => termRef.current?.clear(),
                            },
                        ],
                    })
                }}
            />
            <ContextMenu state={menu} onClose={() => setMenu(closedMenu)} />
        </div>
    )
}
