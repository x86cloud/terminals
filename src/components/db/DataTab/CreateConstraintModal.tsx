import React, { useState, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal, Form, Input, Select, Radio, Alert, App } from 'antd'
import { Link2, Sparkles, AlertTriangle } from 'lucide-react'
import CodeEditor from '@/components/CodeEditor'
import { DbAdapter, AlterTablePlan } from '../types'

interface CreateConstraintModalProps {
    open: boolean
    tableName: string
    schema?: string
    columns: string[]
    adapter: DbAdapter
    onSuccess: () => void
    onCancel: () => void
}

export const CreateConstraintModal: React.FC<CreateConstraintModalProps> = ({
    open,
    tableName,
    columns,
    adapter,
    onSuccess,
    onCancel,
}) => {
    const { t } = useTranslation(['db', 'common'])
    const { message } = App.useApp()
    const [constraintType, setConstraintType] = useState<'FOREIGN KEY' | 'CHECK'>('FOREIGN KEY')
    const [name, setName] = useState('')
    const [isCustomName, setIsCustomName] = useState(false)
    const [localCol, setLocalCol] = useState('')
    const [foreignTable, setForeignTable] = useState('')
    const [foreignCol, setForeignCol] = useState('')
    const [onDelete, setOnDelete] = useState('RESTRICT')
    const [onUpdate, setOnUpdate] = useState('RESTRICT')
    const [checkExpr, setCheckExpr] = useState('')
    const [loading, setLoading] = useState(false)

    // 可选表与目标列
    const [tables, setTables] = useState<string[]>([])
    const [targetCols, setTargetCols] = useState<string[]>([])
    const [loadingTables, setLoadingTables] = useState(false)
    const [loadingCols, setLoadingCols] = useState(false)

    const cascadeOptions = useMemo(() => [
        { value: 'RESTRICT', label: t('db:modals.createConstraint.restrict') },
        { value: 'CASCADE', label: t('db:modals.createConstraint.cascade') },
        { value: 'SET NULL', label: t('db:modals.createConstraint.setNull') },
        { value: 'NO ACTION', label: t('db:modals.createConstraint.noAction') },
    ], [t])

    // 重置与加载表列表
    useEffect(() => {
        if (open) {
            setConstraintType('FOREIGN KEY')
            setName('')
            setIsCustomName(false)
            setLocalCol(columns[0] || '')
            setForeignTable('')
            setForeignCol('')
            setOnDelete('RESTRICT')
            setOnUpdate('RESTRICT')
            setCheckExpr('')
            setLoading(false)

            if (adapter.listTables) {
                setLoadingTables(true)
                adapter
                    .listTables()
                    .then((tbls) => {
                        setTables(tbls)
                    })
                    .catch((err) => {
                        console.warn('获取候选关联表列表失败:', err)
                    })
                    .finally(() => setLoadingTables(false))
            }
        }
    }, [open, tableName, adapter, columns])

    // 目标表变动时加载目标表列
    useEffect(() => {
        if (!foreignTable) {
            setTargetCols([])
            setForeignCol('')
            return
        }

        // 如果是本表自引用外键，直接使用本表列定义
        if (foreignTable.toLowerCase() === tableName.toLowerCase() && columns.length > 0) {
            setTargetCols(columns)
            if (!columns.includes(foreignCol)) {
                setForeignCol(columns[0])
            }
            return
        }

        if (adapter.listTableColumns) {
            setLoadingCols(true)
            adapter
                .listTableColumns(foreignTable)
                .then((cols) => {
                    setTargetCols(cols)
                    if (cols.length > 0 && !cols.includes(foreignCol)) {
                        setForeignCol(cols[0])
                    }
                })
                .catch((err) => {
                    console.warn('获取目标表列列表失败:', err)
                })
                .finally(() => setLoadingCols(false))
        } else {
            setTargetCols([])
            setForeignCol('')
        }
    }, [foreignTable, tableName, columns, foreignCol, adapter])

    // 智能建议约束名称
    useEffect(() => {
        if (!isCustomName) {
            if (constraintType === 'FOREIGN KEY') {
                if (localCol) {
                    const rawName = `fk_${tableName}_${localCol}`
                    setName(rawName.length > 60 ? rawName.slice(0, 60) : rawName)
                }
            } else {
                const rawName = `chk_${tableName}_1`
                setName(rawName.length > 60 ? rawName.slice(0, 60) : rawName)
            }
        }
    }, [constraintType, localCol, tableName, isCustomName])

    // 实时 SQL 预览与重建计划
    const [previewState, setPreviewState] = useState<{ sqlText: string; isRebuild: boolean; warning?: string }>({
        sqlText: '',
        isRebuild: false,
    })

    useEffect(() => {
        let active = true

        if (!name.trim() || !adapter.previewCreateConstraintSql) {
            setPreviewState({
                sqlText: t('db:modals.createConstraint.tipIncomplete'),
                isRebuild: false,
            })
            return
        }

        if (constraintType === 'FOREIGN KEY' && (!localCol || !foreignTable || !foreignCol)) {
            setPreviewState({
                sqlText: t('db:modals.createConstraint.tipSelectFk'),
                isRebuild: false,
            })
            return
        }

        if (constraintType === 'CHECK' && !checkExpr.trim()) {
            setPreviewState({
                sqlText: t('db:modals.createConstraint.tipInputCheck'),
                isRebuild: false,
            })
            return
        }

        const params = {
            name: name.trim(),
            type: constraintType,
            column: localCol,
            foreignTable,
            foreignColumn: foreignCol,
            onDelete,
            onUpdate,
            checkExpr: checkExpr.trim(),
        }

        try {
            const res = adapter.previewCreateConstraintSql(params)
            if (typeof res === 'string') {
                setPreviewState({ sqlText: res, isRebuild: false })
            } else if (res && typeof (res as any).then === 'function') {
                // 支持 Promise 异步计算重建计划 (如 SQLite)，带 active 防竞态
                Promise.resolve(res).then((resolved) => {
                    if (!active) return
                    if (typeof resolved === 'string') {
                        setPreviewState({ sqlText: resolved, isRebuild: false })
                    } else {
                        setPreviewState({
                            sqlText: (resolved.sqls || []).join('\n\n'),
                            isRebuild: resolved.isRebuild,
                            warning: resolved.warning,
                        })
                    }
                })
            } else {
                const plan = res as AlterTablePlan
                setPreviewState({
                    sqlText: (plan.sqls || []).join('\n\n'),
                    isRebuild: plan.isRebuild,
                    warning: plan.warning,
                })
            }
        } catch (e: any) {
            if (active) {
                setPreviewState({
                    sqlText: t('db:modals.createConstraint.generateSqlFail', { msg: e.message || e }),
                    isRebuild: false,
                })
            }
        }

        return () => {
            active = false
        }
    }, [constraintType, name, localCol, foreignTable, foreignCol, onDelete, onUpdate, checkExpr, adapter, t])

    const handleOk = async () => {
        const cleanName = name.trim()
        if (!cleanName) {
            message.warning(t('db:modals.createConstraint.enterName'))
            return
        }

        if (constraintType === 'FOREIGN KEY') {
            if (!localCol || !foreignTable || !foreignCol) {
                message.warning(t('db:modals.createConstraint.incompleteFk'))
                return
            }
        } else {
            if (!checkExpr.trim()) {
                message.warning(t('db:modals.createConstraint.enterCheck'))
                return
            }
        }

        if (!adapter.createConstraint) {
            message.error(t('db:modals.createConstraint.unsupportedCreateConstraint'))
            return
        }

        setLoading(true)
        try {
            await adapter.createConstraint({
                name: cleanName,
                type: constraintType,
                column: localCol,
                foreignTable,
                foreignColumn: foreignCol,
                onDelete,
                onUpdate,
                checkExpr: checkExpr.trim(),
            })
            message.success(t('db:modals.createConstraint.createSuccess', { name: cleanName }))
            onSuccess()
        } catch (e: any) {
            message.error(t('db:modals.createConstraint.createFail', { msg: e.message || e }))
        } finally {
            setLoading(false)
        }
    }

    return (
        <Modal
            title={
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Link2 size={17} style={{ color: '#722ed1' }} />
                    <span>
                        {t('db:modals.createConstraint.title', { tableName })}
                    </span>
                </div>
            }
            open={open}
            onCancel={loading ? undefined : onCancel}
            onOk={handleOk}
            confirmLoading={loading}
            okText={t('common:ok')}
            cancelText={t('common:cancel')}
            width={680}
            destroyOnClose
            maskClosable={false}
        >
            <Form layout="vertical" style={{ marginTop: 16 }}>
                <Form.Item label={t('db:modals.createConstraint.typeLabel')}>
                    <Radio.Group
                        value={constraintType}
                        onChange={(e) => setConstraintType(e.target.value)}
                        optionType="button"
                        buttonStyle="solid"
                    >
                        <Radio.Button value="FOREIGN KEY">{t('db:modals.createConstraint.typeFk')}</Radio.Button>
                        <Radio.Button value="CHECK">{t('db:modals.createConstraint.typeCheck')}</Radio.Button>
                    </Radio.Group>
                </Form.Item>

                <Form.Item label={t('db:modals.createConstraint.nameLabel')} required>
                    <Input
                        placeholder={t('db:modals.createConstraint.namePlaceholder')}
                        value={name}
                        onChange={(e) => {
                            setIsCustomName(true)
                            setName(e.target.value)
                        }}
                        suffix={
                            !isCustomName && localCol ? (
                                <span title={t('db:modals.createIndex.smartNaming')} style={{ display: 'inline-flex', alignItems: 'center' }}>
                                    <Sparkles size={13} style={{ color: '#fa8c16' }} />
                                </span>
                            ) : undefined
                        }
                    />
                </Form.Item>

                {constraintType === 'FOREIGN KEY' && (
                    <>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                            <Form.Item label={t('db:modals.createConstraint.colLabel')} required>
                                <Select
                                    placeholder={t('db:modals.createConstraint.colPlaceholder')}
                                    value={localCol}
                                    onChange={(val) => setLocalCol(val)}
                                    options={columns.map((colName) => ({ value: colName, label: colName }))}
                                />
                            </Form.Item>

                            <Form.Item label={t('db:modals.createConstraint.refTableLabel')} required>
                                <Select
                                    showSearch
                                    placeholder={t('db:modals.createConstraint.refTablePlaceholder')}
                                    loading={loadingTables}
                                    value={foreignTable || undefined}
                                    onChange={(val) => setForeignTable(val)}
                                    options={tables.map((tName) => ({ value: tName, label: tName }))}
                                />
                            </Form.Item>

                            <Form.Item label={t('db:modals.createConstraint.refColLabel')} required>
                                <Select
                                    placeholder={t('db:modals.createConstraint.refColPlaceholder')}
                                    loading={loadingCols}
                                    disabled={!foreignTable}
                                    value={foreignCol || undefined}
                                    onChange={(val) => setForeignCol(val)}
                                    options={targetCols.map((colName) => ({ value: colName, label: colName }))}
                                />
                            </Form.Item>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <Form.Item label={t('db:modals.createConstraint.onDeleteLabel')}>
                                <Select
                                    value={onDelete}
                                    onChange={(val) => setOnDelete(val)}
                                    options={cascadeOptions}
                                />
                            </Form.Item>

                            <Form.Item label={t('db:modals.createConstraint.onUpdateLabel')}>
                                <Select
                                    value={onUpdate}
                                    onChange={(val) => setOnUpdate(val)}
                                    options={cascadeOptions}
                                />
                            </Form.Item>
                        </div>
                    </>
                )}

                {constraintType === 'CHECK' && (
                    <Form.Item
                        label={t('db:modals.createConstraint.checkExprLabel')}
                        required
                        tooltip={t('db:modals.createConstraint.checkExprTooltip')}
                    >
                        <Input
                            placeholder={t('db:modals.createConstraint.checkExprPlaceholder')}
                            value={checkExpr}
                            onChange={(e) => setCheckExpr(e.target.value)}
                        />
                    </Form.Item>
                )}

                {previewState.warning && (
                    <Alert
                        type="warning"
                        showIcon
                        icon={<AlertTriangle size={15} />}
                        message={t('db:modals.createConstraint.rebuildNotice')}
                        description={previewState.warning}
                        style={{ marginBottom: 12 }}
                    />
                )}

                <Form.Item label={t('db:modals.createConstraint.ddlPreview')}>
                    <CodeEditor
                        value={previewState.sqlText}
                        onChange={() => {}}
                        lang="sql"
                        height={previewState.isRebuild ? '140px' : '90px'}
                        readOnly
                    />
                </Form.Item>
            </Form>
        </Modal>
    )
}

export default CreateConstraintModal
