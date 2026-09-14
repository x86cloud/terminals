import React, { useState, useEffect } from 'react'
import { Card, Input, InputNumber, Slider, Switch, Select, Space, Typography, Tag, Button, Modal, Popconfirm, message } from 'antd'
import { Bot, Server, Shield, Sparkles, Layers, FolderOpen, BookOpen, Eye, Plus, Edit2, Trash2, Check } from 'lucide-react'
import { AppSettings, AgentSkillItem, AiModelItem } from '@/types'
import { API } from '@/api'
import MarkdownViewer from '@/components/common/MarkdownViewer'
import { ModelEditModal } from './components/ModelEditModal'
import s from './AiAgentTab.module.less'

const { Text } = Typography
const { TextArea } = Input

interface Props {
    aiBaseUrl: string
    aiApiKey: string
    aiModel: string
    aiModels?: AiModelItem[]
    activeModelId?: string
    aiTemperature: number
    aiModelContextTokens?: number
    aiContextCompressRatio?: number
    aiMaxContextTokens?: number
    aiCompressionStrategy?: 'none' | 'summary' | 'sliding'
    aiEnableMultimodal: boolean
    aiEnableWebSearch?: boolean
    aiEnablePermissionGuard?: boolean
    aiBlockHighRiskCommands?: boolean
    aiEnableThinking?: boolean
    aiReasoningEffort?: 'none' | 'low' | 'medium' | 'high'
    aiEnableVerifier?: boolean
    aiMaxParallel?: number
    aiSystemPrompt: string
    onChange: (fields: Partial<AppSettings>) => void
}

