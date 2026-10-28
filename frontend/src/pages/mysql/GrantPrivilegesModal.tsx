import React, { useState, useEffect, useMemo } from 'react'
import { Modal, Form, Select, Segmented, Checkbox, Switch, Button, Tag, Space, Alert, Divider } from 'antd'
import { Shield, Eye, Sparkles } from 'lucide-react'
import { useTranslation } from 'react-i18next'
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
    const { t } = useTranslation(['db', 'common'])
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
        let mounted = true
        if (scope === 'table' && selectedDb && sessionId) {
            setLoadingTables(true)
            API.mysqlTables(sessionId, selectedDb)
                .then((tbls) => {
                    if (!mounted) return
                    const list = tbls || []
                    setTables(list)
                    if (list.length > 0 && !list.includes(selectedTable)) {
                        setSelectedTable(list[0])
                        form.setFieldsValue({ table: list[0] })
                    }
                })
                .catch(() => {
                    if (mounted) setTables([])
                })
                .finally(() => {
                    if (mounted) setLoadingTables(false)
                })
        }
        return () => {
            mounted = false
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
            ])
        } else if (type === 'all') {
            setCheckedPrivs(['ALL PRIVILEGES'])
        }
    }

    const togglePriv = (priv: string) => {
        if (priv === 'ALL PRIVILEGES') {
            if (checkedPrivs.includes('ALL PRIVILEGES')) {
                setCheckedPrivs([])
            } else {
                setCheckedPrivs(['ALL PRIVILEGES'])
            }
            return
        }

        // if currently has ALL PRIVILEGES, clear it and replace
        let next = checkedPrivs.filter((p) => p !== 'ALL PRIVILEGES')
        if (next.includes(priv)) {
            next = next.filter((p) => p !== priv)
        } else {
            next.push(priv)
        }
        setCheckedPrivs(next)
    }

    const selectCategory = (categoryPrivs: string[], select: boolean) => {
        let next = checkedPrivs.filter((p) => p !== 'ALL PRIVILEGES')
        if (select) {
            categoryPrivs.forEach((p) => {
                if (!next.includes(p)) next.push(p)
            })
        } else {
            next = next.filter((p) => !categoryPrivs.includes(p))
        }
        setCheckedPrivs(next)
    }

    const targetScopeStr = useMemo(() => {
        if (scope === 'global') return '*.*'
        if (scope === 'database') {
            const db = selectedDb || 'db_name'
            return `\`${db}\`.*`
        }
        const db = selectedDb || 'db_name'
        const tbl = selectedTable || 'table_name'
        return `\`${db}\`.\`${tbl}\``
    }, [scope, selectedDb, selectedTable])

    const sqlPreview = useMemo(() => {
        const u = user.replace(/'/g, "''")
        const h = (host || '%').replace(/'/g, "''")
        const privStr = checkedPrivs.length > 0 ? checkedPrivs.join(', ') : `/* ${t('db:mysql.grantModal.atLeastOne')} */`
        let sql = `GRANT ${privStr} ON ${targetScopeStr} TO '${u}'@'${h}'`
        if (withGrantOption) {
            sql += ' WITH GRANT OPTION'
        }
        sql += ';\nFLUSH PRIVILEGES;'
        return sql
    }, [user, host, checkedPrivs, targetScopeStr, withGrantOption, t])

    const handleOk = async () => {
        if (checkedPrivs.length === 0) {
            setError(t('db:mysql.grantModal.atLeastOne'))
            return
        }
        if (scope === 'database' && !selectedDb) {
            setError(t('db:mysql.grantModal.selectDb'))
            return
        }
        if (scope === 'table' && (!selectedDb || !selectedTable)) {
            setError(t('db:mysql.grantModal.selectDbTable'))
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
                    <span style={{ fontWeight: 600 }}>{t('db:mysql.grantModal.title')}</span>
                    <Tag color="processing" style={{ margin: 0, fontFamily: 'var(--font-mono)' }}>
                        {user}@{host}
                    </Tag>
                </div>
            }
            open={open}
            onCancel={onClose}
            onOk={handleOk}
            confirmLoading={busy}
            okText={t('db:mysql.grantModal.ok')}
            cancelText={t('common:cancel')}
            width={680}
            destroyOnHidden
        >
            {error && (
                <Alert
                    type="error"
                    message={t('db:mysql.grantModal.fail')}
                    description={error}
                    showIcon
                    style={{ marginBottom: 16 }}
                />
            )}

            <Form form={form} layout="vertical">
                {/* 1. 作用域配置 */}
                <div style={{ padding: '12px 14px', background: 'var(--bg-2)', borderRadius: 8, marginBottom: 16 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span>{t('db:mysql.grantModal.scopeTitle')}</span>
                    </div>
                    <Segmented
                        block
                        value={scope}
                        onChange={(v) => setScope(v as any)}
                        options={[
                            { label: t('db:mysql.grantModal.scopeGlobal'), value: 'global' },
                            { label: t('db:mysql.grantModal.scopeDb'), value: 'database' },
                            { label: t('db:mysql.grantModal.scopeTable'), value: 'table' },
                        ]}
                        style={{ marginBottom: 12 }}
                    />

                    {scope !== 'global' && (
                        <div style={{ display: 'grid', gridTemplateColumns: scope === 'table' ? '1fr 1fr' : '1fr', gap: 12 }}>
                            <div>
                                <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 4 }}>{t('db:mysql.grantModal.targetDb')}</div>
                                <Select
                                    style={{ width: '100%' }}
                                    value={selectedDb}
                                    onChange={(v) => {
                                        setSelectedDb(v)
                                        setSelectedTable('')
                                    }}
                                    options={databases.map((d) => ({ label: d, value: d }))}
                                    placeholder={t('db:mysql.grantModal.selectDbPlaceholder')}
                                    showSearch
                                />
                            </div>
                            {scope === 'table' && (
                                <div>
                                    <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 4 }}>{t('db:mysql.grantModal.targetTable')}</div>
                                    <Select
                                        style={{ width: '100%' }}
                                        value={selectedTable}
                                        onChange={(v) => setSelectedTable(v)}
                                        options={tables.map((t) => ({ label: t, value: t }))}
                                        placeholder={t('db:mysql.grantModal.selectTablePlaceholder')}
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
                        <span>{t('db:mysql.grantModal.presetsTitle')}</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                        <Button
                            size="middle"
                            onClick={() => applyPreset('readonly')}
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, height: 34, fontSize: 12.5 }}
                        >
                            {t('db:mysql.grantModal.presetReadonly')}
                        </Button>
                        <Button
                            size="middle"
                            onClick={() => applyPreset('readwrite')}
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, height: 34, fontSize: 12.5 }}
                        >
                            {t('db:mysql.grantModal.presetReadwrite')}
                        </Button>
                        <Button
                            size="middle"
                            onClick={() => applyPreset('structure')}
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, height: 34, fontSize: 12.5 }}
                        >
                            {t('db:mysql.grantModal.presetStructure')}
                        </Button>
                        <Button
                            size="middle"
                            danger
                            onClick={() => applyPreset('all')}
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, height: 34, fontSize: 12.5 }}
                        >
                            {t('db:mysql.grantModal.presetAll')}
                        </Button>
                    </div>
                </div>

                {/* 3. 细粒度分类权限勾选 */}
                <div style={{ border: '1px solid var(--border-subtle, rgba(255,255,255,0.08))', borderRadius: 8, padding: '12px 14px', marginBottom: 16 }}>
                    {/* DML Section */}
                    <div style={{ marginBottom: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                            <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)' }}>
                                {t('db:mysql.grantModal.categoryDml')}
                            </span>
                            <Space size={4}>
                                <Button size="small" type="link" style={{ padding: 0, fontSize: 11 }} onClick={() => selectCategory(DML_PRIVS, true)}>{t('db:mysql.grantModal.selectAll')}</Button>
                                <Button size="small" type="link" style={{ padding: 0, fontSize: 11, color: 'var(--text-dim)' }} onClick={() => selectCategory(DML_PRIVS, false)}>{t('db:mysql.grantModal.deselect')}</Button>
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
                                {t('db:mysql.grantModal.categoryDdl')}
                            </span>
                            <Space size={4}>
                                <Button size="small" type="link" style={{ padding: 0, fontSize: 11 }} onClick={() => selectCategory(DDL_PRIVS, true)}>{t('db:mysql.grantModal.selectAll')}</Button>
                                <Button size="small" type="link" style={{ padding: 0, fontSize: 11, color: 'var(--text-dim)' }} onClick={() => selectCategory(DDL_PRIVS, false)}>{t('db:mysql.grantModal.deselect')}</Button>
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
                                        {t('db:mysql.grantModal.categoryAdmin')}
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
                        <div style={{ fontSize: 13, fontWeight: 500 }}>{t('db:mysql.grantModal.withGrantOption')}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>{t('db:mysql.grantModal.withGrantOptionDesc')}</div>
                    </div>
                    <Switch size="small" checked={withGrantOption} onChange={setWithGrantOption} />
                </div>

                {/* 5. SQL 实时预览 */}
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-dim)', marginBottom: 4 }}>
                        <Eye size={12} />
                        <span>{t('db:mysql.grantModal.sqlPreview')}</span>
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
