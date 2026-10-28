import React from 'react'
import { Input, InputNumber, Space, Switch, Collapse, Select } from 'antd'
import { ShieldCheck, Workflow, Zap } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { BasicFields } from './BasicFields'
import { ServerFormProps } from './types'

export const PostgresForm: React.FC<ServerFormProps> = ({
    form,
    update,
    groups,
}) => {
    const { t } = useTranslation(['server', 'common'])

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
                        onChange={(val) => update({ port: val || 5432 })}
                    />
                </div>
            </div>

            {/* 用户名与密码 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                    <div style={{ fontSize: 13, marginBottom: 4, fontWeight: 500 }}>{t('server:username')}</div>
                    <Input
                        placeholder="postgres"
                        value={form.username || 'postgres'}
                        onChange={(e) => update({ username: e.target.value })}
                    />
                </div>
                <div>
                    <div style={{ fontSize: 13, marginBottom: 4, fontWeight: 500 }}>{t('server:password')}</div>
                    <Input.Password
                        placeholder={t('server:passwordPlaceholder')}
                        value={form.password || ''}
                        onChange={(e) => update({ password: e.target.value })}
                    />
                </div>
            </div>

            {/* 默认数据库与 Schema */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                    <div style={{ fontSize: 13, marginBottom: 4, fontWeight: 500 }}>{t('server:database')}</div>
                    <Input
                        placeholder="postgres"
                        value={form.postgresDatabase || form.database || 'postgres'}
                        onChange={(e) => update({ postgresDatabase: e.target.value, database: e.target.value })}
                    />
                </div>
                <div>
                    <div style={{ fontSize: 13, marginBottom: 4, fontWeight: 500 }}>{t('server:postgres.schema')}</div>
                    <Input
                        placeholder="public"
                        value={form.postgresSchema || 'public'}
                        onChange={(e) => update({ postgresSchema: e.target.value })}
                    />
                </div>
            </div>

            {/* 高级折叠面板 */}
            <Collapse
                ghost
                size="small"
                items={[
                    {
                        key: 'ssh',
                        label: (
                            <Space size={6}>
                                <Workflow size={13} color={form.postgresSSHEnabled ? 'var(--accent)' : undefined} />
                                <span style={{ fontSize: 13, fontWeight: form.postgresSSHEnabled ? 600 : 400 }}>
                                    {t('server:postgres.tunnel')}
                                </span>
                                {form.postgresSSHEnabled && <span style={{ fontSize: 11, color: 'var(--accent)', marginLeft: 4 }}>[{t('server:enabled')}]</span>}
                            </Space>
                        ),
                        children: (
                            <Space orientation="vertical" size={10} style={{ width: '100%' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <span style={{ fontSize: 12 }}>{t('server:postgres.tunnelDesc')}</span>
                                    <Switch
                                        size="small"
                                        checked={!!form.postgresSSHEnabled}
                                        onChange={(checked) => update({ postgresSSHEnabled: checked })}
                                    />
                                </div>
                                {form.postgresSSHEnabled && (
                                    <>
                                        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10 }}>
                                            <div>
                                                <div style={{ fontSize: 12, marginBottom: 4 }}>{t('server:mysql.bastionHost')}</div>
                                                <Input
                                                    placeholder="bastion.internal.net"
                                                    value={form.postgresSSHHost || ''}
                                                    onChange={(e) => update({ postgresSSHHost: e.target.value })}
                                                />
                                            </div>
                                            <div>
                                                <div style={{ fontSize: 12, marginBottom: 4 }}>{t('server:mysql.bastionPort')}</div>
                                                <InputNumber
                                                    min={1}
                                                    max={65535}
                                                    style={{ width: '100%' }}
                                                    value={form.postgresSSHHostPort ?? 22}
                                                    onChange={(v) => update({ postgresSSHHostPort: v ?? 22 })}
                                                />
                                            </div>
                                        </div>
                                        <div>
                                            <div style={{ fontSize: 12, marginBottom: 4 }}>{t('server:mysql.bastionUser')}</div>
                                            <Input
                                                placeholder="ec2-user / root"
                                                value={form.postgresSSHUser || ''}
                                                onChange={(e) => update({ postgresSSHUser: e.target.value })}
                                            />
                                        </div>
                                    </>
                                )}
                            </Space>
                        ),
                    },
                    {
                        key: 'ssl',
                        label: (
                            <Space size={6}>
                                <ShieldCheck size={13} color={form.postgresSSLMode && form.postgresSSLMode !== 'disable' ? 'var(--accent)' : undefined} />
                                <span style={{ fontSize: 13, fontWeight: form.postgresSSLMode && form.postgresSSLMode !== 'disable' ? 600 : 400 }}>
                                    {t('server:postgres.ssl')}
                                </span>
                                {form.postgresSSLMode && <span style={{ fontSize: 11, color: 'var(--accent)', marginLeft: 4 }}>[{form.postgresSSLMode}]</span>}
                            </Space>
                        ),
                        children: (
                            <div>
                                <div style={{ fontSize: 12, marginBottom: 4, fontWeight: 500 }}>SSL Mode</div>
                                <Select
                                    style={{ width: '100%' }}
                                    value={form.postgresSSLMode || 'disable'}
                                    onChange={(val) => update({ postgresSSLMode: val })}
                                    options={[
                                        { label: 'disable (No SSL)', value: 'disable' },
                                        { label: 'require (SSL Required)', value: 'require' },
                                        { label: 'verify-ca (Verify CA)', value: 'verify-ca' },
                                        { label: 'verify-full (Verify CA & Host)', value: 'verify-full' },
                                    ]}
                                />
                            </div>
                        ),
                    },
                    {
                        key: 'pool',
                        label: (
                            <Space size={6}>
                                <Zap size={13} />
                                <span style={{ fontSize: 13 }}>{t('server:postgres.pool')}</span>
                            </Space>
                        ),
                        children: (
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                <div>
                                    <div style={{ fontSize: 12, marginBottom: 4 }}>{t('server:mysql.maxOpenConns')} (MaxConns)</div>
                                    <InputNumber
                                        min={1}
                                        max={500}
                                        style={{ width: '100%' }}
                                        value={form.postgresMaxOpenConns ?? 20}
                                        onChange={(v) => update({ postgresMaxOpenConns: v ?? 20 })}
                                    />
                                </div>
                                <div>
                                    <div style={{ fontSize: 12, marginBottom: 4 }}>{t('server:mysql.maxIdleConns')} (MinConns)</div>
                                    <InputNumber
                                        min={0}
                                        max={100}
                                        style={{ width: '100%' }}
                                        value={form.postgresMinIdleConns ?? 2}
                                        onChange={(v) => update({ postgresMinIdleConns: v ?? 2 })}
                                    />
                                </div>
                            </div>
                        ),
                    },
                ]}
            />
        </Space>
    )
}
