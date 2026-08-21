import React from 'react'
import { Button, Tooltip } from 'antd'
import { FileText, Folder, Trash2 } from 'lucide-react'
import { KeyTreeNode } from './redisTypes'
import t from './KeyItemTree.module.less'

export default function KeyItemTree({
    nodes,
    level = 0,
    selected,
    expandedKeys,
    onToggleExpand,
    onSelectKey,
    onDeleteFolder,
    onDeleteKey,
}: {
    nodes: KeyTreeNode[]
    level?: number
    selected: string | null
    expandedKeys: Set<string>
    onToggleExpand: (key: string) => void
    onSelectKey: (fullKey: string) => void
    onDeleteFolder: (node: KeyTreeNode) => void
    onDeleteKey: (fullKey: string) => void
}) {
    return (
        <>
            {nodes.map((node) => {
                const isExpanded = expandedKeys.has(node.key)
                const isSelected = node.isLeaf && node.fullKey === selected
                return (
                    <React.Fragment key={node.key}>
                        <div
                            className={`${t.treeRow} ${isSelected ? t.active : ''}`}
                            style={{ paddingLeft: `${level * 14 + 6}px` }}
                            onClick={() => {
                                if (node.isLeaf && node.fullKey) {
                                    onSelectKey(node.fullKey)
                                } else {
                                    onToggleExpand(node.key)
                                }
                            }}
                        >
                            {!node.isLeaf ? (
                                <span
                                    className={`${t.treeArrow} ${isExpanded ? t.open : ''}`}
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        onToggleExpand(node.key)
                                    }}
                                >
                                    ▶
                                </span>
                            ) : (
                                <span style={{ width: 14 }} />
                            )}
                            <span className={t.treeIcon}>
                                {node.isLeaf ? <FileText size={13} /> : <Folder size={13} />}
                            </span>
                            <span className={t.treeLabel} title={node.fullKey || node.name}>
                                {node.name}
                            </span>
                            {!node.isLeaf && <span className={t.treeCount}>({node.count})</span>}
                            {!node.isLeaf ? (
                                <Tooltip title={`批量删除 ${node.name} 下的 ${node.count} 个 Key`}>
                                    <Button
                                        size="small"
                                        type="text"
                                        danger
                                        icon={<Trash2 size={12} />}
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            onDeleteFolder(node)
                                        }}
                                    />
                                </Tooltip>
                            ) : (
                                <Tooltip title={`删除 ${node.fullKey}`}>
                                    <Button
                                        size="small"
                                        type="text"
                                        danger
                                        icon={<Trash2 size={12} />}
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            if (node.fullKey) onDeleteKey(node.fullKey)
                                        }}
                                    />
                                </Tooltip>
                            )}
                        </div>
                        {!node.isLeaf && isExpanded && node.children.length > 0 && (
                            <KeyItemTree
                                nodes={node.children}
                                level={level + 1}
                                selected={selected}
                                expandedKeys={expandedKeys}
                                onToggleExpand={onToggleExpand}
                                onSelectKey={onSelectKey}
                                onDeleteFolder={onDeleteFolder}
                                onDeleteKey={onDeleteKey}
                            />
                        )}
                    </React.Fragment>
                )
            })}
        </>
    )
}
