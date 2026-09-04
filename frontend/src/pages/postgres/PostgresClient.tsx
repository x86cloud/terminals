import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { Tree, Button, Tag, Dropdown, MenuProps, message, Tooltip, Space, Popconfirm } from 'antd'
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
    Edit2,
    Download,
    Upload,
    Copy,
    FileCode,
    X,
    Eraser,
} from 'lucide-react'
import { API } from '@/api'
import ClientIcon from '@/components/ClientIcon'
import { PostgresSessionInfo } from '@/types'
import { PgDatabase, PgSchema, PgTable, PgFunction, PostgresTabItem } from './postgresTypes'
import TabBar, { TabItem } from '@/components/common/TabBar'
import DataTab from './DataTab'
import SqlEditor from './SqlEditor'
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

export default function PostgresClient({ session, onClose, onChange }: Props) {
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
            label: '监控仪表盘',
            type: 'status',
            dbName: currentDb,
            closable: false,
        },
        {
            key: 'sql_1',
            label: 'SQL 编辑器',
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
            message.error(`连接 PostgreSQL 失败: ${e.message || e}`)
        } finally {
            setLoadingTree(false)
        }
    }, [serverId, session.database])

    useEffect(() => {
        initConnection()
    }, [initConnection])

    // 加载指定数据库下的 Schemas
    const loadSchemas = async (dbName: string) => {
        setLoadingDbs((prev) => ({ ...prev, [dbName]: true }))
        try {
            const list = await API.postgresSchemas(serverId, dbName)
            setSchemasMap((prev) => ({ ...prev, [dbName]: list || [] }))
            // 自动预加载默认 public schema 下的表
            await loadTables(dbName, 'public')
        } catch (e: any) {
            console.error('加载 Schemas 失败:', e)
        } finally {
            setLoadingDbs((prev) => ({ ...prev, [dbName]: false }))
        }
    }

    // 加载指定 Schema 下的表
    const loadTables = async (dbName: string, schemaName: string) => {
        const key = `${dbName}:${schemaName}`
        setLoadingSchemas((prev) => ({ ...prev, [key]: true }))
        try {
            const list = await API.postgresTables(serverId, dbName, schemaName)
            setTablesMap((prev) => ({ ...prev, [key]: list || [] }))
        } catch (e: any) {
            console.error('加载 Tables 失败:', e)
        } finally {
            setLoadingSchemas((prev) => ({ ...prev, [key]: false }))
        }
    }

    // 打开数据表 Tab
    const openTableTab = (dbName: string, schema: string, table: string) => {
        const tabKey = `tbl_${dbName}_${schema}_${table}`
        const existing = tabs.find((t) => t.key === tabKey)
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
        const existing = tabs.find((t) => t.key === tabKey)
        if (existing) {
            setActiveTabKey(tabKey)
            return
        }
        const newTab: PostgresTabItem = {
            key: tabKey,
            label: `ER 图 (${schema})`,
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
        const existing = tabs.find((t) => t.key === tabKey)
        if (existing) {
            setActiveTabKey(tabKey)
            return
        }
        const newTab: PostgresTabItem = {
            key: tabKey,
            label: `函数 (${schema})`,
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
        const existing = tabs.find((t) => t.key === tabKey)
        if (existing) {
            setActiveTabKey(tabKey)
            return
        }
        const newTab: PostgresTabItem = {
            key: tabKey,
            label: `角色与权限`,
            type: 'roles',
            dbName: currentDb,
            closable: true,
        }
        setTabs((prev) => [...prev, newTab])
        setActiveTabKey(tabKey)
    }

    const tabItems: TabItem[] = useMemo(() => {
        return tabs.map((t) => {
            let icon: React.ReactNode = null
            if (t.type === 'status') icon = <Activity size={13} />
            else if (t.type === 'sql') icon = <Play size={13} />
            else if (t.type === 'data') icon = <Table size={13} />
            else if (t.type === 'roles') icon = <Users size={13} />
            else if (t.type === 'functions') icon = <Code2 size={13} />
            else if (t.type === 'er') icon = <Network size={13} />

            return {
                key: t.key,
                label: t.label,
                icon,
                closable: t.closable,
            }
        })
    }, [tabs])

    // 关闭单个 Tab
    const handleCloseTab = (key: string) => {
        const targetTab = tabs.find((t) => t.key === key)
        if (targetTab && !targetTab.closable) return

        const nextTabs = tabs.filter((t) => t.key !== key || !t.closable)
        setTabs(nextTabs)
        if (activeTabKey === key && nextTabs.length > 0) {
            const closedIdx = tabs.findIndex((t) => t.key === key)
            const nextActive = nextTabs[Math.min(closedIdx, nextTabs.length - 1)]
            if (nextActive) setActiveTabKey(nextActive.key)
        }
    }

    // 全部关闭
    const handleCloseAllTabs = () => {
        const nextTabs = tabs.filter((t) => !t.closable)
        setTabs(nextTabs)
        if (nextTabs.length > 0) {
            setActiveTabKey(nextTabs[0].key)
        }
    }

    // 关闭左侧
    const handleCloseLeftTabs = (targetKey: string) => {
        const idx = tabs.findIndex((t) => t.key === targetKey)
        if (idx <= 0) return
        const nextTabs = tabs.filter((t, i) => i >= idx || !t.closable)
        setTabs(nextTabs)
        if (!nextTabs.some((t) => t.key === activeTabKey) && nextTabs.length > 0) {
            setActiveTabKey(targetKey)
        }
    }

    // 关闭右侧
    const handleCloseRightTabs = (targetKey: string) => {
        const idx = tabs.findIndex((t) => t.key === targetKey)
        if (idx < 0 || idx >= tabs.length - 1) return
        const nextTabs = tabs.filter((t, i) => i <= idx || !t.closable)
        setTabs(nextTabs)
        if (!nextTabs.some((t) => t.key === activeTabKey) && nextTabs.length > 0) {
            setActiveTabKey(targetKey)
        }
    }

    // 删除数据库
    const handleDropDb = async (dbName: string) => {
        try {
            await API.postgresDropDatabase(serverId, dbName)
            initConnection()
        } catch (e: any) {
            message.error(`删除失败: ${e.message || e}`)
        }
    }

    // 删除 Schema
    const handleDropSchema = async (dbName: string, schema: string) => {
        try {
            await API.postgresDropSchema(serverId, dbName, schema, true)
            loadSchemas(dbName)
        } catch (e: any) {
            message.error(`删除失败: ${e.message || e}`)
        }
    }

    // 删除表
    const handleDropTable = async (dbName: string, schema: string, table: string) => {
        try {
            await API.postgresDropTable(serverId, dbName, schema, table, true)
            loadTables(dbName, schema)
        } catch (e: any) {
            message.error(`删除失败: ${e.message || e}`)
        }
    }

    // 清空表
    const handleTruncateTable = async (dbName: string, schema: string, table: string) => {
        try {
            await API.postgresTruncateTable(serverId, dbName, schema, table, true, false)
            loadTables(dbName, schema)
        } catch (e: any) {
            message.error(`清空失败: ${e.message || e}`)
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

                const tableChildren = rawTables.map((t) => {
                    const tableKey = `table_${db.name}_${s.name}_${t.name}`
                    return {
                        key: tableKey,
                        title: t.name,
                        raw: { type: 'table', db: db.name, schema: s.name, table: t },
                        isLeaf: true,
                    }
                })

                return {
                    key: schemaKey,
                    title: isLoadingSchema ? `${s.name} (加载中...)` : s.name,
                    raw: { type: 'schema', db: db.name, schema: s },
                    isLeaf: false,
                    children: tableChildren,
                }
            })

            const isLoadingDb = !!loadingDbs[db.name]

            return {
                key: dbKey,
                title: isLoadingDb ? `${db.name} (加载中...)` : db.name,
                raw: { type: 'db', db },
                isLeaf: false,
                children: schemaChildren,
            }
        })
    }, [databases, schemasMap, tablesMap, loadingDbs, loadingSchemas])

    // 渲染数据库右键菜单
    const getDbMenuItems = (dbName: string): MenuProps['items'] => [
        {
            key: 'new-schema',
            icon: <Plus size={14} />,
            label: '新建 Schema',
            onClick: () => {
                setCurrentDb(dbName)
                setCreateSchemaOpen(true)
            },
        },
        {
            key: 'refresh',
            icon: <RotateCw size={14} />,
            label: '刷新元数据',
            onClick: () => loadSchemas(dbName),
        },
        { type: 'divider' },
        {
            key: 'drop-db',
            icon: <Trash2 size={14} />,
            danger: true,
            label: '删除数据库 (DROP)',
            onClick: () => handleDropDb(dbName),
        },
    ]

    // 渲染 Schema 右键菜单
    const getSchemaMenuItems = (dbName: string, schema: string): MenuProps['items'] => [
        {
            key: 'new-table',
            icon: <Plus size={14} />,
            label: '新建数据表',
            onClick: () => {
                setCurrentDb(dbName)
                setCurrentSchema(schema)
                setCreateTableOpen(true)
            },
        },
        {
            key: 'er-diagram',
            icon: <Network size={14} />,
            label: 'ER 关系图',
            onClick: () => openErTab(dbName, schema),
        },
        {
            key: 'functions',
            icon: <Code2 size={14} />,
            label: '函数与存储过程',
            onClick: () => openFunctionsTab(dbName, schema),
        },
        {
            key: 'refresh',
            icon: <RotateCw size={14} />,
            label: '刷新表列表',
            onClick: () => loadTables(dbName, schema),
        },
        { type: 'divider' },
        {
            key: 'drop-schema',
            icon: <Trash2 size={14} />,
            danger: true,
            label: '删除 Schema',
            onClick: () => handleDropSchema(dbName, schema),
        },
    ]

    // 渲染表右键菜单
    const getTableMenuItems = (dbName: string, schema: string, tableName: string): MenuProps['items'] => [
        {
            key: 'open-data',
            icon: <Table size={14} />,
            label: '查看 / 编辑数据',
            onClick: () => openTableTab(dbName, schema, tableName),
        },
        {
            key: 'export',
            icon: <Download size={14} />,
            label: '导出数据 (CSV/JSON)',
            onClick: () => setExportModal({ open: true, table: tableName }),
        },
        {
            key: 'import',
            icon: <Upload size={14} />,
            label: '导入数据 (CSV/SQL)',
            onClick: () => setImportModal({ open: true, table: tableName }),
        },
        { type: 'divider' },
        {
            key: 'truncate',
            icon: <Eraser size={14} />,
            danger: true,
            label: '清空表 (TRUNCATE)',
            onClick: () => handleTruncateTable(dbName, schema, tableName),
        },
        {
            key: 'drop-table',
            icon: <Trash2 size={14} />,
            danger: true,
            label: '删除表 (DROP)',
            onClick: () => handleDropTable(dbName, schema, tableName),
        },
    ]

    // 空白区域右键菜单
    const blankMenuItems: MenuProps['items'] = [
        {
            key: 'new-db',
            icon: <Plus size={14} />,
            label: '新建数据库',
            onClick: () => setCreateDbOpen(true),
        },
        {
            key: 'roles',
            icon: <Users size={14} />,
            label: '角色与权限管理',
            onClick: openRolesTab,
        },
        {
            key: 'refresh-all',
            icon: <RotateCw size={14} />,
            label: '刷新全部',
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
                        <Tooltip title="新建数据库">
                            <Button
                                size="small"
                                type="text"
                                icon={<Plus size={15} />}
                                onClick={() => setCreateDbOpen(true)}
                            />
                        </Tooltip>
                        <Tooltip title="角色与权限">
                            <Button
                                size="small"
                                type="text"
                                icon={<Users size={15} />}
                                onClick={openRolesTab}
                            />
                        </Tooltip>
                        <Tooltip title="刷新全部">
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
                            blockNode
                            showIcon={false}
                            treeData={treeData}
                            expandedKeys={expandedKeys}
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
                    {tabs.map((t) => {
                        const isVisible = t.key === activeTabKey
                        return (
                            <div
                                key={t.key}
                                style={{
                                    display: isVisible ? 'flex' : 'none',
                                    flexDirection: 'column',
                                    height: '100%',
                                    width: '100%',
                                }}
                            >
                                {t.type === 'status' && <StatusPanel serverId={serverId} dbName={currentDb} />}
                                {t.type === 'sql' && <SqlEditor serverId={serverId} dbName={currentDb} initialSql={t.sqlText} />}
                                {t.type === 'data' && t.schema && t.table && (
                                    <DataTab
                                        serverId={serverId}
                                        dbName={t.dbName}
                                        schema={t.schema}
                                        tableName={t.table}
                                        onClose={() => handleCloseTab(t.key)}
                                    />
                                )}
                                {t.type === 'roles' && <RolesPanel serverId={serverId} dbName={currentDb} />}
                                {t.type === 'functions' && t.schema && (
                                    <FunctionsPanel serverId={serverId} dbName={t.dbName} schema={t.schema} />
                                )}
                                {t.type === 'er' && t.schema && (
                                    <ErDiagram serverId={serverId} dbName={t.dbName} schema={t.schema} />
                                )}
                            </div>
                        )
                    })}
                </div>

                {/* 底部状态栏 */}
                <footer className={pg.statusBar}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Tag color="success" style={{ fontSize: 10, lineHeight: '16px', height: 16, marginInlineEnd: 0 }}>
                            已连接
                        </Tag>
                        <span>{session.host}:{session.port || 5432}</span>
                        <span>数据库: <strong>{currentDb}</strong></span>
                        <span>当前 Schema: <strong>{currentSchema}</strong></span>
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
