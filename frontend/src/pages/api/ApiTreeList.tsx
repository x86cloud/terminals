import React, { useMemo, useState } from 'react'
import { Tree, Input, Button, Tag, Tooltip, Modal, message, Space, Dropdown } from 'antd'
import type { MenuProps } from 'antd'
import {
    Folder,
    FolderPlus,
    Plus,
    Search,
    X,
    Edit2,
    Copy,
    Trash2,
    MoreVertical,
    FileCode,
    ChevronRight,
    ChevronDown,
    ChevronsUpDown,
} from 'lucide-react'
import { ConfirmModal, ConfirmState } from '@/components/Modal'
import { buildCurlCommand, countApiItems, filterApiTree, findTreeNode } from './apiTypes'
import type { ApiFolderNode, SavedApiItem, ApiTreeNode } from './apiTypes'
import type { ApiState } from './useApi'
import a from './ApiTreeList.module.less'

interface Props {
    state: ApiState
}

export default function ApiTreeList({ state }: Props) {
    const {
        apiTree,
        currentApiId,
        loadSavedApi,
        createFolder,
        renameTreeNode,
        deleteTreeNode,
        duplicateApiItem,
        moveTreeNode,
        newBlankApi,
        showHistory,
        setShowHistory,
        setSaveModalOpen,
        saveModalMode,
        setSaveModalMode,
        isModified,
        currentApiName,
    } = state

    const [keyword, setKeyword] = useState('')
    const [expandedKeys, setExpandedKeys] = useState<string[]>(['folder_default'])
    const [autoExpandParent, setAutoExpandParent] = useState(true)

    // 重命名/新建分组弹窗状态
    const [nameModal, setNameModal] = useState<{
        open: boolean
        title: string
        type: 'folder' | 'rename'
        id?: string
        parentId?: string | null
        initialValue: string
    }>({
        open: false,
        title: '',
        type: 'folder',
        initialValue: '',
    })
    const [nameInputValue, setNameInputValue] = useState('')

    // 删除确认 / 未保存确认弹窗
    const [confirm, setConfirm] = useState<ConfirmState>({ open: false, title: '', message: '' })

    // 安全加载接口（若未保存则提示）
    const safeLoadApi = (item: SavedApiItem) => {
        if (!item || item.id === currentApiId) return
        if (isModified) {
            setConfirm({
                open: true,
                title: '未保存修改提示',
                danger: true,
                confirmText: '放弃修改并切换',
                cancelText: '留在当前接口',
                message: `当前接口「${currentApiName || '未命名'}」有未保存的修改，切换到「${item.name || '新接口'}」将丢失这些修改。确定要继续切换吗？`,
                onConfirm: () => {
                    setConfirm({ open: false, title: '', message: '' })
                    loadSavedApi(item)
                },
            })
            return
        }
        loadSavedApi(item)
    }

    // 安全新建接口（若未保存则提示）
    const safeNewBlankApi = () => {
        if (isModified) {
            setConfirm({
                open: true,
                title: '未保存修改提示',
                danger: true,
                confirmText: '放弃修改并新建',
                cancelText: '留在当前接口',
                message: `当前接口「${currentApiName || '未命名'}」有未保存的修改，新建接口将丢失这些修改。确定要继续新建吗？`,
                onConfirm: () => {
                    setConfirm({ open: false, title: '', message: '' })
                    newBlankApi()
                    setSaveModalMode('saveAs')
                    setSaveModalOpen(true)
                },
            })
            return
        }
        newBlankApi()
        setSaveModalMode('saveAs')
        setSaveModalOpen(true)
    }

    const methodColors: Record<string, string> = {
        GET: 'green',
        POST: 'orange',
        PUT: 'blue',
        DELETE: 'red',
        PATCH: 'purple',
        HEAD: 'cyan',
        OPTIONS: 'default',
        WS: 'geekblue',
    }

    // 过滤树节点
    const { filtered: filteredTree, matchedKeys } = useMemo(() => {
        return filterApiTree(apiTree || [], keyword)
    }, [apiTree, keyword])

    // 如果有搜索词，自动展开所有匹配项
    const effectiveExpandedKeys = useMemo(() => {
        if (keyword.trim()) {
            return Array.from(new Set([...expandedKeys, ...matchedKeys]))
        }
        return expandedKeys
    }, [keyword, expandedKeys, matchedKeys])

    const totalApiCount = useMemo(() => countApiItems(apiTree || []), [apiTree])

    // 切换展开全部 / 折叠全部
    const toggleExpandAll = () => {
        if (expandedKeys.length > 0) {
            setExpandedKeys([])
        } else {
            const allFolderIds: string[] = []
            const collect = (nodes: ApiTreeNode[]) => {
                if (!Array.isArray(nodes)) return
                for (const node of nodes) {
                    if (node && node.isFolder) {
                        allFolderIds.push(node.id)
                        if (node.children) collect(node.children)
                    }
                }
            }
            collect(apiTree || [])
            setExpandedKeys(allFolderIds)
        }
    }

    // 渲染分组标题
    const renderFolderTitle = (folder: ApiFolderNode) => {
        if (!folder) return null
        const itemCount = countApiItems(folder.children || [])

        const folderMenuItems: MenuProps['items'] = [
            {
                key: 'new-api',
                icon: <Plus size={14} />,
                label: '新建接口',
                onClick: () => {
                    safeNewBlankApi()
                },
            },
            {
                key: 'new-subfolder',
                icon: <FolderPlus size={14} />,
                label: '新建子分组',
                onClick: () => {
                    setNameInputValue('')
                    setNameModal({
                        open: true,
                        title: `在「${folder.name}」下新建分组`,
                        type: 'folder',
                        parentId: folder.id,
                        initialValue: '',
                    })
                },
            },
            {
                type: 'divider',
            },
            {
                key: 'rename',
                icon: <Edit2 size={14} />,
                label: '重命名',
                onClick: () => {
                    setNameInputValue(folder.name || '')
                    setNameModal({
                        open: true,
                        title: '重命名分组',
                        type: 'rename',
                        id: folder.id,
                        initialValue: folder.name || '',
                    })
                },
            },
            {
                key: 'delete',
                icon: <Trash2 size={14} />,
                danger: true,
                label: '删除分组',
                onClick: () => {
                    setConfirm({
                        open: true,
                        title: '删除分组',
                        danger: true,
                        message: `确定要删除分组「${folder.name || '分组'}」及其下的所有接口吗？`,
                        onConfirm: () => {
                            setConfirm({ open: false, title: '', message: '' })
                            deleteTreeNode(folder.id)
                            message.success('分组已删除')
                        },
                    })
                },
            },
        ]

        return (
            <Dropdown menu={{ items: folderMenuItems }} trigger={['contextMenu']}>
                <div
                    className={a.nodeTitleWrap}
                    onDoubleClick={(e) => {
                        e.stopPropagation()
                        setNameInputValue(folder.name || '')
                        setNameModal({
                            open: true,
                            title: '重命名分组',
                            type: 'rename',
                            id: folder.id,
                            initialValue: folder.name || '',
                        })
                    }}
                >
                    <div className={a.nodeMain}>
                        <Folder size={15} style={{ color: '#faad14', flexShrink: 0 }} />
                        <span className={a.nodeText} title={folder.name || '未命名分组'}>
                            {folder.name || '未命名分组'}
                        </span>
                        <Tag style={{ fontSize: 11, padding: '0 6px', marginInlineEnd: 0, lineHeight: '18px', height: 20, borderRadius: 10 }}>
                            {itemCount}
                        </Tag>
                    </div>
                </div>
            </Dropdown>
        )
    }

    // 渲染接口项标题
    const renderApiTitle = (item: SavedApiItem) => {
        if (!item) return null
        const isActive = currentApiId === item.id
        const isWs = item.mode === 'ws' || item.method === ('WS' as any)
        const methodTag = isWs ? 'WS' : item.method || 'GET'
        const color = isWs ? 'geekblue' : methodColors[methodTag] || 'default'

        const apiMenuItems: MenuProps['items'] = [
            {
                key: 'copy-curl',
                icon: <Copy size={14} />,
                label: '复制为 cURL 命令',
                onClick: () => {
                    const cmd = buildCurlCommand(item)
                    navigator.clipboard.writeText(cmd).then(() => {
                        message.success('已复制 cURL 命令')
                    }).catch(() => {
                        state.copy(cmd)
                        message.success('已复制 cURL 命令')
                    })
                },
            },
            {
                key: 'rename',
                icon: <Edit2 size={14} />,
                label: '重命名',
                onClick: () => {
                    setNameInputValue(item.name || '')
                    setNameModal({
                        open: true,
                        title: '重命名接口',
                        type: 'rename',
                        id: item.id,
                        initialValue: item.name || '',
                    })
                },
            },
            {
                key: 'duplicate',
                icon: <Copy size={14} />,
                label: '创建副本',
                onClick: () => {
                    duplicateApiItem(item.id)
                    message.success('已复制接口副本')
                },
            },
            {
                type: 'divider',
            },
            {
                key: 'delete',
                icon: <Trash2 size={14} />,
                danger: true,
                label: '删除接口',
                onClick: () => {
                    setConfirm({
                        open: true,
                        title: '删除接口',
                        danger: true,
                        message: `确定要删除接口「${item.name || '接口'}」吗？`,
                        onConfirm: () => {
                            setConfirm({ open: false, title: '', message: '' })
                            deleteTreeNode(item.id)
                            message.success('接口已删除')
                        },
                    })
                },
            },
        ]

        return (
            <Dropdown menu={{ items: apiMenuItems }} trigger={['contextMenu']}>
                <div
                    className={a.nodeTitleWrap}
                    onDoubleClick={(e) => {
                        e.stopPropagation()
                        setNameInputValue(item.name || '')
                        setNameModal({
                            open: true,
                            title: '重命名接口',
                            type: 'rename',
                            id: item.id,
                            initialValue: item.name || '',
                        })
                    }}
                >
                    <div className={a.nodeMain} title={`${item.name || '未命名接口'}\n${item.url || '未填地址'}`}>
                        <Tag
                            color={color}
                            style={{
                                fontSize: 11,
                                fontWeight: 700,
                                padding: '0 6px',
                                marginInlineEnd: 0,
                                lineHeight: '20px',
                                height: 20,
                                borderRadius: 3,
                                flexShrink: 0,
                            }}
                        >
                            {methodTag}
                        </Tag>
                        <span className={`${a.nodeText} ${isActive ? a.nodeActive : ''}`}>
                            {item.name || '未命名接口'}
                        </span>
                    </div>
                </div>
            </Dropdown>
        )
    }

    // 递归转换 Ant Design Tree 数据
    const convertNodes = (nodes: ApiTreeNode[]): any[] => {
        if (!Array.isArray(nodes)) return []
        return nodes.filter(Boolean).map((node) => {
            if (node.isFolder) {
                return {
                    key: node.id,
                    title: node.name || '未命名分组',
                    rawNode: node,
                    isLeaf: false,
                    children: convertNodes(node.children || []),
                }
            }
            return {
                key: node.id,
                title: node.name || '未命名接口',
                rawNode: node,
                isLeaf: true,
            }
        })
    }

    const treeData = useMemo(() => convertNodes(filteredTree), [filteredTree])

    const handleSelect = (selectedKeys: any[]) => {
        if (!Array.isArray(selectedKeys) || selectedKeys.length === 0) return
        const key = String(selectedKeys[0])
        const found = findTreeNode(apiTree || [], key)
        if (found && !found.isFolder) {
            safeLoadApi(found as SavedApiItem)
        }
    }

    const handleDrop = (info: any) => {
        if (!info || !info.node || !info.dragNode) return
        const dropKey = String(info.node.key)
        const dragKey = String(info.dragNode.key)
        const dropPos = String(info.node.pos || '0-0').split('-')
        const dropPosition = info.dropPosition - Number(dropPos[dropPos.length - 1] || 0)
        moveTreeNode(dragKey, dropKey, dropPosition, info.dropToGap)
    }

    const handleSaveNameModal = () => {
        const val = nameInputValue.trim()
        if (!val) {
            message.warning('名称不能为空')
            return
        }
        if (nameModal.type === 'folder') {
            createFolder(val, nameModal.parentId)
            message.success('分组创建成功')
        } else if (nameModal.type === 'rename' && nameModal.id) {
            renameTreeNode(nameModal.id, val)
            message.success('重命名成功')
        }
        setNameModal({ open: false, title: '', type: 'folder', initialValue: '' })
    }

    if (!showHistory) return null

    const blankAreaMenuItems: MenuProps['items'] = [
        {
            key: 'new-api',
            icon: <Plus size={14} />,
            label: '新建接口',
            onClick: () => {
                safeNewBlankApi()
            },
        },
        {
            key: 'new-folder',
            icon: <FolderPlus size={14} />,
            label: '新建分组',
            onClick: () => {
                setNameInputValue('')
                setNameModal({
                    open: true,
                    title: '新建分组',
                    type: 'folder',
                    parentId: null,
                    initialValue: '',
                })
            },
        },
        {
            type: 'divider',
        },
        {
            key: 'toggle-expand',
            icon: <ChevronsUpDown size={14} />,
            label: expandedKeys.length > 0 ? '收起全部' : '展开全部',
            onClick: toggleExpandAll,
        },
    ]

    return (
        <aside className={a.treePanel}>
            {/* 顶部标题与快捷操作 */}
            <div className={a.treeHead}>
                <span className={a.treeTitle}>接口列表</span>
                <Tag color="geekblue" style={{ fontSize: 11, fontWeight: 700, borderRadius: 10, padding: '0 7px', height: 20, lineHeight: '18px' }}>
                    {totalApiCount}
                </Tag>
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Tooltip title="新建接口">
                        <Button
                            type="text"
                            style={{ height: 32, width: 32, padding: 0 }}
                            icon={<Plus size={16} />}
                            onClick={safeNewBlankApi}
                        />
                    </Tooltip>
                    <Tooltip title="新建分组">
                        <Button
                            type="text"
                            style={{ height: 32, width: 32, padding: 0 }}
                            icon={<FolderPlus size={16} />}
                            onClick={() => {
                                setNameInputValue('')
                                setNameModal({
                                    open: true,
                                    title: '新建分组',
                                    type: 'folder',
                                    parentId: null,
                                    initialValue: '',
                                })
                            }}
                        />
                    </Tooltip>
                    <Tooltip title="展开/收起全部">
                        <Button
                            type="text"
                            style={{ height: 32, width: 32, padding: 0 }}
                            icon={<ChevronsUpDown size={16} />}
                            onClick={toggleExpandAll}
                        />
                    </Tooltip>
                    <Tooltip title="收起列表">
                        <Button
                            type="text"
                            style={{ height: 32, width: 32, padding: 0 }}
                            icon={<X size={16} />}
                            onClick={() => setShowHistory(false)}
                        />
                    </Tooltip>
                </div>
            </div>

            {/* 搜索工具栏 */}
            <div className={a.searchBar}>
                <Input
                    style={{ flex: 1, height: 34, fontSize: 13 }}
                    placeholder="搜索接口名称 / URL / 方法..."
                    value={keyword}
                    allowClear
                    prefix={<Search size={14} style={{ color: 'var(--text-faint)' }} />}
                    onChange={(e) => setKeyword(e.target.value)}
                />
            </div>

            {/* 树形列表内容（支持空白处右键） */}
            <Dropdown menu={{ items: blankAreaMenuItems }} trigger={['contextMenu']}>
                <div className={a.treeContent}>
                    {treeData.length === 0 ? (
                        <div className={a.emptyTree}>
                            <FileCode size={36} style={{ opacity: 0.4 }} />
                            <span>{keyword ? '未找到匹配的接口' : '暂无保存的接口'}</span>
                            {!keyword && (
                                <Button
                                    type="primary"
                                    style={{ height: 32, marginTop: 4 }}
                                    icon={<Plus size={14} />}
                                    onClick={safeNewBlankApi}
                                >
                                    新建接口
                                </Button>
                            )}
                        </div>
                    ) : (
                        <Tree
                            draggable={{ icon: false }}
                            blockNode
                            treeData={treeData}
                            selectedKeys={currentApiId ? [currentApiId] : []}
                            expandedKeys={effectiveExpandedKeys}
                            onExpand={(keys) => {
                                setExpandedKeys(keys as string[])
                                setAutoExpandParent(false)
                            }}
                            autoExpandParent={autoExpandParent}
                            onSelect={handleSelect}
                            onDrop={handleDrop}
                            titleRender={(nodeData: any) => {
                                const raw = nodeData.rawNode
                                if (!raw) return <span>{nodeData.title}</span>
                                return raw.isFolder ? renderFolderTitle(raw) : renderApiTitle(raw)
                            }}
                        />
                    )}
                </div>
            </Dropdown>

            {/* 新建/重命名弹窗 */}
            <Modal
                title={nameModal.title}
                open={nameModal.open}
                onOk={handleSaveNameModal}
                onCancel={() => setNameModal({ open: false, title: '', type: 'folder', initialValue: '' })}
                okText="确定"
                cancelText="取消"
                destroyOnClose
                width={400}
            >
                <div style={{ padding: '12px 0' }}>
                    <Input
                        style={{ height: 34 }}
                        placeholder="请输入名称"
                        value={nameInputValue}
                        autoFocus
                        spellCheck={false}
                        onChange={(e) => setNameInputValue(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                e.preventDefault()
                                handleSaveNameModal()
                            }
                        }}
                    />
                </div>
            </Modal>

            {/* 删除确认弹窗 */}
            <ConfirmModal
                state={confirm}
                onCancel={() => setConfirm({ open: false, title: '', message: '' })}
            />
        </aside>
    )
}
