import React, { useCallback, useEffect, useState } from 'react'
import { Modal, Button, Tag, Spin, Space } from 'antd'
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
    onNotify: (message: string, kind?: 'info' | 'error') => void
}

export default function FileEditorModal({ open, sessionId, filePath, onClose, onNotify }: Props) {
    const [content, setContent] = useState('')
    const [originalContent, setOriginalContent] = useState('')
    const [loading, setLoading] = useState(false)
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        if (!open || !filePath) return
        setLoading(true)
        API.readRemoteFile(sessionId, filePath)
            .then((text) => {
                setContent(text || '')
                setOriginalContent(text || '')
            })
            .catch((err) => {
                onNotify(`读取文件失败: ${errorMessage(err)}`, 'error')
                onClose()
            })
            .finally(() => setLoading(false))
    }, [open, sessionId, filePath, onClose, onNotify])

    const isModified = content !== originalContent

    const handleSave = useCallback(async () => {
        if (!open || !filePath || saving) return
        setSaving(true)
        try {
            await API.writeRemoteFile(sessionId, filePath, content)
            setOriginalContent(content)
            onNotify(`已保存文件 ${filePath.split('/').pop()}`)
        } catch (err) {
            onNotify(`保存文件失败: ${errorMessage(err)}`, 'error')
        } finally {
            setSaving(false)
        }
    }, [open, sessionId, filePath, content, saving, onNotify])

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
                    {isModified && <Tag color="warning">已修改</Tag>}
                </div>
            }
            footer={
                <Space style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <Button onClick={onClose}>关闭</Button>
                    <Button
                        type="primary"
                        icon={<Save size={13} />}
                        loading={saving}
                        disabled={saving || !isModified}
                        onClick={handleSave}
                    >
                        保存
                    </Button>
                </Space>
            }
        >
            <div className={m.editorContainer}>
                {loading ? (
                    <div className={m.loadingBox}>
                        <Spin tip="正在读取远程文件内容..." />
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
