import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Space, Tooltip, Input, Dropdown, MenuProps, message } from 'antd'
import {
    Database,
    Plus,
    Folder,
    FileText,
    Table,
    RotateCw,
    Trash2,
    Eraser,
    Play,
    Code,
    X,
} from 'lucide-react'
import TabBar, { TabItem } from '@/components/common/TabBar'
import DbDataTab from '@/components/db/DataTab'
import DbSqlEditor from '@/components/db/SqlEditor'
import { createSqliteAdapter, createSqliteSqlAdapter } from '@/components/db/adapters'
import { API } from '@/api'
import { errorMessage } from '@/utils'
import { SqliteSessionInfo, SqliteTableInfo } from '@/types'
import { ConfirmModal, ConfirmState } from '@/components/Modal'
import ObjModal from '@/pages/mysql/ObjModal'
import sq from './SqliteClient.module.less'

interface Props {
    session: SqliteSessionInfo
    onClose: () => void
}

interface SqliteTabItem {
    key: string
    label: string
    type: 'data' | 'sql'
    table?: string
    sqlText?: string
    closable?: boolean
}

const emptyConfirm: ConfirmState = { open: false, title: '', message: '' }

function quoteIdent(s: string): string {
    return `"${s.replace(/"/g, '""')}"`
}

