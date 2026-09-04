import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { Tree, Button, Dropdown, MenuProps, message, Tooltip, Space, Tag } from 'antd'
import {
    Database,
    Folder,
    Table as TableIcon,
    Plus,
    RotateCw,
    Play,
    Activity,
    Users,
    Network,
    Trash2,
    Download,
    Upload,
    Copy,
    X,
    Eraser,
    Layers,
    Eye,
} from 'lucide-react'
import { API } from '@/api'
import ClientIcon from '@/components/ClientIcon'
import { MysqlSessionInfo } from '@/types'
import { MysqlTabItem, Schema } from './mysqlTypes'
import TabBar, { TabItem } from '@/components/common/TabBar'
import DataTab from './DataTab'
import SqlEditor from './SqlEditor'
import StatusPanel from './StatusPanel'
import UsersPanel from './UsersPanel'
import ErDiagram from './ErDiagram'
import ObjModal, { ObjModalKind } from './ObjModal'
import IoModal, { ExportOptions, ImportOptions } from './IoModal'
import { ConfirmModal, ConfirmState } from '@/components/Modal'
import my from './MysqlClient.module.less'

interface Props {
    session: MysqlSessionInfo
    onClose: () => void
    onChange?: (id: string, database: string) => void
}

interface TableStatusItem {
    name: string
    rows: number
    dataSize: string
    isView: boolean
}

