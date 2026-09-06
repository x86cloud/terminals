import React, { useState, useEffect } from 'react'
import { Button, Segmented, Space, Tooltip, Tag, message, Modal, Input } from 'antd'
import { Sparkles, Minimize2, Copy, Save, Plus, FileText, Check, AlertCircle } from 'lucide-react'
import CodeEditor from '@/components/CodeEditor'
import { API } from '@/api'
import { RedisSessionInfo, RedisValue } from '@/types'
import { formatBytes } from '../redisTypes'
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
            return { valid: false, error: e?.message || 'JSON 语法错误' }
        }
    })()

    const beautifyJson = () => {
        try {
            const obj = JSON.parse(content)
            setContent(JSON.stringify(obj, null, 2))
            setFormat('json')
            message.success('已格式化 JSON')
        } catch {
            message.warning('当前内容不是合法的 JSON 格式')
        }
    }

    const minifyJson = () => {
        try {
            const obj = JSON.parse(content)
            setContent(JSON.stringify(obj))
            setFormat('json')
            message.success('已压缩为单行 JSON')
        } catch {
            message.warning('当前内容不是合法的 JSON 格式')
        }
    }

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(content)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
            message.success('已复制到剪贴板')
        } catch {
            message.error('复制失败')
        }
    }

    const handleSave = async () => {
        setSaving(true)
        try {
            await API.redisSet(session.id, selected, 'string', content, value.ttl)
            message.success('保存成功')
            if (flash) flash('已保存')
            onReload()
        } catch (e: any) {
            message.error('保存失败: ' + (e?.message || e))
        } finally {
            setSaving(false)
        }
    }

    const handleAppend = async () => {
        if (!appendVal) return
        try {
            await API.redisStringAppend(session.id, selected, appendVal)
            message.success('已追加内容')
            setAppendModal(false)
            setAppendVal('')
            onReload()
        } catch (e: any) {
            message.error('追加失败: ' + (e?.message || e))
        }
    }

    // Base64 representation
    const base64Content = (() => {
        try {
            return btoa(unescape(encodeURIComponent(content)))
        } catch {
            return '(无法进行 Base64 编码)'
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
                            { value: 'text', label: '纯文本' },
                            { value: 'json', label: 'JSON' },
                            { value: 'base64', label: 'Base64' },
                        ]}
                    />
                    {jsonStatus && (
                        <Tooltip title={jsonStatus.valid ? '合法的 JSON' : jsonStatus.error}>
                            <Tag
                                icon={jsonStatus.valid ? <Check size={11} /> : <AlertCircle size={11} />}
                                color={jsonStatus.valid ? 'success' : 'error'}
                                style={{ cursor: 'help' }}
                            >
                                {jsonStatus.valid ? 'JSON 合法' : 'JSON 格式错误'}
                            </Tag>
                        </Tooltip>
                    )}
                    {isDirty && <Tag color="warning">未保存修改</Tag>}
                </div>

                <div className={s.toolbarRight}>
                    {format === 'json' && (
                        <Space size={4}>
                            <Tooltip title="美化格式化 JSON">
                                <Button size="small" type="text" icon={<Sparkles size={13} />} onClick={beautifyJson}>
                                    美化
                                </Button>
                            </Tooltip>
                            <Tooltip title="压缩 JSON 为单行">
                                <Button size="small" type="text" icon={<Minimize2 size={13} />} onClick={minifyJson}>
                                    压缩
                                </Button>
                            </Tooltip>
                        </Space>
                    )}
                    <Tooltip title="追加字符串 (APPEND)">
                        <Button size="small" icon={<Plus size={13} />} onClick={() => setAppendModal(true)}>
                            追加
                        </Button>
                    </Tooltip>
                    <Tooltip title="复制完整内容">
                        <Button size="small" icon={copied ? <Check size={13} /> : <Copy size={13} />} onClick={handleCopy}>
                            {copied ? '已复制' : '复制'}
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
                        保存修改
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
                        placeholder="输入或粘贴 String 内容..."
                    />
                )}
            </div>

            <div className={s.footerBar}>
                <span className={s.countBadge}>
                    长度: {content.length} 字符 | 占用大小: {formatBytes(new Blob([content]).size)}
                </span>
                <span style={{ color: 'var(--text-dim)' }}>
                    提示: 可按 Ctrl+S (或点击上方保存) 更新值
                </span>
            </div>

            <Modal
                title="追加字符串 (APPEND)"
                open={appendModal}
                onOk={handleAppend}
                onCancel={() => {
                    setAppendModal(false)
                    setAppendVal('')
                }}
                okText="追加"
                cancelText="取消"
            >
                <div style={{ marginTop: 12 }}>
                    <Input.TextArea
                        rows={4}
                        placeholder="输入要追加到末尾的字符串内容..."
                        value={appendVal}
                        onChange={(e) => setAppendVal(e.target.value)}
                    />
                </div>
            </Modal>
        </div>
    )
}
