import { useState, useEffect, useMemo } from 'react'
import { Modal, Button, Select, Input, App } from 'antd'
import { Sparkles, Wand2, Lightbulb } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { API } from '@/api'

interface Props {
    open: boolean
    onClose: () => void
    onGenerated: (yaml: string) => void
    serverId?: string
    currentNamespace?: string
}

export default function K8sYamlGenerateModal({
    open,
    onClose,
    onGenerated,
    serverId,
    currentNamespace = 'default',
}: Props) {
    const { t } = useTranslation(['k8s', 'common'])
    const { message } = App.useApp()
    const [namespace, setNamespace] = useState(currentNamespace || 'default')
    const [nsList, setNsList] = useState<string[]>([])
    const [selectedKinds, setSelectedKinds] = useState<string[]>(['Deployment', 'Service'])
    const [selectedImages, setSelectedImages] = useState<string[]>([])
    const [prompt, setPrompt] = useState('')
    const [loading, setLoading] = useState(false)

    const presetKinds = useMemo(() => [
        { value: 'Deployment', label: `Deployment (${t('k8s:aiModal.kindDescDeployment')})` },
        { value: 'StatefulSet', label: `StatefulSet (${t('k8s:aiModal.kindDescStatefulSet')})` },
        { value: 'DaemonSet', label: `DaemonSet (${t('k8s:aiModal.kindDescDaemonSet')})` },
        { value: 'Job', label: `Job (${t('k8s:aiModal.kindDescJob')})` },
        { value: 'CronJob', label: `CronJob (${t('k8s:aiModal.kindDescCronJob')})` },
        { value: 'Service', label: `Service (${t('k8s:aiModal.kindDescService')})` },
        { value: 'Ingress', label: `Ingress (${t('k8s:aiModal.kindDescIngress')})` },
        { value: 'ConfigMap', label: `ConfigMap (${t('k8s:aiModal.kindDescConfigMap')})` },
        { value: 'Secret', label: `Secret (${t('k8s:aiModal.kindDescSecret')})` },
        { value: 'PersistentVolumeClaim', label: `PersistentVolumeClaim (${t('k8s:aiModal.kindDescPvc')})` },
        { value: 'HorizontalPodAutoscaler', label: `HorizontalPodAutoscaler (${t('k8s:aiModal.kindDescHpa')})` },
        { value: 'ServiceAccount', label: `ServiceAccount (${t('k8s:aiModal.kindDescSa')})` },
        { value: 'NetworkPolicy', label: `NetworkPolicy (${t('k8s:aiModal.kindDescNetPol')})` },
    ], [t])

    const presetImages = useMemo(() => [
        { value: 'nginx:alpine', label: `nginx:alpine (${t('k8s:aiModal.imageDescNginx')})` },
        { value: 'redis:7-alpine', label: `redis:7-alpine (${t('k8s:aiModal.imageDescRedis')})` },
        { value: 'mysql:8.0', label: `mysql:8.0 (${t('k8s:aiModal.imageDescMysql')})` },
        { value: 'postgres:16-alpine', label: `postgres:16-alpine (${t('k8s:aiModal.imageDescPg')})` },
        { value: 'node:20-alpine', label: `node:20-alpine (${t('k8s:aiModal.imageDescNode')})` },
        { value: 'openjdk:17-alpine', label: `openjdk:17-alpine (${t('k8s:aiModal.imageDescJava')})` },
        { value: 'python:3.11-alpine', label: `python:3.11-alpine (${t('k8s:aiModal.imageDescPython')})` },
        { value: 'busybox:latest', label: `busybox:latest (${t('k8s:aiModal.imageDescBusybox')})` },
    ], [t])

    // 加载当前集群已有的命名空间列表
    useEffect(() => {
        if (!open) return
        let mounted = true
        setNamespace(currentNamespace || 'default')

        if (serverId) {
            API.k8sListNamespaces(serverId)
                .then((list) => {
                    if (!mounted) return
                    if (Array.isArray(list) && list.length > 0) {
                        const names = list.map((item: any) => (typeof item === 'string' ? item : item.name || 'default'))
                        setNsList(Array.from(new Set(names)))
                    }
                })
                .catch(() => {
                    if (!mounted) return
                    setNsList(['default', 'kube-system', 'kube-public'])
                })
        }

        return () => {
            mounted = false
        }
    }, [open, serverId, currentNamespace])

    const handleGenerate = async () => {
        if (selectedKinds.length === 0) {
            message.warning(t('k8s:aiModal.reqKindValidation'))
            return
        }

        setLoading(true)
        try {
            const targetNs = namespace.trim() || 'default'
            const resultYaml = await API.k8sGenerateYAML(targetNs, selectedKinds, selectedImages, prompt)
            if (!resultYaml || !resultYaml.trim()) {
                throw new Error(t('k8s:aiModal.emptyYamlOutput'))
            }
            onGenerated(resultYaml)
            onClose()
        } catch (err: any) {
            message.error(t('k8s:aiModal.generateFail', { error: err.message || String(err) }))
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
                    <span style={{ fontWeight: 600 }}>{t('k8s:aiModal.title')}</span>
                </div>
            }
            width={660}
            onCancel={() => !loading && onClose()}
            footer={[
                <Button key="cancel" onClick={onClose} disabled={loading}>
                    {t('common.cancel')}
                </Button>,
                <Button
                    key="submit"
                    type="primary"
                    icon={<Wand2 size={13} />}
                    loading={loading}
                    onClick={handleGenerate}
                >
                    {loading ? t('k8s:aiModal.generatingYaml') : t('k8s:aiModal.startGenerate')}
                </Button>,
            ]}
            destroyOnHidden
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 15, padding: '10px 0 4px' }}>
                <div>
                    <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 6, color: 'var(--text)' }}>
                        {t('k8s:aiModal.targetNamespace')} <span style={{ color: 'var(--danger)' }}>*</span>
                    </div>
                    <Select
                        showSearch
                        style={{ width: '100%' }}
                        placeholder={t('k8s:aiModal.targetNamespacePlaceholder')}
                        value={namespace}
                        onChange={setNamespace}
                        options={namespaceOptions}
                    />
                    <div style={{ fontSize: 11.5, color: 'var(--text-dim)', marginTop: 4 }}>
                        {t('k8s:aiModal.targetNamespaceTip', { namespace: namespace || 'default' })}
                    </div>
                </div>

                <div>
                    <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 6, color: 'var(--text)' }}>
                        {t('k8s:aiModal.kindsLabel')} <span style={{ color: 'var(--danger)' }}>*</span>
                    </div>
                    <Select
                        mode="tags"
                        style={{ width: '100%' }}
                        placeholder={t('k8s:aiModal.kindsPlaceholder')}
                        value={selectedKinds}
                        onChange={setSelectedKinds}
                        options={presetKinds}
                        maxTagCount="responsive"
                    />
                    <div style={{ fontSize: 11.5, color: 'var(--text-dim)', marginTop: 4 }}>
                        {t('k8s:aiModal.kindsTip')}
                    </div>
                </div>

                <div>
                    <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 6, color: 'var(--text)' }}>
                        {t('k8s:aiModal.imagesLabelWithOpt')}
                    </div>
                    <Select
                        mode="tags"
                        style={{ width: '100%' }}
                        placeholder={t('k8s:aiModal.imagesPlaceholder')}
                        value={selectedImages}
                        onChange={setSelectedImages}
                        options={presetImages}
                        maxTagCount="responsive"
                    />
                    <div style={{ fontSize: 11.5, color: 'var(--text-dim)', marginTop: 4 }}>
                        {t('k8s:aiModal.imagesTip')}
                    </div>
                </div>

                <div>
                    <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 6, color: 'var(--text)' }}>
                        {t('k8s:aiModal.reqDetailLabel')}
                    </div>
                    <Input.TextArea
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        placeholder={t('k8s:aiModal.reqDetailPlaceholder')}
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
                        {t('k8s:aiModal.agentTip')}
                    </div>
                </div>
            </div>
        </Modal>
    )
}
