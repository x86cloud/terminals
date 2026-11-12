import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button, Input, Checkbox, Tooltip, Dropdown, App } from 'antd'
import { useTranslation } from 'react-i18next'
import { ChevronUp, Home, RotateCw, Link as LinkIcon, Folder, FileText, Upload, Search, SlidersHorizontal } from 'lucide-react'
import ContextMenu, { closedMenu, MenuItem, MenuState } from '@/components/ContextMenu'
import { ConfirmModal, ConfirmState, PromptModal, PromptState } from '@/components/Modal'
import FileEditorModal from '@/pages/ssh/file/FileEditorModal'
import TransferBar from '@/components/TransferBar'
import ResizableTable, { ColDef } from '@/components/ResizableTable'
import { API, subscribe } from '@/api'
import { FileItem, Transfer, UploadEstimate } from '@/types'
import { copyText, errorMessage, formatSize, formatTime, parentRemote } from '@/utils'
import {
    buildDropBatches,
    extractDroppedEntriesSync,
    streamDropBatches,
} from '@/pages/ssh/file/dropTree'
import fp from '@/pages/ssh/file/FilePanel.module.less'
import { useFileDropActive } from '@/contexts/DragDropContext'

interface Props {
    sessionId: string
    homeDir: string
    nativeDrop: boolean
    reconnectSeq?: number
    onPathChange: (path: string) => void
}

const emptyPrompt: PromptState = { open: false, title: '', value: '' }
const emptyConfirm: ConfirmState = { open: false, title: '', message: '' }

