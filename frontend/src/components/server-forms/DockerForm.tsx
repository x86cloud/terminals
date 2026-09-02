import React from 'react'
import { Input, InputNumber, Radio, Button, Space, Switch } from 'antd'
import { Key } from 'lucide-react'
import { API } from '@/api'
import { errorMessage } from '@/utils'
import { ServerConfig } from '@/types'
import { BasicFields } from './BasicFields'
import { ServerFormProps } from './types'

export const DockerForm: React.FC<ServerFormProps> = ({
    form,
    update,
    groups,
    setError,
}) => {
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
        <Space orientation="vertical" size={14} style={{ width: '100%' }}>
            <BasicFields form={form} update={update} groups={groups} />

            <div>
                <div style={{ fontSize: 13, marginBottom: 6, fontWeight: 500 }}>连接通信方式</div>
                <Radio.Group
                    value={form.dockerEndpointType || 'unix'}
                    onChange={(e) => {
                        const ep = e.target.value
                        update({
                            dockerEndpointType: ep,
                            port: ep === 'tcp' ? (form.dockerTlsEnabled ? 2376 : 2375) : 0,
                        })
                    }}
                    buttonStyle="solid"
                >
                    <Radio.Button value="unix">Unix Socket</Radio.Button>
                    <Radio.Button value="tcp">TCP/HTTP</Radio.Button>
                    <Radio.Button value="ssh">SSH</Radio.Button>
                </Radio.Group>
            </div>

            {(!form.dockerEndpointType || form.dockerEndpointType === 'unix') && (
                <div>
                    <div style={{ fontSize: 13, marginBottom: 4, fontWeight: 500 }}>Docker Socket 路径</div>
                    <Input
                        placeholder="/var/run/docker.sock 或 //./pipe/docker_engine"
                        value={form.dockerSocketPath || ''}
                        onChange={(e) => update({ dockerSocketPath: e.target.value })}
                    />
                    <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>快捷预设:</span>
                        <Button size="small" onClick={() => update({ dockerSocketPath: '/var/run/docker.sock' })}>
                            Linux/macOS (Unix Socket)
                        </Button>
                        <Button size="small" onClick={() => update({ dockerSocketPath: '//./pipe/docker_engine' })}>
                            Windows(Pipe)
                        </Button>
                        <Button size="small" onClick={() => update({ dockerSocketPath: '/run/user/1000/docker.sock' })}>
                            Rootless Socket
                        </Button>
                    </div>
                </div>
            )}

            {form.dockerEndpointType === 'tcp' && (
                <Space orientation="vertical" size={10} style={{ width: '100%' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '3fr 1fr', gap: 12 }}>
                        <div>
                            <div style={{ fontSize: 13, marginBottom: 4, fontWeight: 500 }}>Docker 守护进程地址 (Host)</div>
                            <Input
                                placeholder="127.0.0.1 / 192.168.1.100"
                                value={form.host}
                                onChange={(e) => update({ host: e.target.value })}
                            />
                        </div>
                        <div>
                            <div style={{ fontSize: 13, marginBottom: 4, fontWeight: 500 }}>端口 (Port)</div>
                            <InputNumber
                                min={1}
                                max={65535}
                                style={{ width: '100%' }}
                                value={form.port || (form.dockerTlsEnabled ? 2376 : 2375)}
                                onChange={(val) => update({ port: val || 2375 })}
                            />
                        </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--bg-1)', borderRadius: 6 }}>
                        <div>
                            <div style={{ fontSize: 13, fontWeight: 500 }}>启用 TLS 加密认证 (HTTPS / 2376)</div>
                            <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>使用 CA 证书与双向客户端证书验证安全连接</div>
                        </div>
                        <Switch
                            checked={!!form.dockerTlsEnabled}
                            onChange={(checked) => update({
                                dockerTlsEnabled: checked,
                                port: checked && form.port === 2375 ? 2376 : form.port,
                            })}
                        />
                    </div>

                    {form.dockerTlsEnabled && (
                        <Space orientation="vertical" size={10} style={{ width: '100%' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <Switch
                                    size="small"
                                    checked={!!form.dockerTlsInsecure}
                                    onChange={(checked) => update({ dockerTlsInsecure: checked })}
                                />
                                <span style={{ fontSize: 12 }}>跳过服务端证书校验 (Insecure Skip Verify)</span>
                            </div>
                            <div>
                                <div style={{ fontSize: 12, marginBottom: 4, fontWeight: 500 }}>CA 证书路径 / PEM</div>
                                <Space.Compact style={{ width: '100%' }}>
                                    <Input
                                        placeholder="选择 ca.pem 文件或粘贴"
                                        value={form.dockerTlsCaCert || ''}
                                        onChange={(e) => update({ dockerTlsCaCert: e.target.value })}
                                    />
                                    <Button onClick={() => handlePickCert('dockerTlsCaCert')}>选择证书</Button>
                                </Space.Compact>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                <div>
                                    <div style={{ fontSize: 12, marginBottom: 4, fontWeight: 500 }}>客户端证书 (cert.pem)</div>
                                    <Space.Compact style={{ width: '100%' }}>
                                        <Input
                                            placeholder="选择 cert.pem"
                                            value={form.dockerTlsClientCert || ''}
                                            onChange={(e) => update({ dockerTlsClientCert: e.target.value })}
                                        />
                                        <Button onClick={() => handlePickCert('dockerTlsClientCert')}>选择</Button>
                                    </Space.Compact>
                                </div>
                                <div>
                                    <div style={{ fontSize: 12, marginBottom: 4, fontWeight: 500 }}>客户端私钥 (key.pem)</div>
                                    <Space.Compact style={{ width: '100%' }}>
                                        <Input
                                            placeholder="选择 key.pem"
                                            value={form.dockerTlsClientKey || ''}
                                            onChange={(e) => update({ dockerTlsClientKey: e.target.value })}
                                        />
                                        <Button onClick={() => handlePickCert('dockerTlsClientKey')}>选择</Button>
                                    </Space.Compact>
                                </div>
                            </div>
                        </Space>
                    )}
                </Space>
            )}

            {form.dockerEndpointType === 'ssh' && (
                <Space orientation="vertical" size={10} style={{ width: '100%' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '3fr 1fr', gap: 12 }}>
                        <div>
                            <div style={{ fontSize: 13, marginBottom: 4, fontWeight: 500 }}>SSH 主机地址 (Host)</div>
                            <Input
                                placeholder="如 192.168.1.50 / ssh.example.com"
                                value={form.dockerSshHost || form.host || ''}
                                onChange={(e) => update({ dockerSshHost: e.target.value, host: e.target.value })}
                            />
                        </div>
                        <div>
                            <div style={{ fontSize: 13, marginBottom: 4, fontWeight: 500 }}>SSH 端口</div>
                            <InputNumber
                                min={1}
                                max={65535}
                                style={{ width: '100%' }}
                                value={form.dockerSshPort || 22}
                                onChange={(val) => update({ dockerSshPort: val || 22 })}
                            />
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <div>
                            <div style={{ fontSize: 13, marginBottom: 4, fontWeight: 500 }}>SSH 登录用户</div>
                            <Input
                                placeholder="root"
                                value={form.dockerSshUser ?? form.username ?? 'root'}
                                onChange={(e) => update({ dockerSshUser: e.target.value, username: e.target.value })}
                            />
                        </div>
                        <div>
                            <div style={{ fontSize: 13, marginBottom: 4, fontWeight: 500 }}>SSH 认证方式</div>
                            <Radio.Group
                                value={form.dockerSshAuthType || form.authType || 'password'}
                                onChange={(e) => update({ dockerSshAuthType: e.target.value, authType: e.target.value })}
                                buttonStyle="solid"
                            >
                                <Radio.Button value="password">密码</Radio.Button>
                                <Radio.Button value="key">私钥</Radio.Button>
                            </Radio.Group>
                        </div>
                    </div>

                    {form.dockerSshAuthType === 'key' ? (
                        <>
                            <div>
                                <div style={{ fontSize: 13, marginBottom: 4, fontWeight: 500 }}>SSH 私钥文件</div>
                                <Space.Compact style={{ width: '100%' }}>
                                    <Input
                                        placeholder="选择私钥文件或粘贴"
                                        value={form.dockerSshKeyPath || form.privateKey || form.dockerSshKeyData || ''}
                                        onChange={(e) => update({ dockerSshKeyPath: e.target.value, privateKey: e.target.value })}
                                    />
                                    <Button icon={<Key size={14} />} onClick={async () => {
                                        const p = await API.selectPrivateKey()
                                        if (p) update({ dockerSshKeyPath: p, privateKey: p })
                                    }}>选择</Button>
                                </Space.Compact>
                            </div>
                            <div>
                                <div style={{ fontSize: 13, marginBottom: 4, fontWeight: 500 }}>私钥密码 (Passphrase, 可选)</div>
                                <Input.Password
                                    placeholder="如有密码请填写"
                                    value={form.dockerSshPassphrase || form.passphrase || ''}
                                    onChange={(e) => update({ dockerSshPassphrase: e.target.value, passphrase: e.target.value })}
                                />
                            </div>
                        </>
                    ) : (
                        <div>
                            <div style={{ fontSize: 13, marginBottom: 4, fontWeight: 500 }}>SSH 登录密码</div>
                            <Input.Password
                                placeholder="请输入 SSH 密码"
                                value={form.dockerSshPassword || form.password || ''}
                                onChange={(e) => update({ dockerSshPassword: e.target.value, password: e.target.value })}
                            />
                        </div>
                    )}

                    <div>
                        <div style={{ fontSize: 13, marginBottom: 4, fontWeight: 500 }}>远程 Docker Socket 路径</div>
                        <Input
                            placeholder="/var/run/docker.sock"
                            value={form.dockerSocketPath || '/var/run/docker.sock'}
                            onChange={(e) => update({ dockerSocketPath: e.target.value })}
                        />
                    </div>
                </Space>
            )}
        </Space>
    )
}
