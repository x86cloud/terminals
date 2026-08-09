import React, {useCallback, useEffect, useMemo, useState} from 'react'
import Icon from './Icon'
import {API} from '../api'
import {SSHProcessInfo} from '../types'
import {errorMessage} from '../utils'
import {ConfirmModal, ConfirmState} from './Modal'
import g from '../styles/global.module.less'
import p from './ProcessPanel.module.less'

interface Props {
    sessionId: string
    active: boolean
    onNotify?: (message: string, kind?: 'info' | 'error') => void
}

type SortKey = 'cpu' | 'mem' | 'rss' | 'pid'
type SortDir = 'asc' | 'desc'

const emptyConfirm: ConfirmState = {open: false, title: '', message: ''}

function fmtBytes(bytes: number): string {
    if (!bytes || bytes <= 0) return '0 B'
    const units = ['B', 'KB', 'MB', 'GB', 'TB']
    let val = bytes
    let i = 0
    while (val >= 1024 && i < units.length - 1) {
        val /= 1024
        i++
    }
    return `${val.toFixed(1)} ${units[i]}`
}

export default function ProcessPanel({sessionId, active, onNotify}: Props) {
    const [procs, setProcs] = useState<SSHProcessInfo[]>([])
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')
    const [keyword, setKeyword] = useState('')
    const [lastUpdate, setLastUpdate] = useState<string>('')
    const [sortKey, setSortKey] = useState<SortKey>('cpu')
    const [sortDir, setSortDir] = useState<SortDir>('desc')
    const [confirm, setConfirm] = useState<ConfirmState>(emptyConfirm)

    const fetchProcesses = useCallback(async () => {
        setBusy(true)
        setError('')
        try {
            const list = await API.sshProcessList(sessionId)
            setProcs(list || [])
            setLastUpdate(new Date().toLocaleTimeString())
        } catch (e) {
            const msg = errorMessage(e)
            setError(msg)
            if (onNotify) onNotify(`读取进程列表失败: ${msg}`, 'error')
        } finally {
            setBusy(false)
        }
    }, [sessionId, onNotify])

    useEffect(() => {
        if (active && procs.length === 0 && !busy) {
            void fetchProcesses()
        }
    }, [active, procs.length, busy, fetchProcesses])

    const handleSort = (key: SortKey) => {
        if (sortKey === key) {
            setSortDir((prev) => (prev === 'desc' ? 'asc' : 'desc'))
        } else {
            setSortKey(key)
            setSortDir('desc')
        }
    }

    const filteredAndSorted = useMemo(() => {
        let list = procs
        if (keyword.trim()) {
            const kw = keyword.trim().toLowerCase()
            list = list.filter(
                (pr) =>
                    pr.pid.toString().includes(kw) ||
                    pr.user.toLowerCase().includes(kw) ||
                    pr.command.toLowerCase().includes(kw)
            )
        }

        return [...list].sort((a, b) => {
            let diff = 0
            if (sortKey === 'cpu') diff = a.cpu - b.cpu
            else if (sortKey === 'mem') diff = a.mem - b.mem
            else if (sortKey === 'rss') diff = a.rss - b.rss
            else if (sortKey === 'pid') diff = a.pid - b.pid

            return sortDir === 'desc' ? -diff : diff
        })
    }, [procs, keyword, sortKey, sortDir])

    const handleKill = (proc: SSHProcessInfo) => {
        setConfirm({
            open: true,
            title: '结束进程确认',
            danger: true,
            message: `确认要发送 SIGKILL (kill -9) 结束进程 ${proc.command.split(' ')[0]} (PID: ${proc.pid}) 吗？`,
            onConfirm: async () => {
                setConfirm(emptyConfirm)
                try {
                    await API.sshKillProcess(sessionId, proc.pid)
                    if (onNotify) onNotify(`已成功结束进程 PID ${proc.pid}`)
                    await fetchProcesses()
                } catch (e) {
                    const msg = errorMessage(e)
                    setError(msg)
                    if (onNotify) onNotify(`结束进程失败: ${msg}`, 'error')
                }
            },
        })
    }

    if (!active) return null

    return (
        <div className={p.processPanel}>
            <div className={p.toolbar}>
                <div className={p.searchWrap}>
                    <Icon name="search" size={13}/>
                    <input
                        value={keyword}
                        placeholder="搜索 PID / 用户 / 命令..."
                        onChange={(e) => setKeyword(e.target.value)}
                    />
                    {keyword && (
                        <button className={g.iconBtn} onClick={() => setKeyword('')} title="清空搜索">
                            <Icon name="close" size={12}/>
                        </button>
                    )}
                </div>
                <div className={p.toolbarActions}>
                    {lastUpdate && <span className={p.lastUpdate}>更新于 {lastUpdate}</span>}
                    <button
                        className={`${g.btn} ${g.xs}`}
                        onClick={fetchProcesses}
                        disabled={busy}
                        title="刷新进程列表"
                    >
                        <Icon name="refresh" size={12}/> {busy ? '刷新中…' : '刷新'}
                    </button>
                </div>
            </div>

            {error && (
                <div className={p.errorState}>
                    <span>{error}</span>
                    <button className={`${g.btn} ${g.xs}`} onClick={fetchProcesses}>重试</button>
                </div>
            )}

            <div className={p.tableContent}>
                <div className={p.tableCard}>
                    {filteredAndSorted.length === 0 ? (
                        <div className={p.emptyState}>
                            {busy ? '正在读取远程进程列表…' : '暂无匹配的进程数据'}
                        </div>
                    ) : (
                        <table className={p.procTable}>
                            <thead>
                                <tr>
                                    <th className={`${p.colPid} ${p.sortable}`} onClick={() => handleSort('pid')}>
                                        PID {sortKey === 'pid' ? (sortDir === 'desc' ? '↓' : '↑') : ''}
                                    </th>
                                    <th className={p.colUser}>用户</th>
                                    <th className={`${p.colCpu} ${p.sortable}`} onClick={() => handleSort('cpu')}>
                                        CPU % {sortKey === 'cpu' ? (sortDir === 'desc' ? '↓' : '↑') : ''}
                                    </th>
                                    <th className={`${p.colMem} ${p.sortable}`} onClick={() => handleSort('mem')}>
                                        MEM % {sortKey === 'mem' ? (sortDir === 'desc' ? '↓' : '↑') : ''}
                                    </th>
                                    <th className={`${p.colRss} ${p.sortable}`} onClick={() => handleSort('rss')}>
                                        RSS 内存 {sortKey === 'rss' ? (sortDir === 'desc' ? '↓' : '↑') : ''}
                                    </th>
                                    <th className={p.colCmd}>进程命令</th>
                                    <th className={p.colAction}>操作</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredAndSorted.map((proc) => (
                                    <tr key={proc.pid}>
                                        <td className={p.colPid}><span className={p.pidBadge}>{proc.pid}</span></td>
                                        <td className={p.colUser}><span className={p.userBadge}>{proc.user}</span></td>
                                        <td className={p.colCpu} style={{fontWeight: proc.cpu > 50 ? 600 : 400, color: proc.cpu > 50 ? '#ef4444' : 'inherit'}}>
                                            {proc.cpu.toFixed(1)}%
                                        </td>
                                        <td className={p.colMem}>{proc.mem.toFixed(1)}%</td>
                                        <td className={p.colRss}>{fmtBytes(proc.rss)}</td>
                                        <td className={p.colCmd} title={proc.command}>{proc.command}</td>
                                        <td className={p.colAction}>
                                            <button
                                                className={p.killBtn}
                                                onClick={() => handleKill(proc)}
                                                title={`结束进程 ${proc.command} (PID: ${proc.pid})`}
                                            >
                                                <Icon name="power" size={13}/>
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>

            <ConfirmModal state={confirm} onCancel={() => setConfirm(emptyConfirm)}/>
        </div>
    )
}
