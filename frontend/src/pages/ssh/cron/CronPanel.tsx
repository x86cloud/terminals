import React, {useCallback, useEffect, useMemo, useState} from 'react'
import { Plus, Search, X, RotateCw } from 'lucide-react'
import {ConfirmModal, ConfirmState} from '../../../components/Modal'
import CronModal, {explainCron} from './CronModal'
import {API} from '../../../api'
import {SSHCronItem} from '../../../types'
import {errorMessage} from '../../../utils'
import g from '../../../styles/global.module.less'
import c from './CronPanel.module.less'

interface Props {
    sessionId: string
    active: boolean
    onNotify?: (message: string, kind?: 'info' | 'error') => void
}

export default function CronPanel({sessionId, active, onNotify}: Props) {
    const [items, setItems] = useState<SSHCronItem[]>([])
    const [busy, setBusy] = useState(false)
    const [loaded, setLoaded] = useState(false)
    const [error, setError] = useState('')
    const [keyword, setKeyword] = useState('')
    const [lastUpdate, setLastUpdate] = useState<string>('')

    // Modal 开关
    const [modalOpen, setModalOpen] = useState(false)
    const [editingItem, setEditingItem] = useState<SSHCronItem | null>(null)

    // 删除 Confirmation Modal
    const [confirm, setConfirm] = useState<ConfirmState>({
        open: false,
        title: '',
        message: '',
        danger: true,
        onConfirm: () => {},
    })

    // 试运行 Modal
    const [runOutput, setRunOutput] = useState<string>('')
    const [runCommand, setRunCommand] = useState<string>('')
    const [runBusy, setRunBusy] = useState(false)

    const fetchCrons = useCallback(async () => {
        setBusy(true)
        setError('')
        try {
            const list = await API.sshCronList(sessionId)
            setItems(list || [])
            setLastUpdate(new Date().toLocaleTimeString())
            setLoaded(true)
        } catch (e) {
            const msg = errorMessage(e)
            setError(msg)
            if (onNotify) onNotify(`读取 Crontab 任务失败: ${msg}`, 'error')
        } finally {
            setBusy(false)
        }
    }, [sessionId, onNotify])

    useEffect(() => {
        if (active && !loaded && !busy) {
            void fetchCrons()
        }
    }, [active, loaded, busy, fetchCrons])

    const filteredItems = useMemo(() => {
        if (!keyword.trim()) return items
        const kw = keyword.trim().toLowerCase()
        return items.filter(
            (it) =>
                it.expression.toLowerCase().includes(kw) ||
                it.command.toLowerCase().includes(kw) ||
                it.comment.toLowerCase().includes(kw)
        )
    }, [items, keyword])

    const handleSaveList = async (nextList: SSHCronItem[]) => {
        setBusy(true)
        try {
            await API.sshSaveCronList(sessionId, nextList)
            setItems(nextList)
            if (onNotify) onNotify('Crontab 定时任务保存成功')
        } catch (e) {
            const msg = errorMessage(e)
            if (onNotify) onNotify(`保存失败: ${msg}`, 'error')
            await fetchCrons()
        } finally {
            setBusy(false)
        }
    }

    const handleToggleEnabled = (target: SSHCronItem) => {
        const nextList = items.map((it) =>
            it.id === target.id ? {...it, enabled: !it.enabled} : it
        )
        void handleSaveList(nextList)
    }

    const handleOpenCreate = () => {
        setEditingItem(null)
        setModalOpen(true)
    }

    const handleOpenEdit = (item: SSHCronItem) => {
        setEditingItem(item)
        setModalOpen(true)
    }

    const handleSaveItem = (itemData: Partial<SSHCronItem>) => {
        setModalOpen(false)
        if (editingItem) {
            // 编辑
            const nextList = items.map((it) =>
                it.id === editingItem.id ? ({...it, ...itemData} as SSHCronItem) : it
            )
            void handleSaveList(nextList)
        } else {
            // 新建
            const newItem: SSHCronItem = {
                id: `cron-${Date.now()}`,
                expression: itemData.expression || '*/5 * * * *',
                command: itemData.command || '',
                enabled: true,
                comment: itemData.comment || '',
            }
            void handleSaveList([...items, newItem])
        }
    }

    const handleDelete = (target: SSHCronItem) => {
        setConfirm({
            open: true,
            title: '删除定时任务',
            message: `确定要删除任务 "${target.expression} ${target.command}" 吗？`,
            danger: true,
            onConfirm: () => {
                setConfirm((prev) => ({...prev, open: false}))
                const nextList = items.filter((it) => it.id !== target.id)
                void handleSaveList(nextList)
            },
        })
    }

    const handleRunNow = async (target: SSHCronItem) => {
        setRunCommand(target.command)
        setRunBusy(true)
        setRunOutput('')
        try {
            const out = await API.sshRunCronCommand(sessionId, target.command)
            setRunOutput(out || '（无输出）')
        } catch (e) {
            setRunOutput(`试运行失败: ${errorMessage(e)}`)
        } finally {
            setRunBusy(false)
        }
    }

    if (!active) return null

    return (
        <div className={c.cronPanel}>
            <div className={c.toolbar}>
                <div className={c.leftActions}>
                    <button
                        className={`${g.btn} ${g.xs} ${g.primary}`}
                        onClick={handleOpenCreate}
                    >
                        <Plus size={12}/> 新建任务
                    </button>

                    <div className={c.searchWrap}>
                        <Search size={13}/>
                    <input
                        value={keyword}
                        placeholder="搜索 命令 / 说明 / 表达式..."
                        onChange={(e) => setKeyword(e.target.value)}
                    />
                    {keyword && (
                        <button className={g.iconBtn} onClick={() => setKeyword('')} title="清空搜索">
                            <X size={12}/>
                        </button>
                        )}
                    </div>
                </div>

                <div className={c.toolbarActions}>
                    {lastUpdate && <span className={c.lastUpdate}>更新于 {lastUpdate}</span>}
                    <button
                        className={`${g.btn} ${g.xs}`}
                        onClick={fetchCrons}
                        disabled={busy}
                        title="刷新 Crontab 任务"
                    >
                        <RotateCw size={12}/> {busy ? '刷新中…' : '刷新'}
                    </button>
                </div>
            </div>

            {error && (
                <div className={c.errorState}>
                    <span>{error}</span>
                    <button className={`${g.btn} ${g.xs}`} onClick={fetchCrons}>重试</button>
                </div>
            )}

            <div className={c.tableContent}>
                <div className={c.tableCard}>
                    {filteredItems.length === 0 ? (
                        <div className={c.emptyState}>
                            {busy ? '正在读取 Crontab 任务…' : '暂无匹配的定时任务'}
                        </div>
                    ) : (
                        <table className={c.cronTable}>
                            <thead>
                                <tr>
                                    <th className={c.colStatus}>状态</th>
                                    <th className={c.colExpr}>运行周期</th>
                                    <th className={c.colCmd}>执行命令 / 备注</th>
                                    <th className={c.colActions}>操作</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredItems.map((item) => (
                                    <tr key={item.id} className={!item.enabled ? c.disabledRow : ''}>
                                        <td className={c.colStatus}>
                                            <label className={c.switch} title={item.enabled ? '点击禁用 (加 # 注释)' : '点击启用'}>
                                                <input
                                                    type="checkbox"
                                                    checked={item.enabled}
                                                    onChange={() => handleToggleEnabled(item)}
                                                />
                                                <span className={c.slider}/>
                                            </label>
                                        </td>
                                        <td className={c.colExpr}>
                                            <span className={c.exprCode}>{item.expression}</span>
                                            <span className={c.exprHuman} title={explainCron(item.expression)}>
                                                {explainCron(item.expression)}
                                            </span>
                                        </td>
                                        <td className={c.colCmd}>
                                            <span className={c.cmdText} title={item.command}>{item.command}</span>
                                            {item.comment && (
                                                <span className={c.commentText} title={item.comment}>
                                                    # {item.comment}
                                                </span>
                                            )}
                                        </td>
                                        <td className={c.colActions}>
                                            <div className={c.actionBtnGroup}>
                                                <button
                                                    className={c.actionBtn}
                                                    onClick={() => handleRunNow(item)}
                                                    title="手动运行一次该命令"
                                                >
                                                    试运行
                                                </button>
                                                <button
                                                    className={c.actionBtn}
                                                    onClick={() => handleOpenEdit(item)}
                                                    title="编辑任务"
                                                >
                                                    编辑
                                                </button>
                                                <button
                                                    className={`${c.actionBtn} ${c.danger}`}
                                                    onClick={() => handleDelete(item)}
                                                    title="删除任务"
                                                >
                                                    删除
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>

            {/* 新建/编辑 Modal */}
            <CronModal
                open={modalOpen}
                item={editingItem}
                onSave={handleSaveItem}
                onClose={() => setModalOpen(false)}
            />

            {/* 试运行输出 Modal */}
            {runCommand && (
                <div className={c.modalOverlay} onClick={() => setRunCommand('')}>
                    <div className={c.modalDialog} onClick={(e) => e.stopPropagation()}>
                        <div className={c.modalHeader}>
                            <span>试运行输出: {runCommand}</span>
                            <button className={`${g.btn} ${g.xs}`} onClick={() => setRunCommand('')}>关闭</button>
                        </div>
                        <div className={c.modalBody}>
                            {runBusy ? '正在远端命令行后台试运行该命令…' : runOutput}
                        </div>
                    </div>
                </div>
            )}

            {/* 删除确认 Modal */}
            <ConfirmModal
                state={confirm}
                onCancel={() => setConfirm((prev) => ({...prev, open: false}))}
            />
        </div>
    )
}
