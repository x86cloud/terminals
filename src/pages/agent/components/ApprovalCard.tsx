import { useState } from 'react'
import { Button } from 'antd'
import { Check, ShieldAlert, ShieldCheck, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { ApprovalDecision } from '../agentTypes'
import s from '../AgentPage.module.less'

interface Props {
    approvalId: string
    approvalKind?: string
    command: string
    risk: 'modify' | 'danger' | string
    reason: string
    filePath?: string
    writeMode?: string
    existed?: boolean
    bytes?: number
    preview?: string
    previewTruncated?: boolean
    mainVerdict?: string | null
    canAlwaysAllow: boolean
    decision?: ApprovalDecision
    by?: string
    status: 'waiting' | 'completed' | 'failed'
    onRespond: (approvalId: string, decision: ApprovalDecision) => Promise<void>
}

export default function ApprovalCard({
    approvalId,
    approvalKind,
    command,
    risk,
    reason,
    filePath,
    writeMode,
    existed,
    bytes,
    preview,
    previewTruncated,
    mainVerdict,
    canAlwaysAllow,
    decision,
    by,
    status,
    onRespond,
}: Props) {
    const { t } = useTranslation('agent')
    const [submitting, setSubmitting] = useState(false)
    const isDanger = risk === 'danger'
    const isWaiting = status === 'waiting'

    const act = async (d: ApprovalDecision) => {
        if (submitting || !isWaiting) return
        setSubmitting(true)
        try {
            await onRespond(approvalId, d)
        } finally {
            setSubmitting(false)
        }
    }

    const resolvedLabel = (() => {
        if (by === 'whitelist') return t('approval.resolvedWhitelist')
        if (by === 'main') {
            return decision === 'deny'
                ? t('approval.resolvedMainDeny')
                : t('approval.resolvedMainAllow')
        }
        if (decision === 'always') return t('approval.resolvedUserAlways')
        if (decision === 'allow') return t('approval.resolvedUserAllow')
        return t('approval.resolvedUserDeny')
    })()

    return (
        <div
            className={`${s.approvalCard}${isDanger ? ' ' + s.danger : ''}${!isWaiting ? ' ' + s.resolved : ''}`}
        >
            <div className={s.approvalHead}>
                <div className={s.approvalTitle}>
                    {isWaiting ? (
                        <ShieldAlert size={14} />
                    ) : (
                        <ShieldCheck size={14} />
                    )}
                    <span>
                        {isWaiting
                            ? approvalKind === 'local_write'
                                ? t('approval.localWritePendingTitle')
                                : approvalKind === 'mysql_sql'
                                  ? t('approval.sqlPendingTitle')
                                  : approvalKind === 'conn_create'
                                    ? t('approval.connCreatePendingTitle')
                                    : approvalKind === 'conn_activate'
                                      ? t('approval.connActivatePendingTitle')
                                      : t('approval.pendingTitle')
                            : resolvedLabel}
                    </span>
                </div>
                <span className={`${s.riskTag} ${isDanger ? s.danger : s.modify}`}>
                    {isDanger ? t('approval.riskDanger') : t('approval.riskModify')}
                </span>
            </div>

            {approvalKind === 'local_write' ? (
                <>
                    <div className={s.approvalCmd}>{filePath || command}</div>
                    <div className={s.approvalFileMeta}>
                        <span>{existed ? t('approval.fileOverwrite') : t('approval.fileCreate')}</span>
                        {writeMode && <span>{writeMode}</span>}
                        {typeof bytes === 'number' && <span>{bytes} B</span>}
                    </div>
                    {preview !== undefined && preview !== '' && (
                        <pre className={s.approvalPreview}>
                            {preview}
                            {previewTruncated ? '\n...' : ''}
                        </pre>
                    )}
                </>
            ) : approvalKind === 'conn_create' || approvalKind === 'conn_activate' ? (
                <>
                    <div className={s.approvalCmd}>{command}</div>
                    <div className={s.approvalFileMeta}>
                        {writeMode && <span>{writeMode}</span>}
                        {filePath && <span>{filePath}</span>}
                    </div>
                    {preview !== undefined && preview !== '' && (
                        <pre className={s.approvalPreview}>{preview}</pre>
                    )}
                </>
            ) : (
                command && (
                    <div className={s.approvalCmd}>
                        {approvalKind === 'mysql_sql' ? `sql> ${command}` : `$ ${command}`}
                    </div>
                )
            )}

            {reason && (
                <div className={s.approvalReason}>
                    {t('approval.reasonLabel')}
                    {reason}
                </div>
            )}
            {mainVerdict && (
                <div className={s.approvalReason}>
                    {t('approval.mainVerdictLabel')}
                    {mainVerdict}
                </div>
            )}

            {isWaiting && (
                <div className={s.approvalActions}>
                    <Button
                        size="small"
                        type="primary"
                        icon={<Check size={12} />}
                        loading={submitting}
                        onClick={() => void act('allow')}
                    >
                        {t('approval.allow')}
                    </Button>
                    <Button
                        size="small"
                        danger
                        icon={<X size={12} />}
                        loading={submitting}
                        onClick={() => void act('deny')}
                    >
                        {t('approval.deny')}
                    </Button>
                    {canAlwaysAllow && !isDanger && (
                        <Button
                            size="small"
                            loading={submitting}
                            onClick={() => void act('always')}
                        >
                            {t('approval.alwaysAllow')}
                        </Button>
                    )}
                </div>
            )}
        </div>
    )
}
