import { useCallback, useEffect, useState } from 'react'
import { Modal, Button, Tag, Spin, Space, App } from 'antd'
import { useTranslation } from 'react-i18next'
import { FileText, Save } from 'lucide-react'
import CodeEditor, { LangKey } from '@/components/CodeEditor'
import { API } from '@/api'
import { errorMessage } from '@/utils'
import m from '@/pages/ssh/file/FileEditorModal.module.less'

interface Props {
    open: boolean
    sessionId: string
    filePath: string
    onClose: () => void
}

export default function FileEditorModal({ open, sessionId, filePath, onClose }: Props) {
    const { t } = useTranslation(['file', 'common'])
    const { message } = App.useApp()
    const [content, setContent] = useState('')
    const [originalContent, setOriginalContent] = useState('')
    const [loading, setLoading] = useState(false)
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        if (!open || !filePath) return
        let mounted = true
        setLoading(true)
        API.readRemoteFile(sessionId, filePath)
            .then((text) => {
                if (!mounted) return
                setContent(text || '')
                setOriginalContent(text || '')
            })
            .catch((err) => {
                if (!mounted) return
                message.error(t('file:editor.readFileFailed', { error: errorMessage(err) }))
                onClose()
            })
            .finally(() => {
                if (mounted) setLoading(false)
            })
        return () => {
            mounted = false
        }
    }, [open, sessionId, filePath, onClose, t, message])

    const isModified = content !== originalContent

    const handleSave = useCallback(async () => {
        if (!open || !filePath || saving) return
        setSaving(true)
        try {
            await API.writeRemoteFile(sessionId, filePath, content)
            setOriginalContent(content)
            message.success(t('file:editor.savedFile', { name: filePath.split('/').pop() }))
        } catch (err) {
            message.error(t('file:editor.saveFileFailed', { error: errorMessage(err) }))
        } finally {
            setSaving(false)
        }
    }, [open, sessionId, filePath, content, saving, t, message])

    const fileName = filePath.split('/').pop() || filePath
    const lang: LangKey = fileName.endsWith('.json') ? 'json' : 'plain'

    return (
        <Modal
            open={open}
            onCancel={onClose}
            width={860}
            style={{ top: 40 }}
            title={
                <div className={m.titleRow}>
                    <FileText size={16} />
                    <span className={m.fileName}>{fileName}</span>
                    <span className={m.filePath}>
                        ({filePath})
                    </span>
                    {isModified && <Tag color="warning">{t('file:editor.modified')}</Tag>}
                </div>
            }
            footer={
                <Space style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <Button onClick={onClose}>{t('common:close')}</Button>
                    <Button
                        type="primary"
                        icon={<Save size={13} />}
                        loading={saving}
                        disabled={saving || !isModified}
                        onClick={handleSave}
                    >
                        {t('common:save')}
                    </Button>
                </Space>
            }
        >
            <div className={m.editorContainer}>
                {loading ? (
                    <div className={m.loadingBox}>
                        <Spin tip={t('file:editor.readingRemote')} />
                    </div>
                ) : (
                    <CodeEditor
                        value={content}
                        onChange={setContent}
                        lang={lang}
                        height="100%"
                        onModEnter={handleSave}
                    />
                )}
            </div>
        </Modal>
    )
}
