import React, { useState } from 'react'
import { Modal, Button, Select, Input, message, Tag } from 'antd'
import { Sparkles, Wand2, Lightbulb } from 'lucide-react'
import { API } from '@/api'

interface Props {
    open: boolean
    onClose: () => void
    onGenerated: (yaml: string) => void
}

const PRESET_IMAGES = [
    { value: 'nginx:alpine', label: 'nginx:alpine (Web / 反向代理)' },
    { value: 'redis:7-alpine', label: 'redis:7-alpine (键值缓存 / 消息队列)' },
    { value: 'mysql:8.0', label: 'mysql:8.0 (MySQL 关系数据库)' },
    { value: 'postgres:16-alpine', label: 'postgres:16-alpine (PostgreSQL 关系数据库)' },
    { value: 'mongo:6.0', label: 'mongo:6.0 (MongoDB 文档数据库)' },
    { value: 'node:20-alpine', label: 'node:20-alpine (Node.js 运行时)' },
    { value: 'python:3.11-alpine', label: 'python:3.11-alpine (Python 运行时)' },
    { value: 'openjdk:17-alpine', label: 'openjdk:17-alpine (Java 运行时)' },
    { value: 'golang:1.22-alpine', label: 'golang:1.22-alpine (Go 运行时)' },
    { value: 'php:8.2-fpm-alpine', label: 'php:8.2-fpm-alpine (PHP FastCGI)' },
    { value: 'rabbitmq:3-management-alpine', label: 'rabbitmq:3-management-alpine (RabbitMQ 消息队列)' },
    { value: 'minio/minio:latest', label: 'minio/minio:latest (S3 兼容对象存储)' },
    { value: 'elasticsearch:8.11.0', label: 'elasticsearch:8.11.0 (分布式搜索引擎)' },
    { value: 'prom/prometheus:latest', label: 'prom/prometheus:latest (指标监控系统)' },
    { value: 'grafana/grafana:latest', label: 'grafana/grafana:latest (数据可视化仪表盘)' },
    { value: 'caddy:alpine', label: 'caddy:alpine (自动 HTTPS Web 服务器)' },
    { value: 'wordpress:latest', label: 'wordpress:latest (WordPress 博客应用)' },
]

const QUICK_CHIPS = [
    '挂载持久化数据卷 (Volumes)',
    '暴露对外访问端口映射 (Ports)',
    '配置安全环境变量与连接密码',
    '配置容器健康检查 (Healthcheck)',
    '配置自定义内部网段互通 (Networks)',
    '设置自动重启策略 (unless-stopped)',
    '配置服务依赖与启动顺序 (depends_on)',
]

export default function DockerComposeGenerateModal({
    open,
    onClose,
    onGenerated,
}: Props) {
    const [selectedImages, setSelectedImages] = useState<string[]>(['nginx:alpine', 'redis:7-alpine'])
    const [prompt, setPrompt] = useState('')
    const [loading, setLoading] = useState(false)

    const handleAddChip = (chip: string) => {
        setPrompt((prev) => {
            const trimmed = prev.trim()
            if (!trimmed) {
                return chip
            }
            if (trimmed.endsWith('；') || trimmed.endsWith(';') || trimmed.endsWith('，') || trimmed.endsWith(',')) {
                return `${trimmed} ${chip}`
            }
            return `${trimmed}；${chip}`
        })
    }

    const handleGenerate = async () => {
        setLoading(true)
        try {
            const resultYaml = await API.dockerGenerateCompose(selectedImages, prompt.trim())
            if (!resultYaml || !resultYaml.trim()) {
                throw new Error('未获取到生成的 Docker Compose 配置内容')
            }
            onGenerated(resultYaml)
            message.success('Docker Compose 配置已生成并填入编辑器')
            onClose()
        } catch (err: any) {
            message.error(`生成 Docker Compose 失败: ${err.message || String(err)}`)
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
                    <span style={{ fontWeight: 600 }}>AI 智能生成 Docker Compose</span>
                </div>
            }
            width={660}
            onCancel={() => !loading && onClose()}
            footer={[
                <Button key="cancel" onClick={onClose} disabled={loading}>
                    取消
                </Button>,
                <Button
                    key="submit"
                    type="primary"
                    icon={<Wand2 size={13} />}
                    loading={loading}
                    onClick={handleGenerate}
                >
                    {loading ? '正在生成 Compose...' : '开始生成'}
                </Button>,
            ]}
            destroyOnHidden
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '10px 0 4px' }}>
                <div>
                    <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 6, color: 'var(--text)' }}>
                        服务镜像 (Images) <span style={{ fontSize: 11.5, color: 'var(--text-dim)', fontWeight: 'normal' }}>(支持多选或直接输入任意自定义镜像标签)</span>
                    </div>
                    <Select
                        mode="tags"
                        style={{ width: '100%' }}
                        placeholder="选择或输入镜像名称按回车添加，如 nginx:alpine, redis:7-alpine, mysql:8.0..."
                        value={selectedImages}
                        onChange={setSelectedImages}
                        options={PRESET_IMAGES}
                        maxTagCount="responsive"
                    />
                    <div style={{ fontSize: 11.5, color: 'var(--text-dim)', marginTop: 4 }}>
                        模型将根据选定的镜像自动划分服务模块（Services），并合理推导对应的端口映射与卷配置。
                    </div>
                </div>

                <div>
                    <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 6, color: 'var(--text)' }}>
                        业务架构与具体需求描述 <span style={{ fontSize: 11.5, color: 'var(--text-dim)', fontWeight: 'normal' }}>(可选，支持自然语言)</span>
                    </div>
                    <Input.TextArea
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        placeholder="例如: 部署一个 Nginx 反向代理与 Node.js 后端服务，后端连接 Redis 缓存；Nginx 暴露 80/443 端口并挂载本地 conf 目录，Redis 开启 AOF 持久化与连接密码保护..."
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
                        <span style={{ fontSize: 11.5, color: 'var(--text-faint)' }}>快捷常用需求：</span>
                        {QUICK_CHIPS.map((chip) => (
                            <Tag
                                key={chip}
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
                                onClick={() => handleAddChip(chip)}
                            >
                                + {chip}
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
                        专职 Compose Agent 将按生产规范生成完整的 <code>docker-compose.yml</code>，自动补齐服务名、容器名、环境变量、内部网段、持久化挂载卷与中文配置注释。生成后将自动填入编辑器中。
                    </div>
                </div>
            </div>
        </Modal>
    )
}
