import React, { useState, useEffect, useMemo, useCallback } from 'react'
import {
    Input,
    Button,
    Tooltip,
    Modal,
    message,
    Segmented,
    Space,
} from 'antd'
import {
    BookOpen,
    FileText,
    Folder,
    FolderPlus,
    FilePlus,
    RotateCw,
    Save,
    FolderOpen,
    Eye,
    Edit3,
    Columns,
    Trash2,
    Edit2,
    Sparkles,
    Search,
    Check,
} from 'lucide-react'
import Tree, { TreeNodeData } from '@/components/common/Tree'
import MarkdownViewer from '@/components/common/MarkdownViewer'
import CodeEditor from '@/components/CodeEditor'
import ContextMenu, { closedMenu, MenuState, MenuItem } from '@/components/ContextMenu'
import { ConfirmModal, ConfirmState } from '@/components/Modal'
import { API } from '@/api'
import { WikiNode } from '@/types'
import { useSession } from '@/contexts/SessionContext'
import s from './WikiClient.module.less'

interface Props {
    onClose?: () => void
}

type ViewMode = 'preview' | 'edit' | 'split'

export default function WikiClient({ onClose }: Props) {
    const { sessions, activeTarget } = useSession()
    const [treeData, setTreeData] = useState<WikiNode[]>([])
    const [wikiDir, setWikiDir] = useState<string>('')
    const [loading, setLoading] = useState<boolean>(false)
    const [searchKeyword, setSearchKeyword] = useState<string>('')

    // 当前选中的节点与文档内容
    const [selectedPath, setSelectedPath] = useState<string | null>(null)
    const [selectedNode, setSelectedNode] = useState<WikiNode | null>(null)
    const [content, setContent] = useState<string>('')
    const [originalContent, setOriginalContent] = useState<string>('')
    const [saving, setSaving] = useState<boolean>(false)
    const [viewMode, setViewMode] = useState<ViewMode>('preview')

    // 目录树展开节点
    const [expandedKeys, setExpandedKeys] = useState<string[]>([])

    // 右键菜单
    const [contextMenu, setContextMenu] = useState<MenuState>(closedMenu)

    // 新建 / 重命名弹窗
    const [nameModal, setNameModal] = useState<{
        open: boolean
        type: 'createFile' | 'createFolder' | 'rename'
        title: string
        parentPath: string
        targetPath: string
        initialValue: string
    }>({
        open: false,
        type: 'createFile',
        title: '',
        parentPath: '',
        targetPath: '',
        initialValue: '',
    })
    const [nameInput, setNameInput] = useState<string>('')

    // 删除确认弹窗
    const [confirm, setConfirm] = useState<ConfirmState>({
        open: false,
        title: '',
        message: '',
    })

    // 提炼编译会话弹窗
    const [compileModalOpen, setCompileModalOpen] = useState<boolean>(false)
    const [compiling, setCompiling] = useState<boolean>(false)
    const [selectedSessionId, setSelectedSessionId] = useState<string>('agent_history')

    // 是否有未保存修改
    const isDirty = useMemo(() => {
        if (!selectedPath) return false
        return content !== originalContent
    }, [selectedPath, content, originalContent])

    // 加载 Wiki 目录与目录树
    const loadTree = useCallback(async (autoSelectFirst = false) => {
        setLoading(true)
        try {
            const [nodes, dir] = await Promise.all([
                API.wikiListTree(),
                API.wikiGetDir(),
            ])
            setTreeData(nodes || [])
            setWikiDir(dir || '')

            // 默认展开顶层所有文件夹
            if (nodes && nodes.length > 0) {
                const folderKeys = nodes
                    .filter((n) => n.is_folder)
                    .map((n) => n.rel_path)
                setExpandedKeys((prev) => Array.from(new Set([...prev, ...folderKeys])))

                // 如果未选中任何节点且要求自动选中，选中首篇文档
                if (autoSelectFirst && !selectedPath) {
                    const findFirstDoc = (list: WikiNode[]): WikiNode | null => {
                        for (const item of list) {
                            if (!item.is_folder) return item
                            if (item.children && item.children.length > 0) {
                                const sub = findFirstDoc(item.children)
                                if (sub) return sub
                            }
                        }
                        return null
                    }
                    const first = findFirstDoc(nodes)
                    if (first) {
                        void selectDoc(first)
                    }
                }
            }
        } catch (err: any) {
            message.error(`加载知识库失败: ${err?.message || String(err)}`)
        } finally {
            setLoading(false)
        }
    }, [selectedPath])

    useEffect(() => {
        void loadTree(true)
    }, [])

    // 选择并打开文档
    const selectDoc = async (node: WikiNode) => {
        if (node.is_folder) return
        if (isDirty) {
            const proceed = window.confirm('当前文档有未保存的修改，切换将丢失改动。是否继续？')
            if (!proceed) return
        }

        try {
            const text = await API.wikiReadPage(node.rel_path)
            setSelectedPath(node.rel_path)
            setSelectedNode(node)
            setContent(text)
            setOriginalContent(text)
        } catch (err: any) {
            message.error(`读取文档失败: ${err?.message || String(err)}`)
        }
    }

    // 保存当前文档
    const handleSave = async () => {
        if (!selectedPath || !isDirty) return
        setSaving(true)
        try {
            await API.wikiSavePage(selectedPath, content)
            setOriginalContent(content)
            message.success('已保存到本地')
            // 静默更新树信息
            void loadTree(false)
        } catch (err: any) {
            message.error(`保存失败: ${err?.message || String(err)}`)
        } finally {
            setSaving(false)
        }
    }

    // 快捷键监听 (Ctrl+S / Cmd+S)
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
                e.preventDefault()
                void handleSave()
            }
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [handleSave])

    // 打开系统文件管理器
    const handleOpenDir = async () => {
        try {
            await API.wikiOpenDir()
        } catch (err: any) {
            message.error(`打开本地目录失败: ${err?.message || String(err)}`)
        }
    }

    // 创建或重命名弹窗确认
    const handleConfirmNameModal = async () => {
        const val = nameInput.trim()
        if (!val) {
            message.warning('名称不能为空')
            return
        }

        try {
            if (nameModal.type === 'createFile') {
                const finalName = val.endsWith('.md') ? val : `${val}.md`
                const createdPath = await API.wikiCreateNode(nameModal.parentPath, finalName, false)
                message.success('文档创建成功')
                setNameModal((prev) => ({ ...prev, open: false }))
                await loadTree(false)
                // 自动打开新文档
                const node: WikiNode = {
                    id: createdPath,
                    name: finalName,
                    rel_path: createdPath,
                    is_folder: false,
                    updated_at: Math.floor(Date.now() / 1000),
                }
                void selectDoc(node)
            } else if (nameModal.type === 'createFolder') {
                await API.wikiCreateNode(nameModal.parentPath, val, true)
                message.success('分组创建成功')
                setNameModal((prev) => ({ ...prev, open: false }))
                await loadTree(false)
            } else if (nameModal.type === 'rename') {
                // 计算新相对路径
                const parts = nameModal.targetPath.split('/')
                parts[parts.length - 1] = val
                const newRelPath = parts.join('/')
                await API.wikiRenameNode(nameModal.targetPath, newRelPath)
                message.success('重命名成功')
                setNameModal((prev) => ({ ...prev, open: false }))
                if (selectedPath === nameModal.targetPath) {
                    setSelectedPath(newRelPath)
                    if (selectedNode) {
                        setSelectedNode({ ...selectedNode, rel_path: newRelPath, name: val })
                    }
                }
                await loadTree(false)
            }
        } catch (err: any) {
            message.error(`操作失败: ${err?.message || String(err)}`)
        }
    }

    // 删除节点
    const handleDeleteNode = (relPath: string, isFolder: boolean) => {
        setConfirm({
            open: true,
            title: isFolder ? '删除知识库分组' : '删除知识库文档',
            danger: true,
            confirmText: '确认删除',
            message: `确定要删除 ${isFolder ? '分组' : '文档'} "${relPath}" 吗？此操作无法撤销。`,
            onConfirm: async () => {
                try {
                    await API.wikiDeleteNode(relPath)
                    message.success('删除成功')
                    if (selectedPath === relPath || (isFolder && selectedPath?.startsWith(relPath + '/'))) {
                        setSelectedPath(null)
                        setSelectedNode(null)
                        setContent('')
                        setOriginalContent('')
                    }
                    await loadTree(false)
                } catch (err: any) {
                    message.error(`删除失败: ${err?.message || String(err)}`)
                } finally {
                    setConfirm({ open: false, title: '', message: '' })
                }
            },
        })
    }

    // 执行会话编译提炼
    const handleCompileSession = async () => {
        setCompiling(true)
        try {
            // 获取消息
            let msgs: any[] = []
            if (selectedSessionId === 'agent_history') {
                msgs = await API.agentGetHistory()
            } else {
                msgs = await API.agentGetSessionMessages(selectedSessionId)
            }

            if (!msgs || msgs.length === 0) {
                message.warning('当前选中的会话没有任何消息记录')
                setCompiling(false)
                return
            }

            // 转换为 FrontendMessage 格式
            const formattedMsgs = msgs.map((m: any) => ({
                id: m.id || String(Date.now()),
                role: m.role || 'user',
                content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
                timestamp: m.timestamp || Date.now(),
            }))

            message.loading({ content: 'AI 正在分析并提炼会话中的关键知识...', key: 'compile_wiki', duration: 0 })
            const resultMsg = await API.wikiCompileSession(selectedSessionId, formattedMsgs)
            message.success({ content: resultMsg || '会话已提炼编译并写入知识库', key: 'compile_wiki', duration: 3 })
            setCompileModalOpen(false)
            await loadTree(false)
        } catch (err: any) {
            message.error({ content: `编译提炼失败: ${err?.message || String(err)}`, key: 'compile_wiki' })
        } finally {
            setCompiling(false)
        }
    }

    // 递归转换 WikiNode 为 TreeNodeData 并支持关键字过滤
    const treeNodes: TreeNodeData[] = useMemo(() => {
        const kw = searchKeyword.trim().toLowerCase()

        const filterAndConvert = (nodes: WikiNode[]): TreeNodeData[] => {
            const res: TreeNodeData[] = []
            for (const node of nodes) {
                const matchSelf = !kw || node.name.toLowerCase().includes(kw) || node.rel_path.toLowerCase().includes(kw)
                let childNodes: TreeNodeData[] = []
                if (node.is_folder && node.children) {
                    childNodes = filterAndConvert(node.children)
                }

                if (matchSelf || childNodes.length > 0) {
                    res.push({
                        key: node.rel_path,
                        title: node.name,
                        isLeaf: !node.is_folder,
                        icon: node.is_folder ? (
                            <Folder size={14} style={{ color: '#3370ff' }} />
                        ) : (
                            <FileText size={14} style={{ color: '#667085' }} />
                        ),
                        children: node.is_folder ? childNodes : undefined,
                        raw: node,
                    })
                }
            }
            return res
        }

        return filterAndConvert(treeData)
    }, [treeData, searchKeyword])

    // 右键菜单打开
    const handleContextMenu = (e: React.MouseEvent, node: WikiNode) => {
        e.preventDefault()
        e.stopPropagation()

        const items: MenuItem[] = []

        if (node.is_folder) {
            items.push(
                {
                    key: 'create_child_file',
                    label: '新建子文档',
                    icon: <FilePlus size={13} />,
                    onClick: () => {
                        setNameInput('')
                        setNameModal({
                            open: true,
                            type: 'createFile',
                            title: `在 "${node.name}" 下新建文档`,
                            parentPath: node.rel_path,
                            targetPath: '',
                            initialValue: '',
                        })
                    },
                },
                {
                    key: 'create_child_folder',
                    label: '新建子分组',
                    icon: <FolderPlus size={13} />,
                    onClick: () => {
                        setNameInput('')
                        setNameModal({
                            open: true,
                            type: 'createFolder',
                            title: `在 "${node.name}" 下新建分组`,
                            parentPath: node.rel_path,
                            targetPath: '',
                            initialValue: '',
                        })
                    },
                },
                { key: 'sep_1', label: '', divider: true }
            )
        }

        items.push(
            {
                key: 'rename',
                label: '重命名',
                icon: <Edit2 size={13} />,
                onClick: () => {
                    setNameInput(node.name)
                    setNameModal({
                        open: true,
                        type: 'rename',
                        title: `重命名 ${node.is_folder ? '分组' : '文档'}`,
                        parentPath: '',
                        targetPath: node.rel_path,
                        initialValue: node.name,
                    })
                },
            },
            {
                key: 'delete',
                label: '删除',
                icon: <Trash2 size={13} />,
                danger: true,
                onClick: () => handleDeleteNode(node.rel_path, node.is_folder),
            }
        )

        setContextMenu({
            open: true,
            x: e.clientX,
            y: e.clientY,
            items,
        })
    }

    // 统计数据
    const stats = useMemo(() => {
        let docs = 0
        let folders = 0
        const walk = (nodes: WikiNode[]) => {
            for (const n of nodes) {
                if (n.is_folder) {
                    folders++
                    if (n.children) walk(n.children)
                } else {
                    docs++
                }
            }
        }
        walk(treeData)
        return { docs, folders }
    }, [treeData])

    return (
        <div className={s.wikiContainer}>
            {/* 左侧文档树侧边栏 */}
            <div className={s.sidebar}>
                <div className={s.sidebarHeader}>
                    <div className={s.headerTitle}>
                        <BookOpen size={16} className={s.icon} />
                        <span>知识库 (Wiki)</span>
                    </div>
                    <div className={s.headerActions}>
                        <Tooltip title="新建文档">
                            <Button
                                size="small"
                                type="text"
                                icon={<FilePlus size={14} />}
                                onClick={() => {
                                    setNameInput('')
                                    setNameModal({
                                        open: true,
                                        type: 'createFile',
                                        title: '新建根目录文档',
                                        parentPath: '',
                                        targetPath: '',
                                        initialValue: '',
                                    })
                                }}
                            />
                        </Tooltip>
                        <Tooltip title="新建分组">
                            <Button
                                size="small"
                                type="text"
                                icon={<FolderPlus size={14} />}
                                onClick={() => {
                                    setNameInput('')
                                    setNameModal({
                                        open: true,
                                        type: 'createFolder',
                                        title: '新建根目录分组',
                                        parentPath: '',
                                        targetPath: '',
                                        initialValue: '',
                                    })
                                }}
                            />
                        </Tooltip>
                        <Tooltip title="刷新列表">
                            <Button
                                size="small"
                                type="text"
                                icon={<RotateCw size={14} className={loading ? 'anticon-spin' : ''} />}
                                onClick={() => void loadTree(false)}
                            />
                        </Tooltip>
                        <Tooltip title="在系统资源管理器打开">
                            <Button
                                size="small"
                                type="text"
                                icon={<FolderOpen size={14} />}
                                onClick={handleOpenDir}
                            />
                        </Tooltip>
                    </div>
                </div>

                <div className={s.searchWrap}>
                    <Input
                        placeholder="搜索知识文档..."
                        prefix={<Search size={13} style={{ color: '#98a2b3' }} />}
                        value={searchKeyword}
                        onChange={(e) => setSearchKeyword(e.target.value)}
                        allowClear
                        size="small"
                    />
                </div>

                <div className={s.treeWrap}>
                    <Tree
                        treeData={treeNodes}
                        selectedKeys={selectedPath ? [selectedPath] : []}
                        expandedKeys={expandedKeys}
                        onExpand={(keys) => setExpandedKeys(keys)}
                        onSelect={(_, { node }) => {
                            if (node.raw) {
                                void selectDoc(node.raw)
                            }
                        }}
                        titleRender={(node) => (
                            <span
                                onContextMenu={(e) => {
                                    if (node.raw) handleContextMenu(e, node.raw)
                                }}
                                style={{ flex: 1, userSelect: 'none' }}
                            >
                                {node.title}
                            </span>
                        )}
                        emptyText="暂无知识库文档"
                    />
                </div>

                <div className={s.sidebarFooter}>
                    <Tooltip title={`本地路径: ${wikiDir}`}>
                        <span className={s.footerPath} onClick={handleOpenDir}>
                            {wikiDir || '本地存储'}
                        </span>
                    </Tooltip>
                    <span>{stats.docs} 篇文档</span>
                </div>
            </div>

            {/* 右侧主工作区 */}
            <div className={s.mainArea}>
                {selectedNode ? (
                    <>
                        <div className={s.topBar}>
                            <div className={s.docMeta}>
                                <FileText size={16} style={{ color: '#3370ff' }} />
                                <span className={s.docTitle}>{selectedNode.name}</span>
                                {isDirty && <span className={s.dirtyDot} title="存在未保存更改" />}
                                <span className={s.docPath}>{selectedNode.rel_path}</span>
                            </div>

                            <div className={s.topActions}>
                                <span className={s.metaInfo}>
                                    {content.length} 字
                                </span>

                                <Segmented
                                    size="small"
                                    value={viewMode}
                                    onChange={(v) => setViewMode(v as ViewMode)}
                                    options={[
                                        { value: 'preview', icon: <Eye size={13} />, label: '预览' },
                                        { value: 'edit', icon: <Edit3 size={13} />, label: '编辑' },
                                        { value: 'split', icon: <Columns size={13} />, label: '分屏' },
                                    ]}
                                />

                                <Tooltip title="从对话提炼知识到 Wiki (Compilation over Retrieval)">
                                    <Button
                                        size="small"
                                        icon={<Sparkles size={13} />}
                                        onClick={() => setCompileModalOpen(true)}
                                    >
                                        会话提炼
                                    </Button>
                                </Tooltip>

                                <Button
                                    type={isDirty ? 'primary' : 'default'}
                                    size="small"
                                    icon={<Save size={13} />}
                                    loading={saving}
                                    onClick={handleSave}
                                    disabled={!isDirty}
                                >
                                    {isDirty ? '保存' : '已保存'}
                                </Button>
                            </div>
                        </div>

                        <div className={s.workArea}>
                            {viewMode === 'preview' && (
                                <div className={s.previewOnly}>
                                    <MarkdownViewer content={content} />
                                </div>
                            )}

                            {viewMode === 'edit' && (
                                <div className={s.editOnly}>
                                    <CodeEditor
                                        value={content}
                                        onChange={(val) => setContent(val)}
                                        lang="plain"
                                        height="100%"
                                        bordered={false}
                                    />
                                </div>
                            )}

                            {viewMode === 'split' && (
                                <div className={s.splitContainer}>
                                    <div className={s.splitEdit}>
                                        <CodeEditor
                                            value={content}
                                            onChange={(val) => setContent(val)}
                                            lang="plain"
                                            height="100%"
                                            bordered={false}
                                        />
                                    </div>
                                    <div className={s.splitPreview}>
                                        <MarkdownViewer content={content} />
                                    </div>
                                </div>
                            )}
                        </div>
                    </>
                ) : (
                    <div className={s.emptyState}>
                        <BookOpen size={48} className={s.emptyIcon} />
                        <div className={s.emptyTitle}>LLM 知识库与记忆系统</div>
                        <div className={s.emptyDesc}>
                            采用 <strong>Compilation over Retrieval</strong>（编译演进而非盲目检索）思想，
                            本地 Markdown 纯文件存储，人类与 AI 共同演进。
                            System Prompt 自动感知全局目录概要，AI 可自主调取详细记忆。
                        </div>
                        <div className={s.emptyActions}>
                            <Button
                                type="primary"
                                icon={<FilePlus size={14} />}
                                onClick={() => {
                                    setNameInput('')
                                    setNameModal({
                                        open: true,
                                        type: 'createFile',
                                        title: '新建文档',
                                        parentPath: '',
                                        targetPath: '',
                                        initialValue: '',
                                    })
                                }}
                            >
                                新建文档
                            </Button>
                            <Button
                                icon={<FolderOpen size={14} />}
                                onClick={handleOpenDir}
                            >
                                打开存储目录
                            </Button>
                        </div>
                    </div>
                )}
            </div>

            {/* 右键菜单 */}
            <ContextMenu state={contextMenu} onClose={() => setContextMenu(closedMenu)} />

            {/* 新建/重命名弹窗 */}
            <Modal
                title={nameModal.title}
                open={nameModal.open}
                onOk={handleConfirmNameModal}
                onCancel={() => setNameModal((prev) => ({ ...prev, open: false }))}
                okText="确定"
                cancelText="取消"
                destroyOnClose
            >
                <div style={{ marginTop: 12 }}>
                    <Input
                        placeholder={
                            nameModal.type === 'createFile'
                                ? '请输入文档名称 (如: architecture.md)'
                                : '请输入名称'
                        }
                        value={nameInput}
                        onChange={(e) => setNameInput(e.target.value)}
                        onPressEnter={handleConfirmNameModal}
                        autoFocus
                    />
                </div>
            </Modal>

            {/* 删除确认弹窗 */}
            <ConfirmModal state={confirm} onCancel={() => setConfirm({ open: false, title: '', message: '' })} />

            {/* 会话提炼编译弹窗 */}
            <Modal
                title="提炼会话到知识库 (LLM Wiki Compile)"
                open={compileModalOpen}
                onOk={handleCompileSession}
                onCancel={() => setCompileModalOpen(false)}
                okText="开始提炼编译"
                cancelText="取消"
                confirmLoading={compiling}
            >
                <div style={{ padding: '8px 0', display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <p style={{ color: '#667085', fontSize: 13, lineHeight: 1.6, margin: 0 }}>
                        大模型将全面阅读该会话的上下文，提取并提炼关键架构设计、运维踩坑、环境凭据或配置规则，智能合并或新增到 Wiki 知识库中。
                    </p>
                    <div>
                        <span style={{ fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 6 }}>
                            选择待提炼的会话来源:
                        </span>
                        <Segmented
                            block
                            value={selectedSessionId}
                            onChange={(val) => setSelectedSessionId(String(val))}
                            options={[
                                { label: 'AI Agent 历史会话', value: 'agent_history' },
                                ...(activeTarget?.id ? [{ label: `当前会话 (${activeTarget.kind})`, value: activeTarget.id }] : []),
                            ]}
                        />
                    </div>
                </div>
            </Modal>
        </div>
    )
}
