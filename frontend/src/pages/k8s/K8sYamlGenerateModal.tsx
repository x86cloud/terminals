import React, { useState, useEffect } from 'react'
import { Modal, Space, Button, Select, Input, message, Tag } from 'antd'
import { Sparkles, Bot, Wand2, Lightbulb, Layers } from 'lucide-react'
import { API } from '@/api'

interface Props {
    open: boolean
    onClose: () => void
    onGenerated: (yaml: string) => void
    serverId?: string
    currentNamespace?: string
}

const PRESET_KINDS = [
    { value: 'Deployment', label: 'Deployment (无状态工作负载)' },
    { value: 'StatefulSet', label: 'StatefulSet (有状态工作负载)' },
    { value: 'DaemonSet', label: 'DaemonSet (守护进程集)' },
    { value: 'Job', label: 'Job (单次任务)' },
    { value: 'CronJob', label: 'CronJob (定时任务)' },
    { value: 'Service', label: 'Service (网络服务暴露)' },
    { value: 'Ingress', label: 'Ingress (应用层路由网关)' },
    { value: 'ConfigMap', label: 'ConfigMap (配置字典)' },
    { value: 'Secret', label: 'Secret (加密凭据)' },
    { value: 'PersistentVolumeClaim', label: 'PersistentVolumeClaim (PVC 存储卷申请)' },
    { value: 'HorizontalPodAutoscaler', label: 'HorizontalPodAutoscaler (HPA 自动扩缩容)' },
    { value: 'ServiceAccount', label: 'ServiceAccount (服务账户)' },
    { value: 'NetworkPolicy', label: 'NetworkPolicy (网络访问策略)' },
]

const PRESET_IMAGES = [
    { value: 'nginx:alpine', label: 'nginx:alpine (Web 服务器)' },
    { value: 'redis:7-alpine', label: 'redis:7-alpine (键值缓存)' },
    { value: 'mysql:8.0', label: 'mysql:8.0 (MySQL 数据库)' },
    { value: 'postgres:16-alpine', label: 'postgres:16-alpine (PostgreSQL 数据库)' },
    { value: 'node:20-alpine', label: 'node:20-alpine (Node.js 运行时)' },
    { value: 'openjdk:17-alpine', label: 'openjdk:17-alpine (Java 运行时)' },
    { value: 'python:3.11-alpine', label: 'python:3.11-alpine (Python 运行时)' },
    { value: 'busybox:latest', label: 'busybox:latest (基础工具镜像)' },
]

