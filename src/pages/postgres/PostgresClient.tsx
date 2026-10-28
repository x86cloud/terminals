import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { Button, Tag, Dropdown, MenuProps, Tooltip, Space, App } from 'antd'
import { useTranslation } from 'react-i18next'
import Tree from '@/components/common/Tree'
import {
    Database,
    Folder,
    Table,
    Plus,
    RotateCw,
    Play,
    Activity,
    Users,
    Network,
    Code2,
    Trash2,
    Download,
    Upload,
    Eraser,
} from 'lucide-react'
import { API } from '@/api'
import ClientIcon from '@/components/ClientIcon'
import { PostgresSessionInfo } from '@/types'
import { PgDatabase, PgSchema, PgTable, PostgresTabItem } from './postgresTypes'
import TabBar, { TabItem } from '@/components/common/TabBar'
import DbDataTab from '@/components/db/DataTab'
import DbSqlEditor from '@/components/db/SqlEditor'
import { createPostgresAdapter, createPostgresSqlAdapter } from '@/components/db/adapters'
import StatusPanel from './StatusPanel'
import RolesPanel from './RolesPanel'
import FunctionsPanel from './FunctionsPanel'
import ErDiagram from './ErDiagram'
import { CreateDbModal, CreateSchemaModal, CreateTableModal } from './ObjModal'
import { ExportModal, ImportModal } from './IoModal'
import pg from './PostgresClient.module.less'

interface Props {
    session: PostgresSessionInfo
    onClose: () => void
    onChange?: (id: string, database: string) => void
}

