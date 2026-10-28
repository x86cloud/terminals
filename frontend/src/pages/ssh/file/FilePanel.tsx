import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button, Input, Checkbox, Tooltip, App } from 'antd'
import { useTranslation } from 'react-i18next'
import { ChevronUp, Home, RotateCw, Link as LinkIcon, Folder, FileText, Upload } from 'lucide-react'
import ContextMenu, { closedMenu, MenuItem, MenuState } from '@/components/ContextMenu'
import { ConfirmModal, ConfirmState, PromptModal, PromptState } from '@/components/Modal'
import FileEditorModal from '@/pages/ssh/file/FileEditorModal'
import TransferBar from '@/components/TransferBar'
import { API, subscribe } from '@/api'
import { FileItem, Transfer } from '@/types'
import { bytesToBase64, copyText, errorMessage, formatSize, formatTime, parentRemote } from '@/utils'
import g from '@/styles/global.module.less'
import fp from '@/pages/ssh/file/FilePanel.module.less'
import { useFileDropActive } from '@/contexts/DragDropContext'

interface Props {
    sessionId: string
    homeDir: string
    nativeDrop: boolean
    onPathChange: (path: string) => void
}

const emptyPrompt: PromptState = { open: false, title: '', value: '' }
const emptyConfirm: ConfirmState = { open: false, title: '', message: '' }

