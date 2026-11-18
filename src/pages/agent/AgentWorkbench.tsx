import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
    App,
    Button,
    Checkbox,
    Empty,
    Input,
    Modal,
    Popconfirm,
    Select,
    Space,
    Tag,
    Tooltip,
    Typography,
} from 'antd'
import {
    BookOpen,
    Brain,
    CheckSquare,
    ChevronDown,
    ChevronRight,
    Edit2,
    FilePlus,
    FileUp,
    Globe,
    Loader2,
    MessageSquare,
    Plus,
    Search,
    Send,
    Settings,
    Sparkles,
    Square,
    Trash2,
    Wrench,
} from 'lucide-react'
import { API, subscribe } from '@/api'
import {
    AgentMessageRecord,
    AgentSessionRecord,
    AiModelItem,
    AppSettings,
    DistillDraft,
    KnowledgeNote,
    KnowledgeSearchHit,
    ReActStepRecord,
} from '@/types'
import { errorMessage } from '@/utils'
import { MarkdownViewer } from '@/components/common/MarkdownViewer'
import DistillPreviewModal from './DistillPreviewModal'
import KnowledgeDetailView from './KnowledgeDetailView'
import s from './AgentWorkbench.module.less'

const { Text } = Typography
const { TextArea } = Input

interface Props {
    settings: AppSettings
}

interface LiveStreamState {
    sessionId: string
    prompt: string
    content: string
    reasoning: string
    steps: ReActStepRecord[]
}

const STARTER_PROMPTS = [
    '帮我整理今天的工作重点与待办优先级，给我一个清晰的行动清单。',
    '联网搜索最近一周 Rust / Tauri v2 或前端生态的重要更新并总结要点。',
    '结合我的个人知识库，回顾我之前沉淀过的相关笔记并帮我梳理脉络。',
    '用通俗易懂的语言对比向量检索与全文检索在个人知识库中的优缺点。',
]

function emptyDraftNote(): KnowledgeNote {
    return {
        id: '',
        title: '新建知识笔记',
        summary: '',
        tags: [],
        content: '',
        sourceType: 'manual',
        sourceRefs: [],
        filePath: '',
        createdAt: 0,
        updatedAt: 0,
    }
}

