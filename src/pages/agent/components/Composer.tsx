import { useEffect, useMemo, useRef, useState } from 'react'
import { Select, Tooltip } from 'antd'
import { ArrowUp, Compass, Folder, Square, X, Zap } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import ClientIcon from '@/components/ClientIcon'
import type { AgentMode, AiModelItem, SubAgentInfo } from '@/types'
import s from '../AgentPage.module.less'

interface Props {
    streaming: boolean
    mode: AgentMode
    onModeChange: (m: AgentMode) => void
    modelId: string
    onModelChange: (id: string) => void
    models: AiModelItem[]
    workspaceDir: string
    onPickWorkspace: () => void
    onClearWorkspace: () => void
    subagents: SubAgentInfo[]
    aiEnabled: boolean
    onSend: (text: string, mentions: string[]) => void
    onStop: () => void
    externalDraft?: string | null
    onExternalDraftConsumed?: () => void
}

const MENTION_EXTRACT_RE = /@((?:ssh|mysql):[^\s]+)/g

function getWorkspaceLeafName(dir: string): string {
    const parts = dir.trim().replace(/[\\/]+$/, '').split(/[\\/]/)
    return parts[parts.length - 1] || dir
}

interface MentionMatch {
    start: number
    end: number
    query: string
}

function findMentionAtCaret(val: string, caret: number): MentionMatch | null {
    const before = val.slice(0, caret)
    const atIdx = before.lastIndexOf('@')
    if (atIdx < 0) return null
    if (atIdx > 0 && !/\s/.test(before[atIdx - 1])) return null
    const query = before.slice(atIdx + 1)
    if (/\s/.test(query)) return null
    return { start: atIdx, end: caret, query }
}

