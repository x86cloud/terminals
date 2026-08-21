import React from 'react'
import { Input, InputNumber, Button, Segmented, Select, Tag, Tooltip, Space, message } from 'antd'
import { Folder, Table, Search, RotateCw, Download, Plus, Sparkles, Minimize2 } from 'lucide-react'
import CodeEditor from '@/components/CodeEditor'
import { RedisKeysResult, RedisSessionInfo, RedisValue } from '@/types'
import { KeyTreeNode, TYPE_LABEL } from '@/pages/redis/redisTypes'
import KeyItemTree from '@/pages/redis/KeyItemTree'
import ValueEditor from '@/pages/redis/ValueEditor'
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
    editor,
    setEditor,
    ttl,
    setTtl,
    db,
    dbInput,
    setDbInput,
    viewMode,
    setViewMode,
    expandedKeys,
    toggleExpand,
    keyTree,
    cliInput,
    setCliInput,
    cliResult,
    setCliResult,
    loadKeys,
    loadValue,
    switchDb,
    saveValue,
    delKey,
    delFolder,
    runRaw,
    flash,
    onOpenCreateKey,
}: KeysTabProps) {
    const beautifyJson = () => {
        try {
            const obj = JSON.parse(editor)
            setEditor(JSON.stringify(obj, null, 2))
            message.success('已美化 JSON')
        } catch {
            message.warning('当前内容不是合法的 JSON 格式')
        }
    }

    const minifyJson = () => {
        try {
            const obj = JSON.parse(editor)
            setEditor(JSON.stringify(obj))
            message.success('已压缩 JSON')
        } catch {
            message.warning('当前内容不是合法的 JSON 格式')
        }
    }

    return (
        <div className={k.body}>
            <div className={k.redisSide}>
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
                                        type="text"
                                        icon={<Plus size={13} />}
                                        onClick={onOpenCreateKey}
                                    />
                                </Tooltip>
                            )}
                            <Tooltip title="刷新键列表">
                                <Button
                                    size="small"
                                    type="text"
                                    icon={<RotateCw size={13} />}
                                    onClick={() => loadKeys(true)}
                                />
                            </Tooltip>
                            {data.cursor !== '0' && (
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

                    <div className={k.searchRow}>
                        <Input
                            size="small"
                            placeholder="搜索 pattern (如: user:*)..."
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
                                { value: 'flat', icon: <Table size={12} /> },
                            ]}
                        />
                    </div>
                </div>

                <div className={k.redisKeys}>
                    {data.keys.length === 0 && <div className={k.redisEmpty}>无键</div>}
                    {data.keys.length > 0 && (
                        viewMode === 'flat' ? (
                            data.keys.map((key) => (
                                <div
                                    key={key}
                                    className={`${k.redisKey} ${key === selected ? ' ' + k.active : ''}`}
                                    onClick={() => loadValue(key)}
                                    title={key}
                                >
                                    {key}
                                </div>
                            ))
                        ) : (
                            <KeyItemTree
                                nodes={keyTree}
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

            <div className={k.redisMain}>
                {selected && value ? (
                    <>
                        <div className={k.redisValueHead} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px' }}>
                            <span className={k.redisKeyName} title={selected} style={{ fontWeight: 600 }}>{selected}</span>
                            <Tag color="geekblue">{TYPE_LABEL[value.type]}</Tag>
                            {value.type === 'string' && (
                                <Space size={4}>
                                    <Tooltip title="美化 JSON 格式">
                                        <Button size="small" type="text" icon={<Sparkles size={12} />} onClick={beautifyJson}>美化</Button>
                                    </Tooltip>
                                    <Tooltip title="压缩 JSON 为单行">
                                        <Button size="small" type="text" icon={<Minimize2 size={12} />} onClick={minifyJson}>压缩</Button>
                                    </Tooltip>
                                </Space>
                            )}
                            <span className={k.redisTtl} style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-dim)' }}>TTL: {ttl}</span>
                        </div>
                        {value.type === 'stream' ? (
                            <CodeEditor
                                value={editor}
                                onChange={setEditor}
                                lang="plain"
                                height="220px"
                                readOnly
                                placeholder="值内容"
                            />
                        ) : (
                            <CodeEditor
                                value={editor}
                                onChange={setEditor}
                                lang={/^\s*[[{]/.test(editor) ? 'json' : 'plain'}
                                height="280px"
                                lineNumbers={false}
                                placeholder="值内容"
                            />
                        )}
                        <div className={k.redisValueActions} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>TTL(秒)</span>
                                <InputNumber
                                    size="small"
                                    style={{ width: 90 }}
                                    value={ttl}
                                    onChange={(v) => setTtl(v ?? 0)}
                                />
                            </div>
                            <Button size="small" type="primary" onClick={saveValue}>保存</Button>
                            <Button size="small" danger onClick={() => delKey()}>删除</Button>
                        </div>
                        <ValueEditor
                            session={session}
                            value={value}
                            selected={selected}
                            flash={flash}
                            onReload={() => loadValue(selected)}
                        />
                    </>
                ) : (
                    <div className={k.redisEmpty}>从左侧选择一个键查看 / 编辑</div>
                )}

                <div className={k.redisCli}>
                    <div className={k.redisCliHead}>命令行 (CLI)</div>
                    <div className={k.redisCliRow} style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <CodeEditor
                                value={cliInput}
                                onChange={setCliInput}
                                lang="json"
                                lineNumbers={false}
                                bordered
                                height="168px"
                                placeholder="输入 Redis 原生命令（例如：GET foo / HSET myhash field val）"
                                onEnter={async (v) => {
                                    if (!v.trim()) return
                                    const res = await runRaw(v)
                                    setCliResult(res || '(空结果)')
                                }}
                            />
                        </div>
                        <Button
                            type="primary"
                            style={{ height: 'auto', minHeight: 56, padding: '0 20px', fontSize: 13 }}
                            onClick={async () => {
                                if (!cliInput.trim()) return
                                const res = await runRaw(cliInput)
                                setCliResult(res || '(空结果)')
                            }}
                        >
                            执行
                        </Button>
                    </div>
                    {cliResult && (
                        <div className={k.cliResultWrapper}>
                            <pre className={k.redisCliResult}>{cliResult}</pre>
                            <Button
                                size="small"
                                className={k.cliClearBtn}
                                onClick={() => setCliResult('')}
                            >
                                清空
                            </Button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