export default function FilePanel({ sessionId, homeDir, nativeDrop, onPathChange }: Props) {
    const { t } = useTranslation(['file', 'common'])
    const { message } = App.useApp()
    const [path, setPath] = useState(homeDir || '/')
    const [pathInput, setPathInput] = useState(homeDir || '/')
    const [items, setItems] = useState<FileItem[]>([])
    const [selected, setSelected] = useState<string[]>([])
    const [loading, setLoading] = useState(false)
    const [showHidden, setShowHidden] = useState(false)
    const [showTime, setShowTime] = useState(false)
    const [showMode, setShowMode] = useState(false)
    const [filter, setFilter] = useState('')
    const [menu, setMenu] = useState<MenuState>(closedMenu)
    const [prompt, setPrompt] = useState<PromptState>(emptyPrompt)
    const [confirm, setConfirm] = useState<ConfirmState>(emptyConfirm)
    const [editFilePath, setEditFilePath] = useState('')
    const [dragOver, setDragOver] = useState(false)
    const isNativeDropActive = useFileDropActive(sessionId)
    const isDropActive = nativeDrop ? isNativeDropActive : dragOver
    const lastIndexRef = useRef<number>(-1)

    const gridCols = useMemo(() => {
        let cols = 'minmax(0, 1fr) 78px'
        if (showTime) cols += ' 116px'
        if (showMode) cols += ' 96px'
        return cols
    }, [showTime, showMode])

    const onPathChangeRef = useRef(onPathChange)
    onPathChangeRef.current = onPathChange

    const pathRef = useRef(path)
    pathRef.current = path

    const load = useCallback(
        async (target: string, quiet = false) => {
            if (!quiet) setLoading(true)
            try {
                const listing = await API.listDir(sessionId, target)
                setItems(listing.items || [])
                setPath(listing.path)
                setPathInput(listing.path)
                setSelected([])
                onPathChangeRef.current?.(listing.path)
            } catch (err) {
                message.error(errorMessage(err))
            } finally {
                setLoading(false)
            }
        },
        [sessionId]
    )

    useEffect(() => {
        void load(homeDir || '/')
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sessionId])

    useEffect(() => {
        return subscribe('sftp:changed', (payload: { sessionId: string; path: string }) => {
            if (payload?.sessionId === sessionId && payload?.path === pathRef.current) {
                void load(pathRef.current, true)
            }
        })
    }, [sessionId, load])

    // ---- 会话专属的传输任务管理 ----
    const [transfers, setTransfers] = useState<Transfer[]>([])

    useEffect(() => {
        const handleTransfer = (t: Transfer) => {
            if (!t || !t.id || t.sessionId !== sessionId) return
            setTransfers((prev) => {
                const idx = prev.findIndex((x) => x.id === t.id)
                if (idx >= 0) {
                    const next = [...prev]
                    next[idx] = t
                    return next
                }
                return [...prev, t]
            })
        }
        const offTransferProgress = subscribe('transfer:progress', handleTransfer)
        const offTransferUpdate = subscribe('transfer:update', handleTransfer)

        API.listTransfers()
            .then((list) => {
                if (list && list.length) {
                    setTransfers(list.filter((x) => x.sessionId === sessionId))
                } else {
                    setTransfers([])
                }
            })
            .catch(() => undefined)

        return () => {
            offTransferProgress()
            offTransferUpdate()
        }
    }, [sessionId])

    const visible = useMemo(() => {
        const kw = filter.trim().toLowerCase()
        return items.filter((item) => {
            if (!showHidden && item.name.startsWith('.')) return false
            if (kw && !item.name.toLowerCase().includes(kw)) return false
            return true
        })
    }, [items, showHidden, filter])

    /* ---------------- 交互 ---------------- */

    const onRowClick = (e: React.MouseEvent, item: FileItem, index: number) => {
        if (e.shiftKey && lastIndexRef.current >= 0) {
            const [from, to] = [lastIndexRef.current, index].sort((a, b) => a - b)
            setSelected(visible.slice(from, to + 1).map((f) => f.path))
            return
        }
        if (e.ctrlKey || e.metaKey) {
            setSelected((prev) =>
                prev.includes(item.path) ? prev.filter((p) => p !== item.path) : [...prev, item.path]
            )
            lastIndexRef.current = index
            return
        }
        setSelected([item.path])
        lastIndexRef.current = index
    }

    const askEdit = (item: FileItem) => {
        if (item.isDir) return
        setEditFilePath(item.path)
    }

    const open = (item: FileItem) => {
        if (item.isDir) void load(item.path)
        else askEdit(item)
    }

    const download = async (paths: string[]) => {
        if (!paths.length) return
        try {
            await API.downloadPaths(sessionId, paths)
        } catch (err) {
            message.error(errorMessage(err))
        }
    }

    const safeUploadPaths = async (remoteDir: string, localPaths: string[]) => {
        if (!localPaths.length) return
        try {
            const est = await API.estimateUpload(sessionId, remoteDir, localPaths)
            if (est.isInsufficient) {
                setConfirm({
                    open: true,
                    title: t('file:insufficientSpaceTitle'),
                    danger: true,
                    message: t('file:insufficientSpaceDesc', { totalSize: formatSize(est.totalSize), remoteFree: formatSize(est.remoteFree) }),
                    confirmText: t('file:confirmUpload'),
                    cancelText: t('common:cancel'),
                    onConfirm: async () => {
                        setConfirm(emptyConfirm)
                        try {
                            await API.uploadPaths(sessionId, remoteDir, localPaths)
                        } catch (err) {
                            message.error(errorMessage(err))
                        }
                    },
                })
                return
            }
            await API.uploadPaths(sessionId, remoteDir, localPaths)
        } catch {
            try {
                await API.uploadPaths(sessionId, remoteDir, localPaths)
            } catch (err) {
                message.error(errorMessage(err))
            }
        }
    }

    const uploadViaDialog = async () => {
        try {
            const files = await API.chooseLocalFiles()
            if (files && files.length) {
                await safeUploadPaths(path, files)
            }
        } catch (err) {
            message.error(errorMessage(err))
        }
    }

    const uploadFolderViaDialog = async () => {
        try {
            const dir = await API.chooseLocalFolder()
            if (dir) await safeUploadPaths(path, [dir])
        } catch (err) {
            message.error(errorMessage(err))
        }
    }

    const askNewFile = () => {
        setPrompt({
            open: true,
            title: t('file:newFileTitle'),
            label: t('file:newFilePrompt'),
            value: 'new-file.txt',
            onConfirm: async (value) => {
                setPrompt(emptyPrompt)
                try {
                    const fullPath = path.endsWith('/') ? `${path}${value}` : `${path}/${value}`
                    await API.writeRemoteFile(sessionId, fullPath, '')
                    await load(path, true)
                } catch (err) {
                    message.error(errorMessage(err))
                }
            },
        })
    }

    const askNewFolder = () => {
        setPrompt({
            open: true,
            title: t('file:newFolderTitle'),
            label: t('file:newFolderPrompt'),
            value: 'new-folder',
            onConfirm: async (value) => {
                setPrompt(emptyPrompt)
                try {
                    await API.makeDir(sessionId, path, value)
                    await load(path, true)
                } catch (err) {
                    message.error(errorMessage(err))
                }
            },
        })
    }

    const askRename = (item: FileItem) => {
        setPrompt({
            open: true,
            title: t('file:renameTitle'),
            label: t('file:renamePrompt'),
            value: item.name,
            onConfirm: async (value) => {
                setPrompt(emptyPrompt)
                try {
                    await API.rename(sessionId, item.path, value)
                    await load(path, true)
                } catch (err) {
                    message.error(errorMessage(err))
                }
            },
        })
    }

    const askDelete = (paths: string[]) => {
        if (!paths.length) return
        setConfirm({
            open: true,
            title: t('file:deleteTitle'),
            danger: true,
            message: t('file:deleteConfirm', { count: paths.length }),
            onConfirm: async () => {
                setConfirm(emptyConfirm)
                try {
                    await API.removePaths(sessionId, paths)
                    await load(path, true)
                } catch (err) {
                    message.error(errorMessage(err))
                }
            },
        })
    }

    const itemMenu = (item: FileItem, targets: string[]): MenuItem[] => [
        ...(item.isDir
            ? [{ key: 'open', label: t('file:open'), icon: 'folder' as const, onClick: () => load(item.path) }]
            : [{ key: 'edit', label: t('file:editFile'), icon: 'edit' as const, disabled: targets.length > 1, onClick: () => askEdit(item) }]),
        { key: 'download', label: targets.length > 1 ? t('file:downloadWithCount', { count: targets.length }) : t('file:download'), icon: 'download', onClick: () => download(targets) },
        { key: 'rename', label: t('file:rename'), icon: 'edit', disabled: targets.length > 1, onClick: () => askRename(item) },
        { key: 'copy', label: t('file:copyPath'), icon: 'copy', onClick: async () => { if (await copyText(targets.join('\n'))) message.success(t('file:copiedPath')) } },
        { key: 'd1', label: '', divider: true },
        { key: 'upload', label: t('file:uploadToCurrent'), icon: 'upload', onClick: uploadViaDialog },
        { key: 'newFile', label: t('file:newFile'), icon: 'edit', onClick: askNewFile },
        { key: 'mkdir', label: t('file:newFolder'), icon: 'newFolder', onClick: askNewFolder },
        { key: 'd2', label: '', divider: true },
        { key: 'delete', label: t('common:delete'), icon: 'trash', danger: true, onClick: () => askDelete(targets) },
    ]

    const blankMenu = (): MenuItem[] => [
        { key: 'upload', label: t('file:uploadFile'), icon: 'upload', onClick: uploadViaDialog },
        { key: 'uploadDir', label: t('file:uploadFolder'), icon: 'folder', onClick: uploadFolderViaDialog },
        { key: 'newFile', label: t('file:newFile'), icon: 'edit', onClick: askNewFile },
        { key: 'mkdir', label: t('file:newFolder'), icon: 'newFolder', onClick: askNewFolder },
        { key: 'd1', label: '', divider: true },
        { key: 'copy', label: t('file:copyCurrentPath'), icon: 'copy', onClick: async () => { if (await copyText(path)) message.success(t('file:copiedCurrentPath')) } },
        { key: 'refresh', label: t('common:refresh'), icon: 'refresh', onClick: () => load(path) },
    ]

    /* ---------------- 浏览器降级拖拽 ---------------- */

    const onDrop = async (e: React.DragEvent) => {
        if (nativeDrop) return
        e.preventDefault()
        setDragOver(false)
        const files = Array.from(e.dataTransfer.files || [])
        for (const file of files) {
            try {
                const doUpload = async () => {
                    const buffer = await file.arrayBuffer()
                    await API.uploadData(sessionId, path, file.name, bytesToBase64(buffer))
                }
                const est = await API.estimateUploadData(sessionId, path, file.size)
                if (est.isInsufficient) {
                    setConfirm({
                        open: true,
                        title: t('file:insufficientSpaceTitle'),
                        danger: true,
                        message: t('file:insufficientSpaceDesc', { totalSize: formatSize(est.totalSize), remoteFree: formatSize(est.remoteFree) }),
                        confirmText: t('file:confirmUpload'),
                        cancelText: t('common:cancel'),
                        onConfirm: async () => {
                            setConfirm(emptyConfirm)
                            try {
                                await doUpload()
                            } catch (err) {
                                message.error(errorMessage(err))
                            }
                        },
                    })
                    continue
                }
                await doUpload()
            } catch {
                try {
                    const buffer = await file.arrayBuffer()
                    await API.uploadData(sessionId, path, file.name, bytesToBase64(buffer))
                } catch (err) {
                    message.error(errorMessage(err))
                }
            }
        }
    }

    return (
        <section
            className={`${fp.filePanel}${isDropActive ? ' ' + fp.dragOver : ''}`}
            data-file-drop-target="true"
            data-session-id={sessionId}
            data-path={path}
            onDragOver={(e) => {
                if (nativeDrop) return
                e.preventDefault()
                setDragOver(true)
            }}
            onDragLeave={() => !nativeDrop && setDragOver(false)}
            onDrop={onDrop}
        >
            <div className={fp.fileToolbar} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <Tooltip title={t('file:parentDir')}>
                    <Button
                        size="small"
                        type="text"
                        icon={<ChevronUp size={15} />}
                        onClick={() => load(parentRemote(path))}
                    />
                </Tooltip>
                <Tooltip title={t('file:homeDir')}>
                    <Button
                        size="small"
                        type="text"
                        icon={<Home size={15} />}
                        onClick={() => load(homeDir || '/')}
                    />
                </Tooltip>
                <Tooltip title={t('common:refresh')}>
                    <Button
                        size="small"
                        type="text"
                        icon={<RotateCw size={15} />}
                        onClick={() => load(path)}
                    />
                </Tooltip>
                <Input
                    size="small"
                    className={fp.pathInput}
                    value={pathInput}
                    onChange={(e) => setPathInput(e.target.value)}
                    onPressEnter={() => void load(pathInput)}
                    spellCheck={false}
                />
            </div>

            <div className={fp.fileSubbar}>
                <Input
                    size="small"
                    className={fp.filterInput}
                    value={filter}
                    placeholder={t('file:filterPlaceholder')}
                    allowClear
                    onChange={(e) => setFilter(e.target.value)}
                />
                <div className={fp.rightOptions}>
                    <Checkbox
                        checked={showHidden}
                        onChange={(e) => setShowHidden(e.target.checked)}
                    >
                        {t('file:showHidden')}
                    </Checkbox>
                    <Checkbox
                        checked={showTime}
                        onChange={(e) => setShowTime(e.target.checked)}
                    >
                        {t('file:modTime')}
                    </Checkbox>
                    <Checkbox
                        checked={showMode}
                        onChange={(e) => setShowMode(e.target.checked)}
                    >
                        {t('file:permissions')}
                    </Checkbox>
                </div>
            </div>

            <div
                className={fp.fileList}
                onContextMenu={(e) => {
                    e.preventDefault()
                    setSelected([])
                    setMenu({ open: true, x: e.clientX, y: e.clientY, items: blankMenu() })
                }}
                onMouseDown={(e) => {
                    if (e.target === e.currentTarget) setSelected([])
                }}
            >
                <div className={`${fp.fileRow} ${fp.head}`} style={{ gridTemplateColumns: gridCols }}>
                    <span className={fp.colName}>{t('common:name')}</span>
                    <span className={fp.colSize}>{t('common:size')}</span>
                    {showTime && <span className={fp.colTime}>{t('file:modTime')}</span>}
                    {showMode && <span className={fp.colMode}>{t('file:permissions')}</span>}
                </div>

                {loading && <div className={fp.fileEmpty}>{t('common:loading')}</div>}
                {!loading && visible.length === 0 && <div className={fp.fileEmpty}>{t('file:emptyDir')}</div>}

                {!loading &&
                    visible.map((item, index) => (
                        <div
                            key={item.path}
                            className={`${fp.fileRow}${selected.includes(item.path) ? ' ' + fp.selected : ''}`}
                            style={{ gridTemplateColumns: gridCols }}
                            onClick={(e) => onRowClick(e, item, index)}
                            onDoubleClick={() => open(item)}
                            onContextMenu={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                                const targets = selected.includes(item.path) ? selected : [item.path]
                                if (!selected.includes(item.path)) setSelected([item.path])
                                setMenu({ open: true, x: e.clientX, y: e.clientY, items: itemMenu(item, targets) })
                            }}
                        >
                            <span className={fp.colName}>
                                <span className={`${fp.fileIcon}${item.isDir ? ' ' + fp.dir : ''}`}>
                                    {item.isLink ? <LinkIcon size={16} /> : item.isDir ? <Folder size={16} /> : <FileText size={16} />}
                                </span>
                                <span className={fp.fileName} title={item.path}>{item.name}</span>
                            </span>
                            <span className={fp.colSize}>{item.isDir ? '-' : formatSize(item.size)}</span>
                            {showTime && <span className={fp.colTime}>{formatTime(item.modTime)}</span>}
                            {showMode && <span className={fp.colMode}>{item.mode}</span>}
                        </div>
                    ))}
            </div>



            <TransferBar
                transfers={transfers}
                onCancel={(id) => API.cancelTransfer(id).catch(() => undefined)}
                onClear={() => {
                    API.clearFinishedTransfers()
                        .then(() => setTransfers((prev) => prev.filter((t) => t.status === 'running')))
                        .catch(() => undefined)
                }}
            />
            <div className={fp.fileStatus}>
                <span>{t('file:itemsCount', { count: visible.length, defaultValue: `${visible.length} 项` })}</span>
                <span className={g.spacer} />
            </div>
            {isDropActive && (
                <div className={fp.dropHint}>
                    <Upload size={28} />
                    <span>{t('file:dropToUpload', { path, defaultValue: `释放以上传到 ${path}` })}</span>
                </div>
            )}

            <ContextMenu state={menu} onClose={() => setMenu(closedMenu)} />
            <PromptModal state={prompt} onCancel={() => setPrompt(emptyPrompt)} />
            <ConfirmModal state={confirm} onCancel={() => setConfirm(emptyConfirm)} />
            <FileEditorModal
                open={!!editFilePath}
                sessionId={sessionId}
                filePath={editFilePath}
                onClose={() => setEditFilePath('')}
            />
        </section>
    )
}
