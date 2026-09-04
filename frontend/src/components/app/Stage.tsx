import React from 'react'
import { Button } from 'antd'
import AppLogo from '@/components/AppLogo'
import ErrorBoundary from '@/components/ErrorBoundary'
import SessionWorkspace from '@/pages/ssh/SessionWorkspace'
import RedisClient from '@/pages/redis/RedisClient'
import MysqlClient from '@/pages/mysql/MysqlClient'
import PostgresClient from '@/pages/postgres/PostgresClient'
import MqttClient from '@/pages/mqtt/MqttClient'
import MongoClient from '@/pages/mongo/MongoClient'
import SqliteClient from '@/pages/sqlite/SqliteClient'
import DockerClient from '@/pages/docker/DockerClient'
import K8sClient from '@/pages/k8s/K8sClient'
import ApiClient from '@/pages/api/ApiClient'
import AiAgentPanel from '@/pages/agent/AiAgentPanel'
import DevTools from '@/components/DevTools'
import g from '@/styles/global.module.less'
import a from '@/components/app/Stage.module.less'
import { AppSettings } from '@/types'
import { useSession } from '@/contexts/SessionContext'

const hiddenPane = { display: 'none' as const }
const shownPane = {
    display: 'flex' as const,
    flexDirection: 'column' as const,
    flex: 1,
    minHeight: 0,
    minWidth: 0,
    width: '100%',
    height: '100%',
}

export interface StageProps {
    nativeDrop: boolean
    settings: AppSettings
    onPathChange: (sessionId: string, p: string) => void
    onNewServer: () => void
}

