import { useState } from 'react'
import { Modal, Button, Select, Input, Tag, App } from 'antd'
import { Sparkles, Wand2, Lightbulb } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { API } from '@/api'

interface Props {
    open: boolean
    onClose: () => void
    onGenerated: (yaml: string) => void
}

const PRESET_IMAGES = [
    { value: 'nginx:alpine', label: 'nginx:alpine (Web / Reverse Proxy)' },
    { value: 'redis:7-alpine', label: 'redis:7-alpine (Cache / Message Queue)' },
    { value: 'mysql:8.0', label: 'mysql:8.0 (MySQL Database)' },
    { value: 'postgres:16-alpine', label: 'postgres:16-alpine (PostgreSQL Database)' },
    { value: 'mongo:6.0', label: 'mongo:6.0 (MongoDB Database)' },
    { value: 'node:20-alpine', label: 'node:20-alpine (Node.js Runtime)' },
    { value: 'python:3.11-alpine', label: 'python:3.11-alpine (Python Runtime)' },
    { value: 'openjdk:17-alpine', label: 'openjdk:17-alpine (Java Runtime)' },
    { value: 'golang:1.22-alpine', label: 'golang:1.22-alpine (Go Runtime)' },
    { value: 'php:8.2-fpm-alpine', label: 'php:8.2-fpm-alpine (PHP FastCGI)' },
    { value: 'rabbitmq:3-management-alpine', label: 'rabbitmq:3-management-alpine (RabbitMQ)' },
    { value: 'minio/minio:latest', label: 'minio/minio:latest (MinIO S3 Storage)' },
    { value: 'elasticsearch:8.11.0', label: 'elasticsearch:8.11.0 (Elasticsearch Engine)' },
    { value: 'prom/prometheus:latest', label: 'prom/prometheus:latest (Prometheus Metrics)' },
    { value: 'grafana/grafana:latest', label: 'grafana/grafana:latest (Grafana Dashboard)' },
    { value: 'caddy:alpine', label: 'caddy:alpine (Caddy HTTPS Server)' },
    { value: 'wordpress:latest', label: 'wordpress:latest (WordPress App)' },
]

