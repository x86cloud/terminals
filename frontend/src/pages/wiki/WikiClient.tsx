import { useState, useEffect, useMemo, useCallback, useRef, useDeferredValue } from 'react'
import {
    Input,
    Button,
    Tooltip,
    Modal,
    App,
    Segmented,
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
} from 'lucide-react'
import Tree, { TreeNodeData } from '@/components/common/Tree'
import MarkdownViewer from '@/components/common/MarkdownViewer'
import CodeEditor from '@/components/CodeEditor'
import ContextMenu, { closedMenu, MenuState, MenuItem } from '@/components/ContextMenu'
import { ConfirmModal } from '@/components/Modal'
import { API } from '@/api'
import { WikiNode, FrontendMessage } from '@/types'
import { useSession } from '@/contexts/SessionContext'
import s from './WikiClient.module.less'

// 模块级静态图标单例，杜绝在递归树遍历时高频分配临时 JSX 对象与内联样式对象
const FOLDER_ICON = <Folder size={14} style={{ color: '#3370ff' }} />
const FILE_ICON = <FileText size={14} style={{ color: '#667085' }} />

function getErrorMessage(err: unknown): string {
    if (err instanceof Error) return err.message
    return String(err)
}

function confirmSwitchDoc(): Promise<boolean> {
    return new Promise((resolve) => {
        Modal.confirm({
            title: '未保存的修改',
            content: '当前文档有未保存的修改，切换将丢失改动。是否继续？',
            okText: '放弃修改并切换',
            okButtonProps: { danger: true },
            cancelText: '取消',
            centered: true,
            onOk: () => resolve(true),
            onCancel: () => resolve(false),
        })
    })
}

interface Props {
    onClose?: () => void
}

type ViewMode = 'preview' | 'edit' | 'split'

