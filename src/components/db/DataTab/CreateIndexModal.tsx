import React, { useState, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal, Form, Input, Select, Switch, App } from 'antd'
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
    const { t } = useTranslation(['db', 'common'])
    const { message } = App.useApp()
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
            return t('db:modals.createIndex.placeholderTip')
        }
        try {
            return adapter.previewCreateIndexSql({
                name: name.trim(),
                isUnique,
                columns: selectedCols,
            })
        } catch (e: any) {
            return t('db:modals.createIndex.generateSqlFail', { msg: e.message || e })
        }
    }, [name, isUnique, selectedCols, adapter, t])

    const handleOk = async () => {
        const cleanName = name.trim()
        if (!cleanName) {
            message.warning(t('db:modals.createIndex.enterIndexName'))
            return
        }
        if (selectedCols.length === 0) {
            message.warning(t('db:modals.createIndex.selectAtLeastOneCol'))
            return
        }
        if (!adapter.createIndex) {
            message.error(t('db:modals.createIndex.unsupportedCreateIndex'))
            return
        }

        setLoading(true)
        try {
            await adapter.createIndex({
                name: cleanName,
                isUnique,
                columns: selectedCols,
            })
            message.success(t('db:modals.createIndex.createIndexSuccess', { name: cleanName }))
            onSuccess()
        } catch (e: any) {
            message.error(t('db:modals.createIndex.createIndexFail', { msg: e.message || e }))
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
                        {t('db:modals.createIndex.title', { tableName })}
                    </span>
                </div>
            }
            open={open}
            onCancel={loading ? undefined : onCancel}
            onOk={handleOk}
            confirmLoading={loading}
            okText={t('common:ok')}
            cancelText={t('common:cancel')}
            width={620}
            destroyOnClose
            maskClosable={false}
        >
            <Form layout="vertical" style={{ marginTop: 16 }}>
                <Form.Item
                    label={t('db:modals.createIndex.columnsLabel')}
                    required
                    tooltip={t('db:modals.createIndex.columnsTooltip')}
                >
                    <Select
                        mode="multiple"
                        placeholder={t('db:modals.createIndex.columnsPlaceholder')}
                        value={selectedCols}
                        onChange={(vals) => setSelectedCols(vals)}
                        options={columns.map((colName) => ({ value: colName, label: colName }))}
                        style={{ width: '100%' }}
                    />
                </Form.Item>

                <div style={{ display: 'flex', gap: 16 }}>
                    <Form.Item
                        label={t('db:modals.createIndex.uniqueType')}
                        tooltip={t('db:modals.createIndex.uniqueTooltip')}
                        style={{ flex: '0 0 auto' }}
                    >
                        <Switch
                            checked={isUnique}
                            checkedChildren={t('db:modals.createIndex.uniqueChecked')}
                            unCheckedChildren={t('db:modals.createIndex.normalUnchecked')}
                            onChange={(val) => setIsUnique(val)}
                        />
                    </Form.Item>

                    <Form.Item
                        label={t('db:modals.createIndex.nameLabel')}
                        required
                        style={{ flex: 1 }}
                    >
                        <Input
                            placeholder={t('db:modals.createIndex.namePlaceholder')}
                            value={name}
                            onChange={(e) => {
                                setIsCustomName(true)
                                setName(e.target.value)
                            }}
                            suffix={
                                !isCustomName && selectedCols.length > 0 ? (
                                    <span title={t('db:modals.createIndex.smartNaming')} style={{ display: 'inline-flex', alignItems: 'center' }}>
                                        <Sparkles size={13} style={{ color: '#fa8c16' }} />
                                    </span>
                                ) : undefined
                            }
                        />
                    </Form.Item>
                </div>

                <Form.Item label={t('db:modals.createIndex.ddlPreview')}>
                    <CodeEditor value={previewSql} onChange={() => {}} lang="sql" height="110px" readOnly />
                </Form.Item>
            </Form>
        </Modal>
    )
}

export default CreateIndexModal
