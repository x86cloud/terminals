import React, { useState, useEffect } from 'react'
import { Button, Tag, Space, Alert, Tooltip, message } from 'antd'
import { RotateCw, CheckCircle2, ArrowUpRight, Copy, GitBranch, Calendar, Laptop, Sparkles } from 'lucide-react'
import AppLogo from '@/components/AppLogo'
import { API } from '@/api'
import { AppVersionInfo, UpdateCheckResult } from '@/types'
import ab from './AboutTab.module.less'

export default function AboutTab() {
    const [versionInfo, setVersionInfo] = useState<AppVersionInfo>({
        version: 'v1.0.3',
        gitCommit: 'dev',
        buildDate: '',
        goVersion: '',
        platform: 'windows/amd64',
    })
    const [loadingVer, setLoadingVer] = useState(true)
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
            .finally(() => {
                if (mounted) setLoadingVer(false)
            })
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
                message.info(`发现新版本: ${res.latestVersion}`)
            }
        } catch (e: any) {
            setUpdateResult({
                currentVersion: versionInfo.version,
                latestVersion: versionInfo.version,
                hasUpdate: false,
                releaseUrl: 'https://github.com/x86cloud/terminals/releases',
                repoUrl: 'https://github.com/x86cloud/terminals',
                checkedAt: new Date().toLocaleString(),
                errorMessage: e?.message || '检查更新失败，请检查网络连接',
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
            message.success('已复制下载发布链接')
        } catch {
            message.error('复制失败')
        }
    }

    return (
        <div className={ab.aboutBox}>
            <AppLogo size={52} />
            <div className={ab.appName}>xClient</div>

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
                    <Tooltip title="构建日期">
                        <Tag icon={<Calendar size={11} />} color="default">
                            {versionInfo.buildDate}
                        </Tag>
                    </Tooltip>
                )}
                {versionInfo.platform && (
                    <Tooltip title="运行平台">
                        <Tag icon={<Laptop size={11} />} color="default">
                            {versionInfo.platform}
                        </Tag>
                    </Tooltip>
                )}
            </div>

            <div className={ab.appDesc}>
                一款跨平台的现代 All-in-One 全栈工作台，集 SSH 终端、Docker & Kubernetes 容器云原生编排、全套多数据库协同（MySQL、PostgreSQL、Redis、MongoDB、SQLite）、MQTT 物联网调试、API 测试与自主 AI Agent 智能助手于一体。
            </div>

            {/* Check Updates Action Area */}
            <div className={ab.actionArea}>
                <Button
                    type="primary"
                    icon={<RotateCw size={13} className={checking ? 'spin' : ''} />}
                    loading={checking}
                    onClick={handleCheckUpdates}
                >
                    {checking ? '正在检查更新...' : '检查更新'}
                </Button>

                {/* Update Check Results */}
                {updateResult && !checking && (
                    <>
                        {updateResult.errorMessage ? (
                            <Alert
                                type="warning"
                                showIcon
                                title="检查更新失败"
                                description={
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
                                        <span>{updateResult.errorMessage}</span>
                                        <Space size={8}>
                                            <Button size="small" onClick={handleCheckUpdates}>
                                                重试
                                            </Button>
                                            <Button size="small" type="link" onClick={() => openUrl(updateResult.repoUrl)}>
                                                直接访问 GitHub 仓库
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
                                        发现新版本: {updateResult.latestVersion}
                                    </div>
                                    <Tag color="processing">有可用更新</Tag>
                                </div>
                                <div className={ab.updateDesc}>
                                    检测到远端已发布新的 Release 版本（当前版本: {versionInfo.version}）。建议下载升级以体验最新特性与体验修复。
                                </div>
                                <div className={ab.updateBtns}>
                                    <Button
                                        size="small"
                                        type="primary"
                                        icon={<ArrowUpRight size={13} />}
                                        onClick={() => openUrl(updateResult.releaseUrl)}
                                    >
                                        前往 GitHub 查看 / 下载
                                    </Button>
                                    <Button
                                        size="small"
                                        icon={<Copy size={13} />}
                                        onClick={() => copyUrl(updateResult.releaseUrl)}
                                    >
                                        复制链接
                                    </Button>
                                </div>
                            </div>
                        ) : (
                            <Alert
                                type="success"
                                showIcon
                                icon={<CheckCircle2 size={15} style={{ color: 'var(--ok)' }} />}
                                title={`当前已是最新版本 (${versionInfo.version})`}
                                description={
                                    <span style={{ fontSize: 11.5, color: 'var(--text-dim)' }}>
                                        检查时间: {updateResult.checkedAt}
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
                    运行驱动: {versionInfo.goVersion || 'Go 1.27'} / Wails v3 Framework
                </div>
                <div>
                    开源仓库:{' '}
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
