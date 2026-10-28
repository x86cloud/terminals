import React from 'react'
import { Input, InputNumber, Radio, Button, Space, Collapse } from 'antd'
import { Key, Sliders } from 'lucide-react'
import { useTranslation } from 'react-i18next'
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
    const { t } = useTranslation(['server', 'common'])

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
                    <div style={{ fontSize: 13, marginBottom: 4, fontWeight: 500 }}>{t('host')}</div>
                    <Input
                        placeholder={t('hostPlaceholder')}
                        value={form.host}
                        onChange={(e) => update({ host: e.target.value })}
                    />
                </div>
                <div>
                    <div style={{ fontSize: 13, marginBottom: 4, fontWeight: 500 }}>{t('port')}</div>
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
                    <div style={{ fontSize: 13, marginBottom: 4, fontWeight: 500 }}>{t('username')}</div>
                    <Input
                        placeholder={t('usernamePlaceholder')}
                        value={form.username}
                        onChange={(e) => update({ username: e.target.value })}
                    />
                </div>
                <div>
                    <div style={{ fontSize: 13, marginBottom: 4, fontWeight: 500 }}>{t('authType')}</div>
                    <Radio.Group
                        value={form.authType || 'password'}
                        onChange={(e) => update({ authType: e.target.value })}
                        buttonStyle="solid"
                    >
                        <Radio.Button value="password">{t('authPassword')}</Radio.Button>
                        <Radio.Button value="key">{t('authKey')}</Radio.Button>
                    </Radio.Group>
                </div>
            </div>

            {form.authType === 'key' ? (
                <>
                    <div>
                        <div style={{ fontSize: 13, marginBottom: 4, fontWeight: 500 }}>{t('privateKey')}</div>
                        <Space.Compact style={{ width: '100%' }}>
                            <Input
                                placeholder={t('privateKeyPlaceholder')}
                                value={form.privateKey || ''}
                                onChange={(e) => update({ privateKey: e.target.value })}
                            />
                            <Button icon={<Key size={14} />} onClick={handlePickPrivateKey}>
                                {t('selectKeyFile')}
                            </Button>
                        </Space.Compact>
                    </div>
                    <div>
                        <div style={{ fontSize: 13, marginBottom: 4, fontWeight: 500 }}>{t('passphrase')}</div>
                        <Input.Password
                            placeholder={t('passphrasePlaceholder')}
                            value={form.passphrase || ''}
                            onChange={(e) => update({ passphrase: e.target.value })}
                        />
                    </div>
                </>
            ) : (
                <div>
                    <div style={{ fontSize: 13, marginBottom: 4, fontWeight: 500 }}>{t('password')}</div>
                    <Input.Password
                        placeholder={t('passwordPlaceholder')}
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
                                <span style={{ fontSize: 13 }}>{t('advanced')}</span>
                            </Space>
                        ),
                        children: (
                            <Space orientation="vertical" size={10} style={{ width: '100%' }}>
                                <div>
                                    <div style={{ fontSize: 12, marginBottom: 4 }}>{t('ssh.sftpHome')}</div>
                                    <Input
                                        placeholder={t('ssh.sftpHomePlaceholder')}
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
