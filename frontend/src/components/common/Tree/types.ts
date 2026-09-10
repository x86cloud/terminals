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

export interface TreeDropInfo {
    event: React.DragEvent
    node: TreeNodeData
    dragNode: TreeNodeData
    dropPosition: number // -1 (top gap), 0 (inside folder), 1 (bottom gap)
    dropToGap: boolean
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
    draggable?: boolean | { icon?: boolean; nodeDraggable?: (node: TreeNodeData) => boolean }
    onDrop?: (info: TreeDropInfo) => void
    onDragStart?: (info: { event: React.DragEvent; node: TreeNodeData }) => void
    onDragEnd?: (info: { event: React.DragEvent; node: TreeNodeData }) => void
}
