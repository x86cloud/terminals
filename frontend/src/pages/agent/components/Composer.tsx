import React, { useState, useMemo } from 'react'
import { Button, Tooltip, Input, Dropdown } from 'antd'
import type { MenuProps } from 'antd'
import { Folder, Square, X, FileText, MessageSquare, ChevronUp, Check } from 'lucide-react'
import { SlashCommandMenu, SlashCommandType, SLASH_COMMANDS } from './SlashCommandMenu'
import { AiModelItem } from '@/types'
import s from './Composer.module.less'

const { TextArea } = Input

interface ComposerProps {
    input: string
    setInput: (val: string) => void
    textareaRef?: React.RefObject<any>
    activeCommand: 'plan' | 'grill-me' | null
    setActiveCommand: (cmd: 'plan' | 'grill-me' | null) => void
    workspaceDir: string
    onSelectWorkspace: () => void
    onClearWorkspace: () => void
    aiModel?: string
    aiModels?: AiModelItem[]
    activeModelId?: string
    onSelectModel?: (id: string) => void
    usedTokens: number
    maxTokens: number
    percent: number
    noticeText?: string
    isGenerating: boolean
    images: string[]
    onStop: () => void
    onSend: () => void
    onKeyDown?: (e: any) => void
}

const formatTokenK = (tokens: number): string => {
    if (tokens >= 1000000) {
        return `${(tokens / 1000000).toFixed(1)}M`
    }
    if (tokens >= 1000) {
        return `${(tokens / 1000).toFixed(0)}k`
    }
    return `${tokens}`
}

const getRingColor = (pct: number): string => {
    if (pct > 85) return '#ff4d4f'
    if (pct > 65) return '#faad14'
    return '#2b90ee'
}

