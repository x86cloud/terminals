import React, { useEffect, useState } from 'react'
import { Input, Radio, Button, Space, Select, Segmented, Switch } from 'antd'
import { FolderOpen } from 'lucide-react'
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
                <div style={{ fontSize: 13, marginBottom: 6, fontWeight: 500 }}>认证方式 (Authentication Mode)</div>
                <Segmented
                    block
                    value={form.k8sAuthMode || 'kubeconfig'}
                    onChange={(v) => update({ k8sAuthMode: v as string })}
                    options={[
                        { label: 'Kubeconfig 配置文件 (推荐)', value: 'kubeconfig' },
                        { label: '直连 API Server', value: 'direct' },
                    ]}
                />
            </div>

            {(!form.k8sAuthMode || form.k8sAuthMode === 'kubeconfig') ? (
                <Space orientation="vertical" size={12} style={{ width: '100%' }}>
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                            <div style={{ fontSize: 13, fontWeight: 500 }}>
                                Kubeconfig 内容 (YAML 文本) <span style={{ color: 'var(--danger)' }}>*</span>
                            </div>
                            <Button
                                size="small"
                                icon={<FolderOpen size={13} />}
                                onClick={handlePickKubeconfigFile}
                                style={{ fontSize: 12 }}
                            >
                                选择本地文件
                            </Button>
                        </div>
                        <Input.TextArea
                            rows={7}
                            placeholder={`# 请粘贴 ~/.kube/config 或云厂商集群导出的 YAML 配置\napiVersion: v1\nclusters:\n- cluster:\n    server: https://192.168.1.100:6443\n  name: kubernetes\ncontexts:\n- context:\n    cluster: kubernetes\n    user: admin\n  name: default\ncurrent-context: default`}
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
                            <span>已选本地文件: <code style={{ color: 'var(--accent)' }}>{form.k8sKubeconfigPath}</code></span>
                            <Button size="small" type="link" onClick={() => update({ k8sKubeconfigPath: '' })}>清除</Button>
                        </div>
                    )}

                    {kubeconfigInfo?.clusterHost && (
                        <div style={{ background: 'rgba(82, 196, 26, 0.08)', border: '1px solid rgba(82, 196, 26, 0.25)', padding: '6px 10px', borderRadius: 6, fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span>集群地址: <strong>{kubeconfigInfo.clusterHost}</strong></span>
                            {kubeconfigInfo.currentContext && <span>默认 Context: <code>{kubeconfigInfo.currentContext}</code></span>}
                        </div>
                    )}

                    {kubeconfigContexts.length > 0 && (
                        <div>
                            <div style={{ fontSize: 13, marginBottom: 4, fontWeight: 500 }}>
                                选择 Context 上下文
                            </div>
                            <Select
                                style={{ width: '100%' }}
                                value={form.k8sContext || kubeconfigInfo?.currentContext || (kubeconfigContexts.length > 0 ? kubeconfigContexts[0] : '')}
                                onChange={(v) => update({ k8sContext: v })}
                                options={kubeconfigContexts.map((c) => ({
                                    label: c === kubeconfigInfo?.currentContext ? `${c} (当前默认)` : c,
                                    value: c,
                                }))}
                            />
                        </div>
                    )}

                    <div>
                        <div style={{ fontSize: 13, marginBottom: 4, fontWeight: 500 }}>默认命名空间 (Namespace, 可选)</div>
                        <Input
                            placeholder="默认从 Kubeconfig 上下文读取或 default"
                            value={form.k8sNamespace || ''}
                            onChange={(e) => update({ k8sNamespace: e.target.value })}
                        />
                    </div>
                </Space>
            ) : (
                <Space orientation="vertical" size={12} style={{ width: '100%' }}>
                    <div>
                        <div style={{ fontSize: 13, marginBottom: 4, fontWeight: 500 }}>
                            Kubernetes API Server 地址 <span style={{ color: 'var(--danger)' }}>*</span>
                        </div>
                        <Input
                            placeholder="https://192.168.1.100:6443"
                            value={form.k8sApiServer || form.host || ''}
                            onChange={(e) => update({ k8sApiServer: e.target.value, host: e.target.value })}
                        />
                    </div>

                    <div>
                        <div style={{ fontSize: 13, marginBottom: 4, fontWeight: 500 }}>凭证类型 (Credentials)</div>
                        <Radio.Group
                            value={form.k8sAuthType || 'token'}
                            onChange={(e) => update({ k8sAuthType: e.target.value })}
                            buttonStyle="solid"
                        >
                            <Radio.Button value="token">Bearer Token</Radio.Button>
                            <Radio.Button value="cert">X.509 客户端证书</Radio.Button>
                            <Radio.Button value="none">匿名 / 无认证</Radio.Button>
                        </Radio.Group>
                    </div>

                    {(!form.k8sAuthType || form.k8sAuthType === 'token') && (
                        <div>
                            <div style={{ fontSize: 13, marginBottom: 4, fontWeight: 500 }}>Bearer Token</div>
                            <Input.Password
                                placeholder="请输入 ServiceAccount Token 或 Bearer Token"
                                value={form.k8sBearerToken || form.password || ''}
                                onChange={(e) => update({ k8sBearerToken: e.target.value, password: e.target.value })}
                            />
                        </div>
                    )}

                    {form.k8sAuthType === 'cert' && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                            <div>
                                <div style={{ fontSize: 12, marginBottom: 4, fontWeight: 500 }}>客户端公钥证书 (client.crt)</div>
                                <Space.Compact style={{ width: '100%' }}>
                                    <Input
                                        placeholder="选择 client.crt 或粘贴"
                                        value={form.k8sCertData || ''}
                                        onChange={(e) => update({ k8sCertData: e.target.value })}
                                    />
                                    <Button onClick={() => handlePickCert('k8sCertData')}>选择</Button>
                                </Space.Compact>
                            </div>
                            <div>
                                <div style={{ fontSize: 12, marginBottom: 4, fontWeight: 500 }}>客户端私钥 (client.key)</div>
                                <Space.Compact style={{ width: '100%' }}>
                                    <Input
                                        placeholder="选择 client.key 或粘贴"
                                        value={form.k8sKeyData || ''}
                                        onChange={(e) => update({ k8sKeyData: e.target.value })}
                                    />
                                    <Button onClick={() => handlePickCert('k8sKeyData')}>选择</Button>
                                </Space.Compact>
                            </div>
                        </div>
                    )}

                    <div>
                        <div style={{ fontSize: 13, marginBottom: 4, fontWeight: 500 }}>CA 证书 (ca.crt, 可选)</div>
                        <Space.Compact style={{ width: '100%' }}>
                            <Input
                                placeholder="选择 ca.crt 文件或粘贴 PEM 内容"
                                value={form.k8sCaData || ''}
                                onChange={(e) => update({ k8sCaData: e.target.value })}
                            />
                            <Button onClick={() => handlePickCert('k8sCaData')}>选择证书</Button>
                        </Space.Compact>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Switch
                            size="small"
                            checked={!!form.k8sInsecureSkipTLS}
                            onChange={(checked) => update({ k8sInsecureSkipTLS: checked })}
                        />
                        <span style={{ fontSize: 12 }}>跳过 TLS 服务端证书校验 (Insecure Skip Verify)</span>
                    </div>

                    <div>
                        <div style={{ fontSize: 13, marginBottom: 4, fontWeight: 500 }}>默认命名空间 (Namespace, 可选)</div>
                        <Input
                            placeholder="默认 default"
                            value={form.k8sNamespace || ''}
                            onChange={(e) => update({ k8sNamespace: e.target.value })}
                        />
                    </div>
                </Space>
            )}
        </Space>
    )
}
