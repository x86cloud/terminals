import { useState } from 'react'
import { Button, Checkbox, Input, Modal, Tabs, message } from 'antd'
import { FileUp, Globe, StickyNote } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { API } from '@/api'

interface Props {
    open: boolean
    onClose: () => void
    onIngested: (relPath: string, title: string, autoCompile: boolean) => void
}

export default function WikiIngestModal({ open, onClose, onIngested }: Props) {
    const { t } = useTranslation(['wiki', 'common'])
    const [tab, setTab] = useState<'file' | 'url' | 'text'>('file')
    const [pickedFile, setPickedFile] = useState('')
    const [url, setUrl] = useState('')
    const [title, setTitle] = useState('')
    const [content, setContent] = useState('')
    const [autoCompile, setAutoCompile] = useState(true)
    const [submitting, setSubmitting] = useState(false)

    const pickLocalFile = async () => {
        const files = await API.chooseLocalFiles()
        if (files && files.length > 0) {
            setPickedFile(files[0])
        }
    }

    const handleSubmit = async () => {
        if (submitting) return
        setSubmitting(true)
        try {
            let res
            if (tab === 'file') {
                if (!pickedFile.trim()) {
                    message.warning(t('wiki:ingest.pickFile'))
                    return
                }
                res = await API.wikiIngestFile(pickedFile)
            } else if (tab === 'url') {
                if (!url.trim()) return
                res = await API.wikiIngestUrl(url.trim())
            } else {
                if (!title.trim() || !content.trim()) return
                res = await API.wikiIngestText(title.trim(), content.trim(), 'manual')
            }

            if (!autoCompile) {
                message.success(t('wiki:ingest.ingestedOnly', { path: res.relPath }))
            }
            setPickedFile('')
            setUrl('')
            setTitle('')
            setContent('')
            onClose()
            onIngested(res.relPath, res.title, autoCompile)
        } catch (err) {
            message.error(typeof err === 'string' ? err : String(err))
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <Modal
            title={t('wiki:ingest.title')}
            open={open}
            onCancel={onClose}
            onOk={() => void handleSubmit()}
            okText={t('wiki:ingest.submit')}
            cancelText={t('common:cancel')}
            confirmLoading={submitting}
            width={560}
        >
            <Tabs
                activeKey={tab}
                onChange={(k) => setTab(k as 'file' | 'url' | 'text')}
                items={[
                    {
                        key: 'file',
                        label: (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                                <FileUp size={13} />
                                {t('wiki:ingest.tabFile')}
                            </span>
                        ),
                        children: (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                <Button onClick={() => void pickLocalFile()}>
                                    {t('wiki:ingest.pickFile')}
                                </Button>
                                {pickedFile && (
                                    <div style={{ fontSize: 12, color: 'var(--text-dim)', wordBreak: 'break-all' }}>
                                        {t('wiki:ingest.pickedFile', { path: pickedFile })}
                                    </div>
                                )}
                            </div>
                        ),
                    },
                    {
                        key: 'url',
                        label: (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                                <Globe size={13} />
                                {t('wiki:ingest.tabUrl')}
                            </span>
                        ),
                        children: (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                                    {t('wiki:ingest.urlLabel')}
                                </div>
                                <Input
                                    value={url}
                                    onChange={(e) => setUrl(e.target.value)}
                                    placeholder={t('wiki:ingest.urlPlaceholder')}
                                />
                            </div>
                        ),
                    },
                    {
                        key: 'text',
                        label: (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                                <StickyNote size={13} />
                                {t('wiki:ingest.tabText')}
                            </span>
                        ),
                        children: (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                <div>
                                    <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 4 }}>
                                        {t('wiki:ingest.textTitle')}
                                    </div>
                                    <Input
                                        value={title}
                                        onChange={(e) => setTitle(e.target.value)}
                                        placeholder={t('wiki:ingest.textTitlePlaceholder')}
                                    />
                                </div>
                                <div>
                                    <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 4 }}>
                                        {t('wiki:ingest.textContent')}
                                    </div>
                                    <Input.TextArea
                                        rows={6}
                                        value={content}
                                        onChange={(e) => setContent(e.target.value)}
                                        placeholder={t('wiki:ingest.textContentPlaceholder')}
                                    />
                                </div>
                            </div>
                        ),
                    },
                ]}
            />

            <div style={{ marginTop: 14 }}>
                <Checkbox
                    checked={autoCompile}
                    onChange={(e) => setAutoCompile(e.target.checked)}
                >
                    <span style={{ fontSize: 12.5 }}>{t('wiki:ingest.autoCompile')}</span>
                </Checkbox>
            </div>
        </Modal>
    )
}
