import React from 'react'
import { Button, Tooltip } from 'antd'
import { X, Bot, BarChart2, Link as LinkIcon } from 'lucide-react'
import ClientIcon from '@/components/ClientIcon'
import g from '@/styles/global.module.less'
import a from '@/components/app/SessionTabs.module.less'
import {SessionInfo, RedisSessionInfo, MysqlSessionInfo, PostgresSessionInfo, MqttSessionInfo, MongoSessionInfo, SqliteSessionInfo, DockerSessionInfo, K8sSessionInfo, ConnType} from '@/types'

export interface SessionTabsProps {
    sessions: SessionInfo[]
    activeId: string | null
    redisSessions: RedisSessionInfo[]
    activeRedisId: string | null
    mysqlSessions: MysqlSessionInfo[]
    activeMysqlId: string | null
    postgresSessions?: PostgresSessionInfo[]
    activePostgresId?: string | null
    mqttSessions: MqttSessionInfo[]
    activeMqttId: string | null
    mongoSessions: MongoSessionInfo[]
    activeMongoId: string | null
    sqliteSessions: SqliteSessionInfo[]
    activeSqliteId: string | null
    dockerSessions?: DockerSessionInfo[]
    activeDockerId?: string | null
    k8sSessions?: K8sSessionInfo[]
    activeK8sId?: string | null
    aiAgentOpen: boolean
    aiAgentActive: boolean
    devToolsOpen: boolean
    devToolsActive: boolean
    apiOpen: boolean
    apiActive: boolean
    onFocusSession: (id: string, kind: ConnType) => void
    onCloseSession: (id: string) => void
    onCloseRedis: (id: string) => void
    onCloseMysql: (id: string) => void
    onClosePostgres?: (id: string) => void
    onCloseMqtt: (id: string) => void
    onCloseMongo: (id: string) => void
    onCloseSqlite: (id: string) => void
    onCloseDocker?: (id: string) => void
    onCloseK8s?: (id: string) => void
    onActivateAiAgent: () => void
    onCloseAiAgent: () => void
    onActivateDevTools: () => void
    onCloseDevTools: () => void
    onActivateApi: () => void
    onCloseApi: () => void
}

function Tab({
    active,
    onClick,
    onClose,
    icon,
    title,
    dotOn,
}: {
    active: boolean
    onClick: () => void
    onClose?: () => void
    icon: React.ReactNode
    title: React.ReactNode
    dotOn?: boolean
}) {
    return (
        <div className={`${a.tab}${active ? ' ' + a.active : ''}`} onClick={onClick}>
            {icon}
            {dotOn !== undefined && <span className={`${g.dot} ${dotOn ? ' ' + g.on : ''}`}/>}
            <span className={a.tabTitle}>{title}</span>
            {onClose && (
                <Tooltip title="关闭">
                    <Button
                        size="small"
                        type="text"
                        className={a.tabCloseBtn}
                        icon={<X size={11}/>}
                        onClick={(e) => { e.stopPropagation(); onClose() }}
                    />
                </Tooltip>
            )}
        </div>
    )
}

