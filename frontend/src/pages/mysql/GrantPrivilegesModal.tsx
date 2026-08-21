import React, { useState, useEffect, useMemo } from 'react'
import { Modal, Form, Select, Segmented, Checkbox, Switch, Button, Tag, Space, Alert, Divider } from 'antd'
import { KeyRound, Shield, Eye, Sparkles, CheckSquare, Square } from 'lucide-react'
import { API } from '@/api'
import { errorMessage } from '@/utils'

interface Props {
    open: boolean
    sessionId: string
    user: string
    host: string
    databases: string[]
    onClose: () => void
    onSuccess: () => void
}

const DML_PRIVS = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'EXECUTE', 'LOCK TABLES']
const DDL_PRIVS = [
    'CREATE',
    'ALTER',
    'DROP',
    'INDEX',
    'CREATE VIEW',
    'SHOW VIEW',
    'CREATE ROUTINE',
    'ALTER ROUTINE',
    'TRIGGER',
]
const ADMIN_PRIVS = [
    'ALL PRIVILEGES',
    'GRANT OPTION',
    'SUPER',
    'PROCESS',
    'RELOAD',
    'SHOW DATABASES',
    'REPLICATION CLIENT',
    'REPLICATION SLAVE',
]

export const GrantPrivilegesModal: React.FC<Props> = ({
    open,
    sessionId,
    user,
    host,
    databases,
    onClose,
    onSuccess,
}) => {
    const [form] = Form.useForm()
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')

    const [scope, setScope] = useState<'global' | 'database' | 'table'>('database')
    const [selectedDb, setSelectedDb] = useState<string>(databases[0] || '')
    const [selectedTable, setSelectedTable] = useState<string>('')
    const [tables, setTables] = useState<string[]>([])
    const [loadingTables, setLoadingTables] = useState(false)

    const [checkedPrivs, setCheckedPrivs] = useState<string[]>(['SELECT', 'INSERT', 'UPDATE', 'DELETE'])
    const [withGrantOption, setWithGrantOption] = useState<boolean>(false)

    // Load tables when DB changes
    useEffect(() => {
        if (scope === 'table' && selectedDb && sessionId) {
            setLoadingTables(true)
            API.mysqlTables(sessionId, selectedDb)
                .then((tbls) => {
                    const list = tbls || []
                    setTables(list)
                    if (list.length > 0 && !list.includes(selectedTable)) {
                        setSelectedTable(list[0])
                        form.setFieldsValue({ table: list[0] })
                    }
                })
                .catch(() => setTables([]))
                .finally(() => setLoadingTables(false))
        }
    }, [scope, selectedDb, sessionId])

    // Apply Preset templates
    const applyPreset = (type: 'readonly' | 'readwrite' | 'structure' | 'all') => {
        if (type === 'readonly') {
            setCheckedPrivs(['SELECT', 'SHOW VIEW'])
        } else if (type === 'readwrite') {
            setCheckedPrivs(['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'EXECUTE', 'SHOW VIEW'])
        } else if (type === 'structure') {
            setCheckedPrivs([
                'SELECT',
                'INSERT',
                'UPDATE',
                'DELETE',
                'CREATE',
                'ALTER',
                'DROP',
                'INDEX',
                'CREATE VIEW',
                'SHOW VIEW',
                'CREATE ROUTINE',
                'ALTER ROUTINE',
                'TRIGGER',
                'EXECUTE',
            ])
        } else if (type === 'all') {
            setCheckedPrivs(['ALL PRIVILEGES'])
        }
    }

    const togglePriv = (priv: string) => {
        setCheckedPrivs((prev) => {
            if (priv === 'ALL PRIVILEGES') {
                return prev.includes('ALL PRIVILEGES') ? [] : ['ALL PRIVILEGES']
            }
            const withoutAll = prev.filter((p) => p !== 'ALL PRIVILEGES')
            if (withoutAll.includes(priv)) {
                return withoutAll.filter((p) => p !== priv)
            } else {
                return [...withoutAll, priv]
            }
        })
    }

    const selectCategory = (category: string[], select: boolean) => {
        setCheckedPrivs((prev) => {
            const set = new Set(prev.filter((p) => p !== 'ALL PRIVILEGES'))
            category.forEach((p) => {
                if (select) set.add(p)
                else set.delete(p)
            })
            return Array.from(set)
        })
    }

    // SQL Preview
    const targetScopeStr = useMemo(() => {
        if (scope === 'global') return '*.*'
        const dbPart = selectedDb ? `\`${selectedDb.replace(/`/g, '``')}\`` : '*'
        if (scope === 'database') return `${dbPart}.*`
        const tblPart = selectedTable ? `\`${selectedTable.replace(/`/g, '``')}\`` : '*'
        return `${dbPart}.${tblPart}`
    }, [scope, selectedDb, selectedTable])

    const sqlPreview = useMemo(() => {
        const u = user.replace(/'/g, "''")
        const h = (host || '%').replace(/'/g, "''")
        const privStr = checkedPrivs.length > 0 ? checkedPrivs.join(', ') : '/* 请选择权限 */'
        let sql = `GRANT ${privStr} ON ${targetScopeStr} TO '${u}'@'${h}'`
        if (withGrantOption) {
            sql += ' WITH GRANT OPTION'
        }
        sql += ';\nFLUSH PRIVILEGES;'
        return sql
    }, [user, host, checkedPrivs, targetScopeStr, withGrantOption])

    const handleOk = async () => {
        if (checkedPrivs.length === 0) {
            setError('请至少勾选一项要授予的权限')
            return
        }
        if (scope === 'database' && !selectedDb) {
            setError('请选择要授权的目标数据库')
            return
        }
        if (scope === 'table' && (!selectedDb || !selectedTable)) {
            setError('请选择要授权的目标数据库和数据表')
            return
        }

        try {
            setBusy(true)
            setError('')

            const dbName = scope === 'global' ? '' : selectedDb
            const tblName = scope === 'table' ? selectedTable : ''

            await API.mysqlGrantPrivileges(
                sessionId,
                user,
                host,
                dbName,
                tblName,
                checkedPrivs,
                withGrantOption
            )

            onSuccess()
            onClose()
        } catch (e) {
            setError(errorMessage(e))
        } finally {
            setBusy(false)
        }
    }

    return (
        <Modal
            closable={false}
            title={
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <Shield size={18} color="var(--accent)" />
                    <span style={{ fontWeight: 600 }}>关联/分配用户权限 (GRANT)</span>
                    <Tag color="processing" style={{ margin: 0, fontFamily: 'var(--font-mono)' }}>
                        {user}@{host}
                    </Tag>
                </div>
            }
            open={open}
            onCancel={onClose}
            onOk={handleOk}
            confirmLoading={busy}
            okText="执行授权 (GRANT)"
            cancelText="取消"
            width={680}
            destroyOnClose
        >
            {error && (
                <Alert
                    type="error"
                    message="授权失败"
                    description={error}
                    showIcon
                    style={{ marginBottom: 16 }}
                />
            )}

            <Form form={form} layout="vertical">
                {/* 1. 作用域配置 */}
                <div style={{ padding: '12px 14px', background: 'var(--bg-2)', borderRadius: 8, marginBottom: 16 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span>1. 选择授权作用域 (Scope)</span>
                    </div>
                    <Segmented
                        block
                        value={scope}
                        onChange={(v) => setScope(v as any)}
                        options={[
                            { label: '🌐 全局 (*.*)', value: 'global' },
                            { label: '🗄️ 指定数据库 (db.*)', value: 'database' },
                            { label: '📋 指定数据表 (db.table)', value: 'table' },
                        ]}
                        style={{ marginBottom: 12 }}
                    />

                    {scope !== 'global' && (
                        <div style={{ display: 'grid', gridTemplateColumns: scope === 'table' ? '1fr 1fr' : '1fr', gap: 12 }}>
                            <div>
                                <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 4 }}>目标数据库:</div>
                                <Select
                                    style={{ width: '100%' }}
                                    value={selectedDb}
                                    onChange={(v) => {
                                        setSelectedDb(v)
                                        setSelectedTable('')
                                    }}
                                    options={databases.map((d) => ({ label: d, value: d }))}
                                    placeholder="选择数据库"
                                    showSearch
                                />
                            </div>
                            {scope === 'table' && (
                                <div>
                                    <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 4 }}>目标数据表:</div>
                                    <Select
                                        style={{ width: '100%' }}
                                        value={selectedTable}
                                        onChange={(v) => setSelectedTable(v)}
                                        options={tables.map((t) => ({ label: t, value: t }))}
                                        placeholder="选择数据表"
                                        loading={loadingTables}
                                        showSearch
                                    />
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* 2. 快捷预设模板 */}
                <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Sparkles size={14} color="var(--accent)" />
                        <span>2. 常用权限模板快捷应用</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                        <Button
                            size="middle"
                            onClick={() => applyPreset('readonly')}
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, height: 34, fontSize: 12.5 }}
                        >
                            🔍 只读数据
                        </Button>
                        <Button
                            size="middle"
                            onClick={() => applyPreset('readwrite')}
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, height: 34, fontSize: 12.5 }}
                        >
                            ✏️ 读写数据
                        </Button>
                        <Button
                            size="middle"
                            onClick={() => applyPreset('structure')}
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, height: 34, fontSize: 12.5 }}
                        >
                            🛠️ 结构管理
                        </Button>
                        <Button
                            size="middle"
                            danger
                            onClick={() => applyPreset('all')}
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, height: 34, fontSize: 12.5 }}
                        >
                            👑 全部权限
                        </Button>
                    </div>
                </div>

                {/* 3. 细粒度分类权限勾选 */}
                <div style={{ border: '1px solid var(--border-subtle, rgba(255,255,255,0.08))', borderRadius: 8, padding: '12px 14px', marginBottom: 16 }}>
                    {/* DML Section */}
                    <div style={{ marginBottom: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                            <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)' }}>
                                📊 数据操作权限 (DML)
                            </span>
                            <Space size={4}>
                                <Button size="small" type="link" style={{ padding: 0, fontSize: 11 }} onClick={() => selectCategory(DML_PRIVS, true)}>全选</Button>
                                <Button size="small" type="link" style={{ padding: 0, fontSize: 11, color: 'var(--text-dim)' }} onClick={() => selectCategory(DML_PRIVS, false)}>取消</Button>
                            </Space>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px 12px' }}>
                            {DML_PRIVS.map((p) => (
                                <Checkbox
                                    key={p}
                                    checked={checkedPrivs.includes('ALL PRIVILEGES') || checkedPrivs.includes(p)}
                                    disabled={checkedPrivs.includes('ALL PRIVILEGES')}
                                    onChange={() => togglePriv(p)}
                                    style={{ fontSize: 12 }}
                                >
                                    {p}
                                </Checkbox>
                            ))}
                        </div>
                    </div>

                    <Divider style={{ margin: '8px 0' }} />

                    {/* DDL Section */}
                    <div style={{ marginBottom: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                            <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)' }}>
                                🏗️ 结构定义权限 (DDL)
                            </span>
                            <Space size={4}>
                                <Button size="small" type="link" style={{ padding: 0, fontSize: 11 }} onClick={() => selectCategory(DDL_PRIVS, true)}>全选</Button>
                                <Button size="small" type="link" style={{ padding: 0, fontSize: 11, color: 'var(--text-dim)' }} onClick={() => selectCategory(DDL_PRIVS, false)}>取消</Button>
                            </Space>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px 12px' }}>
                            {DDL_PRIVS.map((p) => (
                                <Checkbox
                                    key={p}
                                    checked={checkedPrivs.includes('ALL PRIVILEGES') || checkedPrivs.includes(p)}
                                    disabled={checkedPrivs.includes('ALL PRIVILEGES')}
                                    onChange={() => togglePriv(p)}
                                    style={{ fontSize: 12 }}
                                >
                                    {p}
                                </Checkbox>
                            ))}
                        </div>
                    </div>

                    {scope === 'global' && (
                        <>
                            <Divider style={{ margin: '8px 0' }} />
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                                    <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)' }}>
                                        🛡️ 管理权限 (Admin)
                                    </span>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px 12px' }}>
                                    {ADMIN_PRIVS.map((p) => (
                                        <Checkbox
                                            key={p}
                                            checked={checkedPrivs.includes(p)}
                                            onChange={() => togglePriv(p)}
                                            style={{ fontSize: 12 }}
                                        >
                                            {p}
                                        </Checkbox>
                                    ))}
                                </div>
                            </div>
                        </>
                    )}
                </div>

                {/* 4. 选项与高级设置 */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, padding: '8px 12px', background: 'var(--bg-2)', borderRadius: 6 }}>
                    <div>
                        <div style={{ fontSize: 13, fontWeight: 500 }}>允许转授权 (WITH GRANT OPTION)</div>
                        <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>允许该用户将自己拥有的权限进一步授予其他用户</div>
                    </div>
                    <Switch size="small" checked={withGrantOption} onChange={setWithGrantOption} />
                </div>

                {/* 5. SQL 实时预览 */}
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-dim)', marginBottom: 4 }}>
                        <Eye size={12} />
                        <span>实时 SQL 预览</span>
                    </div>
                    <pre
                        style={{
                            margin: 0,
                            padding: '8px 12px',
                            background: 'var(--bg-3)',
                            borderRadius: 6,
                            fontSize: 11.5,
                            fontFamily: 'var(--font-mono)',
                            color: 'var(--text)',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-all',
                            lineHeight: 1.5,
                        }}
                    >
                        {sqlPreview}
                    </pre>
                </div>
            </Form>
        </Modal>
    )
}

export default GrantPrivilegesModal
