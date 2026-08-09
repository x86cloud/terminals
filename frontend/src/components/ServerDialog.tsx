import React, {useEffect, useState} from 'react'
import {Modal} from './Modal'
import {API} from '../api'
import {emptyServer, ServerConfig, ServerGroup, ConnType} from '../types'
import {errorMessage} from '../utils'
import Icon from './Icon'
import ClientIcon from './ClientIcon'
import g from '../styles/global.module.less'
import sd from './ServerDialog.module.less'

interface Props {
    open: boolean
    initial: ServerConfig | null
    groups: ServerGroup[]
    onClose: () => void
    onSaved: (cfg: ServerConfig) => void
    onSaveAndConnect: (cfg: ServerConfig) => void
}

export default function ServerDialog({open, initial, groups, onClose, onSaved, onSaveAndConnect}: Props) {
    const [form, setForm] = useState<ServerConfig>(emptyServer())
    const [error, setError] = useState('')
    const [busy, setBusy] = useState(false)
    const [showAdv, setShowAdv] = useState(false)

    useEffect(() => {
        if (open) {
            const base = initial ? {...initial} : emptyServer()
            if (!base.type) base.type = 'ssh'
            if (!base.port)
                base.port =
                    base.type === 'redis' ? 6379 : base.type === 'mysql' ? 3306 : base.type === 'mqtt' ? 1883 : base.type === 'sqlite' ? 0 : 22
            if (!base.username && (base.type === 'ssh' || base.type === 'mysql')) base.username = 'root'
            setForm(base)
            setError('')
            setShowAdv(false)
        }
    }, [open, initial])

    const update = (patch: Partial<ServerConfig>) => setForm((prev) => ({...prev, ...patch}))

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
                return '请选取或输入 SQLite 数据库文件路径'
            }
            return null
        }

        if (!cfg.host?.trim()) {
            return '请输入服务器主机地址（Host）'
        }

        const port = Number(cfg.port)
        if (!port || isNaN(port) || port < 1 || port > 65535) {
            return '请输入有效的端口号（1 - 65535）'
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

    const pickKey = async () => {
        try {
            const p = await API.selectPrivateKey()
            if (p) update({privateKey: p})
        } catch (err) {
            setError(errorMessage(err))
        }
    }

    const isRedis = form.type === 'redis'
    const isMysql = form.type === 'mysql'
    const isMqtt = form.type === 'mqtt'
    const isMongo = form.type === 'mongo'
    const isSqlite = form.type === 'sqlite'

    return (
        <Modal
            open={open}
            title={initial?.id ? '编辑服务器' : '新建服务器'}
            onClose={onClose}
            width={640}
            footer={
                <>
                    {error && <span className={g.formError}>{error}</span>}
                    <span className={g.spacer}/>
                    <button className={g.btn} onClick={onClose} disabled={busy}>取消</button>
                    <button className={g.btn} onClick={() => save(false)} disabled={busy}>保存</button>
                    <button className={`${g.btn} ${g.primary}`} onClick={() => save(true)} disabled={busy}>保存并连接</button>
                </>
            }
        >
            <div className={g.formGrid}>
                <div className={g.field}>
                    <span>连接类型</span>
                    <div className={g.segmented}>
                        <button
                            className={form.type === 'ssh' ? g.active : ''}
                            onClick={() => switchType('ssh')}
                        >
                            <ClientIcon kind="ssh" size={13}/> SSH
                        </button>
                        <button
                            className={form.type === 'redis' ? g.active : ''}
                            onClick={() => switchType('redis')}
                        >
                            <ClientIcon kind="redis" size={13}/> Redis
                        </button>
                        <button
                            className={form.type === 'mysql' ? g.active : ''}
                            onClick={() => switchType('mysql')}
                        >
                            <ClientIcon kind="mysql" size={13}/> MySQL
                        </button>
                        <button
                            className={form.type === 'mqtt' ? g.active : ''}
                            onClick={() => switchType('mqtt')}
                        >
                            <ClientIcon kind="mqtt" size={13}/> MQTT
                        </button>
                        <button
                            className={form.type === 'mongo' ? g.active : ''}
                            onClick={() => switchType('mongo')}
                        >
                            <ClientIcon kind="mongo" size={13}/> MongoDB
                        </button>
                        <button
                            className={form.type === 'sqlite' ? g.active : ''}
                            onClick={() => switchType('sqlite')}
                        >
                            <ClientIcon kind="sqlite" size={13}/> SQLite
                        </button>
                    </div>
                </div>

                <label className={g.field}>
                    <span>名称</span>
                    <input
                        value={form.name}
                        placeholder={isRedis ? '可选，例如 缓存-redis01' : '可选，例如 生产环境-web01'}
                        onChange={(e) => update({name: e.target.value})}
                    />
                </label>

                <label className={g.field}>
                    <span>所属分组（可选）</span>
                    <select
                        value={form.groupId ?? ''}
                        onChange={(e) => update({groupId: e.target.value || undefined})}
                    >
                        <option value="">未分组</option>
                        {groups.map((grp) => (
                            <option key={grp.id} value={grp.id}>{grp.name}</option>
                        ))}
                    </select>
                </label>

                {!isSqlite && (
                    <div className={g.fieldRow}>
                        <label className={`${g.field} ${g.grow}`}>
                            <span>主机</span>
                            <input
                                value={form.host}
                                placeholder="192.168.1.10"
                                onChange={(e) => update({host: e.target.value})}
                            />
                        </label>
                        <label className={`${g.field} ${g.port}`}>
                            <span>端口</span>
                            <input
                                type="number"
                                value={form.port}
                                onChange={(e) =>
                                    update({port: Number(e.target.value) || (isRedis ? 6379 : isMysql ? 3306 : isMqtt ? 1883 : isMongo ? 27017 : 22)})
                                }
                            />
                        </label>
                    </div>
                )}

                {!isRedis && !isMongo && !isSqlite && (
                    <label className={g.field}>
                        <span>用户名</span>
                        <input value={form.username} onChange={(e) => update({username: e.target.value})}/>
                    </label>
                )}

                {form.type === 'ssh' && (
                    <>
                        <div className={g.field}>
                            <span>认证方式</span>
                            <div className={g.segmented}>
                                <button
                                    className={form.authType === 'password' ? g.active : ''}
                                    onClick={() => update({authType: 'password'})}
                                >
                                    密码
                                </button>
                                <button
                                    className={form.authType === 'key' ? g.active : ''}
                                    onClick={() => update({authType: 'key'})}
                                >
                                    私钥
                                </button>
                            </div>
                        </div>

                        {form.authType === 'password' ? (
                            <label className={g.field}>
                                <span>密码</span>
                                <input
                                    type="password"
                                    value={form.password}
                                    autoComplete="new-password"
                                    onChange={(e) => update({password: e.target.value})}
                                />
                            </label>
                        ) : (
                            <>
                                <label className={g.field}>
                                    <span>私钥文件</span>
                                    <div className={g.fieldRow}>
                                        <input
                                            className={g.grow}
                                            value={form.privateKey}
                                            placeholder="私钥文件路径或直接粘贴 PEM 内容"
                                            onChange={(e) => update({privateKey: e.target.value})}
                                        />
                                        <button type="button" className={g.btn} onClick={pickKey}>浏览</button>
                                    </div>
                                </label>
                                <label className={g.field}>
                                    <span>私钥密码（可选）</span>
                                    <input
                                        type="password"
                                        value={form.passphrase}
                                        onChange={(e) => update({passphrase: e.target.value})}
                                    />
                                </label>
                            </>
                        )}
                    </>
                )}

                {isMysql && (
                    <>
                        <label className={g.field}>
                            <span>密码（可选）</span>
                            <input
                                type="password"
                                value={form.password}
                                autoComplete="new-password"
                                placeholder="MySQL 无密码可留空"
                                onChange={(e) => update({password: e.target.value})}
                            />
                        </label>
                        <label className={g.field}>
                            <span>默认数据库（可选）</span>
                            <input
                                value={form.database ?? ''}
                                placeholder="例如 mysql / test"
                                onChange={(e) => update({database: e.target.value})}
                            />
                        </label>
                        <div className={g.field}>
                            <button type="button" className={g.advToggle} onClick={() => setShowAdv(v => !v)}>
                                <Icon name={showAdv ? 'chevron-down' : 'chevron-right'} size={14}/>
                                高级参数（SSL / SSH 隧道 / 连接池）
                            </button>
                        </div>
                        {showAdv && (
                            <>
                                <label className={g.switchField}>
                                    <span>启用 SSL 加密连接</span>
                                    <span className={g.switch}>
                                        <input
                                            type="checkbox"
                                            checked={!!form.mysqlSSLEnabled}
                                            onChange={(e) => update({mysqlSSLEnabled: e.target.checked})}
                                        />
                                        <span className={g.slider} />
                                    </span>
                                </label>
                                <label className={g.field}>
                                    <span>TLS 模式</span>
                                    <select
                                        value={form.mysqlTLS ?? ''}
                                        onChange={(e) => update({mysqlTLS: e.target.value})}
                                    >
                                        <option value="">默认（按服务器要求）</option>
                                        <option value="skip-verify">skip-verify（跳过校验）</option>
                                        <option value="preferred">preferred（优先加密）</option>
                                        <option value="required">required（强制校验）</option>
                                    </select>
                                </label>
                                <label className={g.switchField}>
                                    <span>通过 SSH 隧道连接</span>
                                    <span className={g.switch}>
                                        <input
                                            type="checkbox"
                                            checked={!!form.mysqlSSHEnabled}
                                            onChange={(e) => update({mysqlSSHEnabled: e.target.checked})}
                                        />
                                        <span className={g.slider} />
                                    </span>
                                </label>
                                {form.mysqlSSHEnabled && (
                                    <>
                                        <div className={g.fieldRow}>
                                            <label className={`${g.field} ${g.grow}`}>
                                                <span>SSH 主机</span>
                                                <input
                                                    value={form.mysqlSSHHost ?? ''}
                                                    placeholder="跳板机 IP"
                                                    onChange={(e) => update({mysqlSSHHost: e.target.value})}
                                                />
                                            </label>
                                            <label className={g.field}>
                                                <span>SSH 端口</span>
                                                <input
                                                    type="number"
                                                    value={form.mysqlSSHHostPort ?? 22}
                                                    onChange={(e) => update({mysqlSSHHostPort: Number(e.target.value) || 22})}
                                                />
                                            </label>
                                        </div>
                                        <div className={g.fieldRow}>
                                            <label className={`${g.field} ${g.grow}`}>
                                                <span>SSH 用户名</span>
                                                <input
                                                    value={form.mysqlSSHUser ?? ''}
                                                    onChange={(e) => update({mysqlSSHUser: e.target.value})}
                                                />
                                            </label>
                                            <label className={g.field}>
                                                <span>本地代理端口</span>
                                                <input
                                                    type="number"
                                                    value={form.mysqlSSHProxyLocalPort ?? 13306}
                                                    onChange={(e) => update({mysqlSSHProxyLocalPort: Number(e.target.value) || 13306})}
                                                />
                                            </label>
                                        </div>
                                        <label className={g.field}>
                                            <span>SSH 私钥路径（可选，留空用密码）</span>
                                            <input
                                                value={form.mysqlSSHKeyPath ?? ''}
                                                placeholder="私钥文件路径；留空则用下方密码"
                                                onChange={(e) => update({mysqlSSHKeyPath: e.target.value})}
                                            />
                                        </label>
                                        <label className={g.field}>
                                            <span>SSH 密码 / 私钥口令</span>
                                            <input
                                                type="password"
                                                value={form.mysqlSSHPassphrase ?? ''}
                                                autoComplete="new-password"
                                                onChange={(e) => update({mysqlSSHPassphrase: e.target.value})}
                                            />
                                        </label>
                                    </>
                                )}
                                <div className={g.fieldRow}>
                                    <label className={`${g.field} ${g.grow}`}>
                                        <span>最大连接数</span>
                                        <input
                                            type="number"
                                            value={form.mysqlMaxOpenConns ?? 10}
                                            onChange={(e) => update({mysqlMaxOpenConns: Number(e.target.value) || 10})}
                                        />
                                    </label>
                                    <label className={g.field}>
                                        <span>空闲连接数</span>
                                        <input
                                            type="number"
                                            value={form.mysqlMaxIdleConns ?? 5}
                                            onChange={(e) => update({mysqlMaxIdleConns: Number(e.target.value) || 5})}
                                        />
                                    </label>
                                </div>
                                <label className={g.field}>
                                    <span>连接最大存活时间（秒）</span>
                                    <input
                                        type="number"
                                        value={form.mysqlConnMaxLifetime ?? 3600}
                                        onChange={(e) => update({mysqlConnMaxLifetime: Number(e.target.value) || 3600})}
                                    />
                                </label>
                            </>
                        )}
                    </>
                )}

                {isRedis && (
                    <>
                        <label className={g.field}>
                            <span>密码（可选）</span>
                            <input
                                type="password"
                                value={form.password}
                                autoComplete="new-password"
                                placeholder="Redis 无密码可留空"
                                onChange={(e) => update({password: e.target.value})}
                            />
                        </label>
                        <label className={g.field}>
                            <span>数据库 DB（可选）</span>
                            <input
                                type="number"
                                min={0}
                                value={form.db ?? 0}
                                placeholder="0"
                                onChange={(e) => update({db: Number(e.target.value) || 0})}
                            />
                        </label>
                        <label className={g.field}>
                            <span>ACL 用户名（Redis 6+，可选）</span>
                            <input
                                value={form.redisUsername ?? ''}
                                onChange={(e) => update({redisUsername: e.target.value})}
                            />
                        </label>
                        <label className={g.field}>
                            <span>部署模式</span>
                            <select
                                value={form.redisMode ?? 'single'}
                                onChange={(e) => update({redisMode: e.target.value})}
                            >
                                <option value="single">单机</option>
                                <option value="sentinel">哨兵</option>
                                <option value="cluster">集群</option>
                            </select>
                        </label>
                        {form.redisMode === 'sentinel' && (
                            <>
                                <label className={g.field}>
                                    <span>哨兵节点（逗号分隔 host:port）</span>
                                    <input
                                        value={form.redisSentinels ?? ''}
                                        placeholder="127.0.0.1:26379,127.0.0.1:26380"
                                        onChange={(e) => update({redisSentinels: e.target.value})}
                                    />
                                </label>
                                <label className={g.field}>
                                    <span>Master 名称</span>
                                    <input
                                        value={form.redisMasterName ?? ''}
                                        placeholder="mymaster"
                                        onChange={(e) => update({redisMasterName: e.target.value})}
                                    />
                                </label>
                            </>
                        )}
                        {form.redisMode === 'cluster' && (
                            <label className={g.field}>
                                <span>集群节点（逗号分隔 host:port）</span>
                                <input
                                    value={form.redisClusterNodes ?? ''}
                                    placeholder="127.0.0.1:7000,127.0.0.1:7001"
                                    onChange={(e) => update({redisClusterNodes: e.target.value})}
                                />
                            </label>
                        )}
                        <label className={g.field}>
                            <span>序列化方式</span>
                            <select
                                value={form.redisSerialization ?? 'none'}
                                onChange={(e) => update({redisSerialization: e.target.value})}
                            >
                                <option value="none">原样（无）</option>
                                <option value="json">JSON</option>
                            </select>
                        </label>
                        <label className={g.field}>
                            <span>连接池大小（0=默认）</span>
                            <input
                                type="number"
                                value={form.redisPoolSize ?? 0}
                                onChange={(e) => update({redisPoolSize: Number(e.target.value) || 0})}
                            />
                        </label>
                        <label className={g.field}>
                            <span>读超时 / 写超时 / 拨号超时（秒，0=默认）</span>
                            <div className={g.fieldRow}>
                                <input type="number" value={form.redisReadTimeout ?? 0}
                                       onChange={(e) => update({redisReadTimeout: Number(e.target.value) || 0})}/>
                                <input type="number" value={form.redisWriteTimeout ?? 0}
                                       onChange={(e) => update({redisWriteTimeout: Number(e.target.value) || 0})}/>
                                <input type="number" value={form.redisDialTimeout ?? 0}
                                       onChange={(e) => update({redisDialTimeout: Number(e.target.value) || 0})}/>
                            </div>
                        </label>
                        <label className={g.field}>
                            <span>命令重试次数 / 熔断阈值（连续失败，0=默认）</span>
                            <div className={g.fieldRow}>
                                <input type="number" value={form.redisMaxRetries ?? 0}
                                       onChange={(e) => update({redisMaxRetries: Number(e.target.value) || 0})}/>
                                <input type="number" value={form.redisBreakerThreshold ?? 0}
                                       onChange={(e) => update({redisBreakerThreshold: Number(e.target.value) || 0})}/>
                            </div>
                        </label>
                    </>
                )}

                {isMqtt && (
                    <>
                        <label className={g.field}>
                            <span>密码（可选）</span>
                            <input
                                type="password"
                                value={form.password}
                                autoComplete="new-password"
                                placeholder="MQTT 无密码可留空"
                                onChange={(e) => update({password: e.target.value})}
                            />
                        </label>
                        <label className={g.field}>
                            <span>客户端 ID（可选）</span>
                            <input
                                value={form.clientId ?? ''}
                                placeholder="留空则自动生成"
                                onChange={(e) => update({clientId: e.target.value})}
                            />
                        </label>
                        <label className={g.switchField}>
                            <span>使用 TLS 加密连接</span>
                            <span className={g.switch}>
                                <input
                                    type="checkbox"
                                    checked={!!form.useTLS}
                                    onChange={(e) => update({useTLS: e.target.checked})}
                                />
                                <span className={g.slider} />
                            </span>
                        </label>
                        {form.useTLS && (
                            <>
                                <label className={g.field}>
                                    <span>CA 证书（可选，PEM 内容或路径）</span>
                                    <input value={form.mqttCACert ?? ''}
                                        placeholder="用于校验服务端自签证书；留空则使用系统信任库"
                                        onChange={(e) => update({mqttCACert: e.target.value})}/>
                                </label>
                                <label className={g.field}>
                                    <span>客户端证书（可选，PEM 内容或路径）</span>
                                    <input value={form.mqttClientCert ?? ''}
                                        placeholder="双向认证时填写；留空则单向 TLS"
                                        onChange={(e) => update({mqttClientCert: e.target.value})}/>
                                </label>
                                <label className={g.field}>
                                    <span>客户端私钥（可选，PEM 内容或路径）</span>
                                    <input value={form.mqttClientKey ?? ''}
                                        placeholder="与客户端证书配套的私钥"
                                        onChange={(e) => update({mqttClientKey: e.target.value})}/>
                                </label>
                            </>
                        )}

                        <div className={g.field}>
                            <button type="button" className={g.advToggle} onClick={() => setShowAdv(v => !v)}>
                                <Icon name={showAdv ? 'chevron-down' : 'chevron-right'} size={14}/>
                                高级参数
                            </button>
                        </div>

                        {showAdv && (
                            <>
                                <div className={g.fieldRow}>
                                    <label className={`${g.field} ${g.grow}`}>
                                        <span>协议版本</span>
                                        <select value={form.mqttProto ?? '3.1.1'}
                                            onChange={(e) => update({mqttProto: e.target.value})}>
                                            <option value="3.1.1">3.1.1</option>
                                            <option value="3.1">3.1</option>
                                        </select>
                                    </label>
                                    <label className={g.field}>
                                        <span>心跳间隔(秒)</span>
                                        <input type="number" min={1}
                                            value={form.mqttKeepAlive ?? 30}
                                            onChange={(e) => update({mqttKeepAlive: Number(e.target.value) || 30})}/>
                                    </label>
                                </div>
                                <div className={g.fieldRow}>
                                    <label className={`${g.field} ${g.grow}`}>
                                        <span>连接超时(秒)</span>
                                        <input type="number" min={1}
                                            value={form.mqttConnectTimeout ?? 10}
                                            onChange={(e) => update({mqttConnectTimeout: Number(e.target.value) || 10})}/>
                                    </label>
                                    <label className={g.field}>
                                        <span>重连间隔(秒)</span>
                                        <input type="number" min={1}
                                            value={form.mqttReconnectIntvl ?? 5}
                                            onChange={(e) => update({mqttReconnectIntvl: Number(e.target.value) || 5})}/>
                                    </label>
                                </div>
                                <div className={g.fieldRow}>
                                    <label className={`${g.switchField} ${g.inline}`}>
                                        <span>清除会话</span>
                                        <span className={g.switch}>
                                            <input type="checkbox" checked={!!form.mqttCleanSession}
                                                onChange={(e) => update({mqttCleanSession: e.target.checked})}/>
                                            <span className={g.slider} />
                                        </span>
                                    </label>
                                    <label className={`${g.switchField} ${g.inline}`}>
                                        <span>自动重连</span>
                                        <span className={g.switch}>
                                            <input type="checkbox" checked={!!form.mqttAutoReconnect}
                                                onChange={(e) => update({mqttAutoReconnect: e.target.checked})}/>
                                            <span className={g.slider} />
                                        </span>
                                    </label>
                                </div>
                                {form.useTLS && (
                                    <label className={g.switchField}>
                                        <span>跳过 TLS 证书校验（自签证书可用）</span>
                                        <span className={g.switch}>
                                            <input type="checkbox" checked={!!form.mqttInsecure}
                                                onChange={(e) => update({mqttInsecure: e.target.checked})}/>
                                            <span className={g.slider} />
                                        </span>
                                    </label>
                                )}

                                <div className={g.field}>
                                    <span className={g.groupTitle}>遗嘱消息 (Last Will)</span>
                                </div>
                                <label className={g.field}>
                                    <input value={form.mqttWillTopic ?? ''}
                                        placeholder="遗嘱主题（留空则不设置）"
                                        onChange={(e) => update({mqttWillTopic: e.target.value})}/>
                                </label>
                                <label className={g.field}>
                                    <textarea className={g.grow} rows={2}
                                        value={form.mqttWillPayload ?? ''}
                                        placeholder="遗嘱消息内容"
                                        onChange={(e) => update({mqttWillPayload: e.target.value})}/>
                                </label>
                                <div className={g.fieldRow}>
                                    <label className={`${g.field} ${g.grow}`}>
                                        <span>遗嘱 QoS</span>
                                        <select value={form.mqttWillQos ?? 0}
                                            onChange={(e) => update({mqttWillQos: Number(e.target.value)})}>
                                            <option value={0}>0</option>
                                            <option value={1}>1</option>
                                            <option value={2}>2</option>
                                        </select>
                                    </label>
                                    <label className={`${g.switchField} ${g.inline}`}>
                                        <span>保留遗嘱</span>
                                        <span className={g.switch}>
                                            <input type="checkbox" checked={!!form.mqttWillRetained}
                                                onChange={(e) => update({mqttWillRetained: e.target.checked})}/>
                                            <span className={g.slider} />
                                        </span>
                                    </label>
                                </div>
                            </>
                        )}
                    </>
                )}

                {isMongo && (
                    <>
                        <label className={g.field}>
                            <span>连接字符串（可选，mongodb:// 或 mongodb+srv://）</span>
                            <textarea
                                className={g.grow}
                                rows={2}
                                value={form.mongoUri ?? ''}
                                placeholder="留空则用下方离散字段拼装；SRV 形式通常需开启 TLS"
                                onChange={(e) => update({mongoUri: e.target.value, mongoSrv: e.target.value.startsWith('mongodb+srv')})}
                            />
                        </label>
                        <div className={g.fieldRow}>
                            <label className={`${g.field} ${g.grow}`}>
                                <span>种子节点（逗号分隔 host:port）</span>
                                <input
                                    value={form.mongoHosts ?? ''}
                                    placeholder="rs0:27017,rs1:27017（副本集/分片）；留空用主机:端口"
                                    onChange={(e) => update({mongoHosts: e.target.value})}
                                />
                            </label>
                            <label className={`${g.field} ${g.grow}`}>
                                <span>默认库（可选）</span>
                                <input
                                    value={form.mongoDatabase ?? ''}
                                    placeholder="例如 admin / test"
                                    onChange={(e) => update({mongoDatabase: e.target.value})}
                                />
                            </label>
                        </div>
                        <div className={g.fieldRow}>
                            <label className={`${g.field} ${g.grow}`}>
                                <span>认证机制</span>
                                <select
                                    value={form.mongoAuthMech ?? 'SCRAM-SHA-256'}
                                    onChange={(e) => update({mongoAuthMech: e.target.value})}
                                >
                                    <option value="SCRAM-SHA-256">SCRAM-SHA-256</option>
                                    <option value="SCRAM-SHA-1">SCRAM-SHA-1</option>
                                    <option value="MONGODB-X509">MONGODB-X509（客户端证书）</option>
                                    <option value="none">无认证</option>
                                </select>
                            </label>
                            <label className={`${g.field} ${g.grow}`}>
                                <span>认证源（authSource）</span>
                                <input
                                    value={form.mongoAuthSource ?? ''}
                                    placeholder="默认 admin"
                                    onChange={(e) => update({mongoAuthSource: e.target.value})}
                                />
                            </label>
                        </div>
                        {form.mongoAuthMech !== 'MONGODB-X509' && form.mongoAuthMech !== 'none' && (
                            <>
                                <label className={g.field}>
                                    <span>用户名</span>
                                    <input value={form.username} onChange={(e) => update({username: e.target.value})}/>
                                </label>
                                <label className={g.field}>
                                    <span>密码（可选）</span>
                                    <input
                                        type="password"
                                        value={form.password}
                                        autoComplete="new-password"
                                        placeholder="MongoDB 无密码可留空"
                                        onChange={(e) => update({password: e.target.value})}
                                    />
                                </label>
                            </>
                        )}
                        <div className={g.fieldRow}>
                            <label className={`${g.field} ${g.grow}`}>
                                <span>副本集名称（可选）</span>
                                <input
                                    value={form.mongoReplicaSet ?? ''}
                                    placeholder="如 rs0（副本集/分片）"
                                    onChange={(e) => update({mongoReplicaSet: e.target.value})}
                                />
                            </label>
                            <label className={`${g.field} ${g.grow}`}>
                                <span>读偏好</span>
                                <select
                                    value={form.mongoReadPreference ?? 'primary'}
                                    onChange={(e) => update({mongoReadPreference: e.target.value})}
                                >
                                    <option value="primary">primary</option>
                                    <option value="primaryPreferred">primaryPreferred</option>
                                    <option value="secondary">secondary</option>
                                    <option value="secondaryPreferred">secondaryPreferred</option>
                                    <option value="nearest">nearest</option>
                                </select>
                            </label>
                        </div>

                        <div className={g.field}>
                            <button type="button" className={g.advToggle} onClick={() => setShowAdv(v => !v)}>
                                <Icon name={showAdv ? 'chevron-down' : 'chevron-right'} size={14}/>
                                高级参数（TLS / 连接池 / 超时 / 压缩）
                            </button>
                        </div>

                        {showAdv && (
                            <>
                                <label className={g.switchField}>
                                    <span>启用 TLS/SSL 加密连接</span>
                                    <span className={g.switch}>
                                        <input
                                            type="checkbox"
                                            checked={!!form.mongoTlsEnabled}
                                            onChange={(e) => update({mongoTlsEnabled: e.target.checked})}
                                        />
                                        <span className={g.slider} />
                                    </span>
                                </label>
                                <label className={g.switchField}>
                                    <span>跳过 TLS 证书校验（自签证书可用）</span>
                                    <span className={g.switch}>
                                        <input
                                            type="checkbox"
                                            checked={!!form.mongoTlsInsecure}
                                            onChange={(e) => update({mongoTlsInsecure: e.target.checked})}
                                        />
                                        <span className={g.slider} />
                                    </span>
                                </label>
                                <label className={g.field}>
                                    <span>CA 证书（可选，PEM 内容或路径）</span>
                                    <input
                                        value={form.mongoTlsCaCert ?? ''}
                                        placeholder="用于校验服务端自签证书；留空则使用系统信任库"
                                        onChange={(e) => update({mongoTlsCaCert: e.target.value})}
                                    />
                                </label>
                                <label className={g.field}>
                                    <span>客户端证书（X.509 双向认证，PEM 内容或路径）</span>
                                    <input
                                        value={form.mongoTlsClientCert ?? ''}
                                        placeholder="含证书的 PEM；X.509 认证必填"
                                        onChange={(e) => update({mongoTlsClientCert: e.target.value})}
                                    />
                                </label>
                                <label className={g.field}>
                                    <span>客户端私钥（可选，PEM 内容或路径）</span>
                                    <input
                                        value={form.mongoTlsClientKey ?? ''}
                                        placeholder="与客户端证书配套的私钥；可合并到证书文件"
                                        onChange={(e) => update({mongoTlsClientKey: e.target.value})}
                                    />
                                </label>
                                <div className={g.fieldRow}>
                                    <label className={`${g.field} ${g.grow}`}>
                                        <span>最大连接池</span>
                                        <input
                                            type="number"
                                            value={form.mongoMaxPoolSize ?? 100}
                                            onChange={(e) => update({mongoMaxPoolSize: Number(e.target.value) || 100})}
                                        />
                                    </label>
                                    <label className={g.field}>
                                        <span>最小连接池</span>
                                        <input
                                            type="number"
                                            value={form.mongoMinPoolSize ?? 0}
                                            onChange={(e) => update({mongoMinPoolSize: Number(e.target.value) || 0})}
                                        />
                                    </label>
                                </div>
                                <div className={g.fieldRow}>
                                    <label className={`${g.field} ${g.grow}`}>
                                        <span>连接超时(秒)</span>
                                        <input
                                            type="number"
                                            value={form.mongoConnectTimeout ?? 10}
                                            onChange={(e) => update({mongoConnectTimeout: Number(e.target.value) || 10})}
                                        />
                                    </label>
                                    <label className={g.field}>
                                        <span>服务端选择超时(秒)</span>
                                        <input
                                            type="number"
                                            value={form.mongoServerSelectTimeout ?? 10}
                                            onChange={(e) => update({mongoServerSelectTimeout: Number(e.target.value) || 10})}
                                        />
                                    </label>
                                </div>
                                <div className={g.fieldRow}>
                                    <label className={`${g.field} ${g.grow}`}>
                                        <span>Socket 超时(秒，0=默认)</span>
                                        <input
                                            type="number"
                                            value={form.mongoSocketTimeout ?? 30}
                                            onChange={(e) => update({mongoSocketTimeout: Number(e.target.value) || 30})}
                                        />
                                    </label>
                                    <label className={g.field}>
                                        <span>连接最大空闲(秒，0=默认)</span>
                                        <input
                                            type="number"
                                            value={form.mongoMaxConnIdleTime ?? 0}
                                            onChange={(e) => update({mongoMaxConnIdleTime: Number(e.target.value) || 0})}
                                        />
                                    </label>
                                </div>
                                <div className={g.fieldRow}>
                                    <label className={`${g.field} ${g.grow}`}>
                                        <span>压缩器（逗号分隔，可选）</span>
                                        <input
                                            value={form.mongoCompressors ?? ''}
                                            placeholder="如 snappy,zlib,zstd；留空不压缩"
                                            onChange={(e) => update({mongoCompressors: e.target.value})}
                                        />
                                    </label>
                                    <label className={`${g.field} ${g.grow}`}>
                                        <span>应用名</span>
                                        <input
                                            value={form.mongoAppName ?? 'xClient'}
                                            onChange={(e) => update({mongoAppName: e.target.value})}
                                        />
                                    </label>
                                </div>
                            </>
                        )}
                    </>
                )}

                {form.type === 'sqlite' && (
                    <>
                        <label className={g.field}>
                            <span>数据库文件（.db / .sqlite）</span>
                            <div className={g.fieldRow}>
                                <input
                                    className={g.grow}
                                    value={form.sqlitePath ?? ''}
                                    placeholder="点击右侧按钮选择本地 SQLite 文件"
                                    onChange={(e) => update({sqlitePath: e.target.value})}
                                />
                                <button
                                    type="button"
                                    className={g.btn}
                                    onClick={async () => {
                                        try {
                                            const p = await API.sqliteOpenFile()
                                            if (p) {
                                                const dbName = p.split(/[\\/]/).pop() || ''
                                                const hasCustomName = form.name && !form.name.includes('/') && !form.name.includes('\\')
                                                update({
                                                    sqlitePath: p,
                                                    name: hasCustomName ? form.name : dbName,
                                                })
                                            }
                                        } catch (err) {
                                            setError(errorMessage(err))
                                        }
                                    }}
                                >
                                    浏览
                                </button>
                            </div>
                        </label>
                        <p className={g.formHint}>SQLite 为本地文件数据库，连接时可直接选取文件，无需主机地址与端口。</p>
                    </>
                )}

                <label className={g.field}>
                    <span>备注</span>
                    <input value={form.remark} onChange={(e) => update({remark: e.target.value})}/>
                </label>
            </div>
        </Modal>
    )
}