export default function Stage({
    nativeDrop,
    settings,
    onPathChange,
    onNewServer,
}: StageProps) {
    const { sessions, tools, activeTarget, closeSession, closeTool, updateSession } = useSession()

    const activeId = activeTarget?.kind === 'ssh' ? activeTarget.id : null
    const activeDockerId = activeTarget?.kind === 'docker' ? activeTarget.id : null
    const activeK8sId = activeTarget?.kind === 'k8s' ? activeTarget.id : null
    const activeRedisId = activeTarget?.kind === 'redis' ? activeTarget.id : null
    const activeMysqlId = activeTarget?.kind === 'mysql' ? activeTarget.id : null
    const activePostgresId = activeTarget?.kind === 'postgres' ? activeTarget.id : null
    const activeMqttId = activeTarget?.kind === 'mqtt' ? activeTarget.id : null
    const activeMongoId = activeTarget?.kind === 'mongo' ? activeTarget.id : null
    const activeSqliteId = activeTarget?.kind === 'sqlite' ? activeTarget.id : null

    const empty =
        sessions.ssh.length === 0 &&
        sessions.docker.length === 0 &&
        sessions.k8s.length === 0 &&
        sessions.redis.length === 0 &&
        sessions.mysql.length === 0 &&
        sessions.postgres.length === 0 &&
        sessions.mqtt.length === 0 &&
        sessions.mongo.length === 0 &&
        sessions.sqlite.length === 0 &&
        !tools.devtools.open &&
        !tools.api.open &&
        !tools.aiAgent.open

    return (
        <div className={a.stage}>
            {sessions.ssh.map((s) => (
                <SessionWorkspace
                    key={s.id}
                    session={s}
                    active={s.id === activeId}
                    nativeDrop={nativeDrop}
                    onPathChange={onPathChange}
                />
            ))}

            {sessions.docker.map((s) => (
                <div key={s.id} style={s.id === activeDockerId ? shownPane : hiddenPane}>
                    <ErrorBoundary title="Docker 页面渲染异常" onClose={() => void closeSession('docker', s.id)}>
                        <DockerClient
                            session={s}
                            onClose={() => void closeSession('docker', s.id)}
                        />
                    </ErrorBoundary>
                </div>
            ))}

            {sessions.k8s.map((s) => (
                <div key={s.id} style={s.id === activeK8sId ? shownPane : hiddenPane}>
                    <ErrorBoundary title="Kubernetes 页面渲染异常" onClose={() => void closeSession('k8s', s.id)}>
                        <K8sClient
                            session={s}
                        />
                    </ErrorBoundary>
                </div>
            ))}

            {sessions.redis.map((s) => (
                <div key={s.id} style={s.id === activeRedisId ? shownPane : hiddenPane}>
                    <ErrorBoundary title="Redis 页面渲染异常" onClose={() => void closeSession('redis', s.id)}>
                        <RedisClient
                            session={s}
                            onClose={() => void closeSession('redis', s.id)}
                            onDbChange={(id, db, dbSize) => updateSession('redis', id, { db, dbSize })}
                        />
                    </ErrorBoundary>
                </div>
            ))}

            {sessions.mysql.map((s) => (
                <div key={s.id} style={s.id === activeMysqlId ? shownPane : hiddenPane}>
                    <ErrorBoundary title="MySQL 页面渲染异常" onClose={() => void closeSession('mysql', s.id)}>
                        <MysqlClient
                            session={s}
                            onClose={() => void closeSession('mysql', s.id)}
                            onChange={(id, database) => updateSession('mysql', id, { database })}
                        />
                    </ErrorBoundary>
                </div>
            ))}

            {sessions.postgres.map((s) => (
                <div key={s.id} style={s.id === activePostgresId ? shownPane : hiddenPane}>
                    <ErrorBoundary title="PostgreSQL 页面渲染异常" onClose={() => void closeSession('postgres', s.id)}>
                        <PostgresClient
                            session={s}
                            onClose={() => void closeSession('postgres', s.id)}
                            onChange={(id, database) => updateSession('postgres', id, { database })}
                        />
                    </ErrorBoundary>
                </div>
            ))}

            {sessions.mqtt.map((s) => (
                <div key={s.id} style={s.id === activeMqttId ? shownPane : hiddenPane}>
                    <ErrorBoundary title="MQTT 页面渲染异常" onClose={() => void closeSession('mqtt', s.id)}>
                        <MqttClient
                            session={s}
                            onClose={() => void closeSession('mqtt', s.id)}
                        />
                    </ErrorBoundary>
                </div>
            ))}

            {sessions.mongo.map((s) => (
                <div key={s.id} style={s.id === activeMongoId ? shownPane : hiddenPane}>
                    <ErrorBoundary title="MongoDB 页面渲染异常" onClose={() => void closeSession('mongo', s.id)}>
                        <MongoClient
                            session={s}
                            onClose={() => void closeSession('mongo', s.id)}
                            onChange={(id, database) => updateSession('mongo', id, { database })}
                        />
                    </ErrorBoundary>
                </div>
            ))}

            {sessions.sqlite.map((s) => (
                <div key={s.id} style={s.id === activeSqliteId ? shownPane : hiddenPane}>
                    <ErrorBoundary title="SQLite 页面渲染异常" onClose={() => void closeSession('sqlite', s.id)}>
                        <SqliteClient
                            session={s}
                            onClose={() => void closeSession('sqlite', s.id)}
                        />
                    </ErrorBoundary>
                </div>
            ))}

            {tools.aiAgent.open && (
                <div style={tools.aiAgent.active ? shownPane : hiddenPane}>
                    <ErrorBoundary title="AI 智能体渲染异常" onClose={() => closeTool('aiAgent')}>
                        <AiAgentPanel settings={settings} />
                    </ErrorBoundary>
                </div>
            )}

            {tools.devtools.open && (
                <div style={tools.devtools.active ? shownPane : hiddenPane}>
                    <ErrorBoundary title="DevTools 页面渲染异常" onClose={() => closeTool('devtools')}>
                        <DevTools onClose={() => closeTool('devtools')} />
                    </ErrorBoundary>
                </div>
            )}

            {tools.api.open && (
                <div style={tools.api.active ? shownPane : hiddenPane}>
                    <ErrorBoundary title="API 页面渲染异常" onClose={() => closeTool('api')}>
                        <ApiClient onClose={() => closeTool('api')} />
                    </ErrorBoundary>
                </div>
            )}

            {empty && (
                <div className={g.emptyStage}>
                    <AppLogo size={54} />
                    <h2>多协议开发运维客户端</h2>
                    <p>
                        xClient 是一款跨平台桌面客户端，集成了 SSH 终端、SFTP、Redis、MySQL、SQLite、
                        MQTT 与 HTTP 接口调试等常用运维工具。
                    </p>
                    <a className={g.emptyLink} href="https://github.com/x86cloud/terminals" target="_blank" rel="noreferrer">
                        GitHub: https://github.com/x86cloud/terminals
                    </a>
                    <div className={g.emptyActions}>
                        <Button type="primary" onClick={() => onNewServer()}>新建服务器</Button>
                    </div>
                </div>
            )}
        </div>
    )
}
