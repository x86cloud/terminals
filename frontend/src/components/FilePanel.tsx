import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react'
import Icon from './Icon'
import ContextMenu, {closedMenu, MenuItem, MenuState} from './ContextMenu'
import {ConfirmModal, ConfirmState, PromptModal, PromptState} from './Modal'
import FileEditorModal from './FileEditorModal'
import {API, subscribe} from '../api'
import {FileItem} from '../types'
import {bytesToBase64, errorMessage, formatSize, formatTime, parentRemote} from '../utils'
import g from '../styles/global.module.less'
import fp from './FilePanel.module.less'

interface Props {
    sessionId: string
    homeDir: string
    nativeDrop: boolean
    onPathChange: (path: string) => void
    onNotify: (message: string, kind?: 'info' | 'error') => void
}

const emptyPrompt: PromptState = {open: false, title: '', value: ''}
const emptyConfirm: ConfirmState = {open: false, title: '', message: ''}

export default function FilePanel({sessionId, homeDir, nativeDrop, onPathChange, onNotify}: Props) {
    const [path, setPath] = useState(homeDir || '/')
    const [pathInput, setPathInput] = useState(homeDir || '/')
    const [items, setItems] = useState<FileItem[]>([])
    const [selected, setSelected] = useState<string[]>([])
    const [loading, setLoading] = useState(false)
    const [showHidden, setShowHidden] = useState(false)
    const [filter, setFilter] = useState('')
    const [menu, setMenu] = useState<MenuState>(closedMenu)
    const [prompt, setPrompt] = useState<PromptState>(emptyPrompt)
    const [confirm, setConfirm] = useState<ConfirmState>(emptyConfirm)
    const [editFilePath, setEditFilePath] = useState('')
    const [dragOver, setDragOver] = useState(false)
    const lastIndexRef = useRef<number>(-1)

    const load = useCallback(
        async (target: string, quiet = false) => {
            if (!quiet) setLoading(true)
            try {
                const listing = await API.listDir(sessionId, target)
                setItems(listing.items || [])
                setPath(listing.path)
                setPathInput(listing.path)
                setSelected([])
                onPathChange(listing.path)
            } catch (err) {
                onNotify(errorMessage(err), 'error')
            } finally {
                setLoading(false)
            }
        },
        [sessionId, onPathChange, onNotify]
    )

    useEffect(() => {
        void load(homeDir || '/')
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sessionId])

    useEffect(() => {
        return subscribe('sftp:changed', (payload: { sessionId: string; path: string }) => {
            if (payload?.sessionId === sessionId && payload?.path === path) {
                void load(path, true)
            }
        })
    }, [sessionId, path, load])

    const visible = useMemo(() => {
        const kw = filter.trim().toLowerCase()
        return items.filter((item) => {
            if (!showHidden && item.name.startsWith('.')) return false
            if (kw && !item.name.toLowerCase().includes(kw)) return false
            return true
        })
    }, [items, showHidden, filter])

    const selectedItems = useMemo(
        () => visible.filter((item) => selected.includes(item.path)),
        [visible, selected]
    )

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
            onNotify(errorMessage(err), 'error')
        }
    }

    const uploadViaDialog = async () => {
        try {
            const files = await API.chooseLocalFiles()
            if (files && files.length) {
                await API.uploadPaths(sessionId, path, files)
            }
        } catch (err) {
            onNotify(errorMessage(err), 'error')
        }
    }

    const uploadFolderViaDialog = async () => {
        try {
            const dir = await API.chooseLocalFolder()
            if (dir) await API.uploadPaths(sessionId, path, [dir])
        } catch (err) {
            onNotify(errorMessage(err), 'error')
        }
    }

    const askNewFolder = () => {
        setPrompt({
            open: true,
            title: '新建文件夹',
            label: '文件夹名称',
            value: 'new-folder',
            onConfirm: async (value) => {
                setPrompt(emptyPrompt)
                try {
                    await API.makeDir(sessionId, path, value)
                    await load(path, true)
                } catch (err) {
                    onNotify(errorMessage(err), 'error')
                }
            },
        })
    }

    const askRename = (item: FileItem) => {
        setPrompt({
            open: true,
            title: '重命名',
            label: '新名称',
            value: item.name,
            onConfirm: async (value) => {
                setPrompt(emptyPrompt)
                try {
                    await API.rename(sessionId, item.path, value)
                    await load(path, true)
                } catch (err) {
                    onNotify(errorMessage(err), 'error')
                }
            },
        })
    }

    const askDelete = (paths: string[]) => {
        if (!paths.length) return
        const label =
            paths.length === 1 ? `“${paths[0].split('/').pop()}”` : `选中的 ${paths.length} 个项目`
        setConfirm({
            open: true,
            title: '删除确认',
            danger: true,
            message: `确定要删除 ${label} 吗？目录将被递归删除，该操作不可恢复。`,
            onConfirm: async () => {
                setConfirm(emptyConfirm)
                try {
                    await API.removePaths(sessionId, paths)
                    await load(path, true)
                } catch (err) {
                    onNotify(errorMessage(err), 'error')
                }
            },
        })
    }

    const copyText = async (text: string) => {
        try {
            await navigator.clipboard.writeText(text)
            onNotify('已复制到剪贴板')
        } catch {
            onNotify('复制失败', 'error')
        }
    }

    const itemMenu = (item: FileItem, targets: string[]): MenuItem[] => [
        ...(item.isDir
            ? [{key: 'open', label: '打开', icon: 'folder' as const, onClick: () => load(item.path)}]
            : [{key: 'edit', label: '编辑文件', icon: 'edit' as const, disabled: targets.length > 1, onClick: () => askEdit(item)}]),
        {key: 'download', label: `下载${targets.length > 1 ? ` (${targets.length})` : ''}`, icon: 'download', onClick: () => download(targets)},
        {key: 'rename', label: '重命名', icon: 'edit', disabled: targets.length > 1, onClick: () => askRename(item)},
        {key: 'copy', label: '复制路径', icon: 'copy', onClick: () => copyText(targets.join('\n'))},
        {key: 'd1', label: '', divider: true},
        {key: 'upload', label: '上传到当前目录', icon: 'upload', onClick: uploadViaDialog},
        {key: 'mkdir', label: '新建文件夹', icon: 'newFolder', onClick: askNewFolder},
        {key: 'd2', label: '', divider: true},
        {key: 'delete', label: '删除', icon: 'trash', danger: true, onClick: () => askDelete(targets)},
    ]

    const blankMenu = (): MenuItem[] => [
        {key: 'upload', label: '上传文件', icon: 'upload', onClick: uploadViaDialog},
        {key: 'uploadDir', label: '上传文件夹', icon: 'folder', onClick: uploadFolderViaDialog},
        {key: 'mkdir', label: '新建文件夹', icon: 'newFolder', onClick: askNewFolder},
        {key: 'd1', label: '', divider: true},
        {key: 'copy', label: '复制当前路径', icon: 'copy', onClick: () => copyText(path)},
        {key: 'refresh', label: '刷新', icon: 'refresh', onClick: () => load(path)},
    ]

    /* ---------------- 浏览器降级拖拽 ---------------- */

    const onDrop = async (e: React.DragEvent) => {
        if (nativeDrop) return
        e.preventDefault()
        setDragOver(false)
        const files = Array.from(e.dataTransfer.files || [])
        for (const file of files) {
            try {
                const buffer = await file.arrayBuffer()
                await API.uploadData(sessionId, path, file.name, bytesToBase64(buffer))
            } catch (err) {
                onNotify(errorMessage(err), 'error')
            }
        }
    }

    const breadcrumbs = useMemo(() => {
        const parts = path.split('/').filter(Boolean)
        const crumbs = [{name: '/', full: '/'}]
        let acc = ''
        for (const part of parts) {
            acc += `/${part}`
            crumbs.push({name: part, full: acc})
        }
        return crumbs
    }, [path])

    return (
        <section
            className={`${fp.filePanel}${dragOver ? ' ' + fp.dragOver : ''}`}
            data-session={sessionId}
            onDragOver={(e) => {
                if (nativeDrop) return
                e.preventDefault()
                setDragOver(true)
            }}
            onDragLeave={() => !nativeDrop && setDragOver(false)}
            onDrop={onDrop}
        >
            <div className={fp.fileToolbar}>
                <button className={g.iconBtn} title="上级目录" onClick={() => load(parentRemote(path))}>
                    <Icon name="up"/>
                </button>
                <button className={g.iconBtn} title="主目录" onClick={() => load(homeDir || '/')}>
                    <Icon name="home"/>
                </button>
                <button className={g.iconBtn} title="刷新" onClick={() => load(path)}>
                    <Icon name="refresh"/>
                </button>
                <input
                    className={fp.pathInput}
                    value={pathInput}
                    onChange={(e) => setPathInput(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') void load(pathInput)
                    }}
                    spellCheck={false}
                />
                <button className={g.iconBtn} title="上传文件" onClick={uploadViaDialog}>
                    <Icon name="upload"/>
                </button>
                <button className={g.iconBtn} title="新建文件夹" onClick={askNewFolder}>
                    <Icon name="newFolder"/>
                </button>
            </div>

            <div className={fp.fileSubbar}>
                <div className={fp.crumbs}>
                    {breadcrumbs.map((crumb, i) => (
                        <React.Fragment key={crumb.full}>
                            {i > 0 && <span className={fp.crumbSep}>/</span>}
                            <button className={fp.crumb} onClick={() => load(crumb.full)}>
                                {crumb.name}
                            </button>
                        </React.Fragment>
                    ))}
                </div>
                <input
                    className={fp.filterInput}
                    value={filter}
                    placeholder="过滤"
                    onChange={(e) => setFilter(e.target.value)}
                />
                <label className={fp.checkbox}>
                    <input
                        type="checkbox"
                        checked={showHidden}
                        onChange={(e) => setShowHidden(e.target.checked)}
                    />
                    隐藏文件
                </label>
            </div>

            <div
                className={fp.fileList}
                onContextMenu={(e) => {
                    e.preventDefault()
                    setSelected([])
                    setMenu({open: true, x: e.clientX, y: e.clientY, items: blankMenu()})
                }}
                onMouseDown={(e) => {
                    if (e.target === e.currentTarget) setSelected([])
                }}
            >
                <div className={`${fp.fileRow} ${fp.head}`}>
                    <span className={fp.colName}>名称</span>
                    <span className={fp.colSize}>大小</span>
                    <span className={fp.colTime}>修改时间</span>
                    <span className={fp.colMode}>权限</span>
                </div>

                {loading && <div className={fp.fileEmpty}>加载中…</div>}
                {!loading && visible.length === 0 && <div className={fp.fileEmpty}>空目录，拖入文件即可上传</div>}

                {!loading &&
                    visible.map((item, index) => (
                        <div
                            key={item.path}
                            className={`${fp.fileRow}${selected.includes(item.path) ? ' ' + fp.selected : ''}`}
                            onClick={(e) => onRowClick(e, item, index)}
                            onDoubleClick={() => open(item)}
                            onContextMenu={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                                const targets = selected.includes(item.path) ? selected : [item.path]
                                if (!selected.includes(item.path)) setSelected([item.path])
                                setMenu({open: true, x: e.clientX, y: e.clientY, items: itemMenu(item, targets)})
                            }}
                        >
                            <span className={fp.colName}>
                                <span className={`${fp.fileIcon}${item.isDir ? ' ' + fp.dir : ''}`}>
                                    <Icon name={item.isLink ? 'link' : item.isDir ? 'folder' : 'file'}/>
                                </span>
                                <span className={fp.fileName} title={item.path}>{item.name}</span>
                            </span>
                            <span className={fp.colSize}>{item.isDir ? '-' : formatSize(item.size)}</span>
                            <span className={fp.colTime}>{formatTime(item.modTime)}</span>
                            <span className={fp.colMode}>{item.mode}</span>
                        </div>
                    ))}
            </div>

            <div className={fp.fileStatus}>
                <span>{visible.length} 项</span>
                {selectedItems.length > 0 && <span>已选 {selectedItems.length}</span>}
                <span className={g.spacer}/>
                <span className={fp.hint}>双击/右键编辑文件 · 拖拽上传</span>
            </div>

            <div className={fp.dropHint}>
                <Icon name="upload" size={28}/>
                <span>释放以上传到 {path}</span>
            </div>

            <ContextMenu state={menu} onClose={() => setMenu(closedMenu)}/>
            <PromptModal state={prompt} onCancel={() => setPrompt(emptyPrompt)}/>
            <ConfirmModal state={confirm} onCancel={() => setConfirm(emptyConfirm)}/>
            <FileEditorModal
                open={!!editFilePath}
                sessionId={sessionId}
                filePath={editFilePath}
                onClose={() => setEditFilePath('')}
                onNotify={onNotify}
            />
        </section>
    )
}