export default function SqliteClient({ session, onClose }: Props) {
    const [tables, setTables] = useState<SqliteTableInfo[]>([])
    const [filterText, setFilterText] = useState('')
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')
    const [info, setInfo] = useState<{ path: string; size: number }>({
        path: session.path,
        size: session.size,
    })
    const [pathError, setPathError] = useState('')
    const [confirmState, setConfirmState] = useState<ConfirmState>(emptyConfirm)

    // 建表弹窗态
    const [createModalOpen, setCreateModalOpen] = useState(false)
    const [createTableName, setCreateTableName] = useState('')
    const [createColDefs, setCreateColDefs] = useState('')
    const [createBusy, setCreateBusy] = useState(false)
    const [createMsg, setCreateMsg] = useState('')

    // 标签页状态：默认打开一个 SQL 编辑器 Tab
    const [tabs, setTabs] = useState<SqliteTabItem[]>([
        {
            key: 'sql_main',
            label: 'SQL 编辑器',
            type: 'sql',
            closable: false,
        },
    ])
    const [activeTabKey, setActiveTabKey] = useState<string>('sql_main')

    const id = session.id

    const loadTables = useCallback(async () => {
        setBusy(true)
        setError('')
        try {
            const list = await API.sqliteTables(id)
            setTables(list)
        } catch (e) {
            setError(errorMessage(e))
        } finally {
            setBusy(false)
        }
    }, [id])

    const loadInfo = useCallback(async () => {
        try {
            const i = await API.sqliteInfo(id)
            if (i) setInfo({ path: i.path, size: Number(i.size) || 0 })
        } catch {
            /* ignore */
        }
    }, [id])

    useEffect(() => {
        void loadTables()
        void loadInfo()
    }, [loadTables, loadInfo])

    const switchFile = async () => {
        try {
            const path = await API.sqliteOpenFile()
            if (!path) return
            setBusy(true)
            setError('')
            setPathError('')
            const ok = await API.sqliteConnect(id, path)
            if (!ok) throw new Error('无法打开该 SQLite 文件')
            await Promise.all([loadTables(), loadInfo()])
        } catch (e) {
            setPathError(errorMessage(e))
            setError(errorMessage(e))
        } finally {
            setBusy(false)
        }
    }

    // 打开数据表 Tab
    const openTableTab = (tableName: string) => {
        const tabKey = `tbl_${tableName}`
        const existing = tabs.find((t) => t.key === tabKey)
        if (existing) {
            setActiveTabKey(tabKey)
            return
        }

        const newTab: SqliteTabItem = {
            key: tabKey,
            label: tableName,
            type: 'data',
            table: tableName,
            closable: true,
        }
        setTabs((prev) => [...prev, newTab])
        setActiveTabKey(tabKey)
    }

    // 打开/激活 SQL 编辑器 Tab
    const openSqlEditor = (initialSql?: string) => {
        const existing = tabs.find((t) => t.type === 'sql')
        if (existing) {
            setActiveTabKey(existing.key)
            return
        }
        const newTab: SqliteTabItem = {
            key: 'sql_main',
            label: 'SQL 编辑器',
            type: 'sql',
            sqlText: initialSql,
            closable: true,
        }
        setTabs((prev) => [...prev, newTab])
        setActiveTabKey('sql_main')
    }

    // 关闭 Tab
    const handleCloseTab = (key: string) => {
        if (tabs.length <= 1) return
        const nextTabs = tabs.filter((t) => t.key !== key)
        setTabs(nextTabs)
        if (activeTabKey === key && nextTabs.length > 0) {
            const closedIdx = tabs.findIndex((t) => t.key === key)
            const nextActive = nextTabs[Math.min(closedIdx, nextTabs.length - 1)]
            if (nextActive) setActiveTabKey(nextActive.key)
        }
    }

    const handleCloseAllTabs = () => {
        if (tabs.length <= 1) return
        const first = tabs[0]
        setTabs([first])
        setActiveTabKey(first.key)
    }

    const handleCloseLeftTabs = (targetKey: string) => {
        const idx = tabs.findIndex((t) => t.key === targetKey)
        if (idx <= 0) return
        const nextTabs = tabs.slice(idx)
        setTabs(nextTabs)
        setActiveTabKey(targetKey)
    }

    const handleCloseRightTabs = (targetKey: string) => {
        const idx = tabs.findIndex((t) => t.key === targetKey)
        if (idx < 0 || idx >= tabs.length - 1) return
        const nextTabs = tabs.slice(0, idx + 1)
        setTabs(nextTabs)
        setActiveTabKey(targetKey)
    }

    // TabBar 展示项
    const tabItems: TabItem[] = useMemo(() => {
        return tabs.map((t) => ({
            key: t.key,
            label: t.label,
            icon: t.type === 'sql' ? <Code size={12} /> : <Table size={12} />,
            closable: t.closable !== false && tabs.length > 1,
        }))
    }, [tabs])

    // 打开新建表弹窗
    const handleOpenCreateModal = () => {
        setCreateTableName('')
        setCreateColDefs('"id" INTEGER PRIMARY KEY AUTOINCREMENT, "name" TEXT')
        setCreateMsg('')
        setCreateModalOpen(true)
    }

    const handleConfirmCreateTable = async () => {
        const tName = createTableName.trim()
        const cols = createColDefs.trim()
        if (!tName || !cols) {
            setCreateMsg('失败：表名和列定义不能为空')
            return
        }
        setCreateBusy(true)
        setCreateMsg('')
        try {
            const sql = `CREATE TABLE ${quoteIdent(tName)} (${cols})`
            await API.sqliteRun(id, sql)
            setCreateMsg(`已成功创建表 ${tName}`)
            await loadTables()
            openTableTab(tName)
            setTimeout(() => {
                setCreateModalOpen(false)
                setCreateBusy(false)
            }, 700)
        } catch (e) {
            setCreateMsg(`失败：${errorMessage(e)}`)
            setCreateBusy(false)
        }
    }

    // 删除表
    const handleDropTable = (table: SqliteTableInfo) => {
        setConfirmState({
            open: true,
            title: `删除${table.type === 'view' ? '视图' : '表'}`,
            danger: true,
            message: `确定要彻底删除 ${table.type === 'view' ? '视图' : '表'}「${table.name}」吗？此操作不可逆。`,
            onConfirm: async () => {
                setConfirmState(emptyConfirm)
                try {
                    const sql =
                        table.type === 'view'
                            ? `DROP VIEW ${quoteIdent(table.name)}`
                            : `DROP TABLE ${quoteIdent(table.name)}`
                    await API.sqliteRun(id, sql)
                    message.success(`已删除 ${table.name}`)
                    handleCloseTab(`tbl_${table.name}`)
                    await loadTables()
                } catch (e) {
                    message.error(`删除失败: ${errorMessage(e)}`)
                }
            },
        })
    }

    // 清空表
    const handleTruncateTable = (table: SqliteTableInfo) => {
        setConfirmState({
            open: true,
            title: '清空表数据',
            danger: true,
            message: `确定要清空表「${table.name}」的所有数据吗？此操作不可逆。`,
            onConfirm: async () => {
                setConfirmState(emptyConfirm)
                try {
                    await API.sqliteRun(id, `DELETE FROM ${quoteIdent(table.name)}`)
                    message.success(`已清空表 ${table.name}`)
                    await loadTables()
                } catch (e) {
                    message.error(`清空失败: ${errorMessage(e)}`)
                }
            },
        })
    }

    const fmtSize = (n: number) => {
        if (!n) return '0 B'
        const units = ['B', 'KB', 'MB', 'GB']
        let i = 0
        let v = n
        while (v >= 1024 && i < units.length - 1) {
            v /= 1024
            i++
        }
        return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`
    }

    const filteredTables = useMemo(() => {
        if (!filterText.trim()) return tables
        const q = filterText.toLowerCase()
        return tables.filter((t) => t.name.toLowerCase().includes(q))
    }, [tables, filterText])

    // 当前活跃的数据表名
    const activeTableName = useMemo(() => {
        const active = tabs.find((t) => t.key === activeTabKey)
        if (active && active.type === 'data') return active.table
        return null
    }, [tabs, activeTabKey])

    return (
        <div className={sq.sqlitePane}>
            <ConfirmModal state={confirmState} onCancel={() => setConfirmState(emptyConfirm)} />

            {createModalOpen && (
                <ObjModal
                    kind="createtable"
                    busy={createBusy}
                    msg={createMsg}
                    name={createTableName}
                    extra={createColDefs}
                    placeholder='"id" INTEGER PRIMARY KEY AUTOINCREMENT, "name" TEXT'
                    onName={setCreateTableName}
                    onExtra={setCreateColDefs}
                    onClose={() => !createBusy && setCreateModalOpen(false)}
                    onConfirm={handleConfirmCreateTable}
                />
            )}

            {/* 左侧侧边栏 */}
            <aside className={sq.sqliteSide}>
                <div className={sq.sqliteHead}>
                    <Database size={15} style={{ color: '#faad14' }} />
                    <span className={sq.sqliteTitle} title={session.title || 'SQLite'}>
                        {session.title || 'SQLite'}
                    </span>
                    <Space size={2} style={{ marginLeft: 'auto' }}>
                        <Tooltip title="切换文件">
                            <Button size="small" type="text" icon={<Folder size={12} />} onClick={switchFile} />
                        </Tooltip>
                        <Tooltip title="新建数据表">
                            <Button size="small" type="text" icon={<Plus size={12} />} onClick={handleOpenCreateModal} />
                        </Tooltip>
                        <Tooltip title="SQL 编辑器">
                            <Button size="small" type="text" icon={<Code size={12} />} onClick={() => openSqlEditor()} />
                        </Tooltip>
                        <Tooltip title="重新加载">
                            <Button
                                size="small"
                                type="text"
                                icon={<RotateCw size={12} />}
                                loading={busy}
                                onClick={() => {
                                    void loadTables()
                                    void loadInfo()
                                }}
                            />
                        </Tooltip>
                        {onClose && (
                            <Tooltip title="关闭会话">
                                <Button size="small" type="text" icon={<X size={12} />} onClick={onClose} />
                            </Tooltip>
                        )}
                    </Space>
                </div>

                <div className={sq.sqlitePath} title={info.path}>
                    <FileText size={12} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {info.path || '未选择文件'}
                    </span>
                </div>

                <div className={sq.sqliteStatus}>
                    <span>大小：{fmtSize(info.size)}</span>
                    <span style={{ marginLeft: 'auto' }}>
                        共 {tables.length} {tables.length === 1 ? '张表' : '张表/视图'}
                    </span>
                    {pathError && <span className={sq.pathErr}>{pathError}</span>}
                </div>

                <div style={{ padding: '6px 8px 4px' }}>
                    <Input
                        size="small"
                        placeholder="过滤表名..."
                        value={filterText}
                        onChange={(e) => setFilterText(e.target.value)}
                        allowClear
                    />
                </div>

                <div className={sq.sqliteTables}>
                    {filteredTables.map((t) => {
                        const isActive = activeTableName === t.name
                        const menuItems: MenuProps['items'] = [
                            {
                                key: 'open',
                                label: '打开数据表',
                                icon: <Table size={12} />,
                                onClick: () => openTableTab(t.name),
                            },
                            {
                                key: 'new_query',
                                label: '打开 SQL 编辑器',
                                icon: <Code size={12} />,
                                onClick: () => {
                                    openSqlEditor(`SELECT * FROM ${quoteIdent(t.name)} LIMIT 50;`)
                                },
                            },
                            { type: 'divider' },
                            {
                                key: 'truncate',
                                label: '清空表数据',
                                icon: <Eraser size={12} />,
                                danger: true,
                                disabled: t.type === 'view',
                                onClick: () => handleTruncateTable(t),
                            },
                            {
                                key: 'drop',
                                label: `删除${t.type === 'view' ? '视图' : '表'}`,
                                icon: <Trash2 size={12} />,
                                danger: true,
                                onClick: () => handleDropTable(t),
                            },
                        ]

                        return (
                            <Dropdown key={t.name} menu={{ items: menuItems }} trigger={['contextMenu']}>
                                <div
                                    className={`${sq.sqliteTableRow} ${isActive ? sq.active : ''}`}
                                    onClick={() => openTableTab(t.name)}
                                    title={`${t.name} (${t.type === 'view' ? '视图' : '表'})`}
                                >
                                    <Table size={13} className={sq.tableIcon} />
                                    <span className={sq.tableName}>{t.name}</span>
                                    {t.type === 'view' && <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>VIEW</span>}
                                </div>
                            </Dropdown>
                        )
                    })}
                    {filteredTables.length === 0 && (
                        <div style={{ color: 'var(--text-dim)', fontSize: 12, padding: 12, textAlign: 'center' }}>
                            {filterText ? '无匹配表' : '暂无数据表'}
                        </div>
                    )}
                </div>
            </aside>

            {/* 右侧主区域：多标签页体系 */}
            <main className={sq.sqliteMain}>
                <div className={sq.tabBarWrap}>
                    <TabBar
                        items={tabItems}
                        activeKey={activeTabKey}
                        onChange={setActiveTabKey}
                        onClose={handleCloseTab}
                        onCloseAll={handleCloseAllTabs}
                        onCloseLeft={handleCloseLeftTabs}
                        onCloseRight={handleCloseRightTabs}
                        size="small"
                    />
                </div>

                <div className={sq.tabContent}>
                    {tabs.map((t) => {
                        const isVisible = t.key === activeTabKey
                        if (!isVisible) return null

                        if (t.type === 'data' && t.table) {
                            return (
                                <DbDataTab
                                    key={t.key}
                                    adapter={createSqliteAdapter(id, t.table, session.title || 'sqlite')}
                                    onClose={() => handleCloseTab(t.key)}
                                />
                            )
                        }

                        if (t.type === 'sql') {
                            return (
                                <DbSqlEditor
                                    key={t.key}
                                    adapter={createSqliteSqlAdapter(id, session.title || 'sqlite')}
                                    initialSql={t.sqlText}
                                />
                            )
                        }

                        return null
                    })}
                </div>
            </main>
        </div>
    )
}
