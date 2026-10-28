import { Modal, Input, Switch, Alert } from 'antd'
import CodeEditor from '@/components/CodeEditor'
import { useTranslation } from 'react-i18next'

export type ObjModalKind = 'createdb' | 'createtable' | 'dropdb' | 'droptable' | 'truncate' | 'createindex' | 'dropindex'

export default function ObjModal(props: {
    kind: ObjModalKind
    db?: string
    placeholder?: string
    busy: boolean
    msg: string
    name: string
    extra: string
    unique?: boolean
    onName: (v: string) => void
    onExtra: (v: string) => void
    onUnique?: (v: boolean) => void
    onClose: () => void
    onConfirm: () => void
}) {
    const { kind, db, placeholder, busy, msg, name, extra, unique = false, onName, onExtra, onUnique, onClose, onConfirm } = props
    const { t } = useTranslation(['db', 'common'])
    const titleMap: Record<string, string> = {
        createdb: t('db:objModal.createdb'),
        dropdb: t('db:objModal.dropdb'),
        createtable: db ? t('db:objModal.createtableIn', { db }) : t('db:objModal.createtable'),
        droptable: t('db:objModal.droptable'),
        truncate: t('db:objModal.truncate'),
        createindex: t('db:objModal.createindex'),
        dropindex: t('db:objModal.dropindex'),
    }
    const needName = !['truncate', 'dropindex'].includes(kind)
    const needDef = kind === 'createtable'
    const needCols = kind === 'createindex'
    const needConfirm = ['dropdb', 'droptable', 'truncate', 'dropindex'].includes(kind)

    const isConfirmDisabled = busy || (!needConfirm && (needName || needDef || needCols) && !name && !extra)

    return (
        <Modal
            closable={false}
            open={true}
            title={titleMap[kind] || t('db:objModal.defaultTitle')}
            onCancel={() => !busy && onClose()}
            onOk={onConfirm}
            confirmLoading={busy}
            okText={needConfirm ? t('db:objModal.confirmExecute') : t('common:confirm')}
            cancelText={t('common:cancel')}
            okButtonProps={{ danger: needConfirm, disabled: isConfirmDisabled }}
            width={kind === 'createtable' ? 620 : 480}
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '10px 0' }}>
                {msg && (
                    <Alert
                        type={msg.includes('失败') || msg.toLowerCase().includes('fail') || msg.toLowerCase().includes('error') ? 'error' : 'success'}
                        showIcon
                        message={msg}
                    />
                )}

                {needConfirm && (
                    <div style={{ fontSize: 13 }}>
                        {kind === 'dropindex' && (
                            <p style={{ margin: 0, color: 'var(--text-color)' }}>
                                {t('db:objModal.dropIndexConfirm', { name })}
                            </p>
                        )}
                        {kind === 'dropdb' && (
                            <p style={{ margin: 0, color: '#ef4444' }}>
                                {t('db:objModal.dropDbConfirm', { name })}
                            </p>
                        )}
                        {kind === 'droptable' && (
                            <p style={{ margin: 0, color: '#ef4444' }}>
                                {t('db:objModal.dropTableConfirm', { name })}
                            </p>
                        )}
                        {kind === 'truncate' && (
                            <p style={{ margin: 0, color: '#ef4444' }}>
                                {t('db:objModal.truncateConfirm', { name })}
                            </p>
                        )}
                    </div>
                )}

                {needName && (
                    <div>
                        <label style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 6, display: 'block' }}>
                            {kind === 'createindex' ? t('db:objModal.indexName') : kind === 'createdb' ? t('db:objModal.dbName') : t('db:objModal.tableName')}
                        </label>
                        <Input
                            value={name}
                            onChange={(e) => onName(e.target.value)}
                            placeholder={kind === 'createdb' ? 'app_db' : 'users'}
                        />
                    </div>
                )}

                {needDef && (
                    <div>
                        <label style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 6, display: 'block' }}>
                            {t('db:objModal.colDef')}
                        </label>
                        <div style={{ border: '1px solid var(--border, #d4dbe6)', borderRadius: '6px', overflow: 'hidden' }}>
                            <CodeEditor
                                value={extra}
                                onChange={onExtra}
                                lang="sql"
                                height="160px"
                                minHeight="80px"
                                placeholder={placeholder || "`id` INT PRIMARY KEY AUTO_INCREMENT, `name` VARCHAR(64)"}
                                lineNumbers={true}
                            />
                        </div>
                    </div>
                )}

                {needCols && (
                    <>
                        <div>
                            <label style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 6, display: 'block' }}>
                                {t('db:objModal.indexCols')}
                            </label>
                            <Input
                                value={extra}
                                onChange={(e) => onExtra(e.target.value)}
                                placeholder="col1, col2"
                            />
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: 12 }}>{t('db:objModal.uniqueIndex')}</span>
                            <Switch checked={unique} onChange={(checked) => onUnique?.(checked)} />
                        </div>
                    </>
                )}
            </div>
        </Modal>
    )
}
