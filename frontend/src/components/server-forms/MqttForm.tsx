import React from 'react'
import { Input, InputNumber, Radio, Space, Switch, Collapse, Select, Button, Tooltip } from 'antd'
import { Cpu, Dices, FolderOpen, Key, Scroll, ShieldCheck } from 'lucide-react'
import { useTranslation } from 'react-i18next'
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
    const { t } = useTranslation(['server', 'common'])

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
                    <div style={{ fontSize: 13, marginBottom: 4, fontWeight: 500 }}>{t('server:host')}</div>
                    <Input
                        placeholder={t('server:hostPlaceholder')}
                        value={form.host}
                        onChange={(e) => update({ host: e.target.value })}
                    />
                </div>
                <div>
                    <div style={{ fontSize: 13, marginBottom: 4, fontWeight: 500 }}>{t('server:port')}</div>
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
                <div style={{ fontSize: 13, marginBottom: 4, fontWeight: 500 }}>{t('server:mqtt.clientId')}</div>
                <Input
                    placeholder={t('server:mqtt.randomClientPlaceholder')}
                    value={form.clientId || ''}
                    onChange={(e) => update({ clientId: e.target.value })}
                    suffix={
                        <Tooltip title={t('server:mqtt.randomClientTooltip')}>
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
                    <div style={{ fontSize: 13, marginBottom: 4, fontWeight: 500 }}>{t('server:mqtt.usernameOptional')}</div>
                    <Input
                        placeholder={t('server:mqtt.noAuthPlaceholder')}
                        value={form.username || ''}
                        onChange={(e) => update({ username: e.target.value })}
                    />
                </div>
                <div>
                    <div style={{ fontSize: 13, marginBottom: 4, fontWeight: 500 }}>{t('server:mqtt.passwordOptional')}</div>
                    <Input.Password
                        placeholder={t('server:mqtt.noAuthPlaceholder')}
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
                                    {t('server:mqtt.tlsTitle')}
                                </span>
                                {form.useTLS && <span style={{ fontSize: 11, color: 'var(--accent)', marginLeft: 4 }}>[{t('server:enabled')}]</span>}
                            </Space>
                        ),
                        children: (
                            <Space orientation="vertical" size={10} style={{ width: '100%' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <div style={{ fontSize: 13, fontWeight: 500 }}>{t('server:mqtt.enableTls')}</div>
                                        <div style={{ fontSize: 11.5, color: 'var(--text-dim)' }}>{t('server:mqtt.enableTlsDesc')}</div>
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
                                                <div style={{ fontSize: 13 }}>{t('server:mqtt.insecure')}</div>
                                                <div style={{ fontSize: 11.5, color: 'var(--text-dim)' }}>{t('server:mqtt.insecureDesc')}</div>
                                            </div>
                                            <Switch
                                                checked={!!form.mqttInsecure}
                                                onChange={(checked) => update({ mqttInsecure: checked })}
                                            />
                                        </div>

                                        <div>
                                            <div style={{ fontSize: 12, marginBottom: 4, fontWeight: 500 }}>{t('server:mqtt.caCert')}</div>
                                            <Space.Compact style={{ width: '100%' }}>
                                                <Input
                                                    placeholder={t('server:mqtt.caCertPlaceholder')}
                                                    value={form.mqttCACert || ''}
                                                    onChange={(e) => update({ mqttCACert: e.target.value })}
                                                />
                                                <Button icon={<FolderOpen size={14} />} onClick={() => handlePickCert('mqttCACert')}>
                                                    {t('server:browse')}
                                                </Button>
                                            </Space.Compact>
                                        </div>

                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                            <div>
                                                <div style={{ fontSize: 12, marginBottom: 4, fontWeight: 500 }}>{t('server:mqtt.clientCert')}</div>
                                                <Space.Compact style={{ width: '100%' }}>
                                                    <Input
                                                        placeholder={t('server:mqtt.clientCertPlaceholder')}
                                                        value={form.mqttClientCert || ''}
                                                        onChange={(e) => update({ mqttClientCert: e.target.value })}
                                                    />
                                                    <Button icon={<FolderOpen size={14} />} onClick={() => handlePickCert('mqttClientCert')}>
                                                        {t('server:browse')}
                                                    </Button>
                                                </Space.Compact>
                                            </div>
                                            <div>
                                                <div style={{ fontSize: 12, marginBottom: 4, fontWeight: 500 }}>{t('server:mqtt.clientKey')}</div>
                                                <Space.Compact style={{ width: '100%' }}>
                                                    <Input
                                                        placeholder={t('server:mqtt.clientKeyPlaceholder')}
                                                        value={form.mqttClientKey || ''}
                                                        onChange={(e) => update({ mqttClientKey: e.target.value })}
                                                    />
                                                    <Button icon={<Key size={14} />} onClick={() => handlePickCert('mqttClientKey')}>
                                                        {t('server:browse')}
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
                                <span style={{ fontSize: 13 }}>{t('server:mqtt.protoTiming')}</span>
                            </Space>
                        ),
                        children: (
                            <Space orientation="vertical" size={10} style={{ width: '100%' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                    <div>
                                        <div style={{ fontSize: 12, marginBottom: 4, fontWeight: 500 }}>{t('server:mqtt.protoVersion')}</div>
                                        <Select
                                            style={{ width: '100%' }}
                                            value={form.mqttProto || '3.1.1'}
                                            onChange={(v) => update({ mqttProto: v })}
                                            options={[
                                                { label: t('server:mqtt.proto311'), value: '3.1.1' },
                                                { label: 'MQTT 3.1', value: '3.1' },
                                            ]}
                                        />
                                    </div>
                                    <div style={{ display: 'flex', gap: 16, alignItems: 'center', paddingTop: 18 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <span style={{ fontSize: 12.5 }}>{t('server:mqtt.cleanSession')}</span>
                                            <Switch
                                                size="small"
                                                checked={form.mqttCleanSession !== false}
                                                onChange={(checked) => update({ mqttCleanSession: checked })}
                                            />
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <span style={{ fontSize: 12.5 }}>{t('server:mqtt.autoReconnect')}</span>
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
                                        <div style={{ fontSize: 12, marginBottom: 4 }}>{t('server:mqtt.keepAlive')}</div>
                                        <InputNumber
                                            min={5}
                                            max={3600}
                                            style={{ width: '100%' }}
                                            value={form.mqttKeepAlive ?? 30}
                                            addonAfter={t('server:second')}
                                            onChange={(v) => update({ mqttKeepAlive: v ?? 30 })}
                                        />
                                    </div>
                                    <div>
                                        <div style={{ fontSize: 12, marginBottom: 4 }}>{t('server:mqtt.timeout')}</div>
                                        <InputNumber
                                            min={1}
                                            max={120}
                                            style={{ width: '100%' }}
                                            value={form.mqttConnectTimeout ?? 10}
                                            addonAfter={t('server:second')}
                                            onChange={(v) => update({ mqttConnectTimeout: v ?? 10 })}
                                        />
                                    </div>
                                    <div>
                                        <div style={{ fontSize: 12, marginBottom: 4 }}>{t('server:mqtt.reconnectInterval')}</div>
                                        <InputNumber
                                            min={1}
                                            max={300}
                                            style={{ width: '100%' }}
                                            value={form.mqttReconnectIntvl ?? 5}
                                            addonAfter={t('server:second')}
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
                                    {t('server:mqtt.lwtTitle')}
                                </span>
                                {form.mqttWillTopic && <span style={{ fontSize: 11, color: 'var(--accent)', marginLeft: 4 }}>[{t('server:mqtt.configured')}]</span>}
                            </Space>
                        ),
                        children: (
                            <Space orientation="vertical" size={10} style={{ width: '100%' }}>
                                <div>
                                    <div style={{ fontSize: 12, marginBottom: 4, fontWeight: 500 }}>{t('server:mqtt.willTopic')}</div>
                                    <Input
                                        placeholder="status/client/offline"
                                        value={form.mqttWillTopic || ''}
                                        onChange={(e) => update({ mqttWillTopic: e.target.value })}
                                    />
                                </div>

                                <div>
                                    <div style={{ fontSize: 12, marginBottom: 4, fontWeight: 500 }}>{t('server:mqtt.willPayload')}</div>
                                    <Input.TextArea
                                        rows={2}
                                        placeholder='{ "status": "offline", "time": 0 }'
                                        value={form.mqttWillPayload || ''}
                                        onChange={(e) => update({ mqttWillPayload: e.target.value })}
                                    />
                                </div>

                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <span style={{ fontSize: 12.5, fontWeight: 500 }}>{t('server:mqtt.willQos')}</span>
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
                                        <span style={{ fontSize: 12.5 }}>{t('server:mqtt.willRetained')}</span>
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
