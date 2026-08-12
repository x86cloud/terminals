import React, { useState, useEffect, useRef, useCallback } from 'react'
import Icon from '../../components/Icon'
import MarkdownViewer from '../../components/common/MarkdownViewer'
import { API, consumePendingAsk, subscribe } from '../../api'
import { AiMessage, AppSettings } from '../../types'
import g from '../../styles/global.module.less'
import s from './AiAgentPanel.module.less'

interface Props {
    settings: AppSettings
}

const SESSION_ID = 'ai_agent_default'

export default function AiAgentPanel({ settings }: Props) {
    const [messages, setMessages] = useState<AiMessage[]>([])
    const [input, setInput] = useState('')
    const [images, setImages] = useState<string[]>([])
    const [isGenerating, setIsGenerating] = useState(false)
    const [streamingText, setStreamingText] = useState('')
    const [streamingReasoningText, setStreamingReasoningText] = useState('')
    const [noticeText, setNoticeText] = useState('')
    const [workspaceDir, setWorkspaceDir] = useState<string>('')
    const [activeToolCall, setActiveToolCall] = useState<string>('')
    const [pendingConfirm, setPendingConfirm] = useState<{
        confirmID: string
        action: string
        path: string
        description: string
    } | null>(null)
    const [isRingHovered, setIsRingHovered] = useState(false)
    const chatListRef = useRef<HTMLDivElement>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)

    // Load persistent history and workspace dir on mount
    useEffect(() => {
        API.agentGetHistory()
            .then((history) => {
                if (history && history.length > 0) {
                    setMessages(history)
                }
            })
            .catch(() => { })

        API.agentGetWorkspaceDir()
            .then((dir) => {
                if (dir) setWorkspaceDir(dir)
            })
            .catch(() => { })
    }, [])

    // Save history when messages change
    const saveHistory = useCallback((newMsgs: AiMessage[]) => {
        setMessages(newMsgs)
        API.agentSaveHistory(newMsgs).catch(() => { })
    }, [])

    // Scroll chat list to bottom
    const scrollToBottom = () => {
        if (chatListRef.current) {
            chatListRef.current.scrollTop = chatListRef.current.scrollHeight
        }
    }

    useEffect(() => {
        scrollToBottom()
    }, [messages, streamingText, pendingConfirm, activeToolCall])

    // Subscribe to Wails event stream
    const handleSendRef = useRef<(customText?: string) => Promise<void>>(async () => { })

    // Send Message Handler
    const handleSend = async (customText?: any) => {
        const text = (typeof customText === 'string' ? customText : input).trim()
        if ((!text && images.length === 0) || isGenerating) return

        const userMsg: AiMessage = {
            role: 'user',
            content: text,
            images: images.length > 0 && customText === undefined ? [...images] : undefined,
            timestamp: Date.now(),
        }

        const newHistory = [...messages, userMsg]
        saveHistory(newHistory)
        setInput('')
        setImages([])
        setNoticeText('')
        setIsGenerating(true)
        setStreamingText('')

        try {
            await API.agentSend(SESSION_ID, newHistory)
        } catch (e: any) {
            setIsGenerating(false)
            setStreamingText('')
            saveHistory([
                ...newHistory,
                { role: 'assistant', content: `❌ 发送失败: ${e.message || String(e)}`, timestamp: Date.now() },
            ])
        }
    }

    const handleStop = async () => {
        try {
            await API.agentStopSend(SESSION_ID)
        } catch { }
        setIsGenerating(false)
    }

    useEffect(() => {
        handleSendRef.current = handleSend
    })

    useEffect(() => {
        const unSubChunk = subscribe(`agent:chunk:${SESSION_ID}`, (chunk: string) => {
            setStreamingText((prev) => prev + chunk)
        })

        const unSubReasoning = subscribe(`agent:reasoning_chunk:${SESSION_ID}`, (chunk: string) => {
            setStreamingReasoningText((prev) => prev + chunk)
        })

        const unSubNotice = subscribe(`agent:notice:${SESSION_ID}`, (notice: string) => {
            setNoticeText(notice)
        })

        const unSubError = subscribe(`agent:error:${SESSION_ID}`, (errText: string) => {
            setIsGenerating(false)
            setStreamingText('')
            setStreamingReasoningText('')
            saveHistory([
                ...messages,
                { role: 'assistant', content: `❌ 运行时错误: ${errText}`, timestamp: Date.now() },
            ])
        })

        const unSubDone = subscribe(`agent:done:${SESSION_ID}`, (data: any) => {
            setIsGenerating(false)
            setStreamingText('')
            setActiveToolCall('')
            setPendingConfirm(null)
            const content = typeof data === 'object' && data !== null ? data.content : String(data || '')
            const reasoning = typeof data === 'object' && data !== null ? data.reasoning_content : ''

            setMessages((prev) => {
                const updated = [
                    ...prev,
                    {
                        role: 'assistant' as const,
                        content: content,
                        reasoning_content: reasoning || streamingReasoningText,
                        timestamp: Date.now(),
                    },
                ]
                API.agentSaveHistory(updated).catch(() => { })
                return updated
            })
            setStreamingReasoningText('')
        })

        const unSubConfirm = subscribe(`agent:confirm_request:${SESSION_ID}`, (req: any) => {
            setPendingConfirm(req)
        })

        const unSubToolStart = subscribe(`agent:tool_start:${SESSION_ID}`, (req: any) => {
            if (req && req.detail) {
                setActiveToolCall(req.detail)
            }
        })

        const unSubToolEvent = subscribe(`agent:tool_event:${SESSION_ID}`, (evt: any) => {
            if (evt && evt.id) {
                setMessages((prev) => {
                    const updated = [
                        ...prev,
                        {
                            role: 'assistant' as const,
                            content: '',
                            tool_calls: [{ id: evt.id, name: evt.name, args: evt.args }],
                            timestamp: Date.now(),
                        },
                        {
                            role: 'tool' as const,
                            tool_call_id: evt.id,
                            name: evt.name,
                            content: evt.result,
                            timestamp: Date.now(),
                        },
                    ]
                    API.agentSaveHistory(updated).catch(() => { })
                    return updated
                })
            }
        })

        const pendingPrompt = consumePendingAsk()
        if (pendingPrompt) {
            setInput(pendingPrompt)
            setTimeout(() => {
                handleSendRef.current(pendingPrompt)
            }, 100)
        }

        const unSubAsk = subscribe('agent:ask', (prompt: string) => {
            const finalPrompt = prompt || consumePendingAsk()
            if (finalPrompt) {
                setInput(finalPrompt)
                setTimeout(() => {
                    handleSendRef.current(finalPrompt)
                }, 50)
            }
        })

        return () => {
            unSubChunk()
            unSubNotice()
            unSubError()
            unSubDone()
            unSubConfirm()
            unSubToolStart()
            unSubToolEvent()
            unSubAsk()
        }
    }, [])

    const [expandedTools, setExpandedTools] = useState<Record<number, boolean>>({})
    const toggleExpandTool = (idx: number) => {
        setExpandedTools((prev) => ({ ...prev, [idx]: !prev[idx] }))
    }

    const handleSelectWorkspace = async () => {
        try {
            const dir = await API.agentSelectWorkspaceDir()
            if (dir) {
                setWorkspaceDir(dir)
            }
        } catch {
            /* ignore */
        }
    }

    const handleClearWorkspace = async () => {
        await API.agentSetWorkspaceDir('')
        setWorkspaceDir('')
    }

    const handleConfirmTool = async (approved: boolean) => {
        if (!pendingConfirm) return
        await API.agentConfirmTool(pendingConfirm.confirmID, approved)
        setPendingConfirm(null)
    }

    // Image Upload & Paste Handlers
    const handleAddImageBase64 = (base64Str: string) => {
        setImages((prev) => [...prev, base64Str])
    }

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files
        if (!files || files.length === 0) return
        for (let i = 0; i < files.length; i++) {
            const reader = new FileReader()
            reader.onload = (event) => {
                const res = event.target?.result as string
                if (res) handleAddImageBase64(res)
            }
            reader.readAsDataURL(files[i])
        }
        e.target.value = ''
    }

    const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
        if (!settings.aiEnableMultimodal) return
        const items = e.clipboardData?.items
        if (!items) return
        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf('image') !== -1) {
                const file = items[i].getAsFile()
                if (file) {
                    const reader = new FileReader()
                    reader.onload = (event) => {
                        const res = event.target?.result as string
                        if (res) handleAddImageBase64(res)
                    }
                    reader.readAsDataURL(file)
                }
            }
        }
    }

    // Clear History
    const handleClear = async () => {
        if (confirm('确定要清除所有 AI 对话历史吗？')) {
            await API.agentClearHistory()
            setMessages([])
            setNoticeText('')
        }
    }

    // Token Usage Calculation (Calculates actual input sent to LLM after compression)
    const maxTokens = settings.aiMaxContextTokens || 4096
    const strategy = settings.aiCompressionStrategy || 'summary'
    const sysPrompt = settings.aiSystemPrompt || ''

    const getEffectiveContext = () => {
        const rawTotalChars = messages.reduce((acc, m) => acc + (m.content ? m.content.length : 0), 0)
        const estRawTokens = Math.ceil(rawTotalChars / 3.0)
        if (estRawTokens <= maxTokens || messages.length <= 4) {
            return {
                effectiveMessages: messages,
                compressedText: '',
            }
        }
        if (strategy === 'sliding') {
            const cutIdx = Math.max(0, messages.length - 4)
            return {
                effectiveMessages: messages.slice(cutIdx),
                compressedText: '已触发滑动窗口截断，只保留最新 4 条对话',
            }
        }
        const cutIdx = Math.max(0, messages.length - 3)
        return {
            effectiveMessages: messages.slice(cutIdx),
            compressedText: '已触发摘要压缩，只保留最新对话',
        }
    }

    const { effectiveMessages, compressedText } = getEffectiveContext()
    const effectiveChars = effectiveMessages.reduce((acc, m) => acc + (m.content ? m.content.length : 0), 0) + sysPrompt.length
    const usedTokens = Math.ceil(effectiveChars / 3.0)
    const percent = Math.min(100, Math.round((usedTokens / maxTokens) * 1000) / 10)

    const formatTokenK = (num: number) => {
        if (num < 1000) return `${num}`
        return `${(num / 1000).toFixed(1)}K`
    }

    const getRingColor = (pct: number) => {
        if (pct >= 90) return '#ff4d4f'
        if (pct >= 70) return '#faad14'
        return '#1890ff'
    }

    const ThinkingCard = ({ reasoningContent, isStreaming = false }: { reasoningContent?: string; isStreaming?: boolean }) => {
        const [collapsed, setCollapsed] = useState(!isStreaming)

        if (!reasoningContent) return null

        return (
            <div className={s.thinkingCard}>
                <div className={s.thinkingHeader} onClick={() => setCollapsed(!collapsed)}>
                    <div className={s.thinkingTitleLeft}>
                        {isStreaming ? (
                            <Icon name="refresh" size={12} className={s.spinIcon} />
                        ) : (
                            <span className={s.thinkingBrainIcon}>💭</span>
                        )}
                        <span className={s.thinkingLabel}>
                            {isStreaming ? '正在思考中…' : '已完成深度思考'}
                        </span>
                    </div>
                    <Icon name={collapsed ? 'chevron-down' : 'chevron-right'} size={12} className={s.expandIcon} />
                </div>
                {!collapsed && (
                    <div className={s.thinkingBody}>
                        <MarkdownViewer content={reasoningContent} streaming={isStreaming} />
                    </div>
                )}
            </div>
        )
    }

    const circumference = 43.98 // 2 * Math.PI * 7
    const strokeDashoffset = circumference - (circumference * (percent / 100))

    return (
        <div className={s.agentContainer}>
            {/* Header */}
            <div className={s.headerBar}>
                <div className={s.titleSection}>
                    <Icon name="bot" size={16} />
                    <span>智能体</span>
                    <span className={s.modelTag}>{settings.aiModel || 'deepseek-chat'}</span>
                    {settings.aiEnableMultimodal && (
                        <span className={s.badgeMultimodal}>多模态已开启</span>
                    )}
                </div>
                <div className={s.actions}>
                    <button
                        className={`${g.btn} ${g.xs}`}
                        title="清空对话历史"
                        disabled={isGenerating || messages.length === 0}
                        onClick={handleClear}
                    >
                        <Icon name="trash" size={13} />
                    </button>
                </div>
            </div>

            {/* Chat List */}
            <div className={s.chatList} ref={chatListRef}>
                {messages.length === 0 && !isGenerating && (
                    <div className={s.emptyState}>
                        <Icon name="bot" size={48} className={s.emptyIcon} />
                        <div className={s.emptyTitle}>欢迎使用 AI 智能体</div>
                        <div className={s.emptySub}>
                            支持多轮对话、智能上下文压缩、打字机流式推演与多模态识别。
                            {!settings.aiApiKey && (
                                <div style={{ color: '#e05c5c', marginTop: 8 }}>
                                    ⚠️ 当前未配置 API Key，请点击右上角「设置」-「AI 智能体」填入 Key。
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {messages.map((msg, idx) => {
                    if (msg.role === 'tool') {
                        const isExpanded = !!expandedTools[idx]
                        return (
                            <div key={idx} className={s.toolMsgRow}>
                                <div className={s.toolMsgCard}>
                                    <div className={s.toolHeader} onClick={() => toggleExpandTool(idx)}>
                                        <div className={s.toolHeaderLeft}>
                                            <Icon name="terminal" size={13} />
                                            <span>🛠️ 工具调用: <strong>{msg.name || 'tool'}</strong></span>
                                            <span className={s.toolStatusTag}>已完成</span>
                                        </div>
                                        <Icon name={isExpanded ? 'chevron-down' : 'chevron-right'} size={12} className={s.expandIcon} />
                                    </div>
                                    {isExpanded && (
                                        <div className={s.toolBody}>
                                            <div className={s.toolSectionTitle}>返回结果:</div>
                                            <pre className={s.toolCode}>{msg.content}</pre>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )
                    }

                    if (msg.role === 'assistant' && msg.tool_calls && msg.tool_calls.length > 0 && !msg.content) {
                        return null
                    }

                    return (
                        <div key={idx} className={`${s.messageRow} ${s[msg.role]}`}>
                            {msg.role !== 'system' && (
                                <div className={s.avatar}>
                                    <Icon name={msg.role === 'user' ? 'user' : 'bot'} size={16} />
                                </div>
                            )}
                            <div className={msg.role === 'system' ? s.systemNotice : s.bubble}>
                                {msg.role === 'assistant' && msg.reasoning_content && (
                                    <ThinkingCard reasoningContent={msg.reasoning_content} isStreaming={false} />
                                )}
                                {msg.images && msg.images.length > 0 && (
                                    <div className={s.imageGrid}>
                                        {msg.images.map((img, i) => (
                                            <img key={i} src={img} alt="attached" className={s.imgThumb} />
                                        ))}
                                    </div>
                                )}
                                <div className={s.markdownBody}>
                                    {msg.role === 'assistant' ? (
                                        <MarkdownViewer content={msg.content} />
                                    ) : (
                                        msg.content.split('\n').map((line, i) => <p key={i}>{line}</p>)
                                    )}
                                </div>
                            </div>
                        </div>
                    )
                })}

                {/* Streaming Response Bubble */}
                {isGenerating && (
                    <div className={`${s.messageRow} ${s.assistant}`}>
                        <div className={s.avatar}>
                            <Icon name="bot" size={16} />
                        </div>
                        <div className={s.bubble}>
                            {streamingReasoningText && (
                                <ThinkingCard reasoningContent={streamingReasoningText} isStreaming={true} />
                            )}
                            {activeToolCall && (
                                <div className={s.toolCallPill}>
                                    <Icon name="refresh" size={13} className={s.spinIcon} />
                                    <span>{activeToolCall}</span>
                                </div>
                            )}

                            <div className={s.markdownBody}>
                                {streamingText ? (
                                    <MarkdownViewer content={streamingText} streaming={true} />
                                ) : !streamingReasoningText ? (
                                    <span style={{ color: '#888' }}>思考中…</span>
                                ) : null}
                            </div>

                            {pendingConfirm && (
                                <div className={s.confirmBox}>
                                    <div className={s.confirmHeader}>
                                        <Icon name="shield" size={15} />
                                        <span>安全确认：Agent 请求执行 <strong>{pendingConfirm.path || '敏感操作'}</strong></span>
                                    </div>
                                    {pendingConfirm.description && (
                                        <div className={s.confirmBody}>
                                            <pre className={s.confirmCode}>{pendingConfirm.description}</pre>
                                        </div>
                                    )}
                                    <div className={s.confirmFooter}>
                                        <button className={s.btnApprove} onClick={() => handleConfirmTool(true)}>
                                            <Icon name="check" size={12} /> 同意执行
                                        </button>
                                        <button className={s.btnReject} onClick={() => handleConfirmTool(false)}>
                                            <Icon name="close" size={12} /> 拒绝
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Input Area */}
            <div className={s.inputArea}>
                {/* Images Preview Bar */}
                {images.length > 0 && (
                    <div className={s.previewBar}>
                        {images.map((img, i) => (
                            <div key={i} className={s.previewItem}>
                                <img src={img} alt="preview" />
                                <button
                                    className={s.removeBtn}
                                    onClick={() => setImages((prev) => prev.filter((_, idx) => idx !== i))}
                                >
                                    ×
                                </button>
                            </div>
                        ))}
                    </div>
                )}

                <div className={s.inputBoxRow}>
                    {settings.aiEnableMultimodal && (
                        <>
                            <input
                                type="file"
                                accept="image/*"
                                multiple
                                ref={fileInputRef}
                                style={{ display: 'none' }}
                                onChange={handleFileSelect}
                            />
                            <button
                                className={`${g.btn} ${g.sm}`}
                                title="添加图片附件"
                                disabled={isGenerating}
                                onClick={() => fileInputRef.current?.click()}
                            >
                                <Icon name="paperclip" size={14} />
                            </button>
                        </>
                    )}

                    <textarea
                        className={s.textarea}
                        placeholder="有问题就会有答案 (Shift + Enter 换行)"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onPaste={handlePaste}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault()
                                handleSend()
                            }
                        }}
                    />
                </div>

                <div className={s.toolbarRow}>
                    {/* Left: Workspace Selector */}
                    <div className={s.workspaceInline}>
                        <div className={s.wsPath}>
                            <Icon name="folder" size={13} />
                            <span>工作目录:</span>
                            {workspaceDir ? (
                                <span className={s.pathText} title={workspaceDir}>{workspaceDir}</span>
                            ) : (
                                <span className={s.unsetText}>未选择</span>
                            )}
                        </div>
                        <div className={s.wsActions}>
                            <button
                                className={`${g.btn} ${g.xs}`}
                                disabled={isGenerating}
                                onClick={handleSelectWorkspace}
                            >
                                {workspaceDir ? '更换' : '选择'}
                            </button>
                            {workspaceDir && (
                                <button
                                    className={`${g.btn} ${g.xs}`}
                                    title="清除工作目录关联"
                                    disabled={isGenerating}
                                    onClick={handleClearWorkspace}
                                >
                                    清除
                                </button>
                            )}
                        </div>

                        {settings.aiEnableWebSearch && (
                            <span className={s.statusBadge} title="联网搜索功能已开启">🌐 联网</span>
                        )}
                        {settings.aiEnableThinking && (
                            <span className={s.statusBadge} title={`深度思考模式已开启 (${settings.aiReasoningEffort || 'default'})`}>
                                💭 思考{settings.aiReasoningEffort && settings.aiReasoningEffort !== 'none' ? ` (${settings.aiReasoningEffort})` : ''}
                            </span>
                        )}
                    </div>

                    {/* Right: Circular Context Progress Ring | Divider | Send Button */}
                    <div className={s.toolbarRight}>
                        <div
                            className={s.contextRingWrapper}
                            onMouseEnter={() => setIsRingHovered(true)}
                            onMouseLeave={() => setIsRingHovered(false)}
                        >
                            <button className={s.ringBtn} aria-label="上下文 Token 使用情况">
                                <svg width="18" height="18" viewBox="0 0 18 18">
                                    <circle
                                        cx="9"
                                        cy="9"
                                        r="7"
                                        fill="none"
                                        stroke="rgba(127, 127, 127, 0.25)"
                                        strokeWidth="2"
                                    />
                                    <circle
                                        cx="9"
                                        cy="9"
                                        r="7"
                                        fill="none"
                                        stroke={getRingColor(percent)}
                                        strokeWidth="2"
                                        strokeDasharray="43.98"
                                        strokeDashoffset={strokeDashoffset}
                                        strokeLinecap="round"
                                    />
                                </svg>
                            </button>

                            {isRingHovered && (
                                <div className={s.tooltipCard}>
                                    <div>{percent.toFixed(1)}% · {formatTokenK(usedTokens)} / {formatTokenK(maxTokens)} 输入上下文已使用</div>
                                    {compressedText && (
                                        <div style={{ marginTop: 4, color: '#faad14', fontSize: 11, fontWeight: 500 }}>
                                            ℹ️ {compressedText}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className={s.divider} />

                        {isGenerating ? (
                            <button
                                className={`${g.btn} ${s.stopBtn}`}
                                title="停止 AI 智能体推导"
                                onClick={handleStop}
                            >
                                <Icon name="stop" size={13} />
                                <span>停止</span>
                            </button>
                        ) : (
                            <button
                                className={`${g.btn} ${g.primary} ${s.sendBtn}`}
                                disabled={!input.trim() && images.length === 0}
                                onClick={handleSend}
                            >
                                发送
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
