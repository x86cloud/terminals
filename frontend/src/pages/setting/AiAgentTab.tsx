import React from 'react'
import { Card, Input, Slider, Switch, Select, Button, Space, Typography, Tag, Divider } from 'antd'
import { Bot, Server, Shield, Sparkles } from 'lucide-react'
import s from './AiAgentTab.module.less'

const { Text } = Typography
const { TextArea } = Input

interface Props {
    aiBaseUrl: string
    aiApiKey: string
    aiModel: string
    aiTemperature: number
    aiMaxContextTokens: number
    aiCompressionStrategy: 'summary' | 'sliding'
    aiEnableMultimodal: boolean
    aiEnableWebSearch?: boolean
    aiEnablePermissionGuard?: boolean
    aiBlockHighRiskCommands?: boolean
    aiEnableThinking?: boolean
    aiReasoningEffort?: 'none' | 'low' | 'medium' | 'high'
    aiEnableVerifier?: boolean
    aiMaxParallel?: number
    aiSystemPrompt: string
    onChange: (fields: Partial<{
        aiBaseUrl: string
        aiApiKey: string
        aiModel: string
        aiTemperature: number
        aiMaxContextTokens: number
        aiCompressionStrategy: 'summary' | 'sliding'
        aiEnableMultimodal: boolean
        aiEnableWebSearch: boolean
        aiEnablePermissionGuard: boolean
        aiBlockHighRiskCommands: boolean
        aiEnableThinking: boolean
        aiReasoningEffort: 'none' | 'low' | 'medium' | 'high'
        aiEnableVerifier: boolean
        aiMaxParallel: number
        aiSystemPrompt: string
    }>) => void
}

export default function AiAgentTab({
    aiBaseUrl,
    aiApiKey,
    aiModel,
    aiTemperature,
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
                })
                break
            case 'openai':
                onChange({
                    aiBaseUrl: 'https://api.openai.com/v1',
                    aiModel: 'gpt-4o-mini',
                })
                break
            case 'qwen':
                onChange({
                    aiBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
                    aiModel: 'qwen-turbo',
                })
                break
            case 'ollama':
                onChange({
                    aiBaseUrl: 'http://localhost:11434/v1',
                    aiModel: 'llama3',
                })
                break
        }
    }

    return (
        <Space orientation="vertical" size={16} style={{ width: '100%' }}>
            <div>
                <div className={s.sectionTitle}>
                    <Bot size={18} />
                    <span>AI 智能体设置</span>
                </div>
                <div className={s.sectionDesc}>
                    配置大模型 API 接入、上下文管理与多模态识别参数。
                </div>
            </div>

            {/* 卡片 1：模型服务与鉴权 */}
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
                        <Tag style={{ cursor: 'pointer' }} color="blue" onClick={() => handlePreset('deepseek')}>DeepSeek</Tag>
                        <Tag style={{ cursor: 'pointer' }} color="green" onClick={() => handlePreset('openai')}>OpenAI</Tag>
                        <Tag style={{ cursor: 'pointer' }} color="orange" onClick={() => handlePreset('qwen')}>通义千问</Tag>
                        <Tag style={{ cursor: 'pointer' }} color="purple" onClick={() => handlePreset('ollama')}>Ollama (本地)</Tag>
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
                        <div>
                            <div style={{ fontSize: 13, fontWeight: 500 }}>Temperature (多样性: {aiTemperature})</div>
                            <Text type="secondary" style={{ fontSize: 12 }}>
                                较低的值更专注确定，较高的值更具创造性
                            </Text>
                        </div>
                        <div style={{ width: 160 }}>
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

            {/* 卡片 2：安全防护与工具调用 */}
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

            {/* 卡片 3：高级特性 */}
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

            {/* 卡片 4：系统提示词 */}
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
