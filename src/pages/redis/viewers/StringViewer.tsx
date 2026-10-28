import { useState, useEffect } from 'react'
import { Button, Segmented, Space, Tooltip, Tag, Modal, Input, App } from 'antd'
import { Sparkles, Minimize2, Copy, Save, Plus, Check, AlertCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import CodeEditor from '@/components/CodeEditor'
import { API } from '@/api'
import { RedisSessionInfo, RedisValue } from '@/types'
import { formatBytes } from '../redisTypes'
import { stringToBase64 } from '@/utils'
import s from './viewers.module.less'

interface Props {
    session: RedisSessionInfo
    selected: string
    value: RedisValue
    onReload: () => void
    flash?: (m: string) => void
}

type ViewFormat = 'text' | 'json' | 'base64'

export default function StringViewer({ session, selected, value, onReload, flash }: Props) {
    const { t } = useTranslation('redis')
    const { message } = App.useApp()
    const rawVal = typeof value.value === 'string' ? value.value : String(value.value ?? '')
    const [content, setContent] = useState(rawVal)
    const [format, setFormat] = useState<ViewFormat>(() => (/^\s*[[{]/.test(rawVal) ? 'json' : 'text'))
    const [saving, setSaving] = useState(false)
    const [appendModal, setAppendModal] = useState(false)
    const [appendVal, setAppendVal] = useState('')
    const [copied, setCopied] = useState(false)

    useEffect(() => {
        const nextVal = typeof value.value === 'string' ? value.value : String(value.value ?? '')
        setContent(nextVal)
        if (/^\s*[[{]/.test(nextVal)) {
            setFormat('json')
        }
    }, [value.value, selected])

    const isDirty = content !== rawVal

    // JSON Validation
    const jsonStatus = (() => {
        if (!content.trim()) return null
        try {
            JSON.parse(content)
            return { valid: true, error: null }
        } catch (e: any) {
            return { valid: false, error: e?.message || t('viewers.string.syntaxError') }
        }
    })()

    const beautifyJson = () => {
        try {
            const obj = JSON.parse(content)
            setContent(JSON.stringify(obj, null, 2))
            setFormat('json')
            message.success(t('viewers.string.formattedSuccess'))
        } catch {
            message.warning(t('viewers.string.notJsonWarn'))
        }
    }

    const minifyJson = () => {
        try {
            const obj = JSON.parse(content)
            setContent(JSON.stringify(obj))
            setFormat('json')
            message.success(t('viewers.string.compressedSuccess'))
        } catch {
            message.warning(t('viewers.string.notJsonWarn'))
        }
    }

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(content)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
            message.success(t('viewers.string.copiedSuccess'))
        } catch {
            message.error(t('viewers.string.copyFail'))
        }
    }

    const handleSave = async () => {
        setSaving(true)
        try {
            await API.redisSet(session.id, selected, 'string', content, value.ttl)
            message.success(t('viewers.string.saveSuccess'))
            if (flash) flash(t('viewers.string.saved'))
            onReload()
        } catch (e: any) {
            message.error(t('viewers.string.saveFail', { error: e?.message || e }))
        } finally {
            setSaving(false)
        }
    }

    const handleAppend = async () => {
        if (!appendVal) return
        try {
            await API.redisStringAppend(session.id, selected, appendVal)
            message.success(t('viewers.string.appendSuccess'))
            setAppendModal(false)
            setAppendVal('')
            onReload()
        } catch (e: any) {
            message.error(t('viewers.string.appendFail', { error: e?.message || e }))
        }
    }

    // Base64 representation
    const base64Content = (() => {
        try {
            return stringToBase64(content)
        } catch {
            return t('viewers.string.cannotBase64')
        }
    })()

    return (
        <div className={s.viewerContainer}>
            <div className={s.viewerToolbar}>
                <div className={s.toolbarLeft}>
                    <Segmented
                        size="small"
                        value={format}
                        onChange={(v) => setFormat(v as ViewFormat)}
                        options={[
                            { value: 'text', label: t('viewers.string.plainText') },
                            { value: 'json', label: 'JSON' },
                            { value: 'base64', label: 'Base64' },
                        ]}
                    />
                    {jsonStatus && (
                        <Tooltip title={jsonStatus.valid ? t('viewers.string.jsonValid') : jsonStatus.error}>
                            <Tag
                                icon={jsonStatus.valid ? <Check size={11} /> : <AlertCircle size={11} />}
                                color={jsonStatus.valid ? 'success' : 'error'}
                                style={{ cursor: 'help' }}
                            >
                                {jsonStatus.valid ? t('viewers.string.jsonValid') : t('viewers.string.jsonInvalid')}
                            </Tag>
                        </Tooltip>
                    )}
                    {isDirty && <Tag color="warning">{t('viewers.string.unformatted')}</Tag>}
                </div>

                <div className={s.toolbarRight}>
                    {format === 'json' && (
                        <Space size={4}>
                            <Tooltip title={t('viewers.string.beautifyTooltip')}>
                                <Button size="small" type="text" icon={<Sparkles size={13} />} onClick={beautifyJson}>
                                    {t('viewers.string.beautify')}
                                </Button>
                            </Tooltip>
                            <Tooltip title={t('viewers.string.compressTooltip')}>
                                <Button size="small" type="text" icon={<Minimize2 size={13} />} onClick={minifyJson}>
                                    {t('viewers.string.compress')}
                                </Button>
                            </Tooltip>
                        </Space>
                    )}
                    <Tooltip title={t('viewers.string.appendTooltip')}>
                        <Button size="small" icon={<Plus size={13} />} onClick={() => setAppendModal(true)}>
                            {t('viewers.string.append')}
                        </Button>
                    </Tooltip>
                    <Tooltip title={t('viewers.string.copyTooltip')}>
                        <Button size="small" icon={copied ? <Check size={13} /> : <Copy size={13} />} onClick={handleCopy}>
                            {copied ? t('viewers.common.copied') : t('viewers.common.copy')}
                        </Button>
                    </Tooltip>
                    <Button
                        size="small"
                        type="primary"
                        icon={<Save size={13} />}
                        loading={saving}
                        disabled={!isDirty}
                        onClick={handleSave}
                    >
                        {t('viewers.string.saveChanges')}
                    </Button>
                </div>
            </div>

            <div className={s.editorArea}>
                {format === 'base64' ? (
                    <CodeEditor
                        value={base64Content}
                        onChange={() => {}}
                        lang="plain"
                        readOnly
                        height="100%"
                        lineNumbers
                    />
                ) : (
                    <CodeEditor
                        value={content}
                        onChange={setContent}
                        lang={format === 'json' ? 'json' : 'plain'}
                        height="100%"
                        lineNumbers
                        placeholder={t('viewers.string.contentPlaceholder')}
                    />
                )}
            </div>

            <div className={s.footerBar}>
                <span className={s.countBadge}>
                    {t('viewers.string.statHint', { len: content.length, size: formatBytes(new Blob([content]).size) })}
                </span>
                <span style={{ color: 'var(--text-dim)' }}>
                    {t('viewers.string.shortcutHint')}
                </span>
            </div>

            <Modal
                title={t('viewers.string.appendTitle')}
                open={appendModal}
                onOk={handleAppend}
                onCancel={() => {
                    setAppendModal(false)
                    setAppendVal('')
                }}
                okText={t('viewers.string.appendOk')}
                cancelText={t('viewers.common.cancel')}
            >
                <div style={{ marginTop: 12 }}>
                    <Input.TextArea
                        rows={4}
                        placeholder={t('viewers.string.appendPlaceholder')}
                        value={appendVal}
                        onChange={(e) => setAppendVal(e.target.value)}
                    />
                </div>
            </Modal>
        </div>
    )
}
