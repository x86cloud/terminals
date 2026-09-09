import React from 'react'

export interface TreeNodeData {
    key: string
    title: React.ReactNode
    icon?: React.ReactNode
    isLeaf?: boolean
    children?: TreeNodeData[]
    disabled?: boolean
    raw?: any
    [key: string]: any
}

export interface TreeProps {
    treeData: TreeNodeData[]
    expandedKeys?: string[]
    defaultExpandedKeys?: string[]
    onExpand?: (expandedKeys: string[], info: { node: TreeNodeData; expanded: boolean }) => void
    selectedKeys?: string[]
    defaultSelectedKeys?: string[]
    onSelect?: (selectedKeys: string[], info: { node: TreeNodeData; selected: boolean; event: React.MouseEvent }) => void
    loadData?: (node: TreeNodeData) => Promise<void>
    titleRender?: (node: TreeNodeData) => React.ReactNode
    showIndentGuides?: boolean
    indent?: number
    className?: string
    style?: React.CSSProperties
    blockNode?: boolean
    showIcon?: boolean
    emptyText?: React.ReactNode
}
