import React, { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal, Alert, Button, Space, App } from 'antd'
import { Copy, AlertTriangle, Database } from 'lucide-react'
import CodeEditor from '@/components/CodeEditor'
import { AlterTablePlan } from '../types'

interface AlterTableModalProps {
    open: boolean
    tableName: string
    plan: AlterTablePlan | null
    loading: boolean
    onOk: () => Promise<void>
    onCancel: () => void
}

export const AlterTableModal: React.FC<AlterTableModalProps> = ({
    open,
    tableName,
    plan,
    loading,
    onOk,
    onCancel,
}) => {
    const { t } = useTranslation(['db', 'common'])
    const { message } = App.useApp()
    const sqlText = useMemo(() => {
        if (!plan || !plan.sqls || plan.sqls.length === 0) {
            return t('db:modals.alterTable.noChanges')
        }
        return plan.sqls.join('\n\n')
    }, [plan, t])

    const handleCopy = () => {
        if (!sqlText) return
        navigator.clipboard.writeText(sqlText)
        message.success(t('db:modals.alterTable.copiedSql'))
    }

    const hasDestructiveOps = Boolean(
        plan?.isRebuild || (plan?.warning && (plan.warning.includes('永久删除') || plan.warning.includes('permanently delete')))
    )

    return (
        <Modal
            title={
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Database size={17} style={{ color: 'var(--accent, #1677ff)' }} />
                    <span>
                        {t('db:modals.alterTable.title', { table: tableName, defaultValue: `修改表结构 - DDL 预览确认 (${tableName})` })}
                    </span>
                </div>
            }
            open={open}
            onCancel={loading ? undefined : onCancel}
            width={780}
            destroyOnClose
            maskClosable={false}
            footer={
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Button icon={<Copy size={13} />} onClick={handleCopy} disabled={!plan?.sqls?.length}>
                        {t('db:modals.alterTable.copySql')}
                    </Button>
                    <Space size={8}>
                        <Button onClick={onCancel} disabled={loading}>
                            {t('common:cancel')}
                        </Button>
                        <Button
                            type="primary"
                            danger={hasDestructiveOps}
                            loading={loading}
                            onClick={onOk}
                            disabled={!plan || plan.sqls.length === 0}
                        >
                            {hasDestructiveOps ? t('db:modals.alterTable.confirmRebuild') : t('db:modals.alterTable.confirmApply')}
                        </Button>
                    </Space>
                </div>
            }
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, margin: '14px 0 6px 0' }}>
                {plan?.warning && (
                    <Alert
                        type={plan.isRebuild ? 'warning' : 'error'}
                        showIcon
                        icon={plan.isRebuild ? <AlertTriangle size={16} /> : undefined}
                        message={plan.isRebuild ? t('db:modals.alterTable.rebuildRisk') : t('db:modals.alterTable.dangerWarning')}
                        description={
                            <div style={{ whiteSpace: 'pre-line', fontSize: 13, lineHeight: '1.6' }}>
                                {plan.warning}
                            </div>
                        }
                    />
                )}

                <div>
                    <div
                        style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginBottom: 6,
                        }}
                    >
                        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-main, #333)' }}>
                            {t('db:modals.alterTable.sqlsToExecute', { count: plan?.sqls?.length ?? 0 })}
                        </span>
                        {plan?.isRebuild && (
                            <span style={{ fontSize: 12, color: '#fa8c16' }}>
                                {t('db:modals.alterTable.safeTxNotice')}
                            </span>
                        )}
                    </div>

                    <CodeEditor
                        value={sqlText}
                        onChange={() => {}}
                        lang="sql"
                        height="280px"
                        readOnly
                    />
                </div>
            </div>
        </Modal>
    )
}

export default AlterTableModal
