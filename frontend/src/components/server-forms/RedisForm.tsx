import React from 'react'
import { Input, InputNumber, Radio, Space, Switch, Collapse, Select } from 'antd'
import { Network, ShieldCheck, Zap } from 'lucide-react'
import { BasicFields } from './BasicFields'
import { ServerFormProps } from './types'

export const RedisForm: React.FC<ServerFormProps> = ({
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
                        onChange={(val) => update({ port: val || 6379 })}
                    />
                </div>
            </div>

            {/* ACL 用户名与密码 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                    <div style={{ fontSize: 13, marginBottom: 4, fontWeight: 500 }}>用户名 (ACL Username, 可选)</div>
                    <Input
                        placeholder="Redis 6+ ACL 用户名，默认留空"
                        value={form.redisUsername || ''}
                        onChange={(e) => update({ redisUsername: e.target.value })}
                    />
                </div>
                <div>
                    <div style={{ fontSize: 13, marginBottom: 4, fontWeight: 500 }}>访问密码 (AUTH)</div>
                    <Input.Password
                        placeholder="无密码可留空"
                        value={form.password || ''}
                        onChange={(e) => update({ password: e.target.value })}
                    />
                </div>
            </div>

            <div>
                <div style={{ fontSize: 13, marginBottom: 4, fontWeight: 500 }}>默认数据库 (DB Index)</div>
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
                                    拓扑与部署模式 (Deployment Mode)
                                </span>
                                {form.redisMode && form.redisMode !== 'single' && (
                                    <span style={{ fontSize: 11, color: 'var(--accent)', marginLeft: 4 }}>
                                        [{form.redisMode === 'sentinel' ? '哨兵模式' : '集群模式'}]
                                    </span>
                                )}
                            </Space>
                        ),
                        children: (
                            <Space orientation="vertical" size={10} style={{ width: '100%' }}>
                                <div>
                                    <div style={{ fontSize: 12, marginBottom: 4, fontWeight: 500 }}>部署架构模式</div>
                                    <Radio.Group
                                        size="small"
                                        value={form.redisMode || 'single'}
                                        onChange={(e) => update({ redisMode: e.target.value })}
                                        buttonStyle="solid"
                                    >
                                        <Radio.Button value="single">单机模式 (Single)</Radio.Button>
                                        <Radio.Button value="sentinel">哨兵模式 (Sentinel)</Radio.Button>
                                        <Radio.Button value="cluster">集群模式 (Cluster)</Radio.Button>
                                    </Radio.Group>
                                </div>

                                {form.redisMode === 'sentinel' && (
                                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10 }}>
                                        <div>
                                            <div style={{ fontSize: 12, marginBottom: 4, fontWeight: 500 }}>哨兵节点地址 (逗号分隔)</div>
                                            <Input
                                                placeholder="127.0.0.1:26379,127.0.0.1:26380"
                                                value={form.redisSentinels || ''}
                                                onChange={(e) => update({ redisSentinels: e.target.value })}
                                            />
                                        </div>
                                        <div>
                                            <div style={{ fontSize: 12, marginBottom: 4, fontWeight: 500 }}>Master 名称</div>
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
                                        <div style={{ fontSize: 12, marginBottom: 4, fontWeight: 500 }}>集群节点地址 (逗号分隔)</div>
                                        <Input
                                            placeholder="127.0.0.1:7000,127.0.0.1:7001,127.0.0.1:7002"
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
                                    安全与数据序列化 (TLS & Serialization)
                                </span>
                                {form.tls && <span style={{ fontSize: 11, color: 'var(--accent)', marginLeft: 4 }}>[已启用 TLS]</span>}
                            </Space>
                        ),
                        children: (
                            <Space orientation="vertical" size={10} style={{ width: '100%' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                    <div style={{ fontSize: 13, fontWeight: 500 }}>启用 TLS / SSL 加密传输</div>
                                    <div style={{ fontSize: 11.5, color: 'var(--text-dim)' }}>支持加密通道连接云端或私有 Redis</div>
                                </div>
                                <Switch
                                    checked={!!form.tls}
                                    onChange={(checked) => update({ tls: checked })}
                                />
                                </div>
                                <div>
                                    <div style={{ fontSize: 12, marginBottom: 4, fontWeight: 500 }}>数据展示与自动序列化</div>
                                    <Select
                                        style={{ width: '100%' }}
                                        value={form.redisSerialization || 'none'}
                                        onChange={(val) => update({ redisSerialization: val })}
                                        options={[
                                            { label: '无 (原生字符串/二进制)', value: 'none' },
                                            { label: 'JSON 自动格式化', value: 'json' },
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
                                <span style={{ fontSize: 13 }}>连接池、超时与熔断控制 (Pool & Resilience)</span>
                            </Space>
                        ),
                        children: (
                            <Space orientation="vertical" size={10} style={{ width: '100%' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                                    <div>
                                        <div style={{ fontSize: 12, marginBottom: 4 }}>连接池大小</div>
                                        <InputNumber
                                            min={1}
                                            max={500}
                                            style={{ width: '100%' }}
                                            value={form.redisPoolSize ?? 10}
                                            onChange={(v) => update({ redisPoolSize: v ?? 10 })}
                                        />
                                    </div>
                                    <div>
                                        <div style={{ fontSize: 12, marginBottom: 4 }}>最小空闲连接</div>
                                        <InputNumber
                                            min={0}
                                            max={100}
                                            style={{ width: '100%' }}
                                            value={form.redisMinIdleConns ?? 0}
                                            onChange={(v) => update({ redisMinIdleConns: v ?? 0 })}
                                        />
                                    </div>
                                    <div>
                                        <div style={{ fontSize: 12, marginBottom: 4 }}>最大空闲连接</div>
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
                                        <div style={{ fontSize: 12, marginBottom: 4 }}>拨号超时</div>
                                        <InputNumber
                                            min={1}
                                            max={60}
                                            style={{ width: '100%' }}
                                            value={form.redisDialTimeout ?? 5}
                                            addonAfter="秒"
                                            onChange={(v) => update({ redisDialTimeout: v ?? 5 })}
                                        />
                                    </div>
                                    <div>
                                        <div style={{ fontSize: 12, marginBottom: 4 }}>读超时</div>
                                        <InputNumber
                                            min={1}
                                            max={60}
                                            style={{ width: '100%' }}
                                            value={form.redisReadTimeout ?? 3}
                                            addonAfter="秒"
                                            onChange={(v) => update({ redisReadTimeout: v ?? 3 })}
                                        />
                                    </div>
                                    <div>
                                        <div style={{ fontSize: 12, marginBottom: 4 }}>写超时</div>
                                        <InputNumber
                                            min={1}
                                            max={60}
                                            style={{ width: '100%' }}
                                            value={form.redisWriteTimeout ?? 3}
                                            addonAfter="秒"
                                            onChange={(v) => update({ redisWriteTimeout: v ?? 3 })}
                                        />
                                    </div>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                                    <div>
                                        <div style={{ fontSize: 12, marginBottom: 4 }}>最大重试次数</div>
                                        <InputNumber
                                            min={0}
                                            max={10}
                                            style={{ width: '100%' }}
                                            value={form.redisMaxRetries ?? 3}
                                            onChange={(v) => update({ redisMaxRetries: v ?? 3 })}
                                        />
                                    </div>
                                    <div>
                                        <div style={{ fontSize: 12, marginBottom: 4 }}>熔断失败阈值</div>
                                        <InputNumber
                                            min={1}
                                            max={50}
                                            style={{ width: '100%' }}
                                            value={form.redisBreakerThreshold ?? 5}
                                            onChange={(v) => update({ redisBreakerThreshold: v ?? 5 })}
                                        />
                                    </div>
                                    <div>
                                        <div style={{ fontSize: 12, marginBottom: 4 }}>熔断冷却时间</div>
                                        <InputNumber
                                            min={1}
                                            max={300}
                                            style={{ width: '100%' }}
                                            value={form.redisBreakerCooldown ?? 10}
                                            addonAfter="秒"
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
