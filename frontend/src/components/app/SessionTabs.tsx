import React from 'react'
import Icon from '../Icon'
import ClientIcon from '../ClientIcon'
import g from '../../styles/global.module.less'
import a from './SessionTabs.module.less'
import {SessionInfo, RedisSessionInfo, MysqlSessionInfo, MqttSessionInfo} from '../../types'

export interface SessionTabsProps {
    sessions: SessionInfo[]
    activeId: string | null
    redisSessions: RedisSessionInfo[]
    activeRedisId: string | null
    mysqlSessions: MysqlSessionInfo[]
    activeMysqlId: string | null
    mqttSessions: MqttSessionInfo[]
    activeMqttId: string | null
    apiOpen: boolean
    apiActive: boolean
    onFocusSession: (id: string, kind: 'ssh' | 'redis' | 'mysql' | 'mqtt') => void
    onCloseSession: (id: string) => void
    onCloseRedis: (id: string) => void
    onCloseMysql: (id: string) => void
    onCloseMqtt: (id: string) => void
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
                <Icon name="close" size={13}/>
            </button>
        </div>
    )
}

export default function SessionTabs(props: SessionTabsProps) {
    const {
        sessions, activeId, redisSessions, activeRedisId, mysqlSessions, activeMysqlId,
        mqttSessions, activeMqttId, apiOpen, apiActive,
        onFocusSession, onCloseSession, onCloseRedis, onCloseMysql, onCloseMqtt, onActivateApi, onCloseApi,
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

            {apiOpen && (
                <Tab
                    active={apiActive}
                    onClick={onActivateApi}
                    onClose={onCloseApi}
                    icon={<Icon name="link" size={12}/>}
                    title="API 调试"
                />
            )}

            <span className={g.spacer}/>
        </div>
    )
}
