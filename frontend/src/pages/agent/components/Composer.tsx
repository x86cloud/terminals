import React, { useState } from 'react'
import { Button, Radio, Tag, Tooltip, Space } from 'antd'
import { Folder, Square, Send, X } from 'lucide-react'
import CodeEditor from '@/components/CodeEditor'
import s from './Composer.module.less'

interface ComposerProps {
    input: string
    setInput: (val: string) => void
    textareaRef?: React.RefObject<any>
    activeMode: 'chat' | 'plan'
    setActiveMode: (mode: 'chat' | 'plan') => void
    workspaceDir: string
    onSelectWorkspace: () => void
    onClearWorkspace: () => void
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
    activeMode,
    setActiveMode,
    workspaceDir,
    onSelectWorkspace,
    onClearWorkspace,
    usedTokens,
    maxTokens,
    percent,
    noticeText,
    isGenerating,
    images,
    onStop,
    onSend,
}) => {
    const strokeDashoffset = 43.98 * (1 - Math.min(100, Math.max(0, percent)) / 100)

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
            <div className={s.editorWrapper}>
                <CodeEditor
                    value={input}
                    onChange={setInput}
                    lang="plain"
                    lineNumbers={false}
                    bordered={false}
                    minHeight="84px"
                    onEnter={() => onSend()}
                    onModEnter={() => onSend()}
                />
            </div>

            <div className={s.composerFooter} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px' }}>
                <div className={s.footerLeft} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Radio.Group
                        size="small"
                        block
                        optionType="button"
                        buttonStyle="solid"
                        value={activeMode}
                        onChange={(e) => setActiveMode(e.target.value)}
                        options={[
                            { label: '对话', value: 'chat' },
                            { label: '规划', value: 'plan' },
                        ]}
                    />

                    <div className={s.workspaceBox}>
                        <div
                            className={s.workspaceTagTrigger}
                            onClick={onSelectWorkspace}
                            title={workspaceDir ? `工作目录: ${workspaceDir} (点击切换)` : '未绑定工作目录，点击选择'}
                        >
                            <Folder size={12} color={workspaceDir ? 'var(--accent)' : 'var(--text-dim)'} />
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
                </div>

                <div className={s.footerRight}>
                    <Tooltip title={tokenTooltipContent}>
                        <div className={s.tokenInfo}>
                            <span className={s.tokenLabel}>
                                {formatTokenK(usedTokens)} / {formatTokenK(maxTokens)}
                            </span>
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
