import React from 'react'
import { Input, InputNumber, Radio, Space, Switch, Collapse, Select, Button } from 'antd'
import { FileSearch, FolderOpen, Key, Network, ShieldCheck, Zap } from 'lucide-react'
import { API } from '@/api'
import { errorMessage } from '@/utils'
import { ServerConfig } from '@/types'
import { BasicFields } from './BasicFields'
import { ServerFormProps } from './types'

export const MongoForm: React.FC<ServerFormProps> = ({
    form,
    update,
    groups,
    setError,
    setTestResult,
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

    const handleParseMongoURI = async () => {
        const uri = form.mongoURI || form.mongoUri || ''
        if (!uri.trim()) {
            setError('请先输入 MongoDB 连接字符串 (URI)')
            return
        }
        try {
            const info = await API.mongoParseURI(uri)
            const patch: Partial<ServerConfig> = {
                username: info.username || form.username,
                password: info.password || form.password,
                mongoDatabase: info.database || form.mongoDatabase,
                mongoAuthSource: info.authSource || form.mongoAuthSource || 'admin',
                mongoReplicaSet: info.replicaSet || form.mongoReplicaSet,
                mongoTlsEnabled: info.tls,
                mongoSrv: info.srv,
            }
            if (info.authMech) {
                patch.mongoAuthMech = info.authMech
            }
            if (info.hosts && info.hosts.length > 0) {
                if (info.hosts.length === 1 && !info.srv) {
                    const [h, p] = info.hosts[0].split(':')
                    patch.host = h
                    if (p) patch.port = Number(p) || 27017
                } else {
                    patch.mongoHosts = info.hosts.join(',')
                    patch.host = info.hosts[0].split(':')[0]
                }
            }
            update(patch)
            setTestResult({ success: true, message: `URI 解析成功！已提取 ${info.hosts?.length || 0} 个节点配置` })
        } catch (err) {
            setError('URI 解析失败: ' + errorMessage(err))
        }
    }

    return (
        <Space orientation="vertical" size={14} style={{ width: '100%' }}>
            <BasicFields form={form} update={update} groups={groups} />

            <div>
                <div style={{ fontSize: 13, marginBottom: 4, fontWeight: 500 }}>接入方式</div>
                <Radio.Group
                    value={form.mongoAuthMode || 'scram'}
                    onChange={(e) => update({ mongoAuthMode: e.target.value as any })}
                    buttonStyle="solid"
                >
                    <Radio.Button value="scram">标准认证 (Host/Port/User)</Radio.Button>
                    <Radio.Button value="uri">连接字符串 (URI)</Radio.Button>
                    <Radio.Button value="none">无密码免认证</Radio.Button>
                </Radio.Group>
            </div>

            {form.mongoAuthMode === 'uri' ? (
                <div>
                    <div style={{ fontSize: 13, marginBottom: 4, fontWeight: 500 }}>MongoDB URI</div>
                    <Space.Compact style={{ width: '100%' }}>
                        <Input
                            placeholder="mongodb://user:pass@host:27017/dbname?authSource=admin"
                            value={form.mongoURI || form.mongoUri || ''}
                            onChange={(e) => update({ mongoURI: e.target.value, mongoUri: e.target.value })}
                        />
                        <Button icon={<FileSearch size={14} />} onClick={handleParseMongoURI}>
                            解析并回填
                        </Button>
                    </Space.Compact>
                </div>
            ) : (
                <>
                    {/* 标准 Host + Port */}
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
                                onChange={(val) => update({ port: val || 27017 })}
                            />
                        </div>
                    </div>

                    {form.mongoAuthMode === 'scram' && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <div>
                                <div style={{ fontSize: 13, marginBottom: 4, fontWeight: 500 }}>用户名</div>
                                <Input
                                    placeholder="admin / root"
                                    value={form.username || ''}
                                    onChange={(e) => update({ username: e.target.value })}
                                />
                            </div>
                            <div>
                                <div style={{ fontSize: 13, marginBottom: 4, fontWeight: 500 }}>密码</div>
                                <Input.Password
                                    placeholder="请输入密码"
                                    value={form.password || ''}
                                    onChange={(e) => update({ password: e.target.value })}
                                />
                            </div>
                        </div>
                    )}

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <div>
                            <div style={{ fontSize: 13, marginBottom: 4, fontWeight: 500 }}>默认数据库 (Database)</div>
                            <Input
                                placeholder="如: test / admin"
                                value={form.mongoDatabase || ''}
                                onChange={(e) => update({ mongoDatabase: e.target.value })}
                            />
                        </div>
                        <div>
                            <div style={{ fontSize: 13, marginBottom: 4, fontWeight: 500 }}>认证数据库 (Auth Source)</div>
                            <Input
                                placeholder="admin"
                                value={form.mongoAuthSource || 'admin'}
                                onChange={(e) => update({ mongoAuthSource: e.target.value })}
                            />
                        </div>
                    </div>
                </>
            )}

            {/* 高级折叠面板 */}
            <Collapse
                ghost
                size="small"
                items={[
                    {
                        key: 'tls',
                        label: (
                            <Space size={6}>
                                <ShieldCheck size={13} color={form.mongoTlsEnabled ? 'var(--accent)' : undefined} />
                                <span style={{ fontSize: 13, fontWeight: form.mongoTlsEnabled ? 600 : 400 }}>
                                    TLS / SSL 与 X.509 证书认证 (TLS & Mutual Auth)
                                </span>
                                {form.mongoTlsEnabled && <span style={{ fontSize: 11, color: 'var(--accent)', marginLeft: 4 }}>[已启用]</span>}
                            </Space>
                        ),
                        children: (
                            <Space orientation="vertical" size={10} style={{ width: '100%' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <div style={{ fontSize: 13, fontWeight: 500 }}>启用 TLS / SSL 加密连接</div>
                                        <div style={{ fontSize: 11.5, color: 'var(--text-dim)' }}>加密网络流量并支持 X.509 客户端证书鉴权</div>
                                    </div>
                                    <Switch
                                        checked={!!form.mongoTlsEnabled}
                                        onChange={(checked) => update({ mongoTlsEnabled: checked })}
                                    />
                                </div>

                                {form.mongoTlsEnabled && (
                                    <>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 2 }}>
                                            <div>
                                                <div style={{ fontSize: 13 }}>跳过服务端证书校验 (Insecure)</div>
                                                <div style={{ fontSize: 11.5, color: 'var(--text-dim)' }}>自签名证书开发测试时可开启</div>
                                            </div>
                                            <Switch
                                                checked={!!form.mongoTlsInsecure}
                                                onChange={(checked) => update({ mongoTlsInsecure: checked })}
                                            />
                                        </div>

                                        <div>
                                            <div style={{ fontSize: 12, marginBottom: 4, fontWeight: 500 }}>CA 根证书 (CA Certificate)</div>
                                            <Space.Compact style={{ width: '100%' }}>
                                                <Input
                                                    placeholder="CA 证书文件路径 (.crt/.pem) 或留空"
                                                    value={form.mongoTlsCaCert || ''}
                                                    onChange={(e) => update({ mongoTlsCaCert: e.target.value })}
                                                />
                                                <Button icon={<FolderOpen size={14} />} onClick={() => handlePickCert('mongoTlsCaCert')}>
                                                    浏览
                                                </Button>
                                            </Space.Compact>
                                        </div>

                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                            <div>
                                                <div style={{ fontSize: 12, marginBottom: 4, fontWeight: 500 }}>客户端证书 (Client Cert)</div>
                                                <Space.Compact style={{ width: '100%' }}>
                                                    <Input
                                                        placeholder="客户端证书 (.crt/.pem)"
                                                        value={form.mongoTlsClientCert || ''}
                                                        onChange={(e) => update({ mongoTlsClientCert: e.target.value })}
                                                    />
                                                    <Button icon={<FolderOpen size={14} />} onClick={() => handlePickCert('mongoTlsClientCert')}>
                                                        浏览
                                                    </Button>
                                                </Space.Compact>
                                            </div>
                                            <div>
                                                <div style={{ fontSize: 12, marginBottom: 4, fontWeight: 500 }}>客户端私钥 (Client Key)</div>
                                                <Space.Compact style={{ width: '100%' }}>
                                                    <Input
                                                        placeholder="私钥文件 (.key/.pem)"
                                                        value={form.mongoTlsClientKey || ''}
                                                        onChange={(e) => update({ mongoTlsClientKey: e.target.value })}
                                                    />
                                                    <Button icon={<Key size={14} />} onClick={() => handlePickCert('mongoTlsClientKey')}>
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
                        key: 'replica',
                        label: (
                            <Space size={6}>
                                <Network size={13} color={form.mongoReplicaSet ? 'var(--accent)' : undefined} />
                                <span style={{ fontSize: 13, fontWeight: form.mongoReplicaSet ? 600 : 400 }}>
                                    副本集、读偏好与鉴权协议 (ReplicaSet & Read Preference)
                                </span>
                                {form.mongoReplicaSet && <span style={{ fontSize: 11, color: 'var(--accent)', marginLeft: 4 }}>[{form.mongoReplicaSet}]</span>}
                            </Space>
                        ),
                        children: (
                            <Space orientation="vertical" size={10} style={{ width: '100%' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <div style={{ fontSize: 13, fontWeight: 500 }}>使用 SRV 协议 (mongodb+srv://)</div>
                                        <div style={{ fontSize: 11.5, color: 'var(--text-dim)' }}>适用于 Atlas 等托管集群 DNS 自动寻址</div>
                                    </div>
                                    <Switch
                                        checked={!!form.mongoSrv}
                                        onChange={(checked) => update({ mongoSrv: checked })}
                                    />
                                </div>

                                <div>
                                    <div style={{ fontSize: 12, marginBottom: 4, fontWeight: 500 }}>多节点种子列表 (Seeds, 逗号分隔)</div>
                                    <Input
                                        placeholder="node1:27017,node2:27017,node3:27017 (多节点集群填此处)"
                                        value={form.mongoHosts || ''}
                                        onChange={(e) => update({ mongoHosts: e.target.value })}
                                    />
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                    <div>
                                        <div style={{ fontSize: 12, marginBottom: 4, fontWeight: 500 }}>副本集名称 (ReplicaSet)</div>
                                        <Input
                                            placeholder="如: rs0"
                                            value={form.mongoReplicaSet || ''}
                                            onChange={(e) => update({ mongoReplicaSet: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <div style={{ fontSize: 12, marginBottom: 4, fontWeight: 500 }}>认证机制 (Auth Mechanism)</div>
                                        <Select
                                            style={{ width: '100%' }}
                                            value={form.mongoAuthMech || 'SCRAM-SHA-256'}
                                            onChange={(v) => update({ mongoAuthMech: v })}
                                            options={[
                                                { label: 'SCRAM-SHA-256 (推荐)', value: 'SCRAM-SHA-256' },
                                                { label: 'SCRAM-SHA-1', value: 'SCRAM-SHA-1' },
                                                { label: 'MONGODB-X509', value: 'MONGODB-X509' },
                                                { label: '无认证 (none)', value: 'none' },
                                            ]}
                                        />
                                    </div>
                                </div>

                                <div>
                                    <div style={{ fontSize: 12, marginBottom: 4, fontWeight: 500 }}>读偏好策略 (Read Preference)</div>
                                    <Select
                                        style={{ width: '100%' }}
                                        value={form.mongoReadPreference || 'primary'}
                                        onChange={(v) => update({ mongoReadPreference: v })}
                                        options={[
                                            { label: 'Primary (仅主节点 / 默认强一致性)', value: 'primary' },
                                            { label: 'PrimaryPreferred (主节点优先，不可用时读从节点)', value: 'primaryPreferred' },
                                            { label: 'Secondary (仅从节点 / 适合重查询分析)', value: 'secondary' },
                                            { label: 'SecondaryPreferred (从节点优先，不可用时读主节点)', value: 'secondaryPreferred' },
                                            { label: 'Nearest (读延迟最低的就近节点)', value: 'nearest' },
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
                                <span style={{ fontSize: 13 }}>连接池、超时与网络压缩 (Pool & Timings)</span>
                            </Space>
                        ),
                        children: (
                            <Space orientation="vertical" size={10} style={{ width: '100%' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                    <div>
                                        <div style={{ fontSize: 12, marginBottom: 4 }}>最大连接池大小</div>
                                        <InputNumber
                                            min={1}
                                            max={1000}
                                            style={{ width: '100%' }}
                                            value={form.mongoMaxPoolSize ?? 100}
                                            onChange={(v) => update({ mongoMaxPoolSize: v ?? 100 })}
                                        />
                                    </div>
                                    <div>
                                        <div style={{ fontSize: 12, marginBottom: 4 }}>最小连接池大小</div>
                                        <InputNumber
                                            min={0}
                                            max={100}
                                            style={{ width: '100%' }}
                                            value={form.mongoMinPoolSize ?? 0}
                                            onChange={(v) => update({ mongoMinPoolSize: v ?? 0 })}
                                        />
                                    </div>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                                    <div>
                                        <div style={{ fontSize: 12, marginBottom: 4 }}>连接超时</div>
                                        <InputNumber
                                            min={1}
                                            max={60}
                                            style={{ width: '100%' }}
                                            value={form.mongoConnectTimeout ?? 10}
                                            addonAfter="秒"
                                            onChange={(v) => update({ mongoConnectTimeout: v ?? 10 })}
                                        />
                                    </div>
                                    <div>
                                        <div style={{ fontSize: 12, marginBottom: 4 }}>选服超时</div>
                                        <InputNumber
                                            min={1}
                                            max={60}
                                            style={{ width: '100%' }}
                                            value={form.mongoServerSelectTimeout ?? 10}
                                            addonAfter="秒"
                                            onChange={(v) => update({ mongoServerSelectTimeout: v ?? 10 })}
                                        />
                                    </div>
                                    <div>
                                        <div style={{ fontSize: 12, marginBottom: 4 }}>操作超时</div>
                                        <InputNumber
                                            min={0}
                                            max={300}
                                            style={{ width: '100%' }}
                                            value={form.mongoSocketTimeout ?? 30}
                                            addonAfter="秒"
                                            onChange={(v) => update({ mongoSocketTimeout: v ?? 30 })}
                                        />
                                    </div>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                    <div>
                                        <div style={{ fontSize: 12, marginBottom: 4 }}>网络压缩算法 (snappy,zlib,zstd)</div>
                                        <Input
                                            placeholder="默认无压缩，如: snappy,zlib"
                                            value={form.mongoCompressors || ''}
                                            onChange={(e) => update({ mongoCompressors: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <div style={{ fontSize: 12, marginBottom: 4 }}>上报应用名称 (App Name)</div>
                                        <Input
                                            placeholder="xClient"
                                            value={form.mongoAppName || ''}
                                            onChange={(e) => update({ mongoAppName: e.target.value })}
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
