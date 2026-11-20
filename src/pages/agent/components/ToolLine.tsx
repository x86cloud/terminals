import { useState } from 'react'
import {
    BookOpen,
    Check,
    ChevronRight,
    FilePenLine,
    FilePlus2,
    FileText,
    Folder,
    FolderTree,
    Globe,
    Loader2,
    Search,
    Server,
    Stethoscope,
    Wrench,
    XCircle,
} from 'lucide-react'
import s from '../AgentPage.module.less'

interface Props {
    tool: string
    title: string
    args: any
    observation?: string
    result?: any
    error?: string
    status: 'running' | 'completed' | 'failed' | 'cancelled'
    durationMs: number
}

function pickIcon(tool: string, status: Props['status']) {
    if (status === 'running') return <Loader2 size={13} className={s.spin} />
    if (status === 'failed' || status === 'cancelled') return <XCircle size={13} />
    if (tool === 'web_search' || tool === 'web_fetch') return <Globe size={13} />
    if (tool === 'list_agents') return <Server size={13} />
    if (tool === 'local_list') return <Folder size={13} />
    if (tool === 'local_read' || tool === 'wiki_read') return <FileText size={13} />
    if (tool === 'local_tree') return <FolderTree size={13} />
    if (tool === 'local_write' || tool === 'wiki_write') return <FilePenLine size={13} />
    if (tool === 'wiki_index') return <BookOpen size={13} />
    if (tool === 'wiki_search') return <Search size={13} />
    if (tool === 'wiki_ingest_raw') return <FilePlus2 size={13} />
    if (tool === 'wiki_lint') return <Stethoscope size={13} />
    if (status === 'completed') return <Check size={13} />
    return <Wrench size={13} />
}

export default function ToolLine({
    tool,
    title,
    args,
    observation,
    result,
    error,
    status,
    durationMs,
}: Props) {
    const [open, setOpen] = useState(false)
    const secText = durationMs > 0 ? `${(durationMs / 1000).toFixed(1)}s` : ''
    const detailText =
        observation ||
        error ||
        (result !== undefined ? JSON.stringify(result, null, 2) : '')

    return (
        <div className={s.toolLineWrap}>
            <button
                type="button"
                className={s.toolLineHead}
                onClick={() => setOpen((v) => !v)}
            >
                {pickIcon(tool, status)}
                <span className={s.toolTitle}>{title}</span>
                {secText && <span className={s.toolDuration}>{secText}</span>}
                <ChevronRight
                    size={12}
                    className={`${s.thoughtChevron}${open ? ' ' + s.open : ''}`}
                />
            </button>
            {open && (
                <div className={s.toolDetail}>
                    {args !== undefined && (
                        <div>
                            <strong>Args:</strong> {typeof args === 'string' ? args : JSON.stringify(args, null, 2)}
                        </div>
                    )}
                    {detailText && (
                        <div style={{ marginTop: 6 }}>
                            <strong>Result:</strong> {detailText}
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
