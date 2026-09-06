import React, { useState, useMemo, useRef, useEffect } from 'react'
import { Input, Button, Segmented, Select, Tooltip, Dropdown, message } from 'antd'
import { Folder, Table as TableIcon, Search, RotateCw, Download, Plus, Filter, Database, Trash2, Copy } from 'lucide-react'
import { RedisKeyItem, RedisKeysResult, RedisSessionInfo, RedisValue } from '@/types'
import { KeyTreeNode, TYPE_COLOR, TYPE_SHORT_LABEL, buildKeyTree } from '@/pages/redis/redisTypes'
import KeyItemTree from '@/pages/redis/KeyItemTree'
import KeyHeader from '@/pages/redis/KeyHeader'
import RedisCliDrawer from '@/pages/redis/RedisCliDrawer'
import StringViewer from '@/pages/redis/viewers/StringViewer'
import HashViewer from '@/pages/redis/viewers/HashViewer'
import ListViewer from '@/pages/redis/viewers/ListViewer'
import SetViewer from '@/pages/redis/viewers/SetViewer'
import ZSetViewer from '@/pages/redis/viewers/ZSetViewer'
import StreamViewer from '@/pages/redis/viewers/StreamViewer'
import k from '@/pages/redis/KeysTab.module.less'

interface KeysTabProps {
    session: RedisSessionInfo
    pattern: string
    setPattern: (p: string) => void
    data: RedisKeysResult
    selected: string
    value: RedisValue | null
    editor: string
    setEditor: (e: string) => void
    ttl: number
    setTtl: (t: number) => void
    db: number
    dbInput: string
    setDbInput: (v: string) => void
    viewMode: 'tree' | 'flat'
    setViewMode: (v: 'tree' | 'flat') => void
    expandedKeys: Set<string>
    toggleExpand: (nodeKey: string) => void
    keyTree: KeyTreeNode[]
    cliInput: string
    setCliInput: (v: string) => void
    cliResult: string
    setCliResult: (v: string) => void
    loadKeys: (reset?: boolean) => Promise<void>
    loadValue: (key: string) => Promise<void>
    switchDb: (target?: number) => Promise<void>
    saveValue: () => Promise<void>
    delKey: (keyName?: string) => void
    delFolder: (node: KeyTreeNode) => void
    runRaw: (cmd: string) => Promise<string | undefined>
    flash?: (m: string) => void
    onOpenCreateKey?: () => void
}

