import React from 'react'
import { X, Bot, BarChart2, Link as LinkIcon } from 'lucide-react'
import ClientIcon from '../ClientIcon'
import g from '../../styles/global.module.less'
import a from './SessionTabs.module.less'
import {SessionInfo, RedisSessionInfo, MysqlSessionInfo, MqttSessionInfo, MongoSessionInfo, SqliteSessionInfo} from '../../types'

export interface SessionTabsProps {
    sessions: SessionInfo[]
    activeId: string | null
    redisSessions: RedisSessionInfo[]
    activeRedisId: string | null
    mysqlSessions: MysqlSessionInfo[]
    activeMysqlId: string | null
    mqttSessions: MqttSessionInfo[]
    activeMqttId: string | null
    mongoSessions: MongoSessionInfo[]
    activeMongoId: string | null
    sqliteSessions: SqliteSessionInfo[]
    activeSqliteId: string | null
    aiAgentOpen: boolean
    aiAgentActive: boolean
    devToolsOpen: boolean
    devToolsActive: boolean
    apiOpen: boolean
    apiActive: boolean
    onFocusSession: (id: string, kind: 'ssh' | 'redis' | 'mysql' | 'mqtt' | 'mongo' | 'sqlite') => void
    onCloseSession: (id: string) => void
    onCloseRedis: (id: string) => void
    onCloseMysql: (id: string) => void
    onCloseMqtt: (id: string) => void
    onCloseMongo: (id: string) => void
    onCloseSqlite: (id: string) => void
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
            <button className={a.tabClose} title="关闭" onClick={(e) => { e.stopPropagation(); onClose && onClose() }}>
                <X size={13}/>
            </button>
        </div>
    )
}

export default function SessionTabs(props: SessionTabsProps) {
    const {
        sessions, activeId, redisSessions, activeRedisId, mysqlSessions, activeMysqlId,
        mqttSessions, activeMqttId,         mongoSessions, activeMongoId, sqliteSessions, activeSqliteId, aiAgentOpen, aiAgentActive, devToolsOpen, devToolsActive, apiOpen, apiActive,
        onFocusSession, onCloseSession, onCloseRedis, onCloseMysql, onCloseMqtt, onCloseMongo, onCloseSqlite, onActivateAiAgent, onCloseAiAgent, onActivateDevTools, onCloseDevTools, onActivateApi, onCloseApi,
    } = props

    return (
        <div className={a.tabbar}>
            {sessions.map((s) => (
                <Tab
                    key={s.id}
                    active={s.id === activeId}
                    onClick={() => onFocusSession(s.id, 'ssh')}
                    onClose={() => onCloseSession(s.id)}
                    icon={<ClientIcon kind="ssh" size={12}/>}
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
                    icon={<ClientIcon kind="redis" size={12}/>}
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
                    icon={<ClientIcon kind="mysql" size={12}/>}
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
                    icon={<ClientIcon kind="mqtt" size={12}/>}
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
                    icon={<ClientIcon kind="mongo" size={12}/>}
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
                    icon={<ClientIcon kind="sqlite" size={12}/>}
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
