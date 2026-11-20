import { ArrowLeft, ArrowUpRight, FileText, Tag } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { WikiPageDetail } from '@/types'
import s from '../WikiPage.module.less'

interface Props {
    page: WikiPageDetail
    onNavigate: (relPath: string) => void
}

export default function WikiMetaPanel({ page, onNavigate }: Props) {
    const { t } = useTranslation('wiki')

    return (
        <aside className={s.metaPane}>
            <div className={s.metaSection}>
                <span className={s.metaLabel}>{t('meta.path')}</span>
                <span className={s.metaValue} style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                    {page.relPath}
                </span>
            </div>

            <div className={s.metaSection}>
                <span className={s.metaLabel}>{t('meta.category')}</span>
                <span className={s.metaValue}>{page.category}</span>
            </div>

            {page.updated && (
                <div className={s.metaSection}>
                    <span className={s.metaLabel}>{t('meta.updated')}</span>
                    <span className={s.metaValue}>{page.updated}</span>
                </div>
            )}

            <div className={s.metaSection}>
                <span className={s.metaLabel}>
                    <Tag size={11} style={{ marginRight: 4, verticalAlign: '-1px' }} />
                    {t('meta.tags')}
                </span>
                {page.tags.length === 0 ? (
                    <span style={{ fontSize: 11.5, color: 'var(--text-faint)' }}>
                        {t('meta.noTags')}
                    </span>
                ) : (
                    <div className={s.tagRow}>
                        {page.tags.map((tg) => (
                            <span key={tg} className={s.tagChip}>
                                #{tg}
                            </span>
                        ))}
                    </div>
                )}
            </div>

            <div className={s.metaSection}>
                <span className={s.metaLabel}>
                    {t('meta.backlinks', { count: page.backlinks.length })}
                </span>
                {page.backlinks.length === 0 ? (
                    <span style={{ fontSize: 11.5, color: 'var(--text-faint)' }}>
                        {t('meta.noLinks')}
                    </span>
                ) : (
                    <div className={s.linkList}>
                        {page.backlinks.map((bl) => (
                            <button
                                key={bl.relPath}
                                type="button"
                                className={s.linkChipBtn}
                                onClick={() => onNavigate(bl.relPath)}
                                title={bl.relPath}
                            >
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                                    <ArrowLeft size={11} />
                                    {bl.title}
                                </span>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            <div className={s.metaSection}>
                <span className={s.metaLabel}>
                    {t('meta.outboundLinks', { count: page.outboundLinks.length })}
                </span>
                {page.outboundLinks.length === 0 ? (
                    <span style={{ fontSize: 11.5, color: 'var(--text-faint)' }}>
                        {t('meta.noLinks')}
                    </span>
                ) : (
                    <div className={s.linkList}>
                        {page.outboundLinks.map((ol) => (
                            <button
                                key={`${ol.raw}_${ol.relPath}`}
                                type="button"
                                className={`${s.linkChipBtn}${ol.broken ? ' ' + s.broken : ''}`}
                                disabled={ol.broken}
                                onClick={() => ol.relPath && onNavigate(ol.relPath)}
                                title={ol.relPath || ol.raw}
                            >
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                                    <ArrowUpRight size={11} />
                                    {ol.title}
                                </span>
                                {ol.broken && <span className={s.brokenTag}>{t('meta.broken')}</span>}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {page.sources.length > 0 && (
                <div className={s.metaSection}>
                    <span className={s.metaLabel}>
                        {t('meta.sources', { count: page.sources.length })}
                    </span>
                    <div className={s.linkList}>
                        {page.sources.map((src) => (
                            <button
                                key={src}
                                type="button"
                                className={s.linkChipBtn}
                                onClick={() => onNavigate(src)}
                                title={src}
                            >
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                                    <FileText size={11} />
                                    {src}
                                </span>
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </aside>
    )
}
