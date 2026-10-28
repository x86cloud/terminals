import React from 'react'
import { Input, InputNumber, Radio, Space, Switch, Collapse, Select, Button } from 'antd'
import { FileSearch, FolderOpen, Key, Network, ShieldCheck, Zap } from 'lucide-react'
import { useTranslation } from 'react-i18next'
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

    const handleParseMongoURI = async () => {
        const uri = form.mongoURI || form.mongoUri || ''
        if (!uri.trim()) {
            setError(t('server:mongo.uriRequired'))
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
            setTestResult?.({ success: true, message: t('server:mongo.parseUriSuccess', { count: info.hosts?.length || 0 }) })
        } catch (err) {
            setError(t('server:mongo.parseUriFail', { error: errorMessage(err) }))
        }
    }

    return (
        <Space orientation="vertical" size={14} style={{ width: '100%' }}>
            <BasicFields form={form} update={update} groups={groups} />

            <div>
                <div style={{ fontSize: 13, marginBottom: 4, fontWeight: 500 }}>{t('server:mongo.accessMode')}</div>
                <Radio.Group
                    value={form.mongoAuthMode || 'scram'}
                    onChange={(e) => update({ mongoAuthMode: e.target.value as any })}
                    buttonStyle="solid"
                >
                    <Radio.Button value="scram">{t('server:mongo.modeScram')}</Radio.Button>
                    <Radio.Button value="uri">{t('server:mongo.modeUri')}</Radio.Button>
                    <Radio.Button value="none">{t('server:mongo.modeNone')}</Radio.Button>
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
                            {t('server:mongo.parseFill')}
                        </Button>
                    </Space.Compact>
                </div>
            ) : (
                <>
                    {/* 标准 Host + Port */}
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
                                onChange={(val) => update({ port: val || 27017 })}
                            />
                        </div>
                    </div>

                    {form.mongoAuthMode === 'scram' && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <div>
                                <div style={{ fontSize: 13, marginBottom: 4, fontWeight: 500 }}>{t('server:username')}</div>
                                <Input
                                    placeholder={t('server:usernamePlaceholder')}
                                    value={form.username || ''}
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
                    )}

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <div>
                            <div style={{ fontSize: 13, marginBottom: 4, fontWeight: 500 }}>{t('server:database')}</div>
                            <Input
                                placeholder="test"
                                value={form.mongoDatabase || ''}
                                onChange={(e) => update({ mongoDatabase: e.target.value })}
                            />
                        </div>
                        <div>
                            <div style={{ fontSize: 13, marginBottom: 4, fontWeight: 500 }}>{t('server:mongo.authSource')}</div>
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
                                    {t('server:mongo.tlsTitle')}
                                </span>
                                {form.mongoTlsEnabled && <span style={{ fontSize: 11, color: 'var(--accent)', marginLeft: 4 }}>[{t('server:enabled')}]</span>}
                            </Space>
                        ),
                        children: (
                            <Space orientation="vertical" size={10} style={{ width: '100%' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <div style={{ fontSize: 13, fontWeight: 500 }}>{t('server:mongo.enableTls')}</div>
                                        <div style={{ fontSize: 11.5, color: 'var(--text-dim)' }}>{t('server:mongo.enableTlsDesc')}</div>
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
                                                <div style={{ fontSize: 13 }}>{t('server:mongo.insecure')}</div>
                                                <div style={{ fontSize: 11.5, color: 'var(--text-dim)' }}>{t('server:mongo.insecureDesc')}</div>
                                            </div>
                                            <Switch
                                                checked={!!form.mongoTlsInsecure}
                                                onChange={(checked) => update({ mongoTlsInsecure: checked })}
                                            />
                                        </div>

                                        <div>
                                            <div style={{ fontSize: 12, marginBottom: 4, fontWeight: 500 }}>{t('server:mongo.caCert')}</div>
                                            <Space.Compact style={{ width: '100%' }}>
                                                <Input
                                                    placeholder={t('server:mongo.caCertPlaceholder')}
                                                    value={form.mongoTlsCaCert || ''}
                                                    onChange={(e) => update({ mongoTlsCaCert: e.target.value })}
                                                />
                                                <Button icon={<FolderOpen size={14} />} onClick={() => handlePickCert('mongoTlsCaCert')}>
                                                    {t('server:browse')}
                                                </Button>
                                            </Space.Compact>
                                        </div>

                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                            <div>
                                                <div style={{ fontSize: 12, marginBottom: 4, fontWeight: 500 }}>{t('server:mongo.clientCert')}</div>
                                                <Space.Compact style={{ width: '100%' }}>
                                                    <Input
                                                        placeholder={t('server:mongo.clientCertPlaceholder')}
                                                        value={form.mongoTlsClientCert || ''}
                                                        onChange={(e) => update({ mongoTlsClientCert: e.target.value })}
                                                    />
                                                    <Button icon={<FolderOpen size={14} />} onClick={() => handlePickCert('mongoTlsClientCert')}>
                                                        {t('server:browse')}
                                                    </Button>
                                                </Space.Compact>
                                            </div>
                                            <div>
                                                <div style={{ fontSize: 12, marginBottom: 4, fontWeight: 500 }}>{t('server:mongo.clientKey')}</div>
                                                <Space.Compact style={{ width: '100%' }}>
                                                    <Input
                                                        placeholder={t('server:mongo.clientKeyPlaceholder')}
                                                        value={form.mongoTlsClientKey || ''}
                                                        onChange={(e) => update({ mongoTlsClientKey: e.target.value })}
                                                    />
                                                    <Button icon={<Key size={14} />} onClick={() => handlePickCert('mongoTlsClientKey')}>
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
                        key: 'replica',
                        label: (
                            <Space size={6}>
                                <Network size={13} color={form.mongoReplicaSet ? 'var(--accent)' : undefined} />
                                <span style={{ fontSize: 13, fontWeight: form.mongoReplicaSet ? 600 : 400 }}>
                                    {t('server:mongo.replicaTitle')}
                                </span>
                                {form.mongoReplicaSet && <span style={{ fontSize: 11, color: 'var(--accent)', marginLeft: 4 }}>[{form.mongoReplicaSet}]</span>}
                            </Space>
                        ),
                        children: (
                            <Space orientation="vertical" size={10} style={{ width: '100%' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <div style={{ fontSize: 13, fontWeight: 500 }}>{t('server:mongo.useSrv')}</div>
                                        <div style={{ fontSize: 11.5, color: 'var(--text-dim)' }}>{t('server:mongo.useSrvDesc')}</div>
                                    </div>
                                    <Switch
                                        checked={!!form.mongoSrv}
                                        onChange={(checked) => update({ mongoSrv: checked })}
                                    />
                                </div>

                                <div>
                                    <div style={{ fontSize: 12, marginBottom: 4, fontWeight: 500 }}>{t('server:mongo.seeds')}</div>
                                    <Input
                                        placeholder="node1:27017,node2:27017,node3:27017"
                                        value={form.mongoHosts || ''}
                                        onChange={(e) => update({ mongoHosts: e.target.value })}
                                    />
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                    <div>
                                        <div style={{ fontSize: 12, marginBottom: 4, fontWeight: 500 }}>{t('server:mongo.replicaSetName')}</div>
                                        <Input
                                            placeholder="rs0"
                                            value={form.mongoReplicaSet || ''}
                                            onChange={(e) => update({ mongoReplicaSet: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <div style={{ fontSize: 12, marginBottom: 4, fontWeight: 500 }}>{t('server:mongo.authMech')}</div>
                                        <Select
                                            style={{ width: '100%' }}
                                            value={form.mongoAuthMech || 'SCRAM-SHA-256'}
                                            onChange={(v) => update({ mongoAuthMech: v })}
                                            options={[
                                                { label: t('server:mongo.scramSha256Rec', 'SCRAM-SHA-256 (推荐)'), value: 'SCRAM-SHA-256' },
                                                { label: 'SCRAM-SHA-1', value: 'SCRAM-SHA-1' },
                                                { label: 'MONGODB-X509', value: 'MONGODB-X509' },
                                                { label: 'none', value: 'none' },
                                            ]}
                                        />
                                    </div>
                                </div>

                                <div>
                                    <div style={{ fontSize: 12, marginBottom: 4, fontWeight: 500 }}>{t('server:mongo.readPreference')}</div>
                                    <Select
                                        style={{ width: '100%' }}
                                        value={form.mongoReadPreference || 'primary'}
                                        onChange={(v) => update({ mongoReadPreference: v })}
                                        options={[
                                            { label: 'Primary', value: 'primary' },
                                            { label: 'PrimaryPreferred', value: 'primaryPreferred' },
                                            { label: 'Secondary', value: 'secondary' },
                                            { label: 'SecondaryPreferred', value: 'secondaryPreferred' },
                                            { label: 'Nearest', value: 'nearest' },
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
                                <span style={{ fontSize: 13 }}>{t('server:mongo.poolTimingsTitle')}</span>
                            </Space>
                        ),
                        children: (
                            <Space orientation="vertical" size={10} style={{ width: '100%' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                    <div>
                                        <div style={{ fontSize: 12, marginBottom: 4 }}>{t('server:mongo.maxPoolSize')}</div>
                                        <InputNumber
                                            min={1}
                                            max={1000}
                                            style={{ width: '100%' }}
                                            value={form.mongoMaxPoolSize ?? 100}
                                            onChange={(v) => update({ mongoMaxPoolSize: v ?? 100 })}
                                        />
                                    </div>
                                    <div>
                                        <div style={{ fontSize: 12, marginBottom: 4 }}>{t('server:mongo.minPoolSize')}</div>
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
                                        <div style={{ fontSize: 12, marginBottom: 4 }}>{t('server:mongo.connectTimeout')}</div>
                                        <InputNumber
                                            min={1}
                                            max={60}
                                            style={{ width: '100%' }}
                                            value={form.mongoConnectTimeout ?? 10}
                                            addonAfter={t('server:second')}
                                            onChange={(v) => update({ mongoConnectTimeout: v ?? 10 })}
                                        />
                                    </div>
                                    <div>
                                        <div style={{ fontSize: 12, marginBottom: 4 }}>{t('server:mongo.serverSelectTimeout')}</div>
                                        <InputNumber
                                            min={1}
                                            max={60}
                                            style={{ width: '100%' }}
                                            value={form.mongoServerSelectTimeout ?? 10}
                                            addonAfter={t('server:second')}
                                            onChange={(v) => update({ mongoServerSelectTimeout: v ?? 10 })}
                                        />
                                    </div>
                                    <div>
                                        <div style={{ fontSize: 12, marginBottom: 4 }}>{t('server:mongo.socketTimeout')}</div>
                                        <InputNumber
                                            min={0}
                                            max={300}
                                            style={{ width: '100%' }}
                                            value={form.mongoSocketTimeout ?? 30}
                                            addonAfter={t('server:second')}
                                            onChange={(v) => update({ mongoSocketTimeout: v ?? 30 })}
                                        />
                                    </div>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                    <div>
                                        <div style={{ fontSize: 12, marginBottom: 4 }}>{t('server:mongo.compressors')}</div>
                                        <Input
                                            placeholder="snappy,zlib"
                                            value={form.mongoCompressors || ''}
                                            onChange={(e) => update({ mongoCompressors: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <div style={{ fontSize: 12, marginBottom: 4 }}>{t('server:mongo.appName')}</div>
                                        <Input
                                            placeholder="xTerminal"
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
