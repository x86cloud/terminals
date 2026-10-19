import { useState } from 'react'
import { Modal, Input, Switch, Alert, InputNumber, Space, Select, Checkbox, Tag } from 'antd'

export type MongoObjModalKind =
    | 'createdb'
    | 'createcoll'
    | 'dropdb'
    | 'dropcoll'
    | 'truncatecoll'
    | 'renamecoll'
    | 'clonecoll'

interface Props {
    kind: MongoObjModalKind
    db?: string
    coll?: string
    busy: boolean
    msg: string
    name: string
    onName: (v: string) => void
    onClose: () => void
    databases?: string[]
    onConfirm: (extraOptions?: {
        capped?: boolean
        size?: number
        max?: number
        firstColl?: string
        isTimeseries?: boolean
        timeField?: string
        metaField?: string
        granularity?: string
        targetDb?: string
        copyData?: boolean
    }) => void
}

export default function ObjModal(props: Props) {
    const { kind, db, coll, busy, msg, name, onName, onClose, onConfirm, databases = [] } = props

    const [firstColl, setFirstColl] = useState('default')
    const [isCapped, setIsCapped] = useState(false)
    const [cappedSize, setCappedSize] = useState<number>(10485760) // 10MB
    const [cappedMax, setCappedMax] = useState<number | undefined>(undefined)

    // 时序集合配置 (MongoDB 5.0+)
    const [isTimeseries, setIsTimeseries] = useState(false)
    const [timeField, setTimeField] = useState('timestamp')
    const [metaField, setMetaField] = useState('')
    const [granularity, setGranularity] = useState('seconds')

    // 克隆集合配置
    const [cloneTargetDb, setCloneTargetDb] = useState(db || 'admin')
    const [cloneCopyData, setCloneCopyData] = useState(true)

    const titleMap: Record<MongoObjModalKind, string> = {
        createdb: '新建数据库',
        createcoll: db ? `在 ${db} 中新建集合` : '新建集合',
        dropdb: '删除数据库',
        dropcoll: '删除集合',
        truncatecoll: '清空集合数据',
        renamecoll: '重命名集合',
        clonecoll: `克隆集合 - ${db}.${coll}`,
    }

    const needName = ['createdb', 'createcoll', 'renamecoll', 'clonecoll'].includes(kind)
    const needConfirm = ['dropdb', 'dropcoll', 'truncatecoll'].includes(kind)
    const isDanger = needConfirm

    const handleOk = () => {
        if (kind === 'createdb') {
            onConfirm({ firstColl: firstColl.trim() || 'default' })
        } else if (kind === 'createcoll') {
            onConfirm({
                capped: isCapped,
                size: isCapped ? cappedSize : undefined,
                max: isCapped && cappedMax ? cappedMax : undefined,
                isTimeseries,
                timeField: isTimeseries ? timeField.trim() : undefined,
                metaField: isTimeseries && metaField.trim() ? metaField.trim() : undefined,
                granularity: isTimeseries ? granularity : undefined,
            })
        } else if (kind === 'clonecoll') {
            onConfirm({
                targetDb: cloneTargetDb,
                copyData: cloneCopyData,
            })
        } else {
            onConfirm()
        }
    }

    return (
        <Modal
            open={true}
            title={titleMap[kind] || '数据库操作'}
            onCancel={() => !busy && onClose()}
            onOk={handleOk}
            confirmLoading={busy}
            okText={needConfirm ? '确认执行' : '确定'}
            cancelText="取消"
            okButtonProps={{ danger: isDanger, disabled: busy || (needName && !name.trim()) }}
            width={kind === 'createcoll' || kind === 'clonecoll' ? 520 : 440}
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '10px 0' }}>
                {msg && (
                    <Alert
                        type={msg.includes('失败') || msg.includes('错误') ? 'error' : 'success'}
                        showIcon
                        message={msg}
                    />
                )}

                {needConfirm && (
                    <div style={{ fontSize: 13, lineHeight: 1.6 }}>
                        {kind === 'dropdb' && (
                            <p style={{ margin: 0, color: '#ef4444' }}>
                                确定要永久删除数据库 <strong>{name || db}</strong> 吗？
                                <br />
                                警告：库中所有集合与数据将被永久物理删除，操作无法恢复！
                            </p>
                        )}
                        {kind === 'dropcoll' && (
                            <p style={{ margin: 0, color: '#ef4444' }}>
                                确定要删除集合 <strong>{coll || name}</strong> 吗？
                                <br />
                                集合中的所有文档和索引将被清空销毁。
                            </p>
                        )}
                        {kind === 'truncatecoll' && (
                            <p style={{ margin: 0, color: '#f59e0b' }}>
                                确定要清空集合 <strong>{coll || name}</strong> 中的所有文档吗？
                                <br />
                                集合结构与索引将被保留，所有文档数据将被移除。
                            </p>
                        )}
                    </div>
                )}

                {kind === 'createdb' && (
                    <>
                        <div>
                            <label style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 6, display: 'block' }}>
                                数据库名称
                            </label>
                            <Input
                                value={name}
                                onChange={(e) => onName(e.target.value)}
                                placeholder="例如 app_db"
                                autoFocus
                            />
                        </div>
                        <div>
                            <label style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 6, display: 'block' }}>
                                初始默认集合名（MongoDB 需至少包含一个集合方可持久化库）
                            </label>
                            <Input
                                value={firstColl}
                                onChange={(e) => setFirstColl(e.target.value)}
                                placeholder="例如 default"
                            />
                        </div>
                    </>
                )}

                {kind === 'renamecoll' && (
                    <div>
                        <label style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 6, display: 'block' }}>
                            新集合名称
                        </label>
                        <Input
                            value={name}
                            onChange={(e) => onName(e.target.value)}
                            placeholder="新集合名称"
                            autoFocus
                        />
                    </div>
                )}

                {kind === 'clonecoll' && (
                    <>
                        <div>
                            <label style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 6, display: 'block' }}>
                                源集合：
                            </label>
                            <Tag color="blue" style={{ fontSize: 12, padding: '2px 8px' }}>
                                {db}.{coll}
                            </Tag>
                        </div>

                        <div>
                            <label style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 6, display: 'block' }}>
                                目标数据库：
                            </label>
                            <Select
                                style={{ width: '100%' }}
                                value={cloneTargetDb}
                                onChange={setCloneTargetDb}
                                options={databases.map((d) => ({ label: d, value: d }))}
                            />
                        </div>

                        <div>
                            <label style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 6, display: 'block' }}>
                                新集合名称：
                            </label>
                            <Input
                                value={name}
                                onChange={(e) => onName(e.target.value)}
                                placeholder={`如 ${coll}_copy`}
                                autoFocus
                            />
                        </div>

                        <div style={{ marginTop: 4 }}>
                            <Checkbox checked={cloneCopyData} onChange={(e) => setCloneCopyData(e.target.checked)}>
                                <span style={{ fontSize: 12.5, fontWeight: 500 }}>
                                    包含数据 (全量文档克隆)
                                </span>
                            </Checkbox>
                            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginLeft: 22, marginTop: 2 }}>
                                {cloneCopyData
                                    ? '将复制源集合的所有索引结构与现有文档数据'
                                    : '仅克隆集合索引与验证结构，不包含任何现有文档数据'}
                            </div>
                        </div>
                    </>
                )}

                {kind === 'createcoll' && (
                    <>
                        <div>
                            <label style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 6, display: 'block' }}>
                                集合名称
                            </label>
                            <Input
                                value={name}
                                onChange={(e) => onName(e.target.value)}
                                placeholder="例如 logs, users, orders"
                                autoFocus
                            />
                        </div>

                        {/* 固定上限集合 */}
                        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, marginTop: 4 }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                <div>
                                    <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>固定上限集合 (Capped Collection)</span>
                                    <p style={{ margin: 0, fontSize: 11.5, color: 'var(--text-dim)' }}>
                                        循环队列集合，当达到存储上限时自动覆盖最老文档
                                    </p>
                                </div>
                                <Switch
                                    checked={isCapped}
                                    disabled={isTimeseries}
                                    onChange={(v) => {
                                        setIsCapped(v)
                                        if (v) setIsTimeseries(false)
                                    }}
                                    size="small"
                                />
                            </div>

                            {isCapped && (
                                <Space direction="vertical" style={{ width: '100%', paddingLeft: 12 }} size={10}>
                                    <div>
                                        <span style={{ fontSize: 12, color: 'var(--text-dim)', display: 'block', marginBottom: 4 }}>
                                            最大存储容量 (Bytes，必填)
                                        </span>
                                        <InputNumber
                                            style={{ width: '100%' }}
                                            min={4096}
                                            value={cappedSize}
                                            onChange={(v) => setCappedSize(v ?? 10485760)}
                                            addonAfter="Bytes (~10MB)"
                                        />
                                    </div>
                                    <div>
                                        <span style={{ fontSize: 12, color: 'var(--text-dim)', display: 'block', marginBottom: 4 }}>
                                            最大文档数 (Max Documents，可选)
                                        </span>
                                        <InputNumber
                                            style={{ width: '100%' }}
                                            min={1}
                                            value={cappedMax}
                                            onChange={(v) => setCappedMax(v ?? undefined)}
                                            placeholder="无上限限制"
                                        />
                                    </div>
                                </Space>
                            )}
                        </div>

                        {/* 时序集合配置 */}
                        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, marginTop: 4 }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                <div>
                                    <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>时序集合 (TimeSeries Collection)</span>
                                    <p style={{ margin: 0, fontSize: 11.5, color: 'var(--text-dim)' }}>
                                        MongoDB 5.0+ 高性能时间序列数据引擎（IoT设备、监控指标）
                                    </p>
                                </div>
                                <Switch
                                    checked={isTimeseries}
                                    disabled={isCapped}
                                    onChange={(v) => {
                                        setIsTimeseries(v)
                                        if (v) setIsCapped(false)
                                    }}
                                    size="small"
                                />
                            </div>

                            {isTimeseries && (
                                <Space direction="vertical" style={{ width: '100%', paddingLeft: 12 }} size={10}>
                                    <div>
                                        <span style={{ fontSize: 12, color: 'var(--text-dim)', display: 'block', marginBottom: 4 }}>
                                            时间戳字段名 (timeField，必填)：
                                        </span>
                                        <Input
                                            placeholder="例如 timestamp 或 createdAt"
                                            value={timeField}
                                            onChange={(e) => setTimeField(e.target.value)}
                                        />
                                    </div>
                                    <div>
                                        <span style={{ fontSize: 12, color: 'var(--text-dim)', display: 'block', marginBottom: 4 }}>
                                            元数据标识字段 (metaField，可选)：
                                        </span>
                                        <Input
                                            placeholder="例如 metadata 或 sensorId"
                                            value={metaField}
                                            onChange={(e) => setMetaField(e.target.value)}
                                        />
                                    </div>
                                    <div>
                                        <span style={{ fontSize: 12, color: 'var(--text-dim)', display: 'block', marginBottom: 4 }}>
                                            时间采样粒度 (granularity)：
                                        </span>
                                        <Select
                                            style={{ width: '100%' }}
                                            value={granularity}
                                            onChange={setGranularity}
                                            options={[
                                                { label: '秒级 (seconds) - 适用于高频 IoT 传感器', value: 'seconds' },
                                                { label: '分钟级 (minutes) - 适用于系统运行指标监控', value: 'minutes' },
                                                { label: '小时级 (hours) - 适用于低频业务统计', value: 'hours' },
                                            ]}
                                        />
                                    </div>
                                </Space>
                            )}
                        </div>
                    </>
                )}
            </div>
        </Modal>
    )
}