export default function Composer({
    streaming,
    mode,
    onModeChange,
    modelId,
    onModelChange,
    models,
    workspaceDir,
    onPickWorkspace,
    onClearWorkspace,
    subagents,
    aiEnabled,
    onSend,
    onStop,
    externalDraft,
    onExternalDraftConsumed,
}: Props) {
    const { t } = useTranslation('agent')
    const [text, setText] = useState('')
    const [mentionMatch, setMentionMatch] = useState<MentionMatch | null>(null)
    const [mentionIdx, setMentionIdx] = useState(0)
    const textareaRef = useRef<HTMLTextAreaElement>(null)

    const enabledAgents = useMemo(
        () => subagents.filter((a) => a.enabled),
        [subagents]
    )

    const filteredAgents = useMemo(() => {
        if (!mentionMatch) return []
        const q = mentionMatch.query.toLowerCase()
        if (!q) return enabledAgents
        return enabledAgents.filter(
            (a) =>
                a.name.toLowerCase().includes(q) ||
                a.host.toLowerCase().includes(q) ||
                a.agentId.toLowerCase().includes(q)
        )
    }, [enabledAgents, mentionMatch])

    useEffect(() => {
        if (externalDraft) {
            setText(externalDraft)
            onExternalDraftConsumed?.()
            textareaRef.current?.focus()
        }
    }, [externalDraft, onExternalDraftConsumed])

    useEffect(() => {
        const el = textareaRef.current
        if (!el) return
        el.style.height = 'auto'
        el.style.height = `${Math.min(180, Math.max(24, el.scrollHeight))}px`
    }, [text])

    const updateMentionDetection = (val: string, caret: number | null) => {
        if (caret === null) {
            setMentionMatch(null)
            return
        }
        const m = findMentionAtCaret(val, caret)
        setMentionMatch(m)
        setMentionIdx(0)
    }

    const insertMention = (agent: SubAgentInfo) => {
        if (!mentionMatch) return
        const token = `@${agent.agentId} `
        const nextText =
            text.slice(0, mentionMatch.start) + token + text.slice(mentionMatch.end)
        const nextCaret = mentionMatch.start + token.length
        setText(nextText)
        setMentionMatch(null)
        requestAnimationFrame(() => {
            const el = textareaRef.current
            if (el) {
                el.focus()
                el.setSelectionRange(nextCaret, nextCaret)
            }
        })
    }

    const submit = () => {
        const clean = text.trim()
        if (!clean || streaming) return
        const mentions: string[] = []
        let m: RegExpExecArray | null
        MENTION_EXTRACT_RE.lastIndex = 0
        while ((m = MENTION_EXTRACT_RE.exec(clean)) !== null) {
            if (!mentions.includes(m[1])) mentions.push(m[1])
        }
        setText('')
        setMentionMatch(null)
        onSend(clean, mentions)
    }

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (mentionMatch && filteredAgents.length > 0) {
            if (e.key === 'ArrowDown') {
                e.preventDefault()
                setMentionIdx((i) => (i + 1) % filteredAgents.length)
                return
            }
            if (e.key === 'ArrowUp') {
                e.preventDefault()
                setMentionIdx((i) => (i - 1 + filteredAgents.length) % filteredAgents.length)
                return
            }
            if ((e.key === 'Enter' || e.key === 'Tab') && !e.nativeEvent.isComposing) {
                e.preventDefault()
                insertMention(filteredAgents[mentionIdx] || filteredAgents[0])
                return
            }
            if (e.key === 'Escape') {
                e.preventDefault()
                setMentionMatch(null)
                return
            }
        } else if (mentionMatch && e.key === 'Escape') {
            e.preventDefault()
            setMentionMatch(null)
            return
        }

        if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault()
            submit()
        }
    }

    return (
        <div className={s.composerOuter}>
            <div className={s.composerBox}>
                {mentionMatch && (
                    <div className={s.mentionMenu}>
                        <div className={s.mentionHead}>
                            {enabledAgents.length > 0
                                ? t('composer.mentionHeader')
                                : t('composer.mentionEmpty')}
                        </div>
                        {filteredAgents.map((agent, idx) => (
                            <button
                                key={agent.agentId}
                                type="button"
                                className={`${s.mentionOption}${idx === mentionIdx ? ' ' + s.selected : ''}`}
                                onMouseDown={(e) => {
                                    e.preventDefault()
                                    insertMention(agent)
                                }}
                            >
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                    <ClientIcon kind={(agent.kind as any) || 'ssh'} size={13} />
                                    <strong>{agent.name}</strong>
                                </span>
                                <span className={s.subItemHost}>
                                    {agent.user}@{agent.host}
                                </span>
                            </button>
                        ))}
                    </div>
                )}

                <textarea
                    ref={textareaRef}
                    rows={1}
                    className={s.composerTextarea}
                    value={text}
                    placeholder={
                        aiEnabled
                            ? t('composer.placeholderEnabled')
                            : t('composer.placeholderDisabled')
                    }
                    onChange={(e) => {
                        const val = e.target.value
                        setText(val)
                        updateMentionDetection(val, e.target.selectionStart)
                    }}
                    onClick={(e) =>
                        updateMentionDetection(
                            e.currentTarget.value,
                            e.currentTarget.selectionStart
                        )
                    }
                    onKeyDown={handleKeyDown}
                />

                <div className={s.composerBar}>
                    <div className={s.composerLeft}>
                        <button
                            type="button"
                            className={`${s.modeBtn}${mode === 'planning' ? ' ' + s.planning : ''}`}
                            onClick={() =>
                                onModeChange(mode === 'planning' ? 'fast' : 'planning')
                            }
                            title={
                                mode === 'planning'
                                    ? t('composer.planningTitle')
                                    : t('composer.fastTitle')
                            }
                        >
                            {mode === 'planning' ? (
                                <Compass size={12} />
                            ) : (
                                <Zap size={12} />
                            )}
                            <span>{mode === 'planning' ? 'Planning' : 'Fast'}</span>
                        </button>

                        {workspaceDir ? (
                            <div className={s.workspaceWrap}>
                                <Tooltip title={workspaceDir}>
                                    <button
                                        type="button"
                                        className={`${s.workspaceBtn} ${s.bound}`}
                                        disabled={streaming}
                                        onClick={onPickWorkspace}
                                    >
                                        <Folder size={12} />
                                        <span className={s.workspaceName}>
                                            {getWorkspaceLeafName(workspaceDir)}
                                        </span>
                                    </button>
                                </Tooltip>
                                <button
                                    type="button"
                                    className={s.workspaceClearBtn}
                                    disabled={streaming}
                                    onClick={onClearWorkspace}
                                    title={t('composer.workspaceClearTip')}
                                >
                                    <X size={11} />
                                </button>
                            </div>
                        ) : (
                            <Tooltip title={t('composer.workspaceUnsetTip')}>
                                <button
                                    type="button"
                                    className={s.workspaceBtn}
                                    disabled={streaming}
                                    onClick={onPickWorkspace}
                                >
                                    <Folder size={12} />
                                    <span>{t('composer.workspaceUnset')}</span>
                                </button>
                            </Tooltip>
                        )}

                        {models.length > 0 && (
                            <Select
                                size="small"
                                variant="borderless"
                                value={modelId || models[0].id}
                                onChange={onModelChange}
                                popupMatchSelectWidth={false}
                                style={{ minWidth: 120, fontSize: 12 }}
                                options={models.map((m) => ({
                                    value: m.id,
                                    label: m.name || m.model,
                                }))}
                            />
                        )}
                    </div>

                    <div className={s.composerRight}>
                        <span className={s.composerHint}>{t('composer.hint')}</span>
                        {streaming ? (
                            <button
                                type="button"
                                className={`${s.sendBtn} ${s.stop}`}
                                onClick={onStop}
                                title={t('composer.stop')}
                            >
                                <Square size={12} fill="currentColor" />
                            </button>
                        ) : (
                            <button
                                type="button"
                                className={s.sendBtn}
                                disabled={!text.trim()}
                                onClick={submit}
                                title={t('composer.send')}
                            >
                                <ArrowUp size={15} />
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
