import React from 'react'
import { Input, Button, Space } from 'antd'
import { FolderOpen } from 'lucide-react'
import { API } from '@/api'
import { errorMessage } from '@/utils'
import { BasicFields } from './BasicFields'
import { ServerFormProps } from './types'

export const SqliteForm: React.FC<ServerFormProps> = ({
    form,
    update,
    groups,
    setError,
}) => {
    const handlePickSqlite = async () => {
        try {
            const path = await API.sqliteOpenFile()
            if (path) {
                update({ sqlitePath: path })
            }
        } catch (err) {
            const msg = errorMessage(err)
            if (msg) setError(msg)
        }
    }

    return (
        <Space orientation="vertical" size={14} style={{ width: '100%' }}>
            <BasicFields form={form} update={update} groups={groups} />

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
        </Space>
    )
}
