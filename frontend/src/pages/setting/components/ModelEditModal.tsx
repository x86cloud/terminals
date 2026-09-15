import React, { useState, useEffect } from 'react'
import { Modal, Button, Input, InputNumber, Slider, Space, Tag, Switch, message } from 'antd'
import { Sparkles, Server } from 'lucide-react'
import { AiModelItem } from '@/types'
import s from './ModelEditModal.module.less'

interface Props {
    open: boolean
    initialData?: AiModelItem | null
    onSave: (item: AiModelItem) => void
    onClose: () => void
}

const PRESETS = [
    {
        label: 'DeepSeek (64K)',
        color: 'blue',
        data: {
            name: 'DeepSeek Flash',
            model: 'deepseek-v4-flash',
            baseUrl: 'https://api.deepseek.com',
            contextTokens: 65536,
            temperature: 0.7,
            enableMultimodal: false,
        },
    },
    {
        label: 'OpenAI (128K 视觉)',
        color: 'green',
        data: {
            name: 'GPT-4o mini',
            model: 'gpt-4o-mini',
            baseUrl: 'https://api.openai.com/v1',
            contextTokens: 128000,
            temperature: 0.7,
            enableMultimodal: true,
        },
    },
    {
        label: '通义千问 (128K)',
        color: 'orange',
        data: {
            name: '通义千问 Turbo',
            model: 'qwen-turbo',
            baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
            contextTokens: 131072,
            temperature: 0.7,
            enableMultimodal: false,
        },
    },
    {
        label: 'Ollama 本地 (32K)',
        color: 'purple',
        data: {
            name: 'Ollama 本地',
            model: 'llama3',
            baseUrl: 'http://localhost:11434/v1',
            contextTokens: 32768,
            temperature: 0.7,
            enableMultimodal: false,
        },
    },
]

