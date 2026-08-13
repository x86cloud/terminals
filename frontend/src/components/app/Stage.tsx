import React from 'react'
import { Terminal } from 'lucide-react'
import ErrorBoundary from '../ErrorBoundary'
import SessionWorkspace from '../../pages/ssh/SessionWorkspace'
import RedisClient from '../../pages/redis/RedisClient'
import MysqlClient from '../../pages/mysql/MysqlClient'
import MqttClient from '../../pages/mqtt/MqttClient'
import MongoClient from '../../pages/mongo/MongoClient'
import SqliteClient from '../../pages/sqlite/SqliteClient'
import ApiClient from '../../pages/api/ApiClient'
import AiAgentPanel from '../../pages/agent/AiAgentPanel'
import DevTools from '../DevTools'
import g from '../../styles/global.module.less'
import a from './Stage.module.less'
import { SessionInfo, RedisSessionInfo, MysqlSessionInfo, MqttSessionInfo, MongoSessionInfo, SqliteSessionInfo, AppSettings } from '../../types'

const hiddenPane = { display: 'none' as const }
const shownPane = { display: 'flex' as const, flex: 1, minHeight: 0, minWidth: 0 }

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
    aiAgentOpen: boolean
    aiAgentActive: boolean
    devToolsOpen: boolean
    devToolsActive: boolean
    apiOpen: boolean
    apiActive: boolean
    settings: AppSettings
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
    onCloseAiAgent: () => void
    onCloseDevTools: () => void
    onCloseApi: () => void
    onNewServer: () => void
}

export default function Stage(props: StageProps) {
    const {
        sessions, activeId, nativeDrop, redisSessions, activeRedisId, mysqlSessions, activeMysqlId,
        mqttSessions, activeMqttId, mongoSessions, activeMongoId, sqliteSessions, activeSqliteId, aiAgentOpen, aiAgentActive, devToolsOpen, devToolsActive, apiOpen, apiActive, settings,
        onPathChange, onNotify, onCloseRedis, onRedisDbChange, onCloseMysql, onMysqlChange,
        onCloseMqtt, onCloseMongo, onMongoChange, onCloseSqlite, onCloseAiAgent, onCloseDevTools, onCloseApi, onNewServer,
    } = props

    const empty = sessions.length === 0 && redisSessions.length === 0 && mysqlSessions.length === 0 && mqttSessions.length === 0 && mongoSessions.length === 0 && sqliteSessions.length === 0 && !devToolsOpen && !apiOpen && !aiAgentOpen

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
                    <ErrorBoundary title="Redis 页面渲染异常" onClose={() => onCloseRedis(s.id)}>
                        <RedisClient
                            session={s}
                            onClose={() => onCloseRedis(s.id)}
                            onDbChange={(id, db, dbSize) => onRedisDbChange(id, db, dbSize)}
                        />
                    </ErrorBoundary>
                </div>
            ))}

            {mysqlSessions.map((s) => (
                <div key={s.id} style={s.id === activeMysqlId ? shownPane : hiddenPane}>
                    <ErrorBoundary title="MySQL 页面渲染异常" onClose={() => onCloseMysql(s.id)}>
                        <MysqlClient
                            session={s}
                            onClose={() => onCloseMysql(s.id)}
                            onChange={(id, database) => onMysqlChange(id, database)}
                        />
                    </ErrorBoundary>
                </div>
            ))}

            {mqttSessions.map((s) => (
                <div key={s.id} style={s.id === activeMqttId ? shownPane : hiddenPane}>
                    <ErrorBoundary title="MQTT 页面渲染异常" onClose={() => onCloseMqtt(s.id)}>
                        <MqttClient
                            session={s}
                            onClose={() => onCloseMqtt(s.id)}
                        />
                    </ErrorBoundary>
                </div>
            ))}

            {mongoSessions.map((s) => (
                <div key={s.id} style={s.id === activeMongoId ? shownPane : hiddenPane}>
                    <ErrorBoundary title="MongoDB 页面渲染异常" onClose={() => onCloseMongo(s.id)}>
                        <MongoClient
                            session={s}
                            onClose={() => onCloseMongo(s.id)}
                            onChange={(id, database) => onMongoChange(id, database)}
                        />
                    </ErrorBoundary>
                </div>
            ))}

            {sqliteSessions.map((s) => (
                <div key={s.id} style={s.id === activeSqliteId ? shownPane : hiddenPane}>
                    <ErrorBoundary title="SQLite 页面渲染异常" onClose={() => onCloseSqlite(s.id)}>
                        <SqliteClient
                            session={s}
                            onClose={() => onCloseSqlite(s.id)}
                        />
                    </ErrorBoundary>
                </div>
            ))}

            {aiAgentOpen && (
                <div style={aiAgentActive ? shownPane : hiddenPane}>
                    <ErrorBoundary title="AI 智能体渲染异常" onClose={onCloseAiAgent}>
                        <AiAgentPanel settings={settings} />
                    </ErrorBoundary>
                </div>
            )}

            {devToolsOpen && (
                <div style={devToolsActive ? shownPane : hiddenPane}>
                    <ErrorBoundary title="DevTools 页面渲染异常" onClose={onCloseDevTools}>
                        <DevTools onClose={() => onCloseDevTools()} />
                    </ErrorBoundary>
                </div>
            )}

            {apiOpen && (
                <div style={apiActive ? shownPane : hiddenPane}>
                    <ErrorBoundary title="API 页面渲染异常" onClose={onCloseApi}>
                        <ApiClient onClose={onCloseApi} />
                    </ErrorBoundary>
                </div>
            )}

            {empty && (
                <div className={g.emptyStage}>
                    <Terminal size={44} />
                    <h2>多协议开发运维客户端</h2>
                    <p>
                        xClient 是一款跨平台桌面客户端，集成了 SSH 终端、SFTP、Redis、MySQL、SQLite、
                        MQTT 与 HTTP 接口调试等常用运维工具。
                    </p>
                    <a className={g.emptyLink} href="https://github.com/x86cloud/terminals" target="_blank" rel="noreferrer">
                        GitHub: https://github.com/x86cloud/terminals
                    </a>
                    <div className={g.emptyActions}>
                        <button className={`${g.btn} ${g.primary}`} onClick={() => onNewServer()}>新建服务器</button>
                    </div>
                </div>
            )}
        </div>
    )
}
