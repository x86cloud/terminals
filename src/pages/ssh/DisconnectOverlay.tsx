import { Button } from 'antd'
import { RefreshCw, WifiOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { SessionInfo, SshDisconnectCode } from '@/types'
import s from '@/pages/ssh/DisconnectOverlay.module.less'

export type SshConnectionUiState =
    | 'connected'
    | 'auto_reconnecting'
    | 'disconnected'
    | 'manual_reconnecting'

export interface DisconnectOverlayProps {
    session: SessionInfo
    status: Exclude<SshConnectionUiState, 'connected'>
    attempt: number
    maxAttempts: number
    attemptInFlight: boolean
    disconnectCode: SshDisconnectCode
    rawReason: string
    errorDetail: string
    onReconnect: () => void
    onClose: () => void
}

export default function DisconnectOverlay({
    session,
    status,
    attempt,
    maxAttempts,
    attemptInFlight,
    disconnectCode,
    rawReason,
    errorDetail,
    onReconnect,
    onClose,
}: DisconnectOverlayProps) {
    const { t } = useTranslation('ssh')
    const isReconnecting = status === 'auto_reconnecting' || status === 'manual_reconnecting'
    const isAuto = status === 'auto_reconnecting'
    const isManualReconnecting = status === 'manual_reconnecting'
    const reconnectDisabled = isManualReconnecting || (isAuto && attemptInFlight)

    const reasonText = t(`disconnectOverlay.reason.${disconnectCode}`, {
        defaultValue: t('disconnectOverlay.reason.unknown'),
    })
    const detailText = errorDetail || rawReason || reasonText
    const hostSummary = `${session.username}@${session.host}:${session.port}`
    const subtitle = isAuto ? `${hostSummary} · ${reasonText}` : `${hostSummary} · ${detailText}`

    const titleText = isAuto
        ? t('disconnectOverlay.autoReconnectingProgress', {
              attempt: Math.max(1, attempt),
              max: maxAttempts,
          })
        : isManualReconnecting
            ? t('disconnectOverlay.manualReconnecting')
            : t('disconnectOverlay.title')

    return (
        <div
            className={s.overlay}
            onClick={(e) => e.stopPropagation()}
            onContextMenu={(e) => e.stopPropagation()}
        >
            <div className={s.card} role="dialog" aria-modal="true" aria-label={t('disconnectOverlay.title')}>
                <div className={`${s.iconBadge} ${isReconnecting ? s.reconnecting : s.danger}`}>
                    {isReconnecting ? (
                        <RefreshCw size={18} className={s.spinning} />
                    ) : (
                        <WifiOff size={18} />
                    )}
                </div>

                <h3 className={s.title}>{titleText}</h3>

                <p
                    className={`${s.subtitle} ${!isAuto && errorDetail ? s.errorSubtitle : ''}`}
                    title={subtitle}
                >
                    <span className={s.hostText}>{hostSummary}</span>
                    <span className={s.sep}>·</span>
                    <span>{isAuto ? reasonText : detailText}</span>
                </p>

                <div className={s.actions}>
                    <Button
                        type="primary"
                        disabled={reconnectDisabled}
                        onClick={onReconnect}
                    >
                        {isAuto
                            ? t('disconnectOverlay.reconnectNow')
                            : t('disconnectOverlay.reconnect')}
                    </Button>
                    <Button onClick={onClose}>
                        {t('disconnectOverlay.close')}
                    </Button>
                </div>
            </div>
        </div>
    )
}