export default function PostgresClient({ session, onClose: _onClose, onChange: _onChange }: Props) {
    const { t } = useTranslation(['db', 'common'])
    const { message } = App.useApp()
    const serverId = session.serverId
    const [currentDb, setCurrentDb] = useState<string>(session.database || 'postgres')
    const [currentSchema, setCurrentSchema] = useState<string>(session.schema || 'public')

    // 树与元数据状态
    const [databases, setDatabases] = useState<PgDatabase[]>([])
    const [schemasMap, setSchemasMap] = useState<Record<string, PgSchema[]>>({})
    const [tablesMap, setTablesMap] = useState<Record<string, PgTable[]>>({})
    const [expandedKeys, setExpandedKeys] = useState<string[]>([])
    const [loadingTree, setLoadingTree] = useState(false)
    const [loadingDbs, setLoadingDbs] = useState<Record<string, boolean>>({})
    const [loadingSchemas, setLoadingSchemas] = useState<Record<string, boolean>>({})

    // 工作区标签栏管理
    const [tabs, setTabs] = useState<PostgresTabItem[]>([
        {
            key: 'status',
            label: t('postgres.tabStatus'),
            type: 'status',
            dbName: currentDb,
            closable: false,
        },
        {
            key: 'sql_1',
            label: t('postgres.tabSql'),
            type: 'sql',
            dbName: currentDb,
            closable: false,
        },
    ])
    const [activeTabKey, setActiveTabKey] = useState<string>('status')

    // 弹窗状态
    const [createDbOpen, setCreateDbOpen] = useState(false)
    const [createSchemaOpen, setCreateSchemaOpen] = useState(false)
    const [createTableOpen, setCreateTableOpen] = useState(false)
    const [exportModal, setExportModal] = useState<{ open: boolean; table: string } | null>(null)
    const [importModal, setImportModal] = useState<{ open: boolean; table: string } | null>(null)

    // 加载指定 Schema 下的表
    const loadTables = async (dbName: string, schemaName: string) => {
        const key = `${dbName}:${schemaName}`
        setLoadingSchemas((prev) => ({ ...prev, [key]: true }))
        try {
            const list = await API.postgresTables(serverId, dbName, schemaName)
            setTablesMap((prev) => ({ ...prev, [key]: list || [] }))
        } catch (e: any) {
            console.error('Failed to load tables:', e)
        } finally {
            setLoadingSchemas((prev) => ({ ...prev, [key]: false }))
        }
    }

    // 加载指定数据库下的 Schemas
    const loadSchemas = useCallback(async (dbName: string) => {
        setLoadingDbs((prev) => ({ ...prev, [dbName]: true }))
        try {
            const list = await API.postgresSchemas(serverId, dbName)
            setSchemasMap((prev) => ({ ...prev, [dbName]: list || [] }))
            // 自动预加载默认 public schema 下的表
            await loadTables(dbName, 'public')
        } catch (e: any) {
            console.error('Failed to load schemas:', e)
        } finally {
            setLoadingDbs((prev) => ({ ...prev, [dbName]: false }))
        }
    }, [serverId])

    // 连接初始化
    const initConnection = useCallback(async () => {
        setLoadingTree(true)
        try {
            await API.postgresConnect(serverId)
            const dbs = await API.postgresDatabases(serverId)
            setDatabases(dbs || [])
            if (dbs && dbs.length > 0) {
                const targetDb = session.database || dbs[0].name
                setCurrentDb(targetDb)
                await loadSchemas(targetDb)
                setExpandedKeys([`db_${targetDb}`, `schema_${targetDb}_public`])
            }
        } catch (e: any) {
            message.error(t('postgres.connectFailed', { error: e.message || e }))
        } finally {
            setLoadingTree(false)
        }
    }, [serverId, session.database, loadSchemas, t, message])

    useEffect(() => {
        initConnection()
    }, [initConnection])

    // 打开数据表 Tab
    const openTableTab = (dbName: string, schema: string, table: string) => {
        const tabKey = `tbl_${dbName}_${schema}_${table}`
        const existing = tabs.find((tItem) => tItem.key === tabKey)
        if (existing) {
            setActiveTabKey(tabKey)
            return
        }

        const newTab: PostgresTabItem = {
            key: tabKey,
            label: `${table}`,
            type: 'data',
            dbName,
            schema,
            table,
            closable: true,
        }
        setTabs((prev) => [...prev, newTab])
        setActiveTabKey(tabKey)
    }

    // 打开 ER 关系图 Tab
    const openErTab = (dbName: string, schema: string) => {
        const tabKey = `er_${dbName}_${schema}`
        const existing = tabs.find((tItem) => tItem.key === tabKey)
        if (existing) {
            setActiveTabKey(tabKey)
            return
        }
        const newTab: PostgresTabItem = {
            key: tabKey,
            label: t('postgres.tabEr', { schema }),
            type: 'er',
            dbName,
            schema,
            closable: true,
        }
        setTabs((prev) => [...prev, newTab])
        setActiveTabKey(tabKey)
    }

    // 打开函数管理 Tab
    const openFunctionsTab = (dbName: string, schema: string) => {
        const tabKey = `func_${dbName}_${schema}`
        const existing = tabs.find((tItem) => tItem.key === tabKey)
        if (existing) {
            setActiveTabKey(tabKey)
            return
        }
        const newTab: PostgresTabItem = {
            key: tabKey,
            label: t('postgres.tabFuncs', { schema }),
            type: 'functions',
            dbName,
            schema,
            closable: true,
        }
        setTabs((prev) => [...prev, newTab])
        setActiveTabKey(tabKey)
    }

    // 打开角色权限 Tab
    const openRolesTab = () => {
        const tabKey = `roles`
        const existing = tabs.find((tItem) => tItem.key === tabKey)
        if (existing) {
            setActiveTabKey(tabKey)
            return
        }
        const newTab: PostgresTabItem = {
            key: tabKey,
            label: t('postgres.tabRoles'),
            type: 'roles',
            dbName: currentDb,
            closable: true,
        }
        setTabs((prev) => [...prev, newTab])
        setActiveTabKey(tabKey)
    }

    const tabItems: TabItem[] = useMemo(() => {
        return tabs.map((tItem) => {
            let icon: React.ReactNode = null
            let label = tItem.label

            if (tItem.type === 'status') {
                icon = <Activity size={13} />
                label = t('postgres.tabStatus')
            } else if (tItem.type === 'sql') {
                icon = <Play size={13} />
                if (tItem.label === 'SQL 编辑器' || tItem.label === 'SQL Editor') {
                    label = t('postgres.tabSql')
                }
            } else if (tItem.type === 'data') {
                icon = <Table size={13} />
            } else if (tItem.type === 'roles') {
                icon = <Users size={13} />
                label = t('postgres.tabRoles')
            } else if (tItem.type === 'functions') {
                icon = <Code2 size={13} />
                if (tItem.schema) {
                    label = t('postgres.tabFuncs', { schema: tItem.schema })
                }
            } else if (tItem.type === 'er') {
                icon = <Network size={13} />
                if (tItem.schema) {
                    label = t('postgres.tabEr', { schema: tItem.schema })
                }
            }

            return {
                key: tItem.key,
                label,
                icon,
                closable: tItem.closable,
            }
        })
    }, [tabs, t])

    // 关闭单个 Tab
    const handleCloseTab = (key: string) => {
        const targetTab = tabs.find((tItem) => tItem.key === key)
        if (targetTab && !targetTab.closable) return

        const nextTabs = tabs.filter((tItem) => tItem.key !== key || !tItem.closable)
        setTabs(nextTabs)
        if (activeTabKey === key && nextTabs.length > 0) {
            const closedIdx = tabs.findIndex((tItem) => tItem.key === key)
            const nextActive = nextTabs[Math.min(closedIdx, nextTabs.length - 1)]
            if (nextActive) setActiveTabKey(nextActive.key)
        }
    }

    // 全部关闭
    const handleCloseAllTabs = () => {
        const nextTabs = tabs.filter((tItem) => !tItem.closable)
        setTabs(nextTabs)
        if (nextTabs.length > 0) {
            setActiveTabKey(nextTabs[0].key)
        }
    }

    // 关闭左侧
    const handleCloseLeftTabs = (targetKey: string) => {
        const idx = tabs.findIndex((tItem) => tItem.key === targetKey)
        if (idx <= 0) return
        const nextTabs = tabs.filter((tItem, i) => i >= idx || !tItem.closable)
        setTabs(nextTabs)
        if (!nextTabs.some((tItem) => tItem.key === activeTabKey) && nextTabs.length > 0) {
            setActiveTabKey(targetKey)
        }
    }

    // 关闭右侧
    const handleCloseRightTabs = (targetKey: string) => {
        const idx = tabs.findIndex((tItem) => tItem.key === targetKey)
        if (idx < 0 || idx >= tabs.length - 1) return
        const nextTabs = tabs.filter((tItem, i) => i <= idx || !tItem.closable)
        setTabs(nextTabs)
        if (!nextTabs.some((tItem) => tItem.key === activeTabKey) && nextTabs.length > 0) {
            setActiveTabKey(targetKey)
        }
    }

    // 删除数据库
    const handleDropDb = async (dbName: string) => {
        try {
            await API.postgresDropDatabase(serverId, dbName)
            initConnection()
        } catch (e: any) {
            message.error(t('postgres.roles.dropFail', { error: e.message || e }))
        }
    }

    // 删除 Schema
    const handleDropSchema = async (dbName: string, schema: string) => {
        try {
            await API.postgresDropSchema(serverId, dbName, schema, true)
            loadSchemas(dbName)
        } catch (e: any) {
            message.error(t('postgres.roles.dropFail', { error: e.message || e }))
        }
    }

    // 删除表
    const handleDropTable = async (dbName: string, schema: string, table: string) => {
        try {
            await API.postgresDropTable(serverId, dbName, schema, table, true)
            loadTables(dbName, schema)
        } catch (e: any) {
            message.error(t('postgres.roles.dropFail', { error: e.message || e }))
        }
    }

    // 清空表
    const handleTruncateTable = async (dbName: string, schema: string, table: string) => {
        try {
            await API.postgresTruncateTable(serverId, dbName, schema, table, true, false)
            loadTables(dbName, schema)
        } catch (e: any) {
            message.error(t('postgres.roles.opFail', { error: e.message || e }))
        }
    }

    // 树结构构建
    const treeData = useMemo(() => {
        return databases.map((db) => {
            const dbKey = `db_${db.name}`
            const schemas = schemasMap[db.name] || []

            const schemaChildren = schemas.map((s) => {
                const schemaKey = `schema_${db.name}_${s.name}`
                const tableListKey = `${db.name}:${s.name}`
                const rawTables = tablesMap[tableListKey] || []
                const isLoadingSchema = !!loadingSchemas[tableListKey]

                const tableChildren = rawTables.map((tbl) => {
                    const tableKey = `table_${db.name}_${s.name}_${tbl.name}`
                    return {
                        key: tableKey,
                        title: tbl.name,
                        raw: { type: 'table', db: db.name, schema: s.name, table: tbl },
                        isLeaf: true,
                    }
                })

                return {
                    key: schemaKey,
                    title: isLoadingSchema ? `${s.name}${t('postgres.tree.loadingSuffix')}` : s.name,
                    raw: { type: 'schema', db: db.name, schema: s },
                    isLeaf: false,
                    children: tableChildren,
                }
            })

            const isLoadingDb = !!loadingDbs[db.name]

            return {
                key: dbKey,
                title: isLoadingDb ? `${db.name}${t('postgres.tree.loadingSuffix')}` : db.name,
                raw: { type: 'db', db },
                isLeaf: false,
                children: schemaChildren,
            }
        })
    }, [databases, schemasMap, tablesMap, loadingDbs, loadingSchemas, t])

    // 左侧树与当前激活 Tab 双向联动高亮
    const selectedTreeKeys = useMemo(() => {
        const activeTab = tabs.find((tItem) => tItem.key === activeTabKey)
        if (!activeTab) return []
        if (activeTab.type === 'data' && activeTab.dbName && activeTab.schema && activeTab.table) {
            return [`table_${activeTab.dbName}_${activeTab.schema}_${activeTab.table}`]
        }
        if ((activeTab.type === 'er' || activeTab.type === 'functions') && activeTab.dbName && activeTab.schema) {
            return [`schema_${activeTab.dbName}_${activeTab.schema}`]
        }
        return []
    }, [tabs, activeTabKey])

    // 渲染数据库右键菜单
    const getDbMenuItems = (dbName: string): MenuProps['items'] => [
        {
            key: 'new-schema',
            icon: <Plus size={14} />,
            label: t('postgres.menu.newSchema'),
            onClick: () => {
                setCurrentDb(dbName)
                setCreateSchemaOpen(true)
            },
        },
        {
            key: 'refresh',
            icon: <RotateCw size={14} />,
            label: t('postgres.menu.refreshMeta'),
            onClick: () => loadSchemas(dbName),
        },
        { type: 'divider' },
        {
            key: 'drop-db',
            icon: <Trash2 size={14} />,
            danger: true,
            label: t('postgres.menu.dropDb'),
            onClick: () => handleDropDb(dbName),
        },
    ]

    // 渲染 Schema 右键菜单
    const getSchemaMenuItems = (dbName: string, schema: string): MenuProps['items'] => [
        {
            key: 'new-table',
            icon: <Plus size={14} />,
            label: t('postgres.menu.newTable'),
            onClick: () => {
                setCurrentDb(dbName)
                setCurrentSchema(schema)
                setCreateTableOpen(true)
            },
        },
        {
            key: 'er-diagram',
            icon: <Network size={14} />,
            label: t('postgres.menu.erDiagram'),
            onClick: () => openErTab(dbName, schema),
        },
        {
            key: 'functions',
            icon: <Code2 size={14} />,
            label: t('postgres.menu.funcs'),
            onClick: () => openFunctionsTab(dbName, schema),
        },
        {
            key: 'refresh',
            icon: <RotateCw size={14} />,
            label: t('postgres.menu.refreshTables'),
            onClick: () => loadTables(dbName, schema),
        },
        { type: 'divider' },
        {
            key: 'drop-schema',
            icon: <Trash2 size={14} />,
            danger: true,
            label: t('postgres.menu.dropSchema'),
            onClick: () => handleDropSchema(dbName, schema),
        },
    ]

    // 渲染表右键菜单
    const getTableMenuItems = (dbName: string, schema: string, tableName: string): MenuProps['items'] => [
        {
            key: 'open-data',
            icon: <Table size={14} />,
            label: t('postgres.menu.openData'),
            onClick: () => openTableTab(dbName, schema, tableName),
        },
        {
            key: 'export',
            icon: <Download size={14} />,
            label: t('postgres.menu.exportData'),
            onClick: () => setExportModal({ open: true, table: tableName }),
        },
        {
            key: 'import',
            icon: <Upload size={14} />,
            label: t('postgres.menu.importData'),
            onClick: () => setImportModal({ open: true, table: tableName }),
        },
        { type: 'divider' },
        {
            key: 'truncate',
            icon: <Eraser size={14} />,
            danger: true,
            label: t('postgres.menu.truncateTable'),
            onClick: () => handleTruncateTable(dbName, schema, tableName),
        },
        {
            key: 'drop-table',
            icon: <Trash2 size={14} />,
            danger: true,
            label: t('postgres.menu.dropTable'),
            onClick: () => handleDropTable(dbName, schema, tableName),
        },
    ]

    // 空白区域右键菜单
    const blankMenuItems: MenuProps['items'] = [
        {
            key: 'new-db',
            icon: <Plus size={14} />,
            label: t('postgres.menu.newDb'),
            onClick: () => setCreateDbOpen(true),
        },
        {
            key: 'roles',
            icon: <Users size={14} />,
            label: t('postgres.menu.rolesAndPrivs'),
            onClick: openRolesTab,
        },
        {
            key: 'refresh-all',
            icon: <RotateCw size={14} />,
            label: t('postgres.menu.refreshAll'),
            onClick: initConnection,
        },
    ]

    return (
        <div className={pg.client}>
            {/* 左侧 3 层导航树 */}
            <aside className={pg.sideTree}>
                <div className={pg.sideHead}>
                    <span className={pg.sideTitle}>
                        <ClientIcon kind="postgres" size={18} />
                        PostgreSQL
                    </span>
                    <Space size={4}>
                        <Tooltip title={t('postgres.menu.newDb')}>
                            <Button
                                size="small"
                                type="text"
                                icon={<Plus size={15} />}
                                onClick={() => setCreateDbOpen(true)}
                            />
                        </Tooltip>
                        <Tooltip title={t('postgres.menu.rolesAndPrivs')}>
                            <Button
                                size="small"
                                type="text"
                                icon={<Users size={15} />}
                                onClick={openRolesTab}
                            />
                        </Tooltip>
                        <Tooltip title={t('postgres.menu.refreshAll')}>
                            <Button
                                size="small"
                                type="text"
                                icon={<RotateCw size={14} />}
                                loading={loadingTree}
                                onClick={initConnection}
                            />
                        </Tooltip>
                    </Space>
                </div>

                <Dropdown menu={{ items: blankMenuItems }} trigger={['contextMenu']}>
                    <div className={pg.treeWrap}>
                        <Tree
                            treeData={treeData}
                            expandedKeys={expandedKeys}
                            selectedKeys={selectedTreeKeys}
                            loadData={async (node: any) => {
                                const raw = node.raw
                                if (!raw) return
                                if (raw.type === 'db') {
                                    if (!schemasMap[raw.db.name]) {
                                        await loadSchemas(raw.db.name)
                                    }
                                } else if (raw.type === 'schema') {
                                    if (!tablesMap[`${raw.db}:${raw.schema.name}`]) {
                                        await loadTables(raw.db, raw.schema.name)
                                    }
                                }
                            }}
                            onExpand={async (keys, info: any) => {
                                setExpandedKeys(keys as string[])
                                if (info.expanded && info.node?.raw) {
                                    const raw = info.node.raw
                                    if (raw.type === 'db') {
                                        if (!schemasMap[raw.db.name]) {
                                            await loadSchemas(raw.db.name)
                                        }
                                    } else if (raw.type === 'schema') {
                                        if (!tablesMap[`${raw.db}:${raw.schema.name}`]) {
                                            await loadTables(raw.db, raw.schema.name)
                                        }
                                    }
                                }
                            }}
                            onSelect={async (_, info: any) => {
                                const raw = info.node?.raw
                                if (!raw) return
                                const nodeKey = String(info.node.key)
                                if (raw.type === 'db') {
                                    setCurrentDb(raw.db.name)
                                    const willExpand = !expandedKeys.includes(nodeKey)
                                    if (willExpand && !schemasMap[raw.db.name]) {
                                        await loadSchemas(raw.db.name)
                                    }
                                    setExpandedKeys((prev) =>
                                        prev.includes(nodeKey) ? prev.filter((k) => k !== nodeKey) : [...prev, nodeKey]
                                    )
                                } else if (raw.type === 'schema') {
                                    setCurrentDb(raw.db)
                                    setCurrentSchema(raw.schema.name)
                                    const willExpand = !expandedKeys.includes(nodeKey)
                                    if (willExpand && !tablesMap[`${raw.db}:${raw.schema.name}`]) {
                                        await loadTables(raw.db, raw.schema.name)
                                    }
                                    setExpandedKeys((prev) =>
                                        prev.includes(nodeKey) ? prev.filter((k) => k !== nodeKey) : [...prev, nodeKey]
                                    )
                                } else if (raw.type === 'table') {
                                    openTableTab(raw.db, raw.schema, raw.table.name)
                                }
                            }}
                            titleRender={(nodeData: any) => {
                                const raw = nodeData.raw
                                if (!raw) return <span>{nodeData.title}</span>

                                if (raw.type === 'db') {
                                    return (
                                        <div onContextMenu={(e) => e.stopPropagation()}>
                                            <Dropdown menu={{ items: getDbMenuItems(raw.db.name) }} trigger={['contextMenu']}>
                                                <div className={pg.nodeTitleWrap}>
                                                    <div className={pg.nodeMain}>
                                                        <Database size={14} style={{ color: '#336791', flexShrink: 0 }} />
                                                        <strong className={pg.nodeText}>{raw.db.name}</strong>
                                                    </div>
                                                </div>
                                            </Dropdown>
                                        </div>
                                    )
                                }

                                if (raw.type === 'schema') {
                                    return (
                                        <div onContextMenu={(e) => e.stopPropagation()}>
                                            <Dropdown menu={{ items: getSchemaMenuItems(raw.db, raw.schema.name) }} trigger={['contextMenu']}>
                                                <div className={pg.nodeTitleWrap}>
                                                    <div className={pg.nodeMain}>
                                                        <Folder size={14} style={{ color: '#faad14', flexShrink: 0 }} />
                                                        <span className={pg.nodeText}>{raw.schema.name}</span>
                                                    </div>
                                                </div>
                                            </Dropdown>
                                        </div>
                                    )
                                }

                                if (raw.type === 'table') {
                                    return (
                                        <div onContextMenu={(e) => e.stopPropagation()} style={{ width: '100%', minWidth: 0, overflow: 'hidden' }}>
                                            <Dropdown menu={{ items: getTableMenuItems(raw.db, raw.schema, raw.table.name) }} trigger={['contextMenu']}>
                                                <div className={pg.nodeTitleWrap} title={raw.table.name}>
                                                    <div className={pg.nodeMain}>
                                                        <Table size={13} style={{ color: '#52c41a', flexShrink: 0 }} />
                                                        <span className={pg.nodeText}>{raw.table.name}</span>
                                                    </div>
                                                </div>
                                            </Dropdown>
                                        </div>
                                    )
                                }

                                return <div onContextMenu={(e) => e.stopPropagation()} style={{ width: '100%', minWidth: 0, overflow: 'hidden' }}>{nodeData.title}</div>
                            }}
                        />
                    </div>
                </Dropdown>
            </aside>

            {/* 右侧主工作区 */}
            <main className={pg.mainArea}>
                {/* 标签栏 */}
                <TabBar
                    items={tabItems}
                    activeKey={activeTabKey}
                    onChange={setActiveTabKey}
                    onClose={handleCloseTab}
                    onCloseAll={handleCloseAllTabs}
                    onCloseLeft={handleCloseLeftTabs}
                    onCloseRight={handleCloseRightTabs}
                    size="middle"
                    className={pg.tabBar}
                />

                {/* 标签内容展示区 */}
                <div className={pg.tabContent}>
                    {tabs.map((tItem) => {
                        const isVisible = tItem.key === activeTabKey
                        return (
                            <div
                                key={tItem.key}
                                style={{
                                    display: isVisible ? 'flex' : 'none',
                                    flexDirection: 'column',
                                    height: '100%',
                                    width: '100%',
                                }}
                            >
                                {tItem.type === 'status' && <StatusPanel sessionId={session.id} serverId={serverId} dbName={currentDb} />}
                                {tItem.type === 'sql' && (
                                    <DbSqlEditor
                                        key={tItem.key}
                                        adapter={createPostgresSqlAdapter(serverId, currentDb, currentSchema)}
                                        initialSql={tItem.sqlText}
                                    />
                                )}
                                {tItem.type === 'data' && tItem.schema && tItem.table && (
                                    <DbDataTab
                                        key={tItem.key}
                                        adapter={createPostgresAdapter(serverId, tItem.dbName, tItem.schema, tItem.table)}
                                        onClose={() => handleCloseTab(tItem.key)}
                                    />
                                )}
                                {tItem.type === 'roles' && <RolesPanel serverId={serverId} dbName={currentDb} />}
                                {tItem.type === 'functions' && tItem.schema && (
                                    <FunctionsPanel serverId={serverId} dbName={tItem.dbName} schema={tItem.schema} />
                                )}
                                {tItem.type === 'er' && tItem.schema && (
                                    <ErDiagram serverId={serverId} dbName={tItem.dbName} schema={tItem.schema} />
                                )}
                            </div>
                        )
                    })}
                </div>

                {/* 底部状态栏 */}
                <footer className={pg.statusBar}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Tag color="success" style={{ fontSize: 10, lineHeight: '16px', height: 16, marginInlineEnd: 0 }}>
                            {t('postgres.statusBar.connected')}
                        </Tag>
                        <span>{session.host}:{session.port || 5432}</span>
                        <span>{t('postgres.statusBar.db')} <strong>{currentDb}</strong></span>
                        <span>{t('postgres.statusBar.currentSchema')} <strong>{currentSchema}</strong></span>
                    </div>

                    <div>PostgreSQL Client v1.0</div>
                </footer>
            </main>

            {/* 弹窗组件 */}
            <CreateDbModal
                open={createDbOpen}
                serverId={serverId}
                onClose={() => setCreateDbOpen(false)}
                onSuccess={initConnection}
            />

            <CreateSchemaModal
                open={createSchemaOpen}
                serverId={serverId}
                dbName={currentDb}
                onClose={() => setCreateSchemaOpen(false)}
                onSuccess={() => loadSchemas(currentDb)}
            />

            <CreateTableModal
                open={createTableOpen}
                serverId={serverId}
                dbName={currentDb}
                schema={currentSchema}
                onClose={() => setCreateTableOpen(false)}
                onSuccess={() => loadTables(currentDb, currentSchema)}
            />

            {exportModal && (
                <ExportModal
                    open={exportModal.open}
                    serverId={serverId}
                    dbName={currentDb}
                    schema={currentSchema}
                    tableName={exportModal.table}
                    onClose={() => setExportModal(null)}
                />
            )}

            {importModal && (
                <ImportModal
                    open={importModal.open}
                    serverId={serverId}
                    dbName={currentDb}
                    schema={currentSchema}
                    tableName={importModal.table}
                    onClose={() => setImportModal(null)}
                    onSuccess={() => loadTables(currentDb, currentSchema)}
                />
            )}
        </div>
    )
}
