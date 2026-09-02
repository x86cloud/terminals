import React from 'react'
import { Input, InputNumber, Space, Switch, Collapse, Select, Button } from 'antd'
import { Key, ShieldCheck, Workflow, Zap } from 'lucide-react'
import { API } from '@/api'
import { errorMessage } from '@/utils'
import { BasicFields } from './BasicFields'
import { ServerFormProps } from './types'

export const MysqlForm: React.FC<ServerFormProps> = ({
    form,
    update,
    groups,
    setError,
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
                        onChange={(val) => update({ port: val || 3306 })}
                    />
                </div>
            </div>

            {/* 用户名与密码 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                    <div style={{ fontSize: 13, marginBottom: 4, fontWeight: 500 }}>用户名</div>
                    <Input
                        placeholder="root"
                        value={form.username}
                        onChange={(e) => update({ username: e.target.value })}
                    />
                </div>
                <div>
                    <div style={{ fontSize: 13, marginBottom: 4, fontWeight: 500 }}>密码</div>
                    <Input.Password
                        placeholder="请输入数据库密码"
                        value={form.password || ''}
                        onChange={(e) => update({ password: e.target.value })}
                    />
                </div>
            </div>

            {/* 默认数据库与字符集 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                    <div style={{ fontSize: 13, marginBottom: 4, fontWeight: 500 }}>默认数据库 (Database, 可选)</div>
                    <Input
                        placeholder="如: mysql / app_db"
                        value={form.database || ''}
                        onChange={(e) => update({ database: e.target.value })}
                    />
                </div>
                <div>
                    <div style={{ fontSize: 13, marginBottom: 4, fontWeight: 500 }}>字符集编码 (Charset)</div>
                    <Input
                        placeholder="utf8mb4"
                        value={form.charset || 'utf8mb4'}
                        onChange={(e) => update({ charset: e.target.value })}
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
                                <Workflow size={13} color={form.mysqlSSHEnabled ? 'var(--accent)' : undefined} />
                                <span style={{ fontSize: 13, fontWeight: form.mysqlSSHEnabled ? 600 : 400 }}>
                                    SSH 跳板机隧道穿透 (SSH Bastion Tunnel)
                                </span>
                                {form.mysqlSSHEnabled && <span style={{ fontSize: 11, color: 'var(--accent)', marginLeft: 4 }}>[已启用]</span>}
                            </Space>
                        ),
                        children: (
                            <Space orientation="vertical" size={10} style={{ width: '100%' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <div style={{ fontSize: 13, fontWeight: 500 }}>启用 SSH 隧道转发</div>
                                        <div style={{ fontSize: 11.5, color: 'var(--text-dim)' }}>通过 Bastion / 跳板机穿透内网访问 MySQL</div>
                                    </div>
                                    <Switch
                                        checked={!!form.mysqlSSHEnabled}
                                        onChange={(checked) => update({ mysqlSSHEnabled: checked })}
                                    />
                                </div>

                                {form.mysqlSSHEnabled && (
                                    <>
                                        <div style={{ display: 'grid', gridTemplateColumns: '3fr 1fr', gap: 10 }}>
                                            <div>
                                                <div style={{ fontSize: 12, marginBottom: 4, fontWeight: 500 }}>跳板机地址 (SSH Host)</div>
                                                <Input
                                                    placeholder="jump.example.com / 192.168.1.10"
                                                    value={form.mysqlSSHHost || ''}
                                                    onChange={(e) => update({ mysqlSSHHost: e.target.value })}
                                                />
                                            </div>
                                            <div>
                                                <div style={{ fontSize: 12, marginBottom: 4, fontWeight: 500 }}>SSH 端口</div>
                                                <InputNumber
                                                    min={1}
                                                    max={65535}
                                                    style={{ width: '100%' }}
                                                    value={form.mysqlSSHHostPort ?? 22}
                                                    onChange={(v) => update({ mysqlSSHHostPort: v ?? 22 })}
                                                />
                                            </div>
                                        </div>

                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                            <div>
                                                <div style={{ fontSize: 12, marginBottom: 4, fontWeight: 500 }}>跳板机用户名</div>
                                                <Input
                                                    placeholder="root / ubuntu"
                                                    value={form.mysqlSSHUser || ''}
                                                    onChange={(e) => update({ mysqlSSHUser: e.target.value })}
                                                />
                                            </div>
                                            <div>
                                                <div style={{ fontSize: 12, marginBottom: 4, fontWeight: 500 }}>私钥口令 (Passphrase, 可选)</div>
                                                <Input.Password
                                                    placeholder="如有私钥密码请填写"
                                                    value={form.mysqlSSHPassphrase || ''}
                                                    onChange={(e) => update({ mysqlSSHPassphrase: e.target.value })}
                                                />
                                            </div>
                                        </div>

                                        <div>
                                            <div style={{ fontSize: 12, marginBottom: 4, fontWeight: 500 }}>跳板机私钥文件 (SSH Private Key)</div>
                                            <Space.Compact style={{ width: '100%' }}>
                                                <Input
                                                    placeholder="私钥文件路径 (.pem / id_rsa) 或留空使用密码认证"
                                                    value={form.mysqlSSHKeyPath || ''}
                                                    onChange={(e) => update({ mysqlSSHKeyPath: e.target.value })}
                                                />
                                                <Button icon={<Key size={14} />} onClick={async () => {
                                                    try {
                                                        const p = await API.selectPrivateKey()
                                                        if (p) update({ mysqlSSHKeyPath: p })
                                                    } catch (err) {
                                                        setError(errorMessage(err))
                                                    }
                                                }}>
                                                    浏览
                                                </Button>
                                            </Space.Compact>
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
                                <ShieldCheck size={13} color={form.mysqlTLS ? 'var(--accent)' : undefined} />
                                <span style={{ fontSize: 13, fontWeight: form.mysqlTLS ? 600 : 400 }}>
                                    SSL / TLS 加密安全 (SSL/TLS Modes)
                                </span>
                                {form.mysqlTLS && <span style={{ fontSize: 11, color: 'var(--accent)', marginLeft: 4 }}>[{form.mysqlTLS}]</span>}
                            </Space>
                        ),
                        children: (
                            <div>
                                <div style={{ fontSize: 12, marginBottom: 4, fontWeight: 500 }}>SSL 传输加密模式</div>
                                <Select
                                    style={{ width: '100%' }}
                                    value={form.mysqlTLS || ''}
                                    onChange={(val) => update({ mysqlTLS: val, mysqlSSLEnabled: !!val })}
                                    options={[
                                        { label: '禁用 (Disabled / 默认明文)', value: '' },
                                        { label: '首选 (Preferred / 服务端支持时加密)', value: 'preferred' },
                                        { label: '强制加密校验 (Required / true)', value: 'true' },
                                        { label: '跳过证书校验 (Skip-Verify / 自签名证书测试)', value: 'skip-verify' },
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
                                <span style={{ fontSize: 13 }}>连接池与生命周期 (Connection Pool)</span>
                            </Space>
                        ),
                        children: (
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                                <div>
                                    <div style={{ fontSize: 12, marginBottom: 4 }}>最大打开连接数</div>
                                    <InputNumber
                                        min={1}
                                        max={500}
                                        style={{ width: '100%' }}
                                        value={form.mysqlMaxOpenConns ?? 10}
                                        onChange={(v) => update({ mysqlMaxOpenConns: v ?? 10 })}
                                    />
                                </div>
                                <div>
                                    <div style={{ fontSize: 12, marginBottom: 4 }}>最大空闲连接数</div>
                                    <InputNumber
                                        min={0}
                                        max={100}
                                        style={{ width: '100%' }}
                                        value={form.mysqlMaxIdleConns ?? 5}
                                        onChange={(v) => update({ mysqlMaxIdleConns: v ?? 5 })}
                                    />
                                </div>
                                <div>
                                    <div style={{ fontSize: 12, marginBottom: 4 }}>最大存活时间</div>
                                    <InputNumber
                                        min={0}
                                        max={86400}
                                        style={{ width: '100%' }}
                                        value={form.mysqlConnMaxLifetime ?? 3600}
                                        addonAfter="秒"
                                        onChange={(v) => update({ mysqlConnMaxLifetime: v ?? 3600 })}
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
