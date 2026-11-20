import { useCallback, useEffect, useState } from 'react'
import { Button, Input, Modal, Segmented, Select, Tooltip, message } from 'antd'
import {
    BookOpen,
    FilePlus2,
    Folder,
    FolderOpen,
    Network,
    RefreshCw,
    RotateCcw,
    Stethoscope,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { API, subscribe } from '@/api'
import { useSession } from '@/contexts/SessionContext'
import type {
    AppSettings,
    WikiGraphData,
    WikiInfo,
    WikiPageDetail,
    WikiTreeNode,
} from '@/types'
import WikiGraphView from './components/WikiGraphView'
import WikiIngestModal from './components/WikiIngestModal'
import WikiMetaPanel from './components/WikiMetaPanel'
import WikiTree from './components/WikiTree'
import WikiViewer from './components/WikiViewer'
import s from './WikiPage.module.less'

interface Props {
    settings: AppSettings
    onUpdateSettings?: (newSettings: AppSettings) => Promise<void>
}

export default function WikiPage({ settings, onUpdateSettings }: Props) {
    const { t } = useTranslation(['wiki', 'common'])
    const { dispatchAgentPrompt } = useSession()

    const [viewMode, setViewMode] = useState<'docs' | 'graph'>('docs')
    const [info, setInfo] = useState<WikiInfo | null>(null)
    const [tree, setTree] = useState<WikiTreeNode[]>([])
    const [selectedPath, setSelectedPath] = useState<string | null>('index.md')
    const [pageDetail, setPageDetail] = useState<WikiPageDetail | null>(null)
    const [graph, setGraph] = useState<WikiGraphData>({ nodes: [], edges: [] })

    const [ingestOpen, setIngestOpen] = useState(false)
    const [newPageOpen, setNewPageOpen] = useState(false)
    const [newCategory, setNewCategory] = useState('runbooks')
    const [newSlug, setNewSlug] = useState('')
    const [newHeading, setNewHeading] = useState('')

    const loadOverview = useCallback(async () => {
        try {
            const [infoRes, treeRes] = await Promise.all([
                API.wikiGetInfo(),
                API.wikiListTree(),
            ])
            setInfo(infoRes)
            setTree(treeRes)
        } catch (err) {
            message.error(typeof err === 'string' ? err : String(err))
        }
    }, [])

    const loadPage = useCallback(async (relPath: string) => {
        try {
            const detail = await API.wikiReadPage(relPath)
            setSelectedPath(detail.relPath)
            setPageDetail(detail)
        } catch (err) {
            message.error(typeof err === 'string' ? err : String(err))
        }
    }, [])

    const loadGraph = useCallback(async () => {
        try {
            const g = await API.wikiGetGraph()
            setGraph(g)
        } catch {
            /* ignore */
        }
    }, [])

    useEffect(() => {
        void loadOverview()
        void loadPage('index.md')
    }, [loadOverview, loadPage, settings.aiWikiDir])

    useEffect(() => {
        if (viewMode === 'graph') {
            void loadGraph()
        }
    }, [viewMode, loadGraph])

    useEffect(() => {
        const unsub = subscribe('wiki:changed', (payload: any) => {
            void loadOverview()
            if (viewMode === 'graph') {
                void loadGraph()
            }
            const changedPath = String(payload?.relPath || '')
            if (selectedPath && (!changedPath || changedPath === selectedPath)) {
                void loadPage(selectedPath).catch(() => {})
            }
        })
        return () => unsub()
    }, [loadOverview, loadGraph, loadPage, selectedPath, viewMode])

    const resolveAndNavigateLink = useCallback(
        (target: string) => {
            // Try outbound resolved path first if current page has it
            const resolved = pageDetail?.outboundLinks.find(
                (ol) =>
                    !ol.broken &&
                    (ol.raw === target || ol.relPath === target || ol.title === target)
            )
            if (resolved?.relPath) {
                void loadPage(resolved.relPath)
                return
            }

            const clean = target.trim().replace(/\\/g, '/').replace(/^\.\//, '')
            const allFiles: WikiTreeNode[] = []
            const walk = (nodes: WikiTreeNode[]) => {
                for (const n of nodes) {
                    if (n.kind === 'file') allFiles.push(n)
                    else walk(n.children)
                }
            }
            walk(tree)

            const lower = clean.toLowerCase()
            const lowerMd = lower.endsWith('.md') ? lower : `${lower}.md`
            const found = allFiles.find((f) => {
                const fl = f.relPath.toLowerCase()
                const stem = (f.name || '').replace(/\.md$/i, '').toLowerCase()
                return (
                    fl === lower ||
                    fl === lowerMd ||
                    fl === `wiki/${lowerMd}` ||
                    stem === lower ||
                    (f.title || '').toLowerCase() === lower
                )
            })
            if (found) {
                void loadPage(found.relPath)
            } else {
                message.warning(`${target} (${t('wiki:meta.broken')})`)
            }
        },
        [pageDetail, tree, loadPage, t]
    )

    const handleSwitchVault = async () => {
        const folder = await API.chooseLocalFolder()
        if (!folder || !onUpdateSettings) return
        await onUpdateSettings({ ...settings, aiWikiDir: folder })
        setSelectedPath('index.md')
        void loadOverview()
        void loadPage('index.md')
    }

    const handleResetVault = async () => {
        if (!onUpdateSettings) return
        await onUpdateSettings({ ...settings, aiWikiDir: '' })
        setSelectedPath('index.md')
        void loadOverview()
        void loadPage('index.md')
    }

    const handleSavePage = async (relPath: string, content: string) => {
        const updated = await API.wikiSavePage(relPath, content)
        setPageDetail(updated)
        await loadOverview()
    }

    const handleDeletePage = async (relPath: string) => {
        await API.wikiDeletePage(relPath)
        await loadOverview()
        void loadPage('index.md')
    }

    const handleCreatePage = async () => {
        const slugClean = newSlug.trim().replace(/\.md$/i, '')
        const headingClean = newHeading.trim() || slugClean
        if (!slugClean) return
        const relPath = `wiki/${newCategory}/${slugClean}.md`
        const today = new Date().toISOString().slice(0, 10)
        const initial = `---\ntitle: ${headingClean}\ncategory: ${newCategory}\ntags: []\nsources: []\nupdated: ${today}\n---\n\n# ${headingClean}\n\n`
        const created = await API.wikiSavePage(relPath, initial)
        setPageDetail(created)
        setSelectedPath(created.relPath)
        setNewPageOpen(false)
        setNewSlug('')
        setNewHeading('')
        await loadOverview()
    }

    const handleIngested = (relPath: string, title: string, autoCompile: boolean) => {
        void loadOverview()
        void loadPage(relPath)
        if (autoCompile) {
            const prompt = `请阅读我刚刚归档到 Wiki 原始区的资料 \`${relPath}\`（标题：${title}），严格遵循 \`SCHEMA.md\` 规范完成编译入库：\n1. 先调用 \`wiki_index\` 了解现有目录与 \`SCHEMA.md\` 规范；\n2. 调用 \`wiki_read\` 精读 \`${relPath}\`；\n3. 根据内容新建或更新对应的 \`wiki/entities/\`、\`wiki/concepts/\`、\`wiki/runbooks/\` 或 \`wiki/summaries/\` 词条，补充 YAML frontmatter（包含 \`sources: [${relPath}]\`）与 \`[[双向链接]]\`；\n4. 同步更新 \`index.md\` 与 \`log.md\`。`
            dispatchAgentPrompt(prompt)
        }
    }

    const handleRunLint = () => {
        const prompt = `请对当前 LLM Wiki 知识库执行一次全面健康巡检（Lint）：\n1. 调用 \`wiki_lint\` 检查断链、孤立页、未入 \`index.md\` 的词条、陈旧索引链接以及尚未编译的 \`raw/\` 原始资料；\n2. 调用 \`wiki_index\` 核对 \`SCHEMA.md\` 与当前目录；\n3. 逐项修复发现的断链、漏编资料与 \`index.md\` 遗漏，并在 \`log.md\` 记录本次 lint 巡检摘要。`
        dispatchAgentPrompt(prompt)
    }

    return (
        <div className={s.page}>
            <div className={s.toolbar}>
                <div className={s.toolbarLeft}>
                    <Tooltip title={info?.vaultRoot || ''}>
                        <div className={s.vaultBadge}>
                            <Folder size={13} />
                            <span>
                                {info?.isCustomDir ? t('wiki:vault.custom') : t('wiki:vault.default')}
                                {info?.vaultRoot ? ` · ${info.vaultRoot}` : ''}
                            </span>
                        </div>
                    </Tooltip>
                    {info && (
                        <span className={s.statsText}>
                            {t('wiki:stats', {
                                wiki: info.wikiCount,
                                raw: info.rawCount,
                                links: info.linkCount,
                            })}
                        </span>
                    )}
                    {onUpdateSettings && (
                        <Button size="small" type="text" onClick={() => void handleSwitchVault()}>
                            {t('wiki:vault.switch')}
                        </Button>
                    )}
                    {info?.isCustomDir && onUpdateSettings && (
                        <Button
                            size="small"
                            type="text"
                            icon={<RotateCcw size={12} />}
                            onClick={() => void handleResetVault()}
                        >
                            {t('wiki:vault.reset')}
                        </Button>
                    )}
                </div>

                <div className={s.toolbarRight}>
                    <Segmented
                        size="small"
                        value={viewMode}
                        onChange={(v) => setViewMode(v as 'docs' | 'graph')}
                        options={[
                            {
                                value: 'docs',
                                label: t('wiki:view.docs'),
                                icon: <BookOpen size={12} />,
                            },
                            {
                                value: 'graph',
                                label: t('wiki:view.graph'),
                                icon: <Network size={12} />,
                            },
                        ]}
                    />
                    <Button
                        size="small"
                        type="primary"
                        icon={<FilePlus2 size={13} />}
                        onClick={() => setIngestOpen(true)}
                    >
                        {t('wiki:actions.ingest')}
                    </Button>
                    <Button
                        size="small"
                        icon={<Stethoscope size={13} />}
                        onClick={handleRunLint}
                    >
                        {t('wiki:actions.lint')}
                    </Button>
                    <Tooltip title={t('wiki:actions.rebuild')}>
                        <Button
                            size="small"
                            icon={<RefreshCw size={13} />}
                            onClick={() =>
                                void API.wikiRebuildIndex().then((res) => {
                                    setInfo(res)
                                    void loadOverview()
                                    if (viewMode === 'graph') void loadGraph()
                                    message.success(t('wiki:actions.rebuildSuccess'))
                                })
                            }
                        />
                    </Tooltip>
                    <Tooltip title={t('wiki:vault.openFolder')}>
                        <Button
                            size="small"
                            icon={<FolderOpen size={13} />}
                            onClick={() => void API.wikiOpenFolder()}
                        />
                    </Tooltip>
                </div>
            </div>

            <div className={s.body}>
                {viewMode === 'graph' ? (
                    <WikiGraphView
                        graph={graph}
                        onSelectNode={(rel) => {
                            setViewMode('docs')
                            void loadPage(rel)
                        }}
                    />
                ) : (
                    <>
                        <WikiTree
                            tree={tree}
                            selectedPath={selectedPath}
                            onSelect={(rel) => void loadPage(rel)}
                            onOpenNewPage={() => setNewPageOpen(true)}
                        />
                        <WikiViewer
                            page={pageDetail}
                            onSave={handleSavePage}
                            onDelete={handleDeletePage}
                            onWikiLinkClick={resolveAndNavigateLink}
                        />
                        {pageDetail && (
                            <WikiMetaPanel
                                page={pageDetail}
                                onNavigate={(rel) => void loadPage(rel)}
                            />
                        )}
                    </>
                )}
            </div>

            <WikiIngestModal
                open={ingestOpen}
                onClose={() => setIngestOpen(false)}
                onIngested={handleIngested}
            />

            <Modal
                title={t('wiki:viewer.newPageTitle')}
                open={newPageOpen}
                onCancel={() => setNewPageOpen(false)}
                onOk={() => void handleCreatePage()}
                okText={t('wiki:viewer.create')}
                cancelText={t('common:cancel')}
                width={420}
            >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div>
                        <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 4 }}>
                            {t('wiki:viewer.newPageCategory')}
                        </div>
                        <Select
                            style={{ width: '100%' }}
                            value={newCategory}
                            onChange={setNewCategory}
                            options={[
                                { value: 'entities', label: 'entities' },
                                { value: 'concepts', label: 'concepts' },
                                { value: 'runbooks', label: 'runbooks' },
                                { value: 'summaries', label: 'summaries' },
                            ]}
                        />
                    </div>
                    <div>
                        <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 4 }}>
                            {t('wiki:viewer.newPageName')}
                        </div>
                        <Input
                            value={newSlug}
                            onChange={(e) => setNewSlug(e.target.value)}
                            placeholder={t('wiki:viewer.newPageNamePlaceholder')}
                        />
                    </div>
                    <div>
                        <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 4 }}>
                            {t('wiki:viewer.newPageHeading')}
                        </div>
                        <Input
                            value={newHeading}
                            onChange={(e) => setNewHeading(e.target.value)}
                            placeholder={t('wiki:viewer.newPageHeadingPlaceholder')}
                        />
                    </div>
                </div>
            </Modal>
        </div>
    )
}