export default function WikiClient({ onClose }: Props) {
    const { message } = App.useApp()
    const { activeTarget } = useSession()

    // 挂载与单调递增请求 ID 守护，消除竞态与卸载后 setState 内存泄漏
    const isMountedRef = useRef<boolean>(true)
    const activeDocReqIdRef = useRef<number>(0)

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

    // 保持 selectedPath 的稳定 Ref，避免 loadTree 依赖 selectedPath 导致重构
    const selectedPathRef = useRef<string | null>(selectedPath)
    useEffect(() => {
        selectedPathRef.current = selectedPath
    }, [selectedPath])

    // 延迟渲染 Markdown 内容，避免编辑输入时全量频繁重建 AST 和大量垃圾对象
    const deferredContent = useDeferredValue(content)

    // 搜索词延迟响应，防止快速输入时主线程被 O(N) 递归树计算卡死
    const deferredKeyword = useDeferredValue(searchKeyword)

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
    const [submittingName, setSubmittingName] = useState<boolean>(false)

    // 删除目标数据状态（纯数据驱动，禁止在 State 中挂载包含闭包的异步回调函数）
    const [deleteTarget, setDeleteTarget] = useState<{
        relPath: string
        isFolder: boolean
    } | null>(null)
    const [deleting, setDeleting] = useState<boolean>(false)

    // 提炼编译会话弹窗
    const [compileModalOpen, setCompileModalOpen] = useState<boolean>(false)
    const [compiling, setCompiling] = useState<boolean>(false)
    const [selectedSessionId, setSelectedSessionId] = useState<string>('agent_history')

    // 是否有未保存修改
    const isDirty = useMemo(() => {
        if (!selectedPath) return false
        return content !== originalContent
    }, [selectedPath, content, originalContent])

    // 组件生命周期与挂载标记管理，并在卸载时自动销毁未关闭的全局提示
    useEffect(() => {
        isMountedRef.current = true
        return () => {
            isMountedRef.current = false
            activeDocReqIdRef.current += 1
            message.destroy('compile_wiki')
        }
    }, [])

    // 选择并打开文档（携带请求递增 ID 校验与未保存确认，防止竞态覆盖与数据丢失）
    const selectDoc = useCallback(async (node: WikiNode) => {
        if (node.is_folder) return
        if (isDirty) {
            const proceed = await confirmSwitchDoc()
            if (!proceed) return
        }

        const currentReqId = ++activeDocReqIdRef.current
        try {
            const text = await API.wikiReadPage(node.rel_path)
            if (!isMountedRef.current || currentReqId !== activeDocReqIdRef.current) {
                return
            }
            setSelectedPath(node.rel_path)
            setSelectedNode(node)
            setContent(text)
            setOriginalContent(text)
        } catch (err: unknown) {
            if (!isMountedRef.current || currentReqId !== activeDocReqIdRef.current) return
            message.error(`读取文档失败: ${getErrorMessage(err)}`)
        }
    }, [isDirty])

    // 加载 Wiki 目录与目录树
    const loadTree = useCallback(async (autoSelectFirst = false) => {
        setLoading(true)
        try {
            const [nodes, dir] = await Promise.all([
                API.wikiListTree(),
                API.wikiGetDir(),
            ])
            if (!isMountedRef.current) return
            const safeNodes = nodes || []
            setTreeData(safeNodes)
            setWikiDir(dir || '')

            // 默认展开顶层所有文件夹
            if (safeNodes.length > 0) {
                const folderKeys = safeNodes
                    .filter((n) => n.is_folder)
                    .map((n) => n.rel_path)
                setExpandedKeys((prev) => Array.from(new Set([...prev, ...folderKeys])))

                // 如果未选中任何节点且要求自动选中，选中首篇文档
                if (autoSelectFirst && !selectedPathRef.current) {
                    const findFirstDoc = (list: WikiNode[]): WikiNode | null => {
                        for (let i = 0; i < list.length; i++) {
                            const item = list[i]
                            if (!item.is_folder) return item
                            if (item.children && item.children.length > 0) {
                                const sub = findFirstDoc(item.children)
                                if (sub) return sub
                            }
                        }
                        return null
                    }
                    const first = findFirstDoc(safeNodes)
                    if (first) {
                        void selectDoc(first)
                    }
                }
            }
        } catch (err: unknown) {
            if (!isMountedRef.current) return
            message.error(`加载知识库失败: ${getErrorMessage(err)}`)
        } finally {
            if (isMountedRef.current) {
                setLoading(false)
            }
        }
    }, [selectDoc])

    useEffect(() => {
        void loadTree(true)
    }, [loadTree])

    // 保存当前文档
    const handleSave = useCallback(async () => {
        if (!selectedPath || !isDirty) return
        setSaving(true)
        try {
            await API.wikiSavePage(selectedPath, content)
            if (!isMountedRef.current) return
            setOriginalContent(content)
            message.success('已保存到本地')
            // 静默更新树信息
            void loadTree(false)
        } catch (err: unknown) {
            if (!isMountedRef.current) return
            message.error(`保存失败: ${getErrorMessage(err)}`)
        } finally {
            if (isMountedRef.current) {
                setSaving(false)
            }
        }
    }, [selectedPath, isDirty, content, loadTree])

    const saveRef = useRef(handleSave)
    useEffect(() => {
        saveRef.current = handleSave
    }, [handleSave])

    // 快捷键监听 (Ctrl+S / Cmd+S)，采用 AbortSignal 统一管理解绑与生命周期
    useEffect(() => {
        const ac = new AbortController()
        window.addEventListener('keydown', (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
                e.preventDefault()
                void saveRef.current()
            }
        }, { signal: ac.signal })

        return () => {
            ac.abort()
        }
    }, [])

    // 打开系统文件管理器
    const handleOpenDir = async () => {
        try {
            await API.wikiOpenDir()
        } catch (err: unknown) {
            message.error(`打开本地目录失败: ${getErrorMessage(err)}`)
        }
    }

    // 创建或重命名弹窗确认（修复子级相对路径重命名映射与重复提交问题）
    const handleConfirmNameModal = async () => {
        const val = nameInput.trim()
        if (!val) {
            message.warning('名称不能为空')
            return
        }

        setSubmittingName(true)
        try {
            if (nameModal.type === 'createFile') {
                const finalName = val.endsWith('.md') ? val : `${val}.md`
                const createdPath = await API.wikiCreateNode(nameModal.parentPath, finalName, false)
                if (!isMountedRef.current) return
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
                if (!isMountedRef.current) return
                message.success('分组创建成功')
                setNameModal((prev) => ({ ...prev, open: false }))
                await loadTree(false)
            } else if (nameModal.type === 'rename') {
                // 计算新相对路径
                const parts = nameModal.targetPath.split('/')
                parts[parts.length - 1] = val
                const newRelPath = parts.join('/')
                await API.wikiRenameNode(nameModal.targetPath, newRelPath)
                if (!isMountedRef.current) return
                message.success('重命名成功')
                setNameModal((prev) => ({ ...prev, open: false }))

                // 同步修正当前选中路径（包含文档本身及父级/祖先分组被重命名的子路径场景）
                if (selectedPath) {
                    if (selectedPath === nameModal.targetPath) {
                        setSelectedPath(newRelPath)
                        setSelectedNode((prev) => (prev ? { ...prev, rel_path: newRelPath, name: val } : null))
                    } else if (selectedPath.startsWith(nameModal.targetPath + '/')) {
                        const subPathSuffix = selectedPath.slice(nameModal.targetPath.length)
                        const updatedDocPath = newRelPath + subPathSuffix
                        setSelectedPath(updatedDocPath)
                        setSelectedNode((prev) => (prev ? { ...prev, rel_path: updatedDocPath } : null))
                    }
                }
                await loadTree(false)
            }
        } catch (err: unknown) {
            if (!isMountedRef.current) return
            message.error(`操作失败: ${getErrorMessage(err)}`)
        } finally {
            if (isMountedRef.current) {
                setSubmittingName(false)
            }
        }
    }

    // 删除节点触发
    const handleDeleteNode = useCallback((relPath: string, isFolder: boolean) => {
        setDeleteTarget({ relPath, isFolder })
    }, [])

    // 执行删除操作（稳定函数，不作为闭包存入 state）
    const handleExecuteDelete = useCallback(async () => {
        if (!deleteTarget) return
        const { relPath, isFolder } = deleteTarget
        setDeleting(true)
        try {
            await API.wikiDeleteNode(relPath)
            if (!isMountedRef.current) return
            message.success('删除成功')
            if (selectedPath === relPath || (isFolder && selectedPath?.startsWith(relPath + '/'))) {
                setSelectedPath(null)
                setSelectedNode(null)
                setContent('')
                setOriginalContent('')
            }
            await loadTree(false)
            setDeleteTarget(null)
        } catch (err: unknown) {
            if (!isMountedRef.current) return
            message.error(`删除失败: ${getErrorMessage(err)}`)
        } finally {
            if (isMountedRef.current) {
                setDeleting(false)
            }
        }
    }, [deleteTarget, selectedPath, loadTree])

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
            const formattedMsgs: FrontendMessage[] = msgs.map((m: any) => ({
                role: m.role || 'user',
                content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
                reasoningContent: m.reasoningContent || m.reasoning_content,
            }))

            message.loading({ content: 'AI 正在分析并提炼会话中的关键知识...', key: 'compile_wiki', duration: 0 })
            const resultMsg = await API.wikiCompileSession(selectedSessionId, formattedMsgs)
            if (!isMountedRef.current) return
            message.success({ content: resultMsg || '会话已提炼编译并写入知识库', key: 'compile_wiki', duration: 3 })
            setCompileModalOpen(false)
            await loadTree(false)
        } catch (err: unknown) {
            if (!isMountedRef.current) return
            message.error({ content: `编译提炼失败: ${getErrorMessage(err)}`, key: 'compile_wiki' })
        } finally {
            if (isMountedRef.current) {
                setCompiling(false)
            }
        }
    }

    // 递归转换 WikiNode 为 TreeNodeData 并支持关键字过滤（采用 useDeferredValue 降级与静态单例图标）
    const treeNodes: TreeNodeData[] = useMemo(() => {
        const kw = deferredKeyword.trim().toLowerCase()

        const filterAndConvert = (nodes: WikiNode[]): TreeNodeData[] => {
            const res: TreeNodeData[] = []
            for (let i = 0; i < nodes.length; i++) {
                const node = nodes[i]
                const matchSelf = !kw || node.name.toLowerCase().includes(kw) || node.rel_path.toLowerCase().includes(kw)
                let childNodes: TreeNodeData[] | undefined
                if (node.is_folder && node.children) {
                    const sub = filterAndConvert(node.children)
                    if (sub.length > 0) childNodes = sub
                }

                if (matchSelf || (childNodes && childNodes.length > 0)) {
                    res.push({
                        key: node.rel_path,
                        title: node.name,
                        isLeaf: !node.is_folder,
                        icon: node.is_folder ? FOLDER_ICON : FILE_ICON,
                        children: node.is_folder ? (childNodes || []) : undefined,
                        raw: node,
                    })
                }
            }
            return res
        }

        return filterAndConvert(treeData)
    }, [treeData, deferredKeyword])

    // 右键菜单打开
    const handleContextMenu = useCallback((e: React.MouseEvent, node: WikiNode) => {
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
    }, [handleDeleteNode])

    // 统计数据（轻量遍历，去除无用的 folders 计算）
    const stats = useMemo(() => {
        let docs = 0
        const walk = (nodes: WikiNode[]) => {
            for (let i = 0; i < nodes.length; i++) {
                const n = nodes[i]
                if (n.is_folder) {
                    if (n.children) walk(n.children)
                } else {
                    docs++
                }
            }
        }
        walk(treeData)
        return { docs }
    }, [treeData])

    // 树渲染性能护栏：稳定化选中的 keys 与回调引用，防止打字时整棵目录树无意义 Diff 重绘
    const selectedKeys = useMemo(() => (selectedPath ? [selectedPath] : []), [selectedPath])

    const handleExpand = useCallback((keys: string[]) => {
        setExpandedKeys(keys)
    }, [])

    const handleSelect = useCallback((_: any, { node }: { node: TreeNodeData }) => {
        if (node.raw) {
            void selectDoc(node.raw)
        }
    }, [selectDoc])

    const titleSpanStyle: React.CSSProperties = useMemo(() => ({ flex: 1, userSelect: 'none' }), [])

    const renderTreeTitle = useCallback((node: TreeNodeData) => (
        <span
            onContextMenu={(e) => {
                if (node.raw) handleContextMenu(e, node.raw)
            }}
            style={titleSpanStyle}
        >
            {node.title}
        </span>
    ), [handleContextMenu, titleSpanStyle])

    const handleCloseContextMenu = useCallback(() => {
        setContextMenu(closedMenu)
    }, [])

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
                        selectedKeys={selectedKeys}
                        expandedKeys={expandedKeys}
                        onExpand={handleExpand}
                        onSelect={handleSelect}
                        titleRender={renderTreeTitle}
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
                                    <MarkdownViewer content={deferredContent} />
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
                                        <MarkdownViewer content={deferredContent} />
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
            <ContextMenu state={contextMenu} onClose={handleCloseContextMenu} />

            {/* 新建/重命名弹窗 */}
            <Modal
                title={nameModal.title}
                open={nameModal.open}
                onOk={handleConfirmNameModal}
                onCancel={() => {
                    if (!submittingName) setNameModal((prev) => ({ ...prev, open: false }))
                }}
                okText="确定"
                cancelText="取消"
                confirmLoading={submittingName}
                destroyOnHidden
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
                        onPressEnter={() => {
                            if (!submittingName) void handleConfirmNameModal()
                        }}
                        disabled={submittingName}
                        autoFocus
                    />
                </div>
            </Modal>

            {/* 删除确认弹窗（纯数据驱动） */}
            <ConfirmModal
                state={{
                    open: !!deleteTarget,
                    title: deleteTarget?.isFolder ? '删除知识库分组' : '删除知识库文档',
                    danger: true,
                    confirmText: deleting ? '删除中...' : '确认删除',
                    message: deleteTarget
                        ? `确定要删除 ${deleteTarget.isFolder ? '分组' : '文档'} "${deleteTarget.relPath}" 吗？此操作无法撤销。`
                        : '',
                    onConfirm: handleExecuteDelete,
                }}
                onCancel={() => {
                    if (!deleting) setDeleteTarget(null)
                }}
            />

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
