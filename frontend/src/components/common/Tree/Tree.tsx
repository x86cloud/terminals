import React, { useState, useCallback, useRef } from 'react'
import { ChevronRight, Loader2 } from 'lucide-react'
import { TreeNodeData, TreeProps, TreeDropInfo } from './types'
import s from './Tree.module.less'

function findNode(key: string, nodes: TreeNodeData[]): TreeNodeData | null {
    if (!Array.isArray(nodes)) return null
    for (const n of nodes) {
        if (!n) continue
        if (n.key === key) return n
        if (n.children && n.children.length > 0) {
            const found = findNode(key, n.children)
            if (found) return found
        }
    }
    return null
}

function checkInChildren(nodes: TreeNodeData[], targetKey: string): boolean {
    if (!Array.isArray(nodes)) return false
    for (const n of nodes) {
        if (!n) continue
        if (n.key === targetKey) return true
        if (n.children && checkInChildren(n.children, targetKey)) return true
    }
    return false
}

function isDescendant(parentKey: string, childKey: string, nodes: TreeNodeData[]): boolean {
    const parent = findNode(parentKey, nodes)
    if (!parent || !Array.isArray(parent.children) || parent.children.length === 0) return false
    return checkInChildren(parent.children, childKey)
}

interface TreeNodeItemProps {
    node: TreeNodeData
    depth: number
    expandedKeys: string[]
    selectedKeys: string[]
    loadingKeys: Set<string>
    indent: number
    showIndentGuides: boolean
    titleRender?: (node: TreeNodeData) => React.ReactNode
    onToggleExpand: (node: TreeNodeData) => void
    onRowClick: (node: TreeNodeData, e: React.MouseEvent) => void
    onRowDoubleClick: (node: TreeNodeData) => void
    loadData?: (node: TreeNodeData) => Promise<void>
    draggable?: boolean | { icon?: boolean; nodeDraggable?: (node: TreeNodeData) => boolean }
    dragNodeKey: string | null
    dropTargetKey: string | null
    dropPosition: number
    dropToGap: boolean
    onNodeDragStart: (node: TreeNodeData, e: React.DragEvent) => void
    onNodeDragOver: (node: TreeNodeData, e: React.DragEvent) => void
    onNodeDragLeave: (node: TreeNodeData, e: React.DragEvent) => void
    onNodeDrop: (node: TreeNodeData, e: React.DragEvent) => void
    onNodeDragEnd: (e: React.DragEvent) => void
}

