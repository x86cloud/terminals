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