export default function MysqlClient({ session, onClose, onChange }: Props) {
    const serverId = session.serverId || session.id
    const [currentDb, setCurrentDb] = useState<string>(session.database || '')

    // 树与元数据状态
    const [databases, setDatabases] = useState<string[]>([])
    const [tablesMap, setTablesMap] = useState<Record<string, TableStatusItem[]>>({})
    const [expandedKeys, setExpandedKeys] = useState<string[]>([])
    const [loadingTree, setLoadingTree] = useState(false)
    const [loadingDbs, setLoadingDbs] = useState<Record<string, boolean>>({})

    // 工作区标签栏管理
    const [tabs, setTabs] = useState<MysqlTabItem[]>([
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

    // 状态监控数据
    const [status, setStatus] = useState<Record<string, any>>({})
    const [variables, setVariables] = useState<Record<string, any>>({})
    const [processList, setProcessList] = useState<Record<string, any>[]>([])
    const [slowLog, setSlowLog] = useState<Record<string, any>[]>([])
    const [statusBusy, setStatusBusy] = useState(false)

    // 用户权限
    const [users, setUsers] = useState<Record<string, any>[]>([])
    const [selUser, setSelUser] = useState<{ user: string; host: string } | null>(null)
    const [grants, setGrants] = useState('')

    // 弹窗状态
    const [objModal, setObjModal] = useState<ObjModalKind | null>(null)
    const [objName, setObjName] = useState('')
    const [objExtra, setObjExtra] = useState('')
    const [objUnique, setObjUnique] = useState(false)
    const [objBusy, setObjBusy] = useState(false)
    const [objMsg, setObjMsg] = useState('')
    const [createTableOpen, setCreateTableOpen] = useState(false)

    const [ioModal, setIoModal] = useState<null | 'export' | 'import'>(null)
    const [ioTable, setIoTable] = useState('')
    const [ioBusy, setIoBusy] = useState(false)
    const [ioMsg, setIoMsg] = useState('')

    const emptyConfirm: ConfirmState = { open: false, title: '', message: '' }
    const [confirm, setConfirm] = useState<ConfirmState>(emptyConfirm)

    // ER 图缓存
    const [schemaMap, setSchemaMap] = useState<Record<string, Schema>>({})

    // 连接初始化
    const initConnection = useCallback(async () => {
        setLoadingTree(true)
        try {
            await API.mysqlConnect(serverId)
            const dbs = await API.mysqlDatabases(serverId)
            setDatabases(dbs || [])
            if (dbs && dbs.length > 0) {
                const targetDb = session.database && dbs.includes(session.database) ? session.database : dbs[0]
                setCurrentDb(targetDb)
                await loadTables(targetDb)
                setExpandedKeys([`db_${targetDb}`, `tbls_${targetDb}`])
            }
        } catch (e: any) {
            message.error(`连接 MySQL 失败: ${e.message || e}`)
        } finally {
            setLoadingTree(false)
        }
    }, [serverId, session.database])

    useEffect(() => {
        initConnection()
    }, [initConnection])

    // 加载指定数据库下的表与视图
    const loadTables = async (dbName: string) => {
        setLoadingDbs((prev) => ({ ...prev, [dbName]: true }))
        try {
            const [tblNames, statusList] = await Promise.all([
                API.mysqlTables(serverId, dbName).catch(() => []),
                API.mysqlTableStatus(serverId, dbName).catch(() => []),
            ])

            const statusMap: Record<string, any> = {}
            if (Array.isArray(statusList)) {
                statusList.forEach((s: any) => {
                    const name = s.Name || s.TABLE_NAME || ''
                    if (name) statusMap[name] = s
                })
            }

            const items: TableStatusItem[] = (tblNames || []).map((name) => {
                const s = statusMap[name] || {}
                const rows = Number(s.Rows ?? s.TABLE_ROWS ?? 0)
                const isView = s.Comment === 'VIEW' || s.Engine === null
                return {
                    name,
                    rows,
                    dataSize: '',
                    isView,
                }
            })

            setTablesMap((prev) => ({ ...prev, [dbName]: items }))
        } catch (e: any) {
            console.error('加载 MySQL 数据表失败:', e)
        } finally {
            setLoadingDbs((prev) => ({ ...prev, [dbName]: false }))
        }
    }

    // 打开数据表 Tab
    const openTableTab = (dbName: string, table: string) => {
        const tabKey = `tbl_${dbName}_${table}`
        const existing = tabs.find((t) => t.key === tabKey)
        if (existing) {
            setActiveTabKey(tabKey)
            return
        }

        const newTab: MysqlTabItem = {
            key: tabKey,
            label: `${table}`,
            type: 'data',
            dbName,
            table,
            closable: true,
        }
        setTabs((prev) => [...prev, newTab])
        setActiveTabKey(tabKey)
    }

    // 打开 ER 关系图 Tab
    const openErTab = async (dbName: string) => {
        const tabKey = `er_${dbName}`
        const existing = tabs.find((t) => t.key === tabKey)
        if (existing) {
            setActiveTabKey(tabKey)
            return
        }

        // 异步预加载 ER 图数据
        if (!schemaMap[dbName]) {
            try {
                const s: any = await API.mysqlSchema(serverId, dbName)
                if (s) {
                    setSchemaMap((prev) => ({ ...prev, [dbName]: s }))
                }
            } catch (e) {
                console.warn('获取 ER 结构失败:', e)
            }
        }

        const newTab: MysqlTabItem = {
            key: tabKey,
            label: `ER 图 (${dbName})`,
            type: 'er',
            dbName,
            closable: true,
        }
        setTabs((prev) => [...prev, newTab])
        setActiveTabKey(tabKey)
    }

    // 打开用户权限 Tab
    const openUsersTab = () => {
        const tabKey = 'users'
        const existing = tabs.find((t) => t.key === tabKey)
        if (existing) {
            setActiveTabKey(tabKey)
            return
        }
        const newTab: MysqlTabItem = {
            key: tabKey,
            label: '用户与权限',
            type: 'users',
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
            else if (t.type === 'data') icon = <TableIcon size={13} />
            else if (t.type === 'users') icon = <Users size={13} />
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
        setConfirm({
            open: true,
            title: '删除数据库',
            danger: true,
            message: `确认删除数据库「${dbName}」？库中所有表和数据将被永久清除。`,
            onConfirm: async () => {
                setConfirm(emptyConfirm)
                try {
                    await API.mysqlDropDatabase(serverId, dbName)
                    initConnection()
                } catch (e: any) {
                    message.error(`删除数据库失败: ${e.message || e}`)
                }
            },
        })
    }

    // 删除表
    const handleDropTable = async (dbName: string, table: string) => {
        setConfirm({
            open: true,
            title: '删除数据表',
            danger: true,
            message: `确认删除表「${table}」？表中数据将无法找回。`,
            onConfirm: async () => {
                setConfirm(emptyConfirm)
                try {
                    await API.mysqlDropTable(serverId, dbName, table)
                    loadTables(dbName)
                    // 如果该表的 Tab 正打开，自动关闭
                    handleCloseTab(`tbl_${dbName}_${table}`)
                } catch (e: any) {
                    message.error(`删除表失败: ${e.message || e}`)
                }
            },
        })
    }

    // 清空表
    const handleTruncateTable = async (dbName: string, table: string) => {
        setConfirm({
            open: true,
            title: '清空表数据',
            danger: true,
            message: `确认清空表「${table}」的所有数据 (TRUNCATE)？`,
            onConfirm: async () => {
                setConfirm(emptyConfirm)
                try {
                    await API.mysqlTruncateTable(serverId, dbName, table)
                    loadTables(dbName)
                } catch (e: any) {
                    message.error(`清空表失败: ${e.message || e}`)
                }
            },
        })
    }

    // 备份数据库
    const handleBackupDb = async (dbName: string) => {
        try {
            message.loading({ content: `正在导出并备份数据库 ${dbName}...`, key: 'backup' })
            const path = await API.mysqlBackupToFile(serverId, dbName)
            if (path) {
                message.success({ content: `已成功保存备份文件至: ${path}`, key: 'backup', duration: 5 })
            } else {
                message.info({ content: '已取消备份', key: 'backup' })
            }
        } catch (e: any) {
            message.error({ content: `备份失败: ${e.message || e}`, key: 'backup' })
        }
    }

    // 弹窗确认操作 (创建库/表等)
    const doObjAction = async () => {
        if (!objModal) return
        setObjBusy(true)
        setObjMsg('')
        try {
            switch (objModal) {
                case 'createdb':
                    await API.mysqlCreateDatabase(serverId, objName, 'utf8mb4')
                    await initConnection()
                    break
                case 'createtable':
                    await API.mysqlCreateTable(serverId, currentDb, objName, objExtra)
                    await loadTables(currentDb)
                    openTableTab(currentDb, objName)
                    break
            }
            setObjModal(null)
        } catch (e: any) {
            setObjMsg(e.message || String(e))
        } finally {
            setObjBusy(false)
        }
    }

    // 导入 / 导出
    const doExport = async (o: ExportOptions) => {
        setIoBusy(true)
        setIoMsg('')
        try {
            const path = await API.mysqlExportToFile(serverId, currentDb, o.mode, o.source, o.table, o.sqlText, o.limit)
            if (path) {
                message.success(`数据已成功导出到：${path}`)
                setIoModal(null)
            }
        } catch (e: any) {
            setIoMsg(e.message || String(e))
        } finally {
            setIoBusy(false)
        }
    }

    const doImport = async (o: ImportOptions) => {
        setIoBusy(true)
        setIoMsg('')
        try {
            const res = await API.mysqlImportFromFile(serverId, currentDb, o.mode, o.table)
            message.success(res || '导入完成')
            setIoModal(null)
            if (currentDb) loadTables(currentDb)
        } catch (e: any) {
            setIoMsg(e.message || String(e))
        } finally {
            setIoBusy(false)
        }
    }

    // 监控面板刷新
    const loadStatus = useCallback(async () => {
        setStatusBusy(true)
        try {
            const [st, va, pl, sl] = await Promise.all([
                API.mysqlStatus(serverId).catch(() => ({})),
                API.mysqlVariables(serverId).catch(() => ({})),
                API.mysqlProcessList(serverId).catch(() => []),
                API.mysqlSlowLog(serverId, 50).catch(() => []),
            ])
            setStatus(st || {})
            setVariables(va || {})
            setProcessList(pl || [])
            setSlowLog(sl || [])
        } catch (e: any) {
            message.error(`获取监控状态失败: ${e.message || e}`)
        } finally {
            setStatusBusy(false)
        }
    }, [serverId])

    // 用户列表刷新
    const loadUsers = useCallback(async () => {
        try {
            const list = await API.mysqlUsers(serverId)
            setUsers(list || [])
        } catch (e: any) {
            console.error('加载 MySQL 用户失败:', e)
        }
    }, [serverId])

    const viewGrants = async (user: string, host: string) => {
        setSelUser({ user, host })
        try {
            const gr = await API.mysqlGrants(serverId, user, host)
            setGrants(gr)
        } catch (e: any) {
            setGrants('查询权限失败：' + (e.message || e))
        }
    }

    useEffect(() => {
        if (activeTabKey === 'status') loadStatus()
        if (activeTabKey === 'users') loadUsers()
    }, [activeTabKey, loadStatus, loadUsers])

    // 构造左侧树数据
    const treeData = useMemo(() => {
        return databases.map((dbName) => {
            const dbKey = `db_${dbName}`
            const rawTables = tablesMap[dbName] || []
            const tbls = rawTables.filter((t) => !t.isView)
            const views = rawTables.filter((t) => t.isView)

            const tableChildren = tbls.map((t) => ({
                key: `table_${dbName}_${t.name}`,
                title: t.name,
                raw: { type: 'table', db: dbName, table: t },
                isLeaf: true,
            }))

            const viewChildren = views.map((v) => ({
                key: `view_${dbName}_${v.name}`,
                title: v.name,
                raw: { type: 'view', db: dbName, table: v },
                isLeaf: true,
            }))

            const dbChildren: any[] = []

            const isLoadingDb = !!loadingDbs[dbName]

            // 数据表分组节点
            dbChildren.push({
                key: `tbls_${dbName}`,
                title: isLoadingDb ? '数据表 (加载中...)' : `数据表 (${tbls.length})`,
                raw: { type: 'folder_tables', db: dbName },
                isLeaf: false,
                children: tableChildren,
            })

            // 视图分组节点
            if (views.length > 0) {
                dbChildren.push({
                    key: `views_${dbName}`,
                    title: isLoadingDb ? '视图 (加载中...)' : `视图 (${views.length})`,
                    raw: { type: 'folder_views', db: dbName },
                    isLeaf: false,
                    children: viewChildren,
                })
            }

            // ER 关系图入口节点
            dbChildren.push({
                key: `er_node_${dbName}`,
                title: 'ER 关系图',
                raw: { type: 'er_node', db: dbName },
                isLeaf: true,
            })

            return {
                key: dbKey,
                title: dbName,
                raw: { type: 'db', dbName },
                isLeaf: false,
                children: dbChildren,
            }
        })
    }, [databases, tablesMap, loadingDbs])

    // 数据库右键菜单
    const getDbMenuItems = (dbName: string): MenuProps['items'] => [
        {
            key: 'new-table',
            icon: <Plus size={14} />,
            label: '新建数据表',
            onClick: () => {
                setCurrentDb(dbName)
                setObjName('')
                setObjExtra('(\n  `id` INT AUTO_INCREMENT PRIMARY KEY,\n  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;')
                setObjModal('createtable')
            },
        },
        {
            key: 'er-diagram',
            icon: <Network size={14} />,
            label: '查看 ER 关系图',
            onClick: () => openErTab(dbName),
        },
        {
            key: 'backup',
            icon: <Copy size={14} />,
            label: '备份数据库 (SQL)',
            onClick: () => handleBackupDb(dbName),
        },
        {
            key: 'refresh',
            icon: <RotateCw size={14} />,
            label: '刷新元数据',
            onClick: () => loadTables(dbName),
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

    // 表右键菜单
    const getTableMenuItems = (dbName: string, tableName: string): MenuProps['items'] => [
        {
            key: 'open-data',
            icon: <TableIcon size={14} />,
            label: '查看 / 编辑数据',
            onClick: () => openTableTab(dbName, tableName),
        },
        {
            key: 'export',
            icon: <Download size={14} />,
            label: '导出数据 (CSV/JSON/SQL)',
            onClick: () => {
                setCurrentDb(dbName)
                setIoTable(tableName)
                setIoModal('export')
            },
        },
        {
            key: 'import',
            icon: <Upload size={14} />,
            label: '导入数据 (CSV/SQL)',
            onClick: () => {
                setCurrentDb(dbName)
                setIoTable(tableName)
                setIoModal('import')
            },
        },
        { type: 'divider' },
        {
            key: 'truncate',
            icon: <Eraser size={14} />,
            danger: true,
            label: '清空表数据 (TRUNCATE)',
            onClick: () => handleTruncateTable(dbName, tableName),
        },
        {
            key: 'drop-table',
            icon: <Trash2 size={14} />,
            danger: true,
            label: '删除表 (DROP)',
            onClick: () => handleDropTable(dbName, tableName),
        },
    ]

    // 空白区域右键菜单
    const blankMenuItems: MenuProps['items'] = [
        {
            key: 'new-db',
            icon: <Plus size={14} />,
            label: '新建数据库',
            onClick: () => {
                setObjName('')
                setObjModal('createdb')
            },
        },
        {
            key: 'users',
            icon: <Users size={14} />,
            label: '用户与权限管理',
            onClick: openUsersTab,
        },
        {
            key: 'refresh-all',
            icon: <RotateCw size={14} />,
            label: '刷新全部',
            onClick: initConnection,
        },
    ]

    return (
        <div className={my.client}>
            {/* 左侧对象导航树 */}
            <aside className={my.sideTree}>
                <div className={my.sideHead}>
                    <span className={my.sideTitle}>
                        <ClientIcon kind="mysql" size={18} />
                        MySQL
                    </span>
                    <Space size={4}>
                        <Tooltip title="新建数据库">
                            <Button
                                size="small"
                                type="text"
                                icon={<Plus size={15} />}
                                onClick={() => {
                                    setObjName('')
                                    setObjModal('createdb')
                                }}
                            />
                        </Tooltip>
                        <Tooltip title="用户与权限">
                            <Button
                                size="small"
                                type="text"
                                icon={<Users size={15} />}
                                onClick={openUsersTab}
                            />
                        </Tooltip>
                        <Tooltip title="刷新元数据">
                            <Button
                                size="small"
                                type="text"
                                icon={<RotateCw size={14} className={loadingTree ? my.spinning : ''} />}
                                onClick={initConnection}
                            />
                        </Tooltip>
                    </Space>
                </div>

                {/* 树容器 */}
                <Dropdown menu={{ items: blankMenuItems }} trigger={['contextMenu']}>
                    <div className={my.treeWrap}>
                        <Tree
                            showIcon
                            blockNode
                            expandedKeys={expandedKeys}
                            loadData={async (node: any) => {
                                const raw = node.raw
                                if (!raw) return
                                if (raw.type === 'db') {
                                    if (!tablesMap[raw.dbName]) {
                                        await loadTables(raw.dbName)
                                    }
                                }
                            }}
                            onExpand={async (keys, info: any) => {
                                setExpandedKeys(keys as string[])
                                if (info.expanded && info.node?.raw) {
                                    const raw = info.node.raw
                                    if (raw.type === 'db') {
                                        if (!tablesMap[raw.dbName]) {
                                            await loadTables(raw.dbName)
                                        }
                                    }
                                }
                            }}
                            onSelect={async (_, info: any) => {
                                const raw = info.node?.raw
                                if (!raw) return
                                const nodeKey = String(info.node.key)
                                if (raw.type === 'table' || raw.type === 'view') {
                                    openTableTab(raw.db, raw.table.name)
                                } else if (raw.type === 'er_node') {
                                    openErTab(raw.db)
                                } else if (raw.type === 'db') {
                                    setCurrentDb(raw.dbName)
                                    const willExpand = !expandedKeys.includes(nodeKey)
                                    if (willExpand && !tablesMap[raw.dbName]) {
                                        await loadTables(raw.dbName)
                                    }
                                    setExpandedKeys((prev) =>
                                        prev.includes(nodeKey) ? prev.filter((k) => k !== nodeKey) : [...prev, nodeKey]
                                    )
                                } else if (raw.type === 'folder_tables' || raw.type === 'folder_views') {
                                    setExpandedKeys((prev) =>
                                        prev.includes(nodeKey) ? prev.filter((k) => k !== nodeKey) : [...prev, nodeKey]
                                    )
                                }
                            }}
                            treeData={treeData}
                            titleRender={(nodeData: any) => {
                                const raw = nodeData.raw
                                if (!raw) return <span>{nodeData.title}</span>

                                if (raw.type === 'db') {
                                    return (
                                        <div onContextMenu={(e) => e.stopPropagation()}>
                                            <Dropdown menu={{ items: getDbMenuItems(raw.dbName) }} trigger={['contextMenu']}>
                                                <div className={my.nodeTitleWrap}>
                                                    <span className={my.nodeMain}>
                                                        <Database size={14} color="var(--accent)" />
                                                        <span className={my.nodeText} style={{ fontWeight: 600 }}>{raw.dbName}</span>
                                                    </span>
                                                </div>
                                            </Dropdown>
                                        </div>
                                    )
                                }

                                if (raw.type === 'folder_tables') {
                                    return (
                                        <div onContextMenu={(e) => e.stopPropagation()} className={my.nodeTitleWrap}>
                                            <span className={my.nodeMain}>
                                                <Layers size={13} color="var(--text-dim)" />
                                                <span className={my.nodeText}>{nodeData.title}</span>
                                            </span>
                                        </div>
                                    )
                                }

                                if (raw.type === 'folder_views') {
                                    return (
                                        <div onContextMenu={(e) => e.stopPropagation()} className={my.nodeTitleWrap}>
                                            <span className={my.nodeMain}>
                                                <Eye size={13} color="var(--text-dim)" />
                                                <span className={my.nodeText}>{nodeData.title}</span>
                                            </span>
                                        </div>
                                    )
                                }

                                if (raw.type === 'er_node') {
                                    return (
                                        <div onContextMenu={(e) => e.stopPropagation()} className={my.nodeTitleWrap}>
                                            <span className={my.nodeMain}>
                                                <Network size={13} color="#722ed1" />
                                                <span className={my.nodeText}>ER 关系图</span>
                                            </span>
                                        </div>
                                    )
                                }

                                if (raw.type === 'table' || raw.type === 'view') {
                                    return (
                                        <div onContextMenu={(e) => e.stopPropagation()} style={{ width: '100%', minWidth: 0, overflow: 'hidden' }}>
                                            <Dropdown menu={{ items: getTableMenuItems(raw.db, raw.table.name) }} trigger={['contextMenu']}>
                                                <div className={my.nodeTitleWrap} title={raw.table.name}>
                                                    <span className={my.nodeMain}>
                                                        {raw.type === 'view' ? (
                                                            <Eye size={13} color="#13c2c2" />
                                                        ) : (
                                                            <TableIcon size={13} color="var(--text-secondary)" />
                                                        )}
                                                        <span className={my.nodeText}>{raw.table.name}</span>
                                                    </span>
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
            <main className={my.mainArea}>
                {/* 顶部标签栏 */}
                <TabBar
                    items={tabItems}
                    activeKey={activeTabKey}
                    onChange={setActiveTabKey}
                    onClose={handleCloseTab}
                    onCloseAll={handleCloseAllTabs}
                    onCloseLeft={handleCloseLeftTabs}
                    onCloseRight={handleCloseRightTabs}
                    size="middle"
                    className={my.tabBar}
                />

                {/* 标签页内容渲染 */}
                <div className={my.tabContent}>
                    {tabs.map((t) => {
                        const isVisible = t.key === activeTabKey
                        if (!isVisible) return null

                        if (t.type === 'data' && t.table) {
                            return (
                                <DataTab
                                    key={t.key}
                                    serverId={serverId}
                                    dbName={t.dbName}
                                    tableName={t.table}
                                    onClose={() => handleCloseTab(t.key)}
                                />
                            )
                        }

                        if (t.type === 'sql') {
                            return (
                                <SqlEditor
                                    key={t.key}
                                    serverId={serverId}
                                    dbName={t.dbName || currentDb || 'mysql'}
                                />
                            )
                        }

                        if (t.type === 'status') {
                            return (
                                <StatusPanel
                                    key={t.key}
                                    sessionId={serverId}
                                    status={status}
                                    variables={variables}
                                    processList={processList}
                                    slowLog={slowLog}
                                    busy={statusBusy}
                                    onRefresh={loadStatus}
                                />
                            )
                        }

                        if (t.type === 'users') {
                            return (
                                <UsersPanel
                                    key={t.key}
                                    sessionId={serverId}
                                    databases={databases}
                                    users={users}
                                    selUser={selUser}
                                    grants={grants}
                                    onSelect={viewGrants}
                                    onRefreshUsers={loadUsers}
                                    onRefreshGrants={() => {
                                        if (selUser) viewGrants(selUser.user, selUser.host)
                                    }}
                                />
                            )
                        }

                        if (t.type === 'er') {
                            return (
                                <ErDiagram
                                    key={t.key}
                                    schema={schemaMap[t.dbName] || { tables: [], foreignKeys: [] }}
                                    busy={false}
                                />
                            )
                        }

                        return null
                    })}
                </div>

                {/* 底部状态栏 */}
                <footer className={my.statusBar}>
                    <span>
                        MySQL · {session.host}:{session.port} | 当前库: <strong>{currentDb || '(未选择)'}</strong>
                    </span>
                    <span>
                        共 {databases.length} 个数据库 | 运行状态正常
                    </span>
                </footer>
            </main>

            {/* 数据库对象管理弹窗 (创建库/创建表) */}
            {objModal && (
                <ObjModal
                    kind={objModal}
                    db={currentDb}
                    busy={objBusy}
                    msg={objMsg}
                    name={objName}
                    extra={objExtra}
                    unique={objUnique}
                    onName={setObjName}
                    onExtra={setObjExtra}
                    onUnique={setObjUnique}
                    onClose={() => setObjModal(null)}
                    onConfirm={doObjAction}
                />
            )}

            {/* 导入 / 导出弹窗 */}
            {ioModal && (
                <IoModal
                    kind={ioModal}
                    table={ioTable}
                    sqlText=""
                    busy={ioBusy}
                    msg={ioMsg}
                    onClose={() => setIoModal(null)}
                    onExport={doExport}
                    onImport={doImport}
                />
            )}

            {/* 确认删除对话框 */}
            <ConfirmModal state={confirm} onCancel={() => setConfirm(emptyConfirm)} />
        </div>
    )
}
