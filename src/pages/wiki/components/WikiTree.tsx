import { useEffect, useState } from 'react'
import { Button, Input } from 'antd'
import {
    ChevronDown,
    ChevronRight,
    FileCode2,
    FileText,
    Folder,
    FolderOpen,
    Plus,
    Search,
    X,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { API } from '@/api'
import type { WikiSearchHit, WikiTreeNode } from '@/types'
import s from '../WikiPage.module.less'

interface Props {
    tree: WikiTreeNode[]
    selectedPath: string | null
    onSelect: (relPath: string) => void
    onOpenNewPage: () => void
}

export default function WikiTree({ tree, selectedPath, onSelect, onOpenNewPage }: Props) {
    const { t } = useTranslation('wiki')
    const [query, setQuery] = useState('')
    const [hits, setHits] = useState<WikiSearchHit[] | null>(null)
    const [expanded, setExpanded] = useState<Record<string, boolean>>({
        wiki: true,
        'wiki/entities': true,
        'wiki/concepts': true,
        'wiki/runbooks': true,
        'wiki/summaries': true,
        raw: false,
    })

    useEffect(() => {
        const clean = query.trim()
        if (!clean) {
            setHits(null)
            return
        }
        const timer = window.setTimeout(() => {
            void API.wikiSearch(clean, 'all', 30)
                .then((res) => setHits(res))
                .catch(() => setHits([]))
        }, 180)
        return () => window.clearTimeout(timer)
    }, [query])

    const toggleDir = (rel: string) => {
        setExpanded((prev) => ({ ...prev, [rel]: !prev[rel] }))
    }

    const renderNode = (node: WikiTreeNode): React.ReactNode => {
        if (node.kind === 'dir') {
            const isOpen = !!expanded[node.relPath]
            const label = t(`tree.categories.${node.name}`, { defaultValue: node.name })
            return (
                <div key={node.id}>
                    <button
                        type="button"
                        className={s.treeDirBtn}
                        onClick={() => toggleDir(node.relPath)}
                    >
                        {isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                        {isOpen ? <FolderOpen size={13} /> : <Folder size={13} />}
                        <span className={s.treeLabel}>{label}</span>
                        <span className={s.treeCount}>{node.children.length}</span>
                    </button>
                    {isOpen && node.children.length > 0 && (
                        <div className={s.treeGroupChildren}>
                            {node.children.map((ch) => renderNode(ch))}
                        </div>
                    )}
                </div>
            )
        }

        const isSystem =
            node.relPath === 'index.md' ||
            node.relPath === 'log.md' ||
            node.relPath === 'SCHEMA.md'
        const active = node.relPath === selectedPath

        return (
            <button
                key={node.id}
                type="button"
                className={`${s.treeNodeBtn}${active ? ' ' + s.active : ''}`}
                onClick={() => onSelect(node.relPath)}
                title={node.relPath}
            >
                {isSystem ? <FileCode2 size={13} /> : <FileText size={13} />}
                <span className={s.treeLabel}>{node.title || node.name}</span>
            </button>
        )
    }

    return (
        <aside className={s.treePane}>
            <div className={s.treeSearch}>
                <Input
                    size="small"
                    prefix={<Search size={12} />}
                    placeholder={t('tree.searchPlaceholder')}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    suffix={
                        query ? (
                            <X
                                size={12}
                                style={{ cursor: 'pointer' }}
                                onClick={() => setQuery('')}
                            />
                        ) : null
                    }
                />
                <div className={s.treeActionsRow}>
                    <span>
                        {hits !== null
                            ? t('tree.searchResults', { count: hits.length })
                            : 'Markdown Vault'}
                    </span>
                    <Button
                        size="small"
                        type="link"
                        icon={<Plus size={12} />}
                        style={{ padding: 0, height: 'auto', fontSize: 11.5 }}
                        onClick={onOpenNewPage}
                    >
                        {t('actions.newPage')}
                    </Button>
                </div>
            </div>

            <div className={s.treeScroll}>
                {hits !== null ? (
                    hits.length === 0 ? (
                        <div style={{ padding: 14, fontSize: 12, color: 'var(--text-faint)' }}>
                            {t('tree.noSearchResults')}
                        </div>
                    ) : (
                        hits.map((h) => (
                            <button
                                key={h.relPath}
                                type="button"
                                className={`${s.searchHitCard}${h.relPath === selectedPath ? ' ' + s.active : ''}`}
                                onClick={() => onSelect(h.relPath)}
                            >
                                <span className={s.searchHitTitle}>{h.title || h.relPath}</span>
                                <span className={s.searchHitPath}>{h.relPath}</span>
                                {h.snippet && (
                                    <span className={s.searchHitSnippet}>{h.snippet}</span>
                                )}
                            </button>
                        ))
                    )
                ) : (
                    tree.map((node) => renderNode(node))
                )}
            </div>
        </aside>
    )
}
