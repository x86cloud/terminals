import { useEffect, useState } from 'react'
import { Button, Popconfirm, message } from 'antd'
import { BookOpen, Edit3, Eye, Lock, Save, Trash2, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { MarkdownViewer } from '@/components/common/MarkdownViewer'
import type { WikiPageDetail } from '@/types'
import s from '../WikiPage.module.less'

interface Props {
    page: WikiPageDetail | null
    onSave: (relPath: string, content: string) => Promise<void>
    onDelete: (relPath: string) => Promise<void>
    onWikiLinkClick: (target: string) => void
}

const PROTECTED_ROOTS = new Set(['index.md', 'log.md', 'SCHEMA.md'])

export default function WikiViewer({ page, onSave, onDelete, onWikiLinkClick }: Props) {
    const { t } = useTranslation(['wiki', 'common'])
    const [editing, setEditing] = useState(false)
    const [draft, setDraft] = useState('')
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        setEditing(false)
        setDraft(page?.content || '')
    }, [page?.relPath, page?.content])

    if (!page) {
        return (
            <div className={s.viewerPane}>
                <div className={s.emptyState}>
                    <div className={s.emptyIcon}>
                        <BookOpen size={24} />
                    </div>
                    <h3 style={{ margin: 0 }}>{t('wiki:viewer.emptyTitle')}</h3>
                    <p style={{ maxWidth: 420, margin: 0, fontSize: 12.5 }}>
                        {t('wiki:viewer.emptyHint')}
                    </p>
                </div>
            </div>
        )
    }

    const canEdit = !page.readOnly
    const canDelete = !PROTECTED_ROOTS.has(page.relPath)

    const handleSave = async () => {
        if (saving) return
        setSaving(true)
        try {
            await onSave(page.relPath, draft)
            setEditing(false)
            message.success(t('wiki:actions.saveSuccess'))
        } catch (err) {
            message.error(typeof err === 'string' ? err : String(err))
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className={s.viewerPane}>
            <div className={s.viewerHeader}>
                <div className={s.viewerBreadcrumbs}>
                    <span className={s.viewerTitle}>{page.title}</span>
                    <span className={s.viewerRelPath}>{page.relPath}</span>
                </div>

                <div className={s.viewerActions}>
                    {canEdit && !editing && (
                        <Button
                            size="small"
                            icon={<Edit3 size={12} />}
                            onClick={() => {
                                setDraft(page.content)
                                setEditing(true)
                            }}
                        >
                            {t('wiki:actions.edit')}
                        </Button>
                    )}

                    {canEdit && editing && (
                        <>
                            <Button
                                size="small"
                                type="primary"
                                icon={<Save size={12} />}
                                loading={saving}
                                onClick={() => void handleSave()}
                            >
                                {t('wiki:actions.save')}
                            </Button>
                            <Button
                                size="small"
                                icon={<X size={12} />}
                                onClick={() => {
                                    setDraft(page.content)
                                    setEditing(false)
                                }}
                            >
                                {t('wiki:actions.cancelEdit')}
                            </Button>
                            <Button
                                size="small"
                                type="text"
                                icon={<Eye size={12} />}
                                onClick={() => setEditing(false)}
                            >
                                {t('wiki:actions.preview')}
                            </Button>
                        </>
                    )}

                    {canDelete && (
                        <Popconfirm
                            title={t('wiki:actions.deleteConfirm', { path: page.relPath })}
                            okText={t('wiki:actions.delete')}
                            cancelText={t('common:cancel')}
                            onConfirm={() => void onDelete(page.relPath)}
                        >
                            <Button size="small" danger type="text" icon={<Trash2 size={12} />} />
                        </Popconfirm>
                    )}
                </div>
            </div>

            {page.readOnly && (
                <div className={s.rawBanner}>
                    <Lock size={13} />
                    <span>{t('wiki:viewer.readOnlyRaw')}</span>
                </div>
            )}

            {editing ? (
                <div className={s.editorWrap}>
                    <textarea
                        className={s.editorTextarea}
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => {
                            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
                                e.preventDefault()
                                void handleSave()
                            }
                        }}
                    />
                </div>
            ) : (
                <div className={s.viewerScroll}>
                    <div className={s.viewerInner}>
                        <MarkdownViewer
                            content={page.body}
                            className={s.markdownProse}
                            onWikiLinkClick={onWikiLinkClick}
                        />
                    </div>
                </div>
            )}
        </div>
    )
}