export default function AiAgentTab({
    aiBaseUrl,
    aiApiKey,
    aiModel,
    aiModels,
    activeModelId,
    aiTemperature,
    aiModelContextTokens = 65536,
    aiContextCompressRatio = 80,
    aiCompressionStrategy = 'summary',
    aiEnableMultimodal,
    aiEnableWebSearch = false,
    aiEnablePermissionGuard = true,
    aiBlockHighRiskCommands = true,
    aiEnableThinking = false,
    aiReasoningEffort = 'none',
    aiEnableVerifier = false,
    aiMaxParallel = 4,
    aiSystemPrompt,
    onChange,
}: Props) {
    const [skills, setSkills] = useState<AgentSkillItem[]>([])
    const [skillsLoading, setSkillsLoading] = useState(false)
    const [selectedSkill, setSelectedSkill] = useState<AgentSkillItem | null>(null)
    const [editModalOpen, setEditModalOpen] = useState<boolean>(false)
    const [editingModel, setEditingModel] = useState<AiModelItem | null>(null)

    const currentModels: AiModelItem[] = (aiModels && aiModels.length > 0) ? aiModels : [
        {
            id: 'model_default',
            name: aiModel || '默认模型',
            model: aiModel || 'deepseek-v4-flash',
            baseUrl: aiBaseUrl || 'https://api.deepseek.com',
            apiKey: aiApiKey || '',
            contextTokens: aiModelContextTokens || 65536,
            temperature: aiTemperature ?? 0.7,
        },
    ]
    const activeModel = currentModels.find((m) => m.id === activeModelId) || currentModels[0]

    const handleAddModel = () => {
        setEditingModel(null)
        setEditModalOpen(true)
    }

    const handleEditModel = (item: AiModelItem) => {
        setEditingModel(item)
        setEditModalOpen(true)
    }

    const handleDeleteModel = (id: string) => {
        if (currentModels.length <= 1) {
            message.warning('至少需要保留一个模型配置')
            return
        }
        const nextModels = currentModels.filter((m) => m.id !== id)
        let nextActiveId = activeModelId
        let activeChanged = false

        if (activeModelId === id) {
            nextActiveId = nextModels[0].id
            activeChanged = true
        }

        const targetActive = nextModels.find((m) => m.id === nextActiveId) || nextModels[0]

        const updates: Partial<AppSettings> = {
            aiModels: nextModels,
            activeModelId: nextActiveId,
        }

        if (activeChanged) {
            updates.aiModel = targetActive.model
            updates.aiBaseUrl = targetActive.baseUrl
            updates.aiApiKey = targetActive.apiKey
            updates.aiModelContextTokens = targetActive.contextTokens
            updates.aiTemperature = targetActive.temperature ?? aiTemperature
        }

        onChange(updates)
        message.success('已删除模型')
    }

    const handleSaveModelItem = (item: AiModelItem) => {
        const existingIndex = currentModels.findIndex((m) => m.id === item.id)
        let nextModels: AiModelItem[]
        let nextActiveId = activeModelId

        if (existingIndex >= 0) {
            nextModels = [...currentModels]
            nextModels[existingIndex] = item
        } else {
            nextModels = [...currentModels, item]
            nextActiveId = activeModelId || item.id
        }

        const targetActive = nextModels.find((m) => m.id === nextActiveId) || nextModels[0]
        const isTargetActive = targetActive.id === item.id

        onChange({
            aiModels: nextModels,
            activeModelId: nextActiveId,
            ...(isTargetActive
                ? {
                      aiModel: targetActive.model,
                      aiBaseUrl: targetActive.baseUrl,
                      aiApiKey: targetActive.apiKey,
                      aiModelContextTokens: targetActive.contextTokens,
                      aiTemperature: targetActive.temperature ?? aiTemperature,
                  }
                : {}),
        })
        message.success(existingIndex >= 0 ? '模型配置已更新' : '已添加新模型')
    }

    const loadSkills = async () => {
        setSkillsLoading(true)
        try {
            const list = await API.agentListSkills()
            setSkills(list || [])
        } catch {
            /* ignore */
        } finally {
            setSkillsLoading(false)
        }
    }

    useEffect(() => {
        loadSkills()
    }, [])

    const handleOpenSkillsDir = async () => {
        try {
            await API.agentOpenSkillsDir()
            message.success('已打开本地技能目录')
        } catch (err: any) {
            message.error(`打开技能目录失败: ${err?.message || err}`)
        }
    }

    const calculatedTriggerTokens = Math.round((aiModelContextTokens * aiContextCompressRatio) / 100)

    return (
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <div>
                <div className={s.sectionTitle}>
                    <Bot size={18} />
                    <span>AI 智能体设置</span>
                </div>
                <div className={s.sectionDesc}>
                    配置大模型 API 接入、多模型管理、上下文窗口、历史长文本压缩方式与安全管控。
                </div>
            </div>

            {/* 卡片 1：多模型服务配置与管理（当前页面直接增删改查） */}
            <Card
                size="small"
                title={
                    <Space size={8}>
                        <Server size={15} />
                        <span>大模型接入管理</span>
                    </Space>
                }
                extra={
                    <Button
                        type="primary"
                        size="small"
                        icon={<Plus size={13} />}
                        onClick={handleAddModel}
                    >
                        添加模型
                    </Button>
                }
                style={{ borderRadius: 8 }}
            >
                <div className={s.modelList}>
                    {currentModels.map((item) => {
                        const isActive = item.id === (activeModel?.id || currentModels[0]?.id)
                        return (
                            <div
                                key={item.id}
                                className={`${s.modelCard} ${isActive ? s.modelCardActive : ''}`}
                            >
                                <div className={s.modelCardLeft}>
                                    <div className={s.modelNameRow}>
                                        <span className={s.modelName}>{item.name || item.model}</span>
                                        <Tag color="blue">{item.model}</Tag>
                                        <Tag color="cyan">
                                            {Math.round((item.contextTokens || 65536) / 1024)}K 上下文
                                        </Tag>
                                        {isActive ? (
                                            <Tag
                                                color="success"
                                                icon={<Check size={12} style={{ verticalAlign: -1, marginRight: 2 }} />}
                                            >
                                                当前使用
                                            </Tag>
                                        ) : null}
                                    </div>
                                    <div className={s.modelUrlText}>
                                        API Base URL: {item.baseUrl}
                                    </div>
                                </div>

                                <div className={s.modelCardRight}>
                                    <Button
                                        size="small"
                                        icon={<Edit2 size={13} />}
                                        onClick={() => handleEditModel(item)}
                                    >
                                        编辑
                                    </Button>
                                    {currentModels.length > 1 && (
                                        <Popconfirm
                                            title="确定删除此模型配置吗？"
                                            description={isActive ? '该模型当前正在使用，删除后将自动切换为其他模型。' : undefined}
                                            okText="确定"
                                            cancelText="取消"
                                            okButtonProps={{ danger: true }}
                                            onConfirm={() => handleDeleteModel(item.id)}
                                        >
                                            <Button
                                                size="small"
                                                danger
                                                icon={<Trash2 size={13} />}
                                            />
                                        </Popconfirm>
                                    )}
                                </div>
                            </div>
                        )
                    })}
                </div>
            </Card>

            <ModelEditModal
                open={editModalOpen}
                initialData={editingModel}
                onSave={handleSaveModelItem}
                onClose={() => {
                    setEditModalOpen(false)
                    setEditingModel(null)
                }}
            />

            {/* 卡片 2：上下文与长文本管理 */}
            <Card
                size="small"
                title={
                    <Space size={8}>
                        <Layers size={15} />
                        <span>上下文与长文本管理</span>
                    </Space>
                }
                style={{ borderRadius: 8 }}
            >
                <Space orientation="vertical" size={14} style={{ width: '100%' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ flex: 1, marginRight: 16 }}>
                            <div style={{ fontSize: 13, fontWeight: 500 }}>上下文压缩方式 (Compression Strategy)</div>
                            <Text type="secondary" style={{ fontSize: 12 }}>
                                {aiCompressionStrategy === 'summary' && '达到阈值时自动调用模型提炼早期历史关键摘要，保留核心记忆'}
                                {aiCompressionStrategy === 'sliding' && '达到阈值时直接修剪丢弃最早的历史消息，保留最新的滑动窗口'}
                                {aiCompressionStrategy === 'none' && '不执行任何历史修剪或摘要压缩，完整保留所有对话记录'}
                            </Text>
                        </div>
                        <Select
                            style={{ width: 220, flexShrink: 0 }}
                            value={aiCompressionStrategy}
                            onChange={(val) => onChange({ aiCompressionStrategy: val })}
                            options={[
                                { label: 'AI 智能摘要 (推荐)', value: 'summary' },
                                { label: '滑动窗口截断', value: 'sliding' },
                                { label: '不压缩', value: 'none' },
                            ]}
                        />
                    </div>

                    {aiCompressionStrategy !== 'none' && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ flex: 1, marginRight: 16 }}>
                                <div style={{ fontSize: 13, fontWeight: 500 }}>
                                    压缩触发使用率阈值 ({aiContextCompressRatio}%)
                                </div>
                                <Text type="secondary" style={{ fontSize: 12 }}>
                                    当前换算触发阈值：{aiModelContextTokens.toLocaleString()} × {aiContextCompressRatio}% ≈ {calculatedTriggerTokens.toLocaleString()} Tokens
                                </Text>
                            </div>
                            <div style={{ width: 220, flexShrink: 0 }}>
                                <Slider
                                    min={10}
                                    max={95}
                                    step={5}
                                    value={aiContextCompressRatio}
                                    onChange={(val) => onChange({ aiContextCompressRatio: val })}
                                />
                            </div>
                        </div>
                    )}
                </Space>
            </Card>

            {/* 卡片 3：安全防护与工具调用 */}
            <Card
                size="small"
                title={
                    <Space size={8}>
                        <Shield size={15} />
                        <span>权限管控与安全防御</span>
                    </Space>
                }
                style={{ borderRadius: 8 }}
            >
                <Space orientation="vertical" size={14} style={{ width: '100%' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <div style={{ fontWeight: 500, fontSize: 13 }}>权限防御开关 (Permission Guard)</div>
                            <Text type="secondary" style={{ fontSize: 12 }}>
                                针对高危运维命令进行二次确认弹窗
                            </Text>
                        </div>
                        <Switch
                            checked={aiEnablePermissionGuard}
                            onChange={(checked) => onChange({ aiEnablePermissionGuard: checked })}
                        />
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <div style={{ fontWeight: 500, fontSize: 13 }}>自动拦截破坏性指令 (Block Destructive Commands)</div>
                            <Text type="secondary" style={{ fontSize: 12 }}>
                                严格拦截 rm -rf /、mkfs、dd 等危险系统指令
                            </Text>
                        </div>
                        <Switch
                            checked={aiBlockHighRiskCommands}
                            onChange={(checked) => onChange({ aiBlockHighRiskCommands: checked })}
                        />
                    </div>
                </Space>
            </Card>

            {/* 卡片 4：高级特性 */}
            <Card
                size="small"
                title={
                    <Space size={8}>
                        <Sparkles size={15} />
                        <span>高级特性与思考推理</span>
                    </Space>
                }
                style={{ borderRadius: 8 }}
            >
                <Space orientation="vertical" size={14} style={{ width: '100%' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <div style={{ fontWeight: 500, fontSize: 13 }}>启用模型思考过程 (Thinking / Reasoning)</div>
                            <Text type="secondary" style={{ fontSize: 12 }}>
                                展示模型的逐步推导与内心独白
                            </Text>
                        </div>
                        <Switch
                            checked={aiEnableThinking}
                            onChange={(checked) => onChange({ aiEnableThinking: checked })}
                        />
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <div style={{ fontWeight: 500, fontSize: 13 }}>网络搜索支持 (Web Search)</div>
                            <Text type="secondary" style={{ fontSize: 12 }}>
                                允许智能体联网检索实时开发者技术文档
                            </Text>
                        </div>
                        <Switch
                            checked={aiEnableWebSearch}
                            onChange={(checked) => onChange({ aiEnableWebSearch: checked })}
                        />
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <div style={{ fontWeight: 500, fontSize: 13 }}>多模态图文识别 (Multimodal)</div>
                            <Text type="secondary" style={{ fontSize: 12 }}>
                                允许上传系统错误截图进行自动视觉解析
                            </Text>
                        </div>
                        <Switch
                            checked={aiEnableMultimodal}
                            onChange={(checked) => onChange({ aiEnableMultimodal: checked })}
                        />
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <div style={{ fontWeight: 500, fontSize: 13 }}>推理深度 (Reasoning Effort)</div>
                            <Text type="secondary" style={{ fontSize: 12 }}>
                                控制推理模型的推演思考层级
                            </Text>
                        </div>
                        <Select
                            style={{ width: 220 }}
                            value={aiReasoningEffort}
                            onChange={(val) => onChange({ aiReasoningEffort: val })}
                            options={[
                                { label: '未指定 / 关闭 (none)', value: 'none' },
                                { label: '低 (low)', value: 'low' },
                                { label: '中 (medium)', value: 'medium' },
                                { label: '高 (high)', value: 'high' },
                            ]}
                        />
                    </div>
                </Space>
            </Card>

            {/* 卡片 5：系统提示词 */}
            <Card
                size="small"
                title={
                    <Space size={8}>
                        <Bot size={15} />
                        <span>默认系统角色提示词 (System Prompt)</span>
                    </Space>
                }
                style={{ borderRadius: 8 }}
            >
                <TextArea
                    autoSize={{ minRows: 6, maxRows: 6 }}
                    value={aiSystemPrompt}
                    onChange={(e) => onChange({ aiSystemPrompt: e.target.value })}
                    placeholder="请输入系统提示词..."
                />
            </Card>

            {/* 卡片 6：SOP 技能 (Skills) */}
            <Card
                size="small"
                title={
                    <Space size={8}>
                        <BookOpen size={15} />
                        <span>SOP 技能包 (Skills)</span>
                        <Tag color="blue" style={{ fontSize: 11 }}>已发现 {skills.length} 个</Tag>
                    </Space>
                }
                extra={
                    <Button
                        size="small"
                        icon={<FolderOpen size={13} />}
                        onClick={handleOpenSkillsDir}
                    >
                        打开技能目录
                    </Button>
                }
                style={{ borderRadius: 8 }}
            >
                <div style={{ marginBottom: 10, fontSize: 12, color: 'var(--text-dim, #8c8c8c)' }}>
                    技能包为 Agent 提供标准操作流程 (SOP)。放置于技能目录下的每个子文件夹中包含 <code>SKILL.md</code> 即可被自动发现并按需加载。
                </div>

                {skills.length === 0 ? (
                    <div className={s.emptySkills}>
                        <div>暂未检测到本地技能包</div>
                        <Button size="small" type="link" onClick={handleOpenSkillsDir}>
                            打开技能目录并添加技能
                        </Button>
                    </div>
                ) : (
                    <div className={s.skillsGrid}>
                        {skills.map((sk) => (
                            <div
                                key={sk.name}
                                className={s.skillCard}
                                onClick={() => setSelectedSkill(sk)}
                            >
                                <div>
                                    <div className={s.skillHeader}>
                                        <span className={s.skillName}>{sk.name}</span>
                                        <Tag color="cyan" style={{ fontSize: 10, margin: 0 }}>SOP</Tag>
                                    </div>
                                    <div className={s.skillDesc}>
                                        {sk.description || '暂无描述'}
                                    </div>
                                </div>
                                <div className={s.skillFooter}>
                                    <Space size={4} wrap style={{ maxWidth: '75%' }}>
                                        {sk.tools && sk.tools.length > 0 ? (
                                            sk.tools.slice(0, 3).map((t) => (
                                                <Tag key={t} style={{ fontSize: 10, margin: 0 }}>{t}</Tag>
                                            ))
                                        ) : (
                                            <span style={{ fontSize: 11, color: '#999' }}>通用</span>
                                        )}
                                        {sk.tools && sk.tools.length > 3 && (
                                            <span style={{ fontSize: 10, color: '#999' }}>+{sk.tools.length - 3}</span>
                                        )}
                                    </Space>
                                    <Button
                                        size="small"
                                        type="link"
                                        icon={<Eye size={12} />}
                                        style={{ padding: 0, fontSize: 11 }}
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            setSelectedSkill(sk)
                                        }}
                                    >
                                        详情
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </Card>

            {/* 技能详情 Modal */}
            <Modal
                open={!!selectedSkill}
                title={
                    <Space size={8}>
                        <BookOpen size={16} />
                        <span>技能详情: {selectedSkill?.name}</span>
                    </Space>
                }
                width={680}
                footer={[
                    <Button key="dir" icon={<FolderOpen size={13} />} onClick={handleOpenSkillsDir}>
                        打开技能目录
                    </Button>,
                    <Button key="close" type="primary" onClick={() => setSelectedSkill(null)}>
                        关闭
                    </Button>,
                ]}
                onCancel={() => setSelectedSkill(null)}
            >
                {selectedSkill && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: '60vh', overflowY: 'auto' }}>
                        <div>
                            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>描述</div>
                            <div style={{ fontSize: 12, color: 'var(--text-dim, #8c8c8c)' }}>
                                {selectedSkill.description || '无'}
                            </div>
                        </div>

                        {selectedSkill.tools && selectedSkill.tools.length > 0 && (
                            <div>
                                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>关联工具</div>
                                <Space size={6} wrap>
                                    {selectedSkill.tools.map((t) => (
                                        <Tag key={t} color="blue">{t}</Tag>
                                    ))}
                                </Space>
                            </div>
                        )}

                        <div>
                            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>操作指南与指令 (SKILL.md)</div>
                            <div style={{
                                padding: 12,
                                background: 'var(--bg-1, #fafafa)',
                                border: '1px solid var(--border, #f0f0f0)',
                                borderRadius: 6,
                            }}>
                                <MarkdownViewer content={selectedSkill.instructions || '*(无指令内容)*'} />
                            </div>
                        </div>
                    </div>
                )}
            </Modal>
        </Space>
    )
}
