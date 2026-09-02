import React from 'react'
import { Input, InputNumber, Space, Switch, Collapse, Select } from 'antd'
import { ShieldCheck, Workflow, Zap } from 'lucide-react'
import { BasicFields } from './BasicFields'
import { ServerFormProps } from './types'

export const PostgresForm: React.FC<ServerFormProps> = ({
    form,
    update,
    groups,
}) => {
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
                        onChange={(val) => update({ port: val || 5432 })}
                    />
                </div>
            </div>

            {/* 用户名与密码 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                    <div style={{ fontSize: 13, marginBottom: 4, fontWeight: 500 }}>用户名 (User)</div>
                    <Input
                        placeholder="postgres"
                        value={form.username || 'postgres'}
                        onChange={(e) => update({ username: e.target.value })}
                    />
                </div>
                <div>
                    <div style={{ fontSize: 13, marginBottom: 4, fontWeight: 500 }}>密码 (Password)</div>
                    <Input.Password
                        placeholder="请输入 PostgreSQL 密码"
                        value={form.password || ''}
                        onChange={(e) => update({ password: e.target.value })}
                    />
                </div>
            </div>

            {/* 默认数据库与 Schema */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                    <div style={{ fontSize: 13, marginBottom: 4, fontWeight: 500 }}>默认数据库 (Database)</div>
                    <Input
                        placeholder="postgres"
                        value={form.postgresDatabase || form.database || 'postgres'}
                        onChange={(e) => update({ postgresDatabase: e.target.value, database: e.target.value })}
                    />
                </div>
                <div>
                    <div style={{ fontSize: 13, marginBottom: 4, fontWeight: 500 }}>默认 Schema (命名空间)</div>
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
                                    SSH 隧道代理 (SSH Bastion Tunnel)
                                </span>
                                {form.postgresSSHEnabled && <span style={{ fontSize: 11, color: 'var(--accent)', marginLeft: 4 }}>[已启用]</span>}
                            </Space>
                        ),
                        children: (
                            <Space direction="vertical" size={10} style={{ width: '100%' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <span style={{ fontSize: 12 }}>启用 SSH 隧道连接内网 PG</span>
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
                                                <div style={{ fontSize: 12, marginBottom: 4 }}>跳板机地址 (Host)</div>
                                                <Input
                                                    placeholder="如: bastion.internal.net"
                                                    value={form.postgresSSHHost || ''}
                                                    onChange={(e) => update({ postgresSSHHost: e.target.value })}
                                                />
                                            </div>
                                            <div>
                                                <div style={{ fontSize: 12, marginBottom: 4 }}>跳板机端口</div>
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
                                            <div style={{ fontSize: 12, marginBottom: 4 }}>跳板机用户名</div>
                                            <Input
                                                placeholder="如: ec2-user / root"
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
                                    SSL 传输安全 (SSL Mode)
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
                                        { label: 'disable (禁用 SSL / 明文直连)', value: 'disable' },
                                        { label: 'require (要求 SSL 加密传输)', value: 'require' },
                                        { label: 'verify-ca (校验 CA 证书)', value: 'verify-ca' },
                                        { label: 'verify-full (严格校验 CA 及主机名)', value: 'verify-full' },
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
                                <span style={{ fontSize: 13 }}>连接池设置 (Connection Pool)</span>
                            </Space>
                        ),
                        children: (
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                <div>
                                    <div style={{ fontSize: 12, marginBottom: 4 }}>最大连接数 (MaxConns)</div>
                                    <InputNumber
                                        min={1}
                                        max={500}
                                        style={{ width: '100%' }}
                                        value={form.postgresMaxOpenConns ?? 20}
                                        onChange={(v) => update({ postgresMaxOpenConns: v ?? 20 })}
                                    />
                                </div>
                                <div>
                                    <div style={{ fontSize: 12, marginBottom: 4 }}>最小空闲数 (MinConns)</div>
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