export default function KeysTab({
    session,
    pattern,
    setPattern,
    data,
    selected,
    value,
    db,
    switchDb,
    viewMode,
    setViewMode,
    expandedKeys,
    toggleExpand,
    keyTree,
    loadKeys,
    loadValue,
    delKey,
    delFolder,
    runRaw,
    flash,
    onOpenCreateKey,
}: KeysTabProps) {
    // Sidebar width resize state
    const [sidebarWidth, setSidebarWidth] = useState(() => {
        const saved = localStorage.getItem('redis_sidebar_width')
        return saved ? Number(saved) : 320
    })
    const [isDragging, setIsDragging] = useState(false)
    const isDraggingRef = useRef(false)
    const startXRef = useRef(0)
    const startWidthRef = useRef(320)

    // Local filter state
    const [localFilter, setLocalFilter] = useState('')

    const handleMouseDown = (e: React.MouseEvent) => {
        isDraggingRef.current = true
        setIsDragging(true)
        startXRef.current = e.clientX
        startWidthRef.current = sidebarWidth

        const onMouseMove = (moveEvent: MouseEvent) => {
            if (!isDraggingRef.current) return
            const delta = moveEvent.clientX - startXRef.current
            const nextW = Math.max(240, Math.min(650, startWidthRef.current + delta))
            setSidebarWidth(nextW)
        }

        const onMouseUp = () => {
            isDraggingRef.current = false
            setIsDragging(false)
            localStorage.setItem('redis_sidebar_width', String(sidebarWidth))
            window.removeEventListener('mousemove', onMouseMove)
            window.removeEventListener('mouseup', onMouseUp)
        }

        window.addEventListener('mousemove', onMouseMove)
        window.addEventListener('mouseup', onMouseUp)
    }

    // Filter keys locally
    const filteredKeyItems = useMemo(() => {
        const list = Array.isArray(data.keys) ? data.keys : []
        if (!localFilter.trim()) return list
        const query = localFilter.toLowerCase().trim()
        return list.filter((item) => {
            const keyName = typeof item === 'string' ? item : item?.key || ''
            return keyName.toLowerCase().includes(query)
        })
    }, [data.keys, localFilter])

    // Filtered tree when localFilter is present
    const displayTree = useMemo(() => {
        if (!localFilter.trim()) return keyTree
        return buildKeyTree(filteredKeyItems, ':')
    }, [keyTree, localFilter, filteredKeyItems])

    const copyKeyName = (keyName: string) => {
        navigator.clipboard.writeText(keyName)
        message.success('已复制键名')
    }

    return (
        <div className={k.body}>
            <div className={k.keysContent}>
                {/* Left Sidebar */}
                <div className={k.redisSide} style={{ width: sidebarWidth }}>
                    <div className={k.redisSideHead}>
                        <div className={k.dbRow}>
                            <Select
                                size="small"
                                value={db}
                                onChange={(v) => switchDb(v)}
                                options={Array.from({ length: 16 }, (_, i) => ({ value: i, label: `DB ${i}` }))}
                                className={k.dbSelect}
                            />
                            <span className={k.redisDbCount}>
                                {data.keys.length} 键 / 共 {session.dbSize || 0}
                            </span>
                            <div className={k.sideActions}>
                                {onOpenCreateKey && (
                                    <Tooltip title="新建键 (Create Key)">
                                        <Button
                                            size="small"
                                            type="text"
                                            icon={<Plus size={13} />}
                                            onClick={onOpenCreateKey}
                                        />
                                    </Tooltip>
                                )}
                                <Tooltip title="重新扫描 (SCAN)">
                                    <Button
                                        size="small"
                                        type="text"
                                        icon={<RotateCw size={13} />}
                                        onClick={() => loadKeys(true)}
                                    />
                                </Tooltip>
                                {String(data.cursor) !== '0' && (
                                    <Tooltip title="加载更多键">
                                        <Button
                                            size="small"
                                            type="text"
                                            icon={<Download size={13} />}
                                            onClick={() => loadKeys(false)}
                                        >
                                            更多
                                        </Button>
                                    </Tooltip>
                                )}
                            </div>
                        </div>

                        {/* Remote pattern search */}
                        <div className={k.searchRow}>
                            <Input
                                size="small"
                                placeholder="匹配模式 (如: user:*)..."
                                value={pattern}
                                prefix={<Search size={12} style={{ color: 'var(--text-dim)' }} />}
                                allowClear
                                onChange={(e) => setPattern(e.target.value)}
                                onPressEnter={() => loadKeys(true)}
                                className={k.searchInput}
                            />
                            <Segmented
                                size="small"
                                value={viewMode}
                                onChange={(v) => setViewMode(v as 'tree' | 'flat')}
                                options={[
                                    { value: 'tree', icon: <Folder size={12} /> },
                                    { value: 'flat', icon: <TableIcon size={12} /> },
                                ]}
                            />
                        </div>

                        {/* Local fast filter */}
                        <div className={k.filterRow}>
                            <Input
                                size="small"
                                placeholder="过滤已扫描出的键..."
                                value={localFilter}
                                prefix={<Filter size={11} style={{ color: 'var(--text-dim)' }} />}
                                allowClear
                                onChange={(e) => setLocalFilter(e.target.value)}
                                className={k.filterInput}
                            />
                        </div>
                    </div>

                    <div className={k.redisKeys}>
                        {filteredKeyItems.length === 0 && (
                            <div className={k.redisEmpty}>
                                <span>{data.keys.length === 0 ? '无键' : '无匹配结果'}</span>
                                {data.keys.length === 0 && onOpenCreateKey && (
                                    <Button size="small" type="primary" icon={<Plus size={12} />} onClick={onOpenCreateKey}>
                                        新建键
                                    </Button>
                                )}
                            </div>
                        )}
                        {filteredKeyItems.length > 0 && (
                            viewMode === 'flat' ? (
                                filteredKeyItems.map((item) => {
                                    const keyName = typeof item === 'string' ? item : item.key
                                    const itemType = typeof item === 'object' ? item.type : undefined
                                    const typeStyle = itemType ? TYPE_COLOR[itemType] : null
                                    const isSelected = keyName === selected

                                    const contextMenu = [
                                        {
                                            key: 'copy',
                                            label: '复制键名',
                                            icon: <Copy size={13} />,
                                            onClick: () => copyKeyName(keyName),
                                        },
                                        {
                                            type: 'divider' as const,
                                        },
                                        {
                                            key: 'delete',
                                            danger: true,
                                            label: '删除键',
                                            icon: <Trash2 size={13} />,
                                            onClick: () => delKey(keyName),
                                        },
                                    ]

                                    return (
                                        <Dropdown key={keyName} menu={{ items: contextMenu }} trigger={['contextMenu']}>
                                            <div
                                                className={`${k.redisKey} ${isSelected ? k.active : ''}`}
                                                onClick={() => loadValue(keyName)}
                                                title={keyName}
                                            >
                                                <span className={k.keyLabel}>{keyName}</span>
                                                {itemType && typeStyle && (
                                                    <span
                                                        className={k.typePill}
                                                        style={{
                                                            backgroundColor: typeStyle.bg,
                                                            color: typeStyle.text,
                                                            border: `1px solid ${typeStyle.border}`,
                                                        }}
                                                    >
                                                        {TYPE_SHORT_LABEL[itemType] || itemType.toUpperCase()}
                                                    </span>
                                                )}
                                                <Tooltip title={`删除 ${keyName}`}>
                                                    <button
                                                        type="button"
                                                        className={k.keyDelBtn}
                                                        onClick={(e) => {
                                                            e.stopPropagation()
                                                            delKey(keyName)
                                                        }}
                                                    >
                                                        <Trash2 size={12} />
                                                    </button>
                                                </Tooltip>
                                            </div>
                                        </Dropdown>
                                    )
                                })
                            ) : (
                                <KeyItemTree
                                    nodes={displayTree}
                                    selected={selected}
                                    expandedKeys={expandedKeys}
                                    onToggleExpand={toggleExpand}
                                    onSelectKey={loadValue}
                                    onDeleteFolder={delFolder}
                                    onDeleteKey={delKey}
                                />
                            )
                        )}
                    </div>
                </div>

                {/* Resizable Divider */}
                <div
                    className={`${k.splitResizer} ${isDragging ? k.dragging : ''}`}
                    onMouseDown={handleMouseDown}
                />

                {/* Right Main Content */}
                <div className={k.redisMain}>
                    {selected && value ? (
                        <>
                            <KeyHeader
                                session={session}
                                selected={selected}
                                value={value}
                                onReload={() => loadValue(selected)}
                                onKeyRenamed={(newKey) => {
                                    loadKeys(true)
                                    loadValue(newKey)
                                }}
                                onKeyDeleted={() => delKey(selected)}
                            />

                            {value.type === 'string' && (
                                <StringViewer
                                    session={session}
                                    selected={selected}
                                    value={value}
                                    onReload={() => loadValue(selected)}
                                    flash={flash}
                                />
                            )}

                            {value.type === 'hash' && (
                                <HashViewer
                                    session={session}
                                    selected={selected}
                                    value={value}
                                    onReload={() => loadValue(selected)}
                                    flash={flash}
                                />
                            )}

                            {value.type === 'list' && (
                                <ListViewer
                                    session={session}
                                    selected={selected}
                                    value={value}
                                    onReload={() => loadValue(selected)}
                                    flash={flash}
                                />
                            )}

                            {value.type === 'set' && (
                                <SetViewer
                                    session={session}
                                    selected={selected}
                                    value={value}
                                    onReload={() => loadValue(selected)}
                                    flash={flash}
                                />
                            )}

                            {value.type === 'zset' && (
                                <ZSetViewer
                                    session={session}
                                    selected={selected}
                                    value={value}
                                    onReload={() => loadValue(selected)}
                                    flash={flash}
                                />
                            )}

                            {value.type === 'stream' && (
                                <StreamViewer
                                    session={session}
                                    selected={selected}
                                    value={value}
                                    onReload={() => loadValue(selected)}
                                    flash={flash}
                                />
                            )}
                        </>
                    ) : (
                        <div className={k.emptyMain}>
                            <Database size={52} style={{ color: 'var(--text-faint)', opacity: 0.6 }} />
                            <div className={k.emptyTitle}>未选择任何键</div>
                            <div className={k.emptySubtitle}>
                                从左侧列表点击一个键进行查看与交互式编辑，或直接新建一个键。
                            </div>
                            {onOpenCreateKey && (
                                <Button type="primary" icon={<Plus size={13} />} onClick={onOpenCreateKey}>
                                    新建键 (Create Key)
                                </Button>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Bottom Dockable CLI Console */}
            <RedisCliDrawer
                session={session}
                currentDb={db}
                runRaw={runRaw}
            />
        </div>
    )
}
