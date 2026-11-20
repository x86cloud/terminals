import { useState } from 'react'
import { Card, Input, Switch, Select, Space, Typography, Tag, Button, Popconfirm, App } from 'antd'
import { Bot, Server, Sparkles, Plus, Edit2, Trash2, Check, Power, RotateCcw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { AppSettings, AiModelItem } from '@/types'
import { ModelEditModal } from './components/ModelEditModal'
import s from './AiAgentTab.module.less'

const { Text } = Typography
const { TextArea } = Input

interface Props {
    aiEnabled: boolean
    aiBaseUrl: string
    aiApiKey: string
    aiModel: string
    aiModels?: AiModelItem[]
    activeModelId?: string
    aiTemperature: number
    aiModelContextTokens?: number
    aiEnableMultimodal: boolean
    aiEnableThinking?: boolean
    aiReasoningEffort?: 'none' | 'low' | 'medium' | 'high'
    aiSubAgentModelId?: string
    aiSystemPrompt: string
    onChange: (fields: Partial<AppSettings>) => void
}

export default function AiAgentTab({
    aiEnabled = false,
    aiBaseUrl,
    aiApiKey,
    aiModel,
    aiModels,
    activeModelId,
    aiTemperature,
    aiModelContextTokens = 65536,
    aiEnableMultimodal,
    aiEnableThinking = false,
    aiReasoningEffort = 'medium',
    aiSubAgentModelId = '',
    aiSystemPrompt,
    onChange,
}: Props) {
    const { t } = useTranslation(['settings', 'common'])
    const { message } = App.useApp()
    const [editModalOpen, setEditModalOpen] = useState<boolean>(false)
    const [editingModel, setEditingModel] = useState<AiModelItem | null>(null)

    const currentModels: AiModelItem[] =
        aiModels && aiModels.length > 0
            ? aiModels
            : [
                  {
                      id: 'model_deepseek',
                      name: aiModel || t('aiAgent.defaultModelName', '默认模型'),
                      model: aiModel || 'deepseek-v4-flash',
                      baseUrl: aiBaseUrl || 'https://api.deepseek.com',
                      apiKey: aiApiKey || '',
                      contextTokens: aiModelContextTokens || 65536,
                      temperature: aiTemperature ?? 0.7,
                      enableMultimodal: !!aiEnableMultimodal,
                  },
              ]
    const activeModel =
        currentModels.find((m) => m.id === activeModelId) || currentModels[0]

    const handleAddModel = () => {
        setEditingModel(null)
        setEditModalOpen(true)
    }

    const handleEditModel = (item: AiModelItem) => {
        setEditingModel(item)
        setEditModalOpen(true)
    }

    const handleSelectActiveModel = (item: AiModelItem) => {
        if (item.id === activeModel?.id) return
        onChange({
            activeModelId: item.id,
            aiModel: item.model,
            aiBaseUrl: item.baseUrl,
            aiApiKey: item.apiKey,
            aiModelContextTokens: item.contextTokens,
            aiTemperature: item.temperature ?? aiTemperature,
            aiEnableMultimodal: !!item.enableMultimodal,
        })
        message.success(
            t('aiAgent.modelSwitched', {
                name: item.name || item.model,
                defaultValue: `已切换当前生效模型为 ${item.name || item.model}`,
            })
        )
    }

    const handleDeleteModel = (id: string) => {
        if (currentModels.length <= 1) {
            message.warning(t('aiAgent.keepOneModelWarn', '至少需要保留一个模型配置'))
            return
        }
        const nextModels = currentModels.filter((m) => m.id !== id)
        let nextActiveId = activeModelId
        let activeChanged = false

        if (activeModel?.id === id) {
            nextActiveId = nextModels[0].id
            activeChanged = true
        }

        const targetActive =
            nextModels.find((m) => m.id === nextActiveId) || nextModels[0]

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
            updates.aiEnableMultimodal = !!targetActive.enableMultimodal
        }

        onChange(updates)
        message.success(t('aiAgent.modelDeleted', '已删除模型'))
    }

    const handleSaveModelItem = (item: AiModelItem) => {
        const existingIndex = currentModels.findIndex((m) => m.id === item.id)
        let nextModels: AiModelItem[]
        let nextActiveId = activeModelId || activeModel?.id

        if (existingIndex >= 0) {
            nextModels = [...currentModels]
            nextModels[existingIndex] = item
        } else {
            nextModels = [...currentModels, item]
            nextActiveId = nextActiveId || item.id
        }

        const targetActive =
            nextModels.find((m) => m.id === nextActiveId) || nextModels[0]
        const isTargetActive = targetActive.id === item.id

        onChange({
            aiModels: nextModels,
            activeModelId: targetActive.id,
            ...(isTargetActive
                ? {
                      aiModel: targetActive.model,
                      aiBaseUrl: targetActive.baseUrl,
                      aiApiKey: targetActive.apiKey,
                      aiModelContextTokens: targetActive.contextTokens,
                      aiTemperature: targetActive.temperature ?? aiTemperature,
                      aiEnableMultimodal: !!targetActive.enableMultimodal,
                  }
                : {}),
        })
        message.success(
            existingIndex >= 0
                ? t('aiAgent.modelUpdated', { defaultValue: '模型配置已更新' })
                : t('aiAgent.modelAdded', { defaultValue: '已添加新模型' })
        )
    }

    const handleResetPrompt = () => {
        const defaultPrompt = t(
            'aiAgent.defaultPrompt',
            '你是一个有用的 AI 助手，能够回答用户的各种技术与日常问题，并给出精准优雅的解答。'
        )
        onChange({ aiSystemPrompt: defaultPrompt })
    }

    return (
        <Space orientation="vertical" size={16} style={{ width: '100%' }}>
            <div>
                <div className={s.sectionTitle}>
                    <Bot size={18} />
                    <span>{t('aiAgent.title', 'AI 智能体配置')}</span>
                    <Tag color="blue" style={{ marginLeft: 4, fontSize: 11 }}>
                        ReAct
                    </Tag>
                </div>
                <div className={s.sectionDesc}>
                    {t(
                        'aiAgent.desc',
                        '配置大模型提供商 API、多模型切换与基于 ReAct (Reasoning + Acting) 编排模式的推理策略。'
                    )}
                </div>
            </div>

            {/* 顶部全局 Agent 开关卡片 */}
            <div
                className={`${s.globalToggleCard} ${
                    aiEnabled ? s.globalToggleCardActive : ''
                }`}
            >
                <div className={s.toggleLeft}>
                    <div className={s.toggleTitleRow}>
                        <Power
                            size={15}
                            color={aiEnabled ? 'var(--accent, #1677ff)' : 'var(--text-dim, #8c8c8c)'}
                        />
                        <span>{t('aiAgent.enableAgentTitle', '启用 AI 智能体 (全局开关)')}</span>
                        <Tag color={aiEnabled ? 'success' : 'default'} style={{ margin: 0 }}>
                            {aiEnabled
                                ? t('aiAgent.statusEnabled', '已启用')
                                : t('aiAgent.statusDisabled', '已关闭')}
                        </Tag>
                    </div>
                    <div className={s.toggleDesc}>
                        {t(
                            'aiAgent.enableAgentDesc',
                            '全局控制 AI 智能体功能的启停状态。关闭后将禁用下方配置项并停止所有智能体后台推演任务。'
                        )}
                    </div>
                </div>
                <Switch
                    checked={aiEnabled}
                    onChange={(checked) => onChange({ aiEnabled: checked })}
                />
            </div>

            {/* 下方配置区域（当全局开关关闭时置灰禁用） */}
            <div className={!aiEnabled ? s.disabledSection : undefined}>
                <Space orientation="vertical" size={16} style={{ width: '100%' }}>
                    {/* 卡片 1：多模型服务配置与管理 */}
                    <Card
                        size="small"
                        title={
                            <Space size={8}>
                                <Server size={15} />
                                <span>{t('aiAgent.modelConfig', '大模型接入管理')}</span>
                            </Space>
                        }
                        extra={
                            <Button
                                type="primary"
                                size="small"
                                icon={<Plus size={13} />}
                                onClick={handleAddModel}
                                disabled={!aiEnabled}
                            >
                                {t('aiAgent.addModel', '添加模型')}
                            </Button>
                        }
                        style={{ borderRadius: 8 }}
                    >
                        <div className={s.modelList}>
                            {currentModels.map((item) => {
                                const isActive =
                                    item.id === (activeModel?.id || currentModels[0]?.id)
                                return (
                                    <div
                                        key={item.id}
                                        className={`${s.modelCard} ${
                                            isActive ? s.modelCardActive : ''
                                        }`}
                                        onClick={() => handleSelectActiveModel(item)}
                                    >
                                        <div className={s.modelCardLeft}>
                                            <div className={s.modelNameRow}>
                                                <span className={s.modelName}>
                                                    {item.name || item.model}
                                                </span>
                                                <Tag color="blue">{item.model}</Tag>
                                                <Tag color="cyan">
                                                    {Math.round(
                                                        (item.contextTokens || 65536) / 1024
                                                    )}
                                                    K {t('aiAgent.contextTokens', '上下文')}
                                                </Tag>
                                                {item.enableMultimodal && (
                                                    <Tag color="purple">
                                                        {t('aiAgent.enableMultimodal', '多模态')}
                                                    </Tag>
                                                )}
                                                {isActive ? (
                                                    <Tag
                                                        color="success"
                                                        icon={
                                                            <Check
                                                                size={12}
                                                                style={{
                                                                    verticalAlign: -1,
                                                                    marginRight: 2,
                                                                }}
                                                            />
                                                        }
                                                    >
                                                        {t('aiAgent.activeModel', '当前生效模型')}
                                                    </Tag>
                                                ) : null}
                                            </div>
                                            <div className={s.modelUrlText}>
                                                API Base URL: {item.baseUrl}
                                            </div>
                                        </div>

                                        <div
                                            className={s.modelCardRight}
                                            onClick={(e) => e.stopPropagation()}
                                        >
                                            {!isActive && (
                                                <Button
                                                    size="small"
                                                    type="text"
                                                    onClick={() => handleSelectActiveModel(item)}
                                                >
                                                    {t('aiAgent.setAsActive', '设为当前')}
                                                </Button>
                                            )}
                                            <Button
                                                size="small"
                                                icon={<Edit2 size={13} />}
                                                onClick={() => handleEditModel(item)}
                                            >
                                                {t('common:edit', '编辑')}
                                            </Button>
                                            {currentModels.length > 1 && (
                                                <Popconfirm
                                                    title={t(
                                                        'aiAgent.deleteModelConfirm',
                                                        '确定删除此模型配置吗？'
                                                    )}
                                                    description={
                                                        isActive
                                                            ? t(
                                                                  'aiAgent.deleteActiveModelDesc',
                                                                  '该模型当前正在使用，删除后将自动切换为其他模型。'
                                                              )
                                                            : undefined
                                                    }
                                                    okText={t('common:ok', '确定')}
                                                    cancelText={t('common:cancel', '取消')}
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

                    {/* 卡片 2：ReAct 思考推理与高级特性 */}
                    <Card
                        size="small"
                        title={
                            <Space size={8}>
                                <Sparkles size={15} />
                                <span>{t('aiAgent.advancedCardTitle', '高级特性与思考推理')}</span>
                            </Space>
                        }
                        style={{ borderRadius: 8 }}
                    >
                        <Space orientation="vertical" size={14} style={{ width: '100%' }}>
                            <div
                                style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                }}
                            >
                                <div>
                                    <div style={{ fontWeight: 500, fontSize: 13 }}>
                                        {t(
                                            'aiAgent.thinkingTitle',
                                            '启用模型思考过程 (Thinking / Reasoning)'
                                        )}
                                    </div>
                                    <Text type="secondary" style={{ fontSize: 12 }}>
                                        {t(
                                            'aiAgent.thinkingDesc',
                                            '在 ReAct 循环推演中展示模型的逐步推导与内心独白'
                                        )}
                                    </Text>
                                </div>
                                <Switch
                                    checked={aiEnableThinking}
                                    disabled={!aiEnabled}
                                    onChange={(checked) =>
                                        onChange({ aiEnableThinking: checked })
                                    }
                                />
                            </div>

                            <div
                                style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                }}
                            >
                                <div>
                                    <div style={{ fontWeight: 500, fontSize: 13 }}>
                                        {t('aiAgent.reasoningTitle', '推理深度 (Reasoning Effort)')}
                                    </div>
                                    <Text type="secondary" style={{ fontSize: 12 }}>
                                        {t('aiAgent.reasoningDesc', '控制推理模型的推演思考层级')}
                                    </Text>
                                </div>
                                <Select
                                    style={{ width: 220 }}
                                    value={aiReasoningEffort}
                                    disabled={!aiEnabled}
                                    onChange={(val) => onChange({ aiReasoningEffort: val })}
                                    options={[
                                        {
                                            label: t('aiAgent.effortNone', {
                                                defaultValue: '未指定 / 关闭 (none)',
                                            }),
                                            value: 'none',
                                        },
                                        {
                                            label: t('aiAgent.effortLow', {
                                                defaultValue: '低 (low)',
                                            }),
                                            value: 'low',
                                        },
                                        {
                                            label: t('aiAgent.effortMedium', {
                                                defaultValue: '中 (medium)',
                                            }),
                                            value: 'medium',
                                        },
                                        {
                                            label: t('aiAgent.effortHigh', {
                                                defaultValue: '高 (high)',
                                            }),
                                            value: 'high',
                                        },
                                    ]}
                                />
                            </div>

                            <div
                                style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    gap: 12,
                                }}
                            >
                                <div>
                                    <div style={{ fontWeight: 500, fontSize: 13 }}>
                                        {t('aiAgent.subAgentModelTitle', '子 Agent 模型 (Sub-Agent Model)')}
                                    </div>
                                    <Text type="secondary" style={{ fontSize: 12 }}>
                                        {t(
                                            'aiAgent.subAgentModelDesc',
                                            '可选为底层子 Agent 指定更轻量/快速的模型，留空则跟随主 Agent 当前所选模型'
                                        )}
                                    </Text>
                                </div>
                                <Select
                                    style={{ width: 220, flexShrink: 0 }}
                                    value={aiSubAgentModelId || ''}
                                    disabled={!aiEnabled}
                                    onChange={(val) => onChange({ aiSubAgentModelId: val })}
                                    options={[
                                        {
                                            label: t(
                                                'aiAgent.subAgentModelFollowMain',
                                                '跟随主 Agent 模型（默认）'
                                            ),
                                            value: '',
                                        },
                                        ...currentModels.map((m) => ({
                                            label: m.name ? `${m.name} (${m.model})` : m.model,
                                            value: m.id,
                                        })),
                                    ]}
                                />
                            </div>
                        </Space>
                    </Card>

                    {/* 卡片 3：默认系统提示词 */}
                    <Card
                        size="small"
                        title={
                            <Space size={8}>
                                <Bot size={15} />
                                <span>
                                    {t(
                                        'aiAgent.promptCardTitle',
                                        '默认系统角色提示词 (System Prompt)'
                                    )}
                                </span>
                            </Space>
                        }
                        extra={
                            <Button
                                size="small"
                                type="text"
                                icon={<RotateCcw size={12} />}
                                disabled={!aiEnabled}
                                onClick={handleResetPrompt}
                            >
                                {t('aiAgent.resetDefaultPrompt', '恢复默认')}
                            </Button>
                        }
                        style={{ borderRadius: 8 }}
                    >
                        <TextArea
                            autoSize={{ minRows: 5, maxRows: 8 }}
                            value={aiSystemPrompt}
                            disabled={!aiEnabled}
                            onChange={(e) => onChange({ aiSystemPrompt: e.target.value })}
                            placeholder={t('aiAgent.promptPlaceholder', '请输入系统提示词...')}
                        />
                    </Card>
                </Space>
            </div>

            <ModelEditModal
                open={editModalOpen}
                initialData={editingModel}
                onSave={handleSaveModelItem}
                onClose={() => {
                    setEditModalOpen(false)
                    setEditingModel(null)
                }}
            />
        </Space>
    )
}

