import { useMemo, useState } from 'react'
import { Button, Input, Modal, Tabs, Tag, App } from 'antd'
import { Copy, Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { copyText } from '@/utils'
import s from '../DockerClient.module.less'

interface Props {
    open: boolean
    title: string
    json: string
    kind: 'container' | 'image'
    onClose: () => void
}

function formatBytes(bytes: number): string {
    if (!bytes || bytes <= 0) return '0 B'
    const units = ['B', 'KB', 'MB', 'GB', 'TB']
    const idx = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
    return `${(bytes / Math.pow(1024, idx)).toFixed(idx === 0 ? 0 : 2)} ${units[idx]}`
}

export default function InspectModal({ open, title, json, kind, onClose }: Props) {
    const { t } = useTranslation(['docker', 'common'])
    const { message } = App.useApp()
    const [jsonKw, setJsonKw] = useState('')
    const [envKw, setEnvKw] = useState('')

    const parsed = useMemo(() => {
        if (!json) return null
        try {
            return JSON.parse(json) as Record<string, any>
        } catch {
            return null
        }
    }, [json])

    const filteredJson = useMemo(() => {
        const kw = jsonKw.trim().toLowerCase()
        if (!kw) return { text: json, matchedCount: 0, totalLines: json.split('\n').length }
        const allLines = json.split('\n')
        const matched = allLines.filter((line) => line.toLowerCase().includes(kw))
        return {
            text: matched.join('\n') || t('inspect.noMatch', { defaultValue: '(无匹配行)' }),
            matchedCount: matched.length,
            totalLines: allLines.length,
        }
    }, [json, jsonKw, t])

    const envList = useMemo(() => {
        const raw: string[] = parsed?.Config?.Env || []
        const kw = envKw.trim().toLowerCase()
        return raw
            .map((item) => {
                const eq = item.indexOf('=')
                return eq > -1
                    ? { key: item.slice(0, eq), value: item.slice(eq + 1), raw: item }
                    : { key: item, value: '', raw: item }
            })
            .filter((e) => !kw || e.key.toLowerCase().includes(kw) || e.value.toLowerCase().includes(kw))
    }, [parsed, envKw])

    const renderSummary = () => {
        if (!parsed) {
            return (
                <div style={{ color: 'var(--text-dim)', padding: 16 }}>
                    {t('inspect.parseFail', { defaultValue: '无法解析 Inspect JSON 结构，请切换到原始 JSON 视图查看。' })}
                </div>
            )
        }

        if (kind === 'image') {
            const tags: string[] = parsed.RepoTags || []
            const cmd: string[] = parsed.Config?.Cmd || []
            const entry: string[] = parsed.Config?.Entrypoint || []
            const exposed = Object.keys(parsed.Config?.ExposedPorts || {})
            return (
                <div className={s.inspectSummaryWrap}>
                    <div className={s.inspectSummaryGrid}>
                        <div className={s.infoItem}>
                            <span className={s.infoLabel}>Image ID</span>
                            <span className={s.infoVal} title={parsed.Id}>{parsed.Id || '-'}</span>
                        </div>
                        <div className={s.infoItem}>
                            <span className={s.infoLabel}>{t('inspect.archOs', { defaultValue: '架构 / 系统' })}</span>
                            <span className={s.infoVal}>{`${parsed.Architecture || '-'} / ${parsed.Os || '-'}`}</span>
                        </div>
                        <div className={s.infoItem}>
                            <span className={s.infoLabel}>{t('inspect.size', { defaultValue: '镜像大小' })}</span>
                            <span className={s.infoVal}>{formatBytes(Number(parsed.Size || 0))}</span>
                        </div>
                        <div className={s.infoItem}>
                            <span className={s.infoLabel}>{t('inspect.workdir', { defaultValue: '工作目录' })}</span>
                            <span className={s.infoVal}>{parsed.Config?.WorkingDir || '/'}</span>
                        </div>
                        <div className={s.infoItem} style={{ gridColumn: 'span 2' }}>
                            <span className={s.infoLabel}>RepoTags</span>
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                {tags.length > 0 ? tags.map((tg) => <Tag key={tg} color="blue">{tg}</Tag>) : '-'}
                            </div>
                        </div>
                        <div className={s.infoItem} style={{ gridColumn: 'span 2' }}>
                            <span className={s.infoLabel}>Entrypoint / Cmd</span>
                            <span className={s.infoVal}>
                                {[...entry, ...cmd].join(' ') || '-'}
                            </span>
                        </div>
                        {exposed.length > 0 && (
                            <div className={s.infoItem} style={{ gridColumn: 'span 2' }}>
                                <span className={s.infoLabel}>Exposed Ports</span>
                                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                    {exposed.map((p) => <Tag key={p}>{p}</Tag>)}
                                </div>
                            </div>
                        )}
                    </div>

                    {renderEnvSection()}
                </div>
            )
        }

        const portBindings = parsed.HostConfig?.PortBindings || {}
        const portsEntries = Object.entries(portBindings) as Array<[string, Array<{ HostIp?: string; HostPort?: string }> | null]>
        const mounts: Array<{ Type?: string; Source?: string; Destination?: string; RW?: boolean; Mode?: string }> = parsed.Mounts || []
        const networks = Object.entries(parsed.NetworkSettings?.Networks || {}) as Array<[string, Record<string, any>]>
        const cmd: string[] = parsed.Config?.Cmd || []
        const entry: string[] = parsed.Config?.Entrypoint || []

        return (
            <div className={s.inspectSummaryWrap}>
                <div className={s.inspectSummaryGrid}>
                    <div className={s.infoItem}>
                        <span className={s.infoLabel}>Container ID</span>
                        <span className={s.infoVal} title={parsed.Id}>{parsed.Id || '-'}</span>
                    </div>
                    <div className={s.infoItem}>
                        <span className={s.infoLabel}>{t('inspect.stateStatus', { defaultValue: '运行状态' })}</span>
                        <span className={s.infoVal}>
                            <Tag color={parsed.State?.Running ? 'success' : 'default'}>
                                {parsed.State?.Status || '-'}
                            </Tag>
                            {parsed.RestartCount ? ` (restarts: ${parsed.RestartCount})` : ''}
                        </span>
                    </div>
                    <div className={s.infoItem}>
                        <span className={s.infoLabel}>{t('inspect.image', { defaultValue: '镜像' })}</span>
                        <span className={s.infoVal} title={parsed.Config?.Image}>{parsed.Config?.Image || '-'}</span>
                    </div>
                    <div className={s.infoItem}>
                        <span className={s.infoLabel}>{t('inspect.restartPolicy', { defaultValue: '重启策略' })}</span>
                        <span className={s.infoVal}>{parsed.HostConfig?.RestartPolicy?.Name || 'no'}</span>
                    </div>
                    <div className={s.infoItem}>
                        <span className={s.infoLabel}>{t('inspect.startedAt', { defaultValue: '启动时间' })}</span>
                        <span className={s.infoVal}>{parsed.State?.StartedAt || '-'}</span>
                    </div>
                    <div className={s.infoItem}>
                        <span className={s.infoLabel}>{t('inspect.workdir', { defaultValue: '工作目录' })}</span>
                        <span className={s.infoVal}>{parsed.Config?.WorkingDir || '/'}</span>
                    </div>
                    <div className={s.infoItem} style={{ gridColumn: 'span 2' }}>
                        <span className={s.infoLabel}>Entrypoint / Cmd</span>
                        <span className={s.infoVal} title={[...entry, ...cmd].join(' ')}>
                            {[...entry, ...cmd].join(' ') || '-'}
                        </span>
                    </div>
                </div>

                {portsEntries.length > 0 && (
                    <div className={s.inspectBlock}>
                        <div className={s.inspectBlockTitle}>{t('inspect.ports', { defaultValue: '端口映射 (Ports)' })}</div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {portsEntries.map(([cPort, bindings]) =>
                                (bindings || []).map((b, i) => (
                                    <Tag key={`${cPort}_${i}`} color="cyan" className={s.monoText}>
                                        {`${b.HostIp || '0.0.0.0'}:${b.HostPort || '?'} -> ${cPort}`}
                                    </Tag>
                                ))
                            )}
                        </div>
                    </div>
                )}

                {mounts.length > 0 && (
                    <div className={s.inspectBlock}>
                        <div className={s.inspectBlockTitle}>{t('inspect.mounts', { defaultValue: '挂载卷 (Mounts)' })}</div>
                        <div className={s.inspectList}>
                            {mounts.map((m, idx) => (
                                <div key={idx} className={s.inspectListRow}>
                                    <Tag color="blue" style={{ margin: 0 }}>{m.Type || 'bind'}</Tag>
                                    <span className={s.monoText} style={{ flex: 1, minWidth: 0, wordBreak: 'break-all' }}>
                                        {m.Source || '-'} → {m.Destination || '-'}
                                    </span>
                                    <Tag color={m.RW === false ? 'warning' : 'default'} style={{ margin: 0 }}>
                                        {m.RW === false ? 'ro' : 'rw'}
                                    </Tag>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {networks.length > 0 && (
                    <div className={s.inspectBlock}>
                        <div className={s.inspectBlockTitle}>{t('inspect.networks', { defaultValue: '网络配置 (Networks)' })}</div>
                        <div className={s.inspectList}>
                            {networks.map(([netName, cfg]) => (
                                <div key={netName} className={s.inspectListRow}>
                                    <Tag color="purple" style={{ margin: 0 }}>{netName}</Tag>
                                    <span className={s.monoText} style={{ fontSize: 12 }}>
                                        IP: {cfg.IPAddress || '-'} · GW: {cfg.Gateway || '-'} · MAC: {cfg.MacAddress || '-'}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {renderEnvSection()}
            </div>
        )
    }

    const renderEnvSection = () => (
        <div className={s.inspectBlock}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <span className={s.inspectBlockTitle} style={{ margin: 0 }}>
                    {t('inspect.envVars', { defaultValue: '环境变量 (Environment)' })} ({envList.length})
                </span>
                <Input
                    size="small"
                    allowClear
                    prefix={<Search size={11} />}
                    placeholder={t('inspect.searchEnv', { defaultValue: '过滤环境变量...' })}
                    value={envKw}
                    onChange={(e) => setEnvKw(e.target.value)}
                    style={{ width: 180 }}
                />
            </div>
            <div className={s.inspectList} style={{ maxHeight: 180, overflow: 'auto' }}>
                {envList.length === 0 ? (
                    <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>-</span>
                ) : (
                    envList.map((ev, idx) => (
                        <div key={`${ev.key}_${idx}`} className={s.inspectListRow}>
                            <span className={s.monoText} style={{ fontWeight: 600, minWidth: 160 }}>{ev.key}</span>
                            <span className={s.monoText} style={{ flex: 1, minWidth: 0, color: 'var(--text-dim)', wordBreak: 'break-all' }}>
                                {ev.value}
                            </span>
                            <Button
                                size="small"
                                type="text"
                                icon={<Copy size={11} />}
                                onClick={async () => {
                                    if (await copyText(ev.raw)) {
                                        message.success(t('common:copied', { defaultValue: '已复制' }))
                                    }
                                }}
                            />
                        </div>
                    ))
                )}
            </div>
        </div>
    )

    return (
        <Modal
            title={title}
            open={open}
            onCancel={onClose}
            footer={[
                <Button
                    key="copy"
                    icon={<Copy size={13} />}
                    onClick={async () => {
                        if (await copyText(json)) {
                            message.success(t('images.copiedJson', { defaultValue: '已复制 JSON' }))
                        }
                    }}
                >
                    {t('images.copyJson', { defaultValue: '复制 JSON' })}
                </Button>,
                <Button key="close" type="primary" onClick={onClose}>
                    {t('images.close', { defaultValue: '关闭' })}
                </Button>,
            ]}
            width={820}
            centered
        >
            <Tabs
                defaultActiveKey="summary"
                size="small"
                items={[
                    {
                        key: 'summary',
                        label: t('inspect.tabSummary', { defaultValue: '结构化摘要' }),
                        children: renderSummary(),
                    },
                    {
                        key: 'raw',
                        label: t('inspect.tabRaw', { defaultValue: '原始 JSON' }),
                        children: (
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                    <Input
                                        size="small"
                                        allowClear
                                        prefix={<Search size={12} />}
                                        placeholder={t('inspect.searchJson', { defaultValue: '按关键词过滤 JSON 行...' })}
                                        value={jsonKw}
                                        onChange={(e) => setJsonKw(e.target.value)}
                                        style={{ width: 260 }}
                                    />
                                    <span style={{ fontSize: 11.5, color: 'var(--text-faint)' }}>
                                        {jsonKw.trim()
                                            ? `${filteredJson.matchedCount} / ${filteredJson.totalLines} lines`
                                            : `${filteredJson.totalLines} lines`}
                                    </span>
                                </div>
                                <pre className={s.inspectJsonViewer}>{filteredJson.text}</pre>
                            </div>
                        ),
                    },
                ]}
            />
        </Modal>
    )
}
