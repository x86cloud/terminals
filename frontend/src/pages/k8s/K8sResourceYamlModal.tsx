import React, { useState, useEffect } from 'react'
import { Modal, Space, Button, message, Tag } from 'antd'
import {
    Code,
    Copy,
    Save,
    RotateCcw,
    X,
    CheckCircle,
} from 'lucide-react'
import CodeEditor from '@/components/CodeEditor'
import { API } from '@/api'

interface Props {
    open: boolean
    onClose: () => void
    serverId: string
    title?: string
    kind?: string
    namespace?: string
    name?: string
    initialYaml?: string
    mode?: 'view' | 'edit' | 'create'
    onSuccess?: () => void
}

export default function K8sResourceYamlModal({
    open,
    onClose,
    serverId,
    title,
    kind = 'Resource',
    namespace = 'default',
    name = '',
    initialYaml = '',
    mode = 'edit',
    onSuccess,
}: Props) {
    const [content, setContent] = useState(initialYaml)
    const [loading, setLoading] = useState(false)
    const [saving, setSaving] = useState(false)

    // 当弹窗打开时，若没有传入 initialYaml 且指定了 name，则主动从集群拉取实时 YAML
    useEffect(() => {
        if (!open) return

        if (initialYaml) {
            setContent(initialYaml)
            return
        }

        if (mode !== 'create' && kind && name) {
            setLoading(true)
            API.k8sGetResourceYAML(serverId, kind, namespace, name)
                .then((yamlStr) => {
                    setContent(yamlStr || '')
                })
                .catch((err: any) => {
                    message.error(`获取 YAML 失败: ${err.message || String(err)}`)
                    setContent('')
                })
                .finally(() => {
                    setLoading(false)
                })
        } else {
            setContent(initialYaml || '')
        }
    }, [open, serverId, kind, namespace, name, initialYaml, mode])

    const handleSaveAndApply = async () => {
        if (!content.trim()) {
            message.warning('YAML 内容不能为空')
            return
        }

        setSaving(true)
        try {
            const results = await API.k8sApplyYAML(serverId, content)
            if (!results || results.length === 0) {
                throw new Error('未识别到有效的 Kubernetes 资源')
            }

            const failures = results.filter((r) => r.action === 'failed')
            const successes = results.filter((r) => r.action !== 'failed')

            if (failures.length === 0) {
                const summary = successes
                    .map((r) => `${r.kind}/${r.name} (${r.action === 'created' ? '已创建' : '已更新'})`)
                    .join('、')
                message.success(`应用成功: ${summary}`, 4)
                onSuccess?.()
                onClose()
            } else if (successes.length === 0) {
                const detail = failures.map((r) => `${r.kind}/${r.name || '未知'}: ${r.message}`).join('; ')
                message.error(`应用失败: ${detail}`, 5)
            } else {
                const succSummary = successes.map((r) => `${r.kind}/${r.name}`).join('、')
                const failSummary = failures.map((r) => `${r.kind}/${r.name}: ${r.message}`).join('; ')
                message.warning(`部分成功 (${successes.length} 成功, ${failures.length} 失败)。成功: ${succSummary}；失败: ${failSummary}`, 6)
                onSuccess?.()
                onClose()
            }
        } catch (err: any) {
            message.error(`保存并应用异常: ${err.message || String(err)}`, 5)
        } finally {
            setSaving(false)
        }
    }

    const defaultTitle = mode === 'create'
        ? `新建 ${kind} 资源`
        : mode === 'edit'
        ? `编辑 ${kind}: ${name || 'YAML'}`
        : `${kind} YAML 配置`

    return (
        <Modal
            open={open}
            title={
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: 8 }}>
                    <Space size={8}>
                        <Code size={16} color="var(--accent)" />
                        <span style={{ fontWeight: 600 }}>{title || defaultTitle}</span>
                        {namespace && namespace !== '_all' && (
                            <Tag color="cyan" style={{ fontFamily: 'var(--font-mono)' }}>
                                Namespace: {namespace}
                            </Tag>
                        )}
                        <Tag color={mode === 'create' ? 'green' : 'blue'}>
                            {mode === 'create' ? '新建模式' : mode === 'edit' ? '在线编辑' : '只读预览'}
                        </Tag>
                    </Space>
                </div>
            }
            width={820}
            onCancel={onClose}
            footer={[
                <Button
                    key="copy"
                    icon={<Copy size={13} />}
                    onClick={() => {
                        if (!content) return
                        navigator.clipboard.writeText(content)
                        message.success('YAML 已复制到剪贴板')
                    }}
                >
                    复制 YAML
                </Button>,
                <Button key="cancel" onClick={onClose} disabled={saving}>
                    关闭
                </Button>,
                mode !== 'view' && (
                    <Button
                        key="save"
                        type="primary"
                        icon={<Save size={13} />}
                        loading={saving}
                        onClick={handleSaveAndApply}
                    >
                        {mode === 'create' ? '立即创建' : '保存并应用到集群'}
                    </Button>
                ),
            ]}
            destroyOnHidden
        >
            <div style={{ padding: '8px 0 0' }}>
                {loading ? (
                    <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--text-dim)' }}>
                        正在加载集群 YAML 配置...
                    </div>
                ) : (
                    <CodeEditor
                        value={content}
                        onChange={setContent}
                        lang="yaml"
                        height="520px"
                        minHeight="520px"
                        readOnly={mode === 'view'}
                        bordered
                    />
                )}
            </div>
        </Modal>
    )
}