export default function K8sYamlGenerateModal({
    open,
    onClose,
    onGenerated,
    serverId,
    currentNamespace = 'default',
}: Props) {
    const [namespace, setNamespace] = useState(currentNamespace || 'default')
    const [nsList, setNsList] = useState<string[]>([])
    const [selectedKinds, setSelectedKinds] = useState<string[]>(['Deployment', 'Service'])
    const [selectedImages, setSelectedImages] = useState<string[]>([])
    const [prompt, setPrompt] = useState('')
    const [loading, setLoading] = useState(false)

    // 加载当前集群已有的命名空间列表
    useEffect(() => {
        if (!open) return
        setNamespace(currentNamespace || 'default')

        if (serverId) {
            API.k8sListNamespaces(serverId)
                .then((list) => {
                    if (Array.isArray(list) && list.length > 0) {
                        const names = list.map((item: any) => (typeof item === 'string' ? item : item.name || 'default'))
                        setNsList(Array.from(new Set(names)))
                    }
                })
                .catch(() => {
                    setNsList(['default', 'kube-system', 'kube-public'])
                })
        }
    }, [open, serverId, currentNamespace])

    const handleGenerate = async () => {
        if (selectedKinds.length === 0) {
            message.warning('请至少选择一个资源类型 (Kind)')
            return
        }

        setLoading(true)
        try {
            const targetNs = namespace.trim() || 'default'
            const resultYaml = await API.k8sGenerateYAML(targetNs, selectedKinds, selectedImages, prompt)
            if (!resultYaml || !resultYaml.trim()) {
                throw new Error('未获取到生成的 YAML 内容')
            }
            onGenerated(resultYaml)
            message.success('YAML 已成功生成并载入编辑器')
            onClose()
        } catch (err: any) {
            message.error(`生成 YAML 失败: ${err.message || String(err)}`)
        } finally {
            setLoading(false)
        }
    }

    const namespaceOptions = Array.from(new Set([...nsList, namespace, 'default', 'kube-system'])).map((ns) => ({
        label: ns,
        value: ns,
    }))

    return (
        <Modal
            open={open}
            title={
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Sparkles size={17} color="var(--accent)" />
                    <span style={{ fontWeight: 600 }}>AI 智能生成 Kubernetes YAML</span>
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
                    {loading ? '正在生成 YAML...' : '开始生成'}
                </Button>,
            ]}
            destroyOnHidden
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 15, padding: '10px 0 4px' }}>
                <div>
                    <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 6, color: 'var(--text)' }}>
                        目标命名空间 (Namespace) <span style={{ color: 'var(--danger)' }}>*</span>
                    </div>
                    <Select
                        showSearch
                        style={{ width: '100%' }}
                        placeholder="选择或输入目标命名空间..."
                        value={namespace}
                        onChange={setNamespace}
                        options={namespaceOptions}
                    />
                    <div style={{ fontSize: 11.5, color: 'var(--text-dim)', marginTop: 4 }}>
                        Agent 将在生成的所有命名空间级资源中自动配置 <code>metadata.namespace: {namespace || 'default'}</code>。
                    </div>
                </div>

                <div>
                    <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 6, color: 'var(--text)' }}>
                        资源类型 (Kinds) <span style={{ color: 'var(--danger)' }}>*</span>
                    </div>
                    <Select
                        mode="tags"
                        style={{ width: '100%' }}
                        placeholder="请选择或输入要生成的 K8s 资源类型..."
                        value={selectedKinds}
                        onChange={setSelectedKinds}
                        options={PRESET_KINDS}
                        maxTagCount="responsive"
                    />
                    <div style={{ fontSize: 11.5, color: 'var(--text-dim)', marginTop: 4 }}>
                        支持同时选择多个关联资源，Agent 将生成包含 <code>---</code> 分隔的多资源协同配置。
                    </div>
                </div>

                <div>
                    <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 6, color: 'var(--text)' }}>
                        容器镜像 (Images) <span style={{ fontSize: 11.5, color: 'var(--text-dim)', fontWeight: 'normal' }}>(可选，支持输入多个)</span>
                    </div>
                    <Select
                        mode="tags"
                        style={{ width: '100%' }}
                        placeholder="输入镜像名称按回车添加，如 nginx:alpine、my-app:v1.0.0 等..."
                        value={selectedImages}
                        onChange={setSelectedImages}
                        options={PRESET_IMAGES}
                        maxTagCount="responsive"
                    />
                    <div style={{ fontSize: 11.5, color: 'var(--text-dim)', marginTop: 4 }}>
                        若指定多个镜像，Agent 将自动组织为多容器 Pod 或业务主容器 + Sidecar 辅助容器协同架构。
                    </div>
                </div>

                <div>
                    <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 6, color: 'var(--text)' }}>
                        业务需求与具体参数要求 <span style={{ fontSize: 11.5, color: 'var(--text-dim)', fontWeight: 'normal' }}>(可选)</span>
                    </div>
                    <Input.TextArea
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        placeholder="例如: 部署 3 副本 Nginx 服务，暴露 80 端口；挂载静态资源 PVC；配置域名为 app.example.com 的 Ingress 路由规则，并添加探针检查。"
                        rows={3}
                        style={{
                            fontSize: 12.5,
                            lineHeight: 1.5,
                            background: 'var(--bg-2)',
                            color: 'var(--text)',
                        }}
                    />
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
                        专职 YAML Agent 会根据选定的命名空间、Kind 资源类型与镜像自动补齐 <code>apiVersion</code>、<code>metadata</code>、标签选择器与健康探针等生产级最佳实践配置。生成后将自动填入编辑器中。
                    </div>
                </div>
            </div>
        </Modal>
    )
}
