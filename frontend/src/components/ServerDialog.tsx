import React, {useEffect, useState} from 'react'
import {Modal} from './Modal'
import {API} from '../api'
import {emptyServer, ServerConfig, ConnType} from '../types'
import {errorMessage} from '../utils'
import Icon from './Icon'
import ClientIcon from './ClientIcon'
import g from '../styles/global.module.less'

interface Props {
    open: boolean
    initial: ServerConfig | null
    onClose: () => void
    onSaved: (cfg: ServerConfig) => void
    onSaveAndConnect: (cfg: ServerConfig) => void
}

export default function ServerDialog({open, initial, onClose, onSaved, onSaveAndConnect}: Props) {
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
                    base.type === 'redis' ? 6379 : base.type === 'mysql' ? 3306 : base.type === 'mqtt' ? 1883 : 22
            if (!base.username && (base.type === 'ssh' || base.type === 'mysql')) base.username = 'root'
            setForm(base)
            setError('')
            setShowAdv(false)
        }
    }, [open, initial])

    const update = (patch: Partial<ServerConfig>) => setForm((prev) => ({...prev, ...patch}))

    const switchType = (t: ConnType) => {
        const defaultPort = t === 'redis' ? 6379 : t === 'mysql' ? 3306 : t === 'mqtt' ? 1883 : 22
        update({
            type: t,
            port:
                form.port === 22 || form.port === 6379 || form.port === 3306 || form.port === 1883 || !form.port
                    ? defaultPort
                    : form.port,
            username: t === 'redis' || t === 'mqtt' ? '' : form.username || 'root',
        })
    }

    const save = async (connect: boolean) => {
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

    return (
        <Modal
            open={open}
            title={initial?.id ? '编辑服务器' : '新建服务器'}
            onClose={onClose}
            width={520}
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
                                update({port: Number(e.target.value) || (isRedis ? 6379 : isMysql ? 3306 : isMqtt ? 1883 : 22)})
                            }
                        />
                    </label>
                </div>

                {!isRedis && (
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
                                        <button className={g.btn} onClick={pickKey}>浏览</button>
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

                <label className={g.field}>
                    <span>备注</span>
                    <input value={form.remark} onChange={(e) => update({remark: e.target.value})}/>
                </label>
            </div>
        </Modal>
    )
}
