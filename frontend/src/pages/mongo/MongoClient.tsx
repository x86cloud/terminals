import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { Button, Dropdown, MenuProps, message, Tooltip, Space, Tag } from 'antd'
import Tree from '@/components/common/Tree'
import {
    Database,
    Folder,
    Table as TableIcon,
    Plus,
    RotateCw,
    Play,
    Activity,
    Trash2,
    Download,
    Copy,
    X,
    Layers,
    SlidersHorizontal,
    Edit,
} from 'lucide-react'
import { API } from '@/api'
import ClientIcon from '@/components/ClientIcon'
import { MongoSessionInfo, MongoDatabaseInfo, MongoCollectionInfo } from '@/types'
import { MongoTabItem, MongoTabType } from './mongoTypes'
import TabBar, { TabItem } from '@/components/common/TabBar'
import DataTab from './DataTab'
import MqlEditor from './MqlEditor'
import StatusPanel from './StatusPanel'
import ObjModal, { MongoObjModalKind } from './ObjModal'
import IoModal from './IoModal'
import { ConfirmModal, ConfirmState } from '@/components/Modal'
import { copyTextToClipboard } from '@/utils/sqlExport'
import m from './MongoClient.module.less'

interface Props {
    session: MongoSessionInfo
    onClose: () => void
    onChange?: (id: string, database: string) => void
}

