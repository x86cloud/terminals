import React from 'react'
import { Input, InputNumber, Radio, Space, Switch, Collapse, Select, Button, Tooltip } from 'antd'
import { Cpu, Dices, FolderOpen, Key, Scroll, ShieldCheck } from 'lucide-react'
import { API } from '@/api'
import { errorMessage } from '@/utils'
import { ServerConfig } from '@/types'
import { BasicFields } from './BasicFields'
import { ServerFormProps } from './types'

export const MqttForm: React.FC<ServerFormProps> = ({
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

            {/* Host + Port */}
            <div style={{ display: 'grid', gridTemplateColumns: '3fr 1fr', gap: 12 }}>
                <div>
                    <div style={{ fontSize: 13, marginBottom: 4, fontWeight: 500 }}>主机地址 (Host / IP)</div>
                    <Input
                        placeholder="127.0.0.1 / example.com"
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
                        value={form.port}
                        onChange={(val) => update({ port: val || (form.useTLS ? 8883 : 1883) })}
                    />
                </div>
            </div>

            {/* Client ID */}
            <div>
                <div style={{ fontSize: 13, marginBottom: 4, fontWeight: 500 }}>客户端 ID (Client ID)</div>
                <Input
                    placeholder="留空自动随机生成"
                    value={form.clientId || ''}
                    onChange={(e) => update({ clientId: e.target.value })}
                    suffix={
                        <Tooltip title="随机生成 Client ID">
                            <Button
                                type="text"
                                size="small"
                                icon={<Dices size={13} />}
                                onClick={() => update({ clientId: 'wails_mqtt_' + Math.random().toString(36).slice(2, 10) })}
                                style={{ padding: '0 4px', height: 'auto', color: 'var(--text-dim)' }}
                            />
                        </Tooltip>
                    }
                />
            </div>

            {/* 用户名与密码 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                    <div style={{ fontSize: 13, marginBottom: 4, fontWeight: 500 }}>用户名 (Username, 可选)</div>
                    <Input
                        placeholder="无认证留空"
                        value={form.username || ''}
                        onChange={(e) => update({ username: e.target.value })}
                    />
                </div>
                <div>
                    <div style={{ fontSize: 13, marginBottom: 4, fontWeight: 500 }}>密码 (Password, 可选)</div>
                    <Input.Password
                        placeholder="无认证留空"
                        value={form.password || ''}
                        onChange={(e) => update({ password: e.target.value })}
                    />
                </div>
            </div>

            {/* 高级折叠面板 */}
            <Collapse
                ghost
                size="small"
                items={[
                    {
                        key: 'tls',
                        label: (
                            <Space size={6}>
                                <ShieldCheck size={13} color={form.useTLS ? 'var(--accent)' : undefined} />
                                <span style={{ fontSize: 13, fontWeight: form.useTLS ? 600 : 400 }}>
                                    TLS / SSL 安全与双向认证 (mTLS)
                                </span>
                                {form.useTLS && <span style={{ fontSize: 11, color: 'var(--accent)', marginLeft: 4 }}>[已启用]</span>}
                            </Space>
                        ),
                        children: (
                            <Space orientation="vertical" size={10} style={{ width: '100%' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <div style={{ fontSize: 13, fontWeight: 500 }}>启用 TLS / SSL 加密连接</div>
                                        <div style={{ fontSize: 11.5, color: 'var(--text-dim)' }}>支持单向/双向 SSL 证书加密通信</div>
                                    </div>
                                    <Switch
                                        checked={!!form.useTLS}
                                        onChange={(checked) => {
                                            const patch: Partial<ServerConfig> = { useTLS: checked }
                                            if (checked && form.port === 1883) patch.port = 8883
                                            else if (!checked && form.port === 8883) patch.port = 1883
                                            update(patch)
                                        }}
                                    />
                                </div>

                                {form.useTLS && (
                                    <>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 2 }}>
                                            <div>
                                                <div style={{ fontSize: 13 }}>跳过服务端证书校验 (Insecure)</div>
                                                <div style={{ fontSize: 11.5, color: 'var(--text-dim)' }}>自签名证书开发测试时可开启</div>
                                            </div>
                                            <Switch
                                                checked={!!form.mqttInsecure}
                                                onChange={(checked) => update({ mqttInsecure: checked })}
                                            />
                                        </div>

                                        <div>
                                            <div style={{ fontSize: 12, marginBottom: 4, fontWeight: 500 }}>CA 根证书 (CA Certificate, 可选)</div>
                                            <Space.Compact style={{ width: '100%' }}>
                                                <Input
                                                    placeholder="CA 证书文件路径 (.crt/.pem) 或留空使用系统根证书"
                                                    value={form.mqttCACert || ''}
                                                    onChange={(e) => update({ mqttCACert: e.target.value })}
                                                />
                                                <Button icon={<FolderOpen size={14} />} onClick={() => handlePickCert('mqttCACert')}>
                                                    浏览
                                                </Button>
                                            </Space.Compact>
                                        </div>

                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                            <div>
                                                <div style={{ fontSize: 12, marginBottom: 4, fontWeight: 500 }}>客户端证书 (Client Cert, 双向认证)</div>
                                                <Space.Compact style={{ width: '100%' }}>
                                                    <Input
                                                        placeholder="客户端证书 (.crt/.pem)"
                                                        value={form.mqttClientCert || ''}
                                                        onChange={(e) => update({ mqttClientCert: e.target.value })}
                                                    />
                                                    <Button icon={<FolderOpen size={14} />} onClick={() => handlePickCert('mqttClientCert')}>
                                                        浏览
                                                    </Button>
                                                </Space.Compact>
                                            </div>
                                            <div>
                                                <div style={{ fontSize: 12, marginBottom: 4, fontWeight: 500 }}>客户端私钥 (Client Key)</div>
                                                <Space.Compact style={{ width: '100%' }}>
                                                    <Input
                                                        placeholder="私钥文件 (.key/.pem)"
                                                        value={form.mqttClientKey || ''}
                                                        onChange={(e) => update({ mqttClientKey: e.target.value })}
                                                    />
                                                    <Button icon={<Key size={14} />} onClick={() => handlePickCert('mqttClientKey')}>
                                                        浏览
                                                    </Button>
                                                </Space.Compact>
                                            </div>
                                        </div>
                                    </>
                                )}
                            </Space>
                        ),
                    },
                    {
                        key: 'proto',
                        label: (
                            <Space size={6}>
                                <Cpu size={13} />
                                <span style={{ fontSize: 13 }}>协议参数与心跳控制 (Protocol & Timings)</span>
                            </Space>
                        ),
                        children: (
                            <Space orientation="vertical" size={10} style={{ width: '100%' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                    <div>
                                        <div style={{ fontSize: 12, marginBottom: 4, fontWeight: 500 }}>协议版本 (Protocol Version)</div>
                                        <Select
                                            style={{ width: '100%' }}
                                            value={form.mqttProto || '3.1.1'}
                                            onChange={(v) => update({ mqttProto: v })}
                                            options={[
                                                { label: 'MQTT 3.1.1 (推荐)', value: '3.1.1' },
                                                { label: 'MQTT 3.1', value: '3.1' },
                                            ]}
                                        />
                                    </div>
                                    <div style={{ display: 'flex', gap: 16, alignItems: 'center', paddingTop: 18 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <span style={{ fontSize: 12.5 }}>清除会话</span>
                                            <Switch
                                                size="small"
                                                checked={form.mqttCleanSession !== false}
                                                onChange={(checked) => update({ mqttCleanSession: checked })}
                                            />
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <span style={{ fontSize: 12.5 }}>自动重连</span>
                                            <Switch
                                                size="small"
                                                checked={form.mqttAutoReconnect !== false}
                                                onChange={(checked) => update({ mqttAutoReconnect: checked })}
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                                    <div>
                                        <div style={{ fontSize: 12, marginBottom: 4 }}>心跳间隔 (Keep Alive)</div>
                                        <InputNumber
                                            min={5}
                                            max={3600}
                                            style={{ width: '100%' }}
                                            value={form.mqttKeepAlive ?? 30}
                                            addonAfter="秒"
                                            onChange={(v) => update({ mqttKeepAlive: v ?? 30 })}
                                        />
                                    </div>
                                    <div>
                                        <div style={{ fontSize: 12, marginBottom: 4 }}>连接超时 (Timeout)</div>
                                        <InputNumber
                                            min={1}
                                            max={120}
                                            style={{ width: '100%' }}
                                            value={form.mqttConnectTimeout ?? 10}
                                            addonAfter="秒"
                                            onChange={(v) => update({ mqttConnectTimeout: v ?? 10 })}
                                        />
                                    </div>
                                    <div>
                                        <div style={{ fontSize: 12, marginBottom: 4 }}>重连间隔 (Interval)</div>
                                        <InputNumber
                                            min={1}
                                            max={300}
                                            style={{ width: '100%' }}
                                            value={form.mqttReconnectIntvl ?? 5}
                                            addonAfter="秒"
                                            onChange={(v) => update({ mqttReconnectIntvl: v ?? 5 })}
                                        />
                                    </div>
                                </div>
                            </Space>
                        ),
                    },
                    {
                        key: 'lwt',
                        label: (
                            <Space size={6}>
                                <Scroll size={13} color={form.mqttWillTopic ? 'var(--accent)' : undefined} />
                                <span style={{ fontSize: 13, fontWeight: form.mqttWillTopic ? 600 : 400 }}>
                                    遗嘱消息 (Last Will and Testament - LWT)
                                </span>
                                {form.mqttWillTopic && <span style={{ fontSize: 11, color: 'var(--accent)', marginLeft: 4 }}>[已配置]</span>}
                            </Space>
                        ),
                        children: (
                            <Space orientation="vertical" size={10} style={{ width: '100%' }}>
                                <div>
                                    <div style={{ fontSize: 12, marginBottom: 4, fontWeight: 500 }}>遗嘱主题 (Will Topic)</div>
                                    <Input
                                        placeholder="例如: status/client/offline"
                                        value={form.mqttWillTopic || ''}
                                        onChange={(e) => update({ mqttWillTopic: e.target.value })}
                                    />
                                </div>

                                <div>
                                    <div style={{ fontSize: 12, marginBottom: 4, fontWeight: 500 }}>遗嘱消息内容 (Will Payload)</div>
                                    <Input.TextArea
                                        rows={2}
                                        placeholder="例如: { &quot;status&quot;: &quot;offline&quot;, &quot;time&quot;: 0 }"
                                        value={form.mqttWillPayload || ''}
                                        onChange={(e) => update({ mqttWillPayload: e.target.value })}
                                    />
                                </div>

                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <span style={{ fontSize: 12.5, fontWeight: 500 }}>服务质量 (QoS):</span>
                                        <Radio.Group
                                            size="small"
                                            value={form.mqttWillQos ?? 0}
                                            onChange={(e) => update({ mqttWillQos: e.target.value })}
                                            buttonStyle="solid"
                                        >
                                            <Radio.Button value={0}>QoS 0</Radio.Button>
                                            <Radio.Button value={1}>QoS 1</Radio.Button>
                                            <Radio.Button value={2}>QoS 2</Radio.Button>
                                        </Radio.Group>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <span style={{ fontSize: 12.5 }}>消息保留 (Retain)</span>
                                        <Switch
                                            size="small"
                                            checked={!!form.mqttWillRetained}
                                            onChange={(checked) => update({ mqttWillRetained: checked })}
                                        />
                                    </div>
                                </div>
                            </Space>
                        ),
                    },
                ]}
            />
        </Space>
    )
}
