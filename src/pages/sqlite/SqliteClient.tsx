import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Space, Tooltip, Input, Dropdown, MenuProps, App } from 'antd'
import { useTranslation } from 'react-i18next'
import {
    Database,
    Plus,
    Table,
    RotateCw,
    Trash2,
    Eraser,
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
    const { t } = useTranslation(['db', 'common'])
    const { message } = App.useApp()
    const [tables, setTables] = useState<SqliteTableInfo[]>([])
    const [filterText, setFilterText] = useState('')
    const [busy, setBusy] = useState(false)
    const [info, setInfo] = useState<{ path: string; size: number }>({
        path: session.path,
        size: session.size,
    })
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
            label: t('sqlite.sqlEditor'),
            type: 'sql',
            closable: false,
        },
    ])
    const [activeTabKey, setActiveTabKey] = useState<string>('sql_main')

    const id = session.id

    const loadTables = useCallback(async () => {
        setBusy(true)
        try {
            const list = await API.sqliteTables(id)
            setTables(list)
        } catch (e) {
            message.error(t('sqlite.loadTableFailed', { error: errorMessage(e) }))
        } finally {
            setBusy(false)
        }
    }, [id, t, message])

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

    const copyPath = () => {
        if (!info.path) {
            message.warning(t('sqlite.noFilePath'))
            return
        }
        navigator.clipboard.writeText(info.path)
        message.success(t('sqlite.filePathCopied'))
    }

    // 打开数据表 Tab
    const openTableTab = (tableName: string) => {
        const tabKey = `tbl_${tableName}`
        const existing = tabs.find((tItem) => tItem.key === tabKey)
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
        const existing = tabs.find((tItem) => tItem.type === 'sql')
        if (existing) {
            setActiveTabKey(existing.key)
            return
        }
        const newTab: SqliteTabItem = {
            key: 'sql_main',
            label: t('sqlite.sqlEditor'),
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
        const nextTabs = tabs.filter((tItem) => tItem.key !== key)
        setTabs(nextTabs)
        if (activeTabKey === key && nextTabs.length > 0) {
            const closedIdx = tabs.findIndex((tItem) => tItem.key === key)
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
        const idx = tabs.findIndex((tItem) => tItem.key === targetKey)
        if (idx <= 0) return
        const nextTabs = tabs.slice(idx)
        setTabs(nextTabs)
        setActiveTabKey(targetKey)
    }

    const handleCloseRightTabs = (targetKey: string) => {
        const idx = tabs.findIndex((tItem) => tItem.key === targetKey)
        if (idx < 0 || idx >= tabs.length - 1) return
        const nextTabs = tabs.slice(0, idx + 1)
        setTabs(nextTabs)
        setActiveTabKey(targetKey)
    }

    // TabBar 展示项
    const tabItems: TabItem[] = useMemo(() => {
        return tabs.map((tItem) => ({
            key: tItem.key,
            label: tItem.type === 'sql' && (tItem.label === 'SQL 编辑器' || tItem.label === 'SQL Editor') ? t('sqlite.sqlEditor') : tItem.label,
            icon: tItem.type === 'sql' ? <Code size={12} /> : <Table size={12} />,
            closable: tItem.closable !== false && tabs.length > 1,
        }))
    }, [tabs, t])

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
            setCreateMsg(t('sqlite.createReq'))
            return
        }
        setCreateBusy(true)
        setCreateMsg('')
        try {
            const sql = `CREATE TABLE ${quoteIdent(tName)} (${cols})`
            await API.sqliteRun(id, sql)
            setCreateMsg(t('sqlite.createSuccess', { name: tName }))
            await loadTables()
            openTableTab(tName)
            setTimeout(() => {
                setCreateModalOpen(false)
                setCreateBusy(false)
            }, 700)
        } catch (e) {
            setCreateMsg(t('sqlite.createFail', { error: errorMessage(e) }))
            setCreateBusy(false)
        }
    }

    // 删除表
    const handleDropTable = (table: SqliteTableInfo) => {
        const typeStr = table.type === 'view' ? t('sqlite.view') : t('sqlite.table')
        setConfirmState({
            open: true,
            title: t('sqlite.dropTitle', { type: typeStr }),
            danger: true,
            message: t('sqlite.dropConfirm', { type: typeStr, name: table.name }),
            onConfirm: async () => {
                setConfirmState(emptyConfirm)
                try {
                    const sql =
                        table.type === 'view'
                            ? `DROP VIEW ${quoteIdent(table.name)}`
                            : `DROP TABLE ${quoteIdent(table.name)}`
                    await API.sqliteRun(id, sql)
                    message.success(t('sqlite.dropSuccess', { name: table.name }))
                    handleCloseTab(`tbl_${table.name}`)
                    await loadTables()
                } catch (e) {
                    message.error(t('sqlite.dropFail', { error: errorMessage(e) }))
                }
            },
        })
    }

    // 清空表
    const handleTruncateTable = (table: SqliteTableInfo) => {
        setConfirmState({
            open: true,
            title: t('sqlite.truncateTitle'),
            danger: true,
            message: t('sqlite.truncateConfirm', { name: table.name }),
            onConfirm: async () => {
                setConfirmState(emptyConfirm)
                try {
                    await API.sqliteRun(id, `DELETE FROM ${quoteIdent(table.name)}`)
                    message.success(t('sqlite.truncateSuccess', { name: table.name }))
                    await loadTables()
                } catch (e) {
                    message.error(t('sqlite.truncateFail', { error: errorMessage(e) }))
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
        return tables.filter((tItem) => tItem.name.toLowerCase().includes(q))
    }, [tables, filterText])

    // 当前活跃的数据表名
    const activeTableName = useMemo(() => {
        const active = tabs.find((tItem) => tItem.key === activeTabKey)
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
                    <Tooltip title={info.path ? info.path : 'unkown'}>
                        <div className={sq.sqliteTitleWrap} onClick={copyPath}>
                            <Database size={15} style={{ color: '#faad14', flexShrink: 0 }} />
                            <span className={sq.sqliteTitle}>
                                {session.title || 'SQLite'}
                            </span>
                        </div>
                    </Tooltip>
                    <Space size={2} style={{ marginLeft: 'auto' }}>
                        <Tooltip title={t('sqlite.newTable')}>
                            <Button size="small" type="text" icon={<Plus size={12} />} onClick={handleOpenCreateModal} />
                        </Tooltip>
                        <Tooltip title={t('sqlite.sqlEditor')}>
                            <Button size="small" type="text" icon={<Code size={12} />} onClick={() => openSqlEditor()} />
                        </Tooltip>
                        <Tooltip title={t('sqlite.reload')}>
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
                            <Tooltip title={t('sqlite.closeSession')}>
                                <Button size="small" type="text" icon={<X size={12} />} onClick={onClose} />
                            </Tooltip>
                        )}
                    </Space>
                </div>

                <div className={sq.sqliteStatus}>
                    <span>{t('sqlite.size', { size: fmtSize(info.size) })}</span>
                    <span style={{ marginLeft: 'auto' }}>
                        {t('sqlite.tablesCount', { count: tables.length })}
                    </span>
                </div>

                <div style={{ padding: '6px 8px 4px' }}>
                    <Input
                        size="small"
                        placeholder={t('sqlite.filterPlaceholder')}
                        value={filterText}
                        onChange={(e) => setFilterText(e.target.value)}
                        allowClear
                    />
                </div>

                <div className={sq.sqliteTables}>
                    {filteredTables.map((tbl) => {
                        const isActive = activeTableName === tbl.name
                        const menuItems: MenuProps['items'] = [
                            {
                                key: 'open',
                                label: t('sqlite.openTable'),
                                icon: <Table size={12} />,
                                onClick: () => openTableTab(tbl.name),
                            },
                            {
                                key: 'new_query',
                                label: t('sqlite.openSqlEditor'),
                                icon: <Code size={12} />,
                                onClick: () => {
                                    openSqlEditor(`SELECT * FROM ${quoteIdent(tbl.name)} LIMIT 50;`)
                                },
                            },
                            { type: 'divider' },
                            {
                                key: 'truncate',
                                label: t('sqlite.truncate'),
                                icon: <Eraser size={12} />,
                                danger: true,
                                disabled: tbl.type === 'view',
                                onClick: () => handleTruncateTable(tbl),
                            },
                            {
                                key: 'drop',
                                label: t('sqlite.drop', { type: tbl.type === 'view' ? t('sqlite.view') : t('sqlite.table') }),
                                icon: <Trash2 size={12} />,
                                danger: true,
                                onClick: () => handleDropTable(tbl),
                            },
                        ]

                        return (
                            <Dropdown key={tbl.name} menu={{ items: menuItems }} trigger={['contextMenu']}>
                                <div
                                    className={`${sq.sqliteTableRow} ${isActive ? sq.active : ''}`}
                                    onClick={() => openTableTab(tbl.name)}
                                    title={`${tbl.name} (${tbl.type === 'view' ? t('sqlite.view') : t('sqlite.table')})`}
                                >
                                    <Table size={13} className={sq.tableIcon} />
                                    <span className={sq.tableName}>{tbl.name}</span>
                                    {tbl.type === 'view' && <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>VIEW</span>}
                                </div>
                            </Dropdown>
                        )
                    })}
                    {filteredTables.length === 0 && (
                        <div style={{ color: 'var(--text-dim)', fontSize: 12, padding: 12, textAlign: 'center' }}>
                            {filterText ? t('sqlite.noMatchingTables') : t('sqlite.noTables')}
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
                    {tabs.map((tItem) => {
                        const isVisible = tItem.key === activeTabKey
                        if (!isVisible) return null

                        if (tItem.type === 'data' && tItem.table) {
                            return (
                                <DbDataTab
                                    key={tItem.key}
                                    adapter={createSqliteAdapter(id, tItem.table, session.title || 'sqlite')}
                                    onClose={() => handleCloseTab(tItem.key)}
                                />
                            )
                        }

                        if (tItem.type === 'sql') {
                            return (
                                <DbSqlEditor
                                    key={tItem.key}
                                    adapter={createSqliteSqlAdapter(id, session.title || 'sqlite')}
                                    initialSql={tItem.sqlText}
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
