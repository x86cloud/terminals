import React from 'react'
import { Input, Select } from 'antd'
import { useTranslation } from 'react-i18next'
import { ServerConfig, ServerGroup } from '@/types'

interface Props {
    form: ServerConfig
    update: (patch: Partial<ServerConfig>) => void
    groups: ServerGroup[]
}

export const BasicFields: React.FC<Props> = ({ form, update, groups }) => {
    const { t } = useTranslation('server')

    return (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
                <div style={{ fontSize: 13, marginBottom: 4, fontWeight: 500 }}>{t('name')}</div>
                <Input
                    placeholder={t('namePlaceholder')}
                    value={form.name}
                    onChange={(e) => update({ name: e.target.value })}
                />
            </div>
            <div>
                <div style={{ fontSize: 13, marginBottom: 4, fontWeight: 500 }}>{t('group')}</div>
                <Select
                    style={{ width: '100%' }}
                    value={form.groupId || ''}
                    onChange={(val) => update({ groupId: val })}
                    options={[
                        { label: t('noGroup'), value: '' },
                        ...groups.map((g) => ({ label: g.name, value: g.id })),
                    ]}
                />
            </div>
        </div>
    )
}
