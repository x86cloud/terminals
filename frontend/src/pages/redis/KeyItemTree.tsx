import React from 'react'
import { Button, Tooltip, Dropdown, App } from 'antd'
import { FileText, Folder, Trash2, Copy } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { KeyTreeNode, TYPE_COLOR, TYPE_SHORT_LABEL } from './redisTypes'
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
    const { t: tr } = useTranslation('redis')
    const { message } = App.useApp()
    const handleCopy = (keyName: string) => {
        navigator.clipboard.writeText(keyName)
        message.success(tr('keys.copiedKey'))
    }

    return (
        <>
            {nodes.map((node) => {
                const isExpanded = expandedKeys.has(node.key)
                const isSelected = node.isLeaf && node.fullKey === selected
                const typeStyle = node.type ? TYPE_COLOR[node.type] : null

                const menuItems = node.isLeaf && node.fullKey
                    ? [
                          {
                              key: 'copy',
                              label: tr('keys.copyKey'),
                              icon: <Copy size={13} />,
                              onClick: () => handleCopy(node.fullKey!),
                          },
                          {
                              type: 'divider' as const,
                          },
                          {
                              key: 'delete',
                              danger: true,
                              label: tr('keys.deleteKey'),
                              icon: <Trash2 size={13} />,
                              onClick: () => onDeleteKey(node.fullKey!),
                          },
                      ]
                    : [
                          {
                              key: 'deleteFolder',
                              danger: true,
                              label: tr('keys.deleteFolder', { count: node.count }),
                              icon: <Trash2 size={13} />,
                              onClick: () => onDeleteFolder(node),
                          },
                      ]

                return (
                    <React.Fragment key={node.key}>
                        <Dropdown menu={{ items: menuItems }} trigger={['contextMenu']}>
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

                                {node.isLeaf && node.type && typeStyle && (
                                    <span
                                        className={t.typePill}
                                        style={{
                                            backgroundColor: typeStyle.bg,
                                            color: typeStyle.text,
                                            border: `1px solid ${typeStyle.border}`,
                                        }}
                                    >
                                        {TYPE_SHORT_LABEL[node.type] || node.type.toUpperCase()}
                                    </span>
                                )}

                                {!node.isLeaf && <span className={t.treeCount}>({node.count})</span>}

                                {!node.isLeaf ? (
                                    <Tooltip title={tr('keys.deleteFolderTooltip', { name: node.name, count: node.count })}>
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
                                    <Tooltip title={tr('keys.deleteKeyTooltip', { key: node.fullKey })}>
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
                        </Dropdown>

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