function TreeNodeItem({
    node,
    depth,
    expandedKeys,
    selectedKeys,
    loadingKeys,
    indent,
    showIndentGuides,
    titleRender,
    onToggleExpand,
    onRowClick,
    onRowDoubleClick,
    loadData,
    draggable,
    dragNodeKey,
    dropTargetKey,
    dropPosition,
    dropToGap,
    onNodeDragStart,
    onNodeDragOver,
    onNodeDragLeave,
    onNodeDrop,
    onNodeDragEnd,
}: TreeNodeItemProps) {
    const hasChildren = Array.isArray(node.children) && node.children.length > 0
    const isLeaf =
        node.isLeaf === true ||
        (node.isLeaf === undefined && !hasChildren && !loadData)

    const isExpanded = expandedKeys.includes(node.key)
    const isLoading = loadingKeys.has(node.key)
    const isSelected = selectedKeys.includes(node.key)

    // 拖拽相关状态计算
    const isDraggable =
        Boolean(draggable) &&
        !node.disabled &&
        (typeof draggable === 'object' && draggable.nodeDraggable
            ? draggable.nodeDraggable(node)
            : true)

    const isDragging = dragNodeKey === node.key
    const isDropTarget = dropTargetKey === node.key

    let dropClass = ''
    if (isDropTarget && !isDragging) {
        if (!dropToGap) {
            dropClass = s.dropOverInside
        } else if (dropPosition === -1) {
            dropClass = s.dropOverTop
        } else if (dropPosition === 1) {
            dropClass = s.dropOverBottom
        }
    }

    // 记录该节点是否曾经被展开过：初次展开前不挂载子节点，展开后折叠时保持挂载以完成收起动画
    const [hasEverExpanded, setHasEverExpanded] = useState(isExpanded)
    if (isExpanded && !hasEverExpanded) {
        setHasEverExpanded(true)
    }

    return (
        <div className={s.nodeWrapper}>
            <div
                className={`${s.nodeRow} ${isSelected ? s.selected : ''} ${node.disabled ? s.disabled : ''} ${isDragging ? s.dragging : ''} ${dropClass}`}
                onClick={(e) => onRowClick(node, e)}
                onDoubleClick={() => onRowDoubleClick(node)}
                role="treeitem"
                aria-expanded={isLeaf ? undefined : isExpanded}
                aria-selected={isSelected}
                draggable={isDraggable}
                onDragStart={(e) => {
                    if (!isDraggable) return
                    onNodeDragStart(node, e)
                }}
                onDragOver={(e) => {
                    if (!draggable) return
                    onNodeDragOver(node, e)
                }}
                onDragLeave={(e) => {
                    if (!draggable) return
                    onNodeDragLeave(node, e)
                }}
                onDrop={(e) => {
                    if (!draggable) return
                    onNodeDrop(node, e)
                }}
                onDragEnd={(e) => {
                    if (!draggable) return
                    onNodeDragEnd(e)
                }}
            >
                {/* 深度缩进与导引线 */}
                {depth > 0 &&
                    Array.from({ length: depth }).map((_, i) => (
                        <span
                            key={i}
                            className={s.indentBlock}
                            style={{ width: indent }}
                        >
                            {showIndentGuides && <span className={s.guideLine} />}
                        </span>
                    ))}

                {/* 展开/折叠指示图标 */}
                {!isLeaf ? (
                    <span
                        className={s.switcher}
                        onClick={(e) => {
                            e.stopPropagation()
                            onToggleExpand(node)
                        }}
                    >
                        {isLoading ? (
                            <Loader2 size={12} className={s.spinning} />
                        ) : (
                            <span className={`${s.switcherIcon} ${isExpanded ? s.expanded : ''}`}>
                                <ChevronRight size={13} />
                            </span>
                        )}
                    </span>
                ) : (
                    <span className={s.switcherSpacer} />
                )}

                {/* 节点主要内容渲染 */}
                <div className={s.nodeContent}>
                    {titleRender ? (
                        titleRender(node)
                    ) : (
                        <>
                            {node.icon && <span className={s.nodeIcon}>{node.icon}</span>}
                            <span>{node.title}</span>
                        </>
                    )}
                </div>
            </div>

            {/* 子节点展开/收起过渡动画容器 */}
            {!isLeaf && (
                <div
                    className={`${s.childrenWrapper} ${isExpanded ? s.childrenExpanded : ''}`}
                >
                    <div className={s.childrenInner}>
                        {hasEverExpanded &&
                            hasChildren &&
                            node.children!.map((child) => (
                                <TreeNodeItem
                                    key={child.key}
                                    node={child}
                                    depth={depth + 1}
                                    expandedKeys={expandedKeys}
                                    selectedKeys={selectedKeys}
                                    loadingKeys={loadingKeys}
                                    indent={indent}
                                    showIndentGuides={showIndentGuides}
                                    titleRender={titleRender}
                                    onToggleExpand={onToggleExpand}
                                    onRowClick={onRowClick}
                                    onRowDoubleClick={onRowDoubleClick}
                                    loadData={loadData}
                                    draggable={draggable}
                                    dragNodeKey={dragNodeKey}
                                    dropTargetKey={dropTargetKey}
                                    dropPosition={dropPosition}
                                    dropToGap={dropToGap}
                                    onNodeDragStart={onNodeDragStart}
                                    onNodeDragOver={onNodeDragOver}
                                    onNodeDragLeave={onNodeDragLeave}
                                    onNodeDrop={onNodeDrop}
                                    onNodeDragEnd={onNodeDragEnd}
                                />
                            ))}
                    </div>
                </div>
            )}
        </div>
    )
}

