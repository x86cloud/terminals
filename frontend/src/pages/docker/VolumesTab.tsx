import { useState, useEffect } from 'react'
import {
    Table,
    Button,
    Input,
    Space,
    Tag,
    Modal as AntdModal,
    Tooltip,
    App,
    Popconfirm,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { Plus, Trash2, RefreshCw, Search, Copy } from 'lucide-react'
import { API } from '@/api'
import { copyText } from '@/utils'
import type { DockerVolumeInfo } from '@/types'
import { useTranslation } from 'react-i18next'
import s from './DockerClient.module.less'

interface Props {
    serverId: string
}

export default function VolumesTab({ serverId }: Props) {
    const { t } = useTranslation(['docker', 'common'])
    const { message } = App.useApp()
    const [volumes, setVolumes] = useState<DockerVolumeInfo[]>([])
    const [loading, setLoading] = useState(false)
    const [searchKw, setSearchKw] = useState('')
    const [page, setPage] = useState(1)
    const [pageSize, setPageSize] = useState(10)

    // 创建卷模态框
    const [createModal, setCreateModal] = useState(false)
    const [volName, setVolName] = useState('')
    const [volDriver, setVolDriver] = useState('local')
    const [creating, setCreating] = useState(false)

    const fetchVolumes = async () => {
        setLoading(true)
        try {
            const list = await API.dockerListVolumes(serverId)
            setVolumes(list)
        } catch (err: any) {
            message.error(t('volumes.fetchFail', { defaultValue: '获取数据卷列表失败: {{error}}', error: err.message || String(err) }))
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchVolumes()
    }, [serverId])

    const handleCreate = async () => {
        if (!volName.trim()) {
            message.warning(t('volumes.reqName', '请输入数据卷名称'))
            return
        }
        setCreating(true)
        try {
            await API.dockerCreateVolume(serverId, volName.trim(), volDriver.trim() || 'local', {})
            setCreateModal(false)
            setVolName('')
            fetchVolumes()
        } catch (err: any) {
            message.error(t('volumes.createFail', { defaultValue: '创建数据卷失败: {{error}}', error: err.message || String(err) }))
        } finally {
            setCreating(false)
        }
    }

    const handleDelete = async (name: string) => {
        try {
            await API.dockerRemoveVolume(serverId, name, true)
            fetchVolumes()
        } catch (err: any) {
            message.error(t('volumes.deleteFail', { defaultValue: '删除数据卷失败: {{error}}', error: err.message || String(err) }))
        }
    }

    const filtered = volumes.filter((v) => {
        if (searchKw.trim()) {
            const kw = searchKw.toLowerCase()
            const matchName = v.name.toLowerCase().includes(kw)
            const matchMount = (v.mountpoint || '').toLowerCase().includes(kw)
            if (!matchName && !matchMount) return false
        }
        return true
    })

    const columns: ColumnsType<DockerVolumeInfo> = [
        {
            title: t('volumes.colName', '卷名称 (Volume Name)'),
            dataIndex: 'name',
            render: (name: string) => (
                <div style={{ fontWeight: 600, color: 'var(--text)' }} className={s.monoText}>
                    {name}
                </div>
            ),
        },
        {
            title: t('volumes.colDriver', '驱动 (Driver)'),
            dataIndex: 'driver',
            width: 120,
            render: (driver: string) => <Tag color="blue">{driver || 'local'}</Tag>,
        },
        {
            title: t('volumes.colMountpoint', '宿主机挂载点 (Mountpoint)'),
            dataIndex: 'mountpoint',
            ellipsis: true,
            render: (mountpoint: string) => (
                <Space size={4}>
                    <span className={s.monoText} style={{ fontSize: 11.5 }} title={mountpoint}>
                        {mountpoint}
                    </span>
                    <Tooltip title={t('volumes.copyMountpoint', '复制挂载路径')}>
                        <Button
                            size="small"
                            type="text"
                            icon={<Copy size={11} />}
                            onClick={async () => {
                                if (await copyText(mountpoint)) {
                                    message.success(t('volumes.copiedMountpoint', '已复制挂载路径'))
                                }
                            }}
                        />
                    </Tooltip>
                </Space>
            ),
        },
        {
            title: t('volumes.colCreatedAt', '创建时间'),
            dataIndex: 'createdAt',
            width: 200,
            render: (createdAt: string) => (
                <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{createdAt || '-'}</span>
            ),
        },
        {
            title: t('volumes.colActions', '操作'),
            key: 'actions',
            width: 100,
            fixed: 'right',
            render: (_, record) => (
                <Popconfirm
                    title={t('volumes.confirmDelete', '确定要删除此数据卷吗？')}
                    description={t('volumes.deleteDesc', '若数据卷内有持久化数据，删除将永久丢失')}
                    onConfirm={() => handleDelete(record.name)}
                    okText={t('volumes.deleteBtn', '删除')}
                    cancelText={t('volumes.cancelBtn', '取消')}
                    okButtonProps={{ danger: true }}
                >
                    <Tooltip title={t('volumes.deleteTooltip', '删除数据卷')}>
                        <Button size="small" type="text" danger icon={<Trash2 size={13} />} />
                    </Tooltip>
                </Popconfirm>
            ),
        },
    ]

    return (
        <div>
            {/* 顶部工具栏 */}
            <div className={s.toolbar}>
                <div className={s.toolbarLeft}>
                    <Input
                        placeholder={t('volumes.searchPlaceholder', '搜索数据卷名称 / 挂载路径...')}
                        prefix={<Search size={13} color="var(--text-dim)" />}
                        value={searchKw}
                        onChange={(e) => {
                            setSearchKw(e.target.value)
                            setPage(1)
                        }}
                        style={{ width: 280 }}
                        size="small"
                        allowClear
                    />
                </div>

                <div className={s.toolbarRight}>
                    <Button
                        type="primary"
                        icon={<Plus size={14} />}
                        size="small"
                        onClick={() => setCreateModal(true)}
                    >
                        {t('volumes.newVolume', '新建数据卷')}
                    </Button>
                    <Button
                        icon={<RefreshCw size={13} className={loading ? 'animate-spin' : ''} />}
                        size="small"
                        onClick={fetchVolumes}
                    >
                        {t('common:refresh', '刷新')}
                    </Button>
                </div>
            </div>

            {/* 数据卷表格 */}
            <Table
                columns={columns}
                dataSource={filtered}
                rowKey="name"
                loading={loading}
                size="small"
                pagination={{
                    current: page,
                    pageSize: pageSize,
                    total: filtered.length,
                    showSizeChanger: true,
                    pageSizeOptions: ['10', '20', '50', '100'],
                    showTotal: (total, range) => t('common:pagination.totalRange', { from: range[0], to: range[1], total, defaultValue: `第 ${range[0]}-${range[1]} 条 / 共 ${total} 条` }),
                    onChange: (p, ps) => {
                        setPage(p)
                        setPageSize(ps)
                    },
                }}
            />

            {/* 创建卷模态框 */}
            <AntdModal
                title={t('volumes.createTitle', '新建 Docker 数据卷')}
                open={createModal}
                onCancel={() => !creating && setCreateModal(false)}
                onOk={handleCreate}
                confirmLoading={creating}
                okText={t('volumes.createBtn', '创建')}
                cancelText={t('volumes.cancelBtn', '取消')}
                width={480}
                centered
            >
                <Space orientation="vertical" size={12} style={{ width: '100%', padding: '8px 0' }}>
                    <div>
                        <div style={{ fontSize: 13, marginBottom: 4, fontWeight: 500 }}>
                            {t('volumes.volNameLabel', '数据卷名称 (Volume Name)')} <span style={{ color: 'var(--danger)' }}>*</span>
                        </div>
                        <Input
                            placeholder={t('volumes.volNamePlaceholder', '如: app_data / db_volume')}
                            value={volName}
                            onChange={(e) => setVolName(e.target.value)}
                            onPressEnter={handleCreate}
                        />
                    </div>
                    <div>
                        <div style={{ fontSize: 13, marginBottom: 4, fontWeight: 500 }}>{t('volumes.driverLabel', '驱动 (Driver)')}</div>
                        <Input
                            placeholder="local"
                            value={volDriver}
                            onChange={(e) => setVolDriver(e.target.value)}
                        />
                    </div>
                </Space>
            </AntdModal>
        </div>
    )
}
