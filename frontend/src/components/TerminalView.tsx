import React, {useEffect, useRef, useState} from 'react'
import {Terminal} from 'xterm'
import {FitAddon} from 'xterm-addon-fit'
import {WebLinksAddon} from 'xterm-addon-web-links'
import 'xterm/css/xterm.css'
import {API, subscribe} from '../api'
import {base64ToBytes} from '../utils'
import ContextMenu, {closedMenu, MenuState} from './ContextMenu'
import t from '../styles/Terminal.module.less'

interface Props {
    sessionId: string
    active: boolean
}

const THEME = {
    background: '#ffffff',
    foreground: '#1f2733',
    cursor: '#1577a6',
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

export default function TerminalView({sessionId, active}: Props) {
    const hostRef = useRef<HTMLDivElement>(null)
    const termRef = useRef<Terminal | null>(null)
    const fitRef = useRef<FitAddon | null>(null)
    const [menu, setMenu] = useState<MenuState>(closedMenu)

    useEffect(() => {
        const host = hostRef.current
        if (!host) return

        const term = new Terminal({
            fontFamily: '"Cascadia Mono", "JetBrains Mono", Consolas, "Courier New", monospace',
            fontSize: 13.5,
            lineHeight: 1.2,
            cursorBlink: true,
            scrollback: 20000,
            allowProposedApi: true,
            theme: THEME,
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

        term.onData((data) => {
            API.sendInput(sessionId, data).catch(() => undefined)
        })
        term.onResize(({cols, rows}) => {
            API.resize(sessionId, cols, rows).catch(() => undefined)
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
            term.dispose()
            termRef.current = null
            fitRef.current = null
        }
    }, [sessionId])

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

    const copySelection = async () => {
        const text = termRef.current?.getSelection()
        if (text) {
            try {
                await navigator.clipboard.writeText(text)
            } catch {
                /* ignore */
            }
        }
    }

    const paste = async () => {
        try {
            const text = await navigator.clipboard.readText()
            if (text) await API.sendInput(sessionId, text)
        } catch {
            /* ignore */
        }
    }

    return (
        <div className={t.terminalWrap}>
            <div
                ref={hostRef}
                className={t.terminalHost}
                onContextMenu={(e) => {
                    e.preventDefault()
                    setMenu({
                        open: true,
                        x: e.clientX,
                        y: e.clientY,
                        items: [
                            {key: 'copy', label: '复制', icon: 'copy', onClick: copySelection},
                            {key: 'paste', label: '粘贴', icon: 'file', onClick: paste},
                            {key: 'd', label: '', divider: true},
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
            <ContextMenu state={menu} onClose={() => setMenu(closedMenu)}/>
        </div>
    )
}