export default function FilePanel({ sessionId, homeDir, nativeDrop, reconnectSeq = 0, onPathChange }: Props) {
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
    const isDropActive = nativeDrop ? isNativeDropActive : (dragOver || isNativeDropActive)
    const lastIndexRef = useRef<number>(-1)

    const cols = useMemo<ColDef[]>(() => {
        const list: ColDef[] = [
            {
                key: 'name',
                label: t('common:name'),
                minWidth: 160,
            },
            {
                key: 'size',
                label: t('common:size'),
                width: 86,
                minWidth: 70,
                align: 'right',
            },
        ]
        if (showTime) {
            list.push({
                key: 'modTime',
                label: t('file:modTime'),
                width: 140,
                minWidth: 110,
            })
        }
        if (showMode) {
            list.push({
                key: 'mode',
                label: t('file:permissions'),
                width: 96,
                minWidth: 80,
            })
        }
        return list
    }, [showTime, showMode, t])

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

    const prevReconnectSeqRef = useRef(reconnectSeq)
    useEffect(() => {
        if (reconnectSeq > 0 && reconnectSeq !== prevReconnectSeqRef.current) {
            prevReconnectSeqRef.current = reconnectSeq
            void load(pathRef.current || homeDir || '/', true)
        } else {
            prevReconnectSeqRef.current = reconnectSeq
        }
    }, [reconnectSeq, homeDir, load])

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

    const selectedSizeText = useMemo(() => {
        if (selected.length === 0) return ''
        const selItems = items.filter((it) => selected.includes(it.path) && !it.isDir)
        if (selItems.length === 0) return ''
        const totalBytes = selItems.reduce((acc, it) => acc + (it.size || 0), 0)
        return formatSize(totalBytes)
    }, [items, selected])

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

    const confirmSpaceAndRun = useCallback(
        async (
            estimateFn: () => Promise<UploadEstimate>,
            runUpload: () => Promise<void>
        ) => {
            try {
                const est = await estimateFn()
                if (est.isInsufficient) {
                    setConfirm({
                        open: true,
                        title: t('file:insufficientSpaceTitle'),
                        danger: true,
                        message: t('file:insufficientSpaceDesc', {
                            totalSize: formatSize(est.totalSize),
                            remoteFree: formatSize(est.remoteFree),
                        }),
                        confirmText: t('file:confirmUpload'),
                        cancelText: t('common:cancel'),
                        onConfirm: async () => {
                            setConfirm(emptyConfirm)
                            await runUpload()
                        },
                    })
                    return
                }
            } catch {
                // 磁盘空间预估失败时不阻塞正常上传
            }
            await runUpload()
        },
        [t]
    )

    const safeUploadPaths = useCallback(
        async (remoteDir: string, localPaths: string[]) => {
            if (!localPaths.length) return
            await confirmSpaceAndRun(
                () => API.estimateUpload(sessionId, remoteDir, localPaths),
                async () => {
                    try {
                        await API.uploadPaths(sessionId, remoteDir, localPaths)
                    } catch (err) {
                        message.error(errorMessage(err))
                    }
                }
            )
        },
        [sessionId, confirmSpaceAndRun, message]
    )

    const uploadViaDialog = useCallback(async () => {
        try {
            const files = await API.chooseLocalFiles()
            if (files && files.length) {
                await safeUploadPaths(path, files)
            }
        } catch (err) {
            message.error(errorMessage(err))
        }
    }, [path, safeUploadPaths, message])

    const uploadFolderViaDialog = useCallback(async () => {
        try {
            const dir = await API.chooseLocalFolder()
            if (dir) await safeUploadPaths(path, [dir])
        } catch (err) {
            message.error(errorMessage(err))
        }
    }, [path, safeUploadPaths, message])

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
                    const fullPath = path.endsWith('/') ? `${path}${value}` : `${path}/${value}`
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
        { key: 'uploadDir', label: t('file:uploadFolderToCurrent', { defaultValue: '上传文件夹到当前目录' }), icon: 'uploadDir', onClick: uploadFolderViaDialog },
        { key: 'newFile', label: t('file:newFile'), icon: 'edit', onClick: askNewFile },
        { key: 'mkdir', label: t('file:newFolder'), icon: 'newFolder', onClick: askNewFolder },
        { key: 'd2', label: '', divider: true },
        { key: 'delete', label: t('common:delete'), icon: 'trash', danger: true, onClick: () => askDelete(targets) },
    ]

    const blankMenu = (): MenuItem[] => [
        { key: 'upload', label: t('file:uploadFile'), icon: 'upload', onClick: uploadViaDialog },
        { key: 'uploadDir', label: t('file:uploadFolder'), icon: 'uploadDir', onClick: uploadFolderViaDialog },
        { key: 'newFile', label: t('file:newFile'), icon: 'edit', onClick: askNewFile },
        { key: 'mkdir', label: t('file:newFolder'), icon: 'newFolder', onClick: askNewFolder },
        { key: 'd1', label: '', divider: true },
        { key: 'copy', label: t('file:copyCurrentPath'), icon: 'copy', onClick: async () => { if (await copyText(path)) message.success(t('file:copiedCurrentPath')) } },
        { key: 'refresh', label: t('common:refresh'), icon: 'refresh', onClick: () => load(path) },
    ]

    /* ---------------- 浏览器降级拖拽（支持文件与文件夹目录树流式分块上传） ---------------- */

    const onDrop = async (e: React.DragEvent) => {
        if (nativeDrop) return
        e.preventDefault()
        e.stopPropagation()
        setDragOver(false)

        // 必须在首个 await 前同步捕获 webkitGetAsEntry 与 fallback files
        const extracted = extractDroppedEntriesSync(e.dataTransfer)
        if (!extracted.entries.length && !extracted.fallbackFiles.length) return

        const targetDir = path
        let batches
        try {
            batches = await buildDropBatches(extracted)
        } catch (err) {
            message.error(
                t('file:dropReadDirFailed', {
                    error: errorMessage(err),
                    defaultValue: `读取拖入目录内容失败: ${errorMessage(err)}`,
                })
            )
            return
        }
        if (!batches.length) return

        const totalSize = batches.reduce((sum, b) => sum + b.totalSize, 0)
        await confirmSpaceAndRun(
            () => API.estimateUploadData(sessionId, targetDir, totalSize),
            async () => {
                try {
                    await streamDropBatches(sessionId, targetDir, batches)
                } catch (err) {
                    message.error(errorMessage(err))
                } finally {
                    void load(targetDir, true)
                }
            }
        )
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
                e.dataTransfer.dropEffect = 'copy'
                setDragOver(true)
            }}
            onDragLeave={(e) => {
                if (e.currentTarget.contains(e.relatedTarget as Node)) return
                if (!nativeDrop) setDragOver(false)
            }}
            onDrop={onDrop}
        >
            {/* 单行一体化紧凑工具栏 */}
            <div className={fp.fileToolbar}>
                <div className={fp.navActions}>
                    <Tooltip title={t('file:parentDir')}>
                        <Button
                            size="small"
                            type="text"
                            className={fp.iconBtn}
                            icon={<ChevronUp size={15} />}
                            onClick={() => load(parentRemote(path))}
                        />
                    </Tooltip>
                    <Tooltip title={t('file:homeDir')}>
                        <Button
                            size="small"
                            type="text"
                            className={fp.iconBtn}
                            icon={<Home size={14} />}
                            onClick={() => load(homeDir || '/')}
                        />
                    </Tooltip>
                    <Tooltip title={t('common:refresh')}>
                        <Button
                            size="small"
                            type="text"
                            className={fp.iconBtn}
                            icon={<RotateCw size={14} />}
                            onClick={() => load(path)}
                        />
                    </Tooltip>
                </div>

                <div className={fp.pathWrap}>
                    <Input
                        size="small"
                        className={fp.pathInput}
                        value={pathInput}
                        onChange={(e) => setPathInput(e.target.value)}
                        onPressEnter={() => void load(pathInput)}
                        spellCheck={false}
                    />
                </div>

                <div className={fp.rightTools}>
                    <Input
                        size="small"
                        className={fp.filterInput}
                        prefix={<Search size={13} className={fp.searchIcon} />}
                        value={filter}
                        placeholder={t('file:filterPlaceholder')}
                        allowClear
                        onChange={(e) => setFilter(e.target.value)}
                    />
                    <Dropdown
                        trigger={['click']}
                        placement="bottomRight"
                        popupRender={() => (
                            <div className={fp.viewDropdownCard}>
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
                        )}
                    >
                        <Tooltip title={t('file:viewOptions', { defaultValue: '视图设置' })}>
                            <Button
                                size="small"
                                type="text"
                                className={`${fp.iconBtn}${showHidden || showTime || showMode ? ' ' + fp.activeIconBtn : ''}`}
                                icon={<SlidersHorizontal size={14} />}
                            />
                        </Tooltip>
                    </Dropdown>
                </div>
            </div>

            {/* 可拖宽文件列表区，消除外框与行间横线 */}
            <div
                className={fp.tableContainer}
                onContextMenu={(e) => {
                    if ((e.target as HTMLElement).closest(`.${fp.fileTr}`)) return
                    e.preventDefault()
                    setSelected([])
                    setMenu({ open: true, x: e.clientX, y: e.clientY, items: blankMenu() })
                }}
                onMouseDown={(e) => {
                    const el = e.target as HTMLElement
                    if (
                        el.closest('th') ||
                        el.closest(`.${fp.fileTr}`) ||
                        el.closest('[role="menu"]') ||
                        el.closest('button') ||
                        el.closest('input')
                    ) {
                        return
                    }
                    setSelected([])
                }}
            >
                <ResizableTable
                    cols={cols}
                    wrapperClassName={fp.sftpTableWrapper}
                    className={fp.sftpTable}
                >
                    <tbody>
                        {loading && (
                            <tr>
                                <td colSpan={cols.length} className={fp.fileEmpty}>
                                    {t('common:loading')}
                                </td>
                            </tr>
                        )}
                        {!loading && visible.length === 0 && (
                            <tr>
                                <td colSpan={cols.length} className={fp.fileEmpty}>
                                    {t('file:emptyDir')}
                                </td>
                            </tr>
                        )}
                        {!loading &&
                            visible.map((item, index) => {
                                const isSelected = selected.includes(item.path)
                                return (
                                    <tr
                                        key={item.path}
                                        className={`${fp.fileTr}${isSelected ? ' ' + fp.selected : ''}`}
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
                                        <td>
                                            <div className={fp.cellName}>
                                                <span className={`${fp.fileIcon}${item.isDir ? ' ' + fp.dir : ''}`}>
                                                    {item.isLink ? <LinkIcon size={16} /> : item.isDir ? <Folder size={16} /> : <FileText size={16} />}
                                                </span>
                                                <span className={fp.fileName} title={item.path}>
                                                    {item.name}
                                                </span>
                                            </div>
                                        </td>
                                        <td className={fp.cellSize}>
                                            {item.isDir ? '-' : formatSize(item.size)}
                                        </td>
                                        {showTime && (
                                            <td className={fp.cellTime}>
                                                {formatTime(item.modTime)}
                                            </td>
                                        )}
                                        {showMode && (
                                            <td className={fp.cellMode}>
                                                {item.mode}
                                            </td>
                                        )}
                                    </tr>
                                )
                            })}
                    </tbody>
                </ResizableTable>
            </div>

            {/* 底部一体化状态栏（左侧统计与选中信息，右侧吸附胶囊传输按钮） */}
            <div className={fp.fileStatus}>
                <div className={fp.statusLeft}>
                    <span>{t('file:itemsCount', { count: visible.length, defaultValue: `${visible.length} 项` })}</span>
                    {selected.length > 0 && (
                        <span className={fp.statusSelected}>
                            {t('file:selectedCount', { count: selected.length, defaultValue: `已选 ${selected.length} 项` })}
                            {selectedSizeText ? ` (${selectedSizeText})` : ''}
                        </span>
                    )}
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
