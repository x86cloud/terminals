import { useState, useEffect } from 'react'
import { Modal, Space, Button, Tag, App } from 'antd'
import {
    Code,
    Copy,
    Save,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
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
    const { t } = useTranslation(['k8s', 'common'])
    const { message } = App.useApp()
    const [content, setContent] = useState(initialYaml)
    const [loading, setLoading] = useState(false)
    const [saving, setSaving] = useState(false)

    // 当弹窗打开时，若没有传入 initialYaml 且指定了 name，则主动从集群拉取实时 YAML
    useEffect(() => {
        if (!open) return
        let mounted = true

        if (initialYaml) {
            setContent(initialYaml)
            return
        }

        if (mode !== 'create' && kind && name) {
            setLoading(true)
            API.k8sGetResourceYAML(serverId, kind, namespace, name)
                .then((yamlStr) => {
                    if (!mounted) return
                    setContent(yamlStr || '')
                })
                .catch((err: any) => {
                    if (!mounted) return
                    message.error(t('k8s:yamlModal.fetchFail', { error: err.message || String(err) }))
                    setContent('')
                })
                .finally(() => {
                    if (mounted) {
                        setLoading(false)
                    }
                })
        } else {
            setContent(initialYaml || '')
        }

        return () => {
            mounted = false
        }
    }, [open, serverId, kind, namespace, name, initialYaml, mode])

    const handleSaveAndApply = async () => {
        if (!content.trim()) {
            message.warning(t('k8s:yamlModal.emptyYaml'))
            return
        }

        setSaving(true)
        try {
            const results = await API.k8sApplyYAML(serverId, content)
            if (!results || results.length === 0) {
                throw new Error(t('k8s:yamlModal.invalidResource'))
            }

            const failures = results.filter((r) => r.action === 'failed')
            const successes = results.filter((r) => r.action !== 'failed')

            if (failures.length === 0) {
                const summary = successes
                    .map((r) => `${r.kind}/${r.name} (${r.action === 'created' ? t('k8s:yamlModal.actionCreated') : t('k8s:yamlModal.actionUpdated')})`)
                    .join('、')
                message.success(t('k8s:yamlModal.applySuccess', { summary }), 4)
                onSuccess?.()
                onClose()
            } else if (successes.length === 0) {
                const detail = failures.map((r) => `${r.kind}/${r.name || t('common.unknown')}: ${r.message}`).join('; ')
                message.error(t('k8s:yamlModal.applyFail', { detail }), 5)
            } else {
                const succSummary = successes.map((r) => `${r.kind}/${r.name}`).join('、')
                const failSummary = failures.map((r) => `${r.kind}/${r.name}: ${r.message}`).join('; ')
                message.warning(t('k8s:yamlModal.applyPartial', { succCount: successes.length, failCount: failures.length, succSummary, failSummary }), 6)
                onSuccess?.()
                onClose()
            }
        } catch (err: any) {
            message.error(t('k8s:yamlModal.saveApplyError', { error: err.message || String(err) }), 5)
        } finally {
            setSaving(false)
        }
    }

    const defaultTitle = mode === 'create'
        ? t('k8s:yamlModal.titleCreate', { kind })
        : mode === 'edit'
        ? t('k8s:yamlModal.titleEdit', { kind, name: name || 'YAML' })
        : t('k8s:yamlModal.titleView', { kind })

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
                            {mode === 'create' ? t('k8s:yamlModal.modeCreate') : mode === 'edit' ? t('k8s:yamlModal.modeEdit') : t('k8s:yamlModal.modeView')}
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
                        message.success(t('k8s:yamlModal.copiedYaml'))
                    }}
                >
                    {t('k8s:yamlModal.copyYaml')}
                </Button>,
                <Button key="cancel" onClick={onClose} disabled={saving}>
                    {t('common.close')}
                </Button>,
                mode !== 'view' && (
                    <Button
                        key="save"
                        type="primary"
                        icon={<Save size={13} />}
                        loading={saving}
                        onClick={handleSaveAndApply}
                    >
                        {mode === 'create' ? t('k8s:yamlModal.createNow') : t('k8s:yamlModal.saveApplyCluster')}
                    </Button>
                ),
            ]}
            destroyOnHidden
        >
            <div style={{ padding: '8px 0 0' }}>
                {loading ? (
                    <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--text-dim)' }}>
                        {t('k8s:yamlModal.loadingYaml')}
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
