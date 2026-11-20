import { useState } from 'react'
import { ChevronRight, Copy, Check, Terminal } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { copyText } from '@/utils'
import s from '../AgentPage.module.less'

interface Props {
    command: string
    stdout: string
    stderr: string
    exitCode: number
    durationMs: number
    truncated: boolean
    status: 'running' | 'completed' | 'failed' | 'cancelled'
}

export default function TerminalCard({
    command,
    stdout,
    stderr,
    exitCode,
    durationMs,
    truncated,
    status,
}: Props) {
    const { t } = useTranslation('agent')
    const [open, setOpen] = useState(true)
    const [copied, setCopied] = useState(false)

    const badgeClass =
        status === 'running'
            ? s.running
            : status === 'completed' && exitCode === 0
              ? s.ok
              : s.fail
    const badgeLabel =
        status === 'running'
            ? t('terminal.statusRunning')
            : status === 'cancelled'
              ? t('terminal.statusCancelled')
              : `exit ${exitCode}`

    const handleCopy = (e: React.MouseEvent) => {
        e.stopPropagation()
        void copyText(command).then((ok) => {
            if (!ok) return
            setCopied(true)
            window.setTimeout(() => setCopied(false), 1500)
        })
    }

    return (
        <div className={s.terminalCard}>
            <div className={s.terminalHead} onClick={() => setOpen((v) => !v)}>
                <div className={s.terminalCmd} title={command}>
                    <Terminal size={13} />
                    <code>$ {command}</code>
                </div>
                <div className={s.terminalMeta}>
                    {durationMs > 0 && (
                        <span className={s.toolDuration}>
                            {(durationMs / 1000).toFixed(2)}s
                        </span>
                    )}
                    <span className={`${s.exitBadge} ${badgeClass}`}>{badgeLabel}</span>
                    <button
                        type="button"
                        className={s.actionBtn}
                        onClick={handleCopy}
                        title={t('terminal.copyCommand')}
                    >
                        {copied ? <Check size={12} /> : <Copy size={12} />}
                    </button>
                    <ChevronRight
                        size={13}
                        className={`${s.thoughtChevron}${open ? ' ' + s.open : ''}`}
                    />
                </div>
            </div>
            {open && (
                <div className={s.terminalBody}>
                    {stdout ? <div>{stdout}</div> : null}
                    {stderr ? <div className={s.terminalStderr}>{stderr}</div> : null}
                    {!stdout && !stderr && (
                        <span className={s.terminalEmpty}>
                            {status === 'running'
                                ? t('terminal.running')
                                : t('terminal.emptyOutput')}
                        </span>
                    )}
                    {truncated && (
                        <div className={s.terminalEmpty} style={{ marginTop: 4 }}>
                            {t('terminal.truncated')}
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