export default function MongoClient({ session, onClose, onChange }: Props) {
    const id = session.id
    const onChangeRef = useRef(onChange)
    onChangeRef.current = onChange
    const initialDbRef = useRef(session.database)

    const [currentDb, setCurrentDb] = useState<string>(session.database || '')

    // 树与元数据状态
    const [databases, setDatabases] = useState<string[]>([])
    const [collectionsMap, setCollectionsMap] = useState<Record<string, MongoCollectionInfo[]>>({})
    const [expandedKeys, setExpandedKeys] = useState<string[]>([])
    const [loadingTree, setLoadingTree] = useState(false)
    const [loadingDbs, setLoadingDbs] = useState<Record<string, boolean>>({})
    const [isReady, setIsReady] = useState(false)

    // 工作区多标签栏管理
    const [tabs, setTabs] = useState<MongoTabItem[]>([
        {
            key: 'status',
            label: '性能监控',
            type: 'status',
            dbName: currentDb,
            closable: false,
        },
        {
            key: 'mql_1',
            label: 'MQL 编辑器',
            type: 'query',
            dbName: currentDb,
            closable: false,
        },
    ])
    const [activeTabKey, setActiveTabKey] = useState<string>('status')

    // 对象弹窗状态
    const [objModal, setObjModal] = useState<MongoObjModalKind | null>(null)
    const [objDb, setObjDb] = useState<string>('')
    const [objColl, setObjColl] = useState<string>('')
    const [objName, setObjName] = useState('')
    const [objBusy, setObjBusy] = useState(false)
    const [objMsg, setObjMsg] = useState('')

    // 导出弹窗
    const [exportModal, setExportModal] = useState<{ db: string; coll: string } | null>(null)

    const emptyConfirm: ConfirmState = { open: false, title: '', message: '' }
    const [confirm, setConfirm] = useState<ConfirmState>(emptyConfirm)

    // 加载指定数据库下的集合列表
    const loadCollections = useCallback(
        async (dbName: string) => {
            if (!dbName) return
            setLoadingDbs((prev) => ({ ...prev, [dbName]: true }))
            try {
                const list = await API.mongoCollections(id, dbName)
                setCollectionsMap((prev) => ({ ...prev, [dbName]: list || [] }))
            } catch (e: any) {
                console.error(`加载集合失败 [${dbName}]:`, e)
            } finally {
                setLoadingDbs((prev) => ({ ...prev, [dbName]: false }))
            }
        },
        [id]
    )

    // 连接初始化与获取数据库列表
    const initConnection = useCallback(async () => {
        setLoadingTree(true)
        setIsReady(false)
        try {
            const dbs: MongoDatabaseInfo[] = await API.mongoDatabases(id)
            const dbNames = (dbs || []).map((d) => d.name)
            setDatabases(dbNames)

            const targetDb =
                initialDbRef.current && dbNames.includes(initialDbRef.current)
                    ? initialDbRef.current
                    : dbNames[0] || 'admin'
            setCurrentDb(targetDb)

            // 自动加载默认库下的集合并展开
            if (targetDb) {
                await loadCollections(targetDb)
                setExpandedKeys([`db_${targetDb}`])
            }
            setIsReady(true)
        } catch (e: any) {
            message.error(`连接 MongoDB 失败: ${e.message || e}`)
        } finally {
            setLoadingTree(false)
        }
    }, [id, loadCollections])

    useEffect(() => {
        void initConnection()
    }, [initConnection])

    // 打开集合数据 Tab
    const openCollectionTab = (dbName: string, collName: string, subTab?: 'documents' | 'indexes' | 'schema' | 'stream') => {
        const tabKey = `data:${dbName}.${collName}`
        const existingIdx = tabs.findIndex((t) => t.key === tabKey)
        if (existingIdx >= 0) {
            if (subTab && tabs[existingIdx].subTab !== subTab) {
                const nextTabs = [...tabs]
                nextTabs[existingIdx] = { ...nextTabs[existingIdx], subTab }
                setTabs(nextTabs)
            }
            setActiveTabKey(tabKey)
            return
        }

        const newTab: MongoTabItem = {
            key: tabKey,
            label: `${collName}`,
            type: 'data',
            dbName,
            collection: collName,
            subTab: subTab || 'documents',
            closable: true,
        }
        setTabs((prev) => [...prev, newTab])
        setActiveTabKey(tabKey)
    }

    // 新增 MQL 编辑器 Tab
    const handleNewMqlTab = () => {
        const nextId = tabs.filter((t) => t.type === 'query').length + 1
        const key = `mql_${Date.now()}`
        const newTab: MongoTabItem = {
            key,
            label: `MQL ${nextId}`,
            type: 'query',
            dbName: currentDb,
            closable: true,
        }
        setTabs((prev) => [...prev, newTab])
        setActiveTabKey(key)
    }

    // 关闭 Tab
    const handleCloseTab = (targetKey: string) => {
        const idx = tabs.findIndex((t) => t.key === targetKey)
        if (idx < 0) return
        const nextTabs = tabs.filter((t) => t.key !== targetKey)
        setTabs(nextTabs)
        if (activeTabKey === targetKey) {
            const nextActive = nextTabs[Math.max(0, idx - 1)]
            if (nextActive) {
                setActiveTabKey(nextActive.key)
            }
        }
    }

    const handleCloseAllTabs = () => {
        const retained = tabs.filter((t) => !t.closable)
        setTabs(retained)
        if (retained.length > 0) setActiveTabKey(retained[0].key)
    }

    const handleCloseLeftTabs = (targetKey: string) => {
        const idx = tabs.findIndex((t) => t.key === targetKey)
        if (idx <= 0) return
        const nextTabs = tabs.filter((t, i) => i >= idx || !t.closable)
        setTabs(nextTabs)
        if (!nextTabs.some((t) => t.key === activeTabKey)) {
            setActiveTabKey(targetKey)
        }
    }

    const handleCloseRightTabs = (targetKey: string) => {
        const idx = tabs.findIndex((t) => t.key === targetKey)
        if (idx < 0 || idx >= tabs.length - 1) return
        const nextTabs = tabs.filter((t, i) => i <= idx || !t.closable)
        setTabs(nextTabs)
        if (!nextTabs.some((t) => t.key === activeTabKey)) {
            setActiveTabKey(targetKey)
        }
    }

    // 弹窗确认操作
    const handleObjConfirm = async (extra?: { capped?: boolean; size?: number; max?: number; firstColl?: string }) => {
        if (!objModal) return
        setObjBusy(true)
        setObjMsg('')
        try {
            switch (objModal) {
                case 'createdb': {
                    const firstColl = extra?.firstColl || 'default'
                    await API.mongoCreateDatabase(id, objName, firstColl)
                    message.success(`数据库 ${objName} 创建成功`)
                    await initConnection()
                    break
                }
                case 'createcoll': {
                    if (extra?.capped) {
                        const cmd: Record<string, any> = {
                            create: objName,
                            capped: true,
                            size: extra.size || 10485760,
                        }
                        if (extra.max) cmd.max = extra.max
                        await API.mongoRunCommand(id, objDb, JSON.stringify(cmd))
                    } else {
                        await API.mongoCreateCollection(id, objDb, objName)
                    }
                    message.success(`集合 ${objName} 创建成功`)
                    await loadCollections(objDb)
                    openCollectionTab(objDb, objName)
                    break
                }
                case 'renamecoll': {
                    await API.mongoRenameCollection(id, objDb, objColl, objName)
                    message.success(`集合已重命名为 ${objName}`)
                    await loadCollections(objDb)
                    // 如果旧集合 Tab 打开则关闭并打开新 Tab
                    handleCloseTab(`data:${objDb}.${objColl}`)
                    openCollectionTab(objDb, objName)
                    break
                }
                case 'truncatecoll': {
                    const count = await API.mongoDeleteMany(id, objDb, objColl, '{}')
                    message.success(`已清空集合 ${objColl} (${count} 条文档)`)
                    break
                }
                case 'dropcoll': {
                    await API.mongoDropCollection(id, objDb, objColl)
                    message.success(`已删除集合 ${objColl}`)
                    handleCloseTab(`data:${objDb}.${objColl}`)
                    await loadCollections(objDb)
                    break
                }
                case 'dropdb': {
                    await API.mongoDropDatabase(id, objDb)
                    message.success(`已删除数据库 ${objDb}`)
                    await initConnection()
                    break
                }
            }
            setObjModal(null)
        } catch (e: any) {
            setObjMsg(e.message || String(e))
        } finally {
            setObjBusy(false)
        }
    }

    // 构造左侧树数据
    const treeData = useMemo(() => {
        return databases.map((dbName) => {
            const dbKey = `db_${dbName}`
            const colls = collectionsMap[dbName] || []
            const isLoadingDb = !!loadingDbs[dbName]

            const collChildren = colls.map((c) => ({
                key: `coll_${dbName}_${c.name}`,
                title: c.name,
                raw: { type: 'coll', db: dbName, coll: c },
                isLeaf: true,
            }))

            return {
                key: dbKey,
                title: dbName,
                raw: { type: 'db', dbName },
                isLeaf: false,
                children: collChildren,
            }
        })
    }, [collectionsMap, databases, loadingDbs])

    // 数据库右键菜单
    const getDbMenuItems = (dbName: string): MenuProps['items'] => [
        {
            key: 'new-coll',
            icon: <Plus size={13} />,
            label: '新建集合',
            onClick: () => {
                setObjDb(dbName)
                setObjName('')
                setObjModal('createcoll')
            },
        },
        {
            key: 'refresh',
            icon: <RotateCw size={13} />,
            label: '刷新集合',
            onClick: () => loadCollections(dbName),
        },
        {
            key: 'copy-name',
            icon: <Copy size={13} />,
            label: '复制数据库名',
            onClick: () => copyTextToClipboard(dbName, '已复制数据库名'),
        },
        { type: 'divider' },
        {
            key: 'drop-db',
            icon: <Trash2 size={13} />,
            danger: true,
            label: '删除数据库',
            onClick: () => {
                setObjDb(dbName)
                setObjName(dbName)
                setObjModal('dropdb')
            },
        },
    ]

    // 集合右键菜单
    const getCollMenuItems = (dbName: string, collName: string): MenuProps['items'] => [
        {
            key: 'open-data',
            icon: <TableIcon size={13} />,
            label: '浏览数据 (Table / JSON)',
            onClick: () => openCollectionTab(dbName, collName, 'documents'),
        },
        {
            key: 'open-indexes',
            icon: <Layers size={13} />,
            label: '管理索引',
            onClick: () => openCollectionTab(dbName, collName, 'indexes'),
        },
        {
            key: 'open-schema',
            icon: <SlidersHorizontal size={13} />,
            label: '模型结构校验',
            onClick: () => openCollectionTab(dbName, collName, 'schema'),
        },
        {
            key: 'open-stream',
            icon: <Activity size={13} />,
            label: '变更流监听',
            onClick: () => openCollectionTab(dbName, collName, 'stream'),
        },
        { type: 'divider' },
        {
            key: 'export',
            icon: <Download size={13} />,
            label: '导出数据 (JSON / CSV)',
            onClick: () => setExportModal({ db: dbName, coll: collName }),
        },
        {
            key: 'truncate',
            icon: <Trash2 size={13} />,
            label: '清空集合数据',
            onClick: () => {
                setObjDb(dbName)
                setObjColl(collName)
                setObjName(collName)
                setObjModal('truncatecoll')
            },
        },
        {
            key: 'rename',
            icon: <Edit size={13} />,
            label: '重命名集合',
            onClick: () => {
                setObjDb(dbName)
                setObjColl(collName)
                setObjName(collName)
                setObjModal('renamecoll')
            },
        },
        {
            key: 'copy-name',
            icon: <Copy size={13} />,
            label: '复制集合名',
            onClick: () => copyTextToClipboard(collName, '已复制集合名称'),
        },
        { type: 'divider' },
        {
            key: 'drop-coll',
            icon: <Trash2 size={13} />,
            danger: true,
            label: '删除集合',
            onClick: () => {
                setObjDb(dbName)
                setObjColl(collName)
                setObjName(collName)
                setObjModal('dropcoll')
            },
        },
    ]

    // TabBar 映射项
    const tabItems: TabItem[] = useMemo(() => {
        return tabs.map((t) => {
            let icon: React.ReactNode = <TableIcon size={13} />
            if (t.type === 'status') icon = <Activity size={13} color="#10b981" />
            else if (t.type === 'query') icon = <Play size={13} color="#0ea5e9" />

            return {
                key: t.key,
                label: t.label,
                icon,
                closable: t.closable,
            }
        })
    }, [tabs])

    // 提取 collectionsMap 中的纯集合名称供编辑器使用
    const collectionsMapStrings = useMemo(() => {
        const out: Record<string, string[]> = {}
        for (const [dbk, cols] of Object.entries(collectionsMap)) {
            out[dbk] = (cols || []).map((c) => c.name)
        }
        return out
    }, [collectionsMap])

    // 树高亮与激活 Tab 双向联动
    const selectedTreeKeys = useMemo(() => {
        const activeTab = tabs.find((t) => t.key === activeTabKey)
        if (!activeTab) return []
        if (activeTab.type === 'data' && activeTab.dbName && activeTab.collection) {
            return [`coll_${activeTab.dbName}_${activeTab.collection}`]
        }
        return []
    }, [tabs, activeTabKey])

    return (
        <div className={m.client}>
            {/* 左侧侧边栏 */}
            <aside className={m.sideTree}>
                {/* 36px 头部：严格水平对齐右侧 TabBar */}
                <div className={m.sideHead}>
                    <div className={m.sideTitle}>
                        <ClientIcon kind="mongo" size={16} />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            MongoDB · {session.host}:{session.port}
                        </span>
                    </div>
                    <Space size={2}>
                        <Tooltip title="新建数据库">
                            <Button
                                size="small"
                                type="text"
                                icon={<Plus size={13} />}
                                onClick={() => {
                                    setObjName('')
                                    setObjModal('createdb')
                                }}
                            />
                        </Tooltip>
                        <Tooltip title="新建 MQL 查询">
                            <Button
                                size="small"
                                type="text"
                                icon={<Play size={13} />}
                                onClick={handleNewMqlTab}
                            />
                        </Tooltip>
                        <Tooltip title="刷新数据库列表">
                            <Button
                                size="small"
                                type="text"
                                icon={<RotateCw size={13} />}
                                loading={loadingTree}
                                onClick={initConnection}
                            />
                        </Tooltip>
                    </Space>
                </div>

                {/* 侧边树容器：隐藏滚动条 */}
                <div className={m.treeWrap}>
                    <Tree
                        treeData={treeData}
                        expandedKeys={expandedKeys}
                        onExpand={(keys) => {
                            setExpandedKeys(keys)
                            // 展开库时自动加载该库的集合
                            keys.forEach((k) => {
                                if (k.startsWith('db_')) {
                                    const dbName = k.replace('db_', '')
                                    if (!collectionsMap[dbName]) {
                                        loadCollections(dbName)
                                    }
                                }
                            })
                        }}
                        selectedKeys={selectedTreeKeys}
                        onSelect={async (_, info: any) => {
                            const raw = info?.node?.raw || info?.raw
                            if (!raw) return
                            const nodeKey = String(info.node?.key || '')
                            if (raw.type === 'coll') {
                                openCollectionTab(raw.db, raw.coll.name)
                            } else if (raw.type === 'db') {
                                const dbName = raw.dbName
                                setCurrentDb(dbName)
                                onChangeRef.current?.(id, dbName)
                                const willExpand = !expandedKeys.includes(nodeKey)
                                if (willExpand && !collectionsMap[dbName]) {
                                    await loadCollections(dbName)
                                }
                                setExpandedKeys((prev) =>
                                    prev.includes(nodeKey) ? prev.filter((k) => k !== nodeKey) : [...prev, nodeKey]
                                )
                            }
                        }}
                        titleRender={(nodeData: any) => {
                            const raw = nodeData.raw
                            if (!raw) return <span>{nodeData.title}</span>

                            if (raw.type === 'db') {
                                const dbColls = collectionsMap[raw.dbName] || []
                                return (
                                    <Dropdown menu={{ items: getDbMenuItems(raw.dbName) }} trigger={['contextMenu']}>
                                        <div
                                            className={m.nodeTitleWrap}
                                            title={raw.dbName}
                                            onClick={async (e) => {
                                                e.stopPropagation()
                                                const dbKey = `db_${raw.dbName}`
                                                setCurrentDb(raw.dbName)
                                                onChangeRef.current?.(id, raw.dbName)
                                                const willExpand = !expandedKeys.includes(dbKey)
                                                if (willExpand && !collectionsMap[raw.dbName]) {
                                                    await loadCollections(raw.dbName)
                                                }
                                                setExpandedKeys((prev) =>
                                                    prev.includes(dbKey) ? prev.filter((k) => k !== dbKey) : [...prev, dbKey]
                                                )
                                            }}
                                        >
                                            <span className={m.nodeMain}>
                                                <Database size={13} color="#10b981" />
                                                <span className={m.nodeText} style={{ fontWeight: 600 }}>
                                                    {raw.dbName}
                                                </span>
                                            </span>
                                            {dbColls.length > 0 && (
                                                <span className={m.nodeMeta}>{dbColls.length}</span>
                                            )}
                                        </div>
                                    </Dropdown>
                                )
                            }

                            if (raw.type === 'coll') {
                                const coll: MongoCollectionInfo = raw.coll
                                return (
                                    <Dropdown
                                        menu={{ items: getCollMenuItems(raw.db, coll.name) }}
                                        trigger={['contextMenu']}
                                    >
                                        <div
                                            className={m.nodeTitleWrap}
                                            title={coll.name}
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                openCollectionTab(raw.db, coll.name)
                                            }}
                                        >
                                            <span className={m.nodeMain}>
                                                <TableIcon size={13} color="var(--text-secondary)" />
                                                <span className={m.nodeText}>{coll.name}</span>
                                            </span>
                                            {coll.hasValidator && (
                                                <Tag color="blue" style={{ fontSize: 10, padding: '0 3px', lineHeight: '14px', height: 14, margin: 0 }}>
                                                    校验
                                                </Tag>
                                            )}
                                        </div>
                                    </Dropdown>
                                )
                            }

                            return <span>{nodeData.title}</span>
                        }}
                    />
                </div>
            </aside>

            {/* 右侧主工作区 */}
            <main className={m.mainArea}>
                {/* 36px 统一 TabBar */}
                <TabBar
                    items={tabItems}
                    activeKey={activeTabKey}
                    onChange={setActiveTabKey}
                    onClose={handleCloseTab}
                    onCloseAll={handleCloseAllTabs}
                    onCloseLeft={handleCloseLeftTabs}
                    onCloseRight={handleCloseRightTabs}
                    size="middle"
                    className={m.tabBar}
                />

                {/* 标签页内容视图 */}
                <div className={m.tabContent}>
                    {tabs.map((t) => {
                        const isVisible = t.key === activeTabKey
                        if (!isVisible) return null

                        if (t.type === 'data' && t.collection) {
                            return (
                                <DataTab
                                    key={t.key}
                                    session={session}
                                    db={t.dbName}
                                    collection={t.collection}
                                    initialSubTab={t.subTab}
                                    onClose={() => handleCloseTab(t.key)}
                                />
                            )
                        }

                        if (t.type === 'query') {
                            return (
                                <MqlEditor
                                    key={t.key}
                                    session={session}
                                    databases={databases}
                                    currentDb={t.dbName || currentDb}
                                    onChangeDb={(db) => {
                                        setCurrentDb(db)
                                        onChange?.(id, db)
                                    }}
                                    collectionsMap={collectionsMapStrings}
                                />
                            )
                        }

                        if (t.type === 'status') {
                            return <StatusPanel key={t.key} session={session} />
                        }

                        return null
                    })}
                </div>
            </main>

            {/* 对象管理模态框 (新建库/集合/删除/清空/重命名) */}
            {objModal && (
                <ObjModal
                    kind={objModal}
                    db={objDb}
                    coll={objColl}
                    busy={objBusy}
                    msg={objMsg}
                    name={objName}
                    onName={setObjName}
                    onClose={() => setObjModal(null)}
                    onConfirm={handleObjConfirm}
                />
            )}

            {/* 树右键直接导出的模态框 */}
            {exportModal && (
                <IoModal
                    sessionId={id}
                    db={exportModal.db}
                    coll={exportModal.coll}
                    currentDocs={[]}
                    filter="{}"
                    onClose={() => setExportModal(null)}
                />
            )}

            {/* 全局二次确认弹窗 */}
            <ConfirmModal state={confirm} onCancel={() => setConfirm(emptyConfirm)} />
        </div>
    )
}
