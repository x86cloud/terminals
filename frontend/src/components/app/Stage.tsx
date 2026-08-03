import React from 'react'
import Icon from '../Icon'
import SessionWorkspace from '../SessionWorkspace'
import RedisClient from '../RedisClient'
import MysqlClient from '../MysqlClient'
import MqttClient from '../MqttClient'
import MongoClient from '../MongoClient'
import SqliteClient from '../SqliteClient'
import ApiClient from '../ApiClient'
import DevTools from '../DevTools'
import g from '../../styles/global.module.less'
import a from './Stage.module.less'
import {SessionInfo, RedisSessionInfo, MysqlSessionInfo, MqttSessionInfo, MongoSessionInfo, SqliteSessionInfo} from '../../types'

const hiddenPane = {display: 'none' as const}
const shownPane = {display: 'flex' as const, flex: 1, minHeight: 0, minWidth: 0}

export interface StageProps {
    sessions: SessionInfo[]
    activeId: string | null
    nativeDrop: boolean
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
    devToolsOpen: boolean
    devToolsActive: boolean
    apiOpen: boolean
    apiActive: boolean
    onPathChange: (sessionId: string, p: string) => void
    onNotify: (msg: string, kind?: 'info' | 'error') => void
    onCloseRedis: (id: string) => void
    onRedisDbChange: (id: string, db: number, dbSize: number) => void
    onCloseMysql: (id: string) => void
    onMysqlChange: (id: string, database: string) => void
    onCloseMqtt: (id: string) => void
    onCloseMongo: (id: string) => void
    onMongoChange: (id: string, database: string) => void
    onCloseSqlite: (id: string) => void
    onCloseDevTools: () => void
    onCloseApi: () => void
    onNewServer: () => void
}

export default function Stage(props: StageProps) {
    const {
        sessions, activeId, nativeDrop, redisSessions, activeRedisId, mysqlSessions, activeMysqlId,
        mqttSessions, activeMqttId,         mongoSessions, activeMongoId, sqliteSessions, activeSqliteId, devToolsOpen, devToolsActive, apiOpen, apiActive,
        onPathChange, onNotify, onCloseRedis, onRedisDbChange, onCloseMysql, onMysqlChange,
        onCloseMqtt, onCloseMongo, onMongoChange, onCloseSqlite, onCloseDevTools, onCloseApi, onNewServer,
    } = props

    const empty = sessions.length === 0 && redisSessions.length === 0 && mysqlSessions.length === 0 && mqttSessions.length === 0 && mongoSessions.length === 0 && sqliteSessions.length === 0 && !devToolsOpen && !apiOpen

    return (
        <div className={a.stage}>
            {sessions.map((s) => (
                <SessionWorkspace
                    key={s.id}
                    session={s}
                    active={s.id === activeId}
                    nativeDrop={nativeDrop}
                    onPathChange={onPathChange}
                    onNotify={onNotify}
                />
            ))}

            {redisSessions.map((s) => (
                <div key={s.id} style={s.id === activeRedisId ? shownPane : hiddenPane}>
                    <RedisClient
                        session={s}
                        onClose={() => onCloseRedis(s.id)}
                        onDbChange={(id, db, dbSize) => onRedisDbChange(id, db, dbSize)}
                    />
                </div>
            ))}

            {mysqlSessions.map((s) => (
                <div key={s.id} style={s.id === activeMysqlId ? shownPane : hiddenPane}>
                    <MysqlClient
                        session={s}
                        onClose={() => onCloseMysql(s.id)}
                        onChange={(id, database) => onMysqlChange(id, database)}
                    />
                </div>
            ))}

            {mqttSessions.map((s) => (
                <div key={s.id} style={s.id === activeMqttId ? shownPane : hiddenPane}>
                    <MqttClient
                        session={s}
                        onClose={() => onCloseMqtt(s.id)}
                    />
                </div>
            ))}

            {mongoSessions.map((s) => (
                <div key={s.id} style={s.id === activeMongoId ? shownPane : hiddenPane}>
                    <MongoClient
                        session={s}
                        onClose={() => onCloseMongo(s.id)}
                        onChange={(id, database) => onMongoChange(id, database)}
                    />
                </div>
            ))}

            {sqliteSessions.map((s) => (
                <div key={s.id} style={s.id === activeSqliteId ? shownPane : hiddenPane}>
                    <SqliteClient
                        session={s}
                        onClose={() => onCloseSqlite(s.id)}
                    />
                </div>
            ))}

            {devToolsOpen && (
                <div style={devToolsActive ? shownPane : hiddenPane}>
                    <DevTools onClose={() => onCloseDevTools()}/>
                </div>
            )}

            {apiOpen && (
                <div style={apiActive ? shownPane : hiddenPane}>
                    <ApiClient onClose={onCloseApi}/>
                </div>
            )}

            {empty && (
                <div className={g.emptyStage}>
                    <Icon name="terminal" size={44}/>
                    <h2>多协议开发运维客户端</h2>
                    <div className={g.emptyActions}>
                        <button className={`${g.btn} ${g.primary}`} onClick={() => onNewServer()}>新建服务器</button>
                    </div>
                </div>
            )}
        </div>
    )
}
