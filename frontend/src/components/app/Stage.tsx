import React from 'react'
import Icon from '../Icon'
import SessionWorkspace from '../SessionWorkspace'
import RedisClient from '../RedisClient'
import MysqlClient from '../MysqlClient'
import MqttClient from '../MqttClient'
import ApiClient from '../ApiClient'
import g from '../../styles/global.module.less'
import a from './Stage.module.less'
import {SessionInfo, RedisSessionInfo, MysqlSessionInfo, MqttSessionInfo} from '../../types'

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
    apiOpen: boolean
    apiActive: boolean
    onPathChange: (sessionId: string, p: string) => void
    onNotify: (msg: string, kind?: 'info' | 'error') => void
    onCloseRedis: (id: string) => void
    onRedisDbChange: (id: string, db: number, dbSize: number) => void
    onCloseMysql: (id: string) => void
    onMysqlChange: (id: string, database: string) => void
    onCloseMqtt: (id: string) => void
    onCloseApi: () => void
    onNewServer: () => void
}

export default function Stage(props: StageProps) {
    const {
        sessions, activeId, nativeDrop, redisSessions, activeRedisId, mysqlSessions, activeMysqlId,
        mqttSessions, activeMqttId, apiOpen, apiActive,
        onPathChange, onNotify, onCloseRedis, onRedisDbChange, onCloseMysql, onMysqlChange,
        onCloseMqtt, onCloseApi, onNewServer,
    } = props

    const empty = sessions.length === 0 && redisSessions.length === 0 && mysqlSessions.length === 0 && mqttSessions.length === 0 && !apiOpen

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

            {apiOpen && (
                <div style={apiActive ? shownPane : hiddenPane}>
                    <ApiClient onClose={onCloseApi}/>
                </div>
            )}

            {empty && (
                <div className={g.emptyStage}>
                    <Icon name="terminal" size={44}/>
                    <h2>多协议开发运维客户端</h2>
                    <p>在左侧添加服务器（SSH、Redis、MySQL 或 MQTT）后双击即可连接：SSH 提供终端与 SFTP 文件管理，Redis / MySQL 支持键值与数据浏览编辑，MQTT 支持主题订阅、消息发布与实时收发。点击左侧「API 调试」可打开内置的 HTTP 接口调试工具。</p>
                    <div className={g.emptyActions}>
                        <button className={`${g.btn} ${g.primary}`} onClick={() => onNewServer()}>新建服务器</button>
                    </div>
                </div>
            )}
        </div>
    )
}
