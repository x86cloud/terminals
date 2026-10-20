import React, { useState, useEffect } from 'react'
import { Modal, Form, Input, Select, Radio, Alert, message } from 'antd'
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

const CASCADE_OPTIONS = [
    { value: 'RESTRICT', label: 'RESTRICT (拒绝变更)' },
    { value: 'CASCADE', label: 'CASCADE (级联更新/删除)' },
    { value: 'SET NULL', label: 'SET NULL (置为空值)' },
    { value: 'NO ACTION', label: 'NO ACTION (不作处理)' },
]

export const CreateConstraintModal: React.FC<CreateConstraintModalProps> = ({
    open,
    tableName,
    columns,
    adapter,
    onSuccess,
    onCancel,
}) => {
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
    }, [foreignTable, tableName, columns, adapter])

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
                sqlText: '-- 请完整填写约束名称与必要参数',
                isRebuild: false,
            })
            return
        }

        if (constraintType === 'FOREIGN KEY' && (!localCol || !foreignTable || !foreignCol)) {
            setPreviewState({
                sqlText: '-- 请选择外键对应的本地字段、引用目标表及引用目标字段',
                isRebuild: false,
            })
            return
        }

        if (constraintType === 'CHECK' && !checkExpr.trim()) {
            setPreviewState({
                sqlText: '-- 请输入检查约束表达式',
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
                    sqlText: '-- 生成 SQL 失败: ' + (e.message || e),
                    isRebuild: false,
                })
            }
        }

        return () => {
            active = false
        }
    }, [constraintType, name, localCol, foreignTable, foreignCol, onDelete, onUpdate, checkExpr, adapter])

    const handleOk = async () => {
        const cleanName = name.trim()
        if (!cleanName) {
            message.warning('请输入约束名称')
            return
        }

        if (constraintType === 'FOREIGN KEY') {
            if (!localCol || !foreignTable || !foreignCol) {
                message.warning('请完整选择外键本地字段、引用目标表及引用目标字段')
                return
            }
        } else {
            if (!checkExpr.trim()) {
                message.warning('请输入检查约束表达式')
                return
            }
        }

        if (!adapter.createConstraint) {
            message.error('当前驱动不支持在线创建约束')
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
            message.success(`约束 [${cleanName}] 创建成功！`)
            onSuccess()
        } catch (e: any) {
            message.error('创建约束失败: ' + (e.message || e))
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
                        新建约束 - <code style={{ fontSize: 13, color: '#e06c75' }}>{tableName}</code>
                    </span>
                </div>
            }
            open={open}
            onCancel={loading ? undefined : onCancel}
            onOk={handleOk}
            confirmLoading={loading}
            okText="确定创建"
            cancelText="取消"
            width={680}
            destroyOnClose
            maskClosable={false}
        >
            <Form layout="vertical" style={{ marginTop: 16 }}>
                <Form.Item label="约束类型 (Constraint Type)">
                    <Radio.Group
                        value={constraintType}
                        onChange={(e) => setConstraintType(e.target.value)}
                        optionType="button"
                        buttonStyle="solid"
                    >
                        <Radio.Button value="FOREIGN KEY">外键约束 (Foreign Key)</Radio.Button>
                        <Radio.Button value="CHECK">检查约束 (Check)</Radio.Button>
                    </Radio.Group>
                </Form.Item>

                <Form.Item label="约束名称 (Constraint Name)" required>
                    <Input
                        placeholder="如 fk_orders_user_id"
                        value={name}
                        onChange={(e) => {
                            setIsCustomName(true)
                            setName(e.target.value)
                        }}
                        suffix={
                            !isCustomName && localCol ? (
                                <span title="智能自动命名" style={{ display: 'inline-flex', alignItems: 'center' }}>
                                    <Sparkles size={13} style={{ color: '#fa8c16' }} />
                                </span>
                            ) : undefined
                        }
                    />
                </Form.Item>

                {constraintType === 'FOREIGN KEY' && (
                    <>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                            <Form.Item label="本表字段 (Column)" required>
                                <Select
                                    placeholder="选择字段"
                                    value={localCol}
                                    onChange={(val) => setLocalCol(val)}
                                    options={columns.map((c) => ({ value: c, label: c }))}
                                />
                            </Form.Item>

                            <Form.Item label="引用目标表 (Ref Table)" required>
                                <Select
                                    showSearch
                                    placeholder="选择引用的表"
                                    loading={loadingTables}
                                    value={foreignTable || undefined}
                                    onChange={(val) => setForeignTable(val)}
                                    options={tables.map((t) => ({ value: t, label: t }))}
                                />
                            </Form.Item>

                            <Form.Item label="引用字段 (Ref Column)" required>
                                <Select
                                    placeholder="选择目标字段"
                                    loading={loadingCols}
                                    disabled={!foreignTable}
                                    value={foreignCol || undefined}
                                    onChange={(val) => setForeignCol(val)}
                                    options={targetCols.map((c) => ({ value: c, label: c }))}
                                />
                            </Form.Item>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <Form.Item label="删除规则 (ON DELETE)">
                                <Select
                                    value={onDelete}
                                    onChange={(val) => setOnDelete(val)}
                                    options={CASCADE_OPTIONS}
                                />
                            </Form.Item>

                            <Form.Item label="更新规则 (ON UPDATE)">
                                <Select
                                    value={onUpdate}
                                    onChange={(val) => setOnUpdate(val)}
                                    options={CASCADE_OPTIONS}
                                />
                            </Form.Item>
                        </div>
                    </>
                )}

                {constraintType === 'CHECK' && (
                    <Form.Item
                        label="检查条件表达式 (Check Expression)"
                        required
                        tooltip="输入标准的 SQL 逻辑表达式，如 age >= 0 AND age <= 150"
                    >
                        <Input
                            placeholder="如 status IN ('pending', 'active', 'closed')"
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
                        message="表重建与迁移提醒"
                        description={previewState.warning}
                        style={{ marginBottom: 12 }}
                    />
                )}

                <Form.Item label="即将执行的 DDL 语句预览">
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
