import React from 'react'
import { Input, InputNumber, Radio, Button, Space, Collapse } from 'antd'
import { Key, Sliders } from 'lucide-react'
import { API } from '@/api'
import { errorMessage } from '@/utils'
import { BasicFields } from './BasicFields'
import { ServerFormProps } from './types'

export const SshForm: React.FC<ServerFormProps> = ({
    form,
    update,
    groups,
    setError,
}) => {
    const handlePickPrivateKey = async () => {
        try {
            const path = await API.selectPrivateKey()
            if (path) {
                update({ privateKey: path })
            }
        } catch (err) {
            const msg = errorMessage(err)
            if (msg) setError(msg)
        }
    }

    return (
        <Space orientation="vertical" size={14} style={{ width: '100%' }}>
            <BasicFields form={form} update={update} groups={groups} />

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
                        onChange={(val) => update({ port: val || 22 })}
                    />
                </div>
            </div>

            {/* 用户名与认证方式 */}
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

            {/* 高级选项 */}
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
                                <div>
                                    <div style={{ fontSize: 12, marginBottom: 4 }}>SFTP 默认初始路径</div>
                                    <Input
                                        placeholder="/root 或 /home/user"
                                        value={form.sftpHome || ''}
                                        onChange={(e) => update({ sftpHome: e.target.value })}
                                    />
                                </div>
                            </Space>
                        ),
                    },
                ]}
            />
        </Space>
    )
}
