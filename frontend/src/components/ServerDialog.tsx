import React, { useEffect, useState } from 'react'
import {
    Modal as AntdModal,
    Button,
    Space,
    Tabs,
    Alert,
} from 'antd'
import { Server } from 'lucide-react'
import { API } from '@/api'
import ClientIcon from '@/components/ClientIcon'
import { emptyServer, ServerConfig, ServerGroup, ConnType } from '@/types'
import { errorMessage } from '@/utils'
import {
    serverFormComponents,
    initServerForm,
    getSwitchedTypePatch,
    validateServerForm,
} from './server-forms'

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
            setForm(initServerForm(initial))
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
        update(getSwitchedTypePatch(t, form))
    }

    const save = async (connect: boolean) => {
        const valErr = validateServerForm(form)
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

    const handleTestConnection = async () => {
        const valErr = validateServerForm(form)
        if (valErr) {
            setError(valErr)
            return
        }
        setBusy(true)
        setTestResult(null)
        try {
            if (form.type === 'docker') {
                const msg = await API.dockerTestConnection(form)
                setTestResult({ success: true, message: msg || 'Docker 连通性测试通过！' })
            } else if (form.type === 'mongo') {
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
            } else if (form.type === 'postgres') {
                const res = await API.postgresTestConnection(form)
                setTestResult({ success: true, message: `PostgreSQL 连接成功! 延迟: ${res.pingMs || 0}ms` })
            } else if (form.type === 'k8s') {
                const res = await API.k8sTestConnection(form)
                setTestResult({ success: true, message: res || 'Kubernetes 连接测试成功！' })
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
        { key: 'docker', label: <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><ClientIcon kind="docker" size={14} /><span>Docker</span></span> },
        { key: 'k8s', label: <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><ClientIcon kind="k8s" size={14} /><span>K8s</span></span> },
        { key: 'redis', label: <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><ClientIcon kind="redis" size={14} /><span>Redis</span></span> },
        { key: 'mysql', label: <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><ClientIcon kind="mysql" size={14} /><span>MySQL</span></span> },
        { key: 'postgres', label: <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><ClientIcon kind="postgres" size={14} /><span>PostgreSQL</span></span> },
        { key: 'mongo', label: <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><ClientIcon kind="mongo" size={14} /><span>MongoDB</span></span> },
        { key: 'sqlite', label: <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><ClientIcon kind="sqlite" size={14} /><span>SQLite</span></span> },
        { key: 'mqtt', label: <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><ClientIcon kind="mqtt" size={14} /><span>MQTT</span></span> },
    ]

    const ActiveForm = serverFormComponents[form.type || 'ssh'] || serverFormComponents.ssh

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
                        {['mongo', 'redis', 'mysql', 'postgres', 'mqtt', 'docker', 'k8s'].includes(form.type || '') && (
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

                {/* 对应协议子表单组件 */}
                <ActiveForm
                    form={form}
                    update={update}
                    groups={groups}
                    setError={setError}
                    setTestResult={setTestResult}
                />
            </div>
        </AntdModal>
    )
}
