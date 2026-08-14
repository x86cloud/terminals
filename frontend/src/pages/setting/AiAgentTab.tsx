import React from 'react'
import { Bot, Server, Shield, Edit } from 'lucide-react'
import s from './AiAgentTab.module.less'

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
        <div className={s.container}>
            {/* 卡片 1：核心 API 与模型配置 */}
            <div className={s.headerSection}>
                <div className={s.sectionTitle}>
                    <Bot size={18} />
                    <span>AI 智能体设置</span>
                </div>
                <div className={s.sectionDesc}>
                    配置大模型 API 接入、上下文管理与多模态识别参数。
                </div>
            </div>

            {/* 卡片 1：模型服务与鉴权 */}
            <div className={s.card}>
                <div className={s.cardTitle}>
                    <Server size={14} />
                    <span>模型服务与鉴权配置</span>
                </div>

                {/* 快捷预设按钮 */}
                <div className={s.presetsRow}>
                    <span className={s.presetLabel}>快捷填充:</span>
                    <button className={s.presetBtn} onClick={() => handlePreset('deepseek')}>DeepSeek</button>
                    <button className={s.presetBtn} onClick={() => handlePreset('openai')}>OpenAI</button>
                    <button className={s.presetBtn} onClick={() => handlePreset('qwen')}>通义千问</button>
                    <button className={s.presetBtn} onClick={() => handlePreset('ollama')}>Ollama (Local)</button>
                </div>

                <div className={s.formGroup}>
                    <label className={s.label}>Base URL（OpenAI）</label>
                    <input
                        type="text"
                        className={s.input}
                        placeholder="https://api.deepseek.com"
                        value={aiBaseUrl}
                        onChange={(e) => onChange({ aiBaseUrl: e.target.value })}
                    />
                    <div className={s.helpText}>支持 DeepSeek、OpenAI、阿里云 DashScope、Ollama 等 OpenAI 兼容格式接口</div>
                </div>

                <div className={s.formGroup}>
                    <label className={s.label}>API Key（密钥）</label>
                    <input
                        type="password"
                        className={s.input}
                        placeholder="sk-..."
                        value={aiApiKey}
                        onChange={(e) => onChange({ aiApiKey: e.target.value })}
                    />
                </div>

                <div className={s.rowGroup}>
                    <div className={s.formGroup} style={{ flex: 2 }}>
                        <label className={s.label}>模型名称（Model）</label>
                        <input
                            type="text"
                            className={s.input}
                            placeholder="deepseek-v4-flash"
                            value={aiModel}
                            onChange={(e) => onChange({ aiModel: e.target.value })}
                        />
                    </div>

                    <div className={s.formGroup} style={{ flex: 1 }}>
                        <label className={s.label}>
                            <span>采样温度</span>
                            <span className={s.subLabel}>({aiTemperature})</span>
                        </label>
                        <input
                            type="number"
                            step="0.1"
                            min="0"
                            max="2"
                            className={s.input}
                            value={aiTemperature}
                            onChange={(e) => onChange({ aiTemperature: parseFloat(e.target.value) || 0.7 })}
                        />
                    </div>
                </div>

                <div className={s.toggleRow}>
                    <div className={s.toggleInfo}>
                        <span className={s.toggleTitle}>开启多模态图像识别 (Multimodal)</span>
                        <span className={s.toggleSub}>启用后允许粘贴/上传图片并将其转换为多模态内容供大模型分析</span>
                    </div>
                    <label className={s.switch}>
                        <input
                            type="checkbox"
                            checked={aiEnableMultimodal}
                            onChange={(e) => onChange({ aiEnableMultimodal: e.target.checked })}
                        />
                        <span className={s.slider} />
                    </label>
                </div>

                <div className={s.toggleRow}>
                    <div className={s.toggleInfo}>
                        <span className={s.toggleTitle}>开启联网搜索</span>
                        <span className={s.toggleSub}>启用后 AI Agent 可自动调用搜索引擎获取实时网页信息与最新技术文档</span>
                    </div>
                    <label className={s.switch}>
                        <input
                            type="checkbox"
                            checked={aiEnableWebSearch}
                            onChange={(e) => onChange({ aiEnableWebSearch: e.target.checked })}
                        />
                        <span className={s.slider} />
                    </label>
                </div>

                <div className={s.toggleRow}>
                    <div className={s.toggleInfo}>
                        <span className={s.toggleTitle}>开启深度思考模式 (Thinking / Reasoning)</span>
                        <span className={s.toggleSub}>控制思考模式与非思考模式的转换</span>
                    </div>
                    <label className={s.switch}>
                        <input
                            type="checkbox"
                            checked={aiEnableThinking}
                            onChange={(e) => onChange({ aiEnableThinking: e.target.checked })}
                        />
                        <span className={s.slider} />
                    </label>
                </div>

                <div className={s.toggleRow}>
                    <div className={s.toggleInfo}>
                        <span className={s.toggleTitle}>思考深度等级</span>
                        <span className={s.toggleSub}>控制模型的推理强度</span>
                    </div>
                    <select
                        className={s.select}
                        value={aiReasoningEffort}
                        onChange={(e) => onChange({ aiReasoningEffort: e.target.value as 'none' | 'low' | 'medium' | 'high' })}
                    >
                        <option value="none">未指定 / 关闭 (none)</option>
                        <option value="low">低 (low)</option>
                        <option value="medium">中 (medium)</option>
                        <option value="high">高 (high)</option>
                    </select>
                </div>
            </div>

            {/* 卡片 3：权限与安全审查 (Permission Guard) */}
            <div className={s.card}>
                <div className={s.cardTitle}>
                    <Shield size={14} />
                    <span>权限与安全审查 (Permission Guard)</span>
                </div>

                <div className={s.toggleRow}>
                    <div className={s.toggleInfo}>
                        <span className={s.toggleTitle}>开启全局 Tool 权限审查引擎</span>
                        <span className={s.toggleSub}>统一管控所有 Tool 调用的安全策略（放行 / 用户确认 / 高危拦截）</span>
                    </div>
                    <label className={s.switch}>
                        <input
                            type="checkbox"
                            checked={aiEnablePermissionGuard}
                            onChange={(e) => onChange({ aiEnablePermissionGuard: e.target.checked })}
                        />
                        <span className={s.slider} />
                    </label>
                </div>

                <div className={s.toggleRow}>
                    <div className={s.toggleInfo}>
                        <span className={s.toggleTitle}>开启高危 Shell 命令动态拦截</span>
                        <span className={s.toggleSub}>自动解析 ssh_exec 命令参数，若命中有毁灭性风险的命令模式（如 rm -rf /、mkfs、reboot 等）直接拒绝</span>
                    </div>
                    <label className={s.switch}>
                        <input
                            type="checkbox"
                            checked={aiBlockHighRiskCommands}
                            onChange={(e) => onChange({ aiBlockHighRiskCommands: e.target.checked })}
                        />
                        <span className={s.slider} />
                    </label>
                </div>
            </div>

            {/* 卡片 4：系统提示词 */}
            <div className={s.card}>
                <div className={s.cardTitle}>
                    <Edit size={14} />
                    <span>系统提示词 (System Prompt)</span>
                </div>

                <div className={s.formGroup}>
                    <textarea
                        rows={3}
                        className={s.textarea}
                        placeholder="你是一个有用的 AI 助手，能够回答用户的各种技术与日常问题，并给出精准优雅的解答。"
                        value={aiSystemPrompt}
                        onChange={(e) => onChange({ aiSystemPrompt: e.target.value })}
                    />
                    <div className={s.helpText}>为 AI Agent 设定角色定位与回复习惯风格</div>
                </div>
            </div>
        </div>
    )
}
