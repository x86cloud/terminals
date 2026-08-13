import React, {useEffect, useMemo, useState} from 'react'
import { Folder, Table } from 'lucide-react'
import CodeEditor from '@/components/CodeEditor'
import {RedisKeysResult, RedisSessionInfo, RedisValue} from '@/types'
import {KeyTreeNode, TYPE_LABEL} from '@/pages/redis/redisTypes'
import KeyItemTree from '@/pages/redis/KeyItemTree'
import ValueEditor from '@/pages/redis/ValueEditor'
import g from '@/styles/global.module.less'
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
    delimiter: string
    setDelimiter: (v: string) => void
    expandedKeys: Set<string>
    toggleExpand: (nodeKey: string) => void
    keyTree: KeyTreeNode[]
    cliInput: string
    setCliInput: (v: string) => void
    cliResult: string
    setCliResult: (v: string) => void
    loadKeys: (reset?: boolean) => Promise<void>
    loadValue: (key: string) => Promise<void>
    switchDb: () => Promise<void>
    saveValue: () => Promise<void>
    delKey: (keyName?: string) => void
    delFolder: (node: KeyTreeNode) => void
    runRaw: (cmd: string) => Promise<string | undefined>
    flash: (m: string) => void
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
    delimiter,
    setDelimiter,
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
}: KeysTabProps) {
    return (
        <div className={k.body}>
            <div className={k.redisSide}>
                <div className={k.redisSideHead}>
                    <input
                        className={k.redisSearch}
                        placeholder="搜索 pattern"
                        value={pattern}
                        onChange={(e) => setPattern(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && loadKeys(true)}
                    />
                    <button className={`${g.btn} ${g.sm}`} onClick={() => loadKeys(true)}>刷新</button>
                    <button className={`${g.btn} ${g.sm}`} onClick={() => loadKeys(false)} disabled={data.cursor === '0'}>
                        更多
                    </button>
                </div>
                <div className={k.redisDbBar}>
                    <span className={k.redisDbLabel}>DB</span>
                    <input
                        className={k.redisDbInput}
                        type="number"
                        min={0}
                        value={dbInput}
                        onChange={(e) => setDbInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && switchDb()}
                    />
                    <button className={`${g.btn} ${g.sm}`} onClick={switchDb} disabled={Number(dbInput) === db}>
                        切换
                    </button>
                    <span className={k.redisDbCount}>{data.keys.length} 键 / 共 {session.dbSize}</span>
                </div>

                <div className={k.viewModeBar}>
                    <div className={`${g.segmented} ${g.xs}`}>
                        <button
                            className={viewMode === 'tree' ? g.active : ''}
                            title="树状视图"
                            onClick={() => setViewMode('tree')}
                        >
                            <Folder size={12}/> 树状
                        </button>
                        <button
                            className={viewMode === 'flat' ? g.active : ''}
                            title="平铺列表"
                            onClick={() => setViewMode('flat')}
                        >
                            <Table size={12}/> 平铺
                        </button>
                    </div>
                    <span className={g.spacer}/>
                    {viewMode === 'tree' && (
                        <span style={{fontSize: 11, color: '#888', display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap', flexShrink: 0}}>
                            分隔符
                            <input
                                className={k.delimiterInput}
                                value={delimiter}
                                maxLength={3}
                                onChange={(e) => setDelimiter(e.target.value)}
                                title="键名分层分隔符，默认冒号 :"
                            />
                        </span>
                    )}
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
                        <div className={k.redisValueHead}>
                            <span className={k.redisKeyName} title={selected}>{selected}</span>
                            <span className={k.redisTypeBadge}>{TYPE_LABEL[value.type]}</span>
                            <span className={k.redisTtl}>TTL: {ttl}</span>
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
                                lang="plain"
                                height="280px"
                                placeholder="值内容"
                            />
                        )}
                        <div className={k.redisValueActions}>
                            <label className={k.redisTtlInput}>
                                TTL(秒)
                                <input
                                    type="number"
                                    value={ttl}
                                    onChange={(e) => setTtl(Number(e.target.value) || 0)}
                                />
                            </label>
                            <button className={`${g.btn} ${g.primary} ${g.sm}`} onClick={saveValue}>保存</button>
                            <button className={`${g.btn} ${g.danger} ${g.sm}`} onClick={() => delKey()}>删除</button>
                        </div>
                        <ValueEditor session={session} value={value} selected={selected} flash={flash}/>
                    </>
                ) : (
                    <div className={k.redisEmpty}>从左侧选择一个键查看 / 编辑</div>
                )}

                <div className={k.redisCli}>
                    <div className={k.redisCliHead}>命令行 (CLI)</div>
                    <div className={k.redisCliRow}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <CodeEditor
                                value={cliInput}
                                onChange={setCliInput}
                                lang="plain"
                                height="56px"
                                placeholder="输入 Redis 原生命令（例如：GET foo / HSET myhash field val）"
                                onEnter={async (v) => {
                                    if (!v.trim()) return
                                    const res = await runRaw(v)
                                    setCliResult(res || '(空结果)')
                                }}
                            />
                        </div>
                        <button
                            className={`${g.btn} ${g.primary}`}
                            style={{ height: 56, padding: '0 20px', flexShrink: 0, fontSize: 13, fontWeight: 500 }}
                            onClick={async () => {
                                if (!cliInput.trim()) return
                                const res = await runRaw(cliInput)
                                setCliResult(res || '(空结果)')
                            }}
                        >
                            执行
                        </button>
                    </div>
                    {cliResult && (
                        <div className={k.cliResultWrapper}>
                            <pre className={k.redisCliResult}>{cliResult}</pre>
                            <button
                                className={k.cliClearBtn}
                                title="清空输出"
                                onClick={() => setCliResult('')}
                            >
                                清空
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
