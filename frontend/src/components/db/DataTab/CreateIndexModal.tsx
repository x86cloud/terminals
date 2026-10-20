import React, { useState, useEffect, useMemo } from 'react'
import { Modal, Form, Input, Select, Switch, message } from 'antd'
import { KeyRound, Sparkles } from 'lucide-react'
import CodeEditor from '@/components/CodeEditor'
import { DbAdapter } from '../types'

interface CreateIndexModalProps {
    open: boolean
    tableName: string
    schema?: string
    columns: string[]
    adapter: DbAdapter
    onSuccess: () => void
    onCancel: () => void
}

export const CreateIndexModal: React.FC<CreateIndexModalProps> = ({
    open,
    tableName,
    columns,
    adapter,
    onSuccess,
    onCancel,
}) => {
    const [name, setName] = useState('')
    const [isUnique, setIsUnique] = useState(false)
    const [selectedCols, setSelectedCols] = useState<string[]>([])
    const [loading, setLoading] = useState(false)
    const [isCustomName, setIsCustomName] = useState(false)

    // 重置状态
    useEffect(() => {
        if (open) {
            setName('')
            setIsUnique(false)
            setSelectedCols([])
            setLoading(false)
            setIsCustomName(false)
        }
    }, [open])

    // 智能建议索引名称
    useEffect(() => {
        if (!isCustomName) {
            if (selectedCols.length > 0) {
                const prefix = isUnique ? 'uk' : 'idx'
                const colsPart = selectedCols.slice(0, 3).join('_')
                const rawName = `${prefix}_${tableName}_${colsPart}`
                setName(rawName.length > 60 ? rawName.slice(0, 60) : rawName)
            } else {
                setName('')
            }
        }
    }, [selectedCols, isUnique, tableName, isCustomName])

    // 实时预览 SQL
    const previewSql = useMemo(() => {
        if (!name.trim() || selectedCols.length === 0 || !adapter.previewCreateIndexSql) {
            return '-- 请填写索引名称并至少选择一个包含列'
        }
        try {
            return adapter.previewCreateIndexSql({
                name: name.trim(),
                isUnique,
                columns: selectedCols,
            })
        } catch (e: any) {
            return '-- 生成 SQL 失败: ' + (e.message || e)
        }
    }, [name, isUnique, selectedCols, adapter])

    const handleOk = async () => {
        const cleanName = name.trim()
        if (!cleanName) {
            message.warning('请输入索引名称')
            return
        }
        if (selectedCols.length === 0) {
            message.warning('请至少选择一个包含列')
            return
        }
        if (!adapter.createIndex) {
            message.error('当前驱动不支持创建索引')
            return
        }

        setLoading(true)
        try {
            await adapter.createIndex({
                name: cleanName,
                isUnique,
                columns: selectedCols,
            })
            message.success(`索引 [${cleanName}] 创建成功！`)
            onSuccess()
        } catch (e: any) {
            message.error('创建索引失败: ' + (e.message || e))
        } finally {
            setLoading(false)
        }
    }

    return (
        <Modal
            title={
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <KeyRound size={17} style={{ color: '#1677ff' }} />
                    <span>
                        新建索引 - <code style={{ fontSize: 13, color: '#e06c75' }}>{tableName}</code>
                    </span>
                </div>
            }
            open={open}
            onCancel={loading ? undefined : onCancel}
            onOk={handleOk}
            confirmLoading={loading}
            okText="确定创建"
            cancelText="取消"
            width={620}
            destroyOnClose
            maskClosable={false}
        >
            <Form layout="vertical" style={{ marginTop: 16 }}>
                <Form.Item label="包含列 (Columns)" required tooltip="可选择单列或多个列组合成复合索引">
                    <Select
                        mode="multiple"
                        placeholder="请选择要加入索引的列"
                        value={selectedCols}
                        onChange={(vals) => setSelectedCols(vals)}
                        options={columns.map((c) => ({ value: c, label: c }))}
                        style={{ width: '100%' }}
                    />
                </Form.Item>

                <div style={{ display: 'flex', gap: 16 }}>
                    <Form.Item
                        label="索引类型 (Unique)"
                        tooltip="唯一索引保证包含列组合的值在整表中唯一"
                        style={{ flex: '0 0 auto' }}
                    >
                        <Switch
                            checked={isUnique}
                            checkedChildren="UNIQUE 唯一"
                            unCheckedChildren="NORMAL 普通"
                            onChange={(val) => setIsUnique(val)}
                        />
                    </Form.Item>

                    <Form.Item label="索引名称 (Index Name)" required style={{ flex: 1 }}>
                        <Input
                            placeholder="如 idx_user_id"
                            value={name}
                            onChange={(e) => {
                                setIsCustomName(true)
                                setName(e.target.value)
                            }}
                            suffix={
                                !isCustomName && selectedCols.length > 0 ? (
                                    <span title="智能自动命名" style={{ display: 'inline-flex', alignItems: 'center' }}>
                                        <Sparkles size={13} style={{ color: '#fa8c16' }} />
                                    </span>
                                ) : undefined
                            }
                        />
                    </Form.Item>
                </div>

                <Form.Item label="即将执行的 DDL 语句预览">
                    <CodeEditor value={previewSql} onChange={() => {}} lang="sql" height="110px" readOnly />
                </Form.Item>
            </Form>
        </Modal>
    )
}

export default CreateIndexModal
