import { useEffect, useState } from 'react'
import { Modal, Input, Select, Button, Space, Tag, Segmented, Typography, App } from 'antd'
import { Sparkles, Eye, Edit3 } from 'lucide-react'
import { DistillDraft, KnowledgeNote } from '@/types'
import { API } from '@/api'
import { errorMessage } from '@/utils'
import { MarkdownViewer } from '@/components/common/MarkdownViewer'

const { Text } = Typography
const { TextArea } = Input

interface Props {
    open: boolean
    draft: DistillDraft | null
    onClose: () => void
    onSaved: (note: KnowledgeNote) => void
}

export default function DistillPreviewModal({ open, draft, onClose, onSaved }: Props) {
    const { message } = App.useApp()
    const [title, setTitle] = useState('')
    const [tags, setTags] = useState<string[]>([])
    const [summary, setSummary] = useState('')
    const [content, setContent] = useState('')
    const [viewMode, setViewMode] = useState<'edit' | 'preview'>('edit')
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        if (open && draft) {
            setTitle(draft.title || '')
            setTags(draft.tags || [])
            setSummary(draft.summary || '')
            setContent(draft.content || '')
            setViewMode('edit')
        }
    }, [open, draft])

    const handleSave = async () => {
        if (!title.trim()) {
            message.warning('请输入知识条目标题')
            return
        }
        if (!content.trim()) {
            message.warning('知识内容不能为空')
            return
        }
        setSaving(true)
        try {
            const saved = await API.agentKbSave({
                title: title.trim(),
                tags,
                summary: summary.trim(),
                content,
                sourceType: 'distill',
                sourceRefs: draft?.sourceRefs || [],
            })
            message.success(`已存入第二大脑知识库：${saved.title}`)
            onSaved(saved)
            onClose()
        } catch (err) {
            message.error(`保存知识失败: ${errorMessage(err)}`)
        } finally {
            setSaving(false)
        }
    }

    return (
        <Modal
            open={open}
            onCancel={onClose}
            width={780}
            style={{ top: 36 }}
            destroyOnHidden
            title={
                <Space size={8}>
                    <Sparkles size={16} color="var(--accent, #3370ff)" />
                    <span>提炼结果预览与编辑</span>
                </Space>
            }
            footer={
                <Space style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                        {draft?.sourceRefs?.length
                            ? `来源：${draft.sourceRefs.map((r) => r.sessionTitle).join('、')}`
                            : '对话提炼笔记'}
                    </Text>
                    <Space>
                        <Button onClick={onClose}>取消</Button>
                        <Button type="primary" loading={saving} onClick={handleSave}>
                            确认存入知识库
                        </Button>
                    </Space>
                </Space>
            }
        >
            <Space orientation="vertical" size={12} style={{ width: '100%' }}>
                <div>
                    <Text style={{ fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 4 }}>
                        知识标题
                    </Text>
                    <Input
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="请输入清晰可检索的标题"
                    />
                </div>

                <div>
                    <Text style={{ fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 4 }}>
                        标签（按回车新增）
                    </Text>
                    <Select
                        mode="tags"
                        style={{ width: '100%' }}
                        value={tags}
                        onChange={setTags}
                        placeholder="输入标签后按回车，如：运维、Redis、架构总结"
                        tokenSeparators={[',', '，']}
                    />
                </div>

                <div>
                    <Text style={{ fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 4 }}>
                        核心摘要
                    </Text>
                    <Input
                        value={summary}
                        onChange={(e) => setSummary(e.target.value)}
                        placeholder="一句话概括核心结论"
                    />
                </div>

                <div>
                    <div
                        style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginBottom: 6,
                        }}
                    >
                        <Text style={{ fontSize: 12, fontWeight: 500 }}>Markdown 正文</Text>
                        <Segmented
                            size="small"
                            value={viewMode}
                            onChange={(v) => setViewMode(v as 'edit' | 'preview')}
                            options={[
                                {
                                    label: (
                                        <Space size={4}>
                                            <Edit3 size={12} />
                                            <span>编辑</span>
                                        </Space>
                                    ),
                                    value: 'edit',
                                },
                                {
                                    label: (
                                        <Space size={4}>
                                            <Eye size={12} />
                                            <span>预览</span>
                                        </Space>
                                    ),
                                    value: 'preview',
                                },
                            ]}
                        />
                    </div>
                    {viewMode === 'edit' ? (
                        <TextArea
                            value={content}
                            onChange={(e) => setContent(e.target.value)}
                            autoSize={{ minRows: 10, maxRows: 16 }}
                            style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 12.5 }}
                        />
                    ) : (
                        <div
                            style={{
                                border: '1px solid var(--border, #dcdfe4)',
                                borderRadius: 8,
                                padding: 14,
                                maxHeight: 360,
                                overflowY: 'auto',
                                background: 'var(--stage-bg, #ffffff)',
                            }}
                        >
                            <MarkdownViewer content={content} />
                        </div>
                    )}
                </div>

                {draft?.sourceRefs && draft.sourceRefs.length > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <Text type="secondary" style={{ fontSize: 11.5 }}>
                            关联会话：
                        </Text>
                        {draft.sourceRefs.map((ref) => (
                            <Tag key={ref.sessionId} color="blue" style={{ margin: 0 }}>
                                {ref.sessionTitle} ({ref.messageIds.length} 条消息)
                            </Tag>
                        ))}
                    </div>
                )}
            </Space>
        </Modal>
    )
}
