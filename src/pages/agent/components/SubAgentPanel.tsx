import { Button, Switch, Tooltip } from 'antd'
import { PanelRightClose } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import ClientIcon from '@/components/ClientIcon'
import type { ConnType, SubAgentInfo } from '@/types'
import s from '../AgentPage.module.less'

interface Props {
    subagents: SubAgentInfo[]
    onToggle: (agentId: string, enabled: boolean) => Promise<void>
    onCollapse: () => void
}

const COMING_PROTOCOLS: Array<{ kind: ConnType; label: string }> = [
    { kind: 'redis', label: 'Redis Agent' },
    { kind: 'postgres', label: 'PostgreSQL Agent' },
    { kind: 'mongo', label: 'MongoDB Agent' },
    { kind: 'docker', label: 'Docker Agent' },
    { kind: 'k8s', label: 'Kubernetes Agent' },
]

export default function SubAgentPanel({ subagents, onToggle, onCollapse }: Props) {
    const { t } = useTranslation('agent')
    const enabledCount = subagents.filter((a) => a.enabled).length

    const statusLabel = (status: string) =>
        t(`subPanel.status.${status}`, { defaultValue: status })

    return (
        <aside className={s.subPanel}>
            <div className={s.subPanelHead}>
                <div className={s.subPanelTitle}>
                    <span>{t('subPanel.title')}</span>
                    <span className={s.subPanelCount}>
                        {enabledCount}/{subagents.length}
                    </span>
                </div>
                <Tooltip title={t('collapseSubPanelTip')}>
                    <Button
                        size="small"
                        type="text"
                        icon={<PanelRightClose size={14} />}
                        onClick={onCollapse}
                    />
                </Tooltip>
            </div>

            <div className={s.subPanelBody}>
                <div>
                    <div className={s.subSectionLabel}>{t('subPanel.sectionConnected')}</div>
                    {subagents.length === 0 ? (
                        <div className={s.subEmptyHint}>{t('subPanel.emptyConnected')}</div>
                    ) : (
                        <div className={s.subList}>
                            {subagents.map((agent) => (
                                <div
                                    key={agent.agentId}
                                    className={`${s.subItem}${agent.enabled ? ' ' + s.enabled : ''}`}
                                >
                                    <div className={s.subItemInfo}>
                                        <span style={{ marginTop: 2, flexShrink: 0 }}>
                                            <ClientIcon
                                                kind={(agent.kind as ConnType) || 'ssh'}
                                                size={14}
                                            />
                                        </span>
                                        <div className={s.subItemText}>
                                            <div className={s.subItemNameRow}>
                                                <span
                                                    className={`${s.dot} ${s[agent.status] || s.idle}`}
                                                    title={statusLabel(agent.status)}
                                                />
                                                <span className={s.subItemName} title={agent.name}>
                                                    {agent.name}
                                                </span>
                                            </div>
                                            <span
                                                className={s.subItemHost}
                                                title={`${agent.user}@${agent.host}:${agent.port}`}
                                            >
                                                {agent.user}@{agent.host}:{agent.port}
                                            </span>
                                            {agent.osInfo && (
                                                <span className={s.subItemStatusText} title={agent.osInfo}>
                                                    {agent.osInfo}
                                                </span>
                                            )}
                                            <span className={s.subItemStatusText}>
                                                {agent.enabled
                                                    ? statusLabel(agent.status)
                                                    : t('subPanel.unauthorized')}
                                            </span>
                                        </div>
                                    </div>

                                    <Switch
                                        size="small"
                                        checked={agent.enabled}
                                        onChange={(checked) => void onToggle(agent.agentId, checked)}
                                    />
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div>
                    <div className={s.subSectionLabel}>{t('subPanel.sectionOther')}</div>
                    <div className={s.subList}>
                        {COMING_PROTOCOLS.map((p) => (
                            <div key={p.kind} className={`${s.subItem} ${s.disabledProto}`}>
                                <div className={s.subItemInfo}>
                                    <span style={{ marginTop: 2, flexShrink: 0 }}>
                                        <ClientIcon kind={p.kind} size={14} />
                                    </span>
                                    <span className={s.subItemName}>{p.label}</span>
                                </div>
                                <span className={s.comingTag}>{t('subPanel.comingSoon')}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </aside>
    )
}
