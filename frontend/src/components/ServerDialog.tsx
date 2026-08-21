import React, { useEffect, useState } from 'react'
import {
    Modal as AntdModal,
    Input,
    InputNumber,
    Select,
    Radio,
    Button,
    Space,
    Switch,
    Tabs,
    Alert,
    Tooltip,
    Collapse,
} from 'antd'
import {
    Terminal,
    Database,
    HardDrive,
    Radio as MqttIcon,
    Layers,
    FolderOpen,
    Key,
    Shield,
    Sliders,
    Server,
    ExternalLink,
    Dices,
    ShieldCheck,
    Cpu,
    Scroll,
    Network,
    Zap,
    FileSearch,
    Workflow,
} from 'lucide-react'
import { API } from '@/api'
import ClientIcon from '@/components/ClientIcon'
import { emptyServer, ServerConfig, ServerGroup, ConnType } from '@/types'
import { errorMessage } from '@/utils'

interface Props {
    open: boolean
    initial: ServerConfig | null
    groups: ServerGroup[]
    onClose: () => void
    onSaved: (cfg: ServerConfig) => void
    onSaveAndConnect: (cfg: ServerConfig) => void
}

export default function ServerDialog({
    open,
    initial,
    groups,
    onClose,
    onSaved,
    onSaveAndConnect,
}: Props) {
    const [form, setForm] = useState<ServerConfig>(emptyServer())
    const [error, setError] = useState('')
    const [busy, setBusy] = useState(false)
    const [testResult, setTestResult] = useState<{ success?: boolean; message?: string } | null>(null)

    useEffect(() => {
        if (open) {
            const base = initial ? { ...initial } : emptyServer()
            if (!base.type) base.type = 'ssh'
            if (!base.port) {
                base.port =
                    base.type === 'redis'
                        ? 6379
                        : base.type === 'mysql'
                            ? 3306
                            : base.type === 'mqtt'
                                ? 1883
                                : base.type === 'mongo'
                                    ? 27017
                                    : base.type === 'sqlite'
                                        ? 0
                                        : 22
            }
            if (!base.username && (base.type === 'ssh' || base.type === 'mysql')) base.username = 'root'
            setForm(base)
            setError('')
            setTestResult(null)
        }
    }, [open, initial])

    const update = (patch: Partial<ServerConfig>) => {
        setForm((prev) => ({ ...prev, ...patch }))
        setError('')
        setTestResult(null)
    }

    const switchType = (t: ConnType) => {
        const defaultPortMap: Record<ConnType, number> = {
            ssh: 22,
            redis: 6379,
            mysql: 3306,
            mqtt: 1883,
            mongo: 27017,
            sqlite: 0,
        }
        const defaultPort = defaultPortMap[t] || 0
        const isCurrentDefault = !form.port || Object.values(defaultPortMap).includes(form.port)

        update({
            type: t,
            port: isCurrentDefault ? defaultPort : form.port,
            username: t === 'redis' || t === 'mqtt' || t === 'sqlite' ? '' : form.username || 'root',
        })
    }

    const validateForm = (cfg: ServerConfig): string | null => {
        if (cfg.type === 'sqlite') {
            if (!cfg.sqlitePath?.trim()) {
                return '请选择或输入 SQLite 数据库文件路径'
            }
            return null
        }

        if (cfg.type === 'mongo' && cfg.mongoAuthMode === 'uri') {
            if (!cfg.mongoURI?.trim()) {
                return '请输入 MongoDB 连接 URI (如 mongodb://localhost:27017)'
            }
            return null
        }

        if (!cfg.host?.trim()) {
            return '请输入服务器主机地址 (Host)'
        }

        const port = Number(cfg.port)
        if (!port || isNaN(port) || port < 1 || port > 65535) {
            return '请输入有效的端口号 (1 - 65535)'
        }

        if (cfg.type === 'ssh' && cfg.authType === 'key') {
            if (!cfg.privateKey?.trim()) {
                return '请选择或输入 SSH 私钥文件路径或 PEM 内容'
            }
        }

        return null
    }

    const save = async (connect: boolean) => {
        const valErr = validateForm(form)
        if (valErr) {
            setError(valErr)
            return
        }

        setBusy(true)
        setError('')
        try {
            const saved = await API.saveServer(form)
            if (connect) onSaveAndConnect(saved)
            else onSaved(saved)
            onClose()
        } catch (err) {
            setError(errorMessage(err))
        } finally {
            setBusy(false)
        }
    }

    const handlePickPrivateKey = async () => {
        try {
            const path = await API.selectPrivateKey()
            if (path) {
                update({ privateKey: path })
            }
        } catch (err) {
            setError(errorMessage(err))
        }
    }

    const handlePickSqlite = async () => {
        try {
            const path = await API.sqliteOpenFile()
            if (path) {
                update({ sqlitePath: path })
            }
        } catch (err) {
            setError(errorMessage(err))
        }
    }

    const handlePickCert = async (field: keyof ServerConfig) => {
        try {
            const path = await API.selectCertFile()
            if (path) {
                update({ [field]: path })
            }
        } catch (err) {
            setError(errorMessage(err))
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

    const handleTestConnection = async () => {
        const valErr = validateForm(form)
        if (valErr) {
            setError(valErr)
            return
        }
        setBusy(true)
        setTestResult(null)
        try {
            if (form.type === 'mongo') {
                const res = await API.mongoTestConnection(form)
                setTestResult({ success: true, message: `MongoDB 连接成功! Ping: ${res.pingMs || 0}ms` })
            } else if (form.type === 'mqtt') {
                const res = await API.mqttTestConnection(form)
                setTestResult({ success: true, message: `MQTT Broker 连接成功! 延迟: ${res.pingMs || 0}ms` })
            } else if (form.type === 'redis') {
                const res = await API.redisTestConnection(form)
                setTestResult({ success: true, message: `Redis 连接成功! 延迟: ${res.pingMs || 0}ms` })
            } else if (form.type === 'mysql') {
                const res = await API.mysqlTestConnection(form)
                setTestResult({ success: true, message: `MySQL 连接成功! 延迟: ${res.pingMs || 0}ms` })
            } else {
                setTestResult({ success: true, message: '配置格式校验通过' })
            }
        } catch (err) {
            setTestResult({ success: false, message: errorMessage(err) })
        } finally {
            setBusy(false)
        }
    }

    const protocolItems: { key: ConnType; label: React.ReactNode }[] = [
        { key: 'ssh', label: <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><ClientIcon kind="ssh" size={14} /><span>SSH</span></span> },
        { key: 'redis', label: <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><ClientIcon kind="redis" size={14} /><span>Redis</span></span> },
        { key: 'mysql', label: <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><ClientIcon kind="mysql" size={14} /><span>MySQL</span></span> },
        { key: 'mongo', label: <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><ClientIcon kind="mongo" size={14} /><span>MongoDB</span></span> },
        { key: 'sqlite', label: <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><ClientIcon kind="sqlite" size={14} /><span>SQLite</span></span> },
        { key: 'mqtt', label: <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><ClientIcon kind="mqtt" size={14} /><span>MQTT</span></span> },
    ]

    return (
        <AntdModal
            open={open}
            closable={false}
            title={
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Server size={18} style={{ display: 'block', flexShrink: 0 }} />
                    <span style={{ lineHeight: '18px' }}>{initial ? '编辑连接配置' : '新建连接'}</span>
                </div>
            }
            onCancel={onClose}
            width={620}
            destroyOnHidden
            centered
            footer={
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        {['mongo', 'redis', 'mysql', 'mqtt'].includes(form.type || '') && (
                            <Button onClick={handleTestConnection} loading={busy}>
                                测试连接
                            </Button>
                        )}
                    </div>
                    <Space size={8}>
                        <Button onClick={onClose}>取消</Button>
                        <Button onClick={() => save(false)} loading={busy}>
                            仅保存
                        </Button>
                        <Button type="primary" onClick={() => save(true)} loading={busy}>
                            保存并连接
                        </Button>
                    </Space>
                </div>
            }
        >
            <div style={{ marginTop: 12 }}>
                {error && (
                    <Alert
                        type="error"
                        message={error}
                        showIcon
                        closable
                        onClose={() => setError('')}
                        style={{ marginBottom: 14 }}
                    />
                )}
                {testResult && (
                    <Alert
                        type={testResult.success ? 'success' : 'error'}
                        message={testResult.message}
                        showIcon
                        closable
                        onClose={() => setTestResult(null)}
                        style={{ marginBottom: 14 }}
                    />
                )}

                {/* 协议类型选择 */}
                <Tabs
                    activeKey={form.type}
                    onChange={(k) => switchType(k as ConnType)}
                    items={protocolItems}
                    style={{ marginBottom: 16 }}
                />

                <Space orientation="vertical" size={14} style={{ width: '100%' }}>
                    {/* 通用基础信息 */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <div>
                            <div style={{ fontSize: 13, marginBottom: 4, fontWeight: 500 }}>连接名称</div>
                            <Input
                                placeholder="如: 生产集群 / 开发数据库"
                                value={form.name}
                                onChange={(e) => update({ name: e.target.value })}
                            />
                        </div>
                        <div>
                            <div style={{ fontSize: 13, marginBottom: 4, fontWeight: 500 }}>归属分组</div>
                            <Select
                                style={{ width: '100%' }}
                                value={form.groupId || ''}
                                onChange={(val) => update({ groupId: val })}
                                options={[
                                    { label: '默认分组 (无)', value: '' },
                                    ...groups.map((g) => ({ label: g.name, value: g.id })),
                                ]}
                            />
                        </div>
                    </div>

                    {/* SQLite 专用 */}
                    {form.type === 'sqlite' ? (
                        <div>
                            <div style={{ fontSize: 13, marginBottom: 4, fontWeight: 500 }}>SQLite 文件路径</div>
                            <Space.Compact style={{ width: '100%' }}>
                                <Input
                                    placeholder="D:/data/app.db"
                                    value={form.sqlitePath || ''}
                                    onChange={(e) => update({ sqlitePath: e.target.value })}
                                />
                                <Button icon={<FolderOpen size={14} />} onClick={handlePickSqlite}>
                                    浏览
                                </Button>
                            </Space.Compact>
                        </div>
                    ) : form.type === 'mongo' && form.mongoAuthMode === 'uri' ? (
                        <div>
                            <div style={{ fontSize: 13, marginBottom: 4, fontWeight: 500 }}>MongoDB URI</div>
                            <Input
                                placeholder="mongodb://user:pass@host:27017/dbname?authSource=admin"
                                value={form.mongoURI || ''}
                                onChange={(e) => update({ mongoURI: e.target.value })}
                            />
                        </div>
                    ) : (
                        /* 标准 Host + Port */
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
                                    onChange={(val) => update({ port: val || 22 })}
                                />
                            </div>
                        </div>
                    )}

                    {/* SSH 认证设置 */}
                    {form.type === 'ssh' && (
                        <>
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
                                    <div style={{ fontSize: 13, marginBottom: 4, fontWeight: 500 }}>认证方式</div>
                                    <Radio.Group
                                        value={form.authType || 'password'}
                                        onChange={(e) => update({ authType: e.target.value })}
                                        buttonStyle="solid"
                                    >
                                        <Radio.Button value="password">密码认证</Radio.Button>
                                        <Radio.Button value="key">私钥认证</Radio.Button>
                                    </Radio.Group>
                                </div>
                            </div>

                            {form.authType === 'key' ? (
                                <>
                                    <div>
                                        <div style={{ fontSize: 13, marginBottom: 4, fontWeight: 500 }}>私钥文件 (Private Key)</div>
                                        <Space.Compact style={{ width: '100%' }}>
                                            <Input
                                                placeholder="选择私钥文件或粘贴 PEM 证书"
                                                value={form.privateKey || ''}
                                                onChange={(e) => update({ privateKey: e.target.value })}
                                            />
                                            <Button icon={<Key size={14} />} onClick={handlePickPrivateKey}>
                                                选择文件
                                            </Button>
                                        </Space.Compact>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: 13, marginBottom: 4, fontWeight: 500 }}>私钥密码 (Passphrase, 可选)</div>
                                        <Input.Password
                                            placeholder="如有密码请填写"
                                            value={form.passphrase || ''}
                                            onChange={(e) => update({ passphrase: e.target.value })}
                                        />
                                    </div>
                                </>
                            ) : (
                                <div>
                                    <div style={{ fontSize: 13, marginBottom: 4, fontWeight: 500 }}>密码</div>
                                    <Input.Password
                                        placeholder="请输入登录密码"
                                        value={form.password || ''}
                                        onChange={(e) => update({ password: e.target.value })}
                                    />
                                </div>
                            )}
                        </>
                    )}

                    {/* Redis 认证与基础设置 */}
                    {form.type === 'redis' && (
                        <>
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
                        </>
                    )}

                    {/* MySQL 认证与基础设置 */}
                    {form.type === 'mysql' && (
                        <>
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
                        </>
                    )}

                    {/* MongoDB 认证与基础设置 */}
                    {form.type === 'mongo' && (
                        <>
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
                        </>
                    )}

                    {/* MQTT 认证与基础设置 */}
                    {form.type === 'mqtt' && (
                        <>
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
                        </>
                    )}

                    {/* 各协议类型专属手风琴折叠面板 */}
                    {form.type === 'redis' ? (
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
                    ) : form.type === 'mysql' ? (
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
                    ) : form.type === 'mongo' ? (
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
                    ) : form.type === 'mqtt' ? (
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
                    ) : (
                        /* SSH / 其他常规高级选项 */
                        <Collapse
                            ghost
                            size="small"
                            items={[
                                {
                                    key: 'advanced',
                                    label: (
                                        <Space size={6}>
                                            <Sliders size={13} />
                                            <span style={{ fontSize: 13 }}>高级选项与扩展配置</span>
                                        </Space>
                                    ),
                                    children: (
                                        <Space orientation="vertical" size={10} style={{ width: '100%' }}>
                                            {form.type === 'ssh' && (
                                                <div>
                                                    <div style={{ fontSize: 12, marginBottom: 4 }}>SFTP 默认初始路径</div>
                                                    <Input
                                                        placeholder="/root 或 /home/user"
                                                        value={form.sftpHome || ''}
                                                        onChange={(e) => update({ sftpHome: e.target.value })}
                                                    />
                                                </div>
                                            )}
                                        </Space>
                                    ),
                                },
                            ]}
                        />
                    )}
                </Space>
            </div>
        </AntdModal>
    )
}
