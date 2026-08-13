import React, {useCallback, useEffect, useState} from 'react'
import { FileText, Edit } from 'lucide-react'
import CodeEditor, {LangKey} from '../../../components/CodeEditor'
import {API} from '../../../api'
import {errorMessage} from '../../../utils'
import g from '../../../styles/global.module.less'
import m from './FileEditorModal.module.less'

interface Props {
    open: boolean
    sessionId: string
    filePath: string
    onClose: () => void
    onNotify: (message: string, kind?: 'info' | 'error') => void
}

export default function FileEditorModal({open, sessionId, filePath, onClose, onNotify}: Props) {
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

    if (!open) return null

    const fileName = filePath.split('/').pop() || filePath
    const lang: LangKey = fileName.endsWith('.json') ? 'json' : 'plain'

    return (
        <div className={m.overlay} onClick={onClose}>
            <div className={m.modal} onClick={(e) => e.stopPropagation()}>
                <div className={m.header}>
                    <div className={m.titleArea}>
                        <FileText size={14}/>
                        <span className={m.fileName}>{fileName}</span>
                        <span className={m.filePath}>({filePath})</span>
                        {isModified && <span className={m.modifiedBadge}>已修改</span>}
                    </div>
                    <div className={m.actions}>
                        <button
                            className={`${g.btn} ${g.primary} ${g.sm}`}
                            onClick={handleSave}
                            disabled={saving || !isModified}
                            title="保存修改 (Ctrl+S)"
                        >
                            <Edit size={12}/> {saving ? '保存中…' : '保存'}
                        </button>
                        <button className={`${g.btn} ${g.sm}`} onClick={onClose}>
                            关闭
                        </button>
                    </div>
                </div>

                <div className={m.body}>
                    {loading ? (
                        <div className={m.loading}>正在加载远程文件内容…</div>
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
            </div>
        </div>
    )
}
