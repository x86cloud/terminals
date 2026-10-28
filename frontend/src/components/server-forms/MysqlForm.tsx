import React from 'react'
import { Input, InputNumber, Space, Switch, Collapse, Select, Button } from 'antd'
import { Key, ShieldCheck, Workflow, Zap } from 'lucide-react'
import { useTranslation } from 'react-i18next'
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
                        onChange={(val) => update({ port: val || 3306 })}
                    />
                </div>
            </div>

            {/* 用户名与密码 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                    <div style={{ fontSize: 13, marginBottom: 4, fontWeight: 500 }}>{t('server:username')}</div>
                    <Input
                        placeholder={t('server:usernamePlaceholder')}
                        value={form.username}
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

            {/* 默认数据库与字符集 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                    <div style={{ fontSize: 13, marginBottom: 4, fontWeight: 500 }}>{t('server:database')}</div>
                    <Input
                        placeholder={t('server:databasePlaceholder')}
                        value={form.database || ''}
                        onChange={(e) => update({ database: e.target.value })}
                    />
                </div>
                <div>
                    <div style={{ fontSize: 13, marginBottom: 4, fontWeight: 500 }}>{t('server:charset')}</div>
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
                                    {t('server:mysql.tunnel')}
                                </span>
                                {form.mysqlSSHEnabled && <span style={{ fontSize: 11, color: 'var(--accent)', marginLeft: 4 }}>[{t('server:enabled')}]</span>}
                            </Space>
                        ),
                        children: (
                            <Space orientation="vertical" size={10} style={{ width: '100%' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <div style={{ fontSize: 13, fontWeight: 500 }}>{t('server:mysql.tunnel')}</div>
                                        <div style={{ fontSize: 11.5, color: 'var(--text-dim)' }}>{t('server:mysql.tunnelDesc')}</div>
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
                                                <div style={{ fontSize: 12, marginBottom: 4, fontWeight: 500 }}>{t('server:mysql.bastionHost')}</div>
                                                <Input
                                                    placeholder="jump.example.com / 192.168.1.10"
                                                    value={form.mysqlSSHHost || ''}
                                                    onChange={(e) => update({ mysqlSSHHost: e.target.value })}
                                                />
                                            </div>
                                            <div>
                                                <div style={{ fontSize: 12, marginBottom: 4, fontWeight: 500 }}>{t('server:mysql.bastionPort')}</div>
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
                                                <div style={{ fontSize: 12, marginBottom: 4, fontWeight: 500 }}>{t('server:mysql.bastionUser')}</div>
                                                <Input
                                                    placeholder="root / ubuntu"
                                                    value={form.mysqlSSHUser || ''}
                                                    onChange={(e) => update({ mysqlSSHUser: e.target.value })}
                                                />
                                            </div>
                                            <div>
                                                <div style={{ fontSize: 12, marginBottom: 4, fontWeight: 500 }}>{t('server:passphrase')}</div>
                                                <Input.Password
                                                    placeholder={t('server:passphrasePlaceholder')}
                                                    value={form.mysqlSSHPassphrase || ''}
                                                    onChange={(e) => update({ mysqlSSHPassphrase: e.target.value })}
                                                />
                                            </div>
                                        </div>

                                        <div>
                                            <div style={{ fontSize: 12, marginBottom: 4, fontWeight: 500 }}>{t('server:privateKey')}</div>
                                            <Space.Compact style={{ width: '100%' }}>
                                                <Input
                                                    placeholder={t('server:privateKeyPlaceholder')}
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
                                                    {t('server:browse')}
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
                                    {t('server:mysql.security')}
                                </span>
                                {form.mysqlTLS && <span style={{ fontSize: 11, color: 'var(--accent)', marginLeft: 4 }}>[{form.mysqlTLS}]</span>}
                            </Space>
                        ),
                        children: (
                            <div>
                                <div style={{ fontSize: 12, marginBottom: 4, fontWeight: 500 }}>{t('server:mysql.sslMode')}</div>
                                <Select
                                    style={{ width: '100%' }}
                                    value={form.mysqlTLS || ''}
                                    onChange={(val) => update({ mysqlTLS: val, mysqlSSLEnabled: !!val })}
                                    options={[
                                        { label: t('server:mysql.sslDisable'), value: '' },
                                        { label: 'Preferred (TLS)', value: 'preferred' },
                                        { label: t('server:mysql.sslRequire'), value: 'true' },
                                        { label: 'Skip-Verify (TLS)', value: 'skip-verify' },
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
                                <span style={{ fontSize: 13 }}>{t('server:mysql.connectionPool')}</span>
                            </Space>
                        ),
                        children: (
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                                <div>
                                    <div style={{ fontSize: 12, marginBottom: 4 }}>{t('server:mysql.maxOpenConns')}</div>
                                    <InputNumber
                                        min={1}
                                        max={500}
                                        style={{ width: '100%' }}
                                        value={form.mysqlMaxOpenConns ?? 10}
                                        onChange={(v) => update({ mysqlMaxOpenConns: v ?? 10 })}
                                    />
                                </div>
                                <div>
                                    <div style={{ fontSize: 12, marginBottom: 4 }}>{t('server:mysql.maxIdleConns')}</div>
                                    <InputNumber
                                        min={0}
                                        max={100}
                                        style={{ width: '100%' }}
                                        value={form.mysqlMaxIdleConns ?? 5}
                                        onChange={(v) => update({ mysqlMaxIdleConns: v ?? 5 })}
                                    />
                                </div>
                                <div>
                                    <div style={{ fontSize: 12, marginBottom: 4 }}>{t('server:mysql.connMaxLifetime')}</div>
                                    <InputNumber
                                        min={0}
                                        max={86400}
                                        style={{ width: '100%' }}
                                        value={form.mysqlConnMaxLifetime ?? 3600}
                                        addonAfter={t('server:second')}
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
