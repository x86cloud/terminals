import React, { useState, useCallback } from 'react'
import { ChevronRight, Loader2 } from 'lucide-react'
import { TreeNodeData, TreeProps } from './types'
import s from './Tree.module.less'

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
}: TreeNodeItemProps) {
    const hasChildren = Array.isArray(node.children) && node.children.length > 0
    const isLeaf =
        node.isLeaf === true ||
        (node.isLeaf === undefined && !hasChildren && !loadData)

    const isExpanded = expandedKeys.includes(node.key)
    const isLoading = loadingKeys.has(node.key)
    const isSelected = selectedKeys.includes(node.key)

    // 记录该节点是否曾经被展开过：初次展开前不挂载子节点，展开后折叠时保持挂载以完成收起动画
    const [hasEverExpanded, setHasEverExpanded] = useState(isExpanded)
    if (isExpanded && !hasEverExpanded) {
        setHasEverExpanded(true)
    }

    return (
        <div className={s.nodeWrapper}>
            <div
                className={`${s.nodeRow} ${isSelected ? s.selected : ''} ${node.disabled ? s.disabled : ''}`}
                onClick={(e) => onRowClick(node, e)}
                onDoubleClick={() => onRowDoubleClick(node)}
                role="treeitem"
                aria-expanded={isLeaf ? undefined : isExpanded}
                aria-selected={isSelected}
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
}: TreeProps) {
    // 展开状态支持受控与非受控
    const [internalExpandedKeys, setInternalExpandedKeys] = useState<string[]>(defaultExpandedKeys)
    const expandedKeys = propExpandedKeys !== undefined ? propExpandedKeys : internalExpandedKeys

    // 选中状态支持受控与非受控
    const [internalSelectedKeys, setInternalSelectedKeys] = useState<string[]>(defaultSelectedKeys)
    const selectedKeys = propSelectedKeys !== undefined ? propSelectedKeys : internalSelectedKeys

    // 单个节点的异步加载中状态
    const [loadingKeys, setLoadingKeys] = useState<Set<string>>(new Set())

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

    if (!treeData || treeData.length === 0) {
        return (
            <div className={`${s.tree} ${className}`} style={style}>
                <div className={s.empty}>{emptyText}</div>
            </div>
        )
    }

    return (
        <div className={`${s.tree} ${className}`} style={style} role="tree">
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
                />
            ))}
        </div>
    )
}
