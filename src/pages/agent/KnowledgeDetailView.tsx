import { useEffect, useState } from 'react'
import { Button, Input, Popconfirm, Select, Space, Tag, Typography, App } from 'antd'
import { Copy, Edit3, Eye, FileText, MessageSquare, Save, Trash2 } from 'lucide-react'
import { KnowledgeNote } from '@/types'
import { API } from '@/api'
import { copyText, errorMessage } from '@/utils'
import { MarkdownViewer } from '@/components/common/MarkdownViewer'
import s from './AgentWorkbench.module.less'

const { Text } = Typography
const { TextArea } = Input

interface Props {
    note: KnowledgeNote
    onUpdated: (note: KnowledgeNote) => void
    onDeleted: (id: string) => void
    onJumpToSession: (sessionId: string) => void
}

const sourceLabelMap: Record<string, { text: string; color: string }> = {
    distill: { text: '对话提炼', color: 'purple' },
    import: { text: '文件导入', color: 'cyan' },
    manual: { text: '手动编写', color: 'blue' },
}

export default function KnowledgeDetailView({
    note,
    onUpdated,
    onDeleted,
    onJumpToSession,
}: Props) {
    const { message } = App.useApp()
    const [editing, setEditing] = useState(false)
    const [title, setTitle] = useState(note.title)
    const [summary, setSummary] = useState(note.summary)
    const [tags, setTags] = useState<string[]>(note.tags || [])
    const [content, setContent] = useState(note.content)
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        setTitle(note.title)
        setSummary(note.summary)
        setTags(note.tags || [])
        setContent(note.content)
        setEditing(note.id === '')
    }, [note])

    const handleSave = async () => {
        if (!title.trim()) {
            message.warning('标题不能为空')
            return
        }
        setSaving(true)
        try {
            const saved = await API.agentKbSave({
                ...note,
                title: title.trim(),
                summary: summary.trim(),
                tags,
                content,
            })
            message.success('知识笔记已保存')
            setEditing(false)
            onUpdated(saved)
        } catch (err) {
            message.error(`保存失败: ${errorMessage(err)}`)
        } finally {
            setSaving(false)
        }
    }

    const handleDelete = async () => {
        try {
            await API.agentKbDelete(note.id)
            message.success('已删除知识条目')
            onDeleted(note.id)
        } catch (err) {
            message.error(`删除失败: ${errorMessage(err)}`)
        }
    }

    const srcInfo = sourceLabelMap[note.sourceType] || { text: note.sourceType || '笔记', color: 'default' }

    return (
        <div className={s.kbDetailWrap}>
            <div className={s.kbDetailHeader}>
                <div className={s.kbDetailTop}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        {editing ? (
                            <Input
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                placeholder="请输入知识标题"
                                style={{ fontWeight: 600, fontSize: 15 }}
                            />
                        ) : (
                            <Space size={8} wrap>
                                <FileText size={16} color="var(--accent, #3370ff)" />
                                <h3 className={s.kbDetailTitle}>{note.title}</h3>
                                <Tag color={srcInfo.color} style={{ margin: 0 }}>
                                    {srcInfo.text}
                                </Tag>
                            </Space>
                        )}
                    </div>

                    <Space size={6} style={{ flexShrink: 0 }}>
                        <Button
                            size="small"
                            icon={<Copy size={13} />}
                            onClick={() => {
                                void copyText(content).then((ok) => {
                                    if (ok) message.success('已复制 Markdown 内容')
                                })
                            }}
                        >
                            复制
                        </Button>
                        {editing ? (
                            <>
                                {note.id && (
                                    <Button
                                        size="small"
                                        icon={<Eye size={13} />}
                                        onClick={() => {
                                            setTitle(note.title)
                                            setSummary(note.summary)
                                            setTags(note.tags || [])
                                            setContent(note.content)
                                            setEditing(false)
                                        }}
                                    >
                                        取消
                                    </Button>
                                )}
                                <Button
                                    size="small"
                                    type="primary"
                                    icon={<Save size={13} />}
                                    loading={saving}
                                    onClick={handleSave}
                                >
                                    保存
                                </Button>
                            </>
                        ) : (
                            <Button
                                size="small"
                                icon={<Edit3 size={13} />}
                                onClick={() => setEditing(true)}
                            >
                                编辑
                            </Button>
                        )}
                        {note.id && (
                            <Popconfirm
                                title="确认删除这条知识笔记？"
                                description="将同时移除本地同步的 Markdown 文件。"
                                okText="删除"
                                cancelText="取消"
                                okButtonProps={{ danger: true }}
                                onConfirm={handleDelete}
                            >
                                <Button size="small" danger icon={<Trash2 size={13} />} />
                            </Popconfirm>
                        )}
                    </Space>
                </div>

                {editing ? (
                    <Space orientation="vertical" size={8} style={{ width: '100%' }}>
                        <Select
                            mode="tags"
                            style={{ width: '100%' }}
                            value={tags}
                            onChange={setTags}
                            placeholder="标签（输入后按回车）"
                            tokenSeparators={[',', '，']}
                        />
                        <Input
                            value={summary}
                            onChange={(e) => setSummary(e.target.value)}
                            placeholder="核心摘要（留空将自动从正文提取）"
                        />
                    </Space>
                ) : (
                    <Space size={8} wrap style={{ justifyContent: 'space-between', width: '100%' }}>
                        <Space size={6} wrap>
                            {(note.tags || []).map((t) => (
                                <Tag key={t} style={{ margin: 0 }}>
                                    #{t}
                                </Tag>
                            ))}
                            {note.updatedAt > 0 && (
                                <Text type="secondary" style={{ fontSize: 11.5 }}>
                                    更新于 {new Date(note.updatedAt).toLocaleString()}
                                </Text>
                            )}
                        </Space>
                        {note.sourceRefs && note.sourceRefs.length > 0 && (
                            <div className={s.kbSourceRefs}>
                                <span>来源对话：</span>
                                {note.sourceRefs.map((r) => (
                                    <button
                                        key={r.sessionId}
                                        type="button"
                                        className={s.citationChip}
                                        onClick={() => onJumpToSession(r.sessionId)}
                                    >
                                        <MessageSquare size={11} />
                                        <span>{r.sessionTitle || '查看会话'}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </Space>
                )}
            </div>

            <div className={s.kbDetailBody}>
                {editing ? (
                    <TextArea
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        placeholder="请输入 Markdown 笔记正文..."
                        autoSize={{ minRows: 18 }}
                        style={{
                            fontFamily: 'var(--font-mono, monospace)',
                            fontSize: 13,
                            lineHeight: 1.65,
                        }}
                    />
                ) : (
                    <>
                        {note.summary && (
                            <div className={s.kbSummaryBox}>
                                <strong>摘要：</strong>
                                {note.summary}
                            </div>
                        )}
                        <MarkdownViewer content={note.content} />
                    </>
                )}
            </div>
        </div>
    )
}
