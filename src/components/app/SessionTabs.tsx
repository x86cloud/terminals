import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { BarChart2, Link as LinkIcon } from 'lucide-react'
import ClientIcon from '@/components/ClientIcon'
import TabBar, { TabItem } from '@/components/common/TabBar'
import { ConnType } from '@/types'
import { useSession } from '@/contexts/SessionContext'
import s from './SessionTabs.module.less'

export default function SessionTabs() {
    const { t } = useTranslation('sidebar')
    const { sessions, tools, activeTarget, activateTab, closeSession, closeTool } = useSession()

    const activeKey = useMemo(() => {
        if (!activeTarget) return ''
        if (activeTarget.kind === 'devtools') return 'devtools'
        if (activeTarget.kind === 'api') return 'api'
        return `${activeTarget.kind}:${activeTarget.id}`
    }, [activeTarget])

    const items: TabItem[] = useMemo(() => {
        const list: TabItem[] = []

        sessions.ssh.forEach((s) => {
            const dotStatus =
                s.reconnectState ?? (s.connected ? 'connected' : 'disconnected')
            list.push({
                key: `ssh:${s.id}`,
                label: s.title,
                icon: <ClientIcon kind="ssh" size={14} />,
                dotOn: s.connected,
                dotStatus,
                closable: true,
            })
        })

        sessions.docker.forEach((s) => {
            list.push({
                key: `docker:${s.id}`,
                label: s.title,
                icon: <ClientIcon kind="docker" size={14} />,
                dotOn: s.connected,
                closable: true,
            })
        })

        sessions.k8s.forEach((s) => {
            list.push({
                key: `k8s:${s.id}`,
                label: s.title,
                icon: <ClientIcon kind="k8s" size={14} />,
                dotOn: s.connected,
                closable: true,
            })
        })

        sessions.redis.forEach((s) => {
            list.push({
                key: `redis:${s.id}`,
                label: `${s.title} · DB${s.db}`,
                icon: <ClientIcon kind="redis" size={14} />,
                dotOn: true,
                closable: true,
            })
        })

        sessions.mysql.forEach((s) => {
            list.push({
                key: `mysql:${s.id}`,
                label: s.database ? `${s.title} · ${s.database}` : s.title,
                icon: <ClientIcon kind="mysql" size={14} />,
                dotOn: true,
                closable: true,
            })
        })

        sessions.postgres.forEach((s) => {
            list.push({
                key: `postgres:${s.id}`,
                label: s.database ? `${s.title} · ${s.database}` : s.title,
                icon: <ClientIcon kind="postgres" size={14} />,
                dotOn: true,
                closable: true,
            })
        })

        sessions.mqtt.forEach((s) => {
            list.push({
                key: `mqtt:${s.id}`,
                label: s.title || `${s.host}:${s.port}`,
                icon: <ClientIcon kind="mqtt" size={14} />,
                dotOn: true,
                closable: true,
            })
        })

        sessions.mongo.forEach((s) => {
            list.push({
                key: `mongo:${s.id}`,
                label: s.database ? `${s.title} · ${s.database}` : s.title,
                icon: <ClientIcon kind="mongo" size={14} />,
                dotOn: true,
                closable: true,
            })
        })

        sessions.sqlite.forEach((s) => {
            list.push({
                key: `sqlite:${s.id}`,
                label: s.title,
                icon: <ClientIcon kind="sqlite" size={14} />,
                dotOn: true,
                closable: true,
            })
        })

        if (tools.devtools.open) {
            list.push({
                key: 'devtools',
                label: t('tools.devTools', '开发工具'),
                icon: <BarChart2 size={13} />,
                closable: true,
            })
        }

        if (tools.api.open) {
            list.push({
                key: 'api',
                label: t('tools.apiDebug', 'API 调试'),
                icon: <LinkIcon size={13} />,
                closable: true,
            })
        }

        return list
    }, [sessions, tools, t])

    const handleChange = (key: string) => {
        if (key === 'devtools') {
            activateTab('devtools')
            return
        }
        if (key === 'api') {
            activateTab('api')
            return
        }

        const colonIdx = key.indexOf(':')
        if (colonIdx > 0) {
            const kind = key.slice(0, colonIdx) as ConnType
            const id = key.slice(colonIdx + 1)
            activateTab(kind, id)
        }
    }

    const handleClose = (key: string) => {
        if (key === 'devtools') {
            closeTool('devtools')
            return
        }
        if (key === 'api') {
            closeTool('api')
            return
        }

        const colonIdx = key.indexOf(':')
        if (colonIdx > 0) {
            const kind = key.slice(0, colonIdx) as ConnType
            const id = key.slice(colonIdx + 1)
            void closeSession(kind, id)
        }
    }

    if (items.length === 0) {
        return null
    }

    return (
        <div className={s.headerBar}>
            <TabBar
                items={items}
                activeKey={activeKey}
                onChange={handleChange}
                onClose={handleClose}
                size="middle"
            />
        </div>
    )
}
