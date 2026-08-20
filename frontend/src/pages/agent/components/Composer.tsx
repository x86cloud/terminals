import React, { useState } from 'react'
import { Folder, Square } from 'lucide-react'
import CodeEditor from '@/components/CodeEditor'
import g from '@/styles/global.module.less'
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
    const [isRingHovered, setIsRingHovered] = useState<boolean>(false)
    const strokeDashoffset = 43.98 * (1 - Math.min(100, Math.max(0, percent)) / 100)

    return (
        <div className={s.composerBox}>
            <div className={s.editorWrapper}>
                <CodeEditor
                    value={input}
                    onChange={setInput}
                    lang="plain"
                    lineNumbers={false}
                    minHeight="54px"
                    onEnter={() => onSend()}
                    onModEnter={() => onSend()}
                />
            </div>

            <div className={s.composerFooter}>
                <div className={s.footerLeft}>
                    <div className={s.modeSwitcher}>
                        <button
                            type="button"
                            className={`${s.modeBtn} ${activeMode === 'chat' ? s.active : ''
                                }`}
                            onClick={() => setActiveMode('chat')}
                        >
                            💬 对话
                        </button>
                        <button
                            type="button"
                            className={`${s.modeBtn} ${activeMode === 'plan' ? s.active : ''
                                }`}
                            onClick={() => setActiveMode('plan')}
                        >
                            🎯 规划 (/plan)
                        </button>
                    </div>

                    <div
                        className={s.wsBadge}
                        title={
                            workspaceDir
                                ? `工作目录: ${workspaceDir}`
                                : '未绑定工作目录，点击选择'
                        }
                        onClick={onSelectWorkspace}
                    >
                        <Folder size={12} />
                        <span>
                            {workspaceDir
                                ? workspaceDir.split(/[\\/]/).pop()
                                : '选择目录'}
                        </span>
                    </div>
                    {workspaceDir && (
                        <button
                            type="button"
                            className={`${g.btn} ${g.xs}`}
                            title="清除绑定"
                            onClick={onClearWorkspace}
                        >
                            清除
                        </button>
                    )}
                </div>

                <div className={s.footerRight}>
                    <div
                        className={s.contextRingWrapper}
                        onMouseEnter={() => setIsRingHovered(true)}
                        onMouseLeave={() => setIsRingHovered(false)}
                    >
                        <span className={s.tokenText}>
                            {formatTokenK(usedTokens)} / {formatTokenK(maxTokens)}
                        </span>
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
                                <div>
                                    {percent.toFixed(1)}% · {formatTokenK(usedTokens)} /{' '}
                                    {formatTokenK(maxTokens)} 输入上下文已使用
                                </div>
                                {noticeText && (
                                    <div
                                        style={{
                                            marginTop: 4,
                                            color: '#faad14',
                                            fontSize: 11,
                                            fontWeight: 500,
                                        }}
                                    >
                                        ℹ️ {noticeText}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {isGenerating ? (
                        <button
                            className={`${g.btn} ${s.stopBtn}`}
                            onClick={onStop}
                        >
                            <Square size={12} />
                            <span>停止</span>
                        </button>
                    ) : (
                        <button
                            className={`${g.btn} ${g.primary} ${s.sendBtn}`}
                            disabled={!input.trim() && images.length === 0}
                            onClick={onSend}
                        >
                            发送
                        </button>
                    )}
                </div>
            </div>
        </div>
    )
}

export default Composer