export const ModelEditModal: React.FC<Props> = ({
    open,
    initialData,
    onSave,
    onClose,
}) => {
    const [name, setName] = useState('')
    const [model, setModel] = useState('')
    const [baseUrl, setBaseUrl] = useState('')
    const [apiKey, setApiKey] = useState('')
    const [contextTokens, setContextTokens] = useState<number>(65536)
    const [temperature, setTemperature] = useState<number>(0.7)
    const [enableMultimodal, setEnableMultimodal] = useState<boolean>(false)

    const isEdit = !!initialData?.id

    useEffect(() => {
        if (open) {
            if (initialData) {
                setName(initialData.name || '')
                setModel(initialData.model || '')
                setBaseUrl(initialData.baseUrl || '')
                setApiKey(initialData.apiKey || '')
                setContextTokens(initialData.contextTokens || 65536)
                setTemperature(initialData.temperature ?? 0.7)
                setEnableMultimodal(!!initialData.enableMultimodal)
            } else {
                setName('')
                setModel('')
                setBaseUrl('https://api.deepseek.com')
                setApiKey('')
                setContextTokens(65536)
                setTemperature(0.7)
                setEnableMultimodal(false)
            }
        }
    }, [open, initialData])

    const handleApplyPreset = (presetData: any) => {
        setName(presetData.name)
        setModel(presetData.model)
        setBaseUrl(presetData.baseUrl)
        setContextTokens(presetData.contextTokens)
        if (presetData.temperature !== undefined) {
            setTemperature(presetData.temperature)
        }
        if (presetData.enableMultimodal !== undefined) {
            setEnableMultimodal(presetData.enableMultimodal)
        }
        message.success(`已应用 ${presetData.name} 预设模板`)
    }

    const handleSubmit = () => {
        if (!name.trim()) {
            message.warning('请输入模型显示名称')
            return
        }
        if (!model.trim()) {
            message.warning('请输入模型标识')
            return
        }
        if (!baseUrl.trim()) {
            message.warning('请输入 API 服务地址')
            return
        }

        const item: AiModelItem = {
            id: initialData?.id || `model_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            name: name.trim(),
            model: model.trim(),
            baseUrl: baseUrl.trim(),
            apiKey: apiKey.trim(),
            contextTokens: contextTokens || 65536,
            temperature: temperature ?? 0.7,
            enableMultimodal: !!enableMultimodal,
        }

        onSave(item)
        onClose()
    }

    return (
        <Modal
            open={open}
            title={
                <Space size={8}>
                    <Server size={18} color="var(--accent)" />
                    <span>{isEdit ? '编辑模型配置' : '添加大模型'}</span>
                </Space>
            }
            width={520}
            destroyOnClose
            onCancel={onClose}
            footer={
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                    <Button onClick={onClose}>取消</Button>
                    <Button type="primary" onClick={handleSubmit}>
                        保存配置
                    </Button>
                </div>
            }
        >
            <div className={s.modalBody}>
                {/* 快捷厂商预设 */}
                <div className={s.presetSection}>
                    <div className={s.presetHeader}>
                        <Sparkles size={13} color="var(--accent)" />
                        <span>常用厂商快捷预设 (点击一键填入)</span>
                    </div>
                    <div className={s.presetButtons}>
                        {PRESETS.map((p) => (
                            <Tag
                                key={p.label}
                                color={p.color}
                                style={{ cursor: 'pointer', padding: '2px 8px' }}
                                onClick={() => handleApplyPreset(p.data)}
                            >
                                {p.label}
                            </Tag>
                        ))}
                    </div>
                </div>

                {/* 表单项 */}
                <div className={s.formGrid}>
                    <div className={s.rowTwoCols}>
                        <div className={s.formItem}>
                            <div className={s.label}>
                                <span>
                                    显示名称 <span className={s.required}>*</span>
                                </span>
                            </div>
                            <Input
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="例如: DeepSeek Flash"
                            />
                        </div>

                        <div className={s.formItem}>
                            <div className={s.label}>
                                <span>
                                    模型标识 <span className={s.required}>*</span>
                                </span>
                            </div>
                            <Input
                                value={model}
                                onChange={(e) => setModel(e.target.value)}
                                placeholder="例如: deepseek-v4-flash"
                            />
                        </div>
                    </div>

                    <div className={s.formItem}>
                        <div className={s.label}>
                            <span>
                                API 服务地址 (Base URL) <span className={s.required}>*</span>
                            </span>
                        </div>
                        <Input
                            value={baseUrl}
                            onChange={(e) => setBaseUrl(e.target.value)}
                            placeholder="例如: https://api.deepseek.com"
                        />
                    </div>

                    <div className={s.formItem}>
                        <div className={s.label}>
                            <span>API 访问密钥 (API Key)</span>
                            <span className={s.hint}>密钥加密存储于本地</span>
                        </div>
                        <Input.Password
                            value={apiKey}
                            onChange={(e) => setApiKey(e.target.value)}
                            placeholder="sk-..."
                            autoComplete="new-password"
                        />
                    </div>

                    <div className={s.rowTwoCols}>
                        <div className={s.formItem}>
                            <div className={s.label}>
                                <span>上下文上限 (Tokens)</span>
                            </div>
                            <InputNumber
                                style={{ width: '100%' }}
                                min={4096}
                                max={2097152}
                                step={4096}
                                value={contextTokens}
                                onChange={(val) => setContextTokens(val || 65536)}
                            />
                        </div>

                        <div className={s.formItem}>
                            <div className={s.label}>
                                <span>多样性 (Temperature: {temperature})</span>
                            </div>
                            <Slider
                                min={0}
                                max={2}
                                step={0.1}
                                value={temperature}
                                onChange={(val) => setTemperature(val)}
                            />
                        </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderTop: '1px dashed var(--border)', marginTop: 4 }}>
                        <div>
                            <div style={{ fontSize: 13, fontWeight: 500 }}>多模态视觉能力 (Multimodal)</div>
                            <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                                允许发送并解析图片附件（如截图、架构图、日志图片）
                            </div>
                        </div>
                        <Switch
                            checked={enableMultimodal}
                            onChange={(checked) => setEnableMultimodal(checked)}
                        />
                    </div>
                </div>
            </div>
        </Modal>
    )
}
