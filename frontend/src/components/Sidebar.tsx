import React, {useMemo, useState} from 'react'
import Icon from './Icon'
import ContextMenu, {closedMenu, MenuState} from './ContextMenu'
import {ServerConfig, SessionInfo} from '../types'

interface Props {
    servers: ServerConfig[]
    sessions: SessionInfo[]
    activeSessionId: string | null
    connectingId: string | null
    onNew: () => void
    onEdit: (cfg: ServerConfig) => void
    onDelete: (cfg: ServerConfig) => void
    onConnect: (cfg: ServerConfig) => void
    onFocusSession: (id: string) => void
}

export default function Sidebar({
                                    servers,
                                    sessions,
                                    activeSessionId,
                                    connectingId,
                                    onNew,
                                    onEdit,
                                    onDelete,
                                    onConnect,
                                    onFocusSession,
                                }: Props) {
    const [keyword, setKeyword] = useState('')
    const [menu, setMenu] = useState<MenuState>(closedMenu)

    const filtered = useMemo(() => {
        const kw = keyword.trim().toLowerCase()
        if (!kw) return servers
        return servers.filter(
            (s) =>
                s.name.toLowerCase().includes(kw) ||
                s.host.toLowerCase().includes(kw) ||
                s.username.toLowerCase().includes(kw)
        )
    }, [servers, keyword])

    const sessionsOf = (serverId: string) => sessions.filter((s) => s.serverId === serverId)

    return (
        <aside className="sidebar">
            <div className="sidebar-head">
                <div className="sidebar-search">
                    <Icon name="search" size={14}/>
                    <input
                        value={keyword}
                        placeholder="搜索服务器"
                        onChange={(e) => setKeyword(e.target.value)}
                    />
                </div>
                <button className="icon-btn" title="新建服务器" onClick={onNew}>
                    <Icon name="plus"/>
                </button>
            </div>

            <div className="server-list">
                {filtered.length === 0 && (
                    <div className="sidebar-empty">
                        还没有服务器
                        <button className="btn small primary" onClick={onNew}>添加一个</button>
                    </div>
                )}

                {filtered.map((server) => {
                    const active = sessionsOf(server.id)
                    return (
                        <div key={server.id} className="server-group">
                            <div
                                className={`server-item${connectingId === server.id ? ' connecting' : ''}`}
                                onDoubleClick={() => {
                                    if (connectingId === server.id) return
                                    onConnect(server)
                                }}
                                onContextMenu={(e) => {
                                    e.preventDefault()
                                    setMenu({
                                        open: true,
                                        x: e.clientX,
                                        y: e.clientY,
                                        items: [
                                            {key: 'connect', label: '连接', icon: 'plug', disabled: connectingId === server.id, onClick: () => onConnect(server)},
                                            {key: 'edit', label: '编辑', icon: 'edit', onClick: () => onEdit(server)},
                                            {key: 'd1', label: '', divider: true},
                                            {
                                                key: 'delete',
                                                label: '删除',
                                                icon: 'trash',
                                                danger: true,
                                                onClick: () => onDelete(server),
                                            },
                                        ],
                                    })
                                }}
                            >
                                <span className="server-icon">
                                    <Icon name="server"/>
                                </span>
                                <span className="server-text">
                                    <span className="server-name">{server.name || `${server.username}@${server.host}`}</span>
                                    <span className="server-sub">
                                        {server.username}@{server.host}:{server.port}
                                    </span>
                                </span>
                                <span className="server-actions">
                                    {connectingId === server.id ? (
                                        <span className="spinner" title="连接中…"/>
                                    ) : (
                                        <button
                                            className="icon-btn"
                                            title="连接"
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                onConnect(server)
                                            }}
                                        >
                                            <Icon name="plug" size={15}/>
                                        </button>
                                    )}
                                </span>
                            </div>

                            {active.map((s) => (
                                <button
                                    key={s.id}
                                    className={`session-item${s.id === activeSessionId ? ' active' : ''}`}
                                    onClick={() => onFocusSession(s.id)}
                                >
                                    <span className={`dot${s.connected ? ' on' : ''}`}/>
                                    会话 {s.id.slice(0, 6)}
                                </button>
                            ))}
                        </div>
                    )
                })}
            </div>

            <ContextMenu state={menu} onClose={() => setMenu(closedMenu)}/>
        </aside>
    )
}