export default function AgentWorkbench({ settings }: Props) {
    const { message } = App.useApp()

    const [sidebarMode, setSidebarMode] = useState<'chat' | 'kb'>('chat')

    // ---- Models ----
    const modelOptions: AiModelItem[] = useMemo(() => {
        if (settings.aiModels && settings.aiModels.length > 0) {
            return settings.aiModels
        }
        return [
            {
                id: settings.activeModelId || 'default',
                name: settings.aiModel || '默认模型',
                model: settings.aiModel || 'deepseek-v4-flash',
                baseUrl: settings.aiBaseUrl || '',
                apiKey: settings.aiApiKey || '',
                contextTokens: settings.aiModelContextTokens || 65536,
                temperature: settings.aiTemperature ?? 0.7,
                enableMultimodal: !!settings.aiEnableMultimodal,
            },
        ]
    }, [settings])

    const [selectedModelId, setSelectedModelId] = useState<string>(
        settings.activeModelId || modelOptions[0]?.id || ''
    )

    useEffect(() => {
        if (!selectedModelId || !modelOptions.some((m) => m.id === selectedModelId)) {
            setSelectedModelId(settings.activeModelId || modelOptions[0]?.id || '')
        }
    }, [modelOptions, settings.activeModelId, selectedModelId])

    // ---- Chat State ----
    const [sessions, setSessions] = useState<AgentSessionRecord[]>([])
    const [activeSessionId, setActiveSessionId] = useState<string>('')
    const [messages, setMessages] = useState<AgentMessageRecord[]>([])
    const [sessionKeyword, setSessionKeyword] = useState('')

    const [webSearch, setWebSearch] = useState(true)
    const [useKnowledge, setUseKnowledge] = useState(true)
    const [inputText, setInputText] = useState('')
    const [sending, setSending] = useState(false)
    const [liveStream, setLiveStream] = useState<LiveStreamState | null>(null)

    const [expandedReasoning, setExpandedReasoning] = useState<Record<string, boolean>>({})
    const [expandedSteps, setExpandedSteps] = useState<Record<string, boolean>>({})

    // Rename Session Modal
    const [renameModal, setRenameModal] = useState<{ open: boolean; id: string; title: string }>({
        open: false,
        id: '',
        title: '',
    })

    // ---- Distillation State ----
    const [batchSessionMode, setBatchSessionMode] = useState(false)
    const [selectedSessionIds, setSelectedSessionIds] = useState<string[]>([])
    const [selectMsgMode, setSelectMsgMode] = useState(false)
    const [selectedMsgIds, setSelectedMsgIds] = useState<string[]>([])
    const [distilling, setDistilling] = useState(false)
    const [distillDraft, setDistillDraft] = useState<DistillDraft | null>(null)
    const [distillModalOpen, setDistillModalOpen] = useState(false)

    // ---- Knowledge Base State ----
    const [notes, setNotes] = useState<KnowledgeNote[]>([])
    const [kbKeyword, setKbKeyword] = useState('')
    const [kbTagFilter, setKbTagFilter] = useState<string>('')
    const [kbSearchHits, setKbSearchHits] = useState<KnowledgeSearchHit[] | null>(null)
    const [activeNote, setActiveNote] = useState<KnowledgeNote | null>(null)
    const [importing, setImporting] = useState(false)

    const chatEndRef = useRef<HTMLDivElement | null>(null)
    const activeSessionIdRef = useRef(activeSessionId)
    activeSessionIdRef.current = activeSessionId

    const loadSessions = useCallback(async (selectId?: string) => {
        try {
            const list = await API.agentListSessions()
            setSessions(list)
            if (selectId) {
                setActiveSessionId(selectId)
            } else if (!activeSessionIdRef.current && list.length > 0) {
                setActiveSessionId(list[0].id)
            }
        } catch (err) {
            message.error(`加载会话失败: ${errorMessage(err)}`)
        }
    }, [message])

    const loadMessages = useCallback(async (sid: string) => {
        if (!sid) {
            setMessages([])
            return
        }
        try {
            const list = await API.agentGetSessionMessages(sid)
            setMessages(list)
        } catch (err) {
            message.error(`加载消息失败: ${errorMessage(err)}`)
        }
    }, [message])

    const loadNotes = useCallback(async (tag?: string) => {
        try {
            const list = await API.agentKbList(tag || undefined)
            setNotes(list)
            return list
        } catch (err) {
            message.error(`加载知识库失败: ${errorMessage(err)}`)
            return []
        }
    }, [message])

    useEffect(() => {
        void loadSessions()
        void loadNotes()
    }, [loadSessions, loadNotes])

    // Sync active session prefs & messages when activeSessionId changes
    useEffect(() => {
        setSelectMsgMode(false)
        setSelectedMsgIds([])
        if (!activeSessionId) {
            setMessages([])
            return
        }
        const sess = sessions.find((item) => item.id === activeSessionId)
        if (sess) {
            setWebSearch(sess.webSearch)
            setUseKnowledge(sess.useKnowledge)
            if (sess.modelId && modelOptions.some((m) => m.id === sess.modelId)) {
                setSelectedModelId(sess.modelId)
            }
        }
        void loadMessages(activeSessionId)
    }, [activeSessionId]) // eslint-disable-line react-hooks/exhaustive-deps

    // Subscribe to backend agent events & updates
    useEffect(() => {
        const unsubEvent = subscribe('agent:event', (ev: any) => {
            if (!ev || ev.session_id !== activeSessionIdRef.current) return
            const type = ev.type
            const payload = ev.payload || {}
            if (type === 'chat_chunk') {
                const chunk = String(payload.chunk || '')
                if (!chunk) return
                setLiveStream((prev) =>
                    prev && prev.sessionId === ev.session_id
                        ? { ...prev, content: prev.content + chunk }
                        : prev
                )
            } else if (type === 'reasoning_chunk') {
                const chunk = String(payload.chunk || '')
                if (!chunk) return
                setLiveStream((prev) =>
                    prev && prev.sessionId === ev.session_id
                        ? { ...prev, reasoning: prev.reasoning + chunk }
                        : prev
                )
            } else if (type === 'step_start') {
                const stepId = String(payload.step_id || '')
                const turn = Number(payload.turn || 1)
                const toolName = String(payload.tool_name || '')
                const args = String(payload.arguments || '')
                setLiveStream((prev) => {
                    if (!prev || prev.sessionId !== ev.session_id) return prev
                    const nextStep: ReActStepRecord = {
                        id: stepId,
                        turn,
                        stepType: 'action',
                        title: toolName,
                        content: args,
                        status: 'running',
                        durationMs: 0,
                        timestamp: Date.now(),
                    }
                    return { ...prev, steps: [...prev.steps, nextStep] }
                })
            } else if (type === 'step_end') {
                const stepId = String(payload.step_id || '')
                const status = String(payload.status || 'completed')
                const durationMs = Number(payload.duration_ms || 0)
                const observation = String(payload.observation || '')
                setLiveStream((prev) => {
                    if (!prev || prev.sessionId !== ev.session_id) return prev
                    return {
                        ...prev,
                        steps: prev.steps.map((st) =>
                            st.id === stepId
                                ? { ...st, status, durationMs, content: observation }
                                : st
                        ),
                    }
                })
            }
        })

        const unsubSess = subscribe('agent:session-updated', () => {
            void loadSessions()
        })

        const unsubKb = subscribe('agent:kb-updated', () => {
            void loadNotes(kbTagFilter)
        })

        return () => {
            unsubEvent()
            unsubSess()
            unsubKb()
        }
    }, [loadSessions, loadNotes, kbTagFilter])

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages, liveStream?.content, liveStream?.reasoning, liveStream?.steps.length])

    // Search Knowledge Base
    useEffect(() => {
        const kw = kbKeyword.trim()
        if (!kw && !kbTagFilter) {
            setKbSearchHits(null)
            return
        }
        const timer = window.setTimeout(() => {
            API.agentKbSearch(kw, kbTagFilter || undefined, 50)
                .then((hits) => setKbSearchHits(hits))
                .catch(() => setKbSearchHits(null))
        }, 180)
        return () => window.clearTimeout(timer)
    }, [kbKeyword, kbTagFilter, notes])

    const allTags = useMemo(() => {
        const set = new Set<string>()
        for (const n of notes) {
            for (const t of n.tags || []) {
                if (t.trim()) set.add(t.trim())
            }
        }
        return Array.from(set).sort((a, b) => a.localeCompare(b))
    }, [notes])

    const filteredSessions = useMemo(() => {
        const kw = sessionKeyword.trim().toLowerCase()
        if (!kw) return sessions
        return sessions.filter(
            (item) =>
                item.title.toLowerCase().includes(kw) ||
                item.preview.toLowerCase().includes(kw)
        )
    }, [sessions, sessionKeyword])

    const displayedNotes = useMemo(() => {
        if (kbSearchHits !== null) {
            return kbSearchHits.map((hit) => {
                const full = notes.find((n) => n.id === hit.id)
                return {
                    id: hit.id,
                    title: hit.title,
                    summary: hit.excerpt || hit.summary,
                    tags: hit.tags,
                    sourceType: full?.sourceType || 'manual',
                    updatedAt: hit.updatedAt,
                    fullNote: full,
                }
            })
        }
        return notes.map((n) => ({
            id: n.id,
            title: n.title,
            summary: n.summary,
            tags: n.tags,
            sourceType: n.sourceType,
            updatedAt: n.updatedAt,
            fullNote: n,
        }))
    }, [kbSearchHits, notes])

    const handleNewSession = async () => {
        try {
            const created = await API.agentCreateSession({
                title: '新对话',
                modelId: selectedModelId,
                webSearch,
                useKnowledge,
            })
            setSidebarMode('chat')
            setSessions((prev) => [created, ...prev])
            setActiveSessionId(created.id)
            setMessages([])
        } catch (err) {
            message.error(`创建对话失败: ${errorMessage(err)}`)
        }
    }

    const handleDeleteSession = async (id: string) => {
        try {
            await API.agentDeleteSession(id)
            setSessions((prev) => {
                const next = prev.filter((item) => item.id !== id)
                if (activeSessionId === id) {
                    setActiveSessionId(next[0]?.id || '')
                }
                return next
            })
            setSelectedSessionIds((prev) => prev.filter((x) => x !== id))
        } catch (err) {
            message.error(`删除对话失败: ${errorMessage(err)}`)
        }
    }

    const handleRenameSubmit = async () => {
        if (!renameModal.title.trim()) {
            message.warning('请输入对话标题')
            return
        }
        try {
            await API.agentRenameSession(renameModal.id, renameModal.title.trim())
            setRenameModal({ open: false, id: '', title: '' })
            await loadSessions()
        } catch (err) {
            message.error(`重命名失败: ${errorMessage(err)}`)
        }
    }

    const handleSend = async (overrideText?: string) => {
        const text = (overrideText ?? inputText).trim()
        if (!text || sending) return

        let targetSessionId = activeSessionId
        if (!targetSessionId) {
            try {
                const created = await API.agentCreateSession({
                    title: '新对话',
                    modelId: selectedModelId,
                    webSearch,
                    useKnowledge,
                })
                targetSessionId = created.id
                activeSessionIdRef.current = created.id
                setSessions((prev) => [created, ...prev])
                setActiveSessionId(created.id)
            } catch (err) {
                message.error(`创建对话失败: ${errorMessage(err)}`)
                return
            }
        }

        if (!overrideText) setInputText('')
        setSending(true)
        setLiveStream({
            sessionId: targetSessionId,
            prompt: text,
            content: '',
            reasoning: '',
            steps: [],
        })

        try {
            await API.agentChatSend({
                sessionId: targetSessionId,
                prompt: text,
                modelId: selectedModelId,
                webSearch,
                useKnowledge,
            })
            await loadMessages(targetSessionId)
            await loadSessions(targetSessionId)
        } catch (err) {
            const errMsg = errorMessage(err)
            message.error(errMsg)
            await loadMessages(targetSessionId)
        } finally {
            setSending(false)
            setLiveStream(null)
        }
    }

    const handleStop = async () => {
        if (!activeSessionId) return
        try {
            await API.agentStopReact(activeSessionId)
        } catch {
            // ignore
        }
    }

    const handleToggleWebSearch = () => {
        const next = !webSearch
        setWebSearch(next)
        if (activeSessionId) {
            void API.agentUpdateSessionPrefs({ sessionId: activeSessionId, webSearch: next })
        }
    }

    const handleToggleKnowledge = () => {
        const next = !useKnowledge
        setUseKnowledge(next)
        if (activeSessionId) {
            void API.agentUpdateSessionPrefs({ sessionId: activeSessionId, useKnowledge: next })
        }
    }

    const handleModelChange = (mid: string) => {
        setSelectedModelId(mid)
        if (activeSessionId) {
            void API.agentUpdateSessionPrefs({ sessionId: activeSessionId, modelId: mid })
        }
    }

    const handleDistill = async (sessionIds: string[], messageIds: string[]) => {
        if (sessionIds.length === 0 && messageIds.length === 0) {
            message.warning('请先选择需要提炼的对话或消息')
            return
        }
        setDistilling(true)
        try {
            const draft = await API.agentDistillToKnowledge({
                sessionIds,
                messageIds,
                modelId: selectedModelId,
            })
            setDistillDraft(draft)
            setDistillModalOpen(true)
        } catch (err) {
            message.error(`提炼失败: ${errorMessage(err)}`)
        } finally {
            setDistilling(false)
        }
    }

    const handleImportFiles = async () => {
        setImporting(true)
        try {
            const imported = await API.agentKbImportFiles()
            if (imported.length > 0) {
                message.success(`成功导入 ${imported.length} 个文件到知识库`)
                const list = await loadNotes()
                const firstId = imported[0].id
                const found = list.find((n) => n.id === firstId) || imported[0]
                setSidebarMode('kb')
                setActiveNote(found)
            }
        } catch (err) {
            message.error(`导入失败: ${errorMessage(err)}`)
        } finally {
            setImporting(false)
        }
    }

    const handleOpenCitation = async (noteId: string) => {
        try {
            const full = await API.agentKbGet(noteId)
            if (!full) {
                message.warning('该知识条目可能已被删除')
                return
            }
            setSidebarMode('kb')
            setActiveNote(full)
        } catch (err) {
            message.error(`打开知识笔记失败: ${errorMessage(err)}`)
        }
    }

    const activeSession = sessions.find((item) => item.id === activeSessionId) || null
    const aiConfigured = Boolean(settings.aiEnabled)

    const toolDisplayName = (name: string) => {
        switch (name) {
            case 'web_search':
                return '联网搜索'
            case 'web_fetch':
                return '读取网页正文'
            case 'knowledge_search':
                return '检索第二大脑知识库'
            case 'knowledge_get':
                return '读取知识笔记全文'
            default:
                return name
        }
    }

    return (
        <div className={s.workbench}>
            {/* ---------------- 左侧栏：对话历史 / 知识库双模式 ---------------- */}
            <aside className={s.sidebar}>
                <div className={s.sidebarHeader}>
                    <div className={s.brandRow}>
                        <div className={s.brandLeft}>
                            <span className={s.brandIcon}>
                                <Brain size={16} />
                            </span>
                            <span>第二大脑助手</span>
                        </div>
                        <Tooltip title="打开主窗口 AI 设置">
                            <Button
                                type="text"
                                size="small"
                                icon={<Settings size={14} />}
                                onClick={() => void API.openMainAiSettings()}
                            />
                        </Tooltip>
                    </div>

                    <div className={s.modeTabs}>
                        <button
                            type="button"
                            className={`${s.modeTabBtn} ${sidebarMode === 'chat' ? s.active : ''}`}
                            onClick={() => setSidebarMode('chat')}
                        >
                            <MessageSquare size={14} />
                            <span>对话</span>
                        </button>
                        <button
                            type="button"
                            className={`${s.modeTabBtn} ${sidebarMode === 'kb' ? s.active : ''}`}
                            onClick={() => setSidebarMode('kb')}
                        >
                            <BookOpen size={14} />
                            <span>知识库 ({notes.length})</span>
                        </button>
                    </div>

                    {sidebarMode === 'chat' ? (
                        <div className={s.actionRow}>
                            <Button
                                type="primary"
                                size="small"
                                icon={<Plus size={14} />}
                                onClick={handleNewSession}
                                style={{ flex: 1 }}
                            >
                                新建对话
                            </Button>
                            <Tooltip title="批量选择历史对话提炼到知识库">
                                <Button
                                    size="small"
                                    type={batchSessionMode ? 'primary' : 'default'}
                                    ghost={batchSessionMode}
                                    icon={<Sparkles size={13} />}
                                    onClick={() => {
                                        setBatchSessionMode((v) => !v)
                                        setSelectedSessionIds([])
                                    }}
                                >
                                    提炼
                                </Button>
                            </Tooltip>
                        </div>
                    ) : (
                        <div className={s.actionRow}>
                            <Button
                                type="primary"
                                size="small"
                                icon={<FilePlus size={14} />}
                                onClick={() => setActiveNote(emptyDraftNote())}
                                style={{ flex: 1 }}
                            >
                                新建笔记
                            </Button>
                            <Button
                                size="small"
                                icon={<FileUp size={13} />}
                                loading={importing}
                                onClick={handleImportFiles}
                            >
                                导入 (.md/.txt)
                            </Button>
                        </div>
                    )}
                </div>

                <div className={s.searchWrap}>
                    {sidebarMode === 'chat' ? (
                        <Input
                            size="small"
                            allowClear
                            prefix={<Search size={13} />}
                            placeholder="搜索对话历史..."
                            value={sessionKeyword}
                            onChange={(e) => setSessionKeyword(e.target.value)}
                        />
                    ) : (
                        <Input
                            size="small"
                            allowClear
                            prefix={<Search size={13} />}
                            placeholder="检索第二大脑笔记..."
                            value={kbKeyword}
                            onChange={(e) => setKbKeyword(e.target.value)}
                        />
                    )}
                </div>

                {sidebarMode === 'kb' && allTags.length > 0 && (
                    <div className={s.tagStrip}>
                        <button
                            type="button"
                            className={`${s.tagChip} ${kbTagFilter === '' ? s.active : ''}`}
                            onClick={() => setKbTagFilter('')}
                        >
                            全部
                        </button>
                        {allTags.map((tag) => (
                            <button
                                key={tag}
                                type="button"
                                className={`${s.tagChip} ${kbTagFilter === tag ? s.active : ''}`}
                                onClick={() => setKbTagFilter((prev) => (prev === tag ? '' : tag))}
                            >
                                #{tag}
                            </button>
                        ))}
                    </div>
                )}

                <div className={s.listBody}>
                    {sidebarMode === 'chat' ? (
                        filteredSessions.length === 0 ? (
                            <Empty
                                image={Empty.PRESENTED_IMAGE_SIMPLE}
                                description="暂无历史对话"
                                style={{ marginTop: 40 }}
                            />
                        ) : (
                            filteredSessions.map((sess) => {
                                const isActive = sess.id === activeSessionId
                                const checked = selectedSessionIds.includes(sess.id)
                                return (
                                    <div
                                        key={sess.id}
                                        className={`${s.listItem} ${isActive ? s.active : ''}`}
                                        onClick={() => {
                                            if (batchSessionMode) {
                                                setSelectedSessionIds((prev) =>
                                                    prev.includes(sess.id)
                                                        ? prev.filter((x) => x !== sess.id)
                                                        : [...prev, sess.id]
                                                )
                                            } else {
                                                setActiveSessionId(sess.id)
                                            }
                                        }}
                                    >
                                        {batchSessionMode && (
                                            <Checkbox
                                                checked={checked}
                                                onClick={(e) => e.stopPropagation()}
                                                onChange={(e) => {
                                                    const isCk = e.target.checked
                                                    setSelectedSessionIds((prev) =>
                                                        isCk
                                                            ? Array.from(new Set([...prev, sess.id]))
                                                            : prev.filter((x) => x !== sess.id)
                                                    )
                                                }}
                                            />
                                        )}
                                        <div className={s.itemMain}>
                                            <div className={s.itemTitleRow}>
                                                <span className={s.itemTitle}>{sess.title}</span>
                                                {!batchSessionMode && (
                                                    <div
                                                        className={s.itemActions}
                                                        onClick={(e) => e.stopPropagation()}
                                                    >
                                                        <Button
                                                            type="text"
                                                            size="small"
                                                            icon={<Edit2 size={12} />}
                                                            onClick={() =>
                                                                setRenameModal({
                                                                    open: true,
                                                                    id: sess.id,
                                                                    title: sess.title,
                                                                })
                                                            }
                                                        />
                                                        <Popconfirm
                                                            title="删除这条对话记录？"
                                                            okText="删除"
                                                            cancelText="取消"
                                                            okButtonProps={{ danger: true }}
                                                            onConfirm={() => void handleDeleteSession(sess.id)}
                                                        >
                                                            <Button
                                                                type="text"
                                                                size="small"
                                                                danger
                                                                icon={<Trash2 size={12} />}
                                                            />
                                                        </Popconfirm>
                                                    </div>
                                                )}
                                            </div>
                                            {sess.preview && (
                                                <div className={s.itemPreview}>{sess.preview}</div>
                                            )}
                                            <div className={s.itemMeta}>
                                                <span>{sess.messageCount} 条消息</span>
                                            </div>
                                        </div>
                                    </div>
                                )
                            })
                        )
                    ) : displayedNotes.length === 0 ? (
                        <Empty
                            image={Empty.PRESENTED_IMAGE_SIMPLE}
                            description="知识库暂无匹配笔记"
                            style={{ marginTop: 40 }}
                        />
                    ) : (
                        displayedNotes.map((item) => {
                            const isActive = activeNote?.id === item.id
                            return (
                                <div
                                    key={item.id}
                                    className={`${s.listItem} ${isActive ? s.active : ''}`}
                                    onClick={() => {
                                        if (item.fullNote) {
                                            setActiveNote(item.fullNote)
                                        } else {
                                            void API.agentKbGet(item.id).then((full) => {
                                                if (full) setActiveNote(full)
                                            })
                                        }
                                    }}
                                >
                                    <div className={s.itemMain}>
                                        <div className={s.itemTitle}>{item.title}</div>
                                        {item.summary && (
                                            <div className={s.itemPreview}>{item.summary}</div>
                                        )}
                                        <div className={s.itemMeta}>
                                            <span>
                                                {item.sourceType === 'distill'
                                                    ? '对话提炼'
                                                    : item.sourceType === 'import'
                                                    ? '文件导入'
                                                    : '手动笔记'}
                                            </span>
                                            {item.tags.slice(0, 3).map((t) => (
                                                <span key={t}>#{t}</span>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )
                        })
                    )}
                </div>

                {sidebarMode === 'chat' && batchSessionMode && (
                    <div className={s.batchBar}>
                        <div className={s.batchBarTop}>
                            <span>已选 {selectedSessionIds.length} 个会话</span>
                            <Button
                                type="link"
                                size="small"
                                style={{ padding: 0, height: 'auto' }}
                                onClick={() =>
                                    setSelectedSessionIds(
                                        selectedSessionIds.length === filteredSessions.length
                                            ? []
                                            : filteredSessions.map((x) => x.id)
                                    )
                                }
                            >
                                {selectedSessionIds.length === filteredSessions.length
                                    ? '取消全选'
                                    : '全选'}
                            </Button>
                        </div>
                        <div className={s.batchBarBtns}>
                            <Button
                                size="small"
                                onClick={() => {
                                    setBatchSessionMode(false)
                                    setSelectedSessionIds([])
                                }}
                                style={{ flex: 1 }}
                            >
                                取消
                            </Button>
                            <Button
                                type="primary"
                                size="small"
                                icon={<Sparkles size={13} />}
                                loading={distilling}
                                disabled={selectedSessionIds.length === 0}
                                onClick={() => void handleDistill(selectedSessionIds, [])}
                                style={{ flex: 2 }}
                            >
                                提炼到知识库
                            </Button>
                        </div>
                    </div>
                )}
            </aside>

            {/* ---------------- 右侧主区域 ---------------- */}
            <main className={s.main}>
                {sidebarMode === 'kb' ? (
                    activeNote ? (
                        <KnowledgeDetailView
                            note={activeNote}
                            onUpdated={(saved) => {
                                setActiveNote(saved)
                                void loadNotes(kbTagFilter)
                            }}
                            onDeleted={(id) => {
                                if (activeNote?.id === id) setActiveNote(null)
                                void loadNotes(kbTagFilter)
                            }}
                            onJumpToSession={(sid) => {
                                setSidebarMode('chat')
                                setActiveSessionId(sid)
                            }}
                        />
                    ) : (
                        <div className={s.emptyChat}>
                            <div className={s.emptyIcon}>
                                <BookOpen size={26} />
                            </div>
                            <div className={s.emptyTitle}>第二大脑知识库</div>
                            <div className={s.emptySub}>
                                支持全文检索所有沉淀的知识笔记，每条笔记同时同步为本地 Markdown 文件存储。你可以从左侧选择笔记查看/编辑，或直接导入本地 `.md` / `.txt` 文档。
                            </div>
                            <Space>
                                <Button
                                    type="primary"
                                    icon={<FilePlus size={14} />}
                                    onClick={() => setActiveNote(emptyDraftNote())}
                                >
                                    新建知识笔记
                                </Button>
                                <Button
                                    icon={<FileUp size={14} />}
                                    loading={importing}
                                    onClick={handleImportFiles}
                                >
                                    导入 .md / .txt 文件
                                </Button>
                            </Space>
                        </div>
                    )
                ) : (
                    <>
                        <header className={s.topBar}>
                            <div className={s.topBarLeft}>
                                <span className={s.sessionHeading}>
                                    {activeSession ? activeSession.title : '新对话'}
                                </span>
                                {activeSession && (
                                    <Tag color="default" style={{ margin: 0, fontSize: 11 }}>
                                        {messages.length} 条消息
                                    </Tag>
                                )}
                            </div>

                            <div className={s.topBarRight}>
                                <Select
                                    size="small"
                                    style={{ width: 190 }}
                                    value={selectedModelId}
                                    onChange={handleModelChange}
                                    options={modelOptions.map((m) => ({
                                        label: m.name || m.model,
                                        value: m.id,
                                    }))}
                                />
                                <Button
                                    size="small"
                                    type={selectMsgMode ? 'primary' : 'default'}
                                    ghost={selectMsgMode}
                                    icon={<CheckSquare size={13} />}
                                    disabled={messages.length === 0}
                                    onClick={() => {
                                        setSelectMsgMode((v) => !v)
                                        setSelectedMsgIds([])
                                    }}
                                >
                                    {selectMsgMode ? '退出勾选' : '勾选消息提炼'}
                                </Button>
                            </div>
                        </header>

                        {!aiConfigured && (
                            <div className={s.setupBanner}>
                                <span>
                                    当前「AI 智能体」全局开关尚未开启，或未配置大模型 API Key，请先完成设置后开始问答。
                                </span>
                                <Button
                                    size="small"
                                    type="primary"
                                    onClick={() => void API.openMainAiSettings()}
                                >
                                    前往开启并配置
                                </Button>
                            </div>
                        )}

                        {selectMsgMode && (
                            <div className={s.msgSelectBanner}>
                                <span>
                                    请勾选需要提炼归纳的对话消息（已选 {selectedMsgIds.length} 条）
                                </span>
                                <Space size={8}>
                                    <Button
                                        size="small"
                                        onClick={() =>
                                            setSelectedMsgIds(
                                                selectedMsgIds.length === messages.length
                                                    ? []
                                                    : messages.map((m) => m.id)
                                            )
                                        }
                                    >
                                        {selectedMsgIds.length === messages.length ? '取消全选' : '全选'}
                                    </Button>
                                    <Button
                                        size="small"
                                        type="primary"
                                        icon={<Sparkles size={13} />}
                                        loading={distilling}
                                        disabled={selectedMsgIds.length === 0}
                                        onClick={() => void handleDistill([], selectedMsgIds)}
                                    >
                                        提炼到知识库
                                    </Button>
                                </Space>
                            </div>
                        )}

                        <div className={s.chatScroll}>
                            {messages.length === 0 && !liveStream ? (
                                <div className={s.emptyChat}>
                                    <div className={s.emptyIcon}>
                                        <Brain size={26} />
                                    </div>
                                    <div className={s.emptyTitle}>你好，我是你的第二大脑助手</div>
                                    <div className={s.emptySub}>
                                        支持日常深度问答、自动联网搜索实时网页信息，以及结合个人知识库进行回顾推理。你可以随时将有价值的对话提炼成笔记沉淀下来。
                                    </div>
                                    <div className={s.starterGrid}>
                                        {STARTER_PROMPTS.map((p) => (
                                            <button
                                                key={p}
                                                type="button"
                                                className={s.starterCard}
                                                onClick={() => void handleSend(p)}
                                            >
                                                {p}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            ) : (
                                <>
                                    {messages.map((msg) => {
                                        const isUser = msg.role === 'user'
                                        const rOpen = !!expandedReasoning[msg.id]
                                        const sOpen = !!expandedSteps[msg.id]
                                        const checked = selectedMsgIds.includes(msg.id)
                                        return (
                                            <div
                                                key={msg.id}
                                                className={`${s.msgRow} ${isUser ? s.userRow : ''}`}
                                            >
                                                {selectMsgMode && (
                                                    <div className={s.msgCheck}>
                                                        <Checkbox
                                                            checked={checked}
                                                            onChange={(e) => {
                                                                const ck = e.target.checked
                                                                setSelectedMsgIds((prev) =>
                                                                    ck
                                                                        ? Array.from(
                                                                              new Set([...prev, msg.id])
                                                                          )
                                                                        : prev.filter((x) => x !== msg.id)
                                                                )
                                                            }}
                                                        />
                                                    </div>
                                                )}

                                                {isUser ? (
                                                    <div className={s.userBubble}>{msg.content}</div>
                                                ) : (
                                                    <>
                                                        <span className={s.avatar}>
                                                            <Brain size={15} />
                                                        </span>
                                                        <div className={s.assistantCard}>
                                                            {msg.reasoningContent && (
                                                                <div className={s.processBox}>
                                                                    <button
                                                                        type="button"
                                                                        className={s.processToggle}
                                                                        onClick={() =>
                                                                            setExpandedReasoning((p) => ({
                                                                                ...p,
                                                                                [msg.id]: !rOpen,
                                                                            }))
                                                                        }
                                                                    >
                                                                        <span className={s.processToggleLeft}>
                                                                            <Sparkles size={12} />
                                                                            <span>思考过程</span>
                                                                        </span>
                                                                        {rOpen ? (
                                                                            <ChevronDown size={13} />
                                                                        ) : (
                                                                            <ChevronRight size={13} />
                                                                        )}
                                                                    </button>
                                                                    {rOpen && (
                                                                        <div className={s.processBody}>
                                                                            {msg.reasoningContent}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            )}

                                                            {msg.steps &&
                                                                msg.steps.filter((st) => st.stepType === 'action')
                                                                    .length > 0 && (
                                                                    <div className={s.processBox}>
                                                                        <button
                                                                            type="button"
                                                                            className={s.processToggle}
                                                                            onClick={() =>
                                                                                setExpandedSteps((p) => ({
                                                                                    ...p,
                                                                                    [msg.id]: !sOpen,
                                                                                }))
                                                                            }
                                                                        >
                                                                            <span className={s.processToggleLeft}>
                                                                                <Wrench size={12} />
                                                                                <span>
                                                                                    工具调用 (
                                                                                    {
                                                                                        msg.steps.filter(
                                                                                            (st) =>
                                                                                                st.stepType ===
                                                                                                'action'
                                                                                        ).length
                                                                                    }
                                                                                    次)
                                                                                </span>
                                                                            </span>
                                                                            {sOpen ? (
                                                                                <ChevronDown size={13} />
                                                                            ) : (
                                                                                <ChevronRight size={13} />
                                                                            )}
                                                                        </button>
                                                                        {sOpen && (
                                                                            <div className={s.processBody}>
                                                                                {msg.steps
                                                                                    .filter(
                                                                                        (st) =>
                                                                                            st.stepType ===
                                                                                            'action'
                                                                                    )
                                                                                    .map((st) => (
                                                                                        <div
                                                                                            key={st.id}
                                                                                            className={s.stepLine}
                                                                                        >
                                                                                            <span>
                                                                                                {toolDisplayName(
                                                                                                    st.title
                                                                                                )}
                                                                                            </span>
                                                                                            <Tag
                                                                                                color={
                                                                                                    st.status ===
                                                                                                    'failed'
                                                                                                        ? 'error'
                                                                                                        : 'success'
                                                                                                }
                                                                                                style={{ margin: 0 }}
                                                                                            >
                                                                                                {st.durationMs}ms
                                                                                            </Tag>
                                                                                        </div>
                                                                                    ))}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                )}

                                                            <MarkdownViewer content={msg.content} />

                                                            {msg.citations && msg.citations.length > 0 && (
                                                                <div className={s.citationRow}>
                                                                    <span className={s.citationLabel}>
                                                                        <BookOpen size={12} />
                                                                        <span>引用知识库：</span>
                                                                    </span>
                                                                    {msg.citations.map((c) => (
                                                                        <button
                                                                            key={c.noteId}
                                                                            type="button"
                                                                            className={s.citationChip}
                                                                            onClick={() =>
                                                                                void handleOpenCitation(c.noteId)
                                                                            }
                                                                            title={c.summary || c.title}
                                                                        >
                                                                            <span>{c.title}</span>
                                                                        </button>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </>
                                                )}
                                            </div>
                                        )
                                    })}

                                    {/* 实时流式响应展示 */}
                                    {liveStream && (
                                        <>
                                            {!messages.some(
                                                (m) =>
                                                    m.role === 'user' &&
                                                    m.content === liveStream.prompt
                                            ) && (
                                                <div className={`${s.msgRow} ${s.userRow}`}>
                                                    <div className={s.userBubble}>
                                                        {liveStream.prompt}
                                                    </div>
                                                </div>
                                            )}

                                            <div className={s.msgRow}>
                                                <span className={s.avatar}>
                                                    <Loader2 size={15} className={s.spinIcon} />
                                                </span>
                                                <div className={s.assistantCard}>
                                                    {liveStream.reasoning && (
                                                        <div className={s.processBox}>
                                                            <div className={s.processToggle}>
                                                                <span className={s.processToggleLeft}>
                                                                    <Sparkles size={12} />
                                                                    <span>正在思考推演...</span>
                                                                </span>
                                                            </div>
                                                            <div className={s.processBody}>
                                                                {liveStream.reasoning}
                                                            </div>
                                                        </div>
                                                    )}

                                                    {liveStream.steps.length > 0 && (
                                                        <div className={s.processBox}>
                                                            <div className={s.processBody}>
                                                                {liveStream.steps.map((st) => (
                                                                    <div
                                                                        key={st.id}
                                                                        className={s.stepLine}
                                                                    >
                                                                        <span>
                                                                            {toolDisplayName(st.title)}
                                                                        </span>
                                                                        <Tag
                                                                            color={
                                                                                st.status === 'running'
                                                                                    ? 'processing'
                                                                                    : st.status === 'failed'
                                                                                    ? 'error'
                                                                                    : 'success'
                                                                            }
                                                                            style={{ margin: 0 }}
                                                                        >
                                                                            {st.status === 'running'
                                                                                ? '执行中'
                                                                                : `${st.durationMs}ms`}
                                                                        </Tag>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}

                                                    {liveStream.content ? (
                                                        <MarkdownViewer
                                                            streaming
                                                            content={liveStream.content}
                                                        />
                                                    ) : (
                                                        <Text type="secondary" style={{ fontSize: 13 }}>
                                                            正在思考并组织回答...
                                                        </Text>
                                                    )}
                                                </div>
                                            </div>
                                        </>
                                    )}
                                </>
                            )}
                            <div ref={chatEndRef} />
                        </div>

                        <div className={s.composerWrap}>
                            <div className={s.composerBox}>
                                <TextArea
                                    variant="borderless"
                                    autoSize={{ minRows: 2, maxRows: 6 }}
                                    value={inputText}
                                    onChange={(e) => setInputText(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.nativeEvent.isComposing) return
                                        if (e.key === 'Enter' && !e.shiftKey) {
                                            e.preventDefault()
                                            void handleSend()
                                        }
                                    }}
                                    placeholder="输入日常问题、思考记录或需要联网核查的主题...（Enter 发送，Shift+Enter 换行）"
                                />
                                <div className={s.composerToolbar}>
                                    <div className={s.toggleGroup}>
                                        <button
                                            type="button"
                                            className={`${s.featureToggle} ${webSearch ? s.on : ''}`}
                                            onClick={handleToggleWebSearch}
                                        >
                                            <Globe size={13} />
                                            <span>联网搜索</span>
                                        </button>
                                        <button
                                            type="button"
                                            className={`${s.featureToggle} ${useKnowledge ? s.on : ''}`}
                                            onClick={handleToggleKnowledge}
                                        >
                                            <Brain size={13} />
                                            <span>引用知识库</span>
                                        </button>
                                    </div>

                                    {sending ? (
                                        <Button
                                            danger
                                            size="small"
                                            icon={<Square size={12} />}
                                            onClick={() => void handleStop()}
                                        >
                                            停止
                                        </Button>
                                    ) : (
                                        <Button
                                            type="primary"
                                            size="small"
                                            icon={<Send size={13} />}
                                            disabled={!inputText.trim()}
                                            onClick={() => void handleSend()}
                                        >
                                            发送
                                        </Button>
                                    )}
                                </div>
                            </div>
                        </div>
                    </>
                )}
            </main>

            <Modal
                open={renameModal.open}
                title="重命名对话"
                okText="保存"
                cancelText="取消"
                onOk={() => void handleRenameSubmit()}
                onCancel={() => setRenameModal({ open: false, id: '', title: '' })}
            >
                <Input
                    value={renameModal.title}
                    onChange={(e) => setRenameModal((prev) => ({ ...prev, title: e.target.value }))}
                    onPressEnter={() => void handleRenameSubmit()}
                    placeholder="请输入新的对话标题"
                />
            </Modal>

            <DistillPreviewModal
                open={distillModalOpen}
                draft={distillDraft}
                onClose={() => {
                    setDistillModalOpen(false)
                    setDistillDraft(null)
                }}
                onSaved={(savedNote) => {
                    setBatchSessionMode(false)
                    setSelectedSessionIds([])
                    setSelectMsgMode(false)
                    setSelectedMsgIds([])
                    void loadNotes(kbTagFilter)
                    setSidebarMode('kb')
                    setActiveNote(savedNote)
                }}
            />
        </div>
    )
}
