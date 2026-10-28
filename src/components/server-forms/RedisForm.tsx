import React from 'react'
import { Input, InputNumber, Radio, Space, Switch, Collapse, Select } from 'antd'
import { Network, ShieldCheck, Zap } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { BasicFields } from './BasicFields'
import { ServerFormProps } from './types'

export const RedisForm: React.FC<ServerFormProps> = ({
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
                        onChange={(val) => update({ port: val || 6379 })}
                    />
                </div>
            </div>

            {/* ACL 用户名与密码 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                    <div style={{ fontSize: 13, marginBottom: 4, fontWeight: 500 }}>{t('server:redis.aclUsername')}</div>
                    <Input
                        placeholder={t('server:redis.aclUsernamePlaceholder')}
                        value={form.redisUsername || ''}
                        onChange={(e) => update({ redisUsername: e.target.value })}
                    />
                </div>
                <div>
                    <div style={{ fontSize: 13, marginBottom: 4, fontWeight: 500 }}>{t('server:redis.authPassword')}</div>
                    <Input.Password
                        placeholder={t('server:redis.authPasswordPlaceholder')}
                        value={form.password || ''}
                        onChange={(e) => update({ password: e.target.value })}
                    />
                </div>
            </div>

            <div>
                <div style={{ fontSize: 13, marginBottom: 4, fontWeight: 500 }}>{t('server:redis.dbIndex')}</div>
                <InputNumber
                    min={0}
                    max={15}
                    style={{ width: '100%' }}
                    value={form.db ?? 0}
                    onChange={(val) => update({ db: val ?? 0 })}
                />
            </div>

            {/* 高级折叠面板 */}
            <Collapse
                ghost
                size="small"
                items={[
                    {
                        key: 'mode',
                        label: (
                            <Space size={6}>
                                <Network size={13} color={form.redisMode && form.redisMode !== 'single' ? 'var(--accent)' : undefined} />
                                <span style={{ fontSize: 13, fontWeight: form.redisMode && form.redisMode !== 'single' ? 600 : 400 }}>
                                    {t('server:redis.deploymentMode')}
                                </span>
                                {form.redisMode && form.redisMode !== 'single' && (
                                    <span style={{ fontSize: 11, color: 'var(--accent)', marginLeft: 4 }}>
                                        [{form.redisMode === 'sentinel' ? t('server:redis.modeSentinel') : t('server:redis.modeCluster')}]
                                    </span>
                                )}
                            </Space>
                        ),
                        children: (
                            <Space orientation="vertical" size={10} style={{ width: '100%' }}>
                                <div>
                                    <div style={{ fontSize: 12, marginBottom: 4, fontWeight: 500 }}>{t('server:redis.archMode')}</div>
                                    <Radio.Group
                                        size="small"
                                        value={form.redisMode || 'single'}
                                        onChange={(e) => update({ redisMode: e.target.value })}
                                        buttonStyle="solid"
                                    >
                                        <Radio.Button value="single">{t('server:redis.modeSingle')}</Radio.Button>
                                        <Radio.Button value="sentinel">{t('server:redis.modeSentinel')}</Radio.Button>
                                        <Radio.Button value="cluster">{t('server:redis.modeCluster')}</Radio.Button>
                                    </Radio.Group>
                                </div>

                                {form.redisMode === 'sentinel' && (
                                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10 }}>
                                        <div>
                                            <div style={{ fontSize: 12, marginBottom: 4, fontWeight: 500 }}>{t('server:redis.sentinelNodes')}</div>
                                            <Input
                                                placeholder={t('server:redis.sentinelNodesPlaceholder')}
                                                value={form.redisSentinels || ''}
                                                onChange={(e) => update({ redisSentinels: e.target.value })}
                                            />
                                        </div>
                                        <div>
                                            <div style={{ fontSize: 12, marginBottom: 4, fontWeight: 500 }}>{t('server:redis.masterName')}</div>
                                            <Input
                                                placeholder="mymaster"
                                                value={form.redisMasterName || 'mymaster'}
                                                onChange={(e) => update({ redisMasterName: e.target.value })}
                                            />
                                        </div>
                                    </div>
                                )}

                                {form.redisMode === 'cluster' && (
                                    <div>
                                        <div style={{ fontSize: 12, marginBottom: 4, fontWeight: 500 }}>{t('server:redis.clusterNodes')}</div>
                                        <Input
                                            placeholder={t('server:redis.clusterNodesPlaceholder')}
                                            value={form.redisClusterNodes || ''}
                                            onChange={(e) => update({ redisClusterNodes: e.target.value })}
                                        />
                                    </div>
                                )}
                            </Space>
                        ),
                    },
                    {
                        key: 'security',
                        label: (
                            <Space size={6}>
                                <ShieldCheck size={13} color={form.tls ? 'var(--accent)' : undefined} />
                                <span style={{ fontSize: 13, fontWeight: form.tls ? 600 : 400 }}>
                                    {t('server:redis.security')}
                                </span>
                                {form.tls && <span style={{ fontSize: 11, color: 'var(--accent)', marginLeft: 4 }}>[{t('server:redis.tlsActive')}]</span>}
                            </Space>
                        ),
                        children: (
                            <Space orientation="vertical" size={10} style={{ width: '100%' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <div style={{ fontSize: 13, fontWeight: 500 }}>{t('server:redis.tlsEnable')}</div>
                                        <div style={{ fontSize: 11.5, color: 'var(--text-dim)' }}>{t('server:redis.tlsDesc')}</div>
                                    </div>
                                    <Switch
                                        checked={!!form.tls}
                                        onChange={(checked) => update({ tls: checked })}
                                    />
                                </div>
                                <div>
                                    <div style={{ fontSize: 12, marginBottom: 4, fontWeight: 500 }}>{t('server:redis.serialization')}</div>
                                    <Select
                                        style={{ width: '100%' }}
                                        value={form.redisSerialization || 'none'}
                                        onChange={(val) => update({ redisSerialization: val })}
                                        options={[
                                            { label: t('server:redis.rawFormat'), value: 'none' },
                                            { label: t('server:redis.jsonFormat'), value: 'json' },
                                        ]}
                                    />
                                </div>
                            </Space>
                        ),
                    },
                    {
                        key: 'pool',
                        label: (
                            <Space size={6}>
                                <Zap size={13} />
                                <span style={{ fontSize: 13 }}>{t('server:redis.poolResilience')}</span>
                            </Space>
                        ),
                        children: (
                            <Space orientation="vertical" size={10} style={{ width: '100%' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                                    <div>
                                        <div style={{ fontSize: 12, marginBottom: 4 }}>{t('server:redis.poolSize')}</div>
                                        <InputNumber
                                            min={1}
                                            max={500}
                                            style={{ width: '100%' }}
                                            value={form.redisPoolSize ?? 10}
                                            onChange={(v) => update({ redisPoolSize: v ?? 10 })}
                                        />
                                    </div>
                                    <div>
                                        <div style={{ fontSize: 12, marginBottom: 4 }}>{t('server:redis.minIdle')}</div>
                                        <InputNumber
                                            min={0}
                                            max={100}
                                            style={{ width: '100%' }}
                                            value={form.redisMinIdleConns ?? 0}
                                            onChange={(v) => update({ redisMinIdleConns: v ?? 0 })}
                                        />
                                    </div>
                                    <div>
                                        <div style={{ fontSize: 12, marginBottom: 4 }}>{t('server:redis.maxIdle')}</div>
                                        <InputNumber
                                            min={0}
                                            max={200}
                                            style={{ width: '100%' }}
                                            value={form.redisMaxIdleConns ?? 10}
                                            onChange={(v) => update({ redisMaxIdleConns: v ?? 10 })}
                                        />
                                    </div>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                                    <div>
                                        <div style={{ fontSize: 12, marginBottom: 4 }}>{t('server:redis.dialTimeout')}</div>
                                        <InputNumber
                                            min={1}
                                            max={60}
                                            style={{ width: '100%' }}
                                            value={form.redisDialTimeout ?? 5}
                                            addonAfter={t('server:second')}
                                            onChange={(v) => update({ redisDialTimeout: v ?? 5 })}
                                        />
                                    </div>
                                    <div>
                                        <div style={{ fontSize: 12, marginBottom: 4 }}>{t('server:redis.readTimeout')}</div>
                                        <InputNumber
                                            min={1}
                                            max={60}
                                            style={{ width: '100%' }}
                                            value={form.redisReadTimeout ?? 3}
                                            addonAfter={t('server:second')}
                                            onChange={(v) => update({ redisReadTimeout: v ?? 3 })}
                                        />
                                    </div>
                                    <div>
                                        <div style={{ fontSize: 12, marginBottom: 4 }}>{t('server:redis.writeTimeout')}</div>
                                        <InputNumber
                                            min={1}
                                            max={60}
                                            style={{ width: '100%' }}
                                            value={form.redisWriteTimeout ?? 3}
                                            addonAfter={t('server:second')}
                                            onChange={(v) => update({ redisWriteTimeout: v ?? 3 })}
                                        />
                                    </div>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                                    <div>
                                        <div style={{ fontSize: 12, marginBottom: 4 }}>{t('server:redis.maxRetries')}</div>
                                        <InputNumber
                                            min={0}
                                            max={10}
                                            style={{ width: '100%' }}
                                            value={form.redisMaxRetries ?? 3}
                                            onChange={(v) => update({ redisMaxRetries: v ?? 3 })}
                                        />
                                    </div>
                                    <div>
                                        <div style={{ fontSize: 12, marginBottom: 4 }}>{t('server:redis.breakerThreshold')}</div>
                                        <InputNumber
                                            min={1}
                                            max={50}
                                            style={{ width: '100%' }}
                                            value={form.redisBreakerThreshold ?? 5}
                                            onChange={(v) => update({ redisBreakerThreshold: v ?? 5 })}
                                        />
                                    </div>
                                    <div>
                                        <div style={{ fontSize: 12, marginBottom: 4 }}>{t('server:redis.breakerCooldown')}</div>
                                        <InputNumber
                                            min={1}
                                            max={300}
                                            style={{ width: '100%' }}
                                            value={form.redisBreakerCooldown ?? 10}
                                            addonAfter={t('server:second')}
                                            onChange={(v) => update({ redisBreakerCooldown: v ?? 10 })}
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
