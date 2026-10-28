import { useState, useEffect } from 'react'
import { Button, Tag, Space, Alert, Tooltip, App } from 'antd'
import { RotateCw, CheckCircle2, ArrowUpRight, Copy, GitBranch, Calendar, Laptop, Sparkles } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import AppLogo from '@/components/AppLogo'
import { API } from '@/api'
import { AppVersionInfo, UpdateCheckResult } from '@/types'
import ab from './AboutTab.module.less'

export default function AboutTab() {
    const { t } = useTranslation(['settings', 'common'])
    const { message } = App.useApp()
    const [versionInfo, setVersionInfo] = useState<AppVersionInfo>({
        version: 'v1.0.3',
        gitCommit: 'dev',
        buildDate: '',
        goVersion: '',
        platform: 'windows/amd64',
    })
    const [checking, setChecking] = useState(false)
    const [updateResult, setUpdateResult] = useState<UpdateCheckResult | null>(null)

    useEffect(() => {
        let mounted = true
        API.getAppVersion()
            .then((info) => {
                if (mounted && info) {
                    setVersionInfo(info)
                }
            })
            .catch(() => { })
        return () => {
            mounted = false
        }
    }, [])

    const handleCheckUpdates = async () => {
        setChecking(true)
        setUpdateResult(null)
        try {
            const res = await API.checkForUpdates()
            setUpdateResult(res)
            if (res.hasUpdate) {
                message.info(t('settings:about.foundNewVersion', { version: res.latestVersion }))
            }
        } catch (e: any) {
            setUpdateResult({
                currentVersion: versionInfo.version,
                latestVersion: versionInfo.version,
                hasUpdate: false,
                releaseUrl: 'https://github.com/x86cloud/terminals/releases',
                repoUrl: 'https://github.com/x86cloud/terminals',
                checkedAt: new Date().toLocaleString(),
                errorMessage: e?.message || t('settings:about.checkFailedDesc'),
            })
        } finally {
            setChecking(false)
        }
    }

    const openUrl = (url: string) => {
        API.openBrowser(url)
    }

    const copyUrl = async (url: string) => {
        try {
            await navigator.clipboard.writeText(url)
            message.success(t('settings:about.copiedLink'))
        } catch {
            message.error(t('settings:about.copyFailed'))
        }
    }

    return (
        <div className={ab.aboutBox}>
            <AppLogo size={64} />
            <div className={ab.appName}>xTerminal</div>

            <div className={ab.verBadgeRow}>
                <span className={ab.appVer}>{versionInfo.version}</span>
                {versionInfo.gitCommit && versionInfo.gitCommit !== 'dev' && (
                    <Tooltip title="Git Commit SHA">
                        <Tag icon={<GitBranch size={11} />} color="default">
                            {versionInfo.gitCommit}
                        </Tag>
                    </Tooltip>
                )}
                {versionInfo.buildDate && (
                    <Tooltip title={t('settings:about.buildDate')}>
                        <Tag icon={<Calendar size={11} />} color="default">
                            {versionInfo.buildDate}
                        </Tag>
                    </Tooltip>
                )}
                {versionInfo.platform && (
                    <Tooltip title={t('settings:about.platform')}>
                        <Tag icon={<Laptop size={11} />} color="default">
                            {versionInfo.platform}
                        </Tag>
                    </Tooltip>
                )}
            </div>

            <div className={ab.appDesc}>
                {t('settings:about.fullDescription')}
            </div>

            {/* Check Updates Action Area */}
            <div className={ab.actionArea}>
                <Button
                    type="primary"
                    icon={<RotateCw size={13} className={checking ? 'spin' : ''} />}
                    loading={checking}
                    onClick={handleCheckUpdates}
                >
                    {checking ? t('settings:about.checkingUpdate') : t('settings:about.checkUpdate')}
                </Button>

                {/* Update Check Results */}
                {updateResult && !checking && (
                    <>
                        {updateResult.errorMessage ? (
                            <Alert
                                type="warning"
                                showIcon
                                title={t('settings:about.checkFailed')}
                                description={
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
                                        <span>{updateResult.errorMessage}</span>
                                        <Space size={8}>
                                            <Button size="small" onClick={handleCheckUpdates}>
                                                {t('settings:about.retry')}
                                            </Button>
                                            <Button size="small" type="link" onClick={() => openUrl(updateResult.repoUrl)}>
                                                {t('settings:about.visitRepo')}
                                            </Button>
                                        </Space>
                                    </div>
                                }
                                style={{ width: '100%', textAlign: 'left' }}
                            />
                        ) : updateResult.hasUpdate ? (
                            <div className={`${ab.updateCard} ${ab.updateCardNew}`}>
                                <div className={ab.updateCardHead}>
                                    <div className={ab.updateTitle}>
                                        <Sparkles size={16} style={{ color: 'var(--accent)' }} />
                                        {t('settings:about.foundNewVersion', { version: updateResult.latestVersion })}
                                    </div>
                                    <Tag color="processing">{t('settings:about.availableUpdate')}</Tag>
                                </div>
                                <div className={ab.updateDesc}>
                                    {t('settings:about.newVersionDesc', { current: versionInfo.version })}
                                </div>
                                <div className={ab.updateBtns}>
                                    <Button
                                        size="small"
                                        type="primary"
                                        icon={<ArrowUpRight size={13} />}
                                        onClick={() => openUrl(updateResult.releaseUrl)}
                                    >
                                        {t('settings:about.viewDownload')}
                                    </Button>
                                    <Button
                                        size="small"
                                        icon={<Copy size={13} />}
                                        onClick={() => copyUrl(updateResult.releaseUrl)}
                                    >
                                        {t('settings:about.copyLink')}
                                    </Button>
                                </div>
                            </div>
                        ) : (
                            <Alert
                                type="success"
                                showIcon
                                icon={<CheckCircle2 size={15} style={{ color: 'var(--ok)' }} />}
                                title={`${t('settings:about.alreadyLatest')} (${versionInfo.version})`}
                                description={
                                    <span style={{ fontSize: 11.5, color: 'var(--text-dim)' }}>
                                        {t('settings:about.checkTime', { time: updateResult.checkedAt })}
                                    </span>
                                }
                                style={{ width: '100%', textAlign: 'left' }}
                            />
                        )}
                    </>
                )}
            </div>

            {/* System / Repo Footer Info */}
            <div className={ab.sysInfoBox}>
                <div>
                    {t('settings:about.runtimeEngine', { go: versionInfo.goVersion || 'Go 1.27' })}
                </div>
                <div>
                    {t('settings:about.openSourceRepo')}{' '}
                    <a
                        href="https://github.com/x86cloud/terminals"
                        onClick={(e) => {
                            e.preventDefault()
                            openUrl('https://github.com/x86cloud/terminals')
                        }}
                    >
                        https://github.com/x86cloud/terminals
                    </a>
                </div>
            </div>
        </div>
    )
}
