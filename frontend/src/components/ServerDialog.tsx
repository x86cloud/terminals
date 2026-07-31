import React, {useEffect, useState} from 'react'
import {Modal} from './Modal'
import {API} from '../api'
import {emptyServer, ServerConfig} from '../types'
import {errorMessage} from '../utils'

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

    useEffect(() => {
        if (open) {
            setForm(initial ? {...initial} : emptyServer())
            setError('')
        }
    }, [open, initial])

    const update = (patch: Partial<ServerConfig>) => setForm((prev) => ({...prev, ...patch}))

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

    return (
        <Modal
            open={open}
            title={initial?.id ? '编辑服务器' : '新建服务器'}
            onClose={onClose}
            width={520}
            footer={
                <>
                    {error && <span className="form-error">{error}</span>}
                    <span className="spacer"/>
                    <button className="btn" onClick={onClose} disabled={busy}>取消</button>
                    <button className="btn" onClick={() => save(false)} disabled={busy}>保存</button>
                    <button className="btn primary" onClick={() => save(true)} disabled={busy}>保存并连接</button>
                </>
            }
        >
            <div className="form-grid">
                <label className="field">
                    <span>名称</span>
                    <input
                        value={form.name}
                        placeholder="可选，例如 生产环境-web01"
                        onChange={(e) => update({name: e.target.value})}
                    />
                </label>

                <div className="field-row">
                    <label className="field grow">
                        <span>主机</span>
                        <input
                            value={form.host}
                            placeholder="192.168.1.10"
                            onChange={(e) => update({host: e.target.value})}
                        />
                    </label>
                    <label className="field port">
                        <span>端口</span>
                        <input
                            type="number"
                            value={form.port}
                            onChange={(e) => update({port: Number(e.target.value) || 22})}
                        />
                    </label>
                </div>

                <label className="field">
                    <span>用户名</span>
                    <input value={form.username} onChange={(e) => update({username: e.target.value})}/>
                </label>

                <div className="field">
                    <span>认证方式</span>
                    <div className="segmented">
                        <button
                            className={form.authType === 'password' ? 'active' : ''}
                            onClick={() => update({authType: 'password'})}
                        >
                            密码
                        </button>
                        <button
                            className={form.authType === 'key' ? 'active' : ''}
                            onClick={() => update({authType: 'key'})}
                        >
                            私钥
                        </button>
                    </div>
                </div>

                {form.authType === 'password' ? (
                    <label className="field">
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
                        <label className="field">
                            <span>私钥文件</span>
                            <div className="field-row">
                                <input
                                    className="grow"
                                    value={form.privateKey}
                                    placeholder="私钥文件路径或直接粘贴 PEM 内容"
                                    onChange={(e) => update({privateKey: e.target.value})}
                                />
                                <button className="btn" onClick={pickKey}>浏览</button>
                            </div>
                        </label>
                        <label className="field">
                            <span>私钥密码（可选）</span>
                            <input
                                type="password"
                                value={form.passphrase}
                                onChange={(e) => update({passphrase: e.target.value})}
                            />
                        </label>
                    </>
                )}

                <label className="field">
                    <span>备注</span>
                    <input value={form.remark} onChange={(e) => update({remark: e.target.value})}/>
                </label>
            </div>
        </Modal>
    )
}
