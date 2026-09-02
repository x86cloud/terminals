import React from 'react'
import { Input, Select } from 'antd'
import { ServerConfig, ServerGroup } from '@/types'

interface Props {
    form: ServerConfig
    update: (patch: Partial<ServerConfig>) => void
    groups: ServerGroup[]
}

export const BasicFields: React.FC<Props> = ({ form, update, groups }) => {
    return (
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
    )
}
