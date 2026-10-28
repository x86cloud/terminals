import React, { useEffect, useState } from 'react'
import { Input, Radio, Button, Space, Select, Segmented, Switch } from 'antd'
import { FolderOpen } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { API } from '@/api'
import { errorMessage } from '@/utils'
import { ServerConfig } from '@/types'
import { BasicFields } from './BasicFields'
import { ServerFormProps } from './types'

export const K8sForm: React.FC<ServerFormProps> = ({
    form,
    update,
    groups,
    setError,
}) => {
    const { t } = useTranslation(['server', 'common'])
    const [kubeconfigContexts, setKubeconfigContexts] = useState<string[]>([])
    const [kubeconfigInfo, setKubeconfigInfo] = useState<{ currentContext?: string; clusterHost?: string } | null>(null)

    const handleParseKubeconfig = async (data?: string, path?: string) => {
        const rawData = data !== undefined ? data : form.k8sKubeconfigData || ''
        const filePath = path !== undefined ? path : form.k8sKubeconfigPath || ''
        if (!rawData.trim() && !filePath.trim()) {
            setKubeconfigContexts([])
            setKubeconfigInfo(null)
            return
        }
        try {
            const info = await API.k8sParseKubeconfig(rawData, filePath)
            if (info) {
                setKubeconfigContexts(info.contexts || [])
                setKubeconfigInfo({ currentContext: info.currentContext, clusterHost: info.clusterHost })
                if (info.clusterHost && !form.host) {
                    update({ host: info.clusterHost })
                }
                if (info.currentContext && !form.k8sContext) {
                    update({ k8sContext: info.currentContext })
                }
            }
        } catch {
            setKubeconfigContexts([])
            setKubeconfigInfo(null)
        }
    }

    useEffect(() => {
        if (form.k8sKubeconfigData || form.k8sKubeconfigPath) {
            void handleParseKubeconfig(form.k8sKubeconfigData, form.k8sKubeconfigPath)
        }
    }, [])

    const handlePickKubeconfigFile = async () => {
        try {
            const path = await API.selectCertFile()
            if (path) {
                update({ k8sKubeconfigPath: path })
                await handleParseKubeconfig(undefined, path)
            }
        } catch (err) {
            const msg = errorMessage(err)
            if (msg) setError(msg)
        }
    }

    const handlePickCert = async (field: keyof ServerConfig) => {
        try {
            const path = await API.selectCertFile()
            if (path) {
                update({ [field]: path })
            }
        } catch (err) {
            const msg = errorMessage(err)
            if (msg) setError(msg)
        }
    }

    return (
        <Space orientation="vertical" size={12} style={{ width: '100%' }}>
            <BasicFields form={form} update={update} groups={groups} />

            <div>
                <div style={{ fontSize: 13, marginBottom: 6, fontWeight: 500 }}>{t('server:k8s.authMode')}</div>
                <Segmented
                    block
                    value={form.k8sAuthMode || 'kubeconfig'}
                    onChange={(v) => update({ k8sAuthMode: v as string })}
                    options={[
                        { label: t('server:k8s.kubeconfig'), value: 'kubeconfig' },
                        { label: t('server:k8s.direct'), value: 'direct' },
                    ]}
                />
            </div>

            {(!form.k8sAuthMode || form.k8sAuthMode === 'kubeconfig') ? (
                <Space orientation="vertical" size={12} style={{ width: '100%' }}>
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                            <div style={{ fontSize: 13, fontWeight: 500 }}>
                                {t('server:k8s.kubeconfigData')} <span style={{ color: 'var(--danger)' }}>*</span>
                            </div>
                            <Button
                                size="small"
                                icon={<FolderOpen size={13} />}
                                onClick={handlePickKubeconfigFile}
                                style={{ fontSize: 12 }}
                            >
                                {t('server:k8s.selectLocalFile')}
                            </Button>
                        </div>
                        <Input.TextArea
                            rows={7}
                            placeholder={t('server:k8s.kubeconfigPlaceholder')}
                            value={form.k8sKubeconfigData || ''}
                            onChange={(e) => {
                                const text = e.target.value
                                update({ k8sKubeconfigData: text })
                                void handleParseKubeconfig(text, undefined)
                            }}
                            style={{ fontFamily: 'monospace', fontSize: 12 }}
                        />
                    </div>

                    {form.k8sKubeconfigPath && (
                        <div style={{ background: 'var(--bg-2)', padding: '6px 10px', borderRadius: 6, fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span>{t('server:k8s.selectedFile')}: <code style={{ color: 'var(--accent)' }}>{form.k8sKubeconfigPath}</code></span>
                            <Button size="small" type="link" onClick={() => update({ k8sKubeconfigPath: '' })}>{t('server:clear')}</Button>
                        </div>
                    )}

                    {kubeconfigInfo?.clusterHost && (
                        <div style={{ background: 'rgba(82, 196, 26, 0.08)', border: '1px solid rgba(82, 196, 26, 0.25)', padding: '6px 10px', borderRadius: 6, fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span>{t('server:k8s.clusterAddress')} <strong>{kubeconfigInfo.clusterHost}</strong></span>
                            {kubeconfigInfo.currentContext && <span>{t('server:k8s.defaultContext')} <code>{kubeconfigInfo.currentContext}</code></span>}
                        </div>
                    )}

                    {kubeconfigContexts.length > 0 && (
                        <div>
                            <div style={{ fontSize: 13, marginBottom: 4, fontWeight: 500 }}>
                                {t('server:k8s.selectContext')}
                            </div>
                            <Select
                                style={{ width: '100%' }}
                                value={form.k8sContext || kubeconfigInfo?.currentContext || (kubeconfigContexts.length > 0 ? kubeconfigContexts[0] : '')}
                                onChange={(v) => update({ k8sContext: v })}
                                options={kubeconfigContexts.map((c) => ({
                                    label: c === kubeconfigInfo?.currentContext ? `${c} (${t('server:k8s.currentDefault')})` : c,
                                    value: c,
                                }))}
                            />
                        </div>
                    )}

                    <div>
                        <div style={{ fontSize: 13, marginBottom: 4, fontWeight: 500 }}>{t('server:k8s.namespace')}</div>
                        <Input
                            placeholder={t('server:k8s.namespacePlaceholder')}
                            value={form.k8sNamespace || ''}
                            onChange={(e) => update({ k8sNamespace: e.target.value })}
                        />
                    </div>
                </Space>
            ) : (
                <Space orientation="vertical" size={12} style={{ width: '100%' }}>
                    <div>
                        <div style={{ fontSize: 13, marginBottom: 4, fontWeight: 500 }}>
                            Kubernetes API Server <span style={{ color: 'var(--danger)' }}>*</span>
                        </div>
                        <Input
                            placeholder="https://192.168.1.100:6443"
                            value={form.k8sApiServer || form.host || ''}
                            onChange={(e) => update({ k8sApiServer: e.target.value, host: e.target.value })}
                        />
                    </div>

                    <div>
                        <div style={{ fontSize: 13, marginBottom: 4, fontWeight: 500 }}>{t('server:authType')}</div>
                        <Radio.Group
                            value={form.k8sAuthType || 'token'}
                            onChange={(e) => update({ k8sAuthType: e.target.value })}
                            buttonStyle="solid"
                        >
                            <Radio.Button value="token">Bearer Token</Radio.Button>
                            <Radio.Button value="cert">X.509 Client Cert</Radio.Button>
                            <Radio.Button value="none">Anonymous</Radio.Button>
                        </Radio.Group>
                    </div>

                    {(!form.k8sAuthType || form.k8sAuthType === 'token') && (
                        <div>
                            <div style={{ fontSize: 13, marginBottom: 4, fontWeight: 500 }}>Bearer Token</div>
                            <Input.Password
                                placeholder={t('server:k8s.bearerTokenPlaceholder')}
                                value={form.k8sBearerToken || form.password || ''}
                                onChange={(e) => update({ k8sBearerToken: e.target.value, password: e.target.value })}
                            />
                        </div>
                    )}

                    {form.k8sAuthType === 'cert' && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                            <div>
                                <div style={{ fontSize: 12, marginBottom: 4, fontWeight: 500 }}>client.crt</div>
                                <Space.Compact style={{ width: '100%' }}>
                                    <Input
                                        placeholder="client.crt"
                                        value={form.k8sCertData || ''}
                                        onChange={(e) => update({ k8sCertData: e.target.value })}
                                    />
                                    <Button onClick={() => handlePickCert('k8sCertData')}>{t('server:browse')}</Button>
                                </Space.Compact>
                            </div>
                            <div>
                                <div style={{ fontSize: 12, marginBottom: 4, fontWeight: 500 }}>client.key</div>
                                <Space.Compact style={{ width: '100%' }}>
                                    <Input
                                        placeholder="client.key"
                                        value={form.k8sKeyData || ''}
                                        onChange={(e) => update({ k8sKeyData: e.target.value })}
                                    />
                                    <Button onClick={() => handlePickCert('k8sKeyData')}>{t('server:browse')}</Button>
                                </Space.Compact>
                            </div>
                        </div>
                    )}

                    <div>
                        <div style={{ fontSize: 13, marginBottom: 4, fontWeight: 500 }}>CA (ca.crt)</div>
                        <Space.Compact style={{ width: '100%' }}>
                            <Input
                                placeholder="ca.crt"
                                value={form.k8sCaData || ''}
                                onChange={(e) => update({ k8sCaData: e.target.value })}
                            />
                            <Button onClick={() => handlePickCert('k8sCaData')}>{t('server:browse')}</Button>
                        </Space.Compact>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Switch
                            size="small"
                            checked={!!form.k8sInsecureSkipTLS}
                            onChange={(checked) => update({ k8sInsecureSkipTLS: checked })}
                        />
                        <span style={{ fontSize: 12 }}>{t('server:k8s.insecure')}</span>
                    </div>

                    <div>
                        <div style={{ fontSize: 13, marginBottom: 4, fontWeight: 500 }}>{t('server:k8s.namespace')}</div>
                        <Input
                            placeholder="default"
                            value={form.k8sNamespace || ''}
                            onChange={(e) => update({ k8sNamespace: e.target.value })}
                        />
                    </div>
                </Space>
            )}
        </Space>
    )
}