export default function DockerComposeGenerateModal({
    open,
    onClose,
    onGenerated,
}: Props) {
    const { t } = useTranslation(['docker', 'common'])
    const { message } = App.useApp()
    const [selectedImages, setSelectedImages] = useState<string[]>(['nginx:alpine', 'redis:7-alpine'])
    const [prompt, setPrompt] = useState('')
    const [loading, setLoading] = useState(false)

    const quickChips = [
        { key: 'chipVolumes', text: t('compose.chipVolumes', { defaultValue: '挂载持久化数据卷 (Volumes)' }) },
        { key: 'chipPorts', text: t('compose.chipPorts', { defaultValue: '暴露对外访问端口映射 (Ports)' }) },
        { key: 'chipEnv', text: t('compose.chipEnv', { defaultValue: '配置安全环境变量与连接密码' }) },
        { key: 'chipHealth', text: t('compose.chipHealth', { defaultValue: '配置容器健康检查 (Healthcheck)' }) },
        { key: 'chipNetworks', text: t('compose.chipNetworks', { defaultValue: '配置自定义内部网段互通 (Networks)' }) },
        { key: 'chipRestart', text: t('compose.chipRestart', { defaultValue: '设置自动重启策略 (unless-stopped)' }) },
        { key: 'chipDepends', text: t('compose.chipDepends', { defaultValue: '配置服务依赖与启动顺序 (depends_on)' }) },
    ]

    const handleAddChip = (chipText: string) => {
        setPrompt((prev) => {
            const trimmed = prev.trim()
            if (!trimmed) {
                return chipText
            }
            if (trimmed.endsWith('；') || trimmed.endsWith(';') || trimmed.endsWith('，') || trimmed.endsWith(',')) {
                return `${trimmed} ${chipText}`
            }
            return `${trimmed}；${chipText}`
        })
    }

    const handleGenerate = async () => {
        setLoading(true)
        try {
            const resultYaml = await API.dockerGenerateCompose(selectedImages, prompt.trim())
            if (!resultYaml || !resultYaml.trim()) {
                throw new Error(t('compose.genFail', { defaultValue: '未获取到生成的 Docker Compose 配置内容' }))
            }
            onGenerated(resultYaml)
            message.success(t('compose.genSuccess', { defaultValue: 'Docker Compose 配置已生成并填入编辑器' }))
            onClose()
        } catch (err: any) {
            message.error(t('compose.genError', { defaultValue: '生成 Docker Compose 失败: {{error}}', error: err.message || String(err) }))
        } finally {
            setLoading(false)
        }
    }

    return (
        <Modal
            open={open}
            title={
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Sparkles size={17} color="var(--accent)" />
                    <span style={{ fontWeight: 600 }}>{t('compose.aiModalTitle', { defaultValue: 'AI 智能生成 Docker Compose' })}</span>
                </div>
            }
            width={660}
            onCancel={() => !loading && onClose()}
            footer={[
                <Button key="cancel" onClick={onClose} disabled={loading}>
                    {t('common.cancel', { defaultValue: '取消' })}
                </Button>,
                <Button
                    key="submit"
                    type="primary"
                    icon={<Wand2 size={13} />}
                    loading={loading}
                    onClick={handleGenerate}
                >
                    {loading ? t('compose.aiGenerating', { defaultValue: '正在生成 Compose...' }) : t('compose.aiStartGenerate', { defaultValue: '开始生成' })}
                </Button>,
            ]}
            destroyOnHidden
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '10px 0 4px' }}>
                <div>
                    <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 6, color: 'var(--text)' }}>
                        {t('compose.aiImagesLabel', { defaultValue: '服务镜像 (Images)' })}{' '}
                        <span style={{ fontSize: 11.5, color: 'var(--text-dim)', fontWeight: 'normal' }}>
                            {t('compose.aiImagesHint', { defaultValue: '(支持多选或直接输入任意自定义镜像标签)' })}
                        </span>
                    </div>
                    <Select
                        mode="tags"
                        style={{ width: '100%' }}
                        placeholder={t('compose.aiImagesPlaceholder', { defaultValue: '选择或输入镜像名称按回车添加，如 nginx:alpine, redis:7-alpine, mysql:8.0...' })}
                        value={selectedImages}
                        onChange={setSelectedImages}
                        options={PRESET_IMAGES}
                        maxTagCount="responsive"
                    />
                    <div style={{ fontSize: 11.5, color: 'var(--text-dim)', marginTop: 4 }}>
                        {t('compose.aiImagesDesc', { defaultValue: '模型将根据选定的镜像自动划分服务模块（Services），并合理推导对应的端口映射与卷配置。' })}
                    </div>
                </div>

                <div>
                    <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 6, color: 'var(--text)' }}>
                        {t('compose.aiPromptLabel', { defaultValue: '业务架构与具体需求描述' })}{' '}
                        <span style={{ fontSize: 11.5, color: 'var(--text-dim)', fontWeight: 'normal' }}>
                            {t('compose.aiPromptHint', { defaultValue: '(可选，支持自然语言)' })}
                        </span>
                    </div>
                    <Input.TextArea
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        placeholder={t('compose.aiPromptPlaceholder', { defaultValue: '例如: 部署一个 Nginx 反向代理与 Node.js 后端服务，后端连接 Redis 缓存；Nginx 暴露 80/443 端口并挂载本地 conf 目录，Redis 开启 AOF 持久化与连接密码保护...' })}
                        rows={4}
                        style={{
                            fontSize: 12.5,
                            lineHeight: 1.5,
                            background: 'var(--bg-2)',
                            color: 'var(--text)',
                        }}
                    />

                    {/* 快捷需求标签 */}
                    <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                        <span style={{ fontSize: 11.5, color: 'var(--text-faint)' }}>{t('compose.aiChipsLabel', { defaultValue: '快捷常用需求：' })}</span>
                        {quickChips.map((chip) => (
                            <Tag
                                key={chip.key}
                                style={{
                                    cursor: 'pointer',
                                    userSelect: 'none',
                                    borderRadius: 4,
                                    fontSize: 11.5,
                                    padding: '1px 7px',
                                    margin: 0,
                                    background: 'var(--bg-2)',
                                    borderColor: 'var(--border)',
                                    color: 'var(--text-dim)',
                                }}
                                onClick={() => handleAddChip(chip.text)}
                            >
                                + {chip.text}
                            </Tag>
                        ))}
                    </div>
                </div>

                <div
                    style={{
                        padding: '10px 12px',
                        background: 'var(--bg-2)',
                        borderRadius: 6,
                        border: '1px solid var(--border)',
                        display: 'flex',
                        gap: 8,
                        alignItems: 'flex-start',
                    }}
                >
                    <Lightbulb size={15} color="var(--accent)" style={{ marginTop: 2, flexShrink: 0 }} />
                    <div style={{ fontSize: 11.5, color: 'var(--text-dim)', lineHeight: 1.45 }}>
                        {t('compose.aiTip', { defaultValue: '专职 Compose Agent 将按生产规范生成完整的 docker-compose.yml，自动补齐服务名、容器名、环境变量、内部网段、持久化挂载卷与中文配置注释。生成后将自动填入编辑器中。' })}
                    </div>
                </div>
            </div>
        </Modal>
    )
}
