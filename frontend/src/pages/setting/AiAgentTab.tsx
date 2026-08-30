import React from 'react'
import { Card, Input, InputNumber, Slider, Switch, Select, Space, Typography, Tag } from 'antd'
import { Bot, Server, Shield, Sparkles, Layers } from 'lucide-react'
import { AppSettings } from '@/types'
import s from './AiAgentTab.module.less'

const { Text } = Typography
const { TextArea } = Input

interface Props {
    aiBaseUrl: string
    aiApiKey: string
    aiModel: string
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
    const handlePreset = (preset: 'deepseek' | 'openai' | 'qwen' | 'ollama') => {
        switch (preset) {
            case 'deepseek':
                onChange({
                    aiBaseUrl: 'https://api.deepseek.com',
                    aiModel: 'deepseek-v4-flash',
                    aiModelContextTokens: 65536,
                })
                break
            case 'openai':
                onChange({
                    aiBaseUrl: 'https://api.openai.com/v1',
                    aiModel: 'gpt-4o-mini',
                    aiModelContextTokens: 128000,
                })
                break
            case 'qwen':
                onChange({
                    aiBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
                    aiModel: 'qwen-turbo',
                    aiModelContextTokens: 131072,
                })
                break
            case 'ollama':
                onChange({
                    aiBaseUrl: 'http://localhost:11434/v1',
                    aiModel: 'llama3',
                    aiModelContextTokens: 32768,
                })
                break
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
                    配置大模型 API 接入、上下文窗口、历史长文本压缩方式与安全管控。
                </div>
            </div>

            {/* 卡片 1：模型服务与接入 */}
            <Card
                size="small"
                title={
                    <Space size={8}>
                        <Server size={15} />
                        <span>模型服务与接入</span>
                    </Space>
                }
                extra={
                    <Space size={6}>
                        <Tag style={{ cursor: 'pointer' }} color="blue" onClick={() => handlePreset('deepseek')}>DeepSeek (64K)</Tag>
                        <Tag style={{ cursor: 'pointer' }} color="green" onClick={() => handlePreset('openai')}>OpenAI (128K)</Tag>
                        <Tag style={{ cursor: 'pointer' }} color="orange" onClick={() => handlePreset('qwen')}>通义千问 (128K)</Tag>
                        <Tag style={{ cursor: 'pointer' }} color="purple" onClick={() => handlePreset('ollama')}>Ollama (32K)</Tag>
                    </Space>
                }
                style={{ borderRadius: 8 }}
            >
                <Space orientation="vertical" size={14} style={{ width: '100%' }}>
                    <div>
                        <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>API Base URL</div>
                        <Input
                            placeholder="https://api.deepseek.com / https://api.openai.com/v1"
                            value={aiBaseUrl}
                            onChange={(e) => onChange({ aiBaseUrl: e.target.value })}
                        />
                    </div>

                    <div>
                        <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>API Key (访问凭证)</div>
                        <Input.Password
                            placeholder="sk-..."
                            value={aiApiKey}
                            onChange={(e) => onChange({ aiApiKey: e.target.value })}
                        />
                    </div>

                    <div>
                        <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>默认模型 (Model Name)</div>
                        <Input
                            placeholder="deepseek-v4-flash / gpt-4o / qwen-plus"
                            value={aiModel}
                            onChange={(e) => onChange({ aiModel: e.target.value })}
                        />
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ flex: 1, marginRight: 16 }}>
                            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 2 }}>
                                模型上下文总长度 (Context Window)
                            </div>
                            <Space size={4} wrap style={{ marginTop: 2 }}>
                                {[
                                    { label: '4K', value: 4096 },
                                    { label: '8K', value: 8192 },
                                    { label: '16K', value: 16384 },
                                    { label: '32K', value: 32768 },
                                    { label: '64K', value: 65536 },
                                    { label: '128K', value: 131072 },
                                    { label: '200K', value: 204800 },
                                ].map((p) => (
                                    <Tag
                                        key={p.value}
                                        color={aiModelContextTokens === p.value ? 'blue' : undefined}
                                        style={{ cursor: 'pointer', margin: 0, fontSize: 11, padding: '0 6px' }}
                                        onClick={() => onChange({ aiModelContextTokens: p.value })}
                                    >
                                        {p.label}
                                    </Tag>
                                ))}
                            </Space>
                        </div>
                        <div style={{ width: 220, flexShrink: 0 }}>
                            <InputNumber
                                style={{ width: '100%' }}
                                min={1024}
                                max={2097152}
                                step={1024}
                                addonAfter="Tokens"
                                value={aiModelContextTokens}
                                onChange={(val) => onChange({ aiModelContextTokens: val || 65536 })}
                            />
                        </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <div style={{ fontSize: 13, fontWeight: 500 }}>Temperature (多样性: {aiTemperature})</div>
                            <Text type="secondary" style={{ fontSize: 12 }}>
                                较低的值更专注确定，较高的值更具创造性
                            </Text>
                        </div>
                        <div style={{ width: 220 }}>
                            <Slider
                                min={0}
                                max={2}
                                step={0.1}
                                value={aiTemperature}
                                onChange={(val) => onChange({ aiTemperature: val })}
                            />
                        </div>
                    </div>
                </Space>
            </Card>

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
        </Space>
    )
}
