import React, { useMemo } from 'react'
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
    const { message } = App.useApp()
    const sqlText = useMemo(() => {
        if (!plan || !plan.sqls || plan.sqls.length === 0) {
            return '-- 无需执行任何 ALTER TABLE 变更'
        }
        return plan.sqls.join('\n\n')
    }, [plan])

    const handleCopy = () => {
        if (!sqlText) return
        navigator.clipboard.writeText(sqlText)
        message.success('已复制 SQL 变更脚本到剪贴板')
    }

    const hasDestructiveOps = Boolean(
        plan?.isRebuild || (plan?.warning && plan.warning.includes('永久删除'))
    )

    return (
        <Modal
            title={
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Database size={17} style={{ color: 'var(--accent, #1677ff)' }} />
                    <span>
                        修改表结构 - DDL 预览确认 (
                        <code style={{ fontSize: 13, color: '#e06c75' }}>{tableName}</code>)
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
                        复制 SQL
                    </Button>
                    <Space size={8}>
                        <Button onClick={onCancel} disabled={loading}>
                            取消
                        </Button>
                        <Button
                            type="primary"
                            danger={hasDestructiveOps}
                            loading={loading}
                            onClick={onOk}
                            disabled={!plan || plan.sqls.length === 0}
                        >
                            {hasDestructiveOps ? '确认并强制应用变更' : '确认执行并应用'}
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
                        message={plan.isRebuild ? '表重建风险提示' : '危险变更提示'}
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
                            即将执行的 SQL 脚本 ({plan?.sqls?.length ?? 0} 条语句):
                        </span>
                        {plan?.isRebuild && (
                            <span style={{ fontSize: 12, color: '#fa8c16' }}>
                                (已自动包裹在安全事务临时表中)
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