export const Composer: React.FC<ComposerProps> = ({
    input,
    setInput,
    textareaRef,
    activeCommand,
    setActiveCommand,
    workspaceDir,
    onSelectWorkspace,
    onClearWorkspace,
    aiModel,
    aiModels,
    activeModelId,
    onSelectModel,
    usedTokens,
    maxTokens,
    percent,
    noticeText,
    isGenerating,
    images,
    onStop,
    onSend,
    onKeyDown,
}) => {
    const [isComposing, setIsComposing] = useState(false)
    const [selectedMenuIndex, setSelectedMenuIndex] = useState(0)

    const activeModel = useMemo(() => {
        if (!aiModels || aiModels.length === 0) return null
        return aiModels.find((m) => m.id === activeModelId) || aiModels[0]
    }, [aiModels, activeModelId])

    const displayModelName = activeModel?.name || aiModel || '未配置模型'
    const tooltipText = activeModel
        ? `当前推理模型: ${activeModel.name} (${activeModel.model})${aiModels && aiModels.length > 1 ? ' - 点击切换' : ''}`
        : `当前推理模型: ${aiModel || '未配置模型'}`

    const modelMenuItems: MenuProps['items'] = useMemo(() => {
        if (!aiModels || aiModels.length === 0) {
            return [
                {
                    key: 'empty',
                    disabled: true,
                    label: <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>暂无可选模型</span>,
                },
            ]
        }
        return aiModels.map((m) => {
            const isSelected = m.id === (activeModel?.id || activeModelId)
            return {
                key: m.id,
                label: (
                    <div className={s.modelDropdownItem}>
                        <div className={s.modelItemMain}>
                            <span className={s.modelItemName}>{m.name || m.model}</span>
                            <span className={s.modelItemId}>{m.model}</span>
                        </div>
                        {isSelected && <Check size={14} className={s.modelItemCheck} />}
                    </div>
                ),
            }
        })
    }, [aiModels, activeModelId, activeModel])

    const strokeDashoffset = 43.98 * (1 - Math.min(100, Math.max(0, percent)) / 100)

    // Check if slash command menu should be visible
    const isSlashPrefix = !activeCommand && input.startsWith('/')
    const menuFilterText = isSlashPrefix ? input.slice(1) : ''

    const filteredCommands = useMemo(() => {
        if (!isSlashPrefix) return []
        const query = menuFilterText.toLowerCase().trim()
        if (!query) return SLASH_COMMANDS
        return SLASH_COMMANDS.filter(
            (c) =>
                c.command.toLowerCase().includes(query) ||
                c.key.toLowerCase().includes(query) ||
                c.title.toLowerCase().includes(query)
        )
    }, [isSlashPrefix, menuFilterText])

    const handleSelectCommand = (cmdKey: SlashCommandType) => {
        setActiveCommand(cmdKey)
        setInput('')
        if (textareaRef?.current) {
            textareaRef.current.focus()
        }
    }

    const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const val = e.target.value
        if (!activeCommand) {
            if (val.startsWith('/plan ')) {
                setActiveCommand('plan')
                setInput(val.slice(6))
                return
            }
            if (val.startsWith('/grill-me ')) {
                setActiveCommand('grill-me')
                setInput(val.slice(10))
                return
            }
        }
        setInput(val)
        setSelectedMenuIndex(0)
    }

    const handleInternalKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        // 1. Handle Slash Command Navigation
        if (isSlashPrefix && filteredCommands.length > 0) {
            if (e.key === 'ArrowDown') {
                e.preventDefault()
                setSelectedMenuIndex((prev) => (prev + 1) % filteredCommands.length)
                return
            }
            if (e.key === 'ArrowUp') {
                e.preventDefault()
                setSelectedMenuIndex(
                    (prev) => (prev - 1 + filteredCommands.length) % filteredCommands.length
                )
                return
            }
            if (e.key === 'Enter' || e.key === 'Tab') {
                e.preventDefault()
                const chosen = filteredCommands[selectedMenuIndex] || filteredCommands[0]
                if (chosen) {
                    handleSelectCommand(chosen.key)
                }
                return
            }
            if (e.key === 'Escape') {
                e.preventDefault()
                setInput('')
                return
            }
        }

        // 2. Handle Backspace on empty input to remove activeCommand pill
        if (e.key === 'Backspace' && !input && activeCommand) {
            e.preventDefault()
            setActiveCommand(null)
            return
        }

        // 3. Normal Enter to Send
        if (e.key === 'Enter' && !e.shiftKey) {
            if (isComposing || (e.nativeEvent as any).isComposing) {
                return
            }
            e.preventDefault()
            if (input.trim() || images.length > 0) {
                onSend()
            }
        } else if (onKeyDown) {
            onKeyDown(e)
        }
    }

    const placeholderText = useMemo(() => {
        if (activeCommand === 'plan') {
            return '输入规划目标与需求，Enter 提交技术方案推演...'
        }
        if (activeCommand === 'grill-me') {
            return '描述待访谈任务或设计目标，Enter 开启交互式深度访谈...'
        }
        return '输入消息，或键入 / 选择快捷指令（Enter 发送，Shift+Enter 换行）...'
    }, [activeCommand])

    const tokenTooltipContent = (
        <div>
            <div>
                {percent.toFixed(1)}% · {formatTokenK(usedTokens)} / {formatTokenK(maxTokens)} 输入上下文已使用
            </div>
            {noticeText && (
                <div style={{ marginTop: 4, color: '#faad14', fontSize: 11, fontWeight: 500 }}>
                    ℹ️ {noticeText}
                </div>
            )}
        </div>
    )

    return (
        <div className={s.composerBox}>
            {/* Slash Command Popup Menu */}
            <SlashCommandMenu
                visible={isSlashPrefix}
                filterText={input}
                selectedIndex={selectedMenuIndex}
                onSelect={handleSelectCommand}
                onClose={() => setInput('')}
            />

            {/* Input & Active Command Pill */}
            <div className={s.editorWrapper}>
                {activeCommand && (
                    <div
                        className={`${s.commandPill} ${
                            activeCommand === 'plan' ? s.plan : s.grillMe
                        }`}
                    >
                        <span className={s.commandPillIcon}>
                            {activeCommand === 'plan' ? (
                                <FileText size={13} color="#2b90ee" />
                            ) : (
                                <MessageSquare size={13} color="#a855f7" />
                            )}
                        </span>
                        <span className={s.commandPillText}>{activeCommand}</span>
                        <span
                            className={s.commandPillClose}
                            onClick={(e) => {
                                e.stopPropagation()
                                setActiveCommand(null)
                                if (textareaRef?.current) textareaRef.current.focus()
                            }}
                            title="移除指令 (恢复普通对话)"
                        >
                            <X size={11} />
                        </span>
                    </div>
                )}

                <TextArea
                    ref={textareaRef}
                    className={s.textareaInput}
                    value={input}
                    onChange={handleInputChange}
                    onCompositionStart={() => setIsComposing(true)}
                    onCompositionEnd={() => setIsComposing(false)}
                    onKeyDown={handleInternalKeyDown}
                    placeholder={placeholderText}
                    autoSize={{ minRows: 2, maxRows: 8 }}
                    variant="borderless"
                />
            </div>

            {/* Footer Toolbar */}
            <div className={s.composerFooter}>
                <div className={s.footerLeft}>
                    {/* Workspace Directory Trigger */}
                    <div className={s.workspaceBox}>
                        <div
                            className={s.workspaceTagTrigger}
                            onClick={onSelectWorkspace}
                            title={
                                workspaceDir
                                    ? `工作目录: ${workspaceDir} (点击切换)`
                                    : '未绑定工作目录，点击选择'
                            }
                        >
                            <Folder
                                size={12}
                                color={workspaceDir ? 'var(--accent)' : 'var(--text-dim)'}
                                style={{ flexShrink: 0 }}
                            />
                            <span>{workspaceDir ? workspaceDir.split(/[\\/]/).pop() : '选择目录'}</span>
                        </div>
                        {workspaceDir && (
                            <span
                                className={s.workspaceClearBtn}
                                onClick={(e) => {
                                    e.stopPropagation()
                                    onClearWorkspace()
                                }}
                                title="清除绑定的工作目录"
                            >
                                <X size={11} />
                            </span>
                        )}
                    </div>

                    {/* Model Indicator (Antigravity Style with Dropdown) */}
                    {aiModels && aiModels.length > 0 ? (
                        <Dropdown
                            menu={{
                                items: modelMenuItems,
                                onClick: ({ key }) => {
                                    if (key !== 'empty') {
                                        onSelectModel?.(key)
                                    }
                                },
                            }}
                            trigger={['click']}
                            placement="topLeft"
                        >
                            <div
                                className={s.modelIndicator}
                                title={tooltipText}
                            >
                                <span className={s.modelName}>{displayModelName}</span>
                                <ChevronUp size={12} className={s.modelCaret} />
                            </div>
                        </Dropdown>
                    ) : (
                        <div
                            className={s.modelIndicator}
                            title={tooltipText}
                        >
                            <span className={s.modelName}>{displayModelName}</span>
                            <ChevronUp size={12} className={s.modelCaret} />
                        </div>
                    )}
                </div>

                <div className={s.footerRight}>
                    <Tooltip title={tokenTooltipContent}>
                        <div className={s.tokenInfo}>
                            <span className={s.tokenLabel}>
                                {formatTokenK(usedTokens)} / {formatTokenK(maxTokens)}
                            </span>
                            <svg width="18" height="18" viewBox="0 0 18 18" style={{ flexShrink: 0 }}>
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
                        </div>
                    </Tooltip>

                    {isGenerating ? (
                        <Button
                            size="small"
                            danger
                            icon={<Square size={12} />}
                            onClick={onStop}
                        >
                            停止
                        </Button>
                    ) : (
                        <Button
                            size="small"
                            type="primary"
                            disabled={!input.trim() && images.length === 0}
                            onClick={onSend}
                        >
                            发送
                        </Button>
                    )}
                </div>
            </div>
        </div>
    )
}

export default Composer