export default function SessionTabs(props: SessionTabsProps) {
    const {
        sessions, activeId, redisSessions, activeRedisId, mysqlSessions, activeMysqlId,
        postgresSessions = [], activePostgresId = null,
        mqttSessions, activeMqttId, mongoSessions, activeMongoId, sqliteSessions, activeSqliteId,
        dockerSessions = [], activeDockerId = null,
        k8sSessions = [], activeK8sId = null,
        aiAgentOpen, aiAgentActive, devToolsOpen, devToolsActive, apiOpen, apiActive,
        onFocusSession, onCloseSession, onCloseRedis, onCloseMysql, onClosePostgres, onCloseMqtt, onCloseMongo, onCloseSqlite, onCloseDocker, onCloseK8s,
        onActivateAiAgent, onCloseAiAgent, onActivateDevTools, onCloseDevTools, onActivateApi, onCloseApi,
    } = props

    return (
        <div className={a.tabbar}>
            {sessions.map((s) => (
                <Tab
                    key={s.id}
                    active={s.id === activeId}
                    onClick={() => onFocusSession(s.id, 'ssh')}
                    onClose={() => onCloseSession(s.id)}
                    icon={<ClientIcon kind="ssh" size={14}/>}
                    dotOn={s.connected}
                    title={s.title}
                />
            ))}
            {dockerSessions.map((s) => (
                <Tab
                    key={s.id}
                    active={s.id === activeDockerId}
                    onClick={() => onFocusSession(s.id, 'docker')}
                    onClose={() => onCloseDocker?.(s.id)}
                    icon={<ClientIcon kind="docker" size={14}/>}
                    dotOn={s.connected}
                    title={s.title}
                />
            ))}
            {k8sSessions.map((s) => (
                <Tab
                    key={s.id}
                    active={s.id === activeK8sId}
                    onClick={() => onFocusSession(s.id, 'k8s')}
                    onClose={() => onCloseK8s?.(s.id)}
                    icon={<ClientIcon kind="k8s" size={14}/>}
                    dotOn={s.connected}
                    title={s.title}
                />
            ))}
            {redisSessions.map((s) => (
                <Tab
                    key={s.id}
                    active={s.id === activeRedisId}
                    onClick={() => onFocusSession(s.id, 'redis')}
                    onClose={() => onCloseRedis(s.id)}
                    icon={<ClientIcon kind="redis" size={14}/>}
                    dotOn={true}
                    title={`${s.title} · DB${s.db}`}
                />
            ))}
            {mysqlSessions.map((s) => (
                <Tab
                    key={s.id}
                    active={s.id === activeMysqlId}
                    onClick={() => onFocusSession(s.id, 'mysql')}
                    onClose={() => onCloseMysql(s.id)}
                    icon={<ClientIcon kind="mysql" size={14}/>}
                    dotOn={true}
                    title={s.database ? `${s.title} · ${s.database}` : s.title}
                />
            ))}
            {postgresSessions.map((s) => (
                <Tab
                    key={s.id}
                    active={s.id === activePostgresId}
                    onClick={() => onFocusSession(s.id, 'postgres')}
                    onClose={() => onClosePostgres?.(s.id)}
                    icon={<ClientIcon kind="postgres" size={14}/>}
                    dotOn={true}
                    title={s.database ? `${s.title} · ${s.database}` : s.title}
                />
            ))}
            {mqttSessions.map((s) => (
                <Tab
                    key={s.id}
                    active={s.id === activeMqttId}
                    onClick={() => onFocusSession(s.id, 'mqtt')}
                    onClose={() => onCloseMqtt(s.id)}
                    icon={<ClientIcon kind="mqtt" size={14}/>}
                    dotOn={true}
                    title={`${s.host}:${s.port}`}
                />
            ))}
            {mongoSessions.map((s) => (
                <Tab
                    key={s.id}
                    active={s.id === activeMongoId}
                    onClick={() => onFocusSession(s.id, 'mongo')}
                    onClose={() => onCloseMongo(s.id)}
                    icon={<ClientIcon kind="mongo" size={14}/>}
                    dotOn={true}
                    title={s.database ? `${s.title} · ${s.database}` : s.title}
                />
            ))}
            {sqliteSessions.map((s) => (
                <Tab
                    key={s.id}
                    active={s.id === activeSqliteId}
                    onClick={() => onFocusSession(s.id, 'sqlite')}
                    onClose={() => onCloseSqlite(s.id)}
                    icon={<ClientIcon kind="sqlite" size={14}/>}
                    dotOn={true}
                    title={s.title}
                />
            ))}

            {aiAgentOpen && (
                <Tab
                    active={aiAgentActive}
                    onClick={onActivateAiAgent}
                    onClose={onCloseAiAgent}
                    icon={<Bot size={12}/>}
                    title="AI 智能体"
                />
            )}

            {devToolsOpen && (
                <Tab
                    active={devToolsActive}
                    onClick={onActivateDevTools}
                    onClose={onCloseDevTools}
                    icon={<BarChart2 size={12}/>}
                    title="开发工具"
                />
            )}

            {apiOpen && (
                <Tab
                    active={apiActive}
                    onClick={onActivateApi}
                    onClose={onCloseApi}
                    icon={<LinkIcon size={12}/>}
                    title="API 调试"
                />
            )}

            <span className={g.spacer}/>
        </div>
    )
}