export default function Tree({
    treeData = [],
    expandedKeys: propExpandedKeys,
    defaultExpandedKeys = [],
    onExpand,
    selectedKeys: propSelectedKeys,
    defaultSelectedKeys = [],
    onSelect,
    loadData,
    titleRender,
    showIndentGuides = true,
    indent = 16,
    className = '',
    style,
    emptyText = '暂无数据',
    draggable = false,
    onDrop,
    onDragStart,
    onDragEnd,
}: TreeProps) {
    // 展开状态支持受控与非受控
    const [internalExpandedKeys, setInternalExpandedKeys] = useState<string[]>(defaultExpandedKeys)
    const expandedKeys = propExpandedKeys !== undefined ? propExpandedKeys : internalExpandedKeys

    // 选中状态支持受控与非受控
    const [internalSelectedKeys, setInternalSelectedKeys] = useState<string[]>(defaultSelectedKeys)
    const selectedKeys = propSelectedKeys !== undefined ? propSelectedKeys : internalSelectedKeys

    // 单个节点的异步加载中状态
    const [loadingKeys, setLoadingKeys] = useState<Set<string>>(new Set())

    // 拖拽相关内部状态
    const [dragNodeKey, setDragNodeKey] = useState<string | null>(null)
    const [dropTargetKey, setDropTargetKey] = useState<string | null>(null)
    const [dropPosition, setDropPosition] = useState<number>(0)
    const [dropToGap, setDropToGap] = useState<boolean>(false)

    const dragNodeRef = useRef<TreeNodeData | null>(null)
    const hoverExpandTimerRef = useRef<{ key: string; timer: any } | null>(null)

    const resetDragState = useCallback(() => {
        setDragNodeKey(null)
        setDropTargetKey(null)
        setDropPosition(0)
        setDropToGap(false)
        dragNodeRef.current = null
        if (hoverExpandTimerRef.current) {
            clearTimeout(hoverExpandTimerRef.current.timer)
            hoverExpandTimerRef.current = null
        }
    }, [])

    // 切换折叠 / 展开
    const handleToggleExpand = useCallback(
        async (node: TreeNodeData) => {
            if (node.disabled) return

            const nodeKey = node.key
            const isCurrentlyExpanded = expandedKeys.includes(nodeKey)
            const willExpand = !isCurrentlyExpanded

            const nextKeys = willExpand
                ? [...expandedKeys, nodeKey]
                : expandedKeys.filter((k) => k !== nodeKey)

            if (propExpandedKeys === undefined) {
                setInternalExpandedKeys(nextKeys)
            }
            onExpand?.(nextKeys, { node, expanded: willExpand })

            // 若展开且需要异步懒加载数据
            if (willExpand && loadData && (!node.children || node.children.length === 0) && !node.isLeaf) {
                setLoadingKeys((prev) => new Set(prev).add(nodeKey))
                try {
                    await loadData(node)
                } catch (err) {
                    console.error('[Tree] loadData error for node:', nodeKey, err)
                } finally {
                    setLoadingKeys((prev) => {
                        const next = new Set(prev)
                        next.delete(nodeKey)
                        return next
                    })
                }
            }
        },
        [expandedKeys, propExpandedKeys, onExpand, loadData]
    )

    // 行点击事件
    const handleRowClick = useCallback(
        (node: TreeNodeData, e: React.MouseEvent) => {
            if (node.disabled) return

            const nextSelected = [node.key]
            if (propSelectedKeys === undefined) {
                setInternalSelectedKeys(nextSelected)
            }
            onSelect?.(nextSelected, { node, selected: true, event: e })
        },
        [propSelectedKeys, onSelect]
    )

    // 双击非叶子节点快速展开 / 收起
    const handleRowDoubleClick = useCallback(
        (node: TreeNodeData) => {
            const isLeaf =
                node.isLeaf === true ||
                (node.isLeaf === undefined && (!node.children || node.children.length === 0) && !loadData)
            if (!isLeaf) {
                handleToggleExpand(node)
            }
        },
        [loadData, handleToggleExpand]
    )

    // 拖拽处理
    const handleNodeDragStart = useCallback(
        (node: TreeNodeData, e: React.DragEvent) => {
            dragNodeRef.current = node
            setDragNodeKey(node.key)
            e.stopPropagation()
            e.dataTransfer.effectAllowed = 'move'
            try {
                e.dataTransfer.setData('text/plain', node.key)
            } catch {}
            onDragStart?.({ event: e, node })
        },
        [onDragStart]
    )

    const handleNodeDragOver = useCallback(
        (node: TreeNodeData, e: React.DragEvent) => {
            const currentDrag = dragNodeRef.current
            if (!currentDrag || currentDrag.key === node.key) return

            // 禁止拖拽到自身或自身子孙节点中
            if (isDescendant(currentDrag.key, node.key, treeData)) {
                return
            }

            e.preventDefault()
            e.stopPropagation()
            e.dataTransfer.dropEffect = 'move'

            const rect = e.currentTarget.getBoundingClientRect()
            const relY = e.clientY - rect.top
            const height = rect.height
            const ratio = relY / height

            const isFolder =
                node.isLeaf === false ||
                (node.isLeaf === undefined && (Array.isArray(node.children) || !!loadData))

            let pos: number
            let toGap: boolean

            if (isFolder) {
                if (ratio < 0.25) {
                    pos = -1
                    toGap = true
                } else if (ratio > 0.75) {
                    pos = 1
                    toGap = true
                } else {
                    pos = 0
                    toGap = false
                }
            } else {
                if (ratio < 0.5) {
                    pos = -1
                    toGap = true
                } else {
                    pos = 1
                    toGap = true
                }
            }

            setDropTargetKey(node.key)
            setDropPosition(pos)
            setDropToGap(toGap)

            // 悬停在折叠分组节点上 600ms 后自动展开分组
            if (isFolder && !expandedKeys.includes(node.key)) {
                if (hoverExpandTimerRef.current?.key !== node.key) {
                    if (hoverExpandTimerRef.current) {
                        clearTimeout(hoverExpandTimerRef.current.timer)
                    }
                    const timer = setTimeout(() => {
                        handleToggleExpand(node)
                    }, 600)
                    hoverExpandTimerRef.current = { key: node.key, timer }
                }
            } else {
                if (hoverExpandTimerRef.current) {
                    clearTimeout(hoverExpandTimerRef.current.timer)
                    hoverExpandTimerRef.current = null
                }
            }
        },
        [treeData, expandedKeys, loadData, handleToggleExpand]
    )

    const handleNodeDragLeave = useCallback((node: TreeNodeData, e: React.DragEvent) => {
        if (e.currentTarget && e.relatedTarget && (e.currentTarget as Node).contains(e.relatedTarget as Node)) {
            return
        }
    }, [])

    const handleNodeDrop = useCallback(
        (node: TreeNodeData, e: React.DragEvent) => {
            e.preventDefault()
            e.stopPropagation()

            const currentDrag = dragNodeRef.current
            if (!currentDrag || currentDrag.key === node.key) {
                resetDragState()
                return
            }

            if (isDescendant(currentDrag.key, node.key, treeData)) {
                resetDragState()
                return
            }

            const finalPos = dropPosition
            const finalGap = dropToGap

            resetDragState()

            onDrop?.({
                event: e,
                node,
                dragNode: currentDrag,
                dropPosition: finalPos,
                dropToGap: finalGap,
            })
        },
        [treeData, dropPosition, dropToGap, onDrop, resetDragState]
    )

    const handleNodeDragEnd = useCallback(
        (e: React.DragEvent) => {
            const currentDrag = dragNodeRef.current
            resetDragState()
            if (currentDrag) {
                onDragEnd?.({ event: e, node: currentDrag })
            }
        },
        [onDragEnd, resetDragState]
    )

    if (!treeData || treeData.length === 0) {
        return (
            <div className={`${s.tree} ${className}`} style={style}>
                <div className={s.empty}>{emptyText}</div>
            </div>
        )
    }

    return (
        <div
            className={`${s.tree} ${className}`}
            style={style}
            role="tree"
            onDragOver={(e) => {
                if (!draggable || !dragNodeRef.current) return
                e.preventDefault()
                e.dataTransfer.dropEffect = 'move'
            }}
            onDrop={(e) => {
                if (!draggable || !dragNodeRef.current) return
                e.preventDefault()
                const currentDrag = dragNodeRef.current
                if (!currentDrag) return
                if (treeData && treeData.length > 0) {
                    const lastNode = treeData[treeData.length - 1]
                    if (lastNode.key !== currentDrag.key) {
                        resetDragState()
                        onDrop?.({
                            event: e,
                            node: lastNode,
                            dragNode: currentDrag,
                            dropPosition: 1,
                            dropToGap: true,
                        })
                        return
                    }
                }
                resetDragState()
            }}
        >
            {treeData.map((node) => (
                <TreeNodeItem
                    key={node.key}
                    node={node}
                    depth={0}
                    expandedKeys={expandedKeys}
                    selectedKeys={selectedKeys}
                    loadingKeys={loadingKeys}
                    indent={indent}
                    showIndentGuides={showIndentGuides}
                    titleRender={titleRender}
                    onToggleExpand={handleToggleExpand}
                    onRowClick={handleRowClick}
                    onRowDoubleClick={handleRowDoubleClick}
                    loadData={loadData}
                    draggable={draggable}
                    dragNodeKey={dragNodeKey}
                    dropTargetKey={dropTargetKey}
                    dropPosition={dropPosition}
                    dropToGap={dropToGap}
                    onNodeDragStart={handleNodeDragStart}
                    onNodeDragOver={handleNodeDragOver}
                    onNodeDragLeave={handleNodeDragLeave}
                    onNodeDrop={handleNodeDrop}
                    onNodeDragEnd={handleNodeDragEnd}
                />
            ))}
        </div>
    )
}
